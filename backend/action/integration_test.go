package action

import (
	"context"
	"sync"
	"testing"
	"time"

	"hexaverse/common"
)

// fakeClock is a settable world clock so tests drive resolution by advancing time.
type fakeClock struct {
	mu  sync.Mutex
	now common.WorldMillis
}

func (c *fakeClock) Now() common.WorldMillis {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}
func (c *fakeClock) set(t common.WorldMillis) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = t
}
func (c *fakeClock) FromWall(time.Time) common.WorldMillis { return c.Now() }
func (c *fakeClock) Scale() float64                        { return 1 }

// drainResolver is a stand-in mutating verb (mine lands for real at M10). It
// takes min(request, remaining) from a lode of the given initial size, so the
// ORDER deltas apply changes the outcome — exactly what the ETA-order fairness
// criterion needs to be a real test.
func drainResolver(initial float64) ResolveFunc {
	return func(_ context.Context, r Resolution) (ResolveResult, error) {
		req := toFloat(r.Action.Params["request"])
		folded, err := r.Remaining(r.At)
		if err != nil {
			return ResolveResult{}, err
		}
		remaining := initial - folded
		take := req
		if take > remaining {
			take = remaining
		}
		if take < 0 {
			take = 0
		}
		return ResolveResult{Outcome: "drained", Delta: &Delta{Amount: take}}, nil
	}
}

func toFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case int:
		return float64(n)
	default:
		return 0
	}
}

// newActorDoc creates an empty actor doc (a stand-in fleet) so Commit's slot
// claim and resolve's slot release have something to read/write.
func newActorDoc(t *testing.T, fs common.FirestoreService, id string) {
	t.Helper()
	if err := fs.Set(context.Background(), "fleets", id, map[string]interface{}{"id": id}); err != nil {
		t.Fatalf("seeding actor %s: %v", id, err)
	}
}

func newActionService(t *testing.T) (*Service, common.FirestoreService, *fakeClock, func()) {
	fs, client := common.SetupFirestoreTestDAO(t)
	clk := &fakeClock{}
	svc := NewServiceWith(NewDaoWith(fs, clk), clk, nil) // nil publisher — no SSE fan-out under test
	cleanup := func() {
		common.CleanupFirestoreTestData(t, client, "actions", "fleets",
			"deltas/lode-1/entries", "deltas/lode-2/entries",
			// ledger-scope-A: ledger_test.go's
			// TestLedgerKey_Scenario_OmittedDefaultsToScope commits with an
			// omitted LedgerKey, which defaults to Scope ("ledger-scope-A"),
			// so its delta lands here — a path this helper didn't clean
			// (QA Finding 1: non-repeatable against a persistent/reused
			// emulator, deltas accumulated run over run).
			"deltas/ledger-scope-A/entries")
	}
	return svc, fs, clk, cleanup
}

func activeActionID(t *testing.T, fs common.FirestoreService, actor string) string {
	t.Helper()
	doc, err := fs.Get(context.Background(), "fleets", actor)
	if err != nil {
		t.Fatalf("reading actor: %v", err)
	}
	id, _ := doc.Data()["activeActionId"].(string)
	return id
}

// --- Commit / single-slot / cancel -----------------------------------------

func TestCommit_ClaimsSlotAndRejectsSecond(t *testing.T) {
	svc, fs, _, cleanup := newActionService(t)
	defer cleanup()
	svc.RegisterResolver("drain", KindMutating, drainResolver(100))
	ctx := context.Background()
	newActorDoc(t, fs, "fleetA")

	a, err := svc.Commit(ctx, CommitSpec{
		Type: "drain", Actor: "fleetA", ActorCollection: "fleets", Scope: "lode-1",
		Params: map[string]interface{}{"request": float64(40)}, Eta: 1000,
	})
	if err != nil {
		t.Fatal(err)
	}
	// The slot is claimed transactionally with the action write.
	if got := activeActionID(t, fs, "fleetA"); got != a.Id {
		t.Fatalf("slot = %q, want %q", got, a.Id)
	}
	// A second active action is rejected.
	if _, err := svc.Commit(ctx, CommitSpec{
		Type: "drain", Actor: "fleetA", ActorCollection: "fleets", Scope: "lode-1",
		Params: map[string]interface{}{"request": float64(10)}, Eta: 2000,
	}); err != ErrActiveActionExists {
		t.Fatalf("second commit err = %v, want ErrActiveActionExists", err)
	}

	// Cancel releases the slot.
	if _, err := svc.Cancel(ctx, a.Id, nil); err != nil {
		t.Fatal(err)
	}
	if got := activeActionID(t, fs, "fleetA"); got != "" {
		t.Fatalf("slot after cancel = %q, want empty", got)
	}
	// And a fresh commit now succeeds.
	if _, err := svc.Commit(ctx, CommitSpec{
		Type: "drain", Actor: "fleetA", ActorCollection: "fleets", Scope: "lode-1",
		Params: map[string]interface{}{"request": float64(10)}, Eta: 3000,
	}); err != nil {
		t.Fatalf("commit after cancel failed: %v", err)
	}
}

// --- ETA-ordered fold -------------------------------------------------------

func TestResolveDue_ETAOrderMatchesOnTime(t *testing.T) {
	// Two fleets drain one lode. Resolved in ETA order the ledger must match what
	// resolving each exactly at its eta would produce (#0005 acceptance).
	ctx := context.Background()

	// Case 1: resolve both together, late.
	together := func() (float64, float64) {
		svc, fs, clk, cleanup := newActionService(t)
		defer cleanup()
		svc.RegisterResolver("drain", KindMutating, drainResolver(100))
		newActorDoc(t, fs, "fleetA")
		newActorDoc(t, fs, "fleetB")
		commitDrain(t, svc, "fleetA", "lode-1", 70, 1000)
		commitDrain(t, svc, "fleetB", "lode-1", 50, 2000)
		clk.set(5000) // both due
		if _, err := svc.ResolveDue(ctx, "lode-1"); err != nil {
			t.Fatal(err)
		}
		return foldAt(t, svc, "lode-1", 1000), foldAt(t, svc, "lode-1", 2000)
	}
	// Case 2: resolve each on time.
	onTime := func() (float64, float64) {
		svc, fs, clk, cleanup := newActionService(t)
		defer cleanup()
		svc.RegisterResolver("drain", KindMutating, drainResolver(100))
		newActorDoc(t, fs, "fleetA")
		newActorDoc(t, fs, "fleetB")
		commitDrain(t, svc, "fleetA", "lode-1", 70, 1000)
		commitDrain(t, svc, "fleetB", "lode-1", 50, 2000)
		clk.set(1000)
		if _, err := svc.ResolveDue(ctx, "lode-1"); err != nil {
			t.Fatal(err)
		}
		clk.set(2000)
		if _, err := svc.ResolveDue(ctx, "lode-1"); err != nil {
			t.Fatal(err)
		}
		return foldAt(t, svc, "lode-1", 1000), foldAt(t, svc, "lode-1", 2000)
	}

	lt1, lt2 := together()
	ot1, ot2 := onTime()
	// Fold at eta=1000 sees only fleetA's take (70). Fold at eta=2000 sees both:
	// A took 70, B clamped to the remaining 30 ⇒ 100 total.
	if lt1 != 70 || lt2 != 100 {
		t.Fatalf("together fold = (%v,%v), want (70,100)", lt1, lt2)
	}
	if lt1 != ot1 || lt2 != ot2 {
		t.Fatalf("late fold (%v,%v) != on-time fold (%v,%v)", lt1, lt2, ot1, ot2)
	}
}

// --- exactly-once under concurrency ----------------------------------------

func TestResolveDue_ConcurrentProducesOneDelta(t *testing.T) {
	svc, fs, clk, cleanup := newActionService(t)
	defer cleanup()
	svc.RegisterResolver("drain", KindMutating, drainResolver(100))
	ctx := context.Background()
	newActorDoc(t, fs, "fleetA")
	a := commitDrain(t, svc, "fleetA", "lode-1", 40, 1000)
	clk.set(5000)

	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = svc.ResolveDue(ctx, "lode-1") // races; at most one wins
		}()
	}
	wg.Wait()
	// A final sequential pass guarantees resolution even if the concurrent burst
	// all aborted each other on the emulator (transaction livelock). The invariant
	// under test is exactly-once: no number of resolves — concurrent or serial —
	// creates a second delta (doc id = actionId).
	if _, err := svc.ResolveDue(ctx, "lode-1"); err != nil {
		t.Fatal(err)
	}

	if n := countDeltas(t, fs, "lode-1"); n != 1 {
		t.Fatalf("delta count = %d, want exactly 1", n)
	}
	got, err := svc.Get(ctx, a.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != StatusDone {
		t.Fatalf("action status = %s, want done", got.Status)
	}
	if got := activeActionID(t, fs, "fleetA"); got != "" {
		t.Fatalf("slot not released after resolve: %q", got)
	}
}

// --- remaining fold & no materialized field --------------------------------

func TestFoldDeltas_IsTheOnlyRemainingSource(t *testing.T) {
	svc, fs, clk, cleanup := newActionService(t)
	defer cleanup()
	svc.RegisterResolver("drain", KindMutating, drainResolver(100))
	ctx := context.Background()
	newActorDoc(t, fs, "fleetA")
	commitDrain(t, svc, "fleetA", "lode-1", 25, 1000)
	clk.set(5000)
	if _, err := svc.ResolveDue(ctx, "lode-1"); err != nil {
		t.Fatal(err)
	}

	// remaining(T) = initial − fold(≤T). Before eta: full lode. At/after: drained.
	if fold := foldAt(t, svc, "lode-1", 999); fold != 0 {
		t.Fatalf("fold before eta = %v, want 0", fold)
	}
	if fold := foldAt(t, svc, "lode-1", 1000); fold != 25 {
		t.Fatalf("fold at eta = %v, want 25", fold)
	}
}

// --- inbox ------------------------------------------------------------------

func TestInbox_ListsAndAcknowledges(t *testing.T) {
	svc, fs, clk, cleanup := newActionService(t)
	defer cleanup()
	svc.RegisterResolver("drain", KindMutating, drainResolver(100))
	ctx := context.Background()
	newActorDoc(t, fs, "fleetA")
	a := commitDrain(t, svc, "fleetA", "lode-1", 10, 1000)
	clk.set(5000)
	if _, err := svc.ResolveActive(ctx, "fleetA"); err != nil {
		t.Fatal(err)
	}

	done, err := svc.Inbox(ctx, "fleetA", StatusDone)
	if err != nil {
		t.Fatal(err)
	}
	if len(done) != 1 || done[0].Id != a.Id {
		t.Fatalf("inbox done = %+v, want the one resolved action", done)
	}
	if done[0].AcknowledgedAt != 0 {
		t.Fatalf("not acknowledged yet, got %d", done[0].AcknowledgedAt)
	}
	if _, err := svc.Acknowledge(ctx, a.Id); err != nil {
		t.Fatal(err)
	}
	got, _ := svc.Get(ctx, a.Id)
	if got.AcknowledgedAt == 0 {
		t.Fatal("acknowledge did not stamp acknowledgedAt")
	}
}

// --- sweep ------------------------------------------------------------------

func TestResolveAllDue_SweepResolvesAcrossScopes(t *testing.T) {
	svc, fs, clk, cleanup := newActionService(t)
	defer cleanup()
	svc.RegisterResolver("drain", KindMutating, drainResolver(100))
	ctx := context.Background()
	newActorDoc(t, fs, "fleetA")
	newActorDoc(t, fs, "fleetB")
	commitDrain(t, svc, "fleetA", "lode-1", 10, 1000)
	commitDrain(t, svc, "fleetB", "lode-2", 20, 1500)
	clk.set(5000)

	resolved, err := svc.ResolveAllDue(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(resolved) != 2 {
		t.Fatalf("sweep resolved %d, want 2", len(resolved))
	}
	if countDeltas(t, fs, "lode-1") != 1 || countDeltas(t, fs, "lode-2") != 1 {
		t.Fatal("sweep should have appended one delta per scope")
	}
}

// --- helpers ----------------------------------------------------------------

func commitDrain(t *testing.T, svc *Service, actor, scope string, request float64, eta common.WorldMillis) *Action {
	t.Helper()
	a, err := svc.Commit(context.Background(), CommitSpec{
		Type: "drain", Actor: actor, ActorCollection: "fleets", Scope: scope,
		Params: map[string]interface{}{"request": request}, Eta: eta,
	})
	if err != nil {
		t.Fatalf("commit drain: %v", err)
	}
	return a
}

func foldAt(t *testing.T, svc *Service, scope string, upTo common.WorldMillis) float64 {
	t.Helper()
	v, err := svc.dao.FoldDeltas(context.Background(), scope, upTo)
	if err != nil {
		t.Fatalf("fold: %v", err)
	}
	return v
}

func countDeltas(t *testing.T, fs common.FirestoreService, scope string) int {
	t.Helper()
	docs, err := fs.GetAll(context.Background(), "deltas/"+scope+"/entries")
	if err != nil {
		t.Fatalf("count deltas: %v", err)
	}
	return len(docs)
}

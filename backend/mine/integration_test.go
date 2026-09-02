package mine

import (
	"context"
	"errors"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/space"
	"hexaverse/system"
)

// add-mine-extraction task group 3 (contested-lode and exactly-once
// correctness, against the Firestore emulator), group 4.4 (nested cargo
// merge-patch), group 5 (cancel/acknowledge). Full-slice tests wiring a real
// fleet.Service + action.Service + mine.Service/Resolver together — the
// deepest level this change's own tasks.md calls for. Every test below is
// currently red at its very first Commit call (mine.Service.Commit is a
// stub) — once golang-dev implements Commit, the Resolver, and the
// action-dispatch ledger-key routing (group 0), these exercise the whole
// pipeline end to end.

// mutableClock is a settable common.WorldTime for driving resolution across
// commit/resolve boundaries deterministically.
type mutableClock struct{ now common.WorldMillis }

func (c *mutableClock) Now() common.WorldMillis               { return c.now }
func (c *mutableClock) FromWall(time.Time) common.WorldMillis { return c.now }
func (c *mutableClock) Scale() float64                        { return 1 }
func (c *mutableClock) set(t common.WorldMillis)              { c.now = t }

// fakeIntegrationSystem is a hand-rolled system.ServiceInterface serving
// fixed interiors — mine's own package "no changes to features/{fid}
// documents" (Migration Plan), so a real system-generation pipeline is
// unnecessary; only fleet/action/deltas persistence is under test here.
type fakeIntegrationSystem struct {
	interiors map[string]*system.GeneratedInterior
}

func (f *fakeIntegrationSystem) GetOrCreateInterior(_ context.Context, systemID string) (*system.GeneratedInterior, error) {
	if gi, ok := f.interiors[systemID]; ok {
		return gi, nil
	}
	return &system.GeneratedInterior{}, nil
}
func (f *fakeIntegrationSystem) LaneGates(context.Context, string, int) ([]system.LaneGate, error) {
	return nil, nil
}

// BodyTable satisfies fleet.BodySource (migrate-fleet-to-continuous-burns,
// design.md Decision 16) — required to construct a fleet.Service with this
// fake as its system dependency. None of mine's integration tests order a
// burn or resolve a position through it (every fleet here is seeded
// pre-docked, directly via the DAO, and only mine's own commit/resolve/
// cancel paths are exercised), so a real *system.BodyTable — which mine's
// tests have no way to construct outside package system anyway — is never
// needed. Erroring loudly here, rather than returning an empty table, means
// a future test that DOES need bodies fails with a clear message instead of
// a silent, wrong burn solve.
func (f *fakeIntegrationSystem) BodyTable(context.Context, string) (*system.BodyTable, error) {
	return nil, errors.New("fakeIntegrationSystem: BodyTable not implemented — mine's integration fixtures never resolve a burn")
}

// LaneCrossing satisfies fleet.GraphSource (replace-observation-with-sightings
// tasks.md 6.3), which is now a required positional parameter of
// fleet.NewServiceWith — so this fake serves as mine's local graph as well as
// its local body source, keeping mine's stack one fake rather than two.
// mine has no galaxy service in scope and no test here jumps (every fleet is
// seeded pre-docked via the DAO, and only mine's commit/resolve/cancel paths
// run), so, exactly as BodyTable above, this errors loudly rather than
// returning a zero crossing: a future test that DOES jump fails with a clear
// message instead of silently transiting to system "" over a zero-length lane.
// Passing nil for the graph instead would recreate the graph-less fleet
// service the required parameter exists to make unconstructable.
func (f *fakeIntegrationSystem) LaneCrossing(context.Context, string, string) (string, space.Vec3, space.Vec3, error) {
	return "", space.Vec3{}, space.Vec3{}, errors.New(
		"fakeIntegrationSystem: LaneCrossing not implemented — mine's integration fixtures never jump")
}

// EnsureLaneHorizon satisfies fleet.GraphSource's widened surface
// (replace-observation-with-sightings design.md Decision 28, tasks.md
// 10.2/10.3): mine's integration fixtures never jump, so this is never
// called in practice, but it must exist for fakeIntegrationSystem to keep
// satisfying fleet.GraphSource at all.
func (f *fakeIntegrationSystem) EnsureLaneHorizon(context.Context, string) error {
	return errors.New(
		"fakeIntegrationSystem: EnsureLaneHorizon not implemented — mine's integration fixtures never jump")
}

func beltFeature(id string, kinds ...system.ResourceKind) system.Feature {
	res := make([]system.Resource, len(kinds))
	for i, k := range kinds {
		res[i] = system.Resource{Kind: k, Richness: 0.5}
	}
	return system.Feature{Id: id, Type: system.FeatureBelt, Footprint: []board.Cell{{Ring: 3, Slot: 0}}, Resources: res}
}

// mineTestStack wires a real fleet.Service + action.Service against the
// Firestore emulator with mine's service/resolver registered.
type mineTestStack struct {
	fleetSvc  *fleet.Service
	mineSvc   *Service
	actionSvc *action.Service
	sysFake   *fakeIntegrationSystem
	clk       *mutableClock
	fs        common.FirestoreService
}

func newMineTestStack(t *testing.T, params MineParams, stats map[fleet.ShipClass]fleet.ClassStats) (*mineTestStack, func()) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	clk := &mutableClock{}
	actionSvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	sysFake := &fakeIntegrationSystem{interiors: map[string]*system.GeneratedInterior{}}
	fleetSvc := fleet.NewServiceWith(fleet.NewDaoWithClient(fs), sysFake, sysFake, actionSvc, clk)
	mineSvc := NewServiceWith(fleetSvc, sysFake, actionSvc, clk, params, stats)
	actionSvc.RegisterResolver(mineType, action.KindMutating, Resolver(params, stats, clk))

	stack := &mineTestStack{fleetSvc: fleetSvc, mineSvc: mineSvc, actionSvc: actionSvc, sysFake: sysFake, clk: clk, fs: fs}
	cleanup := func() {
		common.CleanupFirestoreTestData(t, client, "fleets", "actions",
			"deltas/sys-1::feat-belt-0::metals/entries",
			"deltas/sys-1::feat-belt-0::volatiles/entries",
			"deltas/sys-2::feat-belt-0::metals/entries",
			"deltas/sys-1::feat-belt-1::metals/entries",
		)
	}
	return stack, cleanup
}

func (s *mineTestStack) seedFleet(t *testing.T, id, corp, systemID, featureID string, cargo map[string]float64) {
	t.Helper()
	// A docked fleet still carries a real space.ShipState (design.md
	// Decision 4); AttachedTo is the separate relationship mine's DockedTo()
	// check reads (design.md Decision 13). Saved through the real DAO, so
	// EncodeKinematicState (via dao.Save) is what actually crosses the
	// persistence boundary — ParkPoint needs no body-existence cross-check
	// at decode, so the point value itself is immaterial here.
	f := fleet.Fleet{
		Id: id, CorporationId: corp, SystemId: systemID,
		State:      space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
		AttachedTo: featureID,
		Ships:      []fleet.ShipEntry{{Class: fleet.ClassSeed}},
		Cargo:      cargo,
	}
	if err := fleet.NewDaoWithClient(s.fs).Save(context.Background(), f); err != nil {
		t.Fatalf("seed fleet %s: %v", id, err)
	}
}

func (s *mineTestStack) readFleet(t *testing.T, id string) fleet.Fleet {
	t.Helper()
	f, err := fleet.NewDaoWithClient(s.fs).Get(context.Background(), id)
	if err != nil || f == nil {
		t.Fatalf("read fleet %s: %v (nil=%v)", id, err, f == nil)
	}
	return *f
}

func (s *mineTestStack) foldLedger(t *testing.T, ledgerKey string, upTo common.WorldMillis) float64 {
	t.Helper()
	v, err := s.actionSvc.Remaining(context.Background(), ledgerKey, upTo)
	if err != nil {
		t.Fatalf("fold ledger %s: %v", ledgerKey, err)
	}
	return v
}

func (s *mineTestStack) deltaCount(t *testing.T, ledgerKey string) int {
	t.Helper()
	docs, err := s.fs.GetAll(context.Background(), "deltas/"+ledgerKey+"/entries")
	if err != nil {
		t.Fatalf("count deltas for %s: %v", ledgerKey, err)
	}
	return len(docs)
}

var stdStats = map[fleet.ShipClass]fleet.ClassStats{
	fleet.ClassSeed: {MiningRate: 10, HoldCapacity: 1000, LaneRate: 1},
}

// Task 3.1: gates every other integration test below — proves the
// `::`-joined ledger key is a valid Firestore document id and the whole
// commit→resolve→delta→cargo path succeeds at all.
func TestIntegration_Scenario_SingleMineRunEndToEnd(t *testing.T) {
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 1000}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)

	a, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 40})
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	stack.clk.set(a.Eta)
	resolved, err := stack.actionSvc.ResolveDue(ctx, "sys-1")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(resolved) != 1 {
		t.Fatalf("resolved %d actions, want 1", len(resolved))
	}

	ledgerKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	if got := stack.foldLedger(t, ledgerKey, a.Eta); got != -40 {
		t.Errorf("ledger fold = %v, want -40 (the delta must be a valid Firestore doc under the `::`-joined key)", got)
	}
	if got := stack.readFleet(t, "fleet-1").Cargo[string(system.ResourceMetals)]; got != 40 {
		t.Errorf("fleet cargo.metals = %v, want 40", got)
	}
}

// Task 3.2 / mine-extraction "Optimistic Contested Lodes": two runs against
// one feature/kind with different ETAs resolve independently, in ETA order,
// the later clamping against the earlier's already-applied delta.
func TestIntegration_Scenario_ContestedLodeEarlierEtaResolvesFirst(t *testing.T) {
	// startTons = 0.5 richness × 200 = 100.
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 200}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)
	stack.seedFleet(t, "fleet-2", "corp-B", "sys-1", "feat-belt-0", nil)

	// fleet-1 requests 70 (eta = +7 at rate 10) — the LATER eta.
	a1, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 70})
	if err != nil {
		t.Fatalf("commit fleet-1: %v", err)
	}
	// fleet-2 requests 50 (eta = +5) — the EARLIER eta.
	a2, err := stack.mineSvc.Commit(ctx, "corp-B", "fleet-2", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 50})
	if err != nil {
		t.Fatalf("commit fleet-2: %v", err)
	}
	if a2.Eta >= a1.Eta {
		t.Fatalf("fixture broken: fleet-2's eta (%d) must be earlier than fleet-1's (%d)", a2.Eta, a1.Eta)
	}

	stack.clk.set(a1.Eta + 100) // past both
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}

	// The earlier-ETA run (fleet-2, 50) took its full request against the
	// untouched 100-ton lode.
	if got := stack.readFleet(t, "fleet-2").Cargo[string(system.ResourceMetals)]; got != 50 {
		t.Errorf("fleet-2 (earlier eta) cargo.metals = %v, want 50 (full request, unaffected by the later run)", got)
	}
	// The later-ETA run (fleet-1, requested 70) clamps to the 50 remaining.
	if got := stack.readFleet(t, "fleet-1").Cargo[string(system.ResourceMetals)]; got != 50 {
		t.Errorf("fleet-1 (later eta) cargo.metals = %v, want 50 (clamped to what fleet-2 left)", got)
	}
	ledgerKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	if got := stack.foldLedger(t, ledgerKey, a1.Eta+100); got != -100 {
		t.Errorf("ledger fold = %v, want -100 (50 + 50)", got)
	}
}

// Task 4.2's contested-loser case / "Exactly-Once Lode Delta"'s "A zero-take
// resolve appends no delta but still resolves done": a second run's ETA lands
// after an earlier-ETA run against the same ledger key already took the lode
// to EXACTLY zero — the losing action still resolves done with an honest
// lodeDry outcome and its slot released, but appends no delta at all.
func TestIntegration_Scenario_ContestedLoserZeroTakeResolvesDoneNoDelta(t *testing.T) {
	// startTons = 0.5 richness × 100 = 50.
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 100}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)
	stack.seedFleet(t, "fleet-2", "corp-B", "sys-1", "feat-belt-0", nil)

	// fleet-2 requests exactly the lode's full 50 tons at the EARLIER eta (+5).
	a2, err := stack.mineSvc.Commit(ctx, "corp-B", "fleet-2", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 50})
	if err != nil {
		t.Fatalf("commit fleet-2: %v", err)
	}
	// fleet-1 requests 60 at the LATER eta (+6) — the loser, once fleet-2 has
	// already taken the lode to exactly zero.
	a1, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 60})
	if err != nil {
		t.Fatalf("commit fleet-1: %v", err)
	}
	if a1.Eta <= a2.Eta {
		t.Fatalf("fixture broken: want fleet-1's eta (%d) LATER than fleet-2's (%d)", a1.Eta, a2.Eta)
	}

	stack.clk.set(a1.Eta + 1000) // past both — ResolveDue resolves in ETA order
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}

	if got := stack.readFleet(t, "fleet-2").Cargo[string(system.ResourceMetals)]; got != 50 {
		t.Fatalf("fleet-2 (earlier eta, winner) cargo.metals = %v, want 50", got)
	}

	resolved, err := stack.actionSvc.Get(ctx, a1.Id)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Status != action.StatusDone {
		t.Fatalf("losing action status = %s, want done (a zero-take resolve still flips to done)", resolved.Status)
	}
	if resolved.Outcome == "" {
		t.Fatalf("losing action outcome must still be set (honest), got empty")
	}
	if got := stack.readFleet(t, "fleet-1").Cargo[string(system.ResourceMetals)]; got != 0 {
		t.Fatalf("fleet-1 (the loser) cargo.metals = %v, want 0", got)
	}
	if f1 := stack.readFleet(t, "fleet-1"); f1.ActiveActionId != "" {
		t.Fatalf("fleet-1's movement slot after its zero-take resolve = %q, want released", f1.ActiveActionId)
	}

	ledgerKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	// Exactly 1 delta-bearing run (fleet-2's 50) — fleet-1's zero-take resolve
	// must not have added a second (zero-amount) entry.
	if n := stack.deltaCount(t, ledgerKey); n != 1 {
		t.Fatalf("delta count = %d, want exactly 1 (fleet-1's zero-take resolve appends none)", n)
	}
}

// design.md Migration Plan: "A rolled-back deploy leaves a running mine
// action cancellable, not lost" — simulated by resolving through an
// action.Service instance with NO "mine" resolver registered (the prior
// binary), then confirming the generic cancel still releases the slot with
// no delta/cargo credit.
func TestIntegration_Scenario_RolledBackDeployLeavesActionCancellable(t *testing.T) {
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 1000}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)

	a, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 40})
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	stack.clk.set(a.Eta)

	// The "prior binary": a second action.Service over the SAME Firestore data,
	// with no mine resolver registered — resolution must skip it, not error.
	rolledBack := action.NewServiceWith(action.NewDaoWith(stack.fs, stack.clk), stack.clk, nil)
	if _, err := rolledBack.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatalf("resolve with no registered resolver must not error: %v", err)
	}
	got, err := rolledBack.Get(ctx, a.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != action.StatusRunning {
		t.Fatalf("action status = %s, want still running (skipped, not resolved) — the rollback must not lose or corrupt it", got.Status)
	}
	if f := stack.readFleet(t, "fleet-1"); f.ActiveActionId != a.Id {
		t.Fatalf("movement slot = %q, want still claimed by %q (skipped resolution must not release it)", f.ActiveActionId, a.Id)
	}

	// The action is still recoverable: the generic cancel releases the slot
	// with no delta or cargo credit.
	if _, err := rolledBack.Cancel(ctx, a.Id, nil); err != nil {
		t.Fatalf("cancel a skipped-but-running action: %v", err)
	}
	if f := stack.readFleet(t, "fleet-1"); f.ActiveActionId != "" {
		t.Fatalf("movement slot after cancel = %q, want released", f.ActiveActionId)
	}
	ledgerKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	if n := stack.deltaCount(t, ledgerKey); n != 0 {
		t.Fatalf("delta count after cancelling a never-resolved (rolled-back) action = %d, want 0", n)
	}
}

// Task 3.3: concurrent resolve attempts for the same mine action produce
// exactly one delta document and exactly one cargo credit.
func TestIntegration_Scenario_ConcurrentResolveExactlyOnce(t *testing.T) {
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 1000}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)

	a, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 40})
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	stack.clk.set(a.Eta)

	done := make(chan struct{})
	for i := 0; i < 6; i++ {
		go func() {
			_, _ = stack.actionSvc.ResolveDue(ctx, "sys-1")
			done <- struct{}{}
		}()
	}
	for i := 0; i < 6; i++ {
		<-done
	}
	// A final sequential pass guarantees resolution even if the concurrent
	// burst all aborted each other (transaction livelock) — the invariant
	// under test is exactly-once, not first-attempt success.
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}

	ledgerKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	if n := stack.deltaCount(t, ledgerKey); n != 1 {
		t.Fatalf("delta count = %d, want exactly 1", n)
	}
	if got := stack.readFleet(t, "fleet-1").Cargo[string(system.ResourceMetals)]; got != 40 {
		t.Fatalf("fleet cargo.metals = %v, want exactly 40 (credited once)", got)
	}
}

// Task 3.5: two fleets each mine a feature with the SAME feature id in two
// DIFFERENT systems — each run's delta/remaining fold touches only its own
// system-and-kind-qualified ledger key.
func TestIntegration_Scenario_CrossSystemSameFeatureIdIsolation(t *testing.T) {
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 1000}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.sysFake.interiors["sys-2"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)
	stack.seedFleet(t, "fleet-2", "corp-B", "sys-2", "feat-belt-0", nil)

	a1, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 30})
	if err != nil {
		t.Fatalf("commit fleet-1 (sys-1): %v", err)
	}
	a2, err := stack.mineSvc.Commit(ctx, "corp-B", "fleet-2", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 30})
	if err != nil {
		t.Fatalf("commit fleet-2 (sys-2): %v", err)
	}
	stack.clk.set(a1.Eta + a2.Eta + 1000)
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-2"); err != nil {
		t.Fatal(err)
	}

	k1 := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	k2 := LedgerKey("sys-2", "feat-belt-0", system.ResourceMetals)
	if got := stack.foldLedger(t, k1, stack.clk.now); got != -30 {
		t.Errorf("sys-1's ledger fold = %v, want -30 (only its own run)", got)
	}
	if got := stack.foldLedger(t, k2, stack.clk.now); got != -30 {
		t.Errorf("sys-2's ledger fold = %v, want -30 (only its own run) — must not be doubled or combined with sys-1's", got)
	}
}

// Task 3.6: two mine runs target the same feature but different resource
// kinds — each kind's ledger key folds/depletes independently; depleting one
// does not block or clamp the other.
func TestIntegration_Scenario_TwoKindsOneFeatureDepleteIndependently(t *testing.T) {
	// startTons = 0.5 richness × 20 = 10 per kind — small enough that fully
	// draining metals is cheap, to also prove it doesn't block volatiles.
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 20}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{
		beltFeature("feat-belt-0", system.ResourceMetals, system.ResourceVolatiles),
	}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)
	stack.seedFleet(t, "fleet-2", "corp-B", "sys-1", "feat-belt-0", nil)

	a1, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 10})
	if err != nil {
		t.Fatalf("commit metals run (fully depletes the 10-ton lode): %v", err)
	}
	stack.clk.set(a1.Eta)
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}

	// metals is now fully depleted — a follow-up metals commit must be
	// rejected, but volatiles (independent ledger key) must still commit.
	if _, err := stack.mineSvc.Commit(ctx, "corp-B", "fleet-2", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 1}); err == nil {
		t.Errorf("a second metals commit against the fully-depleted lode succeeded, want ErrLodeDepleted")
	}
	a2, err := stack.mineSvc.Commit(ctx, "corp-B", "fleet-2", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceVolatiles, Tons: 10})
	if err != nil {
		t.Fatalf("volatiles commit must succeed independently of metals' depletion: %v", err)
	}
	stack.clk.set(a2.Eta)
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}

	metalsKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	volatilesKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceVolatiles)
	if got := stack.foldLedger(t, metalsKey, stack.clk.now); got != -10 {
		t.Errorf("metals ledger fold = %v, want -10 (unaffected by the volatiles run)", got)
	}
	if got := stack.foldLedger(t, volatilesKey, stack.clk.now); got != -10 {
		t.Errorf("volatiles ledger fold = %v, want -10", got)
	}
}

// Task 4.4: mining kind B (volatiles) on a fleet that already holds cargo of
// kind A (metals) leaves kind A's tonnage untouched — the resolver's nested
// cargo map patch, exercised against REAL Firestore MergeAll semantics.
func TestIntegration_Scenario_NestedCargoMergeLeavesOtherKindsIntact(t *testing.T) {
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 1000}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{
		beltFeature("feat-belt-0", system.ResourceMetals, system.ResourceVolatiles),
	}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", map[string]float64{string(system.ResourceMetals): 20})

	a, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceVolatiles, Tons: 15})
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	stack.clk.set(a.Eta)
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}

	f := stack.readFleet(t, "fleet-1")
	if got := f.Cargo[string(system.ResourceMetals)]; got != 20 {
		t.Errorf("pre-existing metals cargo = %v, want unchanged 20 (nested merge must not clobber sibling kinds)", got)
	}
	if got := f.Cargo[string(system.ResourceVolatiles)]; got != 15 {
		t.Errorf("volatiles cargo = %v, want 15", got)
	}
}

// Task 5.1: a running mine action cancels via the generic
// POST-equivalent action.Service.Cancel with no delta and no cargo credit,
// releasing the movement slot (thin passthrough — action's own cancel
// mechanics are already covered in backend/action; this pins mine rides
// them unchanged).
func TestIntegration_Scenario_GenericCancelReleasesNoDeltaNoCargo(t *testing.T) {
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 1000}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)

	a, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 40})
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	if _, err := stack.actionSvc.Cancel(ctx, a.Id, nil); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	f := stack.readFleet(t, "fleet-1")
	if f.ActiveActionId != "" {
		t.Errorf("movement slot after cancel = %q, want released", f.ActiveActionId)
	}
	// design.md Decision 20: cancelling a co-resident (non-movement) verb's
	// slot must never force the fleet off its dock — AttachedTo is the
	// relationship that answers "still docked", not the kinematic State.
	if host, docked := f.DockedTo(); !docked || host != "feat-belt-0" {
		t.Errorf("AttachedTo after the GENERIC cancel = %q (docked=%v), want unchanged docked to feat-belt-0 (no actor-state patch)", host, docked)
	}
	ledgerKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	if n := stack.deltaCount(t, ledgerKey); n != 0 {
		t.Errorf("delta count after cancel = %d, want 0", n)
	}
	if got := f.Cargo[string(system.ResourceMetals)]; got != 0 {
		t.Errorf("cargo.metals after cancel = %v, want 0", got)
	}
}

// Task 5.4 / fleet-movement "Cancel Halts in Place" MODIFIED scenario
// "Cancelling via the fleet endpoint while mining leaves the fleet docked":
// the FULL SLICE version — a real committed mine run, cancelled through the
// owning fleet's OWN cancel endpoint (fleet.Service.Cancel), not the generic
// action endpoint. See fleet/cancel_dock_test.go for the isolated
// (mine-independent) regression guard on the same gap.
func TestIntegration_Scenario_FleetEndpointCancelWhileMiningLeavesDocked(t *testing.T) {
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 1000}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)}}
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", "feat-belt-0", nil)

	a, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 40})
	if err != nil {
		t.Fatalf("commit: %v", err)
	}

	f, err := stack.fleetSvc.Cancel(ctx, "fleet-1")
	if err != nil {
		t.Fatalf("fleet.Service.Cancel: %v", err)
	}
	// design.md Decision 20: the fleet-endpoint cancel path (fleet.Service.
	// Cancel) must not undock a fleet whose released slot was held by a
	// non-movement verb (mine) — AttachedTo is what "still docked" means now.
	if host, docked := f.DockedTo(); !docked || host != "feat-belt-0" {
		t.Fatalf("AttachedTo after cancelling via the fleet endpoint while mining = %q (docked=%v), want unchanged docked to feat-belt-0", host, docked)
	}
	if f.ActiveActionId != "" {
		t.Fatalf("movement slot after fleet-endpoint cancel = %q, want released", f.ActiveActionId)
	}
	ledgerKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	if n := stack.deltaCount(t, ledgerKey); n != 0 {
		t.Fatalf("delta count after fleet-endpoint cancel = %d, want 0", n)
	}
	_ = a
}

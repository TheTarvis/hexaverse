package action

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md
// section 3 ("`action-dispatch` — the transaction-scoped `ActorState`
// producer") — action-dispatch "Actions Commit With an Atomically Claimed
// Slot" (MODIFIED):
//
//   - "A transaction-scoped ActorState producer computes its merge from the
//     transactional read, not a stale snapshot"
//   - "A slot-claiming commit and an unserialized instant mutation on the
//     same actor never lose an update"
//   - "A transaction-scoped producer's error aborts the commit entirely"
//
// CONTRACT THIS FILE PINS (no such surface exists yet — this is genuinely
// new API, so this file does not compile until a developer adds it; that
// non-compilation IS the red signal for a wholly new capability, the one
// case the scenario-test-automation skill's "not a compile error" rule
// cannot apply to, since there is no runtime to fail against a symbol that
// does not exist):
//
//	type CommitSpec struct {
//	    ...
//	    // ActorStateFunc, when non-nil, is invoked INSIDE Commit's own
//	    // transaction, after the actor document has already been read for
//	    // the slot check, with that same transactional read's field map. It
//	    // returns the fields to merge onto the actor doc, or a named error
//	    // that aborts the commit entirely (no action created, no slot
//	    // claimed, no actor-state mutation persisted). When supplied, it is
//	    // used IN PLACE OF the static ActorState map (design.md: "the
//	    // producer's output" replaces "a static ActorState map, computed
//	    // before the transaction opens").
//	    ActorStateFunc func(actorData map[string]interface{}) (map[string]interface{}, error)
//	}
//
// This exact field name/signature is an SDET authoring choice (design.md
// names the CAPABILITY precisely — "a function invoked inside that same
// transaction ... that computes the fields to merge onto the actor document
// from that transactional read" — but does not pin a Go identifier). A
// developer who needs a different name/shape to fit the DAO's internal
// transaction plumbing may dispute this test; the orchestrator adjudicates
// against design.md's prose, not against this identifier specifically. What
// must NOT change under a rename: the producer receives the actor's
// TRANSACTIONAL field data (not a value the verb service captured before
// Commit was ever called), can veto the commit outright, and its output
// wins over any static ActorState map when both are somehow supplied.
//
// WHY THIS LEVEL: task 3.1's three scenarios are all about a Firestore
// TRANSACTION's isolation semantics (a stale pre-transaction read vs. a live
// transactional one; two truly concurrent transactions against the same
// actor doc). That is only provable against the REAL emulator, never a
// mock — see backend/CLAUDE.md's testing section and dao_test.go's own
// emulator-backed Commit tests, which this file sits beside.

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
)

// errProducerRejected is the named sentinel a transaction-scoped producer
// returns to veto a commit — standing in for fleet-movement's real
// "insufficient fuel" rejection (add-fuel-as-cargo task 3.2), which this
// package must never import (action never imports a verb package).
var errProducerRejected = errors.New("action: transaction-scoped producer rejected the commit")

// readCounter reads the "counter" field off an actor doc as an int64,
// defaulting to 0 for an absent field — the synthetic numeric actor field
// every scenario below debits/credits, standing in for fleet-movement's real
// `cargo.fuel`.
func readCounter(data map[string]interface{}) int64 {
	switch v := data["counter"].(type) {
	case int64:
		return v
	case float64:
		return int64(v)
	default:
		return 0
	}
}

// applyInstantMutationOutsideAction performs a bare, slot-less Firestore
// transaction against the actor doc — standing in for fuel-purchase's real
// refuel settlement (a DIFFERENT domain's own transaction, composed the way
// market.Service.settle composes fleet's/corporations' transaction-scoped
// primitives), which claims no action-dispatch slot and never calls
// action.Commit at all. This is what task 3.1's "unserialized instant
// mutation" scenario is actually about: a mutator that lives entirely
// OUTSIDE this package, racing a commit that goes through it.
func applyInstantMutationOutsideAction(t *testing.T, fs common.FirestoreService, actorID string, delta int64) {
	t.Helper()
	base, ok := fs.(*common.FirestoreBaseService)
	if !ok {
		t.Fatalf("applyInstantMutationOutsideAction requires *common.FirestoreBaseService, got %T", fs)
	}
	ref := base.Client.Collection("fleets").Doc(actorID)
	err := base.Client.RunTransaction(context.Background(), func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil {
			return err
		}
		next := readCounter(snap.Data()) + delta
		return tx.Update(ref, []firestore.Update{{Path: "counter", Value: next}})
	})
	if err != nil {
		t.Fatalf("applyInstantMutationOutsideAction: %v", err)
	}
}

// TestCommit_Scenario_ProducerComputesFromTransactionalReadNotStaleSnapshot
// pins: a verb service's own pre-transaction read of the actor is already
// stale by the time Commit's transaction opens (something else wrote the
// actor doc in between) — the producer's merge MUST reflect the live
// transactional value, never the value the caller captured earlier.
func TestCommit_Scenario_ProducerComputesFromTransactionalReadNotStaleSnapshot(t *testing.T) {
	svc, fs, cleanup := newProducerTestService(t)
	defer cleanup()
	ctx := context.Background()

	newActorDoc(t, fs, "fleet-stale-read")
	// Seed counter = 10, exactly as a verb service's pre-transaction read
	// would observe it.
	mustSetCounter(t, fs, "fleet-stale-read", 10)

	// Simulate a concurrent write landing BETWEEN the verb service's own
	// pre-transaction read and the moment Commit's transaction opens: the
	// stored value moves to 20 before Commit is ever called.
	mustSetCounter(t, fs, "fleet-stale-read", 20)

	svc.RegisterResolver("noop-commit-type", KindKinematic, func(context.Context, Resolution) (ResolveResult, error) {
		return ResolveResult{}, nil
	})
	_, err := svc.Commit(ctx, CommitSpec{
		Type: "noop-commit-type", Actor: "fleet-stale-read", ActorCollection: "fleets", Scope: "sys-1", Eta: 1000,
		ActorStateFunc: func(actorData map[string]interface{}) (map[string]interface{}, error) {
			// The producer must see 20 (the transactional read), not the 10 a
			// verb service might have captured before Commit was called — this
			// closure deliberately captures NOTHING from outside; its only
			// input is the argument Commit hands it.
			return map[string]interface{}{"counter": readCounter(actorData) + 1}, nil
		},
	})
	if err != nil {
		t.Fatalf("Commit: %v", err)
	}

	got := currentCounter(t, fs, "fleet-stale-read")
	if got != 21 {
		t.Errorf("action-dispatch \"A transaction-scoped ActorState producer computes its merge from the "+
			"transactional read, not a stale snapshot\": counter = %d, want 21 (20 from the live transactional "+
			"read + 1) — a producer computing from a stale pre-transaction snapshot would have produced 11", got)
	}
}

// TestCommit_Scenario_SlotClaimingCommitAndUnserializedInstantMutationNeverLoseAnUpdate
// pins the actual bug design.md's own panel review found: a burn's fuel
// debit (via Commit's producer, claiming the movement slot) and a
// concurrent refuel's fuel credit (an entirely separate, slot-less
// transaction — see applyInstantMutationOutsideAction) must BOTH land, with
// neither one's absolute post-mutation value silently overwriting the
// other's.
func TestCommit_Scenario_SlotClaimingCommitAndUnserializedInstantMutationNeverLoseAnUpdate(t *testing.T) {
	svc, fs, cleanup := newProducerTestService(t)
	defer cleanup()
	ctx := context.Background()

	newActorDoc(t, fs, "fleet-race")
	mustSetCounter(t, fs, "fleet-race", 100)

	svc.RegisterResolver("debit-commit-type", KindKinematic, func(context.Context, Resolution) (ResolveResult, error) {
		return ResolveResult{}, nil
	})

	var wg sync.WaitGroup
	wg.Add(2)
	errs := make(chan error, 1)

	go func() {
		defer wg.Done()
		_, err := svc.Commit(ctx, CommitSpec{
			Type: "debit-commit-type", Actor: "fleet-race", ActorCollection: "fleets", Scope: "sys-1", Eta: 5000,
			ActorStateFunc: func(actorData map[string]interface{}) (map[string]interface{}, error) {
				return map[string]interface{}{"counter": readCounter(actorData) - 30}, nil
			},
		})
		if err != nil {
			select {
			case errs <- fmt.Errorf("commit: %w", err):
			default:
			}
		}
	}()
	go func() {
		defer wg.Done()
		applyInstantMutationOutsideAction(t, fs, "fleet-race", +7)
	}()
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("unexpected error from the concurrent pair: %v", err)
	}

	got := currentCounter(t, fs, "fleet-race")
	if got != 100-30+7 {
		t.Errorf("action-dispatch \"A slot-claiming commit and an unserialized instant mutation on the same actor "+
			"never lose an update\": counter = %d, want %d (100 initial, -30 from the slot-claiming commit's "+
			"producer, +7 from the unserialized instant mutation) — a lost update (either effect silently "+
			"overwritten by the other's stale pre-transaction computation) would leave counter at 70 or 107 "+
			"instead", got, 100-30+7)
	}
}

// TestCommit_Scenario_ProducersErrorAbortsTheCommitEntirely pins: when the
// producer rejects (the transactional read shows the mutation it was about
// to compute is no longer valid), NOTHING is persisted — no action doc, no
// slot claim, no actor-state mutation. This is the failure path a static
// ActorState map has no way to express at all (it can only ever compute
// fields, never veto).
func TestCommit_Scenario_ProducersErrorAbortsTheCommitEntirely(t *testing.T) {
	svc, fs, cleanup := newProducerTestService(t)
	defer cleanup()
	ctx := context.Background()

	newActorDoc(t, fs, "fleet-veto")
	mustSetCounter(t, fs, "fleet-veto", 5)

	svc.RegisterResolver("veto-commit-type", KindKinematic, func(context.Context, Resolution) (ResolveResult, error) {
		return ResolveResult{}, nil
	})

	_, err := svc.Commit(ctx, CommitSpec{
		Type: "veto-commit-type", Actor: "fleet-veto", ActorCollection: "fleets", Scope: "sys-1", Eta: 9000,
		ActorStateFunc: func(actorData map[string]interface{}) (map[string]interface{}, error) {
			// The transactional read shows only 5 — never enough for the debit
			// this producer is about to compute — so it vetoes rather than
			// returning a fields map.
			if readCounter(actorData) < 1000 {
				return nil, errProducerRejected
			}
			return map[string]interface{}{"counter": readCounter(actorData) - 1000}, nil
		},
	})
	if !errors.Is(err, errProducerRejected) {
		t.Fatalf("Commit error = %v, want errProducerRejected", err)
	}

	// No actor-state mutation: counter is untouched.
	if got := currentCounter(t, fs, "fleet-veto"); got != 5 {
		t.Errorf("action-dispatch \"A transaction-scoped producer's error aborts the commit entirely\": counter = "+
			"%d, want 5 (unchanged) — the aborted commit must persist no actor-state mutation", got)
	}
	// No slot claimed: activeActionId (the default movement slot) is still empty.
	if id := activeActionID(t, fs, "fleet-veto"); id != "" {
		t.Errorf("action-dispatch \"A transaction-scoped producer's error aborts the commit entirely\": "+
			"activeActionId = %q, want empty — the aborted commit must claim no slot", id)
	}
	// No action created: nothing running for this actor.
	running, err := svc.Inbox(ctx, "fleet-veto", StatusRunning)
	if err != nil {
		t.Fatalf("Inbox: %v", err)
	}
	if len(running) != 0 {
		t.Errorf("action-dispatch \"A transaction-scoped producer's error aborts the commit entirely\": %d running "+
			"action(s) exist for the actor, want 0 — the aborted commit must create no action", len(running))
	}
}

// --- shared setup ------------------------------------------------------

func newProducerTestService(t *testing.T) (*Service, common.FirestoreService, func()) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	clk := &fakeClock{} // integration_test.go's settable clock; not advanced by this file
	svc := NewServiceWith(NewDaoWith(fs, clk), clk, nil)
	cleanup := func() {
		common.CleanupFirestoreTestData(t, client, "actions", "fleets")
	}
	return svc, fs, cleanup
}

func mustSetCounter(t *testing.T, fs common.FirestoreService, actorID string, v int64) {
	t.Helper()
	if err := fs.Update(context.Background(), "fleets", actorID, []firestore.Update{
		{Path: "counter", Value: v},
	}); err != nil {
		t.Fatalf("setting counter on %s: %v", actorID, err)
	}
}

func currentCounter(t *testing.T, fs common.FirestoreService, actorID string) int64 {
	t.Helper()
	doc, err := fs.Get(context.Background(), "fleets", actorID)
	if err != nil {
		t.Fatalf("reading actor %s: %v", actorID, err)
	}
	return readCounter(doc.Data())
}

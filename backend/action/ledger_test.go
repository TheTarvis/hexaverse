package action

import (
	"context"
	"testing"

	"hexaverse/common"
)

// Group 0 (add-mine-extraction task 0.4 / action-dispatch spec delta): the
// ledger key decoupled from channel Scope, and the public commit-time fold.
// These exercise the action package's OWN surface directly — mine's package
// exercises the consumer side once it exists.

// commitDrainKeyed is commitDrain (channel_test.go) plus an explicit LedgerKey,
// so these tests can pin a ledger distinct from Scope.
func commitDrainKeyed(t *testing.T, svc *Service, actor, scope, ledgerKey string, request float64, eta common.WorldMillis) *Action {
	t.Helper()
	a, err := svc.Commit(context.Background(), CommitSpec{
		Type: "drain", Actor: actor, ActorCollection: "fleets", Scope: scope, LedgerKey: ledgerKey,
		Params: map[string]interface{}{"request": request}, Eta: eta,
	})
	if err != nil {
		t.Fatalf("commit drain: %v", err)
	}
	return a
}

// Scenario: An omitted ledger key defaults to the scope (action-dispatch spec,
// "Ledger Key Decoupled From Channel Scope").
func TestLedgerKey_Scenario_OmittedDefaultsToScope(t *testing.T) {
	svc, fs, clk, cleanup := newActionService(t)
	defer cleanup()
	svc.RegisterResolver("drain", KindMutating, drainResolver(100))
	ctx := context.Background()
	newActorDoc(t, fs, "fleetA")

	a := commitDrainKeyed(t, svc, "fleetA", "ledger-scope-A", "", 40, 1000)
	clk.set(5000)
	if _, err := svc.ResolveDue(ctx, "ledger-scope-A"); err != nil {
		t.Fatal(err)
	}
	_ = a

	// The public fold, keyed on the (omitted ⇒ Scope) ledger key, must see the
	// applied delta — unchanged prior behavior per the scenario's THEN.
	got, err := svc.Remaining(ctx, "ledger-scope-A", 5000)
	if err != nil {
		t.Fatalf("Remaining(scope) errored: %v (want the same total the resolver folded)", err)
	}
	if got != 40 {
		t.Fatalf("Remaining(scope) = %v, want 40 (an omitted ledger key must default to scope, unchanged)", got)
	}
}

// Scenario: A verb folds its own ledger key, not its channel scope
// (action-dispatch spec, "Ledger Key Decoupled From Channel Scope").
func TestLedgerKey_Scenario_NamedKeyIndependentOfScope(t *testing.T) {
	svc, fs, clk, cleanup := newActionServiceWithLedgers(t, "sys-1::feat-x::metals")
	defer cleanup()
	svc.RegisterResolver("drain", KindMutating, drainResolver(100))
	ctx := context.Background()
	newActorDoc(t, fs, "fleetA")

	commitDrainKeyed(t, svc, "fleetA", "sys-1", "sys-1::feat-x::metals", 25, 1000)
	clk.set(5000)

	// Read-triggered resolution keys on Scope ("sys-1") — the channel/board
	// alignment Decision #12 requires MUST still resolve the action.
	if _, err := svc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}

	// The delta must be foldable at the NAMED ledger key...
	atKey, err := svc.dao.FoldDeltas(ctx, "sys-1::feat-x::metals", 5000)
	if err != nil {
		t.Fatal(err)
	}
	if atKey != 25 {
		t.Fatalf("fold at the named ledger key = %v, want 25 (the resolver's delta must land under LedgerKey, not Scope)", atKey)
	}
	// ...and must NOT have landed under the (coarser) channel scope.
	atScope, err := svc.dao.FoldDeltas(ctx, "sys-1", 5000)
	if err != nil {
		t.Fatal(err)
	}
	if atScope != 0 {
		t.Fatalf("fold at the channel scope = %v, want 0 (a named ledger key must not fold/append under Scope)", atScope)
	}
}

// Scenario: A commit-time fold matches the resolver's remaining
// (action-dispatch spec, "Public Commit-Time Ledger Fold").
func TestLedgerKey_Scenario_PublicFoldMatchesResolverRemaining(t *testing.T) {
	svc, fs, clk, cleanup := newActionServiceWithLedgers(t, "ledger-B")
	defer cleanup()
	svc.RegisterResolver("drain", KindMutating, drainResolver(100))
	ctx := context.Background()
	newActorDoc(t, fs, "fleetA")

	commitDrainKeyed(t, svc, "fleetA", "sys-9", "ledger-B", 15, 1000)
	clk.set(5000)
	if _, err := svc.ResolveDue(ctx, "sys-9"); err != nil {
		t.Fatal(err)
	}

	viaDao, err := svc.dao.FoldDeltas(ctx, "ledger-B", 5000)
	if err != nil {
		t.Fatal(err)
	}
	viaPublic, err := svc.Remaining(ctx, "ledger-B", 5000)
	if err != nil {
		t.Fatalf("Service.Remaining errored: %v", err)
	}
	if viaPublic != viaDao {
		t.Fatalf("Service.Remaining = %v, want the same total the resolver's fold computes (%v)", viaPublic, viaDao)
	}
}

// newActionServiceWithLedgers is newActionService plus cleanup of the given
// ledger-keyed delta subcollections (which live outside the "lode-1"/"lode-2"
// paths the base helper already cleans).
func newActionServiceWithLedgers(t *testing.T, ledgerKeys ...string) (*Service, common.FirestoreService, *fakeClock, func()) {
	fs, client := common.SetupFirestoreTestDAO(t)
	clk := &fakeClock{}
	svc := NewServiceWith(NewDaoWith(fs, clk), clk, nil)
	cleanup := func() {
		cols := []string{"actions", "fleets"}
		for _, k := range ledgerKeys {
			cols = append(cols, "deltas/"+k+"/entries")
		}
		common.CleanupFirestoreTestData(t, client, cols...)
	}
	return svc, fs, clk, cleanup
}

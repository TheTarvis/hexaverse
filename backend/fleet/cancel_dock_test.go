package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/space"
)

// add-mine-extraction, fleet-movement spec delta: originally "Cancel Halts in
// Place" (MODIFIED); migrate-fleet-to-continuous-burns REMOVEs that
// requirement and ADDs "Cut Drive"/"Stop In Place" plus "Releasing a
// Co-Resident Verb's Slot Leaves Motion Untouched" (design.md Decision 20) —
// the one clause of the old requirement that survives verbatim in substance:
// cancelling a non-movement (mine) verb's slot must never force a docked
// fleet off its dock. This isolates that gap using a synthetic non-movement
// action on the slot, so it is red independent of whether backend/mine
// exists. See mine/integration_test.go for the full-slice version through a
// real committed mine run (task 5.4).

// standinMutatingType is a stand-in for "mine" — any non-movement verb that
// claims the fleet's movement slot while the fleet stays docked exercises
// EXACTLY the gap Decision #16 describes; it need not be mine itself.
const standinMutatingType = "standin-mutating"

// Scenario: Cancelling via the fleet endpoint while mining leaves the fleet
// docked ("Cancel Halts in Place").
func TestCancel_Scenario_DockedFleetWithNonMovementSlotStaysDocked(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "fleets", "actions", "deltas/sys-0/entries")

	ctx := context.Background()
	clk := &fakeClock{now: 0}
	actionSvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	actionSvc.RegisterResolver(standinMutatingType, action.KindMutating, func(context.Context, action.Resolution) (action.ResolveResult, error) {
		return action.ResolveResult{Outcome: "n/a"}, nil
	})
	fleetDao := NewDaoWithClient(fs)
	fleetSvc := NewServiceWith(fleetDao, &fakeSystem{}, actionSvc, clk)

	docked := &Fleet{
		Id: "fleet-dock-1", CorporationId: "dev-corp", SystemId: "sys-0",
		AttachedTo: "feat-planet",
		State:      space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
	}
	if err := fleetDao.Save(ctx, *docked); err != nil {
		t.Fatalf("seed docked fleet: %v", err)
	}

	// A non-movement action (mine's stand-in) claims the movement slot — the
	// state Decision #9/#16 makes reachable for the first time.
	if _, err := actionSvc.Commit(ctx, action.CommitSpec{
		Type: standinMutatingType, Actor: docked.Id, ActorCollection: "fleets",
		Scope: "sys-0", Eta: 999_999_999,
	}); err != nil {
		t.Fatalf("commit stand-in mutating action on the movement slot: %v", err)
	}

	f, err := fleetSvc.Cancel(ctx, docked.Id)
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if host, isDocked := f.DockedTo(); !isDocked || host != "feat-planet" {
		t.Fatalf("AttachedTo after cancelling a non-movement slot = %q (docked=%v), want unchanged docked to feat-planet "+
			"(a docked fleet has no motion to halt into a drift)", host, isDocked)
	}
	if f.State.Mode != space.ModeParked {
		t.Fatalf("state after cancelling a non-movement slot = %v, want unchanged (no actor-state patch)", f.State.Mode)
	}
	if f.ActiveActionId != "" {
		t.Fatalf("movement slot not released by cancel, got %q", f.ActiveActionId)
	}
}

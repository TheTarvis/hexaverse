package fleet

// RED-phase test for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.9 — "Releasing a Co-Resident Verb's Slot Leaves Motion
// Untouched", the SECOND of its two named scenarios. cancel_dock_test.go's
// pre-existing TestCancel_Scenario_DockedFleetWithNonMovementSlotStaysDocked
// (section 3) already pins the fleet-endpoint half ("Cancelling via the
// fleet endpoint while mining leaves the fleet docked" —
// POST /v1/fleets/:fleetId/cancel). This file is the companion: cancelling
// the SAME kind of run via the generic action endpoint directly
// (POST /v1/actions/:actionId/cancel, exercised here at the service layer as
// action.Service.Cancel — fleet.Service is never called at all) must leave
// the fleet's kinematic state and AttachedTo identically untouched.
//
// EXPECTED TO PASS ON FIRST RUN: action.Service.Cancel's slot release is
// already fleet-agnostic (action/dao.go clears the actor doc's claimed slot
// field generically, keyed off the committed Action's own ActorCollection/
// Actor/Slot) — there is no fleet-specific code for this scenario to be
// missing. Pinned anyway because tasks.md 4.9 names it as its own scenario,
// not something to leave as an unstated assumption riding on the
// fleet-endpoint test alone.

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/space"
)

// Scenario: Cancelling the mine action directly leaves the fleet docked.
//
// WHEN POST /v1/actions/:actionId/cancel is called on a running mine action
// claiming a docked fleet's movement slot THEN the movement slot is released
// and the fleet's kinematic state and AttachedTo are unchanged.
func TestActionCancel_Scenario_DirectCancelLeavesFleetDocked(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "fleets", "actions", "deltas/sys-0/entries")

	ctx := context.Background()
	clk := &fakeClock{now: 0}
	actionSvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	actionSvc.RegisterResolver(standinMutatingType, action.KindMutating, func(context.Context, action.Resolution) (action.ResolveResult, error) {
		return action.ResolveResult{Outcome: "n/a"}, nil
	})
	fleetDao := NewDaoWithClient(fs)

	docked := &Fleet{
		Id: "fleet-dock-2", CorporationId: "dev-corp", SystemId: "sys-0",
		AttachedTo: "feat-planet",
		State:      space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
	}
	if err := fleetDao.Save(ctx, *docked); err != nil {
		t.Fatalf("seed docked fleet: %v", err)
	}

	committed, err := actionSvc.Commit(ctx, action.CommitSpec{
		Type: standinMutatingType, Actor: docked.Id, ActorCollection: "fleets",
		Scope: "sys-0", Eta: 999_999_999,
	})
	if err != nil {
		t.Fatalf("commit stand-in mutating action on the movement slot: %v", err)
	}

	// The action endpoint's own path, exercised directly at the service
	// layer — fleet.Service.Cancel is never called.
	if _, err := actionSvc.Cancel(ctx, committed.Id, nil); err != nil {
		t.Fatalf("actionSvc.Cancel: %v", err)
	}

	after, err := fleetDao.Get(ctx, docked.Id)
	if err != nil {
		t.Fatalf("re-reading the fleet: %v", err)
	}
	if host, isDocked := after.DockedTo(); !isDocked || host != "feat-planet" {
		t.Fatalf("AttachedTo after direct-cancelling a non-movement slot = %q (docked=%v), want unchanged "+
			"docked to feat-planet — a docked fleet has no motion to halt into a drift", host, isDocked)
	}
	if after.State.Mode != space.ModeParked {
		t.Fatalf("state after direct-cancelling a non-movement slot = %v, want unchanged", after.State.Mode)
	}
	if after.ActiveActionId != "" {
		t.Fatalf("movement slot not released by the direct action-cancel, got %q", after.ActiveActionId)
	}
}

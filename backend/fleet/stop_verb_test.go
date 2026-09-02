package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.5 — "Stop In Place Commits a Velocity-Nulling Burn". Both
// scenarios below are EXPECTED TO PASS ON FIRST RUN: Service.Stop
// (service.go) already implements the speed-floor branch exactly as
// specced — this file exists to give both branches their own pinned,
// named-scenario coverage (attached_to_test.go's TestStop_Scenario_
// ClearsAttachedToAtAcceptance only pins the AttachedTo invariant, using a
// docked/orbiting fixture, and asserts nothing about which branch fired or
// what State.Mode results).

import (
	"context"
	"testing"

	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// Scenario: Stopping above the speed floor commits a nulling burn.
//
// WHEN stop-in-place is ordered against a fleet whose live speed exceeds the
// configured stop-in-place speed floor THEN a burn is committed on the
// movement channel that ends the fleet's motion at a point ahead of it,
// charging delta-v and emitting for its duration, settling into a point park
// once the burn arrives.
func TestStop_Scenario_AboveFloorCommitsANullingBurn(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	// A drift whose speed is far above space.StopInPlaceSpeedFloor (worked
	// examples elsewhere in this package use single-digit floors against an
	// accel of 8; 50 units/s is comfortably clear of any plausible floor).
	fast := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{
			Anchor: space.Vec3{X: 150}, Velocity: space.Vec3{X: 50}, EpochMs: 0,
		}},
	}
	if fast.State.Drift.Velocity.Length() <= space.StopInPlaceSpeedFloor {
		t.Fatalf("fixture bug: %v must exceed space.StopInPlaceSpeedFloor (%v)",
			fast.State.Drift.Velocity.Length(), space.StopInPlaceSpeedFloor)
	}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(fast, nil)

	got, err := svc.Stop(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if got.State.Mode != space.ModeBurn || got.State.Burn == nil {
		t.Fatalf("above the floor, Stop must commit a burn; got mode %v", got.State.Mode)
	}
	if got.State.Burn.DeltaV() <= 0 {
		t.Errorf("the committed stop burn charges no delta-v: DeltaV()=%v, want > 0", got.State.Burn.DeltaV())
	}
	if got.ActiveActionId == "" || fa.committed == nil || fa.committed.Type != burnType {
		t.Fatalf("expected a committed burn action on the movement channel, got ActiveActionId=%q committed=%+v",
			got.ActiveActionId, fa.committed)
	}
	// Settles to a point park once the burn arrives — fold the committed
	// burn to its own arrival instant and check the resulting park kind,
	// exactly as BurnResolver would (resolver_test.go's own pattern).
	settled, err := space.StateAt(bodies, got.State, got.State.Burn.ArriveMs)
	if err != nil {
		t.Fatalf("folding the committed burn to its arrival: %v", err)
	}
	if settled.Mode != space.ModeParked || settled.Park == nil || settled.Park.Kind != space.ParkPoint {
		t.Fatalf("settled state at arrival = %+v, want a ParkPoint", settled)
	}
}

// Scenario: Stopping at or below the speed floor is instant and free.
//
// WHEN stop-in-place is ordered against a fleet whose live speed is at or
// below the configured stop-in-place speed floor THEN the fleet's state
// becomes a point park at its current position immediately, with no
// committed action, no ETA, and no delta-v charged.
func TestStop_Scenario_AtOrBelowFloorIsInstantAndFree(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	pos := space.Vec3{X: 150}
	// A drift at EXACTLY the floor — the boundary this scenario's own "at or
	// below" wording names, inclusive.
	slow := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{
			Anchor: pos, Velocity: space.Vec3{X: space.StopInPlaceSpeedFloor}, EpochMs: 0,
		}},
	}
	// add-stationkeep-hold-verb task 4.5: stop-in-place's free,
	// below-the-speed-floor branch now PERSISTS its point park, its cleared
	// attachedTo and its updatedAt unconditionally (it previously wrote
	// nothing at all for a fleet with no active action, against the live
	// "Stopping at or below the speed floor is instant and free"). That is a
	// second read and one write on this fixture's DAO — a mechanical
	// expectation update, no assertion here changed.
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(slow, nil).Times(2)
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).Return(nil).Times(1)

	got, err := svc.Stop(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if got.State.Mode != space.ModeParked || got.State.Park == nil || got.State.Park.Kind != space.ParkPoint {
		t.Fatalf("at or below the floor, Stop must convert instantly to a ParkPoint; got %+v", got.State)
	}
	if got.State.Park.Point != pos {
		t.Errorf("parked point = %+v, want the fleet's current position %+v", got.State.Park.Point, pos)
	}
	if got.ActiveActionId != "" {
		t.Errorf("ActiveActionId = %q, want empty — no committed action for the instant/free branch", got.ActiveActionId)
	}
	if fa.committed != nil {
		t.Errorf("expected no committed action, got %+v", fa.committed)
	}
}

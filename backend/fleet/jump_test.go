package fleet

// RED-phase tests for tasks.md 3.3 — a fleet-owned `Jump *JumpTransit` field
// for lane-transit representation, deliberately NOT a `space.ShipState`
// shape, since a fleet in transit has no position in either system
// (design.md Decision 4). Exercises fleet-movement MODIFIED "Effective
// Position Resolution" — scenario "A fleet mid-jump reports no position in
// either system": consumers must treat a jumping fleet as absent, never as
// located at its (possibly stale) pre-jump State.
//
// CONTRACT this file assumes (space_testutil_test.go's header applies): a
// `JumpTransit` struct exists with at least a destination system id and an
// arrival time, and `Service.Position(ctx, f, bodies)` returns a sentinel
// error — SDET-named `ErrFleetInTransit` — whenever `f.Jump != nil`,
// regardless of what `f.State` holds.

import (
	"context"
	"testing"

	"hexaverse/space"
)

func TestPosition_Scenario_FleetMidJumpReportsNoPositionInEitherSystem(t *testing.T) {
	clk := &fakeClock{now: 50_000}
	svc, _, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)

	// The fleet's stored State is a PERFECTLY VALID, resolvable burn — proving
	// the rejection comes from Jump being set, not from State being garbage.
	// If a caller ever folded this stale State instead of honoring Jump, this
	// test would observe a plausible-looking (but wrong) pre-jump position
	// rather than the required absence.
	f := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{}, Target: space.Target{Point: &space.Vec3{X: 50}},
			Intercept: space.Vec3{X: 50}, Accel: 8, DepartMs: 0, ArriveMs: 100_000,
		}},
		Jump: &JumpTransit{DestSystemId: "sys-1", DepartMs: 0, ArriveMs: 200_000},
	}

	_, err := svc.Position(context.Background(), f, bodies)
	if err == nil {
		t.Fatal("Position returned no error for a mid-jump fleet — a jumping fleet must report NO position, " +
			"not a value derived from its stale pre-jump State")
	}
}

func TestPosition_Scenario_NonJumpingFleetIsUnaffectedByJumpField(t *testing.T) {
	// Companion boundary check (SDET-added): a fleet with Jump == nil must
	// resolve normally — the guard must trigger on Jump's presence alone,
	// never as a side effect of some other field this fixture happens to set.
	clk := &fakeClock{now: 50_000}
	svc, _, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	f := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 7}}},
	}

	pos, err := svc.Position(context.Background(), f, bodies)
	if err != nil {
		t.Fatalf("Position: unexpected error for a non-jumping fleet: %v", err)
	}
	if pos != (space.Vec3{X: 7}) {
		t.Fatalf("Position = %+v, want the parked point (7,0,0)", pos)
	}
}

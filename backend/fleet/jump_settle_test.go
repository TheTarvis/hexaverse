package fleet

// RED-phase test for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 5.0 — "extract the resolve-a-due-arrival step into one private
// seam ... and route the jump through it, rather than hand-rolling a fourth
// copy of the check". OrderTo's and the cut path's own retrofit onto that
// seam is a pure internal refactor of ALREADY-PASSING behavior (their
// externally observable fold-first outcomes are pinned by
// order_replace_and_retarget_test.go / stale_arrival_integration_test.go /
// cutdrive_verb_test.go, none of which this SDET pass touches) — there is
// nothing new to assert about them from outside the package. What IS new is
// that Jump must exhibit the SAME behavior, and this is also the sharpest
// available test of "Lane Jump From a Docked Gate"'s own no-dwell scenario:
// a fleet whose burn arrives at the gate THIS INSTANT, with the doc not yet
// resolved, must be jump-eligible immediately — which is only possible if
// Jump folds the arrival before evaluating attachment.

import (
	"context"
	"testing"

	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// Scenario: A fleet is jump-eligible the instant it attaches, with no dwell
// (fleet-movement "Lane Jump From a Docked Gate") — driven through the
// hardest version of that claim: the burn that attaches the fleet to the
// gate has already reached ArriveMs but has NEVER been read/resolved, so the
// stored doc still says "burn". tasks.md 5.0's own text: this is the same
// fold-first predicate OrderTo/cut already apply, now retrofit onto Jump.
func TestJump_Scenario_SettlesDueArrivalBeforeEvaluatingAttachmentNoDwell(t *testing.T) {
	clk := &fakeClock{now: 80_000} // strictly after the stored burn's ArriveMs=50_000
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// The origin system's REAL body table must carry the destination lane's
	// gate body for space.StateAt to genuinely fold the stored burn into a
	// ParkOrbit riding it — this is what makes the fold-first predicate
	// actually trigger, not merely assumed by the fixture.
	gate := orbitingFeature("gate-sys-1", 220, system.GateSize)
	bodies := testBodyTable(t, "sys-0", 6.0, gate)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})
	svc.WithTierSource(&fakeTierSource{charted: map[string]bool{"lane-1": true}})
	svc.WithGraph(&fakeGraph{destSystemId: "sys-1", to: space.Vec3{X: 100}})
	svc.classStats = map[ShipClass]ClassStats{ClassSeed: {LaneRate: 1.0}}

	unsettled := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		ActiveActionId: "action_old_burn",
		State: space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: -50}, Target: space.Target{BodyId: "gate-sys-1"},
			Intercept: space.Vec3{X: 220}, Accel: 8, DepartMs: 0, ArriveMs: 50_000,
		}},
	}
	// As if BurnResolver had already run (tasks.md 3.1's own settled shape):
	// attached, parked in orbit of the gate, slot released.
	settled := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		AttachedTo: "gate-sys-1",
		State:      space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: "gate-sys-1", Radius: 220}},
	}
	gomock.InOrder(
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(unsettled, nil),
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(settled, nil),
	)

	got, err := svc.Jump(context.Background(), "fleet_1", "lane-1")
	if err != nil {
		t.Fatalf("Jump against a fleet whose burn arrived at the gate this very instant, with no dwell: %v", err)
	}
	if len(fa.resolved) != 1 || fa.resolved[0] != "fleet_1" {
		t.Fatalf("tasks.md 5.0: Jump must settle a due-but-unresolved arrival through the SAME fold-first seam "+
			"OrderTo/cut-drive use, before evaluating gate attachment — got fa.resolved=%v (want [\"fleet_1\"])", fa.resolved)
	}
	if got.Jump == nil || got.Jump.DestSystemId != "sys-1" {
		t.Fatalf("expected the jump to commit against the settled (now-attached) fleet, got %+v", got)
	}
}

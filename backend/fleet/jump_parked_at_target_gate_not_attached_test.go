package fleet

// RED-phase test for openspec change delete-the-lattice, task 3.5 —
// trading-station's ADDED "Station Is a Dockable, Non-Mineable Body" ›
// "Position coincidence without attachment is not docking": "every
// dock-gated verb (sell, refuel, jump) rejects it exactly as it would for a
// fleet parked anywhere else". `market/parked_not_attached_test.go` already
// pins this for sell (a pre-existing test from re-express-economy-positions,
// engineering EXACT position coincidence with the real station body via a
// ParkOrbit at radius 0), and mine's own "mine command against the station"
// rejection is a separate scenario. This file is the SDET-added sibling for
// jump: a fleet parked EXACTLY at the target gate's own position — riding
// the same gate body a jump to it would require attachment to, at radius 0,
// so its resolved coordinate is identical to the gate's — but whose stored
// AttachedTo does not name that gate.
//
// NO CODE CHANGE EXPECTED: fleet.Service.Jump's eligibility check
// (`f.AttachedTo != "gate-"+destId` — jump_verb_test.go's own documented
// CONTRACT) reads only the stored AttachedTo string; it never inspects the
// fleet's kinematic State/position at all. This test's fixture makes that
// property observable by choosing the WORST-CASE position — coincident with
// the very gate that would grant attachment — so a future implementation
// that "helpfully" adds a position-coincidence shortcut would be caught
// here, not just by the already-existing (position-independent) "not
// attached to anything" / "attached to a different body" cases in
// TestJump_Scenario_RejectedWithoutAttachment (jump_verb_test.go, untouched
// by this change).
import (
	"context"
	"errors"
	"testing"

	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

func TestJump_Scenario_ParkedExactlyAtTargetGateButNotAttachedIsRejected(t *testing.T) {
	clk := &fakeClock{now: 1_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	svc.graph = &fakeGraph{destSystemId: "sys-1", to: space.Vec3{X: 1}}

	// Parked in orbit of "gate-sys-1" — the SAME gate body Jump("lane-1")
	// would require attachment to — at radius 0, so this fleet's resolved
	// continuous position is identical to the gate's. AttachedTo is
	// explicitly cleared, never naming that gate.
	f := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		AttachedTo: "",
		State:      space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: "gate-sys-1", Radius: 0}},
	}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	_, err := svc.Jump(context.Background(), "fleet_1", "lane-1")
	if !errors.Is(err, ErrJumpNotAttached) {
		t.Fatalf("jumping while parked exactly at (but never attached to) the target gate: err = %v, want ErrJumpNotAttached", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected jump must not commit an action, got %+v", fa.committed)
	}
}

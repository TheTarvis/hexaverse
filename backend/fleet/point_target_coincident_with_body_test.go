package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/space"
)

// fleet-movement, "Every Body In the System's Body Table Is a Valid
// Attachment Host" — "A point-targeted park coincident with a body does
// not attach" (re-express-economy-positions tasks.md 3.3).
//
// NO CODE CHANGE EXPECTED: BurnResolver's attach-on-resolve write reads
// settled.Park.BodyId, which space.StateAt/space.BuildCurve populate ONLY
// for a body-targeted burn (Target.BodyId set) — a point-targeted burn
// settles into a ParkPoint (BodyId always empty) regardless of what its
// endpoint happens to be near. TestBurnResolver_Scenario_
// PointTargetSettlesToAPointParkNoAttachedTo (resolver_test.go, pre-
// existing/untouchable) already pins the point-targeted case in general,
// but its endpoint (X:300) is not constructed to coincide with any real
// body — it merely happens not to attach because nothing is there. This
// test strengthens that: the endpoint is EXACTLY a real body's own resolved
// position (the strongest possible form of "coincident" the scenario
// names), so a hypothetical regression that attached based on endpoint
// proximity/coincidence (rather than the burn's actual TARGET) would be
// caught here but not by the pre-existing test.
func TestBurnResolver_Scenario_PointTargetCoincidentWithABodyDoesNotAttach(t *testing.T) {
	target := orbitingFeature("feat-body-a", 40, 2.0)
	bodies := testBodyTable(t, "sys-0", 6.0, target)
	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})

	const arriveMs = 150_000
	coincident, err := space.Position(bodies, "feat-body-a", arriveMs)
	if err != nil {
		t.Fatalf("resolving feat-body-a's own position: %v", err)
	}

	burning := Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-0",
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: -50}, Target: space.Target{Point: &coincident}, // POINT-targeted, not body-targeted
			Intercept: coincident, Accel: 8, DepartMs: 0, ArriveMs: arriveMs,
		}}),
	}

	res, err := resolver(context.Background(), action.Resolution{
		At:     arriveMs + 1,
		Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = burning
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res.ActorState["attachedTo"] != "" {
		t.Errorf("attachedTo = %v after a point-targeted burn whose endpoint coincides EXACTLY with feat-body-a's own position, want empty — attachment follows the burn's TARGET, never the endpoint's incidental position", res.ActorState["attachedTo"])
	}
	settledDoc, ok := res.ActorState["state"].(map[string]any)
	if !ok {
		t.Fatalf("res.ActorState[\"state\"] missing/wrong type: %v", res.ActorState["state"])
	}
	settled, err := DecodeKinematicState(bodies, settledDoc, "", "")
	if err != nil {
		t.Fatalf("decoding settled state: %v", err)
	}
	if settled.Mode != space.ModeParked || settled.Park == nil || settled.Park.Kind != space.ParkPoint {
		t.Fatalf("settled state = %+v, want a ParkPoint (never a ParkOrbit — the burn's TARGET was a point, not this body, however close the endpoint landed)", settled)
	}
}

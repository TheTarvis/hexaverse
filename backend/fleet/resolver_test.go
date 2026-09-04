package fleet

import (
	"context"
	"errors"
	"testing"

	"hexaverse/action"
	"hexaverse/space"
)

// DELETED (migrate-fleet-to-continuous-burns, design.md Decision 21A, task
// 6.5): this file used to test BurnResolverWithAmbient/AmbientRecorder — the
// path-swept ambient reveal a resolved move used to also mint. Decision 4
// deletes it outright: a burn's path is no longer a []board.Cell to sweep,
// and observation's ambient-reveal write it fed is itself REMOVED (design.md
// Decision 11). There is no successor to migrate to; link 5
// (replace-observation-with-sightings) is where a reveal mechanism next
// exists, and it will not be another sweep.
//
// It also carried TestCoastState_ObeysTheSharedOrbitalLaw, pinning that a
// settled fleet inherited the same live-tunable orbital period the bodies
// beside it had, from a single global knob. That knob and the shared-law
// coast it drove are both gone: a fleet's motion is a continuous solve now,
// and a body's period is its own Keplerian element, so the property has no
// subject left to be true of.
//
// What replaces both, below: direct unit tests of the REAL, currently-shipped
// `BurnResolver` (resolver.go) — settling a due burn through space.StateAt,
// setting AttachedTo only for a body-targeted arrival (design.md Decision 4,
// 13; tasks.md 3.1), and leaving an already-settled state alone. This
// function had no direct test coverage anywhere in the pre-migration corpus
// (the old TestGet_ArrivalDocksAfterEta/TestGet_ArrivalCoastsWhenNoDock
// exercised it only indirectly, through Service.Get with a fake action
// spine that never actually invoked it) — filed here as a genuine coverage
// gap this migration makes newly obvious, not a port.

// Scenario: A point-targeted burn past its arrival settles to a point park —
// no AttachedTo, outcome "arrived".
func TestBurnResolver_Scenario_PointTargetSettlesToAPointParkNoAttachedTo(t *testing.T) {
	bodies := testBodyTable(t, "sys-0", 6.0)
	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})

	point := space.Vec3{X: 300}
	burning := Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-0",
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: 20}, Target: space.Target{Point: &point}, Intercept: point,
			Accel: 8, DepartMs: 0, ArriveMs: 100_000,
		}}),
	}

	res, err := resolver(context.Background(), action.Resolution{
		At:     150_000, // past ArriveMs
		Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = burning
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res.Outcome != "arrived" {
		t.Errorf("outcome = %q, want %q", res.Outcome, "arrived")
	}
	if res.ActorState["attachedTo"] != "" {
		t.Errorf("attachedTo = %v, want empty for a point-targeted arrival", res.ActorState["attachedTo"])
	}
	settledDoc, ok := res.ActorState["state"].(map[string]any)
	if !ok {
		t.Fatalf("res.ActorState[\"state\"] = %v, want the encoded kinematic state", res.ActorState["state"])
	}
	settled, err := DecodeKinematicState(bodies, settledDoc, "", "")
	if err != nil {
		t.Fatalf("decoding the settled state: %v", err)
	}
	if settled.Mode != space.ModeParked || settled.Park == nil || settled.Park.Kind != space.ParkPoint {
		t.Fatalf("settled state = %+v, want a ParkPoint", settled)
	}
	if settled.Park.Point != point {
		t.Errorf("settled point = %+v, want the intercept %+v", settled.Park.Point, point)
	}
}

// Scenario: A body-targeted burn past its arrival settles to a ParkOrbit
// riding the target body — AttachedTo is set to the body's id, only now, at
// resolve (design.md Decision 4/13; tasks.md 3.1's own pinned invariant).
func TestBurnResolver_Scenario_BodyTargetSettlesToAParkOrbitAndSetsAttachedTo(t *testing.T) {
	target := orbitingFeature("feat-body-a", 40, 2.0)
	bodies := testBodyTable(t, "sys-0", 6.0, target)
	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})

	burning := Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-0",
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: -50}, Target: space.Target{BodyId: "feat-body-a"},
			Intercept: space.Vec3{X: 40}, Accel: 8, DepartMs: 0, ArriveMs: 100_000,
		}}),
	}

	res, err := resolver(context.Background(), action.Resolution{
		At:     150_000,
		Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = burning
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res.Outcome != "docked at feat-body-a" {
		t.Errorf("outcome = %q, want %q", res.Outcome, "docked at feat-body-a")
	}
	if res.ActorState["attachedTo"] != "feat-body-a" {
		t.Errorf("attachedTo = %v, want %q", res.ActorState["attachedTo"], "feat-body-a")
	}
	settledDoc, ok := res.ActorState["state"].(map[string]any)
	if !ok {
		t.Fatalf("res.ActorState[\"state\"] = %v, want the encoded kinematic state", res.ActorState["state"])
	}
	settled, err := DecodeKinematicState(bodies, settledDoc, "", "")
	if err != nil {
		t.Fatalf("decoding the settled state: %v", err)
	}
	if settled.Mode != space.ModeParked || settled.Park == nil || settled.Park.Kind != space.ParkOrbit {
		t.Fatalf("settled state = %+v, want a ParkOrbit", settled)
	}
	if settled.Park.BodyId != "feat-body-a" {
		t.Errorf("settled park body = %q, want feat-body-a", settled.Park.BodyId)
	}
}

// Scenario: An already-settled state (a racing read got here first) writes
// no actor state — just an honest outcome, so a duplicate resolve attempt
// never clobbers a state a later commit may already have moved on from.
func TestBurnResolver_Scenario_AlreadySettledWritesNoActorState(t *testing.T) {
	bodies := testBodyTable(t, "sys-0", 6.0)
	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})

	alreadyParked := Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-0",
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 300}}}),
	}

	res, err := resolver(context.Background(), action.Resolution{
		At:     150_000,
		Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = alreadyParked
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res.ActorState != nil {
		t.Errorf("ActorState = %v, want nil (no write) for an already-settled state", res.ActorState)
	}
}

// Scenario: A resolve against an unknown body id (the stored burn's target
// body no longer exists in the live table) fails through space's own
// ErrUnknownBody, surfaced by DecodeKinematicState's decode step.
func TestBurnResolver_Scenario_UnknownTargetBodyFails(t *testing.T) {
	bodies := testBodyTable(t, "sys-0", 6.0) // no "feat-does-not-exist"
	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})

	burning := Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-0",
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: -50}, Target: space.Target{BodyId: "feat-does-not-exist"},
			Intercept: space.Vec3{X: 40}, Accel: 8, DepartMs: 0, ArriveMs: 100_000,
		}}),
	}

	_, err := resolver(context.Background(), action.Resolution{
		At:     150_000,
		Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = burning
			return nil
		},
	})
	if !errors.Is(err, ErrKinematicDecode) {
		t.Fatalf("err = %v, want ErrKinematicDecode (cause=unknown-body)", err)
	}
}

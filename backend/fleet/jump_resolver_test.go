package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 5.3 — the jump resolver: on ETA, flip the fleet's systemId, clear
// Jump, settle into a park near the destination gate's insertion standoff
// (never attached — unmasked arrival), chart the crossed lane `via:
// traveled`, mint no onward rumor (fleet-movement "Jump Arrival Parks Near
// the Destination Gate, Unmasked").
//
// CONTRACT this file assumes:
//
//   func JumpResolver(ctx context.Context, r action.Resolution) (action.ResolveResult, error)
//
// matching action.ResolveFunc's own signature directly (no injected
// dependency, unlike BurnResolver(bodies)) — deliberately: Resolution's own
// doc comment forbids a resolver from performing its own writes, and
// GetOrCreateInterior against a cold destination system WRITES a freshly
// generated interior, so the resolver cannot call it. The settled park it
// writes is therefore parented to the destination gate body BY ID alone, at
// a standoff derived from the UNIVERSAL system.GateSize constant (every
// gate is the same size — design.md's own worked bound in Decision 14 uses
// this), never from the destination's own (possibly not-yet-materialized)
// real orbit. Materializing that orbit for real is a deliberate, SEPARATE
// step this file's sibling (jump_service_materialize_test.go) pins at the
// SERVICE level, run strictly AFTER the resolve transaction completes.
//
// The destination gate's body id names the lane BACK to the fleet's ORIGIN
// system — "gate-"+originSystemId — mirroring system.gateId's own naming
// convention (system/bodies.go), the only way a fleet-package function can
// refer to "the gate home" without system exporting gateId.
//
// A developer landing a materially different but scenario-equivalent shape
// (e.g. a resolver that DOES take a BodySource and reads/writes a fully
// resolved orbit) should raise it as a test dispute — this SDET-authored
// contract makes a specific, disclosed bet about how "no writes in a
// resolver" and "materialize after resolve" compose.

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/charts"
	"hexaverse/space"
	"hexaverse/system"
)

// Scenario: Arrival flips the system and parks unattached near the gate;
// arrival charts the crossed lane as traveled and rumors nothing onward.
// Combined into one test since both are the SAME resolve's output.
func TestJumpResolver_Scenario_ArrivalFlipsSystemParksUnattachedChartsLaneNoRumor(t *testing.T) {
	originId, destId := "sys-0", "sys-1"
	jumping := Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: originId,
		Jump: &JumpTransit{LaneId: "lane-1", DestSystemId: destId, DepartMs: 0, ArriveMs: 100_000},
		// Stale pre-jump State, deliberately nonsensical (a burn to a point
		// far from anything gate-related) — the resolver must IGNORE it
		// entirely (design.md Decision 4: "the stored space.ShipState is
		// stale and SHALL NOT be evaluated by any reader"). A resolver that
		// read it would settle somewhere derived from this garbage instead
		// of near the gate.
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: 999}, Target: space.Target{Point: &space.Vec3{X: 999}},
			Intercept: space.Vec3{X: 999}, Accel: 8, DepartMs: 0, ArriveMs: 999,
		}}),
	}

	res, err := JumpResolver(context.Background(), action.Resolution{
		At:     100_000,
		Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = jumping
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	if res.ActorState == nil {
		t.Fatal("expected ActorState to be written for a due, unsettled jump")
	}
	if res.ActorState["systemId"] != destId {
		t.Errorf("systemId = %v, want %q", res.ActorState["systemId"], destId)
	}
	jv, present := res.ActorState["jump"]
	if !present {
		t.Fatal("no \"jump\" key in ActorState — Jump must be explicitly cleared at resolve")
	}
	if jv != nil {
		t.Errorf("jump = %v, want cleared (nil)", jv)
	}
	if res.ActorState["attachedTo"] != "" {
		t.Errorf("attachedTo = %v, want empty — arrival parks NEAR the gate, never attached to it", res.ActorState["attachedTo"])
	}

	settledDoc, ok := res.ActorState["state"].(map[string]any)
	if !ok {
		t.Fatalf("res.ActorState[\"state\"] = %v, want the encoded kinematic state", res.ActorState["state"])
	}
	// Decoded through the same permissive stand-in the real DAO boundary
	// grants (dao.go's permissiveBodies) — the destination gate this park
	// names may not exist as a materialized body yet (first arrival).
	settled, err := DecodeKinematicState(permissiveBodies{}, settledDoc, "", "")
	if err != nil {
		t.Fatalf("decoding the settled state: %v", err)
	}
	if settled.Mode != space.ModeParked || settled.Park == nil || settled.Park.Kind != space.ParkOrbit {
		t.Fatalf("settled state = %+v, want a ParkOrbit", settled)
	}
	wantGateId := "gate-" + originId
	if settled.Park.BodyId != wantGateId {
		t.Errorf("park BodyId = %q, want the destination's gate back home %q", settled.Park.BodyId, wantGateId)
	}
	wantStandoff := space.InsertionStandoff(space.Body{Size: system.GateSize})
	if diff := settled.Park.Radius - wantStandoff; diff > 1e-9 || diff < -1e-9 {
		t.Errorf("park radius = %v, want the gate's own insertion standoff %v (every gate is system.GateSize)",
			settled.Park.Radius, wantStandoff)
	}

	// Charts the crossed lane `via: traveled`, marks the destination
	// Explored, and mints no onward rumor — exactly charts' own
	// ArrivalWrites primitive (the same one travel-arrival already uses;
	// replace-observation-with-sightings design.md Decision 1 rehomes it
	// from observation unchanged). Built through the REAL function so this
	// assertion can't silently drift from what ArrivalWrites emits.
	want := (&charts.Service{}).ArrivalWrites("corp-1", destId, []string{"lane-1"}, 100_000)
	if !docWritesEqual(res.Writes, want) {
		t.Errorf("Writes = %+v, want exactly charts.ArrivalWrites' output %+v — charts the crossed lane "+
			"`via: traveled`, marks the destination explored, and mints no onward rumor", res.Writes, want)
	}
}

// docWritesEqual compares two []action.DocWrite for equal Path/Data content,
// order-sensitive (both ArrivalWrites and this resolver build the
// destination-observation entry before any lane entries, deterministically).
func docWritesEqual(a, b []action.DocWrite) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if len(a[i].Path) != len(b[i].Path) {
			return false
		}
		for j := range a[i].Path {
			if a[i].Path[j] != b[i].Path[j] {
				return false
			}
		}
		if len(a[i].Data) != len(b[i].Data) {
			return false
		}
		for k, v := range a[i].Data {
			if b[i].Data[k] != v {
				return false
			}
		}
	}
	return true
}

// Scenario (SDET-added boundary probe; mirrors BurnResolver's own
// TestBurnResolver_Scenario_AlreadySettledWritesNoActorState): a racing read
// already cleared Jump before this resolve ran — no further write.
func TestJumpResolver_Scenario_AlreadySettledWritesNoActorState(t *testing.T) {
	alreadySettled := Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-1", // already flipped
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 1}}}),
		// Jump is nil.
	}
	res, err := JumpResolver(context.Background(), action.Resolution{
		At: 100_000, Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error { *(target.(*Fleet)) = alreadySettled; return nil },
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res.ActorState != nil || res.Writes != nil {
		t.Errorf("expected no write for an already-settled jump, got ActorState=%v Writes=%v", res.ActorState, res.Writes)
	}
}

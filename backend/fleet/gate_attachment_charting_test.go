package fleet

// RED-phase test for openspec change replace-observation-with-sightings,
// closing the coverage gap flagged against tasks.md 2.4 / design.md
// Decision 3, item 2: `charts.GateAttachmentWrite` was implemented and
// unit-tested in charts' own suite, but has ZERO production callers — grep
// confirms the only hits are its own definition (charts/service.go:104,112).
// specs/galaxy-knowledge/spec.md's "Gate-Attachment Knowledge Write"
// requirement is therefore NOT satisfied in the running system, even though
// charts' own unit tests are green: those tests exercise the FUNCTION, never
// the call site.
//
// Per design.md Decision 3, item 2, the call site is fleet's own
// BurnResolver, at the instant a settling burn's AttachedTo becomes a body
// id — resolver.go already imports "hexaverse/charts" (for JumpResolver's
// unrelated ArrivalWrites call), so no import cycle blocks this.
//
// This file follows jump_resolver_test.go's own precedent for the identical
// concern (JumpResolver wiring charts.ArrivalWrites into
// action.ResolveResult.Writes): call the REAL, unmodified BurnResolver
// directly (no charts fake — GateAttachmentWrite is either really called or
// it is not) and assert its Writes field against the REAL charts function's
// own output, so the assertion can never silently drift from what the
// writer actually emits. This is a genuine consequence of resolver wiring,
// not a re-test of GateAttachmentWrite's own already-covered logic: if the
// call site is absent, res.Writes is nil regardless of whether
// GateAttachmentWrite itself is correct.
//
// #### Scenario: Docking at a gate charts its lane
// - WHEN a fleet's burn resolves into an attached park at a lane-gate body
// - THEN the lane that gate serves is charted `via: gate` for the fleet's
//   corporation
// - AND the destination system's own knowledge tier is unaffected by this
//   write
//
// #### Scenario: Attaching to a non-gate body charts nothing
// - WHEN a fleet's burn resolves into an attached park at a body that is
//   not a lane gate
// - THEN no lane is charted by this write

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/charts"
	"hexaverse/space"
)

// Scenario: Docking at a gate charts its lane. A burn targeting a body whose
// id follows system.gateId's own "gate-"+destSystemId convention
// ("gate-sys-1") settles AttachedTo to that body — proven already by
// resolver_test.go's body-target coverage — and per design.md Decision 3
// item 2, that same settle must also chart the lane home,
// `via: gate`, for the fleet's corporation, computed PURELY from
// (fromSystemId, hostBodyId) with no destination-system read. Built against
// the REAL charts.GateAttachmentWrite so the assertion tracks whatever that
// function actually emits.
func TestBurnResolver_Scenario_DockingAtAGateChartsItsLane(t *testing.T) {
	const cid = "corp-1"
	const fromSystemId = "sys-0"
	const gateBodyId = "gate-sys-1" // system.gateId("sys-1")'s own convention
	const resolveAt = 150_000

	gate := orbitingFeature(gateBodyId, 220, 1.2) // GateSize-shaped, orbiting the star
	bodies := testBodyTable(t, fromSystemId, 6.0, gate)
	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})

	docking := Fleet{
		Id: "fleet_1", CorporationId: cid, SystemId: fromSystemId,
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: -50}, Target: space.Target{BodyId: gateBodyId},
			Intercept: space.Vec3{X: 220}, Accel: 8, DepartMs: 0, ArriveMs: 100_000,
		}}),
	}

	res, err := resolver(context.Background(), action.Resolution{
		At:     resolveAt,
		Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = docking
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	// Sanity: this really is the gate-attachment case resolver_test.go's own
	// body-target coverage already proves settles AttachedTo — if this
	// fails, the fixture (not the gap) is broken.
	if res.ActorState["attachedTo"] != gateBodyId {
		t.Fatalf("attachedTo = %v, want %q — test fixture is not exercising a gate attachment",
			res.ActorState["attachedTo"], gateBodyId)
	}

	want := charts.GateAttachmentWrite(cid, fromSystemId, gateBodyId, resolveAt)
	if len(want) == 0 {
		t.Fatal("test bug: charts.GateAttachmentWrite itself returned nothing for a gate-shaped id — " +
			"fixture's gateBodyId does not match the \"gate-\" prefix convention")
	}
	if !docWritesEqual(res.Writes, want) {
		t.Errorf("BurnResolver's Writes = %+v, want exactly charts.GateAttachmentWrite's own output %+v — "+
			"the scenario \"Docking at a gate charts its lane\" is unmet: BurnResolver never calls "+
			"charts.GateAttachmentWrite (design.md Decision 3 item 2), so docking at a gate charts nothing "+
			"in the running system even though charts.GateAttachmentWrite itself is correct and unit-tested",
			res.Writes, want)
	}

	// THEN clause: "the destination system's own knowledge tier is
	// unaffected by this write" — a gate-attachment write must touch only
	// the corp's chartedLanes record, never a corp's system-knowledge
	// (charts) record. Checked by construction against the write paths
	// BurnResolver actually returns, not against GateAttachmentWrite in
	// isolation (which is already asserted correct by charts' own tests).
	for _, w := range res.Writes {
		for _, seg := range w.Path {
			if seg == "charts" {
				t.Errorf("BurnResolver's Writes touched a system-knowledge (\"charts\") path %v — "+
					"a gate-attachment write must never affect the destination system's own "+
					"knowledge tier", w.Path)
			}
		}
	}
}

// Scenario: Attaching to a non-gate body charts nothing. A burn settling
// AttachedTo to an ordinary (non-"gate-"-prefixed) body must produce no
// charting write at all.
func TestBurnResolver_Scenario_AttachingToANonGateBodyChartsNothing(t *testing.T) {
	const cid = "corp-1"
	const fromSystemId = "sys-0"
	const ordinaryBodyId = "feat-body-a"

	ordinary := orbitingFeature(ordinaryBodyId, 40, 2.0)
	bodies := testBodyTable(t, fromSystemId, 6.0, ordinary)
	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})

	docking := Fleet{
		Id: "fleet_1", CorporationId: cid, SystemId: fromSystemId,
		StateDoc: EncodeKinematicState(space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{X: -50}, Target: space.Target{BodyId: ordinaryBodyId},
			Intercept: space.Vec3{X: 40}, Accel: 8, DepartMs: 0, ArriveMs: 100_000,
		}}),
	}

	res, err := resolver(context.Background(), action.Resolution{
		At:     150_000,
		Action: action.Action{Id: "action_1"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = docking
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res.ActorState["attachedTo"] != ordinaryBodyId {
		t.Fatalf("attachedTo = %v, want %q — test fixture is not exercising a non-gate attachment",
			res.ActorState["attachedTo"], ordinaryBodyId)
	}
	if len(res.Writes) != 0 {
		t.Errorf("BurnResolver's Writes = %+v, want none — attaching to a non-gate body must chart nothing",
			res.Writes)
	}
}

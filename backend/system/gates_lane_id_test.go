package system

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 4.11 (specs/system-interior/spec.md ADDED requirement
// "Lane-Gate Bodies Carry Their Lane Id"). Genuinely RED today: LaneGate
// (gates.go) carries no LaneId field at all, so every reference to
// `.LaneId` below is a compile error until the field is added and populated
// via galaxy.LaneIdBetween (tasks.md 4.11's own prescribed derivation) —
// exactly the kind of legitimate red the SDET protocol calls out ("compile
// errors are legitimate red evidence").
//
// This file exercises system.Service.LaneGates directly (a fakeGalaxy, no
// Firestore) — the fast, isolated regression net. The "no fake" proof for
// the SAME requirement (the served id is what POST /v1/fleets/:id/jump
// actually accepts, end to end, through the real production router and a
// real Firestore-backed galaxy) lives in
// backend/lane_id_traversal_e2e_test.go instead — a fakeGalaxy standing in
// for the whole galaxy package cannot itself prove that galaxy.LaneCrossing
// (the real GraphSource jump commits through) agrees with this package's
// own derivation.
//
// laneIdGalaxy deliberately uses REAL "sys_<x>_<y>" ids (galaxy.SystemIdFor's
// own convention), unlike gates_test.go's threeSystemGalaxy fixture (which
// uses "sys-0"-style dashed ids for a different, laneId-agnostic test) —
// galaxy.LaneIdBetween parses ids through galaxy.CellForSystemId, and an
// unparseable id silently degrades to the zero Cell (matching
// CellForSystemId's own permissive-decode convention), which would make
// every gate's LaneId collapse to the same "lane_0_0_0_0" string regardless
// of which systems it actually connects — worthless for the scenario this
// file tests ("matches the server's own derivation for THIS crossing").

import (
	"context"
	"testing"

	"hexaverse/galaxy"
)

// laneIdGalaxy: three systems on real sys_<x>_<y> ids so galaxy.LaneIdBetween
// can parse them — sys_0_0 at the origin with two lanes (east to sys_10_0,
// north to sys_0_10, the second's endpoints stored reversed on purpose, same
// as gates_test.go's threeSystemGalaxy, to prove LaneId doesn't depend on a
// Lane doc's own AId/BId order either).
func laneIdGalaxy() *galaxy.GeneratedGalaxy {
	return &galaxy.GeneratedGalaxy{
		Systems: []galaxy.System{
			{Id: "sys_0_0", Coords: galaxy.Coords{X: 0, Y: 0}},
			{Id: "sys_10_0", Coords: galaxy.Coords{X: 10, Y: 0}},
			{Id: "sys_0_10", Coords: galaxy.Coords{X: 0, Y: 10}},
		},
		Lanes: []galaxy.Lane{
			{Id: "irrelevant-stored-id-1", AId: "sys_0_0", BId: "sys_10_0"},
			{Id: "irrelevant-stored-id-2", AId: "sys_0_10", BId: "sys_0_0"}, // reversed endpoints on purpose
		},
	}
}

// Scenario: A materialized system's read carries each lane-gate body's lane
// id (system-interior "Lane-Gate Bodies Carry Their Lane Id").
func TestLaneGates_Scenario_EveryGateCarriesANonEmptyLaneId(t *testing.T) {
	gx := &fakeGalaxy{live: laneIdGalaxy()}
	svc := NewServiceWith(NewMockDao(nil), gx, testClock())

	gates, err := svc.LaneGates(context.Background(), "sys_0_0")
	if err != nil {
		t.Fatalf("LaneGates: %v", err)
	}
	if len(gates) != 2 {
		t.Fatalf("got %d gates, want 2", len(gates))
	}
	for _, g := range gates {
		if g.LaneId == "" {
			t.Errorf("gate to %q carries an EMPTY laneId — system-interior \"Lane-Gate Bodies Carry Their Lane "+
				"Id\" requires a non-empty laneId on every lane-gate body; an empty string is the realistic wrong "+
				"implementation (gates.go's fillGateGeometry already establishes a zero-value-on-missing-data "+
				"habit for Space/Size — LaneId must NOT degrade the same way, since it has no missing-data case: "+
				"it is a pure function of the two system ids)", g.DestSystemId)
		}
	}
}

// Scenario: The served lane id matches the server's own derivation for the
// same crossing (system-interior "Lane-Gate Bodies Carry Their Lane Id") —
// order-independent over the unordered system pair: the gate FROM sys_0_0
// TO sys_10_0 and the gate FROM sys_10_0 TO sys_0_0 must carry the identical
// laneId, and that id must equal galaxy.LaneIdBetween's own pure derivation
// (the same function gate-attachment/travel-arrival charting writes already
// key on) — not merely a value LaneGates happens to reproduce internally.
func TestLaneGates_Scenario_ServedLaneIdMatchesGalaxyLaneIdBetween(t *testing.T) {
	gx := &fakeGalaxy{live: laneIdGalaxy()}
	svc := NewServiceWith(NewMockDao(nil), gx, testClock())

	want := galaxy.LaneIdBetween("sys_0_0", "sys_10_0")
	if want == "" {
		t.Fatalf("test setup: galaxy.LaneIdBetween(\"sys_0_0\", \"sys_10_0\") returned an empty string")
	}
	// Order independence pinned directly against the derivation itself.
	if reverse := galaxy.LaneIdBetween("sys_10_0", "sys_0_0"); reverse != want {
		t.Fatalf("galaxy.LaneIdBetween is not order-independent: forward=%q reverse=%q", want, reverse)
	}

	gatesFromOrigin, err := svc.LaneGates(context.Background(), "sys_0_0")
	if err != nil {
		t.Fatalf("LaneGates(sys_0_0): %v", err)
	}
	var gotFromOrigin string
	for _, g := range gatesFromOrigin {
		if g.DestSystemId == "sys_10_0" {
			gotFromOrigin = g.LaneId
		}
	}
	if gotFromOrigin != want {
		t.Errorf("gate sys_0_0 -> sys_10_0: laneId = %q, want %q (galaxy.LaneIdBetween)", gotFromOrigin, want)
	}

	gatesFromNeighbor, err := svc.LaneGates(context.Background(), "sys_10_0")
	if err != nil {
		t.Fatalf("LaneGates(sys_10_0): %v", err)
	}
	var gotFromNeighbor string
	for _, g := range gatesFromNeighbor {
		if g.DestSystemId == "sys_0_0" {
			gotFromNeighbor = g.LaneId
		}
	}
	if gotFromNeighbor != want {
		t.Errorf("gate sys_10_0 -> sys_0_0: laneId = %q, want %q (galaxy.LaneIdBetween) — same crossing, read from "+
			"either side, must be the identical id", gotFromNeighbor, want)
	}
}

// Scenario: A fresh corporation with no charted lanes still receives a
// usable lane id — structural guard. system.LaneGates takes no
// charted-knowledge parameter at all (replace-observation-with-sightings
// tasks.md 1.3 deleted chartedGates outright), so there is no filtering
// seam left to regress; this test pins that a laneId is served the same way
// whether or not ANY corp/fog concept is even in scope for the call, i.e.
// the function's signature and behavior make "fresh corp with nothing
// charted" indistinguishable from any other caller.
func TestLaneGates_Scenario_LaneIdServedWithNoChartedKnowledgeInvolvedAtAll(t *testing.T) {
	gx := &fakeGalaxy{live: laneIdGalaxy()}
	svc := NewServiceWith(NewMockDao(nil), gx, testClock())

	// No corp id, no fog/tier state passed anywhere near this call — exactly
	// what a freshly spawned corporation's very first read looks like from
	// this function's point of view.
	gates, err := svc.LaneGates(context.Background(), "sys_0_0")
	if err != nil {
		t.Fatalf("LaneGates: %v", err)
	}
	for _, g := range gates {
		if g.LaneId == "" {
			t.Fatalf("gate to %q served with an empty laneId — a fresh corporation with zero charted lanes must "+
				"still receive a usable laneId (system-interior \"Lane-Gate Bodies Carry Their Lane Id\": \"a "+
				"fresh corporation with no charted lanes still receives a usable laneId on every gate body it "+
				"reads\")", g.DestSystemId)
		}
	}
}

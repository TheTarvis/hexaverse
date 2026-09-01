package system

import (
	"context"
	"testing"

	"hexaverse/board"
	"hexaverse/galaxy"
)

// threeSystemGalaxy: sys-0 at the origin with two lanes — east to sys-e, north to
// sys-n — plus an unconnected sys-x, so LaneGates must key off lanes, not systems.
func threeSystemGalaxy() *galaxy.GeneratedGalaxy {
	return &galaxy.GeneratedGalaxy{
		Systems: []galaxy.System{
			{Id: "sys-0", Coords: galaxy.Coords{X: 0, Y: 0}},
			{Id: "sys-e", Coords: galaxy.Coords{X: 10, Y: 0}},
			{Id: "sys-n", Coords: galaxy.Coords{X: 0, Y: 10}},
			{Id: "sys-x", Coords: galaxy.Coords{X: -10, Y: -10}},
		},
		Lanes: []galaxy.Lane{
			{Id: "l1", AId: "sys-0", BId: "sys-e"},
			{Id: "l2", AId: "sys-n", BId: "sys-0"}, // reversed endpoints on purpose
		},
	}
}

func TestLaneGates_ProjectsEachLaneToItsRimTile(t *testing.T) {
	gx := &fakeGalaxy{live: threeSystemGalaxy()}
	svc := NewServiceWith(NewMockDao(nil), gx, testClock())

	gates, err := svc.LaneGates(context.Background(), "sys-0", 16)
	if err != nil {
		t.Fatalf("LaneGates: %v", err)
	}
	if len(gates) != 2 {
		t.Fatalf("got %d gates, want 2 (one per lane touching sys-0)", len(gates))
	}
	// Deterministic order by destSystemId: sys-e then sys-n.
	if gates[0].DestSystemId != "sys-e" || gates[1].DestSystemId != "sys-n" {
		t.Fatalf("unexpected order: %+v", gates)
	}
	// Each gate is the same projection the fleet uses to burn to the gate.
	wantE := board.LaneGateCell(0, 0, 10, 0, 16)
	wantN := board.LaneGateCell(0, 0, 0, 10, 16)
	if gates[0].Cell != wantE {
		t.Errorf("east gate = %+v, want %+v", gates[0].Cell, wantE)
	}
	if gates[1].Cell != wantN {
		t.Errorf("north gate = %+v, want %+v", gates[1].Cell, wantN)
	}
	// Both gates sit on the gate ring — the inner edge of the outer band.
	wantRing := board.GateRing(16)
	for _, g := range gates {
		if g.Cell.Ring != wantRing {
			t.Errorf("gate %s at ring %d, want %d", g.DestSystemId, g.Cell.Ring, wantRing)
		}
	}
}

func TestLaneGates_UnknownSystemNotFound(t *testing.T) {
	gx := &fakeGalaxy{live: threeSystemGalaxy()}
	svc := NewServiceWith(NewMockDao(nil), gx, testClock())

	if _, err := svc.LaneGates(context.Background(), "sys-missing", 16); err != ErrNotFound {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// TestChartedGates_KeepsOnlyRumoredOrBetter (DELETED —
// replace-observation-with-sightings tasks.md 1.3) used to prove LaneGates'
// charted-tier filter kept only gates whose neighbour the requester had
// charted. That filter — chartedGates — is deleted outright, not inverted:
// system-interior's own "Charted Lane Gate Filtering" requirement is REMOVED
// by this change (design.md Decision 5), replaced by "Bodies Are Public;
// Ships Are Disclosed" — every lane-gate body now ships unfiltered to every
// authenticated requester. This test asserted the OPPOSITE of that new
// requirement, so it is deleted rather than inverted (test-immutability
// protocol: an authorized change, cause = the spec removed the requirement
// this test pinned — the same protocol handler_test.go's own deleted
// TestGetInterior_LaneGatesFogFilterToCharted documents for the sibling
// behavioral test).

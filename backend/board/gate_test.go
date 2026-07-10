package board

import "testing"

// Determinism against the TS mirror is covered by the golden fixtures
// (fixtures_test.go / lib/hex fixtures.test.ts). These are focused shape checks.

func TestLaneGateHex_SitsOnTheRim(t *testing.T) {
	for _, nb := range [][2]float64{{100, 0}, {0, 100}, {-100, 0}, {0, -100}, {70, 70}} {
		gate := LaneGateHex(0, 0, nb[0], nb[1], 16)
		if Ring(gate) != 16 {
			t.Fatalf("neighbour %v: gate %v not on ring 16 (ring %d)", nb, gate, Ring(gate))
		}
	}
}

func TestLaneGateHex_EastNeighbourFavoursPositiveQ(t *testing.T) {
	gate := LaneGateHex(0, 0, 100, 0, 16)
	if gate.Q <= 0 || abs(gate.Q) < abs(gate.R) {
		t.Fatalf("due-east neighbour should map to a +q-dominant rim tile, got %v", gate)
	}
}

func TestLaneGateHex_TranslationInvariant(t *testing.T) {
	// Same relative bearing from two different origins → same gate.
	a := LaneGateHex(0, 0, 50, 20, 16)
	b := LaneGateHex(10, -5, 60, 15, 16)
	if a != b {
		t.Fatalf("expected translation invariance, got %v vs %v", a, b)
	}
}

func TestLaneGateHex_DegenerateRadius(t *testing.T) {
	if got := LaneGateHex(0, 0, 100, 0, 0); got != (Hex{0, 0}) {
		t.Fatalf("radius 0 should degenerate to the core, got %v", got)
	}
}

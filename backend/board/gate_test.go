package board

import "testing"

// Determinism against the TS mirror is covered by the golden fixtures
// (fixtures_test.go / lib/hex fixtures.test.ts). These are focused shape checks.

func TestLaneGateHex_SitsOnTheGateRing(t *testing.T) {
	want := GateRing(16) // inner edge of the outer band, 3 rings in from the rim
	if want != 13 {
		t.Fatalf("GateRing(16) = %d, want 13", want)
	}
	for _, nb := range [][2]float64{{100, 0}, {0, 100}, {-100, 0}, {0, -100}, {70, 70}} {
		gate := LaneGateHex(0, 0, nb[0], nb[1], 16)
		if Ring(gate) != want {
			t.Fatalf("neighbour %v: gate %v not on gate ring %d (ring %d)", nb, gate, want, Ring(gate))
		}
	}
}

func TestGateRing_ClampsSmallBoards(t *testing.T) {
	for _, tc := range []struct{ radius, want int }{{16, 13}, {6, 3}, {4, 1}, {3, 1}, {1, 1}} {
		if got := GateRing(tc.radius); got != tc.want {
			t.Fatalf("GateRing(%d) = %d, want %d", tc.radius, got, tc.want)
		}
	}
}

func TestLaneGateHex_EastNeighbourFavoursPositiveQ(t *testing.T) {
	gate := LaneGateHex(0, 0, 100, 0, 16)
	if gate.Q <= 0 || abs(gate.Q) < abs(gate.R) {
		t.Fatalf("due-east neighbour should map to a +q-dominant gate tile, got %v", gate)
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

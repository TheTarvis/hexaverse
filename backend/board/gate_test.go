package board

import (
	"testing"
)

func TestGateRing(t *testing.T) {
	cases := []struct{ radius, want int }{
		{16, 13}, {6, 3}, {4, 1}, {3, 1}, {1, 1}, {0, 1},
	}
	for _, c := range cases {
		if got := GateRing(c.radius); got != c.want {
			t.Errorf("GateRing(%d) = %d, want %d", c.radius, got, c.want)
		}
	}
}

func TestLaneGateCell(t *testing.T) {
	// A non-positive radius degenerates to the core.
	if got := LaneGateCell(0, 0, 10, 10, 0); got != (Cell{Ring: 0, Slot: 0}) {
		t.Errorf("radius 0: %v, want core", got)
	}

	// The gate lies on the gate ring for any bearing.
	for _, c := range []struct{ nbX, nbY float64 }{{100, 8.7}, {-8.7, 100}, {-77, -64}, {8.7, -100}} {
		got := LaneGateCell(0, 0, c.nbX, c.nbY, 16)
		if got.Ring != GateRing(16) {
			t.Errorf("gate for bearing (%v,%v) on ring %d, want %d", c.nbX, c.nbY, got.Ring, GateRing(16))
		}
	}

	// Due-east bearing lands exactly on slot 0 (table angle 0); due "north"
	// (positive y) lands a quarter of the ring around.
	s := Schedule(16)
	slots := s.Slots(GateRing(16))
	if got := LaneGateCell(0, 0, 100, 0, 16); got.Slot != 0 {
		t.Errorf("due-east gate slot %d, want 0", got.Slot)
	}
	if got := LaneGateCell(0, 0, 0, 100, 16); got.Slot != slots/4 {
		t.Errorf("positive-y gate slot %d, want %d (a quarter around)", got.Slot, slots/4)
	}

	// The choice follows the RELATIVE bearing: offsetting self and neighbor
	// together leaves the gate unchanged.
	a := LaneGateCell(0, 0, 100, 8.7, 16)
	b := LaneGateCell(10, -20, 110, -11.3, 16)
	if a != b {
		t.Errorf("translated bearing changed the gate: %v vs %v", a, b)
	}

	// An exact dot-product tie resolves to the LOWER slot index. On a
	// radius-4 board the gate ring is ring 1 (6 slots), whose pinned entries
	// for slots 1 and 2 are exact mirrors (±32768, 56756): a straight-up
	// bearing (0, 100) gives both the identical maximal dot product, and the
	// argmax must keep slot 1.
	pts := tablePoints(Schedule(4).Slots(GateRing(4)))
	if pts[1][1] != pts[2][1] || pts[1][0] != -pts[2][0] {
		t.Fatalf("ring-1 table entries lost their mirror symmetry: %v vs %v — pick a new tie case", pts[1], pts[2])
	}
	if got := LaneGateCell(0, 0, 0, 100, 4); got != (Cell{Ring: 1, Slot: 1}) {
		t.Errorf("tied bearing gate %v, want the lower slot {1 1}", got)
	}
}

package polar

import "testing"

func TestNormalizeSlot_WrapsBothDirections(t *testing.T) {
	cases := []struct{ slot, slots, want int }{
		{-1, 24, 23}, // wraps from the top of the ring
		{25, 24, 1},  // wraps from the bottom
		{0, 24, 0},
		{24, 24, 0},
		{-25, 24, 23},
		{7, 1, 0}, // the core: every index is the one cell
	}
	for _, c := range cases {
		if got := NormalizeSlot(c.slot, c.slots); got != c.want {
			t.Errorf("NormalizeSlot(%d, %d) = %d, want %d", c.slot, c.slots, got, c.want)
		}
	}
}

func TestCanon(t *testing.T) {
	s := tight6(t)
	cases := []struct{ in, want Cell }{
		{Cell{0, 3}, Cell{0, 0}},   // the core collapses its slot index
		{Cell{-2, 5}, Cell{0, 0}},  // negative rings are the core
		{Cell{2, 13}, Cell{2, 1}},  // slot wraps onto ring 2's 12 slots
		{Cell{2, -1}, Cell{2, 11}}, // and from below
		{Cell{4, 7}, Cell{4, 7}},   // already canonical
	}
	for _, c := range cases {
		if got := canon(c.in, s); got != c.want {
			t.Errorf("canon(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

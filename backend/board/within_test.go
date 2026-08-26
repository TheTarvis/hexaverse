package board

import (
	"testing"

	"hexaverse/polar"
)

// tasks.md 1.3 / design.md Decision 6: board.Within(center, radius, sched) does
// not exist yet — it is the bounded form of the BFS board.Distance already
// runs. Pinned by exact equivalence to Distance over a bounded sweep, per
// design.md: "Within(c, r, s) == {x : Distance(c, x, s) ≤ r}". Go-only (no TS
// mirror, no fixture family — mirror-map.json's goOnly list per design.md), so
// this table-driven test is the sole pin on its correctness.
//
// The sweep spans maxRing=9 so it crosses the 2, 3, 5, and 9 doubling
// boundaries (board.DoubleAt()), not just a single uniform band.

func allCells(s polar.Schedule) []Cell {
	out := []Cell{{Ring: 0, Slot: 0}}
	for ring := 1; ring <= s.MaxRing; ring++ {
		for slot := 0; slot < s.Slots(ring); slot++ {
			out = append(out, Cell{Ring: ring, Slot: slot})
		}
	}
	return out
}

// bruteForceWithin computes the reference set by calling the already-tested
// Distance once per candidate cell — the O(cells) implementation Within is
// meant to replace on the hot path, kept here purely as ground truth for a
// small bounded sweep.
func bruteForceWithin(center Cell, radius int, s polar.Schedule, universe []Cell) map[Cell]bool {
	out := map[Cell]bool{}
	for _, c := range universe {
		if Distance(center, c, s) <= radius {
			out[c] = true
		}
	}
	return out
}

func TestWithin_EqualsDistanceLessThanOrEqualRadius(t *testing.T) {
	s := sched(t, 9)
	universe := allCells(s)

	centers := []Cell{
		{Ring: 0, Slot: 0},
		{Ring: 1, Slot: 0},
		{Ring: 3, Slot: 5},  // just past the ring-3 doubling boundary
		{Ring: 5, Slot: 10}, // just past the ring-5 doubling boundary
		{Ring: 9, Slot: 40}, // the outermost ring in this sweep
	}
	radii := []int{0, 1, 2, 3, 5, 9}

	for _, c := range centers {
		for _, r := range radii {
			want := bruteForceWithin(c, r, s, universe)
			got := Within(c, r, s)
			if len(got) != len(want) {
				t.Errorf("center %v radius %d: Within has %d cells, Distance-derived set has %d",
					c, r, len(got), len(want))
			}
			for cell := range want {
				if !got[cell] {
					t.Errorf("center %v radius %d: cell %v is within radius by Distance but missing from Within", c, r, cell)
				}
			}
			for cell := range got {
				if !want[cell] {
					t.Errorf("center %v radius %d: cell %v is in Within but Distance to it exceeds the radius", c, r, cell)
				}
			}
		}
	}
}

// A radius-0 disc is exactly the canonical center cell — the degenerate case
// worth pinning on its own since it is the cheapest possible call.
func TestWithin_ZeroRadiusIsJustTheCenter(t *testing.T) {
	s := sched(t, 6)
	c := Cell{Ring: 3, Slot: 2}
	got := Within(c, 0, s)
	if len(got) != 1 || !got[Canon(c, s)] {
		t.Fatalf("Within(c, 0, s) = %v, want exactly {%v}", got, Canon(c, s))
	}
}

// A radius covering the whole board must return every cell in the schedule —
// bounds Within's upper end against the same universe enumeration.
func TestWithin_LargeRadiusCoversEntireBoard(t *testing.T) {
	s := sched(t, 5)
	universe := allCells(s)
	got := Within(Cell{Ring: 0, Slot: 0}, 999, s)
	if len(got) != len(universe) {
		t.Fatalf("Within with an oversized radius returned %d cells, want the whole board's %d", len(got), len(universe))
	}
}

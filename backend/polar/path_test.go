package polar

import (
	"reflect"
	"testing"
)

func TestArcPath_HandCases(t *testing.T) {
	s := tight6(t)
	cases := []struct {
		name     string
		from, to Cell
		want     []Cell
	}{
		{
			// N = max(2, |Δring|=1, sweep=0) = 2; i=1 interpolates ring 1.5 —
			// the exact ring tie — and rounds toward the destination ring (2).
			"ring tie rounds toward the destination",
			Cell{1, 0}, Cell{2, 0},
			[]Cell{{1, 0}, {2, 0}},
		},
		{
			// i=1: ring 1.5 → 2 (tie toward destination); angle 1/24 turn on
			// ring 2 (12 slots) = slot 0.5 — the exact angular slot tie — and
			// the sweep travels toward increasing slots, so slot 1.
			"angular slot tie resolves in the sweep's direction",
			Cell{1, 0}, Cell{2, 1},
			[]Cell{{1, 0}, {2, 1}},
		},
		{
			// Half a turn on ring 1 (6 slots): sweep is exactly 3 of 6 — tie
			// rule 3 — always the increasing-slot-index direction.
			"half-turn sweep goes increasing",
			Cell{1, 0}, Cell{1, 3},
			[]Cell{{1, 0}, {1, 1}, {1, 2}, {1, 3}},
		},
		{
			// Half a turn again, from slot 4: still increasing, through the wrap.
			"half-turn sweep goes increasing through the wrap",
			Cell{1, 4}, Cell{1, 1},
			[]Cell{{1, 4}, {1, 5}, {1, 0}, {1, 1}},
		},
		{
			// Purely radial descent to the core; the ring-1 sample's angle
			// (1/12 turn) is exactly between ring-1 slots 0 and 1 — the
			// zero-sweep tie — and resolves to the HIGHER candidate.
			"zero-sweep tie resolves to the higher slot",
			Cell{2, 1}, Cell{0, 0},
			[]Cell{{2, 1}, {1, 1}, {0, 0}},
		},
		{
			// Same tie at the wrap: 11/12 turn is exactly between ring-1 slot
			// 5 and slot 6≡0; the higher candidate before normalization is 6,
			// which normalizes to slot 0 — never the ring's last slot.
			"zero-sweep tie at the wrap resolves to slot 0",
			Cell{2, 11}, Cell{0, 0},
			[]Cell{{2, 11}, {1, 0}, {0, 0}},
		},
		{
			// Departure FROM the core follows the destination's bearing.
			"core departure is purely radial",
			Cell{0, 0}, Cell{3, 5},
			[]Cell{{0, 0}, {1, 1}, {2, 3}, {3, 5}},
		},
		{
			// design.md's minimal repro for the mean-ring undersampling bug:
			// mean-ring emitted 1:0 → 2:1 → 2:2 → 3:5 → 3:7 (a 2-slot jump on
			// ring 3); finest-ring sampling (N = 7, the sweep in ring-3 slot
			// units) keeps every consecutive pair adjacent.
			"coarse inner ring to fine outer ring, finest-ring sampled",
			Cell{1, 0}, Cell{3, 7},
			[]Cell{{1, 0}, {2, 1}, {2, 2}, {2, 3}, {3, 6}, {3, 7}},
		},
		{
			"coincident endpoints yield the single cell",
			Cell{4, 7}, Cell{4, 7},
			[]Cell{{4, 7}},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ArcPath(c.from, c.to, s)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("ArcPath(%v, %v) = %v, want %v", c.from, c.to, got, c.want)
			}
		})
	}
}

// The exhaustive property sweep: over every ordered pair of cells with rings
// in [0, 10] under two schedules, every emitted path is endpoint-inclusive,
// every consecutive pair is adjacent (the finest-ring sampling clause's whole
// point), a same-ring transfer never leaves its ring, and no path touches
// the core unless an endpoint IS the core.
func TestArcPath_PropertiesExhaustive(t *testing.T) {
	schedules := map[string]Schedule{
		"tight6":     NewBandedSchedule(6, []int{2, 3, 5, 9, 17}, 20),
		"balanced12": NewBandedSchedule(12, []int{3, 5, 9, 17}, 20),
	}
	const maxRing = 10
	for name, s := range schedules {
		t.Run(name, func(t *testing.T) {
			for fr := 0; fr <= maxRing; fr++ {
				for fs := range s.Slots(fr) {
					for tr := 0; tr <= maxRing; tr++ {
						for ts := range s.Slots(tr) {
							from, to := Cell{fr, fs}, Cell{tr, ts}
							path := ArcPath(from, to, s)
							if path[0] != canon(from, s) || path[len(path)-1] != canon(to, s) {
								t.Fatalf("ArcPath(%v, %v) endpoints wrong: %v", from, to, path)
							}
							for i := 1; i < len(path); i++ {
								if path[i] == path[i-1] {
									t.Fatalf("ArcPath(%v, %v) emits consecutive duplicate at %d: %v", from, to, i, path)
								}
								if !IsAdjacent(path[i-1], path[i], s) {
									t.Fatalf("ArcPath(%v, %v) non-adjacent step %v → %v in %v", from, to, path[i-1], path[i], path)
								}
								if fr == tr && path[i].Ring != fr {
									t.Fatalf("ArcPath(%v, %v) same-ring transfer left its ring: %v", from, to, path)
								}
								if path[i].Ring == 0 && fr != 0 && tr != 0 {
									t.Fatalf("ArcPath(%v, %v) crossed the core without a core endpoint: %v", from, to, path)
								}
							}
						}
					}
				}
			}
		})
	}
}

// A core-endpoint path sweeps no angle: every cell lies on the non-core
// endpoint's bearing to within half of its own ring's cell width. In exact
// terms, for a cell (R, k) against bearing a (in 1/L turns):
// |k/S − a/L| ≤ 1/(2S)  ⇔  |2(kL − aS)| ≤ L·(with everything in 1/(S·L)
// turn units) — integers only, no float in the assertion either.
func TestArcPath_CoreBearingWithinHalfCellWidth(t *testing.T) {
	s := tight6(t)
	const maxRing = 10
	for ring := 1; ring <= maxRing; ring++ {
		for slot := range s.Slots(ring) {
			target := Cell{ring, slot}
			l := int64(s.Slots(ring))
			bearing := int64(slot) // in 1/L turns
			for _, path := range [][]Cell{ArcPath(Cell{0, 0}, target, s), ArcPath(target, Cell{0, 0}, s)} {
				for _, c := range path {
					if c.Ring == 0 {
						continue
					}
					sc := int64(s.Slots(c.Ring))
					// distance in 1/(S·L)-turn units, wrapped shorter-way
					diff := normalizeSlot64(int64(c.Slot)*l-bearing*sc, sc*l)
					diff = min(diff, sc*l-diff)
					if 2*diff > l {
						t.Fatalf("cell %v off the bearing of %v by %d/(2·%d·%d) > half its cell width (path %v)",
							c, target, 2*diff, sc, l, path)
					}
				}
			}
		}
	}
}

// The sample count is measured against the finest ring spanned, not the mean
// ring: {1,0}→{3,7} under tight6 needs N = 7 (the sweep in ring-3 slot
// units); a mean-ring count (max(2, Δring=2, sweep on ring 2 = 3.5→4) = 4)
// would undersample the outer portion. The hand case above pins the exact
// path; this pins that the two counts genuinely differ for that input, so
// the scenario can't silently pass under a mean-ring implementation.
func TestArcPath_FinestRingCountDiffersFromMeanRing(t *testing.T) {
	s := tight6(t)
	path := ArcPath(Cell{1, 0}, Cell{3, 7}, s)
	// 6 distinct cells ⇒ at least 6 samples resolved distinctly; the
	// mean-ring N=4 yields at most 5 emitted cells (N+1 samples).
	if len(path) < 6 {
		t.Fatalf("finest-ring sampling should emit ≥ 6 cells for {1,0}→{3,7}, got %v", path)
	}
	for i := 1; i < len(path); i++ {
		if !IsAdjacent(path[i-1], path[i], s) {
			t.Fatalf("non-adjacent step %v → %v", path[i-1], path[i])
		}
	}
}

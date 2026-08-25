package polar

import (
	"math"
	"testing"
)

func TestIsAdjacent_HandCases(t *testing.T) {
	s := tight6(t)
	cases := []struct {
		name string
		a, b Cell
		want bool
	}{
		{"consecutive slots on one ring", Cell{5, 3}, Cell{5, 4}, true},
		{"consecutive slots across the wrap", Cell{5, 47}, Cell{5, 0}, true},
		{"same cell", Cell{5, 3}, Cell{5, 3}, true},
		{"two slots apart on one ring", Cell{5, 3}, Cell{5, 5}, false},
		{"two rings apart, any slot", Cell{3, 0}, Cell{5, 0}, false},
		{"the core and any ring-1 cell", Cell{0, 0}, Cell{1, 4}, true},
		{"the core and a ring-2 cell", Cell{0, 0}, Cell{2, 0}, false},
		{"corner contact within a band", Cell{6, 0}, Cell{7, 1}, true},
		{"doubling boundary, directly faced fine cell", Cell{4, 0}, Cell{5, 0}, true},
		{"doubling boundary, adjacent under loose and true corner contact", Cell{4, 0}, Cell{5, 1}, true},
		// The loose-vs-true fork (design.md Open Questions): g = 2 in ring-5
		// units is within one coarse (ring-4) cell width, so the spike's own
		// predicate — and this faithful restatement — counts it adjacent,
		// though the cells do not geometrically touch (true corner contact
		// would bound g ≤ 1.5). Recorded on the loose side deliberately.
		{"doubling boundary, adjacent only under the loose predicate", Cell{4, 0}, Cell{5, 2}, true},
		{"doubling boundary, beyond one coarse cell width", Cell{4, 0}, Cell{5, 3}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := IsAdjacent(c.a, c.b, s); got != c.want {
				t.Errorf("IsAdjacent(%v, %v) = %v, want %v", c.a, c.b, got, c.want)
			}
			if got := IsAdjacent(c.b, c.a, s); got != c.want {
				t.Errorf("IsAdjacent(%v, %v) = %v, want %v (symmetry)", c.b, c.a, got, c.want)
			}
		})
	}
}

// spikeIsAdjacent is a Go transcription of the spike's float predicate
// (frontend/app/spike/polar-board/polar.ts isAdjacent), * 1.01 fudge
// included. Test-only: floats are barred from the production surface, and
// this exists precisely to verify the integer restatement reproduces the
// float original — the fudge was covering float error and nothing else.
func spikeIsAdjacent(a, b Cell, s Schedule) bool {
	dr := a.Ring - b.Ring
	if dr < 0 {
		dr = -dr
	}
	if dr > 1 {
		return false
	}
	if a.Ring == 0 || b.Ring == 0 {
		return true
	}
	tau := 2 * math.Pi
	angle := func(c Cell) float64 { return tau * float64(c.Slot) / float64(s.Slots(c.Ring)) }
	shortWay := func(d float64) float64 {
		for d > math.Pi {
			d -= tau
		}
		for d <= -math.Pi {
			d += tau
		}
		return d
	}
	coarser := min(s.Slots(a.Ring), s.Slots(b.Ring))
	gap := math.Abs(shortWay(angle(a) - angle(b)))
	return gap <= (tau/float64(coarser))*1.01
}

// The integer predicate reproduces the spike's float predicate on every
// ±1-ring ordered pair, rings 0–17, under all three of the spike's preset
// schedules — the fudge-removal is a faithful restatement, not a narrowing.
func TestIsAdjacent_ReproducesSpikeFloatPredicate(t *testing.T) {
	schedules := map[string]Schedule{
		"Isotropic":   NewBandedSchedule(6, []int{2, 3, 5, 9, 17}, 18),
		"Balanced":    NewBandedSchedule(12, []int{3, 5, 9, 17}, 18),
		"Inner-dense": NewBandedSchedule(24, []int{5, 13}, 18),
	}
	for name, s := range schedules {
		t.Run(name, func(t *testing.T) {
			pairs := 0
			for ra := 0; ra <= 17; ra++ {
				for sa := range s.Slots(ra) {
					for rb := max(0, ra-1); rb <= ra+1 && rb <= 17; rb++ {
						for sb := range s.Slots(rb) {
							a, b := Cell{ra, sa}, Cell{rb, sb}
							pairs++
							if got, want := IsAdjacent(a, b, s), spikeIsAdjacent(a, b, s); got != want {
								t.Fatalf("disagreement at %v vs %v: integer %v, spike float %v", a, b, got, want)
							}
						}
					}
				}
			}
			t.Logf("%s: %d ±1-ring ordered pairs, zero disagreements", name, pairs)
		})
	}
}

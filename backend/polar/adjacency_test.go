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
		// The fork closed tight (2026-08-25): g = 2 in ring-5 units was
		// within one coarse (ring-4) cell width, so the loose predicate
		// counted this pair adjacent — but the cells do not geometrically
		// touch (true corner contact bounds 2g ≤ 3). A phantom neighbor,
		// now rejected.
		{"doubling boundary, phantom neighbor rejected under true corner contact", Cell{4, 0}, Cell{5, 2}, false},
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
// included. Test-only: floats are barred from the production surface. It
// survives the 2026-08-25 tightening as the loose reference: the tight
// predicate must disagree with it on EXACTLY the doubling-boundary phantom
// pairs (doubled-index separation of 2) and nowhere else.
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

// phantomGap reports the doubled-index separation g (in finer-ring units)
// and whether the pair straddles a doubling boundary — the tight predicate's
// disagreement with the loose spike predicate is exactly `boundary && g == 2`.
func phantomGap(a, b Cell, s Schedule) (g int64, boundary bool) {
	sa, sb := int64(s.Slots(a.Ring)), int64(s.Slots(b.Ring))
	d := max(sa, sb)
	pa := int64(a.Slot) * (d / sa)
	pb := int64(b.Slot) * (d / sb)
	g = ((pa-pb)%d + d) % d
	g = min(g, d-g)
	return g, sa != sb
}

// The tight predicate narrows the spike's float predicate by EXACTLY the
// doubling-boundary phantom pairs (doubled-index separation of 2, half a
// fine cell of empty lattice between them) — and agrees everywhere else, on
// every ±1-ring ordered pair, rings 0–17, under all three of the spike's
// preset schedules. This pins that the tightening is the surgical change the
// spec describes, not a broader narrowing.
func TestIsAdjacent_NarrowsSpikePredicateByExactlyThePhantoms(t *testing.T) {
	schedules := map[string]Schedule{
		"Isotropic":   NewBandedSchedule(6, []int{2, 3, 5, 9, 17}, 18),
		"Balanced":    NewBandedSchedule(12, []int{3, 5, 9, 17}, 18),
		"Inner-dense": NewBandedSchedule(24, []int{5, 13}, 18),
	}
	for name, s := range schedules {
		t.Run(name, func(t *testing.T) {
			pairs, phantoms := 0, 0
			for ra := 0; ra <= 17; ra++ {
				for sa := range s.Slots(ra) {
					for rb := max(0, ra-1); rb <= ra+1 && rb <= 17; rb++ {
						for sb := range s.Slots(rb) {
							a, b := Cell{ra, sa}, Cell{rb, sb}
							pairs++
							got, loose := IsAdjacent(a, b, s), spikeIsAdjacent(a, b, s)
							if a.Ring > 0 && b.Ring > 0 {
								if g, boundary := phantomGap(a, b, s); boundary && g == 2 {
									phantoms++
									if got || !loose {
										t.Fatalf("phantom pair %v vs %v: tight %v (want false), loose %v (want true)", a, b, got, loose)
									}
									continue
								}
							}
							if got != loose {
								t.Fatalf("non-phantom disagreement at %v vs %v: tight %v, loose %v", a, b, got, loose)
							}
						}
					}
				}
			}
			if phantoms == 0 {
				t.Fatal("sweep found no phantom pairs — the boundary domain was not exercised")
			}
			t.Logf("%s: %d ±1-ring ordered pairs, %d phantom pairs rejected, zero other disagreements", name, pairs, phantoms)
		})
	}
}

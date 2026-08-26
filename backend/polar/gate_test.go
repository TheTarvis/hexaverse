package polar

import (
	"math/rand"
	"testing"
)

// Gate 1 of the adjacency-fork closure (rewrite-board-on-polar-lattice,
// tasks.md 1.5): the exhaustive path sweeps re-run under the TIGHT corner-
// contact predicate — four structurally distinct schedules, every ordered
// pair at maxRing 10 — plus the 10^6 random-path harness at maxRing 20 the
// archived change's round-2 adversarial verification used, asserting zero
// non-adjacent consecutive pairs. The stitched ArcPath must hold this
// unconditionally; a single failure re-opens the fork (design.md fallback:
// re-cut loose).
func TestArcPath_Gate1_TightAdjacencySweeps(t *testing.T) {
	schedules := map[string]Schedule{
		"isotropic6":  NewBandedSchedule(6, []int{2, 3, 5, 9, 17}, 20),
		"balanced12":  NewBandedSchedule(12, []int{3, 5, 9, 17}, 20),
		"innerdense":  NewBandedSchedule(24, []int{5, 13}, 20),
		"lateDoubles": NewBandedSchedule(6, []int{9, 10}, 20), // adjacent boundaries
	}
	const maxRing = 10
	total := 0
	for name, s := range schedules {
		if err := s.Validate(); err != nil {
			t.Fatalf("%s invalid: %v", name, err)
		}
		for fr := 0; fr <= maxRing; fr++ {
			for fs := range s.Slots(fr) {
				for tr := 0; tr <= maxRing; tr++ {
					for ts := range s.Slots(tr) {
						path := ArcPath(Cell{fr, fs}, Cell{tr, ts}, s)
						total++
						for i := 1; i < len(path); i++ {
							if !IsAdjacent(path[i-1], path[i], s) {
								t.Fatalf("%s: ArcPath(%v, %v) non-adjacent step %v → %v under the tight predicate: %v",
									name, Cell{fr, fs}, Cell{tr, ts}, path[i-1], path[i], path)
							}
						}
					}
				}
			}
		}
	}
	t.Logf("gate 1 exhaustive: %d paths across %d schedules, zero non-adjacent pairs", total, len(schedules))

	if testing.Short() {
		t.Log("gate 1 random harness skipped in -short mode (run without -short for the full gate)")
		return
	}
	// The 10^6 random-path harness at maxRing 20 (seeded — reproducible).
	s := schedules["isotropic6"]
	rng := rand.New(rand.NewSource(20260825))
	randomCell := func() Cell {
		ring := rng.Intn(21)
		return Cell{Ring: ring, Slot: rng.Intn(s.Slots(ring))}
	}
	for range 1_000_000 {
		from, to := randomCell(), randomCell()
		path := ArcPath(from, to, s)
		for i := 1; i < len(path); i++ {
			if !IsAdjacent(path[i-1], path[i], s) {
				t.Fatalf("random harness: ArcPath(%v, %v) non-adjacent step %v → %v", from, to, path[i-1], path[i])
			}
		}
	}
	t.Log("gate 1 random harness: 1,000,000 paths at maxRing 20, zero non-adjacent pairs")
}

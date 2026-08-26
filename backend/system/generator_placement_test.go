package system

import (
	"testing"

	"hexaverse/board"
)

// system-interior, MODIFIED requirement "Lazy, Deterministic Interior
// Generation" — new scenario "Placement reaches every slot on a ring whose
// slot count exceeds six times its ring index" (tasks.md 2.4's two-sided
// property test).
//
// THE HAZARD this guards against: under hex every ring had exactly 6×ring
// cells, so a generator still drawing `r.Intn(6*ring)` would pass any
// ONE-SIDED "slot < Slots(ring)" assertion on rings 3, 5, 9, 15 too — because
// 6*ring < Slots(ring) there. Only observing slots reaching AT OR ABOVE
// 6*ring on one of those rings proves the draw is actually using the live
// schedule's full slot count, not the retired fixed count. Rings 1, 2, 4, 8,
// 16, 32 are coincidence points (Slots(ring) == 6*ring there) and are
// deliberately never used to source this proof.
func TestGenerate_Scenario_PlacementReachesEverySlotOnNonCoincidenceRings(t *testing.T) {
	params := DefaultParams()
	sched := board.Schedule(params.Radius)

	nonCoincidenceRings := map[int]bool{}
	for _, ring := range []int{3, 5, 9, 15} {
		if ring <= sched.MaxRing && sched.Slots(ring) > 6*ring {
			nonCoincidenceRings[ring] = true
		}
	}
	if len(nonCoincidenceRings) == 0 {
		t.Fatalf("fixture: expected at least one of rings 3/5/9/15 to satisfy Slots(ring) > 6*ring under board radius %d", params.Radius)
	}

	// seenBelowOldBound / seenAtOrAboveOldBound record, per ring, whether any
	// observed slot fell below 6*ring (routine) and whether any fell AT OR
	// ABOVE it (the property under test).
	atOrAbove := map[int]bool{}
	belowBound := map[int]bool{}
	maxSeenSlot := map[int]int{}

	observe := func(ring, slot int) {
		if !nonCoincidenceRings[ring] {
			return
		}
		if slot >= 6*ring {
			atOrAbove[ring] = true
		} else {
			belowBound[ring] = true
		}
		if slot > maxSeenSlot[ring] {
			maxSeenSlot[ring] = slot
		}
	}

	const seeds = 4000
	for seed := int64(0); seed < seeds; seed++ {
		g := Generate(seed, "star_rich", sampleSkeleton(), params)
		for _, f := range g.Features {
			if f.Orbit == nil {
				continue
			}
			observe(f.Orbit.Ring, f.Orbit.Angle0)
			// Two-sided upper bound too: never a slot the live schedule doesn't
			// have (this is the retained hazard guard — a one-sided upper-bound
			// check alone proves nothing, but it must still hold).
			if f.Orbit.Angle0 < 0 || f.Orbit.Angle0 >= sched.Slots(f.Orbit.Ring) {
				t.Fatalf("seed %d: feature %s ring %d slot %d is outside [0, %d)",
					seed, f.Id, f.Orbit.Ring, f.Orbit.Angle0, sched.Slots(f.Orbit.Ring))
			}
		}
		// Belt footprints also draw from the ring's live slot count.
		for _, f := range g.Features {
			if f.Type != FeatureBelt {
				continue
			}
			for _, c := range f.Footprint {
				observe(c.Ring, c.Slot)
			}
		}
	}

	provenAny := false
	for ring := range nonCoincidenceRings {
		if atOrAbove[ring] {
			provenAny = true
			t.Logf("ring %d (6*ring=%d, Slots=%d): observed slots reached %d, at/above the old bound", ring, 6*ring, sched.Slots(ring), maxSeenSlot[ring])
		}
	}
	if !provenAny {
		t.Fatalf("across %d seeds, no non-coincidence ring (%v) ever drew a slot at or above 6*ring — "+
			"a generator still drawing r.Intn(6*ring) would pass this test's absence, which is exactly the bug this scenario guards against",
			seeds, nonCoincidenceRings)
	}
}

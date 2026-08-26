package common_test

// tasks.md 1.8 / system-interior "Orbital Period Read from Live Tuning" —
// scenario "Equal-period rings with different slot counts advance slots at
// different rates". Declared `package common_test` (not `common`) because
// `board` and `polar` both import `common`, so an internal `package common`
// test cannot import either to ask the live schedule — this is the file that
// replaces the retired uniformity assertion in tuning_test.go (see that
// file's comment for the retirement note).
//
// The assertion reads every slot count from board.Schedule(...); it never
// hard-codes 6×ring or any other literal. It samples ring 3 and ring 5 —
// both non-coincidence rings, where Slots(ring) != 6×ring (ring 3 has 24
// slots, not 18; ring 5 has 48, not 30) — never rings 1, 2, 4, 8, 16, or 32,
// which coincidentally still satisfy 6×ring and would pass even with the
// retired hex-uniformity law still in place.

import (
	"testing"

	"hexaverse/board"
	"hexaverse/common"
)

// TestOrbitPeriod_PerSlotCadenceIsNotUniformAcrossBands proves the accepted
// consequence named in system-interior: two rings whose PeriodFor(ring)
// values are close (or whose ratio is a clean small number) still advance one
// slot at materially different rates once their slot counts differ, because
// the polar schedule's slot width is not a uniform 6×ring everywhere.
func TestOrbitPeriod_PerSlotCadenceIsNotUniformAcrossBands(t *testing.T) {
	tuning := common.DefaultTuning()
	sched := board.Schedule(tuning.BoardRadius)

	const ringA = 3 // 24 slots, not 6*3=18 — a non-coincidence ring
	const ringB = 5 // 48 slots, not 6*5=30 — a non-coincidence ring
	if ringA >= sched.MaxRing || ringB >= sched.MaxRing {
		t.Fatalf("fixture: board radius %d too small to reach rings %d/%d", tuning.BoardRadius, ringA, ringB)
	}
	if sched.Slots(ringA) == 6*ringA || sched.Slots(ringB) == 6*ringB {
		t.Fatalf("fixture: rings %d/%d must be genuine non-coincidence rings (Slots != 6×ring) for this test to prove anything — got Slots(%d)=%d, Slots(%d)=%d",
			ringA, ringB, ringA, sched.Slots(ringA), ringB, sched.Slots(ringB))
	}

	periodA := tuning.OrbitPeriod(ringA)
	periodB := tuning.OrbitPeriod(ringB)

	// World-ms required to advance exactly one slot on each ring: period / slots.
	perSlotA := float64(periodA) / float64(sched.Slots(ringA))
	perSlotB := float64(periodB) / float64(sched.Slots(ringB))

	if perSlotA == perSlotB {
		t.Fatalf("per-slot cadence identical between ring %d (%v ms/slot) and ring %d (%v ms/slot) — "+
			"expected them to differ once slot counts stop scaling with 6×ring", ringA, perSlotA, ringB, perSlotB)
	}

	// Sanity: this is not merely "the periods differ" (that would be true even
	// under the retired hex law) — it is specifically that dividing by the
	// SCHEDULE's slot count (not a fixed 6×ring) is what produces the
	// difference. Recompute what the retired hex law would have predicted
	// (uniform OrbitBasePeriod/6 per hex on every ring) and show today's
	// schedule-derived answer diverges from it on at least one of the two
	// rings.
	retiredHexPerCell := float64(tuning.OrbitBasePeriod) / 6.0
	if perSlotA == retiredHexPerCell && perSlotB == retiredHexPerCell {
		t.Fatalf("both rings still match the retired hex-uniform rate %v ms/cell — the schedule-derived divisor is not taking effect", retiredHexPerCell)
	}
}

// TestOrbitPeriod_PerSlotCadence_AcrossManyRingPairs is a broader sweep of the
// same property: for every pair of non-coincidence rings up to the live board
// radius, the per-slot cadence is a genuine function of that ring's OWN slot
// count, read live from board.Schedule — never a literal.
func TestOrbitPeriod_PerSlotCadence_AcrossManyRingPairs(t *testing.T) {
	tuning := common.DefaultTuning()
	sched := board.Schedule(tuning.BoardRadius)

	nonCoincidence := []int{}
	for ring := 1; ring < sched.MaxRing; ring++ {
		if sched.Slots(ring) != 6*ring {
			nonCoincidence = append(nonCoincidence, ring)
		}
	}
	if len(nonCoincidence) < 2 {
		t.Fatalf("fixture: expected at least two non-coincidence rings under board radius %d, found %v", tuning.BoardRadius, nonCoincidence)
	}

	cadence := func(ring int) float64 {
		return float64(tuning.OrbitPeriod(ring)) / float64(sched.Slots(ring))
	}

	distinct := map[float64]bool{}
	for _, ring := range nonCoincidence {
		distinct[cadence(ring)] = true
	}
	if len(distinct) < 2 {
		t.Errorf("per-slot cadence collapsed to a single value %v across the non-coincidence rings %v — expected the schedule's uneven slot widths to produce distinct rates",
			distinct, nonCoincidence)
	}
}

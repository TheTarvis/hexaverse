package board

import (
	"testing"

	"hexaverse/common"
)

// design.md Decision 3 / tasks.md 1.2: board.ProductionSchedule() does not
// exist yet. It must equal Schedule(common.Tuning().BoardRadius), and it must
// be memoized ON THE RADIUS VALUE — so a change to common.Tuning().BoardRadius
// (an admin retune) is observed on the next call, never pinned to whatever
// radius happened to be live the first time anything called it.

func TestProductionSchedule_MatchesScheduleOfLiveBoardRadius(t *testing.T) {
	want := Schedule(common.Tuning().BoardRadius)
	got := ProductionSchedule()
	if got.MaxRing != want.MaxRing {
		t.Fatalf("ProductionSchedule().MaxRing = %d, want %d (Schedule(common.Tuning().BoardRadius))", got.MaxRing, want.MaxRing)
	}
	for ring := 0; ring <= want.MaxRing; ring++ {
		if got.Slots(ring) != want.Slots(ring) {
			t.Errorf("ring %d: ProductionSchedule slots = %d, want %d", ring, got.Slots(ring), want.Slots(ring))
		}
	}
}

// Memoized on the radius VALUE, not called once and cached forever: a retune
// to a different BoardRadius must be observed by the next call.
func TestProductionSchedule_ObservesARadiusChange(t *testing.T) {
	original := common.Tuning()
	t.Cleanup(func() { common.SetTuning(original) })

	small := original
	small.BoardRadius = 6
	common.SetTuning(small)
	got := ProductionSchedule()
	if got.MaxRing != 6 {
		t.Fatalf("after retuning BoardRadius to 6, ProductionSchedule().MaxRing = %d, want 6", got.MaxRing)
	}

	big := original
	big.BoardRadius = 20
	common.SetTuning(big)
	got = ProductionSchedule()
	if got.MaxRing != 20 {
		t.Fatalf("after retuning BoardRadius to 20, ProductionSchedule().MaxRing = %d, want 20 (memoization must key on the radius, not freeze at the first call)", got.MaxRing)
	}
}

// Repeated calls at the SAME radius must agree (the memoization must not
// itself corrupt the schedule — e.g. returning a half-populated Counts slice
// from a racy cache).
func TestProductionSchedule_RepeatedCallsAgree(t *testing.T) {
	a := ProductionSchedule()
	b := ProductionSchedule()
	if a.MaxRing != b.MaxRing {
		t.Fatalf("two calls at the same tuning disagree: %d vs %d", a.MaxRing, b.MaxRing)
	}
	for ring := 0; ring <= a.MaxRing; ring++ {
		if a.Slots(ring) != b.Slots(ring) {
			t.Fatalf("ring %d: repeated ProductionSchedule() calls disagree: %d vs %d", ring, a.Slots(ring), b.Slots(ring))
		}
	}
}

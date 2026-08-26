package board

import (
	"testing"
)

// tasks.md 1.6 / design.md "The coordinate table is not a constraint": every
// slot count `board.Schedule(maxRing)` can ever produce, across every
// maxRing a system could plausibly be generated at, must already be present
// in the pinned coordinate table — the table-family coverage invariant that
// today is guaranteed only by hand-derivation (design.md's own verification:
// the family is exactly [1, 6, 12, 24, 48, 96, 192], and the Isotropic
// schedule's final doubling at ring 17 never doubles again, so no production
// schedule can ever demand a slot count outside it).
//
// Test file only: no production `board` change, no fixture re-record — this
// asserts the CURRENT pinned artifact already covers the family, catching a
// future doubleAt/InnerSlots edit that would silently outrun it.
func TestSchedule_EveryProducibleSlotCountIsInThePinnedTable(t *testing.T) {
	seen := map[int]bool{}
	for maxRing := 0; maxRing <= 200; maxRing++ {
		s := Schedule(maxRing)
		if err := s.Validate(); err != nil {
			t.Fatalf("Schedule(%d) invalid: %v", maxRing, err)
		}
		for ring := 0; ring <= maxRing; ring++ {
			seen[s.Slots(ring)] = true
		}
	}
	if len(seen) == 0 {
		t.Fatal("swept no slot counts at all — test asserts nothing")
	}
	for slots := range seen {
		if !tableHasFamily(t, slots) {
			t.Errorf("slot count %d is producible by board.Schedule but absent from the pinned coordinate table", slots)
		}
	}
}

// tableHasFamily reports whether tablePoints(slots) resolves without panicking
// — tablePoints' own contract is to panic on a slot count outside the pinned
// family (board/table.go), which is exactly the failure this test recovers
// from and reports as a normal (non-fatal-to-the-suite) assertion failure.
func tableHasFamily(t *testing.T, slots int) (ok bool) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			ok = false
			t.Logf("tablePoints(%d) panicked: %v", slots, r)
		}
	}()
	pts := tablePoints(slots)
	return len(pts) == slots
}

// The family itself, pinned exactly (design.md: "the family is exactly
// [1, 6, 12, 24, 48, 96, 192]") — a tighter, literal-valued companion to the
// sweep above, so a family edit shows up as a direct diff, not just a missing
// count somewhere in a 0..200 sweep.
func TestPinnedCoordinateTable_FamilyIsExactly(t *testing.T) {
	want := []int{1, 6, 12, 24, 48, 96, 192}
	for _, slots := range want {
		if !tableHasFamily(t, slots) {
			t.Errorf("pinned family member %d is not loadable from the coordinate table", slots)
		}
	}
	// And nothing produced by the production schedule falls outside this exact
	// list (a stricter form of the sweep above).
	wantSet := map[int]bool{}
	for _, n := range want {
		wantSet[n] = true
	}
	for maxRing := 0; maxRing <= 200; maxRing += 17 { // sample across every band boundary
		s := Schedule(maxRing)
		for ring := 0; ring <= maxRing; ring++ {
			if n := s.Slots(ring); !wantSet[n] {
				t.Errorf("Schedule(%d).Slots(%d) = %d, outside the pinned family %v", maxRing, ring, n, want)
			}
		}
	}
}

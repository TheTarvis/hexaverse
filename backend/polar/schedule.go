package polar

import "fmt"

// Schedule assigns every ring the board uses a positive integer slot count.
// It is a configured parameter, never a hard-coded value — the actual band
// list and inner slot count are Decision 2 of the polar migration handoff and
// remain OPEN; this package validates the structural invariant only.
//
// Counts[ring] is the slot count for ring, for every ring in [0, MaxRing]
// (MaxRing inclusive). The invariant (openspec polar-lattice-math, "Slot
// Schedule Shape"): ring 0 has exactly one slot (the core); every ring ≥ 1
// has at least 2; among rings ≥ 1 the count is constant within a band and
// exactly doubles at each band boundary — so the radial neighbor relation is
// exactly 1:1 or 2:1, never fractional (a naive hex-derived 6N schedule is
// fractional everywhere; see the spike's header comment). The ring-0→ring-1
// step is exempt from the ratio rule.
type Schedule struct {
	MaxRing int   `json:"maxRing"`
	Counts  []int `json:"counts"`
}

// NewBandedSchedule builds the banded schedule the spike parameterizes:
// innerSlots on ring 1, doubling at each ring listed in doubleAt, out to
// maxRing inclusive. It is a constructor convenience; the result must still
// pass Validate (e.g. innerSlots < 2 builds an invalid schedule).
func NewBandedSchedule(innerSlots int, doubleAt []int, maxRing int) Schedule {
	counts := make([]int, maxRing+1)
	if maxRing >= 0 {
		counts[0] = 1
	}
	for ring := 1; ring <= maxRing; ring++ {
		n := innerSlots
		for _, boundary := range doubleAt {
			if ring >= boundary {
				n *= 2
			}
		}
		counts[ring] = n
	}
	return Schedule{MaxRing: maxRing, Counts: counts}
}

// Validate rejects any schedule that breaks the structural invariant. A nil
// error means every ring in [0, MaxRing] has a valid count.
func (s Schedule) Validate() error {
	if s.MaxRing < 0 {
		return fmt.Errorf("schedule maxRing %d is negative", s.MaxRing)
	}
	if len(s.Counts) != s.MaxRing+1 {
		return fmt.Errorf("schedule declares maxRing %d but configures %d ring count(s); every ring in [0, maxRing] must have exactly one configured count", s.MaxRing, len(s.Counts))
	}
	if s.Counts[0] != 1 {
		return fmt.Errorf("ring 0 is the single core cell and must have slot count 1, got %d", s.Counts[0])
	}
	for ring := 1; ring <= s.MaxRing; ring++ {
		if s.Counts[ring] < 2 {
			return fmt.Errorf("ring %d has slot count %d; every ring at or above ring 1 needs at least 2", ring, s.Counts[ring])
		}
	}
	// Among rings ≥ 1: constant within a band, exactly double at a boundary.
	// (This also enforces non-decreasing.) The ring-0→ring-1 step is exempt.
	for ring := 2; ring <= s.MaxRing; ring++ {
		inner, outer := s.Counts[ring-1], s.Counts[ring]
		if outer != inner && outer != 2*inner {
			return fmt.Errorf("rings %d→%d step %d→%d; adjacent rings at or above ring 1 must have a slot-count ratio of exactly 1 or 2", ring-1, ring, inner, outer)
		}
	}
	return nil
}

// Slots is the schedule applied: the slot count for a ring. Ring 0 (and any
// negative ring input) is the core — one slot. A ring beyond the schedule's
// own declared MaxRing is a programmer error, not a lattice answer.
func (s Schedule) Slots(ring int) int {
	if ring <= 0 {
		return 1
	}
	if ring > s.MaxRing {
		panic(fmt.Sprintf("polar: ring %d is outside the schedule's declared maxRing %d", ring, s.MaxRing))
	}
	return s.Counts[ring]
}

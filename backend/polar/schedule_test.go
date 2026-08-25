package polar

import "testing"

// tight6 is the spike's default banding (innerSlots 6, doubling at
// 2,3,5,9,17) — used throughout these tests as A schedule, never THE
// schedule: the slot-schedule value is Decision 2 and stays open.
func tight6(t *testing.T) Schedule {
	t.Helper()
	s := NewBandedSchedule(6, []int{2, 3, 5, 9, 17}, 20)
	if err := s.Validate(); err != nil {
		t.Fatalf("tight6 test schedule invalid: %v", err)
	}
	return s
}

func TestNewBandedSchedule_MatchesSpike(t *testing.T) {
	s := tight6(t)
	want := map[int]int{0: 1, 1: 6, 2: 12, 3: 24, 4: 24, 5: 48, 8: 48, 9: 96, 16: 96, 17: 192, 20: 192}
	for ring, slots := range want {
		if got := s.Slots(ring); got != slots {
			t.Errorf("Slots(%d) = %d, want %d", ring, got, slots)
		}
	}
	if got := s.Slots(-3); got != 1 {
		t.Errorf("Slots(-3) = %d, want 1 (core)", got)
	}
}

func TestScheduleValidate(t *testing.T) {
	cases := []struct {
		name  string
		s     Schedule
		valid bool
	}{
		{"banded tight6", NewBandedSchedule(6, []int{2, 3, 5, 9, 17}, 20), true},
		{"core-only board", Schedule{MaxRing: 0, Counts: []int{1}}, true},
		{"ring 1 slot count of three is accepted (core step exempt from ratio rule)", Schedule{MaxRing: 1, Counts: []int{1, 3}}, true},
		{"zero-slot ring rejected", Schedule{MaxRing: 1, Counts: []int{1, 0}}, false},
		{"one-slot ring rejected", Schedule{MaxRing: 1, Counts: []int{1, 1}}, false},
		{"ratio 4 rejected", Schedule{MaxRing: 2, Counts: []int{1, 6, 24}}, false},
		{"ratio 3 rejected", Schedule{MaxRing: 2, Counts: []int{1, 6, 18}}, false},
		{"decreasing rejected", Schedule{MaxRing: 2, Counts: []int{1, 12, 6}}, false},
		{"ring 0 not the single core rejected", Schedule{MaxRing: 1, Counts: []int{6, 6}}, false},
		{"undefined ring within own bound rejected", Schedule{MaxRing: 2, Counts: []int{1, 6}}, false},
		{"counts beyond the declared bound rejected", Schedule{MaxRing: 2, Counts: []int{1, 6, 12, 24}}, false},
		{"negative maxRing rejected", Schedule{MaxRing: -1, Counts: nil}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.s.Validate()
			if c.valid && err != nil {
				t.Errorf("want valid, got %v", err)
			}
			if !c.valid && err == nil {
				t.Errorf("want invalid, got nil error")
			}
		})
	}
}

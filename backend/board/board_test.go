package board

import (
	"testing"

	"hexaverse/polar"
)

func sched(t testing.TB, maxRing int) polar.Schedule {
	t.Helper()
	s := Schedule(maxRing)
	if err := s.Validate(); err != nil {
		t.Fatalf("pinned production schedule invalid at maxRing %d: %v", maxRing, err)
	}
	return s
}

// The production schedule is pinned to Isotropic (openspec board-tactical-math,
// "The Production Slot Schedule Is Pinned to Isotropic"): innerSlots 6,
// doubling at 2, 3, 5, 9, 17 — asserted against the expanded counts so a
// constant edit cannot slip through as "just a tuning change".
func TestSchedule_PinnedIsotropicValues(t *testing.T) {
	s := sched(t, 20)
	want := map[int]int{0: 1, 1: 6, 2: 12, 3: 24, 4: 24, 5: 48, 8: 48, 9: 96, 16: 96, 17: 192, 20: 192}
	for ring, slots := range want {
		if got := s.Slots(ring); got != slots {
			t.Errorf("Slots(%d) = %d, want %d", ring, got, slots)
		}
	}
	if InnerSlots != 6 {
		t.Errorf("InnerSlots = %d, want the pinned 6", InnerSlots)
	}
	if got, want := DoubleAt(), []int{2, 3, 5, 9, 17}; len(got) != len(want) {
		t.Fatalf("DoubleAt() = %v, want %v", got, want)
	} else {
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("DoubleAt() = %v, want %v", got, want)
			}
		}
	}
}

func TestRingCells(t *testing.T) {
	s := sched(t, 10)
	if got := RingCells(0, s); len(got) != 1 || got[0] != (Cell{Ring: 0, Slot: 0}) {
		t.Errorf("RingCells(0) = %v, want the single core cell", got)
	}
	got := RingCells(2, s)
	if len(got) != 12 {
		t.Fatalf("RingCells(2) has %d cells, want 12", len(got))
	}
	for i, c := range got {
		if c != (Cell{Ring: 2, Slot: i}) {
			t.Fatalf("RingCells(2)[%d] = %v, want slot order", i, c)
		}
	}
}

func TestDistance_HandCases(t *testing.T) {
	s := sched(t, 10)
	cases := []struct {
		name string
		a, b Cell
		want int
	}{
		{"identity", Cell{Ring: 5, Slot: 3}, Cell{Ring: 5, Slot: 3}, 0},
		{"adjacent same ring", Cell{Ring: 5, Slot: 3}, Cell{Ring: 5, Slot: 4}, 1},
		{"adjacent across rings", Cell{Ring: 4, Slot: 0}, Cell{Ring: 5, Slot: 0}, 1},
		{"corner step counts one", Cell{Ring: 6, Slot: 0}, Cell{Ring: 7, Slot: 1}, 1},
		{"the phantom pair is two steps", Cell{Ring: 4, Slot: 0}, Cell{Ring: 5, Slot: 2}, 2},
		{"core to ring 2", Cell{Ring: 0, Slot: 0}, Cell{Ring: 2, Slot: 0}, 2},
		// The core is adjacent to every ring-1 cell, so the graph metric cuts
		// through it: {1,0} → core → {1,3}. Distance is a range measure, not a
		// flight path — the arc path a ship takes still never crosses the core.
		{"half the ring around ring 1 cuts through the core", Cell{Ring: 1, Slot: 0}, Cell{Ring: 1, Slot: 3}, 2},
		{"radial descent", Cell{Ring: 5, Slot: 0}, Cell{Ring: 1, Slot: 0}, 4},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Distance(c.a, c.b, s); got != c.want {
				t.Errorf("Distance(%v, %v) = %d, want %d", c.a, c.b, got, c.want)
			}
		})
	}
}

// Distance is the graph metric induced by tight adjacency: symmetric, 1
// exactly on adjacent pairs, and realized by a path (triangle inequality via
// step-by-step realizability is implied by BFS; here we pin symmetry and the
// adjacency⇔1 equivalence over a bounded exhaustive sweep).
func TestDistance_MetricProperties(t *testing.T) {
	s := sched(t, 5)
	const maxRing = 5
	for ar := 0; ar <= maxRing; ar++ {
		for as := range s.Slots(ar) {
			for br := 0; br <= maxRing; br++ {
				for bs := range s.Slots(br) {
					a, b := Cell{Ring: ar, Slot: as}, Cell{Ring: br, Slot: bs}
					d := Distance(a, b, s)
					if rev := Distance(b, a, s); rev != d {
						t.Fatalf("Distance(%v,%v)=%d but reversed %d", a, b, d, rev)
					}
					adj := polar.IsAdjacent(a, b, s) && a != b
					if adj != (d == 1) {
						t.Fatalf("Distance(%v,%v)=%d disagrees with adjacency %v", a, b, d, adj)
					}
					if (a == b) != (d == 0) {
						t.Fatalf("Distance(%v,%v)=%d identity violation", a, b, d)
					}
				}
			}
		}
	}
}

// A hop budget tracks the arc path: the arc path between two cells realizes a
// walk, so Distance never exceeds the arc path's step count — and every
// distance is realizable step-by-step by construction of BFS.
func TestDistance_BoundedByArcPath(t *testing.T) {
	s := sched(t, 6)
	for ar := 0; ar <= 6; ar++ {
		for as := range s.Slots(ar) {
			for br := 0; br <= 6; br++ {
				for bs := range s.Slots(br) {
					a, b := Cell{Ring: ar, Slot: as}, Cell{Ring: br, Slot: bs}
					if d, steps := Distance(a, b, s), len(polar.ArcPath(a, b, s))-1; d > steps {
						t.Fatalf("Distance(%v,%v)=%d exceeds the arc path's %d steps", a, b, d, steps)
					}
				}
			}
		}
	}
}

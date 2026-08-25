package polar

import (
	"testing"

	"hexaverse/common"
)

func TestCellAt(t *testing.T) {
	s := tight6(t)
	cases := []struct {
		name string
		o    Orbit
		t    common.WorldMillis
		want Cell
	}{
		{"full period returns to the epoch cell", Orbit{Ring: 2, EpochSlot: 3, Period: 12_000, Dir: 1}, 12_000, Cell{2, 3}},
		{"half a period advances half the ring's slots", Orbit{Ring: 2, EpochSlot: 3, Period: 12_000, Dir: 1}, 6_000, Cell{2, 9}},
		{"half a period retrograde", Orbit{Ring: 2, EpochSlot: 3, Period: 12_000, Dir: -1}, 6_000, Cell{2, 9}},
		{"zero period is motionless", Orbit{Ring: 4, EpochSlot: 7, Period: 0, Dir: 1}, 1 << 50, Cell{4, 7}},
		{"negative period is motionless", Orbit{Ring: 4, EpochSlot: 7, Period: -5, Dir: 1}, 99_999, Cell{4, 7}},
		{"ring 0 is always the core", Orbit{Ring: 0, EpochSlot: 5, Period: 1000, Dir: -1}, 123_456, Cell{0, 0}},
		{"direction zero advances as if positive", Orbit{Ring: 1, EpochSlot: 0, Period: 6, Dir: 0}, 1, Cell{1, 1}},
		{"direction minus one runs backwards", Orbit{Ring: 1, EpochSlot: 0, Period: 6, Dir: -1}, 1, Cell{1, 5}},
		{"truncating quotient, not rounding", Orbit{Ring: 1, EpochSlot: 0, Period: 7, Dir: 1}, 6, Cell{1, 5}}, // 6·6/7 = 5.14… → 5
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := CellAt(c.o, c.t, s); got != c.want {
				t.Errorf("CellAt(%+v, %d) = %v, want %v", c.o, c.t, got, c.want)
			}
		})
	}
}

func TestCellAt_MotionlessAtEverySampledTime(t *testing.T) {
	s := tight6(t)
	o := Orbit{Ring: 3, EpochSlot: 11, Period: -1, Dir: 1}
	for _, tm := range []common.WorldMillis{0, 1, 999, 1 << 40} {
		if got := CellAt(o, tm, s); got != (Cell{3, 11}) {
			t.Fatalf("non-positive period moved: CellAt(t=%d) = %v", tm, got)
		}
	}
}

// The back-solve round-trip: settling onto a cell at `at` and evaluating the
// resulting orbit at `at` reproduces the settle cell exactly — never a
// different slot — across rings, slots, periods, directions, and offsets.
func TestOrbitThrough_RoundTripExhaustive(t *testing.T) {
	s := tight6(t)
	periods := []common.WorldMillis{1, 7, 12, 5_000, 1_000_000_000_000_000}
	for ring := 0; ring <= 10; ring++ {
		for slot := range s.Slots(ring) {
			for _, period := range periods {
				for _, dir := range []int{-1, 1} {
					for k := common.WorldMillis(0); k <= 4; k++ {
						at := period * k / 4
						c := Cell{ring, slot}
						o := OrbitThrough(c, at, period, dir, s)
						if got := CellAt(o, at, s); got != canon(c, s) {
							t.Fatalf("settle teleported: OrbitThrough(%v, at=%d, period=%d, dir=%d) → %+v → CellAt = %v",
								c, at, period, dir, o, got)
						}
					}
				}
			}
		}
	}
}

// A settled body still drifts afterward: at the first world time whose
// truncating quotient exceeds the settle instant's, the cell has moved
// exactly one slot in the configured direction; a full period after the
// settle instant it is back on the settle cell.
func TestOrbitThrough_SettledBodyStillDrifts(t *testing.T) {
	s := tight6(t)
	c := Cell{4, 7} // ring 4: 24 slots
	const period, at = 48_000, 10_123
	for _, dir := range []int{1, -1} {
		o := OrbitThrough(c, at, period, dir, s)
		slots := int64(s.Slots(c.Ring))
		base := int64(at) * slots / period
		// smallest t > at with ⌊t·slots ÷ period⌋ > base
		next := common.WorldMillis((base + 1) * period / slots)
		if int64(next)*slots/period == base {
			next++
		}
		got := CellAt(o, next, s)
		want := Cell{c.Ring, NormalizeSlot(c.Slot+dir, int(slots))}
		if got != want {
			t.Errorf("dir %+d: first drift step = %v, want %v", dir, got, want)
		}
		if got := CellAt(o, at+period, s); got != c {
			t.Errorf("dir %+d: full period after settling = %v, want %v", dir, got, c)
		}
	}
}

func TestOrbitThrough_CoreSettlesToCore(t *testing.T) {
	s := tight6(t)
	o := OrbitThrough(Cell{0, 0}, 987_654, 12_000, 1, s)
	for _, tm := range []common.WorldMillis{0, 1, 987_654, 10_000_000} {
		if got := CellAt(o, tm, s); got != (Cell{0, 0}) {
			t.Fatalf("core back-solve left the core at t=%d: %v", tm, got)
		}
	}
}

package polar

import "hexaverse/common"

// Orbit holds a body's orbital elements on the polar lattice. EpochSlot is
// the slot index at the WORLD EPOCH (never "now" — see OrbitThrough); Period
// is world-milliseconds for one full revolution; Dir is +1 / −1, with 0
// treated as +1 everywhere (0 is Go's zero value and the value a fresh JSON
// body deserializes with — an unspecified coercion here is a silent seam
// fork on the single most common input, so the spec pins it explicitly).
//
// No period law is implied: the polar orbital-period law under a banded
// schedule is an OPEN question (design.md), so this package takes Period as
// given and never derives it from Ring.
type Orbit struct {
	Ring      int                `json:"ring"`
	EpochSlot int                `json:"epochSlot"`
	Period    common.WorldMillis `json:"period"`
	Dir       int                `json:"dir"`
}

// CellAt is the body's cell at a world time — a pure integer function of the
// orbit (openspec polar-lattice-math, "Orbital Advance Is Integer Arithmetic
// Over the Ring's Slot Count"). The slot advances by the truncating integer
// quotient ⌊worldTime × slots ÷ period⌋ in the configured direction; worldTime
// is measured from the world epoch and non-negative (a negative time is out
// of the requirement's domain). A period ≤ 0 leaves the body motionless at
// its epoch slot. Ring 0 always resolves to the core.
//
// The int64 intermediate worldTime × slots must not overflow — that bound is
// the sweep-domain requirement's "wide enough" clause; inputs that would
// overflow are outside the domain parity is claimed over.
func CellAt(o Orbit, worldTime common.WorldMillis, s Schedule) Cell {
	if o.Ring <= 0 {
		return Cell{Ring: 0, Slot: 0}
	}
	slots := int64(s.Slots(o.Ring))
	idx := int64(o.EpochSlot)
	if o.Period > 0 {
		dir := int64(o.Dir)
		if dir == 0 {
			dir = 1
		}
		advanced := (int64(worldTime) * slots) / int64(o.Period)
		idx += dir * advanced
	}
	return Cell{Ring: o.Ring, Slot: int(normalizeSlot64(idx, slots))}
}

// OrbitThrough is the back-solve: the orbit a body inherits when it settles
// onto a cell at world time `at` (openspec polar-lattice-math, "Orbit
// Back-Solve Settles Without Teleporting"). EpochSlot is epoch-anchored, so
// the advance runs BACKWARDS from `at` — storing the raw settle slot would
// teleport the body when CellAt re-advanced it from the epoch. Same
// truncating integer arithmetic as CellAt, no floating-point intermediate,
// so the round-trip CellAt(OrbitThrough(c, at, …), at) == c is exact rather
// than nearly (the hex incumbent's board.OrbitThrough learned this the hard
// way).
func OrbitThrough(c Cell, at, period common.WorldMillis, dir int, s Schedule) Orbit {
	if dir == 0 {
		dir = 1
	}
	if c.Ring <= 0 {
		return Orbit{Ring: 0, EpochSlot: 0, Period: period, Dir: dir}
	}
	slots := int64(s.Slots(c.Ring))
	epoch := int64(NormalizeSlot(c.Slot, int(slots)))
	if period > 0 {
		advanced := (int64(at) * slots) / int64(period)
		epoch -= int64(dir) * advanced
	}
	return Orbit{Ring: c.Ring, EpochSlot: int(normalizeSlot64(epoch, slots)), Period: period, Dir: dir}
}

package board

import (
	"hexaverse/common"
	"hexaverse/polar"
)

// Orbit holds a body's orbital elements. Its live cell is a pure function of
// (Orbit, worldTime) — position is computed, never stored per tick (#0003
// Decision #5). Angle0 is the ring's slot index at the world epoch; Period is
// world-milliseconds for one full revolution; Dir is +1 / −1 (0 coerced to
// +1). The stored shape {ring, angle0, dir} predates the polar migration and
// persists unchanged — angle0 was a ring-position index on hex rings and is a
// slot index now; both are "the angular index at the epoch".
//
// Period is NEVER PERSISTED (`firestore:"-"`), wherever an Orbit is stored — on a
// system feature, on a fleet's coast state, on a remembered observation. It is a
// pure function of Ring under the world's orbital law
// (common.GameTuning.OrbitPeriod — period = base × ring, deliberately linear;
// see the rewrite design's period-law decision), so storing it would freeze
// that thing at the pace it happened to be written at: retuning orbits would
// move the planets and leave the ships behind (it did, once). Every read out
// of Firestore runs the decoded Orbit through HydratePeriod. It IS serialized
// to JSON — the client needs it to render, and gets the live value.
//
// Ring/Angle0/Dir stay stored: those are the generator's dice, not a pacing knob.
type Orbit struct {
	Ring   int                `json:"ring" firestore:"ring"`
	Angle0 int                `json:"angle0" firestore:"angle0"`
	Period common.WorldMillis `json:"period" firestore:"-"`
	Dir    int                `json:"dir" firestore:"dir"`
}

// HydratePeriod fills a just-decoded Orbit's Period from the live orbital law. Call
// it at every Firestore read that decodes an Orbit — a missed call leaves Period 0,
// which OrbState reads as "motionless", so the failure mode is a thing that stops
// orbiting rather than a crash. Nil-safe: an absent orbit is not an error.
func HydratePeriod(o *Orbit) {
	if o == nil {
		return
	}
	o.Period = common.Tuning().OrbitPeriod(o.Ring)
}

// AngleOf returns the ring and the slot index of a cell — the inverse of
// placing a body on a ring. Used to derive a coast orbit for a fleet from the
// cell it's resting on. The core is ring 0, index 0.
func AngleOf(c Cell, s polar.Schedule) (ring, index int) {
	c = Canon(c, s)
	return c.Ring, c.Slot
}

// OrbitThrough builds an orbit on c's ring that passes through c AT `at` — the
// orbit a thing inherits when it comes to rest "here, now". The back-solve is
// polar.OrbitThrough: Angle0 is the slot at the world EPOCH, so the advance
// runs backwards from `at` — evaluating the result at `at` yields exactly c,
// never a teleport (openspec board-tactical-math, "Orbit Back-Solve Settles
// Without Teleporting").
func OrbitThrough(c Cell, at, period common.WorldMillis, dir int, s polar.Schedule) Orbit {
	o := polar.OrbitThrough(c, at, period, dir, s)
	return Orbit{Ring: o.Ring, Angle0: o.EpochSlot, Period: o.Period, Dir: o.Dir}
}

// OrbState returns the body's cell at a given world time — polar.CellAt over
// the ring's scheduled slot count (openspec board-tactical-math, "Orbital
// Advance Is Integer Arithmetic Over the Ring's Slot Count"). With a very
// large Period (motion off/slow) the body sits at its epoch slot — the board
// reads static. Deterministic and mirrored in lib/board.
func OrbState(o Orbit, worldTime common.WorldMillis, s polar.Schedule) Cell {
	return polar.CellAt(polar.Orbit{Ring: o.Ring, EpochSlot: o.Angle0, Period: o.Period, Dir: o.Dir}, worldTime, s)
}

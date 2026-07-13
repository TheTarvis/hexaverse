package board

import "hexaverse/common"

// Orbit holds a body's orbital elements. Its live hex is a pure function of
// (Orbit, worldTime) — position is computed, never stored per tick (#0003
// Decision #5). Angle0 is the ring-position index at the world epoch; Period is
// world-milliseconds for one full revolution; Dir is +1 / −1.
//
// Period is NEVER PERSISTED (`firestore:"-"`), wherever an Orbit is stored — on a
// system feature, on a fleet's coast state, on a remembered observation. It is a
// pure function of Ring under the world's orbital law
// (common.GameTuning.OrbitPeriod), so storing it would freeze that thing at the
// pace it happened to be written at: retuning orbits would move the planets and
// leave the ships behind (it did, once). Every read out of Firestore runs the
// decoded Orbit through HydratePeriod. It IS serialized to JSON — the client needs
// it to render, and gets the live value.
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

// AngleOf returns the ring and the ring-position index of a hex — the inverse
// of placing a body on a ring. Used to derive a coast orbit for a fleet from
// the hex it's resting on. The centre is ring 0, index 0.
func AngleOf(h Hex) (ring, index int) {
	ring = Ring(h)
	if ring == 0 {
		return 0, 0
	}
	for i, rh := range RingHexes(ring) {
		if rh == h {
			return ring, i
		}
	}
	return ring, 0
}

// OrbitThrough builds an orbit on h's ring that passes through h AT `at` — the
// orbit a thing inherits when it comes to rest "here, now".
//
// The back-solve is the whole point. Angle0 is the index at the world EPOCH, not
// "now", so you cannot just store the index of the hex you stopped on: OrbState
// would advance that index by everything that has elapsed since the epoch and put
// you somewhere else entirely — settling would TELEPORT you. So we run the advance
// backwards: angle0 = index(h) − dir × advance(at). Integer math mirroring
// OrbState exactly, so the round-trip OrbState(OrbitThrough(h, at, …), at) == h is
// exact rather than nearly.
//
// It only stayed hidden this long because fleets coasted with a period so large the
// advance was always zero.
func OrbitThrough(h Hex, at, period common.WorldMillis, dir int) Orbit {
	ring, idx := AngleOf(h)
	if dir == 0 {
		dir = 1
	}
	if ring <= 0 {
		return Orbit{Ring: ring, Angle0: 0, Period: period, Dir: dir}
	}
	steps := 6 * ring
	angle0 := idx
	if period > 0 {
		advanced := (int64(at) * int64(steps)) / int64(period)
		angle0 = idx - dir*int(advanced)
	}
	angle0 = ((angle0 % steps) + steps) % steps
	return Orbit{Ring: ring, Angle0: angle0, Period: period, Dir: dir}
}

// OrbState returns the body's hex at a given world time. A full revolution
// (Period) advances 6*Ring ring positions. With a very large Period (motion
// off/slow for the slice) the body sits at its epoch angle — the board reads
// static. Deterministic and mirrored in TS.
func OrbState(o Orbit, worldTime common.WorldMillis) Hex {
	if o.Ring <= 0 {
		return Hex{0, 0}
	}
	steps := 6 * o.Ring
	idx := o.Angle0
	if o.Period > 0 {
		dir := o.Dir
		if dir == 0 {
			dir = 1
		}
		// Integer-only advance so Go and TS agree exactly (no float rounding).
		advanced := (int64(worldTime) * int64(steps)) / int64(o.Period)
		idx = o.Angle0 + dir*int(advanced)
	}
	ring := RingHexes(o.Ring)
	n := len(ring)
	idx = ((idx % n) + n) % n
	return ring[idx]
}

package board

import "hexaverse/common"

// Orbit holds a body's orbital elements. Its live hex is a pure function of
// (Orbit, worldTime) — position is computed, never stored per tick (#0003
// Decision #5). Angle0 is the ring-position index at the world epoch; Period is
// world-milliseconds for one full revolution; Dir is +1 / −1.
type Orbit struct {
	Ring   int                `json:"ring" firestore:"ring"`
	Angle0 int                `json:"angle0" firestore:"angle0"`
	Period common.WorldMillis `json:"period" firestore:"period"`
	Dir    int                `json:"dir" firestore:"dir"`
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

package disclosure

import (
	"hexaverse/common"
	"hexaverse/space"
)

// WithinRange is the passive proximity predicate: squared distance against
// squared range, INCLUSIVE at exact equality.
//
// Squared because only the ordering is ever consumed, so the square root is
// pure cost, and dropping it keeps the comparison inside space/vec.go's
// guarded-product set (proximity-disclosure: "Proximity Comparisons Are
// Squared, Never Rooted"). Inclusive because every exact boundary in this
// capability resolves toward disclosing: the disclosed set is CLOSED at its
// boundary, so a target at exactly range is seen. That choice is close to
// arbitrary — it is written down, and given its own scenario, precisely
// because `<` and `<=` are a one-character difference that no naturally
// occurring test distinguishes.
//
// Both positions are arguments rather than resolved here. That is not
// convenience: it keeps the canonical-path rule enforceable at the caller,
// where the fold actually happens, instead of hiding a second position
// derivation inside the predicate.
func WithinRange(observer, target space.Vec3, radius float64) bool {
	return observer.DistSq(target) <= float64(radius*radius)
}

// Emitting reports whether a ship is running its drive at world time t.
//
// This is the half of the loud channel that is not geometric at all: the
// test is departMs <= t < arriveMs over two stored common.WorldMillis
// integers, with no floating-point operand anywhere in it. Exact by
// construction — there is no boundary to flip and nothing for a build
// target to disagree about.
//
// Half-open at the end so that arrival is the instant emission stops,
// matching space.StateAt's own convention that a burn past its arrival IS
// its settled park. A ship in any parked mode, or with no stored burn,
// never emits.
func Emitting(s space.ShipState, t common.WorldMillis) bool {
	if s.Mode != space.ModeBurn || s.Burn == nil {
		return false
	}
	return s.Burn.DepartMs <= t && t < s.Burn.ArriveMs
}

// Scanning reports whether a ship is running a focused sweep at world time
// t — the same exact half-open integer interval test Emitting is, over the
// ship's own stored sweep window rather than its burn (proximity-disclosure
// "An Active Sweep Emits For Its Duration"; design.md Decision 11). A ship
// with no stored sweep window is never reported as scanning.
func Scanning(s Ship, t common.WorldMillis) bool {
	if s.Scan == nil {
		return false
	}
	return s.Scan.DepartMs <= t && t < s.Scan.ArriveMs
}

// PlumeRadius derives how far an emitting fleet's plume reaches from its
// aggregate drive output and the burn's commanded acceleration — both
// STORED values, read directly by the caller rather than re-derived from
// motion — clamped up to PlumeFloor.
//
// Commanded acceleration stays in the curve deliberately. Dropping it for
// drive output alone looks safer on determinism grounds, but both inputs
// are plain stored lookups, so that argument is weak; the gameplay cost is
// not. Silent running exists only because a gently commanded burn is
// quieter, and it prices stealth in flight time rather than in a new
// mechanic.
//
// The floor is what makes ignition an event: it sits above PassiveRange, so
// lighting a drive is always detectable by anyone who could already see you
// cold, however gently the burn was commanded.
func PlumeRadius(driveOutput, commandedAccel float64) float64 {
	radius := float64(float64(PlumePerDriveOutput*driveOutput) * commandedAccel)
	if radius < PlumeFloor {
		return PlumeFloor
	}
	return radius
}

// PlumeReaches is the geometric half of the loud channel: whether a plume
// that exists reaches this observer. A squared, inclusive comparison
// against the squared SUM of the observer's own passive range and the
// emitter's plume radius — governed by exactly the same rules as every
// other predicate here, because it is exactly the same shape.
func PlumeReaches(observer, emitter space.Vec3, passiveRange, plumeRadius float64) bool {
	return WithinRange(observer, emitter, passiveRange+plumeRadius)
}

// detectionRadius is the radius an observer actually detects a given ship
// at: its own passive range, extended by the LOUDER of the ship's drive
// plume and its sweep emission, when either is running (design.md Decision
// 9 — "detectionRadius becomes obs.PassiveRange + max(plume, scanEmission),
// with each flag reported independently: a fleet burning and sweeping
// reports both"). Losing exactness on this geometric half costs little,
// because exactness was only ever load-bearing through PERMANENCE — and
// nothing on this path persists. A target sitting exactly at the edge
// flickers for a tick and discloses nothing it was not already disclosing.
func detectionRadius(obs Observer, target Ship, t common.WorldMillis) float64 {
	loudest := 0.0
	if Emitting(target.State, t) {
		loudest = PlumeRadius(target.DriveOutput, target.State.Burn.Accel)
	}
	if Scanning(target, t) {
		if sweep := scanEmissionRadius(target.Scan.Range); sweep > loudest {
			loudest = sweep
		}
	}
	return obs.PassiveRange + loudest
}

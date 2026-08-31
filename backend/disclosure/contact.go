package disclosure

import (
	"hexaverse/common"
	"hexaverse/space"
)

// Contact is everything a LIVE disclosure — passive or plume — tells a
// requester about a foreign ship. Position, velocity, and whether it is
// burning. Nothing further, and the omissions are the specification:
//
//   - No owner. Identity gating starts anonymous, the restrictive
//     direction, because anonymous to identified is an additive change to
//     this struct while identified to anonymous is a disclosure regression
//     that requires auditing everything which could leak identity anyway.
//     Attribution stays inferential: you learn that something of a given
//     size is parked at the sixth planet, and who flies that is a read you
//     make, or buy.
//   - No hull count and no hull types. Those are what a SCAN resolves
//     (sighting.go), and the gap between the two rungs is what gives a scan
//     something to sell.
//   - No id. A stable per-read identity is a tracking affordance, which is
//     a model decision this capability has no business making early; the
//     client smooths contacts positionally instead.
//
// Composition still leaks coarsely through one channel, deliberately: plume
// radius aggregates across hulls, so a big fleet lighting its drive is
// visible from farther than a small one. That is an emergent inference
// rather than a disclosed value, and it is precisely what makes silent
// running worth paying flight time for.
//
// contact_test.go asserts the absence of those fields by reflection, so
// adding one is a test failure rather than a review miss.
type Contact struct {
	Position space.Vec3
	Velocity space.Vec3
	Emitting bool
}

// Disclose evaluates whether target is disclosed to obs at world time t,
// and returns the contact when it is.
//
// It is a PURE FUNCTION of (observer, target, world time, injected world).
// It reads no stored disclosure record, consults no sighting, writes
// nothing, and carries nothing forward: a target disclosed at T and out of
// range at T' is simply not disclosed at T', because there is no state in
// which "was disclosed" could be recorded. That is the property that makes
// a knife-edge float boundary tolerable here where it was not tolerable in
// the fog model this replaces — a flip costs one tick of flicker rather
// than a permanent, monotonic, and wrong belief.
//
// A requester's OWN ships are not this function's problem: a corporation
// sees its own unconditionally, which is a consumer-side rule that never
// reaches a predicate.
func Disclose(w World, obs Observer, target Ship, t common.WorldMillis) (Contact, bool, error) {
	// A ship between systems is disclosed by no channel — absent from the
	// origin system and from the destination system alike — until its
	// transit resolves.
	if target.InLaneTransit {
		return Contact{}, false, nil
	}

	masked, err := Masked(w.Attachments, target.Id, target.State, t)
	if err != nil {
		return Contact{}, false, err
	}
	if masked {
		return Contact{}, false, nil
	}

	// The canonical position entry point, and the only one this package
	// ever calls. Nothing here recomputes, caches, rounds, or otherwise
	// re-derives it: two disclosure decisions about the same ship at the
	// same world time therefore rest on bit-identical positions no matter
	// which call path reached them.
	pos, err := space.StatePosition(w.Bodies, target.State, t)
	if err != nil {
		return Contact{}, false, err
	}

	if !WithinRange(obs.Position, pos, detectionRadius(obs, target, t)) {
		return Contact{}, false, nil
	}

	// Occlusion applies to the plume channel exactly as it applies to the
	// passive one: a fleet behind the star is not disclosed however loud it
	// is burning.
	occluded, err := w.starOccludes(obs.Position, pos, t)
	if err != nil {
		return Contact{}, false, err
	}
	if occluded {
		return Contact{}, false, nil
	}

	vel, err := contactVelocity(w.Bodies, target.State, t)
	if err != nil {
		return Contact{}, false, err
	}
	return Contact{Position: pos, Velocity: vel, Emitting: Emitting(target.State, t)}, true, nil
}

// contactVelocity resolves a ship's instantaneous velocity at t through the
// same effective-state fold its position comes from, so that a contact's
// two kinematic fields can never describe two different moments. Velocity
// is a disclosed value rather than a predicate input, so it is not itself
// governed by the canonical-path rule — but it rides the fold anyway,
// because the alternative is a second reading of the same stored state.
func contactVelocity(bodies space.Bodies, s space.ShipState, t common.WorldMillis) (space.Vec3, error) {
	folded, err := space.StateAt(bodies, s, t)
	if err != nil {
		return space.Vec3{}, err
	}
	switch folded.Mode {
	case space.ModeBurn:
		return folded.Burn.Tangent(t).Scale(folded.Burn.Speed(t)), nil
	case space.ModeParked:
		return folded.Park.Velocity(bodies, t)
	case space.ModeDrift:
		return folded.Drift.Velocity, nil
	default:
		return space.Vec3{}, space.ErrUnknownParkKind
	}
}

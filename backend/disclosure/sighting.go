package disclosure

import (
	"errors"

	"hexaverse/common"
	"hexaverse/space"
)

// ErrScanOutOfRange is returned when a focused scan is commanded against a
// host farther from the scanning fleet than FocusedScanRange.
var ErrScanOutOfRange = errors.New("disclosure: focused-scan target beyond range")

// ErrScanOccluded is returned when a focused scan is commanded against a
// host the star hides from the scanning fleet.
var ErrScanOccluded = errors.New("disclosure: focused-scan target occluded by the star")

// Sighting is a scan-minted record: an IMMUTABLE HISTORICAL CLAIM about
// where something was and what it was made of, stamped with the world time
// the pulse reached it — never live truth.
//
// It is the one thing in this capability that persists, and it survives the
// no-persist argument for a different reason than the live path does. A
// knife-edge flip at an echo rim is permanent here. That is tolerable
// because a sighting is stale by construction: a flip means a corporation
// did not get a record of something at the exact rim of its ping,
// indistinguishable to the player from having pinged a moment later.
// Compare what it replaces — fog that is permanently and CURRENTLY wrong
// about what you can see.
//
// The rule that keeps that safe is narrower than "persist nothing", and
// this type is where it has to hold: NO STORED RECORD MAY BE CONSULTED TO
// DECIDE LIVE DISCLOSURE. The pile is readable, sellable, and inert. The
// moment a sighting feeds the live path — as a cache, a hint, or a "you
// already know about this one" shortcut — the knife edge gets its teeth
// back.
//
// The type carries no setter, no update, and no delete: minting is the only
// way a value of it comes into existence, and sighting_test.go asserts that
// structurally.
type Sighting struct {
	// SystemId is the id of the system this sighting was computed in
	// (proximity-disclosure "A Disclosure-Computed Sighting Carries Its
	// System"; design.md Decision 16) — a bare position is not resolvable to
	// a place without it. Set by every path that mints a Sighting value
	// (FocusedScan below, reading it off the World it was given); NOT a
	// MintSighting parameter, since MintSighting's signature is pinned by
	// sighting_test.go's already-committed call sites.
	SystemId string
	// AsOf is the world time the pulse reached the target. Every other
	// field is frozen at this moment and stays frozen as the world moves on.
	AsOf common.WorldMillis
	// TargetId names what was sighted. Unlike a live Contact, a sighting is
	// a filed claim rather than a live blip, so it has something to be a
	// claim ABOUT.
	TargetId string
	// Position and Velocity are the target's kinematics at AsOf.
	Position space.Vec3
	Velocity space.Vec3
	// Emitting is whether the target was running its drive at AsOf.
	Emitting bool
	// HullCount and HullTypes are the composition a scan resolves and a
	// live contact withholds — frozen at mint, so a fleet that later gains
	// or loses hulls does not change what this record says it had.
	HullCount int
	HullTypes []string
	// CleanSweep marks a record attesting that a focused scan found nothing
	// masked at its target. A clean sweep is itself intelligence — knowing a
	// body is empty is worth filing, and worth selling.
	CleanSweep bool
	// HostId names the host a focused scan swept, on both a composition
	// record and a clean-sweep one.
	HostId string
}

// MintSighting builds the immutable record for one target at world time
// asOf, resolving its kinematics through the canonical fold and copying its
// composition so that a later mutation of the caller's slice cannot reach a
// filed claim.
func MintSighting(bodies space.Bodies, target Ship, hostId string, asOf common.WorldMillis) (Sighting, error) {
	pos, err := space.StatePosition(bodies, target.State, asOf)
	if err != nil {
		return Sighting{}, err
	}
	vel, err := contactVelocity(bodies, target.State, asOf)
	if err != nil {
		return Sighting{}, err
	}
	hullTypes := append([]string(nil), target.HullTypes...)
	return Sighting{
		AsOf:      asOf,
		TargetId:  target.Id,
		Position:  pos,
		Velocity:  vel,
		Emitting:  Emitting(target.State, asOf),
		HullCount: target.HullCount,
		HullTypes: hullTypes,
		HostId:    hostId,
	}, nil
}

// ScanMints reports whether a resolving pulse mints a record for a target:
// the SAME squared, inclusive, canonical-path rule every live predicate
// runs on. A target whose squared distance from the pulse origin is exactly
// equal to the squared echo radius when the pulse reaches it IS minted —
// the boundary resolves toward disclosure here for the same reason it does
// everywhere else in this capability.
//
// A ship in lane transit is minted by no scan, a masked ship is minted by
// no ORDINARY scan (reaching those is exactly what FocusedScan is for, and
// what it charges range for), and a sightline the star blocks mints nothing
// either.
func ScanMints(w World, origin space.Vec3, echoRadius float64, target Ship, t common.WorldMillis) (bool, error) {
	if target.InLaneTransit {
		return false, nil
	}
	masked, err := Masked(w.Attachments, target.Id, target.State, t)
	if err != nil {
		return false, err
	}
	if masked {
		return false, nil
	}
	pos, err := space.StatePosition(w.Bodies, target.State, t)
	if err != nil {
		return false, err
	}
	if !WithinRange(origin, pos, echoRadius) {
		return false, nil
	}
	occluded, err := w.starOccludes(origin, pos, t)
	if err != nil {
		return false, err
	}
	return !occluded, nil
}

// FocusedScan sweeps one host for the ships masked at it, returning the
// records the sweep mints.
//
// It reaches through the whole chain beneath the host — a ship docked to a
// carrier docked to the swept body is found by the one sweep — and it mints
// a CLEAN-SWEEP record when there is nothing there, because an empty body
// is a finding too.
//
// It is rejected beyond FocusedScanRange and rejected when the star hides
// the host: masking is beatable, but sweeping every body in a system is not
// free, and no amount of focus sees through a star.
//
// ships is the caller's lookup of every ship it could mint. Ids in the
// chain with no entry there are skipped rather than erroring: the chain is
// resolved from attachment data, and a caller scoping its ship set more
// narrowly than the attachment store is a normal condition, not a fault.
func FocusedScan(w World, scanner space.Vec3, hostId string, ships map[string]Ship, t common.WorldMillis) ([]Sighting, error) {
	hostPos, err := hostPosition(w, hostId, ships, t)
	if err != nil {
		return nil, err
	}
	if !WithinRange(scanner, hostPos, w.params().FocusedScanRange) {
		return nil, ErrScanOutOfRange
	}
	occluded, err := w.starOccludes(scanner, hostPos, t)
	if err != nil {
		return nil, err
	}
	if occluded {
		return nil, ErrScanOccluded
	}

	chain, err := chainBeneath(w.Attachments, hostId)
	if err != nil {
		return nil, err
	}

	var out []Sighting
	for _, id := range chain {
		ship, ok := ships[id]
		if !ok {
			continue
		}
		s, err := MintSighting(w.Bodies, ship, hostId, t)
		if err != nil {
			return nil, err
		}
		// SystemId is not a MintSighting parameter (see Sighting's own doc
		// comment) — every computed Sighting value carries the World it was
		// computed against, set here rather than threaded through the
		// signature sighting_test.go's committed call sites already pin.
		s.SystemId = w.SystemId
		out = append(out, s)
	}
	if len(out) == 0 {
		return []Sighting{{SystemId: w.SystemId, AsOf: t, HostId: hostId, CleanSweep: true}}, nil
	}
	return out, nil
}

// hostPosition resolves a scan target that may be a body, a station (which
// is a body), or another ship. A ship resolves through the same canonical
// fold every other position on a disclosure path does; anything else
// resolves as a body.
func hostPosition(w World, hostId string, ships map[string]Ship, t common.WorldMillis) (space.Vec3, error) {
	if ship, ok := ships[hostId]; ok {
		return space.StatePosition(w.Bodies, ship.State, t)
	}
	return space.Position(w.Bodies, hostId, t)
}

// Package disclosure is the proximity-disclosure capability (openspec
// change add-proximity-disclosure): the MECHANISM by which a requester
// learns that a foreign ship exists, kept deliberately separate from the
// sighting MODEL that will consume it (what the ranges mean, how contacts
// are surfaced, what a scan costs).
//
// Five invariants govern everything here, and they survive changes to the
// model that sits on top:
//
//  1. Live disclosure is RECOMPUTED, never persisted. No stored record is
//     consulted to decide it. Scan-minted sightings (sighting.go) are the
//     one deliberately persisted artifact and are inert on this path.
//  2. Every proximity comparison is SQUARED — space.Vec3.DistSq against a
//     squared range — and no math.Sqrt appears anywhere in this package.
//  3. Every exact-equality boundary resolves TOWARD DISCLOSURE: a range
//     test is inclusive (<=), and an occlusion test, whose polarity is
//     inverted, is strict (<).
//  4. Every position on a disclosure path is obtained from the kinematics
//     capability's canonical entry point, space.StatePosition, and is
//     never re-derived, cached, or rounded here.
//  5. Whether a plume EXISTS is an exact integer interval test over
//     common.WorldMillis; only whether it REACHES an observer is geometric.
//
// The package imports hexaverse/common and hexaverse/space and nothing
// else: no Firestore, no clock, no HTTP. It reads the world through the
// injected interfaces below and writes nothing at all — purity_test.go
// asserts both structurally rather than by convention.
//
// This capability has NO CONSUMER by design. It is authored ahead of the
// sighting model so that the model inherits these invariants rather than
// rediscovering them; backend/observation still runs the live lattice game
// and is untouched by this change.
package disclosure

import (
	"errors"

	"hexaverse/common"
	"hexaverse/space"
)

// ErrAttachmentCycle is returned when a masking chain returns to a ship
// already visited during the same resolution. A cycle is a data error, not
// a runtime condition to absorb: resolution fails rather than looping or
// returning a partial chain.
var ErrAttachmentCycle = errors.New("disclosure: cyclic attachment chain")

// maxAttachmentDepth bounds masking-chain resolution the way space's own
// maxBodyDepth bounds a parent chain. A ship docked to a carrier docked to
// a station docked to a body is four links; the bound is generous enough
// that hitting it means the data is wrong, and the visited set catches a
// true cycle before the depth does.
const maxAttachmentDepth = 8

// Attachments resolves docking. It is accepted as an interface for the same
// reason space.Bodies is: this package owns no storage and mints nothing.
//
// HostOf reports the id of the host a ship is directly attached to.
// AttachedTo reports the ids directly attached to a host, in a stable
// order chosen by the implementation — a focused scan's minted records are
// ordered by it, so an unstable order would make the same sweep produce
// different output.
type Attachments interface {
	HostOf(id string) (string, bool)
	AttachedTo(hostId string) []string
}

// World is the injected read side every predicate here reads through. It
// carries no writer and no transaction, which is half of why a live
// disclosure decision cannot write: there is nothing to write with.
type World struct {
	// Bodies resolves body identity for space.StatePosition and for the
	// star's own position.
	Bodies space.Bodies
	// Attachments resolves masking. A nil value means nothing is docked.
	Attachments Attachments
	// StarId is the system's star, the capability's only occluder.
	StarId string
	// StarSize is the star's radius, the occlusion sphere's size.
	StarSize float64
	// SystemId is the id of the system this World describes — additive
	// (replace-observation-with-sightings design.md Decision 16; tasks.md
	// 4.3): a bare Vec3 is meaningless without the system it is in, and every
	// disclosure.Sighting this capability computes must carry it (see
	// FocusedScan, sighting.go).
	SystemId string
}

// Ship is the disclosure-relevant view of one ship. Every field is a STORED
// value read directly: nothing here is re-derived from motion, and the
// composition fields are consulted only by a scan (sighting.go), never by a
// live channel.
type Ship struct {
	// Id is the ship's identity, used for masking-chain resolution only.
	Id string
	// State is the ship's stored kinematic state. Positions are folded from
	// it through space.StatePosition; emission is read from its burn's
	// stored integer interval.
	State space.ShipState
	// DriveOutput is the fleet's aggregate drive output — the sum across
	// its hulls of what it bought to move. Because it aggregates, a big
	// fleet burning is louder than a small one burning identically; that
	// coarse size signal is emergent, not a disclosed field, and it is what
	// makes silent running worth paying flight time for.
	DriveOutput float64
	// InLaneTransit marks a ship between systems. A transiting ship is
	// disclosed by no channel and cannot be minted into a sighting: it is
	// absent from the origin system and from the destination system alike,
	// until its transit resolves.
	InLaneTransit bool
	// HullCount and HullTypes are the composition a SCAN resolves. A live
	// contact never carries them (contact.go).
	HullCount int
	HullTypes []string
}

// Observer is the disclosure-relevant view of the requesting fleet's own
// sensor. Position is passed in already resolved through the canonical
// path, so that a caller cannot smuggle a differently-derived position past
// the rule by handing this struct a ship instead.
type Observer struct {
	Position     space.Vec3
	PassiveRange float64
}

// starPosition resolves the star's position at t through the same body
// resolution every other position in this package uses.
func (w World) starPosition(t common.WorldMillis) (space.Vec3, error) {
	return space.Position(w.Bodies, w.StarId, t)
}

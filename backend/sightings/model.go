// Package sightings owns the persisted sighting pile — the one deliberate
// exception to proximity-disclosure's "live disclosure persists nothing." A
// sighting is an immutable, stamped historical claim minted only by a
// resolving focused scan (task 5.8's ScanResolver, in backend/fleet), readable
// later by the corporation that holds it, and never itself an input to a live
// disclosure decision (replace-observation-with-sightings design.md
// Decision 17; specs/sighting-records/spec.md).
//
// This package may import hexaverse/disclosure; hexaverse/disclosure may
// never import this package — enforced at compile time by
// disclosure/purity_test.go's own production-import allow-list. No package
// that assembles a `contacts` response element (currently hexaverse/system
// alone) may import this package either — see
// system/never_imports_sightings_test.go.
package sightings

import (
	"hexaverse/common"
	"hexaverse/space"
)

// PageMax is the named ceiling on a single read of a corporation's sighting
// pile (specs/sighting-records/spec.md — "The Pile Is Paginated and Bounded
// Per Read": "the system SHALL bound every read... to a page no larger than a
// named maximum").
const PageMax = 50

// Sighting is the stored, immutable record a resolving focused scan mints —
// the stored superset of disclosure.Sighting that adds minting provenance
// around its frozen kinematic/composition payload (design.md Decisions 13,
// 14, 16; tasks.md 3.2).
//
// A composition-bearing record (CleanSweep == false) carries a target and its
// frozen payload (Position, Velocity, Emitting, HullCount, HullTypes). A
// clean-sweep record (CleanSweep == true) carries neither — no target was
// masked at the swept host — but still names the host and the sweep
// (specs/sighting-records/spec.md — "A Clean Sweep Is a Record").
type Sighting struct {
	// CorporationId is the minting corporation — the pile this record lives in.
	CorporationId string `json:"corporationId" firestore:"corporationId"`
	// ActionId is the resolving focused-scan action's own id.
	ActionId string `json:"actionId" firestore:"actionId"`
	// SystemId is the system the sighting was minted in — a position with no
	// system is not resolvable to a place.
	SystemId string `json:"systemId" firestore:"systemId"`
	// TargetId names what was sighted. Stored so a future consumer (a
	// correlated track, a sale) has a subject key, but NEVER serialized to the
	// client — a raw fleet id is exactly the dereferenceable tracking handle
	// the information ladder withholds (design.md Decision 16).
	TargetId string `json:"-" firestore:"targetId"`
	// AsOf is the world time the pulse reached the target — pulse-reach, not
	// resolution time, for every record, clean-sweep records included
	// (design.md Decision 14). The pile's only time field.
	AsOf common.WorldMillis `json:"asOf" firestore:"asOf"`
	// Position and Velocity are the target's frozen kinematics at AsOf. Absent
	// (zero value) on a clean-sweep record.
	Position space.Vec3 `json:"position" firestore:"position"`
	Velocity space.Vec3 `json:"velocity" firestore:"velocity"`
	// Emitting is whether the target was running its drive at AsOf. Absent on
	// a clean-sweep record.
	Emitting bool `json:"emitting" firestore:"emitting"`
	// HullCount and HullTypes are the composition a scan resolves that a live
	// contact withholds, frozen at AsOf. Absent on a clean-sweep record.
	HullCount int      `json:"hullCount" firestore:"hullCount"`
	HullTypes []string `json:"hullTypes" firestore:"hullTypes"`
	// CleanSweep marks a record attesting that the resolving sweep found
	// nothing masked at its host — itself a filed, sellable claim.
	CleanSweep bool `json:"cleanSweep" firestore:"cleanSweep"`
	// HostId is the body (or fleet) the sweep was aimed at. Always present,
	// clean sweep or not.
	HostId string `json:"hostId" firestore:"hostId"`
}

package system

import (
	"hexaverse/board"
	"hexaverse/common"
)

// Band is a tile's orbital band, derived from its ring (a pure function of
// radius — never stored per tile).
type Band string

const (
	BandCore  Band = "core"
	BandInner Band = "inner"
	BandMid   Band = "mid"
	BandOuter Band = "outer"
)

// FeatureType is the unified family covering both physical/minable bodies and
// hazards (#0003 Decision #9). Hazards are just features with an `effects`
// payload.
type FeatureType string

const (
	FeatureStar        FeatureType = "star"
	FeatureRocky       FeatureType = "rocky"
	FeatureGasGiant    FeatureType = "gas_giant"
	FeatureIce         FeatureType = "ice"
	FeatureBelt        FeatureType = "belt"
	FeatureMoon        FeatureType = "moon"
	FeatureAnomaly     FeatureType = "anomaly"
	FeatureRuin        FeatureType = "ruin"
	FeatureNebula      FeatureType = "nebula"
	FeatureGravityWell FeatureType = "gravity_well"
	FeatureDebris      FeatureType = "debris"
	FeatureRadiation   FeatureType = "radiation"
	// FeatureStation is an NPC/player trading station (#0011). Unlike every other
	// type here it is NOT produced by the generator and never lives in the
	// features subcollection — it is spliced into a read from its own store. It
	// is also excluded from the fog/scan feature source: it occludes nothing and
	// no scan ever mints an observation for it.
	FeatureStation FeatureType = "station"
)

// ResourceKind is the minable resource family.
type ResourceKind string

const (
	ResourceMetals    ResourceKind = "metals"
	ResourceVolatiles ResourceKind = "volatiles"
	ResourceWater     ResourceKind = "water"
	ResourceOrganics  ResourceKind = "organics"
	ResourceResearch  ResourceKind = "research"
	ResourceExotic    ResourceKind = "exotic"
)

// Resource is a minable payload hanging off a feature. Richness is a 0..1 scale
// dialed by the system's character; the economy (later) turns it into tonnage.
type Resource struct {
	Kind     ResourceKind `json:"kind" firestore:"kind"`
	Richness float64      `json:"richness" firestore:"richness"`
}

// Effects is a hazard payload: it modifies scanning/movement or blocks a tile.
type Effects struct {
	ScanMod float64 `json:"scanMod,omitempty" firestore:"scanMod,omitempty"`
	MoveMod float64 `json:"moveMod,omitempty" firestore:"moveMod,omitempty"`
	Block   bool    `json:"block,omitempty" firestore:"block,omitempty"`
}

// Orbit holds a feature's orbital elements. Its live hex is a pure function of
// (Orbit, worldTime); with motion off/slow the board reads static (#0003
// Decision #5). Angle0 is the ring-position index at the world epoch; Period is
// world-milliseconds for a full revolution; Dir is +1 / −1.
//
// Period is NOT persisted (`firestore:"-"`): it is a pure function of Ring and
// common.Tuning().OrbitPeriod, so it is filled from live tuning on every read
// (see PeriodFor and the DAO). Storing it would freeze the pace of every system
// at the moment it was generated — retuning orbits would then only reach systems
// nobody had visited yet. Ring/Angle0/Dir stay stored: they're the generator's
// dice, not a pacing knob.
type Orbit struct {
	Ring   int                `json:"ring" firestore:"ring"`
	Angle0 int                `json:"angle0" firestore:"angle0"`
	Period common.WorldMillis `json:"period" firestore:"-"`
	Dir    int                `json:"dir" firestore:"dir"`
}

// PeriodFor is a body's orbital period on a ring, read live from tuning. The
// generator and the DAO both go through it, so an in-memory interior and a re-read
// one always agree. It is the SAME law a coasting fleet obeys — a planet and a
// ship on ring N share a period because they share the physics.
func PeriodFor(ring int) common.WorldMillis {
	return common.Tuning().OrbitPeriod(ring)
}

// Feature is one stored object on the board. Position is exactly one of:
// Orbit (orbits the star), ParentId (rides another feature — moons, a planet's
// gravity well), or Fixed (the star at centre). Footprint is the feature's
// epoch cell(s): a single anchor cell for point bodies, a cell-set for fields
// (belt arcs, nebulae). Live cell(s) are computed, never stored per tick.
type Feature struct {
	Id        string       `json:"id" firestore:"id"`
	Type      FeatureType  `json:"type" firestore:"type"`
	Name      string       `json:"name,omitempty" firestore:"name,omitempty"`
	Orbit     *Orbit       `json:"orbit,omitempty" firestore:"orbit,omitempty"`
	ParentId  string       `json:"parentId,omitempty" firestore:"parentId,omitempty"`
	Fixed     bool         `json:"fixed,omitempty" firestore:"fixed,omitempty"`
	Footprint []board.Cell `json:"footprint" firestore:"footprint"`
	Resources []Resource   `json:"resources,omitempty" firestore:"resources,omitempty"`
	Effects   *Effects     `json:"effects,omitempty" firestore:"effects,omitempty"`
	// OwnerCorpId is DTO-only (`firestore:"-"` — never persisted, no schema
	// change): it is populated solely on the station feature spliced into a read
	// from the station store, which is the one feature family that has an owner.
	// Generated features leave it empty, and nothing in this package writes it.
	OwnerCorpId string `json:"ownerCorpId,omitempty" firestore:"-"`
}

// SystemInterior is the interior metadata doc — tiles and features are derived
// / subcollected, never embedded here.
type SystemInterior struct {
	SystemId  string             `json:"systemId" firestore:"systemId"`
	Seed      int64              `json:"seed" firestore:"seed"`
	Radius    int                `json:"radius" firestore:"radius"`
	Character string             `json:"character" firestore:"character"`
	StarClass string             `json:"starClass" firestore:"starClass"`
	Version   int                `json:"version" firestore:"version"`
	CreatedAt common.WorldMillis `json:"createdAt" firestore:"createdAt"`
}

// GeneratedInterior is the full generation output held in memory before
// persistence.
type GeneratedInterior struct {
	Interior SystemInterior
	Features []Feature
}

// bandForRing maps a ring to its band using the params boundaries.
func bandForRing(ring int, p GenerationParams) Band {
	switch {
	case ring == 0:
		return BandCore
	case ring <= p.InnerMaxRing:
		return BandInner
	case ring <= p.MidMaxRing:
		return BandMid
	default:
		return BandOuter
	}
}

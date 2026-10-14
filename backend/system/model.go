package system

import (
	"hexaverse/common"
	"hexaverse/discovery"
	"hexaverse/space"
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
	// features subcollection — it is spliced into a read from its own store.
	// It ships in full, unconditionally, exactly like any other body
	// (replace-observation-with-sightings design.md Decision 4/9,
	// system-interior "Bodies Are Public; Ships Are Disclosed"): the
	// per-feature observation model that used to exclude it from a
	// fog/scan feature source is gone along with that model, so there is
	// nothing left to exclude it from. It occludes nothing either:
	// proximity-disclosure's occlusion rule occludes only by the star —
	// that is a fact about occlusion, not a survivor of the deleted
	// fog/scan feature source.
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

// ReservedFuelResourceKind names the cargo kind add-fuel-as-cargo reserves
// for the fuel currency (fleet.Fleet.Cargo["fuel"]) — never a declared,
// mineable ResourceKind (system-interior "The Fuel Resource-Kind Name Is
// Reserved From Generation"). Deliberately declared WITHOUT an explicit
// ResourceKind type annotation (an untyped string constant, still directly
// comparable to a ResourceKind value): fuel_resource_kind_reserved_test.go's
// own guard parses every ResourceKind-TYPED const out of this file to build
// its "declared" set, and this constant existing IN that set would make the
// guard compare itself against itself and vacuously fail. This is a
// namespace guard over the six declared constants above, not a fifth
// generation-time configuration surface — see add-fuel-as-cargo's own
// implementation-contract ruling for why no ValidateResourceKind/
// GenerationParams field exists here.
const ReservedFuelResourceKind = "fuel"

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

// Feature is one stored object in a system's interior. Its position is its
// continuous orbital element set (Space/Size/Width below): a star-parented
// body orbits the star, a body-parented one (a moon, a planet's gravity well)
// names its parent in Space.ParentId, and the star itself is the one
// parentless body and carries no element set at all.
type Feature struct {
	Discovery       *discovery.Record `json:"discovery,omitempty" firestore:"-"`
	Id              string            `json:"id" firestore:"id"`
	Type            FeatureType       `json:"type" firestore:"type"`
	Name            string            `json:"name,omitempty" firestore:"name,omitempty"`
	GeneratedName   string            `json:"generatedName" firestore:"generatedName"`
	CatalogueRef    string            `json:"catalogueRef" firestore:"catalogueRef"`
	NamingProtected bool              `json:"namingProtected" firestore:"namingProtected"`
	Resources       []Resource        `json:"resources,omitempty" firestore:"resources,omitempty"`
	Effects         *Effects          `json:"effects,omitempty" firestore:"effects,omitempty"`
	// OwnerCorpId is projected from corporate claim authority (or the station store), never persisted on generated geometry.
	OwnerCorpId string `json:"ownerCorpId,omitempty" firestore:"-"`

	// --- orbital element set (add-orbital-system-bodies) -------------------
	//
	// Space is the in-memory, decoded orbital element set. `firestore:"-"`:
	// the DAO never
	// serializes this field directly; SpaceDoc is what crosses the
	// persistence boundary (space.EncodeOrbit on write, space.DecodeOrbit on
	// read — design.md Decision 12). Nil for the star (parentless, no
	// element set) and for any non-star feature whose SpaceDoc failed to
	// decode or was cascaded out (system-interior: "An Interior Predating
	// This Capability Fails Closed" / "A Feature Omission Cascades to a
	// Fixpoint").
	Space *space.Orbit `json:"space,omitempty" firestore:"-"`
	// SpaceDoc is Space's persisted, storage-native form. Nothing outside
	// space.EncodeOrbit/space.DecodeOrbit and this package's own DAO/decode
	// step constructs or reads it.
	SpaceDoc map[string]any `json:"-" firestore:"spaceOrbit,omitempty"`
	// Size is every feature's physical radius, drawn from the second
	// (continuous) RNG stream over a per-FeatureType band (design.md
	// Decision 4), or derived from the star's class. Every feature this
	// generator emits carries a strictly positive Size.
	Size float64 `json:"size,omitempty" firestore:"size,omitempty"`
	// Width is a belt feature's full radial thickness (not a half-width),
	// `= BeltWidthFraction * Space.Radius` at generation time, persisted
	// rather than re-derived (design.md Decision 5). Strictly positive on a
	// belt feature; zero/absent on every other feature type.
	Width float64 `json:"width,omitempty" firestore:"width,omitempty"`
	// Spliced marks a feature that arrived from an in-process SPLICE (e.g.
	// spliceStation's StationSource call) rather than from storage — never
	// persisted, never serialized (`firestore:"-" json:"-"`), an in-memory-only
	// population marker. applyContinuousCascade uses it to distinguish a
	// spliced body's incompleteness (a producer bug: Error severity, omitted)
	// from a stored feature's own corrupt-document decode failure
	// (data rot: Warn severity, omitted) — replace-observation-with-sightings
	// design.md Decision 29's population split (tasks.md 10.9).
	Spliced bool `json:"-" firestore:"-"`
}

// SystemInterior is the interior metadata doc — tiles and features are derived
// / subcollected, never embedded here.
type SystemInterior struct {
	SystemId  string             `json:"systemId" firestore:"systemId"`
	Seed      int64              `json:"seed" firestore:"seed"`
	Character string             `json:"character" firestore:"character"`
	StarClass string             `json:"starClass" firestore:"starClass"`
	Version   int                `json:"version" firestore:"version"`
	CreatedAt common.WorldMillis `json:"createdAt" firestore:"createdAt"`
	// Extent is the continuous upper bound over every generated body's
	// star-frame radius (`= ContinuousRadius(GenerationParams.Radius)`),
	// persisted at generation time (design.md Decision 2). It is what a gate
	// anchors on (Decision 7), and it is the ONLY extent this doc carries:
	// the generation-time orbital index it was computed from is not stored.
	Extent float64 `json:"extent,omitempty" firestore:"extent,omitempty"`
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

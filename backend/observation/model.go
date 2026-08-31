// Package observation owns per-Corporation fog of war (#0006): the observation
// atom (the shared intel-inventory record the market will later trade) and
// the reveal writes. Fog reveals and remembers; it never spoils — spoilage
// (decay, valuation) belongs to the future market domain.
//
// migrate-fleet-to-continuous-burns tasks.md section 7 (design.md Decision
// 11) deletes this package's live half: the lattice-hop sensor-union
// computation read from own units' board cells, a running scan's growing
// echo front, the scan verb's own resolve-and-mint path, the path-swept
// passive reveal a burn resolution used to fold, and the audience-visibility
// check a foreign fleet's read used to run. What survives is the monotonic
// graph-tier ladder, the charted-lane set, and the two arrival reveals —
// none of which read a live position or interior geometry, so this package
// no longer defines a dependency-inversion seam onto either of those
// domains. It imports only common, board (coordinate/orbit types the stored
// records carry), and action (the arrival reveal's write-batch return type).
package observation

import (
	"context"

	"hexaverse/board"
	"hexaverse/common"
)

// Tier is a Corporation's monotonic subspace knowledge of a system, layered
// over the always-free star map (#0006 Decision #4/#6). starVisible is the
// baseline (never stored; the absence of an observation). Reveal is monotonic —
// no code path lowers a tier.
type Tier string

const (
	// TierStarVisible is the free telescope baseline: every system's position,
	// region, and major-body skeleton, visible to everyone from t=0. It is never
	// stored — an absent observation IS star-visible.
	TierStarVisible Tier = "starVisible"
	// TierRumored — a charted lane reaches here: scanning a system charts its
	// lanes and rumors their far endpoints (#0006 Decision #17).
	TierRumored Tier = "rumored"
	// TierSurveyed — the paid appraisal. NO fog code path writes it (#0006
	// Decision #20, 2026-07-14): the value stays in the enum reserved for the
	// market's future bought-intel write.
	TierSurveyed Tier = "surveyed"
	// TierExplored — you went there: full current interior. Travel-arrival grants
	// this (wired at M8); its board then fogs one tier down.
	TierExplored Tier = "explored"
)

// tierRank orders the tiers so an upsert can take the max (monotonicity).
var tierRank = map[Tier]int{
	TierStarVisible: 0,
	TierRumored:     1,
	TierSurveyed:    2,
	TierExplored:    3,
}

// AtLeast reports whether a is at or above b in the reveal ladder.
func (a Tier) AtLeast(b Tier) bool { return tierRank[a] >= tierRank[b] }

// Max returns the higher of two tiers (the monotonic merge).
func Max(a, b Tier) Tier {
	if tierRank[a] >= tierRank[b] {
		return a
	}
	return b
}

// SystemObservation is the graph-tier atom, stored at
// corporations/{cid}/observations/{systemId}. The star layer renders regardless;
// this records the earned subspace knowledge on top of it.
type SystemObservation struct {
	SystemId string             `json:"systemId" firestore:"systemId"`
	Tier     Tier               `json:"tier" firestore:"tier"`
	AsOf     common.WorldMillis `json:"asOf" firestore:"asOf"`
	// Snapshot is the surveyed appraisal (worth/hazards/activity summary). Its
	// valuation/decay lives in the future market domain, never here.
	Snapshot *SystemSnapshot `json:"snapshot,omitempty" firestore:"snapshot,omitempty"`
}

// SystemSnapshot is the coarse graph-tier appraisal a survey mints. Kept minimal
// for the slice; the market spec will extend it (never with price/decay).
type SystemSnapshot struct {
	FeatureCount int `json:"featureCount" firestore:"featureCount"`
}

// LaneObservation records one charted lane, stored at
// corporations/{cid}/lanes/{laneId} — presence of the doc IS "charted"
// (#0006 Decision #17). Written by travel (the lanes you rode) and by scan
// (all lanes of the scanned system); the market's purchased-intel write is the
// schema's third, future author.
type LaneObservation struct {
	LaneId string             `json:"laneId" firestore:"laneId"`
	Via    string             `json:"via" firestore:"via"`
	AsOf   common.WorldMillis `json:"asOf" firestore:"asOf"`
}

// The authors of a charted lane.
const (
	ViaTraveled = "traveled"
	ViaScanned  = "scanned"
)

// FeatureObservation is the board-tier atom, stored per-feature (never per-tile)
// at corporations/{cid}/observations/{systemId}/features/{featureId}. Geometry
// lives (Elements keeps orbiting); activity/detail freeze at AsOf.
type FeatureObservation struct {
	FeatureId string `json:"featureId" firestore:"featureId"`
	// Elements are the body's orbital elements as observed. A remembered feature
	// renders at its CURRENT computed position (board.OrbState) from these — the
	// clockwork keeps ticking (#0006 Decision #9). Nil for fixed/anchored bodies.
	Elements *board.Orbit `json:"elements,omitempty" firestore:"elements,omitempty"`
	// Anchor is the epoch cell for fixed/footprint bodies (the star, belts) that
	// don't orbit.
	Anchor *board.Cell `json:"anchor,omitempty" firestore:"anchor,omitempty"`
	// Detail is the last-scanned composition/threat report (mints the intel).
	Detail *FeatureDetail `json:"detail,omitempty" firestore:"detail,omitempty"`
	// Activity is the last-seen activity (mining, fleets) — frozen at AsOf. Empty
	// in the slice (mining is M10).
	Activity *FeatureActivity   `json:"activity,omitempty" firestore:"activity,omitempty"`
	AsOf     common.WorldMillis `json:"asOf" firestore:"asOf"`
}

// FeatureDetail is a scan's composition/threat report for one feature.
type FeatureDetail struct {
	FeatureType string             `json:"featureType" firestore:"featureType"`
	Resources   []ResourceReading  `json:"resources,omitempty" firestore:"resources,omitempty"`
	Threat      string             `json:"threat,omitempty" firestore:"threat,omitempty"`
}

// ResourceReading is a scanned resource composition (richness as appraised).
type ResourceReading struct {
	Kind     string  `json:"kind" firestore:"kind"`
	Richness float64 `json:"richness" firestore:"richness"`
}

// FeatureActivity is the frozen "what was happening here" line (remaining lode,
// fleets present). Populated once mining lands (M10).
type FeatureActivity struct {
	Summary string `json:"summary,omitempty" firestore:"summary,omitempty"`
}

// --- dependency-inversion inputs (defined here, implemented by other domains) -
//
// Band/BandVisible/BandRemembered (a board-tier feature's per-requester
// visibility) and FeatureMemory (the remembered-feature render shape) used to
// live here too, backing the same three-band fog projection RememberedFeatures
// served (see the doc comment on service.go's reveal-writes section). Deleted
// here as part of resolving tasks.md 7's ambiguity note 1: with
// RememberedFeatures itself already gone, nothing in this codebase's four
// surviving requirements (the graph-tier ladder, travel/spawn arrival reveal,
// the charted-lane set projection) constructs or reads a Band or a
// FeatureMemory. FeatureObservation — the stored atom these were built FROM —
// is kept: it is still read and written by the DAO
// (ListFeatureObservations/UpsertFeatureObservation), still exercised directly
// by observation/dao_test.go's round-trip test, and is the persisted board-tier
// record surviving requirements' storage layer, distinct from the deleted
// per-requester projection shape.
//
// The unit-position and interior-geometry shapes the deleted lattice-hop
// coverage computation, echo front, and scan mint read from the fleet and
// system domains are deleted outright by migrate-fleet-to-continuous-burns
// tasks.md 7.1-7.5 (design.md Decision 11): a fleet no longer has a board
// cell for such a shape to carry, and nothing in this package's surviving
// requirements reads interior geometry. The system package's method that
// used to project a system's features into that shape is replaced (not
// adapted) by system-interior's unfogged interim read (tasks.md 7.7).

// LaneEnd is one lane incident to a system: its id and the far endpoint —
// what a scan charts and rumors (#0006 Decision #17).
type LaneEnd struct {
	LaneId        string
	OtherSystemId string
}

// LaneSource is the galaxy-domain dependency (galaxy.Service implements it),
// listing the lanes incident to a system. Lanes are subspace apertures: their
// detection is non-directional and never occluded, unlike everything physical
// the same scan sees (#0006 Decision #16).
//
// EnsureLaneHorizon is the endless-galaxy seam: the galaxy is the materialized
// subset of an infinite field, so a scan at the frontier must first make the
// scanned system's onward neighbourhood exist (create-if-absent; a no-op once
// persisted). Without it LanesOf would answer with the persisted graph's edge —
// a false dead end where the field actually continues.
type LaneSource interface {
	LanesOf(ctx context.Context, systemID string) ([]LaneEnd, error)
	EnsureLaneHorizon(ctx context.Context, systemID string) error
}

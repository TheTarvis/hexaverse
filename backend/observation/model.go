// Package observation owns per-Corporation fog of war (#0006): the observation
// atom (the shared intel-inventory record the market will later trade), the
// reveal writes, and the fog-filter service other domains call to project any
// read per requester. Fog reveals and remembers; it never spoils — spoilage
// (decay, valuation) belongs to the future market domain.
//
// Layering: this package is dependency-inverted. It defines the narrow
// interfaces it needs from other domains (FleetSource, InteriorSource) and is
// imported BY the read surfaces it fogs (galaxy/system/fleet handlers), so the
// retrofit is one clean seam per read with no import cycles. It imports only
// common, board, and action (for the scan resolver's return types).
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
	// TierRumored — presence at a lane endpoint taught you a lane reaches here.
	TierRumored Tier = "rumored"
	// TierSurveyed — the paid appraisal (worth, hazards, activity). A scan grants
	// this in the slice (quick-sweep/deep-scan collapsed to one action).
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

// FeatureObservation is the board-tier atom, stored per-feature (never per-tile)
// at corporations/{cid}/observations/{systemId}/features/{featureId}. Geometry
// lives (Elements keeps orbiting); activity/detail freeze at AsOf.
type FeatureObservation struct {
	FeatureId string `json:"featureId" firestore:"featureId"`
	// Elements are the body's orbital elements as observed. A remembered feature
	// renders at its CURRENT computed position (board.OrbState) from these — the
	// clockwork keeps ticking (#0006 Decision #9). Nil for fixed/anchored bodies.
	Elements *board.Orbit `json:"elements,omitempty" firestore:"elements,omitempty"`
	// Anchor is the epoch hex for fixed/footprint bodies (the star, belts) that
	// don't orbit.
	Anchor *board.Hex `json:"anchor,omitempty" firestore:"anchor,omitempty"`
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

// --- projection outputs (what the fog filter hands consumers) ---------------

// Band is a board-tier feature's visibility for a requester. Unseen features are
// simply absent from the projection (empty space is never remembered).
type Band string

const (
	// BandVisible — inside the requester's live sensor union right now (live truth).
	BandVisible Band = "visible"
	// BandRemembered — observed before, no longer covered (last snapshot; geometry
	// still ticks, activity frozen at AsOf).
	BandRemembered Band = "remembered"
)

// FeatureMemory is what a consumer needs to render a remembered feature: its
// elements (to compute the current position) plus the frozen detail/activity.
type FeatureMemory struct {
	Elements *board.Orbit
	Anchor   *board.Hex
	Detail   *FeatureDetail
	Activity *FeatureActivity
	AsOf     common.WorldMillis
}

// --- dependency-inversion inputs (defined here, implemented by other domains) -

// FleetPos is a unit's live position for coverage math — the minimal shape
// observation needs from the fleet domain, so it never imports fleet.
type FleetPos struct {
	Id            string
	CorporationId string
	SystemId      string
	Hex           board.Hex
}

// FeatureGeom is the minimal geometry+composition observation needs from the
// system domain to compute coverage and mint scan snapshots — so it never
// imports system. Astronomical marks the free layer (star + major bodies), which
// is shown to every arriver regardless of fog.
type FeatureGeom struct {
	Id           string
	Elements     *board.Orbit
	Anchor       board.Hex
	Astronomical bool
	Detail       *FeatureDetail
}

// FleetSource is the fleet-domain dependency (fleet.Service implements it). It
// returns the corp's units with positions resolved at `now`.
type FleetSource interface {
	FleetsForCorp(ctx context.Context, corporationID string, now common.WorldMillis) ([]FleetPos, error)
}

// InteriorSource is the system-domain dependency (system.Service implements it),
// returning a system's features as minimal geometry.
type InteriorSource interface {
	Features(ctx context.Context, systemID string) ([]FeatureGeom, error)
}

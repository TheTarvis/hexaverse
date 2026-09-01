// Package charts owns each corporation's map knowledge of the galactic
// graph — which systems it has visited and which lanes it has charted — the
// rehomed survivor of observation-fog-and-scan's four live-model-era
// requirements (replace-observation-with-sightings design.md Decision 1).
// The graph never carried the live-perception fog the continuous-space pivot
// deleted, so its knowledge ladder, its charted-lane projection, and its
// arrival writers move here unchanged in substance rather than being deleted
// with the package they used to live in (backend/observation).
//
// This capability answers "what does this corporation know about the galaxy
// graph," never "what can this corporation currently see" — proximity-
// disclosure and sightings own live perception and the persisted sighting
// pile respectively, and this package's stored knowledge is never an input
// to either (specs/galaxy-knowledge/spec.md — "A Knowledge Write Never
// Decides Live Disclosure").
package charts

import "hexaverse/common"

// Tier is a corporation's monotonic subspace knowledge of a system, layered
// over the always-free star map. starVisible is the baseline (never stored;
// the absence of a knowledge record). A write is monotonic — no code path in
// this package lowers a stored tier.
type Tier string

const (
	// TierStarVisible is the free telescope baseline: every system's position,
	// region, and major-body skeleton, visible to everyone from t=0. Never
	// stored — an absent knowledge record IS star-visible.
	TierStarVisible Tier = "starVisible"
	// TierRumored is a lower rung above the free baseline, reserved for a
	// future author (no writer in this package mints it today).
	TierRumored Tier = "rumored"
	// TierSurveyed is the paid appraisal. No writer in this capability mints
	// it — the value stays reserved for the future paid-intel-sale write.
	TierSurveyed Tier = "surveyed"
	// TierExplored — you went there: full current interior. Travel arrival
	// and spawn arrival both grant this.
	TierExplored Tier = "explored"
)

// tierRank orders the tiers so an upsert can take the max (monotonicity).
var tierRank = map[Tier]int{
	TierStarVisible: 0,
	TierRumored:     1,
	TierSurveyed:    2,
	TierExplored:    3,
}

// AtLeast reports whether a is at or above b in the knowledge ladder.
func (a Tier) AtLeast(b Tier) bool { return tierRank[a] >= tierRank[b] }

// Max returns the higher of two tiers (the monotonic merge).
func Max(a, b Tier) Tier {
	if tierRank[a] >= tierRank[b] {
		return a
	}
	return b
}

// SystemKnowledge is the graph-tier atom, stored at
// corporations/{cid}/charts/{systemId}.
type SystemKnowledge struct {
	SystemId string             `json:"systemId" firestore:"systemId"`
	Tier     Tier               `json:"tier" firestore:"tier"`
	AsOf     common.WorldMillis `json:"asOf" firestore:"asOf"`
}

// The authors of a charted lane (specs/galaxy-knowledge/spec.md — "Travel
// Arrival Knowledge Write", "Gate-Attachment Knowledge Write"). Purchased
// intel is the schema's future third author (design.md Decision 3, item 3);
// it mints no writer here.
const (
	ViaTraveled = "traveled"
	ViaGate     = "gate"
)

// ChartedLane records one charted lane, stored at
// corporations/{cid}/chartedLanes/{laneId} — presence of the doc IS
// "charted" (specs/galaxy-knowledge/spec.md — "Charted-Lane Set
// Projection").
type ChartedLane struct {
	LaneId string             `json:"laneId" firestore:"laneId"`
	Via    string             `json:"via" firestore:"via"`
	AsOf   common.WorldMillis `json:"asOf" firestore:"asOf"`
}

package system

import (
	"strings"

	"hexaverse/board"
)

// migrate-fleet-to-continuous-burns tasks.md 7.7 (design.md Decision 11)
// deletes this file's former reason to exist: projecting a system's
// features into the minimal geometry/composition shape observation's
// deleted sensor-coverage computation and scan mint needed. What remains are
// two small, purely local helpers with no tie to observation at all —
// occlusionRadius2 and isAstronomical are exercised directly by
// station_splice_test.go and are exactly the per-feature-type facts a
// future line-of-sight-aware read (link 5's disclosure-projected read, or
// any other consumer of board.LineOfSight-shaped occlusion) will need
// again, so they stay rather than being deleted and reinvented.

// occlusionRadius2 maps a feature type to its pinned squared occlusion radius
// (design.md Decision 1): the star and planets shadow the lightspeed channel
// with a real radius, not a boolean; belts, moons, hazards, and the station
// (excluded from every feature source that would ask) don't occlude at all.
// Which feature types qualify, and their radius, is this domain's rule.
func occlusionRadius2(t FeatureType) int64 {
	switch t {
	case FeatureStar:
		return board.StarOcclusionRadius2
	case FeatureRocky, FeatureGasGiant, FeatureIce:
		return board.PlanetOcclusionRadius2
	default:
		return 0
	}
}

// isAstronomical marks the free telescope layer — the star + the major-body
// skeleton (feat-body-N, mirroring generator.go's ids). A station is never
// astronomical: its visibility comes from its own graph-tier rule, not this
// classification.
func isAstronomical(featureID string) bool {
	return featureID == "feat-star" || strings.HasPrefix(featureID, "feat-body-")
}

package system

import "strings"

// migrate-fleet-to-continuous-burns tasks.md 7.7 (design.md Decision 11)
// deleted this file's former reason to exist: projecting a system's features
// into the minimal geometry/composition shape observation's deleted
// sensor-coverage computation and scan mint needed. The last of that geometry
// — occlusionRadius2, whose squared radii were expressed in the retired
// coordinate table's units and which never had a production caller — has now
// gone too. What remains is isAstronomical, a purely local helper with no tie
// to observation at all; occlusion itself lives in proximity-disclosure, in
// R³.

// isAstronomical marks the free telescope layer — the star + the major-body
// skeleton (feat-body-N, mirroring generator.go's ids). A station is never
// astronomical: its visibility comes from its own graph-tier rule, not this
// classification.
func isAstronomical(featureID string) bool {
	return featureID == "feat-star" || strings.HasPrefix(featureID, "feat-body-")
}

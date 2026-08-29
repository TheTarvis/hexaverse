package stations

// DeriveContinuousOrbit — the station's continuous placement (openspec
// add-orbital-system-bodies, design.md Decision 6). Sits beside DeriveOrbit
// (placement.go), the lattice derivation this change does not touch — see
// DeriveOrbit's own doc comment for the deletion schedule (link 6).
//
// The law itself lives in `system`, not here: `system` already owns
// MaxFeatureSize, featureTypeForBody, and the inclination convention, and
// keeping every new rule-bearing float in `system` holds this change's
// determinism-gate CI edit to one package (design.md Decision 6's own
// governance call). `stations` delegates in one line.

import (
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"
)

// DeriveContinuousOrbit delegates to system.StationContinuousOrbit — no new
// rule-bearing float law in this package.
func DeriveContinuousOrbit(galaxySeed int64, systemID string, skeleton galaxy.Skeleton) space.Orbit {
	return system.StationContinuousOrbit(galaxySeed, systemID, skeleton)
}

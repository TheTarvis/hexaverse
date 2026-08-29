package stations

// RED-phase tests for openspec change add-orbital-system-bodies —
// trading-station spec: "A Station's Continuous Orbit Is Derived, Never
// Rolled".
//
// SDET-CHOSEN CONTRACT: `func DeriveContinuousOrbit(galaxySeed int64,
// systemID string, skeleton galaxy.Skeleton) space.Orbit` in this package,
// delegating in one line to `system.StationContinuousOrbit(galaxySeed,
// systemId string, skeleton galaxy.Skeleton) space.Orbit` — the LATTER
// signature is pinned verbatim by design.md Decision 9/6's own text
// ("system exports StationContinuousOrbit(galaxySeed, systemId string,
// skeleton galaxy.Skeleton) space.Orbit; stations.DeriveContinuousOrbit is a
// one-line call to it"). The stations-side wrapper's exact name is a
// mechanical-rename risk only; the assertion below is checked against BOTH
// functions' identical output, so a rename does not invalidate the test's
// intent.
//
// Every OTHER scenario originally in this file — the ones that concern
// `system.StationContinuousOrbit` itself, not this package's one-line
// wrapper — moved to backend/system/station_continuous_test.go on
// 2026-08-28, in-package (white-box), to satisfy the repo's
// one-test-file-per-source-file coverage convention (station_continuous.go
// lives in package `system`, not here). No assertion changed; see that
// file's own header for the full list.

import (
	"testing"

	"hexaverse/galaxy"
	"hexaverse/system"
)

func skeletonWithGasGiant() galaxy.Skeleton {
	return galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{
		{Type: galaxy.BodyRocky, Ring: 0},
		{Type: galaxy.BodyGasGiant, Ring: 7},
	}}
}

// Scenario: A healed re-derivation lands on the identical continuous orbit.
func TestStationContinuousOrbit_Scenario_HealedRederivationIsIdentical(t *testing.T) {
	sk := skeletonWithGasGiant()
	a := system.StationContinuousOrbit(42, "sys-station", sk)
	b := system.StationContinuousOrbit(42, "sys-station", sk)
	if a != b {
		t.Fatalf("StationContinuousOrbit not reproducible: %+v vs %+v", a, b)
	}
	// The stations-package delegate must agree exactly.
	c := DeriveContinuousOrbit(42, "sys-station", sk)
	if c != a {
		t.Fatalf("DeriveContinuousOrbit disagrees with system.StationContinuousOrbit: %+v vs %+v", c, a)
	}
}

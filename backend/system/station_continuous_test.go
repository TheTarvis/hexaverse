package system

// RED-phase tests for openspec change add-orbital-system-bodies —
// trading-station spec: "A Station's Continuous Orbit Is Derived, Never
// Rolled" (design.md Decision 6).
//
// These tests were originally authored (and are still partly duplicated, by
// design, for the one delegate-agreement scenario) in
// backend/stations/continuous_orbit_test.go, which tests
// `stations.DeriveContinuousOrbit`'s one-line delegation to
// `system.StationContinuousOrbit` from the outside. Every scenario here that
// concerns `system.StationContinuousOrbit` ITSELF (not the stations-package
// wrapper) moved to this file 2026-08-28, in-package (white-box), to satisfy
// the repo's one-test-file-per-source-file coverage convention — no
// assertion changed. `TestStationContinuousOrbit_Scenario_HealedRederivationIsIdentical`
// stayed in stations/continuous_orbit_test.go because it is the one scenario
// that genuinely needs both packages (it asserts the wrapper agrees with the
// underlying function).

import (
	"testing"

	"hexaverse/galaxy"
	"hexaverse/space"
)

func skeletonWithGasGiant() galaxy.Skeleton {
	return galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{
		{Type: galaxy.BodyRocky, Ring: 0},
		{Type: galaxy.BodyGasGiant, Ring: 7},
	}}
}

// Scenario: The continuous parent is a generated skeleton body, not the
// star.
func TestStationContinuousOrbit_Scenario_ParentIsSkeletonBodyNotStar(t *testing.T) {
	sk := skeletonWithGasGiant()
	orbit := StationContinuousOrbit(7, "sys-station", sk)
	if orbit.ParentId == "" {
		t.Fatal("station orbit has no parent id at all")
	}
	if orbit.ParentId == "feat-star" {
		t.Fatal("station's continuous parent is the star, want one of the skeleton bodies")
	}
	valid := map[string]bool{"feat-body-0": true, "feat-body-1": true}
	if !valid[orbit.ParentId] {
		t.Fatalf("station's continuous parent %q is not a recognizable skeleton body id (feat-body-0/1)", orbit.ParentId)
	}
}

// Scenario: The station's inclination matches its system's dominant
// convention.
func TestStationContinuousOrbit_Scenario_InclinationMatchesDominantConvention(t *testing.T) {
	sk := skeletonWithGasGiant()
	// Find seeds giving opposite dominant directions, so the test genuinely
	// exercises both sides rather than assuming which seed lands where.
	var progradeSeed, retrogradeSeed int64 = -1, -1
	for seed := int64(0); seed < 10_000; seed++ {
		if DominantOrbitDirection(seed) > 0 && progradeSeed == -1 {
			progradeSeed = seed
		}
		if DominantOrbitDirection(seed) < 0 && retrogradeSeed == -1 {
			retrogradeSeed = seed
		}
		if progradeSeed != -1 && retrogradeSeed != -1 {
			break
		}
	}
	if progradeSeed == -1 || retrogradeSeed == -1 {
		t.Fatal("fixture: could not find both a prograde and a retrograde seed within the search bound")
	}

	pro := StationContinuousOrbit(progradeSeed, "sys-p", sk)
	retro := StationContinuousOrbit(retrogradeSeed, "sys-r", sk)

	if isSubTurnRetrograde(pro.Inclination) {
		t.Errorf("prograde-system station inclination %v reads as retrograde", pro.Inclination)
	}
	if !isSubTurnRetrograde(retro.Inclination) {
		t.Errorf("retrograde-system station inclination %v reads as prograde", retro.Inclination)
	}
}

// isSubTurnRetrograde classifies an inclination as retrograde using the
// SAME quarter-turn convention design.md Decision 1 defines (inclination
// past SubTurn/4 is retrograde) — duplicated here (rather than imported)
// because it is a spec-level convention, not a system-package internal.
func isSubTurnRetrograde(i space.SubTurns) bool {
	return i > space.SubTurn/4
}

// Scenario: An empty skeleton falls back to a star-parented orbit.
func TestStationContinuousOrbit_Scenario_EmptySkeletonFallsBackToStar(t *testing.T) {
	empty := galaxy.Skeleton{StarClass: "G", Bodies: nil}
	orbit := StationContinuousOrbit(7, "sys-empty", empty)
	if orbit.ParentId != "feat-star" {
		t.Errorf("empty-skeleton station parent = %q, want feat-star", orbit.ParentId)
	}
	if orbit.Radius != StationFallbackRadius {
		t.Errorf("empty-skeleton station radius = %v, want the configured StationFallbackRadius = %v", orbit.Radius, StationFallbackRadius)
	}
}

// Scenario: The derivation reads no store and no clock.
//
// Structural: the function signature itself takes no context.Context, no
// store handle, and no clock — it is called here with nothing but the three
// documented pure inputs, and succeeds.
func TestStationContinuousOrbit_Scenario_ReadsNoStoreNoClock(t *testing.T) {
	sk := skeletonWithGasGiant()
	orbit := StationContinuousOrbit(123, "sys-pure", sk) // no ctx, no dao, no clock passed anywhere
	if orbit.ParentId == "" {
		t.Fatal("derivation from pure inputs alone produced no parent")
	}
}

// Scenario: The derived local radius is identical whether or not the
// interior has ever been materialized.
//
// Tested against Decision 6's own literal closed-form table rather than by
// actually materializing an interior (which the requirement itself says the
// derivation must NOT read) — the exact numbers design.md pins:
// gas giant -> 14.5, ice -> 10.75, rocky -> 10.0.
func TestStationContinuousOrbit_Scenario_LocalRadiusIndependentOfMaterialization(t *testing.T) {
	cases := []struct {
		parent galaxy.BodyType
		want   float64
	}{
		{galaxy.BodyGasGiant, 14.5},
		{galaxy.BodyIce, 10.75},
		{galaxy.BodyRocky, 10.0},
	}
	for _, c := range cases {
		sk := galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: c.parent, Ring: 3}}}
		orbit := StationContinuousOrbit(999, "sys-radius", sk)
		if orbit.Radius != c.want {
			t.Errorf("parent type %s: station local radius = %v, want %v (Decision 6's pinned closed form)", c.parent, orbit.Radius, c.want)
		}
	}
}

// Scenario: The continuous parent chain resolves within the depth bound.
//
// A single-body skeleton makes the parent choice (k mod skeletonBodyCount)
// deterministically index 0, so the fixture's fakeBodies map can name that
// exact body without depending on the (unspecified, hash-based) parent-pick
// formula's output.
func TestStationContinuousOrbit_Scenario_ParentChainResolvesWithinDepthBound(t *testing.T) {
	sk := galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyGasGiant, Ring: 7}}}
	orbit := StationContinuousOrbit(55, "sys-chain", sk)
	if orbit.ParentId != "feat-body-0" {
		t.Fatalf("fixture: single-body skeleton did not select feat-body-0 as parent (got %q) — the parent-choice formula's assumed determinism does not hold as expected", orbit.ParentId)
	}

	giantRadius := ContinuousRadius(7)
	bodies := fakeBodies{
		"feat-star":   {Id: "feat-star", Size: StarSize("G")},
		"feat-body-0": {Id: "feat-body-0", Size: 4.0, Orbit: &space.Orbit{ParentId: "feat-star", Radius: giantRadius, PeriodMs: 400_000}},
		"feat-station": {Id: "feat-station", Size: 0.9, Orbit: &space.Orbit{
			ParentId: orbit.ParentId, Radius: orbit.Radius, PeriodMs: orbit.PeriodMs,
			Phase: orbit.Phase, Inclination: orbit.Inclination, Node: orbit.Node,
		}},
	}
	if _, err := space.Position(bodies, "feat-station", 0); err != nil {
		t.Fatalf("station's continuous parent chain failed to resolve: %v", err)
	}
}

// fakeBodies is a minimal space.Bodies for this file's own tests.
type fakeBodies map[string]space.Body

func (b fakeBodies) Body(id string) (space.Body, bool) {
	v, ok := b[id]
	return v, ok
}

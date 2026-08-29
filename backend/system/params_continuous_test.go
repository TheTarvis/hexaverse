package system

// RED-phase tests for openspec change add-orbital-system-bodies — the
// PROOF-BACKING calibration tests for params_continuous.go's tuning
// constants.
//
// These tests were originally authored in continuous_test.go (moved here,
// 2026-08-28, to satisfy the repo's one-test-file-per-source-file coverage
// convention — no assertion changed). params_continuous.go's own doc
// comments name several of these tests VERBATIM as the proof a future
// retune must re-check (BaseOrbitRadius's four inequalities,
// RadiusGrowth/BeltWidthFraction's spacing inequality, MoonOrbitMin/Max's
// band bounds, MaxInclinationJitter's quarter-turn ceiling,
// StationFallbackRadius's clearance/extent bracket) — this file is where a
// developer retuning one of those constants should look first.
//
// Every assertion below reads the OTHER capability's live
// constant/function — never a copied literal — per design.md Decision 14's
// explicit warning.

import (
	"testing"

	"hexaverse/disclosure"
	"hexaverse/space"
)

// --- BaseOrbitRadius invariant #4 / MoonOrbitMin,Max's own band bound -----

// Scenario: The moon-orbit band cannot reach the next star-parented orbit.
func TestMoonOrbitLocalRadius_Scenario_BandCeilingBelowBaseOrbitRadius(t *testing.T) {
	maxGiant := space.Body{Id: "feat-body-max", Size: 4.2} // the largest configured gas-giant size
	ceiling := MoonOrbitLocalRadius(maxGiant, 1.0-1e-12)   // u -> 1 (exclusive) is the band's ceiling
	// Directly assert the enforceable closed form design.md names, too.
	closedForm := maxGiant.Size + space.InsertionStandoff(maxGiant) + MoonOrbitMax
	if !(closedForm < BaseOrbitRadius) {
		t.Fatalf("maxGiantSize + InsertionStandoff(maxGiantSize) + MoonOrbitMax = %v, want strictly less than BaseOrbitRadius (%v)", closedForm, BaseOrbitRadius)
	}
	if !(ceiling < BaseOrbitRadius) {
		t.Errorf("MoonOrbitLocalRadius at u->1 = %v, want strictly less than BaseOrbitRadius (%v)", ceiling, BaseOrbitRadius)
	}
}

// --- Decision 14 / "Generated Orbits Satisfy Their Cross-Capability..." ---

// Scenario: The innermost star-parented radius exceeds the configured
// passive range.
func TestCalibration_Scenario_InnermostExceedsPassiveRange(t *testing.T) {
	if !(ContinuousRadius(0) > disclosure.PassiveRange) {
		t.Fatalf("ContinuousRadius(0) = %v, want strictly greater than the LIVE disclosure.PassiveRange = %v", ContinuousRadius(0), disclosure.PassiveRange)
	}
}

// Scenario: The outermost skeleton radius exceeds the configured plume
// floor, even in the degenerate one-body system (outermost == innermost).
func TestCalibration_Scenario_DegenerateOneBodyExceedsPlumeFloor(t *testing.T) {
	degenerateOutermostEqualsInnermost := ContinuousRadius(0)
	if !(degenerateOutermostEqualsInnermost > disclosure.PlumeFloor) {
		t.Fatalf("ContinuousRadius(0) = %v, want strictly greater than the LIVE disclosure.PlumeFloor = %v (the degenerate single-body-at-ordinal-0 system is the binding case)",
			degenerateOutermostEqualsInnermost, disclosure.PlumeFloor)
	}
}

// Scenario: No star size can place a body inside its own star's clearance
// shell.
func TestCalibration_Scenario_NoStarSizePlacesBodyInsideClearanceShell(t *testing.T) {
	classes := []string{"O", "B", "A", "F", "G", "K", "M", "unrecognized"}
	max := 0.0
	for _, c := range classes {
		if s := StarSize(c); s > max {
			max = s
		}
	}
	if got := space.StarClearanceRadius(max); !(got < BaseOrbitRadius) {
		t.Fatalf("space.StarClearanceRadius(max(StarSize)=%v) = %v, want strictly less than BaseOrbitRadius (%v)", max, got, BaseOrbitRadius)
	}
}

// Scenario: A belt's width jitter can never reach the next orbital index.
func TestCalibration_Scenario_BeltWidthJitterNeverReachesNextIndex(t *testing.T) {
	if got := 1 + BeltWidthFraction/2; !(got < RadiusGrowth) {
		t.Fatalf("1 + BeltWidthFraction/2 = %v, want strictly less than RadiusGrowth (%v)", got, RadiusGrowth)
	}
}

// --- MaxInclinationJitter's own configured ceiling ------------------------

// Scenario: Every generated inclination lies within its configured band
// (structural half: the configured jitter itself is inside the legal
// range). The dynamic half (an actually-generated inclination) is in
// generator_continuous_test.go.
func TestInclinationConvention_Scenario_JitterBelowQuarterTurnBoundary(t *testing.T) {
	if !(MaxInclinationJitter < space.SubTurn/8) {
		t.Fatalf("MaxInclinationJitter = %v, want strictly less than SubTurn/8 = %v", MaxInclinationJitter, space.SubTurn/8)
	}
}

// --- StationFallbackRadius's own clearance/extent bracket -----------------

// Scenario: The fallback radius clears the star's clearance shell and stays
// inside the interior's extent.
func TestStationFallbackRadius_Scenario_ClearsStarShellAndStaysInsideExtent(t *testing.T) {
	maxStarSize := 0.0
	for _, c := range []string{"O", "B", "A", "F", "G", "K", "M"} {
		if s := StarSize(c); s > maxStarSize {
			maxStarSize = s
		}
	}
	lower := space.StarClearanceRadius(maxStarSize)
	upper := ContinuousRadius(DefaultParams().Radius) // Extent, by construction

	if !(StationFallbackRadius > lower) {
		t.Errorf("StationFallbackRadius (%v) must be strictly greater than space.StarClearanceRadius(maxStarSize) (%v)", StationFallbackRadius, lower)
	}
	if !(StationFallbackRadius < upper) {
		t.Errorf("StationFallbackRadius (%v) must be strictly less than the interior's Extent (%v)", StationFallbackRadius, upper)
	}
}

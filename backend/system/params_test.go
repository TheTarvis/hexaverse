package system

// Tests for params.go's own content: GenerationParams/DefaultParams's
// cross-domain Radius invariant (openspec add-orbital-system-bodies,
// design.md Decision 14), and dialFor's region-lookup default.
//
// TestCalibration_Scenario_NoSkeletonRingExceedsExtentIndex was originally
// authored in continuous_test.go (moved here 2026-08-28, no assertion
// changed) — it is the exact test params.go's own DefaultParams() doc
// comment names as the proof that Radius sourcing from
// common.Tuning().BoardRadius still satisfies
// `galaxy.DefaultParams().MaxRings - 1 <= Radius`, reading MaxRings LIVE
// rather than a copied literal.

import (
	"testing"

	"hexaverse/galaxy"
)

// Scenario: No skeleton ring can exceed the index Extent is computed at.
func TestCalibration_Scenario_NoSkeletonRingExceedsExtentIndex(t *testing.T) {
	maxRings := galaxy.DefaultParams().MaxRings
	radius := DefaultParams().Radius
	if !(maxRings-1 <= radius) {
		t.Fatalf("galaxy.DefaultParams().MaxRings-1 (%d) must be <= system.DefaultParams().Radius (%d)", maxRings-1, radius)
	}
}

// Scenario: An unrecognized region falls back to the "normal" dial.
//
// SDET-added boundary probe: params.go's dialFor has a documented default
// ("dialFor returns the character dial for a region, defaulting to
// 'normal'"), but every existing caller in this package passes one of the
// four configured region strings, so the fallback branch itself had no
// direct test before this file.
func TestDefaultParams_Scenario_DialForUnknownRegionDefaultsToNormal(t *testing.T) {
	p := DefaultParams()
	got := p.dialFor("some-region-that-does-not-exist")
	want := p.ByCharacter["normal"]
	if got != want {
		t.Fatalf("dialFor(unrecognized) = %+v, want the \"normal\" dial %+v", got, want)
	}
}

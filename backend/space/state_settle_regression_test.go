package space

import (
	"testing"

	"hexaverse/common"
)

// tasks.md 2.8: regression coverage that space-kinematics MODIFIED
// requirement "A Burn Past Its Arrival Is Its Settled Park, With No Extra
// Persisted State" still holds once ModeDrift and the widened codec land.
//
// Four of its five scenarios are this capability's PRE-EXISTING behavior,
// unchanged by this link, and already pinned by state_test.go (committed
// under the earlier add-space-kinematics link, before this handoff, and left
// untouched here per this handoff's own instruction not to re-litigate
// already-passing coverage):
//
//   - "still burning immediately before arrival and settled immediately
//     after"          -> TestStateAt_Scenario_BurningBeforeSettledAfter
//   - "folding at two later times gives identical results"
//     -> TestStateAt_Scenario_FoldingAtTwoLaterTimesIsIdentical
//   - "a settled body-targeted burn rides its insertion orbit"
//     -> TestStateAt_Scenario_SettledBurnRidesInsertionOrbit
//   - "a burn to a fixed point settles into a point park"
//     -> TestStateAt_Scenario_PointTargetBurnSettlesIntoPointPark
//
// This handoff's own full-suite run (recorded in the SDET report) is what
// re-confirms those four still pass once this link's new files compile;
// nothing about StateAt's burn-settlement branch changes in this link
// (Decision 5's own audit: only the ModeDrift arm is new, and it is a
// disjoint early-return — see state.go:35's existing
// `s.Mode == ModeParked || s.Burn == nil` guard).
//
// The fifth scenario is genuinely NEW to this link and has no pre-existing
// test: a drift never settles into a park, at any fold distance. That is
// this file's one test.

// Scenario: A drift never settles into a park at any fold distance.
func TestStateAt_Scenario_DriftNeverSettlesIntoAParkAtAnyFoldDistance(t *testing.T) {
	bodies := testSystem()
	d := Drift{
		Anchor:   Vec3{X: 5, Y: 0, Z: 5},
		Velocity: Vec3{X: -1, Y: 0, Z: 2},
		EpochMs:  10_000,
	}
	initial := ShipState{Mode: ModeDrift, Drift: &d}

	for _, tm := range []struct {
		name string
		t    common.WorldMillis
	}{
		{"one millisecond after epoch", 10_001},
		{"far after epoch", 10_000 + 50_000_000},
		{"extremely far after epoch", 10_000 + 999_999_999_999},
		{"before epoch", 5_000},
	} {
		t.Run(tm.name, func(t *testing.T) {
			got, err := StateAt(bodies, initial, tm.t)
			requireNoError(t, err)
			if got.Mode != ModeDrift {
				t.Fatalf("StateAt at %s (t=%d) = mode %v, want ModeDrift — a drift never settles at any fold distance", tm.name, tm.t, got.Mode)
			}
			if got.Park != nil {
				t.Errorf("StateAt at %s produced a non-nil Park %+v, want nil", tm.name, got.Park)
			}
			if got.Drift == nil || *got.Drift != d {
				t.Errorf("StateAt at %s changed the drift: got %+v, want the identical stored drift %+v", tm.name, got.Drift, d)
			}
		})
	}
}

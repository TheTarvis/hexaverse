package charts

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 2.2 — "Scaffold backend/charts (the standard six-file domain
// shape) and port the monotonic knowledge ladder: charts.Tier,
// charts.TierExplored, never-downgrade-on-write semantics."
// (specs/galaxy-knowledge/spec.md — "Monotonic System-Knowledge Ladder".)
//
// These are PORTS, not new behaviour: the ladder itself (starVisible <
// rumored < surveyed < explored, Max/AtLeast) is byte-for-byte the same rule
// backend/observation/model_test.go (TestTierOrdering) and
// backend/observation/graph_tier_ladder_gaps_test.go already exercise and
// pass under the old package name. The test is red here for exactly one
// reason: backend/charts does not exist yet (task 2.2's own scaffolding is
// the change that turns it green), not because the ladder logic is new or
// wrong.
//
// EXPECTED TO FAIL ON FIRST RUN: compile error — "no required module
// provides package hexaverse/charts" / "package charts is not in std"
// (the directory has no non-test .go file yet).

import "testing"

// TestTierOrdering is TestTierOrdering ported intact from
// observation/model_test.go.
func TestTierOrdering(t *testing.T) {
	if !TierExplored.AtLeast(TierSurveyed) || !TierSurveyed.AtLeast(TierRumored) || !TierRumored.AtLeast(TierStarVisible) {
		t.Errorf("tier ordering broken: explored≥surveyed≥rumored≥starVisible must hold")
	}
	if Max(TierRumored, TierExplored) != TierExplored {
		t.Errorf("Max(rumored, explored) = %q, want explored", Max(TierRumored, TierExplored))
	}
	if TierStarVisible.AtLeast(TierRumored) {
		t.Errorf("starVisible must not rank at/above rumored")
	}
}

// Scenario: A system with no stored knowledge is star-visible
//
// Ported from observation/graph_tier_ladder_gaps_test.go's
// TestGraphTierLadder_Scenario_NoStoredObservationIsStarVisible's pure-value
// half (the DAO half is ported separately into dao_test.go, since it needs
// the emulator). Pins that the Go zero value of Tier — what a missing
// SystemTiers map lookup yields — ranks exactly the same as the named
// TierStarVisible constant.
func TestGraphKnowledgeLadder_Scenario_NoStoredKnowledgeIsStarVisible(t *testing.T) {
	var zero Tier // the shape a missing SystemTiers map entry yields
	if !zero.AtLeast(TierStarVisible) || !TierStarVisible.AtLeast(zero) {
		t.Fatalf("Tier zero value %q and TierStarVisible %q do not rank equally — "+
			"a missing knowledge record must read exactly as starVisible", zero, TierStarVisible)
	}
	if zero.AtLeast(TierRumored) {
		t.Errorf("a system with no stored knowledge must not rank at/above rumored")
	}
}

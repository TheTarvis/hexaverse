package mine

import (
	"context"
	"testing"

	"hexaverse/system"
)

// mine-extraction, "Mine Commit Rejections Report a Distinguishable
// Reason" extended to the new featureId-validation family (re-express-
// economy-positions tasks.md 2.11) — "A Client-Supplied Feature Id Is
// Validated Before Resolution"'s own scenarios each promise a reason
// "distinct from the not-docked and unknown-kind reasons", and, taken
// together as a family, distinct from ONE ANOTHER too.
//
// EXPECTED RED TODAY: none of the lexical/resolution validation phases
// (task 2.1, golang-dev — NOT this SDET pass) exist yet. Every case below
// reaches mine.Service.Commit with the fixture fleet's AttachedTo set to
// EXACTLY the malformed featureId (so the docked-state check passes —
// design.md Decision 2a's own acceptance-evidence note: these rejections
// are reachable today only via a fixture-set attachment, not an
// end-to-end burn), and TODAY falls through uniformly to findFeature
// failing an exact-id lookup against interior.Features -> ErrUnknownKind
// for every single case — exactly the reason-collision this requirement
// forbids, both among the new cases and against the pre-existing
// not-docked/unknown-kind/station reasons.
func TestCommit_Scenario_EveryFeatureIdValidationReasonIsDistinguishable(t *testing.T) {
	cases := []struct {
		name      string
		featureId string
	}{
		{"contains a path separator", "feat/belt-0"},
		{"is exactly a single dot", "."},
		{"is exactly a double dot", ".."},
		{"matches the reserved dunder pattern", "__reserved__"},
		{"carries more than one member separator", "feat-belt-0#1#2"},
		{"carries a non-numeric member suffix", "feat-belt-0#abc"},
		{"carries a member suffix outside the valid index range", "feat-belt-0#999"},
		{"carries a prefix that does not resolve to any feature", "feat-does-not-exist#0"},
		{"carries a prefix that resolves to a non-belt feature", "feat-planet-0#0"},
	}

	// Seed the "already reserved" reasons this suite's own existing
	// sentinels report, so a new validation failure colliding with one of
	// THEM is also caught, not just collisions among the new cases.
	seen := map[string]string{
		ErrNotDocked.Error():          "the existing not-docked reason",
		ErrUnknownKind.Error():        "the existing unknown-kind reason",
		ErrStationNotMineable.Error(): "the existing station-not-mineable reason",
	}

	interior := featureWithMetals() // carries "feat-belt-0" (a real belt) only
	interior.Features = append(interior.Features, system.Feature{
		Id: "feat-planet-0", Type: system.FeatureRocky,
		Resources: []system.Resource{{Kind: system.ResourceMetals, Richness: 0.3}},
	})

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := dockedFleet(testCorpA)
			f.AttachedTo = tc.featureId

			svc := newSvc(t, &fakeFleets{f: f}, &fakeFeatures{interior: interior}, &fakeMineActions{}, validParams())
			req := validRequest()
			req.FeatureId = tc.featureId

			_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
			if err == nil {
				t.Fatalf("featureId %q was accepted, want rejected by the id-validation family", tc.featureId)
			}
			reason := err.Error()
			if prior, dup := seen[reason]; dup {
				t.Errorf("featureId %q's rejection reason (%q) collides with %s — every id-validation rejection must carry its own distinguishable reason", tc.featureId, reason, prior)
				return
			}
			seen[reason] = tc.name
		})
	}
}

package mine

import (
	"context"
	"testing"
)

// system-interior, "A Belt's Members Are Discrete Mineable Bodies On a
// Shared Radius" — "The belt feature remains mineable alongside its
// members" (re-express-economy-positions tasks.md 1.1).
//
// NO CODE CHANGE EXPECTED: a mine commit naming a belt feature's own id
// already runs through the exact same preconditions any other
// resource-bearing feature's commit does — service.go's Commit special-
// cases ONLY system.FeatureStation (ErrStationNotMineable); nothing in it
// branches on FeatureBelt. This test pins that fact, non-vacuously
// (asserting a real committed action, not merely "no error"), against a
// future regression — e.g. a developer adding a belt-specific rejection by
// analogy with the station check while implementing this change's member-
// resolution work.
func TestCommit_Scenario_BeltFeatureRemainsMineableAlongsideItsMembers(t *testing.T) {
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())

	a, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest())
	if err != nil {
		t.Fatalf("a mine commit naming the belt feature's own id (docked directly, not via a member) = %v, want success with no belt-specific rejection", err)
	}
	if a == nil || a.Id == "" {
		t.Fatalf("expected a committed action, got %+v", a)
	}
}

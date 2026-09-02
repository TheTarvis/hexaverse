package mine

import (
	"context"
	"errors"
	"testing"
)

// mine-extraction, "Belt Member Targets Resolve Through Their Parent Belt
// Feature" — "Naming the belt feature while docked to one of its members is
// rejected as not docked" (re-express-economy-positions tasks.md 2.7).
//
// NO CODE CHANGE EXPECTED: fleet.Fleet.DockedTo()'s exact-string
// `host != req.FeatureId` comparison already covers this — a fleet's
// stored AttachedTo names the exact host it is docked to (member or parent
// alike), with no fuzzy "is this the member's parent" match on either
// side. This test pins that fact against a regression that might try to
// make docking "member-aware" by treating a member and its parent as
// interchangeable hosts for the docked check specifically (mine-
// extraction's own resolution mechanism only ever generalizes MINING
// through a member id — never the docked-state check itself).
func TestCommit_Scenario_NamingParentWhileDockedToMemberIsNotDocked(t *testing.T) {
	f := dockedFleet(testCorpA)
	f.AttachedTo = "feat-belt-0#3" // docked to the MEMBER

	req := validRequest()
	req.FeatureId = "feat-belt-0" // but naming the PARENT belt feature

	svc := newSvc(t, &fakeFleets{f: f}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
	if !errors.Is(err, ErrNotDocked) {
		t.Fatalf("naming the parent belt feature while docked to one of its members: err = %v, want ErrNotDocked", err)
	}
}

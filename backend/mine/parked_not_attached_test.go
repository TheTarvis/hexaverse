package mine

import (
	"context"
	"errors"
	"testing"
)

// mine-extraction, "Mine Commit Preconditions" — "A fleet parked near a
// body but not attached to it is rejected" (re-express-economy-positions
// tasks.md 2.9).
//
// NO CODE CHANGE EXPECTED: mine.Service.Commit's docked-state check reads
// ONLY fleet.Fleet.AttachedTo (via DockedTo()) — it never inspects the
// fleet's kinematic State/position at all, so a fleet's resolved position
// coinciding with, or lying near, a body can never substitute for the
// stored attachment string. Modelled on the spec's own worked example — a
// fresh jump arrival parked near the destination gate
// (fleet-movement's "Jump Arrival Parks Near the Destination Gate,
// Unmasked") — this fixture is a never-attached fleet; the point of the
// test is that Commit's rejection is unconditional on position, so no
// positional fixture is even necessary to prove it: an unattached fleet is
// rejected exactly the same whether it is parked light-years away or
// sitting exactly on top of the target's coordinates.
func TestCommit_Scenario_ParkedNearABodyButNotAttachedIsRejected(t *testing.T) {
	f := dockedFleet(testCorpA)
	f.AttachedTo = "" // never attached — e.g. a fresh jump arrival parked near a gate

	svc := newSvc(t, &fakeFleets{f: f}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest())
	if !errors.Is(err, ErrNotDocked) {
		t.Fatalf("a fleet merely parked near/at a body, never attached: err = %v, want ErrNotDocked", err)
	}
}

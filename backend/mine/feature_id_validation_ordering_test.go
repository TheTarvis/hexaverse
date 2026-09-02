package mine

import (
	"context"
	"errors"
	"testing"
)

// mine-extraction, "A Client-Supplied Feature Id Is Validated Before
// Resolution" — "An unresolvable member rejection never precedes ownership
// or the not-docked rejection" (re-express-economy-positions tasks.md 2.2).
// Added per a security-audit finding: TestCommit_Scenario_ForeignCorpRejected
// and TestCommit_Scenario_NotDockedRejected (service_test.go) both use
// validRequest(), so neither ever paired a MALFORMED featureId with a
// foreign-fleet or not-docked fixture — the exact existence-oracle guard
// task 2.2 asks for was unexercised. This is structurally safe today only
// because the docked check is a plain equality against the fleet's stored
// AttachedTo (never a parse of req.FeatureId) and the ownership check runs
// first and returns before req.FeatureId is read at all; these tests are
// what keep it that way as the validation family grows.
//
// "feat/belt-0" is deliberately a string that WOULD trip
// ErrFeatureIdPathSeparator if the lexical validation phase ran ahead of
// ownership/dock-state — so a regression that reordered the checks would
// flip these tests' assertions to the WRONG sentinel rather than merely
// leaving them vacuously green.

// Scenario: An unresolvable/malformed featureId never surfaces its own
// rejection ahead of the OWNERSHIP check.
func TestCommit_Scenario_MalformedFeatureIdNeverPrecedesOwnershipCheck(t *testing.T) {
	req := validRequest()
	req.FeatureId = "feat/belt-0" // would trip ErrFeatureIdPathSeparator if validated first

	fa := &fakeMineActions{}
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpB)}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
	if !errors.Is(err, ErrForeignFleet) {
		t.Fatalf("err = %v, want ErrForeignFleet — a foreign requester must never learn whether a malformed featureId would have resolved", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected foreign-corp commit must create no action, got %+v", fa.committed)
	}
}

// Scenario: An unresolvable/malformed featureId never surfaces its own
// rejection ahead of the NOT-DOCKED check.
func TestCommit_Scenario_MalformedFeatureIdNeverPrecedesNotDockedCheck(t *testing.T) {
	req := validRequest()
	req.FeatureId = "feat/belt-0" // would trip ErrFeatureIdPathSeparator if validated first

	notAttached := dockedFleet(testCorpA)
	notAttached.AttachedTo = "" // never attached to anything, malformed or not

	fa := &fakeMineActions{}
	svc := newSvc(t, &fakeFleets{f: notAttached}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
	if !errors.Is(err, ErrNotDocked) {
		t.Fatalf("err = %v, want ErrNotDocked — a caller must never learn whether a malformed featureId would have resolved before the docked-state check runs", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected not-docked commit must create no action, got %+v", fa.committed)
	}
}

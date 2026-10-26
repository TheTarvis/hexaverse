package mine

import (
	"context"
	"errors"
	"testing"
)

func TestOptionsOwnershipBeforeResources(t *testing.T) {
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpB)}, &fakeFeatures{err: errors.New("must not read")}, &fakeMineActions{}, validParams())
	if _, err := svc.Options(context.Background(), testCorpA, testFleetID); !errors.Is(err, ErrForeignFleet) {
		t.Fatalf("foreign options: %v", err)
	}
	if _, err := svc.Options(context.Background(), "", testFleetID); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("anonymous options: %v", err)
	}
}

func TestOptionsRemainingAndMemberIdentity(t *testing.T) {
	f := dockedFleet(testCorpA)
	f.AttachedTo = testFeatureID + "#2"
	ledger := &fakeMineActions{remaining: -125}
	svc := newSvc(t, &fakeFleets{f: f}, &fakeFeatures{interior: featureWithMetals()}, ledger, validParams())
	options, err := svc.Options(context.Background(), testCorpA, testFleetID)
	if err != nil {
		t.Fatal(err)
	}
	if !options.Eligible || options.FeatureId != testFeatureID || options.CommitFeatureId != f.AttachedTo || len(options.Resources) != 1 || options.Resources[0].RemainingTons != 375 {
		t.Fatalf("options: %+v", options)
	}
	if options.FreeHold != 100 || options.MiningRate != 10 || options.MinRunTons != 1 || options.WorldTime != 1000 {
		t.Fatalf("limits: %+v", options)
	}
	if ledger.committed != nil {
		t.Fatal("reading options committed an action")
	}
	ledger.remaining = -500
	options, err = svc.Options(context.Background(), testCorpA, testFleetID)
	if err != nil || options.Eligible || len(options.Resources) != 0 || options.Reason != ErrLodeDepleted.Error() {
		t.Fatalf("depleted: %+v, %v", options, err)
	}
}

func TestOptionsBusyAndUnavailableLedger(t *testing.T) {
	f := dockedFleet(testCorpA)
	f.ActiveActionId = "occupied"
	ledger := &fakeMineActions{}
	svc := newSvc(t, &fakeFleets{f: f}, &fakeFeatures{interior: featureWithMetals()}, ledger, validParams())
	options, err := svc.Options(context.Background(), testCorpA, testFleetID)
	if err != nil || options.Eligible || options.ActiveActionId != "occupied" {
		t.Fatalf("busy: %+v, %v", options, err)
	}
	ledger.remainErr = errors.New("offline")
	if _, err = svc.Options(context.Background(), testCorpA, testFleetID); err == nil {
		t.Fatal("unavailable ledger must not produce eligible options")
	}
}

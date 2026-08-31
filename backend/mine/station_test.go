package mine

import (
	"context"
	"errors"
	"testing"

	"hexaverse/fleet"
	"hexaverse/space"
	"hexaverse/system"
)

const testStationFeatureID = "feat-station"

// dockedAtStation is a fleet docked to the system's trading station rather than
// to a mineable body — the exact state a player is in right after arriving to
// sell, which is when a stray mine command is most likely.
func dockedAtStation(corp string) *fleet.Fleet {
	return &fleet.Fleet{
		Id: testFleetID, CorporationId: corp, SystemId: testSystemID,
		// See dockedFleet's own comment (service_test.go): AttachedTo is the
		// relationship mine's DockedTo() check reads; these are in-memory
		// fixtures with no Firestore round trip.
		State:      space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
		AttachedTo: testStationFeatureID,
		Ships:      []fleet.ShipEntry{{Class: fleet.ClassSeed}},
	}
}

// interiorWithStation is what GetOrCreateInterior returns once the station store
// is wired: the generated features plus the spliced station.
func interiorWithStation() *system.GeneratedInterior {
	return &system.GeneratedInterior{Features: []system.Feature{
		{Id: testFeatureID, Type: system.FeatureBelt, Resources: []system.Resource{
			{Kind: system.ResourceMetals, Richness: 0.5},
		}},
		{
			Id:    testStationFeatureID,
			Type:  system.FeatureStation,
			Orbit: &system.Orbit{Ring: 6, Angle0: 3, Period: 60_000, Dir: 1},
		},
	}}
}

// TestCommit_MineAtStationIsRejected: a station is dockable and sellable-at, but
// never mineable.
func TestCommit_MineAtStationIsRejected(t *testing.T) {
	svc := newSvc(t,
		&fakeFleets{f: dockedAtStation(testCorpA)},
		&fakeFeatures{interior: interiorWithStation()},
		&fakeMineActions{}, validParams())

	req := validRequest()
	req.FeatureId = testStationFeatureID

	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
	if !errors.Is(err, ErrStationNotMineable) {
		t.Fatalf("mining a station = %v, want ErrStationNotMineable", err)
	}
}

// TestCommit_StationRejectionIsDistinguishableFromAnUnknownKind pins the reason
// separation. A station carries no resources, so without its own check it would
// fall through to "feature does not carry that kind" — true, but it would read
// to the player as though the station might be mineable for some OTHER kind.
func TestCommit_StationRejectionIsDistinguishableFromAnUnknownKind(t *testing.T) {
	stationSvc := newSvc(t,
		&fakeFleets{f: dockedAtStation(testCorpA)},
		&fakeFeatures{interior: interiorWithStation()},
		&fakeMineActions{}, validParams())
	stationReq := validRequest()
	stationReq.FeatureId = testStationFeatureID
	_, stationErr := stationSvc.Commit(context.Background(), testCorpA, testFleetID, stationReq)

	// The same command against a real body that lacks the requested kind.
	bodySvc := newSvc(t,
		&fakeFleets{f: dockedFleet(testCorpA)},
		&fakeFeatures{interior: featureWithMetals()},
		&fakeMineActions{}, validParams())
	bodyReq := validRequest()
	bodyReq.Kind = system.ResourceExotic // the belt has metals only
	_, bodyErr := bodySvc.Commit(context.Background(), testCorpA, testFleetID, bodyReq)

	if stationErr == nil || bodyErr == nil {
		t.Fatalf("both commands must be rejected; got station=%v body=%v", stationErr, bodyErr)
	}
	if stationErr.Error() == bodyErr.Error() {
		t.Errorf("station and unknown-kind rejections share the reason %q; they must be distinguishable", stationErr)
	}
}

// TestCommit_MiningARealBodyStillWorksWithAStationPresent guards the obvious
// regression: the station's presence in the interior must not break ordinary
// mining of a body in the same system.
func TestCommit_MiningARealBodyStillWorksWithAStationPresent(t *testing.T) {
	svc := newSvc(t,
		&fakeFleets{f: dockedFleet(testCorpA)},
		&fakeFeatures{interior: interiorWithStation()},
		&fakeMineActions{}, validParams())

	if _, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest()); err != nil {
		t.Fatalf("mining a real body with a station in-system = %v, want success", err)
	}
}

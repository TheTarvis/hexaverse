package market

import (
	"errors"
	"testing"

	"hexaverse/fleet"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
)

// goods-sale, "Sale Requires the Fleet Docked To the Buying Station" — "A
// fleet parked near the station but not attached to it cannot sell"
// (re-express-economy-positions tasks.md 3.6).
//
// NO CODE CHANGE EXPECTED: dockedTo (service.go) reads ONLY the stored
// AttachedTo relationship, never a position. This test parks the fleet in
// a REAL ParkOrbit riding the station's own body id at radius 0 — which
// space.Park.Position resolves to EXACTLY the station's own live
// coordinate, the strongest possible form of "coincides with" the scenario
// names — while explicitly clearing AttachedTo, and asserts the sale is
// still rejected. TestSell_RejectsAnUndockedFleet (service_test.go,
// pre-existing/untouchable) already pins the general undocked case with a
// ParkPoint at the origin; this test is the sibling that specifically
// proves POSITION COINCIDENCE never substitutes for the stored attachment.
func TestSell_Scenario_ParkedAtStationsExactPositionButNotAttachedCannotSell(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	stationId := stack.stationFeatureId(t)

	ridingStationAtRadiusZero := fleet.EncodeKinematicState(space.ShipState{
		Mode: space.ModeParked,
		Park: &space.Park{Kind: space.ParkOrbit, BodyId: stationId, Radius: 0},
	})
	if _, err := stack.client.Collection("fleets").Doc(stack.fleetID).Set(stack.ctx, map[string]any{
		"state":      ridingStationAtRadiusZero,
		"attachedTo": "",
	}, firestore.MergeAll); err != nil {
		t.Fatalf("re-parking the fleet at the station's own coordinate without attaching: %v", err)
	}

	_, err := stack.sell(SellRequest{
		FeatureId: stationId, Kind: "metals", Tons: 10, OperationKey: opKey("parked-not-attached"),
	})
	if !errors.Is(err, ErrNotDockedAtStation) {
		t.Fatalf("selling while parked exactly at (but never attached to) the station = %v, want ErrNotDockedAtStation", err)
	}
	if got := stack.cargo(t)["metals"]; got != 40 {
		t.Errorf("cargo = %v after a rejected sale, want unchanged 40", got)
	}
}

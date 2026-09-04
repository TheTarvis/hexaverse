package refuel

// RED-phase test for openspec change delete-the-lattice, task 3.5 —
// trading-station's ADDED "Station Is a Dockable, Non-Mineable Body" ›
// "Position coincidence without attachment is not docking": "every
// dock-gated verb (sell, refuel, jump) rejects it exactly as it would for a
// fleet parked anywhere else". `market/parked_not_attached_test.go`
// (pre-existing, from re-express-economy-positions) already pins this
// exactly for sell, engineering EXACT position coincidence with the real
// station body via a ParkOrbit at radius 0. This file is the SDET-added
// sibling for refuel, at the same fidelity: the existing
// TestRefuelService_Scenario_UndockedFleetIsRejected /
// _DockedToNonStationFeatureIsRejectedSameAsUndocked (service_test.go,
// untouched by this change) already prove refuel's check is a pure
// AttachedTo relationship using hand-written fakes with no positional
// engineering at all; this test closes the gap by parking a REAL fleet
// (via newRefuelStack's real Firestore-backed stack) in a genuine ParkOrbit
// riding the station's own feature id at radius 0 — the strongest possible
// form of "coincides with" the scenario names — while explicitly clearing
// AttachedTo.
//
// NO CODE CHANGE EXPECTED: refuel.Service.Refuel's docked-state check
// (service.go, `f.DockedTo()` / `fuelPlan.DockedAt(stations.StationFeatureId)`)
// reads only the stored AttachedTo relationship, never a position.

import (
	"errors"
	"testing"

	"hexaverse/fleet"
	"hexaverse/space"
	"hexaverse/stations"

	"cloud.google.com/go/firestore"
)

func TestRefuelService_Scenario_ParkedAtStationsExactPositionButNotAttachedCannotRefuel(t *testing.T) {
	stack, cleanup := newRefuelStack(t, map[string]float64{}, 10, 1000)
	defer cleanup()

	ridingStationAtRadiusZero := fleet.EncodeKinematicState(space.ShipState{
		Mode: space.ModeParked,
		Park: &space.Park{Kind: space.ParkOrbit, BodyId: stations.StationFeatureId, Radius: 0},
	})
	if _, err := stack.client.Collection("fleets").Doc(stack.fleetID).Set(stack.ctx, map[string]any{
		"state":      ridingStationAtRadiusZero,
		"attachedTo": "",
	}, firestore.MergeAll); err != nil {
		t.Fatalf("re-parking the fleet at the station's own coordinate without attaching: %v", err)
	}

	_, err := stack.refuel(5, "parked-not-attached")
	if !errors.Is(err, ErrNotDockedAtStation) {
		t.Fatalf("refueling while parked exactly at (but never attached to) the station: err = %v, want ErrNotDockedAtStation", err)
	}
	if got := stack.fuelCargo(t); got != 0 {
		t.Errorf("fuel cargo = %v after a rejected refuel, want unchanged 0", got)
	}
	if got := stack.balance(t); got != 1000 {
		t.Errorf("balance = %v after a rejected refuel, want unchanged 1000", got)
	}
}

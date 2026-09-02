package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 1.1
// — fleet-movement "Fleet Cargo Pool" (MODIFIED):
//
//   - "Fuel occupies cargo capacity exactly like a mined resource"
//   - "No mine resolve or sale settlement ever touches the fuel entry"
//
// The first scenario is ALREADY TRUE today (fleet.FreeHold sums every
// cargo key generically, fleet/roster.go) — it is included here as an
// explicit, named regression net per this requirement's own text, not
// presented as newly-red coverage. The second is likewise a regression
// guard: no verb in this codebase names the literal kind "fuel" anywhere
// today (system-interior's own "The Fuel Resource-Kind Name Is Reserved
// From Generation", tested in backend/system/fuel_resource_kind_reserved_
// test.go, is what keeps a mineable feature from ever carrying that kind).
// Both are honest, pre-existing-green regression nets, flagged as such in
// the SDET coverage table rather than claimed as adversarial red coverage.

import (
	"net/http"
	"testing"
)

func TestCargoPool_Scenario_FuelOccupiesCargoCapacityExactlyLikeAMinedResource(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Cargo Pool Fuel Corp")
	setFleetCargoFor(t, sp.fleetId, map[string]float64{"fuel": 40, "metals": 60})

	_, body, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet: status = %d", code)
	}
	roster, ok := body["roster"].(map[string]interface{})
	if !ok {
		t.Fatalf("no roster object on the fleet read: %v", body)
	}
	freeHold, ok := asFloat(roster["freeHold"])
	if !ok {
		t.Fatalf("roster.freeHold is not numeric: %v", roster["freeHold"])
	}
	capacity, _ := asFloat(roster["cargoCapacity"])
	want := capacity - 100 // 40 fuel + 60 metals
	if !almostEqual(freeHold, want, 1e-6) {
		t.Errorf("fleet-movement \"Fuel occupies cargo capacity exactly like a mined resource\": freeHold = %v, "+
			"want %v (capacity %v minus 40 tons of fuel plus 60 tons of metals, combined) — fuel must count "+
			"toward the sum subtracted from derived capacity identically to any mined kind", freeHold, want, capacity)
	}
}

func TestCargoPool_Scenario_NoSaleSettlementEverTouchesTheFuelEntry(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET No Sale Touches Fuel Corp")
	dockFleetAtStation(t, sp)
	setFleetCargoFor(t, sp.fleetId, map[string]float64{"fuel": 40})

	// A sale naming kind "fuel" must be rejected (fuel is not a tradable
	// ResourceKind — npc-market-demand's own "Tradable Goods Are Exactly
	// the Mine Resource Kinds", unaffected by this change) rather than
	// debiting the fuel entry.
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/sell", sp.token,
		map[string]any{"featureId": sp.stationId, "kind": "fuel", "tons": 10.0, "operationKey": "sdet-no-sell-fuel-1"},
		nil)
	if w.Code == http.StatusOK {
		t.Errorf("fleet-movement \"No mine resolve or sale settlement ever touches the fuel entry\": a sale " +
			"naming kind \"fuel\" returned 200, want a rejection — fuel is sold by no verb")
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != 40 {
		t.Errorf("fleet fuel = %v after an attempted fuel sale, want unchanged at 40", got)
	}
}

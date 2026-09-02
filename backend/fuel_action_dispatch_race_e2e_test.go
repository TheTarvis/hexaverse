package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 3.3,
// 9.5 — action-dispatch "Actions Commit With an Atomically Claimed Slot"
// ("A slot-claiming commit and an unserialized instant mutation on the same
// actor never lose an update") exercised end to end through the real
// production HTTP surface: a burn commit's fuel debit racing a refuel's fuel
// credit against the SAME fleet, with no external serialization.
//
// This is one of the FIVE adversary-flagged must-test-precisely items:
// "Debit-at-commit is transactional... Test the burn-vs-refuel lost-update
// race." backend/action/actorstate_producer_test.go pins the underlying
// action.Commit mechanism directly (synthetic actor field, no HTTP); THIS
// file is the end-to-end confirmation through the real fleet-movement burn
// commit and the real fuel-purchase refuel endpoint together — the two
// domains design.md's own panel review identifies as the actual race
// (burn-vs-burn is already serialized by the movement slot; burn-vs-refuel
// is not, because refuel claims no slot at all).
//
// Both effects are known in advance so the final balance is independently
// verifiable: the burn's cost is computed from ITS OWN returned Accel/
// DepartMs/ArriveMs (never a value this test invents), and the refuel's
// credit is the tonnage this test itself requests.

import (
	"net/http"
	"sync"
	"testing"
)

func TestActionDispatchRace_Scenario_BurnCommitAndConcurrentRefuelNeverLoseAnUpdate(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Burn-vs-Refuel Race Corp")
	// 150 tons — comfortably within the 200-ton single-hull capacity
	// (fleet/roster.go's defaultSeedHoldCapacity), unlike an earlier draft's
	// 1,000,000 (itself already over capacity before the refuel's own
	// tonnage is added, which made the refuel's free-hold check reject
	// regardless of the race this test exists to exercise) — still ample to
	// afford the burn's own cost (observed ~16-40 tons for this system's
	// home-station distance) with headroom left for the refuel credit.
	const seeded = 150.0
	setFleetFuel(t, sp.fleetId, seeded)

	// The fleet must be DOCKED at its home station for the refuel side of the
	// race to have any chance of passing its own precondition
	// (fuel-purchase's "Refuel Requires the Fleet Docked To the Selling
	// Station") — set up directly, exactly as fuel_purchase_e2e_test.go's own
	// dockFleetAtStation helper does, so this race is not ALSO gated on a
	// burn-to-dock sequence completing first.
	dockFleetAtStation(t, sp)

	const refuelTons = 10.0
	var wg sync.WaitGroup
	wg.Add(2)
	var orderCode, refuelCode int
	var orderBody, refuelBody string

	go func() {
		defer wg.Done()
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
			map[string]any{"bodyId": sp.stationId}, nil)
		orderCode, orderBody = w.Code, w.Body.String()
	}()
	go func() {
		defer wg.Done()
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/refuel", sp.token,
			map[string]any{"tons": refuelTons, "operationKey": "sdet-race-refuel-1"}, nil)
		refuelCode, refuelBody = w.Code, w.Body.String()
	}()
	wg.Wait()

	if refuelCode != http.StatusOK {
		t.Errorf("fuel-purchase route is not yet wired/accepting a docked, affordable refuel request "+
			"(status = %d, body = %s) — the race this test exercises has no second party to race against until "+
			"POST /v1/fleets/:fleetId/refuel exists", refuelCode, refuelBody)
	}
	if orderCode != http.StatusOK {
		t.Fatalf("the concurrent burn commit itself was rejected (status = %d, body = %s) — re-run isolated to "+
			"rule out an unrelated affordability failure before treating this as a race finding", orderCode, orderBody)
	}

	typed, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("post-race GET /v1/fleets/%s: status = %d", sp.fleetId, code)
	}
	if typed.State.Burn == nil {
		t.Fatalf("post-race fleet is not mid-burn: %+v", typed.State)
	}
	burnCost := expectedFuelCostTons(typed.State.Burn, 1)
	want := seeded - burnCost + refuelTons
	got := fleetCargoFuel(t, sp.fleetId)
	if !almostEqual(got, want, 1e-6) {
		t.Errorf("action-dispatch \"A slot-claiming commit and an unserialized instant mutation on the same "+
			"actor never lose an update\" (fleet-movement \"A concurrent, unserialized refuel is never lost to a "+
			"racing burn debit\"): cargo.fuel = %v after the race, want %v (%v seeded − %v burn cost + %v refuel "+
			"credit) — a lost update (either effect silently overwritten by the other's stale pre-transaction "+
			"computation of the resulting balance) would leave fuel at %v or %v instead",
			got, want, seeded, burnCost, refuelTons, seeded-burnCost, seeded+refuelTons)
	}
}

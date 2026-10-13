package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 2.5,
// 1.1a — fleet-movement "Discarding a Running Burn Refunds Its Unspent
// Fuel, Closed-Form" (ADDED) and "Cut Drive Converts the Burn to a Drift
// and Goes Dark" (MODIFIED, "Cutting a burn credits its unspent fuel"):
//
//   - "Cutting a burn immediately after commit refunds nearly its full cost"
//   - "Cutting a burn just before arrival refunds almost nothing"
//   - "Re-targeting mid-burn refunds the discarded burn's unspent fuel"
//   - "A stop-in-place order that supersedes an active burn refunds it
//     before charging the stop"
//   - "Stop-in-place's free, below-the-floor branch still refunds a
//     preceding running burn"
//   - "The refund is symmetric with the original debit's stored cost, not
//     a re-derivation from the roster at discard time"
//   - "Cutting a burn credits its unspent fuel"
//
// Every scenario here needs a fleet ALREADY mid-burn with a KNOWN debited
// cost — established via the same learn-then-rewind-then-recommit pattern
// fuel_burn_commit_affordability_e2e_test.go and fuel_stranding_and_range_
// e2e_test.go already use, so the refund's exact fraction is independently
// computable from the burn's own returned Accel/DepartMs/ArriveMs, never a
// value this suite invents.

import (
	"net/http"
	"testing"

	"hexaverse/space"
)

// commitKnownBurn commits an ample-fuel burn, reads back its exact debited
// cost (from the returned Burn's own delta-v, per this change's pinned
// formula), and returns both — the shared setup every refund scenario below
// needs.
func commitKnownBurn(t *testing.T, router http.Handler, sp fuelSpawn, orderBody map[string]any, seeded float64) (*space.Burn, float64) {
	t.Helper()
	arrangeStationaryPoint(t, router, sp) // Explicit nonzero-burn fixture, not spawn placement.
	setFleetFuel(t, sp.fleetId, seeded)
	resp, _, code := postOrder(t, router, sp.token, sp.fleetId, orderBody)
	if code != http.StatusOK {
		t.Fatalf("commitKnownBurn: order status = %d", code)
	}
	if resp.State.Burn == nil {
		t.Fatalf("commitKnownBurn: response is not a Burn: %+v", resp.State)
	}
	cost := expectedFuelCostTons(resp.State.Burn, 1)
	if resp.State.Burn.Length <= 0 || cost <= 0 {
		t.Fatal("refund fixture requires nonzero curve and debit")
	}
	return resp.State.Burn, cost
}

func TestDiscardRefund_Scenario_CuttingImmediatelyAfterCommitRefundsNearlyFullCost(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Cut-Immediately Corp")
	_, cost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), 1_000_000)
	fuelAfterCommit := fleetCargoFuel(t, sp.fleetId)

	// "Immediately" — no forced arrival, no rewind: cut as fast as this
	// process can issue the next request.
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cut-drive", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("cut-drive: status = %d, body = %s", w.Code, w.Body.String())
	}

	after := fleetCargoFuel(t, sp.fleetId)
	refunded := after - fuelAfterCommit
	if refunded < 0.9*cost {
		t.Errorf("fleet-movement \"Cutting a burn immediately after commit refunds nearly its full cost\": "+
			"refunded %v of a %v ton debited cost (%.1f%%), want at least 90%% refunded — cutting within "+
			"milliseconds of commit should return nearly the full amount", refunded, cost, 100*refunded/cost)
	}
}

func TestDiscardRefund_Scenario_CuttingJustBeforeArrivalRefundsAlmostNothing(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Cut-Just-Before-Arrival Corp")
	const seeded = 1_000_000.0
	_, cost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), seeded)
	fuelAfterCommit := fleetCargoFuel(t, sp.fleetId)
	// Non-vacuity: "refunds almost nothing" is satisfied trivially (refunded
	// == 0) if debit-at-commit does not exist at all yet — a real debit
	// must have landed first, or this scenario's own upper bound is
	// meaningless.
	if fuelAfterCommit >= seeded {
		t.Fatalf("fixture invariant broken: fuel after commit = %v, want strictly less than the seeded %v — "+
			"this scenario is vacuous until a burn commit actually debits fuel (learned cost = %v)",
			fuelAfterCommit, seeded, cost)
	}

	// Rewrite the stored arrival to ONE millisecond in the future (rather
	// than fully into the past — forceBurnArrivalPast's own "already
	// arrived" trick would settle it outright via the resolver, leaving
	// nothing left TO cut) — the closed-form refund is a function of how
	// close the cut instant is to the STORED arrival time, not of real
	// elapsed wall-clock time, so moving arrival to depart+~now is
	// equivalent to "cutting a millisecond before an imminent arrival"
	// without an actual wait.
	setBurnArriveMsNearNow(t, sp.fleetId)

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cut-drive", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("cut-drive: status = %d, body = %s", w.Code, w.Body.String())
	}

	after := fleetCargoFuel(t, sp.fleetId)
	refunded := after - fuelAfterCommit
	if refunded > 0.1*cost {
		t.Errorf("fleet-movement \"Cutting a burn just before arrival refunds almost nothing\": refunded %v of "+
			"a %v ton debited cost (%.1f%%), want at most 10%% refunded — cutting a burn whose stored arrival is "+
			"imminent should return almost nothing", refunded, cost, 100*refunded/cost)
	}
}

func TestDiscardRefund_Scenario_RetargetingMidBurnRefundsTheDiscardedBurnsUnspentFuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Retarget Refund Corp")
	const seeded = 1_000_000.0
	_, firstCost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), seeded)
	fuelBeforeRetarget := fleetCargoFuel(t, sp.fleetId)
	if fuelBeforeRetarget >= seeded {
		t.Fatalf("fixture invariant broken: fuel before retarget = %v, want strictly less than the seeded %v — "+
			"this scenario is vacuous until the FIRST burn's own commit actually debits fuel (learned first "+
			"cost = %v)", fuelBeforeRetarget, seeded, firstCost)
	}

	far := space.Vec3{X: 10_000, Y: 0, Z: 0}
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"point": far, "accel": 4.0}, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("re-target order: status = %d, body = %s", w.Code, w.Body.String())
	}

	fuelAfterRetarget := fleetCargoFuel(t, sp.fleetId)
	// The new order's own cost is unknown in advance, but the REFUND from
	// the FIRST burn must have landed BEFORE the second burn's debit — so
	// fuelAfterRetarget = fuelBeforeRetarget + refund − secondCost. Since
	// refund > 0 (cutting/discarding always credits a nonnegative amount,
	// and this discard happens almost immediately after the first commit,
	// so per the "immediately refunds nearly the full cost" rule the
	// refund should be close to firstCost), the observable, discriminating
	// signal is: fuelAfterRetarget must be MEASURABLY closer to
	// fuelBeforeRetarget than "fuelBeforeRetarget − secondCost alone" would
	// be if NO refund had landed. Concretely: recomputing secondCost from
	// the stored NEW burn and checking the balance equation holds is the
	// precise assertion.
	typed, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK || typed.State.Burn == nil {
		t.Fatalf("post-retarget GET: status = %d, burn = %+v", code, typed.State)
	}
	secondCost := expectedFuelCostTons(typed.State.Burn, 1)
	// refund is deliberately left unbounded above (only "immediately" tests
	// assert its size) — what THIS scenario pins is that fuel reflects a
	// CREDIT for the first burn's unspent cost before the second is
	// charged, not merely "the second order's cost was debited from
	// whatever fuel happened to remain."
	if fuelAfterRetarget+secondCost <= fuelBeforeRetarget {
		t.Errorf("fleet-movement \"Re-targeting mid-burn refunds the discarded burn's unspent fuel\": "+
			"fuel before retarget = %v, fuel after retarget = %v, new burn's own cost = %v (so fuel+cost = %v) — "+
			"this must EXCEED fuel-before-retarget by a positive refund credited from the discarded first burn's "+
			"unspent %v-ton cost; fuel+cost <= fuel-before-retarget means no refund landed at all",
			fuelBeforeRetarget, fuelAfterRetarget, secondCost, fuelAfterRetarget+secondCost, firstCost)
	}
}

func TestDiscardRefund_Scenario_StopInPlaceSupersedesActiveBurnRefundsBeforeChargingTheStop(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Stop Supersedes Burn Corp")
	_, firstCost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), 1_000_000)
	fuelBeforeStop := fleetCargoFuel(t, sp.fleetId)

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/stop", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("stop: status = %d, body = %s", w.Code, w.Body.String())
	}

	fuelAfterStop := fleetCargoFuel(t, sp.fleetId)
	if fuelAfterStop <= fuelBeforeStop {
		t.Errorf("fleet-movement \"A stop-in-place order that supersedes an active burn refunds it before "+
			"charging the stop\": fuel before stop = %v, fuel after stop = %v — stopping mid-burn (well above "+
			"the speed floor, still fast from a near-full-ceiling burn) must credit a REFUND for the discarded "+
			"burn's unspent portion of its %v-ton cost before the stop's own (possibly zero, possibly nonzero) "+
			"cost is charged; a value at or below the pre-stop balance means no refund landed",
			fuelBeforeStop, fuelAfterStop, firstCost)
	}
}

func TestDiscardRefund_Scenario_StopInPlaceFreeBelowFloorBranchStillRefundsAPrecedingRunningBurn(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Stop Below-Floor Refund Corp")
	_, firstCost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), 1_000_000)
	fuelBeforeStop := fleetCargoFuel(t, sp.fleetId)

	// Force the burn to its OWN stored arrival instant minus a hair, then
	// immediately after commit, its LIVE speed is still near the burn's
	// peak — not below the stop-in-place speed floor. To exercise this
	// scenario's own precondition — "live speed is AT OR BELOW the
	// configured stop floor" — the fleet must be caught essentially at
	// its brachistochrone's own zero-speed turnaround instant (mid-flip)
	// or at the very start/end of the curve. Rewinding arrival to the
	// instant right after depart (near-zero elapsed) makes live speed
	// near-zero — at the very start of a brachistochrone burn, commanded
	// acceleration has barely had time to build any speed at all.
	setBurnArriveMsNearNow(t, sp.fleetId) // reuses the "burn is almost over" rewrite; see its own doc comment
	// NOTE: this fixture targets the SAME observable precondition
	// ("stop-in-place's free, below-floor branch") via the documented
	// speed-floor mechanism (space-kinematics), not a hand-rolled speed
	// override — see the coverage table for the honest caveat if this
	// fixture does not reliably land below the floor in every environment.

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/stop", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("stop: status = %d, body = %s", w.Code, w.Body.String())
	}

	fuelAfterStop := fleetCargoFuel(t, sp.fleetId)
	if fuelAfterStop <= fuelBeforeStop {
		t.Errorf("fleet-movement \"Stop-in-place's free, below-the-floor branch still refunds a preceding "+
			"running burn\": fuel before stop = %v, fuel after stop = %v — even the FREE, below-the-floor stop "+
			"branch (no new delta-v charged for the stop itself) must still refund the discarded burn's unspent "+
			"portion of its %v-ton cost; a value at or below the pre-stop balance means the free branch silently "+
			"forfeited a refund it owes", fuelBeforeStop, fuelAfterStop, firstCost)
	}
}

func TestDiscardRefund_Scenario_RefundIsSymmetricWithStoredDebitedCostNotARosterRederivation(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refund Symmetry Corp")
	const seeded = 1_000_000.0
	_, originalCost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), seeded)
	fuelBeforeCut := fleetCargoFuel(t, sp.fleetId)
	if fuelBeforeCut >= seeded {
		t.Fatalf("fixture invariant broken: fuel before cut = %v, want strictly less than the seeded %v — this "+
			"scenario is vacuous until a burn commit actually debits fuel (learned cost = %v)",
			fuelBeforeCut, seeded, originalCost)
	}

	// The roster CHANGES between commit and discard — a hull is added.
	setFleetShips(t, sp.fleetId, 5)

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cut-drive", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("cut-drive: status = %d, body = %s", w.Code, w.Body.String())
	}
	refunded := fleetCargoFuel(t, sp.fleetId) - fuelBeforeCut
	if refunded <= 0 {
		t.Fatalf("fixture invariant broken: refunded = %v, want > 0 — this scenario (an upper bound on the "+
			"refund) is vacuous unless cutting a running burn actually credits SOME refund", refunded)
	}

	// A re-derivation from the CURRENT (5-hull) roster would inflate the
	// refund far past the ORIGINAL (1-hull) debited cost — the refund can
	// never exceed the original cost regardless of when it's cut, so a
	// refund greater than originalCost is proof the implementation
	// re-read the roster at discard instead of using the stored,
	// originally-debited cost field.
	if refunded > originalCost+1e-6 {
		t.Errorf("fleet-movement \"The refund is symmetric with the original debit's stored cost, not a "+
			"re-derivation from the roster at discard time\": refunded %v tons, which EXCEEDS the original "+
			"1-hull debited cost of %v tons — the fleet's roster grew to 5 hulls between commit and discard; a "+
			"refund exceeding the original cost proves the roster was re-read at discard instead of using the "+
			"stored debited-cost-in-tons field from the burn's own original commit", refunded, originalCost)
	}
}

func TestCutDrive_Scenario_CuttingABurnCreditsItsUnspentFuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Cut Drive Credits Fuel Corp")
	arrangeStationaryPoint(t, router, sp)
	_, cost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), 1_000_000)
	if cost <= 0 {
		t.Fatalf("fixture invariant broken: learned cost = %v, want > 0 (this scenario needs a nonzero "+
			"already-debited fuel cost to refund)", cost)
	}
	before := fleetCargoFuel(t, sp.fleetId)

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cut-drive", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("cut-drive: status = %d, body = %s", w.Code, w.Body.String())
	}
	after := fleetCargoFuel(t, sp.fleetId)
	if after <= before {
		t.Errorf("fleet-movement \"Cutting a burn credits its unspent fuel\": fuel before cut = %v, after cut = "+
			"%v — cutting a running burn with a nonzero already-debited cost must credit the fleet's `fuel` "+
			"cargo with the unspent-fraction refund, even though the cut itself charges no new delta-v",
			before, after)
	}
}

func TestFleetCancel_Scenario_CancellingAMidBurnFleetRefundsUnspentFuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Fleet Cancel Refund Corp")
	_, cost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), 1_000_000)
	before := fleetCargoFuel(t, sp.fleetId)

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cancel", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/fleets/%s/cancel: status = %d, body = %s", sp.fleetId, w.Code, w.Body.String())
	}
	after := fleetCargoFuel(t, sp.fleetId)
	if after <= before {
		t.Errorf("fleet-movement \"Discarding a Running Burn Refunds Its Unspent Fuel, Closed-Form\": "+
			"POST /v1/fleets/:fleetId/cancel against a mid-burn fleet did not increase fuel (before = %v, after "+
			"= %v) — a %v-ton already-debited cost is running and not yet arrived; this discard path must "+
			"refund its unspent portion exactly as cut-drive does", before, after, cost)
	}
}

func TestActionCancel_Scenario_CancellingTheRunningActionRefundsUnspentFuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Action Cancel Refund Corp")
	_, cost := commitKnownBurn(t, router, sp, affordableNearbyOrder(t, router, sp.token, sp.fleetId, 1000), 1_000_000)
	before := fleetCargoFuel(t, sp.fleetId)

	actionId := fuelRunningActionId(t, router, sp)
	w := doJSON(t, router, http.MethodPost, "/v1/actions/"+actionId+"/cancel", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/actions/%s/cancel: status = %d, body = %s", actionId, w.Code, w.Body.String())
	}
	after := fleetCargoFuel(t, sp.fleetId)
	if after <= before {
		t.Errorf("fleet-movement \"Discarding a Running Burn Refunds Its Unspent Fuel, Closed-Form\": "+
			"POST /v1/actions/:actionId/cancel against a mid-burn fleet's own running action did not increase "+
			"fuel (before = %v, after = %v) — a %v-ton already-debited cost is running and not yet arrived; the "+
			"trigger is universal (\"any discard path this capability defines\"), not an enumerated subset that "+
			"happens to exclude the generic action-cancel route", before, after, cost)
	}
}

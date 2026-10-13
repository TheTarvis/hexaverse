package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md
// section 6 — the new `fuel-purchase` capability in full:
// POST /v1/fleets/:fleetId/refuel.
//
// Every scenario in this file 404s today (the route does not exist at all)
// — the most routine "missing behavior" red the scenario-test-automation
// skill names explicitly as a valid reason, alongside an assertion mismatch.

import (
	"net/http"
	"testing"
)

// refuelRequest is fuel-purchase's own request shape: tons + operationKey,
// the fleet id in the path — NO system id, NO station identifier (task 6.2's
// own scenario). corporationId is included in some sub-tests deliberately,
// per request-authorization's "client-supplied corporation id has no
// effect" rule (fuel_ledger_and_authz_e2e_test.go covers that in full; the
// ownership sub-tests here also touch it lightly).
func refuel(t *testing.T, router http.Handler, token, fleetId string, tons float64, opKey string) (int, map[string]interface{}) {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/refuel", token,
		map[string]any{"tons": tons, "operationKey": opKey}, nil)
	requireRouteImplemented(t, w)
	var body map[string]interface{}
	_ = jsonUnmarshalLenient(w.Body.Bytes(), &body)
	return w.Code, body
}

// --- Refuel Requires Fleet Ownership, 404 Before Any Other Precondition --

func TestRefuel_Scenario_UnauthenticatedRefuelIsRejected(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Unauth Corp")
	req := map[string]any{"tons": 1.0, "operationKey": "sdet-refuel-unauth-1"}
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/refuel", "not-a-real-token", req, nil)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("fuel-purchase \"An unauthenticated refuel is rejected\": status = %d, want 401", w.Code)
	}
}

func TestRefuel_Scenario_ForeignCorporationCannotRefuelAnotherCorpsFleet(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	owner := spawnFuelCorp(t, router, "SDET Refuel Owner Corp")
	stranger := spawnFuelCorp(t, router, "SDET Refuel Stranger Corp")
	dockFleetAtStation(t, owner)
	setCorpCredits(t, owner.corpId, 1_000_000)
	// Captured AFTER spawn, not assumed to be 0 — corporation-spawn's own
	// starting-fuel grant (task 5) means a fresh fleet does not start empty.
	before := fleetCargoFuel(t, owner.fleetId)

	code, _ := refuel(t, router, stranger.token, owner.fleetId, 1.0, "sdet-refuel-foreign-1")
	if code != http.StatusNotFound {
		t.Errorf("fuel-purchase \"A foreign corporation cannot refuel another corp's fleet\": status = %d, want "+
			"404", code)
	}
	if got := fleetCargoFuel(t, owner.fleetId); got != before {
		t.Errorf("owner's fleet fuel changed (%v -> %v) from a rejected foreign refuel attempt", before, got)
	}
}

func TestRefuel_Scenario_TwoExistenceHiddenRejectionsAreMutuallyIndistinguishable(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	owner := spawnFuelCorp(t, router, "SDET Refuel 404-Parity Owner Corp")
	stranger := spawnFuelCorp(t, router, "SDET Refuel 404-Parity Stranger Corp")
	dockFleetAtStation(t, owner)

	wForeign := doJSON(t, router, http.MethodPost, "/v1/fleets/"+owner.fleetId+"/refuel", stranger.token,
		map[string]any{"tons": 1.0, "operationKey": "sdet-404-parity-foreign"}, nil)
	requireRouteImplemented(t, wForeign)
	wUnknown := doJSON(t, router, http.MethodPost, "/v1/fleets/does-not-exist/refuel", stranger.token,
		map[string]any{"tons": 1.0, "operationKey": "sdet-404-parity-unknown"}, nil)
	requireRouteImplemented(t, wUnknown)

	if wForeign.Code != http.StatusNotFound || wUnknown.Code != http.StatusNotFound {
		t.Fatalf("fuel-purchase \"The two existence-hidden rejections are mutually indistinguishable\": "+
			"foreign fleet status = %d, unknown fleet status = %d, want 404/404", wForeign.Code, wUnknown.Code)
	}
	if wForeign.Body.String() != wUnknown.Body.String() {
		t.Errorf("fuel-purchase \"The two existence-hidden rejections are mutually indistinguishable\": "+
			"foreign-fleet body = %q, unknown-fleet body = %q — both must be byte-identical", wForeign.Body.String(),
			wUnknown.Body.String())
	}
}

func TestRefuel_Scenario_OwningCorporationRefuelProceedsNormally(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Owner Proceeds Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)
	before := fleetCargoFuel(t, sp.fleetId) // NOT assumed to be 0 — spawn's own starting-fuel grant may apply

	code, _ := refuel(t, router, sp.token, sp.fleetId, 5.0, "sdet-refuel-owner-proceeds-1")
	if code != http.StatusOK {
		t.Errorf("fuel-purchase \"The owning corporation's refuel proceeds normally\": status = %d, want 200",
			code)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != before+5.0 {
		t.Errorf("fleet fuel = %v after a 5-ton refuel (started at %v), want exactly %v", got, before, before+5.0)
	}
}

// --- Refuel Requires the Fleet Docked To the Selling Station --------------

func TestRefuel_Scenario_FleetDockedToAStationMayRefuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Docked Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)

	code, _ := refuel(t, router, sp.token, sp.fleetId, 1.0, "sdet-refuel-docked-1")
	if code != http.StatusOK {
		t.Errorf("fuel-purchase \"A fleet docked to a station may refuel\": status = %d, want 200", code)
	}
}

func TestRefuel_Scenario_FleetParkedNearStationButNotAttachedCannotRefuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Not-Attached Corp")
	arrangeStationaryPoint(t, router, sp) // Explicit scenario premise; real spawn remains station-hosted.
	setCorpCredits(t, sp.corpId, 1_000_000)
	// Explicitly arranged point park with attachment cleared —
	// this is the routine "not docked" case, distinct from actively
	// burning/coasting.
	code, _ := refuel(t, router, sp.token, sp.fleetId, 1.0, "sdet-refuel-not-attached-1")
	if code == http.StatusOK {
		t.Errorf("fuel-purchase \"A fleet parked near a station but not attached to it cannot refuel\": a " +
			"never-docked fleet's refuel returned 200, want a rejection")
	}
}

// --- Refuel Resolves the Station From the Acting Fleet's Own System ------

func TestRefuel_Scenario_ARefuelRequestCarriesNoSystemIdOrStationIdentifier(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel No-System-Id Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)

	// The request this suite sends everywhere already carries only
	// {tons, operationKey} — proving the ENDPOINT accepts a body with no
	// systemId/stationId field at all is exactly this scenario's own
	// positive case.
	code, _ := refuel(t, router, sp.token, sp.fleetId, 1.0, "sdet-refuel-no-system-id-1")
	if code != http.StatusOK {
		t.Errorf("fuel-purchase \"A refuel request carries no system id or station identifier\": a request "+
			"naming only {fleetId (path), tons, operationKey} returned %d, want 200", code)
	}
}

// --- A Single Global Fuel Price, Unlimited Station Supply -----------------

func TestRefuel_Scenario_RepeatedRefuelsNeverExhaustAStationsFuelSupply(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Unlimited Supply Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)

	for i := 0; i < 5; i++ {
		setFleetFuel(t, sp.fleetId, 0) // free hold each round, so tonnage validation never blocks the point
		code, _ := refuel(t, router, sp.token, sp.fleetId, 1.0, sdetOpKey(i))
		if code != http.StatusOK {
			t.Errorf("fuel-purchase \"Repeated refuels never exhaust a station's fuel supply\": refuel #%d "+
				"status = %d, want 200 every time", i, code)
		}
	}
}

func sdetOpKey(i int) string {
	keys := []string{"sdet-unlimited-0", "sdet-unlimited-1", "sdet-unlimited-2", "sdet-unlimited-3", "sdet-unlimited-4"}
	return keys[i]
}

// --- Cost Arithmetic Rounds Against the Buyer, Is Overflow-Safe -----------

func TestRefuel_Scenario_ASettledRefuelNeverAppendsANonNegativeSignedLedgerEntry(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Ledger Sign Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)

	code, _ := refuel(t, router, sp.token, sp.fleetId, 3.0, "sdet-ledger-sign-1")
	if code != http.StatusOK {
		t.Fatalf("refuel: status = %d", code)
	}
	entry := ledgerEntry(t, sp.corpId, "sdet-ledger-sign-1")
	amount, ok := entry["amount"].(int64)
	if !ok {
		t.Fatalf("ledger entry for op key sdet-ledger-sign-1 not found or has no int64 amount: %v", entry)
	}
	if amount >= 0 {
		t.Errorf("fuel-purchase \"A settled refuel never appends a non-negative-signed ledger entry\": "+
			"ledger entry amount = %d, want strictly negative (a refuel is a debit)", amount)
	}
}

// --- Refuel Is All-Or-Nothing, Never Partially Filled ---------------------

func TestRefuel_Scenario_AnAffordableRequestFillsItsFullRequestedTonnage(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Full Fill Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000_000) // certainly affords any reasonable per-ton price
	before := fleetCargoFuel(t, sp.fleetId)     // NOT assumed to be 0 — spawn's own starting-fuel grant may apply

	code, _ := refuel(t, router, sp.token, sp.fleetId, 50.0, "sdet-full-fill-1")
	if code != http.StatusOK {
		t.Fatalf("refuel: status = %d", code)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != before+50.0 {
		t.Errorf("fuel-purchase \"An affordable request fills its full requested tonnage\": fleet fuel = %v, "+
			"want exactly %v (started at %v, plus the full 50-ton requested tonnage, never a partial fill)",
			got, before+50.0, before)
	}
}

func TestRefuel_Scenario_AnUnaffordableRequestIsRejectedInFullNeverReduced(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Unaffordable Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 0)         // cannot afford ANY positive-priced tonnage
	before := fleetCargoFuel(t, sp.fleetId) // NOT assumed to be 0 — spawn's own starting-fuel grant may apply

	code, _ := refuel(t, router, sp.token, sp.fleetId, 50.0, "sdet-unaffordable-1")
	if code == http.StatusOK {
		t.Errorf("fuel-purchase \"An unaffordable request is rejected in full, never reduced\": a refuel " +
			"request against a ZERO-credit corporation returned 200, want a rejection")
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != before {
		t.Errorf("fleet fuel = %v after a rejected-for-unaffordability refuel, want %v (unchanged) — never "+
			"reduced to whatever tonnage the balance could afford", got, before)
	}
	if got := corpCredits(t, sp.corpId); got != 0 {
		t.Errorf("corp credits = %d after a rejected refuel, want 0 (unchanged)", got)
	}
}

// --- Positive Finite Tonnage Within the Fleet's Free Hold ------------------

func TestRefuel_Scenario_ZeroNegativeOrNonFiniteTonnageIsRejected(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Invalid Tonnage Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)
	before := fleetCargoFuel(t, sp.fleetId) // NOT assumed to be 0 — spawn's own starting-fuel grant may apply

	// NaN/±Inf are deliberately NOT included in this loop: standard JSON has
	// no wire representation for them at all (encoding/json refuses to
	// MARSHAL a NaN/Inf float64, so a conformant HTTP client — and this
	// suite's own doJSON helper — cannot even construct such a request).
	// Whatever "non-finite" means for a value that arrives over real JSON
	// (e.g. a numeral literal large enough to overflow float64 on decode)
	// is a narrower, lower-priority case than zero/negative — flagged as a
	// coverage gap in the SDET handoff report rather than tested here with
	// a request shape no real client could ever send.
	for i, tons := range []float64{0, -5} {
		opKey := []string{"sdet-invalid-tonnage-zero", "sdet-invalid-tonnage-negative"}[i]
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/refuel", sp.token,
			map[string]any{"tons": tons, "operationKey": opKey}, nil)
		requireRouteImplemented(t, w)
		if w.Code == http.StatusOK {
			t.Errorf("fuel-purchase \"Zero, negative, or non-finite tonnage is rejected\": tons=%v returned 200, "+
				"want a rejection", tons)
		}
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != before {
		t.Errorf("fleet fuel changed (%v -> %v) from an invalid-tonnage request", before, got)
	}
}

func TestRefuel_Scenario_ARequestExceedingFreeHoldIsRejectedNotClamped(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Exceeds Free Hold Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000_000)
	before := fleetCargoFuel(t, sp.fleetId) // NOT assumed to be 0 — spawn's own starting-fuel grant may apply

	// Free hold is 200 tons (fleet/roster.go's defaultSeedHoldCapacity) per
	// hull, minus whatever spawn already granted — 500 tons unambiguously
	// exceeds a single hull's capacity regardless of that starting amount.
	code, _ := refuel(t, router, sp.token, sp.fleetId, 500.0, "sdet-exceeds-free-hold-1")
	if code == http.StatusOK {
		t.Errorf("fuel-purchase \"A request exceeding free hold is rejected, not clamped\": a 500-ton refuel " +
			"against a 200-ton-capacity hull returned 200, want a rejection")
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != before {
		t.Errorf("fleet fuel = %v after a rejected over-capacity refuel, want %v (unchanged) — never clamped "+
			"down to the available free hold", got, before)
	}
}

// --- One Atomic Transaction — Credit Debit and Fuel Credit -----------------

func TestRefuel_Scenario_ASettledRefuelLandsBothEffectsTogether(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Atomic Corp")
	dockFleetAtStation(t, sp)
	const startingCredits = 1_000_000
	setCorpCredits(t, sp.corpId, startingCredits)
	beforeFuel := fleetCargoFuel(t, sp.fleetId) // NOT assumed to be 0 — spawn's own starting-fuel grant may apply

	code, _ := refuel(t, router, sp.token, sp.fleetId, 10.0, "sdet-atomic-refuel-1")
	if code != http.StatusOK {
		t.Fatalf("refuel: status = %d", code)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != beforeFuel+10.0 {
		t.Errorf("fleet fuel = %v after a settled refuel, want exactly %v (started at %v)", got, beforeFuel+10.0, beforeFuel)
	}
	if got := corpCredits(t, sp.corpId); got >= startingCredits {
		t.Errorf("fuel-purchase \"A settled refuel lands both effects together\": corp credits = %d, want "+
			"strictly less than the starting %d — a settled refuel must debit SOME credits", got, startingCredits)
	}
}

// --- Idempotent By Operation Key -------------------------------------------

func TestRefuel_Scenario_ARetriedRefuelAfterALostResponseDoesNotDoubleCharge(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Idempotent Retry Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)

	code1, _ := refuel(t, router, sp.token, sp.fleetId, 7.0, "sdet-idempotent-retry-1")
	if code1 != http.StatusOK {
		t.Fatalf("first refuel: status = %d", code1)
	}
	fuelAfterFirst := fleetCargoFuel(t, sp.fleetId)
	creditsAfterFirst := corpCredits(t, sp.corpId)

	code2, _ := refuel(t, router, sp.token, sp.fleetId, 7.0, "sdet-idempotent-retry-1") // SAME key, SAME params
	if code2 != http.StatusOK {
		t.Errorf("fuel-purchase \"A retried refuel after a lost response does not double-charge\": the retry "+
			"(same operation key, same parameters) returned %d, want 200 (a replay, not a rejection)", code2)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != fuelAfterFirst {
		t.Errorf("fleet fuel after the retry = %v, want %v (unchanged — no second credit)", got, fuelAfterFirst)
	}
	if got := corpCredits(t, sp.corpId); got != creditsAfterFirst {
		t.Errorf("corp credits after the retry = %d, want %d (unchanged — no second debit)", got, creditsAfterFirst)
	}
}

func TestRefuel_Scenario_AReusedKeyNamingDifferentParametersIsRejectedAsAConflict(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel Conflict Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)

	code1, _ := refuel(t, router, sp.token, sp.fleetId, 7.0, "sdet-conflict-refuel-1")
	if code1 != http.StatusOK {
		t.Fatalf("first refuel: status = %d", code1)
	}
	code2, _ := refuel(t, router, sp.token, sp.fleetId, 9.0, "sdet-conflict-refuel-1") // SAME key, DIFFERENT tons
	if code2 == http.StatusOK {
		t.Errorf("fuel-purchase \"A reused key naming different parameters is rejected as a conflict\": a " +
			"reused operation key naming a DIFFERENT tonnage returned 200, want a conflict rejection")
	}
}

// --- Rejections Report a Distinguishable Reason ----------------------------

func TestRefuel_Scenario_TwoDifferentRejectionsCarryDifferentReasons(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	notDocked := spawnFuelCorp(t, router, "SDET Refuel Reason Not-Docked Corp")
	setCorpCredits(t, notDocked.corpId, 1_000_000)
	_, notDockedBody := refuel(t, router, notDocked.token, notDocked.fleetId, 1.0, "sdet-reason-not-docked-1")

	unaffordable := spawnFuelCorp(t, router, "SDET Refuel Reason Unaffordable Corp")
	dockFleetAtStation(t, unaffordable)
	setCorpCredits(t, unaffordable.corpId, 0)
	_, unaffordableBody := refuel(t, router, unaffordable.token, unaffordable.fleetId, 1.0, "sdet-reason-unaffordable-1")

	if notDockedBody["error"] == unaffordableBody["error"] {
		t.Errorf("fuel-purchase \"Two different rejections carry different reasons\": not-docked reason (%v) "+
			"and unaffordable reason (%v) are identical, want distinguishable text",
			notDockedBody["error"], unaffordableBody["error"])
	}
}

// --- Instant, Not an Action -------------------------------------------------

func TestRefuel_Scenario_ASettledRefuelsResponseCarriesNoAction(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel No-Action Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/refuel", sp.token,
		map[string]any{"tons": 1.0, "operationKey": "sdet-no-action-1"}, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("refuel: status = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]interface{}
	if err := jsonUnmarshalLenient(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding refuel response: %v", err)
	}
	for _, key := range []string{"actionId", "eta"} {
		if v, ok := body[key]; ok && v != nil && v != "" {
			t.Errorf("fuel-purchase \"A settled refuel's response carries no action\": response includes %q = "+
				"%v, want no action id and no ETA", key, v)
		}
	}
	if id := fuelRunningActionId2(t, router, sp); id != "" {
		t.Errorf("fuel-purchase \"A settled refuel's response carries no action\": a running action (%s) was "+
			"created on the fleet's movement channel by a refuel — refuel must claim no action slot", id)
	}
}

func TestRefuel_Scenario_AFleetWithARunningScanCanStillRefuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Refuel With Running Scan Corp")
	setCorpCredits(t, sp.corpId, 1_000_000)
	// dockFleetAtStation alone only fakes the `attachedTo` field, leaving
	// the fleet's PHYSICAL position at its original spawn park — too far
	// from the station for a focused scan's own range check. A genuine
	// (time-travelled, not wall-clock-waited) arrival is needed here so
	// BOTH the refuel precondition and the scan's range check see a
	// consistent, real position.
	//
	// 150 tons, not 1,000,000: comfortably within the 200-ton single-hull
	// capacity (fleet/roster.go's defaultSeedHoldCapacity) — an earlier
	// draft's 1,000,000 was already over capacity before the refuel at the
	// end of this test even ran, so its free-hold check would reject
	// regardless of the running-scan behavior this test exists to exercise.
	setFleetFuel(t, sp.fleetId, 150.0)
	orderResp, _, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": sp.stationId})
	if code != http.StatusOK || orderResp.State.Burn == nil {
		t.Fatalf("setup order to home station: status = %d, burn = %+v", code, orderResp.State)
	}
	forceBurnArrivalPast(t, sp.fleetId)
	setFleetFuel(t, sp.fleetId, 150.0) // restore ample-but-in-capacity fuel post-"arrival" (a debited commit already spent some)

	// Start a focused scan on the sensor channel against the fleet's own
	// home station (a legal, docked-fleet-scannable host).
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/scan", sp.token,
		map[string]any{"hostId": sp.stationId}, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("setup: POST /v1/fleets/%s/scan: status = %d, body = %s", sp.fleetId, w.Code, w.Body.String())
	}

	refuelCode, _ := refuel(t, router, sp.token, sp.fleetId, 1.0, "sdet-refuel-with-scan-1")
	if refuelCode != http.StatusOK {
		t.Errorf("fuel-purchase \"A fleet with a running scan can still refuel\": status = %d, want 200 — a "+
			"running scan on the independent sensor channel must not block a refuel", refuelCode)
	}
}

// fuelRunningActionId2 is fuelRunningActionId's own no-fatal cousin: it
// reports "" rather than failing the test when no running action exists —
// used here as a POSITIVE-absence check (no action must exist), where
// fuelRunningActionId's own Fatalf-on-none behavior would be the wrong
// polarity.
func fuelRunningActionId2(t *testing.T, router http.Handler, sp fuelSpawn) string {
	t.Helper()
	var inbox struct {
		Actions []struct {
			Id string `json:"id"`
		} `json:"actions"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/actions?actor="+sp.fleetId+"&status=running", sp.token, nil, &inbox)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/actions?actor=%s&status=running: status = %d", sp.fleetId, w.Code)
	}
	for _, a := range inbox.Actions {
		return a.Id // first is enough — a movement-channel action existing at all is the finding
	}
	return ""
}

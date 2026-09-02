package main

// RED-PHASE SDET e2e SUITE for openspec change add-stationkeep-hold-verb —
// the two cross-domain seams, driven through the production router:
//
//   - mine-extraction MODIFIED "Resolve Clamps Yield to Reality":
//     "A station-keeping settlement landing mid-run widens free hold and
//     changes no take" (task 7.12), and fleet-movement's "FreeHold used by
//     mine's resolve clamp reflects a settled hold" (tasks 7.5, 7.13)
//   - fleet-movement "Station-Keeping Upkeep Is Settled at Discrete
//     Events...": "A burn committed from an open station-keeping hold settles
//     its accrued upkeep and replaces the park, without restamping"
//     (wire half; the exact arithmetic is pinned in
//     backend/fleet/stationkeep_settlement_consumers_test.go)
//
// REVISED for this change (cause: spec change). An earlier draft of this file
// induced a `holdFull` clamp by writing cargo straight into the fleet
// document, and asserted that the settlement CHANGED the take. Both are now
// wrong: task 6.2 forbids the first outright ("Do NOT write a test that
// induces `holdFull` by writing cargo straight into the fleet document ...
// which is the shape of test this chain has already been burned by"), and the
// scenario's own THEN is that the take is UNCHANGED — "a widened free hold can
// never bind `take = min(tons, remainingAtEta, freeHoldAtResolve)` when `tons`
// was already admitted against the narrower commit-time figure". The
// `holdFull` branch "remains structurally unreachable in production".

import (
	"net/http"
	"testing"
)

// Scenario: A station-keeping settlement landing mid-run widens free hold and
// changes no take.
// Scenario: FreeHold used by mine's resolve clamp reflects a settled hold.
//
// THE LOAD-BEARING CLAIM of the mine-extraction delta is REACHABILITY: "a
// fleet mining a feature (`docked`, i.e. `attachedTo` naming that feature) can
// be held into `stationkeep` without ever ceasing to be docked to it." That is
// asserted here against the real verbs, not assumed.
//
// TASK 7.5's TRAP: "a test that only asserts stability passes against the
// stale-over-report bug this change exists to close, so assert the value
// equals what a fresh fold to `orbit` with `fuel` at the reserve would
// produce." The fuel assertions below do exactly that, and the stale figure is
// checked immediately before the resolve so a settlement that had already
// happened cannot make them pass by accident.
//
// TASK 7.13 for THIS consumer specifically: the settlement is applied "within
// the resolve's own transaction, not by a preceding, independent write —
// a resolver error aborts that transaction and leaves the action `running` to
// be retried, so no settlement is lost by being written inside it."
func TestMineClamp_Scenario_AStationKeepingSettlementLandingMidRunWidensFreeHoldAndChangesNoTake(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Mine Mid-Run Settlement Corp")
	featureId, kind := pickMineableFeature(t, router, sp)

	// Fly to the lode for real, settle the arrival, and hold beside it.
	staleFuel := reserve + 50
	arriveInOrbitAround(t, router, sp, featureId, staleFuel)
	setFleetCargoFor(t, sp.fleetId, map[string]float64{"fuel": staleFuel})

	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold on the mining fleet: status = %d, body = %s", w.Code, w.Body.String())
	}
	if got := storedAttachedToDoc(t, sp.fleetId); got != featureId {
		t.Fatalf("fleet-movement \"A fleet's attachment survives hold, release, and force-demotion\": "+
			"attachedTo = %q after the hold, want the mined feature %q. `hold` \"requires only that the "+
			"fleet's effective park mode be `orbit`, and ... never alters `attachedTo`\" — without this the "+
			"whole mid-run scenario is unreachable and the mine-extraction delta has no subject.",
			got, featureId)
	}

	// Commit a run for a tonnage the commit-time free hold comfortably admits.
	const requested = 20.0
	var committed struct {
		ActionId string `json:"actionId"`
	}
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/mine", sp.token,
		map[string]any{"featureId": featureId, "kind": kind, "tons": requested}, &committed)
	if w.Code != http.StatusOK {
		t.Fatalf("committing the mine run: status = %d, body = %s", w.Code, w.Body.String())
	}
	oreAtCommit := fleetCargoKind(t, sp.fleetId, kind)

	// The hold's dry instant passes INSIDE the run's window, with nothing
	// having observed it.
	rewindHoldWindowPastDryInstant(t, sp.fleetId, 5_000)
	if stale := fleetCargoFuel(t, sp.fleetId); stale != staleFuel {
		t.Fatalf("fixture invariant: the stored fuel must still show the stale %v immediately before the "+
			"resolve (got %v) — a pre-settled fleet makes every assertion below pass by accident", staleFuel, stale)
	}

	forceActionEtaPast(t, sp.fleetId)
	resolveDueActionsInSystem(t, router, sp)

	act := readAction(t, router, sp.token, committed.ActionId)
	if status, _ := act["status"].(string); status != "done" {
		t.Fatalf("the mine action did not resolve (status = %v, outcome = %v) — the fixture's resolve trigger "+
			"failed, not the behaviour under test", act["status"], act["outcome"])
	}

	// "THEN `freeHoldAtResolve`, read fresh with that settlement applied, is
	// strictly greater than `freeHoldAtCommit`" — observed through the figure
	// free hold is computed from: the stored fuel dropped from the pre-hold
	// level to exactly the reserve inside the run's window.
	fuelAfter := fleetCargoFuel(t, sp.fleetId)
	if fuelAfter != reserve {
		t.Errorf("fleet-movement \"FreeHold used by mine's resolve clamp reflects a settled hold\": stored "+
			"fuel after the resolve = %v, want exactly the reserve %v. A value of %v means the resolve "+
			"clamp read the STALE pre-fold figure — \"never the stale pre-fold value that would otherwise "+
			"over-report the fleet's available capacity\" — and that the settlement was never applied "+
			"\"within the resolve's own transaction\" (task 4.8: mine's resolve clamp is deliberately NOT one "+
			"of the preceding-write consumers). A value of 0 means the reserve was not held back.",
			fuelAfter, reserve, staleFuel)
	}
	if !(staleFuel > fuelAfter) {
		t.Errorf("mine-extraction \"A station-keeping settlement landing mid-run widens free hold and changes "+
			"no take\": the fleet held %v at commit and %v at resolve, so free hold did not widen. The "+
			"delta's whole retired claim is that \"`freeHoldAtResolve` no longer always equals "+
			"`freeHoldAtCommit`. It can now be strictly larger, by exactly a station-keeping settlement's "+
			"`fuel` debit.\"", staleFuel, fuelAfter)
	}

	// "AND the take is still the full requested `tons` and the resolved
	// action's reason code is still `clean`, because a widened free hold can
	// never bind take = min(tons, remainingAtEta, freeHoldAtResolve)."
	gotTake := fleetCargoKind(t, sp.fleetId, kind) - oreAtCommit
	if !almostEqual(gotTake, requested, 1e-6) {
		t.Errorf("mine-extraction \"A station-keeping settlement landing mid-run widens free hold and changes "+
			"no take\": the run took %v tons of %q, want the full %v. Resolved reasonCode = %v, outcome = %v.",
			gotTake, kind, requested, act["reasonCode"], act["outcome"])
	}
	if reason, _ := act["reasonCode"].(string); reason != "clean" {
		t.Errorf("mine-extraction \"Resolve Clamps Yield to Reality\": resolved reasonCode = %q, want "+
			"\"clean\" — nothing bound this run once the station-keeping settlement widened free hold; a "+
			"`holdFull` here means the clamp evaluated against the wrong figure entirely, since a settlement "+
			"only ever DEBITS fuel and so can only WIDEN free hold", reason)
	}
}

// Scenario: A burn committed from an open station-keeping hold settles its
// accrued upkeep and replaces the park, without restamping (wire half).
func TestBurnFromHold_Scenario_ABurnOrderedFromAnOpenHoldReplacesTheParkAndSettlesTheAccrual(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Burn From Hold Corp")
	startFuel := reserve + 5_000
	arriveInOrbitAround(t, router, sp, sp.stationId, startFuel)

	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	h0, d0 := holdWindow(t, sp.fleetId)
	window := d0 - h0
	// Put the hold most of the way through its window so the accrual is a
	// large, unmissable fraction of the spendable budget — a forgiven accrual
	// could not hide inside rounding.
	rewindHoldWindow(t, sp.fleetId, window*3/4)
	fuelBefore := fleetCargoFuel(t, sp.fleetId)

	ordered, _, code := postOrder(t, router, sp.token, sp.fleetId,
		map[string]any{"point": map[string]any{"x": 1.0e6, "y": 0.0, "z": 0.0}})
	if code != http.StatusOK {
		t.Fatalf("ordering a burn from an open station-keeping hold: status = %d — a hold is not a movement "+
			"lock; the burn must commit, settling the hold's accrual on its way", code)
	}
	if ordered.State.Burn == nil {
		t.Fatalf("the order did not produce a burn: %+v", ordered.State)
	}

	// The stationkeep park is GONE — replaced outright, never restamped.
	if mode := storedParkMode(t, sp.fleetId); mode != "burn" {
		t.Fatalf("fleet-movement \"A burn committed from an open station-keeping hold ... replaces the park, "+
			"without restamping\": the stored kinematic mode is %q after the commit, want \"burn\"", mode)
	}

	// The accrual was settled, not forgiven: the debit exceeds the burn's own
	// fuel cost by roughly the three-quarters-of-a-window of upkeep.
	burnCost := expectedFuelCostTons(ordered.State.Burn, 1)
	fuelAfter := fleetCargoFuel(t, sp.fleetId)
	settled := fuelBefore - fuelAfter - burnCost
	spendable := startFuel - reserve
	wantAccrual := spendable * 3 / 4
	if settled < wantAccrual*0.5 {
		t.Errorf("fleet-movement \"A burn committed from an open station-keeping hold settles its accrued "+
			"upkeep\": the commit debited %v tons beyond the burn's own %v-ton fuel cost, want ~%v (three "+
			"quarters of the hold's %v-ton spendable budget). A near-zero figure means the accrual was "+
			"FORGIVEN — \"No path SHALL end a hold without settling it.\"",
			settled, burnCost, wantAccrual, spendable)
	}
	if settled > wantAccrual*2 {
		t.Errorf("the commit debited %v tons beyond the burn's %v-ton cost, want ~%v — a large overshoot is "+
			"the signature of a missing ms→s or Δv→tons conversion in the settlement",
			settled, burnCost, wantAccrual)
	}
	if fuelAfter < 0 {
		t.Errorf("stored fuel went negative (%v)", fuelAfter)
	}
}

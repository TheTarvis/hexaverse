package main

// RED-PHASE SDET e2e SUITE for openspec change add-stationkeep-hold-verb —
// the WIRE half. Everything here goes through SetupRouter(); nothing here
// calls a service method directly.
//
// Covered (fleet-movement unless noted):
//   - "Station-Keeping Hold and Release Are Fleet Verbs": the two happy-path
//     scenarios and the three named 409 rejections, at the HTTP surface
//   - "Holding over a silently expired hold settles it first and is then
//     rejected" (wire half; the no-intervening-observation half is pinned in
//     backend/fleet/stationkeep_ordered_preconditions_test.go, where the
//     clock is injected and nothing at all runs between the two calls)
//   - "Fleet Cargo Pool": "An open station-keeping hold does not by itself
//     change the stored fuel entry"
//   - "Station-Keeping Upkeep Is Settled at Discrete Events...": "Fuel
//     exhaustion during a hold force-demotes to orbit, never negative"
//     (task 7.2), "A release at exactly the dry instant is rejected..."
//     (task 7.4)
//   - "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First":
//     the estimated-range, stranded-indication and refuel-free-hold
//     scenarios' DURABLE-PERSISTENCE half (task 7.13). Their
//     value-correctness half is pinned in
//     backend/fleet/stationkeep_settlement_consumers_test.go against the
//     real FuelStatus arithmetic.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/space"
)

// --- the verbs are REACHABLE ------------------------------------------------

// Scenario: Holding converts an orbiting fleet to station-keep at its current
// offset (wire half).
// Scenario: Releasing converts a station-keeping fleet back to orbit (wire
// half).
//
// This is THE test this whole change exists to make possible. Before it,
// space.StationKeepRate / StationKeepUpkeep / ReleaseStationkeep had zero
// production callers and space.StateAt never produced ParkStationkeep — the
// eighth "built, unit-tested, reached by nothing" in this chain.
func TestHoldVerb_Scenario_HoldAndReleaseAreReachableThroughTheProductionRouter(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Hold Reachable Corp")
	arriveInOrbitAround(t, router, sp, sp.stationId, reserveTons(t)+60)

	w := postHold(t, router, sp.token, sp.fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("fleet-movement \"Station-Keeping Hold and Release Are Fleet Verbs\": POST /v1/fleets/%s/hold "+
			"returned %d (body: %s), want 200. The verb must be served by the production router — "+
			"decisions.md's force-demotion guardrail \"is real and correct, and it protects nothing until the "+
			"verb exists\".", sp.fleetId, w.Code, w.Body.String())
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkStationkeep {
		t.Fatalf("after a successful hold the stored park kind = %v, want ParkStationkeep", got)
	}
	holdStart, dryInstant := holdWindow(t, sp.fleetId)
	if holdStart <= 0 {
		t.Errorf("stored holdStartMs = %d, want the world time the hold was committed (strictly positive — "+
			"space-kinematics's own decode rule rejects an absent or non-positive hold start)", holdStart)
	}
	if dryInstant <= holdStart {
		t.Errorf("stored dryInstantMs = %d, want strictly after holdStartMs = %d", dryInstant, holdStart)
	}

	// The verbs are instant: neither creates an action-dispatch action.
	if id := fuelRunningActionId2(t, router, sp); id != "" {
		t.Errorf("fleet-movement \"Station-Keeping Hold and Release Are Fleet Verbs\": hold created a running "+
			"action (%s) — \"no action-dispatch action is created, no channel slot is claimed, and no ETA is "+
			"computed by either\"", id)
	}

	r := postRelease(t, router, sp.token, sp.fleetId)
	if r.Code != http.StatusOK {
		t.Fatalf("POST /v1/fleets/%s/release returned %d (body: %s), want 200", sp.fleetId, r.Code, r.Body.String())
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkOrbit {
		t.Errorf("fleet-movement \"Releasing converts a station-keeping fleet back to orbit\": stored park "+
			"kind after release = %v, want ParkOrbit", got)
	}
	if id := fuelRunningActionId2(t, router, sp); id != "" {
		t.Errorf("release created a running action (%s) — release is instant too", id)
	}
}

// Scenario: Holding a fleet that is not orbiting is rejected by name (wire
// half).
// Scenario: Releasing a fleet that is not station-keeping is rejected by name
// (wire half).
// Scenario: Holding a fleet with insufficient fuel is rejected, not silently
// bricked (wire half).
//
// The requirement now pins the STATUS as well as the distinctness: "Each of
// the three rejections above ... SHALL be served as `409 Conflict` carrying
// its own reason in the response body's `error` field, the three reasons
// being pairwise distinct ... None of the three rejections above SHALL be
// served as a bodyless `5xx`."
//
// Task 3.4: "Do not copy cut-drive's wiring as a model — ErrNotBurning is
// unwired and returns a bodyless 500 today."
func TestHoldVerb_Scenario_TheThreeNamedRejectionsAre409AndDistinguishableOverHTTP(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	// (a) release against a fleet that is not station-keeping (an explicitly
	//     arranged point park).
	notHolding := spawnFuelCorp(t, router, "SDET Reject Not Holding Corp")
	arrangeStationaryPoint(t, router, notHolding)
	setFleetFuel(t, notHolding.fleetId, reserveTons(t)+50)
	releaseReason := conflictReason(t, postRelease(t, router, notHolding.token, notHolding.fleetId),
		"release against a fleet that is not station-keeping")

	// (b) hold against a fleet that is not orbiting (the same point park).
	holdNotOrbiting := conflictReason(t, postHold(t, router, notHolding.token, notHolding.fleetId),
		"hold against a fleet whose effective state is a `point` park")

	// (c) hold against an ORBITING fleet holding EXACTLY the configured
	//     reserve — the boundary the requirement names: "the fleet's
	//     currently held `fuel` is AT OR BELOW the configured station-keeping
	//     reserve ... this is not merely 'small fuel,' it is specifically 'no
	//     spendable fuel above the reserve'."
	reserve := reserveTons(t)
	noSpendable := spawnFuelCorp(t, router, "SDET Reject No Spendable Fuel Corp")
	arriveInOrbitAround(t, router, noSpendable, noSpendable.stationId, reserve)
	setFleetCargoFor(t, noSpendable.fleetId, map[string]float64{"fuel": reserve})
	holdNoSpendable := conflictReason(t, postHold(t, router, noSpendable.token, noSpendable.fleetId),
		"hold against an orbiting fleet holding exactly the station-keeping reserve")

	// The rejected hold must not have stored anything.
	if got := storedParkKind(t, noSpendable.fleetId); got != space.ParkOrbit {
		t.Errorf("fleet-movement \"Holding a fleet with insufficient fuel is rejected, not silently bricked\": "+
			"stored park kind = %v after the rejection, want the unchanged ParkOrbit — \"no `stationkeep` park "+
			"is stored\"", got)
	}
	if _, _, code := fuelGetFleet(t, router, noSpendable.token, noSpendable.fleetId); code != http.StatusOK {
		t.Errorf("the fleet no longer reads (GET status %d) after a rejected insufficient-fuel hold — this is "+
			"exactly the brick the precondition exists to prevent", code)
	}

	pairs := []struct{ a, b, aName, bName string }{
		{holdNotOrbiting, releaseReason, "hold's not-orbiting reason", "release's not-station-keeping reason"},
		{holdNotOrbiting, holdNoSpendable, "hold's not-orbiting reason", "hold's insufficient-fuel reason"},
		{releaseReason, holdNoSpendable, "release's not-station-keeping reason", "hold's insufficient-fuel reason"},
	}
	for _, p := range pairs {
		if p.a == p.b {
			t.Errorf("fleet-movement: %s and %s are the identical message %q — the requirement demands each "+
				"verb reject \"with its own named reason, distinct from one another\", the insufficient-fuel "+
				"rejection be \"distinct from the not-orbiting rejection\", and \"the three reasons being "+
				"pairwise distinct\". A caller that cannot tell them apart cannot tell the player what to do "+
				"about it.", p.aName, p.bName, p.a)
		}
	}
}

// conflictReason asserts the response is exactly `409 Conflict` carrying a
// JSON `error` message, and returns that message. A bodyless 5xx is a
// failure, not a rejection: "None of the three rejections above SHALL be
// served as a bodyless `5xx`", and 409 is the status "this capability's
// command surface uses for the five state-precondition and
// resource-insufficiency rejections of a fleet command that are wired today".
func conflictReason(t *testing.T, w *httptest.ResponseRecorder, what string) string {
	t.Helper()
	if w.Code >= 500 {
		t.Fatalf("%s returned %d (body: %s), want 409 Conflict carrying a named reason — a bodyless 5xx is "+
			"not a \"named reason\" any caller can act on, and is exactly cut-drive's own unwired defect "+
			"(task 5.1) that task 3.4 forbids copying", what, w.Code, w.Body.String())
	}
	if w.Code != http.StatusConflict {
		t.Fatalf("%s returned %d (body: %s), want 409 Conflict — \"Each of the three rejections above ... "+
			"SHALL be served as 409 Conflict carrying its own reason in the response body's `error` field\"; "+
			"400 is reserved for a malformed body and 404 for absence and foreign ownership",
			what, w.Code, w.Body.String())
	}
	var body map[string]interface{}
	_ = jsonUnmarshalLenient(w.Body.Bytes(), &body)
	msg, _ := body["error"].(string)
	if msg == "" {
		t.Fatalf("%s returned 409 with no `error` message (body: %q) — the requirement demands \"its own "+
			"named reason ... in the response body's `error` field\"", what, w.Body.String())
	}
	return msg
}

// storedAttachedTo reads a fleet's stored attachment straight from Firestore.
func storedAttachedTo(t *testing.T, fleetId string) string {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("fleets").Doc(fleetId).Get(context.Background())
	if err != nil {
		t.Fatalf("reading fleet %s: %v", fleetId, err)
	}
	v, _ := snap.Data()["attachedTo"].(string)
	return v
}

// --- Fleet Cargo Pool -------------------------------------------------------

// Scenario: An open station-keeping hold does not by itself change the stored
// fuel entry.
func TestCargoPool_Scenario_AnOpenStationKeepingHoldDoesNotByItselfChangeTheStoredFuelEntry(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Open Hold Fuel Untouched Corp")
	startFuel := reserveTons(t) + 80
	arriveInOrbitAround(t, router, sp, sp.stationId, startFuel)
	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	_, dryInstant := holdWindow(t, sp.fleetId)
	if dryInstant <= worldNow() {
		t.Fatalf("fixture invariant: the hold must still be open (dryInstant=%d, now=%d)", dryInstant, worldNow())
	}

	// Two reads at two different world times, both before the stored dry
	// instant. (Two sequential HTTP round trips are necessarily at two
	// different world instants; no sleep is needed or used.)
	if _, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId); code != http.StatusOK {
		t.Fatalf("first read: status = %d", code)
	}
	first := fleetCargoFuel(t, sp.fleetId)
	if _, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId); code != http.StatusOK {
		t.Fatalf("second read: status = %d", code)
	}
	second := fleetCargoFuel(t, sp.fleetId)

	if first != startFuel || second != startFuel {
		t.Errorf("fleet-movement \"An open station-keeping hold does not by itself change the stored fuel "+
			"entry\" / \"A read during an open hold reports the stored, unsettled fuel value\": stored fuel "+
			"read %v then %v, want the unchanged %v both times — \"no continuous debit is applied to the "+
			"stored cargo pool merely by elapsed hold time\". A live-folding read is exactly the coupling that "+
			"makes fleet.FreeHold time-dependent for all five of its call sites.", first, second, startFuel)
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkStationkeep {
		t.Errorf("the hold did not survive two reads (stored park kind = %v)", got)
	}
}

// --- automatic force-demotion (task 7.2) -----------------------------------

// Scenario: Fuel exhaustion during a hold force-demotes to orbit, never
// negative (wire half).
// Scenario: An exhausted hold leaves exactly the reserve, never zero (wire
// half).
//
// REVISED for this change (cause: spec change — "Station-Keeping Upkeep Never
// Drains a Fleet Below Its Reserve"). The earlier draft asserted a settled
// value of exactly zero; that is now the outcome the guardrail forbids.
func TestUpkeep_Scenario_ObservedPastTheDryInstantAFleetReadsAsOrbitWithExactlyTheReserve(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Force Demote Corp")
	body := pickOrbitingNonStationBody(t, router, sp)
	arriveInOrbitAround(t, router, sp, body, reserve+90)
	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	attachedBefore := storedAttachedTo(t, sp.fleetId)

	// Drift well past the dry instant — far enough that a settlement that
	// kept subtracting past exhaustion would go deeply negative.
	rewindHoldWindowPastDryInstant(t, sp.fleetId, 60_000)

	typed, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("reading the fleet past its dry instant: status = %d", code)
	}
	if typed.State.Park == nil || typed.State.Park.Kind != space.ParkOrbit {
		t.Fatalf("fleet-movement \"Fuel exhaustion during a hold force-demotes to orbit, never negative\": the "+
			"fleet still reads as %+v past its stored dry instant, want a re-circularized orbit park. "+
			"decisions.md: \"When upkeep cannot be paid, the park force-demotes to `orbit`, the free mode.\"",
			typed.State.Park)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != reserve {
		t.Errorf("fleet-movement \"An exhausted hold leaves exactly the reserve, never zero\": stored fuel "+
			"after the fold = %v, want EXACTLY the configured station-keeping reserve %v — \"with `cargo.fuel` "+
			"settled to exactly FuelParams.StationKeepReserveTons — never zero, never negative — in the same "+
			"write that first persists the fold\". A settled 0 is precisely the passive stranding "+
			"decisions.md (2026-08-29) forbids, and stranding is permanent: no cargo-transfer verb exists "+
			"anywhere in the tree.", got, reserve)
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkOrbit {
		t.Errorf("the fold was never PERSISTED (stored park kind = %v) — the requirement says it is applied "+
			"\"on the write that first observes it\"", got)
	}
	if after := storedAttachedTo(t, sp.fleetId); after != attachedBefore {
		t.Errorf("fleet-movement \"A fleet's attachment survives hold, release, and force-demotion\": "+
			"attachedTo = %q after the force-demotion, want the unchanged %q", after, attachedBefore)
	}
}

// Scenario: A release at exactly the dry instant is rejected, the fold having
// already released the hold (wire half, task 7.4).
//
// REVISED for this change (cause: spec change). The earlier draft specified a
// clamped at-the-boundary release; this change removed it: "there is no
// clamped, at-the-boundary release path, and no rule in this capability SHALL
// define one."
func TestUpkeep_Scenario_AReleaseAtOrAfterTheDryInstantIs409NotStationKeeping(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Release At Dry Instant Corp")
	body := pickOrbitingNonStationBody(t, router, sp)
	arriveInOrbitAround(t, router, sp, body, reserve+90)
	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	// The dry instant is now in the past, with nothing having observed it.
	rewindHoldWindowPastDryInstant(t, sp.fleetId, 1_000)

	w := postRelease(t, router, sp.token, sp.fleetId)
	if w.Code == http.StatusOK {
		t.Fatalf("fleet-movement \"A release at exactly the dry instant is rejected, the fold having already " +
			"released the hold\": POST /release at/after the stored dry instant returned 200. \"the 'at or " +
			"after' fold has already made the fleet's effective park an `orbit` park, so there is no " +
			"`stationkeep` hold left to release\" — and there is no clamped, at-the-boundary release path.")
	}
	conflictReason(t, w, "release at/after the stored dry instant")

	// "AND the fleet's `fuel` is exactly the configured station-keeping
	// reserve, settled by that fold rather than by any clamped release debit"
	// — asserted "against the stored fleet document after the call, not
	// against an in-memory fold", because release's own transaction rejects
	// and would discard a settlement written inside it.
	if got := fleetCargoFuel(t, sp.fleetId); got != reserve {
		t.Errorf("stored fuel after the rejected release = %v, want exactly the reserve %v. The settlement is "+
			"carried by \"the preceding, independent, conditional write\", never by a write inside `release`'s "+
			"own transaction, so it must be DURABLE even though the verb rejected.", got, reserve)
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkOrbit {
		t.Errorf("stored park kind after the rejected release = %v, want the released ParkOrbit the settlement "+
			"wrote", got)
	}
}

// Scenario: Holding over a silently expired hold settles it first and is then
// rejected (wire half).
//
// The wire half asserts the STATUS and REASON a player sees. The
// no-intervening-observation half — the one task 7.15 warns is vacuous if any
// setup step settles the hold first — is pinned in
// backend/fleet/stationkeep_ordered_preconditions_test.go, where the injected
// clock lets literally nothing run between the two calls. Here the hold's
// window is rewound by a DIRECT Firestore stamp write, which moves the dry
// instant into the past without settling anything: the stored `fuel` still
// shows the whole pre-hold figure, asserted below before the second call.
func TestHoldVerb_Scenario_HoldingOverASilentlyExpiredHoldIs409InsufficientFuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	startFuel := reserve + 90
	sp := spawnFuelCorp(t, router, "SDET Expired Hold Rehold Corp")
	body := pickOrbitingNonStationBody(t, router, sp)
	arriveInOrbitAround(t, router, sp, body, startFuel)
	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the first hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	_, firstDry := holdWindow(t, sp.fleetId)
	rewindHoldWindowPastDryInstant(t, sp.fleetId, 2_000)

	// The anti-vacuity guard: nothing has settled the hold yet.
	if stale := fleetCargoFuel(t, sp.fleetId); stale != startFuel {
		t.Fatalf("fixture invariant: the stored fuel must still show the stale pre-hold %v here (got %v). A "+
			"pre-settled fleet already shows reserve-level fuel, and an unfixed build then rejects the second "+
			"hold for the right reason BY ACCIDENT (task 7.15).", startFuel, stale)
	}
	if k := storedParkKind(t, sp.fleetId); k != space.ParkStationkeep {
		t.Fatalf("fixture invariant: the stored park must still be the unfolded `stationkeep` one (got %v)", k)
	}

	w := postHold(t, router, sp.token, sp.fleetId)
	if w.Code == http.StatusOK {
		t.Fatalf("fleet-movement \"Holding over a silently expired hold settles it first and is then " +
			"rejected\": the second hold returned 200. Re-issuing `hold` once after each dry instant would " +
			"then hold a position forever for the fuel of a single hold — \"the gate camper paying nothing, " +
			"which is the outcome this change's whole upkeep economy exists to prevent\".")
	}
	conflictReason(t, w, "a second hold over a silently expired one")

	if got := fleetCargoFuel(t, sp.fleetId); got != reserve {
		t.Errorf("stored fuel after the rejected second hold = %v, want exactly the reserve %v — the elapsed "+
			"hold is \"settled first ... by a write that precedes and is independent of `hold`'s own "+
			"transaction\", and \"the accrued upkeep the elapsed hold incurred is never forgiven\"",
			got, reserve)
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkOrbit {
		t.Errorf("stored park kind after the rejected second hold = %v, want the released ParkOrbit — \"no "+
			"second `stationkeep` park is stored\"", got)
	}
	if _, dry := holdWindowIfAny(t, sp.fleetId); dry != 0 && dry > firstDry {
		t.Errorf("the hold was RESTAMPED with a fresh dry instant (%d, later than the elapsed hold's %d) — "+
			"that forgives the entire accrued upkeep and skips the force-demotion altogether", dry, firstDry)
	}
}

// --- "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First" ---

// Scenario: A fleet's estimated range reflects a settled hold before the range
// is computed.
// Scenario: A fleet's persistent stranded indication reflects a settled hold
// before it is computed.
//
// The DURABLE-PERSISTENCE half (task 7.13): "assert ... that the settled
// figure is durably persisted before the decision, by re-reading the stored
// fleet document after the consumer runs — an in-memory fold satisfies every
// 'computed from the settled value' assertion while leaving the stored figure
// stale."
//
// Plus a value probe that needs no arithmetic and cannot pass against a stale
// read: the SAME endpoint's estimatedRange for the SAME fleet at the SAME
// position, read once while the hold is open (fuel = the whole pre-hold
// figure) and once after it has expired (fuel = the reserve), must STRICTLY
// DECREASE. A consumer reading the stale stored figure reports the identical
// number both times.
func TestSettleFirst_Scenario_TheFleetReadsRangeAndStrandedIndicationReflectASettledHold(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	startFuel := reserve + 150
	sp := spawnFuelCorp(t, router, "SDET Stale Range Corp")
	body := pickOrbitingNonStationBody(t, router, sp)
	arriveInOrbitAround(t, router, sp, body, startFuel)
	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}

	// Control read, hold still OPEN: the range afforded by the whole tank.
	_, openBody, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("control read during the open hold: status = %d", code)
	}
	openRange := requireFloatField(t, openBody, "estimatedRange")

	// The dry instant passes with NO intervening write: the stored `fuel`
	// field still reads the whole pre-hold figure at this point.
	rewindHoldWindowPastDryInstant(t, sp.fleetId, 5_000)
	if stale := fleetCargoFuel(t, sp.fleetId); stale != startFuel {
		t.Fatalf("fixture invariant: the stored fuel should still read the stale %v here, got %v", startFuel, stale)
	}

	_, settledBody, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("reading the fleet: status = %d", code)
	}
	settledRange := requireFloatField(t, settledBody, "estimatedRange")

	if !(settledRange < openRange) {
		t.Errorf("fleet-movement \"A fleet's estimated range reflects a settled hold before the range is "+
			"computed\": estimatedRange = %v past the dry instant, against %v while the hold was still open. "+
			"The fleet holds %v tons after the settlement and held %v before, so the range must STRICTLY "+
			"decrease; an identical figure means the computation read the stale stored value. \"a stale range "+
			"figure looks like a healthy one\" — a cry-wolf failure in reverse.",
			settledRange, openRange, reserve, startFuel)
	}
	if _, ok := fieldAnywhere(settledBody, "stranded"); !ok {
		t.Fatalf("no `stranded` field on the fleet read (body: %v)", settledBody)
	}

	// The durable-persistence half — the one an in-memory fold silently fails.
	if got := fleetCargoFuel(t, sp.fleetId); got != reserve {
		t.Errorf("the read did not DURABLY settle the past-dry-instant hold: stored fuel = %v, want exactly "+
			"the reserve %v. Every fuel-reading decision \"SHALL settle-then-read, never "+
			"read-then-maybe-settle-later\", and \"that settled value is durably persisted by a write that "+
			"precedes the decision, not merely folded in memory for this one consumer\".", got, reserve)
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkOrbit {
		t.Errorf("stored park kind after the settling read = %v, want the released ParkOrbit", got)
	}
}

// Scenario: A refuel's free-hold precondition reflects a settled hold.
//
// Discriminating by construction: against the STALE fuel figure the fleet's
// free hold is far too small for the requested refuel; against the SETTLED
// figure (the hold folded, `fuel` at exactly the reserve) it fits comfortably.
// A test that merely asserted "FreeHold is stable" would pass either way.
func TestSettleFirst_Scenario_ARefuelsFreeHoldPreconditionReflectsASettledHold(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Refuel FreeHold Settled Corp")
	setCorpCredits(t, sp.corpId, 1_000_000)
	arriveInOrbitAround(t, router, sp, sp.stationId, reserve+150)

	// Capacity for a fresh seed hull is 200 t. Stale: 150+reserve fuel + 40
	// ore leaves 10−reserve free. Settled: reserve fuel + 40 ore leaves
	// 160−reserve free.
	const ore = 40.0
	const request = 40.0
	staleFuel := reserve + 150
	setFleetCargoFor(t, sp.fleetId, map[string]float64{"fuel": staleFuel, "metals": ore})
	if 160-reserve < request {
		t.Skipf("the configured reserve (%v) is large enough that even the settled free hold (%v) cannot "+
			"admit a %v-ton refuel; this fixture cannot discriminate at this tuning", reserve, 160-reserve, request)
	}

	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	rewindHoldWindowPastDryInstant(t, sp.fleetId, 5_000)

	code, resp := refuel(t, router, sp.token, sp.fleetId, request, "sdet-stationkeep-freehold-1")
	if code != http.StatusOK {
		t.Fatalf("fleet-movement \"A refuel's free-hold precondition reflects a settled hold\": the refuel was "+
			"rejected (status %d, body %v). Against the STALE stored fuel (%v t) the fleet's free hold is %v "+
			"tons and %v does not fit; against the SETTLED value (%v t, its hold having run dry) it is %v tons "+
			"and %v fits comfortably. The precondition must be \"evaluated against the settled fuel value, "+
			"never a stale, over-reported pre-fold value that could reject an otherwise-affordable refuel\".",
			code, resp, staleFuel, 200-staleFuel-ore, request, reserve, 200-reserve-ore, request)
	}
	if got := fleetCargoFuel(t, sp.fleetId); !almostEqual(got, reserve+request, 1e-6) {
		t.Errorf("stored fuel after the settle-then-refuel = %v, want %v (a past-dry-instant hold settles to "+
			"exactly the reserve %v, then the refuel's %v tons are credited)",
			got, reserve+request, reserve, request)
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkOrbit {
		t.Errorf("stored park kind after the settle-then-refuel = %v, want the released ParkOrbit", got)
	}
}

// requireFloatField extracts a numeric field from a decoded response body,
// failing the test (never defaulting to zero) when it is absent — a silent
// zero would satisfy several assertions in this file vacuously.
func requireFloatField(t *testing.T, body map[string]interface{}, key string) float64 {
	t.Helper()
	raw, ok := fieldAnywhere(body, key)
	if !ok {
		t.Fatalf("no `%s` field on the fleet read (body: %v)", key, body)
	}
	v, ok := asFloat(raw)
	if !ok {
		t.Fatalf("`%s` = %v (%T), want a number", key, raw, raw)
	}
	return v
}

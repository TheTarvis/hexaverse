package main

// RED-PHASE SDET e2e SUITE for openspec change add-stationkeep-hold-verb,
// section 5 — DRIFT REPAIR. No spec delta: all three requirements are already
// LIVE and already correct; the handler simply never implemented them, so
// each falls through `respond`'s final arm to a bodyless 500.
// Full write-up: docs/handoffs/drift-fleet-wrong-state-500.md
//
//   - task 5.1: fleet.ErrNotBurning (service.go:707) → 409 Conflict with a
//     reason-bearing body — fleet-movement (live) "Cutting a parked,
//     drifting, or in-transit fleet is rejected by name"
//     (openspec/specs/fleet-movement/spec.md:315)
//   - task 5.2: fleet.ErrAccelBelowFloor (service.go:504, :510) and
//     fleet.ErrAccelAboveCeiling (:507) → 400 Bad Request with reason-bearing
//     bodies — fleet-movement (live) "A commanded acceleration below the
//     disclosure floor is rejected" (:528) and "A commanded acceleration
//     above the ceiling is rejected" (:521)
//   - task 5.4: space.ErrCutAfterArrival (surfaced by Service.CutDrive twice —
//     directly at service.go:803 once settleIfDue reports the arrival due, and
//     by propagation from space.CutDrive at :806) → 409 Conflict with a
//     reason-bearing body PAIRWISE DISTINCT from every other wrong-state
//     rejection this switch serves — fleet-movement (live) "Cutting an
//     already-arrived burn resolves the arrival instead"
//     (openspec/specs/fleet-movement/spec.md:307-312), whose "rejected with
//     its own named reason" no bodyless 5xx can satisfy, and whose sibling
//     scenario at :315 names ErrNotBurning's reason as "distinct from the
//     already-arrived rejection"
//
// TASK 5.3/5.4 ARE THE ANTI-VACUITY RULE: "Assert in tests that the [four]
// reasons are PAIRWISE DISTINCT, not merely non-500. A status-only assertion
// passes against a handler that maps all [four] to one generic rejection,
// which is exactly the defect the [four] live scenarios' 'by name' wording
// forbids."
//
// Routed into this change because it already rewrites that exact `respond`
// switch, and because task 3.4 forbids copying cut-drive's wiring as a model
// for the three NEW rejections while it is still broken.

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDriftRepair_Scenario_FourWrongStateRejectionsAreReasonBearingAndPairwiseDistinct(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Drift Repair Corp")
	setFleetFuel(t, sp.fleetId, reserveTons(t)+500)

	// (1) cut-drive against a fleet that is not mid-burn (a fresh spawn's
	//     point park) — fleet.ErrNotBurning.
	cut := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cut-drive", sp.token,
		map[string]any{}, nil)
	notBurning := reasonBearingRejection(t, cut, http.StatusConflict,
		"cut-drive against a parked fleet (fleet.ErrNotBurning)",
		"fleet-movement (live) \"Cutting a parked, drifting, or in-transit fleet is rejected by name\" "+
			"(openspec/specs/fleet-movement/spec.md:315). `ErrNotBurning` is unwired today and falls through "+
			"`respond`'s final arm to a bodyless 500 (task 5.1).")

	// (2) an order with a commanded acceleration below the disclosure floor —
	//     fleet.ErrAccelBelowFloor.
	belowAccel := 1e-12
	below := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"bodyId": sp.stationId, "accel": belowAccel}, nil)
	belowFloor := reasonBearingRejection(t, below, http.StatusBadRequest,
		"an order with a commanded acceleration below the disclosure floor (fleet.ErrAccelBelowFloor)",
		"fleet-movement (live) \"A commanded acceleration below the disclosure floor is rejected\" "+
			"(openspec/specs/fleet-movement/spec.md:528). 400 is the status task 5.2 assigns: a commanded "+
			"acceleration outside the disclosed band is a malformed request, not a state conflict.")

	// (3) an order with a commanded acceleration above the derived ceiling —
	//     fleet.ErrAccelAboveCeiling.
	aboveAccel := 1e12
	above := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"bodyId": sp.stationId, "accel": aboveAccel}, nil)
	aboveCeiling := reasonBearingRejection(t, above, http.StatusBadRequest,
		"an order with a commanded acceleration above the derived ceiling (fleet.ErrAccelAboveCeiling)",
		"fleet-movement (live) \"A commanded acceleration above the ceiling is rejected\" "+
			"(openspec/specs/fleet-movement/spec.md:521).")

	// (4) TASK 5.4 — cut-drive against a fleet whose active burn has already
	//     reached its stored arrival but has NOT been resolved:
	//     space.ErrCutAfterArrival.
	//
	//     The burn targets a LANE GATE, not the home station. That is
	//     deliberate: a gate is motionless (system.gateOrbit gives every gate
	//     PeriodMs = 0) and sits at the system rim, so its solved insertion
	//     standoff can never dip inside the star-clearance radius the way an
	//     inner body's can — see arriveInOrbitAround's own corrected note on
	//     star-clearance refusals (served as a 409 naming the origin or the
	//     destination since fix-burn-order-geometry-refusals; formerly a
	//     bodyless 500), which would otherwise turn this arrangement into a
	//     refusal that has nothing to do with the rejection under test.
	//     Re-read for task 4.2: the claim about the gate stands (it concerns the
	//     DESTINATION's standoff point); the fleet's own ORIGIN here is the
	//     seeded hull still at its spawn park (placed at the gate radius), far
	//     outside the clearance.
	gateBodyId, _ := gateBodyIdFor(t, sp)
	setFleetFuel(t, sp.fleetId, 1_000_000)
	burn, _, orderCode := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": gateBodyId})
	if orderCode != http.StatusOK || burn.State.Burn == nil {
		t.Fatalf("arranging an already-arrived-but-unresolved burn: POST /orders {bodyId:%q} returned %d "+
			"(burn=%v)", gateBodyId, orderCode, burn.State.Burn)
	}
	// Time-travel the burn AND its backing action's frozen eta into the past
	// WITHOUT reading the fleet: any GET /v1/fleets/:id here would resolve the
	// arrival opportunistically and leave cut-drive nothing to reject,
	// vacuously turning this arm into arm (1)'s ErrNotBurning.
	forceBurnArrivalPast(t, sp.fleetId)
	if mode := storedParkMode(t, sp.fleetId); mode != "burn" {
		t.Fatalf("fixture invariant: the stored kinematic mode is %q after the rewind, want \"burn\" — the "+
			"arrival must still be UNRESOLVED when cut-drive arrives, or this arm degenerates into arm (1)'s "+
			"not-burning rejection and asserts nothing about ErrCutAfterArrival", mode)
	}

	cutAfter := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cut-drive", sp.token,
		map[string]any{}, nil)
	afterArrival := reasonBearingRejection(t, cutAfter, http.StatusConflict,
		"cut-drive against a fleet whose burn already reached its stored arrival unresolved "+
			"(space.ErrCutAfterArrival)",
		"fleet-movement (live) \"Cutting an already-arrived burn resolves the arrival instead\" "+
			"(openspec/specs/fleet-movement/spec.md:307-312): \"the order is rejected with its own named "+
			"reason\". `space.ErrCutAfterArrival` has no case in `respond` today and falls through its final "+
			"arm to a bodyless 500, which cannot carry a name (task 5.4).")

	// THE PAIR THE SPEC NAMES EXPLICITLY, asserted on its own rather than only
	// inside the loop below, because it is the one this scenario turns on:
	// :307 requires the already-arrived rejection to carry "its own named
	// reason", and :315 requires the parked/drifting/in-transit rejection to
	// be "distinct from the already-arrived rejection". Two distinct WHENs,
	// two distinct reasons — a single shared message satisfies neither.
	if afterArrival == notBurning {
		t.Errorf("task 5.4 IS NOT SATISFIED BY THE `respond` MAPPING ALONE. The already-arrived rejection came "+
			"back carrying ErrNotBurning's message (%q), so `space.ErrCutAfterArrival` never reached `respond` "+
			"at all.\n\nMECHANISM (SDET diagnosis, do not re-investigate): `Handler.CutDrive` resolves its "+
			"fleet id through `commandedFleetId` (fleet/handler.go:150), whose ownership check calls "+
			"`h.svc.Get(...)` — and `Service.Get` (fleet/service.go:261-264) settles a due, unresolved burn "+
			"opportunistically. That pre-read therefore RESOLVES THE ARRIVAL BEFORE `Service.CutDrive` is ever "+
			"entered, so `CutDrive`'s own `f.State.Mode != space.ModeBurn` guard (service.go:786) fires first "+
			"and returns `ErrNotBurning`; neither the direct `space.ErrCutAfterArrival` at service.go:803 nor "+
			"the propagated one at :806 is reachable through the HTTP surface. Task 5.4's premise (\"both fall "+
			"through to the bodyless 500\") predates the ownership pre-read commit 6a334ce. The wiring in "+
			"`respond` is necessary but not sufficient: the already-arrived case must be DISTINGUISHED before "+
			"or inside `CutDrive`, not merely mapped once it gets there.\n\nEverything else about this arm "+
			"already holds: the response is a 409 with a non-empty `error` body, and the arrival is genuinely "+
			"resolved with its effects. Only the reason's identity is wrong.", afterArrival)
	}

	// The scenario's OTHER half: "and the arrival is resolved (settled with
	// its effects) rather than converted to a drift". Asserted against the
	// STORED document, never the rejection's body.
	if mode := storedParkMode(t, sp.fleetId); mode != "park" {
		t.Errorf("fleet-movement (live) \"Cutting an already-arrived burn resolves the arrival instead\": the "+
			"stored kinematic mode is %q after the rejected cut, want \"park\" — the due arrival must be "+
			"RESOLVED (settled with its effects), not left unsettled and not converted to a drift", mode)
	}
	if got := storedAttachedToDoc(t, sp.fleetId); got != gateBodyId {
		t.Errorf("stored attachedTo = %q after the rejected cut, want the arrived-at gate %q — the arrival's "+
			"own effects must be applied by the settle the cut triggered", got, gateBodyId)
	}

	// TASK 5.3 + 5.4: pairwise distinct, not merely non-500.
	named := []struct{ msg, name string }{
		{notBurning, "cut-drive's not-burning reason"},
		{belowFloor, "the below-floor reason"},
		{aboveCeiling, "the above-ceiling reason"},
		{afterArrival, "cut-drive's already-arrived reason"},
	}
	for i := range named {
		for j := i + 1; j < len(named); j++ {
			if named[i].msg == named[j].msg {
				t.Errorf("tasks 5.3/5.4: %s and %s carry the identical message %q. \"A status-only assertion "+
					"passes against a handler that maps all four to one generic rejection, which is exactly "+
					"the defect the four live scenarios' 'by name' wording forbids.\" The already-arrived and "+
					"not-burning pair is named explicitly by the spec: \"rejected with its own named reason, "+
					"distinct from the already-arrived rejection\" "+
					"(openspec/specs/fleet-movement/spec.md:315).", named[i].name, named[j].name, named[i].msg)
			}
		}
	}
}

// reasonBearingRejection asserts the response is exactly wantStatus and
// carries a non-empty JSON `error` message, returning that message. A 5xx —
// which is what all three of these return today — fails loudly with the
// requirement it violates.
func reasonBearingRejection(t *testing.T, w *httptest.ResponseRecorder, wantStatus int, what, why string) string {
	t.Helper()
	if w.Code >= 500 {
		t.Fatalf("%s returned %d (body: %q), want %d with a reason-bearing body. %s",
			what, w.Code, w.Body.String(), wantStatus, why)
	}
	if w.Code != wantStatus {
		t.Fatalf("%s returned %d (body: %s), want %d. %s", what, w.Code, w.Body.String(), wantStatus, why)
	}
	var body map[string]interface{}
	_ = jsonUnmarshalLenient(w.Body.Bytes(), &body)
	msg, _ := body["error"].(string)
	if msg == "" {
		t.Fatalf("%s returned %d with no `error` message (body: %q) — \"rejected BY NAME\" is unsatisfiable "+
			"through a bodyless response. %s", what, w.Code, w.Body.String(), why)
	}
	return msg
}

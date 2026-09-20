package main

// RED-PHASE SDET e2e SUITE for openspec change add-stationkeep-hold-verb —
// the UNIVERSAL HOLD-ENDING SETTLEMENT, at the two verbs the earlier per-verb
// draft forgave: `stop` and `jump`.
//
// fleet-movement "Station-Keeping Upkeep Is Settled at Discrete Events, Never
// Folded Into the Stored Cargo Pool":
//   - "Stopping a fleet holding at a motionless gate settles its accrued
//     upkeep"   (task 7.9, task 7.16 — BLOCKER 2 regression)
//   - "Jumping from an open hold settles its accrued upkeep"  (task 7.9)
//
// and, live and undelta'd, "Stopping at or below the speed floor is instant
// and free" (openspec/specs/fleet-movement/spec.md:369-374), which today's
// `stop` violates for a fleet with no active action: the free branch's only
// persistence is `s.actions.Cancel(ctx, f.ActiveActionId, cancelState)`,
// guarded by `f.ActiveActionId != ""`, and `Handler.Stop` performs no DAO
// write — so for a station-keeping fleet, which has no active action (`hold`
// claims no slot), that branch writes NOTHING AT ALL.
//
// THE TWO VACUITY TRAPS TASK 7.16 NAMES, AND HOW THIS FILE AVOIDS THEM:
//
//  1. "giving the fixture an active action (any mining or burning fleet),
//     which restores the `actions.Cancel` write and makes both fixtures pass
//     against the unfixed code". Every fixture below runs
//     requireNoActiveMovementAction() immediately before the `stop`, which
//     FAILS the test rather than quietly passing if anything left an action
//     on the slot.
//  2. "asserting on the handler's response body rather than a re-read of the
//     stored document, which passes against an in-memory-only mutation".
//     Nothing in this file reads the response body for state; every assertion
//     goes through storedFleetDoc / fleetCargoFuel / storedParkKind.

import (
	"context"
	"net/http"
	"testing"

	"hexaverse/fleet"
	"hexaverse/space"
)

// parkInOrbitAtGate places the fleet in an `orbit` park around a lane gate and
// attaches it there, mirroring router_jump_wiring_test.go's own established
// "as if BurnResolver had already run" arrangement. A gate is motionless
// (system.gateOrbit gives every gate PeriodMs = 0) and this park's own period
// is zero, so the fleet's live speed is exactly zero — which is what puts
// `stop` on its free, below-the-speed-floor branch (task 4.5: "a fleet holding
// at a lane gate ALWAYS takes it").
func parkInOrbitAtGate(t *testing.T, sp fuelSpawn, gateBodyId string, fuelTons float64) {
	t.Helper()
	fs, _ := firestoreClient(t)
	ctx := context.Background()
	fdao := fleet.NewDaoWithClient(fs)
	f, err := fdao.Get(ctx, sp.fleetId)
	if err != nil || f == nil {
		t.Fatalf("loading fleet %s to park it at gate %s: %v", sp.fleetId, gateBodyId, err)
	}
	f.AttachedTo = gateBodyId
	f.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{
		Kind: space.ParkOrbit, BodyId: gateBodyId, Radius: 300,
	}}
	f.StateDoc = fleet.EncodeKinematicState(f.State)
	f.ActiveActionId = ""
	f.Jump = nil
	f.Cargo = map[string]float64{"fuel": fuelTons}
	if err := fdao.Save(ctx, *f); err != nil {
		t.Fatalf("parking fleet %s at gate %s: %v", sp.fleetId, gateBodyId, err)
	}
}

// Scenario: Stopping at or below the speed floor is instant and free (LIVE,
// undelta'd — fixture (a) of task 7.16).
//
// BLOCKER 2 REGRESSION, and it fails today INDEPENDENTLY OF ANY HOLD. An
// ordinary parked fleet with no active movement action: `stop` must persist
// its `point` park, its cleared `attachedTo`, and its `updatedAt`. Today it
// persists nothing at all, because the only write on that branch is the
// action cancellation this fleet has no action for.
func TestStopFreeBranch_Scenario_StoppingAtOrBelowTheSpeedFloorPersistsItsPointParkWithNoActiveAction(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Stop Free Branch No Action Corp")
	// A fresh spawn is a `point` park at zero velocity (fleet.SeedFleet:
	// "Seeding SHALL place a point park"), which is exactly at-or-below the
	// stop-in-place speed floor. Attach it to its home station so the
	// "cleared attachedTo" half is observable.
	dockFleetAtStation(t, sp)
	setFleetFuel(t, sp.fleetId, reserveTons(t)+50)

	requireNoActiveMovementAction(t, sp.fleetId)
	if got := storedAttachedToDoc(t, sp.fleetId); got != sp.stationId {
		t.Fatalf("fixture invariant: attachedTo = %q, want the station %q so its clearing is observable",
			got, sp.stationId)
	}
	beforeUpdatedAt := storedUpdatedAt(t, sp.fleetId)

	w := postStop(t, router, sp.token, sp.fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/fleets/%s/stop returned %d (body: %s), want 200 — a fleet at or below the speed "+
			"floor stops instantly and freely", sp.fleetId, w.Code, w.Body.String())
	}

	// Every assertion below is against the STORED document.
	if got := storedAttachedToDoc(t, sp.fleetId); got != "" {
		t.Errorf("fleet-movement (live) \"Stopping at or below the speed floor is instant and free\": stored "+
			"attachedTo = %q after the stop, want it CLEARED. `stop`'s free, below-the-speed-floor branch "+
			"persists only through `s.actions.Cancel(ctx, f.ActiveActionId, cancelState)`, guarded by "+
			"`f.ActiveActionId != \"\"`, and `Handler.Stop` performs no DAO write — so for a fleet with no "+
			"active action it writes NOTHING AT ALL (task 4.5, "+
			"docs/handoffs/drift-stop-free-branch-no-write.md). It must persist its "+
			"point park, its cleared attachedTo, and its updatedAt UNCONDITIONALLY.", got)
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkPoint {
		t.Errorf("stored park kind after the stop = %v, want ParkPoint", got)
	}
	if got := storedUpdatedAt(t, sp.fleetId); got == beforeUpdatedAt {
		t.Errorf("stored updatedAt is unchanged (%d) after the stop — nothing was persisted at all", got)
	}
}

// Scenario: Stopping a fleet holding at a motionless gate settles its accrued
// upkeep (fixture (b) of task 7.16, and task 7.9's stop half).
func TestStopFromHold_Scenario_StoppingAFleetHoldingAtAMotionlessGateSettlesItsAccruedUpkeep(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Stop From Hold Corp")
	gateBodyId, _ := gateBodyIdFor(t, sp)
	startFuel := reserve + 200
	parkInOrbitAtGate(t, sp, gateBodyId, startFuel)

	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold at the gate: status = %d, body = %s", w.Code, w.Body.String())
	}
	h0, d0 := holdWindow(t, sp.fleetId)
	window := d0 - h0
	// Put the hold most of the way through its window so the accrual is a
	// large, unmissable fraction of the spendable budget — a forgiven accrual
	// could not hide inside rounding.
	rewindHoldWindow(t, sp.fleetId, window/2)

	requireNoActiveMovementAction(t, sp.fleetId) // `hold` claims no slot; this is the gate camper
	beforeFuel := fleetCargoFuel(t, sp.fleetId)
	beforeUpdatedAt := storedUpdatedAt(t, sp.fleetId)

	w := postStop(t, router, sp.token, sp.fleetId)
	if w.Code != http.StatusOK {
		t.Fatalf("POST /stop against a fleet station-keeping at a motionless gate returned %d (body: %s), "+
			"want 200 — the free, below-the-speed-floor branch (a stationkeep park's velocity is its host "+
			"body's, and a gate's is exactly zero)", w.Code, w.Body.String())
	}

	afterFuel := fleetCargoFuel(t, sp.fleetId)
	debit := beforeFuel - afterFuel
	spendable := startFuel - reserve

	if debit <= 0 {
		t.Errorf("fleet-movement \"Stopping a fleet holding at a motionless gate settles its accrued upkeep\": "+
			"the stop debited %v tons (stored fuel %v -> %v), want a STRICTLY POSITIVE accrual. \"No path "+
			"SHALL end a hold without settling it\" — the per-verb form \"is what left `stop` and `jump` "+
			"forgiving the accrual in an earlier draft — a fleet camping a lane gate, the thing this upkeep "+
			"most exists to price, held and then stopped or jumped for free.\" The free branch charges no "+
			"delta-v of its own and still never forgives the hold's accrual.", debit, beforeFuel, afterFuel)
	}
	if debit > spendable {
		t.Errorf("the stop debited %v tons, more than the hold's whole spendable budget (%v = start %v − "+
			"reserve %v) for half its window — the signature of a missing ms→s or Δv→tons conversion in the "+
			"settlement", debit, spendable, startFuel, reserve)
	}
	if afterFuel < 0 {
		t.Errorf("stored fuel went negative (%v)", afterFuel)
	}

	// "AND the resulting `point` park, the cleared `attachedTo`, and the
	// upkeep debit are all DURABLY PERSISTED, as observed by re-reading the
	// stored fleet document, for a fleet that has NO active movement action to
	// cancel".
	if got := storedParkKind(t, sp.fleetId); got != space.ParkPoint {
		t.Errorf("stored park kind after the stop = %v, want ParkPoint — persisted unconditionally, not only "+
			"when an action is cancelled", got)
	}
	if got := storedAttachedToDoc(t, sp.fleetId); got != "" {
		t.Errorf("stored attachedTo = %q after the stop, want it cleared and persisted", got)
	}
	if got := storedUpdatedAt(t, sp.fleetId); got == beforeUpdatedAt {
		t.Errorf("stored updatedAt is unchanged (%d) after the stop — \"a settlement carried only on an "+
			"action-cancellation write would persist nothing at all on precisely this path\"", got)
	}
	if got := storedParkKind(t, sp.fleetId); got == space.ParkStationkeep {
		t.Errorf("the `stationkeep` park survived the stop — a hold-ending verb \"SHALL NOT restamp the hold " +
			"or compute a fresh dry instant, since no hold remains to restamp\"")
	}
}

// Scenario: Jumping from an open hold settles its accrued upkeep (task 7.9's
// jump half).
func TestJumpFromHold_Scenario_JumpingFromAnOpenHoldSettlesItsAccruedUpkeep(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Jump From Hold Corp")
	gateBodyId, laneId := gateBodyIdFor(t, sp)
	startFuel := reserve + 200
	parkInOrbitAtGate(t, sp, gateBodyId, startFuel)

	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold at the gate: status = %d, body = %s", w.Code, w.Body.String())
	}
	h0, d0 := holdWindow(t, sp.fleetId)
	rewindHoldWindow(t, sp.fleetId, (d0-h0)/2)
	beforeFuel := fleetCargoFuel(t, sp.fleetId)

	w := postJump(t, router, sp.token, sp.fleetId, laneId)
	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/fleets/%s/jump {laneId:%q} from an open station-keeping hold at that lane's gate "+
			"returned %d (body: %s), want 200 — `hold` never alters `attachedTo`, so the fleet is still "+
			"attached to the gate and the jump is eligible", sp.fleetId, laneId, w.Code, w.Body.String())
	}

	afterFuel := fleetCargoFuel(t, sp.fleetId)
	debit := beforeFuel - afterFuel
	spendable := startFuel - reserve

	if debit <= 0 {
		t.Errorf("fleet-movement \"Jumping from an open hold settles its accrued upkeep\": the jump debited "+
			"%v tons (stored fuel %v -> %v), want a STRICTLY POSITIVE accrual — \"so a fleet that camps a "+
			"gate under a hold and then jumps has paid for the hold\". The jump itself still costs no "+
			"delta-v: this debit is the HOLD's already-accrued upkeep, not a charge for the jump, so it does "+
			"not disturb \"Lane Jump From an Attached Gate\"'s \"Jump costs no delta-v\".",
			debit, beforeFuel, afterFuel)
	}
	if debit > spendable {
		t.Errorf("the jump debited %v tons, more than the hold's whole spendable budget (%v) for half its "+
			"window — the signature of a missing ms→s or Δv→tons conversion", debit, spendable)
	}
	if afterFuel < 0 {
		t.Errorf("stored fuel went negative (%v)", afterFuel)
	}

	// The stored park must not remain a `stationkeep` one carrying a hold
	// window: "a jump that leaves the stored park behind and settles a fresh
	// park at the destination ... SHALL NOT restamp the hold or compute a
	// fresh dry instant, since no hold remains to restamp."
	doc := storedFleetDoc(t, sp.fleetId)
	if _, inTransit := doc["jump"]; !inTransit {
		t.Errorf("no stored `jump` transit on the fleet document after a 200 from POST /jump: %v", doc)
	}
}

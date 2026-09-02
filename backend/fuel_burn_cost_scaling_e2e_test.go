package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 1.2,
// 1.3, 1.4 — fleet-movement "A Burn's Fuel Cost Scales With Roster Hull
// Count, Never Loaded Mass" (ADDED):
//
//   - "A larger roster pays a proportionally larger fuel bill for the
//     identical burn"
//   - "Doubling a fleet's cargo mass changes neither its acceleration nor
//     its flight duration"
//   - "Fuel cost and cargo capacity scale together for a single-class
//     roster, leaving range roster-independent"
//
// This file is the second of the FIVE adversary-flagged must-test-precisely
// items: "The mass-independence guardrail: commanded acceleration never
// varies with loaded cargo. Assert an empty and a full hold fly the
// identical burn (same stored Accel, Length, DepartMs, ArriveMs, same Δv
// price). Hull-count scaling is separate and legal — hull count is
// constant across a burn."

import (
	"net/http"
	"testing"

	"hexaverse/space"
)

func TestBurnCostScaling_Scenario_LargerRosterPaysProportionallyLargerFuelBill(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	// REVISION (SDET, cause: developer-reported defect, confirmed against
	// the tree): an earlier draft compared two SEPARATELY spawned
	// corporations' burns to the same absolute target point, assuming
	// "identical geometry modulo origin". That assumption is false — site
	// selection places each corp's home/park independently, so the two
	// burns' measured curve lengths are NOT comparable (observed 4369-4975
	// for a nominal target in practice) and the ×10 ratio check would fail
	// for the wrong reason (mismatched geometry), not the right one (a
	// roster-scaling bug). Fixed the same way the sibling mass-independence
	// test in this file already does it: ONE fleet, rewound to its
	// pristine position between two commits, varying ONLY the roster.
	sp := spawnFuelCorp(t, router, "SDET Roster Scaling Corp")
	pristine := snapshotFleetMotion(t, sp.fleetId)

	target := space.Vec3{X: 5000, Y: 0, Z: 0}
	const accel = 4.0

	setFleetFuel(t, sp.fleetId, 10_000_000.0)
	var oneResp fuelFleetDTO
	w1 := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"point": target, "accel": accel}, &oneResp)
	if w1.Code != http.StatusOK {
		t.Fatalf("one-hull order: status = %d, body = %s", w1.Code, w1.Body.String())
	}
	oneCost := 10_000_000.0 - fleetCargoFuel(t, sp.fleetId)

	// Rewind to the IDENTICAL pristine position, grow the roster to ten
	// hulls, restore the fuel a fresh corp started with (the first commit
	// may have debited it), and commit the IDENTICAL order again.
	restoreFleetMotion(t, sp.fleetId, pristine)
	setFleetShips(t, sp.fleetId, 10)
	setFleetFuel(t, sp.fleetId, 10_000_000.0)
	var tenResp fuelFleetDTO
	w2 := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"point": target, "accel": accel}, &tenResp)
	if w2.Code != http.StatusOK {
		t.Fatalf("ten-hull order (same fleet, rewound to the same pristine position): status = %d, body = %s",
			w2.Code, w2.Body.String())
	}
	tenCost := 10_000_000.0 - fleetCargoFuel(t, sp.fleetId)

	ob, tb := oneResp.State.Burn, tenResp.State.Burn
	if ob == nil || tb == nil {
		t.Fatalf("one or both orders did not settle a Burn: one=%+v ten=%+v", oneResp.State, tenResp.State)
	}
	if !almostEqual(ob.Origin.X, tb.Origin.X, 1e-6) || !almostEqual(ob.Origin.Z, tb.Origin.Z, 1e-6) {
		t.Fatalf("the rewind did not reproduce the same origin (one-hull burn origin = %+v, ten-hull burn "+
			"origin = %+v) — this test's own fixture is broken, not the production behavior under test",
			ob.Origin, tb.Origin)
	}
	if !almostEqual(ob.DeltaV(), tb.DeltaV(), 1e-6) {
		t.Fatalf("space-computed delta-v price differs between the two commits (%v vs %v) despite an identical "+
			"origin/target/accel — this test's own fixture is broken, not the production behavior under test",
			ob.DeltaV(), tb.DeltaV())
	}

	if oneCost <= 0 {
		t.Fatalf("one-hull fuel cost = %v, want > 0 — the fixture is vacuous if nothing was debited at all "+
			"(this scenario needs the debit-at-commit behavior to exist to even compare a RATIO)", oneCost)
	}
	if !almostEqual(tenCost, 10*oneCost, 1e-6) {
		t.Errorf("fleet-movement \"A larger roster pays a proportionally larger fuel bill for the identical "+
			"burn\": ten-hull fuel cost = %v, one-hull fuel cost = %v (×10 = %v) — both burns' space-computed "+
			"delta-v price is identical (same origin/target/accel), so only the hull-count multiplier should "+
			"differ", tenCost, oneCost, 10*oneCost)
	}
}

func TestBurnCostScaling_Scenario_DoublingCargoMassChangesNeitherAccelerationNorFlightDuration(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	// ONE fleet, not two separately-spawned corporations: two corps' spawn
	// parks sit at DIFFERENT origins (site selection is per-account), so
	// comparing two corps' burns to the same absolute target point would
	// compare two DIFFERENT curve lengths and fail for the wrong reason
	// (different geometry) rather than the right one (mass coupling).
	// Committing from the SAME fleet's pristine position twice — rewinding
	// its raw `state`/`attachedTo` between attempts — is what isolates
	// "cargo mass" as the only variable.
	sp := spawnFuelCorp(t, router, "SDET Mass-Independence Corp")
	pristine := snapshotFleetMotion(t, sp.fleetId)

	target := space.Vec3{X: 5000, Y: 0, Z: 0}
	const accel = 4.0

	setFleetFuel(t, sp.fleetId, 10_000_000.0)
	var emptyResp fuelFleetDTO
	w1 := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"point": target, "accel": accel}, &emptyResp)
	if w1.Code != http.StatusOK {
		t.Fatalf("empty-hold order: status = %d, body = %s", w1.Code, w1.Body.String())
	}
	emptyCostRaw := 10_000_000.0 - fleetCargoFuel(t, sp.fleetId)

	// Rewind to the IDENTICAL pristine position/velocity, then load the same
	// fleet with substantial non-fuel cargo mass ("carrying cargo at half
	// its free hold" — the requirement's own words; defaultSeedHoldCapacity
	// = 200 tons/hull, fleet/roster.go) alongside a modest, affordable fuel
	// balance, and commit the IDENTICAL order again.
	restoreFleetMotion(t, sp.fleetId, pristine)
	setFleetCargoFor(t, sp.fleetId, map[string]float64{"fuel": 5000, "metals": 95}) // 100/200 tons free hold used
	var loadedResp fuelFleetDTO
	w2 := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"point": target, "accel": accel}, &loadedResp)
	if w2.Code != http.StatusOK {
		t.Fatalf("loaded-hold order (same fleet, rewound to the same pristine position): status = %d, body = %s",
			w2.Code, w2.Body.String())
	}
	loadedCostRaw := 5000.0 - fleetCargoFuel(t, sp.fleetId)

	eb, lb := emptyResp.State.Burn, loadedResp.State.Burn
	if eb == nil || lb == nil {
		t.Fatalf("one or both orders did not settle a Burn: empty=%+v loaded=%+v", emptyResp.State, loadedResp.State)
	}
	if !almostEqual(eb.Origin.X, lb.Origin.X, 1e-6) || !almostEqual(eb.Origin.Z, lb.Origin.Z, 1e-6) {
		t.Fatalf("the rewind did not reproduce the same origin (empty burn origin = %+v, loaded burn origin = "+
			"%+v) — this test's own fixture is broken, not the production behavior under test", eb.Origin, lb.Origin)
	}

	// The kinematics must be IDENTICAL: same accel (both explicitly 4.0),
	// same flight duration (DepartMs is real wall-clock so is not asserted
	// equal; the DURATION — Arrive−Depart — is what must match), same curve
	// length.
	if eb.Accel != lb.Accel {
		t.Errorf("fleet-movement \"Doubling a fleet's cargo mass changes neither its acceleration nor its flight "+
			"duration\": commanded acceleration = %v (empty hold) vs %v (loaded hold) — a fleet's commanded "+
			"acceleration must NEVER depend on loaded cargo/fuel mass", eb.Accel, lb.Accel)
	}
	emptyDuration := eb.ArriveMs - eb.DepartMs
	loadedDuration := lb.ArriveMs - lb.DepartMs
	if emptyDuration != loadedDuration {
		t.Errorf("fleet-movement \"Doubling a fleet's cargo mass changes neither its acceleration nor its flight "+
			"duration\": flight duration = %vms (empty hold) vs %vms (loaded hold) — coupling flight time to "+
			"loaded mass is the rocket equation and is explicitly forbidden", emptyDuration, loadedDuration)
	}
	if !almostEqual(eb.Length, lb.Length, 1e-6) {
		t.Errorf("curve length = %v (empty hold) vs %v (loaded hold) — the solved curve itself must not depend "+
			"on loaded cargo mass", eb.Length, lb.Length)
	}
	if !almostEqual(eb.DeltaV(), lb.DeltaV(), 1e-6) {
		t.Errorf("space-computed delta-v price = %v (empty hold) vs %v (loaded hold) — must be identical since "+
			"Accel and flight duration are both identical", eb.DeltaV(), lb.DeltaV())
	}

	// And per THIS change's own new currency: since both commits are from
	// the SAME hull count (1) and settled the SAME delta-v price, their
	// fuel cost must also be identical — only a hull-count difference may
	// ever produce a differing cost (the requirement's own final clause).
	// Non-vacuity: with no debit-at-commit implemented at all, BOTH costs
	// read 0 and trivially "match" — a real debit must land before equality
	// here means anything.
	if emptyCostRaw <= 0 {
		t.Fatalf("empty-hold fuel cost = %v, want > 0 — this scenario is vacuous until a burn commit actually "+
			"debits fuel", emptyCostRaw)
	}
	if !almostEqual(emptyCostRaw, loadedCostRaw, 1e-6) {
		t.Errorf("fleet-movement \"A Burn's Fuel Cost Scales With Roster Hull Count, Never Loaded Mass\": fuel "+
			"cost = %v (empty hold) vs %v (loaded, carrying 95 tons of metals) — with identical hull counts (1) "+
			"and an identical delta-v price, the fuel cost must be identical too; a difference here means fuel "+
			"cost is (wrongly) reading loaded cargo mass", emptyCostRaw, loadedCostRaw)
	}
}

func TestBurnCostScaling_Scenario_FuelCostAndCargoCapacityScaleTogetherLeavingRangeRosterIndependent(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	// REVISION (SDET, cause: developer-reported defect, confirmed against
	// the tree): the same cross-corporation geometry problem as the sibling
	// roster-scaling test above — two separately spawned corps' burns to
	// the same absolute target are not comparable. Fixed identically: ONE
	// fleet, rewound between two commits, varying ONLY the roster (and the
	// fuel fill, which is derived from the roster's own capacity).
	sp := spawnFuelCorp(t, router, "SDET Range-Independence Corp")
	pristine := snapshotFleetMotion(t, sp.fleetId)

	target := space.Vec3{X: 5000, Y: 0, Z: 0}
	const accel = 4.0
	const capacityPerHull = 200.0 // fleet/roster.go's defaultSeedHoldCapacity

	// Round 1: one hull, tank filled to exactly its own derived capacity.
	setFleetFuel(t, sp.fleetId, 1*capacityPerHull)
	var oneResp fuelFleetDTO
	w1 := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"point": target, "accel": accel}, &oneResp)
	if w1.Code != http.StatusOK {
		t.Fatalf("one-hull, full-tank order: status = %d, body = %s", w1.Code, w1.Body.String())
	}
	oneRemaining := fleetCargoFuel(t, sp.fleetId)

	// Round 2: rewind to the IDENTICAL pristine position, grow to ten
	// hulls, fill to the NEW (ten times larger) derived capacity, and
	// commit the identical order again.
	restoreFleetMotion(t, sp.fleetId, pristine)
	setFleetShips(t, sp.fleetId, 10)
	setFleetFuel(t, sp.fleetId, 10*capacityPerHull)
	var tenResp fuelFleetDTO
	w2 := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"point": target, "accel": accel}, &tenResp)
	if w2.Code != http.StatusOK {
		t.Fatalf("ten-hull, full-tank order (same fleet, rewound to the same pristine position): status = %d, "+
			"body = %s", w2.Code, w2.Body.String())
	}
	tenRemaining := fleetCargoFuel(t, sp.fleetId)

	ob, tb := oneResp.State.Burn, tenResp.State.Burn
	if ob == nil || tb == nil {
		t.Fatalf("one or both orders did not settle a Burn: one=%+v ten=%+v", oneResp.State, tenResp.State)
	}
	if !almostEqual(ob.Origin.X, tb.Origin.X, 1e-6) || !almostEqual(ob.Origin.Z, tb.Origin.Z, 1e-6) {
		t.Fatalf("the rewind did not reproduce the same origin (one-hull burn origin = %+v, ten-hull burn "+
			"origin = %+v) — this test's own fixture is broken, not the production behavior under test",
			ob.Origin, tb.Origin)
	}

	// Non-vacuity: if nothing debits fuel at all (today's behavior, pre-
	// implementation), both remaining balances trivially equal their full
	// tanks and the fraction comparison below would pass for the WRONG
	// reason. A real debit must have landed before "the two fractions
	// match" is a meaningful assertion.
	if oneRemaining >= 1*capacityPerHull || tenRemaining >= 10*capacityPerHull {
		t.Fatalf("fleet-movement \"Fuel cost and cargo capacity scale together for a single-class roster, "+
			"leaving range roster-independent\": neither commit's tank was touched (one: %v/%v, ten: %v/%v) — "+
			"this scenario is vacuous until a burn commit actually debits fuel", oneRemaining,
			capacityPerHull, tenRemaining, 10*capacityPerHull)
	}
	oneRemainingFrac := oneRemaining / (1 * capacityPerHull)
	tenRemainingFrac := tenRemaining / (10 * capacityPerHull)
	if !almostEqual(oneRemainingFrac, tenRemainingFrac, 1e-6) {
		t.Errorf("fleet-movement \"Fuel cost and cargo capacity scale together for a single-class roster, "+
			"leaving range roster-independent\": the IDENTICAL burn (same origin, target, and acceleration) "+
			"consumed %.4f%% of the one-hull fleet's full tank but %.4f%% of the ten-hull fleet's full tank — "+
			"for a single-class roster these must be equal, because both the fuel capacity available for a burn "+
			"and that burn's fuel price scale by the identical hull-count factor",
			(1-oneRemainingFrac)*100, (1-tenRemainingFrac)*100)
	}
}

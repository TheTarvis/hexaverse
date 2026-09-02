package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 2.1,
// 2.2, 2.6 — fleet-movement "A Burn Commit Is Rejected When Its Fuel Cost
// Exceeds Available Fuel, Debited At Commit Never At Resolve" (ADDED):
//
//   - "An unaffordable burn is rejected and nothing is stored or debited"
//   - "An affordable burn debits fuel at the instant of commit"
//   - "A rejected re-target leaves the prior burn running and fuel unchanged"
//
// One of the FIVE adversary-flagged must-test-precisely items lives here:
// debit-at-commit is transactional (action.Commit's transaction reads the
// actor doc only for the slot check, so the affordability check/debit must
// evaluate against a TRANSACTIONAL re-read) — see
// fuel_action_dispatch_race_e2e_test.go for the concurrent burn-vs-refuel
// half of that item; this file covers the sequential affordability logic.
//
// deltaVPerTonPlaceholder (5.0) is not an SDET guess: it is the LITERAL
// value fleet-movement's "A Burn's Fuel Cost Scales With Roster Hull Count,
// Never Loaded Mass" writes into its own normative text ("divided by a
// configured constant FuelParams.DeltaVPerTon (a placeholder value of
// 5.0...)") — a future retune of that constant is itself a spec change, and
// per the TDD protocol this test is then revised by the SDET under that
// cause, not silently by a developer.

import (
	"net/http"
	"testing"

	"hexaverse/space"
)

// deltaVPerTonPlaceholder is fleet-movement's own pinned placeholder value.
const deltaVPerTonPlaceholder = 5.0

// expectedFuelCostTons replicates the ADDED requirement's own formula:
// space's delta-v price × hull count ÷ FuelParams.DeltaVPerTon. Every fleet
// in this suite that has not been given a multi-hull roster carries the
// default single ClassSeed hull (fleet-movement "Fleet Ship Composition"),
// so hullCount defaults to 1 unless a test explicitly seeds more.
func expectedFuelCostTons(b *space.Burn, hullCount int) float64 {
	return b.DeltaV() * float64(hullCount) / deltaVPerTonPlaceholder
}

func TestBurnCommitAffordability_Scenario_UnaffordableBurnRejectedNothingStoredOrDebited(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Unaffordable Burn Corp")
	setFleetFuel(t, sp.fleetId, 0)

	before, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("pre-order GET /v1/fleets/%s: status = %d", sp.fleetId, code)
	}
	if before.State.Mode == space.ModeBurn {
		t.Fatalf("a freshly spawned, never-ordered fleet is already mid-burn — the fixture is not what this test "+
			"needs: %+v", before.State)
	}

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"bodyId": sp.stationId}, nil)
	if w.Code == http.StatusOK {
		t.Fatalf("fleet-movement \"An unaffordable burn is rejected and nothing is stored or debited\": "+
			"POST /v1/fleets/%s/orders against a fleet holding ZERO fuel returned 200 OK (body: %s) — it must be "+
			"rejected with its own named reason instead", sp.fleetId, w.Body.String())
	}
	if w.Body.Len() == 0 {
		t.Errorf("the rejection carries no body — this requirement's own text requires a distinguishable named " +
			"reason, distinct from every other commit rejection this capability defines")
	}

	after, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("post-order GET /v1/fleets/%s: status = %d", sp.fleetId, code)
	}
	if after.State.Mode == space.ModeBurn {
		t.Errorf("fleet-movement \"An unaffordable burn is rejected and nothing is stored or debited\": the "+
			"fleet's state is Burn after a rejected commit — no burn must be stored. State: %+v", after.State)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != 0 {
		t.Errorf("fleet-movement \"An unaffordable burn is rejected and nothing is stored or debited\": "+
			"cargo.fuel = %v after a rejected commit, want 0 (unchanged)", got)
	}
}

func TestBurnCommitAffordability_Scenario_AffordableBurnDebitsFuelAtTheInstantOfCommit(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Affordable Burn Corp")
	const seeded = 1_000_000.0 // deliberately enormous: affordability is not in question here
	setFleetFuel(t, sp.fleetId, seeded)

	var resp fuelFleetDTO
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"bodyId": sp.stationId}, &resp)
	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/fleets/%s/orders: status = %d, body = %s", sp.fleetId, w.Code, w.Body.String())
	}
	if resp.State.Mode != space.ModeBurn || resp.State.Burn == nil {
		t.Fatalf("order response state = %+v, want a stored Burn", resp.State)
	}
	want := seeded - expectedFuelCostTons(resp.State.Burn, 1)
	got := fleetCargoFuel(t, sp.fleetId)
	if !almostEqual(got, want, 1e-6) {
		t.Errorf("fleet-movement \"An affordable burn debits fuel at the instant of commit\": cargo.fuel = %v "+
			"after the commit, want %v (%v seeded − the burn's own delta-v (%v) × 1 hull ÷ "+
			"FuelParams.DeltaVPerTon (%v), debited in the SAME commit that stored the burn, never deferred) — got "+
			"%v suggests the commit stored the burn but debited nothing", got, want, seeded,
			resp.State.Burn.DeltaV(), deltaVPerTonPlaceholder, seeded)
	}
}

func TestBurnCommitAffordability_Scenario_RejectedRetargetLeavesThePriorBurnRunningAndFuelUnchanged(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Rejected Retarget Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000.0)

	var first fuelFleetDTO
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"bodyId": sp.stationId}, &first)
	if w.Code != http.StatusOK {
		t.Fatalf("first (affordable) order: status = %d, body = %s", w.Code, w.Body.String())
	}
	if first.State.Burn == nil {
		t.Fatalf("first order did not settle a Burn: %+v", first.State)
	}
	firstDepart, firstArrive, firstAccel := first.State.Burn.DepartMs, first.State.Burn.ArriveMs, first.State.Burn.Accel
	fuelAfterFirst := fleetCargoFuel(t, sp.fleetId)

	// Drop the fleet's fuel to a level that cannot possibly afford ANY new
	// burn — simulating "the fleet's current fuel is too low for the
	// re-target" without racing a real concurrent mutator (that race is
	// fuel_action_dispatch_race_e2e_test.go's own job).
	setFleetFuel(t, sp.fleetId, 0)

	far := space.Vec3{X: 1_000_000, Y: 1_000_000, Z: 1_000_000}
	w = doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token,
		map[string]any{"point": far}, nil)
	if w.Code == http.StatusOK {
		t.Fatalf("fleet-movement \"A rejected re-target leaves the prior burn running and fuel unchanged\": "+
			"a re-target against a fleet with ZERO fuel returned 200 OK (body: %s) — it must be rejected", w.Body.String())
	}

	after, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("post-retarget GET: status = %d", code)
	}
	if after.State.Mode != space.ModeBurn || after.State.Burn == nil {
		t.Fatalf("fleet-movement \"A rejected re-target leaves the prior burn running and fuel unchanged\": "+
			"the fleet is no longer mid-burn after the rejected re-target — state = %+v, want the ORIGINAL burn "+
			"still active (never cancelled)", after.State)
	}
	if after.State.Burn.DepartMs != firstDepart || after.State.Burn.ArriveMs != firstArrive || after.State.Burn.Accel != firstAccel {
		t.Errorf("fleet-movement \"A rejected re-target leaves the prior burn running and fuel unchanged\": the "+
			"stored burn changed (depart/arrive/accel = %v/%v/%v, want %v/%v/%v) — the prior burn must be left "+
			"exactly as it was", after.State.Burn.DepartMs, after.State.Burn.ArriveMs, after.State.Burn.Accel,
			firstDepart, firstArrive, firstAccel)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != 0 {
		t.Errorf("fleet-movement \"A rejected re-target leaves the prior burn running and fuel unchanged\": "+
			"cargo.fuel = %v, want 0 (unchanged since the setup write) — the prior burn's discard refund must "+
			"NEVER be credited when the replacement order that would have triggered it is itself rejected "+
			"(fuel after the first commit was %v; if the refund had wrongly landed, fuel would be nonzero here)",
			got, fuelAfterFirst)
	}
}

// almostEqual compares floats with an absolute tolerance — the burn solve's
// own flight-time quantization (space-kinematics "Burn Timing Quantizes to
// Integer World-Milliseconds by Ceiling") means the debit is a deterministic
// but not hand-computable-to-the-bit function of real wall-clock commit
// time; the tolerance absorbs float64 accumulation only, not quantization
// error, since expectedFuelCostTons is computed from the SAME stored
// Accel/DepartMs/ArriveMs the server itself returned.
func almostEqual(a, b, tol float64) bool {
	d := a - b
	if d < 0 {
		d = -d
	}
	return d <= tol
}

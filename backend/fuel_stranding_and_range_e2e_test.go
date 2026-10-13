package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 2.4,
// 4.1, 4.2 — fleet-movement:
//
//   - "Fleet Read Reports an Estimated Maximum Range From Current Fuel"
//   - "A Burn Commit Warns, But Does Not Block, When It Would Leave the
//     Fleet Unable to Reach a Station or Gate"
//   - "A Fleet's Read Reports a Persistent Stranded Indication, Computed at
//     the Acceleration Floor"
//
// TWO of the FIVE adversary-flagged must-test-precisely items live here:
//
//  1. "Δv = 2·√(a·L) RISES with commanded acceleration, so maximum range is
//     at MINIMUM acceleration... The estimated-range read, the stranding
//     warning's candidate solves, and the persistent stranded indicator
//     must ALL price at the floor." — TestFleetRead_Scenario_
//     TheReportedRangeIsComputedAtTheAccelerationFloorNotTheCeiling.
//  3. "ErrArcTooShort counts as reachable at ZERO cost... without this rule,
//     burning to the refuelling point fires the stranding warning and a
//     docked fleet reads stranded forever." —
//     TestBurnCommitWarning_Scenario_ACandidateTooCloseToSolveCountsAsReachableAtZeroCost
//     and TestFleetRead_Scenario_DockedFleetWithFullTankNeverReadsStranded...
//
// This suite does not know the exact JSON field names design.md leaves
// unpinned (estimatedRange/stranded/a stranding-warning key) — fieldAnywhere
// and keySet (fuel_e2e_helpers_test.go) probe for them structurally instead
// of hardcoding an SDET guess about internal DTO shape.

import (
	"math"
	"net/http"
	"testing"

	"hexaverse/disclosure"
	"hexaverse/space"
)

// --- Fleet Read Reports an Estimated Maximum Range From Current Fuel ------

func TestFleetRead_Scenario_EstimatedRangeGrowsWithHeldFuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Range Grows Corp")

	setFleetFuel(t, sp.fleetId, 100)
	_, small, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet (100 fuel): status = %d", code)
	}
	smallRangeRaw, ok := fieldAnywhere(small, "estimatedRange")
	if !ok {
		t.Fatalf("fleet-movement \"Fleet Read Reports an Estimated Maximum Range From Current Fuel\": no "+
			"estimatedRange field found on the fleet read (checked top level and roster). Body: %v", small)
	}
	smallRange, ok := asFloat(smallRangeRaw)
	if !ok {
		t.Fatalf("estimatedRange = %v (%T), want a number", smallRangeRaw, smallRangeRaw)
	}

	setFleetFuel(t, sp.fleetId, 1000)
	_, big, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet (1000 fuel): status = %d", code)
	}
	bigRangeRaw, ok := fieldAnywhere(big, "estimatedRange")
	if !ok {
		t.Fatalf("estimatedRange field disappeared after increasing held fuel. Body: %v", big)
	}
	bigRange, _ := asFloat(bigRangeRaw)

	if !(bigRange > smallRange) {
		t.Errorf("fleet-movement \"Estimated range grows with held fuel\": estimatedRange = %v at 100 fuel, %v "+
			"at 1000 fuel — the larger tonnage must yield the larger estimated range", smallRange, bigRange)
	}
}

func TestFleetRead_Scenario_ZeroFuelYieldsZeroEstimatedRange(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Zero Fuel Zero Range Corp")
	setFleetFuel(t, sp.fleetId, 0)

	_, body, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet: status = %d", code)
	}
	rangeRaw, ok := fieldAnywhere(body, "estimatedRange")
	if !ok {
		t.Fatalf("fleet-movement \"Zero fuel yields zero estimated range\": no estimatedRange field found on the "+
			"fleet read. Body: %v", body)
	}
	rng, _ := asFloat(rangeRaw)
	if rng != 0 {
		t.Errorf("estimatedRange = %v at zero fuel, want exactly 0", rng)
	}
}

func TestFleetRead_Scenario_TheReportedRangeIsComputedAtTheAccelerationFloorNotTheCeiling(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Range Floor-Priced Corp")
	const fuelTons = 200.0
	setFleetFuel(t, sp.fleetId, fuelTons)

	_, body, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet: status = %d", code)
	}
	rangeRaw, ok := fieldAnywhere(body, "estimatedRange")
	if !ok {
		t.Fatalf("no estimatedRange field found on the fleet read. Body: %v", body)
	}
	served, _ := asFloat(rangeRaw)

	// Independently invert this change's own pinned formulas: deltaV budget
	// = fuelTons * DeltaVPerTon (hull count 1), curveLength(a) =
	// deltaV^2 / (4*a). Floor-priced range is maximized at
	// disclosure.MinCommandedAccel; ceiling-priced range (deliberately the
	// WRONG answer this scenario exists to catch) uses the fleet's own
	// DerivedAccelCeiling (fleet.DefaultClassStats' seed hull).
	deltaV := fuelTons * deltaVPerTonPlaceholder // hull count 1
	floorRange := (deltaV * deltaV) / (4 * disclosure.MinCommandedAccel)
	ceiling := fleetDerivedAccelCeiling()
	ceilingRange := (deltaV * deltaV) / (4 * ceiling)

	if ceilingRange >= floorRange {
		t.Fatalf("test fixture invariant broken: ceilingRange (%v) >= floorRange (%v) — the ceiling constant "+
			"(%v) must be strictly greater than the floor (%v) for this scenario to distinguish anything",
			ceilingRange, floorRange, ceiling, disclosure.MinCommandedAccel)
	}
	if !almostEqual(served, floorRange, floorRange*1e-6+1e-6) {
		t.Errorf("fleet-movement \"The reported range is computed at the acceleration floor, not the ceiling\": "+
			"served estimatedRange = %v, want %v (solved at disclosure.MinCommandedAccel = %v) — got a value "+
			"closer to %v (solved at the fleet's acceleration CEILING, %v) would mean this reads the fleet's "+
			"SHORTEST possible reach, exactly backwards from \"maximum\"", served, floorRange,
			disclosure.MinCommandedAccel, ceilingRange, ceiling)
	}
}

// --- A Fleet's Read Reports a Persistent Stranded Indication --------------

func TestFleetRead_Scenario_FleetUnableToAffordAnyFloorPricedBurnReadsStranded(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Genuinely Stranded Corp")
	setFleetFuel(t, sp.fleetId, 0) // cannot afford ANY positive-cost burn

	_, body, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet: status = %d", code)
	}
	strandedRaw, ok := fieldAnywhere(body, "stranded")
	if !ok {
		t.Fatalf("fleet-movement \"A Fleet's Read Reports a Persistent Stranded Indication, Computed at the "+
			"Acceleration Floor\": no `stranded` field found on the fleet read. Body: %v", body)
	}
	stranded, _ := strandedRaw.(bool)
	if !stranded {
		t.Errorf("stranded = %v (raw %v), want true — a fleet with ZERO fuel, parked away from any station or "+
			"gate, cannot afford a floor-priced burn to anything and must read as stranded", stranded, strandedRaw)
	}
}

func TestFleetRead_Scenario_FleetThatCanReachAtFloorDoesNotReadAsStranded(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Not Stranded Corp")
	setFleetFuel(t, sp.fleetId, 100_000) // generously affords a floor-priced trip to the home station

	_, body, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet: status = %d", code)
	}
	strandedRaw, ok := fieldAnywhere(body, "stranded")
	if !ok {
		t.Fatalf("no `stranded` field found on the fleet read. Body: %v", body)
	}
	stranded, _ := strandedRaw.(bool)
	if stranded {
		t.Errorf("stranded = true for a fleet holding 100,000 tons of fuel — it can certainly reach its own " +
			"home station at the acceleration floor, even though that same fuel would not afford it at the " +
			"fleet's acceleration ceiling")
	}
}

func TestFleetRead_Scenario_IdleFleetWithAmpleFuelNeverReportedAsStranded(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Idle Ample Fuel Corp")
	setFleetFuel(t, sp.fleetId, 100_000)

	typed, body, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet: status = %d", code)
	}
	if typed.State.Mode == space.ModeBurn {
		t.Fatalf("fixture invariant broken: fleet is mid-burn, not idle")
	}
	strandedRaw, ok := fieldAnywhere(body, "stranded")
	if !ok {
		t.Fatalf("no `stranded` field found on the fleet read. Body: %v", body)
	}
	stranded, _ := strandedRaw.(bool)
	if stranded {
		t.Errorf("fleet-movement \"An idle fleet with ample fuel is never reported as stranded\": stranded = " +
			"true for an idle fleet (no active order) with ample fuel — this indication must be distinguishable " +
			"from, and never conflated with, merely having no current order")
	}
}

func TestFleetRead_Scenario_DockedFleetWithFullTankNeverReadsStrandedDueToTooCloseToSolve(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Docked Too-Close-To-Solve Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	// Spawn already provides the genuine station-attached insertion orbit.
	// No redundant burn to the occupied host is needed for this read scenario.

	typed, body, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet (station-hosted): status = %d", code)
	}
	if typed.AttachedTo != sp.stationId {
		t.Fatalf("fixture invariant broken: fleet is not docked at its home station "+
			"(attachedTo = %q, want %q) — cannot exercise the too-close-to-solve rule without genuinely being "+
			"there", typed.AttachedTo, sp.stationId)
	}
	strandedRaw, ok := fieldAnywhere(body, "stranded")
	if !ok {
		t.Fatalf("no `stranded` field found on the fleet read. Body: %v", body)
	}
	stranded, _ := strandedRaw.(bool)
	if stranded {
		t.Errorf("fleet-movement \"A docked fleet with a full tank never reads as stranded merely because its " +
			"own dock is too close to solve\": stranded = true for a fleet DOCKED AT its own home station with " +
			"a full tank — the only candidate (that same station) necessarily solves with space.ErrArcTooShort " +
			"(the fleet is already there), which must count as reachable at ZERO cost, never as unreachable")
	}
}

// --- A Burn Commit Warns, But Does Not Block ------------------------------

func TestBurnCommitWarning_Scenario_LeavesUnableToReachAnyStationEvenAtFloorStillAcceptedWithWarning(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Stranding Warning Corp")
	arrangeStationaryPoint(t, router, sp)                 // Explicit scenario premise; real spawn remains station-hosted.
	far := space.Vec3{X: 500_000, Y: 500_000, Z: 500_000} // far from the home station and any gate

	// POST-HANDOFF REVISION (SDET, 2026-09-02). Cause: developer-reported,
	// SDET-confirmed FIXTURE defect, pre-existing since link 7 (reproduced at
	// HEAD 59630e7 in a clean worktree, and again here: 409 from the second
	// commit). The original arrangement priced the burn from corp 1's fleet
	// and then funded corp 2's fleet with that figure. Site selection places
	// each corporation independently, so the two fleets sit at DIFFERENT
	// origins; the arc to a fixed absolute point therefore has a different
	// length and a different price, and the second commit was CORRECTLY
	// rejected with ErrInsufficientFuel. This is the same defect shape the
	// orchestrator already adjudicated for
	// TestBurnFromHold_Scenario_ABurnLeavingExactlyZeroFuelAfterSettlement-
	// StillCommits (fleet/stationkeep_settlement_consumers_test.go): a price
	// computed at one arrangement, spent at another.
	//
	// THE ASSERTION IS UNCHANGED — the exactly-affordable commit must be
	// ACCEPTED and must carry a stranding warning. Only the arrangement
	// moved: the priced burn and the funded figure now come from the SAME
	// fleet at the SAME origin, using the snapshot/restore pattern the
	// ErrArcTooShort test below already established. The explicit fixture is a
	// motionless point park, so restoring the snapshot restores the IDENTICAL origin and the
	// second solve is the identical solve — no drift margin is needed, and
	// none is taken. The premise is asserted as a fixture invariant below
	// rather than argued here, so if it ever breaks again it fails by name
	// instead of by an unexplained 409.
	pristine := snapshotFleetMotion(t, sp.fleetId)

	// Baseline: a cheap, safe commit's key set (never stranding) — the
	// reference this test diffs the warning-triggering response against, so
	// no SDET guess about the warning field's exact name is required (see
	// fuel_e2e_helpers_test.go's keySet/extraKeys doc comments). It doubles
	// as the price probe, which is the whole point: one fleet, one origin.
	setFleetFuel(t, sp.fleetId, 1_000_000)
	baselineResp, baselineBody, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"point": far, "accel": 4.0})
	if code != http.StatusOK {
		t.Fatalf("baseline (ample fuel) order: status = %d", code)
	}
	if baselineResp.State.Burn == nil {
		t.Fatalf("baseline commit did not settle a Burn: %+v", baselineResp.State)
	}
	// Learn this exact commit's own cost from ITS OWN returned Burn (never
	// re-derived from a guessed constant beyond the one this change's own
	// requirement text pins — deltaVPerTonPlaceholder).
	cost := baselineResp.State.Burn.DeltaV() / deltaVPerTonPlaceholder // hull count 1
	if !(cost > 0) {
		t.Fatalf("fixture invariant: the probe burn priced %v tons, want strictly positive — there is no "+
			"exactly-affordable commit to construct from a free burn", cost)
	}

	// Rewind THAT SAME FLEET to its pristine, unattached, action-free start
	// and re-commit the IDENTICAL order with fuel set to EXACTLY this
	// commit's own cost, so remaining fuel after the debit is ~0 — unable to
	// afford ANY further floor-priced burn to a distant point with nothing
	// nearby.
	restoreFleetMotion(t, sp.fleetId, pristine)
	// `funded` is nudged UP by whole ULPs only if the literal float64 `cost`
	// is not representably affordable against production's exact `fuel <
	// newCost` gate. In practice zero iterations run (the test recomputes the
	// identical expression production does, from the same Burn); the loop is
	// the same one-ULP guard the adjudicated exactly-zero fixture uses, and
	// it can never leave more than ~1e-13 tons of headroom — twelve orders of
	// magnitude below anything that could reach a station.
	funded := cost
	for i := 0; funded < cost; i++ {
		if i > 8 {
			t.Fatalf("fixture invariant: could not represent a funding equal to the burn's own price %v", cost)
		}
		funded = math.Nextafter(funded, math.Inf(1))
	}
	setFleetFuel(t, sp.fleetId, funded)
	warnResp, warnBody, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"point": far, "accel": 4.0})
	if code != http.StatusOK {
		t.Fatalf("fleet-movement \"The warning never blocks a commit that fuel affordability alone would "+
			"accept\": the commit itself was rejected (status = %d) — an exactly-affordable commit must still "+
			"succeed. Funded %v tons, which is this very fleet's own price for this very burn, probed from "+
			"the identical (motionless point-park) origin moments earlier.", code, funded)
	}
	if warnResp.State.Burn == nil {
		t.Fatalf("exact-cost commit did not settle a Burn: %+v", warnResp.State)
	}
	// The probe premise, verified against the burn actually solved: if these
	// two prices diverge, the funding was not this commit's own price and
	// neither a pass nor a failure of the warning assertion means anything.
	if got := warnResp.State.Burn.DeltaV() / deltaVPerTonPlaceholder; math.Abs(got-cost) > 1e-9*math.Abs(cost) {
		t.Fatalf("fixture invariant: the funded commit priced %v tons but the probe priced %v — the two "+
			"commits did not solve the identical burn, so this fixture is not constructing the "+
			"~zero-remaining balance the stranding warning is asserted against", got, cost)
	}

	extra := extraKeys(keySet(baselineBody), keySet(warnBody))
	if len(extra) == 0 {
		t.Errorf("fleet-movement \"A burn that leaves the fleet unable to reach any station or gate, even at "+
			"the acceleration floor, is still accepted, with a warning\": the exactly-affordable commit to a "+
			"remote point (leaving ~0 remaining fuel, nowhere near a station or gate) carries no key the "+
			"baseline ample-fuel commit's response doesn't already have — no distinguishable warning is present. "+
			"Baseline keys: %v; this response's keys: %v", keySet(baselineBody), keySet(warnBody))
	}
}

func TestBurnCommitWarning_Scenario_CanReachAtFloorCarriesNoWarning(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	safe := spawnFuelCorp(t, router, "SDET No-Warning Safe Corp")
	setFleetFuel(t, safe.fleetId, 1_000_000) // ample: can certainly still reach the home station at the floor

	_, safeBody, code := postOrder(t, router, safe.token, safe.fleetId,
		map[string]any{"point": space.Vec3{X: 5000}, "accel": 4.0})
	if code != http.StatusOK {
		t.Fatalf("ample-fuel order: status = %d", code)
	}

	strandedWarningRaw, present := fieldAnywhere(safeBody, "warning")
	if present && strandedWarningRaw != nil && strandedWarningRaw != "" {
		t.Errorf("fleet-movement \"A burn that leaves the fleet able to reach at least one station or gate at "+
			"the acceleration floor carries no warning\": commit response carries a non-empty `warning` field "+
			"(%v) for a fleet with 1,000,000 tons of fuel remaining after the debit — it can certainly still "+
			"reach its own home station at the floor", strandedWarningRaw)
	}
}

func TestBurnCommitWarning_Scenario_ACandidateTooCloseToSolveCountsAsReachableAtZeroCost(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	// Baseline key set, from a definitely-safe commit — see the diff
	// rationale in the previous warning test. A SEPARATE corp is fine here:
	// this comparison is purely structural (does an extra JSON key appear),
	// never a numeric value, so mismatched cross-corp geometry cannot break
	// it the way a numeric cost comparison would.
	baseline := spawnFuelCorp(t, router, "SDET ErrArcTooShort Baseline Corp")
	setFleetFuel(t, baseline.fleetId, 1_000_000)
	_, baselineBody, code := postOrder(t, router, baseline.token, baseline.fleetId,
		map[string]any{"bodyId": baseline.stationId})
	if code != http.StatusOK {
		t.Fatalf("baseline order: status = %d", code)
	}

	// REVISION 1 (SDET, cause: developer-reported defect, confirmed against
	// the tree): an earlier draft learned costToOwnStation from a SEPARATE
	// "learner" corp, then applied it to a THIRD, independently-spawned
	// corp's own (differently-placed) home station — cross-corporation
	// geometry is not comparable (site selection places each corp
	// independently), so the "exact cost" premise this scenario depends on
	// did not hold. Fixed by learning the cost from the SAME fleet this
	// test actually exercises, rewound to its own pristine position
	// afterward — the identical pattern the burn-cost-scaling tests in
	// this suite already use.
	//
	// REVISION 2 (SDET, 2026-09-02; cause: developer-reported flake,
	// REPRODUCED here — 2 failures in 5 consecutive runs, one of them this
	// very 409). Revision 1 removed the cross-CORP mismatch but left a
	// cross-TIME one: the candidate it burned to was the home STATION, and a
	// station orbits. Measured against a live spawn, the floor of this exact
	// order's price oscillates with the station's own orbital period —
	// 34.9552 t → 35.1200 t → 34.9584 t over ~4.5 s of world time, a 0.47%
	// swing for a 954-unit arc — and the swing is a function of the arc
	// length, so a corp whose fleet spawns nearer its station sees a much
	// larger RELATIVE swing. The 1% margin was therefore not a bound on
	// anything; it was a guess that happened to hold for most spawn sites.
	//
	// THE ASSERTION IS UNCHANGED. The fixture now burns to a LANE-GATE body
	// instead of the station. That is not a weakening: the scenario names
	// "a candidate station OR GATE body's floor-priced solve", gates are in
	// fleet.candidateHosts' bounded candidate set (fleet/fuel.go), and the
	// rule exercised is the identical ErrArcTooShort branch — the fleet
	// arrives at the gate's own insertion standoff, so the floor-priced
	// solve from there back to that same gate cannot build a curve. What a
	// gate buys is DETERMINISM: system.gateOrbit gives every gate
	// PeriodMs = 0, so a gate does not move and the price is time-invariant.
	// Measured over five probes spanning ~3.6 s of world time, this order's
	// price and arc length were BIT-IDENTICAL every time (14.086400000000 t,
	// 154.995630405 units), so the probe can be spent exactly, with no
	// margin and no drift to absorb. The station remains in the candidate
	// set and is still evaluated first — with zero fuel remaining it is
	// correctly unaffordable, which is exactly what forces the evaluation
	// onto the ErrArcTooShort branch this test exists to pin.
	sp := spawnFuelCorp(t, router, "SDET ErrArcTooShort Test Corp")
	arrangeStationaryPoint(t, router, sp) // Explicit scenario premise; real spawn remains station-hosted.
	gateBodyId, _ := gateBodyIdFor(t, sp)
	pristine := snapshotFleetMotion(t, sp.fleetId)
	setFleetFuel(t, sp.fleetId, 1_000_000)
	learnResp, _, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": gateBodyId})
	if code != http.StatusOK || learnResp.State.Burn == nil {
		t.Fatalf("learner order to gate %s: status = %d, burn = %+v", gateBodyId, code, learnResp.State)
	}
	costToOwnGate := learnResp.State.Burn.DeltaV() / deltaVPerTonPlaceholder
	if !(costToOwnGate > 0) {
		t.Fatalf("fixture invariant: the probe burn to gate %s priced %v tons, want strictly positive",
			gateBodyId, costToOwnGate)
	}

	// Rewind to the IDENTICAL pristine position and set fuel to EXACTLY the
	// learned cost (ULP-nudged up only if that literal is not representably
	// affordable against production's exact `fuel < newCost` gate — in
	// practice zero iterations, since the test recomputes the identical
	// expression production does from the same Burn). Then burn to that same
	// motionless gate again: the resulting park is at (or arrives at) that
	// very gate, so a reachability candidate solving a floor-priced burn
	// from there BACK to it must fail with space.ErrArcTooShort (the curve
	// is too short to build), which SHALL count as reachable at zero cost —
	// with, by construction, exactly zero fuel remaining after this commit's
	// own debit.
	restoreFleetMotion(t, sp.fleetId, pristine)
	funded := costToOwnGate
	for i := 0; funded < costToOwnGate; i++ {
		if i > 8 {
			t.Fatalf("fixture invariant: could not represent a funding equal to the burn's own price %v",
				costToOwnGate)
		}
		funded = math.Nextafter(funded, math.Inf(1))
	}
	setFleetFuel(t, sp.fleetId, funded)
	resp, body, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": gateBodyId})
	if code != http.StatusOK {
		t.Fatalf("fleet-movement \"A candidate too close to solve counts as reachable at zero cost\": the "+
			"exactly-affordable commit to the fleet's OWN lane gate was rejected (status = %d) — it must "+
			"succeed exactly as any other affordable commit would. Funded %v tons, this very fleet's own "+
			"price for this very burn to motionless gate %s, probed from the identical origin moments "+
			"earlier.", code, funded, gateBodyId)
	}
	if resp.State.Burn == nil {
		t.Fatalf("commit did not settle a Burn: %+v", resp.State)
	}
	// The probe premise, verified against the burn actually solved.
	if got := resp.State.Burn.DeltaV() / deltaVPerTonPlaceholder; math.Abs(got-costToOwnGate) > 1e-9*costToOwnGate {
		t.Fatalf("fixture invariant: the funded commit priced %v tons but the probe priced %v — a gate is "+
			"supposed to be motionless (system.gateOrbit: PeriodMs = 0), so these two solves must be "+
			"identical; this fixture is no longer constructing the zero-remaining balance it asserts",
			got, costToOwnGate)
	}

	extra := extraKeys(keySet(baselineBody), keySet(body))
	if len(extra) != 0 {
		t.Errorf("fleet-movement \"A candidate too close to solve counts as reachable at zero cost\": a burn "+
			"TO a candidate lane-gate body (leaving exactly 0 fuel remaining) carries EXTRA key(s) %v not "+
			"present on a definitely-safe baseline commit — this reads as a fired stranding warning. Burning "+
			"to the very station or gate being evaluated is the single most routine configuration in the game "+
			"(a fleet parked at, or burning to, its own refuelling point or its own lane gate); an "+
			"ErrArcTooShort candidate must count as reachable at zero cost, not as unreachable", extra)
	}
}

// fleetDerivedAccelCeiling mirrors fleet.DerivedAccelCeiling's own result for
// the default single-ClassSeed roster every fleet in this suite starts with
// (fleet/roster.go's defaultSeedAccel = 8.0) — hardcoded here, not imported,
// because backend/main's own e2e files deliberately test through the HTTP
// contract rather than reaching into a domain package's private
// configuration constants; every burn response observed in this entire
// suite's own logs carries Accel: 8 for an unmodified-ceiling commit,
// corroborating this value independently of the source constant.
func fleetDerivedAccelCeiling() float64 { return 8.0 }

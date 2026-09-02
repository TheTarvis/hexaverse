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

	// Fly for real to the home station, then time-travel the arrival into
	// the past (forceBurnArrivalPast) rather than waiting out the real
	// wall-clock flight duration — see that helper's doc comment. The fleet
	// genuinely settles through the production BurnResolver, landing
	// AttachedTo == the station's own feature id.
	orderResp, _, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": sp.stationId})
	if code != http.StatusOK {
		t.Fatalf("order to home station: status = %d", code)
	}
	if orderResp.State.Burn == nil {
		t.Fatalf("order response is not a Burn: %+v", orderResp.State)
	}
	forceBurnArrivalPast(t, sp.fleetId)
	setFleetFuel(t, sp.fleetId, 1_000_000) // restore a full tank post-"arrival" (a debited commit already spent some)

	typed, body, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET fleet (post-arrival): status = %d", code)
	}
	if typed.AttachedTo != sp.stationId {
		t.Fatalf("fixture invariant broken: fleet is not docked at its home station after the forced arrival "+
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
	far := space.Vec3{X: 500_000, Y: 500_000, Z: 500_000} // far from the home station and any gate

	// Baseline: a cheap, safe commit's key set (never stranding) — the
	// reference this test diffs the warning-triggering response against, so
	// no SDET guess about the warning field's exact name is required (see
	// fuel_e2e_helpers_test.go's keySet/extraKeys doc comments).
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

	// Rewind to a pristine, unattached start (a fresh corp — cleanest way
	// to guarantee "no active order, no attachment" going in) and re-commit
	// the IDENTICAL order with fuel set to EXACTLY this commit's own cost,
	// so remaining fuel after the debit is ~0 — unable to afford ANY
	// further floor-priced burn to a distant point with nothing nearby.
	sp2 := spawnFuelCorp(t, router, "SDET Stranding Warning Corp (exact)")
	setFleetFuel(t, sp2.fleetId, cost)
	warnResp, warnBody, code := postOrder(t, router, sp2.token, sp2.fleetId, map[string]any{"point": far, "accel": 4.0})
	if code != http.StatusOK {
		t.Fatalf("fleet-movement \"The warning never blocks a commit that fuel affordability alone would "+
			"accept\": the commit itself was rejected (status = %d) — an exactly-affordable commit must still "+
			"succeed", code)
	}
	if warnResp.State.Burn == nil {
		t.Fatalf("exact-cost commit did not settle a Burn: %+v", warnResp.State)
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

	// REVISION (SDET, cause: developer-reported defect, confirmed against
	// the tree): an earlier draft learned costToOwnStation from a SEPARATE
	// "learner" corp, then applied it to a THIRD, independently-spawned
	// corp's own (differently-placed) home station — cross-corporation
	// geometry is not comparable (site selection places each corp
	// independently), so the "exact cost" premise this scenario depends on
	// did not hold. Fixed by learning the cost from the SAME fleet this
	// test actually exercises, rewound to its own pristine position
	// afterward — the identical pattern the burn-cost-scaling tests in
	// this suite already use.
	sp := spawnFuelCorp(t, router, "SDET ErrArcTooShort Test Corp")
	pristine := snapshotFleetMotion(t, sp.fleetId)
	setFleetFuel(t, sp.fleetId, 1_000_000)
	learnResp, _, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": sp.stationId})
	if code != http.StatusOK || learnResp.State.Burn == nil {
		t.Fatalf("learner order: status = %d, burn = %+v", code, learnResp.State)
	}
	costToOwnStation := learnResp.State.Burn.DeltaV() / deltaVPerTonPlaceholder

	// Rewind to the IDENTICAL pristine position, set fuel to the learned
	// cost PLUS A SMALL SAFETY MARGIN (not exactly equal), then order to
	// burn to ITS OWN home station again — the resulting park is at (or
	// arriving at) that very station, so a reachability candidate solving
	// a burn from there BACK to the same station must fail with
	// space.ErrArcTooShort (the curve is too short to build), which SHALL
	// count as reachable at zero cost — regardless of the near-zero fuel
	// remaining after this commit's own debit.
	//
	// The margin exists because the two commits are NOT bit-identical: real
	// wall-clock time elapses between learning the cost and re-committing,
	// and the station's own orbital position (if any) can drift in that
	// window, making the second commit's TRUE cost infinitesimally
	// different from the first's. An exact-equality fixture would then
	// fail (or pass) depending on the sign of that drift — a coin flip
	// unrelated to the ErrArcTooShort rule this test exists to pin. A 1%
	// margin keeps "remaining fuel is near-zero relative to the original
	// learning balance" true while absorbing the drift.
	restoreFleetMotion(t, sp.fleetId, pristine)
	setFleetFuel(t, sp.fleetId, costToOwnStation*1.01+0.01)
	resp, body, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": sp.stationId})
	if code != http.StatusOK {
		t.Fatalf("fleet-movement \"A candidate too close to solve counts as reachable at zero cost\": the "+
			"exactly-affordable commit to the fleet's OWN home station was rejected (status = %d) — it must "+
			"succeed exactly as any other affordable commit would", code)
	}
	if resp.State.Burn == nil {
		t.Fatalf("commit did not settle a Burn: %+v", resp.State)
	}

	extra := extraKeys(keySet(baselineBody), keySet(body))
	if len(extra) != 0 {
		t.Errorf("fleet-movement \"A candidate too close to solve counts as reachable at zero cost\": a burn "+
			"TO the fleet's own home station (leaving ~0 fuel remaining) carries EXTRA key(s) %v not present on "+
			"a definitely-safe baseline commit — this reads as a fired stranding warning. Burning to the very "+
			"station being evaluated is the single most routine configuration in the game (a fleet parked at, "+
			"or burning to, its own refuelling point); an ErrArcTooShort candidate must count as reachable at "+
			"zero cost, not as unreachable", extra)
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

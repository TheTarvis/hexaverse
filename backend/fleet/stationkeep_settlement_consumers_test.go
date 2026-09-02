package fleet

// RED-PHASE SDET SUITE for openspec change add-stationkeep-hold-verb —
// fleet-movement:
//
//   - "Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded
//     Into the Stored Cargo Pool": the two BURN-COMMIT scenarios
//   - "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First":
//     the burn-commit affordability scenario, the FreeHold scenario's
//     value-correctness half, and the estimated-range / stranded-indication
//     scenarios' value-correctness half
//
// See stationkeep_testsupport_test.go for the assumed API contract and the
// expected compile-red state.

import (
	"errors"
	"math"
	"testing"

	"hexaverse/space"
)

// hullCount for every fixture fleet in this file is exactly one seed hull
// (holdStack.orbitingFleet), so a burn's fuel cost is DeltaV()/DeltaVPerTon
// with the hull-count multiplier at 1. Station-keeping upkeep carries NO
// hull-count multiplier at all — "station-keeping is a per-fleet positional
// hold, not a burn, and this change does not extend the hull-count scaling
// ruling to it".
func burnCostTons(b *space.Burn, p FuelParams) float64 {
	return b.DeltaV() * 1 / p.DeltaVPerTon
}

// farPoint is a fixed, body-independent burn target well inside the system's
// extent — the same "order to a point" arrangement the existing fuel suite
// uses, chosen so two fleets at the identical position at the identical world
// time solve the IDENTICAL burn.
func (h *holdStack) farPoint() space.Vec3 { return space.Vec3{X: h.bt.Extent() * 0.4, Y: 0, Z: 0} }

// Scenario: A burn committed from an open station-keeping hold settles its
// accrued upkeep and replaces the park, without restamping.
func TestBurnFromHold_Scenario_SettlesAccruedUpkeepAndReplacesTheParkWithoutRestamping(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 2_000
	f := h.orbitingFleet(t, "sdet-burn-from-hold", fuel)
	held := h.holdOrFail(t, f.Id)
	holdStart := held.HoldStartMs
	dry := held.DryInstantMs

	h.clk.now = holdStart + (dry-holdStart)/3
	commitAt := h.clk.Now()
	if !(commitAt < dry) {
		t.Fatalf("fixture invariant: the commit must land strictly before the dry instant (%d < %d)", commitAt, dry)
	}

	target := h.farPoint()
	ordered, err := h.fsvc.OrderTo(h.ctx, f.Id, OrderRequest{Point: &target})
	if err != nil {
		t.Fatalf("ordering a burn from an open station-keeping hold: %v — a hold is not a movement lock; the "+
			"burn must commit, settling the hold's accrual on its way", err)
	}
	if ordered.State.Mode != space.ModeBurn || ordered.State.Burn == nil {
		t.Fatalf("post-commit state = %+v, want a burn", ordered.State)
	}

	accrual := wantUpkeepTons(h.rate, holdStart, commitAt, h.params)
	cost := burnCostTons(ordered.State.Burn, h.params)
	want := fuel - accrual - cost

	stored := h.stored(t, f.Id)
	nearly(t, fuelOf(stored), want, math1e9Rel(want),
		"fleet-movement \"A burn committed from an open station-keeping hold settles its accrued upkeep and "+
			"replaces the park, without restamping\": the transaction FIRST debits the accrued upkeep "+
			"(space.StationKeepUpkeep(rate, holdStart, eventTime) / DeltaVPerTon), THEN evaluates and debits "+
			"the burn's own fuel cost against the resulting balance")
	if accrual > 0 && fuelOf(stored) > want+accrual*0.5 {
		t.Errorf("  the observed balance is ~%v higher than expected, which is the size of the hold's accrued "+
			"upkeep (%v) — the burn commit appears to have FORGIVEN the accrual entirely. \"No path SHALL end "+
			"a hold without settling it.\"", fuelOf(stored)-want, accrual)
	}

	// "with no dry instant recomputed and no hold restamped, since the hold no
	// longer exists once the burn is stored."
	if stored.State.Mode != space.ModeBurn || stored.State.Burn == nil {
		t.Fatalf("the STORED state is %+v, want the committed burn stored in place of the stationkeep park",
			stored.State)
	}
	if stored.State.Park != nil && stored.State.Park.Kind == space.ParkStationkeep {
		t.Errorf("a `stationkeep` park survived the burn commit (%+v) — the burn REPLACES the park outright; "+
			"there is no hold left to restamp", stored.State.Park)
	}
}

// Scenario: A burn that would leave exactly zero fuel after settlement still
// commits, never bricking the fleet.
//
// The station-keeping reserve does NOT constrain this path: "the station-
// keeping reserve does not constrain a burn the player chose to commit."
//
// POST-HANDOFF REVISION (2026-09-02). Cause: adjudicated test defect — the
// orchestrator ruled for the developer against the ORIGINAL fixture, and the
// ruling is correct. That fixture priced its calibration burn at the hold
// start and then spent it at `commitAt`, roughly forty orbital periods later.
// The host body had moved ~46.9 units in between, so the subject's burn from
// its own (moved) origin cost 20.4592 t against a calibration price of
// 18.9696 t, and the commit was CORRECTLY rejected with ErrInsufficientFuel.
// The premise "the world clock is injected, so nothing drifts between the two
// commits" was false: the clock is injected, but the fixture ADVANCED it
// between the two orders, and the burn's price is a function of the origin's
// position at the order instant.
//
// THE ASSERTION IS UNCHANGED — the commit must succeed and the fleet must land
// at zero. Only the arrangement moved: the calibration burn is now priced at
// the SAME world instant the subject's burn commits, from the SAME position.
// Both fleets are held at the same instant, beside the same body, from the
// same seeded orbit park, so `hold` stores them the identical offset; at
// `commitAt` they therefore occupy the identical point and solve the identical
// burn to the identical fixed target. That equality of offsets is now asserted
// as a fixture invariant rather than argued in a comment, so if this premise
// ever breaks again it fails by name instead of by an unexplained rejection.
//
// The funding is then nudged UP by whole ULPs until the post-settlement
// balance is representably at or above the burn's price. That is not slack:
// `funded = accrual + cost` is a float64 addition whose rounding can land a
// half-ULP BELOW `cost` once the accrual is settled back out, and the
// production gate is exact (`fuel < newCost` rejects). The nudge selects the
// least double that settles to at least the burn's price, so the residual is
// bounded by one ULP of the funded figure (~6e-14 t here) — zero to well
// inside double precision, and eleven orders of magnitude below one
// millisecond of upkeep.
func TestBurnFromHold_Scenario_ABurnLeavingExactlyZeroFuelAfterSettlementStillCommits(t *testing.T) {
	h := newHoldStack(t)
	target := h.farPoint()

	// --- both fleets held at the SAME instant, from the SAME seeded orbit ---
	subject := h.orbitingFleet(t, "sdet-burn-zero-subject", h.reserve+1_000)
	held := h.holdOrFail(t, subject.Id)
	holdStart := held.HoldStartMs
	dry := held.DryInstantMs

	cal := h.orbitingFleet(t, "sdet-burn-zero-cal", 1_000_000)
	calPark := h.holdOrFail(t, cal.Id)

	// The premise, asserted: identical body, identical held offset, identical
	// hold start. Two fleets so arranged occupy the identical point at every
	// instant before either dry instant, so they solve the identical burn.
	if calPark.BodyId != held.BodyId || calPark.Offset != held.Offset || calPark.HoldStartMs != holdStart {
		t.Fatalf("fixture invariant: the calibration fleet must hold the IDENTICAL offset beside the "+
			"IDENTICAL body from the IDENTICAL instant, or it does not price the subject's burn. "+
			"calibration{body=%q offset=%+v holdStart=%d} vs subject{body=%q offset=%+v holdStart=%d}",
			calPark.BodyId, calPark.Offset, calPark.HoldStartMs, held.BodyId, held.Offset, holdStart)
	}

	commitAt := holdStart + (dry-holdStart)/3
	if !(commitAt < dry && commitAt < calPark.DryInstantMs) {
		t.Fatalf("fixture invariant: the commit instant %d must fall strictly inside BOTH open holds "+
			"(subject dry %d, calibration dry %d) — a folded calibration fleet is no longer at the "+
			"subject's position", commitAt, dry, calPark.DryInstantMs)
	}

	// --- calibration: price the burn AT THE COMMIT INSTANT, not at T0 ------
	h.clk.now = commitAt
	calBurn, err := h.fsvc.OrderTo(h.ctx, cal.Id, OrderRequest{Point: &target})
	if err != nil {
		t.Fatalf("calibration order at the commit instant: %v", err)
	}
	if calBurn.State.Burn == nil {
		t.Fatalf("calibration order did not produce a burn: %+v", calBurn.State)
	}
	cost := burnCostTons(calBurn.State.Burn, h.params)
	if !(cost > 0) {
		t.Fatalf("fixture invariant: the calibration burn cost %v tons, want strictly positive", cost)
	}

	// --- the fleet under test, funded to land at exactly zero -------------
	accrual := wantUpkeepTons(h.rate, holdStart, commitAt, h.params)
	funded := accrual + cost
	for i := 0; funded-accrual < cost; i++ {
		if i > 8 {
			t.Fatalf("fixture invariant: could not represent a funding that settles to the burn's exact "+
				"price (accrual %v, cost %v)", accrual, cost)
		}
		funded = math.Nextafter(funded, math.Inf(1))
	}
	residual := (funded - accrual) - cost // ≤ 1 ULP of `funded`, by construction

	// Re-fund WITHOUT restamping the hold: the settlement is a function of
	// the stored hold window and the upkeep rate alone, never of the stored
	// fuel level, so moving the balance leaves the accrual untouched.
	s := h.stored(t, subject.Id)
	s.Cargo = map[string]float64{"fuel": funded}
	s.StateDoc = EncodeKinematicState(s.State)
	if err := h.dao.Save(h.ctx, *s); err != nil {
		t.Fatalf("funding the subject fleet to exactly accrual+cost: %v", err)
	}

	ordered, err := h.fsvc.OrderTo(h.ctx, subject.Id, OrderRequest{Point: &target})
	if err != nil {
		t.Fatalf("fleet-movement \"A burn that would leave exactly zero fuel after settlement still "+
			"commits, never bricking the fleet\": the commit was REJECTED (%v). Funded %v tons = accrued "+
			"upkeep %v + burn cost %v (priced by a fleet held at the same offset beside the same body, "+
			"ordered at this same world instant %d); after settlement the balance is exactly the burn's own "+
			"price, which is affordable, not unaffordable. Note the station-keeping reserve (%v) does NOT "+
			"apply here: \"the station-keeping reserve does not constrain a burn the player chose to "+
			"commit\".", err, funded, accrual, cost, commitAt, h.reserve)
	}
	if ordered.State.Mode != space.ModeBurn || ordered.State.Burn == nil {
		t.Fatalf("post-commit state = %+v, want the committed burn", ordered.State)
	}
	// The calibration premise, verified against the burn actually solved: if
	// these two prices diverge, the funding was not the subject's own price
	// and neither a pass nor a failure of the zero assertion means anything.
	if got := burnCostTons(ordered.State.Burn, h.params); math.Abs(got-cost) > math1e9Rel(cost) {
		t.Fatalf("fixture invariant: the subject's burn priced %v tons but the calibration burn priced %v "+
			"— the two fleets did not solve the identical burn, so this fixture is not constructing the "+
			"exactly-zero balance it asserts", got, cost)
	}

	stored := h.stored(t, subject.Id)
	// "Exactly zero" to within the ULP the funding construction leaves behind,
	// plus a nanogram of slack — five orders of magnitude tighter than the
	// relative tolerance used elsewhere in this file, and observed to hold with
	// ~1e5 headroom (the settled balance measures ~7e-15 t, exactly the
	// constructed residual, because production's accrual and burn price come
	// out bit-identical to the calibration's). Deliberately far below one
	// millisecond of upkeep, the finest quantum this capability's arithmetic
	// distinguishes, so this cannot pass on a real leftover balance.
	tol := residual + 1e-9
	nearly(t, fuelOf(stored), 0, tol,
		"the fleet holds exactly zero fuel after settlement plus the burn's own cost")
	if oneMs := oneMillisecondOfUpkeepTons(h.rate, h.params); tol >= oneMs {
		t.Errorf("fixture invariant: the zero tolerance %v is not strictly finer than one millisecond of "+
			"upkeep (%v), so this assertion no longer distinguishes zero from a real balance", tol, oneMs)
	}
	if stored.State.Park != nil && stored.State.Park.Kind == space.ParkStationkeep {
		t.Fatalf("fleet-movement \"...no `stationkeep` park with a dry instant equal to a restamped "+
			"hold-start is ever persisted by this path, since a burn commit's settlement never restamps\": a "+
			"stationkeep park WAS persisted: %+v (holdStart=%d dryInstant=%d). With the post-commit balance at "+
			"zero, a restamp computes dryInstant == holdStart — the exact undecodable park the "+
			"insufficient-fuel `hold` precondition exists to prevent, reached by a path that precondition "+
			"does not guard.",
			*stored.State.Park, stored.State.Park.HoldStartMs, stored.State.Park.DryInstantMs)
	}
	// The fleet must still be readable — the "never bricking" half, asserted
	// rather than assumed.
	if _, err := h.fsvc.Get(h.ctx, subject.Id); err != nil {
		t.Errorf("the fleet is unreadable after the commit: %v — this is precisely the brick the scenario "+
			"names", err)
	}
}

// --- "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First" ---

// Scenario: A burn commit against a past-dry-instant holding fleet evaluates
// against settled, reserve-level fuel.
//
// REVISED for this change (cause: spec change — the settled figure is the
// configured reserve, not zero). The scenario now has two halves: "a burn
// costing more than the reserve is rejected with the named insufficient-fuel
// reason and a burn costing no more than the reserve commits."
func TestSettleFirst_Scenario_ABurnCommitAgainstAPastDryInstantHoldingFleetEvaluatesAgainstSettledReserveLevelFuel(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 1_000
	f := h.orbitingFleet(t, "sdet-settle-first-burn", fuel)
	held := h.holdOrFail(t, f.Id)
	dry := held.DryInstantMs
	offset := held.Offset

	// The dry instant passes with NO intervening write — "has already passed
	// but has not yet been observed by any prior write". The stored fuel
	// field still shows the full, stale figure at this point.
	h.clk.now = dry + 1
	if stale := fuelOf(h.stored(t, f.Id)); stale != fuel {
		t.Fatalf("fixture invariant: the stored fuel should still read the stale %v here, got %v", fuel, stale)
	}

	target := h.farPoint()
	ordered, err := h.fsvc.OrderTo(h.ctx, f.Id, OrderRequest{Point: &target})

	// Whatever the outcome, the settlement must be durable — "committed by a
	// write that PRECEDES and is INDEPENDENT of the burn's own commit
	// transaction — so a rejected commit leaves the settlement durable while
	// itself persisting nothing".
	stored := h.stored(t, f.Id)

	if err == nil {
		// The only legitimate success is a burn the RESERVE alone affords.
		cost := burnCostTons(ordered.State.Burn, h.params)
		if cost > h.reserve {
			t.Fatalf("fleet-movement \"A burn commit against a past-dry-instant holding fleet evaluates "+
				"against settled, reserve-level fuel\": the commit SUCCEEDED for a burn costing %v tons "+
				"against a settled balance of exactly the reserve (%v). It evaluated affordability against "+
				"the stale, over-reported %v tons the stored field still showed, which defeats "+
				"add-fuel-as-cargo's own guarantee that \"a committed burn can never later fail to resolve "+
				"for lack of fuel\".", cost, h.reserve, fuel)
		}
		t.Logf("SDET note: this system's cheapest burn (%v tons) is affordable from the reserve alone (%v), "+
			"so this fixture exercised the scenario's \"and a burn costing no more than the reserve commits\" "+
			"half rather than its rejection half", cost, h.reserve)
	} else {
		if !errors.Is(err, ErrInsufficientFuel) {
			t.Errorf("rejection = %v, want ErrInsufficientFuel — \"a burn costing more than the reserve is "+
				"rejected with the named insufficient-fuel reason\"; the affordability gate is what must see "+
				"the settled, reserve-level figure", err)
		}
		if stored.State.Mode == space.ModeBurn {
			t.Errorf("the rejected commit stored a burn (%+v) — it persists nothing of its own",
				stored.State.Burn)
		}
	}

	// "AND the settlement (fold to orbit, `fuel` persisted at exactly the
	// reserve) is committed by a write that precedes and is independent of the
	// burn's own commit transaction."
	if got := fuelOf(stored); got != h.reserve {
		t.Errorf("stored fuel after the settle-then-decide = %v, want EXACTLY the reserve %v — the settlement "+
			"is applied by a PRECEDING, INDEPENDENT write, \"so a rejected commit leaves the settlement "+
			"durable while itself persisting nothing\". A value of %v means no settlement was persisted; a "+
			"value of 0 means the reserve was not held back.", got, h.reserve, fuel)
	}
	wantPark := space.ReleaseStationkeep(h.bodyId, offset, dry)
	if stored.State.Mode == space.ModeParked &&
		(stored.State.Park == nil || *stored.State.Park != wantPark) {
		t.Errorf("stored park after the settle-then-reject = %+v, want the released orbit %+v (as of the dry "+
			"instant %d)", stored.State.Park, wantPark, dry)
	}
}

// Scenario: FreeHold used by mine's resolve clamp reflects a settled hold
// (value-correctness half; the mine-run seam itself is exercised end to end
// in backend/stationkeep_mine_and_burn_e2e_test.go).
//
// Task 7.5 states the trap explicitly: "a test that only asserts stability
// passes against the stale-over-report bug this change exists to close, so
// assert the value equals what a fresh fold to `orbit` with `fuel` at the
// reserve would produce". That is what this asserts — the CORRECT value, not
// a stable one.
func TestSettleFirst_Scenario_FreeHoldReflectsASettledHold(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 120
	f := h.orbitingFleet(t, "sdet-settle-first-freehold", fuel)
	held := h.holdOrFail(t, f.Id)

	h.clk.now = held.DryInstantMs + 1
	read, err := h.fsvc.Get(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("reading the fleet past its dry instant: %v", err)
	}

	stats := DefaultClassStats()
	got := FreeHold(*read, stats)
	capacity := DerivedCapacity(*read, stats)
	wantSettled := capacity - h.reserve // the fold leaves exactly the reserve aboard
	staleValue := capacity - fuel

	if got == staleValue {
		t.Fatalf("fleet-movement \"FreeHold used by mine's resolve clamp reflects a settled hold\": FreeHold "+
			"= %v, which is exactly the STALE value (capacity %v minus the %v tons the fleet no longer holds "+
			"after the fold). The consumer read the pre-fold figure — \"never the stale pre-fold value that "+
			"would otherwise over-report the fleet's available capacity\".", got, capacity, fuel)
	}
	nearly(t, got, wantSettled, 1e-9,
		"FreeHold for a past-dry-instant holding fleet equals what a fresh fold to `orbit` with `fuel` at "+
			"exactly the reserve would produce (capacity − reserve)")

	// Durably persisted, not merely folded in memory for this one consumer.
	if stored := fuelOf(h.stored(t, f.Id)); stored != h.reserve {
		t.Errorf("the settled figure was not PERSISTED: stored fuel = %v, want exactly the reserve %v. "+
			"\"an in-memory fold satisfies every 'computed from the settled value' assertion while leaving "+
			"the stored figure stale\" (task 7.13).", stored, h.reserve)
	}
}

// Scenario: A fleet's estimated range reflects a settled hold before the range
// is computed.
// Scenario: A fleet's persistent stranded indication reflects a settled hold
// before it is computed.
//
// REVISED for this change (cause: spec change). The earlier draft asserted a
// range of exactly zero and stranded == true, because the settled figure was
// zero. The settled figure is now the configured, STRICTLY POSITIVE reserve,
// so neither of those is a correct expectation: what the scenarios require is
// that the figures are computed FROM the settled value and not from the stale
// one. Both are asserted by equality against the reserve-derived figure and by
// inequality against the stale-derived one.
func TestSettleFirst_Scenario_EstimatedRangeAndStrandedIndicationReflectASettledHold(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 5_000
	f := h.orbitingFleet(t, "sdet-settle-first-range", fuel)
	held := h.holdOrFail(t, f.Id)

	h.clk.now = held.DryInstantMs + 1
	read, err := h.fsvc.Get(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("reading the fleet past its dry instant: %v", err)
	}
	rng, stranded, err := h.fsvc.FuelStatus(h.ctx, read)
	if err != nil {
		t.Fatalf("FuelStatus: %v", err)
	}

	hullCount := len(effectiveRoster(*read))
	wantRange := EstimatedRangeTons(h.reserve, hullCount, h.params)
	staleRange := EstimatedRangeTons(fuel, hullCount, h.params)

	if math.Abs(rng-staleRange) < math1e9Rel(staleRange) && math.Abs(staleRange-wantRange) > math1e9Rel(wantRange) {
		t.Fatalf("fleet-movement \"A fleet's estimated range reflects a settled hold before the range is "+
			"computed\": estimatedRange = %v, which is exactly the STALE figure (computed from the %v tons "+
			"the stored field still showed). Want %v, computed from the settled value — exactly the reserve "+
			"(%v). \"a stale range figure looks like a healthy one\".", rng, fuel, wantRange, h.reserve)
	}
	nearly(t, rng, wantRange, math1e9Rel(wantRange),
		"fleet-movement \"A fleet's estimated range reflects a settled hold before the range is computed\": "+
			"the range is computed from the settled fuel value (exactly the reserve), never the stale "+
			"pre-fold value")

	// The stranded indication is computed at the acceleration floor from the
	// same settled figure. Its truth value depends on this system's geometry
	// and on the reserve's (placeholder) magnitude, so what is asserted is
	// agreement with the reserve-funded computation, never a hardcoded bool.
	wantStranded := h.strandedAt(t, read, h.reserve)
	staleStranded := h.strandedAt(t, read, fuel)
	if stranded != wantStranded {
		t.Errorf("fleet-movement \"A fleet's persistent stranded indication reflects a settled hold before it "+
			"is computed\": stranded = %v, want %v — the indication computed from the SETTLED fuel value "+
			"(exactly the reserve, %v). Against the stale %v tons it computes %v. \"a stale stranded "+
			"indication reads 'not stranded' for a fleet that in fact holds only its reserve — a cry-wolf "+
			"failure in reverse.\"", stranded, wantStranded, h.reserve, fuel, staleStranded)
	}

	// Durably persisted by a write that precedes the decision.
	if stored := fuelOf(h.stored(t, f.Id)); stored != h.reserve {
		t.Errorf("the settled figure was not PERSISTED before the decision: stored fuel = %v, want exactly "+
			"the reserve %v — \"that settled value is durably persisted by a write that precedes the "+
			"decision, not merely folded in memory for this one consumer\"", stored, h.reserve)
	}
}

// strandedAt computes the stranded indication the production path would
// produce for `f` holding exactly `fuelTons`, by running FuelStatus against a
// copy carrying that figure. Used to derive the expectation from the same
// code the assertion is about, so the test pins the SETTLED-vs-STALE choice
// rather than re-deriving reachability geometry.
func (h *holdStack) strandedAt(t *testing.T, f *Fleet, fuelTons float64) bool {
	t.Helper()
	copyF := *f
	copyF.Cargo = map[string]float64{"fuel": fuelTons}
	_, stranded, err := h.fsvc.FuelStatus(h.ctx, &copyF)
	if err != nil {
		t.Fatalf("computing the reference stranded indication at %v tons: %v", fuelTons, err)
	}
	return stranded
}

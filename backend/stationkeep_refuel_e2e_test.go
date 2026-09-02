package main

// RED-PHASE SDET e2e SUITE for openspec change add-stationkeep-hold-verb —
// the MID-HOLD MUTATION path, the one settlement event that leaves the hold
// OPEN and therefore restamps it.
//
// fleet-movement "Station-Keeping Upkeep Is Settled at Discrete Events, Never
// Folded Into the Stored Cargo Pool":
//   - "A refuel during an open hold settles the accrual, restamps the hold,
//     and recomputes the dry instant"   (task 7.6)
//
// fuel-purchase "One Atomic Transaction — Credit Debit and Fuel Credit":
//   - "A refuel into an open hold settles, credits, and restamps in the one
//     transaction"   (task 4.2)
//   - "A replayed refuel performs no second upkeep debit, restamp, or
//     recomputation"   (task 4.2)
//
// The reachability this rests on was itself a correction to an earlier draft:
// `hold` never alters `attachedTo`, and `fuel-purchase` requires only "docked
// to a station" — so "dock at a station, hold, refuel" is ordinary play, not a
// hypothetical.
//
// THE HALF-RESTAMP TRAP. "the two change only together" (space-kinematics,
// "A newly created station-keep park stores its start time and dry instant").
// A test asserting only that the hold-start moved passes against an
// implementation that leaves the dry instant fixed against the pre-refuel fuel
// baseline — the exact defect this bullet exists to close. A test asserting
// only that the dry instant moved passes against one that never restamps the
// start, so every later accrual runs from the original hold-start and
// double-charges. BOTH are asserted below.

import (
	"math"
	"net/http"
	"testing"

	"hexaverse/space"
)

// Scenario: A refuel during an open hold settles the accrual, restamps the
// hold, and recomputes the dry instant.
// Scenario: A refuel into an open hold settles, credits, and restamps in the
// one transaction.
func TestMidHoldMutation_Scenario_ARefuelDuringAnOpenHoldSettlesRestampsAndRecomputes(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Refuel During Hold Corp")
	setCorpCredits(t, sp.corpId, 1_000_000)
	startFuel := reserve + 20
	arriveInOrbitAround(t, router, sp, sp.stationId, startFuel)

	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	h0, d0 := holdWindow(t, sp.fleetId)
	window0 := d0 - h0
	if window0 < 5_000 {
		t.Skipf("this system's station-keep rate makes a %v-ton spendable hold only %d ms long; the scenario "+
			"needs a window long enough to refuel inside", startFuel-reserve, window0)
	}

	// Move the hold most of the way to its dry instant, leaving a 3-second
	// margin — comfortably longer than a refuel round trip, and short enough
	// that the pre-refuel (now stale) dry instant is easy to step past below.
	rewindHoldWindow(t, sp.fleetId, window0-3_000)
	h1Expected, _ := holdWindow(t, sp.fleetId)

	const refuelTons = 60.0
	if code, resp := refuel(t, router, sp.token, sp.fleetId, refuelTons, "sdet-refuel-mid-hold-1"); code != http.StatusOK {
		t.Fatalf("refuelling during an open hold: status = %d, body = %v", code, resp)
	}

	// (1) the hold is still open — a refuel is a mid-hold mutation "that
	//     leaves the hold open afterward", not a release.
	if got := storedParkKind(t, sp.fleetId); got != space.ParkStationkeep {
		t.Fatalf("fleet-movement \"A refuel during an open hold settles the accrual, restamps the hold, and "+
			"recomputes the dry instant\": the stored park kind is %v after the refuel, want the hold to "+
			"remain open (ParkStationkeep)", got)
	}
	h1, d1 := holdWindow(t, sp.fleetId)

	// (2) BOTH stamps moved, together. Asserting either alone passes against a
	//     half-restamp.
	if h1 <= h1Expected {
		t.Errorf("the HOLD-START was not restamped: stored holdStartMs = %d, still at or before the "+
			"pre-refuel %d. \"restamp the hold's stored start time to the mutation's own instant\" — without "+
			"it every later accrual runs from the original hold-start and double-charges the fuel the refuel "+
			"already settled.", h1, h1Expected)
	}
	if d1 <= d0-(window0-3_000) {
		t.Errorf("the DRY INSTANT was not recomputed: stored dryInstantMs = %d, still the rewound pre-refuel "+
			"%d. \"a hold's dry instant is fixed against a fuel baseline a later, independent mutation has "+
			"silently moved, and the automatic past-dry-instant fold would settle the wrong amount — up to "+
			"and including settling a just-purchased refuel down to the reserve the moment the stale dry "+
			"instant is next observed.\"", d1, d0-(window0-3_000))
	}
	if !(d1 > h1) {
		t.Fatalf("the recomputed window is holdStart=%d dryInstant=%d — the dry instant must remain strictly "+
			"after the hold start, and \"a refuel is a CREDIT, so the recomputed dry instant is necessarily "+
			"strictly after the restamped hold-start\"", h1, d1)
	}

	// (3) the accrual was settled and the refuel credited, in that order:
	//     "first debit upkeepTons(holdStartTime, mutationTime) ... then apply
	//     the mutation's own delta against the resulting balance".
	fuelAfter := fleetCargoFuel(t, sp.fleetId)
	if fuelAfter >= startFuel+refuelTons {
		t.Errorf("stored fuel after the mid-hold refuel = %v, want strictly less than %v (%v held + %v "+
			"credited) — the accrued upkeep must be DEBITED, not forgiven",
			fuelAfter, startFuel+refuelTons, startFuel, refuelTons)
	}
	if fuelAfter <= reserve {
		t.Errorf("stored fuel after the mid-hold refuel = %v, at or below the reserve %v — the settlement "+
			"over-charged; the accrual is bounded by the hold's spendable budget (%v)",
			fuelAfter, reserve, startFuel-reserve)
	}

	// (4) the recomputed window is proportional to the post-mutation SPENDABLE
	//     fuel, at the same body-derived upkeep rate — an assertion that needs
	//     no knowledge of that rate, since the ratio cancels it. The reserve
	//     subtraction appears on both sides, which is what makes a dropped
	//     reserve subtraction visible here rather than cancelling out.
	window1 := d1 - h1
	wantWindow1 := float64(window0) * (fuelAfter - reserve) / (startFuel - reserve)
	if rel := math.Abs(float64(window1)-wantWindow1) / wantWindow1; rel > 0.02 {
		t.Errorf("the recomputed dry-instant window = %d ms, want ~%.0f ms (the original %d ms scaled by the "+
			"post-refuel SPENDABLE fuel %v / the pre-hold spendable %v, at the same body-derived upkeep "+
			"rate) — the dry instant must be \"recompute[d] ... from the fuel level immediately after the "+
			"mutation\", against `fuelAtHoldStart − FuelParams.StationKeepReserveTons`",
			window1, wantWindow1, window0, fuelAfter-reserve, startFuel-reserve)
	}

	// (5) THE POINT OF THE SCENARIO: step past the pre-refuel (now stale) dry
	//     instant. An implementation that did not restamp still stores that
	//     stale instant, so this rewind puts it in the past and the next read
	//     settles the whole purchase down to the reserve. A correct
	//     implementation is nowhere near its recomputed instant and untouched.
	rewindHoldWindow(t, sp.fleetId, 4_000)
	typed, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("reading the fleet after stepping past the pre-refuel dry instant: status = %d", code)
	}
	if typed.State.Park == nil || typed.State.Park.Kind != space.ParkStationkeep {
		t.Fatalf("the hold was force-demoted past the STALE, pre-refuel dry instant (park = %+v) — a player "+
			"who holds, buys fuel, and drifts past the stale instant would lose the whole purchase, and the "+
			"credits spent on it, to the automatic fold", typed.State.Park)
	}
	if got := fleetCargoFuel(t, sp.fleetId); !almostEqual(got, fuelAfter, 1e-6) {
		t.Errorf("stored fuel after stepping past the stale dry instant = %v, want the untouched %v — \"the "+
			"refuel's full credited tonnage is never silently forfeited to a stale dry instant computed "+
			"against the pre-refuel fuel level\"", got, fuelAfter)
	}
}

// Scenario: A replayed refuel performs no second upkeep debit, restamp, or
// recomputation.
//
// "so a replay can neither charge upkeep twice nor silently extend the hold by
// re-stamping it at the replay's own instant."
func TestMidHoldMutation_Scenario_AReplayedRefuelPerformsNoSecondUpkeepDebitRestampOrRecomputation(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Replayed Refuel Into Hold Corp")
	setCorpCredits(t, sp.corpId, 1_000_000)
	arriveInOrbitAround(t, router, sp, sp.stationId, reserve+20)

	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	h0, d0 := holdWindow(t, sp.fleetId)
	if d0-h0 < 5_000 {
		t.Skipf("this system's station-keep rate makes the hold only %d ms long; the scenario needs a window "+
			"long enough to refuel twice inside", d0-h0)
	}
	rewindHoldWindow(t, sp.fleetId, (d0-h0)/2)

	const opKey = "sdet-refuel-replay-into-hold-1"
	if code, resp := refuel(t, router, sp.token, sp.fleetId, 30.0, opKey); code != http.StatusOK {
		t.Fatalf("first refuel: status = %d, body = %v", code, resp)
	}
	fuelAfterFirst := fleetCargoFuel(t, sp.fleetId)
	h1, d1 := holdWindow(t, sp.fleetId)
	creditsAfterFirst := corpCredits(t, sp.corpId)

	// The replay carries the SAME operation key for the SAME corporation.
	if code, resp := refuel(t, router, sp.token, sp.fleetId, 30.0, opKey); code != http.StatusOK {
		t.Fatalf("the replay was rejected (status = %d, body = %v), want the original settlement result "+
			"returned idempotently", code, resp)
	}

	if got := fleetCargoFuel(t, sp.fleetId); !almostEqual(got, fuelAfterFirst, 1e-9) {
		t.Errorf("fuel-purchase \"A replayed refuel performs no second upkeep debit, restamp, or "+
			"recomputation\": stored fuel = %v after the replay, want the unchanged %v — \"no second "+
			"accrued-upkeep debit\"; a replay must not charge upkeep twice", got, fuelAfterFirst)
	}
	h2, d2 := holdWindow(t, sp.fleetId)
	if h2 != h1 {
		t.Errorf("the replay RESTAMPED the hold's start time: %d -> %d, want it unchanged — \"no second "+
			"restamp of the hold's start time ... so a replay can[not] silently extend the hold by "+
			"re-stamping it at the replay's own instant\"", h1, h2)
	}
	if d2 != d1 {
		t.Errorf("the replay RECOMPUTED the dry instant: %d -> %d, want it unchanged — \"and no "+
			"recomputation of its dry instant\"", d1, d2)
	}
	if got := corpCredits(t, sp.corpId); got != creditsAfterFirst {
		t.Errorf("the replay charged the corporation again: credits %d -> %d, want unchanged",
			creditsAfterFirst, got)
	}
}

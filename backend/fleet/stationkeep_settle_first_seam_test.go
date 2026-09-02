package fleet

// RED-PHASE SDET SUITE for openspec change add-stationkeep-hold-verb —
// fleet-movement "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold
// First", the SEVENTH scenario:
//
//	"A hold whose dry instant passes between the settle-first write and the
//	 commit is rejected, never restamped"
//
// TASK 7.18. This test MUST FAIL against a build carrying tasks 4.8 and 4.9
// but not 4.10 — a build whose settle-first write correctly precedes the
// deciding transaction and is correctly conditional, but whose deciding
// transaction does not itself re-check the park against its OWN re-read.
//
// WHY THIS IS NOT A CONCURRENCY TEST. "That preceding write is necessary but
// not sufficient, because it is a *separate* transaction: it reads the fleet
// at one instant and the deciding transaction re-reads it at a later one, and
// the dry instant may fall in between — a Firestore round trip, and
// arbitrarily more *world* time under a scaled common.NewWorldTime(epoch,
// scale) clock." Under an injected clock that window is an ordinary clock
// advance at a seam. It needs no goroutines; it needs one injection point.
//
// WHAT WOULD MAKE THIS VACUOUS (task 7.18, verbatim):
//   - "advancing the clock BEFORE the settle-first write instead of between it
//     and the commit — the write then settles, the commit sees reserve-level
//     fuel, and an unguarded build rejects for the right reason by accident
//     (that is exactly task 7.15's fixture, not this one)". Here the clock
//     starts STRICTLY BEFORE the dry instant and is advanced only from inside
//     the seam hook, which fires after the settle write has completed. The
//     assertions below prove the settle write wrote nothing: the stored fuel
//     is still the whole pre-hold figure and the park is still `stationkeep`
//     with its ORIGINAL stamps. If the clock had advanced early, those
//     assertions fail rather than pass.
//   - "asserting on the response body rather than a re-read of the stored
//     fleet document". Every assertion below goes through h.stored().
//   - "using a single shared clock reading captured once per request, which
//     collapses the settle write's instant and the commit's re-read instant
//     into one and closes the very window this test exists to open". The
//     injected clock is read live; the hook moves it between the two
//     transactions, so a production implementation that captures one instant
//     per request evaluates the commit at the pre-advance instant and fails
//     the reason assertion below with a not-orbiting rejection.
//
// See stationkeep_testsupport_test.go for settleFirstSeamHook's pinned
// contract.

import (
	"context"
	"errors"
	"testing"

	"cloud.google.com/go/firestore"

	"hexaverse/common"
	"hexaverse/space"
)

// armSeam installs the settle-first seam hook for the duration of one call,
// advancing the injected world clock to `to` the first time the hook fires
// for `fleetId`, and reports whether it fired at all.
func (h *holdStack) armSeam(t *testing.T, fleetId string, to common.WorldMillis) func() bool {
	t.Helper()
	fired := false
	settleFirstSeamHook = func(id string) {
		if id != fleetId || fired {
			return
		}
		fired = true
		h.clk.now = to
	}
	t.Cleanup(func() { settleFirstSeamHook = nil })
	return func() bool { return fired }
}

// Scenario: A hold whose dry instant passes between the settle-first write and
// the commit is rejected, never restamped. (`hold`'s own commit transaction —
// the third of the three abortable transactions task 4.8 names.)
func TestSettleFirstSeam_Scenario_AHoldWhoseDryInstantPassesBetweenTheSettleWriteAndTheCommitIsRejectedNeverRestamped(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-seam-hold", fuel)

	held, err := h.fsvc.Hold(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("arranging the first hold: %v", err)
	}
	firstPark := *held.State.Park

	// GIVEN: the stored dry instant has NOT yet passed at the instant the
	// preceding, independent settlement write re-reads it, so that write
	// correctly persists nothing.
	h.clk.now = firstPark.DryInstantMs - 1_000
	// WHEN: that dry instant passes before `hold`'s own commit transaction
	// performs its re-read.
	fired := h.armSeam(t, f.Id, firstPark.DryInstantMs+5_000)

	_, err = h.fsvc.Hold(h.ctx, f.Id)

	if !fired() {
		t.Fatalf("the settle-first seam hook never fired for %q. settleFirstSeamHook is the SDET-pinned "+
			"injection point task 7.18 authorises (\"a hook after the settle write\"): every consumer that "+
			"performs the preceding, independent settle-first write must invoke it after that write's own "+
			"transaction completes and before the deciding transaction opens. Without it the window between "+
			"the two transactions is unreachable from a test, and a `hold` re-issued once per dry instant is "+
			"restamped from the stale figure forever.", f.Id)
	}

	// THEN: "the commit aborts on that re-read instead of evaluating its
	// preconditions against the stale figure, and is rejected 409 Conflict
	// carrying the insufficient-fuel reason."
	if err == nil {
		t.Fatalf("fleet-movement \"A hold whose dry instant passes between the settle-first write and the "+
			"commit is rejected, never restamped\": the second `hold` SUCCEEDED. Its commit's re-read found a "+
			"`stationkeep` park at or after its stored dry instant — folding to `orbit`, so the not-orbiting "+
			"precondition passed — alongside a stored cargo.fuel still showing the whole pre-hold figure "+
			"(%v tons). The commit must abort on that re-read (task 4.10), applying none of its own effects.",
			fuel)
	}
	if errors.Is(err, ErrNotOrbiting) {
		t.Fatalf("the rejection is the NOT-ORBITING reason (%v), not the insufficient-fuel one. That is what a "+
			"single clock reading captured once per request produces: the commit evaluated at the "+
			"pre-advance instant, where the park is still a live `stationkeep`, and the window this scenario "+
			"exists to open never opened. `hold` must surface the aborted re-read \"as its insufficient-fuel "+
			"rejection (the settled figure being exactly FuelParams.StationKeepReserveTons by construction, "+
			"so no hold is affordable)\".", err)
	}
	if !errors.Is(err, ErrHoldWithoutFuel) {
		t.Errorf("rejection = %v, want ErrHoldWithoutFuel — \"`hold` surfaces that abort as its "+
			"insufficient-fuel rejection\"", err)
	}

	// AND: "no second `stationkeep` park is stored, no hold-start time or dry
	// instant is restamped, and the elapsed hold's accrued upkeep is never
	// forgiven." Asserted against the STORED document.
	stored := h.stored(t, f.Id)
	if stored.State.Park == nil {
		t.Fatalf("the fleet has no stored park after the aborted commit: %+v", stored.State)
	}
	if stored.State.Park.Kind != space.ParkStationkeep {
		t.Fatalf("stored park kind = %v, want the UNTOUCHED ParkStationkeep. The commit aborted, and the "+
			"preceding settlement write correctly wrote nothing (it re-read a not-yet-expired park), so the "+
			"stored park must be exactly what the first hold left. Park = %+v",
			stored.State.Park.Kind, *stored.State.Park)
	}
	if stored.State.Park.HoldStartMs != firstPark.HoldStartMs ||
		stored.State.Park.DryInstantMs != firstPark.DryInstantMs {
		t.Errorf("the hold was RESTAMPED: stored window (holdStart=%d dryInstant=%d), want the ORIGINAL "+
			"(holdStart=%d dryInstant=%d). \"a `hold` re-issued once after each dry instant lands in that "+
			"window, passes both preconditions against the stale figure, and is restamped with a fresh dry "+
			"instant computed from it, forgiving the whole accrued upkeep and skipping the force-demotion, so "+
			"a position is held forever for the fuel of a single hold.\"",
			stored.State.Park.HoldStartMs, stored.State.Park.DryInstantMs,
			firstPark.HoldStartMs, firstPark.DryInstantMs)
	}
	if got := fuelOf(stored); got != fuel {
		t.Errorf("stored fuel after the aborted commit = %v, want the unchanged %v — the commit applies NONE "+
			"of its own effects, and the preceding settlement write, re-reading a not-yet-expired park, "+
			"writes nothing at all. A value of %v (the reserve) means the clock advanced BEFORE the settle "+
			"write rather than between it and the commit, which is task 7.15's fixture, not this one.",
			got, fuel, h.reserve)
	}

	// AND: "a subsequent call then settles it to exactly the reserve."
	settleFirstSeamHook = nil
	if _, err := h.fsvc.Hold(h.ctx, f.Id); !errors.Is(err, ErrHoldWithoutFuel) {
		t.Errorf("the follow-up hold returned %v, want ErrHoldWithoutFuel against the now-settled fleet", err)
	}
	after := h.stored(t, f.Id)
	if got := fuelOf(after); got != h.reserve {
		t.Errorf("after a subsequent call the stored fuel = %v, want exactly the reserve %v — \"the retry "+
			"issues a fresh preceding settlement write that now observes the past dry instant and settles "+
			"it\"", got, h.reserve)
	}
	if after.State.Park == nil || after.State.Park.Kind != space.ParkOrbit {
		t.Errorf("after a subsequent call the stored park = %+v, want the released orbit", after.State.Park)
	}
}

// Scenario (same requirement, the burn-commit third of its final AND clause):
// "a burn commit ... whose own transactional re-read meets the same condition
// applies NONE of its own effects — no burn cost is debited from ... the stale
// figure — failing retryably".
func TestSettleFirstSeam_Scenario_ABurnCommitInTheSameWindowAppliesNoneOfItsOwnEffects(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-seam-burn", fuel)

	held, err := h.fsvc.Hold(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("arranging the hold: %v", err)
	}
	firstPark := *held.State.Park

	h.clk.now = firstPark.DryInstantMs - 1_000
	fired := h.armSeam(t, f.Id, firstPark.DryInstantMs+5_000)

	target := h.farPoint()
	_, err = h.fsvc.OrderTo(h.ctx, f.Id, OrderRequest{Point: &target})

	if !fired() {
		t.Fatalf("the settle-first seam hook never fired during the burn commit — the burn commit is one of " +
			"the three abortable transactions task 4.8 names, so it too performs a preceding, independent " +
			"settle-first write and must invoke the hook after it")
	}
	if err == nil {
		t.Fatalf("the burn commit SUCCEEDED against a re-read showing a `stationkeep` park at or after its "+
			"stored dry instant alongside a stale cargo.fuel of %v tons. \"the burn commit debits its cost "+
			"from the stale figure — a burn paid for with fuel already spent on upkeep\". It must abort, "+
			"applying none of its own effects, and fail retryably.", fuel)
	}

	stored := h.stored(t, f.Id)
	if got := fuelOf(stored); got != fuel {
		t.Errorf("stored fuel after the aborted burn commit = %v, want the unchanged %v — \"no burn cost is "+
			"debited from ... the stale figure\"", got, fuel)
	}
	if stored.State.Mode == space.ModeBurn {
		t.Errorf("a burn was STORED by the aborted commit (%+v) — it must apply NONE of its own effects",
			stored.State.Burn)
	}
	if stored.ActiveActionId != "" {
		t.Errorf("the aborted burn commit claimed the movement channel's slot (activeActionId=%q) — no action "+
			"is created", stored.ActiveActionId)
	}
	if stored.State.Park == nil || stored.State.Park.Kind != space.ParkStationkeep ||
		stored.State.Park.HoldStartMs != firstPark.HoldStartMs ||
		stored.State.Park.DryInstantMs != firstPark.DryInstantMs {
		t.Errorf("the stored park changed: %+v, want the untouched original %+v", stored.State.Park, firstPark)
	}
}

// Scenario (same requirement, the refuel third of its final AND clause): "no
// purchased tonnage is credited onto[] the stale figure".
//
// Driven against the exact seam task 4.10 names for refuel — the
// transaction-scoped free-hold re-evaluation inside refuel's own settlement
// transaction (fleet/cargo_tx.go's PrepareFuelCreditInTx, which the refuel
// package calls through fleet.Service). Testing the producer directly rather
// than through the refuel package is what makes the world instant of the
// deciding transaction controllable: `refuel` lives above `fleet` in the
// import graph, so this package cannot drive it, and the process-wide clock
// the HTTP suite runs on cannot be moved between two transactions of one
// request.
func TestSettleFirstSeam_Scenario_ARefuelsTransactionScopedProducerInTheSameWindowCreditsNothing(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-seam-refuel", fuel)

	held, err := h.fsvc.Hold(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("arranging the hold: %v", err)
	}
	firstPark := *held.State.Park

	// The deciding transaction re-reads at an instant at or after the stored
	// dry instant, while the stored park is still an unfolded `stationkeep`
	// one and cargo.fuel still over-reports by the whole accrual — exactly
	// the window the preceding settlement write cannot close.
	h.clk.now = firstPark.DryInstantMs + 5_000

	const credit = 25.0
	var producerErr error
	txErr := h.client.RunTransaction(context.Background(), func(ctx context.Context, tx *firestore.Transaction) error {
		plan, err := h.fsvc.PrepareFuelCreditInTx(ctx, tx, f.Id, credit)
		if err != nil {
			producerErr = err
			return err
		}
		return plan.Apply(tx)
	})

	if producerErr == nil && txErr == nil {
		t.Fatalf("fleet-movement \"Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First\": the "+
			"transaction-scoped fuel-credit producer SUCCEEDED against a re-read showing a `stationkeep` park "+
			"at or after its stored dry instant (%d, re-read at %d) alongside a stale cargo.fuel of %v tons. "+
			"\"a refuel credits its purchased tonnage onto un-settled fuel, so the next reader's fold sets "+
			"cargo.fuel to exactly the reserve and destroys both the purchased tonnage and the credits spent "+
			"on it.\" Each of the three abortable transactions SHALL verify, against its OWN transactional "+
			"re-read, that no such park remains, and abort applying none of its own effects (task 4.10).",
			firstPark.DryInstantMs, h.clk.Now(), fuel)
	}

	stored := h.stored(t, f.Id)
	if got := fuelOf(stored); got != fuel {
		t.Errorf("stored fuel after the aborted credit = %v, want the unchanged %v — the transaction applies "+
			"NONE of its own effects (\"no purchased tonnage is credited onto[] the stale figure\")",
			got, fuel)
	}
	if stored.State.Park == nil || stored.State.Park.Kind != space.ParkStationkeep ||
		stored.State.Park.HoldStartMs != firstPark.HoldStartMs ||
		stored.State.Park.DryInstantMs != firstPark.DryInstantMs {
		t.Errorf("the stored park changed: %+v, want the untouched original %+v — an aborted decision neither "+
			"settles nor restamps", stored.State.Park, firstPark)
	}
}

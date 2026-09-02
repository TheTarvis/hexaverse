package fleet

// SDET SUITE for openspec change add-stationkeep-hold-verb, TASK 7.19 — the
// two scenarios nothing covered:
//
//   - fleet-movement "Station-Keeping Upkeep Is Settled at Discrete Events,
//     Never Folded Into the Stored Cargo Pool":
//     "A jump against a past-dry-instant hold settles it in the jump's own
//     transaction"
//   - same requirement:
//     "A rejected jump leaves a past-dry-instant hold open and unsettled for
//     the next reader"
//
// THE RULING THESE ENCODE (the requirement's universal hold-ending bullet):
// for `jump` and `stop` the past-dry-instant settlement "SHALL be carried by
// the verb's own hold-ending transaction ... and SHALL NOT be hoisted into a
// preceding, independent write. `jump` and `stop` are today's two such verbs;
// they are deliberately ABSENT from the consumers 'Every Decision Reading
// Fuel Settles a Past-Dry-Instant Hold First' enumerates, and SHALL NOT be
// added to them." And if such a verb's transaction aborts, "then NO HOLD WAS
// ENDED: the fleet is still station-keeping, still at or past its stored dry
// instant, and the next fuel-reading consumer settles it by the ordinary
// rule."
//
// WHY THESE LIVE AT THE SERVICE LEVEL AND NOT IN backend/stationkeep_*_e2e:
// task 7.19 asks for a "backend INTEGRATION test" and names the vacuity trap
// as "any setup step that OBSERVES the park between the clock advance and the
// jump (a GET /v1/fleets/:id, a FreeHold consumer), which pre-settles the
// fleet and makes both halves pass regardless". Through the HTTP surface that
// observation is unavoidable and is not a setup step at all: every fleet
// COMMAND route resolves its id through `Handler.commandedFleetId`
// (fleet/handler.go:150), whose ownership check calls `Service.Get`, and
// `Service.Get` runs `settleExpiredHoldFirst` — a legitimate, enumerated
// consumer, but one that settles the hold before `Service.Jump` is ever
// entered. The property under test ("carried by the JUMP's own transaction,
// never by a preceding independent write") is therefore only stateable below
// that read, which is exactly the level this file drives: the real
// `Service.Jump`, the real action spine, the real DAO, against the real
// Firestore emulator.
//
// NOTHING HERE OBSERVES THE PARK BETWEEN THE CLOCK ADVANCE AND THE JUMP.
// `h.stored` is a raw `dao.Get` — a pure read that folds nothing and settles
// nothing (its own doc comment says so) — and the clock is advanced by
// assignment on the injected fake, never by a service call. The one
// assertion made before each jump is that the STORED park is still an
// unsettled `stationkeep` one; if any of this setup had pre-settled it, that
// assertion fails by name instead of letting the test pass for the wrong
// reason.

import (
	"errors"
	"testing"

	"hexaverse/action"
	"hexaverse/space"
)

// jumpReadyHoldStack builds the stack and registers the jump resolver
// action.Commit dispatches on (newHoldStack registers only burnType, since
// every other scenario in this suite is movement-free). Skips, loudly, when
// the seeded origin system has no incident lane to jump down.
func jumpReadyHoldStack(t *testing.T) *holdStack {
	t.Helper()
	h := newHoldStack(t)
	if h.gateId == "" || h.laneId == "" {
		t.Skipf("test-environment issue, not the behaviour under test: the seeded origin system %s has no "+
			"incident lane whose gate body is in the body table, so there is no jump to commit", h.home)
	}
	h.asvc.RegisterResolver(jumpType, action.KindKinematic, JumpResolver)
	return h
}

// requireUnsettledPastDryHold is the anti-vacuity guard both halves run
// immediately before their jump: the stored park must STILL be the
// `stationkeep` one, with its ORIGINAL stamps and its PRE-FOLD fuel, and the
// clock must already be at or past its dry instant. Returns the stored park.
func requireUnsettledPastDryHold(t *testing.T, h *holdStack, id string, wantFuel float64) space.Park {
	t.Helper()
	stored := h.stored(t, id)
	if stored.State.Park == nil || stored.State.Park.Kind != space.ParkStationkeep {
		t.Fatalf("fixture invariant (task 7.19's own vacuity trap): the stored park is %+v, want a still-"+
			"unsettled ParkStationkeep. Something between the hold and the clock advance OBSERVED the park "+
			"and pre-settled it, which \"makes both halves pass regardless\".", stored.State.Park)
	}
	if !(h.clk.Now() >= stored.State.Park.DryInstantMs) {
		t.Fatalf("fixture invariant: the clock is at %d but the stored dry instant is %d — this fixture must "+
			"be at or PAST the dry instant", h.clk.Now(), stored.State.Park.DryInstantMs)
	}
	if got := fuelOf(stored); got != wantFuel {
		t.Fatalf("fixture invariant: the stored fuel is %v, want the untouched pre-fold figure %v — a "+
			"settlement has already run", got, wantFuel)
	}
	return *stored.State.Park
}

// Scenario: A jump against a past-dry-instant hold settles it in the jump's
// own transaction.
func TestJumpPastDryHold_Scenario_AJumpAgainstAPastDryInstantHoldSettlesItInTheJumpsOwnTransaction(t *testing.T) {
	h := jumpReadyHoldStack(t)

	// Held AT the lane's own gate body, so the jump is eligible: `hold` never
	// alters `attachedTo` (fleet-movement "A fleet's attachment survives
	// hold, release, and force-demotion"), so the fleet is still attached to
	// the gate when the jump arrives.
	startFuel := h.reserve + 1_000
	f := h.orbitingFleetAround(t, "sdet-jump-past-dry", h.gateId, startFuel)
	held := h.holdOrFail(t, f.Id)

	// Advance world time PAST the stored dry instant with no read or write
	// observing the park in between — the fake clock is assigned directly.
	h.clk.now = held.DryInstantMs + 5_000
	stored := requireUnsettledPastDryHold(t, h, f.Id, startFuel)

	jumped, err := h.fsvc.Jump(h.ctx, f.Id, h.laneId)
	if err != nil {
		t.Fatalf("fleet-movement \"A jump against a past-dry-instant hold settles it in the jump's own "+
			"transaction\": the jump was REJECTED (%v). A past-dry-instant hold IS the released orbit by the "+
			"automatic fold, at the gate the fleet is still attached to, so nothing about it makes this jump "+
			"ineligible.", err)
	}
	if jumped == nil || jumped.Jump == nil {
		t.Fatalf("the jump returned %+v with no transit — nothing to assert the settlement against", jumped)
	}

	// EVERY assertion below is against a re-read of the STORED fleet
	// document, never the returned struct: "asserting on the response body
	// rather than a re-read of the stored fleet document" is the second
	// vacuity trap task 7.19 names, and it passes against an in-memory-only
	// settlement.
	after := h.stored(t, f.Id)

	// "with `cargo.fuel` persisted at exactly FuelParams.StationKeepReserveTons",
	// "AND no `upkeepTons` hold-ending debit is applied on top of that fold,
	// so the accrual is charged exactly once".
	//
	// The exact-equality assertion is what pins CHARGED ONCE: the two ways to
	// get this wrong both miss the reserve by a wide, named margin. Both are
	// computed here so a regression reports which arithmetic ran, rather than
	// just "not equal".
	gateRate, rerr := space.StationKeepRate(h.bt, stored.BodyId)
	if rerr != nil {
		t.Fatalf("resolving the held gate's upkeep rate for the diagnosis: %v", rerr)
	}
	accrualToNow := wantUpkeepTons(gateRate, stored.HoldStartMs, h.clk.Now(), h.params)
	doubleCharged := h.reserve - accrualToNow // the fold, then a second upkeepTons debit stacked on top
	forgiven := startFuel                     // no settlement carried at all
	if got := fuelOf(after); got != h.reserve {
		t.Errorf("fleet-movement \"A jump against a past-dry-instant hold settles it in the jump's own "+
			"transaction\": the stored fuel is %v, want EXACTLY the configured station-keeping reserve %v.\n"+
			"  %v would be the reserve MINUS a second upkeepTons debit (%v) stacked on top of the fold — "+
			"\"the fold has already priced the whole hold ... and charging both would debit one accrual "+
			"twice\".\n  %v would be the hold forgiven entirely, no settlement carried at all.\n"+
			"The past-dry-instant fold prices the whole hold to the reserve, exactly once.",
			got, h.reserve, doubleCharged, accrualToNow, forgiven)
	}
	if got := fuelOf(after); got < h.reserve {
		t.Errorf("the stored fuel is %v, BELOW the reserve %v — \"An exhausted hold leaves exactly the "+
			"reserve, never zero\", and no hold-ending verb may take a fleet under it", got, h.reserve)
	}

	// "the fold to the released orbit"
	if after.State.Park == nil || after.State.Park.Kind != space.ParkOrbit {
		t.Errorf("the stored park is %+v, want the RELEASED `orbit` park space.ReleaseStationkeep produces at "+
			"the stored dry instant — the hold must not survive the jump", after.State.Park)
	}
	if after.State.Park != nil && after.State.Park.Kind == space.ParkStationkeep {
		t.Errorf("the `stationkeep` park survived the jump, so no settlement was carried at all")
	}
	if after.State.Park != nil {
		if after.State.Park.HoldStartMs != 0 || after.State.Park.DryInstantMs != 0 {
			t.Errorf("the released park still carries hold stamps (holdStart=%d dryInstant=%d) — a released "+
				"orbit park is not a hold and carries neither", after.State.Park.HoldStartMs,
				after.State.Park.DryInstantMs)
		}
		if after.State.Park.BodyId != h.gateId {
			t.Errorf("the released park's host is %q, want the gate %q it was holding beside",
				after.State.Park.BodyId, h.gateId)
		}
	}

	// The jump's own effect landed in that same document — which is what
	// makes "the settlement is carried by the JUMP's commit" observable at
	// all: one stored document carries both the settled fuel and the transit.
	if after.Jump == nil {
		t.Errorf("the stored fleet carries no jump transit after a successful jump: %+v", after)
	}
	// "and the jump itself still costs no delta-v" — the ONLY debit is the
	// hold's accrual, which the fold already priced to the reserve. Asserted
	// as the exact reserve above; restated here as the spec's own framing.
	if got := fuelOf(after); got != h.reserve {
		t.Errorf("\"the jump itself still costs no delta-v\": the stored fuel is %v, not the reserve %v — a "+
			"jump-priced debit has been stacked on the hold's settlement", got, h.reserve)
	}
}

// Scenario: A rejected jump leaves a past-dry-instant hold open and unsettled
// for the next reader.
//
// THIS HALF IS WHAT PINS "the jump's OWN transaction, not a preceding
// independent write". A hoisted settlement is invisible on the success path —
// both orders of writes leave the same final document — but it is loud here:
// a preceding independent write survives its verb's rejection, so a hoisted
// settlement would leave this fleet settled even though NO HOLD WAS ENDED.
func TestJumpPastDryHold_Scenario_ARejectedJumpLeavesAPastDryInstantHoldOpenAndUnsettledForTheNextReader(t *testing.T) {
	h := jumpReadyHoldStack(t)

	// Holding beside an ORDINARY body, not the lane's gate — so this jump is
	// rejected by `Service.Jump`'s own eligibility gate
	// (`f.AttachedTo != "gate-"+destId` => ErrJumpNotAttached), which is the
	// first rejection the scenario names: "it is not attached to the named
	// lane's own gate body".
	startFuel := h.reserve + 1_000
	f := h.orbitingFleet(t, "sdet-jump-rejected-past-dry", startFuel)
	held := h.holdOrFail(t, f.Id)

	h.clk.now = held.DryInstantMs + 5_000
	before := requireUnsettledPastDryHold(t, h, f.Id, startFuel)

	_, err := h.fsvc.Jump(h.ctx, f.Id, h.laneId)
	if err == nil {
		t.Fatalf("fixture invariant: the jump SUCCEEDED from a fleet attached to %q rather than the lane's "+
			"gate — this scenario needs a REJECTED jump, and this arrangement no longer produces one",
			h.bodyId)
	}
	if !errors.Is(err, ErrJumpNotAttached) {
		t.Fatalf("fixture invariant: the jump was rejected with %v, want ErrJumpNotAttached — the scenario is "+
			"about a jump rejected for not being attached to the named lane's own gate body, and a rejection "+
			"from somewhere else may abort at a different point and prove nothing about the settlement", err)
	}

	// "THEN the fleet's stored park is still that unsettled `stationkeep`
	// park and its stored `cargo.fuel` still shows the pre-fold figure, no
	// hold having been ended."
	after := h.stored(t, f.Id)
	if after.State.Park == nil || after.State.Park.Kind != space.ParkStationkeep {
		t.Fatalf("fleet-movement \"A rejected jump leaves a past-dry-instant hold open and unsettled for the "+
			"next reader\": the stored park is %+v after the REJECTED jump, want the untouched "+
			"ParkStationkeep. \"If such a verb's transaction aborts ... then NO HOLD WAS ENDED: the fleet is "+
			"still station-keeping, still at or past its stored dry instant.\" A settled park here means the "+
			"settlement was hoisted into a preceding, INDEPENDENT write, which this requirement forbids for "+
			"`jump`: it \"would buy nothing and would add one more unserialized cargo.fuel writer\".",
			after.State.Park)
	}
	if after.State.Park.HoldStartMs != before.HoldStartMs || after.State.Park.DryInstantMs != before.DryInstantMs {
		t.Errorf("the surviving hold's stamps changed across the rejected jump: holdStart %d -> %d, "+
			"dryInstant %d -> %d. A rejected verb ends no hold, so it restamps nothing.",
			before.HoldStartMs, after.State.Park.HoldStartMs, before.DryInstantMs, after.State.Park.DryInstantMs)
	}
	if got := fuelOf(after); got != startFuel {
		t.Errorf("the stored fuel is %v after the rejected jump, want the untouched PRE-FOLD figure %v — "+
			"\"its stored `cargo.fuel` still shows the pre-fold figure, no hold having been ended\"",
			got, startFuel)
	}
	if after.Jump != nil {
		t.Errorf("the rejected jump stored a transit anyway (%+v) — \"its transaction applies NONE of its "+
			"effects\"", after.Jump)
	}

	// "AND the next consumer that reads that fleet's fuel settles it by the
	// ordinary past-dry-instant rule, to exactly the configured
	// station-keeping reserve — nothing is forgiven and nothing is lost by
	// the abort." Service.Get is one of the enumerated consumers ("Every
	// Decision Reading Fuel Settles a Past-Dry-Instant Hold First"): its
	// FreeHold, estimated range and stranded indication all read cargo.fuel.
	if _, err := h.fsvc.Get(h.ctx, f.Id); err != nil {
		t.Fatalf("the next fuel-reading consumer failed: %v", err)
	}
	healed := h.stored(t, f.Id)
	if got := fuelOf(healed); got != h.reserve {
		t.Errorf("after the next fuel-reading consumer the stored fuel is %v, want EXACTLY the reserve %v — "+
			"\"nothing is forgiven and nothing is lost by the abort\", and the ordinary past-dry-instant rule "+
			"settles to exactly the configured station-keeping reserve", got, h.reserve)
	}
	if healed.State.Park == nil || healed.State.Park.Kind != space.ParkOrbit {
		t.Errorf("after the next fuel-reading consumer the stored park is %+v, want the released `orbit` "+
			"park — the hold must be settled DURABLY, not folded in memory only", healed.State.Park)
	}
}

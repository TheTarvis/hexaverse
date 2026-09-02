package fleet

// RED-PHASE SDET SUITE for openspec change add-stationkeep-hold-verb —
// the ORDERED PRECONDITION SEQUENCE both verbs run before evaluating any of
// their own state preconditions:
//
//	  lane transit  →  a due-but-unresolved BURN  →  an elapsed hold  →  the
//	  verb's own state and fuel preconditions
//
// fleet-movement "Station-Keeping Hold and Release Are Fleet Verbs":
//   - "Holding or releasing a fleet in lane transit is rejected by name"
//   - "Holding or releasing over a completed-but-unresolved movement order
//     settles it first"
//   - "Holding over a silently expired hold settles it first and is then
//     rejected"
//
// and "Station-Keeping Upkeep Never Drains a Fleet Below Its Reserve":
//   - "The reserve is never spent by upkeep across repeated hold cycles"
//
// See stationkeep_testsupport_test.go for the assumed API contract.

import (
	"context"
	"errors"
	"testing"

	"hexaverse/charts"
	"hexaverse/space"
)

// --- step 1: lane transit ---------------------------------------------------

// Scenario: Holding or releasing a fleet in lane transit is rejected by name.
//
// "THEN the response is `409 Conflict` carrying this capability's existing
// lane-transit reason, the fleet's stored kinematic state is never evaluated
// to reach that rejection, and neither the fleet's stored state nor its
// `fuel` cargo is mutated."
//
// The "never evaluated" clause is what the fixture is built for: the stored
// park is anchored to a body that is not in the system's body table, so an
// implementation that folds before checking `Jump` surfaces
// space.ErrUnknownBody instead of the lane-transit reason.
func TestHoldRelease_Scenario_HoldingOrReleasingAFleetInLaneTransitIsRejectedByName(t *testing.T) {
	h := newHoldStack(t)

	verbs := map[string]func(context.Context, string) (*Fleet, error){
		"hold":    h.fsvc.Hold,
		"release": h.fsvc.Release,
	}
	for name, verb := range verbs {
		t.Run("Scenario: Holding or releasing a fleet in lane transit is rejected by name ("+name+")", func(t *testing.T) {
			id := "sdet-transit-" + name
			h.inTransitFleet(t, id)
			before := h.stored(t, id)

			_, err := verb(h.ctx, id)
			if err == nil {
				t.Fatalf("%s against a fleet in lane transit SUCCEEDED, want the lane-transit rejection", name)
			}
			if errors.Is(err, space.ErrUnknownBody) {
				t.Fatalf("fleet-movement \"Holding or releasing a fleet in lane transit is rejected by name\": "+
					"%s returned space.ErrUnknownBody (%v). That is only reachable by EVALUATING the fleet's "+
					"stale stored kinematic state, which this capability forbids for a transiting fleet: \"a "+
					"fleet in transit has no position in either system and its stale stored state SHALL NOT be "+
					"evaluated by any reader\". The lane-transit rejection must come FIRST, \"before any "+
					"evaluation of the fleet's stored kinematic state\".", name, err)
			}
			if !errors.Is(err, ErrFleetInTransit) {
				t.Errorf("%s rejection = %v, want ErrFleetInTransit — the `respond` switch already maps it to "+
					"409 with \"this capability's existing lane-transit reason, the same reason a jump or a "+
					"burn order against a transiting fleet already carries\"", name, err)
			}

			after := h.stored(t, id)
			if after.State.Mode != before.State.Mode {
				t.Errorf("the rejected %s mutated the stored kinematic mode: %v -> %v",
					name, before.State.Mode, after.State.Mode)
			}
			if before.State.Park != nil && after.State.Park != nil && *before.State.Park != *after.State.Park {
				t.Errorf("the rejected %s mutated the stored park:\n  before = %+v\n  after  = %+v",
					name, *before.State.Park, *after.State.Park)
			}
			if fuelOf(after) != fuelOf(before) {
				t.Errorf("the rejected %s mutated the fleet's fuel cargo: %v -> %v — \"neither the fleet's "+
					"stored state nor its `fuel` cargo is mutated\"", name, fuelOf(before), fuelOf(after))
			}
		})
	}
}

// --- step 2: a due-but-unresolved burn -------------------------------------

// Scenario: Holding or releasing over a completed-but-unresolved movement
// order settles it first.
//
// "THEN that burn's action is resolved first — settled, its slot released,
// and its exactly-once arrival effects (the fleet's `attachedTo`, and any
// gate-lane charting) applied — and only then are the verb's own
// preconditions evaluated, against the resulting settled state."
//
// TASK 3.12 IS EXPLICIT ABOUT THE VACUITY TRAP: "Assert those effects are
// applied, not merely that the hold survives." A body-targeted burn past its
// arrival already folds to a ParkOrbit through space.StateAt, so an
// unresolved arrival passes `hold`'s orbit-mode precondition on its own;
// `BurnResolver`'s already-settled early return then applies NONE of the
// arrival's effects. A test that asserted only "the hold exists" would pass
// against exactly that defect. So: the target is a lane GATE, and the test
// asserts `attachedTo` AND the charted-lane document the arrival is supposed
// to write.
func TestHoldRelease_Scenario_HoldingOrReleasingOverACompletedButUnresolvedMovementOrderSettlesItFirst(t *testing.T) {
	h := newHoldStack(t)
	if h.gateId == "" {
		t.Skip("origin system generated no lane gate; the gate-lane charting half of this scenario is unreachable")
	}

	t.Run("Scenario: Holding or releasing over a completed-but-unresolved movement order settles it first (hold)", func(t *testing.T) {
		h.assertArrivalEffectsSettledFirst(t, "sdet-settle-due-hold", func(id string) error {
			_, err := h.fsvc.Hold(h.ctx, id)
			return err
		}, nil)
	})
	t.Run("Scenario: Holding or releasing over a completed-but-unresolved movement order settles it first (release)", func(t *testing.T) {
		// `release` against the resulting settled state is itself rejected —
		// the settled state is an `orbit` park, not a `stationkeep` one. The
		// scenario's THEN is about the ARRIVAL's effects, which must land
		// regardless of how the verb's own preconditions then evaluate.
		h.assertArrivalEffectsSettledFirst(t, "sdet-settle-due-release", func(id string) error {
			_, err := h.fsvc.Release(h.ctx, id)
			return err
		}, ErrNotStationKeeping)
	})
}

// assertArrivalEffectsSettledFirst flies a fleet to a real lane gate, lets its
// arrival time pass with the action still `running`, then invokes the verb and
// asserts the arrival's exactly-once effects landed. wantVerbErr is the
// rejection the verb's OWN preconditions then produce (nil = the verb must
// succeed).
func (h *holdStack) assertArrivalEffectsSettledFirst(t *testing.T, id string, verb func(string) error, wantVerbErr error) {
	t.Helper()
	f := h.orbitingFleet(t, id, h.reserve+1_000_000)

	ordered, err := h.fsvc.OrderTo(h.ctx, f.Id, OrderRequest{BodyId: h.gateId})
	if err != nil {
		t.Fatalf("arranging a burn to the lane gate %q: %v", h.gateId, err)
	}
	if ordered.State.Burn == nil {
		t.Fatalf("the order produced no burn: %+v", ordered.State)
	}
	arriveMs := ordered.State.Burn.ArriveMs

	// The arrival time passes with the action still `running` and no reader
	// having settled it — exactly the state the scenario names.
	h.clk.now = arriveMs + 1
	pre := h.stored(t, f.Id)
	if pre.ActiveActionId == "" {
		t.Fatalf("fixture invariant: the burn's action slot must still be claimed at this point")
	}
	if pre.AttachedTo != "" {
		t.Fatalf("fixture invariant: attachedTo must still be empty (the arrival is unresolved), got %q",
			pre.AttachedTo)
	}

	err = verb(f.Id)
	switch {
	case wantVerbErr == nil && err != nil:
		t.Fatalf("the verb returned %v, want success against the settled state", err)
	case wantVerbErr != nil && !errors.Is(err, wantVerbErr):
		t.Fatalf("the verb returned %v, want %v against the settled state", err, wantVerbErr)
	}

	stored := h.stored(t, f.Id)
	if stored.AttachedTo != h.gateId {
		t.Errorf("fleet-movement \"Holding or releasing over a completed-but-unresolved movement order "+
			"settles it first\": attachedTo = %q after the verb, want the arrived-at gate %q. The arrival's "+
			"exactly-once effects were DROPPED: a body-targeted burn past its arrival folds to a ParkOrbit, "+
			"so the verb's own precondition passes while the movement slot is still claimed, and "+
			"BurnResolver's already-settled early return then applies none of them — \"leaving a fleet "+
			"holding a fixed offset from a host body it is not attached to, with the arrival's effects "+
			"permanently dropped\".", stored.AttachedTo, h.gateId)
	}
	if stored.ActiveActionId != "" {
		t.Errorf("the movement channel's slot is still claimed (activeActionId=%q) after the verb — the due "+
			"burn's action must be \"settled, its slot released\"", stored.ActiveActionId)
	}

	// The gate-lane charting half, asserted against the REAL writer's own
	// output so the expectation cannot drift from what production emits.
	want := charts.GateAttachmentWrite(f.CorporationId, h.home, h.gateId, arriveMs)
	if len(want) == 0 {
		t.Fatalf("fixture bug: charts.GateAttachmentWrite emitted nothing for gate id %q", h.gateId)
	}
	for _, w := range want {
		doc := h.client.Collection(w.Path[0])
		ref := doc.Doc(w.Path[1])
		for i := 2; i+1 < len(w.Path); i += 2 {
			ref = ref.Collection(w.Path[i]).Doc(w.Path[i+1])
		}
		snap, err := ref.Get(h.ctx)
		if err != nil || !snap.Exists() {
			t.Errorf("fleet-movement \"Holding or releasing over a completed-but-unresolved movement order "+
				"settles it first\": the arrived-at gate's lane was never charted — no document at %v (%v). "+
				"\"any gate-lane charting\" is one of the arrival's exactly-once effects the settle-first step "+
				"exists to preserve.", w.Path, err)
		}
	}
}

// --- step 3: a silently expired hold ---------------------------------------

// Scenario: Holding over a silently expired hold settles it first and is then
// rejected.
// Scenario: The reserve is never spent by upkeep across repeated hold cycles.
//
// BLOCKER 1 REGRESSION (task 7.15). Without the settle-elapsed-hold step,
// `hold` is free station-keeping forever: an elapsed hold IS an `orbit` park
// by the automatic fold, so the not-orbiting precondition accepts it; the
// stored `fuel` still over-reports by the whole accrual; and `hold` then
// computes a fresh dry instant from that figure and stamps it over the
// elapsed hold's, forgiving the accrual and skipping the force-demotion
// entirely. "Re-issuing `hold` once after each dry instant would hold a
// position forever for the fuel of a single hold — the gate camper paying
// nothing."
//
// WHAT WOULD MAKE THIS VACUOUS (task 7.15, verbatim): "any setup step that
// settles the first hold before the second `hold` is submitted — a
// `GET /v1/fleets/:id`, a `FreeHold` consumer, or an explicit force-demotion
// helper — since a pre-settled fleet already shows reserve-level `fuel` and an
// unfixed build rejects it for the right reason by accident."
//
// So: between the first `Hold` and the second there is EXACTLY ONE statement,
// an in-memory advance of the injected world clock. No read, no write, no
// helper, no DAO call. The first hold's own return value supplies everything
// the assertions need.
func TestHold_Scenario_HoldingOverASilentlyExpiredHoldSettlesItFirstAndIsThenRejected(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-silently-expired", fuel)

	held, err := h.fsvc.Hold(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("arranging the first hold: %v", err)
	}
	firstPark := *held.State.Park
	if fuelOf(held) != fuel {
		t.Fatalf("fixture invariant: the first hold must debit nothing (fuel = %v, want %v)", fuelOf(held), fuel)
	}

	// >>> THE ONLY STATEMENT BETWEEN THE TWO HOLDS. An in-memory clock
	// advance: no read, no write, nothing observes or settles the park.
	h.clk.now = firstPark.DryInstantMs + 5_000

	_, err = h.fsvc.Hold(h.ctx, f.Id)

	if err == nil {
		t.Fatalf("fleet-movement \"Holding over a silently expired hold settles it first and is then "+
			"rejected\": the second `hold` SUCCEEDED. The elapsed hold's stored fuel still over-reported by "+
			"the whole accrual (%v tons stored, %v actually spendable), the fold already presented the fleet "+
			"as an ordinary orbiting one, and a fresh dry instant computed from that stale figure and stamped "+
			"over the elapsed hold's forgives the entire accrual and skips the force-demotion — \"the gate "+
			"camper paying nothing, which is the outcome this change's whole upkeep economy exists to "+
			"prevent\".", fuel, fuel-h.reserve)
	}
	if !errors.Is(err, ErrHoldWithoutFuel) {
		t.Errorf("the second hold's rejection = %v, want the insufficient-fuel reason (ErrHoldWithoutFuel) — "+
			"\"`hold`'s own preconditions are then evaluated against that settled figure, so the new hold is "+
			"rejected 409 Conflict with the insufficient-fuel reason, its spendable fuel above the reserve "+
			"being zero\". A not-orbiting rejection here means the settlement never ran and the stored park "+
			"is still `stationkeep`.", err)
	}

	stored := h.stored(t, f.Id)

	// "the elapsed hold is settled first — folded to its released orbit with
	// `cargo.fuel` persisted at exactly the configured station-keeping
	// reserve — by a write that precedes and is independent of `hold`'s own
	// transaction"
	if got := fuelOf(stored); got != h.reserve {
		t.Errorf("stored fuel after the rejected second hold = %v, want EXACTLY the reserve %v.\n"+
			"  %v (the pre-hold figure) means the settlement was never persisted — `hold`'s own transaction "+
			"rejects, so a settlement written INSIDE it is discarded by construction; it must be carried by "+
			"the preceding, independent, conditional write.\n"+
			"  0 means the reserve was not held back (\"Station-Keeping Upkeep Never Drains a Fleet Below Its "+
			"Reserve\").", got, h.reserve, fuel)
	}
	if got := fuelOf(stored); got > h.reserve {
		t.Errorf("\"the accrued upkeep the elapsed hold incurred is never forgiven\": the fleet kept %v tons, "+
			"%v more than the reserve %v — the elapsed hold ran all the way to its dry instant, so its whole "+
			"spendable budget (%v tons) is spent", got, got-h.reserve, h.reserve, fuel-h.reserve)
	}

	// "no second `stationkeep` park is stored — the fleet's stored park is the
	// released `orbit` the settlement wrote, carrying no hold-start time and
	// no dry instant"
	if stored.State.Park == nil {
		t.Fatalf("the fleet has no stored park at all after the rejected hold: %+v", stored.State)
	}
	if stored.State.Park.Kind == space.ParkStationkeep {
		t.Fatalf("a second `stationkeep` park WAS stored (%+v). Its holdStart (%d) is later than the first "+
			"hold's (%d) and its dry instant (%d) later than the first's (%d), which is the restamp that "+
			"forgives the accrual outright.", *stored.State.Park, stored.State.Park.HoldStartMs,
			firstPark.HoldStartMs, stored.State.Park.DryInstantMs, firstPark.DryInstantMs)
	}
	want := space.ReleaseStationkeep(firstPark.BodyId, firstPark.Offset, firstPark.DryInstantMs)
	if *stored.State.Park != want {
		t.Errorf("stored park = %+v, want the released orbit ReleaseStationkeep(%q, %v, releaseTime = the "+
			"FIRST hold's dry instant %d) = %+v — the settlement releases as of the dry instant, never as of "+
			"the second hold's own instant", *stored.State.Park, firstPark.BodyId, firstPark.Offset,
			firstPark.DryInstantMs, want)
	}
	if stored.State.Park.HoldStartMs != 0 || stored.State.Park.DryInstantMs != 0 {
		t.Errorf("the released orbit park still carries a hold window (holdStart=%d dryInstant=%d), want both "+
			"absent — \"the fleet's stored park is the released `orbit` the settlement wrote, carrying no "+
			"hold-start time and no dry instant\"",
			stored.State.Park.HoldStartMs, stored.State.Park.DryInstantMs)
	}
}

package fleet

// RED-PHASE SDET SUITE for openspec change add-stationkeep-hold-verb —
// fleet-movement ADDED requirements:
//
//   - "Station-Keeping Hold and Release Are Fleet Verbs" (the six scenarios
//     whose THEN is pure verb behaviour; the ordered-precondition three —
//     lane transit, a due burn, a silently expired hold — live in
//     stationkeep_ordered_preconditions_test.go)
//   - "Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded
//     Into the Stored Cargo Pool" (the six non-burn/non-refuel/non-stop/
//     non-jump scenarios)
//
// See stationkeep_testsupport_test.go for the assumed API contract and the
// expected compile-red state.

import (
	"errors"
	"testing"

	"hexaverse/space"
)

// --- "Station-Keeping Hold and Release Are Fleet Verbs" ---------------------

// Scenario: Holding converts an orbiting fleet to station-keep at its current
// offset.
//
// "THEN the fleet's park mode becomes `stationkeep`, holding its exact offset
// from its host body at the call instant, with no action created, no delta-v
// charged, and no fuel debited yet."
func TestHold_Scenario_HoldingConvertsAnOrbitingFleetToStationKeepAtItsCurrentOffset(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	before := h.orbitingFleet(t, "sdet-hold-converts", fuel)

	// The exact offset the hold must capture, computed independently from the
	// PRE-hold orbit park at the call instant.
	at := h.clk.Now()
	parkPos, err := before.State.Park.Position(h.bt, at)
	if err != nil {
		t.Fatalf("resolving the pre-hold orbit park position: %v", err)
	}
	bodyPos, err := space.Position(h.bt, h.bodyId, at)
	if err != nil {
		t.Fatalf("resolving the host body position: %v", err)
	}
	wantOffset := parkPos.Sub(bodyPos)

	got, err := h.fsvc.Hold(h.ctx, before.Id)
	if err != nil {
		t.Fatalf("Hold on an orbiting fleet returned %v, want success", err)
	}
	if got.State.Mode != space.ModeParked || got.State.Park == nil ||
		got.State.Park.Kind != space.ParkStationkeep {
		t.Fatalf("fleet-movement \"Holding converts an orbiting fleet to station-keep at its current "+
			"offset\": post-hold state = %+v, want a ParkStationkeep park", got.State)
	}
	p := got.State.Park
	if p.BodyId != h.bodyId {
		t.Errorf("held park body = %q, want the host body %q", p.BodyId, h.bodyId)
	}
	nearly(t, p.Offset.X, wantOffset.X, 1e-9, "held offset X (\"its exact offset from its host body at the call instant\")")
	nearly(t, p.Offset.Y, wantOffset.Y, 1e-9, "held offset Y")
	nearly(t, p.Offset.Z, wantOffset.Z, 1e-9, "held offset Z")

	if p.HoldStartMs != at {
		t.Errorf("stored hold start = %d, want the call instant %d", p.HoldStartMs, at)
	}
	if want := wantDryInstant(at, fuel, h.rate, h.params); p.DryInstantMs != want {
		t.Errorf("fleet-movement \"Station-Keeping Upkeep Is Settled at Discrete Events...\": stored dry "+
			"instant = %d (offset %d ms), want %d (offset %d ms) = holdStart + ceil_to_integer_ms(1000 × "+
			"((fuel %v − StationKeepReserveTons %v) × DeltaVPerTon %v) / upkeepRate %v).\n"+
			"  A ×%v discrepancy means DeltaVPerTon was DIVIDED where the budget MULTIPLIES;\n"+
			"  a ×1000 discrepancy means space.StationKeepUpkeep's own ms→s conversion was restated;\n"+
			"  a discrepancy of exactly ceil(1000 × (%v × %v) / %v) ms means the RESERVE was not subtracted "+
			"from the spendable budget, which settles the fleet to zero and violates \"Station-Keeping Upkeep "+
			"Never Drains a Fleet Below Its Reserve\".",
			p.DryInstantMs, p.DryInstantMs-at, want, want-at, fuel, h.reserve, h.params.DeltaVPerTon, h.rate,
			h.params.DeltaVPerTon*h.params.DeltaVPerTon, h.reserve, h.params.DeltaVPerTon, h.rate)
	}

	// "no fuel debited yet" — the stored cargo pool is untouched by the
	// commit itself.
	stored := h.stored(t, before.Id)
	if fuelOf(stored) != fuel {
		t.Errorf("fleet-movement \"...debiting no fuel at that instant\": stored fuel after hold = %v, want "+
			"the unchanged %v", fuelOf(stored), fuel)
	}
	// "no action created, no channel slot claimed, no ETA computed."
	if stored.ActiveActionId != "" || stored.ActiveScanId != "" {
		t.Errorf("fleet-movement \"Station-Keeping Hold and Release Are Fleet Verbs\": hold claimed a channel "+
			"slot (activeActionId=%q activeScanId=%q) — both verbs are instant, like cut-drive: \"no "+
			"action-dispatch action is created, no channel slot is claimed, and no ETA is computed by either\"",
			stored.ActiveActionId, stored.ActiveScanId)
	}
}

// Scenario: Releasing converts a station-keeping fleet back to orbit.
func TestRelease_Scenario_ReleasingConvertsAStationKeepingFleetBackToOrbit(t *testing.T) {
	h := newHoldStack(t)
	f := h.orbitingFleet(t, "sdet-release-converts", h.reserve+40)
	held := h.holdOrFail(t, f.Id)
	offset := held.Offset

	h.clk.now += 5_000
	releaseAt := h.clk.Now()
	if !(releaseAt < held.DryInstantMs) {
		t.Fatalf("fixture invariant: the release must land strictly before the dry instant (%d < %d)",
			releaseAt, held.DryInstantMs)
	}
	got, err := h.fsvc.Release(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("Release on a station-keeping fleet returned %v, want success", err)
	}
	if got.State.Mode != space.ModeParked || got.State.Park == nil ||
		got.State.Park.Kind != space.ParkOrbit {
		t.Fatalf("fleet-movement \"Releasing converts a station-keeping fleet back to orbit\": post-release "+
			"state = %+v, want a ParkOrbit park", got.State)
	}
	want := space.ReleaseStationkeep(h.bodyId, offset, releaseAt)
	if *got.State.Park != want {
		t.Errorf("released park = %+v, want space.ReleaseStationkeep(%q, %v, releaseTime=%d) = %+v — "+
			"\"re-circularized per space-kinematics's re-circularization rule\"",
			*got.State.Park, h.bodyId, offset, releaseAt, want)
	}
	if stored := h.stored(t, f.Id); stored.ActiveActionId != "" {
		t.Errorf("release claimed a movement slot (activeActionId=%q); it must create no action at all",
			stored.ActiveActionId)
	}
}

// Scenario: Holding a fleet that is not orbiting is rejected by name.
//
// "WHEN `hold` is submitted for a fleet whose effective state is a burn, a
// drift, a `point` park, or an already-`stationkeep` park — THEN the response
// is `409 Conflict` carrying its own named reason, and the fleet's state is
// unchanged."
func TestHold_Scenario_HoldingAFleetThatIsNotOrbitingIsRejectedByName(t *testing.T) {
	h := newHoldStack(t)

	t.Run("Scenario: Holding a fleet that is not orbiting is rejected by name (drift)", func(t *testing.T) {
		h.driftingFleet(t, "sdet-hold-drift")
		h.assertHoldRejectedUnchanged(t, "sdet-hold-drift")
	})
	t.Run("Scenario: Holding a fleet that is not orbiting is rejected by name (point park)", func(t *testing.T) {
		h.pointParkedFleet(t, "sdet-hold-point")
		h.assertHoldRejectedUnchanged(t, "sdet-hold-point")
	})
	t.Run("Scenario: Holding a fleet that is not orbiting is rejected by name (burn)", func(t *testing.T) {
		f := h.orbitingFleet(t, "sdet-hold-burn", h.reserve+10_000)
		if _, err := h.fsvc.OrderTo(h.ctx, f.Id, OrderRequest{Point: &space.Vec3{X: h.bt.Extent() * 0.4}}); err != nil {
			t.Fatalf("arranging a live burn: %v", err)
		}
		h.assertHoldRejectedUnchanged(t, f.Id)
	})
	t.Run("Scenario: Holding a fleet that is not orbiting is rejected by name (already stationkeep)", func(t *testing.T) {
		f := h.orbitingFleet(t, "sdet-hold-twice", h.reserve+40)
		h.holdOrFail(t, f.Id)
		h.assertHoldRejectedUnchanged(t, f.Id)
	})
}

// assertHoldRejectedUnchanged runs the shared THEN: rejected with the
// not-orbiting reason, and the fleet's stored state byte-identical afterwards.
func (h *holdStack) assertHoldRejectedUnchanged(t *testing.T, id string) {
	t.Helper()
	before := h.stored(t, id)
	_, err := h.fsvc.Hold(h.ctx, id)
	if err == nil {
		t.Fatalf("fleet-movement \"Holding a fleet that is not orbiting is rejected by name\": Hold succeeded "+
			"against effective state %+v, want a rejection", before.State)
	}
	if !errors.Is(err, ErrNotOrbiting) {
		t.Errorf("Hold rejection = %v, want the named not-orbiting reason (ErrNotOrbiting) — \"rejected with "+
			"its own named reason\"", err)
	}
	after := h.stored(t, id)
	if after.State.Mode != before.State.Mode {
		t.Errorf("a rejected hold CHANGED the fleet's state mode: %v -> %v — \"the fleet's state is unchanged\"",
			before.State.Mode, after.State.Mode)
	}
	if before.State.Park != nil && after.State.Park != nil && *before.State.Park != *after.State.Park {
		t.Errorf("a rejected hold CHANGED the fleet's park:\n  before = %+v\n  after  = %+v",
			*before.State.Park, *after.State.Park)
	}
	if fuelOf(after) != fuelOf(before) {
		t.Errorf("a rejected hold moved fuel: %v -> %v", fuelOf(before), fuelOf(after))
	}
}

// Scenario: Holding a fleet with insufficient fuel is rejected, not silently
// bricked.
//
// THE INVARIANT IS A STRICTLY POSITIVE SPENDABLE REMAINDER **ABOVE THE
// RESERVE**, not "non-zero fuel". "the fleet's currently held `fuel` is at or
// below the configured station-keeping reserve (`FuelParams.
// StationKeepReserveTons`), the tonnage a hold may never spend ... this is not
// merely 'small fuel,' it is specifically 'no spendable fuel above the
// reserve'." Accepting such a hold stores a park whose dryInstant equals its
// holdStart — a value space-kinematics's own decode requirement rejects
// outright, bricking the fleet's every subsequent read and command.
//
// All three fixtures are ORBITING with ample everything else, so the ONLY
// reason to reject is the fuel one — which is what makes the "distinct from
// the not-orbiting rejection" assertion below meaningful.
func TestHold_Scenario_HoldingAFleetWithInsufficientFuelIsRejectedNotSilentlyBricked(t *testing.T) {
	h := newHoldStack(t)

	cases := []struct {
		name string
		fuel float64
	}{
		{"exactly the reserve", h.reserve},
		{"strictly below the reserve", h.reserve / 2},
		{"exactly zero", 0},
	}
	for i, tc := range cases {
		t.Run("Scenario: Holding a fleet with insufficient fuel is rejected, not silently bricked ("+tc.name+")", func(t *testing.T) {
			id := "sdet-hold-no-spendable-" + string(rune('a'+i))
			f := h.orbitingFleet(t, id, tc.fuel)
			if got := fuelOf(h.stored(t, f.Id)); got != tc.fuel {
				t.Fatalf("fixture invariant: the fleet must hold exactly %v tons of fuel, got %v", tc.fuel, got)
			}

			_, err := h.fsvc.Hold(h.ctx, f.Id)
			if err == nil {
				t.Fatalf("fleet-movement \"Holding a fleet with insufficient fuel is rejected, not silently "+
					"bricked\": Hold on a fleet holding %v tons (the configured reserve is %v, so its SPENDABLE "+
					"fuel above the reserve is %v) SUCCEEDED. That stores a `stationkeep` park whose dryInstant "+
					"equals its holdStart — a value space-kinematics's own decode requirement rejects, bricking "+
					"the fleet's every subsequent read and command.", tc.fuel, h.reserve, tc.fuel-h.reserve)
			}
			if !errors.Is(err, ErrHoldWithoutFuel) {
				t.Errorf("insufficient-fuel hold rejection = %v, want the named reason (ErrHoldWithoutFuel)", err)
			}
			if errors.Is(err, ErrNotOrbiting) {
				t.Errorf("the insufficient-fuel rejection also matches the not-orbiting reason — the "+
					"requirement demands \"its own named reason, distinct from the not-orbiting rejection\". "+
					"The fixture fleet IS orbiting; only its fuel disqualifies it. (err = %v)", err)
			}

			// "no `stationkeep` park is stored, and the fleet's park mode is
			// unchanged" — and, per task 7.8, the fleet "remains readable and
			// re-orderable".
			stored := h.stored(t, f.Id)
			if stored.State.Park == nil || stored.State.Park.Kind != space.ParkOrbit {
				t.Fatalf("after a rejected insufficient-fuel hold the stored park is %+v, want the unchanged "+
					"orbit park", stored.State.Park)
			}
			if got := fuelOf(stored); got != tc.fuel {
				t.Errorf("a rejected hold moved fuel: %v -> %v", tc.fuel, got)
			}
			if _, err := h.fsvc.Get(h.ctx, f.Id); err != nil {
				t.Errorf("the fleet is no longer readable after a rejected insufficient-fuel hold: %v — the "+
					"whole point of the precondition is that it never bricks", err)
			}
		})
	}
}

// Scenario: Holding with fuel just above the reserve is accepted.
//
// The accepting side of the ceiling-quantized inverse's boundary (task 3.13),
// paired with the rejecting side above. "by however small a margin ... the
// ceiling carrying any strictly positive spendable remainder to an offset of
// at least one whole millisecond."
//
// An implementation that rejected on "spendable fuel below some epsilon" would
// pass every rejection case above and be wrong here.
func TestHold_Scenario_HoldingWithFuelJustAboveTheReserveIsAccepted(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 1e-9
	f := h.orbitingFleet(t, "sdet-hold-just-above-reserve", fuel)

	got, err := h.fsvc.Hold(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("fleet-movement \"Holding with fuel just above the reserve is accepted\": Hold with %v tons "+
			"(reserve %v, spendable remainder 1e-9) was rejected (%v). \"the hold is accepted, a `stationkeep` "+
			"park is stored, and its computed dry instant is strictly after its stored hold-start time — the "+
			"ceiling carrying any strictly positive spendable remainder to an offset of at least one whole "+
			"millisecond.\"", fuel, h.reserve, err)
	}
	p := got.State.Park
	if p == nil || p.Kind != space.ParkStationkeep {
		t.Fatalf("post-hold park = %+v, want ParkStationkeep", p)
	}
	if !(p.DryInstantMs > p.HoldStartMs) {
		t.Fatalf("stored hold window is holdStart=%d dryInstant=%d — the dry instant must be STRICTLY after "+
			"the hold start, or space-kinematics's own decode requirement rejects the park and bricks the "+
			"fleet", p.HoldStartMs, p.DryInstantMs)
	}
	if got := p.DryInstantMs - p.HoldStartMs; got != 1 {
		t.Errorf("dry-instant offset for a spendable remainder of 1e-9 tons = %d ms, want exactly 1 — the "+
			"quantization is a CEILING (\"quantized up, never down ... so a hold is never folded dry one "+
			"millisecond before it is truly exhausted\")", got)
	}
	// It really was stored, not just returned: an undecodable park would make
	// the very next read fail.
	if stored := h.stored(t, f.Id); stored.State.Park == nil ||
		stored.State.Park.Kind != space.ParkStationkeep {
		t.Errorf("the accepted hold was not persisted: stored park = %+v", stored.State.Park)
	}
}

// Scenario: Releasing a fleet that is not station-keeping is rejected by name.
func TestRelease_Scenario_ReleasingAFleetThatIsNotStationKeepingIsRejectedByName(t *testing.T) {
	h := newHoldStack(t)
	h.orbitingFleet(t, "sdet-release-orbit", h.reserve+40)
	h.driftingFleet(t, "sdet-release-drift")
	h.pointParkedFleet(t, "sdet-release-point")

	for _, id := range []string{"sdet-release-orbit", "sdet-release-drift", "sdet-release-point"} {
		t.Run("Scenario: Releasing a fleet that is not station-keeping is rejected by name ("+id+")", func(t *testing.T) {
			before := h.stored(t, id)
			_, err := h.fsvc.Release(h.ctx, id)
			if err == nil {
				t.Fatalf("Release succeeded against effective state %+v, want a rejection", before.State)
			}
			if !errors.Is(err, ErrNotStationKeeping) {
				t.Errorf("Release rejection = %v, want the named not-station-keeping reason "+
					"(ErrNotStationKeeping)", err)
			}
			if errors.Is(err, ErrNotOrbiting) || errors.Is(err, ErrHoldWithoutFuel) {
				t.Errorf("release's rejection also matches one of hold's — the requirement demands a reason " +
					"\"distinct from both of hold's rejection reasons\": \"hold and release are not " +
					"substitutes for one another\"")
			}
			after := h.stored(t, id)
			if after.State.Mode != before.State.Mode || fuelOf(after) != fuelOf(before) {
				t.Errorf("a rejected release changed the fleet (mode %v->%v, fuel %v->%v) — \"the fleet's "+
					"state is unchanged\"", before.State.Mode, after.State.Mode, fuelOf(before), fuelOf(after))
			}
		})
	}
}

// SDET-added: the three rejection reasons are pairwise distinct VALUES, not
// merely three names for one sentinel. The requirement states the
// distinctness three separate times; asserting it once, directly, is cheaper
// than inferring it from three separate errors.Is checks that would all pass
// against a single shared sentinel.
func TestHoldRelease_SDET_TheThreeRejectionReasonsArePairwiseDistinct(t *testing.T) {
	pairs := []struct {
		a, b        error
		aName       string
		bName       string
		whyDistinct string
	}{
		{ErrNotOrbiting, ErrNotStationKeeping, "ErrNotOrbiting", "ErrNotStationKeeping",
			"\"hold and release are not substitutes for one another\""},
		{ErrNotOrbiting, ErrHoldWithoutFuel, "ErrNotOrbiting", "ErrHoldWithoutFuel",
			"\"its own named reason distinct from the not-orbiting rejection\""},
		{ErrNotStationKeeping, ErrHoldWithoutFuel, "ErrNotStationKeeping", "ErrHoldWithoutFuel",
			"a caller must be able to tell 'you are not holding' from 'you cannot afford to hold'"},
	}
	for _, p := range pairs {
		if errors.Is(p.a, p.b) || errors.Is(p.b, p.a) {
			t.Errorf("SDET-added: %s and %s are not distinguishable by errors.Is — %s",
				p.aName, p.bName, p.whyDistinct)
		}
		if p.a.Error() == p.b.Error() {
			t.Errorf("SDET-added: %s and %s carry the identical message %q, so an HTTP client cannot tell "+
				"them apart either — %s", p.aName, p.bName, p.a.Error(), p.whyDistinct)
		}
	}
}

// Scenario: A fleet's attachment survives hold, release, and force-demotion.
func TestHoldRelease_Scenario_AFleetsAttachmentSurvivesHoldReleaseAndForceDemotion(t *testing.T) {
	h := newHoldStack(t)

	t.Run("Scenario: A fleet's attachment survives hold, release, and force-demotion (hold then release)", func(t *testing.T) {
		f := h.orbitingFleet(t, "sdet-attach-release", h.reserve+40)
		wantHost, wantDocked := f.DockedTo()
		if !wantDocked {
			t.Fatalf("fixture invariant: the fleet must start attached to its host body")
		}
		held, err := h.fsvc.Hold(h.ctx, f.Id)
		if err != nil {
			t.Fatalf("Hold: %v", err)
		}
		assertAttachment(t, held, wantHost, "after hold")
		assertAttachment(t, h.stored(t, f.Id), wantHost, "after hold (stored)")

		h.clk.now += 1_000
		released, err := h.fsvc.Release(h.ctx, f.Id)
		if err != nil {
			t.Fatalf("Release: %v", err)
		}
		assertAttachment(t, released, wantHost, "after release")
		assertAttachment(t, h.stored(t, f.Id), wantHost, "after release (stored)")
	})

	t.Run("Scenario: A fleet's attachment survives hold, release, and force-demotion (force-demotion)", func(t *testing.T) {
		f := h.orbitingFleet(t, "sdet-attach-demote", h.reserve+40)
		wantHost, _ := f.DockedTo()
		held := h.holdOrFail(t, f.Id)
		h.clk.now = held.DryInstantMs + 1
		demoted, err := h.fsvc.Get(h.ctx, f.Id)
		if err != nil {
			t.Fatalf("read past the dry instant: %v", err)
		}
		if demoted.State.Park == nil || demoted.State.Park.Kind != space.ParkOrbit {
			t.Fatalf("fixture invariant: the fleet did not force-demote (park = %+v)", demoted.State.Park)
		}
		assertAttachment(t, demoted, wantHost, "after force-demotion")
		assertAttachment(t, h.stored(t, f.Id), wantHost, "after force-demotion (stored)")
	})
}

func assertAttachment(t *testing.T, f *Fleet, wantHost, when string) {
	t.Helper()
	host, docked := f.DockedTo()
	if !docked || host != wantHost {
		t.Errorf("fleet-movement \"A fleet's attachment survives hold, release, and force-demotion\": %s, "+
			"attachedTo = %q (docked=%v), want %q (docked=true) — \"only the park's kind and, where "+
			"applicable, its orbit parameters change\"", when, host, docked, wantHost)
	}
}

// --- "Station-Keeping Upkeep Is Settled at Discrete Events..." -------------

// Scenario: Releasing before exhaustion debits exactly the accrued upkeep,
// converted to tons.
//
// The two conversions are what this test exists for. At today's placeholder
// DeltaVPerTon = 5.0, restating space.StationKeepUpkeep's own ms→s conversion
// moves the figure by 1000×; omitting the Δv→tons division by 1000×/5×. Both
// are visible here.
//
// The second half is the reserve half: "the fleet is left holding strictly
// more than the configured station-keeping reserve, with no clamp applied to
// reach that result."
func TestUpkeep_Scenario_ReleasingBeforeExhaustionDebitsExactlyTheAccruedUpkeepConvertedToTons(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-upkeep-release", fuel)
	held := h.holdOrFail(t, f.Id)
	holdStart := held.HoldStartMs
	dry := held.DryInstantMs

	// Release at 40% of the way to the dry instant — comfortably "before its
	// stored dry instant", and far enough in that a 5×/1000× error cannot
	// hide inside a rounding tolerance.
	h.clk.now = holdStart + (dry-holdStart)*2/5
	releaseAt := h.clk.Now()
	if !(releaseAt < dry) {
		t.Fatalf("fixture invariant: releaseAt %d must be strictly before the dry instant %d", releaseAt, dry)
	}

	if _, err := h.fsvc.Release(h.ctx, f.Id); err != nil {
		t.Fatalf("Release: %v", err)
	}
	stored := h.stored(t, f.Id)
	gotDebit := fuel - fuelOf(stored)
	want := wantUpkeepTons(h.rate, holdStart, releaseAt, h.params)

	nearly(t, gotDebit, want, math1e9Rel(want),
		"fleet-movement \"Releasing before exhaustion debits exactly the accrued upkeep, converted to tons\": "+
			"debit == space.StationKeepUpkeep(rate, holdStartTime, releaseTime) / FuelParams.DeltaVPerTon, "+
			"\"the elapsed duration passed to that function as two WorldMillis stamps, never pre-divided by "+
			"1000, and its result never divided by 1000 again\"")
	if want != 0 && gotDebit > want*4 {
		t.Errorf("  the observed debit is %.3f× the correct one — check the Δv→tons division by DeltaVPerTon "+
			"(%v) and that space.StationKeepUpkeep's own ms→s conversion was not restated at the call site",
			gotDebit/want, h.params.DeltaVPerTon)
	}
	// "the fleet is left holding STRICTLY MORE than the configured
	// station-keeping reserve, with no clamp applied to reach that result."
	if got := fuelOf(stored); !(got > h.reserve) {
		t.Errorf("fleet-movement \"Releasing before exhaustion debits exactly the accrued upkeep, converted "+
			"to tons\": after a release strictly before the dry instant the fleet holds %v, want STRICTLY "+
			"MORE than the reserve %v. \"because releaseTime is strictly before the dry instant, and the dry "+
			"instant is by construction the first instant at which the accrual reaches the spendable budget, "+
			"this debit is provably strictly less than fuelAtHoldStart − StationKeepReserveTons.\" A value of "+
			"exactly the reserve here is the signature of a clamp — \"No clamp applies to this debit and none "+
			"SHALL be specified\".", got, h.reserve)
	}
	if fuelOf(stored) < 0 {
		t.Errorf("stored fuel went negative (%v)", fuelOf(stored))
	}
}

// Scenario: A release at exactly the dry instant is rejected, the fold having
// already released the hold.
//
// REVISED for this change (cause: spec change; the earlier draft specified a
// clamped at-the-boundary release debiting exactly the fuel held at hold
// start, and this suite asserted it). "there is no clamped, at-the-boundary
// release path, and no rule in this capability SHALL define one."
//
// The `fuel` assertion is against the STORED FLEET DOCUMENT, not an in-memory
// fold, and the requirement says so explicitly: release rejects, so a
// settlement written inside release's own transaction would be discarded —
// it must be carried by the preceding, independent, conditional write.
func TestUpkeep_Scenario_AReleaseAtExactlyTheDryInstantIsRejectedTheFoldHavingAlreadyReleasedTheHold(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-upkeep-exact", fuel)
	held := h.holdOrFail(t, f.Id)
	dry := held.DryInstantMs
	offset := held.Offset

	h.clk.now = dry
	_, err := h.fsvc.Release(h.ctx, f.Id)
	if err == nil {
		t.Fatalf("fleet-movement \"A release at exactly the dry instant is rejected, the fold having already "+
			"released the hold\": Release at exactly the stored dry instant %d SUCCEEDED. At that instant the "+
			"\"at or after\" fold has already made the fleet's effective park an `orbit` park, so there is no "+
			"`stationkeep` hold left to release.", dry)
	}
	if !errors.Is(err, ErrNotStationKeeping) {
		t.Errorf("rejection = %v, want the not-station-keeping reason (ErrNotStationKeeping) — \"rejected by "+
			"the same not-station-keeping reason as any other non-`stationkeep` effective state\"", err)
	}

	// "AND the fleet's `fuel` is exactly the configured station-keeping
	// reserve, settled by that fold rather than by any clamped release debit"
	// — asserted against the STORED document.
	stored := h.stored(t, f.Id)
	if got := fuelOf(stored); got != h.reserve {
		t.Errorf("stored fuel after the rejected at-the-dry-instant release = %v, want EXACTLY the configured "+
			"reserve %v. The settlement is carried by \"the preceding, independent, conditional write\", never "+
			"by a write inside `release`'s own transaction, which rejects and would discard it — so this is an "+
			"assertion \"against the stored fleet document after the call, not against an in-memory fold\". "+
			"A value of %v (the pre-hold figure) means no settlement was persisted at all; a value of 0 means "+
			"the reserve was not held back.", got, h.reserve, fuel)
	}
	want := space.ReleaseStationkeep(h.bodyId, offset, dry)
	if stored.State.Park == nil || *stored.State.Park != want {
		t.Errorf("stored park after the rejected release = %+v, want ReleaseStationkeep(%q, %v, releaseTime = "+
			"the DRY INSTANT %d) = %+v — the fold releases AS OF the dry instant, never as of the call instant",
			stored.State.Park, h.bodyId, offset, dry, want)
	}
}

// Task 3.8: the round-trip conversion as a BOUNDED INTERVAL. The accrual
// evaluated at the stored dry instant is at least the spendable budget and
// strictly less than that budget plus one millisecond's worth of upkeep. The
// interval is exactly one millisecond wide because the dry instant is
// ceiling-quantized, so an equality assertion is unsatisfiable in general
// while this bound is both correct and tight. Any factor-of-1000 or
// factor-of-DeltaVPerTon error breaks it by orders of magnitude, and a missing
// reserve subtraction breaks it by exactly the reserve.
func TestUpkeep_Scenario_TheAccrualAtTheStoredDryInstantBracketsTheSpendableBudget(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-upkeep-bound", fuel)
	held := h.holdOrFail(t, f.Id)

	accrualAtDry := wantUpkeepTons(h.rate, held.HoldStartMs, held.DryInstantMs, h.params)
	spendable := fuel - h.reserve
	slack := oneMillisecondOfUpkeepTons(h.rate, h.params)

	if accrualAtDry < spendable {
		t.Errorf("fleet-movement \"Station-Keeping Upkeep Is Settled at Discrete Events...\" (task 3.8): the "+
			"accrual at the stored dry instant is %v tons, want AT LEAST the spendable budget %v (= fuel %v − "+
			"reserve %v). The dry instant is \"the earliest world time T, quantized UP to an integer "+
			"millisecond, at which space.StationKeepUpkeep(rate, holdStart, T) reaches or exceeds\" the "+
			"spendable budget — quantizing DOWN folds the hold dry before it is truly exhausted.",
			accrualAtDry, spendable, fuel, h.reserve)
	}
	if accrualAtDry >= spendable+slack {
		t.Errorf("fleet-movement (task 3.8): the accrual at the stored dry instant is %v tons, want strictly "+
			"less than %v (the spendable budget %v plus one millisecond's upkeep %v). An overshoot of this "+
			"size means the dry instant is computed from the wrong budget — a factor of DeltaVPerTon (%v) "+
			"means the multiplication was inverted; a factor of 1000 means an ms↔s conversion was restated; "+
			"an overshoot of exactly the reserve's worth means the reserve was not subtracted.",
			accrualAtDry, spendable+slack, spendable, slack, h.params.DeltaVPerTon)
	}
}

// Scenario: A read during an open hold reports the stored, unsettled fuel
// value.
func TestUpkeep_Scenario_AReadDuringAnOpenHoldReportsTheStoredUnsettledFuelValue(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-upkeep-read", fuel)
	held := h.holdOrFail(t, f.Id)
	dry := held.DryInstantMs
	start := held.HoldStartMs

	h.clk.now = start + (dry-start)/4
	first, err := h.fsvc.Get(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("first read: %v", err)
	}
	h.clk.now = start + (dry-start)/2
	second, err := h.fsvc.Get(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("second read: %v", err)
	}

	if fuelOf(first) != fuel || fuelOf(second) != fuel {
		t.Errorf("fleet-movement \"A read during an open hold reports the stored, unsettled fuel value\": "+
			"reads at t=%d and t=%d reported %v and %v tons, want the identical stored %v both times — "+
			"\"neither read triggers or reflects a partial settlement\". A read that folds accrual live is "+
			"exactly the coupling this change exists to avoid: it makes fleet.FreeHold time-dependent for "+
			"all five of its call sites.",
			start+(dry-start)/4, start+(dry-start)/2, fuelOf(first), fuelOf(second), fuel)
	}
	if got := fuelOf(h.stored(t, f.Id)); got != fuel {
		t.Errorf("the STORED fuel moved during an open hold: %v, want %v", got, fuel)
	}
}

// Scenario: Fuel exhaustion during a hold force-demotes to orbit, never
// negative.
//
// REVISED for this change (cause: spec change — "Station-Keeping Upkeep Never
// Drains a Fleet Below Its Reserve"): the settled value is EXACTLY the
// configured reserve, never zero. An assertion of zero here is now an
// assertion of the outcome decisions.md (2026-08-29) forbids.
func TestUpkeep_Scenario_FuelExhaustionDuringAHoldForceDemotesToOrbitNeverNegative(t *testing.T) {
	h := newHoldStack(t)
	f := h.orbitingFleet(t, "sdet-upkeep-demote", h.reserve+40)
	held := h.holdOrFail(t, f.Id)
	offset := held.Offset
	dry := held.DryInstantMs

	// Observed WELL past the dry instant — long enough that a naive
	// "rate × elapsed" settlement would drive the balance far negative.
	h.clk.now = dry + 10*(dry-held.HoldStartMs)
	got, err := h.fsvc.Get(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("read past the dry instant: %v", err)
	}
	if got.State.Park == nil || got.State.Park.Kind != space.ParkOrbit {
		t.Fatalf("fleet-movement \"Fuel exhaustion during a hold force-demotes to orbit, never negative\": "+
			"park past the dry instant = %+v, want a re-circularized ParkOrbit", got.State.Park)
	}
	want := space.ReleaseStationkeep(h.bodyId, offset, dry)
	if *got.State.Park != want {
		t.Errorf("the demoted park = %+v, want ReleaseStationkeep(..., releaseTime = the DRY INSTANT %d) = "+
			"%+v — \"re-circularized at the held offset's planar radius AS OF THE DRY INSTANT\", never as of "+
			"the observation time", *got.State.Park, dry, want)
	}

	stored := h.stored(t, f.Id)
	if got := fuelOf(stored); got != h.reserve {
		t.Errorf("fleet-movement \"An exhausted hold leaves exactly the reserve, never zero\": stored fuel "+
			"after the fold = %v, want EXACTLY the configured reserve %v — \"with cargo.fuel settled to "+
			"exactly FuelParams.StationKeepReserveTons — never zero, never negative — in the same write that "+
			"first persists the fold\". A settlement to exactly zero \"would deliver precisely the outcome "+
			"decisions.md's guardrail forbids\": passive stranding with no decision attached.", got, h.reserve)
	}
	if stored.State.Park == nil || stored.State.Park.Kind != space.ParkOrbit {
		t.Errorf("the fold was not PERSISTED: stored park = %+v, want the released orbit written by the write "+
			"that first observed it", stored.State.Park)
	}
}

// Scenario: A hold that never reaches its dry instant is never demoted.
func TestUpkeep_Scenario_AHoldThatNeverReachesItsDryInstantIsNeverDemoted(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-upkeep-nodemote", fuel)
	held := h.holdOrFail(t, f.Id)
	want := *held

	h.clk.now = held.DryInstantMs - 1
	got, err := h.fsvc.Get(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("read one ms before the dry instant: %v", err)
	}
	if got.State.Park == nil || *got.State.Park != want {
		t.Errorf("fleet-movement \"A hold that never reaches its dry instant is never demoted\": park one ms "+
			"before the dry instant = %+v, want the unchanged held park %+v", got.State.Park, want)
	}
	if got := fuelOf(h.stored(t, f.Id)); got != fuel {
		t.Errorf("the stored fuel was settled before the dry instant: %v, want the unchanged %v — \"its park "+
			"remains `stationkeep`, unsettled, and unchanged\"", got, fuel)
	}
}

// Scenario: Releasing settles the accrual before any subsequent hold
// recomputes a fresh dry instant.
func TestUpkeep_Scenario_ReleasingSettlesTheAccrualBeforeAnySubsequentHoldRecomputesAFreshDryInstant(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-upkeep-rehold", fuel)

	first := h.holdOrFail(t, f.Id)
	firstStart := first.HoldStartMs
	firstDry := first.DryInstantMs

	h.clk.now = firstStart + (firstDry-firstStart)/4
	releaseAt := h.clk.Now()
	if _, err := h.fsvc.Release(h.ctx, f.Id); err != nil {
		t.Fatalf("Release: %v", err)
	}
	afterRelease := fuelOf(h.stored(t, f.Id))
	wantAfterRelease := fuel - wantUpkeepTons(h.rate, firstStart, releaseAt, h.params)
	nearly(t, afterRelease, wantAfterRelease, math1e9Rel(wantAfterRelease),
		"the first hold's accrual is settled by the release EXACTLY ONCE")

	// Second hold, at a later instant, against the post-release fuel level.
	h.clk.now = releaseAt + 7_777
	second, err := h.fsvc.Hold(h.ctx, f.Id)
	if err != nil {
		t.Fatalf("second Hold: %v", err)
	}
	if got := fuelOf(h.stored(t, f.Id)); got != afterRelease {
		t.Errorf("the second hold's commit moved fuel (%v -> %v) — a hold commit debits nothing",
			afterRelease, got)
	}
	p := second.State.Park
	if p.HoldStartMs != h.clk.Now() {
		t.Errorf("the second hold's start = %d, want its own commit instant %d — not the first hold's %d",
			p.HoldStartMs, h.clk.Now(), firstStart)
	}
	if want := wantDryInstant(h.clk.Now(), afterRelease, h.rate, h.params); p.DryInstantMs != want {
		t.Errorf("fleet-movement \"Releasing settles the accrual before any subsequent hold recomputes a "+
			"fresh dry instant\": second hold's dry instant = %d, want %d — computed from the fuel level (%v, "+
			"less the reserve %v) and world time (%d) at ITS OWN commit, \"independent of the first hold's "+
			"history\"", p.DryInstantMs, want, afterRelease, h.reserve, h.clk.Now())
	}
}

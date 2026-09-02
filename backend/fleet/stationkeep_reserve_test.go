package fleet

// RED-PHASE SDET SUITE for openspec change add-stationkeep-hold-verb —
// fleet-movement ADDED requirement "Station-Keeping Upkeep Never Drains a
// Fleet Below Its Reserve".
//
// This requirement is the one adversary round 4 added, and it inverts a large
// part of the earlier draft's suite: every assertion that upkeep settles a
// fleet to zero is now an assertion of the outcome decisions.md (2026-08-29)
// forbids — "station-keeping is the one path on which a fleet strands
// PASSIVELY, while doing nothing", and its own 2026-09-02 correction records
// that stranding is permanent, no cargo-transfer verb existing anywhere in
// the tree.
//
// The reserve's VALUE is an open question for Travis (design.md Open
// Questions; task 2.1 ships it as a documented placeholder). No test here
// hardcodes a number for it: every one reads
// DefaultFuelParams().StationKeepReserveTons.
//
// See stationkeep_testsupport_test.go for the assumed API contract.

import (
	"testing"

	"hexaverse/space"
)

// Scenario: An exhausted hold leaves exactly the reserve, never zero.
//
// "THEN its `fuel` tonnage is exactly the configured station-keeping reserve —
// strictly positive, never zero, never negative."
func TestReserve_Scenario_AnExhaustedHoldLeavesExactlyTheReserveNeverZero(t *testing.T) {
	h := newHoldStack(t)
	fuel := h.reserve + 40
	f := h.orbitingFleet(t, "sdet-reserve-exhausted", fuel)
	held := h.holdOrFail(t, f.Id)

	h.clk.now = held.DryInstantMs
	if _, err := h.fsvc.Get(h.ctx, f.Id); err != nil {
		t.Fatalf("observing the fleet at exactly its stored dry instant: %v", err)
	}

	stored := h.stored(t, f.Id)
	got := fuelOf(stored)
	switch {
	case got == 0:
		t.Errorf("fleet-movement \"An exhausted hold leaves exactly the reserve, never zero\": the settled "+
			"fuel is exactly 0. \"A settlement to exactly zero would therefore deliver precisely the outcome "+
			"that guardrail forbids\" — passive stranding, with no decision attached, and permanent, since no "+
			"cargo-transfer verb exists anywhere in the tree. Want exactly the configured reserve %v.",
			h.reserve)
	case got < 0:
		t.Errorf("the settled fuel is NEGATIVE (%v) — \"never zero, and never negative\"", got)
	case got != h.reserve:
		t.Errorf("the settled fuel is %v, want EXACTLY FuelParams.StationKeepReserveTons = %v. The "+
			"force-demotion is an absolute set to the reserve, not a subtraction that happens to land near "+
			"it.", got, h.reserve)
	}
	if !(h.reserve > 0) {
		t.Errorf("the configured reserve is %v, want STRICTLY POSITIVE — \"it is simply non-zero, so a fleet "+
			"retains some agency after an upkeep drain it never chose\"", h.reserve)
	}
	if stored.State.Park == nil || stored.State.Park.Kind != space.ParkOrbit {
		t.Errorf("the exhausted hold did not fold to its released orbit: stored park = %+v", stored.State.Park)
	}
}

// Scenario: A burn may still spend the reserve down to zero.
//
// The discriminating guard (task 2.3) that the reserve was scoped to PASSIVE
// drain only: "Reserving fuel against a burn remains forbidden; a player may
// still burn their last ton to zero and strand, and this requirement SHALL
// NOT be read as licensing any reserve on that path."
//
// Arranged exactly, not approximately: a calibration fleet at the SAME body,
// with the SAME orbit-park parameters, at the SAME injected world instant,
// solves the IDENTICAL burn to the same fixed point. Its measured price is
// what the fleet under test is funded with, so an accepted commit must land
// the fleet at exactly zero — reserve included.
func TestReserve_Scenario_ABurnMayStillSpendTheReserveDownToZero(t *testing.T) {
	h := newHoldStack(t)
	target := h.farPoint()

	cal := h.orbitingFleet(t, "sdet-reserve-burn-cal", 1_000_000)
	calBurn, err := h.fsvc.OrderTo(h.ctx, cal.Id, OrderRequest{Point: &target})
	if err != nil {
		t.Fatalf("calibration order: %v", err)
	}
	if calBurn.State.Burn == nil {
		t.Fatalf("calibration order did not produce a burn: %+v", calBurn.State)
	}
	cost := burnCostTons(calBurn.State.Burn, h.params)
	if !(cost > h.reserve) {
		t.Skipf("this system's geometry prices the calibration burn at %v tons, which does not exceed the "+
			"configured reserve %v — the scenario needs a burn that spends INTO the reserve to discriminate",
			cost, h.reserve)
	}

	// The fleet under test is NOT station-keeping (an ordinary orbit park) and
	// holds exactly the burn's price — every ton of it, reserve included.
	subject := h.orbitingFleet(t, "sdet-reserve-burn-subject", cost)
	ordered, err := h.fsvc.OrderTo(h.ctx, subject.Id, OrderRequest{Point: &target})
	if err != nil {
		t.Fatalf("fleet-movement \"A burn may still spend the reserve down to zero\": a burn costing the "+
			"fleet's entire held fuel (%v tons, of which %v is the station-keeping reserve) was REJECTED "+
			"(%v). \"the commit succeeds and the fleet's fuel lands at exactly zero — the reserve constrains "+
			"station-keeping upkeep alone, never a burn the player chose to commit.\" A rejection here means "+
			"the reserve leaked onto the burn path, which decisions.md standing-rejects.",
			cost, h.reserve, err)
	}
	if ordered.State.Mode != space.ModeBurn {
		t.Fatalf("post-commit state = %+v, want the committed burn", ordered.State)
	}
	stored := h.stored(t, subject.Id)
	nearly(t, fuelOf(stored), 0, 1e-6,
		"fleet-movement \"A burn may still spend the reserve down to zero\": the fleet's fuel lands at "+
			"exactly zero")
	if fuelOf(stored) < 0 {
		t.Errorf("stored fuel went negative (%v)", fuelOf(stored))
	}
}

package fleet

import (
	"context"
	"math"
	"testing"

	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// add-mine-extraction, fleet-movement spec delta (ADDED): "Fleet Ship
// Composition", "Derived Cargo Capacity and Mining Rate", "Fleet Cargo Pool",
// "Derived Fleet Speed" (tasks 1.5–1.8, 1.10/1.10a in roster_handler_test.go).

// --- Fleet Ship Composition -------------------------------------------------

// Scenario: A newly seeded fleet carries a default roster.
func TestSeedFleet_Scenario_CarriesDefaultRoster(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	var saved Fleet
	dao.EXPECT().ListByCorporation(gomock.Any(), "dev-corp").Return(nil, nil)
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, f Fleet) error {
		saved = f
		return nil
	})

	if _, err := svc.SeedFleet(context.Background(), "sys-0", "dev-corp", space.Vec3{X: 100}, 6.0); err != nil {
		t.Fatal(err)
	}
	if len(saved.Ships) < 1 {
		t.Fatalf("seeded fleet roster = %v, want at least one (seed-class) ship, never empty", saved.Ships)
	}
	if saved.Ships[0].Class != ClassSeed {
		t.Fatalf("seeded ship class = %q, want %q", saved.Ships[0].Class, ClassSeed)
	}
}

// Scenario: A pre-existing fleet with no stored roster reads as one default
// hull (also pins the Migration Plan's live-data fallback, task 1.6).
func TestFleetShipComposition_Scenario_PreExistingFleetNoStoredRosterDefaultsToOneSeedHull(t *testing.T) {
	stats := map[ShipClass]ClassStats{ClassSeed: {MiningRate: 5, HoldCapacity: 100, LaneRate: 1}}
	legacy := Fleet{Id: "fleet-legacy"} // Ships is nil — pre-M10 SeedFleet output, real dev-emulator data

	if got := DerivedCapacity(legacy, stats); got != 100 {
		t.Errorf("legacy fleet (no stored roster) capacity = %v, want 100 (one default seed hull), never zero", got)
	}
	if got := DerivedMiningRate(legacy, stats); got != 5 {
		t.Errorf("legacy fleet (no stored roster) mining rate = %v, want 5 (one default seed hull), never zero", got)
	}
}

// --- Derived Cargo Capacity and Mining Rate / Fleet Cargo Pool -------------

// Scenario: Capacity and rate scale with roster composition.
func TestDerivedCapacityAndMiningRate_SumRoster(t *testing.T) {
	stats := map[ShipClass]ClassStats{
		ClassSeed:           {MiningRate: 5, HoldCapacity: 100, LaneRate: 1},
		ShipClass("hauler"): {MiningRate: 0, HoldCapacity: 300, LaneRate: 0.5},
	}
	f := Fleet{Ships: []ShipEntry{{Class: ClassSeed}, {Class: "hauler"}, {Class: ClassSeed}}}

	if got, want := DerivedCapacity(f, stats), 500.0; got != want {
		t.Errorf("DerivedCapacity = %v, want %v (sum of roster holds — 100+300+100)", got, want)
	}
	if got, want := DerivedMiningRate(f, stats), 10.0; got != want {
		t.Errorf("DerivedMiningRate = %v, want %v (sum of roster mining rates — 5+0+5)", got, want)
	}
}

// Scenario: A fresh fleet's cargo pool is empty.
func TestSeedFleet_Scenario_FreshCargoPoolIsEmpty(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	var saved Fleet
	dao.EXPECT().ListByCorporation(gomock.Any(), "dev-corp").Return(nil, nil)
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, f Fleet) error {
		saved = f
		return nil
	})
	if _, err := svc.SeedFleet(context.Background(), "sys-0", "dev-corp", space.Vec3{X: 100}, 6.0); err != nil {
		t.Fatal(err)
	}

	stats := DefaultClassStats()
	capacity := DerivedCapacity(saved, stats)
	if capacity <= 0 {
		t.Errorf("derived capacity of a freshly seeded fleet = %v, want > 0 (a seed hull's configured hold)", capacity)
	}
	if held := FreeHold(saved, stats); held != capacity {
		t.Errorf("free hold = %v, want == capacity (%v) — a fresh cargo pool holds nothing", held, capacity)
	}
}

// Scenario: Free hold accounts for all kinds currently held.
func TestFreeHold_AccountsForAllKindsHeld(t *testing.T) {
	stats := map[ShipClass]ClassStats{ClassSeed: {HoldCapacity: 100}}
	f := Fleet{
		Ships: []ShipEntry{{Class: ClassSeed}},
		Cargo: map[string]float64{
			string(system.ResourceMetals):    30,
			string(system.ResourceVolatiles): 20,
		},
	}
	if got, want := FreeHold(f, stats), 50.0; got != want {
		t.Errorf("FreeHold = %v, want %v (100 capacity − 30 − 20, ALL kinds combined, not per-kind)", got, want)
	}
}

// --- Derived Fleet Speed -----------------------------------------------------
//
// DELETED (migrate-fleet-to-continuous-burns, task 4.8): this section used to
// carry three tests pinning "Derived Fleet Speed" — a REMOVED requirement in
// this change's fleet-movement delta. `ClassStats.BurnRate`/`DerivedBurnRate`
// have no continuous-space meaning (board cells/world-ms) and are deleted by
// 4.8 outright; the successor requirement, "Derived Fleet Acceleration and
// Drive Output" (a different rule: minimum accel across the roster gating the
// fleet, summed drive output making a larger fleet louder), is already
// covered by derived_accel_test.go's red-phase tests. The three deleted
// tests were:
//
//   - TestDerivedBurnAndLaneRate_GateOnSlowestHull
//   - TestDerivedBurnAndLaneRate_SingleHullUsesThatClassRate
//   - TestDerivedFleetSpeed_Scenario_SeedClassValuePreservesGlobalConstants
//
// `ClassStats.LaneRate`/`DerivedLaneRate` are NOT part of the removed
// requirement — design.md Decision 10 keeps a fleet lane rate for the
// single-hop lane-jump ETA, and the successor requirement's own "Lane rate
// gates on the slowest hull" scenario re-declares it. Each deleted test above
// carried lane-rate assertions alongside the doomed burn-rate ones, so their
// lane-rate halves are preserved below rather than lost with the rest of the
// test.

// Scenario: Lane rate gates on the slowest hull (fleet-movement › "Derived
// Fleet Acceleration and Drive Output").
func TestDerivedLaneRate_Scenario_GatesOnSlowestHull(t *testing.T) {
	stats := map[ShipClass]ClassStats{
		ClassSeed:           {LaneRate: 2.0},
		ShipClass("hauler"): {LaneRate: 0.1},
	}
	f := Fleet{Ships: []ShipEntry{{Class: ClassSeed}, {Class: "hauler"}}}

	if got, want := DerivedLaneRate(f, stats), 0.1; got != want {
		t.Errorf("DerivedLaneRate = %v, want %v (the slowest hull's lane rate)", got, want)
	}
}

// SDET-added boundary case: the degenerate one-element roster of the gate
// above.
func TestDerivedLaneRate_SingleHullUsesThatClassRate(t *testing.T) {
	stats := map[ShipClass]ClassStats{ClassSeed: {LaneRate: 0.3}}
	f := Fleet{Ships: []ShipEntry{{Class: ClassSeed}}}
	if got := DerivedLaneRate(f, stats); got != 0.3 {
		t.Errorf("single-hull DerivedLaneRate = %v, want the seed class's own rate 0.3", got)
	}
}

// SDET-added regression guard, preserved from the deleted
// TestDerivedFleetSpeed_Scenario_SeedClassValuePreservesGlobalConstants: the
// seed class's configured lane rate must be the exact inverse of
// LaneMsPerDistance, so this refactor moves no existing fleet's lane-jump
// ETA. (The BurnRate half of that same guard is deleted with BurnRate
// itself — there is no in-system pacing constant left in MovementParams to
// pin against.)
func TestDerivedLaneRate_SeedClassValuePreservesGlobalConstants(t *testing.T) {
	mp := DefaultMovementParams()
	stats := DefaultClassStats()
	seed, ok := stats[ClassSeed]
	if !ok {
		t.Fatalf("DefaultClassStats has no %q entry (need one to preserve today's lane ETAs)", ClassSeed)
	}

	wantLaneRate := 1.0 / mp.LaneMsPerDistance
	if math.Abs(seed.LaneRate-wantLaneRate) > 1e-12 {
		t.Errorf("seed class LaneRate = %v, want %v (== 1/LaneMsPerDistance)", seed.LaneRate, wantLaneRate)
	}
}

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
	stats := map[ShipClass]ClassStats{ClassSeed: {MiningRate: 5, HoldCapacity: 100, BurnRate: 1, LaneRate: 1}}
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
		ClassSeed:           {MiningRate: 5, HoldCapacity: 100, BurnRate: 1, LaneRate: 1},
		ShipClass("hauler"): {MiningRate: 0, HoldCapacity: 300, BurnRate: 0.5, LaneRate: 0.5},
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

// Scenario: Fleet speed gates on the slowest hull on each axis.
func TestDerivedBurnAndLaneRate_GateOnSlowestHull(t *testing.T) {
	stats := map[ShipClass]ClassStats{
		ClassSeed:           {BurnRate: 1.0, LaneRate: 2.0},
		ShipClass("hauler"): {BurnRate: 0.4, LaneRate: 0.1},
	}
	f := Fleet{Ships: []ShipEntry{{Class: ClassSeed}, {Class: "hauler"}}}

	if got, want := DerivedBurnRate(f, stats), 0.4; got != want {
		t.Errorf("DerivedBurnRate = %v, want %v (the slowest hull's burn rate)", got, want)
	}
	if got, want := DerivedLaneRate(f, stats), 0.1; got != want {
		t.Errorf("DerivedLaneRate = %v, want %v (the slowest hull's lane rate, independent of burn)", got, want)
	}
}

// Scenario: A single-hull fleet moves at that hull's rates.
func TestDerivedBurnAndLaneRate_SingleHullUsesThatClassRate(t *testing.T) {
	stats := map[ShipClass]ClassStats{ClassSeed: {BurnRate: 0.7, LaneRate: 0.3}}
	f := Fleet{Ships: []ShipEntry{{Class: ClassSeed}}}
	if got := DerivedBurnRate(f, stats); got != 0.7 {
		t.Errorf("single-hull DerivedBurnRate = %v, want the seed class's own rate 0.7", got)
	}
	if got := DerivedLaneRate(f, stats); got != 0.3 {
		t.Errorf("single-hull DerivedLaneRate = %v, want the seed class's own rate 0.3", got)
	}
}

// Scenario: A single seed-class fleet's ETAs are unchanged from the pre-change
// constants — the critical regression guard: the seed class's configured
// burn/lane rates must be the exact inverse of today's global
// MsPerTile/LaneMsPerDistance, so the derived-rate refactor moves no existing
// fleet's timing.
func TestDerivedFleetSpeed_Scenario_SeedClassValuePreservesGlobalConstants(t *testing.T) {
	mp := DefaultMovementParams()
	stats := DefaultClassStats()
	seed, ok := stats[ClassSeed]
	if !ok {
		t.Fatalf("DefaultClassStats has no %q entry (need one to preserve today's burn/lane ETAs)", ClassSeed)
	}

	wantBurnRate := 1.0 / float64(mp.MsPerTile) // hexes/world-ms — inverting it back reproduces MsPerTile
	if math.Abs(seed.BurnRate-wantBurnRate) > 1e-12 {
		t.Errorf("seed class BurnRate = %v, want %v (== 1/MsPerTile)", seed.BurnRate, wantBurnRate)
	}
	wantLaneRate := 1.0 / mp.LaneMsPerDistance
	if math.Abs(seed.LaneRate-wantLaneRate) > 1e-12 {
		t.Errorf("seed class LaneRate = %v, want %v (== 1/LaneMsPerDistance)", seed.LaneRate, wantLaneRate)
	}
}

// DELETED (migrate-fleet-to-continuous-burns): this file used to carry two
// SDET-added regression guards pinning that the derived-rate refactor
// (ClassStats.BurnRate/LaneRate replacing the global MsPerTile/
// LaneMsPerDistance constants) moved no fleet's existing ETA arithmetic —
// TestOrderTo_RegressionGuard_BurnEtaMatchesMsPerTile (a hex-grid burn's
// arriveTime = hexes × MsPerTile) and
// TestOrderTravel_RegressionGuard_LaneLegEtaMatchesLaneMsPerDistance (a
// multi-hop lane leg's cost = length × LaneMsPerDistance, via the deleted
// planRoute/travelSvc fixtures).
//
// Both guards have no successor: OrderTo no longer computes a burn ETA from
// MsPerTile at all — it solves through space.SolveBurn against a commanded
// acceleration (design.md Decision 4/9) — and multi-hop lane travel is
// deleted outright (design.md Decision 10; ErrNoRoute/planRoute/routing.go
// are gone). There is no "the refactor must not move this arithmetic"
// property left to guard, because the arithmetic itself no longer exists.
// TestDerivedFleetSpeed_Scenario_SeedClassValuePreservesGlobalConstants
// (above) is untouched — it pins DefaultClassStats() against
// DefaultMovementParams()'s still-live MsPerTile/LaneMsPerDistance fields,
// which is a params-table invariant independent of how OrderTo spends them.

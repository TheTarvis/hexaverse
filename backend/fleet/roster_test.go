package fleet

import (
	"context"
	"math"
	"testing"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"
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
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, f Fleet) error {
		saved = f
		return nil
	})

	if _, err := svc.SeedFleet(context.Background(), "sys-0", "dev-corp", board.Cell{Ring: 3, Slot: 0}); err != nil {
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
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, f Fleet) error {
		saved = f
		return nil
	})
	if _, err := svc.SeedFleet(context.Background(), "sys-0", "dev-corp", board.Cell{Ring: 3, Slot: 0}); err != nil {
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

// SDET-added regression guard (see the SDET handoff report: this is NOT
// independently red today). Once golang-dev wires burn-ETA computation
// through DerivedBurnRate (task 1.7), a single-seed-class fleet's END-TO-END
// committed burn ETA must still equal today's MsPerTile-based arithmetic —
// exercising the CURRENT (pre-refactor) orderBurn path, which already uses
// the constant directly, so this is green today by construction. It exists
// to catch the refactor moving existing timings, not to prove new behavior;
// it MUST stay green through the refactor.
func TestOrderTo_RegressionGuard_BurnEtaMatchesMsPerTile(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(coastFleetAtCentre(), nil)

	dest := board.Cell{Ring: 4, Slot: 0}
	f, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Target: board.Target{Cell: &dest}})
	if err != nil {
		t.Fatal(err)
	}
	want := common.WorldMillis(4) * DefaultMovementParams().MsPerTile
	if f.State.Burn.ArriveTime != want {
		t.Fatalf("burn ETA = %d, want %d (4 hexes × today's MsPerTile) — the derived-rate refactor must not move this", f.State.Burn.ArriveTime, want)
	}
}

// SDET-added regression guard (the lane-leg counterpart of the burn-ETA guard
// above; NOT independently red today — see the SDET handoff report). Reuses
// routing_test.go's shared travel fixtures (fakeGraph/fakeTiers/chainGalaxy/
// travelSvc), whose lanes are each 10 units long.
func TestOrderTravel_RegressionGuard_LaneLegEtaMatchesLaneMsPerDistance(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _ := travelSvc(t, clk, map[string]observation.Tier{
		"A": observation.TierExplored, "B": observation.TierExplored, "C": observation.TierExplored,
	})
	f := &Fleet{Id: "fleet_1", CorporationId: "corp", SystemId: "A",
		State: board.MovementState{Mode: board.ModeCoast, Coast: &board.Orbit{Ring: 0}}}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{SystemId: "C"})
	if err != nil {
		t.Fatal(err)
	}
	lt := got.State.LaneTransit
	if len(lt.LegEtas) != 3 {
		t.Fatalf("fixture broken: LegEtas = %v, want length 3 (A,B,C)", lt.LegEtas)
	}
	wantPerLeg := common.WorldMillis(10 * DefaultMovementParams().LaneMsPerDistance) // each fixture lane is 10 units
	if gotLeg := lt.LegEtas[2] - lt.LegEtas[1]; gotLeg != wantPerLeg {
		t.Fatalf("lane leg cost = %d, want %d (10 units × today's LaneMsPerDistance) — the derived-rate refactor must not move this", gotLeg, wantPerLeg)
	}
}

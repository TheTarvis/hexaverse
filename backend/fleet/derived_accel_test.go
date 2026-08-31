package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.6/4.8 — "Derived Fleet Acceleration and Drive Output". Every
// test in this file is RED against a MISSING SYMBOL, not a test-code bug:
// as of this SDET pass, fleet/roster.go declares `ClassStats.BurnRate` (not
// `Accel`) and no `DriveOutput` field, and neither `DerivedAccelCeiling` nor
// `DerivedDriveOutput` exist anywhere in the package. OrderTo (service.go)
// uses a hard-coded `defaultAccel` constant and performs NO validation of
// `OrderRequest.Accel` at all — it is used directly, unchecked, wherever
// supplied.
//
// SDET-AUTHORED CONTRACT, subject to a developer's test-dispute if a
// materially different (but scenario-equivalent) shape is landed instead:
//
//   - `ClassStats.Accel float64` — per-class configured acceleration; the
//     fleet's ceiling is the MINIMUM across the roster (mirrors the
//     retired `BurnRate` field's own gating rule).
//   - `ClassStats.DriveOutput float64` — per-class configured drive output;
//     the fleet's total is the SUM across the roster.
//   - `DerivedAccelCeiling(f Fleet, stats map[ShipClass]ClassStats) float64`
//     and `DerivedDriveOutput(f Fleet, stats map[ShipClass]ClassStats) float64`,
//     named and shaped exactly like the package's existing
//     `DerivedBurnRate`/`DerivedCapacity`/`DerivedMiningRate` helpers.
//   - Two DISTINCT sentinel errors in OrderTo's validation: `ErrAccelAboveCeiling`
//     for a value greater than the fleet's derived ceiling, and
//     `ErrAccelBelowFloor` for a value less than `disclosure.MinCommandedAccel`
//     — and, per design.md Decision 9's own wording ("NaN, ±infinity, zero, and
//     negative values SHALL be rejected with the SAME named reason as an
//     out-of-bounds value, checked before either bound comparison"), every
//     non-finite or non-positive value is rejected as `ErrAccelBelowFloor`
//     too (the "too small/invalid" family, as distinct from "too large") —
//     checked FIRST, before either bound comparison ever runs, which is
//     exactly the guard that keeps a NaN from ever reaching
//     space.SolveBurn's flight-time quantization (tasks.md 4.11).
//
// A developer who prefers one shared sentinel for all three cases, or
// different names, should raise it as a dispute rather than silently
// diverging — the observable behavior (which values are accepted, which
// distinguishable reason rejects which family) is the actual spec contract;
// the identifiers are this SDET's best-effort naming of it.

import (
	"context"
	"errors"
	"math"
	"testing"

	"hexaverse/disclosure"
	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// --- roster-derived ceiling / drive output (pure, no Service) ---------------

// Scenario: Acceleration ceiling gates on the slowest hull.
func TestDerivedAccelCeiling_Scenario_GatesOnSlowestHull(t *testing.T) {
	stats := map[ShipClass]ClassStats{
		ClassSeed:           {Accel: 10},
		ShipClass("hauler"): {Accel: 4},
	}
	f := Fleet{Ships: []ShipEntry{{Class: ClassSeed}, {Class: "hauler"}}}
	if got, want := DerivedAccelCeiling(f, stats), 4.0; got != want {
		t.Errorf("DerivedAccelCeiling = %v, want %v (the slowest hull's configured acceleration)", got, want)
	}
}

// Scenario: Drive output sums across the roster.
func TestDerivedDriveOutput_Scenario_SumsAcrossRoster(t *testing.T) {
	stats := map[ShipClass]ClassStats{
		ClassSeed:           {DriveOutput: 3},
		ShipClass("hauler"): {DriveOutput: 5},
	}
	f := Fleet{Ships: []ShipEntry{{Class: ClassSeed}, {Class: "hauler"}}}
	if got, want := DerivedDriveOutput(f, stats), 8.0; got != want {
		t.Errorf("DerivedDriveOutput = %v, want %v (the SUM, not the minimum, of the roster's drive output)", got, want)
	}
}

// Scenario: A two-hull fleet has a strictly larger plume radius than a
// one-hull fleet at equal acceleration.
//
// WHEN a one-hull fleet and a two-hull fleet of the same class both commit a
// burn at the same commanded acceleration THEN the two-hull fleet's drive
// output is larger, and the plume radius disclosure.PlumeRadius derives
// from it is strictly greater than the one-hull fleet's. This is the
// scenario that makes proximity-disclosure's own already-shipped "A larger
// fleet is louder at equal acceleration" inducible for the first time
// (tasks.md 4.6's own framing) — fleet.DerivedDriveOutput is the missing
// link between a roster and disclosure.PlumeRadius.
func TestDerivedDriveOutput_Scenario_TwoHullFleetHasLargerPlumeRadiusAtEqualAccel(t *testing.T) {
	stats := map[ShipClass]ClassStats{ClassSeed: {Accel: 8, DriveOutput: 3}}
	oneHull := Fleet{Ships: []ShipEntry{{Class: ClassSeed}}}
	twoHull := Fleet{Ships: []ShipEntry{{Class: ClassSeed}, {Class: ClassSeed}}}
	const accel = 8.0

	oneOutput := DerivedDriveOutput(oneHull, stats)
	twoOutput := DerivedDriveOutput(twoHull, stats)
	if !(twoOutput > oneOutput) {
		t.Fatalf("two-hull drive output (%v) must exceed one-hull (%v)", twoOutput, oneOutput)
	}

	oneRadius := disclosure.PlumeRadius(oneOutput, accel)
	twoRadius := disclosure.PlumeRadius(twoOutput, accel)
	if !(twoRadius > oneRadius) {
		t.Errorf("disclosure.PlumeRadius(twoHull output=%v, accel=%v) = %v, want it STRICTLY greater than "+
			"the one-hull fleet's %v at the same commanded acceleration", twoOutput, accel, twoRadius, oneRadius)
	}
}

// --- OrderTo's commanded-acceleration validation ----------------------------

// fleetWithAccelCeiling returns a Service whose roster stats give a
// single-ClassSeed fleet a known acceleration ceiling — deterministic
// against a value this test controls, rather than DefaultClassStats' own
// (deliberately un-pinned, per design.md Decision 8's Open Question)
// starting numbers.
func fleetWithAccelCeiling(t *testing.T, clk *fakeClock, ceiling float64) (*Service, *MockDao, *fakeActions, *gomock.Controller) {
	t.Helper()
	svc, dao, fa, ctrl := newSvc(t, clk)
	svc.classStats = map[ShipClass]ClassStats{ClassSeed: {Accel: ceiling, DriveOutput: 3}}
	return svc, dao, fa, ctrl
}

// Scenario: A commanded acceleration above the ceiling is rejected.
func TestOrderTo_Scenario_AccelAboveCeilingRejected(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := fleetWithAccelCeiling(t, clk, 8.0)
	defer ctrl.Finish()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

	above := 8.1
	point := space.Vec3{X: 400}
	_, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point, Accel: &above})
	if !errors.Is(err, ErrAccelAboveCeiling) {
		t.Fatalf("err = %v, want ErrAccelAboveCeiling", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected order must not commit an action: %+v", fa.committed)
	}
}

// Scenario: A commanded acceleration below the disclosure floor is rejected.
func TestOrderTo_Scenario_AccelBelowDisclosureFloorRejected(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := fleetWithAccelCeiling(t, clk, 8.0)
	defer ctrl.Finish()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

	below := disclosure.MinCommandedAccel * 0.5
	point := space.Vec3{X: 400}
	_, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point, Accel: &below})
	if !errors.Is(err, ErrAccelBelowFloor) {
		t.Fatalf("err = %v, want ErrAccelBelowFloor", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected order must not commit an action: %+v", fa.committed)
	}
}

// Scenario: An omitted commanded acceleration defaults to the fleet's
// ceiling.
func TestOrderTo_Scenario_OmittedAccelDefaultsToCeiling(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := fleetWithAccelCeiling(t, clk, 8.0)
	defer ctrl.Finish()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

	point := space.Vec3{X: 400}
	got, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point})
	if err != nil {
		t.Fatalf("OrderTo: %v", err)
	}
	if got.State.Burn.Accel != 8.0 {
		t.Errorf("burn Accel = %v, want the fleet's derived ceiling 8.0 (an omitted commanded acceleration "+
			"must default to it, not to an unrelated fixed constant)", got.State.Burn.Accel)
	}
}

// Scenario: A non-finite or non-positive commanded acceleration is rejected.
//
// WHEN a burn order specifies NaN, +/-infinity, zero, or a negative
// commanded acceleration THEN the order is rejected with a named reason and
// no burn is solved. Checked BEFORE either bound comparison — design.md
// Decision 9's own text — which is exactly the guard that must exist to
// keep this SDET pass's "cross-target" fixture family (tasks.md 4.11,
// accel_nan_fixture_test.go) meaningful: without it, a NaN accel reaches
// space.SolveBurn's flight-time quantization, whose architecture-dependent
// int64(NaN) conversion is the whole reason 4.11 exists.
func TestOrderTo_Scenario_NonFiniteOrNonPositiveAccelRejected(t *testing.T) {
	for _, c := range []struct {
		name  string
		accel float64
	}{
		{"NaN", math.NaN()},
		{"+Inf", math.Inf(1)},
		{"-Inf", math.Inf(-1)},
		{"zero", 0},
		{"negative", -3},
	} {
		t.Run(c.name, func(t *testing.T) {
			clk := &fakeClock{now: 0}
			svc, dao, fa, ctrl := fleetWithAccelCeiling(t, clk, 8.0)
			defer ctrl.Finish()
			dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

			point := space.Vec3{X: 400}
			accel := c.accel
			_, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point, Accel: &accel})
			if err == nil {
				t.Fatalf("accel=%v: order succeeded, want rejection", c.accel)
			}
			if !errors.Is(err, ErrAccelBelowFloor) {
				t.Fatalf("accel=%v: err = %v, want ErrAccelBelowFloor (design.md Decision 9: the same named "+
					"reason as an out-of-bounds value)", c.accel, err)
			}
			if fa.committed != nil {
				t.Fatalf("accel=%v: a rejected order must not commit an action: %+v", c.accel, fa.committed)
			}
		})
	}
}

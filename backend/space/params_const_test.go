package space

import (
	"testing"

	"hexaverse/common"
)

// params_const_test.go closes the file-per-production-file test coverage
// gate (backend/space/params_const.go) with the tuning constants' own
// documented invariants — the relationships the rest of this package's
// scenarios (park_test.go, solve_test.go) depend on holding, rather than a
// restatement of each literal value where a relationship is the more
// meaningful assertion (design.md Decision 9: these are named placeholder
// constants carried over from the PoC, not spec-pinned numbers — except
// where design.md itself pins a literal worked example, asserted exactly
// below).

// Scenario: Station-Keeping Draws a Positive, Body-Derived Upkeep — the
// floor itself must be strictly positive for "a positive... upkeep" to
// hold even for a parentless body with no orbit of its own.
func TestStationKeepFloor_IsStrictlyPositive(t *testing.T) {
	if !(StationKeepFloor > 0) {
		t.Fatalf("StationKeepFloor = %v, want strictly positive", StationKeepFloor)
	}
}

// Scenario: Releasing a Station-Keep Hold Re-Circularizes... "at the held
// offset's planar radius, or [MinOrbitRadius] if that would be smaller" —
// the minimum itself must be strictly positive (never a zero-radius orbit).
func TestMinOrbitRadius_IsStrictlyPositive(t *testing.T) {
	if !(MinOrbitRadius > 0) {
		t.Fatalf("MinOrbitRadius = %v, want strictly positive", MinOrbitRadius)
	}
}

// Scenario: Flight Time Is the Brachistochrone of the Curve's Arc Length —
// MinArcLength's own doc comment pins its derivation exactly
// (FlightSeconds(L, 8) == 1 => L == 2); this is the relationship the
// constant must satisfy, not merely "some positive number".
func TestMinArcLength_MatchesItsDocumentedOneSecondDerivation(t *testing.T) {
	if !(MinArcLength > 0) {
		t.Fatalf("MinArcLength = %v, want strictly positive", MinArcLength)
	}
	const nominalAccel = 8.0
	got := FlightSeconds(MinArcLength, nominalAccel)
	if got != 1 {
		t.Errorf("FlightSeconds(MinArcLength=%v, accel=%v) = %v, want exactly 1 (the documented derivation: MinArcLength is one world-second of flight at 8 units/s^2)",
			MinArcLength, nominalAccel, got)
	}
}

// Scenario: A larger body gets a proportionally larger standoff —
// InsertionStandoff's documented linear form (base + size*perSize) is only
// strictly increasing in size if both terms are strictly positive.
func TestInsertionStandoffConstants_BothTermsStrictlyPositive(t *testing.T) {
	if !(insertionStandoffBase > 0) {
		t.Errorf("insertionStandoffBase = %v, want strictly positive", insertionStandoffBase)
	}
	if !(insertionStandoffPerSize > 0) {
		t.Errorf("insertionStandoffPerSize = %v, want strictly positive (required for InsertionStandoff to be strictly increasing in body.Size)", insertionStandoffPerSize)
	}
}

// SDET-added: InsertionStandoff's documented linear form evaluated at the
// degenerate zero-size body isolates the base term exactly — the cheapest
// possible direct check of the formula design.md pins, independent of the
// two-body comparison solve_test.go already covers.
func TestInsertionStandoff_ZeroSizeBodyIsolatesBaseTerm(t *testing.T) {
	got := InsertionStandoff(Body{Id: "point-mass", Size: 0})
	if got != insertionStandoffBase {
		t.Errorf("InsertionStandoff(size=0) = %v, want exactly insertionStandoffBase = %v", got, insertionStandoffBase)
	}
}

// Scenario: design.md Decision 5's own worked example — "insertionPeriod(r)
// = 5 + r*0.9" — pins InsertionPeriod's constants literally.
func TestInsertionPeriodConstants_MatchTheDocumentedWorkedExample(t *testing.T) {
	if insertionPeriodBaseSeconds != 5 {
		t.Errorf("insertionPeriodBaseSeconds = %v, want exactly 5 (design.md Decision 5's worked example)", insertionPeriodBaseSeconds)
	}
	if insertionPeriodPerRadius != 0.9 {
		t.Errorf("insertionPeriodPerRadius = %v, want exactly 0.9 (design.md Decision 5's worked example)", insertionPeriodPerRadius)
	}
	// Cross-check against InsertionPeriod itself at several radii, per the
	// worked example's own form: insertionPeriod(r) = 5 + r*0.9 seconds.
	for _, radius := range []float64{0, 10, 100} {
		want := common.WorldMillis((5 + radius*0.9) * 1000)
		got := InsertionPeriod(radius)
		if got != want {
			t.Errorf("InsertionPeriod(%v) = %d, want %d per insertionPeriod(r) = 5 + r*0.9 seconds", radius, got, want)
		}
	}
}

// Scenario: A Burn Path Is Displaced Perpendicular to the Chord to Clear
// the Star — design.md Risks pins the star-clearance factor at 2.5x
// literally. (StarClearanceRadius's own behavioral coverage — that no
// star-avoidance test previously called it directly — lives in
// park_test.go, alongside the rest of that file's park.go coverage; this
// test is scoped to the CONSTANT's own documented value and the identity
// it implies.)
func TestStarClearanceFactor_MatchesDocumentedMultiplier(t *testing.T) {
	if starClearanceFactor != 2.5 {
		t.Fatalf("starClearanceFactor = %v, want exactly 2.5 (design.md Risks: \"the star-clearance factor (2.5x)\")", starClearanceFactor)
	}
	if got := StarClearanceRadius(1); got != starClearanceFactor {
		t.Errorf("StarClearanceRadius(1) = %v, want exactly starClearanceFactor = %v (size 1 isolates the factor)", got, starClearanceFactor)
	}
}

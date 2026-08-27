package space

import "testing"

// space-kinematics: "Fixed-Round Iteration Replaces Every Data-Dependent
// Loop Exit" (the ArcParam half) and the shared infrastructure "Position
// Along the Curve Follows Arc Length" depends on (curve.go, tasks.md 1.7).
// A deliberately asymmetric curve (its Hermite control points neither
// collinear nor symmetric) so Point(0.5) is NOT the curve's own arc-length
// midpoint — exactly the property burn_test.go's arc-length-vs-parameter
// scenario needs a curve capable of distinguishing.
//
// Stated as the cubic the geometry actually describes and degree-elevated to
// the quintic the package stores (design.md Decision 11), so this fixture
// curve keeps its identical shape across that change and the scenarios built
// on it keep meaning what they meant.
func asymmetricCurve() Curve {
	return elevateCubicToQuintic(
		Vec3{X: 0, Y: 0, Z: 0},
		Vec3{X: 0, Y: 0, Z: 40}, // bulges hard toward +Z early...
		Vec3{X: 80, Y: 0, Z: 5}, // ...and barely at all near the end
		Vec3{X: 100, Y: 0, Z: 0},
	)
}

// Scenario: The arc-length search always runs the same number of steps —
// exactly six, for a fraction near the start of the curve and again for a
// fraction near the end, regardless of how quickly either could converge.
func TestCurve_Scenario_ArcParamAlwaysSixSteps(t *testing.T) {
	c := asymmetricCurve()
	_, stepsNearStart := c.ArcParam(0.02)
	_, stepsNearEnd := c.ArcParam(0.98)
	if stepsNearStart != 6 {
		t.Errorf("ArcParam(near start): steps = %d, want 6", stepsNearStart)
	}
	if stepsNearEnd != 6 {
		t.Errorf("ArcParam(near end): steps = %d, want 6", stepsNearEnd)
	}
	if stepsNearStart != stepsNearEnd {
		t.Errorf("step counts differ: near-start=%d near-end=%d, want equal (fixed trip count)", stepsNearStart, stepsNearEnd)
	}
}

// SDET-added boundary probe: the curve's own arc table is internally
// consistent — the cumulative length at the final (64th) table entry is the
// curve's total Length(), which burn_test.go's "arc length that prices the
// flight is the arc length that places the ship" scenario depends on being
// true at the Curve level before it can be true at the Burn level.
func TestCurve_ArcTable_FinalEntryIsTotalLength(t *testing.T) {
	c := asymmetricCurve()
	table := c.ArcTable()
	if table[0] != 0 {
		t.Errorf("ArcTable()[0] = %v, want exactly 0", table[0])
	}
	if table[64] != c.Length() {
		t.Errorf("ArcTable()[64] = %v, want exactly Length() = %v", table[64], c.Length())
	}
	for i := 1; i < len(table); i++ {
		if table[i] < table[i-1] {
			t.Fatalf("ArcTable is not non-decreasing at index %d: %v then %v", i, table[i-1], table[i])
		}
	}
}

// SDET-added boundary probe: Curve.Point at the two curve-parameter
// endpoints is exactly P0/P3 — the Bernstein-basis property every
// depart/arrive-exactness scenario in burn_test.go composes on top of.
func TestCurve_Point_EndpointsAreExact(t *testing.T) {
	c := asymmetricCurve()
	if got := c.Point(0); got != c.P0 {
		t.Errorf("Point(0) = %v, want P0 = %v", got, c.P0)
	}
	if got := c.Point(1); got != c.P5 {
		t.Errorf("Point(1) = %v, want P5 = %v", got, c.P5)
	}
}

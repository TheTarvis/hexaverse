package space

import (
	"math"
	"testing"

	"hexaverse/common"
)

// space-kinematics: "Orbital Position Is a Closed-Form Function of Time"
// (the pure-orbit half — the origin/parent-composition half lives in
// body_test.go, which needs the Bodies hierarchy), "A Body's Velocity Is
// Computed Analytically", "The Time Domain Is Explicit and Degenerate
// Orbital Elements Are Defined" (the Orbit half — Park's own epoch-relative
// wrap scenario lives in park_test.go, since Orbit carries no EpochMs of its
// own; see helpers_test.go's contract comment), and "Orbital Angles Resolve
// Through a Pinned Table" (the orbit-return-to-stored-phase scenario).
//
// This suite adds one function to the assumed contract beyond
// helpers_test.go's list, because the spec's own acceptance text requires an
// independent oracle for it:
//
//	func CosSin(idx SubTurns) (cos, sin float64) // table.go — the combined
//	    lookup Orbit.LocalPosition/LocalVelocity already have to have; the
//	    inclination scenario below names "the pinned table's sine entry" as
//	    the expected value directly, so the test needs to read that entry.

// Scenario: A non-zero inclination produces a genuinely three-dimensional
// path.
func TestOrbit_Scenario_InclinationProducesOutOfPlaneComponent(t *testing.T) {
	const radius = 50.0
	const period common.WorldMillis = 4_000 // divisible by 4: exact quarter-turn timing
	incl := SubTurns(SubTurn / 24)
	o := Orbit{Radius: radius, PeriodMs: period, Phase: 0, Inclination: incl, Node: 777}

	// At the ascending node's own phase index (phase=0, t=0): zero out-of-plane.
	atNode := o.LocalPosition(0)
	if atNode.Y != 0 {
		t.Errorf("Y at the ascending node's own phase index = %v, want exactly 0", atNode.Y)
	}

	// One quarter turn past the ascending node (t = period/4): the absolute
	// out-of-plane component equals radius * (the pinned table's sine entry
	// for the inclination), to within one ULP of that product.
	quarter := o.LocalPosition(period / 4)
	_, sinIncl := CosSin(incl)
	want := radius * sinIncl
	if !ulpsWithin(math.Abs(quarter.Y), math.Abs(want), 1) {
		t.Errorf("|Y| at quarter turn = %v, want %v (within 1 ULP)", math.Abs(quarter.Y), math.Abs(want))
	}
	if quarter.Y == 0 {
		t.Errorf("quarter-turn Y is exactly zero — path never leaves the plane")
	}
}

// Scenario (space-kinematics, Orbital Angles): An orbit returns to exactly
// its stored phase after one period.
func TestOrbit_Scenario_ReturnsToStoredPhaseAfterOnePeriod(t *testing.T) {
	o := Orbit{Radius: 30, PeriodMs: 12_345, Phase: 654_321}
	at0 := o.PhaseAt(0)
	atPeriod := o.PhaseAt(o.PeriodMs)
	if at0 != o.Phase {
		t.Fatalf("PhaseAt(0) = %d, want stored phase %d", at0, o.Phase)
	}
	if atPeriod != o.Phase {
		t.Fatalf("PhaseAt(period) = %d, want stored phase %d (identical to PhaseAt(0)=%d)", atPeriod, o.Phase, at0)
	}
}

// Scenario: A non-positive period is motionless — identical position at
// every world time, equal to the position at the stored phase, no division
// performed (observed indirectly: it must not panic and must be exactly
// constant across widely varying t, including t values that would overflow
// a division-based computation).
func TestOrbit_Scenario_NonPositivePeriodIsMotionless(t *testing.T) {
	for _, period := range []common.WorldMillis{0, -1, -999} {
		o := Orbit{Radius: 40, PeriodMs: period, Phase: 111_111, Inclination: 222, Node: 333}
		want := o.LocalPosition(0)
		for _, tm := range []common.WorldMillis{0, 1, 999, 1_000_000_000_000} {
			got := o.LocalPosition(tm)
			if got != want {
				t.Errorf("period=%d: LocalPosition(t=%d) = %v, want %v (motionless)", period, tm, got, want)
			}
			if idx := o.PhaseAt(tm); idx != o.Phase {
				t.Errorf("period=%d: PhaseAt(t=%d) = %d, want stored phase %d", period, tm, idx, o.Phase)
			}
		}
	}
}

// Scenario: Velocity is prograde — the dot product of local velocity and
// local position (relative to the parent), normalized by both magnitudes,
// is within 1e-9 of zero; and stepping forward along velocity lands closer
// to the true next position than stepping against it.
func TestOrbit_Scenario_VelocityIsPrograde(t *testing.T) {
	o := Orbit{Radius: 60, PeriodMs: 50_000, Phase: 300_000, Inclination: SubTurn / 20, Node: SubTurn / 6}
	const t0 common.WorldMillis = 12_345

	pos := o.LocalPosition(t0)
	vel := o.LocalVelocity(t0)

	dot := pos.Dot(vel)
	denom := pos.Length() * vel.Length()
	if denom == 0 {
		t.Fatal("degenerate test fixture: zero-length position or velocity")
	}
	normalizedDot := dot / denom
	if math.Abs(normalizedDot) >= 1e-9 {
		t.Errorf("normalized dot(position, velocity) = %v, want within 1e-9 of 0", normalizedDot)
	}

	// One millisecond later, the true position is closer to (pos + 1ms*vel)
	// than to (pos - 1ms*vel) — velocity points toward increasing phase.
	const dtMs = 1
	dtSeconds := float64(dtMs) / 1000
	trueNext := o.LocalPosition(t0 + dtMs)
	steppedForward := pos.Add(vel.Scale(dtSeconds))
	steppedBackward := pos.Sub(vel.Scale(dtSeconds))
	if dist(trueNext, steppedForward) >= dist(trueNext, steppedBackward) {
		t.Errorf("stepping along velocity (%v) is not closer to the true next position (%v) than stepping against it (%v)",
			steppedForward, trueNext, steppedBackward)
	}
}

// SDET-added boundary probe: LocalVelocity is a pure function of the orbit
// and time — evaluated twice, identical vector (the local-level companion
// to body_test.go's hierarchical "pure function" scenario).
func TestOrbit_LocalVelocity_IsPureFunction(t *testing.T) {
	o := Orbit{Radius: 15, PeriodMs: 7_000, Phase: 42, Inclination: 9, Node: 3}
	a := o.LocalVelocity(5_555)
	b := o.LocalVelocity(5_555)
	if a != b {
		t.Fatalf("LocalVelocity not pure: %v then %v", a, b)
	}
}

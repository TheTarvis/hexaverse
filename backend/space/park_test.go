package space

import (
	"math"
	"testing"

	"hexaverse/common"
)

// space-kinematics: "The Time Domain Is Explicit..." (the Park half — see
// orbit_test.go for why Orbit itself never needs the before-its-own-epoch
// case), "Idle Ships Park in Exactly One of Three Modes",
// "Station-Keeping Draws a Positive, Body-Derived Upkeep", and "Releasing a
// Station-Keep Hold Re-Circularizes at the Held Offset's Planar Radius".

// --- The Time Domain Is Explicit (Park half) --------------------------------

// Scenario: One full period before the epoch returns the stored phase
// exactly (Park version — Park is the type this capability actually stores
// an EpochMs on; see helpers_test.go's contract note).
func TestPark_Scenario_OneFullPeriodBeforeEpochReturnsStoredPhaseExactly(t *testing.T) {
	p := Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 8, PeriodMs: 40_000, Phase: 123_456, EpochMs: 50_000}
	got := p.PhaseAt(p.EpochMs - p.PeriodMs) // exactly one period before epoch
	if got != p.Phase {
		t.Fatalf("PhaseAt(epoch - period) = %d, want the stored phase %d exactly", got, p.Phase)
	}
}

// Scenario: A park evaluated before its own epoch wraps correctly, never
// panics — the spec's own literal instants (epoch 50,000ms, evaluated at
// 10,000ms). Because the exact wrap arithmetic is the production
// algorithm's own internal formula, this test does not re-derive it (doing
// so would just re-implement the SUT inside the test); instead it asserts
// the two independently-checkable properties the scenario actually demands:
// no panic, a valid table index, and consistency with the "returns to
// stored phase after one period" invariant applied at this same instant.
func TestPark_Scenario_EvaluatedBeforeEpochWrapsSafely(t *testing.T) {
	p := Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 8, PeriodMs: 90_000, Phase: 777_000, EpochMs: 50_000}
	const evalAt common.WorldMillis = 10_000 // strictly before EpochMs, still >= the world epoch (0)

	var idx SubTurns
	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("PhaseAt(t before epoch) panicked: %v", r)
			}
		}()
		idx = p.PhaseAt(evalAt)
	}()

	if idx < 0 || idx >= SubTurn {
		t.Fatalf("PhaseAt(t before epoch) = %d, want a value in [0, %d)", idx, SubTurn)
	}
	if got, want := p.PhaseAt(evalAt), p.PhaseAt(evalAt+p.PeriodMs); got != want {
		t.Errorf("PhaseAt(t)=%d and PhaseAt(t+period)=%d disagree — periodic advance is not self-consistent", got, want)
	}
	// Positional sanity: no panic here either, and the position is finite.
	bodies := testSystem()
	pos, err := p.Position(bodies, evalAt)
	requireNoError(t, err)
	if math.IsNaN(pos.X) || math.IsNaN(pos.Y) || math.IsNaN(pos.Z) {
		t.Errorf("Position(t before epoch) = %v, contains NaN", pos)
	}
}

// Scenario: A non-positive period is motionless (Park version — see
// orbit_test.go for the Orbit-level version of the same scenario). The
// spec's THEN — "its computed position is identical at every world time and
// equals its position at its stored phase" — is a claim about the park's
// own angular sweep freezing, not about its parent standing still; it is
// only observable directly on WORLD position when the parent itself is
// stationary. testSystem()'s "star" is the one body the spec pins at the
// origin (Orbit: nil), so it is the correct fixture here (adjudicated test
// defect: the original fixture attached to "planet1", itself orbiting, so
// the park's world position necessarily drifted along that parent's orbit
// no matter how the park's own period behaved — see the companion moving-
// body test below for the honest form of "motionless" in that case).
func TestPark_Scenario_NonPositivePeriodIsMotionless(t *testing.T) {
	bodies := testSystem()
	for _, period := range []common.WorldMillis{0, -1, -500} {
		p := Park{Kind: ParkOrbit, BodyId: "star", Radius: 12, PeriodMs: period, Phase: 55_555, EpochMs: 0}
		want, err := p.Position(bodies, 0)
		requireNoError(t, err)
		for _, tm := range []common.WorldMillis{0, 1, 999, 1_000_000_000} {
			got, err := p.Position(bodies, tm)
			requireNoError(t, err)
			if got != want {
				t.Errorf("period=%d: Position(t=%d) = %v, want %v (motionless)", period, tm, got, want)
			}
		}
	}
}

// SDET-added boundary probe: the honest form of "motionless" for a
// non-positive-period park attached to a MOVING parent (planet1, which
// orbits the star) — its own angular sweep still freezes, so it keeps a
// CONSTANT OFFSET from that parent at every world time, even though its
// world position itself translates with the parent (the parent-motion
// component the test above deliberately isolates away by using the
// stationary star instead). This is the property design.md/park.go actually
// implements for PeriodMs<=0 (PhaseAt returns the stored phase unconditionally,
// so the local radius/angle offset added to the parent's position never
// changes) and strengthens coverage beyond the literal scenario text rather
// than replacing it.
func TestPark_Scenario_NonPositivePeriodOnMovingBodyHoldsConstantOffset(t *testing.T) {
	bodies := testSystem()
	for _, period := range []common.WorldMillis{0, -1, -500} {
		p := Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 12, PeriodMs: period, Phase: 55_555, EpochMs: 0}

		bodyAt0, err := Position(bodies, "planet1", 0)
		requireNoError(t, err)
		posAt0, err := p.Position(bodies, 0)
		requireNoError(t, err)
		wantOffset := posAt0.Sub(bodyAt0)

		for _, tm := range []common.WorldMillis{0, 1, 999, 50_000} {
			bodyAt, err := Position(bodies, "planet1", tm)
			requireNoError(t, err)
			pos, err := p.Position(bodies, tm)
			requireNoError(t, err)
			gotOffset := pos.Sub(bodyAt)
			if !almostEqualVec(gotOffset, wantOffset, tightTolerance) {
				t.Errorf("period=%d t=%d: offset from moving body = %v, want constant offset %v", period, tm, gotOffset, wantOffset)
			}
		}
	}
}

// --- Idle Ships Park in Exactly One of Three Modes --------------------------

// Scenario: An orbit park stays at its configured radius from its body
// forever.
func TestPark_Scenario_OrbitStaysAtConfiguredRadius(t *testing.T) {
	bodies := testSystem()
	p := Park{Kind: ParkOrbit, BodyId: "planet2", Radius: 8, PeriodMs: 5_000, Phase: 0, EpochMs: 0}
	for _, tm := range []common.WorldMillis{0, 8_300, 55_000} {
		pos, err := p.Position(bodies, tm)
		requireNoError(t, err)
		bodyPos, err := Position(bodies, "planet2", tm)
		requireNoError(t, err)
		got := dist(pos, bodyPos)
		if !almostEqual(got, p.Radius, looseTolerance) {
			t.Errorf("t=%d: distance from body = %v, want radius %v", tm, got, p.Radius)
		}
	}
}

// Scenario: A station-keep park holds the exact stored offset.
func TestPark_Scenario_StationKeepHoldsExactOffset(t *testing.T) {
	bodies := testSystem()
	offset := Vec3{X: 4, Y: 1, Z: -3}
	p := Park{Kind: ParkStationkeep, BodyId: "planet1", Offset: offset}
	for _, tm := range []common.WorldMillis{0, 9_900} {
		got, err := p.Position(bodies, tm)
		requireNoError(t, err)
		bodyPos, err := Position(bodies, "planet1", tm)
		requireNoError(t, err)
		want := bodyPos.Add(offset)
		if got != want {
			t.Errorf("t=%d: Position = %v, want body(%v) + offset = %v", tm, got, bodyPos, want)
		}
	}
}

// Scenario: A point park never moves.
func TestPark_Scenario_PointParkNeverMoves(t *testing.T) {
	bodies := testSystem()
	p := Park{Kind: ParkPoint, Point: Vec3{X: 1, Y: 2, Z: 3}}
	a, err := p.Position(bodies, 0)
	requireNoError(t, err)
	b, err := p.Position(bodies, 9_999_999)
	requireNoError(t, err)
	if a != b {
		t.Fatalf("point park moved: %v then %v", a, b)
	}
	if a != p.Point {
		t.Fatalf("point park position = %v, want the stored point %v", a, p.Point)
	}
}

// --- Station-Keeping Draws a Positive, Body-Derived Upkeep ------------------

// Scenario: Every body in a generated system charges a positive rate.
func TestStationKeepRate_Scenario_EveryBodyChargesPositiveRate(t *testing.T) {
	bodies := testSystem()
	for id := range bodies {
		rate, err := StationKeepRate(bodies, id)
		requireNoError(t, err)
		if !(rate > 0) {
			t.Errorf("StationKeepRate(%q) = %v, want strictly positive", id, rate)
		}
	}
}

// Scenario: A body with no orbit of its own charges exactly the configured
// floor.
func TestStationKeepRate_Scenario_NoOrbitChargesExactlyTheFloor(t *testing.T) {
	bodies := testSystem() // "star" has Orbit == nil
	got, err := StationKeepRate(bodies, "star")
	requireNoError(t, err)
	if got != StationKeepFloor {
		t.Fatalf("StationKeepRate(star) = %v, want exactly the configured floor %v", got, StationKeepFloor)
	}
}

// Scenario: An inner, faster body charges more than an outer, slower one.
func TestStationKeepRate_Scenario_InnerFasterBodyChargesMore(t *testing.T) {
	bodies := fakeBodies{
		"star":  {Id: "star", Size: 6},
		"inner": {Id: "inner", Size: 1, Orbit: &Orbit{ParentId: "star", Radius: 10, PeriodMs: 20_000}},
		"outer": {Id: "outer", Size: 1, Orbit: &Orbit{ParentId: "star", Radius: 40, PeriodMs: 160_000}},
	}
	innerRate, err := StationKeepRate(bodies, "inner")
	requireNoError(t, err)
	outerRate, err := StationKeepRate(bodies, "outer")
	requireNoError(t, err)
	if !(innerRate > outerRate) {
		t.Fatalf("inner rate %v is not greater than outer rate %v", innerRate, outerRate)
	}

	// SDET-added: cross-check against the spec's own named formula
	// (2*pi/period)^2 * radius, with a generous SDET-chosen tolerance
	// (not spec-pinned) since this test's math.Pi-based computation and
	// the implementation's chosen operation grouping are not guaranteed
	// to round identically, only closely.
	formula := func(period common.WorldMillis, radius float64) float64 {
		periodSeconds := float64(period) / 1000
		omega := 2 * math.Pi / periodSeconds
		return omega * omega * radius
	}
	wantInner := formula(20_000, 10)
	wantOuter := formula(160_000, 40)
	if !almostEqual(innerRate, wantInner, 1e-6*wantInner) {
		t.Errorf("inner rate = %v, want ~%v per (2*pi/period)^2*radius", innerRate, wantInner)
	}
	if !almostEqual(outerRate, wantOuter, 1e-6*wantOuter) {
		t.Errorf("outer rate = %v, want ~%v per (2*pi/period)^2*radius", outerRate, wantOuter)
	}
}

// SDET-added: "No Value Is Derived From Accumulated Per-Tick State" —
// accrued station-keep upkeep is a closed-form product of rate and elapsed
// time, so summing many small sub-intervals must equal one call over the
// whole span. This scenario is stated generically over "position, velocity,
// remaining resource, park, or burn state"; station-keep upkeep is this
// package's concrete "remaining resource" instance, and the spec's own
// example scenario ("500 consecutive sub-intervals") is exercised here.
func TestStationKeepUpkeep_Scenario_ReadCountIndependent(t *testing.T) {
	const rate = 0.75
	const from common.WorldMillis = 1_000
	const to common.WorldMillis = 51_000

	oneShot := StationKeepUpkeep(rate, from, to)

	const steps = 500
	span := to - from
	summed := 0.0
	cursor := from
	for i := 0; i < steps; i++ {
		next := from + common.WorldMillis(int64(span)*int64(i+1)/steps)
		summed += StationKeepUpkeep(rate, cursor, next)
		cursor = next
	}
	if !almostEqual(oneShot, summed, tightTolerance) {
		t.Errorf("one-shot upkeep = %v, summed over %d sub-intervals = %v, want identical", oneShot, steps, summed)
	}
}

// --- Releasing a Station-Keep Hold Re-Circularizes --------------------------

// Scenario: A released hold's orbit radius drops the vertical offset
// component.
func TestReleaseStationkeep_Scenario_DropsVerticalComponent(t *testing.T) {
	got := ReleaseStationkeep("planet1", Vec3{X: 3, Y: 2, Z: 4}, 50)
	if got.Kind != ParkOrbit {
		t.Fatalf("released hold kind = %v, want ParkOrbit", got.Kind)
	}
	if got.Radius != 5 {
		t.Fatalf("released hold radius = %v, want exactly 5 (planar magnitude of (3, _, 4), vertical dropped)", got.Radius)
	}
	if got.EpochMs != 50 {
		t.Fatalf("released hold epoch = %d, want 50 (the release time)", got.EpochMs)
	}
}

// Scenario: A hold directly above the body re-circularizes at the minimum
// radius, not zero, with the documented default phase index.
func TestReleaseStationkeep_Scenario_DirectlyAboveUsesMinimumRadiusAndDefaultPhase(t *testing.T) {
	got := ReleaseStationkeep("planet1", Vec3{X: 0, Y: 5, Z: 0}, 0)
	if got.Radius != MinOrbitRadius {
		t.Fatalf("released hold (directly above) radius = %v, want the configured minimum orbit radius %v, not zero", got.Radius, MinOrbitRadius)
	}
	if got.Radius == 0 {
		t.Fatalf("released hold radius is zero")
	}
	if got.Phase != DefaultPhaseIndex {
		t.Fatalf("released hold (directly above) phase = %d, want the documented default phase index %d", got.Phase, DefaultPhaseIndex)
	}
}

// --- SDET-added: closing coverage gaps found independent of file naming ----
//
// QA's independent coverage pass (go test -cover) found StarClearanceRadius
// at 0% — every star-avoidance scenario in solve_test.go passes a literal
// clearance directly to BuildCurve, so the function BuildCurve's own doc
// comment names as clearance's intended source was never itself called. It
// belongs here, alongside this file's other park.go coverage. Also added:
// Park.Velocity's ParkPoint case and its PeriodMs<=0 short-circuit for
// ParkOrbit, both previously unexercised (64.3% function coverage on
// Velocity, no scenario names either branch by name).

// Scenario: A Burn Path Is Displaced Perpendicular to the Chord to Clear
// the Star — StarClearanceRadius scales linearly with the star's size, no
// additive floor term.
func TestStarClearanceRadius_Scenario_ScalesWithStarSize(t *testing.T) {
	small := StarClearanceRadius(2)
	big := StarClearanceRadius(6)
	if !(big > small) {
		t.Fatalf("StarClearanceRadius(6) = %v, not strictly greater than StarClearanceRadius(2) = %v", big, small)
	}
	if got, want := big/small, 6.0/2.0; got != want {
		t.Errorf("StarClearanceRadius(6)/StarClearanceRadius(2) = %v, want exactly %v (a pure linear scale, per design.md Risks' 2.5x factor)", got, want)
	}
}

// SDET-added boundary probe: a zero-size star clears at radius zero.
func TestStarClearanceRadius_ZeroSizeIsZero(t *testing.T) {
	if got := StarClearanceRadius(0); got != 0 {
		t.Errorf("StarClearanceRadius(0) = %v, want exactly 0", got)
	}
}

// SDET-added (Source 2 gap): Park.Velocity's ParkPoint case — a point park
// never moves, so its velocity is exactly the zero vector at any world
// time, with no body lookup required. The velocity-half analogue of
// TestPark_Scenario_PointParkNeverMoves (position) above.
func TestPark_Velocity_PointParkIsAlwaysZero(t *testing.T) {
	bodies := testSystem()
	p := Park{Kind: ParkPoint, Point: Vec3{X: 1, Y: 2, Z: 3}}
	for _, tm := range []common.WorldMillis{0, 9_999_999} {
		got, err := p.Velocity(bodies, tm)
		requireNoError(t, err)
		if got != (Vec3{}) {
			t.Errorf("Velocity(point park, t=%d) = %v, want the zero vector", tm, got)
		}
	}
}

// SDET-added (Source 2 gap): Park.Velocity's PeriodMs<=0 short-circuit for
// an orbit park — a frozen angular sweep contributes no local velocity
// component, so the park's velocity is exactly its parent body's own
// velocity. Uses the MOVING parent (planet1, not the stationary star) so
// the two are actually distinguishable from the zero vector.
func TestPark_Velocity_NonPositivePeriodOrbitMatchesBodyVelocityExactly(t *testing.T) {
	bodies := testSystem()
	for _, period := range []common.WorldMillis{0, -1, -500} {
		p := Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 12, PeriodMs: period, Phase: 55_555, EpochMs: 0}
		for _, tm := range []common.WorldMillis{0, 1, 999, 50_000} {
			bodyVel, err := Velocity(bodies, "planet1", tm)
			requireNoError(t, err)
			got, err := p.Velocity(bodies, tm)
			requireNoError(t, err)
			if got != bodyVel {
				t.Errorf("period=%d t=%d: Velocity = %v, want exactly the parent body's own velocity %v (frozen angular sweep contributes nothing)",
					period, tm, got, bodyVel)
			}
		}
	}
}

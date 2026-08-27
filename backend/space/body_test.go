package space

import (
	"errors"
	"testing"

	"hexaverse/common"
)

// space-kinematics: "Orbital Position Is a Closed-Form Function of Time"
// (the hierarchical half) and "A Body's Velocity Is Computed Analytically,
// Not by Finite Difference" (the hierarchical-composition + pure-function
// halves). Uses the shared testSystem()/cyclicBodies() fixtures from
// helpers_test.go and the assumed Position/Velocity/Bodies contract there.
//
// The spec's own example instants are given in fractional "sim-seconds"
// (0, 3.7, 111.9) — leftover PoC phrasing from before design.md Decision 2
// moved every time value to integer common.WorldMillis. This suite
// translates them to the millisecond equivalents (0, 3700, 111900) the
// actual Position(bodies, id, t common.WorldMillis) signature accepts,
// preserving the scenario's intent (arbitrary, non-round instants) rather
// than its now-superseded units.

var sampleWorldTimes = []common.WorldMillis{0, 3_700, 111_900}

// Scenario: Distance from parent equals the stored orbit radius at any time.
func TestPosition_Scenario_DistanceFromParentEqualsStoredRadius(t *testing.T) {
	bodies := testSystem()
	for id, body := range bodies {
		if body.Orbit == nil {
			continue
		}
		for _, tm := range sampleWorldTimes {
			childPos, err := Position(bodies, id, tm)
			requireNoError(t, err)
			parentPos, err := Position(bodies, body.Orbit.ParentId, tm)
			requireNoError(t, err)
			got := dist(childPos, parentPos)
			if !almostEqual(got, body.Orbit.Radius, looseTolerance) {
				t.Errorf("body %q at t=%d: distance from parent = %v, want radius %v", id, tm, got, body.Orbit.Radius)
			}
		}
	}
}

// Scenario: The star sits at the origin at every time.
func TestPosition_Scenario_ParentlessBodyIsAlwaysAtOrigin(t *testing.T) {
	bodies := testSystem()
	for _, tm := range sampleWorldTimes {
		got, err := Position(bodies, "star", tm)
		requireNoError(t, err)
		if got != (Vec3{}) {
			t.Errorf("Position(star, t=%d) = %v, want the origin", tm, got)
		}
	}
}

// Scenario: A moon's position composes its parent's position with its own
// offset.
func TestPosition_Scenario_MoonComposesParentPositionWithLocalOffset(t *testing.T) {
	bodies := testSystem()
	moon := bodies["moon1"]
	for _, tm := range sampleWorldTimes {
		got, err := Position(bodies, "moon1", tm)
		requireNoError(t, err)
		parentPos, err := Position(bodies, moon.Orbit.ParentId, tm)
		requireNoError(t, err)
		want := parentPos.Add(moon.Orbit.LocalPosition(tm))
		if got != want {
			t.Errorf("Position(moon1, t=%d) = %v, want parent(%v) + local offset = %v", tm, got, parentPos, want)
		}
	}
}

// Scenario: An unknown parent identity fails with a named sentinel error,
// never a panic.
func TestPosition_Scenario_UnknownParentFailsNamed(t *testing.T) {
	bodies := fakeBodies{
		"orphan": {Id: "orphan", Size: 1, Orbit: &Orbit{ParentId: "does-not-exist", Radius: 5, PeriodMs: 1000}},
	}
	_, err := Position(bodies, "orphan", 0)
	if !errors.Is(err, ErrUnknownBody) {
		t.Fatalf("err = %v, want errors.Is(err, ErrUnknownBody)", err)
	}
}

// Scenario: A cyclic parent chain fails with a named error, not unbounded
// recursion.
func TestPosition_Scenario_CyclicParentChainFailsNamed(t *testing.T) {
	bodies := cyclicBodies()
	_, err := Position(bodies, "a", 0)
	if !errors.Is(err, ErrBodyCycle) {
		t.Fatalf("err = %v, want errors.Is(err, ErrBodyCycle)", err)
	}
}

// Scenario: Velocity is a pure function of the body and the time.
func TestVelocity_Scenario_IsPureFunction(t *testing.T) {
	bodies := testSystem()
	a, err := Velocity(bodies, "moon1", 4_242)
	requireNoError(t, err)
	b, err := Velocity(bodies, "moon1", 4_242)
	requireNoError(t, err)
	if a != b {
		t.Fatalf("Velocity not pure: %v then %v", a, b)
	}
}

// SDET-added: the hierarchical-composition half of "A Body's Velocity Is
// Computed Analytically" — "a parented body's velocity SHALL equal its
// parent's velocity at that time plus its own local orbital velocity" is
// stated as a rule in the requirement's body text, not spun out into its own
// numbered scenario, but it is directly load-bearing and cheap to pin
// exactly here.
func TestVelocity_ParentedBodyIsParentVelocityPlusLocalVelocity(t *testing.T) {
	bodies := testSystem()
	moon := bodies["moon1"]
	const tm common.WorldMillis = 8_765

	got, err := Velocity(bodies, "moon1", tm)
	requireNoError(t, err)
	parentVel, err := Velocity(bodies, moon.Orbit.ParentId, tm)
	requireNoError(t, err)
	want := parentVel.Add(moon.Orbit.LocalVelocity(tm))
	if got != want {
		t.Errorf("Velocity(moon1, t=%d) = %v, want parent(%v) + local velocity = %v", tm, got, parentVel, want)
	}
}

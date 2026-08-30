package space

import "testing"

// space-kinematics (design.md Decision 8, Open Question 1): "Stop In Place
// Commits a Velocity-Nulling Burn" needs a named threshold at or below which
// stopping is a free, instant conversion to a point park rather than a
// solved burn — otherwise a fleet drifting slow enough that its stopping
// arc falls below space.MinArcLength is permanently unstoppable
// (space.SolveBurn rejects any curve below MinArcLength with
// ErrArcTooShort).
//
// tasks.md 2.3 asks only that the constant EXISTS and is STRICTLY POSITIVE;
// design.md itself calls the exact value "a recommendation, not a decision"
// and "a feel dial ... not spec-pinned" (Decision 8's own alternatives
// discussion). This suite therefore does NOT pin an exact numeric value or
// a specific derivation formula — doing so would assert an SDET-invented
// number the spec explicitly declines to pin, and a legitimate
// implementation choosing a different (but still positive, still
// MinArcLength-derived-in-spirit) value would then fail a test that
// misreads the spec rather than one that catches a real defect.

// Scenario (space-kinematics: "Stop In Place Commits a Velocity-Nulling
// Burn" — the threshold the "at or below" / "above" split is drawn against
// must itself be a real, usable speed): StopInPlaceSpeedFloor exists and is
// strictly positive.
func TestStopInPlaceSpeedFloor_IsStrictlyPositive(t *testing.T) {
	if !(StopInPlaceSpeedFloor > 0) {
		t.Fatalf("StopInPlaceSpeedFloor = %v, want strictly positive", StopInPlaceSpeedFloor)
	}
}

// SDET-added boundary probe: a sanity ceiling, generous enough to accept any
// plausible "slow enough nobody would notice" speed but tight enough to
// catch a gross unit error (e.g. accidentally expressing the floor in
// world-milliseconds or as an already-squared quantity). Not a spec-pinned
// bound — failing this is a strong signal to re-examine units, not
// necessarily a defect.
func TestStopInPlaceSpeedFloor_SanityCeiling(t *testing.T) {
	const generousCeiling = 1_000.0
	if StopInPlaceSpeedFloor >= generousCeiling {
		t.Errorf("StopInPlaceSpeedFloor = %v, want well under %v (sanity check against a unit-scale error, not a spec-pinned bound)", StopInPlaceSpeedFloor, generousCeiling)
	}
}

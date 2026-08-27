package disclosure

import (
	"math"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// --- the inclusive tie rule --------------------------------------------------

// Scenario: Squared distance exactly equal to squared range discloses
// (proximity-disclosure › "Every Exact Boundary Resolves Toward
// Disclosure"). tasks.md 3.5.
//
// The construction is exact on purpose: an observer at the origin and a
// target at (R, 0, 0) gives a squared distance of exactly R*R, the same
// float64 the predicate compares against. There is no tolerance in this
// test and there must not be — `<` and `<=` are a one-character difference
// that no naturally occurring test distinguishes, which is why the spec
// demands this one.
func TestWithinRange_ExactEqualityDiscloses(t *testing.T) {
	observer := space.Vec3{}
	target := space.Vec3{X: PassiveRange}
	if got, want := observer.DistSq(target), float64(PassiveRange*PassiveRange); got != want {
		t.Fatalf("construction is not exact: DistSq = %v, rangeSq = %v", got, want)
	}
	if !WithinRange(observer, target, PassiveRange) {
		t.Error("a target at exactly range is not disclosed; the disclosed set must be CLOSED at its boundary")
	}
}

// Scenario: One representable step beyond range does not disclose
// (proximity-disclosure › "Every Exact Boundary Resolves Toward
// Disclosure"). tasks.md 3.6.
//
// The out-of-range side is built from math.Nextafter over the squared
// range rather than from a hand-typed literal, because a literal cannot
// express "one representable step" and a test that says 12.0001 proves
// nothing about the boundary. The target is offset perpendicular by exactly
// the amount that carries the squared distance up one ULP.
func TestWithinRange_OneUlpBeyondRangeDoesNotDisclose(t *testing.T) {
	rangeSq := float64(PassiveRange * PassiveRange)
	justBeyond := math.Nextafter(rangeSq, math.Inf(1))

	observer := space.Vec3{}
	target := space.Vec3{X: PassiveRange, Y: math.Sqrt(justBeyond - rangeSq)}

	if got := observer.DistSq(target); got != justBeyond {
		t.Fatalf("construction missed the boundary: DistSq = %v, want the next representable above rangeSq %v", got, justBeyond)
	}
	if WithinRange(observer, target, PassiveRange) {
		t.Error("a target one representable step beyond range is disclosed; the boundary is closed, not open")
	}
}

// --- the exact integer emission interval -------------------------------------

// Scenario: Emission is on during the burn interval / The arrival instant
// ends the emission / A parked fleet never emits (proximity-disclosure ›
// "Whether a Plume Exists Is an Exact Integer Test"). tasks.md 3.7.
//
// Every case here is an integer comparison over common.WorldMillis. There
// is no float in the predicate and therefore no boundary to flip: this is
// the half of the loud channel that is exact by construction, and the
// half-open end is what makes arrival the instant emission stops — the same
// convention space.StateAt already folds a burn on.
func TestEmitting_IsTheHalfOpenIntegerInterval(t *testing.T) {
	const depart, arrive common.WorldMillis = 1_000, 5_000
	burning := burningFrom("f", space.Vec3{}, space.Vec3{X: 100}, depart, arrive, 8, 2)

	cases := []struct {
		name string
		at   common.WorldMillis
		want bool
	}{
		{"one millisecond before departure", depart - 1, false},
		{"exactly at departure", depart, true},
		{"mid-burn", (depart + arrive) / 2, true},
		{"one millisecond before arrival", arrive - 1, true},
		{"exactly at arrival", arrive, false},
		{"after arrival", arrive + 1, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Emitting(burning.State, c.at); got != c.want {
				t.Errorf("Emitting at %d = %v, want %v", c.at, got, c.want)
			}
		})
	}

	parked := parkedAt("p", space.Vec3{X: 30})
	for _, at := range []common.WorldMillis{0, depart, arrive, 1 << 40} {
		if Emitting(parked.State, at) {
			t.Errorf("a parked fleet emits at %d; a parked fleet never emits", at)
		}
	}
}

// --- the plume radius curve --------------------------------------------------

// Scenario: Reducing commanded acceleration shrinks the signature /
// A larger fleet is louder at equal acceleration (proximity-disclosure ›
// "Plume Radius Derives From Drive Output and Is Floored"). tasks.md 3.8.
//
// Both inputs are stored values read directly — the fleet's aggregate drive
// output and the burn's own commanded acceleration — so neither branch of
// this curve is re-derived from motion. Values are chosen above the floor,
// since the floor's whole job is to flatten the curve underneath it.
func TestPlumeRadius_ScalesWithBothInputs(t *testing.T) {
	const driveOutput, higherOutput = 2.0, 3.0
	const gentle, hard = 4.0, 8.0

	quiet := PlumeRadius(driveOutput, gentle)
	loud := PlumeRadius(driveOutput, hard)
	if !(quiet > PlumeFloor && loud > PlumeFloor) {
		t.Fatalf("both cases must clear the floor for this comparison to mean anything: %v, %v (floor %v)", quiet, loud, PlumeFloor)
	}
	if !(quiet < loud) {
		t.Errorf("a gentler burn (%v) is not quieter than a hard one (%v); silent running has no value", quiet, loud)
	}

	small := PlumeRadius(driveOutput, hard)
	big := PlumeRadius(higherOutput, hard)
	if !(small < big) {
		t.Errorf("greater aggregate drive output (%v) is not louder than lesser (%v); the coarse size signal is gone", big, small)
	}
}

// Scenario: The floor makes ignition an event (proximity-disclosure ›
// "Plume Radius Derives From Drive Output and Is Floored"). tasks.md 3.9.
//
// The floor is what answers the design's own open question in the
// affirmative: however gently a burn is commanded, lighting a drive is
// detectable by anyone who could already see the fleet cold. Below the
// floor the curve flattens, which is the one place the strict-monotonicity
// scenario above deliberately does not apply.
func TestPlumeRadius_FloorsAtMinimumCommandedAccel(t *testing.T) {
	const driveOutput = 2.0
	if got := PlumeRadius(driveOutput, MinCommandedAccel); got < PlumeFloor {
		t.Errorf("PlumeRadius at the minimum commanded accel = %v, want no less than the floor %v", got, PlumeFloor)
	}
	// Two burns both under the floor are equal, not ordered — the floor
	// clamps, so the "strictly smaller" rule holds only above it.
	a := PlumeRadius(driveOutput, MinCommandedAccel)
	b := PlumeRadius(driveOutput, MinCommandedAccel/2)
	if a != b || a != PlumeFloor {
		t.Errorf("two sub-floor burns must both clamp to the floor: %v, %v (floor %v)", a, b, PlumeFloor)
	}
}

// --- the plume's geometric half ----------------------------------------------

// Scenario: A burning fleet is disclosed beyond passive range
// (proximity-disclosure › "Plume Radius Derives From Drive Output and Is
// Floored"). tasks.md 3.4.
//
// The comparison is against the squared SUM of the observer's passive range
// and the emitter's plume radius, and it inherits the same inclusive tie
// rule as every other predicate here — asserted at exact equality, not just
// comfortably inside.
func TestPlumeReaches_IsTheSquaredInclusiveSumOfBothRadii(t *testing.T) {
	plume := PlumeRadius(2, 8)
	reach := PassiveRange + plume

	observer := space.Vec3{}
	beyondPassive := space.Vec3{X: PassiveRange + 1}
	if WithinRange(observer, beyondPassive, PassiveRange) {
		t.Fatal("the emitter must be outside passive range for this scenario to mean anything")
	}
	if !PlumeReaches(observer, beyondPassive, PassiveRange, plume) {
		t.Error("an emitting fleet just outside passive range is not disclosed by its plume")
	}

	exactlyAtReach := space.Vec3{X: reach}
	if !PlumeReaches(observer, exactlyAtReach, PassiveRange, plume) {
		t.Error("an emitter at exactly the combined reach is not disclosed; the plume channel's boundary is closed too")
	}

	beyondReach := space.Vec3{X: math.Nextafter(reach, math.Inf(1))}
	if PlumeReaches(observer, beyondReach, PassiveRange, plume) {
		t.Error("an emitter beyond the combined reach is disclosed")
	}
}

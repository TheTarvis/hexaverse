package disclosure

import (
	"math"
	"testing"

	"hexaverse/space"
)

// Scenario: A fleet directly behind the star is not disclosed / Occlusion
// hides a plume too (proximity-disclosure › "The Star Occludes Both Live
// Channels and the Focused Scan"). tasks.md 5.4.
//
// Both channels run through the same occlusion call, so "loud enough" can
// never become a path around the star. The emitting case deliberately uses
// a plume large enough to reach several times over.
func TestDisclose_StarHidesBothChannels(t *testing.T) {
	w := testWorld(nil)
	// The star sits at the origin; observer and target straddle it, each
	// well inside passive range of the other.
	obs := observerAt(space.Vec3{X: -10})

	cold := parkedAt("cold", space.Vec3{X: 10})
	if _, ok, err := Disclose(w, obs, cold, 0); err != nil || ok {
		t.Errorf("a cold fleet behind the star is disclosed (ok=%v, err=%v)", ok, err)
	}

	// Same geometry, drive lit: the plume reaches many times the distance,
	// and still does not see through a star.
	loud := burningFrom("loud", space.Vec3{X: 10}, space.Vec3{X: 10.0000001}, 0, 1_000_000, 8, 3)
	if !Emitting(loud.State, 0) {
		t.Fatal("the emitting case must actually be emitting")
	}
	if _, ok, err := Disclose(w, obs, loud, 0); err != nil || ok {
		t.Errorf("an emitting fleet behind the star is disclosed (ok=%v, err=%v)", ok, err)
	}
}

// Scenario: A tangent sightline is clear (proximity-disclosure › "The Star
// Occludes Both Live Channels and the Focused Scan"). tasks.md 5.5.
//
// This is the inclusive tie rule with its polarity inverted. An occlusion
// test blocks when NEARER, so resolving the exact boundary toward
// disclosure means the comparison is strict and a tangent sightline is
// CLEAR. Both sides of the boundary are built with math.Nextafter rather
// than typed literals, because the claim is about the last representable
// step and a literal cannot make it.
func TestOccluded_TangentSightlineIsClear(t *testing.T) {
	centre := space.Vec3{}
	from := space.Vec3{X: -100, Y: starSize}
	to := space.Vec3{X: 100, Y: starSize}

	// The closest approach is (0, starSize, 0): squared distance exactly
	// equal to the squared star size.
	closest := space.Vec3{Y: starSize}
	if got, want := closest.DistSq(centre), float64(starSize*starSize); got != want {
		t.Fatalf("construction is not exact: closest-approach distSq = %v, sizeSq = %v", got, want)
	}
	if Occluded(from, to, centre, starSize) {
		t.Error("a tangent sightline is occluded; the inverted-polarity boundary must resolve toward disclosure")
	}

	// One representable step closer to the centre, and it blocks.
	inside := math.Nextafter(starSize, 0)
	if !Occluded(space.Vec3{X: -100, Y: inside}, space.Vec3{X: 100, Y: inside}, centre, starSize) {
		t.Error("a sightline one representable step inside the star's radius is clear; only exact tangency is")
	}
}

// Scenario: A body beside the sightline does not occlude
// (proximity-disclosure › "The Star Occludes Both Live Channels and the
// Focused Scan"). tasks.md 5.6.
//
// The planet in testWorld sits at radius 40 on the +X axis with a
// motionless orbit, so a sightline through it is exactly what it reads as.
// Only the star occludes: a system's bodies are small and its star is not,
// and every extra occluder buys ambiguity for a predicate nobody can reason
// about at the table.
func TestDisclose_OnlyTheStarOccludes(t *testing.T) {
	w := testWorld(nil)
	planetPos, err := space.Position(w.Bodies, "planet", 0)
	if err != nil {
		t.Fatalf("resolving the planet: %v", err)
	}
	if planetPos.DistSq(space.Vec3{}) == 0 {
		t.Fatal("the planet must not sit at the star's own position")
	}

	// Observer and target straddle the planet, both far from the star.
	obs := observerAt(space.Vec3{X: planetPos.X - 5, Y: planetPos.Y, Z: planetPos.Z})
	target := parkedAt("t", space.Vec3{X: planetPos.X + 5, Y: planetPos.Y, Z: planetPos.Z})

	if !Occluded(obs.Position, target.State.Park.Point, planetPos, 3) {
		t.Fatal("the construction must actually put the planet's sphere across the segment")
	}
	if _, ok, err := Disclose(w, obs, target, 0); err != nil || !ok {
		t.Errorf("a target behind a planet is not disclosed (ok=%v, err=%v); only the star occludes", ok, err)
	}
}

// Scenario: The star does not block past the endpoints (proximity-
// disclosure › "The Star Occludes Both Live Channels and the Focused
// Scan"). tasks.md 5.7.
//
// The clamp on the segment parameter is what makes this true, and it is
// load-bearing rather than defensive: without it, the closest approach on
// the INFINITE line runs through the star and hides a target the star is
// nowhere near.
func TestOccluded_ClampKeepsTheStarOffTheExtendedLine(t *testing.T) {
	centre := space.Vec3{}
	// Observer and target on the same side of the star, target the nearer
	// of the two — so the star lies beyond the target along the extended
	// line, and the unclamped closest approach would be the star itself.
	from := space.Vec3{X: 30}
	to := space.Vec3{X: 20}

	if Occluded(from, to, centre, starSize) {
		t.Error("a star beyond the target along the extended line occludes; the segment parameter is not clamped")
	}
	// And the clamp is what did it: extending the segment past the star
	// blocks, from the same two directions.
	if !Occluded(from, space.Vec3{X: -20}, centre, starSize) {
		t.Error("a star actually ON the segment does not occlude")
	}
}

// Scenario: Coincident observer and target is not occluded
// (proximity-disclosure › "The Star Occludes Both Live Channels and the
// Focused Scan"). tasks.md 5.8.
//
// The zero-length guard is asserted by showing what the unguarded form
// produces on the same inputs: NaN, from dividing zero by zero. A test that
// only checked the boolean would pass against the unguarded implementation
// too, since every comparison against NaN is false — which is exactly the
// kind of accidental pass this scenario exists to rule out.
func TestOccluded_CoincidentEndpointsPerformNoDivision(t *testing.T) {
	p := space.Vec3{X: 7, Y: -3, Z: 11}

	if Occluded(p, p, p, starSize) {
		t.Error("coincident observer and target is occluded; it must not be")
	}
	if Occluded(p, p, space.Vec3{}, starSize) {
		t.Error("coincident observer and target is occluded by a distant star")
	}

	// The unguarded form, written out here and nowhere else, to show the
	// guard is doing work rather than restating a comparison that was
	// already false.
	segment := p.Sub(p)
	unguarded := segment.Dot(p.Sub(p)) / segment.Dot(segment)
	if !math.IsNaN(unguarded) {
		t.Fatalf("the unguarded segment parameter is %v, expected NaN — this test no longer proves the guard is load-bearing", unguarded)
	}
}

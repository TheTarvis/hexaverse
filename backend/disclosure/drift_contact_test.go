package disclosure

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.4 and 4.12 — proximity-disclosure ADDED "A Drifting Contact
// Reports Its Drift Velocity and Does Not Emit", all three scenarios.
//
// Two of these three are genuinely RED against shipped code:
// contactVelocity's switch (contact.go:114) has a `default:` arm returning
// space.ErrUnknownParkKind for any space.ShipMode it does not name
// explicitly, and ModeDrift is not one of its two named cases (ModeBurn,
// ModeParked) — so a drifting contact's velocity computation fails with
// ErrUnknownParkKind today, both directly and through Disclose end to end
// (design.md Decision 5).
//
// The third scenario — "a drifting fleet never emits" — needs NO code
// change: Emitting (predicate.go:42) already tests `s.Mode != space.ModeBurn`,
// which is true for ModeDrift exactly as it is for ModeParked, so this
// assertion is EXPECTED TO PASS on first run. It is included anyway because
// tasks.md 4.12 names it as a requirement needing its own pinned coverage,
// not an assumption that already-correct code stays correct — the SDET
// handoff report calls this pass out explicitly so it is not mistaken for a
// broken (tautological) test.

import (
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// driftingAt builds a ship whose effective kinematic state is a drift with
// the given anchor/velocity, epoched at 0 — the simplest stored state whose
// velocity is exactly the vector written in the test (space.Drift.Velocity()
// is unconditional, per space-kinematics: "a zero-velocity drift equals its
// anchor forever").
func driftingAt(id string, anchor, velocity space.Vec3) Ship {
	return Ship{
		Id: id,
		State: space.ShipState{
			Mode:  space.ModeDrift,
			Drift: &space.Drift{Anchor: anchor, Velocity: velocity, EpochMs: 0},
		},
	}
}

// Scenario: A drifting contact reports its stored drift velocity.
//
// GIVEN a fleet whose effective kinematic state is a drift with a non-zero
// stored velocity WHEN that fleet's contact velocity is computed THEN the
// reported velocity equals the drift's stored velocity exactly.
//
// Asserted twice — a direct call to contactVelocity (the unit the fix lands
// in) and end to end through Disclose (the integration the fix must also
// reach) — since the failure mode this pins against is a fix landing in one
// call path and not the other.
func TestContactVelocity_Scenario_DriftingContactReportsStoredDriftVelocity(t *testing.T) {
	w := testWorld(nil)
	velocity := space.Vec3{X: 12.5, Y: -3.25, Z: 0.75}
	drifting := driftingAt("d1", space.Vec3{X: 45, Y: 200}, velocity)

	// Direct unit call, at two different world times: a drift's velocity is
	// CONSTANT, so this also proves the value isn't accidentally re-derived
	// from a position delta between two folds.
	for _, at := range []common.WorldMillis{0, 50_000} {
		got, err := contactVelocity(w.Bodies, drifting.State, at)
		if err != nil {
			t.Fatalf("contactVelocity at t=%d: %v — ModeDrift must be a handled case, not the default arm's "+
				"space.ErrUnknownParkKind (design.md Decision 5)", at, err)
		}
		if got != velocity {
			t.Errorf("contactVelocity at t=%d = %+v, want the drift's exact stored velocity %+v", at, got, velocity)
		}
	}

	// End-to-end through Disclose: an observer close enough to see it.
	obs := observerAt(space.Vec3{X: 40, Y: 200})
	contact, ok, err := Disclose(w, obs, drifting, 0)
	if err != nil {
		t.Fatalf("Disclose: %v", err)
	}
	if !ok {
		t.Fatal("the drifting fleet is not disclosed; the scenario needs it seen")
	}
	if contact.Velocity != velocity {
		t.Errorf("Contact.Velocity = %+v via Disclose, want the drift's exact stored velocity %+v", contact.Velocity, velocity)
	}
}

// Scenario: A zero-velocity drift reports a stationary contact.
//
// GIVEN a fleet whose effective kinematic state is a drift with a zero
// stored velocity WHEN that fleet's contact velocity is computed THEN the
// reported velocity is the zero vector, computed WITHOUT ERROR (not merely
// without panicking — the default arm returns an error today, which this
// scenario also catches).
func TestContactVelocity_Scenario_ZeroVelocityDriftReportsStationaryContact(t *testing.T) {
	w := testWorld(nil)
	drifting := driftingAt("d2", space.Vec3{X: 45, Y: 200}, space.Vec3{})

	got, err := contactVelocity(w.Bodies, drifting.State, 12_345)
	if err != nil {
		t.Fatalf("contactVelocity for a zero-velocity drift errored: %v, want the zero vector computed without error", err)
	}
	if got != (space.Vec3{}) {
		t.Errorf("contactVelocity for a zero-velocity drift = %+v, want the zero vector", got)
	}

	obs := observerAt(space.Vec3{X: 40, Y: 200})
	contact, ok, err := Disclose(w, obs, drifting, 12_345)
	if err != nil {
		t.Fatalf("Disclose: %v", err)
	}
	if !ok {
		t.Fatal("the drifting fleet is not disclosed; the scenario needs it seen")
	}
	if contact.Velocity != (space.Vec3{}) {
		t.Errorf("Contact.Velocity = %+v via Disclose, want the zero vector", contact.Velocity)
	}
}

// Scenario: A drifting fleet never emits.
//
// GIVEN a fleet whose effective kinematic state is a drift WHEN emission is
// evaluated at any world time THEN the fleet is not emitting.
//
// EXPECTED TO PASS ON FIRST RUN — see this file's header comment.
// Emitting's `s.Mode != space.ModeBurn` test already excludes ModeDrift
// exactly as it excludes ModeParked; this test exists to give that fact its
// own pinned scenario (tasks.md 4.12), not to catch a bug.
func TestEmitting_Scenario_ADriftingFleetNeverEmits(t *testing.T) {
	drifting := driftingAt("d3", space.Vec3{X: 45, Y: 200}, space.Vec3{X: 5, Y: 0, Z: 0})

	// A spread of world times: long before the drift's own epoch, exactly at
	// it, and long after — "at any world time" is the requirement's own
	// wording, and a drift (unlike a burn) has no interval to be inside or
	// outside of, so every one of these must read as not-emitting.
	for _, at := range []common.WorldMillis{-1_000_000, 0, 1, 500_000, 999_999_999} {
		if Emitting(drifting.State, at) {
			t.Errorf("Emitting(drift, t=%d) = true, want false — a drift has no engine output to detect "+
				"(design.md Decision 5, Decision 6)", at)
		}
	}
}

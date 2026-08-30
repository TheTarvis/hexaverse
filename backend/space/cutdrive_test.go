package space

import (
	"errors"
	"testing"
)

// space-kinematics: "Cutting a Drive Converts the Burn to a Drift at Its
// Live Position and Velocity" (design.md Decision 6 — the pinned
// construction: Anchor = burn.Position(cutMs), Velocity =
// burn.Tangent(cutMs).Scale(burn.Speed(cutMs)), EpochMs = cutMs). See
// drift_test.go's ASSUMED API CONTRACT ADDENDUM for CutDrive's assumed
// signature and ErrCutAfterArrival.

// midBurnFixture builds a real solved burn far enough from a moving target
// that its flight has a meaningful duration and a non-trivial decelerating
// half, for the cut-drive scenarios to exercise.
func midBurnFixture(t *testing.T) (fakeBodies, Burn) {
	t.Helper()
	bodies := testSystem()
	result, err := SolveBurn(bodies, Vec3{X: 200, Y: 0, Z: 0}, bodyTarget("planet1"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	return bodies, result.Burn
}

// Scenario: A mid-burn cut produces a drift anchored at the burn's live
// position and velocity.
func TestCutDrive_Scenario_MidBurnCutAnchorsAtLivePositionAndVelocity(t *testing.T) {
	_, b := midBurnFixture(t)
	cutMs := b.DepartMs + (b.ArriveMs-b.DepartMs)/4 // strictly between depart and arrive

	got, err := CutDrive(b, cutMs)
	requireNoError(t, err)

	wantAnchor := b.Position(cutMs)
	wantVelocity := b.Tangent(cutMs).Scale(b.Speed(cutMs))

	if got.Anchor != wantAnchor {
		t.Errorf("CutDrive anchor = %v, want the burn's position at cutMs = %v", got.Anchor, wantAnchor)
	}
	if got.Velocity != wantVelocity {
		t.Errorf("CutDrive velocity = %v, want the burn's tangent*speed at cutMs = %v", got.Velocity, wantVelocity)
	}
	if got.EpochMs != cutMs {
		t.Errorf("CutDrive epoch = %d, want cutMs = %d", got.EpochMs, cutMs)
	}
}

// Scenario: Position and velocity are bit-identical across the cut
// millisecond.
func TestCutDrive_Scenario_BitIdenticalAcrossTheCutMillisecond(t *testing.T) {
	_, b := midBurnFixture(t)
	cutMs := b.DepartMs + (b.ArriveMs-b.DepartMs)/3

	drift, err := CutDrive(b, cutMs)
	requireNoError(t, err)

	burnPos := b.Position(cutMs)
	burnVel := b.Tangent(cutMs).Scale(b.Speed(cutMs))
	driftPos := drift.Position(cutMs)
	driftVel := drift.Velocity

	if burnPos != driftPos {
		t.Errorf("position at the cut millisecond: burn=%v drift=%v, want bit-identical (no observable discontinuity)", burnPos, driftPos)
	}
	if burnVel != driftVel {
		t.Errorf("velocity at the cut millisecond: burn=%v drift=%v, want bit-identical (no observable discontinuity)", burnVel, driftVel)
	}
}

// Scenario: Direction follows the tangent past the flip, not the direction
// of thrust.
//
// Cutting after the arc-length midpoint (the decelerating half) must yield a
// drift velocity pointing the way the ship was TRAVELLING, not the reversed
// direction its decelerating thrust points. burn.Tangent already reports the
// direction of travel (the curve's own forward tangent) at every t, so this
// pins that CutDrive uses Tangent — not some derivation from the
// deceleration vector, which would point backward past the flip.
func TestCutDrive_Scenario_DirectionFollowsTangentPastTheFlip(t *testing.T) {
	_, b := midBurnFixture(t)
	// Strictly after the midpoint (the decelerating half): 3/4 of the way
	// through the flight window.
	cutMs := b.DepartMs + 3*(b.ArriveMs-b.DepartMs)/4
	if b.BeforeFlip(cutMs) {
		t.Fatalf("test fixture error: cutMs %d is not past the flip for this burn (depart=%d arrive=%d)", cutMs, b.DepartMs, b.ArriveMs)
	}

	drift, err := CutDrive(b, cutMs)
	requireNoError(t, err)

	wantDir := b.Tangent(cutMs) // the curve's own forward-travel direction, past the flip
	gotDir, ok := drift.Velocity.Normalize()
	if !ok {
		t.Fatalf("drift velocity %v normalizes to nothing (near-zero speed past the flip is not expected for this fixture)", drift.Velocity)
	}
	if !almostEqualVec(gotDir, wantDir, tightTolerance) {
		t.Errorf("drift direction past the flip = %v, want the burn's own forward tangent %v (not the reversed thrust direction)", gotDir, wantDir)
	}
}

// Scenario: A cut exactly at depart time yields a zero-velocity drift.
func TestCutDrive_Scenario_CutExactlyAtDepartYieldsZeroVelocityDrift(t *testing.T) {
	_, b := midBurnFixture(t)

	got, err := CutDrive(b, b.DepartMs)
	requireNoError(t, err)

	if got.Velocity != (Vec3{}) {
		t.Errorf("CutDrive at exactly DepartMs velocity = %v, want the zero vector (Burn.Speed(t<=DepartMs) == 0, no special case)", got.Velocity)
	}
	if got.Anchor != b.Origin {
		t.Errorf("CutDrive at exactly DepartMs anchor = %v, want the burn's stored origin %v", got.Anchor, b.Origin)
	}
	if got.EpochMs != b.DepartMs {
		t.Errorf("CutDrive at exactly DepartMs epoch = %d, want DepartMs = %d", got.EpochMs, b.DepartMs)
	}
}

// Scenario: A cut at or after arrival is refused by name.
func TestCutDrive_Scenario_CutAtOrAfterArrivalRefusedByName(t *testing.T) {
	_, b := midBurnFixture(t)

	t.Run("exactly at arrival", func(t *testing.T) {
		before := b // copy: assert the stored burn is unchanged after a refused cut
		_, err := CutDrive(b, b.ArriveMs)
		if !errors.Is(err, ErrCutAfterArrival) {
			t.Fatalf("err = %v, want errors.Is(err, ErrCutAfterArrival)", err)
		}
		if b != before {
			t.Errorf("burn's stored state changed after a refused cut: %+v vs original %+v", b, before)
		}
	})
	t.Run("after arrival", func(t *testing.T) {
		_, err := CutDrive(b, b.ArriveMs+1)
		if !errors.Is(err, ErrCutAfterArrival) {
			t.Fatalf("err = %v, want errors.Is(err, ErrCutAfterArrival)", err)
		}
	})
	t.Run("distinct from every other rejection this capability defines", func(t *testing.T) {
		_, err := CutDrive(b, b.ArriveMs)
		if errors.Is(err, ErrArcTooShort) || errors.Is(err, ErrEndpointInsideClearance) || errors.Is(err, ErrUnknownBody) {
			t.Errorf("ErrCutAfterArrival aliases another named rejection: %v", err)
		}
	})
}

// Scenario: Cutting charges no delta-v.
//
// CutDrive's signature (Burn, WorldMillis) -> (Drift, error) carries no
// accel/delta-v parameter or return at all — there is no value for a
// caller to have charged. This is asserted the only way a "nothing was
// computed" claim can be: the resulting drift has no residual trace of the
// burn's own DeltaV() (its velocity is exactly tangent*speed at the cut
// instant, independent of the burn's total accel-times-duration price).
func TestCutDrive_Scenario_ChargesNoDeltaV(t *testing.T) {
	_, b := midBurnFixture(t)
	cutMs := b.DepartMs + (b.ArriveMs-b.DepartMs)/2

	drift, err := CutDrive(b, cutMs)
	requireNoError(t, err)

	wantSpeed := b.Speed(cutMs)
	gotSpeed := drift.Velocity.Length()
	if !almostEqual(gotSpeed, wantSpeed, tightTolerance) {
		t.Errorf("drift speed after cutting = %v, want exactly the burn's own instantaneous speed at the cut instant %v (no delta-v charged, positive or negative)", gotSpeed, wantSpeed)
	}
}

package space

import "testing"

// tasks.md 2.4: space/state.go:73 (StatePosition's default: arm) compiles
// cleanly today and silently fails at runtime for ModeDrift — every drifting
// fleet's position read returns ErrUnknownParkKind, with no compiler signal
// (design.md Decision 5, Decision 21C item 1). This is the test that catches
// it: a ShipState in ModeDrift must resolve through StatePosition exactly
// like a burn or a park does, not fall into the default arm.

// Scenario (space-kinematics: "A Free-Drifting Ship Coasts in a Straight
// Line at Constant Velocity", read through the canonical StatePosition
// path): StatePosition resolves a drifting ship's position, and it agrees
// with the drift's own Position(t) — the effective-state fold for
// ModeDrift is itself (drift_test.go's
// TestStateAt_Scenario_DriftFoldAtFarFutureStaysADrift already pins that),
// so StatePosition must not diverge from Drift.Position by taking a
// different (broken) path to get there.
func TestStatePosition_Scenario_ResolvesADriftingShipsPosition(t *testing.T) {
	bodies := testSystem()
	d := Drift{
		Anchor:   Vec3{X: 40, Y: 0, Z: -20},
		Velocity: Vec3{X: 3, Y: 0, Z: -1},
		EpochMs:  2_000,
	}
	s := ShipState{Mode: ModeDrift, Drift: &d}

	const readAt = 2_000 + 6_500 // 6.5 seconds after epoch, arbitrary
	got, err := StatePosition(bodies, s, readAt)
	requireNoError(t, err)

	want := d.Position(readAt)
	if got != want {
		t.Fatalf("StatePosition(ModeDrift) = %v, want the drift's own Position(t) = %v (default: arm must handle ModeDrift, not fall through)", got, want)
	}
}

// SDET-added companion, at a time strictly before the drift's own epoch —
// the backward-evaluation half of the same path, so a fix that special-cases
// only "t after epoch" is still caught.
func TestStatePosition_Scenario_ResolvesADriftingShipsPositionBeforeEpoch(t *testing.T) {
	bodies := testSystem()
	d := Drift{
		Anchor:   Vec3{X: 0, Y: 0, Z: 0},
		Velocity: Vec3{X: 5, Y: 0, Z: 0},
		EpochMs:  100_000,
	}
	s := ShipState{Mode: ModeDrift, Drift: &d}

	const readAt = 97_000 // 3 seconds before epoch
	got, err := StatePosition(bodies, s, readAt)
	requireNoError(t, err)

	want := d.Position(readAt)
	if got != want {
		t.Fatalf("StatePosition(ModeDrift) before epoch = %v, want %v", got, want)
	}
}

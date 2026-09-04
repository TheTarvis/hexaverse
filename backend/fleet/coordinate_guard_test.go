package fleet

import (
	"bytes"
	"testing"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// DELETED (migrate-fleet-to-continuous-burns, design.md Decision 21A —
// `fleet.ErrRingOutOfRange` is named explicitly as deleted-with-no-successor
// behaviour): this file used to pin fleet-movement's now-REMOVED requirement
// "Board Coordinates Outside the Live Schedule Are Rejected, Never Panicked"
// — a stored coast orbit whose ring index exceeded the live schedule's
// maximum. There is no ring anymore (Decision 4: a fleet's stored state is a
// `space.ShipState`, and the coordinate system that had rings is gone), so
// that scenario has no successor to migrate to.
//
// Its replacement — "Undecodable Stored Kinematic State Is Rejected, Never
// Panicked" (fleet-movement ADDED) — is already fully covered by
// kinematic_decode_test.go's TestDecodeKinematicState_Scenario_* family
// (NeverPanicsOnGarbageInput, NonFiniteCoordinateCause,
// CoordinateOutOfExtentCause, UndecodableShapeCause, UnknownBodyCause), which
// this SDET pass must not touch. Only the two helpers below survive here,
// because kinematic_decode_test.go itself depends on them (see that file's
// own header comment: "This file reuses coordinate_guard_test.go's
// captureLog/runRecovered").

// captureLog swaps the global zerolog logger for the duration of fn — the
// only way to observe production's package-level log.Warn()/log.Error()
// calls from a black-box test.
func captureLog(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	original := log.Logger
	log.Logger = zerolog.New(&buf)
	defer func() { log.Logger = original }()
	fn()
	return buf.String()
}

// runRecovered calls fn and converts any panic into a reported value rather
// than crashing the test binary — required to observe "never panics" as a
// normal (non-fatal-to-the-suite) test failure.
func runRecovered(t *testing.T, fn func()) (panicked any) {
	t.Helper()
	defer func() { panicked = recover() }()
	fn()
	return
}

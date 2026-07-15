package observation

import "hexaverse/common"

// SensorParams tunes passive (ambient) sensing — the short, live bubble that
// rides any moving unit, drifting or burning (Travis, 2026-07-10). Radius is in
// hexes. Per-unit-type radii are a deferred progression axis (#0006 Non-goals);
// the slice uses one radius for every unit. Like the beam, the bubble obeys
// line of sight (#0006 Decision #16).
type SensorParams struct {
	AmbientRadius int
}

// DefaultSensorParams sources the live sensing knobs from common.Tuning() — the
// single tuning file (backend/common/tuning.go). Tune sensing THERE, not here.
func DefaultSensorParams() SensorParams {
	return SensorParams{AmbientRadius: common.Tuning().AmbientRadius}
}

// ScanParams tunes the active scan verb — the slow 360° sweep that mints
// intel (#0006 Decisions #18/#21: ONE scan verb, an automatic all-around
// sweep; the aimed narrow cone is the deferred directional variant, whose
// width knobs return with it). Duration feeds the commit-time ETA.
type ScanParams struct {
	// Duration is the world-ms a scan takes; the ETA is committedAt + Duration.
	Duration common.WorldMillis
}

// DefaultScanParams sources the scan pacing from common.Tuning() — the single
// tuning file (backend/common/tuning.go). Tune scan duration THERE.
func DefaultScanParams() ScanParams {
	return ScanParams{Duration: common.Tuning().ScanDuration}
}

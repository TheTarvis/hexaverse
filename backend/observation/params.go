package observation

import "hexaverse/common"

// SensorParams tunes passive (ambient) sensing — the short, live bubble that
// rides any moving unit, drifting or burning (Travis, 2026-07-10). Radius is in
// hexes. Per-unit-type radii are a deferred progression axis (#0006 Non-goals);
// the slice uses one radius for every unit.
type SensorParams struct {
	AmbientRadius int
}

// DefaultSensorParams are the spike baseline.
func DefaultSensorParams() SensorParams {
	return SensorParams{AmbientRadius: 3}
}

// ScanParams tunes the active scan verb — the slow, aimed action that mints
// intel. The slice collapses quick-sweep/deep-scan into one scan that surveys
// the whole system (Radius 0 = system-wide); Radius and per-quality tiers are
// deferred knobs (#0006 Non-goals). Duration feeds the commit-time ETA.
type ScanParams struct {
	// Radius bounds what a scan reveals in hexes; 0 = the whole system (the slice
	// default — "sweep the inner system").
	Radius int
	// Duration is the world-ms a scan takes; the ETA is committedAt + Duration.
	Duration common.WorldMillis
	// GrantsTier is the graph-tier knowledge a completed scan confers. The
	// collapsed slice scan surveys; travel-arrival (M8) is what explores.
	GrantsTier Tier
}

// DefaultScanParams are the spike baseline: a system-wide sweep taking a world-
// hour, granting Surveyed.
func DefaultScanParams() ScanParams {
	return ScanParams{
		Radius:     0,
		Duration:   3_600_000, // one world-hour
		GrantsTier: TierSurveyed,
	}
}

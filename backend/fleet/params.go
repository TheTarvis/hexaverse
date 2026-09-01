package fleet

import (
	"math"

	"hexaverse/common"
)

// MovementParams holds the burn-tuning knobs (tuning is data). MsPerTile is the
// world-ms cost to cross one hex; InterceptHorizon bounds the lead-solve search.
//
// A coasting fleet's orbital period is NOT here: it's the world's shared orbital
// law (common.GameTuning.OrbitPeriod), read live at settle time by coastState —
// the same period the bodies on that ring have. Capturing it here would freeze
// already-coasting fleets at the pace the resolver was registered with.
type MovementParams struct {
	MsPerTile        common.WorldMillis
	InterceptHorizon common.WorldMillis
	// LaneMsPerDistance is the graph-tier drive speed (#0008): world-ms to cross
	// one unit of 3D lane length between system coords. A leg's time is
	// length × this, frozen at commit. The reserved lane.cost / relayModifier
	// hooks multiply in here later without restructuring.
	LaneMsPerDistance float64
	// BoardRadius is the cell/ring radius of every system board — where lane gates sit
	// (ring == BoardRadius). It must match system.GenerationParams.Radius; both now
	// source it from common.Tuning().BoardRadius, so the invariant holds by
	// construction rather than by comment. The slice generates every interior at a
	// fixed radius, so one constant is honest and spares an interior read to place
	// a departure/entry gate.
	BoardRadius int
}

// DefaultMovementParams sources the live pacing knobs from common.Tuning() — the
// single tuning file (backend/common/tuning.go), which an admin page will one day
// write through. Tune movement THERE, not here: this function only shapes the
// central numbers into the struct fleet's resolvers want. Callers clone and tweak
// (tests do) without disturbing the global.
func DefaultMovementParams() MovementParams {
	t := common.Tuning()
	return MovementParams{
		MsPerTile:         t.MsPerTile,
		InterceptHorizon:  t.InterceptHorizon,
		LaneMsPerDistance: t.LaneMsPerDistance,
		BoardRadius:       t.BoardRadius,
	}
}

// ScanBaseDurationMs is the minimum a focused scan ever costs, however
// close its target — the stationary floor that bounds a sweep's duration
// below even at zero range (focused-scan "A sweep against a host at zero
// range still costs a positive duration"; design.md Decision 8, task 5.3).
// Lives here, in the scan verb's own service, rather than disclosure/
// params.go: disclosure/purity_test.go forbids math.Sqrt anywhere in that
// package, and a duration linear in range needs one (design.md Decision 8's
// own text).
const ScanBaseDurationMs common.WorldMillis = 3_000

// ScanRoundTripMsPerUnit is the k in roundTripMs(d) = ScanBaseDurationMs +
// ceil(k*d) — the round-trip world-ms cost per unit of distance to the
// target host, a named base duration and signal speed folded into one
// linear constant (design.md Decision 8).
const ScanRoundTripMsPerUnit float64 = 40.0

// roundTripMs prices a focused scan's duration as a round trip over the
// distance d from the scanning fleet to its target host at commit time —
// quantized upward to a whole unit of world time, frozen at commit and
// never recomputed from the scanner's later motion (focused-scan "Sweep
// Duration Scales With Range to the Target"; task 5.3). d is the caller's
// space.Vec3.Length() of the commit-time separation — this function never
// resolves a position itself.
func roundTripMs(d float64) common.WorldMillis {
	// determinism:allow(pinned) Ceil is in the exact-arithmetic set (design.md
	// Decision 8), mirroring space.QuantizeArrival's own quantize-upward Ceil.
	extra := math.Ceil(ScanRoundTripMsPerUnit * d)
	return ScanBaseDurationMs + common.WorldMillis(int64(extra))
}

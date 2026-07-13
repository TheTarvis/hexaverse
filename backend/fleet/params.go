package fleet

import "hexaverse/common"

// MovementParams holds the burn-tuning knobs (tuning is data). MsPerTile is the
// world-ms cost to cross one hex; InterceptHorizon bounds the lead-solve search;
// CoastPeriod is the orbital period a fleet inherits when it settles into a
// resting orbit (large ⇒ effectively static for the motion-off slice).
type MovementParams struct {
	MsPerTile        common.WorldMillis
	InterceptHorizon common.WorldMillis
	CoastPeriod      common.WorldMillis
	// LaneMsPerDistance is the graph-tier drive speed (#0008): world-ms to cross
	// one unit of 3D lane length between system coords. A leg's time is
	// length × this, frozen at commit. The reserved lane.cost / relayModifier
	// hooks multiply in here later without restructuring.
	LaneMsPerDistance float64
	// BoardRadius is the hex radius of every system board — where lane gates sit
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
		CoastPeriod:       t.CoastPeriod,
		LaneMsPerDistance: t.LaneMsPerDistance,
		BoardRadius:       t.BoardRadius,
	}
}

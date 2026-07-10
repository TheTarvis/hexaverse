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
	// (ring == BoardRadius). It must match system.GenerationParams.Radius; the
	// slice generates every interior at a fixed radius, so one constant is honest
	// and spares an interior read to place a departure/entry gate.
	BoardRadius int
}

// DefaultMovementParams are the spike baseline (BURN_SPEED as ms-per-tile).
func DefaultMovementParams() MovementParams {
	return MovementParams{
		MsPerTile:         60_000,        // one world-minute per hex
		InterceptHorizon:  86_400_000,    // one world-day of lead search
		CoastPeriod:       3_600_000_000, // ~1000 world-hours ⇒ static within the slice
		LaneMsPerDistance: 60_000,        // one world-minute per unit of lane length
		BoardRadius:       16,            // matches system.DefaultParams().Radius
	}
}

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
}

// DefaultMovementParams are the spike baseline (BURN_SPEED as ms-per-tile).
func DefaultMovementParams() MovementParams {
	return MovementParams{
		MsPerTile:        60_000,      // one world-minute per hex
		InterceptHorizon: 86_400_000,  // one world-day of lead search
		CoastPeriod:      3_600_000_000, // ~1000 world-hours ⇒ static within the slice
	}
}

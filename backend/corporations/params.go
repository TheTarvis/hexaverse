package corporations

import "hexaverse/common"

// SpawnParams are the spawn-placement knobs (#0009). The slice ships placeholder
// constants: all three site criteria are trivially satisfiable while the world is
// near-empty, so the numbers wait for whole-graph tuning (spec Open question:
// spacing formula). The SHAPE — a filtered, weighted pick over the graph — is what
// survives that tuning.
type SpawnParams struct {
	// MinSpawnDistance is the minimum graph distance (lane hops) a candidate must
	// keep from every OTHER living corporation's explored set — "unclaimed" space.
	MinSpawnDistance int
	// PeripheryWeight biases the weighted pick toward the frontier: a qualifier's
	// selection weight is (1 + PeripheryWeight)^(graph eccentricity rank). 0 ⇒
	// uniform among qualifiers; higher ⇒ new minds wake nearer the fresh edge.
	PeripheryWeight float64
	// RequireMineable gates on the bootstrap guarantee: a candidate must carry ≥1
	// Mineable body on its #0001 skeleton, so a new player can never softlock.
	RequireMineable bool
	// RimRing is the board ring the lone hull coasts on at spawn — one hex inside
	// the lane-gate ring, so the mind wakes "rim-adjacent" with the gates in reach.
	// Derived from common.Tuning().BoardRadius - 1 rather than restated, so it
	// cannot drift from fleet's gate ring or system's generated radius.
	RimRing int
}

// DefaultSpawnParams are the slice placeholders. The placement knobs stay here —
// they're spawn RULES, applied once at wake, not live pacing an admin would retune
// on a running world. RimRing is the exception: it's derived from the shared board
// geometry in common.Tuning(), so it can't drift out of sync with the gate ring.
func DefaultSpawnParams() SpawnParams {
	return SpawnParams{
		MinSpawnDistance: 3,
		PeripheryWeight:  1.0,
		RequireMineable:  true,
		RimRing:          common.Tuning().BoardRadius - 1, // one hex inside the lane-gate ring
	}
}

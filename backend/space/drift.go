package space

import "hexaverse/common"

// Drift is a free, unpowered straight-line coast: anchor + velocity*seconds
// (t-epoch), with no terminal condition and no clamp in either time
// direction (space-kinematics: "A Free-Drifting Ship Coasts in a Straight
// Line at Constant Velocity"). Velocity is a stored field, not a function of
// t — it never varies with the query time, including the zero vector for a
// cut exactly at a burn's depart millisecond (design.md Decision 5, 7).
type Drift struct {
	Anchor   Vec3
	Velocity Vec3
	EpochMs  common.WorldMillis
}

// Position evaluates the drift's linear expression at world time t: the
// stored anchor displaced by the stored velocity scaled by the elapsed
// seconds since the stored epoch. The elapsed seconds is signed, so a t
// before the epoch displaces backward — there is no clamp in either time
// direction (space-kinematics: same requirement as the type doc comment).
func (d Drift) Position(t common.WorldMillis) Vec3 {
	seconds := float64(t-d.EpochMs) / 1000
	return d.Anchor.Add(d.Velocity.Scale(seconds))
}

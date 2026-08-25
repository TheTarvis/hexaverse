package polar

// RingRadius maps a ring index to its radius — the ONE render-side function
// in this package, exempt from the integer discipline by declaration
// (openspec polar-lattice-math, "Every Cell On a Ring Sits At One Radius" /
// the Rule-Bearing Values projection exemption). Every cell on a ring sits
// at this single radius at every slot — the mapping is a function of the
// ring index alone, which is the rule-bearing property; the float VALUE is
// projection input, never persisted, never a solve result, never an ETA.
//
// radii is the configured per-ring radius table (radii[ring]); a nil or
// short table falls back to uniform unit spacing (radius = ring index).
// Non-uniform radial spacing — closer rings near the core — is the one
// honest lever for inner-system detail the spike identified, and it remains
// an OPEN lever on the slot-schedule decision, which is why this is a
// configured table rather than a formula. Ring 0 is always radius 0: the
// core projects to the center.
func RingRadius(ring int, radii []float64) float64 {
	if ring <= 0 {
		return 0
	}
	if ring < len(radii) {
		return radii[ring]
	}
	return float64(ring)
}

// ringRadius — the ONE render-side function in this module, exempt from the
// integer discipline by declaration (openspec polar-lattice-math, "Every
// Cell On a Ring Sits At One Radius" / the projection exemption). The
// rule-bearing property is structural: the mapping takes the ring index
// alone, so every cell on a ring sits at one radius at every slot. The
// numeric value is projection input — never persisted, never a solve result,
// never an ETA.
//
// radii is the configured per-ring radius table; a missing or short table
// falls back to uniform unit spacing (radius = ring index). Non-uniform
// radial spacing is the one honest lever for inner-system detail and remains
// an OPEN lever on the slot-schedule decision — hence a configured table,
// not a formula. Ring 0 is always radius 0: the core projects to the center.
export function ringRadius(ring: number, radii?: number[]): number {
  if (ring <= 0) return 0
  if (radii && ring < radii.length) return radii[ring]
  return ring
}

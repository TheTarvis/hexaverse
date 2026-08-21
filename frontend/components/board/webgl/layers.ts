// layers.ts — THE one documented draw order for the board scene
// (port-board-to-webgl-renderer, "named z constants, real depth testing, one
// documented draw order"). Replaces the spike's scattered hand-tuned
// renderOrder + depthTest:false.
//
// Back to front:
//   1. starfield (nebula + three star layers, at real negative depth)
//   2. lattice
//   3. orbit rings
//   4. bodies      — within the layer, instance order is the documented order:
//                    parents first, children (moons) last, so a child draws
//                    above its parent (board-pack.sortFeaturesForDraw)
//   5. surface FX  — the star's corona (additive, blooms)
//   6. fleets      — trail, then plumes, then hulls
//   7. effects     — reserved (BoardEffect registry is deferred; nothing ships)
//
// Depth testing is ON everywhere (uDepthTest was the spike's disabled
// escape-hatch): the starfield layers sit at genuinely different z, so the
// depth buffer orders them against the board plane for real. The board-plane
// layers are all transparent and never write depth — their mutual order is
// carried by renderOrder from this table plus the instance order above, which
// is exactly the SVG board's sibling-order contract, now pinned in one home.

export const RENDER_ORDER = {
  starfield: 0,
  lattice: 1,
  orbitRings: 2,
  bodies: 3,
  surfaceFx: 4,
  fleetTrail: 5,
  fleetPlume: 6,
  fleetHull: 7,
  effects: 8,
} as const

// Small world-space z lifts for the board-plane layers, so anything that DOES
// depth-test (and any future depth-writing layer) resolves the same order the
// table above documents.
export const LAYER_Z = {
  lattice: 0,
  orbitRings: 0.5,
  bodies: 1,
  fleets: 2,
} as const

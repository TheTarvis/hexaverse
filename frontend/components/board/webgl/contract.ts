// The canvas boundary contract — the ONLY vocabulary the GL plumbing under
// components/board/webgl/ speaks (port-board-to-webgl-renderer, "the
// plumbing/decision rule"). Everything here is primitives and already-resolved
// values: an [r,g,b] triple, never a FeatureType; a packed fog quad, never a
// FogBand. This module imports NOTHING — that is the point. The pack functions
// that produce these records (components/board/board-pack.ts) live OUTSIDE
// webgl/ and are where every domain decision is made and unit-tested.

export type Rgb = [number, number, number]

// The tuned production look (Travis's 2026-08-11 settings; starScale retuned
// 2026-08-24) — the one source of truth for the renderer's defaults, the
// tuning bench's opening position, and the dev tuning panel's reset target.
// Bloom's threshold is not here: it is a load-bearing renderer constant, not
// a look preference.
export const TUNED_LOOK = { bloom: 0.25, instrument: 0.15, starfield: true, starScale: 0.35, bodyScale: 1 } as const

// One body's static instance data, resolved from the fogged feature by
// packBodyInstance (outside webgl/). `fog` is the band → treatment decision,
// already made: the shader consumes it without re-deriving any part of it.
export interface PackedBody {
  id: string
  color: Rgb
  radius: number
  seed: number
  banded: 0 | 1
  fog: { dim: number; chroma: number; breakUp: number; wireOnly: 0 | 1 }
}

// One lattice tile: centre in GL world coordinates (y already flipped by the
// projection module's boardToWorld — no flip happens under webgl/), plus the
// annular-sector bounds the fragment shader carves the tile out of its quad
// with. A polar cell is a wedge, not a hexagon: the bounds vary per ring (and
// per ring's slot count), so they are per-instance data rather than the two
// constants the hex lattice needed.
//
// Angles are GL world angles (already negated out of board space by the
// packer). `half` is the half-extent of the instance's bounding quad in world
// units — the wedge's arc is wider at high rings than at low ones, so the quad
// cannot be one shared size either.
export interface PackedLatticeTile {
  x: number
  y: number
  tint: Rgb
  rInner: number
  rOuter: number
  angCenter: number
  angHalf: number
  half: number
}

// One orbit ring: a closed polyline in GL world coordinates, plus its ring
// index so the selected-ring highlight can address it as a plain number.
export interface PackedRing {
  ring: number
  // Flat xy pairs, GL world space.
  points: number[]
}

// PackedFleetInstance/FleetFrame (the fleet hull/plume/trail instance data)
// had no successor after migrate-fleet-to-continuous-burns: the board draws
// no fleet layer at all (design.md Decision 12). Deleted here, not adapted;
// see tasks.md 8.1/8.7.

// The full static scene the canvas mounts from — all decisions pre-resolved.
export interface PackedScene {
  radius: number
  clearColor: Rgb
  latticeTiles: PackedLatticeTile[]
  bodies: PackedBody[]
  star: { radius: number; tint: Rgb } | null
  rings: PackedRing[]
  theme: BoardTheme
}

// Resolved palette values the scene shaders take as inputs (uSignal, thruster,
// hull, ring tints) — passed in, never imported (webgl/ must not import
// board-palette).
export interface BoardTheme {
  signal: Rgb
  thruster: Rgb
  hull: Rgb
  orbitRing: { tint: Rgb; opacity: number }
  orbitRingHilite: { tint: Rgb; opacity: number }
}

// One rendered frame's resolved inputs, produced by the frame packer (outside
// webgl/) each animation frame. `fxTime` is the decorative shader clock in
// seconds — the frame packer freezes it under a reduced-motion preference while
// positions keep advancing with world time.
export interface FrameData {
  fxTime: number
  // xy per body, GL world space, in the same order as PackedScene.bodies.
  bodyOffsets: Float32Array
  // The scan pulse ring and single-centre sensor bubble are spike-era lattice
  // effects; production draws scan/sensor UI on the SVG overlay and passes
  // null here.
  pulse: { x: number; y: number; radius: number; strength: number } | null
  sensor: { x: number; y: number; radius: number } | null
  // The selected body's ring index, or -1 — resolved from selection state
  // outside webgl/, consumed as a plain index (task 3.5a).
  selectedRing: number
}

// The camera parameters the canvas consumes each frame — owned by
// useBoardProjection (React-side state); the canvas never writes them back.
// `dist` already carries zoom (dist = fitDist / zoom) and `worldPerPixel` is
// re-derived with it, so pan/zoom reach every shader through values the
// canvas already reads per frame — no new plumbing, provided the uniform is
// written per frame rather than once at scene construction.
export interface BoardCameraState {
  dist: number
  tiltRad: number
  worldPerPixel: number
  // The point the camera is centred on, in GL world coordinates (y already
  // flipped by the projection module's boardToWorld — no flip happens here).
  target: { x: number; y: number }
}

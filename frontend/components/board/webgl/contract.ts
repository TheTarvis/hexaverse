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
// projection module's boardToWorld — no flip happens under webgl/).
export interface PackedLatticeTile {
  x: number
  y: number
  tint: Rgb
}

// One orbit ring: a closed polyline in GL world coordinates, plus its ring
// index so the selected-ring highlight can address it as a plain number.
export interface PackedRing {
  ring: number
  // Flat xy pairs, GL world space.
  points: number[]
}

// One fleet's static instance data. `audience` is the own/foreign fork, decided
// outside: 0 = own (roster-driven formation), 1 = foreign (constant contact
// mark — formation is always a single centred slot regardless of the owner's
// actual roster; that constancy is the confidentiality property).
export interface PackedFleetInstance {
  id: string
  audience: 0 | 1
  // Hull slots in fleet-local space (+y forward), one per drawn hull.
  formation: { dx: number; dy: number }[]
}

// One fleet's per-frame resolved state: position/heading in GL world space,
// accent already a colour triple (the movement-mode decision happened outside).
export interface FleetFrame {
  id: string
  x: number
  y: number
  headingRad: number
  accent: Rgb
  burning: 0 | 1
  docked: 0 | 1
}

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
  fleets: FleetFrame[]
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
export interface BoardCameraState {
  dist: number
  tiltRad: number
  worldPerPixel: number
}

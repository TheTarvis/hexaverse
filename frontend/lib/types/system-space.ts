// The system interior read's wire shape, in continuous space (openspec
// change `build-production-space-view`, `system-interior`: *Interior Read
// Serves Continuous Bodies*). Typed against the RECORDED served sample
// (`backend/testdata/serve-orbital-elements-and-burn-preview/
// interior-read.json`), not against a reading of the spec — so every key
// name here is one the server actually writes.
//
// THE LATTICE IS GONE. There is no `radius`, no `footprint`, no lattice
// `orbit` object, no `cell` on a lane gate: a body's place in the world is
// its continuous `space` position, its `size`, and its `orbitElements`, and
// the system's own scale is the continuous `extent`. This type is what
// replaces `lib/types/system-board.ts`.

import type { Vec3 } from './fleet'

/**
 * A resource kind a body can carry. `fuel` rides the cargo map as a
 * reserved kind and is deliberately NOT one of these.
 */
export type ResourceKind = 'metals' | 'volatiles' | 'water' | 'organics' | 'research' | 'exotic'

export interface ResourceDeposit {
  kind: ResourceKind
  richness: number
}

/** A body's served orbital elements. Angles are sub-turns, never radians. */
export interface OrbitElements {
  parentId: string
  radius: number
  periodMs: number
  phase: number
  inclination: number
  node: number
}

/** A body in the interior read: a star, planet, moon, belt, or station. */
export interface SpaceBody {
  id: string
  type: string
  resources?: ResourceDeposit[]
  effects?: string[]
  space: Vec3
  size: number
  // Absent on the star, which sits at the system's origin by construction.
  orbitElements?: OrbitElements
}

/**
 * A lane gate, served as a body like any other. `id` is the body id a burn
 * order must name and the string `fleet.attachedTo` reports — SERVED, never
 * reconstructed on the client from `destSystemId`.
 *
 * REQUIRED, not optional. It was optional only while this file was typed
 * against a golden sample recorded before 9.1b added the field; the wire has
 * carried a non-empty `id` on every gate since, and both the retargeted e2e
 * suite and the recorder's fitness gate pin it. Nothing downstream may
 * reconstruct or default it.
 */
export interface SpaceLaneGate {
  id: string
  destSystemId: string
  laneId: string
  space: Vec3
  size: number
  orbitElements: OrbitElements
}

/**
 * A foreign presence disclosed by proximity: a position and a velocity, with
 * NO identity. The position is frozen at the moment it was served — the
 * client never integrates it forward from `velocity`, which is DISPLAYED as
 * a heading and speed instead.
 */
export interface SpaceContact {
  position: Vec3
  velocity: Vec3
  emitting: boolean
  scanning: boolean
}

export interface SystemSpace {
  systemId: string
  /** The interior's continuous extent — every camera figure scales off it. */
  extent: number
  character: string
  starClass: string
  worldTime: number
  /** The world clock's rate. Never assumed to be 1. */
  scale: number
  features: SpaceBody[]
  laneGates: SpaceLaneGate[]
  contacts?: SpaceContact[]
}

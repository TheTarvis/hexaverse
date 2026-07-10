// Fleet movement state + computed position — the client mirror of
// backend/board/ship.go.
//
// A fleet stores one movement field with three shapes (coast | burn | docked);
// no per-tick position is persisted — the live hex is computed from
// (state, worldTime), quantized to the integer hex. The pixel glide between
// hexes is a render concern that lives with the SVG layer, NOT here: this module
// only ever returns logical hexes, keeping continuous motion out of the rules.

import type { Hex } from './hex'
import type { Orbit } from './orbit'
import { orbState } from './orbit'
import { roundf } from './hex'

// Mode is the fleet's movement-state discriminator.
export type Mode = 'coast' | 'burn' | 'docked'

// Target is a burn destination — a hex OR a feature to intercept (exactly one).
export interface Target {
  hex?: Hex
  featureId?: string
}

// Burn is the volatile state: a straight hex-line path traversed over real time.
export interface Burn {
  path: Hex[]
  startTime: number
  arriveTime: number
  target: Target
  dockOnArrive?: string
}

// Docked rides a parent feature; its live hex is the parent's, resolved by the
// caller (which holds the interior).
export interface Docked {
  parentId: string
}

// MovementState is the fleet's single movement field, three shapes.
export interface MovementState {
  mode: Mode
  coast?: Orbit
  burn?: Burn
  docked?: Docked
}

// burnPos returns the fleet's quantized hex along its burn path at time t. The
// logical hex is the nearest path cell (the pixel glides between; that's a
// render concern). Clamped to the endpoints outside the burn window.
export function burnPos(b: Burn, t: number): Hex {
  const n = b.path.length
  if (n === 0) return { q: 0, r: 0 }
  if (t <= b.startTime || b.arriveTime <= b.startTime) return b.path[0]
  if (t >= b.arriveTime) return b.path[n - 1]
  const frac = (t - b.startTime) / (b.arriveTime - b.startTime)
  let idx = roundf(frac * (n - 1))
  if (idx < 0) idx = 0
  if (idx > n - 1) idx = n - 1
  return b.path[idx]
}

// shipPos returns the fleet's computed hex for coast and burn states. Docked
// returns ok=false because its hex is the parent's — the caller resolves it
// from the interior.
export function shipPos(s: MovementState, t: number): { hex: Hex; ok: boolean } {
  switch (s.mode) {
    case 'coast':
      if (!s.coast) return { hex: { q: 0, r: 0 }, ok: true }
      return { hex: orbState(s.coast, t), ok: true }
    case 'burn':
      if (!s.burn) return { hex: { q: 0, r: 0 }, ok: false }
      return { hex: burnPos(s.burn, t), ok: true }
    default: // docked — needs the parent feature
      return { hex: { q: 0, r: 0 }, ok: false }
  }
}

// arrived reports whether a burning fleet has reached its arrival time.
export function arrived(s: MovementState, t: number): boolean {
  return s.mode === 'burn' && !!s.burn && t >= s.burn.arriveTime
}

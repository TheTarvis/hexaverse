// SPIKE (throwaway) — the demo fleet's motion, shared by both renderers.
//
// Both boards must move the ship along EXACTLY the same path at exactly the same
// time, or the comparison is not a comparison. So the motion lives here, in SVG
// pixel space (y down, the convention lib/hex/pixel uses), and each renderer
// converts to its own coordinate system and derives its own heading convention.
//
// One round trip with a hold at each end: hold, ease out to B, hold, ease back.

import type { Point } from '@/lib/hex/pixel'

// Seconds for a full there-and-back.
export const PATROL_CYCLE = 26

// Fraction of the cycle spent stationary at each end.
const HOLD = 0.1

export interface PatrolState {
  x: number
  y: number
  // Velocity direction in SVG space. Zero-length while holding.
  vx: number
  vy: number
  moving: boolean
}

function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

// Progress along the A→B leg at `elapsed` seconds, plus whether the ship is
// under thrust. Returns 0 at A and 1 at B.
// Phase within the cycle, 0..1, safe for negative `elapsed`.
function phase(elapsed: number): number {
  return ((((elapsed % PATROL_CYCLE) + PATROL_CYCLE) % PATROL_CYCLE)) / PATROL_CYCLE
}

export function patrolProgress(elapsed: number): { p: number; moving: boolean } {
  const t = phase(elapsed)
  if (t < HOLD) return { p: 0, moving: false }
  if (t < 0.5) return { p: smooth((t - HOLD) / (0.5 - HOLD)), moving: true }
  if (t < 0.5 + HOLD) return { p: 1, moving: false }
  return { p: 1 - smooth((t - 0.5 - HOLD) / (0.5 - HOLD)), moving: true }
}

export function patrolAt(a: Point, b: Point, elapsed: number): PatrolState {
  const { p, moving } = patrolProgress(elapsed)
  const x = a.x + (b.x - a.x) * p
  const y = a.y + (b.y - a.y) * p

  // Direction of travel: the leg direction, flipped on the return leg. Taken
  // analytically rather than by differencing frames so it is stable at any
  // frame rate and identical in both renderers.
  const half = phase(elapsed) < 0.5 ? 1 : -1
  const dx = (b.x - a.x) * half
  const dy = (b.y - a.y) * half
  const len = Math.hypot(dx, dy) || 1

  return { x, y, vx: dx / len, vy: dy / len, moving }
}

// Move preview — the client's non-authoritative route + ETA for a pending order
// (#0007). It runs the SAME deterministic solve the server commits with, so the
// dashed route and the ETA the player sees are exactly what lands on commit. The
// server's solution stays canonical; this is only the live preview that leads a
// moving target as the world turns.

import { distance, solveHex, solveIntercept, type Hex, type Orbit, type Solution } from '@/lib/hex'

// Mirror of backend fleet.DefaultMovementParams. The preview must solve with the
// SAME knobs the server commits with, or the previewed route/ETA would drift from
// what persists (Go↔TS determinism). There is no per-request params channel yet,
// so these track the backend defaults by hand — change both together.
export const MS_PER_TILE = 60_000 // one world-minute per hex
export const INTERCEPT_HORIZON = 86_400_000 // one world-day of lead search

export interface MovePlan {
  kind: 'hex' | 'intercept'
  path: Hex[]
  meetHex: Hex
  arriveTime: number
  // Time from `now` to arrival (world-ms) — what the ETA readout shows.
  etaMs: number
  // Hex distance to the meeting point (tiles).
  tiles: number
}

function toPlan(kind: MovePlan['kind'], sol: Solution, from: Hex, now: number): MovePlan {
  return {
    kind,
    path: sol.path,
    meetHex: sol.meetHex,
    arriveTime: sol.arriveTime,
    etaMs: Math.max(0, sol.arriveTime - now),
    tiles: distance(from, sol.meetHex),
  }
}

// planToHex previews a straight burn to a fixed board hex.
export function planToHex(from: Hex, dest: Hex, now: number): MovePlan {
  return toPlan('hex', solveHex(from, dest, now, MS_PER_TILE), from, now)
}

// planToBody previews a led intercept against a coasting body — the meeting point
// tracks the body as the world turns (recompute each frame with a fresh `now`).
export function planToBody(from: Hex, orbit: Orbit, now: number): MovePlan {
  return toPlan('intercept', solveIntercept(from, orbit, now, MS_PER_TILE, INTERCEPT_HORIZON), from, now)
}

// etaLabel renders a world-ms duration as a compact human string (the ETA chip).
export function etaLabel(etaMs: number): string {
  const totalMinutes = Math.round(etaMs / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

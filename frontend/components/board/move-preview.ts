// Move preview — the client's non-authoritative route + ETA for a pending order
// (#0007). It runs the SAME deterministic solve the server commits with, so the
// dashed route and the ETA the player sees are exactly what lands on commit. The
// server's solution stays canonical; this is only the live preview that leads a
// moving target as the world turns.

import {
  solveCell,
  solveIntercept,
  type Cell,
  type Orbit,
  type Schedule,
  type Solution,
} from '@/lib/board'

// Mirror of backend fleet.DefaultMovementParams. The preview must solve with the
// SAME knobs the server commits with, or the previewed route/ETA would drift from
// what persists (Go↔TS determinism). There is no per-request params channel yet,
// so these track the backend defaults by hand — change both together.
// 2026-08-26: was 60_000 here while the backend had been 2_500 since the
// 2026-07-13 pace retune (common/tuning.go, `MsPerTile: 2_500 // 5s per cell
// (was 60_000 — one world-minute)`). That 24x is the ETA drift step 6
// recorded the symptom of: a unit-mirror bug, not a tuning constant left
// unset. Every previewed ETA read 24x the one the server committed.
export const MS_PER_TILE = 2_500 // 5s per cell — mirrors common.Tuning().MsPerTile
export const INTERCEPT_HORIZON = 86_400_000 // one world-day of lead search

export interface MovePlan {
  kind: 'cell' | 'intercept'
  path: Cell[]
  meetCell: Cell
  arriveTime: number
  // Time from `now` to arrival (world-ms) — what the ETA readout shows.
  etaMs: number
  // Cells the fleet actually traverses (the routed path length) — matches the
  // ETA even when the route detours around the star.
  tiles: number
}

function toPlan(kind: MovePlan['kind'], sol: Solution, now: number): MovePlan {
  return {
    kind,
    path: sol.path,
    meetCell: sol.meetCell,
    arriveTime: sol.arriveTime,
    etaMs: Math.max(0, sol.arriveTime - now),
    tiles: Math.max(0, sol.path.length - 1),
  }
}

// planToCell previews a burn to a fixed board cell (routed around the star).
export function planToCell(from: Cell, dest: Cell, now: number, s: Schedule): MovePlan {
  return toPlan('cell', solveCell(from, dest, now, MS_PER_TILE, s), now)
}

// planToBody previews a led intercept against a coasting body — the meeting point
// tracks the body as the world turns (recompute each frame with a fresh `now`).
export function planToBody(from: Cell, orbit: Orbit, now: number, s: Schedule): MovePlan {
  return toPlan('intercept', solveIntercept(from, orbit, now, MS_PER_TILE, INTERCEPT_HORIZON, s), now)
}

// etaLabel renders a world-ms duration as a compact human string (the ETA chip).
//
// Seconds matter at the shipped pace. Before the MS_PER_TILE mirror above was
// corrected, a preview was minutes long and minute resolution was enough; a
// cell now costs 5s and a scan 15s, so a minutes-only label rendered most of
// this board's real durations as "0m".
export function etaLabel(etaMs: number): string {
  const totalSeconds = Math.round(etaMs / 1_000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.round(etaMs / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

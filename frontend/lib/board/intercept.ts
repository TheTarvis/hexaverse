// Movement solves — the client mirror of backend/board/intercept.go.
//
// The server's committed solution is canonical; the client evaluates the SAME
// deterministic math only for the non-authoritative live preview (#0007
// non-goal: "movement solving"). Because both sides run identical arithmetic,
// the preview's route + ETA match what the server will persist on commit.

import { type Schedule, arcPath, slotsForRing } from '@/lib/polar'
import type { Cell } from './board'
import { canon } from './board'
import type { Orbit } from './orbit'
import { orbState } from './orbit'

// Solution is the canonical output of a movement solve: the path the fleet
// traverses, the cell it meets/settles on, and the world time it arrives.
export interface Solution {
  path: Cell[]
  meetCell: Cell
  arriveTime: number
}

// solveCell plots a burn to a fixed cell (Go: board.SolveCell): the arc path
// (stitch included) and an arrival time of now + (pathLength−1) × msPerTile —
// the ETA follows the emitted path's cell-step count. No routing or avoidance
// applies: the path IS the arc.
export function solveCell(from: Cell, dest: Cell, now: number, msPerTile: number, s: Schedule): Solution {
  const path = arcPath(from, dest, s)
  const arriveTime = now + (path.length - 1) * msPerTile
  return { path, meetCell: canon(dest, s), arriveTime }
}

// solveIntercept is the deterministic lead-solve against a coasting body: the
// earliest future world time at which the fleet (from its current cell, at
// msPerTile) can be where the body WILL be. The game leads the target; the
// player never eyeballs the lead (#0004). With motion off/slow the body's
// position is constant and this collapses to a fixed-cell solve against its
// current cell — the motion-agnostic property, no special case. The target's
// orbit is an ARGUMENT, never a feature lookup — the moon seam.
//
// Arrival is always a slot-ENTRY instant of the target's orbit (see the Go
// side for the full why): the renderer glides an orbiting glyph toward its
// next cell by the absolute window fraction, so only at a slot entry does the
// body glyph sit on the meet-cell centre where the burn glide ends. BigInt
// mirrors Go's int64 truncating math.
export function solveIntercept(
  from: Cell,
  target: Orbit,
  now: number,
  msPerTile: number,
  horizon: number,
  s: Schedule,
): Solution {
  // Already co-occupying the target's cell → dock in place, no burn to pace.
  const cFrom = canon(from, s)
  const nowPos = orbState(target, now, s)
  if (nowPos.ring === cFrom.ring && nowPos.slot === cFrom.slot) {
    return { path: [cFrom], meetCell: cFrom, arriveTime: now }
  }
  if (target.ring > 0 && target.period > 0) {
    const steps = BigInt(slotsForRing(target.ring, s))
    const period = BigInt(Math.trunc(target.period))
    // k counts the body's slot advances since the epoch (orbState's truncating
    // division); its k-th slot entry is the first world-ms where the advance
    // reaches k. Walk entries after `now` until one is reachable.
    let k = (BigInt(Math.trunc(now)) * steps) / period
    for (;;) {
      k += BigInt(1)
      const tk = Number((k * period + steps - BigInt(1)) / steps)
      if (tk > now + horizon) break
      const pos = orbState(target, tk, s)
      const path = arcPath(cFrom, pos, s)
      const travel = (path.length - 1) * msPerTile
      if (now + travel <= tk) {
        return { path, meetCell: pos, arriveTime: tk }
      }
    }
  }
  // No slot entry within the horizon — an effectively static body (motion
  // off/slow, drawn snapped to its cell centre) — or none reachable: aim at
  // the body's current position, plain-burn ETA.
  const path = arcPath(cFrom, nowPos, s)
  return { path, meetCell: nowPos, arriveTime: now + (path.length - 1) * msPerTile }
}

// Movement solves — the client mirror of backend/board/intercept.go.
//
// The server's committed solution is canonical; the client evaluates the SAME
// deterministic math only for the non-authoritative live preview (#0007
// non-goal: "movement solving"). Because both sides run identical arithmetic,
// the preview's route + ETA match what the server will persist on commit.

import type { Hex } from './hex'
import type { Orbit } from './orbit'
import { distance, line } from './hex'
import { orbState } from './orbit'

// Solution is the canonical output of a movement solve: the path the fleet
// traverses, the hex it meets/settles on, and the world time it arrives.
export interface Solution {
  path: Hex[]
  meetHex: Hex
  arriveTime: number
}

// solveHex plots a straight burn to a fixed hex: a contiguous hex line and an
// arrival time of now + distance × msPerTile.
export function solveHex(from: Hex, dest: Hex, now: number, msPerTile: number): Solution {
  const path = line(from, dest)
  const arriveTime = now + distance(from, dest) * msPerTile
  return { path, meetHex: dest, arriveTime }
}

// solveIntercept is the deterministic lead-solve against a coasting body: the
// earliest future world time at which the fleet (from its current hex, at
// msPerTile) can be where the body WILL be. The game leads the target; the
// player never eyeballs the lead (#0004). With motion off/slow the body's
// position is constant and this collapses to a fixed-hex solve against its
// current hex — the motion-agnostic property, no special case.
export function solveIntercept(from: Hex, target: Orbit, now: number, msPerTile: number, horizon: number): Solution {
  let step = msPerTile
  if (step <= 0) step = 1
  for (let t = now; t <= now + horizon; t += step) {
    const pos = orbState(target, t)
    const travel = distance(from, pos) * msPerTile
    if (now + travel <= t) {
      return { path: line(from, pos), meetHex: pos, arriveTime: t }
    }
  }
  // No feasible lead within the horizon — aim at the body's current position.
  const pos = orbState(target, now)
  return { path: line(from, pos), meetHex: pos, arriveTime: now + distance(from, pos) * msPerTile }
}

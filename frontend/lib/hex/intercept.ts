// Movement solves — the client mirror of backend/board/intercept.go.
//
// The server's committed solution is canonical; the client evaluates the SAME
// deterministic math only for the non-authoritative live preview (#0007
// non-goal: "movement solving"). Because both sides run identical arithmetic,
// the preview's route + ETA match what the server will persist on commit.

import type { Hex } from './hex'
import type { Orbit } from './orbit'
import { routeAround } from './hex'
import { orbState } from './orbit'

// Solution is the canonical output of a movement solve: the path the fleet
// traverses, the hex it meets/settles on, and the world time it arrives.
export interface Solution {
  path: Hex[]
  meetHex: Hex
  arriveTime: number
}

// solveHex plots a burn to a fixed hex: a contiguous path that routes around the
// star (routeAround) and an arrival time of now + pathLength × msPerTile — the ETA
// follows the detour, not the straight-line distance.
export function solveHex(from: Hex, dest: Hex, now: number, msPerTile: number): Solution {
  const path = routeAround(from, dest)
  const arriveTime = now + (path.length - 1) * msPerTile
  return { path, meetHex: dest, arriveTime }
}

// solveIntercept is the deterministic lead-solve against a coasting body: the
// earliest future world time at which the fleet (from its current hex, at
// msPerTile) can be where the body WILL be. The game leads the target; the
// player never eyeballs the lead (#0004). With motion off/slow the body's
// position is constant and this collapses to a fixed-hex solve against its
// current hex — the motion-agnostic property, no special case.
//
// Arrival is always a cell-ENTRY instant of the target's orbit (see the Go
// side for the full why): the renderer glides an orbiting glyph toward its
// next cell by the absolute window fraction, so only at a cell entry does the
// body glyph sit on the meet-hex centre where the burn glide ends — meeting
// mid-window drew the ship a tile behind the body and the dock fold snapped it
// forward onto the parent glyph. BigInt mirrors Go's int64 truncating math.
export function solveIntercept(from: Hex, target: Orbit, now: number, msPerTile: number, horizon: number): Solution {
  // Already co-occupying the target's hex → dock in place, no burn to pace.
  const nowPos = orbState(target, now)
  if (nowPos.q === from.q && nowPos.r === from.r) {
    return { path: [from], meetHex: from, arriveTime: now }
  }
  if (target.ring > 0 && target.period > 0) {
    const steps = BigInt(6 * target.ring)
    const period = BigInt(Math.trunc(target.period))
    // k counts the body's cell advances since the epoch (orbState's truncating
    // division); its k-th cell entry is the first world-ms where the advance
    // reaches k. Walk entries after `now` until one is reachable.
    let k = (BigInt(Math.trunc(now)) * steps) / period
    for (;;) {
      k += BigInt(1)
      const tk = Number((k * period + steps - BigInt(1)) / steps)
      if (tk > now + horizon) break
      const pos = orbState(target, tk)
      const path = routeAround(from, pos)
      const travel = (path.length - 1) * msPerTile
      if (now + travel <= tk) {
        return { path, meetHex: pos, arriveTime: tk }
      }
    }
  }
  // No cell entry within the horizon — an effectively static body (motion
  // off/slow, drawn snapped to its cell centre) — or none reachable: aim at
  // the body's current position, plain-burn ETA.
  const path = routeAround(from, nowPos)
  return { path, meetHex: nowPos, arriveTime: now + (path.length - 1) * msPerTile }
}

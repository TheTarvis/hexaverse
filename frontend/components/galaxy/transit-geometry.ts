// Transit geometry — where a travelling fleet IS on the galaxy graph at a given
// world time, in the graph's own (x,y,z) space (#0008). Pure: no three, no clock,
// no fetch — the scene layer above just paints what this returns.
//
// The position is COMPUTED from (route, legEtas, worldTime) exactly as the board
// computes a burn from its path — nothing per-tick comes off the wire, so a fleet
// keeps crawling its lane on a paused network, and a reload mid-trip re-derives
// the same point.

import { laneFraction } from '@/lib/board'
import type { Fleet } from '@/lib/types/fleet'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type NodePositions = Map<string, Vec3>

// transitPoint — a fleet's live point between two stars, or null when it isn't on
// a lane (it's in a system, and the star's own pip speaks for it). During leg 0
// (the burn to the departure gate) the fleet is still in the origin system, so it
// sits at the origin star until it enters the lane — which is what the board is
// simultaneously drawing cell by cell.
export function transitPoint(
  fleet: Fleet,
  worldTime: number,
  nodes: NodePositions,
): Vec3 | null {
  const s = fleet.state
  if (s.mode === 'laneHold' && s.laneHold) {
    const a = nodes.get(s.laneHold.from)
    const b = nodes.get(s.laneHold.to)
    if (!a || !b) return null
    return lerp(a, b, clamp01(s.laneHold.fraction))
  }
  if (s.mode === 'laneTransit' && s.laneTransit) {
    const lt = s.laneTransit
    const { from, to, frac, ok } = laneFraction(lt, worldTime)
    if (!ok) return null
    const a = nodes.get(lt.route[from])
    const b = nodes.get(lt.route[to])
    if (!a || !b) return null
    return lerp(a, b, clamp01(frac))
  }
  return null
}

// routePath — the star-to-star polyline a trip follows, for the highlighted lane
// chain under the marker. Empty for a fleet that isn't on a trip, or whose route
// names a system this galaxy read doesn't carry.
export function routePath(fleet: Fleet, nodes: NodePositions): Vec3[] {
  const lt = fleet.state.mode === 'laneTransit' ? fleet.state.laneTransit : undefined
  if (!lt) return []
  const points: Vec3[] = []
  for (const id of lt.route) {
    const p = nodes.get(id)
    if (!p) return []
    points.push(p)
  }
  return points
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}

function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0
  return Math.min(1, Math.max(0, t))
}

// Galaxy service — typed wrapper around the #0001 galaxy read API.
//
// Two entry points, one adaptation:
//  - getGalaxy()    — the live galaxy (authed) via apiClient (GET /v1/galaxy).
//  - getStartArea() — the frozen start area, a committed STATIC asset at
//                     /galaxy/start-area.json. Fetched directly (no apiClient,
//                     no auth) so logged-out visitors can load it.
//
// Both return the SAME wire shape, and both go through `adaptGalaxy`, which
// flattens the wire shape into the renderer's node/link shape
// (coords -> x/y/z + fx/fy/fz pin; aId/bId -> source/target). This is the seam
// that keeps the backend coupled to #0001, not to react-force-graph-3d.

import { apiClient } from '../api-client'
import type { Galaxy, GalaxyLink, GalaxyNode, WireGalaxy } from '../types/galaxy'

export const START_AREA_URL = '/galaxy/start-area.json'

// Wire -> renderer adaptation. Pure and exported so the tests assert it directly.
export function adaptGalaxy(wire: WireGalaxy): Galaxy {
  const nodes: GalaxyNode[] = wire.systems.map((s) => ({
    id: s.id,
    name: s.name,
    region: s.region,
    tier: s.tier,
    skeleton: s.skeleton,
    // Flatten coords, and pin the node to its generated position (fx/fy/fz) so
    // the force layout never moves it — on-screen distance is in-game distance.
    x: s.coords.x,
    y: s.coords.y,
    z: s.coords.z,
    fx: s.coords.x,
    fy: s.coords.y,
    fz: s.coords.z,
  }))

  const links: GalaxyLink[] = wire.lanes.map((l) => ({
    id: l.id,
    source: l.aId,
    target: l.bId,
    bridge: l.bridge === true,
  }))

  return {
    id: wire.id,
    seed: wire.seed,
    bounds: wire.bounds,
    worldTime: wire.worldTime,
    nodes,
    links,
  }
}

class GalaxyService {
  // GET /v1/galaxy — the live galaxy for this environment (authed).
  async getGalaxy(): Promise<Galaxy> {
    const response = await apiClient.get<WireGalaxy>('/v1/galaxy')
    return adaptGalaxy(response.data)
  }

  // The frozen start area — a committed static asset. NO apiClient / no auth,
  // so it loads for logged-out visitors and never hits live generation.
  async getStartArea(): Promise<Galaxy> {
    const response = await fetch(START_AREA_URL, { cache: 'force-cache' })
    if (!response.ok) {
      throw new Error(`Failed to load start area: ${response.status}`)
    }
    const wire = (await response.json()) as WireGalaxy
    return adaptGalaxy(wire)
  }
}

export const galaxyService = new GalaxyService()
export default galaxyService

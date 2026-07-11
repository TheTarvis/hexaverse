// Fleet service — typed wrapper around the #0004/#0007 fleet reads and the two
// slice verbs (move + scan). Every call goes through apiClient (auth refresh,
// 401 retry); the board never touches raw fetch.
//
// The reads are fogged server-side (#0006): `listInSystem` returns own units +
// sensed foreigns; `get` 404s a foreign the requester can't sense. The verbs
// commit through the action spine on the backend (#0005) — the response is the
// fleet's new state, and an `action.completed` SSE fires on the system channel
// at the committed ETA.

import { apiClient } from '../api-client'
import type { Fleet, FleetList, RoutePreview } from '../types/fleet'
import type { Hex, Target } from '@/lib/hex'

class FleetService {
  // GET /v1/fleets?systemId= — the requester's fogged fleet layer for one system.
  async listInSystem(systemId: string): Promise<Fleet[]> {
    const response = await apiClient.get<FleetList>(
      `/v1/fleets?systemId=${encodeURIComponent(systemId)}`,
    )
    return response.data.fleets ?? []
  }

  // GET /v1/fleets?mine=true — the requester's own fleets across systems (transit
  // included), the galaxy view's fleet layer (#0008).
  async listMine(): Promise<Fleet[]> {
    const response = await apiClient.get<FleetList>('/v1/fleets?mine=true')
    return response.data.fleets ?? []
  }

  // GET /v1/fleets/:id/route?systemId= — preview the shortest lane route to a
  // destination system (route + per-leg/total ETA) without committing (#0008).
  async previewRoute(fleetId: string, destSystemId: string): Promise<RoutePreview> {
    const response = await apiClient.get<RoutePreview>(
      `/v1/fleets/${fleetId}/route?systemId=${encodeURIComponent(destSystemId)}`,
    )
    return response.data
  }

  // POST /v1/fleets/:id/orders {systemId} — commit a graph-tier trip. The server
  // pathfinds + freezes the route; the response is the fleet now in lane transit.
  async travel(fleetId: string, systemId: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/orders`, { systemId })
    return response.data
  }

  // GET /v1/fleets/:id — one fleet (404 if foreign and unsensed).
  async get(fleetId: string): Promise<Fleet> {
    const response = await apiClient.get<Fleet>(`/v1/fleets/${fleetId}`)
    return response.data
  }

  // POST /v1/fleets/:id/orders — commit a burn to a hex or a feature (led
  // intercept). The server solves; the response is the fleet now burning.
  async order(fleetId: string, target: Target): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/orders`, { target })
    return response.data
  }

  // POST /v1/fleets/:id/cancel — drop to coast at the current position.
  async cancel(fleetId: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/cancel`, {})
    return response.data
  }

  // POST /v1/fleets/:id/scan — commit a scan (409 if the fleet is already busy).
  async scan(fleetId: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/scan`, {})
    return response.data
  }

  // POST /v1/fleets/dev-seed — drop a fleet into a system (dev stand-in for spawn,
  // #0009). Returns the new fleet so the caller learns its id.
  async devSeed(systemId: string, at: Hex, corporationId?: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>('/v1/fleets/dev-seed', {
      systemId,
      at,
      ...(corporationId ? { corporationId } : {}),
    })
    return response.data
  }
}

export const fleetService = new FleetService()
export default fleetService

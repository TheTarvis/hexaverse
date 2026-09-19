// Fleet service — typed wrapper around the fleet reads and the continuous-
// space verbs (migrate-fleet-to-continuous-burns): burn ordering, cut-drive,
// stop-in-place, jump, and mine. Every call goes through apiClient (auth
// refresh, 401 retry); nothing here touches raw fetch.
//
// The board draws no fleet layer (design.md Decision 12), so there is no
// per-system fleet list read any more — only the requester's own fleets
// (`listMine`/`get`), which the roster panel and the board's mine/sell
// surface both read from.

import { apiClient } from '../api-client'
import type {
  BurnPreview,
  Fleet,
  FleetList,
  JumpRequest,
  MineCommit,
  MineRequest,
  OrderRequest,
} from '../types/fleet'
import type { ScanTarget, ScanTargetList } from '../types/scan'

// An order/preview body carries EXACTLY the keys it means. A key present
// with an `undefined` value is dropped rather than serialized: the server
// rejects a request naming both a body and a point (`fleet-movement`:
// *Order Request Validation*), and a `maxFuelTons` of 0 is a real cap, so
// "no cap" must reach the wire as an ABSENT key, never as zero.
function orderBody(request: OrderRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined) body[key] = value
  }
  return body
}

class FleetService {
  // GET /v1/fleets?mine=true — the requester's own fleets across systems (a
  // corpless requester gets an empty list, not an error). Resolves the WHOLE
  // envelope — `fleets`, `worldTime` and `scale` — so a fleetless requester's
  // clock still has a served scale to anchor on (openspec change
  // `fix-world-time-render-loop`, task 3.4).
  async listMine(): Promise<FleetList> {
    const response = await apiClient.get<FleetList>('/v1/fleets?mine=true')
    return {
      fleets: response.data.fleets ?? [],
      worldTime: response.data.worldTime,
      scale: response.data.scale,
    }
  }

  // GET /v1/fleets/:id — one own fleet (404 if foreign, per fleet-movement
  // "Fleet Read Endpoints Serve Own Fleets Only").
  async get(fleetId: string): Promise<Fleet> {
    const response = await apiClient.get<Fleet>(`/v1/fleets/${fleetId}`)
    return response.data
  }

  // POST /v1/fleets/:id/orders {bodyId|point, accel?} — commit a burn to a
  // body or an explicit point (fleet-movement "In-System Burn Order to a
  // Body or a Point"). The server solves; the response is the fleet now
  // burning, detached (`attachedTo` cleared at commit).
  async order(fleetId: string, request: OrderRequest): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/orders`, orderBody(request))
    return response.data
  }

  // POST /v1/fleets/:id/orders/preview {bodyId|point, accel?} — the
  // server-solved burn preview: the same solve the commit would run, with
  // nothing committed and no channel claimed
  // (serve-orbital-elements-and-burn-preview). The client never solves a
  // burn itself, so this seam is the ONLY source of a curve, an arrival, a
  // delta-v or a fuel cost the view may display.
  async preview(fleetId: string, request: OrderRequest): Promise<BurnPreview> {
    const response = await apiClient.post<BurnPreview>(
      `/v1/fleets/${fleetId}/orders/preview`,
      orderBody(request),
    )
    return response.data
  }

  // POST /v1/fleets/:id/hold — begin a station-keeping hold on the fleet's
  // current orbit park. Instant: no action, no ETA (add-stationkeep-hold-
  // verb). Rejected at or below the station-keeping fuel reserve.
  async hold(fleetId: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/hold`, {})
    return response.data
  }

  // POST /v1/fleets/:id/release — end a station-keeping hold, re-circularizing
  // at the held offset's planar radius. Instant, and free.
  async release(fleetId: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/release`, {})
    return response.data
  }

  // POST /v1/fleets/:id/cut-drive — free, instant: converts the active burn
  // to a drift and cancels the running movement action.
  async cutDrive(fleetId: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/cut-drive`, {})
    return response.data
  }

  // POST /v1/fleets/:id/stop — a velocity-nulling burn above the speed
  // floor, or an instant/free conversion to a point park at or below it.
  async stop(fleetId: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/stop`, {})
    return response.data
  }

  // POST /v1/fleets/:id/jump {laneId} — a single-hop lane crossing from a
  // docked, charted gate (fleet-movement "Lane Jump From a Docked Gate").
  async jump(fleetId: string, laneId: string): Promise<Fleet> {
    const request: JumpRequest = { laneId }
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/jump`, request)
    return response.data
  }

  // POST /v1/fleets/:id/mine {featureId, kind, tons} — commit an extraction
  // run. Rides the movement channel: rejected 409 while burning or already
  // mining. Every rejection carries a distinguishable `error` reason, which
  // apiClient surfaces as the thrown error's message.
  async mine(fleetId: string, request: MineRequest): Promise<MineCommit> {
    const response = await apiClient.post<MineCommit>(`/v1/fleets/${fleetId}/mine`, request)
    return response.data
  }

  // GET /v1/fleets/:id/scan-targets — the server-served focused-scan target
  // list (add-scan-and-sightings-surface, `focused-scan`): host id, kind
  // ('body' | 'fleet'), and the sweep duration it would price at. NEVER
  // mirrored or approximated client-side.
  async scanTargets(fleetId: string): Promise<ScanTarget[]> {
    const response = await apiClient.get<ScanTargetList>(`/v1/fleets/${fleetId}/scan-targets`)
    return response.data.targets ?? []
  }

  // POST /v1/fleets/:id/scan {hostId} — commit a focused scan against a
  // listed target's served host id and nothing else.
  async scan(fleetId: string, hostId: string): Promise<Fleet> {
    const response = await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/scan`, { hostId })
    return response.data
  }
}

export const fleetService = new FleetService()
export default fleetService

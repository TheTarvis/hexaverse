// Market service (#0011) — the price board, the station read, and the sell verb.
// Every call goes through apiClient (auth refresh, 401 retry); nothing here
// touches raw fetch.
//
// Reads are gated server-side by the requester's graph tier: the board returns
// only stations the requester has charted, and a station below that tier reads
// 404 (existence hidden, indistinguishable from "no station here" — so the
// endpoint cannot be used to probe for where corporations woke up).

import { apiClient } from '../api-client'
import type { MarketBoard, SellRequest, SellResult, Station } from '../types/market'

class MarketService {
  // GET /v1/market/board — every visible station's live quotes.
  //
  // Quotes are computed live on every read, never frozen at an observation's
  // asOf: market data is information, not feature composition. A request another
  // corporation drained shows drained on the very next poll, with no travel and
  // no scan.
  async getBoard(): Promise<MarketBoard> {
    const response = await apiClient.get<MarketBoard>('/v1/market/board')
    return response.data
  }

  // GET /v1/systems/:systemId/station — one system's station, or 404 when the
  // requester's tier is below the gate.
  async getStation(systemId: string): Promise<Station> {
    const response = await apiClient.get<Station>(
      `/v1/systems/${encodeURIComponent(systemId)}/station`,
    )
    return response.data
  }

  // POST /v1/fleets/:fleetId/sell — settle a sale from a docked fleet's hold.
  // Instant: the response carries the applied prices, the new hold, and the new
  // balance, with no action id and no ETA to wait on.
  async sell(fleetId: string, request: SellRequest): Promise<SellResult> {
    const response = await apiClient.post<SellResult>(`/v1/fleets/${fleetId}/sell`, request)
    return response.data
  }
}

export const marketService = new MarketService()

// newOperationKey mints the idempotency anchor for ONE user-initiated sale
// attempt.
//
// Reuse it across transport retries of that same attempt (that is the entire
// point — a retried request must not settle twice), and mint a FRESH one for any
// new or re-priced attempt (reusing it there would be answered as a replay of
// the old sale, or rejected as a parameter conflict).
//
// Format must satisfy the server's constraint: 16–64 chars of [A-Za-z0-9_-].
// crypto.randomUUID is 36 chars of hex and hyphens, which qualifies.
export function newOperationKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for environments without randomUUID (older Safari, some test
  // runners). Same charset, comfortably inside the length bounds.
  const rand = () => Math.random().toString(36).slice(2, 12)
  return `${rand()}-${rand()}-${rand()}`.slice(0, 64)
}

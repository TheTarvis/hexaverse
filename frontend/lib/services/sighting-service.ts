// Sighting service — typed wrapper around the corporation's sighting pile
// read (openspec change `add-scan-and-sightings-surface`, `sighting-
// records`). GET /v1/sightings?systemId=&cursor=&limit= — `systemId`
// present is the ghost layer's system-filtered read, absent is the log's
// corp-wide read (link8b-impl-contract.md §1.2).
//
// The continuation cursor is passed back VERBATIM, never parsed, rewritten
// or re-encoded (`sighting-log`: *The Log Pages Through the Pile With the
// Server's Own Cursor*) — it is opaque by the server's own statement.

import { apiClient } from '../api-client'
import type { SightingPage } from '../types/sighting'

export interface SightingListParams {
  systemId?: string
  cursor?: string
  limit?: number
}

class SightingService {
  async list(params: SightingListParams): Promise<SightingPage> {
    const query = new URLSearchParams()
    if (params.systemId) query.set('systemId', params.systemId)
    if (params.cursor) query.set('cursor', params.cursor)
    if (params.limit) query.set('limit', String(params.limit))
    const qs = query.toString()
    const response = await apiClient.get<SightingPage>(`/v1/sightings${qs ? `?${qs}` : ''}`)
    return response.data
  }
}

export const sightingService = new SightingService()
export default sightingService

// System service — typed wrapper around the #0007 fogged interior read.
//
// getSystemBoard(id) → GET /v1/systems/:id (authed, via apiClient). The backend
// fogs the interior per requester at this boundary (#0006), so the response is
// the ONLY world state the client holds — no unfogged data ever reaches here.
//
// There is no wire→renderer adaptation (cf. galaxy-service's `adaptGalaxy`): the
// board consumes `Hex`/`Orbit` straight from `lib/hex`, which the wire already
// matches. This service is the seam where the requester's fleets (a separate
// fleet-domain read) will fan in on a later slice.

import { apiClient } from '../api-client'
import type { SystemBoard } from '../types/system-board'

class SystemService {
  // GET /v1/systems/:id — the requester's fogged interior for one system.
  async getSystemBoard(systemId: string): Promise<SystemBoard> {
    const response = await apiClient.get<SystemBoard>(`/v1/systems/${systemId}`)
    return response.data
  }
}

export const systemService = new SystemService()
export default systemService

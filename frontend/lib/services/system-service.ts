// System service — typed wrapper around the interior read.
//
// getSystemSpace(id) → GET /v1/systems/:id (authed, via apiClient). The
// backend fogs the interior per requester at this boundary (#0006), so the
// response is the ONLY world state the client holds — no unfogged data ever
// reaches here.
//
// There is no wire→renderer adaptation (cf. galaxy-service's `adaptGalaxy`):
// the space view's scene builder reads the served continuous positions,
// sizes and orbital elements directly. The lattice `getSystemBoard` twin is
// gone with the lattice board itself (openspec build-production-space-view,
// tasks.md 10.1/10.3).

import { apiClient } from '../api-client'
import type { SystemSpace } from '../types/system-space'

class SystemService {
  // GET /v1/systems/:id — the requester's interior read in CONTINUOUS space
  // (openspec build-production-space-view): every body's served position,
  // size and orbital elements, the system's continuous extent, and the world
  // clock's scale.
  async getSystemSpace(systemId: string): Promise<SystemSpace> {
    const response = await apiClient.get<SystemSpace>(`/v1/systems/${systemId}`)
    return response.data
  }
}

export const systemService = new SystemService()
export default systemService

// Corporation service — the wake-up + session-bootstrap calls (spec #0009). Every
// call goes through apiClient (auth refresh, 401 retry).

import { apiClient } from '../api-client'
import type { Corporation, SpawnRequest, SpawnResult } from '../types/corporation'

class CorporationService {
  // GET /v1/corporations/me — the caller's living corporation, or null before they
  // have woken (the backend 404s a corpless account; that's an expected state, not
  // an error, so it maps to null).
  async getMine(): Promise<Corporation | null> {
    try {
      const response = await apiClient.get<Corporation>('/v1/corporations/me')
      return response.data
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null
      throw e
    }
  }

  // POST /v1/corporations {name} — wake: create the corporation + its first hull in
  // a frontier system. Idempotent per account (a repeat returns the existing corp),
  // so it's safe to call optimistically from the wake-up flow.
  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    const response = await apiClient.post<SpawnResult>('/v1/corporations', req)
    return response.data
  }
}

export const corporationService = new CorporationService()
export default corporationService

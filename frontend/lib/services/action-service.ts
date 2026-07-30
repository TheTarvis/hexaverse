// Action service — the owner's inbox read on the #0005 spine. The slice uses
// it to surface a fleet's RUNNING scan (#0006): the action carries the frozen
// aim target and eta, so the board can draw the committed beam and count down.

import { apiClient } from '../api-client'
import type { ActionList, GameAction } from '../types/action'

class ActionService {
  // GET /v1/actions?actor=&status=running — the actor's running actions.
  async listRunning(actorId: string): Promise<GameAction[]> {
    const response = await apiClient.get<ActionList>(
      `/v1/actions?actor=${encodeURIComponent(actorId)}&status=running`,
    )
    return response.data.actions ?? []
  }

  // POST /v1/actions/:id/cancel — the generic #0005 cancel: flips the action
  // cancelled and releases its slot. Motionless verbs only (mine, scan); a
  // burning fleet cancels through POST /v1/fleets/:id/cancel so the backend
  // can settle a coast.
  async cancel(actionId: string): Promise<GameAction> {
    const response = await apiClient.post<GameAction>(
      `/v1/actions/${encodeURIComponent(actionId)}/cancel`,
      {},
    )
    return response.data
  }
}

export const actionService = new ActionService()
export default actionService

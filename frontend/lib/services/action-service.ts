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
}

export const actionService = new ActionService()
export default actionService

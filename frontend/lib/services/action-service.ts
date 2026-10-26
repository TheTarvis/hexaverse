// Action service — the owner's inbox read on the #0005 spine. The slice uses
// it to surface a fleet's RUNNING scan (#0006): the action carries the frozen
// aim target and eta, so the board can draw the committed beam and count down.

import { apiClient } from '../api-client'
import type { ActionList, GameAction } from '../types/action'

class ActionService {
  subscribe(scope: string, onAction: (data: unknown) => void, onConnect: () => void): () => void {
    return apiClient.subscribe(`/v1/channels/${encodeURIComponent(scope)}/stream`, 'action.completed', onAction, onConnect)
  }

  async get(actionId: string): Promise<GameAction> {
    const response = await apiClient.get<GameAction>(`/v1/actions/${encodeURIComponent(actionId)}`)
    return response.data
  }

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

  // GET /v1/actions?actor=&status=done&type= — the bounded, ordered settled
  // inbox (add-scan-and-sightings-surface, `action-dispatch`'s *Inbox by
  // Actor Query Param*). The settled sweep report's own read is
  // `{type: 'scan'}` — the TYPE-FILTERED read, never the type-agnostic one,
  // so a fleet's other settled work cannot displace an unacknowledged scan.
  async listSettled(actorId: string, options: { type?: string } = {}): Promise<GameAction[]> {
    const query = new URLSearchParams({ actor: actorId, status: 'done' })
    if (options.type) query.set('type', options.type)
    const response = await apiClient.get<ActionList>(`/v1/actions?${query.toString()}`)
    return response.data.actions ?? []
  }

  // POST /v1/actions/:id/acknowledge — marks a settled action's report as
  // read, so a later refetch does not report the same settled sweep again.
  async acknowledge(actionId: string): Promise<GameAction> {
    const response = await apiClient.post<GameAction>(
      `/v1/actions/${encodeURIComponent(actionId)}/acknowledge`,
      {},
    )
    return response.data
  }
}

export const actionService = new ActionService()
export default actionService

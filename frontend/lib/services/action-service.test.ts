import { describe, it, expect, vi, beforeEach } from 'vitest'
import { actionService } from './action-service'
import { apiClient } from '../api-client'
import type { GameAction } from '../types/action'

vi.mock('../api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }))
const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)

const running: GameAction = {
  id: 'action_1',
  type: 'scan',
  actor: 'fleet_1',
  scope: 'sys-7',
  params: { systemId: 'sys-7', target: { q: 2, r: 0 } },
  committedAt: 0,
  eta: 30_000,
  status: 'running',
  worldTime: 1_000,
}

describe('actionService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists an actor’s running actions via the inbox read', async () => {
    mockGet.mockResolvedValue({ data: { actions: [running], worldTime: 1_000 } } as never)

    const actions = await actionService.listRunning('fleet_1')

    expect(mockGet).toHaveBeenCalledWith('/v1/actions?actor=fleet_1&status=running')
    expect(actions).toEqual([running])
  })

  it('returns an empty list when the inbox is clear', async () => {
    mockGet.mockResolvedValue({ data: { worldTime: 1_000 } } as never)
    expect(await actionService.listRunning('fleet_1')).toEqual([])
  })

  it('cancels a run through the generic #0005 endpoint', async () => {
    const cancelled = { ...running, id: 'action_mine', type: 'mine', status: 'cancelled' as const }
    mockPost.mockResolvedValue({ data: cancelled } as never)

    const result = await actionService.cancel('action_mine')

    expect(mockPost).toHaveBeenCalledWith('/v1/actions/action_mine/cancel', {})
    expect(result).toEqual(cancelled)
  })
})

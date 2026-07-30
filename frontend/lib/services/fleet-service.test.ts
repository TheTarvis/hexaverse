import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fleetService } from './fleet-service'
import { apiClient } from '../api-client'
import type { Fleet, FleetList } from '../types/fleet'

vi.mock('../api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)

const ok = <T>(data: T) => ({ data, status: 200, headers: new Headers() })

const fleet: Fleet = {
  id: 'fleet_1',
  corporationId: 'corp-user1',
  systemId: 'sys-7',
  state: { mode: 'coast', coast: { ring: 3, angle0: 0, period: 1 << 30, dir: 1 } },
  position: { q: 3, r: 0 },
  own: true,
  worldTime: 123456,
}

describe('fleetService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists fleets in a system, encoding the systemId query', async () => {
    const list: FleetList = { fleets: [fleet], worldTime: 123456 }
    mockGet.mockResolvedValue(ok(list))

    const result = await fleetService.listInSystem('sys 7')

    expect(mockGet).toHaveBeenCalledWith('/v1/fleets?systemId=sys%207')
    expect(result).toEqual([fleet])
  })

  it('returns an empty array when the envelope carries no fleets', async () => {
    mockGet.mockResolvedValue(ok({ worldTime: 1 } as FleetList))
    expect(await fleetService.listInSystem('sys-7')).toEqual([])
  })

  it('orders a burn to a target through POST /orders', async () => {
    mockPost.mockResolvedValue(ok(fleet))

    await fleetService.order('fleet_1', { hex: { q: 5, r: -2 } })

    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/orders', {
      target: { hex: { q: 5, r: -2 } },
    })
  })

  it('cancels and scans via their POST endpoints', async () => {
    mockPost.mockResolvedValue(ok(fleet))

    await fleetService.cancel('fleet_1')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/cancel', {})

    // The scan is a 360° sweep (#0006 Decision #21) — no aim, no body.
    await fleetService.scan('fleet_1')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/scan', {})
  })

  it('commits a mine run through POST /mine and returns the action id + frozen eta', async () => {
    const commit = { actionId: 'act_9', eta: 200_000, worldTime: 123_456 }
    mockPost.mockResolvedValue(ok(commit))

    const result = await fleetService.mine('fleet_1', {
      featureId: 'feat-belt',
      kind: 'metals',
      tons: 40,
    })

    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/mine', {
      featureId: 'feat-belt',
      kind: 'metals',
      tons: 40,
    })
    expect(result).toEqual(commit)
  })

  it('lets a mine rejection propagate with the server reason intact', async () => {
    // The backend answers every commit rejection with a distinguishable
    // `error` reason; apiClient turns that into the thrown message, and the
    // service must not swallow it — the board toasts it verbatim.
    mockPost.mockRejectedValue(new Error('mine: requested tons exceed the fleet\'s free hold'))

    await expect(
      fleetService.mine('fleet_1', { featureId: 'feat-belt', kind: 'metals', tons: 999 }),
    ).rejects.toThrow(/free hold/)
  })
})

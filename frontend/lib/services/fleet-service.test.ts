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

    await fleetService.scan('fleet_1')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/scan', {})
  })

  it('dev-seeds a fleet, omitting corporationId when not given', async () => {
    mockPost.mockResolvedValue(ok(fleet))

    await fleetService.devSeed('sys-7', { q: 0, r: 0 })
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/dev-seed', {
      systemId: 'sys-7',
      at: { q: 0, r: 0 },
    })

    await fleetService.devSeed('sys-7', { q: 0, r: 0 }, 'corp-x')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/dev-seed', {
      systemId: 'sys-7',
      at: { q: 0, r: 0 },
      corporationId: 'corp-x',
    })
  })
})

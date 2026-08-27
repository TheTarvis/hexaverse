import { describe, it, expect, vi, beforeEach } from 'vitest'
import { corporationService } from './corporation-service'
import { apiClient } from '../api-client'
import type { Corporation, SpawnResult } from '../types/corporation'

vi.mock('../api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)

const ok = <T>(data: T) => ({ data, status: 200, headers: new Headers() })

const corp: Corporation = {
  id: 'corp_1',
  accountId: 'account-1',
  name: 'Bob',
  createdAt: 1000, credits: 0
}

describe('corporationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getMine returns the caller corp', async () => {
    mockGet.mockResolvedValue(ok(corp))
    const result = await corporationService.getMine()
    expect(mockGet).toHaveBeenCalledWith('/v1/corporations/me')
    expect(result).toEqual(corp)
  })

  it('getMine maps a 404 (corpless account) to null, not an error', async () => {
    mockGet.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
    await expect(corporationService.getMine()).resolves.toBeNull()
  })

  it('getMine rethrows non-404 errors', async () => {
    mockGet.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
    await expect(corporationService.getMine()).rejects.toThrow('boom')
  })

  it('spawn posts the name and returns the wake result', async () => {
    const result: SpawnResult = {
      corporation: corp,
      fleet: {
        id: 'fleet_1',
        corporationId: 'corp_1',
        systemId: 'sys-9',
        state: { mode: 'coast', coast: { ring: 15, angle0: 0, period: 1 << 30, dir: 1 } },
        position: { ring: 15, slot: 0 },
        own: true,
        worldTime: 1000,
      },
      homeSystem: {
        id: 'sys-9',
        name: 'Kepler',
        region: 'normal',
        coords: { x: 1, y: 2, z: 0 },
        skeleton: { starClass: 'G', bodies: [{ type: 'rocky', ring: 1 }] },
      },
      worldTime: 1000,
    }
    mockPost.mockResolvedValue(ok(result))

    const spawned = await corporationService.spawn({ name: 'Bob' })
    expect(mockPost).toHaveBeenCalledWith('/v1/corporations', { name: 'Bob' })
    expect(spawned.homeSystem.id).toBe('sys-9')
    expect(spawned.fleet.corporationId).toBe('corp_1')
  })
})

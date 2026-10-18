import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fleetService } from './fleet-service'
import { apiClient } from '../api-client'
import type { Fleet, FleetList } from '../types/fleet'
import { SHIP_MODE_PARKED } from '../types/fleet'

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
  state: {
    Mode: SHIP_MODE_PARKED,
    Burn: null,
    Park: { Kind: 0, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
    Drift: null,
  },
  position: { X: 0, Y: 0, Z: 0 },
  own: true,
  worldTime: 123456,
}

describe('fleetService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // fix-world-time-render-loop, task 3.4 (impl contract §4): `listMine()`
  // now returns the WHOLE envelope — `{ fleets, worldTime, scale }` — not
  // just the fleets array, so `GalaxyView`'s clock can anchor on the
  // envelope's served scale instead of dropping it.
  it('preserves optional API names in list and detail responses while accepting legacy fleets', async () => {
    const named = { ...fleet, name: 'Peregrine' }
    mockGet.mockResolvedValueOnce(ok({ fleets: [named, fleet], worldTime: 1, scale: 1 }))
    expect((await fleetService.listMine()).fleets).toEqual([named, fleet])
    mockGet.mockResolvedValueOnce(ok(named))
    expect((await fleetService.get(named.id)).name).toBe('Peregrine')
    expect(fleet).not.toHaveProperty('name')
  })

  it('lists the requester’s own fleets via GET /v1/fleets?mine=true, exposing the envelope\'s scale', async () => {
    const list: FleetList = { fleets: [fleet], worldTime: 123456, scale: 60 }
    mockGet.mockResolvedValue(ok(list))

    const result = await fleetService.listMine()

    expect(mockGet).toHaveBeenCalledWith('/v1/fleets?mine=true')
    expect(result.fleets).toEqual([fleet])
    expect(result.worldTime).toBe(123456)
    expect(result.scale).toBe(60)
  })

  it('returns an empty fleets array when the envelope carries none, still exposing worldTime/scale', async () => {
    mockGet.mockResolvedValue(ok({ worldTime: 1, scale: 1 } as FleetList))
    const result = await fleetService.listMine()
    expect(result.fleets).toEqual([])
    expect(result.worldTime).toBe(1)
    expect(result.scale).toBe(1)
  })

  it('gets one own fleet via GET /v1/fleets/:id', async () => {
    mockGet.mockResolvedValue(ok(fleet))
    const result = await fleetService.get('fleet_1')
    expect(mockGet).toHaveBeenCalledWith('/v1/fleets/fleet_1')
    expect(result).toEqual(fleet)
  })

  it('orders a burn to a body through POST /orders', async () => {
    mockPost.mockResolvedValue(ok(fleet))

    await fleetService.order('fleet_1', { bodyId: 'p-1' })

    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/orders', { bodyId: 'p-1' })
  })

  it('orders a burn to an explicit point, carrying an optional accel through', async () => {
    mockPost.mockResolvedValue(ok(fleet))

    await fleetService.order('fleet_1', { point: { X: 1, Y: 2, Z: 3 }, accel: 0.5 })

    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/orders', {
      point: { X: 1, Y: 2, Z: 3 },
      accel: 0.5,
    })
  })

  it('cuts the drive via POST /cut-drive', async () => {
    mockPost.mockResolvedValue(ok(fleet))
    await fleetService.cutDrive('fleet_1')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/cut-drive', {})
  })

  it('stops in place via POST /stop', async () => {
    mockPost.mockResolvedValue(ok(fleet))
    await fleetService.stop('fleet_1')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/stop', {})
  })

  it('jumps a lane via POST /jump {laneId}', async () => {
    mockPost.mockResolvedValue(ok(fleet))
    await fleetService.jump('fleet_1', 'lane-9')
    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/jump', { laneId: 'lane-9' })
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

  it('lets an order rejection propagate with the server reason intact', async () => {
    mockPost.mockRejectedValue(new Error('order: commanded accel below the configured minimum'))

    await expect(
      fleetService.order('fleet_1', { bodyId: 'p-1', accel: 0.0001 }),
    ).rejects.toThrow(/minimum/)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { marketService, newOperationKey } from './market-service'
import { apiClient } from '../api-client'
import type { MarketBoard, SellResult, Station } from '../types/market'

vi.mock('../api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)

const ok = <T>(data: T) => ({ data, status: 200, headers: new Headers() })

const board: MarketBoard = {
  venues: [
    {
      venue: 'sys-1',
      systemId: 'sys-1',
      quotes: [
        {
          kind: 'metals',
          entries: [
            { unitPrice: 140, source: 'request', remainingQuantity: 30, requestId: 'req-1' },
            { unitPrice: 100, source: 'floor', unlimited: true },
          ],
        },
      ],
    },
  ],
  worldTime: 123456,
  refreshCadenceMs: 30000,
}

const station: Station = {
  systemId: 'sys-1',
  featureId: 'feat-station',
  createdAt: 1000,
}

describe('marketService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the aggregate price board', async () => {
    mockGet.mockResolvedValue(ok(board))

    const result = await marketService.getBoard()

    expect(mockGet).toHaveBeenCalledWith('/v1/market/board')
    expect(result).toEqual(board)
  })

  it('reads one system station, encoding the system id', async () => {
    mockGet.mockResolvedValue(ok(station))

    const result = await marketService.getStation('sys 1')

    expect(mockGet).toHaveBeenCalledWith('/v1/systems/sys%201/station')
    expect(result).toEqual(station)
  })

  it('posts a sale with its operation key', async () => {
    const settled: SellResult = {
      fills: [{ source: 'request', unitPrice: 140, tons: 10, proceeds: 1400, requestId: 'req-1' }],
      totalProceeds: 1400,
      cargo: { metals: 30 },
      balance: 2400,
      worldTime: 123456,
    }
    mockPost.mockResolvedValue(ok(settled))

    const result = await marketService.sell('fleet_1', {
      featureId: 'feat-station',
      kind: 'metals',
      tons: 10,
      operationKey: 'abcdefghijklmnop',
    })

    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/sell', {
      featureId: 'feat-station',
      kind: 'metals',
      tons: 10,
      operationKey: 'abcdefghijklmnop',
    })
    expect(result).toEqual(settled)
  })

  it('omits an unsupplied slippage guard entirely rather than sending zero', async () => {
    // A guard of 0 matches no positive price, so sending one for a client that
    // did not opt in would reject every such sale.
    mockPost.mockResolvedValue(ok({} as SellResult))

    await marketService.sell('fleet_1', {
      featureId: 'feat-station',
      kind: 'metals',
      tons: 10,
      operationKey: 'abcdefghijklmnop',
    })

    const body = mockPost.mock.calls[0][1] as Record<string, unknown>
    expect(body).not.toHaveProperty('expectedUnitPrice')
    expect(body).not.toHaveProperty('minTotalProceeds')
  })

  it('passes both slippage guards through when supplied', async () => {
    mockPost.mockResolvedValue(ok({} as SellResult))

    await marketService.sell('fleet_1', {
      featureId: 'feat-station',
      kind: 'metals',
      tons: 10,
      operationKey: 'abcdefghijklmnop',
      expectedUnitPrice: 140,
      minTotalProceeds: 1200,
    })

    const body = mockPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.expectedUnitPrice).toBe(140)
    expect(body.minTotalProceeds).toBe(1200)
  })

  it('propagates a rejection so the component can map it to player-facing copy', async () => {
    mockPost.mockRejectedValue(new Error('market: price changed since your quote'))

    await expect(
      marketService.sell('fleet_1', {
        featureId: 'feat-station',
        kind: 'metals',
        tons: 10,
        operationKey: 'abcdefghijklmnop',
      }),
    ).rejects.toThrow('price changed')
  })
})

// --- refuel (add-fuel-as-cargo tasks.md 8.5/8.7; `fuel-purchase`'s new
// verb, modelled on `goods-sale`/sell). `marketService.refuel` DOES NOT
// EXIST YET on the class — calling it below throws
// "marketService.refuel is not a function" at runtime, a legitimate red
// against an EXISTING, already-resolved module (no import-resolution
// failure, since `marketService` itself is real).
//
// CONTRACT ASSUMED BY THIS SDET (confirm against the backend SDET's
// fuel-purchase contract before implementing): `POST /v1/fleets/:fleetId/
// refuel` with body `{ tons, operationKey }` — no `featureId` in the body
// at all (fuel-purchase's own "Refuel Resolves the Station From the Acting
// Fleet's Own System, Never a Client-Supplied Identifier" — unlike
// `sell`'s `featureId`, which names the SELLING station explicitly; refuel
// deliberately carries no station/system identifier for the server to
// trust). Response settles instantly (no action id, no ETA), mirroring
// `SellResult`'s own shape.
describe('marketService.refuel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts a refuel with its tonnage and operation key, naming no station/system identifier', async () => {
    const settled = {
      cost: 140,
      cargo: { fuel: 60 },
      balance: 860,
      worldTime: 123456,
    }
    mockPost.mockResolvedValue(ok(settled))

    const result = await marketService.refuel('fleet_1', {
      tons: 10,
      operationKey: 'abcdefghijklmnop',
    })

    expect(mockPost).toHaveBeenCalledWith('/v1/fleets/fleet_1/refuel', {
      tons: 10,
      operationKey: 'abcdefghijklmnop',
    })
    // Never a featureId, systemId, or corporationId in the body — the
    // server resolves the station from the acting fleet's OWN system only.
    const body = mockPost.mock.calls[0][1] as Record<string, unknown>
    expect(body).not.toHaveProperty('featureId')
    expect(body).not.toHaveProperty('systemId')
    expect(body).not.toHaveProperty('corporationId')
    expect(result).toEqual(settled)
  })

  it('propagates a rejection so the component can map it to player-facing copy', async () => {
    mockPost.mockRejectedValue(new Error('fuel-purchase: requested tonnage costs more than available credits'))

    await expect(
      marketService.refuel('fleet_1', { tons: 10, operationKey: 'abcdefghijklmnop' }),
    ).rejects.toThrow('costs more than available credits')
  })
})

describe('newOperationKey', () => {
  it('satisfies the server format constraint', () => {
    // 16–64 characters of [A-Za-z0-9_-]. A key outside this is rejected with 400
    // before the server reads any state.
    for (let i = 0; i < 50; i++) {
      const key = newOperationKey()
      expect(key.length).toBeGreaterThanOrEqual(16)
      expect(key.length).toBeLessThanOrEqual(64)
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('mints a distinct key each call', () => {
    // One key per user-initiated attempt: reusing it across a fresh attempt
    // would be answered as a replay of the previous sale.
    const keys = new Set(Array.from({ length: 100 }, () => newOperationKey()))
    expect(keys.size).toBe(100)
  })
})

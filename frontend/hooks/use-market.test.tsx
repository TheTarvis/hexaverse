import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMarketBoard, useStation, useSell } from './use-market'
import { marketService } from '@/lib/services/market-service'
import { queryKeys } from '@/lib/query-keys'
import type { MarketBoard, SellResult, Station } from '@/lib/types/market'

vi.mock('@/lib/services/market-service', () => ({
  marketService: {
    getBoard: vi.fn(),
    getStation: vi.fn(),
    sell: vi.fn(),
  },
}))

const mockService = vi.mocked(marketService)

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
  worldTime: 1000,
  refreshCadenceMs: 30000,
}

const station: Station = {
  systemId: 'sys-1',
  orbit: { ring: 6, angle0: 3, period: 60000, dir: 1 },
  featureId: 'feat-station',
  createdAt: 1000,
}

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

describe('useMarketBoard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the board', async () => {
    mockService.getBoard.mockResolvedValue(board)
    const qc = newClient()

    const { result } = renderHook(() => useMarketBoard(), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(board)
  })

  it('does not fetch when disabled', async () => {
    mockService.getBoard.mockResolvedValue(board)
    const qc = newClient()

    renderHook(() => useMarketBoard(false), { wrapper: wrapper(qc) })

    expect(mockService.getBoard).not.toHaveBeenCalled()
  })
})

describe('useStation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads one system station', async () => {
    mockService.getStation.mockResolvedValue(station)
    const qc = newClient()

    const { result } = renderHook(() => useStation('sys-1'), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockService.getStation).toHaveBeenCalledWith('sys-1')
  })

  it('stays idle with no system selected', () => {
    const qc = newClient()
    renderHook(() => useStation(null), { wrapper: wrapper(qc) })
    expect(mockService.getStation).not.toHaveBeenCalled()
  })

  it('does not retry a 404 — an unstationed system is an ordinary answer', async () => {
    mockService.getStation.mockRejectedValue(new Error('not found'))
    const qc = newClient()

    const { result } = renderHook(() => useStation('sys-2'), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockService.getStation).toHaveBeenCalledTimes(1)
  })
})

describe('useSell', () => {
  beforeEach(() => vi.clearAllMocks())

  const settled: SellResult = {
    fills: [{ source: 'request', unitPrice: 140, tons: 10, proceeds: 1400, requestId: 'req-1' }],
    totalProceeds: 1400,
    cargo: { metals: 30 },
    balance: 2400,
    worldTime: 1000,
  }

  it('invalidates every read the sale moved', async () => {
    mockService.sell.mockResolvedValue(settled)
    const qc = newClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useSell('sys-1'), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.mutateAsync({
        fleetId: 'fleet_1',
        request: {
          featureId: 'feat-station',
          kind: 'metals',
          tons: 10,
          operationKey: 'abcdefghijklmnop',
        },
      })
    })

    const invalidated = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))
    // The hold shrank, the balance grew, and the request it filled has less
    // remaining — all three reads are now stale.
    expect(invalidated).toContain(JSON.stringify(queryKeys.fleets.inSystem('sys-1')))
    expect(invalidated).toContain(JSON.stringify(queryKeys.fleets.detail('fleet_1')))
    expect(invalidated).toContain(JSON.stringify(queryKeys.market.board()))
    expect(invalidated).toContain(JSON.stringify(queryKeys.corporations.me()))
  })

  it('surfaces the server rejection reason for the component to map', async () => {
    mockService.sell.mockRejectedValue(new Error('market: price changed since your quote'))
    const qc = newClient()

    const { result } = renderHook(() => useSell('sys-1'), { wrapper: wrapper(qc) })

    await act(async () => {
      try {
        await result.current.mutateAsync({
          fleetId: 'fleet_1',
          request: {
            featureId: 'feat-station',
            kind: 'metals',
            tons: 10,
            operationKey: 'abcdefghijklmnop',
          },
        })
      } catch {
        // expected
      }
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    // The hook does NOT toast — components own user feedback — so the reason has
    // to reach the caller intact.
    expect(result.current.error?.message).toContain('price changed')
  })
})

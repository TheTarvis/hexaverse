import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFleetsInSystem, useFleetOrders, useScan } from './use-fleets'
import { fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { Fleet } from '@/lib/types/fleet'

vi.mock('@/lib/services', () => ({
  fleetService: {
    listInSystem: vi.fn(),
    order: vi.fn(),
    cancel: vi.fn(),
    scan: vi.fn(),
  },
}))

const mockService = vi.mocked(fleetService)

const fleet: Fleet = {
  id: 'fleet_1',
  corporationId: 'corp-user1',
  systemId: 'sys-7',
  state: { mode: 'coast' },
  position: { q: 3, r: 0 },
  own: true,
  worldTime: 0,
}

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestWrapper'
  return Wrapper
}

describe('useFleetsInSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockService.listInSystem.mockResolvedValue([fleet])
  })

  it('reads the fogged fleet layer for the given system', async () => {
    const { result } = renderHook(() => useFleetsInSystem('sys-7'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.listInSystem).toHaveBeenCalledWith('sys-7')
    expect(result.current.data).toEqual([fleet])
  })

  it('stays disabled until a systemId is known', async () => {
    const { result } = renderHook(() => useFleetsInSystem(''), { wrapper: createWrapper() })

    await Promise.resolve()
    expect(mockService.listInSystem).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useFleetOrders / useScan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockService.order.mockResolvedValue(fleet)
    mockService.cancel.mockResolvedValue(fleet)
    mockService.scan.mockResolvedValue(fleet)
  })

  // A shared client so we can assert the verb invalidated the board reads.
  function orderWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    Wrapper.displayName = 'OrderWrapper'
    return { Wrapper, invalidate }
  }

  it('orders a burn and invalidates the fleet + interior reads', async () => {
    const { Wrapper, invalidate } = orderWrapper()
    const { result } = renderHook(() => useFleetOrders('sys-7'), { wrapper: Wrapper })

    await act(async () => {
      await result.current.order.mutateAsync({ fleetId: 'fleet_1', target: { hex: { q: 2, r: 0 } } })
    })

    expect(mockService.order).toHaveBeenCalledWith('fleet_1', { hex: { q: 2, r: 0 } })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.fleets.inSystem('sys-7') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.systemBoard.detail('sys-7') })
  })

  it('scans a fleet and invalidates the board + running-scan indicator', async () => {
    const { Wrapper, invalidate } = orderWrapper()
    const { result } = renderHook(() => useScan('sys-7'), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync('fleet_1')
    })

    expect(mockService.scan).toHaveBeenCalledWith('fleet_1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.systemBoard.detail('sys-7') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.actions.running('fleet_1') })
  })
})

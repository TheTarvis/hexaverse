import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRunningScan } from './use-actions'
import { actionService } from '@/lib/services'
import type { GameAction } from '@/lib/types/action'

vi.mock('@/lib/services', () => ({
  actionService: {
    listRunning: vi.fn(),
  },
}))

const mockService = vi.mocked(actionService)

const runningScan: GameAction = {
  id: 'action_scan',
  type: 'scan',
  actor: 'fleet_1',
  scope: 'sys-7',
  params: { systemId: 'sys-7', target: { q: 2, r: 0 } },
  committedAt: 0,
  eta: 30_000,
  status: 'running',
  worldTime: 1_000,
}

const runningBurn: GameAction = {
  ...runningScan,
  id: 'action_burn',
  type: 'burn',
  params: undefined,
}

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestWrapper'
  return Wrapper
}

describe('useRunningScan', () => {
  beforeEach(() => vi.clearAllMocks())

  it('picks the running SCAN out of the actor’s inbox (a burn beside it is ignored)', async () => {
    mockService.listRunning.mockResolvedValue([runningBurn, runningScan])

    const { result } = renderHook(() => useRunningScan('fleet_1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.listRunning).toHaveBeenCalledWith('fleet_1')
    expect(result.current.data).toEqual(runningScan)
  })

  it('resolves null when nothing is scanning', async () => {
    mockService.listRunning.mockResolvedValue([runningBurn])

    const { result } = renderHook(() => useRunningScan('fleet_1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeNull()
  })

  it('stays disabled until a fleet is in hand', async () => {
    const { result } = renderHook(() => useRunningScan(null), { wrapper: createWrapper() })

    await Promise.resolve()
    expect(mockService.listRunning).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSystemBoard } from './use-system-board'
import { systemService } from '@/lib/services'
import type { SystemBoard } from '@/lib/types/system-board'

vi.mock('@/lib/services', () => ({
  systemService: {
    getSystemBoard: vi.fn(),
  },
}))

const mockService = vi.mocked(systemService)

function boardFixture(systemId: string): SystemBoard {
  return {
    systemId,
    radius: 16,
    character: 'star_rich',
    starClass: 'G',
    worldTime: 0,
    features: [],
  }
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestWrapper'
  return Wrapper
}

describe('useSystemBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockService.getSystemBoard.mockResolvedValue(boardFixture('sys-7'))
  })

  it('reads the fogged interior for the given system', async () => {
    const { result } = renderHook(() => useSystemBoard('sys-7'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.getSystemBoard).toHaveBeenCalledWith('sys-7')
    expect(result.current.data?.systemId).toBe('sys-7')
  })

  it('stays disabled (fires no read) until a systemId is known', async () => {
    const { result } = renderHook(() => useSystemBoard(''), { wrapper: createWrapper() })

    await Promise.resolve()
    expect(mockService.getSystemBoard).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('respects an explicit enabled:false override', async () => {
    const { result } = renderHook(() => useSystemBoard('sys-7', { enabled: false }), {
      wrapper: createWrapper(),
    })

    await Promise.resolve()
    expect(mockService.getSystemBoard).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

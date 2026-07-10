import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useGalaxy } from './use-galaxy'
import { galaxyService } from '@/lib/services'
import { useAccountContext } from '@/components/account-provider'
import type { Galaxy } from '@/lib/types/galaxy'

vi.mock('@/lib/services', () => ({
  galaxyService: {
    getGalaxy: vi.fn(),
    getStartArea: vi.fn(),
  },
}))

vi.mock('@/components/account-provider', () => ({
  useAccountContext: vi.fn(),
}))

const mockService = vi.mocked(galaxyService)
const mockAccount = vi.mocked(useAccountContext)

function galaxyFixture(id: string): Galaxy {
  return {
    id,
    seed: 1,
    bounds: { x: [-1, 1], y: [-1, 1], z: [-1, 1] },
    worldTime: 0,
    nodes: [],
    links: [],
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

function setAuth(state: Partial<ReturnType<typeof useAccountContext>>) {
  mockAccount.mockReturnValue({
    user: null,
    authLoading: false,
    ...state,
  } as ReturnType<typeof useAccountContext>)
}

describe('useGalaxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockService.getGalaxy.mockResolvedValue(galaxyFixture('live'))
    mockService.getStartArea.mockResolvedValue(galaxyFixture('start-area'))
  })

  it('serves the frozen start area when logged out', async () => {
    setAuth({ user: null })

    const { result } = renderHook(() => useGalaxy(), { wrapper: createWrapper() })

    expect(result.current.isStartArea).toBe(true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.getStartArea).toHaveBeenCalledTimes(1)
    expect(mockService.getGalaxy).not.toHaveBeenCalled()
    expect(result.current.data?.id).toBe('start-area')
  })

  it('serves the live galaxy when authed', async () => {
    setAuth({ user: { uid: 'u1' } as ReturnType<typeof useAccountContext>['user'] })

    const { result } = renderHook(() => useGalaxy(), { wrapper: createWrapper() })

    expect(result.current.isStartArea).toBe(false)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockService.getGalaxy).toHaveBeenCalledTimes(1)
    expect(mockService.getStartArea).not.toHaveBeenCalled()
    expect(result.current.data?.id).toBe('live')
  })

  it('holds the query disabled while auth is still resolving', async () => {
    setAuth({ user: null, authLoading: true })

    const { result } = renderHook(() => useGalaxy(), { wrapper: createWrapper() })

    // Give React Query a beat; nothing should fire while auth is unresolved.
    await Promise.resolve()
    expect(mockService.getGalaxy).not.toHaveBeenCalled()
    expect(mockService.getStartArea).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

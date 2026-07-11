import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WakeUpFlow } from './wake-up-flow'
import { corporationService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'

vi.mock('@/lib/services', () => ({
  corporationService: { spawn: vi.fn() },
}))

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockSpawn = vi.mocked(corporationService.spawn)

const spawnResult = {
  corporation: { id: 'corp_1', accountId: 'account-1', name: 'Bob', createdAt: 1000 },
  fleet: {
    id: 'fleet_1',
    corporationId: 'corp_1',
    systemId: 'sys-9',
    state: { mode: 'coast' as const },
    position: { q: 15, r: 0 },
    own: true,
    worldTime: 1000,
  },
  homeSystem: {
    id: 'sys-9',
    name: 'Kepler',
    region: 'normal' as const,
    coords: { x: 1, y: 2, z: 0 },
    skeleton: { starClass: 'G', bodies: [] },
  },
  worldTime: 1000,
}

const renderWithClient = () => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <WakeUpFlow />
    </QueryClientProvider>,
  )
  return { invalidate }
}

describe('WakeUpFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('disables Wake until a name is entered', () => {
    renderWithClient()
    const submit = screen.getByTestId('wake-submit')
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: 'Bob' } })
    expect(submit).not.toBeDisabled()
  })

  it('spawns with the trimmed name and invalidates the corp + fleet queries', async () => {
    mockSpawn.mockResolvedValue(spawnResult)
    const { invalidate } = renderWithClient()

    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: '  Bob  ' } })
    fireEvent.click(screen.getByTestId('wake-submit'))

    await waitFor(() => expect(mockSpawn).toHaveBeenCalledWith({ name: 'Bob' }))
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.corporations.me() }),
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.fleets.all })
    expect(sessionStorage.getItem('wakeFocus')).toBe('sys-9')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WakeUpFlow } from './wake-up-flow'
import { corporationService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import type { SpawnResult } from '@/lib/types/corporation'
import { SHIP_MODE_PARKED } from '@/lib/types/fleet'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushSpy }) }))

vi.mock('@/lib/services', () => ({
  corporationService: { spawn: vi.fn() },
}))

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockSpawn = vi.mocked(corporationService.spawn)

const spawnResult = {
  corporation: { id: 'corp_1', accountId: 'account-1', name: 'Bob', createdAt: 1000, credits: 0 },
  fleet: {
    id: 'fleet_1',
    corporationId: 'corp_1',
    systemId: 'sys-9',
    state: {
      Mode: SHIP_MODE_PARKED,
      Burn: null,
      Park: {
        Kind: 0,
        BodyId: '',
        Radius: 0,
        PeriodMs: 0,
        Phase: 0,
        EpochMs: 0,
        Offset: { X: 0, Y: 0, Z: 0 },
        Point: { X: 0, Y: 0, Z: 0 },
      },
      Drift: null,
    },
    position: { X: 15, Y: 0, Z: 0 },
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
    mockSpawn.mockReset()
    sessionStorage.clear()
  })

  it('disables Wake until a name is entered', () => {
    renderWithClient()
    const submit = screen.getByTestId('wake-submit')
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: 'Bob' } })
    expect(submit).not.toBeDisabled()
  })

  it('Scenario: The name field is focused on mount', () => {
    renderWithClient()
    expect(screen.getByTestId('wake-name-input')).toHaveFocus()
  })

  it('Scenario: A spawn failure leaves the flow visible with an error shown', async () => {
    mockSpawn.mockRejectedValue(new Error('The hull failed to boot.'))
    renderWithClient()

    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByTestId('wake-submit'))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByTestId('wake-up-flow')).toBeInTheDocument()
    expect(screen.getByTestId('wake-submit')).not.toBeDisabled()
  })

  it('Scenario: A failed spawn preserves the entered name', async () => {
    mockSpawn.mockRejectedValue(new Error('The hull failed to boot.'))
    renderWithClient()

    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByTestId('wake-submit'))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByTestId('wake-name-input')).toHaveValue('Bob')
  })

  it('spawns, invalidates the corp + fleet queries, and routes to the home board', async () => {
    mockSpawn.mockResolvedValue(spawnResult)
    const { invalidate } = renderWithClient()

    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: '  Bob  ' } })
    fireEvent.click(screen.getByTestId('wake-submit'))

    await waitFor(() => expect(mockSpawn).toHaveBeenCalledWith({ name: 'Bob' }))
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.corporations.me() }),
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.fleets.all })
    // The new player is dropped straight onto their home system's hex board.
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/systems/sys-9'))
    expect(sessionStorage.getItem('wakeFocus')).toBe('sys-9')
  })

  it('Scenario: A malformed success response does not leave the flow silently stuck', async () => {
    // The response omits homeSystem.id (a transient backend hiccup) — the
    // corp/fleet cache invalidation and the wakeFocus write must be withheld,
    // and the flow must show a retriable error while remaining mounted.
    mockSpawn.mockResolvedValueOnce({
      ...spawnResult,
      homeSystem: undefined,
    } as unknown as SpawnResult)
    const { invalidate } = renderWithClient()

    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByTestId('wake-submit'))

    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())

    // The gate must NOT flip on this response: no corp/fleet invalidation, no
    // wake-focus hint, no navigation.
    expect(invalidate).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('wakeFocus')).toBeNull()
    expect(pushSpy).not.toHaveBeenCalled()

    // The flow stays mounted, the entered name is preserved, and it is
    // resubmittable (not stuck in a pending state).
    expect(screen.getByTestId('wake-up-flow')).toBeInTheDocument()
    expect(screen.getByTestId('wake-name-input')).toHaveValue('Bob')
    expect(screen.getByTestId('wake-submit')).not.toBeDisabled()
  })

  it('Scenario: A resubmission after a transient malformed response succeeds normally', async () => {
    mockSpawn
      .mockResolvedValueOnce({ ...spawnResult, homeSystem: undefined } as unknown as SpawnResult)
      .mockResolvedValueOnce(spawnResult)
    const { invalidate } = renderWithClient()

    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByTestId('wake-submit'))
    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())

    // Resubmit — corporation-spawn's idempotent-spawn guarantee returns the
    // same corporation and home system this time (well-formed).
    fireEvent.click(screen.getByTestId('wake-submit'))
    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2))

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/systems/sys-9'))
    expect(sessionStorage.getItem('wakeFocus')).toBe('sys-9')
    // Exactly the second (well-formed) submission's two invalidations — the
    // first, malformed submission must not have invalidated anything.
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('Scenario: Submit disables again once a spawn request is in flight (SDET: submit + input pending-state parity)', async () => {
    let resolveSpawn: (value: SpawnResult) => void = () => {}
    mockSpawn.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSpawn = resolve
        })
    )
    renderWithClient()

    fireEvent.change(screen.getByTestId('wake-name-input'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByTestId('wake-submit'))

    await waitFor(() => expect(screen.getByTestId('wake-submit')).toBeDisabled())
    expect(screen.getByTestId('wake-name-input')).toBeDisabled()

    resolveSpawn(spawnResult)

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/systems/sys-9'))
  })
})

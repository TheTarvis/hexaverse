import { createElement, useState, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommandGuide } from './use-command-guide'
import { newGuide, saveGuide } from '@/lib/command-onboarding'
import { actionService } from '@/lib/services/action-service'

vi.mock('@/lib/services/action-service', () => ({ actionService: { get: vi.fn() } }))
function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Global test setup supplies no-op storage spies; give this suite real persistence semantics.
  const values = new Map<string, string>()
  vi.mocked(localStorage.getItem).mockImplementation(key => values.get(key) ?? null)
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => { values.set(key, value) })
})
describe('corporation-scoped guide', () => {
  it('observes same-window saves, restores progress, and does not enroll other corporations', async () => {
    const { result, rerender } = renderHook(({ id }) => useCommandGuide(id, [], false), { initialProps: { id: 'corp' }, wrapper: Wrapper })
    expect(result.current.guide).toBeNull()
    act(() => saveGuide(newGuide('corp', 'fleet', 'home')))
    await waitFor(() => expect(result.current.guide?.fleetId).toBe('fleet'))
    rerender({ id: 'other' })
    expect(result.current.guide).toBeNull()
    rerender({ id: 'corp' })
    expect(result.current.guide?.phase).toBe('wake')
    expect(actionService.get).not.toHaveBeenCalled()
  })
  it('continues in memory when browser storage is blocked', async () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('blocked') })
    vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => useCommandGuide('storage-blocked', [], false), { wrapper: Wrapper })
    act(() => saveGuide(newGuide('storage-blocked', 'fleet', 'home')))
    await waitFor(() => expect(result.current.guide?.phase).toBe('wake'))
    act(() => saveGuide({ ...result.current.guide!, phase: 'dismissed' }))
    expect(result.current.guide?.phase).toBe('dismissed')
  })

  it('queries only the recorded mining action while awaiting completion', async () => {
    saveGuide({ ...newGuide('corp', 'fleet', 'home'), phase: 'extraction', targetId: 'planet', acceptedAt: 1, mineActionId: 'accepted-mine', resource: 'water', cargoBefore: 0 })
    vi.mocked(actionService.get).mockResolvedValue({ id: 'accepted-mine', status: 'running' } as never)
    const { result } = renderHook(() => useCommandGuide('corp', [], false), { wrapper: Wrapper })
    await waitFor(() => expect(actionService.get).toHaveBeenCalledWith('accepted-mine'))
    expect(result.current.guide?.phase).toBe('extraction')
  })
})

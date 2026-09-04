// Unit test for `useSightings` (openspec change
// `add-scan-and-sightings-surface`, tasks.md 4.8) — the code-quality
// test-file-coverage validator's own naming convention. Exercises the hook
// mounted against a real TanStack Query client with only the transport
// boundary (`sightingService`) mocked — the shape `use-burn-preview.ts`'s
// own sibling tests use for a server-served read.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSightings } from './use-sightings'
import { sightingService } from '@/lib/services'

vi.mock('@/lib/services', () => ({ sightingService: { list: vi.fn() } }))
const mockList = vi.mocked(sightingService.list)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useSightings', () => {
  it('reads the system-filtered pile when given a systemId', async () => {
    mockList.mockResolvedValue({ sightings: [], nextCursor: '' })
    const { result } = renderHook(() => useSightings('sys-7'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ systemId: 'sys-7' }))
  })

  it('reads the unfiltered corp-wide pile when given no systemId', async () => {
    mockList.mockResolvedValue({ sightings: [], nextCursor: '' })
    const { result } = renderHook(() => useSightings(null), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const call = mockList.mock.calls[0]?.[0]
    expect(call).not.toHaveProperty('systemId')
  })

  it('requests a further page with the SERVED cursor, never a constructed one', async () => {
    mockList
      .mockResolvedValueOnce({ sightings: [{ id: 'a' } as never], nextCursor: 'server-cursor-1' })
      .mockResolvedValueOnce({ sightings: [], nextCursor: '' })
    const { result } = renderHook(() => useSightings(null), { wrapper })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await result.current.fetchNextPage()
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
    expect(mockList.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ cursor: 'server-cursor-1' }))
  })

  it('offers no further page once the server returns an empty cursor', async () => {
    mockList.mockResolvedValue({ sightings: [], nextCursor: '' })
    const { result } = renderHook(() => useSightings(null), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.hasNextPage).toBe(false)
  })
})

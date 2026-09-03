import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { type ReactNode } from 'react'

// Implementer-authored (openspec build-production-space-view, tasks.md 2.2).
// The seam this pins: the space view reads the interior through the service
// layer, under the shared cache key, and issues NO request until a system id
// is known — a bare drill-in route must never fire `/v1/systems/`.

vi.mock('@/lib/services', () => ({ systemService: { getSystemSpace: vi.fn() } }))

import { useSystemSpace } from './use-system-space'
import { systemService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'

const mockGet = vi.mocked(systemService.getSystemSpace)

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const Wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper, qc }
}

const INTERIOR = {
  systemId: 'sys_-7_17',
  extent: 658.7,
  character: 'normal',
  starClass: 'M',
  worldTime: 1,
  scale: 1,
  features: [],
  laneGates: [],
  contacts: [],
}

describe('useSystemSpace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads one system through the service and caches it under the shared key', async () => {
    mockGet.mockResolvedValue(INTERIOR)
    const { Wrapper, qc } = wrapper()
    const { result } = renderHook(() => useSystemSpace('sys_-7_17'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toEqual(INTERIOR))
    expect(mockGet).toHaveBeenCalledWith('sys_-7_17')
    expect(qc.getQueryData(queryKeys.systemBoard.detail('sys_-7_17'))).toEqual(INTERIOR)
  })

  it('issues no request until a system id is known', async () => {
    const { Wrapper } = wrapper()
    renderHook(() => useSystemSpace(''), { wrapper: Wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('surfaces a failed read as an error state rather than throwing', async () => {
    mockGet.mockRejectedValue(new Error('interior read exploded'))
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useSystemSpace('sys_-7_17'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/exploded/)
    expect(result.current.data).toBeUndefined()
  })
})

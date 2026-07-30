import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BOARD_POLL_MS, SCAN_POLL_MS, useBoardRealtime } from './use-board-realtime'

// A controllable EventSource stand-in.
class MockEventSource {
  static last: MockEventSource | null = null
  listeners: Record<string, (() => void)[]> = {}
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    MockEventSource.last = this
  }
  addEventListener(type: string, cb: () => void) {
    ;(this.listeners[type] ??= []).push(cb)
  }
  emit(type: string) {
    for (const cb of this.listeners[type] ?? []) cb()
  }
  close() {
    this.closed = true
  }
}

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('jwt-123') } },
}))

function setup(etaCandidates?: number[], worldTime = 0) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const view = renderHook(
    (props: { etaCandidates?: number[]; worldTime: number }) =>
      useBoardRealtime({ systemId: 'sys-7', ...props }),
    { wrapper, initialProps: { worldTime, ...(etaCandidates ? { etaCandidates } : {}) } },
  )
  return { qc, invalidate, ...view }
}

describe('useBoardRealtime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource
    MockEventSource.last = null
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rule 1: self-schedules a refetch just after the soonest ETA', () => {
    const { invalidate } = setup([10_000], 0)
    invalidate.mockClear()

    vi.advanceTimersByTime(9_000)
    expect(invalidate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000) // past 10_000 + cushion
    expect(invalidate).toHaveBeenCalled()
  })

  it('rule 1: the ETA refetch covers the fleet reads AND the actions inbox', () => {
    // A resolving mine credits cargo (the fleet read) and retires its running
    // entry (the inbox) — one scheduled refetch must land both (add-mine-ui).
    const { invalidate } = setup([10_000], 0)
    invalidate.mockClear()

    vi.advanceTimersByTime(11_000)
    const keys = invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['fleets', 'in-system', 'sys-7'])
    expect(keys).toContainEqual(['actions'])
  })

  it('rule 3: gently polls while the board is open', () => {
    const { invalidate } = setup()
    invalidate.mockClear()

    vi.advanceTimersByTime(BOARD_POLL_MS + 10)
    expect(invalidate).toHaveBeenCalled()
  })

  it('rule 3: tightens the poll while a scan is running — the read cadence IS the echo cadence', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    renderHook(() => useBoardRealtime({ systemId: 'sys-7', worldTime: 0, scanning: true }), {
      wrapper,
    })
    invalidate.mockClear()

    vi.advanceTimersByTime(SCAN_POLL_MS + 10)
    expect(invalidate).toHaveBeenCalled()
  })

  it('rule 2: refetches on an SSE action.completed and on reconnect', async () => {
    vi.useRealTimers() // the connect() promise resolves on the microtask queue
    const { invalidate } = setup()
    // Let the async EventSource connect resolve (getIdToken → new EventSource).
    await new Promise((r) => setTimeout(r, 0))
    const es = MockEventSource.last!
    expect(es).toBeTruthy()
    expect(es.url).toContain('/v1/channels/sys-7/stream?token=jwt-123')

    invalidate.mockClear()
    es.emit('action.completed')
    expect(invalidate).toHaveBeenCalled()

    // A drop then reopen resyncs.
    invalidate.mockClear()
    es.onerror?.()
    es.onopen?.()
    expect(invalidate).toHaveBeenCalled()
  })
})

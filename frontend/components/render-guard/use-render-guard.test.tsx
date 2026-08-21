// use-render-guard.test.tsx — the React binding (design.md, pinned API):
//   useRenderGuard({ canvas, surface, onSuspend?, onResume?, onRetry?, probe?, record? })
//     -> { status, cause, available, retry, reportRenderError }
//
// Tested against a STUB canvas (per design.md's testability note: no real GL
// harness in jsdom) using `probe`/`record` as test seams — this is the
// surface-agnostic module both `BoardCanvas` and the galaxy wiring compose,
// so every scenario here is pinned once for both capabilities.
//
// Covers (both capabilities): Context loss shows an interrupted state
// without an uncaught error; A restored context resumes without navigation;
// A restored context's first frame reflects live state, not a stale one
// (reasoned via onResume's invocation — see report for the pixel-content
// caveat); A context that never restores keeps the interrupted state with a
// retry affordance; Invoking the retry affordance attempts to re-establish
// the context; Retrying releases the prior attempt's resources first; A
// successful retry resumes the live board/galaxy graph; A retry that fails
// again keeps the interrupted state retriable; The retry affordance prevents
// duplicate concurrent attempts; A second context loss while already
// interrupted is a no-op state change; Renderer failures are recorded
// distinguishably by cause; An unexpected rendering error is contained to
// the canvas region (reportRenderError, the boundary's onError target).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useRenderGuard } from './use-render-guard'
import type { ProbeOutcome } from './probe'
import type { RenderFailureRecord } from './record-renderer-failure'

function available(): ProbeOutcome {
  return { supported: true }
}
function unsupported(detail?: string): ProbeOutcome {
  return { supported: false, detail }
}

// A deferred promise the test controls — the async seam `onRetry` needs to
// exercise the in-progress/disabled window (design.md 1.7: the synchronous
// probe-only path resolves immediately; this is the window the galaxy's
// async FG3D remount genuinely occupies).
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useRenderGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('probes on mount; default-available world -> live, cause null, available true', async () => {
    const { result } = renderHook(() => useRenderGuard({ canvas: null, surface: 'board', probe: available }))
    await waitFor(() => expect(result.current.status).toBe('live'))
    expect(result.current.cause).toBeNull()
    expect(result.current.available).toBe(true)
  })

  it('probes on mount; unsupported -> unsupported, cause creation, available false (Scenario: Context creation failure shows a named unsupported state)', async () => {
    const { result } = renderHook(() =>
      useRenderGuard({ canvas: null, surface: 'board', probe: () => unsupported('no webgl2') }),
    )
    await waitFor(() => expect(result.current.status).toBe('unsupported'))
    expect(result.current.cause).toBe('creation')
    expect(result.current.available).toBe(false)
  })

  it('SDET-added: the probe result is already reflected on the very first synchronous render — never an optimistic "live" flash before the probe resolves (probe.ts: a missing context "never mounts the renderer")', () => {
    const { result } = renderHook(() =>
      useRenderGuard({ canvas: null, surface: 'board', probe: () => unsupported() }),
    )
    // No `waitFor`/`act` flush here on purpose — this asserts the state
    // available on the FIRST render, before any effect has had a chance to
    // run. A consumer (BoardCanvas, GalaxyView) reads `guard.status` to
    // decide whether to mount the renderer's children on that very first
    // render; an effect-delayed probe would let them mount for one commit
    // first, which is the exact pre-emption failure probe.ts exists to
    // prevent.
    expect(result.current.status).toBe('unsupported')
  })

  it('canvas=null: no listeners are attached, and the guard still functions from the probe alone (board at ship time, per design.md)', async () => {
    const canvas = document.createElement('canvas')
    const addSpy = vi.spyOn(canvas, 'addEventListener')
    renderHook(() => useRenderGuard({ canvas: null, surface: 'board', probe: available }))
    expect(addSpy).not.toHaveBeenCalled()
  })

  it('loss -> interrupted, cause lost, and dispatching the event does not throw an uncaught error (Scenario: Context loss shows an interrupted state without an uncaught error)', async () => {
    const canvas = document.createElement('canvas')
    const { result } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'board', probe: available }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))

    expect(() => {
      act(() => {
        canvas.dispatchEvent(new Event('webglcontextlost'))
      })
    }).not.toThrow()

    expect(result.current.status).toBe('interrupted')
    expect(result.current.cause).toBe('lost')
  })

  it('restore -> live, cause null, onResume invoked (Scenario: A restored context resumes without navigation / reflects live state)', async () => {
    const canvas = document.createElement('canvas')
    const onResume = vi.fn()
    const { result } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'board', probe: available, onResume }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))

    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
    expect(result.current.status).toBe('interrupted')

    act(() => canvas.dispatchEvent(new Event('webglcontextrestored')))
    expect(result.current.status).toBe('live')
    expect(result.current.cause).toBeNull()
    // onResume is the consumer's "force a redraw from live data" hook — the
    // guard itself exposes no WebGL pixel content to assert against (no
    // interface does); this invocation IS the observable contract.
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('never restored: the interrupted state persists with no auto-recovery (Scenario: A context that never restores keeps the interrupted state with a retry affordance)', async () => {
    const canvas = document.createElement('canvas')
    const { result } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'board', probe: available }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))
    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
    expect(result.current.status).toBe('interrupted')

    // No further event ever arrives — nothing auto-transitions it away.
    expect(result.current.status).toBe('interrupted')
    expect(typeof result.current.retry).toBe('function')
  })

  it('a second loss while already interrupted is a no-op: status unchanged, no duplicate listener registration (Scenario: A second context loss while already interrupted is a no-op state change)', async () => {
    const canvas = document.createElement('canvas')
    const addSpy = vi.spyOn(canvas, 'addEventListener')
    const { result } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'board', probe: available }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))

    const lostRegistrations = () =>
      addSpy.mock.calls.filter((c) => c[0] === 'webglcontextlost').length
    const restoredRegistrations = () =>
      addSpy.mock.calls.filter((c) => c[0] === 'webglcontextrestored').length

    expect(lostRegistrations()).toBe(1)
    expect(restoredRegistrations()).toBe(1)

    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
    expect(result.current.status).toBe('interrupted')
    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
    expect(result.current.status).toBe('interrupted')

    // Receiving events never re-registers listeners.
    expect(lostRegistrations()).toBe(1)
    expect(restoredRegistrations()).toBe(1)
  })

  it('removes listeners on unmount', async () => {
    const canvas = document.createElement('canvas')
    const removeSpy = vi.spyOn(canvas, 'removeEventListener')
    const { result, unmount } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'board', probe: available }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))
    unmount()
    expect(removeSpy.mock.calls.some((c) => c[0] === 'webglcontextlost')).toBe(true)
    expect(removeSpy.mock.calls.some((c) => c[0] === 'webglcontextrestored')).toBe(true)
  })

  it('removes the old canvas listeners and attaches to the new one on a canvas identity change', async () => {
    const canvasA = document.createElement('canvas')
    const canvasB = document.createElement('canvas')
    const removeSpyA = vi.spyOn(canvasA, 'removeEventListener')
    const addSpyB = vi.spyOn(canvasB, 'addEventListener')

    const { result, rerender } = renderHook(
      ({ canvas }) => useRenderGuard({ canvas, surface: 'board', probe: available }),
      { initialProps: { canvas: canvasA as HTMLCanvasElement | null } },
    )
    await waitFor(() => expect(result.current.status).toBe('live'))

    rerender({ canvas: canvasB })

    expect(removeSpyA.mock.calls.some((c) => c[0] === 'webglcontextlost')).toBe(true)
    expect(addSpyB.mock.calls.some((c) => c[0] === 'webglcontextlost')).toBe(true)
  })

  it('retry disposes before recreate: removeEventListener and onSuspend precede the second probe call (Scenario: Retrying releases the prior attempt\'s resources first)', async () => {
    const canvas = document.createElement('canvas')
    const removeSpy = vi.spyOn(canvas, 'removeEventListener')
    const order: string[] = []
    const onSuspend = vi.fn(() => order.push('onSuspend'))
    const probeCalls: string[] = []
    const probe = vi.fn(() => {
      probeCalls.push('probe')
      order.push('probe')
      return available()
    })
    const { retryPromise, resolve } = (() => {
      const d = deferred<boolean>()
      return { retryPromise: d.promise, resolve: d.resolve }
    })()
    const onRetry = vi.fn(() => {
      order.push('onRetry-start')
      return retryPromise
    })

    const { result } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'galaxy', probe, onSuspend, onRetry }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))
    // The mount probe is call #1 — clear the order/probe logs before retry
    // so the assertions below are scoped to the retry sequence itself.
    order.length = 0
    probeCalls.length = 0

    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
    expect(result.current.status).toBe('interrupted')

    act(() => {
      result.current.retry()
    })

    // onSuspend + listener disposal happen synchronously, before onRetry's
    // promise is even given a chance to resolve.
    expect(onSuspend).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalled()
    expect(order[0]).toBe('onSuspend')
    expect(order).toContain('onRetry-start')
    expect(probeCalls).toHaveLength(0) // not yet — onRetry hasn't resolved

    await act(async () => {
      resolve(true)
      await retryPromise
    })
    await waitFor(() => expect(result.current.status).toBe('live'))
    // dispose-before-recreate: onSuspend/removeListener happened strictly
    // before the re-probe that follows onRetry's resolution.
    expect(order.indexOf('onSuspend')).toBeLessThan(order.indexOf('probe'))
  })

  it('retry re-probes (probe is called again, not memoized) and succeeds when the re-probe now reports available', async () => {
    const canvas = document.createElement('canvas')
    let outcome: ProbeOutcome = unsupported()
    const probe = vi.fn(() => outcome)
    const onResume = vi.fn()

    const { result } = renderHook(() => useRenderGuard({ canvas, surface: 'board', probe, onResume }))
    await waitFor(() => expect(result.current.status).toBe('unsupported'))
    const probeCallsBeforeRetry = probe.mock.calls.length

    // The world recovers (e.g. the player replugs a GPU) before retrying.
    outcome = available()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('live'))

    expect(probe.mock.calls.length).toBeGreaterThan(probeCallsBeforeRetry)
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('a retry whose re-establishment still fails keeps the state retriable (Scenario: A retry that fails again keeps the interrupted state retriable)', async () => {
    const canvas = document.createElement('canvas')
    const probe = vi.fn(() => unsupported('still broken'))
    const { result } = renderHook(() => useRenderGuard({ canvas, surface: 'board', probe }))
    await waitFor(() => expect(result.current.status).toBe('unsupported'))

    act(() => result.current.retry())
    await waitFor(() => expect(probe.mock.calls.length).toBeGreaterThan(1))

    expect(result.current.status).toBe('unsupported')
    expect(result.current.cause).toBe('creation')
    // Retriable again — calling retry a second time is not a no-op once the
    // first attempt has resolved.
    act(() => result.current.retry())
    await waitFor(() => expect(probe.mock.calls.length).toBeGreaterThan(2))
  })

  it('prevents duplicate concurrent attempts: a second retry() call while retrying starts no further attempt (Scenario: The retry affordance prevents duplicate concurrent attempts)', async () => {
    const canvas = document.createElement('canvas')
    const d = deferred<boolean>()
    const onRetry = vi.fn(() => d.promise)
    const { result } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'galaxy', probe: available, onRetry }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))
    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))

    act(() => result.current.retry())
    expect(result.current.status).toBe('retrying')
    act(() => result.current.retry()) // any invocation while disabled...
    act(() => result.current.retry()) // ...starts no further attempt.

    expect(onRetry).toHaveBeenCalledTimes(1)

    await act(async () => {
      d.resolve(true)
      await d.promise
    })
  })

  it('an onRetry rejection is caught locally: no unhandled rejection, and the guard still resolves to a stable, retriable state', async () => {
    const canvas = document.createElement('canvas')
    const onRetry = vi.fn(() => Promise.reject(new Error('remount boom')))
    const record = vi.fn()
    const { result } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'galaxy', probe: available, onRetry, record }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))
    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))

    await act(async () => {
      result.current.retry()
      // let the rejected promise's microtask settle
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.status).not.toBe('retrying'))
    expect(['interrupted', 'unsupported']).toContain(result.current.status)
    expect(record).toHaveBeenCalled()
  })

  it('a throwing onSuspend during retry does not crash the retry sequence', async () => {
    const canvas = document.createElement('canvas')
    const onSuspend = vi.fn(() => {
      throw new Error('suspend boom')
    })
    const { result } = renderHook(() =>
      useRenderGuard({ canvas, surface: 'board', probe: available, onSuspend }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))
    act(() => canvas.dispatchEvent(new Event('webglcontextlost')))

    expect(() => {
      act(() => result.current.retry())
    }).not.toThrow()
  })

  describe('recorded-by-cause, and a throwing sink never blocks a state transition (Scenario: Renderer failures are recorded distinguishably by cause)', () => {
    it('records a creation failure', async () => {
      const calls: RenderFailureRecord[] = []
      const record = vi.fn((r: RenderFailureRecord) => {
        calls.push(r)
        throw new Error('sink boom') // SDET-added: a throwing sink
      })
      const { result } = renderHook(() =>
        useRenderGuard({ canvas: null, surface: 'board', probe: () => unsupported('boom'), record }),
      )
      await waitFor(() => expect(result.current.status).toBe('unsupported'))
      expect(calls).toContainEqual(
        expect.objectContaining({ surface: 'board', cause: 'creation' }),
      )
    })

    it('records a context loss, distinct from creation', async () => {
      const canvas = document.createElement('canvas')
      const calls: RenderFailureRecord[] = []
      const record = vi.fn((r: RenderFailureRecord) => {
        calls.push(r)
        throw new Error('sink boom')
      })
      const { result } = renderHook(() =>
        useRenderGuard({ canvas, surface: 'galaxy', probe: available, record }),
      )
      await waitFor(() => expect(result.current.status).toBe('live'))

      expect(() => {
        act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
      }).not.toThrow()

      expect(result.current.status).toBe('interrupted')
      expect(calls).toContainEqual(expect.objectContaining({ surface: 'galaxy', cause: 'lost' }))
    })

    it('records a restore failure — an error thrown re-establishing rendering after webglcontextrestored fires — and the notice-driving status still updates despite the throwing sink', async () => {
      const canvas = document.createElement('canvas')
      const calls: RenderFailureRecord[] = []
      const record = vi.fn((r: RenderFailureRecord) => {
        calls.push(r)
        throw new Error('sink boom')
      })
      const onResume = vi.fn(() => {
        throw new Error('redraw boom')
      })
      const { result } = renderHook(() =>
        useRenderGuard({ canvas, surface: 'board', probe: available, onResume, record }),
      )
      await waitFor(() => expect(result.current.status).toBe('live'))
      act(() => canvas.dispatchEvent(new Event('webglcontextlost')))
      expect(result.current.status).toBe('interrupted')

      expect(() => {
        act(() => canvas.dispatchEvent(new Event('webglcontextrestored')))
      }).not.toThrow()

      // The throwing sink never prevented the state from updating — a
      // consumer rendering RendererStateNotice off `status`/`cause` still
      // sees the transition.
      expect(calls).toContainEqual(
        expect.objectContaining({ surface: 'board', cause: 'restore-failed' }),
      )
      expect(['unsupported', 'interrupted']).toContain(result.current.status)
    })
  })

  describe('reportRenderError — the boundary\'s onError target (Scenario: An unexpected rendering error is contained to the canvas region)', () => {
    it('defaults to an unsupported-producing cause when none is given (a render/commit-phase throw, not a loss)', async () => {
      const { result } = renderHook(() =>
        useRenderGuard({ canvas: null, surface: 'board', probe: available }),
      )
      await waitFor(() => expect(result.current.status).toBe('live'))

      act(() => result.current.reportRenderError(new Error('boundary caught this')))

      expect(result.current.status).toBe('unsupported')
    })

    it('honours an explicit cause of "lost" (interrupted, not unsupported)', async () => {
      const { result } = renderHook(() =>
        useRenderGuard({ canvas: null, surface: 'board', probe: available }),
      )
      await waitFor(() => expect(result.current.status).toBe('live'))

      act(() => result.current.reportRenderError(new Error('lost mid-flight'), 'lost'))

      expect(result.current.status).toBe('interrupted')
    })

    it('records the reported error and never throws back at the caller', async () => {
      const record = vi.fn()
      const { result } = renderHook(() =>
        useRenderGuard({ canvas: null, surface: 'galaxy', probe: available, record }),
      )
      await waitFor(() => expect(result.current.status).toBe('live'))

      expect(() => {
        act(() => result.current.reportRenderError(new Error('boom')))
      }).not.toThrow()
      expect(record).toHaveBeenCalled()
    })
  })
})

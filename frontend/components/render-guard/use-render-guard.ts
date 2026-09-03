'use client'

// use-render-guard.ts — the React binding for the shared render-context
// guard (design.md, "the shared guard module's public API"). Owns:
//   - the mount-time (and retry-time) probe
//   - webglcontextlost/webglcontextrestored listener lifecycle on `canvas`
//   - the retry sequence: dispose -> onSuspend -> await onRetry -> re-probe
//     -> retrySucceeded+onResume | retryFailed
//   - converting every listener/retry throw into a guard transition plus a
//     recorded-by-cause entry, never letting one escape as an uncaught error
//
// Placement: this hook lives in the render-guard module, not
// `frontend/hooks/` — that directory is the React Query domain layer; this
// is a component-local DOM binding (design.md, "Placement note").

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { probeWebgl2, type ProbeOutcome } from './probe'
import { reduceGuard, type GuardState, type GuardStatus, type FailureCause } from './guard-machine'
import { recordRendererFailure, type RecordFn } from './record-renderer-failure'

export interface RenderGuardOptions {
  canvas: HTMLCanvasElement | null
  // 'space' is the continuous-space system view (openspec
  // build-production-space-view). It is its own surface identity, never
  // 'board': reusing the retired view's name would mis-attribute every
  // recorded renderer failure to a view that no longer exists.
  surface: 'board' | 'galaxy' | 'space'
  onSuspend?: () => void
  onResume?: () => void
  onRetry?: () => Promise<boolean>
  probe?: () => ProbeOutcome
  record?: RecordFn
}

export interface RenderGuard {
  status: GuardStatus
  cause: FailureCause | null
  available: boolean
  retry: () => void
  reportRenderError: (error: unknown, cause?: FailureCause) => void
}

function errorDetail(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

export function useRenderGuard(options: RenderGuardOptions): RenderGuard {
  const { canvas } = options

  // Always-latest option values, so listener callbacks registered once (on
  // canvas mount) and the retry sequence never operate on a stale closure
  // even though the consumer may pass new inline props across renders.
  const optionsRef = useRef(options)
  optionsRef.current = options

  // The browser diagnostic (probe.ts's `detail`) alongside the machine's
  // `cause` — GuardState deliberately doesn't carry it (design.md pins
  // GuardState as `{ status, cause }` only). Recorded, never displayed.
  const detailRef = useRef<string | undefined>(undefined)

  const [state, dispatch] = useReducer(reduceGuard, undefined, (): GuardState => {
    // Probed synchronously, in the reducer's lazy initializer, so the
    // outcome is already reflected on the very first render — no
    // optimistic "live" flash before an effect gets a chance to run
    // (probe.ts: a missing context "never mounts the renderer").
    const probeFn = optionsRef.current.probe ?? probeWebgl2
    const outcome = probeFn()
    if (outcome.supported) return { status: 'live', cause: null }
    detailRef.current = outcome.detail
    return { status: 'unsupported', cause: 'creation' }
  })

  const retryInFlightRef = useRef(false)

  const recordSafely = useCallback((cause: FailureCause, detail?: string) => {
    const recordFn = optionsRef.current.record ?? recordRendererFailure
    try {
      recordFn({ surface: optionsRef.current.surface, cause, detail })
    } catch {
      // The default recorder never throws, but a consumer-supplied `record`
      // test seam might — recording must never block the state transition
      // it accompanies (design.md task 1.9).
    }
  }, [])

  const reportRenderError = useCallback(
    (error: unknown, cause?: FailureCause) => {
      const resolvedCause: FailureCause = cause ?? 'creation'
      recordSafely(resolvedCause, errorDetail(error))
      dispatch({ type: 'renderError', cause: resolvedCause })
    },
    [recordSafely],
  )

  // Report the outcome of the mount-time probe (already computed above)
  // exactly once, as a side effect rather than during render.
  const recordedInitialRef = useRef(false)
  useEffect(() => {
    if (recordedInitialRef.current) return
    recordedInitialRef.current = true
    if (state.status === 'unsupported' && state.cause === 'creation') {
      recordSafely('creation', detailRef.current)
    }
  }, [state.status, state.cause, recordSafely])

  // --- loss/restore listeners --------------------------------------------
  //
  // The stable wrapper identities below (`onLost`/`onRestored`) are what
  // let this effect register exactly once per canvas identity while still
  // dispatching through whatever the CURRENT render's logic requires — the
  // indirection through `*Ref.current` is what makes that possible without
  // re-registering listeners on every render.
  const handleLostRef = useRef<(event: Event) => void>(() => {})
  const handleRestoredRef = useRef<(event: Event) => void>(() => {})

  handleLostRef.current = () => {
    try {
      dispatch({ type: 'contextLost' })
      recordSafely('lost')
    } catch (err) {
      // Never let a throw inside this listener body escape uncaught — it is
      // outside React's lifecycle and no boundary at any placement can
      // reach it (design.md task 1.3).
      recordSafely('lost', errorDetail(err))
      dispatch({ type: 'renderError', cause: 'lost' })
    }
  }

  handleRestoredRef.current = () => {
    dispatch({ type: 'contextRestored' })
    try {
      // The guard does not own the redraw — it exposes the restore event so
      // the consumer can force one from live data (design.md task 1.6).
      optionsRef.current.onResume?.()
    } catch (err) {
      recordSafely('restore-failed', errorDetail(err))
      dispatch({ type: 'renderError', cause: 'restore-failed' })
    }
  }

  const onLost = useCallback((event: Event) => handleLostRef.current(event), [])
  const onRestored = useCallback((event: Event) => handleRestoredRef.current(event), [])

  useEffect(() => {
    if (!canvas) return
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [canvas, onLost, onRestored])

  // --- retry ---------------------------------------------------------------
  const retry = useCallback(() => {
    if (retryInFlightRef.current) return
    if (state.status !== 'unsupported' && state.status !== 'interrupted') return

    const preRetryCause: FailureCause = state.cause ?? 'creation'
    retryInFlightRef.current = true
    dispatch({ type: 'retryStarted' })

    // Detach this hook's own listeners BEFORE recreating — actual GL
    // disposal (renderer.dispose()/forceContextLoss()) is the consumer's
    // job, done in its unmount cleanup, not here (design.md task 1.7a).
    if (canvas) {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
    try {
      optionsRef.current.onSuspend?.()
    } catch {
      // A throwing onSuspend must not crash the retry sequence.
    }

    const reattachListeners = () => {
      if (!canvas) return
      canvas.addEventListener('webglcontextlost', onLost)
      canvas.addEventListener('webglcontextrestored', onRestored)
    }

    const attempt = async () => {
      try {
        const onRetryFn = optionsRef.current.onRetry
        if (onRetryFn) {
          try {
            await onRetryFn()
          } catch (err) {
            // An onRetry rejection short-circuits straight to the failed
            // state, preserving the pre-retry cause, WITHOUT a re-probe
            // (adjudicated retry semantics).
            recordSafely(preRetryCause, errorDetail(err))
            dispatch({ type: 'retryFailed' })
            return
          }
        }

        // Retry always re-probes after onRetry resolves — the re-probe's
        // outcome, not onRetry's return value alone, determines success.
        const probeFn = optionsRef.current.probe ?? probeWebgl2
        const outcome = probeFn()
        if (outcome.supported) {
          detailRef.current = undefined
          dispatch({ type: 'retrySucceeded' })
          try {
            optionsRef.current.onResume?.()
          } catch (err) {
            recordSafely('restore-failed', errorDetail(err))
            dispatch({ type: 'renderError', cause: 'restore-failed' })
          }
        } else {
          detailRef.current = outcome.detail
          recordSafely(preRetryCause, outcome.detail)
          dispatch({ type: 'retryFailed' })
        }
      } finally {
        reattachListeners()
        retryInFlightRef.current = false
      }
    }

    void attempt()
  }, [canvas, onLost, onRestored, recordSafely, state.cause, state.status])

  return {
    status: state.status,
    cause: state.cause,
    available: state.status === 'live',
    retry,
    reportRenderError,
  }
}

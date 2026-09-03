'use client'

// SpaceCanvas — the space view's guarded canvas region (openspec change
// `build-production-space-view`, `system-space-view`: *Renderer
// Unavailability Is an Explicit State*, *Lost Rendering Context Recovers
// Without Navigation*, *Renderer Unavailability States Are Accessible*).
//
// It REUSES the shared `components/render-guard` module rather than
// rebuilding it: the pre-flight probe decides whether to mount at all,
// `CanvasRegionBoundary` catches a render/commit throw from the guarded
// subtree, and `RendererStateNotice` is the single presentation for both
// the probe-failed and boundary-caught paths. The surface identity is
// `'space'` — reusing `'board'` would mis-attribute every recorded renderer
// failure to the view this change deletes.
//
// UNSUPPORTED AND INTERRUPTED ARE NOT THE SAME ARM. `unsupported` has no
// usable context, so the region is torn down. `interrupted` keeps this SAME
// `<canvas>` mounted and attached — a detached canvas never receives
// `webglcontextrestored` again — but takes the INTERACTIVE layers down with
// it: hit targets and camera controls floating over a dead canvas would be
// selectable marks with nothing drawn under them.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  useRenderGuard,
  CanvasRegionBoundary,
  RendererStateNotice,
  type GuardStatus,
} from '@/components/render-guard'

export interface SpaceCanvasProps {
  /** The interactive layers — rendered only while the context is live. */
  children?: ReactNode
  /** The GL world, mounted against the guarded canvas element once it exists. */
  renderWorld?: (canvas: HTMLCanvasElement) => ReactNode
  onAvailabilityChange?: (available: boolean) => void
  /**
   * True iff focus was inside this region when it went unavailable — drives
   * the notice's focus claim, so focus is never dropped to `document.body`.
   */
  claimFocus?: boolean
}

/** How long the retry waits for the failed context to be released. */
const RETRY_SETTLE_MS = 50

function displayStatus(status: GuardStatus, cause: string | null): 'unsupported' | 'interrupted' {
  if (status === 'interrupted') return 'interrupted'
  if (status === 'retrying' && cause === 'lost') return 'interrupted'
  return 'unsupported'
}

export function SpaceCanvas({
  children,
  renderWorld,
  onAvailabilityChange,
  claimFocus,
}: SpaceCanvasProps) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [attempt, setAttempt] = useState(0)

  // The retry's release beat. The guard detaches its listeners and calls
  // `onSuspend` before this runs and re-probes after it, so the browser gets
  // a real moment to release the failed context rather than being re-probed
  // in the same tick — which is also what makes the attempt observably IN
  // FLIGHT, so the affordance can go disabled and refuse a duplicate
  // concurrent attempt instead of silently swallowing it.
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const releaseAndSettle = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null
          resolve(true)
        }, RETRY_SETTLE_MS)
      }),
    [],
  )
  // An unmount mid-settle drops the attempt rather than resolving it: a
  // re-probe landing after this region is gone would dispatch into a
  // component that no longer exists.
  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    },
    [],
  )

  const guard = useRenderGuard({ canvas, surface: 'space', onRetry: releaseAndSettle })
  const available = guard.status === 'live'

  useEffect(() => {
    onAvailabilityChange?.(available)
  }, [available, onAvailabilityChange])

  const handleRetry = useCallback(() => {
    setAttempt((a) => a + 1)
    guard.retry()
  }, [guard])

  if (guard.status === 'unsupported' || guard.status === 'retrying') {
    return (
      <RendererStateNotice
        status={displayStatus(guard.status, guard.cause)}
        cause={guard.cause}
        surface="space"
        retrying={guard.status === 'retrying'}
        onRetry={handleRetry}
        {...(claimFocus ? { claimFocus } : {})}
      />
    )
  }

  return (
    <div className="absolute inset-0">
      <CanvasRegionBoundary
        key={attempt}
        onError={guard.reportRenderError}
        fallback={
          <RendererStateNotice
            status="unsupported"
            cause={guard.cause}
            surface="space"
            retrying={false}
            onRetry={handleRetry}
          />
        }
      >
        <canvas
          ref={setCanvas}
          data-testid="space-canvas"
          className="absolute inset-0 block h-full w-full"
          style={{ touchAction: 'none' }}
        />
        {canvas && renderWorld?.(canvas)}
        {available && children}
      </CanvasRegionBoundary>
      {guard.status === 'interrupted' && (
        <div className="absolute inset-0 grid place-items-center">
          <RendererStateNotice
            status="interrupted"
            cause={guard.cause}
            surface="space"
            retrying={false}
            onRetry={handleRetry}
            {...(claimFocus ? { claimFocus } : {})}
          />
        </div>
      )}
    </div>
  )
}

export default SpaceCanvas

'use client'

// BoardCanvas.tsx — the board's canvas-region slot (design.md, "at ship time
// the board guard is mounted but its loss/restore listeners have no
// canvas"; tasks.md 2.1). Composes the shared render-guard module
// (`@/components/render-guard`): the pre-flight probe decides whether to
// mount at all, `CanvasRegionBoundary` catches a render/commit throw from
// `children`, and `RendererStateNotice` is the single presentation for both
// the probe-failed and boundary-caught paths (design.md's composition
// snippet).
//
// When live, this renders the `<canvas>` the WebGL renderer attaches to
// (port-board-to-webgl-renderer): `renderWorld` receives the mounted canvas
// element — the SAME node the guard's webglcontextlost/webglcontextrestored
// listeners are bound to — and mounts the GL world against it. This is the
// single point where the port and `add-renderer-availability-states` meet:
// the guard defines this component's contract, the port supplies the world.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  useRenderGuard,
  CanvasRegionBoundary,
  RendererStateNotice,
  type GuardStatus,
} from '@/components/render-guard'

export interface BoardCanvasProps {
  children?: ReactNode
  // The GL world, mounted against the guarded canvas element once it exists.
  // Only rendered while the guard reports a live (or restorably interrupted)
  // context — the unsupported state replaces the canvas region entirely.
  renderWorld?: (canvas: HTMLCanvasElement) => ReactNode
  // Reports the guard's live/not-live state to the consumer — the port
  // wires this to FactsPanel's `available` prop and the scan-fx-toggle
  // gate. Pinned rule: `available === (status === 'live')` — `interrupted`
  // maps to `false` too, never `status !== 'unsupported'` (which would keep
  // offering move/depart during an interruption).
  onAvailabilityChange?: (available: boolean) => void
}

// The 'retrying' status carries no presentation of its own — display as
// whichever of unsupported/interrupted the preserved cause implies (the
// guard machine keeps `cause: 'lost'` through a retry started from the
// interrupted state, and anything else through one started from
// unsupported).
function displayStatus(status: GuardStatus, cause: string | null): 'unsupported' | 'interrupted' {
  if (status === 'interrupted') return 'interrupted'
  if (status === 'retrying' && cause === 'lost') return 'interrupted'
  return 'unsupported'
}

export function BoardCanvas({ children, renderWorld, onAvailabilityChange }: BoardCanvasProps) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [attempt, setAttempt] = useState(0)

  const guard = useRenderGuard({ canvas, surface: 'board' })
  const available = guard.status === 'live'

  useEffect(() => {
    onAvailabilityChange?.(available)
  }, [available, onAvailabilityChange])

  const handleRetry = useCallback(() => {
    setAttempt((a) => a + 1)
    guard.retry()
  }, [guard])

  // QA MAJOR fix (add-renderer-availability-states): 'unsupported' and
  // 'interrupted' are NOT the same arm. 'unsupported' has no usable
  // context, so tearing the canvas region down (below) is correct and
  // unchanged. 'interrupted' must keep this SAME <canvas> mounted and
  // attached to the document — that's the element the port's renderer will
  // attach to and the one the guard's webglcontextlost/webglcontextrestored
  // listeners are bound to; a detached canvas never receives
  // `webglcontextrestored` again. Tearing the region down on every non-live
  // status (as before) silently made restore permanently unreachable the
  // moment a loss fired. 'retrying' still tears down: that's the explicit
  // Retry escape hatch, which intentionally unmounts (this component's own
  // `canvas` ref resets to null when the element unmounts) and remounts
  // fresh via the `key={attempt}` bump below.
  if (guard.status === 'unsupported' || guard.status === 'retrying') {
    return (
      <RendererStateNotice
        status={displayStatus(guard.status, guard.cause)}
        cause={guard.cause}
        surface="board"
        retrying={guard.status === 'retrying'}
        onRetry={handleRetry}
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
            surface="board"
            retrying={false}
            onRetry={handleRetry}
          />
        }
      >
        <canvas
          ref={setCanvas}
          data-testid="board-canvas"
          className="absolute inset-0 block h-full w-full"
          style={{ touchAction: 'none' }}
        />
        {canvas && renderWorld?.(canvas)}
        {children}
      </CanvasRegionBoundary>
      {/* guard.status === 'interrupted' here (the only remaining case:
          'live' shows no notice at all) — an overlay above the still-mounted
          canvas region, per the fix above. */}
      {guard.status === 'interrupted' && (
        <div className="absolute inset-0 grid place-items-center">
          <RendererStateNotice
            status="interrupted"
            cause={guard.cause}
            surface="board"
            retrying={false}
            onRetry={handleRetry}
          />
        </div>
      )}
    </div>
  )
}

export default BoardCanvas

'use client'

// BoardStage — composes the board's three layers and owns nothing GL
// (port-board-to-webgl-renderer, "the canvas/overlay component split"):
//
//   BoardStage
//   ├── BoardCanvas      ← the ONLY board module reaching three.js (via the
//   │                      dynamically-imported WebGLBoard it mounts)
//   ├── BoardOverlay     ← pure SVG hit shapes/testids/previews (jsdom-safe)
//   └── useBoardProjection ← the seam registering the two
//
// It also owns PICKING: a click that no overlay hit shape claimed falls
// through to this container, unprojects to the board plane, and resolves to
// the containing cell (inside the lattice) or clears the selection (outside) —
// the glyph-wins-else-cell-else-clear priority, with the glyph half carried by
// the overlay's DOM hit shapes. Pointer moves the same way, driving the tile
// hover highlight and the pointer cursor.

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { pointToCell, RADIAL_UNIT, schedule as boardSchedule, type Cell } from '@/lib/board'
import type { SystemBoard } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { wallClock, type WorldAnchor } from '@/hooks/use-world-time'
import { BoardCameraControls, CAMERA_CONTROL_COUNT } from './BoardCameraControls'
import { BoardCanvas } from './BoardCanvas'
import { BoardOverlay, type ScanFxInput } from './BoardOverlay'
import { createFramePacker } from './board-frame'
import { createPackedScene, packFleetInstance } from './board-pack'
import { CAMERA_CONTROL_ATTR, useBoardGestures, type CameraLimit } from './use-board-gestures'
import { useBoardProjection } from './use-board-projection'
import type { WebGLBoardSettings } from './webgl/WebGLBoard'
import type { MovePlan } from './move-preview'
import type { ScanPlan } from './scan-preview'

// three needs a GL context, so the world stays off the SSR path entirely —
// the same treatment GalaxyView gives GalaxyGraph.
const WebGLBoard = dynamic(() => import('./webgl/WebGLBoard').then((m) => m.WebGLBoard), {
  ssr: false,
})

export interface BoardStageProps {
  // The route's system. The camera resets to the default framing when it
  // changes — a new board is a new view — and nothing else resets it.
  systemId?: string
  board: SystemBoard
  fleets: Fleet[]
  worldTime: number
  selectedId?: string | null
  selectedGateId?: string | null
  selectedCell?: Cell | null
  onSelectFeature?: (id: string) => void
  onSelectFleet?: (id: string) => void
  onSelectGate?: (destSystemId: string) => void
  onSelectCell?: (cell: Cell) => void
  onSelectEmpty?: () => void
  plan?: MovePlan | null
  activeSweep?: ScanPlan | null
  sweepPreview?: ScanPlan | null
  scanFx?: ScanFxInput | null
  // The guard's live/not-live state — SystemBoardView wires this into
  // FactsPanel's `available` prop (task 6.1b).
  onAvailabilityChange?: (available: boolean) => void
  // Fires once the canvas has produced its first rendered frame — the
  // loading-state gate (task 6.1a).
  onFirstFrame?: () => void
  // Dev-only look overrides (BoardTuning): renderer settings + camera tilt.
  // Omitted in production — the renderer falls back to its tuned constants.
  settings?: Partial<WebGLBoardSettings>
  tiltDeg?: number
}

const CAMERA_LIMIT_MESSAGE: Record<CameraLimit, string> = {
  pan: 'Board camera is at the edge of the lattice.',
  'zoom-min': 'Board camera is fully zoomed out.',
  'zoom-max': 'Board camera is fully zoomed in.',
}

// useReducedMotion — the system reduced-motion preference, live.
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function BoardStage({
  systemId,
  board,
  fleets,
  worldTime,
  selectedId,
  selectedGateId,
  selectedCell,
  onSelectFeature,
  onSelectFleet,
  onSelectGate,
  onSelectCell,
  onSelectEmpty,
  plan,
  activeSweep,
  sweepPreview,
  scanFx,
  onAvailabilityChange,
  onFirstFrame,
  settings,
  tiltDeg,
}: BoardStageProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [available, setAvailable] = useState(true)
  const [hoverCell, setHoverCell] = useState<Cell | null>(null)
  // Which clamp the last keyboard camera input ran into, or null. Rendered on
  // the stage and announced, so a keyboard-only player learns why a press did
  // nothing rather than being left to guess.
  const [atLimit, setAtLimit] = useState<CameraLimit | null>(null)

  // The board's slot schedule for THIS system — the picking path clamps to the
  // rim, so it needs the per-system radius, never the process-wide default.
  const schedule = useMemo(() => boardSchedule(board.radius), [board.radius])
  const projection = useBoardProjection(host, board.radius, {
    ...(tiltDeg !== undefined ? { tiltDeg } : {}),
    ...(systemId !== undefined ? { systemId } : {}),
  })

  // Pointer drag, wheel, and two-finger pinch — bound on THIS container in the
  // capture phase so a gesture that begins over a mark still moves the camera.
  useBoardGestures({
    host,
    enabled: available,
    radius: board.radius,
    worldPerPixel: projection.camera.worldPerPixel,
    camera: projection.boardCamera,
    setCamera: projection.setCamera,
    onAtLimit: setAtLimit,
  })
  const reducedMotion = useReducedMotion()

  // The packed scene — every decision resolved once per board read (band off
  // the wire, never derived client-side).
  const scene = useMemo(() => createPackedScene(board), [board])
  const packedFleets = useMemo(() => fleets.map(packFleetInstance), [fleets])

  // The frame packer's world anchor: the server's worldTime at receipt,
  // exactly as useWorldTime re-anchors — never a locally integrated clock.
  const anchor = useMemo<WorldAnchor>(
    () => ({ world: board.worldTime, wall: wallClock() }),
    [board.worldTime],
  )

  // Selection reaches the packer through a ref-backed callback so selecting a
  // body never rebuilds the frame pipeline.
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId ?? null
  const getSelectedId = useCallback(() => selectedIdRef.current, [])

  // The decorative-clock epoch: one wall instant for the stage's lifetime, so
  // shader noise doesn't jump on every refetch-driven packer rebuild.
  const fxEpochWall = useRef(wallClock()).current

  const packer = useMemo(
    () =>
      createFramePacker({
        features: board.features,
        fleets,
        anchor,
        // Production world time runs at scale 1, always — the bench-only
        // speed multiplier would desynchronise positions from every server ETA.
        timeScale: 1,
        fxEpochWall,
        reducedMotion,
        getSelectedId,
      }),
    [board.features, fleets, anchor, fxEpochWall, reducedMotion, getSelectedId],
  )
  const packerRef = useRef(packer)
  packerRef.current = packer
  const getFrame = useCallback((wallNowMs: number) => packerRef.current(wallNowMs), [])

  // Task 13.2: the camera controls live in the STAGE, outside BoardCanvas's
  // region, so the canvas-scoped focus handling `add-renderer-availability-
  // states` ships cannot catch focus lost from one of them. If a camera
  // control holds focus at the moment the board goes unavailable, focus moves
  // to the notice's retry affordance (or its explanatory text) — never left to
  // fall to document.body.
  const cameraHadFocus = useRef(false)
  const wasAvailable = useRef(true)
  useEffect(() => {
    const was = wasAvailable.current
    wasAvailable.current = available
    if (!was || available || !cameraHadFocus.current || !host) return
    cameraHadFocus.current = false
    const retry = host.querySelector<HTMLElement>('[data-testid="renderer-retry"]')
    const text = host.querySelector<HTMLElement>(
      '[data-testid="renderer-unsupported"] p, [data-testid="renderer-interrupted"] p',
    )
    ;(retry ?? text)?.focus()
  }, [available, host])

  // Focus bookkeeping for the rescue above. Cleared only when focus lands
  // somewhere else — never by the unmount itself, which in most engines moves
  // focus to nothing rather than firing a focusout at a readable moment.
  const handleFocusIn = useCallback((e: ReactFocusEvent<HTMLDivElement>) => {
    cameraHadFocus.current =
      e.target instanceof Element && !!e.target.closest(`[${CAMERA_CONTROL_ATTR}]`)
  }, [])

  const handleAvailability = useCallback(
    (a: boolean) => {
      setAvailable(a)
      onAvailabilityChange?.(a)
    },
    [onAvailabilityChange],
  )

  const pickCell = useCallback(
    (e: ReactMouseEvent | ReactPointerEvent): Cell | null => {
      if (!host || !projection.ready) return null
      const rect = host.getBoundingClientRect()
      const boardPt = projection.unproject({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      // pointToCell CLAMPS to the rim, so a point outside the lattice comes
      // back as a rim cell rather than as "outside". Comparing the clamped
      // cell's projected radius against the board's own extent is what
      // distinguishes the two — the outside-the-lattice click must still clear
      // the selection.
      const cell = pointToCell(boardPt, schedule)
      if (cell.ring > board.radius) return null
      const rimOuter = (board.radius + 0.5) * RADIAL_UNIT
      if (Math.hypot(boardPt.x, boardPt.y) > rimOuter) return null
      return cell
    },
    [host, projection, board.radius, schedule],
  )

  // Cell clicks: canvas click → unproject → pointToCell; outside the lattice
  // clears the selection. Glyph clicks never reach here (their hit shapes
  // stop propagation).
  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!available) return
      const cell = pickCell(e)
      if (cell) onSelectCell?.(cell)
      else onSelectEmpty?.()
    },
    [available, pickCell, onSelectCell, onSelectEmpty],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!available) return
      setHoverCell((prev: Cell | null) => {
        const cell = pickCell(e)
        if (prev === cell) return prev
        if (prev && cell && prev.ring === cell.ring && prev.slot === cell.slot) return prev
        return cell
      })
    },
    [available, pickCell],
  )

  return (
    <div
      ref={setHost}
      data-testid="board-stage"
      // The at-limit state, DOM-observable: present only when the last
      // keyboard camera input hit a clamp, absent when it moved the camera.
      {...(atLimit ? { 'data-camera-at-limit': atLimit } : {})}
      className="absolute inset-0"
      // touch-action: none suppresses the browser's own pan/pinch across the
      // board's full interactive surface — the overlay's hit shapes included,
      // not just the canvas the spike set it on. It is what lets the pinch
      // handler own the gesture WITHOUT a preventDefault() on touchstart,
      // which would also kill the synthesized click a tap selects with.
      style={{ touchAction: 'none', ...(hoverCell ? { cursor: 'pointer' } : {}) }}
      onClick={handleClick}
      onFocus={handleFocusIn}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverCell(null)}
    >
      <BoardCanvas
        onAvailabilityChange={handleAvailability}
        renderWorld={(canvas) =>
          projection.ready ? (
            <WebGLBoard
              canvas={canvas}
              scene={scene}
              fleets={packedFleets}
              camera={projection.camera}
              getFrame={getFrame}
              onFirstFrame={onFirstFrame}
              {...(settings ? { settings } : {})}
            />
          ) : null
        }
      />
      {/* The same at-limit fact, announced. A silent clamp is indistinguishable
          from a broken key to anyone not watching the pixels. */}
      <span className="sr-only" role="status" aria-live="polite" data-testid="camera-limit-status">
        {atLimit ? CAMERA_LIMIT_MESSAGE[atLimit] : ''}
      </span>

      {/* The overlay renders only over a live canvas — hit shapes floating
          over a "WebGL unavailable" notice would be selectable marks with
          nothing drawn under them. */}
      {/* Camera controls render HERE, in the stage and outside BoardCanvas's
          region, and only while the board is live: while it is not, they are
          gone from the tab order entirely and the gesture listeners above
          stand down with them. */}
      {available && (
        <BoardCameraControls
          camera={projection.boardCamera}
          setCamera={projection.setCamera}
          resetCamera={projection.resetCamera}
        />
      )}
      {available && (
        <BoardOverlay
          // The camera group holds the first tab stops; the overlay's glyph
          // tab order starts after them, leaving the port's own
          // features → fleets → gates sequence intact.
          tabIndexBase={CAMERA_CONTROL_COUNT}
          viewBox={projection.viewBox}
          extent={projection.extent}
          overlayStyle={projection.overlayStyle}
          radius={board.radius}
          worldTime={worldTime}
          features={board.features}
          fleets={fleets}
          gates={board.laneGates}
          selectedId={selectedId ?? null}
          selectedGateId={selectedGateId ?? null}
          selectedCell={selectedCell ?? null}
          hoverCell={hoverCell}
          {...(onSelectFeature ? { onSelectFeature } : {})}
          {...(onSelectFleet ? { onSelectFleet } : {})}
          {...(onSelectGate ? { onSelectGate } : {})}
          plan={plan ?? null}
          activeSweep={activeSweep ?? null}
          sweepPreview={sweepPreview ?? null}
          scanFx={scanFx ?? null}
        />
      )}
    </div>
  )
}

export default BoardStage

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
// the containing hex (inside the lattice) or clears the selection (outside) —
// the glyph-wins-else-hex-else-clear priority, with the glyph half carried by
// the overlay's DOM hit shapes. Pointer moves the same way, driving the tile
// hover highlight and the pointer cursor.

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { ringOf, type Hex } from '@/lib/hex'
import { pixelToHex } from '@/lib/hex/pixel'
import type { SystemBoard } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { wallClock, type WorldAnchor } from '@/hooks/use-world-time'
import { BoardCanvas } from './BoardCanvas'
import { BoardOverlay, type ScanFxInput } from './BoardOverlay'
import { createFramePacker } from './board-frame'
import { createPackedScene, packFleetInstance } from './board-pack'
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
  board: SystemBoard
  fleets: Fleet[]
  worldTime: number
  selectedId?: string | null
  selectedGateId?: string | null
  selectedHex?: Hex | null
  onSelectFeature?: (id: string) => void
  onSelectFleet?: (id: string) => void
  onSelectGate?: (destSystemId: string) => void
  onSelectHex?: (hex: Hex) => void
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
  board,
  fleets,
  worldTime,
  selectedId,
  selectedGateId,
  selectedHex,
  onSelectFeature,
  onSelectFleet,
  onSelectGate,
  onSelectHex,
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
  const [hoverHex, setHoverHex] = useState<Hex | null>(null)
  const projection = useBoardProjection(host, board.radius, tiltDeg !== undefined ? { tiltDeg } : undefined)
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

  const handleAvailability = useCallback(
    (a: boolean) => {
      setAvailable(a)
      onAvailabilityChange?.(a)
    },
    [onAvailabilityChange],
  )

  const pickHex = useCallback(
    (e: ReactMouseEvent | ReactPointerEvent): Hex | null => {
      if (!host || !projection.ready) return null
      const rect = host.getBoundingClientRect()
      const boardPt = projection.unproject({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      const hex = pixelToHex(boardPt)
      return ringOf(hex) <= board.radius ? hex : null
    },
    [host, projection, board.radius],
  )

  // Tile clicks: canvas click → unproject → pixelToHex; outside the lattice
  // clears the selection. Glyph clicks never reach here (their hit shapes
  // stop propagation).
  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!available) return
      const hex = pickHex(e)
      if (hex) onSelectHex?.(hex)
      else onSelectEmpty?.()
    },
    [available, pickHex, onSelectHex, onSelectEmpty],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!available) return
      setHoverHex((prev) => {
        const hex = pickHex(e)
        if (prev === hex) return prev
        if (prev && hex && prev.q === hex.q && prev.r === hex.r) return prev
        return hex
      })
    },
    [available, pickHex],
  )

  return (
    <div
      ref={setHost}
      data-testid="board-stage"
      className="absolute inset-0"
      style={hoverHex ? { cursor: 'pointer' } : undefined}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverHex(null)}
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
      {/* The overlay renders only over a live canvas — hit shapes floating
          over a "WebGL unavailable" notice would be selectable marks with
          nothing drawn under them. */}
      {available && (
        <BoardOverlay
          viewBox={projection.viewBox}
          overlayStyle={projection.overlayStyle}
          radius={board.radius}
          worldTime={worldTime}
          features={board.features}
          fleets={fleets}
          gates={board.laneGates}
          selectedId={selectedId ?? null}
          selectedGateId={selectedGateId ?? null}
          selectedHex={selectedHex ?? null}
          hoverHex={hoverHex}
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

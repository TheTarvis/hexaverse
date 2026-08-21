'use client'

// BoardOverlay — the board's vector-UI layer (port-board-to-webgl-renderer,
// "three layers — canvas world, SVG overlay, one projection seam"). A
// transparent SVG authored in BOARD coordinates (today's fitViewBox), carried
// into pixel register with the canvas by useBoardProjection's camera-matched
// CSS 3D transform. It owns everything drawn AS UI: every hit target and
// data-testid, the selection ring, the selected-hex and hover highlights, the
// move/scan previews, the committed burn paths, the ambient sensor bubble,
// and the lane-gate marks. Everything LIT (tiles, bodies, hulls, plumes)
// belongs to the canvas underneath.
//
// No three.js import, no GL context: this layer mounts for real in jsdom,
// which is what keeps SystemBoardView's structural tests and the e2e testid
// inventory renderer-independent.
//
// Pointer policy: the <svg> root is pointer-events:none — ONLY the per-entity
// hit shapes re-enable pointer-events, so tile and background clicks fall
// through to the canvas and resolve via unproject (BoardStage). Overlapping
// hit shapes resolve topmost-wins by DOM order: lane gates lowest, then
// features (parents before children, so a moon beats its parent), then
// fleets. Keyboard order is decoupled from that DOM order via explicit
// tabIndex: features → fleets → lane gates, each group in stable id order.

import { useMemo, useState } from 'react'
import { boardLegBurn, ringOf, stateAt, type Hex } from '@/lib/hex'
import {
  HEX_SIZE,
  hexPolygonPoints,
  hexToPixel,
  type Point,
  type ViewBox,
} from '@/lib/hex/pixel'
import type { BoardFeature, LaneGate } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import {
  featureMaps,
  fleetDockedParentId,
  fleetGlidePixel,
  fleetLogicalHex,
  fleetOnBoard,
  sensorBubbleHexes,
} from './glyph-geometry'
import { GATE_ACCENT, PREVIEW_BURN, SCAN_BUBBLE_FILL, SCAN_BUBBLE_STROKE, SELECTION_STROKE } from './board-palette'
import { SelectionPreview } from './SelectionPreview'
import { ScanOverlay } from './ScanOverlay'
import { ScanPing } from './ScanPing'
import { ArcScan } from './ArcScan'
import type { MovePlan } from './move-preview'
import type { ScanPlan } from './scan-preview'

// The ambient-sensor radius (hexes) the backend uses
// (observation.DefaultSensorParams) — drawn live around own units.
export const AMBIENT_RADIUS = 3

// The running scan's effect inputs — pinned emission hex and frozen eta
// (`Running Scan Renders From Its Pinned Emission Hex`); `fx` picks the
// playtest effect variant.
export interface ScanFxInput {
  originHex: Hex
  features: BoardFeature[]
  rimRing: number
  committedAt: number
  eta: number
  fx: 'ping' | 'arc'
}

export interface BoardOverlayProps {
  viewBox: ViewBox
  overlayStyle: { transform: string; transformOrigin: string }
  radius: number
  worldTime: number
  features: BoardFeature[]
  fleets: Fleet[]
  gates?: LaneGate[]
  selectedId?: string | null
  selectedGateId?: string | null
  selectedHex?: Hex | null
  hoverHex?: Hex | null
  onSelectFeature?: (id: string) => void
  onSelectFleet?: (id: string) => void
  onSelectGate?: (destSystemId: string) => void
  // Prop-driven preview layers (never children — the canvas can't take React
  // children into its draw loop, so the overlay owns them all).
  plan?: MovePlan | null
  activeSweep?: ScanPlan | null
  sweepPreview?: ScanPlan | null
  scanFx?: ScanFxInput | null
}

const GATE_R = HEX_SIZE * 0.4

export function BoardOverlay({
  viewBox,
  overlayStyle,
  radius,
  worldTime,
  features,
  fleets,
  gates = [],
  selectedId,
  selectedGateId,
  selectedHex,
  hoverHex,
  onSelectFeature,
  onSelectFleet,
  onSelectGate,
  plan,
  activeSweep,
  sweepPreview,
  scanFx,
}: BoardOverlayProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  const { pixelById, hexById } = useMemo(() => featureMaps(features, worldTime), [features, worldTime])

  // Hit-priority DOM order within the feature group: parents before children,
  // so an overlapping moon (drawn above its parent on the canvas) also WINS
  // the click. Tab order is assigned separately, in stable id order.
  const featureDrawOrder = useMemo(() => {
    const parents = features.filter((f) => !f.parentId)
    const children = features.filter((f) => !!f.parentId)
    const byId = (a: BoardFeature, b: BoardFeature) => (a.id < b.id ? -1 : 1)
    return [...parents.sort(byId), ...children.sort(byId)]
  }, [features])

  const featureTabIndex = useMemo(() => {
    const sorted = [...features].sort((a, b) => (a.id < b.id ? -1 : 1))
    return new Map(sorted.map((f, i) => [f.id, i + 1]))
  }, [features])

  const onBoard = useMemo(() => fleets.filter((f) => fleetOnBoard(f, worldTime)), [fleets, worldTime])
  const fleetsSorted = useMemo(() => [...onBoard].sort((a, b) => (a.id < b.id ? -1 : 1)), [onBoard])
  const fleetTabBase = features.length
  const gateTabBase = fleetTabBase + fleetsSorted.length

  const fleetPixel = (f: Fleet): Point => {
    const parentId = fleetDockedParentId(f, worldTime)
    const parentPixel = parentId ? pixelById.get(parentId) : undefined
    return fleetGlidePixel(f, worldTime, parentPixel)
  }

  // The live ambient sensor bubble around own units (task 5.1b).
  const bubble = useMemo(() => {
    const centers = onBoard
      .filter((f) => f.own)
      .map((f) => fleetLogicalHex(f, worldTime, hexById.get(fleetDockedParentId(f, worldTime) ?? '')))
    return sensorBubbleHexes(centers, AMBIENT_RADIUS)
  }, [onBoard, worldTime, hexById])

  // Committed paths of own fleets — a burn, or a trip's leg 0 (task 5.1a). A
  // burn that already arrived folds away via stateAt (no stale path).
  const burnPaths = useMemo(
    () =>
      onBoard
        .filter((f) => f.own)
        .map((f) => ({ id: f.id, path: committedPath(f, worldTime) }))
        .filter((p): p is { id: string; path: Hex[] } => !!p.path)
        .map((p) => ({ id: p.id, points: pathPolyline(p.path) })),
    [onBoard, worldTime],
  )

  const keyActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      fn()
    }
  }

  return (
    <svg
      data-testid="hex-board"
      className="absolute inset-0 h-full w-full"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ ...overlayStyle, pointerEvents: 'none' }}
    >
      {/* Real bounds for the lattice presence assertion (an empty <g> is not
          visible to Playwright). Non-interactive by policy: an interactive
          full-extent rect would intercept every tile click. */}
      <rect
        data-testid="hex-lattice"
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.w}
        height={viewBox.h}
        fill="none"
        pointerEvents="none"
      />

      {/* The committed sweep of a running scan (solid), or the hover preview
          of what a sweep from here would leave in shadow (faint). */}
      <ScanOverlay plan={activeSweep ?? null} variant="active" hideOrigin />
      {!activeSweep && <ScanOverlay plan={sweepPreview ?? null} variant="aim" />}
      {activeSweep && scanFx && (
        scanFx.fx === 'arc' ? (
          <ArcScan
            originHex={scanFx.originHex}
            originPixel={hexToPixel(scanFx.originHex.q, scanFx.originHex.r)}
            features={scanFx.features}
            rimRing={scanFx.rimRing}
            committedAt={scanFx.committedAt}
            eta={scanFx.eta}
            worldTime={worldTime}
          />
        ) : (
          <ScanPing
            originHex={scanFx.originHex}
            originPixel={hexToPixel(scanFx.originHex.q, scanFx.originHex.r)}
            features={scanFx.features}
            rimRing={scanFx.rimRing}
            committedAt={scanFx.committedAt}
            eta={scanFx.eta}
            worldTime={worldTime}
          />
        )
      )}

      <g data-testid="burn-paths" fill="none" pointerEvents="none">
        {burnPaths.map((p) => (
          <polyline key={p.id} points={p.points} stroke={PREVIEW_BURN} strokeWidth={1.5} strokeOpacity={0.8} />
        ))}
      </g>

      <g data-testid="scan-bubble" pointerEvents="none">
        {bubble.map((h) => {
          const c = hexToPixel(h.q, h.r)
          return (
            <polygon
              key={`${h.q},${h.r}`}
              points={hexPolygonPoints(c)}
              fill={SCAN_BUBBLE_FILL}
              stroke={SCAN_BUBBLE_STROKE}
              strokeWidth={1}
            />
          )
        })}
      </g>

      {/* The selected bare hex, visibly marked (task 4.3a) — one dynamic
          shape, not a per-tile node. */}
      {selectedHex && ringOf(selectedHex) <= radius && (
        <polygon
          data-testid="selected-hex"
          points={hexPolygonPoints(hexToPixel(selectedHex.q, selectedHex.r))}
          fill="none"
          stroke={SELECTION_STROKE}
          strokeWidth={2}
          pointerEvents="none"
        />
      )}

      {/* Tile hover feedback (task 4.6a) — tracks the pointer's unprojected
          hex, computed by BoardStage. */}
      {hoverHex && ringOf(hoverHex) <= radius && (
        <polygon
          data-testid="hover-hex"
          points={hexPolygonPoints(hexToPixel(hoverHex.q, hoverHex.r))}
          fill="rgba(255, 255, 255, 0.1)"
          stroke="none"
          pointerEvents="none"
        />
      )}

      <SelectionPreview plan={plan ?? null} />

      {/* Hit shapes, in hit-priority DOM order: gates lowest, fleets topmost. */}
      <g data-testid="lane-gates">
        {gates.map((g, gi) => {
          const p = hexToPixel(g.hex.q, g.hex.r)
          const angleDeg = (Math.atan2(p.y, p.x) * 180) / Math.PI
          const selected = selectedGateId === g.destSystemId
          return (
            <g
              key={g.destSystemId}
              data-testid={`gate-glyph-${g.destSystemId}`}
              transform={`translate(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`}
              className="cursor-pointer"
              pointerEvents="auto"
              tabIndex={gateTabBase + gi + 1}
              role="button"
              aria-label={`Lane gate to ${g.destSystemId}`}
              onFocus={() => setFocusedKey(`gate-${g.destSystemId}`)}
              onBlur={() => setFocusedKey((k) => (k === `gate-${g.destSystemId}` ? null : k))}
              onKeyDown={keyActivate(() => onSelectGate?.(g.destSystemId))}
              onClick={(e) => {
                e.stopPropagation()
                onSelectGate?.(g.destSystemId)
              }}
            >
              {selected && <circle r={GATE_R + 6} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.5} />}
              {focusedKey === `gate-${g.destSystemId}` && (
                <circle r={GATE_R + 9} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.25} strokeDasharray="2 3" data-testid="glyph-focus-ring" />
              )}
              <circle r={GATE_R} fill="none" stroke={GATE_ACCENT} strokeWidth={1.5} strokeOpacity={0.85} />
              <circle r={GATE_R * 0.4} fill={GATE_ACCENT} fillOpacity={0.5} />
              <g transform={`rotate(${angleDeg.toFixed(1)})`}>
                <path
                  d={`M ${(GATE_R * 0.55).toFixed(1)} ${(-GATE_R * 0.5).toFixed(1)} L ${(GATE_R * 1.15).toFixed(1)} 0 L ${(GATE_R * 0.55).toFixed(1)} ${(GATE_R * 0.5).toFixed(1)}`}
                  fill="none"
                  stroke={GATE_ACCENT}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <circle r={HEX_SIZE * 0.55} fill="transparent" />
            </g>
          )
        })}
      </g>

      <g data-testid="feature-glyphs">
        {featureDrawOrder.map((f) => {
          const p = pixelById.get(f.id)
          if (!p) return null
          // The hit-target size is INDEPENDENT of fog-band treatment: an
          // outline-only astronomical feature is no harder to select than a
          // filled one.
          const hitR = HEX_SIZE * 0.5
          const selected = selectedId === f.id
          return (
            <g
              key={f.id}
              data-testid={`feature-glyph-${f.id}`}
              data-band={f.band}
              data-mineable={f.resources?.length ? true : undefined}
              transform={`translate(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`}
              className="cursor-pointer"
              pointerEvents="auto"
              tabIndex={featureTabIndex.get(f.id) ?? 0}
              role="button"
              aria-label={`${f.type} ${f.id}`}
              onFocus={() => setFocusedKey(`feature-${f.id}`)}
              onBlur={() => setFocusedKey((k) => (k === `feature-${f.id}` ? null : k))}
              onKeyDown={keyActivate(() => onSelectFeature?.(f.id))}
              onClick={(e) => {
                e.stopPropagation()
                onSelectFeature?.(f.id)
              }}
            >
              {selected && (
                <circle r={HEX_SIZE * 0.34 + 6} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.5} data-testid="selection-ring" />
              )}
              {focusedKey === `feature-${f.id}` && (
                <circle r={HEX_SIZE * 0.34 + 9} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.25} strokeDasharray="2 3" data-testid="glyph-focus-ring" />
              )}
              <circle r={hitR} fill="transparent" />
            </g>
          )
        })}
      </g>

      <g data-testid="fleet-glyphs">
        {fleetsSorted.map((f, fi) => {
          const p = fleetPixel(f)
          const mode = stateAt(f.state, worldTime).mode
          // The docked-fleet shrunk hit target: a docked fleet draws at
          // exactly its parent's pixel, so clicks around the hull must fall
          // through to the body underneath (the mine gesture).
          const hitR = mode === 'docked' ? HEX_SIZE * 0.18 : HEX_SIZE * 0.5
          const ring = HEX_SIZE * 0.42
          const selected = selectedId === f.id
          return (
            <g
              key={f.id}
              data-testid={`fleet-glyph-${f.id}`}
              data-own={f.own}
              transform={`translate(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`}
              className="cursor-pointer"
              pointerEvents="auto"
              tabIndex={fleetTabBase + fi + 1}
              role="button"
              aria-label={f.own ? `Fleet ${f.id}` : 'Foreign contact'}
              onFocus={() => setFocusedKey(`fleet-${f.id}`)}
              onBlur={() => setFocusedKey((k) => (k === `fleet-${f.id}` ? null : k))}
              onKeyDown={keyActivate(() => onSelectFleet?.(f.id))}
              onClick={(e) => {
                e.stopPropagation()
                onSelectFleet?.(f.id)
              }}
            >
              {selected && (
                <circle r={ring + 5} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.5} data-testid="selection-ring" />
              )}
              {focusedKey === `fleet-${f.id}` && (
                <circle r={ring + 9} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.25} strokeDasharray="2 3" data-testid="glyph-focus-ring" />
              )}
              <circle r={hitR} fill="transparent" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// committedPath — the hex path a fleet is currently flying on this board: a
// burn, or a trip's board leg. Null for a fleet that isn't flying one.
function committedPath(f: Fleet, worldTime: number): Hex[] | null {
  const s = stateAt(f.state, worldTime)
  if (s.mode === 'burn' && s.burn) return s.burn.path
  if (s.mode === 'laneTransit' && s.laneTransit) {
    return boardLegBurn(s.laneTransit)?.path ?? null
  }
  return null
}

function pathPolyline(path: Hex[]): string {
  return path
    .map((h) => {
      const p = hexToPixel(h.q, h.r)
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
    })
    .join(' ')
}

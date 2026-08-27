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
import {
  boardLegBurn,
  cellKey,
  cellToPoint,
  RADIAL_UNIT,
  schedule as boardSchedule,
  stateAt,
  wedgePath,
  type Cell,
  type Point,
  type Schedule,
} from '@/lib/board'
import type { BoardFeature, LaneGate } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import {
  featureMaps,
  fleetDockedParentId,
  fleetGlidePixel,
  fleetLogicalCell,
  fleetOnBoard,
  sensorBubbleCells,
} from './glyph-geometry'
import { GATE_ACCENT, PREVIEW_BURN, SCAN_BUBBLE_FILL, SCAN_BUBBLE_STROKE, SELECTION_STROKE } from './board-palette'
import { SelectionPreview } from './SelectionPreview'
import { ScanOverlay } from './ScanOverlay'
import { ScanPing } from './ScanPing'
import { ArcScan } from './ArcScan'
import type { MovePlan } from './move-preview'
import type { ScanPlan } from './scan-preview'

// The ambient-sensor radius (cells) the backend uses
// (observation.DefaultSensorParams) — drawn live around own units.
export const AMBIENT_RADIUS = 3

// The running scan's effect inputs — pinned emission cell and frozen eta
// (`Running Scan Renders From Its Pinned Emission Cell`); `fx` picks the
// playtest effect variant.
export interface ScanFxInput {
  originCell: Cell
  features: BoardFeature[]
  rimRing: number
  committedAt: number
  eta: number
  fx: 'ping' | 'arc'
}

export interface BoardOverlayProps {
  // Where this overlay's glyph tab stops begin. The board's camera controls
  // occupy the first stops (they must precede the glyphs), so the stage passes
  // their count here; the port's own features → fleets → gates order inside
  // the group is unchanged.
  tabIndexBase?: number
  viewBox: string
  // The board square's half-width in board pixels — the numeric form of
  // `viewBox`, for the lattice-bounds rect.
  extent: number
  overlayStyle: { transform: string; transformOrigin: string }
  radius: number
  worldTime: number
  features: BoardFeature[]
  fleets: Fleet[]
  gates?: LaneGate[]
  selectedId?: string | null
  selectedGateId?: string | null
  selectedCell?: Cell | null
  hoverCell?: Cell | null
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

const GATE_R = RADIAL_UNIT * 0.4

export function BoardOverlay({
  viewBox,
  extent,
  overlayStyle,
  radius,
  worldTime,
  features,
  fleets,
  gates = [],
  selectedId,
  selectedGateId,
  selectedCell,
  hoverCell,
  onSelectFeature,
  onSelectFleet,
  onSelectGate,
  plan,
  activeSweep,
  sweepPreview,
  scanFx,
  tabIndexBase = 0,
}: BoardOverlayProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  // The board's slot schedule, resolved once from this system's radius and
  // threaded into every projection below (design.md, schedule-threading
  // Decision). The overlay ENUMERATES cells (the sensor bubble), so this must
  // be the per-system schedule, never the process-wide default.
  const schedule: Schedule = useMemo(() => boardSchedule(radius), [radius])

  const { pixelById, cellById } = useMemo(
    () => featureMaps(features, worldTime, schedule),
    [features, worldTime, schedule],
  )

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
    return new Map(sorted.map((f, i) => [f.id, tabIndexBase + i + 1]))
  }, [features, tabIndexBase])

  const onBoard = useMemo(
    () => fleets.filter((f) => fleetOnBoard(f, worldTime, schedule)),
    [fleets, worldTime, schedule],
  )
  const fleetsSorted = useMemo(() => [...onBoard].sort((a, b) => (a.id < b.id ? -1 : 1)), [onBoard])
  const fleetTabBase = tabIndexBase + features.length
  const gateTabBase = fleetTabBase + fleetsSorted.length

  const fleetPixel = (f: Fleet): Point => {
    const parentId = fleetDockedParentId(f, worldTime, schedule)
    const parentPixel = parentId ? pixelById.get(parentId) : undefined
    return fleetGlidePixel(f, worldTime, schedule, parentPixel)
  }

  // The live ambient sensor bubble around own units (task 5.1b).
  // The bubble's centres are LOGICAL cells, so the union only changes when an
  // own unit crosses a cell — not on every animation frame. Keying the memo on
  // the centres themselves (rather than on worldTime) keeps both the BFS and
  // the wedge-path DOM it feeds off the per-frame path.
  const centerKeys = onBoard
    .filter((f) => f.own)
    .map((f) =>
      cellKey(
        fleetLogicalCell(
          f,
          worldTime,
          schedule,
          cellById.get(fleetDockedParentId(f, worldTime, schedule) ?? ''),
        ),
      ),
    )
    .join(',')
  const bubble = useMemo(() => {
    const centers = centerKeys
      ? centerKeys.split(',').map((k) => {
          const [ring, slot] = k.split(':')
          return { ring: Number(ring), slot: Number(slot) }
        })
      : []
    return sensorBubbleCells(centers, AMBIENT_RADIUS, radius, schedule)
  }, [centerKeys, radius, schedule])

  // Committed paths of own fleets — a burn, or a trip's leg 0 (task 5.1a). A
  // burn that already arrived folds away via stateAt (no stale path).
  const burnPaths = useMemo(
    () =>
      onBoard
        .filter((f) => f.own)
        .map((f) => ({ id: f.id, path: committedPath(f, worldTime, schedule) }))
        .filter((p): p is { id: string; path: Cell[] } => !!p.path)
        .map((p) => ({ id: p.id, points: pathPolyline(p.path, schedule) })),
    [onBoard, worldTime, schedule],
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
      data-testid="board-overlay"
      className="absolute inset-0 h-full w-full"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ ...overlayStyle, pointerEvents: 'none' }}
    >
      {/* Real bounds for the lattice presence assertion (an empty <g> is not
          visible to Playwright). Non-interactive by policy: an interactive
          full-extent rect would intercept every tile click. */}
      <rect
        data-testid="board-lattice"
        x={-extent}
        y={-extent}
        width={extent * 2}
        height={extent * 2}
        fill="none"
        pointerEvents="none"
      />

      {/* The committed sweep of a running scan (solid), or the hover preview
          of what a sweep from here would leave in shadow (faint). */}
      <ScanOverlay plan={activeSweep ?? null} variant="active" schedule={schedule} hideOrigin />
      {!activeSweep && <ScanOverlay plan={sweepPreview ?? null} variant="aim" schedule={schedule} />}
      {activeSweep && scanFx && (
        scanFx.fx === 'arc' ? (
          <ArcScan
            originCell={scanFx.originCell}
            originPixel={cellToPoint(scanFx.originCell, schedule)}
            features={scanFx.features}
            rimRing={scanFx.rimRing}
            schedule={schedule}
            committedAt={scanFx.committedAt}
            eta={scanFx.eta}
            worldTime={worldTime}
          />
        ) : (
          <ScanPing
            originCell={scanFx.originCell}
            originPixel={cellToPoint(scanFx.originCell, schedule)}
            features={scanFx.features}
            rimRing={scanFx.rimRing}
            schedule={schedule}
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
        {bubble.map((c) => (
          <path
            key={cellKey(c)}
            d={wedgePath(c, schedule)}
            fill={SCAN_BUBBLE_FILL}
            stroke={SCAN_BUBBLE_STROKE}
            strokeWidth={1}
          />
        ))}
      </g>

      {/* The selected bare cell, visibly marked (task 4.3a) — one dynamic
          shape, not a per-cell node. */}
      {selectedCell && selectedCell.ring <= radius && (
        <path
          data-testid="selected-cell"
          d={wedgePath(selectedCell, schedule)}
          fill="none"
          stroke={SELECTION_STROKE}
          strokeWidth={2}
          pointerEvents="none"
        />
      )}

      {/* Cell hover feedback (task 4.6a) — tracks the pointer's unprojected
          cell, computed by BoardStage. */}
      {hoverCell && hoverCell.ring <= radius && (
        <path
          data-testid="hover-cell"
          d={wedgePath(hoverCell, schedule)}
          fill="rgba(255, 255, 255, 0.1)"
          stroke="none"
          pointerEvents="none"
        />
      )}

      <SelectionPreview plan={plan ?? null} schedule={schedule} />

      {/* Hit shapes, in hit-priority DOM order: gates lowest, fleets topmost. */}
      <g data-testid="lane-gates">
        {gates.map((g, gi) => {
          const p = cellToPoint(g.cell, schedule)
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
              <circle r={RADIAL_UNIT * 0.55} fill="transparent" />
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
          const hitR = RADIAL_UNIT * 0.5
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
                <circle r={RADIAL_UNIT * 0.34 + 6} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.5} data-testid="selection-ring" />
              )}
              {focusedKey === `feature-${f.id}` && (
                <circle r={RADIAL_UNIT * 0.34 + 9} fill="none" stroke={SELECTION_STROKE} strokeWidth={1.25} strokeDasharray="2 3" data-testid="glyph-focus-ring" />
              )}
              <circle r={hitR} fill="transparent" />
            </g>
          )
        })}
      </g>

      <g data-testid="fleet-glyphs">
        {fleetsSorted.map((f, fi) => {
          const p = fleetPixel(f)
          const mode = stateAt(f.state, worldTime, schedule).mode
          // The docked-fleet shrunk hit target: a docked fleet draws at
          // exactly its parent's pixel, so clicks around the hull must fall
          // through to the body underneath (the mine gesture).
          const hitR = mode === 'docked' ? RADIAL_UNIT * 0.18 : RADIAL_UNIT * 0.5
          const ring = RADIAL_UNIT * 0.42
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

// committedPath — the cell path a fleet is currently flying on this board: a
// burn, or a trip's board leg. Null for a fleet that isn't flying one.
function committedPath(f: Fleet, worldTime: number, s: Schedule): Cell[] | null {
  const eff = stateAt(f.state, worldTime, s)
  if (eff.mode === 'burn' && eff.burn) return eff.burn.path
  if (eff.mode === 'laneTransit' && eff.laneTransit) {
    return boardLegBurn(eff.laneTransit)?.path ?? null
  }
  return null
}

function pathPolyline(path: Cell[], s: Schedule): string {
  return path
    .map((c) => {
      const p = cellToPoint(c, s)
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
    })
    .join(' ')
}

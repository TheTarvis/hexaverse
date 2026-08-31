'use client'

// BoardOverlay — the board's vector-UI layer (port-board-to-webgl-renderer,
// "three layers — canvas world, SVG overlay, one projection seam"). A
// transparent SVG authored in BOARD coordinates (today's fitViewBox), carried
// into pixel register with the canvas by useBoardProjection's camera-matched
// CSS 3D transform. It owns everything drawn AS UI: every hit target and
// data-testid, the selection ring, the selected-hex and hover highlights, and
// the lane-gate marks.
//
// No three.js import, no GL context: this layer mounts for real in jsdom,
// which is what keeps SystemBoardView's structural tests and the e2e testid
// inventory renderer-independent.
//
// Pointer policy: the <svg> root is pointer-events:none — ONLY the per-entity
// hit shapes re-enable pointer-events, so tile and background clicks fall
// through to the canvas and resolve via unproject (BoardStage). Overlapping
// hit shapes resolve topmost-wins by DOM order: lane gates lowest, then
// features (parents before children, so a moon beats its parent) — the same
// priority board-selection.ts's `resolvePick` runs as a pure function.
// Keyboard order is decoupled from that DOM order via explicit tabIndex:
// features → lane gates, each group in stable id order.
//
// The board draws no fleet layer after migrate-fleet-to-continuous-burns
// (design.md Decision 12: a fleet has no board cell any more, only a
// continuous-space position) — the fleet-glyph group, the committed burn
// paths, and the ambient sensor bubble (observation's live coverage, removed
// server-side per section 7) have no successor here; see tasks.md 8.1/8.3/8.7.

import { useMemo, useState } from 'react'
import {
  cellToPoint,
  RADIAL_UNIT,
  schedule as boardSchedule,
  wedgePath,
  type Cell,
  type Schedule,
} from '@/lib/board'
import type { BoardFeature, LaneGate } from '@/lib/types/system-board'
import { featureMaps } from './glyph-geometry'
import { GATE_ACCENT, SELECTION_STROKE } from './board-palette'

export interface BoardOverlayProps {
  // Where this overlay's glyph tab stops begin. The board's camera controls
  // occupy the first stops (they must precede the glyphs), so the stage passes
  // their count here; the port's own features → gates order inside the group
  // is unchanged.
  tabIndexBase?: number
  viewBox: string
  // The board square's half-width in board pixels — the numeric form of
  // `viewBox`, for the lattice-bounds rect.
  extent: number
  overlayStyle: { transform: string; transformOrigin: string }
  radius: number
  worldTime: number
  features: BoardFeature[]
  gates?: LaneGate[]
  selectedId?: string | null
  selectedGateId?: string | null
  selectedCell?: Cell | null
  hoverCell?: Cell | null
  onSelectFeature?: (id: string) => void
  onSelectGate?: (destSystemId: string) => void
}

const GATE_R = RADIAL_UNIT * 0.4

export function BoardOverlay({
  viewBox,
  extent,
  overlayStyle,
  radius,
  worldTime,
  features,
  gates = [],
  selectedId,
  selectedGateId,
  selectedCell,
  hoverCell,
  onSelectFeature,
  onSelectGate,
  tabIndexBase = 0,
}: BoardOverlayProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  // The board's slot schedule, resolved once from this system's radius and
  // threaded into every projection below (design.md, schedule-threading
  // Decision).
  const schedule: Schedule = useMemo(() => boardSchedule(radius), [radius])

  const { pixelById } = useMemo(
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

  const gateTabBase = tabIndexBase + features.length

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

      {/* The selected bare cell, visibly marked (board-view ADDED "Board
          Picking Resolves to the Feature, Cell, or Lane Gate Under the
          Pointer" — "a selected bare hex is visibly marked on the board"). */}
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

      {/* Cell hover feedback — tracks the pointer's unprojected cell,
          computed by BoardStage. */}
      {hoverCell && hoverCell.ring <= radius && (
        <path
          data-testid="hover-cell"
          d={wedgePath(hoverCell, schedule)}
          fill="rgba(255, 255, 255, 0.1)"
          stroke="none"
          pointerEvents="none"
        />
      )}

      {/* Hit shapes, in hit-priority DOM order: gates lowest, features
          topmost — features win over a co-located gate (board-selection.ts's
          `resolvePick`). */}
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
    </svg>
  )
}

export default BoardOverlay

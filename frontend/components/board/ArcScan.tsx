'use client'

// ArcScan — the rotating-beam scan effect: a beam turning about the antenna,
// a leading blade wedge, and glowing cells in its angular wake. NOT currently
// wired to a verb: the slice scan renders as the radial ping (ScanPing,
// #0006 Decision #22). Kept apart and alive as a future scan variant — an
// arc-scan verb of its own, or the deferred directional cone's picture
// (#0006 Decision #21). Same contract as ScanPing: every element is a pure
// function of the window and worldTime (arc-scan.ts holds the math and the
// ARC_TUNING knobs), the pivot glides with the glyph, occlusion is live.

import { useId, useMemo } from 'react'
import {
  cellKey,
  RADIAL_UNIT,
  wedgePath,
  type Cell,
  type Point,
  type Schedule,
} from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'
import { occluderKey, planSweepFrom, sweepOccluders } from './scan-preview'
import { sweepHeadingDeg, sweepTrail, ARC_TUNING } from './arc-scan'
import {
  SCAN_SWEEP_BEAM,
  SCAN_SWEEP_BEAM_HALO,
  SCAN_SWEEP_BLADE,
  sweepGlowFill,
  sweepGlowStroke,
} from './board-palette'

// Pixel distance of one cell of range: on the polar lattice, range is measured
// in rings, and adjacent rings are one radial unit apart.
const CELL_RANGE_PX = RADIAL_UNIT

export interface ArcScanProps {
  // The antenna: live logical cell (occlusion + trail math) and glided screen
  // point (drawing).
  originCell: Cell
  originPixel: Point
  features: BoardFeature[]
  rimRing: number
  // The board's slot schedule — what resolves each cell's wedge and bearing.
  schedule: Schedule
  // The window the beam turns ARC_TUNING.revolutionsPerScan times over.
  committedAt: number
  eta: number
  worldTime: number
  // Optional reach clamp, in cells (e.g. a ping front the beam must not
  // outrun). Defaults to the full board.
  reachCells?: number
}

export function ArcScan({
  originCell,
  originPixel,
  features,
  rimRing,
  schedule,
  committedAt,
  eta,
  worldTime,
  reachCells,
}: ArcScanProps) {
  const clipId = useId()
  const reach = reachCells ?? rimRing
  const reachPx = reach * CELL_RANGE_PX
  const heading = sweepHeadingDeg(committedAt, eta, worldTime)
  // The shadow solve is O(cells × occluders); it re-runs only when an occluder
  // actually crosses a cell, not on every animation frame.
  const occluders = sweepOccluders(features, worldTime, schedule)
  const key = occluderKey(originCell, occluders)
  const shadowed = useMemo(
    () => new Set(planSweepFrom(originCell, occluders, rimRing, schedule).shadowed.map(cellKey)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, rimRing, schedule],
  )
  const trail = sweepTrail(originCell, rimRing, heading, shadowed, schedule, reach, originPixel)

  // The board disc's outer edge — the rim ring's outer radius; nothing draws
  // past it.
  const clipR = (rimRing + 0.5) * RADIAL_UNIT
  const head = rayPoint(originPixel, heading, reachPx)
  const bladeFrom = rayPoint(originPixel, heading - ARC_TUNING.bladeDeg, reachPx)

  return (
    <g data-testid="arc-scan" pointerEvents="none">
      <clipPath id={clipId}>
        <circle cx={0} cy={0} r={clipR} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {/* The wake: cells the beam just read, fading with angular lag. */}
        <g data-testid="arc-scan-trail">
          {trail.map(({ cell, glow }) => (
            <path
              key={`t-${cellKey(cell)}`}
              d={wedgePath(cell, schedule)}
              fill={sweepGlowFill(glow)}
              stroke={sweepGlowStroke(glow)}
              strokeWidth={0.75}
            />
          ))}
        </g>
        {/* The blade and the beam head. */}
        <path
          d={`M ${fmt(originPixel)} L ${fmt(bladeFrom)} A ${reachPx.toFixed(2)} ${reachPx.toFixed(2)} 0 0 1 ${fmt(head)} Z`}
          fill={SCAN_SWEEP_BLADE}
        />
        <line
          data-testid="arc-scan-beam"
          x1={originPixel.x.toFixed(2)}
          y1={originPixel.y.toFixed(2)}
          x2={head.x.toFixed(2)}
          y2={head.y.toFixed(2)}
          stroke={SCAN_SWEEP_BEAM_HALO}
          strokeWidth={5}
        />
        <line
          x1={originPixel.x.toFixed(2)}
          y1={originPixel.y.toFixed(2)}
          x2={head.x.toFixed(2)}
          y2={head.y.toFixed(2)}
          stroke={SCAN_SWEEP_BEAM}
          strokeWidth={1.75}
        />
      </g>
    </g>
  )
}

function rayPoint(from: Point, angleDeg: number, len: number): Point {
  const a = (angleDeg * Math.PI) / 180
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len }
}

function fmt(p: Point): string {
  return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`
}

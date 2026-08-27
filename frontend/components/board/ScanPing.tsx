'use client'

// ScanPing — the radial-echo picture of a RUNNING scan (#0006 Decisions
// #22/#23/#26): ONE pulse ring, grown from the EMISSION HEX pinned at commit
// and left there — the pulse stays where it was fired while the ship moves
// on and still collects the returns (the server's fog read agrees:
// observation.echoDisc keys on the same pinned hex, and it's the stale fix
// the loud rule hands other corps — Decision #25). The ring paces the show:
// each body blooms at its hex the moment its echo arrives, nearest first,
// staggered across the scan's window. Every radius and opacity is a pure
// function of the scan's frozen window and worldTime (scan-ping.ts, where
// the look-and-feel knobs live — PING_TUNING), so the per-frame worldTime
// tick is the only animation source and a frozen clock freezes the picture.
// Occlusion is live: a body without line of sight from the emission hex
// (planSweep at worldTime) never returns — echoes don't come back from
// behind a planet. Purely presentational; the committed coverage readout
// (the eta-frozen shadow hatching) stays ScanOverlay's job. The
// rotating-beam flavor is ArcScan — a separate, currently unwired effect.

import { useId, useMemo } from 'react'
import {
  cellKey,
  cellToPoint,
  RADIAL_UNIT,
  type Cell,
  type Point,
  type Schedule,
} from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'
import { featureLogicalCell } from './glyph-geometry'
import { occluderKey, planSweepFrom, sweepOccluders } from './scan-preview'
import { echoFrontCells, echoReturns } from './scan-ping'
import { SCAN_ECHO_RETURN, SCAN_PING_PULSE, SCAN_SWEEP_BEAM } from './board-palette'

// Pixel distance of one cell of range: on the polar lattice range is measured
// in rings, and adjacent rings are one radial unit apart — the pulse ring's
// unit.
const CELL_RANGE_PX = RADIAL_UNIT

export interface ScanPingProps {
  // The emission point: the cell the pulse was fired from, PINNED at commit
  // (#0006 Decision #26) — occlusion + distance math off the cell, drawing off
  // the point. It does NOT ride the fleet.
  originCell: Cell
  originPixel: Point
  features: BoardFeature[]
  rimRing: number
  // The board's slot schedule — what projects cells and resolves distances.
  schedule: Schedule
  // The scan's frozen window (#0005): the echoes land between these instants.
  committedAt: number
  eta: number
  worldTime: number
}

export function ScanPing({
  originCell,
  originPixel,
  features,
  rimRing,
  schedule,
  committedAt,
  eta,
  worldTime,
}: ScanPingProps) {
  const clipId = useId()
  const front = echoFrontCells(committedAt, eta, worldTime, rimRing)
  const frontPx = front * CELL_RANGE_PX
  const frontT = rimRing > 0 ? front / rimRing : 1
  // See ArcScan: memoized on the occluder set, not on worldTime, so the
  // per-frame pulse does not re-solve an unchanged shadow.
  const occluders = sweepOccluders(features, worldTime, schedule)
  const key = occluderKey(originCell, occluders)
  const shadowed = useMemo(
    () => new Set(planSweepFrom(originCell, occluders, rimRing, schedule).shadowed.map(cellKey)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, rimRing, schedule],
  )
  const returns = echoReturns(
    originCell,
    features.map((f) => featureLogicalCell(f, worldTime, schedule)),
    front,
    shadowed,
    schedule,
  )

  // The board disc's outer edge — the rim ring's outer radius; nothing draws
  // past it.
  const clipR = (rimRing + 0.5) * RADIAL_UNIT

  return (
    <g data-testid="scan-ping" pointerEvents="none">
      <clipPath id={clipId}>
        <circle cx={0} cy={0} r={clipR} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {/* THE pulse: one ring at the returned-echo front, pinned at the
            emission cell — bright at the muzzle, thinning as it nears the rim
            (far returns read as "still inbound"). */}
        <circle
          data-testid="scan-ping-pulse"
          cx={originPixel.x.toFixed(2)}
          cy={originPixel.y.toFixed(2)}
          r={frontPx.toFixed(2)}
          fill="none"
          stroke={SCAN_PING_PULSE}
          strokeWidth={2 * (1 - frontT) + 0.75}
          opacity={1 - 0.6 * frontT}
        />
        {/* The returns — the show: each body blips the instant its echo
            arrives, a bright bloom that dissipates outward as a ring. */}
        <g data-testid="scan-echo-returns">
          {returns.map(({ cell, strength }) => {
            const c = cellToPoint(cell, schedule)
            const x = c.x.toFixed(2)
            const y = c.y.toFixed(2)
            return (
              <g key={`r-${cellKey(cell)}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={RADIAL_UNIT * 0.3}
                  fill={SCAN_ECHO_RETURN}
                  stroke="none"
                  opacity={strength * strength}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={RADIAL_UNIT * (0.4 + 0.6 * (1 - strength))}
                  fill="none"
                  stroke={SCAN_ECHO_RETURN}
                  strokeWidth={1.5}
                  opacity={strength}
                />
              </g>
            )
          })}
        </g>
      </g>
      {/* The emission point: a steady small ring where the pulse was fired —
          the stale fix the ping hands the room, whether or not the ship has
          since moved off it. */}
      <circle
        cx={originPixel.x.toFixed(2)}
        cy={originPixel.y.toFixed(2)}
        r={RADIAL_UNIT * 0.35}
        fill="none"
        stroke={SCAN_SWEEP_BEAM}
        strokeWidth={1}
      />
    </g>
  )
}

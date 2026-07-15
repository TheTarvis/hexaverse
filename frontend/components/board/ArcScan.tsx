'use client'

// ArcScan — the rotating-beam scan effect: a beam turning about the antenna,
// a leading blade wedge, and glowing cells in its angular wake. NOT currently
// wired to a verb: the slice scan renders as the radial ping (ScanPing,
// #0006 Decision #22). Kept apart and alive as a future scan variant — an
// arc-scan verb of its own, or the deferred directional cone's picture
// (#0006 Decision #21). Same contract as ScanPing: every element is a pure
// function of the window and worldTime (arc-scan.ts holds the math and the
// ARC_TUNING knobs), the pivot glides with the glyph, occlusion is live.

import { useId } from 'react'
import type { Hex } from '@/lib/hex'
import { hexKey } from '@/lib/hex'
import { hexPolygonPoints, hexToPixel, HEX_SIZE, type Point } from '@/lib/hex/pixel'
import type { BoardFeature } from '@/lib/types/system-board'
import { planSweep } from './scan-preview'
import { sweepHeadingDeg, sweepTrail, ARC_TUNING } from './arc-scan'
import {
  SCAN_SWEEP_BEAM,
  SCAN_SWEEP_BEAM_HALO,
  SCAN_SWEEP_BLADE,
  sweepGlowFill,
  sweepGlowStroke,
} from './board-palette'

// Pixel distance of one hex of range (pointy-top column spacing).
const HEX_RANGE_PX = Math.sqrt(3) * HEX_SIZE

export interface ArcScanProps {
  // The antenna: live logical hex (occlusion + trail math) and glided screen
  // point (drawing).
  originHex: Hex
  originPixel: Point
  features: BoardFeature[]
  rimRing: number
  // The window the beam turns ARC_TUNING.revolutionsPerScan times over.
  committedAt: number
  eta: number
  worldTime: number
  // Optional reach clamp, in hexes (e.g. a ping front the beam must not
  // outrun). Defaults to the full board.
  reachHexes?: number
}

export function ArcScan({
  originHex,
  originPixel,
  features,
  rimRing,
  committedAt,
  eta,
  worldTime,
  reachHexes,
}: ArcScanProps) {
  const clipId = useId()
  const reach = reachHexes ?? rimRing
  const reachPx = reach * HEX_RANGE_PX
  const heading = sweepHeadingDeg(committedAt, eta, worldTime)
  const shadowed = new Set(planSweep(originHex, features, rimRing, worldTime).shadowed.map(hexKey))
  const trail = sweepTrail(originHex, rimRing, heading, shadowed, reach, originPixel)

  // The board disc's outer edge — nothing draws past the rim.
  const clipR = HEX_SIZE * (Math.sqrt(3) * rimRing + 1)
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
          {trail.map(({ hex, glow }) => (
            <polygon
              key={`t-${hex.q},${hex.r}`}
              points={hexPolygonPoints(hexToPixel(hex.q, hex.r))}
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

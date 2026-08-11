'use client'

// SPIKE (throwaway) — the CURRENT board, for side-by-side comparison.
//
// This deliberately uses the REAL production components — HexLattice,
// FeatureGlyph, FleetGlyph, and board-palette — on the same mock data, the same
// patrol path, and the same clock as the WebGL board. Nothing here is a
// strawman: if the SVG board looks flat next to the WebGL one, it is because
// this is genuinely what components/board renders today.
//
// The one thing hand-drawn here is the sensor bubble, because the production
// ScanOverlay/ScanPing pair takes more wiring than a spike warrants. It uses the
// same SCAN_BUBBLE_* constants the real overlay does, so the comparison stays
// fair — note the real ScanPing does slightly more than this (a travelling beam
// head and per-cell sweep glow), which this stand-in omits.

import { useMemo } from 'react'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { fitViewBox, hexesWithinRadius, hexToPixel, hexPolygonPoints, HEX_SIZE } from '@/lib/hex/pixel'
import { HexLattice } from '@/components/board/HexLattice'
import { FeatureGlyph } from '@/components/board/FeatureGlyph'
import { FleetGlyph } from '@/components/board/FleetGlyph'
import { SCAN_BUBBLE_FILL, SCAN_BUBBLE_STROKE } from '@/components/board/board-palette'
import { bodyPoint, type SpikeBoard } from './mock-board'
import { patrolAt } from './patrol'

export interface SvgBoardProps {
  board: SpikeBoard
  // Seconds since the spike mounted — the shared animation clock.
  elapsed: number
  // World-milliseconds, already scaled by the speed control.
  worldTime: number
}

export function SvgBoard({ board, elapsed, worldTime }: SvgBoardProps) {
  const viewBox = useMemo(() => fitViewBox(hexesWithinRadius(board.radius)), [board.radius])
  const bandBounds = useMemo(
    () => ({ innerMaxRing: board.innerMaxRing, midMaxRing: board.midMaxRing }),
    [board.innerMaxRing, board.midMaxRing],
  )

  // SpikeBody → the production BoardFeature shape, so the real glyph draws it.
  // Kept paired with its source body so the orbit sample stays with the feature.
  const features = useMemo<{ feature: BoardFeature; body: (typeof board.bodies)[number] }[]>(
    () =>
      board.bodies.map((b) => ({
        body: b,
        feature: {
          id: b.id,
          type: b.type,
          footprint: [],
          band: b.band,
          live: b.band === 'visible',
        },
      })),
    [board.bodies],
  )

  const A = useMemo(() => hexToPixel(board.fleet.hex.q, board.fleet.hex.r), [board.fleet.hex])
  const B = useMemo(
    () => hexToPixel(-Math.round(board.radius * 0.35), Math.round(board.radius * 0.1)),
    [board.radius],
  )
  const pat = patrolAt(A, B, elapsed)

  // FleetGlyph's hull points along +x at rotation 0, and SVG y runs down, so the
  // heading is the plain atan2 of the velocity in this space.
  const headingDeg = (Math.atan2(pat.vy, pat.vx) * 180) / Math.PI

  // A burn whose arrival never comes, so stateAt keeps the glyph in burn mode
  // for as long as the demo runs.
  const fleet = useMemo<Fleet>(
    () => ({
      id: board.fleet.id,
      corporationId: 'spike',
      systemId: 'spike',
      state: {
        mode: 'burn',
        burn: { path: [board.fleet.hex], startTime: 0, arriveTime: Number.MAX_SAFE_INTEGER, target: { hex: board.fleet.hex } },
      },
      position: board.fleet.hex,
      own: true,
      worldTime: 0,
    }),
    [board.fleet],
  )

  const sensorHexes = useMemo(() => {
    // The bubble's tiles, centred on the fleet's current hex-ish position. Done
    // in pixel space for the spike rather than walking the hex neighbourhood.
    const r = board.sensorRadius * Math.sqrt(3) * HEX_SIZE
    return hexesWithinRadius(board.radius).filter((h) => {
      const p = hexToPixel(h.q, h.r)
      return Math.hypot(p.x - pat.x, p.y - pat.y) <= r
    })
  }, [board.radius, board.sensorRadius, pat.x, pat.y])

  return (
    <svg
      data-testid="svg-board"
      className="absolute inset-0 h-full w-full"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <HexLattice radius={board.radius} bandBounds={bandBounds} />

      {/* The live sensor bubble the fleet carries. */}
      <g data-testid="svg-sensor-bubble">
        {sensorHexes.map((h) => {
          const p = hexToPixel(h.q, h.r)
          return (
            <polygon
              key={`${h.q},${h.r}`}
              points={hexPolygonPoints(p)}
              fill={SCAN_BUBBLE_FILL}
              stroke={SCAN_BUBBLE_STROKE}
              strokeWidth={0.5}
            />
          )
        })}
      </g>

      {features.map(({ feature, body }) => (
        <FeatureGlyph key={feature.id} feature={feature} point={bodyPoint(body, worldTime)} />
      ))}

      <FleetGlyph fleet={fleet} point={{ x: pat.x, y: pat.y }} worldTime={worldTime} headingDeg={headingDeg} />
    </svg>
  )
}

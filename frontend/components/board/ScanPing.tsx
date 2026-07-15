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

import { useId } from 'react'
import type { Hex } from '@/lib/hex'
import { hexKey } from '@/lib/hex'
import { hexToPixel, HEX_SIZE, type Point } from '@/lib/hex/pixel'
import type { BoardFeature } from '@/lib/types/system-board'
import { featureLogicalHex } from './glyph-geometry'
import { planSweep } from './scan-preview'
import { echoFrontHexes, echoReturns } from './scan-ping'
import { SCAN_ECHO_RETURN, SCAN_PING_PULSE, SCAN_SWEEP_BEAM } from './board-palette'

// Pixel distance of one hex of range: the centre spacing between adjacent
// columns (pointy-top layout) — the pulse ring's unit.
const HEX_RANGE_PX = Math.sqrt(3) * HEX_SIZE

export interface ScanPingProps {
  // The emission point: the hex the pulse was fired from, PINNED at commit
  // (#0006 Decision #26) — occlusion + distance math off the hex, drawing off
  // the point. It does NOT ride the fleet.
  originHex: Hex
  originPixel: Point
  features: BoardFeature[]
  rimRing: number
  // The scan's frozen window (#0005): the echoes land between these instants.
  committedAt: number
  eta: number
  worldTime: number
}

export function ScanPing({
  originHex,
  originPixel,
  features,
  rimRing,
  committedAt,
  eta,
  worldTime,
}: ScanPingProps) {
  const clipId = useId()
  const front = echoFrontHexes(committedAt, eta, worldTime, rimRing)
  const frontPx = front * HEX_RANGE_PX
  const frontT = rimRing > 0 ? front / rimRing : 1
  const shadowed = new Set(planSweep(originHex, features, rimRing, worldTime).shadowed.map(hexKey))
  const returns = echoReturns(
    originHex,
    features.map((f) => featureLogicalHex(f, worldTime)),
    front,
    shadowed,
  )

  // The board disc's outer edge — nothing draws past the rim.
  const clipR = HEX_SIZE * (Math.sqrt(3) * rimRing + 1)

  return (
    <g data-testid="scan-ping" pointerEvents="none">
      <clipPath id={clipId}>
        <circle cx={0} cy={0} r={clipR} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {/* THE pulse: one ring at the returned-echo front, pinned at the
            emission hex — bright at the muzzle, thinning as it nears the rim
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
          {returns.map(({ hex, strength }) => {
            const c = hexToPixel(hex.q, hex.r)
            const x = c.x.toFixed(2)
            const y = c.y.toFixed(2)
            return (
              <g key={`r-${hex.q},${hex.r}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={HEX_SIZE * 0.3}
                  fill={SCAN_ECHO_RETURN}
                  stroke="none"
                  opacity={strength * strength}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={HEX_SIZE * (0.4 + 0.6 * (1 - strength))}
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
        r={HEX_SIZE * 0.35}
        fill="none"
        stroke={SCAN_SWEEP_BEAM}
        strokeWidth={1}
      />
    </g>
  )
}

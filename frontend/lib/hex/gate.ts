// Lane-gate geometry — the client mirror of backend/board/gate.go (#0008).
//
// Each charted lane meets a system's board at ONE fixed rim tile: the lane's
// galaxy-tier bearing projected onto the rim. The server is authoritative (it
// stamps gate tiles into system reads and arrival), so this mirror drives
// PREVIEWS only — the burn-to-gate path a depart preview draws. Pinned by
// /fixtures/board/cases.json (see fixtures.test.ts); ported from the Go
// arithmetic exactly.

import { type Hex, ringHexes } from './hex'

// laneGateHex returns the rim tile (ring === radius) where the lane from `self`
// toward `neighbor` meets self's board. Bearing = the lane's azimuth in the
// galaxy XY-disk (#0001 coords, z ignored); the gate is the rim hex whose board
// direction is angularly closest to it, ties to the earliest in ringHexes order.
export function laneGateHex(
  selfX: number,
  selfY: number,
  neighborX: number,
  neighborY: number,
  radius: number,
): Hex {
  if (radius <= 0) return { q: 0, r: 0 }
  const bearing = Math.atan2(neighborY - selfY, neighborX - selfX)
  let best: Hex = { q: 0, r: 0 }
  let bestDelta = Number.MAX_VALUE
  for (const h of ringHexes(radius)) {
    const [hx, hy] = hexDirection(h)
    const delta = angleDelta(Math.atan2(hy, hx), bearing)
    if (delta < bestDelta) {
      bestDelta = delta
      best = h
    }
  }
  return best
}

// hexDirection is a hex's cartesian direction in the pointy-top board layout
// (matching pixel.ts hexToPixel), screen-down y negated so galactic-north maps
// to the top of the board. Scale-free — only the direction matters.
function hexDirection(h: Hex): [number, number] {
  return [Math.sqrt(3) * (h.q + h.r / 2), -1.5 * h.r]
}

// angleDelta is the absolute smallest angle between two bearings, in [0, π].
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI)
  if (d < 0) d += 2 * Math.PI
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

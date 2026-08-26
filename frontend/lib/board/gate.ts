// Lane-gate geometry — the client mirror of backend/board/gate.go (#0008).
//
// Each charted lane meets a system's board at ONE fixed cell: the lane's
// galaxy-tier bearing projected onto the gate ring (the inner edge of the
// outer band, 3 rings in from the rim — 2026-07-14 decision). The server is
// authoritative (it stamps gate cells into system reads and arrival), so this
// mirror drives PREVIEWS only. Pinned by /fixtures/board/cases.json; ported
// from the Go arithmetic exactly.

import type { Cell } from './board'
import { schedule } from './board'
import { slotsForRing } from '@/lib/polar'
import { tablePoints } from './table'

// gateRing is the ring a lane mouth sits on: three rings in from the rim,
// clamped to a valid interior ring. Mirror of board.GateRing — keep the two
// in lock-step.
export function gateRing(radius: number): number {
  return Math.max(1, radius - 3)
}

// laneGateCell returns the cell on the gate ring (gateRing(radius)) where the
// lane from `self` toward `neighbor` meets self's board (Go:
// board.LaneGateCell; openspec board-tactical-math, "Deterministic Lane Gate
// Projection"). Bearing = the lane's azimuth in the galaxy XY-disk (#0001
// coords, z ignored); the gate is the gate-ring slot whose pinned-table
// direction has the maximum dot product with that bearing, ties to the lower
// slot index. The bearing floats are rule-bearing only through this
// discretized argmax (cross-stack-determinism's discretized-choice
// requirement; near-tie register entry
// docs/defects/2026-08-25-lanegate-near-tie-divergence.md). JS rounds every
// operation separately, so the product-then-add below matches Go's
// explicitly-converted (fusion-inhibited) form.
export function laneGateCell(
  selfX: number,
  selfY: number,
  neighborX: number,
  neighborY: number,
  radius: number,
): Cell {
  if (radius <= 0) return { ring: 0, slot: 0 }
  const ring = gateRing(radius)
  const slots = slotsForRing(ring, schedule(radius))
  const points = tablePoints(slots)
  const bx = neighborX - selfX
  const by = neighborY - selfY
  let best = 0
  let bestDot = dot(points[0], bx, by) // determinism:allow(discretized)
  for (let slot = 1; slot < slots; slot++) {
    const d = dot(points[slot], bx, by) // determinism:allow(discretized)
    if (d > bestDot) {
      bestDot = d
      best = slot
    }
  }
  return { ring, slot: best }
}

// dot is the pinned-table direction's dot product with a bearing vector —
// each product rounds separately before the add, matching the Go side's
// forced intermediate rounding.
function dot(p: [number, number], bx: number, by: number): number {
  return p[0] * bx + p[1] * by // determinism:allow(discretized)
}

// arc-scan — the math behind ArcScan, the rotating-beam flavor of scanning:
// a beam turning about the antenna, the cells in its angular wake glowing and
// fading. NOT currently wired to a verb — the slice scan is the radial ping
// (scan-ping.ts / ScanPing, #0006 Decision #22) — but kept apart and alive as
// a future scan variant (arc-scan as its own verb, or the deferred
// directional cone's picture). Pure math; rendering lives in ArcScan.

import {
  cellKey,
  cellToPoint,
  distance,
  ringCells,
  type Cell,
  type Point,
  type Schedule,
} from '@/lib/board'

// ARC_TUNING — the arc's theater-only dials, tuning.go-style.
export const ARC_TUNING = {
  // Whole revolutions the beam completes over one scan window.
  revolutionsPerScan: 2,
  // The trailing glow window, in degrees: cells the beam passed within this
  // window are still lit, fading linearly to nothing at its trailing edge.
  trailDeg: 100,
  // The leading blade: the narrow filled wedge just behind the beam head that
  // bridges the cell-granular trail into a continuous sweep, in degrees.
  bladeDeg: 22,
}

// sweepHeadingDeg — the beam's heading at worldTime, in SVG degrees (0 = +x,
// increasing clockwise on screen since SVG y points down), normalized to
// [0, 360). Starts at 0 the instant the window opens and turns
// revolutionsPerScan times over it.
export function sweepHeadingDeg(committedAt: number, eta: number, worldTime: number): number {
  const duration = eta - committedAt
  if (duration <= 0) return 0
  const turns = ((worldTime - committedAt) / duration) * ARC_TUNING.revolutionsPerScan
  return ((turns % 1) + 1) % 1 * 360
}

// angularLagDeg — how far behind the beam head an angle sits, in [0, 360).
// 0 = at the head; small = just swept.
export function angularLagDeg(headingDeg: number, angleDeg: number): number {
  return ((headingDeg - angleDeg) % 360 + 360) % 360
}

export interface TrailCell {
  cell: Cell
  // 1 at the beam head, fading linearly to 0 at the window's trailing edge.
  glow: number
}

// sweepTrail — the cells currently glowing in the beam's wake: every cell
// within reach whose bearing from the antenna lags the head by less than the
// trail window. Shadowed cells (no line of sight — scan-preview's planSweep)
// never light. `originPx` is the drawn pivot (a gliding fleet's screen point)
// so the trail's bearings match the beam exactly; it defaults to the cell
// centre.
export function sweepTrail(
  origin: Cell,
  rimRing: number,
  headingDeg: number,
  shadowed: Set<string>,
  s: Schedule,
  reachCells: number = Infinity,
  originPx?: Point,
): TrailCell[] {
  const pivot = originPx ?? cellToPoint(origin, s)
  const out: TrailCell[] = []
  for (let ring = 0; ring <= rimRing; ring++) {
    for (const cell of ringCells(ring, s)) {
      if (shadowed.has(cellKey(cell))) continue
      if (distance(origin, cell, s) > reachCells) continue
      const c = cellToPoint(cell, s)
      const dx = c.x - pivot.x
      const dy = c.y - pivot.y
      // The cell under the antenna has no bearing.
      if (dx === 0 && dy === 0) continue
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const lag = angularLagDeg(headingDeg, angle)
      if (lag >= ARC_TUNING.trailDeg) continue
      out.push({ cell, glow: 1 - lag / ARC_TUNING.trailDeg })
    }
  }
  return out
}

// isAdjacent — the contiguity predicate, in integer arithmetic alone. The
// TypeScript mirror of backend/polar/adjacency.go (openspec
// polar-lattice-math, "Lattice Adjacency Is an Integer Predicate"); see that
// file's header for the derivation, the corner-contact rationale, and the
// deliberately preserved doubling-boundary looseness (open fork — the
// change's design.md Open Questions).

import { type PolarCell, type Schedule, slotsForRing } from './schedule'

export function isAdjacent(a: PolarCell, b: PolarCell, s: Schedule): boolean {
  if (Math.abs(a.ring - b.ring) > 1) return false
  if (a.ring <= 0 || b.ring <= 0) return true // ring difference alone decides at the core
  const sa = slotsForRing(a.ring, s)
  const sb = slotsForRing(b.ring, s)
  const d = Math.max(sa, sb)
  const m = Math.min(sa, sb)
  // Both slots scaled onto the finer ring's grid (the schedule's 1:2 steps
  // make d an exact multiple of both), then the wrapped shorter-way
  // separation g in 1/d-turn units; adjacent when g ≤ one coarse cell width,
  // cross-multiplied to stay integer.
  const pa = a.slot * (d / sa)
  const pb = b.slot * (d / sb)
  let g = (((pa - pb) % d) + d) % d
  g = Math.min(g, d - g)
  return g * m <= d
}

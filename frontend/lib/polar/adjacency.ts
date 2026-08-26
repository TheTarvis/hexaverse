// isAdjacent — the contiguity predicate, in integer arithmetic alone. The
// TypeScript mirror of backend/polar/adjacency.go (openspec
// board-tactical-math, "Lattice Adjacency Is True Corner Contact"); see that
// file's header for the derivation and the 2026-08-25 tightening from the
// loose spike-faithful bound to true corner contact (the two
// doubling-boundary phantom neighbors stop counting as adjacent; within a
// band and at the core the bounds coincide).

import { type PolarCell, type Schedule, slotsForRing } from './schedule'

export function isAdjacent(a: PolarCell, b: PolarCell, s: Schedule): boolean {
  if (Math.abs(a.ring - b.ring) > 1) return false
  if (a.ring <= 0 || b.ring <= 0) return true // ring difference alone decides at the core
  const sa = slotsForRing(a.ring, s)
  const sb = slotsForRing(b.ring, s)
  const d = Math.max(sa, sb)
  // Both slots scaled onto the finer ring's grid (the schedule's 1:2 steps
  // make d an exact multiple of both), then the wrapped shorter-way
  // separation g in 1/d-turn units. In those units cell widths are d/Sa and
  // d/Sb, so true corner contact `2g ≤ D/Sa + D/Sb` is already integer.
  const pa = a.slot * (d / sa)
  const pb = b.slot * (d / sb)
  let g = (((pa - pb) % d) + d) % d
  g = Math.min(g, d - g)
  return 2 * g <= d / sa + d / sb
}

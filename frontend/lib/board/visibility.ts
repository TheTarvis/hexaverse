// Line-of-sight + scan-beam geometry — the client mirror of
// backend/board/visibility.go (#0006 Decisions #15/#16: large bodies shadow
// everything strictly behind them along the straight chord between cell
// centers, for the aimed beam and the ambient bubble alike). Sight is a
// CHORD, not an arc — "behind the star" is a Euclidean statement — computed
// on the pinned coordinate table in exact integer arithmetic: squared
// distances, cross products, cross-multiplied comparisons in BigInt where
// products of squares exceed 2^53 — no runtime trig, no runtime sqrt, no
// floats. Pinned against /fixtures/board/cases.json — port the Go arithmetic
// exactly.

import { type Schedule, canonCell, slotsForRing } from '@/lib/polar'
import type { Cell } from './board'
import { TABLE_SCALE, cellCenter } from './table'

// Pinned occlusion radii, SQUARED, in squared table units — Go:
// board.StarOcclusionRadius2 / PlanetOcclusionRadius2. Tuning-owned gameplay
// constants; changing one is a rebalance and a fixture re-record.
export const STAR_OCCLUSION_RADIUS2 = TABLE_SCALE * TABLE_SCALE
export const PLANET_OCCLUSION_RADIUS2 = (TABLE_SCALE / 2) * (TABLE_SCALE / 2)

// Occluder is a shadow-casting body: its cell and its pinned SQUARED
// occlusion radius (the caller maps feature kind → radius).
export interface Occluder {
  cell: Cell
  radius2: number
}

// cellKey is the canonical string key for cell sets/maps ("ring:slot").
export function cellKey(c: Cell): string {
  return `${c.ring}:${c.slot}`
}

// lineOfSight reports whether target is visible from origin given the
// occluding bodies (Go: board.LineOfSight; openspec board-tactical-math,
// "Occlusion-Aware Line of Sight"). Blocked iff some occluder's center lies
// STRICTLY between origin and target along the chord (projection parameter
// strictly inside (0,1)) AND the chord passes within that occluder's pinned
// squared radius. An occluder's own cell, and everything in front of it,
// stays visible.
export function lineOfSight(origin: Cell, target: Cell, occluders: readonly Occluder[], s: Schedule): boolean {
  if (occluders.length === 0) return true
  const o = canonCell(origin, s)
  const t = canonCell(target, s)
  const [ox, oy] = cellCenter(o, slotsForRing(o.ring, s))
  const [tx, ty] = cellCenter(t, slotsForRing(t.ring, s))
  const dx = tx - ox
  const dy = ty - oy
  const d2 = dx * dx + dy * dy // ≤ (2·ring·2^16)² — exact in a double for any real board
  if (d2 === 0) return true // coincident centers — nothing can lie strictly between
  for (const oc of occluders) {
    const c = canonCell(oc.cell, s)
    const [cx, cy] = cellCenter(c, slotsForRing(c.ring, s))
    const px = cx - ox
    const py = cy - oy
    // Projection parameter t = (p·d)/d² strictly inside (0,1):
    const dotPD = px * dx + py * dy
    if (dotPD <= 0 || dotPD >= d2) continue
    // Chord within the radius: cross(p,d)² ≤ r²·d² — cross² exceeds 2^53, so
    // BigInt (still exact integers, still no sqrt — the comparison stays
    // squared).
    const cross = BigInt(px * dy - py * dx)
    const bound = BigInt(oc.radius2) * BigInt(d2)
    if (cross * cross <= bound) return false
  }
  return true
}

// BeamParams tunes the scan beam's corridor (#0006 Decision #15) — Go:
// board.BeamParams. All values exact: half-width base in table units, spread
// a rational; no float knob survives the polar rewrite.
export interface BeamParams {
  halfWidthBase: number
  spreadNum: number
  spreadDen: number
  rimRing: number
}

// beamCells returns the scan beam's cell set (Go: board.BeamCells; openspec
// board-tactical-math, "Widening Scan Beam Corridor"): the cells at or
// within rimRing whose centers lie within the widening corridor around the
// ray from the origin cell's center through the aim cell's center, forward
// of the origin. An aim equal to the origin yields an empty beam. Output in
// (ring, slot) order.
//
// Membership: with p = cell − origin, d = aim − origin,
// A := sd·|cross(p,d)| − sn·(p·d) ≤ sd·base·|d|. The right side carries a
// lone |d| — an irrational root — so the comparison is decided as an integer
// comparison against the quadratic surd: A ≤ 0 is membership outright, and
// A > 0 is membership iff A² ≤ sd²·base²·d² (BigInt). Exact at every input.
export function beamCells(origin: Cell, aim: Cell, p: BeamParams, s: Schedule): Cell[] {
  const o = canonCell(origin, s)
  const a = canonCell(aim, s)
  if ((o.ring === a.ring && o.slot === a.slot) || p.spreadDen <= 0) return []
  const [ox, oy] = cellCenter(o, slotsForRing(o.ring, s))
  const [ax, ay] = cellCenter(a, slotsForRing(a.ring, s))
  const dx = ax - ox
  const dy = ay - oy
  const sdBase = BigInt(p.spreadDen) * BigInt(p.halfWidthBase)
  const bound = sdBase * sdBase * BigInt(dx * dx + dy * dy)

  const rim = Math.min(p.rimRing, s.maxRing)
  const out: Cell[] = []
  for (let ring = 0; ring <= rim; ring++) {
    const slots = slotsForRing(ring, s)
    for (let slot = 0; slot < slots; slot++) {
      const c: Cell = { ring, slot }
      const [cx, cy] = cellCenter(c, slots)
      const px = cx - ox
      const py = cy - oy
      const dotPD = px * dx + py * dy
      if (dotPD < 0) continue // behind the origin — the corridor is forward-only
      let cross = px * dy - py * dx
      if (cross < 0) cross = -cross
      const aVal = p.spreadDen * cross - p.spreadNum * dotPD
      if (aVal <= 0) {
        out.push(c)
        continue
      }
      const a2 = BigInt(aVal) * BigInt(aVal)
      if (a2 <= bound) out.push(c)
    }
  }
  return out
}

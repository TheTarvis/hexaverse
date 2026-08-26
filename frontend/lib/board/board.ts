// Board lattice surface — the client mirror of backend/board/board.go.
//
// Since the polar migration (rewrite-board-on-polar-lattice, 2026-08-25) the
// board computes on ring-and-slot polar cells: lib/polar is the lattice core
// (adjacency, arc paths, orbital advance); this module owns the tactical
// layer — the pinned production schedule, the hop metric, and the ring
// enumeration. The hex lattice, its axial/cube machinery, and routeAround
// are gone: a polar path structurally cannot cross the core unless an
// endpoint is the core.
//
// This module is one side of a determinism seam: the Go backend owns the
// same math, and /fixtures/board/cases.json is the recorded contract both
// sides must reproduce byte-for-byte (see fixtures.test.ts). Every function
// here is ported from the Go arithmetic exactly.

import {
  type PolarCell,
  type Schedule,
  bandedSchedule,
  canonCell,
  isAdjacent,
  normalizeSlot,
  slotsForRing,
} from '@/lib/polar'

// Cell is a board position: an integer (ring, slot) pair on the polar
// lattice. Ring 0 is the single core cell (the star).
export type Cell = PolarCell
export type { Schedule }

// The production slot schedule is PINNED to Isotropic (openspec
// board-tactical-math, "The Production Slot Schedule Is Pinned to
// Isotropic"; settled 2026-08-25). The values live here and in
// backend/board/board.go — the lattice core stays value-agnostic.
export const INNER_SLOTS = 6

// doubleAt returns the pinned doubling boundaries — a fresh array each call
// so no caller can mutate the pinned values.
export function doubleAt(): number[] {
  return [2, 3, 5, 9, 17]
}

// schedule builds the production slot schedule for a board of the given
// maximum ring (inclusive) — Go: board.Schedule. maxRing is per-system; the
// slot count of any given ring is the same under every maxRing.
export function schedule(maxRing: number): Schedule {
  return bandedSchedule(INNER_SLOTS, doubleAt(), maxRing)
}

// ringCells returns the cells on a ring in slot order — the fixed
// enumeration a stored slot index refers to on both sides of the seam.
export function ringCells(ring: number, s: Schedule): Cell[] {
  if (ring <= 0) return [{ ring: 0, slot: 0 }]
  const slots = slotsForRing(ring, s)
  const out: Cell[] = []
  for (let i = 0; i < slots; i++) out.push({ ring, slot: i })
  return out
}

// canon is a cell's canonical form under a schedule (Go: board.Canon).
export function canon(c: Cell, s: Schedule): Cell {
  return canonCell(c, s)
}

// distance is the lattice hop metric: the minimum number of adjacency steps
// between two cells — the graph metric induced by true corner contact
// (openspec board-tactical-math, "Lattice Hop Distance"; Go: board.Distance).
// Pure integer arithmetic (a breadth-first walk).
export function distance(a: Cell, b: Cell, s: Schedule): number {
  const ca = canonCell(a, s)
  const cb = canonCell(b, s)
  if (ca.ring === cb.ring && ca.slot === cb.slot) return 0
  const key = (c: Cell) => `${c.ring}:${c.slot}`
  const target = key(cb)
  const visited = new Set<string>([key(ca)])
  let frontier: Cell[] = [ca]
  let d = 0
  while (frontier.length > 0) {
    d++
    const next: Cell[] = []
    for (const c of frontier) {
      for (const nb of neighbors(c, s)) {
        const k = key(nb)
        if (visited.has(k)) continue
        if (k === target) return d
        visited.add(k)
        next.push(nb)
      }
    }
    frontier = next
  }
  return -1 // unreachable on a connected lattice; keeps the signature total
}

// neighbors enumerates the cells adjacent to c under the tight predicate, in
// a fixed (ring, slot) order — Go: board.neighbors.
export function neighbors(c: Cell, s: Schedule): Cell[] {
  const out: Cell[] = []
  const has = (x: Cell) => out.some((o) => o.ring === x.ring && o.slot === x.slot)
  for (let ring = c.ring - 1; ring <= c.ring + 1; ring++) {
    if (ring < 0 || ring > s.maxRing) continue
    if (ring === 0) {
      if (c.ring === 1) out.push({ ring: 0, slot: 0 })
      continue
    }
    if (c.ring === 0) {
      if (ring === 1) {
        for (let slot = 0; slot < slotsForRing(1, s); slot++) out.push({ ring: 1, slot })
      }
      continue
    }
    const slots = slotsForRing(ring, s)
    const cSlots = slotsForRing(c.ring, s)
    const scaled = Math.trunc((c.slot * slots) / cSlots)
    for (let raw = scaled - 2; raw <= scaled + 3; raw++) {
      const nb: Cell = { ring, slot: normalizeSlot(raw, slots) }
      if (nb.ring === c.ring && nb.slot === c.slot) continue
      if (isAdjacent(c, nb, s) && !has(nb)) out.push(nb)
    }
  }
  return out
}

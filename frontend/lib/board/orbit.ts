// Orbital position — the client mirror of backend/board/orbit.go.
//
// A body's live cell is a pure function of (Orbit, worldTime): position is
// computed, never stored per tick (#0003 Decision #5, #0007 "positions are
// computed, never polled"). Advance and back-solve delegate to lib/polar's
// integer arithmetic over the ring's scheduled slot count; this must
// reproduce OrbState from the Go side exactly — the golden in
// /fixtures/board/cases.json asserts it.

import { type Schedule, cellAt, orbitThrough as polarOrbitThrough } from '@/lib/polar'
import type { Cell } from './board'
import { canon } from './board'

// Orbit holds a body's orbital elements. angle0 is the ring's slot index at
// the world epoch; period is world-milliseconds for one full revolution; dir
// is +1 / −1 (0 coerced to +1). The stored shape predates the polar
// migration and persists unchanged.
export interface Orbit {
  ring: number
  angle0: number
  period: number
  dir: number
}

// orbState returns the body's cell at a given world time (Go: board.OrbState)
// — polar's cellAt over the ring's scheduled slot count. With a very large
// period (motion off/slow) the body sits at its epoch slot — the board reads
// static.
export function orbState(o: Orbit, worldTime: number, s: Schedule): Cell {
  return cellAt({ ring: o.ring, epochSlot: o.angle0, period: o.period, dir: o.dir }, worldTime, s)
}

// orbitThrough builds an orbit on c's ring that passes through c AT `at` —
// the orbit a thing inherits when it comes to rest "here, now" (Go:
// board.OrbitThrough). angle0 is epoch-anchored, so the advance runs
// BACKWARDS from `at`; evaluating the result at `at` yields exactly c.
export function orbitThrough(c: Cell, at: number, period: number, dir: number, s: Schedule): Orbit {
  const o = polarOrbitThrough(c, at, period, dir, s)
  return { ring: o.ring, angle0: o.epochSlot, period: o.period, dir: o.dir }
}

// angleOf returns the ring and slot index of a cell — the inverse of placing
// a body on a ring (Go: board.AngleOf). The core is ring 0, index 0.
export function angleOf(c: Cell, s: Schedule): { ring: number; index: number } {
  const cc = canon(c, s)
  return { ring: cc.ring, index: cc.slot }
}

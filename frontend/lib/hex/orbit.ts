// Orbital position — the client mirror of backend/board/orbit.go.
//
// A body's live hex is a pure function of (Orbit, worldTime): position is
// computed, never stored per tick (#0003 Decision #5, #0007 "positions are
// computed, never polled"). This must reproduce OrbState from the Go side
// exactly — the golden in /fixtures/board/cases.json asserts it.

import type { Hex } from './hex'
import { ringHexes, ringOf } from './hex'

// Orbit holds a body's orbital elements. angle0 is the ring-position index at
// the world epoch; period is world-milliseconds for one full revolution; dir is
// +1 / -1.
export interface Orbit {
  ring: number
  angle0: number
  period: number
  dir: number
}

// orbState returns the body's hex at a given world time. A full revolution
// (period) advances 6*ring ring positions. With a very large period (motion
// off/slow for the slice) the body sits at its epoch angle — the board reads
// static.
export function orbState(o: Orbit, worldTime: number): Hex {
  if (o.ring <= 0) return { q: 0, r: 0 }
  const steps = 6 * o.ring
  let idx = o.angle0
  if (o.period > 0) {
    const dir = o.dir === 0 ? 1 : o.dir
    // Integer-only advance in BigInt, matching Go's int64 truncating division
    // exactly. Two reasons it must be BigInt, not float: (1) periods can exceed
    // Number.MAX_SAFE_INTEGER — the "motion off" bodies use 1<<60 — and (2) Go
    // truncates toward zero; float division + rounding would drift the index.
    const advanced = (BigInt(Math.trunc(worldTime)) * BigInt(steps)) / BigInt(Math.trunc(o.period))
    idx = o.angle0 + dir * Number(advanced)
  }
  const ring = ringHexes(o.ring)
  const n = ring.length
  idx = ((idx % n) + n) % n
  return ring[idx]
}

// orbitThrough builds an orbit on h's ring that passes through h AT `at` — the
// orbit a thing inherits when it comes to rest "here, now" (Go: board.OrbitThrough).
// angle0 is epoch-anchored, so the advance is run BACKWARDS from `at`; storing the
// raw index would teleport the thing when orbState re-advanced it from the epoch.
// Same BigInt truncating math as orbState so the round-trip
// orbState(orbitThrough(h, at, …), at) === h is exact.
export function orbitThrough(h: Hex, at: number, period: number, dir: number): Orbit {
  const { ring, index } = angleOf(h)
  const d = dir === 0 ? 1 : dir
  if (ring <= 0) return { ring, angle0: 0, period, dir: d }
  const steps = 6 * ring
  let angle0 = index
  if (period > 0) {
    const advanced = (BigInt(Math.trunc(at)) * BigInt(steps)) / BigInt(Math.trunc(period))
    angle0 = index - d * Number(advanced)
  }
  angle0 = ((angle0 % steps) + steps) % steps
  return { ring, angle0, period, dir: d }
}

// angleOf returns the ring and ring-position index of a hex — the inverse of
// placing a body on a ring (Go: board.AngleOf). Used to derive a coast orbit
// for a fleet from the hex it's resting on. The centre is ring 0, index 0.
export function angleOf(h: Hex): { ring: number; index: number } {
  const ring = ringOf(h)
  if (ring === 0) return { ring: 0, index: 0 }
  const hexes = ringHexes(ring)
  for (let i = 0; i < hexes.length; i++) {
    if (hexes[i].q === h.q && hexes[i].r === h.r) return { ring, index: i }
  }
  return { ring, index: 0 }
}

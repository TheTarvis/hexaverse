// Orbital advance and its back-solve on the polar lattice — the TypeScript
// mirror of backend/polar/orbit.go (openspec polar-lattice-math, "Orbital
// Advance Is Integer Arithmetic Over the Ring's Slot Count" / "Orbit
// Back-Solve Settles Without Teleporting").
//
// BigInt, for the same two reasons lib/hex/orbit.ts uses it: periods and
// world times can exceed Number.MAX_SAFE_INTEGER, and Go truncates int64
// division while float division + rounding would drift the index. Unlike
// lib/hex/orbit.ts (and the spike's orbCellAt), the modulo reduction onto
// the ring ALSO happens in BigInt, BEFORE the Number conversion — the
// convert-then-reduce shape is unreachable at plausible world times but
// wrong in principle, and this mirror does not inherit it by copy.

import { type PolarCell, type Schedule, normalizeSlot, slotsForRing } from './schedule'

// PolarOrbit holds a body's orbital elements. epochSlot is the slot index at
// the WORLD EPOCH (never "now" — see orbitThrough); period is world-ms for
// one full revolution; dir is +1 / −1, with 0 treated as +1 everywhere (0 is
// what a fresh body deserializes with; an unspecified coercion here would be
// a silent seam fork on the most common input, so the spec pins it).
//
// No period law is implied: the polar period law under a banded schedule is
// an OPEN question (the change's design.md), so period is taken as given and
// never derived from ring.
export interface PolarOrbit {
  ring: number
  epochSlot: number
  period: number
  dir: number
}

// cellAt is the body's cell at a world time — the truncating integer
// quotient ⌊worldTime × slots ÷ period⌋ advances the epoch slot in the
// configured direction. worldTime is measured from the world epoch and
// non-negative; a period ≤ 0 leaves the body motionless at its epoch slot;
// ring 0 always resolves to the core.
export function cellAt(o: PolarOrbit, worldTime: number, s: Schedule): PolarCell {
  if (o.ring <= 0) return { ring: 0, slot: 0 }
  const slots = slotsForRing(o.ring, s)
  if (o.period <= 0) return { ring: o.ring, slot: normalizeSlot(o.epochSlot, slots) }
  const dir = BigInt(o.dir === 0 ? 1 : o.dir)
  const slotsB = BigInt(slots)
  const advanced = (BigInt(Math.trunc(worldTime)) * slotsB) / BigInt(Math.trunc(o.period))
  const idx = BigInt(o.epochSlot) + dir * advanced
  return { ring: o.ring, slot: Number(((idx % slotsB) + slotsB) % slotsB) }
}

// orbitThrough is the back-solve: the orbit a body inherits when it settles
// onto a cell at world time `at`. epochSlot is epoch-anchored, so the
// advance runs BACKWARDS from `at` — storing the raw settle slot would
// teleport the body when cellAt re-advanced it from the epoch. Same
// truncating BigInt arithmetic as cellAt, so the round-trip
// cellAt(orbitThrough(c, at, …), at) reproduces c exactly, never a
// different slot.
export function orbitThrough(
  c: PolarCell,
  at: number,
  period: number,
  dir: number,
  s: Schedule,
): PolarOrbit {
  const d = dir === 0 ? 1 : dir
  if (c.ring <= 0) return { ring: 0, epochSlot: 0, period, dir: d }
  const slots = slotsForRing(c.ring, s)
  const slotsB = BigInt(slots)
  let epoch = BigInt(normalizeSlot(c.slot, slots))
  if (period > 0) {
    const advanced = (BigInt(Math.trunc(at)) * slotsB) / BigInt(Math.trunc(period))
    epoch -= BigInt(d) * advanced
  }
  return { ring: c.ring, epochSlot: Number(((epoch % slotsB) + slotsB) % slotsB), period, dir: d }
}

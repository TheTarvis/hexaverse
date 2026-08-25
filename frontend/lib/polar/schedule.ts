// The polar (ring-and-slot) lattice — production-shaped TypeScript mirror of
// backend/polar (openspec capability: polar-lattice-math). Deliberately
// separate from lib/hex (the incumbent cube lattice, untouched) and from
// app/spike/polar-board/polar.ts (the exploratory bench, which stays
// float-based and rendering-oriented). This module has ZERO consumers by
// design: it exists so /fixtures/polar/cases.json can assert Go↔TS parity
// before any consumer migrates.
//
// The discipline (openspec cross-stack-determinism): every rule-bearing
// value is integer or exact rational through to its final rounding. Angles
// are rational turns, never radians; no trig, no sqrt, no Math.round
// anywhere in this module's rule-bearing surface.

// A board position: an integer (ring, slot) pair. Ring 0 is the single core
// cell and carries no angular index — its canonical form is always {0, 0}.
export interface PolarCell {
  ring: number
  slot: number
}

// Schedule assigns every ring in [0, maxRing] (inclusive) a positive integer
// slot count — counts[ring]. A configured parameter, never a hard-coded
// value: the actual band list and inner slot count are Decision 2 of the
// polar migration handoff and remain OPEN. The structural invariant
// (openspec polar-lattice-math, "Slot Schedule Shape"): ring 0 has exactly
// one slot; every ring ≥ 1 at least 2; among rings ≥ 1 the count is constant
// within a band and exactly doubles at each boundary — radial neighbors are
// 1:1 or 2:1, never fractional. The ring-0→ring-1 step is exempt from the
// ratio rule.
export interface Schedule {
  maxRing: number
  counts: number[]
}

// bandedSchedule builds the banded schedule the spike parameterizes:
// innerSlots on ring 1, doubling at each ring listed in doubleAt, out to
// maxRing inclusive. A constructor convenience; the result must still pass
// validateSchedule.
export function bandedSchedule(innerSlots: number, doubleAt: number[], maxRing: number): Schedule {
  const counts: number[] = []
  for (let ring = 0; ring <= maxRing; ring++) {
    if (ring === 0) {
      counts.push(1)
      continue
    }
    let n = innerSlots
    for (const boundary of doubleAt) {
      if (ring >= boundary) n *= 2
    }
    counts.push(n)
  }
  return { maxRing, counts }
}

// validateSchedule mirrors Go's Schedule.Validate: null means valid, a
// string describes the violation (the message is diagnostic, not part of the
// cross-language contract — only validity is).
export function validateSchedule(s: Schedule): string | null {
  if (s.maxRing < 0) return `schedule maxRing ${s.maxRing} is negative`
  if (s.counts.length !== s.maxRing + 1) {
    return `schedule declares maxRing ${s.maxRing} but configures ${s.counts.length} ring count(s)`
  }
  if (s.counts[0] !== 1) return `ring 0 must have slot count 1, got ${s.counts[0]}`
  for (let ring = 1; ring <= s.maxRing; ring++) {
    if (!Number.isInteger(s.counts[ring]) || s.counts[ring] < 2) {
      return `ring ${ring} has slot count ${s.counts[ring]}; rings at or above ring 1 need at least 2`
    }
  }
  for (let ring = 2; ring <= s.maxRing; ring++) {
    const inner = s.counts[ring - 1]
    const outer = s.counts[ring]
    if (outer !== inner && outer !== 2 * inner) {
      return `rings ${ring - 1}→${ring} step ${inner}→${outer}; the ratio must be exactly 1 or 2`
    }
  }
  return null
}

// slotsForRing is the schedule applied. Ring 0 (and any negative input) is
// the core — one slot. A ring beyond the schedule's declared maxRing is a
// programmer error, not a lattice answer.
export function slotsForRing(ring: number, s: Schedule): number {
  if (ring <= 0) return 1
  if (ring > s.maxRing) {
    throw new Error(`polar: ring ${ring} is outside the schedule's declared maxRing ${s.maxRing}`)
  }
  return s.counts[ring]
}

// normalizeSlot wraps a raw slot index into [0, slots), in both directions.
export function normalizeSlot(slot: number, slots: number): number {
  return ((slot % slots) + slots) % slots
}

// canonCell is a cell's canonical form under a schedule: ring 0 collapses to
// the single core cell, other rings wrap the slot index.
export function canonCell(c: PolarCell, s: Schedule): PolarCell {
  if (c.ring <= 0) return { ring: 0, slot: 0 }
  return { ring: c.ring, slot: normalizeSlot(c.slot, slotsForRing(c.ring, s)) }
}

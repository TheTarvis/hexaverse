// arcPath — the lattice's straight line, which is an arc. The TypeScript
// mirror of backend/polar's ArcPath; see that file's header for the full
// derivation. Summary of the contract (openspec polar-lattice-math, "A
// Straight Path Is an Arc"):
//
//  - interpolate ring and angle between the endpoints in exact integer
//    arithmetic (angles in 1/L turns, L = the slot count of the FINEST —
//    outermost — ring the path spans; the schedule's 1:2 steps make every
//    endpoint angle an exact integer in those units);
//  - resolve the RING at each sample first, then the angularly nearest slot
//    on that rounded ring;
//  - one sample per cell the path must cross, measured against the finest
//    ring spanned, NOT the mean ring (mean-ring undersamples the outer,
//    finer-slotted portion and emits non-adjacent slot jumps);
//  - shorter-direction sweep; three fixed tie rules: ring tie → toward the
//    destination ring; slot tie → the sweep's direction of travel, and with
//    zero sweep (every purely radial path, core endpoints included) → the
//    HIGHER candidate before normalization (so last-slot-vs-0 wraps to 0);
//    exact half-turn → always the increasing-slot-index direction;
//  - a core endpoint sweeps no angle (inherits the other end's bearing);
//    the interpolated ring never rounds below the inner endpoint's ring, so
//    a path only reaches the core if an endpoint IS the core.
//
// Number (not BigInt) arithmetic: every intermediate here is an integer
// bounded by n·L·slots ≲ counts³ — exact in an IEEE double for any remotely
// plausible schedule (it would take ring slot counts beyond ~200,000 to
// approach 2^53). Orbit advance is different (world times reach 2^53) and
// uses BigInt — see orbit.ts.

import { type PolarCell, type Schedule, canonCell, normalizeSlot, slotsForRing } from './schedule'

// floorDiv is ⌊a/b⌋ for integers with b > 0, computed exactly: % on safe
// integers is exact, and (a − mod) is an exact multiple of b, so the final
// division is exact — never trust Math.floor(a / b) at a near-integer ratio.
export function floorDiv(a: number, b: number): number {
  let m = a % b
  if (m !== 0 && m < 0 !== b < 0) m += b
  return (a - m) / b
}

export function arcPath(fromRaw: PolarCell, toRaw: PolarCell, s: Schedule): PolarCell[] {
  const from = canonCell(fromRaw, s)
  const to = canonCell(toRaw, s)
  if (from.ring === to.ring && from.slot === to.slot) return [from]

  const finest = Math.max(from.ring, to.ring)
  const bigL = slotsForRing(finest, s)

  // Endpoint angles in 1/L turns; a core endpoint inherits the other end's
  // bearing (purely radial departure/arrival). Both-core is caught above.
  let aFrom = from.ring > 0 ? from.slot * (bigL / slotsForRing(from.ring, s)) : 0
  let aTo = to.ring > 0 ? to.slot * (bigL / slotsForRing(to.ring, s)) : 0
  if (from.ring === 0) aFrom = aTo
  if (to.ring === 0) aTo = aFrom

  // Shorter-direction sweep, wrapped into (−L/2, L/2]. An exact half turn
  // (2d === L) keeps +L/2 — the increasing-slot-index direction (tie rule 3).
  let d = (((aTo - aFrom) % bigL) + bigL) % bigL
  if (2 * d > bigL) d -= bigL

  const dr = to.ring - from.ring
  const n = Math.max(2, Math.abs(dr), Math.abs(d))

  const out: PolarCell[] = []
  for (let i = 0; i <= n; i++) {
    // Ring first. rn is non-negative, so plain integer division floors.
    const rn = from.ring * n + dr * i
    const q = (rn - (rn % n)) / n
    const rem = rn % n
    let ring: number
    if (2 * rem < n) ring = q
    else if (2 * rem > n) ring = q + 1
    else ring = dr > 0 ? q + 1 : q // exact halfway — toward the destination ring

    let cell: PolarCell
    if (ring <= 0) {
      cell = { ring: 0, slot: 0 }
    } else {
      // Then the angle on the rounded ring: nearest slot k minimizes
      // |angle − k/slotCount|, i.e. k = round(x/den) with the tie rules.
      const slotCount = slotsForRing(ring, s)
      const x = (aFrom * n + d * i) * slotCount
      const den = n * bigL
      let k = floorDiv(x, den)
      const krem = x - k * den
      if (2 * krem > den) {
        k++
      } else if (2 * krem === den) {
        // exactly equidistant — tie rule 2
        if (d > 0) k++ // sweep travels toward increasing slots
        else if (d === 0) k++ // zero sweep: the higher candidate; wrap → slot 0
        // d < 0: the lower candidate (k) stands
      }
      cell = { ring, slot: normalizeSlot(k, slotCount) }
    }

    const last = out[out.length - 1]
    if (!last || last.ring !== cell.ring || last.slot !== cell.slot) out.push(cell)
  }
  return out
}

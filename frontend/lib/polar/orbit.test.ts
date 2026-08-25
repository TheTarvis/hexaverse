import { describe, expect, it } from 'vitest'
import { cellAt, orbitThrough } from './orbit'
import { canonCell, normalizeSlot, slotsForRing } from './schedule'
import { tight6 } from './schedule.test'

describe('orbit', () => {
  it('advances by the truncating integer quotient', () => {
    expect(cellAt({ ring: 2, epochSlot: 3, period: 12_000, dir: 1 }, 12_000, tight6)).toEqual({ ring: 2, slot: 3 })
    expect(cellAt({ ring: 2, epochSlot: 3, period: 12_000, dir: 1 }, 6_000, tight6)).toEqual({ ring: 2, slot: 9 })
    expect(cellAt({ ring: 1, epochSlot: 0, period: 7, dir: 1 }, 6, tight6)).toEqual({ ring: 1, slot: 5 }) // 36/7 → 5, truncated
    expect(cellAt({ ring: 1, epochSlot: 0, period: 6, dir: 0 }, 1, tight6)).toEqual({ ring: 1, slot: 1 }) // dir 0 ⇒ +1
    expect(cellAt({ ring: 1, epochSlot: 0, period: 6, dir: -1 }, 1, tight6)).toEqual({ ring: 1, slot: 5 })
    expect(cellAt({ ring: 4, epochSlot: 7, period: 0, dir: 1 }, 2 ** 50, tight6)).toEqual({ ring: 4, slot: 7 })
    expect(cellAt({ ring: 4, epochSlot: 7, period: -5, dir: 1 }, 99_999, tight6)).toEqual({ ring: 4, slot: 7 })
    expect(cellAt({ ring: 0, epochSlot: 5, period: 1000, dir: -1 }, 123_456, tight6)).toEqual({ ring: 0, slot: 0 })
  })

  it('stays exact where a float intermediate would not (beyond 2^53)', () => {
    // worldTime × slots ≈ 2.5×10^17 — above MAX_SAFE_INTEGER; BigInt keeps
    // the quotient exact where Math.floor(t * slots / period) would round.
    const o = { ring: 9, epochSlot: 0, period: 96, dir: 1 } // 96 slots
    const t = 2_600_000_000_000_000
    expect(cellAt(o, t, tight6)).toEqual({
      ring: 9,
      slot: Number(((BigInt(t) * BigInt(96)) / BigInt(96)) % BigInt(96)),
    })
  })

  it('back-solve settles without teleporting, and still drifts afterward', () => {
    const periods = [1, 7, 12, 5_000, 1_000_000_000_000_000]
    for (let ring = 0; ring <= 6; ring++) {
      for (let slot = 0; slot < slotsForRing(ring, tight6); slot++) {
        for (const period of periods) {
          for (const dir of [-1, 1]) {
            const at = Math.floor(period / 3)
            const o = orbitThrough({ ring, slot }, at, period, dir, tight6)
            expect(cellAt(o, at, tight6)).toEqual(canonCell({ ring, slot }, tight6))
          }
        }
      }
    }
    // drift: ring 4 (24 slots), period 48 000 — one slot per 2 000 ms
    const o = orbitThrough({ ring: 4, slot: 7 }, 10_123, 48_000, 1, tight6)
    expect(cellAt(o, 12_000, tight6)).toEqual({ ring: 4, slot: normalizeSlot(8, 24) })
    expect(cellAt(o, 10_123 + 48_000, tight6)).toEqual({ ring: 4, slot: 7 })
  })

  it('the core back-solves to the core', () => {
    const o = orbitThrough({ ring: 0, slot: 0 }, 987_654, 12_000, 1, tight6)
    for (const t of [0, 1, 987_654, 10_000_000]) {
      expect(cellAt(o, t, tight6)).toEqual({ ring: 0, slot: 0 })
    }
  })
})

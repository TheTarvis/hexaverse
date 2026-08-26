import { describe, expect, it } from 'vitest'
import { schedule } from './board'
import { angleOf, orbState, orbitThrough } from './orbit'

const s = schedule(10)

describe('orbState', () => {
  it('a full period returns to the epoch slot; half advances half the slots', () => {
    const o = { ring: 2, angle0: 3, period: 12_000, dir: 1 }
    expect(orbState(o, 12_000, s)).toEqual({ ring: 2, slot: 3 })
    expect(orbState(o, 6_000, s)).toEqual({ ring: 2, slot: 9 }) // 12 slots, +6
  })
  it('a non-positive period is motionless; ring 0 is the core; dir 0 is prograde', () => {
    expect(orbState({ ring: 4, angle0: 7, period: 0, dir: 1 }, 99_999, s)).toEqual({ ring: 4, slot: 7 })
    expect(orbState({ ring: 0, angle0: 5, period: 1_000, dir: -1 }, 123_456, s)).toEqual({ ring: 0, slot: 0 })
    expect(orbState({ ring: 1, angle0: 0, period: 6, dir: 0 }, 1, s)).toEqual(
      orbState({ ring: 1, angle0: 0, period: 6, dir: 1 }, 1, s),
    )
  })
})

describe('orbitThrough', () => {
  it('the settled orbit reproduces the settle cell exactly', () => {
    for (const c of [
      { ring: 4, slot: 7 },
      { ring: 2, slot: 5 },
      { ring: 0, slot: 0 },
    ]) {
      for (const [at, period, dir] of [
        [123_456, 48_000, -1],
        [10, 7, 1],
        [987_654, 12_000, 1],
      ]) {
        const o = orbitThrough(c, at, period, dir, s)
        expect(orbState(o, at, s)).toEqual(c.ring <= 0 ? { ring: 0, slot: 0 } : c)
      }
    }
  })
})

describe('angleOf', () => {
  it('inverts cell placement, canonicalized', () => {
    expect(angleOf({ ring: 3, slot: 5 }, s)).toEqual({ ring: 3, index: 5 })
    expect(angleOf({ ring: 3, slot: 29 }, s)).toEqual({ ring: 3, index: 5 }) // wraps (24 slots)
    expect(angleOf({ ring: 0, slot: 9 }, s)).toEqual({ ring: 0, index: 0 })
  })
})

import { describe, it, expect } from 'vitest'
import { angleOf, orbState, type Orbit } from './orbit'
import { ringHexes } from './hex'

// Behaviour of the orbital clock. fixtures.test.ts asserts the exact golden
// hexes; these assert the motion semantics — quantized stepping, direction,
// ring wrap, and the "motion off" collapse that keeps a large period static.

describe('orbState', () => {
  it('parks at the epoch angle when motion is off (period beyond safe-integer)', () => {
    const still: Orbit = { ring: 3, angle0: 2, period: 2 ** 60, dir: 1 }
    const at0 = orbState(still, 0)
    expect(at0).toEqual(ringHexes(3)[2]) // sits on its epoch index
    expect(orbState(still, 5_000_000)).toEqual(at0) // and never moves
  })

  it('advances prograde by whole ring-steps and wraps a full revolution', () => {
    const ring = ringHexes(2) // 12 cells; period 12_000ms = one revolution
    const o: Orbit = { ring: 2, angle0: 0, period: 12_000, dir: 1 }
    expect(orbState(o, 0)).toEqual(ring[0])
    expect(orbState(o, 1_000)).toEqual(ring[1]) // 12 steps/rev → 1000ms/step
    expect(orbState(o, 12_000)).toEqual(ring[0]) // wraps back to the start
  })

  it('advances retrograde in the opposite direction', () => {
    const ring = ringHexes(2)
    const o: Orbit = { ring: 2, angle0: 0, period: 12_000, dir: -1 }
    expect(orbState(o, 1_000)).toEqual(ring[ring.length - 1])
  })

  it('quantizes between steps — the logical hex flips only at whole steps', () => {
    const ring = ringHexes(2)
    const o: Orbit = { ring: 2, angle0: 0, period: 12_000, dir: 1 }
    expect(orbState(o, 999)).toEqual(ring[0]) // still on step 0
    expect(orbState(o, 1_000)).toEqual(ring[1]) // ticks to step 1
  })
})

describe('angleOf', () => {
  it('is the inverse of placing a hex on its ring', () => {
    const ring = ringHexes(2)
    for (let i = 0; i < ring.length; i++) {
      expect(angleOf(ring[i])).toEqual({ ring: 2, index: i })
    }
  })

  it('returns the centre for the star hex', () => {
    expect(angleOf({ q: 0, r: 0 })).toEqual({ ring: 0, index: 0 })
  })
})

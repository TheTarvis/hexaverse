import { describe, it, expect } from 'vitest'
import { hexKey } from '@/lib/hex'
import { echoFrontHexes, echoReturns, PING_TUNING } from './scan-ping'

const COMMITTED = 1_000
const DURATION = 30_000
const ETA = COMMITTED + DURATION

describe('echoFrontHexes', () => {
  it('crosses the board over exactly the scan window — ScanDuration is the rim round-trip', () => {
    expect(echoFrontHexes(COMMITTED, ETA, COMMITTED, 16)).toBe(0)
    expect(echoFrontHexes(COMMITTED, ETA, COMMITTED + DURATION / 2, 16)).toBeCloseTo(8)
    expect(echoFrontHexes(COMMITTED, ETA, ETA, 16)).toBe(16)
  })

  it('re-paces itself off the window — retuning ScanDuration re-paces the front', () => {
    // A twice-as-long scan has a half-speed front at the same elapsed time.
    expect(echoFrontHexes(COMMITTED, COMMITTED + 2 * DURATION, COMMITTED + DURATION / 2, 16)).toBeCloseTo(4)
  })

  it('clamps outside the window instead of overshooting', () => {
    expect(echoFrontHexes(COMMITTED, ETA, COMMITTED - 5_000, 16)).toBe(0)
    expect(echoFrontHexes(COMMITTED, ETA, ETA + 5_000, 16)).toBe(16)
  })
})

describe('echoReturns', () => {
  const origin = { q: 0, r: 0 }
  const bodies = [
    { q: 4, r: 0 },
    { q: 0, r: 8 },
  ]

  it('flashes a body at full strength the instant the front reaches it, fading as it passes', () => {
    // Front exactly at the near body.
    const atHit = echoReturns(origin, bodies, 4, new Set())
    expect(atHit).toHaveLength(1)
    expect(atHit[0].hex).toEqual({ q: 4, r: 0 })
    expect(atHit[0].strength).toBeCloseTo(1)

    // One hex past it: decayed by 1/returnFadeHexes.
    const past = echoReturns(origin, bodies, 5, new Set())
    expect(past[0].strength).toBeCloseTo(1 - 1 / PING_TUNING.returnFadeHexes)
  })

  it('never flashes a body the front has not reached, and drops one fully faded', () => {
    expect(echoReturns(origin, bodies, 3.5, new Set())).toHaveLength(0)
    const gone = echoReturns(origin, bodies, 4 + PING_TUNING.returnFadeHexes, new Set())
    expect(gone.find((r) => r.hex.q === 4)).toBeUndefined()
  })

  it('never flashes a shadowed body or the antenna cell itself', () => {
    const shadowed = new Set([hexKey({ q: 4, r: 0 })])
    expect(echoReturns(origin, bodies, 5, shadowed)).toHaveLength(0)
    expect(echoReturns(origin, [{ q: 0, r: 0 }], 5, new Set())).toHaveLength(0)
  })
})

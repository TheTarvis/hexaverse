import { describe, it, expect } from 'vitest'
import { etaLabel, MS_PER_TILE, planToBody, planToHex } from './move-preview'
import { solveIntercept, type Orbit } from '@/lib/hex'

describe('planToHex', () => {
  it('routes a contiguous path and an ETA of distance × ms-per-tile', () => {
    const from = { q: 0, r: 0 }
    const dest = { q: 3, r: 0 }
    const plan = planToHex(from, dest, 1_000)
    expect(plan.kind).toBe('hex')
    expect(plan.tiles).toBe(3)
    expect(plan.path[0]).toEqual(from)
    expect(plan.path[plan.path.length - 1]).toEqual(dest)
    expect(plan.arriveTime).toBe(1_000 + 3 * MS_PER_TILE)
    expect(plan.etaMs).toBe(3 * MS_PER_TILE)
  })
})

describe('planToBody', () => {
  it('matches the underlying lib/hex intercept solve (the server contract)', () => {
    const from = { q: 0, r: 0 }
    const orbit: Orbit = { ring: 5, angle0: 0, period: 3_600_000, dir: 1 }
    const plan = planToBody(from, orbit, 0)
    const sol = solveIntercept(from, orbit, 0, MS_PER_TILE, 86_400_000)
    expect(plan.meetHex).toEqual(sol.meetHex)
    expect(plan.arriveTime).toBe(sol.arriveTime)
    // tiles is the routed path length (matches the ETA even around a detour).
    expect(plan.tiles).toBe(sol.path.length - 1)
  })
})

describe('etaLabel', () => {
  it('formats minutes and hours', () => {
    expect(etaLabel(3 * MS_PER_TILE)).toBe('3m')
    expect(etaLabel(90 * 60_000)).toBe('1h 30m')
    expect(etaLabel(120 * 60_000)).toBe('2h')
  })
})

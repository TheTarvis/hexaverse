import { describe, it, expect } from 'vitest'
import { solveHex, solveIntercept } from './intercept'
import { distance } from './hex'
import type { Orbit } from './orbit'

// fixtures.test.ts asserts the exact golden solves; these assert the invariants
// — straight-line arrival time, the motion-off collapse, and lead feasibility.

describe('solveHex', () => {
  it('plots a straight line and arrives after distance × msPerTile', () => {
    const s = solveHex({ q: 0, r: 0 }, { q: 5, r: 0 }, 1_000, 200)
    expect(s.meetHex).toEqual({ q: 5, r: 0 })
    expect(s.path).toHaveLength(6) // inclusive of both endpoints
    expect(s.arriveTime).toBe(1_000 + 5 * 200)
  })
})

describe('solveIntercept', () => {
  it('collapses to a fixed-hex solve when motion is off (period beyond safe-integer)', () => {
    const still: Orbit = { ring: 5, angle0: 3, period: 2 ** 60, dir: 1 }
    const s = solveIntercept({ q: 0, r: 0 }, still, 0, 1_000, 10_000_000)
    // A static target is just its current hex: arrive = now + dist × msPerTile.
    expect(s.arriveTime).toBe(distance({ q: 0, r: 0 }, s.meetHex) * 1_000)
    expect(s.path[s.path.length - 1]).toEqual(s.meetHex)
  })

  it('leads a moving target to a feasible meeting (reachable no later than arrival)', () => {
    const moving: Orbit = { ring: 6, angle0: 0, period: 600_000, dir: 1 }
    const s = solveIntercept({ q: 0, r: 0 }, moving, 0, 1_000, 5_000_000)
    // Feasibility: the fleet can burn to the meet hex within the arrival time.
    expect(distance({ q: 0, r: 0 }, s.meetHex) * 1_000).toBeLessThanOrEqual(s.arriveTime)
  })
})

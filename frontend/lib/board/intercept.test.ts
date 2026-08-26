import { describe, expect, it } from 'vitest'
import { arcPath, isAdjacent } from '@/lib/polar'
import { schedule } from './board'
import { solveCell, solveIntercept } from './intercept'
import { orbState } from './orbit'

const s = schedule(10)

describe('solveCell', () => {
  it('ETA follows the emitted arc path', () => {
    const sol = solveCell({ ring: 2, slot: 0 }, { ring: 7, slot: 10 }, 5_000, 2_500, s)
    expect(sol.path).toEqual(arcPath({ ring: 2, slot: 0 }, { ring: 7, slot: 10 }, s))
    expect(sol.meetCell).toEqual({ ring: 7, slot: 10 })
    expect(sol.arriveTime).toBe(5_000 + (sol.path.length - 1) * 2_500)
  })
  it('a coincident destination is a zero-length solve', () => {
    const sol = solveCell({ ring: 3, slot: 4 }, { ring: 3, slot: 4 }, 100, 2_500, s)
    expect(sol.path).toEqual([{ ring: 3, slot: 4 }])
    expect(sol.arriveTime).toBe(100)
  })
})

describe('solveIntercept', () => {
  it('already co-located docks in place at now', () => {
    const orbit = { ring: 4, angle0: 7, period: 48_000, dir: 1 }
    const pos = orbState(orbit, 9_000, s)
    const sol = solveIntercept(pos, orbit, 9_000, 2_500, 1e7, s)
    expect(sol.path).toEqual([pos])
    expect(sol.meetCell).toEqual(pos)
    expect(sol.arriveTime).toBe(9_000)
  })

  it('meets a moving body exactly as it enters the meet cell', () => {
    const orbit = { ring: 2, angle0: 0, period: 12_000, dir: 1 }
    const sol = solveIntercept({ ring: 6, slot: 30 }, orbit, 650, 300, 60_000, s)
    expect(orbState(orbit, sol.arriveTime, s)).toEqual(sol.meetCell)
    // One ms earlier the body is NOT yet on the meet cell — a slot-entry instant.
    expect(orbState(orbit, sol.arriveTime - 1, s)).not.toEqual(sol.meetCell)
    // Physically feasible: travel ≤ elapsed.
    expect((sol.path.length - 1) * 300).toBeLessThanOrEqual(sol.arriveTime - 650)
    // The path is a real arc path: consecutive cells adjacent.
    for (let i = 1; i < sol.path.length; i++) {
      expect(isAdjacent(sol.path[i - 1], sol.path[i], s)).toBe(true)
    }
  })

  it('a motionless body collapses to the fixed-cell solve', () => {
    const orbit = { ring: 5, angle0: 3, period: 1e15, dir: 1 }
    const sol = solveIntercept({ ring: 1, slot: 0 }, orbit, 0, 1_000, 10_000_000, s)
    const fixed = solveCell({ ring: 1, slot: 0 }, orbState(orbit, 0, s), 0, 1_000, s)
    expect(sol).toEqual(fixed)
  })
})

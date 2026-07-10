import { describe, it, expect } from 'vitest'
import { arrived, burnPos, shipPos, type Burn, type MovementState } from './movement'
import type { Orbit } from './orbit'

const path = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: 3, r: 0 },
]
// 4 cells over [1000, 4000] → 1000ms per segment, a step boundary every +500ms.
const burn: Burn = { path, startTime: 1_000, arriveTime: 4_000, target: { hex: { q: 3, r: 0 } } }

describe('burnPos', () => {
  it('clamps to the first cell at or before the start', () => {
    expect(burnPos(burn, 0)).toEqual(path[0])
    expect(burnPos(burn, 1_000)).toEqual(path[0])
  })

  it('clamps to the last cell at or after arrival', () => {
    expect(burnPos(burn, 4_000)).toEqual(path[3])
    expect(burnPos(burn, 9_999)).toEqual(path[3])
  })

  it('quantizes to the nearest path cell, flipping at the halfway point', () => {
    expect(burnPos(burn, 2_400)).toEqual(path[1]) // frac .467 → round(1.4) = 1
    expect(burnPos(burn, 2_600)).toEqual(path[2]) // frac .533 → round(1.6) = 2
  })

  it('returns the centre for an empty path', () => {
    expect(burnPos({ ...burn, path: [] }, 2_000)).toEqual({ q: 0, r: 0 })
  })
})

describe('shipPos', () => {
  it('computes coast and burn positions (ok=true); docked defers to the caller (ok=false)', () => {
    const coast: MovementState = { mode: 'coast', coast: { ring: 2, angle0: 0, period: 12_000, dir: 1 } }
    const burning: MovementState = { mode: 'burn', burn }
    const docked: MovementState = { mode: 'docked', docked: { parentId: 'feat-1' } }

    expect(shipPos(coast, 3_000).ok).toBe(true)
    expect(shipPos(burning, 2_000)).toEqual({ hex: burnPos(burn, 2_000), ok: true })
    expect(shipPos(docked, 0).ok).toBe(false) // parent hex resolved from the interior
  })
})

describe('arrived', () => {
  it('is true only once a burn reaches its arrival time', () => {
    expect(arrived({ mode: 'burn', burn }, 3_999)).toBe(false)
    expect(arrived({ mode: 'burn', burn }, 4_000)).toBe(true)
  })

  it('is never true for a coasting fleet', () => {
    const coast: Orbit = { ring: 1, angle0: 0, period: 6_000, dir: 1 }
    expect(arrived({ mode: 'coast', coast }, 9_999)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { slotsForRing } from '@/lib/polar'
import { schedule } from './board'
import { gateRing, laneGateCell } from './gate'
import { tablePoints } from './table'

describe('gateRing', () => {
  it.each([
    [16, 13],
    [6, 3],
    [4, 1],
    [1, 1],
    [0, 1],
  ])('gateRing(%d) = %d', (radius, want) => {
    expect(gateRing(radius)).toBe(want)
  })
})

describe('laneGateCell', () => {
  it('a non-positive radius degenerates to the core', () => {
    expect(laneGateCell(0, 0, 10, 10, 0)).toEqual({ ring: 0, slot: 0 })
  })

  it('the gate lies on the gate ring for any bearing', () => {
    for (const [nbX, nbY] of [
      [100, 8.7],
      [-8.7, 100],
      [-77, -64],
      [8.7, -100],
    ]) {
      expect(laneGateCell(0, 0, nbX, nbY, 16).ring).toBe(gateRing(16))
    }
  })

  it('cardinal bearings land on the expected slots', () => {
    const slots = slotsForRing(gateRing(16), schedule(16))
    expect(laneGateCell(0, 0, 100, 0, 16).slot).toBe(0)
    expect(laneGateCell(0, 0, 0, 100, 16).slot).toBe(slots / 4)
  })

  it('the choice follows the relative bearing', () => {
    expect(laneGateCell(0, 0, 100, 8.7, 16)).toEqual(laneGateCell(10, -20, 110, -11.3, 16))
  })

  it('an exact dot tie resolves to the lower slot index', () => {
    // Radius 4 → gate ring 1 (6 slots): pinned entries for slots 1 and 2 are
    // exact mirrors (±32768, 56756), so a straight-up bearing ties at the max.
    const pts = tablePoints(slotsForRing(gateRing(4), schedule(4)))
    expect(pts[1][1]).toBe(pts[2][1])
    expect(pts[1][0]).toBe(-pts[2][0])
    expect(laneGateCell(0, 0, 0, 100, 4)).toEqual({ ring: 1, slot: 1 })
  })
})

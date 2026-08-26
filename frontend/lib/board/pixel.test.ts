import { describe, expect, it } from 'vitest'
import { schedule } from './board'
import { RADIAL_UNIT, cellToPoint, fitViewBox, lerpPoint, pointToCell } from './pixel'

const s = schedule(10)

describe('pixel projection (render-side only)', () => {
  it('the core projects to the center', () => {
    expect(cellToPoint({ ring: 0, slot: 0 }, s)).toEqual({ x: 0, y: 0 })
  })

  it('every slot on a ring projects to the same radius', () => {
    for (const slot of [0, 3, 7, 11]) {
      const p = cellToPoint({ ring: 2, slot }, s)
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(2 * RADIAL_UNIT, 9)
    }
  })

  it('pointToCell inverts cellToPoint on cell centers', () => {
    for (const cell of [
      { ring: 1, slot: 4 },
      { ring: 5, slot: 30 },
      { ring: 10, slot: 90 },
    ]) {
      expect(pointToCell(cellToPoint(cell, s), s)).toEqual(cell)
    }
    expect(pointToCell({ x: 0, y: 0 }, s)).toEqual({ ring: 0, slot: 0 })
  })

  it('lerpPoint interpolates linearly', () => {
    expect(lerpPoint({ x: 0, y: 0 }, { x: 10, y: -4 }, 0.5)).toEqual({ x: 5, y: -2 })
  })

  it('fitViewBox is a centered square with a one-unit margin', () => {
    expect(fitViewBox(10, 30)).toBe('-330 -330 660 660')
  })
})

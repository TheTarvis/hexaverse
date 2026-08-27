import { describe, expect, it } from 'vitest'
import { schedule } from './board'
import { slotsForRing } from '@/lib/polar'
import {
  RADIAL_UNIT,
  cellToPoint,
  cellWedge,
  fitViewBox,
  lerpPoint,
  pointToCell,
  slotAngle,
  wedgePath,
} from './pixel'

const s = schedule(10)
// The wedge suites below read a production-radius board — the slot schedule's
// band boundaries are what make a wedge's angular width ring-dependent.
const S = schedule(16)

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

describe('cellWedge — the drawn footprint of a polar cell', () => {
  // A polar cell is an annular sector, not a hexagon: bounded by its ring's
  // inner and outer radius and by its slot's angular extent. `hexPolygonPoints`
  // had no replacement because the two shapes do not tile the same plane.
  it('spans one radial unit, centred on the ring radius', () => {
    const w = cellWedge({ ring: 4, slot: 2 }, S)
    expect(w.rOuter - w.rInner).toBeCloseTo(RADIAL_UNIT, 9)
    expect((w.rInner + w.rOuter) / 2).toBeCloseTo(4 * RADIAL_UNIT, 9)
  })

  it('takes its angular half-width from the ring’s own slot count', () => {
    for (const ring of [1, 5, 9, 16]) {
      const w = cellWedge({ ring, slot: 0 }, S)
      expect(w.angHalf).toBeCloseTo(Math.PI / slotsForRing(ring, S), 12)
    }
  })

  it('gets angularly narrower as a ring band doubles its slots', () => {
    const inner = cellWedge({ ring: 1, slot: 0 }, S)
    const outer = cellWedge({ ring: 16, slot: 0 }, S)
    expect(outer.angHalf).toBeLessThan(inner.angHalf)
  })

  it('varies its DRAWN arc width with ring — a hexagon’s apothem did not', () => {
    // This is the property that moved the tile border inset into screen units:
    // no single world-unit constant reads the same at every ring.
    // Inside one slot band (rings 9-16 all carry 96 slots) the arc grows with
    // the radius...
    const arc = (ring: number) => {
      const w = cellWedge({ ring, slot: 0 }, S)
      return w.rOuter * w.angHalf * 2
    }
    expect(arc(16)).toBeGreaterThan(arc(9))
    // ...and at a band boundary the slot count doubles, so it drops sharply.
    expect(arc(9)).toBeLessThan(arc(8))
  })

  it('degenerates the core to a disc — one cell with no angular extent to bound', () => {
    const w = cellWedge({ ring: 0, slot: 0 }, S)
    expect(w.rInner).toBe(0)
    expect(w.rOuter).toBeCloseTo(RADIAL_UNIT / 2, 9)
    expect(w.angHalf).toBe(Math.PI)
  })

  it('centres the wedge on the cell’s own slot angle', () => {
    const c = { ring: 6, slot: 3 }
    expect(cellWedge(c, S).angCenter).toBeCloseTo(slotAngle(c, S), 12)
  })

  it('never emits a negative inner radius on ring 1', () => {
    expect(cellWedge({ ring: 1, slot: 0 }, S).rInner).toBeGreaterThanOrEqual(0)
  })
})

describe('wedgePath — the SVG form of the same bounds', () => {
  it('draws two arcs joined by two radial edges', () => {
    const d = wedgePath({ ring: 5, slot: 1 }, S)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect((d.match(/ A /g) ?? []).length).toBe(2)
  })

  it('splits the core into two half-circle arcs — one full-turn arc is degenerate in SVG', () => {
    const d = wedgePath({ ring: 0, slot: 0 }, S)
    expect((d.match(/ A /g) ?? []).length).toBe(2)
    expect(d).not.toContain('NaN')
  })

  it('stays within the wedge’s own radii', () => {
    const c = { ring: 7, slot: 2 }
    const w = cellWedge(c, S)
    const d = wedgePath(c, S)
    const coords = (d.match(/-?\d+\.\d{3}/g) ?? []).map(Number)
    for (let i = 0; i + 1 < coords.length; i += 2) {
      const r = Math.hypot(coords[i]!, coords[i + 1]!)
      expect(r).toBeLessThanOrEqual(w.rOuter + 1e-3)
      expect(r).toBeGreaterThanOrEqual(w.rInner - 1e-3)
    }
  })
})

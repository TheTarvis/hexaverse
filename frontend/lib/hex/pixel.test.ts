import { describe, it, expect } from 'vitest'
import { fitViewBox, hexesWithinRadius, hexPolygonPoints, hexToPixel, lerpPixel, pixelToHex } from './pixel'
import { ringOf } from './hex'

describe('pixelToHex', () => {
  it('round-trips every hex centre on a radius-6 board', () => {
    for (const h of hexesWithinRadius(6)) {
      expect(pixelToHex(hexToPixel(h.q, h.r))).toEqual(h)
    }
  })

  it('resolves points off-centre within the cell to the containing hex', () => {
    const c = hexToPixel(3, -2)
    // Well inside the cell (the apothem is ~29.4): nudges stay home.
    expect(pixelToHex({ x: c.x + 10, y: c.y - 8 })).toEqual({ q: 3, r: -2 })
  })

  it('never emits negative zero', () => {
    const h = pixelToHex({ x: -0.0001, y: -0.0001 })
    expect(Object.is(h.q, -0)).toBe(false)
    expect(Object.is(h.r, -0)).toBe(false)
  })
})

describe('hexToPixel', () => {
  it('places the star at the origin', () => {
    expect(hexToPixel(0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('steps linearly in q along x, on the y=0 row', () => {
    const a = hexToPixel(1, 0)
    const b = hexToPixel(2, 0)
    expect(a.y).toBe(0)
    expect(b.x).toBeCloseTo(a.x * 2)
  })
})

describe('hexPolygonPoints', () => {
  it('returns six "x,y" vertices', () => {
    const verts = hexPolygonPoints({ x: 0, y: 0 }).split(' ')
    expect(verts).toHaveLength(6)
    for (const v of verts) expect(v.split(',')).toHaveLength(2)
  })
})

describe('lerpPixel', () => {
  it('returns the endpoints at frac 0 and 1', () => {
    const a = { q: 0, r: 0 }
    const b = { q: 3, r: -1 }
    expect(lerpPixel(a, b, 0)).toEqual(hexToPixel(a.q, a.r))
    expect(lerpPixel(a, b, 1)).toEqual(hexToPixel(b.q, b.r))
  })

  it('is the pixel midpoint at frac 0.5', () => {
    expect(lerpPixel({ q: 0, r: 0 }, { q: 2, r: 0 }, 0.5)).toEqual(hexToPixel(1, 0))
  })
})

describe('hexesWithinRadius', () => {
  it('returns the centred hexagonal number of tiles, none beyond the radius', () => {
    const radius = 3
    const hexes = hexesWithinRadius(radius)
    expect(hexes).toHaveLength(1 + 3 * radius * (radius + 1))
    for (const h of hexes) expect(ringOf(h)).toBeLessThanOrEqual(radius)
  })

  it('includes the star and reaches the rim', () => {
    const hexes = hexesWithinRadius(2)
    expect(hexes).toContainEqual({ q: 0, r: 0 })
    expect(hexes.some((h) => ringOf(h) === 2)).toBe(true)
  })
})

describe('fitViewBox', () => {
  it('frames a symmetric board around the star with padding', () => {
    const vb = fitViewBox(hexesWithinRadius(2))
    expect(vb.x + vb.w / 2).toBeCloseTo(0) // centre ~ origin
    expect(vb.y + vb.h / 2).toBeCloseTo(0)
    expect(vb.w).toBeGreaterThan(0)
    expect(vb.h).toBeGreaterThan(0)
  })

  it('degrades to a padded box for an empty tile set', () => {
    const vb = fitViewBox([])
    expect(vb.w).toBeGreaterThan(0)
    expect(vb.h).toBeGreaterThan(0)
  })
})

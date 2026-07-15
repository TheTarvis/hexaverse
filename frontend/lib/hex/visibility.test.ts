import { describe, it, expect } from 'vitest'
import { lineOfSight, beamHexes, neighborhood, hexKey } from './visibility'
import { ringOf, type Hex } from './hex'

// Behavioral mirror of backend/board/visibility_test.go — the byte-level Go↔TS
// agreement is pinned separately by fixtures.test.ts against the golden.

const occ = new Set([hexKey({ q: 2, r: 0 })])

describe('lineOfSight', () => {
  // Spec: 0006/S2
  it('shadows what sits strictly behind an occluder, not the occluder itself', () => {
    const origin: Hex = { q: 0, r: 0 }
    expect(lineOfSight(origin, { q: 1, r: 0 }, occ)).toBe(true)
    expect(lineOfSight(origin, { q: 2, r: 0 }, occ)).toBe(true) // you see the planet…
    expect(lineOfSight(origin, { q: 3, r: 0 }, occ)).toBe(false) // …not past it
    expect(lineOfSight(origin, { q: 5, r: 0 }, occ)).toBe(false)
    expect(lineOfSight(origin, { q: 0, r: 3 }, occ)).toBe(true) // off the axis
  })

  it('is always clear with no occluders', () => {
    expect(lineOfSight({ q: -3, r: 1 }, { q: 4, r: -2 }, new Set())).toBe(true)
  })
})

describe('beamHexes', () => {
  const p = { halfWidthBase: 0, spread: 0.34, rimRing: 6 }

  it('extends the spine through the aim to the rim and widens with distance', () => {
    const beam = beamHexes({ q: 0, r: 0 }, { q: 1, r: 0 }, p)
    const keys = new Set(beam.map(hexKey))
    for (let q = 0; q <= 6; q++) {
      expect(keys.has(hexKey({ q, r: 0 })), `spine hex (${q},0)`).toBe(true)
    }
    expect(keys.has(hexKey({ q: 1, r: 1 }))).toBe(false) // bare line near origin
    expect(keys.has(hexKey({ q: 3, r: -1 }))).toBe(true) // ±1 by spine index 3
    expect(keys.has(hexKey({ q: 0, r: 3 }))).toBe(false) // perpendicular never joins
    for (const h of beam) {
      expect(ringOf(h), `beam hex ${hexKey(h)} inside the rim`).toBeLessThanOrEqual(p.rimRing)
    }
  })

  it('yields nothing for an aim with no direction', () => {
    expect(beamHexes({ q: 2, r: 2 }, { q: 2, r: 2 }, p)).toEqual([])
  })
})

describe('neighborhood', () => {
  it('is the filled disc: 1, then 1+6, then 1+6+12 hexes', () => {
    const c: Hex = { q: 3, r: -1 }
    expect(neighborhood(c, 0)).toEqual([c])
    expect(neighborhood(c, 1)).toHaveLength(7)
    expect(neighborhood(c, 2)).toHaveLength(19)
  })
})

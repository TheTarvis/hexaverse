import { describe, it, expect } from 'vitest'
import { distance, line, ringHexes, ringOf, roundf } from './hex'

// Unit behaviour of the hex primitives. The cross-language golden lives in
// fixtures.test.ts; these guard the properties and the one Go-parity trap
// (roundf) that a plausible-looking JS rewrite would get wrong.

describe('roundf (Go parity — half away from zero)', () => {
  it('rounds positive halves up', () => {
    expect(roundf(0.5)).toBe(1)
    expect(roundf(2.5)).toBe(3)
  })

  it('rounds negative halves away from zero, unlike Math.round', () => {
    expect(roundf(-0.5)).toBe(-1)
    expect(roundf(-2.5)).toBe(-3)
    // The exact trap: Math.round(-2.5) === -2. Using it in cubeRound would
    // silently drift line() paths off the backend at half cube-coordinates.
    expect(roundf(-2.5)).not.toBe(Math.round(-2.5))
  })

  it('leaves non-half values as ordinary rounding', () => {
    expect(roundf(1.4)).toBe(1)
    expect(roundf(1.6)).toBe(2)
    expect(roundf(-1.4)).toBe(-1)
  })
})

describe('distance / ringOf', () => {
  it('is zero to self', () => {
    expect(distance({ q: 2, r: -3 }, { q: 2, r: -3 })).toBe(0)
  })

  it('counts rings out from the centre', () => {
    expect(ringOf({ q: 0, r: 0 })).toBe(0)
    expect(ringOf({ q: 3, r: -1 })).toBe(3)
    expect(ringOf({ q: -2, r: 5 })).toBe(5)
  })
})

describe('ringHexes', () => {
  it('returns just the centre for ring 0', () => {
    expect(ringHexes(0)).toEqual([{ q: 0, r: 0 }])
  })

  it('returns 6*ring hexes, each exactly on that ring', () => {
    const ring = 3
    const hexes = ringHexes(ring)
    expect(hexes).toHaveLength(6 * ring)
    for (const h of hexes) expect(ringOf(h)).toBe(ring)
  })

  it('walks a contiguous perimeter — adjacent entries (and the wrap) are neighbours', () => {
    const hexes = ringHexes(2)
    for (let i = 0; i < hexes.length; i++) {
      const next = hexes[(i + 1) % hexes.length]
      expect(distance(hexes[i], next)).toBe(1)
    }
  })
})

describe('line', () => {
  it('returns a single cell when the endpoints coincide', () => {
    expect(line({ q: 1, r: 1 }, { q: 1, r: 1 })).toEqual([{ q: 1, r: 1 }])
  })

  it('is inclusive of both endpoints and steps one hex at a time', () => {
    const path = line({ q: 0, r: 0 }, { q: 3, r: -1 })
    expect(path[0]).toEqual({ q: 0, r: 0 })
    expect(path[path.length - 1]).toEqual({ q: 3, r: -1 })
    for (let i = 1; i < path.length; i++) expect(distance(path[i - 1], path[i])).toBe(1)
  })
})

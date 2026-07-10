import { describe, it, expect } from 'vitest'
import {
  burnGlidePixel,
  featureGlidePixel,
  featureLogicalHex,
  fleetGlidePixel,
  fleetLogicalHex,
  headingDeg,
  orbitGlidePixel,
  sensorBubbleHexes,
} from './glyph-geometry'
import { hexToPixel } from '@/lib/hex/pixel'
import { orbState, type Orbit } from '@/lib/hex'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'

const feature = (over: Partial<BoardFeature>): BoardFeature => ({
  id: 'f',
  type: 'rocky',
  footprint: [{ q: 0, r: 0 }],
  band: 'visible',
  live: true,
  ...over,
})

const fleet = (state: Fleet['state']): Fleet => ({
  id: 'fl',
  corporationId: 'corp-user1',
  systemId: 's',
  state,
  position: { q: 0, r: 0 },
  own: true,
  worldTime: 0,
})

describe('orbitGlidePixel', () => {
  it('sits exactly on the logical cell at a cell boundary (frac 0)', () => {
    const orbit: Orbit = { ring: 3, angle0: 0, period: 30, dir: 1 }
    // worldTime 0 → prog 0 → frac 0 → the orbState cell centre.
    const at0 = orbState(orbit, 0)
    expect(orbitGlidePixel(orbit, 0)).toEqual(hexToPixel(at0.q, at0.r))
  })

  it('freezes a huge-period ("motion off") body at its epoch cell', () => {
    const orbit: Orbit = { ring: 4, angle0: 2, period: 2 ** 60, dir: 1 }
    const hex = orbState(orbit, 5_000_000)
    const center = hexToPixel(hex.q, hex.r)
    const p = orbitGlidePixel(orbit, 5_000_000)
    // The glide fraction is ~1e-10 of a cell — sub-nanometer, visually frozen.
    expect(p.x).toBeCloseTo(center.x, 6)
    expect(p.y).toBeCloseTo(center.y, 6)
  })

  it('glides partway toward the next cell mid-step', () => {
    const orbit: Orbit = { ring: 2, angle0: 0, period: 12, dir: 1 }
    // steps = 12, oneStep = 1; at t=0.5 the glide is halfway to the next cell.
    const p = orbitGlidePixel(orbit, 0.5)
    const a = hexToPixel(orbState(orbit, 0).q, orbState(orbit, 0).r)
    const b = hexToPixel(orbState(orbit, 1).q, orbState(orbit, 1).r)
    expect(p.x).toBeCloseTo((a.x + b.x) / 2, 5)
    expect(p.y).toBeCloseTo((a.y + b.y) / 2, 5)
  })
})

describe('burnGlidePixel', () => {
  const burn = {
    path: [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ],
    startTime: 100,
    arriveTime: 300,
    target: { hex: { q: 2, r: 0 } },
  }

  it('clamps to the start before the window and the end after it', () => {
    expect(burnGlidePixel(burn, 50)).toEqual(hexToPixel(0, 0))
    expect(burnGlidePixel(burn, 999)).toEqual(hexToPixel(2, 0))
  })

  it('lands on the middle cell at the midpoint of the window', () => {
    // t=200 → frac 0.5 → cont 1.0 → exactly path[1].
    expect(burnGlidePixel(burn, 200)).toEqual(hexToPixel(1, 0))
  })
})

describe('featureLogicalHex', () => {
  it('puts a fixed feature (the star) at the centre', () => {
    expect(featureLogicalHex(feature({ fixed: true }), 123)).toEqual({ q: 0, r: 0 })
  })

  it('computes an orbiting feature from its elements', () => {
    const orbit: Orbit = { ring: 3, angle0: 1, period: 30, dir: 1 }
    expect(featureLogicalHex(feature({ orbit }), 90)).toEqual(orbState(orbit, 90))
  })

  it('falls back to the stored footprint tile', () => {
    expect(featureLogicalHex(feature({ footprint: [{ q: 4, r: -1 }] }), 0)).toEqual({ q: 4, r: -1 })
  })
})

describe('featureGlidePixel', () => {
  it('offsets a moon from its parent so they do not overlap', () => {
    const parent = { x: 100, y: 100 }
    const p = featureGlidePixel(feature({ parentId: 'giant' }), 0, parent, 0)
    expect(p).not.toEqual(parent)
  })
})

describe('fleet position', () => {
  it('rides the parent when docked', () => {
    const parent = { x: 42, y: 7 }
    expect(fleetGlidePixel(fleet({ mode: 'docked', docked: { parentId: 'p' } }), 0, parent)).toEqual(
      parent,
    )
    expect(
      fleetLogicalHex(fleet({ mode: 'docked', docked: { parentId: 'p' } }), 0, { q: 3, r: 3 }),
    ).toEqual({ q: 3, r: 3 })
  })

  it('unions and dedups sensor discs around every centre', () => {
    // Two adjacent centres, radius 1 (7-hex discs) overlap, so the union is < 14.
    const hexes = sensorBubbleHexes(
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      1,
    )
    const keys = new Set(hexes.map((h) => `${h.q},${h.r}`))
    expect(keys.size).toBe(hexes.length) // no duplicates
    expect(hexes.length).toBeLessThan(14)
    expect(keys.has('0,0')).toBe(true)
    expect(keys.has('1,0')).toBe(true)
  })

  it('reports a heading of 0 for coincident points and +x → 0°', () => {
    expect(headingDeg({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0)
    expect(headingDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0)
    expect(headingDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 5)
  })

  it('glides along a burn path', () => {
    const burning = fleet({
      mode: 'burn',
      burn: {
        path: [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
        ],
        startTime: 0,
        arriveTime: 100,
        target: { hex: { q: 1, r: 0 } },
      },
    })
    expect(fleetGlidePixel(burning, 100)).toEqual(hexToPixel(1, 0))
  })
})

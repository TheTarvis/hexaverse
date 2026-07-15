import { describe, it, expect } from 'vitest'
import {
  burnGlidePixel,
  featureGlidePixel,
  featureLogicalHex,
  fleetGlidePixel,
  fleetLogicalHex,
  fleetOnBoard,
  fleetScenePixel,
  headingDeg,
  orbitGlidePixel,
  sensorBubbleHexes,
} from './glyph-geometry'
import { hexToPixel, lerpPixel } from '@/lib/hex/pixel'
import { coastAt, orbState, orbitPeriod, solveIntercept, stateAt, type Orbit } from '@/lib/hex'
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

  it('glides along a burn path and hands off to the coast at arrival', () => {
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
    // Mid-flight: halfway between the two path cells.
    expect(fleetGlidePixel(burning, 50)).toEqual(lerpPixel({ q: 0, r: 0 }, { q: 1, r: 0 }, 0.5))
    // At (and past) arrival the burn IS the coast it settled into (stateAt): the
    // ship glides on the meet hex's ring instead of freezing on the meet pixel.
    const settled = stateAt(burning.state, 100)
    expect(settled.mode).toBe('coast')
    expect(fleetGlidePixel(burning, 100)).toEqual(orbitGlidePixel(settled.coast!, 100))
    expect(fleetGlidePixel(burning, 5_000)).toEqual(orbitGlidePixel(settled.coast!, 5_000))
  })

  it('settles within half a cell of the halt hex at any instant (no full-tile jump on cancel)', () => {
    // The renderer glides every orbit by the ABSOLUTE cell-window fraction, so a
    // coast anchored mid-window drew a freshly settled ship up to a full cell
    // prograde of its halt hex — cancel a burn and the ship landed one tile
    // "ahead" on the ring. coastAt snaps its anchor to the nearest window
    // boundary, bounding the discontinuity to half the ring-cell spacing.
    const h = { q: 5, r: 0 }
    const target = hexToPixel(h.q, h.r)
    const neighbor = orbState(coastAt(h, 0).coast!, orbitPeriod(5) / (6 * 5)) // next ring cell
    const spacing = Math.hypot(
      hexToPixel(neighbor.q, neighbor.r).x - target.x,
      hexToPixel(neighbor.q, neighbor.r).y - target.y,
    )
    // Settle instants spread across one 6s cell window (fractions 0 → 0.98).
    for (const at of [720_000, 721_500, 722_900, 723_400, 724_700, 725_900]) {
      const st = coastAt(h, at)
      expect(st.mode).toBe('coast')
      const p = orbitGlidePixel(st.coast!, at)
      const jump = Math.hypot(p.x - target.x, p.y - target.y)
      expect(jump, `settled at ${at} drew ${jump.toFixed(1)}px from its halt hex`).toBeLessThanOrEqual(
        spacing * 0.51,
      )
    }
  })

  it('meets the body glyph at the intercept arrival — the dock hand-off has no jump', () => {
    // The body glyph glides toward its NEXT cell by the absolute window
    // fraction (orbitGlidePixel), sitting on its logical cell centre only at
    // the instant it enters the cell. The burn glide lands the ship exactly on
    // the meet-hex CENTRE at arriveTime, and the dock fold then snaps it to the
    // parent's glided point — so unless the solve arrives on a window boundary,
    // the ship reads up to a tile behind the body and jumps onto it as the dock
    // folds. Sweep order times across one cell window: at every one, ship and
    // body must coincide at the arrival instant.
    const orbit: Orbit = { ring: 2, angle0: 0, period: 12_000, dir: 1 } // oneStep = 1s
    const from = { q: 6, r: -3 }
    for (const now of [0, 150, 400, 650, 900, 1_100]) {
      const sol = solveIntercept(from, orbit, now, 300, 60_000)
      // The logical contract holds regardless: meet hex = body's hex at arrival.
      expect(orbState(orbit, sol.arriveTime)).toEqual(sol.meetHex)
      const ship = hexToPixel(sol.meetHex.q, sol.meetHex.r) // burn glide end
      const body = orbitGlidePixel(orbit, sol.arriveTime)
      const next = orbState(orbit, sol.arriveTime + 1_000)
      const spacing = Math.hypot(
        hexToPixel(next.q, next.r).x - ship.x,
        hexToPixel(next.q, next.r).y - ship.y,
      )
      const gap = Math.hypot(body.x - ship.x, body.y - ship.y)
      expect(
        gap,
        `ordered at ${now}: body glyph is ${gap.toFixed(1)}px (${(gap / spacing).toFixed(2)} cells) ahead of the meet hex at arrival`,
      ).toBeLessThanOrEqual(spacing * 0.01)
    }
  })

  it('glides a trip’s board leg like a burn, then leaves the board at the gate', () => {
    const departing = fleet({
      mode: 'laneTransit',
      laneTransit: {
        boardLeg: {
          path: [
            { q: 0, r: 0 },
            { q: 1, r: 0 },
          ],
          startTime: 0,
          gateEta: 100,
        },
        route: ['s', 'sys-e'],
        legEtas: [100, 200],
        departTime: 0,
        arriveTime: 200,
        entryGate: { q: -3, r: 0 },
      },
    })

    // Half way along leg 0 the ship sits BETWEEN the two cells — glided, not
    // snapped (the snap is what made a departure look like a hex-by-hex jump).
    const mid = fleetGlidePixel(departing, 50)
    expect(mid).not.toEqual(hexToPixel(0, 0))
    expect(mid).not.toEqual(hexToPixel(1, 0))
    expect(mid.x).toBeCloseTo((hexToPixel(0, 0).x + hexToPixel(1, 0).x) / 2, 5)
    expect(fleetOnBoard(departing, 50)).toBe(true)

    // At the gate it hands off to the lane: no hex here any more.
    expect(fleetOnBoard(departing, 150)).toBe(false)
  })

  it('keeps a coasting fleet on the board and a mid-lane one off it', () => {
    expect(fleetOnBoard(fleet({ mode: 'coast', coast: { ring: 2, angle0: 0, period: 100, dir: 1 } }), 0)).toBe(true)
    expect(fleetOnBoard(fleet({ mode: 'docked', docked: { parentId: 'p' } }), 0)).toBe(true)
    expect(
      fleetOnBoard(fleet({ mode: 'laneHold', laneHold: { from: 'a', to: 'b', fraction: 0.5 } }), 0),
    ).toBe(false)
  })
})

describe('fleetScenePixel', () => {
  it('rides a docked fleet on its parent body\u2019s glided point', () => {
    const planet = feature({ id: 'p', orbit: { ring: 2, angle0: 0, period: 60, dir: 1 } })
    const docked = fleet({ mode: 'docked', docked: { parentId: 'p' } })
    expect(fleetScenePixel(docked, [planet], 10)).toEqual(featureGlidePixel(planet, 10))
  })

  it('resolves a moon parent through ITS parent with the sibling offset BoardScene draws', () => {
    const planet = feature({ id: 'p', orbit: { ring: 2, angle0: 0, period: 60, dir: 1 } })
    const moonA = feature({ id: 'mA', type: 'moon', parentId: 'p' })
    const moonB = feature({ id: 'mB', type: 'moon', parentId: 'p' })
    const docked = fleet({ mode: 'docked', docked: { parentId: 'mB' } })
    const expected = featureGlidePixel(moonB, 10, featureGlidePixel(planet, 10), 1)
    expect(fleetScenePixel(docked, [planet, moonA, moonB], 10)).toEqual(expected)
  })

  it('falls back to the fleet\u2019s own glide when it is not docked', () => {
    const coasting = fleet({ mode: 'coast', coast: { ring: 3, angle0: 0, period: 100, dir: 1 } })
    expect(fleetScenePixel(coasting, [], 25)).toEqual(fleetGlidePixel(coasting, 25))
  })
})

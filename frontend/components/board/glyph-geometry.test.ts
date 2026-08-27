import { describe, it, expect } from 'vitest'
import {
  burnGlidePixel,
  featureGlidePixel,
  featureLogicalCell,
  fleetGlidePixel,
  fleetLogicalCell,
  fleetOnBoard,
  fleetScenePixel,
  headingDeg,
  orbitGlidePixel,
  sensorBubbleCells,
} from './glyph-geometry'
import {
  cellToPoint,
  coastAt,
  lerpPoint,
  orbState,
  orbitPeriod,
  cellKey,
  productionSchedule,
  solveIntercept,
  stateAt,
  type Orbit,
} from '@/lib/board'

// The board's slot schedule. These are unit tests of pure projection and
// movement folds — no cell enumeration, no rim clamping — so the process-wide
// schedule is exact here (design.md, schedule-threading Decision).
const S = productionSchedule()
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'

const feature = (over: Partial<BoardFeature>): BoardFeature => ({
  id: 'f',
  type: 'rocky',
  footprint: [{ ring: 0, slot: 0 }],
  band: 'visible',
  live: true,
  ...over,
})

const fleet = (state: Fleet['state']): Fleet => ({
  id: 'fl',
  corporationId: 'corp-user1',
  systemId: 's',
  state,
  position: { ring: 0, slot: 0 },
  own: true,
  worldTime: 0,
})

describe('orbitGlidePixel', () => {
  it('sits exactly on the logical cell at a cell boundary (frac 0)', () => {
    const orbit: Orbit = { ring: 3, angle0: 0, period: 30, dir: 1 }
    // worldTime 0 → prog 0 → frac 0 → the orbState cell centre.
    const at0 = orbState(orbit, 0, S)
    expect(orbitGlidePixel(orbit, 0, S)).toEqual(cellToPoint(at0, S))
  })

  it('freezes a huge-period ("motion off") body at its epoch cell', () => {
    const orbit: Orbit = { ring: 4, angle0: 2, period: 2 ** 60, dir: 1 }
    const hex = orbState(orbit, 5_000_000, S)
    const center = cellToPoint(hex, S)
    const p = orbitGlidePixel(orbit, 5_000_000, S)
    // The glide fraction is ~1e-10 of a cell — sub-nanometer, visually frozen.
    expect(p.x).toBeCloseTo(center.x, 6)
    expect(p.y).toBeCloseTo(center.y, 6)
  })

  it('glides partway toward the next cell mid-step', () => {
    const orbit: Orbit = { ring: 2, angle0: 0, period: 12, dir: 1 }
    // steps = 12, oneStep = 1; at t=0.5 the glide is halfway to the next cell.
    const p = orbitGlidePixel(orbit, 0.5, S)
    const a = cellToPoint(orbState(orbit, 0, S), S)
    const b = cellToPoint(orbState(orbit, 1, S), S)
    expect(p.x).toBeCloseTo((a.x + b.x) / 2, 5)
    expect(p.y).toBeCloseTo((a.y + b.y) / 2, 5)
  })
})

describe('burnGlidePixel', () => {
  const burn = {
    path: [
      { ring: 0, slot: 0 },
      { ring: 1, slot: 0 },
      { ring: 2, slot: 0 },
    ],
    startTime: 100,
    arriveTime: 300,
    target: { cell: { ring: 2, slot: 0 } },
  }

  it('clamps to the start before the window and the end after it', () => {
    expect(burnGlidePixel(burn, 50, S)).toEqual(cellToPoint({ ring: 0, slot: 0 }, S))
    expect(burnGlidePixel(burn, 999, S)).toEqual(cellToPoint({ ring: 2, slot: 0 }, S))
  })

  it('lands on the middle cell at the midpoint of the window', () => {
    // t=200 → frac 0.5 → cont 1.0 → exactly path[1].
    expect(burnGlidePixel(burn, 200, S)).toEqual(cellToPoint({ ring: 1, slot: 0 }, S))
  })
})

describe('featureLogicalCell', () => {
  it('puts a fixed feature (the star) at the centre', () => {
    expect(featureLogicalCell(feature({ fixed: true }), 123, S)).toEqual({ ring: 0, slot: 0 })
  })

  it('computes an orbiting feature from its elements', () => {
    const orbit: Orbit = { ring: 3, angle0: 1, period: 30, dir: 1 }
    expect(featureLogicalCell(feature({ orbit }), 90, S)).toEqual(orbState(orbit, 90, S))
  })

  it('falls back to the stored footprint tile', () => {
    expect(featureLogicalCell(feature({ footprint: [{ ring: 4, slot: 1 }] }), 0, S)).toEqual({ ring: 4, slot: 1 })
  })
})

describe('featureGlidePixel', () => {
  it('offsets a moon from its parent so they do not overlap', () => {
    const parent = { x: 100, y: 100 }
    const p = featureGlidePixel(feature({ parentId: 'giant' }), 0, S, parent, 0)
    expect(p).not.toEqual(parent)
  })
})

describe('fleet position', () => {
  it('rides the parent when docked', () => {
    const parent = { x: 42, y: 7 }
    expect(fleetGlidePixel(fleet({ mode: 'docked', docked: { parentId: 'p' } }), 0, S, parent)).toEqual(
      parent,
    )
    expect(
      fleetLogicalCell(fleet({ mode: 'docked', docked: { parentId: 'p' } }), 0, S, { ring: 3, slot: 3 }),
    ).toEqual({ ring: 3, slot: 3 })
  })

  it('unions and dedups sensor discs around every centre', () => {
    // Two centres one ring apart with overlapping radius-1 discs: the union is
    // strictly smaller than the two discs drawn independently.
    const cells = sensorBubbleCells(
      [
        { ring: 0, slot: 0 },
        { ring: 1, slot: 0 },
      ],
      1,
      4,
      S,
    )
    const keys = new Set(cells.map(cellKey))
    expect(keys.size).toBe(cells.length) // no duplicates
    const alone = sensorBubbleCells([{ ring: 1, slot: 0 }], 1, 4, S).length
    expect(cells.length).toBeLessThan(alone * 2)
    expect(keys.has('0:0')).toBe(true)
    expect(keys.has('1:0')).toBe(true)
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
          { ring: 0, slot: 0 },
          { ring: 1, slot: 0 },
        ],
        startTime: 0,
        arriveTime: 100,
        target: { cell: { ring: 1, slot: 0 } },
      },
    })
    // Mid-flight: halfway between the two path cells.
    expect(fleetGlidePixel(burning, 50, S)).toEqual(
      lerpPoint(cellToPoint({ ring: 0, slot: 0 }, S), cellToPoint({ ring: 1, slot: 0 }, S), 0.5),
    )
    // At (and past) arrival the burn IS the coast it settled into (stateAt): the
    // ship glides on the meet cell's ring instead of freezing on the meet pixel.
    const settled = stateAt(burning.state, 100, S)
    expect(settled.mode).toBe('coast')
    expect(fleetGlidePixel(burning, 100, S)).toEqual(orbitGlidePixel(settled.coast!, 100, S))
    expect(fleetGlidePixel(burning, 5_000, S)).toEqual(orbitGlidePixel(settled.coast!, 5_000, S))
  })

  it('settles within half a cell of the halt hex at any instant (no full-tile jump on cancel)', () => {
    // The renderer glides every orbit by the ABSOLUTE cell-window fraction, so a
    // coast anchored mid-window drew a freshly settled ship up to a full cell
    // prograde of its halt hex — cancel a burn and the ship landed one tile
    // "ahead" on the ring. coastAt snaps its anchor to the nearest window
    // boundary, bounding the discontinuity to half the ring-cell spacing.
    const h = { ring: 5, slot: 0 }
    const target = cellToPoint(h, S)
    const neighbor = orbState(coastAt(h, 0, S).coast!, orbitPeriod(5) / (6 * 5), S) // next ring cell
    const spacing = Math.hypot(
      cellToPoint(neighbor, S).x - target.x,
      cellToPoint(neighbor, S).y - target.y,
    )
    // Settle instants spread across one 6s cell window (fractions 0 → 0.98).
    for (const at of [720_000, 721_500, 722_900, 723_400, 724_700, 725_900]) {
      const st = coastAt(h, at, S)
      expect(st.mode).toBe('coast')
      const p = orbitGlidePixel(st.coast!, at, S)
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
    const from = { ring: 6, slot: 3 }
    for (const now of [0, 150, 400, 650, 900, 1_100]) {
      const sol = solveIntercept(from, orbit, now, 300, 60_000, S)
      // The logical contract holds regardless: meet cell = body's cell at arrival.
      expect(orbState(orbit, sol.arriveTime, S)).toEqual(sol.meetCell)
      const ship = cellToPoint(sol.meetCell, S) // burn glide end
      const body = orbitGlidePixel(orbit, sol.arriveTime, S)
      const next = orbState(orbit, sol.arriveTime + 1_000, S)
      const spacing = Math.hypot(
        cellToPoint(next, S).x - ship.x,
        cellToPoint(next, S).y - ship.y,
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
            { ring: 0, slot: 0 },
            { ring: 1, slot: 0 },
          ],
          startTime: 0,
          gateEta: 100,
        },
        route: ['s', 'sys-e'],
        legEtas: [100, 200],
        departTime: 0,
        arriveTime: 200,
        entryGate: { ring: 3, slot: 0 },
      },
    })

    // Half way along leg 0 the ship sits BETWEEN the two cells — glided, not
    // snapped (the snap is what made a departure look like a hex-by-hex jump).
    const mid = fleetGlidePixel(departing, 50, S)
    expect(mid).not.toEqual(cellToPoint({ ring: 0, slot: 0 }, S))
    expect(mid).not.toEqual(cellToPoint({ ring: 1, slot: 0 }, S))
    expect(mid.x).toBeCloseTo((cellToPoint({ ring: 0, slot: 0 }, S).x + cellToPoint({ ring: 1, slot: 0 }, S).x) / 2, 5)
    expect(fleetOnBoard(departing, 50, S)).toBe(true)

    // At the gate it hands off to the lane: no hex here any more.
    expect(fleetOnBoard(departing, 150, S)).toBe(false)
  })

  it('keeps a coasting fleet on the board and a mid-lane one off it', () => {
    expect(fleetOnBoard(fleet({ mode: 'coast', coast: { ring: 2, angle0: 0, period: 100, dir: 1 } }), 0, S)).toBe(true)
    expect(fleetOnBoard(fleet({ mode: 'docked', docked: { parentId: 'p' } }), 0, S)).toBe(true)
    expect(
      fleetOnBoard(fleet({ mode: 'laneHold', laneHold: { from: 'a', to: 'b', fraction: 0.5 } }), 0, S),
    ).toBe(false)
  })
})

describe('fleetScenePixel', () => {
  it('rides a docked fleet on its parent body\u2019s glided point', () => {
    const planet = feature({ id: 'p', orbit: { ring: 2, angle0: 0, period: 60, dir: 1 } })
    const docked = fleet({ mode: 'docked', docked: { parentId: 'p' } })
    expect(fleetScenePixel(docked, [planet], 10, S)).toEqual(featureGlidePixel(planet, 10, S))
  })

  it('resolves a moon parent through ITS parent with the sibling offset BoardScene draws', () => {
    const planet = feature({ id: 'p', orbit: { ring: 2, angle0: 0, period: 60, dir: 1 } })
    const moonA = feature({ id: 'mA', type: 'moon', parentId: 'p' })
    const moonB = feature({ id: 'mB', type: 'moon', parentId: 'p' })
    const docked = fleet({ mode: 'docked', docked: { parentId: 'mB' } })
    const expected = featureGlidePixel(moonB, 10, S, featureGlidePixel(planet, 10, S), 1)
    expect(fleetScenePixel(docked, [planet, moonA, moonB], 10, S)).toEqual(expected)
  })

  it('falls back to the fleet\u2019s own glide when it is not docked', () => {
    const coasting = fleet({ mode: 'coast', coast: { ring: 3, angle0: 0, period: 100, dir: 1 } })
    expect(fleetScenePixel(coasting, [], 25, S)).toEqual(fleetGlidePixel(coasting, 25, S))
  })
})

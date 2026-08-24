import { describe, it, expect } from 'vitest'
import { line, routeAround } from '@/lib/hex'
import { hexToPixel } from '@/lib/hex/pixel'
import {
  DEFAULT_SCHEDULE,
  RADIAL_UNIT,
  arcPath,
  cellAspect,
  SCHEDULE_PRESETS,
  cellCount,
  cellToPoint,
  coreCrossings,
  hexCellCount,
  hexSlotsForRing,
  isAdjacent,
  isotropy,
  maxTurnDeg,
  normalizeSlot,
  orbAngleAt,
  orbCellAt,
  pathLength,
  pathPoints,
  pointToCell,
  polarToPoint,
  smoothPath,
  shortWay,
  slotAngle,
  slotsForRing,
  type PolarCell,
} from './polar'

describe('slot schedule', () => {
  it('holds a constant slot count across a band and doubles at the boundaries', () => {
    // Default (tight bands): 6 at ring 1, 12 at 2, 24 for 3-4, 48 for 5-8,
    // 96 for 9-16, 192 for 17+.
    expect(slotsForRing(0)).toBe(1)
    expect(slotsForRing(1)).toBe(6)
    expect(slotsForRing(2)).toBe(12)
    expect(slotsForRing(4)).toBe(24)
    expect(slotsForRing(8)).toBe(48)
    expect(slotsForRing(16)).toBe(96)
  })

  it('keeps radial neighbours 1:1 inside a band and exactly 2:1 at a boundary', () => {
    // The pole problem stated as a ratio: this is what a 6N polar grid gets
    // wrong (ring 10's 60 slots onto ring 9's 54) and what banding fixes.
    expect(slotsForRing(6) / slotsForRing(7)).toBe(1)
    expect(slotsForRing(9) / slotsForRing(8)).toBe(2)
  })

  it('cannot buy inner resolution with slot count — the bench finding', () => {
    // The tempting move is to give ring 1 more cells than cube's six. It
    // works, and the cells are slivers: ring 1 only has 2*PI*unit of
    // circumference to divide. Geometry, not lattice.
    expect(hexSlotsForRing(1)).toBe(6)
    const dense = SCHEDULE_PRESETS['Inner-dense']
    expect(slotsForRing(1, dense)).toBe(24)
    expect(cellAspect(1, dense)).toBeLessThan(0.3)
    expect(isotropy(16, dense).min).toBeLessThan(0.3)
  })

  it('measures its own anisotropy, the cost of banding', () => {
    // The best a banded schedule manages, against cube's flat 1.05 at every
    // ring — the one property being traded away.
    const iso = isotropy(16)
    expect(iso.min).toBeGreaterThan(0.55)
    expect(iso.max).toBeLessThanOrEqual(1.06)
    for (const ring of [1, 5, 9, 16]) {
      expect((Math.PI * 2 * ring) / hexSlotsForRing(ring)).toBeCloseTo(1.047, 3)
    }
    // A cell at the top of a band is stretched tangentially; doubling snaps
    // it back.
    expect(cellAspect(4)).toBeGreaterThan(cellAspect(5))
  })

  it('spends a comparable cell budget to the hex board it would replace', () => {
    expect(cellCount(16)).toBeGreaterThan(hexCellCount(16) * 0.5)
    expect(cellCount(16)).toBeLessThan(hexCellCount(16) * 1.5)
  })
})

describe('projection', () => {
  it('places every cell on a ring at exactly that ring radius — no breathing', () => {
    // Claim 1. The cube lattice cannot do this: its ring-N cells sit between
    // N*(sqrt3/2) and N.
    for (const ring of [1, 5, 9, 16]) {
      const slots = slotsForRing(ring)
      for (let slot = 0; slot < slots; slot += 3) {
        const p = cellToPoint({ ring, slot })
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(ring * RADIAL_UNIT, 6)
      }
    }
  })

  it('shows the cube lattice breathing, for contrast', () => {
    // Same assertion run against production geometry: ring-9 hex centres vary
    // in radius by ~13%, which is the artefact the polar projection removes.
    const radii = [
      Math.hypot(hexToPixel(9, 0).x, hexToPixel(9, 0).y),
      Math.hypot(hexToPixel(5, -9).x, hexToPixel(5, -9).y),
    ]
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.1)
  })

  it('round-trips a cell through pixels and back', () => {
    for (const cell of [{ ring: 1, slot: 0 }, { ring: 7, slot: 19 }, { ring: 16, slot: 61 }]) {
      expect(pointToCell(cellToPoint(cell))).toEqual(cell)
    }
    expect(pointToCell({ x: 0, y: 0 })).toEqual({ ring: 0, slot: 0 })
  })

  it('normalizes slots and angle deltas', () => {
    expect(normalizeSlot(-1, 24)).toBe(23)
    expect(normalizeSlot(25, 24)).toBe(1)
    expect(shortWay(Math.PI * 1.5)).toBeCloseTo(-Math.PI * 0.5, 10)
  })
})

describe('orbits', () => {
  const orbit = { ring: 6, angle0: 3, period: 60_000, dir: 1 }

  it('advances by integer truncating division, preserving the Go/TS seam', () => {
    // Claim 3. Same BigInt discipline as lib/hex orbState, so a Go int64
    // mirror agrees bit-for-bit. No trig reaches a stored value.
    const slots = slotsForRing(6)
    expect(orbCellAt(orbit, 0)).toEqual({ ring: 6, slot: 3 })
    // A full period returns to the epoch slot.
    expect(orbCellAt(orbit, 60_000)).toEqual({ ring: 6, slot: 3 })
    // Half a period is exactly half the slots around.
    expect(orbCellAt(orbit, 30_000)).toEqual({ ring: 6, slot: normalizeSlot(3 + slots / 2, slots) })
  })

  it('is motionless at the core and with motion off', () => {
    expect(orbCellAt({ ring: 0, angle0: 0, period: 0, dir: 1 }, 99_999)).toEqual({ ring: 0, slot: 0 })
    expect(orbCellAt({ ...orbit, period: 0 }, 99_999)).toEqual({ ring: 6, slot: 3 })
  })

  it('runs the render-side angle at a uniform rate on a fixed radius', () => {
    // The interpolated picture over the quantized simulation: equal time
    // slices sweep equal angle, which the cube ring walk does not do.
    const a = orbAngleAt(orbit, 0)
    const b = orbAngleAt(orbit, 15_000)
    const c = orbAngleAt(orbit, 30_000)
    expect(b - a).toBeCloseTo(c - b, 10)
    expect(c - a).toBeCloseTo(Math.PI, 10)
    // And the radius never moves.
    for (const t of [0, 7_000, 41_000]) {
      const p = polarToPoint(orbit.ring, orbAngleAt(orbit, t))
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(6 * RADIAL_UNIT, 6)
    }
  })

  it('keeps the quantized cell and the drawn angle in agreement', () => {
    const slots = slotsForRing(orbit.ring)
    for (const t of [0, 5_000, 22_500, 58_000]) {
      const cell = orbCellAt(orbit, t)
      const drawn = orbAngleAt(orbit, t)
      const gap = Math.abs(shortWay(drawn - slotAngle(cell)))
      // The glide never runs more than one cell ahead of the simulation.
      expect(gap).toBeLessThanOrEqual((Math.PI * 2) / slots + 1e-9)
    }
  })
})

describe('arcPath', () => {
  it('returns a contiguous run of cells', () => {
    const cases: Array<[PolarCell, PolarCell]> = [
      [{ ring: 11, slot: 22 }, { ring: 11, slot: 1 }],
      [{ ring: 14, slot: 5 }, { ring: 3, slot: 14 }],
      [{ ring: 2, slot: 0 }, { ring: 16, slot: 70 }],
      [{ ring: 9, slot: 40 }, { ring: 9, slot: 41 }],
    ]
    for (const [from, to] of cases) {
      const path = arcPath(from, to)
      expect(path[0]).toEqual(from)
      expect(path[path.length - 1]).toEqual(to)
      for (let i = 1; i < path.length; i++) {
        expect(isAdjacent(path[i - 1], path[i], DEFAULT_SCHEDULE)).toBe(true)
      }
    }
  })

  it('is a single cell when the endpoints coincide', () => {
    expect(arcPath({ ring: 4, slot: 9 }, { ring: 4, slot: 9 })).toEqual([{ ring: 4, slot: 9 }])
  })

  it('holds the ring for a same-ring transfer instead of cutting the chord', () => {
    // Claim 2, simplest case: a tangential burn stays on its ring. The cube
    // solve draws a chord that dips inside it.
    const path = arcPath({ ring: 10, slot: 4 }, { ring: 10, slot: 28 })
    for (const cell of path) expect(cell.ring).toBe(10)
  })

  it('turns far more gently than the cube lattice on the same order', () => {
    // The headline measurement, and the reason the spike exists. A cube line
    // staircases between two of six axial directions; an arc does not.
    const from = { ring: 11, slot: 44 }
    const to = { ring: 11, slot: 92 }
    const polarTurn = maxTurnDeg(pathPoints(arcPath(from, to)))

    const a = pointToCell(cellToPoint(from))
    const b = pointToCell(cellToPoint(to))
    const hexPath = routeAround(
      { q: Math.round(cellToPoint(a).x / RADIAL_UNIT), r: 0 },
      { q: Math.round(cellToPoint(b).x / RADIAL_UNIT), r: 0 },
    )
    expect(hexPath.length).toBeGreaterThan(0)
    expect(polarTurn).toBeLessThan(30)
  })

  it('never reaches the core unless an endpoint is the core', () => {
    // This is what deletes lib/hex routeAround: there is no star to avoid,
    // because a polar path structurally cannot cross the centre.
    const across = arcPath({ ring: 11, slot: 44 }, { ring: 11, slot: 92 })
    expect(coreCrossings(across)).toBe(0)

    // The cube solve on the equivalent order has to detour, and the detour is
    // a hard corner.
    const detour = routeAround({ q: -11, r: 0 }, { q: 11, r: 0 })
    const direct = line({ q: -11, r: 0 }, { q: 11, r: 0 })
    expect(direct.some((h) => h.q === 0 && h.r === 0)).toBe(true)
    expect(detour.some((h) => h.q === 0 && h.r === 0)).toBe(false)
    expect(maxTurnDeg(detour.map((h) => hexToPixel(h.q, h.r)))).toBeGreaterThan(20)
  })

  it('goes straight in when the destination IS the core', () => {
    const path = arcPath({ ring: 8, slot: 12 }, { ring: 0, slot: 0 })
    expect(path[path.length - 1]).toEqual({ ring: 0, slot: 0 })
    // Purely radial: every cell sits on the origin's bearing, to within the
    // half-cell its own ring can resolve. The coarse inner rings only get
    // within 30 degrees because they only carry six slots — the sliver
    // tradeoff showing up from the other side.
    const angle = slotAngle({ ring: 8, slot: 12 })
    for (const cell of path.slice(0, -1)) {
      const halfCell = Math.PI / slotsForRing(cell.ring)
      expect(Math.abs(shortWay(slotAngle(cell) - angle))).toBeLessThanOrEqual(halfCell + 1e-9)
    }
  })

  it('costs more distance than the chord — the movement-tuning bill', () => {
    // An arc is longer than the straight line between the same endpoints.
    // Every travel-time constant moves with this, which is the honest price
    // of the migration and why the bench prints it.
    const from = { ring: 12, slot: 10 }
    const to = { ring: 12, slot: 40 }
    const arcLen = pathLength(pathPoints(arcPath(from, to)))
    const a = cellToPoint(from)
    const b = cellToPoint(to)
    const chord = Math.hypot(b.x - a.x, b.y - a.y)
    expect(arcLen).toBeGreaterThan(chord)
  })
})

describe('path metrics', () => {
  it('scores a straight run at zero turn and a right angle at 90 degrees', () => {
    expect(maxTurnDeg([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBeCloseTo(0, 6)
    expect(maxTurnDeg([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toBeCloseTo(90, 6)
  })

  it('ignores zero-length segments rather than reporting a spurious turn', () => {
    expect(maxTurnDeg([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }])).toBeCloseTo(0, 6)
  })

  it('sums segment lengths', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 9 }])).toBeCloseTo(10, 6)
  })
})

describe('smoothPath', () => {
  it('leaves the endpoints where they were', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const out = smoothPath(pts, 3)
    expect(out[0]).toEqual(pts[0])
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('cuts a right-angle corner down but never quite to nothing', () => {
    const corner = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const before = maxTurnDeg(corner)
    const after = maxTurnDeg(smoothPath(corner, 3))
    expect(before).toBeCloseTo(90, 6)
    expect(after).toBeLessThan(30)
    expect(after).toBeGreaterThan(0)
  })

  it('is a no-op on a path too short to have a corner', () => {
    const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    expect(smoothPath(two, 3)).toEqual(two)
  })

  it('shows the raw-cell turn to be a measure of the lattice, not the path', () => {
    // Cube staircases between two of six axial directions and so scores a flat
    // 60 on every order — which is why the bench compares smoothed paths. Polar
    // varies with how radial the transfer is.
    const flat = maxTurnDeg(routeAround({ q: -11, r: 0 }, { q: 11, r: 0 }).map((h) => hexToPixel(h.q, h.r)))
    const other = maxTurnDeg(routeAround({ q: -9, r: 3 }, { q: 7, r: 2 }).map((h) => hexToPixel(h.q, h.r)))
    expect(flat).toBeCloseTo(other, 0)
  })

  it('smooths a tangential arc nearly flat and a mixed transfer much less', () => {
    // The honest split this spike found: the arc benefit is large for
    // tangential work and INVERTS for mixed descents, where the ring staircase
    // aliases against the slot steps and jolts harder than cube's uniform one.
    const tangential = smoothPath(pathPoints(arcPath({ ring: 8, slot: 4 }, { ring: 8, slot: 28 })))
    // Ten rings down while sweeping most of a half-turn: the two axes alias.
    const mixed = smoothPath(pathPoints(arcPath({ ring: 13, slot: 12 }, { ring: 3, slot: 14 })))
    expect(maxTurnDeg(tangential)).toBeLessThan(2)
    expect(maxTurnDeg(mixed)).toBeGreaterThan(maxTurnDeg(tangential) * 3)
  })
})

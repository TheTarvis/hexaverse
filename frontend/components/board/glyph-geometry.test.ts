import { describe, it, expect } from 'vitest'
import { featureGlidePixel, featureLogicalCell, headingDeg, orbitGlidePixel } from './glyph-geometry'
import { cellToPoint, orbState, productionSchedule, type Orbit } from '@/lib/board'

// The board's slot schedule. These are unit tests of pure projection folds —
// no cell enumeration, no rim clamping — so the process-wide schedule is
// exact here (design.md, schedule-threading Decision).
const S = productionSchedule()
import type { BoardFeature } from '@/lib/types/system-board'

const feature = (over: Partial<BoardFeature>): BoardFeature => ({
  id: 'f',
  type: 'rocky',
  footprint: [{ ring: 0, slot: 0 }],
  band: 'visible',
  live: true,
  ...over,
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

// `burnGlidePixel`/`fleet position`/`fleetScenePixel` (fleetGlidePixel,
// fleetLogicalCell, fleetOnBoard, fleetScenePixel, sensorBubbleCells)
// DELETED, with reason: migrate-fleet-to-continuous-burns design.md
// Decision 12 — the board draws no fleet layer after this change, and a
// fleet has no board cell any more (only a continuous-space position), so
// glyph-geometry.ts carries no fleet-position helper at all (see the
// module's own header comment and tasks.md 8.1/8.7). `board-view` REMOVED
// "Foreign Fleets Render as Contact Marks Only" (the sensor-bubble/dock
// hand-off scenarios' owning requirement) with no successor. No test
// replaces these — there is no scenario left to cover. `headingDeg`, the
// one pure helper from that block with no fleet dependency, is kept below.

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

describe('headingDeg', () => {
  it('reports a heading of 0 for coincident points and +x → 0°', () => {
    expect(headingDeg({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0)
    expect(headingDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0)
    expect(headingDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 5)
  })
})

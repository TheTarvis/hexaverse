import { describe, expect, it } from 'vitest'
import { slotsForRing } from '@/lib/polar'
import { schedule } from './board'
import {
  PLANET_OCCLUSION_RADIUS2,
  STAR_OCCLUSION_RADIUS2,
  beamCells,
  lineOfSight,
  type Occluder,
} from './visibility'
import { TABLE_SCALE } from './table'

const s = schedule(10)
const star: Occluder = { cell: { ring: 0, slot: 0 }, radius2: STAR_OCCLUSION_RADIUS2 }
const planet: Occluder = { cell: { ring: 4, slot: 0 }, radius2: PLANET_OCCLUSION_RADIUS2 }

describe('lineOfSight', () => {
  it('an empty occluder set is always visible', () => {
    expect(lineOfSight({ ring: 2, slot: 3 }, { ring: 9, slot: 40 }, [], s)).toBe(true)
  })

  it('the core star occludes the far side of the board', () => {
    expect(lineOfSight({ ring: 6, slot: 0 }, { ring: 6, slot: 24 }, [star], s)).toBe(false)
    expect(lineOfSight({ ring: 6, slot: 0 }, { ring: 6, slot: 24 }, [], s)).toBe(true)
    expect(lineOfSight({ ring: 6, slot: 0 }, { ring: 6, slot: 4 }, [star], s)).toBe(true)
  })

  it('a planet shadows behind, never itself or in front', () => {
    expect(lineOfSight({ ring: 1, slot: 0 }, { ring: 8, slot: 0 }, [planet], s)).toBe(false)
    expect(lineOfSight({ ring: 1, slot: 0 }, { ring: 4, slot: 0 }, [planet], s)).toBe(true)
    expect(lineOfSight({ ring: 1, slot: 0 }, { ring: 3, slot: 0 }, [planet], s)).toBe(true)
    expect(lineOfSight({ ring: 8, slot: 0 }, { ring: 1, slot: 0 }, [planet], s)).toBe(false)
    expect(lineOfSight({ ring: 1, slot: 0 }, { ring: 8, slot: 12 }, [planet], s)).toBe(true)
  })
})

describe('beamCells', () => {
  const p = { halfWidthBase: TABLE_SCALE / 2, spreadNum: 1, spreadDen: 4, rimRing: 8 }

  it('an aim on the origin yields no beam', () => {
    expect(beamCells({ ring: 3, slot: 0 }, { ring: 3, slot: 0 }, p, s)).toEqual([])
  })

  it('contains origin, aim, and the rim cell on the bearing; nothing behind', () => {
    const beam = beamCells({ ring: 1, slot: 0 }, { ring: 5, slot: 0 }, p, s)
    const has = (ring: number, slot: number) => beam.some((c) => c.ring === ring && c.slot === slot)
    expect(has(1, 0)).toBe(true)
    expect(has(5, 0)).toBe(true)
    expect(has(8, 0)).toBe(true)
    expect(has(8, 24)).toBe(false)
    for (const c of beam) expect(c.ring).toBeLessThanOrEqual(p.rimRing)
  })

  it('is emitted in (ring, slot) order', () => {
    const beam = beamCells({ ring: 1, slot: 0 }, { ring: 5, slot: 0 }, p, s)
    for (let i = 1; i < beam.length; i++) {
      const a = beam[i - 1]
      const b = beam[i]
      expect(a.ring < b.ring || (a.ring === b.ring && a.slot < b.slot)).toBe(true)
    }
  })

  it('a zero-spread corridor is no wider than a spread one', () => {
    const spread = beamCells({ ring: 1, slot: 0 }, { ring: 5, slot: 0 }, p, s)
    const flat = beamCells({ ring: 1, slot: 0 }, { ring: 5, slot: 0 }, { ...p, spreadNum: 0, spreadDen: 1 }, s)
    expect(flat.length).toBeGreaterThan(0)
    expect(flat.length).toBeLessThanOrEqual(spread.length)
  })

  it('widens with distance under a nonzero spread', () => {
    const beam = beamCells({ ring: 1, slot: 0 }, { ring: 5, slot: 0 }, p, s)
    const perRing = new Map<number, number>()
    for (const c of beam) perRing.set(c.ring, (perRing.get(c.ring) ?? 0) + 1)
    const nearFrac = (perRing.get(2) ?? 0) / slotsForRing(2, s)
    const farFrac = (perRing.get(8) ?? 0) / slotsForRing(8, s)
    expect(farFrac).toBeGreaterThanOrEqual(nearFrac / 2)
  })
})

import { describe, it, expect } from 'vitest'
import { planSweep, occludes } from './scan-preview'
import { cellKey } from '@/lib/board'
import type { BoardFeature } from '@/lib/types/system-board'
import { productionSchedule } from '@/lib/board'

const S = productionSchedule()

// The sweep-preview math (#0006 Decisions #16/#21): a 360° scan covers
// everything with clear line of sight; the plan's job is the SHADOW — the
// cells a sweep from here would not reveal. The authoritative reveal stays
// server-side; agreement comes from the shared lib/hex mirror + goldens.

const star: BoardFeature = {
  id: 'f-star',
  type: 'star',
  fixed: true,
  footprint: [{ ring: 0, slot: 0 }],
  band: 'visible',
  live: true,
}

const belt: BoardFeature = {
  id: 'f-belt',
  type: 'belt',
  footprint: [{ ring: 1, slot: 0 }],
  band: 'visible',
  live: true,
}

describe('occludes', () => {
  it('marks the star and planets, not belts or hazards', () => {
    expect(occludes('star')).toBe(true)
    expect(occludes('rocky')).toBe(true)
    expect(occludes('gas_giant')).toBe(true)
    expect(occludes('ice')).toBe(true)
    expect(occludes('belt')).toBe(false)
    expect(occludes('nebula')).toBe(false)
    expect(occludes('moon')).toBe(false)
  })
})

describe('planSweep', () => {
  it('shadows exactly the cells behind large bodies', () => {
    // Sweep from ring 4 slot 0 — slot 0 is due +x on every ring, so the star at
    // the core shadows the cells on the opposite bearing (180°). Slot counts:
    // ring 2 carries 12 slots, ring 4 carries 24, ring 6 carries 48 — so the
    // half-turn is slot 6, 12 and 24 respectively.
    const plan = planSweep({ ring: 4, slot: 0 }, [star, belt], 6, 0, S)
    const shadowed = new Set(plan.shadowed.map(cellKey))

    expect(shadowed.has(cellKey({ ring: 2, slot: 6 }))).toBe(true) // behind the star
    expect(shadowed.has(cellKey({ ring: 6, slot: 24 }))).toBe(true) // far behind
    expect(shadowed.has(cellKey({ ring: 0, slot: 0 }))).toBe(false) // the occluder itself is seen
    expect(shadowed.has(cellKey({ ring: 2, slot: 0 }))).toBe(false) // clear approach
    expect(shadowed.has(cellKey({ ring: 4, slot: 6 }))).toBe(false) // open angle (90°)
    expect(plan.origin).toEqual({ ring: 4, slot: 0 })
  })

  it('casts no shadow when nothing occludes', () => {
    expect(planSweep({ ring: 4, slot: 0 }, [belt], 6, 0, S).shadowed).toHaveLength(0)
  })
})

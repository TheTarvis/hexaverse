import { describe, it, expect } from 'vitest'
import { planSweep, occludes } from './scan-preview'
import { hexKey } from '@/lib/hex'
import type { BoardFeature } from '@/lib/types/system-board'

// The sweep-preview math (#0006 Decisions #16/#21): a 360° scan covers
// everything with clear line of sight; the plan's job is the SHADOW — the
// cells a sweep from here would not reveal. The authoritative reveal stays
// server-side; agreement comes from the shared lib/hex mirror + goldens.

const star: BoardFeature = {
  id: 'f-star',
  type: 'star',
  fixed: true,
  footprint: [{ q: 0, r: 0 }],
  band: 'visible',
  live: true,
}

const belt: BoardFeature = {
  id: 'f-belt',
  type: 'belt',
  footprint: [{ q: 1, r: 0 }],
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
    // Sweep from (-4,0): the star at the core shadows the far +q axis.
    const plan = planSweep({ q: -4, r: 0 }, [star, belt], 6, 0)
    const shadowed = new Set(plan.shadowed.map(hexKey))

    expect(shadowed.has(hexKey({ q: 2, r: 0 }))).toBe(true) // behind the star
    expect(shadowed.has(hexKey({ q: 6, r: 0 }))).toBe(true) // far behind
    expect(shadowed.has(hexKey({ q: 0, r: 0 }))).toBe(false) // the occluder itself is seen
    expect(shadowed.has(hexKey({ q: -2, r: 0 }))).toBe(false) // clear approach
    expect(shadowed.has(hexKey({ q: 0, r: 4 }))).toBe(false) // open angle
    expect(plan.origin).toEqual({ q: -4, r: 0 })
  })

  it('casts no shadow when nothing occludes', () => {
    expect(planSweep({ q: -4, r: 0 }, [belt], 6, 0).shadowed).toHaveLength(0)
  })
})

import { describe, it, expect } from 'vitest'
import type { BoardFeature } from '@/lib/types/system-board'
import { projectWorldTime } from '@/hooks/use-world-time'
import { createFramePacker } from './board-frame'
import { featureGlidePixel } from './glyph-geometry'
import { productionSchedule } from '@/lib/board'
import { boardToWorld } from './use-board-projection'

const orbiter: BoardFeature = {
  id: 'p1',
  type: 'rocky',
  orbit: { ring: 3, angle0: 0, period: 60_000, dir: 1 },
  footprint: [{ ring: 3, slot: 0 }],
  band: 'visible',
  live: true,
}

const ANCHOR = { world: 500_000, wall: 10_000 }

function packerWith(overrides?: Partial<Parameters<typeof createFramePacker>[0]>) {
  return createFramePacker({
    features: [orbiter],
    anchor: ANCHOR,
    fxEpochWall: 0,
    reducedMotion: false,
    getSelectedId: () => null,
    ...overrides,
  })
}

describe('createFramePacker — the world clock (task 3.2a)', () => {
  it('derives per-frame worldTime from the projected server anchor, not an integrated timer', () => {
    // The packer's positions at wall instant T must equal glyph-geometry
    // evaluated at projectWorldTime(anchor, T) — the SAME closed-form
    // projection useWorldTime uses. A locally integrated clock would drift
    // from this the moment a frame is skipped; the closed form cannot.
    const pack = packerWith()
    for (const wall of [ANCHOR.wall, ANCHOR.wall + 12_345, ANCHOR.wall + 3_600_000]) {
      const frame = pack(wall)
      const worldTime = projectWorldTime(ANCHOR, wall, 1)
      const expected = boardToWorld(featureGlidePixel(orbiter, worldTime, productionSchedule()))
      expect(frame.bodyOffsets[0]).toBeCloseTo(expected.x, 3)
      expect(frame.bodyOffsets[1]).toBeCloseTo(expected.y, 3)
    }
  })

  it('re-anchoring (a new packer from a fresh read) snaps to the new server time', () => {
    // 913_000 is deliberately NOT a whole number of 60s orbital periods past
    // the first anchor's projected time, so the two positions genuinely differ.
    const wall = 50_000
    const a = packerWith()(wall)
    const rebased = { world: 913_000, wall }
    const b = packerWith({ anchor: rebased })(wall)
    const expected = boardToWorld(featureGlidePixel(orbiter, 913_000, productionSchedule()))
    expect(b.bodyOffsets[0]).toBeCloseTo(expected.x, 3)
    // And the two anchors genuinely disagree, so this asserts something.
    expect(a.bodyOffsets[0]).not.toBeCloseTo(expected.x, 3)
  })
})

describe('createFramePacker — reduced motion (task 4.12)', () => {
  it('freezes the decorative clock while positions keep advancing with world time', () => {
    const pack = packerWith({ reducedMotion: true })
    const f1 = pack(ANCHOR.wall)
    const p1 = [f1.bodyOffsets[0]!, f1.bodyOffsets[1]!]
    const t1 = f1.fxTime
    const f2 = pack(ANCHOR.wall + 20_000)
    expect(f2.fxTime).toBe(t1) // frozen static state, not a paused sample
    expect(t1).toBe(0)
    // The world still turns. Compare the POINT, not one axis: two slots on the
    // same ring can share an x (120° and 240° do) while sitting nowhere near
    // each other, so an x-only assertion passes and fails by coincidence.
    const p2 = [f2.bodyOffsets[0]!, f2.bodyOffsets[1]!]
    expect(Math.hypot(p2[0]! - p1[0]!, p2[1]! - p1[1]!)).toBeGreaterThan(1)
  })

  it('runs the decorative clock from the fx epoch otherwise', () => {
    const pack = packerWith({ fxEpochWall: 4_000 })
    expect(pack(10_000).fxTime).toBeCloseTo(6, 6)
  })
})

// `createFramePacker — fleets` DELETED, with reason: migrate-fleet-to-
// continuous-burns design.md Decision 12 — the board draws no fleet layer
// after this change, so `board-frame.ts`'s packer no longer folds a fleet's
// movement state or emits a `frame.fleets` array at all (see the module's own
// header comment and tasks.md 8.1/8.7). `board-view` REMOVED "Foreign Fleets
// Render as Contact Marks Only" with no successor. No test replaces these —
// there is no scenario left to cover.

describe('createFramePacker — selected ring (task 3.5a)', () => {
  it('threads the selected feature ring through as a plain index', () => {
    let selected: string | null = null
    const pack = packerWith({ getSelectedId: () => selected })
    expect(pack(ANCHOR.wall).selectedRing).toBe(-1)
    selected = 'p1'
    expect(pack(ANCHOR.wall).selectedRing).toBe(3)
  })
})

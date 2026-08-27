import { describe, it, expect } from 'vitest'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { projectWorldTime } from '@/hooks/use-world-time'
import { createFramePacker } from './board-frame'
import { featureGlidePixel } from './glyph-geometry'
import { productionSchedule } from '@/lib/board'
import { boardToWorld } from './use-board-projection'
import { hexToRgb } from './board-pack'
import { FLEET_ACCENT, FLEET_FOREIGN } from './board-palette'

const orbiter: BoardFeature = {
  id: 'p1',
  type: 'rocky',
  orbit: { ring: 3, angle0: 0, period: 60_000, dir: 1 },
  footprint: [{ ring: 3, slot: 0 }],
  band: 'visible',
  live: true,
}

function ownBurner(): Fleet {
  return {
    id: 'own-1',
    corporationId: 'c',
    systemId: 's',
    state: {
      mode: 'burn',
      burn: {
        path: [
          { ring: 4, slot: 0 },
          { ring: 3, slot: 0 },
          { ring: 2, slot: 0 },
        ],
        startTime: 0,
        arriveTime: 1_000_000,
        target: { cell: { ring: 2, slot: 0 } },
      },
    },
    position: { ring: 4, slot: 0 },
    own: true,
    worldTime: 0,
  }
}

const ANCHOR = { world: 500_000, wall: 10_000 }

function packerWith(overrides?: Partial<Parameters<typeof createFramePacker>[0]>) {
  return createFramePacker({
    features: [orbiter],
    fleets: [ownBurner()],
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

describe('createFramePacker — fleets', () => {
  it('resolves an own burning fleet to its mode accent with the plume lit', () => {
    const frame = packerWith()(ANCHOR.wall)
    expect(frame.fleets).toHaveLength(1)
    expect(frame.fleets[0]!.burning).toBe(1)
    expect(frame.fleets[0]!.accent).toEqual(hexToRgb(FLEET_ACCENT.burn))
  })

  it('resolves a foreign fleet to the grey contact accent with no mode signals', () => {
    const foreign: Fleet = {
      ...ownBurner(),
      id: 'foreign-1',
      own: false,
      state: { mode: 'coast', coast: { ring: 4, angle0: 0, period: 60_000, dir: 1 } },
    }
    const frame = packerWith({ fleets: [foreign] })(ANCHOR.wall)
    expect(frame.fleets[0]!.accent).toEqual(hexToRgb(FLEET_FOREIGN))
    expect(frame.fleets[0]!.burning).toBe(0)
    expect(frame.fleets[0]!.docked).toBe(0)
  })

  it('folds an arrived burn to its settled mode (stateAt, not raw wire state)', () => {
    // Past arriveTime the burn IS its coast — the accent must not stay amber
    // waiting on a refetch.
    const pack = packerWith()
    const pastArrival = ANCHOR.wall + 600_000 // worldTime 1_100_000 > arriveTime
    const frame = pack(pastArrival)
    expect(frame.fleets[0]!.burning).toBe(0)
  })
})

describe('createFramePacker — selected ring (task 3.5a)', () => {
  it('threads the selected feature ring through as a plain index', () => {
    let selected: string | null = null
    const pack = packerWith({ getSelectedId: () => selected })
    expect(pack(ANCHOR.wall).selectedRing).toBe(-1)
    selected = 'p1'
    expect(pack(ANCHOR.wall).selectedRing).toBe(3)
  })
})

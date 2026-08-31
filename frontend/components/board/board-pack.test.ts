import { describe, it, expect } from 'vitest'
import { RADIAL_UNIT } from '@/lib/board'
import type { BoardFeature, FogBand } from '@/lib/types/system-board'
import {
  DRAW_RADIUS,
  createPackedScene,
  fogQuadFor,
  hexToRgb,
  packBodyInstance,
  packRings,
  seedFromId,
  sortFeaturesForDraw,
} from './board-pack'

function feature(overrides: Partial<BoardFeature> & { id: string }): BoardFeature {
  return {
    type: 'rocky',
    footprint: [{ ring: 2, slot: 1 }],
    band: 'visible',
    live: true,
    orbit: { ring: 3, angle0: 0, period: 60_000, dir: 1 },
    ...overrides,
  }
}

// `### Requirement: Fog Band Determines a Feature's Board Treatment` — the
// band → treatment mapping, assertable outside any rendering context.
describe('fogQuadFor / packBodyInstance', () => {
  it('gives an astronomical-band body NO lit surface — outline only', () => {
    expect(packBodyInstance(feature({ id: 'f1', band: 'astronomical' })).fog.wireOnly).toBe(1)
  })

  it('gives visible and remembered bodies a lit surface', () => {
    expect(packBodyInstance(feature({ id: 'f1', band: 'visible' })).fog.wireOnly).toBe(0)
    expect(packBodyInstance(feature({ id: 'f1', band: 'remembered' })).fog.wireOnly).toBe(0)
  })

  it('pins remembered/visible to the opacity-era treatment: chroma 0, breakUp 0', () => {
    // The spike's signal-quality fog (chroma 0.16, animated break-up) is
    // deferred to board-visual-language — this port must not carry it silently.
    for (const band of ['visible', 'remembered'] as FogBand[]) {
      const fog = fogQuadFor(band)
      expect(fog.chroma).toBe(0)
      expect(fog.breakUp).toBe(0)
    }
  })

  it('dims remembered below visible so the treatments stay visibly distinct', () => {
    expect(fogQuadFor('remembered').dim).toBeLessThan(fogQuadFor('visible').dim)
  })

  it('falls back to the astronomical treatment for an absent or unrecognised band', () => {
    expect(fogQuadFor(undefined)).toEqual(fogQuadFor('astronomical'))
    expect(fogQuadFor('surveyed')).toEqual(fogQuadFor('astronomical'))
    expect(fogQuadFor('')).toEqual(fogQuadFor('astronomical'))
  })

  it('is deterministic: same feature, same band → identical packed instance', () => {
    const a = packBodyInstance(feature({ id: 'planet-9', band: 'remembered' }))
    const b = packBodyInstance(feature({ id: 'planet-9', band: 'remembered' }))
    expect(a).toEqual(b)
  })

  it('derives the surface seed from the feature id, not any random source', () => {
    expect(seedFromId('planet-9')).toBe(seedFromId('planet-9'))
    expect(seedFromId('planet-9')).not.toBe(seedFromId('planet-8'))
  })

  it('resolves every feature type to a colour and radius (no undefined renders)', () => {
    for (const type of Object.keys(DRAW_RADIUS) as BoardFeature['type'][]) {
      const packed = packBodyInstance(feature({ id: 'f', type }))
      expect(packed.radius).toBeGreaterThan(0)
      expect(packed.color.every((c) => c >= 0 && c <= 1)).toBe(true)
    }
  })
})

describe('sortFeaturesForDraw', () => {
  it('orders parents before children so a moon draws above its parent', () => {
    const parent = feature({ id: 'planet' })
    const moon = feature({ id: 'a-moon', type: 'moon', parentId: 'planet', orbit: undefined })
    const order = sortFeaturesForDraw([moon, parent])
    expect(order.map((f) => f.id)).toEqual(['planet', 'a-moon'])
  })

  it('excludes the star (drawn as the light source, not an instanced body)', () => {
    const star = feature({ id: 'star', type: 'star', fixed: true, orbit: undefined })
    expect(sortFeaturesForDraw([star, feature({ id: 'p' })]).map((f) => f.id)).toEqual(['p'])
  })
})

// `packFleetInstance`/`formationOffsets` (the fleet hull-slot pack, covering
// `### Requirement: Foreign Fleets Render as Contact Marks Only`) DELETED,
// with reason: migrate-fleet-to-continuous-burns design.md Decision 12 — the
// board draws no fleet layer at all after this change (a fleet's position is
// now a continuous-space `space.Vec3`, not a board cell, so there is nothing
// left to pack an instance from). `board-view` REMOVED "Foreign Fleets
// Render as Contact Marks Only" with no successor (openspec/changes/
// migrate-fleet-to-continuous-burns/specs/board-view/spec.md). `board-pack.ts`
// itself confirms the deletion in its own trailing comment. No test replaces
// these — there is no scenario left to cover.

describe('createPackedScene', () => {
  const board = {
    systemId: 's',
    radius: 4,
    character: 'normal',
    starClass: 'G',
    features: [
      feature({ id: 'star', type: 'star', fixed: true, orbit: undefined, footprint: [{ ring: 0, slot: 0 }] }),
      feature({ id: 'p1', orbit: { ring: 2, angle0: 0, period: 60_000, dir: 1 } }),
      feature({ id: 'p2', band: 'astronomical', orbit: { ring: 3, angle0: 4, period: 90_000, dir: -1 } }),
    ],
    laneGates: [],
    worldTime: 0,
  }

  it('packs the star separately with its class tint resolved', () => {
    const scene = createPackedScene(board)
    expect(scene.star).not.toBeNull()
    expect(scene.star!.tint).toEqual(hexToRgb('#ffd27d')) // G-class gold
    expect(scene.bodies.map((b) => b.id)).toEqual(['p1', 'p2'])
  })

  it('packs one lattice tile per cell with a resolved tint', () => {
    const scene = createPackedScene(board)
    // The banded schedule at radius 4: ring 0 carries 1 slot, then 6, 12, 24, 24.
    expect(scene.latticeTiles).toHaveLength(1 + 6 + 12 + 24 + 24)
    expect(scene.latticeTiles.every((t) => t.tint.length === 3)).toBe(true)
  })

  it('carries the annular-sector bounds the shader carves each tile with', () => {
    // The wedge's BOUNDS are packer output — which cells exist, how many slots
    // a ring carries, where a ring sits radially are all schedule decisions,
    // and the decision rule keeps them outside webgl/. The shader gets four
    // numbers and an SDF.
    const scene = createPackedScene(board)
    const core = scene.latticeTiles[0]!
    expect(core.rInner).toBe(0)
    expect(core.angHalf).toBe(Math.PI)

    const rim = scene.latticeTiles[scene.latticeTiles.length - 1]!
    expect(rim.rOuter - rim.rInner).toBeCloseTo(RADIAL_UNIT, 9)
    expect(rim.angHalf).toBeGreaterThan(0)
    expect(rim.angHalf).toBeLessThan(Math.PI)
    // The instance quad must bound the wedge in both axes — the arc is wider
    // at high rings than the hex lattice's one shared size ever was.
    expect(rim.half).toBeGreaterThanOrEqual(RADIAL_UNIT / 2)
    expect(rim.half).toBeGreaterThanOrEqual(rim.rOuter * Math.sin(rim.angHalf))
  })

  it('emits tile angles in GL world space, matching the flipped centre', () => {
    const scene = createPackedScene(board)
    for (const t of scene.latticeTiles.filter((x) => x.rInner > 0)) {
      expect(Math.atan2(t.y, t.x)).toBeCloseTo(t.angCenter, 9)
    }
  })

  it('packs occupied orbit rings as closed GL polylines', () => {
    const rings = packRings(board.features, board.radius)
    expect(rings.map((r) => r.ring)).toEqual([2, 3])
    // Ring 2 carries 12 slots under the banded schedule; xy per cell.
    expect(rings[0]!.points).toHaveLength(12 * 2)
  })
})

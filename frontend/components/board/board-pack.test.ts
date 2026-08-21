import { describe, it, expect } from 'vitest'
import type { BoardFeature, FogBand } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import {
  DRAW_RADIUS,
  createPackedScene,
  fogQuadFor,
  formationOffsets,
  hexToRgb,
  packBodyInstance,
  packFleetInstance,
  packRings,
  seedFromId,
  sortFeaturesForDraw,
} from './board-pack'

function feature(overrides: Partial<BoardFeature> & { id: string }): BoardFeature {
  return {
    type: 'rocky',
    footprint: [{ q: 2, r: -1 }],
    band: 'visible',
    live: true,
    orbit: { ring: 3, angle0: 0, period: 60_000, dir: 1 },
    ...overrides,
  }
}

function fleet(overrides: Partial<Fleet> & { id: string; own: boolean }): Fleet {
  return {
    corporationId: 'corp',
    systemId: 'sys',
    state: { mode: 'coast', coast: { ring: 2, angle0: 0, period: 60_000, dir: 1 } },
    position: { q: 2, r: 0 },
    worldTime: 0,
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

// `### Requirement: Foreign Fleets Render as Contact Marks Only` — the
// own/foreign fork, decided outside the renderer.
describe('packFleetInstance', () => {
  it('draws one hull per roster ship for an own fleet', () => {
    const f = fleet({
      id: 'own',
      own: true,
      roster: { ships: [{ class: 'a' }, { class: 'b' }, { class: 'c' }], cargo: null, cargoCapacity: 0, freeHold: 0, miningRate: 0 },
    })
    const packed = packFleetInstance(f)
    expect(packed.audience).toBe(0)
    expect(packed.formation).toHaveLength(3)
  })

  it('renders a rosterless own fleet as a single hull without error', () => {
    const packed = packFleetInstance(fleet({ id: 'own', own: true }))
    expect(packed.audience).toBe(0)
    expect(packed.formation).toHaveLength(1)
  })

  it('renders a foreign fleet as the constant contact mark, roster or not', () => {
    const bare = packFleetInstance(fleet({ id: 'a', own: false }))
    expect(bare.audience).toBe(1)
    expect(bare.formation).toEqual([{ dx: 0, dy: 0 }])
  })

  it('two foreign fleets of different composition pack identically (minus id)', () => {
    // Even if a roster somehow leaked onto a foreign read, the mark must not
    // vary with ANY field of the fleet.
    const a = packFleetInstance(
      fleet({ id: 'a', own: false, roster: { ships: [{ class: 'x' }], cargo: null, cargoCapacity: 1, freeHold: 1, miningRate: 1 } }),
    )
    const b = packFleetInstance(
      fleet({
        id: 'b',
        own: false,
        roster: { ships: [{ class: 'x' }, { class: 'y' }, { class: 'z' }], cargo: null, cargoCapacity: 9, freeHold: 0, miningRate: 2 },
      }),
    )
    expect({ ...a, id: null }).toEqual({ ...b, id: null })
  })
})

describe('formationOffsets', () => {
  it('gives the leader the centre slot and wingmen staggered pairs', () => {
    const slots = formationOffsets(3)
    expect(slots[0]).toEqual({ dx: 0, dy: 0 })
    expect(slots[1]!.dx).toBeLessThan(0)
    expect(slots[2]!.dx).toBeGreaterThan(0)
    expect(slots[1]!.dy).toBe(slots[2]!.dy)
  })

  it('never returns an empty formation', () => {
    expect(formationOffsets(0)).toHaveLength(1)
  })
})

describe('createPackedScene', () => {
  const board = {
    systemId: 's',
    radius: 4,
    character: 'normal',
    starClass: 'G',
    features: [
      feature({ id: 'star', type: 'star', fixed: true, orbit: undefined, footprint: [{ q: 0, r: 0 }] }),
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

  it('packs one lattice tile per hex with a resolved tint', () => {
    const scene = createPackedScene(board)
    expect(scene.latticeTiles).toHaveLength(1 + 3 * 4 * 5) // centred hexagonal number, R=4
    expect(scene.latticeTiles.every((t) => t.tint.length === 3)).toBe(true)
  })

  it('packs occupied orbit rings as closed GL polylines', () => {
    const rings = packRings(board.features)
    expect(rings.map((r) => r.ring)).toEqual([2, 3])
    expect(rings[0]!.points).toHaveLength(6 * 2 * 2) // 12 hexes on ring 2, xy each
  })
})

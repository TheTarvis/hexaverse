import { describe, it, expect } from 'vitest'
import { adaptGalaxy } from './galaxy-service'
import type { WireGalaxy } from '../types/galaxy'

// A small slice mirroring the real /galaxy/start-area.json wire shape.
const wire: WireGalaxy = {
  id: 'gal_test',
  seed: 424242,
  bounds: { x: [-100, 100], y: [-100, 100], z: [-30, 30] },
  worldTime: 12345,
  systems: [
    {
      id: 'sys-0',
      coords: { x: 12.3, y: -8.1, z: 4 },
      name: 'Axion',
      region: 'star_rich',
      tier: 'explored',
      skeleton: {
        starClass: 'G',
        bodies: [
          { type: 'rocky', ring: 3 },
          { type: 'gas_giant', ring: 9 },
        ],
      },
    },
    {
      id: 'sys-12',
      coords: { x: -50, y: 20.5, z: -6 },
      name: 'Borealis',
      region: 'dead',
      tier: 'starVisible',
      skeleton: { starClass: 'M', bodies: [] },
    },
  ],
  lanes: [
    { id: 'lane-0', aId: 'sys-0', bId: 'sys-12' },
    { id: 'lane-1', aId: 'sys-12', bId: 'sys-0', bridge: true },
  ],
}

describe('adaptGalaxy', () => {
  it('flattens coords -> x/y/z and pins them via fx/fy/fz', () => {
    const galaxy = adaptGalaxy(wire)

    const n0 = galaxy.nodes[0]
    expect(n0.x).toBe(12.3)
    expect(n0.y).toBe(-8.1)
    expect(n0.z).toBe(4)
    // Pinned to the generated position so the force layout never moves it.
    expect(n0.fx).toBe(12.3)
    expect(n0.fy).toBe(-8.1)
    expect(n0.fz).toBe(4)
  })

  it('maps lane aId/bId -> source/target', () => {
    const galaxy = adaptGalaxy(wire)

    expect(galaxy.links).toHaveLength(2)
    expect(galaxy.links[0]).toMatchObject({
      id: 'lane-0',
      source: 'sys-0',
      target: 'sys-12',
    })
  })

  it('carries region, tier, name, and the full skeleton through untouched', () => {
    const galaxy = adaptGalaxy(wire)

    expect(galaxy.nodes[0]).toMatchObject({
      id: 'sys-0',
      name: 'Axion',
      region: 'star_rich',
      tier: 'explored',
    })
    expect(galaxy.nodes[0].skeleton).toEqual(wire.systems[0].skeleton)
    // The per-system subspace tier passes through (#0006 replaced `discovered`).
    expect(galaxy.nodes[1].tier).toBe('starVisible')
  })

  it('passes id/seed/bounds/worldTime metadata through', () => {
    const galaxy = adaptGalaxy(wire)

    expect(galaxy).toMatchObject({
      id: 'gal_test',
      seed: 424242,
      worldTime: 12345,
      bounds: wire.bounds,
    })
  })
})

// The endless galaxy stitches voids with `bridge` lanes; the flag must survive
// the wire -> renderer adaptation, because that is the only thing telling the
// view to draw a void crossing differently from a local road. An ordinary lane
// omits the field entirely, so it must adapt to an explicit false rather than
// undefined.
describe('adaptGalaxy bridge lanes', () => {
  it('carries the bridge flag through, defaulting an absent flag to false', () => {
    const galaxy = adaptGalaxy(wire)
    const ordinary = galaxy.links.find((l) => l.id === 'lane-0')
    const bridge = galaxy.links.find((l) => l.id === 'lane-1')

    expect(ordinary?.bridge).toBe(false)
    expect(bridge?.bridge).toBe(true)
  })
})

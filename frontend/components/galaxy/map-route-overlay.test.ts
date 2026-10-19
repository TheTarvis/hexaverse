import { describe, expect, it } from 'vitest'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'
import { resolveRoute } from './map-route-overlay'

const nodes: GalaxyNode[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id, name: id, x: i * 30, y: 0, z: 0, fx: i * 30, fy: 0, fz: 0,
  region: 'normal', tier: 'starVisible', skeleton: { starClass: 'G', bodies: [] },
}))
const galaxy: Galaxy = {
  id: 'review', seed: 1, worldTime: 0, bounds: { x: [0, 100], y: [-50, 50], z: [-10, 10] }, nodes,
  links: [{ id: 'ab', source: 'a', target: 'b', bridge: false }, { id: 'bc', source: 'b', target: 'c', bridge: false }],
}

describe('route overlay knowledge boundary', () => {
  it('rejects the entire overlay when a hop is not a disclosed lane, even when its stars are public', () => {
    expect(resolveRoute(galaxy, { systemIds: ['a', 'b', 'd'], state: 'active', completedLegs: 0 })).toEqual([])
    expect(resolveRoute(galaxy, { systemIds: ['a', 'missing'], state: 'active', completedLegs: 0 })).toEqual([])
  })
  it('follows undirected lanes in itinerary order and never treats an unfinished hop as completed', () => {
    const legs = resolveRoute(galaxy, { systemIds: ['c', 'b', 'a'], state: 'active', completedLegs: 1 })
    expect(legs.map(leg => [leg.from.id, leg.to.id, leg.completed])).toEqual([['c', 'b', true], ['b', 'a', false]])
  })
  it('keeps proposals entirely proposed regardless of progress and handles invalid progress safely', () => {
    const route = { systemIds: ['a', 'b', 'c'], completedLegs: 9 }
    expect(resolveRoute(galaxy, { ...route, state: 'proposed' }).every(leg => !leg.completed)).toBe(true)
    for (const completedLegs of [-1, Number.NaN]) {
      expect(resolveRoute(galaxy, { ...route, state: 'active', completedLegs }).every(leg => !leg.completed)).toBe(true)
    }
  })
})

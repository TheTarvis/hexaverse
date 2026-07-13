import { describe, it, expect } from 'vitest'
import { routePath, transitPoint, type NodePositions } from './transit-geometry'
import type { Fleet } from '@/lib/types/fleet'

// Three stars in a line, 100 apart on x — so a fraction along a lane reads
// straight off the x coordinate.
const nodes: NodePositions = new Map([
  ['a', { x: 0, y: 0, z: 0 }],
  ['b', { x: 100, y: 0, z: 0 }],
  ['c', { x: 200, y: 0, z: 0 }],
])

const fleet = (state: Fleet['state']): Fleet => ({
  id: 'fl',
  corporationId: 'corp-1',
  systemId: 'a',
  state,
  position: { q: 0, r: 0 },
  own: true,
  worldTime: 0,
})

// A two-hop trip a→b→c: gate at t=100, b at t=1100, c at t=2100.
const twoHop = fleet({
  mode: 'laneTransit',
  laneTransit: {
    boardLeg: { path: [{ q: 0, r: 0 }], startTime: 0, gateEta: 100 },
    route: ['a', 'b', 'c'],
    legEtas: [100, 1100, 2100],
    departTime: 0,
    arriveTime: 2100,
    entryGate: { q: -3, r: 0 },
  },
})

describe('transitPoint', () => {
  it('holds at the origin star while the fleet is still crossing its board', () => {
    // Before the gate ETA the fleet hasn't entered the lane — it's burning to the
    // gate, which the BOARD draws. On the graph it's still at its origin.
    expect(transitPoint(twoHop, 50, nodes)).toEqual({ x: 0, y: 0, z: 0 })
  })

  // Spec: 0008/S7
  it('crawls the first lane, then the second, by world time', () => {
    // Halfway down lane a→b.
    expect(transitPoint(twoHop, 600, nodes)?.x).toBeCloseTo(50, 5)
    // At the waypoint star b.
    expect(transitPoint(twoHop, 1100, nodes)?.x).toBeCloseTo(100, 5)
    // A quarter down lane b→c.
    expect(transitPoint(twoHop, 1350, nodes)?.x).toBeCloseTo(125, 5)
  })

  it('clamps to the destination past the arrival (a late read still lands right)', () => {
    expect(transitPoint(twoHop, 99_999, nodes)?.x).toBeCloseTo(200, 5)
  })

  it('parks a held fleet at its frozen fraction', () => {
    const held = fleet({ mode: 'laneHold', laneHold: { from: 'a', to: 'b', fraction: 0.3 } })
    expect(transitPoint(held, 0, nodes)?.x).toBeCloseTo(30, 5)
  })

  it('has no lane point for a fleet sitting in a system', () => {
    const coasting = fleet({ mode: 'coast', coast: { ring: 2, angle0: 0, period: 100, dir: 1 } })
    expect(transitPoint(coasting, 0, nodes)).toBeNull()
  })

  it('returns null rather than a wrong point when a route star is unknown', () => {
    const offGalaxy = fleet({
      mode: 'laneTransit',
      laneTransit: {
        route: ['a', 'zz'],
        legEtas: [0, 1000],
        departTime: 0,
        arriveTime: 1000,
        entryGate: { q: 0, r: 0 },
      },
    })
    expect(transitPoint(offGalaxy, 500, nodes)).toBeNull()
  })
})

describe('routePath', () => {
  it('lights the whole lane chain of a trip', () => {
    expect(routePath(twoHop, nodes)).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 200, y: 0, z: 0 },
    ])
  })

  it('is empty for a fleet that is not on a trip', () => {
    expect(routePath(fleet({ mode: 'coast' }), nodes)).toEqual([])
  })
})

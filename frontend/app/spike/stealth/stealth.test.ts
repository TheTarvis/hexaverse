import { describe, it, expect } from 'vitest'
import { generateSystem, stationKeepRate, bodyPosition } from '../space-3d/sim'
import type { ShipState } from '../space-3d/sim'
import { makePatrol, patrolPosition, patrolState, PATROL_DWELL } from '../intel/intel'
import {
  DARK_SIGNATURE,
  DEFAULT_DIALS,
  contact,
  emptyWatch,
  isOccluded,
  markerInfo,
  parkingOrbitVisibility,
  project,
  shadowWedges,
  signatureRadius,
  stepWatch,
  systemExtent,
} from './stealth'
import type { Dials, P2 } from './stealth'

const STOPS = ['p2', 'p4', 'p1']

const setup = (seed = 42) => {
  const system = generateSystem(seed)
  const patrol = makePatrol(system, STOPS)
  return { system, patrol }
}

// Materialize the first burn: parked [0, dwell) → burn [dwell, arrive).
const firstBurn = (patrol: ReturnType<typeof makePatrol>) => {
  patrolState(patrol, PATROL_DWELL + 1)
  const seg = patrol.segments.find((s) => s.state.mode === 'burn')!
  return { depart: PATROL_DWELL, arrive: seg.until, mid: (PATROL_DWELL + seg.until) / 2 }
}

describe('signatureRadius', () => {
  const dials: Dials = { plumeRange: 120, trimRange: 12, bubbleRadius: 30 }

  it('a parked-on-rails ship is near-dark', () => {
    const { system, patrol } = setup()
    expect(signatureRadius(system, patrolState(patrol, 1), 1, dials)).toBe(DARK_SIGNATURE)
  })

  it('a station-keeping ship shows the trim range', () => {
    const { system } = setup()
    const holding: ShipState = { mode: 'idle', at: { kind: 'stationkeep', bodyId: 'p2', offset: { x: 10, y: 0, z: 0 } } }
    expect(signatureRadius(system, holding, 1, dials)).toBe(dials.trimRange)
  })

  it('a burning ship is loud — peaking at the flip, floored while lit', () => {
    const { system, patrol } = setup()
    const { depart, arrive, mid } = firstBurn(patrol)
    const atFlip = signatureRadius(system, patrolState(patrol, mid), mid, dials)
    expect(atFlip).toBeCloseTo(dials.plumeRange, 5)
    const justLit = signatureRadius(system, patrolState(patrol, depart + 0.05), depart + 0.05, dials)
    expect(justLit).toBeGreaterThanOrEqual(dials.plumeRange * 0.3)
    expect(justLit).toBeLessThan(atFlip)
    expect(arrive).toBeGreaterThan(depart)
  })
})

describe('detection rule — max(bubble, signature)', () => {
  const dials: Dials = { plumeRange: 120, trimRange: 12, bubbleRadius: 30 }

  it('a burning ship is detected far beyond the bubble', () => {
    const { system, patrol } = setup()
    const { mid } = firstBurn(patrol)
    const pos = project(patrolPosition(patrol, mid))
    const observer: P2 = { x: pos.x + 100, z: pos.z }
    const c = contact(system, patrol, observer, mid, dials)
    expect(c.mode).toBe('burn')
    expect(c.detected).toBe(true)
    expect(c.viaBubble).toBe(false)
  })

  it('a quiet ship is invisible at that same range but detected inside the bubble', () => {
    const { system, patrol } = setup()
    const pos = project(patrolPosition(patrol, 1))
    const far = contact(system, patrol, { x: pos.x + 100, z: pos.z }, 1, dials)
    expect(far.detected).toBe(false)
    const near = contact(system, patrol, { x: pos.x + 20, z: pos.z }, 1, dials)
    expect(near.detected).toBe(true)
    expect(near.viaBubble).toBe(true)
  })
})

describe('event log fold', () => {
  it('logs bearing-acquired when the drive lights, went-dark after it parks — even swept in one step', () => {
    const { system, patrol } = setup()
    const { mid, arrive } = firstBurn(patrol)
    // Observer near the burn path but outside the tiny bubble: only the
    // plume makes the contact visible.
    const midPos = project(patrolPosition(patrol, mid))
    const observer: P2 = { x: midPos.x, z: midPos.z + 25 }
    const dials: Dials = { plumeRange: 150, trimRange: 12, bubbleRadius: 10 }
    const { watch, events } = stepWatch(system, patrol, observer, dials, emptyWatch(), arrive + 1, PATROL_DWELL - 1)
    expect(events.length).toBe(2)
    expect(events[0].text).toMatch(/contact burning — bearing acquired/)
    expect(events[1].text).toMatch(/contact went dark/)
    expect(events[0].at).toBeLessThan(events[1].at)
    expect(watch.detected).toBe(false)
  })

  it('labels a close quiet contact as a bubble entry', () => {
    const { system, patrol } = setup()
    const pos = project(patrolPosition(patrol, 1))
    const { events } = stepWatch(system, patrol, { x: pos.x + 5, z: pos.z }, DEFAULT_DIALS, emptyWatch(), 1)
    expect(events.length).toBe(1)
    expect(events[0].text).toMatch(/contact entered passive bubble/)
  })
})

describe('occlusion', () => {
  const star = [{ id: 'star', center: { x: 0, z: 0 }, r: 6 }]

  it('hides a point behind a disc, not one in front of it', () => {
    const observer: P2 = { x: 100, z: 0 }
    expect(isOccluded(observer, { x: -50, z: 0 }, star)).toBe(true)
    expect(isOccluded(observer, { x: 50, z: 0 }, star)).toBe(false)
    expect(isOccluded(observer, { x: 2, z: 0 }, star)).toBe(true) // inside the body
    expect(isOccluded(observer, { x: 0, z: 50 }, star)).toBe(false) // off-axis
  })

  it('builds a shadow wedge behind the disc, none when the observer is inside it', () => {
    const observer: P2 = { x: 100, z: 0 }
    const wedges = shadowWedges(observer, [{ id: 'star', center: { x: 0, z: 0 }, r: 10 }], 400)
    expect(wedges).toHaveLength(1)
    const [near1, far1, far2, near2] = wedges[0].points
    const tangentLen = Math.sqrt(100 * 100 - 10 * 10)
    expect(Math.hypot(near1.x - 100, near1.z)).toBeCloseTo(tangentLen, 5)
    expect(Math.hypot(near2.x - 100, near2.z)).toBeCloseTo(tangentLen, 5)
    // The far edge extends well beyond the disc, away from the observer.
    expect(far1.x).toBeLessThan(-250)
    expect(far2.x).toBeLessThan(-250)
    expect(shadowWedges({ x: 0, z: 0 }, [{ id: 'star', center: { x: 0, z: 0 }, r: 10 }], 400)).toHaveLength(0)
  })
})

describe('parking-orbit eclipse painting', () => {
  it('paints a partly-hidden orbit and partitions every sample into runs', () => {
    const { system } = setup()
    const extent = systemExtent(system)
    const { runs, eclipsedFraction } = parkingOrbitVisibility(system, 'p2', { x: extent, z: 0 }, 1)
    // The host planet always eclipses the far side of its own parking orbit.
    expect(eclipsedFraction).toBeGreaterThan(0)
    expect(eclipsedFraction).toBeLessThan(0.6)
    expect(runs.some((r) => r.eclipsed)).toBe(true)
    expect(runs.some((r) => !r.eclipsed)).toBe(true)
    expect(runs.reduce((n, r) => n + r.points.length, 0)).toBe(96)
  })
})

describe('station-keep marker', () => {
  it('names the nearest body frame and its drain, and knows when it is in shadow', () => {
    const { system } = setup()
    const body = system.bodies.find((b) => b.id === 'p2')!
    const p2 = project(bodyPosition(system, 'p2', 1))
    // Just off the planet's surface (outside its disc, closer than its moons).
    const marker: P2 = { x: p2.x + body.size + 1, z: p2.z }
    // Observer diametrically opposite through the star: the marker is shadowed.
    const observer: P2 = { x: -p2.x * 2, z: -p2.z * 2 }
    const info = markerInfo(system, marker, observer, 1)
    // Nearest body wins the frame — p2 itself, or one of its moons.
    expect(info.bodyId).toMatch(/^p2/)
    expect(info.drain).toBeCloseTo(stationKeepRate(system, info.bodyId), 9)
    expect(info.drain).toBeGreaterThan(0)
    expect(info.inShadow).toBe(true)
    // Seen from right next to it, the same spot is exposed.
    const near = markerInfo(system, marker, { x: p2.x + 40, z: p2.z }, 1)
    expect(near.inShadow).toBe(false)
  })
})

describe('systemExtent', () => {
  it('covers the outermost planet orbit for a spread of seeds', () => {
    for (const seed of [42, 43, 44]) {
      const system = generateSystem(seed)
      const extent = systemExtent(system)
      for (const body of system.bodies) {
        if (body.kind === 'planet' && body.orbit) expect(extent).toBeGreaterThan(body.orbit.radius)
      }
    }
  })
})

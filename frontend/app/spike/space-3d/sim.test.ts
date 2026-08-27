import { describe, it, expect } from 'vitest'
import {
  add,
  bodyPosition,
  bodyVelocity,
  burnBeforeFlip,
  burnDeltaV,
  burnPath,
  burnPosition,
  burnSpeed,
  burnTangent,
  defaultOrbit,
  dist,
  generateSystem,
  insertionRadius,
  len,
  orbitFromOffset,
  orbitLocalPosition,
  parkedPosition,
  resolveShip,
  shipPosition,
  shipVelocity,
  solveBurn,
  stationKeepRate,
  targetPosition,
  travelTime,
  v3,
} from './sim'
import type { ShipState, Target } from './sim'

describe('generateSystem', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(generateSystem(42)).toEqual(generateSystem(42))
    expect(generateSystem(42)).not.toEqual(generateSystem(43))
  })

  it('builds a star at the root, 5–7 planets, and a station, all with resolvable parents', () => {
    const system = generateSystem(7)
    const ids = new Set(system.bodies.map((b) => b.id))
    expect(system.bodies[0]).toMatchObject({ kind: 'star', orbit: null })
    const planets = system.bodies.filter((b) => b.kind === 'planet')
    expect(planets.length).toBeGreaterThanOrEqual(5)
    expect(planets.length).toBeLessThanOrEqual(7)
    expect(system.bodies.some((b) => b.kind === 'station')).toBe(true)
    for (const body of system.bodies) {
      if (body.orbit) expect(ids.has(body.orbit.parentId)).toBe(true)
    }
  })
})

describe('orbits', () => {
  const system = generateSystem(42)

  it('keeps every body at its orbital radius from its parent at all times', () => {
    for (const body of system.bodies) {
      if (!body.orbit) continue
      for (const t of [0, 3.7, 111.9]) {
        const fromParent = dist(bodyPosition(system, body.id, t), bodyPosition(system, body.orbit.parentId, t))
        expect(fromParent).toBeCloseTo(body.orbit.radius, 6)
      }
    }
  })

  it('leaves the plane — inclined orbits are genuinely 3D', () => {
    const inclined = system.bodies.find((b) => b.orbit && Math.abs(b.orbit.inclination) > 0.02)!
    const ys = [0, 1, 2, 3, 4, 5].map((t) => orbitLocalPosition(inclined.orbit!, t * (inclined.orbit!.period / 6)).y)
    expect(Math.max(...ys.map(Math.abs))).toBeGreaterThan(0)
  })

  it('pins the star to the origin', () => {
    expect(bodyPosition(system, 'star', 123.4)).toEqual(v3(0, 0, 0))
  })

  it('bodyVelocity points prograde — perpendicular-ish to the parent radius', () => {
    const planet = system.bodies.find((b) => b.kind === 'planet')!
    const r = bodyPosition(system, planet.id, 10)
    const vel = bodyVelocity(system, planet.id, 10)
    const dot = r.x * vel.x + r.y * vel.y + r.z * vel.z
    expect(Math.abs(dot) / (len(r) * len(vel))).toBeLessThan(0.05)
  })
})

describe('burns', () => {
  const system = generateSystem(42)
  const accel = 8

  it('travelTime is the brachistochrone closed form', () => {
    expect(travelTime(200, 8)).toBeCloseTo(10, 9)
  })

  it('a point burn starts at from, ends exactly on the mark, and peaks at the flip', () => {
    const from = v3(-50, 4, 60)
    const mark: Target = { kind: 'point', point: v3(60, -8, 70) }
    const burn = solveBurn(system, from, mark, 100, accel)
    expect(burnPosition(burn, burn.depart)).toEqual(from)
    expect(burnPosition(burn, burn.arrive)).toEqual(mark.point)
    const mid = (burn.depart + burn.arrive) / 2
    expect(burnSpeed(burn, mid)).toBeGreaterThan(burnSpeed(burn, mid - 1))
    expect(burnSpeed(burn, mid)).toBeGreaterThan(burnSpeed(burn, mid + 1))
    expect(burnBeforeFlip(burn, mid - 0.1)).toBe(true)
    expect(burnBeforeFlip(burn, mid + 0.1)).toBe(false)
  })

  it('takes at least as long as the straight chord — curves are longer', () => {
    const from = v3(-50, 0, 60)
    const burn = solveBurn(system, from, { kind: 'point', point: v3(60, 0, 70) }, 0, accel, v3(0, 0, -1))
    expect(burn.length).toBeGreaterThanOrEqual(dist(from, burn.intercept) - 1e-9)
    expect(burn.arrive - burn.depart).toBeCloseTo(travelTime(burn.length, accel), 9)
  })

  it('a departure tangent bends the path off the chord', () => {
    const from = v3(-60, 0, 40)
    const mark: Target = { kind: 'point', point: v3(60, 0, 40) }
    const straight = solveBurn(system, from, mark, 0, accel)
    const curved = solveBurn(system, from, mark, 0, accel, v3(0, 0, 1)) // moving crosswise at depart
    expect(curved.length).toBeGreaterThan(straight.length)
    const mid = burnPosition(curved, (curved.depart + curved.arrive) / 2)
    expect(Math.abs(mid.z - 40)).toBeGreaterThan(1) // off the z=40 chord line
  })

  it('bulges around the star instead of lancing through it', () => {
    const starSize = system.bodies[0].size
    const burn = solveBurn(system, v3(-80, 0, 0.5), { kind: 'point', point: v3(80, 0, -0.5) }, 0, accel)
    let minDist = Infinity
    for (const p of burnPath(burn, 96)) minDist = Math.min(minDist, len(p))
    expect(minDist).toBeGreaterThan(starSize)
  })

  it('intercepts a moving body at its insertion standoff — not its center', () => {
    const planet = system.bodies.find((b) => b.kind === 'planet')!
    const burn = solveBurn(system, v3(80, 10, -40), { kind: 'body', bodyId: planet.id }, 5, accel)
    const bodyAtArrival = bodyPosition(system, planet.id, burn.arrive)
    expect(dist(burn.intercept, bodyAtArrival)).toBeCloseTo(insertionRadius(planet), 3)
    expect(burn.arrive).toBeGreaterThan(burn.depart)
  })

  it('clamps outside the burn window instead of extrapolating', () => {
    const burn = solveBurn(system, v3(0, 0, 100), { kind: 'point', point: v3(100, 0, 100) }, 10, accel)
    expect(burnPosition(burn, burn.depart - 5)).toEqual(burn.from)
    expect(burnPosition(burn, burn.arrive + 5)).toEqual(burn.intercept)
    expect(burnSpeed(burn, burn.arrive + 5)).toBe(0)
  })

  it('prices a burn at accel × flight time', () => {
    const burn = solveBurn(system, v3(0, 0, 100), { kind: 'point', point: v3(100, 0, 100) }, 0, accel)
    expect(burnDeltaV(burn)).toBeCloseTo(accel * (burn.arrive - burn.depart), 9)
    expect(burnDeltaV(burn)).toBeGreaterThan(0)
  })
})

describe('parking', () => {
  const system = generateSystem(42)

  it('an orbit parks at its radius from the body, forever, on rails', () => {
    const parked = defaultOrbit(system, 'p2')
    if (parked.kind !== 'orbit') throw new Error('expected orbit')
    for (const t of [0, 8.3, 55]) {
      expect(dist(parkedPosition(system, parked, t), bodyPosition(system, 'p2', t))).toBeCloseTo(parked.radius, 6)
    }
  })

  it('station-keeping pins the exact offset in the body frame', () => {
    const offset = v3(4, 1, -3)
    const parked = { kind: 'stationkeep', bodyId: 'p1', offset } as const
    for (const t of [0, 9.9]) {
      expect(parkedPosition(system, parked, t)).toEqual(add(bodyPosition(system, 'p1', t), offset))
    }
  })

  it('charges a positive upkeep everywhere, scaled by the body frame', () => {
    for (const body of system.bodies) {
      expect(stationKeepRate(system, body.id)).toBeGreaterThan(0)
    }
  })

  it('re-circularizes from an offset at the planar radius', () => {
    const parked = orbitFromOffset('p1', v3(3, 2, 4), 50)
    if (parked.kind !== 'orbit') throw new Error('expected orbit')
    expect(parked.radius).toBeCloseTo(5, 9)
    expect(parked.epoch).toBe(50)
  })
})

describe('the ship fold', () => {
  const system = generateSystem(42)

  it('a burn past its arrival IS its settled insertion orbit — no settle step needed', () => {
    const burn = solveBurn(system, v3(90, 0, 90), { kind: 'body', bodyId: 'p1' }, 0, 8)
    const ship: ShipState = { mode: 'burn', burn }
    expect(resolveShip(system, ship, burn.arrive - 0.01).mode).toBe('burn')
    const settled = resolveShip(system, ship, burn.arrive + 0.01)
    expect(settled.mode).toBe('idle')
    if (settled.mode !== 'idle' || settled.at.kind !== 'orbit') throw new Error('expected orbit insertion')
    expect(settled.at.bodyId).toBe('p1')
    // The fold is pure: resolving twice gives the identical orbit.
    expect(resolveShip(system, ship, burn.arrive + 5)).toEqual(settled)
  })

  it('the insertion is continuous — no teleport at arrival', () => {
    const burn = solveBurn(system, v3(90, 0, 90), { kind: 'body', bodyId: 'p1' }, 0, 8)
    const ship: ShipState = { mode: 'burn', burn }
    const justBefore = shipPosition(system, ship, burn.arrive - 1e-6)
    const justAfter = shipPosition(system, ship, burn.arrive + 1e-6)
    expect(dist(justBefore, justAfter)).toBeLessThan(0.1)
  })

  it('arrives with no kink — the curve end tangent IS the settled orbit velocity direction', () => {
    const burn = solveBurn(system, v3(90, 0, 90), { kind: 'body', bodyId: 'p1' }, 0, 8)
    const ship: ShipState = { mode: 'burn', burn }
    const endTangent = burnTangent(burn, burn.arrive)
    const settledVel = shipVelocity(system, ship, burn.arrive + 0.01)
    const settledDir = v3(settledVel.x / len(settledVel), settledVel.y / len(settledVel), settledVel.z / len(settledVel))
    const dot = endTangent.x * settledDir.x + endTangent.y * settledDir.y + endTangent.z * settledDir.z
    expect(dot).toBeGreaterThan(0.95)
  })

  it('a settled burn rides its insertion orbit around the body', () => {
    const planet = system.bodies.find((b) => b.id === 'p0')!
    const burn = solveBurn(system, v3(200, 0, 0), { kind: 'body', bodyId: 'p0' }, 0, 8)
    const later = burn.arrive + 7.7
    const at = shipPosition(system, { mode: 'burn', burn }, later)
    expect(dist(at, bodyPosition(system, 'p0', later))).toBeCloseTo(insertionRadius(planet), 6)
  })

  it('an orbiting ship moves — shipVelocity feeds the next departure tangent', () => {
    const ship: ShipState = { mode: 'idle', at: defaultOrbit(system, 'p2') }
    expect(len(shipVelocity(system, ship, 12))).toBeGreaterThan(0)
  })

  it('targetPosition of a point is the point itself', () => {
    const mark = v3(1, 2, 3)
    expect(targetPosition(system, { kind: 'point', point: mark }, 55)).toEqual(mark)
  })
})

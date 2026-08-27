// SPIKE — continuous-space sim core for /spike/space-3d.
//
// The question this spike answers: what does the game's kinematic contract
// look like OFF the lattice entirely — no rings, no slots, no cells, just
// continuous positions in R³. The load-bearing property carried over from
// the board package is that a committed order stays a PURE FUNCTION OF TIME:
// the `StateAt`-style fold still works (a burn past its arrival IS its
// settled parked state), so the no-scheduler / resolve-on-read architecture
// survives the move to continuous space unchanged.
//
// Second iteration ("Option B + curvature"): burns fly a cubic Bézier whose
// end tangents are real orbital velocities — depart prograde along your
// parking orbit, arrive matched to the destination's motion, bulge around
// the star instead of lancing through it. The curvature is STORED GEOMETRY
// (control points on the burn), not integrated gravity, so position(t) stays
// closed-form and cross-stack deterministic. Arrivals insert into a rails
// parking orbit (free forever); station-keeping a fixed offset instead costs
// a continuous fuel drain — the parking economy.
//
// Pure math only — no three.js, no React. Deliberately shaped like something
// that could grow a Go mirror + fixture family the way backend/polar ↔
// frontend/lib/polar does today (fixed sample counts everywhere keep the
// float paths deterministic).

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s)
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b))
export const lerp = (a: Vec3, b: Vec3, f: number): Vec3 => add(a, scale(sub(b, a), f))
export const norm = (a: Vec3): Vec3 | null => {
  const l = len(a)
  return l > 1e-9 ? scale(a, 1 / l) : null
}

// --- system generation -------------------------------------------------------

export interface Orbit {
  parentId: string // every non-star body orbits something
  radius: number
  period: number // sim-seconds per revolution
  phase: number // radians at t=0
  inclination: number // tilt of the orbital plane (radians) — this is what makes it 3D
  node: number // longitude of the ascending node (radians)
}

export type BodyKind = 'star' | 'planet' | 'moon' | 'station'

export interface Body {
  id: string
  name: string
  kind: BodyKind
  size: number // visual + docking radius
  color: number // 0xrrggbb for the renderer
  orbit: Orbit | null // null = the star, pinned at the origin
}

export interface Belt {
  radius: number
  width: number
}

export interface SystemDef {
  seed: number
  name: string
  bodies: Body[]
  belt: Belt | null
}

// Same PRNG family the rest of the codebase's mocks use — deterministic per seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PLANET_COLORS = [0xc2a678, 0x7fa8c9, 0xb56a4e, 0x8ec9a8, 0xcabf8f, 0x9a86c4, 0x6f8f9f]
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

// Kepler-ish: period grows with radius^1.5, scaled so the inner system moves
// visibly at 1× and the outer system rewards the time-scale control.
const keplerPeriod = (radius: number) => 40 * Math.pow(radius / 40, 1.5)

export function generateSystem(seed: number): SystemDef {
  const rand = mulberry32(seed)
  const bodies: Body[] = [
    { id: 'star', name: `KAPPA-${(seed % 900) + 100}`, kind: 'star', size: 6, color: 0xffd9a0, orbit: null },
  ]

  const planetCount = 5 + Math.floor(rand() * 3) // 5–7
  let radius = 20 + rand() * 6
  const radii: number[] = []
  for (let i = 0; i < planetCount; i++) {
    radii.push(radius)
    const size = 1.6 + rand() * 2.6
    const id = `p${i}`
    bodies.push({
      id,
      name: ROMAN[i],
      kind: 'planet',
      size,
      color: PLANET_COLORS[i % PLANET_COLORS.length],
      orbit: {
        parentId: 'star',
        radius,
        period: keplerPeriod(radius),
        phase: rand() * Math.PI * 2,
        inclination: (rand() - 0.5) * (16 / 180) * Math.PI, // ±8°
        node: rand() * Math.PI * 2,
      },
    })
    // The bigger planets get a moon or two — hierarchical continuous orbits.
    if (size > 2.4 && rand() < 0.7) {
      const moonCount = 1 + Math.floor(rand() * 2)
      for (let m = 0; m < moonCount; m++) {
        bodies.push({
          id: `${id}m${m}`,
          name: `${ROMAN[i]}${'abc'[m]}`,
          kind: 'moon',
          size: 0.5 + rand() * 0.5,
          color: 0xa8a8b4,
          orbit: {
            parentId: id,
            radius: size + 2.6 + m * 2.4,
            period: 7 + rand() * 12,
            phase: rand() * Math.PI * 2,
            inclination: (rand() - 0.5) * (40 / 180) * Math.PI,
            node: rand() * Math.PI * 2,
          },
        })
      }
    }
    radius *= 1.38 + rand() * 0.22
  }

  // The NPC trading post, in a tight orbit around the second planet.
  bodies.push({
    id: 'station',
    name: 'WAYPOINT',
    kind: 'station',
    size: 0.9,
    color: 0x86e0d0,
    orbit: {
      parentId: 'p1',
      radius: bodies.find((b) => b.id === 'p1')!.size + 3.4,
      period: 9,
      phase: rand() * Math.PI * 2,
      inclination: (10 / 180) * Math.PI,
      node: rand() * Math.PI * 2,
    },
  })

  // A belt in the widest gap between consecutive planets.
  let belt: Belt | null = null
  let widest = 0
  for (let i = 1; i < radii.length; i++) {
    const gap = radii[i] - radii[i - 1]
    if (gap > widest) {
      widest = gap
      belt = { radius: (radii[i] + radii[i - 1]) / 2, width: gap * 0.16 }
    }
  }

  return { seed, name: bodies[0].name, bodies, belt }
}

// --- positions ---------------------------------------------------------------

function lookup(system: SystemDef, id: string): Body {
  const body = system.bodies.find((b) => b.id === id)
  if (!body) throw new Error(`unknown body ${id}`)
  return body
}

// Position relative to the orbit's parent: a circle in the orbital plane,
// tilted by inclination (about X), then swung by the node angle (about Y, up).
export function orbitLocalPosition(orbit: Orbit, t: number): Vec3 {
  const theta = orbit.phase + (2 * Math.PI * t) / orbit.period
  const x = orbit.radius * Math.cos(theta)
  const z = orbit.radius * Math.sin(theta)
  const yi = -z * Math.sin(orbit.inclination)
  const zi = z * Math.cos(orbit.inclination)
  const cosN = Math.cos(orbit.node)
  const sinN = Math.sin(orbit.node)
  return v3(x * cosN + zi * sinN, yi, -x * sinN + zi * cosN)
}

export function bodyPosition(system: SystemDef, id: string, t: number): Vec3 {
  const body = lookup(system, id)
  if (!body.orbit) return v3(0, 0, 0)
  return add(bodyPosition(system, body.orbit.parentId, t), orbitLocalPosition(body.orbit, t))
}

// Central difference with a FIXED step — deterministic, and good enough for
// tangent directions (we only ever normalize it).
const VEL_EPS = 1e-3
export function bodyVelocity(system: SystemDef, id: string, t: number): Vec3 {
  const ahead = bodyPosition(system, id, t + VEL_EPS)
  const behind = bodyPosition(system, id, t - VEL_EPS)
  return scale(sub(ahead, behind), 1 / (2 * VEL_EPS))
}

// --- targets -----------------------------------------------------------------

export type Target = { kind: 'body'; bodyId: string } | { kind: 'point'; point: Vec3 }

export function targetPosition(system: SystemDef, target: Target, t: number): Vec3 {
  return target.kind === 'body' ? bodyPosition(system, target.bodyId, t) : target.point
}

export function targetName(system: SystemDef, target: Target): string {
  return target.kind === 'body' ? lookup(system, target.bodyId).name : 'DEEP SPACE MARK'
}

// --- parking (Option B) ------------------------------------------------------

// Where an idle ship lives. `orbit` is rails — free forever, but you sweep
// around the body (and through its eclipse shadow). `stationkeep` pins an
// exact offset in the body's frame at a continuous fuel cost. `point` holds
// a fixed spot in empty space (no gravity model ⇒ free).
export type Parked =
  | { kind: 'orbit'; bodyId: string; radius: number; period: number; phase: number; epoch: number }
  | { kind: 'stationkeep'; bodyId: string; offset: Vec3 }
  | { kind: 'point'; point: Vec3 }

export const insertionRadius = (body: Body): number => body.size * 2.2 + 1.5
export const insertionPeriod = (radius: number): number => 5 + radius * 0.9

export function parkedPosition(system: SystemDef, parked: Parked, t: number): Vec3 {
  switch (parked.kind) {
    case 'orbit': {
      const alpha = parked.phase + (2 * Math.PI * (t - parked.epoch)) / parked.period
      return add(
        bodyPosition(system, parked.bodyId, t),
        v3(parked.radius * Math.cos(alpha), 0, parked.radius * Math.sin(alpha))
      )
    }
    case 'stationkeep':
      return add(bodyPosition(system, parked.bodyId, t), parked.offset)
    case 'point':
      return parked.point
  }
}

export function defaultOrbit(system: SystemDef, bodyId: string): Parked {
  const radius = insertionRadius(lookup(system, bodyId))
  return { kind: 'orbit', bodyId, radius, period: insertionPeriod(radius), phase: 0, epoch: 0 }
}

// Re-circularize from an arbitrary held offset (planar radius, y dropped).
export function orbitFromOffset(bodyId: string, offset: Vec3, epoch: number): Parked {
  const radius = Math.max(Math.hypot(offset.x, offset.z), 1)
  return { kind: 'orbit', bodyId, radius, period: insertionPeriod(radius), phase: Math.atan2(offset.z, offset.x), epoch }
}

// The station-keep upkeep: the centripetal acceleration of the body's own
// orbit — what your drive must supply to ride its frame without being on
// rails. Bodies pinned at the origin still charge a floor (thruster trim).
export function stationKeepRate(system: SystemDef, bodyId: string): number {
  const body = lookup(system, bodyId)
  if (!body.orbit) return 0.5
  const omega = (2 * Math.PI) / body.orbit.period
  return Math.max(omega * omega * body.orbit.radius, 0.5)
}

// --- burns -------------------------------------------------------------------

// Brachistochrone timing along the PATH: accelerate to the midpoint, flip,
// decelerate. A path of length L at acceleration a takes 2·sqrt(L/a).
export const travelTime = (pathLength: number, accel: number): number => 2 * Math.sqrt(pathLength / accel)

export interface Burn {
  from: Vec3
  target: Target
  intercept: Vec3 // solved arrival point (the insertion standoff, for a body target)
  c1: Vec3 // Bézier control points — the stored curvature
  c2: Vec3
  length: number // arc length of the curve (fixed 64-segment polyline)
  depart: number
  arrive: number
  accel: number
}

const CURVE_SEGMENTS = 64
const DEPART_TANGENT = 0.8 // Hermite tangent magnitudes as a fraction of chord
const ARRIVE_TANGENT = 0.9
const STAR_CLEARANCE = 2.5 // × star size — curves are pushed outside this

function cubicPoint(p0: Vec3, c1: Vec3, c2: Vec3, p3: Vec3, u: number): Vec3 {
  const v = 1 - u
  const a = v * v * v
  const b = 3 * v * v * u
  const c = 3 * v * u * u
  const d = u * u * u
  return v3(
    a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    a * p0.y + b * c1.y + c * c2.y + d * p3.y,
    a * p0.z + b * c1.z + c * c2.z + d * p3.z
  )
}

interface CurveGeometry {
  intercept: Vec3
  c1: Vec3
  c2: Vec3
  length: number
}

// Build the curve for an arrival at time `arrive`: Hermite tangents (depart
// along your current velocity, arrive along the target's motion) converted to
// Bézier control points, then shoved outward if the path grazes the star.
function buildCurve(
  system: SystemDef,
  from: Vec3,
  target: Target,
  arrive: number,
  departDir: Vec3 | null
): CurveGeometry {
  let intercept: Vec3
  let arriveDir: Vec3 | null
  if (target.kind === 'body') {
    const bodyAt = bodyPosition(system, target.bodyId, arrive)
    // Planar approach direction: the insertion orbit is an ecliptic-plane
    // circle in the body frame, so aiming the standoff in that plane makes
    // the orbit insertion exactly continuous (no pop at arrival).
    const toFrom = sub(from, bodyAt)
    const approach = norm(v3(toFrom.x, 0, toFrom.z)) ?? v3(1, 0, 0)
    const radius = insertionRadius(lookup(system, target.bodyId))
    intercept = add(bodyAt, scale(approach, radius))
    // Arrive along the settled orbit's velocity at the entry point — body
    // translation plus the orbital sweep — so the path wraps INTO the
    // parking orbit (you target the body, not a spot beside it) and the
    // direction of motion is continuous through insertion.
    const sweep = scale(v3(-approach.z, 0, approach.x), (2 * Math.PI * radius) / insertionPeriod(radius))
    arriveDir = norm(add(bodyVelocity(system, target.bodyId, arrive), sweep))
  } else {
    intercept = target.point
    arriveDir = null
  }

  const chord = sub(intercept, from)
  const chordLen = len(chord)
  const chordDir = norm(chord) ?? v3(1, 0, 0)
  const m0 = scale(departDir ?? chordDir, DEPART_TANGENT * chordLen)
  const m1 = scale(arriveDir ?? chordDir, ARRIVE_TANGENT * chordLen)
  let c1 = add(from, scale(m0, 1 / 3))
  let c2 = sub(intercept, scale(m1, 1 / 3))

  // Star avoidance: find the curve's closest sampled approach to the origin
  // and, if it's inside the clearance, push both control points out radially.
  const safe = system.bodies[0].size * STAR_CLEARANCE
  let minDist = Infinity
  let minPoint = v3(0, 0, 0)
  for (let i = 0; i <= 32; i++) {
    const p = cubicPoint(from, c1, c2, intercept, i / 32)
    const d = len(p)
    if (d < minDist) {
      minDist = d
      minPoint = p
    }
  }
  if (minDist < safe) {
    // Push PERPENDICULAR to the chord — a radial push from a grazing point can
    // be nearly chord-parallel, which reparameterizes the line without
    // bending it away from the star.
    const radial = norm(minPoint) ?? v3(0, 0, 1)
    const along = radial.x * chordDir.x + radial.y * chordDir.y + radial.z * chordDir.z
    const out =
      norm(sub(radial, scale(chordDir, along))) ?? (norm(v3(-chordDir.z, 0, chordDir.x)) ?? v3(0, 1, 0))
    const push = scale(out, safe * 1.5 - minDist)
    c1 = add(c1, push)
    c2 = add(c2, push)
  }

  let length = 0
  let prev = from
  for (let i = 1; i <= CURVE_SEGMENTS; i++) {
    const p = cubicPoint(from, c1, c2, intercept, i / CURVE_SEGMENTS)
    length += dist(prev, p)
    prev = p
  }
  return { intercept, c1, c2, length }
}

// Moving-target intercept: fixed-point iterate arrival time against the
// target's future position, timing each round by the CURVE's length (the
// curve itself changes with the arrival time). Converges in a handful of
// rounds because ship speed dwarfs orbital speed at these scales.
export function solveBurn(
  system: SystemDef,
  from: Vec3,
  target: Target,
  depart: number,
  accel: number,
  departDir: Vec3 | null = null
): Burn {
  let flight = travelTime(dist(from, targetPosition(system, target, depart)), accel)
  let curve = buildCurve(system, from, target, depart + flight, departDir)
  for (let i = 0; i < 32; i++) {
    const next = travelTime(curve.length, accel)
    if (Math.abs(next - flight) < 1e-9) break
    flight = next
    curve = buildCurve(system, from, target, depart + flight, departDir)
  }
  return {
    from,
    target,
    intercept: curve.intercept,
    c1: curve.c1,
    c2: curve.c2,
    length: curve.length,
    depart,
    arrive: depart + flight,
    accel,
  }
}

// Arc-length table per burn, so the accel/flip/decel profile maps to distance
// ALONG the curve, not to the Bézier parameter. Cached per burn object in TS;
// a Go mirror would just recompute (64 cubic evals is nothing).
const arcTables = new WeakMap<Burn, number[]>()
function arcTable(burn: Burn): number[] {
  let table = arcTables.get(burn)
  if (table) return table
  table = [0]
  let prev = burn.from
  for (let i = 1; i <= CURVE_SEGMENTS; i++) {
    const p = cubicPoint(burn.from, burn.c1, burn.c2, burn.intercept, i / CURVE_SEGMENTS)
    table.push(table[i - 1] + dist(prev, p))
    prev = p
  }
  arcTables.set(burn, table)
  return table
}

// Bézier parameter for a fraction of the arc length covered.
function arcParam(burn: Burn, frac: number): number {
  if (frac <= 0) return 0
  if (frac >= 1) return 1
  const table = arcTable(burn)
  const goal = frac * table[CURVE_SEGMENTS]
  let i = 1
  while (i < CURVE_SEGMENTS && table[i] < goal) i++
  const span = table[i] - table[i - 1]
  const within = span > 0 ? (goal - table[i - 1]) / span : 0
  return (i - 1 + within) / CURVE_SEGMENTS
}

// Fraction of the path covered at burn-relative time τ (accel/flip/decel).
function burnProgress(burn: Burn, tau: number): number {
  const flight = burn.arrive - burn.depart
  if (flight <= 0 || burn.length <= 0) return 1
  const clamped = Math.min(Math.max(tau, 0), flight)
  const half = flight / 2
  const covered =
    clamped <= half
      ? 0.5 * burn.accel * clamped * clamped
      : burn.length - 0.5 * burn.accel * (flight - clamped) * (flight - clamped)
  return Math.min(covered / burn.length, 1)
}

export function burnPosition(burn: Burn, t: number): Vec3 {
  const frac = burnProgress(burn, t - burn.depart)
  if (frac <= 0) return burn.from
  if (frac >= 1) return burn.intercept
  return cubicPoint(burn.from, burn.c1, burn.c2, burn.intercept, arcParam(burn, frac))
}

// Unit tangent of the PATH at time t (direction of motion, not of thrust).
export function burnTangent(burn: Burn, t: number): Vec3 {
  const u = arcParam(burn, burnProgress(burn, t - burn.depart))
  const h = 1 / CURVE_SEGMENTS
  const ahead = cubicPoint(burn.from, burn.c1, burn.c2, burn.intercept, Math.min(u + h, 1))
  const behind = cubicPoint(burn.from, burn.c1, burn.c2, burn.intercept, Math.max(u - h, 0))
  return norm(sub(ahead, behind)) ?? v3(0, 1, 0)
}

// Sampled polyline of the whole path — what a renderer draws.
export function burnPath(burn: Burn, samples: number): Vec3[] {
  const points: Vec3[] = []
  for (let i = 0; i <= samples; i++) {
    points.push(cubicPoint(burn.from, burn.c1, burn.c2, burn.intercept, i / samples))
  }
  return points
}

// Scalar speed at time t — a·τ ramping up, a·(T−τ) ramping down.
export function burnSpeed(burn: Burn, t: number): number {
  const flight = burn.arrive - burn.depart
  const tau = Math.min(Math.max(t - burn.depart, 0), flight)
  return burn.accel * (tau <= flight / 2 ? tau : flight - tau)
}

// True while the drive points along the path (first half); after the flip it
// points backwards. Purely presentational, but it's the flip-and-burn.
export const burnBeforeFlip = (burn: Burn, t: number): boolean => t - burn.depart <= (burn.arrive - burn.depart) / 2

// Total delta-v of the brachistochrone: accelerating the whole way (a·T).
// The fuel price of a burn.
export const burnDeltaV = (burn: Burn): number => burn.accel * (burn.arrive - burn.depart)

// --- the ship fold -----------------------------------------------------------

export type ShipState =
  | { mode: 'idle'; at: Parked }
  | { mode: 'burn'; burn: Burn }

// The insertion orbit a settled burn parks into — derived DETERMINISTICALLY
// from the stored burn (approach side sets the entry phase), so the fold
// needs no extra persisted state.
function insertionFromBurn(system: SystemDef, burn: Burn): Parked {
  if (burn.target.kind !== 'body') {
    return { kind: 'point', point: burn.intercept }
  }
  const bodyAt = bodyPosition(system, burn.target.bodyId, burn.arrive)
  const offset = sub(burn.intercept, bodyAt)
  const radius = insertionRadius(lookup(system, burn.target.bodyId))
  return {
    kind: 'orbit',
    bodyId: burn.target.bodyId,
    radius,
    period: insertionPeriod(radius),
    phase: Math.atan2(offset.z, offset.x),
    epoch: burn.arrive,
  }
}

// The StateAt analogue: a burn past its arrival IS its settled parked state.
// Readers fold; only an explicit settle path would persist the result.
export function resolveShip(system: SystemDef, ship: ShipState, t: number): ShipState {
  if (ship.mode === 'burn' && t >= ship.burn.arrive) {
    return { mode: 'idle', at: insertionFromBurn(system, ship.burn) }
  }
  return ship
}

export function shipPosition(system: SystemDef, ship: ShipState, t: number): Vec3 {
  const resolved = resolveShip(system, ship, t)
  if (resolved.mode === 'burn') return burnPosition(resolved.burn, t)
  return parkedPosition(system, resolved.at, t)
}

// Direction of motion of a parked/burning ship — the departure tangent for
// the next burn. Central difference of the fold with a fixed step.
export function shipVelocity(system: SystemDef, ship: ShipState, t: number): Vec3 {
  const ahead = shipPosition(system, ship, t + VEL_EPS)
  const behind = shipPosition(system, ship, t - VEL_EPS)
  return scale(sub(ahead, behind), 1 / (2 * VEL_EPS))
}

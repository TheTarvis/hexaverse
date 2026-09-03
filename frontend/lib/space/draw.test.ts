import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`, requirement *Own-Fleet Position, Burn
// Curve, and Arrival Ghost Render Continuously* (tasks.md 1.4, 1.6, 1.8).
//
// THE CONTRACT THIS FILE FIXES (nothing below exists yet; the import is the
// red signal). `frontend/lib/space/draw.ts` exports, and ONLY exports,
// draw-scoped pure functions — design.md Decision 1's four kinds:
//
//   vecAdd(a, b)                               -> DrawVec3
//   vecSub(a, b)                               -> DrawVec3
//   vecScale(a, s)                             -> DrawVec3
//   drawOrbitPosition(elements, worldTimeMs)   -> DrawVec3  (parent-relative)
//   drawParkPosition(park, worldTimeMs)        -> DrawVec3  (host-relative for
//                                                 orbit/stationkeep; absolute
//                                                 for a point park)
//   drawDriftPosition(drift, worldTimeMs)      -> DrawVec3  (absolute)
//     where DrawDrift is { anchor, velocityPerSecond, epochMs } — see the
//     unit note below.
//   bezierPointAt(controlPoints, u)            -> DrawVec3
//   burnDrawParam(departMs, arriveMs, nowMs)   -> number in [0, 1]
//   isDrawOrigin(p)                            -> boolean   (exact 0,0,0)
//
// EVERY name is subject-prefixed and draw-scoped so that, compared
// CASE-INSENSITIVELY, none equals any top-level function name in
// `backend/space` — exported or not (tasks.md 1.5; `cross-stack-determinism`
// *A lower-camel twin of an authoritative Go export fails the check*).
// `frontend/lib/anti-mirror-guard.test.ts` is the automated half of that.
//
// WHY THE ORACLE IS THE RECORDED WIRE SAMPLE, NOT HAND-COMPUTED NUMBERS.
// The served orbital elements are sub-turn integers, not radians, and the
// inclination/node rotation has a fixed sign convention. Asserting against
// numbers this SDET derived from reading `backend/space/orbit.go` would test
// this SDET's reading. Asserting that the drawn position reproduces the
// SERVED `space` position, at the SERVED `worldTime`, in the SAME payload,
// tests the thing that actually matters: the client draws the body where the
// server says it is. Verified: the convention reproduces every body and gate
// in the sample to <= 2e-13 absolute, so the 1e-6 tolerance below is ~7
// orders of magnitude of headroom and still catches any real error.
//
// THE DRIFT VELOCITY'S UNIT (revised 2026-09-03, SDET; cause: the developer
// disputed the handed-off assertion and the orchestrator ruled in the
// developer's favour). As handed off, this file pinned
// `anchor + velocity x (t - epochMs)` with the elapsed term in MILLISECONDS,
// while `space.Drift` (backend/space/drift.go) serves a velocity per SECOND
// and evaluates `Anchor.Add(Velocity.Scale(float64(t-EpochMs)/1000))`. The
// developer made the handed-off test pass by documenting the function as
// unit-agnostic and dividing by 1000 at the single call site. The ruling:
// make the unit UNAMBIGUOUS rather than conventional — a function whose
// correctness depends on every future caller remembering to divide by 1000
// is one careless call from a 1000x rendering error.
//
// The resolution pinned below does BOTH halves the ruling offered, in one
// move: the function takes the wire's own unit (a per-SECOND velocity and a
// world-time MILLISECOND stamp, exactly the two fields the server serves and
// exactly what `space.Drift.Position` consumes), AND the unit is carried in
// the field name — `velocityPerSecond`, not `velocity` — so a caller that
// hands it a per-millisecond rate fails to compile rather than rendering a
// fleet 1000x too far out. The /1000 lives inside the function, once.
//
// Why the unit went on the FIELD rather than on the time parameter (the
// other option the ruling allowed): every other function in this module
// takes `worldTimeMs`, and a single dissenting `elapsedSeconds` parameter is
// its own trap — it would also force each caller to compute `t - epochMs`
// itself, restoring by hand the very subtraction this function exists to own.
//
// The `SDET-added` drift cases below are calibrated to DISCRIMINATE: a
// millisecond reading of the same fixture lands 1000x away, far outside
// every tolerance here.
//
// This is a TEST-side comparison only. `system-space-view` forbids production
// code from comparing a drawn position to a served one; it does not forbid a
// test from using the served one as an oracle, which is the only oracle that
// exists.
//
// VACUITY NOTE: this file cannot pass against a stub. `drawOrbitPosition`
// returning a zero vector, the served `space` value, or a constant fails —
// the parent-composition cases (moon, station) require the recursive sum, and
// the periodicity/clamp cases require the real advance. A stub that simply
// echoed `f.space` would fail the composition tests, which never pass `space`
// in at all.

import {
  vecAdd,
  vecSub,
  vecScale,
  drawOrbitPosition,
  drawParkPosition,
  drawDriftPosition,
  bezierPointAt,
  burnDrawParam,
  isDrawOrigin,
  type DrawVec3,
} from '@/lib/space/draw'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SAMPLE = join(
  REPO_ROOT,
  'backend/testdata/serve-orbital-elements-and-burn-preview/interior-read.json',
)

interface WireOrbitElements {
  parentId: string
  radius: number
  periodMs: number
  phase: number
  inclination: number
  node: number
}
interface WireBody {
  id: string
  type?: string
  space: { X: number; Y: number; Z: number }
  orbitElements?: WireOrbitElements
}
interface WireGate {
  destSystemId: string
  space: { X: number; Y: number; Z: number }
  orbitElements: WireOrbitElements
}
interface WireInterior {
  features: WireBody[]
  laneGates: WireGate[]
  worldTime: number
}

const wire: WireInterior = JSON.parse(readFileSync(SAMPLE, 'utf8'))
const byId = new Map(wire.features.map((f) => [f.id, f]))

// TOL is absolute, in the sample's own scene units (bodies sit at radii
// 24..725). The measured divergence between the pinned Go turn table and
// ordinary JS trigonometry over this sample is <= 2.2e-13.
const TOL = 1e-6

// Resolve a body's ABSOLUTE drawn position by the same recursive
// parent-composition `backend/space`'s own `resolvePosition` performs: a
// parentless body sits at the origin, a parented one at its parent's drawn
// position plus its own drawn local offset. The composition itself is what
// the view must do; `drawOrbitPosition` is only the local half.
function drawAbsolute(id: string, t: number): DrawVec3 {
  const body = byId.get(id)
  if (!body || !body.orbitElements) return { x: 0, y: 0, z: 0 }
  return vecAdd(drawAbsolute(body.orbitElements.parentId, t), drawOrbitPosition(body.orbitElements, t))
}

// The three bodies the composition assertions below need, DISCOVERED from the
// sample rather than pinned by id.
//
// SDET NOTE, 2026-09-03 (openspec change `build-production-space-view`, Job 2
// of the SDET pass). These were `feat-moon-0` with parent `feat-body-3`, and
// `feat-station` with parent `feat-body-1` — the ids and the parent links of
// ONE recorded home system. The recorder
// (`backend/orbit_elements_wire_e2e_test.go`) spawns a fresh corporation into
// a different system every time it runs, so every re-recording reshuffled the
// parent chain and red these two tests for a reason that has nothing to do
// with the code under test. What the assertions are actually about is the
// COMPOSITION — a grandchild draws onto its parent's drawn position, not onto
// the star — and that property is expressible without naming anybody. The
// recorder now refuses to record a sample that carries no such body, so
// `grandchild` below can never quietly become undefined.

/** A body whose own parent is itself parented — a moon, or a station on a planet. */
const grandchild = wire.features.find((f) => {
  const parentId = f.orbitElements?.parentId
  if (!parentId) return false
  const parent = byId.get(parentId)
  return !!parent?.orbitElements?.parentId
})

/** The spawned home system's NPC trading post. */
const station = wire.features.find((f) => f.type === 'station')

/** A body that actually revolves — a non-zero period and a non-zero radius. */
const revolving = wire.features.find(
  (f) => (f.orbitElements?.periodMs ?? 0) > 0 && (f.orbitElements?.radius ?? 0) > 0,
)

function expectClose(got: DrawVec3, want: { X: number; Y: number; Z: number }, what: string) {
  expect(Math.abs(got.x - want.X), `${what}: x`).toBeLessThan(TOL)
  expect(Math.abs(got.y - want.Y), `${what}: y`).toBeLessThan(TOL)
  expect(Math.abs(got.z - want.Z), `${what}: z`).toBeLessThan(TOL)
}

describe('lib/space/draw — vector helpers', () => {
  it('SDET-added: vecAdd, vecSub and vecScale are the plain component operations', () => {
    expect(vecAdd({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 11, y: 22, z: 33 })
    expect(vecSub({ x: 10, y: 20, z: 30 }, { x: 1, y: 2, z: 3 })).toEqual({ x: 9, y: 18, z: 27 })
    expect(vecScale({ x: 1, y: -2, z: 3 }, 2.5)).toEqual({ x: 2.5, y: -5, z: 7.5 })
  })

  it('SDET-added: vecAdd does not mutate either operand', () => {
    const a = { x: 1, y: 1, z: 1 }
    const b = { x: 2, y: 2, z: 2 }
    vecAdd(a, b)
    expect(a).toEqual({ x: 1, y: 1, z: 1 })
    expect(b).toEqual({ x: 2, y: 2, z: 2 })
  })
})

describe('lib/space/draw — drawOrbitPosition against the recorded wire sample', () => {
  // Scenario: An idle fleet renders at its live position, advancing with
  // world time  (the pure-math half — the render half is asserted in
  // components/space/space-scene.test.ts)
  it('Scenario: An idle fleet renders at its live position, advancing with world time (element evaluation reproduces every served body position)', () => {
    const t = wire.worldTime
    const parented = wire.features.filter((f) => f.orbitElements)
    expect(parented.length, 'the sample must carry parented bodies to assert over').toBeGreaterThan(5)
    for (const f of parented) {
      expectClose(drawAbsolute(f.id, t), f.space, `body ${f.id}`)
    }
  })

  it('SDET-added: a moon composes onto its parent planet rather than onto the star', () => {
    const t = wire.worldTime
    expect(
      grandchild,
      'the recorded sample must carry a body whose parent is itself parented — the backend recorder refuses ' +
        'to record one that does not, so an absent grandchild means the sample was hand-edited',
    ).toBeDefined()
    const moon = grandchild!
    const parentId = moon.orbitElements!.parentId
    // Its parent is a body in its own orbit, NOT the system's parentless root.
    expect(byId.get(parentId)?.orbitElements?.parentId, `${moon.id}'s parent must itself be parented`).toBeTruthy()
    const local = drawOrbitPosition(moon.orbitElements!, t)
    expectClose(vecAdd(drawAbsolute(parentId, t), local), moon.space, `${moon.id} composed onto ${parentId}`)
    // Drawn from the star alone (ignoring the parent) it lands well away from
    // the served position; the composition is what this asserts.
    const wrong = Math.abs(local.x - moon.space.X) + Math.abs(local.z - moon.space.Z)
    expect(wrong, 'the local offset alone must NOT already equal the served absolute position').toBeGreaterThan(1)
  })

  it('SDET-added: the station composes onto its host planet', () => {
    const t = wire.worldTime
    expect(station, 'every spawn home carries exactly one station body').toBeDefined()
    const host = station!.orbitElements!.parentId
    expect(host, 'the station orbits a host body, never nothing').toBeTruthy()
    expectClose(drawAbsolute(station!.id, t), station!.space, `station on ${host}`)
  })

  it('Scenario: A lane-gate body\'s read carries its full orbital element set (a gate draws from its elements like any other body)', () => {
    const t = wire.worldTime
    expect(wire.laneGates.length).toBeGreaterThan(0)
    for (const g of wire.laneGates) {
      expectClose(drawOrbitPosition(g.orbitElements, t), g.space, `gate ${g.destSystemId}`)
    }
  })

  it('SDET-added: a zero period holds an element set motionless at its stored phase', () => {
    // Every lane gate in the sample carries periodMs 0 — a gate does not
    // revolve. A client that divided by the period would produce NaN.
    const gate = wire.laneGates[0]
    expect(gate.orbitElements.periodMs).toBe(0)
    const a = drawOrbitPosition(gate.orbitElements, wire.worldTime)
    const b = drawOrbitPosition(gate.orbitElements, wire.worldTime + 10_000_000)
    expect(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)).toBe(true)
    expect(b).toEqual(a)
  })

  it('SDET-added: advancing world time by exactly one period returns the same drawn position', () => {
    expect(revolving, 'the sample must carry a body with a non-zero period and radius').toBeDefined()
    const el = revolving!.orbitElements!
    const a = drawOrbitPosition(el, wire.worldTime)
    const b = drawOrbitPosition(el, wire.worldTime + el.periodMs)
    expect(Math.abs(a.x - b.x)).toBeLessThan(TOL)
    expect(Math.abs(a.y - b.y)).toBeLessThan(TOL)
    expect(Math.abs(a.z - b.z)).toBeLessThan(TOL)
  })

  it('SDET-added: a half period moves the drawn position, so the evaluation is not frozen', () => {
    expect(revolving, 'the sample must carry a body with a non-zero period and radius').toBeDefined()
    const el = revolving!.orbitElements!
    const a = drawOrbitPosition(el, wire.worldTime)
    const b = drawOrbitPosition(el, wire.worldTime + Math.round(el.periodMs / 2))
    const moved = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    expect(moved, 'half an orbit must move the mark by roughly the diameter').toBeGreaterThan(el.radius)
  })

  it('SDET-added: a world time before the world epoch still draws a finite position', () => {
    expect(revolving, 'the sample must carry a body with a non-zero period and radius').toBeDefined()
    const el = revolving!.orbitElements!
    const p = drawOrbitPosition(el, -12345)
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true)
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(el.radius, 6)
  })
})

describe('lib/space/draw — drawParkPosition and drawDriftPosition', () => {
  // A park's local offset is PLANAR — no inclination, no node
  // (`backend/space/park.go`: "a ship's own resting orbit is simpler than a
  // body's generated one") — and is relative to the host body, advancing
  // from the park's OWN epoch rather than from world time 0.
  it('SDET-added: an orbit park advances from its own epoch, in the plane, at its own radius', () => {
    const park = {
      kind: 0 as const, // orbit
      bodyId: 'feat-body-0',
      radius: 8,
      periodMs: 4000,
      phase: 0,
      epochMs: 1_000_000,
      offset: { x: 0, y: 0, z: 0 },
      point: { x: 0, y: 0, z: 0 },
    }
    const atEpoch = drawParkPosition(park, 1_000_000)
    expect(atEpoch.x).toBeCloseTo(8, 9)
    expect(atEpoch.y).toBe(0)
    expect(atEpoch.z).toBeCloseTo(0, 9)

    const quarter = drawParkPosition(park, 1_000_000 + 1000)
    expect(quarter.x).toBeCloseTo(0, 5)
    expect(quarter.y).toBe(0)
    expect(quarter.z).toBeCloseTo(8, 5)

    const full = drawParkPosition(park, 1_000_000 + 4000)
    expect(full.x).toBeCloseTo(8, 5)
    expect(full.z).toBeCloseTo(0, 5)
  })

  it('SDET-added: a station-keep park holds a constant offset from its host', () => {
    const park = {
      kind: 1 as const, // stationkeep
      bodyId: 'feat-body-0',
      radius: 0,
      periodMs: 0,
      phase: 0,
      epochMs: 0,
      offset: { x: 3, y: -1, z: 4 },
      point: { x: 0, y: 0, z: 0 },
    }
    expect(drawParkPosition(park, 0)).toEqual({ x: 3, y: -1, z: 4 })
    expect(drawParkPosition(park, 9_999_999)).toEqual({ x: 3, y: -1, z: 4 })
  })

  it('SDET-added: a point park is a fixed absolute position', () => {
    const park = {
      kind: 2 as const, // point
      bodyId: '',
      radius: 0,
      periodMs: 0,
      phase: 0,
      epochMs: 0,
      offset: { x: 0, y: 0, z: 0 },
      point: { x: 11, y: 12, z: 13 },
    }
    expect(drawParkPosition(park, 0)).toEqual({ x: 11, y: 12, z: 13 })
    expect(drawParkPosition(park, 5_000_000)).toEqual({ x: 11, y: 12, z: 13 })
  })

  it('SDET-added: a drift is anchor + velocityPerSecond x elapsed SECONDS, and is exactly the anchor at its epoch', () => {
    const drift = {
      anchor: { x: 1, y: 2, z: 3 },
      velocityPerSecond: { x: 0.5, y: 0, z: -0.25 },
      epochMs: 1000,
    }
    // At the epoch the elapsed term vanishes under either unit — the anchor
    // case is a floor, not the discriminator.
    expect(drawDriftPosition(drift, 1000)).toEqual({ x: 1, y: 2, z: 3 })

    // 4000 ms = 4 SECONDS after the epoch. Under the per-second contract:
    //   x = 1 + 0.5x4 = 3,  y = 2,  z = 3 - 0.25x4 = 2.
    // An implementation that read the elapsed term as milliseconds would put
    // this at x = 2001, z = -997 — the 1000x error the unit name exists to
    // make impossible.
    const later = drawDriftPosition(drift, 1000 + 4000)
    expect(later.x).toBeCloseTo(3, 9)
    expect(later.y).toBeCloseTo(2, 9)
    expect(later.z).toBeCloseTo(2, 9)
  })

  it('SDET-added: a drift matches space.Drift.Position for the server\'s own units', () => {
    // The same fixture backend/space/codec_state_test.go round-trips
    // (Velocity {1.5, 0, -0.75} per second at a real world-ms epoch),
    // evaluated by the server's formula: Anchor + Velocity x (t-epoch)/1000.
    const epochMs = 1_700_000_000_000
    const drift = {
      anchor: { x: -10, y: 4, z: 7 },
      velocityPerSecond: { x: 1.5, y: 0, z: -0.75 },
      epochMs,
    }
    const at = drawDriftPosition(drift, epochMs + 2500) // 2.5 s
    expect(at.x).toBeCloseTo(-10 + 1.5 * 2.5, 9)
    expect(at.y).toBeCloseTo(4, 9)
    expect(at.z).toBeCloseTo(7 - 0.75 * 2.5, 9)
  })

  it('SDET-added: the elapsed term is signed — a time before the epoch displaces backward', () => {
    const drift = {
      anchor: { x: 0, y: 0, z: 0 },
      velocityPerSecond: { x: 2, y: 0, z: 0 },
      epochMs: 10_000,
    }
    expect(drawDriftPosition(drift, 10_000 - 3000).x).toBeCloseTo(-6, 9)
  })
})

describe('lib/space/draw — the burn mark is drawn by curve parameter', () => {
  const preview = JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'backend/testdata/serve-orbital-elements-and-burn-preview/preview-response.json'),
      'utf8',
    ),
  ) as {
    controlPoints: { X: number; Y: number; Z: number }[]
    departMs: number
    arriveMs: number
  }
  const cps: DrawVec3[] = preview.controlPoints.map((p) => ({ x: p.X, y: p.Y, z: p.Z }))

  // Scenario: A burning fleet's mark advances by curve parameter, not by arc
  // length
  it('Scenario: A burning fleet\'s mark advances by curve parameter, not by arc length', () => {
    const { departMs, arriveMs } = preview
    const mid = departMs + Math.round((arriveMs - departMs) / 2)
    expect(burnDrawParam(departMs, arriveMs, departMs)).toBe(0)
    expect(burnDrawParam(departMs, arriveMs, arriveMs)).toBe(1)
    // `mid` is rounded to a whole millisecond over an odd-length span, so
    // it lands a sub-microsecond off exactly 0.5 by construction.
    expect(burnDrawParam(departMs, arriveMs, mid)).toBeCloseTo(0.5, 5)

    // The drawn mark at the time-midpoint is the curve at parameter ~0.5 —
    // no arc-length inversion, no speed profile, no re-timing.
    const u = burnDrawParam(departMs, arriveMs, mid)
    const drawn = bezierPointAt(cps, u)
    const atHalf = bezierPointAt(cps, 0.5)
    expect(Math.hypot(drawn.x - atHalf.x, drawn.y - atHalf.y, drawn.z - atHalf.z)).toBeLessThan(1)
  })

  it('Scenario: A burning fleet\'s mark advances by curve parameter, not by arc length (no arc-length machinery exists to place it)', async () => {
    // The positive half above cannot, on its own, prove the ABSENCE of an
    // arc-length inversion — a module could compute one and coincidentally
    // agree at the midpoint. This half asserts the machinery is not there:
    // `lib/space/draw` exports nothing that names a curve length, a speed
    // profile, a flight time, an intercept, or a settled park. Those are
    // `space-kinematics`'s forbidden list by name, and the anti-mirror check
    // (`lib/anti-mirror-guard.test.ts`) is the guard that keeps them out.
    const mod = (await import('@/lib/space/draw')) as Record<string, unknown>
    const names = Object.keys(mod).map((n) => n.toLowerCase())
    for (const forbidden of [
      'arclength', 'arcparam', 'arctable', 'curvelength', 'coveredlength',
      'speed', 'burnspeed', 'burnprogress', 'flightseconds', 'flighttime',
      'resolveship', 'stateat', 'stationkeeprate', 'solveburn', 'intercept',
      'deltav',
    ]) {
      expect(
        names.filter((n) => n.includes(forbidden)),
        `lib/space/draw must export nothing named like "${forbidden}"`,
      ).toEqual([])
    }
  })

  it('Scenario: A burn past its served arrival freezes at the intercept until a refetch (the parameter clamps at 1)', () => {
    const { departMs, arriveMs } = preview
    expect(burnDrawParam(departMs, arriveMs, arriveMs + 1)).toBe(1)
    expect(burnDrawParam(departMs, arriveMs, arriveMs + 10_000_000)).toBe(1)
    // Drawn at u = 1 the mark is the curve's last control point — the served
    // intercept — and does not move as time advances past arrival.
    const a = bezierPointAt(cps, burnDrawParam(departMs, arriveMs, arriveMs + 1))
    const b = bezierPointAt(cps, burnDrawParam(departMs, arriveMs, arriveMs + 10_000_000))
    expect(a).toEqual(b)
    expect(a.x).toBeCloseTo(cps[cps.length - 1].x, 9)
    expect(a.y).toBeCloseTo(cps[cps.length - 1].y, 9)
    expect(a.z).toBeCloseTo(cps[cps.length - 1].z, 9)
  })

  it('SDET-added: the parameter clamps at 0 before departure', () => {
    const { departMs, arriveMs } = preview
    expect(burnDrawParam(departMs, arriveMs, departMs - 1)).toBe(0)
    expect(burnDrawParam(departMs, arriveMs, 0)).toBe(0)
  })

  it('SDET-added: a degenerate zero-length burn window yields 1 rather than NaN or Infinity', () => {
    const v = burnDrawParam(5000, 5000, 5000)
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBe(1)
  })

  it('SDET-added: bezierPointAt interpolates the served six control points at both endpoints', () => {
    expect(bezierPointAt(cps, 0).x).toBeCloseTo(cps[0].x, 9)
    expect(bezierPointAt(cps, 0).z).toBeCloseTo(cps[0].z, 9)
    expect(bezierPointAt(cps, 1).x).toBeCloseTo(cps[5].x, 9)
    expect(bezierPointAt(cps, 1).z).toBeCloseTo(cps[5].z, 9)
  })

  it('SDET-added: bezierPointAt is a genuine quintic, not a straight-line lerp of the endpoints', () => {
    // NOTE, measured: the RECORDED sample's own six control points are
    // collinear and evenly spaced (its target is a far synthetic point), so
    // its midpoint IS the chord midpoint and it cannot distinguish a quintic
    // from a lerp. This probe therefore uses a deliberately bowed control
    // polygon. A `lerp(cps[0], cps[5], u)` implementation lands on the chord;
    // the quintic does not.
    const bowed: DrawVec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 100 },
      { x: 50, y: 0, z: 200 },
      { x: 150, y: 0, z: 200 },
      { x: 200, y: 0, z: 100 },
      { x: 200, y: 0, z: 0 },
    ]
    const chordMid = { x: 100, y: 0, z: 0 }
    const at = bezierPointAt(bowed, 0.5)
    const off = Math.hypot(at.x - chordMid.x, at.y - chordMid.y, at.z - chordMid.z)
    expect(off, 'the quintic must not collapse to a chord lerp').toBeGreaterThan(10)
    // ...and it still interpolates both endpoints exactly.
    expect(bezierPointAt(bowed, 0)).toEqual({ x: 0, y: 0, z: 0 })
    expect(bezierPointAt(bowed, 1).x).toBeCloseTo(200, 9)
    expect(bezierPointAt(bowed, 1).z).toBeCloseTo(0, 9)
  })

  it('SDET-added: bezierPointAt advances monotonically in the parameter over this curve', () => {
    let prev = bezierPointAt(cps, 0)
    for (let u = 0.1; u <= 1.0001; u += 0.1) {
      const p = bezierPointAt(cps, u)
      expect(Math.hypot(p.x - cps[0].x, p.y - cps[0].y, p.z - cps[0].z)).toBeGreaterThan(
        Math.hypot(prev.x - cps[0].x, prev.y - cps[0].y, prev.z - cps[0].z),
      )
      prev = p
    }
  })
})

describe('lib/space/draw — origin detection', () => {
  // Supports `system-space-view` *A Non-Star Position at the Origin Is
  // Omitted From the Scene, Not Drawn Atop the Star*. EXACT equality is the
  // requirement's own word; a tolerance would omit legitimately near-star
  // bodies.
  it('SDET-added: isDrawOrigin is true only for the exact zero vector', () => {
    expect(isDrawOrigin({ x: 0, y: 0, z: 0 })).toBe(true)
    expect(isDrawOrigin({ x: 0, y: 0, z: 1e-12 })).toBe(false)
    expect(isDrawOrigin({ x: -0, y: -0, z: -0 })).toBe(true)
    expect(isDrawOrigin({ x: 1, y: 0, z: 0 })).toBe(false)
  })
})

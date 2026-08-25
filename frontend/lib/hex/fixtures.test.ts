import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { line, routeAround, type Hex } from './hex'
import { orbState, type Orbit } from './orbit'
import { solveHex, solveIntercept } from './intercept'
import { laneGateHex } from './gate'
import { stateAt, type MovementState } from './movement'
import { lineOfSight, beamHexes, hexKey, type BeamParams } from './visibility'

// The Go↔TS determinism seam (build-order cross-cutting rule).
//
// backend/board/fixtures_test.go OWNS /fixtures/board/cases.json —
// `UPDATE_FIXTURES=1 go test ./board/...` regenerates it from the Go
// implementation. lib/hex is a READ-ONLY consumer: there is deliberately no
// regeneration path here. If these assertions fail, lib/hex has drifted from the
// backend and lib/hex is what's wrong — fix the mirror, don't touch the golden.
//
// The file is read with fs (not `import`) so we don't ask Vite to serve a module
// from outside the frontend project root (its fs-allow list would reject it).

interface LineCase {
  from: Hex
  to: Hex
  path: Hex[]
}

interface RouteCase {
  from: Hex
  to: Hex
  path: Hex[]
}

interface OrbCase {
  orbit: Orbit
  t: number
  hex: Hex
}

interface SolveCase {
  from: Hex
  dest?: Hex
  orbit?: Orbit
  now: number
  msPerTile: number
  horizon?: number
  path: Hex[]
  meetHex: Hex
  arriveTime: number
}

interface GateCase {
  selfX: number
  selfY: number
  neighborX: number
  neighborY: number
  radius: number
  gate: Hex
}

interface StateAtCase {
  state: MovementState
  t: number
  out: MovementState
}

interface LosCase {
  origin: Hex
  target: Hex
  occluders: Hex[] | null
  visible: boolean
}

interface BeamCase {
  origin: Hex
  aim: Hex
  params: BeamParams
  hexes: Hex[]
}

interface LayoutConstCase {
  name: string
  value: number
}

interface Fixtures {
  // Recording provenance (GOARCH/GOAMD64 the file was generated on) — written
  // by the Go regeneration path, deliberately NOT asserted: the cases must
  // reproduce on every target, the stamp says where they were recorded.
  _meta?: { generatedOn: { goarch: string; goamd64?: string }; note?: string }
  line: LineCase[]
  routeAround: RouteCase[]
  orbState: OrbCase[]
  solveHex: SolveCase[]
  solveIntercept: SolveCase[]
  laneGate: GateCase[]
  stateAt: StateAtCase[]
  lineOfSight: LosCase[]
  beam: BeamCase[]
  layoutConstants: LayoutConstCase[]
}

// Walk up from the working directory to the repo-root golden. Anchoring on cwd
// (not import.meta.url) works under Vitest's module runner, where import.meta is
// not a file:// URL; the upward search tolerates running from frontend/ or root.
function goldenPath(): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'fixtures/board/cases.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`could not locate fixtures/board/cases.json from ${process.cwd()}`)
}

const fixtures = JSON.parse(readFileSync(goldenPath(), 'utf8')) as Fixtures

describe('board fixtures — Go↔TS determinism seam', () => {
  it.each(fixtures.line)('line[%#]', (c) => {
    expect(line(c.from, c.to)).toEqual(c.path)
  })

  it.each(fixtures.routeAround)('routeAround[%#]', (c) => {
    expect(routeAround(c.from, c.to)).toEqual(c.path)
  })

  it.each(fixtures.orbState)('orbState[%#]', (c) => {
    expect(orbState(c.orbit, c.t)).toEqual(c.hex)
  })

  it.each(fixtures.solveHex)('solveHex[%#]', (c) => {
    const s = solveHex(c.from, c.dest!, c.now, c.msPerTile)
    expect(s.path).toEqual(c.path)
    expect(s.meetHex).toEqual(c.meetHex)
    expect(s.arriveTime).toBe(c.arriveTime)
  })

  it.each(fixtures.solveIntercept)('solveIntercept[%#]', (c) => {
    const s = solveIntercept(c.from, c.orbit!, c.now, c.msPerTile, c.horizon!)
    expect(s.path).toEqual(c.path)
    expect(s.meetHex).toEqual(c.meetHex)
    expect(s.arriveTime).toBe(c.arriveTime)
  })

  it.each(fixtures.laneGate)('laneGate[%#]', (c) => {
    expect(laneGateHex(c.selfX, c.selfY, c.neighborX, c.neighborY, c.radius)).toEqual(c.gate)
  })

  // The effective-state fold, including the folded coast's period — which pins
  // lib/hex/tuning.ts ORBIT_BASE_PERIOD to the backend's orbital law.
  it.each(fixtures.stateAt)('stateAt[%#]', (c) => {
    expect(stateAt(c.state, c.t)).toEqual(c.out)
  })

  // Line of sight + the scan-beam corridor (#0006 Decisions #15/#16) — the
  // geometry the aimed occluded scan and the shadowed ambient bubble share.
  // Spec: 0006/S2
  it.each(fixtures.lineOfSight)('lineOfSight[%#]', (c) => {
    const occ = new Set((c.occluders ?? []).map(hexKey))
    expect(lineOfSight(c.origin, c.target, occ)).toBe(c.visible)
  })

  it.each(fixtures.beam)('beam[%#]', (c) => {
    expect(beamHexes(c.origin, c.aim, c.params)).toEqual(c.hexes)
  })

  // Layout constants are asserted, not assumed: ECMAScript specifies Math.sqrt
  // as implementation-approximated (not correctly-rounded like Go's math.Sqrt),
  // so sqrt(3) equality across the seam is an observation about today's engines
  // that this pin turns into a tested contract — the lane-gate bearing depends
  // on it (openspec cross-stack-determinism, sqrt-pinning requirement).
  it.each(fixtures.layoutConstants)('layoutConstants[%#] $name', (c) => {
    const computed: Record<string, number> = { sqrt3: Math.sqrt(3) }
    expect(computed[c.name]).toBeDefined()
    expect(computed[c.name]).toBe(c.value)
  })

  it('covers every recorded case group (guards a truncated golden)', () => {
    expect(fixtures.line.length).toBeGreaterThan(0)
    expect(fixtures.routeAround.length).toBeGreaterThan(0)
    expect(fixtures.orbState.length).toBeGreaterThan(0)
    expect(fixtures.solveHex.length).toBeGreaterThan(0)
    expect(fixtures.solveIntercept.length).toBeGreaterThan(0)
    expect(fixtures.laneGate.length).toBeGreaterThan(0)
    expect(fixtures.stateAt.length).toBeGreaterThan(0)
    expect(fixtures.lineOfSight.length).toBeGreaterThan(0)
    expect(fixtures.beam.length).toBeGreaterThan(0)
    expect(fixtures.layoutConstants.length).toBeGreaterThan(0)
  })
})

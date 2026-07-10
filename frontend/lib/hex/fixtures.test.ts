import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { line, routeAround, type Hex } from './hex'
import { orbState, type Orbit } from './orbit'
import { solveHex, solveIntercept } from './intercept'

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

interface Fixtures {
  line: LineCase[]
  routeAround: RouteCase[]
  orbState: OrbCase[]
  solveHex: SolveCase[]
  solveIntercept: SolveCase[]
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

  it('covers every recorded case group (guards a truncated golden)', () => {
    expect(fixtures.line.length).toBeGreaterThan(0)
    expect(fixtures.routeAround.length).toBeGreaterThan(0)
    expect(fixtures.orbState.length).toBeGreaterThan(0)
    expect(fixtures.solveHex.length).toBeGreaterThan(0)
    expect(fixtures.solveIntercept.length).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type Schedule, slotsForRing } from '@/lib/polar'
import { type Cell, distance } from './board'
import { laneGateCell } from './gate'
import { solveCell, solveIntercept } from './intercept'
import { stateAt, shipPos, type MovementState } from './movement'
import { orbState, orbitThrough, type Orbit } from './orbit'
import { beamCells, lineOfSight, type BeamParams, type Occluder } from './visibility'

// The Go↔TS determinism seam (openspec cross-stack-determinism, "Shared
// Board Math Is Pinned By a Cross-Language Golden Fixture").
//
// backend/board/fixtures_test.go OWNS /fixtures/board/cases.json —
// `UPDATE_FIXTURES=1 go test ./board/...` regenerates it from the Go
// implementation. lib/board is a READ-ONLY consumer: there is deliberately
// no regeneration path here. If these assertions fail, lib/board has drifted
// from the backend and lib/board is what's wrong — fix the mirror, don't
// touch the golden.
//
// Every case names the slot schedule it was generated under, and this suite
// applies THAT schedule — never a default — so a future schedule change
// cannot silently invalidate a recorded case.

interface NamedSchedule {
  innerSlots: number
  doubleAt: number[]
  maxRing: number
  counts: number[]
}

interface SolveCellCase {
  schedule: string
  from: Cell
  dest: Cell
  now: number
  msPerTile: number
  path: Cell[]
  meetCell: Cell
  arriveTime: number
}

interface Fixtures {
  _meta?: { generatedOn: { goarch: string; goamd64?: string } }
  schedules: Record<string, NamedSchedule>
  coordinateTable: { scale: number; slotCounts: number[]; digest: string }
  distance: { schedule: string; a: Cell; b: Cell; distance: number }[]
  orbState: { schedule: string; orbit: Orbit; t: number; cell: Cell }[]
  orbitThrough: { schedule: string; cell: Cell; at: number; period: number; dir: number; angle0: number }[]
  solveCell: SolveCellCase[]
  solveIntercept: {
    schedule: string
    from: Cell
    orbit: Orbit
    now: number
    msPerTile: number
    horizon: number
    path: Cell[]
    meetCell: Cell
    arriveTime: number
  }[]
  laneGate: {
    schedule: string
    selfX: number
    selfY: number
    neighborX: number
    neighborY: number
    radius: number
    gate: Cell
  }[]
  stateAt: { schedule: string; state: MovementState; t: number; out: MovementState }[]
  shipPos: { schedule: string; state: MovementState; t: number; cell: Cell; ok: boolean }[]
  lineOfSight: { schedule: string; origin: Cell; target: Cell; occluders: Occluder[] | null; visible: boolean }[]
  beam: { schedule: string; origin: Cell; aim: Cell; params: BeamParams; cells: Cell[] | null }[]
  distanceSweep: { schedule: string; maxRing: number; lines: number; digest: string }[]
  orbStateSweep: { schedule: string; maxRing: number; periods: number[]; offsets: string; lines: number; digest: string }[]
  orbitThroughSweep: { schedule: string; maxRing: number; periods: number[]; offsets: string; lines: number; digest: string }[]
  solveCellSweep: { schedule: string; maxRing: number; now: number; msPerTile: number; lines: number; digest: string }[]
  lineOfSightSweep: { schedule: string; maxRing: number; occluders: Occluder[]; lines: number; digest: string }[]
  beamSweep: { schedule: string; maxRing: number; params: BeamParams; lines: number; digest: string }[]
}

// Walk up from the working directory to the repo root (import.meta is not a
// file:// URL under Vitest's module runner, and Vite's fs-allow list rejects
// an import from outside the frontend root).
function repoPath(rel: string): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, rel)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`could not locate ${rel} from ${process.cwd()}`)
}

const fixtures = JSON.parse(readFileSync(repoPath('fixtures/board/cases.json'), 'utf8')) as Fixtures

function scheduleByName(name: string): Schedule {
  const ns = fixtures.schedules[name]
  if (!ns) throw new Error(`fixture case names unknown schedule '${name}'`)
  return { maxRing: ns.maxRing, counts: ns.counts }
}

class SweepHash {
  private readonly hash = createHash('sha256')
  lines = 0
  line(l: string): void {
    if (this.lines > 0) this.hash.update('\n')
    this.hash.update(l)
    this.lines++
  }
  digest(): string {
    return this.hash.digest('hex')
  }
}

function sweepOffsets(period: number): number[] {
  const out: number[] = []
  for (let k = 0; k <= 4; k++) out.push(Number((BigInt(period) * BigInt(k)) / BigInt(4)))
  return out
}

function cellsSerial(cells: Cell[]): string {
  return cells.map((c) => `${c.ring}:${c.slot}`).join(',')
}

describe('board fixtures — Go↔TS determinism seam', () => {
  // The pinned coordinate table, byte-identical across the seam (openspec
  // board-tactical-math, "A Pinned Coordinate Table Grounds Board Geometry";
  // tasks.md 3.2): the lib/board copy this module computes with must be
  // byte-identical to the canonical fixtures artifact, whose SHA-256 the
  // cases file records.
  it('coordinate table: lib/board copy is byte-identical to the canonical artifact', () => {
    const canonical = readFileSync(repoPath('fixtures/board/coordinate-table.json'))
    const localCopy = readFileSync(resolve(__dirname, 'coordtable.json'))
    expect(localCopy.equals(canonical)).toBe(true)
    const digest = createHash('sha256').update(canonical).digest('hex')
    expect(digest).toBe(fixtures.coordinateTable.digest)
    expect(fixtures.coordinateTable.scale).toBe(65536)
  })

  it.each(fixtures.distance)('distance[%#]', (c) => {
    const s = scheduleByName(c.schedule)
    expect(distance(c.a, c.b, s)).toBe(c.distance)
    expect(distance(c.b, c.a, s)).toBe(c.distance)
  })

  it.each(fixtures.orbState)('orbState[%#]', (c) => {
    expect(orbState(c.orbit, c.t, scheduleByName(c.schedule))).toEqual(c.cell)
  })

  it.each(fixtures.orbitThrough)('orbitThrough[%#]', (c) => {
    const s = scheduleByName(c.schedule)
    const o = orbitThrough(c.cell, c.at, c.period, c.dir, s)
    expect(o.angle0).toBe(c.angle0)
    // the requirement itself: evaluating the settled orbit at `at`
    // reproduces the settle cell exactly — never a different slot
    expect(orbState(o, c.at, s)).toEqual(
      c.cell.ring <= 0 ? { ring: 0, slot: 0 } : c.cell,
    )
  })

  it.each(fixtures.solveCell)('solveCell[%#]', (c) => {
    const sol = solveCell(c.from, c.dest, c.now, c.msPerTile, scheduleByName(c.schedule))
    expect(sol.path).toEqual(c.path)
    expect(sol.meetCell).toEqual(c.meetCell)
    expect(sol.arriveTime).toBe(c.arriveTime)
  })

  it.each(fixtures.solveIntercept)('solveIntercept[%#]', (c) => {
    const sol = solveIntercept(c.from, c.orbit, c.now, c.msPerTile, c.horizon, scheduleByName(c.schedule))
    expect(sol.path).toEqual(c.path)
    expect(sol.meetCell).toEqual(c.meetCell)
    expect(sol.arriveTime).toBe(c.arriveTime)
  })

  it.each(fixtures.laneGate)('laneGate[%#]', (c) => {
    expect(laneGateCell(c.selfX, c.selfY, c.neighborX, c.neighborY, c.radius)).toEqual(c.gate)
  })

  // The effective-state fold, including the folded coast's period — which
  // pins lib/board/tuning.ts ORBIT_BASE_PERIOD to the backend's orbital law.
  it.each(fixtures.stateAt)('stateAt[%#]', (c) => {
    expect(stateAt(c.state, c.t, scheduleByName(c.schedule))).toEqual(c.out)
  })

  it.each(fixtures.shipPos)('shipPos[%#]', (c) => {
    const got = shipPos(c.state, c.t, scheduleByName(c.schedule))
    expect(got.cell).toEqual(c.cell)
    expect(got.ok).toBe(c.ok)
  })

  it.each(fixtures.lineOfSight)('lineOfSight[%#]', (c) => {
    expect(lineOfSight(c.origin, c.target, c.occluders ?? [], scheduleByName(c.schedule))).toBe(c.visible)
  })

  it.each(fixtures.beam)('beam[%#]', (c) => {
    expect(beamCells(c.origin, c.aim, c.params, scheduleByName(c.schedule))).toEqual(c.cells ?? [])
  })

  // --- exhaustive sweeps: full bounded-domain re-enumeration ---------------

  it.each(fixtures.distanceSweep)('distanceSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let fr = 0; fr <= c.maxRing; fr++) {
      for (let fs = 0; fs < slotsForRing(fr, s); fs++) {
        for (let tr = 0; tr <= c.maxRing; tr++) {
          for (let ts = 0; ts < slotsForRing(tr, s); ts++) {
            sh.line(String(distance({ ring: fr, slot: fs }, { ring: tr, slot: ts }, s)))
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it.each(fixtures.orbStateSweep)('orbStateSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let ring = 0; ring <= c.maxRing; ring++) {
      for (let slot = 0; slot < slotsForRing(ring, s); slot++) {
        for (const period of c.periods) {
          for (const dir of [-1, 1]) {
            for (const t of sweepOffsets(period)) {
              const cell = orbState({ ring, angle0: slot, period, dir }, t, s)
              sh.line(`${cell.ring}:${cell.slot}`)
            }
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it.each(fixtures.orbitThroughSweep)('orbitThroughSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let ring = 0; ring <= c.maxRing; ring++) {
      for (let slot = 0; slot < slotsForRing(ring, s); slot++) {
        for (const period of c.periods) {
          for (const dir of [-1, 1]) {
            for (const at of sweepOffsets(period)) {
              const o = orbitThrough({ ring, slot }, at, period, dir, s)
              sh.line(`${o.ring}:${o.angle0}`)
            }
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it.each(fixtures.solveCellSweep)('solveCellSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let fr = 0; fr <= c.maxRing; fr++) {
      for (let fs = 0; fs < slotsForRing(fr, s); fs++) {
        for (let tr = 0; tr <= c.maxRing; tr++) {
          for (let ts = 0; ts < slotsForRing(tr, s); ts++) {
            const sol = solveCell({ ring: fr, slot: fs }, { ring: tr, slot: ts }, c.now, c.msPerTile, s)
            sh.line(`${cellsSerial(sol.path)}|${sol.arriveTime}`)
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it.each(fixtures.lineOfSightSweep)('lineOfSightSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let fr = 0; fr <= c.maxRing; fr++) {
      for (let fs = 0; fs < slotsForRing(fr, s); fs++) {
        for (let tr = 0; tr <= c.maxRing; tr++) {
          for (let ts = 0; ts < slotsForRing(tr, s); ts++) {
            sh.line(lineOfSight({ ring: fr, slot: fs }, { ring: tr, slot: ts }, c.occluders, s) ? '1' : '0')
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it.each(fixtures.beamSweep)('beamSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let fr = 0; fr <= c.maxRing; fr++) {
      for (let fs = 0; fs < slotsForRing(fr, s); fs++) {
        for (let tr = 0; tr <= c.maxRing; tr++) {
          for (let ts = 0; ts < slotsForRing(tr, s); ts++) {
            sh.line(cellsSerial(beamCells({ ring: fr, slot: fs }, { ring: tr, slot: ts }, c.params, s)))
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it('covers every recorded case group (guards a truncated golden)', () => {
    expect(Object.keys(fixtures.schedules).length).toBeGreaterThan(0)
    expect(fixtures.coordinateTable.digest.length).toBe(64)
    expect(fixtures.distance.length).toBeGreaterThan(0)
    expect(fixtures.orbState.length).toBeGreaterThan(0)
    expect(fixtures.orbitThrough.length).toBeGreaterThan(0)
    expect(fixtures.solveCell.length).toBeGreaterThan(0)
    expect(fixtures.solveIntercept.length).toBeGreaterThan(0)
    expect(fixtures.laneGate.length).toBeGreaterThan(0)
    expect(fixtures.stateAt.length).toBeGreaterThan(0)
    expect(fixtures.shipPos.length).toBeGreaterThan(0)
    expect(fixtures.lineOfSight.length).toBeGreaterThan(0)
    expect(fixtures.beam.length).toBeGreaterThan(0)
    expect(fixtures.distanceSweep.length).toBeGreaterThan(0)
    expect(fixtures.orbStateSweep.length).toBeGreaterThan(0)
    expect(fixtures.orbitThroughSweep.length).toBeGreaterThan(0)
    expect(fixtures.solveCellSweep.length).toBeGreaterThan(0)
    expect(fixtures.lineOfSightSweep.length).toBeGreaterThan(0)
    expect(fixtures.beamSweep.length).toBeGreaterThan(0)
  })
})

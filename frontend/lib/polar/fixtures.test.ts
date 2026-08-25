import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  arcPath,
  bandedSchedule,
  cellAt,
  isAdjacent,
  normalizeSlot,
  orbitThrough,
  type PolarCell,
  type PolarOrbit,
  type Schedule,
  slotsForRing,
  validateSchedule,
} from './index'

// The polar lattice's Go↔TS determinism seam (openspec polar-lattice-math,
// "A New Cross-Language Fixture Family Pins the Lattice").
//
// backend/polar/fixtures_test.go OWNS /fixtures/polar/cases.json —
// `UPDATE_FIXTURES=1 go test ./polar/...` regenerates it from the Go
// implementation. lib/polar is a READ-ONLY consumer: there is deliberately
// no regeneration path here. If these assertions fail, lib/polar has drifted
// from the backend and lib/polar is what's wrong — fix the mirror, don't
// touch the golden. If parity cannot be restored, STOP: the migration
// handoff's step 3 says parity not holding halts the whole polar migration
// (this change's tasks.md 3.5).
//
// Every case names the slot schedule it was generated under, and this suite
// applies THAT schedule — never a default — so resolving the open
// slot-schedule decision (Decision 2) can't silently invalidate a case.
//
// The four sweep cases re-enumerate the full bounded domain (rings 0–10
// under tight6: 451 cells, 203,401 ordered pairs; orbit sweeps over the
// recorded period list at the fixed offsets ⌊period·k÷4⌋, k in 0..4) and
// assert the SHA-256 digest of the newline-joined decimal serialization the
// spec fixes — so this suite proves parity over the whole domain, not just
// the hand-picked cases (a passing hand-picked suite is not evidence of
// parity when the recorded cases happen to dodge the divergent inputs —
// docs/defects/2026-08-25-line-fma-arch-divergence.md).

interface NamedSchedule {
  innerSlots: number
  doubleAt: number[]
  maxRing: number
  counts: number[]
}

interface Fixtures {
  _meta?: { generatedOn: { goarch: string; goamd64?: string; jsRuntime?: string } }
  schedules: Record<string, NamedSchedule>
  bandedSchedule: { schedule: string }[]
  normalizeSlot: { slot: number; slots: number; out: number }[]
  scheduleValidation: { name: string; schedule: Schedule; valid: boolean }[]
  adjacency: { schedule: string; a: PolarCell; b: PolarCell; adjacent: boolean }[]
  arcPath: { schedule: string; from: PolarCell; to: PolarCell; path: PolarCell[] }[]
  orbitAdvance: { schedule: string; orbit: PolarOrbit; t: number; cell: PolarCell }[]
  orbitBackSolve: {
    schedule: string
    cell: PolarCell
    at: number
    period: number
    dir: number
    epochSlot: number
  }[]
  arcPathSweep: { schedule: string; maxRing: number; lines: number; digest: string }[]
  adjacencySweep: { schedule: string; maxRing: number; lines: number; digest: string }[]
  orbitAdvanceSweep: {
    schedule: string
    maxRing: number
    periods: number[]
    offsets: string
    lines: number
    digest: string
  }[]
  orbitBackSolveSweep: {
    schedule: string
    maxRing: number
    periods: number[]
    offsets: string
    lines: number
    digest: string
  }[]
}

// Walk up from the working directory to the repo-root golden (same pattern
// as lib/hex/fixtures.test.ts — import.meta is not a file:// URL under
// Vitest's module runner, and Vite's fs-allow list rejects an import from
// outside the frontend root).
function goldenPath(): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'fixtures/polar/cases.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`could not locate fixtures/polar/cases.json from ${process.cwd()}`)
}

const fixtures = JSON.parse(readFileSync(goldenPath(), 'utf8')) as Fixtures

function scheduleByName(name: string): Schedule {
  const ns = fixtures.schedules[name]
  if (!ns) throw new Error(`fixture case names unknown schedule '${name}'`)
  return { maxRing: ns.maxRing, counts: ns.counts }
}

// A sweep preimage builder: newline-JOINED (separator, no trailing newline),
// hashed incrementally so the 203k-line enumerations never materialize.
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

// The fixed period-relative world times: ⌊period·k÷4⌋ for k in 0..4 —
// computed in BigInt, never by rounding a floating-point fraction.
function sweepOffsets(period: number): number[] {
  const out: number[] = []
  for (let k = 0; k <= 4; k++) {
    out.push(Number((BigInt(period) * BigInt(k)) / BigInt(4)))
  }
  return out
}

describe('polar fixtures — Go↔TS determinism seam', () => {
  it.each(fixtures.bandedSchedule)('bandedSchedule[%#] $schedule', (c) => {
    const ns = fixtures.schedules[c.schedule]
    expect(ns).toBeDefined()
    const built = bandedSchedule(ns.innerSlots, ns.doubleAt, ns.maxRing)
    expect(built.counts).toEqual(ns.counts)
    expect(validateSchedule(built)).toBeNull()
  })

  it.each(fixtures.normalizeSlot)('normalizeSlot[%#]', (c) => {
    expect(normalizeSlot(c.slot, c.slots)).toBe(c.out)
  })

  it.each(fixtures.scheduleValidation)('scheduleValidation[%#] $name', (c) => {
    expect(validateSchedule(c.schedule) === null).toBe(c.valid)
  })

  it.each(fixtures.adjacency)('adjacency[%#]', (c) => {
    const s = scheduleByName(c.schedule)
    expect(isAdjacent(c.a, c.b, s)).toBe(c.adjacent)
    expect(isAdjacent(c.b, c.a, s)).toBe(c.adjacent)
  })

  it.each(fixtures.arcPath)('arcPath[%#]', (c) => {
    expect(arcPath(c.from, c.to, scheduleByName(c.schedule))).toEqual(c.path)
  })

  it.each(fixtures.orbitAdvance)('orbitAdvance[%#]', (c) => {
    expect(cellAt(c.orbit, c.t, scheduleByName(c.schedule))).toEqual(c.cell)
  })

  it.each(fixtures.orbitBackSolve)('orbitBackSolve[%#]', (c) => {
    const s = scheduleByName(c.schedule)
    const o = orbitThrough(c.cell, c.at, c.period, c.dir, s)
    expect(o.epochSlot).toBe(c.epochSlot)
    // the requirement itself: evaluating the settled orbit at `at`
    // reproduces the settle cell exactly — never a different slot
    expect(cellAt(o, c.at, s)).toEqual(
      c.cell.ring <= 0 ? { ring: 0, slot: 0 } : { ring: c.cell.ring, slot: normalizeSlot(c.cell.slot, slotsForRing(c.cell.ring, s)) },
    )
  })

  it.each(fixtures.arcPathSweep)('arcPathSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let fr = 0; fr <= c.maxRing; fr++) {
      for (let fs = 0; fs < slotsForRing(fr, s); fs++) {
        for (let tr = 0; tr <= c.maxRing; tr++) {
          for (let ts = 0; ts < slotsForRing(tr, s); ts++) {
            sh.line(
              arcPath({ ring: fr, slot: fs }, { ring: tr, slot: ts }, s)
                .map((cell) => `${cell.ring}:${cell.slot}`)
                .join(','),
            )
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it.each(fixtures.adjacencySweep)('adjacencySweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let fr = 0; fr <= c.maxRing; fr++) {
      for (let fs = 0; fs < slotsForRing(fr, s); fs++) {
        for (let tr = 0; tr <= c.maxRing; tr++) {
          for (let ts = 0; ts < slotsForRing(tr, s); ts++) {
            sh.line(isAdjacent({ ring: fr, slot: fs }, { ring: tr, slot: ts }, s) ? '1' : '0')
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it.each(fixtures.orbitAdvanceSweep)('orbitAdvanceSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let ring = 0; ring <= c.maxRing; ring++) {
      for (let slot = 0; slot < slotsForRing(ring, s); slot++) {
        for (const period of c.periods) {
          for (const dir of [-1, 1]) {
            for (const t of sweepOffsets(period)) {
              const cell = cellAt({ ring, epochSlot: slot, period, dir }, t, s)
              sh.line(`${cell.ring}:${cell.slot}`)
            }
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it.each(fixtures.orbitBackSolveSweep)('orbitBackSolveSweep[%#] $schedule maxRing $maxRing', (c) => {
    const s = scheduleByName(c.schedule)
    const sh = new SweepHash()
    for (let ring = 0; ring <= c.maxRing; ring++) {
      for (let slot = 0; slot < slotsForRing(ring, s); slot++) {
        for (const period of c.periods) {
          for (const dir of [-1, 1]) {
            for (const at of sweepOffsets(period)) {
              const o = orbitThrough({ ring, slot }, at, period, dir, s)
              sh.line(`${o.ring}:${o.epochSlot}`)
            }
          }
        }
      }
    }
    expect(sh.lines).toBe(c.lines)
    expect(sh.digest()).toBe(c.digest)
  })

  it('covers every recorded case group (guards a truncated golden)', () => {
    expect(Object.keys(fixtures.schedules).length).toBeGreaterThan(0)
    expect(fixtures.bandedSchedule.length).toBeGreaterThan(0)
    expect(fixtures.normalizeSlot.length).toBeGreaterThan(0)
    expect(fixtures.scheduleValidation.length).toBeGreaterThan(0)
    expect(fixtures.adjacency.length).toBeGreaterThan(0)
    expect(fixtures.arcPath.length).toBeGreaterThan(0)
    expect(fixtures.orbitAdvance.length).toBeGreaterThan(0)
    expect(fixtures.orbitBackSolve.length).toBeGreaterThan(0)
    expect(fixtures.arcPathSweep.length).toBeGreaterThan(0)
    expect(fixtures.adjacencySweep.length).toBeGreaterThan(0)
    expect(fixtures.orbitAdvanceSweep.length).toBeGreaterThan(0)
    expect(fixtures.orbitBackSolveSweep.length).toBeGreaterThan(0)
  })
})

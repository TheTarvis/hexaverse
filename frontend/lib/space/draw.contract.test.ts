import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Implementer-authored companion to the SDET's `draw.test.ts` (openspec
// change `build-production-space-view`, tasks.md 1.8's second clause): no
// exported function in `lib/space` takes an UNSOLVED origin/target/
// acceleration triple. Such a signature is the shape of a client-side burn
// solve, which `space-kinematics` reserves to `backend/space` — the module
// draws what the server solved and nothing else.
//
// This is a source-level assertion because a solve's signature is what
// betrays it; a runtime probe cannot see a parameter name.
//
// SDET AUDIT, 2026-09-03. Reviewed under the independence rule (dev-written
// tests for dev-written code). Two of the three cases here were kept and
// widened; the third was REPLACED. It asserted
// `readdirSync('lib/space') === ['draw.ts']` — a restatement of the
// directory the developer had just created, which discriminates against no
// wrong implementation of anything and would fail the day a second
// legitimate pure-draw module lands. In its place sits the one clause of
// section 1 that nothing else automates: tasks.md 1.7's SIX deliberately
// absent spike capabilities. `frontend/lib/anti-mirror-guard.test.ts`
// catches three of the six by name collision with `backend/space`'s
// `ArcTable`/`ArcParam`/`StationKeepRate`; `burnProgress`, `burnSpeed` and
// `resolveShip` are prefixed forms that collide with nothing and would
// therefore have been ported in silence.

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(join(HERE, 'draw.ts'), 'utf8')

describe('lib/space — no client-side solve seam', () => {
  it('no exported function accepts an origin/target/acceleration triple', () => {
    // Both declaration forms: `export function f(...)` AND
    // `export const f = (...) =>`. Checking only the first would let a solve
    // in through the arrow form — a hole this SDET widened on audit.
    const signatures = [
      ...SOURCE.matchAll(/export function [A-Za-z0-9_]+\(([^)]*)\)/g),
      ...SOURCE.matchAll(/export const [A-Za-z0-9_]+(?:\s*:[^=]*)?=\s*\(([^)]*)\)\s*(?::[^=]*)?=>/g),
    ].map((m) => m[1].toLowerCase())
    expect(signatures.length, 'the module must actually export functions').toBeGreaterThan(0)
    for (const sig of signatures) {
      const solveish = ['origin', 'target', 'accel', 'acceleration'].filter((n) => sig.includes(n))
      expect(solveish, `a solve-shaped parameter list: (${sig})`).toEqual([])
    }
  })

  it('the module draws with no clock and no randomness of its own', () => {
    // Widened on SDET audit: `Date.now`/`Math.random` were the only two
    // named, and `performance.now()` is the clock a renderer actually
    // reaches for. Every drawn position must come from the `worldTimeMs`
    // passed in, or two callers drawing the same instant disagree.
    for (const forbidden of ['Date.now', 'Math.random', 'performance.now', 'new Date(', 'crypto.']) {
      expect(SOURCE, `\`${forbidden}\` in a pure draw module`).not.toContain(forbidden)
    }
  })

  // REPLACED on SDET audit (2026-09-03) — see the file header for the case
  // this displaced and why.
  //
  // tasks.md 1.7: "Port nothing from `frontend/app/spike/space-3d/sim.ts`
  // that computes `arcTable`, `arcParam`, `burnProgress`, `burnSpeed`,
  // `resolveShip`, or `stationKeepRate`; record in the module header that
  // these six are deliberately absent" (`system-space-view`: "No displayed
  // value is derived from a drawn position").
  //
  // These are not stylistic bans. Each is a rule-bearing quantity the server
  // solves and serves; a client that recomputes one draws a fleet at a
  // position the server does not agree with, and — worse — can then DISPLAY
  // that number to the player as if it were authoritative.
  const ABSENT_BY_DESIGN = [
    'arcTable',
    'arcParam',
    'burnProgress',
    'burnSpeed',
    'resolveShip',
    'stationKeepRate',
  ]

  it("declares none of the spike's six rule-bearing computations", () => {
    // Every declaration form, exported or not: the ban is on the capability
    // existing in this module at all, not on it being exported.
    const declared = [
      ...SOURCE.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z0-9_]+)/g),
    ].map((m) => m[1].toLowerCase())
    const ported = ABSENT_BY_DESIGN.filter((name) => declared.includes(name.toLowerCase()))
    expect(
      ported,
      'a rule-bearing quantity the server solves has been recomputed in the draw module',
    ).toEqual([])
  })

  it("records all six absences in its own module header, so a later porter is warned", () => {
    // 1.7's second clause, and the only thing standing between a future
    // agent and a well-meaning "the spike already had this" port. The header
    // is checked, not the whole file, so a stray mention inside a function
    // body cannot satisfy it.
    // The leading comment block: every line from the top until the first
    // line that is neither a `//` comment nor blank. (`draw.ts` imports
    // nothing, so an "up to the first import" slice would be empty — and
    // an empty header would make this case pass vacuously.)
    const lines = SOURCE.split('\n')
    const end = lines.findIndex((l) => l.trim() !== '' && !l.trimStart().startsWith('//'))
    const header = lines.slice(0, end === -1 ? lines.length : end).join('\n')
    expect(header.length, 'the module must actually carry a header comment').toBeGreaterThan(0)
    const unrecorded = ABSENT_BY_DESIGN.filter((name) => !header.includes(name))
    expect(unrecorded, 'named by tasks.md 1.7 but not recorded as deliberately absent').toEqual([])
  })
})

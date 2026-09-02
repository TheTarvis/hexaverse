// SDET structural regression test for openspec change
// replace-observation-with-sightings, tasks.md 4.17 — the test that makes
// task 4.12's re-opened STRUCTURAL half detectable: "a unit test over
// board-selection.ts and SystemBoardView.tsx (or equivalent static/
// behavioral check) asserting no 'gate'-shaped selection kind and no
// gate-aware branch remains in the burn-command path — a selected
// lane-gate body and a selected feature body both reach order.mutate
// through the identical code path."
// (board-view "Burn Command Targets a Selected Lane-Gate Body Like Any
// Other Body" — Scenario: "No gate-specific selection branch survives the
// unification".)
//
// WHY A SOURCE-INSPECTION TEST, NOT A BEHAVIORAL ONE: the existing
// behavioral suite (SystemBoardView.test.tsx's "commands a burn toward a
// selected lane-gate body, naming the gate's body id" and its siblings)
// already asserts the OUTCOME of commanding a burn with a gate selected —
// and it passed even while `board-selection.ts` carried a dedicated
// `{kind:'gate', destSystemId}` variant and `SystemBoardView.tsx`'s
// `targetBodyId` carried a parallel `selection.kind === 'gate'` ternary arm
// alongside the feature one, because that parallel branch was ALSO wired to
// produce the same correct `gate-<destSystemId>` body id. A behavioral test
// cannot distinguish "one unified path" from "two parallel paths that
// happen to agree" — only inspecting the actual selection type and the
// command path's source can. This is the same reasoning
// backend/fleet/lattice_symbols_absent_test.go's header comment gives for
// its own source-scan approach ("nothing else in the suite would notice,
// since none of them fail to compile if reintroduced as dead code").
//
// NON-VACUITY, CONFIRMED AGAINST THE PRE-4.12 SHAPE (not asserted as a
// permanent part of this suite — see below for why): this SDET ran the same
// three checks below against this repository's committed HEAD revision of
// both files (`git show HEAD:frontend/components/board/board-selection.ts`
// / `.../SystemBoardView.tsx`), i.e. the shape design.md's own re-opened
// note describes ("board-selection.ts:15,77,99, SystemBoardView.tsx:226,
// 246,345"). Both `noGateKindDiscriminant` and the single-call-site check
// FAILED against that committed shape:
//   - board-selection.ts (HEAD): matched `kind: 'gate'` (the union member)
//     once, `kind === 'gate'` once (toggleSelection's gate branch).
//   - SystemBoardView.tsx (HEAD): matched `kind === 'gate'` twice
//     (`targetBodyId`'s gate arm, `selectedGateId`'s gate arm).
// A permanent fixture pinning that OLD content forever was deliberately NOT
// added to this suite: unlike backend/fleet/lattice_symbols_absent_test.go
// (which scans the package's CURRENT production source for a regression),
// re-running these same checks against an inert string copy of code that no
// longer exists anywhere in the tree offers no forward-looking regression
// protection beyond what scanning the CURRENT files below already gives —
// it would only prove, once, that a check written today could have caught a
// defect from yesterday, which this comment already records. The task's own
// permitted alternative ("assert against a temporary inline fixture
// string") was used for exactly that one-time verification, not folded into
// the committed suite.
//
// EXPECTED RESULT TODAY: task 4.12's structural half is being landed
// concurrently by another agent in this same change (tasks.md 4.12's own
// re-opened note). As of this test's authoring, `board-selection.ts` and
// `SystemBoardView.tsx` in the working tree already carry the unified
// shape (no 'gate' kind, a single `targetBodyId` ternary keyed only on
// 'feature', a single `order.mutate(` call site) — so this test is
// expected to be GREEN, not red, the moment it is added. That is reported
// explicitly, per this role's protocol, rather than silently treated as
// business-as-usual: this test's job is to be the regression net a FUTURE
// reintroduction of the parallel branch trips, which the non-vacuity check
// above confirms it would have caught had it existed before 4.12 landed.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// findGateKindDiscriminants scans `source` for any use of the string
// 'gate' as a BoardSelection discriminant — a union member declaration
// (`kind: 'gate'`) or a comparison against one (`kind === 'gate'` /
// `kind !== 'gate'`) — the shape a reintroduced parallel gate-aware branch
// would necessarily take, whatever it renamed its local variables to.
// Deliberately does NOT flag every occurrence of the substring "gate"
// (isGateBody, selectGate, PickableGate, hitGate, gate-glyph, laneGates,
// etc. are all legitimate, non-discriminant uses this change's own
// unification keeps).
function findGateKindDiscriminants(source: string): string[] {
  const patterns: Array<{ re: RegExp; describe: string }> = [
    { re: /kind\s*:\s*'gate'/g, describe: "a 'gate' BoardSelection union member (`kind: 'gate'`)" },
    { re: /kind\s*===\s*'gate'/g, describe: "a `kind === 'gate'` comparison" },
    { re: /kind\s*!==\s*'gate'/g, describe: "a `kind !== 'gate'` comparison" },
  ]
  const found: string[] = []
  for (const { re, describe } of patterns) {
    const matches = source.match(re)
    if (matches) found.push(`${describe} (${matches.length}×)`)
  }
  return found
}

describe(
  'board-view "Burn Command Targets a Selected Lane-Gate Body Like Any Other Body" — ' +
    'Scenario: No gate-specific selection branch survives the unification',
  () => {
    it("board-selection.ts's BoardSelection type declares no gate-shaped selection kind", () => {
      const src = readFileSync(join(HERE, 'board-selection.ts'), 'utf8')
      const violations = findGateKindDiscriminants(src)
      expect(violations, `board-selection.ts still carries: ${violations.join('; ')}`).toEqual([])
    })

    it('SystemBoardView.tsx carries no gate-aware selection branch anywhere in its command path', () => {
      const src = readFileSync(join(HERE, 'SystemBoardView.tsx'), 'utf8')
      const violations = findGateKindDiscriminants(src)
      expect(violations, `SystemBoardView.tsx still carries: ${violations.join('; ')}`).toEqual([])
    })

    it('a selected lane-gate body and a selected feature body reach order.mutate through the identical (single) call site', () => {
      const src = readFileSync(join(HERE, 'SystemBoardView.tsx'), 'utf8')
      // Exactly one order.mutate call site in the whole component: with no
      // gate-kind discriminant anywhere in the file (the two checks above),
      // a single call site is what makes "identical code path" true rather
      // than merely "two paths that happen to agree" — a reintroduced
      // parallel branch feeding a SECOND order.mutate call would still pass
      // the discriminant-absence checks above if it matched on some other
      // marker (e.g. an `attachedTo`-derived flag instead of a `.kind`
      // literal), so this call-site count is a genuinely independent check,
      // not a restatement of the two above it.
      const mutateCallSites = src.match(/\border\.mutate\s*\(/g) ?? []
      expect(
        mutateCallSites.length,
        `expected exactly one order.mutate(...) call site in SystemBoardView.tsx, found ${mutateCallSites.length}`,
      ).toBe(1)
    })
  },
)

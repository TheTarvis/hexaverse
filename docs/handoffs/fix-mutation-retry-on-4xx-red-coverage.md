# Red-phase coverage — `fix-mutation-retry-on-4xx`

**SDET red handoff.** Written before any production code exists for this
change. Adversary-cleared artifacts at `946a70b`; delta re-read at handoff
time (3 requirements, **11 scenarios**), plus rulings 43–51 and adversary R3
MAJOR A–D / MINOR E–H.

- Capability: `mutation-retry-policy` (new)
- Spec delta: `openspec/changes/fix-mutation-retry-on-4xx/specs/mutation-retry-policy/spec.md`
- Tier: **1 only** (vitest). No tier 2/3/4 was run — nothing here touches the
  backend or a stack (`docs/testing-tiers.md`).
- Manifest: `docs/plans/continous_space/handoffs/red-manifest-fix-mutation-retry-on-4xx.txt`

## Commands

```bash
# The red group (and the whole predicate suite):
cd frontend && npx vitest run lib/query-client.test.ts

# The api-client half of the 408 prohibition (tasks.md 1.2c):
cd frontend && npx vitest run lib/api-client.test.ts

# Both, as the developer will run them:
cd frontend && npx vitest run lib/query-client.test.ts lib/api-client.test.ts
```

Observed at handoff: **6 failed | 34 passed (40)** across those two files;
**6 failed | 1606 passed (1612)** across the whole frontend suite — the six
failures are exactly the six rows below marked `assertion-red`, and nothing
else regressed.

## Coverage table

| # | Scenario (`mutation-retry-policy`) | Test (file:name) | Level | Status |
|---|---|---|---|---|
| 1 | A 409 conflict is not resent | `frontend/lib/query-client.test.ts:Scenario: A 409 conflict is not resent` | unit | **assertion-red** |
| 1 | A 409 conflict is not resent *(wire-level corroboration)* | `frontend/e2e/tests/space-double-submit.spec.ts:expectAllSettled2xx` at all 7 count sites | e2e | **Playwright, deferred** |
| 2 | A 5xx failure is not resent | `frontend/lib/query-client.test.ts:Scenario: A 5xx failure is not resent` | unit | already-green |
| 3 | 401 and 403 failures are not resent | `frontend/lib/query-client.test.ts:Scenario: 401 and 403 failures are not resent` | unit | already-green |
| 4 | A 408 request timeout is not resent | `frontend/lib/query-client.test.ts:Scenario: A 408 request timeout is not resent` | unit | **assertion-red** |
| 5 | A 4xx failure other than 401, 403, 408, or 409 is not resent | `frontend/lib/query-client.test.ts:Scenario: A 4xx failure other than 401, 403, 408, or 409 is not resent` | unit | **assertion-red** |
| 6 | A transport failure with no response status is still resent exactly once | `frontend/lib/query-client.test.ts:Scenario: A transport failure with no response status is still resent exactly once` | unit | already-green (see *Partial*, below) |
| 7 | A client-side request timeout is a status-less failure, not a 408 | `frontend/lib/query-client.test.ts:Scenario: A client-side request timeout is a status-less failure, not a 408` | unit | already-green |
| 7 | …the same prohibition, at the place that would break it | `frontend/lib/api-client.test.ts:should timeout requests after specified duration` (added `rejects.not.toHaveProperty('status')`, tasks.md 1.2c) | unit | already-green |
| 8 | A failure carrying no status is classified by that absence, not by its cause | `frontend/lib/query-client.test.ts:Scenario: A failure carrying no status is classified by that absence, not by its cause` | unit | already-green |
| 9 | An automatic resend records that it happened | `frontend/lib/query-client.test.ts:Scenario: An automatic resend records that it happened` | unit | **assertion-red** |
| 10 | A refused mutation records nothing | `frontend/lib/query-client.test.ts:Scenario: A refused mutation records nothing` | unit | **assertion-red** |
| 11 | An exhausted status-less failure records nothing | `frontend/lib/query-client.test.ts:Scenario: An exhausted status-less failure records nothing` | unit | **assertion-red** |

**By status: 6 `assertion-red`, 5 `already-green`, 1 `Playwright, deferred`
(a corroboration row on scenario 1, not a scenario's only coverage), 0
`compile-red`, 0 `reasoned-not-automated`. All 11 scenarios are automated at
tier 1; none is uncovered.**

## What each red group fails with

| Test | Observed failure |
|---|---|
| Scenario: A 409 conflict is not resent | `AssertionError: expected true to be false` at `query-client.test.ts:129` — today's predicate excludes only 401/403/5xx, so a 409 returns `true` at `failureCount` 0 |
| Scenario: A 408 request timeout is not resent | `AssertionError: expected true to be false` at `:178` — **the reversal**. Replaces `'should retry mutations once on retryable errors'`, which fed a 408 and asserted `true` |
| Scenario: A 4xx failure other than 401, 403, 408, or 409 | `AssertionError: a 400 must not be resent: expected true to be false` at `:187` (400/404/422/429 all resend today) |
| Scenario: An automatic resend records that it happened | `AssertionError: expected "warn" to be called 1 times, but got 0 times` at `:265` — no record exists yet |
| Scenario: A refused mutation records nothing | `AssertionError: a 409 must not be resent: expected true to be false` at `:282` — red on the scenario's own WHEN ("no automatic resend is authorized"), which is asserted rather than assumed |
| Scenario: An exhausted status-less failure records nothing | `AssertionError: expected "warn" to be called 1 times, but got 0 times` at `:299` — one resend must produce exactly one record; today it produces none, and R3 MAJOR C's over-logger produces two |

Every failure is a missing-behaviour assertion mismatch. No compile error, no
missing fixture, no harness fault: the file typechecks (`npm run lint`
→ eslint 0 errors, `tsc --noEmit` exit 0) and 14 of its 20 tests pass.

## Why the five `already-green` rows are not tautological

A green test that cannot observe its own defect is this repo's recorded
*Lesson two*. Each already-green row was therefore **mutation-tested** against
a plausible-but-wrong implementation of tasks 1.1/1.1b, in a scratch copy of
`frontend/lib/query-client.ts` that was restored byte-for-byte afterwards
(`git status` on that file is clean; the production file was never changed).

- **Mutant A — 4xx/5xx widened correctly, but the status-less arm narrowed by
  cause** (`error.name === 'AbortError' || error.name === 'TypeError'`), the
  exact implementation `tasks.md` 1.1 forbids. Result: **5 failed | 15
  passed**. Killed by scenarios **6, 7, 8, 9 and 11** — i.e. three of the five
  already-green rows are load-bearing against precisely the narrowing the spec
  prohibits, and scenario 8's cause table (SyntaxError, TypeError, AbortError,
  plain Error, thrown string / null / undefined / plain object) is what does
  the killing.
- **Mutant B — correct classification, record written before `failureCount` is
  consulted** (adversary R3 MAJOR C's over-logger, two warnings for one
  resend). Result: **1 failed | 19 passed**, killed by scenario **11** alone —
  the scenario that exists for it.
- **Satisfiability probe** — a correct reference predicate takes the file to
  **20 passed (20)**, so the red suite is achievable and contains no
  contradictory pair.

Scenarios 2 and 3 (5xx, 401/403) are `already-green` because the current
predicate is already right for those statuses; `tasks.md` 1.2 is explicit that
they are kept passing and never inverted. They are regression guards for the
widening, and Mutant A leaves them green precisely because a correct widening
must.

## Partial and deferred coverage — stated, not hidden

- **Scenario 6, "carrying the identical request payload"**, is *not* asserted.
  It is not observable at the predicate: React Query re-invokes `mutationFn`
  with the same variables, so payload identity is the caller's property, not
  the retry policy's. The one call site where it is false today
  (`frontend/hooks/use-market.ts:111`, which re-mints an operation key inside
  `mutationFn`) is already filed by **RULING 47** as an out-of-scope defect,
  and this change's Impact does not include that file. The "exactly once" half
  of the scenario is fully asserted.
- **Scenario 1's e2e row is `Playwright, deferred`** and is not run in the red
  phase (`docs/testing-tiers.md`: tier 4 runs once, at the archive gate, with
  the tree locked). Tasks 1.3/1.3b are *structural* edits to an existing spec
  file, made now so the developer does not find them mid-build; they are not
  new blind red-phase Playwright. Scenario 1 is fully covered at tier 1
  regardless — the e2e is corroboration at the wire, not the scenario's only
  proof.
- **Scenarios 6, 7 and 8 can never be observed by the e2e suite**: nothing in
  `space-double-submit.spec.ts` induces transport loss. That is the reliability
  panel's own point and the reason RULING 45 put the record assertion at tier 1.

## SDET-added coverage (exceeds the spec — not spec-mandated)

Marked `SDET-added` in the source so QA and the adversary can tell them from
scenario-mandated assertions:

- 4xx band edges: `400` and `499` (scenario 5).
- 5xx band: `502`, `503`, `599` beyond the scenario's `500` (scenario 2).
- Scenario 8's cause table carries eight heterogeneous causes, four more than
  the scenario names, all asserted to take the same arm.
- Scenario 9 asserts the **fixed marker string** `automatic transport-level
  resend` in the warning's joined arguments (adversary R3 MINOR F), not merely
  that the channel was written.

## Spec observations for the orchestrator (neither is a blocker)

1. **A status outside 4xx and 5xx is unspecified.** The requirement governs
   `4xx`, `5xx`, and the observable absence of a status. An error carrying, say,
   `status: 302` falls in none of the three, so no scenario decides it and no
   test asserts it — inventing semantics there is exactly what the skill
   forbids. In practice `api-client.ts` only attaches a status on `!response.ok`,
   so the class is close to unreachable; recorded rather than tested.
2. **Scenario 10 asserts its own WHEN.** "…and no automatic resend is
   authorized" is part of that scenario's condition, so the test asserts the
   predicate returned `false` *and* that nothing was recorded. That is why it is
   `assertion-red` today rather than vacuously green; it is not a conflation
   with scenarios 1/4/5, which own the return value in their own right.

## Test-suite health at handoff

- Full frontend vitest: **6 failed | 1606 passed (1612)** — the six above.
- `frontend`: `npm run lint` → eslint 0 errors (1 pre-existing warning in
  `components/space/webgl/SpaceWorld.draw.test.tsx`, untouched here),
  `tsc --noEmit` exit 0 — which typechecks the edited Playwright spec too
  (`tsconfig.json` includes `**/*.ts` and excludes only `node_modules`).
- **Pre-existing flake observed, not caused here:**
  `components/space/SpaceStage.interaction.test.tsx > SpaceStage — keyboard
  camera > Scenario: Keyboard input at a clamp is distinguishable from no
  input` failed on one of two full-suite runs and passed on the other and in
  isolation (6.1 s / 6.8 s against a 10 s `testTimeout` — it exceeds the budget
  under parallel load). It shares no code with this change. Reported, not
  touched.

## Files delivered (exactly the proposal's Impact, no more)

| File | What changed |
|---|---|
| `frontend/lib/query-client.test.ts` | The **"mutation retry logic" block only** was rewritten into eleven scenario-named tests. The **"retry logic" (query) block at `:19-74` is byte-for-byte unedited** and still green, including its `408`-retried-3-times and no-status cases, which are correct for reads and out of scope. Line 1's import gained `vi, beforeEach, afterEach` for the `console.warn` spy. |
| `frontend/lib/api-client.test.ts` | tasks.md 1.2c: one added assertion inside the existing "timeout handling" test. Nothing else touched. |
| `frontend/e2e/tests/space-double-submit.spec.ts` | tasks.md 1.3/1.3b: `recordPosts` now carries a `status` filled asynchronously (`req.response()` with `.catch(() => null)`, MINOR E), a `requestfailed` listener that **mutates the already-recorded entry** and never pushes a second (MAJOR D), and a new `expectAllSettled2xx` helper invoked **alongside** each of the seven count expectations. **Every existing count expectation is unchanged** — `toBe(1)` at four sites, `toBe(2)` at the two guard-release sites (`orders` after the dock-and-reorder, `sales` after the completed sale). `git diff` removes no `expect` line from this file. |
| `frontend/lib/query-client.ts` | **Not modified.** Mutated only in a scratch copy for the mutation testing above and restored byte-for-byte. This is the developer's file (tasks 1.1/1.1b). |

## RULING 51 is wired into the test, not just the rulings doc

The `toBe(2)` guard-release site in the burn test is the one command in the
file with no `/under way/` wait after the click, so until now it could only
assert a count — a refused command was invisible there. The new status
assertion at that site carries an inline comment naming
`defect-post-dock-burn-cost-drift.md`, RULING 41 and RULING 51, and stating the
outcome in advance: **if it goes red at the archive gate with a `409` carrying
"solved fuel cost exceeds the requested maxFuelTons cap", record it against
that defect file, report the red, and stop.** Do not widen
`BURN_FUEL_ALLOWANCE`; do not relax, scope down or delete the assertion.

## Immutability

These tests are immutable from this point. They change only if the spec
changes (routed by the orchestrator) or if the orchestrator adjudicates a
developer's dispute in the developer's favour. **"The code is red" is never a
cause.** Verify at the integrity check with:

```bash
bash .claude/scripts/openspec-red-manifest.sh verify fix-mutation-retry-on-4xx
```

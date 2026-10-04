# surface-commit-stranding-warning — red coverage table

SDET, red phase, 2026-10-04. Frontend only, tier 1 (vitest). No Playwright, no e2e, no stack.
Test files:

- `frontend/components/space/SpaceCommandPanel.test.tsx` — 11 new tests appended (54 total; the 43 pre-existing are untouched and green); the only edit to an existing line is the toast mock gaining `warning` (+ `act` in the RTL import).
- `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` — new, 32 tests (1 smoke, 31 section 3).

**Post-development status (integrity check): all 43 green** (see `surface-commit-stranding-warning-integrity-check.md`). Red-phase tally against the then-current code: 42 assertion-red, 1 already-green (the section 2 smoke test, hygiene by design).

Right-reason evidence: every red fails on a missing-behaviour assertion (`expected null not to be null` on
`commit-stranding-notice`, `toast.warning` / `onCommitAccepted` called 0 times). None is a compile or harness
error (`tsc --noEmit` and eslint clean on both files). Arrangement validity was proven in a scratch copy
(`$SCRATCH/wt`, `frontend/` rsynced, `node_modules` symlinked, contract 1 and 2 implemented): all 86 tests green
there. Control proof in the same copy: 16 mutants of that implementation each fail the tests listed below.

## Commands (tier 1 per `docs/testing-tiers.md`; per-task scope per `frontend/CLAUDE.md`)

```
cd frontend && npx vitest run components/space/SpaceCommandPanel.test.tsx                 # section 1: 11 failed | 43 passed
cd frontend && npx vitest run components/space/SystemSpaceView.stranding-notice.test.tsx  # sections 2-3: 31 failed | 1 passed
cd frontend && npx tsc --noEmit                                                            # clean
```

## Section 1 — `SpaceCommandPanel.test.tsx` (unit/component)

| Task | Scenario | Test (describe > it) | Level | Status |
| --- | --- | --- | --- | --- |
| 1.1 | A warned commit shows the notice with the success feedback (callback half); A response that lands after the acting fleet changed belongs to the fleet that committed | `the commit report (1.1)` > `Scenario: A response that lands after the acting fleet changed … the callback carries the fleet the command was invoked for, the instants and the warning` | component | assertion-red |
| 1.2 | A response without the stranding field shows no notice | `an unwarned commit (1.2)` > `… — the stranding field absent …` / `… — the stranding field false …` (it.each, 2) | component | assertion-red (callback half; toast halves hold today) |
| 1.3 | A rejected or failed commit shows no notice and leaves an earlier one alone | `a rejected or failed commit reports nothing (1.3)` > `… — a cap rejection …` / `… — a failure with no mapped reason …` (2) | component | assertion-red through the control leg (a successful commit calls the callback once); without it vacuous |
| 1.4 | The notice is advisory and distinct from the preview's stranding line | `the notice element (1.4)` > true with default props / true with no preview and no quote (2); `false and omitted render nothing, while true renders it` (1); `SDET-added: separate element from preview-stranding` (1) | component | assertion-red (true arms; absent arms asserted against an asserted-present GIVEN in the same test) |
| 1.5 | The warning is conveyed once, at the acceptance; The success feedback is not suppressed by the notice | `the advisory toast (1.5)` > `… — … panel still holding fleet_1 …` / `… re-rendered with fleet_2 …` (2) | component | assertion-red |

## Section 2 — harness, `SystemSpaceView.stranding-notice.test.tsx`

| Task | Test | Level | Status |
| --- | --- | --- | --- |
| 2.1, 2.2 | `harness smoke test` > `SDET-added: reads are held until answered; reconnect() and poll() each cause exactly one read` | integration (real hooks, mocked service) | already-green (hygiene by contract §6.5). Shown able to fail: the file's 31 other tests all drive the same helpers and fail only on the product assertion; a harness that did not hold reads, or whose triggers made no call, fails its asserted call counts (`toBe(2)`, `toBe(3)`) |

## Section 3 — `SystemSpaceView.stranding-notice.test.tsx` (integration: real SystemSpaceView + SpaceCommandPanel + use-fleets, mocked fleetService)

| Task | Scenario | Test (describe > it, all prefixed `Scenario:` unless SDET-added) | Status |
| --- | --- | --- | --- |
| 3.1 | The notice is shown before any read has answered after the acceptance; A warned commit shows the notice with the success feedback | `3.1` > `The notice is shown before any read has answered … — and A warned commit shows the notice …` | assertion-red |
| 3.2 | A read begun before the commit and answered after it does not end the gap | `3.2` > `A read begun before the commit and answered after it does not end the gap` (asserts the new call at acceptance and unchanged `document.body.innerHTML`) | assertion-red |
| 3.3 | A read reporting the same burn keeps the notice | `3.3` > `… across the committed target, a different body and none` | assertion-red |
| 3.4 | The projected clock passing the arrival does not end the notice | `3.4` > `The projected clock passing the arrival does not end the notice` (GIVEN `data-world-time` > 61000 asserted) | assertion-red |
| 3.5 | Cutting the drive ends the notice | `3.5` > `Cutting the drive ends the notice` | assertion-red |
| 3.6 | A stop ends the notice, above or at the speed floor | `3.6` > it.each: different burn 70000/90000; point park (2) | assertion-red |
| 3.7 | Arrival at a body ends the notice; Arrival at a point ends the notice | `3.7` > it.each (2) | assertion-red |
| 3.8 | A different order placed elsewhere ends the notice, toward the same target or another | `3.8` > it.each: 5000/80000 other target; 5000/61000 same target (2) | assertion-red |
| 3.8 (SDET-added) | boundary probe: same departure and target, arrival 70000 only | `3.8 SDET-added boundary probe` > `SDET-added: a read burning to the same target departing at 1000 but arriving at 70000 ends the notice` | assertion-red; it kills the "compare departure only" mutant that the spec's two rows leave alive |
| 3.9 | An order that settled inside the commit round trip never shows past the first read | `3.9` > (1) | assertion-red |
| 3.10 | A failed read never removes the notice | `3.10` > (1; four steps, fleets-error and retry asserted) | assertion-red |
| 3.11 | The notice follows the acting fleet and returns on the switch back; A response that lands after the acting fleet changed belongs to the fleet that committed | `3.11` > it.each (2) | assertion-red |
| 3.12 | Each fleet keeps its own notice | `3.12` > (1) | assertion-red |
| 3.13 | A later commit by the same fleet replaces the earlier notice | `3.13` > (1) | assertion-red (the "absent" legs follow an asserted-present GIVEN) |
| 3.14 | A second warned commit by the same fleet replaces the notice and raises its own warning | `3.14` > (1) | assertion-red |
| 3.15 | A rejected or failed commit shows no notice and leaves an earlier one alone | `3.15` > it.each: cap rejection; no mapped reason (2) | assertion-red (GIVEN: earlier notice present) |
| 3.16 | A response without the stranding field shows no notice | `3.16` > it.each: field absent; field false (2) | assertion-red at the control leg only (a warned second commit shows the notice); the unwarned half passes against today's code, which is why the control leg is in the same test |
| 3.17 | The notice is advisory and distinct from the preview's stranding line | `3.17` > (1; announcer text compared at three points) | assertion-red |
| 3.18 | The notice does not depend on the preview | `3.18` > no-quote; stale; not requested (3, each asserts its preview state first) | assertion-red |
| 3.19 | The notice's copy names stations and lane gates and carries no wire text | `3.19` > it.each: body order; point order with a different read `worldTime` (2) | assertion-red |
| 3.20 | A reload shows no notice and leaves the persistent indication to the roster | `3.20` > it.each: stranded true; stranded false (2; same QueryClient, `cleanup()` then a new view) | assertion-red (GIVEN: notice present before remount) |

## Every scenario in the delta (25) has a row above

Scenario-to-task map: 3.1 (2 scenarios), 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 (2), 3.8, 3.9, 3.10, 3.11 (2), 3.12, 3.13, 3.14, 3.15,
3.16, 3.17, 3.18, 3.19, 3.20 = 25 of 25. "The success feedback is not suppressed by the notice" and "The warning is conveyed once,
at the acceptance" are also covered at panel level by 1.5 (single toast, literal copy) and in the view by 3.1/3.14
(toast counts). `Playwright, deferred`: none of the scenarios is deferred for want of automation; the journey (task 6.3)
adds a browser pass but no scenario is left uncovered here. `reasoned-not-automated`: none.

## Mutation controls (scratch copy only, never the shared tree)

Mutants of the contract implementation and what killed them: gap never open (3.1 3.2 3.9 3.10 3.12 3.14 3.16 3.18);
notice ends when the projected clock passes arrival (3.4); compare arrival only (3.8 same-target row); compare departure
only (SDET probe); record never ends (3.5 3.6 3.7 3.8 3.9 3.10 3.14 3.17); unwarned commit does not delete the record
(3.13); one global record instead of per fleet (3.11 row 2, 3.12); callback on error (1.3, 3.15); warned on field-defined
(1.2, 3.16); notice with role=status or red class (1.4, 3.17); no warning toast (1.5, 3.5, 3.11-3.13, 1.3);
warning copy containing "strand" (1.5). Not killed, by contract: the `answered -> null` branch of the handler
(contract §2.2: unreachable in the harness, untested) and the hook-level supersession by the commit's invalidation
(guarded by 3.2's asserted new call and unchanged screen, contract §10 item 2).

## Notes for the developer

- The new view-level file never calls the query client for the own-fleets read; a developer who "fixes" a red by
  invalidating or refetching from the view will change call counts the tests assert.
- Future-dated departures (5000/80000 fixtures) draw fine under the real `buildSceneModel`; no clock advance was needed (contract risk 9 did not materialise).

## Post-handoff test revision (FULL-AUTO RULING 16, cause: adjudicated test defect, two THENs the requirement states and the tests omitted)

1. `SpaceCommandPanel.test.tsx`, new it.each `Scenario: The notice is advisory and distinct from the preview's stranding line — the notice does not change the burn control's disabled state` (2 arms: available, unavailable): Burn's `disabled` is identical without the notice, with it, and after removal. Shown able to fail: scratch mutant `disabled={… || commitStrandingNotice}` fails it (and 4 view tests that click Burn).
2. `SystemSpaceView.stranding-notice.test.tsx`, `3.7 arrival` body row: announcer is `''` before the landing read and exactly `Burn complete — arrived and attached to feat-body-1.` after it, with the notice removed. Shown able to fail: scratch mutant `setAnnouncement('')` fails the body row. (A mutant gating the announcement on the notice flag is equivalent, since the flag is already false in the landing render, and survives by construction.)

Both green against shipped code; tier 1 group 357 passed (26 files), tsc 0 errors, eslint clean. Manifest re-recorded.

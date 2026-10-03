# `fix-world-time-render-loop` — journey record (archive gate, 2026-10-03)

Gate run alongside `add-vitals-strip` (tasks 5.3, 5.3a, 5.4). Tree locked after the
journey-spec edits of step A; nothing edited the tree during the runs. One
execution each, no reruns, no retries, no timeout changed.

## Outcome: task 5.3 acceptance MET, 5.3a passes, 5.4's full run has 1 red attributable to filed `defect-spawn-system-single-body`.

## Run 1 — task 5.3, dedicated invocation

`bash scripts/dev/with-test-emulators.sh 'cd frontend && npx playwright test e2e/tests/vitals-strip-journey.spec.ts --repeat-each 20'`

- **21 passed (20 repeats + auth setup), 0 failed, 5.0m (305 s).** Every repeat passed the cross-system `waitForURL` (20 s, never raised).
- **Update-depth lines across all 20 repeats: 0.** `[journey-console] update-depth lines: 0` printed 20 times; `grep -ic "maximum update depth"` on the log = 0. The assertion is a hard one.
- No red at "burn must be under way" (`defect-station-order-500` did not occur in 20 repeats).
- Console capture per repeat held 4 entries: 3 x `Failed to load resource ... 404` and 1 x `... 500` (the 500 is the test's own forced `/v1/sightings` failure). The 404s are not update-depth lines; the URL was not captured by the log format. Observation only, not attributed.
- Load before/after: Run 1 3.21 -> 7.95 (rise is from the run itself; start waited for <3.5); Run 2 3.48 -> 8.39; Run 3 3.20 -> 3.76. No listeners on lane ports before any run. `backend/emulator.log` unchanged since Oct 1 (2 old SIGTERM lines, not from these runs); `frontend/playwright/.auth/backend.log`: 0 SIGTERM. No stack death in any run.

Acceptance (task 5.3 text): 20/20 past the cross-system `waitForURL`, zero update-depth lines: **MET.** This is the closing run's repeat count for this defect, not a new standing tier-4 default.

## Run 2 — tier 4, full suite (tasks 5.3a, 5.4)

`cd frontend && npm run e2e`, own invocation after Run 1 finished. **23 passed / 1 failed of 24, Playwright 4.8m (wall ~297 s).**

- Task 5.3a: `world-time-render-loop-journey.spec.ts` PASSED (drill-in and roster burn redirect both arrived within 20 s while the galaxy graph animated; zero update-depth lines). I read the spec against the two navigation scenarios in `galaxy-view/spec.md`: its THEN clauses (arrive at the system route within 20 s, destination view mounted) match the scenario text; no misreading found.
- The one red: `space-double-submit.spec.ts:267` *Scenario: Two activations in one tick submit one burn order*. First error verbatim: `Error: a generated system carries several ordinary bodies ... Expected: > 1  Received: 1` (at `:277`). Attribution: **filed defect `defect-spawn-system-single-body`** (identical assertion and message; random spawn home with one ordinary body). Not this change: no generator/spawn code in its diff.
- Task 5.4 observation only: `defect-wake-roster-row-flake` did **not** recur (every wake-based spec passed). `defect-spacestage-keyboard-camera-timeout-flake` is a vitest defect outside tier 4; tier 1 was green at 1694/1694 in step A (single execution).
- `defect-station-order-500` did not occur. No environment signature.

## Run 3 — tier 3

`npm run test:backend:all`: DONE 1875 tests, 1 skipped, 0 failed, 1003.3 s (wall ~1015 s). No `backend/system` fixture touched.

## Budget line

| Tier | Wall time |
|---|---|
| 4 (task 5.3 dedicated, 20 repeats of one spec) | 305 s |
| 4 (full suite) | ~297 s |
| 3 | ~1015 s |

## The six BLOCKED rows (QA's reverify file)

| Row | Closed by | Evidence |
|---|---|---|
| `add-vitals-strip` *Every cell is inside the viewport at 1280x720* | `vitals-strip-journey.spec.ts` step 4: `insideViewport` per cell, plus the SDET-added non-empty text assertion per cell (post-reload, all surfaces present) | Run 1: 20/20 pass; Run 2: pass. CLOSED. |
| `add-vitals-strip` *No other floating surface covers a strip cell* | step 4: overlap-false for 5 cells x 5 surfaces (incl. `floating-nav`), surfaces inside viewport, plus the SDET-added `activatableControls` hit-test (elementFromPoint at each interactive control's centre; floating-nav 2, preview-panel 1, sightings-unavailable 1 (Retry), space-camera-controls 4, space-fleet-panel 2 controls, every repeat) | Run 1: 20/20; Run 2: pass. CLOSED. |
| `fix-world-time-render-loop` #6 cross-system selection while animating arrives | vitals journey step 2b `waitForURL('**/systems/<home>', 20 s)` | Run 1: 20/20 past it; Run 2: pass. CLOSED. |
| #7 animating view raises no update-depth diagnostic | SDET-added hard assertion (`afterEach`, `/maximum update depth or nested update/i` over the console capture) in `vitals-strip-journey.spec.ts` | Run 1: `update-depth lines: 0` x 20; Run 2: 0 x 1; `grep -ic "maximum update depth"` = 0 in both logs. CLOSED, and it can now go red. |
| #17 galaxy drill-in arrives | `world-time-render-loop-journey.spec.ts` leg 1 `waitForURL` 20 s | Run 2: pass (once; this spec is not repeated). CLOSED on one execution. |
| #18 roster burn redirect arrives | same spec, leg 2 | Run 2: pass (once). CLOSED on one execution. |

## For the orchestrator (checkboxes are yours)

- 5.3: Run 1 supports it. 5.3a: Run 2 supports it. 5.4: run and recorded; its one red is a filed defect.
- `defect-cross-system-chevron-nav-stall` (5.5): 20/20 past the 20 s `waitForURL`, zero update-depth lines, on a warped stack (scale 5, lane 500 ms/unit).

# QA closure — covers both changes: `add-vitals-strip` AND `fix-world-time-render-loop` (archive gate, 2026-10-03)

QA (`openspec-qa`). Read-only: no suite run, no stack booted. Inputs: `add-vitals-strip-qa-reverify.md`
(the six BLOCKED rows), `fix-world-time-render-loop-journey.md`, the 2026-10-03 section of
`add-vitals-strip-journey.md`, both journey specs as run, `git diff` of `vitals-strip-journey.spec.ts`,
and the SDET's run logs still on disk in the session scratchpad (`.../scratchpad/run1.log`, `run2.log`).

## Counts confirmed from the logs
- run1.log (`vitals-strip-journey.spec.ts --repeat-each 20`): `21 passed (5.0m)`, no failures; `update-depth lines: 0` x20, no nonzero line; `grep -ic "maximum update depth"` = 0; `hit-tested` lines x20 each: floating-nav 2, preview-panel 1, sightings-unavailable 1, space-camera-controls 4, space-fleet-panel 2.
- run2.log (`npm run e2e`): `23 passed`, `1 failed`; `vitals-strip-journey.spec.ts:258` passed (13.8s), `world-time-render-loop-journey.spec.ts:153` passed (3.8s); `update-depth lines: 0` x1; `maximum update depth` = 0; same hit-test counts. The one red is `space-double-submit.spec.ts:267`.

## Per-row verdicts (independent)

| # | Row | Assertion that ran | Could it fail on wrong behaviour? | Verdict |
|---|---|---|---|---|
| 1 | add-vitals-strip, *Every cell is inside the viewport at 1280x720* (`system-console/spec.md:699-702`) | `vitals-strip-journey.spec.ts` step 4: `box()` (visible + bounding box) `:~519`, SDET-added non-empty `textContent` check `:525-526`, `insideViewport(cellBox,1280,720)` `:528-530`, for all five cell testids; viewport pinned by `test.use` `:75-77` | Yes: a cell outside the box, missing, or empty fails. Closes the "non-empty" gap I flagged. (Weakness: non-empty means any text, not a specific figure; per-cell content is asserted in steps 1-3.) | **PASS** — run1 20/20, run2 pass |
| 2 | add-vitals-strip, *No other floating surface covers a strip cell* (`:704-709`) | step 4: each of 5 surfaces inside viewport; overlap-false 5 cells x 5 surfaces incl. `floating-nav`; Retry visible/enabled; SDET-added `activatableControls` `:~504-510` using `elementFromPoint` at each control centre, `expect(blocked).toEqual([])` | Yes: a covered control is reported blocked and fails. Hit-tested counts are nonzero on all five surfaces every repeat (2/1/1/4/2), so it is not vacuous. | **PASS** — run1 20/20, run2 pass |
| 3 | fix-world-time #6, *A cross-system selection made while the view animates arrives* (`system-space-view/spec.md:116-121`) | vitals step 2b `waitForURL('**/systems/<home>', {timeout:20_000})` `:396`, then pathname and `space-view` visible; chosen from the fleet switcher (spec allows "switcher or the roster") | Yes: a stalled navigation times out at 20s (the original defect's signature). 20 s is the spec's own budget. | **PASS** — 20/20 + run2 |
| 4 | #7, *The animating view raises no update-depth diagnostic* (`:123-127`) | SDET-added hard assertion in `afterEach` (`/maximum update depth\|nested update/i` over the console/pageerror capture, `toEqual([])`); captures `console.error`/`warning` and `pageerror` | Yes: it is a real expect, runs even after an earlier step failed, and the pattern matches React's diagnostic. Logs show count 0 x21, grep 0. Residual: no explicit 5 s idle dwell on the space view; the test keeps `SystemSpaceView` mounted across steps 2b-4 (about 13-15 s per repeat) and a render loop raises the diagnostic within frames, so I do not treat the missing explicit idle as a gap. | **PASS** (minor residual noted) |
| 5 | #17, *A drill-in issued while the view animates arrives* (`galaxy-view/spec.md:60-64`) | `world-time-render-loop-journey.spec.ts:174-197`: `waitForURL(..., {timeout:20_000})` `:187`, pathname equal, `space-view` visible; "Enter system" clicked on an animating galaxy view | Yes. | **PASS** — run2, one execution (spec not repeated) |
| 6 | #18, *A roster burn redirect ... commits while the graph animates* (`:66-70`) | same file `:216-228`: `waitForURL('**/systems/<fleetSystemId>', 20_000)` `:222`, pathname, `space-view` visible; fresh galaxy mount first | Yes. Note it asserts the redirect/arrival only, which is what the scenario says (`handleBurn` toasts and redirects). | **PASS** — run2, one execution |

Single-execution caveat for #17/#18: they ran once on a warped stack (scale 5, lane 500 ms/unit). The same navigation path passed 20/20 via #6, and the galaxy drill-in carries no flakiness record, so I accept one green. Not a gap I would block on.

## Tier-4 red vs both changes
`space-double-submit.spec.ts:267` *Two activations in one tick submit one burn order* failed at the precondition `Expected: > 1  Received: 1` (several ordinary bodies in a random spawn home). `defect-spawn-system-single-body.md` records the identical assertion and message from run 3d. It fails before any burn is submitted, in a spawn/generator fixture. It touches no scenario of either change: this spec belongs to the live `system-space-view` double-submit rules, and neither change modifies generator, spawn, or burn-commit code (the production diff is `wallMsUntil`, timers, lane-pacing override, ports). The same file's other double-submit scenarios (mine, sell, refuel, jump) passed in the same run. Not attributable to either change.

## Matrix effect
Six BLOCKED rows -> 6 PASS, 0 FAIL, 0 BLOCKED. The earlier INSPECTED row (SystemSpaceView timers at scale != 1) stands as INSPECTED; the journeys ran at scale 5 and the burn/arrival navigation worked, which is corroboration, not a test of the timer call sites.

## Standing items (not blockers)
- Process: `fix-world-time-render-loop/tasks.md` 5.3/5.3a were flipped `[x]` before any run (`1424a77`); the gate runs now support them. The earlier false-claim finding is resolved by evidence, not by the commit.
- Spec gap (minor, unchanged): no scenario requires eta timers to convert world to wall time at scale != 1 (`wallMsUntil`); unspecced hunks U1-U10 remain as listed in the reverify file.
- `defect-spawn-system-single-body` remains open.

## Verdicts
- `add-vitals-strip`: **SHIP**
- `fix-world-time-render-loop`: **SHIP**

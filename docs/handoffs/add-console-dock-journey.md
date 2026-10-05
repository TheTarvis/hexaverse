# add-console-dock — journey record (archive gate, tier 4 run 1; tier 3 running)

Diagnosed by the SDET from files, logs, git and screenshots only. Nothing was run, no test or code was edited, no defect file was appended to (the appends are proposed below for the orchestrator). The gate decision is the orchestrator's.

## Tree and run

- HEAD `bcf7719` (build `e5e9eff`, authored at `b52d412`). Frontend only: `git diff b52d412 bcf7719 --stat -- backend` is empty. The non-e2e frontend diff is 12 files (`ConsoleDock.tsx`, `console-dock-layout.ts`, `floating-nav.tsx`, `SightingLog.tsx` 1 line, `SpaceStage.tsx` 6 lines, `SystemSpaceView.tsx` 94 lines, plus tests). It touches no quote, order, fleet-read or `SpaceCommandPanel` code.
- Tier 4, one run, log `docs/handoffs/add-console-dock-tier4-run1.log` (597 lines). Start 2026-10-05 01:57:13, end 02:06:01, **wall 528 s** (Playwright "36 passed (8.7m)", 3 failed). Load at start 3.65 6.43 9.58, at end 12.69 13.72 12.42. `Received SIGTERM` in the emulator log: 1 before, 1 after (no kill during the run). Fresh throwaway emulators ("no complete test emulator detected").
- Backend log of the run (overwritten by the next run; copied from `frontend/playwright/.auth/backend.log`, mtime 02:05) was read for the 409 and order evidence below.
- Artifacts: scratchpad `tier4-run1-results/` (error-context.md, screenshot, video per failure).

## Environment read

- Wall 528 s vs the last gates' 436 s (`add-burn-cost-overlay-journey.md`) and 410 s before that. This change adds one 7-test spec (about 28 s by its own budget lines: 5883 + 8819 + 3509 + 6717 + 282 + 2364 + 2 ms) and the suite grew from 32 to 39 tests, so about +30 s is the new spec; the remaining ~+60 s is load (end-of-run load 12.7, vs 16.0 just after at the last gate, so not unusual). Slowest tests: `slice.spec.ts:83` 1.2 m, `burn-geometry-refusals` 1.0 m (both pre-existing and green), `space-journey` 47.7 s (red, 20 s wait timed out), `space-double-submit` sale 28.0 s.
- No SIGTERM, no emulator restart. **No uniform ~22 s failure signature**: the three reds ran 13.8 s, 146 ms and 47.7 s, and each fails at a different assertion with a different cause (below). No timeout was raised.

## Leg table - `console-dock-journey.spec.ts` (log line of the `[journey-leg]` line)

| Leg | Test | Outcome | Log line |
|---|---|---|---|
| opens-collapsed (MUST) | 1 | PASSED (`--console-dock-height` = 3.5rem) | 249 |
| hidden-beats-flex (MUST) | 1 | PASSED | 251 |
| strip-row-56 (MUST) | 1 | PASSED (strip 56 px at y 664) | 253 |
| geometry-collapsed (MUST) | 1 | **FAILED** - space-camera-controls, 5 hit-tested, 1 blocked (see Red 1; test-side) | 264 |
| targets-24 (MUST) | 1 | PASSED ("Console" 64.4 x 28) | 266 |
| tab-walk-collapsed (MUST) | 2 | PASSED | 279 |
| expand-collapse-keyboard (MUST) | 2 | PASSED (13.75rem expanded; focus outlines 2 px solid) | 292 |
| reload-collapsed (MUST) | 3 | PASSED | 298 |
| log-panel-origin (MUST) | 3 | PASSED (3 rows) | 303 |
| scroll-leg (MUST) | 3 | PASSED (scrollHeight 232 / clientHeight 127, last row foot 8.5 px above the viewport foot) | 308 |
| geometry-expanded (MUST) | 4 | **FAILED** - same wrapper, same cause | 325 |
| tab-walk-expanded (MUST) | 4 | PASSED | 329 |
| report-link | 5 | UNTESTED - "no scan target served in range for the fresh fleet" | 334 |
| galaxy-nav-72 (MUST) | 6 | PASSED (nav foot 72 px on the galaxy route, `--console-dock-height` empty) | 343 |
| return-collapsed (MUST) | 6 | PASSED | 345 |
| other-system-collapsed | 6 | UNTESTED by design (J7: no player path to another system for a one-hull corporation without a jump) | 346 |
| (aggregate) | 7 | FAILED only because legs 4 and 11 failed (assertion at spec :932) | 16 / summary |

Every other PASSED is real: each is a `[journey-leg] X: PASSED` line preceded by its own `[journey-rect]`/`[journey-leg-data]` measurements (rectangles above, e.g. command column 576 -> foot 140 above the viewport collapsed and 400 high expanded with `scrollHeight` 443, so it scrolls instead of clipping; floating nav foot 72 collapsed and expanded-on-galaxy; Console control foot 64; dock 220 px expanded, region at y 556). The hit-test counts for the other surfaces are `space-command-column` 5/0 blocked and `sightings-unavailable` 1/0 blocked in both states, so the helper does catch blocks where they exist. Console noise per test is the forced `500 {"error":"forced by e2e (console-dock)"}` on `/v1/sightings` (by design, the spec forces it for the unavailable surface) plus the pre-existing wake-page 404s; update-depth lines 0 in every test.

### Is `report-link`'s cover real?

Yes, for two of its three scenarios; one scenario is tier 1 only.
- `scan-journey.spec.ts:42` ("commit a sweep ... a clean sweep (22.1s)") **PASSED** (log line 404). Its migrated leg (spec lines 123-140) asserts the dock is collapsed first, clicks `scan-report` "open the sighting log", then asserts `console-dock-collapse` visible (dock expanded), `console-tab-log` `aria-selected=true`, and `console-tab-log` focused. That covers "A settled sweep's report link expands a collapsed dock to the Log tab" and "The report's link to the log moves focus to the Log tab" at tier 4.
- "A settled sweep's report link does not collapse an expanded dock" has **no passing tier-4 cover** (the scan-journey leg only collapses the dock afterwards, line 163, it never uses the link on an expanded dock; the journey's leg 13 was UNTESTED). Its cover is tier 1 task 2.9 only. Not a defect, a stated limit; QA should keep that row at tier 1.
- The UNTESTED reason is the known random-spawn condition: `defect-scan-journey-spawn-in-gate-range.md` is the converse (a spawn that IS in range of a gate); here the fresh fleet had no target in range. Same family: the fixture draws a random spawn.

## Red 1 - `console-dock-journey` test 7: legs geometry-collapsed and geometry-expanded

**Attribution: THIS CHANGE - test-side (misreading in the hit-test helper). Not a product defect; not a pre-existing product condition. Confidence: high (about 90 %).**

Which control: the **`space-camera-controls` wrapper itself**, counted as the fifth "control". Evidence:
- `hitTestControls` (spec :186-258) counts the surface root as a control when it matches `CONTROL_SELECTOR`, which includes `[tabindex]:not([tabindex="-1"])` (:186-187). The wrapper is `<div data-testid="space-camera-controls" role="group" tabIndex={0} className="pointer-events-none absolute ... grid grid-cols-4 gap-1 ...">` (`SpaceStage.tsx` ~712-716). The cluster has exactly four element children (camera-orbit, zoom-in, zoom-out, recenter), so "5 control(s) hit-tested" is the 4 children plus the wrapper root. 5 tested, 1 blocked.
- The helper asserts `elementFromPoint(centre)` is the node or its descendant (:238-239). The wrapper is `pointer-events-none` by design (so the empty cells of the cluster do not eat canvas drags; the four children carry `pointer-events-auto`), so a hit-test on it can never return it. Its centre is also in a 4 px gap: the log rect is `x 1124 y 588 w 140 h 32` (collapsed; line 258) = 4 x 32 + 3 x 4, centre x 1194 lies between cell 2 (1160-1192) and cell 3 (1196-1228), so it hits the canvas or the column, never a child.
- Same result in both states (collapsed y 588, expanded y 424), because the cause is not geometry. The four real cells are reachable: `vitals-strip-journey` PASSED in the same run ("space-camera-controls: 4 interactive control(s) hit-tested", log ~line 478) with its own helper, and nothing else (Console control at y 628-656, 8 px under the cluster; strip at y 664) overlaps the cluster rectangle.
- **Pre-existing, not introduced:** at `b52d412` the same wrapper carried `pointer-events-none absolute bottom-[4.5rem] right-4 grid grid-cols-4 gap-1 ...` and `tabIndex={0}` (`git show b52d412:frontend/components/space/SpaceStage.tsx` line 716). This change swapped only the `bottom` class for `CONSOLE_DOCK_LANE_CAMERA`. The wrapper would fail this helper at any commit; the journey is the first thing to hit-test the wrapper as a "control".
- The failing message is truncated to "expect(received).toEqual(expected) // - Expected - 1 + Received + 3", and the log does not print the `blocked` array (the helper builds "name (covered by X at x,y)" strings but the leg logs only a count). So the control's identity is inferred from the structure, not read off a line. **What would raise confidence to certain:** print `blocked` in the leg-data line (or in the failure note); expect `space-camera-controls (covered by ... at 1194,604)`.
- The only screenshot/error-context is of the aggregate test 7 (taken after all legs; it shows the cluster and the Console control intact: camera group, orbit, zoom in, zoom out, recenter, select-pan-target-point, all present). Nothing covers or disables a cluster cell. The command column, "Console" control and strip do not intersect the cluster rectangle.

Smallest fix (test-side, for the revision round): in `hitTestControls`, do not count a surface root whose computed `pointer-events` is `none` as a control (e.g. `rootIsControl = matches(sel) && getComputedStyle(node).pointerEvents !== 'none'`), keep the `checked >= 1` guard (4 remain), and print `blocked` in the leg-data line. Do not give the wrapper `pointer-events-auto` (that would be a product regression: it would eat canvas drags).

## Red 2 - `committed-selection-journey.spec.ts:395` at :828, "commit 2 (arrives): the commit was not accepted: HTTP 409"

**Attribution: FILED-DEFECT CANDIDATE, unverified (the 409 body was not captured) - best fit `defect-post-dock-burn-cost-drift.md` (solved cost above the quoted cap -> 409 on `…/orders`), under a new trigger: a re-commit after a cut-drive, not after a dock. NOT THIS CHANGE (high confidence on that; about 85 %). Confidence in the specific mechanism: low (about 40 %) until the body is read.**

What is in the log and the backend log:
- Sequence (test 9, log lines 194-241; backend log 01:59:22-01:59:28), fleet `fleet_cb439941-...`: 15 targets quoted (200 each); commit 1 to `gate-sys_-1_-2` (flight 28201 world ms = 5640 wall ms) -> `POST …/orders 200` at 01:59:23; hold legs and another-target-and-back pass; **cut-drive** `POST …/cut-drive 200` at 01:59:27 (480 ms); the spec took the "cut taken on commit 1, commit 2 to the kept selection arrives" branch (spec :881-886); a fresh `POST …/orders/preview 200` at 01:59:27; the Burn click; `POST …/orders` **409 at 01:59:28 (27.8 ms)**; and a `POST …/orders/preview 200` immediately after at 01:59:28 (the specced re-quote on a cap-exceeded refusal, `SpaceCommandPanel`). The leg summary: keyboard-focus, committed-render-hold, one-order-no-preview, second-activation, another-target-and-back, cut-the-drive PASSED; arrive-and-dock NOT REACHED; zero-preview UNTESTED (flight 5640 ms, RULING 17).
- The 409 body is **not** in the log: the spec's `commitAgain` (:823-829) asserts `a.status < 300` before it reads the body, so the body is never printed; the e2e backend log holds no bodies; no trace was recorded. The browser console shows exactly one 409 resource error (so the 4xx mutation retry fix, RULING 40, is in effect: one click, one request).
- Not a geometry refusal: the two refusals in this run's backend log (01:57:36 `minimum-arc`, 01:57:58 `destination-inside-clearance`) each print `fleet: burn solve refusal served`; this 409 prints no such line. Not a docked fleet (the fleet was parked mid-flight after the cut) - this is where it differs from the filed record. Not a sale (`…/sell`), so not `defect-slice-sell-price-changed-409.md`. Not `defect-post-sale-departure-burn-409s.md` as originally framed (that file's own resolution says the real cause was the cap-exceeded body and the doubling was the since-fixed retry).
- Verbatim signature of the best-fit record (`defect-post-dock-burn-cost-drift.md`): `HTTP 409 {"error":"fleet: solved fuel cost exceeds the requested maxFuelTons cap","fuelCostTons":6.1296,"maxFuelTons":4.99488}` on `POST …/orders`, preview taken moments earlier, re-quote follows. The request, status, short quote-to-commit gap and immediate re-quote all fit; the body and the fleet state (docked there, parked mid-space here) do not match or are unknown. Per that file's own rule for the 2026-10-04 `space-journey` candidate, this is NOT counted as a match.
- Residue precedent: USER RULING 20 (`clear-burn-preview-on-commit-rulings-index.md`) did not locate a ruling by that number in the index (its rows 15 ff. cover other items); the residue rule that applies is `add-burn-cost-overlay-rulings.md` FULL-AUTO RULING 21 (a red is residue when it matches a filed record's signature, is not this change's, and its journey passed). Condition 1 (matching a filed signature) is **unmet** here, because the body is unverified, so the residue rule does not apply on the evidence on disk; it would on a captured `ErrQuotedCapExceeded` body. This is a ruling for the orchestrator or Travis, not for me.
- Could this change's diff cause or expose it? **No path found.** The diff (`git diff b52d412 bcf7719 -- frontend ':!frontend/e2e'`) touches layout classes (`CONSOLE_DOCK_LANE_*`), the dock shell, the Log tab mount (now only while expanded; nothing is polled by the dock), and the `logOpen` -> `dock` state. It does not touch `SpaceCommandPanel`, the preview/quote hooks, the order mutation, or any fleet read. The click was not mis-aimed: it produced an `…/orders` request that the server answered. A layout shift could change which control is hit, but then no order would have been sent or a different request would appear. Timing: the quote-to-commit gap (about 1 s) is set by the spec, not the dock. The 409 is a server-side state refusal.
- Passed at the last gate: **yes** - `add-burn-cost-overlay-tier4-run1.log` line 225 `✓ 9 committed-selection-journey.spec.ts:395`; its red there was `space-double-submit:267` (single-body spawn). The spec file is unchanged since `c3fcfcf` (not in `git diff b52d412 bcf7719 --stat -- frontend/e2e`). Flaky per draw, not regressed.

To raise confidence: capture the body. Test-side diagnostic (does not weaken any assertion): in `commitAgain`, read `a.body` (or `await response.text()` in the response listener at :241) before the status assertion and put it in the failure message; or run with a trace on this leg. Occurrence to append to `defect-post-dock-burn-cost-drift.md` (candidate section, same wording rule as the 2026-10-04 one): 2026-10-05, `add-console-dock` gate run 1, `committed-selection-journey.spec.ts:395` at :828; commit 2 after a cut-drive (fleet parked mid-flight, preview 200 one second earlier), `POST …/orders` 409 at 01:59:28 with no `burn solve refusal served` line, followed at once by a preview 200; body not captured.

## Red 3 - `space-journey.spec.ts:85` at :203, the roster row never read "under way"

**Attribution: UNFILED - matches no filed signature; a test-side fixture assumption on a random draw (a lode with an essentially zero-length flight to the station). NOT THIS CHANGE. Confidence: medium-high (about 75 %).**

Evidence:
- The order was sent and **accepted**: backend log, fleet `fleet_7f9603b9-...`, third burn commit `Action committed ... eta=119773550843 type=burn` then `POST …/orders status=200` at 02:05:09-10 (426 ms), after the first burn to the lode (02:04:52, 200) and the mine (02:04:57, 200). No 409, no refusal line. So **not** `defect-post-dock-burn-cost-drift.md`'s signature (a 409 body) and not its 2026-10-04 `space-journey:85` candidate (that one was a 409 at the gate burn, :244; this is a 200 at :203). Not `defect-slice-sell-price-changed-409.md` (a `…/sell` 409). Not `defect-spawn-system-single-body.md` or `defect-scan-journey-spawn-in-gate-range.md` (different assertions, but the same *family*: a fixture assumption about a random spawn).
- The burn happened and finished before the row ever changed: the row read `Docked 69.8 t fuel` for 5 samples then `Docked 67.1 t fuel` for 37 samples - fuel fell 2.7 t, i.e. a burn was paid for and the fleet is docked. The market board was read at 02:05:18 (the sell section exists). The final screenshot shows the command column with **"Committed at delta-v - arriving now - previewed 19 m/s arriving now"**, target `feat-station`: the quote itself said the flight was ~0. The window between commit and arrival was well under the poll window (an upper bound of about 2.4 s wall from the ETA arithmetic: eta2 550843 vs the first-burn eta 478971 plus 12 s of wall at scale 5), and the first post-order `GET /v1/fleets` landed after arrival.
- Mechanism: the mining lode (`feat-body-3`, chosen by `pickFarLode`, which only excludes the station feature id, not a lode near the station) was essentially co-located with the home station, so the burn to `feat-station` is a ~0-length flight. The spec's own leg-3 comment records the same hazard for the first burn ("can legitimately sit close enough to spawn that the burn settles before this leg's own 'must observe Under way' guard ever samples it"); the step-5 guard (:203) has no equivalent protection. This is a coincidence of the account-seeded random home system.
- Could the shorter column, the moved camera cluster or the Console control have intercepted or displaced the burn-button click or the station selection? No: the click returned a committed order (`…/orders 200` for the station burn, preview `arriving now` shown, fuel spent, docked). The screenshot (taken at failure) shows the Burn button and the column intact with the fleet docked at `feat-station`, the Console control at the foot, and nothing overlapping the column; the column footer (Refuel, "HOLD HERE") scrolls inside its 564 px box as designed (`scrollHeight` > `clientHeight`). Selecting `feat-station` is confirmed by `Target feat-station` in the screenshot. The video was not decoded.
- Passed at the last gate: **yes** (`add-burn-cost-overlay-tier4-run1.log` line 308, 33.3 s). The spec file is not in this change's e2e diff.

Smallest fix (test-side, for Travis's fixture policy, same family as the two filed spawn defects): at :203 either choose the mine lode far from the station (the picker should also exclude near-station lodes), or read the previewed arrival span/`preview-arrival` before the click and, when it is below one read interval, accept the docked-with-fuel-spent end state and log the leg UNTESTED instead of failing, keeping the guard for every flight long enough to observe. Do not weaken the guard for long flights. Proposed new defect file: `defect-space-journey-instant-station-burn.md` (same shape as the other spawn-draw files).

## Batched findings for the one revision round

| # | Label | Finding | Smallest action |
|---|---|---|---|
| 1 | test-side (this change's spec) | `console-dock-journey` hit-test counts the `pointer-events-none` `space-camera-controls` wrapper (tabindex 0) as a control; it can never be its own hit target. Fails legs geometry-collapsed and geometry-expanded, hence test 7. Product is fine; pre-existing since `b52d412`. | Skip a root whose computed `pointer-events` is `none`; keep `checked >= 1`; print the `blocked` list in the leg-data line. |
| 2 | test-side diagnostic | The failing helper's message does not name the blocked control. | Same edit as #1 (log `blocked`). |
| 3 | test-side (pre-existing spec, diagnostic only) | `committed-selection-journey` `commitAgain` asserts status before it reads the body, so the 409 body is never recorded. | Read the body before asserting, put it in the message (no assertion weakened). Needs Travis's ruling on whether the spec edit is in scope for this change. |
| 4 | filed-defect candidate (unverified) | `committed-selection-journey:395` 409 on commit 2 after a cut-drive; fits `defect-post-dock-burn-cost-drift.md`'s request/answer shape, body unknown. Not this change's. | Append the candidate occurrence above to that file; ask for the ruling (residue only if a body proves `ErrQuotedCapExceeded`). |
| 5 | unfiled test-side fixture (pre-existing spec) | `space-journey:203` guard "must observe Under way" on the station burn is unreachable when the lode sits at the station (quote "arriving now"). 200 accepted. Not this change's. | Travis's fixture policy; file `defect-space-journey-instant-station-burn.md`; the fix above. |
| 6 | cover limit, not a defect | `report-link` (UNTESTED at the journey) and `other-system-collapsed` (UNTESTED by design). `report-link`'s expand and focus scenarios are covered at tier 4 by the passed `scan-journey:42` leg; "does not collapse an expanded dock" is tier 1 task 2.9 only. | QA keeps that row at tier 1. |
| 7 | environment | 528 s vs 436 s: about +30 s the new spec, the rest load; no SIGTERM; no uniform timing signature. | None. |

Product findings from this run: **none** (no product defect of this change). Two reds are test-side, one filed-candidate, one unfiled fixture; all three tier-4 failures are outside the change's diff.

## Suite budget line

Tier 4: 528 s wall (36 passed, 3 failed, 39 tests; the last gates ran 436 s and 410 s). Tier 3: **1554 s wall** (02:09:56 -> 02:35:50, exit 0, load at start 3.33 8.39 10.40, at end 9.23 5.98 6.23, sigterm count 1 before and after; `DONE 1979 tests, 1 skipped in 1539.777s`; log `add-console-dock-tier3-run1.log`). Green.

## Revision round - 2026-10-05

One batched round; nothing was run (no Playwright, stack or emulator). `npx tsc --noEmit` and `eslint` on the two touched specs are clean; `playwright test --list` parses 39 tests in 20 files (unchanged count).

1. `frontend/e2e/tests/console-dock-journey.spec.ts`, `hitTestControls`: the surface root counts as a control only when it matches `CONTROL_SELECTOR` AND its computed `pointer-events` is not `none`. Weakens nothing: the `pointer-events-none` camera wrapper could never be its own hit target (a test misreading); its four children are still each hit-tested, `checked >= 1` per surface is untouched, and the `blocked` toEqual([]) assertions are untouched. A build that genuinely covers a camera button still fails: that button is a descendant, is hit-tested at its centre, `elementFromPoint` returns something else, and it lands in `blocked`. A build that made the wrapper `pointer-events-auto` is not caught by this change, and was not caught before either (it is a drag-eating regression for a product test, not this leg).
2. Same file, same helper: every blocked entry now carries the control's identity (testid, tag, accessible name/text, rectangle) and each leg logs `[journey-leg-data] geometry-<state>: BLOCKED <surface>: <entry>` per blocked control before the `expect`. Diagnostic only.
3. `frontend/e2e/tests/committed-selection-journey.spec.ts` (archived change's spec; diagnostic only): in the order `response` listener, a status >= 300 answer reads `res.text()`, logs `[journey-http] <status> POST <path> body=<text>`, and only then publishes the answer to `orderAnswers`, so the status assertion can never fire ahead of the log. Asserts, waits and order of actions unchanged; 2xx answers take the original path.
4. `docs/handoffs/defect-space-journey-instant-station-burn.md` written (OPEN, first occurrence). `space-journey.spec.ts` NOT edited.
5. `docs/handoffs/defect-post-dock-burn-cost-drift.md`: appended the 2026-10-05 UNVERIFIED candidate (no body); existing text untouched.

Not applied: finding 6 (cover limit) and 7 (environment) need no test edit; QA keeps "does not collapse an expanded dock" at tier 1. The residue ruling for red 2 remains the orchestrator's or Travis's. No production file, openspec file or manifest-listed file was touched.

## Gate rerun - tier 4 (2026-10-05)

Read from `add-console-dock-tier4-run2.log` (line numbers below are that log's), the preserved e2e backend log and `tier4-run2-results/`. Nothing was run; no code or test was edited.

### Run facts

- HEAD `75bac5a` (revision round: test code only). Start 02:42:14, end 02:50:43, **wall 509 s**, exit 1. Playwright: **38 passed, 1 failed** (8.3 m), 39 tests. Load at start 3.99 5.48 6.01, at end 8.57 11.14 9.48. Emulator-log `Received SIGTERM`: 1 before, 1 after (no kill during the run).
- The one red: `slice.spec.ts:83` (line 431, 1.3 m), at :199, `balance-value` stayed 1000 for 30 s after the sell click. It passed in run 1 (1.2 m). Diagnosis and ruling: RULING 23 (below).
- The shell noise at log lines 2-4 (nvm/.npmrc, `compdef`) is the profile, not the run.

### Leg table - `console-dock-journey.spec.ts`, run 2

All 14 must-PASS legs PASSED, both aggregate checks held (`[journey-summary]` block, lines 354-371; test 7 PASSED, line 375). Console capture: update-depth lines 0 in every test of the spec.

| Leg | Class | Result | Line | What the leg logged |
|---|---|---|---|---|
| opens-collapsed | MUST | PASSED | 240 | `--console-dock-height` = `3.5rem` |
| hidden-beats-flex | MUST | PASSED | 242 | `hasFlexClass` true, computed `display` none, `hidden` attribute true |
| strip-row-56 | MUST | PASSED | 244 | strip x 0 y 664 w 1280 **h 56**, foot 0 (collapsed) |
| geometry-collapsed | MUST | PASSED | 258 | hit-tested, 0 blocked: space-command-column 5, sightings-unavailable 1, space-camera-controls **4**, floating-nav 2, console-dock-open 1 (lines 252-256); nav foot 72 (251); column x 976 y 16 w 288 h 564, foot 140; camera cluster y 588 h 32, foot 100; card y 575 h 73, foot 72; Retry y 608.5 h 26.5, foot 85 (257) |
| targets-24 | MUST | PASSED | 260 | "Console" 64.4 x 28 |
| tab-walk-collapsed | MUST | PASSED | 273 | after the strip chevron, Tab -> `console-dock-open` (271); bounded 90-stop walk from the document start: camera group > orbit > zoom-in > zoom-out > recenter > select-pan-target-point > body/gate hit targets > fleet mark > offscreen chips > Retry > fleet-cmd-cut-drive > fleet-cmd-stop > fleet-roster-toggle > fleet-row > vitals-fleet-chevron > console-dock-open > nav-home > sign-out-button > (body) (272) |
| expand-collapse-keyboard | MUST | PASSED | 286 | dock x 0 y 500 **w 1280 h 220**, foot 0 (275); strip h 56 at y 500 expanded (276); region y 556 h 164 (277); `--console-dock-height` = `13.75rem` (280); focus outlines `solid` / 2 px on the Log tab (keyboard expansion), the collapse control (Tab) and the "Console" control (after a keyboard collapse) (274, 284, 285) |
| reload-collapsed | MUST | PASSED | 292 | (no figure) |
| log-panel-origin | MUST | PASSED | 297 | panel y 593 h 127 foot 0; Refresh y 601 h 21 foot 98; first row y 630 h 59.5 foot 30.5; 3 rows (293-296) |
| scroll-leg | MUST | PASSED | 302 | scrollHeight 232 / clientHeight 127, scrollTop 105; last row y 652 h 59.5, foot 8.5 above the viewport foot; dock still y 500 h 220 after the scroll (298-301) |
| geometry-expanded | MUST | PASSED | 326 | hit-tested, 0 blocked: command column 5, sightings-unavailable 1, camera cluster **4**, floating-nav 2 (316-319); column h 400, scrollHeight 443 (scrolls, not clipped), foot 304; card foot 236; cluster y 424 foot 264; nav y 391 foot 236; Retry foot 249; the five strip cells all inside the 1280 x 720 viewport (x 16 to 1264; feet 173 to 183.3, lines 321-325) |
| tab-walk-expanded | MUST | PASSED | 330 | walk from the document start stops at `space-camera-controls`; after the collapse control, Tab -> Refresh sighting log; panel focusables: Refresh > sighting-row x 3 (327-329) |
| report-link | - | **UNTESTED** | 335 | "no scan target served in range for the fresh fleet" (random spawn, as in run 1); cover below |
| galaxy-nav-72 | MUST | PASSED | 344 | root property `13.75rem` before leaving, empty `""` on the galaxy route; nav x 16 y 555 h 93, foot 72 (340-343) |
| return-collapsed | MUST | PASSED | 346 | (no figure) |
| other-system-collapsed | - | **UNTESTED** by design | 347 | no player path to another system for a one-hull corporation without a jump |

Tests 1-7 of the spec: 5.0, 3.7, 2.8, 5.0, 0.233, 1.9 and 0.005 s (lines 270, 290, 308, 334, 339, 353, 375); 18.6 s in all.

### Budget use against the 60 s per-test default (`playwright.config.ts:87`)

- The new spec: longest test 5.0 s, so at most 8.3 % of 60 s; the spec's seven tests total 18.6 s (run 1: about 28 s).
- Slower tests in the run, all pre-existing, none this change's: `slice` 78 s (1.3 m, red, 30 s poll then the failure), `burn-preview-journey` 72 s (1.2 m), `space-double-submit` sale 27.1 s, `committed-selection-journey` 32.4 s, `space-journey` 36.0 s, `scan-lane-transit-fizzle` 22.3 s, `scan-journey` clean sweep 22.1 s, `vitals-strip-journey` 21.0 s. The ones over 60 s declare their own budgets (`test.setTimeout` 1 800 000 in `slice` and `space-journey`, 900 000 in `burn-preview-journey`, `committed-selection-journey` and `space-double-submit`). No timeout was raised for this run.

### Scenarios the coverage table marked `Playwright, deferred`, and the rows QA held BLOCKED

Row numbers are `add-console-dock-red-coverage.md` / `add-console-dock-qa.md`.

| # | Scenario | Closed by (run 2) |
|---|---|---|
| 33 | Camera controls precede the hit targets, dock expanded | line 327 and leg line 330: the walk from the document start stops at `space-camera-controls` (a camera control before any body or gate target). The leg logs only the first stop, not the whole sequence. |
| 34 | Expanded dock 220 x 1280 | line 275 (w 1280 h 220), line 280 (`13.75rem`), leg line 286 |
| 35 | Strip row 56 collapsed and expanded | line 243-244 (h 56 collapsed) and line 276 (h 56 expanded), legs 244 and 286 |
| 36 | More rows do not change the dock height | lines 298 and 301 (dock h 220 after the scroll), leg 302; the precondition QA's J2 found unasserted is visible in the log: scrollHeight 232 > clientHeight 127 |
| 37 | Taller content scrolls within the panel | line 298 (scrollTop 105 of 232/127) and line 299 (last row foot 8.5), leg 302 |
| 38 | Refresh and first row in view at the origin | lines 293-295 (Refresh foot 98, first row foot 30.5, panel foot 0), leg 297 |
| 39 | Targets at least 24 x 24 | lines 259, 281-283 ("Console" 64.4 x 28, Log tab 35.9 x 24, collapse 24 x 24), leg lines 260 and 286. Two figures sit exactly on the 24 boundary (height 24; collapse 24 x 24). |
| 40 | Expanded: nothing covers or is covered | lines 309-326: four surfaces hit-tested, 0 blocked, plus Retry (320) and the five strip cells (321-325). The "Console" control is not on the page expanded, so QA's J1 hole (never hit-tested) is closed collapsed (line 256). |
| 41 | Collapsed: same | lines 245-258: five surfaces including the "Console" control hit-tested, 0 blocked; Retry (257) |
| 42 | Strip cells inside the viewport, unoverlapped | lines 313 and 321-325, leg 326 (the revision's wrapper fix also made the camera count 4, not 5) |
| 43 | Galaxy-route nav at 72 px | lines 340-343: nav foot 72 with the root property `""` after leaving from `13.75rem` (a leaked height would read 236); leg 344 |
| 24 | Visible focus indicator (QA: INSPECTED, class tokens only) | now observed in a real browser: computed outline `solid` 2 px on three controls, lines 274, 284, 285. Colour and contrast were not read, so this is "an outline exists", not "it is legible". |

Not closed at tier 4, as in run 1 (both legs UNTESTED, not failed):

- **`report-link`** (line 335). Covers that actually passed in run 2: `scan-journey.spec.ts:42` "commit a sweep ... a clean sweep" PASSED (line 405, 22.1 s). Its migrated leg collapses the dock first, clicks `scan-report` ("open the sighting log"), then asserts the dock expanded, the Log tab `aria-selected=true` and focused. That covers "A settled sweep's report link expands a collapsed dock to the Log tab" and "The report's link to the log moves focus to the Log tab". "A settled sweep's report link does not collapse an expanded dock" has **no passing tier-4 cover**; its cover is tier 1 task 2.9 only (same limit as run 1, QA keeps that row at tier 1). The log has no per-leg lines for `scan-journey`, so the assertions are known from the spec source and the PASSED line, not from logged figures.
- **`other-system-collapsed`** (line 347): no tier-4 cover exists. By design (J7): the dock's collapsed reset on a system change is covered by the view test `SystemSpaceView.console-dock.test.tsx` (tier 1) and by `return-collapsed`, which did PASS (line 346) for the client-navigation return to the same system.

### `[journey-console]` hard assertion

Held in every test of the run: every `[journey-console] update-depth lines:` line reads 0 (lines 63, 99, 118, 134, 173, 182, 232, 265, 288, 305, 332, 337, 350, 373, 476, 483, and the other specs' equivalents), and no test failed on it. Console noise is the forced `500 {"error":"forced by e2e (console-dock)"}` on `/v1/sightings?systemId=sys_-2_5` (lines 264, 268, 304, 306, 349, 351; the spec forces it by design), the pre-existing wake-page `/login?signUp=true` 404s, the `409` on `/systems/sys_2_3` in `burn-preview-journey` (line 172, the spec's own served refusal), and `vitals-strip-journey`'s 404/500 on `sys_1_-5`/`sys_1_-6` (lines 474-475, as in run 1).

### Specs that failed in run 1

- `committed-selection-journey.spec.ts:407` (was `:395`): **PASSED**, 32.4 s (line 233). The new `[journey-http]` body capture logged **nothing** for that test: no `[journey-http]` line sits between lines 194 and 233, because no commit was refused, so the 409 of run 1 did not recur and its body is still unknown. (The only `[journey-http]` lines in the run are the 404 `accounts/firestore` and `corporations/me` wake probes and the forced 500 sightings, lines 64-65, 266-268, 306, 351.)
- `space-journey.spec.ts:85`: **PASSED**, 36.0 s (line 459).

### Migrated specs

- `scan-journey.spec.ts`: all four tests PASSED: `:42` 22.1 s (line 405), `:298` 8.4 s (411), `:383` 10.9 s (415), `:408` 10.6 s (419).
- `scan-lane-transit-fizzle.spec.ts:103`: PASSED, 22.3 s (line 426).
- `vitals-strip-journey.spec.ts:263`: PASSED, 21.0 s (line 477); hit-tested fleet panel 2, preview panel 1, camera cluster 4, sightings card 1, nav 2 (lines 463-467), update-depth 0.
- `burn-cost-overlay-journey.spec.ts`: all four tests PASSED (lines 67, 101, 120, 136: 1.6 s, 2.1 s, 15.9 s, 2 ms). Its UNTESTED legs (`extent-past-fill`, `unaffordable-overlay-and-mark`) are its own, with tier 1 cover, as at its own gate.

### RULING 23 evidence check (`slice.spec.ts:83`)

Checked against the logs myself; all three claims hold, with two small precisions.

1. **Signature**: holds. Run-2 log: failing at :199, `Expected: > 1000, Received: 1000`, 30 s poll. Backend log (copy in the scratchpad): line 2247 `Sale rejected ... reason="market: price changed since your quote"` at 02:48:00, then line 2249 `409 ... POST "/v1/fleets/fleet_647271d0-.../sell"`; the only sell 409 in the log (the other sells, 02:49-02:50, are 200). `error-context.md` line 65 carries "The price changed while you were deciding. The offer has been updated." Precision: the 2.2-2.6 s `GET /v1/fleets?mine=true` and `GET /v1/systems/...` answers are at 02:47:00-02:47:21, 40-60 s before the 02:48:00 sale rather than "in the minute before" in the strict sense; they are the same slow-read signature, but there is no slow read in the seconds before the sale itself. Load 3.99 at start, 8.57 at end: as quoted.
2. **Empty relevant diff**: holds. `git diff b52d412 75bac5a --stat` over `backend`, `frontend/hooks`, `frontend/lib`, `FleetActionsPanel.tsx`, `slice.spec.ts` and `e2e/helpers` names only `lib/console-dock-layout.ts` and its test (new files) and `e2e/helpers/scan-fixtures.ts` (a comment: 8 lines, 5 insertions and 3 deletions, comment text only). Nothing on the sell path.
3. **None of this change's scenarios**: holds (a sell in the command column; the column's controls were hit-tested reachable in both dock states, lines 252 and 316).

Also true and checked: `slice.spec.ts:83` passed in run 1 on `bcf7719` (1.2 m).

### Anything that looks wrong though it passed

- Nothing in this change's spec. Observations only: (a) `tab-walk-expanded` logs only its first stop (`space-camera-controls`), so #33 is proven for the first stop and not for the whole order; the camera group is a tab stop before every hit target, which is what the scenario says. (b) The collapsed walk visits 90 stops and wraps through `(body)`, so it is long but bounded. (c) Two controls are measured at exactly 24 px (Log tab height, collapse control): a 1 px regression fails the leg, which is the intent. (d) `report-link` was UNTESTED in both runs: a random-spawn condition, so the tier-4 evidence for "does not collapse an expanded dock" still does not exist.
- Pre-existing and unchanged by this change: `slice` and `burn-preview-journey` take 72-78 s, `space-double-submit`'s sale 27 s; run-wide load rose from 4 to 8.6 by the end. No SIGTERM, no emulator restart.

### Verdict

All 14 must-PASS legs of `console-dock-journey.spec.ts` PASSED in run 2, with 0 update-depth lines; the two UNTESTED legs have their stated covers; the one red is residue under RULING 23, whose evidence holds. Task 5.2 is ticked.

## Suite budget line

Tier 4: run 1 528 s (36 passed, 3 failed), rerun 509 s (38 passed, 1 failed; last gates 436 s and 410 s). Tier 3: 1554 s (once, 1979 tests green).

STATUS: COMPLETE

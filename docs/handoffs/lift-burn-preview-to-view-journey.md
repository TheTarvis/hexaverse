# lift-burn-preview-to-view — journey record

SDET, archive gate, 2026-10-04. Tree at `f147db5` (impl `3802b92`), locked; the only addition is
`frontend/e2e/tests/burn-preview-journey.spec.ts` (untracked, not committed). One execution of each tier.

**Outcome: RED, one product-side finding in this change's own journey (F1) plus two reds attributed to filed defects.**
Because the journey's step-5 assertion failed, its later step-5 assertions did not execute (see F1).

**Scale note.** The e2e stack is warped (`WORLD_TIME_SCALE=5`, `LANE_MS_PER_DISTANCE=500`). The preview cadence is wall
time (`PREVIEW_REFRESH_MS` = 10 000 ms), so the warp does not move it; it shortens flights and mine runs. This journey
proves behaviour at scale 5 only.

## The journey (one test, one fresh corp, steps in order)

Capture carried forward: `[journey-console]` buffer with the hard update-depth `afterEach` assertion; timestamped
`orders/preview` request and response recorders. Assertions use `data-raw` / `data-unit` and testids, never copy.

| Step | Walk | Asserts | QA row closed |
| --- | --- | --- | --- |
| pre | wake, read interior, pick lode | station served; a mineable lode exists, else fails naming a FIXTURE PRECONDITION (defect-spawn-system-single-body) | - |
| 1 | select a lode on a fresh (unattached) spawn | all four figures carry `data-raw`; units world-ms-span-in / delta-v / tons / tons | row 1 |
| 2 | stay >= 25 s wall, before any burn | consecutive POST spacing >= 8 s (interval minus 2 s slack); >= 2 POSTs after the first; no more than one per interval (a double first POST = J3 finding) | rows 4, 5 |
| 3 | burn, then select the station mid-burn | row still under way at selection (else FIXTURE PRECONDITION); a new POST and a response; figures render | row 2 |
| 4 | dock; station still selected; then select own host (lode) | figures render for the other target; at the own host: figures gone, Burn enabled, zero POSTs and zero >= 500 responses over >= 22 s (J2 scope) | rows 14, 28 |
| 5 | select station (figures), mine 5 t; sample DOM atomically every ~50 ms until countdown hides | countdown visible; zero figures, Burn disabled, no `burn-uncapped-label` in every snapshot with the countdown; zero POSTs in the window; figures return within two intervals (J1: never asserts no-quote absent) | rows 7, 8, 29 |

No capped commit is made after a dock (defect-post-dock-burn-cost-drift); the journey's only burn is from the fresh spawn.

## Tier 4 — `cd frontend && npm run e2e`: 23 passed, 2 failed, 366 s (6.1 min)

Steps 1-4 of the journey passed (the run reached step 5). Update-depth lines: 0 (printed per test; no `Maximum update depth`).

| # | Red | Attribution |
| --- | --- | --- |
| 1 | `burn-preview-journey.spec.ts:361` step 5: "of 22 snapshots with the countdown showing, this many still rendered quote figures" — Expected 0, Received 1 | **PRODUCT (this change), needs triage — F1.** Not a filed defect. |
| 2 | `space-double-submit.spec.ts:267` (`:277`, "a generated system carries several ordinary bodies", Expected > 1, Received 1) | Filed `defect-spawn-system-single-body`; identical assertion and message to the last gate. Not this change's. |

### F1 — a quote figure is still rendered in one snapshot while the mine countdown shows

One of 22 atomic DOM snapshots (50 ms apart, whole-DOM read in one `evaluate`) had `mine-countdown` present and at
least one of `preview-arrival|deltav|fuel|fuel-ceiling` present. The contract (§4.3, QA row 8/29, spec: no figure while
a known mine runs) says none may render. The snapshot index was not logged, so the record cannot say whether it was the
first snapshot (the commit in which the mine read lands, with the figures discarded one effect later; Decision 13's
discard is an effect, so a one-commit overlap is a plausible mechanism) or a later one (a late-landing in-flight quote
response re-populating after the discard). I did not guess the mechanism. This is test-observed behaviour contradicting
the scenario, not a test misreading: the snapshot is atomic, so the two elements coexisted in a single DOM. Whether a
single-commit overlap is a spec violation or a tolerated lag is a spec/orchestrator call; if tolerated, the revision is
to ignore the first snapshot after the countdown first appears (test-side). To disambiguate in the revision round, log
the snapshot index and `figures` per snapshot.

Not executed because step 5's first expect threw (so unverified in this run, not passed): Burn disabled and
uncapped-label absent under the mine, zero preview POSTs during the mine, and figures returning within two intervals.
(Soft assertions were not used; it is one test.)

Console capture, this journey: only 404s on `/login?signUp=true` (existing signup noise); no pageerror, no update-depth.
Other specs' captured 404/500 on `/systems/sys_-8_-7`, `sys_-9_-7` belong to the existing vitals journey (cross-system
navigation to an ungenerated destination) and predate this change.

## Tier 3 — `npm run test:backend:all`: 1874 passed, 1 skipped, 1 failed, 1031.5 s test time (1042 s wall, 17.4 min)

| Red | Attribution |
| --- | --- |
| `TestSpawn_Scenario_StartingFuelReachabilitySample` (`fuel_spawn_starting_fuel_e2e_test.go:236`): "sample account #0: default order to home station rejected (status = 500)" | Filed `defect-station-order-500`: log line is exactly `fleet: solving burn: space: endpoint at or inside the star-clearance radius` on `POST /orders` -> bodyless 500. Intermittent (~2%); not this change (frontend-only). |

## Suite budget line

| Tier | Command | Wall | Verdict |
| --- | --- | --- | --- |
| 4 | `cd frontend && npm run e2e` | 366 s | 23 passed / 2 failed (1 this change F1, 1 filed defect) |
| 3 | `npm run test:backend:all` | 1042 s | 1874 passed / 1 skipped / 1 failed (filed defect) |

## Environment

- Load averages (1/5/15 min): tier 4 before 3.31 / 6.59 / 7.46; tier 4 after 10.38 / 10.55 / 9.17 (foreign load:
  Slack, Chrome, WindowServer; it rose after the run, the wall of 366 s matches the prior gate's ~297-305 s with margin);
  waited for the 1-minute load to fall under 4 before tier 3 (8.47 -> 3.88, ~2 min, bounded until-loop); tier 3 before
  3.88 / 8.24 / 8.43; after 2.29 / 3.46 / 5.04.
- SIGTERM check: zero `Received SIGTERM` in the tier-4 run output and in the tier-3 run output (both run through
  `with-test-emulators.sh` throwaway emulators; the only emulator stops are the wrapper's own teardown). Note
  `backend/emulator.log` is stale (Oct 1, ports 9106) and is not this run's log; the run's emulator output went to the
  captured logs. No uniform ~22 s failure signature; the failures are specific assertions.
- Ports 20230/20232/20241/20242/20244 free after both runs. Nothing was killed.
- `git status --short` shows `M harness/skills/spinup/SKILL.md` and `?? harness/skills/startup/`, which I did not
  touch (they appeared outside this task).

## Rerun (run 2) — SDET, 2026-10-04, after RULING 22's batched revision

**Outcome: GREEN. Tier 4: 25 passed, 0 failed, 388 s (6.3 min).** Tier 3 not rerun (RULING 23; frontend-only revision).
The journey passed whole, steps 1-5 including every step-5 leg run 1 never reached. Run once; no iteration.

### Premise check (RULING 22) — holds

- `FleetActionsPanel.tsx:105` reads `useRunningMine(fleetId)`; `:148-151` derives `mineEta = running ?? committedEta`
  and `mineRunning`; `:164-166` sets `committedEta` from the mine commit's response in `onSuccess`, i.e. before the
  invalidated running-mine read answers. `mine-countdown` renders from `:401` (`mineRunning && mineEta`). So the
  countdown can render before the view's read has answered.
- The view's own value: `SystemSpaceView.tsx:423` `runningMine = useRunningMine(...).data ?? null` (no committedEta),
  `:740` `mineRunning = !!runningMine && eta > worldTime`; `:743` `previewWanted = ... && !mineRunning && ...`;
  `:911` the same `mineRunning` drives the command panel (`SpaceCommandPanel.tsx:125,319` -> `burn-button` disabled).
  One value feeds both the flag and the Burn gate.
- Figures cannot coexist with a mine-disabled Burn: `hooks/use-burn-preview.ts:55,91` `enabled = ... commitWouldBeAccepted`
  and `preview = enabled ? (query.data ?? null) : null` — figures are null in the same render the flag drops, so a late
  response cannot repopulate while withheld (and `:84-89` clears the cache entry when disabled, so the resume starts empty).
  The only overlap is countdown (panel-local) vs. Burn-enabled/figures (view's value, not yet updated). Run 2 confirmed
  it empirically (below). No product finding.

### Revision (test only: `frontend/e2e/tests/burn-preview-journey.spec.ts`, step 5; steps 1-4 untouched)

Before: snapshots kept only when `mine-countdown` showed; asserted zero figures, zero Burn-enabled and zero
uncapped-label across all of them; POST window started at the countdown's first appearance.
After:
- Window keyed on the command surface: `withheld` = snapshots with countdown AND `burn-button` disabled. In EVERY one:
  zero figures (reports the offending snapshot indices) and zero `burn-uncapped-label`.
- Not vacuous: `firstWithheld` must exist (else FIXTURE PRECONDITION / PRODUCT failure) and be within 20 000 ms of the
  first countdown snapshot (the test's own expect timeout; the view's running-mine read is a single local GET issued on
  the commit's invalidation).
- Zero `orders/preview` POSTs from the first withheld snapshot to the mine's end (end trimmed 300 ms, as before).
- Every snapshot logged (`[journey-step5] #i +ms countdown burnDisabled figures uncappedLabel`) and attached as
  `step5-snapshots.json`; overlap (countdown with Burn still enabled, before the window opens) logged as an
  OBSERVATION, never asserted zero; "Burn enabled under the countdown" is no longer asserted.
- Kept: figures return within two intervals (+5 s); never asserts the no-quote state absent at the mine's end; time for
  figures to return is now logged.
`tsc --noEmit` and eslint on the file clean.

### Step-5 observations (run 2)

- 16 snapshots over ~1 s; #0 showed the countdown with Burn enabled and 4 figures (the lag), #1-#15 (15 snapshots) Burn
  disabled, 0 figures, 0 uncapped labels.
- Overlap: 1 snapshot, 109 ms (first countdown +0 ms, first mine-disabled snapshot +109 ms). This is also run 1's F1
  (1 snapshot of 22): the panel-local `committedEta` countdown ahead of the view's read; as ruled, not a spec violation.
- Preview POSTs in the withheld window: 0 (asserted).
- Figures returned 10 729 ms after the countdown hid (within two intervals).
- Update-depth lines: 0.

### Tier 4 reds

None. The run-1 `space-double-submit.spec.ts:267` (defect-spawn-system-single-body) did not recur this run (random spawn
draw; same-assertion residue per RULING 23 when it does).

### Environment (run 2)

- Load before: 4.04 / 4.19 / 5.12 on first look, waited on a bounded until-loop to 3.57 / 4.09 / 5.07 (below 4);
  after: 7.78 / 7.90 / 6.66 (foreign load).
- SIGTERM check: 0 `Received SIGTERM` in the run output; passing run, no failure signature to attribute.
- Ports 20230/20232/20241/20242/20244 free before and after. Nothing killed.

### Suite budget line (updated)

| Tier | Command | Wall | Verdict |
| --- | --- | --- | --- |
| 4 | `cd frontend && npm run e2e` | run 1 366 s; run 2 388 s | run 1: 23 passed / 2 failed; run 2: 25 passed |
| 3 | `npm run test:backend:all` | 1042 s (run once) | 1874 passed / 1 skipped / 1 failed (filed defect-station-order-500) |

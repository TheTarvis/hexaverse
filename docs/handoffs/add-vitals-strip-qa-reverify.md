# QA scoped re-verification — `add-vitals-strip` AND `fix-world-time-render-loop`, production diff `3dc56da..HEAD` (HEAD = `592df53`)

QA (`openspec-qa`), 2026-10-03, under FULL-AUTO RULING 53
(`add-vitals-strip-rulings.md` lines 1586-1612). Read-only; nothing fixed, no
stack booted, no tier 3/4. Scope is the production diff only, not either full
matrix. The prior matrices (`fix-world-time-render-loop-qa.md`; `add-vitals-strip`
verified at `b6e83a1`, matrix never persisted) are not re-run.

Commands run (all green):
```
cd frontend && npx vitest run lib/client-clock components/space/SystemSpaceView components/galaxy lib/format hooks/use-fleets   # 18 files / 346 tests passed
cd frontend && npx vitest run                                                                                                   # 124 files / 1694 tests passed (was 1690 at 3dc56da; +4 = the wallMsUntil tests)
cd backend  && go build ./... && go vet ./common/ ./config/ . ./fleet/                                                           # clean
cd backend  && go test -short ./...                                                                                              # every package ok, none failed
```

## 1. The production diff, derived

`git diff 3dc56da..HEAD` restricted to `frontend/ backend/ claude-agent/ scripts/ firebase*.json package.json`, tests/docs/tasks removed.
Commits touching it: `1424a77`, `ad74811` (gofmt), `2baf73b` (ports); `f179757` is comment-path renames only.

| Group | Files | Behaviour change? |
|---|---|---|
| A. `wallMsUntil` | `frontend/lib/client-clock/index.ts:86-110` (new export), `frontend/components/space/SystemSpaceView.tsx:50,187-192,556-562` | YES — two `setTimeout` delays now `(eta - clock.now())/scale` instead of `eta - clock.now()` |
| B. Lane pacing override | `backend/config/config.go:65-73,152` (new field + flag `LANE_MS_PER_DISTANCE`, default 0), `backend/common/tuning.go:140-157` (new `init()` applying it when > 0; imports `config`) | YES, but inert when unset (default 0 = untouched `DefaultTuning` 2_500) |
| C. Ports | `backend/router.go:44-55` (CORS origins), `backend/Makefile`, `backend/.env.example`, `backend/.env.test.example`, `backend/docker-compose.yml`, `firebase.json`, `firebase.test.json`, `.gitlab-ci.yml`, `package.json` (root), `frontend/package.json` (`dev`,`start`), `frontend/lib/firebase.ts`, `frontend/playwright.config.ts`, `frontend/e2e/config/{clusters,env}.ts`, `claude-agent/src/config.py`, `scripts/dev/{ensure,with}-test-emulators.sh`, `scripts/dev/admin/set-admin-claims.js`, `bootstrap/*` | YES — defaults/origins/dev-script wiring; no spec pins a port or origin (grepped `openspec/specs/**` and both change dirs: zero hits on any port number or CORS) |
| D. Test-stack warp | `frontend/e2e/setup/backend-stack.ts` (boots test backend `WORLD_TIME_SCALE=5`, `LANE_MS_PER_DISTANCE=500`) | Test infra, not shipped; but it CHANGES THE WORLD BOTH JOURNEYS RUN IN (scale 5, cheap lanes) |
| E. Dependencies | `backend/go.mod`, `go.sum` (grpc 1.82.1→1.83.1, firestore 1.18→1.21, api 0.247→0.264, …), `frontend/package.json` lock bumps (next/sharp/@tiptap/core) | Third-party behaviour only |
| F. No-behaviour | gofmt import reorders (`account/*`, `common/{firestore,secret_manager}.go`, `middlewares/firebase_jwt*.go`, `sse/handler.go`, `common/worldtime.go`, `config/config.go` alignment), comment-path edits (`fleet/handler.go`, `fleet/service.go`, `lib/format/figures.ts`, `next.config.ts`, `scripts/dev/admin/README.md`), `tuning.go` doc comment | NONE |

## 2. Affected scenarios and verdicts

### Group A — `wallMsUntil` + `SystemSpaceView.tsx`
Two call sites, both `setTimeout` for a served world instant: `ScanSweepWatcher` (`:192`) and the burn/jump/mine arrival refetch (`:556-562`). I grepped every `setTimeout`/`ETA_CUSHION_MS` in `components hooks lib`: no un-converted eta timer remains. Anchor: the clock is always anchored here (`clockScale ?? 1` feeds `useWorldClock`), so the helper's scale-1 fallback is never the live path in this view.

| Spec row | Verdict | Evidence |
|---|---|---|
| `fix-world-time-render-loop` / `system-space-view` ADDED *A counting figure advances without a per-frame render* (scale 1) | PASS | `SystemSpaceView.render-loop.test.tsx` 6/6 green on HEAD. Hunks touch only timer delays, not `useCoarseWorldTime`/`clock.now()` projection, so the figure path is unchanged. |
| same, *Frames pass without the view rendering* | PASS | same file; timers add no render |
| same, *A figure resyncs promptly when the tab regains visibility* | PASS | `lib/client-clock/index.test.tsx` 30/30 (26 prior + 4 new) |
| same, requirement text "projected at the served world-clock scale" (the ADDED requirement's scale paragraph is in `galaxy-view`; for the space view, the identical rule appears as `system-console`'s clock/pill requirements) | PASS (unaffected) | projection code (`createWorldClock`/`projectWorldTime`/`anchor`) is byte-identical since `3dc56da`; only the new `wallMsUntil` export was added. `wallMsUntil` unit tests: scale 1 → 4000; scale 5 → 800; past instant → 0; no reading → treats delta as wall ms. |
| `add-vitals-strip` / `system-console` *The Clock Cell Shows the Absolute World Instant at Its Served Scale* — *The stamp advances between reads*, *With no served scale, the stamp holds* | PASS (unaffected) | `VitalsStrip` and `client-clock` projection untouched; full vitest 1694/1694. |
| `add-vitals-strip` / `system-console` pill — *countdown advances between reads*, *pill's countdown and rate read absent until a scale is served* | PASS (unaffected) | same |
| LIVE `system-space-view` *Realtime Refetch Rules While the Space View Is Open* — *A running burn or jump self-schedules a refetch at its arrival*; *A running mine self-schedules a refetch at its ETA* | PASS at scale 1 (`SystemSpaceView.test.tsx` 52/52, `...scan-targets-refetch-on-arrival.test.tsx` 11/11, fixtures `scale: 1`, where the new arithmetic is identical). At scale ≠ 1: **INSPECTED** — the helper is unit-tested at scale 5, both call sites read as `wallMsUntil(clock, …)`, but no test drives either SystemSpaceView call site at a served scale ≠ 1. The hunk makes the live scenario ("shortly after that time") *true* at scale ≠ 1 where the old arithmetic fired late by the scale factor, so this is a strengthening, not drift. |
| LIVE *Own-Fleet Position, Burn Curve, and Arrival Ghost*; `ScanSweepWatcher` sweep settle | PASS | `SystemSpaceView.scan-targets-refetch-on-arrival` green |
| Rows #6, #7 (this change) | still BLOCKED-awaiting-journey (§4) | timers do not touch navigation or the update-depth diagnostic, but both rows are journey-only |

Observation (not a FAIL): there is no test that a `SystemSpaceView` timer fires at `eta/scale` (call-site coverage at scale ≠ 1). No scenario text demands it beyond "shortly after".

### Group B — `LANE_MS_PER_DISTANCE`
No live spec pins a lane/jump duration or the value 2_500 (grepped `openspec/specs/**` for tuning/lane-ms/MsPerDistance/duration-per-unit: only the "no minimum dwell duration is enforced" jump scenario, `fleet-movement/spec.md:690`, which is unaffected). Default 0 leaves `DefaultTuning` untouched, so prod/dev lane timing is unchanged. `tuning_test.go`, `fleet/params_test.go`, `fleet/roster_test.go`, `market` all green. Init order checked: `common` imports `config`, config's `init()` (flag parse) runs first, and pacing knobs are read at service construction, after `common.init`. Verdict: no affected row; no PASS/FAIL to record. One note: `init()` is global process state read from a CLI flag (not an env var — the stack passes it as env `LANE_MS_PER_DISTANCE`, which this codebase's flag layer is understood to read; I did not boot to confirm the env→flag path, and it is not exercised by any `-short` test; first proof is the journey run itself).

### Group C — ports
No spec row pins a port, origin, or script. Affected only operationally: CORS now allows `:20200`/`:20230` and drops `:3010/:3011/:3110`; `frontend/e2e/config/clusters.ts` now throws at import if `.ports.json` is missing (it is gitignored; present locally, dated Sep 19). Backend builds/tests green. No verdict rows.

### Group D — warped stack (journey environment, not shipped code)
Both journeys will now run at `WORLD_TIME_SCALE=5`. Consequences for the journeys, not FAILs: `vitals-strip-journey.spec.ts` step 3 polls `vitals-pill-eta` for a decrease and, if the pill leaves under-way before a 2nd read, returns `firstEta` (lines ~375-392), which would then time out at 60s rather than pass. At scale 5 a burn is 5x shorter; `pickFarGate` mitigates. Risk, low; not a spec defect.

### Group E/F — dependencies, gofmt
`go build`, `go vet`, `go test -short ./...`, full vitest all green. No behavioural claim to check. (grpc/firestore/api minor bumps — covered by the security re-audit, not QA.)

**Matrix delta for this re-verification: 0 FAIL.** Rows re-confirmed PASS (unaffected or unit-evidenced): see tables. Rows INSPECTED: 1 (SystemSpaceView timer call sites at scale ≠ 1). BLOCKED rows unchanged: 6 (§4).

## 3. Unspecced production hunks (reported, not reverted — RULING 53)

"Drift" = contradicts a live spec. None contradicts one. All "lack a change behind it" unless noted. Neither change's `tasks.md` nor proposal Impact names any of these; `1424a77` was committed outside the pipeline (its own message names them).

| # | file:line | behaviour added | Contradicts a live spec? |
|---|---|---|---|
| U1 | `frontend/lib/client-clock/index.ts:86-110` | new exported `wallMsUntil(clock, worldInstant)`: world-instant → wall-ms delay (`remaining/scale`, floored 0, scale-1 fallback). `proposal.md` Impact for fix-world-time lists `lib/client-clock/` as new but does not name this function or any timer fix | No. It makes live *Realtime Refetch Rules* true at scale ≠ 1. Lacks a change. |
| U2 | `frontend/components/space/SystemSpaceView.tsx:187-192` (scan-sweep watcher timer) and `:556-562` (arrival refetch timer) | delay now `wallMsUntil(...) + ETA_CUSHION_MS`; behaviour differs from before only at scale ≠ 1 | No. Lacks a change. |
| U3 | `backend/config/config.go:65-73,152` | new `ServiceConfig.LaneMsPerDistance` + `LANE_MS_PER_DISTANCE` flag (default 0) | No spec describes it. Lacks a change. |
| U4 | `backend/common/tuning.go:140-157` (+ import of `config`) | `init()` overwrites `activeTuning.LaneMsPerDistance` from that flag when > 0; also edits the doc comment to claim "every read that carries a worldTime carries the clock's scale" | No. Lacks a change. New `common`→`config` import direction (check `backend/CLAUDE.md` layering if that matters; I did not find a rule against it). |
| U5 | `backend/router.go:44-55` | local CORS allow-list: `:3010,:3011,:3110` → `:20200,:20230` | No spec pins CORS. Lacks a change. |
| U6 | `frontend/package.json` `dev`/`start` scripts | `dev` now sources `.ports.env`, runs `ports.py check --only frontend`, then `next dev --turbopack -p 20200 --port $PORT_FRONTEND` — **two port flags** (`-p 20200` hardcoded AND `--port $PORT_FRONTEND`); `playwright.config.ts` notes that the npm script "already passes its own --port" and that two `--port` flags conflict. Harmless only while `PORT_FRONTEND=20200` | No. Defect-adjacent, lacks a change. |
| U7 | `frontend/playwright.config.ts` | e2e frontend now started with `npx next dev --turbopack --port N` instead of `npm run dev -- --port N`; throws if `.ports.json` absent | No. Lacks a change. |
| U8 | `frontend/lib/firebase.ts` (default emulator ports 9109/8090 → 20211/20212), `claude-agent/src/config.py` (defaults 3010→20200, 9010→20201), `firebase.json`/`firebase.test.json`, `backend/.env*.example`, `backend/Makefile`, `backend/docker-compose.yml`, `.gitlab-ci.yml`, root `package.json` (`ports*` scripts; `dev:agent` sources `.ports.env`), `bootstrap/*`, `scripts/dev/*.sh` (now `exit 1` if `.ports.env` missing), `scripts/dev/admin/set-admin-claims.js` (emulator default 20211) | whole-repo port-lane move (`2baf73b`) | No. Lacks a change. |
| U9 | `frontend/e2e/setup/backend-stack.ts` (not shipped) | test backend booted warped: scale 5, lane 500 ms/unit, env-overridable (`E2E_WORLD_TIME_SCALE`, `E2E_LANE_MS_PER_DISTANCE`) | No. Lacks a change; changes journey conditions (see Group D). |
| U10 | `backend/go.mod`/`go.sum`, `frontend/package.json`+`package-lock.json` | dependency bumps (see E) | No. Lacks a change. |

No-behaviour edits (gofmt reorders, comment-path renames in `fleet/*.go`, `figures.ts`, `next.config.ts`, `common/worldtime.go` spacing, `config.go` struct alignment) are not unspecced behaviour and are omitted from the list.

### Process finding: false completion claims
`1424a77` flipped `fix-world-time-render-loop/tasks.md` **5.3 and 5.3a to `[x]`** (see its diff). Neither is true on the evidence:
- **5.3** requires a `--repeat-each 20` run of `vitals-strip-journey.spec.ts` with "20/20 past the cross-system `waitForURL`, zero `Maximum update depth` lines". `add-vitals-strip-journey.md` records six tier-4 executions, "no green run", and step 2's navigation failing at run 3d; there is no fix-world-time journey record, and `-journey.md` for this change does not exist.
- **5.3a** is satisfied only by *writing* `world-time-render-loop-journey.spec.ts`; it has never been run. The task text says "include ... in a tier-4 run".
Rows #6, #7, #17, #18 remain BLOCKED regardless. Recommend those two boxes be reset to `[ ]` (routing: orchestrator/dev; QA does not edit tasks.md).

## 4. BLOCKED-awaiting-journey rows (verbatim) and what closes each

### `add-vitals-strip` (verbatim, `add-vitals-strip-journey.md:246-255`)
> Both under `system-console`'s *The Strip Is Laptop-First and Never Overflows the View*, both `Playwright, deferred` in `add-vitals-strip-red-coverage.md`:
> | **Every cell is inside the viewport at 1280×720** | **BLOCKED.** Step 4 has still never been reached: runs 1 and 2 stalled at the chevron, 3a–3c never got past sign-up, and 3d stalled one leg later, in step 2's cross-system navigation. Zero evidence either way. |
> | **No other floating surface covers a strip cell** | **BLOCKED**, but materially closer. Run 1's `FloatingNav` collision and run 2's dev-overlay collision are now **both confirmed cleared** — 3d walked through both chevron opens without an interception. The geometric assertion that would actually close the row (now including `floating-nav` itself, RULING 46) sits in step 4 and has still never executed. |

Spec text (`openspec/changes/add-vitals-strip/specs/system-console/spec.md:699-709`): THEN "each of the five cells is rendered, non-empty, and inside the viewport bounds"; THEN "no cell of the strip is overlapped by any of them, and every such surface remains fully visible and activatable itself".

| Row | Closing step in `vitals-strip-journey.spec.ts` | Assertion that closes it | Clause-level gap |
|---|---|---|---|
| Every cell is inside the viewport at 1280×720 | Step 4 (after `page.reload()`), the `for (const cellId of cellTestIds)` loop, `:448-455`; viewport fixed at 1280×720 by `test.use` `:75-77` | `expect(insideViewport(cellBox,1280,720),'<cell> must be fully inside the 1280×720 viewport').toBe(true)` for `vitals-fleet-cell`, `vitals-fuel-cell`, `vitals-hold-cell`, `vitals-credits-cell`, `vitals-clock-cell`; "rendered" via `box()` (`:187-193`: `toBeVisible` + non-null bounding box) | **"non-empty" is not asserted at step 4** (no text/`data-raw` check on any cell in the post-reload state). Earlier steps assert individual cells' content in other states, not this one. Partial. |
| No other floating surface covers a strip cell | Step 4, `:436-440` (each surface inside viewport) and `:457-460` (`expect(overlaps(cellBox, surfaceBox)…).toBe(false)` for 5 cells × `space-fleet-panel`, `preview-panel`, `space-camera-controls`, `sightings-unavailable`, `floating-nav`); retry affordance `:408-410` | overlap-false per pair, plus `retryButton` `toBeVisible()`/`toBeEnabled()` | "activatable itself" is asserted only for the Retry button; the other four surfaces are checked only for fully-inside-viewport. Partial. Both rows are also unreachable unless steps 1-3 pass first (cross-system `waitForURL` at `:333-335`). |

### `fix-world-time-render-loop` (verbatim, `fix-world-time-render-loop-qa.md` rows #6, #7, #17, #18)
> | 6 | A cross-system selection made while the view animates arrives | **BLOCKED — awaits the journey** | Coverage table: `Playwright, deferred`. `SystemSpaceView.test.tsx` mocks `next/navigation`, so no unit test can exercise a real App Router transition (design.md Decision 5, explicit). tasks.md 5.3 (the dedicated `--repeat-each 20` closing run) is unchecked — not yet run. This is the change's central claim and has no unit-level evidence by design; only the tier-4 journey closes it. |
> | 7 | The animating view raises no update-depth diagnostic | **BLOCKED — awaits the journey** | `SystemSpaceView.render-loop.test.tsx :: "Scenario: The animating view raises no update-depth diagnostic"` (task 2.3) is present and passes, but the coverage table honestly records it `not-observed-red` (K8): … Design.md and the coverage table both name the tier-4 journey's `[journey-console]` grep as the real evidence, and that run (5.3) has not happened. |
> | 17 | A drill-in issued while the view animates arrives | **BLOCKED — awaits the journey, or an explicit accepted-gap ruling that hasn't been recorded yet** | Coverage table: `Playwright, deferred` for the real claim; the unit test in the same file (task 3.4a) is explicitly labeled by its own SDET comment as a **call-site regression guard only** … **tasks.md 5.3a is unchecked** … |
> | 18 | A roster burn redirect from the galaxy view commits while the graph animates | **BLOCKED — same as row 17** | Same file/task, same call-site-guard-only test, same open 5.3a. |

(The "5.3 / 5.3a unchecked" notes in the quoted evidence are stale: both were flipped to `[x]` by `1424a77` without a run — see Process finding.)

| Row | Closing journey step | Assertion / log line | Closable? |
|---|---|---|---|
| #6 cross-system selection while animating | `vitals-strip-journey.spec.ts` step 2, `:329-341` (open `vitals-fleet-chevron` menu, click `vitals-fleet-menu-item-<fleetId>`) | `page.waitForURL('**/systems/${homeSystemId}', {timeout: 20_000})` `:333-335`, then `expect(pathname).toBe(...)` `:337` and `space-view` visible `:338`. Under task 5.3 repeated `--repeat-each 20`. The scenario's "fleet switcher or the roster" is satisfied by the switcher alone. | YES, assertion exists |
| #7 no update-depth diagnostic, space view idle ≥ 5 s | `vitals-strip-journey.spec.ts` `afterEach` `:144-153` | **NO ASSERTION.** The capture is explicitly "Purely observational: no assertion here" (`:93-95`); a `Maximum update depth` entry would be printed as `[journey-console] console-error at <url>: …` and the test would still go green. The only `Maximum update depth` assertion in either spec is `world-time-render-loop-journey.spec.ts:235-243`, and it covers the **galaxy** view walk, not `SystemSpaceView`. There is also no deliberate ≥ 5 s idle on the space view (the walk happens to sit on it for far longer, step 3's 60 s poll). | **NO — FINDING TO ROUTE BEFORE THE RUN.** Closes only by a human/orchestrator grep of the run log for `[journey-console]` lines matching `/maximum update depth/i` (zero lines + the `0 … entries` summary line) across all 20 repeats. To make it a gate, the SDET should add the same `expect(journeyConsoleBuffer.filter(e => /maximum update depth/i.test(e.text))).toEqual([])` to `vitals-strip-journey.spec.ts` (this is SDET-owned; I am not editing it). |
| #17 galaxy drill-in arrives | `world-time-render-loop-journey.spec.ts` `test.step('Scenario: A drill-in issued while the view animates arrives')` `:174` | `page.waitForURL('**/systems/${homeSystemId}', {timeout: 20_000})` `:187`, then `pathname` equals `/systems/${homeSystemId}` `:193` and `space-view` visible `:194` | YES |
| #18 roster burn redirect arrives | same file, `test.step('Scenario: A roster burn redirect from the galaxy view commits while the graph animates')` `:216` | `page.waitForURL('**/systems/${fleetSystemId}', {timeout: 20_000})` `:222`, pathname `:226`, `space-view` visible `:227` | YES |

Note: the galaxy spec also asserts zero `Maximum update depth` (`:235-243`) — extra, not required by a galaxy-view scenario (the coverage table records no discrete galaxy scenario for it).

## 5. Spec gaps / other findings
- **SPEC GAP (minor):** no scenario in either change (or the live specs) requires scheduled timers to convert world time to wall time at a served scale ≠ 1. *Realtime Refetch Rules* says only "shortly after that time". The `wallMsUntil` fix is correct and consistent with it, but unspecified and untested at the call sites. Passage: `openspec/specs/system-space-view/spec.md:952-975`.
- **Process:** tasks.md 5.3 / 5.3a falsely `[x]` (above).
- **Tooling:** `.ports.json` / `.ports.env` are gitignored and now hard prerequisites for e2e, the backend Makefile, and emulator scripts. They exist in this tree. Any fresh checkout or CI job that runs e2e must `python3 harness/ports.py render` first.
- **Journey conditions changed:** the tier-4 run will be the first execution of both journeys on the warped stack (scale 5). First observation of the `LANE_MS_PER_DISTANCE` env→flag path is also in that run.

## Verdict

0 FAIL. Re-verified, still PASS or unaffected: every row in the diff's blast radius (vitest 1694/1694, go -short green). INSPECTED: 1 (SystemSpaceView timer call sites at scale ≠ 1). BLOCKED-awaiting-journey: 6 (add-vitals-strip: 2; fix-world-time-render-loop: #6, #7, #17, #18) — five of the six have a closing assertion in a journey spec; **row #7 has none** (observation-only console capture in `vitals-strip-journey.spec.ts`), and add-vitals-strip's two rows each have one unasserted THEN clause ("non-empty"; "activatable" for four of five surfaces).

**SPEC GAP** — passage 1: `fix-world-time-render-loop` `specs/system-space-view/spec.md` scenario *The animating view raises no update-depth diagnostic* ("THEN no update-depth or nested-update diagnostic is written to the browser console") has no assertion in `vitals-strip-journey.spec.ts` (`:93-95`, `:144-153`, observational only), the spec 5.3 names as its closer. Route to the SDET before the run (add the assertion) or have the orchestrator record that closure is by log grep. Passage 2 (minor, same routing): `add-vitals-strip` `specs/system-console/spec.md:699-709` "non-empty" / "activatable itself" lack step-4 assertions. No FAIL, so not RETURN TO DEV; the journey may proceed once row #7's closure path is decided.

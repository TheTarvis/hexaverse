# add-console-dock — integrity check, e2e migration and journey authoring (SDET, post-build)

Build under test: `e5e9eff`. Test code only; no production file touched, nothing committed, no stack or emulator booted, Playwright not run (only `npx playwright test --list`, which loads the specs and starts nothing).

## 1. Suite integrity (step 10)

- `bash harness/openspec-red-manifest.sh verify add-console-dock` (run before and again after all my edits): `add-console-dock: all 6 test file(s) unchanged since handoff`. No test in the manifest was weakened, skipped or deleted; no BLOCKER.
- Tier-1 frontend gate, `bash harness/check.sh --frontend --lint --test --keep-going`: tsc, eslint and vitest all pass, "All checks passed", exit 0. Vitest: **132 files, 1935 tests passed** (22.8 s). A later `npx tsc --noEmit` over the whole frontend (e2e included by the tsconfig `include`) is clean, 0 errors.
- Post-handoff test changes by me to manifest files: none.

### Judgement A: `guards.test.ts` line anchors

Acceptable as done; no re-anchor by the SDET. Evidence: `git show e5e9eff -- SpaceStage.tsx` adds one import line above the five `.toFixed(` sites and removes one comment line, so the net shift is 0; the guard's entry (`lines: [837, 838, 894, 895, 1055]`) still names the same reviewed sites, and the guard is green in the full run. The guard's own rule ("if a site drifts, the check fails until the entry is updated, which keeps every suppression a reviewable diff") is about drift of the sites; none occurred, so no suppression went unreviewed and nothing was weakened. Caveat for QA, not a defect: the anchor is brittle by design, so the next change that adds a line above line 837 in `SpaceStage.tsx` must re-anchor it.

### Judgement B: `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` "P1b"

Not attributable to this change on the evidence. The file passes alone (11/11, 416 ms). It mocks `useSightings` (`:102`), `SpaceStage` and every read, and never expands the dock, so the new code that runs in it is the collapsed `ConsoleDock` shell and one layout effect setting a CSS property; the log (the only new consumer of timing) is not mounted collapsed. P1b's waits are default `waitFor` (1000 ms) around a select-then-commit chain, and the full suite ran beside the 21 s `anti-mirror-guard` shell-outs. A load-sensitive 1 s `waitFor` is the likelier cause. I did not loop it. If it recurs on a quiet machine, the first suspect is that default timeout, not the dock.

## 2. Task 3.6 attribution

`npx vitest run components/space/SystemSpaceView components/space/SpaceStage`: **16 files, 289 tests, all passed.** Zero reds, so there was nothing to attribute and no edit. Ticked.

## 3. Migrated e2e specs (3.2-3.5), none run

| Task | File | Change | Kind |
| --- | --- | --- | --- |
| 3.2 | `frontend/e2e/tests/scan-journey.spec.ts` leg 5 (report link) | precondition added: `console-dock-open` visible and `sighting-log` count 0 before the link (the log is mounted only while shown); after the click the dock is asserted expanded (`console-dock-collapse` visible, `console-tab-log` `aria-selected`), the log asserted inside `console-panel-log`. Nothing expands the dock earlier in the test, so the link is the first show of the log in that document load and `:124-127` stays true as today | precondition + selector |
| 3.2 | same, close leg (was `sighting-log-open` toggle, `:150`) | `console-dock-collapse`; asserts the log is gone and `console-dock-open` is back; "view intact" assertions kept | selector + precondition |
| 3.2 | same, canvas-unavailable leg (was `sighting-log-open` visible, `:219`) | reload shows the collapsed dock: `console-dock-open` visible, `console-dock-region` and `console-tab-log` hidden | selector (the leg's meaning changed to the scenario "A reload shows the dock collapsed") |
| 3.2 | same, mount-path leg (was `:252`) | opens through `console-dock-open` written in the spec (no helper), asserts focus on `console-tab-log`, then row; adds a reload from the expanded state that must come back collapsed | selector + precondition |
| 3.2 | same, cross-highlight test (was `:293`) | the dock is collapsed (every mount); the ghost is clicked FIRST, before any row click, asserting ghost `data-highlighted` and the dock still collapsed; then expands via `console-dock-open` and reads the row's `data-highlighted`. The old row-then-ghost direction is dropped (after a ghost-first click a row click asserts nothing; it is held at tier 1) and a comment says so | precondition + selector; one direction removed, stated in the spec |
| 3.2 | `frontend/e2e/helpers/scan-fixtures.ts` | the stale "drawer open over `scan-control`" comment corrected (comment only) | comment |
| 3.3 | `frontend/e2e/tests/scan-lane-transit-fizzle.spec.ts` log leg | `console-dock-open` click before the unchanged assertions (fresh mount, collapsed) | selector |
| 3.4 | `frontend/e2e/tests/vitals-strip-journey.spec.ts` collision leg | re-read with the dock collapsed. The nav and card keep their 72 px foot (`calc(3.5rem + 1rem)`); the cluster moved to 100 px, the column's foot to 140 px. The leg measures the column's two panels, the cluster, the card and the nav by their own boxes, never the column's, and checks cells against them, so no assertion depends on a moved edge. Edited: the stale comment citing `bottom-[4.5rem]` and `floating-nav.tsx:33` only | comment only, no assertion |
| 3.5 | `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts` | `:479-495` is the paint-sampling geometry reader, not a collision leg, and holds nothing about the dock; the collision leg is `width-floor-1280x720` (now `:1022-1034`). Same re-read, same result; one comment added before `surfaceIds`, no assertion | comment only |

Residual risk I could not prove without running: the command column is 564 px tall at 1280x720 and scrolls; the two legs above measure panel boxes, which would only reach the strip or the viewport edge if the stacked panels exceeded about 648 px. The new journey measures the column itself and logs its `clientHeight`/`scrollHeight`.

Ticked 3.2-3.5.

## 4. The journey spec (task 5.2, authoring only)

`frontend/e2e/tests/console-dock-journey.spec.ts` (7 serial tests over one shared page, 16 legs). Not run; `playwright --list` parses it; tsc and eslint clean on it and on every other e2e file I edited. Carried: the hard `[journey-console]` update-depth `afterEach`, the dev-badge hide by `addInitScript`, the `[journey-http]` capture of every `/v1/` 4xx/5xx with its body, a `[journey-budget]` line per test, `[journey-rect]` lines printing every measured rectangle before it is asserted on, and a closing test that fails on any FAILED leg or any must-PASS leg not PASSED. No `test.setTimeout`. `beforeAll`: wake, `seedSightingFixture` x3 (distinct ids, home system), a `page.route` predicate (path ends `/v1/sightings` and `systemId` present) answering 500 (never the `**/v1/sightings**` glob), reload. Measurements use `boundingBox` and the page's own geometry; each control is hit-tested at its centre by `elementFromPoint` after `scrollIntoViewIfNeeded` (helper `hitTestControls`).

Where the fixture cannot arrange something it logs UNTESTED rather than failing: leg 13 (no served target, wall wait over 25 s, commit fails, report absent or carries no link) and leg 16.

### Leg list, scenarios, and the closing line (file `console-dock-journey.spec.ts`)

| Leg | Scenario(s) closed | Class | Closing assertion line |
| --- | --- | --- | --- |
| 1 `opens-collapsed` | The view opens with the dock collapsed (tier 4 half), A reload shows the dock collapsed | must-PASS | `:438-442` (strip and `console-dock-open` visible; region, tab, panel `not.toBeVisible`) |
| 2 `hidden-beats-flex` | design.md D-1: `[hidden]` hides a `flex` wrapper in the real stylesheet | must-PASS | `:456` (computed `display` is `none`) with `hasFlexClass` at `:454` (the `expect(state.display ...)` at `:456`) |
| 3 `strip-row-56` | The strip's row is 56 CSS px collapsed and expanded | must-PASS | collapsed `:461`; expanded `:551` |
| 4 `geometry-collapsed` | No floating surface is covered by or covers the collapsed dock | must-PASS | inside viewport `:480`; vs strip `:481`; pairwise `:485`; hit tests `:494`; the card's Retry `:505` |
| 5 `targets-24` | The dock's pointer targets are at least 24 CSS px square | must-PASS | `:511-512` ("Console" control); Log tab and collapse control recorded at leg 7 and folded in by the closing test (`:817-823`, failure message from `targets24ExpandedFailures`) |
| 6 `tab-walk-collapsed` | Each dock control is reachable by Tab (collapsed half); The dock's controls follow the strip's chevron in the tab order | must-PASS | chevron then Tab is `console-dock-open` `:528`; tab and collapse never walked `:531-532` |
| 7 `expand-collapse-keyboard` | Activating the Console control expands the dock; Activating the collapse control returns the dock to the strip alone; The expanded dock is 220 CSS pixels tall and full width; Expanding moves keyboard focus to the selected tab; Collapsing with the collapse control moves focus to the Console control; Enter and Space on both controls | must-PASS | height 220 `:547`, width `:548`, foot just after it; strip 56 `:551`; collapse focus `:567`; Space/Enter cycle `:564-577` |
| 8 `reload-collapsed` | A reload shows the dock collapsed (from an expanded dock) | must-PASS | `:588` |
| 9 `log-panel-origin` | The refresh control and the first row are in view without scrolling the panel; The expanded dock's Log panel holds the log | must-PASS | `:604-605` |
| 10 `scroll-leg` | Content taller than the panel area scrolls within it; Rows beyond what the panel area shows do not change the dock's height | must-PASS | last row in viewport `:620`, in panel `:621`; dock 220 `:623` |
| 11 `geometry-expanded` | No floating surface is covered by or covers the expanded dock; Every strip cell is inside the viewport with the dock expanded | must-PASS | surfaces `:648-650`, pairwise `:654`, hit tests `:658-659`, Retry `:670`, cells non-empty `:676`, inside viewport `:677`, and inside/overlap lines right after it |
| 12 `tab-walk-expanded` | The camera controls still precede the scene's hit targets with the dock expanded; Tab from the Log tab reaches the collapse control and then the panel's controls | must-PASS | camera before hit target `:687`; chevron to tab to collapse `:691-693`; refresh control `:697` |
| 13 `report-link` | A settled sweep's report link expands a collapsed dock to the Log tab; A settled sweep's report link does not collapse an expanded dock; The report's link to the log moves focus to the Log tab | asserted when reached, else UNTESTED | expanded `:747`, tab selected `:748`, focus `:749`, log shown right after; second click `:765`; whether the new record is listed is LOGGED at `:756` and asserted nowhere (B1) |
| 14 `galaxy-nav-72` | The floating navigation stays where it is on the galaxy route (the 72 px figure; the leaked-height check via client navigation from an expanded dock) | must-PASS | `:787` |
| 15 `return-collapsed` | Navigating to another system and back shows the dock collapsed (tier-4 evidence, RULING 22 route: roster row then `enter-system-button`) | must-PASS | `:801` |
| 16 `other-system-collapsed` | Navigating to another system and back (system-to-system) | UNTESTED, by design | `:805-` logs UNTESTED naming tier 1 task 2.1 as cover and leg 15 as nearest tier-4 evidence; no jump is made |

`Playwright, deferred` scenarios of the red coverage table, each to its line: line numbers moved after QA's batch (2026-10-05); the refreshed table is in section 7, and the "Closing assertion line" column above is superseded by it.

Rows QA will hold BLOCKED map to the same lines. Honest limits: #18-#19 and #30 (the report link) are asserted at tier 4 only when leg 13 is reachable; if it logs UNTESTED, their tier-1 cover is task 2.9 and the migrated `scan-journey` (3.2) leg 5 drives the link at tier 4. #5 (system-to-system) is UNTESTED at tier 4 by design. Ghost-first while collapsed (adversary r1 m5) is `scan-journey`'s second test, not this file, because the route predicate keeps the ghost layer failed here.

## 5. Production defects

None found. Observations only: (a) `guards.test.ts` anchor brittleness (Judgement A); (b) the command column's own box now overlaps the camera cluster's box vertically only if the cluster were taller than one row; it is one 32 px row, so no overlap is expected, and leg 4/11 measure it.

## 6. Counts

`tasks.md`: `grep -c '^- \[x\]'` = 31, `grep -c '^- \[ \]'` = 9 (5.1-5.9; 5.2 deliberately unticked).

## 7. QA return batch applied (SDET, 2026-10-05)

Test code only (`frontend/e2e/tests/console-dock-journey.spec.ts`, `scan-journey.spec.ts`, `vitals-strip-journey.spec.ts`). No production file, no manifest file, nothing under `openspec/`, nothing committed, no Playwright run, no stack booted. Checks: `npx tsc --noEmit` clean, `npx eslint e2e` clean, `npx playwright test --list` parses (39 tests in 20 files; the journey file still lists 7). Each fix below names how it fails for the wrong build.

| QA item | File and change | Fails for |
| --- | --- | --- |
| J1 | journey `hitTestControls` (`:190-250`): the surface root is itself hit-tested when it is a control (the lone "Console" button); leaf rule is `node.contains(hit)` (an ancestor no longer passes); more than `MAX_CONTROLS` (80) controls fails instead of truncating; zero-size/hidden controls are counted and logged (`ignored`); both geometry legs assert `checked >= 1` per surface (`:527`, `:726`); the card's Retry check is `el.contains(h)` (`:539`, `:737`) | a Console control covered by another surface, or with `pointer-events:none` (hit is an ancestor); a surface whose controls were all skipped |
| J2 | leg 10 (`:672-684`): asserts `scrollHeight > clientHeight`, `scrollTop > 0` after the scroll, and that no focusable follows the last row in the panel in DOM order | rows that fit (a trivially true containment); a footer under the last row |
| J3 | leg 7 (`:589-603`): `dock.y` within 1 px of `strip.y`; region, tab bar and panel at or below the strip's foot; tab bar and panel inside the dock | a dock whose top is not the strip's top; a tab bar overlapping the strip row |
| J4 | leg 12 (`:766-796`): after the collapse control, Tab through the panel's focusables (DOM order, computed in the page) and compare the full sequence to it, then one more Tab must leave the panel | a skipped, repeated or reordered log control; a trap in the panel |
| J5 | `measuredExpanded` flag (`:93`, set `:606` after the Log tab and collapse control are measured); the closing test fails `targets-24` when it is unset (`:916`), whatever leg 7's own status | leg 7 failing before the expanded measurements |
| J6 | leg 13 (`:862-868`): the second-look branch returns `{ untested }` (collapsed half asserted, expanded half named to tier 1 task 2.9) instead of logging; `scan-journey.spec.ts` leg 5 adds `console-tab-log` `toBeFocused` after the report link | a silent PASSED with the expanded half undriven; a link that expands without moving focus |
| J7 | leg 16 (`:902-908`): stays UNTESTED, per the ruling's bound. Reason: the only system-to-system player path is a roster fleet in another system (`SystemSpaceView.selectFleet`), and a one-hull corporation has none; no router internals are reached. Tier 1 task 2.1 (keyed remount) is the named cover; leg 15 is the nearest tier-4 evidence | not arrangeable as ruled |
| J8 | new `expectFocusOutline` (`:298`): computed `outline-style` not `none` and `outline-width >= 2` on the Log tab (keyboard expansion, `:580`), the collapse control (Tab-reached, `:612`) and the Console control (after a keyboard collapse, `:619`) | a build whose focus classes are tokens only and paint nothing |
| J9 | not in the batch (informational, harmless per QA) | n/a |
| M1 | `scan-journey.spec.ts` cross-highlight test: after the ghost-first half, reload (clears highlight, collapses), assert ghost not highlighted and row not highlighted, expand, click the row, assert the ghost's `data-highlighted` is `true` | a row click that never reaches the stage |
| M2 | `scan-journey.spec.ts`: `toHaveCount(0)` replaced by `toBeHidden()` for `sighting-log` in leg 5 (the pre-link precondition) and the mount-path reload | a log visible while collapsed; no longer breaks on content-stays-mounted |
| M3 | `vitals-strip-journey.spec.ts` `activatableControls`: each control is `scrollIntoView({block:'nearest'})`-ed and the surface and control rects re-read before the unchanged hit test (no assertion relaxed) | a control covered by another surface after scrolling; no longer a false "covered" for a clipped control |

### Refreshed closing lines in `console-dock-journey.spec.ts`

`Playwright, deferred` scenarios: #33 -> leg 12 `:754`; #34 -> leg 7 `:582-584` (height, width, foot) plus `:589` (top is the strip's); #35 -> leg 3 `:494` and leg 7 `:586`; #36 -> leg 10 `:689` with precondition `:672-673`; #37 -> leg 10 `:686-687` with `:672-684`; #38 -> leg 9 `:656-657`; #39 -> leg 5 `:545-546` plus leg 7 measurements to the `measuredExpanded` fold (`:606`, `:916-925`); #40 geometry half -> leg 11 `:697-737` (hit tests `:726-727`, Retry `:737`); #41 geometry half -> leg 4 `:497-539` (hit tests `:527-528`, which now include the Console control); #42 -> leg 11 cells `:743-745`; #43 geometry half -> leg 14 `:884`.

QA's BLOCKED rows #33-#43 map to the lines above. #24 (J8): leg 7 `:580`, `:612`, `:619` (each also asserts focus, `:579`, `:611`, `:618`). #5: leg 16 stays UNTESTED (J7); #18, #19, #30: leg 13 `:840-861` when reachable (focus `:843`, `:861`), else tier 1 task 2.9 plus `scan-journey` leg 5, which now asserts focus.

STATUS: COMPLETE

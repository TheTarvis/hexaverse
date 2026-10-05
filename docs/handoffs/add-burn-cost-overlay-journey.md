# add-burn-cost-overlay - journey record (archive gate)

**Status: PRE-RUN.** Written by the SDET before the gate. The spec was written against the build at `261dc7e` and has not been run: no stack, emulator, backend or Playwright process was started by the author. Stack-free checks only: `npx tsc --noEmit` clean, `npx eslint` on the spec clean, `npx playwright test --list` collects four tests in the spec.

Spec: `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts` (no helper, no other spec, no production file edited).

## Shape

Four ordered tests (`mode: 'serial'`) over ONE corporation provisioned in `test.beforeAll` (shared context and page). The 60 s per-test timeout in `frontend/playwright.config.ts` is not raised: unlike its predecessors the spec never calls `test.setTimeout`. Legs record their own PASSED / UNTESTED / FAILED instead of throwing, so one red leg does not skip the rest of a serial file; test 4 fails the run with every FAILED leg and every must-PASS leg that was not PASSED. The `[journey-console]` capture with the HARD update-depth assertion runs in `afterEach` (per test, over the entries since the previous test). Every 4xx/5xx `/v1/` response is captured with its body and printed as `[journey-http]`. The gauge and the panel's flag are read in one `page.evaluate` (`window.__readOverlay`, installed by an init script), so they are one quote.

Test lines (spec, after the QA second-pass fixes): 1 at 861, 2 at 966, 3 at 1125, 4 at 1285. A file-level skip (env not local) prints one `[journey-SKIPPED] *** THIS WHOLE FILE IS SKIPPED ...` line at collection, so a skipped run cannot read as green.

## Leg list

Wait budgets come from the last gate's records: home flights 19-22 s of world time = 3.8-4.4 s wall at scale 5, a gate flight about 5.4 s, a select-plus-quote round trip well under 1 s (`clear-burn-preview-on-commit-journey.md`), and a whole refusal-plus-two-flights journey in 17.4 s (`fix-burn-order-geometry-refusals-journey.md`). No leg waits a 10 s preview interval.

| Leg | Class | Asserted at (spec line) | Wait budget and source | A red looks like |
| --- | --- | --- | --- | --- |
| no-selection | **must-PASS** | 864 | gauge reads `filled`: poll 10 s (first frame after wake already awaited by `wakeNewCorp`) | `[journey-leg] no-selection: FAILED` with `snap#N sel= gauge=... costState=...`: a `costState` or band with an empty selection, or `gauge=no-data` |
| overlay-equals-panel-flag | **must-PASS** | 909 (panel invariants in `violations()`; wire invariants in `wireViolations()` at 263) | probe: per candidate select + quote poll 5 s, at most 6 features + 2 gates, stops at 32 s of the 60 s test | `FAILED` with `gauge state X != panel flag Y`, `gauge state X != WIRE affordable=...`, `band N% != WIRE cost`, `the panel's quote ... matches none of the wire answer(s)`, `capacity not readable` (G1, G4: the gauge is asserted against the recorded preview answer, and a null capacity is a violation, not a skip), `band N% != quoted cost`, `a current quote ... with no overlay`, or `FIXTURE: none of N tried target(s) produced a current quote` (a missed quote is logged per candidate as `MISSED QUOTE`, never swallowed) |
| clear-withdraws | **must-PASS** | 930 | re-pick the same on-screen target: selection empty 6 s; overlay gone poll 5 s | `FAILED`: `the overlay was not withdrawn after the selection was cleared`, or the fill lost. UNTESTED (not red) only if an off-screen affordance did not toggle |
| replace-selection | logged | 970 | one select + quote of Y: 6 s; 25 ms in-page sampler across it | `bad` list: `the previous target's extent (X%) was drawn while Y was selected`, or a same-quote violation in a sampled snapshot. UNTESTED when fewer than two targets quoted |
| width-floor-1280x720 | logged | 1013 | no wait beyond one quote (6 s) and element visibility (10 s each) | a cell outside 1280x720, a cell overlapped by a floating surface, or the band outside the rail / the rail outside the fuel cell |
| paint-light, paint-dark | logged, UNTESTED if the served extent is under 2 device px (10 t on a 200 t capacity at device scale 1) | 1097, 1098 (`assertPaint`) | per target select + quote 5 s + two geometry reads around one viewport screenshot (up to three attempts); at most 4 targets per scheme; stops at 52 s with a distinct `BUDGET EXHAUSTED` log line and note (G7) | `FAILED` with `fill rgb(..) and extent rgb(..) are the same sRGB value`. Contrast ratios are logged as `[journey-paint] ... contrast ... :1 (recorded, not gated)`. UNTESTED notes name an extent under 2 device px or a scheme emulation that did not take |
| extent-past-fill | UNTESTED unless arranged | `finalizeArrangements()` (711), called after test 2 and after round 2 | none; arranged by a probe quote whose extent runs more than 5 points past the fill, in round 1 or round 2 (G3: round 2 samples it too) | PASSED only if its pixels were sampled in BOTH schemes; FAILED if a paint assertion failed; otherwise UNTESTED naming `light=.. dark=..`. Expect UNTESTED |
| unaffordable-overlay-and-mark | UNTESTED unless the bounded probe arranges one (RULING 14) | DOM and wire asserted at 1104 (round 1, test 2) or in the round 2 arrangement block (about 1243-1266, test 3); verdict by `finalizeArrangements()` (711) | round 2: arrival wait up to 18 s (flight cap 15 s wall), re-quote at most 5 targets, stops at 46 s of the test | PASSED only if the DOM was asserted against the wire AND the mark's pixel was sampled in both schemes (G2); a DOM-only sighting is UNTESTED. Otherwise UNTESTED with tier 1 named as cover (tasks 2.1, 2.2, 1.4): expected, since starting fuel is 100 t and costs are small. A red would read `unaffordable overlay` expectation failures: missing mark, state != flag |
| commit-withdraws-at-acceptance | logged | 1132 | the costliest affordable probed target whose flight is at most 15 s wall; order answer 15 s; first own-fleets read 15 s; sampler snapshot after it 5 s | `broken` list of sampler snapshots in [acceptance + 100 ms, first read end + 250 ms] that drew an overlay or lost the fill. Snapshots inside 100 ms of the node-side acceptance are logged as an OBSERVATION (the browser sees the answer before node reports it) |

The closing assertion (test 4, line 1285 onward, MUST_PASS loop at 1294) names the three that MUST be PASSED: no selection draws no overlay with the gauge filled; a selected target draws an overlay whose state equals the panel's flag for the same quote; clearing the selection withdraws it.

Not covered by the journey, by ruling: the extent geometry on the rail (tier 1), the unaffordable overlay, its mark and the past-fill arrangement unless arranged (tier 1 tasks 1.1, 1.4, 2.1, 2.2), the mark's containment as pixels (held by review).

## Assumptions about the running UI that could not be verified without a stack

1. `data-selection` on `space-canvas-region` is `''` with no selection (read from `SpaceStage.tsx` `selectionAttr`).
2. Re-activating an on-screen selected body deselects it (`selectBody`'s comment cites `toggleSelection`); the clear leg uses an on-screen target when one quoted, and treats a non-toggling off-screen affordance as UNTESTED.
3. `vitals-fuel-tons`, `hold-capacity-total` and `preview-fuel` expose `data-raw` (on themselves or one nested element), and the gauge's capacity is the hold capacity (RULING 22).
4. `preview-stale` and `preview-no-quote` are the only withdrawal signals on the panel; the view draws no overlay in either.
5. `prefers-color-scheme` emulation switches the `dark:` classes (no `@custom-variant dark`, read from the tree, not run); the paint leg checks `matchMedia` and logs UNTESTED if it did not take.
6. A viewport screenshot is one image pixel per CSS pixel at device scale 1; the spec scales by `image width / innerWidth` regardless.
7. `browser.newContext()` in `beforeAll` is given the viewport, empty storage state and base URL explicitly, so it does not rely on `test.use` reaching it.
8. The spawned fleet is not attached to a body whose quote is withheld for all candidates; if every candidate is withheld the must-PASS leg reports a fixture miss rather than passing.

## Run results

(empty: filled by the orchestrator and a later SDET pass after the gate run)

### Tier 4

### Findings (each labelled test-side or product)

## Suite budget line

(empty: tier 3 and tier 4 wall times, filled after the gate)

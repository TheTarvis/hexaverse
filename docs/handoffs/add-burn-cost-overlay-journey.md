# add-burn-cost-overlay - journey record (archive gate)

**Status: RUN (tier 4 and tier 3, one run each, tree locked at `5a4c182`); the run results below were filled by the SDET from the tier-4 log without running anything.** Pre-run note, kept: written by the SDET before the gate. The spec was written against the build at `261dc7e` and has not been run: no stack, emulator, backend or Playwright process was started by the author. Stack-free checks only: `npx tsc --noEmit` clean, `npx eslint` on the spec clean, `npx playwright test --list` collects four tests in the spec.

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

Source: `add-burn-cost-overlay-tier4-run1.log` (375 lines), `add-burn-cost-overlay-tier3-run1-tail.log`. I ran nothing; every figure below is a log line.

### Tier 4

Started 22:11 on 2026-10-05, 436 s wall (Playwright: "31 passed (7.1m)" plus 1 failed). Load at start 3.62, 16.04 just after; `Received SIGTERM` count in `backend/emulator.log` 1 before and 1 after; tree clean; Roma and volt-preview emulators were running. Result: 31 passed, 1 failed.

All four of the spec's tests ran and passed, at the spec lines the pre-run record names (log lines 67, 105, 124, 140): test 1 at 861 (6.7 s), test 2 at 966 (2.9 s), test 3 at 1125 (9.8 s), test 4 at 1285 (1 ms). The log has **no `[journey-SKIPPED]` line** (grep count 0), so the file was not skipped.

**Per-test durations against the 60 s budget** (`[journey-budget]`): test 1 6742 ms, test 2 2876 ms, test 3 9753 ms, test 4 1 ms. The slowest leg used 16% of its budget; no leg was close to it. The probe's 32 s / 46 s / 52 s stop points were never approached (the whole file took about 19.4 s). Test 4 is a pure read of recorded outcomes, so its 1 ms is expected, not a skipped assertion: the `[journey-summary]` block (log 125-136) printed before it.

#### Leg table (as recorded)

| Leg | Class | Outcome | Log line | Served figures |
| --- | --- | --- | --- | --- |
| no-selection | must-PASS | **PASSED** | 45 | snap#1 `sel=` empty, `gauge=filled costState=null band=null fill=50 mark=false`, fuelAboard 100 t, capacity 200 t |
| overlay-equals-panel-flag | must-PASS | **PASSED** | 56 | probe round 1: 8 quoted of 8 tried (4 belt/rocky bodies feat-body-0..3, 2 belts, 2 lane gates); every `costState=affordable`, every `panelFlag=true` (flags line 55); costs and bands in the table below |
| clear-withdraws | must-PASS | **PASSED** | 59 | before: sel=feat-belt-0, affordable, band 15.4624, quotedCost 30.9248; after: `sel=` empty, `costState=null band=null`, fill still 50, mark false (log 57-58) |
| replace-selection | logged | **PASSED** | 73 | X=feat-belt-0 band 15.3616 %; Y=feat-belt-1 band 13.6592 %; 4 samples while Y selected, 2 distinct states: snap#14 (Y selected, no quote yet) `costState=null band=null`, snap#15 `affordable band=13.6592`; X's 15.3616 was never drawn with Y selected |
| width-floor-1280x720 | logged | **PASSED** | 76 | rail 40 x 6 px (left 473.84 to 513.84), band 6.09 x 2 px inside it (band left 473.84, top 691.5 inside rail top 689.5 / bottom 695.5), fuel cell 159.375 x 16.5 at (473.84, 684.25); selection feat-belt-0, band 15.256 |
| paint-light | logged | **PASSED** | 88 | 2 targets (gates); band device px 8.55 and 3.38 (both over the 2 px floor); dpr 1, scaleX 1; colours below |
| paint-dark | logged | **PASSED** | 99 | same 2 targets; band device px 3.38 and 8.55; colours below |
| extent-past-fill | UNTESTED unless arranged | **UNTESTED** | 100, 101, 119, 134 | `past-fill arranged=false` (log 77), `light=false dark=false`. Largest band over fill seen: none; the largest cost is 42.7472 t (21.37 % against a 50 % fill). Not tested at tier 4, and not claimed as passing. Cover is tier 1 tasks 1.1 and 2.1 (geometry) |
| unaffordable-overlay-and-mark | UNTESTED unless arranged | **UNTESTED** | 120, 135 | `unaffordable arranged=false`; all 13 quotes over the two rounds were affordable (round 1: 8 of 8; round 2: 5 of 5 with 57.2528 t aboard, costs 30.7 to 39.2 t). Not tested at tier 4. Cover is tier 1 tasks 2.1, 2.2 and 1.4 |
| commit-withdraws-at-acceptance | logged | **PASSED** | 111 | gate-sys_-4_-3, flight 26717 world ms = 5343 wall ms at scale 5; overlay present at -127 ms (snap#22, affordable band 21.3736), withdrawn at +102 ms (snap#23, `costState=null band=null`, fill still 50). OBSERVATION line 110 (2 snapshots within 100 ms of the node-side acceptance still showed the overlay; not asserted, by design). After arrival: fuelAboard 57.2528 t, fill 28.6264 % |

The closing test (test 4) ran its MUST_PASS loop over no-selection, overlay-equals-panel-flag and clear-withdraws: all PASSED, so it passed.

#### Served figures, round 1 (fuel aboard 100 t, capacity 200 t, fill 50 %; mark false throughout)

| Target | Quoted cost (t) | Band % | Cost / capacity (check) | Panel flag |
| --- | --- | --- | --- | --- |
| feat-belt-0 | 33.7072 | 16.8536 | 16.8536 | true |
| feat-belt-1 | 25.7616 | 12.8808 | 12.8808 | true |
| feat-body-0 | 31.8432 | 15.9216 | 15.9216 | true |
| feat-body-1 | 29.8624 | 14.9312 | 14.9312 | true |
| feat-body-2 | 32.6576 | 16.3288 | 16.3288 | true |
| feat-body-3 | 29.0688 | 14.5344 | 14.5344 | true |
| gate-sys_-1_-2 | 16.9392 | 8.4696 | 8.4696 | true |
| gate-sys_-4_-3 | 42.7472 | 21.3736 | 21.3736 | true |

Round 2 (after the burn to gate-sys_-4_-3, fuel 57.2528 t, fill 28.6264 %): feat-belt-0 31.5728 (band 15.7864), feat-belt-1 39.2112 (19.6056), feat-body-0 30.7264 (15.3632), feat-body-1 31.664 (15.832), feat-body-2 35.4432 (17.7216); all cost/capacity, all affordable, all `panelFlag=true`. The band always equals cost over capacity, and the fill always equals fuel over capacity (100/200 = 50; 57.2528/200 = 28.6264). Fuel aboard after the burn is exactly 100 minus the quoted 42.7472 = 57.2528, so the quote the overlay drew was the cost the burn charged. Quotes for the same target move between probes (feat-belt-0 reads 33.71, 30.92, 30.72, 30.51 and 31.57 in five snapshots) because the hull and body move in world time; each snapshot is internally consistent, which is what the leg asserts.

Wire flags: the log prints only the gauge state and the panel flag (all `affordable` / `true`). The wire comparisons (`wireViolations()`: gauge state against the wire `affordable`, band against wire cost) print nothing when they hold; the leg's PASSED means they raised no violation, and the log does not show the wire values themselves. Stated, not inferred beyond that.

#### Contrast ratios (RULING 16: recorded, not gated)

| Scheme | fill rgb | extent rgb | rail rgb | fill vs extent | fill vs rail | extent vs rail |
| --- | --- | --- | --- | --- | --- | --- |
| light (both targets, identical) | 159,159,169 | 82,82,92 | 212,212,216 | **2.94:1** | **1.77:1** | 5.22:1 |
| dark (both targets, identical) | 212,212,216 | 113,113,123 | 83,83,89 | 3.27:1 | 5.17:1 | **1.58:1** |

**Pairs under 3:1, flagged plainly:** light fill vs extent 2.94:1; light fill vs rail 1.77:1; dark extent vs rail 1.58:1. Not gated, not failures. The pair the overlay is for (extent against the fill it overlaps) is 2.94:1 in light, just under 3:1, and 3.27:1 in dark. In dark, the extent is nearly the rail's colour (1.58:1), so it is distinguishable from the fill but not from the empty rail. Fill and extent are distinct sRGB values in every sample, which is what the paint assertion gates. Ratios are identical across the two targets in each scheme, as expected for flat fills.

#### Console, HTTP and update-depth

- `[journey-console] update-depth lines: 0` after each of the four tests (log 63, 103, 122, 138). Hard assertion held.
- Console entries: test 1 had 2 (both `http://localhost:20230/login?signUp=true` "Failed to load resource ... 404"); tests 2, 3 and 4 had 0. Those two are the pre-spawn sign-up flow, matching the same two entries in other specs in this run; no page error and no warning.
- `[journey-http]` 4xx/5xx bodies, complete list (the log has two lines, both in test 1's wake): `404 GET /v1/accounts/firestore body=` (empty) and `404 GET /v1/corporations/me body=` (empty). Both are the not-yet-spawned corporation lookups before `wakeNewCorp`. No 4xx or 5xx occurred during any leg: no `/v1/` error on a quote, an order, or an own-fleets read.

### The one red

`space-double-submit.spec.ts:267` "Scenario: Two activations in one tick submit one burn order" (log 286, failure detail 335-358): `a generated system carries several ordinary bodies`, expected greater than 1, received 1. This is the residue of `defect-spawn-system-single-body.md`, ruled FULL-AUTO RULING 21 (`add-burn-cost-overlay-rulings-index.md` line 31): it does not hold the gate and is not this change's. It is a pre-existing spec reading a spawn system that generated one ordinary body; it never reached an overlay. It belongs to the defect record, not to a finding below.

Other-spec lines in the log (not this change, listed so they are not mistaken for gaps): a `409` on `/systems/sys_-6_-3` in `burn-geometry-refusals-journey` (an expected refusal), and a `404` on `/systems/sys_2_13` and a `500` on `/systems/sys_2_12` in `vitals-strip-journey` (log 324). The 500 is a console resource error in a different spec; the vitals journey passed. I did not diagnose it from the log alone; it is recorded as unexamined, not as accepted.

### Tier 3

Started 22:23 after tier 4 exited and the load fell to 3.89 (waited 250 s from about 18); 966 s wall, gotestsum "DONE 1979 tests, 1 skipped in 955.107s", 0 failed. The one skip is `space TestTurnTable_RecordOrRegenerate` (`turn_table_record_test.go:114`, needs `UPDATE_FIXTURES=1`, a fixture-regeneration test, not a scenario test). SIGTERM count 1 before and after; load 9.42 at the end. Green.

### Findings (each labelled test-side or product)

1. **No test-side misreading and no product defect found in the overlay.** No PASSED is contradicted by the log: every must-PASS leg printed its snapshots; the probe ran on 8 of 8 targets in round 1 and 5 of 5 in round 2 (none on zero targets); band percent equals cost over capacity and fill equals fuel over capacity for every printed snapshot; the spent fuel equals the quoted cost.
2. **Coverage limit (test-side, by design, not a defect): two legs are UNTESTED at tier 4.** `extent-past-fill` and `unaffordable-overlay-and-mark` were not arranged: a fresh hull starts with 100 t of fuel and the largest quote was 42.7 t (round 2: 39.2 t of 57.3 t). The past-fill extent, the unaffordable overlay and the mark's pixel were never drawn in a browser. Cover is tier 1 only: tasks 1.1 and 2.1 (extent geometry), 2.1, 2.2 and 1.4 (unaffordable overlay and mark). Stated as untested, not passing. The mark's containment as pixels remains held by review, per the pre-run record.
3. **Contrast (product design observation, not gated):** three pairs read under 3:1 (table above), the overlay-relevant one being light fill vs extent at 2.94:1. For the design owner; RULING 16 does not gate it.
4. **Paint probe breadth (test-side, informational):** the paint legs sampled 2 targets per scheme (both gates), under the 4-target cap, since the gate targets were chosen first and gave extents of 8.55 and 3.38 device px; no `BUDGET EXHAUSTED` line. Small extents only (3.38 px is above the 2 px floor); extents under 2 px would have gone UNTESTED, and none occurred.
5. **Commit observation (informational):** 2 snapshots within 100 ms of the node-side acceptance still showed the overlay (log 110), and the spec does not assert that window by design. The withdrawal showed by +102 ms. Not a finding against the spec as written.
6. **Test 4 ran in 1 ms** because it only reads recorded outcomes; the summary block preceded it. Not a skipped assertion.
7. **Unexamined, other spec:** the `500` on `/systems/sys_2_12` in `vitals-strip-journey` (log 324). Outside this change's scope; the spec passed; flagged for the orchestrator to route or dismiss.

## Suite budget line

Tier 4: 436 s wall (31 passed, 1 failed ruled residue), against the previous gate's 410 s (28 tests) in `fix-burn-order-geometry-refusals-journey.md`: +26 s, the four new tests accounting for about 19 s; load at start was 3.62 against 2.55. Tier 3: 966 s wall (1979 tests, 1 skipped, 0 failed), against the previous gate's 1026 s (1979 tests): -60 s, same test count. Both far inside their budgets (tier 3 budget 90 m); neither run was extended and no timeout was raised.

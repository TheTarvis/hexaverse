# add-burn-cost-overlay — QA verdict

QA, 2026-10-04. Build under test: commit `261dc7e` (tree clean). Tier 1 only, per `docs/testing-tiers.md`; no stack, emulator, Playwright, backend or frontend was started. Read-only on code and tests.

Spec: `openspec/changes/add-burn-cost-overlay/specs/system-console/spec.md` (40 scenarios). Plan: that spec, not tasks.md. Evidence map: `docs/handoffs/add-burn-cost-overlay-red-coverage.md`; integrity: `docs/handoffs/add-burn-cost-overlay-integrity.md`.

## Run (tier 1, stack-free)

```
cd frontend && npx vitest run components/space/Gauge.test.tsx components/space/VitalsStrip.test.tsx \
  components/space/SystemSpaceView.burn-preview.test.tsx components/space/SystemSpaceView.stranding-notice.test.tsx \
  hooks/use-burn-preview.call-site.test.ts
=> Test Files 5 passed (5); Tests 199 passed (199)
```

(196 in the four files, plus 3 in the unedited call-site test that holds row 40's static half.) Every test name cited below was observed passing in the verbose run. I read each asserting test body, not just its title.

## Summary

Scenario level: **39 PASS / 0 FAIL / 1 BLOCKED (row 20) / 0 INSPECTED-only**. Residuals inside PASS rows: row 9's rendered-containment sub-clause is BLOCKED (B2); row 4's strip-wide "no red or blue" sub-clause is INSPECTED (O1); row 8's rendered-paint comparison closes with row 20 (B3).

## Acceptance matrix

Tests: G = `Gauge.test.tsx`, V = `VitalsStrip.test.tsx`, BP = `SystemSpaceView.burn-preview.test.tsx` (describe "burn cost overlay", sections 3.x), SN = `SystemSpaceView.stranding-notice.test.tsx` (describe "burn cost overlay (add-burn-cost-overlay section 4)").

| # | Scenario | Verdict | Evidence (test and what its assertion reads) |
|---|---|---|---|
| 1 | A supplied quote draws one extent on the gauge's own scale | PASS | G "A supplied quote draws one extent ... (task 1.1)": 30 t on 200 t gives `style.left` `'0%'`, width 15 (closeTo), one fill at 40, `data-gauge-state` `filled`. V 2.1 arms repeat it on the strip; BP 3.1 and SN 4.1 prove it from the view's own derivation (15 %, fill 40 %). Values, not differences. |
| 2 | The extent covers only part of the rail's height | PASS (class proxy) | G "covers only part ... (task 1.1)", at 30 and 100 t: band has `inset-y-0.5`, not `inset-y-0`, no inline top/bottom/height; every fill has `inset-y-0`. Rendered visibility is arithmetic of those classes (2 px inset on an `h-1.5` rail); sampled pixels are row 20. |
| 3 | An affordable quote's extent carries the affordable state | PASS | G "An affordable quote's extent ... (task 1.4)": root `data-gauge-cost-state="affordable"`, band colour tokens exactly `bg-zinc-600`, `dark:bg-zinc-500`, no mark. INSPECTED half: those are `SEGMENT_SHADES[2]` in `Gauge.tsx:61-66`, a tone the strip's gauges already use. |
| 4 | An unaffordable quote's extent carries the unaffordable state in amber | PASS, one INSPECTED clause | G "An unaffordable quote's extent ... in amber (task 1.4)": state `unaffordable`, tokens exactly `bg-amber-800`, `dark:bg-amber-600`; `SpaceCommandPanel.tsx:115` uses amber for its unaffordable quote. AND "no red or blue class anywhere in the strip": G family test (row 19) covers the gauge subtree only; no test scans the whole strip. INSPECTED by grep: no `red`/`rose`/`blue`/`sky`/`indigo`/`cyan` colour class in `VitalsStrip.tsx`, `VitalsStripFleetCell.tsx`, `Gauge.tsx`. See observation O1. |
| 5 | The flag wins when the extent runs past the fill | PASS | V 2.1 "fuel 40 t, cost 60 t, flag true": band 30 %, fill 20 %, state `affordable`, mark null. BP 3.5 repeats at the view (100 t on 80 t aboard, flag true: 50 % vs fill 40 %, `affordable`, no mark). |
| 6 | The flag wins when the extent lies inside the fill | PASS | V 2.1 "fuel 80 t, cost 20 t, flag false": band 10 %, fill 40 %, `unaffordable`, mark drawn. BP 3.4 restore step (45 t, flag false: 22.5 %, `unaffordable`, mark). |
| 7 | An unaffordable extent too short to see still shows its warning | PASS | V 2.2 a: fuel 1 t, cost 0.4, flag false: state `unaffordable`, band 0.2 %, mark present and a sibling of the band (`m.parentElement` is the gauge); rerender at cost 30: mark `className` identical (same size classes). |
| 8 | The mark has a visible size and its own paint | PASS (tier-1 halves) | V 2.2 b: at 0.4 and 30 t mark has `w-1` and `inset-y-0`, no inline width/height (so width is the same, non-zero, class-fixed); affordable arms draw no mark (positive control: band present). G "paint half (task 1.4)": per scheme the mark's `bg-` shade differs from the extent's (light amber-500 vs amber-800, dark amber-400 vs amber-600). Pixel comparison is in row 20's third AND. |
| 9 | The mark sits at the extent's end along the rail | PASS (position clauses); containment BLOCKED | V 2.2 c at 0, 100, 250 t, flag false: `left` is 0, 50, 100 (closeTo, and equals the band width) and `translateX` is `-left` %, i.e. 0/-50/-100. Pull-back equals the position percentage, as the clauses state. The final AND ("no part of the mark lies before the rail's start or past its end") is rendered containment: see BLOCKED B2. |
| 10 | A cost above the capacity is limited to the rail | PASS | G "limited to the rail (task 1.2)", flag true and false: 250 t gives width 100, state per flag; `outerHTML` at 250 t equals `outerHTML` at 200 t (nothing extra drawn, identical extent). |
| 11 | A zero cost is a drawn overlay of zero length | PASS | G "A zero cost ... (task 1.2)", flag true and false: `data-gauge-cost-state` present and equal to the flag's state, band width closeTo 0. |
| 12 | A cost that is not finite non-negative draws no overlay | PASS | G "... draws no overlay (task 1.3)" x NaN, Infinity, -Infinity, -5. Each opens with a valid cost drawn (positive control), then asserts no band, no mark, no state attribute, fill still 40, `data-gauge-state` `filled`, and `outerHTML` equal to the cost-omitted baseline. |
| 13 | A gauge with no data draws no overlay | PASS | G "A gauge with no data ... (task 1.5)" x capacity undefined, capacity 0, segments undefined (each with an opening drawn control): no band, mark or state attribute; `data-gauge-state` `no-data`. Covers "unserved or 0" and "no `fuel` entry". |
| 14 | The extent exposes no figure and no control | PASS | G task 1.6 test: `root.textContent` is `''`; zero `[data-raw]`, `[data-unit]`, `[tabindex]`, `[role]`, `[aria-valuenow]`, `[aria-valuetext]`, `[aria-label]`; band attribute names exactly `class, data-gauge-cost-extent, style`, mark exactly `class, data-gauge-cost-mark, style`. V 2.5: every interactive element is the chevron or inside its menu, fuel-cell text and the single live region's text equal the no-quote render, no `fetch`. |
| 15 | Hidden from assistive technology; does not animate | PASS | G task 1.6 walks no cost, 30 t unaffordable, 60 t unaffordable, 30 t affordable, no cost again: band and mark `closest('[aria-hidden="true"]')` is the root throughout; root, band, mark have empty `style.transition` and `style.animation` and no `transition/animate/duration/ease/delay` class token. |
| 16 | The hold gauge never draws a cost extent | PASS | V 2.3: control (fuel gauge draws with the quote), then `vitals-hold-cell.outerHTML` with a quote equals that with none; hold gauge has no band and no state attribute either way. |
| 17 | The extent is drawn alongside the draining marker | PASS | V 2.4: `vitals-fuel-draining` present and band 10 % (4 t quote). SN 4.6 (both arms) asserts it from a real read: overlay 15 % and `vitals-fuel-draining` present. |
| 18 | A drawn extent is always accompanied by the quote's affordability as text | PASS | BP 3.8, flag true and false: overlay drawn; `preview-affordable` text non-empty, `data-affordable === 'true'` iff state is `affordable`, `/not affordable/` matches iff state is `unaffordable`. |
| 19 | Colour classes stay in amber and zinc | PASS | G "colour classes stay in the amber and zinc families (task 1.4)": affordable and unaffordable; every colour token on band and mark has a `dark:` token of the same utility, none has an opacity suffix, and every utility-family-step token on the root and all descendants is amber or zinc. |
| 20 | Both extents can be read on one rail | BLOCKED, awaits the journey | Journey-only (rendered pixels, two schemes, 1280x720). No tier-1 test can judge it. See B1. |
| 21 | With no selection there is no overlay | PASS | BP 3.2: no band, mark or state attribute, gauge not `no-data`, fill 40; control: selecting draws 15 %. |
| 22 | A first preview still pending | PASS | BP 3.3 pending: no overlay while the first call is deferred; after resolve 30 t, overlay 15 %. |
| 23 | A failed first preview | PASS | BP 3.3 failed: `preview-no-quote` present and no overlay; retry succeeds, overlay 15 %. |
| 24 | A refresh in flight never blanks the overlay | PASS | BP 3.4: call 2 pending shows 15 % `affordable`; answered 36 t shows 18 %. A `MutationObserver` on the gauge shows no removed extent node and zero mutations of `data-gauge-cost-state`; same root element throughout. |
| 25 | A failed refresh withdraws the overlay and nothing else | PASS | BP 3.4 call 3 rejected: `preview-stale` present, no overlay, `preview-fuel-ceiling` absent, `vitals-fuel-tons` `data-raw` 80, range `data-raw` unchanged, fill 40. |
| 26 | A refresh sent after a failure draws no overlay while pending | PASS | BP 3.4 call 4 deferred: call count 4, no overlay, no ceiling. |
| 27 | A later successful refresh restores the overlay | PASS | BP 3.4 call 4 answers 45 t, flag false: 22.5 %, `unaffordable`, mark drawn, fill 40, ceiling back. |
| 28 | Replacing the selection never shows the previous target's cost | PASS | BP 3.5: X draws 15 %; Y selected, response deferred: none; Y answers 100 t: 50 %. SN 4.5 covers the same for fleet. |
| 29 | The served flag is shown when cost exceeds fuel aboard | PASS | BP 3.5: 100 t quote, flag true, 80 t aboard: 50 %, `affordable`, no mark, fill 40. |
| 30 | Clearing the selection withdraws the overlay | PASS | BP 3.5 deselect (`selection()` is `''`): no overlay. BP 3.9 repeats it. |
| 31 | Switching the acting fleet never shows the previous fleet's cost | PASS | SN 4.5: A 15 %, fill 40; switch to B with selection kept and B's response deferred: none, fill 20 (B's own); B answers 50 t: 25 %, fill 20. |
| 32 | A withheld preview draws no overlay | PASS | BP 3.6 x mine (ETA not passed), transit, docked-at-selection: each arm opens with a 15 % overlay, then no overlay and gauge not `no-data`. |
| 33 | A committed order withdraws the overlay from acceptance through the gap | PASS | SN 4.2: 15 % before Burn click; order accepted, new read requested, unanswered: no overlay (gauge not `no-data`). |
| 34 | A committed order's overlay stays withdrawn while the read reports that burn | PASS | SN 4.2 continued: read #1 reports the burn, then a later poll read reports it again: no overlay both times. |
| 35 | A resumed preview draws no overlay until its restoring response lands | PASS | Mine row: BP 3.7 (cancel, restoring call deferred: none; answers 30 t: 15 %, not the old 30 %). Committed-order row: SN 4.3 (cut drive, restoring preview pending: none; answers 30 t: 15 % from the old 60 t's 30 %). |
| 36 | Another target is overlaid while the committed target is not | PASS | SN 4.4: committed X none; select Y: 25 % (50 t); select X again: none. |
| 37 | A burn the view did not commit is overlaid as a re-target | PASS | SN 4.6 x opened-on-a-burn, remounted: 15 % `affordable` with `vitals-fuel-draining`. |
| 38 | The overlay is never drawn without the fuel ceiling | PASS | BP 3.4: ceiling present with the overlay, both absent after failure and while the next refresh pends, both back on success. |
| 39 | The fill can move before the overlay does | PASS | BP 3.10: 20 t aboard, 30 t quote flag false: 15 % `unaffordable`, fill 10. Own-fleets read moves fill to 40, overlay still 15 % `unaffordable`, preview call count unchanged. Next response flag true: `affordable`, exactly one more request. |
| 40 | The overlay is silent and costs no request | PASS | BP 3.9: `space-announcer` and `balance-live-region` text equal baseline at appear, change (30 to 36 t) and withdraw; requests 1, 2, 2. Static half: `hooks/use-burn-preview.call-site.test.ts` passes (3 tests). |

## BLOCKED rows (awaiting the journey)

Neither `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts` nor `docs/handoffs/add-burn-cost-overlay-journey.md` exists as of this pass (only `burn-geometry-refusals-journey.spec.ts` and `burn-preview-journey.spec.ts`, other changes). So I cannot name closing spec lines. For each BLOCKED item, what a closing assertion must check. A short second pass is needed once the journey spec and pre-run record exist.

- **B1. Row 20, "Both extents can be read on one rail"** (all three clauses). The journey, at 1280x720, in light and in dark scheme, with fill and an overlay both drawn and the extent at least 2 device pixels long, must sample rendered colours at: (a) the centre of a fill point the extent does not cover (the fill's part beyond the extent's end where fill is longer, otherwise a fill point above the extent), (b) the centre of the extent, (c) the centre of a rail part covered by neither; and assert the three pairwise unequal as sRGB in each scheme. It must also assert, in an arrangement with the extent ending past the fill's end, that the extent's centre pixel past the fill's end differs from the rail sample; and, in an unaffordable arrangement, that the mark's centre pixel differs from both the extent sample and the fill sample. A merely observational log, or a leg allowed to log UNTESTED, does not close it; the assertion must be a hard `expect` in both schemes.
- **B2. Row 9's last AND, rendered containment** ("at each of the three costs no part of the mark lies before the rail's start or past the rail's end"). Tier 1 asserts `left: p%` and `translateX(-p%)`, from which containment follows arithmetically (leading edge = p(W-w)/100 within [0, W-w]), so this is INSPECTED-sound, but the coverage file says the journey has no containment leg. A closing assertion would compare the mark's bounding rect to the gauge's at unaffordable costs 0, 100 and at or above capacity (leading edge >= rail left; trailing edge <= rail right; at 0 leading edge equals rail left; at/above capacity trailing edge equals rail right). If no such leg is added, this clause stays INSPECTED, not PASS, and the orchestrator should record it as accepted by arithmetic.
- **B3. Row 8's rendered paint comparison** is closed by B1's third clause (mark centre unequal to extent and fill). Tier 1 holds the class-level shade criterion (RULING 20).

## Exploratory charters (code reading and unit-level evidence; no probe was written)

1. **Overlay lifetime across selection replace, fleet switch, commit, resume.** `SystemSpaceView.tsx:793` derives `currentQuote = burnPreview.preview && !burnPreview.stale ? burnPreview.preview : null`; the strip prop is a conditional spread of `{ tons: fuelCostTons, affordable }` (`:1082-1084`), so there is one determination, no state, ref or effect added, and no one-render lag. Replace, switch, commit (`selectionCommitted` gates `previewWanted` at `:787`) and both resumes are each driven by a test that opens with a drawn overlay and asserts the pending state (BP 3.5, SN 4.5, SN 4.2, BP 3.7, SN 4.3). Findings: none.
2. **The two flag-versus-picture arrangements.** Gauge copies `cost.affordable` into `costState` (`Gauge.tsx:97`); no fuel-versus-cost arithmetic exists. Both arrangements are asserted at gauge/strip (V 2.1) and at the view (BP 3.5, BP 3.4 restore, BP 3.10). The mark is gated on `costState === 'unaffordable'` only. Findings: none.
3. **Zero cost, cost at and above capacity, no-data gauge.** Zero: `width: 0%`, mark at `left: 0%; translateX(-0%)`. At/above capacity: `Math.min(.., 100)` and `outerHTML` equal to the exact-capacity case (G 1.2). No-data: guarded by `state !== 'no-data' && hasValidCapacity` (G 1.5). Observation O3 below.
4. **Hold gauge unaffected.** `HoldCell` never receives `burnCost` and its `Gauge` is rendered without `cost`; V 2.3 compares the hold cell's `outerHTML` with and without a quote. Findings: none.
5. **Nothing gained text, figure attribute, control or announcement.** Overlay elements carry only `class`, a data marker, and `style`; no new `role`/`aria-live`; `VitalsStrip` adds no element outside the gauge. G 1.6, V 2.5, BP 3.9 assert it. Observation O2.

## Observations (not FAIL; spec or test notes)

- **O1 (test gap, no code defect).** Row 4's "no red or blue class is applied anywhere in the strip" is asserted only on the gauge subtree (G family test). A strip-wide class scan test does not exist; a grep of the three production files finds none today. SPEC GAP candidate: say "in the gauge" or add a strip-level scan.
- **O2 (test gap).** Row 40's "no live-region text" is checked against `space-announcer` and `balance-live-region` only, and the "changes cost or state" step changes cost only (30 to 36 t, same state); the state-change announcement case is not asserted (state change is exercised by BP 3.10 but with no announcement check). Code adds no live region, so low risk.
- **O3.** `Gauge`'s `cost.affordable` is a plain truthiness read; a response whose `affordable` were absent would draw as unaffordable with a mark. The service type makes it a required boolean, so not reachable via the typed path. Also a dry-but-served fuel entry of 0 t gives gauge state `empty` (not `no-data`), so the overlay is drawn on an empty fill; this is as specified (only the no-data value withholds it).
- **O4.** Widths are raw float strings (for example 30/200*100 renders as a long decimal in some cases); tests use `toBeCloseTo`. Cosmetic only.
- **O5.** tasks.md: 31 `- [x]`, 8 `- [ ]` (6.2 to 6.9, all section 6 gates)  No checked task corresponds to a failing scenario. The integrity doc's 30 predates 6.1 being checked.
- `exactOptionalPropertyTypes` is off; both props are omitted via conditional spread, which satisfies the frontend CLAUDE.md "omit, don't pass undefined" rule (integrity doc section 4 agrees).

## Verdict

0 FAIL. 39 PASS, 1 BLOCKED (row 20), plus residual sub-clause B2 in row 9 (B3 closes with B1), 1 sub-clause INSPECTED (row 4 strip-wide colour, O1).

**SHIP**, conditional on the journey closing B1 (and B2 either closed by a bounding-rect assertion or accepted as INSPECTED-by-arithmetic). Short second pass required to map B1/B2 to exact spec lines once `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts` and `docs/handoffs/add-burn-cost-overlay-journey.md` exist.

## Second pass — closing lines (pre-run)

QA, 2026-10-04. Read whole, not run, no stack: `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts` (1181 lines) and `docs/handoffs/add-burn-cost-overlay-journey.md` (pre-run). Line numbers are the spec's. Classes: **PASSED** = closes when the leg ends PASSED; **ARRANGED** = closes only if the arrangement occurs (leg may log UNTESTED, row then stays BLOCKED, accepted by RULING 14 / RULING 16); **NONE** = no line closes it.

### Closing table

| Item | Closing line(s) | Class | Notes |
|---|---|---|---|
| B1 row 20, clause 1: fill / extent / rail centre pixels pairwise unequal, light and dark | 536-543 (`assertPaint`, hard `expect(same(a,b)).toBe(false)` for fill-extent 526, fill-rail 527, extent-rail 528), reached via 984 inside `paint-light` (992) and `paint-dark` (993); sampling points 485-497 match the spec's definition | **ARRANGED** | Leg is UNTESTED (989) when no target yields both a fill sample and a rail sample, when the extent is under 2 device px (476), or the scheme emulation did not take (446). The closing test does not require the paint legs (MUST_PASS is only the three, 158, 1173). A PASSED needs `full > 0` (985, 989). Each scheme is its own leg, so each is closed separately. Tailwind dark is media-based (no `custom-variant` in `app/` or `styles/`), so `emulateMedia` does switch the palette. |
| B1 row 20, clause 2: extent-past-fill centre pixel unequal to rail | 529 (`pastFill` vs `rail`) hard in `assertPaint`; leg status set at 996-1006 | **ARRANGED**, likely UNTESTED | Needs a quote whose extent is more than 5 points past the fill (948). Starting fuel 100 t and small costs make UNTESTED the expected outcome (the record says so). See gap G3. |
| B1 row 20, clause 3 / B3 row 8 rendered paint: mark centre unequal to extent and to fill | 530 (mark vs extent), 531 (mark vs fill) in `assertPaint`; mark only sampled when unaffordable arranged: via paint target 954 in test 2, or round 2 at 1139-1146 | **ARRANGED**, likely UNTESTED | The `unaffordable-overlay-and-mark` leg PASSED (1009-1019, 1130-1148) does not prove the mark pixel was sampled: round 1 only asserts DOM and logs at 1018 if `arranged.mark` is false. See gap G2. |
| B2 row 9 rendered containment of the mark | none. 939-942 bound the extent (band) inside the rail, never the mark; mark's rect is read (409, 413) only to take its centre pixel (509) | **NONE** | The record agrees ("held by review", journey line 31). Stays INSPECTED-by-arithmetic. A bounding-rect assert on `mark` at unaffordable costs near 0 and at or above capacity would be required to close it, and the arrangement is unlikely anyway. |
| Row 8 mark width greater than zero, same at two costs, full height (rendered) | none | **NONE** | Tier 1 holds the class-level facts (`w-1`, `inset-y-0`, no inline size). Not a journey claim. |

Net effect on rows: row 20 closes only if at least clause 1 is arranged in both schemes (likely) and clauses 2 and 3 are arranged (unlikely); otherwise row 20 stays BLOCKED/partially open with tier-1 cover named. Row 9 containment and row 8 rendered mark width stay as they are: no rendered tier closes them.

### Hardness checks you asked about

- **Paint inequalities hard, both schemes?** Yes. `assertPaint` uses plain (non-soft) `expect`; it runs inside `runLeg`, whose catch records FAILED (181-184); test 4 asserts the FAILED list is empty (1171-1172) and the failure message names the pair and rgb values. Light and dark are separate legs. Contrast ratios are logged only, not gated (534), which matches the spec (inequality only).
- **Can a FAILED leg be swallowed?** Not on the paths read. `runLeg` stores FAILED, test 4 fails on any FAILED (1172) and on any must-PASS not PASSED (1173-1179). A throw outside `runLeg` (for example `probeTargets` at 1119, `probe.filter` at 865) fails its own test, and serial mode skips test 4, so the run is red either way. The only swallow is the file-level `test.skip(cfg.env !== 'local')` (653), which skips everything: green with zero evidence, so the orchestrator must confirm the run was not skipped.
- **Update-depth capture hard in `afterEach`?** Yes (741-758): regex `maximum update depth|nested update` over console error/warning and pageerror since the last test, `expect(depth).toEqual([])`. The e2e frontend is `next dev --turbopack` (`playwright.config.ts:19`), so the message is unminified and the regex matches. An `afterEach` failure fails that test and skips later ones.
- **Does test 4 require the three must-PASS legs?** Yes (158, 1173-1179: status must equal `'PASSED'`, so UNTESTED and NOT REACHED are red). Running test 4 alone would be red (all NOT REACHED).

### Gaps for the SDET (findings; I edited nothing)

- **G1. `overlay-equals-panel-flag` cannot tell a flag-ignoring build from a correct one if every probed quote is affordable.** Starting fuel is 100 t and costs are a small fraction of it (the record's own expectation), so every probed flag is likely `true`, and a gauge that always draws `affordable` passes (811-825, `violations` 236-237). The panel flag read (698) is the view's own copy of the same quote, not the wire. Suggested hardening: also assert the gauge state and `bandPct` against the recorded wire answer (`previewAnswers`, `latestAnswer(id)`: `affordable`, `fuelCostTons`) rather than only the panel DOM. The leg's name is met only in the weak sense; row-level discrimination is tier 1's (3.4, 3.5, 3.10, 2.1).
- **G2. `unaffordable-overlay-and-mark` PASSED does not mean the mark was painted-checked.** Round 1 (1009-1019) asserts DOM only and merely logs when `arranged.mark` is false (1018); only the `[journey-paint] ... mark=rgb(...)` log line shows pixels were sampled. Suggest: in that leg, return `{ untested }` unless a mark sample exists in both schemes, so a PASSED leg implies row 20 clause 3 closed.
- **G3. `extent-past-fill` goes PASSED if the arrangement was sampled in either scheme (998-999)** while the spec needs it per scheme; and the probe never arranges it on purpose. The better chance (fuel lower after the commit, so costs approach or exceed fuel aboard) occurs in round 2, whose paint sampling (1139-1146) does not feed `arranged.pastFill`. Suggest: set `arranged.pastFill` per scheme, and sample past-fill in round 2.
- **G4. Silent skip of the band-scale check.** `violations` skips the `bandPct` vs `previewFuel / capacity` comparison when `capacity` is null (240); `waitQuote` requires `previewFuel` non-null but not `capacity`. If `hold-capacity-total` lacks `data-raw`, the must-PASS leg passes without the scale check. Suggest asserting `s.capacity` non-null in the leg.
- **G5. `no-selection` has no in-leg positive control.** It guards the gauge as `filled`, the selection `''` and the panel quote absent (766-785), but the overlay can appear at all only in the next leg. Acceptable because test 4 requires both, but the legs are not independent: if the overlay never draws, `overlay-equals-panel-flag` is the one that goes red (not no-selection). No change required, noted.
- **G6 (minor).** In the sampler legs (replace 896-901, commit 1094-1101), `violations()` on sampled snapshots also hits `s.gaugeState === 'no-data'`; good. The commit leg's 100 ms early window is observation only (1089-1093), so the "acceptance" clause is only asserted from +100 ms. Tier 1 (SN 4.2) covers acceptance exactly.
- **G7 (minor).** `paint` legs bound the dark leg to the targets reversed (993) under a shared 52 s budget (967). If light consumes the budget, dark may sample zero targets and go UNTESTED rather than red; row 20 would then be open for dark.

No leg was found that passes with zero probe targets on a must-PASS leg: 812-816 requires at least one quoted target, 829 turns no-target into UNTESTED (red at test 4), and the sampler legs assert non-empty windows (907, 1095-1096). No value is compared with itself in the paint pairs (distinct sampled points).

### Verdict after the second pass

Unchanged: **SHIP** conditional on the run. Expected journey outcome at best: must-PASS legs PASSED, paint-light and paint-dark PASSED (clause 1 of row 20 closed in both schemes), clauses 2 and 3 of row 20 UNTESTED with tier-1 cover (V 2.1, V 2.2, G 1.4), row 9 containment accepted as INSPECTED-by-arithmetic. G1 and G2 are the two I would ask the SDET to fix before the run.

# add-burn-cost-overlay — red coverage

SDET, red handoff, 2026-10-04. Tree `a965554` plus four appended test files; no production file touched.
Level for every automated row: **unit/integration (vitest + Testing Library, tier 1)**. No Playwright and no
router-level e2e was written in this phase.

Manifest: `docs/handoffs/red-manifest-add-burn-cost-overlay.txt` (four test files, sha256).

## Files and counts

| File | New tests | Pre-existing pass | New fail |
| --- | --- | --- | --- |
| `frontend/components/space/Gauge.test.tsx` | 18 | 18 / 18 | 18 / 18 |
| `frontend/components/space/VitalsStrip.test.tsx` | 10 | 40 / 40 | 10 / 10 |
| `frontend/components/space/SystemSpaceView.burn-preview.test.tsx` | 14 | 27 / 27 | 14 / 14 |
| `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` | 7 | 62 / 62 | 7 / 7 |
| **Total** | **49** | **147 / 147** | **49 / 49** |

`git diff --numstat` on the four files shows additions only (301, 225, 369, 196 added; 0 deleted): no existing
line, fixture, helper or `beforeEach` was edited. `npx tsc --noEmit` exits 0 with no `@ts-expect-error`; `eslint`
on the four files reports 0 errors and 1 pre-existing warning (`rejectPreview` unused, stranding file line 398).

## Commands that show each red group (tier 1, `docs/testing-tiers.md`; per-task row of `frontend/CLAUDE.md`)

```
cd frontend && npx vitest run components/space/Gauge.test.tsx                                   # 18 new red
cd frontend && npx vitest run components/space/VitalsStrip.test.tsx                             # 10 new red
cd frontend && npx vitest run components/space/SystemSpaceView.burn-preview.test.tsx            # 14 new red
cd frontend && npx vitest run components/space/SystemSpaceView.stranding-notice.test.tsx        # 7 new red
cd frontend && npx tsc --noEmit
```

Why each is red (observed, not assumed). Every one of the 49 fails on an `AssertionError`/`toHaveAttribute`
mismatch, never a TypeError or compile error. Section 1: "the extent must be drawn: expected null not to be null",
or `data-gauge-cost-state` absent. Section 2: the same, read from the fuel gauge. Sections 3 and 4: the first
`expectOverlay` fails with "overlay state: expected null to be 'affordable'" because the view passes the strip no
`burnCost`. The positive controls (GIVEN and closing assertions) are what make the absence assertions red; the
absence halves on their own are green on the unbuilt tree.

## Reference-build check (scratch worktree, `git worktree` at `a965554`, node_modules symlinked)

A correct reference build of the three production files (written to the contract, in the scratch worktree only)
makes the whole suite green: **4 files, 196 / 196 passed, `tsc` clean**. That proves the tests are satisfiable and
that jsdom reads the inline `transform`, `left` and `width` the contract specifies. The reference build was never
placed in the working tree.

## Coverage table: 40 scenarios

Task = the tasks.md SDET row that owns the test.

| # | Scenario | Test (file : title prefix) | Status | Task |
| --- | --- | --- | --- | --- |
| 1 | A supplied quote draws one extent on the gauge's own scale | Gauge.test: `Scenario: A supplied quote draws one extent on the gauge's own scale (task 1.1)`; VitalsStrip.test: `Scenario: The flag wins when the extent runs past or lies inside the fill (task 2.1)` (extent on the strip's scale, both arms); burn-preview: `... a current quote draws 15 % (3.1)`; stranding-notice: `SDET-added: a current quote draws 15 % over the real own-fleets read (task 4.1)` | assertion-red | 1.1, 2.1, 3.1, 4.1 |
| 2 | The extent covers only part of the rail's height | Gauge.test: `Scenario: The extent covers only part of the rail's height (task 1.1)` (30 t and 100 t) | assertion-red | 1.1 |
| 3 | An affordable quote's extent carries the affordable state | Gauge.test: `Scenario: An affordable quote's extent carries the affordable state (task 1.4)`; VitalsStrip.test 2.1 arm 1 | assertion-red | 1.4, 2.1 |
| 4 | An unaffordable quote's extent carries the unaffordable state in amber | Gauge.test: `Scenario: An unaffordable quote's extent carries the unaffordable state in amber (task 1.4)`; VitalsStrip.test 2.1 arm 2 | assertion-red | 1.4, 2.1 |
| 5 | The flag wins when the extent runs past the fill | VitalsStrip.test 2.1 (fuel 40 t, cost 60 t, flag true: 30 % past a 20 % fill, affordable, mark absent); burn-preview 3.5 (100 t quote, 80 t aboard, flag true) | assertion-red | 2.1, 3.5 |
| 6 | The flag wins when the extent lies inside the fill | VitalsStrip.test 2.1 (fuel 80 t, cost 20 t, flag false: 10 % inside a 40 % fill, unaffordable, mark present); burn-preview 3.4 restore step (45 t, flag false, 22.5 % inside 40 %) | assertion-red | 2.1, 3.4 |
| 7 | An unaffordable extent too short to see still shows its warning | VitalsStrip.test: `Scenario: An unaffordable extent too short to see still shows its warning (task 2.2 a)` | assertion-red | 2.2 |
| 8 | The unaffordable mark has a visible size and its own paint | Size half: VitalsStrip.test `... the size half (task 2.2 b)`. Paint half (per-scheme shade criterion, RULING 20): Gauge.test `... the paint half (task 1.4)`. Rendered-pixel half: see row 20 and the review-held list | assertion-red (tier 1 halves); pixel half Playwright, deferred | 1.4, 2.2 |
| 9 | The unaffordable mark sits at the extent's end along the rail | VitalsStrip.test: `Scenario: The unaffordable mark sits at the extent's end along the rail (task 2.2 c)` at 0, 100, 250 t (start position and pull-back). Containment as rendered pixels is `reasoned-not-automated` (jsdom does no layout; held by review, journey has no containment leg) | assertion-red | 2.2 |
| 10 | A cost above the capacity is limited to the rail | Gauge.test: `Scenario: A cost above the capacity is limited to the rail (task 1.2)`, flag true and false (`outerHTML` at 250 t equals 200 t) | assertion-red | 1.2 |
| 11 | A zero cost is a drawn overlay of zero length | Gauge.test: `Scenario: A zero cost is a drawn overlay of zero length (task 1.2)`, flag true and false | assertion-red | 1.2 |
| 12 | A cost that is not a finite non-negative number draws no overlay | Gauge.test: `Scenario: A cost that is not a finite non-negative number draws no overlay (task 1.3)` x NaN, Infinity, -Infinity, -5. Each arm opens with a valid cost drawn (the control that makes it red) and ends equal to the omitted-cost `outerHTML` | assertion-red (control: already-green without the opening control) | 1.3 |
| 13 | A gauge with no data draws no overlay | Gauge.test: `Scenario: A gauge with no data draws no overlay (task 1.5)` x capacity undefined, capacity 0, segments undefined (opening control as above) | assertion-red (control: already-green without the opening control) | 1.5 |
| 14 | The extent exposes no figure and no control | Gauge.test: `Scenario: The extent exposes no figure and no control; the overlay is hidden ... (task 1.6)`; VitalsStrip.test: `Scenario: The extent exposes no figure and no control (task 2.5)` | assertion-red | 1.6, 2.5 |
| 15 | The overlay is hidden from assistive technology and does not animate | Gauge.test (same `it` as row 14, task 1.6): `aria-hidden` root contains band and mark; no transition/animation style or class on root, band, mark across no cost, 30 t unaffordable, 60 t unaffordable, 30 t affordable (SDET-added phase), withdrawn | assertion-red | 1.6 |
| 16 | The hold gauge never draws a cost extent | VitalsStrip.test: `Scenario: The hold gauge never draws a cost extent (task 2.3)` (control: fuel gauge draws; hold cell `outerHTML` equal with and without the quote) | assertion-red (absence halves already-green alone) | 2.3 |
| 17 | The extent is drawn alongside the draining marker | VitalsStrip.test: `Scenario: The extent is drawn alongside the draining marker (task 2.4)`; stranding-notice 4.6 (view level, both arms) | assertion-red | 2.4, 4.6 |
| 18 | A drawn extent is always accompanied by the quote's affordability as text | burn-preview: `Scenario: A drawn extent is always accompanied by the quote's affordability as text (3.8)`, flag true and false | assertion-red | 3.8 |
| 19 | The extent's and the mark's colour classes stay in the amber and zinc families | Gauge.test: `Scenario: The extent's and the mark's colour classes stay in the amber and zinc families (task 1.4)` (affordable and unaffordable; dark pair per light token; no opacity suffix; family check over root and every descendant) | assertion-red | 1.4 |
| 20 | Both extents can be read on one rail | none at tier 1 | Playwright, deferred (journey, task 6.2: pixel sampling, light and dark) | 6.2 |
| 21 | With no selection there is no overlay | burn-preview: `Scenario: With no selection there is no overlay (3.2)` (closing control: a selection draws 15 %) | assertion-red (control) | 3.2 |
| 22 | A first preview still pending draws no overlay | burn-preview: `Scenario: A first preview still pending / A failed first preview draws no overlay (3.3) — pending` | assertion-red (control: the response lands, 15 %) | 3.3 |
| 23 | A failed first preview draws no overlay | burn-preview 3.3 `— failed` (`preview-no-quote` present, then retry succeeds, 15 %) | assertion-red (control) | 3.3 |
| 24 | A refresh in flight never blanks the overlay | burn-preview: `Scenario: A refresh in flight never blanks the overlay / ... (3.4)` (call 2 pending: 15 %; answered 36 t: 18 %; `MutationObserver` shows no band removal and no state-attribute mutation) | assertion-red | 3.4 |
| 25 | A failed refresh withdraws the overlay and nothing else | burn-preview 3.4 (call 3 rejected: `preview-stale`, no overlay, no ceiling, `vitals-fuel-tons` 80, range unchanged, fill 40 %) | assertion-red | 3.4 |
| 26 | A refresh sent after a failure draws no overlay while it is pending | burn-preview 3.4 (call 4 deferred: no overlay, no ceiling) | assertion-red | 3.4 |
| 27 | A later successful refresh restores the overlay at the new cost and state | burn-preview 3.4 (call 4 answers 45 t, flag false: 22.5 %, unaffordable, mark, ceiling back) | assertion-red | 3.4 |
| 28 | Replacing the selection never shows the previous target's cost | burn-preview: `Scenario: Replacing the selection never shows the previous target's cost / ... (3.5)` (Y pending: none; Y answers: 50 %) | assertion-red | 3.5 |
| 29 | The served flag is shown even when the cost exceeds the fuel aboard | burn-preview 3.5 (100 t on 80 t aboard, flag true: affordable, no mark, fill 40 %) | assertion-red | 3.5 |
| 30 | Clearing the selection withdraws the overlay | burn-preview 3.5 (deselect: no overlay, `selection()` is `''`) | assertion-red | 3.5 |
| 31 | Switching the acting fleet never shows the previous fleet's cost | stranding-notice: `Scenario: Switching the acting fleet never shows the previous fleet's cost (task 4.5)` (B pending: none, fill 20 %; B answers 50 t: 25 %) | assertion-red | 4.5 |
| 32 | A withheld preview draws no overlay | burn-preview: `Scenario: A withheld preview draws no overlay (3.6)` x mine, transit, docked (each opens with 15 %) | assertion-red (control per arm) | 3.6 |
| 33 | A committed order withdraws the overlay from acceptance through the gap | stranding-notice: `Scenario: A committed order withdraws the overlay from acceptance through the gap / ... (task 4.2)` | assertion-red (control: 15 % before the Burn click) | 4.2 |
| 34 | A committed order's overlay stays withdrawn while the read reports that burn | stranding-notice 4.2 (read #1 reports the burn; a later poll read reports it again) | assertion-red (control) | 4.2 |
| 35 | A resumed preview draws no overlay until its restoring response lands | Mine row: burn-preview `... the mine row (3.7)`; committed-order row: stranding-notice `... the committed-order row (task 4.3)` (restoring call held, then answers 30 t: 15 %, not the old 30 %) | assertion-red | 3.7, 4.3 |
| 36 | Another target is overlaid while the committed target is not | stranding-notice: `Scenario: Another target is overlaid while the committed target is not (task 4.4)` (Y 25 %; X again none) | assertion-red | 4.4 |
| 37 | A burn the view did not commit is overlaid as a re-target | stranding-notice: `Scenario: A burn the view did not commit is overlaid as a re-target (task 4.6)` x opened on a burn, remounted | assertion-red | 4.6 |
| 38 | The overlay is never drawn without the fuel ceiling | burn-preview 3.4 (ceiling present with overlay; both absent after the failure and while the next refresh pends; both back on success) | assertion-red | 3.4 |
| 39 | The fill can move before the overlay does | burn-preview: `Scenario: The fill can move before the overlay does (3.10)` (20 t then 80 t aboard: fill 40 %, still unaffordable, call count unchanged; next response flag true: affordable, exactly one more request) | assertion-red | 3.10 |
| 40 | The overlay is silent and costs no request | burn-preview: `Scenario: The overlay is silent and costs no request (3.9)` (`space-announcer` and `balance-live-region` equal baseline at appear, change, withdraw; requests 1, 2, 2). Static half (no second hook call site) is the existing `hooks/use-burn-preview.call-site.test.ts`, unedited and green | assertion-red | 3.9 |

Counts: 39 scenarios `assertion-red`, 1 `Playwright, deferred` (row 20). Rows 8 and 9 each carry a review-held
residual (below). No scenario is `compile-red` and none is `already-green`.

SDET-added beyond the spec: the affordable-quote phase in the task 1.6 no-animation walk (a transition class on
the affordable band only was green without it; see mutation `transition class on band`).

## Task to test map

1.1 Gauge geometry (2 tests) | 1.2 rail limit + zero (4) | 1.3 degenerate (4) | 1.4 state and palette (4) |
1.5 no-data (3) | 1.6 decorative and still (1) | 2.1 (2) | 2.2 (a, b, c x 3 = 5) | 2.3 (1) | 2.4 (1) | 2.5 (1) |
3.1 (1) | 3.2 (1) | 3.3 (2) | 3.4 (1) | 3.5 (1) | 3.6 (3) | 3.7 (1) | 3.8 (2) | 3.9 (1) | 3.10 (1) |
4.1 (1, the fixture and smoke) | 4.2 (1) | 4.3 (1) | 4.4 (1) | 4.5 (1) | 4.6 (2).

Fixtures (3.1, 4.1) were added beside the existing ones as appended declarations (`fuelRoster`, `fuelFleet`,
`quoteOf`, `fuelGauge`, `overlay`, `fillPct`, `expectOverlay`, `expectNoOverlay`; `withFuel`, `quoteOf` and the
same reader in the stranding file). No existing fixture was edited.

## Mutation checks

Method: the reference build above, copied to a scratch worktree; one wrong build applied at a time; the four
test files run; failing tests recorded; the reference restored. Nothing under the working tree was edited.
"Killed by" lists the tests observed failing. Superset of the contract's named row is fine.

| Wrong build | Contract's killing row | Observed |
| --- | --- | --- |
| reader is `burnPreview.preview` | 3.4 failed-refresh step | KILLED: 3.4 only, at "call 3 failed: no extent" |
| currency keyed on `isFetching`, blanking each refresh | 3.4 call-2-pending | KILLED: 3.4 only, at "call 2 pending: overlay state null" |
| currency keyed on `isFetching`, re-presenting after a failure | 3.4 call-4-pending | KILLED: 3.4 only, at "call 4 pending: no extent" |
| quote copied to a ref (sticky last quote) | 3.5, 3.7, 4.2, 4.3, 4.5 | KILLED: 11 tests across sections 3 and 4 |
| `flag && cost <= fuel` | 3.5 only | KILLED: 3.5 and 4.5 |
| `flag \|\| cost <= fuel` | 3.4 restore step | KILLED: 3.4, 3.8 (flag false), 3.10 |
| `cost <= fuel` | both | KILLED: 3.4, 3.5, 3.8, 3.10, 4.5 |
| default object when no quote | 3.2 | KILLED: 14 tests, 3.2 among them |
| gauge decides state/mark from geometry | 2.1 both arms | KILLED: 18 tests incl. both 2.1 arms |
| mark drawn because the cost was clamped | 1.2 (250 t, flag true) | KILLED: 1.2 flag true only |
| mark with `left`, no pull-back | 2.2 (c) at 100 and 250 t | KILLED: 2.2 (c) at 0, 100 and 250 t |
| mark as child of the band | 2.2 `band.contains(mark)` | KILLED: 5 tests |
| mark sized inline or by cost | 2.2 (a), (b) | KILLED: 4 tests |
| band full-height (`inset-y-0`) | 1.1 | KILLED: 1.1 part-height |
| band offset by the fill | 1.1 `left` is `0%` | KILLED: 1.1 |
| band with a minimum width | 1.2 zero, 2.2 (a) | KILLED: 1.2 zero x2, 2.2 a, 2.2 c at 0 |
| band not limited to the rail | 1.2 | KILLED: 1.2 x2, 2.2 c at 250 |
| overlay drawn on a no-data gauge | 1.5 | KILLED: 1.5 segments-undefined arm |
| degenerate cost drawn | 1.3 | KILLED: 4 tests (1.3 x4 arms) |
| fill shortened by the overlay | 1.1, 2.1 | KILLED: 9 tests |
| cost reaches the hold gauge | 2.3 | KILLED: 2.3 |
| mark body in the band's shade | 1.4 per-scheme criterion | KILLED: 1.4 paint half |
| red token on the band | 1.4 | KILLED: 1.4 (state and palette tests) |
| translucent token on the band | 1.4 | KILLED: 1.4 |
| transition class on the band | 1.6 | SURVIVED the contract's phases (1.6 arranged unaffordable only). Test strengthened with an SDET-added affordable phase; now KILLED |
| transition class on the mark | 1.6 | KILLED: 1.6 |
| `data-testid` on the band | 1.6 attribute-name lists | KILLED: 1.6 |
| figure text in the band | 1.6 | KILLED: 4 tests |
| bare marker attribute (renders "true") | 1.1 | KILLED: 1.1 |
| strip prints cost text | 2.5 | KILLED: 2.5 |

## Wrong builds held by review only (no test can see them)

- a second, identical `burnPreview.preview && !burnPreview.stale` at the mount (same output as the one determination)
- an explicit `burnCost={undefined}` or `cost={undefined}` (`exactOptionalPropertyTypes` is off)
- a one-render lag from a state copy (invisible under `act`)
- the mark's position after the band in DOM order (the mark is not required by any test to follow the band)
- the mark's containment as rendered pixels and the rounded cap's clipping (jsdom does no layout; row 9 and row 8 residual)
- the overlay while the canvas is unavailable (RULING 17: no test by ruling)

Cover that is an existing green test, not mine: `useBurnPreview` imported by the strip or the gauge is held by
`frontend/hooks/use-burn-preview.call-site.test.ts` (unedited). I did not run it as a mutation.

## Deferred / not automated

- Row 20 "Both extents can be read on one rail": `Playwright, deferred` to the journey (task 6.2). Tier-1 cover is
  the paint half of row 8 (per-scheme shade inequality) only; sampled pixels are journey-only.
- Journey legs logged in the contract (no selection, affordable overlay, clear withdraws, replace, commit
  withdraws, width floor 1280 x 720, paint) are 6.2 and not written in this phase.

## Spec notes

RULING 20 residue applied: task 1.4's per-scheme background-shade inequality is the binding paint criterion, not
"colour tokens differ" (design.md:528, proposal.md:32). The test reads `bg-<family>-<step>` per scheme: light
`amber-500` vs `amber-800`, dark `amber-400` vs `amber-600`. No spec defect found; no scenario was untestable as
written.

Known harness defect, not run and not this change's: `docs/handoffs/defect-determinism-checks-resolve-repo-root-above-repo.md`
(tier 0's two determinism legs). Tier 0 was not run here.

Minor: `it.each` titles for task 2.2 (c) print the zero-cost arm as `cost +0 t` (Vitest's `$cost` formatting of 0);
the arm is the 0 t row.

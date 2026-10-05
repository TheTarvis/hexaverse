# add-console-dock — QA report (Phase 2, step 10)

Persisted verbatim by the orchestrator from QA's hand-back, 2026-10-05 (QA is
read-only and wrote no file). The orchestrator's dispositions follow the report.

Build `e5e9eff` plus the SDET's uncommitted work. No stack was booted and nothing was edited.

## Verdict: RETURN TO SDET (journey spec and e2e migrations; batch of 9 findings) — then SHIP-pending-journey

- **Production code:** no defect found.
- **Scope (RULING 15):** no overreach. The Log content is unmounted while collapsed. There is no Escape handler, no no-read-on-show and no settle re-read.
- **Matrix:** 37 PASS / 0 FAIL / 11 BLOCKED-awaiting-journey / 1 INSPECTED = 49.
- **Gate-run risk:** the journey spec has gaps in which a wrong build can pass vacuously. These should be fixed before the one gate run is spent.

## Evidence run

- Vitest over the 10 relevant files: 166 passed.
  - Files: `ConsoleDock`, `SystemSpaceView.console-dock`, `console-dock-layout`, `floating-nav.dock`, `floating-nav`, `sighting-log-no-ghost-reasons`, `SightingLog`, and the `VitalsStrip*` files.
- `SpaceStage.interaction.test.tsx`: 36 passed.
- Red manifest: `all 6 test file(s) unchanged since handoff`.
- Tailwind v4 compile of the lane classes (done in scratch). The `bottom-[calc(var(--console-dock-height,3.5rem)+N)]` literals emit valid `calc(var(--console-dock-height,3.5rem) + N)`.
  - `[hidden]:where(:not([hidden="until-found"])) { display:none !important }` is present in the v4 preflight. This corroborates D-1: `hidden` beats the `flex` class.

## Deletion promises (grep, excluding node_modules and .next)

- `sighting-log-open`, `logOpen`, `Open sighting log`, `Close sighting log` and `bottom-[4.5rem]` survive only in:
  - test assertions of their absence;
  - the `console-dock-layout.test.ts` raw-text guard;
  - e2e comments.
- None survive in `SystemSpaceView.tsx`, `SpaceStage.tsx` or `floating-nav.tsx`.
- The floating log panel (`{logOpen && !interior.isLoading ...}`) and its toggle are gone from the diff.
- Nothing else was deleted. The `SightingLog` outer chrome change (floating-card classes to `flex flex-col gap-2 p-2`) is inside the proposal's Impact.

## Acceptance matrix (49)

Path abbreviations:
- CD = `frontend/components/space/ConsoleDock.test.tsx`
- V = `frontend/components/space/SystemSpaceView.console-dock.test.tsx`
- L = `frontend/lib/console-dock-layout.test.ts`
- N = `frontend/components/floating-nav.dock.test.tsx`

| # | Scenario | Verdict | Evidence / why it can fail |
|---|---|---|---|
| 1 | View opens collapsed | PASS | V 2.1 asserts the region carries `hidden` and is not visible, and the Console control is visible. A build with the region open, or with remembered state, fails. |
| 2 | Console expands | PASS | CD 1.1 asserts the region, tablist, panel and collapse control are visible and the open control is hidden. |
| 3 | Collapse returns to strip alone | PASS | CD 1.1, second half. |
| 4 | Reload shows collapsed | PASS | V 2.1 does an expand, then an unmount and remount. The SDET's module-memory mutation was caught. Journey legs 1 and 8 add the real-document half. |
| 5 | Navigate away and back collapsed | PASS (caveat) | V 2.1 uses a `key` remount, there and back. The premise that Next remounts the page per param is design D-2 (read, not exercised). Real system-to-system navigation is not driven anywhere (see J7). |
| 6 | Strip reads same both states | PASS | V 2.2 compares all 5 cells' text and `data-raw` before and after expansion. It is non-vacuous (asserts `fleet_1` and non-empty cells). |
| 7 | Console control not in strip | PASS | V 2.3 asserts every strip interactive element is the chevron or inside its menu, and the strip does not contain the Console control. |
| 8 | Present and expandable in failure states | PASS | V 2.4, three rows: interior failed, own-fleets failed, canvas unavailable. Each asserts the control is visible and then that a click expands. |
| 9 | No live region changes | PASS | V 2.5 snapshots live-region texts outside the panel and asserts `before.length > 0`. A build adding a status span is caught (SDET mutation). |
| 10 | Tab bar lists Log only | PASS | CD 1.2: exactly 1 tab, text `/^Log$/`. |
| 11 | Log tab selected, panel shown | PASS | CD 1.2: `aria-selected`; `aria-controls` equals the visible panel; one tabpanel. |
| 12 | No count in label | PASS | CD 1.2 asserts no digit. V 2.7 uses 3 records plus a cursor and asserts tab text is exactly `Log`. |
| 13 | Log panel holds the log | PASS | V 2.7: rows in order, refresh and load-more all inside the panel, exactly one `sighting-log`. |
| 14 | Loading, empty, failed in panel | PASS | V 2.8, three rows (the failed row asserts Retry). |
| 15 | No read until interior first load | PASS | V 2.11 records zero `useSightings(null)` calls, collapsed and expanded, and asserts no log. |
| 16 | Waiting indication | PASS | V 2.11: `console-panel-waiting` is non-empty and not `Reading the pile`. |
| 17 | Log replaces waiting on answer or failure | PASS | V 2.11, two rows (same view instance, not remounted). |
| 18 | Report link expands a collapsed dock | PASS | V 2.9: expanded, tab selected, log in panel, focus on tab. Tier 4: scan-journey leg 5 (migrated, unrun). |
| 19 | Link does not collapse an expanded dock | PASS | V 2.9 expanded row. A toggling build fails (SDET mutation). |
| 20 | No toggle, no floating log | PASS | V 2.7: no `sighting-log-open`, no named button (including hidden), the log not shown while collapsed, exactly one log and it is inside the panel. Plus the grep above. |
| 21 | Ghost while collapsed highlights, dock stays collapsed | PASS | V 2.10. Caveat: the stage is mocked (`data-highlighted` proxy). The real-stage half is scan-journey cross-highlight (unrun). |
| 22 | Row highlighted when tab next shown | PASS | V 2.10 second half: the row has `data-highlighted="true"`. |
| 23 | Tab-reachable; Enter/Space operate | PASS | CD 1.4: Enter and Space on Console and on collapse, a collapsed walk equal to `[strip-probe, console-dock-open]`, an expanded walk. |
| 24 | Visible focus indicator | **INSPECTED** | CD 1.3 asserts only class tokens. No unit or journey line observes a rendered outline (J8). |
| 25 | Controls expose state | PASS | CD 1.3: `aria-expanded`, `aria-controls` resolving to the region, accessible names. |
| 26 | Tab list controls panel | PASS | CD 1.3: tablist, selected tab, `aria-controls` equals the panel, collapse is not inside the tablist. |
| 27 | Panel exposed as tabpanel named Log | PASS | CD 1.3: `getByRole('tabpanel',{name:'Log'})`. |
| 28 | Tab from Log tab reaches collapse then panel controls | PASS (partial at real log) | CD 1.4 expanded walk with stubs: `[strip, tab, collapse, child-a, child-b]`, each once. V 2.6 covers tab then collapse. The real-log "in reading order, each once" is not walked anywhere (J4). |
| 29 | Expand moves focus to tab | PASS | CD 1.5. |
| 30 | Report link moves focus to tab | PASS | V 2.9, both rows assert `document.activeElement` is the tab. |
| 31 | Collapse returns focus to Console | PASS | CD 1.5, reached by Tab, asserts active is the open control and not body. |
| 32 | Dock controls follow chevron in tab order | PASS | V 2.6, two rows. |
| 33 | Camera controls precede hit targets (dock expanded) | BLOCKED | Closes at journey `:687` (walk stops at first camera or hit target; asserts `camera`). The tier-1 sibling is dock-independent, so it cannot catch a dock mistake. |
| 34 | Dock 220 × 1280 | BLOCKED | `:547-549` |
| 35 | Strip row 56 collapsed and expanded | BLOCKED | `:461` and `:551` |
| 36 | More rows do not change dock height | BLOCKED | `:623`. Precondition unasserted (J2). |
| 37 | Taller content scrolls in the panel | BLOCKED | `:620-621`. Same (J2). |
| 38 | Refresh and first row inside panel at origin | BLOCKED | `:604-605`. Catches a wrong build. |
| 39 | Targets at least 24 px | BLOCKED | `:511-512`, `:556-559`, fold `:817-823`. Hole at J5. |
| 40 | Expanded: nothing covers or is covered | PASS structural (L, V 2.13, N 2.14); geometry BLOCKED | `:648-660`, Retry `:670`. Gaps J1 and J3. |
| 41 | Collapsed: same | PASS structural; geometry BLOCKED | `:480-505`. Gap J1: the Console control is never hit-tested. |
| 42 | Strip cells inside viewport, unoverlapped | BLOCKED | `:673-678`. Catches a wrong build. |
| 43 | Galaxy-route nav stays at 72 px | PASS structural (N 2.15); 72 px BLOCKED | `:787`. Catches a leaked height (236 against 72) because the dock was expanded before leaving. |
| 44-49 | MODIFIED Vitals Strip, 6 scenarios | PASS | Existing tests: `VitalsStrip.test.tsx` 107, 122, 134 and 145; `SystemSpaceView.test.tsx` 1168, 1184 and 1199; `VitalsStripFleetCell.test.tsx` 68. All green, and the dock rows V 2.2 and 2.4 hold them with the dock present. |

**Counts: PASS 37 (#1-23, 25-32, 44-49) / FAIL 0 / BLOCKED 11 (#33-43; #40, #41 and #43 also have PASS structural halves) / INSPECTED 1 (#24).**

## Journey spec gaps (`frontend/e2e/tests/console-dock-journey.spec.ts`)

Every must-PASS leg that is not a gap below has a hard assertion. The `[journey-rect]` and `[journey-leg-data]` prints are all informational next to hard assertions.

**J1 (`:190-195`, `:491-495`, `:657-661`). Console control never hit-tested; `checked` never asserted.**
- `hitTestControls` searches only descendants of the surface. For the `console-dock-open` surface (a lone button) it finds 0 controls, so `blocked` is `[]` and the surface passes vacuously.
- The spec says every control a surface carries is activatable, and the Console control is itself a named surface.
- No surface asserts `checked > 0`. A column or card with all controls skipped would pass.
- It also silently caps at 40 (`:194`) and silently skips zero-size controls (`:199-203`).
- `:220` accepts `hit.contains(node)` (an ancestor), which passes a control with `pointer-events:none`.
- Fix: include the surface root itself, assert `checked >= 1`, assert `count <= 40`, and require `node.contains(hit)` for leaf controls.

**J2 (`:608-624`, #36 and #37). Scroll precondition not asserted.**
- `dims` is only logged (`:617`). Nothing asserts `scrollHeight > clientHeight` or `scrollTop > 0`.
- If the rows fit, "last row inside panel and viewport" is trivially true.
- My estimate is about 128 px panel against about 220 px of content, so it probably overflows. But nothing guards it.
- Fix: assert both, and that `rows.last()` is the log's last focusable (no footer).

**J3 (`:546-551`, #2 and #34). Dock top is measured as the dock element, not the strip.**
- The scenario says "from the top of the strip's row to the foot of the viewport".
- Add `strip.y ≈ dock.y` (the dock's top is the strip's top).
- Nothing asserts the tab bar and panel lie beneath the strip row (#2 "shown beneath the strip's row"). Add `region.y >= strip.y + strip.height` and panel inside dock.

**J4 (`:691-698`, #28). THEN half-asserted at the real log.**
- Only the first stop after collapse (Refresh) is asserted.
- "The log's controls in reading order, each once" is never walked: the 3 rows are never reached.
- Fix: keep pressing Tab and compare the sequence to the panel's focusables in DOM order until focus leaves the panel.

**J5 (`:556-559`, `:817-823`). The targets-24 fold has a hole.**
- It records "expanded half measured" only by the absence of failures.
- It checks only `NOT REACHED`. If leg 7 FAILED before `:556` (for example at `:545`), `targets-24` reports PASSED with the Log tab and collapse control never measured.
- The run still fails overall, but the leg ledger is wrong. Use a `measuredExpanded` flag.

**J6 (`:762-770`, #19 and #30 tier 4). Silent skip.**
- If the report no longer carries its link on the second look, the code only logs, and the leg ends PASSED with the "does not collapse an expanded dock" half never asserted.
- It should return `{ untested }`.
- More broadly, `report-link` may end UNTESTED (`:117`), which leaves #19 and #30 with tier-1 only.
- scan-journey leg 5 asserts expand and selected but not focus. Add `toBeFocused` on `console-tab-log` after the report-link click in scan-journey leg 5. The fixture is already proven there.

**J7 (`:805-810`, #5). Leg 16 is unconditionally UNTESTED although it looks arrangeable.**
- The home interior is captured (`home`), and a client-side navigation to another system id could be driven. Options: `window.next.router.push` (unverified), or a drill-in to another selected system.
- Today the system-to-system remount premise (D-2) is never exercised at tier 4. Leg 15 covers galaxy to system only.
- Because the leg is in `MAY_BE_UNTESTED`, it cannot fail.

**J8 (#24). Nothing observes a rendered focus indicator.**
- Add to leg 7: after keyboard focus on each of the 3 controls, assert the computed `outline-style` is not `none` and `outline-width >= 2px`.

**J9. Weak or informational lines.**
- The `[journey-leg-data]` root `--console-dock-height` prints at `:443`, `:552` and `:780` are never asserted. Harmless, because the foot assertion carries the leak check.
- Leg 6 walks 90 Tabs and asserts only the absence of the tab and collapse control. That is fine for #23.

## Migrated e2e specs (`git diff`)

- **`scan-journey.spec.ts`:** legs 5, close, canvas-unavailable and mount-path are strengthened. Preconditions are added, selectors are correct, and each former `sighting-log-open` use maps to the report link, the Console control or the collapse control as tasks 3.2 says.
- **`scan-lane-transit-fizzle.spec.ts`:** a selector change only. Assertions are unchanged and the precondition (fresh mount, collapsed) holds.
- **`vitals-strip-journey.spec.ts` and `burn-cost-overlay-journey.spec.ts`:** comment-only edits. See M3 for a risk I do not accept as cleared.
- **`scan-fixtures.ts`:** comment-only.

**M1 (medium). The dropped row-then-ghost direction is a real weakening.**
- The `scan-journey` cross-highlight test was changed to ghost-first. Ghost-first is correct (the old order made ghost activation vacuous).
- Dropping row to ghost removes the only real-browser evidence of the `sighting-log` scenario "Selecting a row highlights its ghost".
- The SDET's claim that tier 1 holds it at the view is overstated:
  - `SightingLog.test.tsx:205` asserts only `onHighlightRow(id)`.
  - `sighting-log-no-ghost-reasons:274` asserts only the row's own highlight.
  - No view test asserts the stage's ghost receives it.
- A non-vacuous restore is cheap: reload (highlight null, collapsed), expand, click the row, assert the ghost's `data-highlighted`. Or click a second seeded record's row and assert ghost B, not ghost A.

**M2 (low). New preconditions hard-code the content-unmounted behaviour.**
- `sighting-log` `toHaveCount(0)` is in scan-journey leg 5 and in the mount-path reload.
- RULING 15 gives content-stays-mounted to the next link, which will break these.
- The tier-1 tests deliberately use a "not shown" predicate. Use `not.toBeVisible()` or `toBeHidden()` instead.

**M3 (medium risk, unrunnable here). The "no assertion depends on a moved edge" claim is wrong for one helper.**
- `vitals-strip-journey` `activatableControls` (`:227-255`) hit-tests controls whose centres lie inside the panel's own box, without scrolling.
- The command column's visible foot moved from y 648 to y 580 (564 px tall). Panel controls with centres in about 580-648 are now clipped by the column. `elementFromPoint` returns the canvas, which is not an ancestor, so the helper reports "covered".
- The SDET's "would only matter above 648 px" analysis covers panel boxes, not clipping.
- The burn-cost leg uses boxes only, so it is safe.
- Fix: scroll into view as the new `hitTestControls` does, or confirm the stacked panels' controls end above y 580.

## Exploratory and diff-level findings

- No scope overreach: no Escape, no content-mounted, no no-read-on-show, no settle re-read. The unmounted-while-collapsed log matches the proposal.
- Every scenario has a production path. Files in the diff are all within the proposal's Impact. The only deleted behaviour is the floating panel, the toggle and `logOpen`.
- `openDockOn(_tab)` ignores its argument. That is fine for one tab, but remember to use it when link 3 adds tabs.
- Cosmetic (low): `SystemSpaceView.tsx` has a stray double blank line near the log content, and the `strip={ <VitalsStrip ...` JSX is not re-indented. The lint passes.
- Focus restoration on collapse uses `regionRef.contains(document.activeElement)`. A mouse click on the collapse control in browsers that do not focus buttons on click skips the focus move. That is harmless and outside the spec (keyboard).
- Geometry sanity by static math:
  - the cluster is one 32 px row, a 28 px Console control at 64-92 px, the cluster at 100-132 px, and the column foot at 140 px;
  - expanded: cluster 264-296 px, column foot 304 px;
  - the panel is about 128 px, so 3 seeded rows should overflow and exercise the scroll leg.

  All of this is unverified until the journey runs.
- Spec gaps: none new. #24 and #28 are weakly evidenced by design (jsdom paints nothing).
- `tasks.md`: 31 ticked, 9 unticked (5.1-5.9), as claimed. No ticked task contradicts a scenario. Tasks 3.2-3.5 are ticked and judged above (M1-M3 are findings against 3.2 and 3.4).

## Return batch (for the SDET)

1. J1: Console control and `checked > 0` in the hit-test.
2. J2: assert the scroll precondition.
3. J3: `strip.y ≈ dock.y` and tab bar and panel beneath the strip.
4. J4: walk the real log's controls.
5. J5: `measuredExpanded` flag.
6. J6: no silent skip. Add `toBeFocused` to scan-journey leg 5.
7. J7: arrange system-to-system navigation.
8. J8: assert a computed focus outline.
9. M1: restore row to ghost on a fresh state.
10. M2: swap `toHaveCount(0)` for hidden or not-visible.
11. M3: scroll-into-view or confirm in `activatableControls`.

**RETURN TO SDET** (then SHIP-pending-journey)

---

## Orchestrator dispositions, 2026-10-05

No production finding; no developer round. One batched round to the SDET,
before the gate run is spent. All eleven items are ACCEPTED, with two bounds:

- **J7** — arrange the system-to-system leg only through a path a player has
  (the app's own controls). No `window.next.router.push` or other reach into
  framework internals: a leg driven that way proves a navigation no player can
  make. If no such path exists for a one-hull corporation without a jump, the
  leg stays UNTESTED with that reason stated and tier 1's keyed remount named
  as its only cover.
- **M3** — `vitals-strip-journey.spec.ts`'s helper is test code of an archived
  change; the SDET may make it scroll a control into view within its surface
  before hit-testing (the same rule this change's own scenario states for a
  scrolling surface). It may not relax what the leg asserts.

M1's restored row-to-ghost direction is evidence for a `sighting-log` scenario
this change re-homes, so it stays in `scan-journey.spec.ts`.

STATUS: COMPLETE

---

# add-console-dock — QA closing pass (after the archive-gate journey)

Appended verbatim by the orchestrator from QA's hand-back, 2026-10-05.

Read-only. I ran no suite and booted nothing. I read the spec source at `75bac5a` (HEAD, with no working-tree diff in `frontend/e2e`), the whole run-2 log through line 440 plus its tail (lines 441-527), and the diffs.

## Verdict: SHIP

The matrix closes at 49 PASS. Two of those rows (#5 and #19) have a tier-4 half that is UNTESTED, covered at tier 1 only. Both are acceptable (see § 2).

## 1. The eleven returned items, checked in the spec source

Line numbers refer to `frontend/e2e/tests/console-dock-journey.spec.ts` at `75bac5a`. The fixes for J1-J8 and M1-M3 were already in `bcf7719`. The revision round (`bcf7719` to `75bac5a`) touched only the hit-test helper (J1-related) and the diagnostics.

| Item | Fix is in the source | Would it fail the wrong build? | Run-2 evidence it ran |
|---|---|---|---|
| J1 | `hitTestControls` (:201-267) includes the surface root when it is a control with `pointer-events` not `none`. It asserts `total <= MAX_CONTROLS` (:215, no silent cap). It requires `node.contains(hit)`, never an ancestor (:246). Callers assert `checked >= 1` (:536, :736). | Yes. The "Console" button is now hit-tested. A control with `pointer-events:none` no longer passes via an ancestor. | Log 249-256 and 316-319. Collapsed: `console-dock-open: 1 control(s) hit-tested, 0 blocked`. Camera cluster 4 in both states. |
| J2 | :681-682 assert `scrollHeight > clientHeight` and `scrollTop > 0`. :692 asserts nothing focusable follows the last row. | Yes. Content that fits the panel fails the precondition. | Log 298: `scrollHeight 232, clientHeight 127, scrollTop 105`. |
| J3 | :598 asserts `\|dock.y - strip.y\| <= 1`. :602-606 assert region, tab bar and panel start at or below the strip's foot and lie inside the dock. | Yes. | Log 275-279: dock y 500 and strip y 500; region y 556; tab y 563; panel y 593. |
| J4 | **See below.** | Yes. | Log 327-329. |
| J5 | `measuredExpanded` is set at :615. The fold at :926 turns `targets-24` FAILED if it is unset. | Yes. A leg 7 that dies before :615 can no longer leave `targets-24` PASSED. | Log 282-283: both expanded controls measured. `targets-24` PASSED at 360. |
| J6 | :873-877 return `{untested}` instead of silently passing. `scan-journey.spec.ts:140` adds `toBeFocused` on `console-tab-log` after the report link. | Yes. | `scan-journey.spec.ts:42` PASSED (log 405). `report-link` honestly logs UNTESTED (335). |
| J7 | :912-917 are UNTESTED with the stated reason. They use no router internals, as the orchestrator bounded it. | Not applicable. It stays UNTESTED. | Log 347. |
| J8 | `expectFocusOutline` (:306-317) asserts outline-style is not `none` and width is at least 2. It is called on three controls (:589, :621, :628). | Yes. | Log 274, 284, 285: `{"style":"solid","width":2}` on the Log tab, the collapse control and "Console". |
| M1 | `scan-journey.spec.ts` ~355-380. A reload clears the highlight and collapses the dock. It asserts the ghost is not highlighted. The test expands the dock and asserts the row is not highlighted. It clicks the row and asserts the ghost has `data-highlighted=true`. | Yes. It is non-vacuous. | `scan-journey.spec.ts:298` PASSED (log 411). |
| M2 | `toBeHidden()` replaces `toHaveCount(0)` at lines 132, 164, 241, 293. | Not applicable. | Same passing run. |
| M3 | `vitals-strip-journey.spec.ts` `activatableControls` now runs `el.scrollIntoView({block:'nearest'})` inside the surface before the hit test. The assertions are unchanged. | Yes. | `vitals-strip-journey.spec.ts:263` PASSED (log 477). The hit-tested counts are in its lines 463-467. |

**J4 specifically.** The SDET's remark that the log records only the first stop is true of that log line only. It does not mean the real log's controls went unwalked.

- The source at :776-801 does the following:
  - It reads the panel's visible, enabled focusables in DOM order.
  - It starts `seen` at the post-collapse stop (Refresh).
  - It presses Tab `expected.length - 1` more times.
  - It asserts `seen` equals `expected` in order, each once (:796).
  - It presses Tab once more and asserts focus has left the panel (:801).
- Log line 327 is the #33 walk. It stops at its first stop, `space-camera-controls`, which is the thing #33 needs.
- Log 328 shows the post-collapse Tab landing on `Refresh sighting log`.
- Log 329 shows the expected sequence: Refresh, then three `sighting-row-*`.
- Line 329 is printed before the walking loop. The leg then logged PASSED at 330. Any failed `toEqual` or `leftPanel` check would have thrown and logged FAILED instead. So the 3-row walk and the leave-panel check ran and held.
- The sequence actually seen is not printed. Its pass is inferred from the PASSED leg. That is acceptable, but it is not a logged figure.

## 2. The closed matrix, from the run-2 log itself

I opened each cited log line.

| # | Scenario | Verdict | Log line and measured figure |
|---|---|---|---|
| 33 | Camera controls precede hit targets (dock expanded) | PASS | 327 and 330. The walk from the document start stops at `space-camera-controls` after 1 stop. A build with a hit target first would stop on `body-hit-*` with `camera=false` and fail :764. The collapsed walk at 272 shows the same order. |
| 34 | Expanded dock 220 × 1280 | PASS | 275: dock `x0 y500 w1280 h220`, foot 0. 280: `13.75rem`. |
| 35 | Strip row 56, both states | PASS | 243-244: h 56 collapsed. 276: h 56 expanded at y 500. |
| 36 | More rows do not change dock height | PASS | 301: dock h 220 after the scroll, with 232 against 127 shown at 298. |
| 37 | Taller content scrolls in the panel | PASS | 298-299: `scrollTop 105`; last row foot 8.5 above the viewport foot, inside the panel. |
| 38 | Refresh and first row inside panel at origin | PASS | 293-295: panel foot 0; Refresh y 601, foot 98; first row y 630, foot 30.5. |
| 39 | Targets at least 24 px | PASS | 249 and 283: "Console" 64.4×28. 278 and 282: Log tab 35.9×24; collapse 24×24. Two figures sit exactly on the 24 boundary, so a 1 px regression fails. |
| 40 | Expanded: nothing covers or is covered | PASS | 309-326: four surfaces hit-tested, 0 blocked (5, 1, 4 and 2 controls). Retry foot 249. Five strip cells inside the viewport. |
| 41 | Collapsed: same | PASS | 245-258: five surfaces including "Console" hit-tested, 0 blocked. This closes J1's hole. |
| 42 | Strip cells inside the viewport, unoverlapped | PASS | 321-325: x 16 to 1264; feet 173 to 183.3. The overlap assertions at :755 ran inside the PASSED leg 326. |
| 43 | Galaxy-route nav at 72 px | PASS | 340-343: root property `13.75rem` before leaving, `""` after; nav foot 72. A leaked height would read 236. |
| 24 | Visible focus indicator | PASS (was INSPECTED) | 274, 284, 285: computed `solid`, 2 px on three controls in a real browser. The caveat: the colour and contrast were not read. The scenario asks that an indicator exist, so this is acceptable. |

**The two UNTESTED legs, and what they leave at tier 1 only:**

- **`report-link` (log 335)**
  - "The report's link does not collapse an expanded dock" (#19) is left with tier-1 evidence only.
  - The tier-1 evidence is `SystemSpaceView.console-dock.test.tsx` 2.9, the expanded row. The SDET's earlier mutation showed that a toggling build fails it.
  - That is acceptable. The behaviour is a pure state transition (expand, not toggle) in the real `SystemSpaceView` with only the stage mocked. Tier 4 cannot arrange it reliably, because the random spawn serves no scan target in range, as in run 1.
  - The expand and focus halves have tier-4 evidence: `scan-journey.spec.ts:42` PASSED at log 405, with `toBeFocused` on the Log tab (source line 140). That covers #18 and #30.
  - I read the assertions from the source and the PASSED line. The log has no per-leg lines for scan-journey.
- **`other-system-collapsed` (log 347)**
  - The cross-system "collapsed after navigating to another system and back" half of #5 is tier 1 only.
  - The tier-1 evidence is the keyed-remount test, V 2.1.
  - What it does not exercise is D-2, the premise that Next remounts the page when the route parameter changes. That premise is read, not run.
  - The real galaxy to system client navigation did pass (`return-collapsed`, log 346).
  - That is acceptable with a stated residual risk. There is no player path to a second system for a one-hull corporation. The orchestrator ruled that router internals must not be reached.

**Final counts: 49 PASS / 0 FAIL / 0 BLOCKED / 0 UNTESTED rows.**

- That is the 37 earlier PASS rows (#1-23, 25-32, 44-49), plus #24 and #33-43.
- Two rows, #5 and #19, each carry a tier-4 half that is UNTESTED (see above).
- Tier 1 was run by the predecessor (166 passed plus 36).
- The tier-4 verdicts come from the log.

## 3. Did the revision round weaken any assertion?

I read `git diff bcf7719 75bac5a` in full for `frontend/e2e`. **No assertion was weakened.**

- **`rootIsControl` change.** The root now counts as a control only when its computed `pointer-events` is not `none`.
  - This removes one wrongly included target, the `pointer-events-none` camera wrapper. It could never be its own hit target.
  - The four children are still each hit-tested. Counts of 4 appear in log 254 and 318.
  - `checked >= 1` and `blocked toEqual([])` are untouched.
  - A genuinely covered camera button still lands in `blocked`.
  - A residual known gap: a build that made the wrapper `pointer-events-auto` is not caught. It was not caught before either.
- **Diagnostic lines only.** The added `ident` field and the BLOCKED log lines print more.
- **`committed-selection-journey.spec.ts`.** The body is read and logged before a 3xx-or-higher answer is published, and 2xx takes the original path. No assert, wait or ordering changed.
- **Pre-existing limitation, not introduced here.** `vitals-strip-journey`'s `activatableControls` still accepts `hit.contains(el)`, an ancestor. I flag it as a note only. It is archived test code, and it was not relaxed by this change.

## 4. The one red, `slice.spec.ts:83`

**It touches none of this change's 49 scenarios.**

- It failed at :199 (log 441+: `Expected: > 1000, Received: 1000`), a 30 s poll after a sale.
- RULING 23 reports a backend 409 `market: price changed since your quote`, the filed `defect-slice-sell-price-changed-409.md` signature. I did not open the backend log myself. I accept the journey record's reading, which is internally consistent with the failing line.
- The sell path is not in this change's diff. `git diff --stat b52d412 75bac5a` over `backend`, `frontend/hooks`, `frontend/lib/services` and `slice.spec.ts` is empty. The `frontend/components` stat lists only `floating-nav*`, `space/ConsoleDock*`, `SightingLog*`, `SpaceStage.tsx`, `SystemSpaceView*` and their tests. None of those is on the market or sell path.
- The scenarios about the command column concern reachability and geometry. Both are hit-tested in both dock states (log 252 and 316).
- It passed in run 1 on `bcf7719`. It is not a dock regression.

## Non-blocking observations (no action required)

- The `tab-walk-collapsed` walk is long (90 stops) but bounded, and wraps through `(body)`.
- The seen-sequence of the real-log walk is not logged. Consider printing it in a future run.
- The focus-outline check proves an outline exists, not that it is legible (contrast unread).
- `committed-selection-journey:407` passed, and its new `[journey-http]` capture logged nothing. The 409 body from run 1 remains unknown. That is the SDET's filed candidate and not this change's.

**SHIP**

STATUS: COMPLETE

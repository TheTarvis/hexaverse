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

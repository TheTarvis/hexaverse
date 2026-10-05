# add-console-dock — red coverage (SDET, red phase, Phase 2 step 8)

Scope: tasks 1.1-1.5, 2.1-2.15, 3.1 (vitest, tier 1). No Playwright written (3.2-3.5, 5.2 are later). Frontend only.

Test files (the manifest set):

| File | Tasks | State |
| --- | --- | --- |
| `frontend/components/space/ConsoleDock.test.tsx` | 1.1-1.5 | new |
| `frontend/components/space/SystemSpaceView.console-dock.test.tsx` | 2.1-2.11, 2.13 | new |
| `frontend/lib/console-dock-layout.test.ts` | 2.12 | new |
| `frontend/components/floating-nav.dock.test.tsx` | 2.14, 2.15 | new |
| `frontend/components/space/SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx` | 3.1 | migrated (one line: helper clicks `console-dock-open`; assertions untouched) |
| `frontend/components/space/SightingLog.test.tsx` | 3.1 | header comment only (drops `sighting-log-open` from the testid contract); no test changed |

Names: every `it` title carries the scenario title(s) it closes, verbatim, in the form `Scenario: <title>`; parenthesised text after a title names the row.

## 1. Coverage table — all 49 scenarios

Status vocabulary: `compile-red` = fails in the real tree at import (`./ConsoleDock`, `@/lib/console-dock-layout` missing); the red for its own reason was verified in scratch copies (section 2). `assertion-red` = fails in the real tree on an assertion. `already-green` = existing test, green today.

### ADDED — The Console Dock Extends Beneath the Strip and Is Collapsed on Every Mount of the View

| # | Scenario | Test (file : name) | Level | Status |
| --- | --- | --- | --- | --- |
| 1 | The view opens with the dock collapsed | `SystemSpaceView.console-dock.test.tsx` : task 2.1 > Scenario: The view opens with the dock collapsed | unit (view, mocked reads) | compile-red |
| 2 | Activating the Console control expands the dock | `ConsoleDock.test.tsx` : task 1.1 > Scenario: Activating the Console control expands the dock / … | unit (shell) | compile-red |
| 3 | Activating the collapse control returns the dock to the strip alone | same test as #2 (one arrangement group, task 1.1) | unit (shell) | compile-red |
| 4 | A reload shows the dock collapsed | `SystemSpaceView.console-dock.test.tsx` : task 2.1 > Scenario: A reload shows the dock collapsed (a remount) | unit (view) | compile-red |
| 5 | Navigating to another system and back shows the dock collapsed | same file : task 2.1 > Scenario: Navigating to another system and back shows the dock collapsed (a `key` remount, there and back) | unit (view) | compile-red |
| 6 | The strip reads the same in both states | same file : task 2.2 > Scenario: The strip reads the same in both states | unit (view) | compile-red |
| 7 | The Console control is not part of the strip | same file : task 2.3 > Scenario: The Console control is not part of the strip | unit (view) | compile-red |
| 8 | The dock is present and expandable in the strip's failure states | same file : task 2.4 > Scenario: The dock is present and expandable in the strip's failure states (3 rows: interior failed / own-fleets failed / canvas unavailable) | unit (view) | compile-red |
| 9 | Expanding and collapsing change no live region | same file : task 2.5 > Scenario: Expanding and collapsing change no live region | unit (view) | compile-red; guard, see section 3 |

### ADDED — The Dock Carries These Tabs

| # | Scenario | Test | Level | Status |
| --- | --- | --- | --- | --- |
| 10 | The tab bar lists the Log tab and no other | `ConsoleDock.test.tsx` : task 1.2 > Scenario: The tab bar lists the Log tab and no other / … | unit (shell) | compile-red |
| 11 | The Log tab is selected and its panel is shown | same test as #10 | unit (shell) | compile-red |
| 12 | The Log tab's label carries no count however many rows are listed | `ConsoleDock.test.tsx` task 1.2 (standalone half) + `SystemSpaceView.console-dock.test.tsx` task 2.7 (view half: three records, non-empty cursor, tab name exactly `Log`) | unit | compile-red |

### ADDED — The Log Tab Is the Sighting Log's Home on This View

| # | Scenario | Test | Level | Status |
| --- | --- | --- | --- | --- |
| 13 | The expanded dock's Log panel holds the log | `SystemSpaceView.console-dock.test.tsx` : task 2.7 > Scenario: The expanded dock's Log panel holds the log / … | unit (view) | compile-red |
| 14 | The log's loading, empty and failed states appear in the panel | same file : task 2.8 > … (loading / empty / failed rows) | unit (view) | compile-red |
| 15 | The log reads nothing until the interior read's first load has finished | same file : task 2.11 > Scenario: The log reads nothing until the interior read's first load has finished / … (zero recorded `useSightings(null)` calls, collapsed and expanded) | unit (view) | compile-red |
| 16 | The panel shows a waiting indication while the interior read's first load is in flight | same test as #15 (`console-panel-waiting`, text not containing `Reading the pile`) | unit (view) | compile-red |
| 17 | The panel shows the log once the interior read's first load has answered or failed | same file : task 2.11 > … (answers) and … (fails) | unit (view) | compile-red |
| 18 | A settled sweep's report link expands a collapsed dock to the Log tab | same file : task 2.9 > Scenario: A settled sweep's report link expands a collapsed dock to the Log tab / … | unit (view) | compile-red (expansion half red after 4.2; focus half after 4.3) |
| 19 | A settled sweep's report link does not collapse an expanded dock | same file : task 2.9 > Scenario: A settled sweep's report link does not collapse an expanded dock / … | unit (view) | compile-red |
| 20 | No standalone toggle and no floating log remain | same file : task 2.7 (same test as #13: no `sighting-log-open`, no button named exactly `Open sighting log` / `Close sighting log` incl. hidden, log-not-shown predicate collapsed, one `sighting-log` inside the panel expanded) | unit (view) | compile-red |
| 21 | Activating a ghost while the dock is collapsed highlights the ghost and leaves the dock collapsed | same file : task 2.10 > Scenario: Activating a ghost while the dock is collapsed … / … | unit (view) | compile-red |
| 22 | The row for an activated ghost is highlighted when the tab is next shown | same test as #21 (second half) | unit (view) | compile-red |

### ADDED — The Dock Is Keyboard-Operable

| # | Scenario | Test | Level | Status |
| --- | --- | --- | --- | --- |
| 23 | Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard | `ConsoleDock.test.tsx` : task 1.4 > six tests (Enter/Space on Console, Enter/Space on collapse, collapsed Tab walk `[strip-probe, console-dock-open]`, expanded walk `[strip-probe, tab, collapse, child-a, child-b]`) | unit (shell) | compile-red |
| 24 | Each dock control shows a visible focus indicator | `ConsoleDock.test.tsx` : task 1.3 > Scenario: Each dock control shows a visible focus indicator (class tokens `focus-visible:outline-2`, `min-h-6`, `min-w-6` on all three controls, both states). jsdom paints no focus ring; the rendered indicator is not asserted at tier 1 | unit (shell) | compile-red |
| 25 | The expand and collapse controls expose their state | `ConsoleDock.test.tsx` : task 1.3 > Scenario: The expand and collapse controls expose their state (both states) | unit (shell) | compile-red |
| 26 | The tab bar is a tab list controlling the panel | same file : task 1.3 > Scenario: The tab bar is a tab list controlling the panel | unit (shell) | compile-red |
| 27 | The shown panel is exposed as the Log tab's panel and has an accessible name | same file : task 1.3 > Scenario: The shown panel is exposed as the Log tab's panel and has an accessible name | unit (shell) | compile-red |
| 28 | Tab from the Log tab reaches the collapse control and then the panel's controls | same file : task 1.4 > Scenario: Tab from the Log tab reaches the collapse control and then the panel's controls (shell); also task 1.3 last test (interactive set of the expanded region is exactly tab, collapse, child controls) | unit (shell) | compile-red |
| 29 | Expanding moves keyboard focus to the selected tab | same file : task 1.5 > Scenario: Expanding moves keyboard focus to the selected tab | unit (shell) | compile-red; own-reason red after 4.1, green at 4.3 |
| 30 | The report's link to the log moves focus to the Log tab | `SystemSpaceView.console-dock.test.tsx` : task 2.9 (both rows assert `document.activeElement` is `console-tab-log`) | unit (view) | compile-red; own-reason red after 4.2, green at 4.3 |
| 31 | Collapsing with the collapse control moves focus to the Console control | `ConsoleDock.test.tsx` : task 1.5 > Scenario: Collapsing with the collapse control moves focus to the Console control | unit (shell) | compile-red; own-reason red after 4.1, green at 4.3 |
| 32 | The dock's controls follow the strip's chevron in the tab order | `SystemSpaceView.console-dock.test.tsx` : task 2.6 > two tests (collapsed: chevron -> Console; expanded: chevron -> tab -> collapse) | unit (view) | compile-red |
| 33 | The camera controls still precede the scene's hit targets with the dock expanded | — | — | `Playwright, deferred` to journey leg 12 `tab-walk-expanded`. Tier-1 cover is the pre-existing, unedited `SpaceStage.interaction.test.tsx` "keyboard tab order" describe (stage is mocked in the view file, as tasks.md 2.6 says) |

### ADDED — The Dock Has One Fixed Height and Nothing Covers It or Is Covered by It

| # | Scenario | Test | Level | Status |
| --- | --- | --- | --- | --- |
| 34 | The expanded dock is 220 CSS pixels tall and full width | — (jsdom lays nothing out) | — | `Playwright, deferred`: journey leg 7 `expand-collapse-keyboard`. Tier-1 structural sibling: the published `13.75rem` (2.13, 2.14) |
| 35 | The strip's row is 56 CSS pixels tall collapsed and expanded | — | — | `Playwright, deferred`: journey legs 3 `strip-row-56` and 7 |
| 36 | Rows beyond what the panel area shows do not change the dock's height | — | — | `Playwright, deferred`: journey leg 10 `scroll-leg` (dock still 220 px with three records in a one-and-a-half-row panel) |
| 37 | Content taller than the panel area scrolls within it | — | — | `Playwright, deferred`: journey leg 10 `scroll-leg`. Tier-1 structural sibling: the panel carries `overflow-y-auto` (1.3 last test) |
| 38 | The refresh control and the first row are in view without scrolling the panel | — | — | `Playwright, deferred`: journey leg 9 `log-panel-origin` |
| 39 | The dock's pointer targets are at least 24 CSS pixels square | — for the pixel figure | — | `Playwright, deferred`: journey leg 5 `targets-24`. Tier-1 structural sibling: `min-h-6` / `min-w-6` on the three controls (task 1.3 focus-indicator test) |
| 40 | No floating surface is covered by or covers the expanded dock | structural half: `console-dock-layout.test.ts` task 2.12 (4 tests), `SystemSpaceView.console-dock.test.tsx` task 2.13, `floating-nav.dock.test.tsx` task 2.14. Geometry half: none at tier 1 | unit (source text + view) | compile-red (structural); geometry half `Playwright, deferred`: journey leg 11 `geometry-expanded` |
| 41 | No floating surface is covered by or covers the collapsed dock | structural half: same tests as #40 (2.12, 2.13 collapsed `3.5rem`, 2.14/2.15 lane class). Geometry half: none at tier 1 | unit | compile-red (structural); geometry half `Playwright, deferred`: journey leg 4 `geometry-collapsed` |
| 42 | Every strip cell is inside the viewport with the dock expanded | — for inside-viewport / unoverlapped; tier-1 sibling: task 2.2 shows all five cells rendered and non-empty in both states | — | `Playwright, deferred`: journey leg 11 `geometry-expanded` |
| 43 | The floating navigation stays where it is on the galaxy route | `floating-nav.dock.test.tsx` : task 2.15 > Scenario: The floating navigation stays where it is on the galaxy route (root property `''`, same imported lane class). The 72 px figure and the in-app navigation from an expanded dock are not tier-1-assertable | unit | compile-red (structural); 72 px / leak-on-navigation half `Playwright, deferred`: journey leg 14 `galaxy-nav-72` |

### MODIFIED — The Vitals Strip Is Present on Every Render of the System Space View

The six scenarios keep their live text unchanged (only the requirement's "across the foot" prose changed), so no new test is needed to hold them; the dock's own interaction with them is held by tasks 2.2 and 2.4.

| # | Scenario | Test | Level | Status |
| --- | --- | --- | --- | --- |
| 44 | The strip renders with every read resolved | `VitalsStrip.test.tsx:107`; `SystemSpaceView.test.tsx:1168`; new `SystemSpaceView.console-dock.test.tsx` task 2.2 (five cells, both states) | unit | already-green (existing); the new 2.2 test is compile-red |
| 45 | The strip survives a failed interior read | `SystemSpaceView.test.tsx:1184`; new task 2.4 interior row | unit | already-green (existing); new row compile-red |
| 46 | The strip survives a failed own-fleets read | `VitalsStrip.test.tsx:122`; new task 2.4 own-fleets row | unit | already-green (existing); new row compile-red |
| 47 | The strip survives an unavailable renderer | `SystemSpaceView.test.tsx:1199`; new task 2.4 canvas row | unit | already-green (existing); new row compile-red |
| 48 | With no acting fleet the fleet-scoped figures read absent and the chevron stays | `VitalsStrip.test.tsx:134`; `VitalsStripFleetCell.test.tsx:68` | unit | already-green (existing, not touched) |
| 49 | A requester owning no fleet at all still gets the strip | existing `VitalsStrip.test.tsx` / `VitalsStripFleetCell.test.tsx` empty-menu tests (not touched) | unit | already-green (existing, not touched) |

### Tasks 3.1 (migration)

`SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx`: the helper `openLogAndSelect` now clicks `console-dock-open`. Its four tests are `assertion-red` in the real tree today ("Unable to find an element by: [data-testid="console-dock-open"]", all four) and go green at 4.2. Content scenario: "The expanded dock's Log panel holds the log".

### Counts (the 49 scenarios)

| Status | Scenarios |
| --- | --- |
| `compile-red` (new tests; own-reason red verified in scratch) | 35 (#1-#32 = 32, plus the structural halves of #40, #41, #43) |
| `Playwright, deferred` (journey legs named above), nothing at tier 1 | 8 (#33-#39, #42) |
| `Playwright, deferred` for the geometry half only (the structural half is in the compile-red row) | 3 (#40, #41, #43; counted once, under compile-red) |
| `already-green` (MODIFIED; existing) | 6 (#44-#49) |
| `assertion-red` | 0 scenarios exclusively; the four migrated 3.1 tests are assertion-red and cover #13's placement |
| `reasoned-not-automated` | 0 |

Exact: #1-#32 compile-red (32); #33-#39 and #42 deferred only (8); #40, #41, #43 compile-red structural + deferred geometry (3); #44-#49 already-green (6). 32 + 8 + 3 + 6 = 49.

## 2. Red-for-the-right-reason evidence

**Real tree** (`cd frontend && npx vitest run <the five files plus SightingLog.test.tsx>`, tier 1): 
- `ConsoleDock.test.tsx`, `SystemSpaceView.console-dock.test.tsx`, `console-dock-layout.test.ts`, `floating-nav.dock.test.tsx`: `Failed to resolve import "./ConsoleDock"` / `"@/lib/console-dock-layout"` — compile-red as the contract's 5.7 predicts.
- 3.1 file: 4 failed, all `Unable to find an element by: [data-testid="console-dock-open"]`.
- `SightingLog.test.tsx`: 21 passed (comment-only edit).

**Scratch copy** (`scratchpad/ref`, a copy of `frontend/` without `e2e`, `node_modules` linked; nothing written in the working tree), a minimal reference build following the contract (layout module, `ConsoleDock`, view wiring, lanes, focus):

- Reference build: 50 tests green across the five files plus `floating-nav.test.tsx` (proves every test is satisfiable by a contract-shaped build, so none is vacuously red).
- **Stage 1** (shell exists without the focus effects; view, `SpaceStage`, `floating-nav` unwired = the tree after 4.1): 32 failed / 15 passed. Messages: 21 x `Unable to find ... console-dock-open`, 1 x `console-panel-log`, 2 x `toHaveClass(bottom-[calc(...)+1rem])` (2.14, 2.15), 1 x `expected '' to be '3.5rem'` (2.13), 1 x `expected ... to contain 'CONSOLE_DOCK_LANE_CAMERA'`, 1 x `still carries bottom-[4.5rem]` (2.12 item 3), and the 1.5 focus asserts. The 15 greens are 1.1-1.4 and 2.12 items 1-2, exactly the contract's 5.7 list.
- **Stage 2** (view wired, still no focus effects and no occupant lanes = the tree after 4.2/4.4): 8 failed / 39 passed. Failures are only: 1.5 x2, 2.9 x2 (focus on the tab), 2.12 items 3 and 4, 2.14, 2.15 — exactly the contract's table. 2.1-2.4, 2.6-2.8, 2.10, 2.11, 2.13, 3.1 file all green; 2.5 green.
- Reference build with lanes (4.5) and focus (4.3): all green.

## 3. Task 2.5 (live-region guard): `not-observed-red`

For a correct build this test is green from 4.2 on (contract 5.7). In the real tree it fails only for want of `console-dock-open`, which is not its reason. Shown red for its own reason by deliberate local mutation in the scratch copy: a dock that renders `<span role="status">{expanded ? 'expanded' : 'collapsed'}</span>` outside the panel fails 2.5 (and the 1.3 no-live-region sibling).

## 4. Mutation pass (scratch copy; each mutation applied alone to the green reference build, tests run, then reverted)

| Mutation | Caught by |
| --- | --- |
| A build that keeps the old toggle (a `sighting-log-open` button labelled `Open sighting log` in the command column) | 2.7 (view) |
| A report link that toggles (`expanded: !d.expanded`) | 2.9 expanded row ("does not collapse an expanded dock") |
| An open request that does not bump `openSeq` when already expanded (focus not re-sent) | 2.9 expanded row (focus on tab) |
| Collapse control placed after the panel | 1.3 (interactive-set order), 1.4 expanded walk, 2.6 expanded row |
| Collapse control a child of the tab list | 1.3 tab-list test ("sibling, never its child") |
| Tab label with a count (`Log 3`) | 1.2, 1.3 (panel accessible name via `aria-labelledby`), 2.7 (tab name exactly `Log`) |
| A dock that leaks the height property on unmount (no cleanup) | 2.13 (the closing `''` after unmount) |
| A comment-only reference to `CONSOLE_DOCK_LANE_CAMERA` with the cluster's class a bare literal | 2.12 item 4 (comments stripped before reading the opening tag) |
| A comment containing `bottom-[4.5rem]` | 2.12 item 3 (raw text, RULING 22) |
| The log mounted while the interior's first load is in flight | 2.11 (all three tests) |
| No waiting indication (log shown in its place) | 2.11 (all three tests) |
| A live region added to the dock (role=status, text changes with state) | 2.5 |
| The Console control rendered inside the strip | 2.3 |
| Expanded state remembered across a remount (module-level memory) | 2.1 (all three rows) and every test that follows it |
| Focus effects removed from the shell (no focus on expand, none restored on collapse) | 1.5 (both), 2.9 (both) |

## 5. Gaps, limits, disputes

- No dispute and no spec/contract conflict. #33 (camera before hit targets) is the one scenario with no new tier-1 test: tasks.md 2.6 and contract 9.3 leg 12 both place it with the unedited `SpaceStage.interaction.test.tsx` and the journey.
- Limits worth the developer's and QA's attention: (a) #24 (visible focus indicator) is held at tier 1 by class tokens only; jsdom paints no ring. (b) #12's standalone half cannot catch a *view* that passes `label="Log 3"`; that half is the task 2.7 row, which asserts tab text is exactly `Log`. (c) 1.3's `tablist` is asserted by role only, not by an `aria-label`, since the spec names none.
- Tests carry no `skip`/`only`, no timers or sleeps (2.2 uses fake timers with no time advanced), no order dependence; the root custom property is cleared in `afterEach` in both files that publish it.
- `eslint` clean on the four new files; `tsc` clean against the reference build.

STATUS: COMPLETE

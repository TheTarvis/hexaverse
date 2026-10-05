# keep-console-tab-content-mounted — red coverage (SDET, Phase 2 step 8)

SDET, 2026-10-05. Change `openspec/changes/keep-console-tab-content-mounted/` (4 ADDED + 1 MODIFIED on `system-console`, 39 scenarios). Tier 1 only; no Playwright, no e2e edit, no stack. Written against `…-impl-contract.md` §3. Tree at `9648346`; production code untouched.

Test files (paths relative to `frontend/`):

- **L** `components/space/SystemSpaceView.console-log-mounted.test.tsx` (new; 23 tests: 14 red, 9 green)
- **E** `components/space/SystemSpaceView.console-dock-escape.test.tsx` (new; 19 tests: 14 red, 5 green)
- **M** `components/space/SystemSpaceView.sighting-log-mount-ordering.test.tsx` (edited; existing test unedited and green, 2 new tests red)
- **D** `components/space/SystemSpaceView.console-dock.test.tsx` (edited per task 3.1; 1 existing test red through the tightened helper, 21 green)

Command group that shows every red (tier 1, per-task form of `docs/testing-tiers.md` / `frontend/CLAUDE.md`):

```
cd frontend && npx vitest run components/space/SystemSpaceView.console-log-mounted.test.tsx components/space/SystemSpaceView.console-dock-escape.test.tsx components/space/SystemSpaceView.sighting-log-mount-ordering.test.tsx components/space/SystemSpaceView.console-dock.test.tsx
```

Observed at the red gate: `Test Files 4 failed (4)`, `Tests 31 failed | 36 passed (67)`. `npx tsc --noEmit` 0 errors; eslint clean on the four files.

## Status counts over the 39 scenarios

`assertion-red` 23, `already-green` 15, `Playwright, deferred` 1, `compile-red` 0, `reasoned-not-automated` 0. (Scenario 25 is also written as a tier-1 stand-in that is green and cannot fail; its status is `Playwright, deferred`.)

## Scenario table

Test names are the `Scenario:` strings in the files (greppable: `grep -n "Scenario: <title>" <file>`). Level is unit (vitest, view-level) throughout.

| # | Scenario (requirement) | Test (file: describe > name) | Level | Status |
|---|---|---|---|---|
| 1 | Pages loaded with load-more survive a collapse and re-expand (A Tab's Content Stays Mounted) | L: Task 1.1 > Scenario: Pages loaded with load-more survive a collapse and re-expand | unit | assertion-red: `expected 3 to be 2` at the re-expansion's request count (L:298) |
| 2 | A selected row's highlight survives a collapse and re-expand | L: Task 1.2 > Scenario: A selected row's highlight survives a collapse and re-expand | unit | already-green: the highlight rides the view's state; control for 1.3; non-vacuity precondition: highlighted before the collapse. Turned red by a build that clears the highlight on collapse |
| 3 | A row's no-mark statement survives a collapse and re-expand | L: Task 1.3 > Scenario: A row's no-mark statement survives a collapse and re-expand | unit | assertion-red: statement not found after the remount (L:369) |
| 4 | A highlighted row is not presented while the dock is collapsed | L: Task 1.4 > Scenario: Nothing of the log is reachable … / Scenario: A highlighted row is not presented … | unit | already-green (guard, content absent today). Non-vacuity: the Tab walk visited the Console control. Row-not-visible loop is vacuous until 4.1 (rows exist only after it); the re-expansion half is 1.2's control status. Turned red by hiding via `visibility`/`opacity`/`inert` alone or content left in the tab order |
| 5 | Nothing of the log is reachable while the dock is collapsed | L: Task 1.4 (same test) | unit | already-green (guard), as row 4 |
| 6 | A pile read that answers while the dock is collapsed is shown on re-expand | L: Task 1.1 > Scenario: A pile read that answers while the dock is collapsed is shown on re-expand; also L: Task 1.10 and Task 1.11 (the settle causes) | unit | assertion-red: 1.1 `expected 2 to be 1` (L:314); 1.10 and 1.11 red at their labelled precondition `expected +0 to be 1` (L:556, L:585) until 4.1, then for their own reason `the unfiltered pile was not read again` until 4.2 |
| 7 | A further page requested just before a collapse is listed on re-expand | L: Task 1.1 > Scenario: A further page requested just before a collapse is listed on re-expand | unit | assertion-red: `expected 3 to be 2` (L:333) |
| 8 | A pile read that failed while the dock was collapsed shows its failed state on expansion | L: Task 1.5 > Scenario: A pile read that failed while the dock was collapsed shows its failed state on expansion | unit | assertion-red: `the failed state is not shown on expansion` (L:417). Arranged on the first read only (RULING 12) |
| 9 | The log's retry and the sightings-unavailable card's retry are independent | L: Task 1.6 > Scenario: The log's retry and the sightings-unavailable card's retry are independent | unit | already-green (control for 1.5). Non-vacuity: the card was present and is gone after its retry; the log's own error was present before. Turned red by a shared retry |
| 10 | The log's first read is issued without the dock being expanded (Showing or Hiding … Issues No Read) | L: Task 1.7 > Scenario: The log's first read is issued without the dock being expanded | unit | assertion-red: `expected [] to have a length of 1 but got +0` (L:448) |
| 11 | Expanding and re-expanding after the first read issues no request | L: Task 1.8 > Scenario: Expanding and re-expanding … (the Console control); L: Task 1.8 > Scenario: Escape collapsing the dock clears no selection (its request clause …) | unit | assertion-red: row 1 `expected 2 to be 1` (L:464); the Escape row is red at its labelled precondition "Escape collapsed the dock" until 4.3, then on the stale-entry request until 4.1 |
| 12 | The report's link to the log issues no pile request | L: Task 1.8 > Scenario: The report's link to the log issues no pile request | unit | assertion-red: `the report link issued a pile request: expected 2 to be 1` (L:491) |
| 13 | A record filed since the last read is listed after an explicit refresh | L: Task 1.9 > Scenario: A record filed since the last read is listed after an explicit refresh | unit | already-green (positive control for 1.8). Non-vacuity: the request count rose across the Refresh click |
| 14 | Escape with focus inside the dock collapses it and moves focus to the Console control (Escape Collapses the Expanded Dock) | E: Task 2.1 > Scenario: … (focus on the Log tab / the collapse control / a control inside the panel (Refresh)) | unit | assertion-red, 3 rows: dock not collapsed (E:266) |
| 15 | Escape with focus outside the dock leaves focus where it was | E: Task 2.2 > Scenario: Escape with focus outside the dock leaves focus where it was (a camera control) | unit | assertion-red: `the dock did not collapse` (E:356). The stage mock's `mock-camera-control` stands in for the camera control; its real observer is the journey's `escape-from-camera-control` leg |
| 16 | Collapsing with focus on the strip's chevron leaves focus there | E: Task 2.2 > Scenario: Collapsing with focus on the strip's chevron leaves focus there (…menu closed) | unit | assertion-red (E:356) |
| 17 | Collapsing by a pointer press that moves no focus leaves focus on the chevron | E: Task 2.3 > Scenario: Collapsing by a pointer press … | unit | already-green (guard for 4.3). Non-vacuity: the chevron held focus before the click; `fireEvent.click`, not `user.click`. Turned red by focusing "Console" on every collapse |
| 18 | Escape with focus on no control collapses the dock | E: Task 2.2 > Scenario: Escape with focus on no control collapses the dock (the document body) | unit | assertion-red (E:356) |
| 19 | Escape with focus in a text field or a select collapses the dock and keeps the field's value | E: Task 2.2 > …(a number field holding a typed value) and …(a closed select showing a chosen option) | unit | assertion-red, 2 rows (E:356); preconditions (field holds `7`, select shows `water`) passed |
| 20 | Escape collapses the dock in the strip's failure states | E: Task 2.2 > …(the interior read failed…), …(the own-fleets read failed…), …(the canvas unavailable…) | unit | assertion-red, 3 rows (E:356) |
| 21 | Escape with the dock collapsed changes nothing | E: Task 2.4 > Scenario: Escape with the dock collapsed changes nothing | unit | already-green (control for row 1). Non-vacuity: selection `feat-star` and acting fleet `fleet_2` set to non-default values first. Turned red by an Escape that clears the selection (link 4's second-press rule built early) |
| 22 | Escape collapsing the dock clears no selection | E: Task 2.4 > Scenario: Escape collapsing the dock clears no selection (Escape, dock expanded); request clause also L: Task 1.8 (Escape row) | unit | assertion-red: dock not collapsed (E:395 via `expectUntouched`, E:404) |
| 23 | Escape with the fleet cell's menu open closes the menu and leaves the dock expanded | E: Task 2.5 > Scenario: Escape with the fleet cell's menu open … (focus on a menu entry / focus on the chevron with the menu open) | unit | assertion-red, 2 rows: red at the second Escape, `the second Escape did not collapse the dock` (E:465). Everything before it (menu closes, focus on chevron, dock still expanded) is green today by construction |
| 24 | A held Escape that closed the menu does not also collapse the dock | E: Task 2.5 (same two tests, the `repeat: true` keydown step) | unit | assertion-red at the closing positive control (E:465). The `repeat: true` assertion itself is satisfied today (nothing listens) and goes red only for a build with no repeat guard, which cannot be observed before 4.3; this is the contract's stated shape (§3.9, "assertion-red at the second Escape") |
| 25 | A pointer press on any part of the dock leaves the selection unchanged (Activating the Dock Changes No Space-View Selection) | E: Task 2.6 > Scenario: A pointer press on any part of the dock leaves the selection unchanged | unit (stand-in) | **Playwright, deferred**: the tier-1 test is green and cannot fail whatever is built (the stage is a mocked sibling and cannot receive the press); real observer is the journey's `press-on-dock-not-a-pick` leg (5.2). Non-vacuity: the stage's pick count was >0 after the arrangement's own picks before the reset |
| 26 | Expanding and collapsing the dock leaves the acting fleet unchanged | E: Task 2.4 > Scenario: Expanding and collapsing … (by pointer), (by keyboard); and the Escape collapse in row 1 above | unit | assertion-red: the Escape leg (2.4 row 1) is red; the pointer and keyboard legs are green on arrival (controls) |
| 27 | The expanded dock's Log panel holds the log (The Log Tab Is the Sighting Log's Home) | D: task 2.7 > Scenario: The expanded dock's Log panel holds the log / … (existing combined test, helper tightened by task 3.1); also L: Task 1.14 row 1a | unit | assertion-red: D `expectLogNotShown` now requires the element mounted and hidden; `Unable to find an element by: [data-testid="sighting-log"]` at D:250 via D:428 (red until 4.1) |
| 28 | The log's loading, empty and failed states appear in the panel | D: task 2.8 > Scenario: The log's loading, empty and failed states appear in the panel (3 rows, existing, unedited) | unit | already-green (live scenario carried unchanged; not edited, per contract §3.9) |
| 29 | The log reads nothing until the interior read's first load has finished | M: …log-specific arms > Scenario: The log reads nothing until the interior read's first load has finished / Scenario: A mount during an unsettled past-ETA sweep reads the pile after the settling read (dock collapsed); D: task 2.11 first test (existing) | unit | assertion-red: M second half `expected 0 to be greater than or equal to 1` (M:260); first half already-green (the gate exists; interior mock `isLoading: true` at that checkpoint). D 2.11 stays green |
| 30 | The panel shows a waiting indication while the interior read's first load is in flight | L: Task 1.14 > Scenario: The panel shows a waiting indication while the interior read's first load is in flight … (answers); D: task 2.11 (existing) | unit | already-green (re-asserts the live cold scenario under the latch; waiting indication seen before the answer) |
| 31 | The panel shows the log once the interior read's first load has answered or failed | L: Task 1.14 (answers) and (fails), and rows 1a and 1b; D: task 2.11 answers/fails (existing) | unit | already-green. 1b (r3-m1, no interior held and nothing in flight: the log is present, no waiting indication) is the only observer of the offline clause; turned red by a latch on `data != null \|\| isError`. 1a likewise stays green |
| 32 | The log reads nothing while the re-read of an interior the view already held is in flight | M: …log-specific arms > Scenario: The log reads nothing while the re-read of an interior the view already held is in flight / …; L: Task 1.15 | unit | assertion-red: M `a pile read was issued` at the expansion (M:273); L 1.15 `expected [ {} ] to have a length of +0 but got 1` at the expansion (L:709), over the real interior hook with a stale seeded entry |
| 33 | The panel shows the waiting indication during that re-read and the log once it has answered or failed | L: Task 1.14 > … (warm, answers), … (warm, fails) | unit | assertion-red, 2 rows: `the log was shown while the re-read was in flight: expected [ 'log' ] to deeply equal [ 'waiting', 'log' ]` (L:669, L:680) |
| 34 | A later re-read of the interior neither removes the log nor issues a pile read | L: Task 1.8 > Scenario: A later re-read … (its request clause; control); M: …log-specific arms (its closing log-present clause, after the expansion arm) | unit | already-green (L 1.8 row 4, control: nothing invalidates the pile from `resync`; non-vacuity: the poll called the interior mock's `refetch`). M's closing assertion sits behind the expansion assertion that is red today; it was seen green in the scratch proof (below) |
| 35 | A settled sweep's report link expands a collapsed dock to the Log tab | D: task 2.9 (existing, unedited) | unit | already-green |
| 36 | A settled sweep's report link does not collapse an expanded dock | D: task 2.9 (existing, unedited) | unit | already-green |
| 37 | No standalone toggle and no floating log remain | D: task 2.7 (same combined test as #27) | unit | assertion-red via the tightened helper (D:250 via D:428): "the log is not shown while collapsed" now means present and hidden |
| 38 | Activating a ghost while the dock is collapsed highlights the ghost and leaves the dock collapsed | D: task 2.10 (existing, unedited) | unit | already-green |
| 39 | The row for an activated ghost is highlighted when the tab is next shown | D: task 2.10 (existing); L: Task 1.2, Task 1.4 re-expansion half | unit | already-green |

## Task-by-task state (impl contract §1)

| Task | File | State observed |
|---|---|---|
| 1.1 | L | 3 rows assertion-red (L:298, L:314, L:333), counts `3 vs 2`, `2 vs 1`, `3 vs 2` |
| 1.2 | L | already-green (control for 1.3) |
| 1.3 | L | assertion-red (L:369) |
| 1.4 | L | already-green (guard) |
| 1.5 | L | assertion-red (L:417) |
| 1.6 | L | already-green (control for 1.5) |
| 1.7 | L | assertion-red (L:448) |
| 1.8 | L | rows 1 and 3 assertion-red (L:464, L:491); row 2 (Escape) red at its precondition `region has hidden` until 4.3 (L:475); row 4 already-green (control) |
| 1.9 | L | already-green (positive control) |
| 1.10 | L | red at the labelled precondition `the log's first read was issued: expected +0 to be 1` (L:556). Red for its own reason only between 4.1 and 4.2 — observed in the scratch proof below |
| 1.11 | L | as 1.10 (L:585); own reason observed in the scratch proof |
| 1.12 | M | first half already-green, closing assertion red (M:260) |
| 1.13 | M | assertion-red at the expansion (M:273) |
| 1.14 | L | rows 1a, 1b, 2, 3 already-green; rows 4 and 5 assertion-red (L:669, L:680) |
| 1.15 | L | assertion-red at the expansion (L:709) |
| 2.1 | E | assertion-red, 3 rows |
| 2.2 | E | assertion-red, 8 rows |
| 2.3 | E | already-green (guard) |
| 2.4 | E | row 1 assertion-red; rows 2-4 already-green |
| 2.5 | E | assertion-red at the second Escape, 2 rows |
| 2.6 | E | already-green; cannot fail at tier 1; `Playwright, deferred` for its real observer |
| 3.1 | D | `expectLogNotShown` tightened; D's one consumer test red until 4.1; header comment at the former `:22-25` corrected |

## Scratch proof (lesson two: a test never observed to fail, or never observed to pass, has not been shown to test anything)

In a throwaway `git worktree` (since removed; the shared tree was not touched), with the production shapes of the contract stubbed in by hand:

1. **4.3 (shell Escape listener) + 4.1 (latch)**: the four files give `Tests 2 failed | 65 passed (67)`; the only reds are 1.10 and 1.11, both on `the unfiltered pile was not read again: expected 1 to be 2` — the contract's §3.10 prediction, including that 1.8's Escape row is green once 4.3 exists.
2. **+ 4.2 (settle callback)**: those four files plus `SystemSpaceView.scan-refetch` and `SystemSpaceView.scan-targets-refetch-on-arrival` give `Test Files 6 passed (6)`, `Tests 81 passed (81)`. So every red above can go green, the green-on-arrival controls stay green, and the two existing hook-mock families are unaffected by 4.2.

The orchestrator still owns §4.2 step 4 (confirm the failing line of 1.10/1.11 after the real 4.1); this proof shows what it will see.

## Departures from, and notes on, the contract

1. **1.8 row 4** (the interior re-read, control): the snapshot is taken after a single expansion (rows listed, flush) instead of after "expand, wait, collapse, flush". With the collapse-then-expand of the contract's `settleFirstRead()`, a build that remounts on show would fire a stale-entry request at that expansion and the control would be red, not green on arrival as §1 says. The control still measures what it exists for (a re-read of the interior is not a pile read), and it was observed green both today and in the scratch proof. Fake timers are installed before the render, so the view's baseline-poll interval is a fake one.
2. **2.6 pick count**: the arrangement makes two picks (select body, activate fleet), so the count is greater than 0 rather than exactly 1 before the reset; the precondition asserts `> 0`.
3. **1.14** is read with the dock expanded immediately after the mount (§3.6, accepted in RULING 19's neighbour settlements); 1b uses `data: undefined, isLoading: false, isFetching: false, isError: false` as r3-m1 binds, asserted with `getByTestId('sighting-log')` inside `console-panel-log` and `console-panel-waiting` absent.
4. **Test names** in `it.each`-shaped groups (2.1, 2.2, 2.5) are generated with a `for` loop and a template string so the `Scenario:` text stays greppable verbatim; the parameter appears in parentheses after it.
5. **File L** carries one `eslint-disable-next-line react-hooks/rules-of-hooks` on the contract's §3.3 conditional-hook mock (the mode never changes inside a test); nothing else.
6. **File M**: the contract's three settable things are a hoisted `arms` object (running scan, unfiltered result) and the added `screen`/`fireEvent`/`within` imports; the one existing test is byte-for-byte unedited. The 1.13 arm and the 1.12 arm are two tests, not one.
7. Nothing in this phase is Playwright; the e2e migrations (3.3-3.6) and the journey (5.2) are untouched and not ticked.

## Deferred

`Playwright, deferred`: scenario 25 (leg `press-on-dock-not-a-pick`). Tier-1-covered and confirmed by the journey, not carried by it: `menu-open-escape` (2.5), `escape-from-camera-control` (2.2), the app stylesheet not defeating `hidden` and the same DOM node across a collapse (`escape-same-node`), the settle re-read on the wire (`settle-reread-collapsed`). Not asserted at any tier, by ruling: scroll offset (RULING 8), Escape with a native select popup or in a toast (RULING 6), Escape with the menu open and focus elsewhere (RULING 7).

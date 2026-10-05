# add-console-dock — adversary round 1

Persisted verbatim by the orchestrator from the adversary's hand-back, 2026-10-05
(the adversary is read-only and wrote no file). The orchestrator's binding
rulings follow the report, under "Orchestrator rulings".

**Verdict: NOT CLEAR — 1 BLOCKER, 10 MAJOR, 6 MINOR.**

Nothing was run (no vitest, no Playwright, no stack). Every finding is from reading the spec, tasks, design, rulings, live specs and code. Pixel figures in M8 are my arithmetic from class strings, not measurements.

Paths below are relative to `/Users/travis/Projects/hexaverse/`. "delta" = `openspec/changes/add-console-dock/specs/system-console/spec.md`; "tasks" and "design" are the sibling files. Line numbers are those of the change as it stood at round 1.

## One line per finding

- **B1** — journey task 5.2's "report's link expands the dock and the log shows the new record" is red for a correct build (60 s `staleTime`, drift left open); design D-22 still lists two legs that belong to 2b-i-b.
- **M1** — "focus anywhere else … SHALL NOT be moved by a collapse" has no scenario; confirmed, but it is arrangeable without Escape.
- **M2** — the galaxy-nav scenario passes for a build that leaks `--console-dock-height`.
- **M3** — task 2.13 asserts a "computed fallback" jsdom cannot compute.
- **M4** — `Log` with no count is tested only on the standalone shell, where it is a tautology; no view-level half exists.
- **M5** — the icon-only collapse control has no required accessible name.
- **M6** — a scenario title says panel-then-collapse, the SHALL says collapse-before-panel, and the THEN accepts either.
- **M7** — "which issues its first pile read" is false on a warm pile cache (A7 accepted, not applied here); "first load" is undefined on a warm interior cache.
- **M8** — "every floating surface the view or the app layout mounts" is unbounded; the enumeration of record wrongly clears the off-screen chips and omits the Toaster; the two scenarios are asymmetric.
- **M9** — the expanded dock makes marks in the canvas's lowest 220 px unpickable with no off-screen chip; spec and proposal are silent while the proposal says nothing is lost.
- **M10** — honest task count is 40 before any fix; two build obligations have no box.
- **m1** — "the row … SHALL be highlighted when the tab is next shown" lacks "if its row is loaded".
- **m2** — focus on an already-expanded report-link activation exists only in a scenario, not in the SHALL.
- **m3** — the load-more half of the height scenario is declared UNTESTED by its own task.
- **m4** — task 2.11 cites `sighting-log-mount-ordering.test.tsx` staying green; that file never mounts the log.
- **m5** — the migrated cross-highlight e2e is vacuous for ghost-to-row.
- **m6** — "Navigating to another system and back" is backed only by a remount proxy.

## BLOCKER

### B1 — the journey's settled-sweep leg fails for a correct build

**Attacked.** tasks line 55 (5.2): "the 'Console' control expands the dock and the Log panel shows with its refresh control and first row … ; a focused-scan sweep is committed, settles, and its report's link expands the dock and the log shows the new record". Also design lines 184-188 (D-22, tier 4): "the click-through leg, the settled sweep's record appearing with no re-open".

**Evidence.**
- `frontend/lib/query-client.ts:78` sets `staleTime: 60 * 1000` app-wide; `frontend/hooks/use-sightings.ts` overrides nothing. A remount inside 60 s of the last `pile(null)` read issues no read.
- `docs/handoffs/drift-sighting-log-not-reread-after-sweep-settles.md` stays OPEN by RULING 15: a settle re-reads only `pile(systemId)`.
- The leg before the sweep has already shown the log, so `pile(null)` is cached.

**Why a right build fails.** Two cases, both correct builds:
- Dock still expanded when the sweep settles: the link only moves focus, the log is never re-read, the record is absent.
- Dock collapsed in between: the link remounts the log, but under 60 s since the earlier read it serves the cache.

The leg passes only when the sweep outlasts the stale window. That is the "inherited precondition" shape: "opening is a mount, hence a read" holds only on a cold or stale entry. A red here invites the settle re-read being pulled into this change.

D-22 separately still lists "no re-open" and "click-through" as this change's tier-4 legs. The scope section subtracts only "the real-hook request counts", so design contradicts tasks 5.2 and RULING 15.

**Smallest fix.** Either of:
- Make the report's link the first show of the log in that document load: run the sweep leg before any expansion, after a `page.reload()`.
- Keep the order and assert only "the dock is expanded, the Log tab selected, the log shown", which is what the delta scenario at lines 97-100 claims.

In both cases strike the two legs from D-22 or tag them 2b-i-b.

## MAJOR

### M1 — the "focus anywhere else" clause has no scenario

**Attacked.** delta line 125: "focus anywhere else, the strip's chevron included, SHALL NOT be moved by a collapse".

**Evidence.** No scenario; tasks 1.5 and 4.3 only cover focus on the collapse control. Architect A6 wrote a chevron scenario on Escape, and it was dropped when Escape moved.

**Confirm or refute.** Confirmed uncovered. Refuted that it cannot be arranged: design D-7 itself notes Safari and Firefox on macOS do not focus a clicked button. Focus on the chevron plus a pointer press on the collapse control is a real collapse with focus outside the wrapper. In jsdom, `fireEvent.click` (not `user.click`) leaves `document.activeElement` alone.

**Wrong build that passes.** One that always focuses "Console" on collapse.

**Smallest fix.** One of:
- Add a row to task 1.5 and this scenario: "GIVEN the dock is expanded with keyboard focus on the strip's chevron / WHEN the collapse control is activated by a pointer press that does not move focus / THEN the dock is collapsed and keyboard focus is still on the chevron".
- Move the clause to 2b-i-b with Escape. Given M10, this is the cheaper option.

### M2 — the galaxy-nav scenario passes for a leaking build

**Attacked.** delta lines 220-222: "WHEN the galaxy route is rendered at a 1280×720 CSS-pixel viewport after this change / THEN the floating navigation's foot is 72 CSS pixels above the viewport's foot".

**Evidence.** Design D-3 publishes the property on `document.documentElement` and removes it in an effect cleanup; `FloatingNav` (`frontend/components/floating-nav.tsx:33`) outlives the view. Design Risks says "a `page.goto('/')` cannot see a leak".

**Wrong build that passes.** One with no cleanup: any cold render of `/` shows 72 px. Only task 5.2's wording saves it; the archived spec will not carry that.

**Smallest fix.** Add "**GIVEN** the galaxy route was reached by in-app navigation from a system space view whose dock was expanded".

### M3 — task 2.13 makes a tier claim jsdom cannot honour

**Attacked.** tasks line 27: "mounted on the galaxy route with the property unset its computed fallback is the 4.5rem it has today" and "mounted on the system space route … the published height follows the dock collapsed and expanded".

**Evidence.** Design D-1 and D-22: jsdom loads no app stylesheet and resolves no `calc()`/`var()`. Architect A8 item 2 rejected the same shape for the old 2.7. `FloatingNav` publishes nothing; the dock does.

**Smallest fix.** Reword 2.13 to what tier 1 can hold:
- the nav carries the lane class constant imported from `lib/console-dock-layout.ts`;
- with no dock mounted, `document.documentElement.style.getPropertyValue('--console-dock-height')` is empty.

The 72 px figure is 5.2's alone.

### M4 — the no-count label is only tested where it cannot fail

**Attacked.** delta lines 64-67; tasks line 6 (1.2): "the label containing no digit when the child content reports three rows and more pages … the standalone half".

**Evidence.** Design D-4: the shell "receives … its tabs", so in `ConsoleDock.test.tsx` the label is whatever the test passes. No section-2 task and no 5.2 leg reads the tab's name. "The standalone half" has no other half.

**Wrong build that passes.** A view that passes `Log · ${rows}`. This is the exact figure RULINGs 7 and 17 forbid.

**Smallest fix.** Add to task 2.7, as a row over its existing pile mock (three records, a non-empty `nextCursor`): the `console-tab-log` accessible name is exactly `Log`.

### M5 — the collapse control needs no accessible name

**Attacked.** delta line 125: the "Console" control and the collapse control "SHALL expose their expanded state and the region they control".

**Evidence.** `docs/handoffs/add-console-dock-canvas/Main.dc.html` draws the collapse control as a bare chevron SVG. Design D-19 names it `Collapse console`; the delta never does. Task 1.3 checks state and region id only.

**Wrong build that passes.** An unnamed icon button with `aria-expanded` and `aria-controls`.

**Smallest fix.** Add "each SHALL have an accessible name" to that sentence, and a clause to scenario "The expand and collapse controls expose their state" (a row of 1.3).

### M6 — the scenario title contradicts the SHALL and the THEN pins neither

**Attacked.** delta line 149: "Scenario: Tab from the Log tab continues into the panel and then to the collapse control". delta line 125: "the collapse control SHALL precede the panel's own controls". The THEN at line 152: "the collapse control is reached exactly once".

**Evidence.** The UX report (U5) wrote the scenario "to be true either way"; the architect then fixed the order (D-17). The title was never updated.

**Wrong build that passes.** Collapse control after the panel: it satisfies every scenario and violates the SHALL. Only task 1.4 pins the order.

**Smallest fix.** Retitle to "Tab from the Log tab reaches the collapse control and then the panel's controls". Change the THEN to "the collapse control is reached next, then the log's controls in reading order, each once".

### M7 — a promised read that a correct build does not issue; "first load" undefined

**Attacked.** delta line 95: "the waiting indication is replaced by the log, which issues its first pile read". delta line 71: "until the interior read's first load has answered or failed".

**Evidence.**
- Architect A7, accepted in dispositions: with the 60 s `staleTime` and a `QueryClient` that outlives navigation, "the log mounts and issues nothing … it makes 'THEN the log's first pile read is issued' false as written". The fix was applied only to the moved requirement.
- Design D-16: on a warm interior cache `isLoading` is false at mount while the re-read is in flight. "First load" can be read as React Query's `isLoading` (today's gate, task 4.2) or as "the read this mount opened with" (the latch, which is 2b-i-b's).

**Why it matters.** The scenario is false for a right build in a reachable state. Two engineers can build two different gates and both pass, because every arrangement is cold.

**Smallest fix.**
- Delete ", which issues its first pile read" from line 95; "replaced by the log" is the observable.
- Define the term once in line 71: "the interior read's first load (the read is in flight and no interior for this system is held)".

### M8 — "every floating surface" is unbounded and the enumeration of record is wrong in two places

**Attacked.** delta line 179: "every floating surface the view or the app layout mounts SHALL be shown wholly inside the viewport and clear of the dock … and every control it carries SHALL be activatable". Scenarios at lines 208-214.

**Evidence.**
- The finite list lives only in `docs/handoffs/add-console-dock-analysis.md` § 5, cited by tasks, not by the spec.
- **Off-screen chips.** § 5 says "Off-screen reach chips | top-left | none". `frontend/components/space/SpaceStage.tsx:957-960` places them at `left-4`, `top: 16 + i*26`, unbounded downward, in `FloatingNav`'s lane (`left-4 z-50`). With the nav raised to 236 px its top is near y≈387, so the 15th chip onward is under it. Today the threshold is about the 21st. A star-rich system zoomed in can plausibly reach 15.
- **Toaster.** `frontend/app/layout.tsx:29` mounts it `position="top-right"`, over the column's top. It is "a floating surface the app layout mounts". The collapsed scenario's "nor any other of them" is literally false whenever a toast shows.
- **Asymmetry.** The collapsed scenario requires mutual non-overlap; the expanded one does not; the SHALL states neither; task 5.2 demands it "in both states".

**Smallest fix.**
- Name the surfaces in the requirement: the command column, the sightings-unavailable card, the camera cluster, the floating navigation, the "Console" control.
- State what is not covered: transient toasts, hover fact cards, the off-screen chips until link 3 deletes them.
- Put the same mutual-overlap clause in both scenarios, or in neither and in the task.
- Correct § 5's chip row, or carry the chip/nav collision to link 3's section in task 5.9.

### M9 — pointer selection is dead under the expanded dock and nobody says so to the reader

**Attacked.** Proposal line 34: "this change loses nothing a player has today". The delta is silent.

**Evidence.**
- Design Non-Goals and Risks admit "A mark there cannot be clicked while the dock is expanded".
- `frontend/components/space/SpaceStage.tsx:619` builds off-screen membership from `onScreen` over the full canvas. A body, gate or ghost at y 500-664 gets no chip and a covered hit target.
- Live `system-space-view` *Off-Screen Bodies and Lane Gates Are Reachable by Pointer and Touch*: "a mark inside the viewport is selected through its ordinary hit target".
- Live `sighting-log` rationale: ghost and row are "two halves of one reading". Task 3.2 already has to collapse the dock to click a ghost.

The same is true of the strip's 56 px today, so it is not new in kind. It is four times the extent, and it sits in the state where the log is read against the scene. The "X is unaffected" claim is unstated and untested.

**Smallest fix.**
- One sentence in proposal "Costs said out loud".
- One sentence in *The Dock Has One Fixed Height…*: the expanded dock covers the canvas beneath it and this change does not reframe the camera. That makes it a decision, not an accident.
- Qualify line 34 to "nothing of the log's reads or content".

### M10 — task count has no headroom and two obligations have no box

**Attacked.** tasks line 3: "Unit of a task: one test arrangement group … one closing assertion". Lines 26-27 (2.12, 2.13) and 42-48 (section 4).

**Evidence.**
- 2.12 names four closing assertions across two test files and two harnesses: the property published and removed; lane classes on card and column; "the camera cluster does so in `SpaceStage`'s own test file"; and a source-text check that no `bottom-[4.5rem]` remains.
- 2.13 is two arrangements (system route with a dock; galaxy route without).
- By architect A1's unit that is 40, not 38. RULING 15: "adversary growth past 40 is met by shedding to 2b-i-b, not by merging boxes".
- The `SightingLog.tsx` chrome trim (design D-12, proposal Impact) appears only in section 4's header prose; no 4.x box performs it.
- `harness/check-frontend-tests.sh` requires a sibling test for a new frontend `.ts` file. `frontend/lib/console-dock-layout.ts` matches no skip rule, and no task creates `console-dock-layout.test.ts`. Gate 5.1 trips or an unboxed file appears.

**Smallest fix.**
- Split 2.12 at the file boundary and 2.13 at the route boundary.
- Home 2.12's module assertions in `frontend/lib/console-dock-layout.test.ts`.
- Add the chrome trim to 4.2's text.
- Take M1 by its shed option; land M4 and M5 as rows.
- State the resulting count.

## MINOR

- **m1** — delta line 71: "the row for that record SHALL be highlighted when the Log tab is next shown" is unconditional. Live `sighting-log` says a ghost whose row is not loaded highlights no row and "the log SHALL NOT page further". Add "if that record is among the rows the log has listed"; the scenario already says so.
- **m2** — delta line 125 moves focus "WHEN the dock expands"; the already-expanded report-link case (lines 159-162, design D-18 "every open request") is in a scenario only. Add it to the SHALL.
- **m3** — delta lines 189-192: the load-more half is "logged UNTESTED with no cover claimed" by task 5.2, and "the Log tab is activated" has no observable effect with one tab. Drop both from the WHEN (the three-record scroll scenario covers growth) or seed 51 records. The same goes for "Log tab … activatable by Enter or Space" in line 125.
- **m4** — tasks line 25: `SystemSpaceView.sighting-log-mount-ordering.test.tsx` "is not edited and must stay green". It never opens the log and counts any `useSightings` call, so the ghost feed satisfies it. Its staying green is evidence of nothing about the log's gate; the new 2.11 rows are the only cover. Say so, so nobody cites it at the gate.
- **m5** — tasks line 34 (3.2): the migrated cross-highlight clicks the row first (`frontend/e2e/tests/scan-journey.spec.ts:297-302`), which already sets the same id. The row reads `data-highlighted="true"` after re-expansion even if ghost activation does nothing. Click the ghost while collapsed before any row click.
- **m6** — delta lines 27-31 are backed by task 2.1's remount only; design D-4 rests on Next keying the segment. One journey step (return from the galaxy leg, expect collapsed) would observe it.

## Checked and clean

- **MODIFIED block.** Diffed against live: only the first paragraph differs, six scenario headings verbatim. I found no other live `system-console`, `sighting-log` or `system-space-view` sentence made false in either state, beyond M9.
- **Console control and live sentences.** "The chevron is the strip's only interactive element" and "The sighting log stays reachable without the canvas" both stay true with the "Console" control outside the strip element.
- **Mounted on show.** Consistent across delta, tasks 4.2 and the proposal. No scenario assumes a mounted-and-hidden log or promises survival or discard across a collapse.
- **Read timing.** No read's timing moves. Migrated `scan-journey` step 5 and `scan-lane-transit-fizzle` are first opens on a cold cache. The `**/v1/sightings**` intercept in `vitals-strip-journey` still catches one read while collapsed.
- **Scope.** No backend field, endpoint or query. Deleting the floating panel, the toggle and `logOpen` has a box (4.4). All four `sighting-log-open` e2e uses and the one vitest use are in 3.1-3.3.
- **Panel findings.** A2, A4, A6 (text), A8 items 1/2/4, A9's 2b-i half, A11, U2, U3, U5, U6 and U8 are applied. The two residues are M1 and M7.
- **Collision legs.** Whether they survive the 564 px column is not knowable without a run; design says so and tasks 3.4/3.5 own it.
- **Scenario/task mapping.** All 49 scenarios map to a task, subject to M4 and m3.

**Verdict: NOT CLEAR — 1 BLOCKER, 10 MAJOR, 6 MINOR.**

---

## Orchestrator rulings (binding), 2026-10-05

All seventeen findings are CONFIRMED against the cited text. None is disputed.

| Finding | Ruling |
| --- | --- |
| B1 | ACCEPT, second fix: the journey's settled-sweep leg asserts only what this change's scenario claims — the dock expanded, the Log tab selected, keyboard focus on the tab, the log shown. Whether the new record is listed is 2b-i-b's (the drift stays OPEN; RULING 15) and the journey LOGS what it saw without asserting it. Strike "no re-open" and "click-through" from D-22's list for this change, tagging them 2b-i-b. The first fix is rejected: it would make the gate depend on the mask the drift record describes. |
| M1 | ACCEPT, shed option: the clause "focus anywhere else, the strip's chevron included, SHALL NOT be moved by a collapse" leaves this change and is appended to `keep-console-tab-content-mounted-draft-delta.md` with the adversary's pointer-press arrangement and A6's chevron scenario. Amends RULING 18's delivery (its third clause is 2b-i-b's); the cap forces it (M10). |
| M2 | ACCEPT as written (the GIVEN). |
| M3 | ACCEPT as written. |
| M4 | ACCEPT as written (a row of the view-level log-placement group). |
| M5 | ACCEPT as written. |
| M6 | ACCEPT as written. |
| M7 | ACCEPT both edits. |
| M8 | ACCEPT: the requirement names the five surfaces; states that transient toasts, hover fact cards and the off-screen reach chips are not covered; carries one mutual-overlap clause identically in both scenarios. The chip/`FloatingNav` collision (threshold falling from about the 21st chip to about the 15th while the dock is expanded) is a stated cost in the proposal and is carried to link 3's chain-doc section by the gate's chain-doc task — link 3 deletes the chips. `add-console-dock-analysis.md` § 5's chip row is history and is not edited; this ruling is the correction of record. |
| M9 | ACCEPT all three edits. |
| M10 | ACCEPT: split 2.12 at the file boundary (module assertions in `frontend/lib/console-dock-layout.test.ts`) and 2.13 at the route boundary; the chrome trim joins the build box that mounts the log. Expected count 40. If the honest count after every fix here exceeds 40, the writer stops and reports — nothing is merged to hide it. |
| m1 | ACCEPT. |
| m2 | ACCEPT. |
| m3 | ACCEPT, drop option: remove the load-more half and "the Log tab is activated" from that WHEN, and "activatable by Enter or Space" for the Log tab where it has no observable effect with one tab (it returns in 2b-ii with a second tab; note it in the chain-doc carry list). |
| m4 | ACCEPT. |
| m5 | ACCEPT. |
| m6 | ACCEPT as one journey step (a row of 5.2, not a task). |

Verdict commit: none — round 1 is NOT CLEAR.

STATUS: COMPLETE

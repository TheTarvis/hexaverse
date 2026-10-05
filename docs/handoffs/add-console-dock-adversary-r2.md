# add-console-dock — adversary round 2 (verification and residue)

Persisted verbatim by the orchestrator from the adversary's hand-back, 2026-10-05
(the adversary is read-only and wrote no file). Input diff:
`add-console-dock-r1-to-r2.diff`. The orchestrator's binding rulings follow the
report.

**Verdict: NOT CLEAR — 0 BLOCKER, 1 MAJOR, 6 MINOR.** All seventeen round-1 findings are FIXED as ruled. The one MAJOR is a regression the B1/M8 repair introduced in task 5.2; it is a two-phrase edit to that task and needs no new box (count stays 40).

Nothing was run (no vitest, no Playwright, no `openspec validate`). Everything is from reading the four change files, the diff, the r1 report and rulings, RULING 21, the shed draft, and the cited frontend code. Paths are relative to `/Users/travis/Projects/hexaverse/`. "delta" = `openspec/changes/add-console-dock/specs/system-console/spec.md`; "tasks", "design", "proposal" are its siblings. Line numbers are the files' as they stood at round 2.

Counts confirmed by grep: 40 unchecked boxes, 49 scenarios. Numbering is consecutive (1.1-1.5, 2.1-2.15, 3.1-3.6, 4.1-4.5, 5.1-5.9 = 40). Every task-to-task reference in tasks.md resolves (4.1/4.3 → 1.x; 4.2 → 2.1-2.4, 2.6-2.11; 4.3 → 1.5, 2.5, 2.9; 4.5 → 2.12-2.15; 3.6 → 4.2; 1.2 → 2.7; 5.2 legs).

## Round-1 findings, verified

| Id | Status | Current text that shows it |
| --- | --- | --- |
| B1 | FIXED | tasks:57 "its report's link leaves the dock expanded with the Log tab selected, keyboard focus on the Log tab and the log shown (whether the settled sweep's new record is listed is `keep-console-tab-content-mounted`'s … the journey logs what it saw and asserts nothing about it)". design:189 "The click-through leg and the settled sweep's record appearing with no re-open are 2b-i-b's". |
| M1 | FIXED (shed) | delta:125 now ends the collapse sentence at "SHALL NOT be lost to the start of the document." The clause and both scenarios are in `docs/handoffs/keep-console-tab-content-mounted-draft-delta.md:349-369`. design:10 records it; tasks:48 (4.3) no longer says "focus elsewhere being left alone"; tasks:64 (5.9) carries it. |
| M2 | FIXED | delta:221 "**GIVEN** the galaxy route was reached by in-app navigation from a system space view whose dock was expanded". |
| M3 | FIXED | tasks:29 (2.15) "`document.documentElement.style.getPropertyValue('--console-dock-height')` is empty and the nav carries the same imported lane class … the 72 px figure is 5.2's"; tasks:28 (2.14) "what the class resolves to is 5.2's: jsdom resolves no `calc()` or `var()`". |
| M4 | FIXED | tasks:21 (2.7) "in one more row over the same pile mock (three records and a non-empty `nextCursor`) the `console-tab-log` accessible name is exactly `Log`"; tasks:6 (1.2) names itself the standalone half only. |
| M5 | FIXED | delta:125 "and SHALL each have an accessible name"; delta:138-139 both THEN lines add "and has an accessible name"; tasks:7 (1.3) pins `Console` and `Collapse console`. |
| M6 | FIXED | delta:149 "Tab from the Log tab reaches the collapse control and then the panel's controls"; delta:152 "the collapse control is reached next, then the log's controls in reading order, each once"; tasks:8 (1.4) "in that order (a collapse control placed after the panel fails)". |
| M7 | FIXED | delta:95 "**THEN** the waiting indication is replaced by the log"; delta:71 "the interior read's first load (the read is in flight and no interior for this system is held)". I checked the definition against `frontend/hooks/use-system-space.ts:23`: the query is always enabled on this view, so the definition and `!interior.isLoading` agree. |
| M8 | FIXED | delta:179 names the five surfaces, says "Transient toasts, hover fact cards and the off-screen reach chips (until a later change deletes them) are not covered", and delta:210 and :214 carry the identical clause "overlaps neither the strip, the dock nor any other of them". proposal:39 states the chip cost; tasks:64 carries it to link 3. Residue: r2-M1, r2-m3. |
| M9 | FIXED | proposal:38 (the new cost bullet); delta:179 "The expanded dock covers the lowest 220 CSS pixels of the canvas beneath it, and this change does not reframe the camera for it"; proposal:34 "loses nothing of the log's reads or content". |
| M10 | FIXED | 2.12 split into 2.12 (module and source text, `frontend/lib/console-dock-layout.test.ts`) and 2.13 (view); old 2.13 split into 2.14 and 2.15; tasks:47 (4.2) carries the chrome trim; count is 40. The sibling test now exists for the gate (`harness/check-frontend-tests.sh:140-143`). |
| m1 | FIXED | delta:71 "if that record is among the rows the log has listed, its row SHALL be highlighted when the Log tab is next shown". |
| m2 | FIXED | delta:125 "WHEN the dock expands, or the affordance that opens the log is activated while the dock is already expanded, keyboard focus SHALL move to the selected tab". |
| m3 | FIXED | delta:189-191 retitled, WHEN is "the log has listed more rows than the panel area shows"; delta:125 limits Enter/Space to the "Console" and collapse controls; 5.2 drops the UNTESTED load-more line; 5.9 carries the return to 2b-ii. Residue: r2-m2. |
| m4 | FIXED | tasks:25 (2.11) "its staying green is evidence of nothing about the log's gate, and only these rows cover it". |
| m5 | FIXED | tasks:36 (3.2) "collapses the dock and clicks the ghost before any click on a row (a row click sets the same id and would make ghost activation vacuous)". |
| m6 | FIXED | tasks:57 "returning from it to the system space view by the app's own navigation shows the dock collapsed"; design:189 "returning to a collapsed dock". Residue: r2-m6. |

## RULING 21 — attacked, stands

I tried to construct a build that passes 2.12's source-text check and the journey while the camera cluster is wrong:

- **Cluster keeps a hard-coded offset** (for example 100 px) and the constant is referenced elsewhere: expanded, the cluster sits under the 220 px dock; the journey's expanded overlap leg fails.
- **Cluster given the left lane** (72 px collapsed): it overlaps the "Console" control at 64-88 px; the collapsed leg fails.
- **Cluster given the column lane**: it overlaps the column's foot in both states; fails.
- **Constant named only in a comment, class not applied**: the cluster loses its `bottom` and falls to its static position. The journey catches this only if that position collides with one of the five surfaces or leaves the viewport. That depends on r2-M1's containment clause being restored.

So the basis holds: a rendered class assertion would catch nothing the journey does not, given r2-M1 is fixed. Two cheap tightenings, both text-only inside 2.12, are in r2-m5.

## MAJOR

### r2-M1 — task 5.2's overlap leg lost "inside the viewport" and made the sightings-unavailable card optional

**Text.** tasks:57: "the visible area of each of the five surfaces present overlaps neither the dock, the strip nor any other of them, in both states".

Round-1 text of the same leg (diff line 229): "the visible area of every floating surface lies inside the viewport and overlaps neither the dock, the strip nor any other of them, in both states".

**Evidence.**
- delta:210 and :214 both say "each surface's visible area lies wholly inside the viewport and overlaps neither…". delta:179 makes it a SHALL ("SHALL be shown wholly inside the viewport"). The repair dropped "lies inside the viewport and" from the only task that can measure it (design:188: tier 1 holds no dimension).
- delta:209 and :213 require "the sightings-unavailable card (carrying a retry affordance)" to be present. The card renders only when the ghost feed has failed (`frontend/components/space/SystemSpaceView.tsx:891`, `ghostFeed.isError`). 5.2 names no leg that fails that read. "each of the five surfaces present" reads as "those that happen to be present", and it must, because the "Console" control is absent when expanded.
- Inducing the card means failing a sightings request, which also disturbs the log legs if the intercept is the broad `**/v1/sightings**`. That is an incentive to skip it.

**Wrong build that passes / cover claim that is false.** A journey that never fails the ghost feed and never tests containment satisfies 5.2 as written. Both "No floating surface…" scenarios are then claimed covered while the card's geometry and retry reachability, and every surface's containment, are asserted at no tier. It also weakens RULING 21's fourth case above.

**Smallest fix (no new task).** In 5.2:
- restore the phrase: "the visible area of each surface lies wholly inside the viewport and overlaps neither the dock, the strip nor any other of them";
- replace "the five surfaces present" with: "all four of the command column, the sightings-unavailable card, the camera cluster and `FloatingNav` in both states, plus the "Console" control while collapsed; the card is induced by failing the system-filtered sightings read only (a route predicate on the system id, not `**/v1/sightings**`), and its Retry is hit-tested".

## MINOR

- **r2-m1 — stale tier claim.** tasks:3 still says "every dimension, overlap and click-through claim is held at tier 4 by 5.2". 5.2 has no click-through leg, and design:189 now gives click-through to 2b-i-b (design:203 was corrected to "Every dimension and overlap claim"). Fix: delete "and click-through" from tasks:3.

- **r2-m2 — title over-claims after the m3 repair.** delta:127 "Scenario: Each dock control is reachable and activatable from the keyboard". The SHALL (delta:125) and the THEN (delta:130) now make only the "Console" and collapse controls activatable. Fix: retitle to "Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard", and update the citation in tasks:8 (1.4).

- **r2-m3 — "clear of the others" lost the strip and the dock.** delta:179: "meets this by its visible area lying wholly inside the viewport and clear of the others". Round 1's text was "clear of them", whose referent was the dock, the strip and the "Console" control. "The others" now most naturally means the other floating surfaces. The scenarios still pin it, so this is wording only. Fix: "clear of the strip, the expanded dock and the others".

- **r2-m4 — stale references the repair left behind.**
  - design:139 (D-13): "extended by hand after archive (task 6.8)". There is no section 6; it is 5.8. Same kind as the "4.5 and 4.6" line the orchestrator already fixed.
  - proposal:60 (Impact, test files): lists "new `ConsoleDock.test.tsx` and `SystemSpaceView.console-dock.test.tsx`" only. The repair added `frontend/lib/console-dock-layout.test.ts` (2.12) and `frontend/components/floating-nav.dock.test.tsx` (2.14).
  - proposal:62: "Rulings bound: RULINGs 1-20". RULING 21 now binds 2.12.
  - tasks:11 (section 2 header): names a second file for 2.12 only. 2.14 is in `floating-nav.dock.test.tsx`, and 2.15 names no file at all (presumably the same new sibling, since `floating-nav.test.tsx` "is not edited"). Say so in 2.15.
  - design:187 (D-22, tier 1): "each occupant carrying the lane class imported from the one module". Under RULING 21 the camera cluster is held by a source-text reference, not a rendered class. Add "(the camera cluster by source text, RULING 21)".

- **r2-m5 — 2.12 leaves the three offsets and the meaning of "references" open.** tasks:26: "the three lane class literals, each a complete `bottom-[calc(var(--console-dock-height,3.5rem)+N)]` string" and "`SpaceStage.tsx` references the camera lane's constant". `N` is unpinned at tier 1 although design:61-63 fixes it (1rem, 2.75rem, 5.25rem), and a mention in a comment "references" the constant. The journey catches the plausible cases (see RULING 21 above), so this is tightening only. Fix, text-only: name the three `N` values in 2.12, and say "the cluster element's `className` uses the camera lane's constant".

- **r2-m6 — the return leg's navigation is unnamed.** tasks:57: "returning from it to the system space view by the app's own navigation shows the dock collapsed". Every existing e2e enters a system by `page.goto` (for example `frontend/e2e/tests/scan-journey.spec.ts:247`), which is a document reload and would make this leg a copy of "A reload shows the dock collapsed". A client-side route exists and has precedent: the roster-row drill-in in `frontend/e2e/tests/world-time-render-loop-journey.spec.ts:175-187`, or the inspector's `enter-system-button` (`frontend/components/galaxy/GalaxyView.tsx:712`). Fix: name one of them and add "not `page.goto`".

## Checked and clean (what the diff touched)

- **Geometry is satisfiable for a right build.** From the class strings and design D-3, at 1280×720: collapsed, column y 16-580, cluster 588-620, "Console" control about 628-656, strip from 664; expanded, column 16-416, cluster 424-456, dock from 500. The card is centred and the nav is at the left. The mutual-overlap clause added to both scenarios does not fail a correct build. These are my arithmetic, not measurements.
- **Shed clause.** The draft-delta file carries the clause, A6's Escape scenario, the pointer-press scenario, the jsdom arrangement note and the build-side note. Nothing in this change's delta, tasks or proposal still promises "focus elsewhere is not moved"; design D-18's third bullet is fenced by design:10.
- **Proposal claims.** "5 ADDED, 1 MODIFIED", the keyboard bullet, and the two new cost bullets agree with the delta and with 5.9.
- **5.9.** Carries M1, the 2b-ii Enter/Space return, and link 3's chip collision and unpickable band, as ruled.
- **The 3-record scroll leg** still backs both height scenarios (delta:189-197); they are now near-duplicates, which is harmless.

**Verdict: NOT CLEAR — 0 BLOCKER, 1 MAJOR (r2-M1), 6 MINOR (r2-m1 to r2-m6).** Every fix is a text edit inside existing boxes; none needs a 41st task.

---

## Orchestrator rulings (binding), 2026-10-05

Residue only: every finding is confined to round 1's repairs — a convergence
signal. All seven are CONFIRMED and ACCEPTED with the adversary's smallest fix,
as text edits inside existing boxes; the task count stays 40.

| Finding | Ruling |
| --- | --- |
| r2-M1 | ACCEPT both phrases as written. The card is induced by failing the system-filtered sightings read only, and its Retry is hit-tested. |
| r2-m1 | ACCEPT. |
| r2-m2 | ACCEPT (retitle; update the citation in task 1.4). |
| r2-m3 | ACCEPT. |
| r2-m4 | ACCEPT all five items; 2.15's file is the new `floating-nav.dock.test.tsx`. |
| r2-m5 | ACCEPT both tightenings (the three offsets named from design D-3; "the cluster element's `className` uses the camera lane's constant", which at tier 1 remains a source-text assertion per RULING 21 and must be worded so a mention in a comment does not satisfy it). |
| r2-m6 | ACCEPT: the roster-row drill-in precedent (`world-time-render-loop-journey.spec.ts:175-187`) or the inspector's `enter-system-button`; never `page.goto`. |

Round 3 (the last) is a diff spot-check of these edits only.

Verdict commit: none — round 2 is NOT CLEAR.

STATUS: COMPLETE

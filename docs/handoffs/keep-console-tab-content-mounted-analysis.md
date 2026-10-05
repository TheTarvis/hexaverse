# keep-console-tab-content-mounted — design analysis (link 2b-i-b)

Analyst, 2026-10-05. Read-only on code and specs; nothing was run (no test, no stack). Tree: branch `feat/harness-document-token-management` at `3f83cf9` (`add-console-dock` archived at `c0b4aad`). `openspec list`: no active change, so no in-flight conflict. Every `file:line` below was read at this HEAD; frontend paths are relative to `frontend/`.

Inputs read whole: `docs/plans/system-hud/chain.md`, `docs/plans/system-hud.md`, `docs/handoffs/keep-console-tab-content-mounted-draft-delta.md` (the draft, no verdict), rulings 2, 6, 8, 9, 15-20 of `add-console-dock-rulings.md`, the archived `design.md`, both routed drift records, the architect / UX / dispositions / adversary-r1 / journey / impl-contract reports (by index and section), live `system-console`, `sighting-log`, and the relevant requirements of `system-space-view`.

## 0. Bottom line

- **One change, one capability delta.** `keep-console-tab-content-mounted` touches `system-console` only: **4 ADDED requirements and 1 MODIFIED** (*The Log Tab Is the Sighting Log's Home on This View*, 10 live scenario headings to carry). `sighting-log` and `system-space-view` take **no delta**. The chain table's "ADDED `system-console` (4, drafted)" under-counts by the MODIFIED block (§ 2.2).
- **The draft is wrong about *The Dock Is Keyboard-Operable*.** No live sentence of it is falsified; the focus clause and the Escape scenarios belong in the ADDED Escape requirement (§ 2.3, Q2).
- **Honest size: 42 tasks as fully drafted** (range 38-44), in the predecessor's unit. Past the cap by 2 before any panel. **No new chain link.** Recommended authored scope is 38 (shed the row-into-view scroll, 2 tasks, to a filed follow-up; fold two INFERRED groups into rows). If the architect's recount or the panel passes 40, the pre-identified seam is *lifetime against keyboard*: the Escape block (6 tasks) goes to 2b-ii, which already owns arrow keys and tab activation (§ 6).
- **Eleven draft claims are stale or wrong against the tree** (§ 4). The three that matter: the shell-level "stateful probe" test is green today and proves nothing (`ConsoleDock.tsx:155` already renders content unconditionally); the draft's highlight-and-no-mark scenario describes a state `SightingLog` cannot be in; D-7's stated reason the menu wins Escape is not how production dispatches (React's root container is `document`).
- **Journey: every leg has a real path**, including the settled-sweep leg 2b-i logged UNTESTED — `scan-journey.spec.ts:73-76` reaches a scan target by docking at the home station first. Load-more needs 51 seeded records (`PageMax = 50`); the seeding helper exists (§ 10).
- **HARD-STOP candidates: none.** Every open question has a recorded lean or a reversible default (§ 8).

## 1. Capability map and change structure

| Capability | New or delta | What this link does to it |
| --- | --- | --- |
| `system-console` | delta | 4 ADDED, 1 MODIFIED (§ 2) |
| `sighting-log` | no delta | the live scenario *The log refetches after a sweep settles* (`openspec/specs/sighting-log/spec.md:155-157`) is made true by a build task and a view-level test; `drift-sighting-log-not-reread-after-sweep-settles.md` is closed (RULING 9 precedent) |
| `system-space-view` | no delta | no sentence falsified (§ 2.4); it contains no Escape rule at all (`grep -i escape` returns nothing in that spec) |

Change id: `keep-console-tab-content-mounted` (one change; absent from `openspec/changes/archive/`). Frontend only. Production files expected to change: `components/space/SystemSpaceView.tsx` (the mount site and both settle exits), `components/space/ConsoleDock.tsx` (the Escape listener and the focus guard), `components/space/SightingLog.tsx` (only if the row-into-view scroll stays in scope). `VitalsStrip*.tsx`, `ScanControl.tsx`, `hooks/use-sightings.ts` and `lib/query-client.ts` should not need an edit; an edit to any is a finding.

## 2. The requirement set against the live spec

### 2.1 ADDED `system-console` (four)

Names are the draft's, kept because the chain doc already cites two of them (link 4 "MODIFIES *Escape Collapses the Expanded Dock*").

| # | Requirement | Owner it names, and restates nothing of |
| --- | --- | --- |
| R1 | *A Tab's Content Stays Mounted While It Is Not Shown* | `sighting-log` *The Log's Empty, Loading, and Failed States Are Each Explicit*, *The Log Pages Through the Pile With the Server's Own Cursor* |
| R2 | *Showing or Hiding the Log Tab Issues No Read* | `sighting-log` *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* |
| R3 | *Escape Collapses the Expanded Dock* | `system-console` *The Fleet Cell's Chevron and Menu Are Keyboard-Operable* (the menu's own Escape) |
| R4 | *Activating the Dock Changes No Space-View Selection* | `system-space-view` *Toggle-to-Deselect Single Selection…*; mirrors live *Activating the Strip Changes No Space-View Selection* (`system-console/spec.md:668`) |

Draft SHALL text, with the corrections this analysis found:

- **R1.** "The content of a tab that is not shown — as of this change, the Log tab's content while the dock is collapsed — SHALL stay mounted and SHALL be hidden from sight, from the keyboard tab order and from assistive technology. Collapsing the dock SHALL NOT discard the content's state. While its tab is selected and the dock is expanded, the content SHALL be shown, focusable and exposed to assistive technology." "Mounted" is mechanism; the observable is *state is not discarded and no request is caused* — the writer should lead with the observable and keep "mounted" as the gloss. The last sentence duplicates live *The expanded dock's Log panel holds the log* and can go.
- **R2.** The draft's second sentence — "The log's reads are those *The Log Reads on Mount…* names **and no others**" — must be cut. It restates the owner (against RULING 12), and it is false: an always-subscribed observer also refetches on network reconnect (React Query's `refetchOnReconnect` defaults to true; `lib/query-client.ts:76-84` overrides only `refetchOnWindowFocus`), and the settle watcher's retry loop re-reads every 20 s while a past-ETA sweep stays unsettled (`SystemSpaceView.tsx:181,185`). Keep only what this capability owns: showing, hiding and re-showing issue no request; the first read does not wait for an expansion (Q3, Q4).
- **R3.** Use A5's wording, not the first draft's: "…the dock SHALL collapse, unless the fleet cell's open menu takes the key (keyboard focus on the chevron or on one of the menu's entries), in which case the dock SHALL NOT collapse." Add here, not in the live keyboard requirement (§ 2.3): "A collapse, by Escape or by the collapse control, SHALL NOT move keyboard focus that is outside the tab bar and the panel; with focus inside them it moves to the "Console" control as *The Dock Is Keyboard-Operable* states." Keep "SHALL change no space-view selection and no acting fleet and SHALL issue no request" and "While the dock is collapsed, Escape SHALL change nothing in the dock" (link 4 MODIFIES the former).
- **R4.** As drafted. It has **no build task**: the dock root is `pointer-events-auto` at `z-20` over the stage (`ConsoleDock.tsx:98`) and the region paints an opaque background (`:119`), so a press on any part of it cannot reach the canvas today. Its tier-1 tests are green on arrival and, with the stage a mocked sibling, cannot fail whatever is built (architect A8 item 5). The journey leg is the only real observer. Say so in tasks.md rather than claim a red.

### 2.2 MODIFIED `system-console` — *The Log Tab Is the Sighting Log's Home on This View* (required if the mount latch is built)

Header to copy character-for-character (`openspec/specs/system-console/spec.md:1237`):

`### Requirement: The Log Tab Is the Sighting Log's Home on This View`

**The sentence the latch falsifies** (`spec.md:1239`): "The log SHALL NOT issue its first pile read, and the panel SHALL show no log content, until the interior read's first load (the read is in flight and no interior for this system is held) has answered or failed; until then the Log tab's panel SHALL show a waiting indication that is not the log's own loading state."

The prohibition itself survives a stricter gate. What becomes false is the scenario built on it, *The expanded dock's Log panel holds the log* (`spec.md:1241-1244`): "**GIVEN** the interior read's first load has finished and the corporation's pile holds records / **WHEN** the dock is expanded / **THEN** the log … is inside the Log tab's panel". With D-16's latch, on a return to a system whose interior React Query still holds (`gcTime` 5 min, `lib/query-client.ts:79`) the first load "has finished", the re-read is in flight, and an expanded panel shows the waiting indication, not the log. The live "until then" clause also ends the waiting indication at a moment the latch extends past. So: one MODIFIED block, per the rule that a MODIFIED block is for a sentence actually falsified.

Live scenario headings under it — all ten must be reproduced verbatim (the archiver matches by title; `harness/openspec-reconcile.py` checks it):

1. `#### Scenario: The expanded dock's Log panel holds the log`
2. `#### Scenario: The log's loading, empty and failed states appear in the panel`
3. `#### Scenario: The log reads nothing until the interior read's first load has finished`
4. `#### Scenario: The panel shows a waiting indication while the interior read's first load is in flight`
5. `#### Scenario: The panel shows the log once the interior read's first load has answered or failed`
6. `#### Scenario: A settled sweep's report link expands a collapsed dock to the Log tab`
7. `#### Scenario: A settled sweep's report link does not collapse an expanded dock`
8. `#### Scenario: No standalone toggle and no floating log remain`
9. `#### Scenario: Activating a ghost while the dock is collapsed highlights the ghost and leaves the dock collapsed`
10. `#### Scenario: The row for an activated ghost is highlighted when the tab is next shown`

**The draft's A7 instruction "Rename and widen the scenario" cannot be followed.** Headings 3, 4 and 5 say "first load" and cannot be renamed inside a MODIFIED block (archiver trap; `openspec validate --strict` does not catch it). Leave those three with their cold-cache bodies and add new scenarios for the warm case. Edits inside the block: the gate sentence (A7's paste-ready replacement — "the interior read the view opened with — its first load, or the re-read of an interior it already held — has answered or failed"); scenario 1's GIVEN ("the interior read the view opened with has finished"); three or four new scenarios (§ 3, M-1). Scenarios 6-10 carry unchanged; scenario 8's "the log is not shown while the dock is collapsed" stays true of a hidden log.

### 2.3 Checked and NOT modified

| Live requirement | Draft says | Finding |
| --- | --- | --- |
| `system-console` *The Dock Is Keyboard-Operable* (`spec.md:1291-1343`, 11 scenarios) | restore the M1 clause in it; its Escape focus scenario was "cut from" it | **No sentence is falsified.** "WHEN the dock collapses while keyboard focus is in its tab bar or its panel, focus SHALL move to the "Console" control" stays true for a collapse by Escape. The M1 clause ("focus anywhere else … SHALL NOT be moved by a collapse") is an addition, not a correction, so it goes in ADDED R3. A MODIFIED block here would carry 11 headings to add one sentence — the trap 2a-iv's RULING 8 and 2b-i's RULING 12 name. Its headings, should the writer disagree: *Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard*; *Each dock control shows a visible focus indicator*; *The expand and collapse controls expose their state*; *The tab bar is a tab list controlling the panel*; *The shown panel is exposed as the Log tab's panel and has an accessible name*; *Tab from the Log tab reaches the collapse control and then the panel's controls*; *Expanding moves keyboard focus to the selected tab*; *The report's link to the log moves focus to the Log tab*; *Collapsing with the collapse control moves focus to the Console control*; *The dock's controls follow the strip's chevron in the tab order*; *The camera controls still precede the scene's hit targets with the dock expanded*. |
| `system-console` *The Console Dock Extends Beneath the Strip…* (`:1171`) | — | True. "Expanding and collapsing the dock SHALL change no live region's text outside the tab panel's own content": `SightingLog` holds no live region. |
| `system-console` *The Dock Carries These Tabs* (`:1220`) | — | True; untouched until 2b-ii. |
| `system-console` *The Dock Has One Fixed Height…* (`:1345`) | — | True. If the row-into-view scroll stays in scope, note its sentence "its first row SHALL lie wholly inside the panel area at the panel's scroll origin" is about the origin and is not contradicted by a later scroll. |
| `system-console` *The Fleet Cell's Chevron and Menu Are Keyboard-Operable* (`:180-201`) | bounded by A5 | Not touched. Its scenario "Escape closes the menu without choosing" is the filed drift (§ 9, Q6). |
| `sighting-log` *The Log Reads on Mount, After a Sweep Settles…* (`sighting-log/spec.md:123-168`) | no delta | Agreed. *The log refetches after a sweep settles* becomes true; *A mount during an unsettled past-ETA sweep reads the pile after the settling read* is kept true at the new mount site by the latch. "SHALL read the pile when the log mounts" is not literally true on a fresh cache entry, today or after (Q3) — pre-existing, to file. |
| `sighting-log` *The Log Is Reachable From the System Space View Without Leaving It* (`:193-213`) | — | True; Escape is a second way to close and "Closing the log returns to the view intact" holds for it. |
| `sighting-log` *A Log Row and Its Ghost Address the Same Record By Its Served Id* (`:215-280`) | — | **One scenario needs a ruling, not a delta (Q9):** "Activating a ghost whose row is not loaded highlights the ghost alone" has GIVEN "…or the log is not open" and THEN "no row is highlighted". With the log mounted and hidden, a loaded row carries `data-highlighted="true"` while not shown. True as presentation, arguable in the DOM. |
| `system-space-view` *A Running Sweep Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the Pile* (`system-space-view/spec.md:2436`) | — | True and unaffected: it binds "the corporation's sighting pile for the open system" (the filtered read). The unfiltered re-read is `sighting-log`'s. |
| `system-space-view` *The Sweep Surface's Reads Fail Independently…* (`:2875`) | — | True; it enumerates "the system-filtered sighting-pile read" only. U1's independence scenario sits in R1. |
| `system-space-view` *A Settled Sweep and the Scan Controls Are Reachable and Announced* (`:2921`), *The Scan Surface Remains Usable While the Canvas Is Unavailable* (`:2839`) | — | Not false until 2b-ii moves `ScanControl`. |
| `system-space-view` *Animation Never Re-Renders the View…* (`:2941`) | — | Not falsified, but a permanently mounted log re-renders on every view render with every loaded page's rows; see § 11 risk 3. |

### 2.4 No-delta closure

`drift-sighting-log-not-reread-after-sweep-settles.md`: confirmed OPEN and exactly as recorded. Both settle exits still call only `refetchGhostFeed` (`SystemSpaceView.tsx:147` via `onSettled={refetchGhostFeed}` at `:857`; `:436`), and nothing outside tests names the unfiltered key (`grep 'sightings\.\(pile\|all\)'` finds only `hooks/use-sightings.ts:28` and `lib/query-keys.ts:104`). Closed here by a build task plus two view-level tests over the real hook; the record's Status line is edited at the gate.

## 3. Scenarios per requirement

Provenance tags: DRAFT (Part 1 of the draft), PANEL (a named finding), INFERRED (mine; for reviewers to confirm or drop).

**R1 — A Tab's Content Stays Mounted While It Is Not Shown**

1. *Pages loaded with load-more survive a collapse and re-expand* (DRAFT). Rows of both pages listed; no pile request by the collapse or the expansion. Note for the SDET: this passes for a remounting build on a fresh cache entry; it discriminates only where the cache entry is stale (a default-`staleTime` test client, which the harnesses use) — see § 4 claim 12.
2. *A highlighted row is still highlighted after a collapse and re-expand* and 3. *A row's no-mark statement is still shown after a collapse and re-expand* (DRAFT, **split**). The draft's single scenario is impossible: selecting a row with no ghost clears the highlight (`SightingLog.tsx:143-147`), and a row is highlighted only if it has a ghost (`:196`). Two rows, two scenarios. The no-mark statement is the component's only local state (`:121`) and so the only tier-1 witness that the content was not remounted (Q8).
4. *Nothing of the log is reachable while the dock is collapsed* (DRAFT). Tab walk from the chevron to the end of the view; no log element focused or exposed.
5. *A pile read that answers while the dock is collapsed is shown on re-expand* (DRAFT). No further request by the expansion.
6. *A pile read that failed while the dock was collapsed shows its failed state on expansion* (PANEL U1). Failed state with retry, neither empty nor loading; no request by the expansion.
7. *The log's retry and the sightings-unavailable card's retry are independent* (PANEL U1).
8. *A further page requested just before a collapse is listed on re-expand* (INFERRED). The mid-load-more state of § 5.
9. Dropped: the draft's *The log is shown and exposed while its tab is selected* (duplicates live scenario 1 of the Log-home requirement).

**R2 — Showing or Hiding the Log Tab Issues No Read**

1. *The log's first read is issued without the dock being expanded* (DRAFT, GIVEN per Q3: a view opened by loading the document, the interior read it opened with finished).
2. *Expanding and re-expanding after the first read issues no request* (DRAFT).
3. *A record filed since the last read is listed after an explicit refresh* (DRAFT).
4. *The report's link to the log issues no pile request* (INFERRED; the second open path, `SystemSpaceView.tsx:305`).
5. Dropped by U7 and confirmed dropped: *A record filed since the last read is not listed on re-expansion*.

**R3 — Escape Collapses the Expanded Dock**

1. *Escape with focus inside the dock collapses it* and moves focus to the "Console" control (DRAFT + the draft's cut keyboard scenario; "inside" = tab bar or panel, A6).
2. *Escape with focus outside the dock leaves focus where it was* (PANEL U2): camera control.
3. *Collapsing with focus on the strip's chevron leaves focus there* (PANEL A6/M1): menu closed.
4. *Collapsing by a pointer press that moves no focus leaves focus on the chevron* (PANEL M1; `fireEvent.click`, not `user.click`).
5. *Escape with the dock collapsed changes nothing* (DRAFT).
6. *Escape collapsing the dock clears no selection* (DRAFT): same body, same acting fleet, no request.
7. *Escape with the fleet cell's menu open closes the menu and leaves the dock expanded* (DRAFT, GIVEN per A5: focus on one of its entries); a second Escape then collapses the dock.
8. *Escape with focus on no control collapses the dock* (INFERRED): focus on the document body, the state a pointer press leaves in Safari and Firefox on macOS.
9. *Escape with focus in a text field or a select of the view collapses the dock and keeps the field's value* (INFERRED, Q5).
10. *A held Escape that closed the menu does not also collapse the dock* (INFERRED, Q10).
11. *Escape collapses the dock in the strip's failure states* (INFERRED; interior failed, own-fleets failed, canvas unavailable — the states live *The dock is present and expandable in the strip's failure states* names).

**R4 — Activating the Dock Changes No Space-View Selection**

1. *A pointer press on any part of the dock leaves the selection unchanged* (DRAFT): the "Console" control, tab bar, Log tab, panel, collapse control; add the log's own controls (refresh, a row, load-more) as rows (INFERRED — a row selection highlights a ghost, which *A Ghost Is Not a Member of the Space View's Selection* already keeps out of the selection).
2. *Expanding and collapsing the dock leaves the acting fleet unchanged* (DRAFT), by pointer, by keyboard, and by Escape.

**M-1 — additions inside the MODIFIED Log-home block**

- *The log reads nothing while the re-read of an interior the view already held is in flight* (PANEL A7): no unfiltered pile read and no log content, collapsed and expanded.
- *The panel shows the waiting indication during that re-read and the log once it has answered or failed* (PANEL A7/U3).
- *A later interior re-read neither removes the log nor issues a pile read* (PANEL A7; the latch is not a live condition — the view re-reads the interior every 20 s, `lib/realtime.ts:27`, `SystemSpaceView.tsx:618-622`).
- *The highlighted row is brought into view in the panel* (PANEL U4/D-20) — only if the scroll stays in scope (§ 6).

## 4. Every draft claim, re-verified against the tree

| # | Draft claim (where) | Verdict | Evidence at HEAD |
| --- | --- | --- | --- |
| 1 | The log mounts on show behind `!interior.isLoading` (`SystemSpaceView.tsx:910`) | CONFIRMED, line STALE | `SystemSpaceView.tsx:811-822`: `logTabContent = !dock.expanded ? null : interior.isLoading ? <ConsolePanelWaiting /> : <SightingLog … />` |
| 2 | Floating panel `:910-922`, toggle `:996-1003`, `logOpen` `:295` (design Context) | STALE | deleted by 2b-i; dock state `{ expanded, openSeq }` at `:300`, `openDockOn` `:301-303`, `collapseDock` `:304`, `openLog` `:305` |
| 3 | Two settle exits, both calling only `refetchGhostFeed` (`:145` via `:830`; `:426`) | CONFIRMED, lines STALE | watcher: `onSettled()` at `:147` inside the `.then` of `resyncInterior()` (`:144-146`), wired `:857`; early settle: effect `:429-441`, guard `:433`, call `:436` |
| 4 | Early settle is not an interior read; it is the `committedPending` true→false transition on a successful running-status read carrying nothing (A3) | CONFIRMED | `:395-398` (derivation), `:430-433`; the existing arrangement is `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` (its early-settle test ends near `:868-880`) |
| 5 | `onSettled` is a dependency of the watcher's timer effect, so the new callback must be stable (`:203`) | CONFIRMED, line STALE | deps array at `:205` |
| 6 | Nothing invalidates `['sightings','pile','all']` | CONFIRMED | § 2.4 grep |
| 7 | Escape is handled only by the fleet cell's chevron and entries, each calling `preventDefault()` (`VitalsStripFleetCell.tsx:96-98`, `:112-114`) | CONFIRMED | same lines. No other Escape handler exists in the view: `SpaceStage.tsx:678,717,754` handle Enter/Space and arrows only; no `keydown` listener on `document` or `window` outside `app/spike/` |
| 8 | A5/drift record: "a menu opened by pointer in a browser that does not focus a clicked button … never sees the key" | **WRONG for a menu with entries** | `VitalsStripFleetCell.tsx:76-78` focuses the first entry whenever the menu opens, by any means. The unfocused state is real only (i) for an empty menu (failed own-fleets read or no fleets, `:74`) opened by pointer in such a browser, and (ii) after focus leaves an open menu (Tab, or a press elsewhere; there is no blur or outside dismiss). The drift record's evidence line should be narrowed |
| 9 | D-7: "React dispatches [the menu's handlers] from the root container before the event reaches `document`" | **WRONG as a description of production** | Next 15.5.25 hydrates with `const appElement = document` (`node_modules/next/dist/client/app-index.js:30,224`), so React's delegated listener and the dock's listener are both on `document`; the menu still wins, but by listener registration order, not by propagation. Under RTL the container is a `div`, so tier 1 proves the propagation story only. The menu-open leg must be must-PASS at tier 4 (§ 10, § 11 D-b) |
| 10 | The `hidden` attribute is built for "the shell's own region and the Console control" only | CONFIRMED | `ConsoleDock.tsx:108` (`hidden={expanded}` on the "Console" control) and `:118` (`hidden={!expanded}` on the region). The panel's content is passed as `null` while collapsed by the view |
| 11 | Draft task 1.4: a stateful probe child in a `ConsoleDock`-level test fails a conditional-render implementation | **STALE — green on arrival** | `ConsoleDock.tsx:155` renders `{tab.content}` in both states and has since 2b-i; the conditional is in the view (`SystemSpaceView.tsx:811`). The mount-once witness must be a view-level test |
| 12 | "Pages … survive" / "no request" scenarios distinguish mounted from remounted | PARTLY WRONG | loaded pages live in the query cache, not the component, and survive a remount for `gcTime`; a remount on a fresh entry issues nothing. Discriminating witnesses: a request count on a stale entry (the tier-1 harness clients use the default `staleTime` 0), or the no-mark statement. At tier 4 inside 60 s the request count cannot tell the builds apart (§ 10) |
| 13 | App-wide 60 s stale time (`lib/query-client.ts:78`); `gcTime` 5 min (`:79`) | CONFIRMED | same lines; `useSightings` sets neither (`hooks/use-sightings.ts:27-36`) |
| 14 | `isLoading` is false from the first render when the interior is cached; a latch on `!isLoading && !isFetching` is needed; harness mocks without `isFetching` are unaffected | CONFIRMED | no test file under `components/space/` except `ScanControl.test.tsx` mentions `isFetching`; every `useSystemSpace` mock omits it, so the latch opens at once in those harnesses |
| 15 | The ghost layer keeps its own gate (`:816`) | CONFIRMED, line STALE | `SystemSpaceView.tsx:843` |
| 16 | `SightingLog.tsx:176-188` tests `isLoading`, not `isPending` | CONFIRMED | `:176` (`isError` first), `:183` (`isLoading`) |
| 17 | `Query.fetch` joins an in-flight first read (`query.js:166-176`) | CONFIRMED | `node_modules/@tanstack/query-core/build/modern/query.js:166-178` |
| 18 | `SystemSpaceView.test.tsx` (52) and `…render-loop.test.tsx` (6) do not mock `use-sightings` | CONFIRMED | neither file has that `vi.mock`; neither mocks `@/lib/services`; both build clients with `retry: false` (`:417`; `:211,220`). 52 + 6 = 58 |
| 19 | Harnesses that mock the hook: scan-refetch, scan-targets-refetch-on-arrival, scan-settle-announcement, burn-preview, stranding-notice | CONFIRMED, list INCOMPLETE | also `SystemSpaceView.console-dock.test.tsx:53` (per-argument, records calls), `…sighting-log-no-ghost-reasons.test.tsx:57`, `…sighting-log-mount-ordering.test.tsx:90`; and `SightingLog.test.tsx:54`, `SightingLog.drawn-record-membership.test.tsx:45`. Real hook over a mocked service: only `hooks/use-sightings.test.tsx:15` |
| 20 | "No assertion in them counts hook calls except the mount-ordering file" | STALE | `SystemSpaceView.console-dock.test.tsx:536,541` also counts calls with `null`; both stay true under a latch |
| 21 | `…scan-refetch.test.tsx:264-274` and `…on-arrival.test.tsx:757` assert the hook mock's `refetch` spy and stay green only if the fix invalidates by key | CONFIRMED | `:264,274` (`sightingsRefetch`), `:757-759`. D-11's "invalidate, do not thread the log's `refetch`" is load-bearing for these files staying unedited |
| 22 | A9: `scan-journey` "four uses of the toggle `:150`, `:219`, `:252`, `:293`"; "collapse the dock before `ghost.click()`"; stale comment in `scan-fixtures.ts:250-253` | STALE — all done by 2b-i | § 7 |
| 23 | A9: fizzle spec `:296-299`; vitals intercept `:458-460` | CONFIRMED, lines STALE | `scan-lane-transit-fizzle.spec.ts:293-302`; `vitals-strip-journey.spec.ts:463-465` |
| 24 | D-20: `SightingLog` takes `shown`, scrolls the highlighted row on `[shown, highlightedGhostId]` | NOT BUILT (as expected) | `SightingLogProps` at `SightingLog.tsx:16-48` has no such prop |
| 25 | The existing dock tests were written to survive this link | CONFIRMED | `SystemSpaceView.console-dock.test.tsx:22-25` and `expectLogNotShown` at `:247-251` ("unmounted or hidden") |

## 5. State and figure sweep, in one pass

### 5.1 Every state the log can be in while the dock is collapsed, and what expansion shows

| # | State while collapsed | What expansion shows | Request caused by expanding | Covered by |
| --- | --- | --- | --- | --- |
| 1 | Latch closed: the interior read the view opened with is in flight (cold or warm) | the waiting indication (`console-panel-waiting`), not "Reading the pile…" | none | M-1; live scenarios 3-5 |
| 2 | Latch opens while expanded | the waiting indication is replaced by the log in its loading state | none (the mount issues the first read) | M-1; live scenario 5 |
| 3 | First read in flight | "Reading the pile…" (`SightingLog.tsx:183-184`) | none | live scenario 2 |
| 4 | First read failed, no data | the failed state with Retry (`:176-182`) | none | R1.6 |
| 5 | First read answered, no records | the empty state (`:185-188`) | none | live scenario 2 |
| 6 | One page listed, more exist | rows and Load more | none | R1.1 |
| 7 | Two or more pages listed | every page's rows | none | R1.1 |
| 8 | Load-more requested, then collapsed before it answered | the appended rows once it lands (the observer stays subscribed) | none | R1.8 (INFERRED) |
| 9 | Load-more failed while collapsed | **the failed state replaces the rows already listed**: an infinite query whose next-page fetch fails is in `error` status with its data kept, and `:176` tests `isError` before anything else | none | not specified anywhere — Q11 |
| 10 | Re-read in flight (settle or Refresh) over listed rows | the earlier rows, unchanged, with no in-progress indication (`isLoading` is false when data is held); they are replaced when every loaded page has been re-read | none | R1.5 covers the landed case |
| 11 | Re-read failed over listed rows | as row 9: the failed state, the rows withdrawn | none | Q11 |
| 12 | A ghost was activated; its row is loaded | the row highlighted; with D-20, brought into view | none | live scenario 10; M-1 (scroll) |
| 13 | A ghost was activated; its row is not on a loaded page | no row highlighted; nothing pages (`sighting-log` *Activating a ghost whose row is not loaded…*) | none | owner's |
| 14 | A row was selected before the collapse and had a ghost | still highlighted — unless the scene stopped drawing that ghost meanwhile (canvas unavailable, ghost feed re-read without it), in which case `hasGhost` is false and the highlight is gone (`:137-141`, `:196`) | none | R1.2; scenario GIVEN must fix the scene |
| 15 | A row was selected and had no ghost: the no-mark statement | still shown — **even if the scene has since drawn that record's ghost**; the statement is sticky local state (`:121`), not derived | none | R1.3; Q8 |
| 16 | The panel was scrolled | unspecified. A `display: none` box keeps no scroll offset contract; not read from a browser here | none | Q7 |
| 17 | A record was minted elsewhere since the last read, no sweep settled in this view | not listed until Refresh or the next settle (RULING 8's stated cost) | none | R2.3 |
| 18 | A sweep settled in this view while collapsed | the new record listed (the D1 fix) | none | `sighting-log` live scenario; tests 1.9, 1.10 |
| 19 | The network reconnected while collapsed and the entry was stale | whatever that refetch returned — a read outside the three named triggers | none by expanding | Q4 |

Figures rendered by the hidden content: only `asOf` through `Figure` with the served `scale` (`SightingLog.tsx:80-86`), already owned by `sighting-log` and `figure-formatting`. No new figure, no new wire field; nothing here needs a value the served types lack.

### 5.2 Every way Escape can arrive, and what should happen

| # | Where focus is / what is open | Should happen | Basis | Tier |
| --- | --- | --- | --- | --- |
| 1 | Dock expanded, focus on the Log tab, the collapse control, Refresh, a row, Load more or Retry | dock collapses; focus moves to the "Console" control | RULING 6, RULING 18, live keyboard requirement | 1 + 4 |
| 2 | Focus on a camera control or a body / lane-gate hit target | collapses; focus not moved | U2, RULING 18 clause 3 | 1 (stage is mocked in the view harness — use the mock's buttons) + 4 |
| 3 | Focus on the document body (after a pointer press in a browser that does not focus a clicked button) | collapses | D-7's reason for a `document` listener | 1 + 4 |
| 4 | Focus on the strip's chevron, menu closed | collapses; focus stays on the chevron | A6, M1; `VitalsStripFleetCell.tsx:96` consumes Escape only when `open` | 1 |
| 5 | Focus on the chevron, menu open | menu closes, focus on the chevron, dock stays expanded; a second Escape is row 4 | live menu requirement; `:96-98` | 1 + 4 (must-PASS, § 4 claim 9) |
| 6 | Focus on a menu entry | as row 5 | `:112-114` | 1 + 4 |
| 7 | Menu open, focus elsewhere (Tab out of it; a press elsewhere; an empty menu opened by pointer in a non-focusing browser) | by mechanism: the dock collapses and the menu stays open. R3 as worded by A5 promises nothing here | filed drift; Q6 | not specced; journey logs it if it arranges it |
| 8 | Focus in a text field (`FleetActionsPanel.tsx:366,467,503`) | collapses; the field keeps its value | RULING 6 "from anywhere in the view"; Q5 | 1 |
| 9 | Focus on a native select, popup closed (`FleetActionsPanel.tsx:353,454`; `ScanControl.tsx:294`) | collapses | as row 8 | 1 |
| 10 | A native select's popup is open | engine-dependent whether the page sees the key | RULING 6: "journey observation only, never specced" | logged, never asserted |
| 11 | Focus inside a toast (`sonner` 2.0.7 handles Escape on `document` without `preventDefault`, `node_modules/sonner/dist/index.mjs:1055`) | the toast list un-expands and the dock collapses | RULING 6: observation only | logged |
| 12 | A modal | no modal is mounted by the system space view (`components/space/`, `components/fleet/` import no dialog) | — | vacuous today |
| 13 | Escape held down (auto-repeat) with the menu open | the first keydown closes the menu; a repeat must not then collapse the dock | Q10 (INFERRED) | 1 |
| 14 | Escape during text composition (IME) | should not collapse | INFERRED, design note only (the view's text fields are numeric) | — |
| 15 | Dock collapsed (focus anywhere, "Console" control included) | nothing changes | RULING 6 | 1 |
| 16 | Interior failed / own-fleets failed / canvas unavailable / the loading overlay up | as rows 1-3: the dock is present in all of them | live *The dock is present and expandable in the strip's failure states* | 1 (parametrised) |
| 17 | The view has unmounted (galaxy route) | nothing; the listener is gone | D-7 "while, and only while, the dock is expanded" | 1 |
| 18 | The Next dev-mode issues overlay is open (the e2e stack is a dev build) | the overlay takes it | framework occupant; the journey hides `nextjs-portal` (D-14) | journey setup |

Rows 8 and 9 change character in 2b-iv, when those inputs move into the dock: Escape from a field then hides the field being edited. That is the ordinary meaning of "Esc closes the panel" and nothing is lost (the content stays mounted), but 2b-iv should read this row.

## 6. Sizing, in the predecessor's unit

Unit: one task = one test arrangement group with one closing assertion (rows of one parametrised arrangement share a task); plus build tasks, one task per migrated file, the journey and the gate.

| Section | Tasks | Count |
| --- | --- | --- |
| 1. View level, real `useSightings` over a mocked `sightingService` (new file) | state survives (highlight; no-mark statement); rows listed with no request by expansion (two pages / read landed while collapsed / load-more landed while collapsed); failed while collapsed; independent retries; nothing reachable (Tab walk and role query over a loaded log); first read with no expansion; expand, collapse, expand and the report link issue no request; Refresh lists the new record; settle re-read on the ETA exit; settle re-read on the early-settle exit with its failed-read control row; mount ordering, log-specific cold arm; warm-cache arm (no read until the re-read finishes; a later re-read changes nothing); waiting indication under the latch; row into view (spy) | 14 |
| 2. Escape, focus and not-a-pick (mocked reads; one shell-level) | Escape with focus in the tab bar or panel; Escape with focus elsewhere, parametrised; Escape changes no selection, acting fleet or request count, and nothing while collapsed; menu open then second Escape (with the auto-repeat row); pointer-press collapse that moves no focus; Escape in the failure states and after unmount (INFERRED); not-a-pick, parametrised over the dock's parts; the log's own controls change no selection (INFERRED) | 8 |
| 3. Existing tests re-arranged | `SystemSpaceView.console-dock.test.tsx` re-read and `expectLogNotShown` tightened; the family run with every red attributed before any edit; `scan-lane-transit-fizzle.spec.ts`; `scan-journey.spec.ts`; `vitals-strip-journey.spec.ts` note; `console-dock-journey.spec.ts` note | 6 |
| 4. Build | content always mounted and hidden behind the latch, with the waiting indication; the settle re-read at both exits; the Escape listener and the focus guard; `SightingLog` `shown` and the scroll | 4 |
| 5. Gate | per-commit gate; the journey spec; QA reads the journey and names closing lines; tier 4; tier 3; reconcile and strict validate; archive rehearsal; Purpose check; chain doc and the drift record's closure; file the gap records (§ 9) | 10 |
| **Total as fully drafted** | | **42** |

Range: **38** if the two INFERRED groups in section 2 become rows of their neighbours (legitimate: same closing assertion, one more parameter) and the row-into-view scroll is shed (its test and its build task); **44** if the early-settle control row and the unmount row are split out as a strict reader would. The architect's 30 (panel report A1) was 15 tests + 2 migrations + 4 build + 9 gate; the difference is the M1 pointer-press arrangement (added after his count), U1's failed state and the Tab walk counted as their own groups, Escape's focus-outside group, four migration tasks he listed in A9 but did not count, and the filing task.

**Recommendation — plain.**

1. **No new chain link.** The remainder a split would create is the Escape block: 6 tasks of substance carrying 9-10 gate tasks, a panel and two or three adversary rounds. That is not worth a fifteenth link.
2. **Author at 38:** shed the row-into-view scroll (U4 / D-20) to a filed follow-up (`followup-log-highlighted-row-into-view.md`, read by 2b-ii's author). It is the least chain-bound item — the chain doc's *Delivers* line for this link does not name it — it is the only reason to edit `SightingLog.tsx`, and the architect already named it "first candidate to shed". Fold the two INFERRED groups into rows.
3. **If the count passes 40 after the architect's recount (do it before the adversary) or the panel:** the seam is *content lifetime* (R1, R2, M-1, the D1 fix, the e2e migrations — `SystemSpaceView.tsx` only) against *keyboard and pointer* (R3, the focus clause — `ConsoleDock.tsx` only; R4 has no build). The two halves share no code and no test harness. Move R3 into 2b-ii's authoring as a filed follow-up; 2b-ii already makes arrow keys and tab activation real. Cost, said out loud: the dock goes one more link with the collapse control as the only way out, which is what a player has today, and the chain doc's "`Esc` collapses the dock" slips a second time. The journey's "collapse by Esc" leg becomes "collapse by the collapse control".
4. Do not shed the latch or the D1 fix: each keeps a live `sighting-log` scenario true at the new mount site.

## 7. E2E precondition migrations this link forces

What changes in time: one more `GET /v1/sightings` (no `systemId`) at every view open once the interior read is at rest, and the log's DOM exists, hidden, from then on; showing the log is no longer a read. Re-verified against the specs as 2b-i's gate left them.

| Spec | Lines now | Precondition before | Precondition after | Edit |
| --- | --- | --- | --- | --- |
| `e2e/tests/scan-lane-transit-fizzle.spec.ts` | 293-302 | opening the dock mounted the log, hence a read; `rows toHaveCount(0)` proved the server pile empty after the fizzle. The comment at `:296-298` says so: "the log still reads when shown, so zero rows still means what it meant" | the log read at view open (`:276` is a hard navigation, so a cold cache), which may precede the sweep's settlement; a later settle re-read may still be in flight when the count is taken, and `toHaveCount(0)` passes at once on the earlier answer | **Required.** Open the dock, invoke Refresh, wait for the unfiltered `/v1/sightings` response, then count. Rewrite the comment |
| `e2e/tests/scan-journey.spec.ts` step 5 | 119-149 | the dock is collapsed and "the log is NOT mounted until this click — the link is the first show of the log in this document load, which is what keeps the just-settled record listed. Do not expand the dock earlier in this test" (`:123-127`) | the log has been mounted and read since view open; the row at `:143` is there only if the settle re-read ran — the end-to-end form of the D1 fix | **Required (comment and intent, not selectors).** The assertions at `:132` (`toBeHidden`), `:141-149` hold unchanged. Optionally assert that the link's click caused no unfiltered `/v1/sightings` request |
| same, collapse leg | 151-172 | "log unmounted, "Console" control back" (`:159`) | hidden, not unmounted; `toBeHidden` at `:164` still passes | comment only |
| same, mount path | 243-293 | seed, `page.goto('/')`, `page.goto` the system, expand, find the seeded row | unchanged in effect: both navigations reload the document, so the mount read sees the seed | none |
| same, cross-highlight test | 298-380 | draft said: collapse the dock before `ghost.click()` | **already done by 2b-i**: the ghost is activated while collapsed (`:340`), the dock expanded after (`:347`); both later reads follow a `page.reload()` | none |
| `e2e/tests/vitals-strip-journey.spec.ts` | 463-465; header 55-64 | the `**/v1/sightings**` route failed one read (the ghost feed); the header calls `ghostFeed.isError` "the only lever" | it fails two; the log sits in its failed state, hidden. Every assertion in the leg is scoped to `sightings-unavailable` (`:471-478`) and Playwright role queries skip hidden elements | **Note only**, so a second "Retry" in the DOM is not read as a regression |
| `e2e/tests/console-dock-journey.spec.ts` (new since the draft) | header 22-45; leg 13 at 808-879 | fixture: "three sighting records seeded into its pile, then a reload so the log's first read sees them"; leg 13 logs, never asserts, whether the settled record is listed, "(`keep-console-tab-content-mounted`'s)" | fixture still true (the reload gives a cold cache and the route predicate at `:439-442` spares the unfiltered read). The Tab walks skip a hidden log | **Note only**; the assertion that leg defers is this link's own journey's. Do not upgrade leg 13 in place — one journey spec per change |
| `e2e/tests/burn-cost-overlay-journey.spec.ts`, vitals geometry legs | 1022-1034; 483-499 | column 564 px, cluster at 100 px | unchanged; done by 2b-i | none |
| `e2e/helpers/scan-fixtures.ts` | 247-254 | stale "drawer open over `scan-control`" comment | already corrected by 2b-i | none |
| every other spec that opens a system view | — | — | one extra request at open. No spec counts `/v1/sightings` requests or waits on one (`grep` over `e2e/`: the only route or wait on that path is `vitals-strip-journey.spec.ts:463` and `console-dock-journey.spec.ts:439`); no `getByText` in `e2e/` matches the log's copy | none |

Tier 1, for the same reason: the 58 tests of `SystemSpaceView.test.tsx` and `…render-loop.test.tsx` gain a second unmocked read; I found no role or text query in either that the hidden log's content can satisfy (neither file uses a text query at all). `…render-loop.test.tsx` measures renders with a React `Profiler`: a second asynchronous read settling inside a measured window is a possible new commit. The ghost feed's real read already has that property and the file is green, so this is a risk to attribute at the family run, not a predicted red.

## 8. Open questions

Lean order: chain doc → root `CLAUDE.md` / `openspec/project.md` → predecessor panel. None is a HARD-STOP candidate.

**Q1 — Is the mount latch built, and with it the MODIFIED block?** Passage: design.md D-16, "The log's content mounts at the first render of this mount of the view in which no interior read is in flight … and then stays mounted". Lean: chain doc ("the mount latch with its warm-cache arm" is in *Delivers*), architect A7. Options: (a) latch plus the 10-heading MODIFIED block of § 2.2; (b) keep `!interior.isLoading` and no MODIFIED — ships `sighting-log` *A mount during an unsettled past-ETA sweep reads the pile after the settling read* false on every return to a held system, where today a hand-opened log escapes it; (c) latch built but stated only in ADDED text — leaves live scenario 1 false in the warm window. Most reversible: (a) (one block, one expression). Recommend (a), with headings 3-5 left on their cold-cache bodies and the warm case in new scenarios.

**Q2 — Where does the "focus elsewhere is not moved by a collapse" clause live?** Draft: "Clause, to restore in *The Dock Is Keyboard-Operable*". Lean: chain doc, *Taught* 2b-i ("MODIFY … whatever live sentence the move actually falsifies, nothing else") and RULING 12. Options: (a) ADDED, in R3, covering a collapse by any means; (b) MODIFIED keyboard block, 11 headings. Most reversible: (a). Recommend (a). The pointer-press scenario (R3.4) then sits in a requirement titled for Escape; the writer may prefer a sentence in R3's body that says "by Escape or by the collapse control" to keep the title honest.

**Q3 — "Reads on mount" against the 60 s stale time.** Draft scenario: "THEN the log's first pile read is issued", GIVEN as amended by A7 "with no pile read answered earlier in the session". A read answered within 60 s is served from cache and no request is issued (`lib/query-client.ts:78`); "earlier in the session" is the wrong boundary (the entry goes stale after 60 s and is collected after 5 min). No chain lean; architect A7 leans to qualifying the GIVEN. Options: (a) GIVEN "the view was opened by loading the document" (a cold cache, arrangeable at both tiers) and file the literal gap against `sighting-log` "SHALL read the pile when the log mounts"; (b) make the log's query always read on mount — one option, but it adds a request to every return to a system and changes the hook for a pre-existing gap. Most reversible: (a). Recommend (a).

**Q4 — R2's "and no others".** Passage: "The log's reads are those *The Log Reads on Mount…* names and no others". False on network reconnect for an always-subscribed observer, and it restates the owner. Lean: RULING 12 (restate nothing). Options: (a) cut the sentence; state only that showing and hiding issue no request and that the first read does not wait for an expansion; (b) keep it and turn off reconnect refetch for this query. Most reversible: (a). Recommend (a); record the reconnect read in design.md Risks.

**Q5 — Escape while a text field or select has focus.** Passage: RULING 6, "Escape collapses the expanded dock from anywhere in the view". The view has three text fields and three selects (§ 5.2 rows 8-9). Lean: RULING 6 (anywhere). Options: (a) collapse, value kept, as ruled; (b) ignore Escape whose target is editable. Most reversible: (a) — link 4 MODIFIES this requirement anyway. Recommend (a) with one parametrised scenario so it is a decision and not an accident.

**Q6 — The fleet menu's Escape drift: IN or OUT?** `drift-fleet-menu-ignores-escape-when-unfocused.md`, adjudication open. **Recommend OUT**, for three reasons: the fix is an outside-dismiss or blur rule inside `VitalsStripFleetCell.tsx`, a file 2b-i's contract fenced (§ 8.4 of the impl contract) and this link otherwise never opens; it needs a MODIFIED block on *The Fleet Cell's Chevron and Menu Are Keyboard-Operable* and at least two new arrangement groups, with the count already at the cap; and it is independent of the dock — nothing here is made easier or harder by it. What it bounds: R3 may promise the dock stays expanded only "when the fleet cell's open menu takes the key (focus on the chevron or on one of its entries)", and must stay silent on an open menu that does not hold focus — a scenario for that state would write the drift's behaviour into a second requirement. Also amend the drift record's evidence (§ 4 claim 8): the non-empty menu focuses its first entry on open. Sub-question for the panel: whether the proposal's "Costs said out loud" should state that in that state Escape collapses the dock and leaves the menu open.

**Q7 — Does the panel's scroll position survive a collapse?** No document says. "Collapsing the dock SHALL NOT discard the content's state" (R1) reads as if it does; a `display: none` box has no scroll contract and I did not measure one. Options: (a) say nothing and have the journey log `scrollTop` before and after; (b) state that it returns to the origin unless a highlighted row is brought into view; (c) require it preserved (needs code). Most reversible: (a), with R1's sentence narrowed to the state it means (loaded pages, the selected row's statement, the read's state). Recommend (a).

**Q8 — Should a scenario pin the no-mark statement surviving?** Draft: "the same row is still selected and the statement is still shown". The statement is sticky and can be false by the time the dock is re-expanded (§ 5.1 row 15) — the same over-pinning U7 removed from R2. It is also the only tier-1 witness of "not remounted". Options: (a) keep it, GIVEN the scene unchanged between collapse and expansion; (b) drop it and witness mount identity only in the test (not in the spec). Most reversible: (a). Recommend (a).

**Q9 — `sighting-log`'s "or the log is not open … no row is highlighted".** `sighting-log/spec.md:266-271`. With a hidden mounted log the loaded row carries the highlight attribute while not shown. Lean: RULING 10 and RULING 12 — no `sighting-log` delta; live `system-console` already says the row "SHALL be highlighted when the Log tab is next shown". Options: (a) no delta, read "highlighted" as presentation, and have R1 say a row's highlight is not presented while its tab is not shown; (b) MODIFIED `sighting-log` block (5 headings) dropping the "or the log is not open" arm. Most reversible: (a). Recommend (a); the adversary should be pointed at it.

**Q10 — A held Escape.** INFERRED: with the menu open, the first keydown closes the menu and an auto-repeat keydown would then collapse the dock, so one physical press does both. Options: (a) the dock ignores a repeated keydown; (b) leave it. Most reversible: (a) (one condition). Recommend (a) as a design decision with one test row; no spec sentence beyond the scenario.

**Q11 — A failed load-more or re-read over listed rows.** `SightingLog.tsx:176` shows the failed state in place of the rows whenever the query is in error, data or not. Pre-existing and `sighting-log`'s; this link makes it reachable while hidden (§ 5.1 rows 9, 11). Options: (a) R1.6's GIVEN names the first read only and the owner's rule is left alone; (b) add a row pinning "the rows are withdrawn". Most reversible: (a). Recommend (a), and have the SDET arrange R1.6 on the first read so the test does not pin the other by accident. Worth a line in the gap records (§ 9) since `sighting-log` has no scenario for it either way.

**Q12 — Shed order (orchestrator's).** § 6: row-into-view first, at authoring; the Escape block second, to 2b-ii, only if the count passes 40. Lean: the cap (chain doc; RULING 15's "adversary growth past 40 is met by shedding … not by merging boxes").

## 9. To FILE, not fix

None of these is filed yet (`ls docs/handoffs` at HEAD has no record for any). Each predates this link.

| Record | What it says | Evidence it carries |
| --- | --- | --- |
| **The settle watcher's disarm race** (against `system-space-view` *A Running Sweep Self-Schedules the Refetch That Settles It…*) | if the running-status read answers "nothing running" before the watcher's timer fires, the effect is torn down and no follower read is issued for the ghost layer, the report or the log | the timer effect is keyed on `eta` and its cleanup clears the timer (`SystemSpaceView.tsx:136`, `:138-205`); `eta` comes from `useRunningScan`, whose key `queryKeys.actions.running(fleetId)` is shared with `useRunningMine` (`hooks/use-actions.ts:23-44`) and is invalidated by a mine commit, a cancel (`:57`) and a scan commit; any read of the inbox folds a due action server-side. Reachable on a remount with a stale inbox entry. The latch removes the commonest way for the log to meet it; the hole stays |
| **The ghost layer's warm-cache mount gate** (against `sighting-log` *The Log Reads on Mount…*, second paragraph, as restated for the ghost layer) | on a return to a held system the ghost feed mounts and reads alongside the interior re-read that settles a past-ETA sweep | `SystemSpaceView.tsx:843` gates `SightingsGhostFeed` on `!interior.isLoading`, which is false from the first render when the interior is cached (design.md D-16). The log gets a latch here; the ghost layer does not |
| **The join-in-flight first read** | a settle re-read requested while the entry's first read is unanswered issues nothing and the earlier answer is taken as fresh | `query-core/build/modern/query.js:166-178`; applies to the log's invalidation and to the ghost layer's `refetch()` alike. Rejected fix and why: design.md D-11 last bullet |
| **(also) The first read inside the interior's stale window** | a return within 60 s issues no interior read, so the latch opens at once and the log's first read precedes the watcher's settling read by `ETA_CUSHION_MS` | design.md D-16 "One sub-case the latch does not order"; `lib/realtime.ts:24`. Corrected by the settle re-read, but the letter of "first pile read … only after" is unmet |
| **(also) "Reads when the log mounts" on a fresh cache entry** | Q3 | `lib/query-client.ts:78`; `hooks/use-sightings.ts:27-36` |
| Amend, do not re-file: `drift-fleet-menu-ignores-escape-when-unfocused.md` | narrow its evidence | § 4 claim 8 |
| Close: `drift-sighting-log-not-reread-after-sweep-settles.md` | at the gate, with the two test names | § 2.4 |

## 10. Journey feasibility

The chain's journey: "expand, load more, collapse by Esc, re-expand to the same pages and highlight with no request; commit a sweep, let it settle, and find the new record in the Log tab with no refresh." One new spec (one journey per change), provisioned once in `beforeAll`, viewport 1280×720, carrying the `[journey-console]` hard assertion and the `nextjs-portal` hide.

| Leg | Reachable on a real fixture? | How, or why not |
| --- | --- | --- |
| Expand by the "Console" control | yes | as `console-dock-journey.spec.ts` |
| Load more | **yes, by seeding** | the server pages at `PageMax = 50` (`backend/sightings/model.go:26`) and the hook sends no `limit`, so a second page needs 51 records. `seedSightingFixture` (`e2e/helpers/scan-fixtures.ts:126`) writes one record per Firestore-emulator PATCH; 2b-i seeded three. Seed 50 of them under a `systemId` other than home so the ghost layer (one page, filtered to the open system) does not draw fifty marks; their rows then show the raw system id, which `sighting-log` allows. Alternative, less pure: rewrite the request's query to add a small `limit` and let the real server page — real cursors, altered request |
| Collapse by Esc | yes | `page.keyboard.press('Escape')`. Add the menu-open leg as **must-PASS** — production dispatch order is not what tier 1 exercises (§ 4 claim 9) |
| Re-expand to the same pages with no request | yes, **with a better witness than the request count** | inside 60 s a build that remounts on show also issues nothing and gets its pages from the cache. Tag the `sighting-log` element before collapsing (a property set through `evaluate`) and require the same node after re-expanding; or use the no-mark statement on a seeded other-system row, which a remount loses. Log the unfiltered-request count as well |
| …and the highlight | yes, **may be UNTESTED** | needs a drawn ghost: one seeded record in the home system with a position, as `scan-journey.spec.ts:313-329`. `defect-seeded-sighting-ghost-not-drawn.md` is open and intermittent. When the ghost is not drawn, log UNTESTED; the no-mark statement leg does not depend on it |
| Commit a sweep and let it settle | **yes — 2b-i's UNTESTED leg has a path** | a fresh fleet "sits at an unattached point park with nothing inside focused-scan range" (`scan-journey.spec.ts:60-70`), which is why 2b-i's leg 13 found no target. `scan-journey` docks at the home station first (`:73-76`, `burnToSelectionAndDock`, `e2e/helpers/space-view.ts:449`) and then always has the attached host at distance zero; that test passed in the last gate (22.1 s whole, `add-console-dock-journey.md` run 2). The same arrangement is available here. It inherits the random-spawn family: a home with no station feature, the instant station burn (`defect-space-journey-instant-station-burn.md`), a spawn in gate range. So the leg is may-be-UNTESTED by draw, never by design |
| Find the new record with no refresh | yes, if the previous leg ran | keep the dock collapsed from before the commit; after the report appears, require on the wire an unfiltered `GET /v1/sightings` issued after the settling interior response and before any expansion, then expand by the "Console" control (not the report's link, so the leg does not lean on the link) and require the clean-sweep row naming the host and zero requests caused by the expansion. Log which settle exit fired (whether `scan-countdown` was ever shown): at world scale 5 the early-settle exit may be the one taken, and it is not controllable |
| A press on the dock is not a pick (A8 item 5) | yes | select a body (`selectFirstBodyMatching`), press the tab bar's empty area and the panel's empty area, require the selection unchanged. This is R4's only real observer |
| A failure while collapsed shows on expansion (U1) | yes | a route predicate failing only the unfiltered read (the mirror of `console-dock-journey.spec.ts:439-442`), reload, expand |
| The warm-cache latch | partly | "no unfiltered read before the interior re-read answers" is arrangeable by delaying the interior response on a client-side return from the galaxy route. The past-ETA ordering it exists for needs a sweep whose ETA passes while away — log UNTESTED; tier 1 holds it |
| Escape with a native select popup open, or focus in a toast | observation only | RULING 6; logged, never asserted |
| Another system | UNTESTED by design | as 2b-i: no player path for a one-hull corporation |

Size the sweep wait from the last gate's log, not from a guess (2a-iii-b's lesson): 2b-i budgeted 25 s of a 60 s test for it. Have QA read the journey spec before the single run.

## 11. Design decisions worth a design.md

Carried from the archived design.md, to re-state rather than re-derive: D-1 (`hidden`), D-2 (never `<Activity>`, never `experimental.routerBFCache`), D-7, D-8, D-11, D-16, D-20, D-21.

- **D-a The mount site is the view's, not the shell's.** The whole "stays mounted" build is the expression at `SystemSpaceView.tsx:811`; `ConsoleDock` already renders what it is given in both states (`ConsoleDock.tsx:155`).
- **D-b The Escape listener's ordering claim needs rewording and a tier-4 proof.** Production: both React's delegated listener and the dock's are on `document` (`app-index.js:30`); the menu's `preventDefault()` is seen because React registered first. Any change that registers the dock's listener in the capture phase, or before hydration, breaks it silently and tier 1 stays green. Also decide here: ignore `event.repeat` (Q10) and `event.isComposing`; the listener exists only while expanded; the focus decision is taken before the state change, as `handleCollapse` does today (`ConsoleDock.tsx:90-93`) — Escape must go through the same path so the focus rule is one rule.
- **D-c The settle re-read invalidates by key and keeps `refetchGhostFeed`.** Load-bearing for two existing test files staying unedited (§ 4 claim 21). The callback must be `useCallback`-stable (`:205` deps).
- **D-d The latch is a latch.** A ref or state set once per view mount; never `!isFetching` live (the 20 s poll would unmount the log). A failed read opens it. Theoretical starvation to record: on a warm return where each interior read outlasts the 20 s poll, `interior.refetch()` cancels and restarts the read (`cancelRefetch` defaults true once data is held), so `isFetching` never falls and the waiting indication stays. Not worth code; worth a Risks line.
- **D-e What each tier holds** (extends D-22): request counts and state survival are tier 1 over the real hook with a mocked service; focus is tier 1; the menu's precedence, a press not reaching the canvas, and the wire evidence of the settle re-read are tier 4.
- **Risks to carry:** (1) one more request at every view open for a surface that may never be shown; (2) records minted elsewhere appear on Refresh or the next settle, not on re-expansion; (3) a permanently mounted log reconciles every loaded row on every view render (50 rows per page, each with a `Figure`) under `display: none` — unmeasured, and `…render-loop.test.tsx` is the suite that would notice; (4) reconnect refetch (Q4); (5) the three gaps of § 9, inherited exactly.
- **Post-archive hand edit:** `system-console`'s `## Purpose` survives archiving now that the capability exists; consider one clause ("a tab's content stays mounted while it is not shown") — optional.

## 12. Out of scope (record in the proposal as deliberate)

- Tab switching, arrow keys between tabs, "Log tab activatable by Enter or Space", the Scan tab: 2b-ii.
- The second-press Escape rule (clear the selection): link 4, which MODIFIES R3.
- The fleet menu's unfocused-Escape drift (Q6); the ghost layer's warm-cache gate, the watcher's disarm race, the join-in-flight read (§ 9).
- A tab count (`Log · N`), a resize control, persisted dock state, camera reframing under the expanded dock, a collapsed-state failure marker for the log's read (UX U1 declined one).
- Any backend field, endpoint or query; the galaxy view; a mobile layout; palette or type changes; React `<Activity>`.
- Not absorbed: `followup-explain-withheld-burn-command.md`, `drift-commit-response-carries-no-delta-v.md`, `defect-fleet-can-rest-inside-star-clearance.md`, `drift-strip-cells-retain-figures-after-failed-fleets-read.md`.

## 13. Not verified here

- Nothing was executed. The `hidden`-attribute and `<Activity>` results are the predecessor architect's (design.md D-1, D-2); I re-read the sources they cite only for D-7 and D-11.
- React Query's reconnect default is stated from the library's documented default and the option's presence at `queryObserver.js:68`; I did not trace the observer's stale check.
- Whether a `display: none` panel keeps its scroll offset in Chromium (Q7) was not measured.
- Whether the home-station dock arrangement succeeds on a given random spawn is the fixture family's draw; the evidence is one passing run of `scan-journey.spec.ts:42` in the last gate.
- The task count is mine, from the test files and the draft; the architect has not recounted it.

STATUS: COMPLETE

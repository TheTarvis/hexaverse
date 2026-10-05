# keep-console-tab-content-mounted — panel: UX review

Reviewer: UX. Read-only; nothing under `openspec/`, no code or tests touched. Inputs: proposal, delta
(`system-console`, 4 ADDED / 1 MODIFIED), tasks (39), rulings index, analysis
§ 5 / § 12, live `system-console` and `sighting-log` text, predecessor `add-console-dock-panel-ux.md`,
`ConsoleDock.tsx`, `SightingLog.tsx`, `VitalsStripFleetCell.tsx` (Escape handling at :92-114).
`design.md` did not exist when I read.

Verdict: **UX-COMPLETE once U3 (one widened GIVEN) and U1/U2 (proposal cost text) are applied; none gates.**
0 BLOCKER, 0 MAJOR, 5 MINOR. Net cost against the 40-task cap: **zero tasks, zero test groups** (U3 is one more
row in the already-parametrised 2.5; the rest is proposal prose or a filed follow-up).

## Area results

- **Five states of the log while hidden / at expansion.** Covered. Analysis § 5.1 rows 1-8, 10, 12-15, 17-18 each
  have a scenario or a ruling; waiting-on-interior (cold and warm), loading, empty, failed (first read), populated
  and paged, load-more in flight at collapse are all pinned. No finding. Rows 9 and 11 (failed load-more or
  failed re-read withdrawing listed rows, RULING 12) are the honest hole: ruled out, filed. Note for the filed gap
  record only: this is now reachable while the log is hidden, so the player meets "could not be read" in place of
  rows they saw earlier, having never watched it happen; Retry refetches every loaded page, so it recovers. Not a
  dead end, no reversal asked.
- **Focus on every collapse path.** Covered: focus in tab bar / panel -> "Console"; camera control, chevron, body
  -> untouched; pointer press that moves no focus -> untouched; text field / select -> collapse, value kept. The
  one-sided-build check holds: a build that always focuses "Console" fails the chevron and camera scenarios; one
  that never does fails the first. No finding.
- **Escape vs the fleet menu.** One gap, U3. The RULING 7 state (menu open, focus not on chevron or an entry) is
  stated honestly in the proposal. Experience in that state: Escape collapses the dock, the menu stays open (its
  chevron still reports expanded), and Escape on the collapsed dock changes nothing. Not a dead end: pointer on
  the chevron toggles it; for a keyboard user Shift+Tab back to the chevron and Escape closes it. Not worth a
  scenario (RULING 7 stands); worth one sentence in the narrowed evidence of
  `drift-fleet-menu-ignores-escape-when-unfocused.md` (the recovery path), at task 5.10, no new task.
- **Assistive-technology exposure while collapsed.** Covered by "Nothing of the log is reachable ..." and the
  highlight-not-presented scenario; the waiting indication is panel content in the same hidden region. No finding.
- **Dead ends.** None. Waiting indication ends on answer or failure of the interior read; failed log has Retry and
  Refresh; collapsed dock always has "Console".
- **SHALL NOT vs a one-sided build.** "No pick" is only observable in the journey (task 2.6 says so itself; fine).
  "No request on show", "no focus move", "no selection change", "no collapse on repeat" each have a failing
  scenario. The IME clause in task 4.3 has none (U4).
- **Cost honesty.** Freshness cost: stated and complete. Silent failure while collapsed: implied (an Out-of-scope
  bullet) but never said as a cost (U1). Row-into-view: stated. Report -> log handoff: unstated (U2).

## Findings

### U1 — MINOR — the proposal's Costs section omits two player-visible costs it relies on

Attaches to: proposal.md "Costs said out loud" (and, by it, *Showing or Hiding the Log Tab Issues No Read*).

Evidence: the freshness cost names Refresh as the remedy, but the log's refresh gives no in-flight or
nothing-new feedback over a held pile (`SightingLog.tsx:166-171` calls `refetch()`; `isLoading` is false when
data is held, so nothing renders; analysis § 5.1 row 10). And the first read now happens at view open, so a
transient failure of the unfiltered read can sit hidden until the player first looks; the only mention is
"a collapsed-state failure marker" under *Out of scope* (accepted by predecessor U1). Neither is a defect to fix
here (both are `sighting-log` territory, RULING 1); both are things a reader of the Costs list must be told.

Paste-ready (append to "Costs said out loud"):

```
- **A failure of the log's read is silent while the dock is collapsed.** The `sightings-unavailable` card is the
  ghost feed's; a failure of the log's own unfiltered read shows nowhere until the dock is expanded, where the
  failed state and its Retry are waiting. With the first read now issued at view open, such a failure is more
  likely to be sitting there when the player first looks. A collapsed-state failure marker is out of scope.
- **Refresh is the remedy for the freshness cost and gives no feedback of its own over listed rows.** While the
  re-read is in flight the listed rows show unchanged with no in-progress indication, and a refresh that finds
  nothing new changes nothing visible. That is `sighting-log`'s to specify and is not changed here.
```

### U2 — MINOR — the report's link can land on a log that does not yet list the record it points at

Attaches to: *The Log Tab Is the Sighting Log's Home on This View* (report-link scenarios) and *Showing or
Hiding the Log Tab Issues No Read* ("The report's link to the log issues no pile request").

Evidence: the settle re-read is issued when the sweep settles (task 4.2) and the report appears at the same
settle; "no request caused by the activation" is true even when the re-read is still in flight. The player who
follows the report's link in that window sees the earlier rows with no in-progress indication (§ 5.1 row 10), the
new clean-sweep row appears later without announcement, and a re-read failure replaces the rows with the failed
state (RULING 12). The window is one round trip, so MINOR, and a scenario would cost a test group over a race
tier 1 can only arrange by holding the response. Recommend a cost bullet, not a scenario; if the orchestrator
prefers a scenario, file it as a follow-up for 2b-ii (which adds the second tab and the same re-read surface).

Paste-ready (append to "Costs said out loud"):

```
- **The report's link can open a log whose settle re-read is still in flight (analysis § 5.1 row 10).** The link
  issues no request (the re-read was issued at the settle), so for one round trip the log lists the rows it held
  before, without the sweep's new row and with no in-progress indication; the row appears when the re-read
  answers, and a failed re-read shows the log's failed state in place of the rows (RULING 12).
```

### U3 — MINOR — the menu-precedence scenarios cover focus on an entry only; the requirement also names the chevron

Attaches to: *Escape Collapses the Expanded Dock*, scenarios "Escape with the fleet cell's menu open closes the
menu and leaves the dock expanded" and "A held Escape that closed the menu does not also collapse the dock".

Evidence: the requirement says the menu takes the key with "keyboard focus on the chevron or on one of the menu's
entries". Both scenarios' GIVEN is entry-only. Open-menu-with-focus-on-chevron is reachable (Shift+Tab from the
first entry). It is a different handler (`onChevronKeyDown`, `VitalsStripFleetCell.tsx:96`) and a build that
checks the event target against the menu's entries only passes today's scenarios and collapses the dock from the
chevron. Cost: widen the GIVEN; task 2.5 already has an arrangement-group shape, add one row (its closing
assertion is unchanged); no new task.

Paste-ready (replace the first scenario's GIVEN and WHEN-compatible; second scenario's GIVEN likewise):

```
#### Scenario: Escape with the fleet cell's menu open closes the menu and leaves the dock expanded
- **GIVEN** the dock is expanded and the fleet cell's menu is open, with keyboard focus on one of its entries, and again with keyboard focus on the chevron
- **WHEN** Escape is pressed
- **THEN** the menu closes with focus on the chevron
- **AND** the dock is still expanded
- **AND** a second Escape then collapses the dock
```
(The headings are new in this delta; no MODIFIED-block verbatim constraint applies.) Add to task 2.5: "parametrised
over focus on a menu entry and focus on the chevron with the menu open".

### U4 — MINOR — task 4.3 builds a behaviour no scenario or requirement states (IME composition)

Attaches to: tasks.md 4.3 ("ignoring ... a keydown during composition"); analysis § 5.2 row 14 (INFERRED, "design
note only; the view's text fields are numeric").

Evidence: nothing in the delta requires it and no task tests it; a one-sided build cannot be failed. Either keep
it as a `design.md` note or drop the clause from 4.3. Recommend dropping it from 4.3 (no reachable IME input in
the view today; link 2b-iv, which moves inputs into the dock, is where it would become real, and its author reads
the Escape-from-a-field row already). No delta text; edit of one clause in tasks.md. Zero tasks.

### U5 — MINOR — Escape from outside the dock collapses it with nothing announced to a screen-reader user

Attaches to: *Escape Collapses the Expanded Dock*, scenario "Escape with focus outside the dock leaves focus where
it was".

Evidence: focus stays on, say, a camera control by design (RULING 3); the dock closes silently. The "Console"
control's `aria-expanded` reflects the state when reached, but a screen-reader user who pressed Escape on a camera
control gets no signal that the dock collapsed. Not specced in the predecessor either (expand by the report's link
has the same shape, which U2 of the parent handled by moving focus). A live announcement is a new surface and a
new test group; against the cap and the chain's "keep the strip quiet" stance, recommend filing as a follow-up for
2b-ii (which touches dock state announcements with tabs) rather than adding here. If the orchestrator wants it
now, the text is:

```
#### Scenario: A collapse by Escape is announced to assistive technology when focus stays outside the dock
- **GIVEN** the dock is expanded with keyboard focus on a camera control
- **WHEN** Escape is pressed
- **THEN** assistive technology is told that the console collapsed, and keyboard focus is still on that camera control
```

Suggested follow-up filename: `docs/handoffs/followup-announce-dock-collapse-by-escape.md`.

## Rulings

No RULING is asked to be reversed. RULING 7 (silent on an unfocused open menu), RULING 8 (scroll unspecified),
RULING 12 (failed load-more or re-read unspecified), RULING 13 (row-into-view shed) are each stated honestly in the
proposal; the experiences they leave are recoverable.

## Summary

| id | sev | one line |
| --- | --- | --- |
| U1 | MINOR | Costs list omits "log read failure silent while collapsed" and "Refresh gives no feedback over listed rows" (paste-ready bullets) |
| U2 | MINOR | Report link can open a log whose settle re-read is in flight; add a cost bullet, no scenario |
| U3 | MINOR | Menu-precedence scenarios cover focus on an entry only; widen GIVEN to the chevron (one row in task 2.5) |
| U4 | MINOR | Task 4.3's IME clause builds an unspecified, untestable behaviour; drop it |
| U5 | MINOR | Escape-from-outside collapse is silent to screen readers; file as follow-up (text provided) |

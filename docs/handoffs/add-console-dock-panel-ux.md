# add-console-dock — Phase-1 panel: UX review

Reviewer: UX. Read-only; nothing under `openspec/` or the code was edited. Inputs: delta spec (9 requirements / 52 scenarios), design.md, rulings 7/8/10, analysis §§ 4, 5, 7, live `system-console` / `sighting-log` / `system-space-view` text, `SightingLog.tsx`, `SystemSpaceView.tsx` (log toggle, floating panel, `sightings-unavailable` card), canvas `Collapsed`/`Main`.

Verdict: **NEEDS SCENARIOS.** 0 BLOCKER, 5 MAJOR, 5 MINOR. No data-loss or stuck state; the MAJORs are one lost-focus path, one blank state, one invisible cross-highlight, one failure that must survive being collapsed, and one missing ARIA role.

## Rulings

- **RULING 7 — CONFIRM `Log`, no count.** A truthful N is computable from the client only when no `nextCursor` is held (rows loaded = total); otherwise it is a lower bound, and the pile is unfiltered, mixing clean sweeps and other systems. Worse, the log is read lazily and may be loading or failed while the tab label is on screen: `Log · 0` would read as "empty" during loading and failure, which `sighting-log` *The Log's Empty, Loading, and Failed States Are Each Explicit* exists to prevent. A label that mutates on every load-more also re-names the tab for assistive technology. Not recommending any defined N; the scenario "label carries no count however many rows are loaded" is right as written.
- **RULING 8 — CONFIRM no read on show, with one wording change (U7).** The freshness loss is real but narrow: the only records the player mints themselves arrive through the settle re-read (RULING 9) and Refresh is one control away. Reading on every expand would be the tab-flip poll the owning requirement forbids. Do not pin the invisible negative ("does not list the new record") as a scenario; pin the absence of a request, which is already pinned.
- **RULING 10 — CONFIRM, with a positive scenario (U4).** The ghost is already highlighted in the scene, which is the player's feedback; auto-opening a 220 px dock over the canvas the player is pointing at is the wrong trade, and open-on-select belongs to link 4. But the scenario only says the dock stays collapsed; it must also say the ghost shows its highlight, and (U4) that the row is visible when the dock is next shown.

## Findings

### U1 — MAJOR — a pile-read failure while collapsed must survive to the expansion, and not read as empty

Attaches to: *A Tab's Content Stays Mounted While It Is Not Shown* (and *The Log Tab Is the Sighting Log's Home*).

Answer to the brief's question: while the dock is collapsed, nothing tells the player the log's own read failed. The `sightings-unavailable` card is the ghost feed's (system-filtered pile) and appears only when that read fails; a failure of the unfiltered read alone is silent. That is no worse than today (a closed log shows nothing), and I do not recommend a collapsed-state failure marker: it would be a new figure/affordance on a surface the chain keeps quiet. But the first read now happens at view open, so a failure is far more likely to be sitting there when the player first looks. The spec pins the failed state only for "dock expanded WHILE the read fails". Pin the other order, plus that the two retries are independent (consistent with *The Sweep Surface's Reads Fail Independently*).

```
#### Scenario: A pile read that failed while the dock was collapsed shows its failed state on expansion
- **GIVEN** the dock is collapsed and the log's pile read has failed
- **WHEN** the dock is expanded
- **THEN** the panel shows the log's failed state with its retry affordance, and neither its empty state nor its loading state
- **AND** no pile request was issued by the expansion

#### Scenario: The log's retry and the sightings-unavailable card's retry are independent
- **GIVEN** both the system-filtered pile read and the log's unfiltered pile read have failed and the dock is expanded
- **WHEN** the sightings-unavailable card's retry is activated and that read succeeds
- **THEN** the log still shows its failed state until its own retry or the explicit refresh succeeds
```

### U2 — MAJOR — focus on expand is unspecified, and the "Console" control that holds focus may unmount

Attaches to: *The Dock Is Keyboard-Operable*; the settle-report scenarios in *The Log Tab Is the Sighting Log's Home*.

The spec states only where focus goes on collapse. On expand, the "Console" control is replaced by the collapse control (the spec's own scenarios say the "Console" control is present when collapsed and a collapse control is present when expanded), so a keyboard player pressing Enter on "Console" loses focus to the start of the document, and the dock's controls sit after the strip's chevron, behind the whole column and the camera controls. The settle report's "open the log" link has a second crack: when the dock is already expanded on the Log tab (scenario "does not collapse an expanded dock") activation changes nothing visible, so it reads as a dead control; with focus unmoved a screen-reader user hears nothing either. Both are cured by moving focus to the selected tab on any expand. Inferred scenario "where does focus go on expand" is ruled: focus goes to the selected tab.

```
#### Scenario: Expanding moves keyboard focus to the selected tab
- **GIVEN** the dock is collapsed with keyboard focus on the "Console" control
- **WHEN** the "Console" control is activated with Enter
- **THEN** keyboard focus is on the Log tab, and the dock's controls are reachable by Tab from there

#### Scenario: The report's link to the log moves focus to the Log tab
- **GIVEN** a settled sweep's report is shown
- **WHEN** the report's affordance that opens the log is activated, with the dock collapsed and again with it expanded
- **THEN** in each case the dock is expanded with the Log tab selected and keyboard focus is on the Log tab

#### Scenario: Escape with focus outside the dock leaves focus where it was
- **GIVEN** the dock is expanded with keyboard focus on a camera control
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on that camera control
```

Also add to the keyboard requirement's prose: "WHEN the dock expands, keyboard focus SHALL move to the selected tab."

### U3 — MAJOR — expanding while the interior read's first load is in flight shows a blank panel (loading state unspecified)

Attaches to: *The Log Tab Is the Sighting Log's Home*, scenario "The log is not mounted while the interior read's first load is in flight".

That scenario pins "no log content is present in either state". The "Console" control is present throughout that window (and expandable), so a player can open an empty 128 px panel with no indication of why. Today the toggle opens nothing visible either, but there the log simply had not been asked for; here the player has asked. The log's own loading text must not be borrowed (it claims a pile read that is deliberately not issued). Pin a neutral wait indication; also say what "finished" means so a failed interior read does not leave the panel blank forever (the log then mounts and reads, per the dock being expandable in the failure states).

```
#### Scenario: The panel shows a waiting indication while the interior read's first load is in flight
- **GIVEN** the interior read's first load has not finished
- **WHEN** the dock is expanded
- **THEN** the Log tab's panel shows a waiting indication rather than an empty region, and no pile request has been issued

#### Scenario: The panel shows the log once the interior read's first load has answered or failed
- **GIVEN** the dock is expanded and the interior read's first load is in flight
- **WHEN** the interior read answers, or fails
- **THEN** the waiting indication is replaced by the log, which issues its first pile read
```

### U4 — MAJOR — the cross-highlight can land on a row the player cannot see

Attaches to: *The Log Tab Is the Sighting Log's Home*, scenario "The row for an activated ghost is highlighted when the tab is next shown" (and the expanded-dock case).

The panel area is 128 px; a row is about four lines tall and the log carries its own title and refresh row, so at the 1280×720 floor roughly one to two rows are in view. A highlight on row 9 of a scrolling list is no feedback. `sighting-log` does not (and should not, by this change's own RULING 12) say "scrolled into view"; the dock owns the geometry that makes it necessary. Also RULING 10's scenario lacks the positive half.

```
#### Scenario: Activating a ghost while the dock is collapsed highlights the ghost and leaves the dock collapsed
- **GIVEN** the dock is collapsed and a ghost is drawn for a record whose row the log has loaded
- **WHEN** the ghost is activated in the scene
- **THEN** the ghost is highlighted in the scene and the dock is still collapsed

#### Scenario: The highlighted row is brought into view in the panel
- **GIVEN** the log has loaded more rows than the panel area shows, at a 1280×720 CSS-pixel viewport, and a ghost was activated for a record whose row lies beyond the visible part of the panel
- **WHEN** the dock is expanded, and again when a different such ghost is activated while the dock is expanded
- **THEN** the highlighted row lies wholly inside the panel area without the player scrolling it
```

(Replaces the existing "Activating a ghost while the dock is collapsed leaves it collapsed" scenario, whose THEN is a subset.)

### U5 — MAJOR — the panel itself is never exposed as a tab panel

Attaches to: *The Dock Is Keyboard-Operable*, scenario "The tab bar is a tab list controlling the panel".

The scenario exposes the tab as selected and controlling the panel, but says nothing of the panel's own role or name; a tab that controls a generic container is half the pattern, and the "Console"/collapse controls name "the region they control" with no statement that the region has an accessible name. Inferred scenario (ARIA tabs, `aria-expanded`/`aria-controls`): accepted, extended as follows. With one tab, arrow-key movement is shed to 2b-ii by RULING 13; fine, but Tab from the Log tab must continue into the panel's controls, which the order scenarios do not state.

```
#### Scenario: The shown panel is exposed as the Log tab's panel and has an accessible name
- **WHEN** the dock is expanded
- **THEN** the panel that is shown is exposed as a tab panel whose accessible name is the Log tab's label

#### Scenario: Tab from the Log tab continues into the panel and then to the collapse control
- **GIVEN** the dock is expanded with keyboard focus on the Log tab and the log has loaded rows
- **WHEN** Tab is pressed repeatedly
- **THEN** the log's controls are reached in reading order, and the collapse control is reached exactly once, with no element reached twice
```

(Tab order of the collapse control relative to the panel — before or after — is the architect's; the scenario is written to be true either way.)

### U6 — MINOR — pointer target size of the two new controls

Attaches to: *The Dock Is Keyboard-Operable* (or *The Dock Has One Fixed Height…*). The canvas chip is 4 px padding around a 16 px glyph, i.e. exactly 24 px tall; the collapse control's size is not in the canvas. WCAG 2.2 target-size minimum is 24 × 24 CSS px; anything under it at the floor is a regression the spec can prevent for one line. The 1280×720 floor is a mouse/trackpad desktop target; no touch size is claimed.

```
#### Scenario: The dock's pointer targets are at least 24 CSS pixels square
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock collapsed and then expanded
- **THEN** the "Console" control, the Log tab and the collapse control each have a hit area at least 24 CSS pixels wide and 24 CSS pixels tall
```

### U7 — MINOR — scenario over-pins an invisible negative

Attaches to: *Showing or Hiding the Log Tab Issues No Read*, scenario "A record filed since the last read is not listed on re-expansion". It asserts a staleness the design admits is a cost and a future improvement (e.g. refetch on expand when older than the stale window) would have to delete. The behaviour that matters is already pinned by "Expanding and re-expanding after the first read issues no request" and by the refresh scenario. Recommend dropping it; if the writer keeps it, put it in the proposal's costs, not in a SHALL scenario. No new text.

### U8 — MINOR — the first row and the refresh control should fit the 128 px area at the floor

Attaches to: *The Dock Has One Fixed Height…* (D-12 leaves per-tab layout unspecified; this pins reachability only, not layout). The log's own title ("Sighting Log") repeats the tab's label above the refresh row; do not specify removing it, but pin the outcome.

```
#### Scenario: The refresh control and the first row are in view without scrolling the panel
- **GIVEN** the log has loaded at least one row, at a 1280×720 CSS-pixel viewport with the dock expanded
- **WHEN** the panel area is at its scroll origin
- **THEN** the log's refresh control and its first row are each wholly inside the panel area
```

### U9 — MINOR — one live sentence is shipped-false for the interval (the writer's open question)

`system-console` *The Vitals Strip Is Present…* says the strip is "the bottom-most always-visible band". Expanded, the tab bar and panel sit below it. "Always-visible" keeps the sentence defensible, but "bottom-most" is false for the user in the expanded state. UX ruling: not a user-facing defect, but the sentence should be reworded by a MODIFIED block or the architect should record why not. The other sentence (`system-space-view` keyboard scenario: the sighting-log affordance reachable "through the fleet panel") is NOT falsified: the affordance is the settle report's link and stays in the column until 2b-ii; leave it, as the writer proposes.

### U10 — MINOR — confirmations of the writer's remaining inferred scenarios

- Strip row 56 px scenario: keep; the canvas shows it and the dock height scenario depends on it.
- No announcement on expand/collapse: correct. `aria-expanded` is the state channel; announcing it as well would double-speak. (U2 gives focus a destination, which is what a screen-reader user needs.)
- Which tab on expand (Q3): vacuous with one tab; no scenario, correct.
- Altitude: "the canvas has received no pick" and "no live region's text changes" are observable and acceptable. The 52 scenarios hold no pixel, colour or copy text. "every floating surface … including one carrying a retry affordance" is an open enumeration but is tied to analysis § 5's list; ask the writer to cite that list in the tasks' journey spec so the enumeration is finite.

## Checked and found covered

- Five states of the dock shell: collapsed (default), expanded, failure states of the strip (expandable in each), reload and cross-system navigation. The log's loading/empty/failed states are deliberately `sighting-log`'s and are referenced, not restated, which is right. Load-more survival, tall-content scroll, and nothing-reachable-while-collapsed (focus and AT) are specified.
- Escape: expanded from anywhere, menu first, collapsed no-op, no selection or request effect. No dead end.
- Collapse with focus inside returns focus to "Console" (pointer and Escape variants).
- Discoverability of the log: the toggle is gone and the default is collapsed, so the log is reachable only through "Console" or the settle report's link. That is acceptable for this piece (the settle report is the high-intent entry and U2 makes it observable); revisit when the dock gains tabs that carry counts or markers (Q13, 2b-v).

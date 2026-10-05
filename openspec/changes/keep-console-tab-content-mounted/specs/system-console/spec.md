## ADDED Requirements

### Requirement: A Tab's Content Stays Mounted While It Is Not Shown

The content of a tab that is not shown — as of this change, the Log tab's content while the dock is collapsed — SHALL keep its state while it is not shown, and collapsing then expanding the dock SHALL NOT discard it: the pages the log has loaded, the row the player selected and the statement that row carries, and the state of the log's read are as the collapse left them, or as a read that finished while the dock was collapsed left them. Whether a row is highlighted still follows what the scene draws (*A Log Row and Its Ghost Address the Same Record By Its Served Id*), so a highlight is kept only while its ghost is still drawn, and this requirement states nothing about the statement of a row whose record came to have a ghost drawn while the dock was collapsed. While its tab is not shown the content SHALL be hidden from sight, from the keyboard tab order and from assistive technology, and a row's highlight SHALL NOT be presented. (The gloss: the content stays mounted.) The log's states, paging and highlight are as `sighting-log` and *The Log Tab Is the Sighting Log's Home on This View* specify them; this requirement restates none of them.

#### Scenario: Pages loaded with load-more survive a collapse and re-expand
- **GIVEN** the log lists the rows of a first page and of a second page loaded by its load-more control
- **WHEN** the dock is collapsed and then expanded
- **THEN** the rows of both pages are listed
- **AND** no pile request was issued by the collapse or the expansion

#### Scenario: A selected row's highlight survives a collapse and re-expand
- **GIVEN** the player selected a row whose record has a ghost drawn in the open system, so the row is highlighted, and the ghosts the scene draws do not change while the dock is collapsed
- **WHEN** the dock is collapsed and then expanded
- **THEN** the same row is highlighted

#### Scenario: A row's no-mark statement survives a collapse and re-expand
- **GIVEN** the player selected a row whose record has no ghost drawn in the open system, so the log states that the record has no mark there, and the ghosts the scene draws do not change while the dock is collapsed
- **WHEN** the dock is collapsed and then expanded
- **THEN** the same row is still selected and the statement is still shown

#### Scenario: A highlighted row is not presented while the dock is collapsed
- **GIVEN** a ghost was activated in the scene for a record whose row the log lists, and the dock is collapsed
- **WHEN** the page's visible and assistive-technology-exposed content is read
- **THEN** no row of the log is visible or exposed
- **AND** when the dock is then expanded that record's row is highlighted

#### Scenario: Nothing of the log is reachable while the dock is collapsed
- **GIVEN** the log has loaded rows and the dock is collapsed
- **WHEN** the keyboard tab order is walked from the strip's chevron to the end of the view
- **THEN** no element of the log receives focus
- **AND** no element of the log is exposed to assistive technology

#### Scenario: A pile read that answers while the dock is collapsed is shown on re-expand
- **GIVEN** the dock is collapsed and a pile read answers with a record the log had not listed
- **WHEN** the dock is expanded
- **THEN** the log lists that record
- **AND** no further pile request was issued by the expansion

#### Scenario: A further page requested just before a collapse is listed on re-expand
- **GIVEN** the log has requested a further page with its load-more control and the dock is collapsed before that page answers
- **WHEN** the page answers while the dock is collapsed and the dock is then expanded
- **THEN** the rows of both pages are listed
- **AND** no pile request was issued by the expansion

#### Scenario: A pile read that failed while the dock was collapsed shows its failed state on expansion
- **GIVEN** the dock is collapsed and the log's first pile read has failed
- **WHEN** the dock is expanded
- **THEN** the panel shows the log's failed state with its retry affordance, and neither its empty state nor its loading state
- **AND** no pile request was issued by the expansion

#### Scenario: The log's retry and the sightings-unavailable card's retry are independent
- **GIVEN** both the system-filtered pile read and the log's unfiltered pile read have failed and the dock is expanded
- **WHEN** the sightings-unavailable card's retry is activated and that read succeeds
- **THEN** the log still shows its failed state until its own retry or the explicit refresh succeeds

### Requirement: Showing or Hiding the Log Tab Issues No Read

Showing, hiding and re-showing the Log tab SHALL issue no network request. The log's first pile read, where *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* has the log issue one, SHALL NOT wait for the dock to be expanded: it SHALL be issued no earlier than the moment the interior read the view opened with, where the view opened with one, has finished (*The Log Tab Is the Sighting Log's Home on This View*), and whether the dock is expanded SHALL have no bearing on whether or when it is issued. Which later reads the log issues, and when, are as that requirement specifies; this requirement restates none of them.

#### Scenario: The log's first read is issued without the dock being expanded
- **GIVEN** the view was opened by loading the document and the interior read it opened with has finished
- **WHEN** the dock is never expanded
- **THEN** the log's first pile read is issued

#### Scenario: Expanding and re-expanding after the first read issues no request
- **GIVEN** the log's first pile read has been answered
- **WHEN** the dock is expanded, collapsed and expanded again
- **THEN** no network request is issued by any of the three actions

#### Scenario: The report's link to the log issues no pile request
- **GIVEN** the log's first pile read has been answered, a settled sweep's report is shown and the dock is collapsed
- **WHEN** the report's affordance that opens the log is activated
- **THEN** the dock is expanded with the Log tab selected
- **AND** no pile request was issued by the activation

#### Scenario: A record filed since the last read is listed after an explicit refresh
- **GIVEN** the log has listed a pile, the server now serves a record the log has not listed, and no sweep has settled in the view since the log's last read
- **WHEN** the dock is expanded and the player invokes the log's refresh affordance
- **THEN** the log lists the new record

### Requirement: Escape Collapses the Expanded Dock

WHEN Escape is pressed while the dock is expanded, anywhere in the system space view, the dock SHALL collapse, unless the fleet cell's open menu takes the key as *The Fleet Cell's Chevron and Menu Are Keyboard-Operable* has it do, in which case the dock SHALL NOT collapse. This requirement states the outcome while that menu is closed and while it is open with keyboard focus on the chevron or on one of its entries; it does not state what Escape does to the dock while the menu is open with keyboard focus elsewhere. One press of Escape SHALL do one thing: a repeated keydown of a held Escape that closed the menu SHALL NOT also collapse the dock. A collapse, by Escape or by the collapse control, SHALL NOT move keyboard focus that is outside the tab bar and the panel; with focus inside them, focus moves to the "Console" control as *The Dock Is Keyboard-Operable* states. A collapse by Escape SHALL change no space-view selection and no acting fleet and SHALL issue no request, and a text field or a select that held focus SHALL keep its value. While the dock is collapsed, Escape SHALL leave it collapsed and SHALL change no space-view selection and no acting fleet; what Escape does to the fleet cell's menu is that requirement's alone.

#### Scenario: Escape with focus inside the dock collapses it and moves focus to the Console control
- **GIVEN** the dock is expanded with keyboard focus on the Log tab
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed
- **AND** keyboard focus is on the "Console" control

#### Scenario: Escape with focus outside the dock leaves focus where it was
- **GIVEN** the dock is expanded with keyboard focus on a camera control
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on that camera control

#### Scenario: Collapsing with focus on the strip's chevron leaves focus there
- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron and its menu closed
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on the chevron

#### Scenario: Collapsing by a pointer press that moves no focus leaves focus on the chevron
- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron
- **WHEN** the collapse control is activated by a pointer press that does not move focus
- **THEN** the dock is collapsed and keyboard focus is still on the chevron

#### Scenario: Escape with focus on no control collapses the dock
- **GIVEN** the dock is expanded and keyboard focus is on no control, as after a pointer press that focuses nothing
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed

#### Scenario: Escape with focus in a text field or a select collapses the dock and keeps the field's value
- **GIVEN** the dock is expanded with keyboard focus in a field of the view holding a typed value, and again on a closed select showing a chosen option
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed
- **AND** the field's value and the select's chosen option are unchanged

#### Scenario: Escape collapses the dock in the strip's failure states
- **GIVEN** the dock is expanded while the interior read has failed, and again while the own-fleets read has failed, and again while the canvas is unavailable
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed in each

#### Scenario: Escape with the dock collapsed changes nothing
- **GIVEN** the dock is collapsed and a body is selected
- **WHEN** Escape is pressed
- **THEN** the dock is still collapsed and the same body is still selected

#### Scenario: Escape collapsing the dock clears no selection
- **GIVEN** the dock is expanded and a body is selected and a fleet is acting
- **WHEN** Escape is pressed
- **THEN** the dock collapses, the same body is still selected and the same fleet is still acting
- **AND** the press issues no network request

#### Scenario: Escape with the fleet cell's menu open closes the menu and leaves the dock expanded
- **GIVEN** the dock is expanded and the fleet cell's menu is open, with keyboard focus on one of its entries, and again with keyboard focus on the chevron
- **WHEN** Escape is pressed
- **THEN** the menu closes with focus on the chevron
- **AND** the dock is still expanded
- **AND** a second Escape then collapses the dock

#### Scenario: A held Escape that closed the menu does not also collapse the dock
- **GIVEN** the dock is expanded and the fleet cell's menu is open, with keyboard focus on one of its entries, and again with keyboard focus on the chevron
- **WHEN** Escape is pressed and held so that its keydown repeats
- **THEN** the menu closes
- **AND** the dock is still expanded

### Requirement: Activating the Dock Changes No Space-View Selection

Activating the "Console" control, the tab bar, a tab, the collapse control, or the panel and the controls inside it — every part of the dock other than the strip's row, which *Activating the Strip Changes No Space-View Selection* covers — by pointer or keyboard SHALL NOT change the space view's current body, lane-gate or point selection, SHALL NOT change the acting fleet, and SHALL NOT be treated as a space-view click, regardless of what the canvas draws beneath it. This mirrors *Activating the Strip Changes No Space-View Selection*.

#### Scenario: A pointer press on any part of the dock leaves the selection unchanged
- **GIVEN** a body is selected and a fleet is acting
- **WHEN** the "Console" control is pressed, and with the dock expanded the tab bar, the Log tab, the panel, the collapse control and the log's own refresh control, a row and load-more control are each pressed in turn
- **THEN** after each press the same body is selected and the same fleet is acting
- **AND** the canvas has received no pick from any of them

#### Scenario: Expanding and collapsing the dock leaves the acting fleet unchanged
- **GIVEN** a fleet is acting
- **WHEN** the dock is expanded and collapsed with the pointer, with the keyboard and, collapsing, with Escape
- **THEN** the same fleet is acting after each

## MODIFIED Requirements

### Requirement: The Log Tab Is the Sighting Log's Home on This View

The Log tab's panel SHALL be where the system space view shows the sighting log. This capability names that placement and restates none of `sighting-log`'s rules: the log's rows, refresh, load-more and its loading, empty and failed states are as `sighting-log` specifies them (*The Sighting Log Lists the Corporation's Own Pile in Served Order*, *The Log Pages Through the Pile With the Server's Own Cursor*, *The Log's Empty, Loading, and Failed States Are Each Explicit*), and the log's mount ordering is as *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* specifies it. The log SHALL NOT issue its first pile read, and the panel SHALL show no log content, until the interior read the view opened with — its first load, or the re-read of an interior the view already held — has answered or failed; until then the Log tab's panel SHALL show a waiting indication that is not the log's own loading state. A view that opens with no interior read in flight — it holds an interior it does not re-read at open, or its interior read has not been sent because the client is offline — has no such read to wait for: the log is then present from the view's first render, and this requirement imposes no wait. The ordering *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* requires is that requirement's and is not relaxed by this one. Once that read has answered or failed, a later re-read of the interior SHALL NOT remove the log from the panel, and the view SHALL NOT issue a pile read because a re-read of the interior answered or failed, except on a sweep's settle path, where it does (`system-space-view` *A Running Sweep Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the Pile*; `sighting-log` *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer*). A pile read with another cause is outside this sentence, whenever it falls. The affordance on a settled sweep's report that opens the log (*A Settled Sweep and the Scan Controls Are Reachable and Announced*) SHALL expand the dock with the Log tab selected and SHALL NOT collapse an expanded dock. The view SHALL carry no standalone toggle for the log and SHALL NOT show the log floating over the canvas. Activating a sighting ghost in the scene SHALL NOT expand the dock, and the ghost SHALL show its highlight; if that record is among the rows the log has listed, its row SHALL be highlighted when the Log tab is next shown.

#### Scenario: The expanded dock's Log panel holds the log
- **GIVEN** the interior read the view opened with has finished and the corporation's pile holds records
- **WHEN** the dock is expanded
- **THEN** the log, with its record rows and its refresh and load-more controls, is inside the Log tab's panel

#### Scenario: The log's loading, empty and failed states appear in the panel
- **WHEN** the dock is expanded while the pile read is in flight, then after it returns no records, then after a pile read fails
- **THEN** the panel shows the log's loading state, its empty state and its failed state with its retry affordance, each as `sighting-log` specifies

#### Scenario: The log reads nothing until the interior read's first load has finished
- **GIVEN** the interior read's first load has not finished
- **WHEN** the view renders, with the dock collapsed and then with it expanded
- **THEN** no read of the unfiltered pile is issued and no log content is present in either state

#### Scenario: The panel shows a waiting indication while the interior read's first load is in flight
- **GIVEN** the interior read's first load has not finished
- **WHEN** the dock is expanded
- **THEN** the Log tab's panel shows a waiting indication rather than an empty region, and that indication is not the log's own loading state

#### Scenario: The panel shows the log once the interior read's first load has answered or failed
- **GIVEN** the dock is expanded and the interior read's first load is in flight
- **WHEN** the interior read answers, or fails
- **THEN** the waiting indication is replaced by the log

#### Scenario: The log reads nothing while the re-read of an interior the view already held is in flight
- **GIVEN** the view has opened on a system whose interior it already held, the re-read of that interior is in flight, and the client holds no answer of the unfiltered pile newer than it keeps a read fresh
- **WHEN** the view renders, with the dock collapsed and then with it expanded
- **THEN** no read of the unfiltered pile is issued and no log content is present in either state
- **AND** once that re-read has answered or failed the log's first pile read is issued

#### Scenario: The panel shows the waiting indication during that re-read and the log once it has answered or failed
- **GIVEN** the dock is expanded and the re-read of an interior the view already held is in flight
- **WHEN** the panel is read, and then the re-read answers, or fails
- **THEN** the panel first shows a waiting indication that is not the log's own loading state
- **AND** the waiting indication is then replaced by the log

#### Scenario: A later re-read of the interior neither removes the log nor issues a pile read
- **GIVEN** the interior read the view opened with has finished, the log is present and its first pile read has been answered, no own fleet in the open system has a sweep running or past its ETA and unsettled, as the view last read it, and no scan commit is awaiting its first running-status answer
- **WHEN** the view re-reads the interior on its baseline cadence and that re-read answers, nothing else being invoked meanwhile
- **THEN** the log is still present with the rows it listed
- **AND** the number of pile requests issued is what it was before that re-read was issued

#### Scenario: A settled sweep's report link expands a collapsed dock to the Log tab
- **GIVEN** the interior read the view opened with has finished, a settled sweep's report is shown and the dock is collapsed
- **WHEN** the report's affordance that opens the log is activated
- **THEN** the dock is expanded with the Log tab selected and the log shown

#### Scenario: A settled sweep's report link does not collapse an expanded dock
- **GIVEN** a settled sweep's report is shown and the dock is expanded
- **WHEN** the report's affordance that opens the log is activated
- **THEN** the dock is still expanded with the Log tab selected

#### Scenario: No standalone toggle and no floating log remain
- **WHEN** the view is rendered with the dock collapsed and then expanded
- **THEN** no control labelled "Open sighting log" or "Close sighting log" is present in either state
- **AND** the log is not shown while the dock is collapsed
- **AND** while the dock is expanded the log is inside the dock's panel and nowhere else in the view

#### Scenario: Activating a ghost while the dock is collapsed highlights the ghost and leaves the dock collapsed
- **GIVEN** the dock is collapsed and a ghost is drawn for a record in the corporation's pile
- **WHEN** the ghost is activated in the scene
- **THEN** the ghost is highlighted in the scene and the dock is still collapsed

#### Scenario: The row for an activated ghost is highlighted when the tab is next shown
- **GIVEN** a ghost was activated in the scene while the dock was collapsed, for a record in the corporation's pile that the log lists once the dock is expanded
- **WHEN** the dock is expanded and the log has listed that record
- **THEN** that record's row is highlighted in the Log panel

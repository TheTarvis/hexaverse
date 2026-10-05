## ADDED Requirements

### Requirement: The Console Dock Extends Beneath the Strip and Is Collapsed on Every Mount of the View

The system SHALL render, on every render of the system space view, a console dock made of the vitals strip's row and, while the dock is expanded, a tab bar beneath that row and one tab's panel beneath the tab bar. The dock SHALL be collapsed on every mount of the system space view: collapsed, the dock is the strip's row alone, with a "Console" control that is not part of the strip. The dock's expanded state SHALL NOT be remembered across a reload or across navigation to another system. Expanding and collapsing the dock SHALL change no live region's text outside the tab panel's own content. The strip is unchanged in both states (*The Vitals Strip Is Present on Every Render of the System Space View* and *The Strip Carries No Verb* hold in each).

#### Scenario: The view opens with the dock collapsed
- **WHEN** the system space view opens
- **THEN** the strip is shown, no tab bar and no tab panel is shown, and the "Console" control is present

#### Scenario: Activating the Console control expands the dock
- **GIVEN** the dock is collapsed
- **WHEN** the "Console" control is activated
- **THEN** the tab bar and the selected tab's panel are shown beneath the strip's row
- **AND** a collapse control is present in the tab bar

#### Scenario: Activating the collapse control returns the dock to the strip alone
- **GIVEN** the dock is expanded
- **WHEN** the collapse control is activated
- **THEN** only the strip's row is shown and the "Console" control is present

#### Scenario: A reload shows the dock collapsed
- **GIVEN** the dock was expanded
- **WHEN** the view is reloaded
- **THEN** the dock is collapsed

#### Scenario: Navigating to another system and back shows the dock collapsed
- **GIVEN** the dock is expanded in one system's view
- **WHEN** the player navigates to another system's view
- **THEN** that view's dock is collapsed
- **AND** when the player navigates back to the first system, its dock is collapsed

#### Scenario: The strip reads the same in both states
- **GIVEN** reads that fill all five cells with figures and an acting fleet
- **WHEN** the dock is collapsed and again when it is expanded
- **THEN** in each state the strip shows its five cells with identical figures and its chevron

#### Scenario: The Console control is not part of the strip
- **GIVEN** the dock is collapsed
- **WHEN** the strip's interactive elements are enumerated
- **THEN** every one is the fleet cell's chevron or a descendant of the chevron's own menu, and the "Console" control is not among them

#### Scenario: The dock is present and expandable in the strip's failure states
- **WHEN** the view is in each of these states: the interior read has failed, the own-fleets read has failed, the canvas region is unavailable
- **THEN** in each state the "Console" control is present and activating it expands the dock

#### Scenario: Expanding and collapsing change no live region
- **GIVEN** the view has rendered with its reads answered
- **WHEN** the dock is expanded and then collapsed
- **THEN** no live region's text outside the tab panel's own content changes

### Requirement: The Dock Carries These Tabs

The dock's tab bar SHALL list exactly the tabs this requirement names, in the order it names them, and exactly one tab SHALL be selected whenever the dock is expanded, the selected tab's panel being the one shown. As of this change the tabs are, in order: Log. The Log tab's label SHALL be `Log` with no count.

#### Scenario: The tab bar lists the Log tab and no other
- **WHEN** the dock is expanded
- **THEN** the tab bar contains one tab, labelled `Log`

#### Scenario: The Log tab is selected and its panel is shown
- **WHEN** the dock is expanded
- **THEN** the Log tab is the selected tab and its panel is the one shown

#### Scenario: The Log tab's label carries no count however many rows are listed
- **GIVEN** the pile's first page holds three records and the served cursor says more pages exist
- **WHEN** the dock is expanded and the log has listed those records
- **THEN** the tab's label reads `Log` and contains no digit

### Requirement: The Log Tab Is the Sighting Log's Home on This View

The Log tab's panel SHALL be where the system space view shows the sighting log. This capability names that placement and restates none of `sighting-log`'s rules: the log's rows, refresh, load-more and its loading, empty and failed states are as `sighting-log` specifies them (*The Sighting Log Lists the Corporation's Own Pile in Served Order*, *The Log Pages Through the Pile With the Server's Own Cursor*, *The Log's Empty, Loading, and Failed States Are Each Explicit*), and the log's mount ordering is as *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* specifies it. The log SHALL NOT issue its first pile read, and the panel SHALL show no log content, until the interior read's first load (the read is in flight and no interior for this system is held) has answered or failed; until then the Log tab's panel SHALL show a waiting indication that is not the log's own loading state. The affordance on a settled sweep's report that opens the log (*A Settled Sweep and the Scan Controls Are Reachable and Announced*) SHALL expand the dock with the Log tab selected and SHALL NOT collapse an expanded dock. The view SHALL carry no standalone toggle for the log and SHALL NOT show the log floating over the canvas. Activating a sighting ghost in the scene SHALL NOT expand the dock, and the ghost SHALL show its highlight; if that record is among the rows the log has listed, its row SHALL be highlighted when the Log tab is next shown.

#### Scenario: The expanded dock's Log panel holds the log
- **GIVEN** the interior read's first load has finished and the corporation's pile holds records
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

#### Scenario: A settled sweep's report link expands a collapsed dock to the Log tab
- **GIVEN** a settled sweep's report is shown and the dock is collapsed
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

### Requirement: The Dock Is Keyboard-Operable

The "Console" control, the Log tab and the collapse control SHALL each be reachable by Tab while the dock is in the state that shows them and SHALL each show a visible focus indicator; the "Console" control and the collapse control SHALL each also be activatable by Enter or Space. The "Console" control and the collapse control SHALL each expose their expanded state and the region they control to assistive technology and SHALL each have an accessible name, the tab bar SHALL be exposed as a tab list whose selected tab is exposed as controlling its panel, and the panel that is shown SHALL be exposed as a tab panel whose accessible name is the selected tab's label. WHEN the dock expands, or the affordance that opens the log is activated while the dock is already expanded, keyboard focus SHALL move to the selected tab. WHEN the dock collapses while keyboard focus is in its tab bar or its panel, focus SHALL move to the "Console" control and SHALL NOT be lost to the start of the document. In the keyboard tab order the dock's controls SHALL come after the strip's chevron, the collapse control SHALL precede the panel's own controls, and the camera controls SHALL still precede the body and lane-gate hit targets (*Space View Camera Is Keyboard-Operable*).

#### Scenario: Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard
- **WHEN** the keyboard tab order is walked with the dock collapsed and then with it expanded
- **THEN** the "Console" control is reached while collapsed and neither the Log tab nor the collapse control is, and the Log tab and the collapse control are reached while expanded
- **AND** activating the "Console" control or the collapse control with Enter, and again with Space, expands or collapses the dock

#### Scenario: Each dock control shows a visible focus indicator
- **WHEN** the "Console" control, the Log tab and the collapse control each take keyboard focus
- **THEN** each shows a visible focus indicator

#### Scenario: The expand and collapse controls expose their state
- **WHEN** the dock is collapsed and then expanded
- **THEN** the "Console" control exposes that the dock is collapsed, names the region it controls and has an accessible name
- **AND** the collapse control exposes that the dock is expanded, names the region it controls and has an accessible name

#### Scenario: The tab bar is a tab list controlling the panel
- **WHEN** the dock is expanded
- **THEN** the tab bar is exposed as a tab list, the Log tab is exposed as selected, and it is exposed as controlling the panel that is shown

#### Scenario: The shown panel is exposed as the Log tab's panel and has an accessible name
- **WHEN** the dock is expanded
- **THEN** the panel that is shown is exposed as a tab panel whose accessible name is the Log tab's label

#### Scenario: Tab from the Log tab reaches the collapse control and then the panel's controls
- **GIVEN** the dock is expanded with keyboard focus on the Log tab and the log has listed rows
- **WHEN** Tab is pressed repeatedly
- **THEN** the collapse control is reached next, then the log's controls in reading order, each once

#### Scenario: Expanding moves keyboard focus to the selected tab
- **GIVEN** the dock is collapsed with keyboard focus on the "Console" control
- **WHEN** the "Console" control is activated with Enter
- **THEN** keyboard focus is on the Log tab, and the dock's controls are reachable by Tab from there

#### Scenario: The report's link to the log moves focus to the Log tab
- **GIVEN** a settled sweep's report is shown
- **WHEN** the report's affordance that opens the log is activated, with the dock collapsed and again with it expanded
- **THEN** in each case the dock is expanded with the Log tab selected and keyboard focus is on the Log tab

#### Scenario: Collapsing with the collapse control moves focus to the Console control
- **GIVEN** the dock is expanded with keyboard focus on the collapse control
- **WHEN** the collapse control is activated
- **THEN** keyboard focus is on the "Console" control

#### Scenario: The dock's controls follow the strip's chevron in the tab order
- **WHEN** the dock is expanded and the keyboard tab order is walked
- **THEN** the strip's chevron is reached before the Log tab and before the collapse control

#### Scenario: The camera controls still precede the scene's hit targets with the dock expanded
- **WHEN** the dock is expanded and the keyboard tab order is walked
- **THEN** the camera controls are reached before any body or lane-gate hit target

### Requirement: The Dock Has One Fixed Height and Nothing Covers It or Is Covered by It

At a viewport of **1280 CSS pixels wide by 720 CSS pixels tall** the expanded dock, the strip's row included, SHALL be 220 CSS pixels tall and the full width of the viewport, and no control SHALL change that height; the strip's row SHALL be 56 CSS pixels tall in both states. Content of the selected tab's panel taller than the panel area SHALL scroll within the panel area, and no control of the selected tab SHALL be clipped out of reach; the log's refresh control and, once the log has listed a record, its first row SHALL lie wholly inside the panel area at the panel's scroll origin. The "Console" control, the Log tab and the collapse control SHALL each have a hit area at least 24 CSS pixels wide and 24 CSS pixels tall. At the same viewport, in each of the two states, each of these floating surfaces that is present — the right-hand command column, the sightings-unavailable card, the camera cluster, the app-wide floating navigation and the "Console" control (present while the dock is collapsed) — SHALL be shown wholly inside the viewport and SHALL overlap neither the strip, nor the dock while it is expanded, nor any other of them, and every control one carries SHALL be activatable; the strip's five cells SHALL lie inside the viewport and be unoverlapped. Transient toasts, hover fact cards and the off-screen reach chips (until a later change deletes them) are not covered. The expanded dock covers the lowest 220 CSS pixels of the canvas beneath it, and this change does not reframe the camera for it. A surface that scrolls its own content — the right-hand command column, for as long as it exists — meets this by its visible area lying wholly inside the viewport and clear of the strip, the expanded dock and the others, and by each control it carries being activatable once scrolled into view within it. The app-wide floating navigation SHALL follow the dock's height on the system space view and SHALL stay where it is on the galaxy route. No layout below 1280 CSS pixels wide is specified, produced or tested.

#### Scenario: The expanded dock is 220 CSS pixels tall and full width
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock expanded
- **THEN** the dock, from the top of the strip's row to the foot of the viewport, is 220 CSS pixels tall and 1280 CSS pixels wide

#### Scenario: The strip's row is 56 CSS pixels tall collapsed and expanded
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock collapsed and then expanded
- **THEN** the strip's row is 56 CSS pixels tall in each state

#### Scenario: Rows beyond what the panel area shows do not change the dock's height
- **GIVEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock expanded
- **WHEN** the log has listed more rows than the panel area shows
- **THEN** the dock is still 220 CSS pixels tall

#### Scenario: Content taller than the panel area scrolls within it
- **GIVEN** the log has listed more rows than the panel area shows, at a 1280×720 CSS-pixel viewport with the dock expanded
- **WHEN** the panel area is scrolled to its end
- **THEN** the log's last control is wholly inside the viewport and the dock is still 220 CSS pixels tall

#### Scenario: The refresh control and the first row are in view without scrolling the panel
- **GIVEN** the log has listed at least one row, at a 1280×720 CSS-pixel viewport with the dock expanded
- **WHEN** the panel area is at its scroll origin
- **THEN** the log's refresh control and its first row are each wholly inside the panel area

#### Scenario: The dock's pointer targets are at least 24 CSS pixels square
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock collapsed and then expanded
- **THEN** the "Console" control, the Log tab and the collapse control each have a hit area at least 24 CSS pixels wide and 24 CSS pixels tall

#### Scenario: No floating surface is covered by or covers the expanded dock
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock expanded and the command column, the sightings-unavailable card (carrying a retry affordance), the camera cluster and the floating navigation present
- **THEN** each surface's visible area lies wholly inside the viewport and overlaps neither the strip, the dock nor any other of them, and each control each carries is activatable, a control inside a scrolling surface being first scrolled into view within that surface

#### Scenario: No floating surface is covered by or covers the collapsed dock
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock collapsed and the command column, the sightings-unavailable card (carrying a retry affordance), the camera cluster, the floating navigation and the "Console" control present
- **THEN** each surface's visible area lies wholly inside the viewport and overlaps neither the strip, the dock nor any other of them, and each control each carries is activatable, a control inside a scrolling surface being first scrolled into view within that surface

#### Scenario: Every strip cell is inside the viewport with the dock expanded
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock expanded
- **THEN** each of the five cells is rendered, non-empty, inside the viewport and overlapped by nothing

#### Scenario: The floating navigation stays where it is on the galaxy route
- **GIVEN** the galaxy route was reached by in-app navigation from a system space view whose dock was expanded
- **WHEN** the galaxy route is rendered at a 1280×720 CSS-pixel viewport after this change
- **THEN** the floating navigation's foot is 72 CSS pixels above the viewport's foot, as before this change

## MODIFIED Requirements

### Requirement: The Vitals Strip Is Present on Every Render of the System Space View

The system SHALL render a single full-width strip as the top row of the
console dock — across the foot of the system space view while the dock is
collapsed, and directly above the dock's tab bar while the dock is expanded;
in either state the bottom-most always-visible band of the view's console
region — on every render of that view, including while the interior
read has failed, while the own-fleets read has failed, and while the
renderer is unavailable. A cell whose served input is unavailable SHALL
render `figure-formatting`'s absent form for its figures rather than being
removed, so the strip's cell set is fixed and a player never has to work out
which instrument disappeared.

#### Scenario: The strip renders with every read resolved
- **WHEN** the view renders with interior, own-fleets, station, board,
  session and galaxy reads resolved
- **THEN** the strip is present with its fleet, fuel, hold, credits and
  clock cells

#### Scenario: The strip survives a failed interior read
- **WHEN** the interior read fails
- **THEN** the strip is still rendered; the cells fed by the fleet read and
  the session are unchanged

#### Scenario: The strip survives a failed own-fleets read
- **WHEN** the own-fleets read fails
- **THEN** the strip is still rendered, its fleet, fuel and hold cells show
  the absent form exactly as the no-acting-fleet case does, and the strip
  itself renders no error or retry affordance of its own — the failure is
  surfaced on the fleet panel, which owns the own-fleets read's error and
  retry surface

#### Scenario: The strip survives an unavailable renderer
- **WHEN** the canvas region shows the unsupported or interrupted state
- **THEN** the strip is still rendered and its figures still read

#### Scenario: With no acting fleet the fleet-scoped figures read absent and the chevron stays
- **WHEN** the view renders with no own fleet in this system while the
  requester owns fleets elsewhere
- **THEN** the fleet cell's identity and its fuel and hold figures show the
  absent form, the credits and clock cells still show their figures, and the
  chevron is still present and still lists the fleets the requester owns
  elsewhere

#### Scenario: A requester owning no fleet at all still gets the strip
- **WHEN** the view renders for a requester who owns no fleet anywhere
- **THEN** the strip is present, the fleet, fuel and hold cells show the
  absent form, the chevron's menu is empty rather than absent, and the
  credits and clock cells still show their figures

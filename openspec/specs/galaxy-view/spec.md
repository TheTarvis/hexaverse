# Galaxy View Specification

## Purpose
The frontend's primary screen (the home route): a 3D renderer of the
galactic graph with an intel summary, a per-system inspector, the
requester's fleet roster, and the select→preview→commit gesture for
graph-tier travel — serving both authenticated players (the live,
per-corporation-fogged galaxy) and logged-out visitors (a frozen static
start area).

## Requirements

### Requirement: Live-vs-Start-Area Data Source by Auth State
The system SHALL, once authentication has resolved, fetch the live galaxy
(`GET /v1/galaxy`) for an authenticated user or the frozen static
start-area asset for a logged-out visitor, and SHALL hold the fetch
disabled while authentication is still resolving (never flashing the
start area to a user about to be recognized as signed in).

#### Scenario: An authenticated user sees the live galaxy
- **WHEN** the galaxy view loads for an authenticated user
- **THEN** it fetches and renders the live galaxy from the backend

#### Scenario: A logged-out visitor sees the frozen start area
- **WHEN** the galaxy view loads for a visitor with no auth session
- **THEN** it fetches and renders the static start-area asset, never the
  live backend endpoint

#### Scenario: No fetch fires while auth is still resolving
- **WHEN** the galaxy view mounts and the authentication state has not yet
  resolved
- **THEN** neither the live nor the start-area fetch is issued until
  resolution completes

### Requirement: Intel Panel Summary
The system SHALL show a left-hand panel with the current data source
label (live vs. frozen start area), a system count, a lane count, and a
per-region breakdown (count per region present in the data), and, only
when viewing the frozen start area, a sign-in prompt.

#### Scenario: Region breakdown lists only present regions
- **WHEN** the intel panel renders for a galaxy with systems in some but
  not all region types
- **THEN** only regions with at least one system are listed, each with its
  count

#### Scenario: Sign-in prompt shown only on the start area
- **WHEN** viewing the frozen start area
- **THEN** a sign-in prompt is shown
- **AND** it is not shown when viewing the live galaxy

### Requirement: System Inspector on Selection
The system SHALL show, on selecting a system node, its name, region, lane
(connection) count, star class, and its full major-body skeleton — the
free astronomical layer, shown regardless of the requester's fog tier for
that system — and, when that system carries a station visible to the
requester (per `trading-station`'s visibility gate), the station's
presence and its current quotes (its price-ordered demand entries, per
`market-price-board`'s uniform quote shape — never a separate floor/
requests split). The system SHALL show an empty-state prompt when nothing
is selected.

#### Scenario: Selecting a node populates the inspector
- **WHEN** a system node is selected
- **THEN** the inspector shows its name, region, star class, lane count,
  and major-body list

#### Scenario: The major-body skeleton is never fog-gated
- **WHEN** a system with tier `starVisible` (no earned knowledge) is
  selected
- **THEN** its major-body skeleton is still shown in full

#### Scenario: Selecting a system with a visible station shows its quotes
- **WHEN** a system carrying a station visible to the requester (per the
  configured minimum visibility tier) is selected
- **THEN** the inspector shows the station's presence alongside its
  current price-ordered demand entries

#### Scenario: A system below the station visibility gate, or with none, shows no station section
- **WHEN** a system whose station (if any) does not clear the configured
  minimum visibility tier is selected
- **THEN** the inspector shows no station section for that system

### Requirement: Drill-In Navigation to the System Board
The system SHALL offer an "Enter system" action on a selected system when
authenticated, navigating to that system's hex board route, and SHALL NOT
offer it on the frozen start area (a read-only showcase with no board to
enter).

#### Scenario: Entering a system navigates to its board
- **WHEN** "Enter system" is invoked for a selected system while
  authenticated
- **THEN** the view navigates to that system's board route

#### Scenario: No drill-in on the start area
- **WHEN** viewing the frozen start area
- **THEN** no "Enter system" action is offered

### Requirement: Own-Fleet Presence and Recenter Target
The system SHALL mark systems hosting at least one of the requester's own
fleets that are not currently in transit (traveling a lane or held
mid-lane) as presence markers on the graph, and SHALL drive the recenter
control to snap to the requester's active fleet's system when one exists,
falling back to a whole-galaxy framing otherwise.

#### Scenario: A traveling fleet is not marked at the system it left
- **WHEN** an own fleet is in lane transit or lane-held
- **THEN** its origin system is not marked with a presence indicator for
  that fleet (the fleet is drawn on the transit layer instead)

### Requirement: Select-Preview-Commit Travel Gesture
The system SHALL, when an idle-or-available own fleet exists and a
different system is selected, preview the shortest charted lane route
(per-leg and total ETA) from that fleet to the selected system, offer a
"Travel here" commit when a route exists, and show a "no charted route"
message instead when none does; selecting the fleet's own current system
SHALL show a simple "your fleet is here" note instead of a route preview.

#### Scenario: Selecting the fleet's own system shows no route preview
- **WHEN** the system the active fleet currently occupies is selected
- **THEN** a "your fleet is here" note is shown, with no route preview or
  travel action

#### Scenario: Committing a previewed route departs the fleet
- **WHEN** "Travel here" is invoked for a previewed route
- **THEN** a travel order is submitted for the active fleet to the
  selected destination, and on success the selection is cleared and a
  success toast is shown

#### Scenario: An unreachable destination offers no commit
- **WHEN** the selected destination has no charted route from the active
  fleet
- **THEN** a "no charted route" message is shown and no travel commit is
  offered

### Requirement: Transit Fleet Selection and Card
The system SHALL let a fleet currently in lane transit or lane-held be
selected (via its lane marker on the graph or its roster row), showing a
card with its current leg, activity, remaining-time countdown, and its
route with per-leg ETAs, in place of the system inspector; selecting a
system node SHALL close any open fleet card.

#### Scenario: Selecting a transiting fleet's marker opens its card
- **WHEN** a fleet's lane marker is selected
- **THEN** a fleet card is shown with its route and live countdown,
  replacing the system inspector

#### Scenario: Selecting a system node closes an open fleet card
- **WHEN** a system node is selected while a fleet card is open
- **THEN** the fleet card closes and the system inspector shows instead

### Requirement: Self-Scheduled Arrival Refresh
The system SHALL, for each of the requester's fleets in transit with a
known arrival time, schedule a refresh shortly after that arrival time
that re-reads the fleet (forcing the server's lazy arrival settlement) and
then refreshes the requester's fleet list and the galaxy read, so a
destination's reveal appears without a manual page reload.

#### Scenario: An arrival refresh reveals the destination
- **WHEN** a transiting fleet's scheduled arrival time passes
- **THEN** the fleet and galaxy reads are refreshed shortly afterward,
  reflecting the settled arrival and any newly revealed systems/lanes

### Requirement: Wake-Up Focus Handoff
The system SHALL, on first mount after a fresh spawn hands off a home
system id, select that system and glide the camera to it once the graph
is ready, then clear the handoff so it fires only once.

#### Scenario: A fresh spawn's home system is auto-selected and focused
- **WHEN** the galaxy view mounts with a pending wake-up focus handoff for
  a system present in the loaded galaxy
- **THEN** that system becomes selected and the camera glides to it,
  exactly once

### Requirement: Loading and Error States
The system SHALL show a loading placeholder while the galaxy data is in
flight, and an error panel (with the underlying error message when
available) if the galaxy read fails.

#### Scenario: Error panel on a failed galaxy read
- **WHEN** the galaxy read fails
- **THEN** an error panel is shown instead of the renderer

### Requirement: Renderer Unavailability Is an Explicit State
IF a rendering context for the galaxy graph cannot be created, THEN the
system SHALL show an explicit unsupported state in place of the graph's
canvas region, naming the failure as a browser- or graphics-hardware-
capability problem — never raw diagnostic text, a stack trace, or a GPU
vendor/model string — rather than an empty stage or an uncaught error, and
SHALL offer a retry affordance that attempts to re-establish the context.

For an authenticated requester with at least one own fleet, the intel panel
and the fleet roster SHALL remain mounted and usable while the unsupported
state is shown: selecting an own fleet from the roster remains available
without a graph selection, and reaches that fleet's system, populates the
inspector, and keeps the travel and drill-in affordances for that system
usable. For a logged-out visitor, the intel panel's counts, region
breakdown, and sign-in prompt SHALL remain shown. A control in the
surrounding panels whose only effect is on the unavailable graph (e.g.
recenter) SHALL be disabled or hidden while the unsupported or interrupted
state is shown, rather than presented as operable.

WHEN no system is already selected and the requester has no own fleet in
the roster, the inspector's selection prompt SHALL NOT instruct the player
to select a system on the graph, and SHALL instead indicate that a system
can be reached by selecting an own fleet in the roster, or that the graph
must be available to pick any other.

An error thrown while constructing, listening to, or retrying the graph's
rendering context SHALL be contained to the graph's canvas region: caught by a
boundary scoped to that region when the error is thrown during render or
commit, and by a local handler when the error is thrown inside a context-
loss/restore listener or an animation-frame callback (neither is reachable
by a React error boundary at any placement) — leaving the intel panel, the
inspector, and the galaxy view container mounted and usable.

The unsupported and interrupted states SHALL take precedence over the
galaxy view's data-loading and first-frame-pending states: once a rendering
context cannot be created, a loading placeholder SHALL NOT continue to be
shown in the graph's canvas region. This state is triggered by a client
rendering-capability failure, never by a failure of the galaxy data read.

#### Scenario: Context creation failure shows a named unsupported state
- **WHEN** a rendering context for the galaxy graph cannot be created
- **THEN** the graph's canvas region shows an explicit unsupported state
  naming WebGL or GPU unavailability as the cause
- **AND** no uncaught error is thrown

#### Scenario: Surrounding galaxy affordances remain usable
- **WHEN** the graph's canvas region shows the unsupported or interrupted
  state for an authenticated requester with at least one own fleet
- **THEN** the intel panel and the fleet roster remain mounted and
  interactive
- **AND** selecting an own fleet from the roster remains available without
  a graph selection

#### Scenario: Roster selection still reaches a system, its inspector, and travel
- **WHEN** the graph's canvas region shows the unsupported or interrupted
  state and an own fleet's roster row is selected
- **THEN** that fleet's system becomes the selection, the inspector
  populates, and the travel and drill-in affordances offered for that
  system remain usable

#### Scenario: Surrounding galaxy affordances remain usable for a logged-out visitor
- **WHEN** the graph's canvas region shows the unsupported state for a
  logged-out visitor
- **THEN** the intel panel's counts, region breakdown, and sign-in prompt
  remain shown

#### Scenario: Choosing a system on the graph is unreachable without the canvas
- **WHEN** the graph's canvas region shows the unsupported or interrupted
  state AND no system is selected AND the requester has no own fleet in
  the roster
- **THEN** the inspector's selection prompt SHALL NOT instruct the player
  to select a system on the graph
- **AND** the inspector indicates that a system can be reached by selecting
  an own fleet in the roster, or that the graph must be available to pick
  any other

#### Scenario: A canvas-only control is disabled while the canvas is unavailable
- **WHEN** the graph's canvas region shows the unsupported or interrupted
  state
- **THEN** a control whose only effect is on the graph canvas (e.g.
  recenter) is disabled or hidden, not presented as operable

#### Scenario: The unsupported state is independent of the galaxy data read
- **WHEN** the galaxy read succeeds but the rendering context cannot be
  created
- **THEN** the graph's canvas region shows the unsupported state, not the
  galaxy-read error state

#### Scenario: A failed data read takes precedence over the unsupported state
- **WHEN** the galaxy read fails and the rendering context also cannot be
  created
- **THEN** the galaxy-read error panel is shown with its underlying message
- **AND** no unsupported state is shown

#### Scenario: The galaxy view container remains present
- **WHEN** the unsupported state is shown
- **THEN** the galaxy view container is still rendered, with the
  unsupported state occupying only the graph's canvas region within it

#### Scenario: The unsupported state offers a retry affordance
- **WHEN** the graph's canvas region shows the unsupported state
- **THEN** a retry affordance is offered
- **AND** invoking it attempts to create a new rendering context
- **AND** a successful attempt resumes rendering the live galaxy graph
- **AND** a failed attempt keeps the unsupported state, retriable again

#### Scenario: The displayed cause is a user-actionable category, not raw diagnostic text
- **WHEN** the unsupported or interrupted state names the cause to the player
- **THEN** the text identifies the failure as a browser or graphics-hardware
  capability problem
- **AND** it does not display raw exception text, stack traces, or GPU
  vendor/model strings

#### Scenario: An unexpected rendering error is contained to the canvas region
- **WHEN** an error is thrown while constructing, listening to, or retrying
  the graph's rendering context — including an error not otherwise named by
  this requirement
- **THEN** the error is contained to the graph's canvas region — caught by
  the region's error boundary when it is thrown during render or commit,
  and by a local handler when it is thrown inside a context-loss/restore
  listener or an animation-frame callback
- **AND** the intel panel, the inspector, and the galaxy view container
  remain mounted and usable

### Requirement: Lost Rendering Context Recovers Without Navigation
WHEN the galaxy graph's rendering context is lost at runtime, the system
SHALL show an interrupted state in the graph's canvas region without an
uncaught error; WHEN the lost context is restored, the system SHALL resume
rendering the live galaxy graph — reflecting current world time and
system/fleet state, never a stale pre-loss frame — without a page
navigation; and IF the context is not restored, the interrupted state SHALL
persist and SHALL offer a retry affordance that attempts to re-establish the
rendering context. Restore failure means an error thrown while
re-establishing rendering after `webglcontextrestored` fires; a context
that simply never restores is not itself a recordable failure event.
Retrying SHALL release the prior attempt's renderer resources and event
listeners before creating a new context, and SHALL hold no more than one
live rendering context for the graph's canvas at any time. Once invoked,
the retry affordance SHALL be disabled and show an in-progress indication
until the attempt resolves; any invocation while disabled SHALL start no
further attempt. A second context loss arriving while the interrupted state
is already shown SHALL leave the galaxy graph in the interrupted state
without duplicating listener registration or starting a second in-flight
creation attempt. A system or fleet selection active at the moment of
context loss SHALL remain shown in the intel panel/inspector throughout the
interrupted state and SHALL still be active once the graph resumes. Each
context-creation failure, context loss, and restore failure SHALL be
recorded distinguishably by cause: a diagnostic entry emitted to the client
error log naming which of the three occurred and, when available, the
browser-reported diagnostic message.

#### Scenario: Context loss shows an interrupted state without an uncaught error
- **WHEN** the galaxy graph's rendering context is lost at runtime
- **THEN** the graph's canvas region shows an interrupted state
- **AND** no uncaught error is thrown

#### Scenario: A restored context resumes without navigation
- **WHEN** a lost rendering context is restored
- **THEN** the galaxy graph resumes rendering
- **AND** no page navigation occurs

#### Scenario: A restored context's first frame reflects live state, not a stale one
- **WHEN** a lost rendering context is restored
- **THEN** the graph's redraw is invoked with the post-restore world time
  and the latest system/fleet read
- **AND** no pre-loss image is retained

#### Scenario: A context that never restores keeps the interrupted state with a retry affordance
- **WHEN** a rendering context is lost and is not restored
- **THEN** the interrupted state persists
- **AND** a retry affordance is offered

#### Scenario: Invoking the retry affordance attempts to re-establish the context
- **WHEN** the retry affordance is invoked while the interrupted state is
  shown
- **THEN** the system attempts to create a new rendering context for the
  galaxy graph

#### Scenario: Retrying releases the prior attempt's resources first
- **WHEN** the retry affordance is invoked
- **THEN** any renderer resources and event listeners from the previous
  failed or lost context are released before a new context is created
- **AND** no more than one live rendering context is held for the graph's
  canvas at any time

#### Scenario: A successful retry resumes the live galaxy graph
- **WHEN** the retry affordance is invoked
- **AND** the resulting context creation succeeds
- **THEN** the galaxy graph resumes rendering
- **AND** no page navigation occurs

#### Scenario: A retry that fails again keeps the interrupted state retriable
- **WHEN** the retry affordance is invoked
- **AND** the resulting context creation fails
- **THEN** the interrupted state persists
- **AND** the retry affordance remains available for another attempt

#### Scenario: The retry affordance prevents duplicate concurrent attempts
- **WHEN** the retry affordance is invoked
- **THEN** it is disabled and shows an in-progress indication until the
  attempt resolves
- **AND** any invocation while disabled starts no further attempt

#### Scenario: A second context loss while already interrupted is a no-op state change
- **WHEN** the galaxy graph's rendering context is lost again while the
  interrupted state is already shown
- **THEN** the galaxy graph remains in the interrupted state
- **AND** no duplicate listener registration or in-flight context-creation
  attempt is started

#### Scenario: In-flight selection survives a context loss
- **WHEN** the galaxy graph's rendering context is lost at runtime while a
  system or fleet selection is active
- **THEN** the selection remains shown in the intel panel/inspector once the
  interrupted state is displayed
- **AND** a subsequent restore resumes the galaxy graph with that same
  selection still active

#### Scenario: Renderer failures are recorded distinguishably by cause
- **WHEN** a rendering context fails to be created, is lost, or fails to
  restore
- **THEN** a diagnostic entry is emitted to the client error log naming
  which of the three occurred and, when available, the browser-reported
  diagnostic message (e.g. `webglcontextcreationerror`'s `statusMessage`)
- **AND** the recording does not itself throw or block the unsupported/
  interrupted state from rendering

### Requirement: Renderer Unavailability States Are Accessible
WHEN the galaxy graph's canvas region shows the unsupported or interrupted
state, the system SHALL convey the change to assistive technology through a
live region naming the state and its cause, SHALL make any retry affordance
reachable via Tab and activatable via Enter or Space, and SHALL move focus
to the retry affordance (or, when none is shown, to the state's explanatory
text) if focus was within the canvas region at the moment the state
appeared. That focus-preservation clause applies only while the canvas
region contains a focusable element to lose focus from at the moment of
transition.

#### Scenario: The state change is announced to assistive technology
- **WHEN** the galaxy graph's canvas region transitions into the unsupported
  or interrupted state
- **THEN** a live region conveys the state change and its named cause
  without requiring the player to navigate to it

#### Scenario: The retry affordance is keyboard-operable
- **WHEN** the interrupted or unsupported state offers a retry affordance
- **THEN** a keyboard-only player can reach it via Tab
- **AND** activate it via Enter or Space

#### Scenario: Focus does not get lost when the canvas region changes under the player
- **GIVEN** the graph's canvas region contains a focusable element at the
  moment the unsupported or interrupted state replaces it
- **WHEN** focus is within that element
- **THEN** focus moves to the retry affordance, or to the state's
  explanatory text if no retry affordance is shown
- **AND** focus is never silently dropped to the document body

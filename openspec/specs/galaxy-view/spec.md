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
that system — and SHALL show an empty-state prompt when nothing is
selected.

#### Scenario: Selecting a node populates the inspector
- **WHEN** a system node is selected
- **THEN** the inspector shows its name, region, star class, lane count,
  and major-body list

#### Scenario: The major-body skeleton is never fog-gated
- **WHEN** a system with tier `starVisible` (no earned knowledge) is
  selected
- **THEN** its major-body skeleton is still shown in full

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

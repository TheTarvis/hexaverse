# Hex Board View Specification

## Purpose
The frontend's per-system tactical view (`/systems/[systemId]`): renders a
system's fogged interior as a hex board, lets the player select a body,
hex, fleet, or lane gate, previews the order that selection would commit
(a led intercept, a direct burn, or a graph-tier departure), and commits
move/scan/cancel/travel verbs — kept in lockstep with the server via a set
of realtime refetch rules, never a client-side simulation of outcomes the
server hasn't confirmed.

## Requirements

### Requirement: System Board Route and Data Fan-In
The system SHALL render `/systems/:systemId` by reading the system's fogged
interior and the fogged fleets in that system, disabled until a non-empty
system id is known, and SHALL show a loading state while either read is in
flight and an error state (with the underlying error message when
available) if the interior read fails.

#### Scenario: Loading state before data arrives
- **WHEN** the system board route is opened and its data has not yet
  loaded
- **THEN** a loading placeholder is shown

#### Scenario: Error state on a failed interior read
- **WHEN** the interior read fails
- **THEN** an error panel is shown instead of the board

### Requirement: Toggle-to-Deselect Single Selection
The system SHALL maintain exactly one selection at a time, among a
feature, a bare hex, a fleet, or a lane gate; selecting the currently
selected item again SHALL clear the selection (deselect) rather than
re-select it; selecting a different item of any kind SHALL replace the
current selection.

#### Scenario: Re-selecting the same feature deselects it
- **WHEN** a feature is selected and then clicked again
- **THEN** the selection becomes empty

#### Scenario: Selecting a hex replaces a feature selection
- **WHEN** a feature is selected and a bare hex is then clicked
- **THEN** the selection becomes that hex, and the feature is no longer
  selected

### Requirement: Move Preview From the Acting Fleet's Live Position
The system SHALL compute a live move preview from the acting fleet's
current effective position (its docked parent's live position if docked,
otherwise its board hex) to the current selection: a lead-intercept path
if the selection is an orbiting feature, a direct path if it is a fixed
feature or a bare hex, or the in-system leg to a gate's tile if the
selection is a lane gate — recomputed every frame so a led intercept's
countdown tracks the moving target. A selection resolving to the core hex
`(0,0)`, or a fixed feature, SHALL yield no move plan.

#### Scenario: Selecting an orbiting body previews a lead intercept
- **WHEN** an orbiting feature is selected with an active fleet present
- **THEN** the move preview is the lead-solved intercept path to that body,
  recomputed each frame

#### Scenario: Selecting the star yields no plan
- **WHEN** the star (a fixed feature at the core) is selected
- **THEN** no move plan is shown

#### Scenario: Selecting the core hex directly yields no plan
- **WHEN** a bare hex at the core `(0,0)` is selected
- **THEN** no move plan is shown

### Requirement: Move Commit
The system SHALL, when the move command is invoked with an active fleet
and a feature or hex selection, submit an order for that target; on
success it SHALL clear the selection and show a success toast; on failure
it SHALL show an error toast and leave the selection unchanged.

#### Scenario: A successful move clears the selection
- **WHEN** the move command succeeds
- **THEN** the selection is cleared and a success toast is shown

#### Scenario: A failed move keeps the selection and toasts the error
- **WHEN** the move command fails
- **THEN** the selection remains, and an error toast shows the failure
  reason

### Requirement: Scan Aim Preview Only While Considering the Verb
The system SHALL show the 360° sweep's shadow preview (what the sweep
would leave dark from the fleet's current position) only while the player
is hovering or keyboard-focusing the scan control — not while merely
selecting things to plan a move — and SHALL hide it otherwise.

#### Scenario: Hovering the scan control shows the sweep preview
- **WHEN** the pointer hovers (or keyboard focus lands on) the scan
  control
- **THEN** the sweep shadow preview is drawn from the fleet's current
  position

#### Scenario: Selecting a move target does not show the sweep preview
- **WHEN** a feature or hex is selected to plan a move, without hovering
  the scan control
- **THEN** no sweep preview is drawn

### Requirement: Running Scan Renders From Its Pinned Emission Hex
The system SHALL, while the acting fleet has a running scan whose ETA has
not yet passed, render the committed sweep centred on the scan's pinned
emission hex (from the running action's recorded params, falling back to
the fleet's position at the scan's ETA if no origin was recorded) — not
the fleet's current live position — and SHALL stop rendering it once the
scan's ETA passes.

#### Scenario: The committed sweep stays anchored to where it was fired
- **WHEN** a fleet with a running scan moves away from the hex it fired
  from before the scan's ETA
- **THEN** the rendered sweep remains centred on the original emission
  hex, not the fleet's current position

#### Scenario: The sweep stops rendering once the ETA passes
- **WHEN** world time reaches or passes the running scan's ETA
- **THEN** the committed sweep is no longer rendered

### Requirement: Scan Commit and Single-Slot Gating
The system SHALL, when the scan command is invoked with an active fleet,
submit a scan order; the scan control SHALL be disabled while a scan
already has an unexpired ETA (a scan is running) or while any verb is
pending, and SHALL NOT be disabled merely because the fleet is burning
(movement and sensing are independent channels).

#### Scenario: Scan is available while burning
- **WHEN** the acting fleet's effective state is `burn`
- **THEN** the scan control remains enabled

#### Scenario: Scan is disabled while a scan is already running
- **WHEN** the acting fleet has a running scan whose ETA has not yet
  passed
- **THEN** the scan control is disabled and shows a countdown to
  resolution

### Requirement: Cancel Command Available Only While Burning
The system SHALL show the cancel-burn command only when the acting
fleet's effective state is `burn`, and SHALL invoke the cancel order when
it is pressed.

#### Scenario: Cancel is hidden when not burning
- **WHEN** the acting fleet's effective state is not `burn`
- **THEN** no cancel-burn control is shown

### Requirement: Lane Gate Selection Previews and Commits Departure
The system SHALL, when a lane gate is selected, preview the charted route
from the acting fleet to that gate's destination system (per-leg and
total ETA); if no charted route exists, it SHALL show a "no charted
route" message instead of a preview; and SHALL, when the depart command is
invoked with a gate selection, submit a travel order to that destination,
clearing the selection and toasting success or failure.

#### Scenario: An uncharted destination shows no-route messaging
- **WHEN** a lane gate whose destination has no charted route from the
  acting fleet is selected
- **THEN** a "no charted route" message is shown instead of a route
  preview, with no depart action offered

#### Scenario: Departing clears the selection on success
- **WHEN** the depart command succeeds for a selected gate
- **THEN** the selection is cleared and a success toast is shown

### Requirement: Realtime Refetch Rules While the Board Is Open
The system SHALL keep the open board's interior and fleet reads current
via three independent mechanisms: (1) a self-scheduled refetch shortly
after the soonest known future ETA among the requester's own fleets'
arrivals and the running scan's ETA, (2) a live subscription to the
system's event channel that refetches on a completion event and again on
reconnect after a drop, and (3) a periodic poll — tightened while an own
scan is running (its progressively landing echoes) and relaxed otherwise.

#### Scenario: An own fleet's arrival self-schedules a refetch
- **WHEN** an own fleet in the system has a burn with a known arrival time
- **THEN** a refetch is scheduled to fire shortly after that arrival time

#### Scenario: A missed event on reconnect triggers a resync
- **WHEN** the system channel's live connection drops and later
  reconnects
- **THEN** a refetch fires on reconnect to resync any missed completions

#### Scenario: The poll tightens while a scan is running
- **WHEN** the acting fleet has a running scan on this board
- **THEN** the periodic poll interval is shorter than when no scan is
  running

### Requirement: Departure Hand-Off to the Galaxy View
The system SHALL, when an own fleet that was being watched on this board
transits its departure gate (leaving it with no hex on this board), navigate
away from the board to the galaxy view, so the player follows their fleet
onto the lane crawl it now belongs to — but SHALL NOT navigate away merely
because a fleet already elsewhere is in transit when the board is opened
(only a departure actually watched on this board triggers the hand-off).

#### Scenario: Watching a fleet depart navigates to the galaxy view
- **WHEN** an own fleet on this board's departure gate transit completes
  while the board is open and being watched
- **THEN** the view navigates to the galaxy route

#### Scenario: Opening a board with an already-departed fleet does not navigate
- **WHEN** the board is opened for a system where an own fleet is already
  mid-lane-transit (departed before this board was opened)
- **THEN** no automatic navigation occurs

### Requirement: Fleet Roster Cross-Navigation
The system SHALL, via the shared fleet roster panel, make selecting a row
for a fleet on the current board set it as the acting fleet and select it;
selecting a row for a fleet in a different system navigate to that
system's board; and selecting a row for a fleet with no current board
presence (out on a lane) navigate to the galaxy view.

#### Scenario: Selecting a fleet in another system navigates there
- **WHEN** a roster row for an own fleet located in a different system is
  selected
- **THEN** the view navigates to that system's board route

#### Scenario: Selecting a fleet with no board presence navigates to the galaxy
- **WHEN** a roster row for an own fleet currently out on a lane (no board
  hex) is selected
- **THEN** the view navigates to the galaxy route

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
arrivals, the running scan's ETA, and the running mine's ETA, (2) a live
subscription to the system's event channel that refetches on a completion
event and again on reconnect after a drop, and (3) a periodic poll —
tightened while an own scan is running (its progressively landing echoes)
and relaxed otherwise.

#### Scenario: An own fleet's arrival self-schedules a refetch
- **WHEN** an own fleet in the system has a burn with a known arrival time
- **THEN** a refetch is scheduled to fire shortly after that arrival time

#### Scenario: A running mine self-schedules a refetch at its ETA
- **WHEN** the acting fleet has a running mine with a known ETA
- **THEN** a refetch is scheduled to fire shortly after that ETA, so the
  resolved cargo and freed movement channel land without user action

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

### Requirement: Mine Offer on the Docked Fleet
The system SHALL offer the mine verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a feature
carrying at least one visible resource AND the fleet's movement channel is
free (no running mine, not burning) — anchored to the fleet's docked
state, requiring no board selection: a fleet can only mine what it is
docked to, so selecting the body underneath it (which its own glyph
occludes) is never a precondition. The offer SHALL present a resource-kind
picker limited to the docked feature's visible resource kinds, defaulting
to the richest, and a tonnage input defaulting to the fleet's free hold
and constrained to a positive value no greater than the free hold.

#### Scenario: Mine is offered while docked at a resource-bearing body
- **WHEN** the acting fleet's effective state is `docked` to a feature
  carrying visible resources
- **THEN** the fleet panel offers the mine verb with a kind picker and a
  tonnage input defaulted to the fleet's free hold, with no board
  selection required

#### Scenario: Mine is not offered when merely co-located, not docked
- **WHEN** the acting fleet occupies the same hex as a resource feature
  but its effective state is not `docked`
- **THEN** the mine verb is not offered

#### Scenario: Mine is not offered when the docked body has no visible resources
- **WHEN** the acting fleet is docked to a feature that carries no visible
  resources
- **THEN** the mine verb is not offered

#### Scenario: Tonnage input clamps to free hold
- **WHEN** a tonnage greater than the fleet's free hold is entered
- **THEN** the input clamps the value to the free hold

### Requirement: Mine ETA Preview From the Served Mining Rate
The system SHALL, while the mine offer is shown, preview the run's duration
as the entered tonnage divided by the fleet's served derived mining rate
(from the fleet read's roster fields), recomputed live as the tonnage or
kind selection changes; after commit, countdowns SHALL use the ETA frozen
on the returned action, not the client preview.

#### Scenario: The preview tracks the tonnage input
- **WHEN** the tonnage input value changes
- **THEN** the previewed duration updates to the new tonnage divided by the
  fleet's served mining rate

#### Scenario: The committed countdown uses the server's ETA
- **WHEN** a mine run commits successfully
- **THEN** the running countdown derives from the action's returned ETA,
  not from the pre-commit client preview

### Requirement: Mine Commit
The system SHALL, when the mine command is invoked with a chosen kind and
tonnage, submit the mine order against the acting fleet's docked feature;
on success it SHALL show a success toast and arm the ETA refetch; on
failure it SHALL show an error toast carrying the server's distinguishable
rejection reason and leave the offer's state unchanged.

#### Scenario: A successful mine commit arms the countdown
- **WHEN** the mine command succeeds
- **THEN** a success toast is shown and a refetch is armed for the run's
  ETA

#### Scenario: A failed mine commit toasts the reason
- **WHEN** the mine command fails (for example: over free hold, depleted
  lode, busy movement slot)
- **THEN** an error toast surfaces the server's rejection reason and the
  offer remains available

### Requirement: Running Mine Gates the Movement Channel
The system SHALL, while the acting fleet has a running mine action whose
ETA has not yet passed, disable the mine and move commands and show a
countdown to the run's ETA; the scan command SHALL remain enabled
(independent sensor channel); and a cancel-mine control SHALL be offered
that cancels the run via the generic action cancel endpoint. Once the ETA
passes, the gating SHALL lift without requiring navigation.

#### Scenario: Move is disabled while a mine is running
- **WHEN** the acting fleet has a running mine whose ETA is in the future
- **THEN** the move command is unavailable and a countdown to the mine's
  ETA is shown

#### Scenario: Scan stays enabled while a mine is running
- **WHEN** the acting fleet has a running mine whose ETA is in the future
- **THEN** the scan control remains enabled

#### Scenario: A running mine can be cancelled
- **WHEN** the cancel-mine control is invoked during a running mine
- **THEN** the cancellation is submitted through the generic action cancel
  endpoint and the movement channel frees on success

### Requirement: Fleet Panel Hold Readout
The system SHALL show, for the acting (own) fleet, a hold readout derived
from the fleet read's owner-only roster fields: cargo contents by resource
kind and used versus total capacity; the readout SHALL reflect the
post-resolution cargo after a mine run resolves (via the board's refetch
rules), without requiring navigation.

#### Scenario: The hold readout shows contents and capacity
- **WHEN** the board renders an acting fleet whose fleet read carries
  roster fields
- **THEN** the fleet panel shows cargo tons by kind and the used/total
  hold capacity

#### Scenario: The hold visibly fills when a mine run resolves
- **WHEN** a running mine's ETA passes and the board's refetch lands the
  updated fleet read
- **THEN** the hold readout shows the credited cargo without a page
  navigation

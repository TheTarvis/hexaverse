## REMOVED Requirements

### Requirement: Move Preview From the Acting Fleet's Live Position

**Reason**: Superseded by nothing. A move preview was a lead-intercept or
direct path computed against `board.Cell` geometry from the acting fleet's
live cell; a fleet no longer has a board cell or a lattice path (design.md
Decision 4). The board loses its fleet layer and its geometry-dependent move
verb entirely (design.md Decision 12); ordering a burn is now a roster-panel
action naming a body id or point, not a board preview.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Move Commit

**Reason**: Superseded by nothing. The move command this requirement commits
submits a board-cell target; the board offers no move command at all after
this change (design.md Decision 12). Burn ordering moves to the roster
panel.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Scan Aim Preview Only While Considering the Verb

**Reason**: Superseded by nothing. The 360° sweep verb this requirement
previews is deleted with `observation`'s live half and `fleet-movement`'s
removed "Sensor Scan Order" (design.md Decision 11); the board offers no
scan control after this change (design.md Decision 12).

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Scan Commit and Single-Slot Gating

**Reason**: Superseded by nothing. The scan verb this requirement commits is
deleted (design.md Decision 11); the board offers no scan control after this
change (design.md Decision 12).

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Cancel Command Available Only While Burning

**Reason**: Superseded by nothing. A fleet's effective state is no longer
the `board.MovementState` this requirement gates on, and the two settled
cancel verbs — cut drive and stop in place — are commanded from the roster
panel, not a single board control keyed on a lattice movement mode
(design.md Decision 4, Decision 6, Decision 8, Decision 12).

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Lane Gate Selection Previews and Commits Departure

**Reason**: Superseded by nothing. The charted-route preview and multi-hop
travel-order commit this requirement describes are deleted outright; lane
travel is a single-hop jump from a fleet already attached to a gate,
commanded from the roster panel, not previewed from a board gate selection
(design.md Decision 10, Decision 12).

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Realtime Refetch Rules While the Board Is Open

**Reason**: Superseded by "Realtime Refetch Rules While the Board Is Open,
With No Fleet Layer to Track" — this requirement's own-fleet-arrival
self-schedule mechanism refreshed the board's now-deleted fleet layer
(design.md Decision 12), and its scan-tightens-the-poll mechanism has no
scan control left to key on (design.md Decision 11's removal of the scan
verb, carried through the board by Decision 12). The successor keeps the
surviving mine-ETA and event-channel mechanisms under a new name, since the
superset rule forbids dropping these two scenarios under the original
header.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Fog Band Determines a Feature's Board Treatment

**Reason**: Superseded by nothing. The three-band fog projection this
requirement consumes is removed from `system-interior` and replaced with an
unfogged interim read (design.md Decision 11); a feature no longer carries a
`band` field for the board to key its treatment on.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Board Picking Resolves to the Entity Under the Pointer

**Reason**: Superseded by "Board Picking Resolves to the Feature, Cell, or
Lane Gate Under the Pointer" — this requirement's fleet-click and
docked-fleet-shrunk-hit-target scenarios describe selecting a fleet mark the
board no longer draws (design.md Decision 12), and its
outline-only-astronomical-feature scenario keys on the `astronomical` fog
band removed along with the three-band projection (design.md Decision 11).
The successor keeps every surviving (non-fleet, non-band) behavior under a
new name, since the superset rule forbids dropping these three scenarios
under the original header.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Foreign Fleets Render as Contact Marks Only

**Reason**: Superseded by nothing. The board renders no fleet at all after
this change, own or foreign (design.md Decision 12); foreign-fleet
visibility itself becomes an interim "omitted from list reads, 404 on direct
fetch" per `fleet-movement`'s "Fleet Read Endpoints Serve Own Fleets Only"
(design.md Decision 11).

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Running Mine Gates the Movement Channel

**Reason**: Superseded by "Running Mine Gates the Fleet Panel's Commands" —
this requirement gates a "move" command and mandates that "the scan command
SHALL remain enabled," but the board offers no move command and no scan
command after this change (design.md Decision 12; the move and scan
requirements above are themselves removed). The successor gates the
surviving roster-panel burn/cut-drive/stop/jump commands instead, keeping
this requirement's cancel-mine scenario under a new name, since the
superset rule forbids dropping that scenario under the original header.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Running Scan Renders From Its Pinned Emission Cell

**Reason**: Superseded by nothing. The scan verb and the emission-cell
geometry this requirement renders are deleted (design.md Decision 11); the
board offers no scan control after this change (design.md Decision 12).

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: Board Picking Resolves to the Feature, Cell, or Lane Gate Under the Pointer

The system SHALL resolve a click on the board to the entity drawn under the
pointer: a click within a feature or lane-gate mark SHALL select that
entity; a click elsewhere within the lattice SHALL select the cell
containing that point, and that cell SHALL be visibly marked as selected on
the board; and a click outside the lattice SHALL clear the selection. Hit
targets SHALL be positioned at the marks actually drawn. WHEN two or more
marks' hit targets contain the clicked point, the topmost drawn mark SHALL
win, using the board's documented draw order (features above lane gates; a
child feature above its parent).

#### Scenario: Clicking a feature mark selects that feature

- **WHEN** the pointer clicks within a feature's drawn mark
- **THEN** that feature becomes the selection

#### Scenario: Clicking a lane-gate mark selects that gate

- **WHEN** the pointer clicks within a lane gate's drawn mark
- **THEN** that gate becomes the selection

#### Scenario: Clicking the lattice away from any mark selects the hex

- **WHEN** the pointer clicks a point within the lattice that is not over a
  feature or lane-gate mark
- **THEN** the cell containing that point becomes the selection

#### Scenario: A selected bare hex is visibly marked on the board

- **WHEN** a bare cell (not a feature or lane-gate mark) becomes the
  selection
- **THEN** that cell is visibly marked as selected on the board

#### Scenario: An overlapping child mark wins over its parent

- **WHEN** the pointer clicks a point where a moon's hit target and its
  parent feature's hit target overlap
- **THEN** the moon (the child, drawn on top) becomes the selection, not its
  parent

#### Scenario: Clicking outside the lattice clears the selection

- **WHEN** the pointer clicks a point outside the lattice
- **THEN** the selection becomes empty

### Requirement: Running Mine Gates the Fleet Panel's Commands

The system SHALL, while the acting fleet has a running mine action whose
ETA has not yet passed, disable the roster panel's burn, cut-drive, stop,
and jump commands and show a countdown to the run's ETA; and a cancel-mine
control SHALL be offered that cancels the run via the generic action cancel
endpoint, leaving the fleet's kinematic state and attachment untouched.
Once the ETA passes, the gating SHALL lift without requiring navigation.

#### Scenario: Burn, cut-drive, stop, and jump are disabled while a mine is running

- **WHEN** the acting fleet has a running mine whose ETA is in the future
- **THEN** the roster panel's burn, cut-drive, stop, and jump commands are
  unavailable and a countdown to the mine's ETA is shown

#### Scenario: A running mine can be cancelled

- **WHEN** the cancel-mine control is invoked during a running mine
- **THEN** the cancellation is submitted through the generic action cancel
  endpoint, the movement channel frees on success, and the fleet's
  kinematic state and attachment are left untouched

### Requirement: Realtime Refetch Rules While the Board Is Open, With No Fleet Layer to Track

The system SHALL keep the open board's interior read current via two
independent mechanisms, since the board renders no fleet layer and offers no
scan control to accelerate a poll for: (1) a self-scheduled refetch shortly
after the acting fleet's running mine action's ETA, when one exists, and
(2) a live subscription to the system's event channel that refetches on a
completion event and again on reconnect after a drop; and SHALL otherwise
poll the interior read at a constant baseline interval, never tightened for
a scan or self-scheduled for an own fleet's burn arrival.

#### Scenario: A running mine self-schedules a refetch at its ETA

- **WHEN** the acting fleet has a running mine with a known ETA
- **THEN** a refetch is scheduled to fire shortly after that ETA, so the
  resolved cargo and freed movement channel land without user action

#### Scenario: A missed event on reconnect triggers a resync

- **WHEN** the system channel's live connection drops and later reconnects
- **THEN** a refetch fires on reconnect to resync any missed completions

#### Scenario: The poll runs at a constant interval, with no fleet arrival or scan to tighten it

- **WHEN** the board is open with no running mine action pending
- **THEN** the periodic poll continues at its constant baseline interval,
  unaffected by any own fleet's burn arrival or by scan state — the board
  tracks neither

## MODIFIED Requirements

### Requirement: Toggle-to-Deselect Single Selection

The system SHALL maintain exactly one selection at a time, among a
feature, a bare cell, or a lane gate; selecting the currently selected item
again SHALL clear the selection (deselect) rather than re-select it;
selecting a different item of any kind SHALL replace the current
selection. The board draws no fleet layer, so a fleet is never a member of
this selection set (design.md Decision 12).

#### Scenario: Re-selecting the same feature deselects it

- **WHEN** a feature is selected and then clicked again
- **THEN** the selection becomes empty

#### Scenario: Selecting a hex replaces a feature selection

- **WHEN** a feature is selected and a bare cell is then clicked
- **THEN** the selection becomes that cell, and the feature is no longer
  selected

#### Scenario: Clicking board background clears the selection

- **WHEN** a feature is selected and a point on the board outside the
  lattice is clicked
- **THEN** the selection becomes empty

### Requirement: System Board Route and Data Fan-In

The system SHALL render `/systems/:systemId` by reading the system's
interior — an unfogged interim read (design.md Decision 11: every feature
is served live to any authenticated requester until link 5 replaces this
with a `disclosure` projection) — disabled until a non-empty system id is
known; SHALL show a loading state while that read is in flight, or, while
the board's rendering context is available and uninterrupted, until it has
produced its first rendered frame; and SHALL show an error state (with the
underlying error message when available) if the interior read fails. The
board fetches no fleet data (design.md Decision 12). The unsupported and
interrupted states defined by `### Requirement: Renderer Unavailability Is
an Explicit State` and `### Requirement: Lost Rendering Context Recovers
Without Navigation` (both `add-renderer-availability-states`) take
precedence over this loading state: once either fires, the board shows
that state, not the loading placeholder, regardless of whether a first
frame has ever been produced.

#### Scenario: Loading state before data arrives

- **WHEN** the system board route is opened and its data has not yet
  loaded
- **THEN** a loading placeholder is shown

#### Scenario: Error state on a failed interior read

- **WHEN** the interior read fails
- **THEN** an error panel is shown instead of the board

#### Scenario: Loading persists through first frame after data arrives

- **WHEN** the interior read has completed and the board's rendering
  context is available and uninterrupted, but it has not yet produced its
  first frame
- **THEN** the loading placeholder remains shown rather than an empty or
  black canvas

#### Scenario: An unsupported rendering context takes precedence over the loading placeholder

- **WHEN** the interior read has completed but the board's rendering
  context cannot be created
- **THEN** the board's canvas region shows the unsupported state, not the
  loading placeholder

# Fleet Roster Specification

## Purpose
A shared panel — mounted on both the galaxy view and the system board view
— listing every fleet the requester owns, where each one is and what it is
doing, with a live countdown on any running order, so "where is
everything?" has one answer regardless of which screen the player is
standing in.
## Requirements
### Requirement: Empty When There Is Nothing to Manage
The system SHALL render nothing (no panel at all) when the requester has
no fleets — before spawn, or while logged out.

#### Scenario: No panel before the player has a fleet
- **WHEN** the requester has zero fleets
- **THEN** the roster panel does not render

### Requirement: Active and Here Highlighting
The system SHALL visually mark the row for the fleet the mounting view is
currently commanding (the active fleet), and SHALL mark a row as "here"
when its status resolves to the system currently open as a board, if any.

#### Scenario: The active fleet's row is marked
- **WHEN** a fleet is the view's active/commanding fleet
- **THEN** its row is visually distinguished from the others

#### Scenario: A fleet in the currently open board is marked "here"
- **WHEN** the roster is mounted with a current system id and a fleet's
  status resolves to that same system
- **THEN** its row shows a "here" indicator

### Requirement: Row Selection Delegated to the Mounting View
The system SHALL, on a row click, hand the clicked fleet back to the
mounting view via a callback, without itself deciding what selecting a
fleet means (camera focus, navigation, or activation are the view's
responsibility).

#### Scenario: Clicking a row invokes the selection callback with that fleet
- **WHEN** a roster row is clicked
- **THEN** the mounting view's selection callback is invoked with that
  fleet's data

### Requirement: Collapsible Panel
The system SHALL let the panel collapse to its header (hiding the fleet
list) and expand again, toggled by the player, defaulting to expanded.

#### Scenario: Collapsing hides the fleet list
- **WHEN** the panel's collapse toggle is activated while expanded
- **THEN** the fleet list is hidden and only the header (with fleet count)
  remains visible

### Requirement: One Row Per Owned Fleet, Derived From Kinematic State

The system SHALL show one row per owned fleet, deriving its status from the
fleet's kinematic state evaluated at the current world time (the effective,
folded `space.ShipState` — burn, park, or drift — never the raw stored
state), its `attachedTo` host, its `jump` lane-transit field, the fleet's
running mine action if one exists with an ETA still in the future, and a
system-name lookup: a status tone (idle, moving, drifting, or transit), a
"where" label (a system name, or "Origin → Destination" while in lane
transit), an activity label in player-facing language, and — when the
current order has a known completion time — a remaining-time countdown. A
running mine action whose ETA has passed SHALL NOT drive the label; the row
falls back to the kinematic-state-derived activity.

#### Scenario: A parked, undocked fleet reads as on station

- **WHEN** a fleet's effective state is a park with no `attachedTo` set
- **THEN** its row shows tone `idle`, its system's name as "where", and "On
  station" as the activity, with no countdown

#### Scenario: A docked fleet reads as docked

- **WHEN** a fleet's effective state is a park with `attachedTo` set
- **THEN** its row shows tone `idle` and "Docked" as the activity, with no
  countdown

#### Scenario: A burning fleet counts down to arrival

- **WHEN** a fleet's effective state is a burn
- **THEN** its row shows tone `moving`, "Under way" as the activity, and a
  countdown to the burn's arrival time

#### Scenario: A drifting fleet reads as drifting, with no countdown

- **WHEN** a fleet's effective state is a drift
- **THEN** its row shows tone `drifting` and "Drifting" as the activity, with
  no countdown

#### Scenario: A docked fleet with a running mine reads as mining

- **WHEN** a fleet's effective state is a park with `attachedTo` set and it
  has a running mine action whose ETA is in the future
- **THEN** its row shows a "Mining" activity with a countdown to the run's
  ETA, instead of the docked state's idle label

#### Scenario: A past-ETA mine action no longer drives the label

- **WHEN** a fleet's running mine action's ETA is at or before the current
  world time
- **THEN** its row shows the kinematic-state-derived activity, not "Mining"

#### Scenario: A fleet mid-jump reads as in transit

- **WHEN** a fleet's `jump` field is set (a lane crossing is underway)
- **THEN** its row shows tone `transit`, "In transit" as the activity, a
  countdown to the jump's arrival time, and "Origin → Destination" as its
  where label

#### Scenario: An unknown system name falls back to its id

- **WHEN** a fleet's system id has no corresponding name in the loaded
  galaxy data
- **THEN** its where label falls back to the raw system id rather than
  failing to render

### Requirement: The Roster Row Is the Fleet Command Surface, Jump Gated by Attachment Alone
The system SHALL offer, on each owned fleet's roster row, the commands that
kinematic state and attachment make valid: burn SHALL be offered
regardless of the fleet's current kinematic state; cut drive SHALL be
offered only while the fleet's effective kinematic state is a burn; stop in
place SHALL be offered only while the fleet's effective kinematic state is
a burn or a drift; and jump SHALL be offered whenever the fleet is attached
to a lane-gate body, with no charted-lane condition — charting is map
knowledge and a sellable intel product, never a permission
(`replace-observation-with-sightings` design.md Decision 2), and the
server grants jump-eligibility on attachment alone. A command not made
valid by the fleet's current state or attachment SHALL NOT be offered.

#### Scenario: Burn is always available

- **WHEN** a roster row is shown for a fleet in any kinematic state (burn,
  park, or drift)
- **THEN** the burn command is offered on that row

#### Scenario: Cut drive is offered only while burning

- **WHEN** a fleet's effective kinematic state is a burn
- **THEN** the cut-drive command is offered on its row

#### Scenario: Cut drive is withheld outside a burn

- **WHEN** a fleet's effective kinematic state is a park or a drift
- **THEN** the cut-drive command is not offered on its row

#### Scenario: Stop in place is offered while burning or drifting

- **WHEN** a fleet's effective kinematic state is a burn or a drift
- **THEN** the stop-in-place command is offered on its row

#### Scenario: Stop in place is withheld while parked

- **WHEN** a fleet's effective kinematic state is a park
- **THEN** the stop-in-place command is not offered on its row, the fleet
  already having nothing to stop

#### Scenario: Jump is offered while attached to any lane-gate body

- **WHEN** a fleet is attached to a lane-gate body
- **THEN** the jump command is offered on its row, regardless of whether
  the corporation has charted that gate's lane

#### Scenario: Jump is withheld when not attached to a gate

- **WHEN** a fleet has no `attachedTo` set, or is attached to a body that
  is not a lane gate
- **THEN** the jump command is not offered on its row

### Requirement: The Roster Row Shows Held Fuel and an Estimated Range
The system SHALL show, on each owned fleet's roster row, its currently
held `fuel` tonnage and the estimated maximum range the fleet read
endpoint reports for it (`fleet-movement`'s "Fleet Read Reports an
Estimated Maximum Range From Current Fuel"), rendering the server-reported
figures as-is — this capability SHALL NOT compute or re-derive either
value.

#### Scenario: A roster row shows the fleet's held fuel and estimated range
- **WHEN** a roster row is rendered for an owned fleet
- **THEN** it shows that fleet's currently held `fuel` tonnage and its
  server-reported estimated maximum range

#### Scenario: The roster never computes range client-side
- **WHEN** a roster row's fuel or range figure is rendered
- **THEN** both values are the server's own reported figures, with no
  client-side recomputation from acceleration, hull count, or fuel alone

### Requirement: The Roster Row Shows a Persistent Stranded Indication
The system SHALL show, on an owned fleet's roster row, the server-reported
persistent stranded indication (`fleet-movement`'s "A Fleet's Read Reports
a Persistent Stranded Indication, Computed at the Acceleration Floor"),
rendered so it is visually and semantically distinguishable from an idle
fleet's row — this capability SHALL NOT compute or re-derive the
condition client-side, and SHALL render it whenever it is present on the
fleet read, independent of whether the player ever witnessed the
one-shot commit-time warning that may have first created the condition
("A Burn Commit's Stranding Warning Is Surfaced to the Player" below).

#### Scenario: A stranded fleet's roster row shows a persistent indication
- **WHEN** a roster row is rendered for an owned fleet whose read reports
  the stranded indication set true
- **THEN** the row shows a stranded indication, visually and semantically
  distinct from how an idle fleet with no active order is rendered

#### Scenario: The indication persists across sessions and reloads
- **WHEN** a stranded fleet's roster row is rendered in a session where no
  commit-time warning was ever shown to this player (e.g. after a page
  reload, or from a different device)
- **THEN** the stranded indication is still shown, because it is read
  fresh from the fleet's own read on every render, not from any
  session-local record of a past warning

#### Scenario: A non-stranded fleet's roster row shows no stranded indication
- **WHEN** a roster row is rendered for an owned fleet whose read reports
  the stranded indication set false
- **THEN** no stranded indication is shown, regardless of whether the
  fleet is idle or has an active order

### Requirement: A Burn Commit's Stranding Warning Is Surfaced to the Player
The system SHALL, when a burn order's commit response carries the
distinguishable stranding warning (`fleet-movement`'s "A Burn Commit
Warns, But Does Not Block, When It Would Leave the Fleet Unable to Reach a
Station or Gate"), render it to the player as a visible, non-blocking
notice distinct from an error toast — the order has already succeeded, so
this is advisory, not a failure state — and SHALL NOT suppress or discard
the committed order's own success feedback when the warning is also
present.

#### Scenario: A stranding warning renders alongside a successful commit
- **WHEN** a burn order's commit response carries a stranding warning
- **THEN** the order's own success feedback is shown, and the warning is
  additionally rendered as a distinct, non-blocking notice

#### Scenario: A commit with no warning shows no stranding notice
- **WHEN** a burn order's commit response carries no stranding warning
- **THEN** no stranding notice is rendered

#### Scenario: The warning is never rendered as an error
- **WHEN** a stranding warning is rendered
- **THEN** it is visually and semantically distinguished from the error
  styling used for a rejected command, since the underlying order
  succeeded


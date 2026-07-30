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

### Requirement: One Row Per Owned Fleet, Derived From Effective State
The system SHALL show one row per owned fleet, deriving its status from
the fleet's movement state evaluated at the current world time (the
effective, folded state — never the raw stored state), the fleet's running
mine action if one exists with an ETA still in the future, and a
system-name lookup: a status tone (idle, moving, transit, or held), a
"where" label (a system name, or "Origin → Destination" while on a lane),
an activity label in player-facing language, and — when the current order
has a known completion time — a remaining-time countdown. A running mine
action whose ETA has passed SHALL NOT drive the label; the row falls back
to the movement-state-derived activity.

#### Scenario: A coasting fleet reads as on station
- **WHEN** a fleet's effective state is `coast`
- **THEN** its row shows tone `idle`, its system's name as "where", and
  "On station" as the activity, with no countdown

#### Scenario: A burning fleet counts down to arrival
- **WHEN** a fleet's effective state is `burn`
- **THEN** its row shows tone `moving`, "Under way" (or "Docking" when the
  burn targets a dock), and a countdown to the burn's arrival time

#### Scenario: A docked fleet with a running mine reads as mining
- **WHEN** a fleet's effective state is `docked` and it has a running mine
  action whose ETA is in the future
- **THEN** its row shows a "Mining" activity with a countdown to the
  run's ETA, instead of the docked state's idle label

#### Scenario: A past-ETA mine action no longer drives the label
- **WHEN** a fleet's running mine action's ETA is at or before the current
  world time
- **THEN** its row shows the movement-state-derived activity, not
  "Mining"

#### Scenario: A trip still crossing its origin board reads as departing
- **WHEN** a fleet's effective state is `laneTransit` and world time is
  before the trip's board-leg gate ETA
- **THEN** its row shows "Departing" and a countdown to the trip's overall
  arrival, and its row identifies the origin system as still enterable

#### Scenario: A trip past its gate reads as in transit, belonging to no board
- **WHEN** a fleet's effective state is `laneTransit` and world time is at
  or past the trip's board-leg gate ETA
- **THEN** its row shows tone `transit`, "In transit", a countdown to
  arrival, and identifies the fleet as having no board to open (only the
  galaxy view can show it)

#### Scenario: A held fleet flags for a decision
- **WHEN** a fleet's effective state is `laneHold`
- **THEN** its row shows tone `held` and "Holding mid-lane", with the
  "From → To" systems as its where label and no countdown

#### Scenario: An unknown system name falls back to its id
- **WHEN** a fleet's system id has no corresponding name in the loaded
  galaxy data
- **THEN** its where label falls back to the raw system id rather than
  failing to render

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

## REMOVED Requirements

### Requirement: One Row Per Owned Fleet, Derived From Effective State

**Reason**: Superseded by "One Row Per Owned Fleet, Derived From Kinematic
State" — this requirement's eight scenarios name the five
`board.MovementState` shapes (`coast`/`burn`/`docked`/`laneTransit`/
`laneHold`); these are replaced by `space.ShipState`'s three shapes
(burn/park/drift) plus the fleet-owned `attachedTo` and single-hop `jump`
fields (design.md Decision 4, Decision 10). `laneHold` has no successor at
all, and a jump trip has no board-leg/gate-ETA distinction to read
"Departing" from (design.md Decision 4, Decision 10).

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

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

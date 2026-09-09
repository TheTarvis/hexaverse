## MODIFIED Requirements

### Requirement: One Row Per Owned Fleet, Derived From Kinematic State

The system SHALL show one row per owned fleet, deriving its status from the
fleet's kinematic state evaluated at the current world time (the effective,
folded `space.ShipState` — burn, park, or drift — never the raw stored
state), its `attachedTo` host, its `jump` lane-transit field, the fleet's
running mine action if one exists with an ETA still in the future, and a
system-name lookup: a status tone (idle, moving, drifting, or transit), a
"where" label (a system name, or "Origin → Destination" while in lane
transit), an activity label in player-facing language, and — when the
current order has a known completion time — a remaining-time countdown,
presented per `figure-formatting` as a relative duration at the mounting
view's served scale and carrying its raw remaining span in unscaled
world-milliseconds. A running mine action whose ETA has passed SHALL NOT
drive the label; the row falls back to the kinematic-state-derived
activity. WHEN the mounting view has not yet received a served world-clock
`scale` for a fleet whose current order has a known completion time, that
row's countdown SHALL render `figure-formatting`'s absent form rather than
being computed at an assumed scale of 1.

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
  countdown to the burn's arrival time, presented per `figure-formatting`
  and carrying its raw remaining span in unscaled world-milliseconds

#### Scenario: A drifting fleet reads as drifting, with no countdown

- **WHEN** a fleet's effective state is a drift
- **THEN** its row shows tone `drifting` and "Drifting" as the activity, with
  no countdown

#### Scenario: A docked fleet with a running mine reads as mining

- **WHEN** a fleet's effective state is a park with `attachedTo` set and it
  has a running mine action whose ETA is in the future
- **THEN** its row shows a "Mining" activity with a countdown to the run's
  ETA, presented per `figure-formatting`, instead of the docked state's idle
  label

#### Scenario: A past-ETA mine action no longer drives the label

- **WHEN** a fleet's running mine action's ETA is at or before the current
  world time
- **THEN** its row shows the kinematic-state-derived activity, not "Mining"

#### Scenario: A fleet mid-jump reads as in transit

- **WHEN** a fleet's `jump` field is set (a lane crossing is underway)
- **THEN** its row shows tone `transit`, "In transit" as the activity, a
  countdown to the jump's arrival time presented per `figure-formatting`,
  and "Origin → Destination" as its where label

#### Scenario: An unknown system name falls back to its id

- **WHEN** a fleet's system id has no corresponding name in the loaded
  galaxy data
- **THEN** its where label falls back to the raw system id rather than
  failing to render

#### Scenario: A countdown renders absent until a scale is served

- **GIVEN** the mounting view has not yet received a served `scale` for a
  fleet whose order has a known completion time
- **WHEN** that fleet's row is rendered
- **THEN** its countdown shows `figure-formatting`'s absent form (`—`),
  never a duration computed at an assumed scale of 1

### Requirement: The Roster Row Shows Held Fuel and an Estimated Range
The system SHALL show, on each owned fleet's roster row, its currently
held `fuel` tonnage and the estimated maximum range the fleet read
endpoint reports for it (`fleet-movement`'s "Fleet Read Reports an
Estimated Maximum Range From Current Fuel"), rendering the server-reported
figures as-is — this capability SHALL NOT compute or re-derive either
value. Each figure is presented per `figure-formatting` (fuel as a
tonnage, range as a magnitude-suffixed figure) and carries its raw served
value. WHEN either figure is unavailable on the fleet read, the row SHALL
show that figure's `figure-formatting` absent form (`—`) rather than
substituting zero — a fleet with no served roster fields is not
indistinguishable from a fleet holding no fuel. Because the range figure
carries no unit name of its own (`figure-formatting`'s *A Range or
Distance...* rule), the row SHALL render it adjacent to a label identifying
it as a range, so the bare magnitude-suffixed number is never shown with no
textual context for what it measures.

#### Scenario: A roster row shows the fleet's held fuel and estimated range
- **WHEN** a roster row is rendered for an owned fleet
- **THEN** it shows that fleet's currently held `fuel` tonnage and its
  server-reported estimated maximum range, each presented per
  `figure-formatting` and carrying its raw served value

#### Scenario: The roster never computes range client-side
- **WHEN** a roster row's fuel or range figure is rendered
- **THEN** both values are the server's own reported figures, with no
  client-side recomputation from acceleration, hull count, or fuel alone

#### Scenario: An unavailable fuel or range figure reads as absent, not zero
- **WHEN** a roster row is rendered for an owned fleet whose fleet read
  does not carry a fuel or range figure
- **THEN** that figure shows the `figure-formatting` absent form (`—`),
  never `0t fuel` or a bare `0`

#### Scenario: A bare range figure is never shown without its label
- **WHEN** a roster row's range figure is rendered
- **THEN** it is shown adjacent to a label identifying it as the fleet's
  estimated range, not as a bare magnitude-suffixed number with no
  surrounding context

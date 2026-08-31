## ADDED Requirements

### Requirement: A Drifting Contact Reports Its Drift Velocity and Does Not Emit

The system SHALL, when computing a live contact's velocity for a fleet
whose kinematic state is a drift, report the fleet's stored drift velocity
— including the zero vector — as that contact's velocity, computed by no
other path. The system SHALL treat a drifting fleet as not emitting at any
world time: emission ends the same instant a burn is cut into a drift, and
a drift has no engine output to detect (design.md Decision 5, Decision 6).

#### Scenario: A drifting contact reports its stored drift velocity

- **GIVEN** a fleet whose effective kinematic state is a drift with a
  non-zero stored velocity
- **WHEN** that fleet's contact velocity is computed
- **THEN** the reported velocity equals the drift's stored velocity exactly

#### Scenario: A zero-velocity drift reports a stationary contact

- **GIVEN** a fleet whose effective kinematic state is a drift with a
  zero stored velocity
- **WHEN** that fleet's contact velocity is computed
- **THEN** the reported velocity is the zero vector, computed without error

#### Scenario: A drifting fleet never emits

- **GIVEN** a fleet whose effective kinematic state is a drift
- **WHEN** emission is evaluated at any world time
- **THEN** the fleet is not emitting

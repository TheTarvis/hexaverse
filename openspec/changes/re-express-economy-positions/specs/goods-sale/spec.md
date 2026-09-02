## MODIFIED Requirements

### Requirement: Sale Requires the Fleet Docked To the Buying Station
A sale SHALL be accepted only when the selling fleet's effective state, at
the request instant, is `docked` to the named station; coasting, burning,
lane-transit, lane-hold, docked-elsewhere, or merely parked at, near, or
coincident with the station's position without a matching stored
`attachedTo` SHALL be rejected.

#### Scenario: A fleet docked to the named station may sell
- **WHEN** a fleet whose effective state is `docked` to the named station
  submits a sale, and all other preconditions hold
- **THEN** the sale is accepted

#### Scenario: A coasting fleet cannot sell
- **WHEN** a fleet whose effective state is `coast` submits a sale
- **THEN** the sale is rejected

#### Scenario: A burning fleet cannot sell
- **WHEN** a fleet whose effective state is `burn` submits a sale
- **THEN** the sale is rejected

#### Scenario: A fleet in lane transit or lane-held cannot sell
- **WHEN** a fleet whose effective state is `laneTransit` or `laneHold`
  submits a sale
- **THEN** the sale is rejected

#### Scenario: A fleet docked elsewhere cannot sell at a different station
- **WHEN** a fleet docked to a feature other than the named station submits
  a sale against that station
- **THEN** the sale is rejected

#### Scenario: A fleet parked near the station but not attached to it cannot sell
- **WHEN** a fleet's resolved position coincides with or lies near the
  station — for example, a fleet freshly arrived via a lane jump and parked
  near a gate that happens to sit close to the station, or a fleet whose
  free drift merely passes near the station's orbit — but its stored
  `attachedTo` does not name the station
- **THEN** the sale is rejected with the same not-docked rejection as any
  other non-docked state; positional proximity or apparent co-location
  never substitutes for the stored attachment string

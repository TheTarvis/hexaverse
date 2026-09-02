## MODIFIED Requirements

### Requirement: Idle Ships Park in Exactly One of Three Modes
The system SHALL represent an idle ship's resting state as exactly one of:
`orbit` (a free rails orbit around a body), `stationkeep` (a fixed offset
held continuously in a body's reference frame, at a continuous cost), or
`point` (a fixed position in space, free). `orbit` and `point` SHALL impose
no ongoing cost; `stationkeep` SHALL impose the continuous upkeep defined
below. A `stationkeep` park SHALL additionally store the world time its hold
began and a dry instant — the world time at which continued upkeep would
draw the fuel held at hold-start down to the configured station-keeping
reserve the holding capability defines, computed when the hold is created
and thereafter changed only where that same holding capability restamps the
hold, in which case both fields are rewritten together against the
mutation's own instant and the fuel level at it (see `fleet-movement`'s
"Station-Keeping Hold and Release Are Fleet Verbs", "Station-Keeping Upkeep
Never Drains a Fleet Below Its Reserve", and "Station-Keeping Upkeep Is
Settled at Discrete Events, Never Folded Into the Stored Cargo Pool") — and
observing a `stationkeep` park at or after its stored dry instant SHALL fold
it into its released orbit (see "A Station-Keeping Park Past Its Dry Instant
Is Its Released Orbit, With No Extra Persisted State").

#### Scenario: An orbit park stays at its configured radius from its body forever
- **WHEN** an orbit park's position and its body's position are evaluated at
  world times 0, 8.3, and 55
- **THEN** the distance between them equals the park's configured radius at
  every one of those times

#### Scenario: A station-keep park holds the exact stored offset
- **WHEN** a station-keep park's position is evaluated at two different world
  times, both before its stored dry instant
- **THEN** at each time it equals its body's position at that time plus the
  park's exact stored offset

#### Scenario: A point park never moves
- **WHEN** a point park's position is evaluated at two different world times
- **THEN** both evaluations return the identical position

#### Scenario: A newly created station-keep park stores its start time and dry instant
- **WHEN** a `stationkeep` park is created
- **THEN** it stores the world time it was created and a dry instant
  computed from the spendable fuel held above the reserve and the upkeep
  rate at that same instant
- **AND** neither value changes with the mere passage of time, nor with any
  read of the park; the two change only together, and only where the
  holding capability restamps the hold at a mid-hold `fuel` mutation that
  leaves the hold open

### Requirement: Coordinates Cross the Persistence Boundary Through a Named Codec

The system SHALL encode every position, control point, and orbital element
set into storage-native primitives through one named codec before it
crosses into an untyped parameter map (a Firestore document or an
`action.Params` payload), and SHALL decode through that codec's exact
inverse. The codec SHALL reject a value that decodes to a non-finite number
(`NaN` or ±infinity) or to a magnitude beyond a configured extent, with a
named, countable failure — no such value SHALL reach a downstream
computation in this capability. This codec SHALL extend to a ship's whole
kinematic state: a burn (origin point, target identity or explicit point,
solved intercept point, all six curve control points, curve length, depart
and arrive world-milliseconds, commanded acceleration, and, for a body
target, the insertion phase index), a park (of any of its three kinds,
including — for a `stationkeep` park — its stored hold-start time and dry
instant), and a drift (anchor, velocity, epoch). The six curve control
points SHALL NOT be encoded as a slice of slices (`[][]float64`), which the
action spine's existing non-primitive parameter validation rejects; the
codec SHALL encode them as a flat list of numeric primitives, as a list of
per-point primitive lists wrapped in `[]any`, or as a keyed map — any shape
the action spine's allowlist accepts. A decode SHALL fail, by the same
named, countable decode-failure, when the stored control points do not
number exactly six, or when the decoded curve length is not bit-identical
to the arc length recomputed from the decoded control points — and no
downstream computation SHALL run on a partially-decoded state. A decode
SHALL also fail, by the same named error, when a drift's stored epoch is
absent or non-positive, when a `stationkeep` park's stored hold-start time
is absent or non-positive, or when its stored dry instant is absent or not
strictly after that hold-start time. Guarding the dry instant alone is not
sufficient: an absent hold-start decodes to zero, and every upkeep accrual
computed from it then runs from world-epoch zero — a debit of the fleet's
entire spendable fuel, silently clamped, on a park that decoded without
complaint.

#### Scenario: A position encodes to storage-native primitives and decodes back exactly

- **WHEN** a burn's origin position is encoded by the codec
- **THEN** it encodes to a list of storage-native numeric primitives that the
  action spine's existing parameter validator accepts
- **AND** decoding that encoded form returns a vector identical to the
  original

#### Scenario: A bare domain vector is rejected by the action spine's existing validation

- **WHEN** an attempt is made to commit an action whose parameters contain a
  raw vector or orbit struct rather than its encoded primitive form
- **THEN** the commit is rejected by the action spine's existing
  non-primitive-parameter validation, unchanged by this capability

#### Scenario: A coordinate decoding to a non-finite or out-of-extent value fails by name, not silently

- **WHEN** a stored coordinate decodes to `NaN`, positive or negative
  infinity, or a magnitude beyond the configured extent
- **THEN** decoding fails with a named, countable error
- **AND** no computation in this capability is performed on that value

#### Scenario: A solved burn round-trips exactly through the codec

- **WHEN** a fully solved burn (origin, target, intercept, six control
  points, curve length, depart/arrive milliseconds, commanded acceleration,
  and insertion phase index) is encoded and then decoded
- **THEN** every one of those fields on the decoded burn is identical to the
  original

#### Scenario: Every park kind and a drift round-trip exactly through the codec

- **WHEN** a park of each of its three kinds — including a `stationkeep`
  park's stored hold-start time and dry instant — and separately a drift,
  is encoded and then decoded
- **THEN** the decoded value is identical to the original in every case

#### Scenario: The wrong number of control-point components fails by name

- **WHEN** a stored value that should decode to six control points instead
  contains a different number of components
- **THEN** decoding fails with the existing named decode-failure, and no
  burn is produced

#### Scenario: A stored curve length disagreeing with the recomputed arc length fails by name

- **WHEN** a stored burn's control points, decoded and walked through this
  capability's own arc-length computation, produce a length that disagrees
  with the burn's separately stored curve length
- **THEN** decoding fails with the existing named decode-failure, and no
  burn is produced

#### Scenario: A non-finite component within a burn's control points fails by the existing named error

- **WHEN** a stored burn's control-point list decodes to a component that is
  `NaN` or ±infinity
- **THEN** decoding fails with this capability's existing named, countable
  decode-failure error
- **AND** no position, velocity, or arrival computation is performed on that
  value

#### Scenario: A drift with an absent or non-positive epoch fails to decode

- **WHEN** a stored drift's epoch field is absent, zero, or negative
- **THEN** decoding fails with the existing named, countable decode-failure
  error, and no drift is produced

#### Scenario: A station-keep park with a missing or invalid dry instant fails to decode

- **WHEN** a stored `stationkeep` park's hold-start time is absent or
  non-positive, or its dry instant is absent, or its dry instant is not
  strictly after its stored hold-start time
- **THEN** decoding fails with the existing named, countable decode-failure
  error, and no park is produced, in each of those cases

## ADDED Requirements

### Requirement: A Station-Keeping Park Past Its Dry Instant Is Its Released Orbit, With No Extra Persisted State
The system SHALL derive a station-keeping ship's state entirely from its
stored `stationkeep` park: a park whose stored dry instant has passed IS
its released orbit, computed deterministically from the stored park alone
— specifically, the released orbit is exactly what
`space.ReleaseStationkeep` would produce for that park's body id, held
offset, and dry instant as the release time — no field beyond the park's
own already-stored hold-start time, dry instant, body id, and offset SHALL
be persisted to represent this transition, and evaluating it repeatedly at
different later times SHALL produce identical results. This mirrors "A
Burn Past Its Arrival Is Its Settled Park, With No Extra Persisted State"
exactly, substituting the hold's dry instant for a burn's arrival time.

#### Scenario: A station-keep park is still held immediately before its dry instant and released immediately after
- **WHEN** a station-keeping ship's state is evaluated one millisecond
  before its park's stored dry instant
- **THEN** it is reported as still `stationkeep`, at its exact held offset
- **WHEN** the same ship's state is evaluated one millisecond after its
  park's stored dry instant
- **THEN** it is reported as released into an `orbit` park

#### Scenario: Folding at two later times gives identical results
- **WHEN** a past-dry-instant station-keep park's state is evaluated at two
  different times, both after its dry instant
- **THEN** both evaluations produce the identical released orbit

#### Scenario: The released orbit matches ReleaseStationkeep's own output exactly
- **WHEN** a past-dry-instant park's folded state is compared against
  calling `space.ReleaseStationkeep` directly with that park's body id,
  offset, and dry instant as the release time
- **THEN** the two produce identical orbit parameters

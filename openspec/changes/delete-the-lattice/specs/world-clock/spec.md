## MODIFIED Requirements

### Requirement: Scaled World Time
The system SHALL expose a single simulation clock whose current instant is
computed as `worldTime = (wallNow − epoch) × scale`, expressed in
`WorldMillis` (a distinct integer-millisecond type, not directly
interchangeable with a wall-clock unix-millis value), where `epoch` is the
clock instance's configured epoch (the fixed world epoch for the
process-wide singleton; an arbitrary instant for an injected test clock, per
the "Injectable for Tests" requirement). This clock is the sole time source
for every persisted **gameplay/simulation** timestamp (a fleet's departure,
an action's ETA, a sighting's `asOf`, a corporation's
`createdAt`/`diedAt`) in the galaxy, system, space, disclosure, fleet,
action, charts, and corporations domains. This is an architectural constraint
on consumers of the clock, verified by code review / convention rather than
by the clock itself or by any runtime check: code in those domains SHALL
NOT read wall-clock time (`time.Now()`) directly. Administrative/audit
timestamps outside the simulation (e.g. `account.CreatedAt`/`UpdatedAt`,
Pub/Sub event envelope `Timestamp`/`PublishedAt`, SSE heartbeat stamps) are
intentionally wall-clock `time.Time` and out of scope for this contract.

#### Scenario: Scale warps elapsed time
- **WHEN** the clock is constructed with `scale = 2.0` and one wall-clock
  second elapses
- **THEN** `Now()` advances by 2000 `WorldMillis`

#### Scenario: Scale of 1 tracks real time
- **WHEN** the clock is constructed with `scale = 1.0`
- **THEN** `Now()` advances at the same rate as the wall clock, offset from
  the world epoch

#### Scenario: A wall-clock instant converts to world time
- **WHEN** `FromWall(t)` is called on a clock for a wall-clock instant `t`
- **THEN** the result is `(t − the clock's epoch) × scale` — the same
  formula `Now()` uses for the current instant (for the process-wide
  singleton, the clock's epoch is the fixed world epoch)

#### Scenario: Simulation domains read only the world clock
- **WHEN** any source file in the galaxy, system, space, disclosure, fleet,
  action, charts, or corporations domains needs the current time or reads a
  persisted gameplay timestamp
- **THEN** it obtains that time through the world clock (`WorldClock()` /
  `FromWall`), expressed in `WorldMillis`
- **AND** it does not read wall-clock time (`time.Now()`) directly —
  verified by code review / convention, since the clock cannot enforce this
  at runtime

#### Scenario: Administrative timestamps are wall-clock by design, not a violation
- **WHEN** an account is created or updated, or a Pub/Sub event envelope is
  built
- **THEN** its audit timestamp (`createdAt`, `updatedAt`, `publishedAt`) is a
  wall-clock `time.Time` value, not `WorldMillis` — this is intentional and
  outside the gameplay world-clock contract, not domain code leaking
  `time.Now()`

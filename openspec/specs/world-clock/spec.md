# world-clock Specification

## Purpose
TBD - created by archiving change add-world-clock-spec. Update Purpose after archive.
## Requirements
### Requirement: Scaled World Time
The system SHALL expose a single simulation clock whose current instant is
computed as `worldTime = (wallNow − epoch) × scale`, expressed in
`WorldMillis` (a distinct integer-millisecond type, not directly
interchangeable with a wall-clock unix-millis value), where `epoch` is the
clock instance's configured epoch (the fixed world epoch for the
process-wide singleton; an arbitrary instant for an injected test clock, per
the "Injectable for Tests" requirement). This clock is the sole time source
for every persisted **gameplay/simulation** timestamp (a fleet's departure,
an action's ETA, an observation's `asOf`, a corporation's
`createdAt`/`diedAt`) in the galaxy, system, board, fleet, action,
observation, and corporations domains. This is an architectural constraint
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
- **WHEN** any source file in the galaxy, system, board, fleet, action,
  observation, or corporations domains needs the current time or reads a
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

### Requirement: Non-Positive Scale Defaults to Real Time
The system SHALL, when constructing a clock (`NewWorldTime`) with a
`scale` that is zero or negative, silently substitute `scale = 1` rather
than constructing a clock that runs backward or stands still.

#### Scenario: Zero scale is corrected to 1
- **WHEN** `NewWorldTime` is called with `scale = 0`
- **THEN** the constructed clock behaves as if `scale = 1` (real time)

#### Scenario: Negative scale is corrected to 1
- **WHEN** `NewWorldTime` is called with a negative `scale`
- **THEN** the constructed clock behaves as if `scale = 1` (real time)

### Requirement: Fixed World Epoch
The system SHALL anchor every world clock to one fixed reference instant
(`2026-01-01 UTC`, the world epoch), constant across the process and never
read from configuration, so that `Now()` is always positive and every
stored `WorldMillis` stamp is comparable against stamps produced by any
other clock instance sharing the same epoch **and the same scale** (a
differing scale reinterprets the real-time meaning of every stamp — see the
scale-immutability invariant in design.md).

#### Scenario: Now is always positive
- **WHEN** `Now()` is called at any wall-clock instant after process start
- **THEN** the returned `WorldMillis` value is positive, because the world
  epoch is fixed in the past

#### Scenario: Two concurrent instances of the same live world must share scale
- **WHEN** two clock instances serving the same live world are constructed
  with different `scale` values (for example, two concurrently-running
  process revisions of the same live world configured with different
  scales during a rolling deploy)
- **THEN** the `WorldMillis` stamps each instance produces are not
  meaningfully comparable, and the system provides no runtime detection or
  alarm for the mismatch — this is the same unenforced invariant as
  scale-immutability over time within one instance, extended across
  concurrent instances (see design.md Risks / Trade-offs), not a contract
  the clock enforces

### Requirement: Process-Wide Singleton, Config-Driven Scale
The system SHALL provide one process-wide clock instance (`WorldClock()`),
constructed exactly once from the fixed world epoch and a configured scale
factor, so that all domain code sharing a process reads a single consistent
notion of "now". (The scale source — `config.ServiceConfig.WorldTimeScale`
— is documented in design.md.)

#### Scenario: Repeated calls return the same clock
- **WHEN** `WorldClock()` is called more than once in the same process
- **THEN** every call returns the same clock instance, constructed only on
  the first call

### Requirement: Injectable for Tests
The system SHALL expose world time construction (`NewWorldTime(epoch,
scale)`) as a standalone function independent of the process-wide
singleton, so tests can inject a fake or differently-scaled clock without
depending on `WorldClock()` or real wall-clock time.

#### Scenario: A test-constructed clock is independent of the singleton
- **WHEN** a test calls `NewWorldTime` directly with its own epoch and scale
- **THEN** the resulting clock's `Now()` reflects only that construction,
  never the process-wide `WorldClock()` singleton's state


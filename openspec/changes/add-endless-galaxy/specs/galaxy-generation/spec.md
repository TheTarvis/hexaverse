# Galaxy Generation — Delta: The Endless Galaxy

Note for archive/sync: the baseline spec's Purpose and Notes sections must be
rewritten alongside these deltas (generation is no longer once-per-galaxy and
no longer never-at-request-time; the three writer seams are scan resolution,
the spawn walk, and seeding). Replacement text is specified in the change's
design.md Migration Plan.

## ADDED Requirements

### Requirement: Lazy, Idempotent Block Materialization
The system SHALL persist the galaxy as the materialized subset of the
deterministic star field, growing it in **blocks** — fixed
`BlockSize × BlockSize` cell tiles, the materialization atom — under an
atomic create-if-absent anchor per block: when a trigger (scan resolution,
the spawn walk, or initial seeding) touches an unmaterialized block, the
system SHALL compute that block's systems and lanes from the field and
persist them in one transaction keyed on the block's anchor, exactly once.
The transaction SHALL read, inside the same transaction, the anchors of
every block that can share a lane with the materializing block — its eight
neighbors (the ordinary-lane horizon) plus every block within
`BridgeSearchHorizon` blocks along the four cardinal axes (bridge
far-endpoints, which skip empty blocks and may lie beyond the eight) — and
SHALL write every lane, ordinary or bridge, whose far endpoint's block is
already materialized, so lanes between any two lane-sharing blocks exist as
soon as both blocks do — regardless of concurrency or order. A system's
**full lane horizon** — the set materialization triggers ensure — is its
block's 3×3 window plus the far-endpoint block of every bridge lane
incident to that system (computable from the pure field alone). System ids
SHALL be the system's field cell coordinates, and lane ids SHALL derive
from the unordered pair of endpoint system ids, so a lane materialized from
either side is the same document. Seeding starts the materialized set at
the origin block. Materialization SHALL be invisible to players: a
materialized-on-demand system is indistinguishable from one persisted at
initial seeding, and newly materialized systems enter every requester's
star layer (the field is public astronomy). Plain reads (`GET /v1/galaxy`,
`GetLiveSystem`) SHALL NOT themselves create system or lane documents
(due-action resolution triggered by a read materializes under the scan
trigger, not the read).

#### Scenario: Concurrent materialization of the same block converges
- **WHEN** two triggers concurrently materialize the same unmaterialized
  block
- **THEN** exactly one anchor and one set of system and lane documents
  exist afterward, identical to what either trigger would have produced
  alone

#### Scenario: Adjacent blocks materialized concurrently keep every lane between them
- **WHEN** two adjacent unmaterialized blocks are materialized concurrently
- **THEN** every field lane with one endpoint in each block exists exactly
  once afterward

#### Scenario: Overlapping multi-block materializations converge block by block
- **WHEN** one trigger materializes blocks {X, Y} while another concurrently
  materializes blocks {Y, Z}
- **THEN** X, Y, and Z are each materialized exactly once, identically to
  sequential materialization in any order

#### Scenario: A cross-block lane materialized from either side is one document
- **WHEN** a lane's two endpoint blocks are materialized in either order
- **THEN** exactly one lane document exists, with the same id regardless of
  which block's materialization wrote it

#### Scenario: A bridge across empty blocks is persisted exactly once from either side
- **WHEN** two non-empty blocks joined by a bridge that skips empty blocks
  between them are materialized — in either order, or concurrently
- **THEN** the bridge lane exists exactly once as soon as both blocks do,
  with the same document id regardless of which side's materialization
  wrote it

#### Scenario: Re-materializing an existing block is a no-op
- **WHEN** a trigger touches a block whose anchor already exists
- **THEN** no system, lane, or anchor documents are created or modified

#### Scenario: Reads create no galaxy documents
- **WHEN** `GET /v1/galaxy` or `GetLiveSystem` is served
- **THEN** no system, lane, or block-anchor documents are created by the
  read itself

#### Scenario: New stars are public astronomy
- **WHEN** one corporation's scan or spawn causes systems to materialize
- **THEN** those systems appear in the star layer served to every requester,
  including corporations that have never observed them (a deliberate
  decision — the star layer is unfogged; only activity location leaks, no
  actor identity, lanes, or tiers)

### Requirement: Generation Parameter Validation
The system SHALL reject a `GenerationParams` value — at seeding and at
service construction, with a clear error — when `MaxLaneLength` is not
positive, when `BlockSize` is less than 1, when `BlockSize · cellSize` is
less than or equal to `MaxLaneLength` (strictly greater is required: at
exact equality an ordinary lane could span past adjacent blocks, breaking
the materialization horizon), when `BridgeSearchHorizon` is less than 1,
when `MinOriginComponentSystems` is less than 1, or when a block's
worst-case document write count would exceed the storage transaction write
limit.

#### Scenario: A non-positive lane cap is rejected
- **WHEN** params are supplied with `MaxLaneLength ≤ 0` (a laneless world —
  no walk could ever move)
- **THEN** seeding/construction fails with a validation error and nothing is
  persisted

#### Scenario: A lane cap reaching the block side is rejected
- **WHEN** params are supplied with `BlockSize · cellSize ≤ MaxLaneLength`
- **THEN** seeding/construction fails with a validation error and nothing is
  persisted

#### Scenario: A degenerate block size is rejected
- **WHEN** params are supplied with `BlockSize < 1`
- **THEN** seeding/construction fails with a validation error and nothing is
  persisted

#### Scenario: A degenerate bridge horizon is rejected
- **WHEN** params are supplied with `BridgeSearchHorizon < 1`
- **THEN** seeding/construction fails with a validation error and nothing is
  persisted

#### Scenario: A degenerate origin-component floor is rejected
- **WHEN** params are supplied with `MinOriginComponentSystems < 1`
- **THEN** seeding/construction fails with a validation error and nothing is
  persisted

#### Scenario: A block too large for one transaction is rejected
- **WHEN** params are supplied whose worst-case block write count exceeds
  the transaction write limit
- **THEN** seeding/construction fails with a validation error and nothing is
  persisted

### Requirement: Seed-Time Start-Area Validation
The system SHALL, when seeding a galaxy, validate the origin neighborhood
before setting the live pointer: the origin system — the surviving
candidate nearest the field coordinate origin within the start area, ties
broken by the candidates' deterministic hash priority — SHALL exist and its
id SHALL be recorded on the galaxy document (runtime consumers read the
recorded id, never re-derive it); the origin system's lane component within
the start area SHALL contain at least `MinOriginComponentSystems` systems;
and at least one system in that component SHALL carry a mineable skeleton
body. A seed failing validation SHALL be rejected without going live; any
blocks already written under the rejected galaxy's id remain unreferenced
by the live pointer (acceptable garbage, never served).

#### Scenario: A degenerate seed never goes live
- **WHEN** seeding runs with a seed whose start area fails validation (no
  origin survivor, undersized origin component, or no mineable system in it)
- **THEN** seeding fails with a clear error and the live pointer is not
  written or repointed

#### Scenario: The origin system is durable
- **WHEN** a galaxy is seeded successfully and later read
- **THEN** the origin system id recorded at seed time resolves to a
  materialized system, and consumers use that recorded id even if
  generation parameters have since changed

## MODIFIED Requirements

### Requirement: Deterministic Graph Generation
The system SHALL define the galaxy as a pure, deterministic function of a
seed and a `GenerationParams` value over unbounded space: for any region of
space, the same (seed, params) pair SHALL always yield identical systems and
lanes, independent of the order, grouping, or trigger by which blocks are
materialized.

#### Scenario: Same seed reproduces the same blocks
- **WHEN** the same blocks are computed twice from the same seed and params
- **THEN** the resulting systems and lanes are deep-equal between the two
  computations

#### Scenario: Different seeds diverge
- **WHEN** the same blocks are computed with two different seeds and the
  same params
- **THEN** the resulting system sets are not identical

#### Scenario: Materialization order does not change the world
- **WHEN** the same set of blocks is materialized in two different orders in
  two worlds sharing the same seed and params
- **THEN** the persisted systems and lanes are identical between the two
  worlds

### Requirement: Region-Classified, Poisson-Spaced System Placement
The system SHALL place systems by deterministic hashed-cell Poisson sampling
over unbounded space: space is partitioned into a fixed grid of cells sized
from the largest region-specific minimum gap; each cell derives at most one
candidate position and priority purely from (seed, cell coordinates); each
candidate's region is classified from 3D fractal simplex noise at its
position (star-rich, normal, dead, or barrier, with barrier the thin
zero-crossing band around `BarrierBand`); and a candidate survives **if and
only if** every conflicting neighbor candidate (closer than the larger of
the two candidates' region-specific minimum gaps) has lower deterministic
priority. The surviving set for any cell SHALL be computable from the fixed
3×3 window of neighboring cells, so placement is local and independent of
materialization order.

#### Scenario: Minimum spacing is respected
- **WHEN** any set of blocks is materialized with a given
  `GenerationParams.MinGapByRegion`
- **THEN** every pair of surviving systems is at least as far apart as the
  larger of their two region-specific minimum gaps

#### Scenario: The field is populated at the configured density
- **WHEN** a large contiguous area of the field is computed with the default
  params
- **THEN** each region class's systems-per-unit-area falls within the
  tolerance band asserted by the generator statistics test, and no region
  class is empty at that scale

#### Scenario: Star-rich regions pack denser than dead regions
- **WHEN** a sufficiently large area of the field is computed with the
  default params (tight star-rich gap, sparse dead gap)
- **THEN** the system count in star-rich space is not lower than the count
  in dead space

#### Scenario: Barrier regions are the sparsest
- **WHEN** a sufficiently large area of the field is computed with the
  default params
- **THEN** the barrier region's system count does not exceed any other
  region's count

#### Scenario: Placement of a cell needs only its bounded neighborhood
- **WHEN** a cell's surviving candidate is computed
- **THEN** the computation reads only candidates within the 3×3 window of
  neighboring cells, never the whole field

### Requirement: Connected Lane Graph
The system SHALL derive lanes locally from the deterministic field: an edge
(a, b) between two surviving systems no farther apart than the configured
maximum lane length is kept only if no third surviving system lies closer to
both a and b than a and b are to each other (the relative-neighbourhood
rule), evaluated against all field candidates within a bounded window so the
same lanes result regardless of materialization order. Pairs farther apart
than the maximum lane length SHALL NOT be joined by an ordinary lane (voids
are real). The system SHALL additionally derive **bridge lanes**,
deterministically and locally: for each non-empty block and each positive
cardinal direction, if a nearest non-empty block exists in that direction
within `BridgeSearchHorizon` blocks and no ordinary lane already spans
between the two blocks, exactly one bridge lane joins the closest system
pair between them (deterministic hash tie-break) — at most one bridge per
(block, direction), never where an ordinary lane already spans, and none
originating from or targeting an empty block (an empty block is skipped
over, not bridged to). Block emptiness here is emptiness of the **field**
(no surviving candidates in the block's cells), never of the materialized
subset — bridge geometry is a pure function of the seed, independent of
what has been persisted. Bridge lanes MAY exceed the maximum lane length and
SHALL carry a `bridge` marker distinguishing them from ordinary lanes in
storage and in the galaxy read payload. The system SHALL NOT claim global
reachability across the field: lane components separated by voids wider
than the bridge horizon are permitted, and the play guarantee (every
corporation's home shares the origin system's component) is enforced
structurally by the spawn walk (see `corporation-spawn`).

#### Scenario: Ordinary lanes never exceed the maximum length
- **WHEN** a block's lanes are computed
- **THEN** every lane not marked `bridge` has endpoint separation at most
  the configured maximum lane length

#### Scenario: No bridge is added where an ordinary lane already spans the pair
- **WHEN** two non-empty blocks within the bridge horizon are already joined
  by an ordinary lane between them
- **THEN** no bridge lane is added for that block pair

#### Scenario: An empty block does not break bridge stitching
- **WHEN** a non-empty block's nearest non-empty neighbor in a direction
  lies beyond one or more empty blocks but within the bridge horizon
- **THEN** exactly one bridge joins the closest system pair between the two
  non-empty blocks, skipping the empty blocks between them

#### Scenario: Later materialization never contradicts an existing lane
- **WHEN** a lane has been persisted and an adjacent block is subsequently
  materialized
- **THEN** the new block's systems and lanes are consistent with the
  existing lane (it would have been derived identically had both blocks
  materialized together), and no persisted lane is removed or rewritten

#### Scenario: Lanes reference real, distinct systems
- **WHEN** a block's lanes are persisted
- **THEN** every lane's two endpoint ids resolve to persisted systems in the
  same galaxy
- **AND** no lane connects a system to itself

### Requirement: Deterministic System Naming
The system SHALL derive a pronounceable system name from the galaxy seed and
the system's stable field identity (its cell coordinates), such that the same
(seed, field identity) always yields the same name regardless of when or in
what order systems materialize.

#### Scenario: Same seed and field identity reproduce the name
- **WHEN** a system name is derived twice for the same seed and the same
  field identity
- **THEN** the two names are identical

#### Scenario: Names are independent of materialization order
- **WHEN** the same system materializes in two worlds sharing a seed but with
  different materialization histories
- **THEN** it carries the same name in both

### Requirement: Live Galaxy Persistence and Pointer
The system SHALL persist a seeded galaxy's metadata and its initially
materialized blocks under a fresh generated id and then atomically repoint a
single "live" pointer document at that id, leaving any previously live
galaxy's data intact and independently readable at its own id. Later
materialization grows the live galaxy's own subcollections and SHALL never
touch a non-live galaxy.

#### Scenario: Reseeding does not corrupt the prior galaxy
- **WHEN** seeding runs a second time with a new seed
- **THEN** the new galaxy is persisted under a new id
- **AND** the live pointer now resolves to the new galaxy
- **AND** the previous galaxy's metadata, systems, and lanes are still
  readable, unchanged, at its own id

#### Scenario: No live galaxy yet
- **WHEN** `GetLive` (or `LiveGalaxyMeta`, or `GetLiveSystem`) is called
  before any galaxy has been seeded
- **THEN** the call fails with `ErrNoLiveGalaxy`

#### Scenario: Requested system not materialized in the live galaxy
- **WHEN** `GetLiveSystem` is called with a system id absent from the live
  galaxy's materialized set
- **THEN** the call fails with `ErrSystemNotFound` and nothing materializes

### Requirement: Idempotent Local/Emulator Dev Seeding
The system SHALL, when triggered on local/emulator boot, materialize the
configured block radius around the field origin block (the start area) from
the fixed dev seed, run seed-time start-area validation, and set the galaxy
live only if no live galaxy already exists, leaving an existing live galaxy
untouched on repeated boots.

#### Scenario: First boot seeds the origin neighborhood
- **WHEN** the dev seed routine runs and no live galaxy exists
- **THEN** the configured block radius around the origin block is
  materialized from the fixed dev seed and start-area params, validated, and
  set live

#### Scenario: Later boots are a no-op
- **WHEN** the dev seed routine runs and a live galaxy already exists
- **THEN** no new galaxy is created, nothing further materializes, and the
  existing live pointer is unchanged

### Requirement: Galaxy Graph Read Endpoint
The system SHALL serve `GET /v1/galaxy` returning the live galaxy's id,
seed, the bounds of the currently materialized extent, every materialized
system (id, coords, name, region, skeleton, and the requester's fog tier),
every lane the requester has charted (each carrying its `bridge` marker),
and the current world time. The star layer (system nodes, coordinates,
region, skeleton) SHALL be served for every materialized system regardless
of fog; only per-requester tier and lane visibility are fog-filtered — and
only once a corp id is resolved for the requester: the charted-lane and tier
filters key on `corporationId`, so an authenticated requester with no
resolved corp id (not yet spawned) receives the same unfiltered output as
when no fog dependency is configured at all. The reported bounds SHALL be
maintained monotonically by block materialization so they always contain
every materialized system.

#### Scenario: No live galaxy
- **WHEN** `GET /v1/galaxy` is called and no galaxy has been seeded
- **THEN** the response is `404 Not Found`

#### Scenario: The response grows as the world materializes
- **WHEN** `GET /v1/galaxy` is called, then new blocks materialize (e.g. via
  a frontier scan), then it is called again
- **THEN** the second response contains the newly materialized systems and
  the first response's systems unchanged

#### Scenario: Bounds track the materialized extent
- **WHEN** a block outside the currently reported bounds materializes
- **THEN** the next `GET /v1/galaxy` reports bounds containing that block's
  systems

#### Scenario: Every system ships with a default tier when fog is not wired
- **WHEN** `GET /v1/galaxy` is served without a fog dependency configured
- **THEN** every materialized system in the response has tier `starVisible`
  and its full skeleton, and every materialized lane ships

#### Scenario: A corp's fog decorates system tiers
- **WHEN** an authenticated, spawned corp with fog-derived tiers for a subset
  of systems calls `GET /v1/galaxy`
- **THEN** systems present in the corp's tier map report that tier
- **AND** systems absent from the tier map report `starVisible`

#### Scenario: Lanes are filtered to the corp's charted set
- **WHEN** an authenticated, spawned corp with an empty charted-lane set
  calls `GET /v1/galaxy`
- **THEN** every materialized system still ships (nodes are the free star
  map)
- **AND** no lanes ship, even lanes between two systems the corp has
  explored (lane visibility is a per-lane record written by travel or scan,
  never derived from system tier)

#### Scenario: An authenticated corpless requester receives the unfogged galaxy
- **WHEN** `GET /v1/galaxy` is called by an authenticated account that has
  not yet spawned a corporation (no corp id resolves for the requester),
  with fog wired
- **THEN** every materialized system reports tier `starVisible` and every
  materialized lane ships — the tier and charted-lane filters are bypassed
  entirely because there is no corp id to key them on

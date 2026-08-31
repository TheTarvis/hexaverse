## MODIFIED Requirements

### Requirement: Lazy, Idempotent Block Materialization
The system SHALL persist the galaxy as the materialized subset of the
deterministic star field, growing it in **blocks** — fixed
`BlockSize × BlockSize` cell tiles, the materialization atom — under an
atomic create-if-absent anchor per block: when a trigger (jump arrival at a
system past the currently materialized frontier, the spawn walk, or initial
seeding) touches an unmaterialized block, the system SHALL compute that
block's systems and lanes from the field and persist them in one
transaction keyed on the block's anchor, exactly once. The transaction
SHALL read, inside the same transaction, the anchors of every block that
can share a lane with the materializing block — its eight neighbors (the
ordinary-lane horizon) plus every block within `BridgeSearchHorizon` blocks
along the four cardinal axes (bridge far-endpoints, which skip empty
blocks and may lie beyond the eight) — and SHALL write every lane, ordinary
or bridge, whose far endpoint's block is already materialized, so lanes
between any two lane-sharing blocks exist as soon as both blocks do —
regardless of concurrency or order. A system's **full lane horizon** — the
set materialization triggers ensure — is its block's 3×3 window plus the
far-endpoint block of every bridge lane incident to that system (computable
from the pure field alone). System ids SHALL be the system's field cell
coordinates, and lane ids SHALL derive from the unordered pair of endpoint
system ids, so a lane materialized from either side is the same document.
Seeding starts the materialized set at the origin block. Materialization
SHALL be invisible to players: a materialized-on-demand system is
indistinguishable from one persisted at initial seeding, and newly
materialized systems enter every requester's star layer (the field is
public astronomy). Plain reads (`GET /v1/galaxy`, `GetLiveSystem`) SHALL
NOT themselves create system or lane documents.

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
- **WHEN** a jump arrival past the currently materialized frontier, or a
  corporation's spawn walk, causes systems to materialize
- **THEN** those systems appear in the star layer served to every
  requester, including corporations that have never visited them (a
  deliberate decision — the star layer is unfogged; only activity
  location leaks, no actor identity, lanes, or knowledge tiers)

#### Scenario: A jump arrival at the frontier materializes the destination's full lane horizon before its gate set is built
- **WHEN** a fleet's jump resolves into a destination system at the edge
  of the galaxy's currently materialized region
- **THEN** the destination system's full lane horizon is materialized
  before that system's body table — and therefore its gate set — is first
  built for the arrival, so the arriving fleet is never shown fewer gates
  than truly exist

### Requirement: Galaxy Graph Read Endpoint
The system SHALL serve `GET /v1/galaxy` returning the live galaxy's id,
seed, the bounds of the currently materialized extent, every materialized
system (id, coords, name, region, skeleton, and the requester's knowledge
tier), every lane the requester has charted (each carrying its `bridge`
marker), and the current world time. The star layer (system nodes,
coordinates, region, skeleton) SHALL be served for every materialized
system regardless of knowledge; only per-requester tier and lane visibility
are knowledge-filtered — and only once a corp id is resolved for the
requester: the charted-lane and tier filters key on `corporationId`, so an
authenticated requester with no resolved corp id (not yet spawned) receives
the same unfiltered output as when no knowledge dependency is configured at
all. The reported bounds SHALL be maintained monotonically by block
materialization so they always contain every materialized system.

#### Scenario: No live galaxy
- **WHEN** `GET /v1/galaxy` is called and no galaxy has been seeded
- **THEN** the response is `404 Not Found`

#### Scenario: The response grows as the world materializes
- **WHEN** `GET /v1/galaxy` is called, then new blocks materialize (e.g.
  via a fleet's jump arrival past the currently materialized frontier),
  then it is called again
- **THEN** the second response contains the newly materialized systems and
  the first response's systems unchanged

#### Scenario: Bounds track the materialized extent
- **WHEN** a block outside the currently reported bounds materializes
- **THEN** the next `GET /v1/galaxy` reports bounds containing that block's
  systems

#### Scenario: Every system ships with a default tier when fog is not wired
- **WHEN** `GET /v1/galaxy` is served without a knowledge dependency
  configured
- **THEN** every materialized system in the response has tier
  `starVisible` and its full skeleton, and every materialized lane ships

#### Scenario: A corp's fog decorates system tiers
- **WHEN** an authenticated, spawned corp with knowledge-derived tiers for
  a subset of systems calls `GET /v1/galaxy`
- **THEN** systems present in the corp's tier map report that tier
- **AND** systems absent from the tier map report `starVisible`

#### Scenario: Lanes are filtered to the corp's charted set
- **WHEN** an authenticated, spawned corp with an empty charted-lane set
  calls `GET /v1/galaxy`
- **THEN** every materialized system still ships (nodes are the free star
  map)
- **AND** no lanes ship, even lanes between two systems the corp has
  explored (lane visibility is a per-lane record written by travel or by
  attaching to a gate, never derived from system tier)

#### Scenario: An authenticated corpless requester receives the unfogged galaxy
- **WHEN** `GET /v1/galaxy` is called by an authenticated account that has
  not yet spawned a corporation (no corp id resolves for the requester),
  with knowledge wired
- **THEN** every materialized system reports tier `starVisible` and every
  materialized lane ships — the tier and charted-lane filters are bypassed
  entirely because there is no corp id to key them on

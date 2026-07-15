# Galaxy Generation Specification

## Purpose
Generates and serves the galactic graph — the top tier of Hexaverse's
hex-grid galaxy: a deterministic, procedurally generated set of star systems
(nodes) and travel lanes (edges) with noise-driven regional character and a
per-system major-body skeleton. Generation happens once per "live" galaxy
(via `cmd/seed` or the local dev auto-seed, never at request time); the
`GET /v1/galaxy` read serves the persisted graph, decorated per-requester
with fog-of-war knowledge.

## Requirements

### Requirement: Deterministic Graph Generation
The system SHALL generate a galaxy as a pure, deterministic function of a
seed and a `GenerationParams` value: the same (seed, params) pair SHALL
always produce identical systems, lanes, and bounds.

#### Scenario: Same seed reproduces the galaxy
- **WHEN** `Generate` is called twice with the same seed and params
- **THEN** the returned systems, lanes, and bounds are deep-equal between the
  two runs

#### Scenario: Different seeds diverge
- **WHEN** `Generate` is called with two different seeds and the same params
- **THEN** the returned system sets are not identical

### Requirement: Region-Classified, Poisson-Spaced System Placement
The system SHALL place systems by rejection sampling within a flattened disk
(broad X/Y, thin Z), classify each candidate's region from 3D fractal simplex
noise (star-rich, normal, dead, or barrier, with barrier the thin
zero-crossing band around `BarrierBand`), and reject any candidate closer to
an existing system than the larger of the two systems' region-specific
minimum gaps.

#### Scenario: Minimum spacing is respected
- **WHEN** a galaxy is generated with a given `GenerationParams.MinGapByRegion`
- **THEN** every pair of placed systems is at least as far apart as the
  smallest configured region gap

#### Scenario: Star-rich regions pack denser than dead regions
- **WHEN** a galaxy is generated with the default params (tight star-rich
  gap, sparse dead gap)
- **THEN** the generated system count in star-rich regions is not lower than
  the count in dead regions

#### Scenario: Barrier regions are the sparsest
- **WHEN** a galaxy is generated with the default params
- **THEN** the barrier region's system count does not exceed any other
  region's count

#### Scenario: Placement terminates without reaching the target count
- **WHEN** Poisson-disc rejection prevents placing `TargetCount` systems
  within `TargetCount * MaxAttemptsPerNode` attempts (or `TargetCount * 40`
  attempts if that product is smaller than `TargetCount`)
- **THEN** generation returns whatever systems were successfully placed,
  without error, rather than looping indefinitely or failing

### Requirement: Connected Lane Graph
The system SHALL derive lanes as the relative-neighbourhood graph over the
placed systems (an edge (a,b) is kept only if no third system lies closer to
both a and b than a and b are to each other), which is guaranteed to contain
the Euclidean minimum spanning tree and therefore leaves every system
reachable from every other system.

#### Scenario: Every system is reachable
- **WHEN** a galaxy is generated
- **THEN** a breadth-first traversal of the lane graph starting from any one
  system reaches every other generated system

#### Scenario: Lanes reference real, distinct systems
- **WHEN** a galaxy is generated
- **THEN** every lane's two endpoint ids resolve to systems that exist in the
  same galaxy
- **AND** no lane connects a system to itself

### Requirement: Per-System Body Skeleton
The system SHALL roll a deterministic major-body skeleton (star class,
1..N bodies at distinct orbital ring indices in `[0, MaxRings)`) for every
system from a per-system seed derived via `SystemSeed(gallaxySeed, systemId)`
(FNV-1a hash of the galaxy seed followed by the system id), independent of
the system's region. Inner rings SHALL bias toward rocky/molten bodies and
outer rings toward gas-giant/ice bodies. Rocky, ice, barren, and molten
bodies SHALL be marked mineable; gas giants and oceanic bodies SHALL not.

#### Scenario: Skeleton is reproducible from the per-system seed
- **WHEN** a system's skeleton is re-rolled directly from
  `SystemSeed(galaxySeed, systemId)` and the same params
- **THEN** the result is identical to the skeleton stored on that system
  during galaxy generation

#### Scenario: Rings are distinct and ascending
- **WHEN** a system's skeleton is generated
- **THEN** its bodies' ring indices are strictly ascending with no repeats

#### Scenario: Every system has a star class and at least one body
- **WHEN** a galaxy is generated with `MinBodies >= 1`
- **THEN** every system has a non-empty star class and at least one body

### Requirement: Deterministic System Naming
The system SHALL derive a pronounceable system name from the galaxy seed and
the system's index, such that the same (seed, index) always yields the same
name.

#### Scenario: Same seed and index reproduce the name
- **WHEN** a system name is derived twice for the same seed and index
- **THEN** the two names are identical

### Requirement: Live Galaxy Persistence and Pointer
The system SHALL persist a generated galaxy's metadata, systems, and lanes
under a fresh generated id and then atomically repoint a single "live"
pointer document at that id, leaving any previously live galaxy's data
intact and independently readable at its own id.

#### Scenario: Regeneration does not corrupt the prior galaxy
- **WHEN** `Generate` is called a second time with a new seed
- **THEN** the new galaxy is persisted under a new id
- **AND** the live pointer now resolves to the new galaxy
- **AND** the previous galaxy's metadata is still readable, unchanged, at
  its own id

#### Scenario: No live galaxy yet
- **WHEN** `GetLive` (or `LiveGalaxyMeta`, or `GetLiveSystem`) is called
  before any galaxy has been generated
- **THEN** the call fails with `ErrNoLiveGalaxy`

#### Scenario: Requested system not found in the live galaxy
- **WHEN** `GetLiveSystem` is called with a system id absent from the live
  galaxy
- **THEN** the call fails with `ErrSystemNotFound`

### Requirement: Idempotent Local/Emulator Dev Seeding
The system SHALL, when triggered on local/emulator boot, generate and set
live a small default galaxy only if no live galaxy already exists, leaving
an existing live galaxy untouched on repeated boots.

#### Scenario: First boot seeds a galaxy
- **WHEN** the dev seed routine runs and no live galaxy exists
- **THEN** a galaxy is generated from the fixed dev seed and start-area
  params and set live

#### Scenario: Later boots are a no-op
- **WHEN** the dev seed routine runs and a live galaxy already exists
- **THEN** no new galaxy is generated and the existing live pointer is
  unchanged

### Requirement: Galaxy Graph Read Endpoint
The system SHALL serve `GET /v1/galaxy` returning the live galaxy's id,
seed, bounds, every system (id, coords, name, region, skeleton, and the
requester's fog tier), every lane the requester has charted, and the current
world time. The star layer (system nodes, coordinates, region, skeleton)
SHALL be served for every system regardless of fog; only per-requester tier
and lane visibility are fog-filtered — and only once a corp id is resolved
for the requester: the charted-lane and tier filters key on `corporationId`,
so an authenticated requester with no resolved corp id (not yet spawned)
receives the same unfiltered output as when no fog dependency is configured
at all (see the scenario below).

#### Scenario: No live galaxy
- **WHEN** `GET /v1/galaxy` is called and no galaxy has been generated
- **THEN** the response is `404 Not Found`

#### Scenario: Every system ships with a default tier when fog is not wired
- **WHEN** `GET /v1/galaxy` is served without a fog dependency configured
- **THEN** every system in the response has tier `starVisible` and its full
  skeleton, and every lane ships

#### Scenario: A corp's fog decorates system tiers
- **WHEN** an authenticated, spawned corp with fog-derived tiers for a
  subset of systems calls `GET /v1/galaxy`
- **THEN** systems present in the corp's tier map report that tier
- **AND** systems absent from the tier map report `starVisible`

#### Scenario: Lanes are filtered to the corp's charted set
- **WHEN** an authenticated, spawned corp with an empty charted-lane set
  calls `GET /v1/galaxy`
- **THEN** every system still ships (nodes are the free star map)
- **AND** no lanes ship, even lanes between two systems the corp has
  explored (lane visibility is a per-lane record written by travel or scan,
  never derived from system tier)

#### Scenario: An authenticated corpless requester receives the unfogged galaxy
- **WHEN** `GET /v1/galaxy` is called by an authenticated account that has
  not yet spawned a corporation (no corp id resolves for the requester),
  with fog wired
- **THEN** every system reports tier `starVisible` and every lane ships —
  the tier and charted-lane filters are bypassed entirely because there is
  no corp id to key them on, so the response is identical to the no-fog-
  configured case above

## Notes for future maintainers

- `Generate` has no HTTP write endpoint. The only ways a live galaxy comes
  to exist are `cmd/seed` (`go run ./cmd/seed`, ops-triggered) and the local
  dev auto-seed gated to `config.IsLocal()`.
- `cmd/seed start-area` renders a frozen mini-galaxy (fixed seed
  `StartAreaSeed`, every system pre-marked `explored`, no lane filtering) to
  `frontend/public/galaxy/start-area.json` as a static build-time asset for
  logged-out visitors; it is not part of this capability's runtime request
  path (see `galaxy-view`).

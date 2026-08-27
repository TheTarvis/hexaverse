# Observation Fog and Scan Specification

## Purpose
Owns per-Corporation fog of war: the monotonic knowledge ladder over the
galactic graph, the live sensor coverage (passive ambient bubbles plus a
running scan's growing echo disc) every board read projects through, and
the reveal writers (scan resolution, path-swept ambient-on-move, travel
arrival) that mint what a corporation remembers. Fog reveals and remembers;
it never spoils. This is the fog-filter service every fogged read
(`galaxy-generation`, `system-interior`, `fleet-movement`) calls — never a
client-side hide.

## Requirements

### Requirement: Monotonic Graph-Tier Knowledge Ladder
The system SHALL record each corporation's graph-tier knowledge of a system
as one of four tiers — `starVisible` (the free baseline, never stored),
`rumored`, `surveyed` (reserved; no code path in this capability writes
it), `explored` — and SHALL never lower a stored tier: any write takes the
maximum of the stored and incoming tier.

#### Scenario: A system with no stored observation is star-visible
- **WHEN** a corporation's tier for a system with no stored observation is
  queried
- **THEN** it reports `starVisible`

#### Scenario: A lower-tier write never downgrades a higher stored tier
- **WHEN** a system already has a stored `explored` observation for a
  corporation and a `rumored` write is applied for the same system
- **THEN** the stored tier remains `explored`

#### Scenario: A higher-tier write upgrades the stored tier
- **WHEN** a system has a stored `rumored` observation for a corporation
  and an `explored` write is applied for the same system
- **THEN** the stored tier becomes `explored`

### Requirement: Ambient Sensor Coverage From Own Units
The system SHALL compute a corporation's live sensor coverage in a system
as the union of a disc around every one of its own fleets currently on
that system's board (regardless of movement mode — coasting or burning),
bounded by the configured ambient radius measured in lattice hops (the
board's Lattice Hop Distance metric, not a fixed per-ring cell count),
filtered by line of sight against the system's occluding features (star
and major bodies) at the query's world time. Each occluding feature blocks
sight within its own pinned occlusion radius, and the star's pinned radius
is materially larger than a planet's — so a chord passing near the core is
shadowed across a wider span than one passing near an ordinary planet, and
a cell on the far side of the core from a fleet can be excluded from that
fleet's coverage even though no single feature occupies a cell directly on
the line between them.

#### Scenario: A fleet's bubble covers cells within its radius
- **WHEN** coverage is computed for a corporation with one fleet on a
  system's board
- **THEN** every cell within the configured ambient radius (in lattice
  hops) of that fleet's position, with clear line of sight, is covered

#### Scenario: Occluded cells are excluded from ambient coverage
- **WHEN** a cell lies within a fleet's ambient radius but behind an
  occluding feature relative to the fleet
- **THEN** that cell is not covered

#### Scenario: The star's occlusion shadow reaches across the core
- **WHEN** a fleet's ambient coverage is computed and a candidate cell lies
  on the opposite side of the core star from the fleet, along a chord that
  passes within the star's pinned occlusion radius of the core
- **THEN** that cell is not covered, even though the star occupies only the
  single core cell and no feature sits directly on the chord between the
  fleet and the candidate cell

#### Scenario: The same radius value covers different cell counts across ring bands
- **WHEN** ambient coverage is computed for two fleets at the same
  configured ambient radius, sitting on ring bands whose configured slot
  counts differ
- **THEN** each fleet's disc contains every cell within that many lattice
  hops of its own position
- **AND** the two discs' total cell counts may differ, because the
  schedule's angular slot width is not uniform across ring bands

### Requirement: Running Scan Echo Disc
The system SHALL, for a fleet with a running scan on the queried system,
add an additional coverage disc centred on the scan's pinned emission cell
(the fleet's board position at the scan's commit instant, carried in the
action's frozen params), with a radius — measured in lattice hops from the
emission cell — that grows linearly from 0 to the board radius over the
scan's duration (`radius = BoardRadius * elapsed/duration`), clamped to the
board radius once elapsed reaches duration, and filtered by line of sight
the same as ambient coverage (including each occluder's own pinned
occlusion radius). A scan committed before the emission cell was recorded
(legacy), and a scan whose recorded origin parameter is present but does
not decode as a valid cell, SHALL both fall back to the fleet's current
live cell, with the two cases distinguishable in what is recorded. A scan
in a different system's scope, or one no longer running, SHALL contribute
no disc.

#### Scenario: The echo front grows with elapsed scan time
- **WHEN** coverage is computed partway through a running scan
- **THEN** cells within the front's current reach (board radius times
  elapsed-over-duration, in lattice hops) from the emission cell are
  covered, and cells just beyond that reach are not

#### Scenario: The front stays pinned to the emission cell, not the moving fleet
- **WHEN** a scanning fleet moves away from the cell it fired from while the
  scan is still running
- **THEN** the echo front's coverage is measured from the original emission
  cell, not the fleet's current position

#### Scenario: A legacy scan with no recorded origin falls back to the live cell
- **WHEN** coverage is computed for a running scan whose params carry no
  emission cell
- **THEN** the echo front is centred on the fleet's current live position
- **AND** the fallback is recorded with cause `origin-absent`,
  distinguishing it from the present-but-unusable cases

#### Scenario: A scan elsewhere or already resolved contributes no echo
- **WHEN** coverage is computed for a system that is not the scope of the
  fleet's running scan, or the scan's status is no longer `running`
- **THEN** no echo disc is added for that scan

#### Scenario: A present but undecodable origin falls back distinguishably
- **WHEN** a scan action's stored origin parameter is present but does not
  decode as a valid cell, or decodes to a cell whose ring exceeds the live
  schedule's maximum ring
- **THEN** the scan's recorded outcome text names the cause, one of
  `undecodable-shape` or `ring-out-of-range` — the same cause vocabulary
  `fleet-movement`'s "Board Coordinates Outside the Live Schedule Are
  Rejected, Never Panicked" uses — and a structured log entry carries
  that `cause`, `ring` when the cause is `ring-out-of-range`, and
  `actionType` plus the action id
- **AND** the scan still resolves using the fleet's live position rather
  than failing outright

### Requirement: Scan Resolution Mints the Reveal
The system SHALL, when a scan action resolves and the fleet is still in the
scan's origin system (the fizzle test gates materialization), first ensure
the scanned system's full lane horizon — the 3×3 window of blocks centered
on the scanned system's block, plus the far-endpoint block of every bridge
lane incident to the scanned system — is materialized from the
deterministic star field (create-if-absent; a no-op when already
persisted), then evaluate the sweep at the action's frozen effect time:
mint a board-tier feature observation (geometry always; scanned
composition/threat detail) for every feature in the origin system with
clear line of sight from the pinned emission cell (occluders, and each
occluder's own pinned occlusion radius, evaluated at the effect time),
chart every lane incident to the scanned system as `scanned`, and rumor
each such lane's far-endpoint system to at least `rumored` (never
downgrading, never granting `surveyed`, and never granting any graph tier
to the scanned system itself from a scan). A scan SHALL never report a
false dead end: the lanes it charts are the system's true incident lanes in
the field, whether or not they were persisted before the scan resolved.

#### Scenario: A scan at the materialized frontier discovers onward roads
- **WHEN** a scan resolves on a system whose onward field neighbors are not
  yet materialized
- **THEN** those neighbors and the incident lanes are materialized and then
  charted and rumored exactly as if they had been persisted all along

#### Scenario: A scan on a system near a block corner charts its cross-corner lanes
- **WHEN** a scan resolves on a system near its block's corner, with an
  incident lane whose far endpoint lies in a diagonally adjacent block
- **THEN** that diagonal block is within the materialized horizon and the
  cross-corner lane is charted with its far endpoint persisted and rumored
  (never a lane to a nonexistent node)

#### Scenario: A scan on a bridge endpoint charts the bridge, far side included
- **WHEN** a scan resolves on a system with an incident bridge lane whose
  far endpoint lies beyond the 3×3 block window (skipping empty blocks)
- **THEN** the bridge's far-endpoint block is materialized as part of the
  ensured horizon and the bridge is charted with its far endpoint persisted
  and rumored, exactly like an ordinary lane

#### Scenario: Only line-of-sight-clear features are minted
- **WHEN** a scan resolves
- **THEN** every feature with clear line of sight from the emission cell at
  the effect time is minted with its geometry and composition, and features
  in shadow are not minted

#### Scenario: Every incident lane is charted regardless of occlusion
- **WHEN** a scan resolves on a system with lanes
- **THEN** every lane incident to that system is charted `via: scanned`,
  and lanes whose far endpoint is below `rumored` are upgraded to
  `rumored` — lane detection is never occluded by line of sight

#### Scenario: A scan grants no graph tier to its own system
- **WHEN** a scan resolves
- **THEN** the scanned system's own graph tier for the requester is
  unchanged by the scan (only feature/lane records are minted)

#### Scenario: A scan fizzles if the fleet left the origin system
- **WHEN** a scan resolves and the fleet's system id at resolve time no
  longer matches the system the scan was fired from
- **THEN** the resolve records an interrupted outcome and mints nothing —
  and materializes nothing

#### Scenario: A scan resolved late still mints as of its frozen ETA
- **WHEN** a scan resolves well after its ETA has passed
- **THEN** the minted observations are stamped `asOf` the scan's ETA and
  reflect feature/occluder positions computed at that ETA, not at the
  actual (later) resolve instant

### Requirement: Path-Swept Ambient Reveal on Move Resolution
The system SHALL, when a burn resolves, mint presence-only memory
(geometry and `asOf` only — never composition or threat) for every feature
whose position at the resolve instant fell within the ambient sensor
radius of some cell on the burn's path, with clear line of sight from that
swept cell, without overwriting any previously scanned composition/threat
already stored for that feature.

#### Scenario: A feature swept by the ambient bubble along the path is remembered
- **WHEN** a burn resolves and a feature's position lies within the
  ambient radius of some cell the burn passed through, with clear line of
  sight
- **THEN** a presence-only observation (geometry, no composition) is
  recorded for that feature

#### Scenario: Ambient reveal never overwrites scanned composition
- **WHEN** a feature already has scanned composition/threat detail stored
  from an earlier scan, and it is subsequently re-swept by an ambient pass
- **THEN** the stored composition/threat detail is preserved (the ambient
  write merges, never replaces the whole record)

#### Scenario: Ambient reveal work is bounded for a burn resolution
- **WHEN** a burn resolution computes the path-swept ambient reveal for a
  forty-cell burn path against fifteen features, on the production
  schedule at the configured board radius
- **THEN** the reveal materializes at most one bounded-radius cell set per
  distinct path cell (at most forty), and performs no unbounded
  shortest-path search per (path cell, feature) pair
- **AND** the count of materialized cell sets is asserted as a
  deterministic integer, not an elapsed-time threshold, so the assertion
  holds identically on every build target

### Requirement: Travel Arrival Reveal
The system SHALL, when a lane-transit trip resolves, mark the destination
system `explored` and chart the lanes actually crossed on the trip as
`via: traveled` — and SHALL NOT chart or rumor any onward lane from the
destination (finding further roads is a scan's job, not arrival's).

#### Scenario: Arrival explores the destination and charts crossed lanes only
- **WHEN** a lane-transit trip resolves into a destination system
- **THEN** the destination's graph tier for the traveling corporation
  becomes (at least) `explored`, and only the lanes the trip actually
  crossed are charted — no other lane incident to the destination is
  charted or rumored by this reveal

### Requirement: Spawn Arrival Reveal
The system SHALL provide a non-action reveal write (`RevealArrival`) that
marks a corporation's home system `explored` and charts no lanes, used by
spawn (waking up counts as arriving), idempotent under a repeated call.

#### Scenario: Spawn arrival explores home with no lanes charted
- **WHEN** a corporation's spawn arrival reveal is written for its home
  system
- **THEN** the home system's tier becomes `explored` and no lane is
  charted

### Requirement: Fleet Audience Visibility
The system SHALL report a fleet visible to a requester if it belongs to the
requester's own corporation (always, unconditionally), or if it lies inside
the requester's live sensor coverage (ambient bubbles plus any running echo
disc) in its current system.

#### Scenario: A requester's own fleet is always visible
- **WHEN** fleet visibility is checked for a fleet owned by the requesting
  corporation
- **THEN** it is reported visible regardless of sensor coverage

#### Scenario: A foreign fleet outside coverage is not visible
- **WHEN** fleet visibility is checked for a fleet owned by another
  corporation, sitting outside the requester's live sensor coverage in its
  system
- **THEN** it is reported not visible

### Requirement: Charted-Lane Set Projection
The system SHALL expose, for a corporation, the set of lane ids it has
charted (via travel or scan) — the presence of a charted-lane record IS
"charted"; there is no derived incidence rule based on system tier.

#### Scenario: An explored system with no charted lane grants none
- **WHEN** a corporation has a system at tier `explored` but has never
  traveled or scanned it (e.g. a dev-seeded starting position)
- **THEN** its charted-lane set contains none of that system's incident
  lanes

## Notes for future maintainers

- `surveyed` is reserved for a future market/purchased-intel feature — no
  writer in this capability ever mints it; a spec or code change that adds
  a `surveyed` writer belongs to a future change, not a reading of current
  behavior.
- The `observation.DaoImpl.UpsertFeatureObservation` direct-write path
  (used by `MintScan` and tests, not the production resolve path) performs
  a full `Set`, not a field merge — unlike the production scan/ambient
  resolve writes, which apply via `MergeAll` inside the action resolve
  transaction and so can layer ambient presence onto existing scanned
  detail without clobbering it. A caller of the direct DAO path could
  therefore overwrite a feature's previously scanned `Detail` with a
  presence-only write. **Suspected defect** (or at least a latent
  footgun) — see the report.

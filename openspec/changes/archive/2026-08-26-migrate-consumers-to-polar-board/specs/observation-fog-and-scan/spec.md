## MODIFIED Requirements

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
The system SHALL, when a scan action resolves, evaluate the sweep at the
action's frozen effect time: mint a board-tier feature observation
(geometry always; scanned composition/threat detail) for every feature in
the origin system with clear line of sight from the pinned emission cell
(occluders, and each occluder's own pinned occlusion radius, evaluated at
the effect time), chart every lane incident to the scanned system as
`scanned`, and rumor each such lane's far-endpoint system to at least
`rumored` (never downgrading, never granting `surveyed`, and never granting
any graph tier to the scanned system itself from a scan).

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
- **THEN** the resolve records an interrupted outcome and mints nothing

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

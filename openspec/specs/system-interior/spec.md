# System Interior Specification

## Purpose
Materializes and serves a single star system's tactical hex board: the
detail layer (belts, moons, hazards, anomalies, resource richness) that
extends the free galaxy-tier skeleton (`galaxy-generation`) into a full
per-system interior, generated lazily on first read and then persisted, fog
of war applied per requester.

## Requirements

### Requirement: Lazy, Deterministic Interior Generation
The system SHALL generate a system's interior deterministically from the
per-system seed (`galaxy.SystemSeed(gallaxySeed, systemId)`), the system's
graph-tier region (as its character dial), and its galaxy-tier skeleton: a
fixed star feature at the centre, one orbiting feature per skeleton body
(extending, never contradicting, the skeleton), and additional detail
(extra small bodies, belts, moons on gas giants, anomalies/ruins, hazards)
whose counts and resource richness are dialed by the region's character.

#### Scenario: First read materializes the interior
- **WHEN** `GetOrCreateInterior` is called for a system with no stored
  interior
- **THEN** a new interior is generated from that system's seed, region, and
  skeleton and persisted
- **AND** the returned interior includes a star feature and one orbiting
  feature per skeleton body

#### Scenario: Subsequent reads return the stored interior unchanged
- **WHEN** `GetOrCreateInterior` is called for a system whose interior is
  already stored
- **THEN** the stored interior and features are returned without
  regenerating

#### Scenario: A denser character produces more detail
- **WHEN** interiors are generated for a `star_rich` system and a `dead`
  system from the same generator
- **THEN** the `star_rich` interior's extra-planet, belt, special, and
  hazard counts are configured higher than the `dead` interior's (per
  `DefaultParams().ByCharacter`)

#### Scenario: System not found
- **WHEN** `GetOrCreateInterior` is called with a system id absent from the
  live galaxy
- **THEN** the call fails with `ErrNotFound`

### Requirement: Coherent Orbital Direction
The system SHALL roll one dominant orbital direction per system from the
per-system seed (so both directions occur across the galaxy's systems) and
SHALL assign it to every disk-born orbiting feature — skeleton-derived
bodies, belts, and hazards. Capture-plausible detail features (extra small
bodies, anomalies, ruins) SHALL each orbit retrograde (against the dominant
direction) with the tuned `RetrogradeChance` probability and prograde
otherwise, so a retrograde body reads as a rare captured object rather than
generator noise.

#### Scenario: Disk-born features share the dominant direction
- **WHEN** an interior is generated
- **THEN** every skeleton-derived body, belt, and hazard has the same
  orbital direction

#### Scenario: The dominant direction varies across systems
- **WHEN** interiors are generated across many system seeds
- **THEN** both orbital directions occur as the dominant direction

#### Scenario: Zero retrograde chance yields a fully prograde system
- **WHEN** an interior is generated with `RetrogradeChance` 0
- **THEN** every orbiting feature shares the system's dominant direction

#### Scenario: Certain retrograde chance inverts every capture-plausible feature
- **WHEN** an interior is generated with `RetrogradeChance` 1
- **THEN** every extra small body, anomaly, and ruin orbits against the
  dominant direction, while skeleton bodies, belts, and hazards still orbit
  in it

### Requirement: Concurrent First-Explore Resolves to One Interior
The system SHALL claim interior materialization with an atomic
create-if-absent write, so that two concurrent first requests for the same
system's interior converge on a single persisted interior rather than
double-writing.

#### Scenario: Losing a materialization race reads the winner's copy
- **WHEN** two concurrent calls to `GetOrCreateInterior` for the same
  unmaterialized system race, and one's create write loses (the interior
  already exists)
- **THEN** the losing caller reads and returns the already-persisted
  interior instead of erroring or overwriting it

### Requirement: Orbital Period Read from Live Tuning
The system SHALL NOT persist a feature's orbital period; every read SHALL
fill it from the live tuning function `PeriodFor(ring)` at read time, so
retuning orbit pacing changes the pace of every already-materialized system
on its next read, while the generator's random ring, start angle, and
direction stay fixed at generation time.

#### Scenario: A retune changes an existing feature's period on next read
- **WHEN** a feature's interior was generated under one orbital-period
  tuning and the tuning is subsequently changed
- **THEN** the next read of that feature reflects the new period, with its
  stored ring, angle0, and direction unchanged

### Requirement: Lane Gate Projection
The system SHALL compute, for a given system and board radius, one lane
gate per lane touching that system: the tile on the outer rim where the
lane departs toward its neighbour, bearing-projected from the two systems'
galaxy coordinates via the same projection the fleet domain uses to compute
a departure gate, so the rendered gate and the tile a fleet actually departs
from are the same hex. Gates SHALL be returned in a deterministic order
(sorted by destination system id).

#### Scenario: Every incident lane produces one gate
- **WHEN** lane gates are computed for a system touched by N lanes
- **THEN** exactly N gates are returned, each naming the correct neighbour
  system id

#### Scenario: Unknown system
- **WHEN** lane gates are requested for a system id not present in the live
  galaxy
- **THEN** the call fails with `ErrNotFound`

### Requirement: Interior Read Endpoint
The system SHALL serve `GET /v1/systems/:systemId`, resolving any due
actions scoped to that system first (so a scan or move that completed
between polls is reflected in this response), then returning the system's
radius, character, star class, fog-projected features, charted lane gates,
and current world time.

#### Scenario: Unknown or ungenerated system
- **WHEN** `GET /v1/systems/:systemId` is called for a system id absent
  from the live galaxy
- **THEN** the response is `404 Not Found`

#### Scenario: No live galaxy
- **WHEN** `GET /v1/systems/:systemId` is called and no galaxy has been
  generated
- **THEN** the response is `404 Not Found`

#### Scenario: Read with no fog wired serves everything live
- **WHEN** `GET /v1/systems/:systemId` is served without a fog dependency
  configured
- **THEN** every feature ships with band `visible`, `live: true`, and its
  full resources/effects, and every lane gate ships regardless of charted
  state

#### Scenario: An authenticated corpless requester receives the unfogged interior
- **WHEN** `GET /v1/systems/:systemId` is called by an authenticated account
  that has not yet spawned a corporation (no corp id resolves for the
  requester), with fog wired
- **THEN** every feature ships with band `visible`, `live: true`, and its
  full resources/effects, and every lane gate ships regardless of charted
  state — the fog and charted-lane-gate filters are bypassed entirely
  because there is no corp id to key them on, so the response is identical
  to the no-fog-configured case above

### Requirement: Three-Band Fog Projection of Features
The system SHALL project each feature into exactly one of three bands for
an authenticated, spawned requester: `visible` (the requester's live sensor
coverage currently covers the feature's world-time position — geometry and
scanned composition both ship, stamped live), `remembered` (the requester
has a stored observation of the feature but does not currently cover it —
geometry ships computed live, composition/threat freeze at the
observation's `asOf` timestamp), or `astronomical` (an uncovered,
unremembered star or major skeleton body — geometry and type ship, no
resources or effects). A detail feature (belt, moon, hazard, anomaly, ruin)
that is neither visible nor remembered SHALL be omitted entirely.
Composition/threat data SHALL only ever come from a scanned observation's
stored detail, never from ambient presence alone.

#### Scenario: A feature inside live sensor coverage is visible
- **WHEN** a requester's sensor coverage currently covers a feature's
  computed position
- **THEN** that feature ships with band `visible`, `live: true`, and its
  resources/effects taken from the requester's scanned observation of it
  (if any)

#### Scenario: A remembered feature outside current coverage freezes its detail
- **WHEN** a requester has a stored observation of a feature but no longer
  covers its position
- **THEN** that feature ships with band `remembered`, `live: false`, its
  geometry computed at the current world time, and its resources/effects
  frozen from the observation's stored detail, stamped with that
  observation's `asOf`

#### Scenario: An uncovered, unremembered major body still shows as astronomical
- **WHEN** a requester has neither live coverage nor a stored observation
  of the star or a skeleton-derived major body
- **THEN** that feature ships with band `astronomical`, geometry and type
  only, no resources or effects

#### Scenario: An uncovered, unremembered detail feature is omitted
- **WHEN** a requester has neither live coverage nor a stored observation
  of a belt, moon, hazard, anomaly, or ruin
- **THEN** that feature does not appear in the response at all

#### Scenario: Presence without a scan never leaks composition
- **WHEN** a requester has ambient presence-only memory of a feature (no
  scanned `Detail`)
- **THEN** that feature's resources and effects are omitted even though its
  geometry ships

### Requirement: Charted Lane Gate Filtering
The system SHALL, for an authenticated, spawned requester (one for whom a
corp id resolves), include a lane gate only if the requester's graph-tier
knowledge of the gate's destination system is at least `rumored`. This
filter is bypassed entirely for an authenticated but corpless requester —
see the Interior Read Endpoint requirement's corpless scenario.

#### Scenario: An uncharted neighbour's gate is hidden
- **WHEN** a requester has no tier (or below `rumored`) for a lane's
  destination system
- **THEN** that lane's gate is omitted from the response

#### Scenario: A rumored or better neighbour's gate ships
- **WHEN** a requester's tier for a lane's destination system is `rumored`
  or higher
- **THEN** that lane's gate is included in the response

## Notes for future maintainers

- `system.Features` implements `observation.InteriorSource`: the star and
  every skeleton-derived body (`feat-star`, `feat-body-N`) occlude line of
  sight (`FeatureStar`, `FeatureRocky`, `FeatureGasGiant`, `FeatureIce`);
  belts, moons, hazards, anomalies, and ruins do not. This underlies scan
  resolution in `observation-fog-and-scan`, not this capability directly.

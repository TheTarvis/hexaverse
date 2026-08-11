## MODIFIED Requirements

### Requirement: Lazy, Deterministic Interior Generation
The system SHALL generate a system's interior deterministically from the
per-system seed (`galaxy.SystemSeed(gallaxySeed, systemId)`), the system's
graph-tier region (as its character dial), and its galaxy-tier skeleton: a
fixed star feature at the centre, one orbiting feature per skeleton body
(extending, never contradicting, the skeleton), and additional detail
(extra small bodies, belts, moons on gas giants, anomalies/ruins, hazards)
whose counts and resource richness are dialed by the region's character. A
system's trading station, when one exists, is NOT part of this
deterministic generation: it is provisioned independently by the
`trading-station` capability (as a spawn asset-healing step, not interior
materialization), so this requirement's determinism and create-if-absent
guarantees make no claim about a station's presence, position, or timing —
a system may materialize its interior with no station, gain one later at
spawn, or (for a non-home system) never carry one.

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
stored detail, never from ambient presence alone. This three-band rule
governs `system.Feature` entries produced by this capability's interior
generator only; a system's trading station is not one of these entries and
is never subject to this band assignment or its detail-feature omission
clause — its inclusion in a board read is governed entirely by
`trading-station`'s own graph-tier visibility rule (see "Home Station
Visible On First Board Read, No Scan Required"), independent of sensor
coverage or stored feature memory.

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

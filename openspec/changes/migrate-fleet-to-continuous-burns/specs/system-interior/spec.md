## REMOVED Requirements

### Requirement: Interior Read Endpoint

**Reason**: Superseded by "Interior Read Endpoint Serves Unfogged Features"
— this requirement mandates a fog-projected response in which every feature
ships with band `visible`, `live: true` (its "Read with no fog wired serves
everything live" and "An authenticated corpless requester receives the
unfogged interior" scenarios say so outright), but this change's "Interior
Reads Are Fully Disclosed, A Deliberate Interim" requirement computes no
band assignment for any requester (design.md Decision 11). A field the
successor never computes cannot be mandated on every feature.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Three-Band Fog Projection of Features

**Reason**: Superseded by "Interior Reads Are Fully Disclosed, A Deliberate
Interim" — this requirement's `visible` band read `observation`'s live
sensor coverage and its `remembered` band read the per-feature memory the
scan mint wrote; this change deletes `observation`'s live sensor-coverage
computation and its ambient/scan reveal writers outright (design.md
Decision 11). With no coverage source and no memory writer, there is no
version of this requirement's three bands that is true after this change.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: Interior Read Endpoint Serves Unfogged Features

The system SHALL serve `GET /v1/systems/:systemId`, returning the system's
radius, character, star class, features, charted lane gates, and current
world time.

#### Scenario: Unknown or ungenerated system

- **WHEN** `GET /v1/systems/:systemId` is called for a system id absent
  from the live galaxy
- **THEN** the response is `404 Not Found`

#### Scenario: No live galaxy

- **WHEN** `GET /v1/systems/:systemId` is called and no galaxy has been
  generated
- **THEN** the response is `404 Not Found`

### Requirement: Interior Reads Are Fully Disclosed, A Deliberate Interim

Following the removal of `observation`'s live sensor-coverage computation and
its per-feature memory writers (design.md Decision 11), the system SHALL
serve every feature of a materialized system's interior in full — geometry,
composition, and threat detail — to every authenticated requester,
regardless of corporation, sensor coverage, or scan history, computing no
band assignment and omitting no feature on that basis. This is a stated,
temporary interim behavior, not a design goal: link 5 replaces it with a
`disclosure`-projected read once `disclosure.Disclose` is wired into this
endpoint (design.md Decision 19, a Non-Goal of this change).

#### Scenario: An authenticated, spawned requester receives every feature in full

- **WHEN** an authenticated, spawned requester reads a materialized system's
  interior
- **THEN** every feature ships with its full geometry, composition, and
  threat detail, regardless of the requester's sensor coverage or scan
  history

#### Scenario: No feature is omitted for lack of a stored observation

- **WHEN** a feature has never been observed, scanned, or remembered by the
  requester
- **THEN** it still ships in full rather than being omitted or reduced to
  astronomical-only detail

#### Scenario: The interim applies uniformly, corpless or not

- **WHEN** the interior read is served to any authenticated requester,
  whether spawned or corpless
- **THEN** the same full-detail response is served, with no per-requester
  band distinction computed

## ADDED Requirements

### Requirement: A Station's Continuous Orbit Is Derived, Never Rolled
A station's continuous orbit SHALL be a pure function of its system id, the
live galaxy's seed, that system's skeleton body count, and its chosen
parent's `galaxy.BodyType` — every one of them a galaxy-tier value, no
store read of the materialized interior, no volatile input, and no clock
dependency — so a healed re-derivation lands on the exact same continuous
orbit every time, whether or not that system's interior has ever been
materialized. The station's continuous parent SHALL be one of its system's
generated skeleton major bodies, chosen deterministically from the system
id and galaxy seed.

The station's local radius SHALL NOT depend on its parent's actual drawn
size (a galaxy-tier skeleton body carries no size at all — size is a
per-feature interior draw). Instead it SHALL be a **type-keyed ceiling**:
`MaxFeatureSize(featureTypeForBody(parentType)) + space.InsertionStandoff`
(evaluated at that same ceiling) `+ StationStandoff`, where
`featureTypeForBody` is the pure galaxy-tier-to-feature-type mapping and
`MaxFeatureSize` is the pinned, exported per-type size ceiling table defined
by `system-interior`'s "Feature Size Is Drawn From a Per-Type Band With a
Pinned, Exported Ceiling" requirement. Because the ceiling is an upper bound on
whatever size the parent's interior draw eventually produces, the station
is guaranteed to clear its parent's actual body and its parent's insertion
shell regardless of that draw's outcome. Its continuous period SHALL
follow the already-shipped `space.InsertionPeriod` law at that local
radius; and its inclination SHALL express the same prograde/retrograde
convention as its system's dominant orbital direction (per
`system-interior`'s "Coherent Orbital Direction"), taken from
`DominantOrbitDirection`, never rolled independently and never read from a
lattice `Dir` (the station carries none). Where a system's skeleton has no
bodies, the station SHALL fall back to a star-parented continuous orbit at
the configured constant `StationFallbackRadius`, which SHALL be strictly
greater than `space.StarClearanceRadius` evaluated at the star-size table's
largest configured entry and strictly less than the interior's `Extent`. The
station's continuous parent chain (station → parent body → star) SHALL
resolve within `space`'s bounded resolution depth.

#### Scenario: A healed re-derivation lands on the identical continuous orbit
- **WHEN** a station's continuous orbit is re-derived for the same system id,
  galaxy seed, and skeleton body count (e.g. during a healed partial spawn)
- **THEN** the resulting parent, local radius, period, phase, inclination,
  and node are identical to the originally derived ones

#### Scenario: The continuous parent is a generated skeleton body, not the star
- **WHEN** a station's continuous orbit is derived for a system whose
  skeleton has at least one body
- **THEN** the station's continuous parent id names one of that system's
  generated skeleton bodies, not the star

#### Scenario: The station's inclination matches its system's dominant convention
- **WHEN** a station's continuous orbit is derived for two systems whose
  dominant orbital directions differ
- **THEN** each station's inclination expresses the same prograde or
  retrograde convention (near-zero or past the quarter turn) as its own
  system's skeleton bodies share, independently of the other system's
  convention

#### Scenario: An empty skeleton falls back to a star-parented orbit
- **WHEN** a station's continuous orbit is derived for a system whose
  skeleton has no bodies
- **THEN** the station's continuous parent is the star, at the configured
  `StationFallbackRadius`

#### Scenario: The fallback radius clears the star's clearance shell and stays inside the interior's extent
- **WHEN** the configured `StationFallbackRadius` is inspected
- **THEN** it is strictly greater than `space.StarClearanceRadius` evaluated
  at the star-size table's largest configured entry, and strictly less than
  the interior's `Extent`

#### Scenario: The derivation reads no store and no clock
- **WHEN** a station's continuous orbit is derived before that system's
  interior has ever been materialized
- **THEN** the derivation still succeeds, using only the system id, the
  galaxy seed, the system's skeleton body count, and the chosen parent's
  `galaxy.BodyType`

#### Scenario: The derived local radius is identical whether or not the interior has ever been materialized
- **WHEN** a station's continuous local radius is derived for a system
  before its interior has ever been materialized, and again after that
  same interior has been generated and persisted
- **THEN** both derivations produce the identical local radius, since
  neither reads the materialized interior's actual per-feature size draw

#### Scenario: The continuous parent chain resolves within the depth bound
- **WHEN** a station's continuous position is resolved through
  `space.Position`
- **THEN** resolution succeeds with no error, the chain (station → parent
  body → star) being well within the resolver's bounded recursion depth

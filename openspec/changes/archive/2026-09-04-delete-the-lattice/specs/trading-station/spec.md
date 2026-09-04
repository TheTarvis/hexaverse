## ADDED Requirements

### Requirement: Station Is a Dockable, Non-Mineable Body
A system's station SHALL appear in that system's body set as a dockable
target a burn order may target and a fleet may dock to; a mine command
naming the station SHALL be rejected. Dock resolution for the station SHALL
run through the same body-attachment check every other dock target uses — a
burn order settling into a park at the station's position sets the fleet's
stored `attachedTo` to the station's id (per `fleet-movement`'s "Every Body
In the System's Body Table Is a Valid Attachment Host"). A fleet merely
parked near or coincident with the station's continuous position, without a
matching `attachedTo`, is NOT docked to it; position coincidence SHALL NOT
be read as attachment by any code path.

#### Scenario: A burn order to the station resolves to docked
- **WHEN** a fleet is ordered to burn to the station's feature id
- **THEN** the fleet's state becomes `docked` to the station

#### Scenario: A docked fleet rides the station's live orbital position
- **WHEN** a fleet's effective state is `docked` to a station
- **THEN** its resolved position is the station's live continuous orbital
  position at the current world time, resolved through
  `space.StatePosition` via the fleet's attached host — the same path
  `fleet-movement`'s "Effective Position Resolution" resolves any docked
  fleet's position through

#### Scenario: A mine command against the station is rejected
- **WHEN** a mine command names the station's feature id as its target
- **THEN** the command is rejected with a distinguishing reason, and no
  action is created

#### Scenario: Position coincidence without attachment is not docking
- **WHEN** a fleet is parked at a position coincident with the station's
  live continuous position but its stored `attachedTo` does not name the
  station
- **THEN** it is not docked to the station, and every dock-gated verb
  (sell, refuel, jump) rejects it exactly as it would for a fleet parked
  anywhere else

## MODIFIED Requirements

### Requirement: Station-Store Read Failure Degrades, Never Blocks the Interior Read
A failure reading the station store while projecting a system's interior
SHALL result in that system's interior being served with the station
omitted from its features, rather than failing the entire interior read.
The interior read has no market dependency today, and this splice SHALL
NOT introduce one. A fleet already `docked` to a station SHALL resolve its
position by recomputing the station's deterministic continuous orbit from the system
id, the live galaxy seed and the system's skeleton directly (per "A
Station's Continuous Orbit Is Derived, Never Rolled") rather than by
re-reading the station store, so an
already-docked fleet's position resolution never depends on station-store
availability — only a fresh dock order or a fresh interior read does.

#### Scenario: A station-store outage still serves the rest of the interior
- **WHEN** the station store is unavailable while a system's interior is
  being read
- **THEN** the interior read still succeeds, omitting only the station from
  the projected features, and no other feature or interior data is affected

#### Scenario: An already-docked fleet's position resolves despite a station-store outage
- **WHEN** the station store is unavailable while a fleet already `docked`
  to a station has its position resolved
- **THEN** the fleet's position still resolves correctly, computed from the
  station's deterministic orbit, without a station-store read

### Requirement: Home Station Visible On the Direct Station Read, No Scan Required
The system SHALL include a system's station in a **direct** station read
(`GET /v1/systems/:systemId/station`) whenever the requester's graph-tier
knowledge of that system is at least a configured minimum visibility tier
(`market.Params.MinVisibilityTier`, defaulted to `rumored` — the same tier
`market-price-board` gates on), independent of sensor coverage or any
scan. This gate applies to the direct station-read endpoint alone: the
system-interior/board read (`GET /v1/systems/:systemId`) serves a system's
station unconditionally to every authenticated requester, per
`system-interior`'s "Bodies Are Public; Ships Are Disclosed" — a station is
a body spliced into that interior, not a second disclosure surface with
its own tier rule. Since spawn always sets a corporation's home system to
at least `explored`, a freshly spawned corporation sees its home station on
the very first direct station read regardless of where its rim-ring hull
was placed.

#### Scenario: A freshly spawned corporation's first direct station read shows its home station
- **WHEN** a freshly spawned corporation reads its home system's station
  directly for the first time, having performed no scan
- **THEN** the home station appears in the response

#### Scenario: A system at exactly the configured minimum tier includes its station on a direct read
- **WHEN** a requester's graph tier for a station-bearing system is exactly
  the configured minimum visibility tier
- **THEN** a direct station read for that system includes the station

#### Scenario: The board read serves the station regardless of tier
- **WHEN** a requester's graph tier for a station-bearing system is below
  the configured minimum visibility tier (e.g., merely `starVisible`)
- **THEN** the system-interior read for that system still includes the
  station in full, because body disclosure on that read is unconditional
  and computes no tier gate

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
`DominantOrbitDirection`, never rolled independently. Where a system's
skeleton has no
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

### Requirement: Station Id Is the Home System's Id; Feature Id Is System-Scoped and Separate
A station's identity for every cross-capability purpose — the
`market-price-board` and `goods-sale` "venue" key, and the direct
`GET /v1/systems/:systemId/station` read — SHALL be its home system's own
id (per "Exactly One NPC Station Per Spawn Home System," at most one
station exists per system, so the system id is already a unique station
identifier with nothing new to invent). This is distinct from the
station's **feature id** (used only to target it in a burn order or
resolve it within one system's `interior.Features`), which follows the
same system-scoped, non-globally-unique convention every other feature id
does (`mine-extraction`'s "feature ids... are not unique across the
galaxy") and SHALL NEVER be used as a venue or station identifier outside
its own system.

#### Scenario: A station's venue key is its system id
- **WHEN** any capability (price board, sale settlement, direct station
  read) resolves a station's venue identity
- **THEN** that identity is the station's home system's id — no separate,
  independently-generated station id exists

#### Scenario: A feature id is never treated as a cross-system identifier
- **WHEN** a station's feature id is used to target it within a burn
  order or resolve it in its own system's interior
- **THEN** that same feature id string carries no meaning outside that one
  system, and no capability resolves a venue or station by feature id alone

## REMOVED Requirements

### Requirement: Deterministic, Non-Core, Off-Gate-Ring, Prograde, Orbiting Placement
**Reason**: This requirement governs the station's *lattice* orbit
(`stations.DeriveOrbit` — a ring/slot draw against a board schedule). The
lattice is deleted by this change, so the derivation it governs no longer
exists. Every obligation it carried is already carried, on the surviving
continuous representation, by "A Station's Continuous Orbit Is Derived,
Never Rolled": determinism and re-derivability ("A healed re-derivation
lands on the identical continuous orbit"), never-the-core ("The continuous
parent is a generated skeleton body, not the star", plus the star-clearance
fallback scenarios), and prograde-with-the-disk ("The station's inclination
matches its system's dominant convention"). The off-the-gate-ring clause has
no continuous successor because it has no continuous meaning: a lane gate is
an ordinary body at a derived bearing, not a ring, so there is no ring for a
station to collide with.
**Migration**: None. `stations.DeriveOrbit`, `system.Orbit`, and the station
document's `orbit` field are deleted outright; no interior or station document
is rewritten and no compatibility path is kept (solo toy, no live users). That
`orbit` field is **served as well as stored** — `GET /v1/systems/:systemId/
station` returns the station document as-is — so its deletion is a wire
removal, and it takes the client's mirror of the same shape with it. No
successor field is added to that endpoint: the station's continuous position
reaches a client on the interior read, as the station body's continuous
element set (`system-interior`'s "Interior Read Serves Continuous Bodies"),
which is where every other body's position is already read from. The
continuous orbit itself is never persisted at all — it is re-derived per read
per "A Station's Continuous Orbit Is Derived, Never Rolled". The
open defect `docs/defects/2026-08-26-station-on-gate-ring.md` — a station
derivable onto the real lane-gate ring — is dissolved rather than fixed, and
this change closes it as such.

### Requirement: Station Is a Dockable, Non-Mineable Board Feature
**Reason**: Superseded by "Station Is a Dockable, Non-Mineable Body" above,
which is the same requirement with its lattice half removed. Restructured as
REMOVED + ADDED rather than MODIFIED because one of its scenarios ("Docking
to the station involves no lattice predicate") asserts the absence of a
lattice predicate, which is unfailable once no lattice package exists to
compute one — the archiver refuses a MODIFIED block that omits a live
scenario, so dropping it requires this shape.
**Migration**: None. Three of its four scenarios survive verbatim in the
ADDED requirement; the dropped one is replaced by "Position coincidence
without attachment is not docking", which states the same guarantee in a
form that can still fail.

### Requirement: A Station Orbit Outside the Live Board Radius Is Omitted, Never Panicked
**Reason**: A guard on the lattice-only failure mode where a stored station
orbit's ring exceeds the live board schedule's maximum, which would panic
`board.Canon`/`sched.Slots`. With `system.Orbit`, `board.Schedule` and the
schedule's `MaxRing` all deleted, the failure mode does not exist. The
station's continuous orbit is bounded by construction ("A Station's
Continuous Orbit Is Derived, Never Rolled": the fallback radius clears the
star's clearance shell and stays inside the interior's extent), and a
station whose continuous element set fails to decode is already omitted
rather than fatal by `system-interior`'s "A Spliced Body Is Complete or
Omitted, and Its Incompleteness Is Loud".
**Migration**: None. `stations.ErrStationRingOutOfRange` and the ring check
in `stations.FeatureOf` are deleted. This retirement is what resolves the
tether `build-production-space-view`'s design.md recorded by name — a
station that could still vanish from a system for a lattice reason with
nothing on the wire to hint at it.

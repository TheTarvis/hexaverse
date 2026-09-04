# Trading Station Specification

## Purpose

Provision an NPC-owned trading station as a spawn-home asset — exactly one
per home system, idempotently, at a deterministic, non-core, off-gate-ring,
orbiting position prograde with the system's dominant orbital direction. The
station is a dockable, non-mineable body visible on the very first system
read (no scan required), gated below that by a configured minimum
graph tier rather than sensor coverage. It splices into the system-interior
read at the service seam and degrades to "no station" rather than failing
the interior read; its owner field ships NPC-empty so player ownership is a
later value change, never a retrofit.
## Requirements
### Requirement: Owner Field, NPC By Default, Never Player-Mintable In This Version
Every station SHALL carry an `ownerCorpId` field, empty/unset denoting NPC
ownership. The one station-provisioning entry point this version exposes
(the spawn asset-healing step) SHALL accept no `ownerCorpId` argument and
SHALL always provision a station with an empty `ownerCorpId`. (That no
*other* operation in this version can mint a station at all — there is
exactly one provisioning entry point — is a stated design constraint, not
independently retested here: see design.md's Decisions, which name every
station-provisioning call site this change introduces.)

#### Scenario: A freshly provisioned station is NPC-owned
- **WHEN** a station is provisioned for a spawn home system
- **THEN** its `ownerCorpId` is empty

#### Scenario: The provisioning entry point accepts no owner argument
- **WHEN** the spawn-healing station-provisioning step is invoked
- **THEN** it accepts no `ownerCorpId` input of any kind — the resulting
  station's `ownerCorpId` is always empty in this version

### Requirement: Exactly One NPC Station Per Spawn Home System, Idempotently
The system SHALL ensure exactly one NPC-owned station exists in a
corporation's home system, provisioned as part of spawn asset healing (see
`corporation-spawn`'s "Spawn Asset Healing"), idempotently under: a fresh
spawn, a repeated spawn call, a healed partial spawn (the hull already
exists but the station write never completed), and a second corporation
later spawning into the same system.

#### Scenario: A fresh spawn provisions one station
- **WHEN** a corporation spawns into a home system with no existing station
- **THEN** exactly one station is provisioned for that system

#### Scenario: A repeat spawn call does not provision a second station
- **WHEN** spawn asset healing runs again for a corporation whose home
  system already carries a station
- **THEN** no second station is provisioned

#### Scenario: A healed partial spawn completes the station without a second hull
- **WHEN** spawn asset healing runs for a corporation whose hull exists but
  whose home system's station write never completed
- **THEN** the station is provisioned, and no second hull is seeded

#### Scenario: Two corporations sharing a home system converge on one station
- **WHEN** two different corporations each spawn with the same system as
  their home
- **THEN** both healing passes converge on the same single station for that
  system, never one station each

### Requirement: Stations Exist Only At Spawn Homes
The system SHALL provision a station only as a spawn home's asset; no other
mechanism — by region, graph position, or system tier — SHALL place a
station.

#### Scenario: A non-home system carries no station
- **WHEN** a system that is nobody's spawn home is read for its station
- **THEN** no station is reported for that system

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

### Requirement: Station Existence Hidden Below the Visibility Gate
A direct station read for a system whose requester tier is below the
configured minimum visibility tier SHALL respond as not found, hiding
existence — matching the fog convention already established for foreign
fleets and mine targets.

#### Scenario: A below-gate station read is not found
- **WHEN** a direct station read is requested for a system at
  `starVisible` (below the configured minimum tier)
- **THEN** the response is `404 Not Found`

#### Scenario: A station read for an unknown system is not found
- **WHEN** a direct station read names a system id absent from the live
  galaxy
- **THEN** the response is `404 Not Found`

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


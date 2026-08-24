## ADDED Requirements

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

### Requirement: Deterministic, Non-Core, Off-Gate-Ring, Prograde, Orbiting Placement
A station's board position SHALL be derived deterministically from its
system id and the live galaxy's seed, and no other volatile input: its
orbital ring, initial angle, period, and direction SHALL be generated
identically on every derivation (including a healed re-placement), SHALL
never place it at the core, and SHALL never place its orbit on that
system's lane-gate ring. Its direction SHALL NOT be rolled independently:
it SHALL equal the system's dominant orbital direction — the direction
every disk-born feature of that system's interior shares
(`system-interior`'s "Coherent Orbital Direction") — computed as a pure
function of the per-system seed, never by reading the materialized
interior or the station store. The station SHALL orbit — it is not a
fixed, non-moving feature — riding the same `board.OrbState` resolution
any other orbiting feature uses, so a docked fleet's position and any
burn-intercept solve against it use the existing orbiting-feature code
path with no new intercept case (see design.md Decision 4; this reverses
an earlier "fixed, not orbiting" draft of this requirement).

#### Scenario: A healed re-derivation lands on the same orbit
- **WHEN** a station's position is re-derived for the same system id (e.g.,
  during a healed partial spawn)
- **THEN** the resulting orbital ring, initial angle, period, and direction
  are identical to the originally provisioned ones

#### Scenario: The position is never the core
- **WHEN** a station's position is derived for any system id
- **THEN** its orbit is never centered on or degenerate to `(0,0)`

#### Scenario: The orbit never lies on the lane-gate ring
- **WHEN** a station's position is derived for any system id
- **THEN** its orbital ring never coincides with that system's configured
  lane-gate ring

#### Scenario: The station orbits prograde with its system's disk
- **WHEN** a station's orbit is derived for any system
- **THEN** its direction equals that system's dominant orbital direction —
  the same direction the interior's skeleton bodies, belts, and hazards
  share

### Requirement: Station Is a Dockable, Non-Mineable Board Feature
A system's station SHALL appear in that system's board feature set as a
dockable target a burn order may target and a fleet may dock to; a mine
command naming the station SHALL be rejected.

#### Scenario: A burn order to the station resolves to docked
- **WHEN** a fleet is ordered to burn to the station's feature id
- **THEN** the fleet's state becomes `docked` to the station

#### Scenario: A docked fleet rides the station's live orbital position
- **WHEN** a fleet's effective state is `docked` to a station
- **THEN** its resolved position is the station's live orbital position at
  the current world time, via the same `board.OrbState` resolution any
  other orbiting feature uses

#### Scenario: A mine command against the station is rejected
- **WHEN** a mine command names the station's feature id as its target
- **THEN** the command is rejected with a distinguishing reason, and no
  action is created

### Requirement: Station-Store Read Failure Degrades, Never Blocks the Interior Read
A failure reading the station store while projecting a system's interior
SHALL result in that system's interior being served with the station
omitted from its features, rather than failing the entire interior read.
The interior read has no market dependency today, and this splice SHALL
NOT introduce one. A fleet already `docked` to a station SHALL resolve its
position by recomputing the station's deterministic orbit from the system
id and live galaxy seed directly (per "Deterministic, Non-Core,
Off-Gate-Ring, Prograde, Orbiting Placement") rather than by re-reading
the station store, so an
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

### Requirement: Station Excluded From the Fog/Scan Feature Source
The station SHALL be excluded from `observation.InteriorSource` (the
feature list `system.Service`'s fog source projects for line-of-sight and
scan-reveal purposes): it SHALL contribute no occluder geometry to a
scan's line-of-sight computation, and no scan resolution SHALL ever mint a
feature-level observation for it. A station's visibility is governed
entirely by its own graph-tier rule (see "Home Station Visible On First
Board Read, No Scan Required"), never by anything sensed or remembered.

#### Scenario: A scan never mints a station observation
- **WHEN** a scan resolves in a system carrying a station, with the
  station well within the scan's line-of-sight radius
- **THEN** no feature-level observation is minted for the station, and the
  scan's line-of-sight computation is unaffected by the station's presence

#### Scenario: A station never occludes a scan's line of sight
- **WHEN** a scan's line-of-sight computation is evaluated in a system
  carrying a station positioned between the scanning fleet and another
  feature
- **THEN** the station contributes no occlusion — line of sight is
  evaluated exactly as if the station were absent

### Requirement: Station Id Is the Home System's Id; Feature Id Is System-Scoped and Separate
A station's identity for every cross-capability purpose — the
`market-price-board` and `goods-sale` "venue" key, and the direct
`GET /v1/systems/:systemId/station` read — SHALL be its home system's own
id (per "Exactly One NPC Station Per Spawn Home System," at most one
station exists per system, so the system id is already a unique station
identifier with nothing new to invent). This is distinct from the
station's board **feature id** (used only to target it in a burn order or
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
- **WHEN** a station's board feature id is used to target it within a burn
  order or resolve it in its own system's interior
- **THEN** that same feature id string carries no meaning outside that one
  system, and no capability resolves a venue or station by feature id alone

### Requirement: Home Station Visible On First Board Read, No Scan Required
The system SHALL include a system's station in that system's board read
whenever the requester's graph-tier knowledge of that system is at least a
configured minimum visibility tier (`market.Params.MinVisibilityTier`,
defaulted to `rumored` — the same tier `market-price-board` gates on),
independent of sensor coverage or any scan. Since spawn always sets a
corporation's home system to at least `explored`, a freshly spawned
corporation sees its home station on the very first board read regardless
of where its rim-ring hull was placed.

#### Scenario: A freshly spawned corporation's first read shows its home station
- **WHEN** a freshly spawned corporation reads its home system's board for
  the first time, having performed no scan
- **THEN** the home station appears in the response

#### Scenario: A system at exactly the configured minimum tier includes its station
- **WHEN** a requester's graph tier for a station-bearing system is exactly
  the configured minimum visibility tier
- **THEN** that system's station is included in the board read

#### Scenario: A system below the configured minimum tier omits its station
- **WHEN** a requester's graph tier for a station-bearing system is below
  the configured minimum visibility tier (e.g., merely `starVisible`)
- **THEN** that system's station is omitted from the board read

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

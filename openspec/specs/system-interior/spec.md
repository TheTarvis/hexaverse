# System Interior Specification

## Purpose
Materializes and serves a single star system's interior in continuous space:
the detail layer (belts, moons, hazards, anomalies, resource richness) that
extends the free galaxy-tier skeleton (`galaxy-generation`) into a full
per-system body table — every body's continuous position, size, and orbital
elements, plus the system's own extent and its lane-gate bodies — generated
lazily on first read and then persisted. There is no lattice on this wire: no
ring, no slot, no cell, no footprint. Foreign presence in the served read is
disclosed per requester by `proximity-disclosure`, which owns that decision
entirely.
## Requirements
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

The system SHALL claim interior materialization with an atomic create-if-absent write, so that two concurrent first requests for the same system's interior converge on a single persisted interior rather than double-writing. A caller losing that race SHALL read the persisted winner and apply the same station projection and continuous-body validation/cascade as an ordinary successful read before returning it. This convergence SHALL preserve existing current-clock and access-filtered response behavior; it SHALL NOT expose additional contacts or omit a provisioned station merely because the create write lost. An unreadable winner SHALL remain an error rather than returning an incomplete success.

#### Scenario: Losing a materialization race reads the winner's copy
- **WHEN** two concurrent calls to GetOrCreateInterior for the same unmaterialized system race, and one's create write loses because the interior already exists
- **THEN** the losing caller reads and returns the already-persisted interior instead of erroring or overwriting it
- **AND** it applies the same station projection and continuous-body validation/cascade as the successful read path

#### Scenario: Concurrent bootstrap resolves the provisioned station
- **GIVEN** a home station has been provisioned and concurrent bootstrap reads race on interior materialization
- **WHEN** a losing caller returns the winner's interior to station-hosted fleet seeding
- **THEN** the station is present with its validated continuous orbit and can be resolved by the body table
- **AND** successful bootstrap responses remain HTTP 200 with exactly-once spawn assets rather than an unknown-body error

#### Scenario: Winner projection preserves failure and filtering rules
- **WHEN** a materialization-race loser reads a winner containing an invalid parent chain or cannot read the winner
- **THEN** the readable winner receives the existing continuous-body omission cascade, while an unreadable winner returns an error
- **AND** current-clock and audience filtering semantics remain those of the existing ordinary response path

### Requirement: Lane Gate Projection
The system SHALL compute, for a given system, exactly one lane gate per
lane touching that system, each naming its destination system id and that
crossing's lane id. Gates SHALL be returned in a deterministic order
(sorted by destination system id). A gate's continuous position and size
are the gate body's, resolved from the system's body table
(`system-body-table`: "Lane Gates Are Derived Fresh At Every Build, Never
Persisted" and "A Gate's Bearing Is Derived From the Galaxy Layout, Never
Runtime Trigonometry"); this requirement governs only the gate set's
completeness, identity, and order, and SHALL compute no position of its
own.

#### Scenario: Every incident lane produces one gate
- **WHEN** lane gates are computed for a system touched by N lanes
- **THEN** exactly N gates are returned, each naming the correct neighbour
  system id

#### Scenario: Unknown system
- **WHEN** lane gates are requested for a system id not present in the live
  galaxy
- **THEN** the call fails with `ErrNotFound`

### Requirement: Feature Size Is Drawn From a Per-Type Band With a Pinned, Exported Ceiling
The system SHALL draw every generated non-star feature's size from a band keyed on
its `FeatureType`, and SHALL expose that band's upper bound as
`MaxFeatureSize(FeatureType) float64` — a pure, total function over every
non-star `FeatureType` the generator emits, reading no interior state and no drawn value. A
drawn size SHALL NEVER exceed its own type's `MaxFeatureSize`, and every band's
lower bound SHALL be strictly positive. Configured bands: gas giant 3.4–4.2, ice
1.9–2.7, rocky 1.6–2.4, moon 0.5–1.0, anomaly/ruin 0.8–1.6, hazard 1.0–3.0; a belt
feature and the trading station SHALL each carry a configured constant size rather
than a draw. The star's size SHALL NOT be drawn: it SHALL come from a pinned table
over the star classes `galaxy.rollStarClass` produces, with a named default for an
unrecognized class, every entry of which satisfies the clearance invariant below.

#### Scenario: Every drawn size falls inside its own type's band
- **WHEN** an interior is generated across a swept seed set
- **THEN** every feature's size lies within the configured band for that feature's
  own `FeatureType`, and never exceeds `MaxFeatureSize` for that type

#### Scenario: MaxFeatureSize is total over every emitted feature type
- **WHEN** `MaxFeatureSize` is called for every non-star `FeatureType` the
  generator can emit
- **THEN** each call returns a strictly positive ceiling, with no type falling
  through to zero

#### Scenario: The star's size is a pure function of its class
- **WHEN** two interiors with the same star class are generated from different seeds
- **THEN** both stars carry the identical size, drawn from no RNG stream

### Requirement: A Body-Parented Child's Local Radius Clears Its Parent Within a Named Band
A body-parented feature that is not the trading station (i.e. a moon) SHALL
derive its local orbital radius as `parentSize + space.InsertionStandoff(parent)
+ MoonOrbitMin + u × (MoonOrbitMax − MoonOrbitMin)`, with `u ∈ [0,1)` drawn
from the continuous stream and `MoonOrbitMin`/`MoonOrbitMax` configured
constants (`MoonOrbitMin < MoonOrbitMax`). The first two terms SHALL place
the child strictly outside its parent body's own extent and strictly
outside the standoff shell a ship parking at that parent would occupy, so a
moon and a parked hull are never in the same place. The configured band
SHALL keep every such child's distance from the star strictly less than
`BaseOrbitRadius` beyond its parent's own radius, so a moon can never reach
an adjacent star-parented orbit and its distance from the star always stays
inside the interior's `Extent`. Its continuous period SHALL follow the
already-shipped `space.InsertionPeriod` law evaluated at that local radius.
Any future body-parented feature besides a moon or the station inherits
this same law unless a more specific one is defined for it.

#### Scenario: Every moon clears its parent's size and insertion standoff
- **WHEN** a moon's local orbital radius is derived
- **THEN** it exceeds its parent body's size plus
  `space.InsertionStandoff(parent)`, so the moon is never inside its
  parent's own body or its parent's insertion shell

#### Scenario: A moon's total distance from the star stays within the interior's extent
- **WHEN** a moon's continuous position is resolved at any world time
- **THEN** its distance from the star does not exceed the interior's stored
  `Extent`

#### Scenario: The moon-orbit band cannot reach the next star-parented orbit
- **WHEN** the moon-orbit band's ceiling is evaluated at the largest
  configured gas-giant size (the only body type moons ride)
- **THEN** the resulting maximum local radius
  (`maxGiantSize + space.InsertionStandoff(maxGiantSize) + MoonOrbitMax`) is
  strictly less than `BaseOrbitRadius`, the smallest possible star-parented
  orbital radius in any system

### Requirement: Generated Orbits Satisfy Their Cross-Capability and Internal Clearance Invariants
The system's orbital-radius law, star-size table, and belt-width law SHALL
be configured so that every generated system's geometry satisfies five
bounds, each asserted against the other capability's live constant — never
a copied literal — so that a future edit to either side breaks a failing
test rather than a silent assumption:

1. every system's innermost **star-parented** continuous orbital radius
   SHALL be strictly greater than `disclosure.PassiveRange`;
2. every system's outermost skeleton-body continuous orbital radius SHALL
   be strictly greater than `disclosure.PlumeFloor`, including in the
   degenerate single-body-at-ordinal-0 system, where the outermost equals
   the innermost;
3. `space.StarClearanceRadius` evaluated at the star-size table's largest
   configured entry SHALL be strictly less than `BaseOrbitRadius`, so no
   generated body can ever sit inside its own star's burn-clearance shell;
4. `1 + BeltWidthFraction/2` SHALL be strictly less than `RadiusGrowth`, so
   a belt's widest member can never reach the next orbital index's radius;
5. the galaxy's configured `MaxRings` minus one SHALL be less than or equal to
   `GenerationParams.Radius`, so that a skeleton major's raw ring can never
   exceed the orbital index `SystemInterior.Extent` is computed at, and
   `Extent` stays a genuine upper bound over every star-parented radius.

#### Scenario: The innermost star-parented radius exceeds the configured passive range
- **WHEN** any system's skeleton is generated
- **THEN** its innermost star-parented body's continuous orbital radius is
  strictly greater than the live value of `disclosure.PassiveRange`

#### Scenario: The outermost skeleton radius exceeds the configured plume floor, even in the degenerate one-body system
- **WHEN** a system's skeleton has exactly one body at raw ordinal 0
- **THEN** that body's continuous orbital radius — simultaneously the
  system's outermost and innermost skeleton radius — is strictly greater
  than the live value of `disclosure.PlumeFloor`

#### Scenario: No star size can place a body inside its own star's clearance shell
- **WHEN** the star-size table's largest configured entry is inspected
- **THEN** `space.StarClearanceRadius` evaluated at that size is strictly
  less than `BaseOrbitRadius`

#### Scenario: A belt's width jitter can never reach the next orbital index
- **WHEN** the belt-width law's configured fraction is inspected
- **THEN** `1 + BeltWidthFraction/2` is strictly less than `RadiusGrowth`

#### Scenario: No skeleton ring can exceed the index Extent is computed at
- **WHEN** the galaxy's configured `MaxRings` and the interior generator's
  configured `Radius` are compared against each other's live values
- **THEN** `MaxRings - 1` is less than or equal to `Radius`, so every skeleton
  major's continuous radius is at most `SystemInterior.Extent`

### Requirement: A Body-Parented Orbit's Continuous Period Follows a Named Law of Its Radius, Fixed at Generation Time
The system SHALL compute a feature's continuous period once, at generation
time, as a pure function of its continuous radius alone: a star-parented
feature's period SHALL follow the Kepler law
(`keplerSeconds(r) = KeplerBaseSeconds × (r/KeplerBaseRadius) × sqrt(r/KeplerBaseRadius)`,
quantized to milliseconds by ceiling and clamped to a minimum of 1 ms), and
a body-parented feature's (a moon, or any feature riding another body)
period SHALL follow the already-shipped `space.InsertionPeriod` law. The
computed period SHALL be monotonically non-decreasing in radius under each
law, SHALL be a strictly positive integer count of world-milliseconds, and
SHALL be identical every time the same radius is derived under the same
law. The computed period SHALL persist through the orbital-element codec
(`space.EncodeOrbit`/`space.DecodeOrbit`) and round-trip exactly. Changing
either law's constants SHALL affect only features generated after the
change; an already-persisted feature's stored period SHALL NOT change
except by regenerating the system that contains it.

#### Scenario: A star-parented period never decreases for a larger radius
- **WHEN** the Kepler period law is evaluated for two star-parented radii
  where the second is greater than or equal to the first
- **THEN** the second radius's derived period is greater than or equal to
  the first's

#### Scenario: A star-parented period strictly increases across one growth step
- **WHEN** the Kepler period law is evaluated for a star-parented radius `r`
  and for `r × RadiusGrowth`
- **THEN** the derived period for `r × RadiusGrowth` is strictly greater
  than the derived period for `r`

#### Scenario: A body-parented period follows the shipped insertion-period law
- **WHEN** a moon's continuous period is derived from its local radius
- **THEN** it equals `space.InsertionPeriod` evaluated at that same radius

#### Scenario: The same radius always derives the identical period
- **WHEN** the same continuous radius is derived under the same period law
  twice
- **THEN** both derivations produce the identical integer world-millisecond
  period

#### Scenario: A persisted period round-trips exactly through the codec
- **WHEN** a generated feature's continuous orbit is encoded and then
  decoded
- **THEN** the decoded period is bit-identical to the period computed at
  generation time

#### Scenario: Retuning the period law leaves already-persisted features unchanged
- **WHEN** a period law's constants are changed after a system has already
  been generated and persisted under the old constants
- **THEN** that system's already-persisted features keep their originally
  computed periods, changing only if that system is regenerated

### Requirement: A Generated Parent Chain Never Exceeds the Resolver's Depth Bound
The system SHALL generate parent chains (feature → parent → grandparent
→ …) that resolve within `space`'s bounded resolution depth, and SHALL
never generate a chain that cycles back to a feature already present
earlier in its own chain.

#### Scenario: A moon's position composes its parent's
- **WHEN** a generated moon's continuous position is resolved
- **THEN** it equals its parent planet's position plus the moon's own
  local orbital offset

#### Scenario: The deepest generated chain resolves with no error
- **WHEN** the deepest parent chain the generator produces for a system is
  resolved through `space.Position`
- **THEN** resolution succeeds with no error, within the resolver's bounded
  recursion depth

#### Scenario: No generated chain cycles
- **WHEN** every generated feature's continuous parent id is inspected
- **THEN** following each feature's chain of parent ids always terminates
  at the star, with no feature appearing twice in its own chain

### Requirement: A Belt's Members Are Discrete Mineable Bodies On a Shared Radius
A generated belt SHALL remain exactly one persisted feature, carrying one
continuous element set (its own base radius, period, and plane) and a
stored `Width`. `Width` SHALL be the **full radial thickness** of the
annulus, not a half-width: `Width = BeltWidthFraction × baseRadius`, and a
member's radius SHALL be `baseRadius + (u − 0.5) × Width` for its own
`u ∈ [0,1)`, so members span `baseRadius ± Width/2`. `Width` SHALL be
computed once at generation time and persisted on the belt feature, never
re-derived from the live `BeltWidthFraction` constant on read, so that a
later tuning edit to that constant does not retroactively move an
already-materialized belt's members.

The system SHALL express that belt's mineable population as a configured
number of discrete member bodies (`AsteroidsPerBelt`), derived
deterministically from the belt feature's id and never independently
rolled or persisted: each member's id SHALL be the belt feature's id
suffixed with `#` and its index in `[0, AsteroidsPerBelt)`; each member's
radius SHALL fall within the belt's stored width around its base radius as
defined above; each member's size SHALL be drawn — not constant — from the
same per-`(featureId, index)` derivation, over a configured strictly
positive range (`BeltMemberSizeMin` … `BeltMemberSizeMax`); and its phase
and inclination jitter SHALL likewise be derived from the belt feature's id
and its own index. Every member SHALL share the belt's own continuous
period, so the belt rotates as one rigid body. The `#` character SHALL be
reserved as the member-id separator: no generated interior feature id SHALL
contain it, so that a synthesized member id can never equal a feature id
and the owning feature of a member id is recoverable by splitting on the
first `#` with no lookup.

Each member SHALL inherit its parent belt feature's resource kinds
unchanged — a member draws no independent resource kind of its own, and any
consumer resolving a member's mineable resources SHALL treat them as
identical to the parent belt's own `resources` field. A belt SHALL remain
exactly one lode: a member draws from, and depletes, the same
richness-derived tonnage its parent belt feature does, never a tonnage
split or reserved for that member alone, so the belt's total available
tonnage for a kind is unaffected by how many of its members are ever named
as a mine target. The belt feature body itself SHALL remain a directly
mineable target: a mine commit naming a belt feature's own id SHALL be
accepted on the preconditions "Mine Commit Preconditions" defines for any
resource-bearing feature, with no belt-specific rejection.

#### Scenario: Belt members are reproducible from the belt's id
- **WHEN** a belt's member bodies are derived twice from the same belt
  feature id
- **THEN** every member's id, radius, phase, inclination, and size are
  identical between the two derivations

#### Scenario: Member ids follow the belt's id and a contiguous index
- **WHEN** a belt's member bodies are derived
- **THEN** there are exactly `AsteroidsPerBelt` of them, with ids
  `<beltFeatureId>#0` through `<beltFeatureId>#(AsteroidsPerBelt-1)`

#### Scenario: Every member's radius falls within the belt's full stored width
- **WHEN** a belt's member bodies are derived
- **THEN** every member's continuous radius lies within `Width/2` of the
  belt's base radius, where `Width` is the belt's stored full radial
  thickness

#### Scenario: Every member carries a strictly positive, independently drawn size
- **WHEN** a belt's member bodies are derived
- **THEN** each member's size is strictly positive, within the configured
  `BeltMemberSizeMin`…`BeltMemberSizeMax` range, and members of the same
  belt need not share a size

#### Scenario: The belt rotates as one rigid body
- **WHEN** two of a belt's member bodies are positioned at two different
  world times
- **THEN** the phase advance between the two times is identical for both
  members, evidencing a shared period and rigid rotation

#### Scenario: The belt's width is persisted, not re-derived from a retuned constant
- **WHEN** a belt's stored `Width` is read after `BeltWidthFraction` has
  been changed since that belt was generated
- **THEN** the belt's members still span its originally persisted `Width`,
  unaffected by the new constant, changing only if the system is
  regenerated

#### Scenario: No generated feature id contains the member separator
- **WHEN** any interior is generated
- **THEN** no feature's id contains a `#` character

#### Scenario: A member's mineable resource kinds match its parent belt exactly
- **WHEN** a mine commit resolves against a belt member id naming a kind its
  parent belt feature carries, and a second commit names a kind the parent
  does not carry
- **THEN** the first resolves the parent's richness for that kind and the
  second is rejected as an unknown kind — a member exposes its parent's
  resource kinds exactly, and no others

#### Scenario: A member's mining draws from and depletes the belt's one shared lode
- **WHEN** a fleet mines a resource kind through a belt member's id
- **THEN** the depletion is recorded against the parent belt feature's own
  ledger key, exactly as if the belt feature had been named directly, and
  every other member's and the belt feature's own remaining tonnage for
  that kind reflects the same depletion

#### Scenario: The belt feature remains mineable alongside its members
- **WHEN** a fleet docked to a belt feature commits a mine run naming that
  belt feature's own id and a kind it carries
- **THEN** the commit is accepted on the same preconditions any other
  resource-bearing feature's commit is, with no belt-specific rejection

### Requirement: An Interior Predating This Capability Fails Closed, Never Silently
The system SHALL treat a persisted interior whose stored extent is absent
or not strictly positive, or whose non-star feature carries no `SpaceDoc`
key at all (as distinct from one that is present but fails to decode), as
generated before this capability existed. Such an interior SHALL NOT be
completed with a zero-magnitude extent, a zero-radius gate, or an
additional parentless non-star body. A read or table build that
encounters a missing or non-positive extent SHALL fail by name. A
non-star feature carrying no `SpaceDoc` key SHALL be omitted and
recorded, exactly as a present-but-undecodable one is — "closed" here
means the feature is never reinterpreted as a legitimate parentless
body, not that the read fails.

#### Scenario: An interior with no stored extent fails rather than yielding a zero-radius gate
- **WHEN** a system's interior document has no stored extent, or a
  non-positive one
- **THEN** deriving that system's lane gates fails by name, and no gate is
  placed at or near radius zero

#### Scenario: A non-star feature with no orbital element set at all fails, never reads as parentless
- **WHEN** a non-star feature's document carries no `SpaceDoc` key
- **THEN** that feature is treated as a decode failure — omitted and logged
  with its id — and never surfaces as an additional parentless body

### Requirement: Interior Feature Decode Validates Its Orbital Element Set, Omitting Rather Than Failing
The system SHALL validate every decoded non-star feature's orbital element
set (`SpaceDoc`) at the interior read boundary, before any continuous
computation consumes it, omitting and recording any feature whose stored
`SpaceDoc` is present but fails to decode, rather than failing the read —
mirroring the existing ring-validation guard, so that one corrupted feature
never turns into a permanent failure of every corporation's read of that
system.

#### Scenario: A feature with a malformed orbital element set is omitted, not fatal
- **WHEN** an interior is read whose stored non-star feature's `SpaceDoc`
  fails to decode (a non-finite radius, or a missing key)
- **THEN** that feature is omitted from the read and the rejection is
  recorded with the offending feature id, no continuous computation is
  performed on that feature, and the remaining features are served
  normally

#### Scenario: The omission is recorded with the system and feature id
- **WHEN** a feature is omitted because its continuous orbital element set
  failed to decode
- **THEN** a record exists naming both the system id and the omitted
  feature's id

#### Scenario: A per-feature decode failure does not fail a BodyTable build
- **WHEN** a `BodyTable` is built for a system containing one feature with
  an undecodable continuous orbital element set
- **THEN** the build succeeds, omitting only that one feature, and is not
  treated as the interior-read failure that fails the whole build

### Requirement: A Feature Omission Cascades to a Fixpoint Through the Parent Chain
When a non-star feature is omitted from an interior read — whether by
*Interior Feature Decode Validates...*'s per-feature decode failure or by
*An Interior Predating This Capability Fails Closed*'s no-`SpaceDoc` case —
the system SHALL iterate the surviving non-star bodies — including the
spliced trading station, once present, as a candidate body naming its
continuous parent like any other — to a fixpoint, dropping any body whose
orbit names a parent id not present among the surviving bodies, or for
which `space.Position` over the surviving set returns an error (which
drops any cyclic, self-referencing, or over-deep stored chain), so that
omitting one feature never leaves a descendant permanently naming an
absent or unresolvable parent. Belt-member synthesis and lane-gate derivation SHALL run
only after this fixpoint is reached, so a belt whose feature was dropped by
the cascade mints no members. A station whose named parent body was dropped
by the cascade SHALL itself be omitted rather than left dangling. Each
cascaded omission SHALL be recorded with both its own feature id and the id
of the ancestor whose omission caused it, distinguishably from a feature
omitted by a direct decode failure.

#### Scenario: Omitting a gas giant also omits its moons
- **WHEN** a gas giant feature is omitted by a decode failure, and one or
  more moons name it as their orbital parent
- **THEN** every one of those moons is also omitted from the read, each
  recorded with both its own feature id and the gas giant's feature id

#### Scenario: Omitting a station's parent skeleton body also omits the station
- **WHEN** the skeleton major body a system's station is continuously
  parented to is omitted by a decode failure
- **THEN** the station is also omitted from that system's resolved bodies,
  recorded with both the station's own identity and the omitted parent's
  feature id

#### Scenario: A dropped belt feature mints no members
- **WHEN** a belt feature is omitted by a decode failure
- **THEN** no member bodies are synthesized for that belt in the resulting
  table

#### Scenario: A cyclic stored parent chain is dropped, not preserved
- **WHEN** an interior is read in which two decoded features name each other as
  continuous orbital parents, or one names itself
- **THEN** both are dropped by the cascade and recorded, and no body in the resulting
  read fails to resolve through `space.Position`

#### Scenario: Every surviving body in a read resolves through space.Position with no error
- **WHEN** an interior read completes, including one that cascaded one or
  more omissions
- **THEN** every remaining body's continuous orbit names a parent present
  among the remaining bodies, so that following any body's parent chain
  resolves through `space.Position` with no error, for every generated seed

### Requirement: Interior Generation Reproduces Across Build Targets
Given the same per-system seed, region, and galaxy-tier skeleton, the
interior generator SHALL produce identical persisted interior data —
including every float-valued field, notably each feature's
`Resource.Richness` — on every Go build target the backend is built for,
regardless of differences in floating-point multiply-add contraction
behavior between those targets (`arm64`, which contracts, and
`amd64`/`GOAMD64=v1`, which does not). This requirement covers the interior
generator's own arithmetic given a skeleton; it makes no claim about the
skeleton or the galaxy-tier region character the interior generator
consumes as input, which are produced upstream by `galaxy-generation` and
are not pinned by this requirement.

#### Scenario: The same seed produces the same interior on both targets
- **WHEN** an interior is generated from the same seed, region, and skeleton
  by the generator compiled for `arm64` and, separately, for
  `amd64`/`GOAMD64=v1`
- **THEN** every generated feature's fields are identical between the two
  runs, including every `Resource.Richness` value

#### Scenario: The compiled generator emits zero fused multiply-add instructions
- **WHEN** `backend/system` is compiled for `arm64` and its compiled output
  is inspected for fused multiply-add instructions
- **THEN** no fused multiply-add instruction appears anywhere in the
  compiled package's output
- **AND** `backend/system` carries no entry in the capability's deviation register

### Requirement: Bodies Are Public; Ships Are Disclosed
The system SHALL serve every body of a materialized system's interior —
geometry, composition, threat detail, and (for a lane-gate body) its
destination system id — in full to every authenticated requester,
regardless of corporation, computing no per-requester band assignment and
omitting no body on the grounds of sensor coverage, scan history, or
charted knowledge. This is the permanent rule, not an interim: the star
field is already public astronomy at the galaxy tier
(`galaxy-generation`), and a system's bodies are its detail layer at the
same public altitude. Foreign ship presence is a wholly separate question,
governed entirely by `proximity-disclosure` and never by this requirement:
a body's own disclosure is unconditional and identical whether or not a
ship is masked at it, exactly as `proximity-disclosure`'s own masking
requirement demands of a host.

#### Scenario: An authenticated, spawned requester receives every body in full
- **WHEN** an authenticated, spawned requester reads a materialized
  system's interior
- **THEN** every body ships with its full geometry, composition, and
  threat detail, regardless of the requester's sensor coverage, scan
  history, or charted knowledge

#### Scenario: No body is omitted for lack of stored knowledge
- **WHEN** a body has never been visited, scanned, or otherwise recorded
  by the requester
- **THEN** it still ships in full rather than being omitted or reduced to
  astronomical-only detail

#### Scenario: The rule applies uniformly, corpless or not
- **WHEN** the interior read is served to any authenticated requester,
  whether spawned or corpless
- **THEN** the same full-body-detail response is served, with no
  per-requester band distinction computed over bodies

#### Scenario: A masked ship at a body changes nothing about that body's own disclosure
- **GIVEN** a foreign ship masked (docked) at a body in the system
- **WHEN** the interior read is served
- **THEN** the body's own fields are identical to what they would be if
  nothing were masked at it — the ship's masked state is a fact about the
  ship, never about the body hosting it

### Requirement: Foreign Presence Is Served As System Contacts
The system SHALL, on the interior read, compute the requester
corporation's live disclosure of foreign ship presence in that system as
`proximity-disclosure`'s union over the requester's own fleets present in
the system (`proximity-disclosure`: "Disclosure to a Corporation Is the
Union Over Its Own Assets"), deduplicated by target before inclusion, and
SHALL serve the result as a top-level `contacts` array alongside `features`
and `laneGates` — never folded into either. A contact carries no fleet id
(`proximity-disclosure`'s own `Contact` shape); a corporation with no
fleet present in the system, including an authenticated but corpless
requester, SHALL receive an empty `contacts` array. Each contact's wire
representation SHALL carry the `scanning` field alongside position,
velocity, and `emitting`, exactly as `proximity-disclosure`'s `Contact`
shape defines it (`Contact.Scanning`, see "A Sweep's Emission Radius Scales
With Its Range") — the serialization step from `Contact` to the wire SHALL
NOT drop it.

#### Scenario: Contacts reflect the requester's own union of observers
- **GIVEN** a requester corporation with one or more of its own fleets
  present in a system, and a foreign ship within at least one of those
  fleets' detection range
- **WHEN** the requester reads that system's interior
- **THEN** the foreign ship appears in the response's `contacts` array

#### Scenario: A target seen by more than one own fleet appears once in contacts
- **GIVEN** a requester corporation with two of its own fleets in a
  system, each independently within detection range of the same foreign
  ship
- **WHEN** the requester reads that system's interior
- **THEN** the foreign ship appears exactly once in `contacts`

#### Scenario: A corpless requester's contacts array is empty
- **WHEN** an authenticated but corpless requester reads a materialized
  system's interior
- **THEN** the response's `contacts` array is empty

#### Scenario: A foreign fleet outside every own fleet's detection range is absent from contacts
- **GIVEN** a requester corporation whose own fleets in a system do not
  detect a particular foreign ship present there
- **WHEN** the requester reads that system's interior
- **THEN** that foreign ship does not appear in `contacts`

#### Scenario: A contact's scanning state is served on the wire
- **GIVEN** a foreign ship disclosed as a contact, running a focused scan at
  the moment the interior is read
- **WHEN** the requester reads that system's interior
- **THEN** the corresponding entry in the response's `contacts` array
  carries `scanning: true`

### Requirement: Lane-Gate Bodies Carry Their Lane Id
The system SHALL serve, for every lane-gate body in a materialized
system's interior read, the stable id of the lane it serves (wire field
`laneId`), alongside — never replacing — that gate body's `destSystemId`
and its body `id` (per *Lane-Gate Bodies Carry Their Body Id*), so a client
can commit a jump (`POST /v1/fleets/:fleetId/jump {laneId}`) by passing this
value straight through, with no second lookup and no client-side
re-derivation of the id. This id SHALL be the same id the jump endpoint
accepts, and SHALL match the id the server derives for the same crossing on
either endpoint (`galaxy.LaneIdBetween`, order-independent over the
unordered system-pair, is the single derivation both gate attachment and
travel arrival already agree on). This field SHALL be served regardless of
the requester's charted knowledge, exactly as the gate body itself is served
regardless of charted knowledge under "Bodies Are Public; Ships Are
Disclosed": a fresh corporation with no charted lanes still receives a
usable `laneId` on every gate body it reads.

The `cell` this requirement previously named as a companion field is
withdrawn with the rest of the polar lattice (see *Interior Read Serves
Continuous Bodies*, which mandates that a lane-gate body carry no `cell`).
A gate body's position is now its continuous `space`, and its identity is
its `id`.

#### Scenario: A materialized system's read carries each lane-gate body's lane id
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every lane-gate body in the response carries a **non-empty**
  `laneId` field alongside its `destSystemId` and its body `id`

#### Scenario: The served lane id is the one the jump endpoint accepts
- **GIVEN** a lane-gate body's `laneId` from a system interior read
- **WHEN** that value is passed as `POST /v1/fleets/:fleetId/jump`'s
  `laneId` for a fleet attached to that gate
- **THEN** the server accepts it as naming that lane, with no additional
  lookup required of the client

#### Scenario: The served lane id matches the server's own derivation for the same crossing
- **GIVEN** a lane between two systems
- **WHEN** its id is derived via `galaxy.LaneIdBetween` for the crossing
  from either system's own gate-attachment or travel-arrival write
- **THEN** the id served on the corresponding lane-gate body in either
  system's interior read is identical to it

#### Scenario: A fresh corporation with no charted lanes still receives a usable lane id
- **GIVEN** a corporation with no charted lanes
- **WHEN** it reads a materialized system's interior
- **THEN** every lane-gate body in the response still carries its `laneId`,
  unfiltered by the corporation's charted knowledge

### Requirement: A Spliced Body Is Complete or Omitted, and Its Incompleteness Is Loud
The system SHALL treat a body constructed in process and spliced into an
interior (for example a system's trading station) as complete only when it
carries both a continuous orbital element set and a strictly positive size.
Such a body SHALL be omitted from the interior read and from any table built
from it when it carries neither or either is missing, and that omission
SHALL be recorded at error severity, naming the splicing source and the
missing field — distinguishably from a stored feature's decode omission,
which this capability's *Interior Feature Decode Validates Its Orbital
Element Set, Omitting Rather Than Failing* records at warn severity, because
an incomplete spliced body can only ever be a programming error, never
corrupt or legacy stored data. A spliced body SHALL never be served with a
non-positive size.

#### Scenario: A spliced body missing its orbit or a positive size is omitted and recorded loudly
- **WHEN** a body constructed in process and spliced into an interior (for
  example a system's trading station) carries no continuous orbital element
  set, or a size that is not strictly positive
- **THEN** that body is omitted from the interior read and from any table
  built from it, and the omission is recorded at error severity naming the
  splicing source and the missing field — distinguishably from a stored
  feature's decode omission, and never served with a non-positive size

#### Scenario: A complete spliced body is served
- **WHEN** a body constructed in process and spliced into an interior
  carries both a continuous orbital element set and a strictly positive
  size
- **THEN** it is served in the interior read and in any table built from it,
  indistinguishably from a stored feature

### Requirement: The Fuel Resource-Kind Name Is Reserved From Generation
The system SHALL declare `fuel` as a reserved resource-kind name, distinct
from every `system.ResourceKind` value the generator can produce — `fuel`
is a reserved cargo kind (`fleet-movement`'s "Fleet Cargo Pool"), mined by
no verb and generated as no mineable resource, and a mineable body
generated with that name would silently collide with the cargo kind this
change introduces, corrupting either the mine-resolve credit path or the
cargo pool's own accounting depending on which one wins the collision.
This is a namespace-reservation guard, not a new gameplay rule: no
generation path today produces `fuel` as a resource kind, and this
requirement exists to keep it that way as a tested invariant rather than
an accidental absence.

#### Scenario: No declared mineable resource kind equals the reserved fuel name
- **WHEN** the set of declared `system.ResourceKind` values the generator
  can produce is compared against the reserved fuel resource-kind name
- **THEN** none of the declared values equals the reserved name

#### Scenario: The six existing resource kinds are unaffected
- **WHEN** the declared `system.ResourceKind` values are enumerated
  (metals, volatiles, water, organics, research, exotic)
- **THEN** all six are present and unchanged, since none of them collides
  with the reserved `fuel` name

### Requirement: Interior Read Serves Continuous Bodies
The system SHALL serve `GET /v1/systems/:systemId`, returning the system's
continuous `extent` — the star-frame upper bound over every generated body's
orbital radius — its character, star class, current world time, every body
(including each lane-gate body, unfiltered by any charted-knowledge gate —
see "Bodies Are Public; Ships Are Disclosed"), and a `contacts` array
reflecting the requester's own live disclosure of foreign ship presence in
that system (see "Foreign Presence Is Served As System Contacts"). The
`extent` is this response's only system-sized scalar: it is what a client
scales a camera, a pan bound, and a pick radius against, and it replaces the
lattice `radius` this requirement's predecessor served.

Every non-star body, and every lane-gate body, SHALL carry its continuous
orbital element set under the wire key `orbitElements`, an object carrying
`parentId`, `radius`, `periodMs`, `phase`, `inclination`, and `node`, so a
client can evaluate that body's position at any world time from the served
elements alone without a further read per rendered frame. The star SHALL
carry no `orbitElements` (it is parentless and positioned at the origin).
Every other body reaching this response carries a complete element set by
construction — a body whose stored element set is missing or undecodable is
omitted from the response entirely rather than served partially (see
"Interior Feature Decode Validates Its Orbital Element Set, Omitting Rather
Than Failing", "A Feature Omission Cascades to a Fixpoint Through the Parent
Chain", and "A Spliced Body Is Complete or Omitted, and Its Incompleteness Is
Loud") — so there is no partially-populated `orbitElements` case on this wire.

This response SHALL carry the simulation clock's **scale** — the number of
world-milliseconds the world advances per wall-clock millisecond — alongside
the `worldTime` it serves, taken from the same clock, so a client
extrapolating live world time between reads projects at the world's own rate
rather than at an assumed rate of 1.

This response SHALL NOT carry any polar-lattice placement field. Specifically,
the response SHALL carry no top-level lattice `radius` (the continuous
`extent` above is its successor, and the two are different quantities in
different units — serving both would leave a consumer free to scale
continuous space off the lattice one); a body SHALL carry no `footprint`, no
`orbit` object (the lattice orbit `{ring, angle0, period, dir}`), no
`parentId` at the top level of the body (the continuous parent is
`orbitElements.parentId`), no `fixed` flag, no `band` value, no `live` value,
and no `asOf` stamp; and a lane-gate body SHALL carry no `cell`. These fields
described a position on the polar ring-and-slot board
and a visibility banding that no longer exists — `band` has been constant
`"visible"`, `live` constant `true`, and `asOf` constant absent since bodies
became public — and this capability's continuous-space consumer reads none of
them.

This is a deliberate removal of fields previously served, not an additive
change; the additivity clause this requirement previously carried is withdrawn
with them.

#### Scenario: Unknown or ungenerated system
- **WHEN** `GET /v1/systems/:systemId` is called for a system id absent
  from the live galaxy
- **THEN** the response is `404 Not Found`

#### Scenario: No live galaxy
- **WHEN** `GET /v1/systems/:systemId` is called and no galaxy has been
  generated
- **THEN** the response is `404 Not Found`

#### Scenario: A materialized system's read carries every body's continuous position and size
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every body in the response, including each lane-gate body,
  carries a continuous position and a size

#### Scenario: A non-star body's read carries its full orbital element set
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every non-star feature body in the response carries an
  `orbitElements` object with `parentId`, `radius`, `periodMs`, `phase`,
  `inclination`, and `node`, each equal to the value that body's stored
  element set holds

#### Scenario: A lane-gate body's read carries its full orbital element set
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every lane-gate body in the response carries an `orbitElements`
  object with the same six fields, equal to the element set the system's
  body table derived for that gate

#### Scenario: The star carries no orbital element set
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** the star's response entry carries no `orbitElements` key

#### Scenario: The read carries the interior's continuous extent
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** the response carries a continuous `extent` equal to the value
  that interior's stored document holds

#### Scenario: The read carries the world clock's scale alongside its world time
- **WHEN** an authenticated requester reads a materialized system's
  interior on a world whose simulation clock runs at a scale other than 1
- **THEN** the response carries that clock's scale alongside its
  `worldTime`, so a client can project live world time at the world's own
  rate

#### Scenario: A body served without a resolvable continuous position is still element-complete
- **WHEN** a body's continuous position could not be resolved for this read
  (no body table was available) and it is therefore served with a
  zero-valued `space` position
- **THEN** its `orbitElements` object is still served in full from its
  stored element set, since the elements are stored data and not a
  resolution result

#### Scenario: Lattice-only fields are absent from the response
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** the response carries no top-level lattice `radius`, no body
  carries `footprint`, `orbit`, a top-level `parentId`, `fixed`, `band`,
  `live`, or `asOf`, and no lane-gate body carries `cell`

### Requirement: Lane-Gate Bodies Carry Their Body Id
The system SHALL serve, for every lane-gate body in a materialized system's
interior read, that gate body's own body id under the wire key `id` — the
same key every other body in this response carries. That value SHALL be
identical to the id the server reports in a fleet's `attachedTo` once that
fleet arrives attached to that gate, and identical to the id a burn order
must name to target that gate, so one served string is the gate's identity
across the interior read, the burn command, and the fleet read. Like
`destSystemId` and `laneId`, it SHALL be served regardless of the
requester's charted knowledge.

This id SHALL be served rather than left for a client to reconstruct. The
server builds it by a naming convention — a fixed prefix joined to the
destination system id — that `backend/system` does not export, and that is
already mirrored independently by three backend packages (`backend/charts`,
`backend/fleet`'s handler, and `backend/fleet`'s fuel estimator each hold
their own copy of the prefix). A client copy would be a fourth, sitting on
the far side of the wire where no Go test can reach it and pinned by no
cross-stack fixture. A later change SHALL NOT withdraw this field in favour
of a client-side reconstruction of that convention (design.md Decision 15).

#### Scenario: The served gate body id is the id a fleet attaches to
- **GIVEN** a lane-gate body served with an `id` in a system interior read
- **WHEN** a fleet burns to that gate and arrives attached to it
- **THEN** that fleet's own read reports an `attachedTo` string exactly
  equal to the `id` served for that gate body — equality, not merely the
  presence of some id on each side

#### Scenario: A burn order naming the served gate body id targets that gate
- **WHEN** a burn order names, as its target, the `id` a lane-gate body was
  served with
- **THEN** the server resolves it as that gate body and accepts the order,
  requiring no separately-derived identifier from the client

#### Scenario: A fresh corporation with no charted lanes still receives the gate body id
- **GIVEN** a corporation with no charted lanes
- **WHEN** it reads a materialized system's interior
- **THEN** every lane-gate body in the response carries its `id`, unfiltered
  by the corporation's charted knowledge

#### Scenario: Every lane-gate body carries a non-empty, distinct id
- **WHEN** an authenticated requester reads a materialized system's interior
  that has two or more lane gates
- **THEN** every lane-gate body carries a non-empty `id`, and no two bodies
  in that response share one

### Requirement: Interior Generation Is Lazy and Deterministic
The system SHALL generate a system's interior deterministically from the
per-system seed (`galaxy.SystemSeed(gallaxySeed, systemId)`), the system's
graph-tier region (as its character dial), and its galaxy-tier skeleton: a
fixed star feature at the centre, one orbiting feature per skeleton body
(extending, never contradicting, the skeleton), and additional detail
(extra small bodies, belts, moons on gas giants, anomalies/ruins, hazards)
whose counts and resource richness are dialed by the region's character.
Every generated angular position SHALL be a continuous phase drawn over the
whole turn — an integer sub-turn value in `[0, SubTurn)` — so no arc of any
orbit is unreachable. A system's trading station, when one exists, is NOT
part of this deterministic generation: it is provisioned independently by
the `trading-station` capability (as a spawn asset-healing step, not
interior materialization), so this requirement's determinism and
create-if-absent guarantees make no claim about a station's presence,
position, or timing — a system may materialize its interior with no
station, gain one later at spawn, or (for a non-home system) never carry
one.

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

#### Scenario: Generated phases span the whole turn
- **WHEN** interiors are generated across many seeds and every generated
  feature's continuous phase is collected
- **THEN** the collected phases occupy every quadrant of `[0, SubTurn)`,
  not only a sub-arc of it
- **AND** the greatest common divisor of the pairwise differences of the
  collected phases is `1`, so the draw is not confined to a coarse
  sub-lattice of the turn at any offset — a generator drawing
  `c + k·(SubTurn/16)` covers every quadrant and has gcd `1` whenever `c` is
  odd, while leaving almost every phase unreachable, which is the continuous
  restatement of the very defect the retired every-slot-is-reached scenario
  existed to catch

### Requirement: Every Generated Body Carries a Continuous Orbital Element Set and a Size
The system SHALL generate a continuous orbital element set (`space.Orbit`)
and a physical size for every feature the interior generator produces,
deterministically from the per-system seed. The star SHALL carry no orbital
element set (it is parentless, positioned at the origin). Every non-star
feature SHALL name, as its orbit's parent, another body present in the same
interior. Every angle (phase, inclination, node) SHALL be an integer
sub-turn value in `[0, SubTurn)`. Every feature SHALL carry a strictly
positive size.

#### Scenario: Continuous elements are reproducible from the per-system seed
- **WHEN** an interior is generated twice from the same per-system seed,
  region, and skeleton
- **THEN** every feature's continuous orbital element set and size are
  identical between the two generations

#### Scenario: The star carries no orbital element set
- **WHEN** an interior is generated
- **THEN** the star feature's continuous orbit is absent (nil), consistent
  with its fixed placement at the origin

#### Scenario: Every non-star feature names a parent present in the same interior
- **WHEN** an interior is generated
- **THEN** every feature other than the star carries a continuous orbit
  whose parent id resolves to another feature generated in that same
  interior

#### Scenario: Every angle is an integer sub-turn within range
- **WHEN** any feature's continuous phase, inclination, or node is inspected
- **THEN** each is an integer value in `[0, SubTurn)`, never a
  floating-point radian or degree

#### Scenario: Every feature has a strictly positive size
- **WHEN** an interior is generated
- **THEN** every feature's size, including the star's, is strictly greater
  than zero

### Requirement: Continuous Orbital Radii Ascend With the Skeleton Ordinal and Are Separated
The system SHALL derive a feature's continuous orbital radius as the
geometric law `ContinuousRadius(idx) = BaseOrbitRadius × RadiusGrowth^idx`
of a per-family **orbital index** `idx`, never a new random draw. The
orbital index SHALL be exactly one of the following, which is the complete
enumeration — no star-parented feature falls outside it, and a
body-parented feature never has one:

- for a skeleton major body, its raw, un-clamped skeleton ring
  (`galaxy.Body.Ring`), in `[0, MaxRings)`;
- for every other star-parented generated feature (an extra body, a belt,
  an anomaly, a ruin, a hazard), an orbital index that same feature's own
  generator line draws, in `[1, GenerationParams.Radius]`;
- **undefined** for a body-parented feature (a moon, or the station) — such
  a feature's local radius SHALL instead follow its own governing law (a
  named band anchored on its parent, or a type-keyed ceiling) and SHALL
  NEVER be derived through `ContinuousRadius`.

`ContinuousRadius`'s total domain is the integer interval
`[0, max(MaxRings − 1, GenerationParams.Radius)]`, which
`Generated Orbits Satisfy Their Cross-Capability and Internal Clearance
Invariants`' invariant 5 constrains to `[0, GenerationParams.Radius]`, and
`SystemInterior.Extent = ContinuousRadius(GenerationParams.Radius)` SHALL
be a genuine upper bound over every star-parented feature's continuous
radius in that interior.

Strict ascent and a configured minimum spacing multiple
(`MinOrbitSpacing = RadiusGrowth`, exactly — no larger multiple is
assertable, since adjacent skeleton ordinals differ by at least 1) SHALL
bind **skeleton major bodies only**, in raw-ring ordinal order: successive
skeleton bodies' continuous radii SHALL be strictly increasing, each at
least `MinOrbitSpacing` times its predecessor's. No ascent or separation
SHALL be required, or asserted, between a skeleton major and any other
feature family, or between two non-skeleton features — a detail feature
MAY share a skeleton major's orbital index and land on the identical
radius at a different phase, which is a legal co-orbital pair, not a
defect. A system with a single skeleton body SHALL still receive a valid,
strictly positive continuous radius with no adjacent-radius comparison
performed. The largest radius any generated feature can receive SHALL be
strictly less than the orbital-element codec's configured coordinate
extent.

#### Scenario: Successive skeleton radii strictly ascend
- **WHEN** an interior's skeleton bodies are generated in raw-ring-ascending
  order
- **THEN** their continuous orbital radii are strictly increasing, in the
  same order as their ring ordinals

#### Scenario: Each successive radius meets the configured minimum spacing
- **WHEN** two skeleton bodies occupy adjacent generated ordinals
- **THEN** the outer body's continuous radius is at least
  `MinOrbitSpacing` (`= RadiusGrowth`) times the inner body's radius

#### Scenario: A single-body system still receives a valid radius
- **WHEN** a system's skeleton has exactly one body
- **THEN** that body's continuous radius is strictly positive and no
  adjacent-radius comparison is performed

#### Scenario: A detail feature may share a skeleton major's orbital index
- **WHEN** a non-skeleton star-parented feature's own generator-drawn
  orbital index equals a skeleton major's raw ring
- **THEN** the two features' continuous orbital radii are identical, which
  is a legal co-orbital pair and is not rejected by strict ascent or the
  minimum spacing multiple, since neither binds outside skeleton majors

#### Scenario: The largest generated radius stays inside the codec's extent
- **WHEN** a feature is generated at the maximum configured skeleton ring
- **THEN** its continuous radius is strictly less than the orbital-element
  codec's configured coordinate extent, so it can never fail encoding on
  that ground

### Requirement: Retrograde Motion Is Expressed By Inclination, Never By a Non-Positive Period
The system SHALL express every generated orbiting feature's continuous
period as strictly positive; a non-positive period SHALL NOT be used to
encode retrograde motion. Retrograde motion SHALL be expressed solely by
inclination: a prograde feature's inclination SHALL lie in
`[0, MaxInclinationJitter]`, and a retrograde feature's inclination SHALL
lie in `[SubTurn/2 − MaxInclinationJitter, SubTurn/2]`, with the configured
`MaxInclinationJitter` strictly less than `SubTurn/8`, so no generated
inclination can reach the quarter-turn boundary from either side.

A feature's prograde/retrograde side SHALL be decided exactly once, by the
orbital-direction roll `Coherent Orbital Direction` governs — the system's
`DominantOrbitDirection` for every disk-born feature (skeleton-derived
bodies, belts, hazards), and that direction inverted with the tuned
`RetrogradeChance` probability for a capture-plausible detail feature (an
extra body, an anomaly, a ruin). That single decided side SHALL select the
inclination band; only the jitter magnitude within the selected band is
drawn from the continuous stream, and the side SHALL NOT be re-rolled on
that stream. A feature that carries no orbital-direction roll of its own (a
moon, or the station) SHALL take its side from the system's
`DominantOrbitDirection`.

#### Scenario: Every generated orbiting feature has a strictly positive period
- **WHEN** an interior is generated
- **THEN** every feature with a continuous orbit (every feature but the
  star) carries a strictly positive continuous period

#### Scenario: Every generated inclination lies within its configured band
- **WHEN** any orbiting feature's continuous inclination is inspected
- **THEN** it lies in `[0, MaxInclinationJitter]` or in
  `[SubTurn/2 − MaxInclinationJitter, SubTurn/2]`, and never strictly
  between the two bands

#### Scenario: A retrograde feature sweeps against a prograde one at the same node
- **WHEN** a retrograde feature's own local orbital offset and local
  velocity, and a prograde feature's own local orbital offset and local
  velocity, both sharing the same node, are each evaluated at corresponding
  phase indices
- **THEN** the vertical component of `cross(localOffset, localVelocity)` is
  non-zero for each of the two features, and opposite in sign between the
  two, evidencing reversed sweep direction — no assertion is made that
  either feature's out-of-plane offset is exactly zero

#### Scenario: A moon or the station takes its side from the system's dominant direction
- **WHEN** a moon's or the station's continuous inclination is inspected
- **THEN** its side matches the system's `DominantOrbitDirection`,
  independent of any capture-chance roll

#### Scenario: Zero retrograde chance yields fully prograde detail features
- **WHEN** an interior is generated with `RetrogradeChance` 0, in a system
  whose dominant orbital direction is negative and again in one whose
  dominant orbital direction is positive
- **THEN** every capture-plausible detail feature's continuous inclination
  falls on the same side as that system's disk-born features — the side
  that system's `DominantOrbitDirection` names, which for a negative
  dominant direction is the `[SubTurn/2 − MaxInclinationJitter, SubTurn/2]`
  band and not the `[0, MaxInclinationJitter]` band

#### Scenario: Certain retrograde chance inverts every capture-plausible feature's inclination
- **WHEN** an interior is generated with `RetrogradeChance` 1, in a system
  whose dominant orbital direction is negative and again in one whose
  dominant orbital direction is positive
- **THEN** every capture-plausible detail feature's continuous inclination
  falls on the band opposite that system's disk-born features, while
  skeleton bodies, belts, and hazards remain on the disk's own side

## Notes for future maintainers

- **Occlusion is no longer this capability's rule.** It once was: the interior
  fed a fog source that assigned each feature type a squared occlusion radius
  in lattice table units, so a star's shadow had a real width and the far side
  of the inner system was genuinely dark. That table, the lattice line-of-sight
  it indexed, and the `observation` capability that consumed it were all
  deleted across the continuous-space chain, ending with `delete-the-lattice`
  (2026-09-04). Occlusion in R³ is now `proximity-disclosure`'s alone — star-only,
  computed from continuous positions — and this capability serves body data
  without any notion of what blocks sight of what. What a gas giant *is*
  remains this domain's knowledge; what it hides is not, and no longer was even
  before the geometry changed.

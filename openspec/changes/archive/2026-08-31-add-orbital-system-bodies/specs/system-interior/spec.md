## ADDED Requirements

### Requirement: Interiors Emit Continuous Orbital Elements For Every Body
The system SHALL generate, alongside a feature's existing lattice ring/slot
placement, a continuous orbital element set (`space.Orbit`) and a physical
size for every feature the interior generator produces, deterministically
from the per-system seed on a stream independent of the lattice draw
sequence. The star SHALL carry no orbital element set (it is parentless,
positioned at the origin). Every non-star feature SHALL name, as its
orbit's parent, another body present in the same interior. Every angle
(phase, inclination, node) SHALL be an integer sub-turn value in
`[0, SubTurn)`. Every feature SHALL carry a strictly positive size.

#### Scenario: Continuous elements are reproducible from the per-system seed
- **WHEN** an interior is generated twice from the same per-system seed,
  region, and skeleton
- **THEN** every feature's continuous orbital element set and size are
  identical between the two generations

#### Scenario: The star carries no orbital element set
- **WHEN** an interior is generated
- **THEN** the star feature's continuous orbit is absent (nil), consistent
  with its lattice `Fixed` placement at the centre

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

#### Scenario: Adding continuous elements leaves every lattice placement unchanged
- **WHEN** an interior is generated across a swept set of seeds, with the
  continuous element draws present and again with them absent
- **THEN** every feature's lattice ring, start angle, direction, footprint,
  resources, effects, id, and generation order are identical between the
  two runs, for every seed

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

### Requirement: Orbital Radii Ascend With the Skeleton Ordinal and Are Separated
The system SHALL derive a feature's continuous orbital radius as the
geometric law `ContinuousRadius(idx) = BaseOrbitRadius × RadiusGrowth^idx`
of a per-family **orbital index** `idx`, never a new random draw. The
orbital index SHALL be exactly one of the following, which is the complete
enumeration — no star-parented feature falls outside it, and a
body-parented feature never has one:

- for a skeleton major body, its raw, un-clamped skeleton ring
  (`galaxy.Body.Ring`), in `[0, MaxRings)`;
- for every other star-parented generated feature (an extra body, a belt,
  an anomaly, a ruin, a hazard), the lattice ring that same feature's own
  generator line already drew, in `[1, params.Radius]`;
- **undefined** for a body-parented feature (a moon, or the station) — such
  a feature's local radius SHALL instead follow its own governing law (a
  named band anchored on its parent, or a type-keyed ceiling) and SHALL
  NEVER be derived through `ContinuousRadius`.

`ContinuousRadius`'s total domain is the integer interval
`[0, max(MaxRings − 1, params.Radius)]`, which invariant 5 below constrains to
`[0, params.Radius]`, and `SystemInterior.Extent = ContinuousRadius(params.Radius)`
SHALL be a genuine upper bound over every star-parented feature's
continuous radius in that interior.

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
performed.

Because the function that places a raw ring onto the lattice board
(`clampRing`) is monotonically non-decreasing, the continuous radius
ordering derived from raw-ring order SHALL never contradict the lattice
ring ordering derived from clamped-ring order — it SHALL only resolve ties
the lattice ordering leaves ambiguous, never reverse a lattice-ring
comparison the two representations both express. The largest radius any
generated feature can receive SHALL be strictly less than the
orbital-element codec's configured coordinate extent.

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

#### Scenario: Two skeleton bodies mapped to the same lattice ring still receive distinct continuous radii
- **WHEN** a skeleton contains two bodies at raw ring ordinals 0 and 1, both
  of which the lattice board's `clampRing` maps to the identical clamped
  ring
- **THEN** the two bodies' continuous orbital radii are strictly different,
  the ordinal-1 body's strictly greater than the ordinal-0 body's

#### Scenario: A detail feature may share a skeleton major's orbital index
- **WHEN** a non-skeleton star-parented feature's own generator-drawn
  lattice ring equals a skeleton major's raw ring
- **THEN** the two features' continuous orbital radii are identical, which
  is a legal co-orbital pair and is not rejected by strict ascent or the
  minimum spacing multiple, since neither binds outside skeleton majors

#### Scenario: The largest generated radius stays inside the codec's extent
- **WHEN** a feature is generated at the maximum configured skeleton ring
- **THEN** its continuous radius is strictly less than the orbital-element
  codec's configured coordinate extent, so it can never fail encoding on
  that ground

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

### Requirement: A Retrograde Orbit Is Expressed By Inclination, Never By a Non-Positive Period
The system SHALL express every generated orbiting feature's continuous
period as strictly positive; a non-positive period SHALL NOT be used to
encode retrograde motion. Retrograde motion SHALL be expressed solely by
inclination: a prograde feature's inclination SHALL lie in
`[0, MaxInclinationJitter]`, and a retrograde feature's inclination SHALL
lie in `[SubTurn/2 − MaxInclinationJitter, SubTurn/2]`, with the configured
`MaxInclinationJitter` strictly less than `SubTurn/8`, so no generated
inclination can reach the quarter-turn boundary from either side.

A feature that already carries a lattice orbital direction — every
skeleton-derived body, belt, hazard, and capture-plausible detail feature
(extra body, anomaly, ruin) alike — SHALL take its prograde/retrograde side
from that same feature's own already-drawn lattice direction (the sign of
its lattice `Dir`), never re-rolling that side on the continuous stream;
only the inclination's jitter magnitude within its band is drawn from the
continuous stream. A feature that carries no lattice orbital direction (a
moon, or the station) SHALL take its side from the system's
`DominantOrbitDirection` instead.

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

#### Scenario: A feature's continuous side matches its own lattice direction
- **WHEN** any feature carrying a lattice orbital direction has its
  continuous inclination inspected
- **THEN** its side (prograde or retrograde) agrees with the sign of that
  same feature's lattice `Dir`, for a disk-born feature and a
  capture-plausible detail feature alike

#### Scenario: A moon or the station takes its side from the system's dominant direction
- **WHEN** a moon's or the station's continuous inclination is inspected
- **THEN** its side matches the system's `DominantOrbitDirection`,
  independent of any capture-chance roll

#### Scenario: Zero retrograde chance yields fully prograde detail features
- **WHEN** an interior is generated with `RetrogradeChance` 0, in a system
  whose dominant orbital direction is negative and again in one whose
  dominant orbital direction is positive
- **THEN** every capture-plausible detail feature's lattice direction equals
  its own system's dominant direction, and its continuous inclination falls
  on the same side as that system's disk-born features — the side the sign
  of its own lattice `Dir` names, which for a negative dominant direction is
  the `[SubTurn/2 − MaxInclinationJitter, SubTurn/2]` band and not the
  `[0, MaxInclinationJitter]` band

#### Scenario: Certain retrograde chance inverts every capture-plausible feature's inclination
- **WHEN** an interior is generated with `RetrogradeChance` 1, in a system
  whose dominant orbital direction is negative and again in one whose
  dominant orbital direction is positive
- **THEN** every capture-plausible detail feature's lattice direction is the
  negation of its own system's dominant direction, and its continuous
  inclination falls on the band opposite that system's disk-born features,
  while skeleton bodies, belts, and hazards remain on the disk's own side

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

### Requirement: An Interior Predating This Capability Fails Closed, Never Silently
The system SHALL treat a persisted interior whose stored extent is absent
or not strictly positive, or whose non-star feature carries no `SpaceDoc`
key at all (as distinct from one that is present but fails to decode), as
generated before this capability existed. Such an interior SHALL NOT be
completed with a zero-magnitude extent, a zero-radius gate, or an
additional parentless non-star body; a read or table build that encounters
one SHALL fail by name rather than degrade.

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

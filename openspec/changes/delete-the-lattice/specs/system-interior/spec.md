## ADDED Requirements

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
- **AND** the greatest common divisor of the collected phases is `1`, so the
  draw is not confined to a coarse sub-lattice of the turn — a generator
  drawing only multiples of some `SubTurn/k` covers every quadrant while
  leaving almost every phase unreachable, which is the continuous
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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Lazy, Deterministic Interior Generation
**Reason**: Superseded by "Interior Generation Is Lazy and Deterministic"
above, which is the same requirement with its lattice half removed.
Restructured as REMOVED + ADDED rather than MODIFIED because its scenario
"Placement reaches every slot on a ring whose slot count exceeds six times
its ring index" asserts a property of the polar slot schedule, which no
longer exists — the archiver refuses a MODIFIED block that omits a live
scenario, so dropping it requires this shape.
**Migration**: None. Four of its five scenarios survive verbatim in the
ADDED requirement; the dropped slot-coverage scenario is replaced by
"Generated phases span the whole turn", which asserts the same
"every angular position is reachable" property against the continuous
phase draw that replaces the slot draw.

### Requirement: Orbital Period Read from Live Tuning
**Reason**: This requirement governs the *lattice* orbital period —
`PeriodFor(ring) = OrbitBasePeriod × ring`, refilled from live tuning on
every read because it was never persisted, and the slot-schedule
non-uniformity that followed from it. Both the stored `system.Orbit` it
filled and the schedule it reasons about are deleted by this change. The
continuous period is a different law with the opposite persistence rule —
computed once at generation time from the radius alone and stored — and is
already governed by "A Body-Parented Orbit's Continuous Period Follows a
Named Law of Its Radius, Fixed at Generation Time". Keeping this
requirement would leave two contradictory period laws in one capability.
**Migration**: None. `common.GameTuning.OrbitBasePeriod`,
`common.GameTuning.OrbitPeriod`, and `system.PeriodFor` are deleted
outright. Already-materialized interiors keep their stored continuous
elements; no document is rewritten, and retuning orbital pacing is no
longer possible without regenerating — an accepted loss, recorded here so
it is not rediscovered as a defect.

### Requirement: Interior Feature Decode Validates Ring Against the Live Schedule
**Reason**: A guard on the lattice-only failure mode where a stored
feature's ring exceeds the live board schedule's maximum, which would panic
`board.Canon`/`polar.Schedule.Slots`. With `system.Orbit`, `board` and
`polar` all deleted, the failure mode does not exist. The surviving
storage-boundary guard on the representation that remains is "Interior
Feature Decode Validates Its Orbital Element Set, Omitting Rather Than
Failing", together with "A Feature Omission Cascades to a Fixpoint Through
the Parent Chain".
**Migration**: None. `system.featureRingOK` and its call site in
`readInterior` are deleted.

### Requirement: Interiors Emit Continuous Orbital Elements For Every Body
**Reason**: Superseded by "Every Generated Body Carries a Continuous
Orbital Element Set and a Size" above, which is the same requirement with
its lattice half removed (the elements are no longer generated "alongside"
a lattice placement, and no longer need to declare stream independence from
a draw sequence that no longer exists). Restructured as REMOVED + ADDED
rather than MODIFIED because its scenario "Adding continuous elements
leaves every lattice placement unchanged" asserts a property of the lattice
tier — the archiver refuses a MODIFIED block that omits a live scenario, so
dropping it requires this shape.
**Migration**: None. Five of its six scenarios survive verbatim in the
ADDED requirement. The dropped scenario is retired with its paired
requirement below, not silently: the two were explicitly cross-linked, and
both go in this change.

### Requirement: Orbital Radii Ascend With the Skeleton Ordinal and Are Separated
**Reason**: Superseded by "Continuous Orbital Radii Ascend With the Skeleton
Ordinal and Are Separated" above, which is the same requirement with its two
lattice couplings removed: the non-skeleton family's orbital index is no
longer "the lattice ring that generator line already drew" but an orbital
index with no board meaning, and the `clampRing` monotonicity paragraph —
which existed to prove the continuous ordering never contradicts a lattice
ring ordering — has no second ordering left to agree with. Restructured as
REMOVED + ADDED rather than MODIFIED because its scenario "Two skeleton
bodies mapped to the same lattice ring still receive distinct continuous
radii" asserts a property of `clampRing`, which is deleted; the archiver
refuses a MODIFIED block that omits a live scenario.
**Migration**: None. Five of its six scenarios survive verbatim in the ADDED
requirement. The dropped scenario's substance — two distinct skeleton
ordinals receive distinct radii — is fully covered by the surviving
"Successive skeleton radii strictly ascend", which is strictly stronger.

### Requirement: A Retrograde Orbit Is Expressed By Inclination, Never By a Non-Positive Period
**Reason**: Superseded by "Retrograde Motion Is Expressed By Inclination,
Never By a Non-Positive Period" above, which is the same requirement with
its side-selection input re-sourced. It currently takes a feature's
prograde/retrograde side from "the sign of its lattice `Dir`" — a field on
the deleted `system.Orbit`. The roll that produced that sign is
`Coherent Orbital Direction`'s, which is untouched by this change; the
ADDED requirement reads the roll directly instead of reading where the
lattice happened to store it. Restructured as REMOVED + ADDED rather than
MODIFIED because its scenario "A feature's continuous side matches its own
lattice direction" compares against a field that no longer exists; the
archiver refuses a MODIFIED block that omits a live scenario.
**Migration**: None. Five of its six scenarios survive in the ADDED
requirement, two of them with their bodies re-sourced from `Dir` to the
direction roll. The dropped scenario has no successor because it asserted
agreement between two representations, and only one representation remains.

### Requirement: Lattice Placement Is Independent Of The Continuous Stream
**Reason**: The requirement exists to prove the lattice tier's output is
unaffected by the continuous stream. With no lattice tier there is no such
output, and its instrumentation — the `r2 == nil` "generate no continuous
elements" mode, the per-case lattice-stream word count, and the
`latticeProjection` / `latticeDrawCount` components of the
`interiorElements` fixture family — has nothing left to measure.
**Migration**: None. `generateWithStreams`' nil-`r2` mode, the instrumented
lattice-stream counter, and the `latticeProjection` and `latticeDrawCount`
components of `fixtures/system/cases.json`'s `interiorElements` family are
deleted, and that family is re-recorded over its surviving `continuousLine`
component. The paired scenario "Adding continuous elements leaves every
lattice placement unchanged" (on "Interiors Emit Continuous Orbital
Elements For Every Body", above) is retired in the same change, as that
scenario's own text instructs.

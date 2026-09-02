# system-body-table Specification

## Purpose
TBD - created by archiving change add-orbital-system-bodies. Update Purpose after archive.
## Requirements
### Requirement: One Table Resolves Every Body In a System, Absence Never An Error
The system SHALL provide, for a single system, one table (`BodyTable`)
whose `Body(id string) (space.Body, bool)` query resolves any body id
within that system to its continuous representation or reports absence via
its boolean result — never an error. Building a table for a system whose
interior has not yet materialized SHALL materialize it through the same
atomic create-if-absent path the interior read already uses, so that two
concurrent builds for the same never-before-read system converge on one
persisted interior and both resulting tables resolve the same bodies.
Every id within one table SHALL be unique. Once built, a table's queries
SHALL be a pure, synchronous in-memory lookup performing no storage read. A
table SHALL be scoped to exactly one system: it SHALL resolve only bodies
belonging to the system it was built for, and SHALL NOT resolve, or reach
into, any other system's bodies. Because feature ids are system-scoped and
not galaxy-unique, an id string that also occurs in another system SHALL
resolve here to **this** system's body of that id, never the other's.

#### Scenario: An unknown id resolves to absence, not an error
- **WHEN** `Body` is called on a built table with an id no body in that
  system carries
- **THEN** the call returns `(space.Body{}, false)`, with no error

#### Scenario: No two bodies in one table share an id
- **WHEN** a table is built for a system containing interior features, belt
  members, a station, and lane gates
- **THEN** every one of their ids is unique within that table

#### Scenario: A built table's queries perform no storage read
- **WHEN** `Body` is called on an already-built table after every store it
  was built from has become unavailable
- **THEN** the call still succeeds, resolving purely from the table's own
  in-memory state

#### Scenario: A shared id string resolves to this table's own body
- **WHEN** the same id string is looked up against two different systems' tables,
  both of which mint a body with that id
- **THEN** each table returns its own system's body, with no cross-system leakage

#### Scenario: Building a table for an unmaterialized system materializes it
- **WHEN** a `BodyTable` is built for a system whose interior has never been
  read before
- **THEN** the build succeeds, the system's interior is materialized and
  persisted as a side effect, and the resulting table resolves that
  interior's bodies

#### Scenario: Two concurrent first builds converge on one persisted interior
- **WHEN** two `BodyTable` builds race to materialize the same
  never-before-read system's interior
- **THEN** exactly one persisted interior results, and both builds' tables
  resolve the identical set of bodies

### Requirement: Body Identity Is System-Scoped, Not Galaxy-Unique
A body's identity within a table SHALL be its system-scoped feature id,
following the same non-globally-unique convention every other system
feature id already uses (`mine-extraction`'s "feature ids... are not unique
across the galaxy"). A body id SHALL be meaningful only when resolved
against its own system's table.

#### Scenario: Two systems may mint the same local body id independently
- **WHEN** two different systems' tables are each built, and each happens to
  contain a feature-derived body id with the same string value
- **THEN** each table resolves its own body independently, with no
  collision or cross-system interference between the two

### Requirement: The Table Enumerates Every Body It Resolves, In a Deterministic Order
A built table SHALL enumerate, through `Ids()`, exactly the set of ids its `Body` query
resolves — every interior feature, every belt member, the station where present, and every
lane gate — with no id omitted and none returned that `Body` does not resolve. That
enumeration SHALL be in a deterministic total order that is identical for two tables built
from the same interior, station, and live lane set, so that a sweep over bodies produces
stable output, on the same terms `disclosure`'s attachment enumeration requires.

#### Scenario: The enumeration matches the resolvable set exactly
- **WHEN** `Ids()` is called on a built table
- **THEN** every returned id resolves through `Body`, and every body the table contains
  appears exactly once

#### Scenario: Two builds of the same system enumerate in the identical order
- **WHEN** a table is built twice for the same system, interior, station, and live lane set
- **THEN** `Ids()` returns the identical slice, element for element, in the identical order,
  and not an order that varies between builds of the same inputs

### Requirement: Lane Gates Are Derived Fresh At Every Build, Never Persisted
The system SHALL derive a system's lane-gate bodies from that system's live
lane set at every `BodyTable` build, rather than from any persisted gate
record, so that a lane materialized after the system's interior was
generated still yields a gate on the very next build. Gate ids SHALL be
deterministic for a given live lane set and SHALL NOT collide with any
interior feature id or belt member id in the same table.

#### Scenario: A lane materialized after interior generation still yields a gate
- **WHEN** a system's interior was generated before a new lane touching that
  system materialized, and the table is built afterward
- **THEN** the newly materialized lane's gate appears in the built table

#### Scenario: Gate ids never collide with any other body in the table
- **WHEN** a table containing interior features, belt members, and lane
  gates is built
- **THEN** no gate id equals any interior feature id or belt member id in
  that same table

#### Scenario: Rebuilding against the same live lane set reproduces the same gate ids
- **WHEN** a table is built twice against the same system and the same live
  lane set
- **THEN** the resulting gate ids are identical between the two builds

### Requirement: A Gate's Bearing Is Derived From the Galaxy Layout, Never Runtime Trigonometry
The system SHALL place a lane gate's bearing at the phase index
`space.PhaseIndexOf` resolves for the horizontal-plane projection of the
vector from the gate's system's galaxy coordinates to its lane's
destination system's galaxy coordinates — never a runtime trigonometric
computation. An offset that lies exactly on the pinned table's tie-break
boundary SHALL resolve to that boundary's documented lower index, per
`space-kinematics`'s own tie-break rule.

A lane whose destination system is not present among the materialized
systems a `BodyTable` build reads SHALL yield **no gate** for that lane —
never a default or fabricated bearing — and the omission SHALL be recorded
naming both the gate's own system id and the unreadable destination system
id. A lane whose two systems' galaxy coordinates project to an exactly zero
horizontal offset SHALL place that lane's gate at `space.DefaultPhaseIndex`
— the same named default degenerate offsets resolve to elsewhere in
`space` — a value this capability declares explicitly rather than
inheriting incidentally from `PhaseIndexOf`'s own tie-break search.

A lane gate's orbital inclination and node SHALL both be zero: the gate lies
on the system's reference plane, so its stored phase index **is** its
azimuth. A gate SHALL NOT take a prograde/retrograde side from the system's
dominant orbital direction, and SHALL NOT carry an inclination jitter — the
inclination convention governing generated orbiting features does not apply
to gates.

#### Scenario: A gate's phase index matches the pinned bearing derivation
- **WHEN** a lane gate is derived for a lane whose two systems' galaxy
  coordinates are known
- **THEN** the gate's phase index equals `space.PhaseIndexOf` applied to the
  horizontal projection of the vector between those two systems' coordinates

#### Scenario: An exact tie resolves to the documented lower index
- **WHEN** a lane's bearing offset lies exactly on the pinned table's
  tie-break boundary between two adjacent candidate directions
- **THEN** the derived gate phase index is the lower of the two candidate
  indices, deterministically

#### Scenario: An unreadable destination yields no gate, never a default bearing
- **WHEN** a lane's destination system id is not present among the
  materialized systems a `BodyTable` build reads
- **THEN** no gate is derived for that lane, and a record exists naming
  both the gate's own system id and the unreadable destination system id

#### Scenario: A zero horizontal projection places the gate at the named default phase index
- **WHEN** a lane's two systems' galaxy coordinates project to an exactly
  zero horizontal offset
- **THEN** the derived gate's phase index is exactly `space.DefaultPhaseIndex`,
  not an incidental result of `PhaseIndexOf`'s own tie-break search

#### Scenario: A gate lies on the reference plane in every system
- **WHEN** a lane gate is derived in a system whose dominant orbital direction is
  retrograde, and again in one whose dominant direction is prograde
- **THEN** both gates carry a zero inclination and a zero node, and each gate's
  resolved position lies at the azimuth its derived phase index names, unmirrored

### Requirement: A Gate Is Motionless
The system SHALL derive every lane gate with a non-positive continuous
period, so that its position is identical at every world time and its
velocity is the zero vector, with no division performed against its
period. A motionless gate SHALL remain a resolvable body — a valid burn
target and dock host, per `space`'s own definition of a non-positive-period
orbit — with no special-cased handling required of a future consumer.

#### Scenario: A gate's position never changes
- **WHEN** a lane gate's position is evaluated at two different world times
- **THEN** both evaluations return the identical position

#### Scenario: A gate's velocity is the zero vector
- **WHEN** a lane gate's velocity is evaluated at any world time
- **THEN** the result is the zero vector

#### Scenario: Evaluating a gate performs no division by its period
- **WHEN** a lane gate's position or velocity is evaluated
- **THEN** no division by the gate's period is performed, consistent with
  its non-positive stored period

### Requirement: A Gate Carries a Strictly Positive, Named Size
Every lane gate SHALL carry the configured constant `GateSize`, a strictly
positive size, so that `space.InsertionStandoff` derives a real docking
standoff for it rather than collapsing to the zero-size constant term.

#### Scenario: Every gate reports the configured gate size
- **WHEN** any lane gate's size is inspected
- **THEN** it equals the configured `GateSize` constant, strictly greater
  than zero

### Requirement: A Gate Sits Outside Every Generated Orbit
The system SHALL place every lane gate's continuous radius strictly greater than the
star-frame distance of every body in the same system's table that is not itself a
lane gate — including a body-parented one, whose star-frame distance is its parent's
radius plus its own local radius — so that a gate never sits among the planetary
disk. Every lane gate in one system SHALL carry the identical radius
(`Extent × GateRadiusFactor`), so gate distance carries no per-lane variance.

#### Scenario: A gate's radius exceeds every non-gate body's star-frame distance
- **WHEN** a table is built for a system with a generated skeleton
- **THEN** every lane gate's continuous radius is strictly greater than the maximum
  star-frame distance among every non-gate body in that table

#### Scenario: Every gate in one system shares the identical radius
- **WHEN** a table is built for a system with two or more materialized lanes
- **THEN** every one of its lane gates carries the identical continuous radius, with
  no per-lane variance

### Requirement: The Star Is the Table's Only Parentless Body
The system SHALL report the system's star as the only body in the table
with no orbital parent; every other body — planet, moon, belt member,
station, or lane gate — SHALL name a parent. The table SHALL expose the
star's identity and its size as `StarId()` and `StarSize()`, the inputs
`disclosure.World`'s star occlusion and `space.StarClearanceRadius` consume.

#### Scenario: Only the star has no parent
- **WHEN** every body in a built table is inspected
- **THEN** the star is the only one with no orbital parent

#### Scenario: The table reports the star's id and size
- **WHEN** `StarId()` and `StarSize()` are called on a built table
- **THEN** they return the star body's id and its strictly positive size

### Requirement: The Table Degrades to Fewer Bodies Rather Than a Failed Build
A failure reading the station store while building a table SHALL result in
that table omitting only the station, with every other body present. A
failure reading the live lane set while building a table SHALL result in
that table omitting only lane gates, with every other body present. A
failure reading the system's interior SHALL fail the build entirely — the
table has no partial-interior state to degrade to.

#### Scenario: A station-store outage omits only the station
- **WHEN** the station store is unavailable while a table is built for a
  system that would otherwise carry a station
- **THEN** the build succeeds, omitting only the station from the resulting
  table

#### Scenario: A lane-set read failure omits only lane gates
- **WHEN** the live lane set cannot be read while a table is built
- **THEN** the build succeeds, omitting only lane gates from the resulting
  table

#### Scenario: An interior read failure fails the build
- **WHEN** the system's interior cannot be read while a table is built
- **THEN** the build fails with an error, and no table is produced

#### Scenario: An interior predating this capability fails the build
- **WHEN** a table is built for a system whose persisted interior has no
  stored extent, or a non-positive one
- **THEN** the build fails with a named error, and no table — partial or
  otherwise — is produced

### Requirement: A Table Refuses to Build Without a Positively-Sized Star
The system SHALL fail a `BodyTable` build with an error, producing no table,
when the system's interior yields no star body or yields a star whose size is
not strictly positive — the same fail-closed treatment an unreadable interior
receives, and never a table reporting a zero or negative `StarSize()`. A
non-positive star size SHALL NOT be substituted with a default, because the
star is the only occluder every disclosure predicate resolves through, and a
zero-sized occluder blocks nothing.

#### Scenario: An interior whose star carries no size fails the build
- **WHEN** a table is built over a stored interior whose star feature has no
  continuous size (a size of zero), such as one persisted before continuous
  elements existed
- **THEN** the build fails with an error, no table is produced, and the
  failure is recorded with the system id

#### Scenario: An interior with no star feature fails the build
- **WHEN** a table is built over an interior from which no star body resolves
- **THEN** the build fails with an error and no table is produced

#### Scenario: A built table always reports a strictly positive star size
- **WHEN** `StarSize()` is called on any successfully built table
- **THEN** the returned size is strictly greater than zero

### Requirement: A Table Contains No Body With a Non-Positive Size
A successfully built table SHALL contain no body — star, interior feature,
belt member, station, or lane gate — whose size is not strictly positive.
Every family that composes a table SHALL therefore carry a named, strictly
positive size by construction: the star per its own fail-closed rule above,
every interior feature per `system-interior`'s "Interiors Emit Continuous
Orbital Elements For Every Body," every belt member per its own drawn size
range, the station per its configured constant, and every gate per
`GateSize`.

#### Scenario: No body in a successfully built table has a non-positive size
- **WHEN** every body in a successfully built table is inspected
- **THEN** each one's size is strictly greater than zero

### Requirement: Every Body a Built Table Contains Resolves Through space.Position
The system SHALL guarantee that every body a successfully built table
returns from `Body` or enumerates through `Ids()` resolves through
`space.Position` with no error, at any world time — no body in a built
table SHALL name an orbital parent absent from that same table. A cascaded
omission (`system-interior`'s "A Feature Omission Cascades to a Fixpoint
Through the Parent Chain") SHALL preserve this invariant rather than
weaken it: dropping an ancestor SHALL also drop every descendant that would
otherwise dangle.

#### Scenario: Every body in a built table resolves with no error
- **WHEN** every body in a successfully built table, across a swept set of
  generated seeds, is resolved through `space.Position`
- **THEN** every resolution succeeds with no error

#### Scenario: A cascaded omission never leaves a dangling body in the table
- **WHEN** a table is built for an interior whose decode-time cascade
  dropped one or more descendants of an omitted feature
- **THEN** none of those dropped descendants appear in the built table,
  and every body that does appear still resolves through `space.Position`
  with no error

### Requirement: Lane-Gate Derivation Cost Is Bounded Independent of Galaxy Size
The system SHALL derive a system's lane-gate bodies by reading only that
system's own record and the systems adjacent to it via a materialized lane,
reading neither the full materialized galaxy nor any system outside that
neighbourhood, so that the cost of deriving one system's gates is bounded by
that system's own incident-lane count and does not grow as the galaxy's
materialized set grows.

#### Scenario: Gate derivation reads only the system's neighbourhood
- **WHEN** a system's lane gates are derived for a `BodyTable` build
- **THEN** only that system and the systems directly reachable from it via
  a materialized lane are read, regardless of how many other systems are
  materialized in the galaxy

#### Scenario: Gate derivation cost does not grow with galaxy size
- **WHEN** a system's lane gates are derived in a galaxy that has
  materialized many more systems than are adjacent to this one
- **THEN** the number of systems and lanes read depends only on this
  system's own incident lanes, not on the galaxy's total materialized
  system count

#### Scenario: Gate identity and order are unaffected by galaxy size
- **WHEN** the same system's lane gates are derived once against a small
  materialized galaxy and once against a much larger one containing that
  system and its neighbours unchanged
- **THEN** the derived gate ids and their order are identical between the
  two derivations

### Requirement: A Degraded Build Is Recorded Distinguishably From Genuine Absence
A `BodyTable` build that omits its station or its lane gates under
*The Table Degrades to Fewer Bodies Rather Than a Failed Build* SHALL
produce a record naming the system id and which source was omitted
(station or lane gates), independent of the table's own return value —
since neither omission surfaces as an error from `Body`/`Ids`. A system
whose live lane set was read successfully and is legitimately empty SHALL
NOT produce such a record, so that a degraded build is countable and
attributable per system and per cause, distinguishable from a system that
genuinely carries no station or no lanes yet.

#### Scenario: A station-store degradation is recorded with its system id
- **WHEN** a `BodyTable` build omits its station because the station store
  is unavailable
- **THEN** a record exists naming the system id and identifying the
  station as the omitted source

#### Scenario: A lane-set degradation is recorded with its system id
- **WHEN** a `BodyTable` build omits its lane gates because the live lane
  set could not be read
- **THEN** a record exists naming the system id and identifying lane gates
  as the omitted source

#### Scenario: A genuinely gate-less system produces no degradation record
- **WHEN** a `BodyTable` is built for a system whose live lane set was read
  successfully and is empty
- **THEN** no degradation record is produced for that build, distinguishing
  a real zero-lane system from a read failure

#### Scenario: A lane-set read failure is whole-system, not per-lane
- **WHEN** the live lane set read fails for a system with more than one
  materialized lane
- **THEN** every lane gate for that system is omitted, not only the gate
  for the lane whose neighbour read failed

### Requirement: The Body Table Is an Unfiltered Internal Seam, Never a Response
The body table SHALL be an unfiltered, requester-agnostic view of a system:
it resolves every body the system contains, including features the requester
has never observed and lane gates toward systems the requester has not
charted. It SHALL NOT be serialized into any response, in whole or in part.
A consumer building a response SHALL serve every body's position, id, count,
and any aggregate over the table **unfiltered** — no per-requester band,
tier, or charted-knowledge filter is computed over body geometry or
identity, per `system-interior`'s "Bodies Are Public; Ships Are Disclosed"
(`replace-observation-with-sightings`). The one value a consumer resolves
through the table that SHALL NOT be served unfiltered is **foreign ship
presence**: a consumer serving ship positions SHALL project them through
`proximity-disclosure`'s per-requester disclosure filter before
serialization, never emitting the table's own ship-position view directly.
No field of any response SHALL be derived from the table except through
that ship-presence filter or the unfiltered-body rule above.

#### Scenario: The table carries bodies the requester could not see
- **WHEN** a table is built for a system in which a requester has neither
  coverage nor memory of some features, and has no graph-tier knowledge of
  some lane destinations
- **THEN** the table still resolves every one of those bodies and every one of
  those gates, because it is not requester-scoped

#### Scenario: No response field is derived from the unfiltered table
- **WHEN** any response is built for a requester
- **THEN** every body's position, id, count, or aggregate taken directly
  from a body table is served unfiltered, per `system-interior`'s "Bodies
  Are Public; Ships Are Disclosed"
- **AND** the only value the response derives from the table through a
  per-requester filter is foreign ship presence, projected through
  `proximity-disclosure` before serialization

### Requirement: A Body-Table Build Materializes Nothing
The system SHALL treat a `BodyTable` build as a pure read of the galaxy:
building a table SHALL NOT create or modify any galaxy system, lane, or
block-anchor document, and SHALL derive lane gates from whatever lanes are
materialized at the moment of the build. A build SHALL succeed when
performed from inside an action-resolve transaction, issuing no galaxy write
of its own. The interior create-if-absent required by this capability's
*One Table Resolves Every Body In a System, Absence Never An Error* is
unaffected and is not a galaxy write.

#### Scenario: A build at an unmaterialized frontier creates no galaxy documents
- **WHEN** a table is built for a system whose lane horizon is not fully
  materialized
- **THEN** no galaxy system, lane, or block-anchor document is created, and
  the table's gate set reflects only the lanes materialized at build time

#### Scenario: A build from inside a resolve transaction issues no galaxy write
- **WHEN** a table is built from inside an action-resolve transaction for a
  system whose interior is already materialized
- **THEN** the build succeeds and creates or modifies no galaxy system,
  lane, or block-anchor document


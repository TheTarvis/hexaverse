## MODIFIED Requirements

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

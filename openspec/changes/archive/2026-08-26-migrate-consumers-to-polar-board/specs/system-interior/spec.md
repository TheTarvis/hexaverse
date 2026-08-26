## MODIFIED Requirements

### Requirement: Lazy, Deterministic Interior Generation
The system SHALL generate a system's interior deterministically from the
per-system seed (`galaxy.SystemSeed(gallaxySeed, systemId)`), the system's
graph-tier region (as its character dial), and its galaxy-tier skeleton: a
fixed star feature at the centre, one orbiting feature per skeleton body
(extending, never contradicting, the skeleton), and additional detail
(extra small bodies, belts, moons on gas giants, anomalies/ruins, hazards)
whose counts and resource richness are dialed by the region's character.
Every generated angular position SHALL be drawn from the placement ring's
configured slot count under the interior's own schedule (per
`board-tactical-math`'s Slot Schedule Shape), never from a fixed per-ring
count derived from the ring index — so every slot on a ring is a reachable
placement and no ring carries an unplaceable arc. A system's trading
station, when one exists, is NOT part of this deterministic generation: it
is provisioned independently by the `trading-station` capability (as a
spawn asset-healing step, not interior materialization), so this
requirement's determinism and create-if-absent guarantees make no claim
about a station's presence, position, or timing — a system may materialize
its interior with no station, gain one later at spawn, or (for a non-home
system) never carry one.

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

#### Scenario: Placement reaches every slot on a ring whose slot count exceeds six times its ring index
- **WHEN** interiors are generated across many seeds and the slots occupied
  on a ring whose configured slot count is strictly greater than six times
  its ring index (e.g. ring 3 with 24 slots, ring 5 with 48) are collected
- **THEN** occupied slots appear at or above six times that ring index, not
  only below it — the draw spans the ring's full configured slot count

### Requirement: Lane Gate Projection
The system SHALL compute, for a given system and board radius, one lane
gate per lane touching that system: the cell on the outer rim where the
lane departs toward its neighbour, bearing-projected from the two systems'
galaxy coordinates via the same projection the fleet domain uses to compute
a departure gate, so the rendered gate and the cell a fleet actually departs
from are the same cell. Gates SHALL be returned in a deterministic order
(sorted by destination system id).

#### Scenario: Every incident lane produces one gate
- **WHEN** lane gates are computed for a system touched by N lanes
- **THEN** exactly N gates are returned, each naming the correct neighbour
  system id

#### Scenario: Unknown system
- **WHEN** lane gates are requested for a system id not present in the live
  galaxy
- **THEN** the call fails with `ErrNotFound`

### Requirement: Orbital Period Read from Live Tuning
The system SHALL NOT persist a feature's orbital period; every read SHALL
fill it from the live tuning function `PeriodFor(ring)` at read time, so
retuning orbit pacing changes the pace of every already-materialized system
on its next read, while the generator's random ring, start angle, and
direction stay fixed at generation time. `PeriodFor` SHALL remain linear in
ring index alone (`period = base × ring`), independent of how many angular
slots that ring carries. Because the polar lattice's slot schedule does not
assign a uniform slot count per ring (per `board-tactical-math`'s Slot
Schedule Shape), the world-time required to advance by one slot is NOT
uniform across ring bands even where two rings' assigned periods are close
in value — a ring carrying more slots than a neighbouring ring completes
each individual slot-step faster for the same period. This non-uniformity
is an accepted consequence of keeping the orbital period law linear in ring
index; it is not retuned by this requirement and SHALL NOT be treated as a
defect.

#### Scenario: A retune changes an existing feature's period on next read
- **WHEN** a feature's interior was generated under one orbital-period
  tuning and the tuning is subsequently changed
- **THEN** the next read of that feature reflects the new period, with its
  stored ring, angle0, and direction unchanged

#### Scenario: Equal-period rings with different slot counts advance slots at different rates
- **WHEN** two features sit on different rings whose configured slot counts
  differ, and each is assigned the period `PeriodFor(ring)` for its own ring
- **THEN** the world-time required for each feature to advance by one slot
  differs between the two rings, even where the two rings' assigned periods
  are close in value
- **AND** this difference is accepted as a consequence of keeping the
  orbital period linear in ring index, not treated as a defect to correct

## ADDED Requirements

### Requirement: Interior Feature Decode Validates Ring Against the Live Schedule
The system SHALL validate every decoded interior feature's ring against
the live schedule's maximum ring at the interior read boundary, before any
lattice computation consumes it, omitting and recording any feature that
fails this check rather than failing the read, so that a reduction of the
configured board radius cannot turn one bad stored feature into a
permanent failure of every corporation's read of that system.

#### Scenario: A stored feature outside the live board radius is rejected at the boundary
- **WHEN** an interior is read whose stored feature carries a ring
  exceeding the live schedule's maximum ring
- **THEN** that feature is omitted from the read and the rejection is
  recorded with the offending feature id and ring, no lattice computation
  is performed on that coordinate, and the remaining features are served
  normally

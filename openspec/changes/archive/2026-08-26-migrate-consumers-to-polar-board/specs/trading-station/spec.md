## MODIFIED Requirements

### Requirement: Deterministic, Non-Core, Off-Gate-Ring, Prograde, Orbiting Placement
A station's board position SHALL be derived deterministically from its
system id and the live galaxy's seed, and no other volatile input: its
orbital ring, initial slot index, period, and direction SHALL be generated
identically on every derivation (including a healed re-placement), SHALL
never place it at the core, and SHALL never place its orbit on that
system's lane-gate ring. The initial slot index SHALL be drawn from the
derivation ring's configured slot count under the pinned production
schedule (per `board-tactical-math`'s Slot Schedule Shape), not from a
fixed per-ring count, so the number of candidate positions on a given ring
follows the same schedule every other orbiting feature on that ring uses.
Its direction SHALL NOT be rolled independently: it SHALL equal the
system's dominant orbital direction — the direction every disk-born feature
of that system's interior shares (`system-interior`'s "Coherent Orbital
Direction") — computed as a pure function of the per-system seed, never by
reading the materialized interior or the station store. The station SHALL
orbit — it is not a fixed, non-moving feature — riding the same
`board.OrbState` resolution any other orbiting feature uses, so a docked
fleet's position and any burn-intercept solve against it use the existing
orbiting-feature code path with no new intercept case (see design.md
Decision 4; this reverses an earlier "fixed, not orbiting" draft of this
requirement).

#### Scenario: A healed re-derivation lands on the same orbit
- **WHEN** a station's position is re-derived for the same system id (e.g.,
  during a healed partial spawn)
- **THEN** the resulting orbital ring, initial slot index, period, and
  direction are identical to the originally provisioned ones

#### Scenario: The position is never the core
- **WHEN** a station's position is derived for any system id
- **THEN** its orbit is never centered on or degenerate to the core cell
  `{ring 0, slot 0}`

#### Scenario: The orbit never lies on the lane-gate ring
- **WHEN** a station's position is derived for any system id
- **THEN** its orbital ring never coincides with that system's configured
  lane-gate ring

#### Scenario: The station orbits prograde with its system's disk
- **WHEN** a station's orbit is derived for any system
- **THEN** its direction equals that system's dominant orbital direction —
  the same direction the interior's skeleton bodies, belts, and hazards
  share

## ADDED Requirements

### Requirement: A Station Orbit Outside the Live Board Radius Is Omitted, Never Panicked
The system SHALL validate a station's stored orbital ring against the
live schedule's maximum ring before any lattice computation consumes
it — including the interior splice that shapes the station as a board
feature, which runs ahead of the interior's own feature-decode
validation and is not governed by it. A station whose stored ring
exceeds the live maximum SHALL be omitted and recorded, preserving this
capability's degrade-to-no-station behavior, never surfacing as a panic
or as a failed interior read.

#### Scenario: A stored station orbit outside the live board radius is omitted, not panicked
- **WHEN** a station's stored orbit is read for the interior splice, a
  dock resolution, or a sale, and its ring exceeds the live schedule's
  maximum ring
- **THEN** the station is omitted from the read and the rejection is
  recorded with the system id and the offending ring
- **AND** no lattice computation is performed on that orbit, and the
  interior read still succeeds
- **AND** a fleet docked to the omitted station reports the same
  missing-feature outcome any omitted feature produces — never a position
  at the core, and never a panic

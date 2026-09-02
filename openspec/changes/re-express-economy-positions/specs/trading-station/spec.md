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
orbit — it is not a fixed, non-moving feature. A docked fleet's position
and any burn-intercept solve against the station SHALL resolve through the
same continuous path every other orbiting body uses (`space.StatePosition`
and `space.SolveBurn` against the system's body table, per
`fleet-movement`'s "Effective Position Resolution"), with no new intercept
case and no `board.OrbState` resolution. The
lattice ring/slot derivation this requirement defines is retained to
supply the board renderer's `Footprint` until the renderer is replaced;
no position, dock, or intercept predicate consumes it. Its one remaining
non-renderer consumer is this capability's own out-of-range omission
check ("A Station Orbit Outside the Live Board Radius Is Omitted, Never
Panicked"), which is retired alongside the derivation at link 8/9.

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

### Requirement: Station Is a Dockable, Non-Mineable Board Feature
A system's station SHALL appear in that system's board feature set as a
dockable target a burn order may target and a fleet may dock to; a mine
command naming the station SHALL be rejected. Dock resolution for the
station SHALL run through the same body-attachment check every other dock
target uses — a burn order settling into a park at the station's position
sets the fleet's stored `attachedTo` to the station's id (per
`fleet-movement`'s "Every Body In the System's Body Table Is a Valid
Attachment Host") — and SHALL compute no board-cell co-location or lattice
adjacency predicate of its own; a fleet merely parked near or coincident
with the station's position without a matching `attachedTo` is not docked
to it.

#### Scenario: A burn order to the station resolves to docked
- **WHEN** a fleet is ordered to burn to the station's feature id
- **THEN** the fleet's state becomes `docked` to the station

#### Scenario: A docked fleet rides the station's live orbital position
- **WHEN** a fleet's effective state is `docked` to a station
- **THEN** its resolved position is the station's live continuous orbital
  position at the current world time, resolved through
  `space.StatePosition` via the fleet's attached host — the same path
  `fleet-movement`'s "Effective Position Resolution" resolves any docked
  fleet's position through — computing no `board.OrbState` or other
  lattice resolution

#### Scenario: A mine command against the station is rejected
- **WHEN** a mine command names the station's feature id as its target
- **THEN** the command is rejected with a distinguishing reason, and no
  action is created

#### Scenario: Docking to the station involves no lattice predicate
- **WHEN** a fleet's burn order resolves it into `docked` state at a
  station
- **THEN** that resolution passes through the same `Fleet.AttachedTo`
  attachment write and read every other dock target uses, computing no
  board-cell co-location test and no lattice adjacency check of its own

## MODIFIED Requirements

### Requirement: Per-System Body Skeleton
The system SHALL roll a deterministic major-body skeleton (star class,
1..N bodies at distinct orbital ring indices in `[0, MaxRings)`) for every
system from a per-system seed derived via `SystemSeed(gallaxySeed, systemId)`
(FNV-1a hash of the galaxy seed followed by the system id), independent of
the system's region. A body's ring index is an **ordinal orbital position
ascending outward** — the ordering input a continuous orbital radius (per
`system-interior`) derives from — never itself a lattice ring or a
distance; the skeleton fixes only this relative ordering, and any absolute
placement (a lattice ring, a continuous radius, or otherwise) is a separate
downstream derivation from it. Inner rings SHALL bias toward rocky/molten
bodies and outer rings toward gas-giant/ice bodies. Rocky, ice, barren, and
molten bodies SHALL be marked mineable; gas giants and oceanic bodies SHALL
not.

#### Scenario: Skeleton is reproducible from the per-system seed
- **WHEN** a system's skeleton is re-rolled directly from
  `SystemSeed(galaxySeed, systemId)` and the same params
- **THEN** the result is identical to the skeleton stored on that system
  during galaxy generation

#### Scenario: Rings are distinct and ascending
- **WHEN** a system's skeleton is generated
- **THEN** its bodies' ring indices are strictly ascending with no repeats

#### Scenario: Every system has a star class and at least one body
- **WHEN** a galaxy is generated with `MinBodies >= 1`
- **THEN** every system has a non-empty star class and at least one body

## REMOVED Requirements

### Requirement: One Starting Hull at a Deterministic Rim Position

**Reason**: Superseded by "One Starting Hull at a Deterministic Home Park" —
the rim-ring `board.Cell` this requirement seeds onto is not a fleet's
stored shape after this change (design.md Decision 4); `fleet.SeedFleet` now
places a continuous-space park and rejects a position inside the home
system's star clearance, not the literal core cell (see `fleet-movement`'s
"Spawn Fleet Seeding Places a Park"; design.md Decision 14). The exact
geometric target — a park orbiting the star, a park at a specific body, or
docked at the home station — is an open question this change does not
settle (design.md Open Question 3).

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: One Starting Hull at a Deterministic Home Park

The system SHALL, on fresh spawn, seed exactly one fleet for the new
corporation in its chosen home system via `fleet.SeedFleet`, parked at a
position deterministic from the account id, so a healed retry places the
hull at the same position — never re-seeding a second hull for an account
whose corporation already has one (see "Spawn Asset Healing").

#### Scenario: The starting hull is deterministic per account

- **WHEN** a fresh spawn seeds the starting hull for an account
- **THEN** its position derives deterministically from that account id, so a
  later healing retry for the same account reproduces the identical position

#### Scenario: The starting hull never lands inside the star's clearance

- **WHEN** a starting hull is seeded
- **THEN** its position lies outside the home system star's configured
  clearance radius

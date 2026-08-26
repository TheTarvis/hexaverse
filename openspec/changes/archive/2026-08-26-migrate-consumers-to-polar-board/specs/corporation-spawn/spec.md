## MODIFIED Requirements

### Requirement: One Starting Hull at a Deterministic Rim Position
The system SHALL, on fresh spawn, seed exactly one fleet for the new
corporation in its chosen home system, coasting at a deterministic cell on
the rim ring (one ring inside the lane-gate ring) derived from the
account id, so a healed retry places the hull at the same position.

#### Scenario: The starting hull never lands on the core
- **WHEN** a starting hull is seeded
- **THEN** its position is a rim-ring cell, never the core cell
  `{ring 0, slot 0}`

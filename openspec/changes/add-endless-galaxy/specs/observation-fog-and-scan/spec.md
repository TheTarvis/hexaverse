# Observation, Fog & Scan — Delta: The Endless Galaxy

## MODIFIED Requirements

### Requirement: Scan Resolution Mints the Reveal
The system SHALL, when a scan action resolves and the fleet is still in the
scan's origin system (the fizzle test gates materialization), first ensure
the scanned system's full lane horizon — the 3×3 window of blocks centered
on the scanned system's block, plus the far-endpoint block of every bridge
lane incident to the scanned system — is materialized from the
deterministic star field (create-if-absent; a no-op when already
persisted), then evaluate
the sweep at the action's frozen effect time: mint a board-tier feature
observation (geometry always; scanned composition/threat detail) for every
feature in the origin system with clear line of sight from the pinned
emission hex (occluders evaluated at the effect time), chart every lane
incident to the scanned system as `scanned`, and rumor each such lane's
far-endpoint system to at least `rumored` (never downgrading, never granting
`surveyed`, and never granting any graph tier to the scanned system itself
from a scan). A scan SHALL never report a false dead end: the lanes it
charts are the system's true incident lanes in the field, whether or not
they were persisted before the scan resolved.

#### Scenario: A scan at the materialized frontier discovers onward roads
- **WHEN** a scan resolves on a system whose onward field neighbors are not
  yet materialized
- **THEN** those neighbors and the incident lanes are materialized and then
  charted and rumored exactly as if they had been persisted all along

#### Scenario: A scan on a system near a block corner charts its cross-corner lanes
- **WHEN** a scan resolves on a system near its block's corner, with an
  incident lane whose far endpoint lies in a diagonally adjacent block
- **THEN** that diagonal block is within the materialized horizon and the
  cross-corner lane is charted with its far endpoint persisted and rumored
  (never a lane to a nonexistent node)

#### Scenario: A scan on a bridge endpoint charts the bridge, far side included
- **WHEN** a scan resolves on a system with an incident bridge lane whose
  far endpoint lies beyond the 3×3 block window (skipping empty blocks)
- **THEN** the bridge's far-endpoint block is materialized as part of the
  ensured horizon and the bridge is charted with its far endpoint persisted
  and rumored, exactly like an ordinary lane

#### Scenario: Only line-of-sight-clear features are minted
- **WHEN** a scan resolves
- **THEN** every feature with clear line of sight from the emission hex at
  the effect time is minted with its geometry and composition, and features
  in shadow are not minted

#### Scenario: Every incident lane is charted regardless of occlusion
- **WHEN** a scan resolves on a system with lanes
- **THEN** every lane incident to that system is charted `via: scanned`,
  and lanes whose far endpoint is below `rumored` are upgraded to
  `rumored` — lane detection is never occluded by line of sight

#### Scenario: A scan grants no graph tier to its own system
- **WHEN** a scan resolves
- **THEN** the scanned system's own graph tier for the requester is
  unchanged by the scan (only feature/lane records are minted)

#### Scenario: A scan fizzles if the fleet left the origin system
- **WHEN** a scan resolves and the fleet's system id at resolve time no
  longer matches the system the scan was fired from
- **THEN** the resolve records an interrupted outcome and mints nothing —
  and materializes nothing

#### Scenario: A scan resolved late still mints as of its frozen ETA
- **WHEN** a scan resolves well after its ETA has passed
- **THEN** the minted observations are stamped `asOf` the scan's ETA and
  reflect feature/occluder positions computed at that ETA, not at the
  actual (later) resolve instant

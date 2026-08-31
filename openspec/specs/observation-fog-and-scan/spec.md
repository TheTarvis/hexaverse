# Observation Fog and Scan Specification

## Purpose
Owns per-Corporation fog of war: the monotonic knowledge ladder over the
galactic graph, the live sensor coverage (passive ambient bubbles plus a
running scan's growing echo disc) every board read projects through, and
the reveal writers (scan resolution, path-swept ambient-on-move, travel
arrival) that mint what a corporation remembers. Fog reveals and remembers;
it never spoils. This is the fog-filter service every fogged read
(`galaxy-generation`, `system-interior`, `fleet-movement`) calls — never a
client-side hide.
## Requirements
### Requirement: Monotonic Graph-Tier Knowledge Ladder
The system SHALL record each corporation's graph-tier knowledge of a system
as one of four tiers — `starVisible` (the free baseline, never stored),
`rumored`, `surveyed` (reserved; no code path in this capability writes
it), `explored` — and SHALL never lower a stored tier: any write takes the
maximum of the stored and incoming tier.

#### Scenario: A system with no stored observation is star-visible
- **WHEN** a corporation's tier for a system with no stored observation is
  queried
- **THEN** it reports `starVisible`

#### Scenario: A lower-tier write never downgrades a higher stored tier
- **WHEN** a system already has a stored `explored` observation for a
  corporation and a `rumored` write is applied for the same system
- **THEN** the stored tier remains `explored`

#### Scenario: A higher-tier write upgrades the stored tier
- **WHEN** a system has a stored `rumored` observation for a corporation
  and an `explored` write is applied for the same system
- **THEN** the stored tier becomes `explored`

### Requirement: Travel Arrival Reveal
The system SHALL, when a lane-transit trip resolves, mark the destination
system `explored` and chart the lanes actually crossed on the trip as
`via: traveled` — and SHALL NOT chart or rumor any onward lane from the
destination (finding further roads is a scan's job, not arrival's).

#### Scenario: Arrival explores the destination and charts crossed lanes only
- **WHEN** a lane-transit trip resolves into a destination system
- **THEN** the destination's graph tier for the traveling corporation
  becomes (at least) `explored`, and only the lanes the trip actually
  crossed are charted — no other lane incident to the destination is
  charted or rumored by this reveal

### Requirement: Spawn Arrival Reveal
The system SHALL provide a non-action reveal write (`RevealArrival`) that
marks a corporation's home system `explored` and charts no lanes, used by
spawn (waking up counts as arriving), idempotent under a repeated call.

#### Scenario: Spawn arrival explores home with no lanes charted
- **WHEN** a corporation's spawn arrival reveal is written for its home
  system
- **THEN** the home system's tier becomes `explored` and no lane is
  charted

### Requirement: Charted-Lane Set Projection
The system SHALL expose, for a corporation, the set of lane ids it has
charted (via travel or scan) — the presence of a charted-lane record IS
"charted"; there is no derived incidence rule based on system tier.

#### Scenario: An explored system with no charted lane grants none
- **WHEN** a corporation has a system at tier `explored` but has never
  traveled or scanned it (e.g. a dev-seeded starting position)
- **THEN** its charted-lane set contains none of that system's incident
  lanes

## Notes for future maintainers

- `surveyed` is reserved for a future market/purchased-intel feature — no
  writer in this capability ever mints it; a spec or code change that adds
  a `surveyed` writer belongs to a future change, not a reading of current
  behavior.
- The `observation.DaoImpl.UpsertFeatureObservation` direct-write path
  (used by `MintScan` and tests, not the production resolve path) performs
  a full `Set`, not a field merge — unlike the production scan/ambient
  resolve writes, which apply via `MergeAll` inside the action resolve
  transaction and so can layer ambient presence onto existing scanned
  detail without clobbering it. A caller of the direct DAO path could
  therefore overwrite a feature's previously scanned `Detail` with a
  presence-only write. **Suspected defect** (or at least a latent
  footgun) — see the report.

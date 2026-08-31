## Purpose
Owns each corporation's map knowledge of the galactic graph — which systems
it has visited and which lanes it has charted — answering "what does this
corporation know about the galaxy graph," never "what can this corporation
currently see." This capability is the rehomed survivor of
`observation-fog-and-scan`'s four live-model-era requirements: the graph
never carried the live-perception fog the continuous-space pivot deleted, so
its knowledge ladder, its charted-lane projection, and its two arrival
writers move here unchanged in substance rather than being deleted with the
package they used to live in. `proximity-disclosure` and `sighting-records`
own live perception and the persisted sighting pile respectively; this
capability's stored knowledge is never an input to either.

## ADDED Requirements

### Requirement: Monotonic System-Knowledge Ladder
The system SHALL record each corporation's knowledge of a system as one of
four tiers — `starVisible` (the free baseline, never stored), `rumored`,
`surveyed` (reserved; no writer in this capability mints it — it is the
future paid-intel-sale write), `explored` — and SHALL never lower a stored
tier: any write takes the maximum of the stored and incoming tier.

#### Scenario: A system with no stored knowledge is star-visible
- **WHEN** a corporation's knowledge tier for a system with no stored record
  is queried
- **THEN** it reports `starVisible`

#### Scenario: A lower-tier write never downgrades a higher stored tier
- **WHEN** a system already has a stored `explored` tier for a corporation
  and a `rumored` write is applied for the same system
- **THEN** the stored tier remains `explored`

#### Scenario: A higher-tier write upgrades the stored tier
- **WHEN** a system has a stored `rumored` tier for a corporation and an
  `explored` write is applied for the same system
- **THEN** the stored tier becomes `explored`

### Requirement: Charted-Lane Set Projection
The system SHALL expose, for a corporation, the set of lane ids it has
charted — the presence of a charted-lane record IS "charted"; there is no
derived incidence rule based on a system's knowledge tier.

#### Scenario: An explored system with no charted lane grants none
- **WHEN** a corporation has a system at tier `explored` but has never
  traveled its lanes, docked at one of its gates, or bought intel on them
- **THEN** its charted-lane set contains none of that system's incident
  lanes

### Requirement: Travel Arrival Knowledge Write
The system SHALL, when a lane-transit trip resolves, mark the destination
system `explored` and chart the lane actually crossed as `via: traveled`,
applied as part of the same resolve transaction that settles the trip's
motion so that the knowledge write and the arrival are never observably
separate.

#### Scenario: Arrival explores the destination and charts the crossed lane
- **WHEN** a lane-transit trip resolves into a destination system
- **THEN** the destination's knowledge tier for the traveling corporation
  becomes (at least) `explored`, and the lane the trip crossed is charted
  `via: traveled`
- **AND** no other lane incident to the destination is charted or rumored
  by this write

### Requirement: Spawn Arrival Knowledge Write
The system SHALL provide a non-action reveal write that marks a
corporation's home system `explored` and charts no lanes, used by spawn
(waking up counts as arriving), idempotent under a repeated call.

#### Scenario: Spawn arrival explores home with no lanes charted
- **WHEN** a corporation's spawn arrival reveal is written for its home
  system
- **THEN** the home system's tier becomes `explored` and no lane is charted

#### Scenario: Repeating the spawn arrival write is a no-op
- **GIVEN** a corporation whose home system is already `explored` with no
  lanes charted
- **WHEN** the spawn arrival reveal is written again for the same
  corporation and system
- **THEN** the home system's tier remains `explored` and the charted-lane
  set is unchanged

### Requirement: Gate-Attachment Knowledge Write
The system SHALL, when a fleet's movement state settles into an attached
park at a lane-gate body, chart that gate's lane for the fleet's
corporation as `via: gate`, computed without reading the destination
system's stored data.

#### Scenario: Docking at a gate charts its lane
- **WHEN** a fleet's burn resolves into an attached park at a lane-gate
  body
- **THEN** the lane that gate serves is charted `via: gate` for the fleet's
  corporation
- **AND** the destination system's own knowledge tier is unaffected by this
  write

#### Scenario: Attaching to a non-gate body charts nothing
- **WHEN** a fleet's burn resolves into an attached park at a body that is
  not a lane gate
- **THEN** no lane is charted by this write

### Requirement: A Knowledge Write Never Decides Live Disclosure
No stored system-knowledge tier, charted-lane record, or other knowledge
written by this capability SHALL be read, consulted, or otherwise used as
an input to a `proximity-disclosure` predicate. Live disclosure of a ship or
a body is decided entirely on its own terms; this capability answers a
different question and SHALL NOT be wired into the answer to that one.

#### Scenario: Explored knowledge does not disclose a foreign fleet
- **GIVEN** a corporation holding `explored` knowledge of a system
- **WHEN** a foreign fleet is parked in that system outside every live
  detection channel
- **THEN** the corporation does not see that fleet
- **AND** its stored knowledge tier for the system plays no part in that
  outcome

### Requirement: The Corporation's Visited-System Set Is the Spawn-Distance Input
The system SHALL expose, for spawn site selection, the union of every
living corporation's `explored`-tier systems, and spawn siting SHALL
measure its minimum-distance rule against that union and no other set.

#### Scenario: A corporation's explored systems count toward claimed space
- **GIVEN** a living corporation with one or more systems at tier
  `explored`
- **WHEN** spawn site selection computes the claimed-space set for a new
  corporation
- **THEN** every system at `explored` or above for the existing corporation
  is included in that set

#### Scenario: A corporation excludes its own systems when re-siting itself
- **GIVEN** a corporation undergoing a heal-time spawn re-pick
- **WHEN** the claimed-space set is computed for that same corporation
- **THEN** that corporation's own explored systems are excluded from the
  set its own re-pick is measured against

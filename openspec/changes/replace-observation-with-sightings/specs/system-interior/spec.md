## REMOVED Requirements

### Requirement: Interior Reads Are Fully Disclosed, A Deliberate Interim
**Reason**: Superseded — this requirement named itself a stated, temporary
interim pending link 5. Reading `proximity-disclosure` as shipped, its
successor is not a per-feature fog projection at all: every requirement in
that capability governs ships, never bodies (design.md Decision 4). The
replacement, "Bodies Are Public; Ships Are Disclosed", states full body
disclosure as the permanent rule for a stated reason instead of as a
placeholder awaiting one.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

### Requirement: Interior Read Endpoint Serves Unfogged Features
**Reason**: Superseded — its own name is no longer accurate once the
response also carries foreign-ship contacts and continuous position/size
(design.md Decision 6, Decision 26): the endpoint is no longer merely
"unfogged features," it is bodies-plus-contacts. Restated as "Interior Read
Endpoint" with the fuller response shape; both of this requirement's own
scenarios survive in substance under the new name.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

### Requirement: Charted Lane Gate Filtering
**Reason**: Superseded — design.md Decision 2 makes jump-eligibility a
matter of physical attachment to a gate body, never charted-lane state, and
Decision 5 draws the consequence: the information this filter protected (an
uncharted neighbour's existence) is not protected by anything else on the
galaxy read either, since every system's star already ships to everyone
unconditionally. Standing at a gate and reading its destination is the
intended shape of "finding the roads is a spatial problem, not a bookkeeping
one." `chartedGates`, `BoardFog`, and this endpoint's tier lookup are
deleted with it.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: Bodies Are Public; Ships Are Disclosed
The system SHALL serve every body of a materialized system's interior —
geometry, composition, threat detail, and (for a lane-gate body) its
destination system id — in full to every authenticated requester,
regardless of corporation, computing no per-requester band assignment and
omitting no body on the grounds of sensor coverage, scan history, or
charted knowledge. This is the permanent rule, not an interim: the star
field is already public astronomy at the galaxy tier
(`galaxy-generation`), and a system's bodies are its detail layer at the
same public altitude. Foreign ship presence is a wholly separate question,
governed entirely by `proximity-disclosure` and never by this requirement:
a body's own disclosure is unconditional and identical whether or not a
ship is masked at it, exactly as `proximity-disclosure`'s own masking
requirement demands of a host.

#### Scenario: An authenticated, spawned requester receives every body in full
- **WHEN** an authenticated, spawned requester reads a materialized
  system's interior
- **THEN** every body ships with its full geometry, composition, and
  threat detail, regardless of the requester's sensor coverage, scan
  history, or charted knowledge

#### Scenario: No body is omitted for lack of stored knowledge
- **WHEN** a body has never been visited, scanned, or otherwise recorded
  by the requester
- **THEN** it still ships in full rather than being omitted or reduced to
  astronomical-only detail

#### Scenario: The rule applies uniformly, corpless or not
- **WHEN** the interior read is served to any authenticated requester,
  whether spawned or corpless
- **THEN** the same full-body-detail response is served, with no
  per-requester band distinction computed over bodies

#### Scenario: A masked ship at a body changes nothing about that body's own disclosure
- **GIVEN** a foreign ship masked (docked) at a body in the system
- **WHEN** the interior read is served
- **THEN** the body's own fields are identical to what they would be if
  nothing were masked at it — the ship's masked state is a fact about the
  ship, never about the body hosting it

### Requirement: Interior Read Endpoint
The system SHALL serve `GET /v1/systems/:systemId`, returning the system's
radius, character, star class, current world time, every body (including
each lane-gate body, unfiltered by any charted-knowledge gate — see "Bodies
Are Public; Ships Are Disclosed"), and a `contacts` array reflecting the
requester's own live disclosure of foreign ship presence in that system
(see "Foreign Presence Is Served As System Contacts"). Every field already
served before this change — a body's lattice footprint, its `band` value
(always `"visible"`), and its `live` value (always `true`) — SHALL continue
to be served unchanged: this response is additive over its prior shape, not
a replacement of it, adding each body's continuous position and size and
the `contacts` array alongside what already shipped, never removing a field
a caller already reads.

#### Scenario: Unknown or ungenerated system
- **WHEN** `GET /v1/systems/:systemId` is called for a system id absent
  from the live galaxy
- **THEN** the response is `404 Not Found`

#### Scenario: No live galaxy
- **WHEN** `GET /v1/systems/:systemId` is called and no galaxy has been
  generated
- **THEN** the response is `404 Not Found`

#### Scenario: A materialized system's read carries every body's continuous position and size
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every body in the response, including each lane-gate body,
  carries a continuous position and a size, alongside its pre-existing
  lattice footprint

#### Scenario: Pre-existing wire fields are unchanged
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every body's `band` value is `"visible"` and `live` value is
  `true`, exactly as before this change, and every body still carries its
  lattice footprint

### Requirement: Foreign Presence Is Served As System Contacts
The system SHALL, on the interior read, compute the requester
corporation's live disclosure of foreign ship presence in that system as
`proximity-disclosure`'s union over the requester's own fleets present in
the system (`proximity-disclosure`: "Disclosure to a Corporation Is the
Union Over Its Own Assets"), deduplicated by target before inclusion, and
SHALL serve the result as a top-level `contacts` array alongside `features`
and `laneGates` — never folded into either. A contact carries no fleet id
(`proximity-disclosure`'s own `Contact` shape); a corporation with no
fleet present in the system, including an authenticated but corpless
requester, SHALL receive an empty `contacts` array. Each contact's wire
representation SHALL carry the `scanning` field alongside position,
velocity, and `emitting`, exactly as `proximity-disclosure`'s `Contact`
shape defines it (`Contact.Scanning`, see "A Sweep's Emission Radius Scales
With Its Range") — the serialization step from `Contact` to the wire SHALL
NOT drop it.

#### Scenario: Contacts reflect the requester's own union of observers
- **GIVEN** a requester corporation with one or more of its own fleets
  present in a system, and a foreign ship within at least one of those
  fleets' detection range
- **WHEN** the requester reads that system's interior
- **THEN** the foreign ship appears in the response's `contacts` array

#### Scenario: A target seen by more than one own fleet appears once in contacts
- **GIVEN** a requester corporation with two of its own fleets in a
  system, each independently within detection range of the same foreign
  ship
- **WHEN** the requester reads that system's interior
- **THEN** the foreign ship appears exactly once in `contacts`

#### Scenario: A corpless requester's contacts array is empty
- **WHEN** an authenticated but corpless requester reads a materialized
  system's interior
- **THEN** the response's `contacts` array is empty

#### Scenario: A foreign fleet outside every own fleet's detection range is absent from contacts
- **GIVEN** a requester corporation whose own fleets in a system do not
  detect a particular foreign ship present there
- **WHEN** the requester reads that system's interior
- **THEN** that foreign ship does not appear in `contacts`

#### Scenario: A contact's scanning state is served on the wire
- **GIVEN** a foreign ship disclosed as a contact, running a focused scan at
  the moment the interior is read
- **WHEN** the requester reads that system's interior
- **THEN** the corresponding entry in the response's `contacts` array
  carries `scanning: true`

### Requirement: Lane-Gate Bodies Carry Their Lane Id
The system SHALL serve, for every lane-gate body in a materialized
system's interior read, the stable id of the lane it serves (wire field
`laneId`), alongside — never replacing — that gate body's existing
`destSystemId` and `cell` fields, so a client can commit a jump
(`POST /v1/fleets/:fleetId/jump {laneId}`) by passing this value straight
through, with no second lookup and no client-side re-derivation of the id.
This id SHALL be the same id the jump endpoint accepts, and SHALL match
the id the server derives for the same crossing on either endpoint
(`galaxy.LaneIdBetween`, order-independent over the unordered system-pair,
is the single derivation both gate attachment and travel arrival already
agree on). This field SHALL be served regardless of the requester's
charted knowledge, exactly as the gate body itself is served regardless of
charted knowledge under "Bodies Are Public; Ships Are Disclosed": a fresh
corporation with no charted lanes still receives a usable `laneId` on
every gate body it reads.

#### Scenario: A materialized system's read carries each lane-gate body's lane id
- **WHEN** an authenticated requester reads a materialized system's
  interior
- **THEN** every lane-gate body in the response carries a **non-empty**
  `laneId` field alongside its `destSystemId` and `cell`

#### Scenario: The served lane id is the one the jump endpoint accepts
- **GIVEN** a lane-gate body's `laneId` from a system interior read
- **WHEN** that value is passed as `POST /v1/fleets/:fleetId/jump`'s
  `laneId` for a fleet attached to that gate
- **THEN** the server accepts it as naming that lane, with no additional
  lookup required of the client

#### Scenario: The served lane id matches the server's own derivation for the same crossing
- **GIVEN** a lane between two systems
- **WHEN** its id is derived via `galaxy.LaneIdBetween` for the crossing
  from either system's own gate-attachment or travel-arrival write
- **THEN** the id served on the corresponding lane-gate body in either
  system's interior read is identical to it

#### Scenario: A fresh corporation with no charted lanes still receives a usable lane id
- **GIVEN** a corporation with no charted lanes
- **WHEN** it reads a materialized system's interior
- **THEN** every lane-gate body in the response still carries its `laneId`,
  unfiltered by the corporation's charted knowledge

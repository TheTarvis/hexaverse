## REMOVED Requirements

### Requirement: Fleet Read Endpoints Serve Own Fleets Only
**Reason**: Superseded — a disclosed foreign fleet now reaches a client as
an anonymous contact on the system interior read (design.md Decision 6),
so this requirement's own claim that "this capability computes no partial
visibility for a foreign fleet" is no longer true and the temporary-interim
framing it carried (pending link 5) no longer applies. Restated under a
name that names the contact channel and states the own-fleets-only rule as
permanent (design.md Decision 7).
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

### Requirement: Lane Jump From a Docked Gate
**Reason**: Superseded — design.md Decision 2 drops the charted-lane
precondition entirely: jump-eligibility is exactly "attached to the
lane's own gate body, no dwell," so the "Jumping an uncharted lane is
rejected" scenario is no longer true and the commit scenario's own title
names "charted" as a precondition that no longer exists.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

### Requirement: Single Kinematic-State Fleet Record
**Reason**: Superseded — the focused-scan verb now claims and writes
`activeScanId`, and the fleet document gains a stored `Scan *ScanWindow`
field, when a sweep is running (design.md Decision 8, Decision 11), so
"The sensor channel persists declared and unwritten" is no longer true.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

### Requirement: Movement Command Endpoints Enforce No Fleet Ownership
**Reason**: Superseded — design.md Decision 21 closes this authorization
defect: every mutating fleet handler now compares `common.ActorCorp(c)`
against the fleet's `corporationId` and rejects a foreign requester, so
all five "a foreign corp can..." scenarios are no longer true.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: Fleet Read Endpoints Serve Own Fleets In Full and Foreign Fleets As Contacts
The system SHALL serve `GET /v1/fleets/:fleetId` (single fleet),
`GET /v1/fleets?systemId=` (every fleet in a system), and
`GET /v1/fleets?mine=true` (every fleet the requester's corporation owns,
across systems) as own-fleets-only endpoints, permanently: a requester's
own fleets SHALL always be returned in full, with their complete
kinematic state (curve/park/drift detail, target, ETA), regardless of any
other corporation's presence, and a fleet belonging to another
corporation SHALL be omitted entirely from a list read and SHALL 404 on a
direct fetch by id. These endpoints compute no partial-visibility
snapshot of a foreign fleet and never will, because a foreign fleet has
no addressable identity for this capability to serve one against
(design.md Decision 6, Decision 7). A disclosed foreign fleet's presence
reaches a requester exclusively through the system interior read's
anonymous contact projection, never through a fleet endpoint; a contact
carries no fleet id, so there is no id a direct fleet fetch could ever
resolve.

#### Scenario: A foreign fleet is omitted from a list read
- **WHEN** a requester lists fleets in a system that contains a fleet
  belonging to another corporation
- **THEN** that foreign fleet does not appear anywhere in the response,
  disclosed or not — its disclosed presence, if any, surfaces only as a
  contact on the system interior read

#### Scenario: A foreign fleet 404s on a direct fetch
- **WHEN** a requester fetches a specific fleet id belonging to another
  corporation
- **THEN** the response is `404 Not Found`, because a foreign fleet has
  no id this capability will resolve, whether or not that fleet is
  currently disclosed as a contact elsewhere

#### Scenario: Own fleets are always returned in full
- **WHEN** a requester fetches or lists their own fleets
- **THEN** every one is returned with `own: true` and its full kinematic
  state, regardless of any other corporation's presence or activity

#### Scenario: mine=true with no corp returns an empty list
- **WHEN** an authenticated but corpless requester calls
  `GET /v1/fleets?mine=true`
- **THEN** the response is an empty fleet list, not an error

### Requirement: Lane Jump From an Attached Gate
The system SHALL, on a jump order naming a lane, accept the order only
when the fleet is attached to the gate body for that lane — charting
plays no part in eligibility (design.md Decision 2; charted-lane state is
map knowledge and a sellable intel product, never a permission). A fleet
SHALL be jump-eligible on the same world millisecond it attaches to a
gate — no dwell time is imposed. The system SHALL commit the jump through
the action spine on the movement channel, with an ETA of the current
world time plus the lane's crossing time (derived from the lane's 3D
length and the fleet's configured lane rate), replacing any active
movement order.

#### Scenario: Jumping from an attached gate commits
- **WHEN** a fleet attached to a lane's gate body is ordered to jump that
  lane
- **THEN** the jump commits on the movement channel with an ETA equal to
  now plus the lane's crossing time

#### Scenario: A fleet is jump-eligible the instant it attaches, with no dwell
- **WHEN** a fleet's burn resolves into attachment at a lane's gate body,
  and a jump order for that lane is submitted at that same resolve
  instant
- **THEN** the jump is accepted — no minimum dwell duration is enforced
  between attaching and jumping

#### Scenario: Jumping without attachment to the named gate is rejected
- **WHEN** a fleet not attached to the lane's gate body is ordered to
  jump that lane
- **THEN** the order fails with a named error and no action is committed

#### Scenario: Jump costs no delta-v
- **WHEN** a jump is committed and later resolves
- **THEN** no delta-v is debited for the crossing — only time is spent

### Requirement: Fleet Read Serves the Attached Gate's Lane Id
The system SHALL, on `GET /v1/fleets/:fleetId`, `GET /v1/fleets?systemId=`,
and `GET /v1/fleets?mine=true`, include a `laneId` field on an owned
fleet that is attached to a lane-gate body, naming that gate's lane id
(`galaxy.LaneIdBetween` of the fleet's current system and the gate's
destination system — the same id `system-interior`'s *Lane-Gate Bodies
Carry Their Lane Id* serves on that gate body), from a source neither
filtered by nor derived from the corporation's charted-lane set. The
field SHALL be absent or empty when the fleet is not attached to a
lane-gate body.

#### Scenario: An attached fleet's read carries its gate's lane id
- **GIVEN** a fleet attached to a lane-gate body
- **WHEN** that fleet is read via any of the fleet read endpoints
- **THEN** the response includes `laneId` naming that gate's lane id,
  with no dependency on the corporation's charted-lane set

#### Scenario: An unattached fleet's read carries no lane id
- **WHEN** a fleet with no `attachedTo` set is read
- **THEN** the response's `laneId` field is absent or empty

### Requirement: Single Kinematic-State Fleet Record With Two Action Channels
The system SHALL represent each fleet as one document carrying a
`space.ShipState` (burn, park, or drift — see `space-kinematics`) as its
kinematic-state field, plus a separate `jump` field (fleet-owned, see
"Lane Jump From an Attached Gate") that is non-nil only while the fleet
is in lane transit. While `jump` is non-nil, the stored `space.ShipState`
is stale and SHALL NOT be evaluated by any reader — a fleet is in exactly
one of the two regimes, kinematic or in-transit, at a time, never both
live. The document SHALL also carry a `corporationId`, its current
`systemId`, an optional `attachedTo` host id, and at most one active id
per action channel: `activeActionId` for movement, `activeScanId` for the
sensor channel, independently claimable and releasable. The sensor
channel SHALL be a fully live channel in this capability: the fleet
document SHALL carry a `Scan *ScanWindow` field (`HostId`, `DepartMs`,
`ArriveMs`, `Range`), non-nil only while a focused scan is running and
cleared at that scan's resolve, mirroring `jump`'s own field-for-field
shape and lifecycle. A fleet document whose stored kinematic state does
not decode to one of the three `space.ShipState` shapes, when `jump` is
not set, SHALL be rejected by name — never defaulted to an origin
position or an idle park.

#### Scenario: A running sweep writes its window to the sensor channel
- **GIVEN** a fleet with no running focused scan
- **WHEN** a focused scan is committed against a host
- **THEN** the fleet document's `activeScanId` and `Scan` window are both
  written non-empty, and cleared again once that scan resolves or is
  cancelled

#### Scenario: A fleet with no stored kinematic state is rejected by name
- **WHEN** a fleet document with no `jump` set is read whose stored
  kinematic-state field decodes to none of burn, park, or drift
- **THEN** the read fails with a named error
- **AND** the fleet is never treated as if it were parked at an implied
  origin

### Requirement: Fleet Command Endpoints Are Restricted to the Owning Corporation
The system SHALL, on `POST /v1/fleets/:fleetId/orders`,
`POST /v1/fleets/:fleetId/cancel`, `POST /v1/fleets/:fleetId/cut-drive`,
`POST /v1/fleets/:fleetId/stop`, `POST /v1/fleets/:fleetId/jump`, and
`POST /v1/fleets/:fleetId/scan`, compare `common.ActorCorp(c)` against the
named fleet's `corporationId` before acting, and SHALL respond `404 Not
Found` — not `403` — when they do not match or when the requester has no
corporation, matching the read endpoints' own absence semantics: a foreign
fleet is indistinguishable from a nonexistent one, and a `403` would
itself confirm the id exists (design.md Decision 21). This closes the
authorization defect `Movement Command Endpoints Enforce No Fleet
Ownership` recorded as open, widened to cover the focused-scan endpoint
this change introduces: an unchecked `scan` would let a foreign
corporation claim a victim fleet's sensor-channel slot and strip its
masking on demand (`focused-scan`'s "A Sweep Unmasks Its Scanner") for a
duration the attacker picks by naming a distant host, which is a sharper
hole than the five-endpoint movement gap this requirement's predecessor
closed, and would leave undefined whose corporation the resulting
sightings mint under. The sibling defect on the action-dispatch endpoints
(`/actions?actor=`, `/actions/:id`, `/acknowledge`, `/cancel`) closes in
the same change, in `action-dispatch`'s own delta — closing only this side
would leave a bypass reaching the same movement or sensor slot through
`/actions/:id/cancel`.

#### Scenario: A foreign corp cannot order another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/orders` with a valid target
- **THEN** the response is `404 Not Found` and F's kinematic state is
  unchanged

#### Scenario: A foreign corp cannot cancel another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/cancel`
- **THEN** the response is `404 Not Found` and F's active movement order
  is unaffected

#### Scenario: A foreign corp cannot cut another corp's fleet's drive
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/cut-drive`
- **THEN** the response is `404 Not Found` and F's burn is unaffected

#### Scenario: A foreign corp cannot order another corp's fleet to stop in place
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/stop`
- **THEN** the response is `404 Not Found` and F is unaffected

#### Scenario: A foreign corp cannot order another corp's fleet to jump
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/jump`
- **THEN** the response is `404 Not Found` and no jump is committed

#### Scenario: A foreign corp cannot commit a sweep with another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/scan` naming any host
- **THEN** the response is `404 Not Found`, no scan action is created, F's
  sensor-channel slot is unclaimed, and F's masked state is unchanged

#### Scenario: A corpless requester is rejected the same way
- **WHEN** an authenticated but corpless account submits any movement
  command endpoint against an existing fleet
- **THEN** the response is `404 Not Found`

#### Scenario: The owning corporation's jump order succeeds at the HTTP surface
- **GIVEN** a fleet attached to a lane's gate body, owned by the requesting
  corporation
- **WHEN** that corporation submits `POST /v1/fleets/:fleetId/jump` naming
  that lane
- **THEN** the response reports success carrying the committed jump's ETA
- **AND** the response is never a `5xx` caused by an unconfigured or
  missing server-side dependency

## MODIFIED Requirements

### Requirement: Fleet Read Surfaces Roster, Cargo, and Derived Capacity

The system SHALL include the fleet's ship roster, its cargo pool, its
derived total cargo capacity, its derived free hold, and its derived
mining rate in the response of the fleet read endpoints (`GET
/v1/fleets/:fleetId`, `GET /v1/fleets?systemId=`, `GET
/v1/fleets?mine=true`) for an owning corporation reading its own fleet —
these are not internal-only values computed for the mining verb's use, but
part of the fleet's observable state. A foreign fleet carries no such
fields in any response, because "Fleet Read Endpoints Serve Own Fleets In
Full and Foreign Fleets As Contacts" omits a foreign fleet from a list read
and 404s it on a direct fetch — there is no partial-visibility snapshot of
a foreign fleet in this change for these fields, or any other, to be
redacted from.

#### Scenario: The fleet read response includes roster, cargo, and derived capacity

- **WHEN** an owning corporation reads its fleet via the existing fleet
  GET endpoint
- **THEN** the response includes the fleet's `ships` roster, its `cargo`
  pool by kind, its derived total cargo capacity, its derived free hold
  (capacity minus total tons held), and its derived mining rate (the
  roster's summed extraction rate)

#### Scenario: A foreign fleet's cargo and roster are not disclosed

- **WHEN** a requester lists fleets in a system containing a foreign
  fleet, or fetches that foreign fleet directly by id
- **THEN** the foreign fleet is omitted entirely from the list response,
  and the direct fetch is `404 Not Found` — no roster, cargo, derived
  capacity, or derived mining rate is disclosed, because the fleet itself
  is not disclosed

### Requirement: Jump Arrival Parks Near the Destination Gate, Unmasked

The system SHALL, when a jump's ETA passes, flip the fleet's `systemId` to
the destination, clear its lane-transit state, and settle it into a `park`
near the destination gate's insertion standoff — never attached to the
gate — so the arrival is not masked. The system SHALL, in the same
resolve transaction, mark the destination system `explored` for the
fleet's corporation and chart the crossed lane for the fleet's
corporation as `via: traveled`, and mint no rumor of any lane onward from
the destination. The system SHALL ensure the destination
system's true lane horizon is materialized before that system's first
body-table build for this arrival — the ordering is load-bearing, because a
system's gate bodies are derived from its materialized lanes, and building
the body table first would strand an arriving fleet with fewer gates than
truly exist. Committing the jump SHALL itself ensure the destination's
horizon, so the horizon is materialized before the transit begins and
therefore before the arrival is settled — whether that arrival is settled
by a read of the fleet or by a background sweep. IF the destination's
horizon cannot be materialized at commit, THEN the jump order SHALL be
rejected with a distinguishable, retryable reason carried in the response
body in the same form as this endpoint's other distinguishable rejection
reasons, and no fleet SHALL enter lane transit toward that destination.
Building a body table SHALL NOT
itself materialize the horizon. The system SHALL then materialize the
destination system's interior (create-if-absent).

#### Scenario: Arrival flips the system and parks unattached near the gate

- **WHEN** a jump's ETA passes and the fleet is read/resolved
- **THEN** the fleet's `systemId` becomes the destination, its
  lane-transit state is cleared, and it settles into a park near the
  destination gate's insertion standoff with `attachedTo` empty

#### Scenario: Arrival charts the crossed lane as traveled and rumors nothing onward

- **WHEN** a jump resolves into a destination system
- **THEN** the destination system is marked `explored` for the fleet's
  corporation, the crossed lane is charted for the fleet's corporation
  with `via: traveled`, and no lane onward from the destination is
  rumored by this resolve

#### Scenario: First arrival materializes the destination's interior

- **WHEN** a fleet's jump resolves into a system with no materialized
  interior
- **THEN** the destination's interior is generated (create-if-absent)
  after the resolve transaction completes

#### Scenario: Arrival at the frontier materializes the full lane horizon before the gate set is built

- **GIVEN** a jump resolving into a destination system at the edge of the
  galaxy's currently materialized region
- **WHEN** the arrival settles
- **THEN** the destination system's true lane horizon is materialized
  before its body table (and therefore its gate set) is first built for
  this arrival, so the destination's full gate set — not a truncated one
  — is present to the arriving fleet

#### Scenario: A sweep-settled arrival still has the destination's full gate set

- **GIVEN** a jump into a destination system at the edge of the galaxy's
  currently materialized region, whose arrival is settled by the
  background action sweep rather than by a read of the fleet
- **WHEN** the arrived fleet's destination system is next read
- **THEN** the destination's full gate set — not a truncated one — is
  present, because the lane horizon was already ensured when the jump was
  committed

#### Scenario: A jump toward a destination whose horizon cannot be materialized is rejected

- **GIVEN** a fleet attached to a lane gate whose destination lies past the
  materialized frontier
- **WHEN** it commits a jump and the destination's lane-horizon materialization
  fails
- **THEN** the order is rejected with a distinguishable, retryable reason, no
  action is committed, and the fleet remains attached to the gate rather than
  entering lane transit

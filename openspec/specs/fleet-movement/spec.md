# Fleet Movement Specification

## Purpose
Owns the fleet — the map-mover a corporation orders around the galaxy —
its one movement-state field (coast, burn, docked, lane transit, lane
hold), in-system burns, cross-system graph-tier trips, and the sensor scan
verb it carries. Movement and scanning commit through the `action-dispatch`
spine on two independent single-slot channels (movement, sensor) and read
back through `board-tactical-math`'s effective-state fold, so a completed
order is never observed frozen mid-flight.

## Requirements

### Requirement: Single Movement-State Fleet Record
The system SHALL represent each fleet as one document carrying exactly one
movement-state shape at a time (coast, burn, docked, lane transit, or lane
hold — see `board-tactical-math`), a `corporationId`, its current
`systemId`, and at most one active id per action channel: `activeActionId`
for movement, `activeScanId` for the sensor sweep, independently claimable
and releasable.

#### Scenario: A scan can run while a burn is active
- **WHEN** a fleet has an active burn and is ordered to scan
- **THEN** the scan commits on the sensor channel, the burn's movement slot
  is untouched, and the fleet ends up with both `activeActionId` (the burn)
  and `activeScanId` (the scan) set

### Requirement: In-System Burn Order
The system SHALL, given a board target (a fixed hex or a feature to
intercept), solve a core-avoiding burn from the fleet's current position
(a lead-solve intercept against an orbiting feature, a direct solve against
a fixed hex or feature) and commit it through the action spine on the
movement channel, replacing any currently active movement order.

#### Scenario: Ordering to a fixed hex commits a direct burn
- **WHEN** a fleet is ordered to a board hex target
- **THEN** the fleet's state becomes `burn` with a core-avoiding path from
  its current position to that hex, and the action's ETA is the solved
  arrival time

#### Scenario: Ordering to intercept an orbiting feature leads the target
- **WHEN** a fleet is ordered to a feature target that orbits
- **THEN** the burn's path and arrival time are computed via the intercept
  lead-solve against that feature's live orbit, and `dockOnArrive` is set
  to the feature's id

#### Scenario: Ordering to a fixed (non-orbiting) feature burns directly
- **WHEN** a fleet is ordered to a feature target with no orbit (e.g. the
  star)
- **THEN** the burn solves directly to the feature's anchor hex, with no
  lead-solve

#### Scenario: The star cannot be a destination
- **WHEN** a fleet is ordered to a hex or feature target whose solved meet
  hex is the core `(0,0)`
- **THEN** the order is rejected with `ErrCoreDestination` and no state
  change occurs

#### Scenario: Ordering a feature absent from the system fails
- **WHEN** a fleet is ordered to intercept a `featureId` not present in its
  current system's interior
- **THEN** the order fails with `ErrFeatureAbsent`

#### Scenario: A new order replaces an active one
- **WHEN** a fleet with an active, not-yet-arrived movement order is given
  a new board or system order
- **THEN** the prior action is cancelled and the new order's action claims
  the movement slot

#### Scenario: Ordering over a completed-but-unresolved order settles it first
- **WHEN** a fleet's active movement order has already passed its arrival
  time but has not yet been read/resolved, and it is given a new order
- **THEN** the prior order is resolved (settled, slot released, any
  exactly-once effects minted) before the new order is planned and
  committed

### Requirement: Graph-Tier Travel Order
The system SHALL, given a destination system id, pathfind the
shortest-time route over the requester corporation's charted lanes
(Dijkstra weighted by 3D lane length ÷ drive speed), commit it through the
action spine as a lane-transit trip (a board leg burning to the departure
gate, followed by frozen per-leg lane-crossing ETAs), and flip the fleet's
`systemId`-scoped movement slot to `laneTransit`, replacing any active
movement order.

#### Scenario: Travel is unavailable without graph/tier wiring
- **WHEN** a fleet is ordered to a system and the service has no graph or
  tier dependency configured
- **THEN** the order fails with `ErrTravelUnavailable`

#### Scenario: Destination equal to current system is rejected
- **WHEN** a fleet is ordered to travel to the system it is currently in
- **THEN** the order fails with `ErrSameSystem`

#### Scenario: Routing only uses charted lanes and explored intermediates
- **WHEN** a route is planned from the fleet's system to a destination
- **THEN** only lanes the requester corporation has charted are traversed,
  every intermediate system on the route (other than the origin) is at
  least `explored`, and the destination may be reached as a single
  `rumored` terminal hop past the frontier

#### Scenario: No charted path to the destination
- **WHEN** no path exists from the origin to the destination over the
  requester's charted lanes under the routing rule above
- **THEN** the order (or a route preview) fails with `ErrNoRoute`

#### Scenario: A trip commits leg 0 as a burn to the departure gate
- **WHEN** a travel order is committed
- **THEN** the frozen `LaneTransit.BoardLeg` is a burn from the fleet's
  current board position to the first lane's departure gate hex (computed
  by the same gate projection the system-interior domain uses for rendered
  gates), and `LegEtas[0]` is that burn's arrival time

#### Scenario: Route preview matches what a commit would freeze
- **WHEN** a route is previewed (not committed) to a destination
- **THEN** the returned route, per-leg ETAs, total ETA, and departure gate
  are exactly what committing that order would freeze

### Requirement: Arrival Settlement and Reveal
The system SHALL, when a lane-transit trip's ETA passes, settle the fleet
at the destination system's entry gate (coasting), flip its `systemId` to
the destination, and mint the arrival's observation reveal (destination
explored, the crossed lanes charted as traveled) in the same resolve
transaction — never at commit time or mid-route.

#### Scenario: Arrival flips the system and settles a coast
- **WHEN** a lane-transit trip's ETA passes and the fleet is read/resolved
- **THEN** the fleet's `systemId` becomes the destination and its state
  becomes `coast`, anchored at the destination's entry gate hex at the
  resolve instant

#### Scenario: First arrival materializes the destination's interior
- **WHEN** a fleet's lane-transit trip resolves into a system with no
  materialized interior
- **THEN** the destination's interior is generated (create-if-absent)
  after the resolve transaction completes

### Requirement: Cancel Halts in Place
The system SHALL, on cancel, release the fleet's active movement slot and
halt it at wherever it currently is: coasting at its current board hex if
it was burning or still on a lane trip's board leg, or parked at its
current lane fraction (`laneHold`) if it was already out on a lane between
two systems. A completed-but-unresolved order SHALL be resolved (not
halted) — its arrival is already a fact.

#### Scenario: Cancelling a burn coasts at the current position
- **WHEN** an in-progress burn is cancelled
- **THEN** the fleet's state becomes `coast` at its current board position
  and its movement slot is released

#### Scenario: Cancelling a trip's board leg coasts at the current position
- **WHEN** a lane-transit trip is cancelled while still on its board leg
  (before the departure gate)
- **THEN** the fleet's state becomes `coast` at its current board position

#### Scenario: Cancelling a trip already out on a lane holds mid-lane
- **WHEN** a lane-transit trip is cancelled after passing its departure
  gate
- **THEN** the fleet's state becomes `laneHold`, recording the two systems
  and the fraction of the lane crossed at the cancel instant

#### Scenario: Cancelling an already-arrived order resolves instead of halting
- **WHEN** cancel is called on a fleet whose active movement order has
  already passed its arrival time
- **THEN** the order is resolved (settled with its effects) rather than
  halted, and the settled fleet is returned

#### Scenario: Re-cancelling an already-held fleet is a no-op
- **WHEN** cancel is called on a fleet already in `laneHold`
- **THEN** its state is unchanged

### Requirement: Sensor Scan Order
The system SHALL, on a scan order, commit a 360° sweep through the action
spine on the independent sensor channel with an ETA of `now + scan
duration`, pinning the origin system id and the fleet's emission hex (its
board position at commit time) into the action's params so the eventual
mint grows from where the pulse was fired, not from wherever the fleet
ends up.

#### Scenario: Scan is rejected with no board presence
- **WHEN** a fleet whose effective state is `laneHold`, or `laneTransit`
  past its departure gate, is ordered to scan
- **THEN** the order fails with `ErrNotOnBoard` and no action is committed

#### Scenario: Scan pins the mid-burn emission position
- **WHEN** a mid-burn fleet is ordered to scan
- **THEN** the committed scan's origin hex is the fleet's board position at
  the commit instant, not wherever the burn later carries it

#### Scenario: A finished-but-unresolved scan is settled before a new one commits
- **WHEN** a fleet's active scan has already passed its ETA but has not yet
  been read/resolved, and it is ordered to scan again
- **THEN** the finished scan is resolved (its slot released) before the new
  scan commits

#### Scenario: A genuinely running scan rejects a second order
- **WHEN** a fleet with a scan still short of its ETA is ordered to scan
  again
- **THEN** the order fails with the action spine's "active action exists"
  conflict

### Requirement: Effective Position Resolution
The system SHALL resolve a fleet's live position (`Position`) from its
effective (folded) state at the current world time: for a docked fleet, the
parent feature's live position (its current orbit if it orbits, else its
fixed anchor); otherwise the computed board hex, which may report no
position for lane-hold or out-on-lane fleets.

#### Scenario: A docked fleet rides its parent's live position
- **WHEN** a fleet's effective state is `docked` to a feature that orbits
- **THEN** its resolved position is that feature's current orbital hex at
  the current world time, not the hex the docking burn ended on

### Requirement: Command Endpoints Enforce No Fleet Ownership
The system SHALL, on `POST /v1/fleets/:fleetId/orders`,
`POST /v1/fleets/:fleetId/cancel`, and `POST /v1/fleets/:fleetId/scan`, act
on the fleet named by the `fleetId` path param for any authenticated
account, without verifying the fleet's `corporationId` matches the
requester's corporation — `common.ActorCorp(c)` is read for audience fog on
the GET endpoints but is never consulted by these three mutating handlers or
by the fleet service. (Suspected authorization defect — see retrofit report
item 1; specced here as the current, observable behavior, not an
endorsement.)

#### Scenario: A foreign corp can order another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/orders` with a valid target
- **THEN** the order is accepted and F's movement state changes — no `403`
  or ownership rejection occurs

#### Scenario: A foreign corp can cancel another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/cancel`
- **THEN** F's active movement order is cancelled — no ownership check is
  performed

#### Scenario: A foreign corp can order a scan from another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/scan`
- **THEN** a scan commits on F's sensor channel — no ownership check is
  performed

### Requirement: Fleet Read Endpoints and Audience Fog
The system SHALL serve `GET /v1/fleets/:fleetId` (single fleet),
`GET /v1/fleets?systemId=` (every fleet in a system), and
`GET /v1/fleets?mine=true` (every fleet the requester's corporation owns,
across systems). A requester's own fleets SHALL always be visible with
their full movement state (path, target, ETA); a foreign fleet SHALL be
visible only if it currently lies inside the requester's live sensor
coverage, and then only as a position snapshot (mode + position, no path,
target, or ETA).

#### Scenario: A foreign fleet outside sensor coverage is not found
- **WHEN** a requester fetches a specific fleet id belonging to another
  corporation that is not currently inside their live sensor coverage
- **THEN** the response is `404 Not Found`

#### Scenario: A foreign fleet inside coverage is redacted to a snapshot
- **WHEN** a requester lists fleets in a system that includes a foreign
  fleet currently inside their live sensor coverage
- **THEN** that fleet appears with `own: false` and a state containing only
  its movement mode, no path/target/ETA detail

#### Scenario: Own fleets are never fogged
- **WHEN** a requester fetches or lists their own fleets
- **THEN** every one is returned with `own: true` and its full movement
  state, regardless of sensor coverage

#### Scenario: mine=true with no corp returns an empty list
- **WHEN** an authenticated but corpless requester calls
  `GET /v1/fleets?mine=true`
- **THEN** the response is an empty fleet list, not an error

### Requirement: Order Request Validation
The system SHALL reject an order request that specifies neither a board
target (hex or featureId) nor a `systemId`, and SHALL reject one that
specifies both.

#### Scenario: Empty order body is rejected
- **WHEN** `POST /v1/fleets/:fleetId/orders` is called with neither a
  board target nor a `systemId`
- **THEN** the response is `400 Bad Request`

#### Scenario: Ambiguous order body is rejected
- **WHEN** `POST /v1/fleets/:fleetId/orders` is called with both a board
  target and a `systemId`
- **THEN** the response is `400 Bad Request`

### Requirement: Dev/Spawn Fleet Seeding
The system SHALL provide a seeding primitive (`SeedFleet`) that drops a new
fleet, coasting, at a given hex in a given system for a given corporation,
rejecting the core hex `(0,0)` as a seed position.

#### Scenario: Seeding onto the core is rejected
- **WHEN** `SeedFleet` is called with the core hex `(0,0)` as the position
- **THEN** it fails with `ErrCoreDestination`

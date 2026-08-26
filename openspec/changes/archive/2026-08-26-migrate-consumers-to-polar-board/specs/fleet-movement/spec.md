## MODIFIED Requirements

### Requirement: In-System Burn Order
The system SHALL, given a board target (a fixed cell or a feature to
intercept), solve a burn from the fleet's current position to that target —
a lead-solve intercept against an orbiting feature, or a direct solve
against a fixed cell or feature — at the fleet's roster-derived effective
burn rate (see "Derived Fleet Speed"). The system SHALL reject the solve if
its resolved destination is the core cell: the star occupies the core, and
a polar arc path cannot cross the core unless one of its endpoints is
itself the core, so rejecting the core as an endpoint is sufficient to keep
every burn off the star. Otherwise the system SHALL commit the burn through
the action spine on the movement channel, replacing any currently active
movement order.

#### Scenario: Ordering to a fixed cell commits a direct burn
- **WHEN** a fleet is ordered to a board cell target
- **THEN** the fleet's state becomes `burn` with an arc path from its
  current position to that cell, and the action's ETA is the solved arrival
  time

#### Scenario: Ordering to intercept an orbiting feature leads the target
- **WHEN** a fleet is ordered to a feature target that orbits
- **THEN** the burn's path and arrival time are computed via the intercept
  lead-solve against that feature's live orbit, and `dockOnArrive` is set
  to the feature's id

#### Scenario: Ordering to a fixed (non-orbiting) feature burns directly
- **WHEN** a fleet is ordered to a feature target with no orbit (e.g. the
  star)
- **THEN** the burn solves directly to the feature's anchor cell, with no
  lead-solve

#### Scenario: The star cannot be a destination
- **WHEN** a fleet is ordered to a cell or feature target whose solved meet
  cell is the core cell
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
(Dijkstra weighted by 3D lane length ÷ the fleet's roster-derived
effective lane rate — see "Derived Fleet Speed"), commit it through the
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
  current board position to the first lane's departure gate cell (computed
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
  becomes `coast`, anchored at the destination's entry gate cell at the
  resolve instant

#### Scenario: First arrival materializes the destination's interior
- **WHEN** a fleet's lane-transit trip resolves into a system with no
  materialized interior
- **THEN** the destination's interior is generated (create-if-absent)
  after the resolve transaction completes

### Requirement: Cancel Halts in Place
The system SHALL, on cancel, release the fleet's active movement-channel
slot and halt it at wherever it currently is: coasting at its current
board cell if it was burning or still on a lane trip's board leg, or
parked at its current lane fraction (`laneHold`) if it was already out on
a lane between two systems, or **remaining `docked` at its current parent
feature, unchanged, if the released slot was occupied by a non-movement
verb (e.g. a running `mine` action) rather than a burn or lane trip** — a
docked fleet has no motion to halt into a coast, so releasing a
co-resident verb's slot must never force it off its dock. A
completed-but-unresolved order SHALL be resolved (not halted) — its
arrival is already a fact.

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

#### Scenario: Cancelling via the fleet endpoint while mining leaves the fleet docked
- **WHEN** `POST /v1/fleets/:fleetId/cancel` is called on a fleet that is
  `docked` to a feature with a running `mine` action claiming the movement
  slot
- **THEN** the mine action is cancelled (no delta, no cargo credit, per
  `action-dispatch`'s cancel contract) and the movement slot is released,
  but the fleet's state remains `docked` to the same feature — identical
  in outcome to cancelling the same run via
  `POST /v1/actions/:actionId/cancel`

### Requirement: Sensor Scan Order
The system SHALL, on a scan order, commit a 360° sweep through the action
spine on the independent sensor channel with an ETA of `now + scan
duration`, pinning the origin system id and the fleet's emission cell (its
board position at commit time) into the action's params so the eventual
mint grows from where the pulse was fired, not from wherever the fleet
ends up.

#### Scenario: Scan is rejected with no board presence
- **WHEN** a fleet whose effective state is `laneHold`, or `laneTransit`
  past its departure gate, is ordered to scan
- **THEN** the order fails with `ErrNotOnBoard` and no action is committed

#### Scenario: Scan pins the mid-burn emission position
- **WHEN** a mid-burn fleet is ordered to scan
- **THEN** the committed scan's origin cell is the fleet's board position at
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
fixed anchor); otherwise the computed board cell, which may report no
position for lane-hold or out-on-lane fleets.

#### Scenario: A docked fleet rides its parent's live position
- **WHEN** a fleet's effective state is `docked` to a feature that orbits
- **THEN** its resolved position is that feature's current orbital cell at
  the current world time, not the cell the docking burn ended on

### Requirement: Order Request Validation
The system SHALL reject an order request that specifies neither a board
target (cell or featureId) nor a `systemId`, and SHALL reject one that
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
fleet, coasting, at a given cell in a given system for a given corporation,
rejecting the core cell `{ring 0, slot 0}` as a seed position.

#### Scenario: Seeding onto the core is rejected
- **WHEN** `SeedFleet` is called with the core cell `{ring 0, slot 0}` as
  the position
- **THEN** it fails with `ErrCoreDestination`

### Requirement: Derived Fleet Speed
The system SHALL express each ship class's drive speed in configuration as
two independent true rates — a burn rate (board cells crossed per unit
world-time) and a lane rate (3D lane-length units crossed per unit
world-time) — never as a single scalar, since a burn and a lane-transit
leg measure distance in different, non-proportional units (board cells vs.
lane-length units) and one scalar cannot reproduce both. The system SHALL
derive a fleet's effective burn rate and effective lane rate each as the
minimum of its roster's per-ship class rates on that axis (the smallest
rate is the slowest hull, since a true rate increases with speed),
computed fresh from the roster and configuration on every movement
computation — never persisted as a separately stored total that could
drift from the roster. Burn ETA and lane-transit leg ETA SHALL be computed
by inverting the fleet's effective rate on the relevant axis into a time
cost (world-ms per cell for burns, world-ms per lane-length unit for lane
legs) at the point each was previously read from a single global
drive-speed constant. The `seed` class's burn rate and lane rate SHALL be
configured so that a fleet whose roster is a single `seed`-class ship
computes exactly the same cost PER BOARD CELL and PER LANE-LENGTH UNIT
this change's predecessor computed from the global `MsPerTile` and
`LaneMsPerDistance` constants — this change reshapes where per-class
speed lives, not the cost per unit of distance; a total ETA still
changes wherever the polar lattice's solved path length differs from the
hex lattice's.

#### Scenario: Fleet speed gates on the slowest hull on each axis
- **WHEN** a fleet's roster contains ships of differing class burn rates
  and lane rates
- **THEN** the fleet's effective burn rate equals the slowest ship's class
  burn rate, and its effective lane rate equals the slowest ship's class
  lane rate, independently of each other

#### Scenario: A single-hull fleet moves at that hull's rates
- **WHEN** a fleet's roster is a single `seed`-class ship
- **THEN** the fleet's effective burn rate equals the `seed` class's burn
  rate and its effective lane rate equals the `seed` class's lane rate

#### Scenario: A single seed-class fleet's ETAs are unchanged from the pre-change constants
- **WHEN** a fleet whose roster is a single `seed`-class ship commits a
  burn or a lane-transit trip
- **THEN** for the same solved path, its burn ETA equals what the
  pre-change global `MsPerTile` constant applied to that same path would
  have yielded, and its lane-leg ETAs equal what the pre-change global
  `LaneMsPerDistance` constant would have yielded — the `seed` class's
  configured rates are value-preserving per unit of distance; this
  scenario makes no claim about path length, which the lattice geometry
  sets

## ADDED Requirements

### Requirement: Board Coordinates Outside the Live Schedule Are Rejected, Never Panicked
Any board coordinate reaching lattice math from stored or decoded data
SHALL be validated against the live schedule's maximum ring before use, at
every boundary that reads a persisted coordinate — not only the
system-interior read. A ring beyond the live schedule's maximum SHALL
surface as a named error, never as a panic.

#### Scenario: A fleet's stored position exceeds the live board radius
- **WHEN** a fleet read, mine command, or sell command resolves a stored
  position or orbit whose ring exceeds the live production schedule's
  maximum ring
- **THEN** the operation fails with a named sentinel error carrying a
  distinguishable reason, rather than a panic reaching lattice math

#### Scenario: A decoded action parameter coordinate exceeds the live board radius
- **WHEN** an action's stored coordinate parameter decodes to a cell whose
  ring exceeds the live schedule's maximum ring
- **THEN** the decode is treated as a failure with a recorded cause, and
  the value is not passed to lattice math

#### Scenario: Coordinate rejections are countable per cause
- **WHEN** a coordinate is rejected during a read or a resolve
- **THEN** the rejection is recorded as a structured log entry carrying
  `cause`, one of `ring-out-of-range` (the decoded ring exceeds the live
  schedule's maximum) or `undecodable-shape` (the stored value is not a
  cell), plus `ring` when the cause is `ring-out-of-range`, plus
  `actionType` and the action id when the rejection occurred while
  decoding an action parameter

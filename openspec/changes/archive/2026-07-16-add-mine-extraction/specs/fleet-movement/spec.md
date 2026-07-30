## ADDED Requirements

### Requirement: Fleet Ship Composition
This requirement owns the fleet entity's ship composition (the
stat-contributing hulls aboard a fleet) — it is unrelated to the
`fleet-roster` capability (the owned-fleet list panel in the frontend),
which merely reads a corporation's fleets and does not describe any single
fleet's internal composition; the similar names are coincidental.

The system SHALL represent each fleet's composition as a roster of ships
(`ships: [{class}, ...]`), where each ship's class maps to a per-class
stats table (mining rate, hold capacity, speed, …) held in configuration
— never stored per-ship on the fleet document — so ship classes remain
stat contributors to the fleet, never independent actors with their own
movement state (the fleet, not the ship, is the sole mover — see "Single
Movement-State Fleet Record"). A fleet document persisted before this
capability shipped, carrying no stored `ships` field, SHALL be read as if
it carries a roster of exactly one default (`seed`-class) ship for every
derived-capacity, derived-rate, and cargo computation — never as an empty
roster. (Every fleet in play today was created by `SeedFleet` before this
change adds roster-writing to it — see `CLAUDE.md`'s M9 spawn note — so
this fallback is exercised by real existing data, not a hypothetical.)

#### Scenario: A newly seeded fleet carries a default roster
- **WHEN** a fleet is seeded (spawn's placement primitive)
- **THEN** it carries a roster of at least one ship (the `seed` class),
  never an empty roster

#### Scenario: A pre-existing fleet with no stored roster reads as one default hull
- **WHEN** a fleet document written before this capability shipped is read,
  and it has no stored `ships` field
- **THEN** its derived cargo capacity and mining rate are computed as if it
  carries one `seed`-class ship, not as zero

### Requirement: Derived Cargo Capacity and Mining Rate
The system SHALL derive a fleet's total cargo capacity as the sum of its
roster's per-ship hold capacities, and its total mining rate as the sum of
its roster's per-ship mining rates, computed fresh from the roster and
configuration on every read — never persisted as a separately stored
total that could drift from the roster.

#### Scenario: Capacity and rate scale with roster composition
- **WHEN** a fleet's roster is read
- **THEN** its cargo capacity and mining rate are computed as the sum of
  its current ships' class stats, not read from a stored total field

### Requirement: Fleet Cargo Pool
The system SHALL represent each fleet's held resources as one fleet-level
cargo pool (`cargo: {kind: tons, ...}`), credited only by a mining verb's
resolve step (see `mine-extraction`), with free hold at any moment equal
to derived capacity minus the sum of tons currently held across all kinds
— there is no per-ship cargo allocation and no corporation-level stockpile;
cargo exists only on the fleet that mined it.

#### Scenario: A fresh fleet's cargo pool is empty
- **WHEN** a newly seeded fleet is read
- **THEN** its cargo pool is empty (zero tons of every kind)

#### Scenario: Free hold accounts for all kinds currently held
- **WHEN** a fleet's cargo pool holds tonnage across more than one kind
- **THEN** its free hold is its derived capacity minus the sum of all
  kinds' tonnage combined, not per-kind capacity

### Requirement: Derived Fleet Speed
The system SHALL express each ship class's drive speed in configuration as
two independent true rates — a burn rate (board hexes crossed per unit
world-time) and a lane rate (3D lane-length units crossed per unit
world-time) — never as a single scalar, since a burn and a lane-transit
leg measure distance in different, non-proportional units (board hexes vs.
lane-length units) and one scalar cannot reproduce both. The system SHALL
derive a fleet's effective burn rate and effective lane rate each as the
minimum of its roster's per-ship class rates on that axis (the smallest
rate is the slowest hull, since a true rate increases with speed),
computed fresh from the roster and configuration on every movement
computation — never persisted as a separately stored total that could
drift from the roster. Burn ETA and lane-transit leg ETA SHALL be computed
by inverting the fleet's effective rate on the relevant axis into a time
cost (world-ms per hex for burns, world-ms per lane-length unit for lane
legs) at the point each was previously read from a single global
drive-speed constant. The `seed` class's burn rate and lane rate SHALL be
configured so that a fleet whose roster is a single `seed`-class ship
computes exactly the same burn and lane-transit ETAs this change's
predecessor computed from the global `MsPerTile` and `LaneMsPerDistance`
constants — this change reshapes where per-class speed lives, not what a
one-hull slice fleet's timing is today.

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
- **THEN** its burn ETA equals what the pre-change global `MsPerTile`
  constant would have yielded, and its lane-leg ETAs equal what the
  pre-change global `LaneMsPerDistance` constant would have yielded — the
  `seed` class's configured rates are value-preserving for the one-hull
  slice fleet

### Requirement: Fleet Read Surfaces Roster, Cargo, and Derived Capacity
The system SHALL include the fleet's ship roster, its cargo pool, its
derived total cargo capacity, and its derived free hold in the response
of the fleet read endpoints (`GET /v1/fleets/:fleetId`, `GET
/v1/fleets?systemId=`, `GET /v1/fleets?mine=true`) for an owning
corporation reading its own fleet — these are not internal-only values
computed for the mining verb's use, but part of the fleet's observable
state. For a foreign fleet, these fields carry exactly the same
audience-fog redaction `fleet-movement`'s "Fleet Read Endpoints and
Audience Fog" already applies to path/target/ETA: a foreign fleet visible
inside the requester's live sensor coverage is redacted to a snapshot that
omits `ships`, `cargo`, derived total cargo capacity, and derived free
hold, disclosing only movement mode and position.

#### Scenario: The fleet read response includes roster, cargo, and derived capacity
- **WHEN** an owning corporation reads its fleet via the existing fleet
  GET endpoint
- **THEN** the response includes the fleet's `ships` roster, its `cargo`
  pool by kind, its derived total cargo capacity, and its derived free
  hold (capacity minus total tons held)

#### Scenario: A foreign fleet's cargo and roster are not disclosed
- **WHEN** a requester lists or fetches a foreign fleet currently inside
  their live sensor coverage
- **THEN** the response omits that fleet's `ships` roster, `cargo` pool,
  derived total cargo capacity, and derived free hold — the redacted
  snapshot carries only movement mode and position, extending the same
  audience-fog redaction `fleet-movement` already guarantees for
  path/target/ETA to the roster and cargo fields

## MODIFIED Requirements

### Requirement: In-System Burn Order
The system SHALL, given a board target (a fixed hex or a feature to
intercept), solve a core-avoiding burn from the fleet's current position
(a lead-solve intercept against an orbiting feature, a direct solve
against a fixed hex or feature) at the fleet's roster-derived effective
burn rate (see "Derived Fleet Speed") and commit it through the action
spine on the movement channel, replacing any currently active movement
order.

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
  current board position to the first lane's departure gate hex (computed
  by the same gate projection the system-interior domain uses for rendered
  gates), and `LegEtas[0]` is that burn's arrival time

#### Scenario: Route preview matches what a commit would freeze
- **WHEN** a route is previewed (not committed) to a destination
- **THEN** the returned route, per-leg ETAs, total ETA, and departure gate
  are exactly what committing that order would freeze

### Requirement: Cancel Halts in Place
The system SHALL, on cancel, release the fleet's active movement-channel
slot and halt it at wherever it currently is: coasting at its current
board hex if it was burning or still on a lane trip's board leg, or
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

# Fleet Movement Specification

## Purpose
Owns the fleet — the map-mover a corporation orders around the galaxy —
its one movement-state field (coast, burn, docked, lane transit, lane
hold), in-system burns, cross-system graph-tier trips, and the sensor scan
verb it carries. Movement and scanning commit through the `action-dispatch`
spine on two independent single-slot channels (movement, sensor) and read
back through `space-kinematics`'s effective-state fold (`space.StateAt`), so a
completed order is never observed frozen mid-flight.
## Requirements
### Requirement: Effective Position Resolution

The system SHALL resolve a fleet's live position from its effective (folded)
kinematic state at the current world time through `space.StatePosition`, the
capability's sole canonical position path: for a fleet attached to a host,
the host's live position (its current orbit if it orbits, else its fixed
anchor); otherwise the fleet's own folded burn, park, or drift position. A
fleet whose `jump` field is set SHALL report NO position in either endpoint
system — its stored kinematic state is not evaluated while a jump is in
flight — and consumers SHALL treat a jumping fleet as absent rather than as
located at its pre-jump position. No consumer of a fleet's position SHALL
re-derive, cache, or round it outside this path.

#### Scenario: A docked fleet rides its parent's live position

- **WHEN** a fleet's `attachedTo` names a body that orbits
- **THEN** its resolved position is that body's current orbital position at
  the current world time, not the position the docking burn ended on

#### Scenario: A free-flying fleet resolves through space.StatePosition

- **WHEN** a fleet has no `attachedTo` set
- **THEN** its resolved position is `space.StatePosition` folded over its
  stored burn, park, or drift at the current world time, computed by no
  other path

#### Scenario: A fleet mid-jump reports no position in either system

- **WHEN** a fleet's `jump` field is set
- **THEN** the fleet reports no position in its origin system or its
  destination system, and its stale stored kinematic state is not evaluated
  or returned as a fallback position

### Requirement: Order Request Validation

The system SHALL reject an order request that specifies neither a body id
nor an explicit point nor a `laneId` (for a jump), and SHALL reject one that
specifies more than one of them.

#### Scenario: Empty order body is rejected

- **WHEN** `POST /v1/fleets/:fleetId/orders` is called with neither a body
  id, a point, nor a `laneId`
- **THEN** the response is `400 Bad Request`

#### Scenario: Ambiguous order body is rejected

- **WHEN** `POST /v1/fleets/:fleetId/orders` is called with more than one of
  a body id, a point, and a `laneId`
- **THEN** the response is `400 Bad Request`

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
cargo pool (`cargo: {kind: tons, ...}`), credited by a mining verb's
resolve step (see `mine-extraction`) and debited by an instant sale
settlement (see `goods-sale`), with free hold at any moment equal to
derived capacity minus the sum of tons currently held across all kinds —
there is no per-ship cargo allocation and no corporation-level stockpile;
cargo exists only on the fleet that holds it. `fuel` SHALL be a reserved
cargo kind, mined by no verb and sold by none (see `fuel-purchase`), that
occupies hold capacity exactly like any mined resource kind — a fleet
carrying fuel has that much less room for ore, and vice versa. Beyond the
mining-resolve credit and sale debit above, a fleet's `fuel` entry SHALL
also be: debited at a burn's commit (see "A Burn Commit Is Rejected When
Its Fuel Cost Exceeds Available Fuel, Debited At Commit Never At
Resolve"); credited when a running burn is discarded before arrival (see
"Discarding a Running Burn Refunds Its Unspent Fuel, Closed-Form");
credited by an instant refuel purchase (see `fuel-purchase`); credited
exactly once by spawn asset healing's starting grant (see
`corporation-spawn`'s "Spawn Asset Healing"); and, since this change,
debited at a station-keeping hold's settlement — never continuously while
the hold is merely open, but at each of the discrete events "Station-
Keeping Upkeep Is Settled at Discrete Events, Never Folded Into the Stored
Cargo Pool" defines: `release`; the automatic force-demotion at the stored
dry instant (which settles the entry to exactly the configured
station-keeping reserve, never to zero); another verb's `fuel` mutation
landing while the hold remains open (which additionally restamps the hold
and recomputes its dry instant); and **any verb that ends or abandons an
open hold** — a burn commit, a stop-in-place, a jump, or any future such
path — which settles the accrued upkeep but never restamps, since no hold
remains to restamp (see "Station-Keeping Hold and Release Are Fleet Verbs"
and "Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded
Into the Stored Cargo Pool"). No verb outside this list SHALL mutate a
fleet's `fuel` entry.

#### Scenario: A fresh fleet's cargo pool is empty
- **WHEN** a newly seeded fleet is read
- **THEN** its cargo pool is empty (zero tons of every kind)

#### Scenario: Free hold accounts for all kinds currently held
- **WHEN** a fleet's cargo pool holds tonnage across more than one kind
- **THEN** its free hold is its derived capacity minus the sum of all
  kinds' tonnage combined, not per-kind capacity

#### Scenario: A settled sale debits the sold kind from the cargo pool
- **WHEN** a sale settles for a given kind and tonnage
- **THEN** the fleet's cargo pool for that kind decreases by the sold
  tonnage, its free hold increases correspondingly, and every other kind's
  tonnage is unchanged

#### Scenario: Fuel occupies cargo capacity exactly like a mined resource
- **WHEN** a fleet's cargo pool holds tonnage of `fuel` alongside a mined
  kind
- **THEN** the `fuel` tonnage counts toward the sum subtracted from
  derived capacity to compute free hold, identically to any mined kind

#### Scenario: No mine resolve or sale settlement ever touches the fuel entry
- **WHEN** a mining verb's resolve step credits a fleet's cargo, or a sale
  settlement debits it
- **THEN** neither ever names `fuel` as the credited or debited kind —
  fuel moves only through the verbs this requirement enumerates for it

#### Scenario: An open station-keeping hold does not by itself change the stored fuel entry
- **WHEN** a fleet's `fuel` cargo is read while it is station-keeping,
  before that hold is released or exhausted
- **THEN** the stored `fuel` value is unchanged from what it was at the
  moment the hold began — no continuous debit is applied to the stored
  cargo pool merely by elapsed hold time

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

### Requirement: In-System Burn Order to a Body or a Point

The system SHALL, given a burn order naming a body id or an explicit point in
the fleet's current system, solve a burn from the fleet's live position and
live velocity to that target through `space.SolveBurn` against the system's
`system.BodyTable`, departing tangent to the fleet's actual motion at commit
time. The system SHALL reject an order naming the system's own star: the
star's insertion standoff sits inside its configured clearance radius for
every star size this generator emits, so `space.BuildCurve`'s
endpoint-clearance guard rejects it by geometry — no destination-identity
special case is required or permitted. The system SHALL commit the solved
burn through the action spine on the movement channel, replacing any
currently active movement order (settling it first if it has already passed
its arrival time but has not yet been resolved). The system SHALL clear the
fleet's `attachedTo` at the instant a burn order is accepted — a fleet under
way or drifting is attached to nothing — and SHALL set it only at a
body-targeted burn's resolve.

#### Scenario: Ordering to an explicit point commits a direct burn

- **WHEN** a fleet is ordered to an explicit point in its current system
- **THEN** the fleet's state becomes a burn whose curve departs from the
  fleet's live position and whose intercept is that point, and the action's
  ETA is the solved arrival time

#### Scenario: Ordering to intercept a body leads the target

- **WHEN** a fleet is ordered to a body target that orbits
- **THEN** the burn's intercept is computed via `space.SolveBurn`'s
  fixed-round intercept solve against that body's live orbit, and the
  fleet's `attachedTo` is set to the body's id only once the burn resolves

#### Scenario: Ordering the star's own body id is rejected by geometry

- **WHEN** a fleet is ordered to burn to the system's star, naming its body
  id
- **THEN** the order is rejected by `space.BuildCurve`'s endpoint-clearance
  guard, with no destination-identity check having run
- **AND** no burn is stored

#### Scenario: Ordering a body absent from the system fails

- **WHEN** a fleet is ordered to intercept a body id not present in its
  current system's `BodyTable`
- **THEN** the order fails with a named error and no state change occurs

#### Scenario: A new order replaces an active one

- **WHEN** a fleet with an active, not-yet-arrived burn is given a new burn
  order
- **THEN** the prior action is cancelled and the new order's action claims
  the movement slot

#### Scenario: Ordering over a completed-but-unresolved order settles it first

- **WHEN** a fleet's active movement order has already passed its arrival
  time but has not yet been read/resolved, and it is given a new order
- **THEN** the prior order is resolved (settled, slot released, any
  exactly-once effects minted) before the new order is planned and committed

#### Scenario: Re-targeting mid-burn departs tangent to current motion, not the original departure

- **WHEN** a fleet mid-burn toward one target is re-ordered to a different
  target before arriving
- **THEN** the new burn's departure tangent is derived from the fleet's live
  velocity at the re-order instant (its position and direction along the
  original curve at that moment), not from the original burn's own
  departure tangent

#### Scenario: Committing a burn detaches the fleet from its host

- **WHEN** a fleet attached to a body is given a burn order to a different body
- **THEN** its `attachedTo` is cleared at commit, and its resolved position
  is its own folded burn position rather than the former host's

#### Scenario: A target too close to solve is rejected by name

- **WHEN** a fleet parked at a body's insertion standoff is ordered to burn
  back to that same body, yielding a curve shorter than
  `space.MinArcLength`
- **THEN** the order is rejected with `space.ErrArcTooShort`'s named reason
  and no burn is stored

### Requirement: Cut Drive Converts the Burn to a Drift and Goes Dark

The system SHALL, on a cut-drive order against a fleet with an active burn
that has not yet arrived, replace the stored burn with a drift anchored at
the burn's position at the cut instant, carrying velocity equal to the
burn's tangent at that instant scaled by the burn's speed at that instant,
epoched at the cut instant. Cut drive SHALL be free (no delta-v charged for
the act of cutting itself), instant (no ETA, no committed action), and
SHALL cancel the running movement action, releasing its slot with no
further delta. The system SHALL reject a cut-drive order against a burn
that has already reached or passed its arrival time, with its own named
reason, and SHALL reject a cut-drive order against a fleet that is not
actively burning (parked, drifting, or in lane transit), with its own
named reason. A burning fleet's `attachedTo` was already cleared at that
burn's commit ("In-System Burn Order to a Body or a Point"), so cut drive
leaves it empty and performs no further mutation of that field. **Since
this change, cutting a burn is not itself a no-cargo-effect event**: the
discarded burn's unspent, already-debited fuel cost is refunded per
"Discarding a Running Burn Refunds Its Unspent Fuel, Closed-Form" — a
cargo effect of the *discard*, not of the cut charging any new delta-v.

#### Scenario: Cutting a mid-burn fleet converts it to a drift

- **WHEN** cut drive is ordered against a fleet mid-burn, strictly before its
  arrival time
- **THEN** the fleet's state becomes a drift anchored at the burn's position
  at the cut instant, with velocity equal to the burn's tangent at that
  instant scaled by its speed
- **AND** the running movement action is cancelled with no delta

#### Scenario: Emission stops the same instant the drive is cut

- **WHEN** a fleet's emission state is read immediately before and
  immediately after a cut-drive order
- **THEN** it reports emitting before the cut and not emitting after it,
  with no intervening instant reported as ambiguous

#### Scenario: Cutting an already-arrived burn resolves the arrival instead

- **WHEN** cut drive is ordered against a fleet whose active burn has already
  reached or passed its arrival time but has not yet been resolved
- **THEN** the order is rejected with its own named reason, and the arrival
  is resolved (settled with its effects) rather than converted to a drift

#### Scenario: Cutting a parked, drifting, or in-transit fleet is rejected by name

- **WHEN** cut drive is ordered against a fleet that is parked, already
  drifting, or in lane transit
- **THEN** the order is rejected with its own named reason, distinct from
  the already-arrived rejection, and no state change occurs

#### Scenario: Cut drive charges no delta-v

- **WHEN** a burn is cut
- **THEN** no delta-v is debited for the act of cutting itself, and the
  discarded burn's unspent fuel is refunded per "Discarding a Running Burn
  Refunds Its Unspent Fuel, Closed-Form" — that refund is a cargo effect of
  the discard, not evidence that cutting charged any new delta-v

#### Scenario: A cut fleet is immediately re-orderable

- **WHEN** a fleet has just been converted to a drift by cut drive
- **THEN** it accepts a new burn order immediately, with no cooldown or
  intervening state

#### Scenario: Cutting a burn credits its unspent fuel

- **WHEN** a running burn with a nonzero already-debited fuel cost is cut
  before its arrival time
- **THEN** the fleet's `fuel` cargo is credited with the unspent-fraction
  refund "Discarding a Running Burn Refunds Its Unspent Fuel, Closed-Form"
  defines, even though the cut itself charges no new delta-v

### Requirement: Stop In Place Commits a Velocity-Nulling Burn

The system SHALL, on a stop-in-place order against a fleet whose live speed
exceeds the configured stop-in-place speed floor, commit a burn to an
explicit point target at the configured minimum arc length ahead of the
fleet along its live velocity direction, priced and timed by the same rules
as any other burn (delta-v proportional to commanded acceleration and
flight duration, emitting for its duration), settling to a `point` park on
arrival. Where the fleet's live speed at commit time is at or below the
configured stop-in-place speed floor, the system SHALL instead convert the
fleet instantly and freely to a `point` park at its current position, with
no committed action and no delta-v charge. The system SHALL clear the
fleet's `attachedTo` at the instant a stop-in-place order is accepted, in
both the instant-park and committed-burn cases — a fleet ordered to stop is
under way or drifting and is attached to nothing once the order commits.

#### Scenario: Stopping above the speed floor commits a nulling burn

- **WHEN** stop-in-place is ordered against a fleet whose live speed exceeds
  the configured stop-in-place speed floor
- **THEN** a burn is committed on the movement channel that ends the fleet's
  motion at a point ahead of it, charging delta-v and emitting for its
  duration
- **AND** the fleet settles into a `point` park once the burn arrives

#### Scenario: Stopping at or below the speed floor is instant and free

- **WHEN** stop-in-place is ordered against a fleet whose live speed is at or
  below the configured stop-in-place speed floor
- **THEN** the fleet's state becomes a `point` park at its current position
  immediately, with no committed action, no ETA, and no delta-v charged

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

### Requirement: Releasing a Co-Resident Verb's Slot Leaves Motion Untouched

The system SHALL, when a non-movement verb's action (e.g. a running `mine`
action) sharing the fleet's dock is cancelled, release only that action's
slot — the fleet's kinematic state and its `attachedTo` SHALL remain
unchanged, identically whether the release is triggered via
`POST /v1/fleets/:fleetId/cancel` or `POST /v1/actions/:actionId/cancel`. A
docked fleet has no motion to halt into a drift or a burn, so releasing a
co-resident verb's slot SHALL never force it off its dock.

#### Scenario: Cancelling via the fleet endpoint while mining leaves the fleet docked

- **WHEN** `POST /v1/fleets/:fleetId/cancel` is called on a fleet that is
  attached to a feature with a running `mine` action claiming the movement
  slot
- **THEN** the mine action is cancelled (no delta, no cargo credit, per
  `action-dispatch`'s cancel contract) and the movement slot is released,
  but the fleet's kinematic state and `attachedTo` remain exactly as they
  were — identical in outcome to cancelling the same run via
  `POST /v1/actions/:actionId/cancel`

#### Scenario: Cancelling the mine action directly leaves the fleet docked

- **WHEN** `POST /v1/actions/:actionId/cancel` is called on a running `mine`
  action claiming a docked fleet's movement slot
- **THEN** the movement slot is released and the fleet's kinematic state and
  `attachedTo` are unchanged

### Requirement: Derived Fleet Acceleration and Drive Output

The system SHALL derive a fleet's acceleration ceiling as the minimum of its
roster's per-class configured acceleration (the slowest hull gates the
fleet, mirroring the removed burn-rate rule), and its drive output as the
sum of its roster's per-class configured drive output (a bigger fleet is
louder), both computed fresh from the roster and configuration on every use
— never persisted as a separately stored total that could drift from the
roster. The system SHALL further derive a fleet's effective lane rate as
the minimum of its roster's per-class configured lane rate (3D lane-length
units per unit world-time), computed fresh on every use, and SHALL reject a
roster whose derived lane rate is not strictly positive. A burn order MAY
carry an optional commanded acceleration, bounded above by the fleet's
acceleration ceiling and below by `disclosure.MinCommandedAccel`; when
omitted it SHALL default to the fleet's acceleration ceiling. A supplied
commanded acceleration SHALL be a finite, strictly positive number; `NaN`,
±infinity, zero, and negative values SHALL be rejected with the same named
reason as an out-of-bounds value, checked before either bound comparison.

#### Scenario: Acceleration ceiling gates on the slowest hull

- **WHEN** a fleet's roster contains ships of differing class accelerations
- **THEN** the fleet's acceleration ceiling equals the slowest ship's class
  acceleration

#### Scenario: Drive output sums across the roster

- **WHEN** a fleet's roster is read
- **THEN** its drive output equals the sum of its roster's per-class
  configured drive output values

#### Scenario: A two-hull fleet has a strictly larger plume radius than a one-hull fleet at equal acceleration

- **WHEN** a one-hull fleet and a two-hull fleet of the same class both
  commit a burn at the same commanded acceleration
- **THEN** the two-hull fleet's drive output is larger, and the plume radius
  `disclosure.PlumeRadius` derives from it is strictly greater than the
  one-hull fleet's

#### Scenario: A commanded acceleration above the ceiling is rejected

- **WHEN** a burn order specifies a commanded acceleration greater than the
  fleet's acceleration ceiling
- **THEN** the order is rejected with its own named reason and no burn is
  solved

#### Scenario: A commanded acceleration below the disclosure floor is rejected

- **WHEN** a burn order specifies a commanded acceleration less than
  `disclosure.MinCommandedAccel`
- **THEN** the order is rejected with its own named reason and no burn is
  solved

#### Scenario: An omitted commanded acceleration defaults to the fleet's ceiling

- **WHEN** a burn order specifies no commanded acceleration
- **THEN** the burn is solved at the fleet's acceleration ceiling

#### Scenario: A non-finite or non-positive commanded acceleration is rejected

- **WHEN** a burn order specifies `NaN`, ±infinity, zero, or a negative
  commanded acceleration
- **THEN** the order is rejected with a named reason and no burn is solved

#### Scenario: Lane rate gates on the slowest hull

- **WHEN** a fleet's roster contains ships of differing class lane rates
- **THEN** the fleet's effective lane rate equals the slowest ship's class
  lane rate

### Requirement: Spawn Fleet Seeding Places a Park

The system SHALL provide a seeding primitive (`SeedFleet`) that drops a new
fleet, parked as a `point` park (never `stationkeep`, which would begin
charging upkeep before the corporation's first order), at a position in a
given system for a given corporation, deterministic from the account id and
idempotent per account, rejecting a requested seed position that lies at or
inside the system star's configured clearance radius.

#### Scenario: Seeding is deterministic and idempotent per account

- **WHEN** `SeedFleet` is called twice for the same account
- **THEN** both calls resolve to the same seed position and no second fleet
  is created

#### Scenario: Seeding inside the star's clearance radius is rejected

- **WHEN** `SeedFleet` is called with a position at or inside the system
  star's configured clearance radius
- **THEN** it fails with a named error and no fleet is created

### Requirement: Undecodable Stored Kinematic State Is Rejected, Never Panicked

Any stored kinematic-state value reaching `space` computation from a
Firestore document or a decoded action parameter SHALL be validated by the
`space` codec before use, at every boundary that reads persisted or
committed coordinate data. A value that fails to decode SHALL surface as a
named, countable error, never as a panic, carrying a `cause` field with one
of `non-finite-coordinate`, `coordinate-out-of-extent`,
`undecodable-shape`, or `unknown-body`, plus `actionType` and the action id
when the rejection occurred while decoding an action parameter.

#### Scenario: A fleet's stored kinematic state fails to decode

- **WHEN** a fleet read, mine command, or jump command resolves a stored
  kinematic state that fails the `space` codec's decode
- **THEN** the operation fails with a named sentinel error carrying a
  distinguishable `cause`, rather than a panic reaching `space` computation

#### Scenario: A decoded action parameter coordinate fails the codec

- **WHEN** an action's stored coordinate parameter fails to decode through
  the `space` codec
- **THEN** the decode is treated as a failure with a recorded `cause`, and
  the value is not passed to `space` computation

#### Scenario: Coordinate rejections are countable per cause

- **WHEN** a coordinate is rejected during a read or a resolve
- **THEN** the rejection is recorded as a structured log entry carrying
  `cause`, one of `non-finite-coordinate`, `coordinate-out-of-extent`,
  `undecodable-shape`, or `unknown-body`, plus `actionType` and the action
  id when the rejection occurred while decoding an action parameter

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
`POST /v1/fleets/:fleetId/orders/preview`,
`POST /v1/fleets/:fleetId/cancel`, `POST /v1/fleets/:fleetId/cut-drive`,
`POST /v1/fleets/:fleetId/stop`, `POST /v1/fleets/:fleetId/jump`,
`POST /v1/fleets/:fleetId/scan`, `POST /v1/fleets/:fleetId/hold`, and
`POST /v1/fleets/:fleetId/release`, compare `common.ActorCorp(c)` against
the named fleet's `corporationId` before acting, and SHALL respond `404
Not Found` — not `403` — when they do not match or when the requester has
no corporation, matching the read endpoints' own absence semantics: a
foreign fleet is indistinguishable from a nonexistent one, and a `403`
would itself confirm the id exists (design.md Decision 21). This closes
the authorization defect `Movement Command Endpoints Enforce No Fleet
Ownership` recorded as open, widened to cover the focused-scan endpoint:
an unchecked `scan` would let a foreign
corporation claim a victim fleet's sensor-channel slot and strip its
masking on demand (`focused-scan`'s "A Sweep Unmasks Its Scanner") for a
duration the attacker picks by naming a distant host, which is a sharper
hole than the five-endpoint movement gap this requirement's predecessor
closed, and would leave undefined whose corporation the resulting
sightings mint under. The sibling defect on the action-dispatch endpoints
(`/actions?actor=`, `/actions/:id`, `/acknowledge`, `/cancel`) closes in
`action-dispatch`'s own delta — closing only this side
would leave a bypass reaching the same movement or sensor slot through
`/actions/:id/cancel`. The same ownership check SHALL guard the
station-keeping hold and release verbs (see
"Station-Keeping Hold and Release Are Fleet Verbs"): an unchecked `hold`
would let a foreign corporation park another corporation's fleet into a
continuous fuel drain it never chose, and an unchecked `release` would let
a foreign corporation force another corporation's fleet off a deliberately
held position — both direct manipulations of a victim's fuel economy with
no corresponding benefit to the caller, the same shape of harm this
requirement already exists to close for every other command. The check
SHALL guard the burn preview endpoint this change introduces identically:
the preview's response is solved from the fleet's live position, velocity,
roster-derived acceleration, and held fuel, so an unchecked
`/orders/preview` would disclose all four to a foreign corporation, none of
which this capability discloses to a foreign requester by any other path
(see "Fleet Read Endpoints Serve Own Fleets In Full and Foreign Fleets As
Contacts").

#### Scenario: A foreign corp cannot order another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet
  F submits `POST /v1/fleets/F/orders` with a valid target
- **THEN** the response is `404 Not Found` and F's kinematic state is
  unchanged

#### Scenario: A foreign corp cannot preview another corp's fleet's burn
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/orders/preview` with a valid target
- **THEN** the response is `404 Not Found`, and no field of F's position,
  velocity, roster, or fuel appears in the response body

#### Scenario: A foreign preview is refused before anything is settled
- **GIVEN** fleet F, owned by another corporation, whose stored burn's
  arrival time has already passed and has not yet been settled
- **WHEN** a foreign or corpless requester submits
  `POST /v1/fleets/F/orders/preview`
- **THEN** the response is `404 Not Found` and F's stored record is
  byte-identical before and after the request — the ownership check runs
  ahead of the settlement seam, so no unauthorized caller triggers a write
  on a victim's fleet

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

#### Scenario: A foreign corp cannot start another corp's fleet station-keeping
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/hold`
- **THEN** the response is `404 Not Found` and F's park mode is unaffected

#### Scenario: A foreign corp cannot release another corp's fleet's station-keep hold
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/release`
- **THEN** the response is `404 Not Found` and F's park mode is unaffected

### Requirement: Every Body In the System's Body Table Is a Valid Attachment Host
The system SHALL treat every body present in a system's `space.Bodies`
table — a planet, moon, belt member, belt feature, trading station, or lane
gate alike — as a valid attachment target: a burn order whose **target** is
a body id, and which resolves into a settled park at that target, SHALL
attach the fleet to that body (setting `attachedTo` to the body's id)
regardless of the body's type, per "Places are bodies" (`decisions.md`,
2026-08-27). No body class SHALL be excluded from attachment on the basis
of its type alone.

This is not a relaxation of the system's star already being unreachable as
a burn target: "In-System Burn Order to a Body or a Point" rejects any
order naming the star, by `space.BuildCurve`'s endpoint-clearance guard,
for kinematic reasons (the star's insertion standoff sits inside its own
clearance radius) — a burn ordered at the star never resolves into a
settled park at all, so it never reaches this requirement's attach step.
This requirement SHALL NOT be read as relaxing, overriding, or creating an
exception to that geometric rejection.

This restates `BurnResolver`'s existing behavior (`fleet/resolver.go`'s
attach-on-resolve write reads only the resolved burn's own target body id,
never a type, class, or the endpoint's incidental coincidence with some
other body's position), rather than changing it: attachment follows the
burn's **target**, never whether the burn's endpoint happens to land near a
body it was never ordered toward — a point-targeted burn that ends up
coincident with, or near, some body attaches to nothing, because that body
was never the target.

If a stored `attachedTo` names a body the current body table no longer
resolves — a derived id whose defining tuning constant was retuned after
attachment (a belt member index beyond a retuned `AsteroidsPerBelt`), or a
lane gate a degraded gate read omits — a read of that fleet SHALL still
succeed, returning the fleet with its stored `attachedTo` unchanged and
NO position, the same absent-position shape "Effective Position
Resolution" already defines for a jumping fleet, and SHALL record the
unresolved host id. It SHALL NOT panic, SHALL NOT omit the fleet from the
read, and SHALL NOT silently substitute a position derived from anything
other than the named host.

Because attachment is `proximity-disclosure`'s masking predicate's sole
input (its "A Docked Ship Is Masked and Registers Only As Its Host"),
declaring every body a valid attachment host means every body is a place a
fleet can mask itself at — including a belt member, an id distinct from
its parent belt feature's own id. A focused scan resolves only against the
exact host id it names (`proximity-disclosure`'s "A Focused Scan Reveals
the Ships Masked At Its Target"); it does **not** extend to that host's
siblings under a shared parent. A focused scan of a belt feature therefore
does not reveal a fleet masked at one of that belt's members, and a
focused scan of one member does not reveal a fleet masked at another —
finding a fleet hidden somewhere in a belt can require sweeping the
feature and each of its members in turn. This is a stated consequence of
the existing masking predicate, not a new disclosure rule invented here;
`proximity-disclosure` itself is unchanged by this change.

#### Scenario: A fleet may attach to any body class present in the system
- **WHEN** a fleet's burn order settles into a park at a planet, a moon, a
  trading station, or a lane gate
- **THEN** the fleet attaches to that body in every case, with no
  class-based rejection distinguishing one from another

#### Scenario: A fleet may attach to a belt member or the belt feature alike
- **WHEN** a fleet's burn order settles into a park at a belt member's
  position, or at the belt feature's own position
- **THEN** the fleet attaches successfully to whichever id it targeted

#### Scenario: Ordering the star is rejected before any attachment step is reached
- **WHEN** a fleet is ordered to burn to the system's star, naming its
  body id
- **THEN** the order is rejected by `space.BuildCurve`'s endpoint-clearance
  guard, per "In-System Burn Order to a Body or a Point," before any
  settled park — and therefore any attachment — is ever reached

#### Scenario: A point-targeted park coincident with a body does not attach
- **WHEN** a fleet's burn order targets an explicit point, not a body id,
  and the solved park's position happens to coincide with, or lie very
  near, some body's position
- **THEN** the fleet's `attachedTo` remains empty — attachment is decided
  by the burn's target, never by the endpoint's incidental position

#### Scenario: A sweep of a belt feature does not reveal a fleet masked at one of its members
- **GIVEN** a fleet attached to a belt member, masked at that member's id
- **WHEN** a focused scan resolves against the belt feature's own id
  rather than the member's
- **THEN** no sighting record is minted for the fleet masked at the
  member — the sweep reveals only what is masked at the exact host id it
  named

#### Scenario: A fleet attached to a body the table no longer resolves degrades, never panics
- **GIVEN** a fleet whose stored `attachedTo` names a derived body absent
  from the current body table (a belt member index beyond a retuned
  `AsteroidsPerBelt`, or a lane gate omitted by a degraded gate read)
- **WHEN** the fleet is read
- **THEN** the read succeeds, the fleet is present in the response with
  its stored `attachedTo` unchanged and no position reported (the same
  absent-position shape a jumping fleet reports), the unresolved host id
  is recorded, and no panic occurs

### Requirement: A Burn's Fuel Cost Scales With Roster Hull Count, Never Loaded Mass
The system SHALL price a committed burn's fuel cost, in tons, as its
`space`-computed delta-v price (`space-kinematics`'s "A Burn's Delta-V
Price Equals Commanded Acceleration Times Flight Time") multiplied by the
fleet's roster hull count at commit time, divided by a configured constant
`FuelParams.DeltaVPerTon` (a placeholder value of 5.0, pending validation
in play — see design.md Open Questions). Hull count SHALL be read once, at
commit, from the fleet's roster as it stands at that instant — never
re-read mid-flight, and never derived from the fleet's currently loaded
cargo mass, fuel included. The system SHALL NOT compute, or permit any
future change to compute, a fleet's commanded acceleration, flight
duration, or `space`-computed delta-v price as a function of its loaded
cargo or fuel mass: coupling acceleration to loaded mass yields the rocket
equation, turns flight time into a differential equation, and destroys the
closed-form brachistochrone `space-kinematics` is built on
(`decisions.md`'s "Guardrail — acceleration does not depend on mass").
Scaling the fuel *price* by hull count is not such a coupling — hull count
is fixed for the duration of a single burn, so flight time remains the
closed-form brachistochrone of a fixed curve length at a fixed
acceleration; only the tons-per-unit-delta-v conversion changes with
roster size. This scaling keeps a fleet's maximum affordable range from
growing for free as its roster grows: "Derived Cargo Capacity and Mining
Rate" defines a fleet's cargo capacity as the sum of its roster's
per-class hold capacities, which — for a roster of a single hull class —
is proportional to hull count; scaling the fuel price by that same hull
count keeps a fleet's maximum affordable range independent of roster size
for as long as every hull in the roster is the same class. This
proportionality is a property of today's single-hull-class roster, not a
law this requirement enforces directly — a future hull class whose
per-class hold capacity does not scale proportionally with hull count
would need this requirement revisited (see design.md Open Questions);
until then, hull count is the correct, and only, scaling proxy available.

#### Scenario: A larger roster pays a proportionally larger fuel bill for the identical burn
- **WHEN** a one-hull fleet and a ten-hull fleet of the same class both
  commit the identical burn (same origin, target, curve, and commanded
  acceleration)
- **THEN** the ten-hull fleet's fuel cost in tons is exactly ten times the
  one-hull fleet's, because both burns' `space`-computed delta-v price is
  identical and only the hull-count multiplier differs

#### Scenario: Doubling a fleet's cargo mass changes neither its acceleration nor its flight duration
- **WHEN** the same burn is committed by a fleet carrying no cargo and by
  an otherwise identical fleet carrying cargo at half its free hold
- **THEN** both burns solve to the identical commanded acceleration,
  curve, flight duration, and `space`-computed delta-v price — only the
  resulting fuel-tons cost (a function of hull count, never loaded mass)
  can differ, and only if the fleets' hull counts differ

#### Scenario: Fuel cost and cargo capacity scale together for a single-class roster, leaving range roster-independent
- **WHEN** the maximum burn distance a one-hull fleet's full fuel hold
  affords is compared with the maximum burn distance a ten-hull fleet of
  the identical hull class's full fuel hold affords
- **THEN** the two maximum distances are equal, because both the fuel
  capacity available for a burn and that burn's fuel price scale by the
  identical hull-count factor when every hull in the roster is the same
  class

### Requirement: A Burn Commit Is Rejected When Its Fuel Cost Exceeds Available Fuel, Debited At Commit Never At Resolve
The system SHALL, before committing any burn this capability defines (the
body-or-point burn order in "In-System Burn Order to a Body or a Point"
and the committed-burn branch of "Stop In Place Commits a Velocity-Nulling
Burn"), compute that burn's fuel cost per "A Burn's Fuel Cost Scales With
Roster Hull Count, Never Loaded Mass" and compare it against the fleet's
currently held `fuel` tonnage, both evaluated against a **transactional
re-read of the fleet's actor state performed inside the same transaction
that claims the movement channel's slot** (see `action-dispatch`'s "Actions
Commit With an Atomically Claimed Slot") — a precondition satisfied only
by a pre-transaction read SHALL never be sufficient to commit or to debit,
closing the race between a burn's fuel debit and a concurrent, unserialized
instant mutation of the same fleet's `fuel` (e.g. a refuel) that neither
claims nor is blocked by any channel slot. This affordability check SHALL
be enforced by the transaction-scoped `ActorState` producer's failure path
(`action-dispatch`'s "A transaction-scoped producer's error aborts the
commit entirely"): the producer, evaluating the transactional re-read,
SHALL return a named error rather than a debited fields map when the cost
is unaffordable, so the rejection is enforced inside the same transaction
that performs the re-read, never merely computed from it and rejected by a
caller that could race past it. A commit whose fuel cost exceeds
available fuel SHALL be rejected with its own named reason, distinct from
every other commit rejection this capability defines — including the
persistent stranded condition "A Fleet's Read Reports a Persistent
Stranded Indication, Computed at the Acceleration Floor" defines, since
"this specific burn is too expensive" and "this fleet cannot afford any
burn, even at the floor" are different findings and SHALL carry different
rejection copy — and no burn SHALL be stored and no fuel SHALL be debited.
A commit whose fuel cost does not exceed available fuel SHALL debit the
fleet's `fuel` cargo by exactly that cost in the same commit that stores
the burn — never at the burn's resolve — so that a fleet's fuel balance
always reflects every committed-but-unresolved burn's full planned cost,
and a burn, once committed, can never later fail to resolve for lack of
fuel: the affordability check happens exactly once, at the moment the
fleet still has full discretion over whether to commit. **A rejected
commit SHALL apply none of its own effects: the fleet's prior movement
state SHALL be left exactly as the fleet's effective state —
`space.StateAt` evaluated at the moment the rejected order was submitted —
already reported it, and its `fuel` cargo SHALL carry no debit or credit
attributable to the rejected commit** — this applies identically when the
rejected commit was itself an attempt to replace an active, not-yet-arrived
burn ("A new order replaces an active one"): the prior burn's discard
refund ("Discarding a Running Burn Refunds Its Unspent Fuel, Closed-Form")
and the prior action's cancellation SHALL take effect only inside the same
transaction that stores the replacement burn, never before that
transaction is known to succeed — a fleet SHALL NOT have its running burn
cancelled, or its unspent fuel refunded, only to have the replacement
re-target rejected for its own unaffordability, leaving the fleet drifting
with no active order. This guarantee is scoped to the rejected commit's
**own** side-effects, and SHALL NOT be read as forbidding the durable
persistence of a settlement that a preceding, independent write committed
before the commit transaction began — in particular the settlement of an
already-elapsed station-keeping hold that `space.StateAt` already folds
(see "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First").
Such a settlement is categorically not an effect of the rejected order: it
changes no *effective* state, and it was already true of the fleet before
the order was submitted. The rationale this guarantee exists to serve is
entirely about the commit's own side-effects — the discard refund and the
prior action's cancellation must not take effect before the replacement
transaction is known to succeed, so a fleet is never left drifting with no
active order — and that rationale SHALL govern this guarantee's scope.

#### Scenario: An unaffordable burn is rejected and nothing is stored or debited
- **WHEN** a burn's computed fuel cost exceeds the fleet's currently held
  `fuel` tonnage
- **THEN** the commit is rejected with its own named reason, no burn is
  stored, and the fleet's `fuel` cargo carries no effect of the rejected
  commit — unchanged but for the durable settlement of an already-elapsed
  station-keeping hold that `space.StateAt` had already folded, which a
  preceding, independent write persisted before the commit transaction
  began and which changes no effective fuel figure

#### Scenario: An affordable burn debits fuel at the instant of commit
- **WHEN** a burn's computed fuel cost is at or below the fleet's
  currently held `fuel` tonnage
- **THEN** the commit succeeds, the burn is stored, and the fleet's `fuel`
  cargo is debited by exactly the computed cost in the same commit — not
  deferred to the burn's resolve

#### Scenario: A committed burn can never fail to resolve for lack of fuel
- **WHEN** a committed burn's arrival is later resolved
- **THEN** resolution proceeds exactly as it would with fuel-as-cargo
  absent from the game — no fuel check runs at resolve, because the full
  cost was already paid, and can never have been paid only partially, at
  commit

#### Scenario: A fuel cost exactly equal to available fuel is accepted
- **WHEN** a burn's computed fuel cost exactly equals the fleet's
  currently held `fuel` tonnage
- **THEN** the commit succeeds, leaving the fleet's `fuel` cargo at
  exactly zero

#### Scenario: A concurrent, unserialized refuel is never lost to a racing burn debit
- **WHEN** a burn commit's fuel debit and an unrelated refuel's fuel credit
  against the same fleet are submitted concurrently, with the refuel
  claiming no channel slot
- **THEN** both effects are reflected in the fleet's final `fuel` value —
  neither transaction's write is silently overwritten by the other's
  stale, pre-transaction computation of the resulting balance

#### Scenario: Rejection copy distinguishes "this burn is unaffordable" from "no burn is affordable"
- **WHEN** a burn commit is rejected for exceeding available fuel, for a
  fleet that could still afford some other, cheaper burn (e.g. at the
  acceleration floor, to a different target)
- **THEN** the rejection reason names only that this specific commit's
  fuel cost exceeds available fuel, and does not claim or imply that the
  fleet is stranded — that determination is made, and surfaced, only by
  "A Fleet's Read Reports a Persistent Stranded Indication, Computed at
  the Acceleration Floor"

#### Scenario: A rejected re-target leaves the prior burn running and fuel unchanged
- **WHEN** a fleet mid-burn toward one target is re-ordered to a different
  target whose fuel cost exceeds the fleet's currently held `fuel`
- **THEN** the commit is rejected, the fleet's original burn remains active
  and unaffected (never cancelled), and the fleet's `fuel` cargo is
  unchanged — the prior burn's discard refund is never credited, because
  the transaction that would have cancelled and refunded it never commits

### Requirement: A Burn Commit Warns, But Does Not Block, When It Would Leave the Fleet Unable to Reach a Station or Gate
The system SHALL, on an otherwise-accepted burn commit (per "A Burn Commit
Is Rejected When Its Fuel Cost Exceeds Available Fuel, Debited At Commit
Never At Resolve"), evaluate whether the fleet's remaining fuel after the
debit would afford at least one further burn — priced at
`disclosure.MinCommandedAccel`, the acceleration floor, **never** the
fleet's `DerivedAccelCeiling` — from the committed burn's resulting park,
to some station or lane-gate body present in the destination system's
body table, by solving a candidate burn to each such body in that system
at the floor acceleration and pricing each per "A Burn's Fuel Cost Scales
With Roster Hull Count, Never Loaded Mass," and, if none is affordable,
SHALL include a distinguishable, non-blocking warning in the commit's
response. Pricing at the floor, rather than the ceiling, is deliberate and
load-bearing: because `Δv = 2·√(commandedAcceleration × curveLength)` rises
with commanded acceleration, a fleet's cheapest possible burn — and
therefore its true maximum reach — is always the one flown at the floor;
pricing this evaluation at the ceiling would fire a false alarm against a
fleet that could in fact reach a station or gate by crawling, which is
fatal to a warning whose entire value is credibility. This warning SHALL
NOT reject the commit, SHALL NOT alter the burn that is stored, and SHALL
NOT itself consume any fuel beyond the committed burn's own already-debited
cost — the complaint `decisions.md` records about stranding is that it
happens invisibly, not that it happens at all, and this requirement exists
to make it visible, never to prevent it. The candidate set this evaluation
scans is bounded explicitly: every station and lane-gate body present in
the destination system's body table, and nothing else — not every body in
the table. This evaluation costs one floor-priced `space.SolveBurn` call
per candidate, and each such call itself runs `space.SolveRounds`'s fixed
round count internally (`space-kinematics`'s "Intercept Against a Moving
Target Runs a Fixed Number of Rounds") — so the honest cost is N ×
`SolveRounds` fixed-round iterations, N being the candidate count, not a
single closed-form solve and not merely N. A system with more
stations/gates costs proportionally more to evaluate, though N is bounded
by that system's realistic body count, never unbounded. A candidate solve
that fails with `space.ErrArcTooShort` SHALL count as **reachable at zero
cost**: that error occurs precisely when the candidate burn's curve would
be shorter than `space.MinArcLength`, which is exactly what happens when
the fleet's resulting park already sits at (or arrives at) that
candidate's own insertion standoff — the single most routine configuration
in the game, a fleet parked at or burning to its own refuelling point —
and treating it as unreachable would false-alarm against exactly that
case. A candidate solve that fails with any other named `space` error
SHALL count as unreachable, contributing nothing to the affordable set.

#### Scenario: A burn that leaves the fleet unable to reach any station or gate, even at the acceleration floor, is still accepted, with a warning
- **WHEN** a burn commit's post-debit remaining fuel would not afford a
  floor-priced solved burn to any station or lane-gate body in the
  destination system
- **THEN** the commit still succeeds and the burn is stored exactly as it
  would be without this requirement, and the response carries a
  distinguishable warning naming the condition

#### Scenario: A burn that leaves the fleet able to reach at least one station or gate at the acceleration floor carries no warning
- **WHEN** a burn commit's post-debit remaining fuel affords a
  floor-priced solved burn to at least one station or lane-gate body in
  the destination system
- **THEN** the response carries no stranding warning, even if that same
  remaining fuel would not afford a burn to that body at the fleet's
  acceleration ceiling

#### Scenario: The warning never blocks a commit that fuel affordability alone would accept
- **WHEN** a burn's fuel cost is affordable but the post-debit remaining
  fuel cannot reach any station or gate even at the acceleration floor
- **THEN** the commit still succeeds — the warning is advisory only, and
  this requirement rejects no commit "A Burn Commit Is Rejected When Its
  Fuel Cost Exceeds Available Fuel, Debited At Commit Never At Resolve"
  would otherwise accept

#### Scenario: A candidate reachable only below the acceleration ceiling still suppresses the warning
- **WHEN** the fleet's post-debit remaining fuel would afford a burn to a
  candidate station or gate only at an acceleration below its
  `DerivedAccelCeiling`, and specifically at or above
  `disclosure.MinCommandedAccel`
- **THEN** that candidate counts as reachable and suppresses the warning —
  reachability is never evaluated only at the ceiling

#### Scenario: A candidate too close to solve counts as reachable at zero cost
- **WHEN** a candidate station or gate body's floor-priced solve fails with
  `space.ErrArcTooShort` (the fleet's resulting park already sits at, or
  arrives at, that candidate's own insertion standoff)
- **THEN** that candidate counts as reachable at zero cost, and the warning
  is not fired on its account

### Requirement: A Fleet's Read Reports a Persistent Stranded Indication, Computed at the Acceleration Floor
The system SHALL include, on the fleet read endpoints ("Fleet Read
Surfaces Roster, Cargo, and Derived Capacity") for an owning corporation
reading its own fleet, a persistent, distinguishable stranded indication,
recomputed fresh on every read (never cached from, or limited to, a past
commit response): the fleet reads as stranded when its currently held
`fuel` would not afford a solved burn, priced at
`disclosure.MinCommandedAccel` (the acceleration floor, per "A Burn Commit
Warns, But Does Not Block..."), to any station or lane-gate body present
in its current system's body table. This indication SHALL be distinct
from, and SHALL NOT be conflated with, an idle fleet that simply has no
active order — a fleet with ample fuel and no current order is idle, not
stranded, and this indication SHALL read false for it. This requirement
exists because "A Burn Commit Warns..." fires only once, at the instant a
commit creates the condition; a player who misses that one-shot warning,
or who inspects a fleet's condition later without having witnessed the
triggering commit, would otherwise have no way to discover a stranded
fleet except by attempting burns and watching them fail. This indication
SHALL reuse "A Burn Commit Warns..."'s own candidate-evaluation rule for a
`space.SolveBurn` failure: a candidate that fails with `space.ErrArcTooShort`
counts as reachable at zero cost (the fleet is already at, or arriving at,
that candidate's own insertion standoff — the routine case of a fleet
parked at its home station), and a candidate that fails with any other
named `space` error counts as unreachable — a docked fleet with a full
tank SHALL NEVER read as stranded merely because solving a burn back to its
own dock is geometrically too short to solve.

#### Scenario: A fleet unable to afford any floor-priced burn to a station or gate reads as stranded
- **WHEN** an owning corporation reads a fleet whose currently held `fuel`
  would not afford a floor-priced solved burn to any station or lane-gate
  body in its current system
- **THEN** the read includes the stranded indication set true, independent
  of whether any commit ever produced the one-shot warning for this fleet

#### Scenario: A fleet that can still reach a station or gate at the floor does not read as stranded
- **WHEN** an owning corporation reads a fleet whose currently held `fuel`
  affords a floor-priced solved burn to at least one station or lane-gate
  body in its current system
- **THEN** the stranded indication reads false, even if that same fuel
  would not afford the same burn at the fleet's acceleration ceiling

#### Scenario: An idle fleet with ample fuel is never reported as stranded
- **WHEN** an owning corporation reads a fleet with no active order and
  fuel well in excess of any floor-priced burn to a reachable station or
  gate
- **THEN** the stranded indication reads false, distinguishable from any
  representation of "idle"

#### Scenario: A docked fleet with a full tank never reads as stranded merely because its own dock is too close to solve
- **WHEN** an owning corporation reads a fleet docked at a station, whose
  only candidate for the floor-priced reachability solve is that same
  station and whose solve fails with `space.ErrArcTooShort`
- **THEN** that candidate counts as reachable at zero cost and the fleet
  does not read as stranded, regardless of its held `fuel`

### Requirement: Discarding a Running Burn Refunds Its Unspent Fuel, Closed-Form
The system SHALL, whenever a running, not-yet-arrived burn is discarded
before its stored arrival time — by **any** means this capability defines,
never an enumerated subset: a cut-drive order (see "Cut Drive Converts the
Burn to a Drift and Goes Dark"), a new movement-channel order superseding
it before arrival (an ordinary re-target — see "In-System Burn Order to a
Body or a Point"'s "A new order replaces an active one" — or either branch
of "Stop In Place Commits a Velocity-Nulling Burn," **including its free,
below-the-speed-floor branch**), or a cancellation
(`POST /v1/fleets/:fleetId/cancel` or `POST /v1/actions/:actionId/cancel`)
— credit the fleet's `fuel` cargo with the unspent portion of that burn's
already-debited cost. This trigger is deliberately universal rather than
enumerated: a discard path this requirement's own text failed to name
would otherwise silently drop a fully-debited burn's unspent refund, which
is exactly the shape of bug stop-in-place's free branch exposed — that
branch converts the fleet to a `point` park with no delta-v charge for the
stop *itself*, but if it discards an active burn to do so (possible when
the fleet's live speed happens to be at or below the floor while a burn is
still running), that burn's own already-debited cost is refunded exactly
as it would be by any other discard, never silently forfeited because the
stop that discarded it was itself free. The burn's fuel
cost in tons, as computed and debited at its own original commit per "A
Burn's Fuel Cost Scales With Roster Hull Count, Never Loaded Mass," SHALL
be stored on the burn record itself at commit time — this is new persisted
state this change adds, one field, not a re-derivation from hull count and
acceleration at discard, and not a roster re-read at discard. The refund
is that stored cost multiplied by the unspent fraction of the flight:
delta-v spent by the discard instant τ is `commandedAcceleration × τ`
(τ measured from the burn's stored depart time), so the unspent fraction is
`(flightDuration − τ) / flightDuration`, applied directly to the stored
debited-cost-in-tons field. A burn discarded at or after its arrival time
is not a discard under this requirement (it has already settled; "Cut
Drive Converts the Burn to a Drift and Goes Dark"'s own arrival-time
rejection applies).

#### Scenario: Cutting a burn immediately after commit refunds nearly its full cost
- **WHEN** a burn is cut by cut-drive at a millisecond very close to its
  stored depart time
- **THEN** the fleet's `fuel` cargo is credited with an amount very close
  to the burn's full stored debited cost

#### Scenario: Cutting a burn just before arrival refunds almost nothing
- **WHEN** a burn is cut by cut-drive at a millisecond very close to its
  stored arrival time
- **THEN** the fleet's `fuel` cargo is credited with an amount very close
  to zero

#### Scenario: Re-targeting mid-burn refunds the discarded burn's unspent fuel
- **WHEN** a fleet mid-burn toward one target is re-ordered to a different
  target before arriving, superseding the active burn
- **THEN** the fleet's `fuel` cargo is credited with the discarded burn's
  unspent portion, computed from the discarded burn's own stored
  debited-cost field, before the new order's own fuel cost is evaluated
  and debited

#### Scenario: A stop-in-place order that supersedes an active burn refunds it before charging the stop
- **WHEN** stop-in-place commits a velocity-nulling burn against a fleet
  whose prior burn was still running and not yet arrived
- **THEN** the prior burn's unspent fuel is refunded before the new
  stopping burn's own fuel cost is debited

#### Scenario: Stop-in-place's free, below-the-floor branch still refunds a preceding running burn
- **WHEN** stop-in-place is ordered against a fleet whose live speed is at
  or below the configured stop-in-place speed floor while it holds an
  active, not-yet-arrived burn
- **THEN** the fleet's `fuel` cargo is credited with that burn's unspent
  portion, computed from its own stored debited-cost field, even though the
  stop itself charges no new delta-v and creates no new committed action

#### Scenario: The refund is symmetric with the original debit's stored cost, not a re-derivation from the roster at discard time
- **WHEN** a fleet's roster changes between a burn's commit and its
  discard (a hull is lost or gained between the two)
- **THEN** the refund is still computed from the debited-cost-in-tons field
  stored on the discarded burn at its own original commit, never
  re-derived from the roster's hull count as it stands at the discard
  instant

### Requirement: Fleet Read Reports an Estimated Maximum Range From Current Fuel
The system SHALL include, on the fleet read endpoints ("Fleet Read
Surfaces Roster, Cargo, and Derived Capacity") for an owning corporation
reading its own fleet, a server-computed estimated maximum range: the
straight-line curve length a single burn at `disclosure.MinCommandedAccel`
— the acceleration floor, never the fleet's `DerivedAccelCeiling` — could
cover on the fleet's currently held `fuel` tonnage alone, derived by
inverting "A Burn's Fuel Cost Scales With Roster Hull Count, Never Loaded
Mass" and "Flight Time Is the Brachistochrone of the Curve's Arc Length"
(`space-kinematics`) for the held fuel converted to a delta-v budget, at
that floor acceleration. Pricing at the floor, not the ceiling, is
required because `Δv = 2·√(commandedAcceleration × curveLength)` rises
with commanded acceleration: solving for the maximum curve length a fixed
delta-v budget affords gives `curveLength = Δv² / (4 × commandedAcceleration)`,
which is maximised at the *minimum* legal acceleration — a range computed
at the ceiling reports the fleet's *shortest*, not its longest, possible
reach. This value is advisory (an achievable-if-spent-entirely-on-one-burn
figure, not a reservation or a promise), computed only by this capability
using `space`'s own formulas — never re-derived client-side, per
`space-kinematics`'s "Every Rule-Bearing Value of This Capability Is
Computed Only in the Authoritative Implementation."

#### Scenario: Estimated range grows with held fuel
- **WHEN** a fleet's estimated range is computed for two different held
  `fuel` tonnage values, all else equal
- **THEN** the larger tonnage yields the larger estimated range

#### Scenario: Zero fuel yields zero estimated range
- **WHEN** a fleet holds zero `fuel`
- **THEN** its reported estimated range is exactly zero

#### Scenario: The reported range is computed at the acceleration floor, not the ceiling
- **WHEN** a fleet's estimated range is computed for a fleet whose
  `DerivedAccelCeiling` is strictly greater than
  `disclosure.MinCommandedAccel`
- **THEN** the reported range equals the range solved at
  `disclosure.MinCommandedAccel`, which is strictly greater than the range
  that same fuel tonnage would afford at the fleet's acceleration ceiling

### Requirement: Fleet Read Serves the Configured Fuel Price, Never Duplicated Client-Side
The system SHALL, on the fleet read endpoints ("Fleet Read Surfaces
Roster, Cargo, and Derived Capacity") for an owning corporation reading its
own fleet, include the currently configured `FuelParams.PricePerTon`
(`fuel-purchase`'s "A Single Global Fuel Price, Unlimited Station Supply,
No Station-Side Write") as a served field — the same value the fleet's own
refuel settlement charges — so that any client-side preview of a refuel's
cost is computed from this served value and can never diverge from what
the settlement actually charges. No client-side constant duplicating this
price SHALL be maintained; a client-side preview SHALL read this served
field on every render, following `fleet-movement`'s existing precedent of
serving another capability's data on the fleet DTO ("Fleet Read Serves the
Attached Gate's Lane Id"). This field is served under the same
owning-corporation-only visibility every other field "Fleet Read Surfaces
Roster, Cargo, and Derived Capacity" defines already carries — a foreign
fleet is omitted from a list read and 404s on a direct fetch per "Fleet
Read Endpoints Serve Own Fleets In Full and Foreign Fleets As Contacts",
so there is no foreign-fleet response for this field, or any other, to
appear on.

#### Scenario: The served fuel price matches the settlement's charged rate
- **WHEN** an owning corporation's fleet read's served fuel price is
  compared against the unit price a refuel settlement for that same fleet
  actually charges
- **THEN** the two are identical, because both derive from the same
  configured `FuelParams.PricePerTon` value

### Requirement: Station-Keeping Hold and Release Are Fleet Verbs
The system SHALL serve `POST /v1/fleets/:fleetId/hold` and
`POST /v1/fleets/:fleetId/release` as instant fleet verbs — no
`action-dispatch` action is created, no channel slot is claimed, and no
ETA is computed by either. `hold`, submitted against a fleet whose
effective park mode is currently `orbit`, SHALL convert it to a
`stationkeep` park holding the fleet's current offset from its host body
at the instant of the call, and SHALL, in the same transaction, compute
and store the hold's start time and its dry instant per "Station-Keeping
Upkeep Is Settled at Discrete Events, Never Folded Into the Stored Cargo
Pool" — debiting no fuel at that instant. `release`, submitted against a
fleet whose effective park mode is currently `stationkeep` and strictly
before that hold's stored dry instant, SHALL settle the hold's accrued
upkeep and convert it back to an `orbit` park per `space-kinematics`'s
"Releasing a Station-Keep Hold Re-Circularizes at the Held Offset's Planar
Radius." Both SHALL be rejected with their own named reason, distinct from
one another, against a fleet whose effective state is not the mode each
requires (a burn, a drift, a `point` park, or the wrong park mode) — hold
and release are not substitutes for one another and neither substitutes
for a burn order. Because the automatic fold at the dry instant means a
`stationkeep` park observed at or after its dry instant IS already an
`orbit` park (see `space-kinematics`'s "A Station-Keeping Park Past Its Dry
Instant Is Its Released Orbit, With No Extra Persisted State"), a `release`
submitted at or after the dry instant SHALL be rejected by the same
not-station-keeping reason as any other non-`stationkeep` effective state —
there is no clamped, at-the-boundary release path, and no rule in this
capability SHALL define one.

Both verbs SHALL, after the lane-transit rejection below (which forbids
evaluating stored kinematic state at all) but before evaluating any of
their own state preconditions, first resolve the fleet's movement-channel
**burn** whose arrival time has passed but which has not yet been resolved,
where one exists — mirroring, for the same reason, "In-System Burn Order to
a Body or a Point"'s "Ordering over a completed-but-unresolved order settles
it first". This obligation is scoped to a due **burn** specifically, not to
every action that may occupy the movement channel: a co-resident action of
another type on that slot (a mine run against a docked fleet) leaves no
stale kinematic state for either verb to misread, and settling one is not
this requirement's concern. A body-targeted burn past its arrival time folds
through `space.StateAt` into an `orbit` park, so an
arrived-but-unresolved fleet presents to `hold` as an ordinary orbiting
fleet and would be accepted while the movement channel's slot is still
claimed and the arrival's own exactly-once effects — setting the fleet's
`attachedTo`, and charting an arrived-at gate's lane — have not yet been
applied. Storing a `stationkeep` park over that unresolved state makes the
pending resolution find a state that is no longer a burn and apply none of
them, leaving a fleet holding a fixed offset from a host body it is not
attached to, with the arrival's effects permanently dropped. This is stated
here rather than assumed from the codebase, because settling first is not
what every existing fleet verb does — the stop-in-place path does not.

Both verbs SHALL then, still before evaluating any of their own state
preconditions, **settle a `stationkeep` park that is at or after its stored
dry instant** — folding it to its released orbit and persisting `cargo.fuel`
at exactly `FuelParams.StationKeepReserveTons` — per "Every Decision Reading
Fuel Settles a Past-Dry-Instant Hold First", and by the preceding,
independent, conditional transaction that requirement mandates wherever the
reading decision is itself a transaction that may abort. `hold` is exactly
such a decision: its own insufficient-fuel precondition below reads the
fleet's stored `fuel` to decide, and its commit transaction rejects.
`release` is **not** such a decision — it reads `fuel` to *debit*, not to
decide, so that requirement's "wherever" clause does not by itself select
it — but its settlement of a past-dry-instant hold SHALL **likewise** be
carried by that same preceding, independent, conditional write, never by a
write inside `release`'s own transaction, which rejects (by the
not-station-keeping reason, a past-dry-instant hold being already folded to
`orbit`) and would therefore discard it. Consequently every assertion this
change makes about the `fuel` a past-dry-instant `release` leaves behind —
in particular "A release at exactly the dry instant is rejected, the fold
having already released the hold"'s assertion that the fleet's `fuel` is
exactly the configured station-keeping reserve — is an assertion against the
**stored fleet document** after the call, not against an in-memory fold.

**Without this step `hold` grants indefinite free station-keeping**, and no
other rule in this capability stops it. A hold whose dry instant has
silently passed IS an `orbit` park by the automatic fold named at the head
of this requirement (`space-kinematics`'s "A Station-Keeping Park Past Its
Dry Instant Is Its Released Orbit, With No Extra Persisted State"), so the
not-orbiting precondition accepts the fleet as an ordinary orbiting one; the stored
`fuel` still over-reports by the whole accrual, exactly in the window "Every
Decision Reading Fuel Settles a Past-Dry-Instant Hold First" exists to
close; and a fresh dry instant computed from that over-reported figure and
stamped over the elapsed hold's own start time and dry instant forgives the
entire accrued upkeep (up to `fuelAtHoldStart −
FuelParams.StationKeepReserveTons`) and skips the automatic force-demotion
altogether. Re-issuing `hold` once after each dry instant would hold a
position forever for the fuel of a single hold — the gate camper paying
nothing, which is the outcome this change's whole upkeep economy exists to
prevent. The general settle-first rule already reaches `hold` through its
"or any other computation of a fleet's currently held fuel" clause; it is
restated here as an ordered step of the verb because an implementer builds
this sequence literally, and an ordered list that omits the step is what
ships the exploit.

Both verbs SHALL additionally be rejected, before any evaluation of the
fleet's stored kinematic state, when the fleet is in lane transit — the one
state in which this capability forbids evaluating stored kinematic state at
all ("Effective Position Resolution": a fleet in transit has no position in
either system and its stale stored state SHALL NOT be evaluated by any
reader) — served as `409 Conflict` carrying this capability's existing
lane-transit reason, the same reason a jump or a burn order against a
transiting fleet already carries. Neither `hold` nor `release` SHALL itself
cost delta-v; the continuous cost while held is the upkeep this change's
"Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded Into
the Stored Cargo Pool" defines. Neither `hold`, `release`, nor the
automatic force-demotion this change defines SHALL alter the fleet's
`attachedTo` field or its docked/undocked status — only the park's kind
(and, for `release`/force-demotion, its orbit parameters) change.

`hold` SHALL be rejected, with its own named reason distinct from the
not-orbiting rejection, whenever the dry instant computed per "Station-
Keeping Upkeep Is Settled at Discrete Events, Never Folded Into the Stored
Cargo Pool" is not strictly after the hold's start time — which, given that
formula's ceiling, occurs exactly when the fleet's currently held `fuel` is
at or below the configured station-keeping reserve
(`FuelParams.StationKeepReserveTons`), the tonnage a hold may never spend
(any strictly positive spendable remainder above the reserve ceilings to a
dry-instant offset of at least one whole millisecond, so this is not merely
"small fuel," it is specifically "no spendable fuel above the reserve").
Accepting such a `hold` would store a `stationkeep` park whose dry instant
equals its start time, a value `space-kinematics`'s own decode requirement
("A station-keep park with a missing or invalid dry instant fails to
decode") rejects outright — bricking the fleet's every subsequent read and
command the instant that park is persisted, exactly the population of
stranded, near-empty fleets link 7 made discoverable in the first place.
This precondition guards only `hold`'s own commit; a verb that ends or
abandons an already-open hold is guarded separately, by "Station-Keeping
Upkeep Is Settled at Discrete Events..."'s hold-ending settlement bullet,
which never restamps and therefore never re-triggers this same undecodable
state by a different path.

Each of the three rejections above — `hold` against a fleet that is not
orbiting, `hold` against a fleet whose `fuel` is at or below the reserve,
and `release` against a fleet that is not station-keeping — SHALL be served
as `409 Conflict` carrying its own reason in the response body's `error`
field, the three reasons being pairwise distinct. `409` is the status this
capability's command surface uses for the five state-precondition and
resource-insufficiency rejections of a fleet command that are wired today —
lane transit, a jump without attachment to the named gate, an
already-claimed action slot, an out-of-range or occluded sweep, and a burn
whose fuel cost exceeds available fuel — while `400 Bad Request` is
reserved for a malformed or ambiguous request body and `404 Not Found` for
absence and foreign ownership. This is the convention to follow; it is not
a universal claim about every rejection this capability defines, and an
implementer SHALL NOT infer the wiring from the nearest structural sibling:
cut-drive's own wrong-effective-state rejection is at present **unwired**,
falling through to a bodyless `500` in violation of its own live
requirement (see this change's tasks for its repair). None of the three
rejections above SHALL be served as a bodyless `5xx`.

#### Scenario: Holding converts an orbiting fleet to station-keep at its current offset
- **WHEN** `hold` is submitted for a fleet whose effective park mode is
  `orbit`
- **THEN** the fleet's park mode becomes `stationkeep`, holding its exact
  offset from its host body at the call instant, with no action created,
  no delta-v charged, and no fuel debited yet

#### Scenario: Releasing converts a station-keeping fleet back to orbit
- **WHEN** `release` is submitted for a fleet whose effective park mode is
  `stationkeep`, strictly before its stored dry instant
- **THEN** the fleet's park mode becomes `orbit`, re-circularized per
  `space-kinematics`'s re-circularization rule, with no action created and
  no delta-v charged beyond the settled upkeep

#### Scenario: Holding a fleet that is not orbiting is rejected by name
- **WHEN** `hold` is submitted for a fleet whose effective state is a
  burn, a drift, a `point` park, or an already-`stationkeep` park
- **THEN** the response is `409 Conflict` carrying its own named reason,
  and the fleet's state is unchanged

#### Scenario: Holding a fleet with insufficient fuel is rejected, not silently bricked
- **WHEN** `hold` is submitted for an orbiting fleet whose currently held
  `fuel` is at or below the configured station-keeping reserve, so the
  computed dry instant would not be strictly after the hold's start time
- **THEN** the response is `409 Conflict` carrying its own named reason,
  distinct from the not-orbiting rejection's, no `stationkeep` park is
  stored, and the fleet's park mode is unchanged

#### Scenario: Holding with fuel just above the reserve is accepted
- **WHEN** `hold` is submitted for an orbiting fleet whose currently held
  `fuel` is strictly greater than the configured station-keeping reserve,
  by however small a margin
- **THEN** the hold is accepted, a `stationkeep` park is stored, and its
  computed dry instant is strictly after its stored hold-start time — the
  ceiling carrying any strictly positive spendable remainder to an offset of
  at least one whole millisecond

#### Scenario: Releasing a fleet that is not station-keeping is rejected by name
- **WHEN** `release` is submitted for a fleet whose effective state is
  anything other than `stationkeep`
- **THEN** the response is `409 Conflict` carrying its own named reason,
  distinct from both of hold's rejection reasons, and the fleet's state is
  unchanged

#### Scenario: Holding or releasing a fleet in lane transit is rejected by name
- **WHEN** `hold` or `release` is submitted for a fleet currently in lane
  transit
- **THEN** the response is `409 Conflict` carrying this capability's
  existing lane-transit reason, the fleet's stored kinematic state is never
  evaluated to reach that rejection, and neither the fleet's stored state
  nor its `fuel` cargo is mutated

#### Scenario: Holding or releasing over a completed-but-unresolved movement order settles it first
- **WHEN** `hold` or `release` is submitted for a fleet whose
  movement-channel **burn** has already passed its arrival time but has not
  yet been resolved
- **THEN** that burn's action is resolved first — settled, its slot
  released, and its exactly-once arrival effects (the fleet's `attachedTo`,
  and any gate-lane charting) applied — and only then are the verb's own
  preconditions evaluated, against the resulting settled state

#### Scenario: Holding over a silently expired hold settles it first and is then rejected
- **GIVEN** a fleet whose `stationkeep` hold's stored dry instant has
  already passed, with no intervening read or write having observed or
  settled it, so its stored `fuel` still shows the figure it held when that
  hold began
- **WHEN** `hold` is submitted for that fleet, which the fold already
  presents as an ordinary orbiting fleet
- **THEN** the elapsed hold is settled first — folded to its released orbit
  with `cargo.fuel` persisted at exactly the configured station-keeping
  reserve — by a write that precedes and is independent of `hold`'s own
  transaction
- **AND** `hold`'s own preconditions are then evaluated against that settled
  figure, so the new hold is rejected `409 Conflict` with the
  insufficient-fuel reason, its spendable fuel above the reserve being zero
- **AND** no second `stationkeep` park is stored — the fleet's stored park
  is the released `orbit` the settlement wrote, carrying no hold-start time
  and no dry instant — and the accrued upkeep the elapsed hold incurred is
  never forgiven

#### Scenario: A fleet's attachment survives hold, release, and force-demotion
- **WHEN** a fleet attached to a body is held, later released (or force-
  demoted), and its `attachedTo` field is inspected before and after each
  transition
- **THEN** `attachedTo` and the fleet's docked/undocked status are
  identical before and after every one of the three transitions — only the
  park's kind and, where applicable, its orbit parameters change

### Requirement: Station-Keeping Upkeep Never Drains a Fleet Below Its Reserve
The system SHALL hold back a configured, strictly positive station-keeping
reserve — `FuelParams.StationKeepReserveTons`, a named tuning constant, not
a literal at any call site — from every station-keeping hold: the tonnage
of `fuel` that station-keeping upkeep may never spend. A hold's dry instant
SHALL be computed against `fuelAtHoldStart − StationKeepReserveTons`, not
against `fuelAtHoldStart`, and the automatic force-demotion at that dry
instant SHALL leave the fleet holding exactly
`StationKeepReserveTons` — never zero, and never negative.

This exists because station-keeping is the one path on which a fleet
strands **passively, while doing nothing**: `decisions.md` (2026-08-29)
rules that station-keeping upkeep SHALL NOT drain a fleet to zero, and its
own 2026-09-02 correction records that stranding is permanent, no
cargo-transfer verb existing anywhere in the tree. A settlement to exactly
zero would therefore deliver precisely the outcome that guardrail forbids.
The reserve **does not claim to be "enough to get home"** — no such
quantity is locally computable, which is exactly why `decisions.md` rejects
a blanket reserve against *burns*, where stranding is a decision the player
made. This reserve is scoped to passive drain alone: it is simply non-zero,
so a fleet retains some agency after an upkeep drain it never chose.
Reserving fuel against a burn remains forbidden; a player may still burn
their last ton to zero and strand, and this requirement SHALL NOT be read
as licensing any reserve on that path.

#### Scenario: An exhausted hold leaves exactly the reserve, never zero
- **WHEN** a station-keeping fleet is observed at or after its stored dry
  instant and the force-demotion is settled
- **THEN** its `fuel` tonnage is exactly the configured station-keeping
  reserve — strictly positive, never zero, never negative

#### Scenario: The reserve is never spent by upkeep across repeated hold cycles
- **GIVEN** a fleet whose hold has passed its stored dry instant with **no
  intervening read, write, or setup step having observed or settled it** —
  its stored `fuel` still showing the pre-hold figure rather than the
  reserve
- **WHEN** a further `hold` is submitted against that fleet
- **THEN** the elapsed hold is settled first, and the second `hold` is then
  rejected by its own named reason (its spendable fuel above the reserve
  being zero), leaving the fleet's `fuel` at exactly the reserve — repeated
  holding can never grind the reserve away

#### Scenario: A burn may still spend the reserve down to zero
- **WHEN** a burn whose fuel cost equals the fleet's entire held `fuel`,
  reserve included, is committed against a fleet that is not
  station-keeping
- **THEN** the commit succeeds and the fleet's `fuel` lands at exactly zero
  — the reserve constrains station-keeping upkeep alone, never a burn the
  player chose to commit

### Requirement: Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded Into the Stored Cargo Pool
The system SHALL denominate a hold's accrued upkeep by delegating to
`space-kinematics`'s own authoritative upkeep function
(`space.StationKeepUpkeep(rate, fromMs, toMs)`), which takes two
`WorldMillis` stamps and **already performs the milliseconds-to-seconds
conversion internally**, and then converting the Δv figure it returns to
tons by the same `FuelParams.DeltaVPerTon` conversion "A Burn's Fuel Cost
Scales With Roster Hull Count, Never Loaded Mass" uses for a burn,
**without** the hull-count multiplier — station-keeping is a per-fleet
positional hold, not a burn, and this change does not extend the hull-count
scaling ruling to it. `rate`, here and at every later use in
this requirement, is `space.StationKeepRate` evaluated for the park's host
body — strictly positive by that function's own configured floor, which is
what makes the ceiling-quantized inverse below finite rather than
unbounded. That is:

```
upkeepTons(fromMs, toMs) =
    space.StationKeepUpkeep(rate, fromMs, toMs) / FuelParams.DeltaVPerTon
```

**No caller SHALL restate that function's arithmetic inline.** In
particular a caller SHALL NOT divide an elapsed `WorldMillis` difference by
`1000` before passing it in, and SHALL NOT divide the returned figure by
`1000` afterwards: `space.StationKeepUpkeep` has already done it, and doing
it a second time under-charges by a factor of `1000`. Restating the
conversion here would also duplicate, in this capability, a value
`space-kinematics` reserves to its own authoritative implementation.

`hold`'s commit SHALL compute and store the hold's dry instant as the
inverse of that same function: the earliest world time `T`, quantized **up**
to an integer millisecond, at which `space.StationKeepUpkeep(rate,
holdStart, T)` reaches or exceeds the hold's **spendable** Δv budget

```
spendableDeltaV =
    (fuelAtHoldStart − FuelParams.StationKeepReserveTons)
        × FuelParams.DeltaVPerTon
```

— quantized up, never down, mirroring `space-kinematics`'s "Burn Timing
Quantizes to Integer World-Milliseconds by Ceiling," so a hold is never
folded dry one millisecond before it is truly exhausted. The subtraction of
the reserve is load-bearing (see "Station-Keeping Upkeep Never Drains a
Fleet Below Its Reserve"): a dry instant computed against the full
`fuelAtHoldStart` would settle the fleet to zero, the outcome the guardrail
forbids. `fuelAtHoldStart × FuelParams.DeltaVPerTon` is a Δv budget and
`FuelParams.DeltaVPerTon` is Δv **per ton**, so the conversion between the
two is a multiplication in this direction and a division in the other;
**inverting either one** understates a hold's endurance by
`DeltaVPerTon²` (25× at today's placeholder value of 5.0), and this
requirement states the direction explicitly rather than leaving it to be
inferred. `hold` SHALL be rejected, with its own named reason distinct
from the not-orbiting rejection, whenever this computation yields a
`dryInstant` that is not strictly after `holdStart` — which, given the
ceiling, occurs exactly when `fuelAtHoldStart` is at or below
`FuelParams.StationKeepReserveTons` — since persisting such a park would
store a `dryInstant` equal to its `holdStart`, a value `space-kinematics`'s
own decode requirement ("A station-keep park with a missing or invalid dry
instant fails to decode") rejects outright, bricking the fleet's every
subsequent read and command the instant that park is persisted.

The fleet's stored `fuel` cargo value SHALL NOT be decremented merely by
elapsed hold time; it SHALL be settled only at a discrete event, computed
closed-form from the hold's stored start time and the event's own world
time — never as accumulated per-tick state, per `space-kinematics`'s "No
Value Is Derived From Accumulated Per-Tick State". The discrete settlement
events are exactly:
- `release`, called strictly before the hold's stored dry instant, SHALL
  debit `cargo.fuel` by exactly `upkeepTons(holdStartTime, releaseTime)`,
  in the same transaction that converts the park to orbit. **No clamp
  applies to this debit and none SHALL be specified**: because
  `releaseTime` is strictly before the dry instant, and the dry instant is
  by construction the first instant at which the accrual reaches the
  spendable budget, this debit is provably strictly less than
  `fuelAtHoldStart − StationKeepReserveTons`, so the fleet is left holding
  strictly more than the reserve. A `release` at or after the dry instant
  is not a clamped debit but a rejection: the fold has already released the
  hold, and the verb is rejected by the not-station-keeping reason (see
  "Station-Keeping Hold and Release Are Fleet Verbs").
- A `stationkeep` park observed (by any read or write) at or after its
  stored dry instant SHALL be folded by `space.StateAt` into its released
  orbit as of that dry instant (see `space-kinematics`'s "A Station-Keeping
  Park Past Its Dry Instant Is Its Released Orbit, With No Extra Persisted
  State"), with `cargo.fuel` settled to exactly
  `FuelParams.StationKeepReserveTons` — never zero, never negative — in the
  same write that first persists the fold.
- **Any mutation of `cargo.fuel` by another verb while a `stationkeep`
  hold is open and before its stored dry instant, that leaves the hold
  open afterward** (in particular, a refuel purchase settled while docked
  at a station the fleet is simultaneously holding beside, since `hold`,
  `release`, and `fuel-purchase`'s docked-state precondition are
  independent of one another and nothing in this capability prevents a
  fleet from being both attached to, and station-keeping near, the same
  station) **SHALL, in the same transaction as that mutation:** first
  debit `upkeepTons(holdStartTime, mutationTime)`, exactly as a `release`
  would but without converting the park to orbit; then apply the
  mutation's own delta against the resulting balance; then **restamp the
  hold's stored start time to the mutation's own instant and recompute the
  dry instant from the fuel level immediately after the mutation**.
  Without this, a hold's dry instant is fixed against a fuel baseline a
  later, independent mutation has silently moved, and the automatic
  past-dry-instant fold would settle the wrong amount — up to and including
  settling a just-purchased refuel down to the reserve the moment the stale
  dry instant is next observed. Exactly one mutation this capability's
  "Fleet Cargo Pool" enumerates both is reachable during an open hold and
  leaves that hold open: a refuel, which is a **credit**, so the recomputed
  dry
  instant is necessarily strictly after the restamped hold-start. A
  discarded burn's refund is **not** such a path, and SHALL NOT be wired as
  one: a refund arises only from a running, not-yet-arrived burn (see
  "Discarding a Running Burn Refunds Its Unspent Fuel, Closed-Form"), and a
  fleet whose state is a running burn has no park at all, so no
  `stationkeep` hold can ever be open when a refund lands. A future
  `fuel`-**debiting** verb that leaves a hold open would have to state its
  own disposition for the case where the post-mutation balance falls to or
  below the reserve, and no such verb
  exists today.
- **Any verb that ends or abandons an open `stationkeep` park** — a burn
  commit that replaces the park, a stop-in-place that converts the fleet to
  a `point` park (including its free, below-the-speed-floor branch, which a
  fleet holding at a motionless lane gate always takes, its velocity being
  exactly its motionless host body's), a jump that leaves the stored park
  behind and settles a fresh park at the destination, or any future such
  path — **SHALL, in the same transaction that ends or abandons it, first
  debit `upkeepTons(holdStartTime, eventTime)`**, exactly as a `release`
  would, before applying its own effects; and SHALL NOT restamp the hold or
  compute a fresh dry instant, since no hold remains to restamp. **No path
  SHALL end a hold without settling it.** This is stated as one universal
  rule rather than a per-verb enumeration precisely because the per-verb
  form is what left `stop` and `jump` forgiving the accrual in an earlier
  draft — a fleet camping a lane gate, the thing this upkeep most exists to
  price, held and then stopped or jumped for free. For a burn commit
  specifically, the burn's own fuel cost (per "A Burn Commit Is Rejected
  When Its Fuel Cost Exceeds Available Fuel...") is evaluated and debited
  against the balance remaining **after** this settlement, and the
  committed burn is stored in place of the
  `stationkeep` park. This settlement debit is the *hold's* already-accrued
  upkeep, not a charge for the ending verb: it therefore does not disturb
  "Lane Jump From an Attached Gate"'s "Jump costs no delta-v" or "Stop In
  Place Commits a Velocity-Nulling Burn"'s free below-the-floor branch,
  each of which constrains that verb's own price and neither of which
  forgives a debt incurred before it was invoked. A verb ending a hold that
  is already at or past its stored dry instant instead settles via the
  automatic past-dry-instant fold above, before its own preconditions
  evaluate, per "Every Decision Reading Fuel Settles a Past-Dry-Instant
  Hold First" — and where that ending verb reads `cargo.fuel` neither to
  decide anything nor as a `FreeHold` consumer, **that fold SHALL be
  carried by the verb's own hold-ending transaction**, exactly as the
  not-yet-dry settlement above is, and SHALL NOT be hoisted into a
  preceding, independent write. `jump` and `stop` are today's two such
  verbs; they are deliberately **absent** from the consumers "Every
  Decision Reading Fuel Settles a Past-Dry-Instant Hold First" enumerates,
  and SHALL NOT be added to them. Such a verb SHALL NOT then also apply
  the `upkeepTons` debit on top of that fold: the fold has already priced
  the whole hold, settling `cargo.fuel` to exactly
  `FuelParams.StationKeepReserveTons`, and charging both would debit one
  accrual twice.

  The abort-with-an-answer hazard that forces the burn commit, the
  transaction-scoped free-hold figure a refuel re-evaluates inside its own
  settlement transaction, and `hold`'s own commit to settle in a
  **preceding, independent** write does not reach these two, and this
  requirement states why rather than leaving a future reader to "fix" it
  back. Those three read `fuel` **to decide** — affordability, free hold,
  sufficiency — so a settlement discarded along with their rejection would
  leave them deciding against a stale, over-reported figure. `jump` and
  `stop` read it for neither purpose. If such a verb's transaction aborts —
  a jump rejected for not being attached to the named lane's own gate body,
  or for already being in lane transit — then **no hold was ended**: the
  fleet is still station-keeping, still at or past its stored dry instant,
  and the next fuel-reading consumer settles it by the ordinary rule above.
  Nothing is lost and nothing is stale, because that settlement's only
  purpose inside that transaction was to price a hold the transaction
  turned out not to end. The universal hold-ending rule therefore subsumes
  the past-dry case inside the verb's own transaction, and doing so is
  **self-healing rather than lossy** — where hoisting it into a preceding
  write would buy nothing and would add one more unserialized `cargo.fuel`
  writer.

This reuses the two park modes "Station-Keeping Hold and Release Are Fleet
Verbs" already defines; no new park mode is invented for the
force-demoted case.

#### Scenario: Releasing before exhaustion debits exactly the accrued upkeep, converted to tons
- **WHEN** a station-keeping fleet's hold is released strictly before its
  stored dry instant
- **THEN** the fleet's `fuel` cargo decreases by exactly
  `space.StationKeepUpkeep(rate, holdStartTime, releaseTime) /
  FuelParams.DeltaVPerTon`, and no more — the elapsed duration is passed to
  that function as two `WorldMillis` stamps, never pre-divided by `1000`,
  and its result is never divided by `1000` again
- **AND** the fleet is left holding strictly more than the configured
  station-keeping reserve, with no clamp applied to reach that result

#### Scenario: A release at exactly the dry instant is rejected, the fold having already released the hold
- **WHEN** `release` is submitted for a fleet at exactly the world time of
  its hold's stored dry instant
- **THEN** the response is `409 Conflict` carrying the not-station-keeping
  reason — the "at or after" fold has already made the fleet's effective
  park an `orbit` park, so there is no `stationkeep` hold left to release
- **AND** the fleet's `fuel` is exactly the configured station-keeping
  reserve, settled by that fold rather than by any clamped release debit

#### Scenario: A read during an open hold reports the stored, unsettled fuel value
- **WHEN** a station-keeping fleet's `fuel` cargo is read twice at
  different world times during one uninterrupted, unreleased hold, both
  before the stored dry instant
- **THEN** both reads report the identical stored value — neither read
  triggers or reflects a partial settlement

#### Scenario: Fuel exhaustion during a hold force-demotes to orbit, never negative
- **WHEN** a station-keeping fleet is observed at or after its stored dry
  instant
- **THEN** its park is folded to `orbit`, re-circularized at the held
  offset's planar radius as of the dry instant, and its `fuel` tonnage
  reads exactly the configured station-keeping reserve — never zero, never
  negative — once that fold is persisted

#### Scenario: A hold that never reaches its dry instant is never demoted
- **WHEN** a station-keeping fleet is observed strictly before its stored
  dry instant
- **THEN** its park remains `stationkeep`, unsettled, and unchanged

#### Scenario: Releasing settles the accrual before any subsequent hold recomputes a fresh dry instant
- **WHEN** a station-keeping fleet is released and later held again
- **THEN** the first hold's accrual is settled by the release exactly once,
  and the second hold computes an entirely new dry instant from the fuel
  level and world time at its own commit, independent of the first hold's
  history

#### Scenario: A burn committed from an open station-keeping hold settles its accrued upkeep and replaces the park, without restamping
- **WHEN** a burn is committed against a fleet whose effective park is
  `stationkeep`, open and before its stored dry instant
- **THEN** the transaction first debits the accrued upkeep since the
  hold's stored start time, then evaluates and debits the burn's own fuel
  cost against the resulting balance, then stores the committed burn in
  place of the `stationkeep` park — with no dry instant recomputed and no
  hold restamped, since the hold no longer exists once the burn is stored

#### Scenario: A burn that would leave exactly zero fuel after settlement still commits, never bricking the fleet
- **WHEN** a burn is committed against an open station-keeping hold whose
  settlement, followed by the burn's own fuel cost, would leave the fleet
  holding exactly zero `fuel`
- **THEN** the commit still succeeds, storing the burn in place of the
  `stationkeep` park — no `stationkeep` park with a dry instant equal to a
  restamped hold-start is ever persisted by this path, since a burn
  commit's settlement never restamps, and the station-keeping reserve does
  not constrain a burn the player chose to commit

#### Scenario: Stopping a fleet holding at a motionless gate settles its accrued upkeep
- **WHEN** a stop-in-place order is submitted against a fleet whose
  effective park is an open `stationkeep` hold at a motionless lane gate,
  so its live speed is exactly zero and the free, below-the-speed-floor
  branch is taken
- **THEN** the same transaction that converts the fleet to a `point` park
  first debits the upkeep accrued since the hold's stored start time — the
  free branch charges no delta-v of its own, and still never forgives the
  hold's accrual
- **AND** the resulting `point` park, the cleared `attachedTo`, and the
  upkeep debit are all **durably persisted**, as observed by re-reading the
  stored fleet document, for a fleet that has **no active movement action**
  to cancel — a station-keeping fleet has none, `hold` claiming no channel
  slot, so a settlement carried only on an action-cancellation write would
  persist nothing at all on precisely this path

#### Scenario: Jumping from an open hold settles its accrued upkeep
- **WHEN** a jump is committed against a fleet whose effective park is an
  open `stationkeep` hold at the named lane's gate body
- **THEN** the same transaction that commits the jump first debits the
  upkeep accrued since the hold's stored start time, so a fleet that camps
  a gate under a hold and then jumps has paid for the hold — the jump
  itself still costs no delta-v

#### Scenario: A jump against a past-dry-instant hold settles it in the jump's own transaction
- **WHEN** a jump is committed against a fleet whose stored `stationkeep`
  park is already at or after its dry instant, unobserved by any prior
  write
- **THEN** the settlement — the fold to the released orbit, with
  `cargo.fuel` persisted at exactly `FuelParams.StationKeepReserveTons` —
  is carried by the jump's **own** commit transaction, not by a preceding,
  independent write, since the jump reads `cargo.fuel` neither to decide
  anything nor as a `FreeHold` consumer
- **AND** no `upkeepTons` hold-ending debit is applied on top of that fold,
  so the accrual is charged exactly once, and the jump itself still costs
  no delta-v

#### Scenario: A rejected jump leaves a past-dry-instant hold open and unsettled for the next reader
- **GIVEN** a fleet whose stored `stationkeep` park is already at or after
  its dry instant, unobserved by any prior write
- **WHEN** a jump against that fleet is rejected — it is not attached to
  the named lane's own gate body, or it is already in lane transit — so its
  transaction applies **none** of its effects, the settlement among them
- **THEN** the fleet's stored park is still that unsettled `stationkeep`
  park and its stored `cargo.fuel` still shows the pre-fold figure, no hold
  having been ended
- **AND** the next consumer that reads that fleet's fuel settles it by the
  ordinary past-dry-instant rule, to exactly the configured
  station-keeping reserve — nothing is forgiven and nothing is lost by the
  abort

#### Scenario: A refuel during an open hold settles the accrual, restamps the hold, and recomputes the dry instant
- **WHEN** a fleet's `fuel` cargo is credited by a refuel purchase while it
  is station-keeping, before that hold's stored dry instant
- **THEN** the transaction first debits the upkeep accrued since the
  hold's stored start time, then credits the refuel's tonnage, then
  restamps the hold's stored start time to the refuel's instant and
  recomputes the dry instant from the resulting fuel level — the refuel's
  full credited tonnage is never silently forfeited to a stale dry instant
  computed against the pre-refuel fuel level

### Requirement: Hold and Release Settle In One Transaction Against a Transactional Re-Read
The system SHALL apply `hold`'s park conversion and `release`'s settlement
debit and park conversion each inside **one** transaction that re-reads the
fleet's current park, hold fields, and `cargo.fuel` and re-evaluates every
precondition against that transactional re-read — a precondition satisfied
only by a pre-transaction read SHALL never be sufficient to commit or to
debit. Neither verb creates an `action-dispatch` action, so neither claims
a channel slot, and **nothing else serializes them against any other
`cargo.fuel` mutator**: a refuel (`fuel-purchase`'s "One Atomic Transaction
— Credit Debit and Fuel Credit"), a concurrent burn commit's debit, the
settle-first write "Every Decision Reading Fuel Settles a Past-Dry-Instant
Hold First" requires of every fuel-reading consumer, and a second copy of
the same `hold` or `release` request are all unserialized with respect to
these verbs — four distinct mutators, none of which any channel slot
orders against the other. Absent the transactional re-read, a `release`
and a refuel landing together resolve last-write-wins on `cargo.fuel`, and
the purchased fuel — and the credits spent on it — vanish; this is the same
class of defect as the refuel double-submit that turned out to be real in
production, not merely on paper. `hold` and `release` SHALL each be
idempotent in effect against a double submission: two identical concurrent
`hold` requests SHALL leave exactly one `stationkeep` park with exactly one
hold-start time and one dry instant, and two identical concurrent `release`
requests SHALL debit the accrued upkeep exactly once.

#### Scenario: A concurrent release and refuel both take effect
- **WHEN** a `release`'s upkeep debit and an unrelated refuel's fuel credit
  against the same fleet are submitted concurrently, with neither claiming
  a channel slot
- **THEN** both effects are reflected in the fleet's final `fuel` value —
  neither transaction's write is silently overwritten by the other's stale,
  pre-transaction computation of the resulting balance, and no purchased
  tonnage is lost

#### Scenario: A double-submitted hold stores exactly one park
- **WHEN** two identical `hold` requests for the same fleet are submitted
  concurrently against an orbiting fleet
- **THEN** exactly one `stationkeep` park is stored, carrying exactly one
  hold-start time and one dry instant computed from one transactional
  re-read — the second request observes the first's park and is rejected by
  the not-orbiting reason, never storing a second park over the first's
  stamps

### Requirement: Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First
The system SHALL, before evaluating any decision that reads a fleet's
`cargo.fuel` value to decide something — a burn commit's affordability
check ("A Burn Commit Is Rejected When Its Fuel Cost Exceeds Available
Fuel..."), `fleet.FreeHold` (consumed by `mine`'s commit-time
precondition, `mine`'s resolve-time clamp `freeHoldAtResolve`, a plain
fleet-read consumer, `fuel-purchase`'s own
pre-transaction free-hold precondition, and the transaction-scoped
free-hold figure `fuel-purchase`'s own settlement re-evaluates — five
production call sites, not four), the fleet read's estimated-maximum-range
computation ("Fleet Read Reports an Estimated Maximum Range From Current
Fuel"), the fleet read's persistent stranded indication ("A Fleet's Read
Reports a Persistent Stranded Indication, Computed at the Acceleration
Floor"), or any other computation of a fleet's currently held fuel — first
check whether that fleet's stored park is a `stationkeep` park at or after
its stored dry
instant, and if so, settle it (fold to its released orbit, persist
`cargo.fuel` at exactly `FuelParams.StationKeepReserveTons`, per "A
Station-Keeping Park Past Its Dry Instant Is Its Released Orbit...")
**before** evaluating the decision against that fuel value. No decision
consumer SHALL read the stale, over-reported stored `fuel` figure a
past-dry-instant hold would otherwise still show between the instant its
dry instant passes and whatever unrelated write next happens to observe
it — every one of the consumers named above SHALL settle-then-read, never
read-then-maybe-settle-later. This universal rule exists precisely because
an enumerated subset would, and did in an earlier draft, silently drop the
two most player-visible reads: a stale range figure looks like a healthy
one, and a stale stranded indication reads "not stranded" for a fleet that
in fact holds only its reserve — a cry-wolf failure in reverse.

Where the reading decision is itself a transaction that may abort **with an
answer**, so that a settlement written inside it would be discarded along
with the rejection — the burn commit, the transaction-scoped free-hold
figure a refuel re-evaluates inside its own settlement transaction, and
`hold`'s own commit transaction (whose insufficient-fuel precondition is one
of the "any other computation of a fleet's currently held fuel" cases above,
and which rejects rather than retries) are the three such cases in hand —
the settlement SHALL be committed by a **separate write that precedes, and
is independent of, that transaction**, never as a write inside it.

That preceding write is **necessary but not sufficient**, because it is a
*separate* transaction: it reads the fleet at one instant and the deciding
transaction re-reads it at a later one, and the dry instant may fall in
between — a Firestore round trip, and arbitrarily more *world* time under a
scaled `common.NewWorldTime(epoch, scale)` clock. In that window the
settlement write, correctly finding a not-yet-expired park, writes
**nothing**, while the deciding transaction's own re-read finds a park that
is by then past its dry instant — folding to `orbit`, so a not-orbiting
precondition passes — alongside a `cargo.fuel` figure that still
over-reports the entire accrual. Each of those three transactions SHALL
therefore additionally verify, against its **own** transactional re-read,
that no `stationkeep` park at or after its stored dry instant remains, and
SHALL abort, applying **none** of its own effects, when one does — the
preceding settlement write having been issued from an earlier read, the dry
instant may have passed in between. `hold` surfaces that abort as its
insufficient-fuel rejection (the settled figure being exactly
`FuelParams.StationKeepReserveTons` by construction, so no hold is
affordable); the burn commit and the refuel surface it as a **retryable**
failure that applies nothing, whose retry issues a fresh preceding
settlement write that now observes the past dry instant and settles it, so
the retried decision evaluates against the settled figure. This check is
**fail-closed by construction**: its only failure mode is a spurious abort
of a decision that could have proceeded, never a decision permitted to
proceed against an unsettled figure, and any implementation whose worst
case is the latter has inverted it.

Without it, "is there an unsettled past-dry park?" is only ever an
**ordered step discharged by a preceding write**, and never a
**precondition of the deciding transaction itself** — which is exactly the
gap: a `hold` re-issued once after each dry instant lands in that window,
passes both preconditions against the stale figure, and is restamped with a
fresh dry instant computed from it, forgiving the whole accrued upkeep and
skipping the force-demotion, so a position is held forever for the fuel of
a single hold. The dry instant is deterministic and player-visible, so this
is repeatably reachable rather than crash-only. The same window reaches the
other two: the burn commit debits its cost from the stale figure — a burn
paid for with fuel already spent on upkeep — and a refuel credits its
purchased tonnage onto un-settled fuel, so the next reader's fold sets
`cargo.fuel` to exactly the reserve and destroys both the purchased tonnage
and the credits spent on it.

This is required by two live requirements this change does not modify:
`action-dispatch`'s "A transaction-scoped producer's error
aborts the commit entirely" guarantees that a rejecting producer persists
**no** actor-state mutation, so a settlement written inside a rejecting
commit would by construction be discarded; and "A Burn Commit Is Rejected
When Its Fuel Cost Exceeds Available Fuel..." requires a rejected commit to
leave the fleet's prior movement state and `fuel` cargo as they were, which
constrains the *commit's own* effects. Settling first, in its own committed
write, satisfies both: the commit transaction persists nothing of its own on
rejection, and the settlement — which is not an effect of the order but the
observation of a demotion that had already occurred at the dry instant, and
which changes no *effective* movement state, since `space.StateAt` already
folds that park to its released orbit whether or not the fold is persisted —
is durable either way, so the next reader never trips over the stale value.

`mine`'s resolve-time clamp is deliberately **not** among them, and SHALL
instead settle a past-dry-instant hold **within the resolve's own
transaction**. Two reasons, either sufficient. First, the rationale above
does not apply to it: `action-dispatch`'s resolve transaction never rejects
with an answer — a resolver's error aborts the transaction and leaves the
action `running` for a later resolve to retry — so a settlement written
inside it is retried, never silently dropped, and the resolve result's own
actor-state merge lands on the same fleet document in that same transaction.
Second, no outcome depends on the choice: a settlement only ever *debits*
`fuel`, so it can only **widen** free hold (see `mine-extraction`'s "Resolve
Clamps Yield to Reality"), and the run's requested tonnage was already
admitted at commit against a free-hold figure no production writer can since
have narrowed, so the resolve clamp cannot bind on either figure. Requiring
a preceding, independent write here would instead oblige a new per-type
pre-resolve seam in `action-dispatch` that no requirement in this change or
any other authorizes.

That preceding, independent settlement write SHALL itself be **one
transaction that re-reads the fleet's stored park and its `cargo.fuel`**,
and SHALL apply its settlement only if that re-read still shows an
unfolded `stationkeep` park at or after its stored dry instant; otherwise
it SHALL write **nothing**. It SHALL NOT set `cargo.fuel` from any value
read outside that transaction. Without this rule the settle-first write is
a fourth unserialized mutator of `cargo.fuel` (see "Hold and Release Settle
In One Transaction Against a Transactional Re-Read"), issued by any of the
consumers this requirement enumerates, performing an unconditional
absolute set of `cargo.fuel` to the reserve from a figure read before the
write began: a refuel that had already settled the same hold to the
reserve — folding it to its released orbit, no restamp applying to a hold
already past its dry instant — and then credited its purchased tonnage in
its own correct transaction is silently overwritten by a plain read's
settlement, and the purchased tonnage and the credits spent on it are both
lost. That is the same last-write-wins class this change already closes for
`hold` and `release`, and it is not closed by requiring the settlement to
precede the decision — only by requiring it to be conditional on a
transactional re-read.

#### Scenario: A settlement write racing a refuel never discards the purchased fuel
- **WHEN** a fuel-reading consumer's settle-first write for a
  past-dry-instant hold and an unrelated refuel's own settle-credit-restamp
  transaction against the same fleet are submitted concurrently
- **THEN** the fleet's final `fuel` value reflects the refuel's credited
  tonnage in full — the settlement write, re-reading the park inside its own
  transaction and finding the hold already settled and folded to its
  released orbit — no restamp being applicable, the hold having been past
  its dry instant and therefore no longer open when the refuel landed —
  writes nothing at all rather than setting `cargo.fuel` back to the reserve
  from a value it read before the refuel landed

#### Scenario: A burn commit against a past-dry-instant holding fleet evaluates against settled, reserve-level fuel
- **WHEN** a burn is committed against a fleet whose `stationkeep` park's
  dry instant has already passed but has not yet been observed by any
  prior write
- **THEN** the commit's affordability check evaluates against the settled
  fuel value — exactly the configured station-keeping reserve — not the
  stale, pre-fold value the stored field still shows, so a burn costing
  more than the reserve is rejected with the named insufficient-fuel reason
  ("A Burn Commit Is Rejected When Its Fuel Cost Exceeds Available Fuel,
  Debited At Commit Never At Resolve") and a burn costing no more than the
  reserve commits
- **AND** the settlement (fold to orbit, `fuel` persisted at exactly the
  reserve) is committed by a write that **precedes and is independent of**
  the burn's own commit transaction — so a rejected commit leaves the
  settlement durable while itself persisting nothing, and the abort
  semantics `action-dispatch` guarantees for a failing transaction-scoped
  producer are preserved exactly

#### Scenario: FreeHold used by mine's resolve clamp reflects a settled hold
- **WHEN** `mine`'s resolve-time clamp computes `freeHoldAtResolve` for a
  fleet whose `stationkeep` hold's dry instant has already passed
- **THEN** the computation uses the settled fuel value (the hold folded to
  its released orbit, `fuel` at exactly the reserve), never the stale
  pre-fold value that would otherwise over-report the fleet's available
  capacity
- **AND** that settlement is applied **within the resolve's own
  transaction**, not by a preceding, independent write — a resolver error
  aborts that transaction and leaves the action `running` to be retried, so
  no settlement is lost by being written inside it

#### Scenario: A refuel's free-hold precondition reflects a settled hold
- **WHEN** `fuel-purchase`'s free-hold precondition is evaluated for a
  fleet whose `stationkeep` hold's dry instant has already passed
- **THEN** the precondition is evaluated against the settled fuel value,
  never a stale, over-reported pre-fold value that could reject an
  otherwise-affordable refuel or admit an otherwise-oversized one
- **AND** that settled value is durably persisted by a write that precedes
  the decision, not merely folded in memory for this one consumer

#### Scenario: A fleet's estimated range reflects a settled hold before the range is computed
- **WHEN** a fleet's estimated-maximum-range field is computed for a fleet
  whose `stationkeep` park's dry instant has already passed
- **THEN** the range is computed from the settled fuel value, never the
  stale pre-fold value that would otherwise report a range afforded by fuel
  the hold has already spent
- **AND** that settled value is durably persisted by a write that precedes
  the decision, not merely folded in memory for this one consumer

#### Scenario: A fleet's persistent stranded indication reflects a settled hold before it is computed
- **WHEN** a fleet's persistent stranded indication is computed for a
  fleet whose `stationkeep` park's dry instant has already passed
- **THEN** the indication is computed from the settled fuel value, never
  the stale pre-fold value that could read a fleet as not stranded merely
  because its dry instant has not yet been observed by any other write
- **AND** that settled value is durably persisted by a write that precedes
  the decision, not merely folded in memory for this one consumer

#### Scenario: A hold whose dry instant passes between the settle-first write and the commit is rejected, never restamped
- **GIVEN** a station-keeping fleet whose stored dry instant has **not** yet
  passed at the instant `hold`'s preceding, independent settlement write
  re-reads it, so that write correctly persists nothing
- **WHEN** that dry instant passes before `hold`'s own commit transaction
  performs its re-read, so the commit's re-read finds a `stationkeep` park
  at or after its stored dry instant — folding to `orbit`, and therefore
  passing the not-orbiting precondition — alongside a stored `cargo.fuel`
  still showing the whole pre-hold figure
- **THEN** the commit aborts on that re-read instead of evaluating its
  preconditions against the stale figure, and is rejected `409 Conflict`
  carrying the insufficient-fuel reason
- **AND** no second `stationkeep` park is stored, no hold-start time or dry
  instant is restamped, and the elapsed hold's accrued upkeep is never
  forgiven
- **AND** a burn commit and a refuel whose own transactional re-read meets
  the same condition each apply **none** of their own effects — no burn
  cost is debited from, and no purchased tonnage is credited onto, the
  stale figure — failing retryably, so the retry's own preceding settlement
  write observes the now-past dry instant and settles it before the
  decision is re-evaluated

### Requirement: Burn Order Preview Solves Without Committing
The system SHALL serve `POST /v1/fleets/:fleetId/orders/preview`, accepting
the same target shape "Order Request Validation" defines for a body id or
an explicit point (never a `laneId` — a jump has no variable curve or
delta-v to preview, since it costs no delta-v and its ETA is a direct
function of lane length and the fleet's lane rate) and the same optional
commanded acceleration "Derived Fleet Acceleration and Drive Output"
defines for `orders`. It SHALL solve the identical burn `orders` would
solve for that target from the same fleet state — reusing the same target
resolution, `space.SolveBurn` call, fuel-cost computation, affordability
check, and stranding evaluation steps "In-System Burn Order to a Body or a
Point," "A Burn's Fuel Cost Scales With Roster Hull Count, Never Loaded
Mass," "A Burn Commit Is Rejected When Its Fuel Cost Exceeds Available
Fuel, Debited At Commit Never At Resolve," and "A Burn Commit Warns, But
Does Not Block, When It Would Leave the Fleet Unable to Reach a Station or
Gate" already perform at commit — and SHALL return the solved curve's six
control points, its departure and arrival world-times, its delta-v cost,
its fuel cost in tons, whether that cost is affordable against the fleet's
currently held fuel, and whether the resulting park would carry the
stranding warning.

The preview SHALL be available exactly when a commit of the same order
would be available, and SHALL be rejected exactly where a commit would be
rejected, **with two stated exceptions, both named below — an
insufficient-fuel condition SHALL NOT reject a preview, and a movement
channel held by a running mine SHALL refuse a preview even though the
commit path does not refuse it**. Where a commit whose solved fuel cost exceeds
the fleet's currently held `fuel` is rejected ("A Burn Commit Is Rejected
When Its Fuel Cost Exceeds Available Fuel, Debited At Commit Never At
Resolve"), the preview of that same order SHALL instead be **served in
full** — the complete solve, with its affordability indication reading
false — because the preview exists precisely so a player can discover that
a target is out of reach before committing, and a rejection would leave
that player with no arrival time, no delta-v, and no fuel figure to plan a
refuel or a nearer target against. This is the first of the two
divergences between the two paths' rejection sets; the second is the
held-movement-channel case described below. Every other rejection below is
shared.

In particular the preview SHALL be served for a fleet that is currently
burning — re-targeting mid-flight is an ordinary commit against the fleet's
live tangent (`space-kinematics`'s "Departure Is Tangent to the Ship's Actual Motion at Commit"),
and it is the highest-stakes order in the game, so forbidding its preview
while permitting its commit would remove the quote from the decision that
most needs one. It SHALL be rejected, with the commit path's own named
reason, where the commit path rejects: a fleet in lane transit; an ambiguous
or empty target; an out-of-bounds commanded acceleration; a target body
absent from this system's body table; and a target whose solved curve
violates `space.BuildCurve`'s endpoint-clearance guard, which is the sole
mechanism by which the system's own star is excluded. An insufficient-fuel
condition is explicitly **not** a member of that set: it is reported on a
served response, never as a rejection. The preview SHALL NOT
apply a destination-identity check of any kind against the star or any
other body: a star target is rejected because its solve fails the clearance
guard, on the same code path and with the same observable reason as a
commit, and a preview that short-circuited before the solve would
reintroduce exactly the identity special case `fleet.ErrCoreDestination`'s
deletion removed.

A movement channel already claimed by a **non-burn** verb — a running mine —
SHALL refuse the preview, and this refusal SHALL NOT be specified as
mirroring a commit rejection, **because the commit path has no such
rejection**. `OrderTo`'s re-task branch cancels whatever holds the fleet's
movement-channel slot without inspecting its type, so a burn ordered against
a mining fleet is accepted today and the running mine is cancelled with no
warning and no compensation — an open production defect recorded in
`docs/handoffs/defect-burn-cancels-running-mine.md`,
whose resolution (reject, warn, or forfeit the run) is an undecided gameplay
question. This change is additive and SHALL NOT alter that behaviour, and
SHALL NOT be read as requiring the commit to reject. The preview therefore
carries **its own named refusal reason**, which is not required to match any
commit reason, and — being a pure read — SHALL cancel nothing, SHALL leave
the running mine action running and its slot held, and SHALL write nothing:
a preview cannot mirror a commit that proceeds by cancelling the run, since
a preview never writes. Refusing rather than quoting is the conservative
choice while the defect stands, so the preview never hands a player a quote
for an order whose commit would silently destroy a committed run. The
parity clause above SHALL NOT be extended to this case unless and until a
corrective change makes the commit path reject.

The ownership check "Fleet Command Endpoints Are Restricted to the Owning
Corporation" defines SHALL run **before** the settlement seam described
below, and SHALL be the first thing the handler does after resolving the
fleet. A foreign or corpless requester's preview SHALL therefore reach no
settlement, no solve, and no write of any kind. Ordering the check after
the settlement would let an unauthorized caller trigger a state-mutating
write on a victim's fleet, and would make the `404` observably slower when
that fleet has an arrival due than when it does not — a timing side channel
disclosing the victim's kinematic state through a response this requirement
otherwise renders indistinguishable from a nonexistent fleet's.

The preview SHALL create no `action-dispatch` action, claim no channel
slot, debit no fuel, and store no burn. Its only permitted persisted effect
is the settlement of an already-due arrival: like every other door onto a
fleet, the preview SHALL resolve a movement action whose ETA has already
passed through the shared fold-first settlement seam before solving, and
SHALL solve from the settled state — because a preview that solved from an
unsettled state would disagree with the commit that immediately follows it
in precisely the case the parity guarantee exists for. Beyond that
settlement, an arbitrary number of previews against the same fleet SHALL
leave its stored state byte-identical: the second and every later preview
of a fleet with nothing due SHALL write nothing at all.

#### Scenario: A preview returns the same curve, ETA, and cost a commit would produce
- **WHEN** a preview is requested for a target, and the identical order is
  committed from the same fleet state and the same world time
- **THEN** the preview's returned control points, departure time, arrival
  time, delta-v cost, and fuel cost are identical to the committed order's
  own solved values

#### Scenario: A preview settles a due arrival first, then solves from the settled state
- **GIVEN** a fleet whose stored burn's arrival time has already passed and
  which has not yet been settled by any read
- **WHEN** a preview is requested for a new target
- **THEN** the due arrival is settled through the same fold-first seam a
  commit uses, and the returned solve departs from the settled park's
  position and velocity — not from the unsettled stored state

#### Scenario: Repeated previews of a fleet with nothing due write nothing
- **WHEN** the same fleet's burn to the same target is previewed
  repeatedly in succession, with no arrival due at any point
- **THEN** no action is created, no channel slot is claimed, no fuel is
  debited, and the fleet's stored record is byte-identical before and after
  every request

#### Scenario: A preview against the star is rejected by the curve's clearance guard, not by a destination check
- **WHEN** a preview names the system's own star as its target
- **THEN** the solve is attempted and the request is rejected with the same
  observable reason a committed order naming the star produces —
  `space.BuildCurve`'s endpoint-clearance rejection
- **AND** no destination-identity comparison against the star's body id
  takes part in the rejection

#### Scenario: A burning fleet can preview a re-target
- **GIVEN** a fleet with a running burn whose arrival time has not yet
  passed
- **WHEN** a preview is requested for a different target
- **THEN** the preview is served, solved from the fleet's live position and
  tangent at the request's world time, and the running burn is unchanged

#### Scenario: A preview is refused wherever the commit would be refused
- **WHEN** a preview is requested for a fleet in lane transit, or with an
  ambiguous target, an empty target, an out-of-bounds commanded
  acceleration, or a body id absent from the system's body table
- **THEN** the request is rejected with the same named reason the commit
  path uses for that case, and no solve result is returned

#### Scenario: A preview against a fleet mid-mine is refused, cancels nothing, and writes nothing
- **GIVEN** a fleet whose movement channel is held by a running mine action
- **WHEN** a preview is requested for any target
- **THEN** the request is refused with the preview's own named reason and no
  solve result is returned
- **AND** the running mine action is still running, its movement-channel
  slot is still held, and the fleet's stored record is byte-identical before
  and after the request
- **AND** the refusal is deliberately NOT asserted to match a commit
  rejection: a burn committed from that same state is accepted today and
  cancels the mine run, an open defect this additive change leaves exactly
  as it is

#### Scenario: A preview reports an unaffordable target as such
- **WHEN** a preview's solved fuel cost exceeds the fleet's currently held
  `fuel`
- **THEN** the request is served rather than rejected, and the response
  reports the target as not currently affordable, carrying the solved
  control points, arrival time, delta-v, and fuel cost for display
  regardless
- **AND** a commit of that same order, submitted from the same state, is
  rejected with the insufficient-fuel reason — the one condition on which
  the preview and the commit deliberately diverge

#### Scenario: A preview reports the stranding warning when it would apply
- **WHEN** a preview's resulting park would leave the fleet unable to
  reach any station or lane-gate body in the destination system at the
  acceleration floor
- **THEN** the response carries the same distinguishable stranding
  indication a commit's response would carry

#### Scenario: A preview rejects a lane id
- **WHEN** a preview request names a `laneId` rather than a body id or a
  point
- **THEN** the request is rejected with its own named reason and no solve
  is attempted

### Requirement: A Burn Commit Is Rejected When Its Solved Fuel Cost Exceeds the Requester's Quoted Cap
The system SHALL accept an optional `maxFuelTons` field on
`POST /v1/fleets/:fleetId/orders`, and, when it is present, SHALL reject the
commit — before claiming the movement channel, debiting fuel, or storing a
burn — whenever the order's solved fuel cost in tons is strictly greater
than that value, with its own named rejection reason distinct from the
insufficient-fuel reason "A Burn Commit Is Rejected When Its Fuel Cost
Exceeds Available Fuel, Debited At Commit Never At Resolve" defines. The
rejection response SHALL carry the solved fuel cost, so the requester can
re-quote against the true figure without a second round trip. When
`maxFuelTons` is absent, no cap SHALL be applied and the commit SHALL
behave exactly as it did before this change. A `maxFuelTons` that is
negative or not a finite number SHALL be rejected as an invalid request
rather than treated as absent.

**Absence SHALL be distinguished from zero.** A `maxFuelTons` of exactly
`0` is a *present* cap — the caller asserting the order must cost nothing —
and SHALL reject any order whose solved fuel cost is strictly positive; it
SHALL NOT be treated as an absent cap and SHALL NOT be silently ignored. A
plain Go `float64` field makes the two indistinguishable on decode, so the
request shape SHALL carry the presence bit explicitly (a pointer, an
`omitempty`-aware wrapper, or an equivalent), and a decoder that cannot
tell `{"maxFuelTons": 0}` from a body omitting the key entirely does not
satisfy this requirement. This is not a hypothetical: the uncapped path is
the pre-change behaviour, so conflating the two turns a caller's strictest
possible cap into no cap at all — the exact failure the cap exists to
prevent, reached by the exact value a defensive caller is most likely to
send.

The two rejections SHALL remain distinguishable to a caller: the
insufficient-fuel reason answers "this fleet cannot pay," and this one
answers "this cost is higher than the one the requester agreed to." A fleet
with ample fuel can hit this one, and a fleet with a generous cap can hit
the other.

#### Scenario: A commit whose solved cost exceeds the quoted cap is rejected
- **GIVEN** a fleet with more than enough fuel for the order
- **WHEN** a burn is committed with a `maxFuelTons` strictly below the
  order's solved fuel cost
- **THEN** the commit is rejected with the quoted-cap reason, no movement
  channel slot is claimed, no fuel is debited, and no burn is stored

#### Scenario: The quoted-cap rejection carries the true solved cost
- **WHEN** a commit is rejected for exceeding its quoted cap
- **THEN** the response carries the order's solved fuel cost in tons

#### Scenario: A commit exactly at the quoted cap succeeds
- **WHEN** a burn is committed with a `maxFuelTons` exactly equal to the
  order's solved fuel cost
- **THEN** the commit succeeds — the rejection is on strictly-greater, not
  on equal

#### Scenario: An absent cap applies no cap
- **WHEN** a burn is committed with no `maxFuelTons` field
- **THEN** no cap check is performed and the commit behaves exactly as it
  did before this change

#### Scenario: The quoted-cap rejection is distinguishable from the insufficient-fuel rejection
- **WHEN** a commit is rejected for exceeding its quoted cap by a fleet
  that could have afforded the order
- **THEN** the named reason differs from the insufficient-fuel reason

#### Scenario: A malformed cap is an invalid request, not an absent cap
- **WHEN** a burn is committed with a `maxFuelTons` that is negative or not
  a finite number
- **THEN** the request is rejected as invalid, and the order is not
  committed uncapped

#### Scenario: A cap of exactly zero is a present cap, not an absent one
- **WHEN** a burn is committed with `maxFuelTons` set to exactly `0` and the
  order's solved fuel cost is strictly positive
- **THEN** the commit is rejected with the quoted-cap reason, no fuel is
  debited, and no burn is stored — the zero is honoured as a cap rather
  than read as an omitted field

### Requirement: Fleet Read Serves the Station-Keeping Upkeep Rate in Fuel Tons
The system SHALL serve, on the owner-only roster surface of a fleet read
("Fleet Read Surfaces Roster, Cargo, and Derived Capacity"), the fleet's
current station-keeping upkeep rate expressed **in fuel tons per second** —
the rate `space.StationKeepRate` yields for the fleet's host body, already
converted to tons by the same `FuelParams.DeltaVPerTon` conversion
"Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded Into the
Stored Cargo Pool" defines, without the hull-count multiplier. The value
SHALL be served in tons, never in delta-v: `FuelParams.DeltaVPerTon` is not
on the wire, and requiring a client to apply that conversion itself would
place a rule-bearing computation on the client.

The rate SHALL be served whenever the fleet's effective state resolves to a
park with a host body — an `orbit` park (what the rate would cost were the
player to hold) or a `stationkeep` park (what the hold is costing now) —
and SHALL be absent otherwise (a burn, a drift, or a `point` park, none of
which has a host body to derive a rate from). It SHALL be absent from a
foreign fleet's read, which carries no roster surface at all. Serving this
rate SHALL NOT alter, settle, or debit anything: it is a derived read-side
figure.

#### Scenario: An orbiting fleet's read carries the rate it would pay to hold
- **WHEN** the owner reads a fleet whose effective park mode is `orbit`
- **THEN** the roster surface carries the station-keeping upkeep rate in
  fuel tons per second for that fleet's host body

#### Scenario: A holding fleet's read carries the rate it is paying
- **WHEN** the owner reads a fleet whose effective park mode is
  `stationkeep`
- **THEN** the roster surface carries the same host-body-derived rate, in
  fuel tons per second

#### Scenario: A fleet with no host body carries no rate
- **WHEN** the owner reads a fleet that is burning, drifting, or parked at
  a point
- **THEN** the roster surface carries no station-keeping upkeep rate

#### Scenario: A foreign fleet's read carries no rate
- **WHEN** a requester reads a fleet its corporation does not own
- **THEN** the response carries no roster surface and therefore no
  station-keeping upkeep rate

#### Scenario: Reading the rate changes nothing
- **WHEN** the owner reads a station-keeping fleet twice without any other
  command in between
- **THEN** both reads report the same rate and the fleet's stored fuel and
  park are unchanged by either read

### Requirement: Fleet Reads Serve the Simulation Clock's Scale Alongside Their World Time
The system SHALL serve the simulation clock's **scale** — the number of
world-milliseconds the world advances per wall-clock millisecond — alongside
the `worldTime` every fleet read already carries, on `GET /v1/fleets/:fleetId`
and on every list form of the fleet read. The scale SHALL be the scale of the
same clock that read's `worldTime` was taken from, so a client anchoring to a
reading and extrapolating live world time between reads projects at the
world's own rate rather than at an assumed rate of 1. The scale SHALL be
served unconditionally, on a world running at any scale, so a client never has
to distinguish "scale 1" from "scale absent".

Serving it on the **fleet** reads as well as the interior read has a named
consumer, not merely symmetry: every surface that renders a fleet countdown
or a live fleet position without an interior read alongside it reads its
clock from here. That is the galaxy view's lane crawl and the shared fleet
roster, which never fetch an interior at all; and it is the per-system view
whenever its interior read has **failed** — a state that capability
specifies as leaving the roster and the fleet-anchored commands fully
usable, with their ETAs and countdowns still ticking. In every one of those
states the fleet read is the only clock on screen, and without its scale
those countdowns run at an assumed rate of 1 on a warped world.

#### Scenario: A fleet read carries the world clock's scale
- **WHEN** a requester reads a fleet on a world whose simulation clock runs
  at a scale other than 1
- **THEN** the response carries that clock's scale alongside its `worldTime`

#### Scenario: The scale is served even on an unwarped world
- **WHEN** a requester reads a fleet on a world whose simulation clock runs
  at a scale of exactly 1
- **THEN** the response still carries the scale, explicitly, rather than
  omitting it and leaving the client to assume a value

### Requirement: A Burn Solve Refused for the Star Clearance Is Served as 409 Naming Origin or Destination
IF an in-system burn is refused because an endpoint is at or inside the star-clearance radius, THEN the system SHALL serve the refusal as `409 Conflict` with a reason in the response body's `error` field, on `POST /v1/fleets/:id/orders`, `POST /v1/fleets/:id/orders/preview` and the stop-in-place route alike, with the same status and the same reason on every route that can raise it. The reason SHALL state whether the fleet's own position (the origin) or the solved destination is the endpoint at or inside the clearance. The destination is the solved intercept of a body target, the point of a point target, or the lead point of a stop. When the origin is at or inside the clearance the origin reason SHALL be served, whatever the destination, except when the target body is absent from the system (see *Burn Solve Refusals Are Decided in a Fixed Order*). The distinction SHALL be made from geometry alone: the system SHALL NOT compare the target's identity with the star's, so an order naming the star and an order naming any other body or point whose destination is at or inside the clearance carry the same destination reason. The refusal SHALL add no field to the response body.

#### Scenario: A body whose solved standoff point is inside the clearance is refused with the destination reason
- **GIVEN** a body table, a fleet position outside the clearance and an injected world time for which the real solve of an order naming a body is refused for its destination (the instant is located beforehand by sweeping the injected clock against the same solver and is fixed in the test)
- **WHEN** that order is committed
- **THEN** the response is `409` with the destination reason
- **AND** the fleet's stored state and fuel are unchanged

#### Scenario: A preview of the same order is refused with the same status and the same body
- **GIVEN** the body table, fleet and world time of the preceding scenario
- **WHEN** a preview of the same order is requested
- **THEN** the response is `409` with the byte-identical `error` reason the commit produced

#### Scenario: An order naming the star is refused by the same destination reason as any other clearance refusal
- **GIVEN** a fleet outside the clearance
- **WHEN** an order, and a preview, naming the star are submitted
- **THEN** each response is `409` with the same destination reason a point target inside the clearance produces
- **AND** no comparison of the target's identity with the star's is made

#### Scenario: A point target at or inside the clearance is refused with the destination reason
- **GIVEN** a fleet outside the clearance
- **WHEN** an order, and a preview, naming a point whose distance from the star is below the clearance radius, and again exactly equal to it, are submitted
- **THEN** each response is `409` with the destination reason

#### Scenario: A fleet whose own position is inside the clearance is refused with the origin reason
- **GIVEN** a fleet whose position is inside the star-clearance radius and a point target outside it
- **WHEN** an order, and a preview, are submitted for that fleet
- **THEN** each response is `409` with the origin reason
- **AND** that reason differs in text from the destination reason

#### Scenario: A fleet inside the clearance ordering a destination also inside it is refused with the origin reason
- **GIVEN** a fleet whose position is inside the star-clearance radius
- **WHEN** an order, and a preview, naming the star are submitted for that fleet
- **THEN** each response is `409` with the origin reason and not the destination reason

#### Scenario: A stop whose origin is inside the clearance is refused with the origin reason
- **GIVEN** a fleet moving above the stop-in-place speed floor whose position is inside the clearance
- **WHEN** stop-in-place is submitted for it
- **THEN** the response is `409` with the origin reason
- **AND** the fleet's stored attachment, motion state and fuel are unchanged

#### Scenario: A stop whose lead point is inside the clearance is refused with the destination reason
- **GIVEN** a fleet moving above the stop-in-place speed floor, positioned 1.0 outside the clearance and heading straight at the star
- **WHEN** stop-in-place is submitted for it
- **THEN** the response is `409` with the destination reason
- **AND** the fleet's stored attachment, motion state and fuel are unchanged

### Requirement: A Burn Solve Refused for Too Short a Curve Is Served as 409 With Its Own Reason
IF the solve of an in-system burn yields a curve below the minimum arc length, THEN the system SHALL serve the refusal as `409 Conflict` with a reason in the response body's `error` field, on `orders` and `orders/preview`, with the same status and the same reason on both, and the reason SHALL differ in text from every star-clearance reason. The refusal SHALL NOT be served as a bodyless `5xx`. The refusal SHALL be decided by the solved curve's length alone: the system SHALL NOT refuse an order because its target is the body the fleet is docked at or orbits, and an order to that body whose solved curve is at or above the minimum SHALL commit as any other order.

#### Scenario: An order whose solved curve is below the minimum toward the fleet's own host is refused with the minimum-arc reason
- **GIVEN** a fleet parked in an orbit around a body, and an injected world time at which the real solve of an order naming that same body yields a curve below the minimum arc length (the instant is located beforehand by sweeping the injected clock against the same solver and is fixed in the test)
- **WHEN** an order, and a preview, naming that body are submitted
- **THEN** each response is `409` with the minimum-arc reason
- **AND** the two bodies are byte-identical

#### Scenario: An order to the fleet's own host whose solved curve is long enough commits
- **GIVEN** the fleet and body of the preceding scenario, at an injected world time at which the real solve of an order naming that body yields a curve at or above the minimum arc length
- **WHEN** an order naming that body is submitted
- **THEN** the order is accepted and its burn is stored, not refused

#### Scenario: A point closer than the minimum arc length is refused with the minimum-arc reason
- **GIVEN** a stationary fleet outside the clearance
- **WHEN** an order naming a point closer to the fleet than the configured minimum arc length is submitted
- **THEN** the response is `409` with the minimum-arc reason and not a clearance reason

### Requirement: A Burn Naming a Body Absent From the System Is Served as a Reason-Bearing 404
IF a burn order or preview names a target body id that is not in the system's body table, THEN the system SHALL serve `404 Not Found` with a reason in the response body's `error` field stating the body is not present in the system, on `orders` and `orders/preview` alike. This reason-bearing `404` SHALL differ in body from the bodyless `404` served for an unknown or foreign fleet. Absence SHALL be decided by the requested id's absence from the body table: a target that is present but whose parent chain names a missing body, and a fleet whose own stored host no longer resolves, are not covered by this requirement.

#### Scenario: A commit naming an absent body id is refused with a reason
- **WHEN** an order is committed naming a body id that is not in the fleet's system
- **THEN** the response is `404` with an `error` reason stating the body is not present in the system
- **AND** no burn is stored and no action is created

#### Scenario: A preview naming an absent body id is refused with the same reason
- **WHEN** a preview naming the same absent body id is requested
- **THEN** the response is `404` with the byte-identical `error` reason the commit produced

#### Scenario: An unknown or foreign fleet still answers a bodyless 404
- **GIVEN** four fleets owned by another corporation, arranged so that their owner would be served, respectively, the origin-inside refusal, the destination-inside refusal, the minimum-arc refusal and the absent-body refusal
- **WHEN** a foreign requester, and separately a requester with no corporation, submits to `orders` and `orders/preview` the request that would raise each fleet's refusal, and stop-in-place for the fleets on which stop can be refused, and the same requests for a fleet id that does not exist
- **THEN** every response is `404` with no body, byte-identical to the response for the nonexistent fleet id
- **AND** no clearance, minimum-arc or absent-body reason is served, and no fleet's stored record is changed

### Requirement: Burn Solve Refusals Are Decided in a Fixed Order
The system SHALL decide an in-system burn solve refusal in this order: first an absent target body, then an origin at or inside the star clearance, then a destination at or inside the star clearance, then a curve below the minimum arc length; the first that applies SHALL be the one served. A fault discoverable only in the solve itself, such as a present target body whose parent chain names a missing body, is therefore not reached for a fleet whose origin is inside the clearance, which is served the origin refusal.

#### Scenario: An absent body while the fleet is inside the clearance is refused as absent
- **GIVEN** a fleet whose position is inside the star-clearance radius
- **WHEN** an order, and a preview, naming a body id that is not in the system are submitted
- **THEN** each response is `404` with the absent-body reason and not the origin reason

#### Scenario: An origin inside the clearance outranks a destination or a short curve
- **GIVEN** a fleet whose position is inside the star-clearance radius
- **WHEN** an order naming a point outside the clearance, an order naming a point inside the clearance, and an order naming a point closer than the minimum arc length, are submitted
- **THEN** each response is `409` with the origin reason

### Requirement: Burn Solve Refusal Reasons Are Pairwise Distinct
The system SHALL serve burn solve refusal reasons whose text is pairwise distinct across the origin-inside-clearance refusal, the destination-inside-clearance refusal, the minimum-arc refusal and the absent-body refusal, so that each is distinguishable by its body and not merely by its status. Each reason SHALL be a fixed string: it SHALL NOT contain the requested body id, the requested point, any coordinate of the fleet, or a route-specific prefix, and it SHALL be identical on every route that can raise it. The origin reason SHALL contain the fragment `origin is at or inside`, the destination reason `destination is at or inside`, the minimum-arc reason `minimum arc length`, and the absent-body reason `target body is not present`; no reason SHALL contain another reason's fragment, and none SHALL contain the text `not found`.

#### Scenario: Four refusals yield four different reason bodies
- **GIVEN** one separately arranged fleet and order for each of the origin-inside, destination-inside, too-short and absent-body conditions
- **WHEN** each is submitted
- **THEN** the four `error` reason texts are pairwise different
- **AND** each differs from the generic bodyless `5xx` shape, which carries no body
- **AND** the absent-body reason is byte-identical for two different absent body ids

#### Scenario: No refusal reason contains another refusal's fragment, nor the generic not-found text
- **GIVEN** the origin, destination, minimum-arc and absent-body reasons
- **WHEN** each is matched by substring against the fragment of every other
- **THEN** each reason contains its own fragment and no other reason's fragment
- **AND** no reason contains the text `not found`

#### Scenario: The same refusal on commit, preview and stop carries the same reason
- **WHEN** the destination-inside refusal is served on a commit, a preview and a stop
- **THEN** the three `error` reasons are byte-identical, with none carrying a route-specific prefix

### Requirement: A Served Burn Solve Refusal Changes Nothing And Is Not An Error
IF a burn solve refusal named by this capability is served, THEN the system SHALL store no burn, create no action, claim no movement or sensor channel slot, debit no fuel for the refused order, and change no fleet attachment or park on account of it, and SHALL NOT write an error-level log entry for it. The system SHALL record each served refusal at a level below error, once per request, carrying the refusal cause (origin-inside-clearance, destination-inside-clearance, minimum-arc, absent-body), the route (order, preview, stop), the fleet id and the system id, such that served refusals are countable per cause and per route and distinguishable from internal faults, which are recorded at error level. The settlement of an already-due arrival, and on a commit the settlement of an elapsed station-keeping hold, which precede every solve, are not effects of the refusal and are unchanged by this requirement.

#### Scenario: Every served refusal leaves state and fuel unchanged
- **GIVEN** four separately arranged fleets, each with no due arrival and no elapsed station-keeping hold, a stored state, an empty action inbox and a known fuel level, set to be served respectively the origin-inside, destination-inside, too-short and absent-body refusals
- **WHEN** each is served its refusal on a commit
- **THEN** after each, that fleet's stored state, its action list, its channel slots and its fuel are identical to before

#### Scenario: A served refusal is recorded once by cause below error level
- **WHEN** each of the four refusals is served on every route that can raise it (origin and destination on commit, preview and stop; minimum-arc and absent-body on commit and preview)
- **THEN** the captured log contains exactly one entry for the request, below error level, naming the cause, route, fleet id and system id
- **AND** it contains no error-level entry for the request
- **AND** a body-table cycle on the same routes produces an error-level entry that names no refusal cause

### Requirement: Internal Faults on the Burn Routes Remain Server Errors
Except where *Burn Solve Refusals Are Decided in a Fixed Order* serves the origin refusal first, the system SHALL continue to serve a `5xx` for a fault on `orders`, `orders/preview` and the stop-in-place route that is not caused by the request or by the player's ordinary action, including an undecodable stored kinematic state, a body-table cycle, a target body that is present in the body table but whose parent chain names a body that is not, and a fleet whose own stored host no longer resolves, and SHALL log such a fault at error level.

#### Scenario: A body-table cycle is still a 5xx with an error log
- **GIVEN** a system whose body table contains a parent cycle
- **WHEN** an order is submitted that must resolve a body in it
- **THEN** the response is `5xx`
- **AND** an error-level log entry is written

#### Scenario: A fleet whose stored host no longer resolves is still a 5xx
- **GIVEN** a fleet whose stored host body id is absent from its system's body table
- **WHEN** an order is submitted for it
- **THEN** the response is `5xx` and not the absent-body `404`
- **AND** an error-level log entry is written

#### Scenario: A present target whose parent is missing is a 5xx, not the absent-body 404
- **GIVEN** a fleet outside the clearance, and a system whose body table holds a body whose stored parent id is not in the table
- **WHEN** an order, and a preview, naming that body are submitted
- **THEN** each response is `5xx` and not the absent-body `404`
- **AND** an error-level log entry is written


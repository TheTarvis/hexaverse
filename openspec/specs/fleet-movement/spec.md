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
credited by an instant refuel purchase (see `fuel-purchase`); and credited
exactly once by spawn asset healing's starting grant (see
`corporation-spawn`'s "Spawn Asset Healing"). No verb outside this list
SHALL mutate a fleet's `fuel` entry.

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
commit SHALL leave the fleet's prior movement state and `fuel` cargo
exactly as they were before the rejected order was submitted** — this
applies identically when the rejected commit was itself an attempt to
replace an active, not-yet-arrived burn ("A new order replaces an active
one"): the prior burn's discard refund ("Discarding a Running Burn Refunds
Its Unspent Fuel, Closed-Form") and the prior action's cancellation SHALL
take effect only inside the same transaction that stores the replacement
burn, never before that transaction is known to succeed — a fleet SHALL
NOT have its running burn cancelled, or its unspent fuel refunded, only to
have the replacement re-target rejected for its own unaffordability,
leaving the fleet drifting with no active order.

#### Scenario: An unaffordable burn is rejected and nothing is stored or debited
- **WHEN** a burn's computed fuel cost exceeds the fleet's currently held
  `fuel` tonnage
- **THEN** the commit is rejected with its own named reason, no burn is
  stored, and the fleet's `fuel` cargo is unchanged

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


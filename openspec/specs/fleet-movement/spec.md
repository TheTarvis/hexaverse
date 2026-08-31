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
cargo exists only on the fleet that holds it.

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

### Requirement: Fleet Read Surfaces Roster, Cargo, and Derived Capacity

The system SHALL include the fleet's ship roster, its cargo pool, its
derived total cargo capacity, its derived free hold, and its derived
mining rate in the response of the fleet read endpoints (`GET
/v1/fleets/:fleetId`, `GET /v1/fleets?systemId=`, `GET
/v1/fleets?mine=true`) for an owning corporation reading its own fleet —
these are not internal-only values computed for the mining verb's use, but
part of the fleet's observable state. A foreign fleet carries no such
fields in any response, because "Fleet Read Endpoints Serve Own Fleets
Only" omits a foreign fleet from a list read and 404s it on a direct
fetch — there is no partial-visibility snapshot of a foreign fleet in this
change for these fields, or any other, to be redacted from.

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

### Requirement: Single Kinematic-State Fleet Record

The system SHALL represent each fleet as one document carrying a
`space.ShipState` (burn, park, or drift — see `space-kinematics`) as its
kinematic-state field, plus a separate `jump` field (fleet-owned, see "Lane
Jump From a Docked Gate") that is non-nil only while the fleet is in lane
transit. While `jump` is non-nil, the stored `space.ShipState` is stale and
SHALL NOT be evaluated by any reader — a fleet is in exactly one of the two
regimes, kinematic or in-transit, at a time, never both live. The document
SHALL also carry a `corporationId`, its current `systemId`, an optional
`attachedTo` host id, and at most one active id per action channel:
`activeActionId` for movement, `activeScanId` for the sensor channel,
independently claimable and releasable. The sensor channel SHALL remain
declared on the fleet record with no verb claiming it in this capability. A
fleet document whose stored kinematic state does not decode to one of the
three `space.ShipState` shapes, when `jump` is not set, SHALL be rejected by
name — never defaulted to an origin position or an idle park.

#### Scenario: The sensor channel persists declared and unwritten

- **WHEN** a fleet document is written and re-read in this capability
- **THEN** `activeScanId` is present on the document and empty
- **AND** no code path in this capability writes a non-empty value to it

#### Scenario: A fleet with no stored kinematic state is rejected by name

- **WHEN** a fleet document with no `jump` set is read whose stored
  kinematic-state field decodes to none of burn, park, or drift
- **THEN** the read fails with a named error
- **AND** the fleet is never treated as if it were parked at an implied
  origin

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
epoched at the cut instant. Cut drive SHALL be free (no delta-v charged),
instant (no ETA, no committed action), and SHALL cancel the running movement
action, releasing its slot with no delta and no other effect. The system
SHALL reject a cut-drive order against a burn that has already reached or
passed its arrival time, with its own named reason, and SHALL reject a
cut-drive order against a fleet that is not actively burning (parked,
drifting, or in lane transit), with its own named reason. A burning fleet's
`attachedTo` was already cleared at that burn's commit ("In-System Burn
Order to a Body or a Point"), so cut drive leaves it empty and performs no
further mutation of that field.

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
- **THEN** no delta-v is debited and no credit or cargo effect is recorded

#### Scenario: A cut fleet is immediately re-orderable

- **WHEN** a fleet has just been converted to a drift by cut drive
- **THEN** it accepts a new burn order immediately, with no cooldown or
  intervening state

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

### Requirement: Lane Jump From a Docked Gate

The system SHALL, on a jump order naming a lane, accept the order only when
the fleet is attached to the gate body for that lane and the requester
corporation has charted that lane. A fleet SHALL be jump-eligible on the
same world millisecond it attaches to a gate — no dwell time is imposed. The
system SHALL commit the jump through the action spine on the movement
channel, with an ETA of the current world time plus the lane's crossing
time (derived from the lane's 3D length and the fleet's configured lane
rate), replacing any active movement order.

#### Scenario: Jumping from a charted, attached gate commits

- **WHEN** a fleet attached to a lane's gate body, whose corporation has
  charted that lane, is ordered to jump
- **THEN** the jump commits on the movement channel with an ETA equal to now
  plus the lane's crossing time

#### Scenario: A fleet is jump-eligible the instant it attaches, with no dwell

- **WHEN** a fleet's burn resolves into attachment at a lane's gate body, and
  a jump order for that lane is submitted at that same resolve instant
- **THEN** the jump is accepted — no minimum dwell duration is enforced
  between attaching and jumping

#### Scenario: Jumping without attachment to the named gate is rejected

- **WHEN** a fleet not attached to the lane's gate body is ordered to jump
  that lane
- **THEN** the order fails with a named error and no action is committed

#### Scenario: Jumping an uncharted lane is rejected

- **WHEN** a fleet attached to a gate is ordered to jump a lane its
  corporation has not charted
- **THEN** the order fails with a named error and no action is committed

#### Scenario: Jump costs no delta-v

- **WHEN** a jump is committed and later resolves
- **THEN** no delta-v is debited for the crossing — only time is spent

### Requirement: Jump Arrival Parks Near the Destination Gate, Unmasked

The system SHALL, when a jump's ETA passes, flip the fleet's `systemId` to
the destination, clear its lane-transit state, and settle it into a `park`
near the destination gate's insertion standoff — never attached to the
gate — so the arrival is not masked. The system SHALL, in the same resolve
transaction, mark the destination system `explored` for the fleet's
corporation and chart the crossed lane for the fleet's corporation as
`via: traveled`, and mint no rumor of any lane onward from the destination.
The system SHALL materialize the destination system's interior
(create-if-absent) after the resolve transaction completes.

#### Scenario: Arrival flips the system and parks unattached near the gate

- **WHEN** a jump's ETA passes and the fleet is read/resolved
- **THEN** the fleet's `systemId` becomes the destination, its lane-transit
  state is cleared, and it settles into a park near the destination gate's
  insertion standoff with `attachedTo` empty

#### Scenario: Arrival charts the crossed lane as traveled and rumors nothing onward

- **WHEN** a jump resolves into a destination system
- **THEN** the destination system is marked `explored` for the fleet's
  corporation, the crossed lane is charted for the fleet's corporation with
  `via: traveled`, and no lane onward from the destination is rumored by
  this resolve

#### Scenario: First arrival materializes the destination's interior

- **WHEN** a fleet's jump resolves into a system with no materialized
  interior
- **THEN** the destination's interior is generated (create-if-absent) after
  the resolve transaction completes

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

### Requirement: Movement Command Endpoints Enforce No Fleet Ownership

The system SHALL, on `POST /v1/fleets/:fleetId/orders`,
`POST /v1/fleets/:fleetId/cancel`, `POST /v1/fleets/:fleetId/cut-drive`,
`POST /v1/fleets/:fleetId/stop`, and `POST /v1/fleets/:fleetId/jump`, act on
the fleet named by the `fleetId` path param for any authenticated account,
without verifying the fleet's `corporationId` matches the requester's
corporation — `common.ActorCorp(c)` is never consulted by these mutating
handlers or by the fleet service. (Suspected authorization defect — shared
with `action-dispatch`'s "No Caller-Identity Binding on Action Endpoints";
specced here as the current, observable behavior, not an endorsement, and
not fixed by this change.)

#### Scenario: A foreign corp can order another corp's fleet

- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/orders` with a valid target
- **THEN** the order is accepted and F's kinematic state changes — no `403`
  or ownership rejection occurs

#### Scenario: A foreign corp can cancel another corp's fleet

- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/cancel`
- **THEN** F's active movement order is cancelled — no ownership check is
  performed

#### Scenario: A foreign corp can cut another corp's fleet's drive

- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/cut-drive`
- **THEN** F's burn is converted to a drift — no ownership check is
  performed

#### Scenario: A foreign corp can order another corp's fleet to stop in place

- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/stop`
- **THEN** F's stop-in-place order is accepted — no ownership check is
  performed

#### Scenario: A foreign corp can order another corp's fleet to jump

- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/jump`
- **THEN** F's jump is committed — no ownership check is performed

### Requirement: Fleet Read Endpoints Serve Own Fleets Only

The system SHALL serve `GET /v1/fleets/:fleetId` (single fleet),
`GET /v1/fleets?systemId=` (every fleet in a system), and
`GET /v1/fleets?mine=true` (every fleet the requester's corporation owns,
across systems). A requester's own fleets SHALL always be returned in full,
with their complete kinematic state (curve/park/drift detail, target, ETA),
regardless of any other corporation's presence. A fleet belonging to another
corporation SHALL be omitted entirely from a list read and SHALL 404 on a
direct fetch by id — this capability computes no partial visibility for a
foreign fleet in this change. This is a deliberate, temporary interim: the
lattice coverage a foreign fleet's visibility used to be computed from is
deleted along with `observation`'s live half (design.md Decision 11), and
`disclosure.Disclose` is not called from any read in this change (design.md
Decision 19) — wiring it in is link 5's work.

#### Scenario: A foreign fleet is omitted from a list read

- **WHEN** a requester lists fleets in a system that contains a fleet
  belonging to another corporation
- **THEN** that foreign fleet does not appear anywhere in the response

#### Scenario: A foreign fleet 404s on a direct fetch

- **WHEN** a requester fetches a specific fleet id belonging to another
  corporation
- **THEN** the response is `404 Not Found`

#### Scenario: Own fleets are always returned in full

- **WHEN** a requester fetches or lists their own fleets
- **THEN** every one is returned with `own: true` and its full kinematic
  state, regardless of any other corporation's presence or activity

#### Scenario: mine=true with no corp returns an empty list

- **WHEN** an authenticated but corpless requester calls
  `GET /v1/fleets?mine=true`
- **THEN** the response is an empty fleet list, not an error


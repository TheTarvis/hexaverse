## MODIFIED Requirements

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

## ADDED Requirements

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
`docs/plans/continous_space/handoffs/defect-burn-cancels-running-mine.md`,
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

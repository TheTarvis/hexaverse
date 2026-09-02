## MODIFIED Requirements

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

### Requirement: Fleet Command Endpoints Are Restricted to the Owning Corporation
The system SHALL, on `POST /v1/fleets/:fleetId/orders`,
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
`/actions/:id/cancel`. The same ownership check SHALL guard the
station-keeping hold and release verbs this change introduces (see
"Station-Keeping Hold and Release Are Fleet Verbs"): an unchecked `hold`
would let a foreign corporation park another corporation's fleet into a
continuous fuel drain it never chose, and an unchecked `release` would let
a foreign corporation force another corporation's fleet off a deliberately
held position — both direct manipulations of a victim's fuel economy with
no corresponding benefit to the caller, the same shape of harm this
requirement already exists to close for every other command.

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

#### Scenario: A foreign corp cannot start another corp's fleet station-keeping
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/hold`
- **THEN** the response is `404 Not Found` and F's park mode is unaffected

#### Scenario: A foreign corp cannot release another corp's fleet's station-keep hold
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/release`
- **THEN** the response is `404 Not Found` and F's park mode is unaffected

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
state and `fuel` cargo SHALL be left exactly as the fleet's effective
state — `space.StateAt` evaluated at the moment the rejected order was
submitted — already reported them** — this applies identically when the
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

## ADDED Requirements

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
- **WHEN** a fleet is held to exhaustion, and a further `hold` is then
  submitted against the resulting reserve-level fuel
- **THEN** the second `hold` is rejected by its own named reason (its
  spendable fuel above the reserve being zero), and the fleet's `fuel`
  remains exactly the reserve — repeated holding can never grind the
  reserve away

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
tons by the same `FuelParams.DeltaVPerTon` conversion `add-fuel-as-cargo`'s
"A Burn's Fuel Cost Scales With Roster Hull Count, Never Loaded Mass" uses
for a burn, **without** the hull-count multiplier — station-keeping is a
per-fleet positional hold, not a burn, and this change does not extend the
hull-count scaling ruling to it. That is:

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
  dry instant is next observed. Every mutation this capability's "Fleet
  Cargo Pool" enumerates that both is reachable during an open hold and
  leaves that hold open is a **credit** (a refuel, a discarded burn's
  refund), so the recomputed dry instant is necessarily strictly after the
  restamped hold-start; a future `fuel`-**debiting** verb that leaves a
  hold open would have to state its own disposition for the case where the
  post-mutation balance falls to or below the reserve, and no such verb
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
  specifically, the burn's own fuel cost (per `add-fuel-as-cargo`'s "A Burn
  Commit Is Rejected When Its Fuel Cost Exceeds Available Fuel...") is
  evaluated and debited against the balance remaining **after** this
  settlement, and the committed burn is stored in place of the
  `stationkeep` park. This settlement debit is the *hold's* already-accrued
  upkeep, not a charge for the ending verb: it therefore does not disturb
  "Lane Jump From an Attached Gate"'s "Jump costs no delta-v" or "Stop In
  Place Commits a Velocity-Nulling Burn"'s free below-the-floor branch,
  each of which constrains that verb's own price and neither of which
  forgives a debt incurred before it was invoked. A verb ending a hold that
  is already at or past its stored dry instant instead settles via the
  automatic past-dry-instant fold above, before its own preconditions
  evaluate, per "Every Decision Reading Fuel Settles a Past-Dry-Instant
  Hold First."

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

#### Scenario: Jumping from an open hold settles its accrued upkeep
- **WHEN** a jump is committed against a fleet whose effective park is an
  open `stationkeep` hold at the named lane's gate body
- **THEN** the same transaction that commits the jump first debits the
  upkeep accrued since the hold's stored start time, so a fleet that camps
  a gate under a hold and then jumps has paid for the hold — the jump
  itself still costs no delta-v

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
— Credit Debit and Fuel Credit"), a concurrent burn commit's debit, and a
second copy of the same `hold` or `release` request are all unserialized
with respect to these verbs. Absent the transactional re-read, a `release`
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
  re-read — the second request either observes the first's park and is
  rejected by the not-orbiting reason, or is a no-op returning that same
  park, never a second park overwriting the first's stamps

### Requirement: Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First
The system SHALL, before evaluating any decision that reads a fleet's
`cargo.fuel` value to decide something — a burn commit's affordability
check (`add-fuel-as-cargo`'s "A Burn Commit Is Rejected When Its Fuel Cost
Exceeds Available Fuel..."), `fleet.FreeHold` (consumed by `mine`'s
commit-time precondition, `mine`'s resolve-time clamp
`freeHoldAtResolve`, a plain fleet-read consumer, `fuel-purchase`'s own
pre-transaction free-hold precondition, and the transaction-scoped
free-hold figure `fuel-purchase`'s own settlement re-evaluates — five
production call sites, not four), the fleet read's estimated-maximum-range
computation (`add-fuel-as-cargo`'s "Fleet Read Reports an Estimated
Maximum Range From Current Fuel"), the fleet read's persistent stranded
indication (`add-fuel-as-cargo`'s "A Fleet's Read Reports a Persistent
Stranded Indication, Computed at the Acceleration Floor"), or any other
computation of a fleet's currently held fuel — first check whether that
fleet's stored park is a `stationkeep` park at or after its stored dry
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

Where the reading decision is itself a transaction that may abort — a burn
commit being the case in hand — the settlement SHALL be committed by a
**separate write that precedes, and is independent of, that transaction**,
never as a write inside it. This is required by two live requirements this
change does not modify: `action-dispatch`'s "A transaction-scoped
producer's error aborts the commit entirely" guarantees that a rejecting
producer persists **no** actor-state mutation, so a settlement written
inside a rejecting commit would by construction be discarded; and
`add-fuel-as-cargo`'s "A Burn Commit Is Rejected When Its Fuel Cost Exceeds
Available Fuel..." requires a rejected commit to leave the fleet's prior
movement state and `fuel` cargo as they were, which constrains the
*commit's own* effects. Settling first, in its own committed write,
satisfies both: the commit transaction persists nothing of its own on
rejection, and the settlement — which is not an effect of the order but the
observation of a demotion that had already occurred at the dry instant, and
which changes no *effective* movement state, since `space.StateAt` already
folds that park to its released orbit whether or not the fold is persisted
— is durable either way, so the next reader never trips over the stale
value.

#### Scenario: A burn commit against a past-dry-instant holding fleet evaluates against settled, reserve-level fuel
- **WHEN** a burn is committed against a fleet whose `stationkeep` park's
  dry instant has already passed but has not yet been observed by any
  prior write
- **THEN** the commit's affordability check evaluates against the settled
  fuel value — exactly the configured station-keeping reserve — not the
  stale, pre-fold value the stored field still shows, so a burn costing
  more than the reserve is rejected with the named insufficient-fuel reason
  (`add-fuel-as-cargo`'s "A Burn Commit Is Rejected When Its Fuel Cost
  Exceeds Available Fuel, Debited At Commit Never At Resolve") and a burn
  costing no more than the reserve commits
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

#### Scenario: A refuel's free-hold precondition reflects a settled hold
- **WHEN** `fuel-purchase`'s free-hold precondition is evaluated for a
  fleet whose `stationkeep` hold's dry instant has already passed
- **THEN** the precondition is evaluated against the settled fuel value,
  never a stale, over-reported pre-fold value that could reject an
  otherwise-affordable refuel or admit an otherwise-oversized one

#### Scenario: A fleet's estimated range reflects a settled hold before the range is computed
- **WHEN** a fleet's estimated-maximum-range field is computed for a fleet
  whose `stationkeep` park's dry instant has already passed
- **THEN** the range is computed from the settled fuel value, never the
  stale pre-fold value that would otherwise report a range afforded by fuel
  the hold has already spent

#### Scenario: A fleet's persistent stranded indication reflects a settled hold before it is computed
- **WHEN** a fleet's persistent stranded indication is computed for a
  fleet whose `stationkeep` park's dry instant has already passed
- **THEN** the indication is computed from the settled fuel value, never
  the stale pre-fold value that could read a fleet as not stranded merely
  because its dry instant has not yet been observed by any other write

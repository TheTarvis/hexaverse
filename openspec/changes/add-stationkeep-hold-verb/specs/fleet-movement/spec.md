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
also be: debited at a burn's commit; credited when a running burn is
discarded before arrival; credited by an instant refuel purchase; credited
exactly once by spawn asset healing's starting grant (see
`add-fuel-as-cargo`'s "Fleet Cargo Pool" and `corporation-spawn`'s "Spawn
Asset Healing"); and, since this change, debited at a station-keeping
hold's settlement — never continuously while the hold is merely open, but
at the instant it ends, either by `release` or by automatic exhaustion (see
"Station-Keeping Hold and Release Are Fleet Verbs" and "Station-Keeping
Upkeep Is Settled at Discrete Events, Never Folded Into the Stored Cargo
Pool"). No verb outside this list SHALL mutate a fleet's `fuel` entry.

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
fleet whose effective park mode is currently `stationkeep`, SHALL settle
the hold's accrued upkeep and convert it back to an `orbit` park per
`space-kinematics`'s "Releasing a Station-Keep Hold Re-Circularizes at the
Held Offset's Planar Radius." Both SHALL be rejected with their own named
reason, distinct from one another, against a fleet whose effective state
is not the mode each requires (a burn, a drift, a `point` park, or the
wrong park mode) — hold and release are not substitutes for one another
and neither substitutes for a burn order. Neither `hold` nor `release`
SHALL itself cost delta-v; the continuous cost while held is the upkeep
this change's "Station-Keeping Upkeep Is Settled at Discrete Events, Never
Folded Into the Stored Cargo Pool" defines. Neither `hold`, `release`, nor
the automatic force-demotion this change defines SHALL alter the fleet's
`attachedTo` field or its docked/undocked status — only the park's kind
(and, for release or force-demotion, its orbit parameters) change.

#### Scenario: Holding converts an orbiting fleet to station-keep at its current offset
- **WHEN** `hold` is submitted for a fleet whose effective park mode is
  `orbit`
- **THEN** the fleet's park mode becomes `stationkeep`, holding its exact
  offset from its host body at the call instant, with no action created,
  no delta-v charged, and no fuel debited yet

#### Scenario: Releasing converts a station-keeping fleet back to orbit
- **WHEN** `release` is submitted for a fleet whose effective park mode is
  `stationkeep`
- **THEN** the fleet's park mode becomes `orbit`, re-circularized per
  `space-kinematics`'s re-circularization rule, with no action created and
  no delta-v charged beyond the settled upkeep

#### Scenario: Holding a fleet that is not orbiting is rejected by name
- **WHEN** `hold` is submitted for a fleet whose effective state is a
  burn, a drift, a `point` park, or an already-`stationkeep` park
- **THEN** the call is rejected with its own named reason and the fleet's
  state is unchanged

#### Scenario: Releasing a fleet that is not station-keeping is rejected by name
- **WHEN** `release` is submitted for a fleet whose effective state is
  anything other than `stationkeep`
- **THEN** the call is rejected with its own named reason, distinct from
  hold's rejection reason, and the fleet's state is unchanged

#### Scenario: A fleet's attachment survives hold, release, and force-demotion
- **WHEN** a fleet attached to a body is held, later released (or force-
  demoted), and its `attachedTo` field is inspected before and after each
  transition
- **THEN** `attachedTo` and the fleet's docked/undocked status are
  identical before and after every one of the three transitions — only the
  park's kind and, where applicable, its orbit parameters change

### Requirement: Station-Keeping Upkeep Is Settled at Discrete Events, Never Folded Into the Stored Cargo Pool
The system SHALL convert `space-kinematics`'s station-keep upkeep rate
(`space.StationKeepRate`, a body-derived quantity) into fuel by the same
`FuelParams.DeltaVPerTon` conversion `add-fuel-as-cargo`'s "A Burn's Fuel
Cost Scales With Roster Hull Count, Never Loaded Mass" uses for a burn,
**without** the hull-count multiplier — station-keeping is a per-fleet
positional hold, not a burn, and this change does not extend the
hull-count scaling ruling to it. The fleet's stored `fuel` cargo value
SHALL NOT be decremented merely by elapsed hold time; it SHALL be settled
only at a discrete event, computed closed-form from the hold's stored
start time and the event's own world time — never as accumulated per-tick
state, per `space-kinematics`'s "No Value Is Derived From Accumulated
Per-Tick State":
- `release`, called before the hold's stored dry instant, SHALL debit
  `cargo.fuel` by exactly `rate × (releaseTime − holdStartTime)` in the
  same transaction that converts the park to orbit.
- A `stationkeep` park observed (by any read or write) at or after its
  stored dry instant SHALL be folded by `space.StateAt` into its released
  orbit as of that dry instant (see `space-kinematics`'s "A Station-Keeping
  Park Past Its Dry Instant Is Its Released Orbit, With No Extra Persisted
  State"), with `cargo.fuel` settled to exactly zero — never negative — in
  the same write that first persists the fold.
This reuses the two park modes "Station-Keeping Hold and Release Are Fleet
Verbs" already defines; no new park mode is invented for the
force-demoted case.

#### Scenario: Releasing before exhaustion debits exactly the accrued upkeep
- **WHEN** a station-keeping fleet's hold is released before its stored
  dry instant
- **THEN** the fleet's `fuel` cargo decreases by exactly the upkeep rate
  times the elapsed time between the hold's stored start time and the
  release instant, and no more

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
  reads exactly zero, never negative, once that fold is persisted

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

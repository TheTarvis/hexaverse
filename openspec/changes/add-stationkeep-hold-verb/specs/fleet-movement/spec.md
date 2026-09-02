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
Cargo Pool" defines: `release`; automatic exhaustion past the stored dry
instant; another verb's `fuel` mutation landing while the hold remains
open (which additionally restamps the hold and recomputes its dry
instant); and a burn commit that replaces an open hold outright (which
settles the accrued upkeep but never restamps, since the hold no longer
exists once the burn is stored) (see "Station-Keeping Hold and Release Are
Fleet Verbs" and "Station-Keeping Upkeep Is Settled at Discrete Events,
Never Folded Into the Stored Cargo Pool"). No verb outside this list SHALL
mutate a fleet's `fuel` entry.

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
(and, for release or force-demotion, its orbit parameters) change. `hold`
SHALL be rejected, with its own named reason distinct from the
not-orbiting rejection, whenever the dry instant computed per "Station-
Keeping Upkeep Is Settled at Discrete Events, Never Folded Into the Stored
Cargo Pool" is not strictly after the hold's start time — which, given
that formula's ceiling, occurs exactly when the fleet's currently held
`fuel` is zero (any strictly positive fuel ceilings to a dry-instant offset
of at least one whole millisecond, so this is not merely "small fuel," it
is specifically zero fuel). Accepting such a `hold` would store a
`stationkeep` park whose dry instant equals its start time, a value
`space-kinematics`'s own decode requirement ("A station-keep park with a
missing or invalid dry instant fails to decode") rejects outright —
bricking the fleet's every subsequent read and command the instant that
park is persisted, exactly the population of stranded, near-zero-fuel
fleets link 7 made discoverable in the first place. This precondition
guards only `hold`'s own commit; a burn committed from an already-open
hold is guarded separately, by "Station-Keeping Upkeep Is Settled at
Discrete Events..."'s burn-commit settlement bullet, which never restamps
and therefore never re-triggers this same undecodable state by a different
path.

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

#### Scenario: Holding a fleet with insufficient fuel is rejected, not silently bricked
- **WHEN** `hold` is submitted for an orbiting fleet whose currently held
  `fuel` is zero, so the computed dry instant would not be strictly after
  the hold's start time
- **THEN** the call is rejected with its own named reason, distinct from
  the not-orbiting rejection, no `stationkeep` park is stored, and the
  fleet's park mode is unchanged

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
`hold`'s commit SHALL compute the hold's dry instant, in `WorldMillis`, as:

```
dryInstant = holdStart + ceil_to_integer_ms(
    1000 × (fuelAtHoldStart × FuelParams.DeltaVPerTon) / upkeepRate
)
```

**Unit chain, stated explicitly so it cannot be gotten backwards by
omission:** `fuelAtHoldStart` is the fleet's held `fuel` tonnage at the
instant `hold` commits; `FuelParams.DeltaVPerTon` (Δv per ton) converts it
to the Δv budget that fuel affords; `upkeepRate` (`space.StationKeepRate`,
a body-derived quantity in Δv per second) divides that budget into the
number of seconds the hold can run before it goes dry; multiplying by
`1000` converts that second count to milliseconds; and the whole quantity
is quantized **up** to the next integer millisecond — never down,
mirroring `space-kinematics`'s "Burn Timing Quantizes to Integer
World-Milliseconds by Ceiling" — so a hold is never folded dry one
millisecond before it is truly exhausted. `hold` SHALL be rejected, with
its own named reason distinct from the not-orbiting rejection, whenever
this computation yields a `dryInstant` that is not strictly after
`holdStart` — which, given the ceiling, occurs exactly when
`fuelAtHoldStart` is zero (any strictly positive fuel ceilings to an
offset of at least one millisecond) — since persisting such a park would
store a `dryInstant` equal to its `holdStart`, a value `space-kinematics`'s
own decode requirement ("A station-keep park with a missing or invalid dry
instant fails to decode") rejects outright, bricking the fleet's every
subsequent read and command the instant that park is persisted.

The system SHALL convert `space-kinematics`'s station-keep upkeep rate
into fuel by the same `FuelParams.DeltaVPerTon` conversion
`add-fuel-as-cargo`'s "A Burn's Fuel Cost Scales With Roster Hull Count,
Never Loaded Mass" uses for a burn, **without** the hull-count multiplier
— station-keeping is a per-fleet positional hold, not a burn, and this
change does not extend the hull-count scaling ruling to it. The fleet's
stored `fuel` cargo value SHALL NOT be decremented merely by elapsed hold
time; it SHALL be settled only at a discrete event, computed closed-form
from the hold's stored start time and the event's own world time — never
as accumulated per-tick state, per `space-kinematics`'s "No Value Is
Derived From Accumulated Per-Tick State". Every elapsed duration below is
a difference of two `WorldMillis` stamps and SHALL be converted to seconds
(divided by `1000`) before it is multiplied by `upkeepRate` (Δv per
second) — the same unit chain the dry-instant formula above states
explicitly, so it cannot be gotten backwards again by omission:
- `release`, called before the hold's stored dry instant, SHALL debit
  `cargo.fuel` by exactly
  `(rate × ((releaseTime − holdStartTime) / 1000)) / FuelParams.DeltaVPerTon`
  — the upkeep rate times elapsed *seconds* yields Δv, which must be
  converted to tons by the same `FuelParams.DeltaVPerTon` conversion a
  burn's fuel cost uses (without the hull-count multiplier) before it is
  debited from a tons-denominated field; omitting the Δv-to-tons division
  overcharges by a factor of `FuelParams.DeltaVPerTon` (5.0× at today's
  placeholder value), and separately omitting the milliseconds-to-seconds
  division overcharges by a further factor of `1000` on top of that (since
  stored timestamps are `WorldMillis` project-wide, never seconds) — in
  the same transaction that converts the park to orbit.
- A `stationkeep` park observed (by any read or write) at or after its
  stored dry instant SHALL be folded by `space.StateAt` into its released
  orbit as of that dry instant (see `space-kinematics`'s "A Station-Keeping
  Park Past Its Dry Instant Is Its Released Orbit, With No Extra Persisted
  State"), with `cargo.fuel` settled to exactly zero — never negative — in
  the same write that first persists the fold.
- **Any mutation of `cargo.fuel` by another verb while a `stationkeep`
  hold is open and before its stored dry instant, that leaves the hold
  open afterward** (in particular, a refuel purchase settled while docked
  at a station the fleet is simultaneously holding beside, since `hold`,
  `release`, and `fuel-purchase`'s docked-state precondition are
  independent of one another and nothing in this capability prevents a
  fleet from being both attached to, and station-keeping near, the same
  station) **SHALL, in the same transaction as that mutation:** first
  debit the accrued upkeep since the hold's stored start time
  (`(rate × ((mutationTime − holdStartTime) / 1000)) /
  FuelParams.DeltaVPerTon`, exactly as a `release` would, but without
  converting the park to orbit), then apply the mutation's own delta
  against the resulting balance, then **restamp the hold's stored start
  time to the mutation's own instant and recompute the dry instant from
  the fuel level immediately after the mutation**. Without this, a hold's
  dry instant is fixed against a fuel baseline a later, independent
  mutation has silently moved, and the automatic past-dry-instant fold
  would settle the wrong amount — up to and including settling a
  just-purchased refuel to zero the moment the stale dry instant is next
  observed.
- **A burn committed against a fleet whose effective park is `stationkeep`,
  open and before its stored dry instant, SHALL, in the same transaction
  that commits the burn:** first debit the accrued upkeep since the
  hold's stored start time exactly as the bullet above would, then
  evaluate and debit the burn's own fuel cost (per `add-fuel-as-cargo`'s
  "A Burn Commit Is Rejected When Its Fuel Cost Exceeds Available
  Fuel...") against the resulting balance, then store the committed burn
  in place of the `stationkeep` park. This settlement SHALL NOT restamp
  the hold or compute a fresh dry instant — unlike the bullet above, a
  burn commit does not leave the hold open; it replaces the park entirely,
  so there is no hold left to restamp. **Correction to an earlier draft,
  which named only `release` and automatic exhaustion as settlement events
  and left a burn ordered from an open hold undefined:** left undefined, a
  burn from an open hold either silently forgives the accrued upkeep (if
  nothing settles it — the upkeep economy becomes optional: hold, burn
  away, pay nothing), or, had it instead been folded into the bullet
  above's settle-restamp-recompute path, would restamp a park the burn's
  own commit is about to overwrite anyway, computing a fresh dry instant
  against a hold that no longer exists — and because a burn can be
  committed for exactly the fleet's available fuel, that restamp could
  itself compute a `dryInstant` equal to the restamped `holdStart`, the
  exact undecodable park "Station-Keeping Hold and Release Are Fleet
  Verbs"'s zero-fuel precondition exists to prevent, reached by a path
  that precondition does not guard (it gates only `hold`'s own commit, not
  a burn's). A burn committed against a fleet whose `stationkeep` park is
  already at or past its stored dry instant instead settles via the
  automatic past-dry-instant fold above, before the burn's own
  affordability check evaluates, per "Every Decision Reading Fuel Settles
  a Past-Dry-Instant Hold First."
This reuses the two park modes "Station-Keeping Hold and Release Are Fleet
Verbs" already defines; no new park mode is invented for the
force-demoted case.

#### Scenario: Releasing before exhaustion debits exactly the accrued upkeep, converted to tons
- **WHEN** a station-keeping fleet's hold is released before its stored
  dry instant
- **THEN** the fleet's `fuel` cargo decreases by exactly the upkeep rate
  times the elapsed time between the hold's stored start time and the
  release instant — that elapsed `WorldMillis` duration converted to
  seconds before the multiplication — divided by `FuelParams.DeltaVPerTon`
  to convert the resulting Δv figure to tons, and no more

#### Scenario: A release at exactly the dry instant debits exactly the fuel held at hold start, leaving zero
- **WHEN** a station-keeping fleet's hold is released at the exact instant
  its stored dry instant is reached
- **THEN** the debit computed by `release`'s closed-form formula equals
  exactly the `fuel` tonnage held at the hold's start, leaving the fleet's
  `fuel` cargo at exactly zero — the identical result the automatic
  past-dry-instant fold would have produced had the hold instead been left
  to exhaust on its own

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
  commit's settlement never restamps

#### Scenario: A refuel during an open hold settles the accrual, restamps the hold, and recomputes the dry instant
- **WHEN** a fleet's `fuel` cargo is credited by a refuel purchase while it
  is station-keeping, before that hold's stored dry instant
- **THEN** the transaction first debits the upkeep accrued since the
  hold's stored start time, then credits the refuel's tonnage, then
  restamps the hold's stored start time to the refuel's instant and
  recomputes the dry instant from the resulting fuel level — the refuel's
  full credited tonnage is never silently forfeited to a stale dry instant
  computed against the pre-refuel fuel level

### Requirement: Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First
The system SHALL, before evaluating any decision that reads a fleet's
`cargo.fuel` value to decide something — a burn commit's affordability
check (`add-fuel-as-cargo`'s "A Burn Commit Is Rejected When Its Fuel Cost
Exceeds Available Fuel..."), `fleet.FreeHold` (consumed by `mine`'s
commit-time precondition, `mine`'s resolve-time clamp
`freeHoldAtResolve`, a plain fleet-read consumer, and `fuel-purchase`'s
own free-hold precondition), the fleet read's estimated-maximum-range
computation (`add-fuel-as-cargo`'s "Fleet Read Reports an Estimated
Maximum Range From Current Fuel"), the fleet read's persistent stranded
indication (`add-fuel-as-cargo`'s "A Fleet's Read Reports a Persistent
Stranded Indication, Computed at the Acceleration Floor"), or any other
computation of a fleet's currently held fuel — first check whether that
fleet's stored park is a `stationkeep` park at or after its stored dry
instant, and if so, settle it within the same transaction or read path
(fold to its released orbit, persist `cargo.fuel` at exactly zero, per "A
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
in fact holds zero fuel — a cry-wolf failure in reverse.

#### Scenario: A burn commit against a past-dry-instant holding fleet evaluates against settled, zero fuel
- **WHEN** a burn is committed against a fleet whose `stationkeep` park's
  dry instant has already passed but has not yet been observed by any
  prior write
- **THEN** the commit's affordability check evaluates against the
  settled, zero fuel value — not the stale, pre-fold value the stored
  field still shows — and the settlement (fold to orbit, `fuel` persisted
  at zero) is applied in the same transaction as the commit

#### Scenario: FreeHold used by mine's resolve clamp reflects a settled hold
- **WHEN** `mine`'s resolve-time clamp computes `freeHoldAtResolve` for a
  fleet whose `stationkeep` hold's dry instant has already passed
- **THEN** the computation uses the settled fuel value (the hold folded to
  its released orbit, `fuel` at zero), never the stale pre-fold value that
  would otherwise over-report the fleet's available capacity

#### Scenario: A refuel's free-hold precondition reflects a settled hold
- **WHEN** `fuel-purchase`'s free-hold precondition is evaluated for a
  fleet whose `stationkeep` hold's dry instant has already passed
- **THEN** the precondition is evaluated against the settled fuel value,
  never a stale, over-reported pre-fold value that could reject an
  otherwise-affordable refuel or admit an otherwise-oversized one

#### Scenario: A fleet's estimated range reflects a settled hold before the range is computed
- **WHEN** a fleet's estimated-maximum-range field is computed for a fleet
  whose `stationkeep` park's dry instant has already passed
- **THEN** the range is computed from the settled, zero fuel value, never
  the stale pre-fold value that would otherwise report a healthy range for
  a fleet that in fact holds no fuel

#### Scenario: A fleet's persistent stranded indication reflects a settled hold before it is computed
- **WHEN** a fleet's persistent stranded indication is computed for a
  fleet whose `stationkeep` park's dry instant has already passed
- **THEN** the indication is computed from the settled, zero fuel value,
  never the stale pre-fold value that could read a fleet as not stranded
  merely because its dry instant has not yet been observed by any other
  write

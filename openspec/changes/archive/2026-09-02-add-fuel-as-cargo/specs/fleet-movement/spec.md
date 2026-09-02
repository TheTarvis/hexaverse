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

## ADDED Requirements

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

# fuel-purchase Specification

## Purpose
TBD - created by archiving change add-fuel-as-cargo. Update Purpose after archive.
## Requirements
### Requirement: Refuel Requires the Fleet Docked To the Selling Station
The system SHALL serve `POST /v1/fleets/:fleetId/refuel` and SHALL accept
a refuel only when the requesting fleet's effective state, at the request
instant, is `docked` to a station; coasting, burning, lane-transit,
lane-hold, docked-elsewhere, or merely parked at, near, or coincident with
a station's position without a matching stored `attachedTo` SHALL be
rejected, following the same attachment doctrine `goods-sale`'s and
`mine-extraction`'s docked-state checks already establish.

#### Scenario: A fleet docked to a station may refuel
- **WHEN** a fleet whose effective state is `docked` to a station submits
  a refuel, and all other preconditions hold
- **THEN** the refuel is accepted

#### Scenario: A coasting or burning fleet cannot refuel
- **WHEN** a fleet whose effective state is `coast` or `burn` submits a
  refuel
- **THEN** the refuel is rejected

#### Scenario: A fleet in lane transit or lane-held cannot refuel
- **WHEN** a fleet whose effective state is `laneTransit` or `laneHold`
  submits a refuel
- **THEN** the refuel is rejected

#### Scenario: A fleet parked near a station but not attached to it cannot refuel
- **WHEN** a fleet's resolved position coincides with or lies near a
  station, but its stored `attachedTo` does not name it
- **THEN** the refuel is rejected with the same not-docked rejection as
  any other non-docked state

### Requirement: Refuel Resolves the Station From the Acting Fleet's Own System, Never a Client-Supplied Identifier
A refuel request SHALL carry no system id and no station identifier — the
station a refuel settles against SHALL always be resolved as the station,
if any, in the acting fleet's own current `systemId`, verified to be the
fleet's docked parent feature and of the station feature type, following
`goods-sale`'s "Sale Resolves the Station From the Acting Fleet's Own
System, Never a Client-Supplied Identifier" doctrine exactly. A feature
the acting fleet is docked to that is not of the station type SHALL be
rejected with the same reason as "not docked to a station."

#### Scenario: A refuel request carries no system id or station identifier
- **WHEN** a refuel request is constructed
- **THEN** its schema has no field naming a system id or an arbitrary
  station identifier — only the acting fleet id, requested tonnage, and
  operation key

#### Scenario: A refuel cannot name a station outside the acting fleet's own system
- **WHEN** a refuel is submitted for a fleet docked in system A
- **THEN** the refuel can only ever settle against system A's station —
  there is no request field or resolution path by which a different
  system's station could be named or folded against

### Requirement: Refuel Requires Fleet Ownership, 404 Before Any Other Precondition
The system SHALL accept a refuel only for the fleet named by the request
when the requesting account's living corporation owns it, checked before
any other precondition. A foreign or unknown fleet SHALL respond `404 Not
Found`; an unauthenticated request SHALL respond `401 Unauthorized`;
credits SHALL be debited only from, and fuel credited only to, the owning
corporation's own fleet. An empty resolved corporation id SHALL never be
treated as a match against a fleet whose own `corporationId` is also empty
or absent, following `goods-sale`'s identical rule.

#### Scenario: An unauthenticated refuel is rejected
- **WHEN** a refuel request carries no valid bearer token
- **THEN** the response is `401 Unauthorized` and no cargo, balance, or
  ledger change occurs

#### Scenario: A foreign corporation cannot refuel another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits a refuel against F
- **THEN** the response is `404 Not Found`, and F's cargo, the requester's
  balance, and the ledger are all unchanged

#### Scenario: The owning corporation's refuel proceeds normally
- **WHEN** the requesting account's living corporation owns the fleet and
  all other preconditions hold
- **THEN** the refuel settles, debiting the owning corporation's own
  balance and crediting that same fleet's `fuel` cargo

### Requirement: A Single Global Fuel Price, Unlimited Station Supply, No Station-Side Write
The system SHALL price `fuel` at exactly one configured constant
(`FuelParams.PricePerTon`) — the same value at every station in the
galaxy, with no per-station or per-region variance in this version (see
design.md Open Questions for per-station/per-region pricing as a deferred
future direction). This constant SHALL be served to clients on the fleet's
own existing read (`fleet-movement`'s "Fleet Read Serves the Configured
Fuel Price, Never Duplicated Client-Side") rather than mirrored as a
separate client-side constant, so that any client-rendered preview of a
refuel's cost and the settlement's actually-charged cost derive from the
identical value and can never diverge. A station SHALL be treated as
carrying unlimited fuel supply: a refuel settlement SHALL make no write to
any station document or store, and no station-scoped quantity SHALL ever
be decremented, exhausted, or checked for a refuel — the settlement
transaction touches exactly two domains, the buying corporation's credit
balance and the fleet's cargo pool, never a third.

#### Scenario: Two stations quote the identical fuel price
- **WHEN** the fuel price is read at two different stations, in the same
  or different regions
- **THEN** both report the identical configured constant

#### Scenario: Repeated refuels never exhaust a station's fuel supply
- **WHEN** many refuels settle at one station in succession
- **THEN** every one succeeds on identical terms, with no station-side
  quantity ever decremented or checked

#### Scenario: A refuel settlement makes no write to the station store
- **WHEN** a refuel settles
- **THEN** no station document or store is written, read for a decrement,
  or locked — the settlement transaction spans only the corporation's
  credit balance and the fleet's cargo pool

### Requirement: Cost Arithmetic Rounds Against the Buyer, Is Overflow-Safe, and Is Never Zero
The system SHALL compute a refuel's cost (requested tonnage ×
`FuelParams.PricePerTon`) rounding **up** to the nearest whole credit — the
buyer-adverse direction, the mirror image of `goods-sale`'s seller-adverse
floor (`goods-sale`'s "Rounding Rule Preserves Reconciliation") — before
that cost is compared against the requester's balance or debited, so a
fractional cost never lets the buyer pay less than the tonnage is actually
worth, and only **after** the requested tonnage has already been validated
as positive, finite, and within the fleet's free hold (`fuel-purchase`'s
"Positive Finite Tonnage Within the Fleet's Free Hold") — cost is never
computed from a not-yet-validated tonnage. **Unlike `goods-sale`'s
floor-rounded proceeds, rounding a refuel's cost UP against a positive
tonnage and a strictly positive price can never itself produce zero whole
credits** (`ceil(tons × price) ≥ 1` whenever `tons > 0` and `price > 0`):
the reject-if-zero guard below is therefore a **misconfiguration guard**,
not a live gameplay path a player can trigger with a legitimate tonnage
and a sane, positive configured price — it exists to fail safely if
`FuelParams.PricePerTon` is ever misconfigured at or below zero, not to
catch a dust purchase the way `goods-sale`'s floor-rounded "rounds to
zero" case genuinely can. IF `FuelParams.PricePerTon` is configured at or
below zero, THEN every refuel request SHALL be rejected with a
distinguishable reason, crediting no fuel, debiting no credits, and
appending no ledger entry, rather than settling at a zero or negative
cost — accepting such a request would either append a ledger entry
`corporation-credits`' "No amount recorded for a credit mutation SHALL
ever be zero" forbids, or silently skip the ledger and mint fuel for free.
The computation SHALL also be overflow-safe, **on the same
misconfiguration footing**: because tonnage is already bounded to a
positive value within the fleet's free hold before cost is computed, an
overflowing cost is reachable only if `FuelParams.PricePerTon` is itself
configured large enough that even a free-hold-bounded tonnage overflows —
the system SHALL reject, with a distinguishable reason, a cost computation
that would overflow the balance's integer type or produce a non-finite
intermediate, crediting no fuel and debiting no credits. Every ledger
entry a settled refuel appends SHALL carry a strictly negative signed
amount (a refuel is a debit — see `corporation-credits`'s "Append-Only
Trade Ledger"), never zero and never positive.

#### Scenario: Fractional cost rounds up against the buyer
- **WHEN** a refuel's exact cost (tonnage × `FuelParams.PricePerTon`) is a
  non-integer value
- **THEN** the charged and debited cost is that value rounded up to the
  next whole credit, never rounded down

#### Scenario: A misconfigured non-positive price rejects every refuel, rather than settling for free
- **WHEN** `FuelParams.PricePerTon` is configured at or below zero
- **THEN** every refuel request is rejected with a distinguishable reason,
  crediting no fuel and debiting no credits, rather than computing and
  settling a zero or negative cost

#### Scenario: The reject-zero guard is unreachable under a correctly configured, positive price
- **WHEN** `FuelParams.PricePerTon` is any strictly positive value and a
  refuel's requested tonnage has already been validated as positive and
  within the fleet's free hold
- **THEN** the rounded-up cost is always at least one whole credit, so this
  guard's rejection path is never exercised by ordinary play — it exists
  solely as a defense against a misconfigured, non-positive price constant

#### Scenario: A misconfigured price causing an overflowing cost computation is rejected, not wrapped
- **WHEN** a refuel's already free-hold-bounded tonnage and a misconfigured
  `FuelParams.PricePerTon` would together produce a cost outside the
  balance's integer range, or a non-finite intermediate
- **THEN** the refuel is rejected with a distinguishable reason, and no
  fuel, balance, or ledger state changes

#### Scenario: A settled refuel never appends a non-negative-signed ledger entry
- **WHEN** any refuel settles
- **THEN** its ledger entry's signed amount is strictly less than zero

### Requirement: Refuel Is All-Or-Nothing, Never Partially Filled
A refuel SHALL be filled entirely or rejected entirely: unlike
`goods-sale`'s demand-entry fold, which splits a sale across
price-descending entries as needed, a refuel has exactly one price and
exactly one entry (the unlimited station supply), so there is no partial
fill to compute. A refuel request whose full requested tonnage's cost,
computed per "Cost Arithmetic Rounds Against the Buyer, Is Overflow-Safe,
and Is Never Zero," would exceed the requester's current credit balance
SHALL be rejected in full — crediting no partial tonnage of `fuel` and
debiting no partial credits — never reduced to whatever tonnage the
balance could afford.

#### Scenario: An affordable request fills its full requested tonnage
- **WHEN** a refuel's full requested tonnage's cost is at or below the
  requester's current credit balance
- **THEN** the fleet's `fuel` cargo increases by exactly the full
  requested tonnage, and the balance is debited by exactly that tonnage's
  cost

#### Scenario: An unaffordable request is rejected in full, never reduced
- **WHEN** a refuel's full requested tonnage's cost exceeds the
  requester's current credit balance
- **THEN** the refuel is rejected in full — the fleet's `fuel` cargo is
  unchanged and no credits are debited — never settled for a smaller,
  affordable tonnage

### Requirement: Positive Finite Tonnage Within the Fleet's Free Hold
A refuel SHALL name a positive, finite tonnage not exceeding the fleet's
currently free hold (derived capacity minus tonnage currently held across
all kinds, `fuel` included). A violation SHALL be rejected in full.

#### Scenario: Zero, negative, or non-finite tonnage is rejected
- **WHEN** a refuel requests `tons` at or below zero, or a `NaN`/infinite
  value
- **THEN** the refuel is rejected and no state changes

#### Scenario: A request exceeding free hold is rejected, not clamped
- **WHEN** a refuel requests more tons than the fleet's current free hold
- **THEN** the refuel is rejected outright — never clamped down to the
  available free hold

### Requirement: One Atomic Transaction — Credit Debit and Fuel Credit
A refuel's credit-balance debit, fleet `fuel`-cargo credit, and ledger
append SHALL occur in one transaction, all-or-nothing, with every
precondition re-evaluated against a transactional re-read — a precondition
satisfied only by a pre-transaction read SHALL never be sufficient to
commit, following `goods-sale`'s "One Atomic Transaction" doctrine,
narrowed to the two domains this verb actually touches (no station-side
effect, per "A Single Global Fuel Price, Unlimited Station Supply, No
Station-Side Write").

Where the refueled fleet is holding an open `stationkeep` park before its
stored dry instant, that same one transaction SHALL additionally carry two
further effects, ordered relative to the fuel credit as
`fleet-movement`'s "Station-Keeping Upkeep Is Settled at Discrete Events,
Never Folded Into the Stored Cargo Pool" defines them: **first**, the debit
of the upkeep accrued since the hold's stored start time, applied before
the refuel's own credit; and **last**, the restamp of that hold's stored
start time to the refuel's own instant together with the recomputation of
its dry instant from the post-credit fuel level. Both are effects of this
same transaction — never a follow-up write, never a compensating write —
so a settlement failure leaves neither of them visible, exactly as it
leaves neither of the two original effects visible.

#### Scenario: A settled refuel lands both effects together
- **WHEN** a refuel settles
- **THEN** the corporation's balance is debited, the fleet's `fuel` cargo
  is credited, and a ledger entry is appended — all from the same
  transaction

#### Scenario: A settlement failure after a partial write leaves no effect visible
- **WHEN** a refuel's settlement fails or the process crashes after
  mutating one of {corporation balance, fleet fuel cargo} but before both
  effects commit
- **THEN** neither effect is visible to any subsequent read — a retry with
  the same operation key starts from a clean, entirely-unsettled state

#### Scenario: A refuel into an open hold settles, credits, and restamps in the one transaction
- **WHEN** a refuel settles for a fleet holding an open `stationkeep` park
  before its stored dry instant
- **THEN** the accrued-upkeep debit, the fuel credit, the hold's restamped
  start time, the recomputed dry instant, the balance debit, and the ledger
  append all commit together, and a failure of that transaction leaves none
  of them visible

#### Scenario: A replayed refuel performs no second upkeep debit, restamp, or recomputation
- **WHEN** a refuel request carrying an already-settled operation key for
  the same corporation is replayed against a fleet holding an open
  `stationkeep` park
- **THEN** the replay returns the original settlement result and performs
  none of the station-keeping effects a second time — no second accrued-
  upkeep debit, no second restamp of the hold's start time, and no
  recomputation of its dry instant — so a replay can neither charge upkeep
  twice nor silently extend the hold by re-stamping it at the replay's own
  instant

### Requirement: Idempotent By Operation Key
A refuel SHALL accept a caller-supplied operation key, scoped per
`corporation-credits`'s "Idempotent Credit Mutation By Operation Key" to
the buying corporation's own ledger. A retried refuel request carrying an
already-settled operation key for the same corporation SHALL be a no-op
returning the original settlement result — never a second debit or
credit. A reused key naming a different fleet or tonnage than the
recorded entry SHALL be rejected as a conflict, not answered as a replay.

#### Scenario: A retried refuel after a lost response does not double-charge
- **WHEN** a client's refuel request succeeds server-side but its response
  is lost, and the client retries the identical request (same operation
  key)
- **THEN** the retry returns the original settlement result, with no
  second debit or credit

#### Scenario: A reused key naming different parameters is rejected as a conflict
- **WHEN** a refuel is retried with an operation key already recorded, but
  naming a different fleet or tonnage than the recorded entry
- **THEN** the request is rejected as a conflict, never answered as a
  successful replay

### Requirement: Rejections Report a Distinguishable Reason
Every rejection this capability defines — not docked to a station (or
docked to a non-station feature), ownership, invalid or oversized
tonnage, and an unaffordable request — SHALL carry a distinguishable
reason in the response body, following the `gin.H{"error": "<reason>"}`
convention `mine-extraction` and `goods-sale` already establish. The two
existence-hiding rejections (a foreign fleet, an unknown fleet) SHALL both
return `404 Not Found` with one byte-identical reason string, mutually
indistinguishable, following `goods-sale`'s identical rule.

#### Scenario: Two different rejections carry different reasons
- **WHEN** two separately rejected refuels fail for two different reasons
  (e.g., not-docked vs. unaffordable)
- **THEN** the two responses' reason text differs

#### Scenario: The two existence-hidden rejections are mutually indistinguishable
- **WHEN** refuels are submitted naming, respectively, a fleet owned by
  another corporation and a fleet id that does not exist
- **THEN** both responses carry status `404` and identical reason text

### Requirement: Instant, Not an Action
A refuel SHALL settle synchronously within its triggering request —
creating no `action-dispatch` action, claiming no movement or sensor
channel slot, and computing no ETA. It SHALL proceed even while the
refueling fleet has a running scan on the independent sensor channel,
following `goods-sale`'s identical "Instant, Not an Action" precedent.
(A docked fleet with a running **mine** action is not a case this
requirement needs to address: `fuel-purchase`'s docked-to-station
precondition requires attachment to a station, while a running mine
requires attachment to the mined feature for the run's whole duration —
the two are mutually exclusive by attachment, so "a docked fleet with a
running mine refuels" is not a reachable configuration.)

#### Scenario: A settled refuel's response carries no action
- **WHEN** a refuel settles
- **THEN** the response includes no action id and no ETA

#### Scenario: A fleet with a running scan can still refuel
- **WHEN** a docked fleet with a running scan on the sensor channel submits
  a refuel
- **THEN** the refuel is accepted normally, unaffected by the running scan


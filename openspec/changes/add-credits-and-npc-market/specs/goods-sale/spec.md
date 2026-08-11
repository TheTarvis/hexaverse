## ADDED Requirements

### Requirement: Sale Requires the Fleet Docked To the Buying Station
A sale SHALL be accepted only when the selling fleet's effective state, at
the request instant, is `docked` to the named station; coasting, burning,
lane-transit, lane-hold, or docked-elsewhere SHALL be rejected.

#### Scenario: A fleet docked to the named station may sell
- **WHEN** a fleet whose effective state is `docked` to the named station
  submits a sale, and all other preconditions hold
- **THEN** the sale is accepted

#### Scenario: A coasting fleet cannot sell
- **WHEN** a fleet whose effective state is `coast` submits a sale
- **THEN** the sale is rejected

#### Scenario: A burning fleet cannot sell
- **WHEN** a fleet whose effective state is `burn` submits a sale
- **THEN** the sale is rejected

#### Scenario: A fleet in lane transit or lane-held cannot sell
- **WHEN** a fleet whose effective state is `laneTransit` or `laneHold`
  submits a sale
- **THEN** the sale is rejected

#### Scenario: A fleet docked elsewhere cannot sell at a different station
- **WHEN** a fleet docked to a feature other than the named station submits
  a sale against that station
- **THEN** the sale is rejected

### Requirement: Settlement Only Where the Goods Physically Are
A sale SHALL debit only the selling fleet's own cargo pool at its own
current station; no path SHALL exist by which tonnage held in another
fleet, another system, or in transit is sold at this station.

#### Scenario: A sale cannot draw on cargo held elsewhere
- **WHEN** a sale names tonnage the selling fleet's own hold does not carry,
  even if the owning corporation holds sufficient tonnage of that kind on a
  different fleet
- **THEN** the sale is rejected — no cross-fleet substitution occurs

### Requirement: Sale Requires Fleet Ownership, 404 Before Any Other Precondition
The system SHALL accept a sale only for the fleet named by the request when
the requesting account's living corporation owns it, checked before any
other precondition. A foreign or unknown fleet SHALL respond `404 Not
Found`; an unauthenticated request SHALL respond `401 Unauthorized`;
proceeds SHALL credit only the owning corporation. This departs from
`fleet-movement`'s "Command Endpoints Enforce No Fleet Ownership" baseline
for the same reason `mine-extraction`'s "Mine Command Requires Fleet
Ownership" does: selling a foreign fleet's cargo converts someone else's
hauled goods into the requester's own credits — a theft vector, not a
reversible reposition. An empty resolved corporation id (a corpless
requester, including `request-authorization`'s fail-open case where
corporation resolution itself errored) SHALL never be treated as a match
against a fleet whose own `corporationId` is also empty or absent — an
empty requester corporation id owns nothing.

#### Scenario: An unauthenticated sale is rejected
- **WHEN** a sale request carries no valid bearer token
- **THEN** the response is `401 Unauthorized` and no cargo, balance, or
  ledger change occurs

#### Scenario: A foreign corporation cannot sell with another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits a sale against F
- **THEN** the response is `404 Not Found`, and F's cargo, the requester's
  balance, and the ledger are all unchanged

#### Scenario: The owning corporation's sale proceeds normally
- **WHEN** the requesting account's living corporation owns the selling
  fleet and all other preconditions hold
- **THEN** the sale settles, crediting the owning corporation's own balance

#### Scenario: An authenticated but corpless requester is rejected
- **WHEN** an authenticated account with no living corporation
  (`common.ActorCorp` unset — including the fail-open case where corporation
  resolution itself errored) submits a sale against any fleet
- **THEN** the response is `404 Not Found`, and no cargo, balance, ledger, or
  request state changes

#### Scenario: An empty corporation id never matches a fleet's owner
- **WHEN** the requester's resolved corporation id is empty and the named
  fleet's stored `corporationId` is also empty or absent
- **THEN** the request is rejected as unowned — an empty requester corporation
  id SHALL never be treated as matching any fleet, and no credit mutation is
  ever applied to an empty corporation id

### Requirement: Sale Resolves the Station From the Acting Fleet's Own System, Never a Client-Supplied Identifier
A sale request SHALL carry no system id (venue/station identity is never
client-supplied) — the station a sale settles against SHALL always be
resolved as the station, if any, in the acting fleet's own current
`systemId`, verified to be the fleet's docked parent feature (see "Sale
Requires the Fleet Docked To the Buying Station") and of the station
feature type. This makes cross-system station probing structurally
impossible via this endpoint (correcting an earlier draft's untestable
"visibility gate on the sale" requirement, which relied on a request
shape — an arbitrary, client-supplied station identifier — this endpoint
never has: a sale can only ever resolve the ONE station its own acting
fleet is physically, already docked to, and a fleet cannot become docked
somewhere without an `Order` that already resolved that same station,
per `trading-station`'s structural, ungated splice — see design.md
Decision 4). A feature the acting fleet is docked to that is not of the
station type SHALL be rejected with the same reason as "not docked to a
station."

#### Scenario: A sale request carries no system id
- **WHEN** a sale request is constructed
- **THEN** its schema has no field naming a system id or an arbitrary
  station identifier — only the acting fleet id, kind, tonnage, and
  operation key (plus the optional slippage guards)

#### Scenario: A sale cannot name a station outside the acting fleet's own system
- **WHEN** a sale is submitted for a fleet docked in system A
- **THEN** the sale can only ever settle against system A's station — there
  is no request field or resolution path by which a different system's
  station could be named or folded against

#### Scenario: A docked feature that is not a station is rejected
- **WHEN** the acting fleet's docked parent feature exists but is not of
  the station feature type
- **THEN** the sale is rejected with the same reason as "not docked to a
  station" — no separate existence-hiding treatment applies, since no
  cross-system probe is constructible through this endpoint

### Requirement: Instant, Not an Action
A sale SHALL settle synchronously within its triggering request — creating
no `action-dispatch` action, claiming no movement or sensor channel slot,
and computing no ETA. It SHALL NOT be cancellable or acknowledgeable (there
is nothing running to cancel), and it SHALL proceed even while the selling
fleet has a running scan on the independent sensor channel.

#### Scenario: A settled sale's response carries no action
- **WHEN** a sale settles
- **THEN** the response includes no action id and no ETA

#### Scenario: A fleet with a running scan can still sell
- **WHEN** a docked fleet with a running scan on the sensor channel submits
  a sale
- **THEN** the sale is accepted normally, unaffected by the running scan

### Requirement: One Kind, Positive Finite Tonnage, Within the Hold
A sale SHALL name exactly one resource kind and a positive, finite tonnage
not exceeding the fleet's currently held tonnage of that kind. A violation
SHALL be rejected in full, never silently clamped to what is available.

#### Scenario: Zero, negative, or non-finite tonnage is rejected
- **WHEN** a sale requests `tons` at or below zero, or a `NaN`/infinite
  value
- **THEN** the sale is rejected and no state changes

#### Scenario: Tonnage exceeding held cargo is rejected, not clamped
- **WHEN** a sale requests more tons of a kind than the fleet currently
  holds
- **THEN** the sale is rejected outright — it is never clamped down to the
  held amount

#### Scenario: A valid request within held tonnage succeeds
- **WHEN** a sale requests a positive, finite tonnage at or below the
  fleet's held tonnage of the named kind
- **THEN** the sale is accepted (subject to the capability's other
  preconditions)

### Requirement: One Atomic Transaction — Hold Debit, Balance Credit, Ledger, Request Decrement
A sale's hold debit, corporation balance credit, ledger append, and — when
filling an NPC request — that request's remaining-quantity decrement SHALL
occur in one transaction, all-or-nothing. The fleet's held tonnage of the sold
kind, the corporation's balance, and the filled request's remaining quantity
SHALL each be re-read inside that same transaction and the sale's
preconditions re-evaluated against those transactional reads — a precondition
satisfied by a pre-transaction read SHALL never be sufficient to commit. A
sale whose transactional re-read no longer satisfies a precondition SHALL be
rejected in full and retried or failed; it SHALL NEVER be reduced, clamped, or
partially settled for this reason. This single transaction SHALL be opened
exactly once by the sale service itself, composed of narrow, transaction-
scoped primitives the owning domains (`corporations`, `fleet`, the station
store) implement and the sale service declares — never three sequential
service calls each opening its own transaction, and never a direct reach
into another domain's DAO (see design.md Decision 16).

#### Scenario: A settled sale lands all its effects together
- **WHEN** a sale settles
- **THEN** the fleet's cargo is debited, the corporation's balance is
  credited, a ledger entry is appended, and (if a request was filled) its
  remaining quantity is decremented — all from the same transaction

#### Scenario: Concurrent sales against one hold never oversell it
- **WHEN** two sales with distinct operation keys concurrently target one
  fleet's hold for combined tons exceeding what it carries
- **THEN** exactly one settles for its full requested tonnage and the other is
  rejected in full with a distinguishable reason — neither is reduced
- **AND** the fleet's cargo for that kind is never negative
- **AND** the total credits appended to the ledger across both attempts never
  exceed the value of the tonnage the fleet actually held before the attempts

#### Scenario: A stale pre-transaction read cannot commit a sale
- **WHEN** a sale's held-tonnage precondition passes on a pre-transaction read
  but the transactional re-read shows insufficient tonnage
- **THEN** the transaction aborts, no cargo, balance, ledger, or request state
  changes, and the response carries a distinguishable reason

#### Scenario: A settlement failure after any partial cross-domain write leaves no effect visible
- **WHEN** a sale's settlement fails or the process crashes after mutating any
  one of {fleet cargo, corporation balance/ledger, NPC request remaining
  quantity} but before all four effects commit
- **THEN** none of the four effects (cargo debit, balance credit, ledger
  entry, request decrement) is visible to any subsequent read — a retry with
  the same operation key starts from a clean, entirely-unsettled state, never
  a partially-settled one

### Requirement: Contention Aborts Retry Server-Side Before Surfacing Failure
A settlement transaction that aborts due to a Firestore transaction conflict
SHALL be retried automatically, server-side, a small fixed number of times
with a short backoff, before surfacing a distinguishable "busy, try again"
rejection to the caller — the caller SHALL never be exposed to the raw
transaction-conflict error, and the retry SHALL never be attempted an
unbounded number of times.

#### Scenario: A transient contention abort resolves on an automatic retry
- **WHEN** a settlement transaction aborts once due to a concurrent write and
  a retry within the configured retry count would succeed
- **THEN** the sale settles without the caller ever seeing the transient
  conflict

#### Scenario: Exhausted retries surface a distinguishable, retriable rejection
- **WHEN** a settlement transaction still conflicts after the configured
  number of automatic retries
- **THEN** the response is a distinguishable "busy, try again" rejection, and
  no cargo, balance, ledger, or request state changes

### Requirement: Settlement Folds Tonnage Across a Venue's Ordered Demand Entries
A sale's proceeds SHALL be computed by folding the sold tonnage across the
named venue's demand entries for the sold kind, ordered price-descending,
filling each entry to its remaining quantity before moving to the next,
until the sold tonnage is exhausted — one rule, with no NPC-specific branch.
A **venue** is an opaque scope key (in this version, always a station's id;
neither this fold nor the price-board read interprets that key as a station
id in any other way). A **demand entry** is `{unitPrice, remainingQuantity,
source}`; the station's configured floor price for the kind SHALL be
represented as one entry of last resort — unlimited remaining quantity,
lowest price priority — never as a fallback branch. In this version every
entry at a venue is NPC-sourced (the floor entry, plus zero or more open
premium-request entries); "fill the request first, then the floor" is
simply what this fold produces given this version's entry set. The
response SHALL report each filled entry's portion (tons and unit price) and
the total proceeds.

#### Scenario: A sale fully covered by the highest-priority open entry reports that entry's price
- **WHEN** a sale's tonnage is at or below the venue's highest-priced open
  demand entry's remaining quantity for the sold kind
- **THEN** the response reports that entry's unit price for all tons sold

#### Scenario: A sale exceeding the highest-priority entry's remaining quantity reports a split across entries
- **WHEN** a sale's tonnage exceeds the venue's highest-priced open demand
  entry's remaining quantity for the sold kind
- **THEN** the response reports each filled entry's portion (tons and unit
  price) separately, in the price-descending order the fold applied them,
  and their combined proceeds equal the reported total

#### Scenario: A sale against a venue with no open premium request reports the floor entry's price
- **WHEN** a sale settles at a venue/kind with no open premium-request entry
- **THEN** the response reports the floor entry's (last-resort) price for
  all tons sold, since it is the only entry available to fold against

### Requirement: Rounding Rule Preserves Reconciliation
Fractional proceeds (tonnage × unit price) SHALL round down to the nearest
whole credit **per filled demand-entry portion**, before summing to the
total, before crediting or ledgering — never computed as one exact
fractional total that is rounded once — so a sale never credits more than
its computed value and a split-fill sale's preview and settlement always
round at the same granularity. The ledger entry recorded for a sale SHALL
carry the exact rounded (applied) amount, never the pre-rounding
fractional value, so `corporation-credits`' reconciliation invariant
always holds regardless of rounding.

#### Scenario: Fractional proceeds round down per portion
- **WHEN** a sale's exact proceeds (tonnage × unit price) for any filled
  demand-entry portion are a non-integer value
- **THEN** that portion's credited amount is floored to the nearest whole
  credit before being summed into the total, and the ledger entry records
  the already-summed, already-rounded whole-credit total

#### Scenario: Reconciliation still holds after fractional-proceeds sales
- **WHEN** a corporation's ledger includes several sales whose exact
  proceeds were fractional
- **THEN** the fold of its ledger still exactly equals its stored balance

### Requirement: A Sale Whose Proceeds Round To Zero Is Rejected
The system SHALL reject, with `400 Bad Request` and a distinguishable reason,
a sale whose total proceeds after the rounding rule would be zero whole
credits — appending no ledger entry, debiting no cargo, and decrementing no
request quantity, matching `mine-extraction`'s "never a zero-amount one"
precedent. A sale SHALL never append a ledger entry whose signed amount is
zero.

#### Scenario: A dust sale rounding to zero credits is rejected
- **WHEN** a sale's tonnage multiplied by every applicable unit price floors
  to zero whole credits
- **THEN** the response is `400 Bad Request` with a distinguishable reason,
  no ledger entry is appended, the fleet's cargo is unchanged, and no
  request's remaining quantity is decremented

#### Scenario: Repeated dust sales append no ledger rows
- **WHEN** a caller submits many sales whose proceeds each round to zero
- **THEN** the corporation's ledger entry count is unchanged from before the
  first such request

### Requirement: Proceeds Arithmetic Is Overflow-Safe and Never Negative
The system SHALL compute a sale's proceeds so that the result is always a
non-negative whole-credit value representable in the balance's integer type,
rejecting the sale with `400 Bad Request` and a distinguishable reason if the
computation would overflow, produce a non-finite intermediate, or produce a
negative amount. No ledger entry recording a sale SHALL ever carry a negative
signed amount, and no credit mutation SHALL apply an amount whose sign
contradicts its entry kind.

#### Scenario: An overflowing proceeds computation is rejected, not wrapped
- **WHEN** a sale's tonnage and applicable unit prices would produce a value
  outside the balance's integer range, or a non-finite intermediate
- **THEN** the response is `400 Bad Request` with a distinguishable reason, and
  no cargo, balance, ledger, or request state changes

#### Scenario: A sale never appends a negative-amount entry
- **WHEN** any sale settles
- **THEN** its ledger entry's signed amount is strictly greater than zero

### Requirement: Idempotent By Operation Key
A sale SHALL accept a caller-supplied operation key, scoped per
`corporation-credits`'s "Idempotent Credit Mutation By Operation Key" to
the selling corporation's own ledger (never a galaxy-global keyspace) and
constrained per that capability's "Operation Key Format Is Constrained and
Its Namespace Reserved." A retried sale request carrying an already-settled
operation key for the same corporation SHALL be a no-op returning the
original settlement result — never a second debit, credit, or request
decrement. A reused key naming different sale parameters (fleet, kind,
tonnage, or station) than the recorded entry SHALL be rejected as a
conflict, not answered as a replay.

#### Scenario: A retried sale after a lost response does not double-sell
- **WHEN** a client's sale request succeeds server-side but its response is
  lost, and the client retries the identical request (same operation key)
- **THEN** the retry returns the original settlement result, with no second
  debit, credit, or request decrement

### Requirement: Optional Expected-Price Slippage Guard
A sale MAY carry a caller-supplied expected unit price for the first ton
sold and MAY carry a caller-supplied minimum acceptable total proceeds.
When either is supplied and the server's settlement would violate it —
the first-ton applicable price differing from the supplied expected unit
price, or the total proceeds after rounding falling below the supplied
minimum — the sale SHALL be rejected before any state change with a
distinguishable "price changed" reason. Both guards SHALL be evaluated
against the same transactional reads the settlement itself uses.

#### Scenario: A sale with no expected price supplied settles at the applicable price
- **WHEN** a sale is submitted with no expected unit price and no minimum
  total proceeds
- **THEN** it settles at whatever price currently applies, with no
  slippage check performed

#### Scenario: A matching expected price settles normally
- **WHEN** a sale's supplied expected unit price matches the server's
  applicable price for the first ton at settlement
- **THEN** the sale settles normally

#### Scenario: A stale expected price rejects with no state change
- **WHEN** a sale's supplied expected unit price no longer matches the
  server's applicable price (e.g., another corporation exhausted the
  relevant request between the client's board read and this sale)
- **THEN** the sale is rejected with a distinguishable "price changed"
  reason, and no cargo, balance, or ledger change occurs

#### Scenario: A partially drained request no longer passes the guard
- **WHEN** a sale supplies a minimum acceptable total proceeds computed from a
  board read, and a competing corporation has since reduced the request's
  remaining quantity so that most of the tonnage settles at the floor
- **THEN** the sale is rejected with the "price changed" reason, and no cargo,
  balance, ledger, or request state changes — even though the first ton still
  prices at the request's premium

#### Scenario: An invalid guard value is rejected, not ignored
- **WHEN** a supplied expected unit price or minimum total proceeds is
  negative, `NaN`, or infinite
- **THEN** the response is `400 Bad Request` and no state changes — such a
  value is never treated as "no guard supplied"

### Requirement: The Slippage Guard's Presence Is Explicit, Not Inferred From a Zero Value
The system SHALL distinguish a slippage guard that was supplied from one that
was omitted by an explicit presence signal, never by comparing the value to
zero — so a client that omits the guard is never rejected as though it had
supplied an unmatchable price.

#### Scenario: An omitted guard does not reject the sale
- **WHEN** a sale request omits the expected-price field entirely
- **THEN** no slippage check is performed and the sale settles at the
  applicable price

### Requirement: Rejections Report a Distinguishable Reason
Every rejection this capability defines — not docked to a station (or
docked to a non-station feature), ownership, invalid or oversized tonnage,
unknown or untradable kind, no configured floor for the kind at this
region, a budget/absorption limit, the price-changed slippage guard, and a
zero-proceeds sale — SHALL carry a distinguishable reason in the response
body, following the `gin.H{"error": "<reason>"}` convention
`mine-extraction` established. The existence-hiding rejections are the
explicit exception: a foreign fleet and an unknown fleet SHALL both return
`404 Not Found` with one byte-identical reason string, and SHALL NOT be
distinguishable from one another by status, body, or any other observable
(no separate station-existence-hiding case applies here — a sale never
names a station independently of its acting fleet, see "Sale Resolves the
Station From the Acting Fleet's Own System").

#### Scenario: Two different rejections carry different reasons
- **WHEN** two separately rejected sales fail for two different reasons
  (e.g., not-docked vs. unknown-kind)
- **THEN** the two responses' reason text differs

#### Scenario: The two existence-hidden rejections are mutually indistinguishable
- **WHEN** sales are submitted naming, respectively, a fleet owned by
  another corporation and a fleet id that does not exist
- **THEN** both responses carry status `404` and identical reason text

### Requirement: Sale Outcomes Are Countable By Reason
The system SHALL make every sale outcome — a settlement, and each
rejection reason this capability defines, including a contention-abort
rejection — available as a countable signal keyed by outcome/reason, so a
sale failure rate by reason and a transaction contention/abort rate are
each observable without parsing free-text logs.

#### Scenario: A rejection reason is individually countable
- **WHEN** sales are rejected for a mix of different reasons over time
- **THEN** each reason's rejection count is independently queryable

#### Scenario: Contention aborts are counted separately from business-rule rejections
- **WHEN** a settlement transaction retries and eventually surfaces a
  "busy, try again" rejection
- **THEN** that outcome is counted under a distinct signal from an
  ordinary precondition rejection (e.g. insufficient tonnage)

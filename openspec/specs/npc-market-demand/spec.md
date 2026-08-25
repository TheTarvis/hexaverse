# NPC Market Demand Specification

## Purpose

Give the NPC market its willingness to buy: static per-region floor prices
for the mine resource kinds, plus station-specific, quantity-limited premium
requests provisioned by a deterministic, params-driven mechanism — data-
driven demand entries, not a pricing engine. Budget and absorption knobs
ship unlimited but with specified, testable binding behavior
(reject-in-full, never a silent clamp), and pricing never responds to trade
activity in this version.

## Requirements

### Requirement: Static Per-Region Floor Prices
The system SHALL source a station's floor buy price for a tradable kind
from a per-region, per-kind configuration table (`market.Params.Floors`),
constant for the life of a world: two stations in the same region SHALL
quote identical floor prices for the same kind, the floor SHALL never move
in response to trade volume, and a `(region, kind)` pair with no configured
floor entry SHALL be treated as not tradable at any station in that region
— rejecting a sale naming that kind there with a distinguishable reason,
never defaulting to zero or any other computed price.

#### Scenario: Two stations in one region quote the same floor
- **WHEN** two stations in the same region are read for their floor price
  of the same kind
- **THEN** both report the identical configured floor

#### Scenario: Repeated sales do not move the floor
- **WHEN** many sales settle at a station's floor price for a kind
- **THEN** that station's (and region's) floor for that kind is unchanged
  afterward

#### Scenario: A kind with no configured floor is not tradable in that region
- **WHEN** a sale at a station names a kind with no configured floor entry
  for that station's region
- **THEN** the sale is rejected with a distinguishable reason, never settled
  at a price of zero or any computed value

### Requirement: Tradable Goods Are Exactly the Mine Resource Kinds
The system SHALL accept only the `system.ResourceKind` values the mine verb
can extract as tradable goods; any other kind SHALL be rejected.

#### Scenario: A non-resource kind is rejected
- **WHEN** a sale names a kind that is not one of the mine `ResourceKind`
  values
- **THEN** the sale is rejected with a distinguishable reason

### Requirement: Station-Specific Premium Requests, Quantity-Limited
An NPC request SHALL be scoped to one station and one resource kind, priced
strictly above that station's floor for that kind, and limited to a
configured remaining quantity that decreases as it is filled. A request
whose remaining quantity reaches zero SHALL stop quoting and SHALL no
longer be sellable against.

#### Scenario: A request's price exceeds its station's floor
- **WHEN** an open request is read at a station
- **THEN** its unit price is strictly greater than that station's floor
  price for the same kind

#### Scenario: A request's remaining quantity is reported
- **WHEN** a request is read after being partially filled
- **THEN** its reported remaining quantity reflects what has already been
  taken

#### Scenario: An exhausted request no longer quotes
- **WHEN** a request's remaining quantity reaches zero
- **THEN** it no longer appears among that station's open requests and
  cannot be sold against

### Requirement: Transactional Request Decrement Prevents Oversell
A request's remaining quantity SHALL decrement inside the same transaction
as the sale that fills it, re-read from the transactional state at commit
time (never a pre-transaction read), so concurrent sales against the same
request can never together take more than its remaining quantity permitted
at the moment each committed.

#### Scenario: Concurrent sales against one request never oversell it
- **WHEN** two sales concurrently target the same request, together naming
  more tons than its remaining quantity at the moment either commits
- **THEN** the requests' combined filled tonnage never exceeds what was
  available at each transactional commit — the sale that commits second
  fills only the request's remaining quantity at that moment (zero if
  already exhausted) and settles any remainder against the venue's next
  demand entry (per `goods-sale`'s demand-entry fold), never overselling
  the request and never leaving it at a negative remaining quantity

### Requirement: Budget/Absorption Knobs, Unlimited In This Version, With Specified Binding Behavior
Each NPC station SHALL carry a configured budget (maximum credit spend) and
absorption (maximum tonnage bought) limit per configured window. When a
floor-priced sale's quantity would exceed the currently remaining budget or
absorption limit, the entire sale SHALL be rejected with a distinguishable
reason — never partially filled for this reason (partial fill is reserved
for the request-vs-floor split, a distinct mechanism). This version's
shipped configuration for every station's budget and absorption limit
SHALL be unlimited.

#### Scenario: A sale within a configured (finite, fixtured) limit succeeds
- **WHEN** a sale's tonnage and price fall within a station's configured
  (finite, fixtured) budget/absorption limit for the current window
- **THEN** the sale succeeds normally

#### Scenario: A sale exceeding a configured (finite, fixtured) limit is rejected in full
- **WHEN** a sale would exceed a station's configured (finite, fixtured)
  budget or absorption limit for the current window
- **THEN** the entire sale is rejected — none of the requested tons are
  sold, and the reason is distinguishable from other rejections

#### Scenario: This version's unlimited configuration never rejects for this reason
- **WHEN** any sale is attempted against a station under this version's
  shipped (unlimited) budget/absorption configuration
- **THEN** the sale is never rejected for exceeding a budget or absorption
  limit

### Requirement: Pricing Never Responds To Trade Activity In This Version
No floor price, request price, or request quantity limit SHALL be
recomputed, adjusted, or otherwise derived from observed trade volume,
frequency, or history in this version. Every price and limit SHALL change
only via a provisioning or configuration write, never as a read-time or
trade-triggered computation.

#### Scenario: A burst of sales leaves pricing unchanged
- **WHEN** a station is subjected to many sales at its floor and against its
  open requests
- **THEN** its floor price and every other (unfulfilled) request's price
  and quantity remain exactly as configured/provisioned, unaffected by that
  trade volume

### Requirement: Request Lifetime Expiry Stops Quoting, Distinct From Exhaustion
A request whose configured lifetime elapses before its remaining quantity
reaches zero SHALL stop quoting and stop being sellable against, exactly as
an exhausted request does, but SHALL be distinguishably reported as
expired rather than exhausted, so a client can tell "nobody bought it in
time" apart from "it sold out."

#### Scenario: A lifetime-expired request is no longer sellable against
- **WHEN** a request's configured lifetime has elapsed with remaining
  quantity still greater than zero
- **THEN** a sale naming it is rejected, and it no longer appears among the
  station's open requests

#### Scenario: An expired request is distinguishable from an exhausted one
- **WHEN** a station's request history is read after one request expired
  unfilled and a different request was fully sold out
- **THEN** the two are reported with distinguishably different reasons/states
  (expired vs. exhausted), not a single undifferentiated "closed" state

### Requirement: NPC Request Provisioning Mechanism
The system SHALL provision a station's open NPC requests through a
configured, deterministic mechanism keyed by, at minimum, the station id
and a provisioning epoch, governed by named parameters
(`market.Params`): which stations receive requests, the concurrent open-
request count per station, the eligible resource kinds, the premium band
above that station's floor, the quantity band, a request's lifetime before
it expires unfulfilled, and the regeneration cadence after a request is
filled or expires. Provisioning attempts for the same station and epoch
SHALL converge on the same resulting set of requests (create-if-absent),
so concurrent reads never double-provision.

#### Scenario: Concurrent provisioning attempts converge on one request set
- **WHEN** two reads concurrently trigger provisioning for the same
  station and the same epoch
- **THEN** exactly one resulting set of requests exists for that
  station/epoch afterward, not two competing sets

#### Scenario: An expired, unfilled request is eligible for replacement no sooner than the regeneration cadence
- **WHEN** a request expires unfilled
- **THEN** its station is not eligible to receive a replacement request for
  that slot before the configured regeneration cadence has elapsed

#### Scenario: Re-provisioning the same station and epoch is a no-op
- **WHEN** provisioning is invoked a second time for a station/epoch that
  has already been provisioned
- **THEN** no additional requests are minted and the existing set is
  returned unchanged

### Requirement: Every Market Knob Is Configuration
Every numeric value this capability's requirements name — the floor table,
request premium and quantity bands, request lifetime, regeneration
cadence, and budget/absorption limits — SHALL live in a `market.Params`
object read at service construction or provisioning time, never as a
literal at a call site.

#### Scenario: Changing a configured knob changes subsequent behavior with no code change
- **WHEN** a `market.Params` value (e.g., a premium band bound) is changed
  and the owning service is reconstructed with the new params
- **THEN** subsequently provisioned requests reflect the new value, with no
  change required at any call site

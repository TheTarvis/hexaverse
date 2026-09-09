## MODIFIED Requirements

### Requirement: Mine ETA Preview From the Served Mining Rate
The system SHALL, while the mine offer is shown, preview the run's duration
as the entered tonnage divided by the fleet's served derived mining rate
(from the fleet read's roster fields), recomputed live as the tonnage or
kind selection changes; after commit, countdowns SHALL use the ETA frozen
on the returned action, not the client preview. The previewed duration is
presented per `figure-formatting` as a duration, with no direction affix —
a cost quoted before the run starts, not a position in time — and the
committed countdown is presented per `figure-formatting` as a relative
duration, suffixed `left`, at the mounting view's served scale; each
carries its raw span in unscaled world-milliseconds — the preview's span
being the client-side tonnage-over-rate figure this requirement already
defines, the committed countdown's being the remainder to the action's
served ETA.

#### Scenario: The preview tracks the tonnage input
- **WHEN** the tonnage input value changes
- **THEN** the previewed duration updates to the new tonnage divided by the
  fleet's served mining rate, presented per `figure-formatting` as a bare
  duration, with no direction affix

#### Scenario: The committed countdown uses the server's ETA
- **WHEN** a mine run commits successfully
- **THEN** the running countdown derives from the action's returned ETA,
  not from the pre-commit client preview, presented per `figure-formatting`
  as a relative duration suffixed `left`

### Requirement: Fleet Panel Cargo Hold Readout
The system SHALL show, for the acting (own) fleet, a cargo hold readout
derived from the fleet read's owner-only roster fields: cargo contents by
resource kind (including `fuel`, per `fleet-movement`'s "Fleet Cargo
Pool") and used versus total capacity; the readout SHALL reflect the
post-resolution cargo after a mine run resolves (via the space view's
refetch rules), without requiring navigation. Every tonnage in the readout
— per-kind tons, used capacity, and total capacity — is presented per
`figure-formatting` as a tonnage. The per-kind tons and the total capacity
each carry their own raw served value; the used capacity is derived
client-side from the fleet read's served capacity and free-hold fields
(`capacity − freeHold`) and carries its raw value, not "raw served value" —
it is computed, not itself a field the server returns. This
readout is the fleet's *cargo* hold, distinct from the *station-keeping*
hold this capability's own "Station-Keeping Hold and Release Controls"
defines — the two share the word "hold" but name unrelated concepts. WHEN
the fleet read has not yet served roster fields for the acting fleet, the
readout SHALL show `figure-formatting`'s absent form for used capacity,
total capacity, and free hold, rather than substituting zero — a fleet
whose roster has not loaded is not indistinguishable from a fleet holding
an empty hold.

#### Scenario: The hold readout shows contents and capacity
- **WHEN** the space view renders an acting fleet whose fleet read carries
  roster fields
- **THEN** the fleet panel shows cargo tons by kind and the used/total
  hold capacity, each presented per `figure-formatting`; the per-kind and
  total-capacity figures carry their own raw served value, and the used
  figure carries its own raw (client-derived) value

#### Scenario: An unloaded roster reads as absent, not an empty hold
- **WHEN** the fleet panel renders for an acting fleet whose fleet read has
  not yet served roster fields
- **THEN** the hold readout shows the `figure-formatting` absent form for
  used/total capacity and free hold, never `0 / 0 t` or `0 t free`

#### Scenario: The hold visibly fills when a mine run resolves
- **WHEN** a running mine's ETA passes and the space view's refetch lands
  the updated fleet read
- **THEN** the hold readout shows the credited cargo without a page
  navigation

### Requirement: Sell Offer on the Docked Fleet
The system SHALL offer the sell verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` **to the station the
mounting view read for the open system** — that is, whenever the fleet's
`attachedTo` is that station's board feature id, not merely whenever the
fleet is attached to some body — and the fleet's cargo pool holds at least
one kind of tonnage; anchored to the fleet's docked state, requiring no
space-view selection, mirroring *Mine Offer on the Docked Fleet*'s anchoring
rationale (a fleet can only sell what it is docked to and currently holds).
A fleet docked to an ordinary body has no station to sell to and SHALL NOT
be offered the verb: offering it would render a control whose commit has no
station to name and therefore does nothing when activated. The offer SHALL present a
resource-kind picker limited to kinds the fleet currently holds AND that
the station is configured to buy (excluding a kind with no configured floor
for the station's region, so the picker never offers a guaranteed-fail
selection), defaulting to the kind with the greatest held tonnage among
those eligible, and a tonnage input defaulting to the fleet's full held
tonnage of the selected kind, constrained to a positive value no greater
than that held tonnage, alongside a live proceeds preview computed by
folding the selected tonnage across the station's demand entries for the
selected kind (per `goods-sale`'s "Settlement Folds Tonnage Across a
Venue's Ordered Demand Entries" and per-portion rounding rule), pinned to
the exact same fold and rounding the server settlement uses via the shared
`fixtures/market/cases.json` golden — so a player is never shown a split or
a total the settlement won't honor. The held tonnage and the previewed
proceeds are presented per `figure-formatting` (tonnage as a tonnage,
proceeds as a credit figure) and each carries its raw served or computed
value.

#### Scenario: Sell is offered while docked at a station with cargo aboard
- **WHEN** the acting fleet's effective state is `docked` to a station and
  its cargo pool holds at least one kind of tonnage
- **THEN** the fleet panel offers the sell verb with a kind picker and a
  tonnage input, with no space-view selection required

#### Scenario: Sell is not offered when merely co-located, not docked
- **WHEN** the acting fleet is parked at or near a station's position but
  its effective state is not `docked` to it
- **THEN** the sell verb is not offered

#### Scenario: Sell is not offered while docked to a body that is not the station
- **WHEN** the acting fleet's effective state is `docked` to an ordinary
  body of the open system, with cargo aboard
- **THEN** the sell verb is not offered, the fleet having no station to sell
  to

#### Scenario: Sell is not offered when the cargo pool is empty
- **WHEN** the acting fleet is docked to a station but its cargo pool holds
  no tonnage of any kind
- **THEN** the sell verb is not offered

#### Scenario: Tonnage input clamps to held tonnage of the selected kind
- **WHEN** a tonnage greater than the fleet's held tonnage of the selected
  kind is entered
- **THEN** the input clamps the value to that held tonnage

#### Scenario: The proceeds preview reflects the served quote
- **WHEN** the tonnage or kind selection changes while the sell offer is
  shown
- **THEN** the previewed proceeds update to reflect the served quote for
  the newly selected kind and tonnage, presented per `figure-formatting` as
  a credit figure and carrying its raw computed value

#### Scenario: A kind with no configured floor at this station is excluded from the picker
- **WHEN** the acting fleet holds a kind for which the docked station's
  region has no configured floor price
- **THEN** that kind does not appear in the sell offer's kind picker, even
  though the fleet holds tonnage of it

#### Scenario: A split-fill preview matches the settlement fold exactly
- **WHEN** the selected tonnage exceeds the station's highest-priority open
  demand entry's remaining quantity for the selected kind
- **THEN** the preview's reported per-entry portions and total proceeds are
  the exact values the shared fixture (`fixtures/market/cases.json`) pins
  for that case, identical to what the server's settlement would apply

### Requirement: Refuel Offer on the Docked Fleet
The system SHALL offer the refuel verb on the acting fleet's panel
section, beside the sell control, whenever the acting fleet's effective
state is `docked` **to the station the mounting view read for the open
system** — that is, whenever the fleet's `attachedTo` is that station's
board feature id, not merely whenever the fleet is attached to some body —
anchored to the fleet's docked state alone, requiring no space-view
selection and no minimum held-fuel or free-hold precondition to be
*offered* (those are commit-time preconditions; see `fuel-purchase`). A
fleet docked to an ordinary body has no station to buy fuel from and SHALL
NOT be offered the verb. The offer SHALL present a tonnage
input defaulting to `min(the fleet's full free hold, the requester's
current credit balance ÷ the served fuel price)` — so the default action
is not usually an unaffordable request — constrained to a positive value
and clampable up to the fleet's full free hold, alongside a live cost
preview computed as the entered tonnage times the fuel price served on the
fleet's own read (`fleet-movement`'s "Fleet Read Serves the Configured
Fuel Price, Never Duplicated Client-Side") — never a client-maintained
copy of that constant, so the preview and the settlement's actually-
charged cost can never diverge. The default tonnage and the previewed cost
are presented per `figure-formatting` (tonnage as a tonnage, cost as a
credit figure) and each carries its raw computed value.

#### Scenario: Refuel is offered while docked at a station
- **WHEN** the acting fleet's effective state is `docked` to a station
- **THEN** the fleet panel offers the refuel verb, beside the sell verb,
  with a tonnage input and a cost preview

#### Scenario: Refuel is not offered when merely co-located, not docked
- **WHEN** the acting fleet's resolved position coincides with or lies
  near a station but its effective state is not `docked` to it
- **THEN** the refuel verb is not offered

#### Scenario: Refuel is not offered while docked to a body that is not the station
- **WHEN** the acting fleet's effective state is `docked` to an ordinary
  body of the open system
- **THEN** the refuel verb is not offered, the fleet having no station to
  buy fuel from

#### Scenario: The default tonnage is capped by affordability, not only by free hold
- **WHEN** the refuel offer is shown for a fleet whose free hold is larger
  than what the requester's current credit balance could pay for at the
  served fuel price
- **THEN** the default tonnage is the affordable amount
  (`balance ÷ price`), not the fleet's full free hold

#### Scenario: An unavailable credit balance falls the default back to free hold
- **WHEN** the refuel offer is shown while the requester's credit balance is
  unavailable (`system-space-view`'s *System Space View Route and Data
  Fan-In*)
- **THEN** the default tonnage is the fleet's full free hold, and the refuel
  verb is still offered

#### Scenario: Tonnage input clamps to the fleet's free hold
- **WHEN** a tonnage greater than the fleet's current free hold is entered
- **THEN** the input clamps the value to that free hold

#### Scenario: The cost preview reflects the server-served fuel price, not a client-maintained constant
- **WHEN** the tonnage entered changes while the refuel offer is shown
- **THEN** the previewed cost updates as tonnage times the fuel price
  served on the fleet's own read, with no per-station or per-region
  variance and no locally-stored copy of that price, presented per
  `figure-formatting` as a credit figure and carrying its raw computed
  value

### Requirement: Station-Keeping Hold and Release Controls
The system SHALL offer a station-keeping control on the acting fleet's
panel section, anchored to the fleet's own effective park mode alone
(requiring no space-view selection): while that mode is `orbit`, the
control SHALL read "Hold here" and, when invoked, submit
`POST /v1/fleets/:fleetId/hold`; while that mode is `stationkeep`, the
control SHALL read "Resume orbit" and, when invoked, submit
`POST /v1/fleets/:fleetId/release` (`fleet-movement`'s "Station-Keeping
Hold and Release Are Fleet Verbs"); while the fleet's effective state is a
burn, a drift, or a `point` park, no station-keeping control SHALL be
offered. Both submissions SHALL settle synchronously (no action, no ETA)
and SHALL, on success, refresh the fleet's read so the panel reflects the
new park mode and, while holding, the upkeep rate for the held body,
without requiring navigation. WHENEVER the fleet read serves an upkeep rate
— which is on **both** park modes with a host body (`fleet-movement`'s
"Fleet Read Serves the Station-Keeping Upkeep Rate in Fuel Tons") — the
panel SHALL show it, presented per `figure-formatting` as a rate (a
wall-clock tons-per-time-unit figure converted from the served rate field
at the mounting view's served scale — a **presentation** transform of that
served value, never a re-derivation of it) and carrying its raw served
value and its served denominator on `data-unit`, taken **only** from that
served owner-only rate field: while the mode is `stationkeep`, as the live
drain the hold is costing now; while it is `orbit`, on the "Hold here"
control itself, as what holding here **would** cost. The `orbit` case is not
optional. The rate is served on an orbiting fleet precisely so a player can
price the hold before paying for it, and rendering it only once the hold is
already open would make the served figure a value built and never called —
the sixth instance of that pattern this chain has recorded — while leaving
the one decision it exists to inform unpriced. The readout SHALL NOT be
derived on the client from the held body's served orbital elements, its
radius, or its period: that derivation is `space.StationKeepRate` — a
rule-bearing computation with a floor clamp and a non-positive-period
branch — followed by the equally rule-bearing delta-v-to-tons conversion,
and reproducing either on the client is the mirror `space-kinematics`'s
sole-authority requirement forbids; `figure-formatting`'s wall-clock unit
conversion of the served rate is not such a reproduction, since it changes
only which time unit the served number is expressed in and computes no new
rate. On the fleet's next refetch after its stored dry instant passes, the
panel SHALL reflect the server's automatic force-demotion to `orbit`
(`fleet-movement`'s "Station-Keeping Upkeep Is Settled at Discrete Events,
Never Folded Into the Stored Cargo Pool") with no client-side prediction of
the demotion. On failure — including `hold`'s rejection when the fleet's
currently held `fuel` is **at or below the configured station-keeping
reserve** (`FuelParams.StationKeepReserveTons`), which is where the
predecessor verb actually rejects, and which is *not* the same as holding
no fuel — the system SHALL show an error toast carrying the server's
distinguishable rejection reason, mapped to player-facing copy, and leave
the panel's state unchanged. That reason's mapped copy SHALL name the
**reserve** as the boundary, and SHALL NOT tell the player they have no
fuel: a fleet holding 0.4 t against a 1 t reserve is rejected by this rule,
and copy reading "no fuel" would be both false and unactionable — the
player's actual remedy is to refuel above the reserve.

#### Scenario: Holding an orbiting fleet submits hold and the panel reflects station-keep
- **WHEN** "Hold here" is invoked while the acting fleet's effective park
  mode is `orbit`
- **THEN** `POST /v1/fleets/:fleetId/hold` is submitted and, on success,
  the panel shows the fleet as station-keeping with its live drain rate

#### Scenario: Releasing a station-keeping fleet submits release and the panel reflects orbit
- **WHEN** "Resume orbit" is invoked while the acting fleet's effective
  park mode is `stationkeep`
- **THEN** `POST /v1/fleets/:fleetId/release` is submitted and, on success,
  the panel shows the fleet back in `orbit` with no drain readout

#### Scenario: No control is offered while burning, drifting, or point-parked
- **WHEN** the acting fleet's effective state is a burn, a drift, or a
  `point` park
- **THEN** no station-keeping control is offered

#### Scenario: The drain readout shows the served upkeep rate while holding
- **WHEN** the acting fleet's effective park mode is `stationkeep`
- **THEN** the panel shows a live drain readout, presented per
  `figure-formatting` as a rate, whose raw value is the fleet read's served
  upkeep-rate field

#### Scenario: The Hold control prices the hold before it is taken
- **WHEN** the acting fleet's effective park mode is `orbit` and its read
  serves an upkeep rate for its host body
- **THEN** the "Hold here" control shows that served rate, presented per
  `figure-formatting`, as what holding here would cost — before the hold is
  submitted

#### Scenario: The drain readout is never derived from orbital elements
- **WHEN** the drain readout is rendered
- **THEN** its raw value comes from the served rate field alone, passed
  through `figure-formatting`'s wall-clock unit conversion and no other
  computation
- **AND** no client-side computation of the rate from a body's radius,
  period, or orbital elements exists anywhere in the view

#### Scenario: A hold at or below the reserve is rejected and toasted, not silently accepted
- **WHEN** "Hold here" is invoked for an orbiting fleet whose held `fuel` is
  at or below the configured station-keeping reserve — including a fleet
  holding a strictly positive amount below it
- **THEN** the request is rejected, an error toast surfaces the server's
  distinguishable reason mapped to copy naming the **reserve** as the
  boundary rather than claiming the fleet has no fuel, and the panel's
  park-mode display is unchanged

#### Scenario: Reaching the dry instant is reflected only on the next refetch
- **WHEN** a station-keeping fleet's stored dry instant passes
- **THEN** the panel continues to show `stationkeep` until the fleet's next
  refetch lands the server's force-demoted `orbit` state — the client never
  predicts the demotion ahead of a read confirming it

### Requirement: Credit Balance Readout
The system SHALL show, for the requester's own corporation, a credit
balance readout on the fleet panel, sourced from the corporation's own
session data (see `corporation-spawn`'s balance-bearing session bootstrap)
and supplied to the panel by the mounting view
(`system-space-view`'s *System Space View Route and Data Fan-In*),
reflecting the post-settlement balance after a sale or a refuel resolves
via this panel's own sale-commit or refuel-commit response, without
requiring navigation, and SHALL announce a balance change to assistive
technology (an `aria-live` region or equivalent) at the moment it updates,
not solely as a visual change; the announced copy uses the same
`figure-formatting` presentation as the visual readout. When shown as a
figure, the balance is presented per `figure-formatting` as a credit
figure and carries its raw served value. IF the session balance is
unavailable, THEN the readout SHALL show an explicit unavailable
indication and SHALL NOT show a figure — never a placeholder that a
mounting view supplying no balance at all would render indistinguishably
and permanently, and never `figure-formatting`'s generic absent form in
place of this capability's own mandated unavailable indication. The readout
SHALL announce a transition between showing a balance figure and showing
the unavailable indication, in either direction, to assistive technology
via that same live region — the region SHALL NOT render as empty text when
the balance becomes unavailable.

#### Scenario: The panel shows the current credit balance
- **WHEN** the fleet panel renders for an authenticated, spawned requester
- **THEN** the requester's current credit balance is shown, presented per
  `figure-formatting` and carrying its raw served value

#### Scenario: An unavailable balance reads as unavailable, not as a figure
- **WHEN** the fleet panel renders while the corporation session balance is
  unavailable
- **THEN** the readout shows an explicit unavailable indication rather than a
  number

#### Scenario: The balance visibly updates when a sale resolves
- **WHEN** a sale settles from this panel's sell commit
- **THEN** the displayed credit balance updates to reflect the sale's
  proceeds, with no page navigation

#### Scenario: The balance visibly updates when a refuel resolves
- **WHEN** a refuel settles from this panel's refuel commit
- **THEN** the displayed credit balance updates to reflect the refuel's
  cost, with no page navigation

#### Scenario: A balance change is announced to assistive technology
- **WHEN** a sale or a refuel settles and the credit balance readout
  updates
- **THEN** the updated balance is announced via an accessible live region,
  not conveyed by a purely visual change

#### Scenario: A transition to or from an unavailable balance is announced
- **WHEN** the credit balance readout transitions between showing a figure
  and showing the unavailable indication, in either direction
- **THEN** the transition is announced via the accessible live region, not
  left as an empty announcement

#### Scenario: A failed sale's or refuel's error is announced to assistive technology
- **WHEN** a sell or refuel command fails and an error toast is shown
- **THEN** the error's player-facing copy is announced via an accessible
  live region, not conveyed by a purely visual toast

### Requirement: Sell Commit
The system SHALL, when the sell command is invoked with a chosen kind and
tonnage, submit the sale against the acting fleet's docked station; on
success it SHALL show a success toast and refresh the fleet's hold and the
requester's credit balance without requiring navigation; on failure it
SHALL show an error toast carrying player-facing copy mapped from the
server's distinguishable rejection reason and leave the offer's state
unchanged — except for a "price changed" (slippage guard) rejection, which
SHALL instead refresh the offer to the server's current applicable price(s)
and proceeds total, showing that refreshed figure alongside the one the
player originally expected — each presented per `figure-formatting` as a
credit figure, in its own element carrying its own raw value, never
combined into a single interpolated string — so the player can accept or
abandon the new price from inside the flow without re-navigating;
re-committing after such a refresh SHALL use a newly generated operation
key (a re-priced sale is a new intent, never a retry of the old one).

#### Scenario: A successful sale refreshes hold and balance
- **WHEN** the sell command succeeds
- **THEN** a success toast is shown, and the fleet's hold readout and the
  requester's credit balance both reflect the sale's effect without a page
  navigation

#### Scenario: A failed sale toasts player-facing copy, not raw server text
- **WHEN** the sell command fails (for example: over-held tonnage, no
  configured floor for the kind, or a budget/absorption limit)
- **THEN** an error toast surfaces player-facing, actionable copy mapped
  from the server's distinguishable rejection reason (never the raw
  sentinel-error string verbatim), and the offer remains available for
  retry

#### Scenario: A price-changed rejection refreshes the offer instead of freezing it
- **WHEN** the sell command fails with the "price changed" slippage
  rejection
- **THEN** the offer refreshes to the server's current applicable price(s)
  and total proceeds, displaying that figure alongside the player's
  originally expected one — each presented per `figure-formatting` as a
  credit figure in its own element with its own raw value — rather than
  leaving the stale pre-rejection offer on screen

#### Scenario: Re-committing a re-priced sale uses a new operation key
- **WHEN** a player re-commits a sale after a price-changed refresh
- **THEN** the re-commit is submitted with a newly generated operation key,
  distinct from the original attempt's key

# docked-fleet-actions Specification

## Purpose
The fleet command panel: everything the acting fleet can be commanded to do
from its own served state, with no scene and no selection. Mine the body it is
docked to (`mine-extraction`), sell its hold into the open station's demand
(`goods-sale`, `market-price-board`), buy fuel (`fuel-purchase`), and hold or
release station-keeping (`fleet-movement`) — together with the readouts those
verbs move: the cargo hold, and the corporation's credit balance
(`corporation-credits`). It is mounted beside `system-space-view`, which owns
everything that needs the canvas; the split is drawn at exactly that line, so
every verb here remains usable while the renderer is unavailable.

**The name under-describes this capability**, stated here so it is not
re-litigated by surprise (`build-production-space-view` design.md Decision 13).
Three of its members are neither "docked" nor a "fleet action":

- The **station-keeping hold and release controls act on an orbiting fleet.**
  Docking is irrelevant to a station-keep park; these controls are offered
  against a fleet's park state, not its attachment.
- The **credit balance readout is corporation-scoped**, not fleet-scoped. It
  reads the requester's corporation and moves when any of that corporation's
  activity settles, not only this fleet's.
- *Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text* is a
  **shared module three capabilities consume** — this one, `system-space-view`'s
  burn and jump commands, and `galaxy-view`'s *Jump Commit*. A reason string
  added or reworded here changes copy on two other screens, so it is edited as
  a shared contract, never as this panel's private table.

What this capability really is, is the fleet command panel; the name is fixed
by ruling, and the shape is the one above.
## Requirements
### Requirement: Mine Offer on the Docked Fleet
The system SHALL offer the mine verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a feature
carrying at least one visible resource AND the fleet's movement channel is
free (no running mine, not burning) — anchored to the fleet's docked
state, requiring no space-view selection: a fleet can only mine what it is
docked to, so selecting the body underneath it (which its own glyph
occludes) is never a precondition. The offer SHALL present a resource-kind
picker limited to the docked feature's visible resource kinds, defaulting
to the richest, and a tonnage input defaulting to the fleet's free hold
and constrained to a positive value no greater than the free hold.

#### Scenario: Mine is offered while docked at a resource-bearing body
- **WHEN** the acting fleet's effective state is `docked` to a feature
  carrying visible resources
- **THEN** the fleet panel offers the mine verb with a kind picker and a
  tonnage input defaulted to the fleet's free hold, with no space-view
  selection required

#### Scenario: Mine is not offered when merely co-located, not docked
- **WHEN** the acting fleet is parked at or near a resource feature's
  position but its effective state is not `docked` to it
- **THEN** the mine verb is not offered

#### Scenario: Mine is not offered when the docked body has no visible resources
- **WHEN** the acting fleet is docked to a feature that carries no visible
  resources
- **THEN** the mine verb is not offered

#### Scenario: Tonnage input clamps to free hold
- **WHEN** a tonnage greater than the fleet's free hold is entered
- **THEN** the input clamps the value to the free hold

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

### Requirement: Mine Commit
The system SHALL, when the mine command is invoked with a chosen kind and
tonnage, submit the mine order against the acting fleet's docked feature;
on success it SHALL show a success toast and arm the ETA refetch; on
failure it SHALL show an error toast carrying the server's distinguishable
rejection reason and leave the offer's state unchanged.

#### Scenario: A successful mine commit arms the countdown
- **WHEN** the mine command succeeds
- **THEN** a success toast is shown and a refetch is armed for the run's
  ETA

#### Scenario: A failed mine commit toasts the reason
- **WHEN** the mine command fails (for example: over free hold, depleted
  lode, busy movement slot)
- **THEN** an error toast surfaces the server's rejection reason and the
  offer remains available

### Requirement: Mine Control Guards Against Double-Submit
The mine control SHALL be disabled from the moment of commit until the
request settles or fails, so a double-click or repeated-Enter cannot submit
two mine runs. The guard SHALL take effect synchronously, within the same
invocation that submits the request, and SHALL NOT depend on a state flip
that only reaches the control's `disabled` attribute on a later render: two
activations a tick apart both reach the handler before any re-render, so a
render-dependent guard does not exist at the moment it is needed.

#### Scenario: A double-click yields exactly one mine run
- **WHEN** the mine control is double-clicked in rapid succession
- **THEN** exactly one mine request is submitted

#### Scenario: Two activations in one tick submit one mine run
- **GIVEN** the mine control is rendered enabled and committable
- **WHEN** two activations reach the mine handler within the same tick, with
  no render cycle and no awaited step between them
- **THEN** exactly one mine request leaves the client
- **AND** the guard holds even though the control's `disabled` attribute has
  not yet been updated by a render

#### Scenario: A fresh attempt after a settled mine commit is a second run
- **WHEN** a mine commit settles or fails and the player then initiates a new
  mine command
- **THEN** the guard has been released and the new attempt submits normally

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

### Requirement: Sell Commit
The system SHALL, when the sell command is invoked with a chosen kind and
tonnage, submit the sale against the acting fleet's docked station; on
success it SHALL show a success toast, and the fleet's hold and the
requester's credit balance SHALL both reflect the sale's effect without
requiring navigation — on the strip's hold and credits cells
(`system-console`) that render them, this panel no longer carrying either
readout; on failure it SHALL show an error toast carrying player-facing copy
mapped from the server's distinguishable rejection reason and leave the
offer's state unchanged — except for a "price changed" (slippage guard)
rejection, which SHALL instead refresh the offer to the server's current
applicable price(s) and proceeds total, showing that refreshed figure
alongside the one the player originally expected — each presented per
`figure-formatting` as a credit figure, in its own element carrying its own
raw value, never combined into a single interpolated string — so the player
can accept or abandon the new price from inside the flow without
re-navigating; re-committing after such a refresh SHALL use a newly
generated operation key (a re-priced sale is a new intent, never a retry of
the old one).

#### Scenario: A successful sale refreshes hold and balance
- **WHEN** the sell command succeeds
- **THEN** a success toast is shown, and the strip's hold cell and credits
  cell (`system-console`) both reflect the sale's effect without a page
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

### Requirement: Sell Control Guards Against Double-Submit
The sell control SHALL be disabled from the moment of commit until the
request settles or fails, so a double-click or repeated-Enter cannot
submit two sales. The guard SHALL take effect synchronously, within the
same invocation that submits the request — **before any operation key is
minted** — and SHALL NOT depend on a state flip that only reaches the
control's `disabled` attribute on a later render: two activations a tick
apart both reach the handler before any re-render, so a render-dependent
guard does not exist at the moment it is needed, and a second activation
that mints its own key defeats server-side idempotency-by-key structurally
rather than merely racing it. This sentence is added because the weaker
form was not enough: `commitSell` was written against "disabled from the
moment of commit" and read `disabled={!committable}` as satisfying it,
which is exactly how the confirmed double-charge defect shipped. Exactly
one operation key SHALL be generated per
user-initiated sell attempt; that same key SHALL be reused across
transport-level retries of that one attempt (so a network retry dedups
against the original), while a freshly initiated or re-priced sell attempt
SHALL always generate a new key.

#### Scenario: A double-click yields exactly one sale
- **WHEN** the sell control is double-clicked in rapid succession
- **THEN** exactly one sale request is submitted, using one operation key

#### Scenario: A transport-level retry of the same attempt yields exactly one sale
- **WHEN** the sell command's request is retried at the transport layer
  after a lost response, without the player initiating a new attempt
- **THEN** the retry reuses the same operation key as the original attempt,
  and the settlement remains a single sale

#### Scenario: A fresh attempt after a completed sale is a second, independent sale
- **WHEN** a player completes one sale and then initiates a new sell
  command
- **THEN** the new attempt generates a new operation key, distinct from the
  completed sale's key

#### Scenario: Two activations in one tick submit one sale and mint one key
- **GIVEN** the sell control is rendered enabled and committable
- **WHEN** two activations reach the sell handler within the same tick, with
  no render cycle and no awaited step between them
- **THEN** exactly one sell request leaves the client, carrying exactly one
  operation key
- **AND** the second activation mints no operation key and issues no request
- **AND** the guard holds even though the control's `disabled` attribute has
  not yet been updated by a render

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

### Requirement: Refuel Commit
The system SHALL, when the refuel command is invoked with a chosen
tonnage, submit the refuel against the acting fleet's docked station; on
success it SHALL show a success toast, and the fleet's hold, its estimated
range, and the requester's credit balance SHALL all reflect the refuel's
effect without requiring navigation — the estimated range on the fleet
roster row (unchanged) and the strip's fuel cell, and the hold and the
balance on the strip's hold and credits cells (`system-console`), this panel
no longer carrying either readout; on failure — including a rejection
because the requested tonnage's cost exceeds the requester's credit balance,
since a refuel never partially fills (`fuel-purchase`'s "Refuel Is
All-Or-Nothing, Never Partially Filled") — it SHALL show an error toast
carrying player-facing copy mapped from the server's distinguishable
rejection reason and leave the offer's state unchanged. Unlike the sell
command, a refuel rejection carries no price-changed slippage refresh,
because the fuel price is a single global constant that never moves between
the offer's preview and its commit.

#### Scenario: A successful refuel refreshes hold, range, and balance
- **WHEN** the refuel command succeeds
- **THEN** a success toast is shown, and the fleet's estimated range on the
  roster row, and the strip's hold cell and credits cell (`system-console`),
  all reflect the refuel's effect without a page navigation

#### Scenario: An unaffordable refuel is rejected in full, never partially filled
- **WHEN** the refuel command's requested tonnage would cost more than the
  requester's current credit balance
- **THEN** the refuel is rejected in full — no partial tonnage is
  credited, no partial credits are debited — and an error toast surfaces
  player-facing copy

#### Scenario: A failed refuel toasts player-facing copy, not raw server text
- **WHEN** the refuel command fails for any reason
- **THEN** an error toast surfaces player-facing, actionable copy mapped
  from the server's distinguishable rejection reason, never the raw
  sentinel-error string verbatim

### Requirement: Refuel Control Guards Against Double-Submit
The refuel control SHALL be disabled from the moment of commit until the
request settles or fails, so a double-click or repeated-Enter cannot
submit two refuels — mirroring the sell control's identical guard for the
game's second credit-mutating route. The guard SHALL take effect
synchronously, within the same invocation that submits the request —
**before any operation key is minted** — and SHALL NOT depend on a state
flip that only reaches the control's `disabled` attribute on a later
render. Exactly one operation key SHALL be
generated per user-initiated refuel attempt; that same key SHALL be reused
across transport-level retries of that one attempt (so a network retry
dedups against the original, per `fuel-purchase`'s "Idempotent By
Operation Key"), while a freshly initiated refuel attempt SHALL always
generate a new key — unlike the sell control, a refuel attempt is never
re-priced between preview and commit, since the fuel price is a single
global constant that never moves.

#### Scenario: A double-click yields exactly one refuel
- **WHEN** the refuel control is double-clicked in rapid succession
- **THEN** exactly one refuel request is submitted, using one operation key

#### Scenario: A transport-level retry of the same attempt yields exactly one refuel
- **WHEN** the refuel command's request is retried at the transport layer
  after a lost response, without the player initiating a new attempt
- **THEN** the retry reuses the same operation key as the original attempt,
  and the settlement remains a single refuel

#### Scenario: A fresh attempt after a completed refuel is a second, independent refuel
- **WHEN** a player completes one refuel and then initiates a new refuel
  command
- **THEN** the new attempt generates a new operation key, distinct from the
  completed refuel's key

#### Scenario: Two activations in one tick submit one refuel and mint one key
- **GIVEN** the refuel control is rendered enabled and committable
- **WHEN** two activations reach the refuel handler within the same tick,
  with no render cycle and no awaited step between them
- **THEN** exactly one refuel request leaves the client, carrying exactly
  one operation key
- **AND** the second activation mints no operation key and issues no request
- **AND** the guard holds even though the control's `disabled` attribute has
  not yet been updated by a render

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

### Requirement: Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text
Every server-distinguishable rejection reason returned by this
capability's mine, sell, refuel, station-keeping hold, and release
endpoints, and by `system-space-view`'s burn and jump commands
(*Jump Commit*, *Burn Command Targets Any Selected Body, Lane Gate, or
Point Uniformly*) — including each endpoint's own `400`/`404`/`409`
reasons, the contention-retry "busy, try again" rejection, AND the
per-corporation write quota's `429` (`request-authorization`'s
"Per-Corporation Write Quota on Player-Initiated Trade Routes," which
applies to sell and refuel, the two routes that append a trade-ledger
entry) — SHALL be mapped to player-facing, actionable copy before display;
the server's raw reason string SHALL be treated as an internal contract
for distinguishing outcomes, never displayed to the player verbatim.

#### Scenario: A distinguishable server reason renders as player-facing copy
- **WHEN** a fleet-panel or space-view mutation fails with any of these
  capabilities' distinguishable server reasons
- **THEN** the displayed error text is mapped, player-facing copy, never
  the raw server reason string rendered verbatim

#### Scenario: An unmapped reason still renders safely
- **WHEN** a server rejection reason has no specific mapped copy (e.g. a
  reason added later without an accompanying copy update)
- **THEN** a generic, non-technical fallback message is shown rather than
  the raw server string

### Requirement: Running Mine Gates the Fleet Panel's Commands
The system SHALL, while the acting fleet has a running mine action whose
ETA has not yet passed, disable that fleet's burn, cut-drive, stop, and jump
commands **wherever the mounting view offers them** — on the system space
view that is `system-space-view`'s command panel (burn and jump) and this
capability's own fleet panel (cut drive and stop), the roster rendering no
commands there at all (`fleet-roster`'s "The Roster Row Is the Fleet Command
Surface Where the Mounting View Provides None, Jump Gated by Attachment
Alone"; `system-space-view`'s *Jump Commit*) — and show a countdown to the
run's ETA; and a cancel-mine control SHALL be offered that cancels the run
via the generic action cancel endpoint, leaving the fleet's kinematic state
and attachment untouched. Once the ETA passes, the gating SHALL lift without
requiring navigation.

#### Scenario: Burn, cut-drive, stop, and jump are disabled while a mine is running
- **WHEN** the acting fleet has a running mine whose ETA is in the future
- **THEN** every control the mounting view offers for that fleet's burn,
  cut-drive, stop, and jump commands is unavailable and a countdown to the
  mine's ETA is shown

#### Scenario: A running mine can be cancelled
- **WHEN** the cancel-mine control is invoked during a running mine
- **THEN** the cancellation is submitted through the generic action cancel
  endpoint, the movement channel frees on success, and the fleet's
  kinematic state and attachment are left untouched

### Requirement: A Failed Command Is Announced to Assistive Technology
The system SHALL announce a failed sell or refuel command's error to
assistive technology via an accessible live region, not conveyed by a
purely visual toast alone.

#### Scenario: A failed sale's or refuel's error is announced to assistive technology
- **WHEN** a sell or refuel command fails and an error toast is shown
- **THEN** the error's player-facing copy is announced via an accessible
  live region, not conveyed by a purely visual toast

### Requirement: A Served Burn Solve Refusal Reads as Player-Facing Copy on Commit and on Every Stop Surface
The system SHALL display each burn solve refusal served by `fleet-movement` as mapped player-facing copy on the burn commit and on every surface that presents a stop-in-place refusal (the fleet actions panel's Stop and the galaxy fleet roster's Stop), never as the raw server reason, with the same line for the same reason on every surface. The lines SHALL be exactly:
- origin inside the star clearance: "This fleet is too close to the star to take a course from here right now."
- destination inside the star clearance: "That destination is too close to the star to fly to." (the existing line, unchanged)
- minimum arc: "That burn is too short to fly. Choose a target farther away."
- target body absent from the system: "That body is not in this system. Pick another target."

Showing a refusal in the burn preview's no-quote state is not covered by this requirement.

#### Scenario: A stop refused for the clearance shows the same line a burn refused for it shows
- **WHEN** stop-in-place is refused with the origin reason from the fleet actions panel, from the galaxy fleet roster, and a burn commit is refused with the origin reason
- **THEN** each displays the origin line above verbatim and none displays the raw reason string

#### Scenario: Each of the four refusals displays its own line
- **WHEN** the four refusal reasons are displayed in turn on a burn commit
- **THEN** the four lines above are shown verbatim, pairwise different, none of them the generic failure line and none the line for an absent fleet or destination

#### Scenario: A stop refused on the galaxy roster does not toast the raw reason
- **WHEN** stop-in-place is refused with the destination reason from the galaxy fleet roster
- **THEN** the toast shows the destination line and does not contain `fleet:` or the raw reason text


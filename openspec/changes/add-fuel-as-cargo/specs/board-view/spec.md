## MODIFIED Requirements

### Requirement: Credit Balance Readout
The system SHALL show, for the requester's own corporation, a credit
balance readout on the board, sourced from the corporation's own session
data (see `corporation-spawn`'s balance-bearing session bootstrap),
reflecting the post-settlement balance after a sale or a refuel resolves
via the board's own sale-commit or refuel-commit response, without
requiring navigation, and SHALL announce a balance change to assistive
technology (an `aria-live` region or equivalent) at the moment it updates,
not solely as a visual change.

#### Scenario: The board shows the current credit balance
- **WHEN** the board renders for an authenticated, spawned requester
- **THEN** the requester's current credit balance is shown

#### Scenario: The balance visibly updates when a sale resolves
- **WHEN** a sale settles from the board's sell commit
- **THEN** the displayed credit balance updates to reflect the sale's
  proceeds, with no page navigation

#### Scenario: A balance change is announced to assistive technology
- **WHEN** a sale settles and the credit balance readout updates
- **THEN** the updated balance is announced via an accessible live region,
  not conveyed by a purely visual change

#### Scenario: A failed sale's error is announced to assistive technology
- **WHEN** a sell command fails and an error toast is shown
- **THEN** the error's player-facing copy is announced via an accessible
  live region, not conveyed by a purely visual toast

#### Scenario: The balance visibly updates when a refuel resolves
- **WHEN** a refuel settles from the board's refuel commit
- **THEN** the displayed credit balance updates to reflect the refuel's
  cost, with no page navigation

#### Scenario: A refuel's balance change is announced to assistive technology
- **WHEN** a refuel settles and the credit balance readout updates
- **THEN** the updated balance is announced via an accessible live region,
  not conveyed by a purely visual change

## ADDED Requirements

### Requirement: Refuel Offer on the Docked Fleet
The system SHALL offer the refuel verb on the acting fleet's panel
section, beside the existing sell control, whenever the acting fleet's
effective state is `docked` to a station — anchored to the fleet's docked
state alone, requiring no board selection and no minimum held-fuel or
free-hold precondition to be *offered* (those are commit-time
preconditions; see `fuel-purchase`). The offer SHALL present a tonnage
input defaulting to `min(the fleet's full free hold, the requester's
current credit balance ÷ the served fuel price)` — so the default action
is not usually an unaffordable request — constrained to a positive value
and clampable up to the fleet's full free hold, alongside a live cost
preview computed as the entered tonnage times the fuel price served on the
fleet's own read (`fleet-movement`'s "Fleet Read Serves the Configured
Fuel Price, Never Duplicated Client-Side") — never a client-maintained
copy of that constant, so the preview and the settlement's actually-
charged cost can never diverge. This is a simple multiplication needing no
venue fold and no shared fixture golden, unlike the sell offer's price
preview, but it is sourced from one server-served value rather than any
value the client computes or stores independently.

#### Scenario: Refuel is offered while docked at a station
- **WHEN** the acting fleet's effective state is `docked` to a station
- **THEN** the fleet panel offers the refuel verb, beside the sell verb,
  with a tonnage input and a cost preview

#### Scenario: Refuel is not offered when merely co-located, not docked
- **WHEN** the acting fleet's resolved position coincides with or lies
  near a station but its effective state is not `docked` to it
- **THEN** the refuel verb is not offered

#### Scenario: The default tonnage is capped by affordability, not only by free hold
- **WHEN** the refuel offer is shown for a fleet whose free hold is larger
  than what the requester's current credit balance could pay for at the
  served fuel price
- **THEN** the default tonnage is the affordable amount
  (`balance ÷ price`), not the fleet's full free hold

#### Scenario: Tonnage input clamps to the fleet's free hold
- **WHEN** a tonnage greater than the fleet's current free hold is entered
- **THEN** the input clamps the value to that free hold

#### Scenario: The cost preview reflects the server-served fuel price, not a client-maintained constant
- **WHEN** the tonnage entered changes while the refuel offer is shown
- **THEN** the previewed cost updates as tonnage times the fuel price
  served on the fleet's own read, with no per-station or per-region
  variance and no locally-stored copy of that price

### Requirement: Refuel Commit
The system SHALL, when the refuel command is invoked with a chosen
tonnage, submit the refuel against the acting fleet's docked station; on
success it SHALL show a success toast and refresh the fleet's hold, its
estimated range, and the requester's credit balance without requiring
navigation; on failure — including a rejection because the requested
tonnage's cost exceeds the requester's credit balance, since a refuel
never partially fills (`fuel-purchase`'s "Refuel Is All-Or-Nothing, Never
Partially Filled") — it SHALL show an error toast carrying player-facing
copy mapped from the server's distinguishable rejection reason and leave
the offer's state unchanged. Unlike the sell command, a refuel rejection
carries no price-changed slippage refresh, because the fuel price is a
single global constant that never moves between the offer's preview and
its commit.

#### Scenario: A successful refuel refreshes hold, range, and balance
- **WHEN** the refuel command succeeds
- **THEN** a success toast is shown, and the fleet's hold readout, its
  estimated range, and the requester's credit balance all reflect the
  refuel's effect without a page navigation

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

## ADDED Requirements

### Requirement: Sell Offer on the Docked Fleet
The system SHALL offer the sell verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a station and
the fleet's cargo pool holds at least one kind of tonnage — anchored to the
fleet's docked state, requiring no board selection, mirroring `### Requirement:
Mine Offer on the Docked Fleet`'s anchoring rationale (a fleet can only
sell what it is docked to and currently holds). The offer SHALL present a
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
`fixtures/market/cases.json` golden (design.md Decision 22) — so a player
is never shown a split or a total the settlement won't honor.

#### Scenario: Sell is offered while docked at a station with cargo aboard
- **WHEN** the acting fleet's effective state is `docked` to a station and
  its cargo pool holds at least one kind of tonnage
- **THEN** the fleet panel offers the sell verb with a kind picker and a
  tonnage input, with no board selection required

#### Scenario: Sell is not offered when merely co-located, not docked
- **WHEN** the acting fleet occupies the same hex as a station but its
  effective state is not `docked`
- **THEN** the sell verb is not offered

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
  the newly selected kind and tonnage

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
success it SHALL show a success toast and refresh the fleet's hold and the
requester's credit balance without requiring navigation; on failure it
SHALL show an error toast carrying player-facing copy mapped from the
server's distinguishable rejection reason and leave the offer's state
unchanged — except for a "price changed" (slippage guard) rejection, which
SHALL instead refresh the offer to the server's current applicable price(s)
and proceeds total, showing that refreshed figure alongside the one the
player originally expected, so the player can accept or abandon the new
price from inside the flow without re-navigating; re-committing after such
a refresh SHALL use a newly generated operation key (a re-priced sale is a
new intent, never a retry of the old one).

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
  originally expected one, rather than leaving the stale pre-rejection
  offer on screen

#### Scenario: Re-committing a re-priced sale uses a new operation key
- **WHEN** a player re-commits a sale after a price-changed refresh
- **THEN** the re-commit is submitted with a newly generated operation key,
  distinct from the original attempt's key

### Requirement: Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text
Every server-distinguishable rejection reason the sell endpoint can return
— including this capability's own `400`/`404`/`409` reasons, the
contention-retry "busy, try again" rejection, AND the per-corporation
write-quota's `429` (`request-authorization`'s "Per-Corporation Write
Quota on Player-Initiated Trade Routes") — SHALL be mapped to player-facing,
actionable copy before display; the server's raw reason string SHALL be
treated as an internal contract for distinguishing outcomes, never
displayed to the player verbatim. This corrects the current, observable
pattern (`SystemBoardView.tsx`'s `toast.error(e.message || 'Order
failed')`, used in five places today) of surfacing a raw Go sentinel-error
string (e.g. `"mine: requester does not own this fleet"`) directly to the
player.

#### Scenario: A distinguishable server reason renders as player-facing copy
- **WHEN** a market mutation fails with any of this capability's
  distinguishable server reasons
- **THEN** the displayed error text is mapped, player-facing copy, never
  the raw server reason string rendered verbatim

#### Scenario: An unmapped reason still renders safely
- **WHEN** a server rejection reason has no specific mapped copy (e.g. a
  reason added later without an accompanying copy update)
- **THEN** a generic, non-technical fallback message is shown rather than
  the raw server string

### Requirement: Sell Control Guards Against Double-Submit
The sell control SHALL be disabled from the moment of commit until the
request settles or fails, so a double-click or repeated-Enter cannot
submit two sales. Exactly one operation key SHALL be generated per
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

### Requirement: Credit Balance Readout
The system SHALL show, for the requester's own corporation, a credit
balance readout on the board, sourced from the corporation's own session
data (see `corporation-spawn`'s balance-bearing session bootstrap),
reflecting the post-settlement balance after a sale resolves via the
board's own sale-commit response, without requiring navigation, and
SHALL announce a balance change to assistive technology (an `aria-live`
region or equivalent) at the moment it updates, not solely as a visual
change.

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

## MODIFIED Requirements

### Requirement: Ranked Quote List By Kind
For a chosen resource kind, the panel SHALL list every visible station's
single best demand entry for that kind (per `market-price-board`'s uniform,
price-ordered demand-entry list — now spanning NPC-sourced entries, the
floor and open requests, and corporation-sourced entries, open player-posted
listings, alike), ordered best-price-first, visually distinguishing a
premium-request entry, a player-listing entry, and the floor (last-resort)
entry from one another by more than color alone (e.g., an icon or text label
in addition to any color cue, per `frontend/CLAUDE.md`'s color-system
convention), and showing a request's or player listing's remaining
quantity. This remains **one row per visible station** — the station's
single best entry, not an enumeration of every standing entry there; a
station carrying more than one open entry for the chosen kind still
contributes exactly one row, so the list stays bounded by the number of
visible stations regardless of book depth at any one of them.

#### Scenario: Selecting a kind renders stations ordered best-first
- **WHEN** a resource kind is chosen
- **THEN** the panel lists every visible station's single best demand
  entry for that kind, ordered from best to worst

#### Scenario: A request row is visually distinct and shows remaining quantity
- **WHEN** a station's best entry for the chosen kind is an open request
- **THEN** its row is distinguished from a floor row or a player-listing
  row by more than color alone, and shows the request's remaining quantity

#### Scenario: A player-listing row is visually distinct and shows remaining quantity
- **WHEN** a station's best entry for the chosen kind is an open
  player-posted listing
- **THEN** its row is distinguished from a floor row or a request row by
  more than color alone, and shows the listing's remaining quantity

#### Scenario: A station with no request or player listing shows only its floor
- **WHEN** a visible station's only open entry for the chosen kind is its
  floor
- **THEN** its row shows only the floor (last-resort) entry's price

#### Scenario: A station with several open entries still contributes exactly one row
- **WHEN** a visible station carries both an open request and an open
  player-posted listing for the chosen kind
- **THEN** the list still shows exactly one row for that station — its
  single best-priced entry — not one row per entry

## ADDED Requirements

### Requirement: Post Buy Listing From Anywhere, Fee and Escrow Previewed
The panel SHALL offer posting a buy listing against any visible station's
venue regardless of the player's own fleet's location — buy-side escrow is a
credit lock, not a physical delivery, so no docked fleet is required — with a
kind picker, a quantity input, and a unit-price input, previewing the
computed listing fee and the credits that will be locked before commit.

#### Scenario: A buy listing can be posted against a remote station with no fleet present
- **WHEN** a player composes a buy listing against a visible station they
  have no fleet docked at
- **THEN** the panel accepts the composition and previews the fee and the
  credits to be locked

#### Scenario: The preview updates as inputs change
- **WHEN** the chosen kind, quantity, or unit price changes while composing
  a buy listing
- **THEN** the previewed fee and locked-credits figures update to match

### Requirement: Buy Listing Commit
The system SHALL, when the post-buy-listing command is invoked, submit the
listing; on success it SHALL show a success toast and refresh the panel's
book and the requester's credit balance without requiring navigation; on
failure it SHALL show an error toast carrying player-facing copy mapped
from the server's distinguishable rejection reason (mirroring `hex-board-
view`'s "Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text"
— never the raw sentinel-error string verbatim) and leave the composed
form's inputs unchanged.

#### Scenario: A successful post refreshes the book and balance
- **WHEN** the post-buy-listing command succeeds
- **THEN** a success toast is shown, and the panel's book and the
  requester's credit balance both reflect the new listing without a page
  navigation

#### Scenario: A failed post toasts player-facing copy, not the raw server reason
- **WHEN** the post-buy-listing command fails (for example: insufficient
  available credits, or an invalid quantity or price)
- **THEN** an error toast surfaces player-facing copy mapped from the
  server's distinguishable rejection reason — never the raw sentinel-error
  string verbatim — and the composed form remains available for retry

### Requirement: Buy Against an Open Sell Listing, Limit Price Required
The panel SHALL offer a "buy" action on any visible open sell-listing row,
composing a marketable buy order (`market-settlement`'s "Marketable Buy
Order Fills Against Resting Sell Listings, Limit-Priced") against that
venue/kind, with a quantity input and a **required** limit-price input
(pre-filled from the clicked listing's price, editable upward to allow
walking past it into the next-cheapest listing, but never silently omitted)
— requiring no docked fleet.

#### Scenario: Clicking buy on a sell-listing row pre-fills a limit price
- **WHEN** a player clicks "buy" on an open sell-listing row
- **THEN** the buy composer opens with that listing's price pre-filled as
  the limit price, editable

#### Scenario: Submission is blocked without a limit price
- **WHEN** a player clears the limit-price field and attempts to submit
- **THEN** submission is blocked client-side, never sent with an omitted
  limit price

### Requirement: Buy Commit
The system SHALL, when the buy command is invoked with a quantity and a
limit price, submit the marketable buy order; on success it SHALL show a
success toast and refresh the panel's book, the requester's credit balance,
and the requester's storage readout without requiring navigation; on
failure it SHALL show an error toast carrying player-facing copy mapped
from the server's distinguishable rejection reason (never the raw
sentinel-error string verbatim) and leave the composed form's state
unchanged.

#### Scenario: A successful buy refreshes book, balance, and storage
- **WHEN** the buy command succeeds
- **THEN** a success toast is shown, and the panel's book, the requester's
  credit balance, and the requester's storage readout all reflect the
  fill, without a page navigation

#### Scenario: A failed buy toasts player-facing copy, not the raw server reason
- **WHEN** the buy command fails (for example: insufficient available
  credits, insufficient sell-side liquidity within the limit price, or a
  venue no longer visible)
- **THEN** an error toast surfaces player-facing copy, never the raw
  sentinel-error string verbatim, and the composed form remains available
  for retry

### Requirement: My Listings Section, Sourced From the Owner's Own-Listings Read
The panel SHALL show a "my listings" section, populated from
`market-listings`'s "Owner's Own-Listings Read, Including Recently
Terminal" — never inferred from the general, fog-gated book/ranked-quote
read, which discloses no ownership information at all — listing every open
listing the requester's own corporation currently holds across every venue,
each carrying a cancel action. Because this read is owner-scoped by
construction, every listing it contains is, by definition, the requester's
own — the panel never needs to guess or mark ownership on a foreign
listing, and never renders a cancel action on one, since a foreign listing
never appears in this read at all.

#### Scenario: My listings shows every open listing the requester holds, across venues
- **WHEN** the requester's corporation has open listings at more than one
  venue
- **THEN** the section lists all of them, each with a cancel action

#### Scenario: A foreign corporation's listings never appear, so no cancel action is ever misrouted
- **WHEN** the panel renders the "my listings" section
- **THEN** every entry shown belongs to the requester's own corporation —
  there is structurally no path by which another corporation's listing
  could appear here or offer a cancel action

### Requirement: Terminal Listing Status Surfaced To Its Owner
The "my listings" section SHALL, for a configured retention window after
transition, continue to show a listing that has become `filled`,
`cancelled`, or `expired`, visually distinguished from an open listing and
from each other, with player-facing copy explaining what happened (settled
— proceeds landed in your balance; cancelled by you — the reservation was
released; expired unfilled — the reservation was released, and the listing
fee was not refunded), refreshed on the panel's existing polling cadence —
so a listing that expires while the player is away is not silently absent
from the board with no explanation for the spent fee and the now-idle
reservation.

#### Scenario: An expired listing is shown with an explanation, not silently removed
- **WHEN** one of the requester's own listings expires unfilled between two
  of the panel's refresh cycles
- **THEN** after the next refresh it still appears in "my listings",
  marked `expired`, with copy explaining the reservation was released and
  the fee was not refunded

#### Scenario: A filled listing is shown as settled
- **WHEN** one of the requester's own listings is fully filled
- **THEN** it appears in "my listings" marked `filled`, with copy
  explaining the proceeds (or delivered goods) have landed

#### Scenario: A cancelled listing is shown as cancelled by the requester's own action
- **WHEN** the requester cancels their own listing
- **THEN** it appears in "my listings" marked `cancelled`, distinguishable
  from `expired`

#### Scenario: A terminal listing beyond the retention window no longer appears
- **WHEN** a listing transitioned to a terminal state longer ago than the
  configured retention window
- **THEN** it no longer appears in "my listings"

### Requirement: Cancel Own Listing From the Panel
The panel SHALL offer a cancel action on any open listing shown in "my
listings" (see "My Listings Section, Sourced From the Owner's Own-Listings
Read"), from either mount point, requiring no fleet presence; on success it
SHALL refresh "my listings" and the requester's credit balance or storage
without requiring navigation; on failure it SHALL show an error toast
carrying player-facing copy mapped from the server's distinguishable
rejection reason (never the raw sentinel-error string verbatim).

#### Scenario: The owner cancels their own open listing from the panel
- **WHEN** the requester cancels one of their own open listings from "my
  listings"
- **THEN** the listing's status updates to `cancelled` in "my listings",
  and the requester's balance or storage reflects the released reservation,
  without navigation

#### Scenario: A failed cancel toasts player-facing copy, not the raw server reason
- **WHEN** a cancel fails (for example: the listing already filled or
  expired concurrently)
- **THEN** an error toast surfaces player-facing copy, never the raw
  sentinel-error string verbatim

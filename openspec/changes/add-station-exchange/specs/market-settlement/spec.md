## ADDED Requirements

### Requirement: Item-Type Handler Seam — Co-Location, Consume, and Deliver, Registered Per Type
The system SHALL consult, for every fill, a handler registered for the fill's
`itemType` (mirroring `action-dispatch`'s per-type resolver registration) to
answer exactly three questions at match time, all within the same settlement
transaction as every other effect of that fill — never a step invoked
outside it, and never left to a separate, later write: whether the two sides
may settle at this venue (`MaySettleHere`, a positional/co-location
precondition); how the resting (filled) side's reservation is permanently
consumed (`Consume` — see "A Fill Consumes the Resting Sell Listing's
Escrowed Reservation"); and how the filled quantity is delivered to the buy
side (`Deliver`). This is the match-time half of the five-operation handler
interface `market-listings` and `market-settlement` together define
(`Reserve` and `Release` are the post-time and cancel/expiry-time halves,
invoked by `market-listings` — see its "Post Reserves the Posting Side's
Resource Before the Listing Exists" and "Cancel Releases the Reservation,
Never Twice"). A fill for an `itemType` with no registered handler SHALL be
rejected outright.

*(Note: earlier drafts of this requirement additionally asserted "the core
names no `tons`/`stationId`/`hold`" as a SHALL — an internal-implementation
fact no test can observe. Removed as a spec requirement; see design.md
Decision 1 for the honest, corrected account of what does and does not
generalize to a future item type.)*

#### Scenario: A fill for a registered item type consumes and delivers per that type's handler
- **WHEN** a fill settles for a registered `itemType`
- **THEN** the resting side's reservation is consumed and the filled
  quantity is delivered to the buy side, both following that type's
  registered handler, both within the fill's own settlement transaction

#### Scenario: A fill naming an unregistered item type is rejected
- **WHEN** a fill is attempted for an `itemType` with no registered handler
- **THEN** the fill is rejected before any state changes

#### Scenario: The goods handler's co-location answer is always satisfied at match time
- **WHEN** a fill settles for `itemType = "goods"`
- **THEN** the co-location question is always satisfied, because a goods
  listing's physical presence at its venue was already established at
  post-time reservation (see `market-listings`'s "Post Reserves the Posting
  Side's Resource Before the Listing Exists"), not re-checked here

### Requirement: A Fill Consumes the Resting Sell Listing's Escrowed Reservation
A fill against an open sell listing SHALL, in the same settlement
transaction as its ledger entries and the buy side's delivery, invoke the
item-type handler's `Consume` operation to permanently debit the filled
quantity from the selling corporation's escrowed reservation for that
listing — for goods, `trading-station`'s "A Fill Debits Both Stored and
Escrowed From the Seller's Bucket, Credits the Buyer's Stored." A fill SHALL
NOT be considered settled by decrementing the listing's `remainingQuantity`
field alone — the resting side's physically reserved resource SHALL be
debited by the same amount, in the same transaction, or the fill SHALL NOT
commit.

#### Scenario: A fill's ledger effects and its Consume call commit together
- **WHEN** a fill settles against an open sell listing
- **THEN** the listing's `remainingQuantity` decrement, the ledger entries,
  and the `Consume` debit against the seller's reservation all commit in
  the same transaction — never one without the others

#### Scenario: A fill that only decremented remaining quantity without consuming the reservation is not a valid settlement
- **WHEN** a settlement implementation is checked against this requirement
- **THEN** a fill that leaves the seller's escrowed reservation unchanged
  while reducing `remainingQuantity` does not satisfy this capability —
  every fill's `Consume` call is mandatory, not an optional cleanup step

### Requirement: A Fill Is Triggered By An Explicit Taker Action, Never By a Background Process
The system SHALL execute a fill only as the direct, synchronous effect of an
explicit taker request — a marketable sell order (`goods-sale`'s plain sale,
which always walks resting buy-side entries to completion via the
bottomless NPC floor) or a marketable buy order (see "Marketable Buy Order
Fills Against Resting Sell Listings, Limit-Priced") — never a scheduled or
background process that matches two resting listings against each other
with no triggering request.

#### Scenario: Two crossing resting listings with no taker action never settle on their own
- **WHEN** a resting buy listing and a resting sell listing would cross (buy
  price ≥ sell price) and no taker request is made against either
- **THEN** neither listing's quantity or status changes

#### Scenario: A taker's request settles synchronously within its own response
- **WHEN** a taker request matches an eligible resting listing
- **THEN** the fill is settled and reflected in the same request's response,
  with no action id and no ETA

### Requirement: Taker Order Walks Resting Opposing Listings By Price-Then-Time Priority, Executing At Each Entry's Own Price
For a taker order naming a venue, item type, item reference, side, and
quantity, the system SHALL fill against resting listings — and standing NPC
entries, see `npc-market-demand`'s "NPC Floor and Requests Ride the Unified
Book as Standing Orders" — on the opposing side at that venue and item,
ordered by best price first (highest bid for a selling taker, lowest ask for
a buying taker) and, among equal prices, earliest post time first —
continuing to the next-best entry only once the current one's remaining
quantity is exhausted, until the taker's quantity is filled or no eligible
opposing entry remains. **Each fill executes at the resting (matched)
entry's own unit price** — never the taker's requested or limit price, and
never a blended price across entries; a taker order spanning several
entries pays or receives each portion at that portion's own resting price,
exactly mirroring `goods-sale`'s "the response reports each filled entry's
portion (tons and unit price) separately."

#### Scenario: A taker fills fully against the single best-priced opposing entry
- **WHEN** the best-priced eligible opposing entry's remaining quantity
  covers the taker's whole order
- **THEN** the order fills entirely against that one entry, at that entry's
  own unit price

#### Scenario: A taker fills across multiple opposing entries in strict price-then-time order, each at its own price
- **WHEN** the best-priced eligible opposing entry does not cover the
  taker's whole order
- **THEN** the remainder fills against the next-best eligible entry, and so
  on, each portion executing at the price of the entry that filled it —
  never at the taker's own price, and never blended into one figure

#### Scenario: Two equally priced opposing entries fill in the order they were posted
- **WHEN** two eligible opposing entries share the identical price
- **THEN** the earlier-posted entry fills first

### Requirement: Self-Match Is Rejected
A fill SHALL never match a resting listing against a taker order from the
same corporation. Matching SHALL skip a same-corporation opposing entry and
proceed to the next-best eligible one.

#### Scenario: A corporation's own resting buy listing is skipped when that same corporation sells
- **WHEN** a corporation submits a sell taker order at a venue where it also
  holds an open, otherwise-eligible resting buy listing
- **THEN** its own listing is skipped and does not fill

#### Scenario: Skipping a same-corporation entry still allows the next-best other corporation's entry to fill
- **WHEN** the skipped same-corporation entry would otherwise have been
  best-priced
- **THEN** the next-best eligible entry from a different corporation fills
  instead

### Requirement: Partial Fills Are Allowed; a Resting Listing's Remainder Is Reduced By What Filled, Never Left At Its Original Quantity
The system SHALL allow a fill to cover less than a taker's or a resting
listing's full quantity. A posted (resting) listing's unfilled remainder
SHALL be reduced by exactly the tonnage that filled — it SHALL NOT remain
open at its original (pre-fill) quantity, and it SHALL NOT be invented or
clamped to any value other than "what it started with, minus what actually
filled." A marketable (non-resting) taker order's unfilled remainder, once
every eligible opposing entry is exhausted, SHALL be rejected in full rather
than partially applied, unless the venue's bottomless NPC floor order
(`npc-market-demand`) guarantees a fill exists for that venue/kind (true for
`goods-sale`'s plain sell, never true for the buy side — see "Marketable Buy
Order Rejects In Full When It Cannot Fully Fill Within Its Limit Price").

#### Scenario: A marketable taker order with insufficient opposing demand and no floor is rejected in full
- **WHEN** a marketable taker order's quantity exceeds every eligible
  opposing entry's combined remaining quantity, and no floor order applies
  (e.g. a marketable buy order, which has no NPC seller of last resort)
- **THEN** the order is rejected in full, applying no partial fill

#### Scenario: A resting listing that partially fills remains open at its reduced remaining quantity, not its original one
- **WHEN** a resting listing is only partially filled by a taker order
- **THEN** it remains `open`, its remaining quantity reduced by exactly the
  filled amount — a subsequent read never reports its original,
  pre-fill quantity

### Requirement: Marketable Buy Order Fills Against Resting Sell Listings, Limit-Priced
The system SHALL accept a marketable buy order — venue, item type, item
reference, quantity, and a **required** limit price (the maximum unit price
acceptable for any portion filled) — from an authenticated corporation,
requiring no fleet presence (buy-side settlement is a credit debit plus a
storage delivery, neither of which needs the buyer physically anywhere; see
`trading-station`'s "A Fill Debits Both Stored and Escrowed From the
Seller's Bucket, Credits the Buyer's Stored"). The walk SHALL never fill
against a resting sell entry priced above the supplied limit price. A
missing or non-finite limit price SHALL be rejected before any state
change.

#### Scenario: A buy order fills against the cheapest eligible resting sell listings up to its limit price
- **WHEN** a marketable buy order's limit price is at or above the
  cheapest eligible resting sell listing's price
- **THEN** it fills against that listing (and, if needed, successively
  more expensive ones, each still at or below the limit) by price-then-
  time priority

#### Scenario: A resting sell listing priced above the limit is never touched
- **WHEN** a marketable buy order's limit price is below an otherwise-
  eligible resting sell listing's price
- **THEN** that listing is never filled by this order, regardless of how
  much of the order remains unfilled

#### Scenario: A missing limit price is rejected before any state change
- **WHEN** a marketable buy order omits its limit price, or supplies a
  non-finite one
- **THEN** the order is rejected, and no credits, storage, or listing state
  changes

### Requirement: Marketable Buy Order Rejects In Full When It Cannot Fully Fill Within Its Limit Price
A marketable buy order that cannot be fully filled — because every eligible
resting sell listing at or below its limit price is exhausted before its
quantity is satisfied — SHALL be rejected in full: no credits debited, no
storage delivered, and no partial fill against any of the entries it did
reach. There is no NPC seller of last resort on the buy side (NPC stations
in this version only buy — see `npc-market-demand`); a marketable buy order
therefore has no bottomless backstop the way `goods-sale`'s plain sell does
against the NPC floor.

#### Scenario: Insufficient sell-side liquidity within the limit price rejects the whole order
- **WHEN** the combined remaining quantity of every resting sell listing at
  or below a buy order's limit price is less than the order's requested
  quantity
- **THEN** the order is rejected in full — no credits are debited and no
  storage is delivered, even for the portion that could have filled

#### Scenario: No open sell listings at all rejects the order in full
- **WHEN** a marketable buy order names a venue/kind with no open sell
  listing at any price
- **THEN** the order is rejected in full

### Requirement: Marketable Buy Order Settles Atomically, Fog-Gated, Idempotent By a Corporation-Scoped Key
A marketable buy order's credit debit (via `corporation-credits`'s
"Settlement Converts a Locked Reservation Into a Real Transfer" — applied
here without a pre-existing lock, since a marketable order reserves nothing
in advance), ledger entries, and storage delivery SHALL occur in one
settlement transaction, all-or-nothing. It SHALL be accepted only for an
authenticated, spawned corporation (a corpless requester is rejected, as
`goods-sale`'s sale is), gated by the same venue visibility tier
`market-listings`'s "Post Applies the Venue Visibility Gate, Existence
Hidden" applies (a venue below the requester's tier is rejected identically
to an unknown venue). It SHALL accept a caller-supplied operation key,
scoped to the buying corporation's own namespace and format-constrained
exactly as `market-listings`'s "Idempotent Post By a Corporation-Scoped,
Format-Constrained Operation Key" is — a retried call with an already-
settled key for the same corporation is a no-op returning the original
result; a reused key with different parameters is a conflict.

#### Scenario: A settled buy order lands its debit, ledger entries, and delivery together
- **WHEN** a marketable buy order settles
- **THEN** the buyer's credits and locked balance (unaffected, since none
  was pre-locked), ledger entries, and storage delivery all commit in the
  same transaction

#### Scenario: A corpless requester is rejected
- **WHEN** an authenticated account with no living corporation submits a
  marketable buy order
- **THEN** the request is rejected, and no state changes

#### Scenario: A venue below the requester's visibility tier is rejected identically to an unknown venue
- **WHEN** a marketable buy order names a venue in a system below the
  requester's configured minimum visibility tier
- **THEN** the response is indistinguishable from naming a venue that does
  not exist

#### Scenario: A retried buy order after a lost response does not double-settle
- **WHEN** a client's marketable buy order succeeds server-side but its
  response is lost, and the client retries the identical request (same
  operation key)
- **THEN** the retry returns the original settlement result, with no
  second debit or delivery

### Requirement: One Ledger Entry Per Corporate Side Per Fill — Never a Phantom NPC Entry
Settlement SHALL append one ledger entry to each side of a fill that has its
own ledger — a corporation always has one; an NPC-sourced counterparty (the
floor or an open request, see `npc-market-demand`) has none, since no NPC
corporation balance exists to ledger. A fill against an NPC-sourced entry
SHALL therefore append exactly **one** ledger entry total, to the player
corporation's own ledger — never a phantom entry minted for the NPC side,
which would pollute both `corporation-credits`'s reconciliation invariant
and its credit-minting/sink-rate signals with an entry that belongs to no
real corporation. A fill against a corporation-sourced entry (an open
player-posted listing) SHALL append exactly one entry to **each** side's own
ledger — a pair, one on the buyer's ledger and one on the seller's ledger —
never a blended entry spanning two different unit prices, and never more
than one entry per corporation per fill.

#### Scenario: A fill against the floor or a request appends exactly one ledger entry
- **WHEN** a fill settles against an NPC-sourced entry (the floor or an
  open request)
- **THEN** exactly one ledger entry is appended, to the player
  corporation's own ledger — no entry is minted for the NPC side

#### Scenario: A fill against a player-posted listing appends one entry to each side's own ledger
- **WHEN** a fill settles against a corporation-sourced entry (an open
  player-posted listing)
- **THEN** exactly one ledger entry is appended to the buyer's own ledger
  and exactly one to the seller's own ledger — a pair, each recording that
  fill's own price and quantity

#### Scenario: A taker order matching three resting entries of mixed source appends the correct entry count
- **WHEN** a taker order fills across three resting entries — two
  NPC-sourced and one corporation-sourced
- **THEN** exactly two ledger entries are appended for the NPC-sourced
  fills (one per fill, on the taker's own ledger) and exactly two for the
  corporation-sourced fill (a pair, one per side) — five entries total, not
  six and not three

### Requirement: All Preconditions Are Re-Read Inside the Settlement Transaction
Every precondition a fill depends on — a resting listing's remaining
quantity and status, the taker's held resource or available credits, and
the handler's co-location answer — SHALL be re-read inside the settlement
transaction that commits the fill. A read performed before the transaction
began SHALL never by itself be sufficient to commit a fill. When a
precondition's transactional re-read shows a resting entry has less
remaining quantity than a stale pre-transaction read suggested, the walk
SHALL simply continue against the entry's currently correct remaining
quantity and proceed to the next eligible entry for any shortfall — this is
ordinary price-then-time walking, never a "reduction" applied to the
taker's stated quantity. A precondition failure that leaves the taker's
order unable to fully fill (per "Marketable Buy Order Rejects In Full..." or
`goods-sale`'s "SHALL NEVER be reduced, clamped, or partially settled")
SHALL reject that order's still-unfilled portion in full, never silently
settle it for less than what the walk, correctly re-read, actually supports.

#### Scenario: A resting listing exhausted by a concurrent fill between the taker's read and its request is walked past, not silently under-filled
- **WHEN** a taker's own prior read of a resting listing's remaining
  quantity is stale by the time its request commits, because a concurrent
  fill already reduced or exhausted it
- **THEN** the transaction re-reads the current remaining quantity, fills
  whatever portion (if any) it still offers, and continues the walk to the
  next eligible entry for the rest — exactly as if the stale read had never
  happened

#### Scenario: A precondition that fails on the transactional re-read rejects the fill in full
- **WHEN** any precondition fails during the transactional re-read and the
  order cannot otherwise be fully satisfied per this capability's own
  fill-in-full rules
- **THEN** the fill is rejected in full, never a silently reduced amount

### Requirement: Exactly-Once Settlement Under Concurrent Takers
A resting listing's remaining-quantity decrement (and its paired `Consume`
debit against the seller's reservation) SHALL be a single atomic operation
per fill, so two concurrent takers targeting the same resting listing can
never together take more than its remaining quantity permitted at the
moment each committed. When a resting listing cannot cover both concurrent
takers' full requests, one SHALL settle to the full extent the listing's
remaining quantity (re-read transactionally) actually supports, and the
other's request against that specific listing SHALL yield nothing further
from it — that taker's own order then either continues its walk to the next
eligible resting entry (ordinary matching, not a reduction) or, if none
remains and it cannot otherwise be fully satisfied, is rejected in full per
"Partial Fills Are Allowed..." and "Marketable Buy Order Rejects In Full...".
The resting listing's remaining quantity SHALL never be driven negative, and
no taker's fill SHALL ever be silently reduced without either continuing
the walk or rejecting in full.

#### Scenario: Two concurrent takers targeting the same resting listing never together oversell it
- **WHEN** two takers concurrently target the same resting listing for
  combined quantity exceeding what it has remaining
- **THEN** its remaining quantity is never driven negative — one takes the
  full extent the listing supports, and the other's fill against that
  listing yields nothing further, with its own order then walking onward or
  rejecting in full, never silently settling for a smaller, unexplained
  amount against that listing alone

### Requirement: A Fill Never Double-Releases a Listing's Reservation
A fill SHALL consume a resting listing's reservation only for the quantity it
fills, transactionally alongside `market-listings`'s terminal-state
transition (see "Terminal-State Transition Is Exactly-Once"). A listing
already cancelled or expired before a fill's transaction commits SHALL cause
that fill to reject rather than consume an already-released reservation.

#### Scenario: A fill racing a cancel that commits first rejects
- **WHEN** a fill and a cancel are both attempted concurrently against the
  same listing, and the cancel commits first
- **THEN** the fill rejects, observing the listing already cancelled

#### Scenario: A fill racing an expiry check that commits first rejects
- **WHEN** a fill and an expiry check are both attempted concurrently
  against the same listing, and the expiry commits first
- **THEN** the fill rejects, observing the listing already expired

#### Scenario: A fill that commits first leaves a racing cancel or expiry to release only the correctly reduced remainder
- **WHEN** a fill commits first against a listing, followed by a racing
  cancel or expiry check
- **THEN** the cancel or expiry releases only the listing's remaining
  (post-fill) reservation, never the already-filled portion

### Requirement: No Negative, Zero, NaN, or Infinite Fill Quantities or Prices; Overflow-Safe Arithmetic
The system SHALL reject a fill whose computed quantity or price at any step
is zero, negative, `NaN`, or infinite, and SHALL compute every proceeds and
balance arithmetic operation without silent integer or floating-point
overflow.

#### Scenario: A fill computation that would produce a non-finite value is rejected
- **WHEN** a fill's computed proceeds or quantity would be `NaN` or infinite
- **THEN** the fill is rejected rather than applied with that value

#### Scenario: A fill at the extreme end of configured quantity and price bounds still settles correctly
- **WHEN** a fill is attempted at the largest quantity and price this
  capability's validation allows
- **THEN** it settles with a correctly computed, non-overflowed result

### Requirement: Rejections Report a Distinguishable Reason
Every rejection this capability defines — an unregistered item type, no
eligible opposing entry, insufficient taker resource, a missing or invalid
limit price, a venue below the visibility gate, a failed transactional
precondition re-read, and a listing already in a terminal state — SHALL
carry a distinguishable reason in the response body, following the
`gin.H{"error": "<reason>"}` convention `mine-extraction` established.

#### Scenario: Two different rejections carry different reasons
- **WHEN** two separately rejected fills fail for two different reasons
  (e.g. unregistered item type vs. no eligible opposing entry)
- **THEN** the two responses' reason text differs

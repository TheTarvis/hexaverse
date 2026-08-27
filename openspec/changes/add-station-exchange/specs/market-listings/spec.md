## ADDED Requirements

### Requirement: Venue Is An Opaque Scope Key, With a Reserved Global Value
A listing SHALL carry a `venue` — an opaque string scope key the book compares
only for equality, never parsed, decomposed, or otherwise interpreted by the
matching or settlement logic. The literal value `global` SHALL be reserved for
a venue with no physical location (a future non-goods listing type), and no
station-derived venue key SHALL ever equal it. This version derives every
goods listing's venue deterministically and uniquely from its station's id.

#### Scenario: Two listings at the same physical station share one venue key
- **WHEN** two listings are posted naming the same station
- **THEN** both carry the identical derived venue key

#### Scenario: Two listings at different stations never share a venue key
- **WHEN** two listings are posted naming two different stations
- **THEN** their derived venue keys differ

#### Scenario: The reserved global venue key is never produced by a station-derived venue
- **WHEN** a venue key is derived for any station id
- **THEN** the resulting key never equals the reserved literal `global`

#### Scenario: A buy listing at one venue never matches a sell listing at a different venue
- **WHEN** a buy listing at venue A and a sell listing at venue B name the
  same item type and item reference
- **THEN** they are never matched against each other

### Requirement: Item Type and Item Reference Are Opaque to the Book
The system SHALL treat a listing's `itemType` and `itemRef` as opaque strings
the book stores and compares for equality only, delegating all
item-type-specific interpretation of them to the handler registered for that
`itemType` (see `market-settlement`'s "Item-Type Handler Seam"). This version
registers exactly one handler, for `itemType = "goods"`, whose `itemRef`
values are the mine-extractable resource kinds. A post naming an `itemType`
with no registered handler SHALL be rejected.

*(Note: earlier drafts of this requirement additionally asserted "the core
names no `tons`/`stationId`/`hold`" as a SHALL. That assertion named an
internal implementation fact — what identifiers a package's source uses —
that no test can observe as behavior, so it has been removed as a spec
requirement. The actual design constraint it was gesturing at — how far the
goods-shaped `Reserve`/quantity model does and does not generalize to a
future, structurally different item type — is recorded honestly in
design.md Decision 1, including where it does NOT cleanly generalize.)*

#### Scenario: A goods listing names a resource kind as its item reference
- **WHEN** a goods listing is posted
- **THEN** its `itemRef` is one of the mine `ResourceKind` values

#### Scenario: An item type with no registered handler is rejected at post
- **WHEN** a post names an `itemType` with no registered handler
- **THEN** the post is rejected, creating no listing

#### Scenario: Two listings of different item types at the same venue never match each other
- **WHEN** a `goods` listing and a listing of any other registered item type
  share the same venue and side
- **THEN** they are never matched against each other

### Requirement: Post Requires Positive, Finite Quantity and Unit Price
A post SHALL be rejected — applying no reservation and no fee — when its
quantity or unit price is zero, negative, `NaN`, or infinite.

#### Scenario: Zero quantity is rejected
- **WHEN** a post names a quantity of zero
- **THEN** it is rejected and no reservation, fee, or listing is created

#### Scenario: Negative or non-finite unit price is rejected
- **WHEN** a post names a negative, `NaN`, or infinite unit price
- **THEN** it is rejected and no reservation, fee, or listing is created

#### Scenario: A valid positive, finite quantity and price is accepted
- **WHEN** a post names a positive, finite quantity and unit price
- **THEN** it is accepted, subject to this capability's other preconditions

### Requirement: Post Applies the Venue Visibility Gate, Existence Hidden
A post — buy or sell — SHALL be accepted only when the requester's graph-tier
knowledge of the named venue's underlying system is at least the configured
minimum visibility tier (`market-price-board`'s "Configured Minimum
Visibility Tier"), checked immediately after authentication and before any
reservation or fee is attempted. A venue that does not exist, and a venue in
a system below the requester's visibility tier, SHALL be rejected
identically — the same status code and the same byte-identical reason text
— so posting can never be used to distinguish "no venue here" from "a venue
you cannot see." This closes the same station-enumeration surface
`goods-sale`'s "Sale Applies the Station Visibility Gate, Existence Hidden"
closes for selling — a buy post is otherwise fleet-free and location-free
(see "Post Reserves the Posting Side's Resource Before the Listing Exists"),
so without this gate it would be the one remaining path that lets a caller
probe for stations by venue id alone.

#### Scenario: A venue below the requester's visibility tier is indistinguishable from none
- **WHEN** an authenticated requester posts a buy or sell listing naming a
  real venue in a system for which their graph tier is below the configured
  minimum
- **THEN** the response's status and reason text are byte-identical to the
  response for a post naming a venue derived from a station id that has
  never existed
- **AND** no reservation, fee, or listing is created in either case

#### Scenario: Station probing cannot map the galaxy's homes via posting
- **WHEN** a requester submits buy-listing posts naming candidate venues
  derived from system ids across systems they have never observed
- **THEN** every response is identical regardless of whether that system
  actually carries a station

#### Scenario: A venue at or above the configured minimum tier accepts a post
- **WHEN** a requester's graph tier for a venue's system is at least the
  configured minimum
- **THEN** the post proceeds to its other preconditions (reservation, fee)

### Requirement: Post Reserves the Posting Side's Resource Before the Listing Exists
Posting a listing SHALL, in one transaction, invoke the item-type handler's
`Reserve` operation for the posting side — for a sell listing, the goods
handler's answer is `trading-station`'s "Sell-Listing Reservation Increases
Both Stored and Escrowed Together" (moving tonnage out of a docked fleet's
hold into the posting corporation's own `stored`-and-`escrowed` storage at
the venue); for a buy listing, the goods handler's answer locks credits from
available into locked (`corporation-credits`'s "Escrow Lock Reserves
Available Credits") for an amount equal to the listing's quantity × unit
price, **rounded down** to the nearest whole credit (the same rounding
direction `goods-sale`'s proceeds and this capability's own listing fee
already use, so the lock never falls short of what fills can actually debit
— see "Residual Locked Credits Release On the Filled Transition" for the
gap this direction leaves) — and create the listing in `open` status with
its full quantity remaining. SHALL create no listing at all when the
reservation fails (insufficient hold tonnage, insufficient available
credits, or the handler's own rejection), never a partially-reserved
listing.

#### Scenario: A sell listing's reservation locks the named tonnage out of the posting fleet's hold
- **WHEN** a sell listing is posted by a fleet docked at the venue's station
  holding at least the named tonnage
- **THEN** the fleet's cargo pool decreases by that tonnage and the listing
  is created open

#### Scenario: A buy listing's reservation locks the named credits from available into locked
- **WHEN** a buy listing is posted by a corporation with sufficient available
  credits
- **THEN** its locked balance increases by the floored quantity × unit-price
  amount and the listing is created open

#### Scenario: A failed reservation creates no listing
- **WHEN** a post's reservation step fails (insufficient hold tonnage or
  insufficient available credits)
- **THEN** no listing is created and no partial reservation is left behind

#### Scenario: Reservation and listing creation commit together or not at all
- **WHEN** the transaction backing a post is forced to conflict and retry
- **THEN** neither the reservation nor the listing is ever observably left
  half-applied between retries

### Requirement: Listing Fee Charged At Post, Proportional With a Configured Minimum, Never Refunded
The system SHALL charge the posting corporation a listing fee at post time,
computed as `max(ListingFeeMinimum, floor(ListingFeeRate × quantity ×
unitPrice))` — the proportional term is floored to the nearest whole credit
**before** the maximum is taken, never the reverse (so the fee is never a
non-integer proportional value compared against an integer minimum) —
debited from available credits under a dedicated `listingFee` ledger entry
kind that credits no counterparty (the economy's credit sink). The fee SHALL
NOT be refunded on cancel or expiry, and SHALL be charged exactly once per
listing regardless of how much of it ever fills. `market.Params.ListingFeeMinimum`
SHALL be configured to at least 1 whole credit — a zero minimum SHALL be
rejected as an invalid configuration — so a listing fee can never be a
zero-amount ledger entry (matching `corporation-credits`'s "No amount
recorded for a credit mutation SHALL ever be zero").

#### Scenario: A large listing's fee is the proportional amount
- **WHEN** `floor(ListingFeeRate × quantity × unitPrice)` exceeds
  `ListingFeeMinimum`
- **THEN** the charged fee is that floored proportional amount

#### Scenario: A small listing's fee is the configured flat minimum
- **WHEN** `floor(ListingFeeRate × quantity × unitPrice)` is at or below
  `ListingFeeMinimum`
- **THEN** the charged fee is exactly `ListingFeeMinimum`

#### Scenario: The fee is never a zero-amount ledger entry
- **WHEN** any listing is posted, however small its quantity or price
- **THEN** the charged fee is at least 1 whole credit, since
  `ListingFeeMinimum` is configured to at least 1 and the fee is the
  greater of it and the floored proportional term

#### Scenario: A cancelled listing's fee is not refunded
- **WHEN** an open listing is cancelled
- **THEN** its previously charged listing fee is not returned to the posting
  corporation

#### Scenario: An expired listing's fee is not refunded
- **WHEN** an open listing expires unfilled
- **THEN** its previously charged listing fee is not returned

#### Scenario: A partially filled, later-cancelled listing's fee was charged only once
- **WHEN** a listing partially fills and is later cancelled
- **THEN** exactly one `listingFee` ledger entry exists for it, charged at
  post time, never a second charge at fill or cancel time

### Requirement: Idempotent Post By a Corporation-Scoped, Format-Constrained Operation Key
A post SHALL accept a caller-supplied operation key, scoped to the posting
corporation as the dedup anchor's own namespace (never a galaxy-global
keyspace) and constrained to the same key format
`corporation-credits`'s "Operation Key Format Is Constrained and Its
Namespace Reserved" establishes (16–64 characters, `[A-Za-z0-9_-]` only,
reserved prefixes rejected) — so an operation key used by one corporation
has no effect of any kind on any other corporation's post carrying the same
literal key. A repeated post carrying an already-used operation key **for
the same corporation** SHALL be a no-op returning the original listing,
applying no second reservation, fee, or listing. A reused key naming
different parameters (venue, side, itemType, itemRef, quantity, or price)
than the recorded post SHALL be rejected as a conflict, not answered as a
replay.

#### Scenario: A retried post after a lost response does not double-list or double-charge the fee
- **WHEN** a client's post succeeds server-side but its response is lost, and
  the client retries the identical request (same operation key)
- **THEN** the retry returns the original listing, with no second
  reservation, fee, or listing created

#### Scenario: The same operation key used by two corporations applies twice, independently
- **WHEN** corporation A posts a listing with operation key K, and
  corporation B later posts its own listing with the same key K
- **THEN** B's post applies in full, creating B's own listing, and
  discloses no detail of A's listing (venue, price, quantity)

#### Scenario: A reused key with different parameters is a conflict, not a replay
- **WHEN** a post reuses an operation key already recorded for the same
  corporation, but names a different venue, side, item type, item
  reference, quantity, or price than the recorded listing
- **THEN** the response is a distinguishable conflict error, and no second
  listing is created

#### Scenario: An empty or malformed operation key is rejected before any state is touched
- **WHEN** a post supplies an operation key that is empty, outside the
  16–64 character range, or contains a character outside `[A-Za-z0-9_-]`
- **THEN** the response is `400 Bad Request`, and no reservation, fee, or
  listing is created

### Requirement: Cancel Requires Listing Ownership, 404 Before Any Other Precondition, Hides Existence
The system SHALL accept a cancel only from the posting corporation, checked
before any other precondition. A foreign or unknown listing SHALL respond
`404 Not Found`, disclosing nothing distinguishable between "this listing
belongs to another corporation" and "no listing exists at this id."

#### Scenario: The owning corporation cancels its own open listing
- **WHEN** the posting corporation cancels its own open listing
- **THEN** the cancel is accepted (subject to the listing's current status)

#### Scenario: A foreign corporation's cancel attempt is rejected with 404, disclosing nothing
- **WHEN** a corporation other than the poster attempts to cancel a listing
- **THEN** the response is `404 Not Found`, revealing no detail about the
  listing's existence, owner, or state

#### Scenario: An unknown listing id is rejected with 404
- **WHEN** a cancel names a listing id that does not exist
- **THEN** the response is `404 Not Found`, indistinguishable from the
  foreign-ownership case

### Requirement: Cancel Releases the Reservation, Never Twice
Cancelling an open listing SHALL, in one transaction, invoke the item-type
handler's `Release` operation (restoring a seller's storage escrow to free
— see `trading-station`'s "Escrow Release Restores Free Storage Without
Changing Stored" — or a buyer's locked credits back to available) and mark
the listing `cancelled`. A listing already `filled`, `cancelled`, or
`expired` SHALL reject a further cancel as a no-op, never releasing its
reservation a second time.

#### Scenario: Cancelling an open sell listing un-escrows its storage tonnage
- **WHEN** an open sell listing is cancelled
- **THEN** its reserved tonnage becomes free (unescrowed) storage at the
  same station and corporation

#### Scenario: Cancelling an open buy listing restores its locked credits to available
- **WHEN** an open buy listing is cancelled
- **THEN** its locked credits decrease and available credits increase by the
  same amount

#### Scenario: Cancelling an already-cancelled listing is a no-op
- **WHEN** a cancel is requested against a listing already `cancelled`
- **THEN** the request is a no-op; no reservation is released a second time

#### Scenario: Cancelling a fully filled listing is rejected, since nothing remains to release
- **WHEN** a cancel is requested against a listing already `filled`
- **THEN** the request is rejected; no reservation exists to release — its
  transition to `filled` already released any un-debited residue (see
  "Residual Locked Credits Release On the Filled Transition")

### Requirement: Auto-Expiry After a Configured Window Releases the Reservation Exactly Like Cancel
A listing whose age exceeds its configured expiry window
(`market.Params.ListingExpiryWindow`, per item type) SHALL transition to
`expired`, releasing its remaining reservation exactly as a cancel does
(via the item-type handler's `Release` operation), triggered
opportunistically by any read or operation that touches it — no scheduled
job required, mirroring `action-dispatch`'s read-triggered resolution.

#### Scenario: A listing read after its expiry window has elapsed is reported expired, its reservation released
- **WHEN** an open listing is read after its configured expiry window has
  elapsed
- **THEN** it is reported `expired` and its remaining reservation has been
  released

#### Scenario: A listing read before its expiry window has elapsed is unaffected
- **WHEN** an open listing is read before its configured expiry window has
  elapsed
- **THEN** it remains `open`, unaffected

#### Scenario: Expiry releases only the remaining (unfilled) quantity's reservation
- **WHEN** a partially filled listing expires
- **THEN** only its remaining, unfilled quantity's reservation is released;
  the already-delivered portion is unaffected

### Requirement: Zero Remaining Quantity Transitions a Listing to Filled
A sell or buy listing whose remaining quantity reaches exactly zero as the
direct effect of a fill SHALL transition to `filled`, in the same
settlement transaction as that fill — SHALL NOT remain `open` at zero
remaining quantity. A listing already at `filled` SHALL never be matched
against by a further taker order (its remaining quantity is zero, so no
eligible opposing entry exists for it — see `market-settlement`'s "Taker
Order Walks Resting Opposing Listings By Price-Then-Time Priority").

#### Scenario: A fill that exactly exhausts a listing's remaining quantity marks it filled
- **WHEN** a fill's tonnage exactly equals a resting listing's remaining
  quantity
- **THEN** the listing transitions to `filled` in the same transaction as
  the fill, not left `open` at zero

#### Scenario: A filled listing is never matched again
- **WHEN** a taker order's walk considers a listing already at `filled`
- **THEN** it is skipped — zero remaining quantity means no further fill is
  possible against it

### Requirement: Residual Locked Credits Release On the Filled Transition
A buy listing's lock (per "Post Reserves the Posting Side's Resource Before
the Listing Exists") is computed once, at post time, from the listing's full
original quantity — but each fill's own proceeds round down independently
(`goods-sale`'s and `market-settlement`'s per-fill rounding rule), so the
sum of amounts actually debited across every fill can be strictly less than
the amount originally locked, by an accumulated rounding residue. When a buy
listing transitions to `filled` (see "Zero Remaining Quantity Transitions a
Listing to Filled"), any such residue — the difference between what remains
locked for that listing and what was actually debited by its fills — SHALL
be released back to available in the same transaction as the `filled`
transition, exactly as a cancel or expiry release would, so no rounding
residue is ever permanently stranded in `creditsLocked`.

#### Scenario: A buy listing filled across several rounding-down fills releases its residue on completion
- **WHEN** a buy listing's cumulative fills debit strictly less than its
  original locked amount, due to accumulated per-fill floor rounding, and
  its remaining quantity reaches zero
- **THEN** the difference is released back to the buyer's available balance
  in the same transaction as the listing's transition to `filled`

#### Scenario: A buy listing with no rounding residue releases nothing extra
- **WHEN** a buy listing's cumulative fills debit exactly the amount
  originally locked
- **THEN** no residual release occurs — there is nothing left to release

### Requirement: Terminal-State Transition Is Exactly-Once
A listing's transition into a terminal state (`filled`, `cancelled`, or
`expired`) SHALL be a single compare-and-set transaction keyed on its
still-`open` status. When a cancel, an expiry check, and a settlement fill
race for the same listing, exactly one SHALL win, and every loser SHALL
observe the listing already in its resulting state rather than applying its
own effect a second time.

#### Scenario: A cancel racing a concurrent fill — whichever commits first wins
- **WHEN** a cancel and a settlement fill are both attempted concurrently
  against the same listing
- **THEN** exactly one commits its effect, and the other observes the
  updated state and applies no further effect

#### Scenario: An expiry check racing a concurrent fill — whichever commits first wins
- **WHEN** an expiry check and a settlement fill are both attempted
  concurrently against the same listing
- **THEN** exactly one commits its effect, and the other observes the
  updated state and applies no further effect

#### Scenario: A cancel racing a concurrent expiry check yields exactly one terminal transition
- **WHEN** a cancel and an expiry check are both attempted concurrently
  against the same listing
- **THEN** exactly one terminal transition results, never two independent
  reservation releases

### Requirement: Listing and Book Reads Are Fog-Gated, Existence Hidden Below the Gate
A listing or a venue's book SHALL be included in a read only when the
requester's graph-tier knowledge of the venue's underlying system is at least
the configured minimum visibility tier (`market-price-board`'s "Configured
Minimum Visibility Tier"). A direct read for a listing or venue below that
gate SHALL respond as not found, disclosing nothing distinguishable from an
unknown id.

#### Scenario: A venue's book is included once the requester clears the configured minimum tier
- **WHEN** a requester's graph tier for a venue's system is at least the
  configured minimum
- **THEN** that venue's open listings are included in the book read

#### Scenario: A venue's book is omitted below the configured minimum tier
- **WHEN** a requester's graph tier for a venue's system is below the
  configured minimum
- **THEN** that venue's listings are omitted from the book read

#### Scenario: A direct listing read below the gate is indistinguishable from an unknown listing id
- **WHEN** a direct listing read is requested for a listing whose venue is
  below the requester's configured minimum tier
- **THEN** the response is `404 Not Found`, identical to an unknown listing
  id

### Requirement: Owner's Own-Listings Read, Including Recently Terminal
The system SHALL serve an authenticated read of the requesting corporation's
own listings — every `open` one, plus, for a configured retention window
after transition, every `filled`, `cancelled`, or `expired` one — carrying
full detail (venue, side, itemType, itemRef, quantity, remainingQuantity,
unitPrice, status, and the terminal reason where applicable), independent
of the general venue/book fog gate: a corporation always sees its own
listings, wherever they are, exactly as `corporation-credits`'s balance and
ledger reads are owner-only rather than fog-gated. This is the read a
client uses to know which listings are its own (never a marker embedded in
the general, fog-gated book read, which discloses no ownership at all) and
to learn that an open listing has since expired or filled — the surface
`market-board-panel`'s and `board-view`'s terminal-status UI consume.

#### Scenario: An owner sees its own open listings regardless of fog
- **WHEN** a corporation reads its own listings
- **THEN** every one of its `open` listings is included, regardless of the
  requester's current graph tier for that listing's venue

#### Scenario: An owner sees a recently expired listing's terminal status
- **WHEN** one of a corporation's listings expired within the configured
  retention window
- **THEN** it appears in this read with status `expired`

#### Scenario: An owner sees a recently filled listing's terminal status
- **WHEN** one of a corporation's listings was fully filled within the
  configured retention window
- **THEN** it appears in this read with status `filled`

#### Scenario: A listing beyond the retention window after terminal transition no longer appears
- **WHEN** a listing transitioned to a terminal state longer ago than the
  configured retention window
- **THEN** it no longer appears in this read

#### Scenario: This read never discloses another corporation's listings
- **WHEN** any corporation calls this read
- **THEN** only listings posted by the requester's own corporation are
  ever returned

### Requirement: Every Listing Knob Is Configuration
The fee rate, fee minimum, expiry window(s), and the terminal-listing
retention window this capability names SHALL live in `market.Params`, read
at service construction or listing time, never as a literal at a call site.

#### Scenario: Changing a configured fee or expiry value changes subsequent postings' behavior with no call-site change
- **WHEN** a `market.Params` value (e.g. `ListingFeeRate`) is changed and the
  owning service is reconstructed with the new params
- **THEN** subsequently posted listings reflect the new value, with no
  change required at any call site

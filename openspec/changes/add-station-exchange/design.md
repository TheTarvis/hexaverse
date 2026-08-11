## Context

`docs/plans/goods-market.md` (2026-07-30) names M12 as "the exchange": a
per-station order book, escrow on post, one-transaction settlement, and a
listing fee as the economy's first credit sink — with the floor becoming
standing NPC orders in the same book. Every `**DECIDED**` line there is
locked and is not re-litigated here. `docs/plans/market.md` (the intel
market) is explicitly out of scope for this change, but it names the
dependency this design is built around: "the intel market later is this
machinery with a new listing type." That single sentence is the whole
reason this change is two capabilities (`market-listings`,
`market-settlement`) instead of one, and the whole reason the item-type
handler seam (Decision 1) exists.

M12 builds on M11 (`add-credits-and-npc-market`), authored but not yet
archived, and under revision by a parallel process at the time this change
was written. This design reads M11's *current* deltas (its capability
vocabulary, its `market.Params` shape, its transaction/idempotency
conventions) and builds on them without forking — but treats them as
provisional. Four M11 requirement headers are MODIFIED here (`goods-sale`'s
two settlement requirements, `market-board-panel`'s ranked-list requirement,
`fleet-movement`'s "Fleet Cargo Pool"); every other M11 capability this
change touches is touched with ADDED-only requirements, specifically to
minimize the re-sync surface once M11's own revision lands. See this
change's return notes for the exact headers targeted.

**Re-sync note:** M11's revision has since landed. This change was re-synced
against it once: `goods-sale`'s settlement requirements were retargeted to
M11's actual final headers (its "Applied Price Reported, Split Across
Request and Floor" requirement no longer exists — M11's own revision
replaced it with "Settlement Folds Tonnage Across a Venue's Ordered Demand
Entries," a strictly more general mechanism this change's genuine addition,
player-sourced demand entries, now MODIFIES instead); `fleet-movement`'s
"Fleet Cargo Pool" was confirmed byte-identical to what this change
originally read, so no content changed; and `request-authorization`'s new
per-corporation write quota (Decision — see the resolved Open Question)
was read and reconciled, adding one small ADDED requirement for the one
route it does not already cover by its own text.

The resolving principle carries forward unchanged: **bytes move instantly,
mass moves in a hold.** Credits, listings, and the book are information and
transmit galaxy-wide with zero travel time; goods exist in exactly two
places — a fleet's hold, or a station's storage — and a trade can only
settle where they physically are.

## Goals / Non-Goals

**Goals:**

- An item-type-agnostic listing and settlement engine that a future intel
  handler can register against without moving a line of the matching or
  settlement core.
- Escrow-on-post, so a listing is honest (the goods or the credits are
  already committed) the instant it becomes visible to anyone else.
- One-transaction settlement with price-then-time priority matching,
  partial fills, self-match rejection, and exactly-once behavior under
  concurrent takers.
- A listing fee that is a real, unrefundable credit sink — the economy's
  first one.
- Per-corporation station storage, so goods that arrive at a station via a
  trade (not a hold) have somewhere real to exist.
- The NPC floor and requests riding the same book, unmodified in their own
  externally observed pricing behavior, so `goods-sale`'s existing "spot the
  spread, haul, sell" loop keeps working exactly as M11 shipped it.

**Non-goals** (deferred; do not build):

- **The intel market itself** (`market.md`). This change's entire
  architecture exists to serve it later, but no intel-specific concept
  (decay, confidence, snapshot-into-fog delivery) is built here.
- **Player-built stations.** `trading-station`'s `ownerCorpId` already
  supports this as a value change; no build verb ships.
- **Dynamic/algorithmic pricing.** The floor and requests remain
  data-driven, per M11; nothing in this change makes a price respond to
  trade activity beyond what a player's own listing explicitly sets.
- **Jump-gate/toll mass networks, fuel, refining, the build verb.** Later
  arcs per `docs/plans/goods-market.md` and `BRAINSTORM.md`.
- **Route/Market intel** (`market.md` §11). Deferred until the intel market
  itself is built; this change does not name it.
- **A continuous double-auction matching daemon.** Every fill is
  taker-triggered; two resting listings that would cross never settle
  against each other with no request in flight (see Decision 3).
- **A live push (SSE) dependency for book or price-board freshness.** See
  Decision 5.

## Decisions

### 1. The item-type handler interface — the single most important artifact for the intel market, corrected honestly

**Correction (adversarial review, RULING B):** the first version of this
decision, and of `proposal.md`, claimed "nothing in this capability names
tons, holds, or stations" and asserted the matching/settlement core's
ignorance of physical concepts as a spec-level `SHALL`. Both claims were
wrong or unfalsifiable. `market-listings`' own "Post Reserves the Posting
Side's Resource Before the Listing Exists" requirement names fleet holds,
station-storage buckets, and tonnage directly — it has to, because *this
version's only registered handler is goods-shaped*. And "the core SHALL
name no `tons`/`stationId`/`hold`" was never a testable behavior — no test
can observe what identifiers a Go package's source uses — so it has been
removed from both spec deltas (`market-listings`' "Item Type and Item
Reference Are Opaque to the Book", `market-settlement`'s "Item-Type Handler
Seam") and replaced with this honest account instead.

**What genuinely generalizes, and what does not:**

- **`venue` as an opaque, equality-only scope key** genuinely generalizes —
  see Decision 2. Neither `market-listings` nor `market-settlement` parses
  it, and a future intel handler can use the reserved `global` value or a
  new per-relay key with zero change to either capability.
- **`MaySettleHere`** genuinely generalizes, in the specific sense that
  "always yes, for a structurally different reason" is a valid answer for
  both types — but this is a weak form of generalization: it works because
  goods front-loads its only physical check to post time (see below), not
  because the question itself is doing real work for goods today.
- **`Deliver`** genuinely generalizes — "place the filled value where the
  buyer can find it" is satisfied equally by crediting a storage bucket or
  by writing a snapshot into remembered fog. This is the strongest,
  cleanest seam of the three.
- **`Reserve` does NOT cleanly generalize, and this version's shape of it
  is goods-specific.** `Reserve`'s job, as goods answers it, is "lock a
  finite, exclusive resource away from being double-committed" — that
  model fits goods because a ton of ore really can back only one listing at
  a time. It does not fit a **copyable** good: `market.md`'s intel is
  explicitly resellable without limit (§3, "freely resellable... maximum
  liquidity"), so a future intel sell listing has nothing to lock — the
  seller keeps their copy and can list it again immediately. A `Reserve`
  that is unconditionally a no-op for intel's sell side is a degenerate
  answer to a question the goods handler treats as load-bearing, which is
  a real seam mismatch, not a clean generalization.
- **`quantity`/`remainingQuantity` as a finite, decrementing count is
  itself a goods-shaped assumption baked into the book's wire schema**, not
  something this design can claim is item-type-agnostic. A copyable good
  does not deplete as it sells; "remaining quantity" in the sense this
  book models it (falls to zero, then the listing is `filled`) has no
  natural meaning for an unlimited-resale sell listing. A future intel
  handler would need either a different quantity semantics (e.g.
  `quantity = 1`, always, standing for "one more copy always
  available") or a schema change this design does not have a story for
  today.

**Honest conclusion:** this change reduces, but does not eliminate, the
rewrite risk for a future intel listing type. The venue and `Deliver` seams
hold up well; `Reserve` and the finite-quantity model are real, named,
open design work for whenever intel is actually built — flagged in Open
Questions below, not resolved here, and not silently claimed as solved.

**The interface, named explicitly — five operations, split by which
capability invokes them (adversarial review, B3: the original three-operation
list omitted two operations the spec deltas already required by name):**

Invoked by `market-listings`, at post/cancel/expiry time (the posting
side only):

1. **Reserve** (post time): given a listing's side, quantity, and posting
   corporation, either lock the resource away from being double-committed,
   or fail — never partially.
   - *Goods answer:* for a sell listing, debit the posting fleet's hold and
     increase the corporation's station-storage bucket's `stored` **and**
     `escrowed` together (this doubles as the co-location proof — the
     tonnage is now physically at the venue, and is simultaneously
     unavailable as free storage — see Decision 6 and `trading-station`'s
     "Sell-Listing Reservation Increases Both Stored and Escrowed
     Together"). For a buy listing, lock credits from available into locked
     — no physical location involved.
2. **Release** (cancel or expiry time): given a listing's remaining
   (unfilled) reservation, undo it.
   - *Goods answer:* decrease the storage bucket's `escrowed` only, leaving
     `stored` unchanged — the tonnage becomes ordinary, withdrawable
     storage in place (`trading-station`'s "Escrow Release Restores Free
     Storage Without Changing Stored"). For a buy listing, decrease
     `creditsLocked`, restoring available.

Invoked by `market-settlement`, at match time (within the settling fill's
own transaction, never as a separately-invoked later step):

3. **MaySettleHere**: given two crossing listings' venues, may this fill
   happen?
   - *Goods answer:* trivially yes — `Reserve` already proved co-location at
     post time, so there is nothing left to check at match time.
4. **Consume** (the resting/sell side): given a fill's quantity, debit it
   permanently from the matched listing's reservation.
   - *Goods answer:* decrease the storage bucket's `stored` **and**
     `escrowed` together, by the filled tonnage — the matter leaves the
     seller's bucket entirely (`trading-station`'s "A Fill Debits Both
     Stored and Escrowed From the Seller's Bucket, Credits the Buyer's
     Stored"). This operation did not exist in this design's first draft;
     without it, decrementing only the listing's `remainingQuantity` field
     left the physical escrow untouched on every fill — a matter-
     duplication defect (adversarial review, B3).
5. **Deliver** (the buy side): given a fill's quantity and the buying
   corporation, place it where the buyer can find it.
   - *Goods answer:* credit the buyer's own station-storage bucket at that
     same venue, as ordinary (non-escrowed) holdings — never the buyer's
     fleet hold, since the buyer need not be present (see Decision 6).

*Alternative considered:* a single "goods" concept baked into the book
schema (a `resourceKind` + `tons` field on every listing), with intel bolted
on later as a parallel, forked schema. Rejected — the venue/`Deliver` seams
this change does establish are still worth having even though `Reserve`
does not fully generalize; a hand-rolled parallel schema would forfeit
those too.

### 2. Venue as opaque scope key, resolving the market.md ↔ goods-market.md contradiction

`market.md` leans toward one global exchange for intel (liquidity at low
population); `goods-market.md` specifies a per-station book (so choke
points stay economically real). These are structurally different shapes,
and papering over the difference with a shared schema that secretly means
"station" everywhere would force intel into goods' shape or vice versa.

**Chosen:** `venue` is an opaque string the book and the matching engine
compare only for equality, never parse or interpret. This version derives
every goods listing's venue deterministically and uniquely from its
station's id (one venue per station, matching the per-station book
`goods-market.md` specifies) and reserves the literal value `global` — a
venue with no physical location — for a future listing type that wants one
global book (matching `market.md`'s leaning). Neither `market-listings` nor
`market-settlement` ever asks "is this venue a station?" — that question,
if it needs answering at all, belongs entirely to a handler.

*Alternative considered:* a `venue` sum type (`{kind: "station", id:
...} | {kind: "global"}`) parsed by the core to decide store/query shape.
Rejected — it reintroduces exactly the coupling the opaque-key design
avoids, and buys nothing: equality comparison and indexing both work
identically on an opaque string.

### 3. Matching engine shape — price-time priority, crossing, partial fills, self-match, and the concurrency model

**Taker-triggered, not a continuous auction.** `market.md` §9's own demand
model ("anyone holding a match fills it in one click") and `goods-sale`'s
existing shape (an active seller matches against best standing demand)
agree: every fill in this game is the synchronous effect of one side taking
an explicit action, never a background process crossing two resting orders
with nobody watching. This is also what keeps settlement "instant, not an
action" (Decision 3 below carries M11's own Decision 3 forward): there is
never a moment where the system decides, on its own initiative, to run a
trade.

**Crossing rule:** a taker order — either `goods-sale`'s plain sale (a
marketable sell, hold-based, always fully fills via the bottomless NPC
floor) or a marketable buy order (`market-settlement`'s "Marketable Buy
Order Fills Against Resting Sell Listings, Limit-Priced," added in
adversarial review, B4 — the original draft named this taker shape but
never specified it, leaving player-to-player trade unreachable) — walks
resting opposing entries at its venue/item, ordered best-price-first
(highest bid for a selling taker, lowest ask for a buying taker), ties
broken by earliest post time — filling each entry's remaining quantity
before moving to the next, until the taker's own quantity is exhausted or
entries run out, **executing each portion at that portion's own resting
entry's price**, never the taker's own price. NPC floor and request
entries (`npc-market-demand`) participate as ordinary standing buy-side
entries in this walk — the floor's bottomless quantity and low price make
it the natural last resort, exactly reproducing M11's existing "request
first, floor for the remainder" behavior as a special case of the general
rule, with zero special-casing in the matching core. **A marketable buy
order requires a caller-supplied limit price** — unlike the sell side,
there is no NPC buyer of last resort's mirror image (no NPC seller of last
resort in this version; NPC stations only buy), so an unbounded buy walk
would sweep the ask side at any price, a real griefing/fat-finger surface a
single troll ask could exploit against a clicking buyer (adversarial
review, B4's second-order finding). No such requirement existed on the
buy side in this design's first draft.

**Partial fills:** allowed, since goods are divisible `float64` tonnage. A
resting listing that only partially fills stays open, its remaining
quantity **reduced by exactly what filled** — never left at its original,
pre-fill quantity (the first draft's requirement text said the opposite of
its own scenario and of this decision — corrected per adversarial review,
B2). A marketable taker order (a plain sell, or a limit-priced marketable
buy) that cannot fully fill is rejected in full, *unless* the venue's
bottomless floor guarantees a fill exists — true for a sell order against
a tradable `(region, kind)` pair (so `goods-sale`'s existing "a plain sale
always fully fills" guarantee survives unchanged), never true for a buy
order, which has no bottomless counterpart on the sell side.

**Self-matching:** rejected. A corporation's own resting listing is skipped
when that same corporation is the taker on the opposing side. This is a
wash-trade and fee-laundering surface today (post a buy at a high price,
sell into it yourself, generate ledger volume and a listing fee with no
real counterparty) and a price-manipulation surface once any future pricing
engine reads the ledger for signal — rejecting it outright is simpler and
safer than trying to distinguish a "legitimate" self-cross from a
manufactured one.

**Ledger entries: one entry per corporate side that has a ledger, per
fill** — never one per taker order, and never a phantom entry minted for a
side with no ledger. A fill against an NPC-sourced entry (the floor or an
open request) appends exactly **one** entry, to the player corporation's
own ledger, since no NPC corporation balance exists to ledger against
(adversarial review, M1: the first draft's "one credit + one debit pair per
fill" SHALL, read literally, demanded a phantom NPC-side entry for every
floor/request fill — which `npc-market-demand`'s own "NPC Standing Orders
Are Exempt From Credit Escrow" already establishes has no corporation to
own it). A fill against a corporation-sourced entry (an open player-posted
listing) appends one entry to *each* side's own ledger — a genuine pair.
A taker order matching three resting entries — say, two NPC-sourced and one
corporation-sourced — therefore produces five entries total (two singles,
one pair), not six (which the literal-pair reading would produce) and not
three (which ignoring the buyer's own ledger would produce). This is forced
by the ledger's own schema (one `unitPrice`/`quantity` per entry — M11's
"Append-Only Trade Ledger" already shows this shape for a single-price
trade) and keeps `corporation-credits`'s per-corporation reconciliation
invariant meaningful for every real participant, never for an NPC that has
no ledger to reconcile.

**Concurrency model — the hot-book risk, and the atomicity commitment it
does NOT relax.** A popular venue's book (say, the one spawn-home station
everyone can already see the moment they clear `rumored`) is a real
Firestore write hotspot: every fill touches the resting listing's
remaining-quantity field, the taker's actor doc, and the counterparty's
balance/storage doc, all in one transaction, and a taker order spanning
several fills touches all of that for every fill it makes. **This design
does not relax `goods-sale`'s and `market-settlement`'s own atomicity
requirements to manage that cost** — a taker order's entire set of fills
commits in ONE settlement transaction, or none of it does; there is no
per-fill-transaction escape hatch. (Adversarial review, M9: an earlier
draft of this paragraph said "one fill, not a whole taker order's worth of
fills, per Firestore transaction attempt where practical," which directly
contradicted `goods-sale`'s MODIFIED "This single transaction SHALL be
opened exactly once" and this design's own Context — "one-transaction
settlement." That escape-hatch language is removed, not reconciled; it was
simply wrong.) The hot-book risk is real and unmitigated by any change to
the data structure here — a taker order that spans many fills is a larger
transaction touching more documents, a genuine scaling risk at high
fan-out on one venue, accepted for this version at expected scale, and
mitigated only by Firestore's own automatic retry-on-conflict (the same
per-document transactional-retry contention `action.ResolveOne` and
`mine-extraction`'s contested-lode resolve already accept for a popular
action or lode). Flagged as a scaling risk below, not solved here.

*Alternative considered:* a server-side in-memory matching engine per venue
(an actor/goroutine owning a venue's book, serializing fills without
per-fill Firestore contention). Rejected for this version — it introduces a
new class of state (in-process, per-instance, lost on restart or instance
rebalance) this codebase's Cloud Run/Firestore shape has deliberately
avoided everywhere else (every other verb's state of record is Firestore
itself); revisit only if the transactional-contention risk proves real at
scale.

### 4. Escrow accounting model — available/locked split on the balance, not a separate escrow ledger

Two shapes were on the table for tracking a buyer's locked credits: (a) a
`creditsLocked` field alongside `credits` on the corporation doc, with
`available` derived as their difference; (b) a separate append-only escrow
ledger, summed at read time, mirroring the trade ledger's own shape.

**Chosen: (a).** `corporation-credits`'s existing Decision 2 already rejects
a fold-on-every-read model for the *trade* ledger specifically because a
corporation's ledger is unbounded and long-lived; an escrow ledger would
have exactly the same unboundedness (every lock and release is another
entry, for the life of the account) with none of the trade ledger's
compensating benefit (audit permanence — an escrow entry has no lasting
audit value once released, unlike a settled trade). A single derived field,
recomputed as `credits − creditsLocked` on every read (never separately
persisted, following the same discipline `fleet-movement`'s derived cargo
capacity already uses), is cheaper, simpler, and needs no reconciliation
invariant of its own: `creditsLocked` is bounded by construction (it can
never exceed `credits`, and every lock/release pair is a paired
increment/decrement on one field, not an accumulating history).

*Alternative considered:* (b), a separate escrow ledger. Rejected — it
buys audit history for a fact (a listing was once escrowed and later
released) that has no player- or economy-facing meaning once resolved, at
the cost of the exact unbounded-fold problem `corporation-credits`'
Decision 2 already argued against for the trade ledger.

### 5. Book freshness — poll vs SSE, given the two recorded SSE defects

`realtime-sse`'s baseline records two live, deployed-environment defects:
the stream token riding in the URL query string (a replayable-credential
exposure via platform logging and browser history), and a hardcoded push
audience (`"flywheel-backend"`) that does not match what Terraform's
Pub/Sub push subscriptions and Cloud Scheduler actually sign
(`"hexaverse-backend"`) — meaning **every deployed-environment SSE
broadcast, including any `ActionCompleted`-shaped completion event, is
inert today.** A market depending on SSE for book freshness would not work
in a deployed environment until that audience constant is fixed — and even
once fixed, `realtime-sse`'s own "Delivery Is Best-Effort, Not Guaranteed"
requirement means any capability depending on it for *correctness* (not
just latency) already has to carry an independent poll/refetch path.

**Decision: M12 takes no SSE dependency.** `market-board-panel`'s existing
polling cadence (M11's "Quote Freshness Via Stated Refresh Cadence")
extends to cover listings and the book with no new mechanism — the same
cadence, the same requirement, just more data riding it. This is not a
compromise unique to this change: it is the same choice M11 already made,
for the same reason, and this change simply does not reopen it. No
`realtime-sse` delta is emitted.

### 6. Station storage model and its per-corporation keying

A per-(station, corporation, kind) storage quantity is the second half of
"goods exist in exactly two places" — the half M11 explicitly deferred
(its own design.md non-goals list names "no unused storage field ships on
the station doc"). This version keys a bucket by station id + corporation
id + resource kind, created on first use rather than provisioned eagerly
(mirroring `system.GetOrCreateInterior`'s own lazy-creation convention) —
so a corporation that never trades at a given station never has a bucket
there at all, keeping "goods exist in exactly two places" testable rather
than implying every corporation has a phantom zero-balance bucket
everywhere.

**Corrected (adversarial review, B1): a bucket is not one number.** The
first draft gave the credits side a first-class `available`/`locked` split
(Decision 4) but gave the goods side only a single `stored` figure, bounded
on withdrawal by "currently stored tonnage." That is the exact axiom
violation this whole change exists to prevent: a seller could post a sell
listing (debiting the hold, crediting `stored`), then immediately withdraw
the same tonnage back into a hold (spec-legal against a single-figure
bucket, since the tonnage really is `stored`), fly away, and leave the
still-open listing to be filled by a buyer against tonnage that no longer
exists anywhere. **Fix: the bucket carries the same `stored`/`escrowed`
split, with `free = stored − escrowed` derived, that Decision 4 already
gives credits** (`trading-station`'s "Per-Corporation Storage Bucket
Carries Stored and Escrowed Components, Derived Free"). A sell-listing
reservation increases `stored` **and** `escrowed` together (the tonnage is
physically present but immediately unavailable as free storage);
withdrawal is bounded by `free`, never `stored` alone
(`trading-station`'s "Withdrawal Is Bounded By Free Storage, Never Total
Stored"); and a fill debits both `stored` and `escrowed` together from the
seller's bucket while crediting the buyer's `stored` (`trading-station`'s
"A Fill Debits Both Stored and Escrowed From the Seller's Bucket, Credits
the Buyer's Stored" — this is also the `Consume` operation Decision 1 now
names). The exploit above is closed: `free` is zero the instant the
listing posts, so the withdrawal that would duplicate the matter is
rejected outright.

**A buyer need not be present to receive goods.** Settlement delivers a
fill directly into the buying corporation's storage bucket at the venue's
station, as ordinary (non-escrowed) `stored` holdings (Decision 1's
`Deliver` answer for goods) — never into a fleet's hold, since the buying
corporation may have no fleet anywhere near the venue at settlement time.
Collecting the goods (loading them into a hold to haul away) is a separate,
later, docked-fleet operation (`trading-station`'s "Withdraw From Storage
Into Hold While Docked" — retitled "Withdrawal Is Bounded By Free Storage,
Never Total Stored" per the B1 fix above).

**The Firestore named-string-key hazard applies here exactly as it does to
`fleet.Fleet.Cargo`:** a storage bucket keyed by the raw `system.ResourceKind`
named string type would hit the same `cloud.google.com/go/firestore` SDK
panic `backend/fleet/model.go`'s own comment documents. The implementation
keys by the string form of the resource kind (`string(kind)`), converting at
the API boundary exactly as `fleet.Fleet.Cargo` already does — this is a
code-level note for the implementer, not a spec requirement, since the spec
only constrains observable behavior (a bucket's contents by kind), never
the storage representation.

**Storage capacity — chosen explicitly, not left implied.** `goods-market.md`
leans unlimited in v1, but unlimited storage interacting with escrow-on-post
and auto-expiry needs reasoning, not silence: could an attacker (or just an
active trader) grow a station's storage without bound? Working through it:
a *cancelled or expired sell listing's release* never grows `stored` — it
only decreases `escrowed`, restoring `free` in place
(`trading-station`'s "Escrow Release Restores Free Storage Without Changing
Stored"). A *buy listing's* post-time reservation locks credits, not goods
— no storage growth at post. **Corrected (adversarial review, M13): there
are three paths that grow a bucket's `stored`, not two** — a deliberate
player deposit (bounded by that fleet's own finite, capacity-limited hold),
a settled fill's delivery (bounded by whatever finite quantity a resting
listing or taker named), and **a sell-listing's own post-time reservation**
(bounded by the posting fleet's held tonnage) — the first draft's Decision
6 claimed only the first two exist, which was false the moment `Reserve`'s
goods answer was specified to move tonnage into `stored` at all (a fact
this same decision states two paragraphs above). All three are checked
against capacity (`trading-station`'s "Storage Capacity Binds Total Stored
Tonnage," corrected to name all three paths explicitly) — none is unbounded
in a single step, but an account could still deposit, withdraw nothing, and
repeat indefinitely to accumulate an arbitrarily large resident balance
over many separate hauls. **Decision: ship a configured per-(station,
corporation) capacity (`market.Params.StorageCapacityTons`, summed across
all kinds, mirroring a fleet's own shared-hold-across-kinds shape),
defaulted to an effectively unlimited value in this version** — following
the exact "unlimited value, specified reject-in-full binding behavior"
shape M11's NPC budget/absorption knob already established, so the limit
is real and testable (via a fixtured finite value) even though it never
binds in ordinary v1 play.

*Alternative considered:* truly no capacity concept at all (the doc's
literal "leaning unlimited"). Rejected — "leaning unlimited" is a fine
tuning-time *value*, but an actual absence of any enforcement mechanism
means there is nothing to raise later without a schema change, the exact
"fill-in-the-blank later" trap `trading-station`'s `ownerCorpId` field was
designed from day one to avoid for station ownership. A knob shipped at
"unlimited" costs nothing now and avoids that trap.

### 7. Expiry and the triple-race (cancel / settle / expire)

**Provenance, addressed directly (adversarial review's M12 finding, RULING
A):** `goods-market.md`'s M12 paragraph never asks for listing expiry — it
is imported from `market.md` §5, where auto-expiry exists to keep *intel*
listings fresh, a concern this change explicitly does not own. That
critique of provenance is fair: expiry is invented scope for goods, not a
requirement traced to the accepted design doc. **Ruling: keep it anyway.**
Removing it strands escrowed goods and locked credits forever the moment a
poster stops checking their listing — a real, unbounded-state defect
`goods-market.md` simply never considered, since it never anticipated a
listing sitting open indefinitely. Keeping expiry closes that gap; the
honest cost of doing so is the triple-race machinery below, which exists
*because* expiry exists. This is flagged to Travis, in `proposal.md`'s
Scope caveat and here, as invented-but-justified scope, with its window
value (`market.Params.ListingExpiryWindow`) deliberately left unset — a
tuning decision, not a design one. **The gap the adversary correctly named
as still-open — no player-facing surface told a player their listing had
expired — is closed** by `market-listings`'s "Owner's Own-Listings Read,
Including Recently Terminal" and `market-board-panel`'s "Terminal Listing
Status Surfaced To Its Owner" / `hex-board-view`'s "Cancel Own Listing From
the Board" (both now sourced from that read): a player who posted a listing
that later expired sees it, marked `expired`, with copy explaining the fee
was spent and the reservation released — not silence.

Three things can act on one listing's remaining escrow: an owner's explicit
cancel, an opportunistic expiry check (triggered by any read that touches
the listing, per Decision 12's read-triggered-resolution precedent from
M11), and a taker's fill. All three commit through the same document's
transaction, so Firestore's own single-document transactional isolation is
the actual enforcement mechanism: **`market-listings`'s "Terminal-State
Transition Is Exactly-Once" requirement specifies the observable contract**
(a compare-and-set keyed on still-`open` status; whichever of the three
commits first wins, every other one observes the resulting state and
either no-ops (if the entire remaining quantity is already gone) or applies
correctly against what's left (if a fill only partially consumed a listing
before a racing cancel/expiry claims the remainder)). No new locking
primitive is introduced — this is exactly the same compare-and-set-on-status
discipline `action.ResolveOne`'s `if a.Status != StatusRunning { return nil
}` guard already uses for actions, generalized to three possible actors
instead of one resolver.

**A fourth transition, added in review (adversarial review, M8): zero
remaining quantity also drives a terminal transition.** The first draft
never stated what makes a listing become `filled` — an implementation could
legally decrement `remainingQuantity` to zero and leave `status: "open"`
forever, resting on the book and matching repeatedly for zero-quantity
fills. `market-listings`'s "Zero Remaining Quantity Transitions a Listing to
Filled" now states this explicitly, in the same transaction as the fill
that exhausts it.

**Where does a fill leave a partially-filled, still-open listing that then
gets cancelled?** Only its *remaining* reservation releases — the portion
already delivered to a buyer (or already converted to credits, for a sell)
is gone, settled, and untouched by the later cancel. This is why
`market-listings`'s "Auto-Expiry" and "Cancel Releases the Reservation"
both explicitly scope their release to "remaining quantity," not "original
quantity."

**A rounding-residue corollary to the `filled` transition (adversarial
review, M2):** a buy listing's lock is computed once, at post, from its
full original quantity; each fill's own proceeds round down independently,
so the sum actually debited across several fills can fall short of the
original lock by a small, accumulated residue. Since `filled` is a terminal
state with no further cancel path (see `market-listings`'s "Cancelling a
fully filled listing is rejected, since nothing remains to release"), that
residue would otherwise sit in `creditsLocked` forever, ratcheting up
across a corporation's trading life and permanently shrinking `available`
by a growing, invisible amount. `market-listings`'s "Residual Locked
Credits Release On the Filled Transition" closes this: any residue is
released back to available in the same transaction as the `filled`
transition itself, so by the time anyone could try to cancel a filled
listing, there is truly nothing left — not merely assumed to be nothing
left, as the first draft silently assumed.

### 8. Fee scale and why the sink is structured the way it is

`market.md` leaves this open ("flat, or proportional to asking price /
freshness?"). For goods specifically, a flat fee alone would be
regressive — a listing fee that costs the same whether it lists 1 ton or
10,000 tons taxes small trades far harder proportionally than large ones,
discouraging exactly the kind of frequent, small-margin arbitrage hauling
the design doc's "spot the spread" loop depends on. A pure proportional
fee, on the other hand, lets a near-zero-value listing (a tiny quantity at
a tiny price) round to a near-zero fee, which is exactly the "spam
low-value junk listings" failure mode `market.md`'s own §5 names the fee as
existing to prevent.

**Decision: the fee is `max(ListingFeeMinimum, floor(ListingFeeRate ×
quantity × unitPrice))`** — proportional for anything above the minimum's
break-even point, flat-floored below it. **The order is pinned explicitly
(adversarial review, minor finding): the proportional term is floored
first, then the maximum is taken against the (already-whole-credit)
minimum** — never `floor(max(minimum, proportional))`, which reads
identically in prose but is a different function whenever the unrounded
proportional term falls strictly between the minimum and the next whole
credit above it. `market.Params.ListingFeeMinimum` is additionally
constrained to at least 1 whole credit (an invalid, zero-valued
configuration is rejected), which closes a second gap the first draft left
open: a zero minimum paired with a proportional term that floors to zero
(a small enough quantity × price) would otherwise mint a zero-amount
`listingFee` ledger entry, violating `corporation-credits`'s unmodified
"No amount recorded for a credit mutation SHALL ever be zero." This mirrors
`corporation-credits`' existing rounding philosophy (round in the direction
that never over-collects — here, "never charge more than the computed
proportional fee," the sink-side mirror of M11's "never pay out more than
the computed floor price") while still guaranteeing every listing pays
*something* real, closing the "infinite fractional-cent listings" loophole
a pure-proportional, no-floor fee would leave open. The fee is charged
exactly once, at post, on the listing's full original quantity —
never re-charged or refunded as fills happen, consistent with "escrow,
cancel, and settlement are all instant" and with the fee being a sink, not
a per-trade toll.

*Alternative considered:* fee scaled by freshness/time-open (a later fee for
a longer-resting listing). Rejected for this version — `goods-market.md`
never asks for it (only `market.md`'s intel-side open question raises
"freshness" at all, and intel freshness is a valuation concept this change
does not own), and it would make the fee a second, redundant discourager of
long-resting inventory alongside the expiry window, for no clearly named
benefit.

## Risks / Trade-offs

- **Hot-book contention at a popular venue** (Decision 3). Every fill is a
  transaction touching the resting listing, the taker's actor doc, and the
  counterparty's balance or storage doc; a single spawn-home station every
  corporation can already see is a plausible hotspot. Accepted at this
  version's expected scale, mitigated only by Firestore's own
  retry-on-conflict; flagged as a real scaling question if trade volume at
  one venue grows large.
- **Unbounded number of small, fee-minimum listings** (Decision 8). A
  flat-minimum-floored fee still permits an attacker to post many
  near-zero-value listings, each paying the same minimum fee, to grow
  storage-bucket or book-read cost without materially enriching the sink
  per listing. Not separately rate-limited by this change beyond whatever
  quota M11's revision establishes for credit-mutating routes (see the
  `request-authorization` note in proposal.md); flagged, not solved.
- **A living corporation's home-station listings as a location signal**
  (carried forward from M11's own Decision 6, now sharper): since every
  spawn home already has an NPC station visible at `rumored`, and this
  change makes that same station's book of *player* listings equally
  visible, a corporation's own buy/sell activity at its home venue is now
  additionally disclosed (not just the NPC floor/request presence M11
  already flagged). Accepted as the same DECIDED remote-visibility
  trade-off M11 already accepted, sharpened by this change; not mitigated
  here.
- **No SSE dependency means a stale-book race is always possible between a
  client's last poll and its next action** (Decision 5). Mitigated the same
  way M11 mitigated it for the sell verb: an optional slippage-style guard
  is available at the taker's request (mirroring `goods-sale`'s existing
  "Optional Expected-Price Slippage Guard"), but is not mandatory — a
  client that skips it simply settles at whatever the transactional re-read
  finds current.
- **A marketable buy order has no bottomless backstop** (Decision 3, `B4`
  fix). Unlike a plain sell (always fills via the NPC floor), a marketable
  buy order can be rejected in full for lack of sell-side liquidity, even
  within its limit price — this is correct and intended (there is no NPC
  seller of last resort in this version), but it means the buy side of the
  exchange is genuinely less reliable than the sell side for a player who
  wants to guarantee a purchase. A player who wants certainty should post a
  resting buy listing instead (which persists until filled, cancelled, or
  expired) rather than repeatedly retrying a marketable order. Not
  mitigated further here — the asymmetry is a direct, accepted consequence
  of "NPC stations only buy" (`docs/plans/goods-market.md`).
- **`Reserve`'s goods-shaped model, and the finite-quantity book schema, do
  not cleanly generalize to a copyable good** (Decision 1, corrected per
  adversarial review RULING B). This is a real, open design gap for
  whenever the intel market is built — not a defect in this change (which
  explicitly does not build intel), but a debt this change's "the intel
  market is this machinery with a new listing type" framing should not be
  read as having already discharged. Flagged in Open Questions, not solved
  here.

## Migration Plan

- `corporations/{corpId}` documents gain one field, `creditsLocked`
  (int64), absent on every pre-existing document (including one only just
  healed by M11). Absent SHALL be treated as zero (no open escrow) — unlike
  M11's own `credits` field, there is no "never granted" ambiguity here,
  since `creditsLocked` has no grant event of its own; it only ever moves
  in step with an escrow lock or release this change introduces.
- A new per-(station, corporation, kind) storage store is additive, with no
  backfill: M11 shipped no storage field at all (its own explicit
  non-goal), so every bucket starts empty and is created lazily on first
  use, per Decision 6 — there is nothing to migrate *from*.
- `market-listings` and its supporting collections (listings themselves,
  keyed for idempotent post/cancel) are wholly new, additive collections.
- No schema change to `system.Feature`, `SystemInterior`, `action.Action`,
  or `action.Delta` — this change registers no `action.ResolveFunc` and
  rides no channel slot, per the "listing, escrow, cancel, and settlement
  are all instant" constraint (continuing M11's own Decision 3 reasoning:
  a listing or a fill has no elapsed-time mechanic of its own — the time
  cost was already paid by whatever haul got the goods to the venue in the
  first place).
- New Firestore collections (the storage store, the listings collection)
  are registered in `CleanupFirestoreTestData()` per house convention.
- No new Pub/Sub topic or event type, no new Terraform (no scheduler, no
  new index beyond what the implementer confirms against
  `firestore-indexes.tf` for the new per-venue listing queries) — per
  Decision 3 (no background matching process) and Decision 5 (no SSE
  dependency).

## Open Questions

*(Carried forward per this house's own discipline — proposed answers, not
silently resolved by fiat; each needs Travis's confirmation.)*

- **Matching rule — price-then-time priority** (Decision 3): proposed as
  the standard, well-understood shape; confirm, or flag a different
  priority rule (e.g. quantity-weighted) as wanted.
- **Partial fills** (Decision 3): a marketable order rejects in full if it
  cannot be fully filled (unless the bottomless floor guarantees a fill); a
  resting listing simply stays open at its reduced remaining quantity.
  Confirm this asymmetry (taker vs. resting) is the intended shape.
- **Self-matching is rejected** (Decision 3): confirm this is the right
  call rather than allowing it (some real exchanges do allow self-trades,
  accepting the wash-trade risk as a cost of simplicity); this design
  argues rejection is worth the extra check given the ledger's future role
  as pricing-engine input.
- **Listing expiry window** (Decision 7): `market.Params.ListingExpiryWindow`
  is a named, configured, tuning-time value — no number is proposed here,
  per the same discipline `mine-extraction`'s and M11's own tuning numbers
  followed.
- **Fee scale — proportional with a flat minimum floor** (Decision 8): the
  design doc leaves this open; this change proposes an answer rather than
  restating the question. Confirm the proportional-with-a-floor shape, or
  flag a preferred alternative (pure flat, pure proportional, or a
  freshness-scaled fee).
- **Station storage capacity — a configured, effectively-unlimited-by-default
  cap** (Decision 6): confirm shipping the knob (even unused) is wanted, or
  flag that true unlimited (no field at all) is preferred for v1, accepting
  the schema-retrofit cost later if scarcity ever becomes a real lever.
- **Storage ownership keying — per (station, corporation, kind)** (Decision
  6): confirm this is the right grain, versus (for example) a single
  aggregate figure per (station, corporation) with no per-kind breakdown
  (simpler, but loses the "what exactly is sitting there" readout the
  facts panel would want).
- **No SSE dependency for book freshness — poll only** (Decision 5): this
  change accepts M11's existing polling cadence rather than fixing
  `realtime-sse`'s two recorded defects or building a new push path.
  Confirm this is acceptable for M12's demo, or flag that the audience-
  mismatch defect should be fixed as a prerequisite (it is a one-constant
  fix, tracked in `request-authorization`'s own baseline, not part of this
  change).
- **`request-authorization` quota join — resolved.** M11's landed revision
  adds "Per-Corporation Write Quota on Credit-Mutating Routes," scoped by
  its own text to "credit-mutating... and any future route that appends a
  trade-ledger entry." `market-listings`' post route (buy or sell) always
  appends a `listingFee` ledger entry, so it already falls inside that
  scope unmodified — no delta needed for it. Its cancel route, however,
  mutates the locked/available balance split with **no** ledger entry, so
  it falls outside the quota's literal text; this change adds one small
  ADDED requirement (`request-authorization`'s "Escrow-Mutating Routes With
  No Ledger Entry Also Join the Per-Corporation Write Quota") extending the
  same bucket to cover it, rather than leaving a same-corporation-scoped,
  equally spoofable-by-IP write surface uncovered. `trading-station`'s
  deposit and withdraw routes mutate no credit balance at all and
  deliberately do NOT join this quota — they rely on the general per-IP
  tier alone, the same choice M11's own Decision 9 already made for
  `goods-sale`'s sell route on the same reasoning (an ordinary,
  non-credential, non-enumeration gameplay mutation).

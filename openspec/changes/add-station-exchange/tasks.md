## 1. Contracts and data model

- [ ] 1.1 Define the item-type handler interface (`Reserve`, `MaySettleHere`,
      `Deliver`) and its registration seam (mirroring `action.RegisterResolver`)
      in a new `backend/market/` package family — covers `market-listings`'
      "Item Type and Item Reference Are Opaque to the Book" and
      `market-settlement`'s "Item-Type Handler Seam"
- [ ] 1.2 Define the `Listing` model (`venue`, `side`, `itemType`, `itemRef`,
      `quantity`, `remainingQuantity`, `unitPrice`, `status`, `ownerCorpId`,
      `postedAt`, operation key) and the reserved `global` venue constant —
      covers `market-listings`'s "Venue Is An Opaque Scope Key"
- [ ] 1.3 Extend `market.Params` (or the M11-established params struct) with
      `ListingFeeRate`, `ListingFeeMinimum`, `ListingExpiryWindow` (per item
      type), and `StorageCapacityTons` — covers "Every Listing Knob Is
      Configuration" and `trading-station`'s capacity knob
- [ ] 1.4 Add `creditsLocked` to the corporation model and the
      lock/release/settle-transfer primitives in `corporations/` — covers
      `corporation-credits`'s locked-balance requirements
- [ ] 1.5 Add the per-(station, corporation, kind) storage store, keyed by
      the string form of `system.ResourceKind` (never the named type — see
      `backend/fleet/model.go`'s existing comment on the Firestore panic
      hazard) — covers `trading-station`'s storage requirements
- [ ] 1.6 Register the new collections (listings, storage buckets) in
      `common.CleanupFirestoreTestData()`

## 2. Listing lifecycle (`market-listings`)

- [ ] 2.1 Post: validate quantity/price, invoke the posting side's `Reserve`,
      charge the listing fee, create the listing atomically or not at all —
      covers "Post Requires Positive, Finite Quantity and Unit Price", "Post
      Reserves the Posting Side's Resource Before the Listing Exists",
      "Listing Fee Charged At Post..."
- [ ] 2.2 Idempotent post by operation key — covers "Idempotent Post By
      Operation Key"
- [ ] 2.3 Cancel: ownership check (404 before any other precondition),
      release via the handler, compare-and-set to `cancelled` — covers
      "Cancel Requires Listing Ownership...", "Cancel Releases the
      Reservation, Never Twice"
- [ ] 2.4 Auto-expiry, triggered opportunistically on read/operation touch,
      keyed by configured window — covers "Auto-Expiry After a Configured
      Window..."
- [ ] 2.5 Terminal-state compare-and-set shared by cancel/expiry/fill —
      covers "Terminal-State Transition Is Exactly-Once"
- [ ] 2.6 Fog-gate listing/book reads on the existing minimum-visibility
      tier, 404 below it — covers "Listing and Book Reads Are Fog-Gated..."

## 3. Matching and settlement (`market-settlement`)

- [ ] 3.1 Taker-order walk: resolve resting opposing entries (book listings
      + NPC floor/request standing entries) by price-then-time priority —
      covers "Taker Order Walks Resting Opposing Listings..."
- [ ] 3.2 Self-match skip — covers "Self-Match Is Rejected"
- [ ] 3.3 Partial-fill and remainder handling for both marketable and
      resting orders — covers "Partial Fills Are Allowed..."
- [ ] 3.4 One ledger entry pair per fill, all preconditions re-read inside
      the settlement transaction, exactly-once decrement under concurrent
      takers — covers "One Ledger Entry Pair Per Fill", "All Preconditions
      Are Re-Read...", "Exactly-Once Settlement Under Concurrent Takers"
- [ ] 3.5 Reservation consumption wired to `market-listings`'s
      terminal-state CAS — covers "A Fill Never Double-Releases a Listing's
      Reservation"
- [ ] 3.6 Input/arithmetic guards (no negative/zero/NaN/infinite; overflow
      safety) and distinguishable rejection reasons — covers the remaining
      `market-settlement` requirements

## 4. NPC book integration (`npc-market-demand`, `goods-sale`)

- [ ] 4.1 Project the floor and open requests as standing buy-side entries
      into the matching walk (read-time adapter, no new stored listing docs)
      — covers "NPC Floor and Requests Ride the Unified Book..."
- [ ] 4.2 Confirm no credit-lock path exists for the NPC side of a fill —
      covers "NPC Standing Orders Are Exempt From Credit Escrow..."
- [ ] 4.3 Extend `goods-sale`'s existing demand-entry fold (M11's own
      generalized "Settlement Folds Tonnage Across a Venue's Ordered Demand
      Entries") to admit corporation-sourced entries (open player buy
      listings) alongside NPC-sourced ones, excluding a selling
      corporation's own open buy listing from its own fold — covers
      goods-sale's two MODIFIED requirements
- [ ] 4.4 Regression-test M11's existing goods-sale scenarios (fold order,
      applied-price reporting, rounding, contention retry, slippage guard)
      with no open player listings present, to confirm the fold's
      NPC-only behavior is byte-identical to before this change

## 5. Station storage (`trading-station`, `fleet-movement`)

- [ ] 5.1 Deposit-into-storage and withdraw-from-storage verbs, docked and
      ownership preconditions, idempotent by operation key — covers
      `trading-station`'s deposit/withdraw requirements
- [ ] 5.2 Wire `fleet.Cargo` debit/credit for deposit, withdrawal, and
      sell-listing-escrow, alongside the existing mine-credit and
      sale-debit paths — covers `fleet-movement`'s MODIFIED "Fleet Cargo
      Pool" (its full restated body, including M11's own paths)
- [ ] 5.3 Escrow release lands back in the same storage bucket, never a
      fleet's hold — covers "Escrow Release Un-Escrows Within the Same
      Storage Bucket..." and the corresponding fleet-movement scenario
- [ ] 5.4 Owner-only storage disclosure, existence hidden — covers "Storage
      Disclosure Is Owner-Only..."
- [ ] 5.5 Storage capacity enforcement (reject-in-full against a fixtured
      finite value; unlimited default) — covers "Storage Capacity Is
      Configured and Enforced..."

## 6. Price board and panel (`market-price-board`, `market-board-panel`)

- [ ] 6.1 Extend the price-board read to include open player listings and a
      best-bid/best-ask summary per venue/kind — covers both ADDED
      `market-price-board` requirements
- [ ] 6.2 Update `market-board-panel`'s ranked list to a three-row-kind
      display (request, floor, player listing) ordered by price across all
      three — covers the MODIFIED "Ranked Quote List By Kind"
- [ ] 6.3 Add post-buy-listing (remote, no fleet required) and cancel-any-
      own-listing UI to the panel, with fee/escrow preview — covers the
      three ADDED `market-board-panel` requirements

## 7. Board UI (`hex-board-view`)

- [ ] 7.1 Add the post-sell-listing offer and commit on the docked fleet's
      panel, mirroring `Sell Offer`/`Sell Commit` — covers "List Offer on
      the Docked Fleet", "List Commit"
- [ ] 7.2 Add cancel-own-listing on the board (fleet panel or station facts
      panel) — covers "Cancel Own Listing From the Board"

## 8. Cross-cutting integrity

- [ ] 8.1 Concurrency tests for the triple race: cancel-vs-fill,
      expiry-vs-fill, cancel-vs-expiry, each against the same listing —
      covers `market-listings`'s and `market-settlement`'s exactly-once
      requirements together
- [ ] 8.2 Concurrency tests for two takers racing one resting listing
      (never oversold) and two concurrent posts/cancels with the same
      operation key (never double-applied)
- [ ] 8.3 Fuzz/boundary tests for quantity and price validation (zero,
      negative, NaN, infinite, extreme magnitude) across post and fill
- [ ] 8.4 End-to-end regression: the full M11 demo (mine → haul → dock →
      sell at floor → spot a request → haul → sell) still passes unchanged
      after the unified book lands
- [ ] 8.5 End-to-end new-slice test: post a sell listing → a second
      corporation buys against it remotely (no fleet present) → the seller's
      credits and the buyer's station storage both reflect the fill → the
      buyer later docks and withdraws into a hold

## 9. Wiring

- [ ] 9.1 Register the goods item-type handler at `backend/router.go`
      construction time
- [ ] 9.2 Wire new routes (post/cancel listing, deposit/withdraw storage)
      into the authorized route group; post and cancel join M11's
      per-corporation write quota bucket (post already qualifies by
      appending a `listingFee` ledger entry; cancel joins via this change's
      own `request-authorization` addition) — deposit/withdraw join only
      the general per-IP tier, per design.md's resolved Open Question
- [ ] 9.3 `terraform fmt`/index review: confirm no new Firestore composite
      index is needed beyond what the new per-venue listing queries require,
      against `firestore-indexes.tf`

## Why

M11 (`add-credits-and-npc-market`) closes the mine → sell loop against a
single, fixed NPC counterparty — a pure faucet with nowhere for credits to
go. `docs/plans/goods-market.md` (2026-07-30, DECIDED) names M12 as the
milestone that turns that one-buyer floor into a real exchange: players post
buy and sell listings, escrow makes a listing honest before it can be seen,
settlement moves goods and credits in one transaction, and the listing fee
becomes the economy's first credit sink. This is also the one place the
design doc is explicit about a future dependency: `market.md`'s intel market
is "this machinery with a new listing type," so M12 is the milestone where
the exchange's shape either survives that dependency or has to be rewritten
for it. Every requirement here is written so a future intel handler can plug
into the same book without moving a line of the matching or settlement core.

**M12 depends on M11 being archived first.** `market-listings` and
`market-settlement` are new capabilities; `corporation-credits`,
`trading-station`, `npc-market-demand`, `market-price-board`, `goods-sale`,
and `market-board-panel` are M11 capabilities this change layers onto. Until
M11 archives, those capability names exist only as another change's deltas,
not as specs. This change's MODIFIED deltas are written against M11's
now-landed, final revision (its `goods-sale` demand-entry-fold restructure,
its `request-authorization` per-corporation write quota, and its otherwise
unchanged `fleet-movement` "Fleet Cargo Pool") — re-synced once, after M11's
revision completed; no further re-sync is expected unless M11 changes again
before archiving.

## What Changes

- Add **`market-listings`**: an item-type-**agnostic** order book over
  `{venue, side, itemType, itemRef, quantity, unitPrice}` — post, escrow,
  cancel, fee, and fog-gated read. `venue` is an opaque, equality-only scope
  key (a reserved `global` value exists for a future non-station listing
  type; this version derives every goods venue deterministically from a
  station id). Posting reserves the posting side's resource (a seller's
  hold tonnage into station storage; a buyer's credits from available into
  locked) **before** the listing exists, in one transaction — never a
  partially-reserved listing. A configured, proportional-with-a-minimum
  listing fee is charged once at post and never refunded. A configured
  expiry window auto-releases an unfilled listing's escrow exactly as a
  cancel does. Nothing in this capability names tons, holds, or stations.
- Add **`market-settlement`**: the matching rule and the one-transaction
  fill. A taker action (never a background process) walks resting opposing
  listings — NPC floor and requests included, as standing book orders — by
  **price-then-time priority**, filling across as many entries as it takes,
  rejecting self-matches, allowing partial fills, and appending one ledger
  entry pair per fill. Every item-type-specific question (delivery, and
  whether the two sides may settle at this venue) is delegated to a
  **per-item-type handler**, registered at wiring time (the precedent is
  `action.RegisterResolver`); the core names no physical quantity. This
  version registers one handler, for goods, whose "may settle here" answer
  is trivially satisfied because a goods listing's physical co-location was
  already established at post-time reservation, not re-checked at match.
- **MODIFIED**: `corporation-credits` (adds a `creditsLocked` field and the
  lock/release/settle-transfer primitives an escrow needs, plus the
  `listingFee` sink entry kind — the "Materialized Credit Balance" and
  reconciliation requirements are untouched: `credits` stays the fold-checked
  total, `creditsLocked` is a new, additive component); `trading-station`
  (adds a per-(station, corporation) storage bucket, a configured capacity
  shipped effectively unlimited, and the deposit/withdraw verbs a docked
  fleet uses to move tonnage between its hold and that bucket); `goods-sale`
  (M11's own landed revision already generalized settlement to a
  price-descending fold over a venue's "demand entries," the floor as one
  entry of last resort, with no NPC-specific branch — this change's genuine
  addition is that a demand entry's `source` may now also be a corporation's
  own open player-posted buy listing, joining the same fold, excluded from
  a self-match); `market-board-panel` (the ranked quote list now shows
  player listing rows alongside request and floor rows, plus new
  post-buy-listing and cancel-any-own-listing UI — buy listings and cancels
  need no fleet present, since credits are bytes); `hex-board-view`
  (ADDED-only: post-sell-listing and cancel-own-listing on the docked
  fleet's panel, mirroring `Sell Offer`/`Sell Commit`'s shape); `fleet-movement`
  ("Fleet Cargo Pool" is unchanged in M11's landed revision from what this
  change originally read — this delta restates its complete, still-current
  body plus M12's own storage load/unload and listing-escrow debit paths,
  so neither change's behavior is silently dropped when both eventually
  archive); `npc-market-demand` (ADDED-only: the floor and requests are
  reframed as standing entries in the unified book, exempt from credit
  escrow since the existing budget/absorption knob already bounds them);
  `market-price-board` (ADDED-only: the aggregate read gains player listings
  and a best-bid/best-ask summary alongside NPC quotes).

**Scope caveat**: M12 does **not** ship the intel market (`market.md`) — it
ships the machinery that market is designed to ride later, with the explicit
architectural discipline that no goods-specific concept (`stationId`, `tons`,
`hold`) may leak into the matching or settlement core. M12 does not ship
player-built stations, dynamic/algorithmic pricing, a jump-gate or toll mass
network, fuel, refining, or the build verb. It does not ship a live push
(SSE) dependency for book freshness — the price board and the book both stay
on a stated polling cadence, because `realtime-sse`'s baseline currently
records two live defects (the stream token riding in the URL query string,
and a hardcoded push-audience mismatch that 401s every deployed Pub/Sub
delivery) that would make an SSE-backed book unreliable in a deployed
environment today; fixing those defects is out of scope here. It does not
ship a continuous double-auction matching daemon — every fill is triggered
by an explicit taker action, never two resting listings crossing on their
own with no request in flight.

## Impact

- Affected specs (ADDED): `market-listings`, `market-settlement`.
- Affected specs (MODIFIED): `corporation-credits` (new escrow/locked-balance
  requirements, additive), `trading-station` (new storage requirements,
  additive), `goods-sale` ("One Atomic Transaction — Hold Debit, Balance
  Credit, Ledger, Request Decrement", "Settlement Folds Tonnage Across a
  Venue's Ordered Demand Entries"), `market-board-panel` ("Ranked Quote List
  By Kind" MODIFIED, plus new listing/cancel UI requirements ADDED),
  `fleet-movement` ("Fleet Cargo Pool"), `npc-market-demand` (new
  requirements, additive), `market-price-board` (new requirements,
  additive), `hex-board-view` (ADDED-only new requirements),
  `request-authorization` (ADDED-only: one requirement extending M11's new
  per-corporation write quota to `market-listings`' cancel route, which
  appends no ledger entry and so falls outside that quota's own literal
  text — see design.md's resolved Open Question).
- **Not affected**: `realtime-sse` (no delta — this change takes no SSE
  dependency; book and price-board freshness stay on the existing stated
  polling cadence, see design.md Decision 5).
- Affected code: a new `backend/market/` extension for the listing/settlement
  engine and the item-type handler registry (registered at
  `backend/router.go` wiring time, mirroring `action.RegisterResolver`);
  `backend/corporations/` (the `creditsLocked` field and lock/release/
  settle-transfer primitives); `backend/fleet/` (`Cargo` debit paths for
  listing escrow and storage deposit, credit path for storage withdrawal);
  a new per-(station, corporation) storage store under `backend/market/` or
  `backend/trading-station/` (owning domain to be confirmed against M11's
  final package layout); `backend/common/firestore_test_helpers.go` (new
  collections registered in `CleanupFirestoreTestData`). Frontend:
  `frontend/lib/types/`, `frontend/lib/services/`, `frontend/hooks/`,
  `frontend/components/market/` (listing/cancel UI, book display),
  `frontend/components/board/` (docked-fleet list/cancel offer).

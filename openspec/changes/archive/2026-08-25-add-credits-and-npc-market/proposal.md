## Why

The first vertical slice ends at mine — ore fills a hold and then goes
nowhere. `docs/plans/goods-market.md` (2026-07-30, DECIDED) closes that loop
for M11: a materialized credit balance, an NPC trading station at every
spawn home, and a remotely-visible price board that turns "ore sells for X
here, X+40% three lanes over" into a travel decision. Every prerequisite
already exists — mine gives fleets cargo, fleet-movement gives docking,
corporation-spawn gives a home system — but there is no currency, no place
to sell, and no NPC willing to buy. This is real forward work, not a
retrofit.

## What Changes

- Add **`corporation-credits`**: a materialized integer `credits` balance on
  the corporation doc, mutated only inside a transaction that appends a
  matching entry to an append-only trade ledger — a deliberate,
  user-approved deviation from `action-dispatch`'s fold-of-deltas pattern
  (a credit balance accrues entries forever; folding every read doesn't age
  well) — paired with a reconciliation invariant (ledger fold == stored
  balance, with a countable divergence signal) so the deviation stays
  testable. Idempotent by client-supplied operation key; instant and
  location-independent (no action, no slot, no ETA); owner-only disclosure.
- Add **`trading-station`**: an NPC-owned (`ownerCorpId` unset) station
  provisioned as a spawn-home asset — one per home system, idempotently, at
  a deterministic non-core, off-gate-ring, **orbiting** position (reversed
  from an earlier "fixed" draft — see design.md Decision 4), prograde with
  the system's dominant orbital direction — a dockable,
  non-mineable board feature visible on the very first board read (no scan
  required), gated below that by a configured minimum graph tier rather than
  sensor coverage. Splices into the system-interior read at the service
  seam (`system.Service.GetOrCreateInterior`, not the handler — the seam
  `fleet.resolveFeature` itself reads through) and degrades to "no station"
  rather than failing the whole interior read if the station store is
  unavailable.
- Add **`npc-market-demand`**: static per-region floor prices for the mine
  `ResourceKind`s, plus station-specific, quantity-limited premium requests
  provisioned by a deterministic, params-driven mechanism (no pricing
  engine — data-driven request entries, per the design doc). Budget/
  absorption knobs ship unlimited but with specified, testable binding
  behavior (reject-in-full, never a silent clamp) so the hook isn't dead on
  arrival. Pricing never responds to trade activity in this version.
- Add **`market-price-board`**: one remotely-visible read aggregating every
  visible station's live quotes (never frozen at an observation's `asOf` —
  market data is information, not feature composition), gated by a
  configured minimum graph tier (default `rumored`).
- Add **`goods-sale`**: the instant settlement verb — sell from the hold
  while docked at a station, settling by folding the sold tonnage across
  the venue's ordered demand entries (uniform `{unitPrice, remainingQuantity,
  source}` entries; the NPC floor modeled as the entry of last resort, not
  a fallback branch) in price-descending order — **not** "sell to the
  NPC"; M12's exchange adds player asks to the same uniform entry list
  under the same opaque venue key without forking this path. One atomic
  transaction, opened once by the sale service and composed of narrow,
  transaction-scoped primitives the owning domains implement (hold debit,
  balance credit, ledger append, request decrement — see design.md
  Decision 16), with every precondition re-evaluated against a
  transactional re-read, never against a pre-transaction one; idempotent
  by a corporation-scoped, format-constrained operation key; an optional
  expected-first-ton-price AND expected-minimum-total-proceeds slippage
  guard, presence signaled explicitly rather than inferred from zero; a
  sale whose proceeds round to zero is rejected, never silently accepted;
  the station named by a sale is resolved through the same visibility
  gate a direct station read applies, so a sale can never be used to probe
  for a station's existence.
- Add **`market-board-panel`** (frontend): a shared panel — mounted on both
  the galaxy view and the station inspector, mirroring `fleet-roster`'s
  shared-panel/delegated-selection shape — ranking visible stations by
  price for a chosen kind, with the spread against the player's own position
  surfaced as a legible figure, not raw numbers to subtract.
- **MODIFIED**: `corporation-spawn` (asset healing grows to include the
  home station and opening balance; `GET /v1/corporations/me` gains the
  balance and now runs the same idempotent healing pass a spawn call does,
  so a pre-M11 corporation heals on its next session bootstrap, not only on
  an explicit re-spawn); `fleet-movement` (the cargo pool is now debited by
  an instant sale, not only credited by mining); `mine-extraction` (the
  `holdFull` clamp stays structurally unreachable, but the *reason* changes
  — `goods-sale` is now a second cargo writer, and it is the
  docked-to-exactly-one-feature invariant, not "mine is cargo's only
  writer," that still rules it out); `system-interior` (interior
  generation's determinism makes no claim about a station, which is
  provisioned separately; the three-band feature-omission rule is scoped to
  generated features and does not govern a station's own visibility rule);
  `galaxy-view` (the system inspector's free astronomical layer gains a
  visible station's quotes).
- Frontend: `frontend/lib/types/fleet.ts`/`corporation.ts` gain the cargo
  debit and balance fields; a sell offer, sell commit, and credit-balance
  readout join the board's facts panel (`hex-board-view`, ADDED only —
  mirrors `### Requirement: Mine Offer on the Docked Fleet` closely).

**Scope caveat**: M11 deliberately ships **no buy side** — there is nothing
for a player to purchase until M12's exchange gives credits somewhere to go
besides accumulating. Consequently M11 ships **no credit sink at all** (the
listing fee is M12's) — this milestone is a pure faucet (spawn grant + sale
proceeds) and its balance economy cannot be inflation-tested in isolation;
that is expected, not an oversight. And M11 ships **no station storage** —
goods sold to the NPC leave play entirely; there is no second place for
matter to exist yet, no speculative unused storage field on the station
doc, and "goods exist in exactly two places" (a fleet's hold, or nowhere)
stays a testable claim rather than a half-built one. Player-built stations,
region hubs, dynamic pricing, and inflation management are likewise out —
see design.md's Non-Goals for the full list and each one's disposition.

## Impact

- Affected specs (ADDED): `corporation-credits`, `trading-station`,
  `npc-market-demand`, `market-price-board`, `goods-sale`,
  `market-board-panel`.
- Affected specs (MODIFIED): `corporation-spawn` (`Spawn Asset Healing`,
  `Session Bootstrap and Wake-Up Endpoints`), `fleet-movement` (`Fleet
  Cargo Pool`), `mine-extraction` (`Resolve Clamps Yield to Reality`),
  `system-interior` (`Lazy, Deterministic Interior Generation`, `Three-Band
  Fog Projection of Features`), `galaxy-view` (`System Inspector on
  Selection`), `hex-board-view` (ADDED-only: `Sell Offer on the Docked
  Fleet`, `Sell Commit`, `Credit Balance Readout`, plus new double-submit
  guard and rejection-copy-mapping requirements).
- **Affected specs (ADDED delta), corrected from an earlier "not
  affected" claim:** `request-authorization` gains a per-corporation write
  quota on credit-mutating routes and a "no client-supplied corporation
  id" requirement (see design.md Decision 9). The earlier claim that the
  general 600/min/IP tier alone was sufficient did not account for that
  same tier's own already-documented defects (an IP-spoofable bucket, and
  per-instance rather than service-wide enforcement — both specced as
  current defects in `request-authorization`'s baseline "Fixed-Window Rate
  Limiting, Two Tiers") — a money-mutating endpoint needs a control those
  defects can't touch, additive to the unchanged general/strict IP tiers.
- **Not affected**: `observation-fog-and-scan` — a station's visibility is
  governed entirely by `trading-station`'s own graph-tier rule, never by a
  scan-minted observation or the ambient sensor union, so no fog-domain
  behavior changes (see design.md Decision 5).
- Affected code: `backend/corporations/` (credit balance field, ledger
  subcollection, healing extended to station + balance, `GET /me` runs
  healing); a new `backend/market/` package family (station provisioning,
  NPC demand/requests, the price-board read, the sell verb) reading through
  `corporations.ServiceInterface`/`fleet.ServiceInterface`/`system.ServiceInterface`,
  never their DAOs (narrow, transaction-scoped primitives per design.md
  Decision 16 for the settlement transaction specifically); `backend/system/
  service.go` (splices a visible station into `GetOrCreateInterior`'s
  projection — the service seam `fleet.resolveFeature` itself reads
  through, not the handler; degrades to no-station on a station-store
  failure); `backend/router.go` (wire the new package, registering no
  `action.ResolveFunc` — nothing here rides the action spine, but the sell
  route does join a new per-corporation write-quota middleware);
  `backend/common/firestore_test_helpers.go` (`CleanupFirestoreTestData`
  registers the new collections, called with each test's own literal
  collection-path strings per house convention). Frontend:
  `frontend/lib/types/`, `frontend/lib/services/`, `frontend/hooks/`,
  `frontend/components/board/` (sell offer/commit, balance readout),
  `frontend/components/market/` (the new shared board panel), mounted from
  both the galaxy view and the board.

## 1. `corporation-credits`: the money atom

- [ ] 1.1 Add `Credits int64` to `corporations.Corporation`; add a
      `market.Params`-sourced `StartingCredits` knob (see task group 5 for
      where `market.Params` itself lands). Add a per-corporation
      assets-complete marker field (see task 3.2) alongside it.
- [ ] 1.2 Add a `ledger` subcollection under `corporations/{corpId}`, doc id
      = operation key; entry fields per "Append-Only Trade Ledger" (id, corp
      id, **triggering account id**, world time, kind — starting grant,
      sale proceeds, or **adjustment** — nullable counterparty/item/
      quantity/unitPrice, signed amount, resulting balance).
- [ ] 1.3 Add `corporations.ApplyCreditInTx(tx, corpId, operationKey,
      entry)` — a narrow, transaction-scoped primitive (design.md Decision
      16) that, given an already-open transaction, re-reads the current
      balance and the operation-key doc inside that transaction, rejects an
      overdraw in full, and stages the new balance and ledger entry
      (create-if-absent on the operation-key doc id) writes — this is the
      ONLY path that changes `Credits`. `corporations.Service.ApplyCredit`
      becomes a thin wrapper opening its own `RunTransaction` and delegating
      to `ApplyCreditInTx`, used by every non-sale caller (the spawn opening
      grant). `market`'s sale service (task 6.3) calls `ApplyCreditInTx`
      directly inside its own single transaction, never `ApplyCredit`.
- [ ] 1.4 Operation key validation: format-constrain (16–64 chars,
      `[A-Za-z0-9_-]`), reject a reserved-prefix key (`spawn:` and any other
      server-reserved prefix) with `400` before any read; on a repeat key
      for the same corporation, re-fingerprint the request against the
      recorded entry's parameters and reject as a conflict (not a replay) on
      a mismatch.
- [ ] 1.5 Reconciliation: (a) a checkpointed, windowed fold (per design.md
      Decision 8) comparing `checkpointBalance + fold(newer entries)`
      against the stored balance, cursor = compound `(worldTime, tie-broken
      doc id)`, never the entry doc id alone; emits an attributable
      log/metric on divergence, advances the checkpoint on a clean match;
      (b) a periodic scheduled run, independent of any mutation; (c) an
      opportunistic O(1) write-time check inside every settlement
      transaction, validating the computed new balance against the previous
      entry's recorded resulting balance before committing; (d) a confirmed,
      unresolved divergence rejects further credit mutation for that
      corporation until an `adjustment` entry resolves it; (e) a full,
      genesis-to-now fold available on demand, independent of the windowed
      check.
- [ ] 1.6 Audit logging: emit a structured record for every credit-mutating
      attempt (settled or rejected) — requester identity, corp id, operation
      key, outcome, rejection reason if rejected — distinct from
      `request-authorization`'s general HTTP audit middleware.
- [ ] 1.7 Credit-minting-rate signal: a countable metric for the sum of
      positive ledger entries per unit time, queryable without a full ledger
      scan.
- [ ] 1.8 Add owner-only, **paginated** (page size + cursor) balance/ledger
      read methods and wire `404` for a foreign corp, `401` for
      unauthenticated (reusing the existing `common.ActorCorp` seam).
- [ ] 1.9 Unit tests: overdraw rejected in full; balance+ledger always
      written together or neither; reconciliation matches on a clean corp
      and flags a fixtured divergence (windowed, chained-at-write-time, and
      full-history); a confirmed divergence halts further mutation until an
      `adjustment` entry lands; same operation key is a no-op on retry for
      the same corp, a different corp's use of the same key is fully
      independent and discloses nothing of the first corp's entry; a
      mismatched-parameter replay is a conflict; malformed/reserved-prefix
      operation keys rejected with `400` before any read; no action/slot/ETA
      is ever created by a credit mutation; owner-only disclosure (foreign
      404, unauthenticated 401); ledger read pagination (page size + cursor
      behavior); attribution field present on every entry; audit log emitted
      on both settle and reject paths; minting-rate signal reflects a
      fixtured set of entries.
- [ ] 1.10 Register the new ledger subcollection in
      `common.CleanupFirestoreTestData()` — per-test-fixture call passes its
      own literal collection-path string (e.g.
      `"corporations/{corpId}/ledger"` for that test's corp id); there is no
      central registry to add to. Also register the reconciliation
      checkpoint's storage location the same way.

## 2. `trading-station`: the place

- [ ] 2.1 New package (e.g. `backend/stations/`): `Station{SystemId,
      OwnerCorpId, Hex, Orbit, FeatureId}` in a new
      `galaxies/{gid}/systems/{sid}/station/meta` doc (create-if-absent,
      mirroring `system.dao.go`'s `CreateInterior` claim discipline —
      design.md Decision 4). `Orbit` carries ring/angle0/period/direction,
      the same shape `board.Orbit` already models for any orbiting feature.
- [ ] 2.2 Deterministic, non-core, off-gate-ring **orbit** derivation from
      `systemId` + the live galaxy's seed and nothing volatile (hash-based
      for ring/angle0, in the style of `corporations.Service.rimHex`'s
      account-seeded pick): pick a ring strictly between the core and the
      lane-gate ring, and derive angle0/period/direction identically on
      every re-derivation. The **direction is not hashed**: it equals the
      system's dominant orbital direction (`system-interior`'s "Coherent
      Orbital Direction") — expose a small pure helper from `system` that
      the interior generator itself uses for its dominant-direction roll
      and reuse it here (single source of truth, so a generator draw-order
      change can never silently diverge station vs. disk). The station
      orbits — it is not fixed (design.md Decision 4, reversed from
      an earlier draft).
- [ ] 2.3 Provisioning entry point callable from `corporations`' asset
      healing (task 3.x) — idempotent per system id, converges under
      concurrent calls (two corporations spawning into the same system).
- [ ] 2.4 `GET /v1/systems/:systemId/station`: `404` for an unknown system
      or a system below the configured minimum visibility tier
      (`market.Params.MinVisibilityTier`); otherwise returns the station
      (id, hex/orbit, `ownerCorpId`).
- [ ] 2.5 Splice a visible station into `system.Service.GetOrCreateInterior`'s
      returned interior (the service seam, not `system.Handler` — `fleet.
      resolveFeature` reads through the service directly for both `Order`'s
      `dockOnArrive` and `Position`'s docked resolution, so a handler-only
      splice would leave both broken; design.md Decision 4) as a
      feature-shaped DTO entry (new `FeatureType` value, carrying
      `ownerCorpId` and orbital elements) — gated by the same visibility
      tier as 2.4, independent of sensor coverage. On a station-store read
      failure, omit the station and still return the rest of the interior
      (degrade, never fail the whole read).
- [ ] 2.6 Reject a mine command naming a station's feature id (a small
      `mine`-side or `system`-side lookup: is this feature id a station?).
- [ ] 2.7 Confirm `fleet.Position`'s existing `featureOrbit`/`board.OrbState`
      branch resolves a docked-to-station fleet's live position with no new
      code at that seam (design.md Decision 4's zero-new-code claim) — add
      a regression test pinning this rather than assuming it.
- [ ] 2.8 Unit/integration tests: idempotent provisioning (fresh, repeat,
      healed-partial, two-corps-one-system); deterministic re-derivation of
      the full orbit (ring/angle0/period/direction), not just a hex; never
      core, never on the gate ring; direction equals the system's dominant
      orbital direction; burn-to-station resolves docked, riding
      the station's live orbital position at read time; mine-at-station
      rejected; station spliced into the interior read only at/above the
      configured tier, omitted below it, with no scan involved; a
      station-store failure degrades the interior read (station omitted,
      rest of interior intact) rather than failing it; direct station read
      404s below-gate and for an unknown system.
- [ ] 2.9 Register the new station subcollection in
      `common.CleanupFirestoreTestData()` (per-test literal collection path,
      same convention as 1.10).

## 3. Spawn healing extended (`corporation-spawn` MODIFIED)

- [ ] 3.1 Extend `corporations.Service.ensureSpawnAssets` to also
      provision the home station (task group 2) and grant the opening
      balance (task 1.3's `ApplyCreditInTx`, keyed `"spawn:" + corpId`) —
      both idempotent, neither re-running once already done. The balance
      check MUST NOT infer "already granted" from `Credits == 0` (a
      corporation can legitimately spend to exactly zero) — the only signal
      is the existing `"spawn:" + corpId` ledger entry.
- [ ] 3.2 Add the per-corporation assets-complete marker (task 1.1):
      `ensureSpawnAssets` sets it once hull, fog, station, and balance are
      all confirmed present, and short-circuits on it at entry — checking
      only the marker, no other read or write — before falling through to
      the per-asset checks on a cache miss/unset marker.
- [ ] 3.3 Make `GetForAccount` (backing `GET /v1/corporations/me`) also
      invoke `ensureSpawnAssets` before returning (design.md Decision 14) —
      the migration mechanism for pre-existing corporations with no stored
      station or balance. Concurrent calls for the same unhealed account
      MUST converge on exactly one station, one opening grant.
- [ ] 3.4 Add `Credits` to the `GET /v1/corporations/me` response DTO.
- [ ] 3.5 Unit/integration tests: healed station-only retry (hull+fog
      exist, station doesn't); healed balance-only retry; a fixtured
      pre-existing corp (no stored station/balance) heals both on its next
      `GET /me` call with no explicit re-spawn; repeat spawn/`GET /me` calls
      never double-provision or double-grant; a corp legitimately spent to
      zero is never re-granted; the assets-complete marker short-circuits
      a healed corp's subsequent reads to zero extra reads/writes;
      concurrent `GET /me` calls for one unhealed account heal exactly once.

## 4. `npc-market-demand`: what the NPC pays

- [ ] 4.1 `market.Params` (new file, mirroring `mine.MineParams`'s shape):
      `Floors map[string]map[string]int64` (region and kind BOTH keyed by
      their string form, never the named `system.ResourceKind`/region type —
      see design.md Decision 11's note on `fleet.Cargo`'s documented
      Firestore SDK transform-extraction panic on named-string-typed map
      keys), `TradableKinds`, provisioning knobs (`ConcurrentRequestCount`,
      `RequestKinds`, `PremiumBand`, `QuantityBand`, `Lifetime`,
      `RegenerationCadence`, epoch width), `Budget`/`Absorption` limits
      (default: unlimited), `StartingCredits`, `MinVisibilityTier`,
      `BoardRefreshCadence` (proposed default 30s — design.md Open
      Questions). `Default*Params()` constructor per house convention (see
      design.md Decision 10 — this is `params.go`-shaped config, not
      `GameTuning`).
- [ ] 4.2 Floor lookup: `(region, kind) -> price`; a missing entry reports
      "not tradable here" (distinguishable) rather than zero or any
      computed value.
- [ ] 4.3 Request storage: embedded on the station doc (bounded list, well
      under Firestore's 1MB doc limit), each carrying kind, unit price,
      remaining quantity, lifetime expiry timestamp — decremented and
      expiry-checked inside the station doc's own transaction (single-
      document transaction; no cross-document coordination needed). Also
      add per-window budget/absorption consumption tracking:
      `station.WindowSpend map[string]int64` / `station.WindowAbsorbed
      map[string]float64`, string-keyed per the same rule as 4.1 — this
      field is registered in `common.CleanupFirestoreTestData()` alongside
      the station subcollection (task 2.9).
- [ ] 4.4 Provisioning routine: lazy, read-triggered (mirroring
      `GetOrCreateInterior`'s pattern), keyed by `(stationId, epoch)`,
      create-if-absent, deterministic per `(stationId, epoch, worldSeed)` —
      never a scheduled job (no new Terraform).
- [ ] 4.5 Budget/absorption check: reject-in-full when a floor-priced
      sale's portion would exceed the remaining configured limit for the
      current window — never a partial clamp for this reason (contrast with
      the demand-entry fold's split across entries, task 6.x).
- [ ] 4.6 Request lifetime expiry: a request past its configured lifetime
      with remaining quantity > 0 stops quoting and stops being fillable,
      reported distinguishably as expired rather than exhausted; its slot
      is eligible for replacement no sooner than the regeneration cadence
      (already covered by the existing provisioning scenario).
- [ ] 4.7 Unit tests: two stations in one region quote identically; floor
      unchanged after volume; missing-floor kind rejected; request price >
      floor; remaining quantity decrements and stops quoting at zero;
      concurrent sales against one request never oversell it (transactional,
      re-read-at-commit decrement — never "rejected or reduced," always
      exactly bounded by the remaining quantity at each commit); budget/
      absorption reject-in-full under a fixtured finite limit, never
      rejected under the shipped unlimited default; concurrent provisioning
      for one station/epoch converges on one request set; regeneration
      cadence honored after expiry; a lifetime-expired request stops
      quoting/selling and is distinguishable from an exhausted one.

## 5. `market-price-board`: the remote read

- [ ] 5.1 `GET /v1/market/board`: for every station (venue) at/above
      `MinVisibilityTier` for the requester, per tradable kind an ordered
      list of uniform demand entries (`{unitPrice, remainingQuantity,
      source}`, price-descending, the floor represented as the entry of
      last resort — never a separate `floor` field, design.md Decision 17)
      + world time; empty list (not an error) for a requester with no
      qualifying stations. Point-read fan-out per visible station (design.md
      Decision 12's fan-out pin), not a `collectionGroup` query.
- [ ] 5.2 Confirm the read never touches observation `asOf` freezing —
      quotes are computed live from the station/request store, never routed
      through the three-band feature projection.
- [ ] 5.3 Confirm the response discloses no fleet/corporation identity and
      omits `ownerCorpId` entirely (never ships it as `null`), and no
      system content beyond the requester's existing fog; document that
      live per-entry remaining quantities ARE disclosed by design (design.md
      Decision 6).
- [ ] 5.4 If any caching layer is introduced for this read, key it on the
      requesting corporation's resolved id — never a shared/global cache
      entry.
- [ ] 5.5 Unit/integration tests: multi-station aggregation in one read;
      empty set for no visible stations; tier-gate inclusion/exclusion at
      the boundary; a request exhausted by another corp shows exhausted on
      the very next read (no travel/scan by the reader); response shape
      excludes fleet/corp-identity leakage and omits `ownerCorpId`; two
      corporations with different visibility never receive a
      cross-cached response; confirm no new composite index is required for
      this read's fan-out strategy (flag in `firestore-indexes.tf` if the
      implementation changes to a `collectionGroup` query).

## 6. `goods-sale`: the instant verb

- [ ] 6.1 New handler/service (e.g. `backend/market/sale.go`, or a
      `backend/trade/` package) implementing `POST
      /v1/fleets/:fleetId/sell {featureId, kind, tons, operationKey,
      expectedUnitPrice?, minTotalProceeds?}` — `expectedUnitPrice` and
      `minTotalProceeds` as nullable/pointer fields (or an explicit
      "supplied" flag), never inferred from a zero value.
- [ ] 6.2 Precondition order, all evaluated against **pre-transaction**
      reads only through step (b) below — everything from (c) onward is
      re-evaluated inside the settlement transaction (task 6.3), never
      trusted from this pre-check alone: (a) resolve requester's corp via
      `common.ActorCorp`; `404` if unauthenticated OR if the resolved corp
      (including an empty/unset one) does not own the fleet — an empty
      requester corp id never matches an empty/absent fleet
      `corporationId`; (b) resolve the named station through the same
      visibility gate `trading-station`'s direct station read applies —
      byte-identical `404` status and reason text for "no station" and "a
      station below your visibility tier," checked before any docked-state,
      tonnage, kind, or price evaluation; (c) fleet's effective state is
      `docked` to the named station feature; (d) `tons` positive finite, ≤
      held tonnage of `kind` (pre-check only — re-read at commit);
      (e) kind is tradable and has a configured floor for the station's
      region; (f) slippage guard(s), if supplied, against the applicable
      first-ton price and/or minimum total proceeds — reject with a
      distinguishable "price changed" reason before any state change;
      reject `NaN`/infinite/negative guard values with `400`, never treated
      as "no guard."
- [ ] 6.3 Settlement transaction (opened exactly once, by this service —
      design.md Decision 16): re-read the fleet's held tonnage, the corp's
      balance, and the request's remaining quantity inside the transaction;
      re-evaluate every precondition from 6.2(c) onward against those
      transactional reads — a precondition that passed pre-transaction but
      fails here aborts the sale in full, never reduced/clamped; fold the
      sold tonnage across the venue's ordered demand entries (task 4.3's
      embedded request list + the floor as the entry of last resort —
      design.md Decision 17), round each portion's proceeds down (task 6.4),
      reject if the summed total rounds to zero (task 6.4b) or would
      overflow/go negative (task 6.4c); debit the fleet's cargo via
      `fleet.DebitCargoInTx(tx, ...)`, credit the corp's balance via
      `corporations.ApplyCreditInTx(tx, ...)` (task 1.3), decrement the
      filled request's remaining quantity via a station-side
      `DecrementRequestInTx(tx, ...)` — all narrow, transaction-scoped
      primitives composed by this one transaction, never three separate
      service calls; budget/absorption check (task 4.5) applies to the
      floor-portion of the fold; on a transaction-conflict abort, retry
      automatically server-side up to a small fixed count with backoff
      before surfacing a distinguishable "busy, try again" rejection.
- [ ] 6.4 Rounding and safety: (a) floor `tonnage × unitPrice` to whole
      credits **per filled demand-entry portion**, sum for total proceeds
      (never round the pre-summed fractional total once) — pinned against
      `fixtures/market/cases.json` (task 8); (b) reject a sale whose total
      proceeds round to zero, appending nothing; (c) reject a proceeds
      computation that would overflow the balance's integer type, produce a
      non-finite intermediate, or go negative; ledger entry records the
      exact rounded amount applied.
- [ ] 6.5 Response: applied price(s) per filled demand-entry portion, total
      proceeds, updated free hold, updated balance — no action id, no ETA.
- [ ] 6.6 Every rejection: `gin.H{"error": "<reason>"}`, distinguishable per
      reason — EXCEPT the four existence-hiding rejections (foreign fleet,
      unknown fleet, below-gate station, unknown station), which SHALL all
      return `404` with one byte-identical reason string, indistinguishable
      from one another.
- [ ] 6.7 Observability: a countable signal per sale outcome (settlement,
      and each rejection reason including contention-abort), keyed
      separately from ordinary precondition rejections.
- [ ] 6.8 Unit tests: docked-state matrix (docked-at-station succeeds;
      coast/burn/laneTransit/laneHold/docked-elsewhere rejected); no
      cross-fleet cargo substitution; ownership matrix (401/404/success,
      including the corpless and empty-corp-id-matches-empty-owner cases);
      station visibility gate (below-gate and unknown-station responses are
      byte-identical; probing across many candidate system ids yields
      uniform responses); no action/slot/ETA created; scan-running-
      concurrently still allows a sale; tonnage validity
      (zero/negative/NaN/Inf/over-held, all rejected, never clamped);
      demand-entry fold reporting (fully covered by top entry / split
      across entries / floor-only); operation-key format validation
      (length/charset/reserved-prefix rejected pre-read) and corp-scoped
      idempotency (retried sale for the same corp is a no-op; a different
      corp's identical key is fully independent and discloses nothing;
      a mismatched-parameter reuse is a conflict); slippage guard (no guard
      supplied / matching / stale first-ton / stale min-total after a
      partial drain / invalid guard value rejected); zero-proceeds dust
      sale rejected, no ledger row; overflow/negative-proceeds rejected;
      every distinct rejection's reason text differs from every other,
      except the four existence-hidden ones, which are identical.
- [ ] 6.9 Integration tests (Firestore emulator): one atomic settlement
      transaction lands hold debit + balance credit + ledger append +
      request decrement together, all-or-nothing on any partial failure
      (retry with the same key finds a clean, unsettled state); concurrent
      sales against one fleet's hold with distinct operation keys never
      together oversell it — exactly one settles in full, the other is
      rejected in full, never reduced (cross-reference task 4.7);
      concurrent sales against one request never oversell it; a stale
      pre-transaction read that fails the transactional re-read aborts
      cleanly; contention-abort retry-then-surface behavior under fixtured
      contention.

## 7. `request-authorization`: per-corporation write quota

- [ ] 7.1 Add a fixed-window quota middleware keyed on `common.ActorCorp`
      (never client-influenced), applied only to credit-mutating routes
      (`POST /v1/fleets/:fleetId/sell`, and any future ledger-appending
      route) — additive to, never replacing, the existing per-IP tiers.
- [ ] 7.2 Confirm every corporation-scoped/credit-mutating handler resolves
      its acting corporation solely via `common.ActorCorp`, never from a
      client-supplied `corporationId` field, query param, or header.
- [ ] 7.3 Unit tests: a corporation exceeding its quota is `429`'d
      regardless of `X-Forwarded-For` variation or source IP; a
      corpless requester is rejected by the route's own auth check before
      the quota is consulted; a client-supplied `corporationId` field is
      ignored in favor of the resolved actor corp.

## 8. Shared cross-stack settlement fixture

- [ ] 8.1 Add `fixtures/market/cases.json` (design.md Decision 22): a golden
      covering the demand-entry fold, a split fill across more than one
      entry, and per-portion rounding — mirroring `fixtures/board/cases.json`'s
      existing Go/TS shared-fixture precedent.
- [ ] 8.2 Assert the fixture from the Go settlement tests (task 6.8) and
      from the TS proceeds-preview tests (task 11.6) — both stacks compute
      against the exact same cases.

## 9. Frontend: types, services, hooks

- [ ] 9.1 `frontend/lib/types/corporation.ts` (or wherever `Corporation`
      lives): add `credits`.
- [ ] 9.2 `frontend/lib/types/fleet.ts`: no new fields (cargo already
      modeled from `add-mine-ui`); confirm the type comment reflects that
      cargo can now decrease via a sale, not only increase via mining.
- [ ] 9.3 New `frontend/lib/types/market.ts`: station, quote (a per-kind
      ordered list of uniform demand entries `{unitPrice, remainingQuantity,
      source}` — never a distinct `floor`/`requests` field split), sale
      request/response shapes (`expectedUnitPrice?`, `minTotalProceeds?` as
      optional/nullable, never defaulted to `0`).
- [ ] 9.4 `frontend/lib/services/market-service.ts` (or similar): `getBoard()`
      (`GET /v1/market/board`), `getStation(systemId)`
      (`GET /v1/systems/:systemId/station`), `sell(fleetId, {featureId,
      kind, tons, operationKey, expectedUnitPrice?, minTotalProceeds?})`
      (`POST /v1/fleets/:fleetId/sell`) — operation key generated
      client-side (a UUID, 16–64 chars, matching the server's format
      constraint) per user-initiated attempt, reused across transport
      retries of that same attempt.
- [ ] 9.5 `frontend/hooks/use-market.ts`: `useMarketBoard()` (polled per the
      stated freshness cadence, `market.Params.BoardRefreshCadence`),
      `useStation(systemId)`, `useSell(systemId)` modeled on `useMine()` —
      mutation invalidates the fleet read (hold/balance) and the market
      board query.
- [ ] 9.6 A player-facing copy map from server rejection reason to display
      text (see `hex-board-view`'s "Rejection Reasons Map to Player-Facing
      Copy"), with a generic fallback for an unmapped reason.
- [ ] 9.7 Service/hook tests: call shapes, error passthrough mapped to
      player-facing copy (never the raw server reason string), poll cadence
      wiring.

## 10. Frontend: galaxy view + station inspector

- [ ] 10.1 `galaxy-view`'s system inspector: show the station section (per
      the MODIFIED "System Inspector on Selection") when
      `useStation(systemId)` resolves a visible station; omit it otherwise;
      render its demand entries, not a floor/requests split.
- [ ] 10.2 Mount `market-board-panel` on the galaxy view; wire row selection
      to focus/select that station's system (per "Row Selection Delegated
      to the Mounting View"); distinguish a premium-request row from the
      floor row by more than color (icon/label in addition to any color
      cue).
- [ ] 10.3 Tests: station section present/absent per visibility; panel
      mounts and delegates selection; request-vs-floor distinction is not
      color-only.

## 11. Frontend: board — sell offer, commit, balance readout

- [ ] 11.1 FactsPanel: sell offer on the fleet card, anchored to `docked`
      state at a station with nonempty cargo (per "Sell Offer on the Docked
      Fleet") — kind picker (held kinds AND station-tradable kinds only,
      excluding a kind with no configured floor at this station; default =
      greatest tonnage among eligible kinds), tonnage input (default = full
      held tonnage, clamped), live proceeds preview folded across the
      station's demand entries and pinned to `fixtures/market/cases.json`
      (task 8) so the preview always matches what settlement will apply.
- [ ] 11.2 Sell commit wiring: success toast + hold/balance refresh with no
      navigation; failure toasts player-facing copy (task 9.6) mapped from
      the server's reason, offer stays put — EXCEPT a "price changed"
      rejection, which refreshes the offer to the current applicable
      price(s)/total (showing both the new and the originally expected
      figure) rather than freezing stale state; a re-commit after that
      refresh generates a new operation key (per "Sell Commit").
- [ ] 11.3 Double-submit guard: disable the sell control from commit until
      settle/fail; one operation key per user-initiated attempt, reused
      across transport retries of that attempt, a new key for any fresh or
      re-priced attempt (per "Sell Control Guards Against Double-Submit").
- [ ] 11.4 Credit balance readout on the board (per "Credit Balance
      Readout"), sourced from session data, updating on a settled sale;
      balance changes and sale-failure errors both announced via an
      accessible live region, not conveyed by visual change alone.
- [ ] 11.5 Mount `market-board-panel` on the station inspector too (shared
      panel, second mount point).
- [ ] 11.6 Tests: offer gating matrix (docked-with-cargo / co-located-not-
      docked / docked-with-empty-cargo); untradable-kind excluded from
      picker; tonnage clamp; proceeds preview tracks kind/tonnage and
      matches the shared fixture on a split-fill case; commit success/
      price-changed-refresh/other-failure paths; a double-click or
      transport retry yields exactly one sale, a fresh attempt yields a
      second; balance readout present, updates on settlement, and is
      announced to assistive technology on both a successful sale and a
      failed one; panel's second mount point delegates selection correctly.

## 12. Validation

- [ ] 12.1 `cd backend && go test ./corporations/... ./stations/...
      ./market/... ./fleet/... ./system/... ./mine/... -short`
- [ ] 12.2 `cd backend && go test ./... ` (full, emulator-backed) for the
      new transactional/idempotency/concurrency scenarios.
- [ ] 12.3 `cd frontend && npm run lint && npx vitest run`
- [ ] 12.4 `python3 .claude/skills/code-quality-checks/check.py`
      (data-testid, test-file coverage, raw-fetch, color validators)
- [ ] 12.5 Confirm no new Firestore composite index is required for the
      ledger's windowed reconciliation fold or the price-board fan-out
      read; if either implementation changes in a way that needs one,
      declare it in `infra/terraform/firestore-indexes.tf` and flag for
      `terraform apply`.
- [ ] 12.6 `openspec validate add-credits-and-npc-market --strict`

## Out of scope (tracked, not tasked here)

- Player-built stations, region hubs, dynamic pricing/inflation management,
  station storage, the buy side, and the intel market are explicit
  non-goals (design.md) — no task above should grow to cover them.
- The M11 slice e2e (mine → sell at home → spot a request paying a premium
  → haul it → the profit lands) is a natural follow-up once this change's
  backend and board UI both land, mirroring `add-mine-ui`'s slice e2e — not
  tasked here to keep this change's scope to the spec'd capabilities.

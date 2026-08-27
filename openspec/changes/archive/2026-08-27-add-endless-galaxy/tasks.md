# Tasks — The Endless Galaxy

## 1. Field generator (pure, no I/O)

- [x] 1.1 Add field params to `galaxy.GenerationParams` (`MaxLaneLength`,
      `BlockSize`, `BridgeSearchHorizon`, `StartAreaBlockRadius`,
      `MinOriginComponentSystems`, cell size derived from `MinGapByRegion`)
      plus validation (reject `MaxLaneLength ≤ 0`,
      `BlockSize·cellSize ≤ MaxLaneLength` (strict > required),
      `BlockSize < 1`, `BridgeSearchHorizon < 1`,
      `MinOriginComponentSystems < 1`, worst-case block writes > txn limit);
      drop `RadiusXY`/`TargetCount`/`MaxAttemptsPerNode`; keep noise params,
      `MinGapByRegion`, `HalfHeightZ`
- [x] 1.2 Implement hashed-cell candidate derivation: `hash(seed, cx, cy)` →
      jittered position (Z within slab), priority; region classified from the
      existing fractal noise at that position (D1)
- [x] 1.3 Implement the biconditional survival rule (survive iff no
      higher-priority conflict within the 3×3 cell window, region-varied
      gaps) and a `FieldSystems(seed, params, cellRect)` window query (D1)
- [x] 1.4 Switch system identity to cell coordinates (`sys_<cx>_<cy>`),
      lane identity to the unordered endpoint-id pair, and re-seed naming
      from `hash(seed, cx, cy)`; verify `SystemSeed`/skeleton pipeline is
      unchanged downstream (D2)
- [x] 1.5 Implement capped local RNG lanes computed against the field window
      (D3), plus bridge stitching per D4: per non-empty block and positive
      cardinal direction, nearest non-empty block within
      `BridgeSearchHorizon`, one bridge (closest pair, hash tie-break) only
      where no ordinary lane spans; empty blocks skipped over, never bridged
      to; `bridge: true` marker; expose per-block incident-lane/bridge
      enumeration (the "full lane horizon" input D5/D6 consume)
- [x] 1.6 Generator unit tests: determinism (same seed/blocks ⇒ deep-equal),
      order-independence (A-then-B ≡ B-then-A), min-spacing (larger of the
      two gaps), ordinary-lane cap, bridge construction constraints (≤1 per
      block+direction, none where ordinary lane spans, empty-block skip),
      lane stability under adjacent materialization, naming stability,
      params-validation rejections (one per clause), and the region-density
      statistics test (per-class bands incl. barrier-sparsest,
      lane-connectivity growth within the test area — the supercritical
      assertion from D4's risk)

## 2. Materialization (service + DAO)

- [x] 2.1 Add the `blocks/{bx}_{by}` anchor subcollection and the
      transactional materialize-block DAO op: create-if-absent anchor +
      systems + lanes, reading INSIDE the transaction the anchors of every
      lane-sharing block — 8 neighbors plus every block within
      `BridgeSearchHorizon` along the four cardinal axes — and writing every
      lane (ordinary or bridge) whose far block is materialized
      (unordered-pair lane ids make either-side writes idempotent); assert
      the write count fits the 500-write txn limit for the chosen
      `BlockSize` (D5)
- [x] 2.2 Apply the idempotent monotonic bounds/block-counter merge to the
      galaxy doc alongside (not inside) the block transaction (D7 — no
      global write hotspot; lost updates self-heal on the next merge); add
      `galaxy.Service.EnsureBlocks(ctx, blockCoords...)` (compute via the
      field generator, persist via 2.1, no-op on existing anchors) and a
      `EnsureLaneHorizon(ctx, systemId)` helper (3×3 window + incident-
      bridge far blocks) exposed on the service interfaces consumers inject
      (D5)
- [x] 2.3 Rework seeding (`cmd/seed`, dev auto-seed) to materialize
      `StartAreaBlockRadius` blocks around the origin block, run seed-time
      start-area validation (origin survivor with hash tie-break,
      `MinOriginComponentSystems` floor, ≥1 mineable in component), record
      the origin system id on the galaxy doc, then repoint live; idempotent
      on reboot; a failed validation leaves the unreferenced galaxy id
      behind (never live) (D4, D5)
- [x] 2.4 Emulator integration tests: concurrent same-block materialization
      converges; concurrent ADJACENT-block materialization keeps every
      cross-block lane (B3 regression); a bridge skipping empty blocks is
      persisted exactly once from either side / concurrently (R2-B1
      regression); overlapping multi-block sets converge block by block;
      re-materialization is a strict no-op; reads (`GetLive`,
      `GetLiveSystem`, `GET /v1/galaxy`) create no documents;
      unmaterialized id → `ErrSystemNotFound`; bounds grow monotonically
      and contain all systems after each trigger completes

## 3. Consumer seams

- [x] 3.1 Scan resolution (`observation`): gate on the fizzle test FIRST
      (fleet still in origin system), then `EnsureLaneHorizon` around the
      scanned system, then chart; integration tests: frontier scan
      discovers onward roads exactly as if pre-persisted; corner-system
      scan charts its cross-corner lane (B2 regression); bridge-endpoint
      scan charts the bridge with its far block materialized (R2-B1
      regression); fizzled scan materializes nothing
- [x] 3.2 Spawn site selection (`corporations/siteselection.go`): lane-graph
      BFS walk from settled space (or the galaxy doc's recorded origin
      system when no corp is living), calling `EnsureLaneHorizon` on every
      visited system BEFORE expanding past it (R2-B2); qualification =
      mineable ∧ min-distance ∧ no spawn reservation; uniform account-seeded
      pick within the first qualifying ring; `MaxSpawnWalkBlocks` as
      expansion DEPTH from the walk's starting block set (validated
      positive) → `ErrNoSpawnSite`; retire `PeripheryWeight`
- [x] 3.3 Spawn commit (`corporations/service.go`): create-if-absent
      `spawnClaims/{systemId}` reservation + record the picked home on the
      corp doc in the corp-commit transaction; loser re-runs selection
      against the now-visible reservation, at most `MaxSpawnRepicks`
      (validated positive) then `ErrNoSpawnSite`; healing seeds the hull at
      the corp's recorded home (no re-pick, no orphaned reservations); keep
      site-selection-before-corp-commit ordering
- [x] 3.4 Spawn tests: N consecutive fresh wakes all succeed with strictly
      growing materialized count (never-exhaust pin); every home
      lane-reachable from the origin system (R2-M2 pin); first corp in a
      fresh world spawns near the recorded origin; same account re-picks the
      same site; reserved system never qualifies; concurrent
      different-account spawns land different homes within `MaxSpawnRepicks`
      (M11/R2-B3 regression); healing reuses the recorded home; wide-
      frontier walk consumes no extra depth budget; a same-account
      double-spawn returns the winner's corp without consuming re-picks
      (R3-F3 regression); a pocketed test field (finite origin component)
      fails `ErrNoSpawnSite` with the account corpless (R3-F2 regression);
      low-cap walk failure leaves the account corpless — no corp doc,
      pointer, or reservation (extend
      `TestSpawn_NoSpawnSite_LeavesAccountCorpless`)
- [x] 3.5 Regenerate `frontend/public/galaxy/start-area.json` via
      `cmd/seed start-area` from the new generator; verify `galaxy-view`
      renders it and the live map (camera framing/reference grid driven by
      the new materialized-extent bounds)

## 4. Frontend + world reset + verification

- [x] 4.1 Pass the lane `bridge` flag through the galaxy DTO/types and render
      bridge lanes visually distinct (faint style) in the galaxy view,
      identical for interaction (galaxy-view delta)
- [x] 4.2 Add the blocks subcollection and `spawnClaims` to
      `CleanupFirestoreTestData`; audit backend tests and e2e for
      fixed-size/`TargetCount` assumptions
- [x] 4.3 Invert `frontend/e2e/tests/spawn-exhaustion.spec.ts` into the
      endless-frontier pin: N consecutive fresh wakes all succeed and
      `GET /v1/galaxy` grows; remove the exhaustion ordering constraint from
      its header comment
- [x] 4.4 Wipe + reseed the dev world; manually verify wake → scan at the
      frontier → new systems appear on the map for a second logged-in corp
      too (public-astronomy check)
      — VERIFIED 2026-08-27 against the reseeded dev stack: wake lands on a
      field-coordinate home (`sys_-4_-4`), the spawn walk grows the world
      (98 → 351 systems across wakes), a home scan charts its 3 incident lanes
      and rumors their far endpoints at the 15s ETA, and a second corp's star
      layer contains every system the first corp's activity materialized
      (public astronomy holds). The galaxy view renders the live field with
      camera framing from the new materialized-extent bounds. NOT verified in
      the browser: the SYSTEM BOARD canvas — it mounts with live data and
      overlay (features, fleet marker, camera controls all present in the a11y
      tree) but never produces a first frame in the automated Chrome instance,
      while `board.spec.ts`'s render-health check passes against the same code
      under `/check`. Looks environmental; worth one glance in a normal browser.
- [x] 4.5 At sync/archive: rewrite the baseline `galaxy-generation`
      Purpose/Notes (materialized-subset framing, three writer seams, no
      "never at request time") and retire the `corporation-spawn`
      `PeripheryWeight` Notes paragraph, per design.md Migration Plan;
      coordinate archive order with `add-credits-and-npc-market` (both touch
      `corporation-spawn`, on disjoint requirements)
- [x] 4.6 Run the full quality gate (`/check`) and fix fallout

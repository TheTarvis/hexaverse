# The Endless Galaxy

## Why

The galaxy is currently a finite, generate-once artifact (a fixed disc of
~28–320 systems), which makes **spawn-site exhaustion** a reachable state: once
enough corporations claim space, `POST /v1/corporations` 503s and no new
account can ever wake (reproduced 2026-08-12 on the dev world — 13 corps
exhausted the 28-system start area). Exhaustion is not an edge case to handle;
it contradicts the game's core fantasy of an open frontier. The world must
outrun its population.

## What Changes

- **The galaxy becomes a deterministic infinite star field.** Every system
  that will ever exist is a pure function of the galaxy seed over unbounded
  space (hashed-cell Poisson placement: space divides into cells sized by the
  region minimum gap; each cell deterministically yields at most one candidate
  that wins or loses against neighbor cells by hash priority). Nothing is
  invented at request time — it is *discovered*. Same seed, same universe,
  regardless of who materializes what in which order.
- **Systems and lanes materialize lazily, on observation.** The persisted
  galaxy is the materialized subset of the infinite field. The two triggers
  that can look past the materialized frontier — scan resolution (which charts
  a system's lanes and rumors far endpoints) and spawn site selection —
  materialize the deterministic neighborhood they touch, create-if-absent,
  exactly the pattern `system-interior` already uses one level down.
- **Lanes get a maximum length, with an honest connectivity model.** The
  relative-neighbourhood lane rule stays, but computed locally against the
  deterministic field within a bounded window; lanes longer than the cap do
  not exist (true voids). Deterministic **bridge lanes** stitch across voids
  and barrier bands within a bounded search horizon (barriers stay
  chokepoints, not walls). The play guarantee is structural, not a global
  theorem: **the play space is the origin lane-component** — spawn walks the
  lane graph, so every corporation's home is connected to settled space by
  construction; components beyond the bridge horizon are visible but
  unreachable (future content).
- **Spawn site selection walks outward and can never exhaust.** Site selection
  searches the materialized frontier and, when nothing qualifies, materializes
  further blocks and keeps walking, repeating until a site is found.
  `ErrNoSpawnSite` disappears as a player-facing outcome (**BREAKING**: the
  documented 503 on `POST /v1/corporations` is no longer a normal response; it
  survives only as a defensive rail for hard failures). New corporations land
  just beyond the settled fringe (nearest qualifying ring, uniform
  account-seeded draw); the old periphery weighting — and its
  `PeripheryWeight` param — retires with the finite galaxy.
- **`GET /v1/galaxy` serves the materialized set, not "the galaxy."** The
  star-layer response is bounded by what collectively exists in storage (which
  only grows via observation), not by a fixed generation. Bounds metadata
  becomes descriptive of the materialized extent rather than a generation
  parameter.
- Dev/test seeding semantics keep their shape: local boot materializes the
  origin neighborhood (the start area) from the fixed dev seed instead of
  generating a closed disc.

## Capabilities

### New Capabilities

*(none — this reshapes existing capabilities rather than adding a new surface)*

### Modified Capabilities

- `galaxy-view`: bridge lanes render visually distinct from ordinary lanes
  (the new `bridge` flag on the lane payload), identical for interaction.

- `galaxy-generation`: the core rewrite. Deterministic finite-disc
  generate-once becomes deterministic infinite field + lazy, idempotent
  materialization; Poisson placement moves from rejection-sampling-in-a-disc
  to hashed-cell (order-independent, local); lanes move from a global RNG pass
  to a local RNG computation with a length cap plus deterministic
  bounded-horizon bridge lanes under the origin-component play-space model;
  the read endpoint and persistence model serve and grow the materialized
  subset (bounds become monotonic materialized-extent metadata); naming and
  system/lane identity derive from stable field coordinates instead of
  generation-order indexes; generation params gain validation. (The baseline's
  placement-termination scenario disappears with rejection sampling itself —
  there is no `TargetCount` loop left to terminate.)
- `corporation-spawn`: Home Site Selection changes from "scan the finite graph,
  fail with `ErrNoSpawnSite` if nothing qualifies" to "walk outward over the
  lane graph, materializing each visited system's lane horizon, until a
  qualifying site exists" — no-spawn-site stops being a normal outcome;
  determinism (same account re-picks the same site against the same state) is
  preserved; a `spawnClaims` reservation plus a commit-time recorded home
  handle concurrent wakes and healing. The `Session Bootstrap and Wake-Up
  Endpoints` requirement is deliberately NOT modified — in-flight
  `add-credits-and-npc-market` modifies it, and the baseline text stays
  accurate; the corpless-on-failure guarantee lives in Home Site Selection.
- `observation-fog-and-scan`: scan resolution at the materialized frontier
  materializes the scanned system's onward neighborhood before charting lanes
  and minting far-endpoint rumors, so a scan never reports a false dead end —
  there is no observable "edge of the map."

## Impact

- **Backend `galaxy/`**: `generator.go` (placement + lanes) is largely
  rewritten around the cell field; `dao.go`/`service.go` gain
  materialize-if-absent (transactional cell anchors alongside `systems/` +
  `lanes/` docs); `GET /v1/galaxy` handler semantics per above; `cmd/seed` and
  the dev auto-seed materialize the origin neighborhood; `Galaxy.Bounds`
  semantics change.
- **Backend `corporations/`**: `siteselection.go` becomes an outward walk over
  the lane graph; `pickSpawnSite` grows a materialization dependency; params
  gain walk knobs (`MaxSpawnWalkBlocks` depth cap, `MaxSpawnRepicks`).
  Persisted model grows a `spawnClaims/{systemId}` reservation collection and
  a recorded home-system field on the corporation document (the home of
  record; healing reuses it).
- **Backend `observation/`**: scan resolve path calls galaxy materialization
  for the origin system's neighborhood before lane charting.
- **Frontend**: `GET /v1/galaxy` response shape gains one field — the lane
  `bridge` flag — otherwise unchanged (the map just grows over time).
  `GalaxyGraph.tsx` consumes `galaxy.bounds` for camera framing and the
  reference grid, so bounds must track the materialized extent. The
  start-area static asset generation (`cmd/seed start-area`) must track the
  new generator.
- **Tests/e2e**: `frontend/e2e/tests/spawn-exhaustion.spec.ts` inverts — the
  pin becomes "many consecutive fresh wakes all succeed and the world grows."
  Golden fixtures for `board/` are unaffected (board math is below this
  layer).
- **Data**: existing dev/test galaxies are throwaway (wipe + reseed); prod has
  no live galaxy yet. No migration path is needed, only a reseed.
- **Not in scope**: frontend viewport-driven partial galaxy fetch (payloads
  stay bounded by materialized size for now); travel-tech to cross voids wider
  than the lane cap; market/`surveyed`-tier interactions.

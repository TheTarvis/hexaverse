# Design — The Endless Galaxy

## Context

The galaxy today is a finite artifact: `galaxy.Generate(seed, params)`
rejection-samples `TargetCount` systems inside a disc of `RadiusXY`, derives
lanes as a **global** relative-neighbourhood graph (O(n³), whole-point-set),
persists everything once, and every consumer treats that set as the universe.
Two consumers can hit the edge of it:

- **Spawn site selection** (`corporations/siteselection.go`) scans all systems
  and fails with `ErrNoSpawnSite` when claims fence everything off — reproduced
  on dev 2026-08-12 (13 corps exhausted the 28-system start area). The wake
  path 503s and no new account can ever join that world.
- **Scans** (`observation`) chart "all the system's lanes" — at the rim, the
  true answer would be a dead end even though the fiction says space continues.

The chosen direction (design discussion, 2026-08-12): **the platonic infinite
field** — the galaxy is conceptually infinite and fully determined by the
seed; persistence only *materializes* the subset players have caused to be
observed. Not history-dependent growth: geometry must be identical regardless
of who probes what in which order. The codebase precedent is
`system-interior`: create-if-absent materialization on first touch.

Adversary round 1 (2026-08-12, `adversary-review-1.md`) broke the first
draft's connectivity proof (per-window non-emptiness is false; the 4-adjacent
scan horizon misses corner lanes) and found materialization races and
letter-vs-intent holes. The largest consequence is D4's reframing from
"global reachability via bridges" to "the play space is the origin
component." Round 2 (2026-08-20, `adversary-review-2.md`) found the bridge
mechanism had not followed that model change into the materialization rules
(a bridge's far block lay outside every horizon — it could never persist),
the spawn walk lacked an explicit materialization rule, and the spawn
reservation had no qualification effect. This revision closes those:
bridges carry their own materialization horizon (D5), the walk carries an
ensure rule (D6), and the reservation plus a commit-time recorded home are
the authoritative claim mechanics (D6).

## Goals / Non-Goals

**Goals:**
- Spawn never exhausts: site selection always succeeds by walking outward.
- Deterministic, order-independent geometry: same seed ⇒ same universe,
  regardless of materialization history; concurrent materialization converges.
- All generation becomes **local**: any region's systems and lanes computable
  from a bounded window of the field, never the whole world.
- An honest connectivity model: every corporation's home is lane-connected to
  every other's **by construction** (single shared play space), with bounded
  bridge stitching keeping that space robustly large — not an unprovable
  global-reachability claim.
- Existing read models (fog projection, `GET /v1/galaxy` shape modulo the
  lane `bridge` flag, board layer, system interiors) survive.

**Non-Goals:**
- Viewport/partial galaxy fetch on the frontend (payload stays "all
  materialized"; bounded by play activity for now).
- Travel mechanics for reaching lane-components disconnected from the origin
  component (their stars render as public astronomy; crossing to them is
  future content).
- Migrating existing persisted galaxies (dev/test are throwaway; prod has no
  live world). Reseed, don't migrate.
- Changing skeleton, naming *style*, region character, or fog semantics
  (except the deliberate public-astronomy decision in D8).

## Decisions

### D1 — Hashed-cell Poisson placement (order-independent, local)

Space becomes an unbounded 2D grid of cells in X/Y (Z stays a thin slab, as
today), `cellSize = max(MinGapByRegion)`. Each cell derives **at most one
candidate** purely from `hash(seed, cx, cy)`: jittered position within the
cell (Z jittered within ±`HalfHeightZ`), plus a priority value. Region is
classified from the existing fractal simplex noise at the candidate's
position (noise is already coordinate-pure and infinite — unchanged).

**Survival rule (biconditional):** a candidate survives **iff** no candidate
with *higher priority* lies closer than the larger of the two candidates'
region gaps. Conflicts are confined to the 3×3 cell window (cellSize = max
gap), so survival is computable locally and identically from anywhere.

*Why not true iterative Poisson (candidate dies only to a surviving
neighbor)?* That rule recurses along priority chains with unbounded depth —
correct answers can depend on arbitrarily distant cells, killing locality.
The kill-by-any-higher-priority-conflict rule is strictly local, at the cost
of sparser packing than true Poisson.

**What this does NOT guarantee (adversary B1):** there is no per-window
survivor floor. A window's best candidate can die to a higher-priority
candidate outside the window, and in sparse regions (dead/barrier gap ≈
cellSize) empty 3×3 windows are common and **empty blocks are expected**
over an infinite world. Nothing downstream may assume block non-emptiness;
D4 does not. What tuning *does* guarantee, and the generator statistics test
asserts, is a density band per region class over large areas (mean survivors
per cell within tolerance, no region class empty at scale).

*Dropped params:* `RadiusXY`, `TargetCount`, `MaxAttemptsPerNode` (no disc,
no count, no rejection loop). *Kept:* noise params, `MinGapByRegion`,
`HalfHeightZ`. *New:* `MaxLaneLength`, `BlockSize`, `BridgeSearchHorizon`,
`StartAreaBlockRadius`, and (in `SpawnParams`) `MaxSpawnWalkBlocks`.

### D2 — System identity from field coordinates

`sys-<index>` dies with generation order. A system's id becomes its cell
coordinates (e.g. `sys_12_-7`), its **stable field identity**. Naming keeps
the existing syllable generator but seeds from `hash(seed, cx, cy)` instead
of `(seed, index)`. `SystemSeed(galaxySeed, systemId)` and everything
downstream of it (skeleton, interiors) work unchanged — ids are just strings
to them. **Lane ids derive from the unordered pair of endpoint system ids**,
so a lane computed from either side of a block boundary is the same document
(load-bearing for D5's idempotency; specced, not just designed).

### D3 — Capped local RNG lanes

The relative-neighbourhood rule survives but goes local: edge (a, b) exists
iff `dist(a,b) ≤ MaxLaneLength` **and** no surviving candidate c has
`dist(c,a) < dist(a,b) && dist(c,b) < dist(a,b)`. Any such blocker lies
within `MaxLaneLength` of both endpoints, so the computation window is
bounded (≈ one `MaxLaneLength` around the pair) and the result is
order-independent — computed against the *field* (all surviving candidates
in the window, materialized or not), never against the persisted subset.
This yields the stability property the spec pins: later materialization can
never contradict an existing lane.

The cap makes voids real: dead/barrier space wider than `MaxLaneLength`
genuinely has no ordinary lanes across it — which is the "galactic barriers
as choke points" geography the original design wanted, made honest.

### D4 — Connectivity: the origin component IS the play space

Adversary round 1 killed the draft construction: its inductive proof rested
on per-block non-emptiness (false, D1) and its stitch was undefined for
empty blocks. Rather than repair the proof with a heavier construction
(hierarchical bridging degrades locality and still can't beat arbitrary
voids), the model changes to what the mechanics already enforce:

**The play space is the origin component** — the connected component of the
field's lane graph containing the origin system. Every mechanism that hands
a player a system travels *along lanes*: the spawn walk is a BFS over the
lane graph (D6), travel rides lanes, scans chart lanes incident to a system
the player reached. So every corporation's home — and everything it can
ever reach or chart — is lane-connected to settled space **by
construction**. No global reachability theorem is needed; the guarantee
"all homes share one component" is structural, and is what the spec pins.

**The origin system** (now defined once): the surviving candidate nearest
the field coordinate origin within the start area, ties broken by the
candidates' deterministic hash priority (adversary R2-m4). Seeding
validates the start area is non-degenerate (D5), then **records the origin
system id on the galaxy document**, so runtime consumers (the first-corp
walk) read it rather than re-deriving it — a later `StartAreaBlockRadius`
change cannot silently move it. A start area with no survivors or no
mineable survivor rejects the seed at seed time — an ops error, never a
runtime state.

**Bridge lanes** stay, demoted from proof-carriers to geography: they stitch
across voids and barrier bands that the lane cap would otherwise make
impassable, keeping the origin component robustly large. Construction, per
non-empty block P and each of the two positive cardinal directions (+x, +y):
find the nearest non-empty block Q in that direction within
`BridgeSearchHorizon` blocks; if Q exists and no ordinary lane already spans
P→Q's gap, add exactly one bridge: the closest system pair between P and Q,
hash tie-break. Properties: deterministic and order-independent (pure
function of the field within a `BridgeSearchHorizon`-bounded window); at
most one bridge per (P, direction); empty blocks simply don't originate
bridges (no undefined case); bridges may exceed `MaxLaneLength` — that is
their job. Voids wider than the horizon genuinely separate components —
accepted (Non-Goals), their stars visible as public astronomy.

Bridges carry `bridge: true` for distinct rendering (a `galaxy-view` delta
requirement) and future gameplay differentiation, but behave as ordinary
lanes mechanically. Because a bridge's far endpoint may lie beyond the
8-neighbourhood (that is the empty-block skip's whole point), bridges have
their **own materialization horizon** — D5 extends both the transaction's
anchor reads and the scan's ensured set to cover it; without that, a bridge
could never persist (adversary R2-B1).

**Residual risk — a small origin pocket:** the origin component could in
principle be finite (origin enclosed by wide voids), which would resurrect
exhaustion. Mitigations: (a) tuning keeps ordinary-lane connectivity far
from percolation-critical and `BridgeSearchHorizon` comfortably above
typical void widths (statistics test asserts component growth within the
test area); (b) seed-time validation walks the start area and rejects seeds
whose origin component is below a floor; (c) the D6 defensive cap remains
the runtime alarm. See Risks.

### D5 — The block is the materialization atom

**The block** (named in the spec, replacing the draft's overloaded
"region"): a `BlockSize × BlockSize` cell tile, with
`BlockSize · cellSize > MaxLaneLength` — **strictly** greater (adversary
R2-m2: at exact equality a lane could span two blocks apart) — so an
ordinary lane spans at most adjacent blocks, **including diagonals: the
ordinary-lane horizon of a block is its 3×3 block window** (adversary B2;
the draft's 4-neighborhood was wrong). `BlockSize` has no ≥3 floor (that
served the dead non-emptiness argument); the practical range is 4–8,
bounded above by the transaction write limit below.

Persistence: unchanged collections (`galaxies/{id}/systems`, `/lanes`) plus
an anchor subcollection `galaxies/{id}/blocks/{bx}_{by}`. Materializing a
block runs in one transaction keyed on the anchor: create-if-absent; if the
anchor exists, no-op. The transaction writes the anchor, the block's
systems, and lanes. **Cross-block lanes (adversary B3 + R2-B1):** the
transaction reads, *inside the transaction*, the anchors of **every block
that can share a lane with this block** — the eight neighbours (ordinary
lanes) plus every block within `BridgeSearchHorizon` along the four
cardinal axes (bridge far-endpoints, which skip empty blocks and so may lie
beyond the 8-neighbourhood) — and writes every lane, ordinary or bridge,
whose far endpoint's block is already materialized. Firestore OCC then
guarantees that of two concurrently materializing lane-sharing blocks, one
commits second, sees the other's anchor, and writes the shared lanes — they
cannot be lost, adjacent or bridged. Lane ids from the unordered endpoint
pair (D2) make the write idempotent from either side. Overlapping
multi-block materializations ({X,Y} vs {Y,Z}) converge block by block on
the same anchors.

There is **no contiguity invariant** (round 2 retired round 1's B4 patch:
nothing consumes 4-connectedness under the origin-component model, and the
scan's own 3×3 window plus bridge horizons violate the strict reading
anyway). `EnsureBlocks` remains a service-internal seam; the trigger rules
below determine which blocks it is handed. Seeding starts the materialized
set at the origin block.

Firestore's 500-writes/txn limit bounds `BlockSize`: a block of B×B cells
has ≤ B² systems + incident lanes; B in the 4–8 range keeps a comfortable
margin. **Params validation (adversary M9 + R2-m3)** rejects
`GenerationParams` where `MaxLaneLength ≤ 0`,
`BlockSize · cellSize ≤ MaxLaneLength`, `BlockSize < 1`,
`BridgeSearchHorizon < 1`, `MinOriginComponentSystems < 1`, or the
worst-case block write count exceeds the transaction limit — at seed time
and service construction, never silently.

**Trigger seams** (the only writers), all sharing one ensure rule — a
system's **full lane horizon** is its block's 3×3 window **plus the
far-endpoint block of every bridge incident to the system**:
- **Scan resolution** (`observation`): when a scan resolves *and the fleet
  is still in the origin system* (the fizzle test gates materialization —
  adversary R2-m1), ensure the scanned system's full lane horizon, then
  chart. A fizzled scan materializes nothing.
- **Spawn walk** (`corporations`): when the walk visits a system, it SHALL
  first ensure that system's full lane horizon, so the system's true
  incident lanes are enumerable before the walk expands past it (adversary
  R2-B2 — without this rule the walk stalls at the persisted frontier and
  503s, the exact bug this change kills).
- **Seeding** (`cmd/seed`, dev auto-seed): materializes
  `StartAreaBlockRadius` blocks around the origin block, validates the
  origin component floor (`MinOriginComponentSystems`) and ≥1 mineable
  system, records the origin system id on the galaxy document, and sets the
  live pointer. A seed failing validation leaves its already-written blocks
  under an unreferenced galaxy id — acceptable garbage, never live
  (adversary R2-m7). Same idempotence as today.

Plain reads never create system or lane documents themselves.
(`GET /v1/systems/:id` still runs due-action resolution first per
`system-interior`/`action-dispatch` — a due *scan* resolved by that read
materializes under the scan trigger above; the read itself creates
nothing.) `GetLiveSystem` on an unmaterialized id stays `ErrSystemNotFound`
— players can only name ids that reads/scans already handed them.

### D6 — Spawn site selection as an outward walk

Replaces scan-everything: BFS **over the lane graph** outward from the
claimed set (all living corps' explored systems); **when no corporation is
living, the walk begins at the origin system** (read from the galaxy
document — the first wake in a fresh world spawns near the origin,
specced). **The walk's materialization rule (adversary R2-B2):** when the
walk visits a system, it first ensures that system's full lane horizon
(D5: 3×3 window + incident-bridge far blocks), so its true incident lanes
exist before the walk expands past it — the world always grows one horizon
ahead of the search, and the frontier can never stall against unpersisted
space. At each hop, candidates are tested: mineable skeleton ∧
≥ `MinSpawnDistance` hops from claimed ∧ **no existing spawn reservation**
(below). The walk stops at the **first hop-ring containing ≥1 qualifier**
and draws **uniformly among that ring's qualifiers** with the
account-seeded source.

This retires frontier weighting (adversary M1): the nearest-qualifying-ring
rule places new corps just beyond the settled fringe — the deliberate
choice (design call, 2026-08-20): thematically "the frontier's edge,"
keeps neighbors reachable in a multiplayer game, and `PeripheryWeight`
(with its linear-vs-exponential doc discrepancy noted in the baseline)
retires with the mechanism.

**Claim mechanics (adversary R2-B3):** the corp-commit transaction creates
a `spawnClaims/{systemId}` reservation create-if-absent alongside the corp
doc and account pointer, **and records the picked home system id on the
corporation document**. The reservation is the authoritative claim signal —
a reserved system does not qualify — because the fog-derived "explored"
signal lands only *after* the corp transaction (`ensureSpawnAssets` →
`RevealArrival`), so a concurrent loser re-running against explored-space
alone would re-derive the identical pick forever. With reservations as a
qualification input, the loser's re-run sees the winner's reservation and
lands elsewhere; re-runs are bounded by `MaxSpawnRepicks` (validated
positive), then `ErrNoSpawnSite`. The recorded home makes healing use the
corp's own committed choice instead of re-picking — no orphaned
reservations, and the reservation is permanent and corp-owned.
**Proximity under concurrency (adversary R2-M4, decided):** criterion (b)
is evaluated against the claimed space and reservations *visible at
selection time*; two spawns committing concurrently MAY land closer than
`MinSpawnDistance` — tolerated, not repaired (the reservation prevents
exact collision; a hop-radius proximity check inside the transaction would
require reading every corp's fog transactionally, which is not worth the
contention for a soft placement preference). Specced honestly as such.

(The same transaction ordering as the 2026-08-12 zombie-corp fix: site
selection fully precedes the corp commit, so any failure leaves the
account corpless — specced in Home Site Selection, deliberately NOT via
the `Session Bootstrap and Wake-Up Endpoints` requirement, which in-flight
`add-credits-and-npc-market` also modifies — adversary R2-M5.)

The defensive rail: `MaxSpawnWalkBlocks` — the walk's **expansion depth**,
the maximum block-hop distance from the block set where the walk began
(adversary R2-M3: never a count of blocks touched, which grows with the
frontier's width and would make the cap population-dependent; and never a
distance from the field origin, which would be a world boundary — B5).
Exceeding it returns `ErrNoSpawnSite` (503), which now signals
misconfiguration, field corruption, or the D4 origin-pocket risk — never
accumulating players. `MaxSpawnWalkBlocks` and `MaxSpawnRepicks` must be
positive (params validation); tests induce the failure by configuring them
low.

### D7 — Read endpoint semantics

`GET /v1/galaxy` returns all materialized systems + fog-filtered lanes.
Response shape gains exactly one field: the lane `bridge` flag (the
proposal's Impact says so; the draft's "shape unchanged" was wrong —
adversary M5). `Galaxy.Bounds` becomes the bounding box of the materialized
extent, stored on the galaxy doc and expanded by an **atomic monotonic max
applied in its own small retried transaction on the galaxy document,
immediately after each block-materialization transaction** (adversary
R2-m8 + R3-F1: inside the block transaction it is a global write hotspot
every materialization contends on; a plain read-then-write merge outside it
can lose updates and break the requirement's "bounds always contain every
materialized system" invariant; a dedicated single-document monotonic-max
transaction is neither — it cannot lose updates, only ever grows, and
contends on nothing but itself). One mechanism, not a fork (adversary M6);
it is
load-bearing: `GalaxyGraph.tsx` frames the camera rig and sizes the
reference grid from it. Payload growth is bounded by collective
observation, monitored via a materialized-block counter maintained by the
same merge; viewport fetch is the designated future fix (non-goal now).

### D8 — Materialization is public astronomy (deliberate)

Newly materialized systems enter **every** requester's star layer
immediately (the star layer stays unfogged, per the baseline). Consequence,
accepted deliberately (adversary M7): a corp watching `GET /v1/galaxy` can
infer where *someone* is scanning or spawning from new nodes appearing.
Rationale: the field is astronomy — stars are visible to telescopes;
materialization is a storage artifact, not knowledge the fog model tracks;
and gating the star layer per-corp would fork the "nodes are the free star
map" invariant every view is built on. The leak reveals activity location
only (no actor identity, no lanes, no tiers). Fog-gating newly materialized
systems until independently observed is noted as future work if the leak
proves exploitable. Specced with its own scenario so the next reviewer
knows it is a decision, not an oversight.

## Risks / Trade-offs

- **[Finite origin pocket]** The origin component could be finite; spawn
  walk would hit the cap and 503 — exhaustion's ghost → three-layer
  mitigation (D4): supercritical tuning asserted by generator statistics
  tests; seed-time origin-component floor validation (bad seeds rejected
  before going live); `MaxSpawnWalkBlocks` as the runtime alarm. Residual
  risk accepted pre-launch; a live-world remedy (raising
  `BridgeSearchHorizon` and re-stitching) is possible without breaking
  determinism of existing docs since bridges are additive.
- **[Density drift]** Kill-by-priority packs sparser than true Poisson and
  changes the feel of region density → tune `MinGapByRegion`/cell size
  against the current galaxy's look; the statistics test asserts per-region
  density bands and (m4) that barrier stays the sparsest class.
- **[Ugly bridges]** Long bridges across voids can look odd → `bridge: true`
  renders faint/distinct (galaxy-view delta); traversal cost is future
  tuning space.
- **[Txn contention on hot blocks]** Concurrent scans near the same frontier
  contend on the same anchors → Firestore txn retries + the no-op path make
  this safe and cheap; block granularity keeps the blast radius small.
- **[Scan latency spike]** A frontier scan may materialize up to 9 blocks
  inline → each is one bounded txn; scans are async actions resolved off
  the read path, so the cost is resolve latency, not a user-facing request.
- **[Unbounded storage growth]** The world only grows → growth requires
  player observation, rate-limited by gameplay; materialized-block counter
  for observability.
- **[Activity leak via star layer]** D8's accepted leak → monitored;
  fog-gating is the designed escape hatch if exploited.
- **[e2e world-shape assumptions]** `spawn-exhaustion.spec.ts` and any test
  assuming a fixed system count break → that spec inverts (N consecutive
  wakes all succeed and the materialized count grows); audit for
  `TargetCount`/fixed-size assumptions.

## Migration Plan

No data migration: dev/test worlds are wiped and reseeded (existing
`CleanupFirestoreTestData` + `make seed`); prod has no live galaxy. Rollout
is a single deploy; rollback is redeploying the previous build and reseeding
(pre-launch, no player data at stake). `cmd/seed start-area` regenerates
`frontend/public/galaxy/start-area.json` from the new generator so the
logged-out map matches the real origin neighborhood.

At archive/sync time, the baseline `galaxy-generation` spec's **Purpose**
and **Notes** must be rewritten alongside the requirement deltas (adversary
B7): Purpose drops "Generation happens once … never at request time" for
the materialized-subset framing with the three writer seams (scan resolve,
spawn walk, seeding); Notes drop "`Generate` has no HTTP write endpoint"
and the stale `cmd/seed start-area` description. The baseline
`corporation-spawn` Notes paragraph about `PeripheryWeight`'s weighting
discrepancy retires with the mechanism (D6). Replacement text is tracked as
a task.

## Open Questions

- Exact `BlockSize`, `MaxLaneLength`, `BridgeSearchHorizon`, and
  `StartAreaBlockRadius` values — tuned in implementation against the
  generator statistics tests and the current dev world's feel; the spec
  deliberately pins none of them (but does pin the relations among them —
  M9).
- Should bridge lanes be gameplay-differentiated (slower transit? scan-only
  discovery?) or purely cosmetic for now? Default: mechanically identical,
  visually distinct.
- Does `GET /v1/galaxy` need a soft pagination/size alarm before viewport
  fetch lands? Default: log-based monitoring only.

# Adversary Review #1 — add-endless-galaxy (2026-08-12)

Verdict: **BLOCKED** — 7 blockers, 11 majors, 7 minors. Round 1; repair pending.

---

# BLOCKERS

### B1. The non-emptiness bound that the whole connectivity proof rests on is unproven — and its stated argument is invalid
**Location:** `design.md` D1: *"**Consequence — every 3×3 cell window contains ≥1 survivor** (its highest-priority candidate beats all its conflicts)."* and D4: *"Every block contains ≥1 system."*

The parenthetical argument is false. The highest-priority candidate of a window W is only guaranteed to beat conflicts *inside* W; if it sits in a border cell of W, its own 3×3 conflict window extends outside W and a higher-priority outsider can kill it. Following the kill chain (each step +1 cell, strictly increasing priority) is unbounded, which is exactly the locality property D1 rejected true-Poisson for. Empirically this bites: in dead/barrier space `gap = 70 = cellSize` (`galaxy/params.go` defaults), so nearly every adjacent-cell pair conflicts and a candidate's survival probability is roughly `1/(1+E[conflicts])` ≈ 0.2 — an all-dead 3×3 window is a common event, and an all-dead `BlockSize × BlockSize` block is a rare-but-inevitable event across a world that grows forever.

**Exploit:** D4's intra-block repair and inter-block stitch are both defined as "shortest pair among the block's systems". For an empty block both are undefined; a straightforward implementation skips it, and the block grid silently partitions — two materialized regions with no path between them, permanently. Nothing in the delta detects this.

**Fix (smallest):** stop depending on per-block non-emptiness. Redefine the stitch as "for each adjacent block pair, if no ordinary lane spans the pair, bridge the shortest pair of systems drawn from the *nearest non-empty block in that direction*", and add a requirement + scenario in `specs/galaxy-generation/spec.md`: `#### Scenario: A block with no surviving candidates does not partition the graph`. Also drop the false one-line proof in D1 or replace it with the density statement the tuning actually guarantees.

### B2. The scan materialization horizon (4 adjacent blocks) is not the incident-lane horizon — diagonal blocks are missed
**Location:** `design.md` D5 ("four adjacent blocks"); `tasks.md` 3.1.

D4's constraint `BlockSize · cellSize ≥ MaxLaneLength` bounds a lane's reach to one block side — that is the 8-neighborhood, not the 4-neighborhood. A system near a block corner has ordinary lanes across the corner into diagonal blocks.

**Exploit:** a scan on a corner system reports fewer roads than the field has — the false dead end the observation delta forbids. Or it charts the diagonal lane anyway and rumors a far-endpoint system with no persisted document (`GET /v1/galaxy` ships a lane to a nonexistent node; `GetLiveSystem` 404s on a system the player was told about).

**Fix:** origin block **plus its eight adjacent blocks** (the 3×3 block window), pinned in the requirement text. Add scenario: `#### Scenario: A scan on a system near a block corner charts its cross-corner lanes`.

### B3. Cross-block lanes can be lost forever when two adjacent blocks materialize concurrently
**Location:** `specs/galaxy-generation/spec.md` ADDED requirement (convergence specced only for the *same* region); `design.md` D5.

Block A's transaction observes B unmaterialized and skips the A–B lanes; block B's transaction observes A unmaterialized and skips them too. Both commit. The lanes never exist — and re-materialization is specced as a strict no-op, so nothing repairs them.

**Exploit:** neighbor-block existence checked *outside* the transaction ships permanent lane holes; every scenario in the change still passes.

**Fix:** add scenario `#### Scenario: Adjacent regions materialized concurrently keep every lane between them`, and state the mechanism constraint: neighbor-materialization state SHALL be read inside the same transaction that writes the block (or the no-op path SHALL repair missing cross-region lanes).

### B4. The reachability scenario is false as written for any non-contiguous materialization, and "the origin system" is undefined
**Location:** `specs/galaxy-generation/spec.md`, *Connected Lane Graph* scenario.

`EnsureBlocks(ctx, blockCoords...)` accepts arbitrary coordinates; materialize (0,0) and (50,50) and the persisted graph is provably disconnected. No requirement constrains materialization to a contiguous block set; "the origin system" is never defined (cell (0,0) may hold no survivor — see B1).

**Fix:** (a) add an invariant: materialization triggers SHALL only materialize blocks 4-connected to the already-materialized set (or state the guarantee over the *field* graph). (b) Scope the scenario to a 4-connected materialized set and define "origin system" once.

### B5. The spawn walk cap's unit is undefined; one reading reinstates the exact bug this change exists to kill
**Location:** `specs/corporation-spawn/spec.md` ("defensive maximum radius") vs `design.md` D6 / `tasks.md` 3.2 (`MaxSpawnWalkBlocks`).

Reading (ii) — block distance from the field origin — is a hard world boundary: as corps accumulate, the first qualifying ring recedes and eventually crosses it, and `POST /v1/corporations` 503s again, permanently. Also unspecified: zero/negative cap, and how a tester induces the failure.

**Fix:** state unit and frame — *"IF the walk expands more than `MaxSpawnWalkBlocks` blocks beyond the block where the walk began…"* — and add scenario `#### Scenario: A distant settled frontier still spawns`.

### B6. Placement is specced as an exclusion rule only — every placement scenario is vacuously satisfiable by an empty field
**Location:** `specs/galaxy-generation/spec.md`, *Region-Classified, Poisson-Spaced System Placement* ("survives only if").

"Only if" is necessary, not sufficient: a field with zero systems satisfies all three scenarios (vacuous spacing, 0 ≥ 0 density, reads nothing). The letter also permits the recursive kill rule D1 rejects, and arbitrary extra kill conditions.

**Fix:** make it biconditional ("if and only if") and add a density-floor scenario with an asserted lower bound: `#### Scenario: The field is populated at the configured density`.

### B7. Two unmodified baseline artifacts still mandate generate-once whole-galaxy semantics
**Location:** baseline `galaxy-generation` Purpose ("Generation happens once … never at request time"), untouched *Live Galaxy Persistence and Pointer* requirement ("WHEN `Generate` is called a second time…"), Notes ("`Generate` has no HTTP write endpoint").

After archiving, the merged spec asserts both "never at request time" and "scan resolution materializes".

**Fix:** add *Live Galaxy Persistence and Pointer* to the MODIFIED set (persist-and-repoint stays; regeneration scenario re-expressed as reseeding a new live galaxy), and include the Purpose/Notes rewrite in the change.

---

# MAJOR

### M1. "Frontier-favoring weighted pick" survives in the requirement text while the mechanism delivers the opposite
First-qualifying-ring BFS from claimed space places every new corp at the *minimum permitted* distance from existing corps — inverse of the baseline's periphery bias. The delta drops the baseline's weight definition without replacing it; "frontier-favoring" is undefined and untestable (a single ring is equidistant).
**Fix:** decide and state it. If the ring is the device: *"select the nearest hop-ring from settled space containing ≥1 qualifier and draw uniformly among that ring's qualifiers (account-seeded)"*, drop "frontier-favoring", note `PeripheryWeight`'s retirement (which also strands the baseline Notes paragraph about its doc discrepancy).

### M2. The first-corp / empty-claimed-set path is unspecified
"Settled space" undefined when no corporation exists. D6 answers ("origin block") but no requirement/scenario does. A plausible port 503s the very first wake in a fresh world.
**Fix:** requirement text ("when no corporation is living, the walk begins at the field origin block") + scenario `The first corporation in a fresh world spawns near the origin`.

### M3. No scenario anywhere pins the change's headline promise
"Can never exhaust" is tested by tasks but stated by no delta scenario; the existing "grows the world instead of failing" scenario is single-shot (one extra ring materialization satisfies it).
**Fix:** add `#### Scenario: Consecutive fresh wakes never exhaust the world` (N consecutive fresh spawns all succeed, materialized count strictly grows) and make the existing THEN repeat-until-found-or-cap.

### M4. The reachability requirement admits degenerate bridge constructions
"Bridge lanes sufficient to keep … reachable" is satisfiable by bridging every system directly to the origin. D4's actual construction appears in no requirement.
**Fix:** put the observable constraints in the requirement — at most one bridge per adjacent block pair, only when no ordinary lane spans it, joining the closest pair — plus scenario `No bridge is added where an ordinary lane already spans the pair`.

### M5. The `bridge` marker: demanded by design and tasks, absent from every requirement, contradicted by the proposal
Adding a lane field IS a response-shape change (proposal says "shape unchanged"); task 4.4 implements `galaxy-view` behavior no delta demands (galaxy-view isn't in Modified Capabilities).
**Fix:** either add the marker to *Connected Lane Graph* + a `galaxy-view` delta (bridge lanes render distinguishably) and correct the proposal, or drop the marker + task 4.4 from this change.

### M6. Bounds: no scenario, and the design leaves the mechanism forked
"Bounds of the materialized extent" has no scenario ("never update after seeding" passes everything); D7 says "updated by materialization (or computed on read)". Load-bearing on the frontend: `GalaxyGraph.tsx` calls `rig.frameBounds(galaxy.bounds)` and sizes the reference grid from bounds span.
**Fix:** scenario `Bounds track the materialized extent`; pick one mechanism in D7; add the camera-rig consumption to the proposal's Impact.

### M7. One corp's frontier scan publishes new stars to every other corp's map
Star layer is served unfiltered for every materialized system; materialization is player-triggered — corp B watching `GET /v1/galaxy` sees new nodes appear exactly where corp A is scanning. The change never decides this.
**Fix:** state the intent in the ADDED requirement — public astronomy (with a deliberate scenario) or fog-gate newly materialized systems until independently observed. Silence is the finding.

### M8. "Region" is overloaded, and the materialization unit is never named in the spec
`Region` already means star-rich/normal/dead/barrier in this spec and `model.go`. The block appears nowhere in the spec, so "the same region" has no granularity; overlapping-but-unequal materializations ({X,Y} vs {Y,Z}) fall outside the convergence guarantee.
**Fix:** name the block once, re-express convergence per block (atomic create-if-absent anchor; overlapping multi-block materializations converge block by block) + overlapping scenario.

### M9. Parameter invariants that silently break connectivity are unspecced and unvalidated
`BlockSize ≥ 3`, `BlockSize · cellSize ≥ MaxLaneLength`, txn write-count bound — design-only, and D4's "≥ 3" is inconsistent with D5's "4–8".
**Fix:** a params-validation requirement (reject violating `GenerationParams`) with a scenario per rejection; reconcile the design numbers.

### M10. Deterministic lane ids (and stable system ids) are design-only
Cross-block lane write idempotence (B3) depends on both sides deriving the same document id; the baseline's positional `lane-%d-%d` id would write reciprocal duplicates.
**Fix:** add to the ADDED requirement — system ids ARE field cell coordinates; lane ids derive from the unordered endpoint pair — plus scenario `A cross-region lane materialized from either side is one document`.

### M11. Concurrent spawns of *different* accounts can land on the same system, and the ring narrows the target
Two fresh accounts spawning simultaneously each compute `claimed` without the other; the candidate pool is now one hop-ring, so collision odds rise materially. Violates `MinSpawnDistance` with no detection or repair.
**Fix:** scenario `Two accounts spawning concurrently do not share a home system` (second observes the first's claim or re-picks).

---

# MINOR

- **m1.** "onward lane neighborhood" undefined in the observation delta — define as the 3×3 block window in the requirement text (see B2).
- **m2.** "the origin neighborhood" has no size in dev seeding — "a configured block radius around the field origin block"; pin that the start area contains ≥1 mineable system.
- **m3.** The 503 defensive-cap scenario has no inducible trigger — note the test hook (configure `MaxSpawnWalkBlocks` low); specify cap = 0.
- **m4.** Baseline scenario *"Barrier regions are the sparsest"* dropped without a REMOVED entry or reason — restore or state the removal. (`TargetCount`-termination scenario removal is correct but deserves a proposal line.)
- **m5.** Min-spacing scenario says "smaller of their two gaps"; the requirement (and code) guarantee the **larger**. Change "smaller" to "larger".
- **m6.** "Reads never grow the world" overstates — `GET /v1/systems/:id` resolves due actions and can transitively materialize (scan trigger). Rephrase: reads SHALL NOT themselves create system/lane documents; action resolution triggered by a read materializes under the scan trigger.
- **m7.** Stale baseline Notes (PeripheryWeight discrepancy; `Generate`/`cmd/seed start-area` semantics) — fold note updates into the change.

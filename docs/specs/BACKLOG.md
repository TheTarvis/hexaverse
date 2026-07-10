# Mechanics backlog — spec coverage map

> **Purpose.** One scannable list of every game mechanic the design so far
> implies, with its current **coverage**, so we can see at a glance what has no
> spec and decide per row: **write a spec**, **fold into another**, or
> **scratch it**. This is a planning artifact, not a commitment — everything
> here is drawn from `../vision.md`, `../plans/BRAINSTORM.md`,
> `../plans/market.md`, and the archived `git show bf9c637:client/docs/Gameplay.mdc`.
>
> Keep it current: when a mechanic graduates to a spec, flip its row to ✅ and
> link the spec number. Created 2026-07-06; **last refreshed 2026-07-09** against
> the plan docs (fog-of-war, movement-galaxy, movement-board, hex-board,
> camera-and-input), which have moved well ahead of the original list.

## Legend

| Mark | Coverage |
|------|----------|
| ✅ | **Spec exists** (draft/accepted/implemented) — see spec # |
| 📝 | **Scoped in a plan doc**, not yet a spec — ready to graduate |
| 💭 | **Idea only** — named in vision/brainstorm, not scoped |
| ⬜ | **Decision needed** — may be spec'd, folded, or scratched |
| 🎯 | Needed for the **first vertical slice** (`../vision.md`) |
| ⏸ | Explicitly **deferred past the slice** (still wanted) |

---

## World & generation

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| Galaxy generation (procedural node graph, regions, lanes) | ✅ #0001 | Accepted. Now also generates each system's **major-body skeleton** up front (`../plans/fog-of-war.md` option (a) — the graph shows the inventory). |
| Frozen start area (logged-out landing) | ✅ #0001 | Decided as an *acceptance criterion* on #0001, not its own spec (`vision.md`). |
| Ever-growing frontier / expansion cadence | 💭 ⏸ | #0001 makes the model *appendable*; the **trigger + cadence** is a deferred spec. |

## Strategic layer — the galaxy graph

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| Galaxy view (3D force-graph UI, intel panel, inspector) | ✅ #0002 | Accepted. Camera/input model now scoped in `../plans/camera-and-input.md` (folds in — see below). |
| **Camera & input** (galaxy-tier 3D camera: RTS pan-orbit, Z-up, gestures) | ✅ #0002 🎯 | **Folded into [#0002](0002-galaxy-view.md) 2026-07-09** (its Decision #8 + "Camera & input" design section): RTS pan-orbit, Z-up, height-scaled ground-plane pan, unclamped pitch, trackpad gesture map, double-click focus + ⌖ recenter — decided in `../plans/camera-and-input.md`, proven in the `galaxy-3d` spike. The plan doc keeps the decide-while-building questions. |
| **Fog of war** (per-player visibility, scan radius, re-fogging) | ✅ #0006 🎯 | **Graduated 2026-07-09 as [#0006 scan-and-fog](0006-scan-and-fog.md) (accepted)** — the intel data model + live visibility; **absorbs the Scan row** below; replaces the #0001/#0002 `discovered` stub with a subspace enum. Design in `../plans/fog-of-war.md`; prototyped in the `hex-board` spike. |
| **Inter-system travel / movement on the graph** (lane cost, FTL tiers, relay chains) | ✅ #0008 🎯 | **Graduated 2026-07-09 as [#0008 movement-galaxy](0008-movement-galaxy.md) (accepted)** — 5 locked decisions (length-weighted time cost, jump-range FTL, fleet-is-mover, destination-on-arrival reveal, three orthogonal fast-travel mechanisms); slice = lanes-only; **spike in progress**. Design in `../plans/movement-galaxy.md`. |

## Tactical layer — the per-system hex board

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| **System interior generation** (hex board: resource tiles, hazards, tile traits) | ✅ #0003 | **Accepted** (was Draft). Star-centered orbital rings, **bodies** as the anchor, orbital elements in-schema (motion deferred), two-phase generation (skeleton eager / detail on first arrival — resolved in `fog-of-war.md`). Design in `../plans/hex-board.md`. |
| **Hex board view / renderer** (2D SVG) | ✅ #0007 🎯 | **Graduated 2026-07-09 as [#0007 hex-board-view](0007-hex-board-view.md) (accepted)** — SVG renderer, quantize-the-sim/interpolate-the-picture, three fog bands, select→preview→commit. Companion to #0003, like #0002 is to #0001. Design in `../plans/hex-board.md`; prototyped in the `hex-board` spike. |
| **In-system movement** (ships across hexes, sublight/FTL, tile-trait effects) | ✅ #0004 | Accepted. **Coast & thrust** over the orbital board — coast rides your orbit, thrust plots a burn, click-to-intercept moving bodies, dock to ride; the **fleet** is the mover, movement resolves async. Design in `../plans/movement-board.md`. Pairs with #0003. **Assumes the action/timer spine (below) — currently unspec'd.** |
| **Scan** (reveal tiles, detect resources/hazards/players → produce *intelligence*) | ✅ #0006 🎯 | **Absorbed into [#0006 scan-and-fog](0006-scan-and-fog.md)** (2026-07-09): a scan does double duty — reveals to me (fog) **and** mints a timestamped observation into intel inventory; rides #0005 (commit-time ETA; resolves correctly even late). |
| **Mine** (extract materials from resource tiles) | ✅ #0010 🎯 | **Graduated 2026-07-09 as [#0010 mine](0010-mine.md) (accepted)** — first mutating verb on #0005's ledger; ships-compose/fleet-acts roster model, fleet-level cargo pool, docked-to-mine, tonnage-target runs, **lodes deplete in the slice** (keeps players exploring + moving); fuel–tonnage coupling explicitly deferred to #0004's fuel economy. |
| **Research** (research points / tech unlocks) | 💭 ⏸ | Named as a core action; depth deferred. |
| **Combat** (ship/unit fighting; loss stakes) | 💭 ⏸ | A real pillar "alongside, not above" exploration; lethality tuning open. Deferred past slice. |

## Player, units & progression

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| **Player spawn & placement** (identity model, wake-up system, spawn spacing) | ✅ #0009 🎯 | **Graduated 2026-07-09 as [#0009 spawn](0009-spawn.md) (accepted)**; design in `../plans/spawn.md` (identity + death rules **DECIDED** 2026-07-09). Bobiverse frame: the player is an **uploaded mind**; Corporation = the *lineage of copies*, fleet = a replicant copy in a hull; starting package = **one hull**; drift lore is canon ("follow your own path"). Corp dies with its **last** fleet; restart = **backup-restore** (a drifted copy wakes fresh). Placement criteria leaning (unclaimed + bootstrap-guaranteed + frontier-weighted); **spacing formula deliberately open** — a whole-graph property, decide with real graphs + frontier cadence. |
| **Corporation** (persistent stake; total-loss triggers; restart-fresh) | ✅ #0009 ⏸ | **Core rules DECIDED 2026-07-09 — recorded in [#0009 spawn](0009-spawn.md)** (`../plans/spawn.md`): the Corporation is the *mind's lineage* — alive while ≥1 fleet lives, gone with the last fleet; restart = backup-restore (a drifted copy wakes fresh, nothing mechanical carries). Full restart flow + orphaned-asset rules stay deferred (combat era). |
| **Units / assets taxonomy** (Ship, Base, Site, Probe, Relay, Outpost) | 💭 ⬜ | From `Gameplay.mdc`; decide which survive the rebuild. Fog/movement docs already lean on it (relays as sensors/network, mining sites, the fleet). Spawn lore (`../plans/spawn.md`) defuses the urgency: nothing but the first hull exists at spawn, so this is a **build-tree** decision — decide it with the build verb, not before. |
| **Territory / influence** (control rules, influence radius, territory score) | 💭 ⬜ | Heavy in the *old* single-map design; 2.0 leans reputation/leaderboards instead. **Decide if it survives** or is scratched. |
| **Progression axes** (ships/exploration tech, research tree, fleet/infra, wealth) | 💭 ⏸ | Kept "gentle parallel drips"; pacing is an open decision. Concrete sub-axes now named: sensor (fog), engine (movement-board), drive jump-range (movement-galaxy). |
| **Reputation / leaderboards** (discoveries, wealth, territory ranking) | 💭 ⏸ | Light ongoing competition throughline. |

## Economy

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| **Intel market** (knowledge economy: verified, freshness-gated auction house) | 📝 ⏸ | Deeply scoped in `../plans/market.md`; **core + shape-definers locked**, ready to `/spec intel-market`. The **signature mechanic** — but builds **on** `scan-and-fog` (where an intel item is born), so spec that first. |
| **Goods / materials market** (regional pricing, arbitrage) | 💭 ⏸ | Sketched in `BRAINSTORM.md` (Goods & logistics). |
| **Station / relay network** (jump-gate teleport, tolls, last-mile haul) | 💭 ⏸ | The shared network both economies ride; player-built frontier extension. Two-network model (data vs. mass) now recorded in `fog-of-war.md` + `market.md`. |
| **Currency & credits** (single credit; sinks/faucets) | 💭 ⏸ | Listing fees + transfer tolls are the primary sinks. |
| **Async shipments / logistics** (queued freighter travel, at-risk in transit) | 💭 ⏸ | The last-mile-haul verb; ties to the pacing model. |

## Cross-cutting systems

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| **Action / timer system** (real-time actions that resolve while offline) | ✅ #0005 🎯 | **Graduated 2026-07-09 as [#0005 action-timer](0005-action-timer.md) (accepted)**; design in `../plans/action-timer.md` (core **DECIDED** 2026-07-09). The async spine every verb rides; #0004 (accepted) and both movement docs *assume* it. Architecture: **one `action` entity, two resolution strategies** (kinematic = computed from `worldTime`; mutating = appends to an **event-sourced ledger**), lazy ETA-ordered resolve-on-read **plus an in-slice ~15-min Scheduler sweep** (an ordinary reader on a clock — resolves anything outstanding; never the correctness mechanism), fleet-owns-state (#0004), one scaled `worldTime` function. Rides Volt SSE + Pub/Sub (invalidation-only). Riders closed 2026-07-09 (slice mines **point-at-ETA**, cycle-quantized flow later; notifications cut from the slice — Resend rides the sweep post-slice). Spec'd first, as planned — #0006–#0008 build on it. |
| **Predictable-coast vs. loud-burn** (emergent: movement × intel × stealth) | 💭 ⏸ | *Cool emergent idea* — coasting is deterministic so a fleet's **future position is knowable → sellable intel**; thrusting goes **volatile/"loud"** → juke a pursuer but expose yourself *now*. Wires movement (#0004) ↔ fog ↔ intel market (predicted *ephemeris* as a product) ↔ combat. Nearly free from the model; design *toward* it, not a slice feature. See `../plans/BRAINSTORM.md` §Predictable drift vs. loud burn. |
| **AI bots / living world** (populate, chat, small trades) | 💭 ⏸ | Fits `claude-agent`. Explicitly not in the slice. |
| **Multiplayer contact / social** (alliances, messaging, shared discovery) | 💭 ⬜ | Beyond the market — open whether it's in scope at all. Fog is strictly per-Corporation (decided), so shared vision is a *market* problem, not a fog one. |
| **New-player grace / danger tuning** | 💭 ⬜ | Open question; may live *inside* the spawn and combat specs rather than its own. |
| **Tutorial / guided onboarding** (in the start area) | 💭 ⏸ | The start area "graduates" into a tutorial home later (`vision.md`). |
| **Auth & onboarding** | ✅ (platform) | Firebase auth is Volt baseline; the game-specific piece (frozen start area as landing) folds into #0001/#0002. |

---

## Reading the map — where the gaps cluster (2026-07-09)

- **The strategic + tactical *generation* layers are spec'd and accepted** (#0001–#0004).
- **The 2026-07-09 graduation batch put the verbs, glue, and renderers into spec**
  (**all accepted 2026-07-09**): **#0005 action-timer** (the async spine, spec'd
  first as planned), **#0006 scan-and-fog** (absorbs Scan), **#0007 hex-board-view**,
  **#0008 movement-galaxy**, **#0009 spawn**.
- **The last two 🎯 gaps closed 2026-07-09**: **mine** graduated as #0010
  (accepted), and **camera & input** folded into #0002 (Decision #8).
  **Every 🎯 row is now spec-backed.**
- **The economy is well-thought-out but all deferred (⏸)** — `intel-market.md`
  (ready, but builds on #0006) plus several idea-level sketches.
- **A few carryovers need a keep/scratch call (⬜):** unit taxonomy (now defused to a
  build-verb-time decision — #0009), territory/influence, multiplayer-social.

## Suggested next steps (2026-07-09)

1. ~~Review + accept the #0005–#0009 drafts~~ — **done 2026-07-09**; all five
   accepted with their riders resolved.
2. ~~**Mine**~~ — **accepted 2026-07-09 as [#0010 mine](0010-mine.md)** (tonnage-
   target runs; lodes deplete in the slice).
3. ~~**Camera & input**~~ — **folded into #0002 2026-07-09** (Decision #8 + its
   "Camera & input" design section).

*(Every 🎯 row is spec-backed — the slice backlog is closed and buildable in
spec order: #0001→#0010. **The implementation roadmap is
[`../plans/build-order.md`](../plans/build-order.md)** (2026-07-09) — ten
demoable milestones M1–M10 mapping onto the specs. Next up when appetite
returns: the ⏸ economy stack, starting with `/spec intel-market`, and the ⬜
keep/scratch calls.)*

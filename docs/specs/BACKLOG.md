# Mechanics backlog — spec coverage map

> **Purpose.** One scannable list of every game mechanic the design so far
> implies, with its current **coverage**, so we can see at a glance what has no
> spec and decide per row: **write a spec**, **fold into another**, or
> **scratch it**. This is a planning artifact, not a commitment — everything
> here is drawn from `../vision.md`, `../plans/BRAINSTORM.md`,
> `../plans/market.md`, and the archived `git show bf9c637:client/docs/Gameplay.mdc`.
>
> Keep it current: when a mechanic graduates to a spec, flip its row to ✅ and
> link the spec number. Created 2026-07-06.

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
| Galaxy generation (procedural node graph, regions, lanes) | ✅ #0001 | Accepted. |
| Frozen start area (logged-out landing) | ✅ #0001 | Decided as an *acceptance criterion* on #0001, not its own spec (`vision.md`). |
| Ever-growing frontier / expansion cadence | 💭 ⏸ | #0001 makes the model *appendable*; the **trigger + cadence** is a deferred spec. |

## Strategic layer — the galaxy graph

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| Galaxy view (3D force-graph UI, intel panel, inspector) | ✅ #0002 | Accepted. |
| **Fog of war** (per-player visibility, scan radius, re-fogging) | 💭 🎯 | Referenced by #0001/#0002 (both *stub* a `discovered` flag). The **rules** — how visibility is computed and decays — need their own spec. Slice-relevant. |
| **Inter-system travel / movement on the graph** (lane cost, FTL tiers, relay chains) | 📝 🎯 | Scoped in `../plans/movement-galaxy.md`: **lane travel** over the #0001 node graph — click a destination, game pathfinds the lanes, ETA async; travel into a visible lane *reveals* the system (fog Explored). Slice = lanes-only. |

## Tactical layer — the per-system hex board

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| **System interior generation** (hex board: resource tiles, hazards, tile traits) | ✅ #0003 | Draft. Star-centered orbital rings, **bodies** as the anchor, orbital elements in-schema (motion deferred), generator dialed by graph-tier character. Design in `../plans/hex-board.md`. |
| **Hex board view / renderer** (2D canvas/SVG?) | 📝 🎯 | **Renderer decided (`../plans/hex-board.md`): SVG** (bounded ~150-tile board). Companion to the interior-gen spec, like #0002 is to #0001. |
| **In-system movement** (ships across hexes, sublight/FTL, tile-trait effects) | ✅ #0004 | Accepted. **Coast & thrust** over the orbital board — coast rides your orbit, thrust plots a burn, click-to-intercept moving bodies, dock to ride; the **fleet** is the mover, movement resolves async (arrival computed, not scheduled). Design in `../plans/movement-board.md`. Pairs with #0003. |
| **Scan** (reveal tiles, detect resources/hazards/players → produce *intelligence*) | 💭 🎯 | Core slice action + the source of the knowledge economy. |
| **Mine** (extract materials from resource tiles) | 💭 🎯 | Core slice action. |
| **Research** (research points / tech unlocks) | 💭 ⏸ | Named as a core action; depth deferred. |
| **Combat** (ship/unit fighting; loss stakes) | 💭 ⏸ | A real pillar "alongside, not above" exploration; lethality tuning open. Deferred past slice. |

## Player, units & progression

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| **Player spawn & placement** (starting system + package, min/max spawn padding) | 💭 🎯 | Slice step 3. Spawn-padding rules carried from `Gameplay.mdc`. |
| **Corporation** (persistent stake; total-loss triggers; restart-fresh) | 💭 ⏸ | The persistent player entity. Loss/restart rules are open (`BRAINSTORM.md`). |
| **Units / assets taxonomy** (Ship, Base, Site, Probe, Relay, Outpost) | 💭 ⬜ | From `Gameplay.mdc`; decide which survive the rebuild. |
| **Territory / influence** (control rules, influence radius, territory score) | 💭 ⬜ | Heavy in the *old* single-map design; 2.0 leans reputation/leaderboards instead. **Decide if it survives** or is scratched. |
| **Progression axes** (ships/exploration tech, research tree, fleet/infra, wealth) | 💭 ⏸ | Kept "gentle parallel drips"; pacing is an open decision. |
| **Reputation / leaderboards** (discoveries, wealth, territory ranking) | 💭 ⏸ | Light ongoing competition throughline. |

## Economy

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| **Intel market** (knowledge economy: verified, freshness-gated auction house) | 📝 ⏸ | Deeply scoped in `../plans/market.md`. The **signature mechanic** — ready to graduate to a `/spec`. |
| **Goods / materials market** (regional pricing, arbitrage) | 💭 ⏸ | Sketched in `BRAINSTORM.md` (Goods & logistics). |
| **Station / relay network** (jump-gate teleport, tolls, last-mile haul) | 💭 ⏸ | The shared network both economies ride; player-built frontier extension. |
| **Currency & credits** (single credit; sinks/faucets) | 💭 ⏸ | Listing fees + transfer tolls are the primary sinks. |
| **Async shipments / logistics** (queued freighter travel, at-risk in transit) | 💭 ⏸ | The last-mile-haul verb; ties to the pacing model. |

## Cross-cutting systems

| Mechanic | Coverage | Notes / next step |
|----------|----------|-------------------|
| **Action / timer system** (real-time actions that resolve while offline) | 💭 🎯 | The *foundation* of the async cadence — scan/mine/research/travel all queue and complete over time (slice step 6, "see it persist"). Rides Volt SSE + Pub/Sub. Likely an early foundational spec, not a late one. |
| **Predictable-coast vs. loud-burn** (emergent: movement × intel × stealth) | 💭 ⏸ | *Cool emergent idea* — coasting is deterministic so a fleet's **future position is knowable → sellable intel**; thrusting goes **volatile/"loud"** → juke a pursuer but expose yourself *now*. Wires movement (#0004) ↔ fog ↔ intel market (predicted *ephemeris* as a product) ↔ combat. Nearly free from the model; design *toward* it, not a slice feature. See `../plans/BRAINSTORM.md` §Predictable drift vs. loud burn. |
| **AI bots / living world** (populate, chat, small trades) | 💭 ⏸ | Fits `claude-agent`. Explicitly not in the slice. |
| **Multiplayer contact / social** (alliances, messaging, shared discovery) | 💭 ⬜ | Beyond the market — open whether it's in scope at all. |
| **New-player grace / danger tuning** | 💭 ⬜ | Open question; may live *inside* the spawn and combat specs rather than its own. |
| **Tutorial / guided onboarding** (in the start area) | 💭 ⏸ | The start area "graduates" into a tutorial home later (`vision.md`). |
| **Auth & onboarding** | ✅ (platform) | Firebase auth is Volt baseline; the game-specific piece (frozen start area as landing) folds into #0001/#0002. |

---

## Reading the map — where the gaps cluster

- **The whole tactical layer is unspec'd.** #0001/#0002 build the *strategic*
  (graph) layer; the entire hex board — interior generation, its renderer,
  movement, **scan**, **mine** — has no specs yet, and most of it is
  slice-critical (🎯).
- **Two foundational cross-cutting mechanics have no spec but everything leans
  on them:** **fog of war** (every view stubs it) and the **action/timer
  system** (every action resolves through it). These are good candidates to
  spec *before* the individual actions that depend on them.
- **The economy is well-thought-out but all deferred (⏸)** — one plan doc
  (intel market, ready to graduate) and several idea-level sketches.
- **A few carryovers need a keep/scratch call (⬜):** territory/influence, the
  full unit taxonomy, multiplayer-social.

## Suggested next specs (priority = slice-critical foundations first)

1. **Action / timer system** — the async spine every verb needs.
2. **Fog of war** — unblocks the stubs already sitting in #0001/#0002.
3. **System interior generation** + **hex board view** — the #0001/#0002 pair,
   one tier down.
4. **Player spawn** — puts a Corporation on the board.
5. **In-system movement + scan + mine** — the "do one satisfying thing" verbs.

*(Order is a suggestion, not a decision — this backlog exists so you can pick.)*

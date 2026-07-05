# Hexaverse 2.0 — Brainstorm

> **Living doc, high-level only.** A scratchpad to fill in blanks before
> anything hardens into `docs/vision.md` or a spec. Nothing here is committed
> design. `?` marks an open question; **TODO** marks a blank to fill.

## The one-liner

A **web-based multiplayer space-exploration game** — chill, persistent, a
few-minutes-at-a-time time-sink you dip into throughout the day. Explore a
galaxy, run ships, mine and research, trade materials and *intelligence*, and
share the world with other players **and AI bots that actually interact**.

## Vibe / pillars

- **Exploration first.** Discovery is the core reward, not combat.
- **Chill / async.** Play in short bursts; the world advances while you're
  away. No twitch reflexes, no obligation to grind.
- **Living world.** Other players + AI bots make the galaxy feel populated and
  reactive even when few humans are online.
- **Knowledge is a commodity.** What you've scanned/discovered has value —
  intelligence is tradable, not just materials.

## Two-tier map (the core UI idea)

### 1. Galactic view — the node graph
- Based on the **WebGraph** UI (`canvas/README.md`,
  `canvas/Screenshot 2026-07-02 at 10.37.18.png`).
- Force-directed graph of **star systems as nodes**, **lanes/routes as edges**.
- Layout toggles (organic / sphere / radial / tree) already in the reference.
- Left panel = **intel / stats / economy** (reuse the "Site Intel" +
  "Live Stats" pattern). Right panel = **inspector** for the selected system.
- Fog of war applies here too — undiscovered systems are hidden/dim.

### 2. Solar-system view — the hex grid
- Click a system node → drill into a **hex-grid board** for that system.
- On the board you move **ships** and take actions per tile:
  **scan / mine / research / fight**.
- This is where the original Hexaverse hex mechanics live (axial coords, tile
  traits, scan/influence radius — see archived `Gameplay.mdc`).

> Mental model: **graph = strategic/overview layer, hex grid = tactical/action
> layer.** Zoom out to navigate the galaxy, zoom in to *do things*.

## Core actions (in-system)

- **Scan** — reveal tiles / detect resources, hazards, other players. Produces
  *intelligence* (tradable).
- **Mine** — extract materials from resource tiles.
- **Research** — generate research points / unlock tech.
- **Fight** — combat between ships/units. **Meaningful but not dominant**: a
  real pillar (contest resources, defend territory) that sits *alongside*
  exploration and economy, not above them. Should add stakes without breaking
  the chill vibe. ? How lethal — leaning toward setbacks over total wipes.
- **Move** — ships traverse hexes; travel between systems happens on the graph.

## Economy

- **In-game marketplace** to **buy and sell**:
  - **Materials** — mined resources.
  - **Intelligence** — scan data, maps, system reports, locations. *(The novel
    part — a knowledge economy.)*
- **Intel = resellable data.** Intel is copyable — you can sell the same map
  to many buyers. Information spreads, and its value **decays as it becomes
  common knowledge**. This makes exploration a renewable income stream (be
  first to a discovery) rather than a one-shot, and creates a liquid, dynamic
  info market. Implications to design around:
  - Fresh/rare intel commands a premium; widely-sold intel trends toward
    worthless. ? Model the decay explicitly (price falls with number of copies
    sold / time since discovery).
  - Edge overlaps with **time-decay** (fleets move, resources deplete), so old
    intel is both *common* and *stale* — reinforces re-scanning.
  - First-mover advantage is the reward for exploring; the market punishes
    hoarding common data.
- ? Currency model — single credit? multiple resource types bartered?
- ? Market structure — global exchange? per-system/regional? player-to-player
  contracts?
- ? Sinks & faucets — what removes currency so it doesn't inflate.

## AI bots as players

- **Flavor / NPC-lite.** Bots add life and interaction — they populate the
  world, chat, offer small trades or quests, and make the galaxy feel inhabited
  — but they **don't meaningfully drive prices**. Lower-stakes and much easier
  to balance than autonomous market-makers.
- They still **interact with players**: conversation, small trades, reactions
  to what's happening nearby.
- Natural fit for this repo's `claude-agent` (LLM tool-calling agent already
  calls the backend with a user token).
- Because bots aren't the liquidity source, market liveliness when few humans
  are online comes from the **persistent async world** — standing buy/sell
  orders and queued actions sit on the exchange and resolve over time.
- ? Personality flavor — a few recognizable archetypes (trader, explorer,
  wanderer) for texture.
- ? How many, how visible, and do players know who's a bot?

## Session / pacing model

- Designed for **short, frequent sessions**.
- **Real-time with offline progression.** Actions (mine/scan/research/travel)
  take real minutes–hours and **complete while you're away**. The loop is:
  check in → collect finished actions → queue the next ones → leave. Classic
  chill/idle async cadence.
  - ? Queue depth — how much can you line up before needing to return (governs
    how "sticky" vs "relaxed" the check-in rhythm feels).
  - ? Soft catch-up so returning after a long break isn't punishing, without
    making constant check-ins pointless.
- ? Any daily hooks (a reason to check in) without becoming a chore/grind.

## Multiplayer & world shape

- **One shared persistent galaxy.** A single universe everyone plays in — the
  deepest "living world" feel and the richest intel market. Trade-offs to
  design around:
  - ? Newcomer vs veteran balance — how a fresh player finds footing in an
    established economy (catch-up mechanics, protected starter regions).
  - ? Map growth / sprawl over time as more players join — does the galaxy
    expand, or is it fixed and contested?
- ? How players meet — spawn padding rule from original design (room to grow +
  someone nearby to find).
- ? Direct interaction beyond the market — alliances, messaging, shared
  discovery?
- ? Scale target (handful of friends vs public) — this is also a `vision.md`
  open question.

## First vertical slice (smallest playable thing)

The goal: prove the **core loop feels good** before layering economy and bots.
High-level, roughly in build order:

1. **Generate a galaxy** — procedural node graph of star systems (spec 0001).
2. **Render it in the WebGraph view** — systems as nodes under fog; most are
   dim/undiscovered.
3. **Spawn the player** — a starting system + a ship or two, surrounding
   galaxy fogged.
4. **Drill into a system** — click a node → hex-grid board for that system.
5. **Do one satisfying thing on the board** — move a ship, **scan** to reveal
   tiles, **mine** a resource tile. Scanning produces *intelligence*.
6. **See it persist** — actions resolve over real time; come back and the
   scan/mine has completed.

That's the loop: *explore the graph → drill in → act on the hex board → return
later*. **Deliberately out of the first slice:** the marketplace, buying/selling
intel, combat, research depth, AI bots, multiplayer contact. Each becomes its
own spec once the loop is proven fun.

> Single-player-feeling at first is fine — one real player in the persistent
> galaxy still exercises the whole graph→grid→act→persist spine.

## Open questions parked for later

- Client renderer: the WebGraph graph is web/canvas/WebGL; the hex board is
  **TODO** (2D canvas/SVG likely).
- Progression: tech tree depth, ship types, upgrades — reuse from
  `Gameplay.mdc` or trim hard.
- First **vertical slice**: smallest thing that's fun — probably
  *generate galaxy → explore graph under fog → drill into a system → scan/mine
  one board*. Economy & bots layer on after.
- Monetization / accounts-at-scale — explicitly deferred for now.

## Source material

- UI reference: `docs/plans/canvas/` (WebGraph by kitakita).
- Original mechanics: `git show bf9c637:client/docs/Gameplay.mdc`.
- Vision + SDD: `docs/vision.md`, `docs/specs/`.

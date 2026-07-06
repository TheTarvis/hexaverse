# Hexaverse — Vision & Product Overview

> **Status: DRAFT (2026-07-06).** First pass at the *what and why*, distilled
> from `docs/plans/BRAINSTORM.md` — the current direction, which **supersedes**
> the earlier single-hex-map colonization/territory framing (archived in git
> history). This doc is the trunk: the north star and pillars that specs in
> `docs/specs/` hang off, and the source of truth for the "Purpose" /
> "Domain quick-reference" holes in `CLAUDE.md`. `?` marks a still-open
> decision; **TODO(travis)** marks a blank only you can fill. Edit freely.

## What it is

Hexaverse is a **web-based multiplayer space-exploration game** — a
*chill-paced but dangerous* browser MMO you dip into a few minutes at a time.
Explore a procedurally generated galaxy, run ships, mine and research, trade
**materials and intelligence**, and share one persistent world with other
players **and AI bots that actually interact**.

> **In a phrase:** a relaxed-cadence, knowledge-economy **EVE-lite**. The
> relaxation is in the *pace*, not a safe world.

It's played across a **two-tier map**:

- **Galactic view — a node graph.** Star systems are nodes, lanes/routes are
  edges. This is the strategic layer: navigate the galaxy under fog of war.
- **Solar-system view — a hex grid.** Click a system → drill into its hex
  board. This is the tactical layer, where you actually *do things* per tile:
  scan, mine, research, fight, move.

> Mental model: **graph = navigate, hex grid = act.** Zoom out to travel, zoom
> in to work.

This repo is the **2026-07-01 rebuild** on the Volt platform skeleton
(Hexaverse is Volt's first fork — the guinea pig). It keeps the *ambition* of
the original game but re-decides which features ship and in what order, and
moves the realtime layer from raw WebSockets to Volt's **SSE + Pub/Sub**. The
previous implementation is archived at branch `archive/pre-volt-reset` and
commit `bf9c637`.

## North star

> A **living, ever-expanding galaxy where knowledge itself is the currency** —
> exploration always pays because what you discover is the freshest and most
> valuable thing on the market, there's always new frontier to chart, and
> always someone out there to find.

The map itself is the source of drama: star-rich sectors, dead zones, barriers
that form choke points, and an **off-grid frontier** where the highest value
and the highest risk both live.

## Vibe / pillars

- **Exploration first.** Discovery is the core reward, not combat.
- **Chill / async.** Short bursts; the world advances while you're away. No
  twitch reflexes, no obligation to grind. Relaxation is in the *cadence*.
- **Knowledge is a commodity.** What you've scanned and discovered is a
  first-class, *tradable* good — the signature mechanic, not just materials.
- **Living world.** Players + AI bots make the galaxy feel populated and
  reactive even when few humans are online.
- **Stakes are real.** A dangerous universe — you can lose everything — but
  always restartable. Chill lives in the *pace*, not in safety.

## Who it's for

**A public browser game** — a single shared persistent world open to anyone,
aiming for organic multiplayer. Built solo, but the goal is a game people
actually *play*, not a portfolio piece. Going public raises real concerns down
the line — moderation, spawn density and matchmaking at both low and high
population, anti-cheat — but those are **later problems** (see *Non-goals*); the
first job is a loop that's fun for one player.

**Monetization: deferred, but real.** The game will eventually need to pay for
itself — likely **ads**, possibly another model (cosmetics, premium accounts —
undecided). The order is deliberate: **build something fun to play first, worry
about making money second.** No monetization work until the core loop proves
fun.

## Auth & onboarding stance

**Logged-out visitors see a fixed, curated *start area*** — a known welcome
sector (a **frozen slice**, not the live shared galaxy) they can look around
and click, to feel the game before signing up. **Real play — persistence,
economy, multiplayer — requires sign-in.** No account, no login page as a wall;
the start area *is* the landing.

- **Why a fixed known area, not the real world or a random one:** it sidesteps
  the two traps. Showing the *live* shared galaxy either leaks every real
  player's position or shows a logged-out viewer nothing (fog is per-player),
  and it drags in an anonymous backend read path. A **frozen, curated** sector
  is deterministic (cacheable, even a static asset — the logged-out path never
  hits the live generator at request time), always *looks good* (you vetted the
  layout), and is consistent for screenshots / SEO / sharing. Zero abuse
  surface, because nothing there is real or persisted.
- **The interaction boundary is "local & self-contained works; anything that
  persists or touches another player → sign in"** — not "everything greyed
  out." In practice a logged-out visitor can pan the graph, open a system, and
  see the tactical board on the frozen area.
- **It graduates:** the start area is the natural home for a guided **new-player
  tutorial** later, so it isn't throwaway. *(Open: whether real signups also
  play through it as a tutorial instance before joining the live frontier, or
  spawn straight to the frontier.)*
- **Deferred — anonymous "guest play" (real spawn, link-to-keep).** A lower-
  friction on-ramp where a visitor plays the *real* world as an anonymous
  Firebase account and links to Google to keep progress. Rejected for now: in a
  public shared economy, free anonymous accounts are a Sybil/abuse vector
  (alt-farming, market manipulation) that needs gating and account-reaping
  machinery not worth building pre-economy. Revisit as a conversion
  optimization once the economy — and its write-gates — exist.
- Implementation note: this only asks galaxy generation to be a clean
  `seed → graph` function so the start area can be produced from a known seed
  and frozen. Lands as an **acceptance criterion on the galaxy-generation
  spec**, not its own spec.

## Core loop

The persistent player entity is a **Corporation** — the operation you build up,
and can lose then restart.

1. **Explore** the galaxy graph under fog — undiscovered systems are dim.
2. **Drill in** to a system → its hex board.
3. **Act** on tiles: **scan** (reveals tiles + produces *intelligence*),
   **mine**, **research**, **fight**, **move**.
4. **Wait** — actions take real minutes–hours and **complete while you're
   away**. Check in → collect finished actions → queue the next → leave.
5. **Trade** — sell **materials** (regional, physical, arbitrage-driven) and
   **intelligence** (a global exchange, freshness-gated); buy to grow.
6. **Grow the Corporation** — ships, tech, infrastructure, wealth — knowing you
   can lose it all and spin up fresh at the frontier.

## Signature mechanics — what makes it *Hexaverse*

- **Two-tier map** — a galaxy node-graph over per-system hex boards.
- **Knowledge economy** — intel is a first-class, backend-**verified**,
  **freshness-gated** tradable good. A scan is a timestamped snapshot; the world
  moves on, so old intel is worth less → perpetual demand for fresh scans.
  Fully scoped in `docs/plans/intel-market.md` (the signature feature).
- **Dual economy on one network** — weightless, copyable **intel** and heavy,
  finite **goods** both flow over a shared **station/relay network**. The
  frontier is *off-grid*: freshest intel and richest materials, but stranded
  until you haul back or extend the net.
- **Corporation as the persistent stake** — high loss, guaranteed fresh start.
  Danger is everywhere; safety comes from strength, not from a safe zone.
- **Ever-growing frontier** — the galaxy expands outward; new players spawn at
  the fresh edge where their first-scans are genuinely valuable, so exploration
  never gets "solved."
- **AI bots as living-world flavor** — populate the world, chat, small trades
  (a natural fit for this repo's `claude-agent`); they **don't** drive prices.

## Goals of the rebuild

- **Prove out Volt** (auth, SSE, Pub/Sub, Firestore, the layered
  backend/frontend conventions) on a real game.
- **Realtime on SSE + Pub/Sub**, not raw WebSockets.
- **Ship a playable vertical slice** (below) before layering economy and bots.
- **Stay spec-first** — intent documented before code (`docs/specs/README.md`).

## First vertical slice — what "playable" means first

Prove the **core loop feels good** before any economy. Roughly in build order:

1. **Generate a galaxy** — procedural node graph of star systems.
2. **Render it** in the graph view — systems as nodes under fog, most dim.
3. **Spawn the player** — a starting system + a ship or two.
4. **Drill into a system** — click a node → its hex board.
5. **Do one satisfying thing** — move a ship, **scan** to reveal tiles, **mine**
   a resource. Scanning produces *intelligence*.
6. **See it persist** — actions resolve over real time; come back and they're
   done.

**Deliberately out of the first slice:** the marketplace, buying/selling intel,
combat, research depth, AI bots, multiplayer contact. Each becomes its own spec
once the loop is proven fun. *One real player exercising graph → grid → act →
persist is enough to validate the spine.*

## Non-goals (for now — "not in the slice," not "never")

- The **intel & goods market** — designed (`intel-market.md`), deferred past the
  slice.
- **Combat** depth — a real pillar eventually, but not first and not dominant.
- **Deep tech trees / all FTL tiers** — gentle parallel drips, not a grind.
- **AI bots** and **direct multiplayer contact** (alliances, messaging).
- **Monetization, accounts-at-scale, anti-cheat.**
- **3D rendering** — the original used Three.js; the hex-board renderer is
  **TODO(travis)** (2D canvas/SVG is the simpler starting point).

## Open decisions (the big undecided)

- **Monetization model** — ads vs. cosmetics vs. premium accounts, and when it
  turns on. Deferred until the loop is fun (see *Who it's for*).
- **Client renderer** for the hex board.
- **Progression pacing** — four advancement axes (ships/tech/infra/wealth) kept
  gentle enough for a few-minutes-a-day game.
- **Danger tuning** — how lethal loss is, and new-player grace so a fresh
  Corporation isn't instantly farmed.
- **Frontier cadence** — how/when new space opens; does the old core "settle."
- **Movement & unit model** — turn/tick cadence, travel costs, unit taxonomy
  (carried over from the original design, not yet re-committed).

## Related docs

- `docs/plans/BRAINSTORM.md` — the living scratchpad (more detail than here).
- `docs/plans/intel-market.md` — the knowledge economy, fully scoped.
- `docs/specs/` — feature specs; the spec-first build order starts here.
- Archived original design: `git show bf9c637:client/docs/Gameplay.mdc`.
- UI reference: `docs/plans/canvas/` (the WebGraph galaxy view).

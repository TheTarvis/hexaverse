# Hexaverse 2.0 — Brainstorm

> **Living doc, high-level only.** A scratchpad to fill in blanks before
> anything hardens into `docs/vision.md` or a spec. Nothing here is committed
> design. `?` marks an open question; **TODO** marks a blank to fill.

## The one-liner

A **web-based multiplayer space-exploration game** — chill, persistent, a
few-minutes-at-a-time time-sink you dip into throughout the day. Explore a
galaxy, run ships, mine and research, trade materials and *intelligence*, and
share the world with other players **and AI bots that actually interact**.

> **In a phrase:** a *chill-paced but dangerous* browser MMO — a
> relaxed-cadence, knowledge-economy **EVE-lite** you dip into a few minutes at
> a time. The relaxation is in the *pace*, not a safe world.

## Vibe / pillars

- **Exploration first.** Discovery is the core reward, not combat.
- **Chill / async.** Play in short bursts; the world advances while you're
  away. No twitch reflexes, no obligation to grind.
- **Living world.** Other players + AI bots make the galaxy feel populated and
  reactive even when few humans are online.
- **Knowledge is a commodity.** What you've scanned/discovered has value —
  intelligence is tradable, not just materials.
- **Stakes are real.** A dangerous universe — you can lose everything — but
  always restartable. Chill lives in the *cadence*, not in a safe world.

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

## Predictable drift vs. loud burn *(cool emergent idea — movement × intel × stealth)*

Falls straight out of **"positions are computed"** (`movement-board.md`, #0003/#0004):
a **coasting** fleet is on rails, so its **future position is deterministic** —
knowable to anyone holding its orbital elements, and therefore **itself sellable
intel** ("fleet X reaches hex Y at time T"). **Thrusting** flips you to a **volatile
live snapshot**: you become **unpredictable** — juke a pursuer, break a targeting
solution or a *sold* prediction — but you go **"loud,"** broadcasting a real-time
position to anyone who can see you. Every move trades off: **drift = efficient,
silent, foreseeable; burn = agile, evasive, but exposes you now.** One dynamic wiring
**movement ↔ fog** (who sees the snapshot) **↔ intel market** (a fleet's *predicted
ephemeris* as a product — richer than a stale "sighting") **↔ combat** (intercept vs.
juke). Nearly free — it's already how the model works; the "cool" is deciding how far
to lean in.

- ? Can you **buy/sell a predicted trajectory**, not just a past sighting? (a new intel type)
- ? Does going **loud** (thrust) carry a **detection cost** — a burn broadcasts wider
  than a coast — so evasion trades stealth for agility?
- ? Counter-play: **coast a decoy** to spoof predictability; **burn to invalidate** a
  pursuer's stale elements. How much of this is emergent vs. explicit mechanic?

## Goals, progression & stakes

### What you're working toward
Open-ended **sandbox** — players set their own aims — layered with two
throughlines:
- **Reputation / leaderboards** — light, ongoing competition ranked by
  discoveries, wealth, and territory. A scoreboard to climb without hardcore
  conflict.
- **Personal empire** — grow your colonies / territory / operation into
  something that's *yours* over time.
- Exploration & cartography stay the emotional core (and drive the intel
  economy) even though "chart everything" isn't the sole win — think optional
  codex / flavor rather than a required goal.

### Progression — advance on all fronts
No single upgrade track; the game grows in breadth:
- **Ships & exploration tech** — better scanners, faster/longer FTL, more
  cargo, specialized hulls → explore farther, faster, deeper.
- **Knowledge / research tree** — unlock capabilities and understanding.
- **Fleet & infrastructure** — more ships, bases, relays, mining/research
  sites; a growing operation to manage.
- **Wealth** — credits accumulate and reinvest.
> ? Pacing risk: "advance on all fronts" must not overwhelm a few-minutes-a-day
> game. Likely gentle **parallel drips** rather than deep, demanding tech trees.
> Watch scope hard here.

### Stakes — high loss, guaranteed fresh start
The persistent player entity is the **Corporation** — the thing you build up,
and can lose then restart. (Corporate/industrial tone; fits the materials +
intel market.)

- **You can lose everything.** Ships, cargo, territory, your whole Corporation
  are all at risk. Real teeth; not cozy.
- **Danger is everywhere; safety comes from strength.** *Not* a
  safe-core/risky-frontier split — anywhere in the galaxy can bite. You stay
  alive through fleet, defenses, positioning, and caution. Consistently tense,
  EVE-like.
- **But you can always restart fresh.** A wiped-out player spins up a brand-new
  Corporation from scratch. You never lose *access*, only *progress* — the
  safety net that keeps full-loss from being rage-quit territory. The
  ever-growing frontier means a fresh start still drops you into rewarding new
  space.
- ⚠️ **Where "chill" now lives:** with a dangerous world, relaxation comes from
  *how you play* — short async sessions, no twitch, offline progress, the
  always-restartable floor — not from safety. Be deliberate that the danger
  reads as *stakes*, not *stress*.
  - ? What triggers total loss — combat wipe, going broke, abandonment/decay?
  - ? How much can defenses/positioning protect a careful player, so "danger
    everywhere" doesn't become "helpless everywhere."
  - ? New-player grace — some early protection so a fresh Corporation isn't
    instantly farmed (vs the pure EVE "harsh from minute one").

## Economy

- **In-game marketplace** to **buy and sell**:
  - **Materials** — mined resources.
  - **Intelligence** — scan data, maps, system reports, locations. *(The novel
    part — a knowledge economy.)*
- **Currency: a single universal credit.** Sell materials and intel for
  credits, buy everything with credits. Clean to build, easy to price against,
  accessible — fits the chill vibe.
- **Intel market = player-driven auction house (WoW-style), gated by
  freshness.** ⚠️ **Needs a focused scoping pass — see [Intel market —
  focused scoping needed](#intel-market--focused-scoping-needed).** Current
  sketch:
  - Players **set their own prices** and list intel on an auction-house-style
    exchange. Player agency; the market self-regulates through supply/demand
    rather than an algorithm dictating price.
  - Intel is **copyable**, so raw supply is high. What stops it flooding to
    worthless is **freshness**: a scan is a timestamped snapshot ("as-of"
    time T), and the world keeps moving (fleets relocate, resources deplete,
    fog creeps back). Old intel is *less accurate* → worth less → perpetual
    demand for **new** scans.
  - Player mental model: *intel is like fresh produce* — name your price, but
    it spoils, so scan often and sell while it's fresh. This is the lever that
    keeps everyone exploring.
  - The **ever-growing frontier** (see World shape) compounds it: brand-new
    space is both rare *and* fresh → the highest-value intel of all.
- ? **Market structure (open — leaning "intel global, goods regional").**
  - **Goods = regional** (finite/located supply → arbitrage; that's the point).
  - **Intel = global vs regional?** Deciding factor is **liquidity at low
    population**: a solo indie won't have many players early, and regional intel
    markets fragment thin demand → nothing sells → the signature mechanic feels
    dead. A **single global intel exchange pools liquidity** → stays alive with
    few players. Geography isn't lost, because intel's spatial friction already
    comes from the **connectivity requirement** (off-grid = stranded), not from
    market fragmentation. "Locals care more about local intel" can be demand
    *within* one global book. → Leaning **global for intel**.
- Sinks & faucets — **primary credit sinks = intel-market listing fees + station
  transfer tolls** (see below & `intel-market.md`); ? further sinks (upkeep,
  taxes) if needed.

### Goods & logistics — the physical economy

Players also trade **goods**: raw materials, refined parts, resources. Unlike
intel these are **physical mass** — they must move, and that constraint is the
*point* (it creates trade routes, haulers, and regional prices).

- **Core principle — weightless & copyable vs heavy & finite.** Both intel and
  mass flow over the *same* station/relay network (below) — it is **not** that
  matter can't teleport (it can, via stations). The real difference is the goods
  themselves:
  - **Intel** — weightless & **copyable**: transmit once, sell many times, a
    costless copy delivered. Pools naturally into a single, liquid market.
  - **Mass** — heavy & **finite**: a specific lot sits in one place; selling
    teleports *that lot* to the buyer (fee) and it's gone from source; raw goods
    need a **last-mile haul** onto the network. Located, finite supply →
    **regional** prices → **arbitrage** (buy low here, sell high there) → the
    reason trade routes exist. Procedural terrain (rich vs dead sectors) supplies
    the gradients.
- **The station network (jump-gate model).** Mass doesn't teleport
  anywhere-to-anywhere (that would kill routes), but it *can* teleport **between
  teleportation stations** for a **fee**:
  - To trade mass you either **build a station** or **haul goods to the nearest
    one** — that last-mile haul is an **async queued shipment** (freighter
    travels in real time, arrives even while offline, at risk in dangerous
    space).
  - Station-to-station transfer is fast/instant, minus the toll.
  - **Building stations = building the trade network = a business.** Owners earn
    **tolls / transfer fees** (also a credit **sink**). This is what stops routes
    from dying — the road is somebody's livelihood.
  - **DECIDED (2026-07-06) — the three constraints that keep hauling alive** (from
    the fog/logistics session; see `fog-of-war.md` → *Your own assets & the
    transmission gate*):
    - **Teleport is lane-based and *short-range*** (adjacent stations, ~1 lane
      hop) — **not** 3D, which would bypass the choke points the map is built on.
      Crossing the galaxy = **multi-hop through a contiguous station chain**, with
      **cumulative toll per hop** (distance ∝ cost → arbitrage survives).
    - **Stations are *prohibitively expensive*** — otherwise everyone stations
      every node and hauling dies. So a **lone frontier station connects to
      nothing**; the mass net is a sparse, costly backbone built only on busy
      corridors. **Hauling is the default** for the whole long tail + the frontier.
      (Cost falls on *player* frontier extension; NPC hub stations still anchor the
      core so newcomers trade day one.)
    - **Choke points are *hard* for mass** — a laneless barrier can't be stationed
      across, so mass hauls the long way or the route doesn't exist. Data still
      slips out over a single cheap **relay**, so choke points are *soft* for
      intel — the weightless-vs-heavy pillar, enforced by infrastructure cost.
- **One network, two flows.** The same station/relay network carries both: mass
  **teleports** between stations (fee); intel **transmits** over it (subspace).
  - Consequence: **the frontier is off-grid.** Deep-frontier space (freshest,
    highest-value intel; richest untapped materials) isn't on the network yet —
    you must haul back to the grid's edge or **extend the network out to it**.
    Risk/reward and the ever-growing frontier fall right out of this.
- **Keeping routes alive — all four levers (chosen):**
  - **Player-built infrastructure** — the stations/corridors; owners earn tolls.
  - **Procedural price gradients** — natural arbitrage; routes emerge from profit.
  - **NPC trade demand / contracts** — a baseline demand floor + pay-to-haul
    contracts so trade never fully dies at low population.
  - **Route/market intel as a product** — knowing profitable spreads/routes is a
    **4th sellable intel type** (subspace), feeding the intel market.
- **DECIDED: NPC core + player frontier.** NPC-owned hub stations anchor the
  settled core (baseline, always-open trade — newcomers can trade day one);
  players build stations to **extend the network toward the frontier** (the
  route-building opportunity + tolls).
- **DECIDED: intel requires network connectivity.** Intel only transmits to
  market from network-connected space, so **frontier intel is stranded** until
  you haul/relay it back or extend the net. Both economies now run on **one
  network**; the off-grid frontier is where the highest value *and* the friction
  live — players push out to close that gap.
- ? Fee structure — flat / by-mass / by-distance; toll split between station
  owner and sink (secondary tuning).

## Intel market — focused scoping needed

The player-driven-AH-plus-freshness model above is promising but has real
mechanics to nail down before it's buildable. Parked here for a dedicated
scoping session (likely graduates straight into a spec):

- **What *is* a unit of intel?** A single tile scan? A whole-system report? A
  route/map? A "sighting" of another player's fleet? Granularity drives
  everything else.
- **Freshness model** — how accuracy/value degrades: hard expiry, gradual
  confidence decay, or "last known as-of T" that buyers judge themselves?
- **Copy vs transfer** — confirmed copyable (resell many times). Does the buyer
  see who else holds it? Can they resell what they bought?
- **How buyers judge before buying** — you can't reveal the secret to sell it.
  Show metadata (region, age, type, seller rep) but not the payload?
- **Verification / trust** — what stops selling fake or worthless intel?
  Reputation, escrow, sampling, auto-verification against world state?
- **Anti-flood / price floor** — freshness is the main sink; do we also need
  listing fees or caps so the board isn't spammed?
- **Discovery→listing UX** — the flow from "I scanned something" to "it's for
  sale" has to be a few clicks (chill game).
- **Interaction with fog** — buying intel presumably reveals those tiles/nodes
  to you; how long does that revealed knowledge persist before re-fogging?

> This is the game's signature mechanic — worth its own `/spec` once scoped.

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
  deepest "living world" feel and the richest intel market.
- **Ever-growing frontier** (this is also the newcomer-balance answer): the
  galaxy continually **expands outward**, and new players spawn at the fresh
  edge where their first-scans are genuinely valuable. Veterans can never own
  all the knowledge, so exploration never gets "solved," and frontier space is
  the freshest/highest-value intel. Ties directly into the intel economy.
  - ? Expansion cadence — how/when new frontier opens (steady drip, on
    population growth, seasonal pushes).
  - ? Does the old core "settle" and quiet down, and is that fine (a lived-in
    interior vs a wild frontier)?
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
- Progression pacing — keeping four advancement axes gentle enough for a
  few-minutes-a-day game.
- New-player grace vs "harsh from minute one" — how forgiving the dangerous
  world is to a fresh Corporation.

## Source material

- UI reference: `docs/plans/canvas/` (WebGraph by kitakita).
- Original mechanics: `git show bf9c637:client/docs/Gameplay.mdc`.
- Vision + SDD: `docs/vision.md`, `docs/specs/`.

> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Goods Market & Credits — Scoping

> **Status: scoping (2026-07-30).** The physical-economy arc: currency + the
> exchange where goods are bought and sold. This is the prerequisite the intel
> market (`market.md`) explicitly leans on ("intel leans on a goods economy +
> station network that isn't specced yet") — and the exchange machinery built
> here (listings, escrow, settlement, fees) is what intel listings later ride.
> `?` = open; **DECIDED** = locked. Feeds back into `BRAINSTORM.md` → Economy;
> where this doc and the brainstorm disagree, this doc is newer.

## The resolving principle — matter never teleports

**DECIDED.** Every sci-fi trading game trips over the mass/FTL question. This
arc answers it by refusing it: **bytes move instantly, mass moves in a hold.**
Intel, credits, prices, listings, messages — any information — transmits
galaxy-wide with no travel. Physical goods require transportation, and **a
trade can only settle where the goods physically are.** Concretely:

- Goods exist in exactly two places: a fleet's **hold** or a station's
  **storage**. Nothing else holds matter.
- Selling from your hold while docked is **instant** — the matter is already
  present; the time cost was paid by the haul. Buying credits goods into your
  hold (or that station's storage) **at that station**; want them elsewhere,
  fly them.
- **Credits and listings are data** — they move instantly and are never
  location-bound. Escrow, fees, and transfers ride this.
- Consequence: **choke points on the galaxy graph stay economically real.**
  Prices diverge across a barrier because a hold crossing a lane is the only
  way goods cross it. Hauling through a choke point *is* the arbitrage trade.

This doesn't foreclose the station-network vision (BRAINSTORM → Goods &
logistics: jump-gate mass teleport over a contiguous station chain, tolls,
prohibitively expensive stations). That arc layers a **paid shortcut** on top
of this rule later — and since laneless barriers can't be stationed across,
choke points survive even the network. Nothing here needs rework when it
lands.

## Stations

- **DECIDED: every spawn (and respawn) home system includes an NPC trading
  station.** The complete starter loop — mine → haul → dock → sell — exists
  in-system from the first minute (spawn already guarantees a mineable
  skeleton at home). This supersedes the earlier "NPC hubs at the galactic
  core" leaning (BRAINSTORM): the periphery-weighted spawn would otherwise
  make the first sale a multi-lane trek.
- **DECIDED: stations carry `ownerCorpId` from day one, null = NPC.**
  Player-built stations are wanted but **HIGHLY resource-intensive** — a
  build-verb-arc feature, deferred. Ownership must be a value change later,
  not a schema retrofit (the `corporationId`-on-fleets trick).
- The station is a board **feature** (a dock target) — docking, arrival, and
  the facts panel already know how to treat those.
- **DECIDED: no region hubs — spawn-system stations only.** Hubs are moot
  once delivery requires travel: the *demand pattern* (which stations are
  paying what), not station placement, is what shapes traffic. NPC ore
  requests (Pricing, below) pull players across the map; player stations
  extend it later.

## Currency

- **Single universal credit** (BRAINSTORM, DECIDED there).
- **DECIDED: materialized `credits` balance on the corporation doc**, mutated
  only inside settlement/escrow transactions, with an **append-only trade
  ledger as the audit trail.** This is a deliberate deviation from the
  fold-of-deltas house pattern (#0005): a credit balance accrues entries
  forever, so folding every read doesn't age well. The ledger is the record;
  the balance is the truth.
- Credit transfer is instant (data, not mass).

## Pricing

- **v1: static per-region NPC floor prices** from a tuning table (params
  object, like every other knob) — plus per-station variation via requests
  (below), so a spread exists to fly.
- **DECIDED: NPC demand is expressed as standing buy orders — including
  "requests": station-specific, better-priced, quantity-limited asks.** An
  NPC station requesting ore at a premium is the lever that pulls players to
  travel *there*; the base floor everywhere else is the fallback sale. This
  is the arbitrage game working before any player-to-player trade exists,
  and it's data-driven (request entries), not a pricing engine.
- **Dynamic pricing + inflation management: wanted, explicitly not now.**
  Ship the hooks instead of the system:
  - every trade lands in the audit ledger — the dataset any future pricing
    engine needs;
  - the NPC buyer is structured with budget/absorption knobs, set to
    static/unlimited for v1 (requests are the one place quantity limits are
    already real);
  - the credit sinks (listing fee at the exchange rung; station tolls in the
    network arc) are the inflation levers, tunable when the time comes.

## The rungs

Two, in the M-ladder style (`build-order.md`):

- **M11 — credits + the NPC floor + the price board.** Corp credit balance;
  NPC trading station at every spawn home; dock and sell from the hold at
  the floor price; NPC requests at premium prices elsewhere; the remotely
  visible price board that surfaces the spread. Demo: mine → sell at home →
  spot a request paying +40% two lanes over → haul it → the profit lands.
- **M12 — the exchange.** Per-station order book: players post buy/sell
  listings; **escrow** (credits lock on a buy listing; goods lock into
  station storage on a sell listing); settlement on match inside one
  transaction; **listing fee** as the economy's first credit sink. The NPC
  floor becomes standing NPC orders in the same book. The intel market later
  is this machinery with a new listing type.

## Remote visibility — the price board is the travel engine

**DECIDED: station prices and books are remotely visible.** This is not a
concession — it's the mechanic. A player seeing "ore sells for X here, X+40%
three lanes away" is what turns hauling into a decision: *spot the spread,
fly the route, book the profit.* NPC requests show up on the same board and
pull traffic to specific stations. Bytes move instantly (the resolving
principle) — market data is bytes.

- ? The one nuance: the fog tier at which a station's board becomes visible.
  Leaning: any station in a system you know exists (charted/rumored+); the
  intel market later sells price feeds for markets beyond your knowledge —
  Route/Market intel, the deferred type in `market.md`, becomes exactly this
  product.
- Needs a UI surface: a market/prices board (galaxy-view panel and/or station
  inspector) — where the spread is *seen*. Part of the M11 rung, not an
  afterthought, since the demo is "see remote price → haul → profit."

## Open questions

- ? **The buy side of M11** — NPC stations only buy (base floor + requests);
  there's nothing sensible for players to purchase before the exchange rung
  (no fuel economy, no build verb). Credits accumulate as the wealth axis
  until M12 gives them somewhere to go.
- ? **Station storage limits** — leaning unlimited in v1; scarcity of storage
  is a network-arc/economy-tuning question.
- ? **What counts as a good** — v1: exactly the mine `ResourceKind`s. Refined
  goods, parts, etc. arrive with the build/refine verbs.

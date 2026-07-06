# Intel Market — Focused Scoping

> **Status: scoping (2026-07-05).** Deep-dive on Hexaverse 2.0's signature
> mechanic: a player-driven market for **intelligence**. Feeds back into
> `BRAINSTORM.md` (Economy) and will graduate into a `/spec` once the core
> model is locked. `?` = open; **DECIDED** = locked this session.

## Why this matters

Most space games trade *materials*. Hexaverse trades **knowledge** — what
you've scanned and discovered is a first-class, tradable good. This is the
differentiator, so it's worth getting the mechanics right before building.

## The key enabler: authoritative verification

Real-world info markets fail on two problems:
1. **You can't reveal info to sell it** (show the secret and it's worthless).
2. **You can't trust info is real** (sellers lie).

A game with an authoritative backend **dissolves both**. The server knows what
was actually scanned and when. So every intel item can carry a **tamper-proof
metadata stamp** buyers trust without seeing the payload:

> *Verified SURVEY · System X (region: Outer Veil) · as-of 14:32 · Corp Y*

Buyers judge from trustworthy metadata (type, location, freshness, provenance);
they pay to unlock the actual contents. This is the foundation everything else
rests on.

**DECIDED:** lean fully into backend-verified intel. No fake intel; freshness
timestamps are trustworthy.

---

## Design questions

### 1. What *is* a unit of intel? (granularity)

Proposal: intel comes in a few **types** at different granularities, matching
the two-tier map:

| Type | What it is | Granularity | Decays… |
|------|-----------|-------------|---------|
| **Cartographic** | A system *exists*, its location + graph connections | Galactic graph node/edge | Barely (systems don't move) — value falls by *saturation* |
| **Survey** | Detailed contents of a system's hex board — resources, hazards, features, as-of T | One solar system | Slowly/medium — resources deplete, hazards shift |
| **Sighting** | Time-sensitive observation — a fleet/player/event at a location, time T | A moment | Fast — fleets move |

This layering means "freshness" isn't one rule — **decay rate depends on
type**. Cartographic is about *being first*; survey/sighting is about *staying
fresh*.

**DECIDED:** ship the **full layered model** — Cartographic + Survey + Sighting.
The three decay rates *are* the point of the market. (Scope note: the *build*
can still phase these — Survey first is the natural MVP — but the design targets
all three.)

### 2. Freshness — how value degrades

- Every intel item is stamped **"as-of T"** (trustworthy, per above).
- The world keeps moving, so old intel is *less accurate* → worth less.
- Combined with **saturation** (many copies sold → common knowledge), price
  falls naturally without an algorithm dictating it.
**DECIDED: show both** — the **as-of timestamp** ("scanned 2h ago") *and* a
derived **confidence %** ("87% current") that ticks down as the item ages. The
timestamp is the honest fact; the confidence % makes "sell while fresh" legible
at a glance for a chill/accessible audience.
- ? Confidence curve per type — Sightings drop fast, Survey medium, Cartographic
  effectively flat (it's the permanent half).

### 3. Copy, transfer, resale

- **Copyable** (confirmed in brainstorm) — sell the same intel many times.
- **DECIDED: freely resellable.** Buyers can relist what they bought. Maximum
  liquidity; being first-to-scan-and-sell-*fast* (before saturation) is the
  whole edge. Freshness + saturation are the price sinks that stop infinite
  supply crashing to literal zero instantly.
- ? Optional refinement: secondhand intel shown as visibly older than a fresh
  original scan (a natural price gradient favoring first-hand sellers) — revisit
  if scanners need more protection.
- ? Does a buyer see **who else holds** the same intel (a saturation signal)?

### 4. How buyers judge before buying

- Show **verified metadata** (type, region/coords, as-of, seller rep, maybe a
  quality/coverage score) — never the payload.
- Backend verification means metadata can't be faked.
- ? Reputation system for sellers, or is verification enough on its own?

### 5. Anti-flood & the price floor

- Freshness + saturation are the main *value* sinks — common/stale intel trends
  to worthless on its own.

**DECIDED: listing fee + auto-expiry.**
- A small **credit fee to list** intel. This doubles as the **economy's primary
  credit sink** — resolves the brainstorm's inflation/sinks question in one move.
- **Stale listings auto-expire** off the board.
- Net effect: clean board + inflation control + a soft cost that discourages
  spamming low-value junk listings.
- ? Fee scale — flat, or proportional to asking price / freshness?

### 6. Your *own* knowledge decays too (fog creep)

The mechanism that sustains ongoing demand.

**DECIDED: partial decay** — location permanent, contents stale.
- **Cartographic knowledge is permanent** — once you discover a system exists
  (and its graph connections), you keep that forever. Progress isn't erased.
- **Survey & Sighting knowledge go stale** — contents you're **not actively
  observing** slowly **re-fog**; your own map's details age exactly like intel
  you'd buy. So you re-scan or re-buy fresher contents over time.
- This is the same permanent/stale split as the §1 type table — the decay model
  and the type model are one distinction viewed twice.
- It's the liquidity engine: without it, intel is a one-time purchase per system
  and the market dries up once everyone's learned the map.
- ? Re-fog rate for survey/sighting contents; does anything (a relay, a base, an
  active ship in-system) hold local knowledge fresh so you're not re-buying your
  own backyard.

### 7. Discovery → listing UX (chill = few clicks)

- From a discovery: a **"Sell intel"** action → accept suggested market price or
  set your own → listed. Bulk-list multiple items.

**DECIDED: suggested price, editable.** The game suggests a price from recent
comparable sales (same type, region, freshness); the seller accepts in one click
or overrides. Fast for chill play, gives price discovery, keeps agency.
- ? Surface recent-sales history / a small price chart per intel type+region.

### 8. Fog interaction on purchase

- Buying **survey** intel reveals that system's hex board to you (as-of its T).
- Buying **cartographic** intel adds the node/edges to your galaxy graph.
- Then normal fog-creep (Q6) applies to the newly-revealed knowledge.

### 9. The demand side — buy orders & exploration bounties

Everything above is **supply-push**: I scanned, I list, someone buys. The
market's missing half is **demand-pull** — buyers declaring what they want. For
a knowledge good this is unusually powerful, because the thing demanded *may not
exist yet*.

- **Buy order** — a standing "**I'll pay N for any [type] of [region] fresher
  than T**." Sits on the book as the mirror of a listing; anyone holding a match
  fills it in one click. Matched on metadata, so it rides the same trustworthy
  stamp as §4.
- **Exploration bounty** — the *same object* when nobody holds a match yet: an
  open commission to **go scan somewhere**. The market literally **pays players
  to explore where demand is** — the game's core reward wired straight to
  credits. "Why explore this dull corner?" → because someone's paying for it.

Why this is the strongest addition: it closes the loop between the **economy**
and the **core exploration loop**. Directed demand ("what's in the Dead
Reaches?") pulls explorers outward exactly like the frontier's freshness pushes
them. The supply-side edge is *first to scan & sell fast*; the demand-side edge
is *first to fulfill a juicy bounty*.

**DECIDED: bounties in — the market is two-sided.** Ship buy orders that double
as exploration commissions; directed economic demand pulls explorers outward.
The shape:
- **One object, two states.** A buy order fills instantly if inventory matches;
  otherwise it persists as an open bounty. No separate "bounty" system to build.
- **Escrow on post.** Buyer's credits lock when they post — commitment device,
  kills fake demand, and a soft sink (unfilled-expiry forfeit ties to §5).
- **Copyable, so filling = a sale.** Fulfilling a bounty hands the buyer a copy;
  the explorer keeps theirs and can still list it publicly. A frontier scan
  commissioned by one buyer but resellable to the whole market — great supply
  injection.
- **First-fill race.** A rich bounty draws several explorers; only the first
  delivery pays. Natural competition, mirrors the supply-side speed edge.
- ? Target a *specific* system vs a region/quality band? (Bands keep it liquid;
  pinpoint requests rarer/pricier.)
- ? Do open bounties advertise *where* demand is — a heat signal on the map
  (intel about intel-demand)?

### 10. Market microstructure — what the exchange actually is

The doc has assumed "auction house." Pinning the actual shape:

- **A — Listings only (AH).** Sellers post asks; buyers browse & buy. Dead
  simple, WoW-like, chill — but no demand side (kills §9).
- **B — Full two-sided book.** Bids + asks + matching engine (EVE-like).
  Powerful, enables §9, but depth charts are hardcore and off-vibe.
- **C — Hybrid.** Default flow stays one-click simple — browse listings, buy;
  list at suggested price (§7). Buy orders/bounties (§9) are the **opt-in deep
  end**. Shallow floor, deep ceiling — fits "chill but deep."

**DECIDED: C (Hybrid).** One-click listings are the default surface; the
two-sided demand machinery (§9) rides underneath as the power-user layer. Not a
full EVE-style order book — the depth lives in *bounties*, not in a bid/ask
ladder the average player has to read.

**The galaxy graph *is* the market browser (strong proposal).** Because the
payload is hidden, shopping = **metadata search**, and the best metadata surface
already exists: the two-tier map. Surface listings **on the graph itself** — a
dim, undiscovered node shows a badge `📄 Survey · 340cr · 87%`; buy it there and
the node lights up. Bounties show as demand pins (`💰 wanted: survey, here`).
This **fuses market with map** instead of a spreadsheet screen — spatial, chill,
and it makes "the frontier is where the value is" visible at a glance. A
list/table view stays for power browsing (filter by type/region/freshness/
price/rep).

- ? Is there also a plain exchange screen, or is the map the only browser?
- ? Market-depth / recent-sales chart per type+region — power feature or too
  much for the vibe?
- **NPC data brokers = the intel demand floor.** A thin layer of standing NPC
  buy orders at low prices guarantees *any* fresh intel always has some buyer, so
  the explore→sell loop is always rewarding even at low population. Mirror of the
  NPC hub-station demand floor for goods (BRAINSTORM → Goods & logistics). This
  is the intel-side answer to the §5 price floor.

### 11. The 4th type — Route/Market intel

**DECIDED: defer — 3 types for v1** (Cartographic / Survey / Sighting). Route
intel leans on a goods economy + station network that isn't specced yet;
locking it now would make the intel-market spec depend on unbuilt systems.
Parked here, ready to fold in as the 4th type once trade routes are real.

Flagged in the open threads; captured here. Knowledge of **profitable
spreads, live prices, and viable corridors** across the station network is
itself sellable — the "where's the money" layer over the goods economy
(BRAINSTORM → Goods & logistics).

| Type | What it is | Granularity | Decays… |
|------|-----------|-------------|---------|
| **Route/Market** | Profitable spreads, live prices, viable corridors | A lane / price snapshot | **By use** — acting on it closes the spread |

What makes it distinct: it's **self-erasing**. The other three types decay by
*time + saturation*; route intel decays because **buyers act on it and arbitrage
the spread shut**. Selling more copies *accelerates its own obsolescence* — a
reflexive sink no timer imposes. A genuinely different decay driver worth having
in the mix.

- ? Source: a **byproduct of trading** (you "know" spreads you've personally
  traded and can package them) vs a scannable/observable thing? Leaning
  byproduct — rewards active traders, not scanners.
- ? Adopting this grows the §1 table to four rows — fold in once locked.

---

## Locked model (summary)

The self-sustaining loop, end to end:

1. **Layered intel** — Cartographic (permanent) / Survey (medium decay) /
   Sighting (fast decay).
2. **Backend-verified** — trustworthy type/region/as-of/provenance stamp;
   buyers judge from metadata, pay to unlock the payload. No fakes.
3. **Freshness shown** as timestamp + confidence %.
4. **Copyable & freely resellable** — first-to-scan-and-sell-fast is the edge.
5. **Your own contents-knowledge re-fogs** (location stays) → perpetual demand.
6. **Player-driven prices** with an editable suggested price.
7. **Listing fee** (= the economy's credit sink) **+ auto-expiry** keep the
   board clean and control inflation.
8. **Two-sided (hybrid).** One-click listings by default; **buy orders that
   double as exploration bounties** are the demand side — the market pays
   players to explore where demand is (§9–§10).
9. **Three intel types for v1** — Route/Market intel deferred until the goods
   economy exists (§11).

## Open threads to resolve (secondary — don't block graduation)

- §4 **Reputation** — is backend verification enough, or add seller rep?
  (Leaning: verification suffices for v1.)
- **Network connectivity — DECIDED: yes.** Listing/selling intel requires being
  on the station/relay network, so **frontier (off-grid) intel is stranded**
  until you haul/relay it back or extend the net. Makes the frontier
  economically special. See the "one network, two flows" model in
  `BRAINSTORM.md` → Goods & logistics.
- **A 4th intel type — Route/market intel** (prices, profitable spreads). **§11
  DECIDED: deferred** to v-next — waits on the goods economy. Fold into the §1
  table when trade routes are built.
- **Demand side & microstructure — §9–§10 DECIDED:** two-sided hybrid, with buy
  orders + exploration bounties as the demand side, and NPC data brokers as the
  intel price floor. Remaining opens here are tuning: escrow/expiry-forfeit
  mechanics, whether bounties target a system vs a region band, and whether a
  plain exchange screen exists alongside the graph-as-market-browser (§10).
- **Market structure** — leaning **one global exchange** for intel (vs
  regional). Reason: **liquidity at low population** — regional markets fragment
  thin demand and the signature mechanic feels dead; a global book pools
  liquidity. Intel's *spatial* friction already comes from the connectivity
  requirement, not from regional markets. (Goods, by contrast, are regional —
  that's what makes trade routes.) See `BRAINSTORM.md` → Economy market structure.
- **Decay tuning** — confidence curves per type; contents re-fog rate; whether
  a relay/base/in-system ship holds local knowledge fresh.
- **Fee scale** — flat vs proportional to price/freshness.
- **Saturation signal** — does a buyer see how many others hold the same intel?
- **Resale gradient** — show secondhand intel as visibly older than a fresh
  original scan?

## Graduation

Core model **and the shape-definers are locked** — §1–3, §5–7 (intel model,
freshness, resale, fees, fog creep) plus §9–§10 (two-sided hybrid market with
exploration bounties) and §11 (three types for v1). Ready to become
`/spec NNNN intel-market` whenever you want to build it. The remaining threads
above are tuning/polish — resolve them in the spec or during implementation.

**Build order / dependency:** the market builds on **scan/fog**, which is where
an intel item is actually born (verified metadata, as-of stamp, decay) and which
is already in the first vertical slice. Recommended: `/spec scan-and-fog` first
(the intel *data model*), then `/spec intel-market` (the exchange that trades
it).

---
number: 0006
title: Scan & Fog of War
status: accepted   # draft | accepted | implemented | superseded
created: 2026-07-09
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0006 — Scan & Fog of War

> Per-Corporation visibility across both map tiers — **the star map is free,
> subspace knowledge is earned** — with three states (Unseen → Visible →
> Remembered), a **scan verb** that reveals to you *and* mints the timestamped
> **observation** the intel market will later trade, and a server-side fog
> filter on every read. Fog **reveals and remembers; it never spoils** —
> spoilage (decay, valuation) belongs to the market.

## Problem / motivation

Exploration is the game's first pillar (`../vision.md`), and exploration only
reads as exploration if there is something you *don't know*. Today the world
model is fog-blind: #0001/#0002 stub a per-system `discovered: boolean` that
was always a placeholder, #0003 generates a full interior but delegates "what
counts as Explored" to this spec, and #0004 broadcasts burning fleets "while
Visible" with nobody defining who counts as Visible. Meanwhile the signature
mechanic — intel as a tradable good (`../plans/market.md`) — needs its atom:
scanning must *produce* something ownable and timestamped, or "knowledge is a
commodity" stays a slogan.

The design is worked out and locked in `../plans/fog-of-war.md` (graph tier
2026-07-08, board tier 2026-07-09), grounded in the two-channels lore
(`../lore.md`: lightspeed is common knowledge, subspace is earned), and
prototyped in `frontend/app/spike/hex-board/`. This spec is its buildable
distillation: the **observation data model + live visibility filter + the scan
verb**, built *before* the intel market that trades it.

## Goals

- **Three states, both tiers**: Unseen (no subspace knowledge) → Visible (live
  truth, inside sensor coverage now) → Remembered (last snapshot; the map stays
  drawn, live updates stop). Re-fog is exactly Visible → Remembered — never
  back to black.
- **Graph tier — star map free, roads earned**: every system renders from t=0
  (position, coarse region, **major-body inventory** — the "option (a)"
  skeleton), but lanes are learned **by presence**: arriving in a system
  reveals its onward lanes. Subspace knowledge is a monotonic enum replacing
  the `discovered` stub.
- **Board tier — three bands**: the **astronomical layer** (star, major
  bodies, orbital geometry) free and permanent from arrival; **ambient**
  presence resolves the small/dark and shows live activity; **scan** earns
  composition, threats, and the sellable snapshot.
- **Scan does double duty**: reveals to me (fog) *and* mints a verified,
  timestamped observation into my inventory — the shared atom
  `{place, asOf, whatWasSeen, type}` the market later values.
- **Remembered = the clockwork keeps ticking, the activity freezes**: a
  remembered body keeps drifting to its correct orbital position (elements are
  deterministic); what stales is activity ("remaining: 340u, as of 2h ago").
- **Visible is computed, Remembered is stored sparse** — no players × tiles
  explosion; memory is **per-feature**, not per-tile.
- **Server-authoritative filtering**: every read returns *already-fogged* data
  for the requester; the raw world never ships to the client.
- **Fog is strictly per-Corporation** — sharing discovery is the market's job
  (selling intel), never a fog feature.
- **Resolves #0004's delegation**: the audience for a burning fleet's volatile
  snapshots = Corporations whose live sensor union covers it.
- **Resolves #0003's delegation**: physical **arrival is the "Explored"
  trigger** that generates a board's detail layer.

## Non-goals

- **Valuation, decay, freshness, the exchange** — how a snapshot *ages* and
  what it's *worth* is `../plans/market.md` → the future intel-market spec.
  Anywhere a decay curve or price appears in fog code, it's in the wrong place.
- **Buying intel into fog** (market touchpoint 2 — a purchase writes into
  Remembered) — lands with the market spec; the observation schema must simply
  not preclude it.
- **Alliance / shared vision** — decided *against* at the fog layer regardless
  of future social features: free shared vision would gut the intel market.
  Any future sharing is a market-design problem (discounted intel), not fog.
- **Stealth / detection depth** — quality-gated detection of faint/cloaked
  things is flagged as *where detection will live*, but is combat-adjacent and
  deferred.
- **Relay & sensor-tech upgrades, trait-based scan reduction** — progression
  knobs on the `(range × speed × quality)` axes; deferred (cheap to add).
- **Anti-cheat hardening** — the read path is *designed* server-filtered now;
  strict enforcement/auditing is deferred.
- **The transmission gate & two-network economy** (sell only in relay range,
  data-vs-mass asymmetry) — recorded in `market.md`/`BRAINSTORM.md`; fog keeps
  one line: intel is sellable when in range of a connected relay.

## Proposed approach

**One rule, both tiers: the lightspeed layer is free and common; subspace
truth is earned by presence or scanning** (`../lore.md`).

**Graph tier.** The whole star field renders for everyone from t=0 — position
(always precise; no fuzzing), coarse stellar character, and each system's
major-body skeleton (#0001 generates it eagerly; #0002 draws it). What's
earned is the *subspace* ladder over that free sky:

```
starVisible (all, free) → rumored → surveyed → explored
```

- **Rumored** — presence at a lane's endpoint taught you a lane reaches here.
- **Surveyed** — the paid appraisal: *worth* (rich vs. picked-clean), hazards,
  activity — what the free inventory deliberately withholds. Via quick-sweep
  scan, bought intel, or travel-adjacency.
- **Explored** — you went: full current interior; that board's own fog begins.

Travel is the primary reveal trigger — **arriving reveals the system and its
onward lanes**, so you trace the road network outward toward stars you can
already see (confirms `movement-galaxy.md`: you can travel only *known*
lanes). Reveal is **monotonic** — tiers never drop; what ages is a snapshot's
worth, which is the market's problem.

**Board tier.** A hex is an orbital sector light-hours across — you can't hide
a planet, but you can't appraise one by looking either. Three bands:

| Band | Covers | Earned by | Live? |
|---|---|---|---|
| **Astronomical** (free) | star; major bodies' position + type + rough size/count; ring geometry; visible murk | free & permanent from arrival | static geometry |
| **Ambient / Visible** | the small/dark you pass; **live activity** (ships, mining *now*) | a unit's short sensor bubble, riding the unit | **live** |
| **Scanned** | composition/richness, threats (incl. invisible killers), activity snapshot, ruins/anomalies — **mints the intel** | the slow, aimed scan action | snapshot |

The free dial is **generous** (inventory at a glance) but withholds worth;
asymmetry by body type is a feature — murk (nebula) is visible but hides
what's behind it and cuts scanning into it; invisible killers (gravity well,
radiation) show nothing until scanned or suffered.

**Sensing is one system, two modes, three attributes** — passive (ambient) is
the fast-shallow-near corner of `(range × speed × quality)`; active (scan) is
the slow-deep-far corner and the only minter of intel. Active scans trade
their axes per scan — quick-sweep (wide, fast, coarse) vs. deep-scan (narrow,
slow, full report); the slice may collapse the two into one scan action.
Quality tiers-up graph knowledge (low → Rumored, high → Explored) and sets a
snapshot's *initial* confidence — the clean hand-off to the market, which
decays it from there.

**Scan rides the action spine (#0005)**: commit computes the ETA; resolution
mints the observation with `asOf: eta` — correct even resolved hours late,
because state-at-eta is computable (fold the ledger ≤ eta, evaluate kinematics
at eta). No fog on your own perception: you always see your own units and
their coverage, anywhere.

**The board is born in two phases** (resolves #0003's trigger): the
**skeleton** (star + major bodies + geometry) is generated eagerly at
system-creation — free, immutable, shown on the graph; the **detail**
(resources, small bodies, hazards, anomalies) is rolled lazily by the **first
fleet to physically arrive**, persisted create-if-absent (#0003's race guard,
triggered by #0005's arrival resolution), and becomes everyone's canon —
which every later player still fogs fresh from their own entry.

## Design details

- **Where it lands:** a top-level **`backend/observation/` domain**
  (handler→service→DAO per `backend/CLAUDE.md`) owning the observation atom,
  the reveal writes, and a **fog-filter service** that other domains
  (`system`, `fleet`, future `market`) call to project any read per requester
  — cross-domain via services, never DAOs. The scan verb is an action `type`
  registered with the #0005 dispatch.
- **Data model (Firestore, per-Corporation):**

  ```
  players/{pid}/observations/{systemId}            # graph tier
    tier      : 'rumored' | 'surveyed' | 'explored'   # monotonic
    asOf      : worldTime of the last survey-grade snapshot
    snapshot? : the surveyed appraisal (worth, hazards, activity summary)

  players/{pid}/observations/{systemId}/features/{featureId}   # board tier
    elements  : the body's orbital elements as observed (geometry lives)
    detail?   : last-scanned composition/threat report
    activity? : last-seen activity (mining, fleets)
    asOf      : worldTime of last observation
  ```

  - **Per-feature, never per-tile** — bounded by where a player has actually
    been. **Empty space is never remembered** (nothing to store; it reverts to
    Unseen when the bubble leaves).
  - The observation doubles as the **intel inventory** — the same doc the
    market will list/sell (schema shared with `market.md`; valuation fields
    live there, not here).
- **Visible is computed at read time** — the union of the requester's
  unit/base sensor radii evaluated against current positions
  (`f(elements, worldTime)` for coasters; live snapshots for burners). Never
  stored, zero write amplification.
- **Read path:** the #0002 graph read and the system/board read return
  **already-fogged** projections: stored Remembered snapshots, overwritten by
  live truth where currently Visible and flagged `live: true`. The subspace
  enum replaces `discovered` (older consumers treat `rumored+` as "has
  subspace knowledge"; the star layer renders regardless).
- **Reveal writes:**
  - **Travel-arrival** (a #0005 lane-travel/burn resolution): system →
    `explored`, onward lanes revealed, first-arrival detail generation
    triggered if absent.
  - **Scan resolution**: mints/updates observations for what the scan touched
    (`asOf: eta`), tiers-up graph knowledge per scan quality.
  - **Ambient on-move** (decided 2026-07-09): passing through updates
    per-feature `asOf`/activity — so Remembered captures where you've been.
    The write happens **at movement-action resolution** (#0005), covering the
    sensor bubble **along the resolved path** (deterministic, so what the
    bubble swept is computable at resolve time) — never per tick. Per-feature
    upserts keyed by featureId make repeat passes idempotent overwrites.
- **SSE audience (#0004 Decision #19's delegated half):** a burning fleet's
  volatile snapshots go to the system channel; the fog filter decides **per
  subscriber** whether the fleet is inside their live sensor union before
  fan-out (or on refetch — SSE stays invalidation-only per #0005).
- **Frozen start area** (#0001/#0002): ships all-`explored` as a curated
  static asset — no per-player fog state on the logged-out path.
- **Tuning is data:** sensor radii by unit type, scan durations/ranges/quality
  tiers live in a params object (as #0003's `GenerationParams`), spike values
  as defaults.
- **Reference client:** `frontend/app/spike/hex-board/` demonstrates the
  three bands, presence reveal, deep-scan, Remembered ghosts that keep
  orbiting, and the KNOWN-FACTS panel — the production client reuses the
  rendering treatment (dim astronomical layer, live vs. remembered styling).

## Acceptance criteria

- [x] The graph read returns **every** system (star layer: position, region,
      major-body inventory) for any player from t=0, with a per-requester
      subspace tier `rumored | surveyed | explored`; the `discovered` boolean
      is gone from #0001/#0002 surfaces.
- [ ] **Arriving in a system** (a #0005 travel resolution) sets it `explored`
      for the arriver and reveals its **onward lanes**; before that, the
      player knows only lanes leaving systems they've visited.
- [x] Subspace tiers are **monotonic** — no code path lowers one.
- [x] Board reads return the **astronomical layer for any arriver** (star,
      major bodies, geometry — from the eager #0003 skeleton), ambient-live
      content only inside the requester's computed sensor union, and
      remembered features elsewhere.
- [x] **Remembered features keep orbiting**: a stored observation renders at
      its *current* computed orbital position, with activity/detail frozen at
      `asOf`. Empty space reverts to Unseen.
- [ ] **First physical arrival** triggers the #0003 detail roll exactly once
      (create-if-absent under #0005's resolution guard); later arrivers fog
      the same canon fresh.
- [x] **Scan is a #0005 action**: commit stores the ETA; resolution mints an
      observation with `asOf: eta` — a scan resolved hours late yields the
      same snapshot as one resolved on time (emulator test).
- [x] Scanning **tiers-up** graph knowledge per quality and populates
      per-feature detail on the board; the observation lands in the owner's
      inventory (the market's future input).
- [x] Every fleet/system/graph read is **fog-filtered server-side per
      requester**; no API response contains world state the requester hasn't
      earned (verified by test: two players, one scans, the other's read is
      unchanged).
- [x] A burning fleet's snapshot reaches only observers whose **live sensor
      union covers it** (the #0004 audience contract).
- [x] Own-perception is never fogged: a player always reads their own units
      and their coverage, anywhere in the galaxy.
- [x] The frozen start area serves all-`explored` static data with no
      per-player state.
- [x] Sensor radii, scan parameters, and quality tiers live in a **params
      object**, spike values as defaults.
- [ ] **Slice bar:** move a ship into an unseen system → the astronomical
      layer appears; scan → detail + a timestamped observation you own;
      leave → the system stays drawn, its activity frozen at `asOf`.

## Decisions (imported from `../plans/fog-of-war.md`)

1. **Fog vs. intel boundary (2026-07-06):** one shared atom
   (`observation`); fog filters it (can I see it *now*?), the market values it
   (what's this recording worth *later*?). Fog reveals and remembers; it never
   spoils.
2. **One sensing system** — passive/active are corners of
   `(range × speed × quality)`; the six cells are the sensor progression axes;
   active scans trade their axes per scan (quick-sweep vs. deep-scan).
3. **No fog on your own perception (2026-07-06)** — the gate is on
   *transmission* (sellable only in relay range; economy detail lives in
   `market.md`).
4. **Star map always visible; roads discovered by presence (2026-07-08** —
   supersedes "lanes are visible infrastructure"**)** — subspace geometry ≠
   real space; you must trace the network outward. Confirms lanes-only travel
   against *known* lanes.
5. **The graph shows the major-body inventory ("option (a)", 2026-07-09)** —
   beckons for free, withholds worth; survey intel's product becomes "how
   good", not "how big". Forces the character dial toward detail (richness/
   hazards) over count.
6. **Positions are always precise** — no Rumored fuzzing; reveal is
   **monotonic**.
7. **Board tier: three bands (2026-07-09)** — astronomical free (generous
   dial), ambient by presence, detail by scan; asymmetric by body type (murk
   visible-but-occluding; invisible killers blank until scanned/suffered).
8. **Presence vs. scan division** — presence = live activity + resolving the
   small/dark (mints nothing); scan = composition + threats + the sellable
   report (the only minter).
9. **Remembered = geometry lives, activity freezes** — the fog line sits on
   the ephemeris-vs-activity seam (#0004 Decision #6's wire split, same seam).
10. **Memory is per-feature, not per-tile; empty space is never remembered;
    Visible is computed, Remembered stored sparse.**
11. **Two-phase board birth (2026-07-09)** — skeleton eager at
    system-creation; detail lazy on **first physical arrival** (the "Explored"
    trigger #0003 delegated), first-arriver's roll is canon, later players fog
    it fresh.
12. **Fog is strictly per-Corporation (2026-07-06)** — shared vision would gut
    the intel market; sharing *is* the exchange.
13. **Server-authoritative filtering** — reads return already-fogged
    projections; never ship-and-hide client-side.

Resolved at acceptance (2026-07-09):

14. **Snapshot write cadence: both** — scan-completion *and* ambient-on-move.
    Scan-only would make Remembered forget live activity you watched but
    never scanned; ambient memory records presence's product (what was there,
    what it was doing) without touching scan's (composition, threats, the
    minted intel). Ambient writes land **at movement-action resolution**,
    path-swept by the bubble (endpoint-only is the acceptable degenerate
    fallback if path-sweeping proves fiddly in the slice; path-swept is the
    honest semantics).

## Open questions

- **Graph sweep reach** — quick-sweep surveys direct lane-neighbors; do higher
  range tiers reach 2 hops? (Likely yes — range is an upgrade axis.) Owner:
  Travis; deferable past the slice.
- **Board quick-sweep: bodies or radius** — reveal the *bodies* touched
  (leaning; matches per-feature memory) or paint a disc of tiles? Resolve
  with the renderer spec.
- **Ambient: type or presence-only** for the small/dark it resolves (leaning
  presence-only — "something's here, scan it").
- **Character dial: detail vs. count** — how much may body-count vary before
  the free inventory leaks the appraisal (leaning count roughly uniform;
  richness/hazards carry character). Owner: Travis, with #0001 generation
  tuning.
- **Ambient grant & radius by unit type; relays as sensors vs. network** —
  leaning any-unit-grants-scaled-radius; relays get a modest bump only.
  Progression-era tuning.
- **Frozen start-area board: fog-off showcase vs. fog-on tutorial** — ties to
  `../vision.md`'s open tutorial-instance question. Owner: Travis; not
  blocking (slice ships fog-off showcase).

## References

- `../plans/fog-of-war.md` — the full design (sensing model, arrival
  walkthrough, band tables, data-model reasoning).
- `../lore.md` — the two channels (lightspeed free / subspace earned); this
  spec is that lore made mechanical.
- Related specs: **#0005** (scan is an action; arrival resolution is the
  reveal trigger), **#0003** (skeleton/detail split; race guard), **#0004**
  (Visible audience for volatile snapshots), **#0001/#0002** (the `discovered`
  stub this replaces; eager skeleton + inventory rendering).
- `../plans/market.md` — the boundary doc: valuation/decay/exchange; the
  transmission gate & two-network model.
- `../plans/movement-galaxy.md` — travel-as-reveal; known-lanes-only.
- `frontend/app/spike/hex-board/` — the three-bands prototype.
- `../vision.md` — exploration-first; knowledge as commodity.

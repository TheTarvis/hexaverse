# Movement (galaxy tier) — Lane Travel (strategic, inter-system)

> **Living doc, high-level only.** Scratchpad for **how a unit crosses the galaxy**
> on the node graph — traversing lanes system-to-system, plotting routes, revealing
> as you go, the roads-vs-off-road question. Nothing here is committed design.
> `?` = open question; **DECIDED** = locked. Feeds a future
> `docs/specs/NNNN-movement-galaxy.md` (companion to #0001/#0002). Created 2026-07-07.
>
> **Sibling doc:** `movement-board.md` owns the *board tier* (in-system coast &
> thrust). Movement is split two ways because the tiers are entirely different
> geometry — discrete graph edges here, orbital hexes there. Both ride the same
> **async-action spine** (a committed move with a deterministic ETA that resolves
> while you're offline). The **graph↔board handoff** is the shared seam.
>
> Context: #0001 (the node graph + lanes this rides on), #0002 (the 3D galaxy view
> that renders it), `fog-of-war.md` (§Graph-tier progressive revelation — travel is
> its primary *Explored* trigger; the lane-movement rider **moved here**),
> `movement-board.md` (the other tier), `market.md` (relay/station network, at-risk
> hauling), `BRAINSTORM.md`, `vision.md`, and the archived
> `git show bf9c637:client/docs/Gameplay.mdc` (sublight/FTL).

---

## Boundary — what this doc owns (read first)

| | **Graph tier** (between systems) — *this doc* | **Board tier** (inside a system) — *`movement-board.md`* |
|---|---|---|
| Question | how do I cross the galaxy? | how do I move around this system? |
| Model | **lanes** over the node graph, FTL tiers, relay chains | **coast & thrust** over the orbital hex board |
| Scale | light-years, node-to-node | light-hours, hex-to-hex |

This doc **defers to #0001** for the graph itself (nodes, lane edges, coords) and to
`fog-of-war.md` for the visibility *states* — it owns only the **travel verb** that
moves a unit across that graph and *triggers* those reveals.

---

## Already decided (imported from `fog-of-war.md` — the "movement rider")

The lane-movement decisions were parked as a rider inside the fog doc because
fog-reveal rides on them. **They live here now**; fog keeps a one-line pointer.

- **DECIDED (2026-07-06): lane-based, not free-travel.** Travel follows lanes
  (#0001 edges); "adjacent" = lane-connected, not merely near in 3D. Chosen because
  the vision's "map is the source of drama" needs real **choke points**, which
  free-travel dissolves.
- **DECIDED (2026-07-08 — reverses the 2026-07-06 "lanes are visible" call): lanes
  are discovered by *presence*, not sight.** The **star map** is always visible
  (lightspeed/telescope — `../lore.md`), but **subspace lanes are not**: you learn a
  system's onward lanes only by **reaching it**, so you begin knowing only *home's*
  lanes and chart the road network outward one system at a time. The **star field**
  is what beckons now (you see the cluster you covet, unreached), not free lane stubs
  (`fog-of-war.md`).
- **DECIDED (2026-07-07): "roads vs. off-road" hybrid, mechanized as drive jump
  range.** Free flight (off-road) is always *possible* but slower/costlier than lanes,
  so barriers are **economic** choke points, not walls, and the **off-grid frontier** =
  going off-road / extending the relay net (`market.md`). The strict-lanes-vs-hybrid
  rider is closed in favour of the hybrid; the mechanism is the **jump-range** axis
  under Progression below (off-road unlocks as your drive tech grows).
- **Slice ships lanes-only** — a clean subset; off-road / FTL-range / relay-extension
  layer on later with no rework.

---

## The verb — click a destination, the game plots the lane route

**Leaning: click-a-system, the game pathfinds the lanes** — deliberately the *same*
verb as the board tier (`movement-board.md` "click-a-hex, the game plots the path"),
so both tiers feel like one game. The geometry differs; the gesture doesn't.

- **Click a system** → shortest-path over the lane graph (weighted by lane cost) →
  draw the **route** (the chain of lanes) + total **ETA** → commit as a queued async
  action → the ship crawls **node-to-node over real time**.
- **Multi-hop is inherent.** Unlike a board burn (one leg), a galaxy trip is *always*
  a chain of lane-hops. The route **is** multi-leg by nature — no separate "queue
  legs" question like the board has.
- **Deterministic ETA at commit.** Sum of lane costs along the path → "arrives in
  3h 20m" is truth, not estimate (same async-spine promise as the board).

Rejected (same reasons as the board): manual heading (too fiddly), free-flight that
ignores lanes (dissolves choke points — that's the whole *point* of lanes).

### Reaching the frontier — one hop past your charted roads (DECIDED 2026-07-08)

**You can plot a course over your *known* lane network to any charted system, and
exactly one hop past its frontier** — to a **Rumored** neighbor (a system a known lane
reaches but you haven't visited). Arriving charts *that* system's onward lanes, so its
neighbors become the new Rumored frontier. Exploration is thus **stepping one hop past
your known roads, repeatedly**, tracing subspace toward the stars you can already see.

- You **cannot** blind-jump to a star with no charted lane to it — the road-finding
  rider is now resolved: **known-lane-reachable only** (`fog-of-war.md`, `../lore.md`).
  You see the whole sky; you can only *drive* the roads you've mapped, plus the next
  step off their edge.
- **No reveal-as-you-go through *un*charted intermediates.** Because you don't know a
  Rumored neighbor's onward lanes until you arrive, a single order can't leapfrog
  multiple unknown hops — you advance the frontier one system per trip. (Multi-hop
  routing still applies freely *within* charted space — crossing territory you've
  already mapped.)
- **Risk lives at the frontier step:** the star told you the region, but not what's
  *there now* — you commit a hop into current-unknown space. Ties to *at-risk in
  transit* below.

`?` A high-range subspace **sensor** that charts a neighbour's lanes *without*
travelling (survey-at-range) is a natural progression hook — base case stays
presence-only (`../lore.md` open thread).

## Cost & ETA — what a lane costs

**DECIDED (2026-07-07): cost is *time*, length-weighted, and the number is shown.**
Two decisions were hiding in "cost"; both are now locked:

- **DECIDED — the currency is time (ETA in minutes), not fuel.** ETA is what the
  async spine trades in ("arrives in 3h20m" *is* the promise), so lane cost is a
  **duration**: base time = lane length ÷ drive speed. The galaxy tier is
  **time-gated, not fuel-gated** — fuel/stranding stays a *board-tier-only* concern
  (#0004 already owns it). One resource per tier; no unified fuel economy across both.
- **DECIDED — length-weighted, not uniform-hop.** #0001 nodes carry real coords, so
  cost ∝ 3D distance. This keeps the map's *geometry* load-bearing — a compact cluster
  is quick to cross; a long reach to the frontier is a real commitment; barriers being
  physically far reads naturally ("map is the source of drama").
- **The 3D-legibility catch, and its fix.** In a 3D view you *can't* eyeball which
  lane is longer (foreshortening, depth), so if cost were invisible, length-weighting
  would feel arbitrary. The fix isn't to flatten to uniform-hop — it's to **surface the
  number**: the route highlight shows **per-leg + total ETA**. Same philosophy as the
  board tier's "assisted, not manual lead" — you never judge distance by eye, the game
  tells you. (Uniform-hop is retained only as a pure display fallback if a build ever
  needs it; the *model* is length-weighted.)
- **Hazard / tier modifier (later, hook only).** A barrier- or nebula-choked lane
  costs more — the same tile-trait lever fog/board movement use, one tier up. Reserve a
  `cost` field on the lane (and a `relayModifier`); don't build the modifiers yet.

`?` does a **relay-connected corridor** cut cost — resolved under Progression below
(relays are a distinct mechanism, not just a cost modifier).

## Progression — three distinct ways to go fast (keep them from blurring)

The movement half of the vision's progression pillar at this tier — mirrors the
board's engine axes and fog's sensor axes. The key clarity: there are **three**
fast-travel mechanisms and they must stay **orthogonal**, or they blur into one
confusing "go faster" knob:

| Mechanism | What it is | Whose it is | Cost |
|---|---|---|---|
| **Lanes (roads)** | default graph traversal | everyone | time ∝ distance |
| **FTL jump (off-road)** | direct point-to-point, *ignores* the graph, within drive range | **your capability** (drive tech you carry) | worse per-distance |
| **Relay corridor (super-road)** | teleport/cheap hops along a *built-out* chain of relays | **world state** someone built | per-hop **toll** (credit sink) |

FTL is something you *carry* (personal tech); a relay corridor is infrastructure
someone *laid down* (shared world state, tollable). Keeping them distinct is what makes
each interesting.

- **Speed** — faster lane traversal (shorter ETA per hop). The gentlest drip.
- **DECIDED — FTL = a drive *jump range* (one unifying axis).** Collapse "skip 2 lanes"
  and "point-to-point jump" into a single number: the drive has a **jump range (radius
  in ly).** Tier 0 (the slice) ≈ 0 range → lanes only. Higher tiers grow the range →
  you can make a **direct off-graph jump** between any two systems within range, at a
  worse cost-per-distance than a lane. This *is* "roads vs off-road," and it keeps
  barriers as **economic chokes, not walls**: you *can* jump the seam once your drive
  reaches, but the lane is always cheaper, so traffic still funnels. It also answers
  "does capability gate reachable regions?" — **yes**, naturally: a far cluster is
  unreachable until your range clears the gap (soft difficulty gradient, the graph-tier
  echo of the board's "capability gates inner rings").
- **Relay chains** — the station/relay network (`fog-of-war.md` two-network model):
  a chain of player-built relay structures forms a **corridor** with near-instant/cheap
  hops and a **per-hop toll** (the "mass net"). **Player-built fast lanes** — the
  frontier-extension verb, and a natural credit sink tying movement into the economy
  (`market.md`). Spec hook: a system can host a `relay`; a relay-connected lane gets the
  `relayModifier`. Built later.

`?` which axes survive past these three. `?` FTL cost-per-distance curve (how much worse
than a lane) — tuning, not structure.

## Interactions to nail

- **Fog reveal (the big tie-in).** Travel is the primary **Explored** trigger
  (`fog-of-war.md` Rumored → Surveyed → Explored). Arriving at a system → Explored →
  its board's own fog begins one tier down. `fog-of-war.md` owns the *states*; this
  doc owns the *travel that fires them*. `?` reveal cadence in transit — light up each
  node as you pass, or only the destination?
- **At-risk in transit (combat-adjacent, flag-and-defer).** A ship crawling a lane
  through unknown/hostile space is **exposed** — the dangerous-world pillar and
  `market.md`'s async at-risk freighter hauling. Design travel as *visibly in-transit
  on a lane* (not teleport-with-timer) so **interdiction** has a place to happen
  later, even though combat itself defers.
- **Choke points.** Barriers (sparse lanes, the #0001 seam) are **economic** chokes:
  few lanes across → traffic funnels → the map makes drama. Roads-vs-off-road keeps
  them chokes not walls (you *can* jump across, just slow/costly).
- **Graph↔board handoff (shared seam with `movement-board.md`).** Arriving via a lane
  drops you at the destination board's **rim**, on the rim orbit (the board doc's
  entry point). Leaving = reach a rim **exit** tile → hand back to graph travel.
  `?` is the exit the same tile you entered, any rim tile, or specific lane-exit
  tiles? (Open in *both* docs — resolve once, record in both.)
- **What actually moves — DECIDED (2026-07-07): the fleet is the mover.** Mirrors
  #0004 (board tier): the **same fleet entity** crosses the lane and, on arrival, drops
  onto the destination board *as* the fleet — no separate "galaxy marker" vs "board
  ship". A fleet is therefore a first-class galaxy-tier entity, not just a board thing.
  **Bases/colonies stay put.** (Deferred: multiple fleets travelling a route *together*
  / grouping — one fleet at a time for the slice.)
- **Re-tasking mid-transit.** `?` abort/redirect underway (recompute ETA, partial
  refund)? — mirrors the board's mid-burn re-task question. Determinism makes the
  recompute clean.

## Slice MVP vs. deferred

Slice = the BACKLOG "Inter-system travel" row (🎯) — the "navigate the galaxy" verb
the slice needs. Simplest thing that proves it:

**In the slice:** a **"you are here"** home node → **click a lane-reachable system →
the fleet travels the lane-path → arrives over real time → reveals it (Explored).**
Lanes-only. **Length-weighted time cost, ETA shown.** Reveal cadence = **destination-
on-arrival** (light-up-each-node-in-transit is a nice-to-have, deferred — though the
spike demonstrates it because it's cheap and compelling to eyeball).

**Reserve now (data-model hooks, not built):** `cost` on lanes, `relayModifier`, a
drive `jumpRange` on the fleet, `relay` on a system — so FTL/relays layer on with no
rework.

**Deferred:** FTL jump / off-road free-flight, relay-corridor teleport + tolls,
at-risk interdiction, re-tasking mid-transit, fleet grouping (multiple fleets on one
route), cost modifiers.

> Slice rule: **you can send a ship down a lane to another system and it gets there
> over time, revealing it.** (Deliberately parallels the board slice rule — "you can
> move a ship somewhere and it gets there over time.")

## Open questions (rolled up)

**Resolved 2026-07-07:** cost model (length-weighted **time**, ETA shown, time-gated
not fuel-gated) · roads-vs-off-road (hybrid, mechanized as drive **jump range**) ·
what moves (**the fleet**, mirroring #0004) · reveal cadence (**destination-on-arrival**
for the slice) · the three fast-travel mechanisms held orthogonal (lanes / FTL jump /
relay corridor).

**Still open:**
- ~~Travel-into-unknown / blind-jump vs lane-reachable-only~~ **RESOLVED
  (2026-07-08): known-lane-reachable only** — star map visible, roads charted by
  presence; travel reaches one hop past your frontier (`../lore.md`).
- **Handoff exit-tile rules** (shared with `movement-board.md` — resolve once, record
  in both): the same tile you entered, any rim tile, or specific lane-exit tiles?
- **Re-tasking mid-transit** — abort/redirect underway (recompute ETA)? Determinism
  makes the recompute clean.
- FTL cost-per-distance curve; which progression axes survive past the three above
  (tuning, not structure).

## Next step

Core design is **locked** (the five 2026-07-07 decisions above): length-weighted time
cost, jump-range FTL, fleet-is-the-mover, destination-on-arrival reveal, three
orthogonal fast-travel mechanisms. What remains before `/spec` are the three small
open riders (blind-jump target selection, handoff exit-tile, mid-transit re-task).

Prototype step (in progress): the lane-travel verb is being wired into
`/spike/galaxy-3d` (previously *no* movement) — pick a home node → select a system →
preview the lane route + per-leg/total ETA → commit → watch the fleet crawl node-to-node
and reveal as it goes. Eyeball route-plotting + length-cost *feel* there before spec'ing.

Then graduate to **`/spec movement-galaxy`**, **paired with `/spec scan-and-fog`**
(reveal rides on travel) and **after #0001/#0002** (the graph it moves on). Flip the
BACKLOG *Inter-system travel / movement on the graph* row to ✅ then. The board-tier
sibling (`movement-board.md`) graduates on its own track.

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
- **DECIDED (2026-07-06): lanes are visible infrastructure.** From any system you
  know, you see the lanes leaving it → its neighbors are auto-**Rumored** for free
  (`fog-of-war.md`). You always see the edge of your known space beckoning.
- **Target: a "roads vs. off-road" hybrid.** Free flight always possible but *far
  slower* than lanes, so barriers are **economic** choke points, not walls, and the
  **off-grid frontier** = going off-road / extending the relay net (`market.md`).
  `?` still-open rider: strict-lanes-forever vs. the hybrid (leaning hybrid).
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

### Can you travel into the unknown? (the key fork — leaning YES)

**You can commit to travel down any *visible* lane, even into a Rumored/Unseen
system.** This is what makes exploration a **verb**, not a side effect:

- You see a lane leaving your known space (fog: neighbors auto-Rumored). You send a
  ship down it. **Arriving is what reveals the system** (→ Explored, `fog-of-war.md`).
- The route may pass *through* unseen systems — you commit to the road and
  **reveal-as-you-go**.
- If you could only travel to already-known places, exploration would be impossible
  (chicken-and-egg: reveal needs travel, travel needs reveal).
- **Risk lives here:** pathing into the unknown is exactly where the dangerous-world
  pillar bites — you don't know what's at the end. Ties to *at-risk in transit* below.

`?` Confirm yes. `?` Can you target a node you can't yet *see* a lane to (blind
jump), or only lane-reachable ones? (Leaning: only where a visible lane-path exists.)

## Cost & ETA — what a lane costs

**Leaning: length-weighted, with hazard/tier as a later modifier.**

- **Length-weighted (base).** #0001 nodes carry real coords, so lane cost ∝ 3D
  distance. Makes the map's *geometry* matter — a compact cluster is quick to cross;
  a long reach to the frontier is a real commitment. Barriers being physically far
  reads naturally.
- **Uniform-hop (slice fallback).** Every lane = 1 unit ("3 hops away"). Simplest and
  most readable; use it if length-weighting muddies the read in the spike.
- **Hazard / tier modifier (later).** A barrier or nebula-choked lane costs more
  (slow/dangerous) — the same tile-trait lever fog/board movement use, one tier up.

`?` uniform-hop vs length-weighted for the slice. `?` does a **relay-connected
corridor** cut cost (fast lanes you've built out — see progression)?

## Progression — speed, FTL range, relay chains

The movement half of the vision's progression pillar at this tier — mirrors the
board's engine axes and fog's sensor axes. Keep them **gentle parallel drips**:

- **Speed** — faster lane traversal (shorter ETA per hop).
- **FTL tier / jump range** — skip nodes: a high-tier drive hops 2 lanes at once, or
  jumps point-to-point within a range ignoring the lane graph. **This is how
  "roads vs off-road" becomes real** — off-road = jump/free-flight, always possible
  but slow/costly until you tech into it, so barriers stay chokes, not walls.
- **Relay chains** — the station/relay network (`fog-of-war.md` two-network model)
  gives teleport/jump-gate hops along a *built-out corridor* (the "mass net":
  short-range adjacent lane-hop, per-hop toll). **Player-built fast lanes** — the
  frontier-extension verb.

`?` which axes survive. `?` does jump-range **gate reachable regions** (a far cluster
needs a better drive), giving the galaxy a soft difficulty gradient — the graph-tier
echo of the board's "capability gates inner rings."

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
- **What actually moves.** Ships travel; **bases/colonies stay put**. `?` do you move
  a single marker or a fleet; can multiple units travel a route together?
- **Re-tasking mid-transit.** `?` abort/redirect underway (recompute ETA, partial
  refund)? — mirrors the board's mid-burn re-task question. Determinism makes the
  recompute clean.

## Slice MVP vs. deferred

Slice = the BACKLOG "Inter-system travel" row (🎯) — the "navigate the galaxy" verb
the slice needs. Simplest thing that proves it:

**In the slice:** a **"you are here"** home node → **click a lane-reachable system →
ship travels the lane-path → arrives over real time → reveals it (Explored).**
Lanes-only. Uniform-hop or simple length cost. Reveal-on-arrival (in-transit reveal
optional).

**Deferred:** FTL tiers / jump range, relay-chain teleport, off-road free-flight,
at-risk interdiction, re-tasking mid-transit, multi-ship fleets, cost modifiers.

> Slice rule: **you can send a ship down a lane to another system and it gets there
> over time, revealing it.** (Deliberately parallels the board slice rule — "you can
> move a ship somewhere and it gets there over time.")

## Open questions (rolled up)

- Travel-into-unknown confirmed (leaning yes); blind-jump vs lane-reachable-only.
- Cost model: uniform-hop vs length-weighted vs hazard-weighted; relay corridors cut
  cost?
- Roads-vs-off-road: strict-lanes-forever vs the hybrid (the fog-doc rider, now here).
- Reveal cadence in transit (each node vs destination only).
- Progression axes; does jump-range gate reachable regions.
- Handoff exit-tile rules (shared with `movement-board.md` — resolve once).
- Single marker vs fleet; re-tasking mid-transit.

## Next step

Graduate to **`/spec movement-galaxy`**, **paired with `/spec scan-and-fog`** (reveal
rides on travel) and **after #0001/#0002** (the graph it moves on). Prototype the
lane-travel verb on `/spike/galaxy-3d` first (it currently has *no* movement) to
eyeball route-plotting + in-transit crawl before spec'ing. Flip the BACKLOG
*Inter-system travel / movement on the graph* row to ✅ then. The board-tier sibling
(`movement-board.md`) graduates on its own track.

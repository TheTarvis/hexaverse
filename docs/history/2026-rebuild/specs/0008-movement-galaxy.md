> Historical numbered-spec snapshot, archived 2026-10-16. Original source:
> [docs/specs/0008-movement-galaxy.md](../../../specs/0008-movement-galaxy.md). Old status/scenarios are provenance,
> not current instructions or live implementation work. Current owners are in
> [canonical documentation](../../../README.md).
> Plain-text relative paths retain the original source context.

---
number: 0008
title: Inter-system Movement (galaxy graph)
status: superseded   # draft | accepted | implemented | superseded
created: 2026-07-09
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by: openspec `fleet-movement` capability, via the continuous-space chain's link 4 (`openspec/changes/migrate-fleet-to-continuous-burns/`)
---

> **Superseded 2026-08-30 by link 4 of the continuous-space chain**
> (`migrate-fleet-to-continuous-burns`). This document describes graph-tier
> travel on the polar lattice, and every mechanic in its Scenarios section was
> deleted rather than re-expressed:
>
> - **Multi-hop frozen routes are gone.** design.md Decision 10 replaces them
>   with a **single-hop `jump` from a docked gate**, deleting `planRoute`,
>   `PreviewRoute`, `RoutePreview`, `ErrNoRoute`, `ErrSameSystem`, `legMs`, and
>   `GET /v1/fleets/:id/route`. So S1 (a commit freezing `{boardLeg, route,
>   legEtas, arriveTime}`) and S2 (a no-charted-**route** refusal) describe a
>   verb that no longer exists — the surviving check is per-lane charted state
>   at the gate, not route pathfinding.
> - **A fleet in lane transit has no position in either system** (Decision 4,
>   and `proximity-disclosure`'s lane-transit invisibility). That deletes S4's
>   mid-lane parking at a computed lane fraction and S7's lane crawl outright.
> - **Arrival parks *near* the destination gate, unmasked** — not on a rim
>   entry-gate tile — which is S3's successor in a different geometry.
>
> The replacement behaviour is specified in that change's `fleet-movement`
> deltas (*Lane Jump From a Docked Gate*, *Jump Arrival Parks Near the
> Destination Gate, Unmasked*), which are now the authority. Retained here for
> history; **not enforced** by `frontend/lib/spec-scenarios.test.ts`, which
> scopes enforcement to `accepted` and `implemented`.

# 0008 — Inter-system Movement (galaxy graph)

> The **strategic-tier travel verb**: click a system, the game plots the
> shortest route over your **charted lanes** (plus exactly one hop past your
> frontier), shows per-leg + total ETA, and the fleet burns to the origin
> board's **fixed lane gate**, crawls node-to-node over real time —
> re-taskable mid-transit — then arrives, revealing, and dropping onto the
> destination board's rim. The graph-tier sibling of **#0004**, riding the
> same action spine (#0005) and firing the reveals **#0006** defines.

## Problem / motivation

`../vision.md`'s strategic layer is "navigate the galaxy under fog" — but
navigation has no verb. #0001 generates the lane graph, #0002 renders it,
#0006 defines what arriving *reveals*, and #0004 moves fleets *inside* a
system — yet nothing moves a fleet *between* systems, which means the slice
loop (explore → drill in → act) cannot begin: you can look at the galaxy but
never leave home. Exploration — the first pillar — is literally this verb:
tracing the road network outward, one system at a time, toward stars you can
already see but cannot yet reach (`../lore.md`).

The design is locked in `../plans/movement-galaxy.md` (the five 2026-07-07
decisions plus the 2026-07-08 known-lanes reversal) and is being eyeballed in
the `frontend/app/spike/galaxy-3d/` spike (route preview, node-to-node crawl,
reveal-on-arrival). This spec is its buildable distillation.

## Goals

- **The same gesture as the board tier**: click a destination system → the
  game pathfinds → route + ETA preview → commit → async travel. The geometry
  differs between tiers; the verb doesn't.
- **Routing is fog-honest**: paths are computed over the requester's
  **charted lanes only**, plus **exactly one hop** to a Rumored neighbor.
  No blind jumps to unreached stars; no leapfrogging uncharted intermediates.
- **Cost is time, length-weighted, and the number is shown**: leg time =
  lane length ÷ drive speed (real 3D distance — the map's geometry stays
  load-bearing); the route preview surfaces **per-leg + total ETA** because a
  3D view can't be eyeballed for distance.
- **Deterministic ETA at commit** (#0005): the stored route + leg times are
  frozen; "arrives in 3h 20m" is truth.
- **The fleet is the mover** (#0004): the same fleet entity crosses the lane
  and lands on the destination board — no separate galaxy marker.
- **Visibly in-transit**: a traveling fleet is *on the lane*, positioned by
  `worldTime` — not teleport-with-a-timer — so interdiction has a place to
  happen when combat lands.
- **Departure is geometric, through fixed lane gates**: each charted lane
  meets a system's board at **one fixed rim tile**; leaving means burning to
  that gate (#0004) and handing off — committed as **leg 0 of the same trip
  action** (no queue, offline-safe). Fixed, known gates make the rim
  *geography*: departure positioning matters and a future ambush has an
  address.
- **Re-taskable mid-transit**: a traveling fleet can always be re-ordered —
  **cancel** halts it in place (mid-lane it holds, visible), **redirect**
  reroutes from its current computed position. Determinism makes the
  recompute cheap and the new ETA just as frozen.
- **Arrival is the reveal trigger** (#0006): destination → Explored,
  first-ever arrival rolls the board's detail layer (#0003), and the fleet
  enters at the board rim (#0004's handoff). *(Revised 2026-07-14, #0006
  Decision #17: arrival no longer charts onward lanes — scanning in-system
  does; you rode in on a lane you'd already charted.)*
- **The three fast-travel mechanisms stay orthogonal** — lanes (everyone),
  FTL jump range (your tech), relay corridors (built world state) — with the
  slice shipping lanes-only and the other two reserved as data hooks.

## Non-goals

- **The graph itself** (#0001 — nodes, lanes, coords, barriers) and **its
  rendering** (#0002 + `../plans/camera-and-input.md`) — this spec adds the
  verb, the route preview being #0002 UI surface.
- **Board-tier movement** (#0004) — the shared seam is the rim handoff, split
  below.
- **FTL jump (off-road)** — decided as a drive **jump range** axis (tier 0 ≈
  0 in the slice → lanes only); the mechanism lands with progression, only
  the `jumpRange` field is reserved now.
- **Relay corridors + tolls** — player-built super-roads are economy-era
  (`../plans/market.md` two-network model); `relay` / `relayModifier` fields
  reserved.
- **Interdiction / at-risk combat** — deferred; visibly-in-transit fleets,
  fixed gate tiles, and mid-lane holds all keep the hook warm.
- **Fleet grouping** (multiple fleets on one route) — one fleet at a time for
  the slice.
- **Lane cost modifiers** (hazard/nebula-choked lanes) — `cost` field
  reserved; modifiers unbuilt.

## Proposed approach

**Commit.** The client asks for a route to a target system. The **server**
pathfinds shortest-time over the requester's *charted* lane network
(Dijkstra over known lanes; the target may additionally be a Rumored
one-hop neighbor), computes leg times from lane lengths ÷ the fleet's drive
speed, and returns `{route, legEtas, totalEta}`. The trip begins on the
origin board: **leg 0 is the #0004 burn from the fleet's current position to
the first lane's gate tile** (zero-length if already sitting on it), and the
frozen route + legEtas include it — one action, no queue, so "depart" is a
single order that survives offline. Commit stores the frozen route as a
#0005 action (`type: 'lane-travel'`, actor: the fleet, scope: the
destination system) in the same transaction that claims the fleet's single
action slot and flips its movement state.

**Travel.** Nothing runs. The fleet's position is computed piecewise from
`(route, legEtas, worldTime)` — #0004 burn math until the gate ETA, then
which lane it's on and how far along. The owner's #0002 view animates the
crawl and self-schedules a refetch at the ETA; observers see the fleet only
per #0006's sensor rules.

**Re-task.** A traveling fleet can always be re-ordered mid-transit.
**Cancel** halts it at its current computed position: on the board leg
that's #0004's stop-burning semantics; mid-lane the fleet flips to
**lane-hold** at its frozen fractional position and sits there, visible,
until re-ordered. **Redirect** reroutes from that same point — mid-lane the
new route may continue to the far node or backtrack to the near one (a
virtual start node in the Dijkstra, weighted by remaining/backtracked
distance) — and the replacement action commits with a fresh frozen ETA in
the **same transaction** that cancels the old one (single-slot safe, #0005).

**Arrive.** `now ≥ eta` *is* the arrival. Resolution (lazy, on any read, or
the #0005 sweep) materializes the transition: the fleet lands **coasting on
the destination board's rim** at its lane's bearing-aligned entry tile
(#0004 Decision #17), the destination flips to **Explored** with its onward
lanes charted (#0006), and a first-ever arrival triggers the #0003 detail
roll (create-if-absent). Kinematic with a mutating epilogue — exactly the
dispatch shape #0005 anticipates.

**Exploration falls out**: you can order travel to any charted system or one
hop past the frontier; arriving makes its neighbors the new frontier.
Advancing into the unknown is one system per trip, by design — the frontier
is *stepped*, not teleported.

## Design details

- **Where it lands:** the order surface extends `backend/fleet/` (#0004's
  domain — same `POST /v1/fleets/{id}/orders` endpoint, now accepting a
  `{systemId}` target for graph-tier travel; the server picks the tier by
  target type). Routing lives in the fleet service, reading the lane graph
  from the `system`/galaxy service and the requester's charted set from the
  observation service (#0006) — cross-domain via services.
- **Fleet movement state gains two shapes** (#0004's three plus):

  ```
  lane-transit { boardLeg?: { path, gateEta },   # leg 0: burn to the gate
                 route: [systemId], legEtas: [worldTime], departTime,
                 arriveTime }   # volatile-ish; position computed per leg
  lane-hold    { from: systemId, to: systemId, fraction }
                 # after a mid-lane cancel — holds, visible, until re-ordered
  ```

  Position = board-burn math until `gateEta`, then current lane (the leg
  whose `legEta` brackets `worldTime`) + fractional progress along it. On
  arrival the state collapses to `coast` at the destination rim (#0004 owns
  the board-side shape).
- **Routing contract:**
  - Graph = the requester's **charted lanes** (systems they've Explored and
    the lanes those systems revealed), plus edges to **Rumored** neighbors
    as *terminal* hops only — a Rumored system can be a destination, never
    an intermediate.
  - Weight = lane length (3D distance between #0001 node coords) ÷ the
    fleet's drive speed (a params-object value; the reserved hooks —
    `lane.cost`, `relayModifier` — multiply in later without restructuring).
  - A target with no charted route → a sentinel error (`common` errors per
    `backend/CLAUDE.md`), rendered as "no charted route" in the client. No
    blind jumps.
  - The route's first lane fixes the **departure gate**; leg 0 is the #0004
    burn to it. A **mid-lane redirect** routes from a virtual start node
    connected to both endpoints of the current lane (continue-forward vs.
    backtrack, weighted by the remaining/backtracked distance).
  - The route and leg times are **frozen at commit** (#0005
    freeze-at-commit): a drive-speed tuning change affects only newly
    committed trips.
- **Lane-gate geometry (resolved 2026-07-09; recorded in #0004 Decision
  #17 too):** each charted lane meets a board at **one fixed rim tile**,
  placed by projecting the lane's galaxy-tier bearing (#0001 node coords)
  onto the hex rim, ties broken deterministically so server and every client
  agree. A trip's entry tile is simply the arriving lane's gate on the
  destination board. The gates of the system you're **in** are always
  known (subspace geometry of your own system — the spike's model), and
  they're deliberately *fixed*: known choke points are ambush/interdiction
  geography, proven fun in the spikes.
- **Reveal on arrival** (the #0005 resolve dispatch for `lane-travel`):
  1. fleet → `coast` at the destination rim entry tile (bearing-aligned per
     #0004 Decision #17; exact tile-vs-arc geometry is the seam both specs
     share);
  2. observation write: destination → `explored`, onward lanes charted
     (#0006 — monotonic);
  3. first-ever physical arrival → #0003 detail generation,
     create-if-absent under the same resolution guard;
  4. completion envelope → SSE (#0005) → the galaxy view refetches.
  Slice reveal cadence is **destination-on-arrival**; lighting up pass-through
  nodes in transit is deferred (the spike demos it, it's cheap polish later —
  but note multi-hop routes only cross *charted* space, so there's nothing
  new to reveal mid-route anyway).
- **Client** (`frontend/CLAUDE.md` layering): the #0002 galaxy view gains
  select-system → route preview (polyline over the lane chain, per-leg +
  total ETA labels) → commit through the fleet service; the traveling fleet
  animates along the lane from `worldTime` (offset clock, #0005/#0007's
  `useWorldTime`), with the ETA self-scheduled refetch. The **board-side
  surface** — gate tiles rendered on the rim, select a gate or a system →
  depart — is #0007's UI over this same order endpoint. Spike
  (`frontend/app/spike/galaxy-3d/`) is the feel reference, rebuilt on the
  layered stack.
- **One trip, two canvases.** A trip is drawn by whichever view owns the tier
  it's currently on, and the fleet is drawn **exactly once**: leg 0 is a #0004
  burn on the origin *board* (path and all — the board draws a trip's board leg
  with the same code it draws a burn with); past the gate ETA the fleet has no
  hex on any board and the *galaxy* draws it crawling its lane. Crossing the
  gate while you watch **hands the view off** to the galaxy, so the camera
  follows the hull rather than staring at the board it left. The two pictures
  can't disagree: both are computed from `(state, worldTime)`, and both drop the
  fleet the moment the other picks it up. `frontend/components/board/glyph-
  geometry.ts` (`fleetOnBoard`) is the seam.
- **Reserved hooks (schema now, mechanics later):** `cost`/`relayModifier`
  on lanes, `jumpRange` on the fleet drive, `relay` on a system — so FTL and
  corridors layer on with zero rework.
- **Tuning is data:** drive speed, and later the FTL cost curve, live in a
  params object with spike values as defaults.

## Scenarios

### S1 — Commit freezes the whole trip in one action

- **Given** a fleet in a system with a charted lane route to a destination
- **When** it is ordered to travel there
- **Then** one `lane-travel` action is committed carrying the frozen
  `{boardLeg, route, legEtas, arriveTime}`, and the fleet flips to
  `laneTransit` in the same transaction
  *(`TestOrderTravel_FreezesTripAndCommits`.)*

### S2 — A destination with no charted route is refused

- **Given** a fleet whose corporation has not charted a lane route to a system
- **When** it is ordered to travel there
- **Then** the order fails with the no-charted-route sentinel and the fleet
  keeps its current state *(`TestOrderTravel_NoRouteSurfacesSentinel`.)*

### S3 — Arrival lands at the rim entry gate and reveals the destination

- **Given** a fleet whose trip's arrival time has passed
- **When** any read resolves it (lazily, or via the sweep)
- **Then** the fleet coasts at the destination board's entry-gate tile, the
  destination is `explored` with its onward lanes charted, and the interior
  detail is rolled exactly once
  *(`TestTravelResolver_LandsAtEntryGateAndReveals`,
  `TestIntegration_TravelArriveReveals`.)*

### S4 — A cancel mid-lane parks the fleet where it is

- **Given** a fleet out on a lane between two systems
- **When** its trip is cancelled
- **Then** it holds at its computed fraction of that lane, visible, until
  re-ordered *(`TestCancel_MidLaneHolds`.)*

### S5 — Departure is geometric: the fleet flies to the gate first

- **Given** a fleet on a board that has committed a trip out through a lane gate
- **When** the board is drawn before the trip's gate ETA
- **Then** the fleet is on that board, gliding along its board leg, with the run
  out to the gate drawn as a path — the same picture as any burn
  *(`BoardScene > draws a departing fleet on its board leg…`.)*

### S6 — Crossing the gate leaves the board and hands off to the galaxy

- **Given** a fleet the player is watching depart, whose trip passes its gate ETA
- **When** the clock crosses that ETA
- **Then** the fleet is no longer drawn on the board (it has no hex there — in
  particular it must not fall back to the star's centre cell), and the view
  follows it to the galaxy; opening that board again mid-trip does **not** bounce
  the player out *(`SystemBoardView > hands off to the galaxy view…`,
  `SystemBoardView > stays put when opening a board whose fleet is already out on
  a lane`.)*

### S7 — A fleet on a lane crawls it, and is not parked at the star it left

- **Given** a fleet whose trip is past its gate ETA (its `systemId` still names
  the origin, which is only settled at arrival)
- **When** the galaxy view is drawn at successive world times
- **Then** it appears at the computed point along its current lane, advancing as
  the clock runs, with its route lit — and **not** as a presence marker on the
  system it departed *(`transitPoint > crawls the first lane, then the second…`,
  `TransitLayer > slides a marker along its lane…`, `GalaxyView > hands a
  travelling fleet to the transit layer…`.)*

### S8 — The hull on the lane is clickable, and says what it is

- **Given** a fleet drawn crawling a lane on the galaxy
- **When** its marker is clicked (or its roster row is)
- **Then** a card opens naming the fleet, its route, and its live arrival ETA —
  and the camera goes to the hull's point on the lane, not to a star, because it
  isn't at one *(`GalaxyView > opens a card for the fleet whose lane marker is
  clicked…`, `GalaxyView > a roster row for a fleet on a lane glides the camera
  to it…`, `TransitLayer > is pickable…`.)*

## Acceptance criteria

- [x] Requesting a route to a **charted** system returns the shortest-time
      lane path with **per-leg and total ETA**; leg times are proportional to
      real 3D lane length.
- [x] Requesting a route to a **Rumored neighbor** succeeds as a terminal
      hop; requesting one to any system with **no charted lane route**
      (unreached star, or through uncharted intermediates) fails with a
      sentinel error — verified with two players whose charted sets differ:
      the same target can route for one and refuse for the other.
- [x] Commit freezes `{boardLeg, route, legEtas, arriveTime}` in a #0005
      action + flips the fleet to `lane-transit` in one transaction; the
      single-slot guard rejects a second order.
- [x] **Departure is geometric**: a trip ordered from a board includes leg 0
      — the burn to the route's first lane's **fixed gate tile** (zero-length
      when already on it); the fleet visibly transits the gate before
      entering the lane.
- [x] **Gates are fixed and consistent**: a given lane always uses the same
      rim tile on a given board (bearing-projected, deterministic), entry
      side and departure side alike; any player in a system can read its
      gates.
- [x] A traveling fleet's graph position is **computed** from
      `(boardLeg, route, legEtas, worldTime)` — correct mid-leg answers with
      no stored per-tick position (emulator test at injected clock times).
- [x] **Mid-transit cancel** halts the fleet at its computed position:
      board-leg → #0004's stop-burn; mid-lane → `lane-hold` at the frozen
      fraction, where it stays visible until re-ordered.
- [ ] **Mid-transit redirect** reroutes from the current computed position
      (mid-lane: forward to the far node or back to the near one), cancelling
      the old action and committing the new frozen route + ETA in **one
      transaction** under the single-slot guard.
- [x] Arrival resolution (triggered lazily by any read, or by the sweep)
      lands the fleet **coasting at the destination board's rim entry tile**,
      flips the destination to **Explored** with onward lanes charted, and
      triggers the #0003 detail roll exactly once on a first-ever arrival.
- [x] Reveal is **destination-on-arrival**; no reveal occurs at commit time
      or mid-route.
- [ ] The owner sees route + ETA; an **observer's** read shows the traveling
      fleet only per #0006's visibility rules, and never the route or ETA
      (#0005 owner-only projection).
- [x] The #0002 view: select a system → route preview with ETA labels →
      commit → the fleet crawls the lane over real time and the destination
      lights up on arrival — surviving a page reload mid-trip (state is
      server-side; the client re-derives the animation from the read).
- [ ] Schema carries the reserved hooks (`cost`, `relayModifier`,
      `jumpRange`, `relay`) unused; drive speed lives in the params object.
- [ ] **Slice bar:** from the home board, depart via a lane gate to another
      system; the fleet gets there over real time (offline included) and
      reveals it — and a mid-trip change of mind cleanly cancels or
      redirects it.

## Implementation notes (2026-07-13)

- **Where it landed:** `backend/fleet/travel.go` (`PreviewRoute` / `orderTravel`
  / `buildTrip`), `travel_resolver.go` (the arrival epilogue), `routing.go` (the
  fog-honest Dijkstra); `backend/board/ship.go` carries the `laneTransit` /
  `laneHold` shapes. Client: `frontend/components/galaxy/transit-geometry.ts`
  (pure: where a fleet is between stars) + `transit-layer.ts` (the three.js
  overlay), `frontend/components/board/glyph-geometry.ts` (`fleetOnBoard`, the
  board/galaxy seam), and `frontend/components/fleet/` (the roster, spec #0011).
- **The first client build drew the trip only half-way, three ways** — all one
  root cause: the board understood `burn` and nothing else. Leg 0's path wasn't
  drawn (the path layer filtered on `mode === 'burn'`); the fleet *snapped*
  hex-to-hex instead of gliding (the glide had no `laneTransit` branch, so it
  fell back to the quantized logical hex); and past the gate the fleet was drawn
  at the board's centre cell — `shipPos` correctly reports "no hex here"
  (`ok: false`) with a `(0,0)` placeholder, and both callers ignored the flag,
  planting the hull on the star. The fix makes leg 0 **a burn everywhere** (one
  `boardLegBurn` view of it feeds the path, the glide, and the thruster) and
  makes `ok: false` load-bearing via `fleetOnBoard`. Recorded because the shape
  of the bug — *a state the renderer doesn't know about degrades to a plausible
  wrong answer rather than an obvious one* — will recur with every new movement
  mode.
- **The hand-off (new, 2026-07-13):** crossing the gate while the player watches
  navigates the board view to the galaxy (`/`), armed by a ref so only a
  *watched* departure follows the fleet — revisiting the board mid-trip doesn't
  bounce you. Without it, a correct departure looked like the fleet vanishing.
- **Still open:** mid-transit **redirect** has code but no test; the observer
  projection (a foreign fleet's read never carrying route/ETA) is unverified;
  the reserved schema hooks (`cost`, `relayModifier`, `jumpRange`, `relay`) are
  not in the structs yet; and the slice e2e is unwritten. Those four acceptance
  boxes stay unticked.

## Decisions (imported from `../plans/movement-galaxy.md`)

1. **Lane-based, not free-travel (2026-07-06)** — choke points are the map's
   drama; free travel dissolves them.
2. **Lanes discovered by presence (2026-07-08** — reverses "lanes are
   visible"**)** — the star map beckons; the roads are charted by going
   (`../lore.md`, #0006).
3. **Known-lane-reachable only, one hop past the frontier (2026-07-08)** —
   no blind jumps; exploration advances one system per trip.
4. **Cost is time, length-weighted, surfaced (2026-07-07)** — the galaxy
   tier is time-gated, not fuel-gated (fuel stays board-tier, #0004); the
   route preview shows the numbers because 3D can't be eyeballed.
5. **Roads-vs-off-road hybrid, mechanized as drive jump range (2026-07-07)**
   — barriers are economic chokes, not walls; slice range ≈ 0 → lanes-only
   is a clean subset.
6. **Three orthogonal fast-travel mechanisms (2026-07-07)** — lanes
   (everyone) / FTL jump (carried tech) / relay corridor (built, tolled).
   Kept distinct or they blur into one "go faster" knob.
7. **The fleet is the mover (2026-07-07)** — the same entity at both tiers;
   bases stay put; grouping deferred.
8. **Destination-on-arrival reveal (2026-07-07)** — in-transit light-up is
   deferred polish.
9. **Rim handoff is bearing-aligned (#0004 Decision #17)** — each lane maps
   to the rim tile in its galaxy-tier direction (geometry resolved at
   acceptance — see #10).

Resolved at acceptance (2026-07-09):

10. **Gate geometry: one fixed rim tile per lane** (settles #0004 Decision
    #17's open "tile vs. arc"; recorded in both specs) — the spike's
    `laneExits` model, with placement by deterministic bearing projection
    instead of the mock's random spread. Fixed gates are deliberate
    ambush/interdiction geography — known choke points proved fun in the
    spikes.
11. **Board-side departure ships in the slice** (revises the earlier
    arrival-side-only scope) — leaving = burn to the lane's gate tile,
    committed as **leg 0 of the one trip action** (no queue, offline-safe);
    trips never start from an abstract "in-system" state.
12. **Mid-transit re-task is a requirement, not polish** — cancel halts in
    place (board leg: #0004's stop-burn; mid-lane: `lane-hold` at the frozen
    fraction), redirect reroutes from the current point (continue or
    backtrack via a virtual start node), both as cancel + commit in one
    transaction with a fresh frozen ETA.

## Open questions

- **FTL cost-per-distance curve** — tuning, progression-era; not structure.

## References

- `../plans/movement-galaxy.md` — the full design (boundary, cost analysis,
  progression mechanisms, interactions).
- Related specs: **#0001** (the lane graph + coords), **#0002** (the view
  that previews routes and animates the crawl), **#0004** (the sibling verb;
  the fleet entity; the rim seam — Decision #17), **#0005** (the action
  spine; freeze-at-commit; resolution dispatch), **#0006** (what arrival
  reveals; charted-lanes routing input), **#0003** (first-arrival detail
  generation).
- `../lore.md` — subspace geometry ≠ real space; tracing the roads.
- `frontend/app/spike/galaxy-3d/` — the in-progress lane-travel spike.
- `../vision.md` — "graph = navigate"; the ever-growing frontier.

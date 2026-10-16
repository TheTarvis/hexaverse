> Historical numbered-spec snapshot, archived 2026-10-16. Original source:
> [docs/specs/0004-movement-board.md](../../../specs/0004-movement-board.md). Old status/scenarios are provenance,
> not current instructions or live implementation work. Current owners are in
> [canonical documentation](../../../README.md).
> Plain-text relative paths retain the original source context.

---
number: 0004
title: In-system movement (coast & thrust)
status: implemented   # draft | accepted | implemented | superseded
created: 2026-07-07
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0004 — In-system movement (coast & thrust)

> **Recorded, not decided (2026-09-04, openspec `delete-the-lattice`).** This
> document describes in-system movement on the hex/ring board, and that board
> no longer exists: `backend/board`, `backend/polar`, `frontend/lib/board`,
> `frontend/lib/polar` and `fixtures/board` are all deleted, and a fleet's
> position is a continuous `space.Vec3` solved by `backend/space`. Most of the
> mechanics below — hex lines, ring cells, `routeAround`, the core hex — name
> things that are gone.
>
> Its **status is deliberately left `implemented`, and this change does NOT
> mark it `superseded`.** The `docs/specs/` numbered series is Travis's own
> artifact and its supersession policy is his to set, not the spec team's.
> Two facts argue against a blind stamp, which is why the question is being
> asked rather than answered:
>
> - `S1` and `S2` (below) are still **true** in continuous space — "a new
>   order departs from where the ship actually is, even when its last arrival
>   never settled", and its cancel counterpart — and are still **cited by
>   surviving tests**: `backend/fleet/stale_arrival_integration_test.go:84,107`
>   name them as `Spec: 0004/S1` and `Spec: 0004/S2`, and
>   `frontend/lib/spec-scenarios.test.ts` enforces that seam (13 tests, green
>   after every deletion in this change).
> - So the document most likely to look retired is the one whose scenarios are
>   most alive.
>
> **Open question for Travis:** mark `0004` superseded and re-home S1/S2 (they
> have openspec successors — the tests name them: *"Order to a Body or a
> Point"* and *"An Arrival That Went Dark"*), or leave it as the historical
> record of a shipped design with two still-load-bearing scenarios? The
> companion question for `0007-hex-board-view.md` is easier: it declares **no**
> `### S` scenarios at all, so nothing cites it and nothing breaks either way.

> The **movement verb** on the orbital hex board: **coast** your orbit for free,
> **thrust** to break free and travel hex-to-hex, **click a moving body to
> intercept** it (the game leads the target for you) and **dock** to ride it —
> every burn a deterministic, **async** action that resolves over real time. The
> verb layer that brings #0003's board to life.

## Problem / motivation

`../vision.md` step 5 is "**move a ship**," and movement is the substrate every
other tactical verb sits on — scanning sweeps a bubble that *rides* the ship,
mining needs you to *reach and dock* a body, engagement *is* closing distance.
Today there is no verb: #0003 generates the board (a star-centered hex grid of
orbital sectors) and gives every body **orbital elements**, but it **explicitly
stops at the world** — "does not define the actions taken on it." A ship can be
placed on the board and can go nowhere. Without movement the interior is a static
diorama, and the first-slice loop (*drill in → move → scan → mine*) has no first step.

This spec defines that verb, on top of two properties #0003 already guarantees:
positions are **computed from `(elements, worldTime)`** (so a body's future
location is exactly knowable), and the world runs on an **async cadence** (actions
resolve over minutes–hours, completing while you're offline). Those two facts are
what make the interesting version of movement — *lead a moving target, commit, and
it's there in 42 minutes, guaranteed* — cheap to build and honest to promise.

Scope boundary: this spec owns the **movement state machine, the burn/intercept
action, and its resolution semantics**. It does **not** build the generic
action/timer infrastructure, the fuel economy, engine progression, or combat (see
Non-goals). The design is worked out in `../plans/movement-board.md` and
de-risked by the `frontend/app/spike/hex-board/` prototype; this spec is its
buildable distillation.

## Goals

- **Coast is the resting state** — a ship with no orders **rides its current orbit
  for free**, on rails, zero input (same orbital-element model as any #0003 body).
- **Thrust is a game model, not a physics sim** — no delta-v, no transfer orbits.
  **Click a destination, the game plots the path**; the ship travels **hex-to-hex**
  over real time and **settles into the local orbit on arrival**. Readable, not Kerbal.
- **Click a body → assisted, deterministic intercept** — because the target moves,
  the game *leads* it (its future position is computed), draws the predicted meeting
  point + ETA, and burns there. The player **never manually leads** a moving target.
- **Dock to ride** — attach to a body on arrival, inherit its motion,
  station-keeping free (how you park/mine; the same mechanism moons use).
- **Every burn is an async action** — at **commit** the server computes the **exact**
  intercept + ETA (determinism makes "arrives at T" truth, not estimate); the burn
  resolves over real time and completes offline.
- **Coasting = predictable ephemeris; burning = volatile activity** — a coasting or
  docked ship is sent as **elements** (extrapolable); a thrusting ship is a **live
  snapshot** (not predictable). Movement is where #0003's Decision #10 split earns out.
- **Re-task / cancel underway**, recomputed from the ship's current position.
- **Motion-agnostic** — the *same code path* works whether #0003 runs orbits **off/slow**
  (the slice, where a body target reduces to a static hex) or **on** (intercept comes
  alive) — **no rework**.
- **Combat-aware, combat-free** — closing for a fight is an intercept burn; escaping
  is coasting away. Movement is designed as the substrate combat will sit on.

## Non-goals

- **Generic action / timer system** — the async spine (queue, resolve-while-offline,
  notifications) is its own foundational spec — **#0005** (spec'd 2026-07-09).
  This spec defines the **burn action + its resolution semantics** and rides that
  spine; for the slice, arrival **resolves lazily/computed** (Decision #12), so it
  ships without the generic scheduler.
- **System interior (#0003)** — supplies the board, bodies, and orbital elements
  movement rides on. This consumes that model; it does not generate it.
- **Fuel economy / stranding / refueling** — deferred. Slice burns are **free**;
  positioning-as-resource (fuel vs cooldown, refuel model, stranding grace) is a
  later economy knob (`../plans/market.md`), not this spec.
- **Engine progression** — burn speed / range / coast control / in-system jump as
  tech axes are deferred (the movement half of the progression pillar, later).
- **Combat / engagement resolution** — deferred; movement is built combat-aware but
  resolves no fights.
- **Graph-tier (inter-system lane) movement** — `../plans/movement-galaxy.md` → its
  own spec. The **graph↔board handoff** at the rim is the **shared seam** (below).
- **Ship composition inside a fleet** — this spec owns the **fleet as mover** (a thing
  at a position that can be ordered to move); fleet **membership/stats/roles/split/merge**
  are a separate ship/fleet spec that adds them onto the fleet (Decision #8).
- **Hazard/terrain movement modifiers, multi-leg paths, match-orbit rendezvous,
  mid-burn auto-repath, body-vs-body collision** — deferred (see Decisions).

## Proposed approach

Movement is a **state machine on the fleet** (the map-mover; a lone ship is a
fleet-of-one), with exactly three states — **coast**, **burn**, **docked** — mirroring
#0003's `Feature` position model (a fleet is just a *mobile* actor whose position is
`orbit` | `parentId`-ride | a `burn` path).
The **backend owns authoritative transitions**; the **client predicts and previews**.

1. **Coast (resting).** No order → the ship carries orbital elements like any body;
   its live hex is `orbState(elements, worldTime)`.
2. **Commit a burn.** The client requests an order to a **target** — a hex or a
   `featureId`. The **server** solves it:
   - *Hex* → a straight hex-line path; `arriveTime = now + dist / burnSpeed`.
   - *Coasting feature* → a **deterministic lead-solve**: the earliest future
     `worldTime` at which the ship (from its current hex, at `burnSpeed`) can be
     where the body **will** be — exact, because the body's path is computable. The
     meet hex + `arriveTime` are canonical.
   The server persists the order (`path`, `startTime`, `arriveTime`, `dockOnArrive?`)
   and flips the ship to **burn**.
3. **Travel.** Position while burning = interpolate along `path` by
   `(worldTime − startTime)/(arriveTime − startTime)`; the **logical hex is the
   nearest path cell** (quantized), the pixel glides (spike's `shipPosAt`).
4. **Arrive.** At `arriveTime` the ship transitions: **dock** (ride the target
   feature) if the order was an intercept, else **coast** the orbit of the hex it
   settled on. Because the path is deterministic and `arriveTime` known, **arrival
   is a computed fact, not a fired event** (Decision #12) — a read after `arriveTime`
   simply sees the ship docked/coasting. A running scheduler is needed only for
   *side-effecting* resolution (e.g. arrival triggers #0003 first-visit generation,
   or a notification) — that rides the action system when it lands.
5. **Re-task / cancel.** A new order recomputes from the ship's current computed
   position; cancel drops to **coast** from wherever it is.

The **wire split** falls out for free: a **coasting/docked** ship is **elements**
(the client extrapolates it), a **burning** ship is **volatile** and sent as **live
snapshots while Visible** — exactly #0003 Decision #10, now with a concrete producer.

## Design details

- **Where it lands:** a **top-level `backend/fleet/` domain** owning the **fleet actor +
  its movement state** (`handler→service→DAO`, Firestore-backed, per `backend/CLAUDE.md`).
  The fleet is the **mover** (a lone ship is a fleet-of-one); **ship composition is
  deferred** (Decision #8). Movement operations are **service operations** (solve +
  persist), server-authoritative — never a raw client position write. The `fleet`
  service reads the interior from the `system` service (service-to-service) to solve
  intercepts and validate targets.
- **Movement state (data model) — one field, three shapes:**
  - `coast { orbit: { ring, angle0, period, dir } }` — predictable; **same shape as
    `Feature.orbit`** in #0003.
  - `burn { path: [Axial], startTime, arriveTime, target: {hex} | {featureId},
    dockOnArrive?: featureId }` — **volatile**.
  - `docked { parentId: featureId }` — rides the parent; **same `parentId` ride** as a
    #0003 moon.
  - **No per-tick position is stored** — live hex(es) are `shipPos(state, worldTime)`.
- **Shared math, evaluated at both ends:** `shipPos` and the intercept `solve` are the
  spike's `shipPosAt` / `solveIntercept`, promoted to shared logic. **Client** evaluates
  for **rendering + a live preview** (the lead marker tracks as the world turns —
  pure feel, non-authoritative). **Server** evaluates for the **canonical order**
  (meet hex, `arriveTime`) and for **authoritative resolution** (arrival, dock,
  co-occupancy) — the #0003 Decision #10 "send elements, evaluate both ends" contract.
- **Intercept is only valid against a *coasting* target.** A **volatile** (thrusting)
  target is **not** extrapolable, so an intercept aims at its **last-known Visible
  snapshot** (or is disallowed) — never a predicted lead. This is the juke: thrusting
  breaks a pursuer's solution.
- **The star at the core is off-limits (added 2026-07-10).** The star occupies the
  core hex `(0,0)` — it is a body, not a destination. A burn whose straight hex-line
  would cross the core **routes around it** (`board.RouteAround`: detour via the
  least-cost ring-1 hex beside the star; the ETA follows the routed length, not the
  straight-line distance). Both ends ran the identical routing, pinned by a
  `routeAround` cross-language fixture family, so the client preview matched
  what the server committed. (That family, and the hex board it described, were
  deleted with the lattice — see the note at the top of this document.) And the **core is rejected as a destination** — you can
  neither fly a fleet onto `(0,0)` nor dock the star (`fleet.ErrCoreDestination` →
  `400`); the client offers no move-onto-star and says so in the facts panel.
- **API (sketch)** — a fleet is top-level (Decision #8), so routes are **not** nested
  under `system`:
  - `POST /v1/fleets/{id}/orders` `{ target: {hex}|{featureId} }` → server solves →
    `{ path, meetHex, arriveTime, dockOnArrive? }`, state ⇒ `burn`. (Target resolves
    within the fleet's current `systemId`.) Re-tasking replaces the active order.
  - `POST /v1/fleets/{id}/cancel` → state ⇒ `coast` from current hex.
  - **Read** returns the fleet's movement state **+ `worldTime`**; the client computes
    the render position. Fog-filtered per requester (fog spec). A **burning** fleet is
    read/broadcast as a **snapshot**, not elements.
- **Resolution (slice): computed, not scheduled.** Arrival/dock/coast is
  `worldTime ≥ arriveTime`; a canonical state flip is done opportunistically (next
  read/write touches it) or by the action/timer system later for side effects. No
  scheduled job is required for the *position* to be correct.
- **Realtime:** a fleet in `burn` is **activity** → SSE snapshot to the system channel
  while Visible (cadence + audience owned by fog + SSE surface). Coasting/docked fleets
  need **no per-tick broadcast** — they're predictable from elements. No new Pub/Sub
  envelope required for the slice.
- **Graph↔board seam:** arriving from a lane places the fleet **coasting on the rim ring
  at the entry tile** (the `movement-galaxy.md` handoff); leaving = reach a **rim exit
  tile** and hand off to graph movement. **Exit tiles are bearing-aligned** — each
  lane maps to the rim tile in its galaxy-tier **direction**, so the two tiers stay
  spatially coherent and departure positioning matters (Decision #17). *Resolved
  2026-07-09 with #0008:* the geometry is **one fixed gate tile per lane**
  (deterministic bearing projection onto the rim), and **departure ships in the #0008
  slice** — the burn-to-gate is leg 0 of the trip action; this spec owns the burn,
  #0008 owns the trip.
- **Tuning is data, not code:** `burnSpeed` (hexes/tick), intercept search horizon, and
  later fuel/range live in a **params object** (as #0003's `GenerationParams`), with the
  spike's `BURN_SPEED` as the baseline default.
- **Reference client:** `frontend/app/spike/hex-board/` is the proven feel — select →
  live preview (route + led meet + ETA) → commit (order); coast/burn/docked rendering,
  ship-mounted scan bubble, cancel/re-task, commit-clears-selection. The production
  client reuses the math but takes positions/orders from the backend.

## Scenarios

Arrival is a computed fact: at `arriveTime` the ship **is** in its settled state
(coast of the local orbit, or docked), whether or not any read has run the
authoritative settle yet. These scenarios pin the doors where a stored-but-stale
`burn` must not leak: every verb and every read must act on the state the fleet
is *in*, not the state last *written*. (Added 2026-07-14 after the frozen-ship
regressions; implemented by the effective-state fold — `board.StateAt`, mirrored
as `stateAt` in `lib/hex`, pinned by the `stateAt` golden fixture cases.)

### S1 — a new order departs from where the ship actually is, even when its last arrival never settled

- **Given** a fleet whose burn's `arriveTime` has passed, settling it (by the
  arrival rule) into the local coast orbit — but whose doc still says `burn`
  because no read has run the settle
- **And** enough time has passed since arrival that the coast orbit has carried
  the ship several hexes away from the burn's meet hex
- **When** a new order is issued, with no intervening read
- **Then** the new burn's origin (`path[0]`) is the ship's live coast position
  at order time — not the meet hex the finished burn ended on

### S2 — cancel after an unsettled arrival holds the ship at its live position

- **Given** the same arrived-but-unsettled fleet, drifted along its ring since
  arrival
- **When** the order is cancelled
- **Then** the resulting halt coast passes through the ship's live position at
  cancel time — the ship does not teleport back to the finished burn's meet hex

## Acceptance criteria

- [x] A fleet holds exactly **one** movement state — `coast | burn | docked` — and its
      live hex is **computed** from `(state, worldTime)`, never stored per tick.
- [x] **Click a hex** → server returns a **contiguous hex-line path** + `arriveTime`;
      reading position before/at/after `arriveTime` shows travel then **coast of the
      local orbit** on arrival.
- [x] **Click a coasting body** → server returns a **deterministic intercept** whose
      meet hex **equals the body's computed position at `arriveTime`**; the ship
      **docks** (rides the body) on arrival.
- [x] ETA is computed **at commit** and holds when read later — arrival is **computed,
      not dependent on a running scheduler** for the slice.
- [x] **Re-task** mid-burn recomputes from the ship's current computed position;
      **cancel** resumes coast from the current position.
- [x] **Motion-agnostic:** with #0003 orbits off/slow, a `featureId` target reduces to
      a static hex and the **same** order path yields click→travel→arrive — no
      intercept special-case, no rework.
- [x] A **burning** fleet is represented as a **volatile snapshot** on the read/broadcast
      surface; **coasting/docked** fleets are **elements**.
- [x] **The star at the core is off-limits** (added 2026-07-10): a burn that would
      cross `(0,0)` **routes around** it (identical both ends, fixture-pinned), and the
      **core is rejected as a destination** — no flying onto `(0,0)`, no docking the
      star (`ErrCoreDestination` → `400`).
- [x] **Slice bar:** a player can **order a ship to a location and it gets there over
      real time**, resolving while offline.
- [x] Burn tuning (`burnSpeed`, horizon) lives in a **params object**, spike values as
      defaults.
- [x] Backend tests (emulator): **intercept determinism** (meet = body pos at
      `arriveTime`), **path contiguity + endpoints**, **arrival transition** (coast vs
      dock), and **re-task/cancel** from mid-burn.

## Decisions (imported from `../plans/movement-board.md`)

1. **A game model, not a physics sim.** Thrust is grid movement; orbits are the
   resting state. Fidelity dial set to *readable*, not *Kerbal*.
2. **Click-a-destination, the game plots the path.** Rejected: manual heading/vector
   (too fiddly), free-flight ignoring orbits (loses the point), transfer-orbit
   planning (too heavy).
3. **Assisted, not manual, intercept.** The game leads a moving target
   deterministically; you never eyeball the lead.
4. **Dock = attach & ride** (inherit motion, station-keeping free) — the same
   mechanism moons use; how you park and mine.
5. **Moves are async actions** resolving over real time; **commit-time computes the
   exact intercept + ETA** (determinism → truth, not estimate).
6. **Coast = predictable ephemeris; burn = volatile activity** — the wire split, now
   with a producer (ties #0003 Decision #10).
7. **Select → preview → commit is one gesture** (proven in the spike): preview is
   live and moves nothing; commit fires the order and **clears the selection**;
   clicking an **already-selected** tile/body **deselects** it.

## Decisions (resolved while drafting, 2026-07-07)

8. **Movement is a state machine on the *fleet* — the map-mover** (`coast | burn |
   docked`), mirroring #0003's `Feature` position model. Per the standard stack model,
   **everything on the board is a fleet** (a lone ship is a **fleet-of-one**), and
   **position + movement state live on the fleet** — so movement **never migrates**
   when ship composition arrives. Lands in a **top-level, server-authoritative
   `backend/fleet/` domain** (a fleet persists *across* systems, carrying a current
   `systemId`, so it is **not** nested under `system`). **Ship composition** (members,
   stats, roles, split/merge) is **deferred** to a future ship/fleet spec that *adds*
   it to the fleet; the slice fleet has no modeled members and the UI draws it as a ship.
9. **Single destination per order** for the slice. **Multi-leg paths** and a distinct
   **match-orbit rendezvous** verb are deferred.
10. **No fuel/cost in the slice** — coasting and burning are free. Positioning-as-
    resource (fuel/cooldown/stranding/refuel) is a later economy knob, not this spec.
11. **Intercept supported from day one, slice-gated by motion.** An order target is a
    hex *or* a `featureId`; a coasting feature gets the lead-solve, a static one
    reduces to its hex. The slice bar only requires click-hex→arrive; intercept comes
    alive when #0003 motion turns on — **zero rework** either way.
12. **Arrival is computed, not fired.** Deterministic path + known `arriveTime` makes
    position a pure function of `worldTime`, so the slice needs **no scheduler**. The
    generic **action/timer system** (now **#0005**) is required only for
    **side-effecting** resolution (arrival-triggers-generation, notifications);
    movement rides it when it lands.
13. **Re-task and cancel allowed underway**, recomputed from the ship's current
    computed position (no refund logic — no fuel).
14. **Target moved/destroyed in transit:** determinism holds only for **coasting**
    targets, so the committed path is **frozen to the predicted meet**. If the target
    is later moved (its owner thrusts) or destroyed, the burn **completes at the
    predicted hex (arrive-at-empty-space), then coasts** — no auto-repath in the slice.
    (This is also how a thrusting target **jukes** a pursuer.)
15. **Occupancy:** a ship may **co-occupy** a body's hex (it's "at" it — enables
    dock/mine); ships do **not** block each other's hexes in the slice. Hazard-on-
    coast-path risk and body-vs-body collision are deferred.
16. **Combat-aware, combat-free:** closing for a fight *is* an intercept burn;
    escaping *is* coasting away; a thrusting (volatile) target is unpredictable.
    Movement is the substrate combat will sit on; combat resolution is deferred.
17. **Graph↔board handoff is bearing-aligned.** Each lane maps to the **rim tile/arc in
    its galaxy-tier direction** (the lane heading "north-west" on the #0001 map exits at
    the north-west rim) — keeping the two tiers spatially coherent and making departure
    positioning a resource. Rejected: *any rim tile* (severs the tiers, positioning
    meaningless) and *the entry tile* (arbitrary). The **exact geometry** (single tile vs
    arc; projecting #0001's lane bearing onto the hex rim) was co-owned with the
    galaxy-movement spec at the shared seam — **resolved 2026-07-09 (#0008 Decision
    #10): one fixed gate tile per lane**, deterministic bearing projection, entry and
    departure sides alike; departure ships with #0008 (burn-to-gate as leg 0 of the
    trip action).
18. **Uniform burn cost; directional fidelity is a deferred knob.** A burn costs the same
    regardless of heading (prograde/retrograde/radial) — one `burnSpeed`, no per-heading
    modifier — keeping it *readable, not Kerbal* (Decision #1) and the intercept solve
    simple. An **against-orbit cost multiplier** is just another value in the tuning
    params object, **defaulted off**; flip it on later for more sim flavor with no code
    restructuring.
19. **This spec owns the ephemeris-vs-activity invariant; cadence + audience are
    delegated.** A **burning** fleet is broadcast as a **live snapshot while Visible**;
    a **coasting/docked** fleet is sent as **orbital elements** with **no per-tick
    broadcast**. This spec is the *producer* and asserts the split; the snapshot
    **cadence** (tick rate) is owned by the **realtime/SSE** surface and the **audience**
    (who counts as Visible) by **fog-of-war** — neither is a knob this spec sets. The
    richer *gameplay* this unlocks (predictable coast = sellable ephemeris; loud burn =
    juke) is parked in `../plans/BRAINSTORM.md` §Predictable drift vs. loud burn, not
    built here.

20. **A coasting fleet obeys the same orbital law as a body** (2026-07-13). The Goals
    above always said coast rides "the same orbital-element model as any #0003 body",
    but the implementation gave fleets their own `CoastPeriod`: a **flat** period, not
    scaled by ring. Since a ring holds `6 × N` cells, that meant a fleet's hex-crossing
    rate was `CoastPeriod / 6N` — **a fleet at the rim drifted faster than one near the
    star**, the reverse of the intended physics. It went unnoticed only because the
    value (~1000 world-hours) was large enough to freeze ships outright.
    There is now **one orbital law**, `common.GameTuning.OrbitPeriod(ring)` =
    `OrbitBasePeriod × ring`, shared by bodies and coasting fleets; `CoastPeriod` and
    `MovementParams.CoastPeriod` are gone. It is read **live at settle time**, so
    retuning re-paces fleets already in flight.
    This makes the coast/dock split load-bearing, as the Goals intended: **coast = a
    free orbit at your radius** (so a parked ship *drifts*, and drifts away from a body
    whose `dir` differs); **dock = attached to a body, riding it** — the station-keeping
    mechanism, and the one that matters for mining (#0010).

    Two things fell out of turning fleet motion on, both of which had been dormant
    because a motionless ship can't expose them:
    - **Settling must back-solve the epoch angle** (`board.OrbitThrough`). `Angle0` is
      the ring index **at the world epoch**, but settling stored the index the ship was
      at **now** — so `OrbState` advanced it by all the elapsed world-time and the ship
      **teleported** on arrival. A settle therefore takes the *time* it settles at, and
      the orbit is anchored so it passes through that hex at that instant.
    - **`Period` is not persisted anywhere** an `Orbit` is stored (fleet coast state,
      remembered observations, system features). It's hydrated from the live law on
      every read, or a retune moves the planets and leaves the ships behind — which is
      exactly what happened the first time.

## Open questions

- **None blocking.** All four opening questions are resolved (Decisions #8, #17, #18,
  #19). Two were **cross-spec boundaries** delegated by design, not unknowns: the
  graph↔board **exit-tile geometry** (co-owned with the galaxy-movement spec, #17 —
  since resolved 2026-07-09: one fixed gate tile per lane, #0008 Decision #10) and
  the **volatile-snapshot cadence + audience** (owned by fog + the SSE surface, #19).
  Both are tracked in Decisions/References.

## References

- Related specs: **#0003** (system interior — the board + orbital elements this rides
  on; **build after** #0003, mirroring #0001→#0002), **#0001/#0002** (graph tier).
- `../plans/movement-board.md` — the full design (the verb, cost, progression,
  interactions, slice/deferred).
- `../plans/movement-galaxy.md` — the graph-tier sibling; **shares the rim handoff seam**.
- `../plans/fog-of-war.md` — who sees the volatile snapshot; the scan bubble rides the ship.
- `../plans/market.md` — the fuel/refuel economy, if cost ever turns on.
- **#0005 action-timer** — the async spine this rides. **Shared invariant (recorded
  in both, 2026-07-09): the fleet owns its movement state (this spec); a #0005 action
  is a thin lifecycle wrapper that *references* the fleet — never a second copy of
  its state, and position reads never query the actions collection.**
- `frontend/app/spike/hex-board/` — the throwaway prototype proving the feel + intercept.
- `../vision.md` — step 5 "move a ship"; the two-tier map; the rim handoff.
- Archived design: `git show bf9c637:client/docs/Gameplay.mdc` — original sublight/FTL/traits.

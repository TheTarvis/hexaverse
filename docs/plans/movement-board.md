# Movement (board tier) — Coast & Thrust (tactical, in-system)

> **Living doc, high-level only.** Scratchpad for **how a unit moves inside a
> solar system** on the hex board — coasting orbits, thrusting, intercepting
> moving bodies, docking. Nothing here is committed design. `?` = open question;
> **DECIDED** = locked. Feeds a future `docs/specs/NNNN-movement-board.md` (companion
> to the system-interior spec). Created 2026-07-07.
>
> **Sibling doc:** `movement-galaxy.md` owns the *graph tier* (inter-system lane
> travel). Movement is split into two docs because the two tiers are entirely
> different geometry — see Boundary below. Both ride the same async-action spine.
>
> Context: `hex-board.md` (§Orbital motion — the board + orbital model this rides
> on), `movement-galaxy.md` (the other tier), `fog-of-war.md` (board-tier fog + the
> scan bubble that rides the ship), `BRAINSTORM.md` (§Session/pacing — async actions;
> §Progression — engine tech), `vision.md`, and the archived
> `git show bf9c637:client/docs/Gameplay.mdc` (sublight/FTL/traits).

---

## Boundary — what this doc owns (read first)

Movement lives at **both tiers**, like fog — **one doc each.** Keep them separate:

| | **Graph tier** (between systems) — *`movement-galaxy.md`* | **Board tier** (inside a system) — *this doc* |
|---|---|---|
| Question | how do I cross the galaxy? | how do I move around this system? |
| Model | **lanes** (roads-vs-off-road hybrid), FTL tiers, relay chains | **coast & thrust** over the orbital hex board |
| Owned by | **`movement-galaxy.md`** | **this doc** (`movement-board.md`) |
| Scale | light-years, node-to-node | light-hours, hex-to-hex |

This doc also **defers to `hex-board.md`** for the orbital model itself (rings,
quantization, determinism); movement *rides on* that. The **graph↔board handoff**
(arriving from a lane at the rim / leaving to a lane) is the **shared seam** between
this doc and `movement-galaxy.md`, noted in both.

---

## Already decided (imported from `hex-board.md` — don't re-litigate)

The orbital layer is locked; this doc only builds the *verb* on top:

- **Quantize the sim, interpolate the picture** — logical position is an integer
  hex; the glyph glides.
- **Coast = ride your current orbit for free** (on rails, zero input).
- **Thrust = break free of the drift**; on release you **resume coasting from
  wherever you are**.
- **Dock/ride** — a unit can attach to a body and inherit its motion (moons do
  this; it's how you park/mine).
- **Positions are computed** from `(orbitalElements, worldTime)` — deterministic,
  so any future position is exactly knowable.
- **Sensors move with the unit** — the scan bubble travels with the ship.

**The open part this doc tackles:** what "thrust" *is* as a player verb, what it
costs, how it resolves over time, and how you aim at things that are moving.

---

## The upfront fork — a game model, not a physics sim (recommended)

Real orbital mechanics (transfer orbits, delta-v budgets, Hohmann windows) are
gorgeous, but (a) heavy to build solo, (b) opaque and punishing for a
few-minutes-a-day chill game. **Recommendation: orbits are the *resting state*;
thrust is *grid movement*.**

- When you **burn**, you move hex-to-hex like a normal tactical unit
  (terrain-modified) — no transfer-orbit math.
- When you **stop**, you settle into the orbit of whatever hex you're in.

You get the *feel* of orbits (everything drifts; you plan around it) without the
*math*. Fidelity dial set to **"readable," not "Kerbal."** The interesting
decisions come from **targets moving**, not from delta-v accounting.

> If we ever want more sim-flavor, it's a knob we can turn up later (e.g. burns
> cost more against the orbital direction). Start readable.

---

## What "thrust" is — the verb

**Leaning: click-a-destination, the game plots the path.**

- **Click a hex** → unit plots a burn path there, shows route + ETA, executes as a
  queued action; on arrival, **coast** the local orbit.
- **Click a body** → because it's moving, you're committing to an **intercept**:
  the game *leads* the target (its future position is deterministic), draws the
  predicted meeting point + ETA, and burns to it. **Chill = assisted, not manual
  lead** — you never eyeball a moving target.
- **Dock on arrival** (optional) → attach and ride (below).
- **Select → preview → commit is one deliberate gesture.** Selecting a hex/body
  shows a *live* preview (route, led meeting point, ETA) — nothing moves yet;
  committing (a "Burn here" / "Intercept & dock" order) fires the queued action.
  On commit the selection **clears** (orders are given — get out of the way of the
  view), and clicking an **already-selected** tile/body **deselects** it (toggle).
  Preview-then-commit is what makes "at commit time the game computes the exact
  intercept + ETA" true and legible.

Rejected alternatives: manual heading/vector (too fiddly for chill); free-flight
that ignores orbits (loses the whole point); full transfer-orbit planning (too
heavy). The `/spike/hex-board` prototype now implements this verb (click-to-burn,
assisted intercept, coast/dock, re-task/cancel) — it replaced the earlier
"thrust = hold position" stand-in.

`?` Can you queue a **multi-leg** path (burn to A, then B), or one destination at a
time? `?` Is there a cheap **"match orbit of X"** rendezvous command distinct from
intercept (arrive *and* stay with it)?

## Docking — ride a body

Explicit **dock**: attach to a body → inherit its orbit, station-keeping free (no
drift-off). This is how you **mine** (dock a ship/Mining Site to a belt/planet),
**park** safely, and it's the same mechanism moons use. **Undock** → resume
coast/thrust from the body's current position. (See `hex-board.md` "units attach
and inherit motion.")

## Cost & the resting-state logic

**Leaning: thrust costs something, gently — so coasting is the economical default.**
Options: fuel/energy consumed per burn, or a cooldown, or both. Why cost it:

- Makes **positioning a resource** — where you let yourself drift matters.
- Reinforces **orbits = resting state** (you don't burn constantly).
- Adds a soft **stranding risk** (low on fuel far from a refuel point) that fits
  the dangerous-world pillar *without* twitch.

Keep it **chill**: generous reserves, refuel by docking / at bases, not a
meter-watch. `?` fuel vs cooldown vs both. `?` refuel model (dock at a body? at a
base/station? passive regen while coasting?). `?` does running dry strand you
(coast only) until rescue/refuel — and is that too harsh for the slice's grace?

## Time model — moves are async actions

Per the async pillar: a burn is a **queued action that resolves over real time**
(minutes–hours), completing while offline — check in, see it arrived, queue the
next. Determinism makes this clean: at **commit** time the game computes the
intercept + exact ETA (the target's future position is known), so "arrives in 42
min" is truth, not estimate. Rides the **action/timer system** (BACKLOG
cross-cutting — the async spine).

`?` **Re-tasking mid-burn** — can you abort/redirect underway (partial fuel refund,
recompute)? `?` **Target changes mid-transit** — if an intercepted body is moved by
its owner's thrust, or destroyed, does the burn recompute, miss (arrive at empty
space), or auto-repath? Determinism only holds for *coasting* bodies; a
*thrusting* target breaks predictability (interesting — that's how you juke a
pursuer).

## Speed & range as progression

Engine tech = the movement half of the vision's progression pillar (mirrors fog's
sensor axes). Candidate axes — keep them **gentle parallel drips**, not a deep tree:

- **Burn speed** (hexes / tick), **range / fuel capacity** (how far per burn),
  **coast control** (fine orbit adjustment / cheaper station-keeping), maybe a
  short in-system **jump** at high tier.

`?` which axes survive. `?` do they **gate reachable rings** (inner orbits harder
to reach → need more capability), giving the board a soft difficulty gradient?

## Interactions to nail

- **Engagement (combat-adjacent, flag-and-defer)** — closing for a fight *is* an
  intercept burn; **coasting away is escape**; a thrusting target is unpredictable
  (juke). Movement is the substrate combat sits on, so design it combat-aware even
  while deferring combat itself.
- **Occupancy / collisions** — can a ship share a hex with a body? Leaning **yes**
  (ship in a planet's hex = "at" it); but a **coast path that drifts into a hazard**
  (gravity well, debris) should carry risk. `?` do units block each other's hexes?
  **The star is the hard exception (prototyped in the spike):** you can't dock it and
  burns **route around** its core hex — some bodies are *approach-hazards*, not dock
  targets. A per-body-type property when body taxonomy firms up (`hex-board.md`), not a
  `=== star` special-case.
- **Terrain & hazards** — nebula slows burns, void blocks, gravity well bends/blocks
  (archive traits) — the same tile-trait lever fog/scan use. Cheap, shared.
- **Graph↔board handoff** — you arrive from a lane at a **fixed lane-mouth tile** and
  leave by reaching one, handing off to graph movement (`fog-of-war.md` lanes). Two
  axes, both now settled:
  - **Angular — bearing-aligned. RESOLVED in #0004 (Decision #17):** each lane maps to
    the mouth tile in its #0001 direction (rejected: *any tile* / *the entry tile*).
  - **Radial — inner edge of the outer band, not the rim. REFINED (2026-07-14):** the
    mouth sits at `radius − 3` (~ring 13 on a 16-board, band-relative so it survives a
    radius change), leaving a 3-ring shell of outer dark *outside* the door — maneuver
    room, retreat-into-the-dark, and lurk/picket country on both sides of the mouth.
    This **supersedes the "rim" wording** in Decision #17 (angular part unchanged);
    defense-in-depth and the slow-outer-orbit coast-in both still hold. Full rationale +
    the subspace lore carve-out live at the shared seam in `movement-galaxy.md`.
  - The spike **prototypes the departure verb** (select a lane → depart → back to the
    graph, re-focused on the system you left), but with **placeholder generic exits, not
    yet bearing-aligned or radius−3** — the board doesn't receive the galaxy's per-lane
    bearings yet. Wiring real bearings lands with the galaxy-movement spec at the seam.

## Slice MVP vs. deferred

Slice = `vision.md` step 5, "move a ship." Simplest thing that proves the verb:

**In the slice:** **click a hex → ship travels there over real time → arrives**
(coast/dock as needed). Because `hex-board.md` lets the slice run orbits **off or
slow**, intercepting a *moving* target can be **deferred** — slice movement is
essentially "click, travel, arrive," resolved async. Terrain-modified cost optional.

**Deferred:** intercept / leading a moving target, fuel economy + stranding, engine
progression, mid-burn re-tasking, hazard bending, combat engagement, match-orbit
rendezvous.

> Slice rule: **you can move a ship somewhere and it gets there over time.** The
> orbital intercept magic layers on when motion turns on.

## Open questions (rolled up)

- Multi-leg paths vs single destination; match-orbit rendezvous as its own verb.
- Cost model: fuel vs cooldown vs both; refuel model; stranding harshness (+ grace).
- Re-tasking mid-burn; behavior when an intercept target moves/dies in transit.
- Progression axes; whether capability gates reachable rings.
- Occupancy/collision rules; hazards on a coast path.
- ~~Graph↔board exit-tile rules.~~ **RESOLVED (2026-07-14):** fixed lane-mouth tiles,
  bearing-aligned, at `radius − 3` (inner edge of the outer band). See the handoff
  bullet above and `movement-galaxy.md`.
- Fidelity dial — do we ever want burns to cost more against orbital direction?

## Next step

**Graduated → [#0004 In-system movement (coast & thrust)](../specs/0004-movement-board.md)
— `accepted` 2026-07-07.** All four opening questions locked there (fleet is the
mover; bearing-aligned graph↔board handoff; uniform burn cost; the ephemeris-vs-
activity invariant with cadence/audience delegated). This plan stays the living design
scratchpad; #0004 is the buildable source of truth.

Build order mirrors #0001→#0002: **#0003 first** (static board + elements + renderer),
**#0004 second** (brings it to life) — build **after** #0003, which supplies the board
+ orbital elements movement rides on. The graph-tier sibling (`movement-galaxy.md`)
graduates on its own track; the **rim handoff seam** is co-owned with it.

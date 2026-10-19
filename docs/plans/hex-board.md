> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Hex Board — Solar-System Interior

> **Living doc, high-level only.** Scratchpad for the **tactical tier**: the
> per-system hex grid you drill into from the galaxy graph. Nothing here is
> committed design. `?` marks an open question; **DECIDED** = locked this
> session. Fed `../specs/0003-system-interior.md` (accepted); **its renderer
> graduated 2026-07-09 → `../specs/0007-hex-board-view.md` (accepted)** — the
> companion pair to **#0001**/**#0002**, one tier down. Created 2026-07-06.
>
> Context: `../vision.md` (two-tier map), `BRAINSTORM.md` (§Two-tier map, §Core
> actions), `fog-of-war.md` (board-tier fog, the three states), `market.md`
> (what a scan mints), and the archived `git show bf9c637:client/docs/Gameplay.mdc`
> (original single-map hex mechanics — **at galactic scale**, see reframe below).

---

## The reframe — what a hex *is* now (read this first)

In the original design the hex grid **was the galaxy**: 1 tile = 1 light-year,
radius ~50 tiles, ~7,600 tiles, ~10–20% holding stars. Fog, scan radius, spawn
padding, sublight-vs-FTL were all tuned to *interstellar* space.

The 2.0 two-tier split (`vision.md`) lifted all that "far away" navigation up to
the **graph** (systems = nodes, lanes = edges). The hex board inherited the
*mechanics* (axial coords, scan radius, tile traits, mine/move) but **lost its
scale and meaning** — a solar system is light-*hours* across, not light-years, so
"1 tile = 1 light-year" is now nonsense at this tier.

**DECIDED (2026-07-06): a hex is an orbital sector of one star system.** The board
is the *interior* of a single system, not a patch of interstellar void.

---

## What a hex-board *is* (the definition)

**DECIDED (2026-07-09).**

> A **hex-board** is the tactical interior of **exactly one star system** — what you
> get when you drill into a single node on the galaxy graph. **One graph node ↔ one
> hex-board.**

- **One star, at the center** — hex `(0,0)`. **Single-star systems only** for now;
  binaries/trinaries are a deferred content toggle, not a model change.
- **Star-centered concentric rings** — hex-distance from the star = orbital distance;
  bands **inner / mid (goldilocks) / outer** (below). Radius ~16 (~800 tiles) —
  *mostly empty space with a few worlds*, not a packed grid.
- **A solar system's worth of bodies** — the star, a handful of **planets** (rocky
  and gas giants) in orbital rings, **moons** riding the gas giants, one or more
  **asteroid belts** as ring-arcs, plus the earned small/dark stuff (ice bodies,
  **anomalies**, **ruins**) and **hazards** (nebula, gravity well, radiation, debris).
  All one unified `Feature` family (#0003); tiles store nothing.
- **Everything orbits** — deterministic orbital elements from day one; motion off/slow
  for the slice, on later, zero rework.
- **You enter through a lane mouth in the outer dark** (`radius − 3`, the inner edge of
  the outer band — *not* the rim edge; see `movement-board.md`) on your inbound lane,
  and work inward toward the goldilocks prize — fog has a direction, arrival is a
  journey (`fog-of-war.md`). The 3-ring shell outside the mouth is maneuver/lurk room.
- **Born in two phases** — *skeleton* (star + major bodies) eager with the system and
  graph-visible; *detail* (resources, small bodies, anomalies, hazards) rolled by the
  first fleet to arrive, then locked (see *Two-phase generation* below).

---

## The board model — star-centered concentric rings

**DECIDED (2026-07-06).** Star at hex `(0,0)`; **distance-from-center = orbital
distance.** Each ring is a band of the system, and the ring drives what's there:

| Ring band | Character | Yields / hazards |
|---|---|---|
| **Inner** | hot, high-energy, metal-rich | refractory metals; radiation hazards |
| **Mid** (goldilocks) | the prize band | habitable bodies, richest colony sites, ruins/anomalies |
| **Outer** | cold, diffuse, dark | volatiles / ice / gas; long travel; where you hide |

Contents = **radial gradient + noise** across one system (the system-scale heir to
the archive's "star-rich sectors / dead zones / barriers," which were galaxy-scale
noise). Why this model:

- **Instantly readable** — a player sees *a solar system*, not an abstract grid.
- **Scan/mine get texture** — the good stuff is concentrated, so *where* you aim a
  deep-scan matters.
- **Fog gets a direction** — you arrive at your lane mouth in the outer dark (via your
  inbound lane) and work inward; exploration has a gradient, not a random reveal.
- **Hazards become interior choke geometry** (a gravity well / debris belt between
  rings) — the galaxy's choke-point philosophy, one tier down.

> Caveat: hex-distance "rings" are hexagonal, not circular. Fine — nobody reads a
> hex board as literally round, and hex rings look plenty orbital.

---

## What populates a system — bodies as the anchor

**DECIDED (2026-07-06): bodies are the organizing unit; resource tiles hang off
bodies.** You do **not** scatter loose "this hex has 40 ore" pickups across empty
space. The real objects are the **star, planets, moons, asteroid belts, gas
giants, anomalies** — each sits on a hex (belts span a ring arc) — and you mine *a
body*, scan *a body*, remember *a body*.

Why bodies-as-anchor pays off across every system:

- **Scan gets a subject.** "Deep-scan the third planet" mints an intel snapshot
  *about a body* — a clean, nameable, sellable unit. This answers `market.md`'s
  open "what *is* a unit of intel?" → **a body report** (candidate; see market doc).
- **Mine gets depletion-with-a-story.** A belt holds a finite lode; working it
  draws it down. **That depletion is the freshness engine** the intel market needs
  — "as-of T this belt held X" goes stale *because* someone is mining it. Spoilage
  falls out of physical bodies, not an abstract timer.
- **Generation gets structured.** You roll *a system* (star class → N bodies by
  ring → each body's type → its resources/hazards), not noise over a raw grid.
  Controllable and evocative.
- **Fog gets legible memory.** "Remembered: 3 bodies, last seen 2h ago" reads;
  "remembered: 47 tiles" does not.

Slice simplification: **most bodies = 1 tile; belts = a set of tiles along a ring.**
Multi-tile bodies (a fat gas giant) refine later.

---

## Orbital motion — the board turns

**DECIDED (2026-07-07, prototyped + eyeballed on `/spike/hex-board`).** The board
isn't a static diorama: **planets orbit the star, moons ride their planets, and
ships coast their orbit unless under thrust.** This makes "distance-from-center =
orbital distance" *literal* and adds a time dimension that fits the chill/async
pillar — you come back and the system has *turned*. It is a **post-slice signature
mechanic**, but the data model carries orbital elements from day one (see below).

### Quantized to the grid — logic discrete, visuals smooth

The core rule that keeps a hex game a hex game:

- **Logic is quantized.** A body always *occupies an integer hex*. Everything the
  rules touch — fog, selection, scan/mine targeting, collisions, intel — reads the
  body's **logical hex**. Motion is a discrete walk around the ring's perimeter.
- **Visuals are interpolated.** The rendered glyph **glides** between the hex it's
  leaving and the one it's entering, so nothing pops. A ring's last hex is adjacent
  to its first, so the wrap-around glides too. (Discrete hopping was tried first and
  read as jerky — the belt "popped" as a whole arc jumped a tile. Interpolation
  fixed it.) The logical hex flips to the nearer of the two at the halfway point.

> Rule: **quantize the simulation, interpolate the picture.** Never let continuous
> motion leak into the rules, or the grid stops mattering.

### Differential rotation (Kepler-lite, for free)

A body on ring *R* advances one hex every ~*R* time-units → **inner rings sweep
faster than outer**. Consequences, all emergent:

- **Conjunctions & travel windows.** Relative angles between planets constantly
  shift, so "when is III near the belt?" becomes real, calm, *predictable* planning.
- **The outer band is the slowest orbit.** Outer bodies barely creep; inner planets lap
  them. (Ships arrive at a lane mouth in the outer dark, so a coasting ship drifts
  slowly — fine, and physically right.)

### Deterministic → the intel bridge (this is the big one)

Orbits are a **pure function of world-time + a body's orbital elements** — so a
scan's positions are **extrapolable**. That splits intel into two natural tiers,
*from the physics*, not a tuning knob:

- **Ephemeris** (the clockwork: where bodies are/will be) — cheap to extrapolate,
  **ages slowly**.
- **Activity** (ships, mining, depletion) — unpredictable, **spoils fast**.

This is exactly the "orbit-is-computable" valuation hook `fog-of-war.md` parks for
`market.md`. Orbits close that loop → record the ephemeris/activity split as the
intel-freshness model when `market.md` graduates.

### Ships — coast or thrust (the movement primitive)

**DECIDED:** an engineless body drifts on its orbit; **a ship coasts its orbit
until it burns.**

- **Coasting** — the ship rides its ring like any body; nose oriented along
  velocity. Zero input, on rails.
- **Thrust** — breaks it free of the drift. In the spike, thrust = *hold position*
  (engine fighting the orbit) and on release it **resumes coasting from wherever it
  is**. That "resume from current position" is the important, correct part.
- **Moons ride their planet** (fixed offset, move with the parent) — the same
  "dock and ride the orbit" idea, and the answer to the earlier "ships around
  planets" thought: units *attach to a body and inherit its motion*, they don't get
  their own visible mini-orbit.
- `?` **Real thrust model** (movement-spec territory): the spike's hold-position is
  a stand-in. Target is likely **click-a-hex to burn toward it, then coast the new
  orbit** — leading a moving target (intercept), which is the "ship-position-cone"
  idea as a tactical verb. Slow burns, always-shown predicted track, so it reads as
  planning not twitch.

### Sensors move with the sensor

**DECIDED:** fog/scan coverage is measured from a **unit's live hex**, not a fixed
point. The scan bubble **travels with the ship**; bodies dim/brighten as *either*
the body *or* the ship moves. (Board-tier Visible = union of your units' radii at
their current positions, per `fog-of-war.md`.)

### Data-model implication — positions are computed, never stored

Like `fog-of-war.md`'s "Visible is computed, never stored": a body's position is
**derived** from `(orbitalElements, worldTime)` at read time — **no per-tick
writes.** A body stores its *elements* (ring, angular position at epoch, period /
direction), not a position that has to be updated every tick. Cheap, and it's what
makes orbits deterministic/extrapolable for intel. Every body (incl. slice-static
ones) carries orbital elements from day one; **motion is just a flag you switch on**
— static-for-slice, turning-later, zero rework.

---

## The two-tier bridge — graph character dials the interior

This is where the tiers finally connect. The graph's **Surveyed** level
(`fog-of-war.md`, Rumored → Surveyed → Explored) tells a player a system's
*character*. **That character is just the dial on the interior generator:**

| Graph-tier character | Interior generation |
|---|---|
| **Star-rich** | many bodies, dense inner belt, ruins/anomalies in the goldilocks band → a hotspot worth the trip |
| **Dead** | a lonely star, one or two barren rocks → buffer space you pass through |
| **Barrier** | hazard-choked, nebula-heavy, high scan-reduction → dangerous, but sometimes hides the best untouched lode |

So **Survey intel becomes genuinely valuable**: it tells a buyer *which dial the
generator was set to* before they commit a trip. The graph promises; the board
delivers. (Reinforces `market.md`: survey reports are a real product because they
forecast interior worth.)

**REFINED (2026-07-09) — the dial drives *detail*, not *count*.** The graph now shows
each system's **major-body inventory** for free (`fog-of-war.md`, "option (a)"), so
body *count* can no longer be the character tell — it would leak the paid appraisal.
The fix: **character dials the *detail* (resource richness, hazard density,
ruins/anomalies) more than the count.** A **dead** system isn't one with *fewer*
planets — it's one whose planets are **barren**; a **star-rich** one has the same-ish
skeleton but **loaded** bodies + belts. Same-looking inventories, different worth →
you can't eyeball rich-vs-dead from the graph, you survey or you go. (The table rows
above still hold as *flavor*; read "many bodies / a rock or two" as **worth**, not
literal count.)

---

## Two-phase generation & the free/earned line

**DECIDED (2026-07-09).** Generation splits on the **same seam as fog** (`fog-of-war.md`,
board-tier): the free/known layer is rolled eagerly; the earned/detail layer is rolled
on first presence. This also **resolves #0003's delegated "Explored" trigger.**

| Phase | What | When | Mutable? | Visible |
|---|---|---|---|---|
| **Skeleton** | star + major bodies (planets, gas giants) + orbital geometry; *existence* of a major belt / big moon | **eager**, at system-creation (#0001) | no (you don't mine a planet away) | **on the galaxy graph** + free astronomical layer on arrival |
| **Detail** | resources / richness, small & dark bodies, ruins, anomalies, all hazards, all composition | **lazy**, rolled by the **first fleet to arrive** via a lane, then **locked** | yes (mining depletes it) | earned per-player (presence / scan) |

- **Why eager skeleton:** it's the free layer — must exist before anyone visits (it
  shows on the graph) — and it's *immutable*, so safe to compute up front. **#0001
  generates it; #0002 draws the inventory** (flagged in both).
- **Why lazy+locked detail:** it's *mutable* (depletes), so it can't be recomputed
  from seed each time — the first arriver **materializes** the canonical copy that
  everyone then draws down together. **Arrival is the trigger**; a graph deep-scan
  only *forecasts* character (keeps survey intel a promise), it does **not** generate
  the board.
- **Shared once, fogged per-player.** Detail is generated once (create-if-absent per
  #0003's race guard); every later player fogs it fresh from their own rim entry.
  "The board exists" and "*you've* explored it" are independent.

**The free/earned line runs between body *types*:** *skeleton / free / on-the-graph* =
star, planets, gas giants, and the *existence* of a belt or big moon (what a telescope
resolves); *detail / earned / first-arrival* = what's *in* the belt (which rocks, how
rich), small/dark bodies, ruins, anomalies, hazards, and all composition/activity —
everything you'd **mine, fear, or sell.**

---

## Settled mechanics (this tier)

**DECIDED (2026-07-06) unless noted.**

- **Coordinates** — axial for storage, cube for algorithms. Exactly the archive's
  choice and the standard (redblobgames). Nothing to debate.
- **Board size/shape** — hexagonal board. **Baseline (from the `/spike/hex-board`
  eyeball, 2026-07-06): radius ~16 (~817 tiles)** at the `star_rich` density of
  ~7 planets + ~2 belts + ~2 specials. The original radius-6 board read as *tight*
  — bodies crowded the rim, no room to breathe or to move between them. Radius ~16
  gives the interior *room*: travel between bodies is a real decision, fog +
  scan-bubble carve out meaningful unseen space, and the sparse-void-with-clustered-
  bodies feel matches the fiction. **Density is the lever, not just size** — hold
  body count roughly where it is and let the board be roomy; a system should feel
  like *mostly empty space with a few worlds*, not a packed grid. Still want it
  small enough to render as crisp DOM and scan over a few sessions; radius ~16 is
  fine for both. `?` upper bound — does it get *too* sparse/tedious to cross past
  ~16? Tune scan/move range alongside, not radius alone.
- **In-system movement** — **sublight hex-to-hex only**, tile-trait-modified
  (nebula slow, void block). **FTL / relay-chains / wormholes do NOT live at this
  tier** — those are the graph's job (between systems). Layered over the orbital
  model above: units **coast their orbit** for free and **thrust** to break free
  (see *Orbital motion → Ships*). Clean scope cut: board movement is "coast, or
  burn hex-to-hex, terrain-modified."
- **Hazards / fields** — cut scan **range/quality** and modify movement (the lever
  `fog-of-war.md` wants; makes naturally-foggy regions). **REVISED (2026-07-07, per
  spec #0003): hazards are *features*, not static tile traits.** Nebula, gravity
  well, debris, radiation are objects in the same unified `Feature` family as
  bodies — they have a position (orbit / ride a parent / fixed) and a footprint, so
  **they can move** (a well rides its mass; a nebula drifts). A feature carries a
  `resources` payload (minable), an `effects` payload (hazard), both, or neither.
  Everything placed on the board is a feature; tiles store nothing.
- **Renderer (the BACKLOG ⬜ decision) — SVG.** A bounded ~150-tile board is a
  perfect fit for one `<polygon>` per hex: free click handlers, crisp at any zoom,
  trivial fog overlays + per-tile state, composes with the Catalyst/Tailwind stack.
  Canvas/WebGL only earns its complexity at thousands of tiles or heavy per-frame
  animation, which a chill turn-resolves-over-time board doesn't have. (The graph
  view already carries the heavy-viz load; the board stays lightweight DOM.)

---

## Open forks (next design passes)

- **Scan on the board** — *partially RESOLVED 2026-07-09 (`fog-of-war.md`):* two earn
  mechanisms — **presence** (live activity + resolve the small/dark; no intel) vs.
  **scan** (composition + threats + the sellable snapshot), the latter in **quick-sweep**
  (wide/fast/coarse) and **deep-scan** (narrow/slow/high) flavors. *Still open:* does a
  board sweep reveal the *bodies* it touches (leaning) or a disc of *tiles*; exact radii;
  ambient type-vs-presence read of the small/dark.
- **Mine + depletion** — extraction rate, finite lodes, how depletion surfaces
  (and feeds market freshness). The physical half of the freshness engine.
- **Body taxonomy** — which body types exist (star / rocky planet / gas giant /
  moon / asteroid belt / ice body / anomaly / ruin) and what each yields.
- **Generation recipe** — star class → body count → ring placement → per-body
  resources/hazards; how the graph-character dial (above) sets the odds.
- **Entry point** — *RESOLVED 2026-07-09 (`fog-of-war.md`):* **arrival at the rim IS
  the "Explored" trigger** — it materializes the detail layer (first visit) and starts
  the board's own fog. First-reveal = the **free astronomical layer** (star + major
  bodies) + your **ambient bubble** at the rim; you work inward. *(Still open: exact
  rim entry/exit tile rules — co-owned with `movement-board.md`.)*
- **Units on the board** — which of the archive's taxonomy (Ship, Base, Mining
  Site, Probe, Relay, Outpost) operate at this tier vs. the graph (BACKLOG ⬜
  "Units / assets taxonomy"). Mining Site + Ship are clearly board-tier.
- **Thrust / movement model** — the real burn model behind coast/thrust
  (click-to-burn + intercept a moving target); a *movement-spec* decision. The
  spike's "thrust = hold position" is a stand-in.
- **What actually orbits** — all bodies, or are some *static* (a derelict adrift,
  a fixed anomaly)? Spike orbits everything; may want anchored exceptions.
- **Orbital cadence** — real-time period per ring (how many real minutes/hours a
  hex-step / a full revolution takes); must stay chill (slow). Tune with scan/move
  range, not board radius.
- **Legibility of quantization** — does the smooth glide hide the grid too well?
  Maybe a faint per-hex "tick" as a body crosses a boundary. (Open feel question.)
- **Exact board radius** — pin with generation tuning.

## Slice MVP vs. deferred

The first vertical slice (`vision.md` step 4–5: drill in, move, scan, mine) needs
*enough* board that the loop reads — not more.

**In the slice:** a star-centered ring board (fixed radius), a handful of bodies
placed by a simple recipe, **move a ship**, **one Scan action** (reveals + mints
an observation, per `fog-of-war.md` slice), **one Mine action** on a body. Board
fog = two/three states (`fog-of-war.md`).

**Deferred:** quick-sweep/deep-scan split at tile level, depletion-driven freshness
(lands with `market.md`), multi-tile bodies, full body taxonomy, relay/tech vision
upgrades on the board, combat, **and orbital *motion*** (the signature mechanic).
But: **bodies carry orbital elements from day one** — position is computed from
`(elements, worldTime)`, motion is a flag. So the slice ships with orbits *off or
slow* and turns them on later with zero rework. Don't model a body as a fixed
`(q,r)`; model it as elements that *currently evaluate* to a hex.

## Next step

Graduate to **`/spec system-interior`** (generation + data model) paired with its
renderer spec — the ⬜ companion pair to #0001/#0002, one tier down. Likely lands
alongside `/spec scan-and-fog` (fog needs tiles to hide; this doc supplies them).
Flip the BACKLOG rows (`docs/specs/BACKLOG.md`: *System interior generation*, *Hex
board view / renderer*) to ✅ then.

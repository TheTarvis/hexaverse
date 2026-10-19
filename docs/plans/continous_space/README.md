> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Continuous Space — the full-rewrite direction

**Status (2026-08-26): direction decided, PoC being tweaked before lock-in.**
The lattice code is still in the tree, but it is no longer the direction —
continuous R³ is. This doc pins down what we're building and why, what the PoC
already demonstrates, and what a new agent needs to know to keep tweaking it
before the model locks in and the real rewrite investigation starts. Nothing
here has been sized against the existing codebase yet; that investigation is
deliberately later.

## Ground rules: this is a solo toy — burn the boats

**The game is local-only in practice.** A prod GCP project (`hexaverse`) and a
deployed version technically exist, but *nobody is using them* — this is
Travis's personal for-fun project. So, for this agent and every future one:

- **No migration plans. No backwards compatibility. No data preservation.**
  There are no users to gently migrate and no live state worth keeping.
- If the fastest/cheapest way to build something is **from the ground up,
  deleting the old stuff outright, that's 100% fine** — preferred, even, over
  compatibility shims, dual-write paths, expand-migrate-contract choreography,
  or feature flags guarding the old code.
- Optimize for build speed and how the game *feels*, not continuity.

## Why we're doing this

The tactical layer has been rebuilt twice on discrete grids — hexes, then the
2026-08-25 polar ring/slot lattice — and the second rebuild landed on the same
complaint as the first: **it's still cells, just smaller and more of them.**
The lattice makes movement feel like token-sliding, and every fidelity
improvement means more cells, more schedule machinery, more adjacency
bookkeeping.

The bet: drop the board/cell layer entirely and put fleets in **continuous R³**
— real inclined orbits, curved transfer trajectories, positions as vectors.
The PoC exists because this had to be *felt* before being believed; verdict so
far: "movement feels so much better."

## The contract that must survive

The whole backend rides on one architectural property, and the rewrite keeps
it: **a committed order is a pure, closed-form function of time.**

- `StateAt`-style folds still work: a burn past its arrival *is* its settled
  parked state. Resolve-on-read, no scheduler. (The PoC accidentally proved
  this under fire: a background-throttled tab jumped the sim clock ~90s in one
  frame and the ship was simply already docked on the next render.)
- No numeric integration, ever. Position comes from stored fields + `t`.
  Curvature is **stored geometry** (Bézier control points on the burn), never
  integrated gravity.
- Go/TS mirror + fixture determinism survives because every float path uses
  fixed sample counts (64-segment arc tables, 32-iteration capped fixed-point
  intercept solve) and no transcendental iterative solvers (no Kepler
  equation, no Lambert).

This contract is also what killed the alternatives:

| Model | Verdict |
| --- | --- |
| Pure kinematic straight lines | Too flat — space has no texture (this was PoC v1) |
| **Rails orbits + station-keeping + curved kinematic burns ("Option B")** | **Chosen** |
| Inherited Newtonian velocity, no gravity wells | Deferred layer — adds pursuit/evasion depth later; makes velocity state and cancel semantics hard; decide after the base model ships |
| Patched conics / KSP | Rejected — iterative float solvers fight cross-stack fixture determinism, and gravity-assist piloting skill fights the async commit-an-order/ETA action model |
| Full n-body | Rejected outright — breaks the closed-form fold |

If we ever want gravity-assist *flavor*: implement it as a **pricing rule**
(burns whose path passes near massive bodies get a time/Δv discount —
"slingshot routing"), never as a trajectory.

## The movement model (Option B, decided 2026-08-26)

**Burns.** A burn is a cubic Bézier from the ship's position to the solved
intercept, flown on a brachistochrone profile (accelerate to the arc-length
midpoint, flip, decelerate; flight time `2·√(L/a)` on *curve* length). The end
tangents are real kinematics:

- Depart along the ship's actual parked motion (leaving a parking orbit slings
  you out prograde).
- Arrive along the **settled orbit's velocity at the entry point** (body
  translation + orbital sweep), so the path wraps into the destination's
  parking orbit with no kink — direction of motion is continuous through
  insertion (pinned by test, dot > 0.95).
- If the path would graze the star, control points get pushed **perpendicular
  to the chord** (a radial push can be chord-parallel and bend nothing — bug
  found by test) so transfers bulge around the sun.

**Moving-target intercept.** Fixed-point iteration on arrival time against the
target's future position, re-building the curve each round. Converges in a few
rounds because ship speed dwarfs orbital speed.

**Targeting is body *identity*, not position.** Clicking a body orders "go to
VI"; the solver aims at a planar insertion standoff (`insertionRadius`) so
arrival is exactly continuous, but that's an implementation detail the UI no
longer leaks.

**Parking (the economy of position).** Three idle modes:

- `orbit` — rails circle around a body. **Free forever**, but you sweep around
  it (predictable, and periodically eclipsed — future fog interplay).
- `stationkeep` — pin an exact offset in the body's frame at a **continuous
  fuel drain** (the body's real centripetal acceleration, floor 0.5/s). Tank
  dry → auto-drop back to rails.
- `point` — hold a fixed spot in empty space, free (no gravity model).

**Fuel = Δv.** A burn costs `a·T`; the PoC tank is 500 Δv and commit is gated
on affording it. This is the natural first standing fuel sink for the
mine/market economy (see `docs/plans/propellant-and-delta-v.md` for the
lattice-era fuel thinking this supersedes).

**Visual grammar** (worth keeping through any rework): **ring = what you
picked (live position) · ghost = where it will be at arrival (0.9× body
wireframe) · curve = how you get there.** Flip-and-burn is shown (plume flips
at the midpoint); station-keeping shows a small steady trim plume.

## Fog, stealth & intel (design direction, discussed 2026-08-26)

Not implemented anywhere yet — this is the agreed replacement for the
lattice-era `observation` model, pinned here so the rewrite investigation
starts from it. The trigger was a PoC realization: you can fly somewhere and
*park*, which means another player can say **"I saw that fleet parked at
x,y,z in Alpha Gamma at 50:00:30"** — and that sentence is the entire intel
system. It replaces the old machinery (growing echo discs, live coverage
unions, LOS-filtered three-band reads, remembered-geometry semantics) with
one record type and two visibility bands.

**The sighting is the intel atom.** A sighting is a timestamped fact:
`(subject, position, system, worldTime, maybe motion state)`. Staleness is
not a fog band — it's just the timestamp, visible to the player and priced
by the player. The closed-form world makes sightings *legibly* predictive,
which yields an intel quality ladder with no extra systems:

- **Glimpse** — position at T only. Worthless the moment they move.
- **Track** — position + motion state (rails elements, or a burn's curve).
  Against a rails orbit this predicts the target *forever* — until its next
  burn. That asymmetry is a gameplay engine, not a bug.

**Two visibility bands, not three:**

1. **Passive bubble** — a modest live-detection radius around each of your
   assets, LOS-occluded (ray-vs-sphere at `t` — the easy version). Anything
   transiting a bubble mints a sighting automatically. **Requirement
   (2026-08-26, learned in the intel spike): bubble coverage is CONTINUOUS,
   never sampled** — a ship under hard burn can cross an entire bubble
   between two read/tick moments and must still be flagged (entry + exit
   records). Closed-form paths make this a solvable geometry query
   (curve-vs-moving-sphere intersection over the interval), not a sampling
   loop; the spike's fixed-sample sweep is a stand-in the real
   `observation` replacement must not inherit.
2. **Active scan** — keeps the #0005 action shape (sensor channel, ETA =
   round-trip), but the *product* is just a batch of sighting records minted
   once at resolve. No partial mints, no coverage union. Radar flavor
   survives as physics: the echo shows where things *were* when the pulse
   hit them — the data arrives stale by construction, `asOf` the ping.

Your knowledge of the world = your live bubbles + your pile of sightings.

**Burns are loud, parked is quiet.** A flip-and-burn plume is visible at
very long range (maybe system-wide); parked-and-dark is detectable only by
active scan or close passive range. So everyone might see an army burn *in*
(a cheap automatic sighting), but where it went dark is the question — and
the scarce "I saw it parked at x,y,z" sighting stays valid *until the fleet
lights its drive again*, which is itself a detectable event. The intel's
expiry signal is built into the physics. Moving armies telegraph; parked
armies ambush.

**The signature ladder (revised 2026-08-26, after the stealth spike):**

- **Burning** — loud. Plume range scales with drive output (engine class ×
  commanded accel; hull mass later) — engines are what you buy to move your
  loudness curve. **Silent running** falls out for free: commit a burn at
  deliberately reduced accel to shrink the signature at the cost of flight
  time — stealth priced in *time*, and closed-form because accel is already
  a stored field on the burn.
- **Free-flying parked** (`orbit` / `stationkeep` / `point`) — dark. Found
  only by proximity (the bubble) or a scan echo. A middle "trim plume" rung
  for station-keeping was tried in the stealth spike and **cut — too
  complicated for what it bought**.
- **Docked/attached** (to a body, station, or another ship) — **masked**:
  sensors register only the host. A hidden fleet at VI reads as… VI.
  Masking chains — a ship docked to a carrier registers as the carrier.

**The focused scan is the counter.** A targeted "scan &lt;body&gt;" verb —
same #0005 sensor-channel shape, aimed at one body instead of radiating —
is the only thing that reveals masked ships. Counter-intel stays legible
and sellable: "swept VI at 0:50:30 — clean" is a sighting record too.

**Hiding economics shift from fuel-priced to risk-priced.** Docking is
free, but you're immobile, at a guessable location class (bodies, not empty
volume), and lighting the drive to leave is an event anyone in range sees.
`stationkeep` survives as a positional tool, not a stealth tool; shadow
cones demote to LOS-occlusion flavor — they still block scans and
sightlines, they're just no longer the hiding economy.

**Intel selling rides the existing market.** M11 deliberately made demand a
uniform ordered entry list under an opaque venue key so player asks could
join the fold — a sighting is just another sellable thing. Sell it as a
**system-attested record**: the buyer gets a genuine, unforgeable sighting
with its timestamp, and the market prices staleness on its own. Free-text
chat stays free and *lyable* ("nothing at Alpha Gamma, trust me") — the
notarized record is what you pay for. The hard parts (idempotent credit
mutation, venue folds, the sell transaction) are already built.

**Open knobs inside this model:**

- **Identity gating** — does a sighting name the owner? Range/quality-gating
  it ("a contact, ~5 hulls" vs "Corp X's war fleet") gives scouts a reason
  to close distance and makes anonymous parked armies spooky.
- **Plume scaling** — the engine-class → plume-range curve, and how cheap
  silent running gets (min accel? a floor so ignition is always an event?).
  These are the dials of the whole stealth game; the spike's flat sliders
  are the placeholder.
- **Focused-scan pricing** — what does "scan VI for hidden ships" cost
  (time on the sensor channel? range-gated? fuel?) so that masking is
  strong but not unbeatable, and sweeping every body isn't free.
- **Couples to the contested-place question** (see the rewrite section): a
  parked army *creates* a place — sightings hand other players a coordinate
  that matters. But only if parking somewhere is worth contesting (near a
  lode, a station, a lane endpoint) — design the two together, not
  sequentially.

## The PoC — what's demoable today

Route **`/spike/space-3d`** (`npm run dev:frontend`, then
http://localhost:20200/spike/space-3d). All of this works now:

- Seeded deterministic system: star, 5–7 planets on inclined (±8°) Kepler-ish
  orbits, hierarchical moons, an NPC station, an asteroid belt. Reseed button.
- Free camera: left-drag tilt/orbit, right-drag pan, wheel zoom
  (OrbitControls).
- Click a body **or empty space** (ecliptic-plane raycast) to plot a burn:
  live dashed preview curve, range, ETA, Δv price — re-solved at 5 Hz against
  the target's current orbit so previews never go stale.
- Commit → curved flip-and-burn flight with exhaust plume scaled to speed,
  selection reticle riding the destination, ghost at the arrival position.
- Arrival folds into a rails parking orbit (no scheduler, no teleport — exact
  continuity pinned by tests).
- `Hold here` / `Resume orbit` toggle: station-keep at a live drain rate shown
  in the HUD, auto-drop to rails at 0 fuel.
- Cancel mid-burn (handwave: instant stop, hold point).
- Pause + 1×/4×/16×/64× time. Uncapped frame dt: close the laptop, come back,
  the world moved on and your burn settled — closed-form makes big time jumps
  safe by construction.

### File map

```
frontend/app/spike/space-3d/
├── sim.ts            # THE ARTIFACT. Pure math, no three.js/React.
│                     #   generation · orbits · buildCurve/solveBurn ·
│                     #   burnPosition/Tangent/Speed/DeltaV · Parked modes ·
│                     #   resolveShip (the fold) · shipPosition/Velocity
├── sim.test.ts       # 23 tests — determinism, curve endpoints, star
│                     #   avoidance, no-kink insertion, fold purity, parking
├── SpaceView.tsx     # three.js scene: bodies/rings/belt per-frame from sim,
│                     #   picking (proxies → ecliptic plane), overlays
│                     #   (preview/burn lines, ghost, reticle), rAF clock
├── SpaceView.test.tsx# GL-unavailable fallback path
├── page.tsx          # HUD, command flow, fuel state, time controls
└── page.test.tsx     # command-flow tests (GL never mounts in jsdom —
                      #   the stage-measurement gate, same as webgl-board)
```

`sim.ts` is deliberately shaped to grow a Go mirror + fixture family the way
`backend/polar` ↔ `frontend/lib/polar` works today. It is NOT in `lib/`, so
the mirror-map check doesn't apply yet — it will when this graduates.

### Quality gates (keep them green)

`cd frontend && npx vitest run app/spike/space-3d/` (30 tests), `npm run lint`
(ESLint + tsc), and `python3 .claude/skills/code-quality-checks/check.py
--files-only` from the repo root. All interactive elements carry
`data-testid`.

## Handoff — guardrails for the next agent

1. **Never put three.js, React, `Date.now`, or `Math.random` in `sim.ts`.**
   Seeded PRNG (mulberry32) only. Everything the renderer draws derives
   per-frame from sim + `t`.
2. **Closed-form or it doesn't ship.** No per-frame state accumulation in the
   sim, no integration. If a feature needs "velocity as state," that's the
   deferred Option C layer — flag it, don't sneak it in.
3. **Fixed iteration/sample counts** on every float path (future fixture
   safety — see the arm64 fixture-history memory).
4. Arrival/insertion must stay *exactly* continuous — there's a test for it;
   don't weaken it.
5. jsdom tests rely on the GL-mount gate (stage width 0) and the stubbed
   webgl context making `WebGLRenderer` throw → fallback. Keep both paths.
6. The sim clock lives in a page-level ref, advanced by SpaceView's rAF with
   **uncapped dt** — that's a feature (see contract section), not a bug.

## Open questions / next PoC tweaks (roughly prioritized)

- **Cancel semantics.** Instant-stop is a handwave. Coast-out? Retro-burn with
  a Δv price? Re-target mid-burn (solve a new curve from the current
  position/tangent)? This is the biggest feel question left.
- **Sticky picking + hover affordance.** Outer bodies move a long way between
  glance and click; pick proxies are ~2.2× body radius. Consider hover
  highlight, orbit-track highlight, and/or a body list in the HUD. (Sim
  already targets identity — purely picking UX.)
- **Preview vs commit Δv drift.** Commit re-solves from the actual position at
  click time; on a fast parking orbit the price moves a few points. Quote-lock
  a preview for N seconds? Show a drift indicator?
- **Multiple ships.** One ship today. The game is fleets — roster, per-ship
  selection, and the reticle/ghost grammar per selected ship.
- **Sighting-model preview.** The fog/stealth/intel section above is the
  design; it gets validated in **standalone spike pages**, not by growing
  this PoC — see `visualization-spikes.md` (this directory): `/spike/intel`
  (truth/knowledge toggle, timestamped ghosts, glimpse-vs-track, scan pulse)
  first, then `/spike/stealth` (signature rings, shadow cones, orbit-arc
  eclipse painting).
- **Scale & tuning.** One dial each for accel (8 u/s²) and tank (500 Δv);
  Kepler constant, insertion radii, station-keep floor all placeholder.
- **Moons/stations as first-class destinations** — they work (hierarchical
  positions), but tight-orbit insertion around a moon of a moving planet
  deserves its own feel pass.
- **Audio** — per the audio-as-code direction, a synthesized burn/drain sound
  bed would sell the flip dramatically (`frontend/app/spike/audio/` has the
  engine spike).

## The full rewrite

> **Superseded in part (2026-08-27):** the rewrite is underway and sequenced.
> `chain.md` (this directory) is the ordered set of changes; two of them have
> landed. The inventory below survives as the scoping rationale behind it.

When the PoC locks in, the rewrite touches everything that says "cell". The
inventory below is a *scoping aid, not a plan* — each line needs real
investigation. And per the ground rules above: every line here is a
**rip-and-replace candidate**, not a migration — delete the old package and
build the new one; don't design coexistence:

- **`backend/board` + `backend/polar` → a new `space` package.** Adjacency,
  hop metric, arc paths, slot schedules die; distance + intercept solve
  replace them. `board/params.go`'s cell codec becomes a float-vector codec
  (same non-primitive-param discipline in `action.Commit`).
- **`fleet` / `action`** — `BurnResolver` settles curved burns; the
  movement-vs-scan channel split and the delta ledger carry over unchanged
  (the fold contract is the same).
- **`observation`** — replaced wholesale by the sighting model (see the
  fog/stealth/intel section above): the observation atom, coverage unions,
  and the three-band read all die; sightings + passive bubbles replace them.
  `Within` becomes a sphere-radius test; `LineOfSight` becomes ray-vs-sphere
  with occluders at `t`. Orbital eclipse windows become real gameplay.
- **`system` / `galaxy` generation** — interiors emit orbits (the PoC
  generator is a sketch of this); lane gates need a continuous-space answer.
- **`market` / `mine` / `stations`** — positions and dockability re-expressed;
  fuel-as-Δv becomes the first credit-adjacent sink.
- **Frontend** — `lib/board` mirror + the freshly-migrated polar renderer are
  replaced by the sim + a production SpaceView; camera work partially reusable.
- **Fixtures** — a new `/fixtures/space/` family; retire `board`/`polar`
  cases with the packages.
- **The open design question:** cells gave you discrete *contested places* (a
  tile you hold, a gate you camp). Continuous space needs its replacement
  notion of place — orbits, station slots, lane endpoints — or everything
  between six points of interest is empty vacuum. The sighting model supplies
  half an answer (a parked army *creates* a place worth knowing about), but
  only if positions near lodes/stations/lanes are worth holding. Play the PoC
  with this question in mind before locking in.

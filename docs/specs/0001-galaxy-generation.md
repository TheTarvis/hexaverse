---
number: 0001
title: Galaxy generation
status: accepted   # draft | accepted | implemented | superseded
created: 2026-07-06
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0001 — Galaxy generation

> Procedurally generate and persist the galactic **node graph** — star systems
> as nodes, lanes as edges, with noise-driven regional character — the
> strategic-layer map the whole game is played on.

## Problem / motivation

Hexaverse is played across a **two-tier map** (`../vision.md`): a galactic
**node graph** (systems = nodes, lanes = edges) you navigate under fog, and a
per-system **hex board** you drill into to act. Today none of it exists — the
app's default view is the Volt placeholder (`frontend/app/page.tsx`). Before a
player can explore, spawn, scan, or trade, there has to *be* a galaxy: a
persistent, procedurally generated graph of star systems with enough structure
that **the map itself creates drama** — clustered opportunity, dead voids,
choke points. This is the first buildable feature and the foundation every
later system (fog, spawn, scan, economy) sits on.

Scope boundary: this is the **galaxy graph only**. The *contents* of a system
(its hex board — resource tiles, hazards) are a separate, later spec. This spec
generates the nodes, their regional character, and their connections — not
what's inside them.

## Goals

- Procedurally generate a galaxy as a **connected graph of star-system nodes**
  joined by **lanes** (edges), from a **seed** (reproducible).
- Give the galaxy **regional character** via a noise model — star-rich sectors,
  dead zones, barrier/choke regions — so the map is strategically non-uniform.
- **Persist** the generated galaxy to Firestore as a stable, shared, mutable
  world (later play mutates it).
- Produce a **fixed, frozen "start area"** from a known seed — the curated
  sector logged-out visitors see (`../vision.md` → Auth & onboarding stance).
- Be **render-ready** for the WebGraph galaxy view (nodes + edges + a layout
  hint).
- Be **extendable** — new frontier systems can be appended later without
  regenerating the world (the "ever-growing frontier" hook), even though the
  expansion *trigger* is a later spec.

## Non-goals

- **System interiors / hex boards** — the *mutable detail inside* a node (resources,
  small bodies, hazards) is #0003, materialized on first arrival. **Refined 2026-07-09
  (Decision #9):** the node's **major-body skeleton** (the graph-visible inventory)
  *is* generated here — only the detail is deferred.
- **Fog of war** — per-player visibility is its own spec; generation just
  produces the world that later gets fogged.
- **Player spawn placement** — the `minDistance`/`maxDistance` padding rules are
  a spawn spec; generation provides the space they operate in (the start-area
  seed lives here, spawn logic does not).
- **Frontier expansion trigger / cadence** — *when* and *how* new space opens is
  deferred; this spec only ensures the model *can* be appended to.
- **The WebGraph rendering itself** — frontend work downstream; this spec
  defines the data it consumes.

## Proposed approach

*(Recommending the spatial model — see Open questions #1. Written assuming it;
revise if we go topological.)*

Generate in the **backend (Go)**, persist to **Firestore**, expose read
endpoints the frontend graph view consumes. Generation runs at **seed/admin
time**, not per request — there is one persistent shared galaxy per environment.

1. **Seed → noise field.** From a seed, define a **3D** region of space and a
   3D simplex-noise field over it. The noise value at a point classifies
   regional character: `star_rich | normal | dead | barrier`.
2. **Place system nodes** with **minimum-spacing (Poisson-disc) rejection**, not
   free gaussian scatter. Sample candidate positions within a **flattened-disk
   volume** (galaxy-shaped: broad in x/y, thin in z — legible in a 3D view, no
   spherical occlusion blob); accept a candidate only if it clears a **minimum
   gap** from every existing node, and **vary that gap by region** — small in
   star-rich (tight clusters), large in dead zones (sparse voids). The *contrast*
   between the per-region gaps is what makes clusters read as clusters and voids
   as voids; the minimum gap itself is what stops nodes overlapping into an
   unreadable blob. (Validated in the `/spike/galaxy-3d` prototype — pure density
   sampling gave either overlapping blobs *or*, over-corrected, a uniform mesh;
   region-varied minimum spacing is the lever that gives legible structure.) Each
   accepted point becomes a **System** node with `(x,y,z)` coordinates, a region
   classification, and a generated name.
3. **Connect lanes via the relative-neighbourhood graph (RNG).** An edge (a,b) is
   kept iff no third system lies in their "lune" (closer to both than they are to
   each other). Chosen over k-nearest: the RNG **contains the Euclidean MST, so it
   is connected *by construction*** (satisfies the connectivity criterion below
   without a bridging pass), and it is **road-like with few crossings**, where
   k-NN over-triangulates dense regions into an unreadable hairball. Long RNG
   edges spanning a void are few and desirable — they *are* the sparse crossings
   that make **choke points**; barrier seams stay sparse naturally. *(Also
   validated in the spike.)*
4. **Persist.** Write systems + lanes + galaxy metadata (seed, params, bounds,
   version) to Firestore.
5. **Start area.** A fixed known seed produces the frozen start-area subgraph
   served to logged-out users (Open question #3: carved region vs. separate
   mini-galaxy).

3D coordinates give real **distance** (spawn padding and travel cost, later),
drive the noise field, and enable a true **3D galaxy view** (the reference
WebGraph / the old Three.js client); rendering itself stays downstream (a
non-goal here) — this spec just produces `(x,y,z)`-positioned data it can
consume.

## Design details

- **Where it lands:** a `galaxy` backend domain (`backend/galaxy/`),
  handler→service→DAO, Firestore-backed (per `backend/CLAUDE.md` layering).
  Generation is a **service operation** invoked by a CLI/admin/seed command, not
  a user request.
- **Data model (sketch):**
  - `System` (node): `id`, `coords {x,y,z}`, `name`, `region`
    (`star_rich|normal|dead|barrier`), neighbor/`laneIds`, and a **major-body
    skeleton** (star + planets/gas giants + orbital geometry — the graph-visible
    inventory; Decision #9). *(Mutable interior detail — resources, small bodies,
    hazards — still deferred to #0003, materialized on first arrival.)*
  - `Lane` (edge): `id`, `aId`, `bId` — **topology only**. Travel **cost is not
    stored**: `../plans/movement-galaxy.md` resolved it as a *derived* value
    (length-weighted time from the endpoint coords), so generation needs only the
    edge. A `cost`/`relayModifier` field is a reserved hook for *later* per-lane
    modifiers (hazard/relay), not a generation output. (Decision #6.)
  - `Galaxy` metadata: `id`, `seed`, `params`, `bounds`, `version`, `createdAt`.
  - Firestore layout: `galaxies/{id}` with `systems/{id}` and `lanes/{id}`
    subcollections (vs. embedded neighbor lists — decide by read pattern).
- **Read surface:** frontend service/hook fetches the graph (systems + lanes +
  layout hint) and renders the WebGraph view. Logged-out path serves the frozen
  start area (may be a static/cached asset — never hits live generation).
- **Extendability:** persisted seed + params let a later "expand frontier"
  operation append boundary systems deterministically.
- **Events/SSE:** none required for static generation. Later world mutation
  (colonies, depletion) rides existing Pub/Sub + SSE — out of scope here.

## Acceptance criteria

- [ ] Given a seed, generation produces a **connected** graph of N system nodes
      with lanes; **same seed → same galaxy** (deterministic).
- [ ] Systems carry a **region classification** from a noise field; star-rich
      regions are visibly denser than dead zones, and barriers form sparse
      seams.
- [ ] The galaxy (systems, lanes, metadata incl. seed) is **persisted to
      Firestore** and readable by a frontend service.
- [ ] A **fixed known-seed start area** can be generated and served as the
      logged-out landing (`../vision.md`).
- [ ] Output carries enough for the WebGraph view to render nodes + edges
      (+ coordinates / layout hint).
- [ ] Generation is **re-runnable and extendable** without corrupting an
      existing galaxy (append, or regenerate to a new id).
- [ ] Each system carries a deterministic **major-body skeleton** (star +
      planets/gas giants + orbital geometry) generated here and exposed for the graph
      view — the free inventory, not the mutable detail (Decision #9).
- [ ] Backend tests (against the Firebase emulator) cover **determinism**,
      **connectivity**, and **region distribution**.

## Decisions (resolved 2026-07-06)

1. **Spatial model → coordinates + noise field, in 3D.** Systems have `(x,y,z)`
   positions; a 3D simplex-noise field drives region + placement density. Real
   distances for spawn/travel, and a true 3D galaxy view.
2. **Scale → hundreds** (~200–500 systems). No level-of-detail work needed; the
   ever-growing frontier expands it later.
3. **Start area → separate mini-galaxy.** The frozen logged-out landing is its
   own tiny galaxy from a fixed known seed — leak-proof, cacheable as a static
   asset, never touches live generation.
4. **Frontier expansion → deferred.** Generation is designed to be appended to,
   but the trigger/cadence is a later spec.
5. **System-interior boundary → generation stops at the node.** Contents / the
   hex board are generated lazily on first visit in a later spec.
6. **Lane semantics → topology only.** No `cost`/`type` stored; travel cost is
   *derived* (length-weighted time — `../plans/movement-galaxy.md`). A per-lane
   modifier field stays a reserved hook for later.

**Refined 2026-07-08 (validated in `/spike/galaxy-3d`):**

7. **Placement → region-varied minimum spacing (Poisson-disc).** Not free
   gaussian scatter. The *contrast* between per-region gaps (tight star-rich,
   sparse dead) creates legible structure; the minimum gap prevents blobbing.
8. **Lanes → relative-neighbourhood graph (RNG),** not k-nearest. Connected by
   construction (contains the MST), road-like, few crossings; k-NN hairballs in
   dense regions. Long void-spanning edges are the natural choke crossings.

**Refined 2026-07-09 (fog + system-interior handoff — `../plans/fog-of-war.md`, #0003):**

9. **The node now carries a *skeleton* — refines Decision #5.** Generation no longer
   stops at a bare node: each `System` also gets its **major-body inventory** (star +
   planets + gas giants + orbital geometry — the immutable "skeleton" of #0003),
   rolled **here, eagerly**, because it is **visible on the galaxy graph itself**
   ("option (a)"): the graph shows *"star + 4 planets + a gas giant"* for free, from
   t=0, the way stars are free. Only the **mutable detail** (resources, small/dark
   bodies, hazards) still stops at the node — materialized by **#0003 on first
   arrival**, not here. The character dial drives that detail's *worth* (rich vs.
   barren) **more than the body count**, so the free inventory doesn't leak the paid
   survey appraisal. **#0002 draws the inventory.**

## Open questions

- **Galaxy shape** *(Travis)* — approach assumes a **flattened disk** (broad
  x/y, thin z) for legibility; confirm vs. a full sphere. → **leaning disk.**
- **Firestore layout** *(dev)* — systems/lanes as subcollections vs. embedded
  neighbor lists; decide by the graph view's read pattern during build.

## References

- `frontend/app/spike/galaxy-3d/` — throwaway prototype standing in for this
  spec's output; where placement + lane-algorithm choices (decisions #7/#8) were
  eyeballed. Tuning constants there are spike-only, not spec.
- `../plans/movement-galaxy.md` — graph-tier travel; owns the derived lane cost.
- `../vision.md` — two-tier map; Auth & onboarding stance (frozen start area).
- `../plans/BRAINSTORM.md` — galactic view (WebGraph), world shape /
  ever-growing frontier.
- `../plans/canvas/` — UI reference (the WebGraph galaxy view).
- Archived design: `git show bf9c637:client/docs/Gameplay.mdc` — original
  noise regions (Star-Rich / Dead / Barrier) and spawn padding, on a radius-50
  single hex map (the single-map model this **supersedes at the galaxy layer**).

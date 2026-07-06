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

- **System interiors / hex boards** — what's *inside* a node is a separate spec;
  this one stops at the node + region + connections.
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
2. **Place system nodes.** Sample candidate positions within a **flattened-disk
   volume** (galaxy-shaped: broad in x/y, thin in z — legible in a 3D view, no
   spherical occlusion blob) and accept/reject by a density that follows the
   field — star-rich → dense clusters, dead zones → sparse, barriers →
   near-empty seams. Each accepted point becomes a **System** node with `(x,y,z)`
   coordinates, a region classification, and a generated name.
3. **Connect lanes.** Derive lanes from proximity (e.g. a relative-neighborhood
   / k-nearest graph) so the map is connected and locally clustered, plus a few
   long-range lanes for topology. Barrier regions suppress edges → natural choke
   points.
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
    (`star_rich|normal|dead|barrier`), neighbor/`laneIds`. *(Interior contents
    deferred.)*
  - `Lane` (edge): `id`, `aId`, `bId` — topology only for now (`type`/`cost`
    deferred to the movement spec; Open question #6).
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
6. **Lane semantics → topology only.** `cost`/`type` added later with movement.

## Open questions

- **Galaxy shape** *(Travis)* — approach assumes a **flattened disk** (broad
  x/y, thin z) for legibility; confirm vs. a full sphere. → **leaning disk.**
- **Firestore layout** *(dev)* — systems/lanes as subcollections vs. embedded
  neighbor lists; decide by the graph view's read pattern during build.

## References

- `../vision.md` — two-tier map; Auth & onboarding stance (frozen start area).
- `../plans/BRAINSTORM.md` — galactic view (WebGraph), world shape /
  ever-growing frontier.
- `../plans/canvas/` — UI reference (the WebGraph galaxy view).
- Archived design: `git show bf9c637:client/docs/Gameplay.mdc` — original
  noise regions (Star-Rich / Dead / Barrier) and spawn padding, on a radius-50
  single hex map (the single-map model this **supersedes at the galaxy layer**).

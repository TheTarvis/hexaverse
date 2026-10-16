> Historical snapshot, archived 2026-10-16. Retired workflow and old status claims
> are provenance, not current instructions. Original relative plain-text paths
> are interpreted from [docs/specs/0003-system-interior.md](../../../specs/0003-system-interior.md). Current domains live in
> [canonical documentation](../../../README.md).

---
number: 0003
title: System interior generation
status: accepted   # draft | accepted | implemented | superseded
created: 2026-07-07
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0003 — System interior generation

Historical spec. Current [world documentation](../../../domains/world.md) distinguishes
surviving generation intent from retired hex geometry and the arrival-trigger gap.
The numbered path remains for existing decision references.

> Procedurally generate and persist a star system's **interior** — the
> star-centered hex board of orbital sectors, populated by **bodies** (planets,
> belts, moons, anomalies) with resources, hazards, and orbital elements — the
> tactical-layer map you drill into to scan, mine, and move. One tier down from
> #0001.

## Problem / motivation

Hexaverse is a **two-tier map** (`../vision.md`): a galactic **graph** (#0001)
you navigate under fog, and a per-system **hex board** you drill into to *act*.
#0001 generates the graph but **explicitly stops at the node** — a `System` is a
point with a region and lanes, with nothing inside. So today there is nowhere to
scan, nothing to mine, no terrain to move across: the first-slice loop
(`../vision.md` steps 4–5 — *drill into a system → move a ship → scan → mine*)
has no board to run on.

This spec generates that board: a **star-centered hex grid of orbital sectors**,
populated with the **bodies** a player scans and mines, dialed by the system's
graph-tier character so the graph's promises pay off when you arrive. It is the
tactical foundation that the board **renderer**, **fog**, **scan**, **mine**, and
**movement** all sit on — each of which is its own spec (see Non-goals).

Scope boundary: this spec generates + persists the **interior data model** and its
read surface. It does **not** render it, fog it, or define the actions taken on it.
The design is worked out in `../plans/hex-board.md`; this spec is its buildable
distillation.

## Goals

- Generate a system's interior as a **star-centered hexagonal board** in **axial
  coordinates** (radius baseline ~16), **deterministically** from a seed derived
  from the system's identity — *same system → same interior*.
- Model the board as **orbital bands**: star at hex `(0,0)`, **distance-from-center
  = orbital distance**, contents driven by a **radial gradient + noise** (inner =
  hot/metals, mid = goldilocks, outer = cold/ice-gas).
- Populate with **features as the organizing unit** — one object family covering
  both the physical/minable ("bodies": star, rocky planets, gas giants, moons,
  asteroid belts, ice bodies, anomalies, ruins) *and* the hazards (nebula, gravity
  well, debris, radiation). **Payload hangs off the feature** — resources and/or
  effects — never loose scatter and never bare tile flags.
- **Dial generation by the system's graph-tier character** (`star_rich | normal |
  dead | barrier` from #0001) — the two-tier bridge, so Survey intel forecasts
  interior worth.
- Give **every feature a position model** (orbital elements, or a `parentId` ride,
  or `fixed`) so its live hex(es) are **computed** from `(position, footprint,
  worldTime)`, never stored per tick. **Motion is a flag** (off/slow for the slice;
  on later — zero rework). Hazards move too; they are not static terrain.
- **Generate in two phases** (Decision #14): the **skeleton** (star + major bodies +
  geometry) **eagerly at system-creation** and graph-visible; the **detail**
  (resources, small bodies, hazards) **lazily on first arrival** — then **persist** to
  Firestore as a stable, mutable interior (later play mutates it — e.g. depletion).
- Be **render-ready** for the SVG hex board (bodies + orbital elements + hazards +
  board metadata).
- **Frozen start-area** systems (`../vision.md`) ship fully-generated static
  interiors (curated, no per-player state).

## Non-goals

- **Hex board renderer** — the SVG view that draws this data is a **companion
  frontend spec** (as #0002 is to #0001). Prototyped at `frontend/app/spike/hex-board/`.
- **Fog of war (board tier)** — per-player visibility is `../plans/fog-of-war.md`
  → a scan-and-fog spec. This produces the world that later gets fogged/filtered.
- **Scan / mine actions** — their own specs; this generates the bodies they act on.
- **Movement (coast/thrust)** — `../plans/movement-board.md` → a movement spec; this
  supplies the board + orbital elements movement rides on.
- **Orbital *motion* simulation** and **combat** — deferred; elements live in the
  model but the sim/flag and any body-vs-body interaction are later.
- **Depletion mechanics & intel freshness/valuation** — `../plans/market.md`; a
  body carries resource richness, but *how it draws down and what it's worth* is
  the economy's job.

## Proposed approach

Generate in the **backend (Go)**, persist to **Firestore**, expose a read endpoint
the hex-board view consumes — mirroring #0001, one tier down. Generation runs in
**two phases** (Decision #14): the **skeleton** (major bodies + geometry) is rolled
**eagerly with the galaxy** (#0001) and is graph-visible; the **detail** is
materialized **lazily on first arrival** (not for the whole galaxy up front);
start-area interiors are pre-generated.

1. **Seed.** Derive a per-system seed from the galaxy seed + system id, so the
   interior is deterministic and reproducible without storing the whole board eagerly.
2. **Board.** A hexagonal board of radius *R* (~16). Each tile's **ring** =
   hex-distance from center; **band** = `core | inner | mid | outer` by ring.
3. **Character dial.** Read the system's #0001 `region` → generation parameters
   (body counts, resource richness, hazard density). `star_rich` → many bodies,
   dense belts, ruins/anomalies; `dead` → a lonely star + a rock or two; `barrier`
   → hazard/nebula-choked.
4. **Place bodies.** Star at center. Planets weighted toward inner/mid, typed by
   band (inner → rocky/metals; mid → rocky/organics + ruins/anomalies; outer → gas
   giant/ice). Asteroid **belts** as ring arcs (metals inner, ice outer). **Moons**
   placed adjacent to gas giants, riding them. Each body gets **type-appropriate
   resources** (`metals | volatiles | water | organics | research | exotic`, with a
   richness scaled by the character dial).
5. **Orbital elements.** Every non-star body gets `{ ring, angle0 (index at epoch),
   period/direction }`. Position at any `worldTime` is a pure function of these.
   Slice runs motion **off or slow**, so the board reads static.
6. **Hazards.** Placed as **features** with `effects` payloads (radiation inner,
   nebula outer, gravity well near the core, debris on belts) — each with its own
   position/footprint like any feature (a well rides its mass; a nebula field drifts),
   later cutting scan range/quality and modifying movement.
7. **Persist.** Write the interior (metadata doc + `features` subcollection) to
   Firestore on first visit; subsequent reads hit the stored copy. Served
   already-filtered per requester once fog exists.

## Design details

- **Where it lands:** a **separate `backend/system/` domain** (own endpoint,
  handler→service→DAO, Firestore-backed per `backend/CLAUDE.md`) — *not* folded into
  `galaxy`. Generation is a **service operation** triggered on first Explore (and by
  the seed/admin path for the start area), not a raw user write. The `system` service
  calls the `galaxy` service (service-to-service) once to read the node's `region` —
  the character dial.
- **The interior never rides the galaxy payload.** The `galaxy.System` node stays
  **lightweight** — only what the graph view needs to draw it (`id`, `coords`,
  `region`, `name`, `laneIds`). The interior (bodies, orbital elements, hazards) is
  fetched **by `systemId`, one system at a time, on drill-in** — so a system's heavy
  data is *only* transferred when a player actually enters it. (Galaxy-payload
  scaling itself — fog-filtering to discovered systems, later viewport paging — is
  a #0001/#0002 read-surface concern, not this spec's; #0003 only guarantees the
  interior is a separate lazy per-system fetch.)
- **Data model (sketch) — one unified `Feature` family:**
  - `SystemInterior` (doc): `systemId`, `seed`, `radius`, `character`, `starClass`,
    `version`, `createdAt`. **Metadata only.**
  - `Feature` (subcollection `features/{fid}`): `id`, `type` (`star | rocky |
    gas_giant | ice | belt | moon | anomaly | ruin | nebula | gravity_well | debris
    | radiation | …`), `name?`; **position** — `orbit { ring, angle0, period, dir }`
    *or* `parentId` (rides another feature — moons, a planet's gravity well) *or*
    `fixed` (star at centre); **footprint** — a single anchor hex, or a shape/tile-set
    for fields (belt arc, nebula region); **payload** — `resources [{ kind, richness
    }]?` (minable) and/or `effects { scanMod, moveMod, block }?` (hazard). A feature
    may carry resources, effects, both, or neither. **No stored position** — live
    hex(es) are computed from position + footprint + `worldTime`.
  - **Tiles: nothing stored.** A tile's ring/band are pure functions of `(q,r)`, so
    the hex field is derived from `radius`; empty space is the absence of a feature.
  - **Firestore layout:** `galaxies/{gid}/systems/{sid}/interior` doc +
    `features/{fid}` subcollection.
- **"Bodies" vs "features":** *body* stays as vocabulary for the physical/minable
  subset (the `hex-board.md` term); the **stored object is a `Feature`**, and hazards
  are just features with an `effects` payload, positioned the same way as everything
  else.
- **Coordinates:** **axial** for storage, **cube** for algorithms (ring distance,
  neighbors, ring-perimeter walks) — the redblobgames standard.
- **Position computation:** a feature's live hex(es) = `orbState(position, worldTime)`
  applied over its footprint. The read path ships **fog-filtered elements +
  `worldTime`**; the **client evaluates for rendering**, the **server evaluates for
  authoritative resolution** (scan hits, arrival, co-occupancy). Volatile actors are
  live-snapshot-only (Decision #10).
- **Read surface:** a frontend service/hook fetches the interior (`features` with
  their elements + board metadata); the SVG renderer (companion spec) draws it.
  Start-area interiors may be served as a static/cached asset (never hit live
  generation).
- **Lazy generation:** the interior is **shared world state**, materialized **once
  per system** the first time any player Explores it — the `system` service does
  **create-if-absent** (generate → persist → return fogged view), guarded against
  races (deterministic + transaction). Not per-player. The exact "Explored" signal
  comes from the fog + movement specs (Decision #13).
- **Events/SSE:** none required for static generation. Later mutation (depletion,
  activity) rides existing Pub/Sub + SSE — out of scope here.

## Acceptance criteria

- [x] Given a system id/seed, generation produces a **star-centered hex board**
      (radius R), and **same seed → same interior** (deterministic).
- [x] Tiles carry a **ring + band**; contents follow a **radial gradient + noise**
      — inner bodies skew metals, outer skew ice/gas, mid holds the goldilocks/ruins.
- [x] The interior is populated by **bodies** (star at center; planets; ≥1 belt as
      a ring arc; moons riding gas giants; some mid-band anomaly/ruin), each with
      **resources hanging off the body** and band-appropriate kinds.
- [x] Generation is **dialed by graph-tier character** — a `star_rich` system is
      visibly denser/richer than a `dead` one from the same generator.
- [x] **Every non-star body carries orbital elements**; its position is computed
      from `(elements, worldTime)`; with motion **off/slow**, the board reads static
      for the slice.
- [ ] The interior is **generated once per system, lazily on first Explore**, as
      **shared** state (not per-player), **idempotent under races** (create-if-absent),
      and **persisted to Firestore**, readable by a frontend service.
- [ ] A **frozen start-area** system ships a fully-generated static interior.
- [x] **All generation knobs live in one `GenerationParams` object** (radius, band
      boundaries, per-character counts + richness, hazard rates) with the spike
      values as defaults — retuning is *edit a value + regenerate*, no
      generator-code changes. (**Orbital periods left for `common.GameTuning`** —
      Decision #15: they're pacing, derived at read, and retuning them must reach
      systems that already exist.)
- [x] Backend tests (Firebase emulator) cover **determinism**, **band
      distribution**, the **character dial**, and **presence of orbital elements**.

## Decisions (imported from `../plans/hex-board.md`, 2026-07-06/07)

1. **A hex is an orbital sector; the board is star-centered concentric rings.**
2. **Bodies are the organizing unit; resource tiles hang off bodies** (no loose scatter).
3. **Graph-tier character dials the interior generator** (the two-tier bridge).
4. **Baseline: radius ~16, roomy density** (~7 planets + ~2 belts + ~2 specials at
   `star_rich`) — density is the lever, "mostly empty space with a few worlds."
5. **Orbital elements in the schema from day one; position is computed, never
   stored; motion is a flag** (off/slow for slice, on later, no rework).
6. **Axial storage / cube algorithms.**
7. *(Renderer = SVG — a decision that belongs to the companion renderer spec, noted
   here for continuity.)*

## Decisions (resolved while drafting, 2026-07-07)

8. **Separate `backend/system/` domain** owns the interior (own endpoint). The
   `galaxy.System` node stays **lightweight** (id + coords/region/name/lanes only);
   the interior is fetched **lazily by `systemId`, one system at a time**, and never
   bundled into the galaxy payload. Galaxy-payload scaling (fog-filtering, viewport
   paging) is #0001/#0002's concern.
9. **Sparse storage + one unified `Feature` family.** No materialized tile grid —
   tile geometry is derived from `radius`; the interior is a **metadata doc + a
   `features` subcollection**. Bodies *and* hazards are one object type (`Feature`)
   differing only by type + payload (`resources` and/or `effects`); all can move
   (orbit / ride a parent / fixed). Hazards are **not** static tile traits.
10. **Positions: send elements, evaluate at both ends.** The read path sends
    **fog-filtered orbital elements + `worldTime`** (the server owns truth,
    filtering, and the clock); the **client evaluates positions for rendering**;
    the **server evaluates them for authoritative resolution** (scan hits, arrival,
    co-occupancy). **Volatile actors** (a thrusting enemy ship) are **not**
    extrapolable — sent as **live snapshots only when Visible**, never as predictable
    elements. Enforces the ephemeris-vs-activity split on the wire.
11. **Tuning is data, not code — one `GenerationParams` table.** Every generation
    knob (`radius`, band boundaries, per-character body counts + richness, hazard
    rates, orbital periods) lives in a **single params object**, not scattered
    through generator logic; the spike values are the **baseline defaults**.
    Generation is a deterministic function of `(seed, params)`, so retuning = edit
    params + regenerate, reproducibly. This subsumes the exact-radius / density-curve
    / fixed-vs-variable-radius questions — they're all just values in the table,
    swept later without touching code. (Baseline: fixed radius ~16 for the slice;
    star-class-driven variable radius is one such value to flip on later.)

12. **Multi-tile bodies — supported by the model, deferred as content.** `Feature.
    footprint` already handles multi-tile (belts, nebula fields use it), so it's no
    architectural special case. The slice authors point-bodies (planets, giants) as
    **single-hex**; multi-tile planets are a deferred content toggle (give the
    feature a bigger footprint at generation time — no rework).
13. **Generation contract: shared, once-per-system, lazy, idempotent.** The interior
    is **shared world state**, generated **once per system** (not per player) the
    first time any player **Explores** it: the `system` service does **create-if-
    absent** (generate from `(seed, params)` → persist → return fogged view), guarded
    (deterministic + transaction / deterministic doc id) so a **race** can't double-
    generate or diverge. After that it's a normal stored (and later mutated) read.
    The **exact triggering event** ("Explored" = arrival vs. deep-scan vs. view-open)
    is **owned by the fog + movement specs**; this spec only requires *a* signal.

## Decisions (resolved 2026-07-09 — fog + movement handoff, `../plans/fog-of-war.md`)

14. **Two-phase generation; arrival is the "Explored" trigger.** The interior
    generates in **two phases**, split on the **same seam as board-tier fog**
    (astronomical-free vs. detail-earned):
    - **Skeleton — eager, at system-creation.** The star + **major bodies** (planets,
      gas giants) + orbital geometry are rolled **up front with the galaxy** (an
      addition to **#0001**): they are the *free/known* layer (must exist before
      anyone visits) and are **immutable** (a planet isn't mined away), so safe to
      compute eagerly. They are **visible on the galaxy graph itself** ("option (a)")
      — so #0001 carries a per-system **major-body inventory** and **#0002 draws it**.
      This **refines #0001's Decision #5** ("generation stops at the node"): the node
      now carries the *skeleton*; only the *detail* stops there.
    - **Detail — lazy, on first arrival, then locked.** Resources/richness, small &
      dark bodies, anomalies, and hazards are materialized by the **first fleet to
      physically arrive** via a lane, then persisted and shared — the create-if-absent
      of Decision #13. It is **mutable** (depletion), so it must be materialized once,
      never recomputed from seed per read.
    - **Arrival is the trigger** (resolves the Open question below): a fleet entering
      the system materializes the detail; a **graph-tier deep-scan does *not*** — it
      only forecasts the system's *character* (what keeps survey intel sellable). So
      the character dial drives **detail richness / hazards more than body *count***,
      or the free graph inventory would leak the paid appraisal.

## Decisions (resolved 2026-07-13 — orbital pace is tuning, not generation)

15. **Orbital period moves to `common.GameTuning` and is derived at read.** This
    **amends Decision #11**, which put "orbital periods" in `GenerationParams`
    alongside the body/hazard dials. The dials are baked at generation and *should*
    be — a planet isn't re-rolled — but a period is **pacing**: it says how fast the
    world *feels*, the same job as `MsPerTile` or `ScanDuration`, and an operator
    retuning it means "make the board turn faster," including in the systems that
    already exist. Baking it made that impossible: an interior materialized on
    Monday would orbit at Monday's pace forever.
    So `Feature.Orbit.Period` is **no longer persisted** (`firestore:"-"`) — it is a
    pure function of `ring` and `Tuning().OrbitBasePeriod`, hydrated on the one read
    path out of Firestore (`system.PeriodFor`, applied in `dao.ListFeatures`).
    `Ring`/`Angle0`/`Dir` stay stored: those are the generator's dice.
    The general rule this sets: **bake-in is what disqualifies a knob from tuning,
    not subject matter** — anything derivable at read is welcome to follow it.
    (Noted while chasing "orbits don't move": they did, at one hex per 10 real
    minutes. `OrbitBasePeriod / 6` is the cell-crossing time, and the ring factor
    cancels, so that rate is identical on every ring.)

    It is also the world's **one** orbital law, exposed as
    `common.GameTuning.OrbitPeriod(ring)` and obeyed by **coasting fleets** as well as
    bodies — fleet's separate (and un-ring-scaled) `CoastPeriod` is gone. See **#0004
    Decision #20**: a ship and a rock on the same ring keep the same period, because
    they are the same physics.

## Open questions
- ~~**Triggering event (delegated)**~~ **RESOLVED 2026-07-09 (Decision #14):**
  **arrival** (a fleet entering via a lane) fires *detail* generation; the *skeleton*
  is eager at system-creation. Still guarded by create-if-absent (Decision #13).

## References

- Related specs: **#0001** (galaxy generation — this is its one-tier-down
  companion), **#0002** (galaxy view — the renderer analog for the graph tier).
- `../plans/hex-board.md` — the full design (board model, bodies, orbits, baseline).
- `../plans/movement-board.md`, `../plans/fog-of-war.md`, `../plans/market.md` — the
  paired systems that consume this interior (movement, visibility, valuation).
- `frontend/app/spike/hex-board/` — throwaway SVG spike proving the model + orbits.
- `../vision.md` — two-tier map; frozen start area.
- Archived design: `git show bf9c637:client/docs/Gameplay.mdc` — original hex
  mechanics at galactic scale (the single-map model this **supersedes at the
  tactical layer**).

---
number: 0009
title: Spawn & Corporation Identity
status: implemented   # draft | accepted | implemented | superseded
created: 2026-07-09
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0009 — Spawn & Corporation Identity

> **A mind wakes in a hull.** The player is an uploaded consciousness
> (Bobiverse-style); the **Corporation is its lineage** — every fleet carries
> a drifted copy of you. Spawn creates the Corporation + its first (only)
> hull in a quiet, bootstrap-guaranteed frontier system. The lineage lives
> while any fleet lives, dies with the last one, and restarts from a drifted
> backup — mechanically fresh.

## Problem / motivation

`../vision.md` slice step 3 is "spawn the player," and it is the only slice
step with no data model behind it: there is no Corporation entity, no rule
for where a new player lands, and no definition of what they start with.
Every other spec quietly assumes the answers — #0004's fleets belong to
*someone*, #0006's fog is per-Corporation, the auth account must map to a
player entity — so building any of them end-to-end stalls at "who owns
this?".

The identity lore also does real mechanical work, which is why it's spec'd
rather than left as flavor: it dissolves the starting-package question (one
hull, nothing else), defuses the unit-taxonomy blocker (everything else is
*built*, later), makes per-Corporation fog diegetic, and gives loss/restart
a coherent story. Design decided 2026-07-09 in `../plans/spawn.md`, grounded
in `../lore.md`.

## Goals

- **The identity model in the schema**: a **Corporation** (the
  auth-account-linked player entity — in-fiction, the mind's lineage) that
  **fleets reference as owner**. Every fleet is a replicant copy of the mind
  in a hull; #0004's fleet-is-the-actor is this lore made mechanical.
- **Spawn is one operation**: create the Corporation + its first fleet,
  placed in a system that is **unclaimed** (minimum graph-distance from
  other Corporations' known space), **bootstrap-guaranteed** (≥ 1 mineable
  body on the #0003 skeleton — no softlock), and **frontier-weighted**
  (new minds wake at the fresh edge, per `../vision.md`).
- **Starting package = one hull** — no base, no colony, no escort; the hull
  carries the minimal fit the slice verbs need (drive, scanner, cargo).
  Everything else a player ever owns is built, not granted.
- **The death rule is recorded and enforced-when-possible**: the Corporation
  persists while ≥ 1 fleet lives; losing the last fleet ends it. (Nothing in
  the slice can destroy a fleet — the rule ships as the invariant future
  combat/economy specs inherit.)
- **Restart = backup-restore as the design contract**: a *new* Corporation,
  lore-continuous (a drifted copy of the seed upload), mechanically fresh —
  nothing carries but the universal star map everyone has anyway.
- **Spawn is instant** — not a #0005 action; you wake, you're there.
- **Initial fog state** per #0006: the wake-up system explored for the new
  Corporation; the rest of the galaxy at its lore-correct baseline
  (star-visible everywhere, no charted lanes beyond home's).

## Non-goals

- **Replication / multi-fleet** — a new fleet is a new copy of the mind, but
  the build verb owns it; the slice has exactly one.
- **Mechanical drift** (per-copy traits at replication) — drift is canon
  lore, lore-only for now.
- **The actual death → restore flow** — needs combat to exist; this spec
  fixes the *rules* so nothing else invents different ones.
- **Orphaned-asset / derelict salvage rules** — combat/economy era.
- **Name-lineage carry-over across restores** (Bob-1, Bob-2 flavor) — cheap,
  decide at restart-flow time.
- **New-player grace / anti-farming** — interacts with spacing; decide
  together, post-slice (BACKLOG ⬜).
- **The spacing formula** — deliberately open: it's a property of the graph
  as a whole (density, region sizes, frontier cadence). The slice ships the
  criteria *shape* with trivial constants; numbers come with real generated
  graphs.
- **Unit taxonomy** (probe/relay/outpost/base) — a build-tree decision, not
  a spawn-time one; nothing but the first hull exists at spawn.
- **Tutorial / guided onboarding** — the frozen start area graduates into it
  later (`../vision.md`).

## Proposed approach

**Identity.** One new domain entity: the **Corporation** — id, display name,
the linked auth account (`common.Actor` maps to it), created/died
timestamps. Fleets (#0004) carry `corporationId`; observations (#0006) are
already keyed per-player — that key *is* the Corporation. In-fiction the
Corporation is the mind's lineage and each fleet a drifted copy; mechanically
it is simply the ownership root everything else hangs off.

**Spawn.** On first sign-in (or explicit "wake" from the landing), the
backend picks a spawn system and, in one transaction: creates the
Corporation, creates its fleet (one hull, coasting at a rim-adjacent
position in the wake-up system per #0004's position model), and writes the
initial observations (#0006: home → `explored`, its onward lanes charted).
The player wakes knowing home and seeing the whole sky.

**Site selection.** Filter #0001's systems by the three criteria — no other
Corporation's known space within the minimum graph distance,
≥ 1 mineable body on the skeleton, periphery-weighted random pick among
qualifiers. All three are trivially satisfiable while the world is
near-empty, but the *shape* (a filtered, weighted pick over the graph) is
what survives tuning.

**Death & restart (the contract).** `diedAt` is set when the Corporation's
last fleet is destroyed — an invariant enforced wherever fleet destruction
is eventually implemented, not a code path the slice can reach. Restart
creates a **new Corporation** via the same spawn flow; the lore
(seed-archive backup + drift, `../lore.md`) is why nothing mechanical
carries and why that's narratively honest rather than a save-wipe.

## Design details

- **Where it lands:** a top-level **`backend/corporation/` domain**
  (`/new-domain corporation` as the starting shape; handler→service→DAO per
  `backend/CLAUDE.md`). The spawn operation is a corporation-service method
  that orchestrates fleet + observation creation through those services
  (cross-domain via services, never DAOs).
- **Data model (Firestore):**

  ```
  corporations/{corpId}
    accountId  : the Firebase auth account (unique — one living corp per
                 account; the restart flow retires the old corp first)
    name       : display name
    createdAt  : worldTime
    diedAt?    : worldTime — set when the last fleet dies; a dead corp is
                 read-only history

  fleets/{fleetId}                      # #0004's entity, gaining its owner
    corporationId : the lineage this copy belongs to
  ```

  Observations stay keyed by the player entity (#0006's
  `players/{pid}/…` — `pid` = `corpId`).
- **API (sketch):**
  - `POST /v1/corporations` `{name}` → runs spawn; returns the corporation +
    its fleet + home system. Idempotent per account (a second call returns
    the existing living corp).
  - `GET /v1/corporations/me` → the caller's corp (the client's session
    bootstrap).
  - Auth middleware already yields the account (`common.Actor(c)`); handlers
    resolve account → corporation for every ownership check.
- **Site selection query:** candidate systems from #0001 where (a) skeleton
  has ≥ 1 body with a mineable-detail archetype (a skeleton-level flag —
  the *detail* stays unrolled until first arrival, #0003/#0006; the
  guarantee is "a belt/rocky body exists", not "its contents are known"),
  (b) graph distance to every other living corporation's explored set ≥
  `minSpawnDistance`, (c) weighted toward the periphery (graph
  eccentricity). All three knobs in a **params object**
  (`minSpawnDistance`, `peripheryWeight`), placeholder constants for the
  slice.
- **The fleet's starting fit** is whatever #0004/#0006/mine's params say a
  hull has by default (drive speed, sensor radius, cargo size) — this spec
  places the hull, the verb specs equip it; no spawn-specific stats.
- **Initial fog writes** (#0006): home system observation at `explored`
  (its skeleton + onward lanes), nothing else — the star map needs no
  per-player rows (it's free for everyone by design).
- **Frozen start area** (#0001/#0002): the logged-out landing is unchanged
  by this spec; its diegetic frame — the mind browsing from **cold
  storage** before waking — costs nothing and is noted for the eventual
  tutorial framing (`../plans/spawn.md`).
- **Frontend:** the signed-in-but-corpless state routes to a minimal
  wake-up flow (name the corporation → spawn → land on the #0002 galaxy
  view centered home). Component→hook→service→apiClient per
  `frontend/CLAUDE.md`; the corp lands in the session context the way the
  auth account does today.

## Acceptance criteria

- [x] First sign-in + wake creates, in **one transaction**: a Corporation
      (linked to the auth account), exactly one fleet with
      `corporationId` set, and the home-system observation at `explored`
      with onward lanes charted. *(Implemented as the agreed anchor: the corp
      doc + account pointer commit in one transaction — `dao.CreateWithPointer`;
      the fleet + fog writes follow through their services, healed on retry by
      idempotency. See Implementation notes.)*
- [x] The spawn system satisfies all three criteria (emulator test with a
      seeded graph): ≥ 1 mineable-archetype body on the skeleton, ≥
      `minSpawnDistance` from every other living corp's explored set, and
      periphery-weighted selection among qualifiers.
      *(`corporations/siteselection_test.go`.)*
- [x] Spawning is **idempotent per account** — a second wake call returns
      the existing living Corporation; no duplicate corps or fleets.
      *(`TestSpawn_Idempotent`.)*
- [x] The new player's first galaxy read shows: the full star map
      (everyone's baseline), home `explored`, home's onward lanes, and
      nothing else charted — verified against #0006's fog filter.
      *(`TestSpawn_CreatesCorpFleetAndFog`.)*
- [x] The starting fleet is **one hull** with default params — no other
      entities exist for the new Corporation.
- [x] A Corporation with a living fleet cannot be marked dead; `diedAt` is
      settable only when its fleet count reaches zero (invariant test —
      even though no slice code path destroys fleets). *(`TestDeathInvariant`.)*
- [ ] A dead Corporation's account can spawn a **new** Corporation; the new
      corp starts with no observations, assets, or references to the old
      one. *(**Deferred** with the death → restore flow, a non-goal: no slice
      path kills a fleet, so no corp can die, and the account pointer always
      references a living corp. The rules are recorded; the restart repoint
      lands when combat does.)*
- [x] Ownership is enforced from the account: every fleet/action/observation
      route resolves `common.Actor` → corporation and rejects cross-corp
      access. *(The `ResolveCorporation` middleware resolves account→living-corp
      into `common.ActorCorp`, the single seam every fogged read already used;
      `TestSpawn_TwoAccountsTwoCorps` + the fleet audience 404.)*
- [x] Spawn placement knobs (`minSpawnDistance`, `peripheryWeight`,
      mineable-archetype requirement) live in a **params object**.
      *(`corporations/params.go`.)*
- [x] **Slice bar:** sign in, name your corporation, wake in a quiet
      frontier system with one ship, and the fog/lore framing holds — you
      see the whole sky and know only home. *(Driven end-to-end by the e2e
      wake flow in `frontend/e2e/setup/auth.setup.ts` + the board/smoke specs.)*

## Implementation notes (2026-07-10)

- **Where it landed:** `backend/corporations/` (top-level domain; the plural
  matches `/new-domain`'s output). Firestore: `corporations/{corpId}` for the
  corp docs, `corpByAccount/{accountId}` as the one-living-corp-per-account
  pointer (the uniqueness anchor + the O(1) `ActorCorp` lookup). The fog store
  keeps nesting under `corporations/{cid}/observations/…` — same key by design.
- **"One transaction" (build-time decision, approved 2026-07-10):** a literal
  three-domain transaction would force the corp DAO to write fleet + observation
  docs, breaking the house layering (cross-domain through services, never DAOs).
  Instead the **corp doc + account pointer** are the transactional anchor
  (`CreateWithPointer`); the hull (`fleet.SeedFleet`) and initial fog
  (`observation.RevealArrival`) follow through their services, and
  **idempotency-per-account** (itself an acceptance criterion) heals any partial
  spawn — a re-call ensures the assets exist. Site selection is seeded from the
  account id, so a heal re-picks the same home.
- **Ownership seam:** `common.ActorCorp` now reads a `CorpIdKey` set once per
  request by `middlewares.ResolveCorporation` (account → living corp), replacing
  the M4 dev derivation. The `POST /v1/fleets/dev-seed` endpoint + the
  `dev-corp` fallback are retired; `fleet.SeedFleet` survives as spawn's
  placement primitive.
- **Initial scan (open question, resolved for the slice):** spawn grants home
  graph-tier `explored` + onward-lane `rumored` only; board-detail stays to the
  player's first scan (the move→scan→leave bar is intact).

## Decisions (imported from `../plans/spawn.md`, 2026-07-09)

1. **Bobiverse identity model** — the player is an uploaded mind;
   Corporation = the lineage of copies; fleet = a replicant copy in a hull.
   No homeland, no capital. (The lore that made #0004's fleet-is-the-actor
   true.)
2. **Drift is canon** — copies diverge and follow their own paths;
   lore-only for now (mechanical drift is a post-slice ornament).
3. **Starting package = one hull** — everything else is built later; the
   unit taxonomy becomes a build-tree decision.
4. **Death trigger** — the Corporation lives while ≥ 1 fleet lives; gone
   with the last hull. Ten fleets, lose nine → bruised, not dead.
5. **Restart = backup-restore** — a new Corporation, lore-continuous
   (seed-copy + drift, `../lore.md`), mechanically fresh; the star map
   "carries" because it's universal astronomy, not property.
6. **Spawn-site criteria shape** — unclaimed + bootstrap-guaranteed +
   frontier-weighted; constants deliberately deferred to whole-graph tuning.
7. **Spawn is instant** — not a #0005 action.

## Open questions

- **Spacing formula** — the actual `minSpawnDistance` / periphery weighting,
  a whole-graph property; decide with real generated graphs + #0001's
  frontier-cadence work. Owner: Travis; slice ships placeholder constants.
- **Initial scan: free at spawn vs. the tutorializing first action** —
  leaning first action (the wake-up flow nudges "scan something"); cheap to
  change. Resolve with the slice's onboarding polish.
- **What carries across a restore** (name lineage, cosmetics, a "memories"
  flourish) — leaning nothing mechanical; decide at restart-flow time.
- **One living corp per account** is assumed here — revisit only if
  multi-corp accounts ever matter (no current reason).

## References

- `../plans/spawn.md` — the identity model, death/backup reasoning, criteria.
- `../lore.md` — the mind/lineage/drift canon; the seed-archive hand-wave;
  what a wipe touches (star map persists, subspace estate dies).
- Related specs: **#0001** (the graph spawn picks from; frontier), **#0003**
  (the skeleton the bootstrap guarantee reads), **#0004** (the fleet entity
  gaining `corporationId`), **#0006** (per-Corporation fog; the initial
  observation writes), **#0005** (spawn is *not* an action — recorded to
  keep the boundary clean).
- `../vision.md` — Core loop (the Corporation as the mind's lineage); slice
  step 3; "new players spawn at the fresh edge."
- `../specs/BACKLOG.md` — rows: Player spawn, Corporation, Units/assets
  taxonomy, New-player grace.

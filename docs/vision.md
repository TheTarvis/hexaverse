# Hexaverse — Vision & Product Overview

> **Status: DRAFT (2026-07-05).** This is the first pass at writing down *what
> Hexaverse is and why*, seeded from the archived gameplay design
> (`git show bf9c637:client/docs/Gameplay.mdc`) and `CLAUDE.md`. Sections
> marked **TODO(travis)** need your decisions — they're the same open
> questions flagged for the pending `/onboard` discovery. Edit freely; this
> doc is the source of truth for the "Purpose" and "Domain quick-reference"
> holes in `CLAUDE.md`.

## What it is

Hexaverse is a **multiplayer space-colonization game played on a procedurally
generated hex-grid galaxy.** Players spawn a colony, explore outward under fog
of war, claim territory, harvest resources, and compete with nearby players
over strategically significant terrain. It is a slow-burn, persistent,
real-time strategy game — closer to a browser 4X / territory game than a
twitch RTS.

This repository is the **2026-07-01 rebuild** of that game on the Volt
platform skeleton (Hexaverse is the first fork of Volt — the guinea pig). The
previous implementation (Next.js + Three.js client, Go WebSocket server) is
archived at branch `archive/pre-volt-reset` and commit `bf9c637`. The rebuild
keeps the *game design* but moves the realtime layer from raw WebSockets to
the Volt stack (SSE + Pub/Sub) and re-decides which features ship, and in what
order.

## North star

> A living galaxy where every player always has room to grow **and** someone
> nearby to discover — so exploration always matters and the map is never
> static or lonely.

The design is built to make the map itself the source of drama: clustered
opportunity (star-rich sectors), dangerous wilds (dead zones), and natural
borders (galactic barriers) that shape every expansion decision.

## Who it's for

**TODO(travis):** audience is undecided. Candidate framings, pick or refine:

- A personal/portfolio project first — the goal is building it well on Volt,
  players second.
- A small persistent-world game for a handful of friends / a niche community.
- A public browser game aiming for organic multiplayer.

The answer changes scope (matchmaking, moderation, scale, monetization), so
it's worth settling early even if the answer is "portfolio project for now."

## Core gameplay loop

Inherited from the original design (subject to rebuild re-scoping):

1. **Spawn** — a player starts a colony on a procedurally generated galaxy.
   Spawn logic places them at least `minDistance` from neighbors (room to
   grow) but within `maxDistance` of another colony (someone to find).
2. **Explore** — the galaxy starts fogged; units and bases reveal a scan
   radius around themselves. Exploration uncovers resources, hazards, and
   other players.
3. **Expand & claim** — bases project an influence radius; occupied tiles and
   base ranges define a player's **territory** (and their leaderboard score).
4. **Harvest & build** — resource tiles feed economy/science; players build
   more units (ships, bases, mining/research sites, relays).
5. **Compete** — players contest star-rich sectors and choke points; terrain
   traits (nebulae, voids, gravity wells) and movement limits create
   strategic friction.

## Design pillars

The mechanics that make it *Hexaverse* and not a generic 4X:

- **Hex grid, axial coordinates.** The galaxy is a hex map (original spec:
  radius ~50 tiles, ~7,650 tiles, each tile ≈ 1 light-year). Most tiles are
  empty; ~10–20% hold stars/systems/anomalies.
- **Procedural terrain from noise.** Simplex/Perlin noise assigns each tile an
  environment — Star-Rich Sectors, Dead Zones, Galactic Barriers — so the map
  has organic structure and strategic diversity.
- **Fog of war.** You only see near your units/bases. Knowledge is a resource.
- **Spawn with padding, not isolation.** The `minDistance`/`maxDistance` rule
  is a signature of the design — engagement is guaranteed but not immediate.
- **Territory as score.** Control is earned through presence and base
  influence; contiguity rules discourage isolated "reach."
- **Terrain-shaped movement.** Sublight by default; FTL/relays/wormholes as
  tiered unlocks; tile traits slow, block, or bonus movement and scanning.

## Goals of the rebuild

- Prove out the Volt platform (auth, SSE, Pub/Sub, Firestore, the layered
  backend/frontend conventions) on a real game.
- Re-implement the realtime layer on **SSE + Pub/Sub** instead of raw
  WebSockets.
- Ship a **playable vertical slice** — **TODO(travis):** define the slice.
  A likely candidate: generate a galaxy → spawn a colony → explore under fog →
  see it render. See `docs/specs/`.
- Keep the codebase spec-first so intent is documented before code (see
  `docs/specs/README.md`).

## Non-goals (for now)

**TODO(travis):** confirm. Candidates for explicitly *out of scope* in the
current rebuild phase:

- Combat resolution / detailed battle system.
- Full tech tree and all FTL tiers.
- Wormholes / cross-galaxy travel.
- Monetization, accounts-at-scale, anti-cheat.
- 3D rendering (the original used Three.js; the rebuild's client renderer is
  **TODO(travis)** — 2D canvas/SVG hex grid is the simpler starting point).

Listing these as non-goals is not "never" — it's "not in the slice."

## Deferred / undecided from the original design

These exist in the archived design but haven't been re-committed to for the
rebuild. Tracked here so they aren't silently lost:

- Unit taxonomy naming ("Assets"? "Entities"?) and full unit list (Probe,
  Relay, Outpost, Site subtypes).
- Movement model specifics: turn-based vs real-time tick cadence, travel
  costs, space lanes, persistent drift.
- FTL tiers, relay chains, wormholes.
- Territory Path Rule (contiguous-influence-only).
- Tile trait catalog (Nebula, Void, Gravity Well, Anomaly) and their exact
  effects.
- Deep-space beaconing / messaging.

## Glossary

| Term | Meaning |
|------|---------|
| **Unit** | Base object type; ships, bases, structures all derive from it. |
| **Colony** | A player's collection of units; their first foothold, grows into territory. |
| **Territory** | Tiles under a player's influence; drives expansion and leaderboard score. |
| **Base** | Stationary unit that establishes presence and projects an influence radius. |
| **Ship** | Mobile unit for exploration, transport, or combat. |
| **Site** | Economy/science unit (Mining Site, Research Site). |
| **Scan radius** | Tiles a unit/structure reveals through fog. |
| **Influence radius** | Tiles a base claims as territory. |
| **Tile trait** | Terrain modifier (nebula, void, gravity well, anomaly). |

## Open questions

Consolidated **TODO(travis)** list — good candidates for the first few specs
or the `/onboard` conversation:

1. Audience & ambition (portfolio vs friends vs public).
2. What's in the first playable slice?
3. Client renderer for the rebuild (2D canvas/SVG vs 3D).
4. Turn-based tick vs continuous real-time.
5. How big is the galaxy at launch (full ~7,650 tiles vs smaller)?
6. Single persistent galaxy vs multiple game instances/rooms.

## Provenance

- Original gameplay design: `git show bf9c637:client/docs/Gameplay.mdc`
- Rebuild context & stack: `CLAUDE.md`
- Per-feature specs: `docs/specs/`

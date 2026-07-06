---
number: 0002
title: Galaxy view (galactic graph UI)
status: draft   # draft | accepted | implemented | superseded
created: 2026-07-06
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0002 — Galaxy view (galactic graph UI)

> Render the generated galaxy (#0001) as an interactive, WebGraph-style 3D
> force-directed graph — the strategic-layer screen where players navigate
> systems under fog — with a left intel panel and a right system inspector.

## Problem / motivation

Spec #0001 produces the galaxy *data* but nothing draws it; the app's default
view is still the Volt placeholder (`frontend/app/page.tsx`). The **galactic
view is the game's primary screen** — the top half of the two-tier map
(`../vision.md`) and step 2 of the first vertical slice — and it's where the
**frozen start area** is shown to logged-out visitors (`../vision.md` → Auth &
onboarding stance). It also has to *feel great*: the reference is kitakita's
**WebGraph** (`../plans/canvas/README.md` + screenshot; live demo
`webgraph.kitaaura.com`) — a dark, glowing 3D force-graph. This spec turns
#0001's `(x,y,z)` systems + lanes into that interactive view.

## Goals

- Render systems as **nodes** and lanes as **edges** in an interactive **3D
  force-directed graph**, fed by #0001 data (`(x,y,z)` as seed positions).
- **Camera controls** — pan, zoom, orbit/rotate.
- **Select a system** → a right-hand **inspector** shows its details (name,
  region, connections).
- A left **intel panel** — galaxy / player summary + stat tiles (repurposing
  WebGraph's "Site Intel" / "Live Stats" pattern).
- Apply **fog of war** to the view: undiscovered systems render dim/hidden from
  a per-system visibility flag (the fog *rules* are a later spec; this view just
  consumes the flag).
- Serve the **frozen start area** to logged-out visitors in the same view —
  static/cached data, persistent/multiplayer actions gated behind sign-in.
- Match the WebGraph **aesthetic** (dark, glowing nodes, colored edges) within
  the Hexaverse **Catalyst + Tailwind** design system.
- **Replace** the placeholder `frontend/app/page.tsx` as the primary view.

## Non-goals

- **Drilling into a system** (the hex board) — its own later spec; this view
  *selects and inspects* only.
- **Fog rules** — how visibility is computed (scan radius, etc.) is a separate
  spec; here we consume a stubbed `discovered` flag.
- **Acting on the graph** (moving ships, building, market) — later; the slice's
  "act" happens on the hex board.
- **WebGraph's app-specific features** — the replay/timeline scrubber, JSON
  export, and URL-scan input are website-scanner concerns, not Hexaverse.
- **Full layout-toggle set** — Organic / 3D / Sphere / Radial / Tree are
  nice-to-have; ship one good default first (Open question #2).
- **Live multiplayer / SSE updates** into the view — static-ish first; realtime
  later.
- **Minimap & search** — defer unless nearly free.

## Proposed approach

A Next.js **client component** in the Hexaverse stack. Galaxy data arrives via a
React Query hook → galaxy service → `apiClient` → the #0001 read API. Catalyst
provides the panel/control chrome; a WebGL force-graph library provides the
canvas.

1. **Graph canvas.** Build on **`react-force-graph-3d`** (the three.js-based
   `3d-force-graph`) — the library family that produces the WebGraph look. Feed
   it nodes (`{id, x, y, z, region, name, discovered}`, using #0001 coordinates
   as initial positions) and links (`{source, target}`). Node color/size keyed
   to `region`; edges styled per lane.
2. **Panels flank the canvas** (the screenshot layout): left **intel panel**
   (galaxy summary + stat tiles), right **inspector** (empty state → populates
   on node-select). Catalyst-styled overlays.
3. **Fog.** Read a per-system `discovered` flag; undiscovered systems render
   dim/hidden. Stubbed all-discovered in the start area until the fog spec.
4. **Logged-out path.** Same component fed the **frozen start-area** dataset
   (static/cached, never hits live generation); interactive but non-persistent,
   with a sign-in prompt at the gated boundary.
5. **Wire it in** as the primary authed view and the logged-out landing,
   replacing the placeholder page.

## Design details

- **Layering** (per `frontend/CLAUDE.md`): `components/galaxy/GalaxyView`
  (client) → `hooks/use-galaxy` (React Query) → `lib/services/galaxy` →
  `apiClient` → backend galaxy read API (#0001). Query-key factory entry for the
  galaxy fetch.
- **Library:** `react-force-graph-3d` (three.js). Nodes carry #0001 coordinates;
  links reference system ids. (Verify bundle size / SSR handling — dynamic
  import, client-only.)
- **Styling:** Catalyst components for panels, pills, stat tiles; the repo color
  system (no raw hex — extend the palette with region colors per
  `frontend/CLAUDE.md`).
- **Fog contract:** `discovered: boolean` per system for now; real visibility
  payload defined by the fog spec.
- **Performance:** hundreds of nodes (#0001 scale) render comfortably in
  `3d-force-graph` without level-of-detail.
- **Testing:** `data-testid`s on interactive controls; vitest for hook/service;
  component renders against mock galaxy data (per the `/check` harness).

## Acceptance criteria

- [ ] An authed user sees the live galaxy (#0001 data) as an interactive 3D
      force graph and can **pan / zoom / orbit**.
- [ ] Clicking a system **selects** it and the **inspector** shows its details
      (name, region, connections).
- [ ] The left **intel panel** shows galaxy / player summary stats.
- [ ] Undiscovered systems render **dim/hidden** from the `discovered` flag
      (rules stubbed).
- [ ] **Logged-out** visitors see the frozen start-area galaxy in the same view;
      persistent/multiplayer actions prompt sign-in.
- [ ] The view **replaces** `frontend/app/page.tsx`.
- [ ] Visuals match the WebGraph reference within the Catalyst/Tailwind system
      (dark, glowing nodes, colored edges).
- [ ] vitest covers the hook/service; the component renders with mock data.

## Open questions

1. **Integration strategy** *(Travis)* — build on the underlying force-graph
   library (`react-force-graph-3d` / three.js) using WebGraph purely as *visual
   reference* (**recommended** — avoids inheriting a website-scanner app and its
   license/maintenance), vs. **fork/vendor** kitakita's WebGraph directly.
   → **leaning "same library, our UI."** *Gating task: confirm WebGraph's
   license and its actual renderer before locking this.*
2. **Layout toggles** *(Travis)* — ship one good default (3D organic) for the
   slice, or the full Organic/3D/Sphere/Radial/Tree set? → **leaning one now.**
3. **Drill-in affordance** *(Travis)* — does node-select also surface an "enter
   system" action now (stubbed, → hex-board spec), or is that fully deferred?
4. **Fog stub shape** *(dev)* — confirm `discovered: boolean` per system as the
   interim contract until the fog spec defines the real payload.

## References

- #0001 — Galaxy generation (produces the nodes/edges this renders).
- `../vision.md` — two-tier map; Auth & onboarding stance (frozen start area).
- `../plans/BRAINSTORM.md` — galactic view (WebGraph), left/right panel pattern.
- `../plans/canvas/README.md` + `Screenshot 2026-07-02 at 10.37.18.png` — the
  WebGraph visual reference (kitakita; `webgraph.kitaaura.com`).
- `frontend/CLAUDE.md` — component→hook→service→apiClient layering, color
  system, Catalyst-only UI.

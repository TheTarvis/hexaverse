---
number: 0002
title: Galaxy view (galactic graph UI)
status: accepted   # draft | accepted | implemented | superseded
created: 2026-07-06
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0002 — Galaxy view (galactic graph UI)

> Render the generated galaxy (#0001) as an interactive, WebGraph-style 3D
> force-directed graph — the strategic-layer screen where players orbit around
> systems under fog — with a left intel panel and a right system inspector.

## Problem / motivation

Spec #0001 produces the galaxy *data* but nothing draws it; the app's default
view is still the Volt placeholder (`frontend/app/page.tsx`). The **galactic
view is the game's primary screen** — the top half of the two-tier map
(`../vision.md`) and step 2 of the first vertical slice — and it's where the
**frozen start area** is shown to logged-out visitors (`../vision.md` → Auth &
onboarding stance). It also has to *feel great*: the reference is
kitakitaaura's **WebGraph** (`github.com/kitakitaaura/webgraph`, MIT; screenshot
in `../plans/canvas/`; live demo `webgraph.kitaaura.com`) — a dark, glowing
force-graph. WebGraph is a **pure visual reference**, not a codebase we build on
(it's a bespoke 2D-`<canvas>` renderer — see Findings). This spec turns #0001's
`(x,y,z)` systems + lanes into that interactive view.

## Goals

- Render systems as **nodes** and lanes as **edges** in an interactive **3D
  force-directed graph**, fed by #0001 data (`(x,y,z)` rendered natively as
  positions).
- **Camera controls** — the decided **RTS pan-orbit** model (Decision #8):
  orbit, ground-plane pan, zoom over the Z-up disk (reading depth/distance from
  any angle is a first-class requirement, not a nice-to-have).
- **Select a system** → a right-hand **inspector** shows its details (name,
  region, connections, and its **major-body inventory** — the free "skeleton" of
  #0001 Decision #9 / `../plans/fog-of-war.md` "option (a)"; always visible, not
  fogged).
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
- **Layout toggles (Sphere / Radial / Tree)** — artifacts of the WebGraph
  reference, whose nodes have *no real coordinates*, so it offers alternate
  arrangements. Hexaverse renders #0001's true `(x,y,z)`, where on-screen
  distance *is* in-game distance; re-arranging would discard that meaning.
  Organic-native is the only layout that applies — not deferred, **N/A**
  (Decisions).
- **Live multiplayer / SSE updates** into the view — static-ish first; realtime
  later.
- **Minimap & search** — defer unless nearly free.

## Proposed approach

A Next.js **client component** in the Hexaverse stack. Galaxy data arrives via a
React Query hook → galaxy service → `apiClient` → the #0001 read API. Catalyst
provides the panel/control chrome; a WebGL force-graph library provides the
graph.

1. **Graph canvas.** WebGraph is itself a bespoke 2D-`<canvas>` renderer (~2.3k
   lines of vanilla JS — see Findings), so we match its *look*, not its code.
   Adopt **`react-force-graph-3d`** (the three.js-based `3d-force-graph`) for
   genuine orbit + depth (Decisions). Crucially, the glow needs **no shaders and
   no bloom pass**: bake WebGraph's radial-gradient into a **sprite texture** and
   draw nodes with **additive blending** (a sharp core sprite + a softer halo
   sprite keeps dense clusters from blowing out to white). Feed it nodes (`{id,
   x, y, z, region, name, discovered}`, pinned to #0001 `(x,y,z)` via `fx/fy/fz`)
   and links (`{source, target}`). Node color/size keyed to `region`; edges
   styled per lane; three.js supplies orbit controls, zoom, and click-picking.
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
- **Library:** `react-force-graph-3d` (three.js); WebGraph is visual reference
  only. Nodes pinned to #0001 `(x,y,z)` (`fx/fy/fz`, `cooldownTicks={0}`) so
  orbit reveals the real generated structure rather than a re-solved layout.
  Glow authored as additive **sprite textures** (radial gradient baked to a
  canvas texture — no shader, no bloom pass). Deps: `react-force-graph-3d`,
  `three`, `@types/three`. (Dynamic import, client-only; the glow texture is a
  lazy singleton guarded against SSR since it needs `document`.) **Bundle:**
  three.js is a heavy dependency — the client-only dynamic import keeps it
  code-split off the SSR/initial-render path; watch its weight and the
  `npm audit` gate for its transitive deps.
- **Selection & labels:** three.js has no cheap "ring" like the 2D canvas did —
  indicate selected/hovered systems by brightening/scaling the node sprite (or an
  outline sprite). System names show via `react-force-graph-3d`'s `nodeLabel`
  hover tooltip for the slice; a persistent, collision-managed label layer is
  deferred.
- **Read-API contract** (pinned here per Decisions). One read fetches the whole
  graph; the live authed path and the logged-out static asset return the **same
  shape**, aligned with #0001's persistence model (`System`/`Lane`):
  - `GET /v1/galaxy` — the live galaxy (authed).
  - `/galaxy/start-area.json` — the frozen start area, a static/cached asset
    generated once from #0001's fixed start-area seed (its Decision 3); never
    hits live generation.

  ```jsonc
  {
    "id": "gal_…", "seed": 0,
    "bounds": { "x": [-520, 520], "y": [-520, 520], "z": [-90, 90] },
    "systems": [
      { "id": "sys-0", "coords": { "x": 12.3, "y": -8.1, "z": 4.0 },
        "name": "Axion", "region": "star_rich", "discovered": true,
        // major-body skeleton (#0001 Decision #9) — always visible, drawn in the inspector
        "skeleton": { "starClass": "G",
          "bodies": [ { "type": "rocky", "ring": 3 }, { "type": "gas_giant", "ring": 9 } ] } }
    ],
    "lanes": [ { "id": "lane-0", "aId": "sys-0", "bId": "sys-12" } ]
  }
  ```

  The **galaxy service layer** adapts this to the renderer's node/link shape —
  flattening `coords` → `{x,y,z}` and mapping `aId`/`bId` → `source`/`target` —
  so the backend stays coupled to #0001, not to `react-force-graph-3d`. **Node
  size** is derived from `region` in the view (star-rich largest → dead
  smallest); the wire carries no importance field for the slice (the spike's
  `val` was mock-only). `bounds` seeds the initial `zoomToFit`; `seed`/`id`
  pass through for debugging, not rendered.
- **Auth gating:** the app currently redirects unauthenticated users off every
  non-public route to `/login` (`components/layout-wrapper.tsx`, `PUBLIC_ROUTES`).
  Serving the galaxy as the **logged-out landing at `/`** therefore requires
  making the home route public and having the view render in a logged-out mode
  (the spike used a temporary `/spike` allowance — revert it when the spike is
  removed).
- **Styling & colors:** panels, pills, and stat tiles use Catalyst + the repo
  Tailwind color system. The **graph layer is the exception**: three.js sprite /
  line materials take color *strings*, not Tailwind classes, so region colors
  live as a small raw-value palette constant (gold star-rich, sky normal, slate
  dead, magenta barrier) — a deliberate, isolated exception to the no-raw-hex
  rule the `/check` color validator enforces. Keep that palette in one module
  shared by the graph and the panel region-dots.
- **Camera & input** (folded from `../plans/camera-and-input.md` 2026-07-09,
  where the full rationale + gotcha war stories live — Decision #8):
  - **RTS pan-orbit over the disk, world up = Z.** The XY disk is the ground;
    you hover above it. *Gotcha:* OrbitControls bakes its orbit basis from
    `camera.up` **in its constructor** — the real view must own its camera
    (own OrbitControls/MapControls config or a hand-rolled rig), not reach
    into force-graph internals the way the spike pokes `_quat`.
  - **Ground-plane pan moves the focus** (`screenSpacePanning = false`), with
    pan speed scaled by the camera's **height** above the disk, not slant
    distance (distance-scaling goes "too glidy" at grazing pitch). Panning
    inward is how you "look toward the centre."
  - **Pitch unclamped, full pole-to-pole** — a "never under the disk" clamp
    was tried and rejected (the invisible mid-tilt stop felt arbitrary).
    **Zoom = dolly** (range clamp still to tune); **damping on** so trackpad
    inertia reads as a glide.
  - **Gesture map (trackpad-first):** one-finger / left-drag = **orbit**;
    two-finger swipe = **pan** (capture-phase wheel listener routes plain
    `wheel` → pan, `ctrl+wheel` (pinch) falls through → zoom); click =
    **select**, with a click-vs-drag threshold so camera and selection never
    fight. Mouse-wheel users currently get pan-not-zoom — a delta-shape
    heuristic is deferred until mouse support matters; touch-screen deferred.
  - **Focus & recenter:** double-click a system → glide it to centre
    preserving angle/zoom; a **⌖ recenter** control snaps to the fleet with
    the standard oblique framing. Default framing = spawned on the rim,
    looking inward across the disk.
  - Still open, decide while building (tracked in the plan doc): auto-follow
    vs. manual recenter, pan bounds, zoom-all-the-way-in as the board-tier
    handoff, keybindings (WASD/Q/E/F/Esc).
- **Fog contract:** `discovered: boolean` per system for now; real visibility
  payload defined by the fog spec.
- **Performance:** hundreds of nodes (#0001 scale) render comfortably in
  `3d-force-graph` without level-of-detail — the spike (~276 nodes / 522 lanes)
  rendered instantly, comfortably the safe side of the old single-map hex-count
  wall.
- **Testing:** `data-testid`s on interactive controls; vitest for hook/service;
  component renders against mock galaxy data (per the `/check` harness).

## Acceptance criteria

- [ ] An authed user sees the live galaxy (#0001 data) as an interactive 3D
      force graph and can **orbit / pan / zoom** per the decided camera model
      (Decision #8): Z-up RTS pan-orbit, height-scaled ground-plane pan,
      unclamped pitch, damping on.
- [ ] The gesture map holds: one-finger/left-drag orbits, two-finger swipe
      pans, pinch zooms, click selects — and a drag never selects, a click
      never moves the camera.
- [ ] **Double-click a system** glides it to centre preserving angle/zoom;
      the **⌖ recenter** control snaps to the fleet's standard framing.
- [x] Clicking a system **selects** it — indicated **on the graph** (highlight),
      not only in the inspector — and the **inspector** shows its details
      (name, region, connections).
- [x] The left **intel panel** shows galaxy / player summary stats.
- [x] The inspector shows a selected system's **major-body inventory** (skeleton) —
      always visible, not gated by `discovered` (Decision #7).
- [x] Undiscovered systems render **dim/hidden** from the `discovered` flag
      (rules stubbed).
- [x] **Logged-out** visitors see the frozen start-area galaxy in the same view;
      persistent/multiplayer actions prompt sign-in.
- [x] The view **replaces** `frontend/app/page.tsx`.
- [ ] Visuals match the WebGraph reference within the Catalyst/Tailwind system
      (dark, glowing nodes, colored edges).
- [x] vitest covers the hook/service; the component renders with mock data.

## Findings (2026-07-06)

Resolves Open question #1's gating task (inspected `github.com/kitakitaaura/webgraph`):

- **WebGraph is a bespoke 2D-`<canvas>` renderer**, not a force-graph library:
  one `app.js` (~2,284 lines of vanilla JS) drawing to `getContext("2d")` with
  its own `requestAnimationFrame` loop — no three.js, no `d3-force`, no
  React/Next. The 3D-ish look is depth-shaded 2D projection. Its `index.html`
  already ships layout toggles (Organic/…) and a mini-map: the mini-map this
  spec defers (Non-goals); the toggles **don't apply** — WebGraph needs them
  precisely because its nodes have no real coordinates, whereas ours do
  (Decisions / Non-goals).
- **License: MIT** — vendoring is legally open if we ever want the exact look.
- **Net:** there is **no shared library** to adopt *from* WebGraph; it's a pure
  *visual* reference. WebGraph being 2D means its *look* doesn't force a 3D
  renderer — but it doesn't preclude one either, and orbit/depth do (see
  Decisions).

## Decisions (2026-07-06)

1. **Renderer → `react-force-graph-3d` (three.js).** Resolves Open question #1,
   validated by a working spike (`frontend/app/spike/galaxy-3d/`; screenshots in
   the session scratchpad). *We first leaned 2D* (`react-force-graph-2d`) on the
   reasoning that WebGraph is itself 2D and 2D-canvas glow needs no shaders — but
   two things flipped it: (a) **orbit/depth turned out to be a firm requirement**
   — reading distance/structure from other angles is core to a *space* map, not a
   nice-to-have; and (b) the shader worry was unfounded — the glow ports to 3D as
   **additive sprite textures** (same radial gradient, no shader, no bloom pass),
   which the spike confirmed looks right. three.js also gives orbit, zoom, and
   click-picking for free. (The 2D spike was removed once 3D was chosen; the 3D
   spike is retained until the real view is built out into the app.)
2. **#0001's 3D data is rendered natively.** Systems' `(x,y,z)` (distance, travel
   cost, noise field) are the render positions directly — no projection. This
   *fulfils* #0001's "true 3D view," rather than trading it away.
3. **Layout → organic-native only, permanently** (resolves Open question #1,
   *Travis*). Not "one first, others later" — the Sphere/Radial/Tree toggles are
   artifacts of the WebGraph example (whose nodes have no real coordinates).
   Hexaverse's nodes carry #0001's true `(x,y,z)`, so alternate arrangements
   would *discard* meaning rather than add a view. There is one layout and there
   only ever will be.
4. **Drill-in fully deferred** (resolves Open question #2, *Travis*). No "enter
   system" affordance in this slice — not even a stubbed/disabled button. The
   inspector shows details + connections only; the drill-to-hex-board action
   arrives with the hex-board spec.
5. **Fog stub → `discovered: boolean` per system** (resolves Open question #3,
   *dev*). Interim contract until the fog spec defines the real per-player
   visibility payload; undiscovered systems render dim/hidden.
6. **Read-API contract pinned here** (resolves Open question #4, *dev*) — in this
   view's service layer, not a shared #0001 addendum. Concrete response shape and
   start-area asset format specified under Design details → "Read-API contract."
7. **The inspector draws the major-body inventory (2026-07-09).** Per #0001's
   Decision #9 / `../plans/fog-of-war.md` "option (a)," each system's payload carries
   a **skeleton** (star class + major-body list + rings) that is the **free
   astronomical layer** — *"star + 4 planets + a gas giant"* — shown in the inspector
   and available as an optional node size/detail hint. It is **not** gated by
   `discovered`; only the *detail* (resource/hazard *worth*, the later drill-in) is
   earned. Survey/worth stays hidden until the fog spec.
8. **Camera & input folded in from `../plans/camera-and-input.md` (2026-07-09,
   *Travis*).** The camera model was brainstormed, decided, and spike-proven in
   that doc (RTS pan-orbit, Z-up, height-scaled ground-plane pan, unclamped
   pitch, the trackpad gesture map, double-click focus, ⌖ recenter) — it
   **folds into this spec as its camera remit** rather than becoming its own
   spec: what grew was decidedness, not scope, and it's the input model of
   exactly one view. Summary under Design details → "Camera & input"; the plan
   doc keeps the rationale and the remaining decide-while-building questions.
   Closes the BACKLOG "Camera & input" row.

## Open questions

*None outstanding* — the original four resolved 2026-07-06, camera & input
folded in 2026-07-09 (see Decisions). The camera's decide-while-building
items (auto-follow, pan bounds, tier-handoff zoom, keybindings) are tracked
in `../plans/camera-and-input.md`, not blockers here.

## References

- #0001 — Galaxy generation (produces the nodes/edges this renders).
- `../plans/camera-and-input.md` — the decided camera/input model this spec
  absorbs (Decision #8); rationale, spike gotchas, remaining feel questions.
- `../vision.md` — two-tier map; Auth & onboarding stance (frozen start area).
- `../plans/BRAINSTORM.md` — galactic view (WebGraph), left/right panel pattern.
- `../plans/canvas/README.md` + `Screenshot 2026-07-02 at 10.37.18.png` — the
  WebGraph visual reference (kitakitaaura; live demo `webgraph.kitaaura.com`,
  source `github.com/kitakitaaura/webgraph`, MIT).
- `frontend/CLAUDE.md` — component→hook→service→apiClient layering, color
  system, Catalyst-only UI.

> Historical numbered-spec snapshot, archived 2026-10-16. Original source:
> [docs/specs/0007-hex-board-view.md](../../../specs/0007-hex-board-view.md). Old status/scenarios are provenance,
> not current instructions or live implementation work. Current owners are in
> [canonical documentation](../../../README.md).
> Plain-text relative paths retain the original source context.

---
number: 0007
title: Hex Board View (system renderer)
status: accepted   # draft | accepted | implemented | superseded
created: 2026-07-09
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0007 — Hex Board View (system renderer)

> **Recorded, not decided (2026-09-04, openspec `delete-the-lattice`).** The
> hex board this document specifies is gone: `frontend/lib/board` and
> `frontend/lib/polar` are deleted and the system view renders continuous
> space (`frontend/components/space/`). Its status is deliberately left
> `accepted` — the `docs/specs/` series is Travis's artifact and its
> supersession policy is his.
>
> Unlike `0004-movement-board.md`, this document declares **no** `### S`
> scenarios, so nothing in `frontend/lib/spec-scenarios.test.ts` cites it and
> retiring it would break nothing. **Open question for Travis:** mark it
> `superseded` (pointing at the openspec `system-space-view` capability), or
> keep it as the historical record of the renderer that shipped first?

> The **tactical-tier client**: an SVG hex board rendering one system's fogged
> interior — bodies gliding on computed orbits, the three visibility bands
> styled legibly, and the select → preview → commit gesture for the slice
> verbs (move, scan, mine). The companion to **#0003** the way **#0002** is
> the companion to **#0001**, one tier down.

## Problem / motivation

`../vision.md` step 4 is "drill into a system → its hex board," and step 5 —
*do one satisfying thing* — happens entirely on this surface. The world model
is now spec'd end to end (#0003 generates the interior, #0004 moves fleets
across it, #0005 resolves their actions, #0006 fogs it per player), but none
of it is *visible*: there is no production component that draws a system,
animates its orbits, or lets a player point at a body and act. The
`frontend/app/spike/hex-board/` prototype proved the feel — orbits, fog
bands, intercept previews — but it's a throwaway with hardcoded state, no
backend, and none of the frontend conventions (`frontend/CLAUDE.md`).

The renderer decision itself is settled (`../plans/hex-board.md`, BACKLOG ⬜
→ **SVG**); this spec turns the spike's proven feel into the production
view: server data in, fogged solar system out, verbs usable.

## Goals

- **Reads as a solar system, not an abstract grid**: star at center,
  concentric ring bands, bodies clustered in mostly-empty space (radius ~16,
  ~800 tiles).
- **SVG renderer** — one `<polygon>` per hex: free click handlers, crisp at
  any zoom, trivial fog overlays, composes with Catalyst/Tailwind. No canvas,
  no WebGL at this tier.
- **The board turns**: body and coasting-fleet positions are **computed
  client-side from `(elements, worldTime)`** using the server-time offset
  (#0005) — no position polling. **Logic quantized, visuals interpolated**:
  every rules-facing readout uses the integer logical hex; the glyph glides.
- **The three fog bands are legible at a glance** (#0006): astronomical layer
  dim-but-drawn from arrival; live content styled live; **Remembered ghosts
  keep orbiting** with their activity frozen and an "as of" age visible.
- **One gesture for every verb** (#0004 Decision #7): select → live preview
  (route, led intercept point, ETA) → commit; commit clears the selection;
  clicking a selected thing deselects it.
- **The slice verbs work here**: order a move (hex or body target), scan,
  mine, and **depart via a lane gate** (#0008's trip, burn-to-gate leg 0
  included) — each committing through the layered stack and self-scheduling
  its ETA refetch (#0005 client rules).
- **Server data only**: the view renders exactly the fogged projection the
  backend returns — it never receives, caches, or infers world state the
  player hasn't earned.
- **House conventions**: component→hook→service→apiClient layering, React
  Query with the query-key factory, Catalyst-only UI, the color system,
  `data-testid` on interactive elements, vitest coverage.

## Non-goals

- **Generation** (#0003) and **fog logic** (#0006) — the view *renders* the
  fogged read; it computes no visibility and rolls no content.
- **Movement solving** (#0004) — the server's order is canonical; the client
  evaluates the shared math only for the non-authoritative live preview.
- **The galaxy view** (#0002) — this spec starts at drill-in; the
  graph-tier camera work (`../plans/camera-and-input.md`) is #0002's remit.
- **3D** — decided against at this tier; the graph view carries the heavy-viz
  load, the board stays lightweight DOM.
- **Combat, market, build UI** — future verbs get panels when their specs
  land.
- **Multi-tile bodies, quick-sweep vs. deep-scan as separate UI** — slice
  collapses to one scan action (#0006); refine later.
- **Mobile-first polish** — desktop browser first; touch gestures later.

## Proposed approach

A route under the App Router (`/systems/[systemId]` shape) hosting one
client component tree:

1. **The board query** — a hook wraps the fogged system read (#0003 surface,
   filtered by #0006): the astronomical skeleton, the requester's remembered
   features, live content in their sensor union (flagged `live: true`), the
   requester's fleets with movement state, and `worldTime`. React Query
   caches it; the three #0005 refetch rules (SSE reconnect, own-ETA
   self-schedule, gentle poll while open) keep it honest.
2. **The clock** — a `worldTime` hook computes the server-time offset once
   per response and drives a `requestAnimationFrame` loop; every animated
   element derives its position from `(elements, offsetNow)` — the spike's
   `orbState`/`shipPosAt` promoted to a shared frontend lib module (the same
   math the backend evaluates authoritatively, #0004).
3. **The grid** — an SVG viewport (pan/zoom on the group transform) drawing
   the hex lattice once, ring-band tinted; features and fleets are glyph
   layers above it. Interpolation glides glyphs between hexes; the logical
   hex (selection, targeting, readouts) flips at the halfway point —
   **quantize the simulation, interpolate the picture**.
4. **Fog styling** — band treatments from the spike: astronomical bodies dim
   until earned; live activity full-color; remembered features ghosted at
   their *current computed* orbital position with a frozen-activity badge
   ("340u — as of 2h ago", from `asOf`). Unseen small/dark simply isn't in
   the payload.
5. **Selection & verbs** — one selection state; selecting a destination hex
   or body renders the live preview (path, led meet point tracking as the
   world turns, ETA); commit POSTs the order through the fleet/scan/mine
   service functions and clears selection. **Lane gates** render as fixed
   glyphs at their rim tiles (the system's charted lanes — always known
   in-system, #0008); selecting one offers **depart**, which previews the
   burn to the gate and commits the #0008 trip. An intel/facts panel (the
   spike's KNOWN FACTS) shows what the selected thing is known to be, with
   its `asOf` age.

## Design details

- **Where it lands** (`frontend/CLAUDE.md` layering):
  - `app/systems/[systemId]/page.tsx` — the route; drill-in navigation from
    the #0002 graph view (`click a node → its board`).
  - `components/board/` — `HexBoard` (SVG viewport + lattice), `FeatureGlyph`,
    `FleetGlyph`, `FogTreatment`, `SelectionPreview`, `FactsPanel` — Catalyst
    primitives for all chrome.
  - `hooks/` — `useSystemBoard(systemId)` (query-key factory entry),
    `useWorldTime()` (offset + rAF clock), `useFleetOrders()` /
    `useScan()` / `useMine()` (mutations that invalidate via the factory and
    self-schedule the ETA refetch).
  - `services/` — board read + order/scan/mine calls through `apiClient`
    (token attach/refresh; **no raw fetch** anywhere).
  - `lib/hex/` — axial/cube math, ring walks, interpolation, `orbState`,
    `shipPosAt`, intercept preview — pure, vitest-covered, shared with
    nothing server-side (the Go backend has its own copy; determinism is
    asserted by contract tests against recorded fixtures, not shared code).
- **SVG structure**: one static lattice group (`<polygon>` per hex, ring-band
  class), one overlay group per concern (fog tint, selection highlight,
  preview path, glyphs). Pan/zoom = transform on the root group (wheel +
  drag; pinch later). At radius ~16 (~817 tiles + a few dozen glyphs) this
  is comfortably within DOM budget — the spike confirms it.
- **Animation discipline**: the rAF loop mutates transforms only (no React
  re-render per frame); React state changes on discrete events (selection,
  data refetch, logical-hex flips that affect UI text). Motion-agnostic:
  with #0003 orbits off/slow (the slice), the same code renders a
  near-static board — motion is the flag upstream, not a renderer mode.
- **Fleet rendering by movement state** (#0004): `coast` — glyph rides its
  orbit, nose along velocity; `burn` — glides along the order path by
  `(worldTime − startTime)/(arriveTime − startTime)`, with the committed
  route drawn; `docked` — attached to the parent glyph. Other players'
  fleets render from the fogged read only (snapshots — no path, no ETA;
  #0006 audience rules).
- **Scan bubble rides the ship** (#0006): the requester's ambient radius is
  drawn from each unit's live position; the bubble moves with the glyph.
- **ETA self-scheduling**: committing any action arms a timer at
  `eta − offsetNow` that invalidates the board query (rule 2 of #0005's
  client contract); SSE reconnect and the gentle open-board poll cover the
  rest (rules 1 and 3).
- **Entry framing**: on drill-in, the camera opens framing the player's rim
  entry position when they have a fleet present, else the full board —
  arrival reads as *arriving at the edge*, matching the fog direction
  (rim → inward).
- **Testing**: vitest for `lib/hex/` (quantization halfway-flip, ring wrap,
  interpolation endpoints, intercept preview against fixtures) and hook
  wiring; Playwright e2e (`frontend/e2e/`) for the slice loop — drill in,
  order a move, scan, mine, observe fog states — against the isolated test
  stack with a fast worldTime `scale`.
- **`data-testid`** on every interactive element (tiles, glyphs, commit
  controls, facts panel) per the changed-file validators; colors from the
  approved system only.

## Acceptance criteria

> **M7 landed the core (2026-07-10):** the drill-in board, animation, fog
> bands, move+scan verbs, the three refetch rules, and fleet rendering. The
> boxes that depend on later rungs stay open — **gates + depart** (#0008/M8),
> **mine** (#0010/M10), and the **full slice e2e** (M10). This spec flips to
> `implemented` at M8 when #0008 finishes it. Note: the "single backend read"
> is realized as two server-fogged reads that fan in (interior + the fleet
> layer, `GET /v1/fleets?systemId=`) — no unfogged data reaches the client.

- [x] Navigating from a #0002 graph node opens `/systems/[systemId]` and
      renders that system's **fogged** board from a single backend read; the
      response is the only world state the client holds (no unfogged data in
      any payload, store, or cache).
- [x] The board draws as **star-centered concentric rings** at radius ~16
      with ring-band tinting; hexes are individually clickable SVG polygons.
- [x] Bodies and coasting fleets **animate from `(elements, worldTime)`**
      via the server-time offset — no position refetching; a paused network
      still animates correctly between reads.
- [x] **Quantized logic, interpolated visuals**: glyphs glide (including the
      ring wrap-around) while selection, targeting, and all readouts use the
      integer logical hex, flipping at the halfway point.
- [x] The **three bands render distinctly**: astronomical layer visible-but-
      dim from arrival; live content marked live; remembered features ghosted
      at their current computed orbital position with a frozen `asOf` age.
      Unseen content is absent, not hidden.
- [ ] **Select → preview → commit** works for: move-to-hex (route + ETA),
      move-to-body (led intercept point that tracks as the world turns +
      ETA), scan, mine, and depart-via-gate (burn-to-gate preview + trip
      ETA, the #0008 order); commit clears selection; clicking a selected
      target deselects. *(M7: move-to-hex, move-to-body, scan done; mine
      lands M10, depart-via-gate M8.)* Move routes **around the star**
      (#0004 `RouteAround`) and the **star at the core is not a movable
      target** — selecting it offers no Move and the facts panel says why
      (you can't fly onto `(0,0)` or dock a sun).
- [ ] The system's **lane gates** render at their fixed rim tiles (#0008
      geometry) for any player in-system, entry gate included. *(M8.)*
- [x] Committing an action **self-schedules a refetch at its ETA**, and the
      view refetches on SSE reconnect and polls gently while open (the three
      #0005 rules — observable in tests).
- [x] A **burning own-fleet** renders its committed path and glides along
      it; **other players' fleets** render only what the fogged read
      contains (snapshot position — never a path or ETA).
- [x] The scan bubble is drawn from each own-unit's **live** position and
      moves with it.
- [ ] `lib/hex/` math is pure and vitest-covered (quantization, wrap,
      interpolation, intercept preview vs. fixtures); the e2e slice loop
      (drill in → move → scan → mine → fog states) passes on the isolated
      test stack. *(M7: `lib/hex/` pure + covered; the full slice e2e is M10.)*
- [x] Layering holds: no raw `fetch`, all reads/mutations through
      service functions + the query-key factory; Catalyst-only chrome;
      color-system compliant; `data-testid` on interactive elements
      (`/check` clean).
- [ ] **Slice bar:** a player can drill in, watch the system turn, order a
      move, scan a body, mine it, close the tab, come back after the ETA,
      and see the completed result — without a manual refresh — then depart
      via a lane gate back to the galaxy tier. *(Completes at M10.)*

## Decisions (imported from `../plans/hex-board.md`)

1. **SVG, not canvas/WebGL (the BACKLOG renderer ⬜, 2026-07-06)** — a
   bounded board is a perfect fit for per-hex DOM; canvas earns its
   complexity only at thousands of tiles or heavy per-frame load, which a
   chill board doesn't have.
2. **Radius ~16 (~817 tiles), density is the lever (2026-07-06)** — roomy,
   mostly-empty space with a few worlds; the radius-6 spike read as tight.
   Exact radius pins with generation tuning.
3. **Quantize the simulation, interpolate the picture (2026-07-07)** —
   discrete hopping read as jerky in the spike; gliding glyphs over integer
   logical hexes fixed it without letting continuous motion leak into rules.
4. **Positions are computed, never stored/polled** — the client evaluates
   the same deterministic functions the server owns authoritatively (#0004's
   "send elements, evaluate both ends").
5. **Sensors move with the sensor (2026-07-07)** — coverage is drawn from
   live unit positions, not fixed points.
6. **Select → preview → commit is one gesture (#0004 Decision #7)** —
   proven in the spike; preview is live and moves nothing.
7. **The spike is the feel reference, not the code base** — production
   reuses its math and visual treatments but is rebuilt on the layered
   stack (`frontend/CLAUDE.md`).

## Open questions

- **Quantization legibility** — does the glide hide the grid too well? A
  faint per-hex tick as a body crosses a boundary is the candidate fix.
  Owner: Travis; decide by feel during build.
- **Board-tier camera scope** — wheel-zoom + drag-pan is the slice; is
  anything more (keyboard pan, zoom-to-selection, minimap) wanted before the
  camera work lands? Owner: Travis; default to the minimal set.
- **Sweep visualization** — if #0006 resolves board sweeps as
  bodies-touched (leaning), the preview draws highlighted bodies, not a
  disc; confirm together with that spec's rider.
- **Exact board radius** — pinned with #0001/#0003 generation tuning, not
  here.

## References

- `../plans/hex-board.md` — the board model, orbital motion, quantization
  rule, renderer decision.
- Related specs: **#0003** (the interior this draws; the companion spec),
  **#0004** (movement states + preview math + the one-gesture decision),
  **#0005** (worldTime offset, ETA self-scheduling, refetch rules),
  **#0006** (the fogged read; band semantics), **#0008** (lane gates on the
  rim; the depart verb this surfaces), **#0002** (drill-in navigation; the
  graph-tier sibling view).
- `frontend/app/spike/hex-board/` — the proven prototype (orbits, bands,
  intercept preview, KNOWN FACTS panel).
- `frontend/CLAUDE.md` — layering, query-key factory, Catalyst, colors,
  testing conventions; `frontend/e2e/README.md` — the isolated e2e stack.
- `../vision.md` — steps 4–5 of the slice; "graph = navigate, hex grid =
  act."

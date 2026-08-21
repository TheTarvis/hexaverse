## 1. Phase 0 — decisions already settled

- [x] 1.1 Frontend test-coverage validator exemption for
      `components/board/webgl/**` — already applied in
      `.claude/scripts/check-frontend-tests.sh`, verified.
- [x] 1.2 Rollout question (flag vs. straight swap) — decided: straight
      swap, no toggle (see `proposal.md`).
- [x] 1.3 The `board.spec.ts` tile-click assertion — decided: click the
      canvas at a computed point and assert the `Tile q, r` readout (task
      4.7 below implements it).
- [x] 1.4 The overlay coordinate space — decided: board coordinates under a
      camera-matched CSS 3D transform, at a fixed 14° tilt, with tilt-0 as
      the fallback of record (see design.md `### Decision: the overlay
      renders in board coordinates under a camera-matched CSS 3D
      transform`).

## 2. Extract, unchanged (design.md Migration Plan step 1)

- [x] 2.1 Move the seven production scene/render modules — `WebGLBoard.tsx`,
      `glsl-common.ts`, `instrument-pass.ts`, `scene-bodies.ts`,
      `scene-fleet.ts`, `scene-lattice.ts`, `scene-starfield.ts` — from
      `app/spike/webgl-board/` to `components/board/webgl/`, with no
      behavioural edits. This module holds GL plumbing only (context setup,
      buffer upload, shader source, the post chain, the render loop) and
      takes canvas-only inputs — it does NOT absorb `BoardSceneProps`'
      preview/overlay surface; hit shapes, testids, and previews are
      `BoardOverlay`'s (section 4), not this module's (see design.md
      `### Decision: the canvas/overlay component split`).
- [x] 2.2 Fold the `#define HEX …` shader prepend into the shader source
      string while moving `scene-lattice.ts`.
- [x] 2.3 Keep `/spike/webgl-board` rendering identically by importing from
      the new module path.

## 3. Real data, real motion, N fleets (design.md Migration Plan step 2)

- [x] 3.1 Feed `SystemBoard` from `useSystemBoard`; delete `mock-board.ts`
      and its test from the render path.
- [x] 3.2 Drive positions from `glyph-geometry` (`featureGlidePixel`,
      `fleetGlidePixel`, `fleetLogicalHex`, `fleetOnBoard`, `headingDeg`,
      `sensorBubbleHexes`), fed by `stateAt`/`useWorldTime`. Reuse it — do
      not reimplement; it is the Go↔TS determinism seam (two-pass
      moon-rides-parent resolution, burn→coast handoff).
- [x] 3.2a Verify (vitest) the production board's per-frame `elapsed`/
      `worldTime` come from `useWorldTime` (re-anchored on each fresh
      server read), not a locally integrated timer — this is what makes
      tab-backgrounding resume correct; pin it so a refactor cannot
      reintroduce integration drift.
- [x] 3.3 Read `band` off the wire (`BoardFeature.band`); delete the
      seeded-RNG band assignment. Never derive fog client-side.
- [x] 3.4 Rebuild fleets as a collection with add/remove lifecycle
      (`useBoardRealtime`/SSE brings fleets in and out mid-session);
      roster-driven inner draw; the own/foreign fork built in from the
      start (`roster` absent on foreign fleets). Delete `patrol.ts` **from
      the production render path only** — `app/spike/webgl-board/SvgBoard.tsx`
      still imports `patrolAt` from `./patrol` and survives until task 6.3,
      so `patrol.ts` and its test stay in place as a spike fixture until
      then; deleting the file itself here breaks `tsc` at the end of this
      step (see the Migration Plan preamble in design.md).
- [x] 3.4a Fleet-collection reconciliation disposes every removed fleet's
      GPU resources and detaches its `group` on the SAME roster update that
      drops it — not only on unmount or system change. Covered by (a) a
      pure vitest case for the id-diff function, no GL context; (b) a
      vitest case with a stub fleet asserting `dispose()` called exactly
      once per removed id and never for kept ids.
- [x] 3.5 Add `components/board/webgl/layers.ts` — named z constants, real
      depth testing, replacing `depthTest: false` + hand-tuned
      `renderOrder`. Draw order: starfield → lattice → orbit rings →
      bodies → surface FX → fleets → effects.
- [x] 3.5a Thread the selected ring's index into `layers.ts`'s orbit-ring
      draw as a resolved prop (not a domain lookup inside `webgl/`) so
      today's `ORBIT_RING_HILITE` selected-ring highlight survives the
      port — computed from selection state outside `webgl/`, consumed as a
      plain index/uniform inside it.
- [x] 3.6 Add a `uWorldPerPixel` uniform, wired from `useBoardProjection`,
      to every shader.
- [x] 3.7 Fold `spike-palette.ts` into `board-palette.ts` — all eight
      relocations, in the same step, so `tsc` stays green:
      1. Delete `BAND_TINT`/`BODY_COLOR`/`bandForRing` duplicates; import
         `BAND_STYLE`/`FEATURE_STYLE`/`bandForRing` from `board-palette.ts`.
         Type the `FeatureType` consumer `Record<FeatureType, …>` so a
         missing type is a compile error (closes the gap where
         `nebula`/`gravity_well`/`debris`/`radiation` render `undefined`
         today).
      2. Merge `FOG_TREATMENT`/`FOG` into one superset record in
         `board-palette.ts`, keeping `wireOnly`, per the pinning ruling in
         design.md `### Decision: the fog-record merge — corrected
         justification` — the `remembered` and `visible` entries carry
         `chroma: 0, breakUp: 0` (opacity-only, matching today's SVG).
         `MEMORY` (`#fbbf24`) and `CHARTED` (`#8b98a9`) dissolve into that
         record's `remembered`/`astronomical` `accent` fields (already
         identical values) — no standalone export survives for either.
      3. Move `CLASS_TINT` out of the shader into `board-palette.ts`.
      4. Add `VOID` (`#04060c`, the canvas clear colour) to
         `board-palette.ts` — keep it a distinct constant from
         `SystemBoardView`'s stage background (`#05070d`); do not conflate
         the two.
      5. Add a `board-palette.ts` export for `SIGNAL`'s value (`#7dd3fc`)
         for `scene-lattice.ts`'s `uSignal` and `scene-fleet.ts`'s `uCool`.
      6. Add `HULL` (`#e6eef8`, own-fleet hull colour) to
         `board-palette.ts` for `scene-fleet.ts`.
      7. Repoint `app/spike/webgl-board/page.tsx`'s `FOG`/`VOID` imports to
         `board-palette.ts` in this same step — the spike route must not
         import a module that no longer exists after this task.
      8. Repoint `scene-fleet.ts`'s `THRUSTER` import to `board-palette.ts`
         (already exports the identical value at `board-palette.ts:131`; no
         new constant needed, only the import).
      Delete `spike-palette.test.ts` once its parity assertions become
      unnecessary. Do not add new raw hex to `webgl/` beyond the 12 already
      there.
- [x] 3.8 Pure fog-band → treatment packing function(s) outside `webgl/`
      (the plumbing/decision rule) — `packBodyInstance`/`packFleetInstance`
      taking a fogged `BoardFeature`/`BoardFleet` and returning a named
      record (`PackedBody`/`PackedFleet`, not a raw buffer slice), tested
      with vitest, no GL context. This is what `### Requirement: Fog Band
      Determines a Feature's Board Treatment` needs to be checkable at the
      unit level, not just e2e.
- [x] 3.9 Change GL module signatures so no module under
      `components/board/webgl/` imports a domain DTO or a palette record:
      `createBodies` takes pre-packed arrays instead of `SpikeBody[]`,
      `createStar` takes a resolved `[r,g,b]` tint instead of `starClass`.
      Grep `components/board/webgl/` for imports of `@/lib/types/*` and of
      `board-palette` as the check.
- [x] 3.10 Set production render defaults (bloom `0.25`, instrument `0.15`,
      tilt `14°`) as module constants; `useWorldTime` scale stays 1 — the
      spike's `speed 0.5×` clock multiplier does NOT carry over (it would
      desynchronise glyph positions from `stateAt` and every server ETA).
- [x] 3.11 (optional, non-blocking) Pause `composer.render()` while
      `document.hidden` is true, resuming on visibility change — battery/GPU
      courtesy; not required for correctness, since `useWorldTime` is
      already a closed-form re-anchored projection (task 3.2a), not an
      integrated accumulator.
- [x] 3.12 Adapt `app/spike/webgl-board/page.tsx`'s fixture to `WebGLBoard`'s
      new packed-input contract: task 3.9 makes `createBodies` (and its
      siblings) take pre-packed arrays instead of `SpikeBody[]`, and the
      DTO-import ban means `WebGLBoard` cannot take a `SystemBoard` either —
      so `mock-board.ts` must emit a `SystemBoard`-shaped fixture and
      `page.tsx` must pack it through the same pure pack functions
      (`packBodyInstance`/`packFleetInstance`, task 3.8) production uses,
      rather than passing `buildSpikeBoard`'s `SpikeBoard` output directly.
      Without this, `tsc` is red at the end of this step.

## 4. Projection, hit layer, e2e green (design.md Migration Plan step 3)

- [x] 4.1 Build `useBoardProjection()` exposing `project`/`unproject` as
      pure functions, owning the camera parameters as React-side state
      (container size, fit distance, tilt) and publishing the CSS
      `transform: perspective(d) rotateX(-tilt) …` the overlay registers
      against; the hook never reads camera state back out of
      `THREE.PerspectiveCamera`.
- [x] 4.2 Build `BoardStage` (composes, owns nothing GL), `BoardCanvas`
      (the only module under `components/board/` importing three.js; wraps
      `components/board/webgl/*`), and the transparent SVG overlay
      `BoardOverlay`, authored in board coordinates and carried into
      register with the canvas via `useBoardProjection`'s CSS transform:
      hit shapes for fleets, features, and lane gates; preserve
      `data-testid`s (`hex-board`, `hex-lattice`, `fleet-glyph-<id>`,
      `feature-glyph-<id>`, `gate-glyph-<id>`) and group testids
      (`fleet-glyphs`, `feature-glyphs`); preserve `data-mineable`,
      `data-band` (on feature hit shapes), and `data-own` (on fleet hit
      shapes). The overlay `<svg>` root is `pointer-events: none`; only
      per-entity hit shapes set `pointer-events: auto`.
- [x] 4.3 Give the overlay's `hex-lattice` node real bounds (e.g. a rect
      matching the lattice extent) — `board.spec.ts` asserts
      `toBeVisible()`, and an empty `<g>` is not visible to Playwright.
      This rect stays non-interactive (no `pointer-events: auto`) so it
      does not intercept tile/background clicks meant for the canvas.
- [x] 4.3a Add a selected-hex highlight to the overlay: one dynamic shape
      positioned at the currently selected bare hex (not a per-tile DOM
      node), replacing `HexLattice.tsx`'s per-tile selected-stroke today.
      Driven by the same selection state tasks 4.4/4.5 resolve.
- [x] 4.4 Wire tile clicks: canvas click → `unproject` → `pixelToHex`.
- [x] 4.5 Implement the click-resolution priority (glyph under pointer
      wins; else the containing hex; else clear) and the docked-fleet
      shrunk hit target that lets clicks fall through to the body
      underneath (today's `FleetGlyph.tsx:69` behaviour, `r = HEX_SIZE *
      0.18` while docked vs. `HEX_SIZE * 0.5` otherwise). Feature hit-target
      size is independent of fog-band treatment — an outline-only
      astronomical feature's hit target matches a filled feature's.
- [x] 4.5a Order the overlay's hit shapes in the DOM so an overlapping
      click resolves to the topmost drawn mark: fleets above features
      above lane gates, and a child feature (e.g. a moon) above its
      parent — matching today's SVG sibling-order behaviour, now pinned as
      the port's documented draw order rather than left to insertion
      accident.
- [x] 4.6 Wire background clicks (outside the lattice) to clear the
      selection.
- [x] 4.6a Add tile hover feedback to the overlay: a dynamic highlight
      shape tracking the pointer's `unproject`ed hex (replacing
      `HexLattice.tsx`'s per-tile `hover:fill-white/10`), plus a
      `cursor: pointer` style on the canvas while the pointer is over the
      lattice.
- [x] 4.7 Amend `board.spec.ts`: replace the `hex-tile-*` locator (which
      fails at the locator with zero per-tile nodes) with a click on the
      canvas at a computed point inside the lattice, asserting the
      resulting `Tile q, r` readout in `FactsPanel`. Do NOT commit this
      amendment before task 6.1's swap — see the Migration Plan preamble
      and task 7.5.
- [x] 4.8 Audit `frontend/e2e/tests/slice.spec.ts` and `new-user.spec.ts`
      for any remaining renderer-node-structure assumptions beyond the
      testids already preserved; amend to observable-behaviour assertions
      per the renderer-agnostic rule.
- [x] 4.9 Fix `SystemBoardView.test.tsx` (eleven structural assertions,
      `fireEvent.click` on glyphs at lines 211/230/367/402): mock
      `BoardCanvas` only. `BoardOverlay` and `useBoardProjection` mount for
      real in jsdom (no three.js import, no GL context needed), so all
      eleven existing structural assertions and the four `fireEvent.click`
      glyph interactions survive unchanged. This is the same seam
      `add-renderer-availability-states` decision A3 relies on (the
      unsupported state replaces only `BoardCanvas`'s region).
- [x] 4.10 Add a render-health e2e assertion independent of picking/overlay
      math (pixel-sample known-lit coordinates, or assert
      `renderer.info.render.calls > 0`) — phase 3's e2e-green exit criterion
      is NOT met without it, since every other assertion resolves through
      `project`/`unproject`/`FactsPanel` and would pass against a canvas
      drawing nothing.
- [x] 4.11 Make every fleet, feature, and lane-gate hit shape keyboard
      reachable, in tab order features → fleets → lane gates, each group in
      stable id order (e.g. `tabIndex`/DOM order matching that grouping,
      not screen position); Enter/Space activates the focused hit target
      identically to a pointer click; a visible focus indicator
      distinguishes the focused hit target from unfocused ones. Key the
      overlay's hit shapes stably (by entity id, not array index) so the
      board's per-frame `useWorldTime` re-render does not remount a focused
      element and drop focus to `<body>`. Scoped to the glyph layer only —
      bare-hex keyboard selection is an explicit non-goal (see
      `proposal.md`).
- [x] 4.12 Respect `prefers-reduced-motion`: when set, freeze the time
      input to the starfield-twinkle, nebula-drift, film-grain,
      body-surface-churn, and fleet-plume-flicker shaders (they render
      their static state, not a paused-but-still-sampled animation), while
      feature and fleet positions continue to advance with world time and
      selection/fog-band state render accurately.

## 5. Previews and gates (design.md Migration Plan step 4)

- [x] 5.1 Move previews onto the overlay as props (`plan`/`sweep` data),
      not `children` — `SelectionPreview`, `ScanOverlay` (`active`/`aim`
      variants), `ScanPing`/`ArcScan`, driven by the existing
      `move-preview.ts`/`scan-preview.ts` plans `SystemBoardView` already
      computes.
- [x] 5.1a Move the committed-burn-path layer (`data-testid="burn-paths"`,
      today's `BoardScene.tsx` amber polyline per own fleet's committed
      leg-0 path) onto the overlay as a prop-driven layer, same treatment
      as 5.1's previews.
- [x] 5.1b Move the live ambient sensor-bubble layer
      (`data-testid="scan-bubble"`, today's `BoardScene.tsx` hex polygons
      around own units) onto the overlay as a prop-driven layer, same
      treatment as 5.1's previews.
- [x] 5.2 Move lane-gate marks onto the overlay (`GateGlyph`'s
      replacement), same props-not-children treatment.
- [x] 5.3 Verify `### Requirement: Move Preview From the Acting Fleet's
      Live Position`, `### Requirement: Scan Aim Preview Only While
      Considering the Verb`, and `### Requirement: Running Scan Renders
      From Its Pinned Emission Hex` still pass unmodified — this phase
      must not respec them, only relocate their rendering.

## 6. Straight swap and deletion (design.md Migration Plan step 5)

- [x] 6.1 `SystemBoardView` renders `BoardStage` (composing `BoardCanvas` +
      `BoardOverlay`) exclusively.
- [x] 6.1a Extend the loading state to persist until `BoardCanvas` reports
      its first rendered frame — bounded by the precedence rule in the
      MODIFIED `### Requirement: System Board Route and Data Fan-In`:
      `BoardCanvas` surfaces a first-frame-rendered signal `SystemBoardView`
      waits on before swapping away from the loading placeholder, but if
      `BoardCanvas` instead reports the unsupported or interrupted state
      (`add-renderer-availability-states`), that state is shown in place of
      the loading placeholder — the loading placeholder MUST NOT persist
      indefinitely when the rendering context cannot be created or is lost.
- [x] 6.1b `SystemBoardView` passes `BoardCanvas`'s availability state into
      `FactsPanel`'s `available` prop (implements
      `add-renderer-availability-states` task 2.2b's wiring, which that
      change defines but explicitly defers to this one).
- [x] 6.2 Delete `HexBoard.tsx`, `BoardScene.tsx`, `HexLattice.tsx`,
      `FeatureGlyph.tsx`, `FleetGlyph.tsx`, `GateGlyph.tsx`, and their test
      files.
- [x] 6.3 Delete `app/spike/webgl-board/SvgBoard.tsx` and `patrol.ts` (and
      its test); keep the spike route as a WebGL-only tuning bench
      (bloom/instrument/tilt/speed sliders). `patrol.ts`'s importers were
      `WebGLBoard.tsx:30` (dropped at task 3.4) and `SvgBoard.tsx:26`
      (deleted in this task); `page.tsx` never imported it. Confirm neither
      surviving file imports `patrolAt`.
- [x] 6.4 Confirm no remaining import references any deleted component
      (grep the deleted filenames across `frontend/`).

## 7. Validation

- [x] 7.1 `### Requirement: Fog Band Determines a Feature's Board
      Treatment` — cover all scenarios: visible happy path (`data-mineable`
      present), astronomical outline-only (no `data-mineable`), remembered
      frozen detail (`data-mineable` present, facts panel `asOf` readout on
      selection), determinism (no client-seeded band), unrecognised-band
      fallback to `astronomical`, mapping assertability outside a rendering
      context, and astronomical carrying no detail to withhold. Both the
      vitest packing-function level (tasks 3.8–3.9) and the e2e level
      (`data-band`/`data-mineable` on overlay hit shapes, and the facts
      panel `asOf` readout).
- [x] 7.2 `### Requirement: Board Picking Resolves to the Entity Under the
      Pointer` — cover glyph click, tile click, background click, the
      docked-fleet occlusion edge case, the outline-only astronomical
      feature's full-size hit target, the selected-hex highlight, and the
      topmost-wins overlap resolution (a moon over its parent) (tasks
      4.3a, 4.5–4.5a, 4.7).
- [x] 7.3 `### Requirement: Foreign Fleets Render as Contact Marks Only` —
      cover own-fleet accent/heading, foreign-fleet generic mark, the
      no-`roster` no-error case, composition-invariance across differing
      foreign rosters, mapping assertability outside a rendering context
      (task 3.8), and removal-on-absence with GPU disposal (task 3.4a).
- [x] 7.4 `### Requirement: Toggle-to-Deselect Single Selection` (MODIFIED)
      — confirm both pre-existing scenarios still pass, plus the new
      background-click-clears scenario (task 4.6).
- [x] 7.5 Run `/check` at the close of steps 1 and 2, and once across the
      atomic 3–5 unit. Do not commit task 4.7's e2e amendment before task
      6.1's swap.
- [x] 7.6 `### Requirement: Board Glyph Selection Is Keyboard-Operable` —
      cover tab reaching every glyph type in the defined features → fleets
      → lane-gates order, the focus indicator, Enter/Space activating a
      selection identically to a pointer click, and focus surviving
      several frames of world-time advance without falling to `<body>`
      (task 4.11).
- [x] 7.7 `### Requirement: Board Respects Reduced-Motion Preference` —
      cover the starfield/nebula/film-grain/body-surface animation holding
      static under a reduced-motion preference while feature and fleet
      positions continue to advance with world time (task 4.12).
- [x] 7.8 `### Requirement: System Board Route and Data Fan-In` (MODIFIED)
      — confirm both pre-existing scenarios still pass, plus the new
      loading-persists-through-first-frame scenario (task 6.1a), the new
      unsupported-takes-precedence-over-loading scenario (task 6.1a), and
      the render-health e2e check (task 4.10) as the mechanism that makes
      "first frame produced" observable.
- [x] 7.9 Retarget `BoardScene.test.tsx:96-123`'s two assertions (the only
      existing coverage of `burn-paths` and `scan-bubble`, deleted with that
      file at task 6.2) at the relocated overlay layers from tasks 5.1a and
      5.1b: assert the committed-burn-path layer renders per own fleet's
      committed leg-0 path, and the ambient sensor-bubble layer renders
      around own units, so an overlay layer that never draws is caught.
- [x] 7.10 Confirm task 6.1b's wiring agrees with `BoardCanvas`'s actual
      availability state: when the renderer is unsupported or interrupted,
      `FactsPanel`'s empty-selection copy reflects that (per
      `add-renderer-availability-states`), not "Select a body, tile, or
      gate."

Note: context creation failure / context loss *detection and state* (both
`hex-board-view` and `galaxy-view`) belongs entirely to
`add-renderer-availability-states`, which this change depends on — not
re-tasked here. Wiring that already-defined `available` state into
`FactsPanel` at the swap (task 6.1b) IS this change's job, since this change
is what mounts `BoardCanvas` into `SystemBoardView` in the first place.

## 1. Shared render-context guard module (`frontend/components/render-guard/`)

Verified baseline: no `webglcontextlost`/`webglcontextrestored`/`contextlost`
handling exists anywhere in `frontend/`. Today `new THREE.WebGLRenderer()`
throws from inside a `useEffect` with no `try` around it, so a context-
creation failure is an uncaught error, not a graceful message. This module is
the one place the probe, the boundary wrapper, the local listener/rAF catch,
the unsupported/interrupted presentation, the retry control, and the
loss/restore state machine are authored — the board and galaxy guards below
compose it rather than re-deriving it (design.md, "same requirement name,
two capabilities, two implementations").

- [x] 1.1 Capability probe: `document.createElement('canvas').getContext('webgl2')`
      → `null` (never throws) renders the unsupported state and never
      constructs a renderer. (Scenario, both capabilities: Context creation
      failure shows a named unsupported state)
- [x] 1.2 Canvas-region `ErrorBoundary` wrapper (using
      `components/error-boundary.tsx`'s `ErrorBoundary`, its first
      production consumer) with a custom `fallback` rendering the same
      unsupported state. This catches a throw during render/commit —
      construction thrown synchronously inside the guarded subtree's mount
      effect, or any other throw React's own lifecycle can observe. It does
      **not** catch a throw inside a `webglcontextlost`/`webglcontextrestored`
      listener or a `requestAnimationFrame` callback — those are outside
      React's lifecycle at any placement (see 1.3). Retry after a boundary
      catch is `reset()` plus a `key` bump on the guarded subtree, not a bare
      effect re-run. (Scenario, both capabilities: An unexpected rendering
      error is contained to the canvas region)
- [x] 1.3 Local catch for listener/rAF throws: wrap the
      `webglcontextlost`/`webglcontextrestored` listener callbacks and the
      retry-triggered redraw/animation-frame callback in a `try`/`catch`
      that converts a thrown error into the same interrupted/unsupported
      transition, and the same recorded-by-cause entry (1.9), that a
      boundary catch would produce. This is the piece the boundary in 1.2
      structurally cannot cover for the "listening to" trigger. (Scenario,
      both capabilities: An unexpected rendering error is contained to the
      canvas region)
- [x] 1.4 Displayed-cause copy: a fixed set of user-actionable category
      strings (e.g. "your browser or graphics hardware does not support
      WebGL2"), never the caught exception's message, stack, or a
      `WEBGL_debug_renderer_info` string. (Scenario, both capabilities: The
      displayed cause is a user-actionable category, not raw diagnostic text)
- [x] 1.5 Loss/restore state machine, parameterised by a canvas element (not
      constructed by this module): registers `webglcontextlost` /
      `webglcontextrestored`, transitions unsupported/live → interrupted →
      live-or-still-interrupted. A second `webglcontextlost` while already
      interrupted is a no-op state transition — no duplicate listener
      registration, no duplicate in-flight creation attempt. (Scenarios, both
      capabilities: Context loss shows an interrupted state without an
      uncaught error; A restored context resumes without navigation; A
      context that never restores keeps the interrupted state with a retry
      affordance; A second context loss while already interrupted is a
      no-op state change)
- [x] 1.6 Restore freshness: the module exposes the restore event so the
      consumer can force a redraw from live data (the post-restore world
      time and the latest feature/fleet read) — it does not itself own the
      redraw (board: rAF; galaxy: FG3D's own render) and asserts nothing
      about a WebGL frame's pixel contents, which no interface exposes.
      (Scenario, both capabilities: A restored context's first frame
      reflects live state, not a stale one)
- [x] 1.7 Retry control: invoking it (a) disposes the prior attempt's
      renderer/listeners before creating a new context — at most one live
      context per canvas at any time, (b) resumes live rendering on success,
      (c) keeps the interrupted/unsupported state retriable on failure, (d)
      is disabled and shows an in-progress indication for the full duration
      of an attempt, so any invocation while disabled starts no further
      attempt — stated as an observable rule, not a race window: the
      primary mechanism (`getContext('webgl2')`) is synchronous, so there is
      no window in which a second click lands mid-attempt on that path
      alone; the "in-progress" state and its guard must still exist and be
      exercised by the async galaxy remount (module 3). (Scenarios, both
      capabilities: Invoking the retry affordance attempts to re-establish
      the context; Retrying releases the prior attempt's resources first; A
      successful retry resumes the live board/galaxy graph; A retry that
      fails again keeps the interrupted state retriable; The retry
      affordance prevents duplicate concurrent attempts; The unsupported
      state offers a retry affordance)
- [x] 1.8 Accessibility: (a) an `aria-live` (or equivalent) region that
      conveys the state transition and its named cause, not merely a plain
      `<div>` insertion; (b) the retry control is a real, keyboard-reachable
      (Tab), keyboard-activatable (Enter or Space) control, not a click-only
      div; (c) on transition, if focus was inside the canvas region, move it
      to the retry control or, absent one, to the state's explanatory text —
      never let it fall to `document.body` unannounced. (c) is conditional
      on the canvas region containing a focusable element at the moment of
      transition — verified by grep, neither FG3D's canvas nor `HexBoard`
      contains one today, and after the port the focusable glyphs live on
      `BoardOverlay`, outside `BoardCanvas`'s region — so this branch is
      exercised by a stub that adds a focusable node, not by the shipped
      surfaces yet. (Scenarios, both capabilities: The state change is
      announced to assistive technology; The retry affordance is
      keyboard-operable; Focus does not get lost when the canvas region
      changes under the player)
- [x] 1.9 Observability: record each context-creation failure, loss, and
      restore failure (an error thrown while re-establishing rendering after
      `webglcontextrestored` fires — a context that simply never restores is
      not itself a recordable failure event) distinguishably by cause,
      including the browser-reported diagnostic when available (e.g.
      `webglcontextcreationerror`'s `statusMessage`), as a diagnostic entry
      emitted to the client error log — recording never throws and never
      blocks the unsupported/interrupted state from rendering. Sink is
      `console.error` pending Travis's answer to the open question in
      design.md. (Scenario, both capabilities: Renderer failures are
      recorded distinguishably by cause)
- [x] 1.10 Unit tests against a stub `<canvas>` (jsdom; dispatch synthetic
      `webglcontextlost`/`webglcontextrestored` events) covering 1.1–1.9's
      scenario set independent of either consumer.

## 2. Board: `BoardCanvas` (`frontend/components/board/`)

`components/board/` creates no rendering context today — the only `new
THREE.WebGLRenderer()` in the repo is in the spike, and production
`SystemBoardView` renders the SVG `HexBoard`/`BoardScene`
(design.md, "at ship time the board guard is mounted but its loss/restore
listeners have no canvas"). **`SystemBoardView.tsx` is not modified by this
change.** `BoardCanvas` is built and tested standalone here, named to match
`port-board-to-webgl-renderer`'s own `BoardCanvas`/`BoardStage`/
`BoardOverlay` design so the port adopts this component directly instead of
re-deriving it.

- [x] 2.1 Build `BoardCanvas` composing the module 1 guard: the probe runs
      against a stub/offscreen canvas (no production `WebGLRenderer`
      construction exists yet to guard); the boundary, the local
      listener/rAF catch, the unsupported/interrupted presentation, and the
      retry control are fully wired and independently testable. (Scenarios:
      Context creation failure shows a named unsupported state; The
      unsupported state is independent of the interior data read; A failed
      data read takes precedence over the unsupported state; The system
      board view container remains present — exercised via a test harness,
      not `SystemBoardView` itself; see 2.4)
- [x] 2.2 Board-specific facts-panel contract — a real, testable-today
      change, not documentation: (a) regression-test that scan, mine,
      cancel-burn, and cancel-mine remain invokable through `FactsPanel`
      without a board selection — already true of `FactsPanel`'s existing
      `activeFleet`-gated verbs (they read `activeFleet`/`scanEta`/`mineEta`,
      never `selection`); pin it so a future refactor can't silently couple
      them to `selection`. (b) Add an `available: boolean` prop to
      `FactsPanelProps`, defaulting to `true` so every existing caller is
      unaffected. When `available` is `false`, `FactsPanel`'s empty-
      selection prompt SHALL NOT render "Select a body, tile, or gate." and
      SHALL instead indicate that a move or departure target requires the
      board to be available. This is testable today directly against
      `FactsPanel` with no canvas, no `BoardCanvas`, and no `SystemBoardView`
      involved — `port-board-to-webgl-renderer` wires `available` from the
      guard's live/unsupported/interrupted state once it mounts
      `BoardCanvas` in `SystemBoardView`'s place. (c) Gate `scan-fx-toggle`
      (`FactsPanel.tsx:203-212`) on `available`: while the board's renderer
      is unavailable, disable or hide the control rather than presenting it
      as operable, since it switches only which effect the board canvas
      draws for a running scan — with no board rendering, it is otherwise a
      dead control. This is the board's implementing task for
      `hex-board-view`'s `### Requirement: Renderer Unavailability Is an
      Explicit State`, scenario "A canvas-only control is disabled while the
      canvas is unavailable." `add-board-camera-controls` separately
      inherits the same rule for the camera controls it adds (its `Camera
      Controls Are Inert While the Board Is Unavailable` requirement and
      task 8.1). (Scenarios: Surrounding board affordances remain usable;
      Move and departure verbs are unreachable without the canvas; A
      canvas-only control is disabled while the canvas is unavailable)
- [x] 2.3 In-flight state survival contract: because `selection`/
      `activeFleetId` (`SystemBoardView`'s own `useState`) and the typed mine
      tonnage (`MineSection`'s local state) are siblings of, not children of,
      the canvas-region tree `BoardCanvas` occupies, they survive a context
      loss by construction — add a regression test pinning this so a future
      refactor moving the guard boundary can't silently break it. (Scenario:
      In-flight selection and typed input survive a context loss)
- [x] 2.4 Unit/component tests: `BoardCanvas` standalone (module 1's stub-
      canvas suite, board-flavoured copy) plus a lightweight test harness
      composing `BoardCanvas` next to stand-ins for `FactsPanel`/fleet
      roster to assert the sibling contract in 2.2–2.3 — not a
      `SystemBoardView` integration test, since `SystemBoardView` does not
      mount `BoardCanvas` in this change. Includes a direct `FactsPanel`
      test exercising the new `available` prop (2.2b) and the
      `scan-fx-toggle` gating (2.2c) independent of any canvas harness.

## 3. Galaxy: guard wired live (`frontend/components/galaxy/`)

`GalaxyGraph.tsx` does not own its renderer — `react-force-graph-3d` does.
Unlike the board, this half is live on ship day: it closes the standing gap
on the home route today.

- [x] 3.1 Wrap `<GalaxyGraph>` inside `GalaxyView` in the module 1 boundary
      (render/commit throws only — see 1.2), with the probe run before
      `<ForceGraph3D>` mounts (pre-emption is the only failure-avoidance
      path available here, since FG3D constructs its own renderer).
      `IntelPanel`, the fleet roster, and the inspector sit outside the
      boundary. `GalaxyView`'s existing early return on `isError`/`!galaxy`
      (before `<GalaxyGraph>` is ever rendered) already keeps the
      galaxy-read error panel taking precedence over any canvas-region
      state — pin that with a regression test rather than re-deriving it.
      (Scenarios: Context creation failure shows a named unsupported state;
      Surrounding galaxy affordances remain usable; The unsupported state is
      independent of the galaxy data read; A failed data read takes
      precedence over the unsupported state; The galaxy view container
      remains present; An unexpected rendering error is contained to the
      canvas region)
- [x] 3.2 Declare `pauseAnimation()`/`resumeAnimation()` on the existing
      hand-written `FgRef` interface (not a cast) alongside `renderer()`.
      Attach `webglcontextlost`/`webglcontextrestored` listeners to
      `fgRef.current.renderer().domElement` once the graph has mounted —
      **not** as the creation-failure detection path (design.md fixes this:
      creation failure is caught by the probe/boundary; the ref accessor is
      used only to attach loss/restore listeners on an already-mounted
      renderer). Wrap those listener callbacks and the FG3D-driven redraw in
      module 1.3's local catch — the boundary in 3.1 does not reach them.
      Guard degrades to "interrupted state shown, loop not paused" if an
      accessor is undefined. (Scenarios: Context loss shows an interrupted
      state without an uncaught error; A restored context resumes without
      navigation; A restored context's first frame reflects live state, not
      a stale one; A context that never restores keeps the interrupted
      state with a retry affordance; A second context loss while already
      interrupted is a no-op state change)
- [x] 3.3 Retry wiring: FG3D exposes no API to recreate its renderer in
      place, so retry is `reset()` + remounting `<ForceGraph3D>` (a `key`
      bump). This does **not** go through `onRetry`: the composition
      (`guard.status === 'live' ? <Boundary>… : <Notice/>`) only mounts
      `<GalaxyGraph>` once `status` is already `live`, so an `onRetry`
      awaited from inside the `retrying` state can never observe the
      remounted graph becoming ready — that wait would be circular. Retry
      uses the same re-probe path as the board: `onRetry` is omitted, the
      guard's own `probeWebgl2()` re-probe is the success signal, and the
      fresh `<GalaxyGraph key={attempt}>` mounts naturally via the branch
      swap once `status` flips to `live`; a throw during that remount is
      caught by `CanvasRegionBoundary` and converted to the unsupported/
      interrupted state via `renderError` — the same observable outcome a
      `retryFailed` would produce, reached by a different event. Verify the
      module 1.7 retry contract (dispose-first, success/failure/in-progress-
      disabled) holds across this remount. (Scenarios: Invoking the retry
      affordance attempts to re-establish the
      context; Retrying releases the prior attempt's resources first; A
      successful retry resumes the live galaxy graph; A retry that fails
      again keeps the interrupted state retriable; The retry affordance
      prevents duplicate concurrent attempts; The unsupported state offers a
      retry affordance)
- [x] 3.4 Galaxy-specific surrounding-affordance contract:
      `handleShowFleet` (the roster row callback, `GalaxyView.tsx:211`)
      already calls `setSelectedId(fleet.systemId)` for a fleet not in lane
      transit — that populates the inspector and arms `TravelSection` with a
      live `travel-button`, entirely through React state. It is a working
      path today and this change does not touch it; regression-test that a
      roster-row click reaches the inspector and a live `travel-button`
      while the canvas region shows the unsupported/interrupted state.
      `Inspector`'s empty-selection prompt does not read "Select a system to
      inspect its star, bodies, and lanes" while the canvas region shows the
      unsupported/interrupted state AND no system is selected AND the
      requester has no own fleet in the roster; it instead indicates that a
      system can be reached by selecting an own fleet in the roster, or that
      the graph must be available to pick any other. Also disable/hide
      `IntelPanel`'s recenter button (`handleRecenter`,
      `controllerRef.current?.recenter()`) while the canvas region shows the
      unsupported/interrupted state — with no graph, it is a silent dead
      control today, and the fix is the same "don't offer a broken control"
      rule task 2.2c applies to the board's `scan-fx-toggle`, and that
      `add-board-camera-controls` separately inherits for the camera
      controls it adds. (Scenarios: Surrounding galaxy
      affordances remain usable; Roster selection still reaches a system,
      its inspector, and travel; Choosing a system on the graph is
      unreachable without the canvas; A canvas-only control is disabled
      while the canvas is unavailable)
- [x] 3.5 In-flight state survival: `selectedId`/`selectedFleetId` live in
      `GalaxyView`'s own `useState`, a sibling of `<GalaxyGraph>` — pin this
      with a regression test. (Scenario: In-flight selection survives a
      context loss)
- [x] 3.6 Accessibility and observability wiring: reuse module 1's live-
      region announcement (naming the state and its cause), keyboard
      operability (Tab to reach, Enter/Space to activate), and conditional
      focus-management hooks, attached to `GalaxyView`'s DOM; reuse module
      1's failure recording. (Scenarios: The state change is announced to
      assistive technology; The retry affordance is keyboard-operable; Focus
      does not get lost when the canvas region changes under the player;
      Renderer failures are recorded distinguishably by cause)
- [x] 3.7 Distinct `data-testid`s for the unsupported/interrupted states vs.
      the existing `next/dynamic({ ssr: false })` loading fallback
      (`GraphFallback`), which also occupies the canvas region while
      `GalaxyGraph` code-splits in — otherwise "independent of the galaxy
      data read" isn't assertable.
- [x] 3.8 Logged-out-visitor contract: with `enabled={!isStartArea}` false
      and `own.length === 0`, `FleetRoster` renders nothing — verify
      `IntelPanel`'s counts, region breakdown, and sign-in prompt remain
      shown while the graph's canvas region shows the unsupported state for
      a logged-out visitor. (Scenario: Surrounding galaxy affordances remain
      usable for a logged-out visitor)
- [x] 3.9 Tests: `GalaxyGraph.test.tsx` already mocks `react-force-graph-3d`
      wholesale — the creation-failure test is "make the mock throw, assert
      the boundary converts it," not a real GL harness. `GalaxyView.test.tsx`
      covers the sibling-contract scenarios in 3.4–3.5 and 3.8.

## 4. Validation

- [x] 4.1 Confirm every scenario in `specs/hex-board-view/spec.md` and
      `specs/galaxy-view/spec.md` for this change has at least one
      corresponding test from sections 1–3.
- [x] 4.2 Run `/check` (frontend lint, vitest, changed-file validators) and
      confirm `BoardCanvas`, the shared guard module, the `FactsPanel`
      `available` prop, and the galaxy wiring pass the data-testid and
      test-file coverage checks.

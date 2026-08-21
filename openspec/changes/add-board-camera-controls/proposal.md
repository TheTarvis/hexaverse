## Why

`docs/plans/webgl-board-port.md`'s phase 5 ships "pan, zoom, and touch
pinch-zoom, always on" for the tactical board, but `port-board-to-webgl-
renderer` deliberately ships at a fixed camera — parity with today's SVG
board's fixed `fitViewBox`, not a regression, but also not the gestures the
design doc calls for. A tactical board a player cannot pan or zoom limits
how much of a system they can inspect at once, especially once a system's
radius or feature count exceeds what the initial framing can show at a
legible scale. This change adds the gestures the port's camera work
deliberately deferred.

It ships as its own change, not folded into the port, because every camera
bound the gestures need (zoom clamp beyond the spike's tuning-bench default,
pan clamp, reset policy) is unspecified in the source design doc — the port
was not allowed to fabricate them, and this change exists to answer them
explicitly rather than silently.

A specialist-panel review (UX, architect) found that pan/zoom and the port's
click-to-select share the same pointer and touch input with nothing
discriminating them — on touch this silently breaks selection outright, and
on pointer a pan can select or deselect a mark it merely happens to end over
— plus a camera dead end (no way back to default framing once panned away)
and several unowned or unasserted edges (bare-hex picking under pan/zoom,
the shader scale uniform's update cadence, the zoom anchor point, keyboard
focus landing off-screen). This revision closes all of it.

## What Changes

- Add `### Requirement: Board Camera Pan and Zoom` — pointer-drag pan and
  wheel-gesture zoom, clamped to a zoom range of `0.25×`–`6×` (inherited from
  the spike's tuned default, `WebGLBoard.tsx:187`) and to a pan range that
  confines the camera's pan target to the hex lattice's bounding box, so the
  board's centre of view is always over the lattice (the spike has no pan
  clamp at all — this is new). Zoom keeps the camera's current pan target
  fixed on screen (the spike's actual, centre-anchored behavior — not
  cursor-anchored; see Open Questions). Camera state persists across a
  selection change and across a realtime data refetch (an unrequested reset
  mid-interaction is hostile); it resets to the board's *default framing*
  (defined once, normatively: fit-to-lattice at zoom `1×`, pan target at the
  lattice origin `(0,0)`) immediately, with no eased transition, when the
  route's `systemId` changes (a new board is a new view). A pointer sequence
  is discriminated by movement against an **8 CSS pixel** threshold (the
  common touch-slop convention, pinned rather than left blank — see design.md)
  — movement under it resolves as a click, at or past it as a pan that MUST
  NOT change the selection — because gesture listeners and the port's
  per-entity hit targets share the same surface and would otherwise collide
  (a pan ending over a mark could select or deselect it). A gesture that
  *begins* over a mark still pans/zooms exactly as one over bare board would
  (closing a dead-zone the first draft of this change left unasserted in the
  normative spec); activating an on-screen camera control is likewise
  excluded from the click-to-pick path. This requirement also owns the
  property the port's own picking requirement explicitly does not cover:
  after any pan or zoom, a click still resolves to the correct entity or hex
  — on a mark, on a bare hex, or outside the lattice — because the overlay
  and canvas remain in registration through `useBoardProjection`.
- Add `### Requirement: Board Camera Touch Pinch-Zoom` — genuinely new code;
  the spike sets `touchAction: 'none'` on the canvas but implements no touch
  handling at all. Two-finger pinch zooms within the same clamp as wheel
  zoom, anchored on the camera's current centre (identically to wheel zoom,
  not the pinch midpoint); a single-finger touch drag pans using the same
  behavior and clamp as pointer drag. The same 8px movement-threshold
  discrimination applies: a stationary tap resolves to a selection, not a
  pan — otherwise the `preventDefault()` needed to suppress the browser's
  native pinch would also suppress the synthesized click that selection
  depends on, and touch users could not select anything.
- Add `### Requirement: Board Camera Is Keyboard-Operable` — arrow-key pan
  (one hex width per key press) and dedicated zoom-in/zoom-out key input
  (one wheel-notch equivalent per press), respecting the same clamps as
  pointer and touch input, occupying the board's tab order **before** the
  fleet/feature/lane-gate hit targets (so the port's existing glyph tab
  order is undisturbed) with a visible focus indicator, giving a
  DOM-observable at-limit state when input is given at a clamp. Tab focus
  landing on a fleet/feature/gate hit target that the current pan/zoom has
  pushed off-screen pans the camera by the minimum displacement that brings
  it into view, immediately and with no eased transition. Without this, the
  camera gestures this change adds would be mouse/touch-only on the same
  surface the port's `### Requirement: Board Glyph Selection Is
  Keyboard-Operable` already makes keyboard-reachable — an accessibility
  gap this change closes rather than introduces.
- Add `### Requirement: Board Camera Manual Recenter` — a control, reachable
  via the board's normal tab order, that resets pan/zoom to the board's
  default framing on demand and leaves the current selection unchanged.
  Without it, the only reset is the automatic one on `systemId` change, and
  a player who pans away has no way home short of leaving the route.
- Add `### Requirement: Camera Controls Are Inert While the Board Is
  Unavailable` — while the board's canvas region shows the renderer
  unsupported/interrupted state (`add-renderer-availability-states`), the
  camera controls SHALL NOT be rendered or reachable in the tab order, and
  camera gestures SHALL NOT intercept pointer, wheel, or touch input over
  that region. Without this, a wheel scroll over the "WebGL unavailable"
  panel would be silently swallowed by a capture-phase listener bound above
  it, and dead camera controls would keep tab stops driving nothing.
- Camera tilt stays the port's fixed `14°` production constant and is
  explicitly **not** made user-controllable by this change (the spike
  exposes it as a tuning slider; production does not carry that over).
  Bare-hex keyboard traversal (arrow-key hex-to-hex movement) is explicitly
  **not** taken up here either, even though `port-board-to-webgl-renderer`
  names this change as its candidate home — see Non-Goals in design.md.

## Impact

- Affected specs: `hex-board-view`
- **Depends on `port-board-to-webgl-renderer`** (which itself depends on
  `add-renderer-availability-states`). This change consumes
  `useBoardProjection`'s camera-parameter ownership model exactly as that
  change ships it — gesture handlers write into the hook's existing React
  camera state; the hook's `project`/`unproject` signature does not change.
- Affected code: `frontend/components/board/` — a new pure camera-math
  module outside `components/board/webgl/` (clamping, wheel/pinch/drag →
  camera-parameter mapping — a decision per the port's own plumbing/decision
  rule, and the only way pinch-zoom is cheaply testable at all); gesture
  listeners bound on `BoardStage` in the capture phase (not on `BoardCanvas`
  — the port's overlay makes the `<svg>` root `pointer-events: none`, so a
  canvas-only listener would dead-zone over every mark) feeding
  `useBoardProjection`'s camera state; `BoardCanvas`/`BoardOverlay` are
  otherwise unaffected, consuming updated camera parameters the same way
  they already do at a fixed camera.

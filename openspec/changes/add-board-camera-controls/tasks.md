## 1. Camera math module (pure, outside `webgl/`)

- [ ] 1.1 Create a pure camera-math module — clamping, wheel-delta → zoom,
      pinch-distance → zoom, drag-delta → pan target, and the pan bound
      (confine the pan target to the lattice's bounding box), all as a pure
      function of (current camera params, gesture delta, lattice extent,
      container size). Imports neither React nor three.js; lives outside
      `components/board/webgl/` per the port's plumbing/decision rule (a
      clamp is a decision); table-tested in vitest. This is also what makes
      multi-touch pinch's clamp and anchor math cheaply testable — see the
      note in tasks 3.4/3.5 on why the single-finger tap/pan half still
      needs its own DOM-level test.
- [ ] 1.2 Extend `useBoardProjection`'s camera state with pan-target and
      zoom fields (already anticipated by the port's design.md — "container
      size, fit distance, tilt, and — later — zoom and pan target"); the
      hook's `project`/`unproject` signatures do not change.
- [ ] 1.3 Default framing (the values the camera resets to on a `systemId`
      change or a recenter) is the fit-to-lattice framing at zoom `1×` with
      the pan target at the lattice origin `(0,0)` — derived the same way
      the port's fixed camera derives its one-shot framing today, no new
      default-framing logic invented here.

## 2. Gesture binding, pointer drag pan, and wheel zoom

- [ ] 2.1 Bind gesture listeners (pointer, wheel) on `BoardStage` in the
      capture phase, not on `BoardCanvas` — the port's overlay pointer
      policy makes the overlay `<svg>` root `pointer-events: none` with only
      per-entity hit shapes `pointer-events: auto`, so a canvas-only
      listener would dead-zone over every mark. This is what makes a
      gesture that begins over a mark still pan/zoom the camera (task 7.6
      is the regression test for this).
- [ ] 2.2 Movement-threshold discrimination: track total pointer movement
      between pointerdown and pointerup through the module from 1.1, against
      an **8 CSS pixel** threshold. Below the threshold, resolve as a click
      and leave selection to the port's existing picking path; at or above
      it, resolve as a pan and do not change the selection.
- [ ] 2.3 Wheel zoom handler bound via
      `addEventListener('wheel', handler, { passive: false })`, not React's
      `onWheel` — React attaches wheel passively at the root, so
      `preventDefault()` inside a synthetic handler is a no-op and wheel
      zoom would also scroll the page (spike precedent:
      `WebGLBoard.tsx:195`).
- [ ] 2.4 Wheel zoom anchors on the camera's current pan target (centre),
      not the cursor, clamped to `[0.25, 6]` (`WebGLBoard.tsx:184-188`),
      writing to the camera state from 1.2 through the module from 1.1.
- [ ] 2.5 Pan clamp: constrain the pan target to the hex lattice's bounding
      box, so the board's centre of view is always over the lattice —
      genuinely new; the spike has no pan clamp of any kind.
- [ ] 2.6 Verify `uWorldPerPixel` is re-written on every camera change, not
      only on resize/construction — under the port's fixed camera the two
      are indistinguishable, and this change is where they diverge.
- [ ] 2.7 Exclude activation of on-screen camera controls (recenter, and any
      keyboard-operable pan/zoom affordance from section 4) from the board's
      click-to-pick path — e.g. by stopping propagation on the control's own
      pointer handler before it reaches the stage-level picking listener —
      so activating a control never changes the selection regardless of
      what hex or mark is drawn beneath it.

## 3. Touch pinch-zoom (genuinely new code — no spike implementation to port)

- [ ] 3.1 Two-finger pinch gesture handler mapping pinch-distance delta to
      zoom through the module from 1.1, using the same `[0.25, 6]` clamp and
      centre anchor (not the pinch midpoint) as wheel zoom.
- [ ] 3.2 Single-finger touch drag reuses the pointer-drag pan path (tasks
      2.1–2.2): a touch that stays within the same 8px movement threshold
      resolves as a tap/selection, not a pan, so the pinch/pan suppression
      added in 3.3 does not silently break tap-to-select.
- [ ] 3.3 Preserve/extend `touchAction: 'none'` from the canvas
      (`WebGLBoard.tsx:84`) to the board's full interactive surface so the
      browser's native page-pinch-zoom doesn't compete with the board's own
      pinch handler, without suppressing the tap path handled in 3.2.
- [ ] 3.4 e2e (Playwright, `hasTouch: true` context): `page.touchscreen.tap()`
      on a fleet glyph selects it, and a tap-then-drag past the 8px
      threshold pans without changing the selection. This is the reachable
      half of touch input — single-finger tap and drag do not need raw CDP
      dispatch — and it is the only test at any level that exercises the
      DOM event plumbing (`touchstart`'s `preventDefault()` vs. the
      synthesized `click`) the tap scenario exists to protect; the pure
      reducer from 1.1 never touches that plumbing.
- [ ] 3.5 jsdom/vitest test (or raw-CDP e2e where available): synthesized
      `touchstart`/`touchmove`/`touchend` producing a two-finger pinch on the
      stage yields the expected camera deltas through the module from 1.1,
      and does not suppress the tap path exercised in 3.4.

## 4. Keyboard operability

- [ ] 4.1 Keyboard pan handler (arrow keys), stepping the camera by one hex
      width per press at the camera's current zoom, writing to the same
      camera state as task 2.4, respecting the pan clamp from task 2.5.
      Blocked on the "Exact keyboard bindings" Open Question in design.md —
      the specific keys are not yet confirmed, so this task and its
      corresponding scenario cannot be implemented or tested until that
      answer lands.
- [ ] 4.2 Keyboard zoom handler (zoom-in/zoom-out keys), stepping the camera
      by one wheel-notch equivalent per press, respecting the `[0.25, 6]`
      clamp from task 2.4. Blocked on the same Open Question as 4.1.
- [ ] 4.3 Make the board's camera controls (keyboard pan/zoom affordances
      and the recenter control from section 5) reachable via the board's
      existing tab order, positioned **before** the fleet, feature, and
      lane-gate hit targets so the port's `### Requirement: Board Glyph
      Selection Is Keyboard-Operable` tab order is left intact; with a
      visible focus indicator while focused.
- [ ] 4.4 When Tab moves focus onto a fleet, feature, or lane-gate hit
      target that the current pan/zoom has pushed outside the viewport, pan
      the camera by the minimum displacement that brings that hit target's
      focus indicator fully into the viewport, preserving the current zoom
      where pan alone suffices, immediately and with no eased transition —
      this move gets the same immediacy clause as the `systemId` reset and
      the recenter control, not an "as needed" allowance that could justify
      resetting to default framing on every Tab.
- [ ] 4.5 Keyboard clamp feedback: when arrow-key pan or zoom-key input is
      given while already at the corresponding clamp, expose an at-limit
      state in the DOM (an attribute, or a status message conveyed to
      assistive technology) that is absent when the same input is given away
      from the clamp — not a `console.log`, a same-frame CSS class with no
      rendered difference, or the pre-existing focus ring alone.

## 5. Manual recenter

- [ ] 5.1 Recenter control, reachable via the board's normal tab order
      (positioned per task 4.3), that resets pan and zoom to the default
      framing from 1.3 immediately, with no eased transition, on
      activation; activation SHALL leave the current selection unchanged
      (task 2.7 covers exclusion from the click-to-pick path) and is a no-op
      if the camera is already at the default framing.
- [ ] 5.2 Recenter is activatable from the keyboard with Enter or Space,
      identically to a pointer activation.

## 6. Reset policy

- [ ] 6.1 Reset camera state to the default framing when the route's
      `systemId` changes, immediately with no eased transition — implemented
      as an effect on `systemId` inside the hook, not a `key={systemId}`
      remount of `BoardStage` (a remount would tear down and recreate the
      WebGL context on every system-to-system navigation).
- [ ] 6.2 Confirm camera state is left unchanged by a selection change
      (no reset wired to selection).
- [ ] 6.3 Confirm camera state is left unchanged by a realtime refetch
      landing new board data (no reset wired to refetch).

## 7. Picking correctness under pan/zoom

- [ ] 7.1 Verify `project`/`unproject` continue to resolve clicks correctly
      at arbitrary camera pan/zoom state — the load-bearing property this
      whole change depends on — for marks, bare hexes, and points outside
      the lattice alike.
- [ ] 7.2 e2e: pan and/or zoom the board, then click a mark at its drawn
      position, and assert the correct entity is selected — the
      camera-invariance scenario the port's own picking requirement
      explicitly does not cover.
- [ ] 7.3 e2e or unit: pan and/or zoom the board, then click a point within
      the lattice that is over no mark, and assert the hex containing that
      point becomes the selection.
- [ ] 7.4 e2e or unit: pan and/or zoom the board, then click a point outside
      the lattice, and assert the selection clears.
- [ ] 7.5 Unit test (no GL context needed): `project()` and the overlay's
      published CSS transform map the same board point to the same screen
      point at `0.25×`, `1×`, `6×`, and at an off-centre pan target — the
      gate for the two published camera expressions staying in agreement.
- [ ] 7.6 e2e or unit: a pointer drag that *begins* over a fleet, feature, or
      lane-gate mark and exceeds the movement threshold still pans the
      camera (and a wheel/pinch gesture over such a mark still zooms it),
      leaving the selection unchanged — the dead-zone regression this
      change's binding-at-the-stage decision (task 2.1) exists to prevent,
      asserted directly rather than only implied by where listeners are
      bound.
- [ ] 7.7 e2e or unit: a pointer press-release over a mark that moves 7 CSS
      pixels between press and release selects that mark's entity, and one
      that moves 8 CSS pixels resolves as a pan and does not — the pointer
      half of the click/pan discriminator boundary; mirrors task 3.4's
      touch-tap test, which covers only the touch half.

## 8. Camera controls are inert while the board is unavailable

- [ ] 8.1 When `BoardCanvas`'s region shows the renderer unsupported or
      interrupted state (`add-renderer-availability-states`), unmount or
      otherwise remove the camera controls from the tab order, and ensure
      the gesture listeners bound in task 2.1 do not intercept or suppress
      pointer, wheel, or touch input over that region — a wheel scroll over
      the unsupported-state panel SHALL scroll the page normally, not be
      swallowed by the capture-phase `preventDefault()` from task 2.3.
- [ ] 8.2 Camera controls render in `BoardStage`, outside `BoardCanvas`'s
      region, so `add-renderer-availability-states`'s canvas-scoped focus
      handling does not itself catch focus lost from a camera control: if
      keyboard focus is on a camera control at the moment task 8.1's unmount
      happens, move focus to the retry affordance (or explanatory text) the
      same way `add-renderer-availability-states` moves focus out of the
      canvas region — never leaving it to fall to `document.body`.

## 9. Validation

- [ ] 9.1 `### Requirement: Board Camera Pan and Zoom` — cover pointer-drag
      pan, wheel-zoom anchored on the centre, zoom clamp at both ends, the
      bounding-box pan clamp, a pan that ends over a mark not changing the
      selection, a sub-threshold pointer press-release still resolving as a
      click (7px selects, 8px pans), a gesture that begins over a mark still
      panning/zooming, activating a camera control not changing the
      selection, camera persistence across a selection change, camera
      persistence across a realtime refetch, immediate reset on `systemId`
      change, and picking after pan/zoom for a mark, a bare hex, and outside
      the lattice (tasks 1.1–1.3, 2.1–2.7, 6.1–6.3, 7.1–7.7).
- [ ] 9.2 `### Requirement: Board Camera Touch Pinch-Zoom` — cover pinch-in,
      pinch-out, clamp at the pinch boundary, the pinch centre anchor,
      single-finger drag panning, a stationary tap resolving to a selection,
      a moved tap resolving to a pan, and the exactly-at/one-past-threshold
      boundary (tasks 3.1–3.5).
- [ ] 9.3 `### Requirement: Board Camera Is Keyboard-Operable` — cover
      arrow-key pan (one hex width), zoom-key zoom (one wheel-notch
      equivalent), tab reachability and ordering before the glyph group, the
      focus indicator, an off-screen focused glyph being brought into view
      by minimal displacement, and DOM-observable clamp feedback (tasks
      4.1–4.5). Two of these scenarios (arrow-key pan, zoom-key zoom) are
      not executable until the "Exact keyboard bindings" Open Question is
      confirmed — tracked as blocking, not merely open (see tasks 4.1–4.2).
- [ ] 9.4 `### Requirement: Board Camera Manual Recenter` — cover pointer
      activation, keyboard activation, and the no-op case when already at
      default framing (tasks 5.1–5.2).
- [ ] 9.5 `### Requirement: Camera Controls Are Inert While the Board Is
      Unavailable` — cover camera controls absent from the tab order, a
      wheel gesture over the unsupported/interrupted region scrolling the
      page normally, and focus moving to the retry affordance (never to the
      document body) when a camera control held focus at the moment of
      transition (tasks 8.1–8.2).
- [ ] 9.6 Run `/check`.

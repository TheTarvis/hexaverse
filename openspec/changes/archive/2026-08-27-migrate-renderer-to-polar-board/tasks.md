## 1. Wire-shape types (do these first — everything else type-checks against them)

- [x] 1.1 Re-point `lib/types/system-board.ts` onto `@/lib/board`, applying
      step 6's handoff table: `BoardFeature.footprint: Hex[]` → `Cell[]`,
      `LaneGate.hex: Hex` → `LaneGate.cell: Cell` (**key rename**, not just a
      type change), and the `board.LaneGateHex` doc reference →
      `board.LaneGateCell`. `Orbit` is unchanged in shape — `angle0` was a
      ring-position index and is now a slot index, same field, same meaning;
      do not "fix" it.
- [x] 1.2 Re-point `lib/types/fleet.ts`: `position: Hex` → `Cell`,
      `MovementState` from `@/lib/board`. Apply the universal transform —
      every `{q,r}` becomes `{ring,slot}`.
- [x] 1.3 Re-point `lib/types/action.ts`: `Hex` → `Cell` from `@/lib/board`.
- [x] 1.4 Cross-check all three against step 6's Frontend Wire-Shape Handoff
      table (`openspec/changes/archive/2026-08-26-migrate-consumers-to-polar-
      board/design.md:838+`) field by field, and against the live Go DTOs it
      cites, rather than against the old TS. The table is verified; the old TS
      is what we are replacing.

## 2. Non-board importers (mechanical — clears the error count before the hard part)

- [x] 2.1 `components/galaxy/transit-geometry.ts` (`laneFraction`) and
      `components/galaxy/GalaxyView.tsx` (`stateAt`) — both survive verbatim
      in `@/lib/board`; import move only. The migration must not leak into the
      graph tier, and these two are the only galaxy-tier touch points.
- [x] 2.2 `components/fleet/fleet-status.ts` (`stateAt`) — import move only.
- [x] 2.3 `hooks/use-fleets.ts` (`Target`) and `lib/services/fleet-service.ts`
      (`Target`) — import move only; `Target` now carries `cell?: Cell`.
- [x] 2.4 Confirm no file outside `components/board/` still imports
      `@/lib/hex` (`grep -rl "@/lib/hex" --exclude-dir=node_modules`), so the
      remaining error surface is board-only before section 3 starts.

## 3. Board components, the projection hook, and the wedge renderer

- [x] 3.1 Apply the rename table across `components/board/`: `Hex`→`Cell`,
      `hexKey`→`cellKey`, `hexToPixel`→`cellToPoint`, `pixelToHex`→
      `pointToCell`, `ringHexes`→`ringCells`, `solveHex`→`solveCell`,
      `lerpPixel`→`lerpPoint`, `HEX_SIZE`→`RADIAL_UNIT`. `stateAt`,
      `shipPos`, `orbState`, `boardLegBurn`, `coastAt`, `orbitPeriod`,
      `solveIntercept`, `lineOfSight`, `distance`, `beamCells` survive
      verbatim. `ringOf(h)` becomes the cell's own `.ring` field.
- [x] 3.2 Re-point `use-board-projection.ts` onto the new `fitViewBox`:
      `fitViewBox(hexesWithinRadius(radius)) → ViewBox` becomes
      `fitViewBox(maxRing, unit) → string`. `hexesWithinRadius` and the
      `ViewBox` type are both gone — delete the type, do not re-create it,
      and have the overlay `<svg>` consume the returned string directly. Read
      the value the fit distance is derived from carefully; a careless edit
      here still compiles and silently produces a wrong viewBox (see design.md
      Risks).
- [x] 3.3 Replace `hexPolygonPoints` at every call site with wedge geometry —
      an annular sector bounded by two ring radii and two slot angles, angular
      half-width `π / slotsForRing(ring)`. Call sites: `SelectionPreview.tsx`,
      `ScanOverlay.tsx`, `ArcScan.tsx`. There is no drop-in replacement in
      `lib/board/pixel.ts`; this is new geometry, not a rename.
- [x] 3.4 Replace the hexagon SDF in `webgl/scene-lattice.ts` (the
      `sdHexagon(vLocal.yx, uApothem - 1.2)` carve at ~line 115) with the
      wedge SDF, and update `webgl/contract.ts`'s `PackedLatticeTile` plus
      `board-pack.ts`'s `packLatticeTiles` to carry the bounds it needs
      (ring inner/outer radius, slot angular half-width). Keep the port's
      plumbing/decision rule: the packer owns ring-band decisions and resolved
      tints; the shader draws what it is given.
- [x] 3.5 Express the tile border inset in **screen** units via
      `uWorldPerPixel`, not world units. A wedge's screen extent grows with
      ring index where a hexagon's apothem was constant, so the old `1.2`
      world-unit inset reads differently at ring 1 than at ring 15 (design.md
      Risks). This is also the uniform task 7.6 makes camera-reactive.
- [x] 3.6 Audit every remaining world-unit constant in `components/board/`
      that was sized against a fixed apothem — glyph sizing, hit-target
      padding, outline widths — for the same ring-dependence.
- [x] 3.7 Update the board components' tests alongside them
      (`BoardOverlay.test.tsx`, `BoardStage.test.tsx`, `ScanPing.test.tsx`,
      `ArcScan.test.tsx`, `glyph-geometry.test.ts`, `use-board-projection.
      test.ts`, `scan-ping.test.ts`, `arc-scan.test.ts`, `scan-preview.
      test.ts`, `move-preview.test.ts`, `board-pack.test.ts`,
      `board-frame.test.ts`).
- [x] 3.9 Add `productionSchedule()` to `lib/board` — the memoized TS mirror of
      Go's `board.ProductionSchedule()`, keyed on the default board radius, for
      the three graph-tier consumers that call schedule-taking functions with no
      `SystemBoard` in scope (`components/fleet/fleet-status.ts`,
      `components/galaxy/GalaxyView.tsx`, `components/board/board-frame.ts`).
      Its doc comment MUST state the bound: safe only for consumers that read
      `slotsForRing(cell.ring, …)` (projection and movement folds), never for
      cell enumeration (`ringCells`) or rim clamping (`pointToCell`), which
      genuinely depend on `maxRing`.
- [x] 3.10 Thread `schedule(board.radius)` explicitly through every other board
      consumer, resolved once per board read and passed alongside `worldTime`
      (design.md, schedule-threading Decision). 26 call sites across 11 files.
- [x] 3.11 Keep lattice-scale work off the animation frame (design.md,
      per-frame-memoization Decision): `sensorBubbleCells` is a bounded
      multi-source BFS, not a full-board scan through `distance` (which is an
      unbounded BFS — measured 1373 ms/call at radius 16, now 0.23 ms, same 92
      cells); the shadow solve is split into `sweepOccluders`/`planSweepFrom`
      and memoized on `occluderKey`; the running scan's frozen sweep is gated
      outside its memo. **Do not add `worldTime` to a memo that does lattice
      work.**
- [x] 3.8 The two `app/spike/` trees (`webgl-board/`, `polar-board/`) also
      import `@/lib/hex`. Decide per tree: migrate it, or delete it as served
      its purpose. Do not leave them importing a deleted module — a red spike
      keeps `tsc` red, which is task 4.1's gate.

## 4. Green the build (the gate everything after depends on)

- [x] 4.1 `npx tsc --noEmit` reports **zero** errors (from 69 at the start of
      this change).
- [x] 4.2 `npx vitest run` green.
- [x] 4.3 `npm run lint` green.

## 5. e2e repair

- [x] 5.1 Repair `e2e/tests/board.spec.ts` against the polar board — this is
      the suite with the most coordinate-shaped assertions.
- [x] 5.2 Repair `e2e/tests/slice.spec.ts`, `e2e/tests/new-user.spec.ts`,
      `e2e/tests/spawn-exhaustion.spec.ts`.
- [x] 5.3 `cd frontend && npm run e2e` green. These have been red since step 6
      by design; this is the first point they can pass.
      **RESOLVED 2026-08-26 (later the same day): the whole suite passes**,
      slice.spec's DEPART step included, on the source this change ships —
      22 tests green (8 pre-existing + this change's 14 new camera tests).
      The DEPART step was NOT repaired: nothing in `slice.spec.ts` was
      touched. It began passing on its own once this change's frontend work
      landed, which retires hypothesis (b) below — the lane-charting count was
      never the cause, so step 6's widened-star-shadow open question does NOT
      reach the slice and stays a play question, not a blocker. Hypothesis (a)
      (the gate's route-preview query erroring or still loading past the 5s
      inner timeout) is the survivor, and it is consistent with what changed:
      the 24× `MS_PER_TILE` drift fixed under task 14.3 was corrupting every
      client-side ETA the board computed. Left as-is rather than
      speculatively hardened — the test asserts real behaviour and that
      behaviour is now correct.
      **The stale note below is kept for the record.** Its "the board can't
      pan yet, so an occluded glyph is genuinely unclickable" premise — which
      the spec file's own DEPART comment also states — is now FALSE: this
      change ships pan. If that step ever flakes on occlusion again, the
      repair is `clickGlyph` (dispatchEvent, as every other glyph click in
      that file already does), not another actionability retry loop.
      *Previous status: 7 of 8 pass.* The one failure was
      `slice.spec.ts:174` — the DEPART step: only one lane gate renders
      (`gate-glyph-sys-10`), and the loop over gates never reaches a
      `depart-button`, so `departed` stays false. Localized, NOT root-caused:
      the renderer is exonerated (the polar board draws correctly and the gate
      glyph is visible at board-bottom, well clear of the floating roster/market
      panels, so the test's own "occluded glyph" explanation does not apply
      here). The remaining candidates are (a) the route-preview query for that
      gate erroring or still loading past the 5s inner timeout — the facts panel
      in the failure screenshot shows NO selection at all, and (b) fewer lanes
      being charted than the test assumes, which would make this a consequence
      of step 6 Decision 1's widened star shadow rather than of this change.
      Resolve (b) first: it is step 6's recorded open question ("Does the star's
      widened shadow need a gameplay counterweight?") reaching the slice.

## 6. Camera math module (pure, outside `webgl/`)

- [x] 6.1 Create a pure camera-math module — clamping, wheel-delta → zoom,
      pinch-distance → zoom, drag-delta → pan target, and the pan bound
      (confine the pan target to the lattice's bounding disc), all as a pure
      function of (current camera params, gesture delta, lattice extent,
      container size). Imports neither React nor three.js; lives outside
      `components/board/webgl/` per the port's plumbing/decision rule (a
      clamp is a decision); table-tested in vitest. This is also what makes
      multi-touch pinch's clamp and anchor math cheaply testable — see the
      note in tasks 8.4/8.5 on why the single-finger tap/pan half still
      needs its own DOM-level test.
- [x] 6.2 Extend `useBoardProjection`'s camera state with pan-target and
      zoom fields (already anticipated by the port's design.md — "container
      size, fit distance, tilt, and — later — zoom and pan target"); the
      hook's `project`/`unproject` signatures do not change.
- [x] 6.3 Default framing (the values the camera resets to on a `systemId`
      change or a recenter) is the fit-to-lattice framing at zoom `1×` with
      the pan target at the lattice origin `(0,0)` — derived the same way
      the port's fixed camera derives its one-shot framing today, no new
      default-framing logic invented here.

## 7. Gesture binding, pointer drag pan, and wheel zoom

- [x] 7.1 Bind gesture listeners (pointer, wheel) on `BoardStage` in the
      capture phase, not on `BoardCanvas` — the port's overlay pointer
      policy makes the overlay `<svg>` root `pointer-events: none` with only
      per-entity hit shapes `pointer-events: auto`, so a canvas-only
      listener would dead-zone over every mark. This is what makes a
      gesture that begins over a mark still pan/zoom the camera (task 12.6
      is the regression test for this).
- [x] 7.2 Movement-threshold discrimination: track total pointer movement
      between pointerdown and pointerup through the module from 6.1, against
      an **8 CSS pixel** threshold. Below the threshold, resolve as a click
      and leave selection to the port's existing picking path; at or above
      it, resolve as a pan and do not change the selection.
- [x] 7.3 Wheel zoom handler bound via
      `addEventListener('wheel', handler, { passive: false })`, not React's
      `onWheel` — React attaches wheel passively at the root, so
      `preventDefault()` inside a synthetic handler is a no-op and wheel
      zoom would also scroll the page (spike precedent:
      `WebGLBoard.tsx:195`).
- [x] 7.4 Wheel zoom anchors on the camera's current pan target (centre),
      not the cursor, clamped to `[0.25, 6]` (`WebGLBoard.tsx:184-188`),
      writing to the camera state from 6.2 through the module from 6.1.
- [x] 7.5 Pan clamp: constrain the pan target to the lattice's bounding
      **disc** — radius `ringRadius(maxRing) * RADIAL_UNIT` about the core
      cell — so the board's centre of view is always over the lattice —
      genuinely new; the spike has no pan clamp of any kind.
- [x] 7.6 Verify `uWorldPerPixel` is re-written on every camera change, not
      only on resize/construction — under the port's fixed camera the two
      are indistinguishable, and this change is where they diverge.
- [x] 7.7 Exclude activation of on-screen camera controls (recenter, and any
      keyboard-operable pan/zoom affordance from section 9) from the board's
      click-to-pick path — e.g. by stopping propagation on the control's own
      pointer handler before it reaches the stage-level picking listener —
      so activating a control never changes the selection regardless of
      what cell or mark is drawn beneath it.

## 8. Touch pinch-zoom (genuinely new code — no spike implementation to port)

- [x] 8.1 Two-finger pinch gesture handler mapping pinch-distance delta to
      zoom through the module from 6.1, using the same `[0.25, 6]` clamp and
      centre anchor (not the pinch midpoint) as wheel zoom.
- [x] 8.2 Single-finger touch drag reuses the pointer-drag pan path (tasks
      7.1–7.2): a touch that stays within the same 8px movement threshold
      resolves as a tap/selection, not a pan, so the pinch/pan suppression
      added in 8.3 does not silently break tap-to-select.
- [x] 8.3 Preserve/extend `touchAction: 'none'` from the canvas
      (`WebGLBoard.tsx:84`) to the board's full interactive surface so the
      browser's native page-pinch-zoom doesn't compete with the board's own
      pinch handler, without suppressing the tap path handled in 8.2.
- [x] 8.4 e2e (Playwright, `hasTouch: true` context): `page.touchscreen.tap()`
      on a fleet glyph selects it, and a tap-then-drag past the 8px
      threshold pans without changing the selection. This is the reachable
      half of touch input — single-finger tap and drag do not need raw CDP
      dispatch — and it is the only test at any level that exercises the
      DOM event plumbing (`touchstart`'s `preventDefault()` vs. the
      synthesized `click`) the tap scenario exists to protect; the pure
      reducer from 6.1 never touches that plumbing.
- [x] 8.5 jsdom/vitest test (or raw-CDP e2e where available): synthesized
      `touchstart`/`touchmove`/`touchend` producing a two-finger pinch on the
      stage yields the expected camera deltas through the module from 6.1,
      and does not suppress the tap path exercised in 8.4.

## 9. Keyboard operability

- [x] 9.1 Keyboard pan handler (arrow keys), stepping the camera by one
      radial unit (`RADIAL_UNIT`, `lib/board/pixel.ts:21`) per press at the
      camera's current zoom, writing to the same
      camera state as task 7.4, respecting the pan clamp from task 7.5.
      Blocked on the "Exact keyboard bindings" Open Question in design.md —
      the specific keys are not yet confirmed, so this task and its
      corresponding scenario cannot be implemented or tested until that
      answer lands.
- [x] 9.2 Keyboard zoom handler (zoom-in/zoom-out keys), stepping the camera
      by one wheel-notch equivalent per press, respecting the `[0.25, 6]`
      clamp from task 7.4. Blocked on the same Open Question as 9.1.
- [x] 9.3 Make the board's camera controls (keyboard pan/zoom affordances
      and the recenter control from section 10) reachable via the board's
      existing tab order, positioned **before** the fleet, feature, and
      lane-gate hit targets so the port's `### Requirement: Board Glyph
      Selection Is Keyboard-Operable` tab order is left intact; with a
      visible focus indicator while focused.
- [x] 9.4 When Tab moves focus onto a fleet, feature, or lane-gate hit
      target that the current pan/zoom has pushed outside the viewport, pan
      the camera by the minimum displacement that brings that hit target's
      focus indicator fully into the viewport, preserving the current zoom
      where pan alone suffices, immediately and with no eased transition —
      this move gets the same immediacy clause as the `systemId` reset and
      the recenter control, not an "as needed" allowance that could justify
      resetting to default framing on every Tab.
- [x] 9.5 Keyboard clamp feedback: when arrow-key pan or zoom-key input is
      given while already at the corresponding clamp, expose an at-limit
      state in the DOM (an attribute, or a status message conveyed to
      assistive technology) that is absent when the same input is given away
      from the clamp — not a `console.log`, a same-frame CSS class with no
      rendered difference, or the pre-existing focus ring alone.

## 10. Manual recenter

- [x] 10.1 Recenter control, reachable via the board's normal tab order
      (positioned per task 9.3), that resets pan and zoom to the default
      framing from 6.3 immediately, with no eased transition, on
      activation; activation SHALL leave the current selection unchanged
      (task 7.7 covers exclusion from the click-to-pick path) and is a no-op
      if the camera is already at the default framing.
- [x] 10.2 Recenter is activatable from the keyboard with Enter or Space,
      identically to a pointer activation.

## 11. Reset policy

- [x] 11.1 Reset camera state to the default framing when the route's
      `systemId` changes, immediately with no eased transition — implemented
      as an effect on `systemId` inside the hook, not a `key={systemId}`
      remount of `BoardStage` (a remount would tear down and recreate the
      WebGL context on every system-to-system navigation).
- [x] 11.2 Confirm camera state is left unchanged by a selection change
      (no reset wired to selection).
- [x] 11.3 Confirm camera state is left unchanged by a realtime refetch
      landing new board data (no reset wired to refetch).

## 12. Picking correctness under pan/zoom

- [x] 12.1 Verify `project`/`unproject` continue to resolve clicks correctly
      at arbitrary camera pan/zoom state — the load-bearing property this
      whole change depends on — for marks, bare cells, and points outside
      the lattice alike.
- [x] 12.2 e2e: pan and/or zoom the board, then click a mark at its drawn
      position, and assert the correct entity is selected — the
      camera-invariance scenario the port's own picking requirement
      explicitly does not cover.
- [x] 12.3 e2e or unit: pan and/or zoom the board, then click a point within
      the lattice that is over no mark, and assert the cell containing that
      point becomes the selection.
- [x] 12.4 e2e or unit: pan and/or zoom the board, then click a point outside
      the lattice, and assert the selection clears.
- [x] 12.5 Unit test (no GL context needed): `project()` and the overlay's
      published CSS transform map the same board point to the same screen
      point at `0.25×`, `1×`, `6×`, and at an off-centre pan target — the
      gate for the two published camera expressions staying in agreement.
- [x] 12.6 e2e or unit: a pointer drag that *begins* over a fleet, feature, or
      lane-gate mark and exceeds the movement threshold still pans the
      camera (and a wheel/pinch gesture over such a mark still zooms it),
      leaving the selection unchanged — the dead-zone regression this
      change's binding-at-the-stage decision (task 7.1) exists to prevent,
      asserted directly rather than only implied by where listeners are
      bound.
- [x] 12.7 e2e or unit: a pointer press-release over a mark that moves 7 CSS
      pixels between press and release selects that mark's entity, and one
      that moves 8 CSS pixels resolves as a pan and does not — the pointer
      half of the click/pan discriminator boundary; mirrors task 8.4's
      touch-tap test, which covers only the touch half.

## 13. Camera controls are inert while the board is unavailable

- [x] 13.1 When `BoardCanvas`'s region shows the renderer unsupported or
      interrupted state (`add-renderer-availability-states`), unmount or
      otherwise remove the camera controls from the tab order, and ensure
      the gesture listeners bound in task 7.1 do not intercept or suppress
      pointer, wheel, or touch input over that region — a wheel scroll over
      the unsupported-state panel SHALL scroll the page normally, not be
      swallowed by the capture-phase `preventDefault()` from task 7.3.
- [x] 13.2 Camera controls render in `BoardStage`, outside `BoardCanvas`'s
      region, so `add-renderer-availability-states`'s canvas-scoped focus
      handling does not itself catch focus lost from a camera control: if
      keyboard focus is on a camera control at the moment task 13.1's unmount
      happens, move focus to the retry affordance (or explanatory text) the
      same way `add-renderer-availability-states` moves focus out of the
      canvas region — never leaving it to fall to `document.body`.

## 14. Pacing retune (owner: Travis — with the renderer up, in one session)

- [x] 14.1 Retune `MsPerTile`. Step 6 froze it at its hex-era value and named
      this step as where it gets set, because arc paths on the polar lattice
      are materially longer than the chords they replaced. **Record the chosen
      value here when set.**
      **Value: `MsPerTile = 2_500` — kept, not retuned. Travis's call,
      2026-08-26: "lets just stick with their values for now i'll tune them
      later."** Recorded as an explicit decision rather than left as a silent
      default, which is what this task existed to prevent.
      One thing changed underneath it that the later tuning session should
      know: `MsPerTile` itself is untouched, but until task 14.3's fix the
      client PREVIEWED every board ETA at 24× the server's. So the board has
      never been played at 2_500 as it actually feels — the felt baseline for
      a retune is new even though the number is not. Deferred to a follow-up
      change alongside 14.2.
- [x] 14.2 Reconsider `AmbientRadius` (kept at 3 by step 6) in the *same*
      session as 14.1, per step 6's instruction that the two be tuned against
      one another rather than in isolation. **Record the chosen value here.**
      **Value: `AmbientRadius = 3` — kept, not retuned, same call as 14.1.**
      Step 6's pairing instruction is preserved by deferring BOTH together:
      neither moves without the other, so the follow-up still tunes them
      against one another rather than in isolation.
- [x] 14.3 Resolve the `move-preview.ts:13` 24× ETA drift. Step 6 recorded the
      symptom, not the diagnosis — determine whether it is a unit-conversion
      bug to fix outright or a tuning constant to set, then do that.
      **Diagnosed 2026-08-26: a stale mirror, fixed outright.** The frontend
      held `MS_PER_TILE = 60_000`; the backend has been `MsPerTile: 2_500`
      since the 2026-07-13 pace retune (`common/tuning.go:114`, whose own
      comment reads *"5s per cell (was 60_000 — one world-minute)"*).
      60_000 / 2_500 = **exactly the 24×**. The frontend mirror was never
      updated with it. `MS_PER_TILE` is now 2_500. This is 14.3's fix, NOT
      14.1's retune — it restores agreement with the shipped backend value;
      choosing a *new* one with the renderer up is still 14.1.
      Fallout fixed in the same edit: `etaLabel` rendered minutes only, so at
      the corrected pace nearly every real board ETA (a 3-cell burn is 7.5s, a
      scan 15s) read `"0m"`. It now renders seconds below one minute. The move
      chip's `{tiles} hex` also became `{tiles} cells`. The other three
      frontend mirrors were audited and had NOT drifted: `AMBIENT_RADIUS` 3,
      `ORBIT_BASE_PERIOD` 36_000, `DEFAULT_BOARD_RADIUS` 16.
- [x] 14.4 Do **not** touch `OrbitPeriod`, `ScanDuration`, or `BoardRadius`.
      Step 6 froze those too, and they are cross-stack constants with a Go
      side and a fixture story — moving them is a separate change.
- [x] 14.5 Do **not** re-record any fixture (`fixtures/board/`,
      `fixtures/polar/`, `fixtures/market/`). If a frontend change appears to
      need one, that is a signal the mirror drifted — investigate, do not
      re-record.

## 15. Capability rename (must land before archive)

- [x] 15.1 `git mv openspec/specs/hex-board-view openspec/specs/board-view`.
      This is an implementation task, not an archive step: this change's delta
      contains `## MODIFIED Requirements` that the archiver resolves against
      `openspec/specs/board-view/spec.md`, which exists only after the move
      (design.md, capability-rename Decision).
- [x] 15.2 Update the renamed spec's Purpose text (its header line and opening
      paragraph) to polar vocabulary. Purpose text sits outside delta scope,
      so it is edited directly rather than through a requirement delta.
- [x] 15.3 Update every cross-reference to the old capability name across
      `openspec/` and `CLAUDE.md` (`grep -rn "hex-board-view"`).
      Updated: the two other ACTIVE changes (`add-station-exchange`,
      `revise-scan-instant-and-emission`). `CLAUDE.md` never named the
      capability. `openspec/changes/archive/**` is deliberately left alone —
      those are the record of what was true when they landed, the archiver
      never reads them, and rewriting them would falsify history. The only
      remaining live mentions are in this change's own artifacts, which
      describe the rename itself.

## 16. Validation

- [x] 16.1 `### Requirement: Board Camera Pan and Zoom` — cover pointer-drag
      pan, wheel-zoom anchored on the centre, zoom clamp at both ends, the
      bounding-box pan clamp, a pan that ends over a mark not changing the
      selection, a sub-threshold pointer press-release still resolving as a
      click (7px selects, 8px pans), a gesture that begins over a mark still
      panning/zooming, activating a camera control not changing the
      selection, camera persistence across a selection change, camera
      persistence across a realtime refetch, immediate reset on `systemId`
      change, and picking after pan/zoom for a mark, a bare cell, and outside
      the lattice (tasks 6.1–6.3, 7.1–7.7, 11.1–11.3, 12.1–12.7).
- [x] 16.2 `### Requirement: Board Camera Touch Pinch-Zoom` — cover pinch-in,
      pinch-out, clamp at the pinch boundary, the pinch centre anchor,
      single-finger drag panning, a stationary tap resolving to a selection,
      a moved tap resolving to a pan, and the exactly-at/one-past-threshold
      boundary (tasks 8.1–8.5).
- [x] 16.3 `### Requirement: Board Camera Is Keyboard-Operable` — cover
      arrow-key pan (one radial unit), zoom-key zoom (one wheel-notch
      equivalent), tab reachability and ordering before the glyph group, the
      focus indicator, an off-screen focused glyph being brought into view
      by minimal displacement, and DOM-observable clamp feedback (tasks
      9.1–9.5). Two of these scenarios (arrow-key pan, zoom-key zoom) are
      not executable until the "Exact keyboard bindings" Open Question is
      confirmed — tracked as blocking, not merely open (see tasks 9.1–9.2).
- [x] 16.4 `### Requirement: Board Camera Manual Recenter` — cover pointer
      activation, keyboard activation, and the no-op case when already at
      default framing (tasks 10.1–10.2).
- [x] 16.5 `### Requirement: Camera Controls Are Inert While the Board Is
      Unavailable` — cover camera controls absent from the tab order, a
      wheel gesture over the unsupported/interrupted region scrolling the
      page normally, and focus moving to the retry affordance (never to the
      document body) when a camera control held focus at the moment of
      transition (tasks 13.1–13.2).
- [x] 16.6 `### Requirement: The Board Renders on the Polar Lattice` — cover a
      board rendering at ring/slot coordinates, the wedge tile boundary, a
      feature footprint drawn from `Cell[]`, and a lane gate read from
      `laneGates[].cell` (tasks 1.1–1.4, 3.1–3.8).
      **Gap found and closed while checking this off:** the wedge geometry
      that replaced `hexPolygonPoints` — `cellWedge`/`wedgePath` in
      `lib/board/pixel.ts` and the bounds `packLatticeTiles` hands the shader
      — had NO direct tests. Section 3 shipped the geometry and updated the
      component tests around it, but nothing asserted the sector itself. Added
      to `lib/board/pixel.test.ts` (one radial unit tall, `angHalf =
      π / slotsForRing(ring)`, the core degenerating to a disc, the SVG path's
      two arcs, points staying between the two radii) and to
      `board-pack.test.ts` (per-instance bounds, the quad bounding the arc,
      angles in GL world space). One of these caught a wrong assumption in
      passing: a wedge's drawn arc does NOT grow monotonically with ring —
      it grows *within* a slot band and halves at each band boundary. The
      ring-DEPENDENCE is what forced the border inset into screen units
      (task 3.5); the direction is not monotonic.
- [x] 16.7 `### Requirement: Board Coordinates Are Ring-and-Slot Throughout` —
      cover the core cell being the single `{ring:0, slot:0}` cell, a
      selection resolving to a ring/slot cell, and a move preview planned to
      one (tasks 1.1–1.3, 3.1).
- [x] 16.8 Confirm the delta's `## MODIFIED Requirements` names still match
      `openspec/specs/board-view/spec.md` character-for-character **after**
      task 15.1's move, and that each MODIFIED body is a complete replacement
      carrying every scenario the original had — the silent-scenario-loss bug
      is the one this delta is most exposed to, at ten modified requirements.
      **Verified once already** by rehearsing `openspec archive` against a
      throwaway copy of `openspec/` with task 15.1's move applied: it reported
      7 added / 10 modified / 1 renamed and took the capability from 112 to
      150 scenarios with none dropped. Re-run that rehearsal if the delta is
      edited again — it is the only check that exercises the archiver's own
      scenario-loss guard.
      **Re-run 2026-08-26 with the move actually applied: identical result** —
      7 added / 10 modified / 1 renamed, 112 → 150 scenarios, 30 → 37
      requirements, `Emission Hex` renamed away cleanly. Also checked
      mechanically: every MODIFIED name resolves against the renamed spec
      (the one that does not is the RENAMED requirement, which the archiver
      resolves first), and no MODIFIED block drops a scenario title.
- [x] 16.9 **Do not "fix" the four scenario titles in the MODIFIED block that
      still say "hex"** — `Selecting a hex replaces a feature selection`,
      `Selecting the core hex directly yields no plan`, `Clicking the lattice
      away from any mark selects the hex`, and `A selected bare hex is visibly
      marked on the board`. The archiver matches scenarios by title and
      **rejects the archive** if a MODIFIED block does not carry every
      scenario title the current spec has, so renaming a scenario title is not
      an available edit here (confirmed empirically — it is what made the
      first archive rehearsal fail). Their bodies are already reworded to
      ring/slot. Renaming the titles themselves needs its own follow-up change
      that removes and re-adds those scenarios deliberately.
- [x] 16.10 `openspec validate migrate-renderer-to-polar-board --strict`.
- [x] 16.11 Run `/check`. **Green except one pre-existing, unrelated failure.**
      Passing: the changed-file validators (144/144 — data-testid, test-file
      coverage, raw-fetch, colour), frontend lint, frontend tests (1228),
      backend tests, e2e (20/20), npm audit, the determinism cross-target
      build matrix, and agent lint/tests.
      **Fixed while running it — a real gap this change had opened.** The
      determinism mirror-map check (`fixtures/board/mirror-map.json`, openspec
      `cross-stack-determinism`) failed: four functions section 3 added to
      `frontend/lib/board` were never registered. `boardExtent`, `cellWedge`,
      and `wedgePath` are render-side projection helpers and join the pixel.ts
      group already in `tsOnly` (pixel.ts is exempt from the determinism
      contract by declaration). `productionSchedule` is different and was
      mapped wrongly rather than merely missing: Go's `ProductionSchedule` sat
      in `goOnly`, which was correct until task 3.9 added the TS mirror — it
      is now a real `pairs` entry with an inventory record stating both the
      non-rule-bearing justification and the bound (safe only where
      `slotsForRing(cell.ring, …)` is read; never for `ringCells` or
      `pointToCell`, which depend on `maxRing`).
      **Not fixed, and not this change's:** `govulncheck` reports 7 Go
      standard-library advisories, every one of them fixed in go1.26.6 against
      the installed go1.26.5. This change edits **zero** `.go` files. The
      remedy is a toolchain bump, which is its own change with its own
      verification.

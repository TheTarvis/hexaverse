## Why

This is **step 7 of the approved polar migration** — the renderer step. Steps
5 and 6 (`rewrite-board-on-polar-lattice`, `migrate-consumers-to-polar-board`,
both archived 2026-08-26) rewrote the board's math on the polar ring-and-slot
lattice and moved every backend consumer onto it, deliberately leaving the
frontend red. Step 6's Non-Goals say so outright: *"No renderer work, no
`frontend/lib/types/*` edits, no e2e repair. Those are step 7. The 47 frontend
files still importing `lib/hex` stay broken."*

They are still broken. `frontend/lib/hex/` was deleted and renamed to
`frontend/lib/board/`; **39 frontend files still import `@/lib/hex`** and
`npx tsc --noEmit` reports **69 errors**. The frontend does not build. Nothing
downstream of the board — the M11 slice e2e, M12's exchange UI — can move until
it does.

This change also absorbs the board camera gestures that
`port-board-to-webgl-renderer` deferred (`docs/plans/webgl-board-port.md` phase
5: "pan, zoom, and touch pinch-zoom, always on"). They are not a separate
change because they cannot be: the gestures write into `useBoardProjection`,
which is itself one of the 39 broken files, and which is built on a
`fitViewBox` whose signature and return type both changed in the rewrite
(`fitViewBox(hexesWithinRadius(radius)) → ViewBox` became
`fitViewBox(maxRing, unit) → string`; `ViewBox` no longer exists). The camera
work and the migration touch the same hook on the same line — sequencing them
as two changes would mean writing the gesture handlers twice.

## What Changes

### The migration (step 7 proper)

- **Re-point the wire-shape types.** `frontend/lib/types/{fleet,action,
  system-board}.ts` move from `@/lib/hex` to `@/lib/board`, applying step 6's
  verified Frontend Wire-Shape Handoff table
  (`migrate-consumers-to-polar-board/design.md:838+`): the universal transform
  `{q,r}` → `{ring,slot}`, and the one key rename `laneGates[].hex` →
  `laneGates[].cell`. `Orbit` is **unchanged in shape** — it was already polar;
  `angle0` was a ring-position index and is now a slot index, same field, same
  meaning.
- **Follow the 39 importers** across all five affected areas — not only
  `components/board/`, but `components/galaxy/` (`transit-geometry.ts`,
  `GalaxyView.tsx`), `components/fleet/fleet-status.ts`, `hooks/use-fleets.ts`,
  and `lib/services/fleet-service.ts`. Most of it is the rename table
  (`Hex`→`Cell`, `hexKey`→`cellKey`, `hexToPixel`→`cellToPoint`,
  `pixelToHex`→`pointToCell`, `ringHexes`→`ringCells`, `solveHex`→`solveCell`,
  `lerpPixel`→`lerpPoint`); `stateAt`, `shipPos`, `orbState`, `solveIntercept`,
  `lineOfSight`, `distance`, and `laneFraction` survive verbatim.
- **BREAKING: rebuild the tile as an annular sector.** `hexPolygonPoints` has
  no replacement in `lib/board/pixel.ts` because a polar cell is not a hexagon.
  This reaches the shader: `webgl/scene-lattice.ts:115` carves each instanced
  tile out of its quad with an `sdHexagon` SDF against a `uApothem` uniform.
  The wedge (bounded by two ring radii and two slot angles) replaces it, and
  `PackedLatticeTile`/`packLatticeTiles` carry whatever the new SDF needs. This
  is the "board SVG, glides, wedge outlines" work `lib/board/pixel.ts`'s own
  header defers to "the renderer step of the polar migration".
- **Re-point `useBoardProjection` onto the new `fitViewBox`**, absorbing the
  signature and return-type change, and drop the dead `ViewBox` type.
- **Repair the e2e suite** — `e2e/tests/{board,slice,new-user,
  spawn-exhaustion}.spec.ts` — which has been red since step 6 by design.
- **Retune the movement pacing** step 6 handed forward: `MsPerTile` (arc paths
  are materially longer than the chords they replaced), `AmbientRadius`, and
  the `move-preview.ts:13` 24× ETA drift. Step 6 pinned these as
  owner-Travis, to be tuned *"in that same session, with the renderer up, so
  the two are tuned against one another rather than in isolation"* — so this
  change carries the retune as an explicit, owner-assigned task, not a silent
  default.
- **Rename the capability** `hex-board-view` → `board-view` and reword its
  coordinate vocabulary, which step 6 scheduled as *"step 7's spec work"*. Ten
  of its requirements carry hex vocabulary; one carries it in its **name**
  (`### Requirement: Running Scan Renders From Its Pinned Emission Hex`) and
  one carries a genuinely changed coordinate (the core is `{ring:0, slot:0}`,
  and there is exactly one core cell, not a `(0,0)` axial origin among many).

### The camera gestures (the deferred port work)

- Add `### Requirement: Board Camera Pan and Zoom` — pointer-drag pan and
  wheel-gesture zoom, clamped to a zoom range of `0.25×`–`6×` (inherited from
  the spike's tuned default, `WebGLBoard.tsx:187`) and to a pan range that
  confines the camera's pan target to the **lattice's bounding disc** (the
  polar lattice's natural bound — the rewrite's replacement for the hex
  lattice's bounding box; the spike has no pan clamp at all). Zoom keeps the
  camera's current pan target fixed on screen (the spike's actual,
  centre-anchored behavior — not cursor-anchored). Camera state persists across
  a selection change and across a realtime data refetch (an unrequested reset
  mid-interaction is hostile); it resets to the board's *default framing*
  (defined once, normatively: fit-to-lattice at zoom `1×`, pan target at the
  core cell) immediately, with no eased transition, when the route's `systemId`
  changes (a new board is a new view). A pointer sequence is discriminated by
  movement against an **8 CSS pixel** threshold (the common touch-slop
  convention, pinned rather than left blank) — movement under it resolves as a
  click, at or past it as a pan that MUST NOT change the selection — because
  gesture listeners and the port's per-entity hit targets share the same
  surface and would otherwise collide. A gesture that *begins* over a mark
  still pans/zooms exactly as one over bare board would; activating an
  on-screen camera control is likewise excluded from the click-to-pick path.
  This requirement also owns the property the port's own picking requirement
  explicitly does not cover: after any pan or zoom, a click still resolves to
  the correct entity or cell — on a mark, on a bare cell, or outside the
  lattice.
- Add `### Requirement: Board Camera Touch Pinch-Zoom` — genuinely new code;
  the spike sets `touchAction: 'none'` on the canvas but implements no touch
  handling at all. Two-finger pinch zooms within the same clamp as wheel zoom,
  anchored on the camera's current centre (identically to wheel zoom, not the
  pinch midpoint); a single-finger touch drag pans using the same behavior and
  clamp as pointer drag. The same 8px movement-threshold discrimination
  applies: a stationary tap resolves to a selection, not a pan — otherwise the
  `preventDefault()` needed to suppress the browser's native pinch would also
  suppress the synthesized click that selection depends on.
- Add `### Requirement: Board Camera Is Keyboard-Operable` — arrow-key pan
  (one **radial unit** per key press — the polar lattice's replacement for
  "one hex width", and the constant `lib/board/pixel.ts` already exports as
  `RADIAL_UNIT`) and dedicated zoom-in/zoom-out key input (one wheel-notch
  equivalent per press), respecting the same clamps as pointer and touch
  input, occupying the board's tab order **before** the fleet/feature/lane-gate
  hit targets, with a visible focus indicator, and giving a DOM-observable
  at-limit state when input is given at a clamp. Tab focus landing on a hit
  target that the current pan/zoom has pushed off-screen pans the camera by the
  minimum displacement that brings it into view, immediately and with no eased
  transition.
- Add `### Requirement: Board Camera Manual Recenter` — a control, reachable
  via the board's normal tab order, that resets pan/zoom to the default framing
  on demand and leaves the current selection unchanged. Without it, the only
  reset is the automatic one on `systemId` change, and a player who pans away
  has no way home short of leaving the route.
- Add `### Requirement: Camera Controls Are Inert While the Board Is
  Unavailable` — while the board's canvas region shows the renderer
  unsupported/interrupted state (`add-renderer-availability-states`), the
  camera controls SHALL NOT be rendered or reachable in the tab order, and
  camera gestures SHALL NOT intercept pointer, wheel, or touch input over that
  region.
- Camera tilt stays the port's fixed `14°` production constant and is
  explicitly **not** made user-controllable. Bare-cell keyboard traversal
  (arrow-key cell-to-cell movement) is explicitly **not** taken up here either
  — see Non-Goals in design.md.

## Impact

- **Affected specs:** `board-view` (renamed from `hex-board-view`).
- **Depends on** `rewrite-board-on-polar-lattice` and
  `migrate-consumers-to-polar-board` (both archived — this change is the step
  that consumes their handoff), and on `port-board-to-webgl-renderer` /
  `add-renderer-availability-states` (both archived) for the projection seam
  and the availability states the camera work builds on.
- **Affected code:** `frontend/lib/types/{fleet,action,system-board}.ts`;
  `frontend/components/board/` (including `webgl/scene-lattice.ts`,
  `webgl/contract.ts`, `board-pack.ts`, `use-board-projection.ts`);
  `frontend/components/galaxy/`; `frontend/components/fleet/`;
  `frontend/hooks/use-fleets.ts`; `frontend/lib/services/fleet-service.ts`;
  `frontend/e2e/tests/`; plus a new pure camera-math module under
  `components/board/` (outside `webgl/`, per the port's plumbing/decision
  rule).
- **The frontend build goes from red to green in this change.** That is the
  headline acceptance signal: `npx tsc --noEmit` clean, `npx vitest run` green,
  `npm run e2e` green.
- **No backend change.** Steps 5–6 already moved every Go consumer; this change
  consumes the wire shapes they ship and must not reopen them.

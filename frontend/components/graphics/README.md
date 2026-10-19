# WebGPU canvas foundation

`WebGPUCanvas` owns the renderer lifecycle. `WebGPUModelView` adds a reusable
raw-GLB review scene with camera framing, orbit controls and optional animation
playback. The game's `SpacecraftPreview` also uses this canvas; there is one
preview render loop. Review these under **Graphics** in Storybook.

Standalone canvas and raw-model stories fill the Storybook viewport and resize
with it. Narrow and HUD-card stories retain their explicit container sizes;
the production detail-preview stories retain the game's compact panel layout.

**Galaxy Map / Overview** and **Solar System / Overview** review the actual
game scene renderers at full viewport size with fixed local fixtures and no
backend/sign-in. Galaxy's existing **Overview** uses the in-app Stellar
art pass: the same surrounding sky and distant-star shell as Solar System, spectral stars
and a fixed 13-hop journey using existing fixture lanes. Its on-canvas controls
and Storybook Controls stay synchronized: palette, proposed/active/hidden route,
completed hops, wide/close framing, vision preview and original/Stellar art.
The text itinerary mirrors the route's system order. Stars Only and Original
stories isolate the scenery and prior look. Solar System includes spectral-class
and animation controls plus Frozen/Close stories. Both retain production camera
interactions. The in-app Galaxy and System views now use this shared sky with
the surrounding Dark seams lattice at distance 16, brightness 0 and 0.5px width.
The live galaxy also uses Stellar spheres and silver-blue lane filaments.

Both overview stories offer the surrounding hex lattice, ground grid
and no grid. Galaxy exposes the switch directly on canvas. Surrounding-grid
distance, brightness and thickness are adjustable on the Galaxy review panel
and in Storybook Controls for both scenes; Reset grid restores the current
review defaults. Distance controls shell radius and angular cell density so it
has a visible effect from inside the camera-centered shell. Brightness is
opacity; thickness is a real screen-space pixel width through Three's node-based
wide-line renderer, including its WebGL2 compatibility backend. Adjustments
update the existing sky; they do not reset the map camera or renderer.

**Dark seams** is the preferred review treatment: distance 16, brightness 0,
thickness 0.5px. Zero brightness deliberately draws black seams in this mode;
raising brightness lifts their ink color. **Luminous lines** retains the earlier
opacity-based treatment, where zero brightness hides the grid. The treatment
selector is available on canvas and in both stories' Controls.

`space-sky.ts` is the shared camera-centered backdrop/starfield factory. Its
orientation adapts System's Y-up and Galaxy's Z-up. The enclosing lattice is a
dual icosphere, mostly hexagons with twelve pentagons, in `hex-sky.ts`.
Review controls remain in Storybook. The in-app view containers select the
accepted surround mode and use the same shared preset; legacy ground/original
variants remain available for comparison.

Galaxy route ink is projected from the same native coordinates/camera onto a
pointer-transparent 2D overlay for constant pixel stroke, dash, arrow and casing
sizes. The entire route is rejected if any hop lacks a disclosed lane or system;
it does not create shortcuts, interpolate transit positions or execute travel.
Palette and progress changes keep the renderer/camera; explicit view/reset and
art changes may recreate it. Sky geometry/materials are instance-owned and are
disposed by each scene's existing resource owner.

Vision previews apply severity-1 Machado matrices in linear RGB to the map only,
with a grayscale option. Source tables and linear-space notes are linked in
`galaxy/map-vision-preview.tsx`. They are review aids; alternative palettes and
runtime art still need visual acceptance. See the
[runtime review](../../../.scratch/galaxy-canvas/galaxy-runtime-review-07.md) for evidence
and the headless native-WebGPU screenshot limitation.

**Game Preview** and the Model View Ship/Station stories render the actual
`SpacecraftPreview`, using `loadSpacecraftAsset` and `createSpacecraftModel`
for production materials, normalization and accent paint. **Model View / Raw GLB**
and the gate stories keep imported materials for new-asset art review. Changing
the asset URL there does not automatically apply spacecraft treatment.

`scene-resources.ts` owns the warm-key/blue-fill/blue-ambient light rig and
instance resource disposal. The production preview, raw model view and offline
thumbnail source all import this shared module. `SpaceWorld` remains separate.

To display another model, put its GLB in `frontend/public/models/` and use:

```tsx
<WebGPUModelView
  src="/models/space/lane-gate.glb"
  label="Lane gate"
  animation="Open"
  progress={1}
  style={{ height: 480 }}
/>
```

`progress` scrubs from 0 to 1; `playing` runs the selected clip forward/back.
`view` selects front, back, side or three-quarter; drag/scroll adjusts the camera.
Updating those props keeps the loaded model and renderer. Changing `src` replaces
and disposes the scene. Playback pauses while hidden/offscreen or when reduced
motion is requested. Explicit progress changes still render a static frame.

For custom geometry or effects, pass a stable `createScene` callback to
`WebGPUCanvas`. It receives a stable input `element`, an abort `signal` and
`invalidate()` for demand rendering. Return `{ scene, camera }`, plus optional
`frame(deltaSeconds, elapsedSeconds)`, `resize(width, height)` and `dispose()`.
Set `animate` when continuous frames are needed. The canvas adjusts perspective
camera aspect automatically; custom cameras/framing can use `resize`.

The canvas owns every geometry, material and texture placed in its scene and
disposes them on replacement/unmount, including late asynchronous results.
Return controls/listener cleanup from `dispose`. Create independent resources
per instance; immutable decoded image data may be shared by loaders. A renderer
recovery can replace the canvas, so attach input controls to `element`.
Factories should return their owned scene even after abort so it can be released;
clean up partial allocations if the factory itself throws.

Rendering uses the existing renderer owner: WebGPU first, WebGL2 compatibility
when needed, local interruption/retry notices, and fresh canvas recovery.
Set `surface`, `alpha` and `stencil` for the host surface; defaults are preview,
transparent, and no stencil. Renderer failures use `RendererStateNotice` with
its pinned test IDs and fixed user-facing cause text. Scene/asset loading
failures have a separate retry path and never display raw diagnostics.
`maxResolution` and `maxFramesPerSecond` let the game retain its existing
384px/30fps preview budgets. The canvas does not change the main system view.
The foundation does not
decide gameplay, asset appearance or HUD status treatment.

The gate GLB is the prepared output of Meshy task
`01a141b1-d0a3-726c-b0c3-72026ea0f5c1`: 14,540 triangles, two named rigid
halves, 2K PBR textures, and an `Open` clip. The opening is 70% of gate height.
The raw generation and preparation script are preserved in
`.scratch/hud-components/`; see `lane-gate-production-07.md`. The energy field
is a separate effect. Its single generated material atlas still needs masks or
material reassignment for independent family-wide palette controls.

Gate stories now compose the generated GLB with `createLaneGatePortal`, a
separate animated blue field that follows opening progress. Raw GLB keeps the
unmodified hardware view. The field attaches along the inner emitter spines,
with rounded top/bottom caps, a bright rim, blue membrane and moving filaments.
It uses ordinary transparent/additive materials for both renderer backends.

`WebGPUModelView` accepts an optional stable `createEffect({ bounds })` factory.
Return `{ object, update(progress, elapsedSeconds) }`. Bounds describe the loaded
model before centering; the effect object is added in centered scene space.
Effect resources are instance-owned and disposed with the scene. Effects use
the shared canvas loop, including visibility and reduced-motion behavior.
Changing the factory replaces the scene; progress changes update it in place.

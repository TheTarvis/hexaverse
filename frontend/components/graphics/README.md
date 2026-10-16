# WebGPU canvas foundation

`WebGPUCanvas` owns the renderer lifecycle. `WebGPUModelView` adds a reusable
raw-GLB review scene with camera framing, orbit controls and optional animation
playback. The game's `SpacecraftPreview` also uses this canvas; there is one
preview render loop. Review these under **Graphics** in Storybook.

Standalone canvas and raw-model stories fill the Storybook viewport and resize
with it. Narrow and HUD-card stories retain their explicit container sizes;
the production detail-preview stories retain the game's compact panel layout.

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

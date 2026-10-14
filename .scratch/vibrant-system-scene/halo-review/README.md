# Star halo and final scene review

The star corona now has a smaller footprint, lower additive brightness and softer
tendrils. The bright plasma surface, spectral colors and presentation animation
remain intact. System and inspector stars share this material. No new draw calls,
textures or per-frame CPU work were introduced.

## Matched spacecraft views

Before code is `e859c00`, captured in a temporary checkout. Both versions use
identical disclosed wire data, real imported models, 1440×1000 viewport, frozen
world clock, reduced motion and camera gestures. Each spacecraft fixture retains
normal high, normal low and close low captures on both actual GPU backends.

| Closer, low-angle view | Before | After |
| --- | --- | --- |
| WebGPU ships | [before](before/ships/webgpu-close-low.png) | [after](after/ships/webgpu-close-low.png) |
| WebGPU stations | [before](before/stations/webgpu-close-low.png) | [after](after/stations/webgpu-close-low.png) |
| WebGL2 ships | [before](before/ships/webgl2-close-low.png) | [after](after/ships/webgl2-close-low.png) |
| WebGL2 stations | [before](before/stations/webgl2-close-low.png) | [after](after/stations/webgl2-close-low.png) |

Inspected native WebGPU and WebGL2 output. The star remains bright and detailed,
with a compact surrounding glow. Nearby distant spacecraft have less glare
behind their silhouettes. At low angles the far ship/station still projects near
the photosphere and remains small; camera overlap and physical occlusion are
still possible. The existing foreground spacecraft materials are preserved.

## Whole-scene check

The representative system and a deliberately crowded 82-object fixture passed
keyboard, mouse and touch selection; orbit, pan and zoom; annotation priority
and collision suppression; reload; and leaving/reopening the route.

[WebGPU crowded view](after/system/webgpu-06-crowded.png) and
[WebGL2 crowded view](after/system/webgl2-06-crowded.png) retain the full scene.
The adjacent metrics record camera poses, diagnostics and frame scheduling.
In 119 settled crowded-scene intervals per backend, median was 16.7ms and p95
was 17.3ms (WebGPU) / 17.1ms (WebGL2), with no interval above 50ms. These are
local browser presentation samples, not GPU timings or a frame-rate guarantee.

## Validation

Seven browser tests passed in approximately one minute without skips: auth plus
ship, station and full-system journeys on native WebGPU and forced WebGL2. No
page exceptions or shader compilation errors were observed. The baseline passed
five browser tests. TypeScript, ESLint, explicit project file checks and all
2,217 frontend tests across 163 files passed. Existing stellar tests cover
non-targetable corona, stable orientation and independent resource disposal.
The temporary baseline checkout was removed.

## Reproduction

From the repository root:

```bash
SPACECRAFT_VISIBILITY_CAPTURE_DIR=/private/tmp/halo-captures/ships STATION_VISIBILITY_CAPTURE_DIR=/private/tmp/halo-captures/stations SCENE_ART_CAPTURE_DIR=/private/tmp/halo-captures/system bash scripts/dev/with-test-emulators.sh 'cd frontend && npx playwright test --project=chromium e2e/tests/spacecraft-visibility-journey.spec.ts e2e/tests/station-visibility-journey.spec.ts e2e/tests/refresh-system-scene-art-journey.spec.ts'
```

# Station visibility

Imported stations now receive a modest reflected-color lift and a cool grazing
highlight. The existing atlas, plate divisions and dark recesses remain visible.
Segmented running lights follow the outer ring, eight spokes and top hub rim.
Surface probes run only during model construction; the added paint shares one
geometry and material. Existing model size, position and camera defaults remain.

## Matched captures

Before code is `d359639`, captured from a temporary checkout. Both runs use the
same disclosed fixture, real station GLB, 1440×1000 viewport, frozen world clock,
reduced motion and camera gestures. Stations sit on opposite sides of the star
for sunlit and shadow-facing views.

| View | WebGPU before | WebGPU after | WebGL2 before | WebGL2 after |
| --- | --- | --- | --- | --- |
| Normal, higher angle | [before](before/webgpu-normal-high.png) | [after](after/webgpu-normal-high.png) | [before](before/webgl2-normal-high.png) | [after](after/webgl2-normal-high.png) |
| Normal, low angle | [before](before/webgpu-normal-low.png) | [after](after/webgpu-normal-low.png) | [before](before/webgl2-normal-low.png) | [after](after/webgl2-normal-low.png) |
| Closer, low angle | [before](before/webgpu-close-low.png) | [after](after/webgpu-close-low.png) | [before](before/webgl2-close-low.png) | [after](after/webgl2-close-low.png) |

The shadow-facing ring's blue-grey panels, lower edge and spoke structure are
clearer on both actual backends. The hub's light stays on its top rim. Distant
stations remain small at normal zoom; the low-angle far station still projects
into the star halo. This material pass does not change that framing limitation.

## Validation

TypeScript, ESLint and all 2,217 frontend tests across 163 files passed.
The repeated-import resource isolation contract now covers stations as well as
ships. Explicit project file checks passed.

Both actual rendering backends passed station selection, camera gestures and
reload; the existing ship journey passed on both backends too. No page exceptions
or shader compilation errors were observed. The broader system-scene journey
also passed on both backends during the material pass. A final station capture
passed three tests without skips in 23.8 seconds; the 45 spacecraft/model/preview
tests cover the shorter spoke light segments. The temporary baseline checkout
was removed.

Reproduce from the repository root:

```bash
STATION_VISIBILITY_CAPTURE_DIR=/private/tmp/station-captures bash scripts/dev/with-test-emulators.sh 'cd frontend && npx playwright test --project=chromium e2e/tests/station-visibility-journey.spec.ts'
```

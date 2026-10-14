# Spacecraft visibility and label placement

Imported ships now have clearer atlas panels, cool grazing highlights and running
lights that fit both the narrow prow and wider hull. Dedicated emissive textures
remain intact. Existing models, normalization, sizes, positions and camera
defaults are preserved.

Passive labels seek space clear of neighboring object silhouettes, including
partially clipped worlds. They hide when no clear position fits. Selected and
hovered labels try clear space first, then retain their disclosure in packed
views. Label collisions, viewport clamping and camera tracking remain supported.

## Matched captures

Before code is `db91e90`, captured from a temporary checkout. Both runs use the
same fixture, real imported models, 1440×1000 viewport, frozen world clock,
reduced motion, lighting and camera gestures. Two ships sit on opposite sides of
the star to expose sunlit and shadow-facing surfaces.

| View | WebGPU before | WebGPU after |
| --- | --- | --- |
| Normal, higher angle | [before](before/webgpu-normal-high.png) | [after](after/webgpu-normal-high.png) |
| Normal, low angle | [before](before/webgpu-normal-low.png) | [after](after/webgpu-normal-low.png) |
| Closer, low angle | [before](before/webgpu-close-low.png) | [after](after/webgpu-close-low.png) |

WebGL2 has the same three matching pairs with the `webgl2-` filename prefix.

Inspected actual output on both backends. The shadow-facing ship has clearer
blue-grey hull detail and green lights defining more of its length. It remains
a small object at normal zoom; close inspection shows the material changes most
clearly. At low angles the distant sunlit ship can sit near the star halo, while
its label moves to clearer space. This pass retains the model; further
art-direction judgement remains with the user.

## Validation

Final spacecraft and system-scene browser journeys: five passed in 43.1 seconds,
no skips, on actual WebGPU and WebGL2. Covered camera controls, fleet activation,
reload, selection, touch, crowded label collisions and route transitions. No
page exceptions or shader compilation errors were observed. Baseline capture
passed three browser tests.

The 44 spacecraft/model/preview tests passed after the final light fit. New
Stage tests cover neighboring surfaces, boxed-in passive labels with hover
disclosure, and partially visible worlds. Neighbor and viewport-edge tests
failed before their placement fixes. Existing bounds, source independence,
mode accents, refresh and disposal contracts passed.

Full frontend checks passed TypeScript, ESLint and all 2,216 tests across 163
files. Explicit project file checks passed. The temporary checkout was removed.

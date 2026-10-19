# Shared sky and enclosing lattice — round 08

2026-10-19. Storybook prototype; exact values awaiting review.

Travis found the galaxy background flat compared with the surrounding system
sky, suggested sharing the background, then proposed a hex lattice surrounding
the camera. He liked the first view, asked for a more distant feel and requested
distance, brightness and thickness controls.

Both scenes now use `graphics/space-sky.ts`: the system's backdrop material and
a spherical distant-star shell, camera-centered and world-oriented. The old
galaxy dust plane and planar decorative stars are removed. The optional hex
shell uses the dual of an icosphere, mostly hexagons with twelve pentagons.

Compare Surrounding, Ground and No grid in the existing Galaxy Overview or
Solar System Overview. Both have Storybook controls for distance, brightness and
thickness; Galaxy also has three on-canvas sliders and Reset grid. Distance
changes radius plus angular cell density, since radius alone cannot change the
appearance of a camera-centered sphere. Brightness is opacity. Thickness uses
Three's node-based wide-line renderer for actual pixel-width changes on both
renderer backends, rather than unsupported basic-line widths.

Initial review defaults: distance 20, brightness 4.5%, thickness 1px. Distant stars are
smaller/fainter than the first shell round. These are tunable review values, not
accepted final art. Runtime gameplay retains the existing ground-grid default;
the lattice switch and sliders are Storybook-only.

Static checks and 39 targeted galaxy/system renderer/art tests passed after the
control wiring. Browser checks at the exact Galaxy Overview URL exercised all
three sliders and reset, verified pixel changes for brightness/thickness, and
confirmed that slider changes retain the renderer and camera (within floating
point tolerance). The Solar System story also rendered with custom grid args;
no browser errors occurred. Faint-line alpha-to-coverage is disabled to prevent
MSAA backends from quantizing low brightness to invisible lines. Final visual
captures after that adjustment: [Galaxy controls](galaxy-sky-controls-08.png)
and [Solar System with custom settings](solar-sky-controls-08.png). The final
browser pass repeated successfully without errors after the alpha adjustment.

## Dark seams refinement

Travis liked the black-border look observed while tuning, specifically 0.5px
thickness; his screenshot showed distance 16 and brightness 0. Added an explicit
Dark seams treatment so this look does not depend on an intermediate shader or
an opacity artifact. It is now the review default at 16 / 0 / 0.5px in both
stories. Zero brightness gives black ink at full opacity; raising brightness
lifts its color. Luminous lines remains available with the earlier opacity
semantics. These remain visual review presets, not gameplay cells.

[Dark seams capture](galaxy-dark-seams-09.png): exact Overview URL verified the
16 / 0 / 0.5px defaults, visible dark ink at zero brightness, visual difference
from Luminous lines at zero and Reset grid restoring the preset. No browser
errors. Targeted ESLint and TypeScript passed.

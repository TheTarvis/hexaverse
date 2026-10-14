# Gas cloud shader follow-up

The user requested more varied, dynamic gas-giant surfaces after reviewing the
first scene pass. Gas giants now have four deterministic cloud morphologies,
chosen independently of their existing palettes. Their identity remains stable
on return visits.

The shader samples an owned procedural texture with differential latitude jets,
small cloud ripples and local oval-storm shear. It keeps incident lighting and
shadows, uses seed parameters as uniforms, and does not regenerate textures per
frame. Up to three visible giants larger than a small-screen detail threshold
animate; the selected giant receives priority. Hidden tabs and reduced motion
freeze decorative animation.

## Rendered comparison

The four study worlds use the same amber palette to make structural differences
visible. Camera perspective gives the nearer objects larger apparent sizes;
their served sizes are equal.

| Study ID | Cloud appearance | Location in the image |
| --- | --- | --- |
| `cloud-study-182` | Fine stripes | Upper middle |
| `cloud-study-185` | Broad belts | Right |
| `cloud-study-26` | Wispy layers with a small storm | Left |
| `cloud-study-2500` | Broad swirling storm eye | Lower foreground |

- Native WebGPU: [four cloud families](webgpu-cloud-families.png), [motion recording](webgpu-cloud-motion.webm).
- WebGL2 fallback: [four cloud families](webgl2-cloud-families.png), [motion recording](webgl2-cloud-motion.webm).

The recordings include selection and reduced-motion toggles. Motion is
deliberately slow; it animates cloud layers rather than moving the physical
planet. Not every seeded giant has a storm eye. Eyes are localized and can be
on the shadow side or another hemisphere at a given camera angle.

## Validation

Both actual rendering backends passed the new cloud journey and the existing
system art journey: five browser tests including authentication, no skips. The
cloud test verifies that cropped surface images remain identical under reduced
motion, change when motion is enabled, and freeze again when paused. The
existing journey covers camera controls, picking, annotations, crowded scenes
and route transitions. No shader compilation errors or page exceptions were
observed. Both output images were inspected.

Renderer/art tests cover unselected visible animation, selected priority in
crowded views, bounded animation, hidden/offscreen/distant suppression, stable
textures, pole/seam continuity, classification refresh and disposal. The new
animation tests failed under the old selection-only behavior before the renderer
change. `bash harness/check.sh --frontend --keep-going` passed TypeScript, ESLint
and all 2,213 tests across 163 files. Explicit project file checks passed.

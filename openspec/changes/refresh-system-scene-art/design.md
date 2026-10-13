## Context

The current Three.js renderer uses plain tinted spheres, a nearly black
background, hard spherical star halos, and a polar grid. The approved first
visual slice adds surface detail, smooth light, a restrained blue backdrop and
faint cyan hexes while preserving the current system, camera and HUD. Existing
uncommitted work owns the surrounding scene builder, camera and command views.
This change adds presentation requirements to `system-space-view` only.

## Goals / Non-Goals

Goals: recognizable gas bands and rocky surface variation, a thin rocky-body
atmospheric rim, class-aware stellar glow, readable blue space and a decorative
hex reference plane; deterministic and bounded resources; unchanged picking,
positions, sizes, selection and camera behavior.

Non-goals: HUD redesign, camera reframing, new gameplay/body types, inhabited
worlds, planetary rings, fleet/station/belt models, Meshy, external assets, new
packages, postprocessing bloom, backend/API or persistence changes.

## Decisions

### Keep the existing client renderer and published scene boundary

`SpaceWorld.tsx` stays the sole renderer integration point and consumes the
existing `frameRef`. No new route, data fetch, cache, server action, backend
contract, or state store is needed. All decorative body art derives from marks
already present in the fog-filtered published scene. Removing a mark removes
its art. Direct world children retain the existing one-mesh-per-mark shape;
additional objects live beneath the mark or `decor` group.

Keep draw scales, camera basis, hit projection, motion and fleet/selection cues
unchanged. Reframing or magnifying bodies could improve a screenshot but would
violate the requested controlled comparison and interfere with concurrent work.

### Generate bounded textures rather than acquire models

Add `scene-art.ts` with deterministic CPU-generated Three.js DataTextures:
`createSurfaceTexture(bodyType, seed)` returns a 256 x 128 RGBA sRGB texture for
rocky/gas_giant/ice/moon and null otherwise. Gas giants use broad latitude bands
with smaller turbulence; rocky bodies use irregular mineral terrain. Ice and
moons retain distinct coloration, with no invented Earth-like oceans or life.
Longitude sampling should be continuous across the UV seam. Body ID provides
variation; served type selects the treatment. Bind the texture to the actual
standard lit material using a white base color.

The existing sphere is sufficient geometry. Imported high-poly models would
add download, ownership, optimization and art-consistency work without solving
planet surface appearance. Pure GPU procedural materials are an alternative,
but bounded CPU textures provide inspectable deterministic data and reuse the
existing lighting pipeline. Keep patterns static for this slice; there is no
need for another clock or decorative animation.

### Use continuous glow falloff and preserve stellar identity

`createRadialGlowTexture()` produces a 128 x 128 RGBA texture whose alpha falls
smoothly from center to zero at the edge. Additive camera-facing sprites replace
the stellar halo shells. Preserve spectral-class tint: G/K and default stars
read warm while O/B/A retain cool identity. Star-positioned lighting continues
to illuminate bodies; modest ambient fill retains night-side readability.

A thin rim treatment on rocky surfaces supplies the requested atmospheric look
without asserting a gameplay atmosphere or habitability. It must preserve
surface visibility and avoid a solid translucent disk. Transparent art does not
write depth. Use restrained static blue background/haze behind the scene, with
no new selectable objects and no animation dependency.

### Replace polar spokes with batched decorative hex outlines

`createHexGrid(extent)` returns one LineSegments object in the existing XZ
reference plane. Use six-edge cells, positive extent-relative spacing, finite
coordinates, a footprint bounded to 1.1 times extent, and at most 30,000 line
vertices. Cyan lines are faint and transparent, depth-tested with depth writes
disabled. Fade toward the field edge and with camera distance so the plane does
not become an aliasing blanket at far zoom; tuning belongs to visual review.
Distance fading may use material opacity updated from the existing camera or a
material shader; it must not change grid positions or camera state.

The plane has no selectable entities, labels, territorial border or snapping.
Existing continuous-space point selection remains authoritative. Drawing a
single plane avoids any connection to gameplay grids or server geometry.

### Explicit appearance cache and resource ownership

Mesh cache appearance keys include kind, fleet mode, bodyType and starClass.
Stable appearances reuse textures and materials across frames; same-ID type or
class changes rebuild and release the old appearance. Textures are mesh-owned,
not held in a global cache. Teardown and removal traverse nested objects and
release textures and materials, including sprite materials, using identity
deduplication. Shared sphere/wire/octahedron geometry remains effect-owned and
is released only at renderer teardown. Static decorative geometry and materials
are owned by the effect and disposed once. No per-frame texture allocation.

Preserve the context-probe fail-soft path and first-frame callback. New art must
not introduce a second animation loop, browser clock or loading blocker.

### Separate machine-verifiable evidence from visual acceptance

The implementation contract at
`docs/handoffs/refresh-system-scene-art-impl-contract.md` fixes the helper APIs
for the independent SDET. Real Three texture pixels and geometry establish
determinism, variation and boundedness. Integration tests establish attachment,
appearance invalidation, cleanup, no hidden-object art, and retained scene shape.
Existing tests protect camera, motion and hit geometry. Renderer-only tests do
not prove a GPU compiled materials or that the art looks right.

Compare live-system screenshots at matching camera, viewport and scene time;
use a representative fixture for rocky bodies if the live system lacks them.
Inspect near/far zoom, star glow, atmospheric rim, planet detail, hex legibility,
selection cues and console/shader errors. Record browser/performance evidence
and limitations rather than inventing a percentile target. Follow the testing
tiers; the final journey runs after implementation with the tree locked.

## Risks / Trade-offs

Procedural detail may look repetitive or too small at normal gameplay scale;
visual comparison decides tuning. The fixed framing can limit the visible
improvement in a system with tiny bodies, but changing framing is out of scope.
Translucent sprites/shells can produce sorting artifacts; verify overlaps and
zoom on a real GPU. The old draw-test Three double lacks newer APIs; only the
SDET extends its recording surface, preserving existing assertions.

The supplied live system appears to lack a rocky planet. Never rewrite its
contents for visual acceptance: verify the live ice/gas treatment and separately
show the rocky fixture. The reference provides direction, not reusable assets.

## Migration Plan

No data or API migration. Land independent red tests, implement the helper and
renderer integration, run targeted tests/typechecking and frontend gates, then
capture the real browser comparison. Keep all edits within the renderer slice
and its new test/documentation files. Rollback removes the presentation helpers
and restores renderer materials/grid without touching saved state.

## Open Questions

None blocking implementation. Exact material intensity, palette, rim thickness,
hex spacing and fade remain visual tuning decisions within the bounds above.

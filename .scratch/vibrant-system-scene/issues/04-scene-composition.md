# Lighting, rocky belts, background and tactical hierarchy

Status: resolved
Type: task
Blocked by: 01, 02
Spec: ../spec.md

## Scope

Coordinate renderer lighting and tone mapping, bounded rocky belt geometry, subtle dark background, subdued depth-tested grid/orbit guides and crisp selection. Preserve camera, scales, positions, both backends and disposal. Own scene-renderer.ts and renderer tests.

## Validation

Use the spec-approved scene renderer/art, spacecraft integration, stage interaction and browser seams. Apply tdd for meaningful behavioral changes; do not test aesthetic constants or private mesh structure. Run harness/validate-file.sh after edits.

## Answer

Implemented the renderer composition pass in
`frontend/components/space/webgl/SpaceWorld.tsx` (the actual scene renderer).
Reduced ambient fill, added restrained cool hemisphere fill, and strengthened
the star-following key light. Orbit guides are subdued, depth tested, and masked
behind opaque silhouettes. The existing renderer color path was inspected; no
global renderer rewrite or backend-specific postprocessing was introduced.

Belts now render seeded, lit, irregular faceted rock instances, bounded to 384
per field, with per-facet and per-instance surface variation and 3D orbital
jitter. They follow served orbital elements and parent motion, refresh when
orbital data changes, remain non-pickable decoration, and stamp the same opaque
silhouette mask as worlds. Main belt targets now use faceted rock geometry
normalized inside the existing unit draw radius, preserving their mark
positions, scales and picking. Instance buffers, owned geometry and materials
are released on replacement, removal and teardown.

Validation: three observed red-to-green cycles at the existing actual Three
scene seam cover bounded orbit alignment, refresh/remount disposal and stable
appearance, and opaque belt grid masking. The art/draw/spacecraft/WebGPU focused
suites passed (44 tests), followed by the expanded art suite (16 tests),
including main target alignment and owned geometry removal. ESLint and frontend
TypeScript checks passed. Ran `harness/validate-file.sh` after edits. Browser
lighting, silhouette and performance assessment remains with ticket 05.

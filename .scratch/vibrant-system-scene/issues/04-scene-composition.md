# Lighting, rocky belts, background and tactical hierarchy

Status: ready-for-agent
Type: task
Blocked by: 01, 02
Spec: ../spec.md

## Scope

Coordinate renderer lighting and tone mapping, bounded rocky belt geometry, subtle dark background, subdued depth-tested grid/orbit guides and crisp selection. Preserve camera, scales, positions, both backends and disposal. Own scene-renderer.ts and renderer tests.

## Validation

Use the spec-approved scene renderer/art, spacecraft integration, stage interaction and browser seams. Apply tdd for meaningful behavioral changes; do not test aesthetic constants or private mesh structure. Run harness/validate-file.sh after edits.

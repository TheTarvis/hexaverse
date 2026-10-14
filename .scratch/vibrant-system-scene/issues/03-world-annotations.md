# Prioritized compact world-attached annotations

Status: resolved
Type: task
Blocked by: none
Spec: ../spec.md

## Scope

Extend stage annotation placement for compact served names or identifiers, selected/hover priority and extra disclosed information, collision suppression and viewport edges. Preserve pointer/touch/keyboard selection, camera controls and fog semantics. Own SpaceStage/overlay components and interaction tests; avoid scene-renderer.ts.

## Validation

Use the spec-approved scene renderer/art, spacecraft integration, stage interaction and browser seams. Apply tdd for meaningful behavioral changes; do not test aesthetic constants or private mesh structure. Run harness/validate-file.sh after edits.

## Answer

Implemented passive compact annotations for disclosed stars, bodies, belts, gates and own fleets in SpaceStage. Served scene names take precedence over identifiers; current wire data supplies identifiers. Selected, hovered and keyboard-focused objects receive placement priority and disclosed classification/activity detail. The existing transform loop places labels on each drawn frame, suppresses collisions and clamps labels within the viewport. Contact/sighting identities are never promoted into object annotations.

Implemented in `56cde64` and merged into `feat/vibrant-system-scene`. Validation: all 111 stage interaction, lifecycle, fleet, sighting selection guard and transform loop tests passed, along with frontend TypeScript, scoped ESLint and file validators. Integrated browser art and interaction review follows [ticket 05](05-browser-validation.md).

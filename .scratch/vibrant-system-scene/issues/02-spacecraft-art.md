# Spacecraft material contrast and running lights

Status: claimed
Type: task
Blocked by: none
Spec: ../spec.md

## Scope

Improve spacecraft-art imported materials and restrained emissive accents with existing geometry and apparent size. Preserve lifecycle, picking and classification behavior. Own spacecraft-art.ts and its tests.

## Validation

Use the spec-approved scene renderer/art, spacecraft integration, stage interaction and browser seams. Apply tdd for meaningful behavioral changes; do not test aesthetic constants or private mesh structure. Run harness/validate-file.sh after edits.

## Implementation

Imported diffuse-atlas emission is removed from instance-owned hull materials so incident light reveals surface detail and shadow depth. Dedicated emissive textures remain intact. Material response now supports crisp highlights, and surface-conforming mode accents have short running-light gaps. Geometry normalization, shared source assets, and resource ownership are unchanged.

Validation: the new hull-versus-dedicated-light regression failed before implementation and passed afterward. All 38 tests across spacecraft-art, SpaceWorld.spacecraft, and spacecraft-preview passed. Scoped ESLint, frontend TypeScript, and required file validators passed. Visual validation is coordinated on the integration branch.

# Spacecraft material contrast and running lights

Status: ready-for-agent
Type: task
Blocked by: none
Spec: ../spec.md

## Scope

Improve spacecraft-art imported materials and restrained emissive accents with existing geometry and apparent size. Preserve lifecycle, picking and classification behavior. Own spacecraft-art.ts and its tests.

## Validation

Use the spec-approved scene renderer/art, spacecraft integration, stage interaction and browser seams. Apply tdd for meaningful behavioral changes; do not test aesthetic constants or private mesh structure. Run harness/validate-file.sh after edits.

# Representative before/after scene validation and regression checks

Status: ready-for-agent
Type: task
Blocked by: 03, 04
Spec: ../spec.md

## Scope

Use existing browser system-view seam to capture matched before/after low/high angles and near/normal distances including stars, varied worlds, fleet, station and belt. Verify interactions, backend compatibility, scene transitions and crowded responsiveness. Record actual observations and limitations; run frontend checks and relevant tests.

## Validation

Use the spec-approved scene renderer/art, spacecraft integration, stage interaction and browser seams. Apply tdd for meaningful behavioral changes; do not test aesthetic constants or private mesh structure. Run harness/validate-file.sh after edits.

# Representative before/after scene validation and regression checks

Status: resolved
Type: task
Blocked by: 03, 04
Spec: ../spec.md

## Scope

Use existing browser system-view seam to capture matched before/after low/high angles and near/normal distances including stars, varied worlds, fleet, station and belt. Verify interactions, backend compatibility, scene transitions and crowded responsiveness. Record actual observations and limitations; run frontend checks and relevant tests.

## Validation

Use the spec-approved scene renderer/art, spacecraft integration, stage interaction and browser seams. Apply tdd for meaningful behavioral changes; do not test aesthetic constants or private mesh structure. Run harness/validate-file.sh after edits.

## Implementation

Expanded the existing authenticated system-view journey with a fixed representative fixture, matched low/high and closer/normal views, crowded comparison, actual native WebGPU and forced WebGL2 readiness, annotation behavior, mouse/touch/keyboard selection, camera controls, reload and route remount. Retained screenshots and observed limits are in [the review](../review/README.md), including camera/backend metadata and presentation-scheduling comparisons. Both real-backend journeys passed (3 tests including auth setup, no skips).

Actual screenshot review prompted two in-scope adjustments: a cloned diffuse material response lift for ships, and a viewport-scaled passive-label budget that preserves focus priority and favors key objects. The latter was built red-green at the approved Stage interaction seam: the separated 48-world fixture originally exposed 39 labels, then passed restrained-density, hovered disclosure and selected-priority behavior after implementation. All 42 Stage interaction tests passed, along with existing spacecraft/scene lifecycle coverage, scoped ESLint, TypeScript and required file validators.

These checks do not constitute final art-direction acceptance. The imported ship remains small/dark in shadow at normal distance; retained-model assessment and the user's review of the final matched views remain documented in the review.

## Answer

Implemented in `44983e1` and merged into `feat/vibrant-system-scene`. Actual native WebGPU and forced WebGL2 browser journeys passed all three tests without skips, covering selection, touch, keyboard, camera controls, annotation collisions and scene transitions. Matched camera and fixture pairs are retained as 24 screenshots with backend metadata, metrics and observed visual limitations in [the review](../review/README.md).

The density regression passed with all 42 interaction tests; 56 relevant tests passed after integration synchronization. Scoped ESLint, frontend TypeScript and required file validators passed. Final integration code review remains outstanding; the recorded visual limitations and user art-direction review remain visible in the review document.

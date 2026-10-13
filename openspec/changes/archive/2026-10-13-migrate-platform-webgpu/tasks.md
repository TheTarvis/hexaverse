## 1. Contract and red coverage

- [x] 1.1 Publish an implementation contract for shared asynchronous renderer ownership, backend diagnostics, first-frame readiness, loss/retry, separate 15-second initialization and eligible first-presentation budgets, stable Three imports and injectable test factories (platform-rendering lifecycle requirements).
- [x] 1.2 Publish the shared stellar factory/advance/dispose and selected-preview contract, spectral fallback, resource bounds and galaxy scene integration decisions (stellar requirements and scene preservation).
- [x] 1.3 Write tier-1 red coverage for all backend selection, cancellation, readiness, loss/retry, diagnostic containment, initialization/first-presentation deadline boundaries, first-frame fallback, post-ready frame/resize/update failure and zero-size scenarios; map retained recovery scenarios to existing or extended tests.
- [x] 1.4 Write tier-1 red coverage for stellar evolution/class/picking, preview eligibility/orientation/lifecycle/bounds/reduced motion, all five renderer owners and galaxy interaction regressions; publish scenario coverage and record the immutable red manifest before development.

## 2. Shared renderer ownership

- [x] 2.1 Implement WebGPU-primary initialization and WebGL2 compatibility fallback, actual-backend evidence, fresh compatibility on primary first-frame failure and local both-backends-failed results (WebGPU Primary Backend).
- [x] 2.2 Implement attempt cancellation, stale completion disposal, zero-size deferral, 15-second per-backend initialization and eligible first-presentation expiry with suspension exclusion, and first-presented-frame readiness (Asynchronous Renderer Attempt Ownership).
- [x] 2.3 Implement device/context loss containment, explicit device recreation, compatibility restoration, duplicate retry exclusion nonthrowing diagnostics and post-ready frame/resize/update failure containment without autonomous retry (Backend Loss Containment).
- [x] 2.4 Migrate system/galaxy guards and loading/retry notices; preserve every retained unavailable/recovery scenario, panel state and data-error precedence (both MODIFIED recovery requirements).

## 3. System scene and materials

- [x] 3.1 Move the system scene onto shared renderer ownership while preserving camera, world-position updates, selection, reticles and picking (Migrated Scene Interaction Preservation).
- [x] 3.2 Migrate gas-cloud, atmosphere and background custom effects to materials usable on both backends; retain existing art and hex reference-plane masking (system-effects preservation scenario).
- [x] 3.3 Implement the shared stellar surface and corona with served class/fallback and non-rigid evolution (Evolving Stellar Plasma and Corona).
- [x] 3.4 Integrate star animation into the existing map loop with reduced-motion freezing and unchanged pick envelopes/world positions (stellar corona and reduced-motion scenarios).

## 4. Selected detail previews

- [x] 4.1 Migrate all selected model previews to shared renderer ownership with independent disposal, local pending/error/retry states and late-completion containment (preview and platform lifecycle requirements).
- [x] 4.2 Add the selected stellar preview using the shared model family, matching identity/class and dimensions, isolated accessible orientation and reset (Selected Star Detail Preview and retained spacecraft scenarios).
- [x] 4.3 Enforce selected-only instances, visibility/offscreen/zero-size draw suspension, 30fps/384-device-pixel limits and no hidden-time catch-up or autonomous rotation (Bounded Stellar Presentation).

## 5. Galaxy and development surfaces

- [x] 5.1 Replace the renderer-owning galaxy dependency path with an explicitly owned WebGPU-primary scene and retain fixed positions, region sprites, lanes, grid and fleet presence (galaxy preservation scenario).
- [x] 5.2 Preserve galaxy hover, selection toggle/background clear, camera controls, recenter and double-click focus without changing fog projection or outer panel behavior (galaxy preservation and MODIFIED recovery scenarios).
- [x] 5.3 Migrate Intel spike and Space 3D spike to shared initialization, resize, local failure/retry and disposal (all platform-rendering requirements).
- [x] 5.4 Audit every frontend 3D owner and custom shader path; remove obsolete renderer dependency usage and reconcile stable Three imports without modifying pending predecessor artifacts (WebGPU Primary Backend and scene preservation).

## 6. Integration verification

- [x] 6.1 Verify red-manifest integrity and run focused tier-1 suites for all scenario mappings; resolve missing coverage without weakening the red suite.
- [x] 6.2 Verify frontend production bundling, types and lint against actual installed renderer/material exports; resolve constructor duplication or unsupported material paths.
- [x] 6.3 Review scene/preview behavior on real frames using both actual WebGPU and forced compatibility backends: evolving star time-separated captures, map/preview match, spectral distinction, mask/transparency, galaxy interactions and both spikes; retain evidence and label unavailable backend proof BLOCKED rather than substituting mocks.
- [x] 6.4 Verify a real asynchronous failure and device-loss/retry flow with latest data and preserved panels; record backend type and resource/navigation observations without claiming an invented hardware FPS floor.

## 7. Final gates

- [x] 7.1 Run the per-commit gate (tiers 0–1 in docs/testing-tiers.md) and strict OpenSpec validation plus reconciliation; preserve unrelated working-tree changes.
- [x] 7.2 After implementation tasks are complete, write one journey spec against the implemented UI; lock the tree and run tier 4 then tier 3 once each at archive time under docs/testing-tiers.md, batching any findings into one repair round.
- [x] 7.3 Write docs/handoffs/migrate-platform-webgpu-journey.md with scenario evidence, backend limitations and the tier-3/tier-4 suite budget line; finish final team acceptance without claiming blocked evidence or unfinished predecessor work complete.

## Completion and archive readiness

Implementation and all verification tasks are complete. Six native WebGPU/compatibility browser legs pass. The current-HUD reconciliation and galaxy Jump fix have 44 latest passing browser outcomes (including authentication) across the recorded runs; historical optional console observations remain explicitly untested rather than counted as acceptance passes. Frontend unit, lint/type and production-build evidence is recorded in the integrity report. The consolidated full backend gate passes 2,014 tests with one expected fixture-regeneration skip, zero failures, in 18 minutes 6 seconds.

Task 7.2 is complete. See docs/handoffs/current-hud-test-reconciliation.md, galaxy-jump-double-submit.md and migrate-platform-webgpu-backend-suite.md for the superseding evidence. The renderer-availability delta is reconciled with the current Objects/vitals/Console HUD and the onboarding change's explicit retirement of legacy flight controls. Archive validation and spec synchronization must use these final artifacts. No archive, commit or deployment has yet been performed. Other active changes remain separate.

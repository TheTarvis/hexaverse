## Why

Every browser 3D surface currently depends on WebGL, and the system star appears static while its selected detail shows an unrelated thumbnail. The user requested a whole-platform WebGPU migration with an evolving stellar surface and the same star model in the left navigation.

## What Changes

- Use WebGPU as the primary backend for the system map, selected detail previews, galaxy graph, Intel spike and Space 3D spike, retaining the renderer's WebGL2 compatibility backend when WebGPU initialization fails.
- Own asynchronous initialization, cancellation, first-frame readiness, device/context loss and retry consistently across those surfaces.
- Migrate custom material effects and the galaxy renderer while preserving existing art, gameplay interaction, fog-filtered data boundaries and accessibility.
- Add evolving plasma and a soft corona, spectral-class distinction and an isolated selected-star detail preview using the same model family; retain reduced-motion behavior and bounded preview drawing.

## Impact

- Affected specs: `platform-rendering` (new), `system-space-view`, `galaxy-view`.
- Affected code: frontend rendering guards, space scene/materials/previews, galaxy graph/camera integration, active spike routes and frontend renderer tests/dependencies.
- No backend, API, database, simulation, authentication or deployment changes.
- Source: `docs/plans/webgpu-migration/brief.md`; decisions: `docs/handoffs/migrate-platform-webgpu-rulings-index.md`.
- Predecessor `refresh-system-scene-art` remains unfinished and unarchived. Its five pending ADDED requirements and tasks are preserved; its WebGL interruption scenario continues to apply to compatibility fallback. This change uses distinct stellar requirement names and adds device-loss obligations. Other active HUD, onboarding and command-view artifacts remain unchanged.

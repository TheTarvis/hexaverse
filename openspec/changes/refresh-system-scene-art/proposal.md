## Why

The system scene currently appears flat and nearly black beside the user's visual reference (`docs/ideas/img.png`). The approved first slice brings luminous stars, detailed planets and a cyan hex reference plane into the existing renderer so the art direction can be judged before expanding the HUD or asset catalog.

## What Changes

- Present stars with soft emission and spectral-class color distinction.
- Add deterministic gas-giant bands and rocky surface detail with a decorative atmospheric rim.
- Add a blue-black backdrop and faint, noninteractive cyan hex outlines.
- Preserve served contents, continuous-space picking, camera, HUD and renderer recovery.
- Evaluate the real system and a representative renderer fixture at controlled framing; defer ships, stations, belts, rings, Meshy and HUD redesign.

## Impact

- Affected specs: `system-space-view` (additive requirements only).
- Affected code: `frontend/components/space/webgl/SpaceWorld.tsx`, renderer art helpers and focused tests.
- No backend, API, simulation, asset service or persistence changes.
- Source analysis: `docs/handoffs/refresh-system-scene-art-analysis.md`.

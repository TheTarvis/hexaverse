> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Whole-platform WebGPU migration

## User request (source)

The user first supplied a system-view screenshot and requested:

> 1) the star's shader is borning and static. I would like to see a more realistic and animated star 2) the model should be used in the left nav.

After discussion of WebGPU versus WebGL and a suggestion to prototype only the system view, the user explicitly expanded the scope:

> I want the whole platform upgradd to WebGPU. go ahead nad have a team author and implement this migration.

This authorizes the team to author, review, implement, and verify the whole migration without another specification approval. It does not authorize publishing, unrelated edits, or paid external services.

## Delivery intent

Migrate every browser 3D rendering surface to WebGPU as its primary backend: system scene, left-nav model previews, galaxy overview, and active development/spike surfaces. Preserve gameplay, navigation, selection, accessibility, fog-filtered data boundaries, and existing assets. Deliver an animated stellar surface and corona with the same star model/material family in the left navigation. Technical decisions must account for the installed Three.js version and actual dependency capabilities.

The prior discussion proposed Three.js WebGPURenderer and node materials/TSL, retaining its WebGL2 compatibility fallback for browsers without usable WebGPU. This is an engineering default for review, not permission to retain a separate legacy renderer in the galaxy or any other surface. Shader.com interoperability is unproven and its MCP is not installed; the work must not depend on it.

## Known investigation leads (verify against repository)

- System scene: SpaceWorld.tsx; shared render guards and SpaceCanvas currently have WebGL-specific availability/recovery.
- Model previews: spacecraft-preview.ts; left-nav celestial previews must match the scene.
- Custom star, gas cloud, atmosphere and background shaders require migration; stencil grid masking needs verification.
- GalaxyGraph uses react-force-graph-3d. The installed transitive three-render-objects exposes useWebGPU, but 3d-force-graph does not forward it and EffectComposer is constructed unconditionally. Adding a prop is insufficient evidence of migration.
- Development rendering surfaces include spike/intel and spike/space-3d.

## Constraints

Read repository guidance before edits; use shared harness roles and skills. Preserve preexisting work. Baseline observed by orchestrator: clean working tree, commit 27b4ce2. Tests and budgets are defined by docs/testing-tiers.md. Use separate author, reviewer, SDET and implementation roles; retain durable records in docs/handoffs. No backend or database behavior changes are requested.

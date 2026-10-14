# Vibrant system scene

Status: resolved

## Problem Statement

The local system view feels muted compared with the supplied space-strategy reference. Worlds lean toward similar brown and grey palettes, lighting does not give surfaces enough contrast, and ships, stations, and resource belts lack visual presence at normal play distance. Increasing saturation alone would leave the underlying readability and lighting problems unresolved.

The player wants colorful, textured 3D objects, luminous stars, crisp highlights, deep shadows, and clear tactical overlays. The reference communicates the desired richness; its camera framing is not a requirement. The current screenshot shows one position of the player-controlled camera.

## Solution

Give the system scene a coordinated cinematic art pass across procedural textures, materials, lighting, selective shader effects, belts, background, and world-attached overlays. Favor exaggerated but believable surfaces over strict physical realism. Worlds should have distinct visual identities, spacecraft should remain recognizable against dark space, and tactical indicators should be easy to read without dominating the scene.

For this feature, the scene includes annotations attached to objects even when HTML renders them. Fixed screen panels, menus, and toolbars are outside the scope. Preserve player-controlled orbit, pan, and zoom, and review the result across multiple camera angles and distances.

## User Stories

1. As a player, I want the system scene to feel colorful and cinematic, so that exploring a system has the visual richness of the supplied reference.
2. As a player, I want textured 3D worlds, so that colorful surfaces still feel like tangible objects.
3. As a player, I want worlds with distinct palettes, so that I can distinguish nearby objects at a glance.
4. As a player, I want blue oceans and green land among suitable world appearances, so that rocky worlds are not limited to grey and tan.
5. As a player, I want rust-red desert appearances, so that warm terrestrial palettes have their own identity.
6. As a player, I want pale icy worlds with readable surface detail, so that ice remains distinct without becoming a featureless white sphere.
7. As a player, I want gas giants with varied colored bands, so that multiple giants do not all look brown and interchangeable.
8. As a player, I want brighter sunlit surfaces and deep shadow sides, so that lighting reveals the volume of each world.
9. As a player, I want restrained atmospheric rims, so that suitable worlds stand out against space without obscuring their surfaces.
10. As a player, I want luminous stars with visible surface detail, so that the system's light source feels powerful and recognizable.
11. As a player, I want controlled star glow, so that nearby worlds and spacecraft remain readable.
12. As a player, I want ships to have clear silhouettes at normal play distance, so that I can recognize my fleet without zooming in first.
13. As a player, I want stations to have clear silhouettes and material contrast, so that I can identify trading venues in the scene.
14. As a player, I want restrained spacecraft running lights, so that small objects remain visible against dark space.
15. As a player, I want additional spacecraft detail to become visible as I zoom in, so that close inspection is rewarding.
16. As a player, I want resource belts to read as rocky structures with depth, so that they feel like places rather than grey point clouds.
17. As a player, I want subtle color in the surrounding space, so that the backdrop supports the cinematic scene.
18. As a player, I want open space to remain dark, so that bright objects and indicators retain contrast.
19. As a player, I want a readable but subdued tactical grid, so that it helps orientation without competing with world surfaces.
20. As a player, I want bright selection markers, so that my current target is immediately apparent.
21. As a player, I want compact names for key objects when space permits, so that I can identify them directly in the scene.
22. As a player, I want labels to avoid overlaps, so that a crowded view remains readable.
23. As a player, I want selected or hovered objects to receive priority and additional disclosed information, so that I can inspect my focus without displaying full details everywhere.
24. As a player, I want object labels and markers to follow their objects as I move the camera, so that annotations remain attached to the correct target.
25. As a player, I want camera gestures and object selection to keep working through overlays, so that improved presentation does not interfere with navigation.
26. As a player, I want the art direction to hold up at low and high camera angles and multiple zoom levels, so that I can choose my own view.
27. As a player, I want the same world to retain its visual identity when I return to it, so that I can recognize familiar places.

## Implementation Decisions

- Apply a coordinated scene art pass rather than an isolated saturation increase. The primary work is procedural textures, materials, and lighting; use custom shader effects selectively. Belt geometry is the main expected mesh work.
- Extend the existing deterministic procedural planet-art module with broader palettes and more recognizable surface variation. Preserve stable identity per object and existing body classifications. Surface styling does not introduce new climate, habitability, resource, or gameplay facts.
- Tune scene lighting and material response together to produce bright highlights and deep shadows while retaining recognizable silhouettes. Inspect renderer color handling and tone mapping as needed; no specific postprocessing technique or numeric setting was settled in the interview.
- Refine the existing star-art module's surface and corona together. Preserve star-class distinctions and prevent glow from washing out nearby objects.
- Keep the existing ship and station geometry for the first pass. Improve imported materials, emissive accents, and their appearance under system lighting. Replacing these models requires a later assessment if their silhouettes remain weak.
- Improve belts beyond their current grey-point appearance with recognizable rocky form, surface variation, and depth. Choose a bounded rendering strategy appropriate to scene density; the exact mesh or instancing technique is an implementation choice.
- Add restrained background color while retaining dark negative space around scene objects.
- Tune the decorative hex grid and existing orbit guides as supporting layers. Keep grid lines from drawing across opaque object silhouettes. Stronger cyan belongs primarily to selection and interaction indicators; do not invent a luminous perimeter with implied territorial or gameplay meaning.
- Extend existing world-attached overlay placement rather than requiring all text to become GPU-rendered. Give selected and hovered objects priority, display compact names for key objects when space permits, suppress overlapping lower-priority labels, and reveal additional information on selection or hover.
- Use served names when available and existing identifiers otherwise. Annotations must use the current scene's disclosed data and preserve observation and fog semantics; do not add inferred ownership or hidden facts.
- Preserve camera controls, projection, picking alignment, continuous-space positions, and current apparent object sizes. The screenshot's angle is player-selected. Camera defaults, forced viewpoints, and scale changes are not part of this pass.
- Keep changes within existing scene-art, star-art, spacecraft-art, scene-rendering, and world-attached overlay responsibilities. No backend schema or API changes are needed.
- Preserve existing WebGPU rendering and WebGL2 fallback, renderer lifecycle, resource disposal, and reduced-motion behavior. Prefer bounded detail and selective animation rather than making every object expensive at every zoom level.

## Testing Decisions

- The user confirmed the existing system-view browser seam as the primary validation approach. Compare the same scene before and after at several camera angles and zoom levels, and verify selection, labels, and camera controls there. Automated pixel-baseline comparisons are not required for this first pass.
- A good test verifies visible behavior or a meaningful existing contract. Do not add tests that simply assert chosen color constants, shader source strings, or private mesh structure as a substitute for reviewing the rendered result.
- Capture matching before-and-after views of a representative system containing a star, varied worlds, a station, a fleet, and a belt. Include the supplied low-angle view, a higher tactical angle, normal play distance, and closer inspection. Use consistent scene data, viewport, camera, and decorative animation state where feasible.
- Visually verify distinct world palettes, surface detail, highlight/shadow separation, star detail, readable spacecraft, rocky belts, restrained background color, grid hierarchy, and selection contrast. Review both shadow-facing and sunlit objects. Record any deficiencies rather than treating screenshots alone as proof of success.
- Verify world-attached annotations follow camera movement, prioritize selected and hovered objects, suppress collisions, stay readable near viewport edges, and show only disclosed facts. Use the existing stage/component interaction seam for deterministic overlap and annotation behavior where browser assertions would be brittle.
- Verify pointer and touch selection, keyboard access, orbit, pan, and zoom continue to work with labels present. Prior art is the existing space-stage interaction coverage and the Playwright system-view journey, which already exercises selecting a rendered body and focusing disclosed objects.
- Reuse the existing scene-renderer art and spacecraft integration coverage for deterministic appearance, classification refresh, resource removal/remount, reduced-motion behavior, and draw/picking alignment where affected. Update obsolete aesthetic assertions without weakening those behavioral contracts.
- Exercise both supported rendering backends for compatibility and check scene transitions for renderer errors or leaked resources. Compare responsiveness in the same representative and crowded scenes before and after; no new absolute frame-rate target was agreed.
- Run the applicable frontend checks and relevant existing tests for the changed modules. Add focused tests only where new interaction behavior or a material regression risk warrants them.

## Out of Scope

- Redesigning fixed HUD panels, the object browser, menus, toolbars, or camera-control UI.
- Replacing ship or station model geometry in the first pass.
- Forcing a tactical camera angle, changing camera defaults, or changing object scale or physical positions.
- New ownership boundaries, territorial effects, or gameplay meaning for decorative grid elements.
- Backend, physics, world generation, observation/fog rules, resource distributions, or new body classifications.
- Exact reproduction of the reference game's interface, models, or visual assets.
- A general renderer rewrite or a mandatory full-screen bloom pipeline.
- A new automated visual-regression platform.

## Further Notes

The supplied reference image is available at [the visual reference](../../docs/ideas/img.png). The current-state screenshot was supplied in the conversation and should guide the initial low-angle comparison; its temporary attachment location is not a durable repository artifact.

The desired success criterion is recognizable objects with distinct colors and crisp highlights at normal play distance, with the reference guiding overall richness. Review actual scene screenshots with the user after implementation and use that review to identify any remaining art-direction gaps.

The user approved the cinematic direction, broader world palettes, improved spacecraft readability, inclusion of scene overlays and belts/background, selective label density, and subtle grid hierarchy. The original interview recorded that scope and the confirmed validation approach; implementation and review evidence are recorded below.

## Implementation result

Implemented on `feat/vibrant-system-scene`. All five implementation tickets are
resolved. [Matched before/after views and validation](review/README.md) cover
native WebGPU, WebGL2 fallback, camera controls, annotations, selection,
transitions and crowded scenes. [Independent code reviews](review/code-review.md)
found no actionable Standards or Spec issues. Final frontend checks passed
TypeScript, ESLint and all 2,212 tests across 163 files; explicit project file
checks passed. Temporary implementation worktrees were removed.

The retained ship model remains small and dark in deep shadow; the screenshot
review records that first-pass limitation. Final art-direction judgement remains
the user's review of the actual rendered comparisons.

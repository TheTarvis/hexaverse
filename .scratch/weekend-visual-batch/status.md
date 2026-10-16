# Weekend project checklist

Updated 2026-10-16 · branch feat/vibrant-system-scene · local commits only, no push.
Meshy: **30 / 2,600 credits spent**; balance verified **2,658**. No purchases or plan changes.

## Done

- Baseline commit 768fd90; baseline and updated frontend production builds pass.
- grill-with-docs shared brief/glossary; Chrome screenshots and Meshy MCP verified.
- Six procedural visuals, world integration, seven static thumbnails and object-browser art.
- Integrated checks: **123 tests pass**; TypeScript/scoped lint/file validators pass.
- Storybook production build passes. Gate GLB and accepted appearance preserved.
- Textured ruin/debris candidates downloaded and optimized to about 1.3 MB each.
- Stealth/combat intent captured in stealth-combat-design-draft.md; implementation deferred.

## In progress

- Visual acceptance: actual Chrome world/HUD and generated-vs-local asset comparisons.
- Latest compact art sheet: comparison-03.png (128px sources plus actual 32px, dark/light).
- Ruin candidate still softer than gate; image-guided reference02 is saved locally.
- Debris generated candidate under review; procedural fallback now has substantial hulls.

## Next

- Resolve ruin image upload permission; choose/refine production ruin and debris.
- Recheck all seven at world scale/32px, reduced motion, disposal and both renderer paths.
- Commit reviewed visual batch locally; then finish playable travel HUD on existing shell.
- Add show/hide/arrange, local persistence/reset and reachable recovery controls.
- Future design only: stealth/combat. Parking at arbitrary positions confirmed; existing
  physics/API already support it. HUD exposure is the gap; no tracking/engagement work.

## Blocked

- Automatic approval review blocked uploading ruin-reference-02.png to Meshy because
  it derives from the private gate reference. Explicit upload permission requested.
  Proposed operation costs 15 credits; **no upload or charge occurred** for this attempt.
- HUD arrangement preference requested: docked order vs free placement/resizing, and
  whether vitals/navigation/settings stay reachable. Default recommendation is docks.
- No browser/MCP authentication blocker. Server is configured but not attached to this
  task tool list; existing server works via temporary stdio client without reconfiguration.

## Preview links

- http://127.0.0.1:20203/?path=/story/hud-object-thumbnails--feature-comparison
- http://127.0.0.1:20203/?path=/story/graphics-feature-art--ruin-production-comparison
- http://127.0.0.1:20203/?path=/story/graphics-world-gate--feature-lineup-close

## HUD architecture proposed before broad edits

Keep data/quotes/mutations in SystemSpaceView; presentation-only dock workspace,
validated per-corporation local preferences, keyboard move controls and mobile launcher.
Restore real course review/commit from existing server quote hooks: current Plot course
only closes the browser. Never use prototype fuel estimates in production commands.

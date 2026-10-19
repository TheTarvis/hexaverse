# HUD navigation button concepts

Status: A selected. Travis approved reusing the existing headerless HudCardShell and requested implementation. Implemented in the shared workspace; final visual acceptance remains with Travis.

Round 01: [comparison image](hud-navigation-options-01.png) and [exact prompt](hud-navigation-options-01.prompt.md). Travis selected A and identified the existing headerless HudCardShell as its implementation foundation.

## Brief

- Purpose: recognizable Objects, Command, leave-to-Galaxy and Arrange controls.
- Destination: desktop and mobile HUD navigation, not world art or object thumbnails.
- Nature: interface controls; use the accepted HudCardShell family. The manufactured-01 world-prop profile does not apply.
- Fixed: four existing outline symbols and actions, dark navy surfaces, clipped corners, blue-gray frames and pale cyan highlights. Preserve usable touch targets and keyboard labels during later implementation.
- Compare: A shared frame, B individual framed keys, C connected angular tabs. Keep icon scale, selected Command state, camera and lighting comparable.
- Reference: Travis's supplied current toolbar and full HUD screenshot. Existing title-plaque and card-frame decisions remain the style anchor.

## Feedback and boundaries

Travis rejected the current generic rounded toolbar as inconsistent with the HUD cards. The earlier interactive HTML study is exploratory and unaccepted. Travis requested the object-art playbook process: concept images, selection and refinement, then implementation and rendered review.

Round 01 was a static image comparison. Subsequent approval authorized implementing A with the existing shell and refining its proportions, selected state and existing animation. No new actions or world-art profile changes were introduced.

## Implementation review

Map navigation now composes the existing headerless HudCardShell, with its default signal lighting and fallback. Lighting pauses while the toolbar is hidden behind a phone page. Navigation inside an opened phone card shares that card's frame. Existing actions, outline glyphs, labels, focus handling and 44px targets remain. The rounded toolbar border and square selected outline are replaced by an unframed icon row with a soft fill and underline. Shared card chrome and lighting code are unchanged.

Desktop and a 390×844 Chrome viewport were visually inspected in the local live System view. Phone Command open/close retained one visible navigation and restored launch focus. Browser viewport overrides were reset. The 36 workspace/navigation/card checks, TypeScript and scoped lint pass. Physical phone appearance and final user acceptance remain pending.

## Next action

Review the rendered toolbar with Travis and refine spacing or selected-state treatment if requested.

## Highlight sizing correction

Travis observed small highlights on straight edges stretching around the toolbar's ends. The production shader's angular falloff reproduced a 4.99× longest/shortest ratio on a 216×56 toolbar and 2.00× on a 360×600 card. Reproduction command: `cd frontend && npx vitest run components/hud/frame-signal.test.ts`.

The shared signal now measures distance along the actual eight-segment chamfered perimeter, with two opposed peaks and a fixed pixel falloff. The same regression checks pass with length variation below 10% across sampled phases. The frame shape, 20px corner cuts, fixed corner strokes, rim thickness, colors, opacity, fallback and reduced-motion lifecycle are retained. Because this is the shared lighting helper, ordinary cards receive the same sizing correction. It supersedes the earlier statement that lighting code was unchanged.

Live desktop System rendering was inspected after the fix. Final perception of the unchanged corner shape remains for Travis to review.

### Follow-up: discontinuous halo at chamfers

Travis reported the highlights still distorted. The first length test did not cover the two-dimensional halo: assigning each pixel to its closest edge causes an abrupt change at interior angle bisectors. Nearly coincident points across a chamfer bisector produced a 0.3348 jump in normalized signal. The added continuity regression failed while both length checks passed, demonstrating the earlier verification gap.

The opposed light centers now travel the same perimeter, but intensity uses screen-space distance directly from those centers. Halo pixels no longer switch edge coordinates. The continuity and length regressions now pass together; the length tolerance remains 10%. Live toolbar crops were inspected through the end transition and the browser reported no shader errors. User visual acceptance remains pending; this does not establish a new corner-shape decision.

### Selected proportions from the supplied second reference

Travis prefers the supplied second toolbar reference over the current short chevron-ended version. The toolbar now uses a 12px corner cut rather than the ordinary card's 20px cut, a 292×68px frame for four controls, wider icon spacing, subtle separators and top/bottom chamfered accents on the selected control. It stays centered. Ordinary cards retain their default shape; the toolbar's fixed corner strokes are sized for its shorter cuts.

The shared lighting reads the actual CSS corner-cut value on resize so its rim and moving spots follow the same shape. The regression suite covers the new 12px-cut toolbar as well as the original 20px-cut shapes. Live desktop and 320px-wide phone navigation were inspected, including opening/closing Command and focus restoration; viewport overrides were reset. Final visual acceptance remains pending.

### Same toolbar frame in mobile panels

Travis confirmed mobile open-panel navigation should use the same headerless frame as map navigation. Both now compose one NavigationFrame wrapper around HudCardShell with explicit framing, retaining the shared 12px corner cuts, dimensions, highlights and selected accents inside Objects, Command and Arrange. Hidden toolbar lights pause; the existing phone-sheet visibility/focus owner still exposes one navigation. Toolbar container spacing accommodates the same frame at 320px without changing shared card title or close chrome. This supersedes the earlier decision to leave phone panel navigation unframed.

Live 320px Command and Arrange handoffs and return-to-map focus were checked. The 27 workspace/navigation/original-chrome tests, scoped lint and TypeScript pass. Physical phone acceptance remains distinct from viewport emulation.

### Consistent travel speed

Travis prefers the toolbar's smooth highlight pace and asked to slow larger cards. Highlights now travel at 77 screen pixels per second instead of completing the same fraction of a lap per second on every card. This preserves the 292×68 toolbar's approximate prior pace while larger cards take longer to complete a lap. Shader regressions verify equal pixel travel on toolbar and tall-card geometries; reduced-motion and pause behavior retain their existing owners.

The isolated production build completed successfully. It was not activated by this task; the protected preview was separately switched to the live development server in commit c66c7fd.

# In-app canvas rollout

2026-10-19. Travis authorized applying the reviewed canvas appearance to the app.

The production GalaxyView selects Stellar art and the surrounding lattice.
SystemSpaceView selects the same surrounding lattice. Both use the shared sky
and Dark seams preset: distance 16, brightness 0, thickness 0.5px. Storybook
adjustment controls and the illustrative route remain outside live gameplay.

Promoted `hex-sky.prototype.ts` to `hex-sky.ts` and removed prototype-specific
names from its exports and scene objects. The original/ground variants remain
explicit comparison options. Camera/picking, disclosure and travel rules are
unchanged.

Validation: edited-file checks, targeted ESLint and TypeScript passed. All 167
tests passed across GalaxyGraph/GalaxyView, SystemSpaceView render/integration
and SpaceWorld art/backend suites. The existing jsdom scrollTo warning and
intentional renderer-failure diagnostics appeared in their expected scenarios.

Removed the visible orbit/pan/zoom instruction text from the galaxy canvas at
Travis's request. Its accessible keyboard guidance remains on the canvas.
Targeted ESLint and all seven GalaxyGraph tests passed after that removal.

Browser review: both authenticated app routes rendered successfully through the
WebGL compatibility backend with no page errors or review controls. The visible
instruction text is absent, and system keyboard camera interaction works.
Native WebGPU screenshot verification remains unavailable in this headless
browser (including unchanged reference scenes).

- [Live galaxy](galaxy-in-app-10.png)
- [Live system](system-in-app-10.png)

# HUD object thumbnails

C2 uses 32px image boxes with transparent 128px PNG sources for high-density
screens. These are representative category images, not per-object portraits or
ownership/status indicators. The runtime `HudObjectThumbnail` displays static
images and does not load models or create a renderer. Loading/failed images
use a muted Heroicons Photo placeholder in the same 32px slot; object names
and types remain the caller's content. Changing the object kind starts a fresh
load attempt. This asset-availability state is separate from the diffuse
unanalyzed-object visual. Unknown category values use a generic Photo placeholder
without requesting an image; they do not masquerade as another category. The
canonical resolver accepts underscores or spaces (`gravity_well` / `gravity well`)
and maps `belt` to `resource-site`. It does not classify every resource-bearing
host as a resource site. Anonymous contacts must use `analyzed={false}`.

The live system object browser uses these thumbnails in its rows and in detail
headers for objects without an existing live preview. Planet, star, station and
owned-fleet detail previews retain their shared 3D components. Dynamic gate
labels are resolved through the disclosed `Lane gates` group, never by guessing
an object category from its name. Fleet art requires explicit fleet metadata.

Regenerate from the repository root with frontend dependencies and Playwright
Chromium installed:

```sh
node harness/utilities/render-hud-thumbnails.mjs
```

The command starts a temporary loopback Vite server, uses Chromium's WebGL 2
compatibility renderer to capture one transparent frame per category, writes
these files, then closes the pages, browser and server. No persistent dev
server is required. The generated PNGs ship with the app; this command never
runs when displaying a card.

`thumbnail-source.ts` owns the fixed camera, lighting and representative scene:

- Fleet and station use the existing `utility-ship.glb` and
  `orbital-station.glb` through `createSpacecraftModel`.
- Rocky, gas giant, ice world and moon use `createPlanetModel` with fixed
  `hud-{kind}-1` seeds. The rocky seed selects a dry surface.
- Star uses `createStarModel`, a representative G-class tint and a corona
  scaled to fit the thumbnail crop. Clouds/plasma are captured at initial time.
- Gate uses the accepted `lane-gate.glb` at full opening, including the shared
  portal effect. Thumbnail generation does not modify the accepted model.
- Anomaly, ruin, nebula, gravity well, debris and radiation use the same
  deterministic feature-art factories as the world. Their representative seed,
  decorative time and framing are fixed by the offline thumbnail source.
- Resource site uses a representative cluster built from the same
  `rockGeometry` and material treatment as the world renderer.

The captures reflect current game art rather than the AI-generated concept
sheet. Regenerate and visually review them after changes to models, materials,
lighting or Three. The offline source must not be imported by HUD components.

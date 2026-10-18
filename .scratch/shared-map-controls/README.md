# One shared Galaxy/System camera controller

Source implementation: local commit 275bfb5. No push. This implements Travis's
request for Galaxy controls in System and the DRY principle; it does not implement
a persistent canvas/renderer or change gameplay authority.

## Before and after

Galaxy's implemented controls were left drag/one finger orbit, right drag pan,
middle drag dolly, two-finger pan plus pinch dolly, plain wheel ground-plane pan
and Ctrl+wheel dolly. Galaxy had no keyboard camera bindings. System separately
implemented one-finger pan, two-finger orbit plus pinch and plain wheel dolly.

Both production scenes now instantiate components/map/MapCameraRig, extracted from
the Galaxy OrbitControls implementation. System's old orbit/pan/zoom input math
and TouchList mapping are removed. Galaxy's old camera-rig module is only a
compatibility re-export, not another implementation. Shared keyboard shortcuts
are arrows orbit, Shift+arrows ground pan, +/- dolly and Home recenter. System
retains Enter-to-select-center through a scene selection callback. No camera
buttons or hidden touch mode were introduced.

The System adapter supplies Y-up coordinates, extent-derived limits/framing and
converts the shared camera to SpaceCamera. Galaxy keeps Z-up and its framing.
The transform loop resolves fleet following, steps the shared controller, then
publishes one projection basis for the renderer, DOM hit targets and point picks.
Immediate projection refreshes do not advance damping a second time. A single
rest notification updates coarse overlay membership when damping settles; the
frame loop does not set React state every frame. Orbit/dolly retain fleet follow;
pan, Home and other-object focus release it. Body double-tap/double-click focuses
while preserving angle/distance; orbit then pivots on that body. Inspection,
point destinations, fleet activation and sighting highlights keep separate paths.

## Verification and limitations

- 582 tests / 41 files pass, including real shared-controller tests in both axes,
  System adapter contracts, following/projection/picking, no per-frame React
  updates, renderer retry/recovery, stale quotes and HUD state. Types, scoped lint
  and isolated production build pass. No backend changes were needed.
- The camera browser harness uses the real candidate bundles and synthetic
  identity/game fixtures. Command mutations are blocked. Read-only POST travel
  previews are separately blocked as unavailable fixture reads, not sent live.
  No sign-out activation, live game writes or real user identity reads occur.
- Chromium generates trusted one/two-finger touch sequences. WebKit drag checks
  inject Pointer Events with test-only capture stubs because native swipe
  automation is unavailable; mouse/keyboard checks remain actual browser actions.
  Browser checks do not establish physical iPhone gesture/keyboard/focus acceptance.
- Initial focus QA placed a fixture outside the narrow camera view and used
  locator tap calls whose actual events landed about 760ms apart. The final
  fixture is visible; timed Chromium touch events exercise the 350ms double-tap
  contract. Focus detection now uses input event timestamps rather than handler
  processing time, with a delayed-handler unit regression. WebKit checks native
  mouse double-click focus, separately from injected touch drag parity.
- An execution-tool session reset stopped temporary QA processes during the first
  final sweep. The protected launchd preview remained running. Completed profiles
  are retained, and interrupted profiles are rerun; no incomplete run is claimed
  as a completed sweep.
- All 57 public assets, original 624c4ff card CSS and released globals/viewport iOS
  files match the candidate. Fullscreen panels, direct icons, sticky search,
  44px targets, 16px fields, safe areas, focus isolation and accessible zoom retain
  their existing owners. Full emulator gameplay and physical-device acceptance
  remain unverified.

## Candidate and protected deployment

Candidate snapshot: /private/tmp/hexaverse-controls-zhhlvsma.
Build: MkAAbDiRe8bzrMLMoKGOR. Never build into a serving snapshot.

Prepared config: /tmp/hexaverse-weekend-supervision/config-controls-candidate.json.
Pre-change backup: /tmp/hexaverse-weekend-supervision/config-before-controls.json.
Only the frontend snapshot path and two build pins change. Existing gateway/ngrok
commands, exact Google/email policy, routes and 2026-10-19T00:00:00Z cutoff remain
unchanged. Backend and emulator services require no restart for this frontend slice.

The protected supervisor stopped its old groups at 21:57:50 UTC and started the
replacement at 21:58:03 UTC on 2026-10-18 (frontend 27129, gateway 27130, ngrok
27131). The temporary candidate listener on 20218 is stopped. Backend/emulators
were not restarted.

All six candidate engine/size profiles pass (390 portrait, 844 landscape, 1280
desktop; candidate-browser-final.log). Final live Chromium/WebKit phone checks
also pass with no page errors (live-browser.log). They cover both scenes, desktop
inputs, shared keyboard, touch parity under the automation limits above,
selected-body focus/orbit and existing guest/auth/HUD/selection/chrome behavior.
The live run uses the protected HTTPS origin with fixture-safe transport forwarding
to the serving gateway; the actual unauthenticated edge is checked separately.

Home/login/System HTML and all 36 initial JS/CSS assets match the candidate; seven
pins pass. Storybook 200, debug/QA 404, foreign-Origin POST 403, unauthenticated
galaxy/account APIs 401 and anonymous edge 302 remain correct. Backend health is
200. Supervisor errors are empty; transport diagnostics retain two earlier aborted
GETs at 21:09/21:15 with no new entry after this activation. Full emulator gameplay
and native iPhone acceptance remain unverified. No commits were pushed.

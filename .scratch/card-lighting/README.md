# Plain/Wide shared signal lighting

Source fix: local commit 5e00e95. No push.

## Cause and change

Private supplied references libfile_d158c328a6908191b23b9a831a33f83d (Wide) and
libfile_23b4fba8fcf88191aed1e36541d73154 (Plain) were retrieved and inspected. The
original screenshots stay under /tmp/hexaverse-lighting-references; they are not
copied into this repository or public assets. Captures here contain synthetic
Storybook/game content.

The actual local Storybook manager URLs on 20203 reproduce the difference:
Plain has no canvas, while Wide has a ready decorative renderer. Plain explicitly
set lighting="none"; Wide inherits signal. The same difference existed in original
624c4ff, so no recent header restoration or dimension/clipping regression removed
the effect. The GPU effect is HudFrameLighting's unchanged TSL shader, with two
opposed peaks from abs(cos(angle-time)). CSS gradients/SVG corners are its static
fallback. Both headless engines use the working WebGL2 fallback; native physical
WebGPU hardware was not claimed as tested.

Plain now inherits signal; an explicit Static Frame story retains the CSS-only
example. Owning Objects/Command/Console and Arrange workspace cards also inherit
the shared signal effect, retaining existing pause/visibility lifecycle. Nested
sections do not add GPU owners. No shader constants, material colors, layout,
header/close CSS or frozen reference fixtures changed. Signal failure retains
usable static CSS chrome. Reduced motion draws a static signal frame.

## Verification

- 584 scoped tests / 41 files, types, scoped lint, Next build and protected
  Storybook build pass. Original chrome fixture assertions are unchanged.
- Local Plain/Wide/Static Frame were inspected in actual Storybook pages through
  Chromium and WebKit at 390/1280 widths. Plain/Wide have one ready signal canvas;
  Static Frame has none. Dimensions and original 28px visible close are unchanged.
- Twenty lit/static screenshot comparisons cover both stories and real Galaxy/
  System cards across phone/landscape/desktop. Minimum paired rim luminance gain
  is 165.6/255; both opposed sides must exceed 45 and agree within 20. The static
  comparison hides only the decorative layer on the same card. pixels.py measures
  screenshots without editing images or changing frozen fixtures.
- Candidate Chromium's three profiles pass. The first combined run then hit the
  previously observed WebKit model-blob access error. The isolated WebKit rerun
  passes all three profiles without filtering errors. Both logs are retained.
- One Galaxy fake-clock assertion initially included the decorative lazy-module
  reveal. Preloading that module before measuring steady-state frames keeps the
  original no-animation-rerender assertion; the real card lifecycle remains tested.
- Three simultaneous animated owners retain exactly three renderer instances,
  each submits at most 61 frames in the controlled two-second window, reduced
  motion leaves no pending animation frame, and unmount disposes every owner once.
  Existing hidden-document, renderer-failure and static-layer tests also pass.
- API/auth fixtures are synthetic. No live game writes, existing user identity
  reads, naming changes or Sign out activation occurred. Public57, shared controls,
  original card CSS/fixtures and released iOS files remain byte-identical.
- Physical iPhone and full emulator gameplay acceptance remain unverified.

## Builds and activation

Next build LIQ5XAA0mkhVDiW0hfwKs. Candidate snapshot:
/private/tmp/hexaverse-lighting-jgnwgd0b. Do not rebuild a serving snapshot.

The isolated Storybook build is copied to the existing gateway's static directory
only while the supervisor is stopped. Previous Storybook is preserved at
/tmp/hexaverse-weekend-supervision/storybook-before-lighting. Config backup is
config-before-lighting.json in that directory. Only the frontend snapshot/two
build pins and rebuilt Storybook index pin change; gateway/ngrok commands,
Google/email protection, routes and 2026-10-19T00:00:00Z cutoff are unchanged.
Backend/emulators are not restarted. Local Storybook 20203 updates through its
existing development server; it was not restarted.

Activation first occurred at 22:15:59 UTC on 2026-10-18; the final audited Storybook
copy was activated at 22:18:53 UTC (frontend 30127, gateway 30128, ngrok 30129).
The initial bare-HTTP Storybook probe received 403 for module requests because the
gateway correctly requires the configured HTTPS Origin. Final browser verification
uses that HTTPS origin with fixture-safe loopback forwarding; protection was not
weakened. The repository Storybook wrapper verifies 13 prefixed manager/iframe
asset references. Both deployed Storybook engines/sizes and live game phone
engines pass. Live HTML/all 36 initial JS/CSS assets match the candidate, all seven
pins pass, Storybook is 200, debug/QA are 404 and foreign-Origin POST is 403.
Supervisor errors remain empty; transport retains three earlier aborted GETs with
no new entry after this activation. Temporary candidate 20218 is stopped.

## Local main workflow

Main was 2baf73b and an ancestor of the completed branch (no unique main-side
commits). After verification, `git fetch . feat/vibrant-system-scene:main`
fast-forwarded local main to 5e00e95 without a force option or network remote,
then `git switch main` attached the worktree at the same HEAD/tree. All existing
commits, the old branch and untracked evidence were preserved. No reset, rebase,
branch deletion, push or remote modification occurred. The evidence/resource-test
commit is made on main; CLAUDE.md records Travis's requested ongoing workflow.

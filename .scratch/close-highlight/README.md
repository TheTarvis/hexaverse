# Close-control highlight and annotation-test follow-up

Travis reported that the X had a shaded square dimming the highlight. The supplied
Library screenshot was inspected privately and is not copied into this repository.
All captured images here use identity-free Storybook or synthetic game fixtures.

## Exact cause and correction

`HudCardShell` uses a transparent Catalyst plain button for close. Computed
background/image/shadow and pseudo-element checks show no opaque backing in rest,
hover, keyboard focus or active states. The square came from HudFrameLighting's
`closeBox`/`closeMask`: it multiplied decorative alpha by a rectangular mask over
the entire 28px button bounds. That removed the moving rim and halo under the X,
producing the apparent dark backing in the screenshot.

Only that close-mask uniform, expression and measurement are removed. The title
plaque mask remains. Intensity 1.2, speed 0.7, opposed peaks, rim/halo/color/clamp
values and rendering/reduced-motion lifecycle are unchanged. HudCardShell markup,
original 624c4ff CSS/fixtures, X color/drop shadow, 28px button/14px icon, invisible
44px inward hit target, keyboard focus outline, placement and scrolling layout
are unchanged. No global button reset or CSS hiding of focus is involved.

Before: ten animated Chromium Wide/desktop samples had a peak added luminance
of 1 in a patch strictly inside the old close mask over the top-right chamfer.
After: ten samples for each Plain/Wide, 390/1280-width Chromium/WebKit profile
show peaks 162–172 in that patch. The threshold is >40 for every profile. These
are differences from paired screenshots with the decorative layer temporarily
hidden in the browser fixture, not edited screenshots or altered shader values.
`corner.py` reads PNG pixels with the standard library. State screenshots and
original chrome assertions preserve geometry; full tutorial views were reviewed.

## Touch test: exact failure, baseline and resolution

Failing test: `components/space/space-annotations.test.tsx`, test “tracks camera
movement without losing touch and keyboard selection”, original line 164:
`expect(onSelect).toHaveBeenCalledWith({ bodyId: 'feat-body-0' })` after only
`fireEvent.touchStart`/`touchEnd`. Observed: zero calls. Camera movement assertions
before it passed; execution stopped before the later Enter assertion.

This was deterministic, not a flaky assertion. The unchanged test failed in both
current source and the previous serving snapshot
`/private/tmp/hexaverse-lighting-jgnwgd0b` (commit 6844259). Saved baseline hashes
match Git for the test, SpaceStage and MapCameraRig. See
`../tutorial-console/evidence/baseline-annotation.log`,
`evidence/annotation-current-before.log` and `evidence/baseline-hashes.json`.

The test had switched to TouchEvents in 47b9a8f when System used native touch
handlers. Shared-controls commit 275bfb5 replaced that native binding with
MapCameraRig/OrbitControls and the existing pointer selection path, but left this
annotation companion test's synthetic event sequence unchanged. jsdom does not
synthesize PointerEvents from fireEvent.touchStart/touchEnd. The current browser
path uses pointerdown and a captured pointerup on SpaceStage; the key assertion
was testing an event stream the view no longer owns.

Test-only commit 84af784 now sends touch PointerEvents, releases on the capture
owner, requires exactly one selection, then verifies a compatibility touch stream
cannot duplicate it. The independent keyboard-selection check remains. No
production input code was changed to satisfy the test. Four focused suites pass
67 tests; full HUD/space/Galaxy coverage now passes 1,085 tests across 74 files.
No outstanding annotation failure remains.

Native tap then Enter after camera orbit also passes in installed Chromium and
WebKit on the unchanged deployed 9FlTXrlq5Nc91hJSdyNjj build. Captured events are
trusted pointerdown/touchstart/pointerup/touchend; the tap selects qa-planet and
Enter toggles it off. This supports a stale fixture diagnosis rather than a
current tap-selection regression. Physical iPhone/Safari gesture behavior remains
separate acceptance, not certified by desktop engine emulation.

The native browser fixture first missed pointerup because it recorded only the
body target while the actual release belongs to the capture owner; selection had
already passed. Its next run caught a read-only travel-preview POST after body
selection. The final fixture explicitly fulfills only that endpoint with a
synthetic quote; all other mutations remain rejected and asserted absent. Both
failed fixture logs and the successful run are retained, with no error filtering.

## Verification and deployment

- 1,085/1,085 tests, 74 files; TypeScript, scoped lint, file validators and whitespace
 checks pass. Production build and protected Storybook wrapper build pass.
- All 57 public assets are byte-identical to the prior serving build. Existing iOS
 globals/viewport fixes are untouched. No actual sign-out or game mutation runs.
- Plain/Wide rest/hover/focus/active states pass at 390/1280 in both browser engines;
 actual Galaxy/System workspace and tutorial state checks run with the same
 shared component. The first WebKit Tab-walk/Shift-only fixture did not establish
 keyboard modality consistently. The final game audit uses a nonmodifier key on
 the actual focused close button and asserts the existing 2px focus ring. Initial
 fixture failures are retained rather than suppressed.

The candidate build is 9jSNWi1F0cyOY8pJevQDw, under
`/private/tmp/hexaverse-close-p0jgo8bl`. Activated at 23:12:50 UTC on 2026-10-18; frontend 35930, gateway 35931, ngrok 35932. Source correction commit 892cc64. The required deadline remains
2026-10-19T00:00:00Z; the existing SSO/email restriction, routes and ports remain.

Tutorial clarification: the earlier RecoveryTransmission fix did not newly
migrate a bespoke modal to HudCardShell. It already used that component and
explicitly opted out with lighting="none". 47dba87 removed the opt-out and fixed
mounted focus/isolation ownership. This follow-up removes a shared lighting mask
that affected any illuminated card with a close control.


### Protected activation

Serving build 9jSNWi1F0cyOY8pJevQDw (source 892cc64) activated at 23:12:50 UTC;
frontend 35930, gateway 35931, ngrok 35932. Backend remains 19255 on 20201 and
emulators were not restarted. QA 20218 is stopped. Previous config and static
Storybook remain under `/tmp/hexaverse-weekend-supervision/config-before-close.json`
and `storybook-before-close`. All seven pins match; all 36 initial JS/CSS files
match the isolated build; Storybook 200, debug/QA 404, foreign-Origin POST 403,
anonymous SSO 302 and unauthenticated galaxy/account 401 pass. The exact
2026-10-19T00:00:00Z deadline, SSO/email policy, routes and ports are unchanged.
Supervisor stderr remains empty; transport retains four prior aborted GETs.

Final protected Storybook passes all 32 close-state checks across eight
engine/story/size profiles. Candidate game checks pass tutorial/Galaxy/System
close states on 390/1280 in both engines. Initial game focus checks used Shift
alone, which did not consistently establish keyboard modality; the corrected
fixture sends ArrowLeft to the close button and checks actual focus/outline.
No production CSS or focus behavior changed. The first final live WebKit run
also counted the intentionally lazy lighting layer before its module mounted;
its rerun awaits attachment/readiness and retains the original failure log.
All unexpected gameplay mutations remain rejected in synthetic fixtures.

Source commits are 84af784 (test only) and 892cc64 (lighting mask/documentation).
No commits were pushed. The original user screenshot and Library transfer
credentials stay private in /tmp; only synthetic evidence is committed.

A subsequent live WebKit pass completed all control-state and native-selection
checks, then failed its strict no-page-errors assertion on a scan-target fetch
access-control error during navigation/reload. That failure is retained and an
isolated recheck with full error diagnostics is recorded separately. It is not
silently filtered or attributed to shader behavior without evidence.


The identical long journey reproduces the same scan-target access-control error
against the previous 9FlTXrlq5Nc91hJSdyNjj build on isolated QA 20218. API-client,
use-scan, fleet-service and SystemSpaceView source hashes match between builds.
Waiting for network idle before the fixture-forced reload does not remove it.
Thus this is a pre-existing synthetic WebKit navigation/reload limitation, not
evidence of a new close-mask or touch-selection regression. Its underlying cause
is not established; no application data/fetch code was changed speculatively.
The temporary baseline listener is stopped. The focused current-surface scenario
seeds the tutorial/layout before first System entry, instead of forcing a reload
while that view initializes; its strict page-error and mutation checks remain.
The full navigation failure remains a separately recorded limitation.


Final focused live verification passes in both Chromium and WebKit with no page
errors or gameplay writes (`evidence/game-live-focused.log`). It covers guest /
login / Galaxy, first System entry with old-layout migration, every close state
on Galaxy/System workspace and tutorial, original chrome, guide handoff/resume /
dismissal, trusted tap after orbit and independent keyboard selection. This is
an explicit focused scenario; the longer reload/navigation failure above remains
retained and is not claimed passing. Full portrait and desktop tutorial images
and close-inclusive Storybook captures were visually inspected.

To reproduce: use `stories.cjs` with QA_STORY_ORIGIN pointing to local Storybook or
protected /storybook; QA_SAMPLE_CORNER=1 records animated rim pairs. `corner.py`
checks before/after patch luminance per profile; representative maximum pairs are
preserved under evidence/corner-before and corner-after, with all 80 after-sample
measurements in corner-comparison.log. The shared tutorial-console/game.cjs runner
supports QA_CLOSE_STATES=1, QA_ANNOTATION_TAP=1 and QA_DIRECT_TUTORIAL=1 for the
focused first-entry scenario. These flags never bypass strict error/mutation
assertions. QA_ENGINE selects Chromium/WebKit and QA_WIDTH selects 390/1280.
Physical iPhone acceptance and full emulator gameplay remain unverified.

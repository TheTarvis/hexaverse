# Recovery tutorial and Console removal

Requested by Travis on 2026-10-18: “tutorial modal doesn't use the correct
component? Also kill console”. Source commit: `47dba87` on local `main`; no push.

## Cause and change

RecoveryTransmission already used HudCardShell but explicitly supplied
`lighting="none"`. Removing that override restores the same two opposed frame
highlights as Plain/Wide and the workspace cards. Original 624c4ff chrome CSS and
frozen fixtures are unchanged. Recovery remains full-page on phones and centered
on desktop; its mounted dialog now owns focus/isolation on both. Opening Objects
or Scan unmounts Recovery rather than merely hiding an inert owner. Resume guide
retains the lesson; visible close and Escape dismiss it. Progress reconciliation
and gameplay commands remain unchanged.

Console is absent from the shared panel type/defaults, both game views,
navigation, Arrange and current stories. The reserved bottom grid rows are gone.
Existing v1 layouts containing Console are sanitized in place, retaining valid
Objects/Command visibility, lane and order. All-hidden Arrange/reset recovery is
still reachable.

The only essential Console action was Focused Scan. It now lives in Command's
Sensors section with the same served targets, commit/cancel/report behavior and
settle/refetch lifecycle. It is independent of canvas availability and remains
mounted while Command is hidden. Its live announcement outlet is outside the
hidden panel. The full log UI and dead report link are removed; historical map
ghosts, sightings queries/services and records remain. Galaxy's statistics and
market overview were removed without relocating them; selected-system station
quotes still work. No backend service or data schema changed, and no gameplay
records were deleted.

The superseded Console-dock/log integration tests and two Console-only emulator
journeys were retired. Replacement Sensors/workspace coverage checks absence,
report placement, failed reads/canvas, delayed ghost reads, highlighting, system
handoff and announcement ownership. Existing Scan refetch/settlement, ghost
projection, standalone log/data and command tests remain. The scan emulator
journey now targets Command and retained map ghosts instead of the removed log.

## Verification

- Final focused suite: **208 tests / 14 files pass** (workspace, original chrome,
  Galaxy/System integration, tutorial and scan freshness/settlement).
- Broad HUD/space/Galaxy suite: **1,083 pass, one pre-existing failure** across
  74 files. `space-annotations.test.tsx` still dispatches legacy touch events and
  expects selection after the shared input moved to Pointer Events. The same
  failure reproduces in the untouched prior serving snapshot
  `/private/tmp/hexaverse-lighting-jgnwgd0b`; see baseline log. This task does not
  modify that test or camera/input code. One additional announcement regression
  was subsequently added and passes in the final focused suite.
- TypeScript, scoped ESLint, file validators, diff whitespace check, isolated
  production build and protected Storybook wrapper build pass. Storybook verifies
  13 manager/iframe asset references. **All 57 public assets are byte-identical**
  to the previous serving build.
- Synthetic Chromium and WebKit checks pass at **390×844, 844×390 and 1280×900**.
  Real route components verify tutorial original title/close/icon properties and
  geometry, visible dismissal, focus/inert release, Objects/Scan handoff/resume,
  old-layout migration, Console/log absence, retained search and command fleet,
  guest/auth navigation and corporation isolation. Eighteen paired screenshots
  quantitatively confirm opposed rim highlights (each gain >45 luminance units,
  left/right difference <20) with reduced motion. Actual tutorial screenshots
  were visually reviewed at portrait and desktop sizes.
- Initial browser failure was a fixture mismatch: it restored a guide enrolled
  to the first fleet while its earlier test had selected the second command
  fleet. The corrected fixture explicitly selects the enrolled fleet. No
  production selection rule changed, and the failure log is retained.
- Final deployed-build phone checks pass in both engines. Six deployed paired
  measurements pass; protected Storybook Plain/Wide/StaticFrame passes at 390/1280
  widths in both engines. No page errors were filtered or suppressed.
- All Auth/game API traffic in browser tests is intercepted with synthetic data;
  unexpected writes are rejected and asserted empty. Real Sign out is never
  activated. Emulator journeys were updated/typechecked but **not run**, because
  their runner owns emulator lifecycle and could disturb the shared preview.

## Protected preview

Build **`9FlTXrlq5Nc91hJSdyNjj`**, source snapshot
`/private/var/folders/_y/pntj1rzd6sl4v3nj3nvs97xm0000gn/T/hexaverse-tutorial-x6ud9ctq`.
Activated at **22:43:01 UTC on 2026-10-18**. Frontend 33711, gateway 33712,
ngrok 33713. Backend remains pid 19255 on 20201; emulators were not restarted.
Temporary QA 20218 is stopped.

The existing HTTPS URL, Google/email policy, routes, ports and absolute cutoff
**2026-10-19T00:00:00Z** are unchanged. Only serving frontend paths/build pins and
the rebuilt static Storybook index pin changed. Previous config/static Storybook
are preserved under `/tmp/hexaverse-weekend-supervision/config-before-tutorial.json`
and `storybook-before-tutorial`; the previous build remains available.

Live checks: complete HTML for/,/login,/systems; all 36 initial JS/CSS files match
the candidate; all 7 pins pass; Storybook 200; debug/QA 404; foreign-Origin POST 403;
anonymous public edge redirects to ngrok SSO 302; anonymous game/account APIs 401.
Supervisor stderr is empty. Transport log has 4 total earlier/current aborted
GETs; the new 22:43:54 entry is a zero-byte downstream-aborted model-asset request
during synthetic navigation. Both engine journeys complete without page errors;
this is recorded rather than treated as an empty transport log.

## Reproduce and limits

`game.cjs` uses the installed Playwright browsers and synthetic route fixtures.
Set DEPLOYED_QA_ORIGIN to a loopback candidate, or the protected HTTPS origin with
QA_UPSTREAM=http://127.0.0.1:20204 for safe local forwarding. QA_WIDTH selects 390,
844 or 1280; QA_OUTPUT chooses a private output directory. No live account needed.
`pixels.py` reads its screenshot pairs; `verify-deployment.py` verifies serving
assets, protection and cutoff. The existing card-lighting `stories.cjs` checks
protected Storybook with QA_EXPECT_SIGNAL=1.

These are installed desktop browser engines, not a physical iPhone. Native iOS
focus zoom, Safari chrome and device safe areas still need Travis's retest. The
concurrent iOS global 16px field/viewport fixes were preserved. No persistent map
canvas rewrite, API change or new gameplay behavior is part of this task.

# Shared game shell: implementation and review

Approved slice: extract the common viewport/layers/heading/vitals/workspace and
move Galaxy onto it. Canvas allocation, renderer lifecycle and persistent rendering
are deferred. The released iOS fixes in globals.css and system-viewport-lock.ts
remain byte-identical, as do the original card CSS and all 57 public assets.

Both routes now use GameViewShell's presentation slots. Galaxy Objects supplies a
searchable system browser/inspector with Back; Command retains fleet commands and
location; Console retains statistics, recenter and market information. Guest
browsing/sign-in and authenticated action boundaries remain. Existing corporation
layout keys/IDs are shared between routes; guests have their own scope. Details
move focus to Back, and Back restores the row without focusing search. Shared
bands prevent desktop heading/launcher overlap; workspace Storybook defaults remain.

## Verification

- 438 tests / 30 files pass, including all Galaxy and SystemSpaceView suites,
  HUD, phone sheets, selected fleet and viewport-lock tests (`unit-final.log`).
- TypeScript and scoped ESLint pass (`types-final.log`, `eslint-final.log`).
- Isolated production build passes (`build-final.log`); its sole lint warning
  is the unchanged unused rejectPreview in SystemSpaceView.stranding-notice.test.tsx.
- Chromium and WebKit: 390x844, 844x390 and 1280x900 pass guest/auth flows,
  renderer readiness, search filtering/stickiness, retained browsing, detail focus,
  original 624c4ff chrome, cross-scene preferences and corporation isolation
  (`browser-final.log`). Screenshots here use synthetic identity/game fixtures.
- Existing first-login/guide, background inert release, direct icons, original close
  target, reduced keyboard space and >=16px input regression passes in both engines
  (`onboarding-final.log`). No real identity or game writes; only an intercepted
  synthetic corporation response is used by first-login QA.
- No full emulator gameplay journey or physical iPhone acceptance was performed.

Reproduce synthetic route checks against a running loopback candidate:

```sh
DEPLOYED_QA_ORIGIN=http://127.0.0.1:20218 node .scratch/shared-game-shell/browser.cjs
```

Candidate build: ZxLqLPRswDR9eUMPSekHj. Its preserved snapshot path is recorded at
/tmp/hexaverse-shared-shell-root.txt. The candidate server is temporary and can be
started with that snapshot's phone-preview/frontend.mjs, the verified
hexaverse-emulator project and port 20218. Do not build into a serving snapshot.

## Preview deployment status

Not deployed. Automatic approval review rejected the existing protected preview's
launchctl bootout, because it would briefly interrupt a shared service and trusted
explicit authorization to reload it was not established. No protected preview
process/config/policy was changed; the live iOS baseline remains LZQ850NK0eM1Mfbe64zJo.

A prepared, unactivated config is at
/tmp/hexaverse-weekend-supervision/config-shared-shell-candidate.json. It changes only
the frontend snapshot path and two build pins. Gateway/ngrok commands, routes,
Google/exact-email policy, seven-pin validation, Storybook and cutoff
2026-10-19T00:00:00Z are preserved. Obtain explicit approval for the brief restart
before activation; do not bypass the rejection. Keep a backup of the current config,
stop the existing supervisor, wait for its owned groups to exit, activate the
candidate config and relaunch using the existing phone-preview procedure. Then run
verify-deployment.py plus browser.cjs through the existing gateway, check anonymous
edge denial, and inspect supervision/transport logs before claiming deployment.

Read-only post-rejection health checks confirm the old home/login/system HTML and
33 initial JS/CSS resources match the live iOS build, all seven pins are valid,
Storybook returns200, debug/QA routes remain404, foreign-Origin writes remain403
and the anonymous protected edge returns302. Supervision and transport error logs
remain empty (`live-baseline.log`). The temporary candidate listener was stopped.

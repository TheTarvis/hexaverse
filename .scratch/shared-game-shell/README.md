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

Validated live build: ZxLqLPRswDR9eUMPSekHj. Its preserved snapshot path is recorded at
/tmp/hexaverse-shared-shell-root.txt. The candidate server is temporary and can be
started with that snapshot's phone-preview/frontend.mjs, the verified
hexaverse-emulator project and port 20218. Do not build into a serving snapshot.

## Preview deployment status: live

Travis explicitly approved the brief shared-preview restart at 19:18 UTC on October 18.
The initial automatic approval rejection was resolved by that approval; the same
restart call then succeeded. The old supervisor finished stopping at 19:18:52 UTC;
the replacement started at 19:19:12 UTC, with frontend 11573, gateway 11574 and ngrok 11575.

Build **ZxLqLPRswDR9eUMPSekHj** now serves at the existing protected
https://gulf-identity-scrap.ngrok-free.dev/ endpoint. Only the frontend snapshot path
and its two build pins changed. Gateway/ngrok commands, routes, Google/exact-email
policy, seven-pin validation, Storybook and cutoff 2026-10-19T00:00:00Z remain unchanged.
The old config is preserved at
/tmp/hexaverse-weekend-supervision/config-before-shared-shell.json. The active config
is the previously prepared config-shared-shell-candidate.json content. Do not build
into the serving snapshot; prepare a separate snapshot for any further changes.

Live HTML for home/login/system and all 34 initial JS/CSS assets match the validated
build; all seven pins pass. Storybook returns200, debug/QA routes remain404, foreign
Origin writes remain403, unauthenticated game/account APIs return401 and anonymous
edge access returns302. Supervision and transport error logs remain empty
(`live-deployment.log`). Protection and all 57 public assets remain unchanged.

`live-browser.log` records Chromium/WebKit pass at390 portrait,844 landscape and1280
desktop for guest/auth, renderer readiness, search/Back/focus/state, original chrome,
shared layout persistence and corporation isolation. `live-onboarding.log` records
both-engine first-login/guide, inert release, direct icon navigation, original close
target and mobile input-size checks through the existing gateway. All identity/game
API traffic is intercepted with synthetic fixtures; no real user or gameplay writes
were made. Live screenshots use the same synthetic fixtures. Native iPhone and full
emulator gameplay acceptance remain unverified. The temporary candidate listener is
stopped; only the approved protected supervisor serves this build.

`live-baseline.log` preserves the earlier read-only evidence that the old iOS build
remained healthy during the initial approval block. Implementation commit: e3bfdcb;
initial evidence commit: 8c35b65. No commits have been pushed.

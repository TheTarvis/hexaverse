# Fleet names and grouped scene navigation

Source implementation: local commit a5c4e8e. No push.

The owner-facing fleet model previously had no canonical name field. The minimal
compatible change reads optional stored `name` metadata and returns it on owner
detail/list reads, omitting it from foreign responses. Command and related HUD
labels prefer a served nonblank name and otherwise show `Fleet` plus the ID suffix.
No names are fabricated or assigned; no live rename, naming writer or migration is
introduced. Existing unnamed fleets continue to use the fallback.

System's leave-to-galaxy outline icon and Galaxy's selected-system enter outline
icon now share HudWorkspace navigation. Enter is present only for an authenticated,
disclosed selection. Both map and open phone cards use this navigation owner.
The footer component, its spacing and the inspector's duplicate Enter button are
removed. Galaxy fleet focus remains focus; System remote-fleet navigation remains
contextual. Direct controls retain accessible labels and 44px targets; phone heading
and navigation use separate rows so five controls fit at 320px. Command/inspection
ownership and quote/pending-submit guards remain intact.

## Checks

- 501 frontend tests in 37 files pass (unit-final.log); TypeScript, scoped lint and
  isolated production build pass. Backend fleet/corporations short tests and main
  compilation pass. Owner named/legacy/foreign HTTP/DTO cases are covered.
- Candidate Chromium/WebKit sweeps pass 390 portrait, 844 landscape and 1280 desktop
  (browser-final.log). First-login/guide, sheet isolation, 16px fields and original
  chrome checks pass in both engines (onboarding-final.log).
- Live identity/game APIs are intercepted with synthetic fixtures. No browser QA
  activates Sign out or writes live game/account data. Fixture onboarding writes
  are intercepted, not forwarded to the backend.
- The first live sweep passed Chromium's three sizes and WebKit portrait, then
  reported WebKit blob access errors in landscape. An isolated landscape recheck
  passed without filtering errors. Preserve the initial log alongside subsequent
  rechecks; these synthetic tests do not establish native iPhone acceptance.
- The final full live rerun passes all six engine/size combinations with no page
  errors (live-browser-recheck.log). The temporary candidate listener on 20218 is
  stopped; the protected supervisor remains running.
- Test teardown retains synthetic interception until context close. Removing
  interception first could let late Next prefetches reach OAuth as script HTML.
- Original 624c4ff card CSS, released iOS globals/viewport files and all 57 public
  assets match the serving snapshot. Full emulator journeys and physical-iPhone
  keyboard/focus/gesture acceptance were not run or claimed.

## Deployment

Build: djrZX23fL1PNIxIAUI8rm. Snapshot:
/private/tmp/hexaverse-navigation-vq9bleee. Never build into the serving snapshot.

Only the backend was refreshed through its existing GoLand dev:backend run
configuration (old listener 3414, replacement 19255 on 20201). The existing emulator
processes remained running. Health reports healthy LOCAL/test mode; startup skipped
existing galaxy seeding. No live fleet mutation or migration was performed.

The existing protected preview supervisor stopped its old groups at 21:08:25 UTC
and started the replacement at 21:08:32 UTC on 2026-10-18 (frontend 21074, gateway
21075, ngrok 21076). Config backup:
/tmp/hexaverse-weekend-supervision/config-before-navigation.json. Only the frontend
snapshot path and its two build pins changed; gateway/ngrok commands, exact
Google/email policy, routes and 2026-10-19T00:00:00Z cutoff are unchanged.

Live home/login/system HTML and 35 initial JS/CSS assets match final build bytes;
all seven pins pass. Storybook returns 200, debug/QA 404 and foreign-Origin POST
403. The supervisor error log is empty. Two transport diagnostics record
downstream-aborted model/static GETs during navigation; do not describe transport
logs as empty. See the retained deployment and browser logs for actual outcomes.

The final protection check confirms backend health 200, unauthenticated galaxy and
account API 401, and anonymous edge 302 (live-protection.log).

Screenshots under screenshots/ use synthetic data and include selected-system Enter,
System leave navigation, Command labels and settings at representative widths.

# Footer, account settings and fleet selection cleanup

Travis asked to remove footer clutter, keep a Galaxy button, put Sign out in
settings, and improve fleet selection. Inspected Library references:
libfile_5a70dfeeb23481918018c3e8d628032d (IMG_1075) and
libfile_f7481a1289048191a4b6e8d33f3810df (IMG_1074). The private original images remain
under /tmp/hexaverse-footer-references; they are not copied into public assets or
published Storybook. Screenshots committed here use entirely synthetic data.

## Result

- One Galaxy button replaces the FloatingNav Account/email/sign-out footer frame.
- Sign out is in an Account section of existing Arrange HUD settings; there is no
  new settings system. Guest and identity-free fixtures omit account actions.
- One direct FleetRoster in Command replaces the cramped footer selector and the
  duplicate production travel-review dropdown. Rows show short Fleet labels,
  location/activity and explicit selected text/aria-pressed state. The current API
  has IDs, not names; no backend naming feature was invented. Full IDs remain in
  row titles. Map/object inspection and command fleet remain separate.
- Telemetry data is preserved in Command: fuel, cargo/hold, credits, world time,
  resolved dock host and burn target/ETA/status.
  The map telemetry toggle and footer status band are removed. The shared card
  content owns scrolling; the roster no longer adds a nested scrolling viewport.
- Travel review links to Command for switching. Existing quote freshness and
  pending-submit guards prevent an old fleet's quote or a pending order from
  becoming a wrong-fleet command. Choosing another fleet preserves the destination.
- Original 624c4ff card CSS, all 57 public assets, iOS input/viewport fixes, routes,
  auth policies and per-corporation preference format are unchanged.

## Verification

584 tests / 39 files pass: Galaxy/HUD/SystemSpaceView, FleetRoster, floating nav,
account provider, legacy VitalsStrip components, travel card, selected fleet and
phone/viewport owners (`unit-final.log`). The quote-switch safety tests now use the
real Command row rather than the retired production dropdown. Settings sign-out
wiring is activated only against a unit spy; no browser test activates Sign out.
TypeScript and scoped lint pass. Isolated production build succeeds; its unchanged
unused rejectPreview warning is unrelated to this change.

Candidate Chromium/WebKit checks pass at 390x844, 844x390 and 1280x900: single Galaxy
footer, direct fleet selection/selected state, Command telemetry, reachable Sign out,
guest/auth, retained search/details, shared layout isolation and frozen card chrome
(`browser-final.log`). Phone controls retain 44px targets and desktop retains its
existing control density. Existing first-login/guide, sheet isolation, direct icon
navigation, reduced keyboard space and >=16px input checks also pass in both engines
(`live-onboarding.log`). Auth/game endpoints are intercepted with synthetic
fixtures; no real game/account mutations or sign-out activation occur.

Final build: u9qNOlafjaKaU_zBlgiqo. Snapshot path is recorded in
/tmp/hexaverse-footer-root.txt. Do not build into the serving snapshot.

## Deployment

The same protected supervisor was reloaded through the existing procedure. It
stopped its prior owned groups at 20:27:24 UTC and started the replacement at
20:27:39 UTC (frontend 15777, gateway 15778, ngrok 15779). Only the frontend snapshot path
and two build pins changed. Config backup:
/tmp/hexaverse-weekend-supervision/config-before-footer.json. Current config came
from config-footer-candidate.json. Gateway/ngrok commands, protected URL, exact
Google/email policy, routes, seven-pin validation and cutoff 2026-10-19T00:00:00Z
are preserved. Initial live HTML/all 34 JS/CSS assets match the candidate; seven pins
pass, Storybook 200, debug/QA 404, foreign-Origin writes 403, unauthenticated APIs 401
and anonymous edge 302. Final live browser checks are recorded below.

No physical iPhone keyboard/focus/gesture acceptance or full emulator gameplay
journey is claimed by these synthetic browser checks. No commits are pushed.

Final status telemetry build was activated at 20:34:39 UTC after the previous groups
stopped at 20:34:34 UTC (frontend 16659, gateway 16660, ngrok 16661). Its active config
came from config-footer-final-candidate.json; the preceding cleanup config is saved
at config-before-footer-status.json. The original pre-cleanup config remains at
config-before-footer.json. Runtime source matches the final snapshot. Implementation
commit: 568e9d5. The temporary candidate listener is stopped after verification.

An initial synthetic HTTPS sweep encountered transient WebKit blob access messages.
An isolated WebKit diagnostic and the final full candidate/live sweeps are clean.
The harness does not filter such errors during assertions; it only tolerates asset
forwarder races during teardown after every assertion has passed. No application
resource-lifecycle changes were made for that diagnostic.

Final live Chromium/WebKit sweeps pass all six viewport cases in `live-browser.log`,
including preserved resolved host status. `live-onboarding.log` confirms both-engine
first-login/guide, original chrome, direct mobile navigation, focus and input-size
checks on the final build. `live-deployment.log` records byte/pin/protection checks;
supervision and transport logs remain empty. The final temporary candidate listener
is stopped. The committed live screenshots are synthetic, not Travis's screenshots.

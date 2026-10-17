# Shared HUD card baseline migration

Status: deployed and browser-verified 2026-10-17 19:20UTC · 2026-10-17

## Requested outcome and settled choices

Travis requests that game HUD surfaces use the established HUD card baseline,
starting from the ad-hoc fullscreen Command/mining view. The reference is the
existing HudCardShell and its accepted title/close/frame, plus HudTypography and
HudFacts. No new card design, art, gameplay rules or account-page redesign.

The requested grill-with-docs, grilling and domain-modeling instructions were read
directly because this client has no Skill invocation tool. Repository facts settle
the baseline; no new visual decision required an interview. Command fleet remains
distinct from inspected object. Existing served figures and mutation guards remain
authoritative; implementation-only framing terms do not belong in GLOSSARY.md.

## Audit and implementation

| Surface | Previous gap | Migration |
| --- | --- | --- |
| Workspace Objects/Command/Console | Plain rectangular toolbar and container | One shared outer HudCardShell; original panel refs, mounted children and phone modal owner retained |
| Command/mining/station services | Legacy left-edge HudPanel, dashed separators, small native selector | Shared section shell, headings, sections, existing Catalyst controls and primary cyan actions |
| Travel | Already used accepted shell | Nested section inside owning frame; independent actions/dismissal retained; shared facts |
| Objects/details | Rectangular inner frames and custom facts | Unframed content inside shared owner, shared typography and row facts; search/back/selection retained |
| Console | Extra opaque rectangular region | Shared owning frame, transparent inner region, shared headings/loading/empty copy; controlled expansion/tabs remain mounted |
| Settings | Shared shell with a separate plain phone header | Same shell title/close on phone and desktop |
| Recovery/objective | Ad-hoc standalone cards | Existing modal owner retained around shared shell; internal recovery body scrolling and reachable dismissal preserved |
| Fleet inspector/remote fleet | Legacy HudPanel | Shared shell and typography, with explicit detached framing for the inspector portal |

HudCardShell auto-embeds nested cards as content sections, avoiding duplicate frame
ornament and decorative renderers. Detached overlays can explicitly own a frame.
The workspace emits activate/dismiss intent: SystemSpaceView opens/closes its
existing Console state, preserving guide/focus/log contracts. Defaults remain local
presentation preferences. HUD controls keep dark surfaces in either OS color scheme.

## Boundaries and verification

- Preserve fullscreen phone sheets, safe areas, internal scrolling, mounted drafts,
  filters, selected objects, tab state, layout preferences and live announcement outlets.
- Preserve gesture-only mobile camera, desktop mouse/keyboard input and the invisible
  recovery-modal CSS correction. No document input interception or new cancellation.
- Existing hidden Course/roster/flight-control migration paths remain outside this
  visible-card work. Navigation/vitals bars and the application naming dialog retain
  their own roles rather than receiving redundant card ornament.
- 1,081 tests/66 files passed after core migration;74 targeted tests passed after
  final control changes. TypeScript/scoped lint and production/Storybook builds pass.
- Real-route browser fixtures use synthetic Auth/game responses. No real identity,
  game mutation, purchase, asset upload or push. Phone visual/interaction checks and
  physical-device acceptance are distinct.

## Release evidence

Final candidate build: -wmbFYvCfz67ugLHJP3zV. Mining, station services and first-login
checks pass in Chromium/WebKit on actual application routes using synthetic data.
Search, quantity drafts, detail back navigation, shared frame ownership, narrow
375×667/390×844 and landscape844×390 close/scroll, and desktop1280×900 navigation
clearance pass. Detached fleet inspector and prior camera gesture regressions pass.
Chromium uses browser-generated touch and card scrolling; WebKit multi-touch is
constructed, with native taps and programmatic scroll. Physical iPhone review is
still pending. Captures in this folder contain only synthetic QA identities.

Logs: /tmp/hexaverse-hud-release-{mine,station,first}.log,
/tmp/hexaverse-hud-inspector-release.log, /tmp/hexaverse-hud-camera-regression.log.
Existing full emulator journeys were not run; unit/integration, installed browser
checks and existing journey static checks are distinct evidence.

Final visual review caught a legacy position:static objective-card rule letting
its absolute decorative surface cover recovery. Corrected the containing block
before deployment. A real-browser decoration-bounds assertion now protects the
objective/recovery overlap in wake/objects/first-login fixtures; the saved recovery
capture reflects the corrected build. All four final fixture runs pass in both
engines: /tmp/hexaverse-hud-verified-{mine,station,first,camera}.log.

## Deployment

Implementation3c4732b, containment correction1039623. Live build
-wmbFYvCfz67ugLHJP3zV from/private/tmp/hexaverse-hud-baseline-ck3ach0k.
All four post-deployment fixture runs pass in both engines:
/tmp/hexaverse-hud-live-{mine,station,first,camera}.log.
All33 initial JS/CSS assets match served bytes;57 public assets identical.
Same protected URL, exact Google/email policy, routes, diagnostics, published
Storybook and Oct19 00UTC cutoff. No push, identity selection or live game writes.
Transport log retains only two historical client-aborted reads from18:03UTC.
Physical iPhone appearance/usability still awaits Travis's review.

## Mobile navigation refinement

User phone feedback requested a reachable close, tabs in Arrange as well as panel
pages, and a search-focus zoom fix. The accepted frame stays: mobileHeader on the
existing HudCardShell puts title/48 px inset close and all four navigation controls
above the content scroll viewport. Arrange uses the same controls. Stable workspace
sheet identity avoids focus restoration to a hidden search between destinations.
Shared phone/coarse HUD fields use16 px text; the old deployed search measured14 px
in both engines. No viewport zoom restriction, art change or gameplay change.

Stories: HUD/Workspace/PhoneNavigation. Browser runner QA_MOBILE_NAV=1 covers375/
390portrait and844landscape, reduced keyboard space, focus/blur, all Arrange/panel
handoffs, selected tab callbacks, retained search/details/back, reachable close and
single dialog/inert cleanup. Native iPhone keyboard/magnification remains pending.

Candidate 4mNlQJf9OD5UVRpDcNTAz passes the mobile navigation and mining baseline
journeys in Chromium/WebKit, with16 px computed search and no runtime errors or
unmocked game writes. Separate camera runs pass selected-pivot touch transitions,
card scrolling/dismissal, absent camera buttons and desktop mouse/keyboard input.
Storybook build and the PhoneNavigation story interaction pass. All 57 public assets
are byte-identical to the accepted shared-HUD build. Captures:
[Objects](mobile-search-phone.png) and [Arrange](mobile-arrange-phone.png).

Live build 4mNlQJf9OD5UVRpDcNTAz (implementation 2efc4e6) passes the same navigation
and mining route checks in both engines through gateway 20204.60 tests / 6 files,
types/scoped lint pass; separate first-login/station and camera checks pass. Native
phone acceptance remains pending. All 57assets, email gate, routes, diagnostic cap
and Oct19 00UTC cutoff preserved. See docs/phone-preview.md for process evidence.

## Card-centered title correction

The mobileHeader flex override in 2efc4e6 removed the shared title's center anchor.
Live 390 px viewport measurements: Chromium center delta -110.6875 px; WebKit
-109.953125 px. The ordinary Storybook shell retained the baseline center anchor.
Equal side tracks now center the title relative to the whole card, preserving
inset 48 px dismissal and the existing mobile navigation/viewport/form behavior.
Regression geometry covers narrow/landscape/desktop, real details Back and injected
unequal 44 px Back/48 px close controls with a long truncating title. This is a browser
layout check, not physical iPhone validation.

Candidate KcC37CyGkxAjvy3gFc6Hr passes mobile and desktop title midpoint and
no-overlap assertions in Chromium/WebKit actual production-route fixtures,
including retained tabs/search/details/mining drafts, scroll and close. All 60 HUD
unit tests, types/scoped lint and production/Storybook builds pass. Installed-engine
Storybook baseline comparisons pass at 375/390/1280 widths. The user's local in-app
browser also measures a centered title (offset -0.00390625 px at 375px viewport)
and 48x48px close. All 57 public assets are unchanged. Capture:
[Centered phone header](mobile-centered-title-phone.png). Native iPhone acceptance
remains pending.

Deployed gateway checks pass the same title geometry, no-overlap, mobile and desktop
baseline assertions in both engines with no runtime errors/unmocked game writes.
Preview build KcC37CyGkxAjvy3gFc6Hr retains the seven verified pins and existing
email/cutoff configuration; initial 35 asset responses match local build bytes.
Temporary browser tab/listeners were cleaned up and viewport override reset.

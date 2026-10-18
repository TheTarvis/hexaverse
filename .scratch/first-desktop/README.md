# First corporation entry: layout, gear and initial focus

Travis's actual desktop first-login screenshot reported top-left overlaps around
Arrange HUD, asked for a gear icon, and showed the tutorial X selected. The
supplied Library image was inspected privately; only synthetic fixture captures
are saved here. Source commit: `3e9f581`, local main, no push.

## Reproduction and causes

The browser fixture drives the real login, corporation-name form, keyboard Enter
submission, WakeUpFlow success, query invalidation and first System route. Auth
and game APIs are intercepted; the corporation POST returns a synthetic spawn
result. It does not manually create the tutorial state or use a live identity.
Exactly one fixture-only corporation creation is expected; all unexpected game
writes are rejected and asserted absent.

Three concrete causes were found:

1. The separately positioned objective HudCardShell had a single-class absolute
   positioning rule, competing with the shared shell's single-class relative
   positioning rule. Default production order kept it on the right, but replaying
   the actual shared shell rule arriving last moved the objective to x=-32,
   y=125 behind the top-left controls, matching the supplied development screenshot.
   This was reproduced after the complete fresh corporation flow at 2048px.
2. During the wake phase, System hid only the Objects content, leaving the
   workspace's empty outer frame and title visible beneath the toolbar.
3. usePhoneSheet deliberately focused the first close button on mount. After
   keyboard corporation submission, that put visible keyboard focus on the X;
   the screenshot's selected appearance was the existing focus indicator.

## Changes and ownership

- The guide owns a centered desktop layout group for its objective and briefing.
  A dedicated objective wrapper owns positioning; the shared card owns its chrome.
  Paused-guide objective placement has its own bottom-center dock. Phone grouping
  remains full-page with safe-area padding. Reordering shared card CSS no longer
  changes the objective's placement or overlaps the desktop gear.
- HudWorkspace accepts a transient suspended panel flag. The whole empty Objects
  panel is suspended during the visible wake briefing, without changing saved
  visibility/dock/order or unmounting its contents. Advancing/dismissing/handoff
  restores normal presentation. A regression preserves an existing input draft
  and checks no preference write occurs when presentation is suspended.
- Desktop Arrange HUD is a recognizable Cog6Tooth icon, with aria-label/title
  “Arrange HUD” and a real 44×44px button. Phone navigation uses the same gear;
  Galaxy/System share this owner. Desktop panel origins move from 168 to 188px,
  leaving space after the 44px toolbar for the floating title plaque.
- The sheet hook has an explicit initial-focus option. Recovery chooses its
  noninteractive dialog root, while workspace/settings retain their default
  behavior. The root has no decorative focus outline; interactive controls keep
  their original focus-visible styles. Initial focus is no longer the X.
  Tab/Shift-Tab wrap, Escape, visible close, modal isolation and restoration remain.
- Mobile System Storybook fixtures use the same objective wrapper and suspension
  semantics. No original card chrome, signal values, recent close-mask correction,
  viewport/input files or gameplay services changed.

## Verification

- 1,088 tests across 75 files pass: HUD/space/Galaxy and sheet ownership coverage.
  TypeScript, scoped ESLint, file validators and whitespace checks pass.
- Production and protected Storybook builds pass; the Storybook wrapper verifies
  13 prefixed manager/iframe asset references.
- Candidate fresh-flow checks pass in Chromium/WebKit at 2048×1156, 1280×900,
  390×844 and 844×390. Final candidate desktop/portrait checks also cover explicit
  focus wrapping and shared Galaxy/System gear behavior.
- The deployed build passes the full fixture in both engines at all four sizes:
  keyboard corporation-name submission, first wake view, original shared-card CSS
  loaded last, root focus / unselected X, correct desktop layering, wake-only
  empty-panel suspension, guide Objects/Scan handoff, resume, visible keyboard
  indicator, Escape dismissal, map inert release, settings gear, returning-user
  reload, both views and no horizontal page overflow. No page/console errors,
  failed Next assets or unexpected game writes are suppressed.
- Protected Storybook Plain/Wide rest/hover/focus/active checks pass across eight
  engine/story/size profiles. The original 28px X, 14px icon and invisible 44px target
  retain their focus/contrast/transparency behavior. Actual desktop and landscape
  screenshots were visually inspected.
- All 57 public assets match the prior serving build byte-for-byte. Hash evidence
  also pins unchanged original card CSS/fixture, HudFrameLighting (including the
  recent mask fix), globals and viewport lock.

Initial verification-driver issues are preserved: the first phone check compared
covered background navigation geometrically with a full-page modal; it now asserts
that the covered controls are inert. An intermediate accessible-role query tried
an intentionally inert control; the final check reads its actual inert state.
Initial live 2048/390 runs measured the Galaxy gear before it became visible after
navigation, yielding a null bounding box. An explicit visibility wait corrected
that timing assumption; complete reruns pass in both engines. No production
behavior was changed to satisfy these driver assumptions.

## Protected deployment

Build **sGSr9YPuaFdk4IWxiNS9u**, snapshot
`/private/tmp/hexaverse-first-view-1ws0cbae`, source 3e9f581. Activated
**2026-10-18 at 23:35:37 UTC**, frontend 38300, gateway 38301, ngrok 38302.
Backend remains 19255 on 20201; emulators were not restarted. QA 20218 is stopped.
The exact **2026-10-19T00:00:00Z** cutoff, Google/email restriction, routes and
ports are unchanged. No extension or post-cutoff restart is authorized or planned.

Previous config/static Storybook remain at
`/tmp/hexaverse-weekend-supervision/config-before-first-view.json` and
`storybook-before-first-view`; prior builds remain available. Seven pins pass,
complete home/login/System HTML is served, all 36 initial JS/CSS assets match the
candidate, Storybook 200, debug/QA 404, foreign-Origin POST 403, anonymous public
SSO 302 and unauthenticated galaxy/account 401 pass. Supervisor stderr is empty;
transport retains four prior aborted GETs with no new one during this activation.

## Reproduce and limits

browser.cjs defaults to 1280×900; set QA_WIDTH/QA_HEIGHT for another profile.
Use QA_FIRST_LOGIN=1 and QA_EXPECT_FIXED=1. QA_ENGINE selects Chromium or WebKit;
QA_OUTPUT selects a private capture directory. DEPLOYED_QA_ORIGIN can be the
loopback candidate or protected HTTPS origin with fixture-safe QA_UPSTREAM.
The CSS-order test copies the actual shared shell CSS rule after existing styles;
it does not invent alternate card geometry. Screenshots contain only synthetic data.
verify-deployment.py checks serving assets, policy behavior, pins and deadline.

These are installed Chromium/WebKit engines, not physical iPhone/Safari acceptance.
Full emulator gameplay was not run; no existing identity, fleet, account or actual
corporation was selected or modified. Native device focus-zoom/browser chrome
still require Travis's device retest. Earlier unrelated long synthetic WebKit
navigation limitations remain in their own evidence; this task's actual fresh /
returning corporation flow passes without error filtering.

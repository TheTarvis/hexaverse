# System HUD

Status: production integration in progress, 2026-10-16. Source: Travis's weekend
authorization to build on the existing Storybook foundation, make the game
playable, and let players show, hide and arrange their HUD. Mobile/touch usability
is a main game requirement. The [project checklist](../.scratch/weekend-visual-batch/status.md)
owns completion evidence and current blockers.

## Confirmed intent

- Preserve the approved [card shell and travel interaction](../.scratch/hud-travel-card/spec.md)
  foundation. Inspection and command-fleet choice remain separate, using
  [glossary](../GLOSSARY.md) meanings.
- Players control which panels are visible and how they are arranged.
- Mobile opened HUD cards use the full available page viewport, per Travis's
  2026-10-16 direction: “For mobile the cards needs to be full screen there’s a
  bunch of wasted space right now”. This supersedes the earlier bounded-drawer
  phone layout. Close/back and internal scrolling remain reachable; desktop docks stay.
- Desktop and portrait phones support readable decision facts and usable touch
  controls. Essential actions work without hover or simultaneous map visibility.
  Preserve desktop quality while adapting phone density.
- Travel review identifies fleet/destination and explains cost/eligibility before
  explicit commitment. Changing fleets preserves the destination and obtains a
  fresh estimate. Fleet status owns travel progress and existing Stop behavior.

The linked travel spec originally authorized a simulated, development-only
prototype. Its historical exclusions remain accurate for that slice. Travis's
2026-10-16 authorization expands the current assignment to production integration;
it does not turn fixture estimates into production physics or authorize new rules.

## Current implementation and working choices

Audit snapshot, 2026-10-16; these components are being integrated and reviewed.

- [SystemSpaceView](../frontend/components/space/SystemSpaceView.tsx) retains
  gameplay state, server preview/quote/order/Stop hooks and command ownership.
  [CompactTravelCard](../frontend/components/space/CompactTravelCard.tsx) presents
  review/status using served figures. [Selection](../frontend/components/space/space-selection.ts)
  already supports bodies, gates and bounded points in empty space.
- [HudWorkspace](../frontend/components/hud/HudWorkspace.tsx) is presentation
  only: objects, command and console panels use ordered left/right/bottom docks.
  Phones use a launcher and one full-page active panel. Dock buttons support
  touch/keyboard arrangement without dragging. This is the current reversible
  implementation choice, not an accepted final freeform editor.
- Layout preferences are validated, versioned, per-corporation and local to the
  browser. Reset restores defaults. Settings/recovery stay reachable with every
  configurable panel hidden; navigation/vitals remain outside the workspace.
  Panel containers remain mounted to preserve browsing, log and scan context.
- [HudCardShell](../frontend/components/hud/HudCardShell.tsx) and existing
  typography/icons provide the reviewed frame and materials. Reuse this component
  foundation. [Art direction](art-direction.md) governs object assets; decorative
  illumination carries no gameplay meaning.

## Acceptance checks

These define the target, not a claim that review has passed:

1. Show/hide/move/reorder panels, reload preferences, and reset defaults.
   Corrupt/unavailable storage leaves a usable HUD; corporations have isolated
   preferences. Recovery remains reachable with every panel hidden.
2. Complete inspection → review → fleet switch → explicit Start → status → Stop
   at desktop and representative portrait phone sizes. Back retains browsing
   context; opening/closing cards alone never commits or cancels travel.
3. Show fleet, destination, duration, outbound fuel and reserve/shortfall in the
   focused card. Explain blocked trips inline. Stale/mismatched quotes and repeated
   activation cannot submit duplicate or wrong trips.
4. Check touch targets, keyboard focus/announcements, scrolling, launcher/settings
   access and no horizontal page overflow. Essential controls have visible
   non-hover actions. Review actual phone-width screenshots alongside desktop.
5. Check reduced motion, hidden/offscreen decoration and WebGPU/WebGL compatibility.
   Review world art and 32px thumbnails visually; passing tests alone do not accept art.
6. Run relevant existing browser/component coverage and checks from
   [testing tiers](testing-tiers.md); record evidence and limitations on the checklist.

## Proposed and open

Local persistence and reset are working acceptance choices. Review whether later
work needs account-wide sync, free placement/resizing or alternate phone navigation
after trying the dock implementation. No preference backend is established.
The wider action inventory (mining, docking, trade and sensing) needs review against
existing components; the [historical HUD plan](plans/system-hud.md) is context,
not automatic scope expansion.

Remote phone testing requires a separately approved authenticated HTTPS access
route and correct auth/API/SSE behavior; see the [phone preview proposal](phone-preview.md). Local browser evidence does not establish
iOS rendering or remote playability. Record the concrete access plan and required
permissions in the operational checklist.

Future stealth/combat controls consume server-disclosed information through existing
ownership boundaries. [Sensors and stealth](domains/sensors-and-stealth.md) records deferred
concepts; HUD arrangement must not expose absent entities, identify anonymous
contacts or turn historical positions into live tracks.


## iOS layout correction — 2026-10-16

Travis's actual iOS screenshot exposed header/launcher overlap, an offscreen recovery
briefing, objective/action collisions and overflowing bottom controls. Mobile system
HUD now budgets shared heading, toolbar, active drawer and navigation/vitals bands
inside100dvh, with device viewport and safe-area insets. Recovery copy scrolls between
reachable dismissal/action controls; its objective has a separate row. One phone
panel is visible at a time; tapping its active launcher collapses it without losing
drafts or preferences, restoring map input. Landscape uses a shorter toolbar/vitals
budget. Long fleet/status text wraps or truncates within constrained grid tracks.

Local Chrome extension-browser checks used the identity-free `HUD/Mobile System`
Storybook fixture, built from the live HUD/recovery/vitals/navigation components.
375×667,390×844,667×375 and844×390 all had document width equal to viewport width.
Dismissal, guide progression, Objects/Command/Console switching, retained console
text, settings scroll/reset/close, fleet/account menus and map-selection hit testing
passed. Briefing controls and landscape settings close were measured44×44; desktop
1440×900 rendering was also inspected. This is viewport emulation, not iOS rendering
or physical touch/keyboard/Safari-chrome verification. Travis subsequently reported the actual iPhone layout “Looks better”; this confirms
perceived layout improvement, not completion of gameplay or session checks.
Successful iOS emulator SSO was separately confirmed earlier.

204 distinct relevant component/integration tests pass, plus TypeScript, scoped
lint, file validators and an isolated production build. Protected preview was updated
with only these mobile fixes and prior approved login changes over b0f42be; all57
public asset files are byte-identical to the previous published-art build. Static
protected Storybook is unchanged; the new fixture remains local. See
[preview operations](phone-preview.md) for unchanged email restriction and cutoff.


Measured after-fix portrait bands at375×667 (CSS pixels):

| Surface | Top | Height | Result |
| --- | ---: | ---: | --- |
| Objective | 200 | 45.5 | Separate from briefing/actions |
| Recovery briefing | 253.5 | 202 | Fits above navigation |
| Navigation | 475 | 48 | No vitals overlap |
| Vitals | 523 | 144 | Ends at viewport foot |

Before: the supplied iOS image clips the briefing close/text at the right edge and
places the objective over the primary action; the local Chrome baseline also showed
heading/launcher and briefing/panel overlap. After: local screenshots and DOM hit
tests show separate bands and reachable controls. Chrome fixtures cannot certify
Safari browser-chrome/safe-area behavior; that remains the concrete device retest.
The local fixture is `http://127.0.0.1:20203/iframe.html?id=hud-mobile-system--onboarding&viewMode=story`.


## Focused gameplay QA — 2026-10-16

A reproduced integration failure showed accepted travel status being discarded when
closed and reopened before the own-fleets read caught up: the card incorrectly
returned to Ready and lost Stop. The status opener and same-fleet picker now retain
the accepted response. Selecting another fleet clears it; the next served fleet
read supersedes it through the existing read-counter rule. No movement rules changed.
Four regression cases cover reopening, same/different fleet selection, duplicate
and failed Stop with retry, and authority of the next served read. Focused suite:
204 tests across travel integration, system integration, station actions, fleet
picker and HUD preferences; types/scoped lint/validators and isolated build pass.

Chrome local `HUD/Mobile System/Gameplay` fixture now composes the real travel card,
fleet picker, workspace and navigation with explicitly in-memory journey state.
375×667 and844×390 checks exercised affordable/insufficient fuel selection, explicit
Start/status/Stop, passive closing/reopening, simulated station arrival, drawer
switching and saved HUD visibility/dock order after reload. All-hidden recovery and
reset remain reachable. Both widths have no horizontal page overflow. Fixture state
is not proof of server physics, real transaction execution or actual iPhone gameplay.
Station sell/refuel attachment, prices, pending/errors, successful refresh and retained
quantity coverage ran in isolated component/system tests; live trading was not done.
No existing emulator identity or Travis fleet state was selected or modified.


## Full-page mobile cards — current direction, 2026-10-16

Opened Arrange HUD, Objects, Command, Console and fleet inspection now occupy the
available page viewport using100dvh and safe-area padding. System heading, bottom
navigation and vitals are hidden/covered while a page is open. The fixed title/close
row stays reachable; panel switching stays inside the page. Card content scrolls
internally, including travel review/status and object/detail content. No browser
Fullscreen API is used. Closing returns to the map without hiding the panel in saved
preferences, ending travel or losing mounted drafts/browse context. Desktop dock
layout and nonmodal inspection are retained.

Phone pages expose modal semantics, make outside content inert, wrap keyboard focus,
and restore map/picker focus on close. Replacing a focused action during Start/Back
returns focus inside the page. Nested portalled form dialogs retain their own focus
handling. Guide actions hand off to one HUD page at a time; a map-mode Resume guide
control restores the unchanged saved lesson rather than reopening over a closed page.

Local ChatGPT in-app browser (desktop browser with viewport overrides) verified
375×667,390×844 and667×375. Modal bounds measured(0,0) with exactly the viewport
width/height and document width equal to viewport width. Settings Reset is reachable
after internal scrolling with the close control still at the top; Tab/Shift-Tab wrap
within the page. Console draft and object search survived switching/Back; explicit
Start/Stop, guide handoff/resume, fleet inspection and return to map input passed.
Desktop1440×900 retained400px settings and no modal dialog. Browser viewport overrides
were reset. This is emulation; actual iPhone acceptance of this new pattern is pending.

245 focused tests, TypeScript, scoped lint and file validators pass. Isolated build
and all57 public-asset comparisons gate the same protected preview update. No
identity selection, live fleet mutation, new art or external fixture publication.


## Touch input and compact map correction — 2026-10-16

Travis reported at23:33UTC that a fresh link loaded but taps, pan and zoom were
unusable, with clipped controls and too much persistent chrome. Fresh-link success
does not identify or close the earlier ERR_NGROK_3004 transport incident.

An isolated live-SpaceStage browser test reproduced a concrete interception: a
projected planet's depth-sorted DOM hit target covered Recenter. Hit transforms use
large depth z-indices; these could escape above surrounding HUD controls. The map
now creates a stacking context and its mark layer has a separate stacking context
below camera controls, preserving depth order without intercepting the HUD.

Touch camera input now uses one Pointer Events path, avoiding duplicate processing
by separate touch handlers. One finger pans, two pointers pinch to zoom, mouse drag
still orbits/right-drag pans, and stationary taps select once. Capture keeps drags
owned through release outside the original target. Pointer cancellation, lost
capture and window blur clear tracking; staggered pinch release cannot become a
tap. Release displacement also rejects fast drags with no intermediate move event.
Phone sheets share isolation ownership so overlapping handoffs cannot restore stale
inert snapshots. Focus restoration uses preventScroll; the phone map is anchored to
the dynamic viewport. No body scroll lock is installed.

Map mode has a compact HUD menu rather than permanent Arrange HUD and three tabs.
The single-line system heading and compact fleet strip leave the map available;
telemetry expands explicitly. Galaxy/account and44px zoom/recenter remain reachable.
Opened HUD cards retain full-viewport layout, mounted drafts and internal scrolling.
Desktop docks and mouse/keyboard navigation remain available.

Verification uses the identity-free HUD/Mobile System/Touch Map story, composed
with the actual SpaceStage and production HUD. Chromium's Input.dispatchTouchEvent
creates browser-generated touch/pointer sequences: one-finger pan, pinch zoom,
stationary empty/body selection, cancel-then-tap and fallback recenter pass.
375×667,390×844,844×390 and390×600 viewport changes pass card open/switch/close,
settings, retained console drafts, elementFromPoint control/map checks, no horizontal
overflow/root scroll and renewed pan after close. Installed headless WebKit passes
mobile touch open/close, map tap selection and fallback zoom. This is browser-engine
coverage, not physical iPhone acceptance or native iOS pinch verification. iOS18.5
simulator runtimes exist, but the computer-use Simulator launch stalled; no native
simulator result is claimed. No real identity, account or fleet was used.

Runner: `.scratch/weekend-visual-batch/touch-regression.cjs`; local screenshots and
logs: `/tmp/hexaverse-touch-qa/`, `/tmp/hexaverse-touch-browser.log`. These fixtures
and evidence remain local and are not added to public assets or protected Storybook.

Final scoped checks:1,063 tests across64 HUD/space files pass, TypeScript and scoped
ESLint pass, file validators/diff checks pass, and the isolated production build
passes. All57 published public assets compare byte-identical to the prior build.

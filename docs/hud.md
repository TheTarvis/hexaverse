# System HUD

Status: production integration in progress, updated 2026-10-17. Source: Travis's weekend
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


## Safari browser gesture arbitration — 2026-10-17

Actual iPhone feedback02:25UTC: a downward finger drag invokes refresh and pinch
invokes Safari's tab UI. The prior pointer tests did not establish control of
Safari's default gesture behavior. Physical iPhone acceptance remains pending.

The inspected map canvas and region already have touch-action:none. Body hit and
annotation targets have touch-action:auto but share that none ancestor. The route
root is fixed100dvh with overflow:hidden/overscroll:none; document/body remain auto.
The missing path was explicit native default cancellation: no nonpassive map touch
or Safari GestureEvent handlers existed. React19's delegated touchstart/touchmove
listeners are passive (verified in installed react-dom source), so adding only
React touch props would not provide reliable preventDefault arbitration. This is
a concrete implementation gap, not a captured trace proving Safari's exact cause.

map-browser-gestures.ts now binds capture/passive:false touchstart and touchmove
before the first map touch. It cancels default immediately for map-owned touches,
including body/label starts. Safari gesturestart/change on the document are
cancelled only while this map owns a touch; an outside-origin pinch, map camera
button, inert map or closed/unmounted gesture is not claimed. End/cancel/blur and
cleanup release ownership. The listener only arbitrates browser behavior; existing
Pointer Events still own pan/pinch/selection. Touch affordances activate once via
the pointer release path; legacy per-mark touchend cannot double-select.

No document-wide touch blocker, body scroll lock or viewport maximum-scale/
user-scalable restriction was added. Cards remain scroll containers, outside the
map listener. Map-only selection/callout suppression and overscroll:none complement
touch-action. Phone ↔ opens44px directional pan controls; zoom/recenter remain
reachable if Safari reserves a gesture. Browser/OS gestures whose events never
reach the page or are noncancelable cannot be promised suppressible; Safari's
physical tab/edge behavior still needs the phone retest.

Primary guidance: [Apple Safari event handling](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html)
describes preventDefault for custom touch/gesture behavior (archived guidance,
with an explicit future-behavior caveat). [WebKit passive listener guidance](https://webkit.org/blog/8216/new-webkit-features-in-safari-11-1/)
and [root-listener default clarification](https://bugs.webkit.org/show_bug.cgi?id=182521)
explain why explicit passive:false is necessary for cancellation.

Verification:1,067 HUD/space tests across65 files, types/scoped lint and isolated
production build pass. Native trusted touchstart in both installed Chromium and
WebKit is cancelable/defaultPrevented:true and still selects exactly once.
Constructed TouchEvents with fixture TouchLists and gesture events verify first
map/label start, movement, pinch arbitration and release in both engines. The older
installed WebKit rejects new Touch(), so the fixture constructs TouchEvent then
sets fixture TouchLists; those are not browser-generated two-finger touches.
Chromium browser-generated downward pan/pinch change only camera state: page
scroll, visualViewport scale and offset stay unchanged. Chromium native card scroll
works; WebKit card touches are unblocked and its overflow:auto container can scroll
programmatically. WebKit native two-finger pan/pinch/Safari tab UI are unverified.
Pan fallback and restored map cancellation after card close pass in both engines.

Runner: .scratch/weekend-visual-batch/safari-gesture-regression.cjs; local evidence
/tmp/hexaverse-safari-arbitration.log. Existing touch/resize/card/desktop fixture
remains local. No identity or live gameplay state was selected or modified.


## System document ownership — 2026-10-17, current correction

At11:56UTC Travis reports “One finger drag down still starts the refresh.” Parent
inspection of the actual iPhone screenshot shows Safari's refresh spinner and the
entire game shifted down beneath a black gap; compact chrome is present. This
invalidates any assumption that the prior map-listener patch solved physical iOS.

Read-only inspection of served `/systems/sys_0_1` HTML and27 referenced chunks
confirmed the old nonpassive map listener and pan fallback in the active system
chunk page-70f33cd104830626.js. Stale code was not presumed. The concrete scope gap:
map listeners only saw map descendants, while html/body retained document scrolling.
HUD/fleet/navigation/loading starts outside the map could miss cancellation. A
local Next production-layout comparison reproduces that gap: constructed HUD-start
drag is uncancelled under the prior shell and cancelled by the new document owner.
That test does not reproduce Safari's native refresh UI.

SystemSpaceView now mounts SystemViewport, which owns the mobile document until
route exit (including loading/error states and opened cards). html overflow/height
and body fixed position/height/overflow are locked, with exact prior inline values
and priorities restored on exit or desktop transition. Ownership survives modal
style restoration; shared roots retain the lock until the final owner releases it.
No permanent application-wide lock or global touch-action:none is installed.

A native document capture/passive:false listener covers the whole system page.
Empty/noninteractive starts are cancelled immediately; real buttons retain native
taps, with the first unconsumable drag move cancelled. Independently scrollable
cards/portalled dialogs can scroll in available directions; top/bottom chaining is
blocked. Inputs retain editing behavior. Multi-touch outside the map and zoomed
visual viewport panning are not cancelled, and no user-scalable/maximum-scale
restriction is added. Existing map gesture and tap/drag logic remains in place.
This supersedes the earlier decision to leave document scroll ownership unchanged.

The shell uses visualViewport height at scale1, with window.innerHeight fallback;
normal map input never follows rubber-band offsetTop. A focused editor may use the
keyboard's visual offset. Full-page sheets/guide/inspector inherit the same height
and top variables, and external floating navigation accounts for the obscured
bottom band. Camera/pan/vitals remain inside the visible shell plus safe-area inset.
At accessibility zoom the shell keeps its unscaled dimensions rather than chasing
the zoomed rectangle.

Verification:1,072 tests across66 HUD/space files, types/scoped lint/file validators
and production build pass. A temporary loopback-only `/login/touch-qa` production
route composes the real RootLayout/Providers/portals, SystemViewport, live SpaceStage
and production HUD with identity-free fixture data. Chromium and installed WebKit
verify baseline/fixed HUD cancellation, canvas/label/heading/fleet start coverage,
card scroll/close, modal-style restoration, fallback bounds at375×667/390×600/
844×390/390×844, and an actual Next route exit restoring normal login document
styles. Chromium browser-generated HUD downward drag leaves document and shell
fixed and does not activate the button; native card scrolling also passes. WebKit
HUD move arbitration uses constructed events; its native taps and route cleanup
pass. The temporary route is removed before the final deployable rebuild.

Existing map pinch/tap/resize/desktop regressions pass. Physical Safari pull-to-
refresh and browser chrome cannot be reproduced with these headless engines; a
physical iPhone retest remains required. No native Safari success is claimed.
Evidence: .scratch/weekend-visual-batch/root-viewport-regression.cjs and local
/tmp/hexaverse-root-production-qa.log; screenshots stay in/tmp/hexaverse-root-viewport-qa.


## Input restoration after physical regression — 2026-10-17, current correction

At12:27UTC Travis reports refresh stopped, but no finger gestures or buttons work
after dece79e. The document capture interceptor is unsafe as a general solution:
it cancels every unconsumable single-finger move, with no tap-jitter threshold, and
can suppress synthesized native clicks. Map touchstart cancellation also depended
on Safari continuing a derived pointer stream. These are concrete implementation
risks; the exact universal physical lockout was not reproduced locally. Trusted
Chromium taps with2/5/10px injected movement still activated HUD in the baseline
(the engine emitted no touchmove at those distances), so no reproduced jitter cause
is claimed. Inert/overlay leaks were not found in the production-layout tests.

Emergency rollback0feef64 removed ALL document touch/gesture input listeners at
12:31UTC. html/body layout and visible viewport sizing remain; the root owner is
now layout-only, marked system-viewport-layout-only-v2. It never prevents document
input or intercepts card scrolling, at boundaries or elsewhere. This supersedes
the previous document capture/chaining strategy. No additional global input
interception is added. Ordinary HUD/menu/close/pan/zoom buttons retain native clicks.

Map input now owns native TouchEvents directly. Touchstart is not cancelled. Native
touchmove pans or pinches after the gesture threshold; camera changes do not depend
on the existence of touch-derived PointerEvents. Touch-pointer events are ignored
by mouse/pen handlers, and a touch pointercancel cannot erase native touch tracking.
Tap selection resolves at native touchend; fleet/ghost/offscreen taps retain their
native click path. Owned map drag ends suppress compatibility clicks; legacy
touchend handlers cannot duplicate selection. Safari gesture listeners exist only
on the map host, never the document. Mouse/pen and keyboard behavior remain.

Stronger evidence:1,072 tests across66 files, types/scoped lint/validators and build
pass. New native touch regressions assert actual camera/selection callbacks with
no pointer events and through touch pointer cancellation. A temporary local-only
Next production-layout route blocks ALL touch pointer events before the app sees
them. In both installed Chromium and WebKit, trusted touches select map/fleet once
and activate HUD/menu/Objects/Console/Command/Close/settings/zoom/pan/recenter
callbacks. In-memory fixture travel Start/Stop callbacks execute; no live verbs run.
Card scrolling and absence of stale inert after closing are checked at390×844,
844×390 and390×600, as is actual Next route-exit layout cleanup.

In WebKit, constructed TouchEvents with fixture TouchLists assert actual pan and
pinch camera changes (not merely defaultPrevented). Chromium also exercises
browser-generated native pan/pinch while the entire touch-pointer stream is
blocked. Native WebKit two-finger/Safari browser UI remain unverified; these
headless results do not establish physical iPhone recovery. The native zoom/pan
buttons are the demonstrated fallback when browser gestures are reserved. No
another physical retest is presumed from silence, and no request is made until
this stronger callback evidence is available.

Runner: .scratch/weekend-visual-batch/input-restoration-regression.cjs; local
evidence:/tmp/hexaverse-input-production-qa.log. Its temporary production QA route
and fixture are removed before the final deployable rebuild. All57 public assets,
authentication, gateway diagnostics/routes and preview cutoff remain unchanged.


## Invisible recovery modal — 2026-10-17

The actual production system route reproduces the reported whole-page lockout
when a persisted recovery guide is active. The inline ConsoleDock remains mounted
inside its hidden workspace panel, and its console-dock-collapse button has
aria-expanded=true. A broad workspace expanded-button selector therefore hid the
guide layer. The invisible Recovery transmission still owned the phone modal and
made the visible map, heading and HUD inert. No JavaScript exception was required.

Remove that selector; the existing workspace data-mobile-open rule alone controls
guide visibility when a real phone panel opens. This correction changes no gesture
handlers. Real login and system routes with synthetic intercepted Auth/game data
pass in Chromium and WebKit at390×844: persisted wake/objects guide is visible,
dismiss releases inert, and HUD/Console/open/close/zoom callbacks work with zero
browser errors and zero game writes. The production ConsoleDock is included;
earlier component fixtures did not reproduce its hidden expanded button.

Runner: .scratch/weekend-visual-batch/deployed-page-diagnostic.cjs. Evidence:
/tmp/hexaverse-invisible-modal-after.log and /tmp/hexaverse-invisible-modal-wake.log.
HTTPS origin is browser-intercepted to local production resource bytes; this does
not validate the authenticated ngrok edge or establish physical iPhone acceptance.

First-login coverage also exercises the real wake form, entirely synthetic spawn
response, app-created wake guide, Begin transition to objects, dismissal
and restored controls in both engines. No existing identity or live API is used.
The single intercepted fixture POST never leaves the browser; other mutations
remain forbidden. Evidence: /tmp/hexaverse-invisible-modal-first-login.log.

## Mobile camera orbit — 2026-10-17

Travis confirms actual iPhone one-finger pan and zoom now work; orbit was missing.
Default controls: one finger pans, two fingers moving together rotate, and changing
finger spacing zooms. The visible Rotate toggle makes one finger rotate; switch it
off to pan again. The nearby hint states the current mode. Controls remain44px.

Orbit reuses desktop yaw/pitch rates and bounds. With a selected body/gate or point,
it rotates the whole view around that live position while preserving its screen
position, distance and framing; it does not recenter. Without selection it keeps
the current target/fleet-follow pivot. Adding/removing fingers changes tracking
only, never resets camera framing; a remaining finger after a pinch must be lifted
before a new one-finger gesture. Stationary-finger pinch centroid movement does not
rotate the view. Cancellation and card close retain working independent gestures.
No document input interception or touchstart cancellation was added; the recovery
modal visibility fix remains intact. Physical iPhone orbit acceptance is pending.

Validation:148 tests/11 files pass across camera, SpaceStage, renderer/transform,
HUD, recovery and viewport ownership; TypeScript/scoped lint/build pass. Real
production-route synthetic-data checks pass for first-login and persisted wake/
objects states. Selected pivot/eye-distance preservation, no-selection target,
pan/pinch/orbit transitions, cancellation, Rotate toggle and post-card-close orbit
pass. Chromium uses browser-generated trusted one/two-finger input; WebKit drags
use constructed TouchLists while Rotate/HUD/close taps are browser-generated.
No live game calls or identity selection. Runner:
.scratch/weekend-visual-batch/deployed-page-diagnostic.cjs (QA_ORBIT=1).

## Camera buttons removed — 2026-10-17, current direction

Travis requests removal of the bottom-right camera buttons on mobile and desktop.
This supersedes the Rotate toggle and button fallback above. No camera cluster,
pan arrows, zoom/recenter buttons or center-selection button remains at any size.
The transient rotate-mode state is deleted: one finger always pans, pinch zooms,
and two fingers moving together orbit the selected object. The mobile gesture
hint is available to assistive technology without a persistent visual overlay.

Desktop primary drag orbits, secondary drag pans and wheel zooms. Tab focuses the
map itself: arrows orbit, Shift+arrows pan, plus/minus zoom, Home recenters, and
Enter selects the camera-center point. The map names these shortcuts accessibly,
shows keyboard focus and retains limit announcements. Child controls keep their
own keys; unavailable rendering disables camera keyboard input. No document input
interception, touchstart cancellation or recovery/card ownership rules changed.
This UI request does not establish actual iPhone two-finger orbit acceptance.

Validation:148 tests/11 files, scoped lint, TypeScript and isolated production
build pass. Real-route first-login and persisted-guide tests pass before/after
deployment in Chromium/WebKit. Portrait390×844, landscape844×390, short390×600
and desktop1280×900 have no camera cluster or horizontal overflow. Selected-pivot
orbit, pinch/pan transitions, cancel and post-card-close pan/orbit work; desktop
mouse orbit/right-drag pan and map keyboard shortcuts work. Chromium uses trusted
native multi-touch and card scrolling; WebKit uses constructed gesture TouchLists
and programmatic card scrolling, with native HUD/close taps. Existing emulator
journeys were updated to canvas keyboard/geometry expectations and statically
checked; their full emulator runs were not performed. Physical iPhone orbit remains
unverified. Evidence:/tmp/hexaverse-gesture-only-{candidate,live}-{objects,first}.log.


## Shared card baseline — 2026-10-17

Travis requests the established HUD card foundation across visible game panels,
starting with Command/mining. HudWorkspace now owns one HudCardShell per Objects,
Command and Console panel. Settings, recovery/objective, fleet inspection and remote
fleet status use that same shell. Existing HudTypography and HudFacts own internal
headings, copy and figures; Catalyst controls remain the control foundation.

Card roots remain positioned containing blocks so decorative surfaces stay inside
their owner. Nested HudCardShell content defaults to an unframed section, preserving independent
travel/action titles and dismissal without duplicate decorative borders or lighting
renderers. Detached overlays explicitly request framing. Shared row/column facts
and section spacing replace custom facts and dashed/left-edge action frames. HUD
controls remain dark and readable regardless of OS color scheme. No new card style
or public art was introduced; this does not finalize the still-open button studies.

Workspace activate/dismiss events notify the existing Console owner, so selecting
Console opens its contents directly while preserving controlled expansion, focus,
mounted tabs and live announcements. Search, selected details, typed quantities,
layout preferences and drafts remain mounted through navigation/hiding. One shared
content viewport scrolls within each fullscreen phone card; close remains outside
that viewport and reachable at safe-area edges. Desktop lanes retain arrangement
while reserving navigation space. Gesture-only camera input and the recovery-modal
visibility correction remain unchanged.

The [migration record](../.scratch/hud-card-baseline/spec.md) distinguishes tested
behavior and local visual captures from physical-phone acceptance. Hidden legacy
Course/roster/flight-control paths are not a new visible design; navigation/vitals
bars and application naming dialogs keep their own roles. No gameplay rules or
inspection/command-fleet ownership changed.

## Mobile workspace header and focus — 2026-10-17

Objects, Command, Console and Arrange share the same four-destination navigation
inside HudCardShell. Phone title, inset 48 px close and navigation stay outside the
content scroll viewport, within the existing safe-area/visual-viewport owner. The
close has a visible button surface separate from the illuminated beveled corner;
desktop chrome keeps its existing density. Detail Back remains a content action.

Workspace tab changes keep one phone-sheet isolation owner instead of tearing it
down and restoring a previously focused search field between destinations. A
hidden focused control hands focus to the selected destination tab with
preventScroll; tab changes never deliberately focus an input. Closing returns to
the map/HUD control and releases background inert. Search, details, Console state,
quantities and layout preferences remain mounted through Arrange handoffs.

The previous production search computed to14 px in Chromium and WebKit. Shared
HUD input/select/textarea text now computes to at least 16 CSS px on phone/coarse
surfaces, addressing the small-text condition associated with iOS focus zoom.
Browser pinch zoom and viewport scale remain unrestricted. Desktop fine-pointer
form text is unchanged. Browser engines and reduced viewport tests cannot establish
native iPhone keyboard/focus-zoom acceptance; physical-device feedback is pending.

## Card-centered workspace titles — 2026-10-17

The first mobileHeader refinement used a space-between flex row and explicitly
removed the baseline title's left:50% translation. This placed the title at the
left of the phone header; its center measured about 110 px left of the card center
at 390 px viewport width in both browser engines. The accepted plain Storybook card
kept the original centered title, so its alignment differed from workspace phones.

The shared phone header now has equal side tracks around a centered title track.
The inset 48 px close occupies the right track; an empty or occupied left track
cannot shift the title. Long titles truncate between reserved control areas.
Desktop keeps the accepted centered positioning. Content Back remains independent
of root dismissal; persistent tabs, safe-area/visual-viewport sizing, internal
scrolling, 16 px phone inputs and unrestricted accessibility zoom stay unchanged.

Geometry assertions compare title/card midpoints within 1 CSS px at 375/390 portrait,
844 landscape and 1280 desktop. Phone checks also use a long title and unequal 44 px
Back/48 px close controls, and real object detail/back transitions. Storybook's
MobileHeaderAlignment story exercises the same shared shell.

## Current header and close contract: original Storybook chrome — 2026-10-18

The visual source is HudCardShell and its Plain story from commit 624c4ff. This
supersedes the inset mobile-header refinements above. Every framed app card and
Storybook story uses the same component and original visual rules: 11px floating
centered plaque; transparent 28x28px corner close at top/right -10px; 14px X with
its original stroke/glow. The mobileHeader variant and app-specific close offsets
are removed. Broad phone button sizing excludes the close; keyboard focus styling
remains the original accessible outline.

The existing Catalyst span supplies an invisible 44x44px pointer target, extended
inward from the original control so it fits phone safe-area margins. Neither the
visible button nor glyph is enlarged. Persistent panel/Arrange tabs remain fixed
outside the internal content viewport, below the original chrome. Fullscreen
phone ownership, mounted drafts/details/back state, 16px fields, unrestricted
accessibility zoom and canvas gestures remain intact.

The original title/close CSS is frozen verbatim under components/hud/__fixtures__
and verified by HudCardShell.reference.test.ts. A commit/hash-labeled JSON fixture
pins browser-computed styles and geometry; checks compare original Storybook and
actual app side by side at phone/desktop widths, including long titles, independent
Back, invisible-target edge taps and desktop hide/reopen. The reference must not
be silently updated to make a changed design pass. Physical iPhone acceptance is
still distinct from these browser checks.

## Direct mobile HUD navigation — 2026-10-18

The mobile HUD dropdown is replaced by four direct icon controls: Objects/search,
Command/rocket, Console/chat and Arrange/sliders. They use existing HudIcon and
Heroicons outlines, with accessible names/titles, aria-controls and aria-pressed
state. Each control is 44x44 CSS px. The same strip floats beside the system heading
on the map and appears in the open card's fixed toolbar; exactly one navigation
landmark is visible at a time. Desktop keeps its existing text launchers/Arrange.
No new destination, nested menu or gameplay action was added.

The map reserves heading space for the compact 198px strip and keeps the scene
center free. A paused tutorial's Resume guide button and objective have separate
rows below it, preserving the route back to recovery without covering the icons.
Enter/Space open destinations; Escape and close return focus to the launch icon.
Panel drafts/details, layout preferences, single sheet isolation, fullscreen safe
areas and internal scrolling retain their existing owners. The frozen 624c4ff card
header/close CSS, 16px phone fields, unrestricted zoom and map gestures are unchanged.

The two supplied screenshot Library IDs could not be read in the local session:
Library screenshot/content tools were unavailable. Implementation was grounded in
the actual four-destination menu and verified rendered routes instead. Physical
iPhone acceptance remains separate from local-browser/engine checks.

## Objects list and pinned search — 2026-10-18

Opening Objects shows every available server-disclosed row immediately with an
empty text query. The inner Objects disclosure is removed. This does not open a
fullscreen panel on map entry; the existing workspace launcher owns that choice.
Search remains pinned inside the actual card scroll viewport, without covering
its fixed navigation/header. Typing filters known names/types; clearing restores
all available rows. No category selector hides rows. Opening does not autofocus
the field or summon a phone keyboard.

Selection, detail Back, mounted action drafts and all existing actions retain their
owners. Closing the outer card releases expensive previews while preserving
browsing state. Escape backs out of details first, then reaches the workspace.
Original shared header/close styling, direct icon strip, safe areas, 16px phone
fields and accessible zoom remain unchanged. HUD/Objects Search demonstrates the
same component with enough rows to exercise real internal scrolling.

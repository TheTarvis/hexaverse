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
  Phones use a launcher and one bounded active panel. Dock buttons support
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
or physical touch/keyboard/Safari-chrome verification. Actual iPhone visual retest
remains pending; successful iOS emulator SSO was separately confirmed earlier.

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

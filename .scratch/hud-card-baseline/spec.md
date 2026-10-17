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

# Weekend project checklist

Updated 2026-10-16 · branch feat/vibrant-system-scene · local commits only, no push.
Meshy: **30 / 2,600 credits spent**; balance verified **2,658**. No purchases or plan changes.

## Done

- Actual iOS emulator SSO sign-in confirmed by Travis on 2026-10-16: “Yup emulator
  sso working.” Session persistence, token refresh and gameplay checks remain unverified.
- Baseline commit 768fd90; baseline and updated frontend production builds pass.
- grill-with-docs shared brief/glossary; Chrome screenshots and Meshy MCP verified.
- Six procedural visuals, world integration, seven static thumbnails and object-browser art.
- Integrated checks: **123 tests pass**; TypeScript/scoped lint/file validators pass.
- Storybook production build passes. Gate GLB and accepted appearance preserved.
- Textured ruin/debris candidates downloaded and optimized to about 1.3 MB each.
- Canonical design index, HUD, phone-preview and stealth/combat records saved in local
  commit b0d882e. Accepted individual-ship signatures and sensing stages recorded;
  stealth/combat implementation deferred.
- Production workspace/travel integration: show/hide/arrange, per-corporation local
  persistence/reset, phone launcher, server-quoted Start/status/Stop and gate jump.
- Phone-width Chrome review at 390×844: no horizontal overflow in workspace, settings
  or travel fixture; workspace/travel controls measured at least 44px. Shared close
  target corrected to 44px. This is not actual iOS testing.
- Current Next and Storybook production builds pass (existing warnings).
- Final combined HUD/world checks: 418/418 pass across 24 files; 87 additional
  targeted hook/control/travel tests pass. TypeScript, scoped lint and validators pass.
  Fast-refetch scan pending race fixed with deterministic regression coverage.

## In progress

- Visual acceptance: actual Chrome world/HUD and generated-vs-local asset comparisons.
- Latest compact art sheet: comparison-03.png (128px sources plus actual 32px, dark/light).
- Ruin candidate still softer than gate; image-guided reference02 is saved locally.
- Debris generated candidate rejected as production replacement; procedural fallback
  now has substantial hulls.
- Integrated production interaction review and actual iOS gameplay testing remain.
  iOS emulator SSO sign-in is user-validated; session persistence/refresh remain unverified.

## Next

- Resolve ruin image upload permission; choose/refine production ruin and debris.
- Recheck all seven at world scale/32px, reduced motion, disposal and both renderer paths.
- Production HUD checkpoint committed locally as62e392c; no push authorized.
- Review integrated production interaction and real iOS usability after access approval.
- Future design only: stealth/combat. Parking at arbitrary positions confirmed; existing
  physics/API already support it. HUD exposure is the gap; no tracking/engagement work.

## Blocked

- Automatic approval review blocked uploading ruin-reference-02.png to Meshy because
  it derives from the private gate reference. Explicit upload permission requested.
  Proposed operation costs 15 credits; **no upload or charge occurred** for this attempt.
- Remote phone preview is approved and active behind the exact Google identity
  restriction until Oct19 00UTC; actual iOS emulator SSO is user-validated.
  Session persistence, token refresh and gameplay checks remain unverified.
- Dock layout is the reversible current implementation; free placement/resizing remains
  an optional design choice, not a blocker for approved HUD work.
- No browser/MCP authentication blocker. Server is configured but not attached to this
  task tool list; existing server works via temporary stdio client without reconfiguration.

## Preview links

- http://127.0.0.1:20203/?path=/story/hud-object-thumbnails--feature-comparison
- http://127.0.0.1:20203/?path=/story/graphics-feature-art--ruin-production-comparison
- http://127.0.0.1:20203/?path=/story/graphics-world-gate--feature-lineup-close

## HUD architecture

Keep data/quotes/mutations in SystemSpaceView; presentation-only dock workspace,
validated per-corporation local preferences, keyboard move controls and mobile launcher.
Real course review/commit now uses existing server quote hooks. Prototype fuel estimates
never enter production commands. Final integrated checks are in progress.

## Latest local QA

- Migration proposal a9b9274: docs/documentation-migration.md; no moves/deletes.
- Fixed Cut drive access and docked station services during failed interior reads.
- Real game phone390×844: objects→server-quoted travel review→Back, launcher/console
  navigation verified without submitting orders; navigation/vitals overlap corrected.
- Revised radiation dark carriers and regenerated thumbnail; other14 PNGs unchanged.
- All seven reviewed in Chrome close/gameplay world and 32px light/dark comparison;
  manufactured ruin/debris remain provisional; no blanket art acceptance.
- Local /storybook prefix verified with actual manager/iframe/images and WebGPU world.
  Isolated game build passes; gateway/build-helper18 tests pass. No public endpoint.
- Updated HUD/world408 tests pass across22 files; additional vitals/art128 pass.
  These overlapping runs are separate checks, not a unique combined count.
- Preview-only email login verified through actual gateway; Google/signup excluded.
  Preview/config43, login23, gateway/helper18 tests pass separately. Final isolated
  build passes; ordinary tracked tsconfig unchanged. Temporary QA servers stopped.
- Renderer-unavailable behavior has regression-test coverage, not a forced live
  graphics-failure browser check. Real HTTPS/login/refresh/SSE/iOS remain pending.

## Post-checkpoint phone tap review

- Real Chrome390px station-row tap initially hit an invisible scene body target
  above the HUD (depth z-index around5000). Scene stacking is now isolated below
  workspace; actual DOM hit test and tap open the station's Sell/Refuel/Hold details.
- No game mutation submitted. Mobile workspace inputs/selects now at least44px.
- Scene/view110 tests pass. Preview remains unexposed; no local ngrok process or
  agent4040 listener observed. No verified phone URL exists in this local session.
- Approved domain migration underway, preserving numbered history and active scratch.

## Activation / documentation follow-up

- Weekend protected access approved until 2026-10-19T00:00:00Z for exact Google
  identity wilson.travis.t@gmail.com; bounded shutdown c38d6a5 and polling 63bfc87 ready.
- Explicitly approved email-only consent completed, but ngrok asks for a NEW account
  and Terms of Service acceptance. Stopped before account creation/terms. Need the
  existing sign-in method or user-completed account creation.
- Plan/quota remain unverified; no endpoint/live URL. Latest isolated polling build passes.
- Docs migration d47d657 complete; recoverable old-doc cleanup is now authorized
  and in progress separately. Meshy reference upload remains blocked.

## Current protected-preview checkpoint

Supersedes pending-preview notes above: Travis created the Free ngrok account and
configured its token himself. The protected endpoint and bounded gateway are
running at https://gulf-identity-scrap.ngrok-free.dev/ and `/storybook/`, expiring
2026-10-19T00:00:00Z. No duplicate launch, paid charge or push is authorized.

Exact case-insensitive Google email allowlist is configured. Unauthenticated app,
Storybook, API and forbidden paths redirect to ngrok authentication; read-only
gateway routing checks reject admin/push/traversal/environment-file paths.
Signed-in access remains unverified: visitor consent requests name/profile picture
plus email. Stopped before Continue; Travis is reviewing on his phone. Do not
accept expanded consent without explicit approval. See docs/phone-preview.md.

Documentation migration and complete numbered-spec archival are committed through
f2e7819. Domain-guide alignment is recommendation only pending user reaction;
retain one glossary and treat the nine domain pages as topic references.
Meshy private reference upload remains separately unapproved.

- Phone start-area404 diagnosed and fixed: exact `/galaxy/start-area.json` was
  omitted from gateway public assets; Next already served the73-system file.
  Gateway reloaded with same protection/deadline; now200 with byte-identical JSON.
  Sibling/admin/push/env paths still404, outer unauthenticated access stillOAuth302.
  All16 gateway tests pass; user's phone refresh remains pending. No cookies reused.

## Current visual/fallback follow-up

- Native WebGPU close/gameplay lineup and actual32px dark/light comparison reviewed.
  Gate and four natural categories retained as current delivery; ruin/debris remain
  provisional against the accepted manufactured finish. No blanket art acceptance.
- Real WebGL2 compatibility verified in a new reusable World Gate story. Controlled
  double creation failure leaves readable notice/Retry and all seven static32px
  thumbnails; Retry restores actual WebGPU world. Physical device loss/iOS unverified.
- Story-only dark background corrected. Staged static build passes and is available
  under protected Storybook; previous hashed assets retained for existing open tabs.
- Current compact source-art evidence: comparison-04.png; this is not a world screenshot.
- Bootstrap audit45 resources passes; API401 and invalid login/lookup/refresh JSON400
  confirm narrow routing. No further public paths added. Valid remote game login and
  token refresh still require actual user verification; no session cookie reused.

## Local art completion decision

See acceptance.md for explicit criteria, completed/remaining matrix and testable
next steps. Gate thumbnail, anomaly, nebula, gravity well and radiation now pass
the delegated art brief; this is an agent art decision, not personal Travis approval.
Anomaly light-surface halo and gravity dark-surface lens strengthened locally.
Feature-art20 tests, type/lint, native/WebGL2 world and actual32px reviews pass.
Only those two PNGs changed; other13, including accepted gate, are unchanged.
Ruin's tower/slab architecture and debris's overlapping silhouette remain specific
unfinished work. Local revision steps are documented; Meshy upload is optional and
still blocked. Protected preview/build remains unchanged during these local edits.
No comparison image uploaded or published. Entire weekend work is not complete.

## Local manufactured candidates improved

- Ruin now has broken faceted spine/empty sector, three unequal buttresses and
  detached plate; debris has one dominant hull plus three detached sections.
- Raised only these two thumbnail capture angles; four separate debris components
  survive32px (53/18/9/9 pixels at alpha64), with clear gaps. Other13 PNGs unchanged.
- Added local instance-owned brushed-metal/roughness/bump detail after plain gray
  looked plastic beside gate. Actual family comparison, dark/light32px, world
  native/real WebGL2 and gameplay checks performed. Scoped64 tests/type/lint pass.
- Geometry/readability criteria pass. Final close-view manufactured finish remains
  incomplete: authored panel wear, fractured edge/cut surfaces and seam detail need
  dedicated UV/PBR/fracture authoring or an acceptable image-guided replacement.
  Best local candidates retained; rejected soft/rounded provider candidates unused.
- Local Manufactured Family Review story only; protected compiled game/Storybook
  unchanged. No comparison upload/publication, provider spend, push or consent action.

## Phone email signup ready; simulated SSO separately pending

- User confirms phone galaxy now loads. Missing Google/signup explained by explicit
  isolated preview mode, not normal20200/mobile UI. No existing password test user
  was established; the only listed emulator account used simulated Google.
- User explicitly approved email signup. Existing form now available at
  https://gulf-identity-scrap.ngrok-free.dev/login?signUp=true with test-only copy.
  Exact additional POST accounts:signUp requires email/password JSON; anonymous,
  linking/tenant/admin payloads and all SSO/helper/reset routes remain blocked.
- Login23 and gateway17 tests pass, type/lint/build/validators pass. Actual390px
  form and live loopback gateway verified, no credential entry or account creation.
- Isolated source snapshot preserves previously deployed art: new local natural/
  manufactured refinements not promoted. New frontend20207 deadline-supervised;
  gateway20204/unchanged ngrok policy restored after prior owned processes ended.
- Exact Google allowlist/Oct19 00:00UTC expiry unchanged; no token/production/data/
  purchase change. SSO requested but additional local impersonation/account-linking
  implications require concrete approval; see docs/phone-preview.md.


## Simulated Google SSO approved and live

- User explicitly approved emulator existing-account/claims/provider-link effects.
  `/login` now offers Continue with Google and explains the simulated picker.
- Exact helper GETs and IdP POST are constrained by sso-policy.mjs; Google only,
  installed SDK12.15.0, same-origin callback, bounded known queries/fake identity
  body. No admin/reset/production expansion. Outer allowlist and expiry unchanged.
- Login/auth48 and gateway/policy23 tests, type/lint/build/validators pass. Desktop
  popup/iframe and cancellation verified; redirect helper rendered at390px. Live
  login390px has no overflow. No identity selection or credential submission.
- Live helper200, bad helper/IdP400, wrong method/admin404; anonymous external
  login/helper302 to ngrok OAuth. Actual iOS SSO was subsequently user-validated;
  session persistence and token refresh remain unverified.
- Gateway20204 now targets isolated SSO frontend20209; source pointer
  /tmp/hexaverse-sso-preview-root.txt. Same b0f42be art baseline; newer local art
  remains unpublished. Temporary QA20208 stopped, browser viewport restored.
- No push, spend, Meshy reference upload or comparison publication.


## Preview lifecycle detached from executor

- Existing foreground processes belonged to Codex runner; available logs show
  startup only, so executor cleanup is likely but no terminating signal proven.
- Same build/policy now owned by temporary launchd user job
  gui/501/local.hexaverse.weekend-preview, supervisor PPID1. No login-startup install.
- Private runtime config/events: /tmp/hexaverse-weekend-supervision/. Child restart
  backoff, pinned artifacts/policy, original Oct19 00UTC termination of all groups
  including ngrok; gateway also independently expires. Harmless deadline test passes.
- Verified live after bootstrap and inspection command sessions exited: login,
  galaxy, Storybook200; API401; external login302 to ngrok OAuth. No rebuild/push.
- Mac must remain logged in, awake and connected; backend/emulators and ngrok
  quotas remain dependencies. iOS SSO is now user-validated; persistence/refresh
  and gameplay checks remain unverified. See phone-preview.md.


## Requested mobile system correction delivered

- Inspected Travis's Library screenshot IMG_1020.png: overlapping heading/launchers,
  clipped recovery card/close control, objective/action overlap and bottom HUD overflow.
- Shared responsive bands, bounded scrollable guide body with reachable actions,
  safe-area/device viewport, wrapped/truncated fleet metrics and collapsible active
  drawer. Landscape settings close verified44×44 inside viewport.
- Chrome extension browser, local identity-free HUD/Mobile System fixture:375×667,
  390×844,667×375,844×390 have scrollWidth===viewport width. Guide progression/dismiss,
  panel switching/draft retention, settings scroll/reset/close, map selection and
  fleet/account menus verified. Desktop1440×900 inspected. Physical iOS retest pending.
- 204 distinct relevant tests pass; typecheck, scoped lint, validators and production
  build pass. Root preview updated only with requested mobile fixes and prior login;
  all57 public assets byte-identical, static Storybook/art unchanged. No Meshy/push.
- Same launchd service, exact Google email policy and Oct19 00UTC cutoff; all owned
  groups including tunnel still stopped by deadline supervision. No extra approval
  needed for this same-access mobile update; no identity/account action performed.


## Focused phone gameplay QA resumed

- Travis reports actual iPhone layout “Looks better” after88840bf. This confirms
  perceived layout improvement, not completion of travel/trading/persistence checks.
- Current work: isolated fleet selection, quote/Start/status/Stop and station-service
  coverage; local Chrome portrait/landscape HUD and persisted layout review.
- Existing emulator identities and Travis's test fleet state are excluded from QA.
  Live preview remains on the same approved build, artwork, policy and expiry unless
  a reproduced scoped fix passes isolated build and unchanged-art verification.


## Focused gameplay QA result

- Actual iPhone “Looks better” feedback recorded separately from gameplay acceptance.
- Reproduced red integration case: closing/reopening accepted travel status before
  fleet-read catch-up showed Ready and removed Stop. Preserved acceptance for the
  same fleet; another fleet clears it and the next served read still supersedes it.
- Four regression cases cover that window, same/different fleet selection, duplicate/
  rejected Stop and retry, and next-read authority. Focused204 tests pass across
  five files including50 FleetActionsPanel cases; types/lint/validators/build pass.
- Chrome extension browser,375×667 and844×390: local in-memory travel Start/status/
  Stop, insufficient fuel, passive close/reopen, fixture docking, fleet picker,
  all-hidden recovery, show/hide/reorder and persisted preferences after reload pass.
  No horizontal page overflow. Local gameplay fixture remains unexposed externally.
- No real transaction, existing emulator identity or Travis fleet modification.
  Actual iPhone gameplay/trading, session persistence and token refresh unverified.

- Focused fix deployed after isolated production build and byte comparison of all57
  public files; new source pointer /tmp/hexaverse-gameplay-preview-root.txt. Same
  launchd supervision and cutoff, exact Google policy/gateway/static Storybook pins.
  Post-reload login/Storybook200, anonymous external login302 to ngrok OAuth, no errors.


## Full-page mobile HUD requested and implemented

- New explicit direction: mobile cards fill the available page, superseding the
  earlier bands/drawer treatment. Inspected second actual iOS Arrange HUD screenshot.
- Settings and Objects/Command/Console occupy100dvh; heading/nav/vitals leave the
  opened page. Fixed title/close, internal scroll and in-page switching; closing
  restores map without changing saved visibility or discarding drafts/travel context.
- Fleet details and recovery guide use the same page behavior. Guide-to-panel handoff
  keeps one active modal and Resume guide available in map mode; saved lesson intact.
- Background inert, modal focus loop and focus recovery after action replacement.
  New regression cases cover page/map/draft lifecycle, settings Escape/persistence,
  Start-like focus transition, guide handoff/resume and fleet-detail focus restoration.
- 245 focused tests/typecheck/scoped lint/validators pass. Desktop IAB viewport checks:
  375×667,390×844,667×375 cover full bounds/no horizontal overflow, scrolling settings
  action/fixed close, draft/search retention, travel, guide and fleet detail. Desktop
  1440×900 remains docked. Actual iPhone acceptance of full-page treatment pending.
- Isolated build passes and all57 public assets compare byte-identically. Scoped
  update deployed via same temporary launchd job; source pointer
  /tmp/hexaverse-fullpage-preview-root.txt. Same identity policy/Oct19 00UTC deadline,
  no Fullscreen API, new assets, Meshy or push.

- Live verification after reload: supervisor43823 (launchd), frontend43824,
  gateway43825, tunnel43826; no errors. Login/Storybook200, unauthenticated API401,
  admin404, external login302 to ngrok Google protection. Exact policy/cutoff pins valid.


## Open preview transport incident —22:29UTC

- iPhone reports ERR_NGROK_3004. Previous anonymous302 checks were access-gate-only,
  not proof of authenticated upstream health. Exact path/fresh phone retry requested.
- Same four processes remain alive; no restart churn. Agent configured HTTP upstream
  correctly. Request traces unavailable because inspection/logging remain disabled.
- Root/login/system plain/gzip, Serais RSC/prefetch/reload/HEAD,30 production assets/
  conditional reads, concurrent requests, synthetic non-secret auth-like headers and
  HTTP/1.0/reusedHTTP1.1 responses complete locally. No real cookies/identity used.
- No confirmed cause or fix. Services/art/policy/cutoff untouched; authenticated
  ngrok edge delivery remains the concrete missing validation. See phone-preview.md.

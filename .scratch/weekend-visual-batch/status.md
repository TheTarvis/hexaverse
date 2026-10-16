# Weekend project checklist

Updated 2026-10-16 · branch feat/vibrant-system-scene · local commits only, no push.
Meshy: **30 / 2,600 credits spent**; balance verified **2,658**. No purchases or plan changes.

## Done

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
- Integrated production interaction review and actual iOS testing remain. No hung operation.

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
- Remote phone preview awaits explicit exposure approval and exact allowed Google
  identity. Recommended temporary authenticated ngrok gateway routes app/API/narrow
  Auth paths; see docs/phone-preview.md. No endpoint created.
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
  login/helper302 to ngrok OAuth. Actual phone sign-in/restore/refresh still pending.
- Gateway20204 now targets isolated SSO frontend20209; source pointer
  /tmp/hexaverse-sso-preview-root.txt. Same b0f42be art baseline; newer local art
  remains unpublished. Temporary QA20208 stopped, browser viewport restored.
- No push, spend, Meshy reference upload or comparison publication.

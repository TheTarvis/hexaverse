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

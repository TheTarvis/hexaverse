# Weekend visual batch — shared brief

Status: authorized for autonomous implementation and art selection by Travis on 2026-10-16.
Baseline: 768fd90. Local commits only; do not push. Preserve existing work.

## Authority and grill-with-docs decision tree

Read harness/skills/grill-with-docs/SKILL.md and its grilling/domain-modeling children.
The client has no Skill invocation tool; mapped to reading and applying both files.
Travis explicitly delegates remaining art decisions and visual comparisons, superseding the
skills' ordinary interview/confirmation cadence for reversible art work. Record choices
and evidence here rather than manufacturing user approvals. Consequential gameplay,
authentication, purchase and broad HUD architecture choices go back to Travis through parent.

Settled frontier: seven categories; both world and static HUD destinations; gate unchanged;
existing manufactured-01 revision 1 for manufactured structures; natural phenomena distinct;
no new mechanics, knowledge state, hazards, races or ownership lore. Runtime code is source
of truth. GLOSSARY.md is canonical domain language; implementation details belong here.

## Scope and art decisions

- Gate: derive thumbnail from accepted full-open hardware and portal. Do not alter GLB.
- Anomaly: pale violet/white broken halo with offset diffuse echoes; obscured center,
  no identifiable ship/artifact, no gate opening. Existing backend typed anomaly unchanged.
- Ruin: fractured architectural ribs/plates around a broken asymmetric arc, light gray
  metal, graphite recesses, sparse amber remnants. Clearly derelict rather than active gate.
- Debris: scattered angular industrial fragments, sparse bent beams and broken plates;
  asymmetric disconnected silhouette, no rounded mineable belt rocks.
- Nebula: layered irregular translucent cloud, soft blue/rose lobes with dark gaps.
- Gravity well: dark center and bent nested field traces; flattened asymmetric lens,
  distinct from manufactured gate and luminous anomaly.
- Radiation: dispersed mint/gold streaks and particle emission around open space;
  distinct from cloud volumes, no gameplay warning/status baked into art.

Production route: deterministic local Three geometry/effects are authorized and reversible.
Prefer shared world/thumbnail factories and bounded geometry over unrelated concept-only art.
Meshy may improve ruin/debris after actual access/balance/cost verification, but is optional.
No external generation until verified. No purchases/plan changes. Spending cap 2,600 existing
Meshy credits INCLUDING retries. See budget.md. Existing gate budget is historical, separate.

## Shared vocabulary and edge cases

Lane gate is the manufactured lane gateway; canonical art/type key is gate.
Ruin is derelict structure; debris is broken manufactured fragments; belt is natural rocks.
`resource-site` is only an existing thumbnail key; map belt to it, never all resource hosts.
Anomaly is an unexplained discovery per GLOSSARY; typed anomaly does not imply backend
analysis state. Unresolved contact is anonymous foreign fleet presence, never identifiable
fleet art. Missing images are availability placeholders, distinct from unresolved contacts.
Natural effects do not inherit manufactured metal palette. Never add rows for absent entities.

## Architecture and ownership

- Feature factory: frontend/components/space/webgl/feature-art.ts; mesh root, owned resources,
  deterministic object-ID seed, decorative-time updates, no custom renderer loop.
- World integration: SpaceWorld.tsx calls factories and decorative advancement; preserve
  picking, position, selection, server disclosure, stencil and stale-load behavior.
- Static thumbnail source uses same factories, transparent 128px PNG displayed at 32px.
- HUD component resolves canonical categories and fails safely for unknown types.
- Wire thumbnails into existing SystemObjectIndex; retain live planet/ship detail previews.
- Storybook uses existing WebGPUCanvas and actual SpaceWorld; no replacement framework.

## Acceptance

1. Seven categories recognizable at 32px on light/dark surfaces, differing in structure
   as well as color. Compare 128px and intended gameplay scale; save review evidence.
2. Same visual factories in world and thumbnails. Preserve accepted gate appearance.
3. World selection/picking/position, disposal, reduced motion and hidden-time behavior hold.
   Both renderer paths supported; report native WebGPU validation limits explicitly.
4. Actual object-browser thumbnails, safe unknown fallback, anonymous-contact privacy.
5. Relevant unit/integration tests, scoped lint/type checks, Storybook/build validation.
   Capture baseline failures separately; fix blockers necessary for playable output.
6. Required harness/validate-file.sh after edits. Do not commit caches/credentials.

## Follow-on HUD phase

Only after visual scope passes: read .scratch/hud-travel-card/spec.md and existing component
stories. Reuse foundation. Proposed acceptance: user can show/hide/arrange panels, preserve
preferences locally and reset defaults, with keyboard controls and responsive layout.
Report architectural choices before broad HUD changes. No new server preference domain
without agreement; do not let customization hide essential recovery controls permanently.

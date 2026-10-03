# Suite-integrity check — covers BOTH `add-vitals-strip` and `fix-world-time-render-loop` (2026-10-03)

Pre-journey. No tier 3/4, no stack, no fixture regen, no production edits, no test edits, no commit.

## 1. Manifest verify

`bash harness/openspec-red-manifest.sh verify <change-id>`:

- add-vitals-strip: MODIFIED x3 — `SpaceStage.interaction.test.tsx`, `SystemSpaceView.test.tsx`, `lib/format/guards.test.ts`. No deletions, no additions.
- fix-world-time-render-loop: MODIFIED x1 — `lib/client-clock/index.test.tsx`. No deletions, no additions.

Method: add-vitals-strip's manifest (gen 2, 2026-09-09T09:53Z) hashes for all three files equal their content at `b6e83a1` (sha256 compared), so the only commit since is `3dc56da`. The fix manifest (2026-09-19T19:47Z) was recorded after `3dc56da` and verifies clean for those same three files plus its other 15, so `3dc56da` is exactly the delta the add-vitals manifest cannot see.

| File | Commit | What changed | Class |
| --- | --- | --- | --- |
| `SpaceStage.interaction.test.tsx` | `3dc56da` (09-19) | (1) `frameSource={null}` added to the `stage()` helper and to 3 inline `<SpaceStage>` rerenders (static-scene mode; no assertion touched). (2) The test `Scenario: Focus survives the view's animation frames` was removed here and restated rAF-driven in `SpaceStage.transform-loop.test.tsx:149` under the identical scenario title. | (a) fix-world-time-render-loop task 4.7 ("Migrate the assertions counted in 1.1; every moved assertion keeps its scenario name") and task 2.4. The old rerender-on-`worldTime`-prop loop no longer models a frame. Moved, not dropped. The fix manifest covers both files and is clean. |
| `SystemSpaceView.test.tsx` | `3dc56da` | Comment-only: a rationale comment in the "world clock is projected at the served scale" test now refers to the client clock instead of `use-world-time.ts`. No code or assertion line changed (diff is 5 comment lines). | (b) no behavioural change. Under fix change task 4.7. |
| `lib/format/guards.test.ts` | `3dc56da` | `KNOWN_TOFIXED_EXCEPTIONS` anchors re-pointed: `SpaceStage.tsx` [753,754,810,811,975] -> [837,838,894,895,1055]; `webgl/SpaceWorld.tsx` [195] -> [201]. Same sites, same count, no new exception added, no ruling text dropped. | (a) fix-world-time-render-loop rulings **D2** (routine SDET-owned re-anchor; orchestrator verified the grep). Same mechanism as add-vitals-strip RULING 25. |
| `lib/client-clock/index.test.tsx` | created `3dc56da`; edited `1424a77` | `1424a77` added a `wallMsUntil` import and a 4-test `describe('wallMsUntil ...')` block (scale 1, scale 5 divide, never negative, no-reading fallback). Pure additions (+28 lines); none of the existing tests changed. | (b) additive. Backs the production fix `1424a77` made to `client-clock/index.ts`. NOTE: made outside the team pipeline, with no spec scenario behind it. It weakens nothing and is a strictly stronger suite. |

Other fix-change test edits already adjudicated: D1 (transform-loop fixture gets a real interior), D4 (type-only `frameOf()` annotations). Both are in the fix manifest and verify clean.

### Commit `1424a77` (out-of-pipeline) — what it did to each test file

- `lib/client-clock/index.test.tsx`: additive only (above).
- E2E specs (not in either red manifest, tier 4): `jump-commit`, `refuel-commit`, `slice`, `space-double-submit`, `space-journey`, `vitals-strip-journey` — **comment-only** relabelling ("real-time scale" -> "hang budget, warped stack"). `setTimeout` values unchanged: 900_000 / 900_000 / (slice, no setTimeout change) / 900_000 / 1_800_000 / 900_000. No assertion touched.
- `scan-lane-transit-fizzle.spec.ts`: `test.setTimeout` **1_200_000 -> 300_000** and the countdown `expect.poll` timeout **900_000 -> 120_000**. Both are **tightened**, not raised, so the `docs/testing-tiers.md` ban on raising timeouts is not violated. They rest on the same commit's production change (`backend-stack.ts` boots WORLD_TIME_SCALE=5 and a cheaper lane via `LANE_MS_PER_DISTANCE`, default 0 = shipped tuning). No scenario assertion or message changed. Caveat for the journey run: these budgets are only valid on the warped stack; I could not run tier 4, so the 120s countdown budget is unproven.
- `world-time-render-loop-journey.spec.ts` (245 lines) was added there. It is a new Playwright spec written outside the SDET role/phase and before the tree was locked. Class (b) (additive), but the journey-phase SDET should read it rather than assume it.

**Class (c) findings: none.** No assertion was weakened, skipped, deleted or loosened without a spec change or adjudicated defect behind it. No new `.skip`/`.only` in the diffs reviewed.

## 2. Tier 0 and tier 1 (whole current tree)

- Tier 0 `python3 .claude/skills/code-quality-checks/check.py --files-only`: PASS ("All checks passed!"), including the package-list agreement check.
- Tier 1 `bash harness/check.sh`: PASS, 63s. go vet OK; `go test -short ./...` 19 packages ok (none FAIL); tsc OK; eslint OK; vitest **124 files / 1694 tests passed**, 0 failed. Neither change's suite red; nothing red elsewhere.
- Task 10.1 evidence: both green on the tree at HEAD `592df53` with only the four `docs/handoffs/*rulings*` files dirty.

## 3. Fixtures under `backend/system`

Not touched or regenerated. The system package's `-short` tests passed (10.8s) on the existing fixtures, so I have no evidence the FMA cause has lapsed. I did not probe it further.

## Verdicts

- add-vitals-strip: **INTEGRITY CLEAN** (3 modifications, all class a/b via fix-world-time-render-loop task 4.7 and D2). Tier 0 PASS, tier 1 PASS.
- fix-world-time-render-loop: **INTEGRITY CLEAN** (1 modification, additive class b, from out-of-pipeline `1424a77`). Tier 0 PASS, tier 1 PASS.

Recommend (non-blocking): the add-vitals-strip manifest should be re-recorded as generation 3 citing `3dc56da` / D2 / task 4.7, so a later verify is clean. I did not do it.

# `fix-world-time-render-loop` — red-phase coverage table

SDET, 2026-09-19. Written against the impl contract
(`fix-world-time-render-loop-impl-contract.md`) and the two spec deltas
(`openspec/changes/fix-world-time-render-loop/specs/{system-space-view,galaxy-view}/spec.md`),
plus the live `system-space-view` reduced-motion scenario folded in by task
2.5/3.8 (USER RULING 1). Tier commands are `docs/testing-tiers.md`'s tier 0/1
only (`bash .claude/scripts/check.sh`, `cd frontend && npx tsc --noEmit`,
`cd frontend && npx vitest run <path>`) — no stack booted, per role.

Status legend: `assertion-red` (fails on a real, executed assertion against
today's tree), `compile-red` (fails because the file/module it needs does not
exist yet — confirmed via `tsc --noEmit` and a live `vitest run`, not
inferred), `already-green` (already correct today, with why), `Playwright,
deferred` (provable only end-to-end; covered by the journey after every task
is checked), `not-observed-red` (K8: attempted honestly against the pre-fix
tree; the mechanism did not reproduce under jsdom — recorded per the
orchestrator's own anticipation of this outcome, not weakened to force a red).

## 1. `system-space-view` — ADDED "Animation Never Re-Renders the View, and Never Starves a Navigation"

| Scenario | Test | Level | Status |
|---|---|---|---|
| Frames pass without the view rendering | `SystemSpaceView.render-loop.test.tsx :: "Scenario: Frames pass without the view rendering"` (task 2.1) | integration (real `SpaceStage`) | compile-red (file imports `@/lib/client-clock`/`@/hooks/use-reduced-motion`, not yet created) |
| A counting figure advances without a per-frame render | `SystemSpaceView.render-loop.test.tsx :: "Scenario: A counting figure advances without a per-frame render"` (task 2.2) | integration | compile-red (same file) |
| A figure resyncs promptly when the tab regains visibility | `lib/client-clock/index.test.tsx :: "Scenario: A figure resyncs promptly when the tab regains visibility"` (task 3.7) | unit | compile-red (`@/lib/client-clock` does not exist) |
| A hit target tracks its mark on every frame | `SpaceStage.transform-loop.test.tsx :: "Scenario: A hit target tracks its mark on every frame"` (task 4.3b) | integration (real `SpaceStage`, no GL fake) | assertion-red — confirmed executed: `TypeError: projectMarks is not a function` |
| A mark crossing the viewport edge gains or loses its off-screen affordance within a second | `SpaceStage.transform-loop.test.tsx :: "Scenario: A mark crossing the viewport edge gains or loses its off-screen affordance within a second"` (task 4.6) | integration | already-green — today's coarse-render membership recompute (`scene.marks` + the local `basis` memo) already toggles the `offscreen-*` chip correctly on a new `scene` prop; Decision 3/M11 only moves WHICH basis this reads (loop-published vs the local memo), not the functional behaviour a static (`frameSource={null}`) mount exercises. Confirmed by an actual `vitest run` |
| A cross-system selection made while the view animates arrives | — | e2e | `Playwright, deferred` — `SystemSpaceView.test.tsx` mocks `next/navigation`, so no unit test can exercise a real App Router transition (design.md Decision 5); the tier-4 journey at `--repeat-each 20` (task 5.3) is the only evidence |
| The animating view raises no update-depth diagnostic | `SystemSpaceView.render-loop.test.tsx :: "Scenario: The animating view raises no update-depth diagnostic"` (task 2.3) | integration | **not-observed-red** (K8) — see §5 |

## 2. `system-space-view` — MODIFIED "Body, Lane-Gate, and Point Selection Is Keyboard-Operable"

| Scenario | Test | Level | Status |
|---|---|---|---|
| Tab reaches hit targets in the defined order | `SpaceStage.interaction.test.tsx :: "Scenario: Tab reaches hit targets in the defined order"` | integration | already-green (unchanged; the requirement's mechanism reference moved from "world-time update" to "animation frames", scenario verbatim, assertion untouched) |
| Focus survives the view's animation frames | `SpaceStage.transform-loop.test.tsx :: "Scenario: Focus survives the view's animation frames"` (task 2.4) | integration | assertion-red — confirmed executed (mark's `style.transform` unchanged across frames pre-fix; test fails on the vacuity guard, not the focus assertion, proving it exercises real movement) |
| A focused body or gate shows a focus indicator | `SpaceStage.interaction.test.tsx :: "Scenario: A focused body or gate shows a focus indicator"` | integration | already-green (unchanged) |
| Enter/Space selects the focused body or gate | `SpaceStage.interaction.test.tsx :: "Scenario: Enter/Space selects the focused body or gate"` | integration | already-green (unchanged) |
| A keyboard control selects the point at the camera's pan target | `SpaceStage.interaction.test.tsx :: "Scenario: A keyboard control selects the point at the camera's pan target"` | integration | already-green (unchanged) |
| The point-selection control is in the tab order and shows focus | `SpaceStage.interaction.test.tsx :: "Scenario: The point-selection control is in the tab order and shows focus"` | integration | already-green (unchanged) |

## 3. `system-space-view` — the live reduced-motion scenario, folded in (OQ1 / USER RULING 1, tasks 2.5/3.8)

| Scenario | Test | Level | Status |
|---|---|---|---|
| Reduced motion freezes decorative animation while positions keep advancing (`spec.md:1323-1337`) | `SystemSpaceView.render-loop.test.tsx :: "Scenario: Reduced motion freezes decorative animation while positions keep advancing"` (task 2.5) | integration | compile-red (same file as §1) |
| (hook half) the value flips on a dispatched `change` event with no remount | `use-reduced-motion.test.tsx :: "Scenario: the value flips on a dispatched change event with no remount..."` (task 3.8) | unit | compile-red (`@/hooks/use-reduced-motion` does not exist) |

## 4. `galaxy-view` — ADDED "Animation Never Re-Renders the Galaxy View, and Never Starves a Navigation"

| Scenario | Test | Level | Status |
|---|---|---|---|
| Frames pass without the galaxy view rendering | `GalaxyView.render-loop.test.tsx :: "Scenario: Frames pass without the galaxy view rendering"` (task 3.4a) | integration | assertion-red — confirmed executed: `onRender` called 20 times over 10 frames (2/frame, the nested-commit signature) |
| A roster countdown advances without a per-frame render | `GalaxyView.render-loop.test.tsx :: "Scenario: A roster countdown advances without a per-frame render"` (task 3.4b) | integration | assertion-red — confirmed executed: 250 renders over the 2 s window (see §5's batching note — the test is deliberately driven as 125 discrete `act()` calls, not one, so React's automatic batching cannot hide the defect) |
| A drill-in issued while the view animates arrives | `GalaxyView.render-loop.test.tsx :: "Scenario: A drill-in issued while the view animates arrives (call-site guard)"` (task 3.4a) | e2e for the real claim; unit for the call-site guard | `Playwright, deferred` for the navigation claim (design.md Decision 5: "a mocked router never enters React's scheduler and cannot be starved" — task 5.3a). The unit test is `already-green` as a **regression guard only**, not evidence of survival under animation |
| A roster burn redirect from the galaxy view commits while the graph animates | `GalaxyView.render-loop.test.tsx :: "Scenario: A roster burn redirect from the galaxy view commits while the graph animates (call-site guard)"` (task 3.4a) | e2e / unit | same treatment: `Playwright, deferred` for the claim; `already-green` call-site guard |
| The projected clock runs at the served scale | `GalaxyView.render-loop.test.tsx :: "Scenario: The projected clock runs at the served scale"` (task 3.4c) | unit | assertion-red — confirmed executed: `3008` (assumed scale 1) vs expected `180000` (scale 60) |
| The projected clock holds when no scale has been served | `GalaxyView.render-loop.test.tsx :: "Scenario: The projected clock holds when no scale has been served"` (task 3.4d) | unit | assertion-red — confirmed executed: `3008` (still advancing) vs expected `0` (hold) |

SDET-added, not a named scenario but required by task 3.4a's own text: "a roster row selection issues no router.push" — `GalaxyView.render-loop.test.tsx` — already-green (regression guard for `GalaxyView.tsx:248-253`, unaffected by this change).

## 5. Task 2.3 — the K8 investigation (recorded honestly, not weakened)

Per K8 (orchestrator ruling on impl-contract finding F9), I attempted a
genuine pre-fix red against **today's** `SystemSpaceView` (still on
`hooks/use-world-time.ts`, real `SpaceStage` mounted, not mocked) via a
standalone scratch probe (`components/space/__scratch_task23_probe.test.tsx`,
written, run, and deleted — never part of the delivered suite):

- 150 rAF frames, each in its own `act()` call: **0/150** nested-update hits.
- 500 rAF frames, batched inside one `act()` call: **0/500** nested-update
  hits.

Both runs produced `{"totalErrorCalls":0,"nestedUpdateHits":0}`. React's
"Maximum update depth exceeded" diagnostic did not reproduce under jsdom +
`act()` + fake timers, in either drive pattern. This matches F9's own
prediction: the diagnostic the real Playwright journey captured (31 times)
most plausibly depends on real wall-clock pressure — multiple rAF callbacks
arriving faster than a real browser's paint/commit cycle can drain them,
which jsdom's instantaneous synchronous rendering cannot reproduce.

**Task 2.3's own test is included in the delivered suite** (`SystemSpaceView.render-loop.test.tsx`,
`"Scenario: The animating view raises no update-depth diagnostic"`), asserting
exactly the target behaviour (no diagnostic across 120 idle frames), not
weakened. Its status is `not-observed-red`, not `assertion-red`, per task
2.3's own text ("a 2.3 that is green before group 3 is not evidence") and K8's
explicit instruction. The real evidence for this scenario remains the tier-4
journey's `[journey-console]` capture (unchanged by this change, already
greps for the diagnostic).

## 6. Task-only test requirements (no 1:1 spec scenario, but named by tasks.md)

| Task | Test | Level | Status |
|---|---|---|---|
| 3.1 — `projectWorldTime`, moved verbatim | `lib/client-clock/index.test.tsx :: "projectWorldTime"` (2 cases) | unit | compile-red |
| 3.2 — `useWorldClock` stability, re-anchor rules, `useCoarseWorldTime` tick + unmount cleanup | `lib/client-clock/index.test.tsx` (multiple `describe` blocks) | unit | compile-red |
| 3.3 — `data-world-time` is the coarse value (SDET-added; nothing asserted it before) | `SystemSpaceView.render-loop.test.tsx :: "data-world-time on the sr-only space-world-clock span updates once per second, not once per frame"` | integration | compile-red (same file as §1) |
| 3.6 — `now()` before `anchor()` returns 0; a frame loop building at `clock.now()` pre-reading renders without error; `hasReading()`'s named caller | `lib/client-clock/index.test.tsx` (unit half) + `SystemSpaceView.render-loop.test.tsx :: "a frame loop building at clock.now() before the first served reading renders without error"` (view half) | unit + integration | compile-red |
| 3.7 — visibility resync | `lib/client-clock/index.test.tsx :: "Scenario: A figure resyncs promptly..."` | unit | compile-red (listed again here for task traceability; same row as §1) |
| 3.8 — reduced-motion hook: initial true/false, flip on `change`, unmount cleanup | `use-reduced-motion.test.tsx` | unit | compile-red |
| 4.1 — `projectMarks`/`hitTargetTransform` position cases | `space-projection.test.ts` (extended) | unit | assertion-red — confirmed executed: `TypeError: projectMarks is not a function` / `hitTargetTransform is not a function` |
| 4.2 — loop unit contract: synchronous first frame, one build per frame, `refresh()` builds nothing, `onViewChange` only on camera/size change, a thrown frame is contained and warned once, `stop()` cancels | `space-transform-loop.test.ts` | unit | compile-red (`./space-transform-loop` does not exist) |
| 4.3/4.3a — registry `refFor` stability, `onAttach`, deletion on null, `entries()` | `space-transform-loop.test.ts` (registry unit tests) | unit | compile-red |
| 4.3a (stage level) — "capturing the registry": each mount creates exactly one registry, sized to its pickable/fleet marks | `SpaceStage.transform-loop.test.tsx :: "each SpaceStage mount creates exactly ONE registry..."` | integration | assertion-red — confirmed executed: `registries` empty (current `SpaceStage` never imports the mocked module) |
| 4.5 — the draw stamp's render-phase adjustment (no second commit per coarse tick, F1/K1) | Not a standalone test; the ≤3-render bound in 2.2 and 3.4b would fail if the extra nested commit F1 describes were still present | integration | **reasoned-not-automated as a standalone scenario** — covered as a necessary condition of 2.2/3.4b's render-count assertions (see finding below) |
| 4.8 — a point pick after a resize resolves against the post-resize basis | `SpaceStage.transform-loop.test.tsx :: "a point pick after a resize resolves against the POST-resize basis"` | integration | assertion-red — confirmed executed: resolved point differs from the post-resize-basis expectation (today's `[host]`-keyed memo never updates on resize) |
| 4.9 — focus/off-screen-chip reframe reads the loop's live mark ref, not the stale coarse one | `SpaceStage.transform-loop.test.tsx :: "the off-screen chip reframes to the LIVE mark position published by the loop, not the stale coarse one"` | integration | assertion-red — confirmed executed: reframed target matches the STALE position's clamp, not the live one |
| 4.7 — migrate the 1.1 sites | see §7 | — | see §7 |

**Finding for the orchestrator on 4.5:** the impl contract names no dedicated
test for "the draw stamp is a render-phase adjustment, not an effect" beyond
the render-count bounds it protects (F1/K1). I did not invent a fourth,
narrower test for it, because K1's own basis for accepting the render-phase
fix *is* the ≤3 bound in 2.2/3.4b — a standalone test would either duplicate
those assertions or test an implementation detail (`useEffect` vs
render-phase `setState`) rather than the observable behaviour the spec names.
If the orchestrator wants an explicit regression pin distinguishing "1 extra
commit from F1's effect" from other causes of an over-budget render count,
that is a scope question, not an automation gap — flagging it here rather
than silently deciding it.

## 7. Task 4.7 — migrating the 1.1 sites

| File | What changed | Status |
|---|---|---|
| `SpaceStage.test.tsx` (4 render sites) | `frameSource={null}` added to every literal `<SpaceStage>` | already-green — confirmed via `vitest run`, all pre-existing assertions pass unchanged |
| `SpaceStage.renderer.test.tsx` (5 render sites: `stage()` + 4 inline) | `frameSource={null}` added to every site | already-green — confirmed |
| `SpaceStage.interaction.test.tsx` (`stage()` + 2 remaining inline sites, after moving "Focus survives...") | `frameSource={null}` added; *Focus survives the view's animation frames* REMOVED here (moved, scenario name preserved, restated rAF-driven in `SpaceStage.transform-loop.test.tsx`, task 2.4) | already-green for the retained tests — confirmed |
| `SpaceStage.fleet-mark.test.tsx` (1 render site) | `frameSource={null}` added | already-green — confirmed |
| `SpaceStage.sighting-ghost-selection-guard.test.tsx` (1 render site) | `frameSource={null}` added | already-green — confirmed |
| `webgl/SpaceWorld.test.tsx` (3 construction sites) | `scene`/`camera` replaced with `frameRef={frameOf(scene, camera)}` (local helper, per contract §10.1) | **assertion-red** — confirmed executed: `projectMarks is not a function` inside `frameOf` (expected: `frameRef`/`projectMarks` are task 4.2/4.1's production work) |
| `webgl/SpaceWorld.draw.test.tsx` (8 construction sites) | same `frameOf` migration | **assertion-red** — confirmed executed, same reason |
| `fleet-service.test.ts` | 2 assertions migrated to read `result.fleets`/`result.worldTime`/`result.scale` instead of a bare array (contract §4) | assertion-red — confirmed executed: `result.fleets` is `undefined` today (the service still returns a bare `Fleet[]`) |
| `use-fleets.test.tsx` | 1 assertion migrated (envelope resolve shape); 1 test added asserting `scale`/`worldTime` come from the envelope; 1 SDET-added boundary test (empty list still exposes scale) | assertion-red — confirmed executed: `Object literal may only specify known properties, and 'fleets' does not exist in type 'Fleet[]'` at the type level, and `result.current.scale`/`worldTime` are `undefined` at runtime today |
| `GalaxyView.test.tsx` | `vi.mock('@/hooks/use-world-time', ...)` line removed (K7 — the new clock module has no rAF to stub, so it is deleted, not repointed) | already-green — confirmed, all pre-existing tests pass unchanged against the real (still-live) `useWorldTime` hook |
| `SystemSpaceView.test.tsx:821` | Comment reworded to drop the literal string `use-world-time` (K5/F5), so `grep -r use-world-time frontend` (excluding `node_modules`/`.next`) will return nothing once the two remaining PRODUCTION import lines (`GalaxyView.tsx:36`, `SystemSpaceView.tsx:49` — dev's task 3.4/3.3/3.5 work) are updated. No assertion changed | already-green — confirmed, all 52 tests in the file still pass |
| `hooks/use-world-time.test.tsx` | **Deleted** (task 3.5's SDET half) — its `projectWorldTime` cases moved verbatim into `lib/client-clock/index.test.tsx`; its `useWorldTime` hook cases are superseded by `useWorldClock`/`useCoarseWorldTime`'s own tests | n/a (file removed) |

## 8. Run commands showing each red group

```bash
cd frontend

# Compile-red group (new modules: @/lib/client-clock, @/hooks/use-reduced-motion,
# ./space-transform-loop, and the new SpaceStage/SpaceWorld/FleetList props/fields):
npx tsc --noEmit
npx vitest run lib/client-clock/index.test.tsx
npx vitest run hooks/use-reduced-motion.test.tsx
npx vitest run components/space/space-transform-loop.test.ts
npx vitest run components/space/SystemSpaceView.render-loop.test.tsx

# Assertion-red group (real behaviour missing/wrong against today's production code):
npx vitest run components/space/space-projection.test.ts
npx vitest run components/space/SpaceStage.transform-loop.test.tsx
npx vitest run components/galaxy/GalaxyView.render-loop.test.tsx
npx vitest run components/space/webgl/SpaceWorld.test.tsx components/space/webgl/SpaceWorld.draw.test.tsx
npx vitest run lib/services/fleet-service.test.ts hooks/use-fleets.test.tsx

# Already-green group (migrations that stay correct against today's tree):
npx vitest run components/space/SpaceStage.test.tsx components/space/SpaceStage.renderer.test.tsx \
  components/space/SpaceStage.interaction.test.tsx components/space/SpaceStage.fleet-mark.test.tsx \
  components/space/SpaceStage.sighting-ghost-selection-guard.test.tsx \
  components/galaxy/GalaxyView.test.tsx components/space/SystemSpaceView.test.tsx

# Whole-suite sanity (confirms no collateral damage to untouched files):
npx vitest run
```

Observed at handoff time: `npx tsc --noEmit` reports errors in exactly the 15
files this change touches (0 in any other file). `npx vitest run` (whole
suite): **11 test files / 33 tests failed, 113 files / 1598 tests passed** —
every failing file is one of the 6 new files or one of the migrated files
whose production half is still outstanding; no pre-existing, untouched suite
regressed.

## 9. Manifest

```
bash .claude/scripts/openspec-red-manifest.sh record fix-world-time-render-loop <18 paths>
```

Recorded 18 files to
`docs/plans/continous_space/handoffs/red-manifest-fix-world-time-render-loop.txt`
(content hashes). The 18: the 6 new test files, the 10 migrated test files,
and `SystemSpaceView.test.tsx` (comment-only edit) and `GalaxyView.test.tsx`
(mock-line removal) — every file this red handoff created or modified.
`hooks/use-world-time.test.tsx` is not in the manifest because it no longer
exists (deleted, not modified).

**Post-handoff re-record.** The manifest was re-recorded after the two
green-phase test revisions in §10 below (adding `lib/format/guards.test.ts` —
not part of the original red handoff, since it's a pre-existing
`add-figure-formatting` suite, not one this change wrote — to the same 18
paths). The re-record is **not** evidence of a fresh red handoff; it is the
new immutability baseline for the integrity check, reflecting the two
authorized revisions below and nothing else. `git diff`/manifest verification
against the *original* 2026-09-19 handoff state would show exactly these two
files changed, both with a logged cause.

## 10. Post-handoff test revisions (green phase)

Both authorized by the orchestrator's adjudication of a developer test
dispute in the developer's favor (`fix-world-time-render-loop-rulings.md`,
"Green-phase test disputes", D1 and D2) — the only cause besides a spec
change that lets a test change after handoff. Neither assertion was weakened;
both are fixture/anchor corrections to tests that provably misread a
precondition or went stale under a rewire this change made, not tests that
misjudged behaviour.

- **D1 — `SpaceStage.transform-loop.test.tsx`'s `burningFleetInputs()` fixture.**
  Cause: the fixture set `interior: null`, and `space-scene.ts:285`'s
  `if (!interior) return empty` means `buildSceneModel` can never emit ANY
  mark — `fleet-mark-fleet-1` included — regardless of what `fleets` names.
  The 4.3b test (*A hit target tracks its mark on every frame*) could not
  pass against ANY correct implementation with that fixture; this was a test
  defect, not a behaviour dispute. Fix: `interior: movingBodyInputs().interior`
  (a real interior, exactly as the ruling specifies), no other line touched;
  the assertions and the scenario title are unchanged.
  - **Meaningfulness check** (required by the ruling): backed up
    `components/space/space-transform-loop.ts` with `cp` to
    `/tmp/space-transform-loop.ts.bak`, neutered the loop's per-frame write
    (`el.style.transform = hitTargetTransform(...)` → a no-op) in place,
    re-ran the fixed test — it failed (`expected '' to be 'translate3d(...)'`),
    confirming the test still exercises the real write. Restored the file
    from the `cp` backup and confirmed byte-identical via `diff` before
    deleting the backup.
  - Confirmed green against the current (unmodified) implementation:
    `SpaceStage.transform-loop.test.tsx` — 6/6 pass.
- **D2 — `lib/format/guards.test.ts`'s `KNOWN_TOFIXED_EXCEPTIONS` anchors.**
  Cause: this change's frame-loop rewire shifted line numbers in
  `SpaceStage.tsx` and `webgl/SpaceWorld.tsx` (unrelated content added above
  the reviewed `.toFixed(` sites), so the anchors recorded before this change
  went stale — a routine re-anchor under the guard's own stated procedure
  (its doc comment names exactly this maintenance path), not a behaviour
  dispute. Verified by grep against the live files before touching anything:
  `SpaceStage.tsx:837,838,894,895,1055` and `SpaceWorld.tsx:201` — same three
  reviewed call sites (bearing/speed hover-facts ×2 panels + the drift-streak
  detail string; the orbit-ring memo key), same count as the previously
  reviewed set (`[753,754,810,811,975]` and `[195]`), and a full
  `grep -rn '\.toFixed\(' components/space components/fleet` (excluding
  `.test.ts`) confirmed no additional, unreviewed site exists anywhere in
  scope. Fix: re-anchored both `lines` arrays to the grepped values, appended
  `/ D2` to both `ruling` fields, reworded both comments with the cause.
  - Confirmed green: `lib/format/guards.test.ts` — 8/8 pass.

`lib/format/guards.test.ts` is added to the red-manifest's tracked set
(alongside the original 18) purely so its own immutability is now baselined
too — it was never part of this change's original red handoff (it predates
`fix-world-time-render-loop`, from `add-figure-formatting`), but D2 makes it
a file this change's integrity check must now also watch.

- **D4 — `webgl/SpaceWorld.test.tsx`'s and `webgl/SpaceWorld.draw.test.tsx`'s
  `frameOf()` helpers.** Cause: I reported this myself as a compile-only
  finding after D1/D2 (`npx tsc --noEmit` — 2 errors, neither file touched
  by D1/D2). The red-phase `frameOf()` helper's `.map((p: { mark: { id:
  string } }) => ...)` parameter annotation existed solely to silence
  `TS7006` (implicit `any`) while `projectMarks` did not exist yet; now that
  the green phase landed the real `projectMarks`/`ProjectedMark` types, that
  narrow annotation actively conflicts with them
  (`Map<string, {mark:{id:string}}>` no longer satisfies
  `ReadonlyMap<string, ProjectedMark>`). Fix (type-only, no assertion
  touched, in both files): dropped the explicit parameter type so TypeScript
  infers `ProjectedMark` from `projectMarks`'s own signature —
  `.map((p) => [p.mark.id, p])`.
  - Also cleared the pre-existing unused `MARK_FLOOR_DIV` import at
    `webgl/SpaceWorld.draw.test.tsx:294` (a bare unused named import —
    confirmed by grep that it appears nowhere else in the file, unlike its
    sibling `BODY_DRAW_SCALE`, which is used at line 364 — so removing it
    changes nothing else).
  - Confirmed: `npx tsc --noEmit` — 0 errors (repo-wide). `npx eslint
    components/space/webgl/SpaceWorld.test.tsx
    components/space/webgl/SpaceWorld.draw.test.tsx` — 0 errors, 0 warnings.
    `npx vitest run` on both files — 11/11 pass, assertions unchanged.

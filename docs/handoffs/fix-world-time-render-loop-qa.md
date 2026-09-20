# `fix-world-time-render-loop` — QA acceptance verdict

QA engineer (`openspec-qa`), 2026-09-19. Verified against implementation
commit `3dc56da` on `main`. Tree unchanged from that commit at verification
time (`git status` clean except pre-existing unrelated untracked files).

**Method.** Built the acceptance matrix from both spec deltas
(`openspec/changes/fix-world-time-render-loop/specs/{system-space-view,galaxy-view}/spec.md`)
plus the live `system-space-view` *Space View Respects Reduced-Motion
Preference* requirement (`openspec/specs/system-space-view/spec.md:1323-1337`).
For each row, located the SDET's test in
`fix-world-time-render-loop-red-coverage.md`, ran it, and read the assertion
against the quoted THEN. Then traced from the actual production call sites
(`SystemSpaceView.tsx`, `SpaceStage.tsx`, `GalaxyView.tsx`,
`space-transform-loop.ts`, `lib/client-clock/index.ts`,
`hooks/use-reduced-motion.ts`, `lib/services/fleet-service.ts`,
`hooks/use-fleets.ts`) to confirm every new module is really reached, not
just built and tested in isolation. No stack booted; no Playwright run; no
tier 3/4 triggered.

**Commands run:**
```
cd frontend && npx tsc --noEmit                     # 0 errors
cd frontend && npx vitest run <18 targeted files>    # 281/281 passed
cd frontend && npx vitest run                        # whole suite: 124 files / 1690 tests passed
cd frontend && npm run lint                          # eslint + tsc-check.sh — exit 0
```

## Acceptance matrix

### 1. `system-space-view` ADDED — *Animation Never Re-Renders the View, and Never Starves a Navigation*

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 1 | Frames pass without the view rendering | **PASS** | `SystemSpaceView.render-loop.test.tsx :: "Scenario: Frames pass without the view rendering"` — real `SystemSpaceView`+`SpaceStage` mounted (no `./SpaceStage` mock), `React.Profiler` counts renders, burning fleet with a real `Burn.Curve`. Asserts `onRender` **not called** across 10 rAF frames AND the fleet's `fleet-mark-fleet_1` `style.transform` **changed** between first and last frame (vacuity guard — proves the loop is really moving the mark, not that nothing happened). Ran green. Traced: `SystemSpaceView.tsx:821` passes `frameSource={frameSource}`, a non-null `useMemo` built from the real `useWorldClock`/`sceneInputsRef` — never `null` in production. |
| 2 | A counting figure advances without a per-frame render | **PASS** | Same file, task 2.2. 125 discrete 16ms `act()` advances (deliberately not batched, so a per-frame render defect can't hide behind automatic batching). Asserts `data-raw` decreased by exactly 2000ms (scale 1) and render count ≤3. Ran green. |
| 3 | A figure resyncs promptly when the tab regains visibility | **PASS** | `lib/client-clock/index.test.tsx :: "Scenario: A figure resyncs promptly..."` — unit test of the real `useCoarseWorldTime`/`createWorldClock`, the same module `SystemSpaceView`/`GalaxyView` import. Injects a controlled wall clock, drives `visibilitychange` without advancing fake timers (isolating the resync from the interval), asserts the coarse value jumps to `clock.now()` on visible. A sibling test confirms going *hidden* does **not** itself force a recompute. Ran green. |
| 4 | A hit target tracks its mark on every frame | **PASS** | `SpaceStage.transform-loop.test.tsx :: "Scenario: A hit target tracks its mark on every frame"` (task 4.3b) — real `SpaceStage`, real `frameSource`, burning-fleet fixture (fixed under D1: the original had `interior: null`, which `space-scene.ts` makes emit zero marks regardless of fixture — a test defect, not a behaviour dispute; I independently confirmed `space-scene.ts:285`'s `if (!interior) return empty` and that the fixed fixture reaches `movingBodyInputs().interior`). For 3 successive frames, asserts the DOM `style.transform` equals `hitTargetTransform(projectMarks(...))` computed independently from the same inputs at that frame's time. Ran green. |
| 5 | A mark crossing the viewport edge gains/loses its off-screen affordance within a second | **PASS** | `SpaceStage.transform-loop.test.tsx :: "Scenario: A mark crossing the viewport edge..."` (task 4.6). Drives it via three coarse-scene `rerender()`s (near → far → near), asserting `offscreen-feat-body-0` appears/disappears each time. Traced: `SpaceLayers` reads `viewBasis` — the loop's published basis, set via `onViewChange={setViewBasis}` from `useSpaceTransformLoop`, which runs regardless of `frameSource` (Decision 3: gated on `available` alone) — so even this `frameSource={null}` test exercises the real publish path, not a bypassed one. |
| 6 | A cross-system selection made while the view animates arrives | **BLOCKED — awaits the journey** | Coverage table: `Playwright, deferred`. `SystemSpaceView.test.tsx` mocks `next/navigation`, so no unit test can exercise a real App Router transition (design.md Decision 5, explicit). tasks.md 5.3 (the dedicated `--repeat-each 20` closing run) is unchecked — not yet run. This is the change's central claim and has no unit-level evidence by design; only the tier-4 journey closes it. |
| 7 | The animating view raises no update-depth diagnostic | **BLOCKED — awaits the journey** | `SystemSpaceView.render-loop.test.tsx :: "Scenario: The animating view raises no update-depth diagnostic"` (task 2.3) is present and passes, but the coverage table honestly records it `not-observed-red` (K8): a documented scratch probe ran 150 and 500 rAF frames against the **pre-fix** tree and never reproduced React's diagnostic under jsdom+act+fake-timers (0/650 hits), so a green result here cannot distinguish "fixed" from "the harness can't observe this failure at all." Per the SKILL's own rule ("a test that has never been observed to fail has not been shown to test anything"), I do not count this as PASS evidence. Design.md and the coverage table both name the tier-4 journey's `[journey-console]` grep as the real evidence, and that run (5.3) has not happened. |

### 2. `system-space-view` MODIFIED — *Body, Lane-Gate, and Point Selection Is Keyboard-Operable*

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 8 | Tab reaches hit targets in the defined order | **PASS** | `SpaceStage.interaction.test.tsx` — ran green (36/36 in file). Mechanism reference moved from "world-time update" to "animation frames" in the requirement text; assertion (`querySelectorAll` tab-order walk) is unchanged and still exercises real DOM elements. |
| 9 | Focus survives the view's animation frames | **PASS** | `SpaceStage.transform-loop.test.tsx :: "Scenario: Focus survives..."` (task 2.4), restated rAF-driven per the contract. Real `frameSource`, moving body fixture. Asserts the SAME element (`toBe`) stays `document.activeElement` across 10 real rAF frames, with a vacuity guard confirming the target's `style.transform` actually changed in that window (so "focus survived" isn't vacuously true because nothing moved). Ran green. |
| 10 | A focused body or gate shows a focus indicator | **PASS** | `SpaceStage.interaction.test.tsx` — unchanged assertion, ran green. |
| 11 | Enter/Space selects the focused body or gate | **PASS** | Same file — unchanged, ran green. |
| 12 | A keyboard control selects the point at the camera's pan target | **PASS** | Same file — unchanged, ran green. |
| 13 | The point-selection control is in the tab order and shows focus | **PASS** | Same file — unchanged, ran green. |

Rows 8/10–13 are unaffected by this change's mechanism (they don't touch per-frame positioning); the coverage table's `already-green` designation is accurate — I ran the file myself rather than trusting the label.

### 3. `system-space-view` live requirement — *Space View Respects Reduced-Motion Preference* (`spec.md:1323-1337`, no delta)

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 14 | Reduced motion freezes decorative animation while positions keep advancing | **PASS** | `SystemSpaceView.render-loop.test.tsx :: "Scenario: Reduced motion freezes decorative animation..."` (task 2.5). Installs a real `matchMedia` mock with a working `addEventListener`, mounts, then flips the preference **mid-session** (not at mount — required, since the requirement's condition is "WHILE"), spies `buildSceneModel` (real module, passthrough spy) and asserts: every scene built after the flip has `reducedMotion: true`; `decorativeTimeMs` is frozen at one constant value across 5 frames; the fleet mark's position still changed between first and last of those frames; and a contact's position is unaffected by the preference either way (a documented, orchestrator-accepted baseline-wording correction — F2/K2 — contacts never advance under world time regardless of the flag; not a scope gap in this change). Ran green. Traced: `SystemSpaceView.tsx:46,443` imports and calls the real `useReducedMotion()` hook, threads it into `sceneInputsRef` (read by the loop) and the coarse scene memo. `hooks/use-reduced-motion.ts` reads `matchMedia(...).matches` once via a lazy state initializer and subscribes `change` for the component's lifetime with cleanup — matches the requirement's live "WHILE" condition, not a mount-only snapshot. |

### 4. `galaxy-view` ADDED — *Animation Never Re-Renders the Galaxy View, and Never Starves a Navigation*

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 15 | Frames pass without the galaxy view rendering | **PASS** | `GalaxyView.render-loop.test.tsx :: "Scenario: Frames pass without the galaxy view rendering"` (task 3.4a) — real `GalaxyView` (canvas/graph mocked, which is a legitimate seam: this requirement is about React re-rendering, not GL), `React.Profiler`, burning own fleet. 10 rAF frames after settling → `onRender` never called. Ran green. |
| 16 | A roster countdown advances without a per-frame render | **PASS** | Same file, task 3.4b. 125 discrete 16ms advances (same anti-batching-artifact discipline as row 2) → `data-raw` decreased by exactly 2000ms, render count ≤3. Ran green. |
| 17 | A drill-in issued while the view animates arrives | **BLOCKED — awaits the journey, or an explicit accepted-gap ruling that hasn't been recorded yet** | Coverage table: `Playwright, deferred` for the real claim; the unit test in the same file (task 3.4a) is explicitly labeled by its own SDET comment as a **call-site regression guard only** — "a mocked router never enters React's scheduler and cannot be starved" (design.md Decision 5, quoted verbatim in the test file). It proves `router.push('/systems/sys-0')` is called with the right route, nothing about whether a real transition starves. **tasks.md 5.3a is unchecked**: it requires either including a galaxy-view drill-in/burn-redirect in a tier-4 run, *or* recording in design.md's Open Questions why that evidence is accepted as absent. Neither has happened yet, so this scenario's evidential path is currently undecided, not just unrun. |
| 18 | A roster burn redirect from the galaxy view commits while the graph animates | **BLOCKED — same as row 17** | Same file/task, same call-site-guard-only test, same open 5.3a. |
| 19 | The projected clock runs at the served scale | **PASS** | `GalaxyView.render-loop.test.tsx :: "Scenario: The projected clock runs at the served scale"` (task 3.4c). Scale 60, 3s of fake-timer advance with no read landing → `data-raw` decreased by exactly `3000 × 60`. Ran green. Traced: `GalaxyView.tsx:190-204` — `servedScale = envelopeScale ?? myFleets?.[0]?.scale`, fed to the real `useWorldClock`, and the same `servedScale` is passed to `<FleetRoster scale={servedScale}>` (line ~497) — one value for both projection and formatting, which is exactly what the scenario asserts. `hooks/use-fleets.ts` and `lib/services/fleet-service.ts` really carry the envelope's `scale`/`worldTime` through (confirmed by reading both files, not inferred from the contract). |
| 20 | The projected clock holds when no scale has been served | **PASS** | `GalaxyView.render-loop.test.tsx :: "Scenario: The projected clock holds..."` (task 3.4d). `useMyFleets` mock with no `scale` anywhere → 3s of fake-timer advance → `data-raw` delta is exactly `0`. Ran green. Traced: `GalaxyView.tsx:207-209` — `worldTime = clock.hasReading() ? coarseWorldTime : (servedWorldTime ?? 0)`, and `useWorldClock` never anchors (`clock.hasReading()` stays false) unless both a world time AND a scale are finite — confirmed by reading `lib/client-clock/index.ts`'s `anchor()`/`useWorldClock` implementation directly. |

## Matrix summary

**20 scenarios total: 15 PASS · 0 FAIL · 4 BLOCKED · 0 INSPECTED** (I use PASS only where a real assertion against real production wiring backs it; the MODIFIED-requirement rows I re-ran myself rather than trusting the coverage table's `already-green` label, so I count them PASS with evidence, not INSPECTED.)

BLOCKED rows: #6, #7, #17, #18 — all four require the tier-4 journey (tasks.md 5.3/5.3a), which has not run. None are failures; all four are exactly where design.md itself says the unit suite cannot reach (Decision 5's explicit admission for navigation claims, and K8's honest non-observation for the console diagnostic).

## tasks.md cross-check

- 1.1–4.9: all checked `[x]`. I did not find a false completion claim among them — every checked task's corresponding scenario(s) either PASS with real evidence or are explicitly, honestly marked as insufficient evidence *inside the coverage table itself* (task 2.3's `not-observed-red`), which is not a false claim, it's the task doing exactly what its own text required ("record the test failing... a 2.3 that is green before group 3 is not evidence").
- 5.1, 5.2: checked `[x]`. Independently reproduced: `npx tsc --noEmit` (0 errors), `npm run lint` (exit 0), `npx vitest run` (124/124 files, 1690/1690 tests). Claim accurate.
- 5.3, 5.3a, 5.4, 5.5, 5.6: unchecked `[ ]`, correctly — these are exactly the tier-4/archive-order tasks this change has not yet performed. No false claim.

## Impact-scope check

Diffed the commit's file list (`git show --stat 3dc56da`) against proposal.md's Impact section. Every production file matches a named bullet (Deleted: `hooks/use-world-time.ts`+test; New: `lib/client-clock/`, `space-transform-loop.ts`, `hooks/use-reduced-motion.ts`+tests; Rewired: `SystemSpaceView.tsx`, `SpaceStage.tsx`, `webgl/SpaceWorld.tsx`, `GalaxyView.tsx`, `fleet-service.ts`). `lib/types/fleet.ts` and `hooks/use-fleets.ts` are natural, described consequences of task 3.4's envelope-scale plumbing (Impact's fleet-service bullet names the cause; these are its two typed consumers) — not scope creep. One file outside any Impact bullet: `frontend/lib/format/guards.test.ts`, a test-only anchor re-derivation (D2 in the rulings file) caused by line numbers shifting in `SpaceStage.tsx`/`SpaceWorld.tsx` — no assertion changed, orchestrator-ruled as routine maintenance under the guard's own stated procedure, and I independently confirmed via `grep -n '\.toFixed('` that the re-anchored line numbers (837/838/894/895/1055 and 201) are the correct current locations of the same three previously-reviewed call sites. Not a spec or behavior concern.

## Exploratory pass

Time-boxed, off-script:

- **Seam: reduced-motion flip during a scan sweep / mid-burn.** Read `ScanSweepWatcher`'s prop-boundary change (`clock: WorldClock` replacing `worldTimeRef`) and confirmed `clock` is stable across renders (task 3.3a), so the `eslint-disable` on its effect's dependency array is narrowed correctly to the two genuinely-unstable deps (`runningScan`, `settledScan`) — no risk of the effect re-firing needlessly or going stale.
- **Reordering: `useCoarseWorldTime` before `useWorldClock`.** The contract states this ordering is load-bearing (layout effects in one component run in declaration order) but is not itself enforced by a type or runtime guard — a future edit could reorder the two calls in `SystemSpaceView`/`GalaxyView` silently. Confirmed both current call sites have the correct order (`SystemSpaceView.tsx:435,440`; `GalaxyView.tsx:203-204`). **Finding (minor, non-blocking):** this ordering constraint has no automated tripwire; a future refactor could reintroduce a one-tick lag on re-anchor with no test failing to say so. Not filed as a defect since no scenario currently violates it — noting it as a maintainability gap for the spec writer/architect to consider, not a FAIL.
- **Double-mount / StrictMode:** did not find a dedicated test mounting/unmounting `SpaceStage` twice in the same test to check the transform loop's rAF handle and hit-target registry don't leak across remounts. The `useSpaceTransformLoop` effect's cleanup (`handle.stop(); handleRef.current = null`) looks correct by inspection, and `space-transform-loop.test.ts`'s unit suite (21 tests, ran green) includes a `stop()` cancellation test, but nothing exercises an actual React remount cycle. Not filed as a FAIL — no scenario requires it and the code appears correct on inspection — but flagging as an untested edge for the record.
- **Invalid/degenerate state: unavailable canvas.** Traced Decision 7's claim that a GL-refusing driver still gets positioned hit targets: `useSpaceTransformLoop`'s effect is gated on `enabled` (`SpaceStage`'s `available`), never on the renderer constructing — confirmed by reading the effect's condition (`if (!enabled || !host) return`) directly, independent of any test. This matches the requirement and I did not find a counter-example.
- **Spec gap candidate (not new — already flagged by the SDET/architect, but worth restating for the record):** F2/K2's baseline-text inaccuracy (the live reduced-motion requirement's "contact... positions continue to advance with world time" — contacts are actually frozen at their served position under both settings) is a genuine drift in `openspec/specs/system-space-view/spec.md:1323-1337`'s prose, correctly deferred out of this change's scope per K2's ruling, but it remains open baseline drift. Filing it again here so it isn't lost a second time (the handoffs README's own "Lesson three" is about exactly this kind of finding getting dropped between documents).

No FAIL findings from either the matrix or the exploratory pass.

## Verdict

**BLOCKED** — not RETURN TO DEV (zero FAILs; every unit/integration scenario reachable by tier-0/1 evidence genuinely passes against real production wiring, independently re-run and traced, not just trusted from the coverage table) and not SHIP (four scenarios — the two navigation-arrival claims for each view, plus the update-depth diagnostic — have no adequate evidence yet and by design can only get it from the tier-4 journey at `tasks.md` 5.3/5.3a, which has not run). Recommend proceeding to that closing run next; on a green 20/20 with zero `Maximum update depth` lines, re-verify rows #6, #7, #17, #18 against the journey's own record and the verdict becomes SHIP without re-running anything else in this matrix.

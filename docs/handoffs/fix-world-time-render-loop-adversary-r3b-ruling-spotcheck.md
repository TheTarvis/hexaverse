# Adversary spot-check (post-rulings) — `fix-world-time-render-loop`

Persisted verbatim by the orchestrator, 2026-09-19. Reviewer:
`openspec-adversary` (opus), read-only.

**This is NOT a fourth attack round.** The three-round cap was reached and the
change closed IMPLEMENTATION-READY at round 3. Travis then answered the four
open questions; this is a **spot-check confined to that diff**, as the
convergence rule requires.

**Verdict: FINDINGS — 0 BLOCKER, 3 MAJOR, 3 MINOR. Explicitly no BLOCKER, so
the run is not stopped.**

## Orchestrator rulings

**All six ACCEPTED and repaired before the verdict commit.** The adversary
states all three MAJORs are single-sentence fixes in `design.md` /
`proposal.md` / `tasks.md`, needing no delta edit. I am not willing to pin a
verdict commit over three known MAJORs — the commit's purpose is to pin a
*hardened* state, and a pinned verdict that a later reader diffs against
should not have known defects inside it.

**This is not repair-looping past the cap.** The cap governs adversary
*attack* rounds; no further attack was opened. Applying an adversary's own
prescribed fix is the repair the finding asked for — the same reasoning
recorded at round 3 for its four MINORs.

Two findings deserve specific note:

- **MAJOR-2 and MAJOR-3 are forced by USER RULING 3, not new design choices.**
  Once option B is decided, *something* must say which loop builds the
  `SceneModel` (the answer that preserves the design's own "this moves the
  call, not the cost" claim is: the transform loop builds once and publishes,
  the GL loop consumes), and *somewhere* must host the extracted loop (the
  answer that preserves B's chosen-for-testability rationale is: mounted from
  `SpaceStage`, not inside the `dynamic(..., {ssr:false})` GL module). The
  writer is settling consequences of the user's ruling, not making a decision
  the user reserved.

- **MINOR-2 is the adversary correcting its own round-2 premise, and it
  matters.** Round 2's `R-2` (a BLOCKER at the time) rested on "`draw()` never
  executes under any current vitest test". That is **false as stated**:
  `frontend/components/space/webgl/SpaceWorld.draw.test.tsx` reaches `draw()`
  under jsdom with a per-file `getContext` spy and a `three` double, without
  touching the shared setup. Travis's ruling for B is unaffected — B was his
  call and stands on its own merits — but the *recorded reason* for rejecting
  A must be accurate, and two test files (`SpaceWorld.draw.test.tsx`,
  `SpaceWorld.test.tsx`) are missing from task 1.1's sizing list and task
  4.7's migration. This is exactly the repo's Lesson Five shape: a claim
  inherited across delegations and never re-derived. Correct it now, while the
  cost is one clause.

**Verdict currency:** this spot-check verdict was issued **before** the six
repairs. The re-attack scope is those six amendments; each is the adversary's
own prescribed text, and none touches a spec delta, so no re-validation risk
beyond the mechanical gates (which were re-run).

## VERDICT COMMIT — `3566af9a35db11c06254398447f3a3ba645904f3`

`spec(system-space-view): harden fix-world-time-render-loop through panel and
three adversary rounds`, on `main`, 2026-09-19. Not pushed.

**This is the pinning commit for every adversary verdict on this change** —
rounds 1, 2 and 3 and this spot-check. All four were issued against untracked
content and could not be currency-checked until now. From this commit forward
the standard test applies:

```bash
git diff 3566af9 -- openspec/specs/system-space-view openspec/specs/galaxy-view openspec/changes/fix-world-time-render-loop
```

Empty ⇒ the verdicts are current. Non-empty ⇒ **that diff** is the re-attack
scope, not the whole change. The likeliest trigger is `add-vitals-strip`
archiving, which rewrites `openspec/specs/system-space-view/spec.md` — the
live spec this change's MODIFIED block targets.

Contents: the change folder (6 files) plus this change's 13 handoff records,
including the two filed defect/drift records and Travis's own 2026-09-19
diagnosis of the chevron stall. 20 files, +4484/−13. Deliberately excluded and
left dirty in the tree: `.claude/skills/code-quality-checks/skill.md`,
`.agents/`, `.claude/skills/team/`, `AGENTS.md`.

The six repairs above landed **before** this commit, so the committed state is
the repaired one — the verdict and the tree agree.

---

## Scoped spot-check — `fix-world-time-render-loop`, the four-ruling diff

Read-only. No tests run, no files touched. I confined myself to what the rulings changed (`proposal.md`, `design.md`, `tasks.md`); I re-read both spec deltas only to confirm they are not made false by the collapse. `openspec/changes/fix-world-time-render-loop/tasks.md` counts **37** `- [ ]` tasks, matching the stated figure.

---

## 1. Per-ruling verification

### USER RULING 1 — OQ1, reduced-motion folded in (tasks-only)

**Carried through; the tasks-only determination is correct; one MAJOR on the red test.**

- Landed at `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/proposal.md:37-46`, `:95-98`, `:125-132`; `design.md:49-55` (new Goal), `:174` and `:180-182` (Decision 3's input list now names `reducedMotion`, satisfying ruling R3), `:479-490` (OQ record); `tasks.md:12` (2.5), `:28` (3.8), `:33` (4.2 threading), `:51` (5.5 drift closure).
- **No residual out-of-scope language.** C4's "reduced motion is OUT" survives nowhere in the three files; the Non-Goals list (`design.md:57-62`) carries no reduced-motion bullet, as the Open Questions entry claims.
- **Tasks-only is right — verified against the spec, not assumed.** `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md:1323` carries the requirement in full and `:1330` its scenario; neither delta file in this change touches that requirement (the MODIFIED block is the keyboard requirement only), so there is no archiver hazard and no ADDED/MODIFIED churn. A delta would have restated correct text. Confirmed.
- **Fails-today claim is accurate.** `frontend/components/space/SystemSpaceView.tsx:438` is literally `reducedMotion: false,` and no frontend module reads `prefers-reduced-motion` (only `frontend/hooks/use-is-mobile.ts` uses `matchMedia` at all).
- **"WHILE" is satisfied by 3.8 as written.** `tasks.md:28` requires a `change` subscription "for the component's lifetime (unmount cleanup)… so the returned value tracks the live preference rather than only its value at mount", plus a flip-without-remount unit test. That is a live condition, not a mount-only read. `useIsMobile` is the in-repo precedent for the same shape.
- **Nothing about the decorative-freeze path is contradicted by the frame-loop relocation.** `reducedMotion` enters only `buildSceneModel`, which zeroes `decorativeTimeMs` (`frontend/components/space/space-scene.ts:282`, `:512`); whichever loop calls the builder, the freeze rides the same input. No conflict with this change's ADDED requirement either.
- **But see MAJOR-1**: task 2.5's assertion target does not exist in the code.

### USER RULING 2 — OQ2, one `--repeat-each 20` run

**Carried through, with one stale sentence (MINOR-1).** Recorded as declined at `design.md:413-415` and `:491-495`. `tasks.md:48` still ends "A second independent 20-repeat run (OQ2) is Travis's call, not required here" — it was Travis's call and he made it.

### USER RULING 3 — OQ3, option B decided

**The textual collapse is complete.** Grepping `tasks.md`, `design.md`, `proposal.md` and both deltas for `OQ3 (A)` / `under OQ3` / `either branch` / `Conditional on OQ3` / `left open` / `coherent under` returns **nothing**. Specifically:

- Per-task branch notes are gone and replaced by plain statements: `tasks.md:8` (2.1), `:33` (4.2), `:34` (4.3), `:35` (4.3a), `:36` (4.3b), `:39` (4.6), `:41` (4.8), `:42` (4.9).
- Decision 7 is unconditional — `design.md:328` opens "One basis, computed once per frame, published by ref" with no OQ3 opener; `:329-341` names the transform loop as the single basis authority.
- **The fail-soft guarantee survived as a plain property of B**, in all three places it needed to: `design.md:334-341` ("even on the fail-soft path… a GL-refusing driver therefore still gets positioned hit targets and off-screen chips — a plain property of the transform loop's design, not a conditional fallback"), `proposal.md:32-34`, and `tasks.md:39` (4.6's closing sentence). Round 2's N3 obligation is discharged without conditional language.
- The deltas were correctly left alone and are not made false: round 2's `n1` sentence naming OQ3 as open is already absent — `specs/system-space-view/spec.md:6` reads "from an animation-frame loop alone", which binds under B.

**Three findings attach to the architectural consequences of B that the collapse did not finish carrying** (MAJOR-2, MAJOR-3, MINOR-2 below).

### USER RULING 4 — OQ4, GalaxyView served-scale fix stays in

**Clean. The escape hatch cannot be executed.** `design.md:496-515`: the Open Questions entry is marked "**Resolved: fix it now (option A)**", and the reversal instruction is demoted to a blockquote preceded by "**The paragraph below… is MOOT / SUPERSEDED and MUST NOT be executed by a later reader.**" Nothing in `tasks.md` or `proposal.md` references the reversal (grep for "fourth paragraph" / "reversal" / "literal `1`" hits only that blockquote). The artifacts it would have deleted are all still present and consistent: the delta's fourth paragraph and both scenarios (`specs/galaxy-view/spec.md:37-45`, `:72-81`), tasks 3.4/3.4c/3.4d (`tasks.md:20`, `:23`, `:24`), and `hasReading()`'s named caller (`design.md:100-112`, `tasks.md:26`). No finding.

---

## 2. Findings introduced or exposed by this diff

### MAJOR-1 — Task 2.5 names an assertion target that does not exist in the code, and the view's own test file cannot see the one that does *(OQ1, new surface)*

`tasks.md:12`: "assert the **decorative animation time input (starfield/nebula/film-grain/body-surface/fleet-plume)** freezes while body, fleet, and contact positions keep advancing".

Three facts make that unwritable as stated:
1. Those five named surfaces have **no time input in the renderer**. The scene model's single decorative time input, `decorativeTimeMs`, is consumed in exactly two places — the selection reticle pulse (`frontend/components/space/webgl/SpaceWorld.tsx:448`) and the acting-ring pulse (`:459`). `starfield`/`nebula` appear only as static geometry/colour (`SpaceWorld.tsx:18`, `:97`); there is no film-grain or plume animation to freeze.
2. `decorativeTimeMs` has **no DOM projection at all** — no `data-*` attribute anywhere exposes it. Today its only test surface is the pure builder (`frontend/components/space/space-scene.test.ts:467`, `:479`).
3. The test is scoped to `SystemSpaceView`, whose suite **mocks the stage wholesale**: `frontend/components/space/SystemSpaceView.test.tsx:224` replaces `./SpaceStage` with a stub that exposes only `props.scene`'s fleet mark ids — and after task 4.2 the per-frame scene is not built in React at all, so even that surface stops carrying the frame value.

Concrete failure this permits: two engineers write two different tests, and one writes "assert `useReducedMotion()` returns true" — which also fails today, also turns green under 3.8, and proves nothing about the freeze. **Smallest fix:** state the observation point in 2.5 — spy the `buildSceneModel` call (or the scene-inputs ref) and assert the built scene's `decorativeTimeMs` is frozen while `worldTimeMs`-driven mark positions advance — and drop the five-surface list in favour of "the scene's `decorativeTimeMs`", since that is what the code's decorative animation actually reads.

Supporting note (not a separate finding): `frontend/vitest.setup.ts:78-90` installs a global `matchMedia` stub whose `addEventListener` is a no-op `vi.fn()` and which returns a **fresh object per call** — so 2.5's "flip the mock's `matches` value and dispatch its `change` event" cannot be done against the shared stub; the test must install its own listener-invoking mock. Worth one clause in 2.5 so the implementer does not burn an hour on a `change` event that never fires.

### MAJOR-2 — B makes two rAF loops, and nothing says which one builds the scene the GL loop draws *(OQ3 collapse, unfinished consequence)*

`design.md:176-178`: the transform loop "calls `buildSceneModel({...inputs, worldTimeMs: clock.now()})` at the top of each frame and syncs the DOM hit targets from that; **the GL draw loop stays a second, GL-only consumer of the same inputs**." Decision 7 explicitly specifies publish/consume for the *basis* (`design.md:329`, "The transform loop publishes the basis; the GL loop consumes it") but **no artifact says the same for the `SceneModel`** — `tasks.md:33` (4.2) hands inputs plus the clock all the way down to `SpaceWorld` and stops there. Nothing in tasks or design mentions refilling `sceneRef` (`frontend/components/space/webgl/SpaceWorld.tsx:207-210`), which is where the GL loop reads its scene today.

Left as is, the plain reading is that each loop builds its own scene per frame, which makes three statements in the same document false or unbudgeted:
- `design.md:178-179` "`buildSceneModel` is already pure and already runs 60×/s — **this moves the call, not the cost**." Under B it moves the call *and adds a second one*.
- `design.md:420` "**[Two scene builds]** one coarse in React, one per frame in the loop" — under B it is one coarse plus two per frame.
- The same bullet's console-noise estimate (`design.md:426-429`, "~60 warnings a second in the journey's `[journey-console]` capture") doubles — on the exact surface task 5.3 greps for this change's closing evidence.

And a behavioural edge the ADDED requirement speaks to: two independent rAF callbacks each calling `clock.now()` evaluate the frame at two different instants, and the GL loop consuming a ref-published basis can be one frame behind the transform loop during camera motion — against "A hit target SHALL be positioned at its mark's drawn position on every frame that mark is drawn, so a moving mark and the target over it never separate" (`specs/system-space-view/spec.md:40-42` in the delta). **Smallest fix:** one sentence in Decision 3 — the transform loop builds the frame's `SceneModel` **once**, at one `clock.now()`, and publishes it to the ref the GL draw loop draws from (the GL loop builds no scene) — plus correct the "Two scene builds" bullet's count and its warning-volume figure.

### MAJOR-3 — proposal and design disagree about where the extracted loop lives, and the placement decides B's whole rationale *(OQ3 collapse)*

`design.md:243-248` describes B as extraction — "becomes a function with its own rAF loop… **Testable under jsdom with no GL fake at all**… the more reversible change (**one module**…)". `proposal.md:99-105` places the new loop **inside the GL module**: "`components/space/webgl/SpaceWorld.tsx` (the draw loop stays GL-only; a new, separate transform loop — not `draw()` — evaluates the scene and writes hit-target transforms)". Impact's **New:** list (`proposal.md:90-93`) names only `frontend/lib/client-clock/` — no module for the loop.

Why placement is load-bearing rather than cosmetic: `webgl/SpaceWorld` is reached only through `dynamic(() => import('./webgl/SpaceWorld'), { ssr: false })` (`frontend/components/space/SpaceStage.tsx:71-73`) inside `{available && children}` (`frontend/components/space/SpaceCanvas.tsx:136`). Tasks 2.1, 4.3b and 4.6 (`tasks.md:8`, `:36`, `:39`) all stake their unit-level evidence on the loop being observable "directly under jsdom" from `SpaceStage`/`SystemSpaceView` tests — none of which mocks, imports or awaits that dynamic boundary today. Hosting the loop at the `SpaceStage` level (where the registry, camera and inputs already are) makes those three tasks true by construction; hosting it in `webgl/SpaceWorld.tsx` puts B's chosen-for-testability property behind a lazy-mount gate. **Smallest fix:** name the loop's home module once — in Impact's **New:** list and in Decision 3 — and say it is mounted from `SpaceStage`, not from the dynamically imported GL module; adjust the `SpaceWorld.tsx` Rewired bullet to "loses the per-frame `scene` prop" rather than "gains the transform loop".

### MINOR-1 — `tasks.md:48` still frames OQ2 as an open call

"A second independent 20-repeat run (OQ2) is Travis's call, not required here" — `design.md:413-415` and `:491-495` both record it as **declined by USER RULING 2**. Fix: "declined (USER RULING 2, OQ2)", so a later reader does not re-open a cost question the user closed.

### MINOR-2 — "`draw()` never executes under any current vitest test" is false as stated, and it is now the recorded reason for rejecting option A

`design.md:230-239` and `proposal.md:25-29` rest A's rejection on the claim that A "needs the shared `vitest.setup.ts` WebGL fake extended before any of it runs under a test". `frontend/components/space/webgl/SpaceWorld.draw.test.tsx` already executes `draw()` under jsdom **without touching the shared setup**: `:287-288` spies `canvas.getContext` to return `{ createProgram: () => ({}) , …}` per-file, `three` is replaced by a recording double, and `:310-316` stubs rAF so "the draw loop runs EXACTLY once per mount", asserting one mesh per scene mark at its served position. The same false claim is repeated in `tasks.md:35` (4.3a, "`draw()`… does not execute under jsdom") and `design.md:399-408` (the jsdom risk bullet).

The **decision is not affected** — B is Travis's ruling and stands on its own merits. What is affected is the accuracy of the record a later reader will rely on, and, more practically, the sizing: that 300-line SDET audit suite constructs `SpaceWorld` with a `scene` prop, which task 4.2 changes — and neither `webgl/SpaceWorld.draw.test.tsx` nor `webgl/SpaceWorld.test.tsx` appears in task 1.1's file list (`tasks.md:3`) or task 4.7's migration. **Smallest fix:** qualify the claim to "`draw()` never executes under any `SpaceStage` or `SystemSpaceView` test, and never under the shared setup's default fake (`SpaceWorld.draw.test.tsx` reaches it with a per-file `getContext` spy and a `three` double)", and add those two files to 1.1's count list.

### MINOR-3 — Impact's **New:** list omits the `useReducedMotion` module *(OQ1)*

`proposal.md:90-93` lists only `frontend/lib/client-clock/` as new; task 3.8 adds a new hook file (`frontend/hooks/use-reduced-motion.ts` by repo convention) plus its tests. Round 3's MINOR-2 was this same class for `fleet-service.ts` and was fixed; the OQ1 fold-in re-opened it. Fix: one clause under **New:**.

---

## 3. Verdict

**FINDINGS — 0 BLOCKER, 3 MAJOR, 3 MINOR.**

Explicitly: **there is no BLOCKER here.** Nothing I found prevents implementation or permits shipping wrong behaviour that the deltas do not already forbid — the run is not stopped by this report. All four rulings were carried through in substance; the OQ3 textual collapse is complete and the OQ4 escape hatch is properly dead. The three MAJORs are all repairable with single sentences in `design.md`/`proposal.md`/`tasks.md` (no delta edits, no re-validation risk): name the scene's single per-frame builder and publisher, name the transform loop's home module, and give task 2.5 a real assertion target.

# Rulings and open questions — `fix-world-time-render-loop`

Orchestrator, 2026-09-19. Phase 1 only; Phase 2 not authorized.

**`--full-auto` is NOT in force on this run.** Nothing below is a
`FULL-AUTO RULING`. Questions the repo cannot answer go to Travis as open
questions, not as invented answers. The four OQs below are real questions with
recorded leans, not decisions I made and dressed up.

## Rulings made (binding on the writer)

Conflict resolutions C1–C6 and RULING 1–4 are in
`fix-world-time-render-loop-panel-consolidated.md`. In brief, so this file
stands alone:

| # | Ruling | Basis |
| --- | --- | --- |
| C1 | Drop task 4.4 (`pickAt` mark list) | The path is dead in production — verified by the orchestrator: `SpaceLayers` never destructures `onPointerUpCapture` (`SpaceStage.tsx:502-526` ends at `onReframe,`), both live callers pass `[]` (`:426`, `:429`). Activating it creates a second picking authority with a different hit geometry and no delta behind it. |
| C2 | `add-vitals-strip` archives FIRST | This change's ADDED requirement names the strip's fleet switcher — a `system-console` requirement existing only inside 2a's deltas (`openspec/specs/system-console/` does not exist; verified). The other order leaves a dangling cross-reference `--strict` does not catch. MODIFIED header sets are disjoint, so neither order corrupts the other. |
| C3 | The coarse-cadence bound lives in the ADDED requirement only | One cadence rule stated once beats three MODIFIED blocks to keep verbatim through 2a's archive. Content from all three reviewers folded in. |
| C4 | Reduced-motion fix is OUT of scope | 2–1 among reviewers, plus scope discipline: no authorization to widen, and adding a `matchMedia` subscription to the view whose subscription behaviour is under repair is the wrong moment. Drift filed instead. |
| C5 | Closing tier-4 run raised from `--repeat-each 6` to `20` | `R-8`'s statistics are uncontested: 0/6 leaves a ~39% upper bound on the true failure rate — it cannot distinguish "fixed" from "still broken". |
| C6 | This change's closing evidence and 2a's archive gate are separate invocations | Reconciles `A-F10` (2a's gate is the tier-4 suite) with `R-10` (one execution must not grant two closures). Split by scope: journey spec ×20 closes this defect; the full suite is 2a's gate. |
| R1 | The hit target's own on-screen test moves to the loop with the position | Orchestrator finding: `screen.onScreen` (`SpaceStage.tsx:586-590`) decides `left/top` vs parking at `-9999px`. Coarse, that leaves a re-entering mark unclickable for ≤1 s — reaching *Space View Picking*, not just the chips. |
| R2 | `A-F1` and `R-2` are one BLOCKER | Both reach the same fact from opposite directions: `draw()` never executes under any current vitest test. |
| R3 | `reducedMotion` stays threaded through the new call site | Out of scope to *fix* ≠ licence to make worse. Decision 3's input list omits it, and the omitted call site is the only one that has it. |
| R4 | `A-F16`'s two factual corrections land | `data-world-time` is on an sr-only span, not the view root; task 3.3's line-182 read is a prop on `ScanSweepWatcher`, a component boundary change. |

## Open questions — ALL FOUR ANSWERED BY TRAVIS, 2026-09-19

**Superseded by the USER RULINGS section at the end of this file.** The four
questions below are kept as the record of what was asked and what the panel
leaned, because two of the answers went against the lean. Read the USER
RULINGS for what is binding.

Each carries the panel's lean. The writer was instructed to record all four in
design.md's Open Questions and to author the change as if each were answered
the way the lean says, *except* OQ3, which blocked a design decision and was
marked as such.

### OQ1 — The reduced-motion drift: fold in, or its own change?

`Space View Respects Reduced-Motion Preference` (`system-space-view/spec.md:1323`)
is live and unmet: `SystemSpaceView.tsx:438` hardcodes `reducedMotion: false`
and nothing in the frontend reads `prefers-reduced-motion`. Full record:
`drift-reduced-motion-never-detected.md`.

- **Option A — fold into this change.** UX's recommendation: the call site is
  being touched anyway; cost is one media-query hook and one prop threaded
  where `false` is threaded today. No new requirement needed — the
  requirement exists and is unmet.
- **Option B — its own follow-up change.** Architect's and reliability's
  recommendation, and the orchestrator's ruling for this run. Keeps the fix
  narrow.

**Lean: B**, already ruled (C4) because this run has no scope authorization.
**Reversal cost is low** — if Travis wants A, it is one hook, one prop and one
task added before implementation starts; nothing downstream depends on the
choice. The reason to surface it anyway: this repo's own record says five
such dark derivations sat unreached for months, and B is how a sixth happens.

### OQ2 — A second independent `--repeat-each 20` run before closing the defect?

`R-8` proposes two separate 20-repeat invocations, not one, because a single
20/20 still leaves a ~14% upper bound and one run cannot rule out a
machine-state confound.

- **Option A — one run of 20.** Ruled in (C5).
- **Option B — two runs of 20, separate invocations.** Reliability's full
  recommendation.

**Lean: A, with B available.** The 6→20 jump is where almost all the
confidence is bought; the second run roughly doubles a tier-4 cost I cannot
measure from Phase 1, and `docs/testing-tiers.md` — not the orchestrator —
governs suite budgets. **This is a cost question, which is why it is Travis's
and not mine.** If the journey's per-repeat wall time is small enough that 40
repeats fit the budget, B is strictly better evidence and should be taken.

### OQ3 — How to make the frame-loop position system testable at all — BLOCKS A DESIGN DECISION

`R-2` establishes, from the harness rather than by inference, that `draw()`
**never executes under any current vitest test**: `vitest.setup.ts:134-138`'s
`fakeWebglContext()` implements only `getExtension`, while
`SpaceWorld.tsx:220-221` requires `createProgram` before constructing a
renderer. So the entire relocated per-frame system — `buildSceneModel` in the
loop, the element registry, `projectMarks` against live inputs, the transform
writes — would ship with no automated coverage beyond a decontextualized pure
-function test and the journey's navigation assertions, which say nothing
about hit-target correctness or leak-freedom.

- **Option A — extend the fake WebGL context** so THREE can construct a
  renderer under jsdom (`createProgram`, `createShader`, `createBuffer`,
  `getParameter`, …). Bounded, and done by several open-source THREE/jsdom
  setups. Risk: a growing fake that drifts from real GL, and every existing
  `SpaceStage` test currently exercising the fail-soft branch may change
  behaviour — that branch is what most of those tests assert today.
- **Option B — extract the transform writer from GL construction.** Registry
  lookup + `projectMarks` + `el.style.transform` becomes a function with its
  own rAF loop, gated on `available` the same way `draw()` is, but **not**
  gated on the renderer constructing. Testable under jsdom with no GL fake at
  all.

**Lean: B**, for three reasons — it is the more reversible (one module, no
change to the shared test setup, no existing test's branch changes), it is
what the repo's Lesson two argues for (real wiring under test rather than a
faker), and it leaves the GL loop doing only GL. But B also **changes this
change's architecture**: two loops instead of one, and design.md Decision 3's
"the same `draw()` projects each frame-scene mark" stops being true.

**This one genuinely blocks.** The writer cannot author Decision 3 without an
answer, and a wrong guess here is expensive to unwind mid-implementation. The
writer is instructed to author Decision 3 with the choice marked OPEN and
both options stated, rather than pick one silently.

### OQ4 — `GalaxyView`'s clock has never been given a served scale

`R-12`, pre-existing and adjacent: `GalaxyView.tsx:182` calls
`useWorldTime(myFleets?.[0]?.worldTime ?? galaxy?.worldTime)` with **no
`scale`**, defaulting to 1 — while `:474` formats at the served scale. In a
world running at a scale other than 1, every countdown in the galaxy-view
roster is wrong today. The architect independently noted the same mismatch in
`A-F3`.

This is a second confirmed defect, filed as
`defect-galaxy-view-clock-ignores-served-scale.md`. It is **not** caused by
this change.

- **Option A — fix it inside this change.** Task 3.4 already rewires
  `GalaxyView`'s clock, and `galaxy-view` is gaining a delta anyway (C2/`A-F3`),
  so the marginal cost is passing the served scale through the new
  `useWorldClock(serverWorldTime, scale)` call the change already introduces —
  close to zero, because the new hook signature takes a scale where the old
  call site passed none.
- **Option B — leave it; separate corrective change.**

**Lean: A, weakly** — the new API takes the scale as a parameter, so the fix
is passing an argument the change is already writing the call for, and the
live requirement it satisfies (`system-space-view`'s *The current world time
SHALL be extrapolated … at the served world-clock scale, never at an assumed
scale of 1*, `spec.md:272-273`) has a `galaxy-view` analogue being ADDED by
this change's own new delta. Against it: it is still scope creep on a fix
change, and the defect is invisible today because every world runs at scale 1
(`use-world-time.ts:18-19` says so outright). **Lean is not a ruling** — the
writer authors without it, and this stays an open question.

## USER RULINGS — Travis, 2026-09-19

All four open questions answered by the user directly. These are **USER
RULINGS, not `FULL-AUTO RULING`s** — `--full-auto` was never in force on this
run; these are the user's own words, relayed verbatim as:

> "1) Fold it in. 2) one run 3) Go B 4) Fix it now"

Two of the four go **against** the orchestrator's recorded lean (OQ1 and, in
effect, OQ3's openness). That is the point of asking.

### USER RULING 1 — OQ1: fold the reduced-motion fix into THIS change

**Answer: option A.** Reverses the orchestrator's ruled lean B (C4 in
`-panel-consolidated.md`), which was chosen on scope discipline in the absence
of an answer. The user's call governs.

**Delta or tasks-only? → TASKS ONLY, no delta.** Determined by reading the
spec text rather than assuming, as instructed. `openspec/specs/system-space-view/spec.md:1323-1337`,
*Space View Respects Reduced-Motion Preference*, already states the behaviour
in full — "WHILE the user's system indicates a reduced-motion preference, the
system SHALL hold the starfield, nebula, film-grain, body-surface, and
fleet-plume animation static (their time input frozen), while body, fleet, and
contact positions continue to advance with world time" — and it already
carries its scenario, *Reduced motion freezes decorative animation while
positions keep advancing*. Nothing about the requirement is wrong or missing.

The code simply never satisfies it: `SystemSpaceView.tsx:438` passes
`reducedMotion: false` as a literal and nothing in the frontend reads
`prefers-reduced-motion`. **This is a make-a-live-scenario-true fix**, which
needs tasks and red tests, not a delta. Writing a delta here would re-ADD or
MODIFY a requirement that is already correct — churn with an archiver hazard
and no gain.

One nuance passed to the writer: the requirement says **WHILE**, a live
condition, so the detection must track changes mid-session (a `change`
listener on the media query), not read once at mount. A mount-only read
satisfies the scenario's letter and not its "WHILE".

`drift-reduced-motion-never-detected.md` gets closed-by-this-change wording.

### USER RULING 2 — OQ2: one `--repeat-each 20` run

**Answer: option A**, matching the lean. No second independent run. Recorded
as the user's ruling rather than the orchestrator's, so a later reader does
not re-open it as an un-answered cost question. `R-8`'s statistical reasoning
for raising 6 → 20 stands; the second run is declined.

### USER RULING 3 — OQ3: option B, extract the transform writer from GL construction

**Answer: B — decided, no longer open.** This was the one question blocking
implementation. The writer removes the "left open / coherent under either
branch" framing from design.md and tasks.md and authors **B as the decision**,
with **A as the rejected alternative and why** (A requires extending the
shared `vitest.setup.ts` WebGL fake, which changes the branch most existing
`SpaceStage` tests currently assert).

Consequences the writer must carry through, because several artifacts were
deliberately written to straddle both branches:
- The per-task branch notes ("— under OQ3 (B), 'the frame loop' is the
  transform loop, not `draw()`") on tasks 2.1, 4.2, 4.3, 4.3a, 4.3b, 4.6, 4.8,
  4.9 collapse into plain statements about the transform loop.
- `N3`'s fail-soft clause on task 4.6 and Decision 7 was conditional on (A).
  Under B the transform loop is **not** gated on the renderer constructing, so
  the fail-soft path is handled by construction — the conditional language goes,
  but the guarantee it protected (a GL-refusing driver still gets positioned
  hit targets and off-screen chips) must survive as a plain requirement of B.
- Decision 7's "**Conditional on OQ3**" opener becomes unconditional, with the
  transform loop named as the single basis authority.

### USER RULING 4 — OQ4: fix the GalaxyView served-scale defect in this change

**Answer: fix it now**, matching how the change was already authored (option
A). The reversal instruction in design.md — the "if Travis prefers strictly
behaviour-preserving scope, drop the fourth paragraph and both its scenarios"
escape hatch — is now **moot** and is marked as such rather than left as a
live option, so no later reader executes it.

`defect-galaxy-view-clock-ignores-served-scale.md` stays as the record of what
was found and why; it is fixed by this change rather than deferred.

---

## Not ruled, and deliberately so

The **task-count cap**. The architect sizes the change at ≈35–42 tasks
*before* this panel's additions land, and `A-F4` rules there is no clean split
seam — the first half of the proposed seam falsifies two live requirements.
If the writer's count exceeds 40, it **stops and reports**. The remaining
options at that point (cut scope per `A-F6`/`A-F8`; or ship Decision 1's
rejected `startTransition` fallback as its own smaller change) are decisions
for Travis, not for the writer and not for me.

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

---

## Kickoff sizing (tasks 1.1–1.2), architect, 2026-09-19

Measured against the tree at `1b437af` (the change's artifacts unchanged since
the verdict commit `3566af9`). The impl contract that uses these numbers is
`fix-world-time-render-loop-impl-contract.md` (§10.1 has the per-test migration
list).

### 1.1 — assertions counted in the eight named files

How I counted: **membership** means a `get/query/findByTestId` lookup of a hit
target or off-screen chip (`body-hit-*`, `fleet-mark-*`, `offscreen-*`,
`sighting-mark-*`, `contact-mark-*`), plus the one structural tab-order test
that reads hit targets through `querySelectorAll`. **Plumbing** means a site
the frame-loop threading touches: a `<SpaceStage>` render site (gains the new
required `frameSource` key), a `<SpaceWorld>` construction site (loses
`scene`/`camera`, gains `frameRef`), a `data-draw-world-time` assertion, or a
point pick issued before the loop has published a basis.

| File | Membership lookups | Plumbing sites |
|---|---|---|
| `SpaceStage.test.tsx` | 0 | 4 render sites, 1 draw-stamp assertion |
| `SpaceStage.renderer.test.tsx` | 1 | 5 render sites, 1 draw-stamp assertion |
| `SpaceStage.interaction.test.tsx` | 21 + 1 tab-order test | 5 render sites, 2 point picks after a camera move |
| `SpaceStage.fleet-mark.test.tsx` | 7 | 1 render site |
| `SpaceStage.sighting-ghost-selection-guard.test.tsx` | 2 | 1 render site, 1 point pick at mount |
| `SystemSpaceView.test.tsx` | 0 (SpaceStage is mocked at its seam) | 0 |
| `webgl/SpaceWorld.draw.test.tsx` | 0 | 8 construction sites |
| `webgl/SpaceWorld.test.tsx` | 0 | 3 construction sites |
| **Total** | **31 lookups + 1 structural test** | **32 sites** (16 render, 11 construction, 2 draw-stamp, 3 early/after-move picks) |

Most of these are mechanical. **Nine tests are at risk**: tests that would
need to wait one animation frame, because chip membership, focus reframing and
point picks now read the basis the loop publishes. Eight are in
`SpaceStage.interaction`: *Focus survives the view's animation frames*,
*Focus moving to an off-screen glyph brings it into view*, the four
off-screen-reach tests that query a chip synchronously at mount, and the two
point-pick-after-camera-move tests. The ninth is the SDET control test in
`sighting-ghost-selection-guard`. The impl contract (§6.2) removes eight of
them from the migration list. It runs the loop's first frame synchronously
when the loop starts, and it re-publishes the basis synchronously on every
camera change. A test that queries straight after `render()` or after a
camera input therefore already sees a published basis. **The one semantic
migration left** is *Focus survives the view's animation frames*. It drives
"frames" by re-rendering with a new `worldTime`, which no longer models a
frame, so task 2.4 restates it as rAF-driven. The **11 `SpaceWorld`
construction rewrites** stay. Everything else is a one-key prop addition per
render helper (`frameSource={null}`).

Outside the eight files, task 3.4's envelope change touches 1 assertion in
`hooks/use-fleets.test.tsx` and 2 in `lib/services/fleet-service.test.ts`.
Task 3.4 already covers these ("update its consumers"), so they need no new
task.

**Task count: 37 as written. No task is added. This is below the cap of 40,
so no stop is needed.**

### 1.2 — `use-world-time` mock sites and `worldTimeRef` reads

- `vi.mock('@/hooks/use-world-time')`: **one site**,
  `frontend/components/galaxy/GalaxyView.test.tsx:163`. No other test mocks it.
- Other importers of the hook, all rewired or deleted by this change:
  `GalaxyView.tsx:36` (import) / `:182` (call); `SystemSpaceView.tsx:49`
  (import) / `:426` (call); `hooks/use-world-time.test.tsx:3` (moves to
  `lib/client-clock/`, task 3.1).
- `worldTimeRef` in `SystemSpaceView.tsx`: declared at `:427`, written during
  render at `:428`, and **read at `:182`** (inside `ScanSweepWatcher`, through
  its prop), **`:512`**, **`:515`**, and **`:595`**. It is passed as a prop at
  `:727`, with the prop's type at `:112` and its destructure at `:105`. `:285`
  is a comment that names it. This is the known list plus nothing: there are no
  other reads.
- One site affects task 3.5's acceptance grep: the comment at
  `SystemSpaceView.test.tsx:821` contains the literal `hooks/use-world-time.ts`,
  so `grep -r use-world-time frontend` will match it until the SDET edits that
  comment. The grep also has to exclude `node_modules` and `.next`, or a stale
  build cache matches.

## Phase 2 kickoff rulings — orchestrator, 2026-09-19

On the architect's kickoff findings (`fix-world-time-render-loop-impl-contract.md`,
findings F1–F10 as reported at kickoff). These are ORCHESTRATOR RULINGs on
implementation detail inside the decided design shape — not product rulings,
not `FULL-AUTO RULING`s. No change artifact under `openspec/changes/` is edited
by any of them, so the adversary verdict at `3566af9` stays current.

| # | Finding | Ruling | Basis |
| --- | --- | --- | --- |
| K1 | F1 — the draw-stamp write as an effect costs a second commit per coarse tick (4 commits in 2 s vs the ≤3 bound of *A counting figure advances without a per-frame render*) | **Accepted: write the stamp during render** (state-adjusted-from-props pattern), guarded by `available` and by value change. | Decision 6's load-bearing content is *React-written, at the coarse cadence, under the `if (!available)` guard*, and task 4.5 lists what stays: the state, `setDrawWorldTime`, the guard. "Effect" in task 4.5 names where the write lives today, not a requirement. The render-phase write keeps all three, is the defect record's own fix option 3 ("derive `drawWorldTime` during render"), and removes the nested passive update the defect names. `SpaceStage.renderer.test.tsx`'s restore assertion stays unchanged, as task 4.5 requires. Reversal cost: one hunk. |
| K2 | F2 — task 2.5 / the live reduced-motion requirement say contact positions "keep advancing"; contacts are drawn at their served position and never move | **Test asserts contacts are unaffected by the preference** (as the contract says). The baseline wording is a drift candidate, recorded here and in the final report; not edited in this change. | Correcting live baseline text is a brownfield baseline correction, outside this change's delta set and its verdict. |
| K3 | F3 — task 4.2's "remove `worldTime` from the memo deps (it builds at the coarse value)" | Read as: the per-frame value leaves the memo's deps; the coarse value is what the React-side memo builds at. | The parenthetical says so; no other reading is coherent. |
| K4 | F4 — up to one frame of skew between WebGL picture and DOM hit targets | Accepted as-is; not a regression; Decision 3's two loops stand. | USER RULING 3 decided two loops. |
| K5 | F5 — task 3.5's grep scope | Grep excludes `node_modules` and `.next`; the SDET rewords the comment at `SystemSpaceView.test.tsx:821`. | Mechanical. |
| K6 | F6 — GalaxyView anchors on the envelope's `worldTime` with the envelope's `scale` | Accepted, within task 3.4. | Same-response time/scale pair is the only coherent anchor. |
| K7 | F10 — delete `GalaxyView.test.tsx`'s `use-world-time` mock rather than repoint it | Accepted — the SDET removes it (test edit, SDET-owned). | The new clock module has no rAF to stub; task 3.4's intent (the mock no longer targets a deleted module) is met. |
| K8 | F9 — task 2.3 may not be observable red under jsdom | The SDET must attempt it against the pre-fix tree and report the result verbatim; it may NOT weaken the assertion to get a red, and a 2.3 never observed red is recorded as such in the coverage table, not as `assertion-red`. | Task 2.3's own text: "a 2.3 that is green before group 3 is not evidence". |

**Role split for test-bearing tasks.** Every test half of tasks 2.x, 3.x, 4.x (including 3.1's moved pure tests, 3.5's deletion of `use-world-time.test.tsx`, 4.7's migrations, and the removal of `GalaxyView.test.tsx`'s mock) is the SDET's, done in the red phase. The nextjs-dev owns production code only.

## Green-phase test disputes — orchestrator, 2026-09-19

| # | Dispute (nextjs-dev) | Ruling | Basis |
| --- | --- | --- | --- |
| D1 | `SpaceStage.transform-loop.test.tsx` 4.3b (*A hit target tracks its mark on every frame*): `burningFleetInputs()` sets `interior: null` | **Test defect — dev is right.** SDET gives the fixture a real interior (as `movingBodyInputs()` does); the assertion and scenario are unchanged. | `space-scene.ts:285` `if (!interior) return empty` — a pre-existing, independently pinned contract (`space-scene.test.ts`) that this change does not touch. The fixture could never produce `fleet-mark-fleet-1`; the test provably misreads the precondition, not the behaviour. |
| D2 | `lib/format/guards.test.ts` `KNOWN_TOFIXED_EXCEPTIONS` anchors stale after the `SpaceStage.tsx` / `webgl/SpaceWorld.tsx` rewire | **Routine re-anchor, SDET-owned.** SDET re-derives the anchors by grep against the live files; allowed only if they are the same three reviewed call sites (bearing/speed hover-facts ×2 panels + detail string; the orbit-ring memo key) and no new `.toFixed(` site exists. | Verified by orchestrator grep: `SpaceStage.tsx` 837/838/894/895/1055, `SpaceWorld.tsx` 201 — same sites, same count as the reviewed set. The guard's own procedure; the dev correctly declined to do it. |
| D3 | `GalaxyView`'s inline `onReady` stabilised with `useCallback` (not in contract §9.2) | **Accepted**, in scope of task 3.4. | Required by task 3.4b's ≤3-render bound; mirrors the contract's `handleFirstFrame` pattern. |
| D4 | (SDET-reported) `webgl/SpaceWorld.test.tsx:21` and `webgl/SpaceWorld.draw.test.tsx:20` — red-phase `frameOf()` parameter annotation `{ mark: { id: string } }` too narrow for the real `ProjectedMark` now that `projectMarks` exists; 2 `tsc` errors | **Test defect (red-phase scaffolding), SDET-owned.** Drop the explicit parameter type and let TS infer `ProjectedMark`; no assertion changes. | Type-only; the annotation existed solely to silence TS7006 while the symbol was missing. |

---

## Rulings at the archive gate (per-link orchestrator for chain link 2a, 2026-10-03, `--full-auto`)

This change archives alongside `add-vitals-strip` (tasks 5.4–5.6). These are
`FULL-AUTO RULING`s — the flag is in force on this run, unlike the 2026-09-19
runs above. The link's other rulings are `add-vitals-strip-rulings.md` 51–53.

### FULL-AUTO RULING 1 — every adversary verdict pinned at `3566af9` is CURRENT; no re-attack, the diff is checkbox flips and a handoff-path rename

`git diff 3566af9 -- openspec/specs/system-space-view openspec/specs/galaxy-view
openspec/changes/fix-world-time-render-loop` returns three files, all in the
change folder: `tasks.md` (34 checkbox flips plus one path), `design.md` and
`proposal.md` (handoff paths only). Every non-checkbox hunk is
`docs/plans/continous_space/handoffs/` → `docs/handoffs/` from `f179757`; the old
path is a symlink to the new. No delta, requirement, scenario or live spec byte
changed.

- **Basis:** the verdict-commit section of
  `fix-world-time-render-loop-adversary-r3b-ruling-spotcheck.md` (empty-diff
  test, re-attack scope = the diff); `add-vitals-strip-rulings.md` RULING 43/51.
- **Rejected:** a further adversary pass — the change is at the cap plus a
  spot-check, and a path string is not attackable spec content.
- **Reversal cost:** none.
- **Known expiry ahead:** archiving `add-vitals-strip` rewrites
  `openspec/specs/system-space-view/spec.md`. The two changes' MODIFIED headers
  are disjoint (design.md Migration Plan); the currency diff is re-run after
  that archive, scoped to this change's one MODIFIED target, *Body, Lane-Gate,
  and Point Selection Is Keyboard-Operable*, and `openspec-reconcile.py` is
  re-run as task 5.6 requires.

### FULL-AUTO RULING 2 — task 5.3 is checked with no record of its result anywhere in the repo; it is executed once more as its own invocation before 5.4, and recorded

`1424a77` flipped 5.3 and 5.3a to `[x]`. No handoff carries 5.3's numbers:
there is no `fix-world-time-render-loop-journey.md`, the defect record still
reads OPEN with nothing after 2026-09-19's diagnosis, and the only Playwright
artefact on disk (`frontend/test-results/.last-run.json`, 2026-09-19 18:16) is a
*failed* run of a different spec. Task 5.5 must close the defect "with 5.3's
numbers" and QA's verdict closes rows #6, #7, #17, #18 only "against the
journey's own record". Neither can be done from a checkbox. The same commit
also changed the code under test (`wallMsUntil`, the ×5 warped stack) and
`2baf73b` moved every port, so numbers from before those would describe a
different tree even if they had been written down.

**Ruling.** The SDET runs task 5.3's dedicated invocation once — the journey
spec at `--repeat-each 20`, per the task text — before and separate from 5.4's
full-suite run, and writes the result to
`docs/handoffs/fix-world-time-render-loop-journey.md`. USER RULING 2 (one run,
no second independent one) is honoured: this is the one *recorded* run, not a
confirming rerun of a recorded one.

- **Basis:** design.md Migration Plan ("this change's closing evidence is its
  own dedicated run … this is what closes the defect"); task 5.5's text;
  `fix-world-time-render-loop-qa.md` Verdict; `docs/handoffs/README.md` (state
  lives in the handoffs, a claim with no record is not a record).
- **Rejected:** closing the defect on the checkbox (Lesson two — written and
  never verified); a hard stop to ask for the numbers (they are reproducible by
  running the task, and would be stale against today's tree anyway).
- **Reversal cost:** none — one read-only run of one spec.

### FULL-AUTO RULING 3 — tasks 5.3 and 5.3a go back to unchecked until a recorded run backs them, and QA row #7 is closed by an SDET-added hard assertion in the vitals journey, not by a log grep alone

QA's scoped re-verification (`add-vitals-strip-qa-reverify.md`, 2026-10-03)
found two things RULING 2 anticipated and one it did not.

1. **5.3 and 5.3a are false completion claims** — no run is recorded behind
   either. Both boxes are returned to `[ ]` now (a checkbox flip; the adversary
   verdict's currency diff stays checkbox-only) and are re-checked only from
   `fix-world-time-render-loop-journey.md`: 5.3 from the dedicated
   `--repeat-each 20` run, 5.3a from the full tier-4 run of 5.4, which executes
   `world-time-render-loop-journey.spec.ts`.
2. **Row #7 (*The animating view raises no update-depth diagnostic*) has no
   assertion that can close it.** The `[journey-console]` capture in
   `vitals-strip-journey.spec.ts` is observational; a `Maximum update depth`
   line would not turn the run red. Task 5.3's own acceptance text requires
   "zero `Maximum update depth` lines in `[journey-console]`". The SDET adds
   the hard assertion to the vitals journey before the run (the journey spec is
   the SDET's, and it is written against the built UI before the tree locks),
   mirroring the one `world-time-render-loop-journey.spec.ts` already carries
   for the galaxy view, and also records the grep count across all repeats.
3. **The two `add-vitals-strip` BLOCKED rows are only partly asserted** (the
   "non-empty" clause at step 4; "activatable itself" for four of five floating
   surfaces). The SDET reads the two scenarios' text in
   `openspec/changes/add-vitals-strip/specs/system-console/spec.md` and adds
   whatever the THEN clauses state and the journey does not yet assert — no
   more than the scenario text demands.

- **Basis:** task 5.3's acceptance text; the SDET role (the journey spec is
  written by the SDET after every task is checked, before the run);
  `docs/handoffs/README.md` Lesson two — a row closed by evidence that cannot
  fail is not closed.
- **Rejected:** closing #7 by grep only (works, but leaves the next change's
  journey unable to go red on the regression); leaving the boxes checked.
- **Reversal cost:** one assertion each; a checkbox.

### FULL-AUTO RULING 4 — the verdict survived `add-vitals-strip`'s archive (e01b310): the re-attack scope is empty, so this change archives second with no further adversary pass

RULING 1's known expiry, checked after the archive. `git diff 3566af9 --
openspec/specs/galaxy-view` is empty. `git diff 3566af9 --
openspec/specs/system-space-view/spec.md` is non-empty (the three requirements
`add-vitals-strip` MODIFIED) but contains no line of this change's one
MODIFIED target, *Body, Lane-Gate, and Point Selection Is Keyboard-Operable* —
neither its header nor any scenario of it. `openspec-reconcile.py` is clean and
`openspec validate fix-world-time-render-loop --strict` passes against the
post-archive specs. The ADDED requirement's reference to the strip's fleet
switcher now resolves to a live `system-console` requirement, which is the
reason for the archive order.

- **Basis:** the workflow skill's re-attack scope ("the clauses whose live
  targets or delta text changed") — none did; design.md Migration Plan, which
  predicted disjoint MODIFIED headers and prescribed exactly this re-check.
- **Rejected:** a spot-check round with nothing in scope.
- **Reversal cost:** none.

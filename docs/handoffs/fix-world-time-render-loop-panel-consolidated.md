<!-- reduction-receipt: volt_reduction_v1
# Written by harness/check-quote-fidelity.py --write-header; do not hand-edit.
# Every source below is pinned by content hash. If one of them changes, this
# reduction is a claim about a file that has moved on: re-verify it with
# --verify-header and re-reduce before anything downstream trusts it.
source=docs/handoffs/fix-world-time-render-loop-panel-architect.md sha256=791159ead413cb756716d3b7bdf2c199705de83b9a77f73e00da8bc68f598b20 bytes=66354 lines=1270
source=docs/handoffs/fix-world-time-render-loop-panel-reliability.md sha256=3a807a69e93aacfdc826aa1e566450c876425f0e587e16d40a6c790db8531041 bytes=36145 lines=138
source=docs/handoffs/fix-world-time-render-loop-panel-ux.md sha256=89aa597a47ebd66ac997bef5a017e19cf345797583a248ffdc819510e266f5d0 bytes=28094 lines=228
source=docs/handoffs/fix-world-time-render-loop-panel-security.md sha256=3aab4c9e82d436c9e7250f7c4a15801ee9406f3e2ddcdeea56d273de49f0bb21 bytes=4715 lines=33
source=docs/handoffs/drift-reduced-motion-never-detected.md sha256=618ac41415f71d2b0734923ae878a8d12027b68ca204d978bda30492c85332b9 bytes=6261 lines=125
source=docs/testing-tiers.md sha256=8e755a1b5e8319bd863ca22e6bbb1079211ae77f1815f08f513d684c07d6baa8 bytes=5962 lines=102
source=docs/handoffs/defect-cross-system-chevron-nav-stall.md sha256=0d78356174809e969f66a0911dbede9d1bbc5b19c6651a74db2394bbaf48506e bytes=8468 lines=152
source=docs/handoffs/fix-world-time-render-loop-rulings.md sha256=12abb040a7ff45288696c3f6e03210627936898929ce97bc65004ff318af9bcf bytes=24851 lines=346
source=docs/handoffs/fix-world-time-render-loop-panel-brief.md sha256=dd5062eef8b402d677153bc3472fb1e3eccac6edc5a3be03f6ceb8ff98c4874a bytes=8394 lines=146
authority=the orchestrator retains adjudication; this file is evidence, not a ruling
readback=sed -n '<start>,<end>p' <source> — each quote marker carries its line
-->
# Panel consolidated — `fix-world-time-render-loop`

Orchestrator, 2026-09-19. This is the deduped, tie-broken finding set handed to
the spec writer as ONE revision pass.

**Every reviewer's own report is persisted in full** — this file rules, it does
not replace them. The writer reads all four:

| Reviewer | Report | Verdict |
| --- | --- | --- |
| architect | `fix-world-time-render-loop-panel-architect.md` | F1–F17: 2 BLOCKER, 10 MAJOR, 5 MINOR |
| reliability | `fix-world-time-render-loop-panel-reliability.md` | 1–16: 2 BLOCKER, 9 MAJOR, 5 MINOR — NEEDS FAILURE SPECS |
| ux | `fix-world-time-render-loop-panel-ux.md` | 1–6: 0 BLOCKER, 6 MAJOR — NEEDS SCENARIOS |
| security | `fix-world-time-render-loop-panel-security.md` | SECURITY-CLEAR, no findings |

Finding IDs below are `A-Fn` (architect), `R-n` (reliability), `U-n` (UX).
**Paste-ready text lives in the reviewer reports at those IDs.** The writer
applies the text from the report, not a paraphrase of it.

---

## Conflicts resolved before the writer sees them

Six. Standing tie-break: architect wins on technical shape, security on
controls, dba on data mechanics, ux on user-observable behaviour.

### C1 — Task 4.4 (`pickAt` reads the frame loop's marks): **DROP IT**

- `A-F6` says drop: the mark-list path is **dead in production**.
- `R-brief-ruling` cleared it and would keep it.

**Ruling: drop task 4.4, per `A-F6`.** Not on the tie-break — on evidence.
I verified the architect's claim myself:
`SpaceLayers`' destructuring (`SpaceStage.tsx:502-526`) ends at `onReframe,`
and never takes `onPointerUpCapture`, though the prop is declared at `:499`;
both live callers pass an empty array (`:426`, `:429`). `resolvePick`'s mark
loop is unreachable today. Activating it would create a second picking
authority with a different hit geometry (24 px CSS box vs.
`max(radiusPx + 8, 16)`), changing outcomes in a band around every mark —
where a click that yields a **point** selection today would start yielding a
**body** selection — with no delta on *Space View Picking Resolves to the
Body, Lane Gate, or Point Under the Pointer* behind it. The reliability
reviewer did not check whether the path was live; the architect did.

The property 4.4 was buying is bought anyway: once the DOM targets are
positioned by the frame loop, the DOM pick path is already frame-accurate.
Apply `A-F6`'s design.md Decision 8 so the next reader does not re-add it.

### C2 — Archive order: **`add-vitals-strip` FIRST, this change second**

- `A-F10`: 2a first — this change's ADDED requirement names "the fleet
  switcher", a `system-console` requirement that exists **only inside 2a's
  deltas** (`openspec/specs/system-console/` does not exist — I verified).
  Archiving this change first leaves a live `system-space-view` requirement
  pointing at a capability `openspec/specs/` does not have.
- `R-brief-ruling` and `U-cleared-6`: this change first (following design.md).

**Ruling: `add-vitals-strip` archives first, per `A-F10`.** There is less
disagreement here than it looks. All three reviewers agree the fix must be
**implemented** before 2a's gate can go green — that is not in dispute and is
not an archive-order question. Neither reliability nor UX offers any reason
the fix's *archive* must precede 2a's; both simply followed design.md's
sentence. The architect supplies a concrete hazard for that order and none
for the reverse. Header sets are disjoint (verified: 2a modifies *System Space
View Route and Data Fan-In*, *Toggle-to-Deselect…*, *Space View Camera Is
Keyboard-Operable*; this change ADDs one and modifies *Body, Lane-Gate, and
Point Selection Is Keyboard-Operable*), so neither order corrupts the other's
MODIFIED blocks.

Resulting sequence, which the writer puts in tasks.md 5.6 and design.md's
Migration Plan (`A-F10` has both texts):

1. Implement this change.
2. Its own closing tier-4 evidence (see C5/C6).
3. `openspec-reconcile.py`, archive `add-vitals-strip`.
4. **Re-run `openspec-reconcile.py`** — 2a's archive is the only event that
   can invalidate this change's MODIFIED block, and the archiver's own check
   fires too late to be the first to know.
5. Archive this change.

design.md's current "Land and archive **before** re-running `add-vitals-strip`'s
archive gate" is wrong and must be replaced, not softened.

### C3 — Where the coarse-cadence bound lives: **in the ADDED requirement only**

- `A-F8`: state the cadence rule once, in the ADDED requirement; no delta on
  *Space View Picking…* or *Off-Screen Bodies and Lane Gates…*.
- `R-7` and `U-5`: add a delta to *Off-Screen Bodies and Lane Gates…* itself.

**Ruling: `A-F8`'s placement, with `R-7`'s and `U-5`'s content folded in.**
Scattering one cadence rule across three requirements is worse spec hygiene
than stating it once where the cadence lives, and it would mean two more
MODIFIED blocks to keep verbatim-correct through 2a's archive. But the other
two reviewers each found something `A-F8`'s text does not say, and both go in:

- **`U-5`: both directions.** `A-F8`'s scenario covers a mark leaving the
  viewport. UX is right that re-entry is the untested half and that the live
  scenario *The affordance covers only off-screen marks* reads as absolute —
  a mark back inside the viewport with a stale chip still showing violates it
  literally for up to a second.
- **`R-7`: the reachable-by-neither window.** Between a mark's position
  leaving the viewport (frame-accurate) and the chip appearing (coarse), the
  mark is reachable by neither its ordinary hit target nor the affordance.
  That is the sharpest statement of why the bound matters and belongs in the
  requirement prose.

Writer: take `A-F8`'s paragraph and two scenarios, extend the off-screen
scenario to cover both crossing directions (`U-5`'s wording), and add `R-7`'s
"never reachable by neither path for longer than that" clause to the prose.

### C4 — Reduced motion: **out of scope; drift filed; threading is mandatory**

- `U-3`: fold the `matchMedia` fix into this change — the call site is being
  touched anyway, cost near zero.
- `A-F12` and `R-13`: out of scope; report as drift; name it in Non-Goals.

**Ruling: out of scope, 2–1 and on scope discipline.** This run has no
authorization to widen the change, `--full-auto` is not in force, and folding
a new `matchMedia` subscription into the one change whose entire purpose is
repairing this view's subscription behaviour is the wrong moment for it.

Filed as `docs/plans/continous_space/handoffs/drift-reduced-motion-never-detected.md`.
I verified it independently of the reviewers:
`SystemSpaceView.tsx:438` passes `reducedMotion: false` as a literal, and
`grep -rn 'prefers-reduced-motion' frontend` returns nothing. The live
requirement *Space View Respects Reduced-Motion Preference*
(`spec.md:1323`) is unmet in production. Adjudication: **code wrong, spec
right** — a corrective change, not a baseline correction. Nobody weakens or
deletes that requirement to match the code.

**But one part IS in scope and is not optional — RULING 3 below.**

### C5 — Repeat count on the closing tier-4 run: **raise 6 → 20**

- `R-8`: 6 repeats cannot distinguish "fixed" from "meaningfully still
  broken"; 0/6 leaves a ~39% Clopper-Pearson upper bound on the true failure
  rate. Proposes `--repeat-each 20`, run **twice** on separate invocations.
- tasks.md 5.3 currently says `--repeat-each 6`.

**Ruling: raise to `--repeat-each 20`. The *second* independent run is an open
question for Travis (OQ2), not a ruling.** The statistics are uncontested and
nobody argued against them, so the first jump is a ruling. The second full
run is where the marginal confidence gain falls off sharply against a real
wall-clock cost I cannot measure in Phase 1 — and `docs/testing-tiers.md`,
not I, governs suite budgets. The writer writes 5.3 at repeat-20 single-run
and leaves OQ2's question visible in design.md's Open Questions.

Note for whoever runs it: this is the **closing** run's repeat count for this
specific defect, not a new standing tier-4 default. `R-8` says so; keep that
sentence.

### C6 — Shared acceptance evidence: **separate the two runs**

- `A-F10` reason 4: "One gate run serves both. There is no second run to
  schedule."
- `R-10`: the two changes' acceptance evidence must not be the same process
  execution, or one lucky green clears both records at once.

**Ruling: both, and they are compatible.** The architect is right that 2a's
archive gate is the full tier-4 suite and that this change's tasks already
run it. Reliability is right that a single execution granting two independent
closures hides residual risk. Resolved by splitting them by *scope*, which is
what each reviewer was actually talking about:

- This change's **closing evidence** is its own dedicated run of the journey
  spec at `--repeat-each 20` (tasks.md 5.3) — this is what closes
  `defect-cross-system-chevron-nav-stall.md`.
- `add-vitals-strip`'s **archive gate** is a separate, later invocation of the
  full suite (tasks.md 5.4's `npm run e2e`).

So: two invocations, different scopes, neither standing in for the other.
`A-F10`'s "one run serves both" sentence is struck from its Migration Plan
text; the rest of `A-F10`'s text stands.

---

## Orchestrator rulings the panel did not cover

### RULING 1 — The hit target's own on-screen test is part of the BLOCKER surface

Found by me while verifying `U-1`. `SpaceStage.tsx:586-590`:

```
style={
  screen.onScreen
    ? { left: `${screen.x}px`, top: `${screen.y}px`, width: 24, height: 24 }
    : { left: '-9999px', top: '-9999px', width: 24, height: 24 }
}
```

`screen.onScreen` does not merely drive a chip — it decides whether the hit
target is **placed at its mark or parked at `-9999px`**. If that test goes
coarse, a mark that re-enters the viewport keeps an unclickable target parked
off-canvas for up to a second. That reaches *Space View Picking Resolves to
the Body, Lane Gate, or Point Under the Pointer* directly, not just the reach
chips, and `C3`'s bound does not by itself fix it.

`A-F7`'s resolution dissolves this: React writes **no position at all**, and
the frame loop's `style.transform` places every target including transforming
off-screen ones off-screen. Writer: make `A-F7`'s text explicit that the
`-9999px` sentinel is replaced by the loop's transform, and that the
on-screen test moves to the loop with the position — it is not membership.

### RULING 2 — `A-F1` and `R-2` are one BLOCKER, not two

Both reviewers independently reached the same jsdom fact from different
directions — the architect from the draw stamp's test
(`SpaceStage.renderer.test.tsx:249`), reliability from `vitest.setup.ts:134-138`'s
`fakeWebglContext()` implementing only `getExtension` while
`SpaceWorld.tsx:220-221` requires `createProgram`. The shared fact:
**`draw()` never executes under any current vitest test.**

Consequences, both of which the writer must resolve:
- the draw stamp cannot move into `draw()` (`A-F1`) — it also loses the
  `if (!available) return` gate, which is what *A restored context's first
  frame reflects live state* is asserted by;
- design.md Risk 2's "component tests assert … that a frame writes a
  transform" is unbuildable as written (`R-2`).

`A-F1`'s Decision 6 fixes the first. The second needs OQ3's choice.

### RULING 3 — `reducedMotion` stays threaded. Not optional.

Scope says don't *fix* the drift here (C4). It does not say let the refactor
make it worse. design.md Decision 3's input list — "interior, fleets here,
selection, sightings" — **omits `reducedMotion`**, and the call site it omits
it from is the only one that has it. Writer: add `reducedMotion` to
Decision 3's enumerated inputs and apply `A-F12`'s Non-Goals paragraph
naming the drift with its `file:line`. The new frame-loop call site carries
the literal `false` through unchanged — neither deepening nor silently
closing the gap.

### RULING 4 — `A-F16`'s two factual corrections are accepted as written

`data-world-time` is on an sr-only span (`SystemSpaceView.tsx:703-708`), not
the view root; and task 3.3's line-182 read is inside `ScanSweepWatcher`, a
separate component taking the ref as a **prop** (`:105,112`, instantiated at
`:723-733`), so its prop type and eslint-disabled dep array change too. Both
are corrections to the change's own description of the tree; both land.

---

## The accepted finding set, by disposition

Every finding below is **accepted** unless marked otherwise. Paste-ready text
is in the named report under the named ID.

### BLOCKERs — all four must be resolved before the adversary round

| ID | Finding | Disposition |
| --- | --- | --- |
| `A-F1` + `R-2` | `draw()` never runs under jsdom; moving the draw stamp there drops the `if (!available) return` gate and leaves *A restored context's first frame reflects live state* asserted by a vacuously-passing test | **ACCEPTED, merged (RULING 2).** Apply `A-F1`'s Decision 6 and its tasks.md 4.5 correction. `R-2`'s second half needs OQ3. |
| `A-F2` | `onFirstFrame` is NOT passed to `SpaceWorld` today (verified: `SpaceStage.tsx:382-390` renderWorld has no such prop; production announces from the React effect at `:203`). Moving it onto the loop wedges the loading overlay forever on a soft first-draw failure, and threading the inline arrow through `SpaceWorld`'s `[canvas, extent, onFirstFrame]` deps rebuilds the entire three.js world every render | **ACCEPTED.** Apply `A-F2`'s Decision 6 addition; strike "`onFirstFrame` stays on the loop's existing `announced` path" from task 4.5. |
| `R-1` | `clock.now()` before the first `anchor()` projects against a null anchor and throws — inside an rAF callback, which `system-space-view/spec.md:1023-1030` says no React error boundary can reach. The deleted hook structurally could not do this (`worldTime` was always a number from mount) | **ACCEPTED.** Apply `R-1`'s Decision 1 text and task 3.6. |

### MAJORs — accepted

| ID | Finding | Note |
| --- | --- | --- |
| `A-F3` + `R-6` + `U-2` | **`galaxy-view` needs a delta.** Unanimous, three reviewers. Premise ("no requirement names the cadence") true; conclusion false — `GalaxyView` is rewired by task 3.4, has two `router.push` sites (`:245`, `:281`) sharing the mechanism by construction, and no requirement would oblige the rewire to have happened | Use **`A-F3`'s** delta (fullest). Add `R-6`'s task 3.4a render-count test. `U-2`'s roster-burn-redirect scenario folds in. |
| `A-F4` | **The pre-identified split seam is not clean.** Its first half falsifies *An idle fleet renders at its live position* (picture steps at 1 Hz) and *Hit targets SHALL be positioned at the marks actually drawn* — and design.md itself rejects coarse hit targets at `:122-124`, so the risk register and Decision 3 contradict each other | **ACCEPTED.** The invariant is atomic. Cut scope per `A-F6`/`A-F8` if the cap binds; if it still binds, Decision 1's `startTransition` fallback ships as its own change, never as half of this one. |
| `A-F5` | **Two projection bases with no source of truth.** React's `basis` memo is keyed `[host]` and never updates on resize (`SpaceStage.tsx:172-176`); the loop recomputes live from the canvas every frame (`SpaceWorld.tsx:628-634`). After the split, a point pick unprojects through a different basis than the marks were drawn with — *Clicking empty space selects the point under the pointer* fails after a resize, uncovered by any test | **ACCEPTED.** Apply `A-F5`'s Decision 7 fragment and its group-4 task. |
| `A-F6` | Drop task 4.4 | **ACCEPTED — see C1.** |
| `A-F7` | **Two position writers per element.** React writes `left`/`top` on three layers (`:586-590`, `:840-844`, `:736`, `:776`); the loop would write `transform`. Neither design picks. Also `transform` collides with the `-translate-x-1/2 -translate-y-1/2` centring utility (`:583`) | **ACCEPTED**, plus RULING 1. |
| `A-F8` | The coarse/fine split is observable and unspecified in two places | **ACCEPTED — see C3** for placement and merged content. |
| `A-F9` + `A-F15` + `R-4` | **The 1 Hz justification is factually wrong and the bound is a floor with no ceiling.** Instants are minute-resolution (`figures.ts:136-153`); durations are wall-scaled (`figures.ts:117`), which is the actual reason the bound is scale-independent. "At least once per second" permits per-frame. "On the order of" is not decidable | **ACCEPTED.** Use `A-F9`'s full replacement paragraph; use the `≤3 renders` number from `A-F15`/`R-4` in the scenario. *(I checked this claim myself earlier and got it half-right — the bound is safe, the stated reason is not. The architect's correction stands, not mine.)* |
| `A-F10` | Archive order | **ACCEPTED — see C2**, with C6's amendment striking "one run serves both". |
| `A-F11` | **`frontend/lib/world-clock/` takes a Go-authority capability's name.** No mechanical anti-mirror collision (I verified: `check-mirror-map.sh`'s pairs are `backend/<pkg> ↔ frontend/lib/<pkg>`; the Go clock is `backend/common/worldtime.go`, so no pair fires) — but the name invites the mirror it forbids | **ACCEPTED.** Rename to `frontend/lib/client-clock/`. Apply `A-F11`'s Decision 1 text. Also: task 4.1 must say `projectMarks` lives in `components/space/space-projection.ts`, **not** `frontend/lib/space/` (that directory is anti-mirror-scanned). |
| `A-F12` + `R-13` + `U-3` | reduced-motion drift | **See C4 + RULING 3.** No delta; Non-Goals text; threading mandatory; drift filed. |
| `R-3` | **The mark registry has no de-registration path.** A mount-only effect retains detached nodes for the view's life and makes `draw()` write transforms to dead elements every frame | **ACCEPTED.** Apply `R-3`'s task 4.3a (callback ref, `el ? set : delete`). |
| `R-5` + `U-4` | **Decision 2's refetch argument does not reach the display flips it concedes.** The scheduling claim is verified and correct for the `setTimeout` path; `mineRunning` (`SystemSpaceView.tsx:693`), `settling` (`ScanControl.tsx:179`) and `rosterCommandVisibility` (`FleetRoster.tsx:122-135`) are plain per-render comparisons against the coarse prop and are not covered by it | **ACCEPTED.** Apply `R-5`'s Decision 2 paragraph. The ≤1 s bound itself is stated once, in `A-F9`'s requirement paragraph, which names these three by capability. |
| `R-9` | **No unit test can ever exercise the real defect.** `SystemSpaceView.test.tsx:37` mocks `next/navigation` entirely; a mocked `router.push` never enters React's scheduler, so it cannot be starved. Only the tier-4 journey tests whether a navigation arrives | **ACCEPTED.** Apply `R-9`'s Decision 5 text. This is the single most important sentence to keep: it stops a future reader reading a green unit suite as proof about navigation. |
| `R-11` | **Rollback is silent on the post-archive case.** A code-only `git revert` after archive leaves the ADDED requirement asserting an invariant the code no longer holds, and silently re-opens 2a's blocker | **ACCEPTED.** Apply `R-11`'s Migration Plan text. |
| `R-15` | **No `visibilitychange` handling.** Background-tab intensive throttling drops `setInterval` to ~1/minute, falsifying the requirement's literal "at least once per wall-clock second". The frame loop already pauses when hidden; the coarse tick does not — two clocks that now diverge when hidden | **ACCEPTED.** Apply `R-15`'s visibility qualifier and its resync scenario. |
| `U-1` | **`onFocusMark`/`reframeOn` read the coarse scene.** `SpaceStage.tsx:591` passes `mark.position` and `screen.onScreen` from the React scene into `reframeOn`, which sets the camera target one-shot with no correction (`:206-211`, `:408-410`). Against *Space View Camera Is Keyboard-Operable*'s absolute "reframe by the minimum adjustment … immediately", a ≤1 s-stale position under- or over-shoots and nothing re-corrects it. Neither design.md nor tasks.md mentions this flow | **ACCEPTED.** The requirement does **not** change — the implementation must read the frame loop's live marks, exactly as `pickAt` does. Writer: add the task; do not add UX's optional bounding scenario (that was offered only if we accepted a coarse reframe, and we do not). |

### MINORs — accepted

`A-F13` (Context understates React's per-frame work — it re-renders the whole
floating command column, which is the evidence for the net-CPU claim),
`A-F14` (two-scene-builds premise verified; the `log` injectable fires
`console.warn` at frame rate into the very `[journey-console]` capture this
change greps for its evidence), `A-F16` (two factual errors — RULING 4),
`A-F17` (prohibitions name their causes), `R-14` (`anchor()` assigns a new
object, never mutates in place), `R-16` (24 tasks is a placeholder until task
1.1 actually runs — do not read it as cap compliance).

### Not accepted

- **`R-brief-ruling` on picking** — superseded by C1.
- **`U-2`'s `galaxy-view` delta text** — superseded by `A-F3`'s, which is
  fuller; `U-2`'s extra roster-burn scenario is kept.
- **`R-7`/`U-5` as standalone deltas on *Off-Screen Bodies…*** — superseded by
  C3's placement; their content is kept.
- **`U-1`'s optional reframe-bound scenario** — conditional on accepting a
  coarse reframe, which we do not.
- **`U-6`'s replacement scenarios for the two render-count scenarios** —
  **rejected, with reasons.** Both the architect and reliability independently
  ruled the altitude acceptable against this repo's own live precedent:
  *No second derivation of fleet state exists in the strip*
  (`add-vitals-strip/specs/system-console/spec.md:347-354`, "WHEN the strip's
  component tree is inspected"), *No displayed value is derived from a drawn
  position* (`system-space-view/spec.md:356-361`), `space-kinematics`'s
  authoritative-implementation requirement, and — decisively — the live
  text of the very requirement this change MODIFIES, which already says "as
  the view's per-frame world-time update **re-renders**"
  (`spec.md:1274`). The architect adds the argument that settles it: paragraph
  3 alone ("a navigation SHALL commit") is satisfied by design.md's *rejected*
  `startTransition` alternative, so dropping the structural paragraph would
  leave the requirement unable to distinguish the fix Travis chose from the
  one he declined. UX's underlying complaint is nonetheless real and is fixed
  by `A-F15`/`R-4`'s number replacing "on the order of", and by `A-F9`'s
  rewritten cadence paragraph.
  UX's offered tightening of paragraph 4 (name the browser console as the
  observable surface rather than "the UI framework") **is** accepted — take
  the architect's version of that text, in its dispositions section item 1.

---

## What the writer produces

1. `specs/system-space-view/spec.md` — rewritten ADDED requirement
   (`A-F9` paragraph, `A-F8` paragraph + 2 scenarios extended per C3, `R-15`
   visibility qualifier + scenario, `A-F15`/`R-4` number, architect's
   paragraph-4 console wording). MODIFIED block untouched — all six scenario
   headings are already verbatim (verified twice, by the architect
   programmatically and by UX line-by-line).
2. `specs/galaxy-view/spec.md` — **new file**, `A-F3`'s delta + `U-2`'s roster
   scenario.
3. `design.md` — Decisions 1 (`A-F11` rename, `R-1` pre-anchor, `R-14`
   atomicity), 2 (`R-5`), 3 (`A-F5` basis, `A-F7` one writer, RULING 3
   `reducedMotion`), 5 (`R-9`), new 6 (`A-F1`+`A-F2`), new 7 (`A-F5`), new 8
   (`A-F6`); Context (`A-F13`); Non-Goals (`A-F12`); Risks (`A-F4`, `A-F14`);
   Migration Plan (`A-F10` as amended by C6, `R-11`); Open Questions (OQ1–OQ4
   from `fix-world-time-render-loop-rulings.md`).
4. `tasks.md` — drop 4.4; add 3.4a, 3.6, 4.3a, `A-F5`'s basis task, `U-1`'s
   reframe task, `A-F16`'s `ScanSweepWatcher` sub-task; correct 4.5, 5.3
   (repeat-20), 5.6 (archive order); retarget 1.1 to count **membership
   assertions and plumbing sites**, not position assertions (`A-F`
   dispositions item 8 — the five test files largely do not assert positions
   through render; one hit per file, all fixtures or camera-limit strings).
5. `proposal.md` — `galaxy-view` moves out of "takes no delta" into Modified
   Capabilities; Impact gains the rename and the galaxy-view delta.

**Task-count warning.** The architect sizes group 4 honestly at 18–25, total
≈35–42 — at or over the 40-task cap before any of the above lands. `A-F4`
rules there is no clean seam. If the writer's count exceeds 40 after applying
this set, it **stops and reports** rather than splitting — the split options
are OQ-level decisions, not the writer's.

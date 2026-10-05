# `add-burn-cost-overlay` — adversary round 2

- Change: `openspec/changes/add-burn-cost-overlay/` (link 2a-iv of `docs/plans/system-hud/chain.md`)
- Round: 2 of at most 3
- Date: 2026-10-05
- Base commit: `d965f5d`; the change's content is uncommitted, so the repairs were read as the files stand, not from a diff
- Scope, per the convergence rule: every round-1 finding re-attacked with the wrong build it named; the revised and new clauses attacked; round 1's "checked and found sound" list left alone except where a repair touched it.
- Read whole: `add-burn-cost-overlay-adversary-r1.md` with its rulings, the delta, tasks.md, proposal.md, design.md, the architect's post-r1 notes, the design-alignment list, the rulings index. Read in part: live `system-console` (strip presence, fuel cell), live `system-space-view` (preview, failed or stale preview), `Gauge.tsx`, `use-burn-preview.ts`, `SpaceCommandPanel.tsx`, `SystemSpaceView.burn-preview.test.tsx`, `playwright.config.ts`, the installed `@tanstack/query-core` 5.90.11. No suite, stack or state-changing git command was run.

Paths below: `delta` = `openspec/changes/add-burn-cost-overlay/specs/system-console/spec.md`; `tasks`, `proposal`, `design` are the files beside it.

Summary: all 12 round-1 findings are fixed. 0 BLOCKER, 0 MAJOR, 5 MINOR, all residue of round-1 repairs and none material. No fence is crossed and no ruling is reopened.

Counts checked: 40 scenarios (20 + 20), matching proposal:15; 39 unchecked tasks; every scenario title is quoted whole in tasks.md and every quoted title exists in the delta.

---

## Round-1 findings

| Id | Status | Wrong build round 1 named | Scenario that now fails it | Task that tests it |
| --- | --- | --- | --- | --- |
| B1 | FIXED | mark at `left: pct%` with no pull-back | *The unaffordable mark sits at the extent's end along the rail*: "at a cost of 250 the mark is positioned at 100 % of the rail and is displaced back by 100 % of its own width, so its trailing edge is the rail's end and no part of it lies past the rail" (delta:156-158) | 2.2: "the pull-back equals the same percentage of the mark's own width (0, 50, 100, read as the negative of the start position), so a mark with a start position and no pull-back fails at 100 and 250 t" (tasks:18) |
| M1 | FIXED | band with `inset-y-0` | *The extent covers only part of the rail's height*: "in each case the extent's height is less than the rail's height while the fill's height is the rail's" (delta:92-93) | 1.1: "the fill spans the rail's height and the extent does not, so a full-height extent fails" (tasks:5) |
| M2 | FIXED | zero-width mark; mark in the band's amber; mark not full height | *The unaffordable mark has a visible size and its own paint*: "the mark spans the rail's full height and its width is greater than zero, and that width is the same at both costs" and "the mark's paint differs from the paint of the unaffordable extent" (delta:142-144) | 2.2: "the mark's static size is asserted as non-zero, full rail height, string-identical across 0.4 t and 30 t and with no inline size" (tasks:18); 1.4: "the mark's colour tokens differing from the unaffordable extent's" (tasks:8) |
| M3 | FIXED | wiring computes `flag && cost <= fuel` | *The served flag is shown even when the cost exceeds the fuel aboard*: 100 t, flag true, 80 t aboard, "its state attribute reads affordable" and "the unaffordable mark is absent" (delta:364-371) | 3.5: "Y's overlay then reads affordable with no mark although its cost exceeds the 80 t aboard, so an affordability computed at the wiring (`flag && cost <= fuel`) fails here and only here" (tasks:32) |
| M4 | FIXED | overlay re-presented at 15 % while the request after a failure is pending | *A refresh sent after a failure draws no overlay while it is pending*: "no overlay is drawn and the burn command's fuel ceiling is absent" (delta:339-345); prose at delta:276-279 now covers both directions | 3.4: "the next refresh, sent and not answered, still draws no overlay and no ceiling" (tasks:31) |
| m1 | FIXED | — | proposal:15 reads "20 and 20 scenarios"; the delta has 20 and 20 | — |
| m2 | FIXED | — | delta:291-295 is scoped to what a fuel change does "of itself", bounds the lag by the first response requested after the change, and says a failure withdraws | 3.10 (tasks:37) |
| m3 | FIXED | — | delta:20-24 defines the exclusion by the gauge's existing no-data attribute and the live requirement; delta:265-268 no longer says "every". See m2 below for a loose sentence the repair added. | 1.5 |
| m4 | FIXED | — | delta:32-36: the amber rule is about the extent; "no colour family other than amber and zinc"; design:330-336 agrees | 1.4 |
| m5 | FIXED | — | both first-preview scenarios carry the 80 t on 200 t GIVEN and a positive control (delta:305-320) | 3.3: "each arm ending with its positive control" (tasks:30) |
| m6 | FIXED | — | proposal:37 and tasks:68 (a) both say 2b "must MODIFY this change's lifetime requirement" under that option | 6.9 |
| m7 | FIXED | — | "pairwise unequal as sRGB values" with named sample points (delta:245-252); the text and attribute correspondence is stated (delta:226-229); the clamp sentence no longer says "marker" (delta:15-17); the process sentences are gone from the THEN. One leftover in tasks.md is m5 below. | 6.2, 3.8 |

Evidence for the claims the repairs rest on:

- M3's row is arrangeable. `SystemSpaceView.burn-preview.test.tsx` selects more than one target (`mock-select-${OTHER}`, `mock-select-point`, `mock-select-${STATION}`), and `mocks.preview` already takes per-call values (`:697`).
- M4's row is arrangeable and the tree gives the ruled reading. The harness has a `deferred()` helper (`:320`). In query-core 5.90.11, `fetchState` clears `error` only when `data === void 0` (`build/modern/query.js:388-396`), so a refetch over retained data keeps the error, `stale` holds at `use-burn-preview.ts:92-99`, and design:475-480 is correct. The stale state does offer "Retry quote" (`SpaceCommandPanel.tsx:332-339`), so the scenario's retry arm is inducible.
- The architect's three notes are applied: tasks:61 says 10 t at device scale factor 1 (`playwright.config.ts` sets none); delta:245-249 names the fill's sample point decidably; delta:47-48 and :159 state containment along the rail's length.
- Design.md agrees with the repaired delta and tasks on all ten alignment items. Decision 1's wrong-reader table names 3.5's row for `flag && cost <= fuel` and 3.4's restore row for `flag || cost <= fuel`, which is correct.

Malicious-implementer checks on the new clauses that found nothing:

- Mark position. A pull-back applied only at the clamp (`pct >= 100`) fails the 100 t row (expects 50). A mark with no transform fails at 100 t and 250 t. Nothing wrong passes at all of 0, 100 and 250 t short of a deliberately piecewise function.
- Rides. The four new scenarios each reuse an arrangement that already existed in its task (1.1's fixture plus one cost; 1.4's unaffordable render; 3.5's X-then-Y walk; 3.4's refresh walk). None is a separate arrangement group, so 39 stays an honest count. 2.2 is now the fullest task but is still one parametrised table over cost and flag on one strip.
- Vacuity. No new row is vacuous on its named harness: each is on the fuel-bearing fixture and each has a build that fails it.

---

## New findings

All MINOR. None lets a wrong build pass a row that the author would care about; four are wording or cross-document consistency, and one (m3) is a narrow gap between a scenario and its task.

### m1 — Three documents disagree about whether any tier observes the mark's pixel containment (RESIDUE of B1)

Clauses.

- tasks:18 (2.2): "the pixels and the rounded cap's clipping are left to the journey where it arranges an unaffordable overlay".
- design:315-316: "no part of the mark lies outside the rail, in pixels ... Held by: the journey, only where it arranges an unaffordable overlay".
- proposal:32: "what no tier observes is the mark's pixel containment (jsdom does no layout) and the rounded cap's clipping at the rail's ends".
- tasks:61 (6.2): the only mark assertion is "the mark's centre pixel against the extent and the fill".

Attack. Task 6.2 has no containment leg, so even a journey that arranges an unaffordable overlay never compares the mark's box with the rail's. Tasks 2.2 and design say the journey holds it; the proposal says nothing does; 6.2 sides with the proposal. This is the second half of B1 (documents disagreeing about what a tier asserts) surviving at lower stakes: tier 1 now kills the wrong build, so only the accounting is wrong.

A repair must achieve: one statement in all three. Either 6.2 gains the bounding-box comparison under the same "only if arranged, else UNTESTED" condition, or tasks:18 and design:315-316 say "no tier" as the proposal does.

### m2 — "this requirement places no rule on any other state of the fuel cell" contradicts the requirement's own SHALL (RESIDUE of m3)

Clause. delta:20-24: "The extent SHALL NOT be drawn while the gauge's existing state attribute reads its no-data value, a state that stays as *The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range Over a Gauge* and the live requirements it cites define it, and this requirement places no rule on any other state of the fuel cell."

Attack. Read literally, the last clause removes the requirement's rules from the rendered-fill and no-fill states, which are the states it exists to rule (delta:5-6, "SHALL draw ... one cost extent"). The intent is RULING 11's (no overlay rule of its own for the failed own-fleets state), but the sentence does not name that state. Separately, "the live requirements it cites" reaches only `figure-formatting` and `fleet-roster`; the failed-read absence round 1 pointed at lives in *The Vitals Strip Is Present on Every Render...* (live spec.md:39-45), which the fuel-cell requirement does not cite. No two engineers would build differently, so this is wording.

A repair must achieve: the clause naming what it disclaims (the definition of the no-data state, and any rule of this requirement's own for a failed own-fleets read), without a quantifier over "any other state".

### m3 — "at each side of the extent" is in the scenario and not in the task; an edge-aligned band passes 1.1 (RESIDUE of M1)

Clauses.

- delta:92-94: "the extent's height is less than the rail's height while the fill's height is the rail's, so that part of the rail's height at each side of the extent is not covered by it".
- tasks:5 (1.1): "the fill spans the rail's height and the extent does not, so a full-height extent fails".

Attack. A band flush with the rail's top edge (2 px high, no gap above) is not full-height, so it passes 1.1 as written. It breaks the scenario's "at each side", and it leaves the journey's fallback sample, "a point of the fill above the extent" (delta:248, tasks:61), with nothing to sample. The scenario's "so that" does not follow from "less than the rail's height" alone. Design:304 would catch it (`inset-y-0.5` asserted), but that is design text and tasks.md is what the SDET is held to.

A repair must achieve: 1.1 asserting the extent is inset from both the rail's top and its bottom edge; it stays in 1.1's arrangement.

### m4 — "differing" colour tokens is defined twice, and neither definition compares the shades (RESIDUE of M2)

Clauses.

- tasks:8 (1.4): "the mark's colour tokens differing from the unaffordable extent's".
- design:311 and :353-354: "share none with `bg-amber-800 dark:bg-amber-600`".

Attack. "Differing" admits set inequality: a mark of `bg-amber-800 dark:bg-amber-600 border-amber-800` differs from the band's set by one token and is the band's colour throughout. Design's stricter "share none" still passes `border-amber-800 bg-amber-800` on a mark whose background utility is renamed, because it compares token strings and not shades. The ruled design is not at risk (its eight tokens are fixed in Decision 6), so this is a looseness in the test's stated criterion only.

A repair must achieve: one criterion in tasks 1.4 and design: in each scheme the mark's background shade (family and step) is not the unaffordable extent's background shade.

### m5 — Three small leftovers (RESIDUE of m7, the design alignment and M4)

- tasks:6 (1.2): "cost 250 and cost 200 both give 100 % with no marker". The delta dropped "marker" for the clamp under m7; the task kept it, beside tasks that call the unaffordable element "the mark". With the flag false at those costs the mark is present, so "no marker" should read as the delta does (nothing drawn that a cost of exactly 200 does not draw).
- design:586-587: "The wrong reader that no test catches is the second, identical derivation (Decision 1, row 2)". The alignment inserted the request-in-flight row, so that reader is now row 3 and row 2 is one a test does catch.
- delta:343-344: the WHEN reads "the next refresh, or the command panel's retry"; tasks:31 walks the refresh arm only. No build inside this change's fences can separate the two (both are `query.refetch()` in a hook RULING 18 forbids editing), so nothing is at risk; 3.4 can either add the retry click or the task can say the retry arm is held by the unedited hook.

---

## Verdict

**CLEAR** — no material findings. Only 5 MINORs remain (m1-m5), all residue of round-1 repairs, and I do not consider any of them material: none permits a build that crosses a fence or contradicts a ruling, and each can be closed by a wording edit to tasks.md, design.md or one delta sentence without a new task or a new scenario. Whether closing them needs another adversary pass is the orchestrator's call under the team's rule that a spec edit expires a prior verdict; m2 is the only one that touches the delta.

## Orchestrator rulings


Orchestrator, 2026-10-05. Round 2 is **CLEAR**: all twelve round-1 findings
FIXED; five MINORs, all residue of round-1 repairs, none material. They are
nonetheless repaired rather than carried, because m3 would let a top-aligned
band starve the journey's own sample point. Because the repair edits the change
folder, the round-2 verdict does not cover the edited sentences: **round 3 (the
last) is a spot-check of exactly that diff**, taken against a snapshot of the
round-2 content (`r2-snapshot`, session scratchpad; the diff is written to
`add-burn-cost-overlay-r2-to-r3.diff` in this directory). No verdict commit is
recorded at round 2; the verdict commit is recorded at round 3.

Binding directions:

- **m1 — accepted.** One statement in all three documents: the mark's
  containment *as rendered pixels* is asserted at no tier; tier 1 holds the two
  position components that containment reduces to, and review holds the rest.
  The journey has no containment leg and none is added.
- **m2 — accepted.** The disclaimer names what it disclaims — the fuel cell
  while the own-fleets read's most recent attempt has failed (RULING 11) — and
  nothing broader; the "live requirements it cites" phrase is corrected or cut.
- **m3 — accepted.** Task 1.1 asserts the extent leaves the rail uncovered on
  BOTH sides of its height (above and below), as the scenario says.
- **m4 — accepted.** One criterion in tasks 1.4 and design.md: in each colour
  scheme the mark body's background shade is not the unaffordable extent's
  background shade (a shade-level inequality, per scheme), not a comparison of
  whole token strings.
- **m5 — accepted.** "no marker" removed from the tasks preamble; design.md's
  row citation corrected; the pending-after-failure scenario is narrowed to the
  arm task 3.4 walks (the next refresh), the retry arm being
  `system-space-view`'s to state.

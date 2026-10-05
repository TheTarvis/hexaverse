# `add-burn-cost-overlay` — adversary round 3

- Change: `openspec/changes/add-burn-cost-overlay/` (link 2a-iv of `docs/plans/system-hud/chain.md`)
- Round: 3 of 3 (the last the cap allows)
- Date: 2026-10-05
- Base commit: `d965f5d`; the change's content is uncommitted
- Scope: a spot-check of `docs/handoffs/add-burn-cost-overlay-r2-to-r3.diff` only (148 lines, the round-2 snapshot against the current change folder). Nothing rounds 1 and 2 recorded as sound was re-attacked unless the diff touched it.
- Read whole: `add-burn-cost-overlay-adversary-r2.md` with its binding directions, the diff, the current delta and tasks.md. Read in part: design.md (Decisions 1, 5's observation table, 6, 8, 11, Risks), proposal.md:32, the rulings index and RULING 11, live `system-console` (failed own-fleets read wording), live `system-space-view` (retry affordance).
- Checks run, all read-only: the diff was regenerated from the snapshot and is identical to the recorded one, hunk for hunk; `openspec validate add-burn-cost-overlay --strict` is valid; `harness/openspec-reconcile.py add-burn-cost-overlay` reports OK; 40 scenarios, 39 unchecked tasks. No suite, stack or state-changing git command was run.

Paths below: `delta` = `openspec/changes/add-burn-cost-overlay/specs/system-console/spec.md`; `tasks`, `proposal`, `design` are the files beside it.

Summary: four of the five round-2 MINORs are fixed and one (m4) is partially fixed. Every hunk traces to one of the five. The edits introduced no contradiction, no undecidable THEN, no orphaned or vacuous scenario or task, no crossed fence and no reopened ruling. One MINOR remains (n1, the unfixed part of m4) and it is not material.

---

## Round-2 residues m1–m5

| Id | Status | Direction | Lines that close it |
| --- | --- | --- | --- |
| m1 | FIXED | One statement in all three documents: rendered-pixel containment is asserted at no tier; tier 1 holds the two position components; review holds the rest; the journey has no containment leg. | tasks:18 (2.2): "the mark's containment as rendered pixels, and the rounded cap's clipping, are asserted at no tier and are held by review, the journey having no containment leg". design:315: "no tier. Task 2.2 holds the two components; review holds the rest. The journey has no containment leg."; design:316: "no tier; review"; design:527: "asserted at no tier and are held by review; the journey samples the mark's centre pixel only"; design:579-581: "asserted at no tier and are held by review". proposal:32: "what no tier asserts is the mark's containment as rendered pixels (jsdom does no layout, and the journey has no containment leg) ...; tier 1 holds the two position components that containment reduces to, and review holds the rest". tasks:61 (6.2) is unchanged and has no containment leg, which now agrees with all three. The delta took no edit and needed none. |
| m2 | FIXED | The disclaimer names what it disclaims (the fuel cell while the own-fleets read's most recent attempt has failed, RULING 11) and nothing broader; the "live requirements it cites" phrase is corrected or cut. | delta:20-24: "a state that stays as *The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range Over a Gauge* defines it, and this requirement writes no rule of its own for the fuel cell while the own-fleets read's most recent attempt has failed." The quantifier over "any other state" is gone, the citation phrase is cut, and "the own-fleets read's most recent attempt has failed" is the live spec's own wording for that state (live `system-console` spec.md:103, :168, :203, :255). It matches RULING 11's title ("the overlay gets no rule of its own for that state"). Only the delta carried this sentence. |
| m3 | FIXED | Task 1.1 asserts the extent leaves the rail uncovered on both sides of its height. | tasks:5 (1.1): "the fill spans the rail's height and the extent is inset from both the rail's top edge and its bottom edge, leaving rail uncovered above and below it, so a full-height extent and an edge-aligned extent both fail". design:304: "the band is part-height, leaving the rail uncovered both above and below it ... `inset-y-0.5`, which insets it from both the rail's top edge and its bottom edge". This agrees with delta:92-94 ("at each side of the extent"), which is unchanged. The round-2 wrong build (a 2 px band flush with the top edge) now fails 1.1. |
| m4 | PARTIALLY | One criterion in tasks 1.4 and design.md: per colour scheme, the mark body's background shade is not the unaffordable extent's background shade. | Closed in three places. tasks:8 (1.4): "in each colour scheme, the mark body's background shade (family and step) not being the unaffordable extent's background shade". design:311: "per colour scheme, the mark body's background shade is not the unaffordable band's background shade: `amber-500` against `amber-800` in the light scheme, `amber-400` against `amber-600` in the dark scheme". design:353-356: the same sentence with the same four shades, which match Decision 6's table. Not closed in two places the diff did not touch: design:528 and proposal:32 still state the old token-level wording. See n1. |
| m5 | FIXED | "no marker" removed from the tasks text; design's row citation corrected; the pending-after-failure scenario narrowed to the arm task 3.4 walks. | (a) tasks:6 (1.2): "cost 250 and cost 200 both give 100 % with nothing drawn that a cost of exactly 200 does not draw", which is the delta's own phrase at delta:167-168. (b) design:591: "(Decision 1, row 3)"; row 3 of Decision 1's table is the second identical derivation with "none. Review only." (c) delta:343: "**WHEN** the next refresh has been sent and has not answered"; design:481: "while the next refresh is pending"; tasks:31 (3.4) walks exactly that arm ("the next refresh, sent and not answered, still draws no overlay and no ceiling"). |

Checks behind the FIXED rows:

- m2. The narrowed disclaimer does not open a gap. In the failed own-fleets state the live strip scenario already has the fuel cell "show the absent form exactly as the no-acting-fleet case does" (live spec.md:39-45), and the drift between that and the code is RULING 11's, filed and out of this link. The disclaimer conflicts with neither the content requirement's "SHALL draw" nor the lifetime requirement, which keys on the preview read and not on the own-fleets read.
- m5(c). Narrowing the scenario drops no behaviour. The requirement prose still covers a pending request of either origin: "an overlay withdrawn by a failed refresh stays withdrawn until a refresh succeeds" (delta:278-279). The scenario title is unchanged, so tasks:31 still cites it whole and reconcile is clean. The retry affordance itself is stated by live `system-space-view` (spec.md:742-746), which this change does not touch.
- m5(a). For the cost-200 arm the new phrase reads as a comparison of the 250 render with the 200 render, as delta:166-169 does. It is not a second assertion on the 200 render and is not a finding.
- m3. `inset-y-0.5` does set both `top` and `bottom`, so design:304's added clause is accurate.

---

## Hunk traceability

Every hunk in the diff traces to one of the five. No changed line is untraced.

| File | Hunk (current lines) | Traces to |
| --- | --- | --- |
| design | 304, band part-height row | m3 |
| design | 311, mark paint row | m4 |
| design | 315-316, containment and cap rows | m1 |
| design | 353-356, Decision 6 closing sentence | m4 |
| design | 481, "while the next refresh is pending" | m5 (c) |
| design | 527, Decision 11 mark row, third column | m1 |
| design | 575-582, Risks, "The mark may reach no rendered tier" | m1 |
| design | 591, "Decision 1, row 3" | m5 (b) |
| proposal | 32, Q4 cost sentence | m1 |
| delta | 20-24, disclaimer | m2 |
| delta | 343, WHEN of the pending-after-failure scenario | m5 (c) |
| tasks | 5 (1.1) | m3 |
| tasks | 6 (1.2) | m5 (a) |
| tasks | 8 (1.4) | m4 |
| tasks | 18 (2.2) | m1 |

The design:575-582 hunk also rewords the sentence on the band-past-the-fill arrangement ("is likewise sampled only if arranged", formerly "The same holds for"). That is a rephrase forced by the m1 rewrite of the paragraph, it agrees with tasks:61, and it changes no claim.

---

## Attack on the changed sentences

Nothing found beyond n1.

- Contradiction with the delta or a live sentence: none. The two delta edits are a narrowed disclaimer and a narrowed WHEN; neither adds a rule.
- Undecidable THEN: none. No THEN was edited. The edited WHEN is inducible on the named harness (round 2 verified the `deferred()` helper and the retained-error behaviour).
- Orphaned or vacuous scenario or task: none. 40 scenarios and 39 tasks as before; no title changed; each of tasks 1.1, 1.2, 1.4 and 2.2 still has a build that fails it. 1.1 now fails two wrong builds where it failed one.
- Fences: none crossed. No backend. No client-side affordability or shortfall arithmetic: the shade comparison in 1.4 is between static class tokens. No strip text. The four shades named (`amber-500`, `amber-800`, `amber-400`, `amber-600`) are amber, and no token was added to Decision 6's set of eight.
- Rulings: none reopened. m2 restates RULING 11; m1 stays inside RULINGs 14 and 16 (no journey leg added); m5(c) leaves RULING 18's files unedited.

### n1 — The token-level wording m4 named survives in two sentences the diff did not touch (MINOR, residue of m4)

Clauses.

- design:528 (Decision 11's harness map, the task 1.4 row): "class family and dark counterparts for band and mark (Decision 6's set); no other colour family; the mark's colour tokens differ from the unaffordable band's".
- proposal:32: "Tier 1 asserts ... the band's part height, and that the mark's colour tokens differ from the unaffordable band's."
- Against tasks:8, design:311 and design:353-356, which now state the per-scheme background-shade inequality.

Attack. The direction was one criterion in tasks 1.4 and design.md. Design now states it two ways: shade-level at :311 and :353-356, token-level at :528. Proposal:32 repeats the token-level form. "Colour tokens differ" is the looseness round 2 named (set inequality admits a mark in the band's shade with one extra token). The two forms do not contradict each other, because the shade-level criterion entails the token-level one, and tasks:8, which is what the SDET is held to, carries the strict form. So no wrong build passes a row because of this; an SDET reading design:528 alone would be corrected by the task and by design:311.

A repair must achieve: design:528 and proposal:32 stating the same per-scheme background-shade inequality, or pointing at design:311 for it, with no "tokens differ" wording left. It is a wording edit to two summary sentences and touches neither the delta nor tasks.md.

---

## Verdict

**CLEAR** — no material findings; the spec is implementation-ready. m1, m2, m3 and m5 are FIXED and m4 is PARTIALLY fixed. The one thing remaining is n1 (MINOR): two summary sentences, design:528 and proposal:32, keep the old "colour tokens differ" wording beside the repaired criterion. It is not material: it contradicts nothing, the binding task text is correct, and it permits no wrong build. Closing it would edit design.md and proposal.md only, which the round cap leaves to the orchestrator's ruling.

## Orchestrator rulings

Orchestrator, 2026-10-05. Round 3 is **CLEAR**; the adversary loop closes at
the cap (3 of 3). m1, m2, m3, m5 FIXED; m4 fixed in the binding text
(tasks 1.4, design Decisions 5–6). **n1 is carried unedited** — FULL-AUTO
RULING 20 (`add-burn-cost-overlay-rulings-index.md`): two summary sentences
(`design.md:528`, `proposal.md:32`) keep token-level wording; tasks 1.4's
shade-level criterion binds. No edit is made to the change folder after this
round, so the verdict covers the committed content exactly.

## Verdict commit

`65f2aef` — the change folder and handoffs as cleared at round 3. Currency
check: `git diff 65f2aef -- openspec/specs/system-console openspec/specs/system-space-view openspec/specs/figure-formatting openspec/changes/add-burn-cost-overlay`
must be empty before the build starts and again before archive.

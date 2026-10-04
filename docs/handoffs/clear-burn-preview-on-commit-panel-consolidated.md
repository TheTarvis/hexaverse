<!-- reduction-receipt: volt_reduction_v1
# Written by harness/check-quote-fidelity.py --write-header; do not hand-edit.
# Every source below is pinned by content hash. If one of them changes, this
# reduction is a claim about a file that has moved on: re-verify it with
# --verify-header and re-reduce before anything downstream trusts it.
source=docs/handoffs/clear-burn-preview-on-commit-panel-architect.md sha256=d2d939ad17d01f8f8c154040737145e802a24e48c74c6325af05a3c02c1a39e4 bytes=27694 lines=458
source=docs/handoffs/clear-burn-preview-on-commit-panel-ux.md sha256=035a48efc0416820c66e861c6298110eb1661861fbf30cb049c43c234f4a60ec bytes=19555 lines=152
source=docs/handoffs/clear-burn-preview-on-commit-panel-security.md sha256=235d6a7821745b8f08dfd8e3cdff73d5c090accb862e24c3d2079b3633548eff bytes=8660 lines=157
source=docs/handoffs/followup-explain-withheld-burn-command.md sha256=257fcb31b2bae6b130927572f72aae41ac6a1c07265524566c233946c70d6173 bytes=4735 lines=84
source=docs/handoffs/clear-burn-preview-on-commit-panel-architect-addendum-2.md sha256=9713de14f0a7d7b9f5907baf36585a2fe59ed1bbe303cee16a84f93d3ab24847 bytes=3238 lines=28
source=docs/handoffs/clear-burn-preview-on-commit-panel-architect-addendum.md sha256=927b9d6478e30c8a182e1789aad18dec4eaab5a630f3b93e525c2d3b51964dea bytes=2229 lines=17
authority=the orchestrator retains adjudication; this file is evidence, not a ruling
readback=sed -n '<start>,<end>p' <source> — each quote marker carries its line
-->
# Panel consolidated — `clear-burn-preview-on-commit` (2026-10-04)

Orchestrator's dispositions on the three panel reports. **This file restates no
finding.** Each reviewer's own report is persisted and is the text the writer
applies; this file says, per finding id, whether it is accepted and where the
tie-break fell. Authority: orchestrator rulings under `--full-auto`
(`docs/handoffs/clear-burn-preview-on-commit-rulings-index.md`, RULINGs 8–12).

Sources (read each whole — the paste-ready text lives there):

- `docs/handoffs/clear-burn-preview-on-commit-panel-architect.md` — A1–A12
- `docs/handoffs/clear-burn-preview-on-commit-panel-ux.md` — F1–F6
- `docs/handoffs/clear-burn-preview-on-commit-panel-security.md` — S1, and its
  "Note for the UX reviewer"

## Dispositions

| Id | Severity | Disposition |
| --- | --- | --- |
| A1 | MAJOR | ACCEPT — apply the architect's two cross-reference fixes as given. |
| A2 | MAJOR | ACCEPT — the point/gate clause on scenario 11, the row on task 3.11, the second point trigger in task 1.1. No new task. |
| A3 | MINOR | ACCEPT — the one-sentence definition of "uncommitted". |
| A4 | MINOR | ACCEPT — move the landing-announcement clause to scenario 8 and task 3.8; task 3.17 becomes one arrangement. This is what keeps the count at 40 (RULING 12). |
| A5 | MINOR | ACCEPT — delete task 2.1's hand-set "after a successful commit has settled" leg. |
| A6 | MINOR | ACCEPT — clauses in tasks 7.1 and 6.2 for the no-query-state case and the mocked-harness trap (RULING 9). |
| A7 | MINOR | RECORD ONLY — already in design.md Risks; no spec or task text. |
| A8 | MINOR | ACCEPT — the clause on task 6.2 for link 2b. |
| A9 | MINOR | ACCEPT the names (prop `selectionCommitted`, test id `selection-committed-statement`, payload field `selectionKey`) and "one string for every selection kind". The **copy** is UX F1's, not the architect's default (tie-break: UX wins on user-observable behaviour; RULING 10). |
| A10 | MINOR | RECORD ONLY — orchestrator carries it into the chain doc's Taught record for link 4. The hook file is not opened. |
| A11 | MINOR | ACCEPT — the clause on task 7.3. |
| A12 | MINOR | RULED — RULING 12: the two repair tasks are two; shedding room is two tasks (3.16, then 3.9). |
| F1 | MAJOR | ACCEPT — the copy, the placement (immediately before Burn in reading order) and the AND clauses on "The statement carries no figure and no wire text" / task 2.3. The spec pins intent; the string goes in design.md (the architect updates it at kickoff; the writer does not edit design.md). RULING 10. |
| F2 | MAJOR | ACCEPT — `aria-describedby` to the statement while it shows; one AND on scenario 1 / task 2.1. |
| F3 | MAJOR | ACCEPT IN FULL — the "Focus" paragraph AND the scenario heading. The scenario has no tier-1 task; tasks.md marks it covered by the journey's keyboard leg inside task 7.3 (jsdom cannot judge it). No new task. RULING 11. |
| F4 | MINOR | ACCEPT — the sentence "the statement SHALL NOT be a live region" and the AND clause on task 2.3. |
| F5 | MINOR | ACCEPT — the one sentence (the statement is shown while the canvas is unavailable) and the clause on task 2.1. |
| F6 | MINOR | ACCEPT — the clause on task 6.3 adding a dated note to `followup-explain-withheld-burn-command.md` that the arrival contrast is new. A note in a filed follow-up is not absorbing it. |
| S1 | MINOR | ACCEPT — the "client presentation rule only" sentence appended to the "Only this view's commits" paragraph. |
| S-note | — | ACCEPT — one AND on "Cutting the drive ends the committed selection" inside task 3.5: the uncapped-burn label is shown while the resumed request is pending. |

## Rulings the writer authors from

- Failed own-fleets read: option (b) for every consumer, with the architect's
  wording fix ("the three things this state governs" must not count the
  notice). RULING 8.
- RULING 6 is confirmed and no longer provisional; Double-Submit stays MODIFIED
  with no new scenario; the predecessor's "does not disable the burn control"
  clause is a recorded reading; the handler keeps `undefined` when the
  own-fleets query has no state. RULING 9.

## Conflicts resolved

- Statement copy: architect default "An order is committed to this target." vs
  UX F1's two-sentence copy with the reason and the exit → UX (F1's collision
  with the stranding notice's fixed copy is the reason).
- No other conflict: all three agree on option (b), on placement before the
  control, and on `aria-describedby`.

## Count

40 tasks after A4. Nothing else adds an arrangement.

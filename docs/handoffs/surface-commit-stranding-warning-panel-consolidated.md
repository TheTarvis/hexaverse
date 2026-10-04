<!-- reduction-receipt: volt_reduction_v1
# Written by harness/check-quote-fidelity.py --write-header; do not hand-edit.
# Every source below is pinned by content hash. If one of them changes, this
# reduction is a claim about a file that has moved on: re-verify it with
# --verify-header and re-reduce before anything downstream trusts it.
source=docs/handoffs/surface-commit-stranding-warning-panel-architect.md sha256=1ccf9318dd3a83c68cc358aa479ba814392dab57993ad807eae2c39e8cb65dcc bytes=28748 lines=462
source=docs/handoffs/surface-commit-stranding-warning-panel-ux.md sha256=fd277e865e73c3066dedef7141ef5380985775f02832ad5581558bf643dbf087 bytes=16901 lines=236
source=docs/handoffs/surface-commit-stranding-warning-panel-security.md sha256=653dff651184928ec66ec515418cab7e5d4eae669e532b6efdef30a80277fc12 bytes=4818 lines=54
authority=the orchestrator retains adjudication; this file is evidence, not a ruling
readback=sed -n '<start>,<end>p' <source> — each quote marker carries its line
-->
# `surface-commit-stranding-warning` — panel findings, dispositions

**This file is a disposition table, not a reduction.** It restates no finding:
the reviewers' own reports are on disk and are the source of every quoted
passage and every paste-ready text. The writer reads all three reports whole
and applies each finding as disposed below. Binding rulings:
`surface-commit-stranding-warning-rulings-index.md` (RULINGs 5–11).

Sources:
- `docs/handoffs/surface-commit-stranding-warning-panel-architect.md` (A1–A14)
- `docs/handoffs/surface-commit-stranding-warning-panel-ux.md` (F1–F6)
- `docs/handoffs/surface-commit-stranding-warning-panel-security.md` (no findings)

Tie-breaks applied: architect on technical shape, UX on user-observable
behaviour. No finding conflicts with the design input.

| Finding | Disposition |
| --- | --- |
| A1 | ACCEPTED — apply the architect's task 4.2 text. The delta states behaviour, not the answer-count instrument (RULING 7). |
| A2 + F1 | ACCEPTED, merged (RULING 5). Use the architect's replacement for the last sentence of "The gap" and the architect's proposal-table row. ONE scenario, walked in sequence, replaces "A failed first read ends the gap and removes the notice": the first read after the acceptance fails → notice still shown, fleets-error notice and retry shown; a read then answers with the committed burn's instants → still shown; a later read fails → still shown; a later read answers with the fleet parked and no burn → removed. Name it so it covers both phases (e.g. "A failed read never removes the notice"). Task 3.8 is rewritten to that one arrangement (RULING 11 ii). UX's sentence for "The lag" is superseded by A3's replacement paragraph, which already says it. |
| A3 | ACCEPTED — the architect's replacement "The lag" paragraph, whole. |
| A4 + F5 | ACCEPTED, merged (RULING 10). The architect's sentence, scenario and tasks 1.4 and 3.16. |
| A5 | ACCEPTED — the architect's "Whose notice" paragraph, with the `[pending panel: Q5]` marker removed (ruled: whatever is selected); "It renders no figure." |
| A6 | ACCEPTED — task 2.1 wording. |
| A7 | ACCEPTED — tasks 2.2, 3.2, 3.15 as given. |
| A8 | ACCEPTED — split 3.3 and 3.14 as given; report the honest count (RULING 11). |
| A9 | ACCEPTED — task 4.1 as given and the `useCallback` sentence on 4.2. |
| A10 | ACCEPTED — the Fan-In row. |
| A11 | ACCEPTED — add the 2b note to task 5.2's Taught content. |
| A12 | ACCEPTED — the proposal bullet. |
| A13 | ACCEPTED (RULING 8 i) — tasks 1.5 and 4.3 as given, with the copy no longer "working": the strings of RULING 9, recorded in design.md. Task 1.5 and the scenario "The notice is advisory and distinct from the preview's stranding line" also carry F3's element properties (below). |
| A14 | ACCEPTED — the proposal sentence. |
| F2 | ACCEPTED (RULING 8 iii). UX's replacement sentences for "It is static…", with placement wording per A13 ("below the burn command control in the command panel"). Scenario "The warning is conveyed once, at the acceptance": added, with one new panel-level task (the toast is fired from the panel's success callback: one `toast.warning` on a warned response, none on an unwarned one, the success toast still exactly once). "Later changes to the notice raise no announcement": NOT a new scenario — its THEN (no further toast, live-region text unchanged) joins the existing scenario/tasks that already arrange removal by a read and the switch away and back. "The player who switched fleets still learns of the warning": folded into the existing "A response that lands after the acting fleet changed…" scenario as an extra THEN, as UX offers. Update "The success feedback is not suppressed by the notice" as UX says. |
| F3 | ACCEPTED IN PART (RULING 11 iii). The sentences "It is not dismissible: its only end is the order's." and that its appearing or removal does not remove, disable or re-order the burn command control are added to "What the notice is". No separate scenario: the scenario "The notice is advisory and distinct from the preview's stranding line" gains "AND the burn command control is still present and precedes the notice AND the notice offers no dismiss control". The cut-drive and stop controls live in a different card and are not asserted. "It names what the player can do" is carried by the copy (RULING 9) and the copy scenario. |
| F4 | DECLINED (RULING 11 i) — unobservable: a fleet absent from the own-fleets read cannot be the acting fleet, and the notice is shown only for the acting fleet. No text. |
| F6 | ACCEPTED (RULING 9) — UX's three THEN lines replace the copy scenario's. |
| Security | No findings; nothing to apply. |

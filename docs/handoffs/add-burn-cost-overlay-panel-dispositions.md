# add-burn-cost-overlay — panel dispositions (orchestrator, 2026-10-05)

This is NOT a reduction of the panel reports. The reports are persisted whole
and stay authoritative for every finding's evidence and paste-ready text:

- `docs/handoffs/add-burn-cost-overlay-panel-architect.md` (A1–A13)
- `docs/handoffs/add-burn-cost-overlay-panel-ux.md` (U1–U8, notes N1–N4)
- `docs/handoffs/add-burn-cost-overlay-panel-security.md` (S1)

The writer reads all three whole and applies each finding as disposed below.
Authority: FULL-AUTO RULINGs 15–19 (`add-burn-cost-overlay-rulings-index.md`).
Tie-breaks: architect on technical shape/boundaries, security on controls, UX
on user-observable behaviour.

| Finding | Disposition |
| --- | --- |
| A1 (BLOCKER) + S1 | **Accept A1's paste-ready text** (one-way; no SHALL on the ceiling). Add S1's protection as a sentence about this surface only: the absence of an overlay is never a reason to withhold or alter anything another requirement presents for that quote. Use A1's replacement scenario; do NOT add a scenario whose THEN asserts the ceiling's presence beyond what A1's text supports. |
| A2 | **Accept** A2's clause and scenario verbatim (condition on what the view supplies; both flag values). |
| U5 | **Superseded by A2** (same defect, A2's shape). Its "both values" point is in A2's scenario. |
| U6 | **Not adopted as written** — its AND binds the panel line from `system-console`. The dry-fleet case stays covered by the no-data scenario (RULING 15). |
| A3 + U3 | **Merge.** Journey-judged scenario uses A3's GIVEN (lengths the reads serve; extent-past-fill only if arranged, else untested) with a measurable THEN from U3: the sampled rendered colours of the fill, the extent and the rail differ pairwise in the colour scheme rendered. No 3:1 gate (RULING 16); the journey record states the measured ratios. Add U3's tier-1 proxy scenario (amber- or zinc-family only; each colour class carries its dark-scheme counterpart) WITHOUT its "the gate passes" AND (A8: the colour script does not check families). |
| U1, U2 + A9 | **Accept (RULING 16).** The unaffordable mark: A9's structural wording (drawn separately from extent and fill; wholly inside the rail at every cost incl. zero and at/above capacity; "a single element" removed), U1's behavioural clause minus "at its end … child" structure, U1's sub-pixel scenario, U2's sentence and its two flag-wins scenarios with the mark-present/absent ANDs. Partial-height band per U1's first sentence. |
| U4 | **Accept** the scenario; its test rides the existing failed-refresh/restore walk (no new task). |
| U7 | **Accept** the SHALL (inside the hidden gauge; never animated or transitioned) and scenario; its test rides the decorative-invariants task. |
| U8 | **Not adopted** — a refused commit enters no committed state by `system-space-view`'s own rule; restating it here is what the lifetime requirement says it does not do (RULING 19). |
| A4 | **Accept option 1** (RULING 17): remove the canvas-unavailable scenario and its task; proposal notes the state is drawn by construction and unpinned, owned by `followup-explain-withheld-burn-command.md` F3. UX's Q5 scenario is therefore not added. |
| A5 | **Accept**: drop the non-boolean-flag clause, scenario and half-task. Keep the degenerate-cost guard. |
| A6 | **Accept**: drop task 5.1. |
| A7 | **Accept sheds S1–S8** and the S5 replacement task text; apply the two wording notes (3.3, 4.5). Target after the mark's one added group: **39 tasks, honest count, hard cap 40.** |
| A8 | **Accept**: fold 1.8 into the per-commit gate task; do not credit the colour script with family checks. |
| A10, A11, A12, A13 | **Accept** each paste-ready replacement. |
| Q7 | No scenario; design.md records the asymmetry (RULING 18). |
| Forward flags for link 2b | Keep the proposal's forward flag with A2's rewording; add UX's Q4 forward note (collapsed dock leaves the `aria-hidden` extent the only on-screen carrier; 2b must say what a keyboard or screen-reader user gets, and keep the mark) and security's note (2b's own-ness deny scenario also asserts no cost extent and no extent state attribute). These are text for the gate task that writes the chain doc, not requirements here. |
| UX N1–N4 | Notes for Travis; carried into the orchestrator's report. No spec change. |

design.md (architect-owned) is being revised in parallel for RULING 16's band
and mark and the tone classes; the spec text stays at behaviour altitude and
names no class, attribute or file.

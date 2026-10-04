# Panel consolidated — `fix-burn-order-geometry-refusals`

Panel: architect, ux, security, reliability (dba not included: no stored shape changes).
**The findings themselves are NOT restated here.** Each reviewer's own report is persisted
verbatim beside this file and is the text the writer applies:

- `fix-burn-order-geometry-refusals-panel-architect.md` (0 BLOCKER, 4 MAJOR, 7 MINOR) + `openspec/changes/fix-burn-order-geometry-refusals/design.md`
- `fix-burn-order-geometry-refusals-panel-ux.md` (0 BLOCKER, 3 MAJOR, 2 MINOR)
- `fix-burn-order-geometry-refusals-panel-security.md` (0/0, 3 MINOR, 2 ADVISORY)
- `fix-burn-order-geometry-refusals-panel-reliability.md` (0 BLOCKER, 3 MAJOR, 4 MINOR)

This file holds only the disposition of every finding and the tie-breaks between reviewers.
A finding marked ACCEPT is applied from the reviewer's own paste-ready text, as modified by the
tie-break noted.

## Dispositions

| Finding | Disposition |
| --- | --- |
| Architect MAJOR 1 (mirror-map inventory vs "fixtures untouched") | ACCEPT — FULL-AUTO RULING 9: add the hand-maintained inventory entry; task 6.2's empty-diff check is narrowed to recorded fixture files |
| Architect MAJOR 2 (same reason on every route; serve the sentinel's own text, not the wrapped `err.Error()`) | ACCEPT. Merges Security MINOR 3 (reason text fixed, never echoing the request's body id) — apply both |
| Architect MAJOR 3 ("Leaves No Trace" unsatisfiable: pre-solve settlement) | ACCEPT, merged with Reliability M1 below (rename + exception clause) |
| Architect MAJOR 4 (equality boundary cannot be arranged at site selection) | ACCEPT. Supersedes Reliability M2's "0.1 test floor": the tightest margin is the architect's 0.08 (parent type matters), so the floor comes from design.md decision 10, not 0.1 |
| Architect MINORs (outcome table is rocky-only — enumerate parent type; task 1.9 mostly moot; both endpoints inside → origin reason wins, one sentence + one scenario; origin needle above the legacy star-clearance lines; zero-refusal scenario bounds the other endpoint; min-arc on stop unreachable, delta right; hygiene nothing) | ACCEPT all |
| UX MAJOR 1 (stop routes its errors through the mine copy table; add the requirement + two scenarios; reword 3.1/3.2) | ACCEPT. The ADDED requirement goes in `docked-fleet-actions` or `fleet-movement` — NOT `system-space-view` (the active change `clear-burn-preview-on-commit` touches it) |
| UX MAJOR 2 (refused preview shows the mapped reason and hides Retry) | REJECT for this change — FULL-AUTO RULING 10: it is a presentation change to the no-quote state, already filed as `followup-explain-withheld-burn-command.md` and out of scope per analysis section 11; a task-only UI behaviour change with no delta breaks spec-first, and its delta would land in `system-space-view`. A records task appends this finding to that follow-up |
| UX MAJOR 3 (substring mis-routing) | ACCEPT, using the ARCHITECT's exact reason strings and key fragments (design.md decision 6) — architect wins on shape; UX's scenario (no reason contains another's key fragment or `not found`) and the test on the real backend strings are kept |
| UX MINOR 1 (copy wording) | ACCEPT, with Reliability M3's note: the origin/destination copy must not read as permanent. FULL-AUTO RULING 11: the legacy `star-clearance` needle is replaced by the two new needles, destination keeping the existing copy line |
| UX MINOR 2 | no action (no spec text needed) |
| Security MINOR 1 (foreign-fleet deny scenario across all three routes, foreign and corpless, refusal-triggering payloads) | ACCEPT |
| Security MINOR 2 (broken parent chain of a present target must stay a logged 500, not the quiet 404) | ACCEPT |
| Security MINOR 3 | ACCEPT (merged with Architect MAJOR 2) |
| Security ADVISORY A (out-of-extent point note states both outcomes and the fix shape) | ACCEPT into task 5.4; the note's file name is `docs/handoffs/defect-point-target-extent-unvalidated.md` |
| Security ADVISORY B (info-level log permitted) | merged into Reliability M1 |
| Reliability M1 (served refusals leave a below-error log entry with cause, route, fleet, system; rename the requirement) | ACCEPT — tie-break: reliability's observability requirement stands over the architect's "no log line" default (design.md open question 2 answered: ONE below-error entry for every served refusal, origin included, no separate warn level). Consistent with RULING 5. design.md decision 5 is revised to match |
| Reliability M2 (pin the pass/fail table as the invariant; predicate pinned to the solver's own functions; fixed sweep grid and ids) | ACCEPT, with the architect's corrections above (table by parent type × ring × star class; 0.08) |
| Reliability M3 (residual stated honestly: intermittent, rates, stranded false alarm, refused stop, 9.7% of mineable systems; design.md Risks; task 5.5) | ACCEPT — task count 34 |
| Reliability m1 (scenario: criterion (d) as the cause of exhaustion) | ACCEPT |
| Reliability m2 (named accounts in 1.9; 4.1 FAILS on a geometry refusal at a qualifying home; injected world clock in 2.3/2.4) | ACCEPT |
| Reliability m3 (one shared literal per reason pinned on both sides) | ACCEPT (same as design.md decision 6's two pinning tests). The claude-agent's handling of the new 4xx bodies is unverified and out of scope; recorded in the proposal's residual list |
| Reliability m4 (no migration, reversible, deploy order irrelevant — stated in proposal) | ACCEPT |

Resulting size: 34 tasks (+1 if the follow-up append is its own task) of the 40 cap.

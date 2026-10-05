# `keep-console-tab-content-mounted` — panel dispositions

Orchestrator, 2026-10-05. This file is NOT a reduction of the panel reports and
restates no finding. It records, per finding id, accept / reject and any
tie-break. **The text of record for every finding — evidence and paste-ready
replacement text — is the reviewer's own report**, which the writer reads whole:

- `docs/handoffs/keep-console-tab-content-mounted-panel-architect.md` (A1–A15, recount)
- `docs/handoffs/keep-console-tab-content-mounted-panel-ux.md` (U1–U5, plus two notes)
- `docs/handoffs/keep-console-tab-content-mounted-panel-security.md` (S1–S3)

Rulings: `keep-console-tab-content-mounted-rulings-index.md` (14, 15).

| Finding | Severity | Disposition |
| --- | --- | --- |
| A1 | MAJOR | ACCEPT as written (task 4.3, the section 2 header, 5.2; the listener target is design.md D-5's). |
| A2 | MAJOR | ACCEPT as written. |
| A3 | MAJOR | ACCEPT as written (applies RULING 4 to the sentence). |
| A4 | MAJOR | ACCEPT as written (the two no-request clauses move to rows of 1.8; no new group). |
| A5 | MAJOR | ACCEPT as written (journey warm-cache leg logs; UNTESTED unless an interior request is seen). |
| A6 | MINOR | ACCEPT: cut 1.11's failed-read control row. Target total: 39 tasks. |
| A7 | MINOR | ACCEPT as written. |
| A8 | MINOR | ACCEPT as written (a GIVEN on the carried scenario; the heading stays character-for-character). |
| A9 | MINOR | ACCEPT as written. |
| A10 | MINOR | ACCEPT as written. |
| A11 | MINOR | ACCEPT as written. |
| A12 | MINOR | ACCEPT THE ALTERNATIVE (RULING 14): delete the composition guard from task 4.3. The writer also removes `isComposing` from design.md D-5 and anywhere else design.md names it, as a ruling-driven edit to the architect's file, changing nothing else there. Merged with UX U4. |
| A13 | MINOR | ACCEPT as written. |
| A14 | MINOR | No change asked; noted. |
| A15 | MINOR | ACCEPT: the extra gap joins task 5.10's list, the chain notes join 5.9. |
| U1 | MINOR | ACCEPT both proposal bullets. |
| U2 | MINOR | ACCEPT the cost bullet; no scenario. |
| U3 | MINOR | ACCEPT (widened GIVEN; a chevron row in the already-parametrised 2.5; no new task). |
| U4 | MINOR | ACCEPT — same edit as A12's alternative. |
| U5 | MINOR | NOT AUTHORED — filed as `docs/handoffs/followup-escape-collapse-not-announced.md` (RULING 15). No delta text. |
| UX note (RULING 7 state) | — | ACCEPT: the recovery path joins the narrowed evidence in the fleet-menu drift record at task 5.10. No new task. |
| UX note (RULING 12) | — | ACCEPT: one line in the filed gap record at 5.10. |
| S1 | NOTE | ACCEPT: task 4.2 invalidates exactly `queryKeys.sightings.pile(null)`, never `sightings.all`; the writer adds one Risks line to design.md if D-4/Risks does not already say each retry re-reads every loaded page. |
| S2 | NOTE | ACCEPT only if it is one more parameter of an existing arrangement in section 2 (listener gone after the view unmounts); if it needs its own arrangement, omit it and leave it to design.md D-8. No new task either way. |
| S3 | NOTE | No change; the parent's RULING 20 trigger is not met. |

Conflicts resolved: A12 (primary) against U4 — RULING 14. No other overlap.

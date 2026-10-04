# `lift-burn-preview-to-view` — panel dispositions

Orchestrator, 2026-10-03. This file is a **disposition table, not a reduction**:
the three reviewers' own reports are on disk and are the authority for every
finding's evidence and paste-ready text. The writer reads each report whole and
applies every finding marked ACCEPTED, as modified by the cited ruling
(`lift-burn-preview-to-view-rulings-index.md`). Where a ruling and a report's
paste-ready text disagree, the ruling wins.

Sources: `docs/handoffs/lift-burn-preview-to-view-panel-architect.md`,
`docs/handoffs/lift-burn-preview-to-view-panel-ux.md`,
`docs/handoffs/lift-burn-preview-to-view-panel-security.md`.

| Finding | Severity | Disposition | Ruling / note |
| --- | --- | --- | --- |
| Architect A1 | MAJOR | ACCEPTED | RULING 7. Already in design.md Decision 5 (architect's edit). |
| Architect A2 | MAJOR | ACCEPTED | The carried "SHALL be requested whenever a commit … would be accepted" / "while … burning" sentences are reconciled with the post-commit state; merge with Security MINOR 1's rationale fix and RULING 8's one rule (the burn command is offered exactly where a preview is requested). |
| Architect A3 | MAJOR | ACCEPTED | Guard requires both ids present; a point never matches; task wording per the report. |
| Architect A4 | MAJOR | ACCEPTED | The three untested behaviours get tests. |
| Architect A5 | MINOR | ACCEPTED | Requirement text says "the view", not "the panel". |
| Architect A6 | MINOR | ACCEPTED | RULING 10. Dedupes with UX F7. |
| Architect A7 | MINOR | ACCEPTED | Section 2 merged to one task, not labelled red. |
| Architect A8 | MINOR | ACCEPTED | RULING 9. Dedupes with UX F3's first scenario; use UX's THEN for what the view presents, as RULING 8 requires. |
| Architect A9 | MINOR | ACCEPTED | Static guard's second clause; panel no longer derives currency. |
| Architect A10 | MINOR | **OVERRULED** | RULING 8 — UX prevails on all three presentation consequences. |
| Architect A11 | MINOR | ACCEPTED | Proposal no longer says "provisional"; the chain doc's scenario count is the orchestrator's to fix. |
| Architect A12 | MINOR | ACCEPTED | "figures outlive" GIVEN says a *current* preview. |
| Architect A13 | MINOR | ACCEPTED | Sequencing note in the tasks header. |
| Architect § 3 replacement tasks.md | — | ACCEPTED AS BASE | Then extended for RULING 8 (two more MODIFIED blocks, the unavailable-with-reason presentation across the four suppressed states as parametrised tests, the accessible-description association) and RULING 9's silence pin. Count honestly; the cap is 40 — report the number, do not merge unlike tasks to fit. |
| UX F1 | MAJOR | ACCEPTED | RULING 8. Attached-to-target statement, Burn unavailable, both of F1's scenarios. |
| UX F2 | MAJOR | ACCEPTED | RULING 8. Committed-to-target statement, Burn unavailable while the stored pair matches, both scenarios. |
| UX F3 | MAJOR | ACCEPTED | RULINGs 8 and 9. Both scenarios and the accessible-description SHALL. Lane transit is the fourth state of the same rule. |
| UX F4 | MINOR | ACCEPTED | RULING 9. One scenario. |
| UX F5 | MINOR | DEFERRED | RULING 12 → `defect-command-panel-residual-presentation.md` (link 2a-iii). |
| UX F6 | MINOR | DEFERRED | RULING 12 → same file (link 4). Its scenario is NOT added. |
| UX F7 | MINOR | ACCEPTED | RULING 10. |
| Security MINOR 1 | MINOR | ACCEPTED | RULING 11. Rationale clause rewritten in the MODIFIED block; design.md's `fleet-movement` row corrected. |
| Security advisory A | — | FILED | RULING 11 → `defect-zero-length-burn-returns-500.md`. No backend edit. |
| Security advisory B | — | RESOLVED BY | RULING 8 (the post-commit second Burn is unavailable, so never uncapped). |

## Consequences the writer must carry through

- Three MODIFIED blocks in `system-space-view`, each a complete replacement with
  every live scenario verbatim: "Burn Preview Reflects the Server-Solved Order,
  Without Committing"; "Burn Command Targets Any Selected Body, Lane Gate, or
  Point Uniformly"; "A Failed or Stale Preview Is Never Presented as a Current
  Quote". Check `docked-fleet-actions` "Running Mine Gates the Fleet Panel's
  Commands" against the new reason-line rule and say in design.md whether it
  stays true as written.
- design.md is the architect's; the writer updates its Open Questions (all five
  are now ruled), its "requirements checked" table (the Failed-or-Stale row is
  no longer "unaffected"), and adds the RULING 8 decision. Technical decisions
  2–6 and 9 stand as the architect wrote them.
- proposal.md Impact: three requirements, `use-burn-preview.ts`, the reason
  copy; closes the two filed records; names the three new filings as out of
  scope.

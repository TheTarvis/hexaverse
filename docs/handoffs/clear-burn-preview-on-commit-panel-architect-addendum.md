# Architect addendum — `clear-burn-preview-on-commit`, findings on the revised delta (2026-10-04)

*Persisted by the orchestrator, verbatim, from the architect's returned report
after it brought design.md current against revision pass 1. All three are
ACCEPTED for the writer (orchestrator, under RULINGs 10 and 11; no new ruling —
each restores what an accepted finding already said).*

1. **AA1 — MINOR: the Focus scenario's "in the command panel" can only be met when Jump is rendered.**
   - The scenario's THEN says Tab moves "to the next focusable element after the burn command control in the command panel". In `SpaceCommandPanel.tsx` the only focusable element after Burn is Jump, rendered only when `fleet.laneId` is set (`:411`). The stranding and drift notices are plain `<p>`.
   - For a fleet with no lane, the next focusable element is in `FleetActionsPanel`, a sibling panel in the same column (`SystemSpaceView.tsx:931-976`).
   - UX F3's recommendation said "Jump when present, otherwise the next control after the panel"; the pasted text dropped the "otherwise". Task 7.3 asserts "inside the command column", which matches UX's intent and not the scenario's literal words.
   - Suggested repair: in the scenario and the Focus paragraph, say "the next focusable element after the burn command control in the command column's order" or add "or, when the panel has none, the next focusable element after the panel". Decision 15 records the reading the journey uses.

2. **AA2 — MINOR: the accessible description has no SHALL in the requirement body.** It exists only as the last AND of scenario 1. proposal.md's "Rulings applied" says "the requirement binds … the accessible description", and the writer notes say "the delta pins both". One sentence in "The statement" paragraph: while the statement is shown, the burn command control SHALL reference it as its accessible description, and SHALL NOT reference it otherwise.

3. **AA3 — NIT: proposal.md's Impact line says "the three carried-body edits listed in the notes file".** The notes, the proposal's own What Changes, and design.md all say one scenario body is edited (the guard-release GIVEN) plus requirement-text edits in three requirements.

# Defect — two pre-existing presentation faults on the command panel, found by `lift-burn-preview-to-view`'s UX review

**Status:** open, frontend, pre-existing. **Found:** 2026-10-03
(`lift-burn-preview-to-view-panel-ux.md` F5, F6).
**Adjudicated:** `lift-burn-preview-to-view-rulings.md` FULL-AUTO RULING 12 —
filed, not fixed there.

1. **Uncapped label and an enabled Burn while the first quote is in flight
   (F5).** `useBurnPreview` surfaces no loading state; between a preview being
   enabled and its first response there is no current quote, so the panel shows
   "Uncapped: this burn will be committed with no fuel ceiling" with Burn
   enabled, and a click in that window commits uncapped. The live scenario
   "The burn stays committable without a quote, labelled as uncapped" is about a
   *failed* preview, not a pending one. **Owner: link 2a-iv
   (`add-burn-cost-overlay`)**, which MODIFIES "A Failed or Stale Preview Is
   Never Presented as a Current Quote" and must decide what the gauge draws in
   the same window.
2. **The committed-vs-previewed drift notice outlives its target (F6).**
   `SpaceCommandPanel`'s `setCommit` is set and never cleared, so after a commit
   to X, selecting Y leaves X's "Committed at … previewed …" notice under Y.
   **Owner: link 4**, which MODIFIES the commit-result surface. UX's paste-ready
   scenario is in the report.

**What would make this stale:** a pending-quote presentation rule; a scenario
scoping the drift notice to its committed target.

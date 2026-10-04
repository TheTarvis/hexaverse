# Drift — a burn commit's stranding warning is never rendered on the system space view

**Status:** reported by adversary round 1 of `lift-burn-preview-to-view` (M5),
adjudicated **code wrong**; **independently confirmed 2026-10-04** by code
reading (`clear-burn-preview-on-commit-analysis.md` § 1b — the response carries
the flag, `backend/fleet/handler.go:445-448`; nothing renders it; the preview's
own read is at `SpaceCommandPanel.tsx:280-284`, not `:275`).
**Owner:** link 2a-iii `surface-commit-stranding-warning` (split off
`clear-burn-preview-on-commit` by that change's RULING 3), for the **burn
command's commit only**. The stop command's half is
`drift-stop-stranding-warning-not-rendered.md`.
**Found:** 2026-10-03. **Ruling:** `lift-burn-preview-to-view-rulings.md` RULING 13.

## The requirement

`openspec/specs/fleet-roster/spec.md:205`, *A Burn Commit's Stranding Warning Is
Surfaced to the Player*: a visible notice when a commit response carries the
warning.

## The code (per the adversary)

Nothing on the system space view renders the commit response's
`strandingWarning`. The only stranding text is the *preview's*
`preview-stranding` (`SpaceCommandPanel.tsx:275`), which stays on screen after a
commit only because the preview keeps polling.

## What would make this stale

A notice driven by the commit response, with a test that fails without it.

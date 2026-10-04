# Drift — a burn commit's stranding warning is never rendered on the system space view

**Status:** reported by adversary round 1 of `lift-burn-preview-to-view` (M5),
adjudicated **code wrong** on the adversary's evidence; **not yet independently
re-verified** — the owning link's analyst should confirm before specifying.
**Owner:** link 2a-iii `clear-burn-preview-on-commit` (clearing the preview at
commit removes the only stranding text left on screen).
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

# Drift — the burn preview does not clear when an order commits

**Status:** confirmed, adjudicated **code wrong**, owner link 2a-iii
`clear-burn-preview-on-commit` of the system-HUD chain (`not authored`).
**Found:** 2026-10-03, `add-burn-cost-overlay-analysis.md` § 6 item 5.
**Adjudicated:** `lift-burn-preview-to-view-rulings.md` FULL-AUTO RULING 4
(fix it), then RULING 13 (not in that change — its own link).

## The requirement

`openspec/specs/system-space-view/spec.md`, *Burn Preview Reflects the
Server-Solved Order, Without Committing*: the preview "SHALL clear when the
selection is cleared or replaced, or when an order commits." No scenario
exercises the last clause.

## The code

After a successful burn commit the selection is kept and the preview keeps
polling — now as a re-target quote for the target the fleet is already flying
to. Nothing clears it.

## Why it is hard (what the first attempt got wrong)

`lift-burn-preview-to-view` drafted the fix as a stored click-time
`(fleet, selection)` pair that suppresses the preview until the selection or the
acting fleet changes, with the burn command unavailable and "an order is
committed to that target" stated meanwhile. Adversary round 1 found
(`lift-burn-preview-to-view-adversary-r1.md`):

- **B1** — the hold outlives the order: after cut drive, stop in place, arrival
  at a point target, or a re-task from another tab or the agent, the view still
  claims the order and blocks the re-burn. The committed state must end when the
  order it names is no longer the acting fleet's running order, as observable
  from the served fleet read, and must survive the gap between commit success
  and the fleet read first showing the burn.
- **M5** — clearing the preview at commit removes `preview-stranding`, the only
  stranding text on the view, at the instant live `fleet-roster` *A Burn Commit's
  Stranding Warning Is Surfaced to the Player* requires one
  (`drift-commit-stranding-warning-not-rendered.md`).
- **m4** — live *Burn and Jump Commit Controls Guard Against Double-Submit* says
  a new attempt after the guard releases "submits normally", with no "on another
  selection".
- UX F2 (`lift-burn-preview-to-view-panel-ux.md`) — without a hold, a second
  Burn after the clear would be an uncapped re-order where today it is capped by
  the still-polled quote.

Design alternatives already weighed are in the archived change's design.md
history and RULINGs 4 and 7 of `lift-burn-preview-to-view-rulings.md`.

## What would make this stale

A scenario for the commit clause, an end condition tied to the order's own
life, and a test that fails without them.

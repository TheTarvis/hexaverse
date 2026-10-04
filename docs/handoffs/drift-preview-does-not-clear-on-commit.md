# Drift — the burn preview does not clear when an order commits

**Status:** closed (2026-10-04) — was confirmed, adjudicated **code wrong**, owner link 2a-iii-b
`clear-burn-preview-on-commit` of the system-HUD chain; built `62c8f15`, see the closing note at the end.
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

## Closing note

**Closed 2026-10-04 by `clear-burn-preview-on-commit` (`62c8f15`).** The
live clause "the preview SHALL clear … when an order commits" now has
scenarios and an implementation: the committed selection is a fourth withheld
state, derived in render in `SystemSpaceView.tsx` from a per-fleet record of
every accepted burn commit (`CommittedOrder`) against the own-fleets read, and
the burn command is withdrawn for that selection with a static statement
(`selection-committed-statement`). Closing tests, all in
`frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` unless
noted: 3.1 (commit removes the quote, withholds Burn), 3.2-3.4 (the gap, the
pre-acceptance read, no clock term), 3.5-3.9 (cut drive, stop, order gone,
arrival hand-over, order settled in the round trip), 3.10 (failed reads), 3.11
-3.14 (other targets, second commit, late response, per-fleet), 3.16, 3.19;
panel half in `SpaceCommandPanel.test.tsx` (2.1-2.3). Regression guards 3.15,
3.17, 3.18 stay green. UX F2 (an uncapped re-order after the clear) is closed
by construction: the second Burn is unavailable, not uncapped.

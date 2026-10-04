# Follow-up change (not in the chain) — `explain-withheld-burn-command`

**Status:** proposed, unauthored. Residue of `lift-burn-preview-to-view`'s panel
and adversary round 1, deferred by that change's FULL-AUTO RULING 16
(`lift-burn-preview-to-view-rulings-index.md`). Gates no link of the system-HUD
chain; link 4 (`add-arc-figures-and-entity-tab`) redraws this surface and its
analyst should read this first and may absorb it.

## What it would deliver

The rule recorded in RULING 8 of `lift-burn-preview-to-view-rulings.md`: the
burn command is offered exactly where a preview is requested (or was requested
and failed); where the preview is withheld by precondition the command is
unavailable, the view states why, and the reason is the control's accessible
description.

## The findings it answers (evidence and paste-ready text live in these files)

- `lift-burn-preview-to-view-panel-ux.md` **F1** — docked at the selected
  target, Burn is enabled and a click ends in a 500 and the generic "Please try
  again" (pre-existing; see also `defect-zero-length-burn-returns-500.md`).
  **F3** (reason half) — during a mine the command panel's disabled Burn carries
  no reason.
- `lift-burn-preview-to-view-adversary-r1.md` **M1** — the rule's scope (canvas
  unavailable, commit in flight, no fleet, no selection); **M2** — lane transit
  is observable only for a fleet explicitly chosen while present whose
  own-fleets read then reports `jump`, until the departure hand-off unmounts the
  view; **M3** — holds must be stated against reads, with pending and failed
  cases; **m3** — two holds at once.
- `lift-burn-preview-to-view-panel-architect-r1-repair.md` — the complete
  design: Decision 10 (rule scope), 11 (`burnHold`), 12 (the view as the only
  reader of the running mine, passed to both `SpaceCommandPanel` and
  `FleetActionsPanel`; withhold until the first answer; a failed read withholds
  with a stated reason, consistent with live *The Sweep Surface's Reads Fail
  Independently*), 13 (own-fleets read lag); and its task list (the +22 beyond
  the narrowed change).

- `lift-burn-preview-to-view-adversary-r2.md` **m3** — after the lift, a fleet
  docked at its selected target sees only the uncapped label and an enabled Burn
  that ends in a 500; the "No quote" line that used to hint the burn cannot be
  solved is gone (with the polling that produced it). This is the ordinary state
  after every arrival, and the strongest reason to author this change soon.

## Requirements it would touch

MODIFIED `system-space-view` "Burn Preview Reflects the Server-Solved Order,
Without Committing", "Burn Command Targets Any Selected Body, Lane Gate, or Point
Uniformly", "A Failed or Stale Preview Is Never Presented as a Current Quote";
probably `docked-fleet-actions` "Running Mine Gates the Fleet Panel's Commands"
(same world-truth wording the adversary's M3 objects to).

## Defects found alongside, for whoever authors it

- **`FleetActionsPanel`'s `committedEta` is never cleared** (architect, r1
  repair): cancel a run committed in the same mount and the fleet panel stays
  gated until the original ETA, with a cancel control carrying an empty action
  id, while the command panel offers Burn. Unverified by a second reader.
- **Possible drift, unverified:** the Burn control's rendered `disabled` has no
  in-flight term (`SpaceCommandPanel.tsx:314`) though live *Burn and Jump Commit
  Controls Guard Against Double-Submit* says "SHALL each be disabled from the
  moment of commit"; the guard is a synchronous claim, which may be the accepted
  reading.
- The failed-read reason copy in the architect's design is new player-facing
  text no UX reviewer has seen.

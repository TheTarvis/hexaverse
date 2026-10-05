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

## Added at kickoff (2026-10-04)

- **A transient "No quote" at a mine's end** (`lift-burn-preview-to-view`
  RULING 20; impl contract F1): the preview path settles a due burn but not a
  due mine (`backend/fleet/service.go:526`, refusal at `:987`), so the restoring
  request sent at the ETA can be refused once and the panel shows the no-quote
  state and Retry until the next interval. Backend fix (settle a due mine on
  preview); outside the system-HUD chain's no-backend fence.

## Added at verification (2026-10-04) — `lift-burn-preview-to-view-qa.md` F3, F4

- **Canvas unavailable with a selection held:** the preview keeps being
  requested every interval while Burn is disabled — a priced endpoint polled
  with no consumer able to commit. The spec's withheld states are three; this
  is not one of them, and no test pins it either way.
- **Docked at the selected target:** Burn stays enabled with the (truthful)
  uncapped label; a click is an own-host burn the server answers with the
  zero-length 500.

**2026-10-04 (`clear-burn-preview-on-commit`, `62c8f15`).** One withheld
state now explains itself: the committed selection shows a static statement
that is also the Burn control's `aria-describedby`. The arrival contrast is
new: at arrival at the selected body the statement is removed and the
docked-at-target state shows an enabled Burn under the uncapped label (which
ends in the zero-length 500), so Burn visibly re-enables at arrival. This note
records the contrast; it does not absorb this follow-up, which still covers
the three earlier withheld states and docked-at-target, and its mechanism
choice stays open.

**2026-10-04 (`fix-burn-order-geometry-refusals`, its RULING 10; UX panel MAJOR 2 in
`fix-burn-order-geometry-refusals-panel-ux.md`).** A fifth gap, appended and not absorbed: a
REFUSED preview. The server now answers a deterministic solve refusal (star clearance at origin
or destination, minimum arc, absent body) with a reason-bearing `409`/`404`, but the command
panel's no-quote state (`SpaceCommandPanel.tsx:322-349`) still reads "No quote - could not be
solved" with **Retry quote** — a retry that cannot succeed — and still lets the player commit
uncapped into the same refusal (which the commit path does now explain, in mapped copy). The
proposed shape is to show the mapped reason in the existing no-quote slot and withhold Retry
for those four refusals only; that is a `system-space-view` delta and was kept out of a backend
corrective change. Related, also unaddressed: `shouldRetryQuery`
(`frontend/lib/query-client.ts:28-37`) would retry a sub-500 refusal on a query path, and the
cut-drive handlers beside both Stop surfaces (`FleetActionsPanel.tsx:570`, `GalaxyView.tsx:316`)
still show mine-table or raw copy (impl contract section 9). The "ends in the zero-length 500"
wording in the notes above is superseded: an own-host burn is now refused with the minimum-arc
`409` only at phases where its solved curve is below the minimum, and commits otherwise.

---

**Added 2026-10-05 by the `add-burn-cost-overlay` orchestrator (FULL-AUTO RULING 17
there).** The fuel gauge's cost overlay is a second reader of the view's
current-quote value, and the canvas is not a term of that value — so while the
canvas is unavailable and a selection is held, the overlay is drawn, by
construction, exactly as the panel's figures are. That link deliberately pins
this with no scenario and no test (no harness running the real preview hook can
switch the canvas: `add-burn-cost-overlay-panel-architect.md` A4). Whoever
authors F3 owns the overlay's behaviour in that state too.

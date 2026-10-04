# Defect — a fleet docked at its selected target polls a zero-length burn preview, 500 every 10s

**Status:** **CLOSED 2026-10-04** by `lift-burn-preview-to-view` (commit `3802b92`). Was: open, **reproducible** (unlike most entries here, this one was
reproduced live, not inferred from a log).
**Found:** 2026-09-09, by the developer diagnosing `add-vitals-strip`'s archive
gate on a live e2e stack.
**Not fixed there:** `add-vitals-strip` has no task or scenario covering
selection or preview; fixing it would exceed that change's stated Impact.
**Adjudicated:** `add-vitals-strip-rulings.md` FULL-AUTO RULING 36.

## What happens

A fleet burns to a station and docks. The station **stays selected**, so it is
still the burn preview's target — but the fleet is now *at* it. `useBurnPreview`
keeps polling on its refresh interval, asking the server to solve a burn from a
body to itself, and the server refuses each one:

```
curve length below the configured minimum
```

500, every ~10 seconds, for as long as the player leaves a docked fleet's host
selected. Which is the ordinary state after every arrival.

## Why it matters more than a log line

It is almost certainly the source of the **"2 Issues"** on the Next.js dev
overlay that blocked `vitals-strip-journey.spec.ts` at its second chevron click
— i.e. this defect is what made the gate's red 1 fatal rather than cosmetic. The
overlay is dev-only and never ships; **this is not**. In production it is a
recurring 500 against a live endpoint, on the most common state in the game,
with no player-visible symptom to explain it.

It also means the burn-preview surface currently distinguishes "no quote yet"
from "quote failed" for a case that is not an error at all: the player has simply
arrived.

## Where the fix belongs

Two candidate shapes, both frontend, neither chosen here:

1. **Clear the selection on dock** — the arrival settles and the host stops being
   a selected *target*. Cleanest conceptually, but it changes selection
   behaviour, which `system-space-view` specifies, so it needs a delta.
2. **Skip the preview when the target is the fleet's own `attachedTo`** — a
   guard at the call site. Narrower, and it needs no selection change; it is
   arguably just the missing precondition on an existing requirement.

**Natural owner: link 2a-ii, `add-burn-cost-overlay`.** That change lifts the
burn preview into the mounting view and already carries
`drift-running-mine-preview-unsuppressed.md` — a second, unrelated case of the
same omission, a preview requested in a state where no preview should be asked
for. Both are "the preview's preconditions are not all enforced at the call
site", and they should be specified together rather than patched apart.

## What would make this stale

A `system-space-view` or `system-console` requirement stating when a preview is
*not* requested, with the docked-at-target case named. Until then this note is
live: the cause is checkable in one step — dock a fleet at its selected host and
watch the network tab.

## Closed — 2026-10-04

Fixed by shape 2 (`lift-burn-preview-to-view-rulings.md` RULING 3), commit
`3802b92`: no preview is requested while the selected body is the one the acting
fleet is attached to (`dockedAtTarget` in `SystemSpaceView.tsx`; both ids must be
present, so a point selection never matches). The requirement now names the
case: `system-space-view` *Burn Preview Reflects the Server-Solved Order, Without
Committing*, scenario "A fleet docked at its selected target requests no
preview". **Closing tests:** `SystemSpaceView.burn-preview.test.tsx` task 3.7
(station, gate and plain-body hosts: no request across three intervals) and,
against the real backend, `burn-preview-journey.spec.ts` step 4 (zero
`orders/preview` POSTs and zero 5xx over 22 s with the own host selected).

**Not closed by this:** the server still answers 500 to a zero-length burn, and
the burn command stays enabled toward the fleet's own host —
`defect-zero-length-burn-returns-500.md` and
`followup-explain-withheld-burn-command.md`.

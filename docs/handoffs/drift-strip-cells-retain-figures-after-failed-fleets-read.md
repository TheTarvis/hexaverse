# Drift — the vitals strip's fuel and hold cells keep an earlier read's figures after a failed own-fleets refetch

Filed 2026-10-05 by the `add-burn-cost-overlay` orchestrator (link 2a-iv of
`docs/plans/system-hud/chain.md`), from its analyst's finding D1
(`add-burn-cost-overlay-analysis.md` § 6). **Status: open. Adjudicated code
wrong** (`add-burn-cost-overlay-rulings.md` FULL-AUTO RULING 11). Out of the
chain link that found it; Travis's to schedule as a corrective change.
Found by code reading only — never observed on a stack.

## The spec

`openspec/specs/system-space-view/spec.md` lines 112–116, "System Space View
Route and Data Fan-In":

> The vitals strip's fleet, fuel, and hold cells — also fed by this read —
> degrade the same way: absent when no own-fleets data has ever been served,
> and never presenting a figure served by an earlier successful read as
> current once that read's most recent attempt has failed.

`system-console` "The strip survives a failed own-fleets read" says the fleet,
fuel and hold cells "show the absent form exactly as the no-acting-fleet case
does". `add-vitals-strip-impl-contract.md` lines 615–617 said `fleetsFailed`
drives the fuel/hold cells absent.

## The code (at `d965f5d`)

- `frontend/components/space/SystemSpaceView.tsx:1072` passes `acting`
  unconditionally; `acting` is built from `fleets.data` (`:303-309`), which
  React Query retains across a failed refetch.
- `frontend/components/space/VitalsStrip.tsx:242` reads `acting?.roster` and
  passes it to `FuelCell` and `HoldCell` (`:264-265`) with no `fleetsFailed`
  term. Only the pill and the chevron menu are gated on it.

## Why no test sees it

Every test arranges the failure with `data: undefined`
(`VitalsStrip.test.tsx:122`, `SystemSpaceView.test.tsx:646,1214`), which cannot
tell "never served" from "served, then failed". A closing test must arrange a
successful read followed by a failed refetch over retained data.

## Bearing on `add-burn-cost-overlay`

In this state the cost overlay is drawn on a rail whose fill is a figure the
spec says must not be shown. That link writes no rule for the state; its "no
overlay on a gauge with no data" rule (if so ruled) composes with the fix, so
the overlay goes when the fill does.

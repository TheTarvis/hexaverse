# Drift — the burn commit response carries no delta-v, so the drift notice shows after every real commit

**Status:** found by code reading 2026-10-04 (`clear-burn-preview-on-commit-analysis.md`
§ 6, finding 1); **not verified on a running stack**; not adjudicated.
**Owner:** none inside the system-HUD chain — making it true needs a served
field or a client mirror of a `backend/space` rule, and the chain forbids both
(`surface-commit-stranding-warning-rulings.md` RULING 4). Travis's to route;
link 4 owns the commit-result surface
(`defect-command-panel-residual-presentation.md`).

## The requirement

`openspec/specs/system-space-view/spec.md`, *A Commit's Actual Result Is Never
Silently Swapped for the Previewed One*, scenario *A commit matching the
preview shows no drift notice* (`:941`).

## The code

`space.Burn` has no `DeltaV` field — it is a method (`backend/space/burn.go:151`),
and `fleetDTO.State` is the untagged `space.ShipState` with no custom
marshaller found. `frontend/lib/types/fleet.ts:43-53` agrees. But
`frontend/components/space/SpaceCommandPanel.tsx:140-146` reads `burn.DeltaV`
through a cast, and `differs()` (`:96-99`) returns true when either side is not
a number — so on the real wire `commit-drift-notice` would render after every
successful commit, with the actual delta-v in the absent form. The panel tests
pass because they fabricate `DeltaV` on the mocked response
(`SpaceCommandPanel.test.tsx:391,443,457,490`); no e2e spec reads
`commit-drift-*`.

## What would make this stale

A stack observation showing the field is served, or a ruling on what "actual"
means without it.

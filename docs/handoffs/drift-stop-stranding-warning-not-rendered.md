# Drift — a stop's stranding warning is never rendered, on either view

**Status:** found by code reading 2026-10-04 (`clear-burn-preview-on-commit-analysis.md`
§ 1b, correction 2); **not verified on a running stack**; not adjudicated.
**Owner:** none — out of the system-HUD chain
(`surface-commit-stranding-warning-rulings.md` RULING 3). Travis's to route.

## The requirement

`openspec/specs/fleet-roster/spec.md`, *A Burn Commit's Stranding Warning Is
Surfaced to the Player*; `openspec/specs/fleet-movement/spec.md:1145` ("on an
otherwise-accepted burn commit" — a stop above the speed floor commits a
nulling burn, so the text arguably covers it).

## The code

`backend/fleet/handler.go:351` answers `Stop` through
`respondWithStrandingWarning`; `backend/fleet/service.go:1436` sets the flag on
the above-the-floor branch. `frontend/components/space/FleetActionsPanel.tsx:583`
and `frontend/components/galaxy/GalaxyView.tsx:304` call `stop.mutate` and
discard the response.

## What would make this stale

A ruling that the requirement does not cover stop, or a notice driven by the
stop response on both views with a test that fails without it.

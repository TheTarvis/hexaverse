# Defect — a point-target burn's coordinates have no extent or magnitude validation

**Status:** OPEN, **inferred by code reading, not verified on a running stack.**
**Filed:** 2026-10-04 by `fix-burn-order-geometry-refusals` (task 5.4; analysis section 1,
security panel ADVISORY A in `fix-burn-order-geometry-refusals-panel-security.md`). Not fixed
there: it is not on the solve-refusal path that change repairs.

## Evidence

`OrderRequest.Point` is accepted as sent. Coordinates are checked on DECODE only
(`backend/space/params.go:107-116`), not at commit, and the order routes carry no body size cap.

## Two inferred outcomes for a huge or non-finite point (neither observed)

1. The solve or the encoder fails and the route answers a 5xx — a client-controllable server
   error, logged at error level.
2. The burn is stored, then fails to decode later, turning every subsequent command and read on
   that fleet into a logged 5xx (`fleet.ErrKinematicDecode`).

Both are self-inflicted on the owner's own fleet (ownership is checked before the body binds),
including through the claude-agent's token passthrough.

## Fix shape

A `400` with a named reason in `backend/fleet`, validating the point against the system body
table's extent before the solve. No edit under `backend/space`, no fixture change.

## What would make this stale

A `fleet-movement` requirement bounding a point target and the handler check that enforces it;
or a run on a live stack showing which outcome actually occurs.

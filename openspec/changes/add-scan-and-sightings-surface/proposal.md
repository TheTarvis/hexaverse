## Why

Link 5 shipped the focused scan as an API and nothing else: `POST
/v1/fleets/:fleetId/scan` and `GET /v1/sightings` exist, and the tree that
consumes them has no scan command on any view, no `scan` method on
`frontend/lib/services/fleet-service.ts`, no sightings service, hook, or query
key, and nothing that renders a sighting. `frontend/hooks/use-actions.ts`'s
`useRunningScan` was written for that surface and has had **zero consumers**
since the day it landed — the chain's fifth instance of a derivation built,
unit-tested against its own determinism, and never called. This change is its
caller, and the caller of the sighting pile.

**Link 9 (`delete-the-lattice`) is blocked on this change**, not on
`build-production-space-view` alone. Until the scan's player-facing half and
the sightings display both exist, the lattice cannot be removed without
retiring a verb the game never let anyone use.

## The one constraint on this change's shape

**The scan command surface and the sightings display ship together, in this
change.** They are not separable and no follow-up may carry either half. A
scan button whose results cannot be seen is half a feature shipped twice, and
this exact surface has already been deferred once — at link 5 — where it
became dead code. Per `handoffs/link8-rulings.md`: *a split that is not
load-bearing on something downstream is a deferral wearing a schedule's
clothes.*

## What Changes

- **ADD to `focused-scan`**: `GET /v1/fleets/:fleetId/scan-targets`, an
  owner-scoped read serving exactly the hosts a scan commit by that fleet
  would accept right now — each with the sweep duration a commit would freeze.
  The range and occlusion predicates stay **server-side**; the client never
  mirrors a `disclosure` predicate. This is the ruled answer to link 8's OQ-6:
  a dedicated target list, not a shared canvas selection, so "sweeping every
  body is self-defeating" is legible in the control itself.
- **MODIFY `sighting-records`**: a sighting's document identifier stops being
  `{actionId}_{targetId}` and becomes an opaque deterministic identifier from
  which the target's id cannot be recovered, and that identifier is served as
  the record's `id`. **This closes a live disclosure defect**: the pile's
  continuation cursor is `"{asOf}|{documentId}"` served in plaintext
  (`backend/sightings/dao.go`), so the shipped wire already publishes the
  sighted target's fleet id to any client that pages the pile — precisely what
  `TargetId`'s `json:"-"` exists to withhold.
- **MODIFY `sighting-records`**: state the minting rule so it survives the
  mechanism this change depends on. A read still mints nothing of its own
  accord, but a read *may settle a due sweep* through the action spine's
  opportunistic resolve fold — which is how a player's sweep lands at all,
  since the interior read is the only surface that calls `ResolveDue` on the
  scan's scope. The live scenario as written ("reads a system's interior →
  no new sighting record is created") is already false against shipped code.
- **ADD to `system-space-view`**: the scan control (server-served target list,
  commit with player-facing rejection copy, a double-submit guard shaped to
  survive the render race), the running sweep's countdown and cancel — read
  from the **action inbox**, the only surface carrying both the window and the
  action id `POST /v1/actions/:actionId/cancel` requires — the self-scheduled
  refetch that settles a due sweep and then reads the pile, the settled
  sweep's outcome in player copy including all five served fizzle reason
  codes, sighting **ghosts drawn at their frozen position**, the explicit
  rule that a ghost is never suppressed by or linked to a live contact, and
  the scan control's availability while the canvas is not.
- **ADD `sighting-log`** (new capability): the pile's display — served order,
  hull composition or a clean-sweep marker, system name falling back to its id
  (`fleet-roster`'s existing precedent), cursor paging with the server's opaque
  cursor, no timer poll (a sighting is minted only by the reading
  corporation's own resolving sweep, so there is nothing to poll for), explicit
  empty/loading/failed states, reachability from the space view without
  leaving it, and row↔ghost cross-highlighting keyed on the new record `id`.

No capability is retired by this change, so it needs no post-archive
hand-delete.

## Impact

- Affected specs: `focused-scan`, `sighting-records`, `system-space-view`
  (created by `build-production-space-view`, which archives immediately
  before this change), `sighting-log` (new).
- Affected code: `backend/sightings/` (mint doc-id derivation, wire `id`),
  `backend/fleet/` (the scan-target read and its handler),
  `frontend/lib/services/` (fleet `scan`, `scanTargets`; a new sighting
  service; the action inbox's done-status read and acknowledge),
  `frontend/lib/query-keys.ts`, `frontend/hooks/` (`useRunningScan`'s first
  consumer, a settled-sweep hook, a sightings hook),
  `frontend/components/space/` (the scan control, the ghost layer, the log),
  `frontend/e2e/`.
- Sequencing: archives after `build-production-space-view` and before
  `delete-the-lattice`.

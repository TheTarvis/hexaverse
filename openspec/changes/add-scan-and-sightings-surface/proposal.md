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
  would accept right now — each with the sweep duration a commit would freeze,
  and no world time, because nothing consumes one. The range and occlusion
  predicates stay **server-side**; the client never mirrors a `disclosure`
  predicate. This is the ruled answer to link 8's OQ-6: a dedicated target
  list, not a shared canvas selection, so "sweeping every body is
  self-defeating" is legible in the control itself.
- **ADD to `focused-scan`**: a **derived belt member is never a scan host**.
  `system/bodies.go` synthesizes `AsteroidsPerBelt` (8) members per belt into
  the body table with ids `{beltId}#{k}`, and `resolveScanHost` accepts any
  body in that table — so this new read would be the **first wire surface to
  publish member ids**, serving nine entries for one belt that no other read
  mentions and the client cannot label. That contradicts
  `build-production-space-view`'s *Belt Members Render as Decorative Detail,
  Never as Separate Pickable Bodies* and link 8's OQ-4 ruling ("one body,
  members decorative and unpickable"), which this change does **not** reopen. A
  member is absent from the list and a commit naming one is rejected identically
  to an unresolvable `hostId`; the belt feature itself stays eligible.
- **ADD to `focused-scan`**: a fleet may not sweep **itself**. It can today —
  host resolution finds the scanner among its own system's fleets, the range
  test passes at distance zero, and a zero-length sightline is never occluded —
  so the commit is now rejected identically to an unresolvable host, and the
  scanner is absent from its own served target list. Both halves are needed:
  the list's contract is that a served entry is one a commit would accept.
- **ADD to `focused-scan`**: a resolving sweep never files a sighting of its
  own scanner, **whatever host it swept**. A fleet docked at a body it then
  sweeps is masked beneath that host along with everything else, and
  `chainBeneath` mints without an owner filter — so today's shipped resolver
  files a sighting naming the scanner, at its own position, with its own
  composition: a claim about a fleet whose every field its owner already
  reads in full, drawn in that owner's own scene as a ghost of itself. This
  closes that live defect: the scanner is excluded from the minted set, and a
  sweep whose only masked ship was the scanner mints a single clean-sweep
  record instead.
- **MODIFY `sighting-records`**: a sighting's document identifier stops being
  `{actionId}_{targetId}` and becomes an opaque deterministic identifier from
  which the target's id cannot be recovered, and that identifier is served as
  the record's `id`. **This closes a live disclosure defect**: the pile's
  continuation cursor is `"{asOf}|{documentId}"` served in plaintext
  (`backend/sightings/dao.go`), so the shipped wire already publishes the
  sighted target's fleet id to any client that pages the pile — precisely what
  `TargetId`'s `json:"-"` exists to withhold. The identifier's **class** is
  specified rather than left open: a collision-resistant digest of at least 128
  bits, depending on no per-process, per-instance, or randomly seeded value.
  The identifier IS the Firestore document path, so a collision is a silent
  overwrite through the resolver's merge write — undetectable data loss in a
  pile that never expires.
- **ADD to `sighting-records`**: an optional `systemId` filter on the pile read.
  The ghost layer needs one system's records, and the pile is unbounded,
  ordered across every system, and served 50 records at a time — so without a
  server-side filter that layer silently omits records as the pile grows.
- **MODIFY `sighting-records`**: state the minting rule so it survives the
  mechanism this change depends on. A read still mints nothing of its own
  accord, but a read *may settle a due sweep* through the action spine's
  opportunistic resolve fold — which is how a player's sweep lands at all,
  since `system/handler.go` calls `ResolveDue` on the interior read and a scan
  action's scope IS its system id. The live scenario as written ("reads a
  system's interior → no new sighting record is created") is already false
  against shipped code.
- **ADD to `system-space-view`**: the scan control (server-served target list,
  commit with player-facing rejection copy including an unmapped-reason
  fallback, a double-submit guard shaped to survive the render race), the
  running sweep's countdown and cancel — read from the **action inbox**, the
  only surface carrying both the window and the action id
  `POST /v1/actions/:actionId/cancel` requires — the self-scheduled refetch
  that settles a due sweep for **any** of the corporation's own fleets in the
  open system and then reads the inbox and the pile in that order, the settled
  sweep's outcome in player copy including all six served fizzle reason codes,
  sighting **ghosts drawn at their frozen position**, the rules that a ghost is
  never suppressed by or linked to a live contact, is never a member of the
  view's selection (so clicking one cannot silently arm a burn), and is omitted
  rather than drawn atop the star when its stored position is the origin, and
  the scan control's availability while the canvas is not.
- **ADD `sighting-log`** (new capability): the pile's display — served order,
  hull composition or a clean-sweep marker, system name falling back to its id
  (`fleet-roster`'s existing precedent) and swept host likewise, cursor paging
  with the server's opaque cursor, no timer poll (every record is the effect of
  a sweep this corporation committed, whose ETA the view already schedules a
  refetch for), a mount read ordered behind the interior read that settles a
  past-ETA sweep, explicit empty/loading/failed states, reachability from the
  space view without leaving it, and row↔ghost cross-highlighting keyed on the
  new record `id`.

- **MODIFY `action-dispatch`** (two requirements, both closing live defects
  this change's own requirements now depend on):
  - *Exactly-Once Resolution* SHALL record the resolver's **reason code**
    alongside its outcome and resolve timestamp. **It was not persisted until
    `add-stationkeep-hold-verb` landed it**, concurrently with this change's
    drafting: `ResolveOne`'s single `tx.Update` used to write `status`,
    `outcome`, and `resolvedAt` and nothing else, so `Action.ReasonCode` —
    `omitempty` — was served absent, always. `openspec/specs/focused-scan/
    spec.md` already required that "the resolved action carries a reason code
    identifying whether the failure was range or occlusion", so **shipped code
    violated a live requirement**, and without the fix this change's five-way
    fizzle copy map would have rendered its unrecognized-code fallback for
    every fizzle while the orphan audit still passed. Two things kept this
    hidden: `action/model.go:203-206` documented the field as "mirrored onto
    `Action.ReasonCode` at the same status flip", which was false, and
    `fleet/scan_resolver_test.go:280,371` assert on the resolver's **return
    value** rather than the stored action. This delta makes the persistence a
    requirement rather than an accident of landing order.
  - *Inbox by Actor Query Param* SHALL serve a `done`-filtered read **ordered by
    resolve timestamp and bounded**, and SHALL accept an optional `type` filter
    that composes with `status` — the settled-sweep report reads
    `type=scan&status=done` so a fleet's mines, burns, jumps, holds, and
    releases cannot displace its unacknowledged scan off a type-agnostic
    bounded page. `action.Dao.List` applies no ordering and no limit, and a
    bare limit over an unordered query returns an arbitrary subset — the
    settled-sweep report would fold "greatest `resolvedAt`" over that subset
    and could report a stale sweep, or none, while the newest stays
    unacknowledged and a dismissal acknowledges the wrong action. This answers
    the change's own OQ-9, which asked whether the bound wanted a delta rather
    than a bare task. The ordering and bound apply on the `done` path whether or
    not `type` is also given: `resolvedAt` is `omitempty` and absent on a
    running action's document, so an unconditional order would drop every
    running action.

No capability is retired by this change, so it needs no post-archive
hand-delete.

## Impact

- Affected specs: `focused-scan`, `sighting-records`, `system-space-view`
  (created by `build-production-space-view`, which archives immediately
  before this change), `sighting-log` (new), `action-dispatch`.
- Affected code: `backend/sightings/` (mint doc-id derivation, wire `id`, the
  `systemId` filter on the pile read), `backend/action/` (persisting
  `reasonCode` in `ResolveOne`'s resolve transaction; ordering, bounding, and
  the `type` filter on `Dao.List`'s `done` path), `infra/terraform/
  firestore-indexes.tf` (**three** composite indexes — `(systemId asc, asOf
  desc, __name__ desc)` on `sightings`, `(actor asc, status asc, resolvedAt
  desc)` on `actions`, and `(actor asc, type asc, status asc, resolvedAt
  desc)` on `actions`; **Travis must `terraform apply`** all three in one
  apply, and note the emulator auto-indexes so the tests pass without any of
  them and only production fails),
  `backend/fleet/` (the scan-target read, its handler, the self-sweep
  rejection, the belt-member rejection, and the resolver change that excludes
  the scanner from a sweep's own minted records),
  `backend/disclosure/` (`sighting.go`'s self-scanner exclusion),
  `frontend/lib/services/` (fleet `scan`, `scanTargets`; a new sighting
  service; the action inbox's done-status read and acknowledge),
  `frontend/lib/query-keys.ts`, `frontend/hooks/` (`useRunningScan`'s first
  consumer, a settled-sweep hook, a sightings hook),
  `frontend/components/space/` (the scan control, the ghost layer, the log),
  `frontend/e2e/`.
- This change also **mounts** a control onto `docked-fleet-actions`'s fleet
  panel (the scan control's host, per *The Scan Surface Remains Usable While
  the Canvas Is Unavailable*) without carrying any `docked-fleet-actions`
  delta: the panel's own requirements are unchanged, and the mount is a
  placement decision recorded in `system-space-view`'s own requirement text,
  not a behavior this change adds to that capability.
- Sequencing: archives after `build-production-space-view` and before
  `delete-the-lattice`.

## 1. Red phase — failing tests before implementation

- [ ] 1.1 Write the failing Go test for the opaque sighting document id: one
      sweep against a host with two masked ships mints two distinct paths, the
      target id is not a substring of either, and a retried resolve converges on
      the same path (`sighting-records` — *A Sighting Is Minted In the Resolve
      Transaction, Exactly Once*)
- [ ] 1.2 Write the failing Go test for the served `id`: the same record read
      twice serves the same id; two sweeps against the same target serve
      different ids; the response still carries no `targetId`
      (*A Sighting Record Is Addressable On the Wire Without Naming Its Target*)
- [ ] 1.3 Write the failing Go test for the continuation cursor: with a pile
      larger than `PageMax`, the returned `nextCursor` contains no sighted
      target's id
- [ ] 1.4 Write the failing Go tests for `GET /v1/fleets/:fleetId/scan-targets`
      ownership: foreign-corp fleet, nonexistent fleet, and corpless requester
      all answer `404` with an empty body, indistinguishable from one another —
      guarded by a `requireRouteImplemented` assertion so an unwired route
      cannot pass these tests for the wrong reason (link 7b's recorded failure)
- [ ] 1.5 Write the failing Go tests for the target set's eligibility: a body
      beyond range absent, a body the star occludes absent, a body at exactly
      the squared range present, a sightline exactly tangent to the star
      present, an own fleet listed, a foreign fleet in the same system absent,
      an own fleet in lane transit absent, a scanner in lane transit yielding an
      empty set, and a system with nothing in reach yielding an empty set
- [ ] 1.6 Write the failing Go test pinning list/commit agreement: a target
      served with duration `D` at world time `T` commits, at that same `T`, to
      an arrive time of exactly `T + D`
- [ ] 1.7 Write the failing Go test for the settle-on-read distinction: a due
      sweep settled by an interior read mints records carrying the sweep's
      action id and pulse-reach `asOf`, never the read's world time
      (`sighting-records` — *A due sweep settled by a read mints as the sweep,
      not as the read*)
- [ ] 1.8 Write the failing Go tests for the system-filtered pile read: two
      systems' records in one pile with a filtered read serving only one
      system's; a filtered read bounded to `PageMax` whose cursor continues
      within the filter rather than across the whole pile; a filtered read of a
      never-swept system returning empty, not an error; an unfiltered read
      unchanged (`sighting-records` — *The Pile Read Filters To One System On
      Request*)
- [ ] 1.9 Write the failing Go test for the self-sweep rejection: a fleet
      committing a focused scan against its own fleet id is rejected with the
      same named error and response shape as an unresolvable `hostId`, creating
      no action and claiming no sensor slot — and the same fleet is absent from
      its own served scan-target set (`focused-scan` — *A Fleet Is Never a Host
      For Its Own Sweep*). Both are currently GREEN-WRONG: host resolution finds
      the scanner in its own system, `WithinRange` passes at distance zero, and
      `Occluded` early-returns `false` for a zero-length segment
- [ ] 1.10 Write the failing Go test for the digest's cross-process stability:
      re-derive a document id from the same `(actionId, targetId)` against a
      pinned expected constant, so a per-process or randomly seeded derivation
      cannot pass
- [ ] 1.11 Write the failing Go test for the belt-member exclusion: a fleet in
      range of a belt with a clear sightline reads exactly one entry for that
      belt and none for any `{beltId}#{k}` member, and a commit naming a member
      id is rejected with the same named error as an unresolvable host
      (`focused-scan` — *A belt is served as one host, never as its members*).
      Both are currently GREEN-WRONG: `system/bodies.go` puts every synthesized
      member in the `BodyTable` and `resolveScanHost` accepts any
      `bt.Body(hostId)`
- [ ] 1.12 Write the failing Go test for the persisted `reasonCode`: resolve a
      fizzling scan, then **read the action back from the store** and over
      `GET /v1/actions`, and assert both carry the resolver's reason code. Do
      not assert on the returned `ResolveResult` — that assertion already passes
      against a field no document holds. **Check first whether this is already
      green.** `add-stationkeep-hold-verb` is landing concurrently and its
      working-tree test `backend/stationkeep_mine_and_burn_e2e_test.go` already
      asserts `act["reasonCode"] == "clean"` read back through
      `GET /v1/actions/:id`; if `action.DaoImpl.ResolveOne` persists
      `reasonCode` by the time this change starts, verify that assertion and
      3.10's served assertion hold and mark 3.10 done — an already-green test
      here is a neighbouring change having landed the fix, not a failure of the
      red phase (`action-dispatch` — *A resolver's reason code is persisted on
      the action and served*)
- [ ] 1.13 Write the failing Go tests for the settled-inbox read: more settled
      actions than the bound, served most-recently-settled first and truncated
      to the newest rather than to an arbitrary subset; a fixture large enough
      that a bare unordered limit fails it; and a `running`-status read that
      still serves an action carrying no `resolvedAt`
      (`action-dispatch` — *Inbox by Actor Query Param*'s three new scenarios)
- [ ] 1.14 Verify every test written in section 1 is red **for the right reason**
      in a scratch copy with the missing symbols stubbed, not merely red because
      a symbol does not compile
- [ ] 1.15 Write the failing Go test for the self-scanner exclusion: a fleet
      docked at a belt with no other ship attached beneath it commits a
      focused scan against that belt; after the sweep resolves, **read the
      pile back** and assert no minted record names the scanning fleet as its
      target and that exactly one clean-sweep record was minted for that host.
      This is currently GREEN-WRONG: `chainBeneath` walks attachments with no
      owner filter, so the scanner — masked beneath the host it swept — mints
      a sighting of itself (`focused-scan` — *A Sweep Never Files a Claim
      Against Its Own Scanner*). Write a second case with one other ship
      beneath the same host: exactly one record is minted, naming that ship
      and not the scanner, and **no** clean-sweep record accompanies it

## 2. Backend — the sighting record's identity and the pile read

- [ ] 2.1 Replace `sightings.MintWrites`' document-id derivation with an opaque
      deterministic identifier over `(actionId, targetId)` (and over `actionId`
      alone for a clean sweep): a **collision-resistant digest rendered at no
      fewer than 128 bits** (e.g. the leading 128 bits or more of SHA-256,
      hex- or base32-encoded), fixed-length, with **no float arithmetic** — so
      it needs no fixture family and no cross-target determinism enrolment —
      and with **no per-process, per-instance, or randomly seeded input**
- [ ] 2.2 Do NOT reach for a 32-bit non-cryptographic hash or for
      `hash/maphash`: the identifier IS the Firestore document path, so a
      collision is a silent overwrite through the resolver's
      `tx.Set(..., MergeAll)` — undetectable data loss in a pile that never
      expires — and FNV-1a birthday-collides around 10^5 records, while
      `maphash` is randomly seeded per process and mints a duplicate whenever a
      retry lands on a different Cloud Run instance
- [ ] 2.3 Add `Id` to `sightings.Sighting`, populated from the document id on
      read, serialized as `id`; keep `TargetId` at `json:"-"`
- [ ] 2.4 Populate `Id` in `Dao.Get` and `Dao.List` from each snapshot's
      document id, so a record served from any path carries the same
      identifier. Note that `Dao.Get` has **no production caller** — `Dao.List`
      is the only path a record reaches the wire by — so this half is
      consistency work, not a served surface; the orphan audit in section 9
      covers fields, not methods, and would not have flagged it. Do not add a
      caller for it, and do not let a test of `Get` stand in for a test of the
      served `id`
- [ ] 2.5 Update `backend/router_sightings_read_test.go`'s hand-derived
      `docId` and `backend/disclosure_wiring_e2e_test.go`'s minted fixture to
      the new derivation
- [ ] 2.6 Confirm `MintWrites` remains the only minting mechanism and that
      `fleet/scan_resolver_mints_only_via_sightings_test.go`'s AST check still
      passes against the new derivation
- [ ] 2.7 Re-run link 5's existing tests for the minting scenarios this change
      restates but does not alter — reading the pile mints nothing, sustained
      passive proximity mints nothing, a burn or lane-transit resolution mints
      nothing — against the new derivation, rather than rewriting them
- [ ] 2.8 Accept `systemId` on `GET /v1/sightings` and thread it through
      `Service.List` into `Dao.List` as a `Where("systemId", "==", ...)`
      equality filter, composed with the existing `asOf desc, __name__ desc`
      order and the same `PageMax` bound; a request naming no system is
      unchanged
- [ ] 2.9 Keep the continuation cursor's shape and opacity unchanged under the
      filter, and assert a filtered page's cursor continues the **filtered**
      sequence, not the whole pile's
- [ ] 2.10 Add the `(systemId asc, asOf desc, __name__ desc)` composite index
      for the `sightings` collection to `infra/terraform/firestore-indexes.tf`
      — the emulator auto-indexes, so the tests pass without it and only
      production fails — and record in the change that Travis must
      `terraform apply`

## 3. Backend — the scan-target read

- [ ] 3.1 Extract the commit's host-eligibility half from `fleet.Service.Scan`
      into a shared helper so the list and the commit apply one implementation
      of host resolution, `disclosure.WithinRange`, and `disclosure.Occluded` —
      never two that can drift
- [ ] 3.2 Add `Service.ScanTargets(ctx, fleetId)` returning, for each eligible
      host, its host id, whether it is a body or an own fleet, and the sweep
      duration `roundTripMs` would price at the same world time
- [ ] 3.3 Exclude from the set: **the reading fleet itself**, **every derived
      belt member**, every fleet owned by another corporation, every own fleet
      in lane transit, every host beyond `disclosure.FocusedScanRange`, and
      every host the star occludes — with no entry and no reason field for any
      of them. The self-exclusion is not implied by the geometry: distance zero
      passes `WithinRange` and `Occluded` early-returns `false` for a
      zero-length segment. The belt-member exclusion is not implied either:
      `system/bodies.go` synthesizes `AsteroidsPerBelt` members per belt into
      the `BodyTable` with ids `{beltId}#{k}`, and iterating the table would
      publish nine entries for one belt — member ids no other read serves and
      the client has no name, mark, or facts surface for (`focused-scan` — *A
      belt is served as one host, never as its members*; `system-space-view`'s
      *Belt Members Render as Decorative Detail, Never as Separate Pickable
      Bodies*). The belt feature itself stays eligible
- [ ] 3.4 Reject a scan commit whose `hostId` is the scanning fleet's own id,
      **and one whose `hostId` names a derived belt member**, in
      `resolveScanHost`, through the existing `ErrScanHostUnresolved` — the same
      named error and response shape as any unresolvable host, so no new
      player-facing copy is needed (`focused-scan` — *A Fleet Is Never a Host
      For Its Own Sweep*, *A commit naming a belt member is rejected as
      unresolvable*). Excluding either from the list alone leaves the commit
      accepting it: `resolveScanHost` accepts any `bt.Body(hostId)`, and the
      body table contains every synthesized member
- [ ] 3.5 Return an empty set (not an error) when the scanning fleet is itself
      in lane transit, when it already has a running focused scan (its sensor
      slot is claimed, so no commit would be accepted), and when nothing is in
      reach
- [ ] 3.6 Add `GET /v1/fleets/:fleetId/scan-targets` to `fleet.Handler`,
      resolving the fleet through the same owner check the command endpoints use
      so a foreign or nonexistent fleet answers `404` with an empty body
- [ ] 3.7 Serve the target set and **no world time**: no client requirement
      measures anything against a scan-target read's world time — the running
      sweep's countdown measures against the view's own scale-correct
      projected world time, the inbox supplying only the ETA and the
      committed time — so serving one here would be this chain's signature
      defect committed inside the change whose goal is a named consumer for
      every field added
- [ ] 3.8 Order **and** bound the settled-action inbox read the outcome report
      consumes: add `OrderBy("resolvedAt", Desc)` plus a named limit to
      `action.Dao.List`'s `done`-status path, and accept an optional `type`
      equality filter that composes with `status` (`type=scan&status=done` is
      the settled-sweep report's own read), so
      `GET /v1/actions?actor=&status=done[&type=scan]` serves the most
      recently settled actions — of that type when named — rather than every
      action that fleet ever completed. A bare limit is **not** sufficient and
      is worse than none: the query today is `Where("actor","==")` plus an
      optional status with no `OrderBy`, so a limit over an unordered query
      returns an **arbitrary subset** — the report would fold "greatest
      `resolvedAt`" over that subset and could show a stale sweep, or none,
      while the newest stays unacknowledged forever and a dismissal
      acknowledges the wrong action. Both ordering scenarios still pass under
      a bare limit, because a two-action fixture is under any bound
      (`action-dispatch` — *A settled-status read is bounded, and its bound
      keeps the newest*, *A type-and-status filtered read composes both
      filters, ordered and bounded*)
- [ ] 3.8a Apply the ordering **only on the `done` path**, and add **both**
      composite indexes it needs to `infra/terraform/firestore-indexes.tf` —
      which today carries only `(actor, status, eta ASC)` —
      `(actor ASC, status ASC, resolvedAt DESC)` for the status-only path and
      `(actor ASC, type ASC, status ASC, resolvedAt DESC)` for the
      `type`-and-status path, and record that Travis must `terraform apply`
      both in the same apply. Two traps: the emulator auto-indexes, so the
      tests stay green and only production 500s (the same trap Decision 14
      already flags for the sightings index); and `resolvedAt` is
      `firestore:"...,omitempty"` and therefore **absent** on a running action's
      document, so an unconditional `OrderBy("resolvedAt")` would drop every
      running action and silently break `useRunningScan`
      (`action-dispatch` — *A running-status read is unaffected by the settled
      ordering*)
- [ ] 3.9 Wire the route in the router and confirm section 1's
      `requireRouteImplemented` guard now passes for the right reason
- [ ] 3.10 Persist `reasonCode` on the resolved action: add
      `{Path: "reasonCode", Value: res.ReasonCode}` to the existing `tx.Update`
      in `action.DaoImpl.ResolveOne` (`action/dao.go`), which is the resolve
      transaction's only write to the action doc and today sets `status`,
      `outcome`, and `resolvedAt` and nothing else, and mirror it onto the
      returned in-memory `Action` beside `a.Outcome = res.Outcome`. Assert it by
      **reading the action back from the store** (and over
      `GET /v1/actions`), never by inspecting the returned `ResolveResult` —
      `fleet/scan_resolver_test.go:280,371` assert `res.ReasonCode != ""` on the
      resolver's return value and pass today against a field that reaches no
      document and no wire. Writing the empty string for verbs that set no code
      is harmless: `json:"reasonCode,omitempty"` keeps it off the wire.
      This is a **live defect**, not new work: `openspec/specs/focused-scan/
      spec.md` already requires that "the resolved action carries a reason code
      identifying whether the failure was range or occlusion", and shipped code
      violates it. Without it, section 6's five-way fizzle copy map renders its
      unrecognized-code fallback for every fizzle, and task 9.2's orphan audit
      passes anyway — the field has a named consumer and no producer.
      **Check first whether this is already done.** `add-stationkeep-hold-verb`
      is landing concurrently and asserts the persisted code read back through
      the inbox without carrying a dao task of its own; if `ResolveOne` already
      writes `reasonCode` when this change starts, verify the read-back and the
      served assertion and mark this task done rather than reapplying it
      (`action-dispatch` — *A resolver's reason code is persisted on the action
      and served*)
- [ ] 3.11 **Verify-only.** `add-stationkeep-hold-verb` landed 3.10's
      persistence concurrently with this change's drafting, which made
      `action/model.go:203-206`'s comment on `ResolveResult.ReasonCode` — "the
      structured classifier **mirrored onto `Action.ReasonCode` at the same
      status flip**" — true. Confirm the comment still matches the code; make
      no edit if it does. Re-correct it only if 3.10's persistence has
      regressed, in which case the comment must go with it (same failure shape
      as `encodeCursor`'s "opaque wire shape" comment)
- [ ] 3.12 Exclude the scanning fleet from the set of ships a resolving sweep
      mints records for, in `disclosure.FocusedScan`/`sighting.go` or
      `fleet/resolver.go` (whichever owns the chain-walk after 3.1's
      extraction) — `chainBeneath` mints without an owner filter, so a fleet
      masked beneath the very host it swept is minted a sighting of itself
      today. If the scanner is the only ship the chain resolves beneath the
      host, mint the single clean-sweep record instead of an empty result
      (`focused-scan` — *A Sweep Never Files a Claim Against Its Own
      Scanner*). Do NOT keep the current behaviour
- [ ] 3.13 Give `fleet/resolver.go`'s "scan already settled" no-op path
      (`f.Scan == nil`, ~lines 140-150) its own named reason code (e.g.
      `alreadySettled`) rather than returning an outcome with no reason code
      at all — the client's filed-vs-fizzled rule (*A Settled Sweep Reports
      Its Outcome, Including Each Fizzle Reason, in Player Copy*) treats **any**
      served reason code as a fizzle and its absence as filed records, so a
      no-mint path with no code would misreport as having filed records over
      an empty log. Persist and serve it through the same 3.10 write

## 4. Client plumbing

- [ ] 4.1 Add the `Sighting` and sighting-page types (`id`, `systemId`, `asOf`,
      `hostId`, `cleanSweep`, and the composition payload) to
      `frontend/lib/types/`. Deliberately **omit** the served `actionId`: it is
      on the response, but nothing in this change reads it — the row↔ghost match
      is on the sighting's `id`, and the settled report addresses its action by
      the inbox's own id — so carrying it would create exactly the
      consumer-less field 9.2 exists to forbid
- [ ] 4.2 Add the scan-target types (host id, kind, sweep duration — and no
      world time; see 3.7)
- [ ] 4.3 Widen `frontend/lib/types/action.ts`'s `GameAction` with the served
      `reasonCode`, `resolvedAt`, and `acknowledgedAt` fields section 6
      consumes; all three are already on the backend's `Action` and absent from
      the client type, so the fizzle copy, the most-recently-settled ordering,
      and report suppression have nothing to read without this
- [ ] 4.4 Add `sightingService.list({ systemId?, cursor? })` over
      `GET /v1/sightings`, passing `systemId` for the ghost layer's read and
      omitting it for the corporation-wide log
- [ ] 4.5 Add `fleetService.scan(fleetId, hostId)` and
      `fleetService.scanTargets(fleetId)`
- [ ] 4.6 Add `actionService.listSettled(actorId, { type })` over
      `GET /v1/actions?actor=&status=done&type=scan` and
      `actionService.acknowledge(actionId)` over
      `POST /v1/actions/:actionId/acknowledge`
- [ ] 4.7 Add `queryKeys.sightings` (the corp pile, cursor-keyed pages, with the
      optional `systemId` filter part of the key so the system-filtered ghost
      read and the unfiltered log read never share a cache entry) and
      `queryKeys.fleets.scanTargets(fleetId)`
- [ ] 4.8 Add `useSightings`, `useScanTargets`, `useScan` (the commit mutation),
      and `useSettledScan`; **adopt the existing `useRunningScan`** rather than
      writing a second hook, and repoint its lattice-era doc comment (it
      currently describes drawing a committed beam from an origin system and aim
      target — neither exists)
- [ ] 4.9 Invalidate `queryKeys.actions.running(fleetId)` and
      `queryKeys.fleets.scanTargets(fleetId)` on a successful scan commit and on
      a successful cancel
- [ ] 4.10 Add a hook that reads the running sweep for **every** own fleet in the
      open system, not only the acting one — the inbox is per-actor, so this is
      one inbox read per own fleet in the system — so the view can schedule a
      settle refetch per running sweep's ETA (`system-space-view`'s *A Running
      Sweep Self-Schedules the Refetch That Settles It, Then Reads the Inbox and
      the Pile*)

## 5. The scan control — target list, commit, guard

- [ ] 5.1 Build the scan control in the space view's fleet panel, listing exactly
      the served targets, each labelled by the served host **kind** plus its raw
      host id, and showing its served sweep duration. Resolve no name from
      anywhere: no wire surface serves one — the interior read's feature DTO
      (`backend/system/fog.go`'s `fogFeatureDTO`) has no `name` field, the
      station read serves none, and `fleetDTO` has none — so the id is the
      label, presented as a legitimate one and never as a placeholder or an
      error state
- [ ] 5.2 Assert in test that a body present in the interior read but absent from
      the served target set is not offered, and that no range or occlusion
      predicate is evaluated client-side
- [ ] 5.3 Render the explicit "no host in range" state for an empty served set,
      and a retriable error offering no targets for a failed target read, and
      the transit/already-sweeping variants of the empty state, which state
      that reason instead of "no host in range"
- [ ] 5.4 Keep the scan control's target independent of the space view's
      body/gate/point selection — a burn's selection is not a sweep's target
- [ ] 5.5 State the sweep's exposure on the control — detectable for the sweep's
      whole duration before commit and while it runs, plus the masking break when
      the acting fleet is attached to a host, and no masking claim when it is not
- [ ] 5.6 Commit `POST /v1/fleets/:fleetId/scan` with the selected entry's served
      host id and nothing else
- [ ] 5.7 Map every commit rejection to this client's own copy — out of range,
      occluded, host unresolved, a sweep already running, scanner in lane transit
      — and never render raw server text, status codes, or reason codes
- [ ] 5.8 Add the unmapped-reason fallback the two sibling capabilities already
      have: a rejection reason with no specific copy renders a generic,
      non-technical message, never blank text and never the raw server string;
      assert it with a reason the copy map does not contain
- [ ] 5.9 Present a stale-target rejection as "the sweep is no longer possible"
      and refetch the target list in-flow, never as an application-error state
- [ ] 5.10 Guard the commit control against double-submit **synchronously, within
      the submitting invocation**, not via a pending-state flip that lands on a
      later render; release the guard when the request settles or fails.
      **Adopt `frontend/hooks/use-submit-guard.ts`'s `useSubmitGuard` rather
      than writing a second guard** — it is the ref-based, render-independent
      shared guard 8a-2 shipped and sell/mine/refuel/burn/jump already consume;
      a second implementation of this shape is exactly the duplication task 9.1
      forbids for `useRunningScan`
- [ ] 5.11 Test the guard with two activations inside one tick, with no awaited
      step and no render between them, and assert exactly one request left the
      client — the shape `use-refuel.test.tsx` failed to use
- [ ] 5.12 Make the scan control keyboard-operable: the target list, the commit
      control, the cancel affordance, the report's dismiss affordance, and the
      log affordance each Tab-reachable, Enter/Space-activatable, with a visible
      focus indicator (`system-space-view` — *A Settled Sweep and the Scan
      Controls Are Reachable and Announced*)

## 6. The running sweep — countdown, cancel, settle, outcome

- [ ] 6.1 Show the running sweep from `useRunningScan`, counting down to the
      action's ETA against **the view's scale-correct projected world time**
      (the inbox supplying only the ETA and committed time); assert in test
      that no fleet-read field and no scale-1 assumption is used
- [ ] 6.2 Withhold the commit control while a sweep is running
- [ ] 6.3 Present a past-ETA running sweep as settling, never as a negative or
      growing countdown
- [ ] 6.4 Offer cancel through `POST /v1/actions/:actionId/cancel` naming the
      scan action's id; assert in test that no fleet-level cancel request is
      issued
- [ ] 6.5 On a successful cancel, clear the countdown and re-offer the target list
- [ ] 6.6 Add a self-scheduled refetch per running sweep ETA across **every own
      fleet in the open system** (not the acting fleet alone — 4.10's hook is the
      source), reusing the existing named ETA cushion — no new constant; assert
      that a non-acting fleet's sweep is scheduled too
- [ ] 6.7 After the post-ETA interior refetch **has completed**, and only then,
      refetch (a) the system-filtered sighting pile and (b) **both of that
      fleet's action-inbox reads, the running-status and the settled-status
      one**; assert the ordering in test, not just that all three fire, and
      assert both inbox reads are re-issued
- [ ] 6.8 Assert the inbox refetch specifically: without it a settled sweep
      reads as settling forever and no outcome report is ever produced, because
      the running window, the outcome, the `reasonCode`, and `acknowledgedAt`
      live only on the inbox. Add a test that a sweep past its ETA transitions
      from "settling" to a reported outcome with no user action
- [ ] 6.9 Assert that no sweep-driven refetch is scheduled when no own fleet in
      the open system has a running sweep, and that the view's other refetch
      rules are unchanged
- [ ] 6.10 Report the most recently settled, unacknowledged sweep — selected by
      the greatest served `resolvedAt`, ETA breaking a tie, never by the inbox's
      arrival order, which carries no ordering guarantee — folding the
      **type-filtered** settled-inbox read (`type=scan&status=done`), never the
      type-agnostic one, as records filed, with an affordance that opens the
      sighting log
- [ ] 6.11 Map each of the five served fizzle reason codes (`outOfRange`,
      `occluded`, `leftSystem`, `laneTransit`, `hostUnresolved`) to distinct
      player copy, plus 3.13's `alreadySettled` code to its own copy (a racing
      resolver already settled this sweep — distinct from the five, and never
      folded into the generic fallback), and any other unrecognized code to
      "the sweep returned nothing"; never display the raw code or the action's
      raw outcome text
- [ ] 6.12 Acknowledge the action when the report is dismissed, and assert that a
      subsequent refetch does not report the same settled sweep again
- [ ] 6.13 Announce a landed settled sweep through a polite live region, naming
      whether records were filed or the sweep returned nothing — the same
      treatment 8a-2 gives a burn arrival, a jump arrival, and a mine completion
- [ ] 6.14 Render the failed-inbox states: a failed running-status read shows
      that the sweep's state could not be read, offers a retry, and withholds
      the commit control; a failed settled-status read shows that the outcome
      could not be read, offers a retry, and leaves the commit control offered
      (*The Sweep Surface's Reads Fail Independently…*)

## 7. Ghosts in the scene

- [ ] 7.1 Draw a ghost mark for every target-naming record served by the
      **system-filtered** pile read (`GET /v1/sightings?systemId=<open system>`),
      at the record's stored position, labelled with its `asOf`; never by
      client-side filtering of an unfiltered, paged pile, which silently omits
      this system's older records once the pile outgrows the fetched pages
- [ ] 7.2 Assert the ghost does not move as world time advances — no velocity
      integration, no orbital prediction, no extrapolation of any kind
- [ ] 7.3 Display the record's stored velocity as a heading-and-speed readout on
      the ghost's facts surface, its only consumer
- [ ] 7.4 Make the ghost's register visually distinct from a live contact's and
      from an own fleet's
- [ ] 7.5 Draw no ghost for a clean-sweep record, and omit (with a logged
      diagnostic naming the record) any target-naming record whose stored
      position is exactly the origin — the origin-omission rule 8a-2 states for
      a body, a fleet, and a contact does not name a ghost, so this change
      states it for the fourth mark class rather than assuming it
- [ ] 7.6 Keep a ghost out of the space view's selection entirely: selecting a
      ghost SHALL NOT create or replace a body/gate/point selection and SHALL
      NOT arm a burn. Hold the ghost highlight as separate additional state, and
      assert that clicking a ghost drawn over empty space does not become the
      point selection the exhaustive picking rule would otherwise produce
- [ ] 7.7 Assert that a ghost is never hidden because a live contact exists, that
      no proximity or position heuristic merges or pairs them, and that no
      same-entity indication is presented anywhere — the ghost and the contact
      stay independent marks
- [ ] 7.8 Keep the scan control, its countdown, its cancel, its settled report,
      and the log affordance invokable while the canvas region shows its
      unsupported or interrupted state; ghost marks are simply absent then, with
      no error attributed to them and no fallback rendering
- [ ] 7.9 Render the ghost layer's failed-read state: a failed system-filtered
      pile read states that this system's sightings could not be read and offers
      a retry; assert an empty scene is never presented as "no sightings here"

## 8. The sighting log

- [ ] 8.1 Build the log: one row per served record, rendered in the served order,
      with no client-side re-sorting
- [ ] 8.2 Render a composition row (system, `asOf`, swept host, hull count, hull
      types) and a clean-sweep row (system, `asOf`, swept host, clean-sweep
      marker, no composition)
- [ ] 8.3 Render the swept host as its raw host id on every row, with no name
      lookup and no fallback branch — nothing serves a host name (see 5.1), so
      a name path here would be a branch no response can take. Assert a single
      path across a planet, a moon, a belt, a lane gate, a station, a fleet, and
      a row for another system's sweep, and assert the host column carries no
      placeholder, empty cell, or degraded-state styling. Note the contrast the
      spec draws: the **system** column does keep a real fallback, because
      `GET /v1/galaxy` does serve a system `name`
      (`sighting-log` — *The swept host is shown as its raw id, whatever the
      host is*)
- [ ] 8.4 Assert no row displays an owner, corporation, or fleet identity for the
      sighted target
- [ ] 8.5 Resolve the system name from the loaded galaxy data, falling back to the
      raw system id when it has no name — `fleet-roster`'s existing precedent
- [ ] 8.6 Page with the server's continuation cursor passed back verbatim; offer
      load-more only while a non-empty cursor was returned; append rather than
      replace; assert the client never parses, rewrites, or constructs a cursor
- [ ] 8.7 Read the pile on mount, after the post-sweep settle refetch completes,
      and on explicit refresh; assert no timer poll fires while the log is open
- [ ] 8.8 Order the **mount** read behind the settling interior read too: when
      the log mounts while an own fleet in the open system has a past-ETA
      unsettled sweep, issue the first pile read only after the interior read
      that settles it has completed. This is the likelier race — a sweep whose
      ETA passed while the view was closed settles on open — and the post-ETA
      ordering alone does not cover it
- [ ] 8.9 Render the explicit loading, empty (naming the focused scan as the way
      to file a record), and retriable-error states; assert a failed read is
      never presented as an empty pile
- [ ] 8.10 Add the affordance on the system space view that opens the log, and
      assert that opening and closing it leaves the space view mounted with its
      acting-fleet selection unchanged
- [ ] 8.11 Cross-highlight row↔ghost, matched on the record's served `id` and on
      nothing else; assert two records with identical position, `asOf`, host, and
      composition highlight independently
- [ ] 8.12 State, when a clean-sweep row or a row for another system is selected,
      that the record has no mark in the open system, and highlight nothing

## 9. Orphan and drift audit

- [ ] 9.1 Confirm `useRunningScan` now has a production consumer, and that no
      second running-scan hook was introduced alongside it
- [ ] 9.2 Build the audit list by **derivation, not recall**: walk this change's
      own tasks in sections 3–8 and enumerate every field it adds to a client
      type or newly consumes from a wire response — whatever the walk turns up,
      including fields added after this task was written. A hardcoded list
      cannot catch a field it does not name, which is exactly how a `name`
      field with neither producer nor consumer survived an earlier draft of
      this very audit. Mechanically: diff the client types this change touches
      (`frontend/lib/types/`) against their pre-change state, and grep the
      change's own task text for each added field name; the two must agree, and
      any field in the type diff that no task names is itself a finding. The
      list at the time of writing is the sighting `id` (row key and row↔ghost
      matching), the target `kind` (the target list's label), the target
      duration (the target list's price), the action `reasonCode` (the fizzle
      copy), `resolvedAt` (most-recently-settled ordering), and
      `acknowledgedAt` (report suppression) — treat it as a floor to check the
      derivation against, never as the audit itself
- [ ] 9.2a Check every field the 9.2 derivation produced in **both** directions,
      and fail the audit on either half:
      (a) a **named production consumer** — a specific component or hook that
      reads it, not merely a type declaring it; and
      (b) a **producer that actually serves it**, verified against the
      **response DTO struct and a real response body**, never against the
      domain/Firestore struct and never against a mock or fixture the client
      authored. The DTO/domain distinction is the whole point: `system.Feature`
      carries `Name`, `fogFeatureDTO` does not, and only the latter is the
      wire. `reasonCode` is why half (b) exists — it had a consumer, a struct
      field, a Firestore tag, a doc comment asserting it was written, and green
      tests, and reached no document and no wire (3.10). A field failing (a) is
      dropped from the client type; a field failing (b) either gains a producer
      task or is dropped from the spec that promised it
- [ ] 9.2b Confirm the scan-target read serves **no** world time — the field cut
      in 3.7, and the one this audit was originally written to catch
- [ ] 9.3 Confirm no field was added to `fleetDTO` for the sweep window, and that
      the window is read only from the action inbox
- [ ] 9.4 Confirm no client module computes a range or occlusion predicate; any
      render math added lives under `frontend/lib/space/` so
      `check-mirror-map.sh`'s anti-mirror pass can see it
- [ ] 9.5 Confirm `disclosure.Contact` gained no id and `sightings.Sighting`'s
      `TargetId` is still `json:"-"`

## 10. Validation

- [ ] 10.1 Turn every red test from section 1 green; add the client unit tests
      for sections 5–8 covering every scenario in the four spec deltas
- [ ] 10.2a Playwright: the scan journey against the real stack, ending in a
      **clean-sweep** record — commit a sweep from the space view against the
      served target with the largest `durationMs` (the served list is the
      fixture; a freshly spawned fleet with an empty list is itself a product
      finding, not a reason to skip), watch the countdown, let it settle, and
      see the settled report and its log row, with no navigation or reload.
      This leg draws no ghost: a fresh corporation's own fleet is the only
      other ship in reach, and 3.12 excludes the scanner from its own sweep's
      minted set, so the ordinary journey mints a clean sweep, not a
      target-naming record (finding M3 closes the self-sighting behaviour a
      single-corporation journey would otherwise have relied on for a ghost)
- [ ] 10.2b Playwright: the ghost leg, using a **seeded fixture** rather than a
      live sweep — a target-naming record cannot be produced by a single
      corporation's own journey once 3.12 lands (M3), and staging a second
      corporation's fleet into the same system is a second signup plus a
      multi-lane transit (design.md Open Question 11 records this as deferred
      for Travis). Seed a target-naming sighting document directly into the
      test corporation's pile through the Firestore emulator, at the
      digest-derived document path (2.1's derivation, for a fixed action id
      and target id), naming a host in the open system. Assert: the ghost
      renders in the scene at the record's stored position; its `asOf` label
      is shown; selecting the log row highlights the ghost; and activating the
      ghost highlights the log row — both directions of the row↔ghost match
- [ ] 10.2c Add the Firestore-emulator fixture-seeding helper 10.2b depends on:
      write a sighting document at the path 2.1's digest derivation produces
      for a chosen `(actionId, targetId)` pair, with the record's other fields
      set directly (position, velocity, hull count, hull types, `systemId`,
      `asOf`), the swept **`hostId`** (a host in the open system, so the log
      row's host column renders), and the clean-sweep marker explicitly
      unset, so the record is target-naming — a declared test fixture, not a
      route the product serves
- [ ] 10.3 Playwright: double-click the scan commit control for real and assert
      exactly one sweep was committed — the leg `use-refuel.test.tsx`'s hand-held
      harness could not have caught
- [ ] 10.4 Playwright: cancel a running sweep and confirm the target list returns
      and a new sweep can be committed immediately
- [ ] 10.5 Playwright: a **lane-transit** fizzle, not a range or occlusion one
      — the only fizzle a real-time browser gesture can arrange. A sweep's
      pulse-reach is at most ~2.5 s after commit (`roundTripMs`'s ~4.9 s max
      duration halved) and no player-path motion covers a meaningful fraction
      of the 48-unit focused-scan range in that window, so `outOfRange` and
      `occluded` are not arrangeable against the real stack and stay
      unit-tested only (section 1). Arrange the lane-transit fizzle instead:
      fly the fleet to a lane gate and dock (the journey already does this
      leg); open the scan control and commit a sweep against the gate body the
      fleet is attached to (always a served target — distance ≈ 0, in range,
      never occluded); **immediately** commit the jump (it claims only the
      movement channel, so both commands are live); let the sweep's ETA pass
      while the fleet is in transit or has already arrived. Assert the report
      shows `laneTransit` or `leftSystem` copy — accept either, since which
      one fires depends on whether the sweep is folded before or after the
      jump settles — that it is not the generic unmapped-reason fallback, and
      that no record was filed (the log stays empty or unchanged)
- [ ] 10.6 Playwright: the scan control and the log affordance remain usable with
      the canvas region in its unsupported state
- [ ] 10.7 Playwright: close the space view with a sweep running, reopen it
      after its ETA has passed, and confirm on **first render** — the
      mount-path ordering (8.8), not the post-ETA one, and with no second read
      and no reload — that the settled sweep's record is in the log and its
      report is shown. The ordinary single-fleet sweep this journey commits
      mints a **clean-sweep** record (3.12 excludes the scanner from its own
      sweep's minted set), so no ghost is expected from this leg on its own.
      Reusing 10.2c's seeded target-naming fixture (the same digest-derived
      document this journey does not otherwise produce), assert that when
      that fixture is present in the pile at reopen, its ghost is **also**
      drawn on first render, on the same one-read mount ordering — proving the
      ghost layer's mount-path ordering (8.8) without inventing a second
      fixture
- [ ] 10.8 Run `python3 .claude/skills/code-quality-checks/check.py` and clear
      every finding, including the data-testid and test-file-coverage validators
      for the new components
- [ ] 10.9 Re-run `openspec validate add-scan-and-sightings-surface --strict` and
      `python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface`
      immediately before archiving, after `build-production-space-view` has
      archived, and rehearse `openspec archive` on a scratch copy

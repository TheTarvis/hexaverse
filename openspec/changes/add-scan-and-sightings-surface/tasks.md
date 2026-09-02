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
- [ ] 1.8 Verify every test written in section 1 is red **for the right reason**
      in a scratch copy with the missing symbols stubbed, not merely red because
      a symbol does not compile

## 2. Backend — the sighting record's identity on the wire

- [ ] 2.1 Replace `sightings.MintWrites`' document-id derivation with an opaque
      deterministic identifier over `(actionId, targetId)` (and over `actionId`
      alone for a clean sweep) — fixed-length, integer-only, no float
      arithmetic, so it needs no fixture family and no cross-target determinism
      enrolment
- [ ] 2.2 Add `Id` to `sightings.Sighting`, populated from the document id on
      read, serialized as `id`; keep `TargetId` at `json:"-"`
- [ ] 2.3 Populate `Id` in `Dao.Get` and `Dao.List` from each snapshot's
      document id, so a record served from any path carries the same identifier
- [ ] 2.4 Update `backend/router_sightings_read_test.go`'s hand-derived
      `docId` and `backend/disclosure_wiring_e2e_test.go`'s minted fixture to
      the new derivation
- [ ] 2.5 Confirm `MintWrites` remains the only minting mechanism and that
      `fleet/scan_resolver_mints_only_via_sightings_test.go`'s AST check still
      passes against the new derivation
- [ ] 2.6 Re-run link 5's existing tests for the minting scenarios this change
      restates but does not alter — reading the pile mints nothing, sustained
      passive proximity mints nothing, a burn or lane-transit resolution mints
      nothing — against the new derivation, rather than rewriting them

## 3. Backend — the scan-target read

- [ ] 3.1 Extract the commit's host-eligibility half from `fleet.Service.Scan`
      into a shared helper so the list and the commit apply one implementation
      of host resolution, `disclosure.WithinRange`, and `disclosure.Occluded` —
      never two that can drift
- [ ] 3.2 Add `Service.ScanTargets(ctx, fleetId)` returning, for each eligible
      host, its host id, whether it is a body or an own fleet, and the sweep
      duration `roundTripMs` would price at the same world time
- [ ] 3.3 Exclude from the set: every fleet owned by another corporation, every
      own fleet in lane transit, every host beyond `disclosure.FocusedScanRange`,
      and every host the star occludes — with no entry and no reason field for
      any of them
- [ ] 3.4 Return an empty set (not an error) when the scanning fleet is itself
      in lane transit, and when nothing is in reach
- [ ] 3.5 Add `GET /v1/fleets/:fleetId/scan-targets` to `fleet.Handler`,
      resolving the fleet through the same owner check the command endpoints use
      so a foreign or nonexistent fleet answers `404` with an empty body
- [ ] 3.6 Serve the response's world time alongside the target set
- [ ] 3.7 Wire the route in the router and confirm section 1's
      `requireRouteImplemented` guard now passes for the right reason

## 4. Client plumbing

- [ ] 4.1 Add the `Sighting` and sighting-page types (`id`, `actionId`,
      `systemId`, `asOf`, `hostId`, `cleanSweep`, and the composition payload)
      to `frontend/lib/types/`
- [ ] 4.2 Add the scan-target types (host id, kind, sweep duration, world time)
- [ ] 4.3 Add `sightingService.list(cursor?)` over `GET /v1/sightings`
- [ ] 4.4 Add `fleetService.scan(fleetId, hostId)` and
      `fleetService.scanTargets(fleetId)`
- [ ] 4.5 Add `actionService.listSettled(actorId)` over
      `GET /v1/actions?actor=&status=done` and
      `actionService.acknowledge(actionId)` over
      `POST /v1/actions/:actionId/acknowledge`
- [ ] 4.6 Add `queryKeys.sightings` (the corp pile, cursor-keyed pages) and
      `queryKeys.fleets.scanTargets(fleetId)`
- [ ] 4.7 Add `useSightings`, `useScanTargets`, `useScan` (the commit mutation),
      and `useSettledScan`; **adopt the existing `useRunningScan`** rather than
      writing a second hook, and repoint its lattice-era doc comment (it
      currently describes drawing a committed beam from an origin system and aim
      target — neither exists)
- [ ] 4.8 Invalidate `queryKeys.actions.running(fleetId)` and
      `queryKeys.fleets.scanTargets(fleetId)` on a successful scan commit and on
      a successful cancel

## 5. The scan control — target list, commit, guard

- [ ] 5.1 Build the scan control in the space view's fleet panel, listing exactly
      the served targets, each labelled body-or-own-fleet and showing its served
      sweep duration, resolving body names from the interior read and fleet names
      from the own-fleets read
- [ ] 5.2 Assert in test that a body present in the interior read but absent from
      the served target set is not offered, and that no range or occlusion
      predicate is evaluated client-side
- [ ] 5.3 Render the explicit "no host in range" state for an empty served set,
      and a retriable error offering no targets for a failed target read
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
- [ ] 5.8 Present a stale-target rejection as "the sweep is no longer possible"
      and refetch the target list in-flow, never as an application-error state
- [ ] 5.9 Guard the commit control against double-submit **synchronously, within
      the submitting invocation**, not via a pending-state flip that lands on a
      later render; release the guard when the request settles or fails
- [ ] 5.10 Test the guard with two activations inside one tick, with no awaited
      step and no render between them, and assert exactly one request left the
      client — the shape `use-refuel.test.tsx` failed to use

## 6. The running sweep — countdown, cancel, settle, outcome

- [ ] 6.1 Show the running sweep from `useRunningScan`, counting down from the
      served world time to the action's ETA using the action's own committed time
      and ETA; assert in test that no fleet-read field is consulted for the window
- [ ] 6.2 Withhold the commit control while a sweep is running
- [ ] 6.3 Present a past-ETA running sweep as settling, never as a negative or
      growing countdown
- [ ] 6.4 Offer cancel through `POST /v1/actions/:actionId/cancel` naming the
      scan action's id; assert in test that no fleet-level cancel request is
      issued
- [ ] 6.5 On a successful cancel, clear the countdown and re-offer the target list
- [ ] 6.6 Add the running sweep's ETA to the view's self-scheduled refetch
      candidates, reusing the existing named ETA cushion — no new constant
- [ ] 6.7 Issue the sighting-pile refetch **only after** the post-ETA interior
      refetch has completed; assert the ordering in test, not just that both fire
- [ ] 6.8 Assert that no sweep-driven refetch is scheduled when no sweep is
      running, and that the view's other refetch rules are unchanged
- [ ] 6.9 Report the most recently settled, unacknowledged sweep: records filed,
      with an affordance that opens the sighting log
- [ ] 6.10 Map each of the five served fizzle reason codes (`outOfRange`,
      `occluded`, `leftSystem`, `laneTransit`, `hostUnresolved`) to distinct
      player copy, and an unrecognized code to "the sweep returned nothing";
      never display the raw code or the action's raw outcome text
- [ ] 6.11 Acknowledge the action when the report is dismissed, and assert that a
      subsequent refetch does not report the same settled sweep again

## 7. Ghosts in the scene

- [ ] 7.1 Draw a ghost mark for every pile record whose system is the open system
      and which names a target, at the record's stored position, labelled with
      its `asOf`
- [ ] 7.2 Assert the ghost does not move as world time advances — no velocity
      integration, no orbital prediction, no extrapolation of any kind
- [ ] 7.3 Display the record's stored velocity as a heading-and-speed readout on
      the ghost's facts surface, its only consumer
- [ ] 7.4 Make the ghost's register visually distinct from a live contact's and
      from an own fleet's
- [ ] 7.5 Draw no ghost for a clean-sweep record and none for a record belonging
      to another system
- [ ] 7.6 Assert that a ghost is never hidden because a live contact exists, that
      no proximity or position heuristic merges or pairs them, and that no
      same-entity indication is presented anywhere — the ghost and the contact
      stay independent marks
- [ ] 7.7 Keep the scan control, its countdown, its cancel, its settled report,
      and the log affordance invokable while the canvas region shows its
      unsupported or interrupted state; ghost marks are simply absent then, with
      no error attributed to them and no fallback rendering

## 8. The sighting log

- [ ] 8.1 Build the log: one row per served record, rendered in the served order,
      with no client-side re-sorting
- [ ] 8.2 Render a composition row (system, `asOf`, swept host, hull count, hull
      types) and a clean-sweep row (system, `asOf`, swept host, clean-sweep
      marker, no composition)
- [ ] 8.3 Assert no row displays an owner, corporation, or fleet identity for the
      sighted target
- [ ] 8.4 Resolve the system name from the loaded galaxy data, falling back to the
      raw system id when it has no name — `fleet-roster`'s existing precedent
- [ ] 8.5 Page with the server's continuation cursor passed back verbatim; offer
      load-more only while a non-empty cursor was returned; append rather than
      replace; assert the client never parses, rewrites, or constructs a cursor
- [ ] 8.6 Read the pile on mount, after the post-sweep settle refetch completes,
      and on explicit refresh; assert no timer poll fires while the log is open
- [ ] 8.7 Render the explicit loading, empty (naming the focused scan as the way
      to file a record), and retriable-error states; assert a failed read is
      never presented as an empty pile
- [ ] 8.8 Add the affordance on the system space view that opens the log, and
      assert that opening and closing it leaves the space view mounted with its
      acting-fleet selection unchanged
- [ ] 8.9 Cross-highlight row↔ghost, matched on the record's served `id` and on
      nothing else; assert two records with identical position, `asOf`, host, and
      composition highlight independently
- [ ] 8.10 State, when a clean-sweep row or a row for another system is selected,
      that the record has no mark in the open system, and highlight nothing

## 9. Orphan and drift audit

- [ ] 9.1 Confirm `useRunningScan` now has a production consumer, and that no
      second running-scan hook was introduced alongside it
- [ ] 9.2 Confirm every field this change adds to the wire has a named consumer
      in the client: the sighting `id` (row key and row↔ghost matching), the
      target `kind` (the target list's label), the target duration (the target
      list's price), the action `reasonCode` (the fizzle copy), and
      `acknowledgedAt` (report suppression)
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
- [ ] 10.2 Playwright: the scan journey against the real stack — commit a sweep
      from the space view, watch the countdown, let it settle, see the record
      appear in the log and its ghost in the scene, with no navigation or reload
- [ ] 10.3 Playwright: double-click the scan commit control for real and assert
      exactly one sweep was committed — the leg `use-refuel.test.tsx`'s hand-held
      harness could not have caught
- [ ] 10.4 Playwright: cancel a running sweep and confirm the target list returns
      and a new sweep can be committed immediately
- [ ] 10.5 Playwright: a fizzling sweep (scanner drifts out of range before
      pulse-reach) reports its own copy and files no record
- [ ] 10.6 Playwright: the scan control and the log affordance remain usable with
      the canvas region in its unsupported state
- [ ] 10.7 Run `python3 .claude/skills/code-quality-checks/check.py` and clear
      every finding, including the data-testid and test-file-coverage validators
      for the new components
- [ ] 10.8 Re-run `openspec validate add-scan-and-sightings-surface --strict` and
      `python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface`
      immediately before archiving, after `build-production-space-view` has
      archived, and rehearse `openspec archive` on a scratch copy

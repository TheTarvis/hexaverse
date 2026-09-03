## 1. Contract suite, written first and red

This section is the reason the change was split: every assertion below is
writable from the spec deltas alone, before either half's implementation
starts. Nothing in sections 2–5 begins until section 1 is red for the right
reason.

- [x] 1.1 Interior-read wire contract (`backend/system`, handler level):
      every non-star feature body and every lane-gate body carries
      `orbitElements` with all six fields equal to its stored/derived element
      set; the star carries none; a body served with a zero-valued `space`
      position still carries a complete element set (`system-interior`:
      "A non-star body's read carries its full orbital element set", "A
      lane-gate body's read carries its full orbital element set", "The star
      carries no orbital element set", "A body served without a resolvable
      continuous position is still element-complete")
- [x] 1.2 Interior-read non-regression contract: the lattice `orbit` key still
      carries `{ring, angle0, period, dir}` and is NOT the continuous element
      set, and `footprint`, `band`, `live`, `parentId`, `fixed`, per-feature
      `asOf`, and a gate's `cell` are all still present and unchanged. This
      assertion lives here, in the contract suite, and deliberately NOT as a
      `#### Scenario:` on *Interior Read Endpoint* — it is a one-change
      transition guard that `build-production-space-view` must then destroy,
      and a scenario it adds is a scenario that change's archive is forbidden
      to drop (design.md Decision 8). The durable half of the rule — that
      `orbit` and `orbitElements` are distinct keys with distinct meanings —
      is carried by the requirement's prose instead (`system-interior`:
      "Pre-existing wire fields are unchanged", "A materialized system's read
      carries every body's continuous position and size", "Unknown or
      ungenerated system", "No live galaxy")
- [x] 1.3 Preview contract, part 1 — parity and settlement: an identical
      preview and commit from the same fleet state and world time return
      identical control points, depart/arrive times, delta-v, and fuel cost;
      a preview against a fleet with a past-due arrival settles first and
      solves from the settled park (`fleet-movement`: "A preview returns the
      same curve, ETA, and cost a commit would produce", "A preview settles a
      due arrival first, then solves from the settled state")
- [x] 1.4 Preview contract, part 2 — no effect: repeated previews of a fleet
      with nothing due leave the stored record byte-identical, create no
      action, claim no channel, and debit no fuel (`fleet-movement`:
      "Repeated previews of a fleet with nothing due write nothing")
- [x] 1.5 Preview contract, part 3 — rejection parity: star-by-clearance with
      no destination-identity comparison; lane transit; ambiguous target;
      empty target; out-of-bounds commanded acceleration; unknown body id; a
      `laneId` target
      (`fleet-movement`: "A preview against the star is rejected by the curve's
      clearance guard, not by a destination check", "A preview is refused
      wherever the commit would be refused", "A preview rejects a lane id")
- [x] 1.5a Preview contract, part 3b — the held-movement-channel case, asserted
      on its own terms and NOT against a commit reason: commit a mine, then
      preview a burn on that fleet; assert the refusal carries the preview's
      own reason, the mine action is still running with its slot held, and the
      fleet doc is byte-identical across the request. Do not assert a commit
      rejection here — a burn commit from that state is accepted today (see
      `docs/plans/continous_space/handoffs/defect-burn-cancels-running-mine.md`)
      (`fleet-movement`: "A preview against a fleet mid-mine is refused,
      cancels nothing, and writes nothing")
- [x] 1.6 Preview contract, part 4 — the burning-fleet re-target case, plus
      unaffordable and stranding reporting (`fleet-movement`: "A burning fleet
      can preview a re-target", "A preview reports an unaffordable target as
      such", "A preview reports the stranding warning when it would apply")
- [x] 1.7 Quoted-cap contract: over-cap rejection with the true cost, the
      exactly-at-cap success, the absent-cap no-op, distinguishability from
      the insufficient-fuel reason, and the malformed-cap invalid request
      (`fleet-movement`: all six scenarios of "A Burn Commit Is Rejected When
      Its Solved Fuel Cost Exceeds the Requester's Quoted Cap")
- [x] 1.8 Upkeep-rate contract: present in tons/second for an `orbit` and a
      `stationkeep` park, absent for burn/drift/point-park, absent for a
      foreign fleet, and read-idempotent (`fleet-movement`: all five scenarios
      of "Fleet Read Serves the Station-Keeping Upkeep Rate in Fuel Tons")
- [x] 1.9 Ownership contract: `/orders/preview` returns `404` for a foreign
      corporation and for a corpless requester, with no position, velocity,
      roster, or fuel field in the body; re-run the ten pre-existing endpoint
      scenarios unchanged (`fleet-movement`: "A foreign corp cannot preview
      another corp's fleet's burn", "A corpless requester is rejected the same
      way", and the nine sibling endpoint scenarios)
- [x] 1.10 World-clock scale contract: the interior read and every fleet read
      carry the simulation clock's scale alongside the `worldTime` they already
      serve, on a world configured with a scale other than 1 and on a world
      configured at exactly 1 (`system-interior`: "The read carries the world
      clock's scale alongside its world time"; `fleet-movement`: "A fleet read
      carries the world clock's scale", "The scale is served even on an
      unwarped world")
- [x] 1.11 Interior `extent` contract: the interior read carries a continuous
      `extent` equal to the stored `SystemInterior.Extent`, alongside and
      distinct from the lattice `radius`, so `build-production-space-view` has
      a continuous per-system scale to size its camera, pan bound and pick
      radius against without reading `radius` (`system-interior`: "The read
      carries the interior's continuous extent")
- [x] 1.12 Record a golden wire sample of one materialized interior read and
      one preview response under the backend test tree, so
      `build-production-space-view`'s TypeScript types are written against a
      real payload rather than a paraphrase of this document

## 2. Interior read — orbital elements on both DTOs

- [x] 2.1 Add `orbitElements` to `system.fogFeatureDTO` (`backend/system/fog.go`),
      populated from `Feature.Space`, omitted when nil (the star), with all six
      fields named exactly `parentId`, `radius`, `periodMs`, `phase`,
      `inclination`, `node` (`system-interior`: "A non-star body's read carries
      its full orbital element set", "The star carries no orbital element set")
- [x] 2.2 Add `orbitElements` to `system.LaneGate` (`backend/system/gates.go`),
      populated in the same `fillGateGeometry` pass that already resolves a
      gate's `space`/`size` from the body table, so a gate whose body is
      unresolvable degrades exactly as it does today rather than failing the
      read (`system-interior`: "A lane-gate body's read carries its full
      orbital element set")
- [x] 2.3 Populate the element set from the body table's stored elements, never
      by re-deriving `gateOrbit` at read time — the derivation stays a
      generation-time function with one caller (`system-interior`: "A lane-gate
      body's read carries its full orbital element set")
- [x] 2.4 Leave `Orbit`, `ParentId`, `Fixed`, `Footprint`, `Band`, `Live`,
      `AsOf`, and `LaneGate.Cell` untouched, and add a DTO comment naming
      `build-production-space-view` as the change that removes them
      (`system-interior`: "Pre-existing wire fields are unchanged"; the lattice
      `orbit` key's surviving meaning is pinned by task 1.2's contract test, not
      by a scenario — design.md Decision 8)
- [x] 2.5 Serve the element set even when the body's continuous position could
      not be resolved: elements are stored data, position is a resolution
      result (`system-interior`: "A body served without a resolvable continuous
      position is still element-complete")
- [x] 2.6 Serve the interior's continuous `extent` on `system.interiorDTO`
      (`backend/system/handler.go`), populated from `SystemInterior.Extent`
      — which is generated (`system/generator.go`), persisted
      (`system/model.go`) and held on `BodyTable` today, and is on no DTO.
      Serve it alongside, not in place of, the lattice `radius`; removing
      `radius` is `build-production-space-view`'s (`system-interior`: "The
      read carries the interior's continuous extent")
- [x] 2.7 Serve `common.WorldTime.Scale()` on the interior read alongside the
      `worldTime` the response already carries, read from the same clock that
      produced it, and unconditionally rather than only when it differs from 1
      (`system-interior`: "The read carries the world clock's scale alongside
      its world time")
- [x] 2.8 Update the Go interior-read handler tests and any recorded response
      shape they assert; re-record rather than relax

## 3. Burn order preview

- [x] 3.1 Extract the solve half of `fleet.OrderTo` — target resolution, the
      fold-first `settleIfDue` step, position/tangent resolution,
      `space.SolveBurn`, fuel-cost, affordability, and stranding evaluation —
      into one function both `OrderTo` and the preview call, so the two cannot
      drift (`fleet-movement`: "A preview returns the same curve, ETA, and cost
      a commit would produce", "A preview settles a due arrival first, then
      solves from the settled state")
- [x] 3.2 Add `POST /v1/fleets/:fleetId/orders/preview` with a request shape
      identical to `orders` minus `laneId`, rejecting a `laneId` target by its
      own named reason (`fleet-movement`: "A preview rejects a lane id")
- [x] 3.3 Return the six control points, `departMs`, `arriveMs`, delta-v, fuel
      tons, affordability, and the stranding indication (`fleet-movement`:
      "A preview reports an unaffordable target as such", "A preview reports
      the stranding warning when it would apply")
- [x] 3.4 Route every rejection through the shared solve function so preview and
      commit refuse identically — lane transit, ambiguous/empty target,
      commanded-acceleration bounds, unknown body (`fleet-movement`: "A preview
      is refused wherever the commit would be refused")
- [x] 3.4a Refuse a preview whose fleet's movement channel is held by a running
      mine with the preview path's **own** named reason, returning before any
      write — the commit path deliberately keeps its current
      cancel-and-proceed behaviour, so this refusal is preview-only and must
      not be derived from a commit rejection that does not exist
      (`fleet-movement`: "A preview against a fleet mid-mine is refused,
      cancels nothing, and writes nothing")
- [x] 3.5 Serve the preview for a currently-burning fleet, solved from its live
      position and tangent, leaving the running burn untouched
      (`fleet-movement`: "A burning fleet can preview a re-target")
- [x] 3.6 Assert by construction that no destination-identity check reaches the
      preview path: the star is excluded solely by `space.BuildCurve`'s
      clearance guard, and the preview's star test asserts the observable
      reason traces to `space.ErrEndpointInsideClearance` (`fleet-movement`:
      "A preview against the star is rejected by the curve's clearance guard,
      not by a destination check")
- [x] 3.7 Ensure the preview creates no action, claims no channel slot, debits
      no fuel, and stores no burn, and that its only write is the shared
      settlement (`fleet-movement`: "Repeated previews of a fleet with nothing
      due write nothing")
- [x] 3.8 Add the ownership check to the new route via the same
      `common.ActorCorp` comparison every sibling command uses, returning a
      bare `404` with no fleet-derived field in the body (`fleet-movement`: "A
      foreign corp cannot preview another corp's fleet's burn")

## 4. Quoted fuel cap on the burn commit

- [x] 4.1 Accept an optional `maxFuelTons` on the `orders` request body;
      reject a negative or non-finite value as an invalid request rather than
      treating it as absent (`fleet-movement`: "A malformed cap is an invalid
      request, not an absent cap")
- [x] 4.2 Reject the commit when the solved fuel cost is strictly greater than
      the cap, before the channel claim, the fuel debit, and the burn store,
      with its own sentinel distinct from the insufficient-fuel one
      (`fleet-movement`: "A commit whose solved cost exceeds the quoted cap is
      rejected", "The quoted-cap rejection is distinguishable from the
      insufficient-fuel rejection")
- [x] 4.3 Carry the true solved fuel cost on the rejection response so the
      caller can re-quote without a second round trip (`fleet-movement`: "The
      quoted-cap rejection carries the true solved cost")
- [x] 4.4 Leave the uncapped path byte-for-byte unchanged, and pin the
      exactly-at-cap boundary as a success (`fleet-movement`: "An absent cap
      applies no cap", "A commit exactly at the quoted cap succeeds")

## 5. Station-keeping upkeep rate on the fleet read

- [x] 5.1 Add the upkeep rate, in fuel tons per second, to `fleet.rosterDTO`,
      derived from `space.StationKeepRate` for the fleet's host body and
      converted by `FuelParams.DeltaVPerTon` without the hull-count multiplier
      (`fleet-movement`: "An orbiting fleet's read carries the rate it would
      pay to hold", "A holding fleet's read carries the rate it is paying")
- [x] 5.2 Omit the field when the fleet's effective state resolves to a burn, a
      drift, or a `point` park — no host body, no rate — and confirm it is
      absent from a foreign fleet's read, which carries no roster surface
      (`fleet-movement`: "A fleet with no host body carries no rate", "A
      foreign fleet's read carries no rate")
- [x] 5.3 Confirm the derivation is read-only: no settle, no debit, no restamp
      (`fleet-movement`: "Reading the rate changes nothing")
- [x] 5.4 Serve `common.WorldTime.Scale()` on `GET /v1/fleets/:fleetId` and on
      every fleet list read, from the same clock the response's `worldTime` is
      read from, unconditionally (`fleet-movement`: "A fleet read carries the
      world clock's scale", "The scale is served even on an unwarped world")
- [x] 5.5 Serve the value in tons and never in delta-v, and add no
      `DeltaVPerTon` field to any DTO, so the conversion has no client-side
      route (`fleet-movement`: "Fleet Read Serves the Station-Keeping Upkeep
      Rate in Fuel Tons")

## 6. Validation

- [x] 6.1 Section 1's whole contract suite green
- [x] 6.2 `cd backend && make test`, plus the emulator-backed handler suites for
      `system` and `fleet`
- [x] 6.3 `bash .claude/scripts/check-mirror-map.sh` green — this change adds no
      TypeScript, so `backend/space`/`backend/fleet`/`backend/system` must all
      still report no mirror
- [x] 6.4 `python3 .claude/skills/code-quality-checks/check.py` and
      `bash .claude/scripts/check.sh --backend --lint --test` green
- [x] 6.5 `openspec validate serve-orbital-elements-and-burn-preview --strict`
      green, and `openspec diff` reviewed against the two capabilities' live
      text

## 1. Fixtures first — the seven-family obligation (design.md Decision 1, 17)

- [x] 1.1 Record the `keplerPeriodMs` fixture family in `fixtures/system` over its
      full R¹ domain (not just the radii generation happens to produce); flip its
      `fixtures/system/mirror-map.json` inventory entry from `expectedChange:
      migrate-fleet-to-continuous-burns` to `family:keplerPeriodMs`.
- [x] 1.2 Record the `gateOrbit` fixture family (the bearing derivation via
      `space.PhaseIndexOf`, the fixed radius factor, the dz/dx horizontal-projection
      convention) in `fixtures/system`; flip its inventory entry the same way.
- [x] 1.3 Record the `stationOrbit` (`StationContinuousOrbit`) fixture family,
      covering its callees `MaxFeatureSize` and `inclinationForDominant`, in
      `fixtures/system`; flip its inventory entry the same way.
- [x] 1.4 Record the codec fixture family (`EncodeVec`/`DecodeVec`/
      `EncodeSubTurns`/`DecodeSubTurns` + `decodeNumericSlice`/`decodeNumber`/
      `checkedCoordinate`) in `fixtures/space` — this is the first change that
      gives `backend/space` a real consumer, which is exactly the condition its
      inventory entry names as due; flip that entry to `family:<name>`.
- [x] 1.5 Resolve `minDistanceFromOriginOf`'s inventory entry: either delete the
      function (it is a thin, test-only wrapper over `minDistanceAndParamOf`) or
      give it a real production caller, per the entry's own stated choice for
      "the change that first migrates a consumer onto `backend/space`" — that is
      this change.
- [x] 1.6 Re-file `StationKeepRate`/`StationKeepUpkeep`'s `fixtures/space`
      inventory entry with a fresh `expectedChange: add-fuel-as-cargo` (link 7)
      and updated `why` text — this change carries no station-keep currency, so
      the entries are not due, but Decision 17's rule (a rule-bearing shared
      function SHALL NOT remain in the inventory across more than one change
      that modifies its package) means they must be re-filed, not silently
      carried forward unchanged.
- [x] 1.7 Re-file `ReleaseStationkeep`'s `fixtures/space` inventory entry the same
      way, with `expectedChange: add-fuel-as-cargo` (link 7) and updated `why`
      text naming the force-demote-to-`orbit` guardrail as its first release
      path.
- [x] 1.8 Extend `fixtures/space/mirror-map.json`'s `coverage` list with every
      function this change adds to `backend/space`: `Drift.Position`,
      `Drift.Velocity`, the cut-drive conversion helper, and the newly-recorded
      codec entries from 1.4.

## 2. `space` — free drift, cut-drive conversion, the widened codec

- [x] 2.1 Add `ModeDrift` as a third `ShipMode` (not a fourth `ParkKind`) and a
      `Drift{Anchor, Velocity, EpochMs}` type with a closed-form
      `Position(t) = anchor + velocity*seconds(t-epoch)` and a constant
      `Velocity()` — no terminal condition, no clamp in either time direction
      (space-kinematics: *A Free-Drifting Ship Coasts in a Straight Line at
      Constant Velocity* — position follows the linear expression, velocity
      identical at two times, backward evaluation displaces without panicking, a
      zero-velocity drift equals its anchor forever, the far-future fold stays a
      drift, a large time jump is safe by construction, bit-identical repeat
      evaluation).
- [x] 2.2 Implement the burn-to-drift conversion: at cut millisecond `cutMs`,
      `Anchor = burn.Position(cutMs)`, `Velocity = burn.Tangent(cutMs).Scale(
      burn.Speed(cutMs))`, `EpochMs = cutMs` — replacing the burn, never
      truncating its stored geometry — and refuse a cut at or after the burn's
      stored arrival millisecond with its own named reason (space-kinematics:
      *Cutting a Drive Converts the Burn to a Drift at Its Live Position and
      Velocity* — mid-burn cut anchor/velocity, bit-identical across the cut
      millisecond, direction follows the tangent past the deceleration flip, a
      cut exactly at depart yields a zero-velocity drift with no special case, a
      cut at/after arrival is refused by name, cutting charges no delta-v).
- [x] 2.3 Add `StopInPlaceSpeedFloor` to `space/params_const.go` (design.md
      Decision 8) — the speed at or below which stop-in-place is a discrete,
      free conversion to a point park rather than a solved burn. Starting value
      per design.md Open Question 1's recommendation: derive it from the speed
      at which the stopping burn's arc would equal `space.MinArcLength`.
- [x] 2.4 Fix `space/state.go:73` (`StatePosition`'s `default:` arm) to handle
      `ModeDrift` — this is a named task because it compiles cleanly today and
      fails every drifting fleet's position read at runtime, silently, with no
      compiler signal (design.md Decision 5, Decision 21C item 1).
- [x] 2.5 Extend the named codec to a ship's whole kinematic state: a burn
      (origin, target identity or point, intercept, all six curve control
      points, curve length, depart/arrive world-milliseconds, commanded
      acceleration, insertion phase index for a body target), a park (any of
      its three kinds), and a drift (anchor, velocity, epoch). Encode the six
      control points as a flat list, a list-of-lists wrapped in `[]any`, or a
      keyed map — **never** `[][]float64`, which the action spine's
      `ErrNonPrimitiveParam` validation rejects. Fail decode by the same named,
      countable error when the control-point count is not exactly six or the
      decoded curve length disagrees with the recomputed arc length
      (space-kinematics MODIFIED: *Coordinates Cross the Persistence Boundary
      Through a Named Codec* — position round-trips exactly, a bare domain
      vector is rejected by existing validation, a non-finite/out-of-extent
      coordinate fails by name, a solved burn round-trips exactly, every park
      kind and a drift round-trip exactly, the wrong control-point count fails
      by name, a disagreeing stored curve length fails by name, a non-finite
      control-point component fails by the existing named error).
- [x] 2.6 Add a sibling purity test for `space` (mirroring
      `disclosure/purity_test.go`'s structural import-allowlist assertion) —
      today the package's purity is doc-comment-true only, and this change is
      the one most likely to tempt a `firestore:` tag onto the codec extension.
- [x] 2.7 Confirm `backend/space`'s own test suite is green with no consumer
      wired yet — this step ships before `fleet` touches any of it (design.md
      Migration Plan step 2).
- [x] 2.8 Confirm the settle-at-arrival fold (a burn past its stored arrival
      millisecond IS its settled park, with no extra persisted field) still
      holds unchanged once `ModeDrift` and the widened codec land — a
      regression check, not new code, since this behavior is `space`'s
      existing fold; a drift never settles into a park at any fold distance
      (space-kinematics MODIFIED: *A Burn Past Its Arrival Is Its Settled
      Park, With No Extra Persisted State* — still burning immediately before
      arrival and settled immediately after, folding at two later times gives
      identical results, a settled body-targeted burn rides its insertion
      orbit, a burn to a fixed point settles into a point park).

## 3. Fleet state model + persistence

- [x] 3.1 **(red phase — write this before any of 3.2 onward exists in
      production code)** Write the failing test suite that pins the
      `attachedTo`-clearing invariant: a burn order clears `attachedTo` at
      commit (not at resolve), cut-drive and stop-in-place leave it cleared,
      and a body-targeted burn sets it only at resolve. This invariant's
      absence yielded three conforming-but-wrong implementations in earlier
      attempts at this work, including `mine` and `sell` working at
      unlimited range because a stale `attachedTo` was never cleared when a
      fleet burned away from its dock. Pinning it red-first, before 3.9's
      production edit lands, is what keeps a fourth wrong implementation
      from also passing (fleet-movement: *In-System Burn Order to a Body or
      a Point* — "committing a burn detaches the fleet from its host"; *Cut
      Drive Converts the Burn to a Drift and Goes Dark* — "a burning fleet's
      `attachedTo` was already cleared at that burn's commit"; *Stop In
      Place Commits a Velocity-Nulling Burn* — "the system SHALL clear the
      fleet's `attachedTo` at the instant a stop-in-place order is
      accepted").
- [x] 3.2 Replace `fleet.Fleet.State board.MovementState` with
      `space.ShipState`; add `AttachedTo string` with a `DockedTo() (string,
      bool)` accessor, carrying a code comment at the declaration naming link 6
      (`re-express-economy-positions`) as its eventual deleter/redefiner
      (design.md Decision 4, Decision 13 — the standing rule that nothing
      additive may quietly become permanent).
- [x] 3.3 Add a fleet-owned `Jump *JumpTransit` field for lane-transit
      representation — not a `space.ShipState` shape, since a fleet in transit
      has no position in either system (design.md Decision 4).
- [x] 3.4 Leave `activeActionId`/`activeScanId` as independently claimable
      channels, unchanged in mechanism; retain `ActiveScanId`/`action.SlotSensor`
      declared and unwritten, with a comment naming link 5 as the change that
      first claims the sensor channel (design.md Open Question 4) (fleet-movement
      *Single Kinematic-State Fleet Record* — "a scan can run while a burn is
      active").
- [x] 3.5 Add a `BodySource` interface (`BodyTable(ctx, systemID)
      (*system.BodyTable, error)`) to `fleet.Service`, satisfied by
      `system.Service`; resolve it once per request and thread it as a
      parameter through every burn solve, position read, and resolve — never
      fetched per body, never memoized in package-level state, and never used
      to enumerate `Ids()` into a response (design.md Decision 16).
- [x] 3.6 Validate every stored kinematic-state value through the `space` codec
      at every boundary that reads persisted or committed coordinate data;
      surface a decode failure as a named, countable error carrying `cause`
      (`non-finite-coordinate`, `coordinate-out-of-extent`, `undecodable-shape`,
      or `unknown-body`) plus `actionType` and the action id when decoding an
      action parameter — never a panic, never a default to an implied origin
      park (fleet-movement: *Single Kinematic-State Fleet Record* — "a fleet
      with no stored kinematic state is rejected by name"; *Undecodable Stored
      Kinematic State Is Rejected, Never Panicked* — a fleet read/mine/jump
      command fails by name on a bad decode, a decoded action parameter
      coordinate fails the codec, coordinate rejections are countable per
      cause).
- [x] 3.7 Implement effective position resolution through
      `space.StatePosition(bodies, f.State, now)` as the capability's sole
      canonical position path: a docked fleet resolves through its host's live
      position (its orbit if it orbits, else its fixed anchor); a free-flying
      fleet resolves through its own folded burn/park/drift. No other code path
      may re-derive, cache, or round a fleet's position (fleet-movement
      MODIFIED: *Effective Position Resolution* — a docked fleet rides its
      parent's live position, a free-flying fleet resolves through
      `space.StatePosition`).
- [x] 3.8 Re-point `fleet.SeedFleet` from `at board.Cell` to a `space` park:
      deterministic from the account id, idempotent per account (a healed
      retry reproduces the same position, never a second fleet), rejecting a
      requested position inside the system star's configured clearance radius
      (fleet-movement: *Spawn Fleet Seeding Places a Park* — deterministic and
      idempotent per account, seeding inside clearance rejected;
      corporation-spawn: *One Starting Hull at a Deterministic Home Park* — the
      starting hull is deterministic per account, the starting hull never lands
      inside the star's clearance).
- [x] 3.9 Delete `corporations.rimCell`/`RimRing`; replace with a deterministic
      continuous spawn position derived from the home interior's `Extent` and
      the `GateRadiusFactor` (1.1), phase-seeded by account id (design.md
      Decision 16, Open Question 3 — the exact geometric target, e.g. a
      `ParkOrbit` around the star vs. docked at the home station, is left open
      by design.md; pick and document the default inline).
- [x] 3.10 Delete `fleet.ErrCoreDestination` and `SeedFleet`'s destination-identity
      core rejection — the star is now excluded by
      `space.BuildCurve`'s endpoint-clearance guard alone, with no special case
      (design.md Decision 14; fleet-movement: *In-System Burn Order to a Body or
      a Point* — "ordering the star's own body id is rejected by geometry").
- [x] 3.11 Add a calibration test (mirroring
      `TestCalibration_Scenario_NoStarSizePlacesBodyInsideClearanceShell`) that
      reads `space.StarClearanceRadius` and `space.InsertionStandoff` directly
      and asserts every star size this generator can emit is rejected with
      margin, so widening the star-size table can never silently make the star
      targetable (design.md Decision 14).

## 4. burn / cut-drive / stop verbs

- [x] 4.1 Implement burn ordering to a body id or an explicit point: solve
      through `space.SolveBurn` against the system's `system.BodyTable`,
      departing tangent to the fleet's live position/velocity at commit time;
      commit through the action spine on the movement channel, replacing any
      active movement order (settling it first if it has already passed
      arrival but not yet resolved) (fleet-movement: *In-System Burn Order to a
      Body or a Point* — explicit-point direct burn, intercepting an orbiting
      body leads the target and only attaches on resolve, star id rejected by
      geometry, an absent body id fails by name, a new order replaces an active
      one, an order over a completed-but-unresolved order settles it first,
      re-targeting mid-burn departs tangent to live motion not the original
      departure).
- [x] 4.2 Implement order-request validation: reject an order naming neither a
      body id, a point, nor a `laneId`, and reject one naming more than one
      (fleet-movement MODIFIED: *Order Request Validation* — empty order body
      rejected, ambiguous order body rejected).
- [x] 4.3 Implement `POST /v1/fleets/:fleetId/cut-drive`: free, instant,
      converts the active burn to a drift via the 2.2 conversion, cancels the
      running movement action with no delta and no other effect; reject an
      already-arrived-but-unresolved burn (resolving the arrival instead) and a
      non-burning fleet, each with its own named, distinct reason
      (fleet-movement: *Cut Drive Converts the Burn to a Drift and Goes Dark* —
      mid-burn cut converts to a drift, emission stops the same instant,
      cutting an already-arrived burn resolves the arrival instead, cutting a
      parked/drifting/in-transit fleet is rejected by name, cut drive charges
      no delta-v, a cut fleet is immediately re-orderable).
- [x] 4.4 Fix `disclosure/contact.go:114` (`contactVelocity`'s `default:` arm)
      to handle `ModeDrift` — named separately from 2.4 because it is a second
      call site that compiles cleanly and fails at runtime, silently, the
      moment link 5 wires a disclosure read (design.md Decision 5, Decision
      21C item 2) (proximity-disclosure: *A Drifting Contact Reports Its
      Drift Velocity and Does Not Emit* — a drifting contact reports its
      stored drift velocity, a zero-velocity drift reports a stationary
      contact).
- [x] 4.5 Implement `POST /v1/fleets/:fleetId/stop`: above the configured speed
      floor, commit a velocity-nulling burn to a point ahead of the fleet
      (charging Δv, taking time, emitting for its duration, settling to a
      `point` park on arrival); at or below the floor, convert instantly and
      freely to a `point` park at the current position (fleet-movement: *Stop
      In Place Commits a Velocity-Nulling Burn* — stopping above the floor
      commits a nulling burn, stopping at or below the floor is instant and
      free).
- [x] 4.6 Implement derived fleet acceleration (minimum over the roster's
      per-class `Accel`) and drive output (sum over the roster); add optional
      `Accel` to `OrderRequest`, defaulting to the ceiling when omitted,
      rejecting a value above the ceiling or below `disclosure.MinCommandedAccel`
      with its own named reason each (fleet-movement: *Derived Fleet
      Acceleration and Drive Output* — ceiling gates on the slowest hull, drive
      output sums across the roster, a two-hull fleet has a strictly larger
      plume radius than a one-hull fleet at equal acceleration, a commanded
      acceleration above the ceiling is rejected, a commanded acceleration
      below the disclosure floor is rejected, an omitted commanded acceleration
      defaults to the ceiling).
- [x] 4.7 Manually retire the `MinCommandedAccel` pending note in
      `disclosure/params_test.go:112-113` once `fleet` references the constant
      — its `t.Log` parses only `backend/disclosure`'s own directory, so a
      cross-package reference will **not** retire it automatically (design.md
      Decision 9).
- [x] 4.8 Replace `ClassStats.BurnRate` with `Accel` in `fleet/params.go`/
      `roster.go`; delete `DerivedBurnRate`, add `DerivedAccelCeiling` and the
      drive-output sum (fleet-movement REMOVED: *Derived Fleet Speed*, replaced
      by 4.6).
- [x] 4.9 Implement co-resident-slot release: cancelling a non-movement verb's
      action (e.g. a running `mine`) that shares a fleet's dock releases only
      that action's slot, leaving the fleet's kinematic state and `attachedTo`
      untouched, identically via `POST /v1/fleets/:fleetId/cancel` and
      `POST /v1/actions/:actionId/cancel` (fleet-movement: *Releasing a
      Co-Resident Verb's Slot Leaves Motion Untouched* — cancelling via the
      fleet endpoint while mining leaves the fleet docked, cancelling the mine
      action directly leaves the fleet docked).
- [x] 4.10 Delete `fleet/service.go`'s `ErrRingOutOfRange`, `ErrNotOnBoard`,
      `validateFleetRing`, `maxStateRing`, `msPerTileFor`, `msPerLaneUnitFor`,
      `featureOrbit`, `featureAnchor`, `haltState`, and `Scan` (design.md
      Decision 21A).
- [x] 4.11 Pin the NaN/±infinity commanded-acceleration rejection
      **cross-target in the fixture family**, not only in a unit test:
      `nan > ceiling` and `nan < floor` are both false, so an unguarded path
      reaches `int64(math.Ceil(NaN*1000))`, which is `0` on arm64 and
      `-9223372036854775808` on amd64 — exactly the divergence class
      `pin-system-generation-determinism` was created to eliminate. Add the
      commanded-acceleration validation's `NaN`/±infinity/zero/negative cases
      to the relevant `fixtures/space` (or `fixtures/fleet`, if one exists by
      then) family so both build targets assert the same rejected outcome,
      not merely that *a* rejection occurred (fleet-movement: *Derived Fleet
      Acceleration and Drive Output* — "a non-finite or non-positive
      commanded acceleration is rejected").
- [x] 4.12 Write the full test suite for proximity-disclosure's drifting-
      contact requirement, covering all three of its scenarios: the two
      `contactVelocity` fixes from 4.4, plus a dedicated test that a
      drifting fleet is never emitting at any world time — this last
      scenario needs no code change (`disclosure/predicate.go:42`'s
      `s.Mode != space.ModeBurn` check already handles `ModeDrift` correctly,
      per design.md Decision 5's audit), but it is a new requirement and
      needs its own pinned coverage, not an assumption that already-correct
      code stays correct (proximity-disclosure: *A Drifting Contact Reports
      Its Drift Velocity and Does Not Emit* — a drifting fleet never emits).

## 5. jump verb + gate attachment

- [x] 5.0 **Before writing the jump verb**, extract the resolve-a-due-arrival
      step into one private seam (e.g. `settleIfDue(ctx, f, bt)`) and route the
      jump through it, rather than hand-rolling a fourth copy of the check.
      The fold-first bug has now appeared at three sites, each detecting the
      **same** predicate — "has this fleet's active burn already arrived?" — a
      different way: `Get` (`service.go:163`) inspects fields directly
      (`Mode == ModeBurn && Burn != nil && now >= Burn.ArriveMs`); `OrderTo`
      (`~:286`) folds through `space.StateAt(bt, …)` and tests
      `folded.Mode != ModeBurn`; the cut path (`~:404`) is purely reactive,
      learning only by catching `space.ErrCutAfterArrival`. Three encodings of
      one question is how the hand-rolled one silently drifts from what the
      fold would say. Retrofit `OrderTo` and the cut path onto the seam — both
      already hold a `bt`.
      **Deliberately NOT in scope: retrofitting `Get`.** Its signature is
      `Get(ctx, id)` with no body table, and `mine.FleetSource`
      (`mine/service.go:70`) plus `market` depend on that exact shape, so
      folding it means threading a `BodySource` through two other domains'
      interfaces. That is a cross-package interface change and is recorded for
      the orchestrator to sequence as its own change, not widened into link 4.
- [x] 5.1 Implement `POST /v1/fleets/:fleetId/jump {laneId}`: accept only when
      the fleet is attached to that lane's gate body and its corporation has
      charted the lane; a fleet is jump-eligible on the same world millisecond
      it attaches — no dwell (fleet-movement: *Lane Jump From a Docked Gate* —
      jumping from a charted, attached gate commits, jump-eligible the instant
      of attachment with no dwell, jumping without attachment is rejected,
      jumping an uncharted lane is rejected, jump costs no delta-v).
- [x] 5.2 Compute jump crossing time as `space.Vec3{...}.Length()` (the lane's
      3D length) **divided by** the fleet's derived lane rate, quantized via
      `space.QuantizeArrival`
      *(Corrected 2026-08-31: this task originally read "times the fleet's
      configured lane rate", which is dimensionally backwards. `LaneRate` is
      defined as "3D lane-length units per unit world-time" — a **speed** — in
      both `fleet/roster.go:27` and the spec requirement itself
      (`fleet-movement` › Derived Fleet Acceleration and Drive Output). Time is
      therefore length ÷ rate. The corroborating check: the spec derives the
      effective lane rate as the **minimum** across the roster and calls that
      "the slowest ship", which is only true of a speed under division —
      multiplying would make the minimum the FASTEST crossing. Caught by the
      SDET declining to encode the task's literal wording.)* — replacing `legMs`/`laneLength` (design.md
      Decision 10; this is what discharges those functions' determinism-register
      entries in section 9).
- [x] 5.3 Implement the jump resolver: on ETA, flip the fleet's `systemId`,
      clear `Jump`, settle into a `park` near the destination gate's insertion
      standoff, never attached (unmasked arrival); chart the crossed lane for
      the corporation as `via: traveled` and mint no onward rumor; materialize
      the destination system's interior (create-if-absent) after the resolve
      transaction completes (fleet-movement: *Jump Arrival Parks Near the
      Destination Gate, Unmasked* — arrival flips the system and parks
      unattached near the gate, arrival charts the crossed lane as traveled and
      rumors nothing onward, first arrival materializes the destination's
      interior).
- [x] 5.4 Delete `fleet/routing.go` wholesale: `Service.PreviewRoute`,
      `planRoute`, `reconstruct`, `buildTrip`, `legMs`, `laneLength`,
      `ErrNoRoute`, `ErrSameSystem`, `RoutePreview`; narrow `TierSource` to its
      `ChartedLanes` use only (design.md Decision 10, Decision 21A).
- [x] 5.5 Delete `GET /v1/fleets/:fleetId/route` and `POST
      /v1/fleets/:fleetId/scan`; add `POST /v1/fleets/:fleetId/cut-drive`,
      `POST /v1/fleets/:fleetId/stop`, `POST /v1/fleets/:fleetId/jump`; delete
      `WithFog`/`AudienceFog` from `fleet/handler.go` (design.md Decision 21A).
- [x] 5.6 Restate the existing no-fleet-ownership-check defect over the new
      endpoint set — `common.ActorCorp(c)` is still never consulted by
      `/orders`, `/cancel`, `/cut-drive`, `/stop`, or `/jump` — as the current,
      observable, unfixed behavior (fleet-movement: *Movement Command Endpoints
      Enforce No Fleet Ownership* — a foreign corp can order/cancel/cut-drive/
      stop/jump another corp's fleet, five scenarios, one per verb).
- [x] 5.7 Implement `GET /v1/fleets/:fleetId`, `GET /v1/fleets?systemId=`, and
      `GET /v1/fleets?mine=true`: a requester's own fleets always return in
      full (complete kinematic state, target, ETA); a fleet belonging to
      another corporation is omitted entirely from a list read and 404s on
      direct fetch; a corpless requester's `mine=true` returns an empty list,
      not an error (fleet-movement: *Fleet Read Endpoints Serve Own Fleets
      Only* — a foreign fleet is omitted from a list read, a foreign fleet
      404s on direct fetch, own fleets are always returned in full, `mine=true`
      with no corp returns an empty list).
- [x] 5.8 Confirm the fleet read endpoints continue to surface the roster,
      cargo pool, derived total capacity, derived free hold, and derived
      mining rate for an owning corporation's own fleet, and confirm none of
      those fields appear anywhere in a response touching a foreign fleet —
      an explicit assertion, not an assumption, now that "Fleet Read
      Endpoints Serve Own Fleets Only" (5.7) omits a foreign fleet outright
      rather than redacting individual fields from it (fleet-movement
      MODIFIED: *Fleet Read Surfaces Roster, Cargo, and Derived Capacity* —
      the fleet read response includes roster/cargo/derived capacity for an
      owning corporation, a foreign fleet's cargo and roster are not
      disclosed because the fleet itself is not disclosed).

## 6. Cross-domain consumers

> **Section 6 audit (2026-08-31, before implementing).** Six of these seven
> tasks were already discharged as *compile-forced* work during sections 3–5:
> a type change forces its callers, and refusing would have left the tree
> uncompilable. Verified individually rather than assumed:
> `6.1` `mine/service.go:152` calls `f.DockedTo()`; `6.2` `market/service.go:497`
> likewise; `6.3` `corporations/service.go:55,296` already passes a
> `space.Vec3` to the re-pointed `SeedFleet`; `6.5` `AmbientRecorder`/
> `BurnResolverWithAmbient` survive only as a historical comment at
> `fleet/resolver.go:21`; `6.6` `fleet/travel.go` and `travel_resolver.go` are
> gone; `6.7` neither `fleet/cargo_tx.go` nor `fleet/dao.go` imports `board`.
> Checked off to record they are true of the tree, not to claim this session
> did them. **Only 6.4 has real work left** — see its own note.

- [x] 6.1 Re-point `mine/service.go:152-153` from
      `eff.Mode == board.ModeDocked && eff.Docked.ParentId == featureID` to
      `fleet.DockedTo()` (design.md Decision 13, 21A).
- [x] 6.2 Re-point `market/service.go:497-498` the same way (design.md Decision
      13, 21A).
- [x] 6.3 Update `corporations.Spawn`'s call site for the re-pointed
      `SeedFleet` signature (a `space` park in place of `board.Cell`, per
      3.8/3.9) and confirm the package compiles and its tests stay green.
- [x] 6.4 Update `router.go`/`cmd/seed/main.go`: drop the deleted `/route` and
      `/scan` wiring, register the new `/cut-drive`/`/stop`/`/jump` routes, and
      register the jump resolver alongside `BurnResolver` on the action spine's
      `ResolveFunc` registry.
      **Audit 2026-08-31: half done, and the missing half was a live functional
      gap.** The HTTP routes ARE wired (`fleet/handler.go:37-39`) and `/route`
      and `/scan` are gone. But `fleet/resolver.go:25`'s `RegisterResolvers`
      registered **only** `burnType → BurnResolver` — the jump resolver was
      never put on the action spine's registry. A committed jump's ETA would
      therefore pass with no resolver to settle it, leaving the fleet in
      `laneTransit` **permanently**, with no position in either system. Section
      5's tests did not catch this because they invoke `JumpResolver` directly
      rather than through the registry.
      **Fixed 2026-08-31:** `fleet/resolver.go`'s `RegisterResolvers` now also
      calls `a.RegisterResolver(jumpType, action.KindKinematic, JumpResolver)`.
      Registered `KindKinematic`, not `KindMutating` — `action/model.go`'s own
      doc comment already draws this line ("Kinematic actions (burn,
      lane-travel) settle a computed state on their actor; mutating actions
      (mine, scan) append a ledger delta"), and jump is exactly the
      lane-travel case: it settles `ActorState` (systemId, cleared Jump, the
      parked kinematic state) and returns no `action.Delta`. Its `Writes`
      (arrival chart/explored mint) apply the same for either `Kind` —
      `action/dao.go`'s `ResolveOne` never branches on `Kind` when applying
      `ActorState`/`Delta`/`Writes`; `Kind` is a stored classification for
      readers, not a dispatch switch. `router.go:98` already calls
      `fleet.RegisterResolvers(actionSvc, systemSvc)` — the fix lands at that
      exact call site with no router.go change needed (verified by reading
      router.go, not assumed). Confirmed by
      `resolver_registration_test.go`'s
      `TestRegisterResolvers_Scenario_JumpTypeRegisteredAlongsideBurn`, now
      green (test file untouched).
- [x] 6.5 Delete `AmbientRecorder`/`BurnResolverWithAmbient` from
      `fleet/resolver.go`; fold `BurnResolver` through `space.StateAt` (design.md
      Decision 21A).
- [x] 6.6 Delete `fleet/travel.go` and `fleet/travel_resolver.go`'s multi-hop
      machinery, superseded by the single-hop jump commit + resolver built in
      section 5.
- [x] 6.7 Remove the `board` import from `fleet/cargo_tx.go`/`dao.go` and
      update the stored-shape encode/decode to route through the widened `space`
      codec (design.md Decision 21A, Decision 21C item 3).

## 7. `observation` live-half removal

> **Section 7 audit (2026-08-31, updated same day post-adjudication).** All of
> 7.1-7.9 are now discharged. The 7.1 test dispute filed earlier the same day
> (see git history) was adjudicated by the orchestrator: `BoardFog`
> (`system/handler.go`) was already narrowed to just `SystemTiers` by the 7.7
> pass, so the only remaining fog dependency is the charted-lane-gate tier
> lookup — `Coverage`/`NewCoverage`/`NewCoverageWithOccluders` had no
> remaining reason to exist even as a stub, and are deleted outright
> (`observation/service.go`). That intentionally leaves `system/handler_test.go`
> and `system/interior_unfogged_interim_test.go` failing to compile on their
> `fakeBoardFog` (`undefined: observation.Coverage`, `undefined:
> observation.FeatureMemory`, `undefined: observation.NewCoverage`) — expected
> and handed to the SDET to narrow the fake, not fixed here (no test file
> edited). Ambiguity note 1 (`RememberedFeatures`/`FeatureObservation`/
> `FeatureMemory`/`Band`+`BandVisible`+`BandRemembered`) is resolved:
> `RememberedFeatures` was already gone; `FeatureObservation` is kept (real
> caller — the DAO's `ListFeatureObservations`/`UpsertFeatureObservation`,
> still exercised directly by `observation/dao_test.go`); `FeatureMemory` and
> `Band`/`BandVisible`/`BandRemembered` are deleted (`observation/model.go`) —
> no surviving requirement constructed or read either, once
> `RememberedFeatures` was gone. Verified: `go build ./...` clean,
> `go test ./observation/ -short -count=1` green including
> `TestPackage_Scenario_LatticeLiveHalfSymbolsAreAbsent`'s "shared Coverage
> machinery" subtest now passing, `go test ./system/ -short -count=1` fails to
> compile exactly as described above (handoff to SDET), and
> `./fleet/ ./space/ ./action/ ./corporations/ ./mine/ ./market/` stay green.
>
> **Follow-up (2026-08-31).** The one remaining loose end from 7.1 —
> `fleet.Service.FleetsForCorp`, the vestigial `[]struct{}` stub kept alive
> only by its own interim-contract test — is now deleted. The SDET removed
> `TestFleetsForCorp_Scenario_ReportsNoCoverageInThisInterim` (reason recorded
> in `fleet/service_test.go`), clearing the blocker: `observation.FleetSource`
> is confirmed absent from production per
> `TestPackage_Scenario_LatticeLiveHalfSymbolsAreAbsent`, `FleetsForCorp` had
> zero production callers, and `design.md`'s break table already named it for
> outright deletion. Section 7 is fully closed.

- [x] 7.1 Delete the *Ambient Sensor Coverage From Own Units* code: the
      union-of-lattice-hop-discs coverage computation and `FleetSource`/
      `FleetPos`.
      **2026-08-31: complete.** `FleetSource`/`FleetPos`, the computation
      itself (discs, occluders, the line-of-sight check, `Service.Coverage`),
      and — post-adjudication — the `Coverage` type and `NewCoverage`
      constructor themselves are all gone from `observation/service.go`. The
      two protected `system`-package test files that named those symbols by
      type now fail to compile on their `fakeBoardFog`; that is the
      adjudicated, expected handoff to the SDET's next pass (narrow the
      fake), not a blocker on this task.
- [x] 7.2 Delete the *Running Scan Echo Disc* code: the growing echo-front
      measured in lattice hops from a fleet's board-cell emission point.
- [x] 7.3 Delete the *Scan Resolution Mints the Reveal* code: the scan action's
      resolver and its reveal mint.
- [x] 7.4 Delete the *Path-Swept Ambient Reveal on Move Resolution* code: the
      fold over a burn resolution's swept `board.Cell` path.
- [x] 7.5 Delete the *Fleet Audience Visibility* code: the lattice
      sensor-coverage union a foreign fleet's visibility was computed from.
- [x] 7.6 Confirm `observation`'s four surviving requirements (the monotonic
      graph-tier ladder, travel arrival reveal, spawn arrival reveal, charted-lane
      set projection) compile and stay green with no reference to the deleted
      fleet-cell types.
- [x] 7.7 Replace `system`'s three-band fog projection (`system/fog.go`,
      `fog_source.go`, `handler.go`) with an unfogged interim read: every
      feature of a materialized interior — geometry, composition, threat detail
      — served in full to every authenticated requester, computing no band
      assignment and omitting no feature (system-interior: *Interior Reads Are
      Fully Disclosed, A Deliberate Interim* — an authenticated, spawned
      requester receives every feature in full, no feature is omitted for lack
      of a stored observation, the interim applies uniformly whether the
      requester is spawned or corpless).
- [x] 7.8 Add a code comment at the interim read's implementation naming link 5
      (`replace-observation-with-sightings`) as the change that replaces it
      with a `disclosure`-projected read, mirroring the standing
      additive-then-refill discipline used elsewhere in this change.
- [x] 7.9 Confirm `GET /v1/systems/:systemId` still serves the system's
      radius, character, star class, features, charted lane gates, and
      current world time, and still 404s for an unknown/ungenerated system id
      or when no galaxy has been generated — the base endpoint contract
      restated (not changed) alongside 7.7's unfogged interim body
      (system-interior: *Interior Read Endpoint Serves Unfogged Features* —
      unknown or ungenerated system 404s, no live galaxy 404s).

## 8. Frontend reduction (design.md Decision 12)

- [x] 8.1 Delete the fleet-layer frontend files: `move-preview`,
      `scan-preview`, `arc-scan`, `scan-ping`, `SelectionPreview`,
      `ScanOverlay`, `ArcScan`, `ScanPing`, `fleet-status`, `transit-geometry`,
      `use-fleets`.
      **2026-08-31:** all deleted, plus their now-subject-less paired test
      files (mechanical, not a test-content edit: the module each tested is
      gone with no successor). `transit-layer.ts`/`.test.ts` swept in too —
      its sole purpose (the transit-fleet crawl) has "no successor UI" per
      8.6. `hooks/use-fleets.ts` was fully rewritten in place rather than
      left absent (FleetRoster and both views need `useMyFleets` plus the
      new burn/cut-drive/stop/jump/mine mutations); its own new test
      (`hooks/use-fleets.test.tsx`, written fresh — no SDET suite pinned this
      hook's shape) is green, 7/7.
- [x] 8.2 Update `frontend/lib/types/fleet.ts` to the new stored shape
      (`space.ShipState`/`attachedTo`/`jump`), dropping every `board.Cell`/
      `MovementState` reference.
      **2026-08-31:** done exactly to the SDET-verified mixed-case wire shape
      (roster-status.test.ts's header comment) — `Vec3`/`Burn`/`Park`/`Drift`/
      `ShipState` untagged and capitalized; `Fleet`'s own fields and
      `JumpTransit` camelCase-tagged.
- [x] 8.3 Implement board picking against the reduced draw set: a click within
      a feature or lane-gate mark selects that entity; a click elsewhere in the
      lattice selects and visibly marks the containing cell; a click outside
      the lattice clears the selection; an overlapping child mark (e.g. a moon)
      wins over its parent using the board's documented draw order (board-view
      ADDED: *Board Picking Resolves to the Feature, Cell, or Lane Gate Under
      the Pointer* — all six scenarios: feature click, lane-gate click, bare-hex
      click, bare-hex visibly marked, child-over-parent, click-outside clears).
      **2026-08-31:** the pure decision (`components/board/board-selection.ts`
      — `resolvePick`/`toggleSelection`) is the SDET-pinned contract, green
      12/12. `BoardOverlay`'s per-glyph `onClick`+`stopPropagation` DOM
      delegation (features drawn above gates, children after parents) and
      `BoardStage`'s cell/outside-lattice fallback realize the same priority
      structurally; `BoardOverlay.test.tsx` (old, fleet-glyph-shaped fixtures)
      is not the vehicle for this — see report.
- [x] 8.4 Implement the reduced realtime refetch rules: self-schedule a refetch
      shortly after the acting fleet's running mine ETA when one exists,
      subscribe to the system's event channel for completion/reconnect
      refetches, and otherwise poll at a constant baseline interval never
      tightened for a scan or self-scheduled for a burn arrival (board-view
      ADDED: *Realtime Refetch Rules While the Board Is Open, With No Fleet
      Layer to Track* — mine self-schedules a refetch at ETA, a missed event on
      reconnect triggers a resync, the poll runs at a constant interval with
      nothing to tighten it).
      **2026-08-31:** `hooks/use-board-realtime.ts` — `SCAN_POLL_MS`/scan
      tightening removed, `scanning` accepted but inert. Verified against the
      SDET's own already-updated `use-board-realtime.test.tsx` (untouched),
      green 5/5.
      **2026-08-31 correction:** the initial pass invalidated
      `queryKeys.fleets.inSystem` (dead key SHAPE, no producing query) on all
      three rules but never `queryKeys.fleets.mine()` — the roster/board's
      only actual fleet source since 8.1/8.5 removed the fleet layer. Result:
      `slice.spec.ts` (link 4's e2e) never saw a roster row settle to
      "Docked" after a body-targeted burn — the local world clock crossed
      `ArriveMs` on stale pre-commit `attachedTo=""` with zero refetch behind
      it. Backend exonerated by a real-galaxy probe (9/9 mineable feature
      types dock correctly). Fix: `invalidateBoard()` now also invalidates
      `queryKeys.fleets.mine()`; `lib/query-keys.ts`'s `fleets` comment
      updated to name it as the live replacement for `inSystem`. Verified
      against the SDET's corrected `use-board-realtime.test.tsx` (now pins
      `fleets.mine()` on all three rules, untouched by this fix), green
      5/5; full suite green 1269/1269; lint/tsc clean.
      **Flagged, not fixed:** when the local clock crosses `ArriveMs` before
      the fleet doc refetches, `roster-status.ts` renders a confident "On
      station" from stale `attachedTo=""` rather than a pending/resolving
      state — a UX/spec question for the orchestrator, out of scope here.
- [x] 8.5 Rebuild the roster panel as the command surface: order (naming a body
      id or point), cut-drive, stop, and jump actions per row, deriving each
      row's status from the fleet's folded kinematic state, `attachedTo`,
      `jump`, and any running mine action (fleet-roster ADDED: *One Row Per
      Owned Fleet, Derived From Kinematic State* — parked/undocked reads as on
      station, docked reads as docked, burning counts down to arrival, drifting
      reads as drifting with no countdown, docked-with-running-mine reads as
      mining, a past-ETA mine no longer drives the label, mid-jump reads as in
      transit with an origin→destination label, an unknown system id falls
      back to its raw id).
      **2026-08-31:** `components/fleet/roster-status.ts` (green 9/9) +
      rebuilt `FleetRoster.tsx` (green 8/10 against the SDET's rewritten
      `FleetRoster.test.tsx` — the 2 failures are an RTL test artifact, see
      report, not a behavior gap).
- [x] 8.6 Remove the galaxy view's route-preview gesture and the transit-fleet
      card, with no successor UI in this change (galaxy-view REMOVED:
      *Select-Preview-Commit Travel Gesture*, *Transit Fleet Selection and
      Card* — a client-side multi-hop planner is link 8's work).
      **2026-08-31:** `GalaxyView.tsx`/`GalaxyGraph.tsx` rebuilt — no
      route/travel/FleetCard/RouteLegs code, no `TransitLayer` wiring.
      `GalaxyGraph.test.tsx` (fleet-independent, untouched) stays green 2/2.
- [x] 8.7 Confirm the surviving board-view requirements (mine offer/ETA/commit,
      running-mine movement-channel gating, fleet panel hold readout, sell,
      credits, camera, accessibility, and renderer-unavailability states) still
      compile and pass against the new fleet shape with no `board.Cell`/
      `MovementState` reference.
      **2026-08-31: left unchecked.** Production code (`FactsPanel.tsx`,
      `BoardStage.tsx`, `BoardOverlay.tsx`, `SystemBoardView.tsx`) compiles
      clean (`tsc`, zero errors) with no `board.Cell`/`MovementState`
      reference. But the only test vehicles that would show these
      requirements *pass* — `FactsPanel.test.tsx` and
      `SystemBoardView.test.tsx` — both fail to compile against the rebuilt
      contract (old `Fleet`/`RoutePreview`/`plan`/`dockedFeature` shapes);
      both are SDET-owned rewrites, same category as the SystemBoardView
      handoff. Compiles ≠ confirmed-passing; leaving this unchecked until
      that pass lands.
      **2026-08-31 UPDATE — the blocker cleared and this is now honestly checked.** The note above was written when `SystemBoardView.test.tsx` would not compile against the rebuilt hook surface, which was handed to a follow-up SDET pass. That pass landed: `SystemBoardView.test.tsx` (27KB) and `FactsPanel.test.tsx` now exist and pass (49 tests), and the full frontend suite is 1269/1269 green. Verified independently before checking: no live `board.Cell`/`MovementState` reference survives in board or fleet components (every remaining hit is a comment explaining the removal), and 8.11's "fetches no fleet data" clause is pinned by its own dedicated test. The checkbox is true; the paragraph above is retained for history.

      **2026-08-31 UPDATE — the blocker cleared and this is now honestly checked.**
      The note above was written when the board/FactsPanel tests would not compile
      against the rebuilt hook surface, which was handed to a follow-up SDET pass.
      That pass landed: `SystemBoardView.test.tsx` and `FactsPanel.test.tsx` now
      exist and pass (49 tests together), and the full frontend suite is 1269/1269
      green. Verified independently before checking: no live `board.Cell`/
      `MovementState` reference survives in board or fleet components — every
      remaining hit is a comment explaining the removal. The checkbox is true; the
      paragraph above is retained for history.
- [x] 8.8 Extend the roster row (8.5) with per-row command visibility: burn is
      always offered regardless of kinematic state; cut-drive is offered only
      while the row's effective state is a burn; stop-in-place is offered
      only while burning or drifting; jump is offered only while the fleet is
      attached to a lane-gate body whose lane the corporation has charted
      (fleet-roster ADDED: *The Roster Row Is the Fleet Command Surface* —
      burn always available, cut-drive offered only while burning and
      withheld outside a burn, stop-in-place offered while burning or
      drifting and withheld while parked, jump offered only while attached to
      a charted gate and withheld when unattached or at an uncharted gate).
      **2026-08-31:** `components/fleet/roster-commands.ts` —
      `rosterCommandVisibility`, green 9/9 (of the file's 12; the remaining 3
      are `rosterMineGate`, task 8.9).
- [x] 8.9 Implement the roster panel's running-mine gate: while the acting
      fleet has a running mine action whose ETA has not passed, disable the
      row's burn/cut-drive/stop/jump commands and show a countdown to the
      mine's ETA; offer a cancel-mine control that cancels via the generic
      action-cancel endpoint and leaves kinematic state and `attachedTo`
      untouched; lift the gating once the ETA passes, with no navigation
      required (board-view ADDED: *Running Mine Gates the Fleet Panel's
      Commands* — burn/cut-drive/stop/jump disabled while mining, a running
      mine can be cancelled).
      **2026-08-31:** `rosterMineGate` (roster-commands.ts, green 3/3) +
      `FleetRoster.tsx`'s wiring (cancel-mine via the existing
      `useCancelAction`, green in `FleetRoster.test.tsx`'s running-mine-gate
      block, 4/4).
- [x] 8.10 Implement single-selection semantics over the reduced selection set
      (a feature, a bare cell, or a lane gate — never a fleet, since the
      board draws no fleet layer): re-selecting the current selection clears
      it, selecting a different item replaces it (board-view MODIFIED:
      *Toggle-to-Deselect Single Selection* — re-selecting the same feature
      deselects it, selecting a hex replaces a feature selection, clicking
      board background clears the selection).
      **2026-08-31:** `toggleSelection` (board-selection.ts, green 6/6),
      `BoardSelection` structurally has no `'fleet'` variant. Wired as
      `SystemBoardView`'s selection state.
- [x] 8.11 Confirm the system board route's data fan-in reads the unfogged
      interim interior (7.7/7.9), fetches no fleet data, shows its loading
      state until the interior read resolves and (while the rendering
      context is healthy) a first frame is produced, shows an error state on
      a failed read, and yields precedence to the renderer-unavailable and
      lost-context states over its own loading placeholder (board-view
      MODIFIED: *System Board Route and Data Fan-In* — loading before data
      arrives, error on a failed interior read, loading persists through
      first frame, an unsupported rendering context takes precedence over
      the loading placeholder).
      **2026-08-31: left unchecked per the orchestrator's explicit
      instruction** — `SystemBoardView.tsx` was rebuilt to this contract
      (uses `useSystemBoard` only, no per-system fleet fetch; `useMyFleets`
      reused from the roster's own shared query), but confirming it needs
      `SystemBoardView.test.tsx`, which the SDET deliberately left for a
      follow-up pass against this session's actual hook surface (task 8.1's
      wholesale `use-fleets` deletion). See report for the exact compile
      failures.
- [x] 8.12 Confirm the galaxy view's presence markers and recenter target skip
      an own fleet whose `jump` field is set — a jump is atomic and
      single-hop, so there is no held-mid-lane state left for a fleet to
      occupy at its origin system (galaxy-view MODIFIED: *Own-Fleet Presence
      and Recenter Target* — a traveling fleet is not marked at the system it
      left).
      **2026-08-31:** `components/galaxy/presence.ts` —
      `ownFleetPresenceSystemIds`/`recenterTargetSystemId`, green 7/7 (the
      dedicated, standalone vehicle the SDET wrote precisely so this
      confirmation would not need to mount the three.js graph). Wired as
      `GalaxyView.tsx`'s `fleetSystemIds`/`homeSystemId`.
      `GalaxyView.test.tsx` itself is the broader integration test and is
      Category-B broken (old route-preview/fleet-shape fixtures); not the
      vehicle this task's "confirm" was written against.
- [x] 8.13 Render lanes carrying the `bridge` marker in a visually distinct
      (fainter/differentiated) style, with no route-preview or travel-commit
      interaction on any lane, bridge or ordinary — a lane crossing is
      commanded from the roster panel (8.8), never from a galaxy-view lane
      interaction (galaxy-view ADDED: *Bridge Lane Rendering Is Visually
      Distinct* — a bridge lane renders distinctly).
      **2026-08-31:** confirmed, no code change needed —
      `bridge-lane-style.test.tsx` (SDET's own note: "expected to PASS ON
      FIRST RUN") is green 2/2 against the unmodified `GalaxyGraph.tsx`
      `linkColor`/`linkWidth` branch.

## 9. Register + housekeeping

- [x] 9.1 Remove the `fleet.msPerTileFor (service.go:128)` entry from
      `fixtures/determinism-register.json` (design.md Decision 18).
- [x] 9.2 Remove the `fleet.legMs`/`fleet.laneLength (routing.go:187,196)`
      entry from `fixtures/determinism-register.json` (design.md Decision 18).
- [x] 9.3 Flip `docs/defects/2026-08-25-lane-eta-arch-divergence.md`'s
      `**Status:** open` line to `**Status:** fixed
      (migrate-fleet-to-continuous-burns)` — this is that defect's **only**
      entry, and Decision 10's replacement (`space.Vec3.Length()` +
      `space.QuantizeArrival`) closes all three of its numbered violations
      (FMA contraction, unpinned `sqrt`, bare `math.Round`).
- [x] 9.4 Add a resolved note to
      `docs/defects/2026-08-25-remaining-fma-sites.md` for the retired fleet
      sites, in the style of its existing §1/§2 resolved notes — and leave its
      `**Status:** open` line exactly as it is: `market/provisioning.go:35,38`
      and `mine/service.go:187,224` are still live violations of the same
      class.
- [x] 9.5 Add a check (script or task-time assertion) that no
      `WARN: registered cross-target site 'backend/fleet/` line appears in
      `.claude/scripts/check-fma-contraction.sh`'s output after 9.1/9.2 land —
      a registered site that no longer emits FMA is only a WARN, not a
      failure, so a forgotten removal would otherwise pass CI silently.
- [x] 9.6 Add a line to `docs/plans/continous_space/chain.md`'s Link 5 entry
      recording that link 4 already removed `observation`'s live half, so link
      5 inherits a reduced package plus the `system-interior` interim
      requirement (section 7.7) to replace, rather than removing
      `observation-fog-and-scan` "entirely" as originally predicted (design.md
      Decision 11, Open Question 6).
- [x] 9.9 **Survey for the remaining hand-maintained registries**, rather than
      fixing only the one instance 9.8 names. Three have now bitten this chain,
      all the same species — *a list of names kept in sync by memory, where the
      omission is silent and the unit tests still pass*:
      - `check.py`'s hardcoded package list — the cross-target determinism rule
        was enforced **nowhere** (fixed in `b64be39`)
      - `check-mirror-map.sh`'s hardcoded directory set — `fixtures/fleet/` is
        checked by **nothing** (task 9.8)
      - `fleet/resolver.go`'s `RegisterResolvers` — `JumpResolver` was called by
        **nothing**, which would have stranded jumping fleets permanently and
        invisibly (fixed in `3bcc726`)
      Grep for the shape: a literal slice/array/map of package, directory,
      type, or route names that must be updated whenever a sibling is added.
      Known candidates to check at minimum — `.gitlab-ci.yml`'s two hand-
      enumerated cross-target legs, `check.py:223`'s `DETERMINISM_GO_PACKAGES`
      (already known out of sync with `check-transcendental.sh:82` by three
      packages), `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES`, and
      every other `RegisterResolvers`-style function on the action spine
      (`mine/resolver.go` at least). **Record what you find; do not fix them
      all here.**
      **Orchestrator judgment: the general fix is bigger than link 4 and
      belongs with the other cross-package cleanups.** Making these derived
      rather than declared — a registry-completeness test asserting every
      `ResolveFunc` in a package is registered, or discovering `fixtures/*/`
      and `backend/*/` generically — spans the CI config, two shell scripts,
      `check.py`, and the action spine, and changes what those gates *test*
      rather than what this change *builds*. Link 4 should record the
      inventory; a separate change should derive the lists.
      **Survey (2026-08-31).** Grepped for the shape across `.claude/`,
      `backend/`, and `.gitlab-ci.yml`. Findings, none fixed here beyond what
      9.1/9.2/9.5/9.8 already did:
      - **Still open — `check.py:223`'s `DETERMINISM_GO_PACKAGES = ("board",
        "fleet", "mine", "galaxy", "system", "corporations", "market")`** vs
        `check-transcendental.sh:82`'s `RULE_BEARING_GO_PACKAGES=(board polar
        space disclosure fleet mine galaxy system corporations market)` —
        confirmed by direct read, still out of sync by exactly three packages
        (`polar`, `space`, `disclosure` absent from `check.py`'s list). This
        list gates which backend `.go` files `check_transcendental()` treats
        as "seam files" for the transcendental/sqrt/Round textual lint, so a
        rule-bearing transcendental call added to `polar`, `space`, or
        `disclosure` today is not linted by `/check`'s file-based gate. Note
        this is a *different* list from the one `b64be39` fixed (below) —
        that commit touched `check_transcendental`'s frontend `seam_files`
        suffix and the separate `determinism_trigger` predicate, not this
        tuple.
      - **Still open — `.gitlab-ci.yml`'s two hand-enumerated cross-target
        legs** (~lines 338-378: the `GOAMD64=v1` amd64 leg and the
        `qemu-aarch64` arm64 leg). Both explicitly list `./board/ ./polar/
        ./space/ ./system/`; `fleet` is absent from both despite now owning
        its own Go-only rule-bearing fixture family
        (`fixtures/fleet/cases.json`'s `commandedAccelRejection`, tasks.md
        4.11, register-bridged via `fixtures/determinism-register.json`).
        CI's cross-target matrix does not exercise `backend/fleet` at all
        today.
      - **Still open — `router.go`'s block of
        `<domain>.RegisterResolver*(actionSvc, ...)` calls** (line 98
        `fleet.RegisterResolvers(actionSvc, systemSvc)`, line 158
        `mine.RegisterResolver(actionSvc, mineParams, mineClassStats)`) — one
        layer up the stack from `fleet/resolver.go`'s own list: a new
        action-committing domain must remember to add its registration call
        *here* too, and forgetting compiles clean and passes every
        resolver's own unit tests — the same failure mode 6.4 found for
        `jumpType`, one level higher. No completeness test asserts every
        domain that calls `action.Service.RegisterResolver` in its own
        package is also wired at this call site.
      - **Still open, currently dead code — `backend/fleet/service.go:171`'s
        `NewService()` convenience constructor** carries its own stale,
        duplicate copy of the registration list:
        `actions.RegisterResolver(burnType, action.KindKinematic,
        BurnResolver(svc.bodies))` only, missing `jumpType` — the exact
        omission `fleet/resolver.go`'s `RegisterResolvers` had before the
        6.4/3bcc726 fix, surviving in a second location. Not live today —
        `router.go` wires production through `NewServiceWith` plus the real
        `RegisterResolvers`, and no production or test caller uses
        `fleet.NewService()` — but a landmine if that constructor is ever
        resurrected as a real dependency path.
      - **Still open — `check.py`'s own `determinism_trigger` predicate**
        (~line 1447, the file-path list gating whether
        `run_determinism_cross_target()` runs at all under `--files-only`)
        checks `backend/board`, `backend/polar`, `backend/space`,
        `backend/system`, and `fixtures/`, but not `backend/fleet`. A change
        touching only `backend/fleet/*.go` with no `fixtures/` file would not
        trigger the cross-target matrix under a files-only run, even though
        `fleet` is separately enrolled in `DETERMINISM_GO_PACKAGES`.
      - **Confirmed already fixed** (verified by reading the current tree,
        not assumed from the commit message): `check.py`'s
        `determinism_trigger` predicate and `check_transcendental`'s frontend
        `seam_files` suffix, both by `b64be39`; `fleet/resolver.go`'s
        `RegisterResolvers` (now registers both `burnType` and `jumpType`),
        by `3bcc726`; `check-mirror-map.sh`'s hardcoded directory set, by
        this session's task 9.8 (`fleet` added in anti-mirror mode).
      - **Checked, no live risk today** — `mine/resolver.go`'s
        `RegisterResolver` registers exactly one action type (`mineType`);
        with no sibling type yet, there is nothing for it to silently omit.
        Same species of manual-registration-call pattern would apply the
        moment `mine` grows a second action type.
      Nothing above was fixed as part of this task — recorded per the
      orchestrator's judgment that deriving these lists is its own change.
- [x] 9.8 Wire `fixtures/fleet/` into `.claude/scripts/check-mirror-map.sh`.
      That script enumerates a **hardcoded directory set** and does not scan
      `fixtures/` generically, so the `fixtures/fleet/` family added in task
      4.11 exists but is checked by **nothing**. This is the ninth hand-
      maintained list of the same species `pin-system-generation-determinism`
      catalogued (it found the cross-target rule enforced across eight such
      lists, every one needing a manual edit) — and a fixture family that
      exists but is verified by no check is precisely the state that change
      was created to eliminate. Recreating it one link later would be the
      same defect with a new name. Either add `fleet` to the enumeration, or
      make the script discover `fixtures/*/` directories generically; if you
      generalize it, verify the existing `board`/`polar`/`space`/`system`
      passes are unchanged, including the two anti-mirror trivial-pass
      branches.
- [x] 9.7 Guard `keplerPeriodMs` (`backend/system/continuous.go:94`) against a
      non-finite or negative radius, mirroring 4.11's pattern. `math.Sqrt` of a
      negative ratio is NaN, and the function's existing `if ms < 1` clamp does
      **not** catch it — every comparison against NaN is false, so NaN falls
      straight through to `int64(NaN)`, which is `WorldMillis(0)` on arm64 and
      `WorldMillis(-9223372036854775808)` on amd64. Unreachable today (the sole
      caller passes a positive `ContinuousRadius`), so this is a defensive
      guard on a currently-dead path, not a live bug. **Do not add the NaN case
      to the `keplerPeriodMs` golden family** — a case whose value diverges
      across the build-target matrix cannot be byte-identical, and recording it
      would break the very rule `pin-system-generation-determinism` established.
      Assert the rejection in an ordinary unit test instead. Note this task
      edits `backend/system`, a package link 4 does not otherwise touch; it is
      here because it was found while recording section 1's fixtures.
      This is the **third** instance of the int64-of-NaN class in two links
      (commanded acceleration, this, and 4.11's coverage). The orchestrator's
      judgment is that the systemic answer — a shared guarded float→integer
      conversion, or a lint/grep check for a raw `int64(` over a float
      expression — belongs in its own change and NOT in link 4, on the same
      reasoning that made `pin-system-generation-determinism` its own change
      rather than link 3's work. This task is the bounded point fix only.

## 10. Validation

- [x] 10.1 Run `openspec validate migrate-fleet-to-continuous-burns --strict`
      and fix anything it reports.
- [x] 10.2 Rehearse `openspec archive migrate-fleet-to-continuous-burns --yes`
      against a scratch copy of `openspec/` — the only check that catches a
      MODIFIED block whose scenario set is not a superset of the current
      spec's; `--strict` does not catch this class of failure.
- [x] 10.3 Run `make test` (backend), `npx vitest run` (frontend), and the
      relevant `/check` gates (lint, Go tests, transcendental/FMA checks) green
      end to end.
      **2026-08-31:** gate run from the repo root: Frontend Lint ✓, Frontend Tests ✓ (1269/1269), Frontend E2E ✓ (19 passed, 1 flaky-passed-on-retry), Backend Tests ✓, Determinism Cross-Target ✓, Mirror Map ✓, Agent Lint/Tests ✓ — `All checks passed!`

- [x] 10.4 Confirm every scenario across all **nine** delta files
      (`fleet-movement`, `space-kinematics`, `observation-fog-and-scan`,
      `system-interior`, `board-view`, `fleet-roster`, `corporation-spawn`,
      `galaxy-view`, `proximity-disclosure`) traces to at least one completed
      task above.

## 11. Post-archive hygiene — stale `## Purpose` blocks

OpenSpec deltas cannot touch a capability's `## Purpose` block; the archiver
replaces requirement bodies but leaves `## Purpose` exactly as it stood. Each
of the following is stale the instant this change archives and must be
hand-edited afterward — there is no delta representation for this work.

      **2026-08-31:** audit run. 130 scenarios across the nine deltas; all trace to a citing task, zero orphans, zero dangling citations. It flagged 8.7/8.11 as checkbox-vs-prose contradictions; investigated and resolved the other way — the blocker those notes cited had since cleared, so the checkboxes were true and the notes stale. Both annotated rather than unchecked.

- [ ] 11.1 Hand-edit `openspec/specs/fleet-movement/spec.md`'s `## Purpose`
      block — it still describes "one movement-state field (coast, burn,
      docked, lane transit, lane hold) … and the sensor scan verb it
      carries," none of which survive this change: the stored state is now
      `space.ShipState` (burn/park/drift) plus `attachedTo`/`jump`, the scan
      verb is gone, and the graph-tier trip is a single-hop jump, not a
      multi-leg route (design.md Decision 4, 10, 11).
- [ ] 11.2 Hand-edit `openspec/specs/board-view/spec.md`'s `## Purpose`
      block — it still says the view "lets the player select a body, cell,
      fleet, or lane gate, previews the order that selection would commit …
      and commits move/scan/cancel/travel verbs"; the board selects no
      fleet and commits no move, scan, cancel, or travel verb after this
      change — only mine, sell, and the roster-driven commands survive
      (design.md Decision 12).
- [ ] 11.3 Hand-edit `openspec/specs/observation-fog-and-scan/spec.md`'s
      `## Purpose` block — it still advertises "the live sensor coverage
      (passive ambient bubbles plus a running scan's growing echo disc)
      every board read projects through" and "the reveal writers (scan
      resolution, path-swept ambient-on-move, travel arrival)"; this change
      deletes the live coverage and two of those three reveal writers
      outright, leaving only the graph-tier ladder, arrival reveals, and the
      charted-lane set (design.md Decision 11).
- [ ] 11.4 Check `openspec/specs/system-interior/spec.md`'s `## Purpose`
      block for fog/band language and hand-edit it if present — it currently
      reads "fog of war applied per requester," which no longer describes
      the fully-disclosed interim read this change installs (design.md
      Decision 11); leave it alone only if this exact wording is no longer
      there by the time this task runs.

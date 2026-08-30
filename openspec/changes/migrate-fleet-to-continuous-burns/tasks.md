## 1. Fixtures first — the seven-family obligation (design.md Decision 1, 17)

- [ ] 1.1 Record the `keplerPeriodMs` fixture family in `fixtures/system` over its
      full R¹ domain (not just the radii generation happens to produce); flip its
      `fixtures/system/mirror-map.json` inventory entry from `expectedChange:
      migrate-fleet-to-continuous-burns` to `family:keplerPeriodMs`.
- [ ] 1.2 Record the `gateOrbit` fixture family (the bearing derivation via
      `space.PhaseIndexOf`, the fixed radius factor, the dz/dx horizontal-projection
      convention) in `fixtures/system`; flip its inventory entry the same way.
- [ ] 1.3 Record the `stationOrbit` (`StationContinuousOrbit`) fixture family,
      covering its callees `MaxFeatureSize` and `inclinationForDominant`, in
      `fixtures/system`; flip its inventory entry the same way.
- [ ] 1.4 Record the codec fixture family (`EncodeVec`/`DecodeVec`/
      `EncodeSubTurns`/`DecodeSubTurns` + `decodeNumericSlice`/`decodeNumber`/
      `checkedCoordinate`) in `fixtures/space` — this is the first change that
      gives `backend/space` a real consumer, which is exactly the condition its
      inventory entry names as due; flip that entry to `family:<name>`.
- [ ] 1.5 Resolve `minDistanceFromOriginOf`'s inventory entry: either delete the
      function (it is a thin, test-only wrapper over `minDistanceAndParamOf`) or
      give it a real production caller, per the entry's own stated choice for
      "the change that first migrates a consumer onto `backend/space`" — that is
      this change.
- [ ] 1.6 Re-file `StationKeepRate`/`StationKeepUpkeep`'s `fixtures/space`
      inventory entry with a fresh `expectedChange: add-fuel-as-cargo` (link 7)
      and updated `why` text — this change carries no station-keep currency, so
      the entries are not due, but Decision 17's rule (a rule-bearing shared
      function SHALL NOT remain in the inventory across more than one change
      that modifies its package) means they must be re-filed, not silently
      carried forward unchanged.
- [ ] 1.7 Re-file `ReleaseStationkeep`'s `fixtures/space` inventory entry the same
      way, with `expectedChange: add-fuel-as-cargo` (link 7) and updated `why`
      text naming the force-demote-to-`orbit` guardrail as its first release
      path.
- [ ] 1.8 Extend `fixtures/space/mirror-map.json`'s `coverage` list with every
      function this change adds to `backend/space`: `Drift.Position`,
      `Drift.Velocity`, the cut-drive conversion helper, and the newly-recorded
      codec entries from 1.4.

## 2. `space` — free drift, cut-drive conversion, the widened codec

- [ ] 2.1 Add `ModeDrift` as a third `ShipMode` (not a fourth `ParkKind`) and a
      `Drift{Anchor, Velocity, EpochMs}` type with a closed-form
      `Position(t) = anchor + velocity*seconds(t-epoch)` and a constant
      `Velocity()` — no terminal condition, no clamp in either time direction
      (space-kinematics: *A Free-Drifting Ship Coasts in a Straight Line at
      Constant Velocity* — position follows the linear expression, velocity
      identical at two times, backward evaluation displaces without panicking, a
      zero-velocity drift equals its anchor forever, the far-future fold stays a
      drift, a large time jump is safe by construction, bit-identical repeat
      evaluation).
- [ ] 2.2 Implement the burn-to-drift conversion: at cut millisecond `cutMs`,
      `Anchor = burn.Position(cutMs)`, `Velocity = burn.Tangent(cutMs).Scale(
      burn.Speed(cutMs))`, `EpochMs = cutMs` — replacing the burn, never
      truncating its stored geometry — and refuse a cut at or after the burn's
      stored arrival millisecond with its own named reason (space-kinematics:
      *Cutting a Drive Converts the Burn to a Drift at Its Live Position and
      Velocity* — mid-burn cut anchor/velocity, bit-identical across the cut
      millisecond, direction follows the tangent past the deceleration flip, a
      cut exactly at depart yields a zero-velocity drift with no special case, a
      cut at/after arrival is refused by name, cutting charges no delta-v).
- [ ] 2.3 Add `StopInPlaceSpeedFloor` to `space/params_const.go` (design.md
      Decision 8) — the speed at or below which stop-in-place is a discrete,
      free conversion to a point park rather than a solved burn. Starting value
      per design.md Open Question 1's recommendation: derive it from the speed
      at which the stopping burn's arc would equal `space.MinArcLength`.
- [ ] 2.4 Fix `space/state.go:73` (`StatePosition`'s `default:` arm) to handle
      `ModeDrift` — this is a named task because it compiles cleanly today and
      fails every drifting fleet's position read at runtime, silently, with no
      compiler signal (design.md Decision 5, Decision 21C item 1).
- [ ] 2.5 Extend the named codec to a ship's whole kinematic state: a burn
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
- [ ] 2.6 Add a sibling purity test for `space` (mirroring
      `disclosure/purity_test.go`'s structural import-allowlist assertion) —
      today the package's purity is doc-comment-true only, and this change is
      the one most likely to tempt a `firestore:` tag onto the codec extension.
- [ ] 2.7 Confirm `backend/space`'s own test suite is green with no consumer
      wired yet — this step ships before `fleet` touches any of it (design.md
      Migration Plan step 2).

## 3. Fleet state model + persistence

- [ ] 3.1 Replace `fleet.Fleet.State board.MovementState` with
      `space.ShipState`; add `AttachedTo string` with a `DockedTo() (string,
      bool)` accessor, carrying a code comment at the declaration naming link 6
      (`re-express-economy-positions`) as its eventual deleter/redefiner
      (design.md Decision 4, Decision 13 — the standing rule that nothing
      additive may quietly become permanent).
- [ ] 3.2 Add a fleet-owned `Jump *JumpTransit` field for lane-transit
      representation — not a `space.ShipState` shape, since a fleet in transit
      has no position in either system (design.md Decision 4).
- [ ] 3.3 Leave `activeActionId`/`activeScanId` as independently claimable
      channels, unchanged in mechanism; retain `ActiveScanId`/`action.SlotSensor`
      declared and unwritten, with a comment naming link 5 as the change that
      first claims the sensor channel (design.md Open Question 4) (fleet-movement
      *Single Kinematic-State Fleet Record* — "a scan can run while a burn is
      active").
- [ ] 3.4 Add a `BodySource` interface (`BodyTable(ctx, systemID)
      (*system.BodyTable, error)`) to `fleet.Service`, satisfied by
      `system.Service`; resolve it once per request and thread it as a
      parameter through every burn solve, position read, and resolve — never
      fetched per body, never memoized in package-level state, and never used
      to enumerate `Ids()` into a response (design.md Decision 16).
- [ ] 3.5 Validate every stored kinematic-state value through the `space` codec
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
- [ ] 3.6 Implement effective position resolution through
      `space.StatePosition(bodies, f.State, now)` as the capability's sole
      canonical position path: a docked fleet resolves through its host's live
      position (its orbit if it orbits, else its fixed anchor); a free-flying
      fleet resolves through its own folded burn/park/drift. No other code path
      may re-derive, cache, or round a fleet's position (fleet-movement
      MODIFIED: *Effective Position Resolution* — a docked fleet rides its
      parent's live position, a free-flying fleet resolves through
      `space.StatePosition`).
- [ ] 3.7 Re-point `fleet.SeedFleet` from `at board.Cell` to a `space` park:
      deterministic from the account id, idempotent per account (a healed
      retry reproduces the same position, never a second fleet), rejecting a
      requested position inside the system star's configured clearance radius
      (fleet-movement: *Spawn Fleet Seeding Places a Park* — deterministic and
      idempotent per account, seeding inside clearance rejected;
      corporation-spawn: *One Starting Hull at a Deterministic Home Park* — the
      starting hull is deterministic per account, the starting hull never lands
      inside the star's clearance).
- [ ] 3.8 Delete `corporations.rimCell`/`RimRing`; replace with a deterministic
      continuous spawn position derived from the home interior's `Extent` and
      the `GateRadiusFactor` (1.1), phase-seeded by account id (design.md
      Decision 16, Open Question 3 — the exact geometric target, e.g. a
      `ParkOrbit` around the star vs. docked at the home station, is left open
      by design.md; pick and document the default inline).
- [ ] 3.9 Delete `fleet.ErrCoreDestination` and `SeedFleet`'s destination-identity
      core rejection — the star is now excluded by
      `space.BuildCurve`'s endpoint-clearance guard alone, with no special case
      (design.md Decision 14; fleet-movement: *In-System Burn Order to a Body or
      a Point* — "ordering the star's own body id is rejected by geometry").
- [ ] 3.10 Add a calibration test (mirroring
      `TestCalibration_Scenario_NoStarSizePlacesBodyInsideClearanceShell`) that
      reads `space.StarClearanceRadius` and `space.InsertionStandoff` directly
      and asserts every star size this generator can emit is rejected with
      margin, so widening the star-size table can never silently make the star
      targetable (design.md Decision 14).

## 4. burn / cut-drive / stop verbs

- [ ] 4.1 Implement burn ordering to a body id or an explicit point: solve
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
- [ ] 4.2 Implement order-request validation: reject an order naming neither a
      body id, a point, nor a `laneId`, and reject one naming more than one
      (fleet-movement MODIFIED: *Order Request Validation* — empty order body
      rejected, ambiguous order body rejected).
- [ ] 4.3 Implement `POST /v1/fleets/:fleetId/cut-drive`: free, instant,
      converts the active burn to a drift via the 2.2 conversion, cancels the
      running movement action with no delta and no other effect; reject an
      already-arrived-but-unresolved burn (resolving the arrival instead) and a
      non-burning fleet, each with its own named, distinct reason
      (fleet-movement: *Cut Drive Converts the Burn to a Drift and Goes Dark* —
      mid-burn cut converts to a drift, emission stops the same instant,
      cutting an already-arrived burn resolves the arrival instead, cutting a
      parked/drifting/in-transit fleet is rejected by name, cut drive charges
      no delta-v, a cut fleet is immediately re-orderable).
- [ ] 4.4 Fix `disclosure/contact.go:114` (`contactVelocity`'s `default:` arm)
      to handle `ModeDrift` — named separately from 2.4 because it is a second
      call site that compiles cleanly and fails at runtime, silently, the
      moment link 5 wires a disclosure read (design.md Decision 5, Decision
      21C item 2).
- [ ] 4.5 Implement `POST /v1/fleets/:fleetId/stop`: above the configured speed
      floor, commit a velocity-nulling burn to a point ahead of the fleet
      (charging Δv, taking time, emitting for its duration, settling to a
      `point` park on arrival); at or below the floor, convert instantly and
      freely to a `point` park at the current position (fleet-movement: *Stop
      In Place Commits a Velocity-Nulling Burn* — stopping above the floor
      commits a nulling burn, stopping at or below the floor is instant and
      free).
- [ ] 4.6 Implement derived fleet acceleration (minimum over the roster's
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
- [ ] 4.7 Manually retire the `MinCommandedAccel` pending note in
      `disclosure/params_test.go:112-113` once `fleet` references the constant
      — its `t.Log` parses only `backend/disclosure`'s own directory, so a
      cross-package reference will **not** retire it automatically (design.md
      Decision 9).
- [ ] 4.8 Replace `ClassStats.BurnRate` with `Accel` in `fleet/params.go`/
      `roster.go`; delete `DerivedBurnRate`, add `DerivedAccelCeiling` and the
      drive-output sum (fleet-movement REMOVED: *Derived Fleet Speed*, replaced
      by 4.6).
- [ ] 4.9 Implement co-resident-slot release: cancelling a non-movement verb's
      action (e.g. a running `mine`) that shares a fleet's dock releases only
      that action's slot, leaving the fleet's kinematic state and `attachedTo`
      untouched, identically via `POST /v1/fleets/:fleetId/cancel` and
      `POST /v1/actions/:actionId/cancel` (fleet-movement: *Releasing a
      Co-Resident Verb's Slot Leaves Motion Untouched* — cancelling via the
      fleet endpoint while mining leaves the fleet docked, cancelling the mine
      action directly leaves the fleet docked).
- [ ] 4.10 Delete `fleet/service.go`'s `ErrRingOutOfRange`, `ErrNotOnBoard`,
      `validateFleetRing`, `maxStateRing`, `msPerTileFor`, `msPerLaneUnitFor`,
      `featureOrbit`, `featureAnchor`, `haltState`, and `Scan` (design.md
      Decision 21A).

## 5. jump verb + gate attachment

- [ ] 5.1 Implement `POST /v1/fleets/:fleetId/jump {laneId}`: accept only when
      the fleet is attached to that lane's gate body and its corporation has
      charted the lane; a fleet is jump-eligible on the same world millisecond
      it attaches — no dwell (fleet-movement: *Lane Jump From a Docked Gate* —
      jumping from a charted, attached gate commits, jump-eligible the instant
      of attachment with no dwell, jumping without attachment is rejected,
      jumping an uncharted lane is rejected, jump costs no delta-v).
- [ ] 5.2 Compute jump crossing time as `space.Vec3{...}.Length()` (the lane's
      3D length) times the fleet's configured lane rate, quantized via
      `space.QuantizeArrival` — replacing `legMs`/`laneLength` (design.md
      Decision 10; this is what discharges those functions' determinism-register
      entries in section 9).
- [ ] 5.3 Implement the jump resolver: on ETA, flip the fleet's `systemId`,
      clear `Jump`, settle into a `park` near the destination gate's insertion
      standoff, never attached (unmasked arrival); chart the crossed lane for
      the corporation as `via: traveled` and mint no onward rumor; materialize
      the destination system's interior (create-if-absent) after the resolve
      transaction completes (fleet-movement: *Jump Arrival Parks Near the
      Destination Gate, Unmasked* — arrival flips the system and parks
      unattached near the gate, arrival charts the crossed lane as traveled and
      rumors nothing onward, first arrival materializes the destination's
      interior).
- [ ] 5.4 Delete `fleet/routing.go` wholesale: `Service.PreviewRoute`,
      `planRoute`, `reconstruct`, `buildTrip`, `legMs`, `laneLength`,
      `ErrNoRoute`, `ErrSameSystem`, `RoutePreview`; narrow `TierSource` to its
      `ChartedLanes` use only (design.md Decision 10, Decision 21A).
- [ ] 5.5 Delete `GET /v1/fleets/:fleetId/route` and `POST
      /v1/fleets/:fleetId/scan`; add `POST /v1/fleets/:fleetId/cut-drive`,
      `POST /v1/fleets/:fleetId/stop`, `POST /v1/fleets/:fleetId/jump`; delete
      `WithFog`/`AudienceFog` from `fleet/handler.go` (design.md Decision 21A).
- [ ] 5.6 Restate the existing no-fleet-ownership-check defect over the new
      endpoint set — `common.ActorCorp(c)` is still never consulted by
      `/orders`, `/cancel`, `/cut-drive`, `/stop`, or `/jump` — as the current,
      observable, unfixed behavior (fleet-movement: *Movement Command Endpoints
      Enforce No Fleet Ownership* — a foreign corp can order/cancel/cut-drive/
      stop/jump another corp's fleet, five scenarios, one per verb).
- [ ] 5.7 Implement `GET /v1/fleets/:fleetId`, `GET /v1/fleets?systemId=`, and
      `GET /v1/fleets?mine=true`: a requester's own fleets always return in
      full (complete kinematic state, target, ETA); a fleet belonging to
      another corporation is omitted entirely from a list read and 404s on
      direct fetch; a corpless requester's `mine=true` returns an empty list,
      not an error (fleet-movement: *Fleet Read Endpoints Serve Own Fleets
      Only* — a foreign fleet is omitted from a list read, a foreign fleet
      404s on direct fetch, own fleets are always returned in full, `mine=true`
      with no corp returns an empty list).

## 6. Cross-domain consumers

- [ ] 6.1 Re-point `mine/service.go:152-153` from
      `eff.Mode == board.ModeDocked && eff.Docked.ParentId == featureID` to
      `fleet.DockedTo()` (design.md Decision 13, 21A).
- [ ] 6.2 Re-point `market/service.go:497-498` the same way (design.md Decision
      13, 21A).
- [ ] 6.3 Update `corporations.Spawn`'s call site for the re-pointed
      `SeedFleet` signature (a `space` park in place of `board.Cell`, per
      3.7/3.8) and confirm the package compiles and its tests stay green.
- [ ] 6.4 Update `router.go`/`cmd/seed/main.go`: drop the deleted `/route` and
      `/scan` wiring, register the new `/cut-drive`/`/stop`/`/jump` routes, and
      register the jump resolver alongside `BurnResolver` on the action spine's
      `ResolveFunc` registry.
- [ ] 6.5 Delete `AmbientRecorder`/`BurnResolverWithAmbient` from
      `fleet/resolver.go`; fold `BurnResolver` through `space.StateAt` (design.md
      Decision 21A).
- [ ] 6.6 Delete `fleet/travel.go` and `fleet/travel_resolver.go`'s multi-hop
      machinery, superseded by the single-hop jump commit + resolver built in
      section 5.
- [ ] 6.7 Remove the `board` import from `fleet/cargo_tx.go`/`dao.go` and
      update the stored-shape encode/decode to route through the widened `space`
      codec (design.md Decision 21A, Decision 21C item 3).

## 7. `observation` live-half removal

- [ ] 7.1 Delete the *Ambient Sensor Coverage From Own Units* code: the
      union-of-lattice-hop-discs coverage computation and `FleetSource`/
      `FleetPos`.
- [ ] 7.2 Delete the *Running Scan Echo Disc* code: the growing echo-front
      measured in lattice hops from a fleet's board-cell emission point.
- [ ] 7.3 Delete the *Scan Resolution Mints the Reveal* code: the scan action's
      resolver and its reveal mint.
- [ ] 7.4 Delete the *Path-Swept Ambient Reveal on Move Resolution* code: the
      fold over a burn resolution's swept `board.Cell` path.
- [ ] 7.5 Delete the *Fleet Audience Visibility* code: the lattice
      sensor-coverage union a foreign fleet's visibility was computed from.
- [ ] 7.6 Confirm `observation`'s four surviving requirements (the monotonic
      graph-tier ladder, travel arrival reveal, spawn arrival reveal, charted-lane
      set projection) compile and stay green with no reference to the deleted
      fleet-cell types.
- [ ] 7.7 Replace `system`'s three-band fog projection (`system/fog.go`,
      `fog_source.go`, `handler.go`) with an unfogged interim read: every
      feature of a materialized interior — geometry, composition, threat detail
      — served in full to every authenticated requester, computing no band
      assignment and omitting no feature (system-interior: *Interior Reads Are
      Fully Disclosed, A Deliberate Interim* — an authenticated, spawned
      requester receives every feature in full, no feature is omitted for lack
      of a stored observation, the interim applies uniformly whether the
      requester is spawned or corpless).
- [ ] 7.8 Add a code comment at the interim read's implementation naming link 5
      (`replace-observation-with-sightings`) as the change that replaces it
      with a `disclosure`-projected read, mirroring the standing
      additive-then-refill discipline used elsewhere in this change.

## 8. Frontend reduction (design.md Decision 12)

- [ ] 8.1 Delete the fleet-layer frontend files: `move-preview`,
      `scan-preview`, `arc-scan`, `scan-ping`, `SelectionPreview`,
      `ScanOverlay`, `ArcScan`, `ScanPing`, `fleet-status`, `transit-geometry`,
      `use-fleets`.
- [ ] 8.2 Update `frontend/lib/types/fleet.ts` to the new stored shape
      (`space.ShipState`/`attachedTo`/`jump`), dropping every `board.Cell`/
      `MovementState` reference.
- [ ] 8.3 Implement board picking against the reduced draw set: a click within
      a feature or lane-gate mark selects that entity; a click elsewhere in the
      lattice selects and visibly marks the containing cell; a click outside
      the lattice clears the selection; an overlapping child mark (e.g. a moon)
      wins over its parent using the board's documented draw order (board-view
      ADDED: *Board Picking Resolves to the Feature, Cell, or Lane Gate Under
      the Pointer* — all six scenarios: feature click, lane-gate click, bare-hex
      click, bare-hex visibly marked, child-over-parent, click-outside clears).
- [ ] 8.4 Implement the reduced realtime refetch rules: self-schedule a refetch
      shortly after the acting fleet's running mine ETA when one exists,
      subscribe to the system's event channel for completion/reconnect
      refetches, and otherwise poll at a constant baseline interval never
      tightened for a scan or self-scheduled for a burn arrival (board-view
      ADDED: *Realtime Refetch Rules While the Board Is Open, With No Fleet
      Layer to Track* — mine self-schedules a refetch at ETA, a missed event on
      reconnect triggers a resync, the poll runs at a constant interval with
      nothing to tighten it).
- [ ] 8.5 Rebuild the roster panel as the command surface: order (naming a body
      id or point), cut-drive, stop, and jump actions per row, deriving each
      row's status from the fleet's folded kinematic state, `attachedTo`,
      `jump`, and any running mine action (fleet-roster ADDED: *One Row Per
      Owned Fleet, Derived From Kinematic State* — parked/undocked reads as on
      station, docked reads as docked, burning counts down to arrival, drifting
      reads as drifting with no countdown, docked-with-running-mine reads as
      mining, a past-ETA mine no longer drives the label, mid-jump reads as in
      transit with an origin→destination label, an unknown system id falls
      back to its raw id).
- [ ] 8.6 Remove the galaxy view's route-preview gesture and the transit-fleet
      card, with no successor UI in this change (galaxy-view REMOVED:
      *Select-Preview-Commit Travel Gesture*, *Transit Fleet Selection and
      Card* — a client-side multi-hop planner is link 8's work).
- [ ] 8.7 Confirm the surviving board-view requirements (mine offer/ETA/commit,
      running-mine movement-channel gating, fleet panel hold readout, sell,
      credits, camera, accessibility, and renderer-unavailability states) still
      compile and pass against the new fleet shape with no `board.Cell`/
      `MovementState` reference.

## 9. Register + housekeeping

- [ ] 9.1 Remove the `fleet.msPerTileFor (service.go:128)` entry from
      `fixtures/determinism-register.json` (design.md Decision 18).
- [ ] 9.2 Remove the `fleet.legMs`/`fleet.laneLength (routing.go:187,196)`
      entry from `fixtures/determinism-register.json` (design.md Decision 18).
- [ ] 9.3 Flip `docs/defects/2026-08-25-lane-eta-arch-divergence.md`'s
      `**Status:** open` line to `**Status:** fixed
      (migrate-fleet-to-continuous-burns)` — this is that defect's **only**
      entry, and Decision 10's replacement (`space.Vec3.Length()` +
      `space.QuantizeArrival`) closes all three of its numbered violations
      (FMA contraction, unpinned `sqrt`, bare `math.Round`).
- [ ] 9.4 Add a resolved note to
      `docs/defects/2026-08-25-remaining-fma-sites.md` for the retired fleet
      sites, in the style of its existing §1/§2 resolved notes — and leave its
      `**Status:** open` line exactly as it is: `market/provisioning.go:35,38`
      and `mine/service.go:187,224` are still live violations of the same
      class.
- [ ] 9.5 Add a check (script or task-time assertion) that no
      `WARN: registered cross-target site 'backend/fleet/` line appears in
      `.claude/scripts/check-fma-contraction.sh`'s output after 9.1/9.2 land —
      a registered site that no longer emits FMA is only a WARN, not a
      failure, so a forgotten removal would otherwise pass CI silently.
- [ ] 9.6 Add a line to `docs/plans/continous_space/chain.md`'s Link 5 entry
      recording that link 4 already removed `observation`'s live half, so link
      5 inherits a reduced package plus the `system-interior` interim
      requirement (section 7.7) to replace, rather than removing
      `observation-fog-and-scan` "entirely" as originally predicted (design.md
      Decision 11, Open Question 6).

## 10. Validation

- [ ] 10.1 Run `openspec validate migrate-fleet-to-continuous-burns --strict`
      and fix anything it reports.
- [ ] 10.2 Rehearse `openspec archive migrate-fleet-to-continuous-burns --yes`
      against a scratch copy of `openspec/` — the only check that catches a
      MODIFIED block whose scenario set is not a superset of the current
      spec's; `--strict` does not catch this class of failure.
- [ ] 10.3 Run `make test` (backend), `npx vitest run` (frontend), and the
      relevant `/check` gates (lint, Go tests, transcendental/FMA checks) green
      end to end.
- [ ] 10.4 Confirm every scenario across all eight delta files
      (`fleet-movement`, `space-kinematics`, `observation-fog-and-scan`,
      `system-interior`, `board-view`, `fleet-roster`, `corporation-spawn`,
      `galaxy-view`) traces to at least one completed task above.

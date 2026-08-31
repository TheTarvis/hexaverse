## 1. Traversability First

- [ ] 1.1 Implement a production `fleet.GraphSource` (`LaneCrossing(ctx,
      laneId, fromSystemId) (destSystemId string, from, to space.Vec3, err
      error)`) resolving a lane's crossing geometry from the galaxy's raw
      coordinates, and wire `router.go` to call `WithGraph` when
      constructing the fleet service — closing blocker 3.
      (fleet-movement: *Lane Jump From an Attached Gate* — Jumping from an
      attached gate commits; Jump costs no delta-v)
- [ ] 1.2 Drop `Jump`'s charted-lane precondition: jump-eligibility becomes
      "attached to the lane's own gate body, no dwell" — delete
      `ErrLaneNotCharted` and the charted-lane check from `fleet.Service.Jump`.
      (fleet-movement: *Lane Jump From an Attached Gate* — Jumping from an
      attached gate commits; A fleet is jump-eligible the instant it
      attaches, with no dwell; Jumping without attachment to the named gate
      is rejected)
- [ ] 1.3 Delete `system/gates.go`'s `chartedGates`, `system/handler.go`'s
      `BoardFog.SystemTiers` tier lookup and its call site — every lane-gate
      body ships unfiltered to every authenticated requester, closing
      blocker 2.
      (system-interior: *Interior Read Endpoint* — A materialized system's
      read carries every body's continuous position and size)
- [ ] 1.4 Wire `galaxy.EnsureLaneHorizon` into jump-arrival settlement
      (`fleet.Service.Get`'s post-jump-settle step), called strictly before
      the destination's first `BodyTable` build for that arrival — closing
      blocker 4.
      (fleet-movement: *Jump Arrival Parks Near the Destination Gate,
      Unmasked* — Arrival at the frontier materializes the full lane
      horizon before the gate set is built)
      (galaxy-generation: *Lazy, Idempotent Block Materialization* — A jump
      arrival at the frontier materializes the destination's full lane
      horizon before its gate set is built)
- [ ] 1.5 In the jump-resolve transaction, write the destination's knowledge
      tier to `explored` and chart the crossed lane `via: traveled`, and
      settle the fleet's `systemId`/lane-transit state into an unattached
      park near the destination gate's insertion standoff; materialize the
      destination's interior (create-if-absent) after the transaction
      completes.
      (fleet-movement: *Jump Arrival Parks Near the Destination Gate,
      Unmasked* — Arrival flips the system and parks unattached near the
      gate; Arrival charts the crossed lane as traveled and rumors nothing
      onward; First arrival materializes the destination's interior)
- [ ] 1.6 End-to-end traversability integration test — the link's first
      milestone: spawn, burn to a gate, dock, jump, arrive parked unmasked
      near the destination gate, confirm the crossed lane appears on the
      galaxy map, confirm the destination's full gate set is present. This
      single path must fail if any of blockers 1–4 regress.
      (fleet-movement, galaxy-generation, galaxy-knowledge — the same
      scenarios cited in 1.1–1.5, exercised together end to end)

## 2. `observation` → `galaxy-knowledge`

- [ ] 2.1 Export `galaxy.LaneIdBetween(aSysId, bSysId string) string` over
      the existing `laneIdFor`/`CellForSystemId` pair, purely (no read),
      so a gate-attachment write can derive its lane id without a lookup.
      (no dedicated scenario — design.md Decision 3, supports task 2.4)
- [ ] 2.2 Scaffold `backend/charts` (the standard six-file domain shape) and
      port the monotonic knowledge ladder: `charts.Tier`,
      `charts.TierExplored`, never-downgrade-on-write semantics.
      (galaxy-knowledge: *Monotonic System-Knowledge Ladder* — A system with
      no stored knowledge is star-visible; A lower-tier write never
      downgrades a higher stored tier; A higher-tier write upgrades the
      stored tier)
- [ ] 2.3 Port the charted-lane set projection into `charts`: presence of a
      charted-lane record IS "charted," no tier-derived incidence.
      (galaxy-knowledge: *Charted-Lane Set Projection* — An explored system
      with no charted lane grants none)
- [ ] 2.4 Port the travel-arrival and spawn-arrival knowledge writers into
      `charts.ArrivalWrites`, idempotent on repeat for the spawn writer; add
      the new gate-attachment writer (`via: gate`, using task 2.1's
      `LaneIdBetween`, computed without reading the destination system).
      (galaxy-knowledge: *Travel Arrival Knowledge Write* — Arrival explores
      the destination and charts the crossed lane; *Spawn Arrival Knowledge
      Write* — Spawn arrival explores home with no lanes charted; Repeating
      the spawn arrival write is a no-op; *Gate-Attachment Knowledge Write*
      — Docking at a gate charts its lane; Attaching to a non-gate body
      charts nothing)
- [ ] 2.5 Rename the stored collections with no data carried:
      `corporations/{cid}/observations/*` → `.../charts/*`,
      `corporations/{cid}/lanes/*` → `.../chartedLanes/*`. Land this rename
      as its own commit, before any behavioural work, per design.md's
      Migration Plan.
- [ ] 2.6 Rewire the eleven production consumers of `observation.Tier` —
      `router.go`, `galaxy/handler.go`, `galaxy/lane_source.go`,
      `system/handler.go`, `system/gates.go`, `stations/service.go`,
      `market/params.go`, `market/service.go`, `corporations/service.go`,
      `fleet/resolver.go`, `cmd/seed/main.go` — to `charts.Tier`. Pure
      rename; no behavior change in this task.
      (galaxy-generation: *Galaxy Graph Read Endpoint* — Every system ships
      with a default tier when fog is not wired; A corp's fog decorates
      system tiers; Lanes are filtered to the corp's charted set; An
      authenticated corpless requester receives the unfogged galaxy)
- [ ] 2.7 When porting `NewServiceWith`, collapse its three unused `any`
      parameters (`observation/service.go:50`'s `_, _, _ any`) entirely
      rather than carrying the placeholder forward into `charts`.
- [ ] 2.8 Delete `backend/observation` (package, `FeatureObservation` and its
      DAO paths, tests). The `observation-fog-and-scan` OpenSpec capability
      is retired separately, by hand, post-archive — see task 7.6.
- [ ] 2.9 Confirm no `charts` output is ever consulted by `disclosure` —
      `disclosure/purity_test.go`'s allow-list already fails the build the
      instant `disclosure` imports anything outside `errors`,
      `hexaverse/common`, `hexaverse/space`, so this task is a read-through
      confirmation, not new code.
      (galaxy-knowledge: *A Knowledge Write Never Decides Live Disclosure* —
      Explored knowledge does not disclose a foreign fleet)
- [ ] 2.10 Wire spawn site selection's claimed-space set to the union of
      every living corporation's `explored`-tier systems from `charts`,
      excluding the re-siting corporation's own systems at heal time; wire
      spawn's home-reveal write to chart no lanes.
      (galaxy-knowledge: *The Corporation's Visited-System Set Is the
      Spawn-Distance Input* — A corporation's explored systems count toward
      claimed space; A corporation excludes its own systems when re-siting
      itself)
      (corporation-spawn: *Home-Only Initial Fog, No Lanes Charted* — Spawn
      charts no lanes)
- [ ] 2.11 Add `charts` and `chartedLanes` to `CleanupFirestoreTestData()`.

## 3. The Sighting Store

- [ ] 3.1 Scaffold `backend/sightings` (six-file domain shape) storing at
      `corporations/{cid}/sightings/{id}`.
- [ ] 3.2 Implement the `Sighting` model: minting corporation, resolving
      action id, `asOf`, system id, target id (stored, never on the wire),
      `CleanSweep` marker and host id, no update/delete function anywhere
      in the package's public surface.
      (sighting-records: *A Sighting Carries Its Own Provenance* — A minted
      sighting carries its system; A minted sighting carries its provenance
      fields; The target id is stored but never serialized to the client;
      *A Sighting Is Immutable and Never Expires* — A sighting still reports
      its minted position after the target moves; No field of a sighting
      changes after it is minted; There is no update or delete path; *A
      Clean Sweep Is a Record* — A clean sweep mints a record with no
      target; A clean-sweep record still names the host and the sweep)
- [ ] 3.3 Implement deterministic document paths —
      `corporations/{cid}/sightings/{actionId}_{targetId}` for a
      composition record, `{actionId}_clean` for a clean sweep — so
      `MergeAll` re-application on a retried resolve converges rather than
      duplicating.
      (sighting-records: *A Sighting Is Minted In the Resolve Transaction,
      Exactly Once* — A sighting's document id is deterministic; A retried
      resolve converges instead of duplicating; The mint is never a
      separate write after the transaction)
- [ ] 3.4 Implement `GET /v1/sightings`, scoped to the caller's own
      corporation, paginated newest-first with a named page maximum, no
      unbounded single-response read.
      (sighting-records: *A Sighting Is Readable Only By the Corporation
      That Holds It* — A corporation reads its own pile; A corporation
      cannot read another corporation's pile; *The Pile Is Paginated and
      Bounded Per Read* — A read without further parameters returns at
      most the page maximum; Records are ordered newest-minted-first; A
      pile within the page maximum is returned in full)
- [ ] 3.5 Confirm the import direction: `sightings` may import `disclosure`;
      `disclosure`'s existing purity allow-list test already forbids the
      reverse at compile time.
      (sighting-records: *A Sighting Is Never Consulted To Decide Live
      Disclosure* — Holding a sighting does not disclose its target live)
- [ ] 3.6 Test that no code path outside a resolving focused-scan mints a
      sighting: reading the pile, sustained passive proximity, and a burn
      or lane-transit resolution each mint nothing.
      (sighting-records: *A Sighting Is Minted Only By a Resolving Sweep* —
      Reading the pile mints nothing; Sustained passive proximity mints no
      sighting; A burn resolution mints no sighting)

## 4. `disclosure` Wiring

- [ ] 4.1 Implement a `disclosure.Attachments` adapter over
      `fleet.Fleet.AttachedTo`/`DockedTo` (`HostOf`, `AttachedTo`), wired at
      the composition root — the seam `ScanResolver` (section 5) and the
      interior read (this section) both consume.
- [ ] 4.2 Widen masking from "a ship docked to a host" to any attached
      object.
      (proximity-disclosure: *A Docked Ship Is Masked and Registers Only As
      Its Host* — A masked ship is not disclosed inside passive range; The
      host's disclosure is identical either way; A body-attached mine is
      masked like any other attached object)
- [ ] 4.3 Add `Sighting.SystemId` and thread it through `MintSighting` and
      every computed `disclosure.Sighting` value.
      (proximity-disclosure: *A Disclosure-Computed Sighting Carries Its
      System* — A computed sighting names its system)
- [ ] 4.4 Implement "Disclosure to a Corporation Is the Union Over Its Own
      Assets": union across the requester's own fleets present in the
      system, deduplicated by target, a masked/docked own fleet still
      contributing, a lane-transiting own fleet contributing nothing.
      (proximity-disclosure: *Disclosure to a Corporation Is the Union Over
      Its Own Assets* — A target seen by only one of several own fleets is
      disclosed; A target seen by more than one own fleet is disclosed
      exactly once; A masked, docked own fleet still observes; A fleet in
      lane transit contributes no observation)
- [ ] 4.5 In the system interior handler, resolve the body table once, run
      the union from 4.4, dedup, and add a top-level `contacts` array
      alongside `features`/`laneGates`, empty for a corpless requester.
      (system-interior: *Foreign Presence Is Served As System Contacts* —
      Contacts reflect the requester's own union of observers; A target
      seen by more than one own fleet appears once in contacts; A corpless
      requester's contacts array is empty; A foreign fleet outside every
      own fleet's detection range is absent from contacts)
- [ ] 4.6 Delete `projectUnfogged`'s per-feature fog framing; serve every
      body of a materialized system's interior in full to every
      authenticated requester unconditionally, computing no per-requester
      band.
      (system-interior: *Bodies Are Public; Ships Are Disclosed* — An
      authenticated, spawned requester receives every body in full; No
      body is omitted for lack of stored knowledge; The rule applies
      uniformly, corpless or not; A masked ship at a body changes nothing
      about that body's own disclosure)
- [ ] 4.7 Extend the interior response additively: continuous position and
      size on every body (bodies and gate bodies alike), alongside — never
      replacing — the pre-existing lattice footprint, `band` (constant
      `"visible"`), and `live` (constant `true`).
      (system-interior: *Interior Read Endpoint* — Unknown or ungenerated
      system; No live galaxy; A materialized system's read carries every
      body's continuous position and size; Pre-existing wire fields are
      unchanged)
- [ ] 4.8 Make `GET /v1/fleets/:fleetId`, `GET /v1/fleets?systemId=`, and
      `GET /v1/fleets?mine=true` permanently own-fleets-only: a foreign
      fleet 404s on direct fetch and is omitted from every list read, own
      fleets always return in full, `mine=true` with no corp returns an
      empty list rather than an error.
      (fleet-movement: *Fleet Read Endpoints Serve Own Fleets In Full and
      Foreign Fleets As Contacts* — A foreign fleet is omitted from a list
      read; A foreign fleet 404s on a direct fetch; Own fleets are always
      returned in full; mine=true with no corp returns an empty list)
- [ ] 4.9 Delete the code this section supersedes — the old fully-disclosed
      interim's comment/framing (`system/fog.go`), the old own-fleets-only
      interim wording — and confirm no dangling reference to
      `observation.Tier`-keyed feature fog remains in `system`.

## 5. The Focused-Scan Verb

- [ ] 5.1 Add `fleet.Fleet.Scan *ScanWindow{HostId, DepartMs, ArriveMs,
      Range}`, mirroring `Jump`'s field-for-field shape and lifecycle
      (non-nil only while running); add `disclosure.Ship.Scan` and
      `disclosure.Scanning(s, t)` as the same exact half-open integer
      interval test `Emitting` already is. Confirm the pre-existing
      named-rejection guard for an undecodable kinematic state is
      unaffected by the new field.
      (fleet-movement: *Single Kinematic-State Fleet Record With Two Action
      Channels* — A running sweep writes its window to the sensor channel;
      A fleet with no stored kinematic state is rejected by name)
      (proximity-disclosure: *An Active Sweep Emits For Its Duration* —
      Scanning is on during the sweep's committed interval; The sweep's
      arrive instant ends scanning; A ship with no stored sweep window is
      never reported as scanning)
- [ ] 5.2 Implement `POST /v1/fleets/:fleetId/scan {hostId}`: commits an
      `action` of type `scan` on `action.SlotSensor` (`activeScanId`),
      `action.KindMutating`, independent of the movement channel a burn or
      jump claims.
      (focused-scan: *A Focused Sweep Commits On the Sensor Channel* — A
      burning fleet can commit a sweep; A second sweep is rejected while
      one is running; A sweep does not cancel a running burn)
- [ ] 5.3 Implement `roundTripMs(d)` in the scan verb's own service (never
      in `disclosure`, which forbids `math.Sqrt`), using
      `space.Vec3.Length()`, quantized upward, frozen at commit and
      unaffected by the scanner's later motion.
      (focused-scan: *Sweep Duration Scales With Range to the Target* — A
      farther host costs a longer sweep; A sweep against a host at zero
      range still costs a positive duration; The scanner's later motion
      does not change the committed ETA)
- [ ] 5.4 Reuse `disclosure.FocusedScan`'s range and occlusion predicates,
      unchanged, as the commit-time rejection check against live positions.
      (focused-scan: *A Sweep Is Rejected Beyond Range or Behind the Star*
      — A host beyond focused-scan range is rejected; A host occluded by
      the star is rejected; A host at exactly the named range is accepted)
- [ ] 5.5 Implement `scanEmissionRadius(d) = max(ScanEmissionFloor,
      ScanEmissionPerRange × d)` in `disclosure/params.go`; add
      `Contact.Scanning`, distinct from `Contact.Emitting`; derive
      detection radius as passive range plus the greater of plume radius
      and sweep-emission radius. Deliberately edit
      `disclosure/contact_test.go`'s field-set reflection assertion to
      include `Scanning`, noted as an intentional change, not silent drift.
      (proximity-disclosure: *A Sweep's Emission Radius Scales With Its
      Range* — A closer sweep target yields a smaller emission radius than
      a farther one; A sweep at zero range still emits at the named floor;
      Scanning is reported on its own flag, not as emission; A ship
      burning and sweeping reports both flags; Detection radius combines
      passive range with the louder of plume or sweep emission)
      (focused-scan: *A Sweep Emits For Its Duration* — A fleet is sweeping
      during its scan window; Sweeping ends at the scan's arrival instant;
      A parked, sweeping fleet reports no plume emission from the sweep
      alone)
- [ ] 5.6 Add `params_test.go` pins: `ScanEmissionFloor > PassiveRange`, and
      `ScanEmissionPerRange × FocusedScanRange` strictly less than a
      nominal class-2 burn's plume, mirroring the existing `PlumeFloor >
      PassiveRange` pin.
- [ ] 5.7 Implement the sweep's masking disjunct: a fleet is unmasked for
      the full interval its focused scan is running, exactly as for
      emission; masking and an active sweep never hold simultaneously.
      (focused-scan: *A Sweep Unmasks Its Scanner* — Committing a sweep
      ends masking for its duration; Masking resumes once the sweep ends)
      (proximity-disclosure: *Lighting a Drive Breaks Masking* — Departure
      is visible; Arrival re-masks on dock; A sweeping ship is unmasked
      for its sweep)
- [ ] 5.8 Implement `ScanResolver(ships ShipSource, bodies BodySource)`,
      reading inside the resolve transaction callback (mirroring
      `BurnResolver`'s injected `BodySource` pattern) and returning minted
      records as `ResolveResult.Writes`: one sighting per ship masked at
      the host (including down an attachment chain), or a clean-sweep
      record when nothing is masked. Stamp every minted record's `asOf` at
      pulse-reach — `DepartMs + (ArriveMs - DepartMs)/2`, integer
      arithmetic — correcting the shipped clean-sweep-scenario
      contradiction (resolution time is wrong; pulse-reach is right for
      every record, clean or not). Re-check range and occlusion from the
      scanner's folded position at pulse-reach, and fizzle — mint nothing,
      record a reason code distinguishing range from occlusion — on
      failure, on the scanner having left the host's system, or on the
      scanner being in lane transit at pulse-reach.
      (focused-scan: *A Sweep Resolves Into Sightings, Or Fizzles* — A
      resolving sweep mints sightings for the chain masked at its host; A
      resolving sweep against an empty host mints a clean-sweep record; A
      resolving sweep stamps its records at pulse-reach, not resolution
      time; A geometry failure at pulse-reach mints nothing; A scanning
      fleet that left the host's system mints nothing; A scanning fleet in
      lane transit at pulse-reach mints nothing)
      (proximity-disclosure: *A Focused Scan Reveals the Ships Masked At
      Its Target* — A focused scan finds a chained ship; A clean sweep is
      itself a record; A host beyond focused-scan range cannot be swept)
- [ ] 5.9 Implement cancel: release the claimed sensor-channel slot, apply
      no resolver effect (no sighting minted), end the sweeping flag at the
      instant of cancellation rather than the scan's original arrive time.
      (focused-scan: *Cancelling a Sweep Releases the Slot, Mints Nothing,
      and Ends Emission* — Cancelling a running sweep releases the sensor
      slot; A cancelled sweep mints no sighting; Cancelling a sweep ends
      sweeping immediately)

## 6. Carry-Overs

- [ ] 6.1 Fix the `fleet/service.go:171` `NewService()` landmine: delete
      resolver registration from the constructor entirely (never delegate
      to `RegisterResolvers` from inside it) — registration belongs at the
      composition root, not as a constructor side effect.
      (no dedicated scenario — design.md Decision 22, the byte-for-byte
      recurrence of the bug fixed in `3bcc726`)
- [ ] 6.2 Add an AST-scan test, in the same species as `purity_test.go`,
      asserting `RegisterResolvers` is the package's sole
      `action.RegisterResolver` call site.
- [ ] 6.3 Make `fleet.NewServiceWith`'s `GraphSource` a required positional
      constructor parameter; delete `WithGraph`, `TierSource`,
      `WithTierSource`, and the now-unreachable `graph == nil` guard and
      its sentinel.
      (no dedicated scenario — design.md Decision 22, closes blocker 3 at
      the type level so it cannot recur)
- [ ] 6.4 Close the fleet-movement authorization defect: on
      `POST /v1/fleets/:fleetId/orders|cancel|cut-drive|stop|jump`, compare
      `common.ActorCorp(c)` against the fleet's `corporationId` and respond
      `404` — not `403` — on mismatch or no corporation. Delete
      `fleet/ownership_defect_test.go`; its scenarios become this
      requirement's positive ownership scenarios.
      (fleet-movement: *Movement Command Endpoints Are Restricted to the
      Owning Corporation* — A foreign corp cannot order another corp's
      fleet; A foreign corp cannot cancel another corp's fleet; A foreign
      corp cannot cut another corp's fleet's drive; A foreign corp cannot
      order another corp's fleet to stop in place; A foreign corp cannot
      order another corp's fleet to jump; A corpless requester is rejected
      the same way)
- [ ] 6.5 Close the sibling action-dispatch authorization defect in the same
      change: inject an `ActorOwner{OwnerOf(ctx, collection, actorId)
      (corpId string, err error)}` into `action.Handler`, wired in
      `router.go` from the fleet service; 404 (not 403) on mismatch or no
      corporation across `GET /v1/actions?actor=`, `GET /v1/actions/:id`,
      `POST /v1/actions/:id/acknowledge`, `POST /v1/actions/:id/cancel`.
      (action-dispatch: *Action Endpoints Are Restricted to the Owning
      Corporation* — A foreign corp cannot list another actor's inbox; A
      foreign corp cannot fetch a single action by id; A foreign corp
      cannot acknowledge another actor's action; A foreign corp cannot
      cancel another actor's action; A corpless requester is rejected the
      same way; The owning corporation's own requests still succeed)

## 7. Housekeeping

- [ ] 7.1 Delete `common.Tuning().AmbientRadius` and `.ScanDuration`
      (consumed only by `observation/params.go`, deleted with the package
      in task 2.8); confirm no other caller references either.
- [ ] 7.2 Resync `check.py`'s `DETERMINISM_GO_PACKAGES` to add all three
      missing packages — `polar`, `space`, `disclosure` — matching
      `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES`, and add a
      check that asserts the two lists are equal, failing with both
      contents printed. Fix all three together; a list two-thirds fixed is
      the same defect with a smaller number.
- [ ] 7.3 Add `fixtures/disclosure/mirror-map.json` in anti-mirror mode and
      wire a matching `anti_mirror "disclosure" ...` invocation into
      `.claude/scripts/check-mirror-map.sh` — `disclosure` is Go-sole-
      authority, no TypeScript mirror now or ever.
- [ ] 7.4 Correct `docs/plans/continous_space/chain.md`'s Link 5 "Touches"
      list: add `action-dispatch` and `galaxy-generation`; restate the four
      rehomed `observation-fog-and-scan` requirements as MOVED to the new
      `galaxy-knowledge` capability rather than simply REMOVED; and name
      all four traversability blockers (the charting circularity,
      `chartedGates`, the unwired `GraphSource`, the uncalled
      `EnsureLaneHorizon`) rather than only the circularity.
- [ ] 7.5 Add `sightings` to `CleanupFirestoreTestData()` alongside `charts`
      and `chartedLanes` (task 2.11). Record `CleanupFirestoreTestData()`
      itself as a sixth instance of the hand-maintained-list species
      catalogued in link 4's task 9.9 — noted here, not fixed as a class:
      the general derivation fix stays its own change.
- [ ] 7.6 **Post-archive step — do after `openspec archive
      replace-observation-with-sightings` succeeds, not before:** delete
      `openspec/specs/observation-fog-and-scan/` by hand. This change carries
      no `specs/observation-fog-and-scan/` delta (see proposal.md's
      "Retiring `observation-fog-and-scan`") because the archiver validates
      the *rebuilt* spec before writing anything and rejects one left with
      zero requirements ("Spec must have at least one requirement"),
      aborting the archive for the *entire* change, not just this file —
      and pre-deleting the spec folder doesn't help, since the archiver then
      treats it as a brand-new spec and applies the same ≥1-requirement
      rule. A capability can only be retired by omitting its delta directory
      from the change and deleting the live spec folder manually afterward.
      `polar-lattice-math` is the repo's existing precedent for this path
      (commit `4b7f0a2`). This is a repo-wide OpenSpec mechanic, not
      specific to this change — worth remembering before the next capability
      retirement rediscovers it.

## 8. Validation

- [ ] 8.1 Additive-wire guard test: the interior read continues to serve
      `features[].footprint`, `features[].band` (constant `"visible"`),
      `features[].live` (constant `true`), and `laneGates[].cell` unchanged
      alongside the new `space`/`size`/`contacts` fields — the live board
      is the only playable view until a later link deletes these.
      (system-interior: *Interior Read Endpoint* — Pre-existing wire fields
      are unchanged)
- [ ] 8.2 Consequence tests for the two silent blockers: a test that fails
      if the production router is ever constructed without `WithGraph`
      wired (blocker 3 — no fake dependency injected), and an
      emulator-backed ordering test asserting `EnsureLaneHorizon` runs
      before the destination's first `BodyTable` build on jump arrival at
      the frontier (blocker 4) — both regression nets on top of the
      end-to-end slice in task 1.6, per design.md Decision 24.
- [ ] 8.3 Run the full backend test suite (`go test ./...`, emulators up)
      and `/check`.
- [ ] 8.4 `openspec validate replace-observation-with-sightings --strict`.
- [ ] 8.5 Rehearse `openspec archive replace-observation-with-sightings` on
      a scratch copy of the repo — the only check that catches a MODIFIED
      requirement whose scenario set doesn't match the archiver's
      expectations verbatim.
- [ ] 8.6 Regression-confirm `galaxy-generation`'s existing block-
      materialization and galaxy-read behavior is unaffected by this
      change's touches to `galaxy/handler.go`, `galaxy/lane_source.go`, and
      `galaxy/service.go` (tasks 1.4, 2.1, 2.6) — these scenarios carry
      forward unchanged in the delta and are not this change's own work,
      but the rename and the new `EnsureLaneHorizon` call site sit close
      enough to them to warrant an explicit pass rather than an assumed one.
      (galaxy-generation: *Lazy, Idempotent Block Materialization* —
      Concurrent materialization of the same block converges; Adjacent
      blocks materialized concurrently keep every lane between them;
      Overlapping multi-block materializations converge block by block; A
      cross-block lane materialized from either side is one document; A
      bridge across empty blocks is persisted exactly once from either
      side; Re-materializing an existing block is a no-op; Reads create no
      galaxy documents; New stars are public astronomy; *Galaxy Graph Read
      Endpoint* — The response grows as the world materializes; Bounds
      track the materialized extent)

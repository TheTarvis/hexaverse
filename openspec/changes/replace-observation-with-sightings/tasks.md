## 1. Traversability First

- [x] 1.1 Implement a production `fleet.GraphSource` (`LaneCrossing(ctx,
      laneId, fromSystemId) (destSystemId string, from, to space.Vec3, err
      error)`) resolving a lane's crossing geometry from the galaxy's raw
      coordinates, and construct the fleet service in `router.go` by
      passing it as `fleet.NewServiceWith`'s required positional
      `GraphSource` parameter (task 6.3 — there is no `WithGraph` to call;
      the constructor signature itself makes the dependency impossible to
      omit) — closing blocker 3.
      (fleet-movement: *Lane Jump From an Attached Gate* — Jumping from an
      attached gate commits; Jump costs no delta-v)
- [x] 1.2 Drop `Jump`'s charted-lane precondition: jump-eligibility becomes
      "attached to the lane's own gate body, no dwell" — delete
      `ErrLaneNotCharted` and the charted-lane check from `fleet.Service.Jump`.
      (fleet-movement: *Lane Jump From an Attached Gate* — Jumping from an
      attached gate commits; A fleet is jump-eligible the instant it
      attaches, with no dwell; Jumping without attachment to the named gate
      is rejected)
- [x] 1.3 Delete `system/gates.go`'s `chartedGates`, `system/handler.go`'s
      `BoardFog.SystemTiers` tier lookup and its call site — every lane-gate
      body ships unfiltered to every authenticated requester, closing
      blocker 2.
      (system-interior: *Bodies Are Public; Ships Are Disclosed* — No body
      is omitted for lack of stored knowledge)
      (system-body-table: *The Body Table Is an Unfiltered Internal Seam,
      Never a Response* — The table carries bodies the requester could not
      see)
- [x] 1.4 Wire `galaxy.EnsureLaneHorizon` into jump-arrival settlement
      (`fleet.Service.Get`'s post-jump-settle step), called strictly before
      the destination's first `BodyTable` build for that arrival — closing
      blocker 4.
      (fleet-movement: *Jump Arrival Parks Near the Destination Gate,
      Unmasked* — Arrival at the frontier materializes the full lane
      horizon before the gate set is built)
      (galaxy-generation: *Lazy, Idempotent Block Materialization* — A jump
      arrival at the frontier materializes the destination's full lane
      horizon before its gate set is built)
- [x] 1.5 In the jump-resolve transaction, write the destination's knowledge
      tier to `explored` and chart the crossed lane `via: traveled`, and
      settle the fleet's `systemId`/lane-transit state into an unattached
      park near the destination gate's insertion standoff; materialize the
      destination's interior (create-if-absent) after the transaction
      completes.
      (fleet-movement: *Jump Arrival Parks Near the Destination Gate,
      Unmasked* — Arrival flips the system and parks unattached near the
      gate; Arrival charts the crossed lane as traveled and rumors nothing
      onward; First arrival materializes the destination's interior)
- [x] 1.6 End-to-end traversability integration test — the link's first
      milestone: spawn, burn to a gate, dock, jump, arrive parked unmasked
      near the destination gate, confirm the crossed lane appears on the
      galaxy map, confirm the destination's full gate set is present. This
      single path must fail if any of blockers 1–4 regress.
      (fleet-movement, galaxy-generation, galaxy-knowledge — the same
      scenarios cited in 1.1–1.5, exercised together end to end)

## 2. `observation` → `galaxy-knowledge`

- [x] 2.1 Export `galaxy.LaneIdBetween(aSysId, bSysId string) string` over
      the existing `laneIdFor`/`CellForSystemId` pair, purely (no read),
      so a gate-attachment write can derive its lane id without a lookup.
      (no dedicated scenario — design.md Decision 3, supports task 2.4)
- [x] 2.2 Scaffold `backend/charts` (the standard six-file domain shape) and
      port the monotonic knowledge ladder: `charts.Tier`,
      `charts.TierExplored`, never-downgrade-on-write semantics.
      (galaxy-knowledge: *Monotonic System-Knowledge Ladder* — A system with
      no stored knowledge is star-visible; A lower-tier write never
      downgrades a higher stored tier; A higher-tier write upgrades the
      stored tier)
- [x] 2.3 Port the charted-lane set projection into `charts`: presence of a
      charted-lane record IS "charted," no tier-derived incidence.
      (galaxy-knowledge: *Charted-Lane Set Projection* — An explored system
      with no charted lane grants none)
- [x] 2.4 Port the travel-arrival and spawn-arrival knowledge writers into
      `charts.ArrivalWrites`, idempotent on repeat for the spawn writer; add
      the new gate-attachment writer (`via: gate`, using task 2.1's
      `LaneIdBetween`, computed without reading the destination system).
      (galaxy-knowledge: *Travel Arrival Knowledge Write* — Arrival explores
      the destination and charts the crossed lane; *Spawn Arrival Knowledge
      Write* — Spawn arrival explores home with no lanes charted; Repeating
      the spawn arrival write is a no-op; *Gate-Attachment Knowledge Write*
      — Docking at a gate charts its lane; Attaching to a non-gate body
      charts nothing)
- [x] 2.5 Rename the stored collections with no data carried:
      `corporations/{cid}/observations/*` → `.../charts/*`,
      `corporations/{cid}/lanes/*` → `.../chartedLanes/*`. Land this rename
      as its own commit, before any behavioural work, per design.md's
      Migration Plan.
- [x] 2.6 Rewire the eleven production consumers of `observation.Tier` —
      `router.go`, `galaxy/handler.go`, `galaxy/lane_source.go`,
      `system/handler.go`, `system/gates.go`, `stations/service.go`,
      `market/params.go`, `market/service.go`, `corporations/service.go`,
      `fleet/resolver.go`, `cmd/seed/main.go` — to `charts.Tier`. Pure
      rename; no behavior change in this task.
      (galaxy-generation: *Galaxy Graph Read Endpoint* — Every system ships
      with a default tier when fog is not wired; A corp's fog decorates
      system tiers; Lanes are filtered to the corp's charted set; An
      authenticated corpless requester receives the unfogged galaxy)
- [x] 2.7 When porting `NewServiceWith`, collapse its three unused `any`
      parameters (`observation/service.go:50`'s `_, _, _ any`) entirely
      rather than carrying the placeholder forward into `charts`.
- [x] 2.8 Delete `backend/observation` (package, `FeatureObservation` and its
      DAO paths, tests). The `observation-fog-and-scan` OpenSpec capability
      is retired separately, by hand, post-archive — see task 7.6.
- [x] 2.9 Add an import-graph test asserting `disclosure` never imports
      `charts`: `disclosure/purity_test.go`'s existing allow-list already
      fails the build the instant `disclosure` imports anything outside
      `errors`, `hexaverse/common`, `hexaverse/space`, so this task adds an
      explicit named assertion on top of that general rule (not merely a
      read-through confirmation), so the guarantee shows up by name where a
      reviewer of this capability's tests will find it.
      (galaxy-knowledge: *A Knowledge Write Never Decides Live Disclosure* —
      Explored knowledge does not disclose a foreign fleet)
- [x] 2.10 Wire spawn site selection's claimed-space set to the union of
      every OTHER living corporation's `explored`-tier systems from
      `charts` (`claimedSpace`'s existing `exceptCorpID` parameter already
      excludes the corporation currently being sited, live today at
      `backend/corporations/service.go`); wire spawn's home-reveal write to
      chart no lanes.
      (galaxy-knowledge: *The Corporation's Visited-System Set Is the
      Spawn-Distance Input* — A corporation's explored systems count toward
      claimed space; A re-pick under reservation contention measures
      against every other living corporation)
      (corporation-spawn: *Home-Only Initial Fog, No Lanes Charted* — Spawn
      charts no lanes)
- [x] 2.11 Add `charts` and `chartedLanes` to `CleanupFirestoreTestData()`.

## 3. The Sighting Store

- [x] 3.1 Scaffold `backend/sightings` (six-file domain shape) storing at
      `corporations/{cid}/sightings/{id}`.
- [x] 3.2 Implement the `Sighting` model: minting corporation, resolving
      action id, `asOf`, system id, target id (stored, never on the wire),
      `CleanSweep` marker and host id, no update/delete function anywhere
      in the package's public surface — and, for a composition-bearing
      (non-clean-sweep) record, the frozen kinematic and composition
      payload the resolving sweep computed: position and velocity at
      `asOf`, whether the target was emitting, its hull count, and its hull
      types (`disclosure.Sighting` already carries all of this; the model
      here is the stored superset that adds provenance around it).
      **The "no update/delete function" clause is a permanent structural
      guard rather than a red-to-green scenario — it can only be checked
      once the package has production content, so it rides along with this
      task's other work and never has a red run of its own.**
      (sighting-records: *A Sighting Carries Its Own Provenance* — A minted
      sighting carries its system; A minted sighting carries its provenance
      fields; A minted sighting carries its kinematic and composition
      payload; The target id is stored but never serialized to the client;
      *A Sighting Is Immutable and Never Expires* — A sighting still reports
      its minted position after the target moves; No field of a sighting
      changes after it is minted; There is no update or delete path; *A
      Clean Sweep Is a Record* — A clean sweep mints a record with no
      target; A clean-sweep record still names the host and the sweep)
- [x] 3.3 Implement deterministic document paths —
      `corporations/{cid}/sightings/{actionId}_{targetId}` for a
      composition record, `{actionId}_clean` for a clean sweep — so
      `MergeAll` re-application on a retried resolve converges rather than
      duplicating.
      (sighting-records: *A Sighting Is Minted In the Resolve Transaction,
      Exactly Once* — A sighting's document id is deterministic; A retried
      resolve converges instead of duplicating; The mint is never a
      separate write after the transaction)
- [x] 3.4 Implement `GET /v1/sightings`, scoped to the caller's own
      corporation, paginated newest-first with a named page maximum, no
      unbounded single-response read.
      (sighting-records: *A Sighting Is Readable Only By the Corporation
      That Holds It* — A corporation reads its own pile; A corporation
      cannot read another corporation's pile; *The Pile Is Paginated and
      Bounded Per Read* — A read without further parameters returns at
      most the page maximum; Records are ordered newest-minted-first; A
      pile within the page maximum is returned in full)
- [x] 3.5 Add a real import-graph check, not a read-through confirmation:
      `sightings` may import `disclosure` (`disclosure`'s existing purity
      allow-list test already forbids the reverse at compile time, since
      that package's own production import set is closed to
      `errors`/`hexaverse/common`/`hexaverse/space`), but the narrow rule is
      wider than that single package boundary — after task 4.5 wires live
      disclosure assembly into `system`'s interior handler, `system` is
      free to import anything unless something stops it. Add an AST-scan
      test (in the same species as `purity_test.go`) asserting that no
      package that constructs a `contacts` response element (currently
      `system` alone) imports `sightings`. `fleet` is deliberately exempt
      from this check: task 5.8 puts the focused-scan resolver that mints
      sighting records in `backend/fleet`, alongside `BurnResolver`, and
      minting a record from inside a resolve transaction is not assembling
      a live-disclosure response — `fleet`'s own read endpoints compute no
      partial-visibility snapshot of a foreign fleet
      (`fleet-movement`'s *Fleet Read Endpoints Serve Own Fleets In Full
      and Foreign Fleets As Contacts*) and are therefore never on this
      path.
      **This check is a permanent structural guard, not a red-to-green
      scenario: it is true both before and after `backend/sightings`
      exists, so no reviewer should expect to reproduce a red run for it.**
      The two behavioural scenarios cited below are NOT satisfied by this
      guard — they need §4's `contacts` assembly and are written there.
      (sighting-records: *A Sighting Is Never Consulted To Decide Live
      Disclosure* — Holding a sighting does not disclose its target live; A
      sighting for a target now out of range is absent from contacts; No
      live-disclosure-assembly package imports sightings)
- [x] 3.6 Test that no code path outside a resolving focused-scan mints a
      sighting: reading the pile, sustained passive proximity, and a burn
      or lane-transit resolution each mint nothing.
      (sighting-records: *A Sighting Is Minted Only By a Resolving Sweep* —
      Reading the pile mints nothing; Sustained passive proximity mints no
      sighting; A burn resolution mints no sighting)

## 4. `disclosure` Wiring

- [x] 4.1 Implement a `disclosure.Attachments` adapter over
      `fleet.Fleet.AttachedTo`/`DockedTo` (`HostOf`, `AttachedTo`), wired at
      the composition root — the seam `ScanResolver` (section 5) and the
      interior read (this section) both consume.
- [x] 4.2 Widen masking from "a ship docked to a host" to any attached
      object.
      (proximity-disclosure: *A Docked Ship Is Masked and Registers Only As
      Its Host* — A masked ship is not disclosed inside passive range; The
      host's disclosure is identical either way; The masking predicate
      applies to any attached id, not just ships)
- [x] 4.3 Add `Sighting.SystemId` and thread it through every computed
      `disclosure.Sighting` value. Threaded via a new additive
      `World.SystemId` with `FocusedScan`'s signature unchanged (it already
      takes `World`, so it reads `w.SystemId` internally) rather than by
      changing `MintSighting`'s signature — no scenario requires that
      specific call site, and changing it would have broken §3's immutable
      `sighting_test.go` call sites for a phrase that states intent, not a
      signature contract.
      (proximity-disclosure: *A Disclosure-Computed Sighting Carries Its
      System* — A computed sighting names its system)
- [x] 4.4 Implement "Disclosure to a Corporation Is the Union Over Its Own
      Assets": union across the requester's own fleets present in the
      system, deduplicated by target, a masked/docked own fleet still
      contributing, a lane-transiting own fleet contributing nothing.
      (proximity-disclosure: *Disclosure to a Corporation Is the Union Over
      Its Own Assets* — A target seen by only one of several own fleets is
      disclosed; A target seen by more than one own fleet is disclosed
      exactly once; A masked, docked own fleet still observes; A fleet in
      lane transit contributes no observation)
- [x] 4.5 In the system interior handler, resolve the body table once, run
      the union from 4.4, dedup, and add a top-level `contacts` array
      alongside `features`/`laneGates`, empty for a corpless requester. The
      handler SHALL NOT read or join against the `sightings` store when
      assembling `contacts` — a target's absence or presence in the array
      is decided solely by 4.4's live union, never by whether a sighting
      for it exists. Serialize each contact's `scanning` field (from
      `Contact.Scanning`, task 5.5) onto the wire alongside position,
      velocity, and `emitting` — the serialization step SHALL NOT drop it.
      (system-interior: *Foreign Presence Is Served As System Contacts* —
      Contacts reflect the requester's own union of observers; A target
      seen by more than one own fleet appears once in contacts; A corpless
      requester's contacts array is empty; A foreign fleet outside every
      own fleet's detection range is absent from contacts; A contact's
      scanning state is served on the wire)
      (sighting-records: *A Sighting Is Never Consulted To Decide Live
      Disclosure* — A sighting for a target now out of range is absent from
      contacts)
- [x] 4.6 Delete `projectUnfogged`'s per-feature fog framing; serve every
      body of a materialized system's interior in full to every
      authenticated requester unconditionally, computing no per-requester
      band.
      (system-interior: *Bodies Are Public; Ships Are Disclosed* — An
      authenticated, spawned requester receives every body in full; No
      body is omitted for lack of stored knowledge; The rule applies
      uniformly, corpless or not; A masked ship at a body changes nothing
      about that body's own disclosure)
      (system-body-table: *The Body Table Is an Unfiltered Internal Seam,
      Never a Response* — The table carries bodies the requester could not
      see; No response field is derived from the unfiltered table)
- [x] 4.7 Extend the interior response additively: continuous position and
      size on every body (bodies and gate bodies alike), alongside — never
      replacing — the pre-existing lattice footprint, `band` (constant
      `"visible"`), and `live` (constant `true`).
      (system-interior: *Interior Read Endpoint* — Unknown or ungenerated
      system; No live galaxy; A materialized system's read carries every
      body's continuous position and size; Pre-existing wire fields are
      unchanged)
- [x] 4.8 Make `GET /v1/fleets/:fleetId`, `GET /v1/fleets?systemId=`, and
      `GET /v1/fleets?mine=true` permanently own-fleets-only: a foreign
      fleet 404s on direct fetch and is omitted from every list read, own
      fleets always return in full, `mine=true` with no corp returns an
      empty list rather than an error.
      (fleet-movement: *Fleet Read Endpoints Serve Own Fleets In Full and
      Foreign Fleets As Contacts* — A foreign fleet is omitted from a list
      read; A foreign fleet 404s on a direct fetch; Own fleets are always
      returned in full; mine=true with no corp returns an empty list)
- [x] 4.9 Delete the code this section supersedes — the old fully-disclosed
      interim's comment/framing (`system/fog.go`), the old own-fleets-only
      interim wording — and confirm no dangling reference to
      `observation.Tier`-keyed feature fog remains in `system`. In the same
      pass, delete `stations/service.go`'s exclusion of the station from
      `observation.InteriorSource` — that seam and the per-feature
      observation model it protected the station from are both gone
      (trading-station: *Station Excluded From the Fog/Scan Feature
      Source*, removed); a station now ships in full unconditionally like
      any other body, and `proximity-disclosure`'s occlusion rule occludes
      only by the star, so there is nothing left for the station to be
      excluded from.
- [x] 4.10 **Frontend — board view only; the galaxy view's own charted-lane
      check is a separate call site and is task 4.13's to close.** Drop
      `fleet-roster`'s client-side charted-lane check on the jump command
      for the board-view roster: offer jump whenever the fleet is attached
      to a lane-gate body, with no dependency on the corporation's charted
      set (which arrives on a separately cadenced `GET /v1/galaxy` read).
      This closes the client-imposed dwell the no-dwell ruling forbids, and
      the failure mode where a failed `via: gate` charting write would
      otherwise silently restore the old traversability blocker at the
      client while every server test stayed green. Confirm the roster
      row's other command-visibility rules — burn, cut-drive, stop — are
      untouched by this edit and remain green under the existing frontend
      tests for them. `GalaxyView.tsx`'s `isGateBody` renamed the same
      charted-filtered `links[]` read rather than removing the condition —
      that half is NOT done by this task; see 4.13.
      (fleet-roster: *The Roster Row Is the Fleet Command Surface, Jump
      Gated by Attachment Alone* — Jump is offered while attached to any
      lane-gate body; Jump is withheld when not attached to a gate; Burn is
      always available; Cut drive is offered only while burning; Cut drive
      is withheld outside a burn; Stop in place is offered while burning or
      drifting; Stop in place is withheld while parked)
- [x] 4.11 **Follow-on — §4's other work above is already complete and
      green.** Close the remaining traversability gap: the jump command is
      now offered (4.10) but cannot be clicked to effect, since no gate DTO
      carries a lane id for `useJump({fleetId, laneId})` to send.
      Backend: add `LaneId` to `system.LaneGate`
      (`backend/system/gates.go`), populated via `galaxy.LaneIdBetween`
      alongside the existing `DestSystemId`/`Cell` derivation, serialized
      on the wire as `laneId`. Frontend: add `laneId: string` to
      `LaneGate` (`frontend/lib/types/system-board.ts:83`) and wire the
      roster row's `handleJump` to call `useJump({fleetId, laneId})` with
      the attached gate's `laneId` instead of leaving the click a no-op.
      (system-interior: *Lane-Gate Bodies Carry Their Lane Id* — A
      materialized system's read carries each lane-gate body's lane id;
      The served lane id is the one the jump endpoint accepts; The served
      lane id matches the server's own derivation for the same crossing; A
      fresh corporation with no charted lanes still receives a usable lane
      id)
      (board-view: *Jump Commit* — Invoking jump submits the attached
      gate's lane; A gate whose lane the corporation has not charted still
      commits; A failed jump commit toasts the reason)
- [ ] 4.12 **Frontend.** Unify gate selection with body selection in
      `SystemBoardView.tsx`: a lane-gate body commands a burn through the
      same path as any other selected body, with no
      `selection.kind !== 'feature'`-shaped branch carved out for a gate.
      The preferred implementation deletes `board-selection.ts`'s `'gate'`
      selection kind entirely, folding a picked lane-gate body into the
      same `'feature'`-shaped selection (its existing `gate-${destSystemId}`
      id already IS the burn target `handleBurn`/`useOrder` expect) rather
      than adding a second gate-aware branch alongside the existing
      feature-only one — a parallel path for a thing the domain says is
      not special (`docs/plans/continous_space/decisions.md`: "gates ARE
      bodies") is how the distinction survives. Confirm the existing
      picking/highlight behavior (`board-view`: *Board Picking Resolves to
      the Feature, Cell, or Lane Gate Under the Pointer*) is unaffected —
      this task touches only the command path, not what a click resolves
      to or how a gate mark is drawn. Folding away the `'gate'` kind must
      NOT blank `FactsPanel.tsx`'s selection section or drop
      `SystemBoardView.tsx`'s `selectedGateId`/selection-ring draw:
      `FactsPanel.tsx:113`'s `features.find(f => f.id === selection.id)`
      never matches a gate (`board.features` never contains a gate body —
      gates ride `board.laneGates`), and `selectedGateId` today reads
      `selection.kind === 'gate'` directly — both need a gate-aware lookup
      against `board.laneGates` (or an equivalent discriminant carried on
      the folded selection) so a selected gate still resolves for these
      two consumers even though its selection object is now
      `'feature'`-shaped.
      (board-view: *Burn Command Targets a Selected Lane-Gate Body Like Any
      Other Body* — Commanding a burn toward a selected lane-gate body
      submits an order; Attachment from a gate-targeted burn makes the jump
      command available; No gate-specific refusal copy exists; A selected
      gate still shows its facts and its selected mark)
- [ ] 4.13 **Backend + Frontend + fixture.** `GET /v1/galaxy`'s `links[]` is
      charted-filtered (`galaxy-generation`: *Lanes are filtered to the
      corp's charted set*), so it is empty for exactly the fresh-spawn/
      just-attached case this jump command exists to serve — it CANNOT be
      `GalaxyView.tsx`'s lane-id source (blocker: the fourth layer of the
      traversability onion). Do not resolve the attached gate's lane id by
      matching `galaxy.links[]` endpoints. Instead: **Backend** — serve the
      new `laneId` field added in `fleet-movement`'s *Fleet Read Serves the
      Attached Gate's Lane Id* on the fleet DTO (`fleet.Fleet`'s read path,
      derived via `galaxy.LaneIdBetween(fleet.SystemId, gate destination)`
      — no read against the charted-lane set). **Frontend** — wire
      `GalaxyView.tsx`'s placeholder `handleJump` to call
      `useJump({fleetId, laneId})` with that fleet-DTO `laneId`, replacing
      `isGateBody`'s charted-filtered-`links[]` lookup entirely (it must
      not survive renamed elsewhere in this file — it is the same
      charted-set read task 4.10 removed from the roster row, not removed
      here) and replacing the "no lane id on this read" toast with the
      same success/error toast shape `SystemBoardView.tsx`'s `handleJump`
      already uses. **Fixture** — add the cross-stack fixture pinning
      `laneDTO.Id == LaneIdBetween(laneDTO.aId, laneDTO.bId)` per
      `galaxy-view`'s *A Galaxy Link's Id Is Its Lane's Stable Id*
      (Go-sole-authority regime: `fixtures/galaxy/` cases file, anti-mirror
      `mirror-map.json` with an empty `sharedNames`, and a matching
      invocation in `check-mirror-map.sh`) — this equality is orthogonal to
      the jump-commit fix above (it pins the galaxy-read/jump-endpoint/
      gate-body id agreement generally) and remains useful even though
      `links[]` is no longer `handleJump`'s source. Include, at minimum: an
      ordinary lane between adjacent positive-coordinate systems; a lane
      with a negative-coordinate endpoint; a bridge lane (`Lane.Bridge ==
      true`); and both orderings of one endpoint pair. Also note for the
      fixture's implementer: `LaneIdBetween("bogus", "sys_5_5")` silently
      collapses to the zero cell (`"lane_0_0_5_5"`) rather than erroring,
      which can collide with a real crossing — worth a case, not a defect
      this task fixes.
      (fleet-movement: *Fleet Read Serves the Attached Gate's Lane Id* — An
      attached fleet's read carries its gate's lane id; An unattached
      fleet's read carries no lane id)
      (galaxy-view: *A Galaxy Link's Id Is Its Lane's Stable Id* — A galaxy
      link's id matches the lane id the jump endpoint accepts; A galaxy
      link's id matches its gate bodies' served lane id; A cross-stack
      fixture pins the equality under the Go-sole-authority regime; *Jump
      Commit* — A gate absent from the fetched galaxy graph still commits;
      The jump command is offered for a gate absent from the graph; A
      failed jump commit toasts the reason)

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
      jump claims. Reject the commit — creating no action and claiming no
      sensor-channel slot — when `hostId` does not resolve to a body, or a
      fleet owned by the scanning fleet's own corporation, in the scanning
      fleet's own system at commit, or when the scanning fleet is itself in
      lane transit at commit. A `hostId` naming a fleet owned by a
      **different** corporation SHALL be rejected through the exact same
      code path and response shape as an unresolvable `hostId` — no
      distinguishing field — since a distinguishable rejection would itself
      disclose that foreign fleet's presence and range.
      (focused-scan: *A Focused Sweep Commits On the Sensor Channel* — A
      burning fleet can commit a sweep; A second sweep is rejected while
      one is running; A sweep does not cancel a running burn; An
      unresolvable host is rejected; A host outside the scanning fleet's
      system is rejected; A foreign fleet's id is rejected identically to
      an unresolvable one; A scanner in lane transit at commit is rejected)
- [ ] 5.3 Implement `roundTripMs(d)` in the scan verb's own service (never
      in `disclosure`, which forbids `math.Sqrt`), using
      `space.Vec3.Length()`, quantized upward, frozen at commit and
      unaffected by the scanner's later motion. Store the committed window
      as `[commitTime, commitTime + roundTripMs(d)]` — depart is always
      commit time, never a value short of the full sweep — so the
      emission interval, the masking break, and the action's own ETA are
      the same interval end to end.
      (focused-scan: *Sweep Duration Scales With Range to the Target* — A
      farther host costs a longer sweep; A sweep against a host at zero
      range still costs a positive duration; The scanner's later motion
      does not change the committed ETA; The committed window spans the
      entire sweep)
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
      include `Scanning` (now a four-field set — position, velocity,
      emitting, scanning — per "A Scan Resolves Composition That a Live
      Contact Withholds"), noted as an intentional change, not silent
      drift. Wire the resulting radius into the same disclosure predicate
      the plume channel uses, so a parked, non-emitting, sweeping ship is
      actually disclosed by it (not merely computed and left unconsumed).
      (proximity-disclosure: *A Sweep's Emission Radius Scales With Its
      Range* — A closer sweep target yields a smaller emission radius than
      a farther one; A sweep at zero range still emits at the named floor;
      Scanning is reported on its own flag, not as emission; A ship
      burning and sweeping reports both flags; Detection radius combines
      passive range with the louder of plume or sweep emission; A parked,
      sweeping ship is disclosed by its sweep emission alone; *A Scan
      Resolves Composition That a Live Contact Withholds* — A live contact
      withholds composition; A scan resolves hull count and types;
      Composition is frozen at the sighting's stamp)
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
- [ ] 5.8 Implement `ScanResolver(ships ShipSource, bodies BodySource)` in
      `backend/fleet`, alongside `BurnResolver` — its home package, not
      `backend/sightings`, since only `fleet` holds the resolve-transaction
      callback shape it mirrors; `fleet` imports `sightings` to write the
      records this resolver mints (task 3.5 records that import as
      deliberate, not a gap). Read inside the resolve transaction callback
      (mirroring `BurnResolver`'s injected `BodySource` pattern) and return minted
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
      scanner being in lane transit at pulse-reach. Fizzle the same way,
      with a reason code identifying the host as unresolved, when the
      target host itself cannot be resolved in the scanning fleet's system
      at pulse-reach — for a body host, a degraded body-table build
      omitting it; for an own-fleet host, that fleet having left the system
      or entered lane transit — and in every fizzle case, still release the
      sensor-channel slot at resolve, so an unresolvable host never strands
      the slot claimed.
      (focused-scan: *A Sweep Resolves Into Sightings, Or Fizzles* — A
      resolving sweep mints sightings for the chain masked at its host; A
      resolving sweep against an empty host mints a clean-sweep record; A
      resolving sweep stamps its records at pulse-reach, not resolution
      time; A geometry failure at pulse-reach mints nothing; A scanning
      fleet that left the host's system mints nothing; A scanning fleet in
      lane transit at pulse-reach mints nothing; An unresolvable body host
      mints nothing and releases the slot)
      (proximity-disclosure: *A Focused Scan Reveals the Ships Masked At
      Its Target* — A focused scan finds a chained ship; A clean sweep is
      itself a record; A host beyond focused-scan range cannot be swept)
- [ ] 5.9 Implement cancel via `POST /v1/actions/:actionId/cancel` naming
      the scan action's own id: release the claimed sensor-channel slot,
      apply no resolver effect (no sighting minted), end the sweeping flag
      at the instant of cancellation rather than the scan's original
      arrive time. Confirm `POST /v1/fleets/:fleetId/cancel` continues to
      release only the movement-channel slot and never touches a running
      sweep on the sensor channel — the two channels cancel independently.
      (focused-scan: *Cancelling a Sweep Releases the Slot, Mints Nothing,
      and Ends Emission* — Cancelling a running sweep releases the sensor
      slot; A cancelled sweep mints no sighting; Cancelling a sweep ends
      sweeping immediately; The fleet-level cancel endpoint never touches a
      running sweep)

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
      `POST /v1/fleets/:fleetId/orders|cancel|cut-drive|stop|jump|scan`,
      compare `common.ActorCorp(c)` against the fleet's `corporationId` and
      respond `404` — not `403` — on mismatch or no corporation, so that a
      foreign corporation can neither move a victim fleet nor claim its
      sensor-channel slot to strip its masking via an unauthorized scan.
      Delete `fleet/ownership_defect_test.go`; its scenarios become this
      requirement's positive ownership scenarios.
      (fleet-movement: *Fleet Command Endpoints Are Restricted to the
      Owning Corporation* — A foreign corp cannot order another corp's
      fleet; A foreign corp cannot cancel another corp's fleet; A foreign
      corp cannot cut another corp's fleet's drive; A foreign corp cannot
      order another corp's fleet to stop in place; A foreign corp cannot
      order another corp's fleet to jump; A foreign corp cannot commit a
      sweep with another corp's fleet; A corpless requester is rejected
      the same way; The owning corporation's jump order succeeds at the
      HTTP surface)
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
- [ ] 6.6 No code change: `request-authorization`'s own "Corporation
      Resolution Seam" scenario asserted, as current fact, that a mutating
      fleet or action endpoint on another corp's id "currently succeeds" —
      false the instant tasks 6.4/6.5 land. Its delta retires that
      scenario and restates the seam as consumed by the ownership checks
      those two tasks implement, so the capability doesn't carry a stale
      acceptance test past this change's own landing day.
      (request-authorization: *Corporation Resolution Seam Is Consumed By
      Ownership Checks* — A corpless request carries no corporation id; A
      spawned account's corporation is resolved; A resolution error fails
      open, not closed; A resolution failure is indistinguishable from
      genuine corplessness to the player (gap, not an endorsement);
      Mutating fleet and action endpoints now enforce ownership)
- [ ] 6.7 No code change: correct `mine-extraction`'s own citation of
      `fleet-movement`'s baseline (it names the requirement
      `replace-observation-with-sightings` closes, and drops a word from
      that requirement's actual title) so it cites the closed defect
      accurately and points forward to `fleet-movement`'s "Fleet Command
      Endpoints Are Restricted to the Owning Corporation" as the change
      that closes the sibling gap mine's own endpoint never had.
      (mine-extraction: *Mine Command Requires Fleet Ownership* — An
      unauthenticated mine request is rejected; A foreign corporation
      cannot mine with another corp's fleet; The owning corporation may
      mine its own fleet)

- [ ] 6.8 No code change: correct `fleet-movement`'s own citation in "Fleet
      Read Surfaces Roster, Cargo, and Derived Capacity" — it names
      "Fleet Read Endpoints Serve Own Fleets Only", the requirement task
      4.8 replaces in this same change — to cite the requirement's new
      name, "Fleet Read Endpoints Serve Own Fleets In Full and Foreign
      Fleets As Contacts", so the capability doesn't carry a cross-
      reference into a requirement name that no longer exists past this
      change's own archive.
      (fleet-movement: *Fleet Read Surfaces Roster, Cargo, and Derived
      Capacity* — The fleet read response includes roster, cargo, and
      derived capacity; A foreign fleet's cargo and roster are not
      disclosed)
- [ ] 6.9 No code change: correct `request-authorization`'s own citation in
      "The Sell Endpoint Ignores a Client-Supplied Corporation Id" — it
      names "Corporation Resolution Seam", the requirement task 6.6
      replaces in this same change — to cite the requirement's new name,
      "Corporation Resolution Seam Is Consumed By Ownership Checks", for
      the same reason as 6.8.
      (request-authorization: *The Sell Endpoint Ignores a Client-Supplied
      Corporation Id* — A client-supplied corporation id in the sale body
      has no effect)

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

- [ ] 7.7 No code change: record three carried minors so an implementer does
      not invent an answer for any of them mid-build. (1) `GET
      /v1/sightings`'s behavior for an authenticated but corpless requester
      is unspecified by this change's delta — neither "empty page" nor
      "error" is pinned by a scenario; implement whichever this capability's
      other corpless-read precedent (`system-interior`'s empty `contacts`
      array) suggests, but do not treat that as a spec requirement to test
      against. (2) The pagination cursor's wire shape (what a "continuation"
      supplied on a later page looks like) is unspecified — *A read without
      further parameters returns at most the page maximum* and *Records are
      ordered newest-minted-first* pin the no-continuation case only; the
      continuation format itself is left to implementation. (3)
      `action.Handler`'s injected `ActorOwner.OwnerOf` erroring (as opposed
      to returning a definitive owner or "not found") has no pinned
      behavior — unlike `request-authorization`'s own corporation-resolution
      seam, which explicitly fails open, no scenario here says whether an
      `ActorOwner` lookup error should fail open (proceed unauthorized-
      checked) or closed (404). All three are deliberately deferred, not
      decided by this change.

## 8. Validation

- [ ] 8.1 Additive-wire guard test: the interior read continues to serve
      `features[].footprint`, `features[].band` (constant `"visible"`),
      `features[].live` (constant `true`), and `laneGates[].cell` unchanged
      alongside the new `space`/`size`/`contacts` fields — the live board
      is the only playable view until a later link deletes these.
      (system-interior: *Interior Read Endpoint* — Pre-existing wire fields
      are unchanged)
- [ ] 8.2 Consequence tests for the two silent blockers: an HTTP-level test
      that submits `POST /v1/fleets/:fleetId/jump` against the real,
      production-constructed router (no fake `GraphSource`) for a fleet
      attached to a gate, and asserts a success response carrying the
      committed ETA — never a `5xx` — since blocker 3 is now closed at the
      constructor's type signature rather than by a wiring test (design.md
      Decision 22; the required positional parameter makes an unwired
      router a compile error, so the regression net that matters is the
      end-to-end behavior, not the wiring itself; this is the same
      assertion as fleet-movement's *The owning corporation's jump order
      succeeds at the HTTP surface*); and an emulator-backed ordering test
      asserting `EnsureLaneHorizon` runs before the destination's first
      `BodyTable` build on jump arrival at the frontier (blocker 4) — both
      regression nets on top of the end-to-end slice in task 1.6, per
      design.md Decision 24.
      (fleet-movement: *Fleet Command Endpoints Are Restricted to the
      Owning Corporation* — The owning corporation's jump order succeeds at
      the HTTP surface)
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
- [ ] 8.7 Regression-confirm `trading-station`'s tier gate applies only to
      the direct station read (`GET /v1/systems/:systemId/station`) and
      never to the system-interior/board read, which serves a system's
      station unconditionally per `system-interior`'s *Bodies Are Public;
      Ships Are Disclosed* — the same body-publicity task 4.6 implements. No
      code change: `system/service.go`'s `spliceStation` already splices
      the station ungated; this task confirms the spec correction matches
      shipped behavior rather than re-introducing a tier check at the
      interior seam.
      (trading-station: *Home Station Visible On the Direct Station Read,
      No Scan Required* — A freshly spawned corporation's first direct
      station read shows its home station; A system at exactly the
      configured minimum tier includes its station on a direct read; The
      board read serves the station regardless of tier)
- [ ] 8.8 End-to-end frontend test covering the full wire-to-click path task
      4.11 wires: read a materialized system's interior, take the served
      `laneId` off an attached lane-gate body, and invoke the jump command
      with it — asserting the jump order is actually submitted (not a
      no-op or a client-side refusal), closing the gap a per-scenario unit
      test on either half alone would miss.
      (board-view: *Jump Commit* — Invoking jump submits the attached
      gate's lane)

## 9. Cleanup

- [ ] 9.1 **SDET.** `lib/types/system-board.ts`'s `LaneGate.laneId` is
      currently optional (`laneId?: string`) only because pre-existing
      `LaneGate` literals in non-test, type-checked code construct one
      without it, and the server always sends it — the optional type
      currently lies about the wire. Update: the three pre-existing
      fixtures in `SystemBoardView.test.tsx` that construct a `LaneGate`
      without `laneId`, AND the two `LaneGate` literals inside
      `frontend/app/spike/webgl-board/mock-board.ts:135-136`'s `const
      board: SystemBoard` (also type-checked, also missing `laneId`) — all
      five sites need a `laneId` before the field can be tightened. Then
      make the field required (`laneId: string`). Also correct
      `lib/types/system-board.ts:78-82`'s `LaneGate` doc comment, which
      still claims "Fog-filtered server-side: only lanes the requester has
      charted ship" — false since §1 (task 1.3 deletes `chartedGates`;
      every lane-gate body ships unfiltered to every authenticated
      requester). Type-only tightening plus a stale-comment fix once its
      last excuse is gone; no behavior change.
      (system-interior: *Lane-Gate Bodies Carry Their Lane Id* — A
      materialized system's read carries each lane-gate body's lane id;
      *Bodies Are Public; Ships Are Disclosed* — No body is omitted for
      lack of stored knowledge)

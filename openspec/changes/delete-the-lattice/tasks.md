## 1. Preconditions — verified first, never assumed

Nothing in sections 2–13 may start until every task here passes. If 1.1 or 1.3
is dirty, **stop**: the predecessor is not complete, and the fix belongs there
(proposal's *Precondition*).

- [x] 1.1 Re-run `build-production-space-view` task 10.11's grep against the
      real tree, restricted to IMPORTS **from a non-deleted path** (the
      predecessor's own wording), since the only import hits today are the
      two doomed directories importing each other and two further surviving
      hits are prose about the deletion rather than dependencies on it:
      `grep -rnE "from '@/lib/(board|polar)'|require\('@/lib/(board|polar)'\)" frontend --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '^frontend/lib/board/' | grep -v '^frontend/lib/polar/'`.
      It SHALL return nothing. The excluded hits are `frontend/lib/board/`'s
      own 14 imports of `@/lib/polar`; both directories are deleted together
      by task 6.2, so an importer inside them is not a surviving dependency.
      The two prose hits —
      `frontend/components/space/SystemSpaceView.tsx:29` and
      `frontend/lib/types/action.ts:5` — are rewritten by task 6.3, not by
      the predecessor. Record the output in the commit message.
- [x] 1.2 Confirm all five predecessors are archived, in order, by listing
      `openspec/changes/archive/` for `add-fuel-as-cargo`,
      `add-stationkeep-hold-verb`, `serve-orbital-elements-and-burn-preview`,
      `build-production-space-view`, `add-scan-and-sightings-surface`, and
      confirm `openspec/changes/` contains no directory but `archive/` and this
      one
- [x] 1.3 Confirm `openspec/specs/board-view/` does **not** exist (retired by
      `build-production-space-view` task 13.5) and that
      `grep -rn "board-view" openspec/specs/` returns nothing. A surviving
      `board-view` citation means that change's own dangling-reference sweep did
      not complete
- [x] 1.4 Record the backend precondition as a baseline rather than a
      requirement: `cd backend && grep -rln '"hexaverse/board"\|"hexaverse/polar"'
      --include='*.go' .` SHALL list exactly the files sections 2–5 remove,
      plus one expected exception: `backend/action/commit_params_validator_continuous_test.go`
      is a RED-phase file of this change and is therefore a `hexaverse/board`
      importer that sections 2–5 do not name; it is removed by its own GREEN
      rewrite. Anything else on that list not named in those sections is an
      unplanned importer and must be reported before proceeding
- [x] 1.5 Confirm the suite is green *before* any deletion, so a later failure
      is attributable: `cd backend && go test ./... -p 1` (the `-p 1` is
      mandatory — the root `TestMain` wipes the shared emulator project and
      parallel package runs self-race), `cd frontend && npx vitest run`, and
      `bash .claude/scripts/check-mirror-map.sh`

## 2. Backend — remove the lattice tier from `backend/system`

- [ ] 2.1 Delete `system.Orbit` and, from `system.Feature`, the fields `Orbit`,
      `ParentId`, `Fixed`, and `Footprint`, together with their Firestore tags.
      Verified by `grep -rn 'Footprint\|\.Fixed\b\|f\.Orbit\|Orbit \*Orbit'
      backend/system` returning nothing outside deleted code
      (`system-interior`: *Every Generated Body Carries a Continuous Orbital
      Element Set and a Size*)
- [x] 2.1b Delete `SystemInterior.Radius` (`system/model.go:190`, tagged
      `json:"radius" firestore:"radius"`) — the top-level lattice cell radius
      8a-2's own comment at `model.go:195-199` defers to this change by name.
      `SystemInterior.Extent` is its continuous successor and is already
      persisted. Verified by `grep -rn 'Interior\.Radius\|si\.Radius'
      backend/` returning nothing
- [ ] 2.2 Delete `system.PeriodFor` and the `dao.go` read-time refill of
      `f.Orbit.Period`. Verified by `grep -rn 'PeriodFor' backend/` returning
      nothing (`system-interior`: REMOVED *Orbital Period Read from Live
      Tuning*)
- [ ] 2.3 Delete `system.featureRingOK` and its `readInterior` call site, and
      `clampRing` with every caller. Verified by
      `grep -rn 'featureRingOK\|clampRing' backend/` returning nothing
      (`system-interior`: REMOVED *Interior Feature Decode Validates Ring
      Against the Live Schedule*)
- [ ] 2.4 Rewrite `generator.go`: drop `board.Schedule`, `board.Canon`,
      `board.RingCells`, the `sched polar.Schedule` parameter threaded through
      `orbitFeature`/`orbitFor`/`beltFeature`/`hazardFeature`, and the
      `Angle0` slot draw. **`orbitFor` does not merely lose a parameter — it
      returns `system.Orbit` (`generator.go:221`), the type task 2.1 deletes,
      so the function ceases to exist entirely**, as does `orbitFeature`'s
      `Orbit`/`Footprint` construction (C8: describing this as "drop a
      parameter" understates the deletion and leaves an implementer expecting
      a function that is no longer there to repoint). The non-skeleton
      star-parented feature's orbital index stays an integer draw in
      `[1, params.Radius]` with no board meaning (`system-interior`:
      *Continuous Orbital Radii Ascend With the Skeleton Ordinal and Are
      Separated*)
- [ ] 2.5 Re-source `continuousStarParented`'s `retrograde` input: it currently
      reads `f.Orbit.Dir < 0`. Pass the direction the `diskOrCaptured` /
      `DominantOrbitDirection` roll already produced directly instead, so the
      side is still decided exactly once on the primary stream
      (`system-interior`: *Retrograde Motion Is Expressed By Inclination, Never
      By a Non-Positive Period*). This is the one place where deleting a field
      could silently change a rule rather than remove one — a `retrograde` that
      quietly becomes always-false makes every capture-plausible body prograde
      and every test still pass
- [ ] 2.6 Delete `generateWithStreams`' `r2 == nil` mode and the instrumented
      lattice-stream word counter, and collapse `Generate`/`generateWithStreams`
      accordingly. Verified by `grep -rn 'r2 == nil\|latticeDrawCount'
      backend/system` returning nothing (`system-interior`: REMOVED *Lattice
      Placement Is Independent Of The Continuous Stream*)
- [x] 2.7 Remove `LaneGate.Cell` and `LaneGates`' `radius` parameter; the gate's
      position comes from the body table via `fillGateGeometry` alone. Update
      **both** production callers — `fleet/fuel.go:126` and
      `system/handler.go:115` (`h.svc.LaneGates(ctx, systemID,
      gen.Interior.Radius)`), the latter of which is the last reader of
      `SystemInterior.Radius` (task 2.1b) — (`system-interior`: MODIFIED *Lane
      Gate Projection*)
- [x] 2.8 Delete `system/fog_source.go`'s `occlusionRadius2` and its
      `board.StarOcclusionRadius2`/`board.PlanetOcclusionRadius2` constants,
      and its one test caller, `system/fog_source_test.go:44` (which does not
      compile after the deletion unless repointed or removed with it). The
      stated grep for "no production caller" must exclude the definition
      itself and match only call sites:
      `grep -rn 'occlusionRadius2(' backend/ | grep -v _test.go | grep -v
      '^backend/system/fog_source.go:25'` returning nothing — the bare
      `grep -rn 'occlusionRadius2' backend/ | grep -v _test.go` form always
      returns at least the definition line and the doc comments above it, so
      it can never pass as written. This is the ninth "built, unit-tested,
      never called" instance the chain has found, and it is pure deletion
      material, not a repair
- [x] 2.9 Delete `system/fog.go`'s `fogFeatureDTO` lattice fields if
      `build-production-space-view` task 9.1 left any, and the vestigial
      `type BoardFog interface{}` / `Handler.fog` / `Handler.WithFog` in
      `handler.go` — an empty interface with no method and no implementation,
      surviving only under a lattice name. Verified by `grep -rn 'BoardFog'
      backend/` returning nothing
- [ ] 2.10 Remove the `"hexaverse/board"` and `"hexaverse/polar"` imports from
      every remaining `backend/system` file, production and test alike, and
      delete or rewrite the tests that exist only to exercise the lattice —
      keeping every assertion about continuous behaviour and dropping only
      lattice assertions. **Derive the file list mechanically; do not work from
      a hand-written enumeration.** The list is whatever this returns:
      `grep -l -E 'clampRing|featureRingOK|generateWithStreams|PeriodFor|Footprint|LaneGates\(|Orbit\.(Ring|Angle0|Dir)|latticeDrawCount' backend/system/*_test.go`
      — today **21 files**, nine of which (`continuous_test.go`,
      `cross_target_test.go`, `dao_test.go`, `fixtures_test.go`,
      `gates_lane_id_test.go`, `generate_streams_test.go`,
      `generator_continuous_test.go`, `lattice_identity_test.go`,
      `model_test.go`) an earlier hand-written list omitted. The compiler
      catches all nine, so nothing is silently lost — but this chain's failure
      mode is agents trusting an enumeration over a query, so re-run the grep
      rather than reading the list above

      **Ruling G (r7 addendum) — one file in that 21-file list is not yours.**
      `generator_continuous_test.go` is recorded in
      `red-manifest-delete-the-lattice.txt` and has already been revised by the
      SDET (task 2.10b), and every file in that manifest is SDET-owned. A
      developer who finds a manifest-recorded file in their own task's
      mechanically-derived file list **halts that leg and reports it to the
      orchestrator** rather than editing it — this is the same seam that
      produced this repo's *integrity check finds altered tests* BLOCKER, and
      this is the one place in section 2 where a developer's derived list and
      the red manifest overlap. Its three surviving prose lines (`:327,339,383`,
      which task 10.2's sweep keeps deliberately visible) are cleared by a
      pre-authorized **comment-only** SDET pass at the acceptance gate: no
      assertion, test name, or failure-message string changes, the manifest is
      re-recorded, and the cause is logged in `link9-red-coverage.md`. If
      clearing a line would require touching anything but a comment, the SDET
      halts and reports instead
- [ ] 2.10b `generator_continuous_test.go` is **re-sourced, not trimmed.** Its
      retrograde assertions read `f.Orbit.Dir` to check that a body's
      continuous inclination matches its lattice direction. Deleting the
      comparison leaves the retrograde path asserted by nothing. Repoint each
      assertion at the `DominantOrbitDirection` / `diskOrCaptured` roll that
      task 2.5 makes the sole source of the side, so the test still fails if
      `retrograde` becomes always-false — the exact silent-rule-change task 2.5
      itself warns about (every capture-plausible body turns prograde and every
      test still passes). Same treatment for the retrograde legs of
      `continuous_test.go` and `lattice_identity_test.go`
- [ ] 2.10c **(moved from task 7.5 — C6: this family goes red the instant
      2.4/2.5/2.6 land, so it must be re-recorded inside this same section-2
      commit, not deferred to section 7)** Re-record
      `fixtures/system/cases.json`'s `interiorElements` family over its
      surviving `continuousLine` component alone, dropping
      `latticeProjection` and `latticeDrawCount` from the serialization and
      recomputing `interiorElementsSweep`'s digest and `serialization` string
      (design.md Decision 3), by running the family's regeneration with
      `UPDATE_FIXTURES=1` (`system/fixtures_test.go:711`) — the mechanism that
      actually rewrites the file; "re-record" alone names no command. **Before
      committing the re-recorded file**, assert it reproduces byte-for-byte
      under `GOARCH=arm64` and under `GOARCH=amd64 GOAMD64=v1`. If the two
      disagree, **stop and report** — do not commit a one-architecture
      recording (design.md OQ-1; this is the exact failure
      `pin-system-generation-determinism` existed to end). The durable check
      against a future divergence is the standing `./system/` cross-target
      leg (`check.py:1107-1131`, `.gitlab-ci.yml:342`), which this task's
      byte-for-byte assertion is a one-time rehearsal of, not a replacement
      for
- [ ] 2.10d **(moved from task 7.6, for the same reason as 2.10c)** Update
      `fixtures/system/cases.json`'s `_meta.generatedOn` and
      `_meta.serialization` to describe the new recording honestly, naming
      **both** build targets (`GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1`)
      the byte-for-byte check in 2.10c ran against — recording only one
      leaves a one-architecture recording indistinguishable from a
      two-architecture one after the fact
- [ ] 2.11 Add the test the removed slot-coverage scenario leaves behind:
      generate interiors across many seeds, collect every feature's continuous
      phase, and assert **both** legs (`system-interior`: *Interior Generation
      Is Lazy and Deterministic* › "Generated phases span the whole turn"):
      (a) the collected phases occupy every quadrant of `[0, SubTurn)`; and
      (b) the greatest common divisor of the **pairwise differences** of the
      collected phases is `1`, so the draw is not confined to a coarse
      sub-lattice of the turn at any offset. Leg (b) is not optional
      decoration, and it must be computed over pairwise differences, not over
      the raw phases: the gcd of the raw phases is fooled by a shifted
      lattice — a generator drawing `phase = 1 + r.Intn(16)*65536` has gcd 1
      (the set contains 1) while still occupying only 16 of over a million
      values, the coarse-sub-lattice-at-an-offset defect the pairwise-
      difference form catches and the raw-value form does not. `SubTurn` is
      `1<<20 = 1048576`, so leg (a) alone is four buckets over a million
      values: a generator drawing
      `phase = wrapSubTurnFraction(float64(r.Intn(16))/16)` passes it while
      leaving 99.999% of phases unreachable — the continuous restatement of
      exactly the defect the retired every-slot-is-reached scenario caught.
      Today's generator is fine; it is the **spec** that would permit the
      regression. Without this task, deleting the slot-coverage scenario
      removes reachability coverage instead of relocating it
- [ ] 2.12 `cd backend && go test ./system/ -short -count=1` green — **cannot go green before 2.10c/2.10d land** (C6): `interiorElements` is red from the moment 2.4/2.5/2.6 change the generator's draw until the fixture is re-recorded

## 3. Backend — remove the lattice tier from `backend/stations`

- [ ] 3.1 `backend/stations/placement.go` is 88 lines and contains exactly
      two functions, `DeriveOrbit` (`:41`) and `mix64` (`:83`), both deleted,
      and `mix64` has no other user in the package — **`rm
      backend/stations/placement.go`** rather than leaving a
      header-comment-only file. This grep's own three further hits, beyond
      the file itself, are in scope and must be repaired in the same task:
      `backend/stations/service_test.go:90` (`want := DeriveOrbit(...)`, a
      genuine call site that stops compiling — repoint or delete the
      assertion), `backend/system/generator.go:135` (a comment: "the same
      source stations.DeriveOrbit already uses" — rewrite), and
      `backend/system/station_continuous.go:6-9` (a comment naming
      `stations.DeriveOrbit` as "the LATTICE derivation, which this change
      does not touch" and stating it "dies at link 8-9" — that link is this
      one; the production code in that file makes no call to `DeriveOrbit` or
      to any `board`/`polar` symbol, so the fix is comment-only, but the file
      is production code and belongs in this task's scope, not left for
      task 10.2 to discover as prose). Verified by
      `grep -rn 'DeriveOrbit' backend/` returning nothing
      (`trading-station`: REMOVED *Deterministic, Non-Core, Off-Gate-Ring,
      Prograde, Orbiting Placement*)
- [ ] 3.2 Delete `stations.ErrStationRingOutOfRange` and the ring check,
      `board.ProductionSchedule()` lookup, `board.Canon` call and `Footprint`
      construction from `stations.FeatureOf`, leaving a station feature carrying
      only id, type, name and owner. **This is the tether
      `build-production-space-view`'s design deferred to this change by name** —
      a station omitted from an interior read for a lattice reason with nothing
      on the wire to hint at it (`trading-station`: REMOVED *A Station Orbit
      Outside the Live Board Radius Is Omitted, Never Panicked*)
- [ ] 3.2b Delete `stations.Station.Orbit` — the `system.Orbit`-typed field at
      `stations/model.go:35`, tagged `json:"orbit"` and `firestore:"orbit"`.
      It is **served**, not merely stored: `GET /v1/systems/:systemId/station`
      marshals the whole `Station` struct (`stations/handler.go`, `c.JSON(...,
      st)`), so this is a WIRE removal, and `system.Orbit` is the lattice type
      task 2.1 deletes — leaving the field would fail `backend` compilation.
      Remove with it: the `Orbit: DeriveOrbit(...)` assignment at
      `stations/service.go:114`, the `st.Orbit.Ring`/`st.Orbit.Dir` fields on
      the provisioning log line at `service.go:131-132`, and every `st.Orbit`
      read inside `FeatureOf` (covered by 3.2). **No successor field is added
      to this endpoint.** The station's continuous orbit is
      `system.StationContinuousOrbit`, derived at interior-splice time from
      (galaxy seed, system id, skeleton) and never persisted on the station
      document; it reaches a client on the interior read alone, as the
      station body's `space`/`size`/`orbitElements` — so a client needing the
      station's position reads `GET /v1/systems/:systemId`, exactly as it does
      for every other body. Verified by `grep -rn '\.Orbit\b'
      backend/stations/` returning nothing and `cd backend && go build ./...`
      clean (`trading-station`: REMOVED *Deterministic, Non-Core,
      Off-Gate-Ring, Prograde, Orbiting Placement*, whose Migration already
      names "the stored `orbit` field"; and REMOVED *A Station Orbit Outside
      the Live Board Radius Is Omitted, Never Panicked*)
- [ ] 3.2c Delete the CLIENT half of the same field, which no other sweep in
      this change reaches: `frontend/lib/types/market.ts:67`'s
      `orbit: { ring, angle0, period, dir }` on the `Station` interface (a
      REQUIRED property, so leaving it makes every `Station` literal a lie),
      and every `orbit:` literal built against it — `market-service.test.ts`'s
      `station` fixture, and three further `Station`-literal sites the task's
      own verification grep already returns but no enumeration named:
      `frontend/components/space/FleetActionsPanel.test.tsx:91`,
      `frontend/components/space/SystemSpaceView.test.tsx:81`, and
      `frontend/hooks/use-market.test.tsx:41`. Task 6.3's sweep grep
      (`ring\b.*slot\b`) does NOT match this shape — the field names
      ring/angle0, never slot — which is why it is named here rather than
      left to the sweep. Verified by `grep -rn 'angle0' frontend
      --include='*.ts' --include='*.tsx' | grep -v node_modules` returning
      nothing once section 6 deletes `frontend/lib/board` (which holds 17
      further `angle0` hits across four files until then); at task time the correct assertion
      is that the grep returns only `frontend/lib/board/` paths. Also
      confirmed by `cd frontend && npm run lint && npx vitest run` green —
      `orbit` is a REQUIRED property today, so leaving any of these four
      literals behind is an excess-property lint error, not a silent pass.
      No production frontend module reads `station.orbit` today, so this is a
      type-and-fixture deletion with no rendering consequence
- [ ] 3.3 Delete `stations.Service`'s `gateRing: common.Tuning().BoardRadius`
      fields and the `system.PeriodFor(orbit.Ring)` refill
- [ ] 3.4 Delete `backend/stations/lattice_symbols_absent_test.go`,
      `backend/mine/lattice_symbols_absent_test.go`,
      `backend/market/lattice_symbols_absent_test.go`, and
      `backend/fleet/lattice_symbols_absent_test.go` (design.md Decision 6: a
      guard asserting a package is not imported is subsumed by the package not
      existing, and can never fail again — the `fleet` copy is the same
      species as its three siblings and was previously caught only by task
      10.2's sweep, where it looked like prose to repoint rather than a file
      to delete). Delete `stations/orbit_guard_test.go`,
      `stations/no_lattice_dock_predicate_test.go` (Decision 6 again: its own
      header records that the package implements no dock predicate at all, so
      the guard it carries — "Docking to the station involves no lattice
      predicate" — is unfailable once the lattice is gone; task 3.5's new
      positive test is its replacement, not this file repointed), and the
      lattice half of `stations/placement_test.go`. Delete
      `TestInteriorRead_NoLatticeFieldTypeSurvivesOnTheWireDTOs`
      (`system/interior_wire_lattice_removal_test.go:192-223`) and the
      `"hexaverse/board"`/`"hexaverse/polar"` string literals it matches on —
      a reflection guard that no DTO field is a `board`/`polar` type,
      unfailable once those packages are gone (Decision 6). **Keep
      `TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` in the same
      file**: it asserts json tag names on the wire, which remains
      falsifiable
- [ ] 3.5 Add the positive test the removed lattice guard leaves behind: a
      fleet parked at a position coincident with the station's live continuous
      position, with no matching `attachedTo`, is not docked and every
      dock-gated verb rejects it (`trading-station`: *Station Is a Dockable,
      Non-Mineable Body* › "Position coincidence without attachment is not
      docking"). Without this task, deleting 3.4's guard removes coverage
      instead of relocating it
- [ ] 3.6 `cd backend && go test ./stations/ ./mine/ ./market/ -short -count=1`
      green — depends on 2.10c/2.10d (C6): `mine`'s and `market`'s own fixture
      suites are independent, but the package build depends on `system`
      compiling, which does not settle green until the re-record lands

## 4. Backend — tuning, fleet params, and the last test importers

- [ ] 4.1 Rename `common.GameTuning.BoardRadius` to a name containing neither
      "board" nor "ring" (design.md Decision 5; OQ-2 for the name). **Do not
      delete it** — `system.GenerationParams.Radius` sources from it and
      `SystemInterior.Extent = ContinuousRadius(params.Radius)` reads it, so
      deleting it silently changes every system's continuous extent. Verify the
      extent is unchanged by asserting `Extent` for a fixed seed before and
      after the rename
- [ ] 4.2 Delete `common.GameTuning.OrbitBasePeriod` and
      `common.GameTuning.OrbitPeriod`, and the `board.Schedule` /
      `board-tactical-math` comment at `common/tuning.go:143`. Verified by
      `grep -rn 'OrbitBasePeriod\|OrbitPeriod' backend/` returning nothing
- [ ] 4.2b Delete **two further dead lattice knobs** that no `lattice`-word
      sweep finds, each in both `common.GameTuning` and its `fleet.Params`
      twin, with their assignments in `DefaultTuning()` and
      `DefaultMovementParams()`:
      - `MsPerTile` (`common/tuning.go:69-71,115`; `fleet/params.go:17,41`) —
        **zero production readers**. Its doc comment is "the world-ms cost to
        burn across one cell of a system board", so leaving it makes the
        central tuning struct describe a cell grid that no longer exists
      - `InterceptHorizon` (`common/tuning.go:75-78,117`;
        `fleet/params.go:18,42`) — **zero production readers**. It bounded the
        lead-solve search of `board.SolveIntercept`, which task 5.1 deletes

      Also repoint the four surviving comments that describe them:
      `fleet/params.go:9-10` ("MsPerTile is the world-ms cost to cross one
      hex"), `fleet/roster.go:37` ("crossing a system board
      (MsPerTile=2500ms/hex)"), `fleet/model.go:17` ("against today's global
      MsPerTile/LaneMsPerDistance") and `market/params.go:14,18` (which cites
      `MsPerTile` and `OrbitBasePeriod` as its hot-retune exemplars). Delete
      the `MsPerTile` legs of `common/tuning_test.go:22-26,43-44` and the
      comment at `fleet/roster_test.go:170`. Also repoint
      `fleet/params.go:11-14` (its `MovementParams` doc cites
      `common.GameTuning.OrbitPeriod` as the live coast-period source) and
      `fleet/resolver_test.go:23` (cites `common.Tuning().OrbitPeriod` as
      "the same period a body on that ring has"). Verified by
      `grep -rn 'MsPerTile\|InterceptHorizon' backend/` returning nothing
- [ ] 4.3 Delete `fleet.Params.BoardRadius` and its assignment, now that
      `LaneGates` takes no radius (task 2.7). Verified by `grep -rn 'BoardRadius'
      backend/` returning nothing. Beyond the production sites, that grep is
      only clean once the test readers are handled too:
      `backend/fleet/params_test.go:13-19`, `backend/common/tuning_test.go:52`,
      `backend/system/params_test.go:11` and — the one no task reached —
      `backend/corporations/params_test.go` (task 4.3b)
- [ ] 4.3b **Rewrite, do not delete, `backend/corporations/params_test.go`'s
      `TestBoardRadiusInvariant` and `TestBoardRadiusInvariant_TracksTuning`.**
      Both read `fleet.DefaultMovementParams().BoardRadius`, so both become
      compile errors the moment 4.1/4.3 land, and `backend/corporations` is
      named in no other task. **Delete only the `fleet` leg** (lines 56-58 and
      75-78). **Keep the `system.DefaultParams().Radius ==
      common.Tuning().<new name>` leg in both tests**, renaming the tests to
      match the new knob: that assertion is the *only* live guard that the
      renamed knob still drives system-generation radius, which is precisely
      what Decision 5 keeps it alive for. Deleting these tests to clear the
      compile error is the obvious repair and it silently removes the guard
      task 4.1 depends on. The `_TracksTuning` test's `SetTuning`-and-observe
      structure is what proves the wiring is live rather than coincidental —
      keep it
- [ ] 4.4 Delete `backend/common/tuning_schedule_test.go` (it exists to assert
      the tuning radius against a board schedule) and repoint
      `backend/action/commit_params_validator_test.go`'s rejected non-primitive
      from a `board.Cell` to a `space.Vec3` (`action-dispatch`: *Commit Rejects
      Non-Primitive Action Parameters* › "A domain struct in params is rejected
      at commit"). The test must still be red for the right reason — confirm it
      fails when the validator's allowlist is widened
- [ ] 4.4b Repoint the **acceptance** half of the same file, which task 4.4
      does not reach: `commit_params_validator_test.go:98-116` builds
      `board.EncodeCell(board.Cell{Ring: 4, Slot: 9})` and asserts the stored
      params carry `gotOrigin["ring"] == 4 && gotOrigin["slot"] == 9` against a
      hand-built `map[string]any`. After this change no code produces that
      shape, so the assertion is green forever against a literal nothing
      writes. Replace it with `space.EncodeVec` of a fixed `space.Vec3`,
      asserting the stored value round-trips through `space.DecodeVec`
      (`action-dispatch`: *Commit Rejects Non-Primitive Action Parameters* ›
      "An encoded coordinate map commits normally"). Also repoint the
      `ActorState` case at `:122-155`, which carries a `board.MovementState`
      with a `board.Orbit{Ring, Angle0, Period, Dir}`, at the continuous
      movement-state struct (› "Actor state carrying a domain struct still
      commits")
- [ ] 4.5 Repoint `backend/mine/integration_test.go` off `board`, keeping
      every continuous assertion. `backend/interior_additive_wire_e2e_test.go`
      no longer exists — 8a-2 removed it, and no backend-root e2e test imports
      `board` today — so there is no second file to repoint here
- [ ] 4.6 `cd backend && go build ./... && go test ./... -p 1` green — **cannot
      go green before 2.10c/2.10d land** (C6): this run includes `./system/`,
      whose `interiorElements` fixture is red until the re-record from the
      generator rewrite is committed

## 5. Delete `backend/board` and `backend/polar`

- [ ] 5.1 `rm -rf backend/board backend/polar`
- [ ] 5.2 Verified by `cd backend && go build ./... && go vet ./...` clean, and
      `grep -rn 'hexaverse/board\|hexaverse/polar' backend/` returning nothing
      (including string literals in comments and test prose)
- [ ] 5.3 `cd backend && go test ./... -p 1` green — same dependency on
      2.10c/2.10d as 4.6 (C6)

## 6. Delete `frontend/lib/board` and `frontend/lib/polar`

- [ ] 6.1 Re-run task 1.1's grep — it must still return nothing after sections
      2–5, since a backend change can add a frontend type import
- [x] 6.2 `rm -rf frontend/lib/board frontend/lib/polar`
- [x] 6.3 Sweep the frontend for surviving lattice vocabulary that is not an
      import: `grep -rn 'systemBoard\|lib/board\|lib/polar\|ring\b.*slot\b'
      frontend --include='*.ts' --include='*.tsx' | grep -v node_modules`.
      Rename or remove each hit. `queryKeys.market.board()` is the **market
      price board** and is not lattice — it stays; state that exception in the
      commit rather than leaving the next reader to rediscover it.
      `queryKeys.systemBoard` (the per-system interior read's key namespace —
      `lib/query-keys.ts`, `hooks/use-system-space.ts:21`,
      `hooks/use-fleets.ts:32,140`, and their three test files) IS lattice
      vocabulary on the continuous view: rename it to `queryKeys.systemSpace`
      in the factory and every reader, and update
      `lib/query-keys.test.ts`'s five assertions and the two `it()` titles at
      `:19` and `:28` that name the prefix. It is a pure rename with no
      wire or cache-shape consequence beyond the key string itself.
- [x] 6.3b **The two surviving lattice tethers under `frontend/app/spike/`,
      each with live importers.** `build-production-space-view` tasks 10.5 and
      10.6 were narrowed to stop short of both, because cutting either breaks a
      spike that is not lattice work and that no change owns:
      - `frontend/app/spike/hex-board/mock-system.ts` — genuine lattice
        (axial hex coordinates, `hexDistance`, `ringOf`, ring-banded `Tile`s).
        Importers: `frontend/app/spike/audio/page.tsx` (`type Character`) and
        `frontend/app/spike/audio/synth.ts` (`hashSeed`, `type Character`).
        `audio/` is the seeded ambient-engine spike; neither imported name is
        lattice (`Character` is the region-character union, `hashSeed` a
        string→32-bit hash).
      - `frontend/app/spike/space-3d/` (`sim.ts`, `SpaceView.tsx`, `page.tsx`,
        and their tests) — **not lattice at all**: it is the continuous-space
        PoC this chain was derived from (`sim.ts:4`, "off the lattice entirely
        — no rings, no slots, no cells") and the named carve-out in
        `space-kinematics`' Purpose. Importers: `frontend/app/spike/intel/`
        (`intel.ts`, `intel.test.ts`, `IntelView.tsx`, `IntelView.test.tsx`,
        `page.tsx`) and `frontend/app/spike/stealth/` (`stealth.ts`,
        `stealth.test.ts`, `StealthView.tsx`, `StealthView.test.tsx`,
        `page.tsx`) — ten files, two disclosure experiments, neither lattice.

      **What this change does unconditionally, whichever way OQ-5 is ruled:**
      rewrite the comment at `frontend/app/spike/space-3d/sim.ts:21-22`, which
      names `backend/polar` and `frontend/lib/polar` as the mirror pair it is
      shaped after. Those two paths do not exist after section 5 and task 6.2,
      and the citation is caught by task 6.3's frontend sweep and again by task
      10.1's whole-tree sweep, which allows `frontend/lib/polar` hits only under
      `openspec/changes/archive/` and `docs/`. Likewise account for the three
      `lattice` mentions in `space-3d` (`page.tsx:3`, `page.tsx:219`,
      `sim.ts:4`) against task 10.2's case-insensitive sweep: they are
      anti-lattice prose that stops meaning anything once the lattice is gone,
      so rewrite them rather than widening 10.2's allow-list. Also rewrite the
      two comments at `frontend/app/spike/space-3d/page.tsx:13` and
      `frontend/app/spike/space-3d/page.test.tsx:7`, left behind by 8a-2's
      deletion of the `webgl-board` spike bench: each still names that bench,
      which no longer exists — the same species as the `sim.ts:21-22`
      citation above, a comment naming a thing that no longer exists. All are
      moot if OQ-5 is ruled "delete".

      **What this change does not decide:** whether either tether is deleted.
      That is **OQ-5 in design.md** — the choice is per-tether, either migrate
      the importer to a continuous equivalent (for `hex-board`, inline the two
      names into `audio/`; for `space-3d`, there is no continuous equivalent to
      migrate to, since it *is* the continuous one) or delete the dependent
      spike as well. Deleting a live experiment of Travis's is not this
      change's call to make. **Do not delete either path on this change's own
      authority.**

      **How the deletion is verified if and when OQ-5 authorizes it**, in the
      same form as 5.2/6.2/7.1: after `rm`, each of
      `grep -rn 'hex-board' frontend --include='*.ts' --include='*.tsx' | grep -v node_modules`
      and
      `grep -rn 'space-3d' frontend .claude --include='*.ts' --include='*.tsx' --include='*.sh' | grep -v node_modules`
      SHALL return nothing, `cd frontend && npm run lint && npx vitest run`
      SHALL stay green, and — for `space-3d` only — task 13.1's Purpose edit
      and task 8.9's site-18 clause both flip from "leave it" to "remove it",
      because the carve-out then names a path that no longer exists

- [ ] 6.4 `cd frontend && npm run lint && npx vitest run` green, and
      `cd frontend && npm run e2e` green

## 7. Fixtures, mirror maps, and the deviation register

- [ ] 7.1 `rm -rf fixtures/board fixtures/polar`. The stated verification
      grep excludes only `docs/plans/` and `openspec/changes/archive/`, but
      the citation survives in fifteen further sites this task must also
      repoint (a sixteenth, `openspec/specs/system-interior/spec.md:1085`, is
      handled separately by the new MODIFIED delta — see task 10.1's note and
      C11):
      - **Four `anti_mirror`-mode mirror maps**, whose `$comment` blocks name
        `fixtures/board/mirror-map.json` and `fixtures/polar/mirror-map.json`
        as the pair they are the inverse of — `fixtures/space/mirror-map.json:9-10`,
        `fixtures/galaxy/mirror-map.json:17-18`,
        `fixtures/fleet/mirror-map.json:13-14`,
        `fixtures/disclosure/mirror-map.json:26-27`. These **cannot be
        caught by a later failure**: `anti_mirror` mode reads only
        `.sharedNames` and never `.$comment`, so a stale citation here is
        permanently silent (the same species as design.md site 32) — they
        must be repaired by hand in this task, not left for a sweep to find.
      - `fixtures/market/cases.json:2`'s `_comment` ("Mirrors
        fixtures/board/cases.json's precedent").
      - `backend/space/turn_table_record_test.go:17-19,75`,
        `backend/space/fixtures_test.go:220`,
        `backend/system/fixtures_test.go:68`,
        `backend/market/fixtures_test.go:14` — Go doc comments citing
        `backend/board`/`backend/polar`/`fixtures/board` as precedent.
      - `frontend/lib/market/fold.ts:6`, `frontend/lib/market/fold.test.ts:9`
        — the TS-side mirror of the same precedent comment.
      - `docs/specs/0004-movement-board.md:161` (`implemented`, live —
        rewrite), `docs/specs/0006-scan-and-fog.md:293,474` and
        `docs/specs/0008-movement-galaxy.md:380` (both `superseded`, so
        recorded rather than rewritten per OQ-4/task 9.4 — **`0008`'s
        `:380` line reads "`backend/board/ship.go` carries the
        `laneTransit`" and contains neither `fixtures/board` nor
        `fixtures/polar`; it is task 10.1's site, listed here only because
        it rides the same OQ-4 ruling as its two neighbours, not because
        this task's own grep returns it**), and
        `docs/openspec-retrofit-report.md:13` (lists `board-tactical-math`
        among capabilities — historical record of a report, not a live
        enforcement site; record rather than rewrite).
      - `backend/space/table.go:47` — `turnTableMeta`'s doc comment citing
        `fixtures/polar/cases.json`'s `_meta.generatedOn` shape as the
        provenance envelope it matches. Same species as the four Go doc
        comments above; repoint at `fixtures/space/turn-table.json`'s own
        `_meta` shape, which is what it actually describes.

      Verified by `grep -I -rn 'fixtures/board\|fixtures/polar' . --exclude-dir=node_modules
      --exclude-dir=.git --exclude-dir=.next --exclude-dir=.next-e2e` returning hits only under `docs/plans/`,
      `docs/handoffs/`, `docs/defects/`, `docs/specs/` (the superseded
      numbered specs this task records rather than rewrites),
      `openspec/changes/archive/` and this
      change's own folder — the same allow-list task 10.1 uses, plus ruling
      D's `.next`/`.next-e2e` exclusion and `-I`, for the same reason: the
      sweep's subject is source residue, and 16 stale bundle copies of
      `frontend/lib/market/fold.ts:6` sit under this pattern until something
      rebuilds. The five allow-listed directories are historical record and
      this change's own text necessarily names what it deletes. (The
      `--exclude-dir=archive` form used previously is dropped: it is
      redundant with the `openspec/changes/archive/` clause and
      misleadingly excludes any directory named `archive` anywhere, which is
      not what this task means.)
      Run at this point in the sequence it also returns
      `openspec/specs/cross-stack-determinism/spec.md` and
      `openspec/specs/board-tactical-math/spec.md`, which sections 12–13
      clear; those two are expected here and are not residue.
- [ ] 7.2 Create `fixtures/market/mirror-map.json` for the
      `backend/market` ↔ `frontend/lib/market` pair (design.md Decision 4),
      naming `FoldSale`/`foldSale`, `FirstTonPrice`/`firstTonPrice` and
      `Capacity`/`capacity` as pairs and `bestPriceFor` as `tsOnly`. The
      coverage strings are **`family:fold`** and **`family:firstTonPrice`** —
      `fixtures/market/cases.json`'s two non-empty families are named `fold`
      and `firstTonPrice`, and `check_mirror` matches a coverage claim against
      that file's own top-level keys with `grep -qx`, so `family:foldSale`
      fails. `Capacity`/`capacity` claims `family:fold` as an indirect callee,
      following `fixtures/polar/mirror-map.json`'s `note` convention. Any
      shared function this surfaces with no family goes to the map's coverage
      `inventory` with an `expectedChange`, not to a new fixture family —
      recording a new family is out of scope here
- [ ] 7.2b Populate `goOnly` **mechanically, not by hand**: `check_mirror`'s
      rule 1 extracts *every* top-level `^func ` in the Go directory — receiver
      methods and unexported functions included — and fails with `MISSING_GO`
      for each one absent from `pairs` + `goOnly`. `backend/market`'s non-test
      files define **28**, so `goOnly` must carry the **25** that are not in
      `pairs`. Generate the list by running the extractor itself
      (`.claude/scripts/check-mirror-map.sh:75-78`) rather than transcribing
      it:
      `for f in backend/market/*.go; do case "$f" in *_test.go) continue;; esac; grep -hE '^func ' "$f"; done | sed -E 's/^func (\([^)]*\) )?//; s/[([].*$//; s/[[:space:]]*$//' | grep -v '^$' | sort -u`
      — then subtract the three `pairs` entries. **Do not respond to
      `MISSING_GO` failures by moving `market` to `anti_mirror` mode.**
      `anti_mirror` checks only `.sharedNames`, so it passes trivially, leaves
      `check_mirror` with zero call sites anyway, and defeats Decision 4's
      entire purpose while `/check` reports green
- [ ] 7.3 Replace `check_mirror board` and `check_mirror polar` in
      `.claude/scripts/check-mirror-map.sh` with a single `check_mirror market`
      pass over `fixtures/market/mirror-map.json`,
      `fixtures/market/cases.json`, `backend/market`, `frontend/lib/market`
      (`cross-stack-determinism`: *Shared Board Math Is Pinned By a
      Cross-Language Golden Fixture* › "An uncovered mirrored function is caught
      by the coverage inventory check")
- [ ] 7.4 Prove the new pass can fail, not merely pass: temporarily add a
      function to `frontend/lib/market` that is absent from the map and confirm
      `bash .claude/scripts/check-mirror-map.sh` exits 2 naming it, then revert.
      A check that has never been observed to fail has not been shown to check
      anything
- [ ] 7.5 **Moved to task 2.10c (C6).** The `interiorElements` family goes
      red the instant the generator rewrite (2.4/2.5/2.6) lands, so it is
      re-recorded inside that same section-2 commit rather than deferred
      here — see 2.10c for the full task text and acceptance evidence. This
      entry stays in section 7's numbering only so every existing citation of
      "task 7.5" continues to resolve; it carries no independent work.
- [ ] 7.6 **Moved to task 2.10d (C6),** for the same reason as 7.5. See 2.10d
      for the full task text.
- [ ] 7.6b Run the surviving-`sqrt` audit the retired board-audit scenario is
      replaced by: enumerate every runtime `sqrt` on a rule-bearing path in
      `backend/` (at minimum `system.keplerPeriodMs` and `space`'s flight-time
      and delta-v solve), and confirm each is covered by a recorded fixture
      family asserted across the Go build-target matrix **and** carries a
      colocated `determinism:allow(pinned)` pragma naming that family. A site
      with neither a family nor a deviation-register entry fails the audit and
      must be filed, not waved through (`cross-stack-determinism`:
      *Rule-Bearing Square Roots Are Pinned By a Recorded Fixture Family* ›
      "Every surviving rule-bearing sqrt call site names its pinning family",
      "A delta-v computation using sqrt is pinned", "A newly introduced
      rule-bearing sqrt arrives with its family")
- [ ] 7.7 Edit `fixtures/determinism-register.json`'s `checks` legend — **two
      entries, not one**:
      - the `cross-target` entry names "the amd64 differential **board-test**
        leg in /check", which no longer exists. Repoint it at the surviving leg
      - the **`sqrt-pinning`** entry names *Square Roots In Rules Are Pinned,
        Not Assumed*, a requirement this change REMOVES. Repoint it at the
        replacement, *Rule-Bearing Square Roots Are Pinned By a Recorded
        Fixture Family*. A register legend citing a retired requirement is a
        dangling citation nothing checks (task 12.5b)

      Confirm the five open entries (galaxy, market ×2, mine ×2) are
      **unchanged** — none is lattice, and a deletion change must not quietly
      clear a live defect suppression

## 8. Enforcement lists, CI legs, and changed-file triggers

Every site below is enumerated in design.md's *enforcement surface*. Each task
names the file and states its verification.

- [ ] 8.1 `.gitlab-ci.yml`: remove `GOAMD64=v1 go test ./board/` and
      `./polar/` from the amd64 cross-target leg and their comments (sites 2–3),
      leaving `./space/ ./system/`
- [ ] 8.2 `.gitlab-ci.yml`: remove the `board` and `polar` compile-and-run lines
      from the qemu arm64 leg, and update the
      `DETERMINISM ARM64 LEG UNASSERTED` message string so it enumerates only
      the packages the leg actually runs (sites 4–5). A skip message naming a
      package it does not run is a false enforcement claim of exactly the
      species this chain has shipped three times
- [ ] 8.3 `.gitlab-ci.yml`: rewrite the `.fixtures-changes` anchor comment
      (site 1) — the `fixtures/**/*` glob is correct and unchanged; only the
      prose naming `fixtures/board/**`, `fixtures/polar/**`,
      `frontend/lib/hex` and `polar-lattice-math` is wrong
- [ ] 8.4 `check.py`: remove `"board"` and `"polar"` from
      `DETERMINISM_GO_PACKAGES` (site 6) and the matching entries from
      `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES` (site 15) **in the
      same commit** — `test_check_determinism_lists.py` fails if the two
      disagree, which is the point
- [ ] 8.5 **REPOINT, do not remove, the TypeScript leg of the transcendental
      lint (C9 ruling).** `check.py:258-259`'s
      `frontend/lib/board`/`frontend/lib/polar` seam-file predicate clauses
      become one `frontend/lib/market` clause; `check-transcendental.sh:88`'s
      matching `frontend/lib/(board|polar)/.*\.ts$` path predicate becomes
      `frontend/lib/market/.*\.ts$`; and `:44-46`'s comment (which cites
      `board-tactical-math` and calls `board`/`polar` "the two board-math
      mirrors") is rewritten to name `frontend/lib/market` as the surviving
      TS rule-bearing surface instead. **Deleting these clauses outright, as
      the original task text said, would leave no TypeScript file anywhere
      determinism-governed** — `check-transcendental.sh` would fall to its
      `else` branch for every `.ts` input — while `frontend/lib/market`
      (`foldSale`, `firstTonPrice`, `capacity`) is a rule-bearing TS mirror
      about to be enrolled in `check_mirror` by task 7.3. Decision 4's
      argument against leaving a working check with zero call sites applies
      here just as much as it does to `check_mirror` itself. This is also
      what makes task 8.14's docstring repoint literally true rather than a
      claim about a seam that no longer exists
- [ ] 8.6 `check.py`: remove `./board/ ./polar/` from both
      `run_determinism_cross_target` command strings and from the four result
      messages (site 9), and rewrite its docstring, which cites the retired
      `polar-lattice-math` capability (site 8)
- [ ] 8.7 `check.py`: remove the `backend/board` and `backend/polar` clauses
      from `determinism_trigger` (site 11), and the `backend/board`,
      `backend/polar`, `frontend/lib/board` and `frontend/lib/polar` clauses
      from `mirror_trigger` (site 12), adding `backend/market` and
      `frontend/lib/market` to `mirror_trigger` so task 7.3's new pass is
      actually reachable from a changed-file run. **A pass enrolled in a command
      whose trigger never fires is not enforced** — this is
      `pin-system-generation-determinism`'s sharpest finding, repeated
- [ ] 8.8 `check.py`: rewrite `run_mirror_map_check`'s docstring (site 10),
      which describes the board pair specifically
- [ ] 8.9 `check-mirror-map.sh`: rewrite the header comment (site 17) and
      update the final `PASS:` message's package enumeration (site 20).
      **Site 18 — the `frontend/app/spike/space-3d` carve-out comment at
      `:181` — is left in place.** Its premise was that
      `build-production-space-view` task 10.6 deleted that spike; 10.6 was
      narrowed and deletes nothing (task 6.3b), so the comment still describes
      a directory that exists and an exemption that is still live. Delete it
      only if OQ-5 is ruled "delete `space-3d`", in which case 6.3b's
      verification grep covers it. Deleting a true carve-out note is how an
      exemption becomes folklore
- [ ] 8.10 `check-frontend-tests.sh`: **REPOINT, do not delete, the
      `components/board/webgl/` GL-plumbing carve-out (C7 ruling)** —
      `:126` (the predicate: `/components/board/webgl/.*\.(ts|tsx)$` →
      `/components/space/webgl/.*\.(ts|tsx)$`), `:118` (the same path inside
      the exemption comment's pairing rule), and `:114` (see below). The
      rest of the comment block (`:115-117,119-125` — the tautology rationale
      and the pairing rule's substance) is policy, not lattice vocabulary,
      and stays unedited — `frontend/components/space/webgl/`
      exists and inherits that exact policy, and every module in it already
      has a test, so repointing breaks nothing. Deleting a live carve-out
      note is how an exemption becomes folklore, the same reasoning task 8.9
      uses to keep site 18. `:114`'s example symbol `createLattice` is
      lattice vocabulary from the deleted renderer, not policy: rewrite it
      to `SpaceWorld` — the only symbol `frontend/components/space/webgl/`
      exports — because task 10.2's `grep -rni 'lattice' … .claude` sweep
      returns this line and admits no exemption for it. Verified by
      `grep -rn 'components/board' .claude/` returning nothing **and**
      `grep -rn 'components/space/webgl' .claude/` returning the repointed
      predicate and comment
- [ ] 8.11 `test_check_determinism_lists.py`: rewrite the docstring's "STATE OF
      THE TREE" paragraph (site 13), which enumerates the current list contents
      including `board` and `polar`. Then run it standalone and confirm it
      passes: `python3 .claude/skills/code-quality-checks/test_check_determinism_lists.py`
- [ ] 8.12 Prove the de-enrolment did not silently disable a check: run
      `python3 .claude/skills/code-quality-checks/check.py --backend-tests` and
      confirm the determinism cross-target matrix **still runs** and still names
      `./space/ ./system/ ./galaxy/`, rather than silently skipping
- [ ] 8.13 `infra/docker/test-runner.Dockerfile:5` (site 30): the comment
      justifying `qemu-user-static` says the arm64 leg "runs the `GOARCH=arm64`
      **board** fixture suite under `qemu-aarch64-static`". Keep the install —
      the leg survives for `./space/ ./system/` — and repoint the prose at the
      packages the leg actually runs
- [ ] 8.14 `check.py:250` (site 31): `check_transcendental`'s docstring cites
      "the TS **board-math** mirror". Repoint it at `frontend/lib/market`
      (C9 ruling — the same repoint task 8.5 makes to the predicate itself,
      so this docstring describes a seam that actually exists rather than
      one 8.5 has just deleted). This is a third, separate docstring from
      sites 8 and 10
- [ ] 8.15 `fixtures/system/mirror-map.json` (site 32): **re-derive the whole
      `coverage` array against the post-change Go surface, rather than
      deleting only the two named entries** (C8) — `orbitFor` (line 63) is a
      third entry that must be removed, not repointed, because 2.4 deletes
      the function outright (it returned `system.Orbit`, the type task 2.1
      deletes) rather than merely dropping its lattice parameter; a
      `note: "indirect: called by orbitFeature, beltFeature, and
      hazardFeature"` pointing at a function that no longer exists is the
      same silently-inert species as the two entries already named. Delete
      the `generateWithStreams` (line 60), `clampRing` (line 71), and
      `orbitFor` (line 63) coverage entries and the `generateWithStreams` /
      `TestInteriorElementsSweep_MatchesLatticeIdentitySweep` mentions inside
      the `newRand` and `Generate` notes (lines 58-59); repoint the
      `orbitFeature` / `beltFeature` / `hazardFeature` notes off lattice
      placement (they survive, since 2.4 keeps those three functions, only
      re-sourcing what they call). **Nothing will fail if you skip this:**
      this map runs in `anti_mirror` mode, which reads only `.sharedNames`
      (`[]`) and never inspects `.coverage`, so a stale entry naming a
      deleted symbol passes forever. That is exactly the silently-inert
      record Goal 2 forbids, so it must be repaired by hand and verified by
      `grep -n 'clampRing\|generateWithStreams\|Lattice\|"orbitFor"' fixtures/system/mirror-map.json`
      returning nothing
## 9. Defect docs, project docs, and the numbered spec series

- [ ] 9.1 `docs/defects/2026-08-26-station-on-gate-ring.md`: flip
      `**Status:** open` to `**Status:** dissolved (delete-the-lattice)` and add
      a short note that the derivation and the gate ring both ceased to exist,
      so the defect was not repaired (design.md Decision 7). Confirm it carries
      no `fixtures/determinism-register.json` entry to remove — it does not
- [ ] 9.2 `docs/defects/2026-08-25-lanegate-near-tie-divergence.md`: same
      treatment — the Go↔TS pair it names is deleted, so there is no seam left
      to diverge across
- [ ] 9.3 In the same edit to 9.2, record the successor question rather than
      declaring victory: `system.gateOrbit` does the same discretized-argmax job
      through `space.PhaseIndexOf`, on the **Go build-target** axis rather than
      the language seam. Confirm `fixtures/system/cases.json`'s `gateOrbitSweep`
      exercises near-tie bearings; if it does not, file that as a new open
      defect rather than closing the old one silently. **Predicted outcome:
      it does not, and a new defect must be filed** (C13) —
      `gateOrbitSweep` draws two independent `galaxy.Coords` uniformly from
      `[-2000, 2000]³` boxes, so the probability any drawn bearing lands
      within one ULP of an exact tie between adjacent sub-turn phase indices
      is effectively zero; the `gateOrbit` **hand** family's own tie case
      ("an exact tie ... resolves to the documented lower index") is an
      **exact** tie, deterministic on both build targets by construction, not
      the near-tie this successor question asks about. So
      `space.PhaseIndexOf`'s cross-build-target near-tie behaviour is not
      covered today, and `cross-stack-determinism`'s "Authority does not
      cover a same-side cross-target disagreement" applies — expect this task
      to end in a new `docs/defects/` entry and a deviation-register line,
      not a closure
      (`cross-stack-determinism`: *Inexact Arithmetic Is Rule-Bearing Only
      Through a Discretized, Tie-Broken Choice* › "Authority does not cover a
      same-side cross-target disagreement")
- [ ] 9.4 Record — do not decide — the state of `docs/specs/0004-movement-board.md`
      and `docs/specs/0007-hex-board-view.md` (design.md OQ-4). Confirm
      `cd frontend && npx vitest run lib/spec-scenarios.test.ts` stays green
      after every deletion: `0004`'s S1/S2 are cited by `backend/fleet` tests
      that survive, and `0007` declares no `### S` scenarios, so nothing should
      break — but this is an enforced spec↔test seam nobody has catalogued in
      this chain, and it must be checked rather than assumed
- [ ] 9.5 Update the root `CLAUDE.md`'s **Domain quick-reference**: the
      `board/` bullet describes a package that no longer exists, and the
      `system/`, `fleet/` and `stations/` bullets cite lattice concepts. Replace
      the `board/` bullet rather than deleting it silently, so a reader learns
      the lattice was removed rather than that it was never there
- [ ] 9.6 Update `docs/plans/continous_space/chain.md`'s link 9 row and section
      to reflect what this change actually turned out to be (a ten-capability
      change with a generator-output consequence, not the four-line deletion the
      original entry predicted)

## 10. Whole-tree sweep

- [ ] 10.1 Whole-tree sweep. Run this pipeline **exactly as written** — it is
      byte-identical to `link9-acceptance-greps.sh`'s 10.1 leg, and r7's
      addendum ruling E requires harness and task to agree character for
      character. Do not re-derive it, re-order the filters, or tidy them:

      ```
      grep -I -rn 'backend/board\|backend/polar\|frontend/lib/board\|frontend/lib/polar\|fixtures/board\|fixtures/polar\|board-tactical-math\|polar-lattice-math' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.next-e2e \
        | grep -v '^./openspec/changes/archive/' | grep -v '^./docs/plans/' \
        | grep -v '^./docs/handoffs/' | grep -v '^./docs/defects/' | grep -v '^./docs/specs/' \
        | grep -v '^./openspec/changes/delete-the-lattice/' \
        | grep -v 'commit_params_validator_continuous_test.go'
      ```

      The remainder SHALL be **empty**. Every filter above carries its reason,
      so that a later reader can neither mistake one for unexplained slack nor
      "restore" one the orchestrator deliberately struck:
      - `^./openspec/changes/archive/`, `^./docs/plans/`, `^./docs/handoffs/`,
        `^./docs/defects/`, `^./docs/specs/` — historical record, which stays
        (`docs/specs/` being the superseded numbered specs this change records
        rather than rewrites, per OQ-4/task 9.4).
      - `--exclude-dir=.next --exclude-dir=.next-e2e` — gitignored Next.js build
        output is not source; no source edit can ever clear a compiled bundle
        (59 hits between this leg and 10.2's) (ruling D).
      - `^./openspec/changes/delete-the-lattice/` — a **PATH** exclusion of this
        change's own folder, which cannot describe a deletion without naming the
        deleted paths (ruling C). **Pre-archive only**: it is dead once
        `openspec archive` moves the folder under the already-allow-listed
        `openspec/changes/archive/`. It replaced a `grep -v 'delete-the-lattice'`
        *content* filter whose 79-line reach was invisible; measured identical at
        file granularity, so this is a strict narrowing.
      - `commit_params_validator_continuous_test.go` — this change's own RED
        file, whose prose says `backend/board` is deleted by this change; it goes
        with that file's GREEN rewrite, not before.
      - **Not a filter — a sequencing exception, recorded so it is not mistaken for
        residue.** Run at this point in the sequence this leg also returns the change's
        own not-yet-archived spec surface under `openspec/specs/`
        (`cross-stack-determinism`, `board-tactical-math`, `space-kinematics`,
        `system-interior`, `trading-station` — 24 hits at authoring time). Every one is
        cleared by `openspec archive` plus tasks 13.1–13.3, exactly as task 7.1 records
        for the same two files. They are expected here and are **not** residue; the
        remainder outside `openspec/specs/` SHALL be empty. Do not add a filter for them
        — confirm by inspection that every `openspec/specs/` hit is a line one of this
        change's deltas or tasks 13.1–13.2 removes, and re-confirm at task 13.4.

      **Deliberately ABSENT from this leg — do not re-add** (ruling B): no
      blanket `delete-the-lattice` *content* filter; no `sub-lattice` filter
      (0 lines here — 10.1 matches paths, and a line naming a deleted path is
      residue whatever else it says); no
      `TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` filter
      (0 lines here). **Do not widen** beyond the filters printed above.
- [ ] 10.1b Run a **second, bare-token** sweep, because the enforcement lists
      do not spell the packages as paths and 10.1's path patterns miss all of
      them: `check.py`'s `DETERMINISM_GO_PACKAGES = ("board", "polar", …)`,
      `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES=(board polar …)`,
      and the `go test ./board/ ./polar/ …` command strings in both `check.py`
      and `.gitlab-ci.yml` are the exact sites section 8 de-enrols, and 10.1
      cannot confirm any of them. Run
      `grep -rnE '"board"|"polar"|\(board |[( ]polar[) ]|\./board/|\./polar/' .claude .gitlab-ci.yml infra`
      and require it to return nothing. **This pattern itself misses two of
      the sites section 8 de-enrols (C15) — do not trust a clean run of it as
      proof those two are gone; verify them by reading the file instead:**
      `.gitlab-ci.yml:371`'s `(cd board && "$QEMU" ...)` matches none of
      `"board"`, `(board `, or `./board/` (task 8.2's job), and
      `infra/docker/test-runner.Dockerfile:5`'s bare, unquoted, unparenthesized
      word `board` in prose (task 8.13's job) matches none of the pattern's
      alternatives either. Without this leg the section-8 tasks are
      self-attested; with it, these two sites still are, and must be checked
      by hand
- [ ] 10.1c Sweep for SYMBOL citations of the deleted packages, which 10.1's
      path patterns and 10.1b's `.claude` scope both miss:
      `grep -rnE '\b(board|polar)\.[A-Za-z]' backend --include='*.go'` and
      `grep -rnE '\b(board|polar)\.[A-Za-z]' frontend --include='*.ts' --include='*.tsx' | grep -v node_modules`.
      Hits naming the **market price board** are the price board, not the
      lattice, and stay: `backend/market`'s `board.Venues` /
      `board.RefreshCadenceMs` (today only in
      `market/board_integration_test.go`, eight hits) and the frontend's
      `board.venues` on the price-board DTO
      (`frontend/components/market/MarketBoardPanel.tsx:213,218`). So do the
      incidental matches where `board.` is a filename rather than a package
      qualifier — `docs/plans/hex-board.md` (`app/spike/hex-board/mock-system.ts:3,6`)
      and `lib/types/system-board.ts` (`lib/types/system-space.ts:12`).
      Every other hit names a symbol of a package that no longer exists:
      rewrite it — including
      `frontend/app/spike/hex-board/mock-system.ts:235` ("mirrors
      board.GateRing"), which task 6.3b's space-3d comment sweep does not
      reach.

      One further hit is predecessor debris rather than a lattice symbol:
      `frontend/components/galaxy/GalaxyView.test.tsx:504` cites
      `board.laneGates` on the `SystemBoardDTO` that
      `build-production-space-view` already deleted, inside a comment block
      (`:498-512`) that also names the deleted `SystemBoardView` and its
      test file. No other sweep reaches it — 6.3's `systemBoard` pattern is
      case-sensitive and misses `SystemBoardView`. Rewrite the block to name
      `SystemSpaceView` and its live data source. Confirmed sites at
      authoring:
      `backend/action/params_validator.go:7,15` (production),
      `backend/space/{params.go:41,burn.go:11,helpers_test.go:79,params_test.go:28,63}`
      (a package no other task touches), `backend/fleet/resolver.go:26`,
      `backend/fleet/model.go:162`.
- [ ] 10.2 Case-insensitive `lattice` sweep. Run this pipeline **exactly as
      written** — it is byte-identical to `link9-acceptance-greps.sh`'s 10.2
      leg, and r7's addendum ruling E requires harness and task to agree
      character for character. Do not re-derive it, re-order the filters, or
      tidy them:

      ```
      grep -I -rni 'lattice' backend frontend .claude fixtures --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-e2e \
        | grep -v 'TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse' \
        | grep -v 'sub-lattice' \
        | grep -Ev 'RED-phase .*delete-the-lattice'
      ```

      The remainder SHALL be **empty**. The word's one deliberate survivor in
      the tree is the wire-contract guard `build-production-space-view` added
      (`system-interior`: "Lattice-only fields are absent from the response")
      and its implementing test function — not the rest of
      `interior_wire_lattice_removal_test.go`, whose sibling function task 3.4
      deletes (design.md Decision 6). Anything else is a leftover. **The pattern
      is deliberately unanchored**: `\blattice\b` misses the two shapes that
      matter most, because both GNU and BSD `grep` treat `_` as a word
      character and `\b` does not fire inside CamelCase — so
      `backend/system/lattice_identity_test.go` (a whole file) and
      `MatchesLatticeIdentitySweep` (cited from three files) both survive a
      word-bounded sweep. If `frontend/app/spike/space-3d/` survives OQ-5, its
      three anti-lattice comments are handled by task 6.3b — rewritten there,
      not exempted here.

      Every filter above carries its reason, so that a later reader can neither
      mistake one for unexplained slack nor "restore" one the orchestrator
      deliberately struck:
      - `--exclude-dir=.next --exclude-dir=.next-e2e` — gitignored Next.js build
        output is not source; no source edit can ever clear a compiled bundle
        (59 hits between this leg and 10.1's) (ruling D).
      - `TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` — the one
        deliberate wire-contract guard, this sweep's single expected survivor.
      - `sub-lattice` — load-bearing mathematics in
        `backend/system/phase_reachability_test.go`: task 2.11's replacement
        coverage asserts the continuous phase draw is not confined to a coarse
        sub-lattice **of the turn** — a lattice of real numbers, not the deleted
        board. Renaming it would make the test's own failure message lie.
      - `-Ev 'RED-phase .*delete-the-lattice'` — the red-manifest **header form**
        only: the change id contains the swept word, so every RED file fails this
        sweep by obeying the convention. It covers all four RED headers and
        matches nothing else in the tree.

      **Deliberately ABSENT from this leg — do not re-add** (ruling B): no
      blanket `delete-the-lattice` *content* filter. It would hide six prose
      lines in **tracked** files — `backend/system/{fog.go:22, model.go:130,
      interior_wire_lattice_removal_test.go:209,
      generator_continuous_test.go:327,339,383}` — which sit on code this change
      deletes and therefore MUST stay under the gate to prove they vanished.
      Nor a `commit_params_validator_continuous_test.go` filter: after the
      SDET's comment rewording that file's only surviving `lattice` hit is its
      RED header, already covered above, so the filter removes 0 lines. **Do not
      widen** beyond the filters printed above.

      **Three of those six lines are SDET work, not developer work** (ruling G):
      `generator_continuous_test.go:327,339,383` sit inside a manifest-recorded
      RED file, and clearing them is a pre-authorized comment-only SDET pass —
      the operative halt-and-report clause for developers is recorded at task
      2.10, where the developer whose file list contains that file will read it
      before acting.
      **C12 — the hit list, derived mechanically, not enumerated by hand.**
      Running the sweep now (excluding `backend/board`, `backend/polar`,
      `frontend/lib/board`, `frontend/lib/polar`, deleted outright by
      sections 5–6, and the 21 files task 2.10's own grep already owns)
      returns the files below. **No new exemptions beyond the one
      wire-contract guard named above** — every one of these gets a
      one-word disposition, `rewrite` (drop the word, keep the behaviour;
      these are all comments or test-only prose, never a code-behaviour
      change) unless marked `delete` or `covered` (already fully handled by
      a named task; re-run this sweep against it rather than re-doing that
      task's work):

      Backend — `rewrite` unless noted:
      `backend/disclosure/purity_test.go`, `backend/disclosure/world.go`,
      `backend/disclosure_wiring_e2e_test.go`, `backend/fleet/dao_test.go`,
      `backend/fleet/handler.go`, `backend/fleet/integration_test.go`,
      `backend/fleet/jump_deletion_test.go`,
      `backend/fleet/list_stale_arrival_integration_test.go`,
      `backend/fleet/routing_deletion_test.go`,
      `backend/fleet/service_test.go`,
      `backend/fleet/stale_arrival_integration_test.go`,
      `backend/fleet/star_destination_identity_absent_test.go`,
      `backend/galaxy/model.go`, `backend/space/turn_test.go`,
      `backend/interior_continuous_wire_e2e_test.go`,
      `backend/interior_gate_body_id_e2e_test.go`,
      `backend/orbit_elements_wire_e2e_test.go`,
      `backend/system/bodies.go`,
      `backend/system/orbit_elements_and_extent_wire_test.go`;
      `backend/fleet/lattice_symbols_absent_test.go` — **delete** (task 3.4);
      `backend/system/gates.go` — **covered** (task 2.7 deletes `LaneGate.Cell`;
      four surviving comments at `:14,23,62,141` still need the word dropped,
      confirm they land in the same commit); `backend/system/continuous.go` —
      **covered** (this is where `continuousStarParented` actually lives:
      its `r2 == nil` early return is task 2.6's target and its
      `f.Orbit.Dir < 0` read is task 2.5's; the surrounding doc comments
      — `:25-28,75-77,238,243-249` — must be rewritten in the same commit,
      not left as a second pass); `backend/system/station_continuous.go` —
      **covered** (task 3.1); `backend/system/gates_deletion_test.go` —
      **covered** (task 2.9 handles its `BoardFog` symbol; the separate
      `lattice`-word comment at `:12` still needs the word dropped in the
      same commit).

      **C12 addendum (MAJOR-4 — the mechanical derivation was short by 13
      files):** `backend/common/tuning_test.go` (`:39,74`) and
      `frontend/components/fleet/FleetRoster.test.tsx` (`:131`) —
      **rewrite**; neither is reached by any other task's line citations.
      `backend/system/fog.go` — **covered** (task 2.9; surviving comments at
      `:16,19,22,23,55` still need the word dropped in the same commit);
      `backend/system/generator.go` — **covered** (task 2.4; `:44,46,47,71,72,
      120,121,124`); `backend/system/handler.go` — **covered** (task 2.7;
      `:165,167,170`); `backend/system/model.go` — **covered** (tasks 2.1/2.1b;
      `:126,130,198`); `backend/system/service.go` — **rewrite** (`:227`, named
      by no other task). Already-covered-but-unlisted, named here so a
      re-run of this sweep is not mistaken for new work:
      `frontend/lib/types/action.ts:5` (task 6.3),
      `fixtures/system/mirror-map.json:59,60,71` (task 8.15),
      `.claude/scripts/check-mirror-map.sh:9-10` (task 8.9, design site 17),
      `.claude/skills/code-quality-checks/check.py:1084` (task 8.6, design
      site 8), `backend/fleet/resolver_test.go:22` (adjacent to the `:23`
      citation task 4.2 already owns), and the `stations`/`mine`/`market`
      copies of `lattice_symbols_absent_test.go` plus
      `stations/{orbit_guard,no_lattice_dock_predicate}_test.go` and
      `stations/placement.go` (tasks 3.1/3.4). `.claude/scripts/check-frontend-tests.sh`
      — **covered** (task 8.10's `:114` `createLattice` rewrite; MAJOR-3).

      Frontend — `rewrite`:
      `frontend/components/space/space-camera.ts`,
      `frontend/components/space/space-camera.test.ts`,
      `frontend/e2e/helpers/space-view.ts`,
      `frontend/e2e/tests/jump-commit.spec.ts`,
      `frontend/e2e/tests/new-user.spec.ts`,
      `frontend/e2e/tests/refuel-commit.spec.ts`,
      `frontend/e2e/tests/slice.spec.ts`,
      `frontend/e2e/tests/space-journey.spec.ts`,
      `frontend/hooks/use-system-space.ts:12`,
      `frontend/lib/services/system-service.ts`,
      `frontend/lib/services/system-service.test.ts`,
      `frontend/lib/types/system-space.ts:8`,
      `frontend/components/space/SystemSpaceView.tsx:28` (the "THE STATION'S
      LATTICE `orbit` IS NEVER READ HERE" comment — task 1.1 already flags
      this file's neighbouring line 29 as a prose hit task 6.3 rewrites; this
      is the same comment block, drop the word in the same pass);
      `frontend/components/galaxy/GalaxyView.test.tsx:442,457` — **two
      further hits distinct from the `:504` `board.laneGates` citation
      task 10.1c and the round-4 minor already repoint**: SDET commentary
      reading "the lattice board is deleted by section 10" — accurate, but
      the word still has to go, since Goal 1 forbids the word describing a
      representation the game no longer has, true statement or not.

      `fixtures/system/cases.json` — **covered** (task 2.10c's re-record
      drops the `latticeProjection`/`latticeDrawCount` components that
      account for essentially all ~242 hits; re-run this sweep against the
      re-recorded file rather than assuming it, since a residual key name or
      `note` string in the surviving `continuousLine` component would not be
      caught by 2.10c's own byte-identity check, which only proves the two
      architectures agree with each other, not that the word is gone).
- [ ] 10.3 Confirm the three wording-only deltas landed and have no code to
      change, so they are not mistaken later for unimplemented work:
      `session-wakeup` (*Successful Spawn Hands Off to the Home Board*),
      `galaxy-generation` (*Per-System Body Skeleton*), and `mine-extraction`
      (*Ledger Key Is System-And-Kind-Qualified, Channel Scope Is Per-System*).
      Each names a route or an example that the code already satisfies; verify
      that by grep rather than by assumption
- [ ] 10.3b `world-clock`'s *Scaled World Time* is **not** wording-only and
      must not be checked off as such. Beyond dropping `board` and
      `observation` (both deleted packages), the delta **widens** the
      forbidden-`time.Now()` enumeration by adding `space`, `disclosure` and
      `charts` — three packages links 2–8 created after the requirement was
      last written — and renames the example stamp from "an observation's
      `asOf`" to "a sighting's `asOf`". The widening is declared in the
      proposal; verify it holds rather than asserting it:
      `grep -rn 'time\.Now()' backend/space backend/disclosure backend/charts
      --include='*.go' | grep -v _test.go` SHALL return only the doc-comment
      mention at `space/vec.go:10` and no call site. A hit that is a real call
      means the widened requirement ships already violated
- [ ] 10.3c Confirm the two extra `trading-station` `MODIFIED` blocks landed
      and are wording-only: *A Station's Continuous Orbit Is Derived, Never
      Rolled* drops "never read from a lattice `Dir` (the station carries
      none)" — a clause that becomes unfalsifiable once `Orbit.Dir` no longer
      exists — and *Station Id Is the Home System's Id; Feature Id Is
      System-Scoped and Separate* drops "board" from "the station's board
      **feature id**" in the requirement body and its second scenario. Neither
      changes behaviour; both are surviving requirements no other task reached,
      and both would otherwise leave lattice vocabulary in a live spec after a
      change whose Goal 1 forbids it. The scenario heading *The board read
      serves the station regardless of tier* (in *Home Station Visible On the
      Direct Station Read*) is **deliberately unchanged** even though "board"
      there means the system-interior read: a `MODIFIED` block must reproduce
      every live scenario heading character-for-character or the archiver
      refuses, and there is no scenario-level `RENAMED` mechanism. It joins
      Decision 1's three residual lattice-vocabulary titles as recorded, not
      forgotten. Two further residual uses of "board feature id" survive in
      `docked-fleet-actions`'s *Sell Offer on the Docked Fleet* (`:155`) and
      *Refuel Offer on the Docked Fleet* (`:316`); like the *board read
      serves the station* scenario heading they are recorded here as
      accepted vocabulary residue, not forgotten
- [ ] 10.4 `python3 .claude/skills/code-quality-checks/check.py` fully green

## 11. Validation

- [ ] 11.1 `openspec validate delete-the-lattice --strict` green, and
      `python3 .claude/scripts/openspec-reconcile.py delete-the-lattice` exits 0
- [ ] 11.2 **The re-expression audit** (`handoffs/README.md`, *Lesson four*).
      For each of the six `REMOVED` + `ADDED` pairs in design.md Decision 2's
      table, diff the ADDED requirement's body and scenario list mechanically
      against its live original in `openspec/specs/`, and account for every
      clause and every scenario title that is absent — restored, merged,
      redistributed, or deliberately dropped with a stated reason. The
      archiver's scenario check does **not** see a re-ADD under a new name, and
      neither does `openspec-reconcile.py`; this audit is the only thing
      standing in for both. **Re-run it whenever any ADDED requirement is
      edited**
- [ ] 11.3 Do the same, in the same run, for the five pure `REMOVED`
      requirements (three in `system-interior`, two in `trading-station`): for
      each, confirm against the live tree that the successor named in its
      `**Reason**` actually exists and actually carries the obligation claimed.
      A REMOVED whose stated successor does not exist is a silent loss with a
      paper trail, which is worse than one without
- [ ] 11.4 Confirm every `MODIFIED` block reproduces every scenario the spec
      will have once every predecessor still ahead of this change in the
      archive order has landed, not only the live one. `build-production-
      space-view` archived at `7a2e837` before this task was last revised:
      `cross-stack-determinism` › *Shared Board Math Is Pinned By a
      Cross-Language Golden Fixture* is already live with all fourteen
      scenarios that predecessor left behind, and
      `openspec-reconcile.py delete-the-lattice` exits 0 against the current
      tree. `add-scan-and-sightings-surface` was the last predecessor and
      archived at `3088748`; its deltas are confirmed non-overlapping: it
      MODIFIES `action-dispatch`'s *Exactly-Once Resolution* and *Inbox by
      Actor Query Param*, while link 9's own `action-dispatch` delta MODIFIES
      only *Commit Rejects Non-Primitive Action Parameters*, and its
      `system-space-view` delta is `## ADDED Requirements` only — it does not
      touch the *System Space View Route and Data Fan-In* requirement link 9's
      own `system-space-view` delta MODIFIES (task B1 /
      `specs/system-space-view/spec.md`). No
      cross-change scenario drift exists to guard here; this task's job going
      forward is to re-run `openspec-reconcile.py` and re-check that
      predecessor's deltas if either side changes before archive. **Also
      confirm** (C11) the new `system-interior` › *Interior Read Serves
      Continuous Bodies* `MODIFIED` block reproduces all ten of that live
      requirement's scenario headings byte-identically, dropping only the
      body's "Their removal is what allows `backend/board` and
      `backend/polar` to be deleted" sentence and nothing else — this
      requirement is `build-production-space-view`'s, deliberately
      unmodified by this change everywhere else per the proposal's
      "Deliberately untouched" list, so this is the one place the sweep must
      be exact rather than assumed
- [ ] 11.5 `cd backend && go test ./... -p 1`, `cd frontend && npx vitest run`,
      `cd frontend && npm run e2e`, and
      `bash .claude/scripts/check.sh --backend --frontend --lint --test` all
      green

## 12. Archive rehearsal — before the real archive

`openspec validate --strict` reports this change valid whether or not the
retirement in section 13 happens. The archiver is the gate, and it is the
archiver that must be rehearsed.

- [ ] 12.1 Copy `openspec/` to a scratch directory. **All four predecessors
      still ahead of this change at authoring time —
      `add-stationkeep-hold-verb`, `serve-orbital-elements-and-burn-preview`,
      `build-production-space-view`, `add-scan-and-sightings-surface`
      (`add-fuel-as-cargo` archived earlier; task 1.2 lists all five) — are
      already archived as of `3088748`, and `build-production-space-view`'s
      post-archive hand-steps (its tasks 13.1–13.5, including the `board-view`
      directory deletion) are already applied**, so the live tree is the tree
      this change will meet and the copy needs no pre-archiving. Confirm that
      before rehearsing, by task 1.2's listing and task 1.3's `board-view`
      grep; if either fails, archive whatever is outstanding **in the copy**,
      in the order above, before running 12.2. Rehearsing against an
      unarchived tree rehearses a shape that never ships.
- [ ] 12.2 In that copy, run `openspec archive delete-the-lattice --yes` and
      confirm it succeeds even though `board-tactical-math` has no delta
      directory
- [ ] 12.3 In that copy, confirm the rebuilt specs are what the deltas said:
      `openspec/specs/system-interior/spec.md` carries *Interior Generation Is
      Lazy and Deterministic* and **no** *Lazy, Deterministic Interior
      Generation*, and no longer contains the strings "slot count", "clampRing",
      or "lattice `Dir`"; `openspec/specs/trading-station/spec.md` carries
      *Station Is a Dockable, Non-Mineable Body* and no *Board Feature*
      requirement; `openspec/specs/cross-stack-determinism/spec.md` carries
      *Rule-Bearing Square Roots Are Pinned By a Recorded Fixture Family* and no
      *Square Roots In Rules Are Pinned, Not Assumed*
- [ ] 12.4 In that copy, delete `openspec/specs/board-tactical-math/` and then
      `grep -rn 'board-tactical-math' openspec/specs/`. There SHALL be no
      remaining citation. `--strict` does not catch a dangling cross-reference
      to a retired capability, so this grep is the only guard
- [ ] 12.5 Build the **retired-requirement-title list** once, into a file, so
      both legs of the sweep below run against the same list: every one of
      `board-tactical-math`'s 22 requirement titles, plus every requirement
      title this change retires in `system-interior`, `trading-station` and
      `cross-stack-determinism` (the six `REMOVED`+`ADDED` originals and the
      five pure `REMOVED`). Write them one per line to
      `/tmp/retired-titles.txt`
- [ ] 12.5a **Leg one — in the scratch copy**, `grep -F -f /tmp/retired-titles.txt
      -rn openspec/specs/`. Each hit is a citation of a requirement that no
      longer exists and must be repointed or removed. (Authoring found two such
      citations up front — `trading-station`'s *Station-Store Read Failure
      Degrades* and `cross-stack-determinism`'s *Rule-Bearing Values Cross the
      Seam*, both already repaired by this change's deltas — so this leg's job
      is to catch the ones the predecessors introduce)
- [ ] 12.5b **Leg two — against the whole real repo**, because requirement
      titles are cited far outside `openspec/specs/`:
      `grep -F -f /tmp/retired-titles.txt -rn . --exclude-dir=node_modules
      --exclude-dir=.git --exclude-dir=archive --exclude-dir=handoffs
      --exclude-dir=plans`. Scoping this sweep to `openspec/specs/` alone
      misses every code comment, register legend and test-file header that
      names a retired requirement — and those are the citations nothing else
      surfaces, because the files still compile and still pass. **Six are
      already confirmed and must be repaired by name:**
      - `fixtures/determinism-register.json:24` — the `sqrt-pinning` legend
        names *Square Roots In Rules Are Pinned, Not Assumed*, which this
        change REMOVES (repointed by task 7.7)
      - `backend/system/generator_continuous_test.go:8-9` — cites *Interiors
        Emit Continuous Orbital Elements For Every Body* and *A Retrograde
        Orbit Is Expressed By Inclination, Never By a Non-Positive Period*
      - `backend/system/continuous_test.go:114` — cites *Orbital Radii Ascend
        With the Skeleton Ordinal...*
      - `backend/system/generate_streams_test.go:5-6` — cites *Lattice
        Placement Is Independent Of The Continuous Stream*
      - `backend/system/generator.go:47` — the same citation, in production
        code
      - `backend/stations/no_lattice_dock_predicate_test.go:3` — cites
        *trading-station*'s "Docking to the station involves no lattice
        predicate", a scenario this change retires. This file is now named by
        task 3.4 (deleted under Decision 6); this leg confirms the deletion
        actually landed rather than leaving a dangling citation this sweep
        would otherwise be the only thing to catch

## 13. Post-archive manual steps

None of these is reachable by a delta: each is a directory removal or prose
outside a `### Requirement:` block. The `## Purpose` edits run **before** the
directory deletion and its grep, so that grep runs against a tree from which
every stale citation has already been removed.

- [ ] 13.1 Hand-edit `openspec/specs/space-kinematics/spec.md`'s `## Purpose`:
      remove the sentences that name `board-tactical-math`, `backend/board`,
      `backend/polar`, `frontend/lib/board` and `frontend/lib/polar` as "the
      lattice every shipped consumer" and as future deletion material.
      `build-production-space-view` task 13.1 edits one **other** sentence in
      the same Purpose (the `board-view` move preview) and does not reach
      these; it deliberately leaves the `space-3d` carve-out sentence alone,
      since that spike is no longer deleted. **Do not delete the spike
      carve-out sentence here either** — *Every Rule-Bearing Value of This
      Capability Is Computed Only in the Authoritative Implementation* requires
      the exemption to be stated in the Purpose alongside a named path, and
      after task 6.3b that named path still exists. If OQ-5 is ruled "delete
      `space-3d`", the sentence must be repointed at a surviving spike, never
      simply dropped
- [ ] 13.2 Hand-edit `openspec/specs/system-interior/spec.md`'s `## Purpose` and
      its `## Notes for future maintainers` section, both of which describe a
      polar board;
      `openspec/specs/trading-station/spec.md`'s `## Purpose`, which describes
      the station as a board feature on a ring; and
      `openspec/specs/cross-stack-determinism/spec.md`'s `## Purpose`, which
      names the board pair as the capability's subject
- [ ] 13.3 After `openspec archive delete-the-lattice --yes` succeeds and
      13.1–13.2 are done, **delete `openspec/specs/board-tactical-math/` by
      hand** — a capability cannot be retired through `REMOVED` deltas
      (`polar-lattice-math`, `observation-fog-and-scan` and `board-view` are the
      confirmed precedents). Then re-run 12.4's and 12.5's greps against the
      real tree
- [ ] 13.4 Confirm `openspec list --specs` no longer lists
      `board-tactical-math`, and `openspec validate --strict` passes for every
      remaining spec

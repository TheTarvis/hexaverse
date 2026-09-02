## 1. Preconditions — verified first, never assumed

Nothing in sections 2–13 may start until every task here passes. If 1.1 or 1.3
is dirty, **stop**: the predecessor is not complete, and the fix belongs there
(proposal's *Precondition*).

- [ ] 1.1 Re-run `build-production-space-view` task 10.11's grep against the
      real tree, not its checkbox: `grep -rn "@/lib/board\|@/lib/polar" frontend
      --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v
      '^frontend/lib/board/' | grep -v '^frontend/lib/polar/'`. It SHALL return
      nothing. Record the output (including "no matches") in the commit message
      — the grep is the evidence, and an unrecorded grep is an assumption
- [ ] 1.2 Confirm all four predecessors are archived, in order, by listing
      `openspec/changes/archive/` for `add-fuel-as-cargo`,
      `add-stationkeep-hold-verb`, `serve-orbital-elements-and-burn-preview`,
      `build-production-space-view`, `add-scan-and-sightings-surface`, and
      confirm `openspec/changes/` contains no directory but `archive/` and this
      one
- [ ] 1.3 Confirm `openspec/specs/board-view/` does **not** exist (retired by
      `build-production-space-view` task 13.5) and that
      `grep -rn "board-view" openspec/specs/` returns nothing. A surviving
      `board-view` citation means that change's own dangling-reference sweep did
      not complete
- [ ] 1.4 Record the backend precondition as a baseline rather than a
      requirement: `cd backend && grep -rln '"hexaverse/board"\|"hexaverse/polar"'
      --include='*.go' .` SHALL list exactly the files sections 2–5 remove.
      Anything on that list not named in those sections is an unplanned importer
      and must be reported before proceeding
- [ ] 1.5 Confirm the suite is green *before* any deletion, so a later failure
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
      `Angle0` slot draw. The non-skeleton star-parented feature's orbital
      index stays an integer draw in `[1, params.Radius]` with no board meaning
      (`system-interior`: *Continuous Orbital Radii Ascend With the Skeleton
      Ordinal and Are Separated*)
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
- [ ] 2.7 Remove `LaneGate.Cell` and `LaneGates`' `radius` parameter; the gate's
      position comes from the body table via `fillGateGeometry` alone. Update
      the one production caller, `fleet/fuel.go`'s `gs.LaneGates(ctx, systemID,
      s.params.BoardRadius)` (`system-interior`: MODIFIED *Lane Gate
      Projection*)
- [ ] 2.8 Delete `system/fog_source.go`'s `occlusionRadius2` and its
      `board.StarOcclusionRadius2`/`board.PlanetOcclusionRadius2` constants.
      Verified before deleting by `grep -rn 'occlusionRadius2' backend/ | grep -v
      _test.go` returning nothing — this is the ninth "built, unit-tested, never
      called" instance the chain has found, and it is pure deletion material,
      not a repair
- [ ] 2.9 Delete `system/fog.go`'s `fogFeatureDTO` lattice fields if
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
- [ ] 2.11 Add the test the removed slot-coverage scenario leaves behind:
      generate interiors across many seeds, collect every feature's continuous
      phase, and assert **both** legs (`system-interior`: *Interior Generation
      Is Lazy and Deterministic* › "Generated phases span the whole turn"):
      (a) the collected phases occupy every quadrant of `[0, SubTurn)`; and
      (b) `gcd` of the collected phases is `1`. Leg (b) is not optional
      decoration. `SubTurn` is `1<<20 = 1048576`, so leg (a) alone is four
      buckets over a million values: a generator drawing
      `phase = wrapSubTurnFraction(float64(r.Intn(16))/16)` passes it while
      leaving 99.999% of phases unreachable — the continuous restatement of
      exactly the defect the retired every-slot-is-reached scenario caught.
      Today's generator is fine; it is the **spec** that would permit the
      regression. Without this task, deleting the slot-coverage scenario
      removes reachability coverage instead of relocating it
- [ ] 2.12 `cd backend && go test ./system/ -short -count=1` green

## 3. Backend — remove the lattice tier from `backend/stations`

- [ ] 3.1 Delete `stations.DeriveOrbit` and its `mix64` helper if nothing else
      uses it, and every `board` import from `stations/placement.go`. Verified
      by `grep -rn 'DeriveOrbit' backend/` returning nothing
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
- [ ] 3.3 Delete `stations.Service`'s `gateRing: common.Tuning().BoardRadius`
      fields and the `system.PeriodFor(orbit.Ring)` refill
- [ ] 3.4 Delete `backend/stations/lattice_symbols_absent_test.go`,
      `backend/mine/lattice_symbols_absent_test.go`, and
      `backend/market/lattice_symbols_absent_test.go` (design.md Decision 6: a
      guard asserting a package is not imported is subsumed by the package not
      existing, and can never fail again). Delete
      `stations/orbit_guard_test.go` and the lattice half of
      `stations/placement_test.go`
- [ ] 3.5 Add the positive test the removed lattice guard leaves behind: a
      fleet parked at a position coincident with the station's live continuous
      position, with no matching `attachedTo`, is not docked and every
      dock-gated verb rejects it (`trading-station`: *Station Is a Dockable,
      Non-Mineable Body* › "Position coincidence without attachment is not
      docking"). Without this task, deleting 3.4's guard removes coverage
      instead of relocating it
- [ ] 3.6 `cd backend && go test ./stations/ ./mine/ ./market/ -short -count=1`
      green

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
      `grep -rn 'OrbitBasePeriod\|OrbitPeriod(' backend/` returning nothing
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
      comment at `fleet/roster_test.go:170`. Verified by
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
- [ ] 4.5 Repoint `backend/mine/integration_test.go` and
      `backend/interior_additive_wire_e2e_test.go` off `board`, keeping every
      continuous assertion
- [ ] 4.6 `cd backend && go build ./... && go test ./... -p 1` green

## 5. Delete `backend/board` and `backend/polar`

- [ ] 5.1 `rm -rf backend/board backend/polar`
- [ ] 5.2 Verified by `cd backend && go build ./... && go vet ./...` clean, and
      `grep -rn 'hexaverse/board\|hexaverse/polar' backend/` returning nothing
      (including string literals in comments and test prose)
- [ ] 5.3 `cd backend && go test ./... -p 1` green

## 6. Delete `frontend/lib/board` and `frontend/lib/polar`

- [ ] 6.1 Re-run task 1.1's grep — it must still return nothing after sections
      2–5, since a backend change can add a frontend type import
- [ ] 6.2 `rm -rf frontend/lib/board frontend/lib/polar`
- [ ] 6.3 Sweep the frontend for surviving lattice vocabulary that is not an
      import: `grep -rn 'systemBoard\|lib/board\|lib/polar\|ring\b.*slot\b'
      frontend --include='*.ts' --include='*.tsx' | grep -v node_modules`.
      Rename or remove each hit. `queryKeys.market.board()` is the **market
      price board** and is not lattice — it stays; state that exception in the
      commit rather than leaving the next reader to rediscover it
- [ ] 6.4 `cd frontend && npm run lint && npx vitest run` green, and
      `cd frontend && npm run e2e` green

## 7. Fixtures, mirror maps, and the deviation register

- [ ] 7.1 `rm -rf fixtures/board fixtures/polar`. Verified by
      `grep -rn 'fixtures/board\|fixtures/polar' . --exclude-dir=node_modules
      --exclude-dir=.git --exclude-dir=archive` returning nothing outside
      `docs/plans/` and `openspec/changes/archive/`, which are historical record
      and stay
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
- [ ] 7.5 Re-record `fixtures/system/cases.json`'s `interiorElements` family
      over its surviving `continuousLine` component alone, dropping
      `latticeProjection` and `latticeDrawCount` from the serialization and
      recomputing `interiorElementsSweep`'s digest and `serialization` string
      (design.md Decision 3). **Before committing the re-recorded file**, assert
      it reproduces byte-for-byte under `GOARCH=arm64` and under
      `GOARCH=amd64 GOAMD64=v1`. If the two disagree, **stop and report** — do
      not commit a one-architecture recording (design.md OQ-1; this is the exact
      failure `pin-system-generation-determinism` existed to end)
- [ ] 7.6 Update `fixtures/system/cases.json`'s `_meta.generatedOn` and
      `_meta.serialization` to describe the new recording honestly, including
      the architecture it was recorded on
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
- [ ] 8.5 `check.py`: remove the `frontend/lib/board` and `frontend/lib/polar`
      clauses from `check_transcendental`'s seam-file predicate (site 7), and
      `check-transcendental.sh`'s matching `frontend/lib/(board|polar)` path
      predicate and its `board-tactical-math`-citing comment (sites 14, 16)
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
- [ ] 8.9 `check-mirror-map.sh`: rewrite the header comment (site 17), delete
      the stale `frontend/app/spike/space-3d` carve-out comment (site 18 —
      `build-production-space-view` task 10.6 deleted that spike), and update the
      final `PASS:` message's package enumeration (site 20)
- [ ] 8.10 `check-frontend-tests.sh`: delete the `components/board/webgl/`
      GL-plumbing carve-out and its comment (site 21). Verified by
      `grep -rn 'components/board' .claude/` returning nothing
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
      "the TS **board-math** mirror". Repoint it at the surviving TS seam. This
      is a third, separate docstring from sites 8 and 10
- [ ] 8.15 `fixtures/system/mirror-map.json` (site 32): delete the
      `generateWithStreams` (line 60) and `clampRing` (line 71) coverage
      entries and the `generateWithStreams` /
      `TestInteriorElementsSweep_MatchesLatticeIdentitySweep` mentions inside
      the `newRand` and `Generate` notes (lines 58-59); repoint the
      `orbitFeature` / `orbitFor` / `beltFeature` / `hazardFeature` notes off
      lattice placement. **Nothing will fail if you skip this:** this map runs
      in `anti_mirror` mode, which reads only `.sharedNames` (`[]`) and never
      inspects `.coverage`, so a stale entry naming a deleted symbol passes
      forever. That is exactly the silently-inert record Goal 2 forbids, so it
      must be repaired by hand and verified by
      `grep -n 'clampRing\|generateWithStreams\|Lattice' fixtures/system/mirror-map.json`
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
      defect rather than closing the old one silently
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
      to reflect what this change actually turned out to be (a nine-capability
      change with a generator-output consequence, not the four-line deletion the
      original entry predicted)

## 10. Whole-tree sweep

- [ ] 10.1 `grep -rn 'backend/board\|backend/polar\|frontend/lib/board\|frontend/lib/polar\|fixtures/board\|fixtures/polar\|board-tactical-math\|polar-lattice-math' . --exclude-dir=node_modules --exclude-dir=.git`
      SHALL return hits only under `openspec/changes/archive/`,
      `docs/plans/`, `docs/handoffs/` and `docs/defects/` — all historical
      record, which stays. Every other hit is fixed or removed
- [ ] 10.1b Run a **second, bare-token** sweep, because the enforcement lists
      do not spell the packages as paths and 10.1's path patterns miss all of
      them: `check.py`'s `DETERMINISM_GO_PACKAGES = ("board", "polar", …)`,
      `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES=(board polar …)`,
      and the `go test ./board/ ./polar/ …` command strings in both `check.py`
      and `.gitlab-ci.yml` are the exact sites section 8 de-enrols, and 10.1
      cannot confirm any of them. Run
      `grep -rnE '"board"|"polar"|\(board |[( ]polar[) ]|\./board/|\./polar/' .claude .gitlab-ci.yml infra`
      and require it to return nothing. Without this leg the section-8 tasks
      are self-attested
- [ ] 10.2 `grep -rni 'lattice' backend frontend .claude fixtures
      --exclude-dir=node_modules` SHALL return only the deliberate wire-contract
      guard `build-production-space-view` added (`system-interior`: "Lattice-only
      fields are absent from the response") and its implementing test
      (design.md Decision 6). Anything else is a leftover. **The pattern is
      deliberately unanchored**: `\blattice\b` misses the two shapes that
      matter most, because both GNU and BSD `grep` treat `_` as a word
      character and `\b` does not fire inside CamelCase — so
      `backend/system/lattice_identity_test.go` (a whole file) and
      `MatchesLatticeIdentitySweep` (cited from three files) both survive a
      word-bounded sweep
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
      forgotten
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
- [ ] 11.4 Confirm every `MODIFIED` block reproduces every scenario the
      **post-predecessor** spec will have, not only the live one: link 9's
      `cross-stack-determinism` › *Shared Board Math Is Pinned By a
      Cross-Language Golden Fixture* must carry all fourteen scenarios
      `build-production-space-view` leaves behind, three of which are not in the
      live spec today. `openspec-reconcile.py` compares against the live spec
      only and cannot see this
- [ ] 11.5 `cd backend && go test ./... -p 1`, `cd frontend && npx vitest run`,
      `cd frontend && npm run e2e`, and
      `bash .claude/scripts/check.sh --backend --frontend --lint --test` all
      green

## 12. Archive rehearsal — before the real archive

`openspec validate --strict` reports this change valid whether or not the
retirement in section 13 happens. The archiver is the gate, and it is the
archiver that must be rehearsed.

- [ ] 12.1 Copy `openspec/` to a scratch directory and, **in that copy, archive
      the predecessors first, in order** — `add-stationkeep-hold-verb`, then
      `serve-orbital-elements-and-burn-preview`, then
      `build-production-space-view`, then `add-scan-and-sightings-surface` —
      applying `build-production-space-view`'s own post-archive hand-steps
      (its tasks 13.1–13.5, including the `board-view` directory deletion) so
      the rehearsal runs against the tree this change will actually meet.
      Against an unarchived tree it rehearses a shape that never ships
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
        predicate", a scenario this change retires. **This file is named in no
        other task**, still compiles and still passes, so nothing else surfaces
        it; delete it under Decision 6 (its own header records that the package
        implements no dock predicate at all) or repoint it at *Station Is a
        Dockable, Non-Mineable Body* › "Position coincidence without attachment
        is not docking"

## 13. Post-archive manual steps

None of these is reachable by a delta: each is a directory removal or prose
outside a `### Requirement:` block. The `## Purpose` edits run **before** the
directory deletion and its grep, so that grep runs against a tree from which
every stale citation has already been removed.

- [ ] 13.1 Hand-edit `openspec/specs/space-kinematics/spec.md`'s `## Purpose`:
      remove the sentences that name `board-tactical-math`, `backend/board`,
      `backend/polar`, `frontend/lib/board` and `frontend/lib/polar` as "the
      lattice every shipped consumer" and as future deletion material.
      `build-production-space-view` task 13.1 edits two **other** sentences in
      the same Purpose (the `space-3d` carve-out and the `board-view` move
      preview) and does not reach these. **Do not delete the spike carve-out
      sentence** — *Every Rule-Bearing Value of This Capability Is Computed Only
      in the Authoritative Implementation* requires the exemption to be stated
      in the Purpose alongside a named path
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

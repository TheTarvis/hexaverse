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
      delete or rewrite the tests that exist only to exercise the lattice
      (`bodies_test.go`, `gates_test.go`, `fog_test.go`,
      `generator_placement_test.go`, `generator_test.go`, `handler_test.go`,
      `interior_*_test.go`, `splice_completeness_test.go`,
      `spliced_body_complete_or_loud_test.go`, `station_splice_test.go` — keep
      every assertion about continuous behaviour, drop only lattice assertions)
- [ ] 2.11 Add the test the removed slot-coverage scenario leaves behind:
      generate interiors across many seeds, collect every feature's continuous
      phase, and assert the collected phases occupy every quadrant of
      `[0, SubTurn)` (`system-interior`: *Interior Generation Is Lazy and
      Deterministic* › "Generated phases span the whole turn"). Without this,
      deleting the slot-coverage scenario removes reachability coverage instead
      of relocating it
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
- [ ] 4.3 Delete `fleet.Params.BoardRadius` and its assignment, now that
      `LaneGates` takes no radius (task 2.7). Verified by `grep -rn 'BoardRadius'
      backend/` returning nothing
- [ ] 4.4 Delete `backend/common/tuning_schedule_test.go` (it exists to assert
      the tuning radius against a board schedule) and repoint
      `backend/action/commit_params_validator_test.go`'s rejected non-primitive
      from a `board.Cell` to a `space.Vec3` (`action-dispatch`: *Commit Rejects
      Non-Primitive Action Parameters* › "A domain struct in params is rejected
      at commit"). The test must still be red for the right reason — confirm it
      fails when the validator's allowlist is widened
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
      `Capacity`/`capacity` as pairs and `bestPriceFor` as `tsOnly`, with
      coverage `family:foldSale` / `family:firstTonPrice` (and `capacity` as an
      indirect callee, following `fixtures/polar/mirror-map.json`'s `note`
      convention). Any shared function this surfaces with no family goes to the
      map's coverage `inventory` with an `expectedChange`, not to a new fixture
      family — recording a new family is out of scope here
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
- [ ] 7.7 Edit `fixtures/determinism-register.json`'s `checks` legend: the
      `cross-target` entry names "the amd64 differential **board-test** leg in
      /check", which no longer exists. Repoint it at the surviving leg. Confirm
      the five open entries (galaxy, market ×2, mine ×2) are **unchanged** —
      none is lattice, and a deletion change must not quietly clear a live
      defect suppression

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
- [ ] 10.2 `grep -rni '\blattice\b' backend frontend .claude fixtures
      --exclude-dir=node_modules` SHALL return only the deliberate wire-contract
      guard `build-production-space-view` added (`system-interior`: "Lattice-only
      fields are absent from the response") and its implementing test
      (design.md Decision 6). Anything else is a leftover
- [ ] 10.3 Confirm the four wording-only deltas landed and have no code to
      change, so they are not mistaken later for unimplemented work:
      `world-clock` (*Scaled World Time* — drops `board` **and** `observation`,
      a package link 5 deleted and this sweep also catches), `session-wakeup`
      (*Successful Spawn Hands Off to the Home Board*), `galaxy-generation`
      (*Per-System Body Skeleton*), and `mine-extraction` (*Ledger Key Is
      System-And-Kind-Qualified, Channel Scope Is Per-System*). Each names a
      route, a package list or an example that the code already satisfies;
      verify that by grep rather than by assumption
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
- [ ] 12.5 In that copy, run the **retired-requirement-title** sweep, which no
      tool performs: for every one of `board-tactical-math`'s 22 requirement
      titles, and for every requirement title this change retires in
      `system-interior`, `trading-station` and `cross-stack-determinism`,
      `grep` all of `openspec/specs/` for that exact title. Each hit is a
      citation of a requirement that no longer exists and must be repointed or
      removed. (Authoring found two such citations up front —
      `trading-station`'s *Station-Store Read Failure Degrades* and
      `cross-stack-determinism`'s *Rule-Bearing Values Cross the Seam*, both
      already repaired by this change's deltas — so the sweep's job is to catch
      the ones the predecessors introduce)

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

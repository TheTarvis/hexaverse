## 1. Contract First (Step 0 — `board` and `action` compile green)

- [x] 1.1 Add `backend/board/params.go`: `EncodeCell`, `DecodeCell`,
      `EncodeTarget`, `DecodeTarget` (Decision 4's codec).
- [x] 1.2 Add `board.ProductionSchedule() polar.Schedule` (memoized on
      `common.Tuning().BoardRadius`) alongside the existing
      `board.Schedule(maxRing)` (Decision 3).
- [x] 1.3 Add `board.Within(center Cell, radius int, s polar.Schedule)
      map[Cell]bool` (Decision 6) — bounded BFS via the existing `neighbors`
      enumeration. Pin correctness with a table-driven test asserting
      `Within(c, r, s) == {x : Distance(c, x, s) ≤ r}` over a bounded
      sweep. **Do not** touch `fixtures/board/cases.json` or the
      coordinate table. `.claude/scripts/check-mirror-map.sh` extracts
      every `^func ` declaration from `backend/board/*.go` and fails
      `/check` (DoD 11.3) if any is absent from
      `fixtures/board/mirror-map.json` — add `goOnly` entries for ALL SIX
      functions §1 introduces: `Within`, `EncodeCell`, `DecodeCell`,
      `EncodeTarget`, `DecodeTarget`, `ProductionSchedule`. Any additional
      unexported-to-exported helper added while implementing §1 must also
      be mapped, or `/check` reds at 11.3.
- [x] 1.4 Add `action.ErrNonPrimitiveParam` and the `action.Commit`
      validator enforcing the Firestore-native allowlist (Decision 4, part
      2). Add/adjust unit tests on the four live `Params:` literals
      (`fleet/service.go:331,504`, `fleet/travel.go:103`,
      `mine/service.go:231`) to confirm which pass and which must change.
- [x] 1.5 Land final signatures with no logic behind them yet:
      `observation.FeatureGeom.OcclusionRadius2 int64` (replacing
      `Occludes bool`), `SeedFleet(ctx, systemID, corporationID string, at
      board.Cell)` across the `corporations`/`fleet` interfaces,
      `system.Feature.Footprint []board.Cell`.
- [x] 1.6 Add a unit test in `backend/board/table_test.go` asserting every
      slot count producible by `board.Schedule(maxRing)` across a generous
      maxRing range (0–200) is present in the loaded pinned coordinate
      table — the table-family coverage invariant is currently guaranteed
      only by hand-derivation. Test file only: no production `board`
      change, no fixture re-record.
- [x] 1.7 `backend/common/tuning.go`: rewrite the `OrbitPeriod` doc
      comment's "A ring has 6 × N cells, so the ring factor cancels … the
      rate you actually SEE is uniform" bullet (`:131-152`) to the
      banded-schedule truth — the period law is linear in ring; per-slot
      cadence is NOT uniform across bands. Also correct the unit comments
      `AmbientRadius: 3, // hexes` (`:90,124`) and `MsPerTile … per hex`
      (`:62,113`) to cells / lattice hops.
- [x] 1.8 Retire `backend/common/tuning_test.go:65-76`'s "uniform across
      rings" assertion and re-file the replacement in a NEW file
      `backend/common/tuning_schedule_test.go` declared `package
      common_test` — `board` and `polar` both import `common`, so an
      internal `package common` test cannot import either and cannot ask
      the schedule. The assertion MUST read the slot count from
      `board.Schedule(...)`, never from a literal. Sample at least one
      NON-coincidence ring (3, 5, 9 or 15, where `6 × ring ≠ Slots(ring)`)
      and assert `system-interior`'s "Equal-period rings with different
      slot counts advance slots at different rates". A test sampling only
      rings 1, 2, 4, 8, 16 or 32 is not evidence.
- [x] 1.9 Add `firestore:"ring"` / `firestore:"slot"` tags to `polar.Cell`
      (`backend/polar/cell.go:22-25`) so stored cells and
      `EncodeCell`-written action params use ONE spelling (today the struct
      has `json:"ring"`/`json:"slot"` but no firestore tags, so stored
      cells persist as capitalized `{Ring, Slot}` while `EncodeCell` writes
      lowercase `{"ring","slot"}` into action params). Struct tags only —
      no JSON, fixture, or mirror impact. Re-run `go test ./board/
      ./polar/ -short` and the fixture suites to confirm the pinned
      contract is untouched. Note in the commit that this is a
      persisted-shape decision taken while the reset window is open.

## 2. `system` (+ `stations`)

- [x] 2.1 Delete `backend/system/hex.go` in its entirety (no polar
      equivalent is ported — `system` speaks `board.Cell` directly, no
      alias).
- [x] 2.2 `system.Feature.Footprint` → `[]board.Cell`; update every literal
      and reader.
- [x] 2.3 Generator placement onto `sched.Slots(ring)`
      (`generator.go:118,130,171,208`): `orbitFor` draws from
      `r.Intn(sched.Slots(ring))`; ring-angle placement goes through
      `board.Canon`; `beltFeature` enumerates via `board.RingCells(ring,
      sched)`. Port `DominantOrbitDirection` verbatim (pure splitmix64 of
      the seed, no lattice content — do not let it draw from the
      generator's rand stream).
- [x] 2.4 Rewrite generator tests as **property** assertions (ring in
      range, slot in `[0, Slots(ring))`, belt arc contiguous and 40–70% of
      the ring) — no golden-value diffing against pre-migration output; the
      `r.Intn` bound change means every generated interior legitimately
      differs from its pre-migration self. The slot assertion MUST be
      two-sided: on a ring where `Slots(ring) > 6 × ring` (3, 5, 9 or 15 —
      NOT 1, 2, 4, 8, 16 or 32, where the counts coincide), assert across
      many seeds that drawn slots reach at or above `6 × ring`. A one-sided
      upper bound passes with the retired `6*ring` draw still in place.
- [x] 2.5 `fog.go:112-119` `featureCellAt`; `fog_source.go:42` anchor +
      `occlusionRadius2(FeatureType) int64` (Decision 1: `StarOcclusionRadius2`
      for `FeatureStar`, `PlanetOcclusionRadius2` for
      `FeatureRocky`/`FeatureGasGiant`/`FeatureIce`, `0` otherwise). Add a
      regression test asserting a spliced station contributes no occluder
      (Decision 1's "for free" guarantee is now load-bearing a second way).
- [x] 2.6 `gates.go:21,64` → `LaneGate.Cell` / `board.LaneGateCell`.
- [x] 2.7 Add the validating decode at the interior read boundary: reject
      (sentinel error, logged) any decoded feature whose ring exceeds the
      live schedule's `MaxRing`, before it reaches `board.Canon` (Decision
      3's guard against a `tuning.go` radius reduction panicking a read
      handler). Record the omission against the interior (not just a log
      line) so a downstream `ErrFeatureAbsent` from `fleet.Position` →
      `resolveFeature` (`fleet/service.go:598-612`) on a guarded feature
      can be attributed to this guard rather than read as a genuinely
      missing feature.
- [x] 2.8 `stations/placement.go:37` and `stations/service.go:199` onto
      `sched.Slots(ring)` / `board.Canon`; rename the `gateRing`
      field/parameter to `boardRadius` in both files (behavior unchanged,
      only the misnomer goes). At the same site, leave a comment naming the
      OPEN defect the rename would otherwise hide: `boardRadius` is not
      `board.GateRing`, so rings 13–15 can still receive a station on the
      lane-gate ring, violating `trading-station`'s "never on the gate
      ring" requirement. File `docs/defects/2026-08-26-station-on-gate-
      ring.md` (`**Status:** open`) following the existing defect-doc
      format in that directory, and reference it from the comment. Do NOT
      change the value.
- [x] 2.8b Guard the station's stored orbit BEFORE `stations.FeatureOf`
      computes its footprint. `FeatureOf` (`stations/service.go:189-199`)
      calls `board.Canon` / `sched.Slots(orbit.Ring)` during the
      `GetOrCreateInterior` splice — upstream of §2.7's interior-boundary
      check, which sees only decoded interior features and which
      `system-interior` explicitly says a station is not. Reject (omit
      the station and record, per `trading-station`'s degrade-to-no-
      station rule) any stored station whose ring exceeds the live
      schedule's `MaxRing`, so a `BoardRadius` reduction cannot panic
      every read of that system.
- [x] 2.9 `make generate` for `system/dao_mock.go`.
- [x] 2.10 `cd backend && go test ./system/... ./stations/... -short` green.

## 3. `fleet`

- [x] 3.1 Rename `SolveHex` → `SolveCell`, `MeetHex` → `MeetCell`,
      `Target.Hex` → `Target.Cell`, `LaneGateHex` → `LaneGateCell`.
- [x] 3.2 Thread `board.ProductionSchedule()` through
      `service.go:288,291,299,567` and `travel.go:128,134,147` (resolved
      once per operation at the service boundary, never inside a loop, per
      Decision 3's discipline).
- [x] 3.3 Collapse `featureAnchor` (`service.go:620-624`) to
      `f.Footprint[0]` (same type as `system.Feature.Footprint` now).
- [x] 3.4 Update `SeedFleet` call sites to the new signature
      (`:59,429,432`); its core guard becomes
      `if at == (board.Cell{})`. `Position` returns `board.Cell`
      (`:62,567`).
- [x] 3.5 Rewrite the `ErrCoreDestination` guard's comment
      (`service.go:296-300`, Decision 8): the star occupies the core; a
      polar path cannot cross the core unless an endpoint is the core, so
      rejecting the core as an endpoint is sufficient — remove the
      `board.RouteAround` reference (the function is deleted).
- [x] 3.6 `handler.go:238,289` and `model.go:93` wire shapes to
      `{ring,slot}` (see design.md's Frontend Wire-Shape Handoff table —
      backend side only; do not touch frontend types).
- [x] 3.7 `resolver.go:16` `AmbientRecorder.AmbientWrites(… path
      []board.Cell …)`.
- [x] 3.8 Convert both untyped `Params` literals through
      `board.EncodeCell`/`board.EncodeTarget`
      (`service.go:331,504` — the `"origin"` scan param and the `"target"`
      burn param). Confirm the step-1 validator now catches a miss as a
      test failure.
- [x] 3.9 `make generate` for `fleet/dao_mock.go`.
- [x] 3.10 `cd backend && go test ./fleet/... -short` green.
- [x] 3.11 Add the stored-coordinate guard at the **fleet decode boundary**
      (the fleet DAO/service read path, where a stored `MovementState`/
      `Orbit` is decoded), rejecting with a named sentinel error any ring
      exceeding the live schedule's `MaxRing` before it reaches
      `board.Canon`/`board.OrbState`. `mine` and `market` inherit this
      through `FleetSource.Get` and need no change of their own (§6.1's
      "no other change" stands). This is what satisfies `fleet-movement`'s
      "Board Coordinates Outside the Live Schedule Are Rejected, Never
      Panicked" for the fleet-read, mine-command and sell-command
      scenarios. Emit the same structured cause entry §4.5 defines —
      `cause` of `ring-out-of-range` or `undecodable-shape`, plus `ring`
      when the cause is `ring-out-of-range` — so the requirement's
      "Coordinate rejections are countable per cause" scenario has an
      implementing task on this path too, not only on the scan path.
      `actionType` and the action id apply only when the rejection came
      from decoding an action parameter; a fleet/mine/sell read has
      neither.
- [x] 3.12 Fix the stale comment at `fleet/params.go:20-25` ("the **hex**
      radius of every system board") to the cell/lattice noun — value and
      invariant unchanged, noun correction only.

## 4. `observation`

- [x] 4.1 `model.go:109,155,169,182`: `Anchor *board.Cell`, `FleetPos.Cell`,
      `FeatureGeom.Anchor` + `OcclusionRadius2`.
- [x] 4.2 `Coverage` on `[]board.Occluder` (`service.go:96-140`); wire the
      constructors (`NewCoverage`, `NewCoverageWithOccluders`, `WithDisc`)
      to materialize each disc once via `board.Within` (Decision 6) instead
      of a per-query `board.Distance` call; `Covers` becomes a set lookup
      plus the LOS check.
- [x] 4.3 `occluders` (`:587`) builds `[]board.Occluder{Cell, Radius2}` from
      `system.occlusionRadius2`; `featureCellAt` (`:602`); `sweptCovers`
      (`:611`) materializes one disc per path cell, unioned, via
      `board.Within`.
- [x] 4.4 `MintScan` (`:358`), `buildScan` (`:392,398`), `AmbientWrites`
      (`:485`), `scanOrigin` (`:560`), `echoDisc` (`:209`) — coordinate type
      swap, no semantic change beyond Decision 1's occlusion radius and
      Decision 6's materialized discs. **Coordinate with
      `revise-scan-instant-and-emission` at apply time** if it has landed
      first — `scanOrigin` and the legacy `paramHex` fallback may already be
      gone; do not pre-absorb its changes here.
- [x] 4.5 `paramHex` (`:629`) collapses to `board.DecodeCell`, losing its
      in-memory `board.Hex` branch; move its tests to encode the way
      production does (through `board.EncodeCell`). In the same function,
      record a distinguishable cause for each fallback — `origin-absent`
      (no origin param recorded, e.g. a legacy scan), `undecodable-shape`
      (an origin param is present but is not a decodable cell shape), or
      `ring-out-of-range` (an origin param decodes to a cell shape whose
      ring exceeds the live schedule's maximum, i.e. the case
      `board.DecodeCell` itself rejects) — in both the scan's recorded
      outcome text and a structured log entry carrying `cause`, `ring`
      (when the cause is `ring-out-of-range`), `actionType` and the action
      id. These three names are the ONE shared vocabulary; do not invent a
      per-call-site spelling. Per
      `observation-fog-and-scan`'s "Running Scan Echo Disc" and
      `fleet-movement`'s "Board Coordinates Outside the Live Schedule Are
      Rejected, Never Panicked".
- [x] 4.6 `make generate` for `observation/dao_mock.go`.
- [x] 4.7 Assert `AmbientWrites`'s bounded-work property as a deterministic
      count: for the reference shape (a forty-cell burn path against
      fifteen features, on the production schedule at the configured board
      radius), assert the number of lattice-distance expansions performed
      does not exceed a fixed, recorded bound — not an elapsed-time
      threshold, so the test holds identically on every build target.
      Separately record the measured wall-clock time (observed under 5ms
      against the naive per-query `board.Distance`'s 54ms) as a comment,
      never as the assertion.
- [x] 4.8 `cd backend && go test ./observation/... -short` green.
- [x] 4.9 `observation/ambient_test.go:23` currently uses `Ring: 20`
      against a production `MaxRing` of 16. Repurpose it as the first
      regression test for the stored-coordinate guard (assert the named
      sentinel error, not a panic) rather than silently lowering it to a
      legal ring.

## 5. `corporations`

- [x] 5.1 `service.go:35` interface signature update (`SeedFleet` takes
      `board.Cell`).
- [x] 5.2 `service.go:474` `rimCell(accountId, sched)`: ask
      `sched.Slots(RimRing)` and take the account-seeded modulus — no
      `RingCells` enumeration (Decision 5).
- [x] 5.3 Fix the stale comment at `params.go:21,37` ("one hex inside the
      lane-gate ring" → the correct ring relationship, coordinate noun
      corrected to "cell"); do **not** change the `RimRing` value — see
      proposal.md's pre-existing-defects note.
- [x] 5.4 `cd backend && go test ./corporations/... -short` green.

## 6. `mine` / `market`

- [x] 6.1 Thread `board.ProductionSchedule()` into the `board.StateAt` calls
      at `mine/service.go:152` and `market/service.go:497`. No other change
      to either package — resist "improving" them while the file is open
      (Decision 12). The stored-coordinate guard (§3.11) is inherited
      automatically through `FleetSource.Get`, which is how both packages
      obtain their fleet; neither package adds a guard of its own.
- [x] 6.2 Re-derive (not merely re-type) the station-dock and
      station-not-mineable test coordinates in
      `backend/fleet/station_dock_test.go` (this file lives in §3's
      package, not §6's), since the station's cell now comes from
      `sched.Slots(ring)` rather than `6 × ring`.
- [x] 6.3 `cd backend && go build ./... ` is green from this point on.

## 7. Verification Sweep

- [x] 7.1 `go vet ./...`.
- [x] 7.2 `cd backend && make test` (`go test -short ./...`) green.
- [x] 7.3 Emulator-backed integration suites green: `npm run
      test:backend:all` (or `go test ./...` against the emulators per
      `backend/CLAUDE.md`).
- [x] 7.4 Verify (do not regenerate) `cmd/seed` tooling: `cmd/seed` builds;
      `make seed` and `cmd/seed start-area` run green; the regenerated
      `frontend/public/galaxy/start-area.json` is byte-comparable in
      **schema** to the committed one (Decision 9 — no board coordinates in
      this artifact, verified not assumed).
- [x] 7.5 Sweep the test corpus for surviving `6 × ring` cadence and
      slot-count assumptions and re-derive each from `sched.Slots(ring)`:
      `fleet/resolver_test.go:104`, `fleet/service_test.go:340,372`,
      `observation/service_test.go:140`, `stations/placement_test.go:40`.
      (`common/tuning_test.go:71` is NOT in this list — §1.8 retires it into
      `common/tuning_schedule_test.go` as `package common_test`, because an
      internal `package common` test cannot import `board`/`polar` at all.)
      Every re-derived assertion must exercise
      at least one ring where `Slots(ring) ≠ 6 × ring` (3, 5, 9 or 15) —
      rings 1, 2, 4, 8, 16 and 32 are coincidence points and prove nothing.

## 8. Determinism Register (gated on Section 6 being green)

- [x] 8.1 Run `.claude/scripts/check-fma-contraction.sh` and
      `.claude/scripts/check-transcendental.sh` against the now-compiling
      module; collect the failure list (drifted line numbers) as the
      worklist.
- [x] 8.2 Update all 13 existing entries in
      `fixtures/determinism-register.json` to the reported line numbers.
      **Keep every entry** — every referenced defect doc is still `Status:
      open` — removing an entry is forbidden. Bring each entry's `site`
      field up to the "function name and expression" standard some entries
      already use, while editing. This includes the one entry
      (`backend/galaxy/generator.go`) this change does not otherwise touch
      — its line numbers should be unchanged; re-verify rather than assume.
- [x] 8.3 Re-run both checks: both green, **zero new entries**. A new entry
      is a stop-and-escalate (a float path entered a rule-bearing value),
      not a register append.

## 9. CLAUDE.md Updates

- [x] 9.1 Root `CLAUDE.md`: update the `board/` domain quick-reference
      paragraph's hex-coordinate language (it already says "hex/cube" in
      places describing `board/`) to cell/ring/slot terms consistent with
      the archived `rewrite-board-on-polar-lattice` change's landed
      vocabulary.
- [x] 9.2 `backend/CLAUDE.md`: update any hex-specific pattern references
      (mock-staleness note, DAO interface examples, or coordinate examples)
      to cell/ring/slot terms.
- [x] 9.3 Check `backend/system/CLAUDE.md`, `backend/fleet/CLAUDE.md`,
      `backend/observation/CLAUDE.md`, `backend/corporations/CLAUDE.md` (if
      present) for hex-specific pattern references and update them to
      cell/ring/slot terms.

## 10. Spec-Purpose Hand-Edits (outside delta operations — do at archive time)

- [x] 10.1 `openspec/specs/system-interior/spec.md` line 4 Purpose
      paragraph: "tactical hex board" → "tactical polar board" (or
      equivalent cell-based phrasing).
- [x] 10.2 `openspec/specs/system-interior/spec.md`'s "Notes for future
      maintainers" section (bottom of file): re-read against Decision 1
      (occlusion is now a radius, not a bool) and update the wording if it
      still implies a boolean occludes/does-not-occlude split.
- [x] 10.3 Confirm no other Purpose paragraph among the five deltaed
      capabilities (`fleet-movement`, `observation-fog-and-scan`,
      `corporation-spawn`, `trading-station`) uses hex-specific language
      that a delta operation cannot reach; hand-edit at archive time if so.
      **Confirmed 2026-08-26:** none do. The one surviving "hex" in
      `fleet-movement` (Derived Fleet Speed, "wherever the polar lattice's
      solved path length differs from the hex lattice's") is a deliberate
      historical comparison against the predecessor lattice, not stale
      wording — kept.

## 11. Definition of Done

- [x] 11.1 `cd backend && go build ./... && go test -short ./...` green.
- [x] 11.2 Full integration suite green against emulators (`npm run
      test:backend:all`).
- [x] 11.3 `python3 .claude/skills/code-quality-checks/check.py
      --backend-tests --lint` — backend legs green, including the
      cross-target matrix (arm64 + amd64/GOAMD64=v1) and
      `check-fma-contraction.sh`. Confirm the FMA check's previously-zero
      site count reappears once the module compiles, matching the
      re-anchored register from Section 8.
- [x] 11.4 Confirm the e2e suite and the frontend build are still red (step
      7's scope) and that the frontend lint leg of `check.py` fails as
      expected — this is not a regression to chase in this change.
- [x] 11.5 Do **not** run `openspec archive` on this change.
- [x] 11.6 World-reset precondition — **satisfied by construction, no action
      needed.** The hazard: a still-`running` scan whose origin was written
      in the retired `{q,r}` shape decodes as absent, producing a silent
      wrong-origin reveal (the Section 3.11 guard keeps it from panicking
      but cannot recover the lost coordinate). Travis confirmed 2026-08-26
      that there are **no deployed environments at all** — no prod, no dev;
      the project runs only against a local Firebase emulator, and
      `firebase.json`/`package.json` configure no `--import` or
      `--export-on-exit`, so emulator state is ephemeral and every restart
      starts empty. The emulator was restarted 2026-08-26, so no
      pre-migration action, fleet, or fog document survives anywhere. The
      parent migration's step 8 reduces to `make seed` on demand.

# Tasks — rewrite-board-on-polar-lattice

Gate discipline: tasks 1.x close the adjacency fork and are a decision
point — if the bench re-score (1.6) regresses past the recorded bound, stop
and re-cut the fork loose (design.md fallback) before any board work.
Fixture recording never runs on Apple Silicon while a float path remains
(`docs/defects/2026-08-25-line-fma-arch-divergence.md`).

## 1. Lattice core: tight adjacency + stitch (gates)

- [x] 1.1 Tighten `backend/polar/adjacency.go` to true corner contact
      (`2g ≤ D/Sa + D/Sb`, cross-multiplied integer form); update its
      doc comment (the "known looseness" paragraph retires) and unit tests
      (phantom-neighbor cases flip to non-adjacent; within-band and core
      cases unchanged)
- [x] 1.2 Add the stitch pass to `backend/polar/path.go`: after duplicate
      collapse and destination append, insert the finer-ring bridging cell
      for any consecutive pair failing the tight predicate; unit tests for
      both boundary directions (in→out, out→in) and the appended-tail case
- [x] 1.3 Mirror 1.1 + 1.2 in `frontend/lib/polar/` (adjacency.ts,
      path.ts) with the same tests
- [x] 1.4 Re-record `fixtures/polar/cases.json` (adjacency + path families
      and their sweep digests; schedule/radius/orbit families MUST
      reproduce unchanged — any diff there is a stop signal); verify on
      arm64 + amd64/GOAMD64=v1 + JS runtime
- [x] 1.5 **Gate 1:** re-run the exhaustive path sweeps (all four schedule
      cases + the 10^6 random-path harness) asserting zero non-adjacent
      consecutive pairs under the tight predicate
- [x] 1.6 **Gate 2:** re-score the `/spike/polar-board` bench cases with
      the stitched production `arcPath` (same method as the archived
      change's re-bench: bench endpoints, projection, Chaikin ×3,
      `maxTurnDeg`); record the four figures in this change's design.md;
      STOP if inbound-transfer exceeds 16.49° and re-cut the fork loose
      per the fallback

## 2. Backend board rewrite

- [x] 2.1 `backend/board/`: replace `Hex` with `Cell = polar.Cell`; add the
      pinned schedule constants (`innerSlots 6`, `doubleAt [2,3,5,9,17]`)
      and `Schedule(maxRing)`; delete `route.go` and the axial/cube
      machinery in `hex.go`; add `Distance` (hop metric via tight
      adjacency) with unit tests
- [x] 2.2 Port `orbit.go` onto `polar`'s advance/back-solve (`OrbState`,
      `OrbitThrough`, `AngleOf`, `HydratePeriod` — period law stays
      `base × ring`); keep exported names
- [x] 2.3 Port `ship.go` (`MovementState`, `StateAt`, `ShipPos`, `BurnPos`,
      `CoastAt`, `Arrived`, lane types, `LaneFraction`) — coordinate swap,
      integer path-index interpolation, fold semantics unchanged
- [x] 2.4 Port `gate.go`: `GateRing` unchanged; `LaneGateHex` →
      `LaneGateCell` as pinned-table dot-product argmax, ties to lower
      slot
- [x] 2.5 Port `intercept.go`: `SolveHex` → `SolveCell` (arc path + ETA);
      `SolveIntercept` walking slot-entry instants, orbit passed as
      argument (the moon seam), dock-in-place + motionless fallbacks
- [x] 2.6 Rewrite `visibility.go` on the pinned coordinate table:
      `LineOfSight` (chord vs. occluder squared-radius, strictly-between
      semantics), `BeamHexes` → `BeamCells` (widening corridor), plus
      pinned occluder-radius constants; unit tests including the
      across-the-core occlusion case

## 3. Pinned coordinate table

- [x] 3.1 Extend the fixture-recording flow to generate the table (one
      entry per distinct slot count × slot in the Isotropic family, scale
      2^16), committed under `fixtures/board/`; loader in Go + TS that
      reads, never recomputes
- [x] 3.2 Assert the table byte-identical in both suites and across the Go
      build-target matrix

## 4. Frontend mirror

- [x] 4.1 Rename `frontend/lib/hex/` → `frontend/lib/board/`; rewrite its
      modules on `lib/polar` mirroring 2.1–2.6 surface-for-surface
      (`tuning.ts` and `pixel.ts` projection stay render-side; imports
      updated only within `lib/`, not in components — consumers stay
      broken until the next change)
- [x] 4.2 Port the module test suites; `npx vitest run` green on
      `lib/polar` + `lib/board` (component suites expected red — out of
      scope)

## 5. Board fixture re-record

- [x] 5.1 Re-record `fixtures/board/cases.json` on polar semantics:
      families `distance`, `orbState`, `orbitThrough`, `solveCell`,
      `solveIntercept`, `laneGate`, `stateAt`, `shipPos`, `lineOfSight`,
      `beam` (+ the table case from 3.x); `line`/`routeAround` families
      deleted; exhaustive-sweep digests wherever the domain is enumerable
      within 10^6; every case names its schedule; provenance recorded
- [x] 5.2 Both fixture suites (`backend/board/fixtures_test.go`,
      `frontend/lib/board/fixtures.test.ts`) green; Go suite green on
      arm64 AND amd64/GOAMD64=v1
- [x] 5.3 Update the mirror map for the renamed/renewed pairs; coverage
      inventory entries for any mirrored function not yet fixture-covered

## 6. Guardrails + spec tree

- [x] 6.1 Update hardcoded paths: `check-transcendental.sh`,
      `check-mirror-map.sh`, `/check`'s cross-target matrix
      (`frontend/lib/hex` → `frontend/lib/board`; `./board/ ./polar/`
      stays); verify both scripts pass on the new tree
- [x] 6.2 Verify no runtime trig/sqrt/bare-Round in `backend/board` or
      `frontend/lib/board` (transcendental check clean, no new pragmas)
- [ ] 6.3 At archive/sync: apply the three deltas; delete
      `openspec/specs/polar-lattice-math/` (all requirements removed);
      refresh `board-tactical-math`'s Purpose paragraph (hex wording →
      polar, `lib/hex` → `lib/board`) — Purpose text is outside delta
      operations, so it needs this manual touch

## 7. Definition of done (scoped — repo red is expected)

- [x] 7.1 `cd backend && go test ./polar/ ./board/ -short` green;
      cross-target run green on both GOARCHes
- [x] 7.2 `cd frontend && npx vitest run lib/polar lib/board` green
- [x] 7.3 Record in design.md: gate results (1.5, 1.6), and the explicit
      note that `check.py`, the full backend build, and e2e stay red
      until the consumer-migration change (next: `system` → `fleet` →
      `observation` → `corporations` → `mine`/`market`, collapsing
      `backend/system/hex.go` and auditing `action.Params`' two untyped
      coordinate values at `fleet/service.go:331,504`)

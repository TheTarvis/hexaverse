## Context

Steps 4+5 of the approved polar migration
(`docs/handoffs/2026-08-24-polar-lattice-migration.md` §9;
kickoff `docs/handoffs/2026-08-25-polar-board-rewrite-kickoff.md`). The
math core (`backend/polar/` + `frontend/lib/polar/` +
`fixtures/polar/cases.json`) landed with Go↔TS parity bit-identical on
both build targets. `backend/board/` and `frontend/lib/hex/` still
implement the hex lattice every consumer uses. This change replaces them.

Decisions settled with Travis 2026-08-25, in this change's propose
session:

- **Schedule: Isotropic** — `innerSlots 6`, `doubleAt [2,3,5,9,17]`
  (Decision 2 closed).
- **Adjacency: true corner contact** (`2g ≤ D/Sa + D/Sb`), replacing the
  landed loose predicate, with a deterministic stitch pass in the path
  sampler (the doubling-boundary fork closed toward tight).
- **Data: full reset** — no hex back-compat anywhere in the rewrite
  (Decision 5 closed; the actual wipe rides step 8).
- **Moons: stay deferred** — explicit non-goal; the intercept solve keeps
  a clean seam for a future parent-orbit target.

Constraints carried from the migration docs: the determinism seam
(`cross-stack-determinism`) — no float intermediate in any rule-bearing
value; never regenerate fixtures on Apple Silicon while a float path
remains (`docs/defects/2026-08-25-line-fma-arch-divergence.md`); rewrite
behind existing signatures where possible so the consumer sweep (next
change) is mechanical; consumers and renderer are out of scope and the
repo is red between the two changes (accepted).

## Goals / Non-Goals

**Goals:**
- `backend/board/` computes on polar cells, consuming `backend/polar/` as
  its lattice core; its own suite and fixtures green on both GOARCHes.
- The frontend mirror rewritten and renamed (`lib/hex` → `lib/board`),
  green against the same fixtures.
- Isotropic schedule pinned as spec'd values; adjacency tightened +
  stitch, gated on the exhaustive sweep and a bench re-score.
- `fixtures/board/cases.json` re-recorded on polar semantics;
  `fixtures/polar/cases.json` re-recorded for tight adjacency + stitch.
- Spec tree left honest: `polar-lattice-math` folded into
  `board-tactical-math` per the archived Exit plan.

**Non-Goals:**
- No consumer compiles or migrates (that sweep is the next change, in
  dependency order `system` → `fleet` → `observation` → `corporations` →
  `mine`/`market`, where `backend/system/hex.go`'s duplicate `Hex` also
  collapses).
- No renderer work; no movement-tuning retune (`MsPerTile`, burn
  durations, the `move-preview.ts:13` 24× drift — all ride the renderer
  step).
- No moon targeting; no data migration; no galaxy graph-tier changes.
- No propellant/delta-v.

## Decisions

### Decision: `board` consumes `polar`; the capability folds, the packages stay split
`backend/board` imports `backend/polar` (and `lib/board` imports
`lib/polar`) rather than absorbing the lattice code into one package.
The spec-level fold (one capability, `board-tactical-math`) does not
require one package, and keeping the split preserves the landed package's
tests, fixtures, guardrail wiring (`check-transcendental.sh`,
`check-mirror-map.sh`, `/check`'s cross-target matrix already watch both
pairs) and its clean "lattice only, no kinematics" boundary. `board.Cell`
is an alias of `polar.Cell`; board speaks `cell`/`ring`/`slot` from now
on. Alternative rejected: merging packages — pure churn, no boundary
improvement.

### Decision: Keep names where semantics survive, rename where they don't
Kept (mechanical for the consumer sweep): `StateAt`, `ShipPos`,
`BurnPos`, `CoastAt`, `Arrived`, `LaneFraction`, `GateRing`,
`LineOfSight`, `SolveIntercept`, `Solution`, `Orbit`, `OrbState`,
`OrbitThrough`, `HydratePeriod`, `MovementState` and the lane types.
Renamed (hex-specific names would lie): `SolveHex` → `SolveCell`,
`LaneGateHex` → `LaneGateCell`, `BeamHexes` → `BeamCells`,
`RingHexes` → `RingCells`, `Line` → gone (callers use `polar.ArcPath`).
Deleted: `RouteAround`, `Distance`'s hex form (replaced, see below),
`board/route.go`, the axial/cube machinery. The consumer sweep is
compiler-guided either way; renames were chosen so no surviving name
claims hex semantics.

### Decision: The production schedule is a board-owned pinned constant
`board.Schedule(maxRing)` returns
`polar.NewBandedSchedule(6, [2,3,5,9,17], maxRing)`; the two values are
exported constants pinned by spec and fixture (every board fixture case
names the schedule per the recorded-case discipline). `maxRing` stays a
parameter because board radius is per-system (set by `system`'s
generator). The schedule values live in `board`, not `polar` — `polar`
stays value-agnostic (its schedule-shape validation is the invariant;
the values are this game's choice).

### Decision: Adjacency tightens to true corner contact; the stitch inserts the unique bridging cell
`polar.IsAdjacent` moves from `g·min(Sa,Sb) ≤ D` to the cross-multiplied
integer form of `2g ≤ D/Sa + D/Sb`. Within a band and at the core the
predicate is unchanged (both bounds coincide there); the only behavior
change is at doubling boundaries, where the two non-touching "phantom"
neighbors (centers `2` fine-units away, gap of half a fine cell) stop
counting as adjacent. Since only boundary steps change legality, the
sampler's newly-illegal steps are exactly the `g = 2` diagonal skips —
and each has a unique bridging cell: the fine-ring cell one slot from the
step's fine endpoint toward the coarse cell's doubled center, adjacent to
both ends under the tight rule. `ArcPath` gains a stitch pass: after
duplicate-collapse (and covering the appended-destination tail), any
consecutive non-adjacent pair gets that bridging cell inserted.
Deterministic — no choice exists to tie-break.

**Gates (both must pass before the fork is considered closed):**
1. The exhaustive `arcPath` sweeps (all four schedule cases, plus the
   random-path harness from the archived change's verification) re-run
   under the tight predicate with zero non-adjacent consecutive pairs.
2. The `/spike/polar-board` bench re-scores the four measured cases with
   the stitched production `arcPath`; the inbound-transfer smoothed max
   turn must not exceed the spike's mean-ring 16.49° (the figure the
   migration was approved against; current unstitched measurement is
   12.63°).

**Fallback if gate 2 fails:** revert to the loose predicate and drop the
stitch (both sides of the fork are fixture-pinned; the spec deltas would
be re-cut loose). This is recorded so a bench regression triggers a
decision, not an improvisation.

### Decision: `Distance` becomes the lattice hop metric
`board.Distance(a, b, sched)` is the minimum number of adjacency steps
between two cells (the graph metric induced by the tight predicate),
computed in pure integer arithmetic. Rationale: hex `Distance` was also
its lattice's hop metric, live callers mean "within N steps" (fog's
`AmbientRadius`), and under the near-square Isotropic schedule hops track
physical radial units closely — so consumer semantics carry over without
retuning. Alternatives rejected: radial-unit Euclidean distance (needs
pinned-coordinate arithmetic everywhere `Distance` is called, and changes
fog-bubble shape unpredictably before the observation consumer change);
an `(Δring, Δslot)` ellipse (invents a metric no requirement asks for).
Fixture family with an exhaustive sweep (cell-pair domain, bounded ring).

### Decision: Visibility runs on a pinned coordinate table
`LineOfSight` and `BeamCells` need real geometry — sight is a straight
chord, not an arc, and "behind the star" is a Euclidean statement. Cell
centers involve `cos`/`sin` of rational turns, which the seam bans at
runtime. Resolution: a **pinned coordinate table** — for each distinct
slot count `S` in the Isotropic family and each slot `s < S`, the
fixed-point `(x, y)` of angle `s/S` turns at unit radius, scaled by
`2^16` and rounded once **at record time**; a cell's center is
`ring × (x, y)`. The table is generated by the fixture-recording flow,
committed as data (a `fixtures/board/` artifact), loaded — never
recomputed — by both languages, and asserted byte-identical by both
suites and across build targets. Runtime visibility math is then exact
integer geometry on pinned values: squared distances, cross products,
segment-parameter comparisons via cross-multiplication — no runtime trig,
no runtime `sqrt` (comparisons stay squared), no floats.

- `LineOfSight(origin, target, occluders)`: target visible unless some
  occluder's center lies strictly between origin and target along the
  chord (projection parameter strictly inside `(0,1)`) and the chord
  passes within that occluder's pinned squared radius. Occluder radii are
  pinned integer constants per kind (star core, planet), tuning-owned.
  Same observable semantics as hex LOS: an occluder never shadows itself
  or anything in front of it.
- `BeamCells(origin, aim, rim, halfWidthBase, spread)`: cells within the
  rim whose centers lie within the widening corridor around the ray
  origin→aim (perpendicular distance ≤ base + spread × along-ray
  distance, compared in cross-multiplied integer form). Empty when
  `aim == origin`. Same observable shape as the hex beam: narrow at the
  origin, widening with distance, clipped at the rim.

This extends the seam's existing "pinned, not assumed" discipline (the
pinned-`sqrt` precedent in `cross-stack-determinism`) from a pinned
function result to a pinned value table; the spec delta states it
explicitly rather than smuggling it. Alternatives rejected: runtime trig
(banned, measured divergent); arc-path-walk LOS (sight would bend around
the star — the star would occlude nothing); pure angular-wedge occlusion
(cannot express the general viewer-not-at-center case honestly).

### Decision: Solves stay integer iteration; the intercept seam anticipates moons
`SolveCell`: path = production `ArcPath` (stitched), ETA
`now + (len(path)−1) × msPerTile`. No routing — `RouteAround` has nothing
to avoid (a polar path reaches the core only if an endpoint is the core).
`SolveIntercept` keeps the hex version's shape: walk the target's future
slot-entry instants (integer instants from the orbital advance — period
and slot count are integers), accept the first instant whose travel time
`(len(ArcPath(from, candidate))−1) × msPerTile` is ≤ elapsed, bounded by
the same horizon; dock-in-place when co-located; motionless targets
collapse to `SolveCell`. No closed form is attempted — the iteration is
already exact, bounded, and shared-shape with the incumbent. The solve
takes the target's orbit as an argument (not a feature lookup), which is
the moon seam: a future moon target passes a parent-composed orbit
without the solve changing.

### Decision: The orbital period law stays linear
`HydratePeriod` keeps `period = base × ring`. Physical angular velocity
stays continuous in ring; the per-band cell-crossing cadence
discontinuity is lattice bookkeeping, not visible motion. Kepler
`ring^1.5` remains expressible later as a one-formula tuning change (and
would need the pinned-value discipline for `isqrt`). Recorded so the
renderer-step retune knows this was chosen, not overlooked.

### Decision: Lane gates keep the discretized-choice discipline
`LaneGateCell` picks the gate-ring slot whose pinned-table direction has
the maximum dot product with the lane's galaxy-coordinate bearing vector
(ties to the lower slot index). The bearing inputs remain floats from the
galaxy generator — the same discretized-choice hazard class the incumbent
`LaneGateHex` has (`docs/defects/2026-08-25-lanegate-near-tie-divergence.md`),
governed by the same `cross-stack-determinism` requirement and deviation
register. This change does not fix that defect; it preserves the
discipline around it.

### Decision: Fixture topology — two files, re-recorded once each
- `fixtures/polar/cases.json`: re-recorded for the tight predicate
  (adjacency families and sweep digests change) and stitched `ArcPath`
  (path families and sweep digests change). Schedule-shape, radius,
  orbital advance and back-solve families are untouched by either edit
  and must reproduce unchanged — a diff there is a red flag, not a
  re-record.
- `fixtures/board/cases.json`: fully re-recorded on polar semantics. The
  `line` and `routeAround` families are deleted with their functions.
  Families after the rewrite (one per mirrored function, sweeps where the
  domain is enumerable): `distance`, `orbState`, `orbitThrough`,
  `solveCell`, `solveIntercept`, `laneGate`, `stateAt`, `shipPos`,
  `lineOfSight`, `beam`, plus the pinned coordinate table asserted
  byte-identical as its own case.
- Recording runs through the existing recording flow with cross-target
  verification (arm64 + amd64/GOAMD64=v1 + JS runtime); the
  Apple-Silicon prohibition stands until the last float path is gone,
  and the pinned table is recorded once and thereafter loaded, so no
  re-record recomputes trig.

## Gate Results (recorded at apply, 2026-08-25)

**Gate 1 (tasks.md 1.5) — PASSED.** Exhaustive `ArcPath` sweeps under the
tight predicate: 567,700 paths across four schedules (isotropic6,
balanced12, innerdense24, and a lateDoubles schedule with adjacent
boundaries), all ordered pairs at maxRing 10, **zero non-adjacent
consecutive pairs**; plus the 10^6 random-path harness at maxRing 20
(seeded), zero violations. Codified as
`backend/polar/gate_test.go` (`TestArcPath_Gate1_TightAdjacencySweeps`;
the random harness runs outside `-short`). Raw-sampler skip census at the
tightening: out→in skips dominate (40,884 vs 252 in→out at rings ≤ 11
under tight6); both directions exist and both are exercised by unit tests.

**Gate 2 (tasks.md 1.6) — PASSED.** The `/spike/polar-board` bench re-run
with the stitched production `arcPath` (lib/polar) on the bench's own
quantized endpoints, projection, Chaikin ×3, `maxTurnDeg` — the archived
change's re-bench method, reproduced exactly (the inbound-transfer
endpoints quantize to the same `13:12 → 3:14`, 32 cells, length 28.23):

| case | endpoints | cells | smoothed max turn | length (radial units) |
|---|---|---|---|---|
| Across the star | 11:44 → 11:92 | 49 | 0.47° | 34.55 |
| **Inbound transfer** | 13:12 → 3:14 | 32 | **12.63°** (bound: ≤ 16.49°) | 28.23 |
| Tangential burn | 8:2 → 8:18 | 17 | 0.94° | 16.74 |
| Steep radial | 15:0 → 2:1 | 14 | 7.02° | 14.53 |

(Rim to core, the fifth preset: 14:67 → 0:0, 15 cells, 5.65°, 14.33.)
The four bench paths contain no stitch, so the stitched production path
reproduces the unstitched 12.63° exactly — no regression, fallback not
triggered, the loose fork is closed.

**Definition-of-done state (tasks.md 7.x, recorded at apply):**
`go test ./polar/ ./board/ -short` green on arm64 AND amd64/GOAMD64=v1;
`npx vitest run lib/polar lib/board` green (280 tests);
`fixtures/board/cases.json` fully re-recorded on polar semantics (11
families + 6 exhaustive-sweep digests, all reproduced by both languages and
both Go build targets); the pinned coordinate table committed in three
byte-identical copies (canonical `fixtures/board/coordinate-table.json`,
Go-embedded `backend/board/coordtable.json`, TS
`frontend/lib/board/coordtable.json`); mirror-map and transcendental checks
pass on the renamed tree; board+polar emit ZERO FMA sites on the
contracting target. The line-FMA defect
(`docs/defects/2026-08-25-line-fma-arch-divergence.md`) is **fixed by
deletion** — its seven deviation-register entries are removed, and the
never-regenerate-fixtures-on-Apple-Silicon prohibition lifts for the board
file (no float path remains in any recorded output; the lane-gate bearing
stays discretized with off-bisector recorded cases).

**Expected red until the consumer-migration change:** `check.py`'s full
gate, the full backend build (`backend/system`, `fleet`, `observation`,
`corporations`, `mine`, `market` reference the retired hex surface),
frontend components importing `@/lib/hex`, and the e2e suite. The next
change sweeps consumers in dependency order `system` → `fleet` →
`observation` → `corporations` → `mine`/`market`, collapses
`backend/system/hex.go`'s duplicate Hex type, and must audit
`action.Params`' two untyped coordinate values (`fleet/service.go:331,504`)
that no compiler catches. The FMA-contraction check currently reports zero
sites because the broken module yields no compiled output for the
red packages — its per-package register warnings resolve (or update line
numbers) when the consumer sweep restores the build.

## Risks / Trade-offs

- **[Stitch changes measured smoothness]** → gate 2 (bench re-score,
  ≤ 16.49° on inbound transfer) with a recorded fallback to the loose
  fork; both forks fixture-pinned so the revert is mechanical.
- **[Pinned table near-ties: two cells' geometry equal at 2^16 scale]**
  → all comparisons are exact integer on the pinned values, so results
  are deterministic and cross-language identical by construction; the
  table is data, so a precision bump is a re-record, not a code change.
  The risk is aesthetic (a borderline LOS call differing from ideal
  geometry), not a determinism risk.
- **[Repo red between this change and the consumer sweep]** → accepted
  explicitly (solo, local). This change's definition of done is scoped:
  `go test ./polar/ ./board/` (both GOARCHes), `vitest` on `lib/polar` +
  `lib/board`, fixture reproduction, transcendental + mirror-map checks
  on the renamed paths. `check.py`'s full gate and the e2e suite return
  green only after the consumer + renderer changes.
- **[Beam/visibility semantics overlap active changes]**
  (`revise-scan-instant-and-emission`, `add-endless-galaxy`) → this
  change ports the *current* spec'd semantics; overlaps are flagged to
  those changes, not absorbed. If the scan revision lands first and
  deletes `BeamCells`' consumer, the port shrinks — coordinate at apply
  time.
- **[Signature drift makes the consumer sweep less mechanical]** → the
  kept-names list above is asserted by the mirror map; renames are
  compiler-caught. The sweep change should budget for `action.Params`'
  two untyped `board.Hex` values (`fleet/service.go:331,504`) which no
  compiler catches — inventoried in the master handoff §4 and repeated
  here so the next change's tasks carry it.

## Migration Plan

Land order inside this change: (1) tighten `polar` adjacency + stitch +
re-record `fixtures/polar/` + run gate 1; (2) run gate 2 (bench
re-score) — decision point; (3) rewrite `backend/board/` on `polar`; (4)
record the pinned coordinate table; (5) rewrite + rename the frontend
mirror; (6) re-record `fixtures/board/` with cross-target verification;
(7) update guardrail script paths; (8) update spec tree (fold). No
deploy, no stored-data migration (worlds reset at step 8 of the parent
migration). Rollback: revert the change — no persisted shape changes.

## Open Questions

*(none blocking — the four session decisions closed them; the period law
and lane-gate float-bearing defect are recorded above as deliberate
carry-forwards, and the movement retune target remains open by design
until the renderer step)*

## Context

Step 6 of the approved polar migration
(`docs/handoffs/2026-08-24-polar-lattice-migration.md` §9). Steps 4+5 landed
at `b903350` (`rewrite-board-on-polar-lattice`, not yet archived —
`openspec/specs/board-tactical-math/spec.md` still carries stale hex wording;
that change's delta file is the truth). `backend/board/` and
`frontend/lib/board/` now compute on ring-and-slot polar cells, fixture-pinned
and green on both GOARCHes. Every Go consumer of the retired hex surface is
red.

The compiler's current view (`go build ./...`, 2026-08-25) stops at
`hexaverse/observation` — Go reports one package at a time, so the visible
error list is a fraction of the work. The real blast radius, by grep over the
retired symbols (`board.Hex`, `Line`, `RouteAround`, `SolveHex`,
`LaneGateHex`, `RingHexes`, `BeamHexes`, `Neighborhood`), is six production
packages plus their tests: `system`, `fleet`, `observation`, `corporations`,
`mine`, `market` — and `stations`, which the handoff's §8 inventory predates
and therefore omits (`stations/placement.go:37`, `stations/service.go:199`).

What this change is: restore `go build ./...` and `make test` on the new
board surface, in dependency order `system` → `fleet` → `observation` →
`corporations` → `mine`/`market`, with `stations` riding `system`. Nothing
else.

Constraints carried in, all hard:

- **Fixtures are pinned contract.** `fixtures/board/cases.json`,
  `fixtures/polar/cases.json`, and `fixtures/board/coordinate-table.json`
  (with its two byte-identical copies at `backend/board/coordtable.json` and
  `frontend/lib/board/coordtable.json`) are not re-recorded here. A consumer
  needing board math the fixtures do not cover is a **finding**, escalated,
  not a re-record.
- **Zero hex back-compat.** Worlds are wiped at migration step 8, so stored
  and wire shapes move from `{q,r}` to `{ring,slot}` freely. No dual-read, no
  version field, no backfill.
- **Frontend and e2e stay red.** The renderer is step 7. This change produces
  the wire-shape handoff (below), not the renderer work.
- **Determinism seam holds.** `.claude/scripts/check-transcendental.sh` and
  `check-fma-contraction.sh` must pass on the migrated files with **no new**
  entries in `fixtures/determinism-register.json`; the thirteen existing
  entries are all still open and their line numbers must be re-anchored.
- **Active changes are not absorbed.** `revise-scan-instant-and-emission` and
  `add-endless-galaxy` touch visibility/scan semantics; `add-board-camera-controls`
  and `add-station-exchange` are elsewhere. This change ports **current
  spec'd semantics only**; contact points are named per decision.

Two facts worth correcting up front, both verified in this repo rather than
inherited:

1. **`board.BeamCells` / `board.BeamParams` have zero production consumers.**
   The only references outside `backend/board/` are its own tests
   (`grep -rn 'BeamCells\|BeamParams' --include='*.go'` returns
   `board/visibility.go`, `board/visibility_test.go`, `board/fixtures_test.go`
   and nothing else). The live scan is a 360° radial echo disc
   (`observation/service.go:188` `echoDisc`), and `observation/params.go`
   carries no spread knobs — only `AmbientRadius int` and scan `Duration`.
   **There is no beam-knob work in this change.** `BeamCells` stays a
   fixture-pinned, unconsumed capability surface awaiting the deferred
   directional-scan variant.
2. **`cmd/seed` and `frontend/public/galaxy/start-area.json` carry no board
   coordinates.** `cmd/seed/main.go` (106 lines) contains no `board`,
   `Hex`, or `system.` reference; the artifact's schema is
   `{id, seed, bounds, systems, lanes, worldTime}` where a system carries
   `coords{x,y,z}` (galaxy tier), `region`, `tier`, and a `skeleton` of
   `{type, ring}` bodies — ring only, no angular index, and the string `"q"`
   appears nowhere in the file. **No regeneration is required.** See
   Decision 9.

## Goals / Non-Goals

**Goals**

- `go build ./...` and `go vet ./...` clean; `make test` (`go test -short
  ./...`) green; the emulator-backed integration suites green.
- Every consumer computes through one named schedule source; no call site
  constructs a schedule inline.
- The two compiler-invisible `action.Params` coordinates
  (`fleet/service.go:331`, `fleet/service.go:504`) are converted, and the bug
  class is closed structurally rather than by a one-time grep.
- `backend/system/hex.go` is deleted, not ported.
- Occlusion semantics are preserved where the spec preserves them, and the
  one place the new geometry genuinely changes behaviour (the star's shadow)
  is a deliberate, recorded decision rather than a side effect.
- `fixtures/determinism-register.json` re-anchored, with both determinism
  checks passing and no new entries.
- A complete, verified wire-shape handoff for step 7.

**Non-Goals**

- No renderer work, no `frontend/lib/types/*` edits, no e2e repair. Those are
  step 7. The 47 frontend files still importing `lib/hex` stay broken.
- No fixture re-record of any kind, in either `fixtures/board/` or
  `fixtures/polar/`. (One `fixtures/board/mirror-map.json` edit is required —
  see Decision 6 — but `cases.json` and the coordinate table are untouched.)
- No movement-tuning retune. `MsPerTile`, `AmbientRadius`, `ScanDuration`,
  `OrbitPeriod`, `BoardRadius` keep their current values (Decision 7).
  Arc paths are longer than chords; the pacing retune rides step 7 alongside
  the `move-preview.ts:13` 24× ETA drift.
- No data migration, no dual-read, no schema version.
- No new gameplay: no moon targeting, no propellant/delta-v, no directional
  beam, no station occlusion.
- No absorption of `revise-scan-instant-and-emission` or `add-endless-galaxy`.
- No `system.Orbit` → `board.Orbit` collapse (Decision 2, "what stays").

## Decisions

### Decision 1: The star is registered as an occluder by widening `FeatureGeom`, not by hard-coding the core

**Choice.** `observation.FeatureGeom.Occludes bool`
(`observation/model.go:189`) becomes
`OcclusionRadius2 int64` — zero meaning "does not occlude". `system`'s
`occludes(FeatureType) bool` (`system/fog_source.go:49`) becomes
`occlusionRadius2(FeatureType) int64`, returning
`board.StarOcclusionRadius2` for `FeatureStar`,
`board.PlanetOcclusionRadius2` for `FeatureRocky` / `FeatureGasGiant` /
`FeatureIce`, and `0` for everything else. `observation.occluderHexes`
(`observation/service.go:587`) becomes `occluders(feats, at) []board.Occluder`,
building `board.Occluder{Cell: featureCellAt(f, at), Radius2: f.OcclusionRadius2}`
for every non-zero entry. `Coverage.occluders` (`observation/service.go:96`)
changes from `map[board.Hex]bool` to `[]board.Occluder`.

**Why this shape.** The star is *not* implicit today and must not become
hard-coded tomorrow. `feat-star` is a real generated feature
(`system/generator.go:29-32`: `Fixed: true, Footprint: []Hex{{Q:0,R:0}}`)
whose anchor canonicalizes to `board.Cell{Ring:0, Slot:0}` — the core — and
whose type already returns `true` from `occludes()`. What changes is that the
new `board.LineOfSight` needs a **radius per occluder**, and a bool cannot
carry one. Putting the kind→radius table in `system` keeps the rule where
`system/fog_source.go:47-48` already declares it lives ("Which feature types
qualify is the system domain's rule") and keeps `observation` purely
geometric — it never learns what a gas giant is. Both ends are compiler-caught:
one producer, one consumer, one field.

**Planets occlude; stations occlude nothing — both for free.** Stations are
excluded from the fog feature source entirely (`system/fog_source.go:23-26`,
`if f.Type == FeatureStation { continue }`), which is the mechanism the
`trading-station` spec's "occludes nothing" rests on. It survives untouched.
Add a regression test asserting a spliced station contributes no occluder,
because that guarantee is now load-bearing in a second way (a station at ring
1–15 with a half-unit shadow would be a visible gameplay change).

**The real behaviour change, named.** Hex `LineOfSight` walked the hex line
and blocked only if an occluder *cell* lay on it — the star shadowed a
one-cell-wide sliver. Polar `LineOfSight` (`board/visibility.go:47`) blocks
when the chord passes within the occluder's pinned radius, and
`StarOcclusionRadius2` is `(1.0 radial unit)²`. **The star's shadow widens
into a genuine cone.** This is the intent of the new spec's scenario "The core
star occludes the far side of the board", and it is what makes the polar board
honest — but it is a live change to what a corp can see, and the spec writer
should carry it as MODIFIED behaviour in `observation-fog-and-scan`, not as
an incidental. Planets go the other way and land near-neutral:
`PlanetOcclusionRadius2` is `(0.5 unit)²`, and one slot at ring 8 is
`2π·8/48 ≈ 1.05` radial units wide, so a planet's shadow stays roughly one
cell wide, as on hex.

**Alternatives considered.**
- *Add `Kind string` to `FeatureGeom`, map kind→radius inside `observation`* —
  duplicates `system`'s feature-type table in a second package; adding a
  feature type would then need two edits with no compiler linking them.
  Rejected.
- *Read the radius off `FeatureGeom.Detail.FeatureType`* — `Detail` is the
  scan-minted **intel** payload (`observation/model.go:118`), nil-able by
  design and semantically the thing fog withholds. Deriving geometry from
  intel inverts the whole fog model. Rejected.
- *Have `observation` unconditionally register a core occluder* — duplicates
  the star that already arrives as a feature (double-registering it is
  harmless but dishonest), and hard-codes an astronomical assumption into the
  fog domain. Rejected.
- *Keep `Occludes bool` and let `observation` pick one radius for all* —
  loses the star/planet distinction the board package deliberately pins as
  two constants. Rejected.

### Decision 2: `system/hex.go` is deleted; `system` speaks `board.Cell` directly

**Choice.** Delete `backend/system/hex.go` in its entirety (`Hex`, `cube`,
`toCube`, `toHex`, `cubeAdd`, `cubeScale`, `cubeDirections`, `hexDistance`,
`ringHexes`, `hexAtRingAngle`, `HexAtRingAngle`, `abs`). `system.Feature.Footprint`
becomes `[]board.Cell` (`system/model.go:106`), and `system` uses `board.Cell`
by name — no `type Cell = board.Cell` alias.

**Why no alias.** The trap was never the *name*; it was that `system.Hex` was
a **distinct struct** duplicating `board.Hex`, so a conversion existed at every
boundary (`system/fog.go:117`, `system/fog_source.go:42`,
`fleet/service.go:624`) and each was hand-maintained. An alias would remove the
conversions but keep two names for one concept in a codebase where the
concept's name is now spec-pinned ("cell"). Every `Hex{Q:…,R:…}` literal has to
be rewritten regardless, so the alias buys nothing.

**Placement moves to scheduled slot counts.** Measured slot counts under the
pinned Isotropic schedule at `BoardRadius = 16`: ring 1 → 6, ring 2 → 12,
ring 3 → 24, ring 4 → 24, rings 5–8 → 48, rings 9–16 → 96. The 6×ring
assumption is right only at ring 1 (6) and ring 2 (12) and wrong everywhere
else.

| Site | Now | Becomes |
|---|---|---|
| `system/generator.go:130` `orbitFor` | `r.Intn(maxInt(1, 6*ring))` | `r.Intn(sched.Slots(ring))` |
| `system/generator.go:118, 208` | `hexAtRingAngle(ring, orb.Angle0)` | `board.Canon(board.Cell{Ring: ring, Slot: orb.Angle0}, sched)` |
| `system/generator.go:171` `beltFeature` | `ringHexes(ring)` | `board.RingCells(ring, sched)` |
| `stations/placement.go:37` | `positions := 6 * ring` | `positions := sched.Slots(ring)` |
| `stations/service.go:199` | `system.HexAtRingAngle(orbit.Ring, orbit.Angle0)` | `board.Canon(board.Cell{Ring: …, Slot: …}, sched)` |

`board.Canon` (`board/board.go`, exported) already *is* `hexAtRingAngle`'s
successor: it wraps a raw slot index into `[0, Slots(ring))` and collapses
ring ≤ 0 to the core. No new helper is needed, and none should be added.

**What stays, deliberately.**
- `system.Orbit` (`system/model.go:81`) is **not** collapsed onto
  `board.Orbit`. Both are already polar `{ring, angle0, period, dir}` and need
  zero coordinate conversion, and `system.Orbit` carries its own derivation
  (`PeriodFor`, `system/model.go:92`). Collapsing it is churn with no lattice
  risk. Recorded as a follow-on, not taken here.
- `DominantOrbitDirection` (`system/generator.go:136`) is a pure splitmix64
  function of the seed with no lattice content. Ported verbatim, including
  its "deliberately not a draw from the generator's rand stream" property —
  which is exactly why the station's direction cannot drift when the
  `orbitFor` bound changes below.

**Two consequences to record rather than discover.**
1. `r.Intn(n)` uses rejection sampling, so changing `n` from `6*ring` to
   `Slots(ring)` changes how much of the seeded stream each draw consumes.
   **Every generated interior differs from its pre-migration self.** That is
   fine — worlds reset at step 8 — but it means no generator golden output can
   be diffed for "no unintended change". Generator tests must assert
   *properties* (ring in range, slot in `[0, Slots(ring))`, belt arc
   contiguous and 40–70% of the ring), not recorded values.
2. Belt footprints grow. A belt at ring 12 covered `⌈72 × 0.4⌉ … ⌈72 × 0.7⌉`
   = 29–50 hexes; it now covers 39–67 cells of 96. Still a trivial Firestore
   document; noted so the growth is expected.

**Alternatives considered.** *Port `system/hex.go` to a polar equivalent* —
that is precisely the duplicate-type defect the handoff §8 flags; it would
re-create a second lattice implementation with its own drift surface, off the
fixture contract. Rejected outright. *Keep `system.Hex` as an alias* — see
above.

### Decision 3: One schedule source, resolved at the domain boundary and threaded down

**Choice.** Two functions, and only two:

- **`board.ProductionSchedule() polar.Schedule`** — new. Returns
  `Schedule(common.Tuning().BoardRadius)`, memoized on the radius value. The
  default for every caller that does not hold a system interior:
  `fleet`, `corporations`, `stations`, `mine`, `market`, and every
  `action.Params` decode.
- **`board.Schedule(maxRing int) polar.Schedule`** — existing
  (`board/board.go`). Used **only** where a per-system radius is
  authoritative: `system.Generate` (from `GenerationParams.Radius`),
  `system`'s fog projection and interior read (from
  `SystemInterior.Radius`).

**The discipline:** a schedule is resolved **once per operation, at the
service boundary that owns the radius**, and threaded down as the parameter
the new board signatures already demand. No function body calls
`board.Schedule(...)` or `board.ProductionSchedule()` inside a loop, and no
call site passes a literal radius.

**Why this is safe.** `board.Schedule`'s contract (its own doc comment) is
that a ring's slot count is the same under every `maxRing`, so schedules of
different radii agree wherever they overlap. `maxRing` therefore does exactly
one thing: bound the ranges of `Slots`, `RingCells`, and `BeamCells`. The two
sources already coincide by construction —
`system.DefaultGenerationParams().Radius = common.Tuning().BoardRadius`
(`system/params.go:48`), `corporations.RimRing = BoardRadius - 1`
(`corporations/params.go:37`), `stations.gateRing = BoardRadius`
(`stations/service.go:65,73`), `fleet` reads `s.params.BoardRadius`
(`fleet/travel.go:128,147`).

**The one guard that must exist.** `polar.Schedule.Slots(ring)` **panics**
above `MaxRing` (`polar/schedule.go`), and `board.Canon` calls `Slots`. So a
stored `Footprint` or `Orbit.Ring` above the live `BoardRadius` is a panic in a
read handler, not a wrong answer. Add a validating decode at the interior
boundary: reject (sentinel error, logged) any decoded feature whose ring
exceeds the schedule's `MaxRing`, rather than letting it reach `Canon`. This
is the only place a radius reduction in `tuning.go` can crash the server, and
today's hex code has no equivalent because hex `Distance` was total.

**The coordinate table is not a constraint.** `fixtures/board/coordinate-table.json`
covers slot counts `[1, 6, 12, 24, 48, 96, 192]`, and the Isotropic schedule's
final doubling is at ring 17 → 192 slots, which never doubles again. So the
table covers **every ring at every radius**; `tablePoints`' panic
(`board/table.go:56`) cannot be reached by any production schedule. No
`MaxSupportedRing` constant is needed. (Verified against the artifact, not
assumed — this is the one place the brief's caution turned out not to bind.)

**Alternatives considered.**
- *Thread a schedule through every function signature from the HTTP handler
  down* — the board signatures already do this for board calls; extending it
  to `Service` method signatures across five packages is a large diff for no
  additional safety, since the value is a process-wide constant. Rejected.
- *A package-level `var productionSchedule`* — package-level mutable state,
  banned by the Go standards, and untestable with a different radius.
  Rejected in favour of a memoized function.
- *Derive the schedule from `SystemInterior.Radius` everywhere* — most
  callers (`corporations` spawn placement, `fleet` gate projection,
  `stations` orbit derivation) do not hold an interior and would have to
  fetch one to compute a constant. Rejected.

### Decision 4: `action.Params` carries Firestore-native primitives only, enforced at `Commit`

**The bug class.** `action.Action.Params map[string]interface{}` carries
board coordinates that no compiler sees, at exactly two producers —
`fleet/service.go:331` (`"target": req.Target`, a `board.Target` struct) and
`fleet/service.go:504` (`"origin": origin`, a `board.Hex`) — and one consumer
family, `observation.paramHex` (`observation/service.go:629`), read at
`observation/service.go:209` (`echoDisc`) and `:335` (`ScanResolver`).
`paramHex` today has **two branches**: the in-memory `board.Hex` (unit tests,
same-process commits) and the `map[string]interface{}` a Firestore round-trip
produces. That dual shape is the actual defect — unit tests exercise one
branch and production the other, so a serialization mistake is invisible until
integration.

**Choice — three parts.**

1. **A codec, in `board`, as the single source of truth.** New
   `backend/board/params.go`:
   ```go
   func EncodeCell(c Cell) map[string]any            // {"ring": int64, "slot": int64}
   func DecodeCell(v any) (Cell, bool)               // accepts map[string]any with int/int64/float64
   func EncodeTarget(t Target) map[string]any        // {"cell": …} | {"featureId": …}
   func DecodeTarget(v any) (Target, bool)
   ```
   `board` owns the type, has no dependencies beyond `common` and `polar`, and
   is where the TS mirror will look when step 7 needs the same shape. These
   are Go-only helpers (see Decision 6).

2. **`Params` values must be Firestore-native.** `action.Commit`
   (`action/service.go:104`) validates `spec.Params` and returns a new
   sentinel `action.ErrNonPrimitiveParam` for anything outside the allowlist:
   `nil`, `string`, `bool`, `int`, `int64`, `float64`, `[]string`,
   `[]int64`, `[]float64`, `[]any`, `map[string]any` (recursively). A domain
   struct — `board.Cell`, `board.Target`, or anything future — is **rejected
   at commit**, at runtime, in every test that commits.

3. **`observation.paramHex` collapses to `board.DecodeCell`**, losing its
   in-memory branch. Its tests must then encode the way production does,
   which is the point.

**Why the validator and not a lint script.** The repo's established mechanism
for compiler-invisible invariants is a textual `/check` guardrail
(`check-transcendental.sh`, `check-mirror-map.sh`), and a
`check-params-cells.sh` would fit that pattern. But a runtime validator is
strictly stronger: it makes the class of bug **impossible** rather than
**findable**, it fires in every existing unit test that commits an action
(no new CI wiring, no new script to keep in sync with `Params:` literal
syntax), and it produces a named sentinel error a developer can act on. A grep
script can be defeated by a helper variable; the validator cannot.

**Cost, measured against the four live `Params:` literals.**
`fleet/service.go:331` and `:504` are the two that must change.
`fleet/travel.go:103` (`{"dest": string, "route": []string}`) and
`mine/service.go:231` (`{"featureId": string, "kind": string, "tons": float64,
"rate": float64, "startTons": float64}`) already comply — verified by reading
each. So the allowlist was designed against the actual call sites, not
speculatively. `galaxy/generator.go:33` and `galaxy/seed.go:50` are a
different `Params` type (generation parameters) and are out of scope.

**Alternatives considered.**
- *Codec only, no validator* — closes the two known sites and nothing else;
  the next developer who puts a struct in `Params` reintroduces the exact bug
  the migration just paid to find. Rejected as the primary, kept as the
  fallback if the orchestrator wants to down-scope (say so explicitly; do not
  drop it silently).
- *A typed `ParamKey` registry / typed `Params` struct per action type* — the
  right long-term shape, but it restructures the action spine, which handoff
  §4 explicitly lists as untouched by this migration, and would land in the
  middle of a compile-restoration sweep. Rejected as scope; recorded as a
  follow-on.
- *A `check-params-cells.sh` textual guardrail* — see above; weaker, more
  moving parts. Rejected.

### Decision 5: Rim-ring spawn placement asks the schedule and drops the enumeration

**Choice.** `corporations/service.go:474` becomes:

```go
func (s *Service) rimCell(accountId string, sched polar.Schedule) board.Cell {
    slots := sched.Slots(s.params.RimRing)
    slot := int(uint64(seedFromAccount(accountId)) % uint64(slots))
    return board.Cell{Ring: s.params.RimRing, Slot: slot}
}
```

No `RingCells` call. `board.RingCells(15, sched)` would allocate 96 cells to
index one; asking `Slots(ring)` and taking the modulus is the same answer with
no allocation, and it reads as what it is — a discretized, account-seeded
choice over the ring's finite slot set, which is precisely the pattern
`cross-stack-determinism`'s discretized-choice requirement blesses. No float
enters. `RingCells` stays for callers that genuinely enumerate
(`beltFeature`).

**Signature.** `SeedFleet(ctx, systemID, corporationID string, at board.Cell)`
across `corporations/service.go:35` (the interface), `fleet/service.go:59`
(the interface), and `fleet/service.go:429` (the impl). Its core guard
`if at == (board.Hex{})` (`fleet/service.go:432`) becomes
`if at == (board.Cell{})` — `board.Cell{}` is `{Ring:0, Slot:0}`, exactly the
core, so the guard's meaning is preserved verbatim.

**Two stale comments to fix while here** (both are wrong today, and both will
be read as authoritative by the next person):
- `corporations/params.go:21,37` say `RimRing` is "one hex inside the
  lane-gate ring". It is not. `GateRing(16) = 13` (`board/gate.go:16`,
  radius − 3), and `RimRing = 15`. `RimRing` is one ring inside the **rim**,
  three rings **outside** the gate ring. Correct the wording; do not change
  the value.
- `stations/service.go:49-52` names its field `gateRing` and assigns
  `common.Tuning().BoardRadius` to it (`:65`, `:73`); `DeriveOrbit`'s
  parameter carries the same misnomer (`stations/placement.go:22`). It is the
  **board radius**. Rename the field and parameter to `boardRadius`. The
  behaviour (`span := boardRadius - 1`) is unchanged; only the lie goes.

**Alternatives considered.** *Keep `RingCells` + index* — mechanically
identical output, wasteful, and it invites the reader to think the enumeration
order is load-bearing when only the count is. Rejected. *Place the hull by
angle-from-a-bearing* — introduces a float into a placement decision, against
the seam. Rejected.

### Decision 6: `board.Within` is added (Go-only) so fog coverage stops paying for an unbounded BFS

**The measurement.** `board.Distance` (`board/board.go`) is a breadth-first
walk with **no radius cutoff** — it expands until it finds the target, so
answering "is this within 3 hops?" costs a near-full-board BFS whenever the
answer is *no*, which is the common case. Measured on this repo's schedule at
`BoardRadius = 16` (1,027 cells), Go 1.24, arm64:

| Pattern | Cost |
|---|---|
| One fog read: 15 features × 3 discs (one echo disc at radius 16) | **2.4 ms** |
| One `AmbientWrites`: 40-cell burn path × 15 features at radius 3 | **54 ms** |

`AmbientWrites` (`observation/service.go:485`) is called from
`BurnResolverWithAmbient` (`fleet/resolver.go`) and its output is applied in
the resolve transaction. **54 ms of CPU on the burn-resolution path, inside a
Firestore transaction window, is not acceptable** — and it is a pure
consequence of swapping an O(1) hex arithmetic distance for a graph metric.
The hex incumbent cost microseconds.

**Choice.** Add one function to `backend/board/`:

```go
// Within returns every cell at most radius hops from center under the
// lattice hop metric — the set form of Distance's "within N" rule.
func Within(center Cell, radius int, s polar.Schedule) map[Cell]bool
```

implemented as the *bounded* form of the BFS `Distance` already runs, so both
are generated by the same `neighbors` enumeration and the same
`polar.IsAdjacent` predicate. Then `observation.Coverage` materializes each
disc **once at construction** (`NewCoverage`, `NewCoverageWithOccluders`,
`WithDisc` — `observation/service.go:108,118,129`) and `Covers`
(`observation/service.go:136`) becomes a set lookup plus the LOS check.
Cost per disc: one bounded BFS (43–55 cells at radius 3, ~1,027 at radius
16); cost per feature: O(1) plus LOS. `sweptCovers`
(`observation/service.go:611`) does the same — one disc per path cell,
materialized once, unioned.

**Why this respects the fixture boundary.** `Within` is a **Go-only** helper:
the client never computes fog (fog is server-side only, "no ship-and-hide"),
so there is no TS mirror and no fixture family. `fixtures/board/mirror-map.json`
already carries a `goOnly` list (`["containsCell", "loadTable"]`) for exactly
this case; `Within` joins it. **`cases.json` and the coordinate table are not
touched — no re-record.** Its correctness is pinned by a table-driven test
asserting `Within(c, r, s) == {x : Distance(c, x, s) ≤ r}` over a bounded
sweep, which ties it to the already-recorded `distance` family rather than
inventing a second metric.

**Alternatives considered.**
- *Leave `Distance` per-query and accept the cost* — 54 ms inside a Firestore
  transaction on the hottest write path. Rejected on the measurement.
- *Ring pre-filter only* (`|Δring| > radius ⟹ not covered`, exact because a
  hop changes ring by at most 1) — free and correct, but it does nothing for
  the radius-16 echo disc where every ring is in range, and it only halves the
  ambient case. **Keep it as an additional cheap guard inside `Within`**, but
  it is not the fix.
- *Add `board.Disc(...)` returning `[]Cell` with its own fixture family* —
  a family addition re-records `cases.json`, which this change is forbidden to
  do. Rejected.
- *Export `board.Neighbors` and put the BFS in `observation`* — `neighbors` is
  currently a **mapped mirror pair** in `fixtures/board/mirror-map.json`
  (`pairs`, alongside the TS side), so exporting it renames a mapped symbol
  and drags the TS mirror into this change. A `goOnly` addition does not.
  Rejected.

This is the **one sanctioned edit to `backend/board/`** in this change, and it
is purely additive: it changes no recorded value and no existing signature.

### Decision 7: `AmbientRadius` keeps the value 3; the wording changes, the number does not

**The question.** `AmbientRadius = 3` (`common/tuning.go:124`, commented
"hexes") was a hex-ring radius. `board.Distance` is now a graph metric on a
schedule whose slot widths vary by band, and it can route inward through
coarser rings. Is 3 still the right number?

**Measured, on the production schedule at radius 16:**

| Fact | Value |
|---|---|
| Hex disc of radius 3 | 37 cells |
| Polar disc of radius 3 around `{1,0}` | 43 cells, rings 0–4 |
| … around `{3,0}` | 43 cells, rings 0–6 |
| … around `{8,0}` | 55 cells, rings 5–11 |
| … around `{15,0}` | 35 cells, rings 12–16 |
| `d({3,0},{3,12})` (opposite, 24-slot ring) | 6 — identical to hex |
| `d({8,0},{8,24})` (opposite, 48-slot ring) | 14 |
| `d({5,0},{8,0})` (3 rings radial) | 3 |
| Tangential hop worth, rings 5 / 8 / 15 | 0.65 / 1.05 / 0.98 radial units |

**Conclusion: keep 3.** The disc is 35–55 cells against hex's 37 — the same
size to within the band structure — and a hop is worth 0.65–1.05 radial units
everywhere, which is what "near-square schedule" means in practice. Retuning
now would confound two variables (a geometry change and a knob change) in a
change whose only job is to restore the build, and the honest place to retune
is step 7's play test, alongside `MsPerTile` and the arc-vs-chord path-length
change.

**Two properties worth a spec'd note** (spec writer, `observation-fog-and-scan`):
1. The metric **can** route inward: `d({8,0},{8,24}) = 14`, not 16 — the walk
   descends to a coarser ring, crosses fewer slots, and climbs back, taking
   diagonal (ring-and-slot) steps. It does **not** naively hub through the
   core; the BFS finds the cheaper diagonal descent. At small radii this is
   invisible (a radius-3 disc around ring 8 spans rings 5–11 and no core).
2. Where it *could* matter — a low-ring bubble reaching across the core — the
   **LOS filter already forbids it**: the star's occlusion disc
   (Decision 1) blocks any chord passing within one radial unit of the centre.
   Range and sight are independent tests and the sight test is the binding
   one. This is a genuinely good property of the pair and should be recorded
   as such rather than rediscovered.

**Wording that must change** (the spec writer's edit, not mine — reported
here so it is not missed): `observation-fog-and-scan/spec.md` says "hex"
20 times, including "every hex within the configured ambient radius" (`:44-53`)
and "the scan's pinned emission hex" (`:57-81`); `observation/params.go:8`
says "Radius is in hexes"; `common/tuning.go:90` says "in hexes". All become
"cell" / "lattice hops". Same for `fleet-movement/spec.md` (23 hex mentions,
including `:54-55` "solved meet hex is the core `(0,0)`" → `{ring 0, slot 0}`),
`system-interior/spec.md` (`:4`, `:115`), and `corporation-spawn/spec.md`
(`:126`, `:132` "never the core `(0,0)`").

**Alternatives considered.** *Retune to 2 or 4 now* — unjustified by the
measurement and confounds the step-7 play test. Rejected. *Redefine ambient
range as radial-unit Euclidean distance on the pinned coordinate table* —
changes the bubble's shape, needs `Within`'s successor to be a geometric
query, and re-opens a metric the board capability just spec'd as the hop
metric. Rejected.

### Decision 8: The core-destination guard survives, but its justification is rewritten

`fleet/service.go:296-300` reads:

```go
// The star occupies the core (0,0). It is a body, not a destination: you can
// neither fly a fleet onto it nor dock it. Burns already route AROUND the core
// (board.RouteAround); this rejects the core as an endpoint.
if sol.MeetHex == (board.Hex{}) {
    return nil, ErrCoreDestination
}
```

`board.RouteAround` is deleted. The **behaviour** is unchanged —
`sol.MeetCell == (board.Cell{})` is still exactly "the meet cell is the core" —
but the guard's role is inverted: it is no longer a belt-and-braces check on
top of routing, it is the **only** thing keeping a fleet off the star. That is
sufficient, because a polar path reaches the core only if an endpoint is the
core (`board-tactical-math`, "A Path Reaches the Core Only If an Endpoint Is
the Core"), so rejecting the endpoint rejects the whole class. Rewrite the
comment to say that; leaving the `RouteAround` reference in place would be a
comment that lies about a deleted function.

`fleet-movement/spec.md:54-55` states this requirement in hex terms and needs
the coordinate wording updated — a spec-writer item, no behaviour change.

### Decision 9: Seed tooling and `start-area.json` need verification, not regeneration

**Verified, not assumed.** `cmd/seed/main.go` contains zero references to
`board`, `Hex`, or `system.` (grep returns nothing across all 106 lines).
`frontend/public/galaxy/start-area.json` has schema
`{id, seed, bounds, systems, lanes, worldTime}`; a system carries
`coords{x,y,z}` (galaxy-tier, not board), `name`, `region`, `tier`, and
`skeleton.bodies[]` of `{type, ring}` — **ring only, no angular index** — and
a lane carries `{id, aId, bId}`. The substring `"q"` as a key appears nowhere
in the file (28 systems checked).

**Therefore:** no regeneration, and no frontend impact from this artifact.
The task is a **verification** task with a stated assertion (`cmd/seed` builds
and `make seed` / `cmd/seed start-area` run green after the sweep; the
regenerated artifact is byte-comparable in schema to the committed one), so
that the "step 6 didn't touch the seed" claim is checked rather than believed.

`SeedFleet` remains spawn's placement primitive and takes a `board.Cell`
(Decision 5); the `/dev-seed` route retired at M9 and does not return.

### Decision 10: "Slot" is disambiguated by convention now, renamed by a separate change later

**The collision.** `slot` now means two unrelated things: a **lattice slot**
(`board.Cell.Slot`, `Schedule.Slots(ring)`, serialized as `"slot"` in every
fixture and on the wire) and an **action channel slot**
(`action.SlotMovement` / `action.SlotSensor`, `action/model.go:41-42`;
`CommitSpec.Slot`, `:152`; `Action.Slot`, `:82`).

**Choice, in two parts.**

1. **Convention, adopted in this change.** Unqualified "slot" means a lattice
   slot. The action concept is *always* written "action channel", "movement
   channel", "sensor channel" — never a bare "slot" — in code comments, commit
   messages, and this change's prose. This costs nothing and is enforceable by
   review.
2. **Rename, as a separate change.** `action.SlotMovement` → `ChannelMovement`,
   `SlotSensor` → `ChannelSensor`, `CommitSpec.Slot` → `.Channel`,
   `Action.Slot` → `.Channel` (plus its `firestore:"slot"` tag, which is a
   stored-shape change and therefore free only while the world reset window is
   open). File it now, land it separately.

**Why the code already agrees.** `action/model.go:35` and `:80` both already
gloss the field as "its channel"; the root `CLAUDE.md` calls them "two action
**channels**". Only the identifiers and two spec capabilities
(`mine-extraction/spec.md:17,32,104,123,133,145,151`,
`goods-sale/spec.md:142`) still say "slot".

**Why not in this change.** A cross-cutting rename through `action`, `fleet`,
`mine`, plus two spec capabilities the spec writer owns, mixed into a
compile-restoration sweep, produces a diff nobody can review and blocks the
SDET's acceptance suite behind unrelated churn. The migration's own reviewability
is worth more than closing the collision one change earlier.

**Alternative considered.** *Rename the lattice concept instead* — impossible:
"slot" is spec-pinned in `board-tactical-math`, serialized as `"slot"` in
`fixtures/board/cases.json`, `fixtures/polar/cases.json` and the coordinate
table, and mirrored in `frontend/lib/board/`. Rejected.

### Decision 11: The determinism register is re-anchored as a gated, self-verifying final step

**State.** `fixtures/determinism-register.json` holds **13 open entries across
6 files**, all in consumer packages this change moves code in:

| File | Entries | Checks bridged |
|---|---|---|
| `backend/fleet/routing.go` | 1 (lines 187, 196) | cross-target, sqrt-pinning, transcendental-drift |
| `backend/galaxy/generator.go` | 1 (lines 83, 131, 134–136, 224) | cross-target, transcendental-drift |
| `backend/system/generator.go` | 4 (lines 88, 90, 186, 238) | cross-target |
| `backend/corporations/siteselection.go` | 2 (lines 54, 159) | cross-target |
| `backend/market/provisioning.go` | 2 (lines 35, 38) | cross-target |
| `backend/mine/service.go` | 2 (lines 187, 224) | cross-target, transcendental-drift |
| `backend/fleet/service.go` | 1 (line 117) | transcendental-drift |

Every referenced defect doc is still `**Status:** open`, so **every entry must
be kept**. Line numbers are load-bearing by the register's own contract ("if a
site drifts, the consulting check fails until the entry is updated").
`backend/galaxy/generator.go` is the only one this change does not edit — but
it is listed so the sweep proves it did not move it.

**Choice.** Re-anchoring is the **last task**, explicitly gated on
`go build ./...` being green, and it is verified by the checks themselves
rather than by inspection:

1. The build must be green first. While the module does not compile,
   `check-fma-contraction.sh` inspects no compiled output and reports **zero
   sites** — a false pass, already noted in the rewrite change's design.
   Re-anchoring before green would write meaningless numbers.
2. Run `.claude/scripts/check-fma-contraction.sh` and
   `.claude/scripts/check-transcendental.sh`. Each **fails** on a drifted
   entry and names the site. That failure list is the worklist.
3. Update each entry's `checks` line numbers to the reported sites. Keep each
   entry's `site` field carrying **function name and expression**, not only a
   line number, so a future drift is re-locatable by grep — several entries
   already do this (`fleet.legMs (routing.go:187) / fleet.laneLength
   (routing.go:196)`); bring the rest up to that standard while editing.
4. Re-run both checks; **both green, and zero new entries added.** A new entry
   would mean the sweep introduced a float path into a rule-bearing value —
   that is a stop-and-escalate, not a register append.

**The acceptance criterion is "no new entries."** The migrated code must not
compute a cell from an angle, use `math.Sqrt` on a placement decision, or
introduce a `math.Round` into a persisted value. Every placement decision in
this change is an integer modulus or an `r.Intn` over a schedule count
(Decisions 2 and 5) precisely so this holds.

### Decision 12: `mine` and `market` are one-line changes and stay that way

`mine/service.go:151-153` and `market/service.go:495-498` use exactly
`board.StateAt`, `board.ModeDocked`, and `.Docked.ParentId`. The only change is
threading a schedule into `StateAt` (Decision 3). Neither package gains a
geometric concept, and neither should: `market`'s two-phase transaction
composition and `mine`'s delta fold are untouched by the lattice. Resist any
temptation to "improve" them while the file is open — they are the last
packages in the sweep and the first place scope creep would go unnoticed.

One behaviour note to carry into the mine tests: a mine command naming a
**station** is rejected with its own reason (M11), and the station's cell now
comes from `sched.Slots(ring)` (Decision 2) — so the station-dock and
station-not-mineable tests need their coordinates re-derived, not merely
re-typed.

## Risks / Trade-offs

- **[Fog-read latency: `board.Distance` is O(cells), not O(1)]** — measured
  2.4 ms per fog read and **54 ms per `AmbientWrites` inside the burn resolve
  transaction** at the current board size. → Decision 6 (`board.Within`,
  materialize each coverage disc once). This is the change's single largest
  non-mechanical risk and the reason Decision 6 is not optional. **Verification
  gate:** re-run the same measurement after the observation port and record
  it; `AmbientWrites` must land under 5 ms.

- **[The star's shadow silently widens]** — Decision 1's occlusion disc is a
  real gameplay change (a one-cell sliver becomes a one-radial-unit cone) that
  no test currently pins and no spec sentence currently describes. → Flagged
  to the spec writer as MODIFIED behaviour in `observation-fog-and-scan`, with
  an explicit acceptance scenario ("two cells on opposite sides of the core
  cannot see each other").

- **[Generator output is unreproducible against its own history]** — changing
  `r.Intn`'s bound changes stream consumption (Decision 2), so no
  pre-migration interior can be diffed. → Generator tests assert *properties*
  (ring in range, slot in `[0, Slots(ring))`, belt arc contiguous and 40–70%
  of the ring), never recorded values. Safe only because worlds reset at step
  8; if that decision were ever revisited, this is the blocker.

- **[A stored ring above the live `BoardRadius` panics a read handler]** —
  `polar.Schedule.Slots` panics above `MaxRing`, and `board.Canon` calls it,
  so a `tuning.go` radius *reduction* turns stored features into 500s rather
  than wrong answers. → Decision 3's validating decode at the interior
  boundary. Low likelihood, high blast radius, cheap guard.

- **[The `action.Commit` validator breaks a test nobody expected]** —
  Decision 4 rejects domain structs in `Params` at runtime, and some test may
  be passing one. → That is the validator working; each such test is a real
  instance of the bug class. Budget for a handful of test fixes and treat each
  as a finding, not friction.

- **[Mock staleness]** — `system/dao_mock.go`, `fleet/dao_mock.go`, and
  `observation/dao_mock.go` carry board types in generated signatures.
  Per `backend/CLAUDE.md:96`, a stale mock "compiles but lies". → `make
  generate` is an explicit, ordered task after each package's interfaces
  settle, not a cleanup at the end.

- **[Overlap with `revise-scan-instant-and-emission` and `add-endless-galaxy`]**
  — both touch visibility/scan semantics this change ports. → Contact points,
  named so the coordination is concrete rather than a general warning:
  `observation.echoDisc` (`observation/service.go:188-212`, the scan-front
  radius and the `origin` param), `observation.buildScan`
  (`:392`, the LOS-filtered mint), `observation.scanOrigin` (`:560`, the legacy
  fallback), and `Coverage`'s constructors (`:108-134`, whose signature changes
  in Decision 1). If the scan revision lands first, `scanOrigin` and the
  legacy `paramHex` fallback may disappear entirely and this change's
  observation port shrinks. Coordinate at apply time; do not pre-absorb.
  `add-endless-galaxy` touches the galaxy graph tier, which this change must
  not leak into.

- **[Repo stays red for the frontend and e2e throughout]** — accepted, carried
  from the previous change. This change's definition of done is
  `go build ./...`, `go vet ./...`, `make test`, the emulator integration
  suites, and both determinism checks. `check.py`'s full gate and the
  Playwright slice e2e return green only after step 7.

- **[Pre-existing defect made louder, not fixed]** — a moon has
  `ParentId` and no `Orbit`, and its footprint is the sentinel
  `[]Hex{{Q:0,R:0}}` (`system/generator.go:73`), so
  `observation.featureGeomHexAt` resolves every moon to the **core**. Under
  polar the core is where the star's occluder now sits, which makes the
  sentinel's wrongness far more visible even though the observable behaviour
  is unchanged (an occluder never shadows its own cell —
  `board/visibility.go:66-69` skips `dotPD >= d2`, so a moon at the core stays
  visible exactly as on hex). → **Out of scope. Port the sentinel as-is**,
  and file it: the honest fix is a "no board position" signal, not a
  coordinate. Recorded so the next reader does not mistake it for migration
  damage.

## Migration Plan

Strict dependency order, compiler-guided. Each step ends green for its own
package's `-short` tests before the next begins; the build as a whole is red
until step 5.

**Step 0 — Contract first (this is what the SDET consumes).**
Land the shapes every other step depends on, so the acceptance suite can be
written against them before either developer starts:
`board/params.go` (Decision 4's codec), `board.ProductionSchedule` and
`board.Within` (Decisions 3, 6) with its `goOnly` entry in
`fixtures/board/mirror-map.json`, `action.ErrNonPrimitiveParam` and the
`Commit` validator (Decision 4), and the final signatures of
`FeatureGeom.OcclusionRadius2` (Decision 1), `SeedFleet(… at board.Cell)`
(Decision 5), and `Feature.Footprint []board.Cell` (Decision 2). No logic —
signatures, sentinels, and the codec. `board` and `action` compile green here.

**Step 1 — `system` (+ `stations`).**
Delete `system/hex.go`. `Feature.Footprint []board.Cell`. Generator placement
onto `sched.Slots(ring)` (`generator.go:118,130,171,208`).
`fog.go:112-119` `featureCellAt`. `fog_source.go:42` anchor +
`occlusionRadius2` (Decision 1). `gates.go:21,64` → `LaneGate.Cell` /
`board.LaneGateCell`. `stations/placement.go:37` and `service.go:199` onto the
schedule; rename `gateRing` → `boardRadius` (Decision 5). Interior decode
guard (Decision 3). `make generate` for `system/dao_mock.go`.

**Step 2 — `fleet`.**
`SolveHex` → `SolveCell`, `MeetHex` → `MeetCell`, `Target.Hex` →
`Target.Cell`, `LaneGateHex` → `LaneGateCell`, thread the schedule
(`service.go:288,291,299,567`; `travel.go:128,134,147`).
`featureAnchor` (`service.go:620-624`) collapses to `f.Footprint[0]` — same
type now. `SeedFleet` signature (`:59,429,432`). `Position` returns
`board.Cell` (`:62,567`). `handler.go:238,289` and `model.go:93` wire shapes.
`resolver.go:16` `AmbientRecorder.AmbientWrites(… path []board.Cell …)`.
**Convert both `Params` literals** through `board.EncodeCell` /
`board.EncodeTarget` (`service.go:331,504`) — the validator from step 0 makes
a miss a test failure, not a silent Firestore surprise. Rewrite the
`ErrCoreDestination` comment (Decision 8). `make generate` for
`fleet/dao_mock.go`.

**Step 3 — `observation`.**
`model.go:109,155,169,182` (`Anchor *board.Cell`, `FleetPos.Cell`,
`FeatureGeom.Anchor` + `OcclusionRadius2`). `Coverage` on `[]board.Occluder`
and materialized discs (`service.go:96-140`, Decision 6). `occluders`
(`:587`), `featureCellAt` (`:602`), `sweptCovers` (`:611`). `MintScan`
(`:358`), `buildScan` (`:392,398`), `AmbientWrites` (`:485`), `scanOrigin`
(`:560`), `echoDisc` (`:209`). `paramHex` (`:629`) collapses to
`board.DecodeCell` and its tests move to production encoding.
`make generate` for `observation/dao_mock.go`.
**Measure `AmbientWrites` here** against the risk gate (< 5 ms).

**Step 4 — `corporations`.**
`service.go:35` interface, `:474` `rimCell` (Decision 5), `params.go:21,37`
comment fix.

**Step 5 — `mine` / `market`.**
Thread the schedule into `board.StateAt` (`mine/service.go:152`,
`market/service.go:497`). Re-derive station coordinates in the dock/not-mineable
tests. **`go build ./...` is green from here.**

**Step 6 — Verification sweep.**
`go vet ./...`; `make test`; emulator integration suites
(`go test ./...`); `cmd/seed` + `make seed` + `cmd/seed start-area` run green
and the artifact's schema is unchanged (Decision 9).

**Step 7 — Determinism register (gated on step 5 being green).**
Run both determinism checks, re-anchor the 13 entries from their failure
output, re-run, assert green with **zero new entries** (Decision 11).

**Rollback.** Revert the change. No deploy, no stored-data migration — the
world reset is step 8 of the parent migration and is independent of this
change. Nothing here is forward-only.

## Frontend Wire-Shape Handoff

Everything below is verified against the Go handlers/models named, and against
`frontend/lib/types/{fleet,action,system-board}.ts` as they stand today. Step
7 (the renderer change) absorbs all of it. `frontend/lib/board/` **already**
exports the correct TS shapes (`Cell`, `Target{cell?}`, `Burn{path: Cell[]}`,
`BoardLeg{path: Cell[]}`, `LaneTransit{entryGate: Cell}` —
`frontend/lib/board/board.ts:28`, `movement.ts:23,29-30,45-46,55-61`), so the
work is re-pointing the three `lib/types/*.ts` files from `@/lib/hex` to
`@/lib/board` and following the 47 importers.

**The universal transform:** every `{ "q": int, "r": int }` becomes
`{ "ring": int, "slot": int }`. `Orbit` (`{ring, angle0, period, dir}`) is
**unchanged in shape** — it was already polar; `angle0` was a ring-position
index and is now a slot index, same field, same meaning.

### `GET /v1/systems/:id` — `system/handler.go:143` `interiorDTO`

| JSON path | Before | After | Source |
|---|---|---|---|
| `features[].footprint[]` | `{q,r}[]` | `{ring,slot}[]` | `system/fog.go:22` `fogFeatureDTO.Footprint` |
| `features[].orbit` | `{ring,angle0,period,dir}` | **unchanged** | `system/model.go:81` |
| `laneGates[].hex` | `{q,r}` | **key renamed** → `laneGates[].cell`, `{ring,slot}` | `system/gates.go:21` |
| `radius`, `character`, `starClass`, `band`, `live`, `asOf`, `resources`, `effects` | — | **unchanged** | — |

TS: `SystemBoard`, `BoardFeature.footprint: Hex[]` → `Cell[]`,
`LaneGate.hex: Hex` → `LaneGate.cell: Cell`
(`frontend/lib/types/system-board.ts`, and its `board.LaneGateHex` doc
reference → `board.LaneGateCell`).

### `GET /v1/fleets`, `GET /v1/fleets/:id` — `fleet/handler.go:232` `fleetDTO`

| JSON path | Before | After | Source |
|---|---|---|---|
| `position` | `{q,r}` | `{ring,slot}` | `fleet/handler.go:238` |
| `state.burn.path[]` | `{q,r}[]` | `{ring,slot}[]` | `board/ship.go` `Burn.Path` |
| `state.burn.target.hex` | `{q,r}` | **key renamed** → `state.burn.target.cell`, `{ring,slot}` | `board/ship.go` `Target.Cell` |
| `state.burn.target.featureId` | — | **unchanged** | — |
| `state.coast` | `{ring,angle0,period,dir}` | **unchanged** | `board/orbit.go` |
| `state.docked.parentId` | — | **unchanged** | — |
| `state.laneTransit.boardLeg.path[]` | `{q,r}[]` | `{ring,slot}[]` | `board/ship.go` `BoardLeg.Path` |
| `state.laneTransit.entryGate` | `{q,r}` | `{ring,slot}` | `board/ship.go` `LaneTransit.EntryGate` |
| `state.laneTransit.route`, `legEtas`, `departTime`, `arriveTime`, `laneIds` | — | **unchanged** | — |
| `state.laneHold.{from,to,fraction}` | — | **unchanged** (graph tier, `fraction` stays a float) | `board/ship.go` `LaneHold` |
| `roster`, `own`, `worldTime` | — | **unchanged** | `fleet/handler.go:246-249` |

TS: `Fleet.position: Hex` → `Cell`; `MovementState` and its nested shapes
re-imported from `@/lib/board` (`frontend/lib/types/fleet.ts`).
**Note for step 7:** a foreign fleet's `state` is still stripped to
`{mode}` only (`fleet/handler.go:294-297`) — audience fog is unchanged by the
migration.

### `POST /v1/fleets/:id/orders` — request body, `fleet/model.go:80` `OrderRequest`

| JSON path | Before | After |
|---|---|---|
| `target.hex` | `{q,r}` | **key renamed** → `target.cell`, `{ring,slot}` |
| `target.featureId`, `systemId` | — | **unchanged** |

### `GET /v1/fleets/:id/route` — `fleet/model.go:88` `RoutePreview`

| JSON path | Before | After |
|---|---|---|
| `departGate` | `{q,r}` | `{ring,slot}` |
| `route`, `legEtas`, `totalEta`, `worldTime` | — | **unchanged** |

TS: `RoutePreview.departGate: { q: number; r: number }` →
`Cell` (`frontend/lib/types/fleet.ts` — note it currently inlines the shape
rather than importing `Hex`; import `Cell` instead).

### `GET /v1/actions`, `POST /v1/actions/:id/*` — `action` DTO `params`

| JSON path | Before | After | Source |
|---|---|---|---|
| `params.origin` (scan) | `{q,r}` | `{ring,slot}` | `fleet/service.go:504` |
| `params.target` (burn) | `{hex:{q,r}}` or `{featureId}` | `{cell:{ring,slot}}` or `{featureId}` | `fleet/service.go:331` |
| `params.systemId`, `dockOnArrive`, `dest`, `route` | — | **unchanged** | `fleet/service.go:331,504`, `travel.go:103` |
| `params.{featureId,kind,tons,rate,startTons}` (mine) | — | **unchanged** | `mine/service.go:231` |

TS: `GameAction.params.origin?: Hex` → `Cell`; `params.target?: Hex` →
`Target` (it is currently typed as a bare `Hex`, which is already wrong —
the backend puts a `Target` there, not a coordinate. Fix while converting.)
(`frontend/lib/types/action.ts`.)

### Not on the wire — do not chase

- `observation.FeatureObservation.Anchor` and `FeatureMemory.Anchor`
  (`observation/model.go:109,155`) change from `*board.Hex` to `*board.Cell`
  in **storage only**. `system/fog.go`'s `projectFogged` renders geometry from
  the raw interior's `Footprint`, never from the memory's anchor, so no DTO
  carries it.
- SSE payloads carry no board coordinates (`grep 'board\.' backend/sse/`
  returns nothing) — SSE broadcasts action-completion envelopes keyed on
  scope. No renderer change from realtime.
- `frontend/public/galaxy/start-area.json` — no board coordinates (Decision 9).
  No change.
- Galaxy-tier reads (`components/galaxy/`) — the migration must not leak into
  the graph tier, and does not.

### Frontend capability naming

`openspec/specs/hex-board-view/spec.md` (32 hex mentions) is the frontend
board capability and will need renaming plus a full coordinate rewording. That
is **step 7's** spec work, not this change's — named here only so it is
scheduled rather than found.

## Open Questions

- **`AmbientRadius` after the play test** (owner: Travis, at step 7). Kept at
  3 here on the measurement in Decision 7. The value that actually wants
  attention at step 7 is `MsPerTile` — arc paths are materially longer than
  chords — and `AmbientRadius` should be reconsidered only in that same
  session, with the renderer up, so the two are tuned against one another
  rather than in isolation.

- **Does the star's widened shadow need a gameplay counterweight?** (owner:
  Travis / spec writer). Decision 1 makes the far side of the core genuinely
  dark for the first time. That is arguably the point — it creates real
  positional value — but it also means a corp scanning from ring 3 can never
  see the opposite inner system without moving. Whether that is a feature or a
  frustration is a play question, not an architecture one; it is raised here
  because the migration is what creates it.

- **Does `action.Slot` → `action.Channel` land before or after the world
  reset?** (owner: orchestrator). The field carries `firestore:"slot"`, so
  renaming the stored tag is free only while the reset window is open
  (migration step 8). If the rename slips past the reset it becomes a data
  migration for a naming fix, which is not worth it — at which point the
  honest answer is to rename the Go identifiers and leave the Firestore tag
  alone. Decide the ordering, not the rename.

- **`board.Within`'s eventual home.** Decision 6 lands it as a `goOnly`
  helper to avoid a fixture re-record. If the client ever needs to reason
  about hop discs (a range indicator, a move-preview radius), it becomes a
  mirrored pair and earns a fixture family. Recorded so that promotion is a
  decision rather than a drift.

- **The moon core sentinel** (owner: spec writer, follow-on change). A moon's
  `[]Cell{{0,0}}` footprint means "position is derived from the parent", which
  the code expresses as "the core". Not migration damage, not fixed here —
  see the last Risks entry.

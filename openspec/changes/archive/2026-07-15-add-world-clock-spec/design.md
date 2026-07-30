## Context

`world-clock` is the foundational time primitive of the backend: every
kinematic and effectful capability that already exists — `action-dispatch`
(commit-time ETA, `remaining(T)` delta folds), `fleet-movement` (departure /
`arriveTime` stamps, the `StateAt` effective-state fold),
`observation-fog-and-scan` (`asOf` observation stamps, `ScanDuration`),
`board-tactical-math` (orbital phase at a world time) — reads its notion of
"now" through this one clock and stores stamps in its units. Those baselines
already reference "world time" and `WorldMillis` as a given; this change
finally baselines the primitive they all cite. It is small but sits under
every other capability, so a short design.md is warranted even though the
change is documentation-only.

Source of truth: `backend/common/worldtime.go` (+ `worldtime_test.go`,
`config.ServiceConfig.WorldTimeScale` in `backend/config/config.go`).

## Goals / Non-Goals

**Goals:** baseline the as-built clock accurately — the scaled formula, the
distinct `WorldMillis` type, the process-wide singleton, the injectable
constructor tests use; give the two non-testable invariants embedded in the
code comment (scale immutability, "no bare `time.Now()` in domain code") a
home that is honest about their nature.

**Non-goals:** no code change; no change to the epoch, the scale-clamp
behavior, or the singleton pattern; this change does not add a runtime guard
for either invariant below.

## Decisions

### One scaled clock is the sole time source

`worldTime(t) = (wallNow − worldEpoch) × scale`, expressed in `WorldMillis`
(a named `int64`, deliberately not interchangeable with wall-clock
unix-millis). `scale` warps sim speed vs. wall time — prod runs at 1, dev/test
run fast so an hour-long burn resolves in seconds. `FromWall(t)` exposes the
same formula for an arbitrary instant, which is what makes the clock a pure
function of its (epoch, scale) and therefore testable.

### Fixed epoch, not configuration

The epoch is a hard-coded constant (`2026-01-01 UTC`), not a config value.
Alternative considered: config-driven epoch. Rejected — the epoch is a pure
coordinate origin with no operational reason to vary, and making it
configurable adds a second dial that, if it drifted between deploys, would
silently reinterpret every stored stamp exactly as a scale change would (see
below). One less thing to get wrong. It is chosen far enough in the past that
`Now()` is always positive for any live world.

### Non-positive scale clamps to 1

`NewWorldTime` substitutes `scale = 1` for any `scale ≤ 0` rather than
constructing a clock that stands still or runs backward. A backward or frozen
clock would violate the monotonicity every consumer's fold assumes; clamping
fails safe to real time.

### Process-wide singleton, injectable constructor

`WorldClock()` lazily builds one instance (via `sync.Once`) from the fixed
epoch and `config.ServiceConfig.WorldTimeScale`, so all domain code in a
process shares one "now". `NewWorldTime(epoch, scale)` is a standalone
constructor independent of that singleton, so tests inject a fake or a
differently-scaled clock without touching global state or real wall time.
Alternative considered: passing a `WorldTime` dependency through every
constructor instead of a singleton. The repo's as-built choice is the
singleton for production reads plus injection at the test seam; this baseline
documents that, it does not relitigate it.

### Two invariants that are operational, not enforced

Both live in the code as comments and are honest about being unenforceable at
runtime. They get different treatment in the spec because one has an
observable consumer-side behavior a scenario can name and the other does not:

1. **Domain code reads `WorldClock()`, never `time.Now()`.** This is an
   architectural constraint on *consumers* of the clock, not a behavior of
   the clock itself; the clock cannot enforce it. It is kept as a `SHALL`
   in the "Scaled World Time" requirement — it is the exact invariant this
   baseline exists to protect, and it names a concrete, reviewable action
   (which function a line of code calls) — but it is verified by code
   review / convention, not by the primitive or by any runtime check, and
   the requirement says so explicitly.
2. **Scale is fixed for the life of a world that holds data.** Every stored
   `WorldMillis` is only meaningful relative to the scale it was written
   under; changing scale retroactively reinterprets the real-time meaning of
   every existing stamp. Dev/test worlds are disposable, so they may change
   it freely — that is the exception, not the rule.

   The concurrent-instance case — two revisions of the same live world
   running under different configured scales during a rolling deploy — is
   the concrete, externally-inducible form of this invariant (this stack's
   Cloud Run rolling deploys / GitLab `deploy-dev`→`deploy-prod` pipeline can
   genuinely produce it), so it gets its own scenario ("Two concurrent
   instances of the same live world must share scale," under "Fixed World
   Epoch") in the same documentary style as "Administrative timestamps are
   wall-clock by design" — it names the condition and asserts that nothing
   detects it, without pretending the clock enforces anything.

   The more general, slower case — an operator manually changing config on
   a single already-running instance — is not a distinct system event a
   scenario could name (there is no request, state transition, or emitted
   event to assert against); it is documented here (Risks / Trade-offs,
   below) rather than as a spec scenario, and remains purely operator
   discipline on config.

## Risks / Trade-offs

- **Scale mutation on a live world silently corrupts time.** No runtime
  guard; mitigation is operational discipline (prod scale pinned to 1) plus
  documenting it as an invariant. This includes the rolling-deploy case
  where two revisions of the same live world briefly run under different
  configured scales — see "Two concurrent instances of the same live world
  must share scale" under the "Fixed World Epoch" requirement in
  `specs/world-clock/spec.md` — the invariant is "identical scale across
  every concurrent instance serving a world," not merely "constant over time
  within one instance."
- **Singleton reads config at first touch.** `WorldClock()`'s first caller
  fixes the scale for the process lifetime; a test that calls `WorldClock()`
  before config is set would cache the wrong scale. Mitigated by tests using
  `NewWorldTime` directly and never the singleton (the injectability
  requirement is exactly this).
- **Float multiply then truncate.** `FromWall` multiplies elapsed millis by a
  `float64` scale and truncates to `int64`; sub-millisecond rounding is
  accepted (stamps are millisecond-grained and consumers compare `≤`).
- **`Now()`'s monotonicity is not guaranteed across a backward wall-clock
  step.** `Now()` subtracts a `time.Now()` reading (carries a monotonic
  clock reading) from `worldEpoch`, which is built via `time.Date` (carries
  none). Go's `Time.Sub` falls back to wall-clock-only comparison whenever
  either operand lacks a monotonic reading, so this subtraction is not
  covered by Go's monotonic-clock protection against NTP backward steps —
  unlike the scale-clamp case above (which *is* an explicit design
  decision), this source of non-monotonicity is an unexamined consequence
  of how the epoch constant is constructed. Partially mitigated downstream:
  `action-dispatch`'s exactly-once ledger means an already-resolved action
  cannot un-resolve on a backward dip, but fold-ordering during the dip
  (`remaining(T)`, `StateAt`) is unspecified.

## Migration Plan

None — documentation-only baseline, no code or data migration.

## Open Questions

- None blocking. If a future change ever needs multiple concurrent worlds in
  one process (multi-tenant sim), the process-wide singleton becomes the
  thing to revisit — out of scope here.
- **No observability for the effective scale.** Nothing logs or exposes the
  constructed `WorldTimeScale` (or whether a non-positive value was silently
  clamped to 1) at process startup. The stated mitigation for the "scale
  mutation on a live world" risk above is "operational discipline"; that
  discipline currently has no supporting signal to audit against — an
  accidental non-1 scale in prod, or a scale drift between two revisions of
  the same live world, would be invisible until gameplay symptoms (fleets
  arriving off-schedule) surfaced. Out of scope for this documentation-only
  change. **Recommended follow-up OpenSpec change** (do not fold into this
  baseline): log the effective scale (and clamp status) once at
  `WorldClock()`'s first construction, tagged with environment, so this
  stops living only as prose here.
- **No enforcement mechanism for "scale must never change on a live
  world."** No persisted world-scale fingerprint exists anywhere in the
  codebase to compare against — only the bare `config.ServiceConfig.
  WorldTimeScale` flag (default 1, no env var currently sets it in any
  `.env*` file in the repo). This is a data-integrity gap worth naming
  plainly: every kinematic domain's correctness (fleet ETA, action
  resolution, observation `asOf`) depends on scale never drifting, and
  nothing today would catch it if it did. Out of scope for this
  documentation-only change, which baselines as-built behavior rather than
  proposing new enforcement. **Recommended follow-up OpenSpec change** (do
  not fold into this baseline): persist the scale a world was created under
  (e.g. a `worldMeta.scale` singleton doc written on first use) and fail
  process startup loudly if the configured scale disagrees with it,
  converting this from an operational invariant into a runtime-enforced
  one.

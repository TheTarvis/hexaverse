## Why

`docs/plans/continous_space/README.md` is direction-decided (2026-08-26): the
tactical layer leaves the hex/polar lattice entirely and moves to continuous
R³ — rails orbits, curved Bézier transfer burns on a brachistochrone profile,
positions as vectors. The PoC (`frontend/app/spike/space-3d/sim.ts`, 23
passing tests) proved the feel; this change is the next step the polar
migration's own sequencing rule requires — "prove determinism on a new
fixture family *before* a single consumer moves, and stop if parity does not
hold" — which is exactly what fired here: the orchestrator measured that the
README's own determinism claim was false (Go/Node last-ULP divergence on
`cos`/`sin`/`atan2`/`pow`, an arm64-only FMA hazard, iteration-count
amplification in the intercept solve, and a wholly unguarded new package),
so this change resolves the determinism question with an architecture
(Go-sole-authority, integer time, integer angles over a pinned table,
analytic velocity, fixed-count solves) before a single type is written twice.

## What Changes

- Add a new capability `space-kinematics`: vectors, hierarchical rails
  orbits evaluated closed-form from stored elements, analytic orbit and
  curve velocity, quintic-Bézier transfer burns with a brachistochrone speed
  profile, star-avoidance curve displacement, a fixed-round moving-target
  intercept solve, three idle parking modes (`orbit`/`stationkeep`/`point`)
  with body-derived station-keep upkeep, and the `StateAt`-style
  effective-state fold — all as pure functions of stored data and time, no
  accumulated per-tick state.
- Add a new Go package `backend/space/` implementing this capability, with a
  committed two-level pinned sub-turn table (`fixtures/space/turn-table.json`)
  as the sole place trigonometry executes, and a Firestore/`action.Params`
  codec (`backend/space/params.go`) mirroring `backend/board/params.go`.
- **Go is the sole authority for this capability; there is no TypeScript
  mirror.** `frontend/lib/space/`, if it exists at all, is render-only
  geometry (drawing a curve from server-solved control points, drawing a body
  from server-stored orbit elements) — it computes no arrival, no delta-v
  price, and no visibility answer. This is a deliberate departure from the
  `board`/`polar` both-languages-mirrored precedent, sanctioned by
  `cross-stack-determinism`'s existing projection exemption, and guarded by a
  new anti-mirror check rather than a mirror-map pair.
- Add a new fixture family `fixtures/space/cases.json`: byte-for-byte exact
  across the Go build-target matrix only (no JavaScript leg — there is no
  TypeScript mirror to assert against), including a pinned-randomized-sweep
  case form (seeded `splitmix64`, named input box, case count, SHA-256
  digest) for this capability's non-enumerable R³ domains.
- MODIFIED deltas against `cross-stack-determinism`: widen the golden-fixture
  requirement's trigger to also bind a rule-bearing Go-only package with no
  TypeScript mirror; add the randomized-sweep case form for non-enumerable
  domains; add a third pragma term `determinism:allow(pinned)`; state
  explicitly that designating one side authoritative for a capability means
  the other side carries no mirror, guarded by an anti-mirror check; extend
  the build-target-matrix and pinned-constant-table requirements to permit a
  Go-only fixture family with no JavaScript-runtime leg, stated as a recorded
  choice rather than an omission.
- Widen `.claude/scripts/check-transcendental.sh` to scope `backend/space/`
  (currently unguarded per finding D-4) and accept the `pinned` pragma term.
  Add an anti-mirror invocation to `.claude/scripts/check-mirror-map.sh` for
  `backend/space` ↔ `frontend/lib/space` — asserting the mirror does **not**
  exist, the inverse of every other invocation of that script.
  `.claude/scripts/check-fma-contraction.sh` needs no widening: it already
  builds the whole backend module and therefore already covers
  `backend/space/` on day one.
- **No consumer is migrated.** `backend/board`, `backend/polar`,
  `backend/observation`, `frontend/lib/board`, `frontend/lib/polar`, `fleet`,
  `action`, `system`, `galaxy`, `market`, `mine`, `corporations`, `stations`,
  and every renderer are untouched and keep running the game. The two
  tactical-math families coexist for the duration of the eventual migration
  sweep, exactly as `board` and `polar` did.
- Generation (`generateSystem`, `keplerPeriod`, `mulberry32`, `SystemDef`)
  does **not** graduate into `backend/space` — it belongs to `system`/`galaxy`
  and is out of scope. `backend/space` takes bodies through an injected
  `Bodies` interface and mints none.
- This change introduces three rule-bearing values derived from inexact
  arithmetic that resolve through the discretized-choice branch of
  `cross-stack-determinism` › *Inexact Arithmetic Is Rule-Bearing Only
  Through a Discretized, Tie-Broken Choice*, not the authority branch:
  `PhaseIndexOf` (a Cartesian offset reduced to an integer sub-turn index
  over the pinned table, ties broken by selecting the lower index), the
  star-avoidance minimum-distance scan (a curve's closest approach reduced
  to a fixed 33-sample discrete minimum, no tie-break needed since a
  minimum over exact comparisons is single-valued), and the arc-length
  parameterization search (a target arc length reduced to one of 64 fixed
  table segments by a fixed six-step binary search, ties resolved by the
  search's own fixed bracketing order). No presentation surface exists for
  any of the three: this capability has zero consumers, so there is nothing
  downstream to disclose a non-authoritative value to. Every other
  rule-bearing value this capability derives from inexact arithmetic — the
  curve's cumulative-chord length, the solved intercept's coordinates, and
  the brachistochrone flight time — resolves through the authority branch:
  Go is the authoritative side, there is no presentation surface (the
  capability has zero consumers and the render side computes none of
  these), and cross-build-target identity is established by the Go-only
  fixture family rather than by discretization.
- **Two findings the fixture sweep surfaced were resolved by amending this
  change's own artifacts rather than by re-recording a measurement** (see
  design.md's Decision 11 and 12, and tasks.md sections 3 and 9). First, the
  transfer curve is a **quintic** Bézier, not a cubic: star avoidance
  displaces only its interior control points, so both end tangents survive
  the displacement exactly and the arrival-tangency requirement holds for
  every burn rather than for the ~86% that need no avoidance. A cubic has too
  few control points for that to be possible — with both endpoints and both
  end-tangent directions fixed, only the two tangent magnitudes remain free.
  Second, the moving-target solve is **not** required to reach a fixed point:
  its round-to-round residual is measured and recorded as a pinned bound
  instead, because against a target that moves during the flight the
  iteration is not a contraction and the ceiling-quantized arrival makes an
  exact fixed point non-existent rather than merely hard to reach.

- Several tuning numbers and one tangent-alignment threshold are left as
  named, configured placeholders rather than resolved here (see design.md's
  Open Questions): the minimum burn arc length, the intercept solve's fixed
  round count, and the arrival tangent-alignment threshold — the arrival
  positional-discontinuity tolerance design.md also flagged is instead
  resolved in this change's spec as exact-by-construction (zero, not a
  measured threshold), per design.md's own recommendation. **No
  migration, backwards-compatibility, dual-write, or feature-flag work is in
  scope** — this is a solo toy with unused prod; per the design doc's ground
  rules, when consumers eventually move, the old packages are deleted, not
  bridged.

## Impact

- Affected specs: `space-kinematics` (new capability), `cross-stack-determinism`
  (MODIFIED — fixture-requirement trigger and sweep form, third pragma term,
  no-mirror statement, build-target-matrix and pinned-table allowances for a
  Go-only family)
- Affected code: a new Go package `backend/space/` (vectors, orbits, curves,
  burns, parking, the state fold, the params codec, the pinned turn table); a
  new fixture family `fixtures/space/` (`cases.json`, `turn-table.json`,
  `mirror-map.json` in anti-mirror mode); `.claude/scripts/check-transcendental.sh`
  and `.claude/scripts/check-mirror-map.sh` (widened); CI `fixtures/**` path
  filters (already family-agnostic, verified to cover the new path) and the
  `git diff --exit-code -- fixtures/` re-recording gate; the backend CI job
  itself gains new `GOARCH=amd64`/`GOAMD64=v1` (and, where an `arm64` CI
  target exists, `GOARCH=arm64`) cross-target legs for `./space/...`,
  alongside the existing `./board/` invocation — a real CI-configuration
  edit, not covered by the path-filter statement above. `backend/board`,
  `backend/polar`, `backend/observation`, `backend/fleet`, `backend/action`,
  `backend/system`, `backend/galaxy`, `backend/market`, `backend/mine`,
  `backend/corporations`, `backend/stations`, `frontend/lib/board`,
  `frontend/lib/polar`, and every renderer are explicitly **not** touched.
- Not modified but flagged: `board-view` › Move Preview From the Acting
  Fleet's Live Position assumes a client-computed preview and must be
  amended or become a server quote when the first consumer migrates.

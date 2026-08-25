## Why

`docs/handoffs/2026-08-24-polar-lattice-migration.md` is **Status: APPROVED
(2026-08-25)** — Travis chose the full polar lattice over the arc-paths-on-hex
fallback (Decision 1, settled) as the replacement for the hex board's chord
trajectories. The handoff's own sequencing (Section 9) puts the next step
before any consumer is touched: "Spike the Go side of `polar.ts` and prove
Go↔TS parity on a new fixture family *before* touching any consumer. If
parity does not hold, stop." This change is that step. It defines the polar
lattice as its own capability and pins it with a new cross-language fixture
family. It does not move a single consumer.

## What Changes

- Add a new capability `polar-lattice-math`: ring-and-slot cell coordinates,
  a parameterized (not hard-coded) slot schedule, radius-exact ring
  projection, arc paths as the lattice's straight line, the core-reachable-
  only-at-an-endpoint corollary, integer orbital advance, and the
  integer/exact-rational discipline for every rule-bearing value.
- Add a new Go package mirroring `frontend/app/spike/polar-board/polar.ts`
  and its TypeScript production mirror (both outside `backend/board` and
  `frontend/lib/hex`, which stay the incumbent hex implementation untouched).
- Add a new fixture family to a **new sibling file** (e.g.
  `fixtures/polar/cases.json`), following the `cross-stack-determinism`
  capability's both-languages-assert convention. Not `fixtures/board/
  cases.json`: that file's Go-side owner (`backend/board/fixtures_test.go`'s
  `TestFixtures_MatchGolden`) fully rewrites it from a fixed struct on
  `UPDATE_FIXTURES=1`, and this change is barred from touching any file
  under `backend/board` — extending that struct is not available to this
  change.
- This change **MUST NOT begin task 3 (cross-language fixture family)**
  until `pin-cross-stack-determinism-seam` task 5.1 (the exhaustive-sweep
  case schema) is settled — that schema is what this change's own sweep
  cases (tasks.md 3.3) follow. This change does **not** gate on
  `pin-cross-stack-determinism-seam` task 5.2 (its first proof of that
  schema, recorded on the `line` family): 5.2 is itself blocked on the
  `lerp` FMA-contraction fix
  (`docs/defects/2026-08-25-line-fma-arch-divergence.md`), a defect on the
  *incumbent hex* lattice — which this change does not touch and is
  designed to eventually replace — and no change implementing that fix
  exists yet in `openspec/changes/`. Gating this change's fixture family on
  fixing hex's `lerp` defect is a dependency chain that does not terminate
  and that nobody has argued for on its own merits; this change deliberately
  does not join it. Nor does this change gate on
  `pin-cross-stack-determinism-seam` tasks 4.4–4.6 (its own cross-build-
  target CI wiring): tasks.md task 4.5 below stands up the equivalent CI
  wiring for this capability's own package independently, exactly because
  those pin tasks are still unchecked. Tasks 1–2 (Go implementation,
  TypeScript mirror) may proceed in parallel, since they only apply an
  already-settled discipline (rational-turns integers) rather than depend on
  the pin change's still-open mechanisms.
- **No consumer is migrated.** `board-tactical-math`, `fleet-movement`,
  `observation-fog-and-scan`, `hex-board-view`, `system-interior`, and
  `corporation-spawn` are untouched by this change. The two lattices
  coexist deliberately for the duration of the migration sweep (handoff
  Section 9, steps 4–8) — landing this as MODIFIED deltas against
  `board-tactical-math` now would make `openspec/specs/` describe a lattice
  no consumer actually uses, for however long that sweep takes. The delta
  that removes `board-tactical-math`'s `Core-Avoiding Routes` requirement
  and its `routeAround` fixtures belongs to that later consumer-migration
  change, not this one.
- Decisions 2 (slot schedule), 3 (aliasing quantizer), and 5 (data
  migration) remain **open** per the handoff and are recorded verbatim as
  Open Questions in `design.md`, not resolved here. This change specs the
  interpolate-and-round realization (round-ring-then-angle, finest-ring
  sampling, the three fixed tie-breaks) as the *currently specified*
  quantizer — never a specific slot-schedule value (Decision 2 stays open).
  Decision 3 (whether a Bresenham-style two-axis quantizer supersedes
  interpolate-and-round) also stays open: adopting finest-ring sampling is
  a satisfiability fix required by this change's own adjacency clause, not
  an answer to Decision 3, and a future change is free to replace the
  quantizer wholesale.
- Propellant/delta-v (`docs/plans/propellant-and-delta-v.md`) is out of
  scope entirely; it is noted in `design.md` only as a forward dependency.

## Impact

- Affected specs: `polar-lattice-math` (new capability; no other capability
  is touched)
- Affected code: a new Go package `backend/polar/` mirroring
  `frontend/app/spike/polar-board/polar.ts`; a new TypeScript production
  mirror `frontend/lib/polar/`; a new fixture family in a new sibling file
  (e.g. `fixtures/polar/cases.json`), not `fixtures/board/cases.json`.
  `backend/board/`, `frontend/lib/hex/`, and every consumer listed in the
  handoff's Section 8 inventory are explicitly **not** touched.
- Also touched, as shared (not capability-owned) artifacts this change adds
  entries to rather than redefines: the CI pipeline config (a dedicated
  path-filter anchor gating the new polar fixture-suite jobs, mirroring
  `pin-cross-stack-determinism-seam` task 4.6's board anchor); the
  `cross-stack-determinism` capability's coverage inventory artifact (a new
  entry for any of this package's mirrored functions not covered by a
  fixture family); and `.claude/scripts/check-transcendental.sh` (tasks.md
  1.8 widens its scope and matched pattern to cover this capability's new
  Go and TypeScript files).

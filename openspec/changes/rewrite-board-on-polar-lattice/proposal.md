# Rewrite the Board on the Polar Lattice

## Why

The hex board's trajectories are geometrically dishonest: `SolveIntercept`
leads a target and commits one straight Cartesian chord while everything
around it rotates, `RouteAround` papers over the chord crossing the star
with a hard-corner detour, and orbits breathe ±13% because a hex ring is
not a circle. Travis approved the full polar migration (2026-08-25), and
its step-3 gate has passed: the polar math core landed fixture-pinned with
Go↔TS parity bit-identical across architectures
(`openspec/changes/archive/2026-08-25-add-polar-lattice-math/`). This
change is steps 4+5 of the migration's sequencing — rewrite
`backend/board/` and its frontend mirror on the polar lattice, both sides
green against a re-recorded fixture contract, before any consumer moves.

## What Changes

- **`backend/board/` is rewritten on ring-and-slot polar cells**, consuming
  `backend/polar/` as its lattice core, behind existing function signatures
  and file roles where possible (`StateAt` fold, `ShipPos`, solves,
  visibility, gates) so consumers change in one later mechanical sweep.
- **The production slot schedule is pinned: Isotropic** — `innerSlots: 6`,
  `doubleAt: [2, 3, 5, 9, 17]` (settled 2026-08-25). The schedule value
  becomes a spec'd constant, not a parameter left open.
- **Adjacency tightens to true corner contact** (`2g ≤ D/Sa + D/Sb`,
  settled 2026-08-25), replacing the spike-faithful loose predicate, and
  `ArcPath` gains a **deterministic stitch pass** that inserts the unique
  intervening cell where a sampled step would jump a doubling-boundary gap.
  **Gated:** the exhaustive path sweep must return zero adjacency
  violations under the tight predicate, and the `/spike/polar-board` bench
  must re-score without meaningful regression on the inbound-transfer case;
  if the bench regresses, the documented fallback is the loose predicate
  (both sides of the fork are already fixture-pinned).
- **`RouteAround` and hex-line paths are deleted** — a polar path
  structurally cannot cross the core unless an endpoint is the core.
- **The solves are rewritten in integer/exact-rational arithmetic** —
  intercept lead-solve against bodies linear in angle; no trig, no runtime
  `sqrt` in any rule-bearing value (per `cross-stack-determinism`).
- **Visibility is rewritten as angular geometry** — `LineOfSight` and the
  scan beam become wedge/occlusion math on rings and slots, preserving the
  occlusion semantics `observation` depends on.
- **`frontend/lib/hex/` is rewritten and renamed** as the mirror of the new
  board package (consuming `frontend/lib/polar/`), so the directory name
  outlives the migration accurately.
- **`fixtures/board/cases.json` is re-recorded on polar semantics** — the
  `routeAround` family disappears, an arc-path family appears, and every
  surviving family re-records on ring/slot coordinates with
  exhaustive-sweep digests. `fixtures/polar/cases.json` re-records for the
  tightened adjacency and stitched paths. **Never regenerate fixtures on
  Apple Silicon while any float path remains**
  (`docs/defects/2026-08-25-line-fma-arch-divergence.md`).
- **The `polar-lattice-math` capability dissolves into
  `board-tactical-math`**, per its archived Exit plan: its requirements
  fold in, the temporary capability is removed, and `board-tactical-math`
  becomes the polar board's spec.
- **BREAKING:** every consumer of `backend/board`'s hex types (17
  production files) and of `lib/hex`'s hex exports stops compiling when
  this change lands. That is deliberate: the consumer sweep
  (`system` → `fleet` → `observation` → `corporations` → `mine`/`market`)
  is the next change, and the repo is red between the two (accepted —
  solo, local, no branch discipline requested). This change's own gate is
  the board/mirror suites and the fixture contract, not the full build.

**Non-goals:** moon targeting stays deferred (moons remain generated but
untargetable; the new intercept solve leaves a clean seam for solving
against a parent body's orbit later — named here so the omission is a
decision, not an accident). No consumer migration, no renderer work, no
movement-tuning retune (rides the renderer step, where the
`move-preview.ts:13` 24× ETA drift also closes), no data migration —
existing dev/prod worlds are fully reset at step 8 (settled 2026-08-25:
wipe galaxies, fleets, fog, corps, and `corpByAccount` pointers; accounts
respawn), so the rewrite carries zero hex back-compat. No leak into the
galaxy graph tier.

## Capabilities

### New Capabilities

*(none — the polar lattice capability already exists and is being folded
into the board capability, not created)*

### Modified Capabilities

- `board-tactical-math`: becomes the polar board's spec. Lattice
  requirements (`Axial Hex Coordinates and Distance`) are replaced by the
  polar cell/schedule/radius requirements folded in from
  `polar-lattice-math` (with the Isotropic schedule now pinned as values
  and adjacency tightened to true corner contact + stitch);
  `Contiguous Hex-Line Paths` and `Core-Avoiding Routes` are **REMOVED**
  (superseded by the arc-path requirement / structurally obsolete);
  kinematics, solves, visibility, and lane requirements are **MODIFIED**
  to swap hex coordinates for polar cells and chord semantics for arc
  semantics.
- `polar-lattice-math`: **REMOVED** as a capability — its requirements
  fold into `board-tactical-math` per the archived change's recorded Exit
  plan. Two of its requirements change in the fold: adjacency (loose →
  true corner contact) and arc-path sampling (gains the stitch pass).
- `cross-stack-determinism`: the golden-fixture requirement's
  hex-specific sweep-domain wording ("all ordered pairs of hexes within
  radius 10", `q,r` serialization) and its `frontend/lib/hex` path
  references are **MODIFIED** to the polar equivalents (bounded ring/slot
  domains and cell serialization, per the sweep-domain requirement being
  folded in from `polar-lattice-math`).

## Impact

- **Rewritten:** `backend/board/` (7 production files; `route.go` deleted),
  `frontend/lib/hex/` (9 modules, renamed directory), both test suites.
- **Modified:** `backend/polar/` + `frontend/lib/polar/` (tightened
  adjacency, stitch pass in `ArcPath`), `fixtures/polar/cases.json`,
  `fixtures/board/cases.json` (re-recorded), the guardrail scripts whose
  paths are hardcoded (`check-transcendental.sh`, `check-mirror-map.sh`,
  `/check`'s cross-target matrix) follow the directory rename.
- **Broken until the consumer change:** `backend/system`, `fleet`,
  `observation`, `corporations`, `mine`, `market` (compile errors), the
  frontend board components, and therefore the e2e suite. The Playwright
  slice e2e (green at `db2a354`) is the acceptance gate for the migration
  *as a whole* and returns green after the consumer + renderer changes,
  not this one. `backend/system/hex.go`'s duplicate `Hex` type is
  collapsed in the consumer change, not ported.
- **Interacts with active changes:** `revise-scan-instant-and-emission`
  and `add-endless-galaxy` touch visibility/`BeamHexes` semantics this
  change ports — flagged, not absorbed; `add-board-camera-controls`
  (renderer) is untouched.
- **No new infra, routes, stored shapes, or Firestore indexes.** Stored
  `Orbit{ring, angle0, dir}` is already polar and persists unchanged.

## Why

Links 1–8b replace every gameplay use of the polar ring-and-slot lattice with
continuous R³ kinematics, but the lattice itself is still in the tree:
`backend/board`, `backend/polar`, their TypeScript mirrors, their golden
fixtures, their entries in eight hand-maintained enforcement lists, and the
`board-tactical-math` specification. This is the chain's terminus — it removes
all of it, so nothing in the tree describes, computes, or enforces a
representation the game no longer has.

**This change is a deletion, not a deprecation.** Per the project's ground
rules (solo toy, prod exists but is unused) there is no migration, no
compatibility shim, and no deprecation period. Nothing is re-implemented
elsewhere.

## Precondition — stated explicitly, verified first, not assumed

`build-production-space-view`'s task 10.11 runs a `grep` of the whole frontend
tree for any surviving import of `@/lib/board` or `@/lib/polar` from a
non-deleted path, and requires it to return nothing. **That grep coming back
clean is this change's precondition.** Task 1.1 below re-runs it as this
change's first action rather than trusting the checkbox.

**If that grep is dirty, this change cannot proceed.** A surviving frontend
importer means `build-production-space-view` is not actually complete, and the
correct response is to finish it there — not to widen this change to absorb the
remainder, which is how a "pure deletion" turns into an unreviewed feature
change.

The frontend grep is necessary and **not sufficient**. This change carries
three more preconditions of its own, each verified in section 1:

- **the backend importers**, which `build-production-space-view` explicitly does
  not remove and records by name in its design: `system/generator.go`,
  `system/model.go`, `system/service.go`, `system/gates.go`, `system/fog.go`,
  `system/fog_source.go`, `stations/placement.go`, `stations/service.go` (eight
  for `board`; `system/generator.go` and `system/service.go` also import
  `polar`);
- **the four predecessors are archived, in order** — `add-fuel-as-cargo` (done),
  `add-stationkeep-hold-verb`, `serve-orbital-elements-and-burn-preview`,
  `build-production-space-view`, `add-scan-and-sightings-surface`;
- **`board-view` has already been retired** by `build-production-space-view`'s
  post-archive hand-delete, so `openspec/specs/board-view/` does not exist.

## What Changes

- **Delete `backend/board` and `backend/polar` outright**, with every test file.
- **Delete `frontend/lib/board` and `frontend/lib/polar` outright**, with every
  test file.
- **Delete `fixtures/board/` and `fixtures/polar/`** — `cases.json`,
  `coordinate-table.json`, and both `mirror-map.json` files.
- **Remove the lattice tier from `backend/system`**: `Feature.Orbit`,
  `Feature.ParentId`, `Feature.Fixed`, `Feature.Footprint`, the `Orbit` type
  itself, `PeriodFor`, `clampRing`, `featureRingOK`, `LaneGate.Cell`,
  `LaneGates`' `radius` parameter, `fog_source.go`'s occlusion radii (which
  have had no production caller since link 2), and the `r2 == nil`
  "no continuous draws" generator mode that existed only to prove lattice
  independence. **BREAKING** for generated worlds: removing the lattice slot
  draw shifts the generator's primary RNG stream, so the same seed produces
  different continuous elements than it does today.
- **Remove the lattice tier from `backend/stations`**: `DeriveOrbit`,
  `ErrStationRingOutOfRange`, and `FeatureOf`'s ring check — the tether
  `build-production-space-view`'s design deferred to this change *by name*
  (a station could still vanish from a system for a lattice reason with nothing
  on the wire to hint at it) — **and `Station.Orbit` itself**, which is
  `system.Orbit`-typed and therefore cannot outlive it. **BREAKING** wire
  change: that field is served, not merely stored — `GET
  /v1/systems/:systemId/station` returns the station document as-is — so `orbit`
  leaves the station read and the client's `Station` type together. No successor
  field is added to that endpoint; the station's continuous position is already
  served on the interior read as the station body's own element set, and is
  re-derived, never persisted.
- **Rename `common.GameTuning.BoardRadius`** to a name with no board in it, and
  delete `OrbitBasePeriod` / `OrbitPeriod` and `fleet.Params.BoardRadius`.
  `BoardRadius` is **not** pure deletion material: `SystemInterior.Extent =
  ContinuousRadius(params.Radius)` still reads it, so deleting it would silently
  change every system's continuous extent.
- **Retire the `board-tactical-math` capability** — a post-archive hand-delete
  of `openspec/specs/board-tactical-math/`, because a capability cannot be
  retired through `REMOVED` deltas.
- **Drop every lattice citation from the eight capabilities that merely mention
  it**, and re-express (never silently drop) the six requirements whose lattice
  half was load-bearing.
- **De-enrol `board` and `polar` from every enforcement list, changed-file
  trigger, CI leg, register and defect doc that names them** — 32 sites across
  15 files, enumerated in `design.md`.
- **Enrol `backend/market` ↔ `frontend/lib/market` as a `check_mirror` pair**
  with its own `fixtures/market/mirror-map.json`. It is a genuine mirrored pair
  with a golden fixture and no mirror map, which already violates the live
  requirement; enrolling it is also what keeps `check_mirror` from losing its
  last call site when `board` and `polar` go (design.md Decision 4).
- **Re-record `fixtures/system/cases.json`'s `interiorElements` family** over
  its surviving `continuousLine` component, with the cross-target matrix
  verified *before* the re-recorded file is committed.

## Capabilities: retired versus modified, and why

**Retired (one), by post-archive hand-delete, with no delta directory:**

- **`board-tactical-math`** — all 22 requirements are lattice geometry or
  lattice-scoped restatements of a rule that lives elsewhere. Nothing is
  re-expressed. The supersession map is in `design.md`; every requirement is
  either (a) already superseded by a live requirement in `space-kinematics`,
  `system-body-table`, `proximity-disclosure` or `cross-stack-determinism`, or
  (b) governs a computation that ceases to exist. **This change re-ADDs nothing
  from it**, which is what makes the `handoffs/README.md` lesson-four hazard
  (a re-ADD losing substance invisibly) inapplicable to the retirement itself —
  but it applies in full to the six `REMOVED` + `ADDED` pairs below, and
  task 11.2 runs that diff mechanically.

**Modified (eight), because they merely cite the lattice:**

| Capability | Why it is modified, not retired |
| --- | --- |
| `cross-stack-determinism` | Owns the fixture, sweep and mirror-map discipline generally. Only its board/polar *instances* die; the rules survive and repoint at `fixtures/market` (the surviving mirrored pair) and the Go-sole-authority families. |
| `system-interior` | The continuous interior is this capability. Only its lattice tier — the ring/slot placement, the live-tuning period, the ring decode guard, the stream-independence proof — retires. |
| `trading-station` | The station survives; its lattice orbit and the ring guard on it do not. Its continuous orbit requirement already carries every obligation the lattice placement requirement did, except the off-gate-ring clause, which has no continuous meaning. |
| `session-wakeup` | One sentence and two scenario bodies route the player to a "hex board route". |
| `action-dispatch` | One scenario body uses "a board coordinate" as its example of a rejected non-primitive param. |
| `galaxy-generation` | The skeleton's ring ordinal is defined partly by what it is *not* ("never itself a lattice ring"). |
| `world-clock` | Its domain enumeration names `board` — and `observation`, a package link 5 deleted and this sweep also catches. **This one is not wording-only:** the delta also *widens* the enumeration, adding `space`, `disclosure` and `charts` (see below). |
| `mine-extraction` | Two references to "the containing system's board" as the read that resolves a due mine. |

**`world-clock`'s widening, declared rather than smuggled.** *Scaled World
Time* enumerates the domains forbidden from reading `time.Now()` directly. The
live list is *galaxy, system, board, fleet, action, observation, corporations*.
The delta removes `board` and `observation` (both deleted packages) — that part
is wording-only — but it also **adds `space`, `disclosure` and `charts`, and
renames the example timestamp from "an observation's `asOf`" to "a sighting's
`asOf`"**. Those three packages exist, hold gameplay timestamps, and were
created by links 2–8 after this requirement was last written; they were never
in scope of the constraint. Adding them is a genuine broadening of an
architectural rule, not a citation repair, and it is **already satisfied** —
`grep -rn 'time\.Now()' backend/space backend/disclosure backend/charts
--include='*.go' | grep -v _test.go` returns one hit, a doc comment in
`space/vec.go:10`, and no call. Task 10.3 re-runs that grep rather than
assuming it.

**Deliberately untouched, with reasons:**

- `galaxy-view`, `fleet-roster`, `fleet-movement`, `space-kinematics`'s
  `## Purpose` — all handled by `build-production-space-view` (tasks 10.9,
  10.10, 13.1, 13.2). `tasks.md` section 13 covers only the `space-kinematics`
  Purpose sentences that change explicitly does *not* reach.
- `system-interior`'s *Interior Read Serves Continuous Bodies* (added by
  `build-production-space-view`) keeps its "Lattice-only fields are absent from
  the response" scenario. That guard is expressed on the **wire**, which still
  exists, so it can still fail; it is not the unfailable kind this change
  retires elsewhere (design.md Decision 6).

## Impact

- **Affected specs:** `board-tactical-math` (RETIRED),
  `cross-stack-determinism`, `system-interior`, `trading-station`,
  `session-wakeup`, `action-dispatch`, `galaxy-generation`, `world-clock`,
  `mine-extraction`.
- **Affected code:** `backend/board` (deleted), `backend/polar` (deleted),
  `backend/system`, `backend/stations`, `backend/common`, `backend/fleet`,
  `backend/corporations`, `backend/market`, `backend/action`, `backend/mine`,
  `frontend/lib/board` (deleted), `frontend/lib/polar` (deleted),
  `frontend/lib/market`.
- **Affected fixtures and governance:** `fixtures/board/` (deleted),
  `fixtures/polar/` (deleted), `fixtures/market/mirror-map.json` (new),
  `fixtures/system/cases.json` (re-recorded),
  `fixtures/system/mirror-map.json`, `fixtures/determinism-register.json`.
- **Affected enforcement:** `.gitlab-ci.yml`, `infra/docker/test-runner.Dockerfile`,
  `.claude/skills/code-quality-checks/check.py`,
  `.claude/skills/code-quality-checks/test_check_determinism_lists.py`,
  `.claude/scripts/check-mirror-map.sh`,
  `.claude/scripts/check-transcendental.sh`,
  `.claude/scripts/check-frontend-tests.sh`.
- **Affected docs:** `CLAUDE.md`, `docs/specs/0004-movement-board.md`,
  `docs/specs/0007-hex-board-view.md`,
  `docs/defects/2026-08-26-station-on-gate-ring.md`,
  `docs/defects/2026-08-25-lanegate-near-tie-divergence.md`.

## Context

This is link 9, the terminus of the continuous-space chain
(`docs/plans/continous_space/chain.md`). Links 1–8b built the continuous
representation and moved every consumer onto it; this one removes the
representation they replaced.

Three constraints shape it, and none is optional:

1. **A capability cannot be retired through `REMOVED` deltas.** The archiver
   refuses to rebuild a spec left with zero requirements. Retirement is a
   post-archive hand-delete of the spec directory, and neither
   `openspec validate --strict` nor `.claude/scripts/openspec-reconcile.py`
   catches a missing one. Precedents: `polar-lattice-math`,
   `observation-fog-and-scan`, and `board-view`.
2. **The archiver's scenario check only protects `MODIFIED` blocks.** A
   requirement re-expressed under a new name through `REMOVED` + `ADDED` is
   invisible to it, and to `openspec-reconcile.py`. On link 8a that structure
   cost six load-bearing losses (`handoffs/README.md`, *Lesson four*). This
   change carries six such pairs, and task 11.2 diffs every one mechanically.
3. **Solo toy, no backcompat.** No migration, no dual path, no flag, no
   deprecation window. Prod exists and is unused.

## Goals / Non-Goals

- **Goal:** no file in the tree references `backend/board`, `backend/polar`,
  `frontend/lib/board`, `frontend/lib/polar`, `fixtures/board`,
  `fixtures/polar`, or the `board-tactical-math` capability.
- **Goal:** every enforcement list, changed-file trigger, CI leg, deviation
  register and defect doc that names `board` or `polar` is either de-enrolled
  or deleted — with none left green-but-inert.
- **Goal:** every deletion is verified by a stated `grep` that must return
  nothing, or a suite that must stay green. Not merely "delete X".
- **Non-goal:** re-implementing anything the lattice did. Where a lattice
  requirement has no continuous successor, it retires and the loss is stated.
- **Non-goal:** fixing the open FMA sites in `backend/market` and
  `backend/mine`. They are registered, they are not lattice, and they stay.
- **Non-goal:** changing any gameplay rule. The one behavioural consequence
  (generated worlds change, Decision 3) is a side effect of deletion, not a
  design choice.

## Decisions

### Decision 1: No requirement is renamed via a `RENAMED` block

Three surviving requirement titles keep lattice-era vocabulary:
`Shared Board Math Is Pinned By a Cross-Language Golden Fixture`
(`cross-stack-determinism`), `Successful Spawn Hands Off to the Home Board`
(`session-wakeup`), and `Drill-In Navigation to the System Board`
(`galaxy-view`, modified by `build-production-space-view`). This change edits
their bodies and leaves their titles alone.

**Why — and note the reason changed under this change's feet.** At authoring
time `openspec-reconcile.py` matched a `MODIFIED` block against the *live* spec
by requirement name and did not read `RENAMED` blocks at all, so a `RENAMED` +
`MODIFIED`-under-the-new-name pair — the shape `add-fuel-as-cargo` used and the
archiver accepts — made reconcile report `MODIFIED '<new name>' — NO SUCH live
requirement` and exit non-zero, while putting the `MODIFIED` under the *old*
name satisfied reconcile and broke the archiver, which applies renames first.
A rename could therefore pass one gate or the other but never both.

**That is no longer true.** `6edb831` — the very commit that authored this
change — added `parse_renames()` to `.claude/scripts/openspec-reconcile.py`,
which resolves a `MODIFIED` block's target through the delta's `## RENAMED
Requirements` block before matching it against the live spec.
`docs/plans/continous_space/handoffs/README.md` records the fix, and it was
verified in both directions: the archiver's shape passes, and a scenario
dropped *through* a rename is still caught. **A rename is now mechanically
reachable.**

This change nevertheless leaves the three titles alone, for a smaller and
purely editorial reason: requirement titles are identifiers, not prose, and a
title containing the word "Board" is not a reference to a deleted artifact the
way a body citing `fixtures/board/cases.json` is. Renaming them is now a
cheap, safe follow-up rather than a blocked one — see OQ-3. The three residual
titles are recorded here so they are visible rather than forgotten.

One **scenario** heading is residual for a harder reason: `trading-station`'s
*The board read serves the station regardless of tier* uses "board" for the
system-interior read. Scenario headings have no `RENAMED` mechanism at all, and
a `MODIFIED` block must reproduce every live heading character-for-character or
the archiver refuses. It is therefore unchangeable by any change that does not
also delete and re-ADD its requirement, which would put it back outside the
archiver's scenario protection. Recorded, not fixed.

- Alternative considered: **rename all three in this change, now that the gate
  resolves `RENAMED`.** Not rejected on mechanics — it would work. Deferred
  because a rename touches every citation of the title (task 12.5's sweep runs
  repo-wide for exactly this reason), and folding three renames into a deletion
  change of this size trades a real risk for a cosmetic gain.

### Decision 2: `MODIFIED` where possible; `REMOVED` + `ADDED` only where a live scenario must die

The archiver refuses a `MODIFIED` block that omits a scenario the live spec
still has. Six requirements have at least one scenario that asserts a property
of the lattice and therefore cannot survive deletion in any honest form. Those
six, and only those six, are restructured:

| Capability | Retired requirement | Replacement | The scenario that forced it |
| --- | --- | --- | --- |
| `cross-stack-determinism` | Square Roots In Rules Are Pinned, Not Assumed | Rule-Bearing Square Roots Are Pinned By a Recorded Fixture Family | "The polar board leaves no rule-bearing sqrt behind" |
| `system-interior` | Lazy, Deterministic Interior Generation | Interior Generation Is Lazy and Deterministic | "Placement reaches every slot on a ring whose slot count exceeds six times its ring index" |
| `system-interior` | Interiors Emit Continuous Orbital Elements For Every Body | Every Generated Body Carries a Continuous Orbital Element Set and a Size | "Adding continuous elements leaves every lattice placement unchanged" |
| `system-interior` | Orbital Radii Ascend With the Skeleton Ordinal and Are Separated | Continuous Orbital Radii Ascend With the Skeleton Ordinal and Are Separated | "Two skeleton bodies mapped to the same lattice ring still receive distinct continuous radii" |
| `system-interior` | A Retrograde Orbit Is Expressed By Inclination, Never By a Non-Positive Period | Retrograde Motion Is Expressed By Inclination, Never By a Non-Positive Period | "A feature's continuous side matches its own lattice direction" |
| `trading-station` | Station Is a Dockable, Non-Mineable Board Feature | Station Is a Dockable, Non-Mineable Body | "Docking to the station involves no lattice predicate" |

Every one of these carries its surviving scenarios **verbatim** into the
replacement, and each dropped scenario is either replaced by one asserting the
same guarantee against the surviving representation, or explicitly recorded as
having no successor. Task 11.2 re-runs that diff mechanically before archive.

Three further `system-interior` requirements are pure `REMOVED` with no
replacement, because their whole subject is the lattice: *Orbital Period Read
from Live Tuning*, *Interior Feature Decode Validates Ring Against the Live
Schedule*, and *Lattice Placement Is Independent Of The Continuous Stream*. Two
`trading-station` requirements likewise: *Deterministic, Non-Core,
Off-Gate-Ring, Prograde, Orbiting Placement* and *A Station Orbit Outside the
Live Board Radius Is Omitted, Never Panicked*.

### Decision 3: The generator's RNG stream shifts, and generated worlds change

`system/generator.go`'s `orbitFor` draws `Angle0 = r.Intn(sched.Slots(ring))`
from the **primary** generation stream. Deleting the lattice deletes that draw,
which shifts every subsequent draw on that stream — feature directions, resource
richness, detail counts. Those feed the continuous side (`continuousStarParented`
takes its prograde/retrograde side from the direction roll), so **the same seed
now produces a different system**.

This is accepted, not mitigated. The alternative — retaining a discarded draw to
preserve stream alignment — is a compatibility shim, which the project's ground
rules forbid outright. Already-materialized interiors keep their stored
elements; nothing is rewritten. Two consequences are real and stated:

- `fixtures/system/cases.json`'s `interiorElements` family **must be
  re-recorded**, and its `latticeProjection` and `latticeDrawCount` components
  removed with the requirement that motivated them.
- Dev Firestore will hold systems generated under both regimes. That is not a
  bug, and no reconciliation is written for it.

**Re-recording `fixtures/system/` is guarded, not blocked.** The 1-ULP arm64/
amd64 divergence that made it unsafe (13 of ~500 `Resource.Richness` values,
four FMA sites in `generator.go`) was **resolved 2026-08-29** by
`pin-system-generation-determinism`; the defect doc records the fix, and
`backend/system` now emits zero arm64 FMA instructions and carries no register
entry. The standing instruction against re-recording that family on Apple
Silicon predates that fix. Rather than rely on either claim, task 7.5 requires
the re-recorded file to reproduce byte-for-byte on **both** build targets before
it is committed, and forbids committing it if it does not. See OQ-1.

### Decision 4: `backend/market` ↔ `frontend/lib/market` becomes the surviving `check_mirror` pair

After `board` and `polar` go, `.claude/scripts/check-mirror-map.sh`'s
`check_mirror` function has **zero call sites**, and every `pairs`-mode clause
in `cross-stack-determinism`'s golden-fixture requirement governs nothing.

`backend/market` and `frontend/lib/market` are already a real mirrored pair:
`FoldSale`/`foldSale`, `FirstTonPrice`/`firstTonPrice` and `Capacity`/`capacity`
are implemented on both sides and asserted against
`fixtures/market/cases.json` by `backend/market/fixtures_test.go` and
`frontend/lib/market/fold.test.ts`. They have no `mirror-map.json` and no
`check_mirror` pass, which is a **pre-existing violation** of the live
requirement ("The system SHALL maintain a mirror map naming every function
defined in both a Go package and its TypeScript mirror"). Enrolling them closes
that hole and keeps the machinery alive at the same time.

- Alternative considered: **delete `check_mirror` outright** as dead code, and
  narrow the requirement to anti-mirror mode only. Rejected: it converts a
  shipped, working check into a spec paragraph with no implementation, which is
  the exact defect species this chain has shipped seven times.
- Alternative considered: **leave `check_mirror` in place with no callers.**
  Rejected: an uninvoked check is indistinguishable from a passing one, and a
  future pair would be enrolled against a function nobody has run in months.

**What enrolling actually costs, stated plainly.** `board` and `polar` were
pure-math packages whose entire exported surface was the mirrored contract.
`backend/market` is not: it is a Gin/Firestore application package with
handlers, a service, a DAO seam and unexported helpers. `check_mirror`'s rule 1
extracts **every** top-level `^func ` in the directory — receiver methods and
unexported functions included — and fails on any name absent from the map. The
package defines 28 such functions today, three of which are the mirrored pair;
the other 25 must be listed in `goOnly`. That makes `fixtures/market/
mirror-map.json` a **whole-package census**, and it fails the moment anyone
adds a service method, a handler or a private helper to `backend/market` — a
recurring maintenance tax on an application package, not the one-time cost a
pure-math enrolment carries. This is accepted because the pair is a live
violation of the golden-fixture requirement regardless of this change
(`FoldSale`/`foldSale`, `FirstTonPrice`/`firstTonPrice` and `Capacity`/
`capacity` are implemented on both sides with no mirror map), so the census is
owed either way — but it is not "one JSON file plus one invocation", and
task 7.2b requires the list to be generated by the extractor rather than
transcribed, because a hand-copied census is wrong on its first edit.

### Decision 5: `BoardRadius` is renamed, not deleted

`common.GameTuning.BoardRadius` looks like pure lattice, and most of its
consumers are. But `system/generator.go` computes
`Extent: ContinuousRadius(params.Radius)` where `params.Radius` sources from it,
and `SystemInterior.Extent` is the continuous upper bound every body-table
build, gate radius and codec bound depends on. Deleting it would silently change
every system's size.

It is therefore renamed to a name describing what it actually is — the count of
orbital shells the generator places bodies on — and kept. `OrbitBasePeriod`,
`OrbitPeriod(ring)`, `system.PeriodFor` and `fleet.Params.BoardRadius` **are**
pure deletion material: their only consumers are the lattice `Orbit.Period` and
`LaneGates`' radius argument, both of which go.

The exact new name is left to the implementer within the constraint that it
contains no "board" and no "ring"; the task states the constraint rather than
inventing a value.

### Decision 6: A negative guard survives if it can still fail

Several requirements and tests assert the *absence* of the lattice. After the
packages are gone, some of them can never fail again. The rule this change
applies:

- **Retire** a guard whose only expression is "package X is not imported" where
  X no longer exists — the compiler is a strictly stronger guarantee. This
  covers `backend/{market,mine,stations}/lattice_symbols_absent_test.go` and
  `trading-station`'s "Docking to the station involves no lattice predicate".
- **Keep** a guard expressed on an artifact that still exists. This covers
  `system-interior`'s "Lattice-only fields are absent from the response"
  (added by `build-production-space-view`): a JSON response can carry a
  `footprint` key regardless of what Go types exist, so the wire contract is
  still falsifiable.

### Decision 7: Two open defects are closed by dissolution, not by repair

- `docs/defects/2026-08-26-station-on-gate-ring.md` — a station derivable onto
  the real lane-gate ring, because `DeriveOrbit` spans `[1, boardRadius-1]`
  rather than `[1, board.GateRing(boardRadius)-1]`. Both the derivation and the
  gate ring cease to exist.
- `docs/defects/2026-08-25-lanegate-near-tie-divergence.md` — `LaneGateHex`/
  `laneGateHex` selecting different gate candidates on an exactly-equidistant
  bearing. The Go↔TS pair is deleted; there is no seam left to diverge across.

Neither is silently dropped. The successor question — whether
`space.PhaseIndexOf`, which `system.gateOrbit` uses for exactly the same
discretized-argmax job, has its own near-tie hazard **across Go build targets**
— is a different question that authority does not answer, and
`cross-stack-determinism`'s "Authority does not cover a same-side cross-target
disagreement" already governs it. Task 9.3 requires that to be checked against
the recorded `gateOrbit` sweep and filed if it is not covered, rather than
assumed closed.

## The enforcement surface — 32 sites, 15 files

`pin-system-generation-determinism` catalogued **eight** hand-maintained
package lists after two earlier reports undercounted them. Every one names
`board` or `polar`. Enumerating the whole surface, because a list missed here
leaves a check that passes forever:

**`.gitlab-ci.yml`**
1. `:68–72` — `.fixtures-changes` anchor comment, naming `fixtures/board/**` and
   `fixtures/polar/**` (the glob itself is family-agnostic; only the prose dies).
2. `:342` — `GOAMD64=v1 go test ./board/`, the amd64 cross-target leg.
3. `:343–347` — the polar comment and `GOAMD64=v1 go test ./polar/`.
4. `:370–373` — the qemu arm64 leg's `board` and `polar` compile-and-run lines.
5. `:379` — the `DETERMINISM ARM64 LEG UNASSERTED` message string, which
   enumerates `./board/ ./space/ ./system/ ./polar/` in prose.

**`.claude/skills/code-quality-checks/check.py`**
6. `:223` — `DETERMINISM_GO_PACKAGES` (the transcendental lint's scope gate).
7. `:258–259` — the seam-file predicate matching `frontend/lib/board` and
   `frontend/lib/polar`.
8. `:1052–1055` — `run_determinism_cross_target`'s docstring, which cites
   `polar-lattice-math` (a capability retired two changes ago).
9. `:1078–1102` — the two `go test ./board/ ./polar/ ./space/ ./system/
   ./galaxy/` command strings and the four result messages naming them.
10. `:1161–1162` — `run_mirror_map_check`'s docstring.
11. `:1484–1492` — `determinism_trigger`, the changed-file predicate gating
    site 9.
12. `:1502–1514` — `mirror_trigger`, the changed-file predicate gating the
    mirror-map check.

**`.claude/skills/code-quality-checks/test_check_determinism_lists.py`**
13. `:9–20` — the docstring recording the current agreed list contents.

**`.claude/scripts/check-transcendental.sh`**
14. `:44–46` — the comment governing `frontend/lib/board` and
    `frontend/lib/polar`, citing `board-tactical-math`.
15. `:82` — `RULE_BEARING_GO_PACKAGES` (must stay equal to site 6, enforced by
    site 13).
16. `:88` — the `frontend/lib/(board|polar)` path predicate.

**`.claude/scripts/check-mirror-map.sh`**
17. `:5–11` — the header comment describing both mirrored pairs.
18. `:181` — the `frontend/app/spike/space-3d` carve-out comment, stale once
    `build-production-space-view` deletes that spike.
19. `:335–345` — `check_mirror board` and `check_mirror polar`, the function's
    only two call sites.
20. `:376` — the `PASS:` message enumerating the checked packages.

**`.claude/scripts/check-frontend-tests.sh`**
21. `:118,126` — the `components/board/webgl/` GL-plumbing carve-out, dead once
    `build-production-space-view` deletes that subtree.

**Fixtures and registers**
22. `fixtures/determinism-register.json` — the `checks` legend's "the amd64
    differential **board-test** leg in /check".
23. `fixtures/board/mirror-map.json`, `fixtures/polar/mirror-map.json`.
24. `fixtures/board/cases.json`, `fixtures/board/coordinate-table.json`,
    `fixtures/polar/cases.json`.
25. `fixtures/system/cases.json` — the `interiorElements` family's
    `latticeProjection` and `latticeDrawCount` components and their digest.

**Code comments that outlive their package**
26. `backend/common/tuning.go:143` — cites `board.Schedule` and
    `board-tactical-math`.

**Docs and defect registers**
27. `docs/defects/2026-08-26-station-on-gate-ring.md` (Decision 7).
28. `docs/defects/2026-08-25-lanegate-near-tie-divergence.md` (Decision 7).
29. `docs/specs/0004-movement-board.md` and `docs/specs/0007-hex-board-view.md`
    — both are `implemented`/`accepted`, and therefore **enforced** by
    `frontend/lib/spec-scenarios.test.ts`, which requires every `### S<n>`
    scenario in them to be cited by a surviving test.

**Three more, found by adversary review after the count of 29 was fixed** —
kept numbered separately rather than renumbering, so the earlier count stays
comparable against the report that produced it:

30. `infra/docker/test-runner.Dockerfile:5` — the comment justifying
    `qemu-user-static` says the arm64 leg "runs the `GOARCH=arm64` **board**
    fixture suite". The install is still needed; the justification names a
    suite that ceases to exist.
31. `.claude/skills/code-quality-checks/check.py:250` —
    `check_transcendental`'s docstring, "the rule-bearing Go packages and the
    TS **board-math** mirror". Distinct from site 7 (the predicate) and site 8
    (a different docstring).
32. `fixtures/system/mirror-map.json:59, 60, 71` — the coverage inventory names
    `generateWithStreams` (twice, once inside a `note`) and `clampRing`, both
    deleted by tasks 2.3 and 2.6, plus `TestClampRing_StaysMonotonicNonDecreasing`
    and `TestInteriorElementsSweep_MatchesLatticeIdentitySweep`. This map runs
    in **`anti_mirror`** mode, and `anti_mirror` reads only `.sharedNames`
    (which is `[]`) — it never looks at `.coverage` at all. A stale entry here
    therefore **cannot fail**, which makes it precisely the silently-inert
    record Goal 2 forbids. Repair it by hand; nothing will surface it.

## `board-tactical-math` — the supersession map

All 22 requirements retire. Nothing is re-ADDed. Each is superseded by a live
requirement elsewhere, or governs a computation that ceases to exist:

| Retired requirement | Where its obligation lives now |
| --- | --- |
| Effective Movement State Fold | `space-kinematics` — the `StateAt` fold over continuous state |
| Computed Ship Board Position | `space-kinematics` — effective position resolution |
| Due-Kinematics Detection | `space-kinematics` / `fleet-movement` — the settle-if-due seam |
| Deterministic Intercept Lead-Solve | `space-kinematics` — the continuous burn solve |
| Occlusion-Aware Line of Sight | `proximity-disclosure` — star-only occlusion in R³ |
| Widening Scan Beam Corridor | Nothing. `BeamCells` never had a production caller; the focused scan is a range-and-occlusion predicate, not a corridor |
| Deterministic Lane Gate Projection | `system-body-table` — *A Gate's Bearing Is Derived From the Galaxy Layout, Never Runtime Trigonometry* |
| Lane Transit Position Fraction | `fleet-movement` — lane transit is a time interval with no position in either system |
| Ring-and-Slot Cell Coordinates | Nothing. There is no discrete position type |
| Slot Schedule Shape | Nothing |
| The Production Slot Schedule Is Pinned to Isotropic | Nothing |
| Lattice Adjacency Is True Corner Contact | Nothing. Attachment replaced adjacency (`fleet-movement`: *Every Body In the System's Body Table Is a Valid Attachment Host*) |
| Every Cell On a Ring Sits At One Radius | Nothing |
| A Straight Path Is an Arc | `space-kinematics` — the committed brachistochrone curve |
| A Path Reaches the Core Only If an Endpoint Is the Core | `space-kinematics` — star clearance on the burn path |
| Lattice Hop Distance | Nothing. Distance is Euclidean |
| Orbital Advance Is Integer Arithmetic Over the Ring's Slot Count | `space-kinematics` — integer sub-turn phase advance |
| Orbit Back-Solve Settles Without Teleporting | `space-kinematics` — a burn past its arrival IS its settled park |
| The Sweep Domain Is Bounded and Its Enumeration Is Fixed | `cross-stack-determinism` — the exhaustive- and randomized-sweep clauses of the golden-fixture requirement, generalized by this change |
| A Pinned Coordinate Table Grounds Board Geometry | `cross-stack-determinism` — *Pinned Constant Tables Are Recorded, Asserted, Never Recomputed*, whose surviving instance is `backend/space`'s sub-turn table |
| Rule-Bearing Values Are Integer or Exact Rational | `cross-stack-determinism` — *Rule-Bearing Values Cross the Seam By Exact Arithmetic or By Discretization*. The retiring text says so itself: "This requirement applies that capability's discipline to the polar board" |
| Deterministic Movement Solve to a Fixed Cell | `space-kinematics` — the continuous solve |

## Risks / Trade-offs

- **The generator's output changes (Decision 3).** Mitigated only by being
  stated. Anyone comparing a system generated before and after this change will
  see different bodies; that is correct behaviour, not a regression.
- **Six `REMOVED` + `ADDED` pairs sit outside the archiver's scenario
  protection.** This is the structure that cost link 8a six losses. Task 11.2
  is the whole mitigation, and it must be re-run whenever a replacement
  requirement is edited.
- **Re-recording `fixtures/system/cases.json` is the riskiest single step.**
  A family recorded on one architecture and never checked against the other is
  exactly the defect `pin-system-generation-determinism` existed to end. Task
  7.5 makes the two-target check a precondition of committing the file.
- **De-enrolling a package from a check is indistinguishable from forgetting
  it.** Every section-8 task states the file, the site, and the grep that
  proves the site is gone; section 10 re-greps the whole tree.
- **`check_mirror` gains a new pair in a deletion change (Decision 4).** This is
  the one place where this change adds rather than removes, and it is **not**
  cheap: `backend/market` is an application package, so its mirror map is a
  whole-package census of 28 functions that goes stale on the next service
  method anyone adds (Decision 4, *What enrolling actually costs*). The cost is
  accepted because the pair already violates the golden-fixture requirement
  today. If enrolling `market` surfaces an uncovered shared function, the
  coverage inventory absorbs it — no new fixture family is in scope here.
- **`space-kinematics`'s exemption clause requires a spike path in its
  Purpose.** `build-production-space-view` task 13.1 repoints it at the spikes
  that survive. This change deletes no spike, so that clause stays satisfied —
  but section 12's Purpose edit must not remove the sentence.

## Migration Plan

None, by ground rule. The only multi-step sequences are OpenSpec mechanics:
archive, then hand-delete the retired spec directory (section 12); archive, then
hand-edit the `## Purpose` sections deltas cannot reach. Neither is a data or
traffic migration.

## Open Questions

Left for Travis. Not answered by fiat.

- **OQ-1 — re-recording `fixtures/system/cases.json`.** The instruction handed
  to this change says not to regenerate fixtures under `backend/system` because
  arm64 gives a 1-ULP FMA divergence. The repo says that defect was **resolved
  2026-08-29** (`docs/defects/2026-08-25-remaining-fma-sites.md`, site 1) and
  that `backend/system` now emits zero arm64 FMA instructions. Those two claims
  contradict each other, and this change cannot proceed without re-recording
  that family (Decision 3). Task 7.5 resolves it defensively — record, then
  require byte-identity across `GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1`
  before committing, and stop if it fails. **Travis: confirm the defect is
  genuinely closed, or say the re-record must be done on amd64.**
- **OQ-2 — the new name for `common.GameTuning.BoardRadius`.** Decision 5 fixes
  the constraint (no "board", no "ring") but not the name. Candidates:
  `OrbitalShellCount`, `MaxOrbitalIndex`, `GeneratedOrbitCount`. The value
  (16) does not change.
- **OQ-3 — should link 9 also rename the three residual lattice-vocabulary
  titles?** The blocker is gone: `6edb831` taught
  `.claude/scripts/openspec-reconcile.py` to resolve `RENAMED`
  (`parse_renames`), so a `RENAMED` + `MODIFIED`-under-the-new-name pair now
  passes both the archiver and the gate. The three are
  `Shared Board Math Is Pinned By a Cross-Language Golden Fixture`
  (`cross-stack-determinism`), `Successful Spawn Hands Off to the Home Board`
  (`session-wakeup`) and `Drill-In Navigation to the System Board`
  (`galaxy-view`). Decision 1 defers them as cosmetic; a rename would also have
  to repoint every citation the repo-wide sweep in task 12.5b finds. **Travis:
  rename them here, or leave them to a follow-up?**
- **OQ-4 — `docs/specs/0004-movement-board.md` and `0007-hex-board-view.md`.**
  Both describe the lattice era. `0007`'s renderer is deleted by
  `build-production-space-view`; `0004`'s two scenarios (S1, S2) are still cited
  by surviving `backend/fleet` tests and are still true in continuous space.
  Marking either `superseded` is a judgement about the `docs/specs/` numbered
  series, which is Travis's own artifact, not the spec team's. Task 9.4 records
  the state and asks rather than deciding.

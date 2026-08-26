# Cross-Stack Determinism — Delta

The board rewrite retires the hex lattice this spec's sweep-domain
wording, file paths, and worked examples were written against. The
discipline is unchanged; the instances are updated: cell-pair sweep
domains replace hex-pair domains, `frontend/lib/board` replaces
`frontend/lib/hex`, renamed functions (`SolveCell`, `LaneGateCell`,
`BeamCells`) replace their hex-named predecessors, the retired
`hexDirection` `sqrt(3)` example is replaced, and the pinned-constant-
table discipline the board's visibility geometry now relies on is stated
as a requirement of this capability rather than left implicit in the
board's spec.

## ADDED Requirements

### Requirement: Pinned Constant Tables Are Recorded, Asserted, Never Recomputed
IF a rule-bearing computation depends on constant values whose derivation
uses arithmetic outside this capability's exact set (trigonometric
functions, `sqrt`, or any contraction-sensitive expression), THEN those
values SHALL be produced only by a recording flow — the sole place that
arithmetic executes — committed as data, loaded (never recomputed) at
runtime by every implementation, asserted byte-identical across the
language seam and the Go build-target matrix by the fixture suites, and
re-recorded only as a reviewable diff in a change's own commits. Runtime
use of a pinned table SHALL be exact arithmetic per `Rule-Bearing Values
Cross the Seam By Exact Arithmetic or By Discretization`; the pinning is
what admits the inexact derivation, exactly as the sqrt-pinning
requirement admits a pinned root. The board's pinned coordinate table
(`board-tactical-math` › A Pinned Coordinate Table Grounds Board
Geometry) is the first instance.

#### Scenario: A pinned table reproduces across the seam and the build-target matrix
- **WHEN** the fixture suites assert a pinned constant table in Go
  compiled for `GOARCH=arm64`, in Go compiled for `GOARCH=amd64` with
  `GOAMD64=v1`, and in the JavaScript runtime
- **THEN** every entry is byte-identical on all three

#### Scenario: Recomputing a pinned table at runtime is a violation
- **WHEN** a rule-bearing computation derives at runtime a value a pinned
  table records, using the inexact arithmetic the table exists to confine
  to the recording flow
- **THEN** this is a violation of this requirement, regardless of whether
  the recomputed value happens to agree with the table today

## MODIFIED Requirements

### Requirement: Shared Board Math Is Pinned By a Cross-Language Golden Fixture
A function that computes a rule-bearing value and is implemented in both a Go package and a TypeScript module SHALL be covered by a cross-language golden fixture file; where no such file exists for that package pair, the change introducing the mirror SHALL create one. The system SHALL maintain, for each cross-language golden fixture file under `fixtures/`, a golden contract for every function shared between the corresponding Go implementation and its TypeScript mirror, grouped into named families (one family per shared function). The system SHALL maintain a mirror map naming every function defined in both a Go package and its TypeScript mirror, whether or not exported on either side; each pair in the map SHALL appear in a fixture family or in the coverage inventory. `fixtures/board/cases.json` is the board-math instance of this discipline, asserted by `backend/board/fixtures_test.go` and `frontend/lib/board/fixtures.test.ts`; `fixtures/polar/cases.json` is the lattice-core instance, asserted by `backend/polar/fixtures_test.go` and `frontend/lib/polar/fixtures.test.ts`; `fixtures/market/cases.json` is the market-settlement instance, asserted by the corresponding Go and TypeScript settlement suites — all follow the rules below identically. The Go and TypeScript test suites for a given fixture file SHALL assert their implementation reproduces every case in the file byte-for-byte. A change to a shared function's behavior SHALL either reproduce the existing fixture unchanged or re-record it within the same change — a fixture update authored without the corresponding mirror-side change passing is not a valid state to merge. Re-recording SHALL be performed as a reviewable diff in the change's own commits; no automated pipeline SHALL regenerate a fixture file. A shared function whose input domain is enumerable within 10^6 inputs SHALL carry an exhaustive-sweep case in its fixture family: a digest recorded over the function's output for every input in that domain, in a canonical serialization both languages reproduce. For a function whose domain is a pair of polar cells, that domain is all ordered pairs of cells with ring indices at or below the sweep case's recorded maximum ring under the schedule the case names, enumerated by `fromRing`, then `fromSlot`, then `toRing`, then `toSlot`, all ascending, and the digest is the SHA-256 hash of the newline-joined decimal `ring:slot` serialization of the function's output for each input, in that fixed enumeration order both languages reproduce; where a function's domain is a cell pair plus additional parameters, the sweep is taken over the cell-pair domain at parameter values recorded in the fixture case, and a list-valued output is serialized as its cells' `ring:slot` forms joined by `,` on that input's line. Hand-selected cases document intent; the sweep is what makes the family a contract, because a divergence that occupies a small fraction of the input domain cannot be hand-selected for by someone who does not yet know it exists. A family whose function is under an open cross-target divergence defect SHALL record its sweep case as part of the change resolving that defect, and SHALL be named in the capability's deviation register until then (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`). Each fixture family SHALL cover exactly one shared function. A shared function with no fixture family SHALL be listed in the coverage inventory with the change expected to cover it; a rule-bearing shared function SHALL NOT remain in the inventory across more than one change that modifies its package.

#### Scenario: Both languages assert the same fixture file
- **WHEN** the Go and TypeScript test suites run against an unmodified `fixtures/board/cases.json`
- **THEN** both suites read every case from that one file
- **AND** both suites pass, having independently reproduced every recorded case

#### Scenario: A one-sided Go change fails the golden fixture
- **WHEN** a change alters a shared function's behavior in `backend/board` without re-recording `fixtures/board/cases.json` or updating `frontend/lib/board` to match
- **THEN** `backend/board/fixtures_test.go` fails on the case(s) whose recorded output no longer matches the new Go behavior

#### Scenario: A re-recorded fixture the mirror doesn't reproduce fails
- **WHEN** `fixtures/board/cases.json` is re-recorded from a new Go implementation but `frontend/lib/board` is not updated to reproduce the new values
- **THEN** `frontend/lib/board/fixtures.test.ts` fails on the case(s) whose recorded output the unmodified TypeScript implementation cannot reproduce

#### Scenario: An exhaustive sweep case pins a function over its whole domain
- **WHEN** the Go and TypeScript suites each recompute a sweep case's digest from their own implementation
- **THEN** both digests equal the recorded digest
- **AND** a divergence on any single input in the swept domain fails the case, even when every hand-selected case in the same family reproduces

#### Scenario: An uncovered mirrored function is caught by the coverage inventory check
- **WHEN** a function is defined in both a Go package and its TypeScript mirror (exported or not)
- **THEN** the capability's mirror map names the pair, and the pair appears either in a fixture family or in the coverage inventory
- **AND** the check fails if a function in either mirror is absent from the map

#### Scenario: A fixture-only change runs both language suites in CI
- **WHEN** a commit or merge request modifies `fixtures/board/cases.json`
- **THEN** the CI stage running `backend/board/fixtures_test.go` and the CI stage running `frontend/lib/board/fixtures.test.ts` both execute for that commit or merge request, regardless of whether `backend/**` or `frontend/**` files are also touched

#### Scenario: A fixture file that differs from its committed content fails CI
- **WHEN** the CI stage running the fixture suites completes
- **THEN** the pipeline fails if any file under `fixtures/` differs from its committed content (`git diff --exit-code -- fixtures/`), because re-recording is only valid as a reviewable diff in a change's own commits, never as an uncommitted or pipeline-generated side effect

### Requirement: Rule-Bearing Values Cross the Seam By Exact Arithmetic or By Discretization
The system SHALL compute every value that is persisted, returned as a solve result, used to compute an ETA, or used to determine what data is disclosed to a client either (a) by arithmetic whose result is identical in Go and in JavaScript for every input, or (b) by reducing an inexact intermediate to a discrete choice among a finite, enumerable candidate set under a fixed total order (see the discretized-choice requirement). Arithmetic qualifying under (a) is limited to integer arithmetic whose every intermediate is exactly representable on both sides (magnitude below 2^53 in JavaScript, or carried in arbitrary-precision integers where Go's `int64` semantics — notably truncating division — must be reproduced); to IEEE-754 `+`, `−`, `×`, `÷` on 64-bit floats where each operation's result is separately rounded; to `%`/`math.Mod` (modulo, exact for the same reason `+`/`−`/`×`/`÷` are, since it is not a fused operation); and to `math.Floor`/`Math.floor`, `math.Trunc`/`Math.trunc`, `math.Abs`/`Math.abs`, `math.Min`/`Math.min`, `math.Max`/`Math.max`, `math.Ceil`/`Math.ceil`, and float-to-integer truncation for values whose truncated magnitude is below 2^53, all of which both languages define identically within that bound for every finite input. An expression in which a multiplication's result is an operand of an adjacent addition or subtraction — `a + b*c`, `a - b*c`, and the same shapes reached across statements or through an intervening local variable — does not satisfy that condition in Go, whose specification permits fusing them into one rounded operation and whose compiler does so on `arm64`. Assigning the product to a local variable does not inhibit the fusion; only an explicit `float64(...)` conversion around the product is guaranteed by the Go specification to force the intermediate rounding. Such an expression SHALL therefore either be written with that conversion or be restructured so that no multiplication is adjacent to an addition. JavaScript rounds every operation separately and needs no equivalent construct. Arithmetic NOT qualifying under (a) further includes the transcendental functions (`sin`, `cos`, `tan`, `atan2`, `ln`, `exp`, `pow`), whose Go implementations are themselves built from contraction-sensitive polynomial evaluation and consequently differ across Go build targets as well as across the language seam, and `sqrt`, which is correctly-rounded and therefore identical across Go build targets but is NOT guaranteed identical across the language seam, because ECMAScript specifies `Math.sqrt` as implementation-approximated rather than correctly-rounded (see `Square Roots In Rules Are Pinned, Not Assumed`); and `math.Round`/`Math.round`, which is not a last-ULP effect but a guaranteed, 100%-of-input disagreement on every negative half-integer, because Go rounds half away from zero and JavaScript rounds half toward positive infinity. A rule-bearing value that needs "round to nearest" SHALL use an explicit, spec'd tie-break construction that both languages compute identically (for example, a deliberately ported "round half away from zero" helper), never the bare `math.Round`/`Math.round` builtins; the transcendental-drift check SHALL also flag a bare `math.Round`/`Math.round` call reaching a rule-bearing value, outside a colocated pragma. Projection of a logical position to screen or pixel space, and path sampling performed only for rendering (never fed back into stored state, a solve result, an ETA, or a disclosure decision), are exempt from this requirement, as is the fixture-recording flow that generates a pinned constant table (see `Pinned Constant Tables Are Recorded, Asserted, Never Recomputed`). A rule-bearing value already known not to satisfy this requirement, and filed as an open defect under `docs/defects/`, SHALL be named as an entry in the capability's deviation register (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`) rather than the requirement being narrowed to exclude it.

#### Scenario: An integer-only advance is identical across the seam
- **WHEN** `OrbState` (Go) and `orbState` (TypeScript) are each evaluated against the same `orbState` fixture entry
- **THEN** both return the identical cell, computed without any floating-point intermediate

#### Scenario: A contraction-dependent expression on a rule-bearing path is a violation
- **WHEN** a shared function computes a persisted value, a solve result, an ETA, or a disclosure decision through a floating-point expression whose result differs between a build target that contracts multiply-add and one that does not
- **THEN** the cross-target check (`Rule-Bearing Values Are Reproducible Across Build Targets of the Same Language`) reports that function as divergent
- **AND** the pipeline fails unless the function is named in the capability's deviation register, regardless of whether its currently recorded fixture cases happen to reproduce

#### Scenario: An unreduced transcendental reaching a solve result is a violation
- **WHEN** a shared function computes a stored value, a solve result (e.g. a `SolveIntercept`/`SolveCell` path or meet cell), or an ETA by a path that includes a call to `sin`, `cos`, `tan`, `atan2`, `ln`, `exp`, `pow`, or `sqrt` that is not reduced to a discrete choice
- **THEN** this is a violation of this requirement, regardless of whether an automated check currently detects it
- **AND** for `sin`, `cos`, `tan`, `atan2`, `ln`, `exp`, and `pow`, the transcendental-drift check (`.claude/scripts/check-transcendental.sh`) flags that call site today, and the pipeline fails unless the call site carries a colocated `determinism:allow(...)` pragma
- **AND** for `sqrt`, the same check flags that call site only once its pattern is widened to match `math.Sqrt`/`Math.sqrt` (tracked as tooling follow-up work, not yet landed); until that lands, an unreduced `sqrt` on a rule-bearing path is enforced by code review against this requirement, not by the script, and the script's own documentation SHALL NOT claim `sqrt` is deliberately out of its scope once the widening lands

#### Scenario: The bare Round builtin diverges on every negative half-integer
- **WHEN** `math.Round` (Go) and `Math.round` (JavaScript) are each evaluated at a negative half-integer input such as `-2.5`, `-1.5`, or `-0.5`
- **THEN** the two languages disagree (`math.Round(-2.5) = -3` vs `Math.round(-2.5) = -2`, and likewise for every other negative half-integer)
- **AND** the transcendental-drift check flags a bare `math.Round`/`Math.round` call reaching a rule-bearing value, and the pipeline fails unless the call site carries a colocated pragma or the fixture family covering it includes a negative half-integer case, regardless of whether a currently recorded fixture case happens to avoid one

#### Scenario: Projection may use inexact arithmetic freely
- **WHEN** a function converts a logical cell or orbit position to screen pixel coordinates, or samples points along a path purely for smoothed rendering
- **THEN** it MAY use transcendental functions and contraction-sensitive expressions without violating this requirement, because the result is never persisted, returned as a solve result, used to compute an ETA, or used to determine what data is disclosed to a client

#### Scenario: The observed Node-vs-Chrome last-ULP disagreement changes no rule-bearing value
- **WHEN** the polar-board spike's projection code computes `Math.cos` for the same input in Node and in Chrome and the two runtimes disagree in the last ULP (`-42.83999999999999` vs `-42.83999999999998`)
- **THEN** no persisted value, solve result, or ETA differs between the two runs, because the only call site downstream of that disagreement is screen projection

### Requirement: Rule-Bearing Values Are Reproducible Across Build Targets of the Same Language
The system SHALL produce identical persisted values, solve results, ETAs, and disclosure decisions from every build target it runs on, including build targets of the same language whose floating-point contraction behaviour differs — today Go on `arm64` (which contracts multiply-add) and Go on `amd64` at its default microarchitecture level (which does not). Development machines and production SHALL NOT be permitted to disagree: a value that depends on the architecture the binary was compiled for is not a rule, and SHALL be made contraction-independent or discretized so the dependence cannot reach the result. This requirement governs every rule-bearing function in every Go package under `backend/` — not only functions shared between `backend/board` and `frontend/lib/board`, and not only functions whose input domain is enumerable. A same-language, cross-architecture divergence is exactly as much a hazard on a persisted lane-leg ETA computed entirely inside `backend/fleet`, a persisted galaxy coordinate computed entirely inside `backend/galaxy`, or a fog-of-war disclosure decision computed by `backend/board`'s `LineOfSight`/`BeamCells` (never persisted, but determining what a client is allowed to see), as it is on shared board math; neither `fleet` nor `galaxy` has a TypeScript mirror, and this requirement applies to them regardless. Where a function's input domain is enumerable within a bound a differential run can execute, the cross-target check evaluates it over that domain on both build targets. Where it is not — a continuous float domain, as in `fleet.legMs`/`laneLength`, `galaxy/generator.go`, or `corporations/siteselection.go` — the check instead inspects each build target's compiled output for architecture-dependent instruction selection (see design.md for the mechanism), because a differential run cannot enumerate the domain and a coverage gap there is not evidence of correctness. A rule-bearing function already known to violate this requirement SHALL be recorded as an open defect under `docs/defects/` and named as an entry in the capability's deviation register (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`), which this check consults and prints on every run.

#### Scenario: The same computation agrees across architectures
- **WHEN** a rule-bearing function is evaluated over its enumerable input domain on Go compiled for `arm64` and on Go compiled for `amd64`
- **THEN** both runs produce identical results for every input

#### Scenario: A non-enumerable domain is checked by inspecting compiled output
- **WHEN** a rule-bearing function's input domain is not enumerable within a bound a differential run can execute
- **THEN** the cross-target check inspects the function's compiled output on each build target for architecture-dependent instruction selection (for example, fused-multiply-add emitted on `arm64` and not on `amd64`)
- **AND** a function shown to select different instructions across targets is treated as a violation of this requirement unless named in the capability's deviation register

#### Scenario: A known cross-target deviation is registered, not silently tolerated
- **GIVEN** a rule-bearing function whose results differ between a contracting and a non-contracting build target
- **WHEN** the cross-target check runs
- **THEN** the check fails unless that function is named in the capability's deviation register with a referenced open defect
- **AND** the check fails for any register entry whose referenced defect is no longer open

### Requirement: Inexact Arithmetic Is Rule-Bearing Only Through a Discretized, Tie-Broken Choice
The system SHALL admit a value derived from inexact arithmetic into a persisted value, a solve result, an ETA, or a disclosure decision only after reducing it to a selection among a finite, enumerable candidate set under a fixed, documented order that breaks ties deterministically. Where a bound exists on the minimum separation between the winning and runner-up candidates over the whole input domain, and that bound exceeds the two languages' worst-case disagreement, the selection SHALL be identical on both sides for every input. Where no such bound exists — because a continuous input can place two candidates arbitrarily close — the capability SHALL designate one side of the seam as authoritative for the resulting value, and the non-authoritative side's computation SHALL be used only for presentation that the authoritative value supersedes. A change introducing a rule-bearing value derived from inexact arithmetic SHALL state in its proposal which branch applies; for the authority branch it SHALL name the authoritative side, the presentation surface, and the point at which the authoritative value replaces the presented one — establishing which branch applies is the burden of the change introducing the value, not a default a reviewer infers because no bound was proven. Designating an authoritative side resolves a disagreement only between two sides that exist; it does not resolve a disagreement inside the authoritative side, and it is not evidence that no such disagreement exists — that is a separate, empirical claim this requirement does not let a change assert without the sweep described below. Where the authoritative side's own inexact intermediate differs across its build targets, the discretization is the guarantee and the cross-build-target requirement applies unchanged — authority SHALL NOT be cited as the mitigation. The non-authoritative side's value SHALL NOT be persisted, transmitted as an input to a mutation, or used to compute any further rule-bearing value including a displayed ETA; it MAY only be rendered, and SHALL be replaced by the authoritative value once that value is available. This requirement governs every rule-bearing use of inexact arithmetic in the system whether or not a scenario below names it; a currently known use — including one that does not yet reduce to either the exact-bound or the authority branch — SHALL be carried as an entry in the capability's deviation register (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`), with its own open defect, rather than by requiring a dedicated scenario for each use in this spec.

#### Scenario: The lane gate is a discretized argmax with an authoritative side
- **WHEN** `LaneGateCell` (Go) and `laneGateCell` (TypeScript) derive a lane bearing vector from inexact galaxy coordinates and reduce it to the gate-ring slot whose pinned-table direction has the maximum dot product, ties broken by the lower slot index
- **THEN** the backend's selection is authoritative — it is what is persisted as `LaneTransit.EntryGate` and stamped into system reads and arrival
- **AND** the TypeScript mirror exists to keep the seam testable and to serve a future depart preview; it has no production consumer today, and any consumer added SHALL treat its result as superseded by the authoritative gate on commit

#### Scenario: The persisted gate is identical across the seam for every recorded case
- **WHEN** `LaneGateCell` and `laneGateCell` are each evaluated against every `laneGate` case in `fixtures/board/cases.json`
- **THEN** both return the identical gate cell for every case

#### Scenario: A measured near-tie divergence is a preview-fidelity defect, not a state fork
- **WHEN** a lane bearing falls within one ULP of exactly equidistant between two adjacent gate-ring candidates and the two languages select different candidates
- **THEN** the backend's selection is the one persisted and rendered after commit
- **AND** the divergence is recorded as an open preview-fidelity defect against `board-tactical-math`, not as a determinism failure of this capability

#### Scenario: Authority does not cover a same-side cross-target disagreement
- **GIVEN** the authoritative side derives a discretized choice from an inexact intermediate that differs across its own build targets
- **WHEN** the cross-target check evaluates the discretized choice on both of the authoritative side's build targets over the swept domain
- **THEN** any divergence in the selected candidate SHALL be filed as a defect and entered in the capability's deviation register
- **AND** authority SHALL NOT be cited as the mitigation for a same-side cross-target divergence — no scenario in this spec asserts the selection is stable across build targets absent that sweep having been run and found clean

### Requirement: Square Roots In Rules Are Pinned, Not Assumed
This requirement is **additional to**, and does not relax, `Rule-Bearing Values Cross the Seam By Exact Arithmetic or By Discretization`: a rule-bearing `sqrt` must already satisfy that requirement's discretization branch, and the fixture family below is an additional obligation on it, not a substitute for it. IF a rule-bearing computation (a persisted value, a solve result, an ETA, or a disclosure decision) applies `sqrt` to a runtime value, THEN a fixture family covering that computation SHALL exist in `fixtures/board/cases.json` (or a sibling fixtures file following the same both-languages-assert convention) and SHALL be asserted by both the Go and TypeScript suites, where a TypeScript mirror of the computation exists. Where the computation has no TypeScript mirror — a Go-only package such as `backend/fleet`, with no `frontend/lib` counterpart — the obligation is instead a Go-side fixture family, recorded and asserted across the Go build-target matrix (`arm64` and `amd64`/`GOAMD64=v1`) per `The Golden Fixture Reproduces On Every Build Target`; the both-languages-assert form of this requirement applies only where a mirror exists to assert against. IF a rule-bearing computation applies `sqrt` to a compile-time constant, THEN the two languages' values SHALL be asserted equal rather than assumed equal. Both cases exist because ECMAScript specifies `Math.sqrt` as implementation-approximated rather than correctly-rounded, so equality with Go's `math.Sqrt` is an observation about today's engines, not a guarantee. A rule-bearing `sqrt` computation already known not to have its required fixture family or equality assertion in place, and filed as an open defect under `docs/defects/`, SHALL be named as an entry in the capability's deviation register (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`) rather than this requirement being narrowed to exclude it.

#### Scenario: The polar board leaves no rule-bearing sqrt behind
- **WHEN** the rewritten board's rule-bearing surface is audited after the polar migration's board rewrite
- **THEN** no rule-bearing computation applies `sqrt` to a runtime value or a compile-time constant — geometric comparisons are carried squared on pinned-table integers — so this requirement currently binds no board call site (the retired hex layout's `sqrt(3)` direction constant left with the hex lattice)
- **AND** the requirement remains binding on any future introduction, which SHALL arrive with its fixture family or equality assertion

#### Scenario: A delta-v computation using sqrt is pinned
- **WHEN** a rule-bearing computation (for example, a Hohmann-transfer delta-v calculation, per `docs/plans/propellant-and-delta-v.md`) is introduced that applies `sqrt` to a runtime value
- **THEN** a fixture family covering that computation exists and is asserted, reproducing the same result, by both the Go and TypeScript test suites

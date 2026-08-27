## MODIFIED Requirements

### Requirement: Shared Board Math Is Pinned By a Cross-Language Golden Fixture
A function that computes a rule-bearing value and is implemented in both a Go package and a TypeScript module SHALL be covered by a cross-language golden fixture file; where no such file exists for that package pair, the change introducing the mirror SHALL create one. A rule-bearing Go package that computes persisted values, solve results, or ETAs, and that a change deliberately builds with no TypeScript mirror at all, SHALL likewise be covered by a golden fixture file — the trigger for this requirement is "the function is rule-bearing," not "a TypeScript mirror already exists to assert against"; a Go-only rule-bearing package is not exempt from this requirement merely because there is nothing on the other side of the seam to compare it to. Where a change designates one side of a capability authoritative and deliberately builds no mirror of it on the other side, this requirement's cross-language assertion narrows to the side(s) that exist (see `Rule-Bearing Values Are Reproducible Across Build Targets of the Same Language` and `The Golden Fixture Reproduces On Every Build Target` for what a Go-only family is still held to), and the guard against a mirror silently reappearing later is the anti-mirror check named below, not a `pairs` entry in a mirror map — a mirror map `pairs` entry asserts a mirror exists; an anti-mirror check asserts one does not. The system SHALL maintain, for each cross-language golden fixture file under `fixtures/`, a golden contract for every function shared between the corresponding Go implementation and its TypeScript mirror, grouped into named families (one family per shared function). The system SHALL maintain a mirror map naming every function defined in both a Go package and its TypeScript mirror, whether or not exported on either side; each pair in the map SHALL appear in a fixture family or in the coverage inventory. A mirror map for a capability designated Go-sole-authority (no TypeScript mirror) SHALL instead run in anti-mirror mode: it SHALL fail if any function name is declared in both the Go package and the designated non-mirror TypeScript directory, unless that name appears in an explicit, empty-by-default `sharedNames` allowlist recorded in the pair's mirror-map file. The anti-mirror check's name extraction SHALL enumerate every exported declaration in the designated non-mirror TypeScript directory — every line matching an `export` form — and classify each one into a declaration form the extractor recognizes (`function` declarations, arrow-function and function-expression bindings, class methods, and re-exported aliases); an exported declaration the extractor cannot classify SHALL fail the check, naming the offending file and line, rather than being silently skipped and counted as a pass, because a check whose extractor silently misses a form reports "pass" for the exact regression it exists to catch. `fixtures/board/cases.json` is the board-math instance of this discipline, asserted by `backend/board/fixtures_test.go` and `frontend/lib/board/fixtures.test.ts`; `fixtures/polar/cases.json` is the lattice-core instance, asserted by `backend/polar/fixtures_test.go` and `frontend/lib/polar/fixtures.test.ts`; `fixtures/market/cases.json` is the market-settlement instance, asserted by the corresponding Go and TypeScript settlement suites; `fixtures/space/cases.json` is the first Go-sole-authority instance, asserted only by `backend/space/fixtures_test.go` across the Go build-target matrix, with `frontend/lib/space` (render-only, if it exists at all) governed by the anti-mirror map instead of a `pairs` entry — all follow the rules below identically except where a rule is explicitly scoped to a mirrored pair. The Go and TypeScript test suites for a given mirrored fixture file SHALL assert their implementation reproduces every case in the file byte-for-byte; a Go-only fixture file SHALL be asserted byte-for-byte by its Go suite across the build-target matrix. A change to a shared function's behavior SHALL either reproduce the existing fixture unchanged or re-record it within the same change — a fixture update authored without the corresponding mirror-side change passing is not a valid state to merge (for a Go-only family, "the corresponding mirror-side change" means the change's own Go build-target matrix, not a TypeScript suite that does not exist). Re-recording SHALL be performed as a reviewable diff in the change's own commits; no automated pipeline SHALL regenerate a fixture file. A shared function whose input domain is enumerable within 10^6 inputs SHALL carry an exhaustive-sweep case in its fixture family: a digest recorded over the function's output for every input in that domain, in a canonical serialization both languages reproduce. For a function whose domain is a pair of polar cells, that domain is all ordered pairs of cells with ring indices at or below the sweep case's recorded maximum ring under the schedule the case names, enumerated by `fromRing`, then `fromSlot`, then `toRing`, then `toSlot`, all ascending, and the digest is the SHA-256 hash of the newline-joined decimal `ring:slot` serialization of the function's output for each input, in that fixed enumeration order both languages reproduce; where a function's domain is a cell pair plus additional parameters, the sweep is taken over the cell-pair domain at parameter values recorded in the fixture case, and a list-valued output is serialized as its cells' `ring:slot` forms joined by `,` on that input's line. A rule-bearing function whose input domain is not enumerable within 10^6 inputs — a continuous R³ or R² domain, as in `backend/space` — SHALL instead carry a pinned randomized-sweep case: the fixture record SHALL name the pseudo-random generator and its integer seed, the input box each coordinate is independently drawn from, the case count, and a SHA-256 digest computed over the newline-joined canonical serialization of the function's output for each drawn input, in draw order; the generator SHALL be pure integer arithmetic (for example `splitmix64` on an `int64` state), so the drawn inputs themselves are exactly reproducible on every build target the family is asserted on. The record SHALL additionally pin the mapping from the generator's integer output to a drawn coordinate (a form using only exact operations, for example `float64(u >> 11) * 0x1p-53`, scaled and offset onto the recorded box with an explicit `float64(...)` conversion around the product (`lo + float64(f*(hi-lo))`), so no fused multiply-add can reach a drawn coordinate on a contracting build target), the order in which an input's coordinates consume generator words, and the exact output serialization, which SHALL be a lossless binary-exponent form (`strconv.FormatFloat(v, 'b', -1, 64)` and its equivalent) rather than any decimal form, with a multi-component output serialized as its components joined by `,` on that input's line and an error outcome serialized as a fixed sentinel token — because a decimal serialization cannot express the last-ULP divergence the sweep exists to catch, and an unpinned draw mapping means the same seed selects a different domain in a re-recording. Hand-selected cases document intent; the exhaustive or randomized sweep is what makes the family a contract, because a divergence that occupies a small fraction of the input domain cannot be hand-selected for by someone who does not yet know it exists. A family whose function is under an open cross-target divergence defect SHALL record its sweep case as part of the change resolving that defect, and SHALL be named in the capability's deviation register until then (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`). Each fixture family SHALL cover exactly one shared function. A shared function with no fixture family SHALL be listed in the coverage inventory with the change expected to cover it; a rule-bearing shared function SHALL NOT remain in the inventory across more than one change that modifies its package.

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

#### Scenario: A rule-bearing Go-only package is bound by this requirement despite having no mirror
- **WHEN** a change introduces a rule-bearing Go package that computes persisted values, solve results, or ETAs, and deliberately builds no TypeScript mirror of it
- **THEN** that package's rule-bearing functions are still covered by a golden fixture file, asserted across the Go build-target matrix
- **AND** the absence of a TypeScript mirror does not exempt the package from this requirement

#### Scenario: A randomized sweep pins a function over a non-enumerable domain
- **WHEN** a fixture family's randomized-sweep case is recomputed from its recorded PRNG, seed, input box, and case count
- **THEN** the recomputed digest equals the recorded digest
- **AND** the same PRNG and seed reproduce the identical sequence of drawn inputs on every build target the family is asserted on

#### Scenario: A Go-sole-authority capability's mirror map runs in anti-mirror mode
- **WHEN** `check-mirror-map.sh` evaluates the mirror map for a capability designated Go-sole-authority
- **THEN** it fails if any function name is declared in both the Go package and the designated non-mirror TypeScript directory and that name is absent from the map's `sharedNames` allowlist
- **AND** it does not require — and a normal `pairs` entry SHALL NOT be added to assert — that a TypeScript implementation of any such function exists

#### Scenario: A declaration form the extractor has no rule for fails the check rather than passing
- **WHEN** the designated non-mirror TypeScript directory declares a function in a form the anti-mirror extractor has no extraction rule for
- **THEN** the check exits non-zero naming that file and line
- **AND** it does not report a pass on the grounds that no name collision was found

### Requirement: Rule-Bearing Values Cross the Seam By Exact Arithmetic or By Discretization
The system SHALL compute every value that is persisted, returned as a solve result, used to compute an ETA, or used to determine what data is disclosed to a client either (a) by arithmetic whose result is identical in Go and in JavaScript for every input, or (b) by reducing an inexact intermediate to a discrete choice among a finite, enumerable candidate set under a fixed total order (see the discretized-choice requirement). Arithmetic qualifying under (a) is limited to integer arithmetic whose every intermediate is exactly representable on both sides (magnitude below 2^53 in JavaScript, or carried in arbitrary-precision integers where Go's `int64` semantics — notably truncating division — must be reproduced); to IEEE-754 `+`, `−`, `×`, `÷` on 64-bit floats where each operation's result is separately rounded; to `%`/`math.Mod` (modulo, exact for the same reason `+`/`−`/`×`/`÷` are, since it is not a fused operation); and to `math.Floor`/`Math.floor`, `math.Trunc`/`Math.trunc`, `math.Abs`/`Math.abs`, `math.Min`/`Math.min`, `math.Max`/`Math.max`, `math.Ceil`/`Math.ceil`, and float-to-integer truncation for values whose truncated magnitude is below 2^53, all of which both languages define identically within that bound for every finite input. An expression in which a multiplication's result is an operand of an adjacent addition or subtraction — `a + b*c`, `a - b*c`, and the same shapes reached across statements or through an intervening local variable — does not satisfy that condition in Go, whose specification permits fusing them into one rounded operation and whose compiler does so on `arm64`. Assigning the product to a local variable does not inhibit the fusion; only an explicit `float64(...)` conversion around the product is guaranteed by the Go specification to force the intermediate rounding. Such an expression SHALL therefore either be written with that conversion or be restructured so that no multiplication is adjacent to an addition. JavaScript rounds every operation separately and needs no equivalent construct. Arithmetic NOT qualifying under (a) further includes the transcendental functions (`sin`, `cos`, `tan`, `atan2`, `ln`, `exp`, `pow`), whose Go implementations are themselves built from contraction-sensitive polynomial evaluation and consequently differ across Go build targets as well as across the language seam, and `sqrt`, which is correctly-rounded and therefore identical across Go build targets but is NOT guaranteed identical across the language seam, because ECMAScript specifies `Math.sqrt` as implementation-approximated rather than correctly-rounded (see `Square Roots In Rules Are Pinned, Not Assumed`); and `math.Round`/`Math.round`, which is not a last-ULP effect but a guaranteed, 100%-of-input disagreement on every negative half-integer, because Go rounds half away from zero and JavaScript rounds half toward positive infinity. A rule-bearing value that needs "round to nearest" SHALL use an explicit, spec'd tie-break construction that both languages compute identically (for example, a deliberately ported "round half away from zero" helper), never the bare `math.Round`/`Math.round` builtins; the transcendental-drift check SHALL also flag a bare `math.Round`/`Math.round` call reaching a rule-bearing value, outside a colocated pragma. The colocated-pragma vocabulary the transcendental-drift check accepts is exactly three terms: `determinism:allow(discretized)`, for a call site whose result is immediately reduced to a discrete choice among a finite, tie-broken candidate set (see the discretized-choice requirement); `determinism:allow(projection)`, for render-only pixel or path-sampling math that is never persisted, never a solve result, never an ETA input, and never a disclosure decision; and `determinism:allow(pinned)`, for a call site whose cross-build-target identity is established by a Go-side fixture family asserted across the build-target matrix rather than by discretization or projection — the mechanism a pinned constant table's one recording flow, or a Go-only `sqrt` family under `Square Roots In Rules Are Pinned, Not Assumed`, relies on. Projection of a logical position to screen or pixel space, and path sampling performed only for rendering (never fed back into stored state, a solve result, an ETA, or a disclosure decision), are exempt from this requirement, as is the fixture-recording flow that generates a pinned constant table (see `Pinned Constant Tables Are Recorded, Asserted, Never Recomputed`). A rule-bearing value already known not to satisfy this requirement, and filed as an open defect under `docs/defects/`, SHALL be named as an entry in the capability's deviation register (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`) rather than the requirement being narrowed to exclude it.

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

#### Scenario: A pinned-table call site is admitted under the pinned pragma
- **WHEN** a rule-bearing computation calls `math.Sqrt` (or another otherwise-flagged function) on a call path whose cross-build-target identity is established by a recorded, asserted Go-side fixture family rather than by discretization or projection
- **THEN** the call site carries a colocated `determinism:allow(pinned)` pragma naming that fixture family
- **AND** the transcendental-drift check treats the site as reviewed rather than flagging it as an unreviewed call

### Requirement: The Golden Fixture Reproduces On Every Build Target
The system SHALL reproduce each cross-language golden fixture file under `fixtures/` identically from build targets whose floating-point contraction behaviour differs. Each such file SHALL record the build target it was generated on. For a fixture file covering a function mirrored in both Go and TypeScript, the automated check SHALL assert the file reproduces on `GOARCH=arm64`, on `GOARCH=amd64` with `GOAMD64=v1`, and in the JavaScript runtime. For a fixture file covering a rule-bearing Go package deliberately built with no TypeScript mirror, the automated check SHALL assert the file reproduces on `GOARCH=arm64` and on `GOARCH=amd64` with `GOAMD64=v1`; it SHALL NOT be required to reproduce in a JavaScript runtime, and the fixture file itself SHALL record that it has no JavaScript-runtime leg by design, so a reader encounters a stated choice rather than an apparent gap. The deployed backend SHALL be built at a pinned `GOARCH`/`GOAMD64`. A fixture that reproduces only on the machine that recorded it pins that machine, not the contract. The `amd64`/`GOAMD64=v1` leg and, where applicable, the JavaScript-runtime leg of this matrix SHALL be asserted on the merge-request pipeline for any change touching a mirrored package or a fixture file under `fixtures/`. The `arm64` leg SHALL be asserted there too once an `arm64` runner or an emulated `arm64` target is available in CI; until then, it SHALL be asserted by the local `/check` gate — a deliberate, stated downgrade of that one leg, not an unstated gap.

#### Scenario: The fixture is asserted on the full build-target matrix
- **WHEN**, for a fixture file covering a mirrored package, the Go fixture suite is run compiled for `GOARCH=arm64`, again compiled for `GOARCH=amd64` with `GOAMD64=v1`, and the TypeScript fixture suite is run in the JavaScript runtime
- **THEN** every recorded case in that fixture file reproduces identically on all three

#### Scenario: A contraction-dependent case fails a target in the matrix
- **WHEN** a newly recorded case's value depends on whether the build target contracts multiply-add
- **THEN** at least one target in the matrix fails on that case
- **AND** the case is not merged as recorded — either the computation is made contraction-independent, or the value is discretized so the dependence cannot reach the recorded output

#### Scenario: The fixture records its recording provenance
- **WHEN** a fixture file under `fixtures/` is generated or re-recorded
- **THEN** the file records the `GOARCH` (and `GOAMD64` level, where applicable) it was generated on, so a claim that the check ran "a target other than the one it was recorded on" is verifiable rather than assumed

#### Scenario: An unpinned GOAMD64 build target is out of compliance
- **WHEN** the deployed backend is built without an explicit `GOAMD64` level pinned in its build configuration
- **THEN** the build-configuration check fails, reporting the absent `GOAMD64` pin, because `GOAMD64=v3` and higher emit fused multiply-add on `amd64` too, which would silently turn production into a contracting target while every stated check still passes

#### Scenario: A Go-only fixture family has no JavaScript-runtime leg by design
- **WHEN** a fixture file covers a rule-bearing Go package with no TypeScript mirror and is asserted on `GOARCH=arm64` and `GOARCH=amd64`/`GOAMD64=v1`
- **THEN** both Go legs reproduce every recorded case identically
- **AND** the absence of a JavaScript-runtime leg is not treated as a failure, because the fixture file itself records that this family has no such leg by design

### Requirement: Pinned Constant Tables Are Recorded, Asserted, Never Recomputed
IF a rule-bearing computation depends on constant values whose derivation
uses arithmetic outside this capability's exact set (trigonometric
functions, `sqrt`, or any contraction-sensitive expression), THEN those
values SHALL be produced only by a recording flow — the sole place that
arithmetic executes — committed as data, loaded (never recomputed) at
runtime by every implementation, and re-recorded only as a reviewable diff
in a change's own commits. Where the table is consumed on both sides of a
mirrored pair, it SHALL be asserted byte-identical across the language seam
and the Go build-target matrix by the fixture suites. Where the table
belongs to a capability deliberately built Go-sole-authority with no
TypeScript mirror, it SHALL instead be asserted byte-identical across the Go
build-target matrix alone, by the Go fixture suite, per `The Golden Fixture
Reproduces On Every Build Target`'s Go-only branch — the absence of a
language-seam assertion for such a table is a recorded consequence of that
capability's own authority decision, not a narrowing of this requirement.
Runtime use of a pinned table SHALL be exact arithmetic per `Rule-Bearing Values
Cross the Seam By Exact Arithmetic or By Discretization`; the pinning is
what admits the inexact derivation, exactly as the sqrt-pinning
requirement admits a pinned root. The board's pinned coordinate table
(`board-tactical-math` › A Pinned Coordinate Table Grounds Board
Geometry) is the first instance; a Go-sole-authority capability's own pinned
table (for example, `backend/space`'s two-level sub-turn table) is a later
instance asserted under this requirement's Go-only branch.

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

#### Scenario: A Go-only pinned table reproduces across the Go build-target matrix with no language-seam assertion
- **WHEN** a pinned constant table belonging to a Go-sole-authority capability with no TypeScript mirror is asserted by its Go fixture suite compiled for `GOARCH=arm64` and for `GOARCH=amd64` with `GOAMD64=v1`
- **THEN** every entry is byte-identical on both Go build targets
- **AND** the absence of a JavaScript-runtime assertion for that table is not treated as a failure, because the table's fixture file records that the capability has no TypeScript mirror by design

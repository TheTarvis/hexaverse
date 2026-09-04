## ADDED Requirements

### Requirement: Rule-Bearing Square Roots Are Pinned By a Recorded Fixture Family
This requirement is **additional to**, and does not relax, `Rule-Bearing Values Cross the Seam By Exact Arithmetic or By Discretization`: a rule-bearing `sqrt` must already satisfy that requirement's discretization branch, and the fixture family below is an additional obligation on it, not a substitute for it. IF a rule-bearing computation (a persisted value, a solve result, an ETA, or a disclosure decision) applies `sqrt` to a runtime value, THEN a fixture family covering that computation SHALL exist under `fixtures/` and SHALL be asserted by both the Go and TypeScript suites where a TypeScript mirror of the computation exists. Where the computation has no TypeScript mirror — a Go-sole-authority package such as `backend/space`, `backend/system` or `backend/fleet`, with no `frontend/lib` counterpart — the obligation is instead a Go-side fixture family, recorded and asserted across the Go build-target matrix (`arm64` and `amd64`/`GOAMD64=v1`) per `The Golden Fixture Reproduces On Every Build Target`; the both-languages-assert form of this requirement applies only where a mirror exists to assert against. IF a rule-bearing computation applies `sqrt` to a compile-time constant, THEN the two languages' values SHALL be asserted equal rather than assumed equal. Both cases exist because ECMAScript specifies `Math.sqrt` as implementation-approximated rather than correctly-rounded, so equality with Go's `math.Sqrt` is an observation about today's engines, not a guarantee. A rule-bearing `sqrt` computation already known not to have its required fixture family or equality assertion in place, and filed as an open defect under `docs/defects/`, SHALL be named as an entry in the capability's deviation register (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`) rather than this requirement being narrowed to exclude it.

#### Scenario: Every surviving rule-bearing sqrt call site names its pinning family
- **WHEN** the backend's rule-bearing surface is audited for runtime `sqrt`
  call sites
- **THEN** each such site is covered by a recorded fixture family asserted
  across the Go build-target matrix and carries a colocated
  `determinism:allow(pinned)` pragma naming that family
- **AND** a site found with neither a family nor a register entry fails the
  audit rather than being accepted as previously reviewed

#### Scenario: A delta-v computation using sqrt is pinned
- **WHEN** a rule-bearing computation (for example, the brachistochrone
  flight-time and delta-v solve) applies `sqrt` to a runtime value
- **THEN** a fixture family covering that computation exists and is
  asserted, reproducing the same result on every build target the family is
  recorded across

#### Scenario: A newly introduced rule-bearing sqrt arrives with its family
- **WHEN** a change introduces a rule-bearing computation applying `sqrt` to
  a runtime value with no fixture family covering it
- **THEN** the change is not complete until that family is recorded and
  asserted, or the site is filed as an open defect and entered in the
  deviation register

## MODIFIED Requirements

### Requirement: Shared Board Math Is Pinned By a Cross-Language Golden Fixture
A function that computes a rule-bearing value and is implemented in both a Go package and a TypeScript module SHALL be covered by a cross-language golden fixture file; where no such file exists for that package pair, the change introducing the mirror SHALL create one. A rule-bearing Go package that computes persisted values, solve results, or ETAs, and that a change deliberately builds with no TypeScript mirror at all, SHALL likewise be covered by a golden fixture file — the trigger for this requirement is "the function is rule-bearing," not "a TypeScript mirror already exists to assert against"; a Go-only rule-bearing package is not exempt from this requirement merely because there is nothing on the other side of the seam to compare it to. Where a change designates one side of a capability authoritative and deliberately builds no mirror of it on the other side, this requirement's cross-language assertion narrows to the side(s) that exist (see `Rule-Bearing Values Are Reproducible Across Build Targets of the Same Language` and `The Golden Fixture Reproduces On Every Build Target` for what a Go-only family is still held to), and the guard against a mirror silently reappearing later is the anti-mirror check named below, not a `pairs` entry in a mirror map — a mirror map `pairs` entry asserts a mirror exists; an anti-mirror check asserts one does not. The system SHALL maintain, for each cross-language golden fixture file under `fixtures/`, a golden contract for every function shared between the corresponding Go implementation and its TypeScript mirror, grouped into named families (one family per shared function). The system SHALL maintain a mirror map naming every function defined in both a Go package and its TypeScript mirror, whether or not exported on either side; each pair in the map SHALL appear in a fixture family or in the coverage inventory. A mirror map for a capability designated Go-sole-authority (no TypeScript mirror) SHALL instead run in anti-mirror mode: it SHALL fail if any function name is declared in both the Go package and the designated non-mirror TypeScript directory, unless that name appears in an explicit, empty-by-default `sharedNames` allowlist recorded in the pair's mirror-map file. That name comparison, and the `sharedNames` allowlist match, SHALL be case-insensitive, because Go exports in TitleCase and TypeScript declares in camelCase, so a case-sensitive comparison never collides on the mirror it exists to catch — `ArcParam` and `arcParam` are the same function under two spellings, and a check that reports "no shared names" for that pair reports a pass for the exact regression it exists to catch; a collision under case-insensitive comparison SHALL be resolved by renaming the TypeScript function to a subject-prefixed, draw-scoped name rather than by widening the allowlist. The anti-mirror check's Go-side name extraction SHALL enumerate every top-level function declared in the authoritative Go package, **whether or not it is exported**, because an unexported Go helper reproduced in TypeScript is the same rule-bearing mirror as an exported one under a different spelling. The anti-mirror check's TypeScript-side name extraction SHALL enumerate every exported declaration in the designated non-mirror TypeScript directory — every line matching an `export` form — **searched recursively through that directory's whole subtree and across both `.ts` and `.tsx` files**, since a scan limited to one directory level or to one file extension reports "no shared names" for a mirror it never looked at, which is a silent pass for the exact regression the check exists to catch — and classify each one into a declaration form the extractor recognizes (`function` declarations, arrow-function and function-expression bindings, class methods, and re-exported aliases); an exported declaration the extractor cannot classify SHALL fail the check, naming the offending file and line, rather than being silently skipped and counted as a pass, because a check whose extractor silently misses a form reports "pass" for the exact regression it exists to catch. `fixtures/market/cases.json` is this capability's only mirrored-pair instance of the discipline, asserted by `backend/market/fixtures_test.go` and `frontend/lib/market/fold.test.ts` and mapped by `fixtures/market/mirror-map.json`; `fixtures/space/cases.json`, `fixtures/system/cases.json`, `fixtures/fleet/cases.json`, `fixtures/galaxy/cases.json` and `fixtures/disclosure/mirror-map.json` are the Go-sole-authority instances, asserted only by their own Go suites across the Go build-target matrix, with their TypeScript counterparts (render-only, where they exist at all) governed by an anti-mirror map instead of a `pairs` entry — all follow the rules below identically except where a rule is explicitly scoped to a mirrored pair. The Go and TypeScript test suites for a given mirrored fixture file SHALL assert their implementation reproduces every case in the file byte-for-byte; a Go-only fixture file SHALL be asserted byte-for-byte by its Go suite across the build-target matrix. A change to a shared function's behavior SHALL either reproduce the existing fixture unchanged or re-record it within the same change — a fixture update authored without the corresponding mirror-side change passing is not a valid state to merge (for a Go-only family, "the corresponding mirror-side change" means the change's own Go build-target matrix, not a TypeScript suite that does not exist). Re-recording SHALL be performed as a reviewable diff in the change's own commits; no automated pipeline SHALL regenerate a fixture file. A shared function whose input domain is enumerable within 10^6 inputs SHALL carry an exhaustive-sweep case in its fixture family: a digest recorded over the function's output for every input in that domain, in a canonical serialization both languages reproduce. The fixture case SHALL record that domain's bound, the exact ascending enumeration order over it, and the exact output serialization, in enough detail that the enumeration is reconstructible from the record alone by an implementation that has never seen the recording code; where a function's domain is that enumerable domain plus additional parameters, the sweep is taken over the enumerable domain at parameter values recorded in the fixture case, and a list-valued output is serialized in a form the case names. A rule-bearing function whose input domain is not enumerable within 10^6 inputs — a continuous R³ or R² domain, as in `backend/space` — SHALL instead carry a pinned randomized-sweep case: the fixture record SHALL name the pseudo-random generator and its integer seed, the input box each coordinate is independently drawn from, the case count, and a SHA-256 digest computed over the newline-joined canonical serialization of the function's output for each drawn input, in draw order; the generator SHALL be pure integer arithmetic (for example `splitmix64` on an `int64` state), so the drawn inputs themselves are exactly reproducible on every build target the family is asserted on. The record SHALL additionally pin the mapping from the generator's integer output to a drawn coordinate (a form using only exact operations, for example `float64(u >> 11) * 0x1p-53`, scaled and offset onto the recorded box with an explicit `float64(...)` conversion around the product (`lo + float64(f*(hi-lo))`), so no fused multiply-add can reach a drawn coordinate on a contracting build target), the order in which an input's coordinates consume generator words, and the exact output serialization, which SHALL be a lossless binary-exponent form (`strconv.FormatFloat(v, 'b', -1, 64)` and its equivalent) rather than any decimal form, with a multi-component output serialized as its components joined by `,` on that input's line and an error outcome serialized as a fixed sentinel token — because a decimal serialization cannot express the last-ULP divergence the sweep exists to catch, and an unpinned draw mapping means the same seed selects a different domain in a re-recording. Hand-selected cases document intent; the exhaustive or randomized sweep is what makes the family a contract, because a divergence that occupies a small fraction of the input domain cannot be hand-selected for by someone who does not yet know it exists. A family whose function is under an open cross-target divergence defect SHALL record its sweep case as part of the change resolving that defect, and SHALL be named in the capability's deviation register until then (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`). Each fixture family SHALL cover exactly one shared function. A shared function with no fixture family SHALL be listed in the coverage inventory with the change expected to cover it; a rule-bearing shared function SHALL NOT remain in the inventory across more than one change that modifies its package.

#### Scenario: Both languages assert the same fixture file
- **WHEN** the Go and TypeScript test suites run against an unmodified mirrored-pair fixture file (today `fixtures/market/cases.json`)
- **THEN** both suites read every case from that one file
- **AND** both suites pass, having independently reproduced every recorded case

#### Scenario: A one-sided Go change fails the golden fixture
- **WHEN** a change alters a shared function's behavior in a mirrored Go package (today `backend/market`) without re-recording that pair's fixture file or updating its TypeScript mirror to match
- **THEN** that package's Go fixture suite fails on the case(s) whose recorded output no longer matches the new Go behavior

#### Scenario: A re-recorded fixture the mirror doesn't reproduce fails
- **WHEN** a mirrored pair's fixture file is re-recorded from a new Go implementation but its TypeScript mirror is not updated to reproduce the new values
- **THEN** that mirror's TypeScript fixture suite fails on the case(s) whose recorded output the unmodified TypeScript implementation cannot reproduce

#### Scenario: An exhaustive sweep case pins a function over its whole domain
- **WHEN** the Go and TypeScript suites each recompute a sweep case's digest from their own implementation
- **THEN** both digests equal the recorded digest
- **AND** a divergence on any single input in the swept domain fails the case, even when every hand-selected case in the same family reproduces

#### Scenario: An uncovered mirrored function is caught by the coverage inventory check
- **WHEN** a function is defined in both a Go package and its TypeScript mirror (exported or not)
- **THEN** the capability's mirror map names the pair, and the pair appears either in a fixture family or in the coverage inventory
- **AND** the check fails if a function in either mirror is absent from the map

#### Scenario: A fixture-only change runs both language suites in CI
- **WHEN** a commit or merge request modifies any file under `fixtures/`
- **THEN** the CI stage running the Go fixture suites and the CI stage running the TypeScript fixture suites both execute for that commit or merge request, regardless of whether `backend/**` or `frontend/**` files are also touched

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

#### Scenario: A lower-camel twin of an authoritative Go export fails the check
- **WHEN** the designated non-mirror TypeScript directory declares a function whose name differs from an authoritative Go export's name only by letter case
- **THEN** the check exits non-zero, naming that name as a collision
- **AND** it does not report a pass on the grounds that the two spellings differ

#### Scenario: A declaration form the extractor has no rule for fails the check rather than passing
- **WHEN** the designated non-mirror TypeScript directory declares a function in a form the anti-mirror extractor has no extraction rule for
- **THEN** the check exits non-zero naming that file and line
- **AND** it does not report a pass on the grounds that no name collision was found

#### Scenario: A twin in a subdirectory or a .tsx file fails the check
- **WHEN** the designated non-mirror TypeScript directory declares a case-insensitive twin of an authoritative Go function in a **subdirectory** of that directory, or in a `.tsx` rather than a `.ts` file
- **THEN** the check exits non-zero, naming that name as a collision
- **AND** it does not report a pass on the grounds that the file lay below the directory's top level or carried a different extension

#### Scenario: An unexported Go function counts as an authoritative name
- **WHEN** the designated non-mirror TypeScript directory declares a case-insensitive twin of an **unexported** top-level function in the authoritative Go package
- **THEN** the check exits non-zero, naming that name as a collision
- **AND** it does not report a pass on the grounds that the Go function is unexported

### Requirement: Rule-Bearing Values Cross the Seam By Exact Arithmetic or By Discretization
The system SHALL compute every value that is persisted, returned as a solve result, used to compute an ETA, or used to determine what data is disclosed to a client either (a) by arithmetic whose result is identical in Go and in JavaScript for every input, or (b) by reducing an inexact intermediate to a discrete choice among a finite, enumerable candidate set under a fixed total order (see the discretized-choice requirement). Arithmetic qualifying under (a) is limited to integer arithmetic whose every intermediate is exactly representable on both sides (magnitude below 2^53 in JavaScript, or carried in arbitrary-precision integers where Go's `int64` semantics — notably truncating division — must be reproduced); to IEEE-754 `+`, `−`, `×`, `÷` on 64-bit floats where each operation's result is separately rounded; to `%`/`math.Mod` (modulo, exact for the same reason `+`/`−`/`×`/`÷` are, since it is not a fused operation); and to `math.Floor`/`Math.floor`, `math.Trunc`/`Math.trunc`, `math.Abs`/`Math.abs`, `math.Min`/`Math.min`, `math.Max`/`Math.max`, `math.Ceil`/`Math.ceil`, and float-to-integer truncation for values whose truncated magnitude is below 2^53, all of which both languages define identically within that bound for every finite input. An expression in which a multiplication's result is an operand of an adjacent addition or subtraction — `a + b*c`, `a - b*c`, and the same shapes reached across statements or through an intervening local variable — does not satisfy that condition in Go, whose specification permits fusing them into one rounded operation and whose compiler does so on `arm64`. Assigning the product to a local variable does not inhibit the fusion; only an explicit `float64(...)` conversion around the product is guaranteed by the Go specification to force the intermediate rounding. Such an expression SHALL therefore either be written with that conversion or be restructured so that no multiplication is adjacent to an addition. JavaScript rounds every operation separately and needs no equivalent construct. Arithmetic NOT qualifying under (a) further includes the transcendental functions (`sin`, `cos`, `tan`, `atan2`, `ln`, `exp`, `pow`), whose Go implementations are themselves built from contraction-sensitive polynomial evaluation and consequently differ across Go build targets as well as across the language seam, and `sqrt`, which is correctly-rounded and therefore identical across Go build targets but is NOT guaranteed identical across the language seam, because ECMAScript specifies `Math.sqrt` as implementation-approximated rather than correctly-rounded (see `Rule-Bearing Square Roots Are Pinned By a Recorded Fixture Family`); and `math.Round`/`Math.round`, which is not a last-ULP effect but a guaranteed, 100%-of-input disagreement on every negative half-integer, because Go rounds half away from zero and JavaScript rounds half toward positive infinity. A rule-bearing value that needs "round to nearest" SHALL use an explicit, spec'd tie-break construction that both languages compute identically (for example, a deliberately ported "round half away from zero" helper), never the bare `math.Round`/`Math.round` builtins; the transcendental-drift check SHALL also flag a bare `math.Round`/`Math.round` call reaching a rule-bearing value, outside a colocated pragma. The colocated-pragma vocabulary the transcendental-drift check accepts is exactly three terms: `determinism:allow(discretized)`, for a call site whose result is immediately reduced to a discrete choice among a finite, tie-broken candidate set (see the discretized-choice requirement); `determinism:allow(projection)`, for render-only pixel or path-sampling math that is never persisted, never a solve result, never an ETA input, and never a disclosure decision; and `determinism:allow(pinned)`, for a call site whose cross-build-target identity is established by a Go-side fixture family asserted across the build-target matrix rather than by discretization or projection — the mechanism a pinned constant table's one recording flow, or a Go-only `sqrt` family under `Rule-Bearing Square Roots Are Pinned By a Recorded Fixture Family`, relies on. Projection of a logical position to screen or pixel space, and path sampling performed only for rendering (never fed back into stored state, a solve result, an ETA, or a disclosure decision), are exempt from this requirement, as is the fixture-recording flow that generates a pinned constant table (see `Pinned Constant Tables Are Recorded, Asserted, Never Recomputed`). A rule-bearing value already known not to satisfy this requirement, and filed as an open defect under `docs/defects/`, SHALL be named as an entry in the capability's deviation register (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`) rather than the requirement being narrowed to exclude it.

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
- **WHEN** the space view's projection code computes `Math.cos` for the same input in Node and in Chrome and the two runtimes disagree in the last ULP (`-42.83999999999999` vs `-42.83999999999998`)
- **THEN** no persisted value, solve result, or ETA differs between the two runs, because the only call site downstream of that disagreement is screen projection

#### Scenario: A pinned-table call site is admitted under the pinned pragma
- **WHEN** a rule-bearing computation calls `math.Sqrt` (or another otherwise-flagged function) on a call path whose cross-build-target identity is established by a recorded, asserted Go-side fixture family rather than by discretization or projection
- **THEN** the call site carries a colocated `determinism:allow(pinned)` pragma naming that fixture family
- **AND** the transcendental-drift check treats the site as reviewed rather than flagging it as an unreviewed call

### Requirement: Rule-Bearing Values Are Reproducible Across Build Targets of the Same Language
The system SHALL produce identical persisted values, solve results, ETAs, and disclosure decisions from every build target it runs on, including build targets of the same language whose floating-point contraction behaviour differs — today Go on `arm64` (which contracts multiply-add) and Go on `amd64` at its default microarchitecture level (which does not). Development machines and production SHALL NOT be permitted to disagree: a value that depends on the architecture the binary was compiled for is not a rule, and SHALL be made contraction-independent or discretized so the dependence cannot reach the result. This requirement governs every rule-bearing function in every Go package under `backend/` — not only functions shared with a TypeScript mirror, and not only functions whose input domain is enumerable. A same-language, cross-architecture divergence is exactly as much a hazard on a persisted lane-leg ETA computed entirely inside `backend/fleet`, a persisted galaxy coordinate computed entirely inside `backend/galaxy`, or a proximity-disclosure decision computed entirely inside `backend/disclosure` (never persisted, but determining what a client is allowed to see), as it is on a function with a TypeScript mirror; none of `fleet`, `galaxy` or `disclosure` has a TypeScript mirror, and this requirement applies to them regardless. Where a function's input domain is enumerable within a bound a differential run can execute, the cross-target check evaluates it over that domain on both build targets. Where it is not — a continuous float domain, as in `fleet.legMs`/`laneLength`, `galaxy/generator.go`, or `corporations/siteselection.go` — the check instead inspects each build target's compiled output for architecture-dependent instruction selection (see design.md for the mechanism), because a differential run cannot enumerate the domain and a coverage gap there is not evidence of correctness. A rule-bearing function already known to violate this requirement SHALL be recorded as an open defect under `docs/defects/` and named as an entry in the capability's deviation register (see `The Capability's Deviation Register Bridges Known Violations Across Its Checks`), which this check consults and prints on every run.

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
- **WHEN** `system.gateOrbit` (Go) derives a lane bearing vector from inexact galaxy coordinates and reduces it, through `space.PhaseIndexOf`, to the sub-turn index whose pinned-table direction has the maximum dot product, ties broken by the lower index
- **THEN** the backend's selection is authoritative — it is the gate body's stored phase, and the position every disclosure, dock and jump decision resolves through
- **AND** no TypeScript mirror of that derivation exists or may be added: `backend/system` is designated Go-sole-authority and the anti-mirror check enforces it, so the presentation side consumes the served gate position rather than recomputing it

#### Scenario: The persisted gate is identical across the seam for every recorded case
- **WHEN** `system.gateOrbit` is evaluated against every case in `fixtures/system/cases.json`'s `gateOrbit` family, on Go compiled for `GOARCH=arm64` and on Go compiled for `GOARCH=amd64` with `GOAMD64=v1`
- **THEN** both build targets return the identical gate phase for every case

#### Scenario: A measured near-tie divergence is a preview-fidelity defect, not a state fork
- **WHEN** a lane bearing falls within one ULP of exactly equidistant between two adjacent gate-ring candidates and the two languages select different candidates
- **THEN** the backend's selection is the one persisted and rendered after commit
- **AND** the divergence is recorded as an open preview-fidelity defect against the capability that owns the presentation surface, not as a determinism failure of this capability

#### Scenario: Authority does not cover a same-side cross-target disagreement
- **GIVEN** the authoritative side derives a discretized choice from an inexact intermediate that differs across its own build targets
- **WHEN** the cross-target check evaluates the discretized choice on both of the authoritative side's build targets over the swept domain
- **THEN** any divergence in the selected candidate SHALL be filed as a defect and entered in the capability's deviation register
- **AND** authority SHALL NOT be cited as the mitigation for a same-side cross-target divergence — no scenario in this spec asserts the selection is stable across build targets absent that sweep having been run and found clean

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
requirement admits a pinned root. `backend/space`'s two-level sub-turn
table is this capability's instance today, asserted under this
requirement's Go-only branch; the retired polar board's pinned coordinate
table was the first instance and went with it.

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

## REMOVED Requirements

### Requirement: Square Roots In Rules Are Pinned, Not Assumed
**Reason**: Superseded by "Rule-Bearing Square Roots Are Pinned By a
Recorded Fixture Family" above. Its normative body is carried forward
unchanged apart from repointing `fixtures/board/cases.json` to `fixtures/`
generally, but its first scenario ("The polar board leaves no rule-bearing
sqrt behind") asserts that the requirement "currently binds no board call
site" — a claim that is both about a deleted package and, worse, permanently
unfailable once that package is gone, which is exactly the vacuously-green
scenario this project has already shipped twice. The archiver refuses a
MODIFIED block that omits a live scenario, so replacing it requires this
shape.
**Migration**: None. The surviving scenario "A delta-v computation using
sqrt is pinned" is carried into the ADDED requirement, generalized from a
hypothetical Hohmann example to the brachistochrone solve that actually
ships. The dropped board-audit scenario is replaced by "Every surviving
rule-bearing sqrt call site names its pinning family", which asserts the
same audit against the call sites that remain — `system.keplerPeriodMs` and
`space`'s flight-time and delta-v solve — and can therefore still fail.

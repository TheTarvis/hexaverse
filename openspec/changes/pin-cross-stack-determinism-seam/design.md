## Context

`fixtures/board/cases.json` pins nine contract families
(`line 3 · routeAround 5 · orbState 12 · solveHex 2 · solveIntercept 4 ·
laneGate 10 · stateAt 6 · lineOfSight 8 · beam 3`) that
`backend/board/fixtures_test.go` and `frontend/lib/hex/fixtures.test.ts`
both assert against. `docs/handoffs/2026-08-24-polar-lattice-migration.md`
Section 7 names this "the most valuable property the codebase currently
has" and states the rule as: trig "may never appear in a stored value, a
solve result, or an ETA."

**That absolute is false about today's shipped code, and this change's own
first draft repeated the error in the other direction** — by treating
`+ − × ÷` as unconditionally safe. Evidence, cross-referencing both filed
defects:

- `backend/board/gate.go`'s `LaneGateHex` calls `math.Atan2` twice per
  candidate (once for the lane bearing, once per gate-ring candidate's
  direction) and `math.Sqrt` inside `hexDirection`'s `math.Sqrt(3) * ...`
  scale constant. Its result — a `Hex` — is persisted:
  `backend/board/ship.go`'s `LaneTransit.EntryGate Hex` carries
  `firestore:"entryGate"` and is stamped into system reads and arrival.
  The near-tie probe (`docs/defects/2026-08-25-lanegate-near-tie-divergence.md`)
  ran the construction this change's first draft only speculated about, and
  it diverged: `LaneGateHex(0,0,0,100,16)` → Go `(6,−13)`, TS `(7,−13)`. Go's
  `atan2` output splits the two candidates' deltas by one ULP; V8's makes
  them bit-identical, so the documented tie-break fires in TS and never
  reaches in Go. Nothing is on fire — the server is authoritative, `gate.ts`
  has no production callers (see Open Questions) — but the requirement as
  first drafted ("provably unchanged by a last-ULP difference") is
  **falsified by direct measurement**, not merely unverified.
- **Independently, and more severely: `go build -gcflags=-S ./board` emits
  8 FMA (fused multiply-add) instructions on `arm64` and 0 on `amd64` from
  identical source**, at `hex.go:73` (`lerp(a,b,t) = a + (b-a)*t`),
  `hex.go:93`/`95` (inside `roundf`), and `gate.go:54`. The Go spec
  explicitly permits a compiler to fuse a floating-point multiply and an
  adjacent add into one rounded operation "possibly across statements";
  ECMAScript requires every `+`/`*` individually rounded and forbids
  fusion. So `+ − × ÷` is safe only when neither operand of a `+`/`−` is
  itself the un-stored result of a `*`/`÷` — the general case the original
  draft didn't consider. Measured consequences
  (`docs/defects/2026-08-25-line-fma-arch-divergence.md`):
  - 31% of 20,000 random `lerp` inputs differ between Go/`arm64` and JS.
  - **`board.Line` — the function both source docs cite as the canonical
    safe integer case — diverges on 2,160 of 109,561 radius-10 hex pairs
    (1.97%)** between Go/`arm64` and Go/`amd64`; `amd64` matches the
    TypeScript mirror.
  - Bit-level cause at one such step: arm64 computes
    `x = -2.4999999999999996` (the fused, more-accurate answer), amd64
    computes exactly `-2.5`; `roundf` then splits `-2` vs `-3`. Hex
    lattices sit on exact half-integer cube coordinates constantly, so this
    tie boundary is hit often, not rarely.
  - `go test ./board/ -short` currently passes on both architectures only
    because the three recorded `line` fixture cases happen to dodge every
    one of the 2,160 divergent pairs — a coverage gap, not a proof of
    correctness.
  - Prod is `amd64` (Cloud Run), so prod matches the frontend. Travis's
    local dev backend is `arm64` (Apple Silicon) and does not. Worse: if
    `UPDATE_FIXTURES=1` is ever run on that arm64 laptop, it bakes arm64's
    (wrong-side) answers into the file two of the three asserting targets
    — JS and amd64 CI/Cloud Run — do not actually agree with.

**The unifying property, and the reframe this revision makes:** the seam is
held by **discretization or exact arithmetic**, not by "integer-only
arithmetic is always safe" or "transcendentals are always unsafe". A
contraction-dependent `+`/`*` chain is exactly as much a hazard as an
unreduced `atan2` — worse, in `Line`'s case, because it's Go↔Go across CPU
architectures, not Go↔TS, so it can diverge between a developer's laptop and
production with no language boundary involved at all. The `LaneGateHex`
carve-out is one *instance* of the discretization pattern, not an exception
to a transcendental ban.

## Goals / Non-Goals

- Goal: make the determinism seam a testable OpenSpec capability, not prose
  in a Notes block.
- Goal: state the actual contract — exact arithmetic or discretized choice —
  rather than the false absolutes ("transcendentals banned", "arithmetic
  safe") the first draft and the migration-doc prose both asserted.
- Goal: close the same-language, cross-architecture gap the `lerp` defect
  exposed. The original draft pinned only a Go↔TS seam; the measured drift
  is Go↔Go across `arm64`/`amd64`, which that framing couldn't even name.
- Goal: state the lane-gate carve-out as it actually behaves — a
  discretized argmin with the backend as the authoritative side for the
  persisted value — now that the near-tie probe has measured a real
  divergence, rather than leaving "provably unchanged" as an unverified (and
  now falsified) claim.
- Goal: leave a forward-looking hook for the propellant arc's `sqrt`-based
  Hohmann transfer, without pulling propellant into scope, and without
  repeating that plan's own version of the arithmetic-is-safe error (see
  Open Questions).
- Non-goal: deciding or implementing the polar lattice migration. This
  change stands alone regardless of that migration, which is now **approved**
  (`docs/handoffs/2026-08-24-polar-lattice-migration.md`, Section 5, decision
  1: "SETTLED (2026-08-25): yes, full polar") — none of this change's
  requirements depend on which lattice ships.
- Non-goal: implementing propellant/delta-v (`docs/plans/propellant-and-delta-v.md`).
  The sqrt requirement obligates future work only if and when a runtime-value
  `sqrt` rule beyond `LaneGateHex` is introduced.
- Non-goal: **fixing `lerp`'s FMA contraction, or `LaneGateHex`'s near-tie
  tie-break.** Both are real, filed defects against `board-tactical-math`
  (see Context) with recommended fixes already sketched in their defect
  docs. Fixing `lerp` would re-record five fixture families (`line`,
  `routeAround`, `solveHex`, `solveIntercept`, `beam`) and change committed
  burn paths on arm64 builds — real, separable work this change's job is to
  make visible and testable, not to perform.

## Decisions

### Decision: New capability `cross-stack-determinism`, not requirements folded into `board-tactical-math`

The determinism seam must outlive the hex lattice. `board-tactical-math`
specs the hex-specific functions (`Line`, `RouteAround`, `OrbState`,
`SolveIntercept`, `LaneGateHex`, `LineOfSight`, `BeamHexes`, ...); if the
polar migration proceeds, that capability's requirements get rewritten or
replaced wholesale (Section 8 of the handoff: `board/hex.go` "Rewrite",
`board/intercept.go` "Rewrite", `board/visibility.go` "Rewrite"). A
determinism requirement folded into `board-tactical-math` would be deleted
or silently narrowed in the same sweep that replaces the lattice it was
attached to — exactly the failure mode this change exists to prevent. A
capability that both `backend/board`/`lib/hex` (today) and any future
`backend/board`/polar equivalent (tomorrow) must satisfy has to live
outside the thing being replaced.

- Alternative considered: add the requirements as MODIFIED entries under
  `board-tactical-math`, promoting the existing Notes block to real
  requirement text in place. Rejected — it ties the guarantee's lifetime to
  the lattice implementation, and a future migration's spec delta would
  have to remember to carry it forward by hand instead of the capability
  boundary enforcing that automatically.

### Decision: Exact arithmetic or discretization — not a transcendental ban

The seam requirement bans neither "transcendentals" nor "floating point" as
a category. It requires that every rule-bearing value cross by (a)
arithmetic both languages round identically for every input — integer
arithmetic within safe magnitude, or individually-rounded IEEE-754
`+ − × ÷` — or (b) a discretized, tie-broken selection from a finite
candidate set. `sin`/`cos`/`atan2`/`sqrt` are disqualified from (a) because
neither language guarantees bit-identical transcendental results; a
contraction-dependent `+`/`*` chain is *also* disqualified from (a), for the
same reason (two implementations, two answers) even though every operator
involved is elementary. This is the direct correction of the first draft's
central error.

- Alternative considered: keep the original absolute ban on transcendentals
  and treat `+ − × ÷` as always safe. Rejected — falsified by measurement
  (`board.Line`'s FMA divergence); a spec that asserts something false about
  shipped code is worse than no spec.

### Decision: The measured FMA-contraction finding, and the explicit non-goal of fixing it here

**Measurement** (full detail in
`docs/defects/2026-08-25-line-fma-arch-divergence.md`): `go build
-gcflags=-S ./board` shows 8 FMA instructions emitted on `arm64`, 0 on
`amd64`, from identical source, at `hex.go:73` (`lerp`), `hex.go:93`/`95`
(`roundf`), and `gate.go:54`. 31% of 20,000 random `lerp` inputs differ
between the two architectures; `board.Line` disagrees on 2,160/109,561
(1.97%) of radius-10 hex pairs. At one measured divergence, `arm64`
computes `x = -2.4999999999999996` where `amd64` computes exactly `-2.5` —
the fused result is *more* accurate, which is precisely what puts it one
ULP off the tie boundary `roundf` is maximally sensitive to.

**Mechanism**: the Go spec permits an implementation to fuse `a + b*c` into
a single rounded FMA "possibly across statements", and the `gc` compiler
does so on `arm64` today. **Correction (2026-08-25, verified in compiler
output):** an earlier pass of this doc claimed that assigning the product
to a local variable first inhibits the fusion. That is wrong — gc fuses
across statements just as it does the inline form. Measured with
`GOARCH=arm64 go build -gcflags="-S -l"`:

```
a + (b-a)*t                    ->  FSUBD ; FMADDD             fused
p := (b-a)*t ; return a + p    ->  FSUBD ; FMADDD             STILL fused  <- the bad advice
a + float64((b-a)*t)           ->  FSUBD ; FMULD ; FADDD      not fused    <- correct
```

Only an explicit `float64(...)` conversion around the product is *specified*
by the Go spec to force the intermediate rounding that inhibits contraction.
This is a HOW-level compiler behavior, not a requirement-level statement, so
it lives here in design.md; the requirement itself
(Rule-Bearing Values Cross the Seam By Exact Arithmetic or By
Discretization) states only the observable consequence (contraction-
dependent expressions are not exact arithmetic) and now names the
`float64(...)` conversion as the one construct the Go spec guarantees works.

**The false-green trap**: `go test ./board/ -short` passes on both `arm64`
and `amd64` *today*, because the three hand-picked `line` fixture cases
happen to dodge all 2,160 divergent pairs. A green test run is therefore
**not evidence a fix worked** — verification requires either the exhaustive
sweep (Task 5, blocked until the fix lands) or inspecting `-gcflags=-S`
output directly for `FMADDD`.

**Explicit non-goal**: fixing `lerp` — whether by wrapping the product in an
explicit `float64(...)` conversion (per the correction above; a bare local
variable does NOT work) or by replacing the whole cube-lerp walk with exact
integer arithmetic and a spec'd tie-break, per the defect doc's stronger
alternative — is a separate change against `board-tactical-math`. It would
re-record five fixture families (`line`, `routeAround`, `solveHex`,
`solveIntercept`, `beam`) and change which hexes a committed burn passes
through on `arm64` builds specifically. This change makes that gap visible,
testable, and cross-referenced; it does not close it.

### Decision: Discretized choice with an authoritative side, not a provability claim

The lane-gate requirement no longer claims the tie-break is "provably
unchanged by a last-ULP difference" — the near-tie probe measured exactly
such a change
(`docs/defects/2026-08-25-lanegate-near-tie-divergence.md`:
`LaneGateHex(0,0,0,100,16)` → Go `(6,−13)`, TS `(7,−13)`). For an argmin
over a finite candidate set to be provably stable, the winning and
runner-up candidates' separation needs a bound that exceeds the two
languages' worst-case disagreement, uniformly over the input domain. No
such bound exists for `LaneGateHex`: its inputs are arbitrary galaxy
coordinates, and the lane bearing is a continuous function of them, so an
input arbitrarily close to a candidate bisector always exists. The honest
guarantee — already present in the code as a comment — is **authority**:
"the server is authoritative (it stamps gate tiles into system reads and
arrival); the client mirror drives previews only." This revision specs
that directly: the backend's selection is authoritative for the persisted
value; the TypeScript selection is presentation-only, superseded on commit.
Corroborating: `frontend/lib/hex/gate.ts`'s `laneGateHex`/`gateRing` have no
production callers today — only tests import them (see Open Questions).

- Alternative considered: attempt to bound the tie margin and prove
  stability, as the original draft implied was possible. Rejected — false
  for a continuous-domain argmin; no such bound exists to prove.
- Alternative considered: treat the measured divergence as a determinism
  failure of this capability and block on fixing `LaneGateHex` before
  landing. Rejected for scope — the fix (an integer cross-product argmin,
  sketched in the defect doc) is separable work against
  `board-tactical-math`; this change's job is to specify the seam correctly
  given the measurement, which it now does by naming authority rather than
  an unprovable guarantee.

**Round-2 correction: authority does not cover a same-side cross-target
disagreement, and the carve-out must not reinstate "provably unchanged".**
The near-tie probe measured a Go↔TS divergence at one input; it said nothing
about whether the Go *selection itself* is stable across Go's own build
targets. Verified this round: `math.Atan2` differs by one ULP between
Go/`arm64` and Go/`amd64` on ~0.75% of inputs (the `math` package emits 40 FMA
instructions in `atan`/`atan2` on `arm64`, 0 on `amd64`). A `LaneGateHex`
*selection* flip was **not** reproduced over 300,000 random inputs plus
targeted bisector probes — but absence of a reproduced flip over a finite
sample is evidence of rarity, not a proof of stability, which is exactly the
distinction the three hand-picked `line` fixture cases blurred before the
exhaustive sweep found 2,160 divergent pairs. The requirement's carve-out
scenario is therefore worded as an obligation to run that sweep on both of
the authoritative side's build targets and register whatever it finds — not
as a guarantee the selection is stable, which would repeat the same
falsified-claim pattern the `Line` finding already corrected once in this
document. `proposal.md`'s "Known violations at landing" bullet for
`LaneGateHex` is corrected to match: it no longer classifies the hazard as
"Go↔TS, not same-language cross-target" — `atan2` itself is measured
arch-divergent; only the *selection's* cross-target stability remains
unmeasured, not proven.

### Decision: Enforcement re-ranked — cross-architecture differential run is primary, the transcendental grep-lint is secondary

The original draft proposed a grep-based lint as the *primary* enforcement
mechanism for the "Rule-Bearing Values Cross the Seam By Exact Arithmetic or
By Discretization" requirement. That lint is implemented
(`.claude/scripts/check-transcendental.sh`, wired as Check 8 in
`.claude/skills/code-quality-checks/check.py`, five
`determinism:allow(...)` pragma sites) and is worth keeping — but it covers
only the transcendental subset of the hazard, which the contraction finding
shows is now the **minority** case. A grep over source text cannot see
`a + b*c`; it has no way to flag `hex.go:73`'s `lerp`, which is exactly the
function that diverges in production-relevant ways today.

**Re-ranked**:
1. **Primary — cross-architecture differential run**
   (`GOARCH=amd64 go test ./board/... -short` alongside the native-arch
   run). This is semantic, not textual: it directly observes whether two
   build targets compute the same answer, with zero false positives and no
   allowlist to maintain. One command, wired into `/check` (Task 4.4/4.5).
   It is also the *only* mechanism of the two that would have caught the
   `lerp` defect — the grep-lint's allowlist has no way to represent "this
   `+`/`*` expression is contraction-sensitive."
2. **Secondary — transcendental grep-lint** (as originally designed,
   unchanged). Still useful: it catches a *new* `Math.atan2` or
   `math.Sin` call landing on a rule path at review time, before a
   fixture ever exists to catch it empirically. A cross-architecture run
   can't see that class of regression until someone writes the fixture
   case that would expose it.

Neither mechanism alone covers the hazard class this capability specifies
against; both are kept, at the corrected priority.

### Decision: Non-enumerable domains are checked by compiled-output inspection, not differential execution

`Rule-Bearing Values Are Reproducible Across Build Targets of the Same
Language`'s only mechanism as first drafted was a differential run over "its
enumerable input domain" — but most of this codebase's actual FMA-contraction
hazard lives on continuous float domains a differential run cannot execute:
`fleet.legMs`/`laneLength` (galaxy coordinates), `galaxy/generator.go`
(RNG-drawn floats), `corporations/siteselection.go` (site-scoring floats),
and `market/provisioning.go` (price floats). None is enumerable within the
10^6 bound the sweep-case schema pins for hex-pair domains. Requiring a
sweep there anyway would either be undecidable ("small enough to enumerate"
again) or silently exclude the majority of the hazard class from the check.

**Decision**: for a non-enumerable domain, the check inspects **compiled
output**, not runtime behavior — the same technique used to find this
change's own "Known violations at landing" list:

```
GOOS=linux GOARCH=arm64 go build -gcflags=-S ./... | grep -cE 'FMADDD|FMSUBD'
```

run per file against the whole `backend/` module (not `./board` alone),
cross-checked against an identical `GOARCH=amd64` run emitting zero for the
same file. A nonzero-on-`arm64`/zero-on-`amd64` count at a file is treated as
a same-language, cross-target divergence unless that specific site is named
in the deviation register with an open defect. This is mechanical and total
over the module — it does not need the function's domain to be enumerable,
only its compiled form to be inspectable, which is true of every Go function
unconditionally. A secondary grep for `math.Round(`/`math.Floor(`/
`math.Trunc(` outside the transcendental-drift check's existing pattern
catches the guaranteed-divergence class (`math.Round` vs `Math.round`) that
compiled-output inspection can't see, because `math.Round` compiles
identically on both architectures — it diverges Go↔JS, not Go↔Go (see
`mine/service.go:224`, `fleet/service.go:117` in "Known violations at
landing").

Run 2026-08-25 against `backend/`, the snapshot recorded in proposal.md's
"Known violations at landing": eight files carry a nonzero `FMADDD`/`FMSUBD`
count on `arm64` with zero on `amd64` — `backend/galaxy/generator.go` (12),
`backend/fleet/routing.go` (8), `backend/board/hex.go` (6),
`backend/system/generator.go` (4), `backend/corporations/siteselection.go`
(3), `backend/market/provisioning.go` (2), `backend/board/gate.go` (2),
`backend/mine/service.go` (1). This is a mechanically reproducible snapshot,
not a hand audit, and it is expected to be re-run (Task 6.3), not trusted as
permanent.

- Alternative considered: widen the differential-run mechanism to sample
  the continuous domain randomly instead of enumerating it (as the
  `LaneGateHex` near-tie probe did, with 300,000 random inputs). Rejected as
  the *primary* mechanism — a random sample can miss a divergence entirely
  (as it did for `LaneGateHex`'s selection, per the round-2 correction
  above), where the compiled-output check has no false-negative mode: either
  the compiler emits a contracting instruction on one target or it does not.
  Random sampling remains useful as a secondary corroboration, as done for
  `LaneGateHex`, but is not what the requirement's coverage rests on.

### Decision: The sweep-case schema — a bounded domain, a fixed enumeration, and a digest, not a phrase

The requirement's exhaustive-sweep clause originally left "small enough to
enumerate," "a digest," and "a canonical serialization both languages
reproduce" undefined — each is a real decidability question, not a detail an
implementer can fill in without effectively rewriting the requirement. This
change pins them:

- **Bound**: a domain is sweep-eligible if it is enumerable within 10^6
  inputs. Above that, no sweep case is obligated (the family stays
  hand-selected-case-only, honestly, rather than a task silently skipped).
- **Hex-pair domains**: for a function whose domain is a pair of hexes (e.g.
  `line`, `routeAround`, `beam`, `lineOfSight`'s no-occluder slice), the
  swept domain is all ordered pairs of hexes within radius 10 of the origin
  — 109,561 pairs, the same radius the `line`-divergence defect measured
  against, chosen so the sweep and the defect's own measurement are directly
  comparable.
- **Enumeration order**: ordered pairs are walked with the first hex
  iterating over `RingHexes(0..10)` in that function's existing ring-then-
  index order (the order `hex.go`/`hex.ts` already define and the fixture
  suites already rely on for `RingHexes` itself), and the second hex nested
  the same way — a fixed order both languages reproduce without needing new
  shared code, because both mirrors already implement `RingHexes` identically
  (it's integer-only).
- **Digest**: SHA-256, hex-encoded. The preimage is the newline-joined,
  decimal `q,r` serialization of the function's output for each input, one
  line per input, in the fixed enumeration order above — never a JSON
  encoding, precisely to sidestep the fact that Go's `encoding/json` and
  JavaScript's `JSON.stringify` do not agree on float formatting or key
  order. Every family this requirement covers produces an integer hex (or a
  list of them) as output, so `q,r` decimal text is exact and
  language-independent; a family whose output is not hex-valued is not
  sweep-eligible under this schema and needs its own schema decision when
  such a family exists (none does today). **List-valued outputs** (`board.Line`
  returns a list of hexes per input, not a single hex) need their own line
  preimage stated explicitly, or two implementers produce two digests from
  the same intent: a list-valued output is serialized as its hexes' `q,r`
  forms joined by `;` on a single line, one line per input — for example
  `Line((-10,0),(-1,3))` → `-10,0;-9,1;...;-1,3` as one line of the digest
  preimage, not one line per hex in the path.
- **Fixture-file shape**: `backend/board/fixtures_test.go` currently types
  each family as a homogeneous slice of hand-picked cases, which a sweep
  case (one domain descriptor + one digest, not a list of input/output pairs)
  does not fit. A sweep case SHALL be recorded as a distinct, additional
  field on the family — for example `{"family":"line","cases":[...],
  "sweep":{"domain":"hex-pairs","radius":10,"digest":"sha256:..."}}` — not
  coerced into the existing case-list shape. The exact Go/TS struct and JSON
  tag changes are implementation, left to whoever performs Task 5's
  recording; this Decision fixes only the observable contract (bound,
  domain, order, digest algorithm) the schema must carry.

- Alternative considered: leave the bound and serialization to whoever
  implements the sweep. Rejected — that is exactly how "small enough to
  enumerate" produced zero sweeps in the first place: an undecidable term
  lets every domain be declared too large.
- Alternative considered: digest over each family's existing JSON
  serialization. Rejected — Go's `json.Marshal` and JavaScript's
  `JSON.stringify` diverge on float formatting and map-key order, which
  would make the digest itself seam-dependent; the newline-joined decimal
  `q,r` form has neither problem for hex-valued output.

### Decision: The sqrt-pinning requirement's both-languages fixture obligates a Go-side fixture, not a TypeScript port, where no mirror exists

`Square Roots In Rules Are Pinned, Not Assumed` requires a fixture family "asserted by both the Go and TypeScript suites." Read literally against `fleet.laneLength`/`legMs` (`backend/fleet/routing.go:196`), which has no TypeScript mirror at all, that sentence is undecidable between two readings: narrow (the requirement is seam-scoped, so a Go-only computation is simply out of scope and pins nothing) or broad (the requirement is scope-blind, so `laneLength`/`legMs` must be ported to TypeScript purely to give the fixture something to assert against on the TS side — for math the frontend never runs). The lane-ETA defect's own recommended fix already assumes the broad reading ("add a `laneLength`/`legMs` fixture family"), so the change's artifacts were inconsistent with the requirement text as first drafted.

**Decision**: neither literal reading. Where the sqrt computation has no TypeScript mirror, the obligation is a **Go-side fixture family**, recorded and asserted across the Go build-target matrix (`arm64` and `amd64`/`GOAMD64=v1`) that `The Golden Fixture Reproduces On Every Build Target` already obligates — the same mechanism, not a new one. This pins the computation against the hazard that's actually live for a Go-only function (cross-architecture FMA/sqrt drift), without manufacturing a TypeScript port whose only purpose would be to hold a fixture for code the frontend never executes. The both-languages-assert form of the requirement continues to apply unchanged wherever a mirror already exists (e.g. `hexDirection`'s `sqrt(3)`).

- Alternative considered (narrow reading): treat a Go-only sqrt as out of this requirement's scope entirely. Rejected — it would leave `fleet.legMs`'s runtime `sqrt` with no pinning obligation at all, contradicting the requirement's own stated purpose (a rule-bearing `sqrt` "must already satisfy" the discretization/exactness requirement, and `legMs` is exactly the kind of persisted, decision-bearing value that requirement governs).
- Alternative considered (broad reading): require a TypeScript port of `laneLength`/`legMs` (or any Go-only mirror-less sqrt computation) purely to satisfy the both-languages fixture form. Rejected here as the default — it invents frontend code with no product purpose to satisfy a spec mechanism, and duplicates a hazard surface (a second implementation to keep in sync) instead of removing one. Recorded in Open Questions below as the alternative Travis may still prefer, since it is not without merit (a future depart-preview or ETA-display feature could give such a port a real consumer).

## Risks / Trade-offs

- **The `line` exhaustive-sweep case cannot be safely recorded yet.**
  Recording it today, on an arm64 dev machine, would freeze the wrong
  side's answers exactly as `UPDATE_FIXTURES=1` risk already describes.
  The task list marks this explicitly deferred until the `lerp` defect is
  resolved, not silently skipped.
- **`GOARCH=amd64` cross-builds on Apple Silicon run under Rosetta**, which
  is slower than a native run and, longer-term, should be backed by a
  native amd64 CI runner rather than relied on locally forever. Acceptable
  for now: correctness of the check doesn't depend on Rosetta being fast,
  only on it being an unfused target.
- **Grep-lint false positives** (kept as secondary enforcement) still cost
  reviewer time on a legitimately-new call site. Unchanged from the
  original draft's assessment; mitigated by keeping the allowlist small and
  colocated with the call sites it covers.
- **The sqrt requirement is partly live, not vacuous.** `gate.go:54`
  already applies `sqrt` to a runtime value (well, to a compile-time
  constant multiplied by a runtime value — see the requirement's split
  between the two cases). The original "vacuously satisfied" scenario was
  false on arrival; this revision replaces it with an assertion the
  existing `sqrt(3)` constant is actually pinned, not merely assumed equal.
- **Scope creep risk**: because this change touches the same fixture file
  and functions the `lerp`/`LaneGateHex` defects name, there's a
  temptation to widen it into "also fix `lerp`" or "also fix
  `LaneGateHex`." Deliberately declined — see Non-Goals. Both fixes are
  separable changes with their own re-recording blast radius.

## Migration Plan

No data migration — this change adds a specification capability and check
tooling; it does not alter any persisted schema or stored value. The
downstream fixes it makes visible (de-fusing `lerp`, replacing
`LaneGateHex`'s float argmin with integer cross-products) are out of scope
here, but their eventual migration shape is worth recording: de-fusing
`lerp` re-records five fixture families and, on `arm64` builds only,
changes which intermediate hexes a burn path already committed to would
walk through — the affected surface is dev-only convenience (there are no
live players yet), so no player-facing drain or backfill is needed, only a
fixture re-record and a CI-green re-check.

**Ordering constraint, binding on whoever performs that fix**: do not
regenerate `fixtures/board/cases.json`'s `line` family (including the
Task 5 exhaustive-sweep case) before the `lerp` fix lands. Recording it
first — on Travis's arm64 dev machine, the only place `UPDATE_FIXTURES=1`
is normally run — freezes arm64's accidental, currently-wrong-side answers
into the golden contract for the 1.97% of pairs that diverge, which is
exactly the failure mode this change exists to prevent. The sequence is:
(1) land the `lerp` fix against `board-tactical-math`, (2) verify with
`-gcflags=-S` that no `FMADDD` remains at `hex.go`'s `lerp`/`roundf` and
`gate.go:54`, (3) only then regenerate the fixture and confirm
`arm64 == amd64 == TypeScript`.

## Open Questions

- **(Round 4)** The sqrt-pinning requirement's Go-only-mirror case is resolved above as a Go-side fixture across the build-target matrix, not a TypeScript port. The alternative — requiring `laneLength`/`legMs` (or any future Go-only sqrt computation) to be ported to TypeScript so the both-languages fixture form applies uniformly, system-wide — is available if Travis prefers it; it was not chosen here because it has no product consumer today, but it is not resolved by fiat and could change if a depart preview or ETA display gives such a port a real caller.
- Should `board`'s shared float paths (`lerp`, `roundf`, `gate.go:54`) be
  de-fused at the source, or should fixture recording simply be pinned to a
  non-contracting (`amd64`) target going forward? Recording honestly:
  pinning the recorder only **hides** the divergence from an arm64 dev
  backend — a local dev server still computes the wrong-side answer for the
  2% of pairs the fixture doesn't happen to hit — it does not remove the
  underlying non-determinism. The defect doc's stronger alternative is that
  `Line`'s cube-lerp at `i/n` is exact rational arithmetic (`k/n` for
  integer `k`), so the walk could run entirely in integers with an
  explicit, spec'd tie-break at the half-integer boundaries, removing the
  floating-point tie rather than choosing which side's rounding wins.
  Not decided here — flagged for whoever picks up the `board-tactical-math`
  fix.
- Should `pow` be banned outright, or allowed for integer exponents (which
  Go's `math.Pow` and JS's `Math.pow`/`**` compute via repeated
  multiplication for small integer powers in most implementations, and
  which could in principle be replaced by explicit multiplication in rule
  code to sidestep the question entirely)? Not resolved here — no current
  production call site depends on the answer, so this is left open rather
  than decided by fiat.
- `frontend/lib/hex/gate.ts`'s `laneGateHex`/`gateRing` currently have **no
  production callers** — only tests import them. The lane-gate near-tie
  hazard is therefore dormant in practice; it activates the moment a
  client-side depart preview is built that calls these functions. Left
  open rather than resolved, since building that preview isn't this
  change's job either.
- `docs/plans/propellant-and-delta-v.md` reasons that a Hohmann-transfer
  delta-v computation is safe "because it uses only `sqrt`." That is the
  same class of error the original draft made about `+ − × ÷`: the
  standard Hohmann Δv expression
  `√(μ/r₁)·(√(2r₂/(r₁+r₂))−1)` multiplies a `sqrt` result by a subtraction
  result — a textbook contraction site, on top of the `sqrt` correctness
  question this capability's sqrt requirement already covers. Not resolved
  here — propellant is out of scope — but recorded so whoever scopes that
  arc inherits the finding rather than re-discovering it.
- **(UX, deliberately not taken here — follow-ups against `hex-board-view`,
  not this change):** the `lerp` FMA-contraction defect is live on the move
  preview path (`move-preview.ts` mirrors `SolveHex`/`SolveIntercept`, which
  call `RouteAround`, which calls `Line` —
  `backend/board/intercept.go:19,59,69` → `backend/board/route.go:14,20,21`),
  so on an arm64 backend the previewed route/ETA can differ from what a
  commit freezes for ~2% of orders today. Three UX questions this raises are
  recorded, not answered, here:
  (a) what should the player perceive when a committed result differs from
  its preview — no requirement in `hex-board-view` covers this today;
  (b) the move/depart ETA readout carries no "advisory only" framing, though
  the mine-run preview already does — should it, given (a); and
  (c) `move-preview.ts`'s header comment currently claims the preview is
  "exactly what lands on commit," which this change's own findings
  contradict — that comment likely needs correcting regardless of how (a)
  and (b) are resolved.

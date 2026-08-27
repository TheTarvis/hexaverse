## Context

`docs/plans/continous_space/README.md` is **direction-decided (2026-08-26)**:
the tactical layer leaves the lattice entirely and moves to continuous R³ —
rails orbits, curved Bézier transfer burns on a brachistochrone profile,
positions as vectors. The PoC (`frontend/app/spike/space-3d/sim.ts`, 23 pure
tests) exists because the feel had to be believed before it was built, and it
was: "movement feels so much better."

This change is the continuous-space equivalent of `add-polar-lattice-math`
(archived 2026-08-25) and deliberately copies its shape: stand the kinematics
up as its own spec'd, fixture-pinned capability with **zero consumers**, prove
determinism on a new fixture family *before* a single consumer moves, and stop
if parity does not hold. `backend/board`, `backend/polar`,
`backend/observation`, `frontend/lib/board`, and `frontend/lib/polar` are
untouched and keep running the game. Two tactical-math packages coexist for the
duration of the migration sweep, exactly as `board` and `polar` did.

**Why additive-first, again.** The polar migration's own sequencing rule —
"prove Go↔TS parity on a new fixture family before touching any consumer; if
parity does not hold, stop" — is the reason this change exists as a separate
step. That rule already fired once here, before any code was written.

**The blocking finding this design exists to resolve.** The README's contract
section claims:

> Go/TS mirror + fixture determinism survives because every float path uses
> fixed sample counts (64-segment arc tables, 32-iteration capped fixed-point
> intercept solve) and no transcendental iterative solvers.

**That claim is false, and it has been measured.** The orchestrator's
determinism evidence (findings D-1..D-4) establishes:

- **D-1.** Go `math.*` vs Node `Math.*` on 38 values drawn from the PoC's own
  operating domain: **5 diverge in the last ULP** — on `cos`, `sin`, `pow`,
  `atan2`. Those functions reach every body position, every ETA, every future
  fog decision, and the *persisted* insertion phase.
- **D-2.** `cubicPoint`'s `a*p0 + b*c1 + c*c2 + d*p3` compiles to **3 fused
  FMA instructions on arm64** and none on amd64 — confirmed by disassembly.
  Travis's dev machine is arm64 darwin; Cloud Run is amd64. This is a hazard
  *even with no TypeScript at all*.
- **D-3.** Perturbing the depart time by 1 ULP against the real `sim.ts` and
  re-solving: **24 of 32 cases amplified**, worst flight-time difference
  2.046e-12 sim-seconds — ~2300× the flight time's own ULP. The fixed-point
  solve amplifies input noise rather than damping it. *But the magnitude is
  1e-12 seconds*, which is what makes this tractable rather than fatal.
- **D-4.** All the determinism enforcement is scoped by hard-coded package
  name, so a new `backend/space/` would pass **by not being checked**.

Fixed sample counts remove iteration-count nondeterminism. They do nothing
about per-operation libm divergence, which is what actually differs. The whole
of the PoC's rule-bearing surface is built on `cos`, `sin`, `atan2`, `pow`,
`sqrt`, `hypot`, and a textbook contraction-sensitive polynomial evaluator.

## Goals / Non-Goals

**Goals**

- Define continuous-space kinematics — vectors, rails orbits, cubic transfer
  curves, the brachistochrone profile, the moving-target intercept solve,
  parking modes, and the `StateAt`-style effective-state fold — as a
  standalone, fixture-pinned capability in a new Go package `backend/space/`.
- Resolve the determinism question **before** any type is written, because it
  determines whether a stored position is `float64` or fixed-point and whether
  an orbit stores a float phase or integer sub-turn units. Getting this wrong
  means writing the capability twice.
- Land with **zero deviation-register entries and zero new defect documents** —
  the deviation register is for known violations, not for a greenfield package
  whose determinism was designed in.
- Widen every determinism enforcement script so the new package is actually
  governed, since D-4 shows it would otherwise be silently unguarded.
- Keep every design question the README leaves open visibly open.

**Non-Goals**

- **No consumer is migrated.** `fleet`, `action`, `observation`, `system`,
  `galaxy`, `market`, `mine`, `corporations`, `stations`, `frontend/lib/board`,
  `frontend/lib/polar`, and every renderer are untouched. `backend/board` and
  `backend/polar` keep their consumers and are not deprecated by this change.
- **No sighting / fog / stealth model.** The README's intel section is the
  agreed replacement for `observation`, and it is the single largest consumer
  of this package — but it introduces float *disclosure predicates*, which
  carry a hazard class this change does not have to solve (see Risks). It is
  its own change, blocked on its own open questions.
- **No system or galaxy generation.** `generateSystem`, `keplerPeriod`, and
  `mulberry32` from the PoC do **not** graduate into `backend/space`.
  Generation belongs to `system`/`galaxy`; `space` takes bodies as an injected
  interface and never mints one.
- **No HTTP surface, no wire types, no shared TS contract.** With zero
  consumers there is no payload crossing the network, so there is nothing to
  make a single source of truth *of*. That question arrives with the first
  consumer and is deliberately not pre-answered here.
- **No delta-v economy, no fuel sink, no lane gates in continuous space, no
  cancel semantics.** `burnDeltaV` graduates as a pure function (`accel ×
  flight`); what it *costs* and what happens when a tank runs dry is economy
  work.
- **No migration, no backwards compatibility, no dual-write, no feature
  flags.** Prod exists and is unused; the README's ground rules are explicit
  ("burn the boats"). When consumers move, the old packages get deleted, not
  bridged.

## Decisions

### Decision 1: Go is the sole authority; there is no TypeScript mirror of the kinematics

**The call.** `backend/space` is authoritative for every rule-bearing value —
every persisted field, every solve result, every ETA, and (later) every
disclosure decision. **No TypeScript mirror of it is built, now or later.**
`frontend/lib/space/` exists only as render-side geometry: it draws a curve
from control points the server solved, and it draws bodies from orbit elements
the server stored. It never computes an arrival, a flight time, a Δv price, or
a visibility answer.

This is sanctioned by the existing capability, not a hole punched in it.
`cross-stack-determinism` › *Rule-Bearing Values Cross the Seam By Exact
Arithmetic or By Discretization* already carves out exactly this:

> Projection of a logical position to screen or pixel space, and path sampling
> performed only for rendering (never fed back into stored state, a solve
> result, an ETA, or a disclosure decision), are exempt from this requirement.

**Why this and not the alternatives.**

- *Full mirroring with pinned tables and fixed-point everywhere* (the
  orchestrator's Option 2) preserves the `board`/`polar` discipline exactly,
  and it is genuinely achievable — but it prices angles, positions, `sqrt`,
  and the whole solve into an integer regime, and it does so twice, in two
  languages, on the hottest code in the game. The README's ground rules say
  optimize for build speed and how the game feels. This is the opposite of
  that, and it buys a property (a client that can independently derive a
  rule-bearing number) that the server-authoritative design does not want the
  client to have anyway — `observation`'s existing "server-side only, no
  ship-and-hide" rule already says the client must not be able to compute what
  it is allowed to see. **A partial slice of Option 2 is adopted below in
  Decision 3, where it is cheap and load-bearing; the rest is rejected.**
- *Register everything as a deviation* (Option 3) is not viable. The register
  requires one open `docs/defects/` document per site, and the PoC's violating
  sites number roughly ten (`orbitLocalPosition`, `keplerPeriod`, `travelTime`,
  `len`, `orbitFromOffset`, `insertionFromBurn`, `cubicPoint`, `solveBurn`,
  `arcParam`, `bodyVelocity`). A register with ten open defects covering the
  entire rule surface of a new package is not a bridged violation; it is the
  requirement switched off with extra steps.

**Authority does not, by itself, finish the job — and the spec says so.** The
discretized-choice requirement is explicit:

> Where the authoritative side's own inexact intermediate differs across its
> build targets, the discretization is the guarantee and the cross-build-target
> requirement applies unchanged — authority SHALL NOT be cited as the
> mitigation.

So Decision 1 removes the *language* seam (D-1, D-3) and nothing else. D-2's
arm64-vs-amd64 divergence survives it untouched, and Go's own `math.Sin`,
`math.Cos`, `math.Atan2`, and `math.Pow` are built from contraction-sensitive
polynomial evaluation and differ across Go build targets too. Decisions 3–6
are what actually close that, and they are not optional extras.

**The guard that keeps this true.** A decision to *not* mirror is only worth
what enforces it. `check-mirror-map.sh` gains a third invocation running in
**anti-mirror mode** over `backend/space` ↔ `frontend/lib/space`: it fails if
any function name is declared on both sides unless that name appears in an
explicitly empty `sharedNames` allowlist in `fixtures/space/mirror-map.json`.
This catches the exact regression that would otherwise arrive quietly — a
future agent porting `solveBurn` to TypeScript to make a live preview feel
snappier. It is a name-collision heuristic, not a proof, and it is stated as
such; it is chosen over the alternative (adding a normal `pairs` entry, which
would assert the mirror the whole decision exists to forbid).

**What this costs, stated plainly.** Preview-must-match-commit dies. The
discretized-choice requirement forbids the non-authoritative side's value from
being "used to compute any further rule-bearing value **including a displayed
ETA**." So the PoC's 5 Hz live re-solve can keep drawing a *curve* (pure
geometry, projection-exempt), but the ETA and Δv **digits** must come from the
server or not be shown. `board-view` › *Move Preview From the Acting Fleet's
Live Position* is written on the assumption that the client can compute a
preview end to end; when a consumer eventually migrates, that requirement must
either become a server-quoted preview or be amended. **This is flagged for the
orchestrator, not resolved here** (no consumer moves in this change), and it is
the single largest feel cost of Decision 1 — see Open Questions for the
reversal.

### Decision 2: Time is `common.WorldMillis` at every stored and compared boundary

Every time-valued field on a burn or a park is `common.WorldMillis` (int64
world-milliseconds since the world epoch): `DepartMs`, `ArriveMs`, `EpochMs`,
`PeriodMs`. The solver works in float seconds internally; the **quantization
happens at the boundary of the solve, not at the boundary of storage** — the
solve's last act is to produce an integer arrival, and every downstream
consumer (`burnProgress`, the fold, the arc profile) uses the integer flight
duration, never the float one it came from.

Quantization rule: `arriveMs = departMs + ceil(flightSeconds × 1000)`, using
`math.Ceil`, which is in the capability's exact-arithmetic set and identical on
every target. `Ceil`, not `Round`: a burn must never be resolvable before its
physics say it landed, and `math.Round`/`Math.round` is a guaranteed
cross-language disagreement on every negative half-integer that this codebase
already carries two register entries for.

**Why this is the cheap, complete fix for the largest hazard class.** D-3's
measured worst case is 2.046e-12 sim-seconds of flight-time divergence. A
1e-12-second disagreement cannot survive millisecond quantization; it is
literally unobservable once the stored value is an integer. This is the same
reasoning the repo already applies everywhere else — `common/worldtime.go` has
stored every gameplay stamp as `WorldMillis int64` since M1 precisely so that
"no bare `time.Now()` ever leaks into domain code," and the same discipline now
buys determinism for free.

**The property this wins, which the PoC does not have.** `StateAt`'s arrival
predicate becomes an **integer comparison** (`t >= burn.ArriveMs`). The fold's
"a burn past its arrival IS its settled park" contract — the one architectural
property the README says must survive — stops being a float comparison at a
knife edge and becomes exact by construction.

### Decision 3: Angles are integer sub-turn units over a two-level pinned table

An `Orbit`'s phase, inclination, and node are **integers**, not floats:

```go
// SubTurns is an angle in 1/2^20 of a revolution. Exact, wrap-safe, and
// the index into the pinned turn table.
type SubTurns int64

const SubTurn SubTurns = 1 << 20 // units per full revolution
```

`sin`/`cos` of a sub-turn index are never computed at runtime. They come from a
**two-level pinned constant table** committed at `fixtures/space/turn-table.json`
and loaded (never recomputed) by every implementation:

- `coarse[1024]` — `{cos, sin}` at `i × SubTurn/1024` for `i` in `[0,1024)`
- `fine[1024]` — `{cos, sin}` at `j × SubTurn/2^20` for `j` in `[0,1024)`

and combined by the angle-addition identity, with every product forced through
an explicit rounding:

```go
// idx in [0, SubTurn); hi = idx >> 10, lo = idx & 1023
cosθ = float64(C.Cos*F.Cos) - float64(C.Sin*F.Sin)
sinθ = float64(C.Sin*F.Cos) + float64(C.Cos*F.Sin)
```

Four guarded multiplies, one add, one subtract — all in the exact set, all
cross-target-identical, no transcendental at runtime anywhere on the rule path.

This is the mechanism `cross-stack-determinism` › *Pinned Constant Tables Are
Recorded, Asserted, Never Recomputed* was written for, and the board's pinned
coordinate table is its first instance. This is its second.

**Why two levels rather than one.** A single flat table at the resolution the
game needs is not committable. Sizing it honestly: the resolution requirement
here is **placement, not continuity** — Decision 10 makes arrival continuity
exact at *any* table resolution — so what the granularity has to beat is
visible displacement. Bodies are 1.6–4.2 units across and orbital radii reach
several hundred units. A one-level table at 2^20 entries would be ~1.5 MB of
JSON per trig function. The two-level decomposition reaches the same 2^-20-turn
resolution — ~6e-6 rad, i.e. **0.003 units of positional granularity at radius
500**, three orders of magnitude below the smallest body in the game — from
**4096 committed doubles, roughly 90 KB**. The recording flow (a Go test, which the
transcendental lint already skips by design, matching the board precedent) is
the sole place `math.Sin`/`math.Cos` execute in this capability.

**Orbital advance is truncating integer arithmetic, with the wrap guarded.**

```go
idx = (phase + ((t-epoch) % periodMs) * SubTurn / periodMs) % SubTurn
```

The `% periodMs` **before** the multiply is load-bearing, not defensive:
`(t-epoch) × 2^20` overflows int64 at plausible world times, and the reduced
form's worst case is `periodMs × 2^20`, comfortably inside int64. This is the
same hazard `polar`'s orbital advance already documents and the same fix
(`add-polar-lattice-math` design.md, "Sweep domain bounds — wrap-safe
integers"). A second property falls out for free: because the advance
truncates against an exact period, **an orbit returns to exactly its stored
phase after exactly one period** — the PoC's float version does not have that.

**`atan2` is deleted, not tolerated.** The PoC persists the insertion phase via
`Math.atan2(offset.z, offset.x)` in `insertionFromBurn` and `orbitFromOffset` —
D-1 measured `atan2` diverging, and this is the one value the PoC actually
*stores*. It is replaced by `PhaseIndexOf(offset Vec3) SubTurns`: an octant
reduction by sign/magnitude comparison (exact), then a **fixed-count binary
search** over the coarse table and then the fine table, bracketing by the sign
of the cross product `x·tz − z·tx` with guarded products. Twenty exact
comparisons, no transcendental, a documented tie-break (**lower index wins**),
and an integer result. This is the discretized-choice branch of the
exact-arithmetic requirement, done the way `LaneGateCell` already does it.

**The unstated tie-break is the known failure mode here.**
`docs/defects/2026-08-25-lanegate-near-tie-divergence.md` is this codebase's
own record of two reasonable implementers diverging on the first case that hits
a tie. `PhaseIndexOf`'s tie-break is written down for that reason.

### Decision 4: Positions stay `float64` — vectors are not fixed-point

`Vec3{X, Y, Z float64}`. Not `int64` milli-units.

Fixed-point positions are the price you pay to make *two languages* agree on a
number. Decision 1 removed the second language, and Decision 3 removed the
transcendental that made the position path inexact in the first place. What is
left touching a position is `+ − × ÷`, one `sqrt`, and pinned-table lookups —
every one of which is either in the capability's exact set or correctly-rounded
and therefore identical across Go build targets. Fixed-point would buy nothing
and cost real things: dynamic-range reasoning on every derived quantity
(`x*x + y*y + z*z` at milli-units is 10^6× larger and the arc-length
accumulator worse), a lossy conversion on every render frame, and a second
representation for every developer to hold in their head.

**The Firestore / `action.Params` codec.** `backend/space/params.go` is the
continuous-space analogue of `backend/board/params.go` — the one place a
`space.Vec3`, `space.Orbit`, `space.Burn`, or `space.Park` is allowed to cross
into an untyped `map[string]any`. `action.Commit`'s validator
(`backend/action/params_validator.go`) already allowlists `float64` and
`[]float64`, so a vector encodes as `[]float64{x, y, z}` and an angle as
`int64` **with no change to the action spine whatsoever** — the exact property
`board.EncodeCell` was built to have. The same discipline carries over intact:
`action.ErrNonPrimitiveParam` rejects a bare domain struct in `Params`, and
every consumer decoding a coordinate goes through `DecodeVec`, never a type
assertion, because a Firestore round trip never produces the domain struct.

`DecodeVec` accepts the three numeric shapes a stored value arrives as (`int`,
`int64`, `float64`) for the same reason `board.decodeInt` does — an in-memory
unit-test literal, a Firestore round trip, and an HTTP body decode disagree on
shape, and that disagreement is exactly the bug class the board codec exists to
close.

### Decision 5: Every multiply-add is `float64(...)`-guarded, and the existing FMA check already catches it

The Bézier evaluator is the canonical instance (D-2 confirmed three FMA
instructions on arm64 from the naive form), but it is not the only one:
`insertionPeriod(r) = 5 + r*0.9`, `burnProgress`'s `0.5*a*τ*τ`, the arc-length
accumulator, and the angle-addition combine are all the same shape. Only an
explicit `float64(...)` conversion around the product is guaranteed by the Go
specification to force the intermediate rounding — **assigning the product to a
local does not inhibit the fusion**, which the capability's own design notes
record as verified in compiler output.

**Correction to finding D-4.** D-4 states that the FMA check is scoped per
family and would not cover a new package. It is wrong on this one point, and
the correction matters because it changes the task list:
`.claude/scripts/check-fma-contraction.sh` builds the **whole backend module**
(`cd backend && go build -gcflags=-S ./...`) on both targets and diffs
FMADDD/FMSUBD emission sites. `backend/space/` is therefore covered on day one
with **no widening at all**, and any unguarded multiply-add in it fails the
gate immediately, unregistered. The task is to confirm zero new arm64 emission
sites, not to extend the script. D-4's other two bullets (the transcendental
lint and the mirror map) are correct and are handled in Decision 8.

### Decision 6: Velocity is analytic; the central difference is deleted

The PoC computes body and ship velocity as a central difference at
`VEL_EPS = 1e-3` — catastrophic cancellation whose normalized output sets the
*stored* arrival geometry (it is what `buildCurve` uses to pick the arrival
tangent, which shapes the persisted control points). It goes.

- **Orbit velocity** is the analytic tangent of a circle: it is the *same*
  pinned-table lookup at the *same* index with cos/sin swapped and one sign
  flipped, scaled by `2π·r/period`, then run through the identical inclination
  and node rotation. Exact, cheaper than the difference it replaces (one table
  lookup instead of two full hierarchical position evaluations), and free of
  the `1e-3` magic number.
- **Curve tangent** is the analytic cubic Bézier derivative — the quadratic
  Bernstein form `3(1-u)²(c1-p0) + 6(1-u)u(c2-c1) + 3u²(p3-c2)`, guarded. This
  replaces `burnTangent`'s finite difference of `cubicPoint` at `h = 1/64`.
- **Hierarchical velocity** is the sum of the parent's velocity and the local
  orbital velocity, which is what the central difference was numerically
  approximating anyway.

`math.Hypot` also goes: Go's `Hypot` is a scaled iterative algorithm and
ECMAScript specifies `Math.hypot` as implementation-approximated. `Length` is
`math.Sqrt(float64(x*x) + float64(y*y) + float64(z*z))` — one correctly-rounded
`sqrt` over guarded products.

### Decision 7: No loop in `backend/space` has a data-dependent trip count

This is the design rule the README's guardrail #3 ("fixed iteration/sample
counts on every float path") *meant*, stated precisely enough to be checkable.
Three PoC sites violate it today:

1. **`solveBurn`'s epsilon break.** `if (Math.abs(next - flight) < 1e-9) break`
   makes the iteration count data-dependent — the README's own claim of a
   "32-iteration capped" solve is wrong; it is an early exit, and D-3 measured
   that the surrounding solve *amplifies* last-ULP noise ~2300×. Replaced by an
   **unconditional fixed round count**, no break.

   The count is not asserted, it is measured. The fixture family records, over
   a swept case set, the worst change in the **quantized** arrival between
   round `N-1` and round `N`; the count is correct when that value is **0 ms**
   on every case. Because Decision 2 makes the solve's output an integer
   millisecond, "converged" has a rigorous, gameplay-meaningful definition
   instead of a magic epsilon. Recommended starting point `N = 8` (the README
   observes convergence "in a few rounds because ship speed dwarfs orbital
   speed"); if the recorded residual is non-zero, raise `N` and re-record.

2. **`arcParam`'s `while (table[i] < goal) i++`.** Replaced by a
   **fixed 6-step binary search** over the 64-entry arc table. Same answer,
   constant trip count.

3. **`buildCurve`'s star-avoidance minimum scan** is already a fixed 33-sample
   loop and stays one; the fixed 64-segment arc table stays too. Both are fine
   under this rule — it bars data-dependent trip counts, not loops.

The star-avoidance push stays perpendicular to the chord. The PoC's comment
records that a radial push from a grazing point can be nearly chord-parallel
and reparameterize the line without bending it away from the star — that was
found by a test, and it is behavior, not an implementation detail.

### Decision 8: `fixtures/space/cases.json` is byte-for-byte exact, Go-only, and sweeps randomly

**The tolerance question dissolves.** The brief anticipated a tolerance-based
fixture family, on the grounds that byte-for-byte reproduction is impossible
here. That is true *across the language seam* — which is what D-1 and D-3
measure — and Decision 1 removed that seam. What remains is Go arm64 vs Go
amd64/`GOAMD64=v1`, and across those two targets every operation in this
package is exact:

| construct | why it is bit-identical across Go build targets |
|---|---|
| `+ − × ÷` with `float64(...)` guards | each operation separately rounded; IEEE-754 |
| `Floor`/`Ceil`/`Trunc`/`Abs`/`Min`/`Max` | in the capability's exact set |
| int64 sub-turn arithmetic, truncating division | integer |
| pinned turn table | committed data, loaded not recomputed |
| `math.Sqrt` | correctly-rounded per IEEE-754; the capability's own text says it is identical across Go build targets and unsafe only across the *language* seam |

So the family is recorded and asserted **byte-for-byte**, on both Go legs of
the build-target matrix, with the canonical serialization being Go's exact
`strconv.FormatFloat(v, 'b', -1, 64)` mantissa-exponent form — no decimal
rounding anywhere in the pipeline. A tolerance is not adopted, because a
tolerance is a real loss: it cannot catch a genuine regression whose magnitude
happens to sit below it, and this package would have had a wide one.

**What replaces the exhaustive sweep.** The existing requirement mandates an
exhaustive-sweep digest for "a shared function whose input domain is enumerable
within 10^6 inputs," and defines that domain concretely as ordered pairs of
polar cells. Over continuous R³ the clause has no meaning — but its *reason*
does: "a divergence that occupies a small fraction of the input domain cannot
be hand-selected for by someone who does not yet know it exists." That reason
is if anything stronger here, because D-2's FMA divergence and D-3's
amplification both live in fractions of a continuous domain.

The replacement is a **pinned randomized sweep**: each family records a
seeded-PRNG sweep case naming (a) the PRNG and its seed, (b) the input box each
coordinate is drawn from, (c) the case count, and (d) a SHA-256 digest over the
newline-joined canonical `'b'`-format serialization of the function's output
for each drawn input, in draw order. The PRNG is `splitmix64` on an integer
state — pure int64 arithmetic, no float, so the *inputs themselves* are exactly
reproducible on both targets, which is the property the whole case rests on.
Recommended count 100,000 per family (seconds of runtime; four orders of
magnitude more coverage than hand-selected cases). Hand-selected cases continue
to document intent; the sweep is what makes the family a contract.

**Planned families.** `turnTable` (asserted from
`fixtures/space/turn-table.json`, the second instance of the pinned-table
requirement), `phaseIndexOf`, `orbitPosition`, `orbitVelocity`, `bodyPosition`,
`bodyVelocity`, `curvePoint`, `curveDerivative`, `arcTable`, `arcParam`,
`travelTime`, `buildCurve`, `solveBurn` (including the round-`N`-residual
case from Decision 7), `burnPosition`, `burnTangent`, `burnSpeed`,
`parkPosition`, `stateAt`. One family per function, per the existing rule.

`travelTime` is the family that discharges the `sqrt`-pinning obligation. The
sqrt requirement already provides the Go-only branch verbatim — "Where the
computation has no TypeScript mirror ... the obligation is instead a Go-side
fixture family, recorded and asserted across the Go build-target matrix" — so
Decision 1 does not create a gap there; it selects a branch the capability
already anticipated.

**Deltas this implies against `cross-stack-determinism`** (named here for the
spec writer; this design authors none of them):

1. The fixture requirement's trigger is "implemented in both a Go package and a
   TypeScript module." A Go-only rule-bearing package simply never fires it,
   so today *nothing would require `fixtures/space/` to exist at all*. MODIFIED
   to also bind a rule-bearing Go package with no TS mirror whose functions
   compute persisted values, solve results, or ETAs over a non-enumerable
   domain.
2. The exhaustive-sweep clause gains the randomized-sweep form above for
   non-enumerable domains, with the PRNG, seed, box, count, and digest pinned
   in the fixture.
3. A third pragma vocabulary term, `determinism:allow(pinned)`, for a call site
   whose cross-target identity is established by a Go-side fixture family on
   the build-target matrix rather than by discretization or projection. Today
   the lint offers only `discretized` and `projection`, and neither describes a
   correctly-rounded `math.Sqrt` under a recorded family.
4. An explicit statement that designating one side authoritative for a
   capability means the other side carries **no** mirror, and that the guard is
   the anti-mirror check rather than a mirror-map pair.

**Enforcement widening (finding D-4), as concrete tasks:**

- `.claude/scripts/check-transcendental.sh:66` — add `space` to the Go package
  alternation `backend/(board|polar|fleet|mine|galaxy|system|corporations|market)/`.
  Without this the package is unguarded and the check reports
  `{"status":"pass","reason":"Not a determinism-governed production file"}`,
  which is indistinguishable from passing. Precedent:
  `add-polar-lattice-math` tasks.md 1.8 did exactly this.
- Add the `pinned` pragma to that script's accepted vocabulary and its header
  documentation.
- `.claude/scripts/check-mirror-map.sh` — add the anti-mirror invocation from
  Decision 1. Do **not** add a normal `pairs` entry.
- CI `fixtures/**` path filters and the fixture-suite stage — add
  `fixtures/space/**`, and run the Go fixture suite on **both** `GOARCH` legs
  (there is no JavaScript leg for this family, and its absence must be a
  recorded choice rather than an omission a reader infers).
- `python3 .claude/skills/code-quality-checks/check.py --files-only` inherits
  the transcendental scope, so the first bullet covers it; verify.

**Expected register outcome: no new entries, no new defect documents.** That is
a stated success criterion of this change, not a hope — every construct above
is chosen so that nothing needs bridging.

### Decision 9: Package layout, and what does and does not graduate from `sim.ts`

```
backend/space/
├── vec.go        Vec3, Add/Sub/Scale/Dot/Cross/Length/Normalize — guarded, no package state
├── turn.go       SubTurns, wrap-safe modular arithmetic, PhaseIndexOf (Decision 3)
├── table.go      the pinned two-level turn table: //go:embed, loaded never recomputed
├── orbit.go      Orbit{ParentId, Radius, PeriodMs, Phase, Inclination, Node}; LocalPosition/LocalVelocity
├── body.go       hierarchical resolution over an injected Bodies interface
├── curve.go      Curve{P0,C1,C2,P3}; Point, Derivative, ArcTable(64), ArcParam (fixed 6-step search)
├── burn.go       Burn{}; BuildCurve, SolveBurn (fixed rounds), Progress, Position, Tangent, Speed, DeltaV
├── park.go       Park{Kind, BodyId, Radius, PeriodMs, Phase, EpochMs, Offset}; Position, Velocity, StationKeepRate
├── state.go      ShipState + StateAt — the fold, on an integer arrival comparison
├── params.go     the Firestore/action.Params codec (Decision 4)
└── *_test.go     table-driven; fixtures_test.go; turn_table_record_test.go (the sole trig site)
```

**Graduates:** the vector algebra, orbits and hierarchical positions, parking
(`orbit` / `stationkeep` / `point`), the Hermite→Bézier tangent conversion,
star avoidance, the arc-length table and profile, the brachistochrone timing,
the moving-target intercept, insertion, and `resolveShip` (which becomes
`StateAt`, matching the name `board` already uses for the identical contract).

**Does not graduate:** `generateSystem`, `keplerPeriod`, `mulberry32`,
`PLANET_COLORS`, `ROMAN`, `Belt`, and the `SystemDef` type itself. Generation
is `system`/`galaxy` work, and the PoC's generator is a sketch of it, not a
draft of it. This matters beyond tidiness: `keplerPeriod`'s `math.Pow` is one
of the four functions D-1 measured diverging, and it never enters this package
at all. Nor does the PRNG — the orchestrator's abandoned end-to-end measurement
records the trap directly ("a faithful Go port of `mulberry32` requires exact
`Math.imul` and `>>> 0` semantics, and a subtly wrong PRNG port measures the
porting bug rather than the math"). `backend/space` takes bodies through an
interface:

```go
// Bodies resolves body identity to orbital elements. Accepted as an interface
// because space owns no storage and mints no body; system/galaxy do.
type Bodies interface {
    Body(id string) (Body, bool)
}
```

Hierarchical position resolution is **depth-bounded** (star → planet → moon →
station is 4) and returns `ok=false` past the bound, rather than recursing
forever on a cyclic parent chain the way `sim.ts`'s `bodyPosition` would.

`backend/space` imports `hexaverse/common` for `WorldMillis` and nothing else —
the same single dependency `board` and `polar` already carry. No Firestore, no
clock, no `time.Now()`.

`frontend/lib/space/` carries render-side geometry only: the wire-shape types,
an `orbitPosition` for drawing bodies per frame, and a `sampleCurve` for the
path polyline. It is free to use `Math.cos` under the projection exemption. It
contains no solver, no `travelTime`, no `stateAt`, and the anti-mirror check is
what keeps that true.

### Decision 10: Arrival continuity is exact by construction — the intercept *is* the settled park's position

**The call.** The positional discontinuity across arrival is **zero,
bit-for-bit**, not a measured tolerance. That is bought by inverting the PoC's
derivation order: the insertion **phase index is the primary datum and the
intercept is derived from it**, rather than the intercept being computed as a
float point and the phase index recovered from it afterwards. The solve's final
act, after Decision 2 has quantized the arrival, is:

```go
arriveMs  := departMs + int64(math.Ceil(flightSeconds*1000)) // Decision 2, FIRST
bodyAt    := bodies.PositionAt(targetId, arriveMs)           // at the INTEGER arrival
approach  := normalizeHorizontal(origin.Sub(bodyAt))         // float — but only ever an input to the quantizer
phase     := PhaseIndexOf(approach)                          // Decision 3: exact, documented tie-break
park      := Park{Kind: ParkOrbit, BodyId: targetId, Radius: standoff,
                  PeriodMs: insertionPeriod(standoff), Phase: phase, EpochMs: arriveMs}
intercept := park.Position(arriveMs)                         // the intercept IS the park's position
```

`Burn.Intercept` stores that value; the fold reconstructs the same `Park` from
the burn's stored fields and calls the same `Position`.

**Why this is bit-identical rather than merely close.** Not because two
expressions happen to round the same way — that argument would be worth
nothing — but because there is only **one** expression, called twice with
identical operands. Three properties reduce it to equality:

- **The phase-advance term vanishes exactly.** `(t-epoch) % periodMs * SubTurn
  / periodMs` at `t == EpochMs == ArriveMs` is integer zero, so the evaluated
  index *is* the stored `Phase` and no float enters the angle path at all
  (Decision 3).
- **The parent body's position is a pure function of an integer time** over the
  pinned table, so `bodies.PositionAt(targetId, ArriveMs)` returns the same
  bits in the solve and in the fold (Decisions 2 and 3).
- **One call site, so no contraction skew.** Two hand-written copies of
  `bodyAt + rotate(scale(dir, r))` could legally compile with FMA fused in one
  and not the other on arm64 (D-2). Sharing the function removes that hazard
  instead of merely guarding it.

**Why the inverse order does not work — recorded so nobody re-derives it.** If
the intercept is built first as `bodyAt + approach × standoff` from the *float*
normalized approach, and the phase is then recovered by `PhaseIndexOf`, the
park's position lands on the nearest **table** direction, which differs from
that float direction by up to half a sub-turn (2^-21 turn, ~3e-6 rad). At a
standoff of ~6 units that is ~2e-5 units of displacement: invisible in play, and
**not zero**. Under that ordering "bit-identical" is *unsatisfiable* and the
only honest spec sentence would be a threshold again. The quantized direction
must therefore *define* where the ship arrives, not summarize it lossily.

**Two implementer traps this ordering carries.**

1. The intercept must be built at the **quantized** `arriveMs`, after Decision
   2's `Ceil` — not at the solve's last float arrival. A body evaluated at a
   float arrival sits somewhere else, and continuity dies there rather than in
   the table.
2. The arrival tangent is likewise taken as `park.Velocity(arriveMs)` at the
   same index, not as the sweep of the pre-quantization float approach, so the
   direction the curve is built to meet is the direction the park actually has.

**What this does *not* make exact — deliberately.** The **tangent** alignment
stays a threshold and should. Star avoidance displaces `c2` (Decision 7), and a
cubic's end tangent is `3(P3−C2)` — so a curve that had to bulge around the
star ends pointing somewhere that is *deliberately* not the Hermite tangent it
was built from. That gap is a shape decision, not a rounding error, and no
construction removes it. Hence: position exact, tangent thresholded, and the
threshold floor is the spec's 0.95 (see Open Questions).

> **SUPERSEDED by Decision 11 (2026-08-27).** "No construction removes it" was
> wrong, and the fixture sweep proved it: the gap is not a shape decision, it
> is a shortage of control points. A construction *does* remove it — raise the
> curve's degree and displace only the interior points. The paragraph above is
> kept as written because the reasoning that produced the error is worth
> seeing; read it with Decision 11.

**Spec-side consequence, flagged not authored.** `space-kinematics` › *Intercept
Against a Moving Target Converges in a Fixed Number of Rounds* currently defines
the intercept as the body's position "displaced by the body's own insertion
standoff radius along the horizontal-plane projection ... (normalized)", and *A
Burn Past Its Arrival Is Its Settled Park* derives the park's phase as "the
phase index of the intercept's offset." Read together that is the inverse order
above, under which the bit-identity scenario cannot pass. The projection and
normalization survive **as the input to `PhaseIndexOf`**; what must change is
that the intercept is then taken *from* the quantized index. Reported to the
spec writer.

### Decision 11: The transfer curve is a QUINTIC Bézier, and star avoidance moves only its interior points

*Added 2026-08-27, after the fixture family measured Decision 10's tangent
threshold and found it violated. Supersedes Decision 10's "no construction
removes it" paragraph and amends Decision 7's `avoidStar`.*

**The measurement.** Over the `solveBurn` sweep, 422 of 4,035 body-target
insertions had their curve star-avoidance displaced, and **every case below the
0.95 alignment floor was one of those**. Among the 3,613 undisplaced insertions
the worst alignment was `0.9999999999999996` — one ULP shy of exact. The single
predictor is the ratio `|C2 displacement| / |P3 − C2|`: median 0.52, p90 1.03,
p99 1.53, max 2.20. Above 1.0 the push exceeds the tangent vector, `P3 − C2`
changes sign, and the ship arrives **backwards** — the −1.0 floor. On realistic
traffic (every ordered body-to-body transfer in the fixture system at the real
star clearance, 734 burns) 14.4% are displaced and **6.8% land below the
threshold**. One transfer in fifteen, not an edge case.

**Why a cubic cannot be fixed in place.** A cubic has four control points.
`P0` and `P3` are pinned by the transfer; both end-tangent *directions* are
pinned by departure velocity and insertion velocity. That leaves exactly two
free scalars — the two tangent magnitudes. Two scalars cannot satisfy an
arbitrary clearance constraint, and in the chord-parallel case all four control
points are collinear, so no magnitude change moves the curve off the line at
all. (Decision 10 said displacing along the tangents "only reparameterizes";
that is precisely true only in the collinear case, and the collinear case is
the one star avoidance most needs to solve. Either way the freedom is not
there.)

**The construction.** A quintic has six. Build the cubic exactly as before from
the Hermite data, then **degree-elevate it twice, 3 → 4 → 5**. Degree elevation
reproduces the identical curve, so the undisplaced geometry is unchanged by
construction rather than by re-tuning — and it provably preserves the end
tangents: elevating gives `R1 − R0 = (3/5)(P1 − P0)`, and the quintic's own
derivative at 0 is `5(R1 − R0) = 3(P1 − P0)`, the cubic's. `avoidStar` then
displaces **`C2` and `C3` only**. `C1` and `C4` are untouched, so
`Derivative(0) = 5(C1 − P0)` and `Derivative(1) = 5(P5 − C4)` are bit-identical
before and after any displacement, at any magnitude. The tangent alignment
stops being a threshold that avoidance erodes and becomes an invariant
avoidance cannot touch.

**What it costs — two things, both measured rather than assumed.**

*Avoidance needs retuning.* The matched `C2`+`C3` Bernstein weight is
`10(1−u)²u²`, peaking at 0.625 against the cubic's `3(1−u)u` peaking at 0.75 —
less leverage per unit of push, and falling off as `u²` rather than `u` near
the endpoints, which is the same property that protects the tangents. The
cubic-era constants (`minAvoidanceWeight = 0.08`, `avoidanceRounds = 6`) do
NOT survive that: they left 94/4,853 swept burns still inside the clearance
radius, and the chord-parallel grazing regression case failed outright. A grid
over both constants against the sweep found the first setting that clears
every case — `minAvoidanceWeight = 0.01`, `avoidanceRounds = 32` (violations
34 → 8 → 2 → 0 at rounds 6 → 12 → 20 → 32). Thirty-two is still a *fixed* trip
count, so Decision 7's no-data-dependent-exit rule is intact. The fixture
family now records `measured.starClearanceViolations` and asserts it is zero,
so the star-clearance guarantee — which nothing checked over the sweep before
— is gated from here on.

*The solve's residual grows.* Stronger avoidance means larger pushes, larger
curve-length swings, and so a louder lead-pursuit oscillation (Decision 12).
The randomized sweep's worst residual rises from 1,794 ms to 26,685 ms. That
number is a property of the sweep's adversarial box, not of the game: on the
enumerable realistic-traffic sweep recorded alongside it (725 body-to-body
burns at the star's real clearance) the p99 is 101 ms and the worst is 767 ms
against a median flight of 5,326 ms. Decision 12's bounds are therefore split
in two — a tight p99 bound that catches a broad regression, and a deliberately
loose max bound that catches a new pathology.

Everything else downstream (`ArcTable`, `Length`, `ArcParam`, the
brachistochrone profile) is degree-agnostic — it only calls `Point`.

**Why now.** This is the cheapest moment the degree will ever change: the
package has zero consumers, no burn has ever been persisted, and the whole
fixture family re-records in under a second. After a consumer exists it is a
stored-schema change across every burn document.

### Decision 12: The moving-target solve is fixed-round and bounded, not convergent

*Added 2026-08-27, after the fixture family measured Decision 7's zero-residual
claim and found it false. Amends the spec requirement rather than the code.*

**The measurement.** The quantized arrival differs between round `N−1` and
round `N` in 325 of 4,853 swept cases at `N = 8`, by up to 1,794 ms. Raising
`N` barely moves it — 8 → 325, 12 → 246, 16 → 231, 24 → 221, 32 → 216,
48 → 215 — so this is not a convergence-rate shortfall.

**The cause, isolated under control.** Re-running the identical draw stream
with star clearance forced to zero still leaves 267/5,000 (5.3%) non-zero, and
in **both** configurations every single non-zero case is a **moving** body
target: point targets and the zero-period body contribute exactly zero at every
`N`. (An earlier reading blamed `avoidStar` on the strength of a split that was
vacuous — the sweep draws clearance from `[0,40]`, positive in essentially every
case. Star avoidance does aggravate it, 5.3% → 6.7%, but 245 of the 325 are not
displaced at all.) This is lead pursuit: the solve seeks
`T = brachistochrone(length(curve(T)))`, which for a target moving appreciably
during the flight is not a contraction, and whose right-hand side the ceiling
quantization makes a step function of `T` — so an exact fixed point need not
exist at all.

**Alternatives measured, not assumed.** 0.5 under-relaxation is *worse* at this
`N` (84% non-zero): it damps the oscillation but converges more slowly, so
eight rounds no longer suffice. A fixed 24-step integer bisection for the
earliest coverable arrival found an answer for all 4,853 cases and left 4.1% of
stored pairs inexact — it dissolves the question (there is no fixed point to
seek) and fits the fixed-trip-count discipline, and is the right answer if this
ever becomes load-bearing.

**The decision: accept it, and say so.** The observable harm is small on the
traffic that matters. Judged on the enumerable realistic-traffic sweep — every
ordered body-to-body transfer at the star's real clearance — the residual is
zero in 82% of burns, p99 101 ms, worst 767 ms against a median flight of
5,326 ms. The ship still departs at the origin and arrives at the intercept
because both are clamped. What is wrong is that the quoted ETA and
the speed profile are slightly inconsistent with the curve actually flown. The
requirement is therefore reworded from "converges" to "runs a fixed number of
rounds", the guarantee narrows to determinism in `(inputs, N)`, and the
residual becomes a **measured, recorded bound** in the fixture family that a
regression must not exceed — two bounds, in fact, since the randomized sweep's
adversarial box and the realistic-traffic sweep answer different questions:
the p99 bound judges regression, the realistic-traffic figures judge
acceptability, and a loose max bound catches a new pathology. The complexity budget is better spent on
Decision 11, where the failure is visible to a player.

## Risks / Trade-offs

- **Preview-must-match-commit is the real casualty.** Decision 1's cost, stated
  once more because it is the one a player would feel: the client can draw the
  curve but not price it. The PoC's 5 Hz live ETA/Δv readout becomes a
  server-quoted number (a debounced quote endpoint, a later change) or a
  placeholder. The README's own open question "Preview vs commit Δv drift"
  arguably gets *easier* — there is one number, the server's — but the
  interaction gets a round trip it did not have.
- **A quantized orbit is a quantized orbit.** Angular resolution is capped at
  2^-20 turn. At radius 500 that is 0.003 units of positional granularity;
  invisible against body radii of 1.6–4.2. It is *placement* granularity only —
  arrival continuity is exact at any table resolution (Decision 10), so this
  number never becomes a continuity error. But it is a hard floor, and a future
  design that wants radii an order of magnitude larger must widen `SubTurn` and
  re-record the table.
- **The pinned table is a new artifact to maintain.** 4096 committed doubles, a
  recording flow, and a re-record discipline (reviewable diff in the change's
  own commits, never pipeline-generated). The board's coordinate table already
  proved this is livable.
- **Float disclosure predicates are a genuine regression, and this change does
  not incur it — the sighting change does.** Today `backend/observation`
  decides visibility over *integer cell sets* (`board.Within`, `Coverage`,
  `LineOfSight` on the pinned coordinate table) — exact by construction, no
  float comparison anywhere. Continuous space turns every one of those into a
  knife-edge float predicate: `dist <= bubbleRadius`, ray-vs-sphere hit/miss,
  curve-vs-moving-sphere intersection over an interval. Quantization does not
  fix a boolean, there is no tolerance to hide in, and a flipped boolean is a
  player seeing or not seeing an enemy fleet. Decision 1 (Go sole authority)
  is a necessary condition for that later change and costs it nothing —
  `observation` is already server-only. It is **not sufficient**: cross-target
  agreement on those predicates will need its own answer (carrying comparisons
  squared to avoid `sqrt`, and a documented tie rule at exact equality are the
  obvious candidates). **Resolved 2026-08-27 by `add-proximity-disclosure`**,
  after Travis retired the fog model itself: visibility is proximity plus
  going loud on burn, nothing persisted. Both candidates named here were
  adopted (squared comparisons; the tie rule settled as inclusive), the loud
  channel turns out to be an integer time comparison with no float boundary
  at all, and the recompute-per-read rule removes the permanence that made a
  flipped boolean dangerous. That change also names the hazard this bullet
  missed — path dependence across call routes, which pinning the table does
  not address.
- **A capability with zero consumers can drift from the spike it mirrors.**
  `add-polar-lattice-math` carried this exact risk and the mitigation is the
  same: `/spike/space-3d` stays alive as the feel bench, and the fixture family
  — not the spike file — is the contract.
- **Two tactical-math packages, then three-ish.** `board` and `polar` keep
  running the game while `space` has no consumers. That is the accepted
  polar-precedent cost, bounded by the eventual deletion (README: "delete the
  old package and build the new one; don't design coexistence").
- **`space` diverging from `sim.ts` is now expected, not accidental.**
  Decisions 3, 6, and 7 deliberately change the PoC's numbers — integer phases,
  analytic derivatives, a fixed round count. The PoC's 23 tests are behavioral
  and should survive; anyone reconciling exact values between the two will find
  they no longer match, by design.

## Migration Plan

**There is no migration.** This change adds a capability with zero consumers,
touches no stored data, adds no endpoint, and deletes nothing. Per the README's
ground rules, no migration, backwards-compatibility, dual-write, or feature-flag
work is planned here or anywhere downstream — when consumers move, the old code
is deleted.

Sequencing, mirroring the polar migration's eight steps:

1. **This change.** `backend/space` + the pinned turn table + `fixtures/space`
   asserted on both Go build-target legs + the enforcement widening.
   **If the build-target matrix does not go green byte-for-byte, stop** — do
   not proceed to a consumer. That rule already caught this pivot's central
   false premise once.
2. `add-proximity-disclosure` — the disclosure *mechanism* (recompute-per-read,
   squared inclusive comparison, canonical position path, integer-time burn
   emission, nothing persisted). Settles the float-predicate blocker below
   without deciding any model knob.
3. The sighting/fog model replacing `observation` (its own change; no longer
   blocked on the float-predicate question, still blocked on the README's own
   open knobs — identity gating, plume scaling, focused-scan pricing).
4. `system`/`galaxy` generation emitting orbits; the lane-gate question in
   continuous space.
5. `fleet`/`action`: `BurnResolver` settles curved burns. The channel split and
   the delta ledger carry over unchanged — the fold contract is identical.
6. `market`/`mine`/`stations`: positions and dockability re-expressed.
7. The renderer and the production `SpaceView`, last — the only part with a
   visual-regression risk tests will not catch.
8. Delete `backend/board`, `backend/polar`, `frontend/lib/board`,
   `frontend/lib/polar`, `fixtures/board`, `fixtures/polar`, and their
   capabilities.

Steps 2–8 are each their own change and are explicitly out of scope.

## Open Questions

### The determinism call is reversible, and this is the cheap place to be wrong

Decision 1 (Go sole authority, no TypeScript mirror) is **an architect's call
made under an explicit mandate, not a settled preference of Travis's.** It is
recorded here as reversible because it should be reversed if the feel cost
proves unacceptable.

- **What reversing it means:** building `frontend/lib/space` as a true mirror,
  which requires the rest of Option 2 — positions as fixed-point int64
  milli-units, `sqrt` via a pinned fixed-count Newton iteration, `Math.imul`-
  exact integer helpers on the TS side, and a byte-for-byte cross-language
  fixture family. Decisions 2 and 3 (integer time, integer angles over a pinned
  table) **survive reversal unchanged** — they were chosen partly for that
  reason, and they are also the two that do most of the work. Decision 4
  (float64 positions) is the one that flips.
- **What it costs to reverse:** rewriting `vec.go`, `curve.go`, `burn.go`, and
  the codec in a fixed-point regime, on both sides, plus the TS mirror and
  fixture leg. Real work, but **bounded and mechanical while the package has
  zero consumers**, and unbounded once `fleet`, `observation`, and the renderer
  read from it. This is precisely why the call is made now, in an additive
  change, rather than discovered during the first consumer migration.
- **What would make reversal right:** if a server round trip for every preview
  ETA/Δv digit reads as laggy in play, or if a future offline/optimistic client
  mode is wanted. Neither is knowable without playing it.
- **The cheaper middle ground, if the feel cost bites but full mirroring is not
  wanted:** amend `cross-stack-determinism`'s discretized-choice requirement so
  a clearly-labelled *approximate* preview ETA may be computed client-side and
  superseded on commit. The requirement's current text ("SHALL NOT ... be used
  to compute any further rule-bearing value including a displayed ETA") forbids
  it outright today. This is a smaller amendment than a mirror and preserves
  Decisions 2–4 intact. **Recommended over full reversal.**

### The placeholder numbers that are still rule-bearing

Both are pinned by the PoC at arbitrary values and both must have a stated
value before the spec is testable. Neither is invented here. (The PoC's third
such number — the ~0.1-unit insertion-continuity *position* tolerance — is no
longer open: it is **zero, exact by construction**, per Decision 10. The 0.1
was covering two gaps at once, a one-tick time gap and a recomputation gap, and
Decision 10 plus a same-millisecond comparison removes both.)

- **Arrival tangent alignment.** `sim.test.ts` asserts
  `dot(endTangent, settledDir) > 0.95`, an arbitrary number, and 0.95 is now the
  spec's **floor**: the value recorded in the fixture family may only *tighten*
  it. A swept worst case below 0.95 is a defect to fix — in the avoidance push
  or the Hermite tangent scale — not a threshold to re-baseline. What remains
  genuinely open is the **recorded** value, because the gap it bounds is
  structural rather than numerical: star avoidance displaces `c2`, so a bulged
  curve's end tangent `3(P3−C2)` is deliberately not the arrival tangent the
  curve was built from (Decision 10). The worst case over the randomized sweep
  is not knowable until the sweep runs; recording it is a task, and the
  requirement's floor stands at 0.95 until a stricter measurement replaces it.
- **Minimum flight time.** The PoC uses 0.05 s, also arbitrary, and it exists
  to stop a degenerate zero-length burn. **Recommendation: express the floor as
  a minimum *arc length* rather than a time** — "you are already there" is a
  distance fact, not a duration fact, and a length floor is scale-coupled to
  the insertion radius in a way a time floor is not. A burn below the floor
  should be rejected at commit with its own reason (the way a mine command
  naming a station is), not silently clamped. **The value itself is left
  open**, with one world-second of flight at the nominal 8 u/s² accel as a
  starting point for feel testing — recorded as a starting point, not a
  decision.

### Carried forward from the README, deliberately unanswered

- **Cancel semantics.** Instant-stop is a handwave. Coast-out, retro-burn with
  a Δv price, or re-target mid-burn (solve a new curve from the current
  position and tangent) all have different storage shapes. The README calls
  this "the biggest feel question left." `StateAt` must fold whatever is
  chosen, and a cancel that writes a new park at the cancel instant folds
  cleanly; a coast-out needs a fourth idle mode. Nothing here presumes an
  answer.
- **The solve's fixed round count `N`.** Decision 7 gives the rule for choosing
  it (the round-`N` quantized residual must be 0 ms across the sweep) and
  recommends 8 as a starting point; the actual value comes from the recording
  run, not from this document.
- **The contested-place question.** The README's own framing: cells gave you
  discrete places worth holding, and continuous space needs a replacement
  notion of place or everything between six points of interest is vacuum. It
  couples to the sighting model (a parked army *creates* a place) and to
  economics (positions near lodes, stations, lane endpoints). This change adds
  no answer and should not be read as implying one.
- **Scale and tuning.** Accel (8 u/s²), tank (500 Δv), insertion radii, the
  station-keep floor (0.5/s), and the star-clearance factor (2.5×) are all
  PoC dials. They graduate as named parameters in a `space/params.go`
  following the `market/params.go` and `observation/params.go` precedent, with
  their PoC values carried over as **placeholder constants** — the same
  honesty `corporations/siteselection.go` already uses.
- **Whether `frontend/lib/space` is the right home for the render geometry** at
  all, versus keeping it inside `components/`. `lib/` is where the mirror-map
  check looks, which is an argument both for (the anti-mirror guard has
  somewhere to point) and against (it advertises a mirror that must not exist).
  Recommendation: `lib/space`, precisely so the anti-mirror check has a fixed
  target; noted as reversible and low-stakes.

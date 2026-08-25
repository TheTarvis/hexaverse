## Context

`docs/handoffs/2026-08-24-polar-lattice-migration.md` is **APPROVED
(2026-08-25)**: the hex board's chord trajectories (`SolveIntercept` leads a
target and commits one straight Cartesian path while everything around it
rotates) are being replaced by a lattice whose native "straight line" is an
arc. The spike (`frontend/app/spike/polar-board/polar.ts`, 44 pinned tests)
proved the candidate lattice's core claims and also disproved two hopeful
claims made during the debate. This change is the handoff's own step 3
(Section 9): stand the polar lattice up as a spec'd, fixture-pinned Go↔TS
capability with **zero consumers**, and stop if parity does not hold.

This change depends on `pin-cross-stack-determinism-seam`. That capability's
"Rule-Bearing Values Cross the Seam By Exact Arithmetic or By Discretization"
and cross-build-target requirements are exactly what the rational-turns
integer basis below exists to satisfy, and
`docs/defects/2026-08-25-line-fma-arch-divergence.md` documents, on the
*incumbent* hex lattice, precisely the hazard class (float contraction
differing between `arm64` and `amd64` at a rounding tie) that an
insufficiently careful polar port would reintroduce on day one.

## Goals / Non-Goals

**Goals**
- Define ring-and-slot cell coordinates, a parameterized slot schedule, arc
  paths, core-reachability, and integer orbital advance as a standalone,
  fixture-pinned capability.
- Prove Go↔TS parity (and Go cross-build-target parity, per
  `cross-stack-determinism`) on a new fixture family before any consumer
  changes.
- Keep every open decision (slot schedule values, aliasing quantizer,
  data migration) visibly open rather than silently resolved by
  implementation choice.

**Non-Goals**
- **No consumer is migrated.** `board-tactical-math`, `fleet-movement`,
  `observation-fog-and-scan`, `hex-board-view`, `system-interior`,
  `corporation-spawn`, `backend/board/`, and `frontend/lib/hex/` are
  untouched.
- **No propellant/delta-v.** `docs/plans/propellant-and-delta-v.md` is a
  separate, still-scoping arc; noted below only as a forward dependency.
- **No data migration.** Decision 5 (regenerate vs. migrate dev/prod
  galaxies, corp fog, fleets) is out of scope for a change with no stored
  data and no consumers.
- **No renderer work.** `frontend/components/board/`, `webgl/`, and the
  smoothing/tuning bench stay as they are; `/spike/polar-board` remains the
  place those questions get re-litigated (handoff Section 10).
- **No leak into the graph tier.** `frontend/components/galaxy/` is
  systems-and-lanes, not a board; it has no hex or polar lattice today and
  this change must not give it one.
- **No `maxTurn`/render-metric fixture family.** The handoff's bench
  measures path smoothness (`maxTurn`, Chaikin-smoothed) via `atan2` over
  *projected pixel* points, not lattice cells — it is render-side and not
  portable to a byte-identical cross-language contract by construction.
  Dropping it from this capability's fixture family is correct, not an
  oversight; the one measured loss from not having it here is that the
  16.5°-vs-8.2° inbound-transfer smoothing comparison (Risks/Trade-offs)
  is not pinned by any test in this package's own suite. Correction: the
  spike's `page.test.tsx` does not pin those absolute degree values either
  — it pins only the inequality `expect(turnFor('polar')).toBeGreaterThan(
  turnFor('hex'))` on that case. The 16.5°/8.2° figures are this design
  doc's own recorded measurement, not a value asserted by any test.

## Decisions

### Decision: A new capability, not a MODIFIED delta on `board-tactical-math`
Two capabilities coexist for the duration of the migration sweep rather than
landing this as `MODIFIED`/`REMOVED` deltas against the incumbent. The
alternative — modifying `board-tactical-math` in place now — was rejected:
`openspec/specs/` is supposed to describe what is actually built, and no
consumer will read from the polar lattice until steps 4–8 of the handoff's
sequencing land (each expected to be "one long red-to-green push," per
Section 9, not landed incrementally). Describing the polar lattice as the
board's math while every consumer still calls `backend/board`/`lib/hex`
would make the spec tree actively wrong for an unknown, possibly long,
duration. The eventual removal of `board-tactical-math`'s
`Core-Avoiding Routes` requirement and its `routeAround` fixtures belongs to
a later consumer-migration change, when a consumer actually stops calling
`RouteAround`.

**Exit.** `polar-lattice-math` is a temporary capability, not a permanent
second owner of "the board." At consumer migration (handoff step 4),
`backend/board` is rewritten behind its existing signatures and
`board-tactical-math` becomes the polar capability: its lattice
requirements are replaced by these, `Core-Avoiding Routes` and `Contiguous
Hex-Line Paths` are REMOVED, its kinematics requirements (`Effective
Movement State Fold`, `Computed Ship Board Position`, `Due-Kinematics
Detection`, the two solves, the two visibility requirements, the two lane
requirements) are MODIFIED to swap coordinate types, and
`polar-lattice-math` is REMOVED in the same change. Until then, `Orbital
Advance…` and `A Straight Path Is an Arc` deliberately duplicate
`Deterministic Orbital State` and `Contiguous Hex-Line Paths`; the
duplication is bounded by that removal, and the vocabulary is kept
deliberately distinct (`cell`/`ring`/`slot` here, `hex`/`ring`/`angle index`
there).

### Decision: Banded schedule over naive hex-derived 6N
`polar.ts` documents why a naive polar grid reusing hex's `6N` slots per
ring is rejected: it inherits a fractional radial mapping everywhere (ring
10's 60 slots onto ring 9's 54 do not merge cleanly, so stepping inward and
back out does not return you to where you started). The banded schedule —
constant slot count within a band, doubling at each boundary — keeps radial
neighbor relations exactly 1:1 or 2:1, never fractional. This is why the
Slot Schedule Shape requirement mandates that structural property
(non-decreasing, constant-per-band, exact-double-at-boundary) as the
*invariant*, while leaving the actual band list and inner slot count
unspecified — Decision 2 is not this change's to make (see Open Questions).

Measured trade (rings 1–16, isotropy = worst tangential:radial cell
aspect ratio across the board):

| schedule | isotropy (min–max) | slots at ring 1 |
|---|---|---|
| cube 6N (production, for comparison) | 1.05 – 1.05 | 6 |
| polar, tight bands | 0.59 – 1.05 | 6 |
| polar, `Balanced` | 0.29 – 0.52 | 12 |
| polar, `Inner-dense` | 0.26 – 1.57 | 24 |

No schedule wins both isotropy and inner resolution. Cube is perfectly
isotropic by construction and cannot be beaten on cell shape — that is the
real thing a polar migration trades away, and it is stated here rather than
hidden, per the instruction that a spec capturing only polar's wins would be
dishonest. The spike's own conclusion: the only honest lever for inner
detail is **radial spacing** (closer ring spacing near the core), not slot
count, and that lever is unscoped by this change or the handoff.

### Decision: Rational-turns integer basis, round-ring-then-angle ordering
The handoff (Section 5, decision 3) records a salvaged candidate
answer-*shape* from the deleted arc-on-hex draft: a cell's angle is
`index / slotsOnRing` in exact rational turns; the sweep between two angles
is rational-turn arithmetic (shorter direction, half-turn tie fixed); each
sample rounds the **ring first**, then picks the angularly nearest slot on
that rounded ring. Every intermediate value stays an integer or exact
rational until the final round. Two reasons this is specified as *shape*
(Requirement: "A Straight Path Is an Arc") while the actual quantizer
algorithm (Decision 3 — is Bresenham-style error accumulation across the two
axes worth adding?) stays open:

1. **It sidesteps the FMA float-drift hazard entirely.**
   `docs/defects/2026-08-25-line-fma-arch-divergence.md` measured Go's `gc`
   compiler fusing `a + (b-a)*t` into one `FMADDD` on `arm64` and not on
   `amd64`, disagreeing on 1.97% of hex-line pairs at exactly the rounding
   ties a lattice sits on constantly. An integer/exact-rational basis has no
   such intermediate to fuse.
2. **The round-ring-then-angle ordering is load-bearing**, evidenced by the
   deleted arc-on-hex draft's measurement that naive Cartesian nearest-cell
   rounding pushed **86.7%** of same-ring transfers off their own ring.
   Polar's native ring indexing mostly dissolves that specific failure mode
   (a same-ring interpolation never produces a fractional ring to round
   badly), but the ordering itself — resolve the discrete ring first, then
   the discrete angle on that ring — is the transferable discipline this
   change specs, independent of whichever quantizer answers Decision 3.

Alternative considered and rejected: leaving angle in floating-point radians
end to end (as the *rendering*-side `polar.ts` projection functions do).
Rejected because that is exactly the class of expression
`cross-stack-determinism` prohibits from reaching a stored value, solve
result, or ETA — `sin`/`cos`/`atan2` are not guaranteed to agree between Go
and JS, and the spike hit this directly (Node vs. Chrome disagreed in the
last ULP of `Math.cos`, `-42.83999999999999` vs. `-42.83999999999998`,
though harmlessly, because that call site is pure projection).

### Decision: Three exact-tie rules are arbitrary but fixed
The path-computation requirement ("A Straight Path Is an Arc") names three
exact-tie inputs that need a rule at all: an interpolated ring landing
exactly halfway between two integer rings, an interpolated angle landing
exactly equidistant between two adjacent slots on the rounded ring, and an
angular difference of exactly half a turn. Each is resolved by a fixed
direction — round-toward-destination for the ring tie, round-in-the-sweep's-
direction-of-travel for the angle tie, increasing-slot-index for the
half-turn sweep. These are determinism tie-breaks, not gameplay decisions:
any consistent choice would satisfy the requirement, and none of the three
resolves Decision 2 (slot schedule), Decision 3 (aliasing quantizer), or any
other open question above. They are recorded here, not left implicit,
because an unstated tie-break is exactly the failure mode
`docs/defects/2026-08-25-lanegate-near-tie-divergence.md` already filed
against this codebase once: two independent implementers each write a
"reasonable" rule and diverge on the first fixture case that hits the tie.
If Decision 3 replaces per-sample rounding with a Bresenham-style two-axis
quantizer, these three rules may be superseded wholesale — they are fixed
for the sampling scheme specified here, not binding on whatever quantizer
eventually answers Decision 3.

Measured justification for fixing these rules in the rational-turns integer
basis rather than leaving them to float comparison: two implementations
differing only in which of these tie rules they apply disagreed on 34.63%
of swept paths at the ring tie, 44.65% at the slot tie, and 1.44% at the
half-turn tie. Worse, the float form of the half-turn tie is not even
internally self-consistent — at ring 17, 43 of 192 exactly-half-turn pairs
swept the opposite direction from the other 149, purely from `atan2`/`cos`
ULP error, with no rule change involved at all. An integer/exact-rational
tie-break has no such internal inconsistency: the same inputs always
produce the same comparison. This is also why the zero-sweep case (every
purely radial path, including any with the core as an endpoint) needed its
own explicit rule — it is the single most common tie, hit on 1,860 of the
swept ordered pairs under the default schedule, and "the sweep's direction
of travel" is undefined when there is no sweep.

### Decision: Per-cell sampling, not dense sampling, for `arcPath`
`polar.ts` measured that oversampling a path (more than one sample per cell
the path must cross) is not harmless: on the bench's inbound-transfer case,
dense sampling scored 121° of max turn against 94° for sampling once per
cell the path must cross. Dense sampling emits a ring change and a slot
change as two separate cells instead of one diagonal step, turning a
shallow descent into a sawtooth. The path-computation requirement therefore
specifies one sample per interpolation step at cell granularity, not a
denser render-only sampling — that finer sampling still exists, but only in
the rendering path exempted by the Rule-Bearing Values requirement.

### Decision: The per-cell sample count is measured against the finest ring spanned, not the mean ring
An earlier draft of this decision (and `polar.ts:273-276`) sized the sample
count against the *mean* of the two endpoint rings. Two independent review
passes measured that this undersatisfies the path-computation requirement's
own adjacency clause: swept against the spike's own `isAdjacent` predicate
across 528,905 paths over four schedules, 12.3%–25.6% of paths emit at
least one non-adjacent consecutive pair (65,297/528,905 overall); an
independently swept 55,269-path sample measured 18.8%. Minimal repro:
`arcPath({ring:1,slot:0},{ring:3,slot:7})` under the default schedule emits
`1:0 → 2:1 → 2:2 → 3:5 → 3:7` — a 2-slot jump on ring 3 (a 30° gap against
ring 3's 15° cell width). The cause: sizing the sample count from the mean
ring undercounts whenever the destination ring is finer than the mean.

The three measured exits:

**The "smoothed turn" and "length" columns below are measured on the
spike's float quantizer (`polar.ts`'s `Math.round` ring-tie behavior), NOT
on this change's specified exact-rational realization (which ties toward
the destination ring, not `Math.round`'s half-toward-+∞). A round-2
adversarial re-score using the bench's own smoothing code, but this
change's specified realization (exact-rational, finest-ring, ties toward
destination), found: 32 cells, 12.6° smoothed max turn, 28.23 length — an
unverified indication (not independently reproduced by this design doc)
that finest-ring sampling under the realization actually specified here
may cost nothing relative to mean-ring, contrary to the 27.3°-vs-16.5°
comparison the row below shows. See the re-bench task (tasks.md 5.2) before
this table's smoothness/length columns are relied on for Decision 3.**
The non-adjacent-paths column is unaffected by this caveat: round-2 of the
adversarial review independently confirmed finest-ring sampling's zero
non-adjacent pairs against the spec's own (not the spike's) adjacency
predicate, across 921,676 exhaustive paths (four schedules) plus 1,000,000
random paths at maxRing 20.

| option | non-adjacent paths (528,905 swept) | inbound-transfer smoothed turn (spike float quantizer) | inbound-transfer length (spike float quantizer) |
|---|---|---|---|
| mean ring (rejected) | 65,297 | 16.5° | 27.5 |
| **finest ring spanned (adopted)** | **0** (all four schedules) | 27.3° | 29.3 |
| mean ring + stitch pass (not adopted) | 0 (achievable) | 16.5° | 28.2 |

This change adopts **finest-ring sampling**: the sample count is sized
against the finer — outermost — of the two rings the path spans, not their
mean (see the "A Straight Path Is an Arc" requirement's sampling clause).
It is the only one of the three measured exits that satisfies the
requirement's own contiguity clause with no added machinery, and it does so
at zero measured violations across every schedule tested.

**This is a satisfiability fix, not an answer to Decision 3.** It costs the
inbound-transfer smoothness the mean-ring formula happened to produce:
27.3° smoothed max turn against the 16.5° measured (not pinned — see the
Non-Goals correction above; `page.test.tsx` pins only an inequality, not
this degree value) on the spike's float quantizer (tasks.md 5.1 notes that
16.5° figure describes the spike, not this production package, and is not
reconciled by this change). **This 27.3°-vs-16.5° comparison is itself
suspect — see Major-8 finding below and the re-bench task (tasks.md 5.2)
before it is relied on.** A
mean-ring-plus-stitch-pass would recover the 16.5° figure at zero
violations too, but a stitch pass inserts a cell the direct endpoint-to-
endpoint interpolation would not otherwise emit — and while the
no-inserted-waypoint clause in "A Path Reaches the Core Only If an Endpoint
Is the Core" has been narrowed to bar only avoidance detours (not a
contiguity stitch), no such stitch is specified or adopted here; it remains
a candidate for whoever answers Decision 3. **Flagged explicitly for
Travis, with a caveat:** answering Decision 3 (whether a Bresenham-style
two-axis error-accumulating quantizer replaces per-sample rounding) was
believed to be the only measured door that might recover both zero
adjacency violations and the 16.5° smoothness figure at once, and the
handoff's own framing says answer it first, estimating a few hours of
work. **That belief now rests on a comparison (27.3° vs. 16.5°) measured
on the spike's float quantizer, not on this change's specified
exact-rational realization** — see the annotated table above. A round-2
adversarial re-score under the specified realization found 12.6°, better
than the 16.5° mean-ring figure it would be "recovering," not worse
(unverified, not independently reproduced). This escalation should not be
acted on at its stated cost until the specified realization is re-benched
(tasks.md 5.2); the true cost of finest-ring sampling relative to
mean-ring, under the realization this change actually specifies, may
already be zero, in which case Decision 3 is not urgent for the reason
given here.

### Decision: Adjacency includes corner contact
The Lattice Adjacency Is an Integer Predicate requirement counts a cell that
changes both ring and slot from its neighbor as adjacent (corner contact),
matching the spike's `isAdjacent`. This is load-bearing, not a convenience:
an edge-only variant (same-ring or same-slot only, no corner contact) was
measured to fail 97% of swept paths, because a path descending in ring
while sweeping angle almost always needs a diagonal step. An exact-integer
restatement of the spike's float `isAdjacent` predicate (the `* 1.01` fudge
removed) was verified to reproduce it on all 314,257 ordered pairs within
±1 ring across rings 0–17 with zero disagreements — the fudge was covering
float error and nothing else, confirming the integer restatement is a
faithful, not a narrowed, definition.

### Decision: BigInt in TypeScript mirrors Go's truncating int64 division
Orbital advance (`orbCellAt` in `polar.ts`) truncates
`(worldTime * slots) / period` using `BigInt` specifically so the
truncating-integer-division semantics match Go's `int64` division exactly,
the same pattern `frontend/lib/hex/orbit.ts` already uses for the incumbent
hex lattice's `orbState`. The Orbital Advance requirement specifies
"truncating integer quotient" for this reason — both languages must
truncate, not round, and must not lose precision to a `float64`
intermediate the way a naive `Math.floor(worldTime * slots / period)` in
JavaScript would above `2^53`. The TypeScript mirror reduces modulo the
slot count in `BigInt` before converting to `Number` (tasks.md 2.1) rather
than converting first, unlike `polar.ts:220-223` and the incumbent
`lib/hex/orbit.ts:34-36` — unreachable at plausible world times, but free
to close, and not inherited by copy into the new mirror.

### Decision: Orbit back-solve is added; direction and time-origin are made explicit
The original spec draft carried forward advance but not its inverse, even
though `board-tactical-math` carries `Anti-Teleport Orbit Back-Solve` for
exactly the reason this change exists to prove parity on: `angle0` (the
epoch slot index here) is what gets **persisted** when a body settles onto
a cell. A forward-only spec would leave the one value this capability
actually stores unconstrained. The back-solve added above uses the same
truncating integer arithmetic as forward advance, so settling never
teleports the body to a different slot than the one it settled onto.

Direction and the world-time origin were also unspecified in the original
draft; both reference implementations silently coerce (`polar.ts:219`,
`backend/board/orbit.go:70-72`), and `0` is both Go's struct zero value and
the value absent from a fresh, freshly-deserialized JSON body — the most
likely input a Go mirror sees for a body nobody has set a direction on. An
unspecified coercion means a spec-compliant Go mirror with no special
`dir==0` handling would freeze every such body while a TypeScript
implementation that happens to coerce `0` to `+1` keeps advancing it — a
silent seam fork on the single most common input, not an edge case. The
Orbital Advance requirement now states the coercion explicitly (`0` → `+1`)
and names the time origin (the world epoch, non-negative) rather than
leaving "elapsed world time" to mean whatever origin a caller assumes.

### Decision: Sweep domain bounds — bounded ring, period-relative time offsets, wrap-safe integers
No maximum ring, slot ceiling, or world-time range was named in the
original draft, yet an exhaustive sweep was mandated — undercutting both
constructibility (an unbounded loop) and reproducibility (no fixed
enumeration order to hash). `cross-stack-determinism`'s own inventory
(`pin-cross-stack-determinism-seam` task 5.1) already ruled hex's
`orbState` NOT sweep-eligible for the same reason: an unbounded time axis.
The Sweep Domain Is Bounded requirement above resolves this the same way
that inventory implies: bound the ring axis to a named maximum, and replace
the unbounded world-time axis with a small, fixed set of period-relative
offsets (0, 1/4, 1/2, 3/4, 1× period) rather than an absolute wall-clock
range — the orbital-advance and back-solve behaviors that matter (full-
period return, half-period advance, motionlessness) are all expressible at
those offsets regardless of how large an absolute world time later grows
to. The requirement also names the wrap hazard directly: `worldTime ×
slots` can exceed `int64` in Go while TypeScript's `BigInt` does not wrap,
so an unguarded sweep could silently pass on one side and silently
misbehave in production on the other; both sweeps are required to use a
wrap-safe integer representation throughout.

## Risks / Trade-offs

- **Arcs are longer than chords.** The spike's inbound-transfer case costs
  27.5 radial units against cube's 19.0 for the same endpoints — every
  movement-tuning constant (`MsPerTile`, burn durations, delta-v budgets
  once that arc lands) moves. The retune target is undecided (see Open
  Questions); this change does not retune anything, since it has no
  consumer, but the eventual consumer-migration change will need to.
- **The mixed inbound-transfer case is a measured loss, not just a
  measured win.** Descending ten rings while sweeping 162° aliases the two
  axes — ring drops land unevenly among slot steps and each one jolts. After
  identical Chaikin smoothing, polar measures **16.5°** max turn on that
  case against cube's **8.2°** (cube's staircase is uniform by construction
  and smooths flatter). Polar wins every other measured case (across-the-
  star 0.5° vs. 8.2°, tangential burn 0.9° vs. 8.2°, steep radial 7.0° vs.
  8.2°). This is pinned as a failing-if-violated test in `page.test.tsx` and
  is exactly the kind of loss a spec that reports only wins would hide.
  (These are the spike's mean-ring float-quantizer figures; `page.test.tsx`
  pins only the inequality `turnFor('polar') > turnFor('hex')`, not the
  degree values — see the per-cell-sample-count Decision's annotation and
  tasks.md 5.2.)
- **Isotropy is a genuine, irreducible loss.** See the Slot Schedule
  decision above — cube's flat 1.05 cannot be matched by any polar banding
  schedule; 0.59 is the closest measured approach.
- **A capability with zero consumers can drift from the spike it mirrors.**
  Mitigated by keeping `/spike/polar-board` alive as the tuning bench
  (tasks.md) and by the fixture family being the actual contract, not the
  spike file.
- **The transcendental lint's pattern is narrower than the hazard.**
  `.claude/scripts/check-transcendental.sh` is hardcoded to
  `backend/board/*.go` and `frontend/lib/hex/*.ts` today (tasks.md 1.8
  extends its scope to this package). Its pattern also omits `Round`, and
  `math.Round` in Go and `Math.round` in JavaScript disagree on every
  negative half-integer (`math.Round(-2.5) == -3`, `Math.round(-2.5) ==
  -2`) — so the scope extension in tasks.md 1.8 should widen the matched
  pattern to include `Round`, not only the matched directories. `Floor` and
  `Trunc` agree exactly across the seam (the incumbent mirror uses them
  deliberately — `frontend/lib/hex/hex.ts:58`,
  `frontend/lib/hex/intercept.ts:51,55`,
  `frontend/lib/hex/movement.ts:149,151`) and SHALL NOT be added to the
  pattern.

## Migration Plan

This change has no migration of its own — it adds a capability with no
consumers and touches no stored data. It sits at step 3 of the handoff's
eight-step sequencing (Section 9):

1. Answer Decision 3 (aliasing quantizer) — precedes or accompanies this
   change; not this change's decision to make.
2. ~~Land or shelve the credits/market change~~ — done (`59bc9c4`).
3. **This change:** Go implementation of `polar.ts` + TypeScript mirror +
   new fixture family, asserted by both suites, before any consumer.
   **If parity does not hold, stop** — do not proceed to step 4.
4. `board/`-equivalent rewrite behind existing function signatures where
   possible, so consumers change in one mechanical sweep.
5. `lib/hex`-equivalent mirror + fixture re-record; both sides green before
   consumers.
6. Consumers, in dependency order: `system` → `fleet` → `observation` →
   `corporations` → `mine`/`market`.
7. Renderer, last — the only part with a visual-regression risk tests will
   not catch.
8. Regenerate worlds in dev; decide prod separately (Decision 5).

Steps 4–8 are each their own future change and are explicitly out of scope
here.

## Open Questions

These are recorded verbatim from the handoff's Section 5 and are
deliberately **not** answered by this change. None of the requirements
above depend on their resolution; where a requirement borders one of these
questions, it specifies structure (e.g., the schedule's doubling invariant)
and leaves the value or algorithm open.

- **Decision 2 — the slot schedule.** `innerSlots` and the band-boundary
  list are unresolved. The measured trade (Decisions section above) shows
  no schedule wins both isotropy and inner detail; the only honest lever
  for inner detail is radial spacing, which is unscoped. `TIGHT_BANDS =
  [2,3,5,9,17]` with `innerSlots: 6` is the spike's *default*, not a
  decision.
- **Decision 3 — the aliasing quantizer.** Whether Bresenham-style error
  accumulation across the ring and angle axes (rather than independent
  per-sample rounding) improves the inbound-transfer aliasing case is
  untried. The handoff records a candidate answer-*shape* (the
  rational-turns integer basis, specified above as structure) but not an
  answer to whether that specific improvement helps. Finest-ring sampling
  (adopted above, in the per-cell-sampling Decision, as a satisfiability
  fix — not an answer to this Decision) was measured, on the spike's float
  quantizer, to cost the inbound-transfer smoothness the previously
  mean-ring formula produced — 27.3° smoothed max turn against 16.5°.
  **That comparison is now suspect and should not be used to escalate this
  Decision until re-benched:** a round-2 adversarial re-score of the same
  case under this change's actually-specified exact-rational realization
  (not the spike's `Math.round`-tie float quantizer) found 12.6°, better
  than the 16.5° mean-ring figure — unverified and not independently
  reproduced, but reason enough to withhold the "answering this Decision
  might recover 16.5°" framing until the re-bench task (tasks.md 5.2)
  confirms or corrects it. If the re-bench confirms near-zero cost,
  answering this Decision may no longer be urgent for the reason
  originally given.
- **The adjacency predicate's doubling-boundary looseness (MAJOR-4 fork
  from round-2 review) — Travis's call, not resolved here.** The integer
  adjacency predicate `g × min(Sa, Sb) ≤ D` (Lattice Adjacency Is an
  Integer Predicate) calls a coarse cell adjacent to outer cells at a
  doubling boundary that do not geometrically touch it: for `Sa = S`,
  `Sb = 2S` it permits `g ≤ 2` in `1/2S`-turn units, but the cells'
  angular half-widths sum to only 1.5, so `g = 2` leaves half a fine cell
  of empty lattice between them, with a whole intervening cell touching
  both. True corner contact is the tighter bound `2g ≤ D/Sa + D/Sb`. This
  is a faithful transcription of the spike's own predicate, not a drift
  introduced by this spec: the integer restatement reproduces the spike's
  float `isAdjacent` (its `* 1.01` fudge removed) on all 314,257 ±1-ring
  pairs with zero disagreements — the spike's predicate itself is loose.
  The specified sampling rule (per-cell, finest-ring) uses such loose steps
  on 14.5% / 14.6% / 8.2% / 14.8% of swept paths across the four measured
  schedules. Two options, neither adopted here: keep the predicate as
  specified (status quo, 0 sampling violations measured) or tighten it to
  true corner contact, which re-opens the adjacency-sampling failure on
  8.2%–14.8% of paths and would need the sampling rule re-solved (or the
  stitch pass this change declined to adopt) to close again without
  re-opening it.
- **Decision 5 — data migration.** Whether to regenerate or migrate dev
  (`hexaverse-game-dev`) and prod (`hexaverse`) galaxies, corp fog, and
  fleets. Regenerating is likely right but spawn is account-linked
  (`corpByAccount/{accountId}`), so wiping corps orphans logins. "Ask — do
  not assume." Out of scope for this change (no consumers, no stored data
  touched) but a downstream gate before step 8.
- **The minimum acceptable cell aspect ratio.** Cube is a flat 1.05 by
  construction; the best measured banded polar schedule reaches 0.59. No
  threshold is named anywhere in the source material, and none is invented
  here.
- **The orbital period law under a banded schedule.** The current law is
  linear (`OrbitPeriod(ring) = base × ring`). On hex, ring N has exactly
  `6N` cells, so cell-crossing cadence is a constant `base/6` on every ring.
  Under a *banded* polar schedule, cadence becomes
  `base × ring / slots(ring)`, which is discontinuous at every band
  boundary. Nobody has decided whether to accept that discontinuity, adopt
  a Kepler-style `ring^1.5` period law (the spike notes this becomes
  expressible on polar in a way uniform hex cannot), or derive the period
  law from the schedule to keep cadence continuous. This gap is real and
  unregistered elsewhere; the Orbital Advance requirement above
  deliberately does not specify a period law, only the integer-advance
  mechanics once a period is given.
- **The polar distance metric.** No distance function exists in `polar.ts`
  (only `isAdjacent` and `cellAspect`). The incumbent `board.Distance` has
  live callers implementing "within `AmbientRadius` (3) hexes." On a banded
  polar lattice, "within 3" is ambiguous: 3 rings radially and 3 slots
  tangentially are physically different distances, and different again per
  ring. Candidates named by the handoff's framing but not chosen: radial
  units (physical, aspect-independent), cell-hops (lattice-native but
  ring-dependent), or an ellipse in `(Δring, Δangle)`. Each gives a visibly
  different fog bubble. This change adds no distance function.
- **The movement-tuning retune target.** Arcs cost 27.5 radial units
  against cube's 19.0 on the measured inbound-transfer case, so every
  movement constant (`MsPerTile`, burn durations, and, once
  `docs/plans/propellant-and-delta-v.md` lands, delta-v budgets) is in
  play. No retune target is named anywhere in the source material.
- **Schedule reconfiguration against persisted cells.** Nothing in this
  change (which has no stored data or consumers) or the handoff addresses
  what happens if a live schedule is reconfigured after cells already exist
  under the old one — a ring's slot count changing out from under a
  persisted `(ring, slot)` is exactly the "stepping inward and back out
  does not return you to where you started" failure banding was adopted to
  prevent (Decision: Banded schedule, above), except triggered by
  reconfiguration rather than by a naive `6N` schedule. Whether schedules
  are treated as append-only, versioned per-galaxy, or otherwise is
  undecided and out of scope here; a consumer-migration change touching
  stored galaxies needs an answer before it can reconfigure a schedule
  safely.
- **`sqrt` is barred outright from this package, stricter than its own
  dependency.** `cross-stack-determinism`'s "Square Roots In Rules Are
  Pinned, Not Assumed" requirement (Decision 4, SETTLED per the handoff)
  treats `sqrt` as an admitted exception to the transcendental ban,
  provided it is pinned with a fixture. This capability's Rule-Bearing
  Values requirement bars `sqrt` outright from anything but projection —
  defensible for this change's current surface, since nothing specified
  here needs a runtime root, but it means a polar intercept solve or a
  Hohmann delta-v computation (`docs/plans/propellant-and-delta-v.md`) can
  never live in this package without a spec change loosening this
  requirement to `cross-stack-determinism`'s pin-and-fixture standard
  first.

## Forward dependency (not in scope)

`docs/plans/propellant-and-delta-v.md` records that Travis decided
(2026-08-24, SETTLED) delta-v/propellant is a resource — but only at the
altitude "movement consumes a carried resource." Every mechanism inside
that doc (which resource, cargo-hold-vs-tank, the Hohmann `Δv` formula,
stranding remedy, starting numbers) is RECOMMENDED, not decided, and none
of it is specified here. The doc itself notes the two decisions couple:
delta-v is worth substantially less without polar, and polar is worth more
with delta-v. This change makes no attempt to anticipate that arc beyond
noting the coupling exists.

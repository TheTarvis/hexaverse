## Context

`add-space-kinematics/design.md` closed with a risk it declined to solve:

> **Float disclosure predicates are a genuine regression, and this change
> does not incur it — the sighting change does.** [...] Quantization does not
> fix a boolean, there is no tolerance to hide in, and a flipped boolean is a
> player seeing or not seeing an enemy fleet. Decision 1 (Go sole authority)
> is a necessary condition for that later change and costs it nothing [...]
> It is **not sufficient**: cross-target agreement on those predicates will
> need its own answer (carrying comparisons squared to avoid `sqrt`, and a
> documented tie rule at exact equality are the obvious candidates). Flagged
> forward, deliberately unresolved here.

Two things changed since that was written.

**The model got smaller.** Travis's 2026-08-27 call: proximity plus going
loud with burn, with no fog model behind it. The tier ladder, the per-feature
memory, and the mint-once-and-keep semantics that made `observation` a
*store* are all gone. What replaces it is a predicate.

**The arithmetic got better, and the shipped code proves it.** The risk note
was written before `backend/space` existed. As shipped, that package is
bit-reproducible across build targets by construction, not by hope:

- `vec.go` wraps every product in an explicit `float64(...)` conversion,
  which the Go specification guarantees forces intermediate rounding and so
  defeats arm64's multiply-add fusion (Decision 5).
- Angles resolve through the pinned turn table; there is no runtime
  transcendental to diverge (Decision 3).
- `Vec3.Length` uses a single `math.Sqrt`, which IEEE-754 requires to be
  correctly rounded and which is therefore identical across Go build
  targets — the `determinism:allow(pinned)` pragma at that call site records
  exactly this.
- `GOARCH=amd64 GOAMD64=v1 go test ./space/` passes alongside the native
  arm64 run.

So for a given set of inputs, positions are bit-identical on Travis's laptop
and on Cloud Run. That materially changes what the disclosure predicate needs.

## Goals / Non-Goals

**Goals.** Settle the determinism half of the sighting question: what a
proximity predicate is allowed to compute, in what order, from which
positions, and what happens exactly at the boundary. Record the loud channel
as exact-by-construction. Preserve the server-side disclosure discipline
`observation` already had.

**Non-Goals.** The sighting *model*. This change does not decide sensor
range values, whether a contact carries identity or is anonymous, plume
scaling, focused-scan pricing, occlusion, lane gates, whether a fleet is one
position or per-hull, or what fuel is. Those stay open, and the capability
authored here is deliberately consumer-free so that none of them are forced.

## Decisions

### Decision 1: Do not round — the code is already bit-reproducible, and rounding is strictly worse

The instinct behind "round to the nearest safe bit" is right about the
*shape* of the problem and wrong about the *placement* of the fix.

Rounding the result of a float computation does not remove a knife edge; it
relocates the knife edge onto the rounding boundary. If `d` is computed in
float and then rounded to some unit before comparison, two evaluations of
`d` that differ by one ULP agree after rounding **unless** `d` falls within
one ULP of a half-unit boundary — in which case they still disagree. That
trades a guarantee for a very high probability.

And a guarantee is what is already on hand. Because the shipped arithmetic is
bit-reproducible (see Context), two evaluations of the same predicate from
the same inputs agree with probability 1. Introducing rounding would strictly
degrade that.

The one variant that *is* exact — rounding the **inputs**, quantizing
positions onto an integer lattice so that squared distance becomes exact
integer arithmetic — is exact for the reason integers compare exactly. It is
rejected because it is a lattice. A finer one than the hex grid, but the same
object the pivot exists to leave, reintroduced at the layer that most
directly determines what a player sees.

**Alternatives considered.** (a) *Epsilon band* — disclose if
`distSq <= rangeSq + eps`: replaces one boundary with two and makes the
disclosed set depend on a magic constant nobody can derive from gameplay.
(b) *Server-side hysteresis* — visible at R, invisible at R+delta: requires
remembering the previous answer, which contradicts the no-persist rule that
is doing most of the safety work here; it is also the exact "sighting is a
store" shape the model just shed. Hysteresis survives only at the client, as
presentation (Decision 5).

### Decision 2: Comparisons are squared and inclusive, with the tie rule written down

Every proximity predicate compares `distSq <= rangeSq`. Two properties:

**Squared.** Dropping `sqrt` costs nothing, since only the ordering is ever
consumed, and it keeps the comparison inside the guarded-product set that
`vec.go` already enforces. This is one of the two candidates the kinematics
design named; it is adopted as written.

**Inclusive.** The other named candidate — "a documented tie rule at exact
equality" — is settled as: exact equality **discloses**. The disclosed set is
closed at its boundary. The reason to pin it in spec rather than let it fall
out of whichever operator someone types is that `<` and `<=` are a one-
character difference with no test that naturally distinguishes them unless a
scenario demands it, so the spec demands it. The choice itself is close to
arbitrary — closed is marginally the more natural reading of "within range"
and matches the inclusive semantics `board.Within` used on the lattice.

`Vec3.DistSq` is added to `backend/space` so that no caller hand-rolls the
subtraction-and-dot, which is where an unguarded multiply-add would sneak in.

### Decision 3: The real hazard is path dependence, not precision

This is the part the original risk note did not name, and it is the one
worth spending discipline on.

Bit-reproducibility across *build targets* is proven. Bit-reproducibility
across *call paths* is not, and nothing in `add-space-kinematics` tests it.
If "where is fleet F at time T" can be reached by two routes — folding from
one anchor versus another, or evaluating directly versus through an
intermediate — and those routes differ in the last ULP, then a predicate at
the boundary flips even though every individual operation was deterministic.

The mitigation is the rule `board` already ran on and which the root
`CLAUDE.md` records as load-bearing: *everything that answers "where is this
fleet" reads through `StateAt`/`ShipPos`*. It carries over verbatim, and this
change makes it a requirement of the disclosure capability rather than a
convention, because a convention is what it was on the lattice — where it
did not matter, since the comparison was over integer cell sets and could not
flip. In continuous space it matters, so it gets a scenario.

### Decision 4: The loud channel splits — emission is exact, reach is geometric

An earlier draft of this decision claimed the loud channel never touches
geometry at all, on the assumption that going loud means everyone in the
locale sees you. The README's signature ladder says otherwise: *"Plume range
scales with drive output (engine class × commanded accel; hull mass later) —
engines are what you buy to move your loudness curve."* A plume has a
radius, so reach is geometric.

The salvage is to split the question in two, because only half of it is
geometric:

- **Is there a plume at time T?** `departTime <= T < arriveTime`, both int64
  `WorldMillis`. Exact, no float, no boundary. Half-open at the end so
  arrival is the instant the plume stops, consistent with `space`'s burn
  interval convention (a burn past its `arriveTime` is its settled park).
- **Does that plume reach this observer?** A squared comparison against
  `(passiveRange + plumeRadius)²` — geometric, and therefore governed by
  Decisions 2 and 3 like any other predicate here.

Losing exactness on the second half costs less than it looks like, and
Decision 5 is why: exactness was only ever load-bearing because of
permanence. Live disclosure persists nothing, so a target at the exact edge
of a plume flickers for a tick and discloses nothing it was not already
disclosing.

**Keep commanded acceleration in the curve.** Dropping it in favour of
engine class alone is tempting on determinism grounds — a stored hull
attribute looks more stable than a derived value — but the README notes that
commanded accel *is already a stored field on the burn*, so both inputs are
plain lookups and the determinism argument is weak. The gameplay cost of
dropping it is not: silent running, which the README calls a mechanic that
"falls out for free" and prices stealth in flight time, exists only because
a gently commanded burn is quieter. `plumeRadius = k × engineClass ×
commandedAccel`, floored.

The floor is what answers the README's own open question — *"a floor so
ignition is always an event?"* — in the affirmative. Set above the passive
range so that lighting a drive is always detectable by anyone who could
already see you dark, plus margin.

### Decision 5: Live disclosure persists nothing — and the one thing that does persist is a historical claim

Every other decision here is a refinement; this one is why the risk is
acceptable at all.

`observation`'s hazard was permanence: a knife-edge flip minted monotonic
state that no later correct evaluation could retract. Recompute-per-read has
no such failure mode. A target sitting exactly at a range boundary may
flicker for a tick; it discloses nothing it was not already disclosing, since
it is at the boundary either way.

**The sighting pile is the deliberate exception, and it survives the same
argument for a different reason.** The README is explicit that a scan mints
records — *"your knowledge of the world = your live bubbles + your pile of
sightings"* — and that those records are the sellable intel product. So
something *is* persisted off a float predicate, and a flip at the echo rim
is permanent.

That is tolerable because a sighting is not a claim about the present. It is
stamped `asOf` and stale by construction; the README builds the whole intel
economy on that staleness. A knife-edge flip means a corporation did not get
a record of something at the exact rim of its ping — indistinguishable, to
the player, from having pinged a moment later. Compare the failure it
replaces: fog that is permanently and *currently* wrong about what you can
see. Different severity entirely.

The rule to defend in review of the sighting model is therefore narrower
than "persist nothing," and worth stating precisely: **no stored record may
be consulted to decide live disclosure.** The pile is readable, sellable,
and inert. The moment a sighting starts feeding the live path — as a cache,
a hint, or a "you already know about this one" shortcut — the knife edge
gets its teeth back. Client smoothing is permitted precisely because it is
the pressure valve for flicker that does *not* require the server to
remember anything.

### Decision 6: Placeholder knob values, picked against the PoC's actual scale

The README's three open knobs are defaulted here rather than left blocking.
All are named placeholder constants in the disclosure capability's
`params.go`, never bare literals — the same discipline
`space/params_const.go` and `corporations/siteselection.go` already follow,
and for the same reason: a feel-tuning pass gets one place to edit.

Scale is read from the PoC's own generator (`spike/space-3d/sim.ts`), so the
numbers mean something: star size 6, planets 1.6–4.2, innermost orbit
20–26, each subsequent orbit ×1.38–1.60, 5–7 planets — an outer orbit
typically around 150–250 units.

| Knob | Default | Why this value |
|---|---|---|
| `PassiveRange` | 12 | Below the innermost orbit (20), so a fleet cannot passively watch the inner system from a neighbouring orbit. Scouting has to close distance. |
| `PlumeFloor` | 20 | Above `PassiveRange` with margin, so ignition is always an event — the README's own open question answered yes. |
| `PlumePerDriveOutput` (k) | 8.0 | Calibrated so a mid-class hull at nominal accel is loud across a good fraction of a system without being system-wide. |
| `MinCommandedAccel` | 1.0 | Floors silent running so a burn cannot be commanded arbitrarily quiet. |
| `FocusedScanRange` | 48 | 4× passive. Masking is beatable, but sweeping every body in a system is not free. |
| Identity gating | anonymous | A contact reports position, velocity, and whether it is burning — not whose it is. |

Worked against the nominal accel of 8 that `space/params_const.go` already
cites, with engine classes 1/2/3 and a default hull at class 2:

- class 1 at accel 8 → radius 64
- class 2 at accel 8 → radius 128
- class 3 at accel 8 → radius 192, effectively system-spanning
- class 2 at `MinCommandedAccel` → 16, clamped up to the floor of 20

That last line is the silent-running trade, and it prices out sensibly.
Dropping from accel 8 to 1 cuts the signature from 128 to 20 — about 6×
quieter — while flight time grows as the brachistochrone's `sqrt(L/a)`, so
roughly 2.8× longer. Meaningfully stealthy, meaningfully slow, neither free.

**The information ladder these produce** (settled 2026-08-27, with the
fleet-as-position decision): a live contact reports position, velocity, and
whether it is emitting. A scan adds hull count and hull types, stamped
`asOf`. Owner identity is on neither rung. That leaves attribution
*inferential* — you learn that five hulls of a given class are parked at VI,
and who flies that composition is a read you make, or buy — which is a
better intel economy than a name handed over for free, and matches the
README's own "a contact, ~5 hulls" framing.

One channel leaks size without being a field, deliberately: plume radius
aggregates across hulls, so a big fleet lighting its drive is visible from
farther than a small one. That is an emergent inference rather than a
disclosed value, it needs no requirement to permit it, and it is precisely
what makes silent running worth paying flight time for.

**Identity gating is the one default here that is not merely a number**, and
it is picked restrictive deliberately. Anonymous→identified is an additive
change to a response shape; identified→anonymous is a disclosure regression
that requires auditing everything which could leak identity anyway — id
stability across reads, entity ordering, count aggregates. The README's own
framing supports starting here: it notes anonymity "gives scouts a reason to
close distance and makes anonymous parked armies spooky." Identification
becomes a verb later if it earns one.

## Risks / Trade-offs

- **A capability with zero consumers can drift.** Same risk `space` and
  `polar` carried, same mitigation: it is small, it is spec-first, and the
  sighting model that consumes it is the next change to touch it.
- **The inclusive tie rule is arbitrary and now load-bearing.** If the
  sighting model wants exclusive semantics for some reason not yet visible,
  this is a one-line change plus two scenarios — cheap now, and cheap later,
  since nothing persists the answer.
- **Path dependence is asserted, not yet proven.** Decision 3's requirement
  is testable but the test is easy to write weakly (comparing two routes that
  happen to share an implementation). The scenario asks for bit-identity
  across *independently constructed* routes; a reviewer should check that the
  test actually constructs them independently.
- **"No sqrt on a disclosure path" needs the check to know what a disclosure
  path is.** The determinism check currently scopes by package. Until a
  consumer exists there is no path to scan, so this requirement is
  enforceable only in principle today — it becomes real in step 2, and that
  is when the check's scoping needs revisiting. Named here so it is not
  discovered then.
- **Absent-not-masked is stricter than what `observation` shipped.** Fleet
  audience fog returned 404 for a foreign fleet outside coverage, which
  satisfies it; whether every aggregate in every response already satisfies
  it is unaudited. The sighting model inherits that audit.

## Migration Plan

**There is no migration.** New capability, zero consumers, no stored data, no
endpoint, nothing deleted. `backend/observation` and
`observation-fog-and-scan` are untouched and keep serving the lattice game.

This change slots *before* step 2 of `add-space-kinematics`'s migration plan
and removes one of that step's two blockers. Step 2 remains blocked on the
README's open model knobs, which are Travis's to decide.

## Open Questions

### The model questions this change still does not touch

Occlusion in continuous space, lane gates, whether a fleet is one position
or per-hull, whether asteroid lodes are bodies, cancel semantics, the
contested-place question, and what fuel is. All carried forward from the
README unanswered, and none of them are knobs — they are model decisions
whose defaults cannot be guessed responsibly. This change is designed so
that none are foreclosed.

The README's three named knobs (identity gating, plume scaling,
focused-scan pricing) are no longer among them: Decision 6 defaults all
three as placeholder constants.

### Whether a focused scan should sweep a chain transitively

The masking requirements resolve a chain to its outermost host and let a
focused scan against that host mint records for everything beneath it. The
alternative — sweeping a body reveals the carrier, and revealing what is
inside the carrier needs a second scan against it — makes carriers a real
stealth investment and gives the counter-intel game more depth, at the cost
of more verbs and more player bookkeeping. Transitive is chosen as the
simpler starting point; the requirement is worded so that narrowing it later
touches one scenario.

### Whether proximity range is a scalar at all

Everything here assumes range is a single radius per observer, which is what
`distSq <= rangeSq` encodes. If sensor range ends up directional, or
per-hull, or degraded by the observer's own emissions, the predicate shape
changes — though the five invariants (recompute, squared, inclusive,
canonical path, no persist) survive that change unaltered, which is part of
why they are specced separately from the model.

### Whether the sighting model wants this capability merged into it

`proximity-disclosure` is authored as its own capability because it is the
mechanism, not the policy, and because it is settled while the policy is not.
If the sighting model turns out to have no other content worth separating,
merging the two on archive is reasonable — a judgment for whoever writes it.

# Design — `migrate-fleet-to-continuous-burns` (chain link 4)

## Context

This is link 4 of the continuous-space chain
(`docs/plans/continous_space/chain.md`). Links 1–3 built three packages with
**zero consumers**: `backend/space` (kinematics), `backend/disclosure`
(visibility mechanism), and `system.BodyTable` (the `space.Bodies`
implementation, plus derived lane gates). This link is where they get their
first consumer, and it is the heaviest link in the chain — not because the
math is hard, but because `fleet` is load-bearing for eight other capabilities
and the lattice cannot be half-removed from it.

**What is true today.** `fleet.Fleet.State` is a `board.MovementState` with
five shapes (`coast`, `burn`, `docked`, `laneTransit`, `laneHold`). Every
position in the game is a `board.Cell{Ring, Slot}`. `observation` computes fog
as unions of integer cell sets. `mine` and `market` both test co-location as
`eff.Mode == board.ModeDocked && eff.Docked.ParentId == featureID`.
`corporations` seeds a hull at `board.Cell{Ring: RimRing, Slot: …}`. The
frontend has 58 files touching `@/lib/board`, `@/lib/polar`, or
`MovementState`. `backend/space` and `backend/disclosure` are, as of this
writing, dead code that compiles and passes fixtures.

**What this link does.** It replaces `fleet`'s stored motion state with a
`space.ShipState`, replaces the burn solve with `space.SolveBurn` against a
`system.BodyTable`, replaces the multi-hop lane trip with a single-hop `jump`
from a docked gate, adds the two cancel verbs the pivot settled on (cut drive,
stop in place), deletes `observation`'s live half outright, and strips the
board view's fleet layer rather than porting it.

**Three constraints are load-bearing and were verified, not assumed.**

1. **The archiver's MODIFIED rule is a superset rule.** Rehearsed on a scratch
   copy of `openspec/`: a MODIFIED block that drops one of a requirement's
   existing scenarios passes `openspec validate --strict` and then **aborts at
   archive** with
   `current spec contains scenario(s) not present in the modified block: "…"`.
   Since link 4 rewrites requirements whose scenario sets do not survive, the
   delta strategy has to be REMOVE + ADD (Decision 2).
2. **Nothing can be archived first, and nothing needs to be.** Every capability
   link 4 targets exists under `openspec/specs/`. `system-body-table` — which
   exists only inside the unarchived `add-orbital-system-bodies/` folder — is
   **not** targeted by any link-4 delta (Decision 3).
3. **`space` and `disclosure` were designed for exactly this migration and
   mostly fit.** The two places they do not fit — a free drift has no
   `ShipMode`, and a `Burn` cannot be truncated — are the subject of Decisions
   5 and 6, and both were found by reading shipped code rather than by
   reasoning about the design docs.

**One correction already landed upstream.** `decisions.md`'s *Cancel is two
verbs* entry originally described cut drive as "truncating the burn's
interval". That is not implementable against shipped code and the entry was
corrected on 2026-08-29; Decision 6 records the resolved form so nobody
re-derives it.

## Goals / Non-Goals

**Goals**

- Fleet position, velocity, and effective state are `backend/space` values.
  `board.MovementState` leaves the fleet document entirely; nothing about a
  fleet is expressed in ring/slot.
- Burns are solved by `space.SolveBurn` against a `system.BodyTable`, priced by
  `space.FlightSeconds`, and settled by `space.StateAt` through the existing
  `action` spine. The channel split, the single-slot claim, and the delta ledger
  carry over untouched — the fold contract is identical.
- The two cancel verbs land: **cut drive** (free, instant, goes dark, converts
  to a free drift) and **stop in place** (a commit that nulls velocity, costs
  Δv, is loud).
- Free drift is added to `space` as a third `ShipMode` with its own ADDED
  requirements and its own fixture coverage.
- Commanded acceleration becomes a player choice, so
  `proximity-disclosure`'s already-shipped *Reducing commanded acceleration
  shrinks the signature* stops being a vacuous requirement.
- Lane travel becomes a single-hop `jump` from a docked gate, per the settled
  gate design.
- Every stored `space` value crosses the persistence boundary through
  `space`'s named codec, extended to burns, parks, and drifts.
- `mine`, `market`, `stations`, `corporations`, `galaxy`, and `system` compile
  and their tests stay green, by the cheapest route that does not create a
  second answer to "where is this fleet".
- The three `fixtures/system` families and the two now-due `fixtures/space`
  families are recorded; the two not yet due are re-filed with a fresh named
  owner rather than silently carried.

**Non-Goals**

- **No disclosure wiring.** `disclosure.Disclose` is not called from any read.
  There is no sighting store, no focused-scan verb, no widened masking rule.
  That is link 5 in full (Decision 19).
- **No renderer.** The board view loses its fleet layer and gains nothing.
  Link 8 builds the space view (Decision 12).
- **No fuel, no Δv budget, no stranding, no station-keep upkeep charge.**
  `space.DeltaV` is computed and may be displayed; nothing is debited. Link 7.
- **No economy re-anchoring.** `mine`/`market` get a one-line re-point off a
  new fleet field, not a re-expression of what a place is. Link 6.
- **No lattice deletion.** `backend/board` and `backend/polar` still have
  consumers in `system`, `stations`, and `corporations` after this link, so
  they cannot be deleted here. Link 9.
- **No migration, no compatibility shim, no dual-write, no feature flag.** Prod
  is unused (`docs/plans/continous_space/README.md`, ground rules).
- **No multi-hop route planner.** Client-side, over charted lanes, in link 8
  (Decision 10).

## Decisions

### Decision 1: One change, with the fixtures as tasks section 1

Link 4 ships as a single change id, `migrate-fleet-to-continuous-burns`. The
fixture obligations inherited from link 3 and link 1 (Decision 17) are
**tasks section 1** — recorded before a line of consumer code moves.

*Alternative considered and rejected:* splitting a `record-deferred-space-and-
system-fixtures` prelude change. It buys the sequencing property — assert new
behaviour against already-pinned baselines — but that property is fully
obtainable by ordering tasks, and a second change id absent from `chain.md`
adds coordination cost to a session scoped to link 4 alone.

*Forecloses:* nothing. If the fixture work turns out to be large enough to want
its own review, it can still be lifted out; the task numbering is the seam.

### Decision 2: Deltas are REMOVE + ADD wherever a scenario set does not survive — MODIFIED is reserved for genuine supersets

**The rule.** A MODIFIED block is a *superset* operation. It cannot delete an
obsolete scenario. Use MODIFIED only when every existing scenario heading is
kept verbatim and the change is additive or a body rewrite under an unchanged
heading. Everywhere else, REMOVE the requirement (with `**Reason**` /
`**Migration**`) and ADD its successor **under a new name**.

**Rehearsed, not reasoned.** On a scratch copy of `openspec/`, a MODIFIED
delta against `fleet-roster` › *Empty When There Is Nothing to Manage* that
replaced its one scenario with a differently-named one:

```
$ openspec validate rehearse-modified --strict
Change 'rehearse-modified' is valid
$ openspec archive rehearse-modified --yes
fleet-roster MODIFIED failed for header "### Requirement: Empty When There Is
Nothing to Manage" - current spec contains scenario(s) not present in the
modified block: "No panel before the player has a fleet".
Aborted. No files were changed.
```

The equivalent REMOVE + ADD (`… or No Corporation`) validated, archived
cleanly, and reported `+ 1 added, - 1 removed`.

**Three mechanical facts from the rehearsal the spec writer needs:**

- A REMOVED block carries no scenarios, and the archiver prints
  `⚠ Requirement must have at least one scenario` for it. That is a **warning**,
  not a failure; the archive completes.
- An ADDED requirement is **appended at the end** of the target spec file, not
  inserted where its predecessor sat. Expect requirement order in
  `openspec/specs/fleet-movement/spec.md` to churn. Do not fight it.
- REMOVE + ADD needs no scenario headings copied from the current spec at all,
  which removes the whole class of "matched character-for-character except for
  a soft hyphen" failure the archiver is otherwise prone to
  (`MEMORY.md`: *OpenSpec archiver matches scenario titles*).

**A correction to the brief's sizing.** ~11 REMOVED / ~12 ADDED / 2 MODIFIED is
right for `fleet-movement` alone. Counting `observation-fog-and-scan` (5
REMOVED), `board-view` (Decision 12), `system-interior` (Decision 11),
`galaxy-view`, `fleet-roster`, `corporation-spawn`, and `space-kinematics`, the
whole change is roughly **30 REMOVED / 25 ADDED / 3 MODIFIED**. The three
genuine MODIFIEDs are:

1. `fleet-movement` › *Fleet Ship Composition* — the per-class stats table
   gains a commanded-acceleration ceiling; both existing scenarios survive
   verbatim.
2. `fleet-movement` › *Fleet Read Surfaces Roster, Cargo, and Derived
   Capacity* — both scenario headings survive; the second's body changes from
   "a foreign fleet is redacted" to "a foreign fleet is not returned".
3. `space-kinematics` › *Coordinates Cross the Persistence Boundary Through a
   Named Codec* — all three scenarios survive; the requirement text widens to
   burns, parks, and drifts (Decision 9).

*Alternative considered and rejected:* RENAMED + MODIFIED pairs. RENAMED
retargets the header but MODIFIED's superset rule then applies to the renamed
requirement's existing scenarios, so it solves nothing and adds an operation.

*Forecloses:* nothing, but it does mean the archived spec loses the "diff"
reading of a modified requirement. That is a real cost and it is accepted:
the git history of `openspec/specs/` carries it instead.

### Decision 3: Nothing is archived as part of this change, and `system-body-table` is link 5's problem

`openspec archive` aborts when a MODIFIED delta targets a capability with no
folder under `openspec/specs/`. `add-orbital-system-bodies` (link 3) is
unarchived, so `system-body-table` exists only inside that change folder.

Verified: every capability link 4 writes a delta against — `fleet-movement`,
`space-kinematics`, `observation-fog-and-scan`, `board-view`, `fleet-roster`,
`corporation-spawn`, `galaxy-view`, `system-interior` — has a folder under
`openspec/specs/`. Link 4 writes **no** delta against `system-body-table`, so
the abort cannot fire. Archiving link 3 first is not a prerequisite and should
not be treated as one.

**Recorded as a latent constraint for link 5.** Link 5 wires `disclosure` into
reads through `BodyTable` and will very plausibly want to modify
`system-body-table` (the unfiltered-internal-seam requirement is precisely the
one that changes when a fog projection is layered on it). If so, link 3 must be
archived before link 5 can archive. Rehearse it on a copy first —
`openspec validate --strict` will not catch this class of failure.

### Decision 4: A fleet's stored state is `space.ShipState`, plus lane transit and attachment as fleet-owned fields

`fleet.Fleet.State board.MovementState` is deleted and replaced by:

```go
type Fleet struct {
    // ...
    State      space.ShipState  // burn | parked | drift — the kinematic mode
    AttachedTo string           // dock/host id, empty when free-flying (Decision 13)
    Jump       *JumpTransit     // non-nil while crossing a lane
    // ...
}
```

Three shapes, not five, and the split is deliberate:

- **`space.ShipState`** owns everything kinematic. Position is
  `space.StatePosition(bodies, f.State, now)` and nothing else in the codebase
  may answer that question — the canonical-path rule `proximity-disclosure`
  already imposes on disclosure predicates is adopted here as a fleet-wide rule
  now, because link 5 will otherwise inherit two answers.
- **`AttachedTo`** is not a kinematic mode. A docked fleet still has a
  `ShipState` — it is parked at (or station-keeping on) its host — and being
  attached is a *relationship*, which is exactly what `disclosure.Attachments`
  models. Folding docking into `ShipMode` would put the masking relation
  inside the kinematics package, which `space` deliberately has no knowledge of.
- **`Jump`** is fleet's, not `space`'s. A fleet in lane transit has no position
  in either system (`proximity-disclosure` › *A Fleet In Lane Transit Is
  Disclosed By No Channel*, and `disclosure.Ship.InLaneTransit` already exists
  for it). `space` has no representation for "nowhere", and inventing one would
  put a galaxy-tier concept in a system-tier package.

`board.ModeCoast` has **no successor**. A coasting fleet was a free prograde
orbit at its current ring; the continuous equivalent is a `ParkOrbit`, which is
what `space.StateAt` already settles a body-targeted burn into. `laneHold` has
no successor either — the lane is now atomic (Decision 10).

*Alternative considered and rejected:* keeping `board.MovementState` as the
stored shape and translating to `space.ShipState` at the seam. That is the
dual-write shim the ground rules forbid, and it would put two answers to "where
is this fleet" in one document — the exact thing
`proximity-disclosure`'s canonical-path requirement exists to prevent.

*Forecloses:* any consumer reading a fleet's ring. That is the point.

### Decision 5: Free drift is a third `ShipMode`, not a fourth `ParkKind` — and the switch it breaks is a named task, not a review item

```go
const (
    ModeBurn ShipMode = iota
    ModeParked
    ModeDrift          // added by this change
)

// Drift is a free, unpowered straight line: anchor + v*(t - epoch).
// Closed-form, no new math (decisions.md, "Cancel is two verbs").
type Drift struct {
    Anchor   space.Vec3
    Velocity space.Vec3
    EpochMs  common.WorldMillis
}
```

**Why a mode and not a park kind.** A drift has velocity and is not idle.
`space-kinematics` › *Idle Ships Park in Exactly One of Three Modes* is a
requirement about **resting** states; adding a moving state to `ParkKind` would
falsify a shipped requirement's own text and force it into the delta for no
reason. As a `ShipMode`, that requirement survives untouched — which is also
the cheapest delta.

**The forced edit is the feature.** Two shipped `switch` statements on
`ShipMode` have a `default` arm returning `space.ErrUnknownParkKind`:

- `backend/space/state.go:73` — `StatePosition`
- `backend/disclosure/contact.go:114` — `contactVelocity`

Adding `ModeDrift` **compiles cleanly and fails at runtime**: every drifting
fleet's position read, and every disclosure decision about a drifting fleet,
returns `ErrUnknownParkKind`. A fourth `ParkKind` would have taken the
`ParkKind` switches' `default` arm identically — but a reviewer skimming
`disclosure` would have had no reason to look at a park-kind change at all,
whereas a new *mode* on the disclosure path demands a decision about what a
drifting contact discloses. Both call sites are named tasks with their own
tests.

Three further `ShipMode` reads were audited and are already correct for drift:
`space/state.go:35` (`s.Mode == ModeParked || s.Burn == nil` — a drift folds to
itself), `space/state.go:39` (arrival comparison, burn-only), and
`disclosure/predicate.go:42` (`s.Mode != space.ModeBurn` ⇒ a drifting fleet is
**not emitting**, which is the whole point of cut drive).

*Alternative considered and rejected:* a fourth `ParkKind`. Cheaper by one enum,
wrong by construction, and it hides the disclosure decision.

*Forecloses:* nothing. A future "capture-if-slow" (deferred in `decisions.md`)
converts a drift to a `ParkOrbit`; that is a mode transition, which this shape
supports directly.

### Decision 6: Cut drive REPLACES the stored burn with a drift; it does not truncate it

**The resolved form**, already corrected in `decisions.md` (2026-08-29) and
recorded here so it is not re-derived:

```go
// at cut time cutMs, with departMs <= cutMs < arriveMs
drift := space.Drift{
    Anchor:   burn.Position(cutMs),
    Velocity: burn.Tangent(cutMs).Scale(burn.Speed(cutMs)),
    EpochMs:  cutMs,
}
```

**Why truncation is wrong against shipped code.** `space.Burn.Position(t)`
returns `b.Intercept` for any `t >= b.ArriveMs` (`backend/space/burn.go:101`).
Rewriting `ArriveMs` to `cutMs` therefore teleports the fleet to its **original
destination**, and `space.StateAt` — whose arrival predicate is
`t < b.ArriveMs` — then settles it into the target's insertion park. Cut drive
would be a free arrival. The clamp is not incidental; it is
`space-kinematics` › *A time after arrive clamps to the intercept at zero
speed*, a requirement with its own scenario.

The velocity expression is not new either: it is exactly what
`disclosure.contactVelocity` already computes for a mid-burn contact
(`contact.go:116`). One expression, two call sites — the same argument
`add-space-kinematics`'s Decision 10 made for arrival continuity.

**Cut drive is free, instant, and dark.** No Δv, no ETA, no action. It resolves
the running burn action as `cancelled` (releasing the movement slot through the
spine's existing cancel path with the drift riding in `ActorState`), and
because `disclosure.Emitting` reads `s.Mode != ModeBurn`, emission stops in the
same instant the state flips. That is the settled stealth verb, and it needs no
new mechanism to be true.

### Decision 7: A cut at exactly `departMs` yields a zero-velocity drift — uniform, no branch

`Burn.Speed(t)` returns `0` for `t <= b.DepartMs`, so the general expression
produces `Drift{Anchor: origin, Velocity: {0,0,0}, EpochMs: departMs}` with no
special case. Observationally that is a point park sitting at the burn's
origin; representationally it is a drift.

This gets a scenario because it is the boundary a reader will ask about, and
because the alternative — branching to a `ParkPoint` at zero speed — introduces
a discontinuity in the verb's own behaviour for no gain and an extra code path
to keep in step. `Drift.Position(t) = Anchor + Velocity.Scale(seconds)` returns
`Anchor` for every `t`, so the two are numerically identical anyway.

`Drift.Velocity()` is `d.Velocity` unconditionally, including the zero vector,
so `contactVelocity` reports a stationary contact rather than failing to
normalize.

### Decision 8: Stop in place converts to a `point` park below a named speed threshold, and otherwise commits a nulling burn

**The hole this closes.** *Stop in place* is specified as "a new burn that nulls
velocity and parks at the current position". A burn's arc length is at least its
chord, and `space.SolveBurn` rejects any solve whose curve length falls below
`space.MinArcLength` with `ErrArcTooShort` (`burn.go:477`). A fleet drifting
slowly enough that its stopping arc is shorter than `MinArcLength` is therefore
**permanently unstoppable** — it can only be re-targeted somewhere far away.

**The rule.** `space` gains a named threshold:

```go
// StopInPlaceSpeedFloor is the speed at or below which stop-in-place is
// a discrete conversion to a point park rather than a solved burn.
const StopInPlaceSpeedFloor float64 = ...   // space/params_const.go
```

At or below it, stop-in-place is instant and free: the state becomes
`Park{Kind: ParkPoint, Point: <current position>}`. Above it, it commits an
ordinary burn to an explicit point target ahead of the fleet — costing Δv,
taking time, and emitting the whole way.

**Why this is permitted.** `cross-stack-determinism`'s discretized-choice branch
sanctions a rule-bearing decision made by an exact comparison with a documented
tie-break; the comparison here is `speed <= StopInPlaceSpeedFloor` on a value
derived through `Burn.Speed`/`Drift` alone. It also mirrors the shape of the
deferred capture-if-slow rule (`decisions.md`), so the two will be consistent
when capture arrives.

*Alternatives considered:*

- *(b, adopted)* the threshold above.
- *(c, rejected)* make stop-in-place always instant and free. It contradicts the
  settled ruling that stopping "costs delta-v and is itself loud", which is the
  entire reason cut drive is the stealth verb and stopping is not. Rejecting (c)
  keeps *cut-drive is the stealth verb* true.
- *(a, rejected)* lower `MinArcLength`. It is a global floor protecting every
  burn from a degenerate zero-duration solve; bending it to fix one verb would
  weaken the guard everywhere.

*Forecloses:* nothing. The threshold value is a feel dial named in
`space/params_const.go` alongside the others, not spec-pinned.

### Decision 9: The burn order carries an optional commanded acceleration, bounded above by the roster and below by the configured minimum

`OrderRequest` gains `Accel *float64`. Omitted, it defaults to the fleet's
roster-derived ceiling. Supplied, it is validated:

- `accel > ceiling` → rejected with its own named reason. The ceiling is
  `min` over the roster's per-class `Accel` — the same slowest-hull-gates-the-
  fleet rule `Derived Fleet Speed` already applies, and `ClassStats` is where it
  goes (replacing `BurnRate`, which measured board hexes per world-ms and has no
  continuous meaning).
- `accel < disclosure.MinCommandedAccel` → rejected with its own named reason.

**Why now, and why this specifically.** `proximity-disclosure` › *Plume Radius
Derives From Drive Output and Is Floored* shipped with a scenario —
*Reducing commanded acceleration shrinks the signature* — that **nothing can
induce**: today `accel` is a solver argument with a single configured value, so
the scenario is only satisfiable as a unit test on `PlumeRadius`. One optional
field and two validation scenarios convert a shipped requirement from vacuous
to real, and they cost nothing else: `space.Burn.Accel` is already a stored
field and `space.DeltaV` already prices the trade
(`deltaV = 2*sqrt(accel * curveLength)`, so halving accel buys ~1.41× flight
time for ~0.71× the Δv).

**The floor lives in `disclosure`, and `fleet` imports it.** `MinCommandedAccel`
(`disclosure/params.go:53`) is the only knob in that package with no production
reference; `disclosure/params_test.go:112` records that as a stated pending
expectation. `fleet` referencing it is a one-constant import in the direction
`fleet → disclosure → space`, with no cycle, and it puts the floor exactly where
its justification is written down.

*A finding the implementer must not be surprised by:* that pending-note test
parses only `backend/disclosure`'s own directory, so a reference from `fleet`
will **not** flip its `t.Log`. Retiring the note is a manual edit in this
change, not something the suite reports.

*Alternative considered and rejected:* duplicating the floor into
`space/params_const.go`. Two definitions of one number is the failure mode the
whole parameter-file discipline exists to prevent.

### Decision 10: Lane travel is a single-hop `jump` from a docked gate; multi-hop routing is deleted

**The verb.** `POST /v1/fleets/:fleetId/jump {laneId}` (or `{destSystemId}`),
valid only when the fleet is attached to the gate body for that lane. It
commits on the movement channel with an ETA of `now + crossing time`, and
resolves by flipping `SystemId`, clearing `Jump`, and settling the fleet
**parked near** the destination gate — a `ParkOrbit` at the gate's insertion
standoff, **not** attached to it, so the arrival is unmasked.

**This is not a new choice; it follows from a settled one.** `decisions.md`
(*Lane gates are bodies*) rules that "the lane is safe; the gate is where you
are vulnerable… interception happens at gates or not at all", and that a fleet
"arrives *parked near* the gate, not docked to it… To go anywhere it must burn,
which is loud." A multi-hop route with pass-through intermediates contradicts
both sentences directly: a five-hop trip would never surface at an intermediate
gate, would be uninterceptable end to end, and would gut the argument that made
gates bodies at all. `decisions.md` also settled that a gate imposes **no
dwell**, which is what makes single-hop tolerable: a chain of jumps costs
attention, not waiting.

**Deleted:** `Service.PreviewRoute`, `planRoute`, `reconstruct`, `routePlan`,
`buildTrip`, `ErrNoRoute`, `ErrSameSystem`, `RoutePreview`, `TierSource`'s
`SystemTiers` use for routing (the charted-lane set survives — see Decision 11),
`GET /v1/fleets/:fleetId/route`, and `board.LaneTransit`/`board.LaneHold` as
fleet's stored shapes.

**A correction to the brief.** `legMs` and `laneLength` are **not** simply
deleted with routing. `galaxy.Lane` stores topology only — "travel cost is a
derived value… never stored" (`galaxy/model.go:78`) — so a single-hop jump still
needs a length. They are **replaced**, and the replacement is what discharges
their register entry:

```go
// jump duration: the lane's 3D length through space's own guarded, pinned
// arithmetic, quantized by ceiling like every other stored duration.
d := space.Vec3{X: a.X - b.X, Y: a.Y - b.Y, Z: a.Z - b.Z}.Length()
eta := space.QuantizeArrival(now, d * msPerLaneUnit / 1000)
```

`Vec3.Length` is `math.Sqrt` over `float64(...)`-guarded products, carries the
`determinism:allow(pinned)` pragma, and is covered by the `arcTable` fixture
family. `QuantizeArrival` uses `math.Ceil`, which is in the exact-arithmetic
set. That kills all three violations the defect names at once — the FMA
contraction, the unpinned `sqrt`, and the bare `math.Round` — which is precisely
the `board.Line` precedent: *where the float was removable it was removed; where
it was not, it moved onto an already-pinned path*.

*Alternative considered and rejected:* a flat, length-independent jump duration.
Simpler, and defensible under "the jump is a hand-waved wormhole", but it makes
the galaxy's geometry decorative at the graph tier — the same objection
`decisions.md` raises against jump-from-anywhere.

*Forecloses:* a server-side route preview. A **client-side** planner over the
corp's charted lanes (which the client already reads) is the successor, and it
is **link 8** work, recorded here so it is not lost. Until then, multi-system
travel is N explicit jumps.

### Decision 11: Link 4 deletes `observation`'s live half, and the cascade reaches `system-interior` too

**REMOVED from `observation-fog-and-scan`** (five requirements):
*Ambient Sensor Coverage From Own Units*, *Running Scan Echo Disc*, *Scan
Resolution Mints the Reveal*, *Path-Swept Ambient Reveal on Move Resolution*,
*Fleet Audience Visibility*.

**KEPT** (four): *Monotonic Graph-Tier Knowledge Ladder*, *Travel Arrival
Reveal*, *Spawn Arrival Reveal*, *Charted-Lane Set Projection*. These carry no
lattice geometry, and the charted-lane set is still read by jump validation and
by the galaxy view. The `observation` package survives, reduced, until link 5
deletes it.

**Why the live half cannot survive.** Coverage is computed from
`observation.FleetPos.Cell` and materialized with `board.Within` /
`board.LineOfSight` in lattice hops. Once a fleet has no cell, coverage has no
centre. There is no version of these five requirements that is true after
Decision 4.

*Alternative considered and rejected (option c):* give each fleet a shadow
lattice cell projected from its continuous position, so coverage keeps working
for one link. That is the dual-write shim the ground rules forbid, and it would
put two answers to "where is this fleet" in one document — which is exactly what
`proximity-disclosure` › *Every Disclosure Predicate Reads Position Through the
Canonical Path* exists to prevent, and which link 5 would then have to unpick
under load.

**The consequence, stated plainly: foreign fleets are not disclosed at all
between links 4 and 5.** `fleet-movement` › *Fleet Read Endpoints and Audience
Fog* is REMOVED and replaced with a requirement that says so: own fleets are
returned in full, foreign fleets are omitted entirely from list reads and
`404` on a direct fetch. That is *more* restrictive than today, so it leaks
nothing; it is simply not a game.

**The cascade the brief did not enumerate — flagged for the orchestrator.**
Deleting the live half also breaks two requirements outside `observation`:

- `system-interior` › **Three-Band Fog Projection of Features**. Its live band
  reads `observation`'s coverage and its remembered band reads the per-feature
  memory the scan mint wrote. With both gone there are no bands left. Link 4
  must REMOVE it and ADD an explicit interim requirement — the interior read
  serves every feature live to any authenticated requester, stated as a
  deliberate, temporary, fully-disclosed read that link 5 replaces with a
  `disclosure` projection. Leaving it in place would be a spec that describes
  behaviour no code implements.
- `board-view` › **Fog Band Determines a Feature's Board Treatment** goes with
  it (and is inside Decision 12's scope anyway).

`system-interior` › *Charted Lane Gate Filtering* survives — it reads the
charted-lane set, which is kept.

**This shifts the link 4/5 boundary.** `chain.md`'s Link 5 entry says
"`observation-fog-and-scan` (REMOVED entirely)"; after link 4 it is REMOVED
*in part*, and link 5 removes the remainder. `chain.md` needs a line saying so.
The spec writer adds it; this design does not edit `chain.md`.

### Decision 12: The board view loses its fleet layer and its geometry-dependent verbs; the roster panel is the command surface

**Removed from `board-view`:** *Move Preview From the Acting Fleet's Live
Position*, *Move Commit*, *Scan Aim Preview Only While Considering the Verb*,
*Scan Commit and Single-Slot Gating*, *Cancel Command Available Only While
Burning*, *Lane Gate Selection Previews and Commits Departure*, *Foreign Fleets
Render as Contact Marks Only*, *Running Scan Renders From Its Pinned Emission
Cell*, *Fog Band Determines a Feature's Board Treatment*, and the fleet clauses
of *Board Picking Resolves to the Entity Under the Pointer* and *Realtime
Refetch Rules While the Board Is Open*.

**Kept:** the roster panel (`fleet-roster`, re-expressed), *Mine Offer on the
Docked Fleet*, *Mine ETA Preview*, *Mine Commit*, *Running Mine Gates the
Movement Channel*, *Fleet Panel Hold Readout*, the sell requirements, credits,
camera, accessibility, and the renderer-unavailability states. Targets are named
by **body id** from the interior read, not by picking a tile.

> **⚠ This makes the game visually unplayable for links 4 through 7.** The board
> still renders the lattice and its features, but no fleet appears on it, no
> move can be ordered from it, and no route can be previewed. Fleets are
> commanded from the roster panel by naming a destination body. This follows the
> ground rules — *optimize for build speed and how the game feels, not
> continuity*, and nobody is playing — but it is the single most user-visible
> consequence in the entire chain, and it is recorded this prominently so
> Travis can veto it on sight rather than discover it at link 4's demo.

*Alternative considered and rejected:* pull link 8's renderer forward into link
4. It preserves playability, and it is the only alternative that does. It is
rejected because it roughly doubles link 4 — already the heaviest link — makes
it unreviewable in one sitting, and front-loads the chain's only
visual-regression risk (which no test catches) into the change that is also
rewriting the movement model. `chain.md`'s own reasoning for putting the
renderer last stands.

*Scale, for sizing:* 58 frontend files reference `@/lib/board`, `@/lib/polar`,
or `MovementState`. Most survive as-is (they draw features, not fleets); the
fleet-layer subset — `move-preview`, `scan-preview`, `arc-scan`, `scan-ping`,
`SelectionPreview`, `ScanOverlay`, `ArcScan`, `ScanPing`, `fleet-status`,
`transit-geometry`, `use-fleets` — is what goes.

### Decision 13: Docking is a fleet-owned `AttachedTo` field with a `DockedTo()` accessor, and link 6 is named at the declaration

```go
// AttachedTo is the id of the host this fleet is docked to (a body, a
// station, a gate, later a carrier), empty when free-flying. It is a
// relationship, not a kinematic mode — space.ShipState stays the only
// answer to "where".
//
// LINK 6 (re-express-economy-positions) redefines what a valid host is and
// deletes whatever it must. Nothing about this field is permanent.
AttachedTo string `json:"attachedTo,omitempty" firestore:"attachedTo,omitempty"`

func (f Fleet) DockedTo() (string, bool) { return f.AttachedTo, f.AttachedTo != "" }
```

**Why.** `mine/service.go:153` and `market/service.go:498` both read
`eff.Mode == board.ModeDocked && eff.Docked != nil && eff.Docked.ParentId == featureID`.
With an accessor, each becomes a one-line re-point and both packages stay green
without link 4 knowing anything about lodes or venues. This is exactly link 3's
additive-then-delete precedent, and the comment naming link 6 is the standing
rule that nothing additive may quietly become permanent.

It also puts a `disclosure.Attachments` implementation one step away: `HostOf`
is this field, and `AttachedTo(hostId)` is a query over it — link 5's wiring,
not link 4's.

*Alternative considered and rejected:* a fourth `ParkKind` (`ParkDocked`). It
would make masking a kinematic property and drag `space` into knowing about
hosts, which the package's injected-`Bodies` design deliberately avoids.

### Decision 14: The star is excluded by geometry, not by a special case — `ErrCoreDestination` has no successor

`fleet.ErrCoreDestination` and its two scenarios (*The star cannot be a
destination*, *Seeding onto the core is rejected*) are removed with no
replacement rule. Ordering a burn to the star's own body id is already rejected
by `space.BuildCurve`'s endpoint-clearance guard
(`burn.go:282`: `intercept.Length() <= starClearance` → `ErrEndpointInsideClearance`).

**Checked against the real constants, not asserted.** The intercept for a body
target sits at `InsertionStandoff(body) = 2.5 + 1.5*size`; the guard radius is
`StarClearanceRadius(size) = 2.5*size`. The rejection holds whenever
`2.5 + 1.5s < 2.5s`, i.e. `s > 2.5`. `system.starSizeByClass` spans
**5.2 (M) to 7.6 (O)** with a default of 6.0, so every star this generator can
emit is rejected with margin: at s=5.2 the standoff is 10.3 against a clearance
of 13.0; at s=7.6 it is 13.9 against 19.0.

That invariant deserves the same treatment
`TestCalibration_Scenario_NoStarSizePlacesBodyInsideClearanceShell` already
gives the sibling bound — a calibration test reading
`space.StarClearanceRadius` and `space.InsertionStandoff` directly, so widening
the star-size table can never silently make the star targetable.

`SeedFleet`'s core rejection likewise disappears: spawn places a park at a
derived radius (Decision 16), and a radius inside the clearance shell is a
site-selection bug, not a runtime rejection.

### Decision 15: `action-dispatch` takes no delta

`chain.md`'s link-4 entry predicts a coordinate-codec delta against
`action-dispatch`. Structurally there is none, and the change should not add one
merely because the chain doc predicted it.

Verified against `backend/action/params_validator.go` and the shipped
requirement *Commit Rejects Non-Primitive Action Parameters*: the allowlist is
`nil, string, bool, int, int64, float64, []string, []int64, []float64, []any,
map[string]any`, recursed. `space.EncodeVec` emits `[]float64`,
`EncodeSubTurns` emits `int64`, and `EncodeOrbit` emits a `map[string]any` of
strings, `float64`s and `int64`s. All three already pass, and
`space-kinematics`'s codec requirement already carries the pinning scenario
(*A bare domain vector is rejected by the action spine's existing validation*).

**One trap worth writing down:** `[][]float64` is **not** on the allowlist and
fails with `ErrNonPrimitiveParam`. A curve's six control points must encode as
a flat `[]float64` of eighteen components, or as `[]any{[]float64…}`, or as a
`map[string]any` keyed per point — never as a slice of slices (Decision 9's
codec picks one and tests it).

### Decision 16: Bodies come from `system.BodyTable`, resolved once per request and threaded

`fleet.Service` gains a `BodySource` interface (`BodyTable(ctx, systemID)
(*system.BodyTable, error)`), satisfied by `system.Service`. Every burn solve,
position read, and resolve resolves its `space.Bodies` through it. This gives
`BodyTable` — and transitively `space` and `disclosure` — their first
production consumer, and it makes `system.asDisclosureWorld`
(`bodies.go:88`, currently caller-less) one line from being live at link 5.

**Two properties to preserve.**

- `BodyTable` calls `GetOrCreateInterior`, which is a Firestore read (and, on a
  cold system, a generation). It is resolved **once per request** and threaded
  as a parameter — never fetched per body, and never memoized in
  package-level state.
- It is an **unfiltered, requester-agnostic** seam
  (`system-body-table` › *The Body Table Is an Unfiltered Internal Seam, Never a
  Response*). `fleet`'s handlers must not surface `Ids()` or any derived count.
  Link 4 uses it only to solve and to fold; it never enumerates it into a
  response.

**A latent coupling worth knowing:** `system.gateOrbit` hardcodes
`ParentId: "feat-star"` (`bodies.go:238`). Gate bodies therefore resolve only in
a system whose star feature carries that id. It is correct today and out of
scope here; recorded so link 5 does not rediscover it.

### Decision 17: The fixture obligation is seven families, of which five are recorded now

Read from the two mirror maps rather than assumed:

| family | map | current `expectedChange` | link 4 action |
|---|---|---|---|
| `keplerPeriodMs` | `fixtures/system` | `migrate-fleet-to-continuous-burns` | **record** (full R¹ box) |
| `gateOrbit` | `fixtures/system` | `migrate-fleet-to-continuous-burns` | **record** |
| `stationOrbit` (`StationContinuousOrbit`) | `fixtures/system` | `migrate-fleet-to-continuous-burns` | **record** (covers `MaxFeatureSize`, `inclinationForDominant`) |
| codec (`EncodeVec`/`DecodeVec`/`EncodeSubTurns`/`DecodeSubTurns` + helpers) | `fixtures/space` | *"the first change that gives `backend/space` a consumer"* | **record** — that is this change, and the entry's own words ("a stored round trip crosses a real Firestore document and a fixture family earns its keep") are now literally true |
| `minDistanceFromOriginOf` | `fixtures/space` | *"delete it, or give it a caller, in the change that first migrates a consumer onto `backend/space`"* | **record or delete** — that is this change |
| `StationKeepRate`/`StationKeepUpkeep` | `fixtures/space` | *"the change that introduces a delta-v or credit consumer for station-keeping"* | **re-file → `add-fuel-as-cargo` (link 7)** |
| `ReleaseStationkeep` | `fixtures/space` | *"the change that first lets a player release a station-keep hold"* | **re-file → `add-fuel-as-cargo` (link 7)** |

**Why the last two are not due.** Link 4 ships no verb that enters or leaves a
station-keep hold: parks arise from burn insertion (`ParkOrbit`) and from
stop-in-place (`ParkPoint`). Link 7 is where station-keeping first has a
currency (making the rate rule-bearing) **and** where the settled
force-demote-to-`orbit` guardrail creates the first release path. If link 4's
implementation ends up adding a hold-here/resume-orbit verb after all, both come
due here instead.

**The interpretation this change adopts, stated explicitly because silence is
the failure mode.** The shipped rule is that *a rule-bearing shared function
SHALL NOT remain in the inventory across more than one change that modifies its
package*. `add-space-kinematics` **created** those entries; it did not consume
the budget. Link 4 is therefore the first change that may carry them, and it
carries them exactly once more, each **re-filed with a fresh, named
`expectedChange`** rather than left pointing at a paraphrase. No script checks
this — `check-mirror-map.sh`'s `anti_mirror` pass reads only `sharedNames`, and
never opens `fixtures/system/mirror-map.json` at all while `frontend/lib/system`
does not exist — so the whole obligation is honoured by writing it down or not
at all.

Also required: extend `fixtures/space/mirror-map.json`'s `coverage` list with
every function this change adds to `backend/space` (`Drift.Position`,
`Drift.Velocity`, `CutDrive`, the new codec entries), per the map's own rule
that every declared function is reconciled against a family or the inventory.

### Decision 18: Deviation-register housekeeping — two entries retire, one defect doc closes, one must not

`fixtures/determinism-register.json` carries three entries this change touches:

| entry | site | defect doc | outcome |
|---|---|---|---|
| `fleet.legMs` / `fleet.laneLength` | `routing.go:187,196` | `2026-08-25-lane-eta-arch-divergence.md` | **retire the entry; flip the doc to `fixed (migrate-fleet-to-continuous-burns)`** — it is that defect's *only* entry, and Decision 10's replacement closes all three of its numbered violations |
| `fleet.msPerTileFor` | `service.go:128` | `2026-08-25-remaining-fma-sites.md` | **retire the entry only** |
| — | — | `2026-08-25-remaining-fma-sites.md` | **must stay `open`** — it is shared with `market/provisioning.go:35,38` and `mine/service.go:187,224`, all still live |

Concretely: `remaining-fma-sites.md` gets a *resolved* note for the fleet sites
in the style its §1 and §2 already use, and its `**Status:** open` line does not
move. Flipping it wholesale would silently un-register four live violations in
`market` and `mine`.

**The trap, learned the hard way in `pin-system-generation-determinism`.** A
registered site that no longer emits is only a **WARN** in
`check-fma-contraction.sh`, not a failure. So a forgotten register entry for
deleted code passes CI silently — the removal must be a checklist item, not
something the gate will catch.

### Decision 19: What link 4 must supply for `disclosure` to become satisfiable, and what stays link 5's

`disclosure` has zero consumers. Link 4 does not call it; link 4 changes the
world so that its already-shipped requirements *can* be true.

**Supplied by link 4** (each is a precondition `disclosure` already assumes and
that does not exist today):

| `disclosure` needs | link 4 supplies |
|---|---|
| `Ship.State space.ShipState` | Decision 4 — the fleet's stored state *is* one |
| a canonical position path | Decision 4 — `space.StatePosition` is the only answer |
| `Ship.InLaneTransit` | Decision 10 — `Jump != nil` |
| `Ship.DriveOutput` | Decision 9 — roster-derived, alongside the accel ceiling |
| a burn with a real `Accel` | Decision 9 — player-selected, bounded, stored |
| an emission interval | Decision 6 — cut drive makes "goes dark" observable |
| `World{Bodies, StarId, StarSize}` | Decision 16 — `system.BodyTable` already satisfies it via `asDisclosureWorld` (`bodies.go:88`), which link 4 gives a real caller shape even if not yet a call |
| a drifting contact's velocity | Decision 5 — the `ModeDrift` arm in `contactVelocity` |
| an `Attachments` host id | Decision 13 — `AttachedTo` is `HostOf` |

**Explicitly still link 5's**, and not to be crept into link 4: calling
`Disclose` from any read; the persisted sighting store; the focused-scan verb
and its sensor-channel pricing; widening the masking requirement from "a ship
docked to a host" to attached objects generally; deleting the rest of
`observation`; and `system-body-table`'s projection-through-a-filter delta.

**Consequence to keep in view:** because `disclosure` is not wired,
`Attachments` has no implementation in link 4, so a docked fleet is not masked —
it is simply not disclosed, along with every other foreign fleet
(Decision 11).

### Decision 20: The one clause that must survive `Cancel Halts in Place`'s removal

`fleet-movement` › *Cancel Halts in Place* is REMOVED and replaced by *Cut
Drive* and *Stop In Place*. **One clause of it is not about movement at all and
must be carried into the new requirements verbatim in substance:**

> …or **remaining `docked` at its current parent feature, unchanged, if the
> released slot was occupied by a non-movement verb (e.g. a running `mine`
> action) rather than a burn or lane trip** — a docked fleet has no motion to
> halt into a coast, so releasing a co-resident verb's slot must never force it
> off its dock.

Continuous form: **cancelling a running `mine` leaves the fleet's
`space.ShipState` and its `AttachedTo` untouched.** Its scenario (*Cancelling
via the fleet endpoint while mining leaves the fleet docked*) must survive under
whichever new requirement owns the generic cancel path.

Two shipped requirements depend on it and neither is link 4's to change:
`mine-extraction`'s cancel contract, and `board-view` › *Running Mine Gates the
Movement Channel* (*A running mine can be cancelled* — "the movement channel
frees on success", with the fleet still docked and its hold intact). Losing it
would make a cancelled mine run silently undock the fleet, which reads as a
mining bug and would be diagnosed as one.

### Decision 21: The compile-breakage inventory, split by who owns each break

**A. Must change in link 4** (these do not compile, or compile and are wrong):

| site | break |
|---|---|
| `fleet/model.go` | `State board.MovementState` → `space.ShipState`; `+AttachedTo`, `+Jump`; `OrderRequest.Target board.Target` → body-id/point + optional `Accel`; `RoutePreview` deleted |
| `fleet/service.go` | `orderBurn`, `Cancel`, `haltState`, `Position`, `SeedFleet`, `validateFleetRing`, `maxStateRing`, `msPerTileFor`, `msPerLaneUnitFor`, `featureOrbit`, `featureAnchor`, `FleetsForCorp`, `ErrCoreDestination`, `ErrRingOutOfRange`, `ErrNotOnBoard`, `Scan` |
| `fleet/routing.go` | whole file: `planRoute`, `routePlan`, `reconstruct`, `legMs`, `laneLength`, `ErrNoRoute`, `ErrSameSystem`; `TierSource` narrows to `ChartedLanes` |
| `fleet/travel.go`, `travel_resolver.go` | replaced by the single-hop jump commit + resolver |
| `fleet/resolver.go` | `BurnResolver` folds `space.StateAt`; `AmbientRecorder` / `BurnResolverWithAmbient` deleted with the ambient reveal |
| `fleet/handler.go` | `WithFog`/`AudienceFog` deleted; `/route` and `/scan` routes deleted; `/cut-drive`, `/stop`, `/jump` added; `dtoFor` loses `board.Cell` |
| `fleet/params.go`, `roster.go` | `MsPerTile`/`InterceptHorizon`/`BoardRadius` out; `ClassStats.BurnRate` → `Accel`; `DerivedBurnRate` → `DerivedAccelCeiling` |
| `fleet/cargo_tx.go`, `dao.go` | `board` import removal; stored-shape change |
| `space/state.go:73` | **`ModeDrift` arm — compiles, fails at runtime** (Decision 5) |
| `disclosure/contact.go:114` | **`ModeDrift` arm — compiles, fails at runtime** (Decision 5) |
| `observation/*` | the five removed requirements' code: coverage, echo disc, scan mint, ambient writes, fleet visibility; `FleetSource`/`FleetPos` deleted |
| `system/fog.go`, `fog_source.go`, `handler.go` | the three-band feature projection (Decision 11) |
| `mine/service.go:152-153` | one-line re-point to `DockedTo()` |
| `market/service.go:497-498` | one-line re-point to `DockedTo()` |
| `corporations/service.go` | `SeedFleet(…, at board.Cell)` → a `space` park; `rimCell`/`RimRing` → a derived continuous spawn position |
| `router.go`, `cmd/seed/main.go` | resolver registration, removed wiring |
| `frontend/lib/types/fleet.ts` + the fleet-layer files | Decision 12 |
| `fixtures/determinism-register.json`, `docs/defects/2026-08-25-lane-eta-arch-divergence.md`, `docs/defects/2026-08-25-remaining-fma-sites.md` | Decision 18 |
| `fixtures/space/mirror-map.json`, `fixtures/system/mirror-map.json` | Decision 17 |

**B. Survives link 4; the owning link is named:**

| survivor | why it survives | owner |
|---|---|---|
| `backend/board`, `backend/polar` | still imported by `system` (generator, gates, fog, model, handler), `stations` (placement, service), `corporations` (rim cell) | **link 9** — and it is why `board` cannot be deleted here |
| `observation`'s tier ladder, arrival reveals, charted lanes | no lattice geometry; jump validation and the galaxy view read them | **link 5** |
| `mine`/`market` co-location semantics | re-pointed, not re-expressed | **link 6** |
| `fleet.AttachedTo` as an additive field | what a valid host is changes | **link 6** |
| `space.StationKeepRate`/`Upkeep`, `ReleaseStationkeep` | no consumer until upkeep has a currency | **link 7** |
| `board-view` as a capability | replaced by the space view | **link 8** |
| `system.asDisclosureWorld` (caller-less) | gets its caller when `Disclose` is called from a read | **link 5** |
| `frontend/lib/board`, `frontend/lib/polar`, `fixtures/board`, `fixtures/polar` | still drawing features | **links 8–9** |

**C. Compiles but breaks at runtime** — the class that needs its own named
tasks, because nothing in the build will find it:

1. `space.StatePosition`'s `default:` arm (`state.go:79`) returns
   `ErrUnknownParkKind` for `ModeDrift`. Every position read of a drifting
   fleet fails.
2. `disclosure.contactVelocity`'s `default:` arm (`contact.go:120`) does the
   same. Every disclosure decision about a drifting fleet fails — silently
   invisible today (no consumer), a hard failure the moment link 5 wires it.
3. Firestore decode of the new stored shape. `space` carries **zero**
   `firestore:` struct tags (verified), so a bare `space.Burn` in a document
   serializes under Go field names, and `Target.Point *Vec3` and
   `SubTurns` (a named int64) round-trip through shapes the struct-typed reader
   never expected. Decision 9's codec is what closes this; a struct-tag route
   would fail only against the emulator, not against a unit test.
4. Any surviving `board.ProductionSchedule()` call reached from a fleet path.
   `polar.Schedule.Slots` panics above `MaxRing`; `validateFleetRing` was the
   guard and it is deleted with the coordinate.

## Risks / Trade-offs

- **The game is not playable from link 4 to link 8.** Decision 12's box says it
  once; it is repeated here because it is the risk Travis is most likely to
  want to trade against, and the trade is available (pull the renderer forward,
  at the cost of an unreviewable link 4).
- **Foreign fleets vanish for one link.** Decision 11. Nothing leaks — the
  interim is strictly more restrictive than today — but a multiplayer game with
  no opponents visible is a poor demo, and the interim is invisible in tests
  because there is only one player.
- **`system-interior` reads become unfogged for one link.** Decision 11. Every
  authenticated requester sees every feature of any materialized system. In a
  live game this would be an information leak; here it is a stated interim on an
  unused deployment. It must be **written into the spec as a requirement**, not
  left as an implementation accident, or link 5 will have nothing to remove.
- **`BodyTable` adds a Firestore read to the fleet order path.** Today
  `orderBurn` reads the interior via `resolveFeature`; after this change it
  reads the interior *and* the live lane set (via `addGates`'s bounded
  neighbourhood read). Bounded and cached-per-request, but strictly more work
  per order than the lattice solve was. Measure before optimizing.
- **The solve residual becomes player-visible for the first time.**
  `space`'s fixed-round solve records a p99 of ~101 ms and a worst case of
  767 ms against a median flight of 5,326 ms on realistic traffic
  (`add-space-kinematics` Decision 12). Until now no player could see an ETA
  from it. If a quoted ETA and the flown curve disagree noticeably in play, the
  recorded bounds are the place to look, not the code.
- **Preview must round-trip to the server.** `space`'s Decision 1 makes Go the
  sole authority, and `board-view` › *Move Preview From the Acting Fleet's Live
  Position* was written assuming the client computes a preview end to end. Link
  4 removes that requirement rather than answering the question, so the
  reversal question `add-space-kinematics` recorded is **deferred to link 8**,
  where a real renderer will finally price it.
- **Two register entries retire in a change that also deletes their code.** If
  Decision 10's jump-duration replacement is implemented differently from what
  is written here (say, with an unguarded `dx*dx + dy*dy + dz*dz`), the entries
  will have been removed while the violation persists, and
  `check-fma-contraction.sh` will fail on an *unregistered* site — which is the
  loud failure, so this risk is self-correcting. The quiet failure is the
  opposite direction (Decision 18's WARN).
- **`space` has no purity test.** `disclosure/purity_test.go` structurally
  asserts that package's import set; `backend/space` asserts the same property
  only in a doc comment. Adding storage-shaped code to `space` (the codec
  extension) is therefore guarded by review alone. Consider adding the sibling
  purity test in this change — cheap, and it is the change that most tempts
  someone to reach for a `firestore:` tag.

## Migration Plan

**There is no migration, and there will not be one anywhere in this chain.**

`docs/plans/continous_space/README.md`'s ground rules are explicit: no migration
plans, no backwards compatibility, no data preservation, no dual-write, no
expand-migrate-contract, no feature flags. Prod (`hexaverse`) exists and is
unused; the only stored state is Travis's own, and it is disposable.

Concretely, and deliberately:

- **Existing fleet documents are not migrated.** A stored
  `board.MovementState` will not decode into `space.ShipState` and is not made
  to. Wipe the emulator; delete the prod collection if it is ever in the way.
  This is the same call `add-orbital-system-bodies` made with
  `ErrInteriorPredatesContinuum` — fail closed on a pre-capability document —
  except that link 4 does not even need the sentinel, because the whole document
  set is disposable.
- **No compatibility shim for `board.MovementState`.** Decision 4.
- **No shadow lattice position.** Decision 11's rejected option (c).
- **No dual-run of `observation` and `disclosure`.** Decision 19.

The sequencing *within* the change is real, though, and it is the substitute
for a migration plan:

1. **Fixtures first** (Decision 1/17) — record the five due families against
   today's behaviour, so every later assertion in this change is made against a
   pinned baseline rather than against itself.
2. **`space` additions** — `ModeDrift`, `Drift`, cut-drive construction, the
   stop-in-place threshold, the codec extension, and the two `default:`-arm
   fixes (Decision 21C). `backend/space` still has no consumer at the end of
   this step; its own suite gates it.
3. **The contract** — the fleet document's stored shape, the endpoint set
   (`/orders`, `/cut-drive`, `/stop`, `/jump`; `/route` and `/scan` deleted),
   and `frontend/lib/types/fleet.ts`. This is what the SDET writes the failing
   acceptance suite against, and it must be settled before either developer
   starts.
4. **`fleet`** — service, resolvers, handler, params, roster.
5. **The blast radius** — `observation`'s live half, `system`'s fog projection,
   `corporations`' spawn placement, the `mine`/`market` one-liners.
6. **The frontend amputation** (Decision 12).
7. **Hygiene** — register entries, defect docs, mirror maps, coverage lists.

Steps 5 and 6 are independent of each other and can run in parallel once step 3
is fixed.

## Open Questions

1. **The stop-in-place speed floor's value** (Decision 8). The rule is settled;
   the number is not. It should be small enough that stopping is normally a real
   burn, and large enough that a fleet drifting at a speed no player would
   notice cannot be stuck. A starting point: the speed at which the stopping
   burn's arc would equal `space.MinArcLength` (2.0 units) — i.e. derive it from
   the existing floor rather than inventing a second one. Recorded as a
   recommendation, not a decision.

2. **The jump's `msPerLaneUnit`** (Decision 10). `ClassStats.LaneRate` survives
   as the per-hull lane rate, but the fleet is now a continuous-space object and
   the lane is a wormhole. Should crossing time still scale with the fleet's
   drive at all, or is it a property of the lane? Nothing in `decisions.md`
   settles it. Keeping `LaneRate` is the cheap, non-committal answer and is what
   this design assumes.

3. **Where the fleet's spawn park goes** (Decision 14). `corporations.rimCell`
   put a hull one ring inside the lane-gate ring. The continuous analogue is a
   deterministic park at a radius derived from the interior's `Extent` and the
   `GateRadiusFactor` (1.1), account-seeded for phase. Whether it should be a
   `ParkOrbit` around the star, a park at a specific body, or docked at the home
   station is a **feel** question with real consequences for the opening minute
   of the game, and it is not settled here. Docked-at-the-station is the most
   defensible default (it is where the market is, and it makes the first taught
   verb "undock and burn"), but it interacts with Decision 13's link-6 host
   redefinition.

4. **Whether the sensor channel survives with no verb on it.** Link 4 deletes
   the scan verb (its product, the reveal mint, is removed by Decision 11) but
   link 5 immediately refills the channel with the focused scan. This design
   assumes `Fleet.ActiveScanId` and `action.SlotSensor` are **retained**,
   unwritten, with a comment naming link 5 — the same additive-then-refill
   discipline as Decision 13, inverted. The alternative (delete the field,
   re-add it in link 5) is one more delta in each direction for no benefit, but
   it is a defensible tidiness preference.

5. **Whether `board-view` should be REMOVED wholesale rather than pared.**
   Decision 12 keeps the mine/sell/credits/camera half. If link 8 is going to
   replace the capability entirely anyway, paring it now is work done twice.
   Kept because links 5–7 still need *some* surface to exercise the economy loop
   against, and the roster panel alone cannot show a hold readout in context.
   Worth revisiting if link 8 moves earlier.

6. **`chain.md`'s Link 5 entry needs a line** (Decision 11): after link 4,
   `observation-fog-and-scan` is REMOVED *in part*, not "entirely", and link 5
   inherits a reduced package plus the `system-interior` interim requirement to
   replace. The spec writer owns that edit; this design does not make it.

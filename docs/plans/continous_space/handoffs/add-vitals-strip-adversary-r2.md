# `add-vitals-strip` — adversary round 2 (scoped)

Scope, per the orchestrator: (a) verify round 1's 14 findings stayed fixed
against the **rulings** (BLOCKER 2 and MAJOR 9 were re-prescribed), and
(b) attack only the clauses the repair pass changed. Settled ground (the
REMOVED-body diffs, the camera cluster, the fan-in delta outside MAJOR 7)
was not re-attacked.

Inputs re-read: the four delta files, `proposal.md`, `design.md`,
`tasks.md`, round 1 + its rulings, the 24 rulings,
`docs/plans/system-hud/chain.md` Link 2b, and the served shapes
(`frontend/lib/types/fleet.ts`, `frontend/lib/types/system-space.ts`,
`frontend/lib/types/galaxy.ts`, `frontend/lib/types/corporation.ts`,
`frontend/components/fleet/roster-status.ts`,
`frontend/components/fleet/FleetRoster.tsx`,
`frontend/components/corporation-provider.tsx`,
`frontend/components/space/SystemSpaceView.tsx`).

**Verdict: NEEDS REVISION — residue only.** Every round-1 finding landed.
All nine findings below live *inside* round 1's repairs; none is new ground.
One is a BLOCKER (the burn-target host lookup — the same defect's second
half, one clause over), four are MAJOR, four MINOR. Six of the nine are on
the state pill, which took four edits in one pass.

---

## Round 1 verification — all 14 fixed

| R1 finding | Landed? | Note |
| --- | --- | --- |
| BLOCKER 1 (docked host name) | ✅ | Host = served type word + served id; lane-gate host = `Gate` + destination system name from the galaxy read with a raw-`destSystemId` fallback; lookup now searches `features` **and** `laneGates` (spec 210-250, design D6, task 1.1). |
| BLOCKER 2 (pill props) | ✅ per the ruling | Props are derivation output + `stranded` + `scale` + projected `worldTime`, "never a `Fleet`". Scale-dependent figures are now renderable. But the type-error property is weaker than it reads — F2, F3, F4, F6 below. |
| MAJOR 3 (width floor) | ✅ | WHEN now quantifies ("every floating surface the view mounts … including one carrying a retry affordance"); the enumeration moved to design D8 and task 7.3. |
| MAJOR 4 (staleness) | ✅ | Reaches the pill (spec 229-231, scenario 326) and the chevron (spec 102-104, scenario 160). Input plumbing is F4. |
| MAJOR 5 (advance) | ✅ | Pill clause 226-229 + *The countdown advances between reads*; clock clause 569-571 + *The stamp advances between reads*. Side effects: F3, F5, F9. |
| MAJOR 6 (fuel gauge) | ✅ | Names a state attribute with a no-data value and a rendered-fill value, on the 0.05 t / 200 t pair, "fill geometry ignored". The attribute's *token* is still unnamed, but the scenario now asserts values, not inequality — the round-1 exploit (`style` width difference) is closed. |
| MAJOR 7 (credits accessor) | ✅ **verified real** | `useCorporationSessionOptional()` can supply what the rule needs: `CorporationContextValue` already carries `isError` (`corporation-provider.tsx:26`) beside `corporation`, and `useContext(CorporationContext)` does not throw — the new accessor is a three-line non-throwing read of an existing field, not a second dead API. `proposal.md:94-96` names the file in Impact. |
| MAJOR 8 (chevron labels) | ✅ | Served id + system display name (`WireSystem.name` is served, `galaxy.ts:35`) with raw-id fallback, plus the lane-transit note; scenario at 153. |
| MAJOR 9 (task 10.3) | ✅ | 10.3 is now the `grep -c 'TBD - created by archiving'` = 0 assertion; the Purpose is pasted into `docs/plans/system-hud/chain.md:308-318` **byte-identical** to the delta's (diffed) with the precedence sentence at 320-322. |
| MINORs 1–5 | ✅ | Per-kind figure clause restored (spec 430-432); `fuel`/`corporation-spawn` cross-references and the "When shown as a figure" qualifier restored; empty-hold scenario now asserts the served `freeHold` on `data-raw`; the unobservable THEN is now the mechanical tree inspection; the read enumeration includes the galaxy read and 56px is recorded in design D8. |

**Explicitly checked for the collision the orchestrator flagged:** MAJOR 5's
advance clause vs R7's "only when a read serves new values". **No
contradiction** — R7 governs the *fuel tonnage and gauge fill*, the advance
clause governs *durations on the pill* and *the clock stamp*. Disjoint
figures, and R7's own scenario ("the fuel figure and its `data-raw` are
unchanged") stays true while a countdown ticks beside it. The collision is
elsewhere: it is between the advance clause and the *rate* (F5), and between
the `worldTime` prop and the single-derivation rule (F3).

---

## BLOCKER — F1. The burn target's host lookup repeats BLOCKER 1's *second* half: no resolution path, no degradation, and the headline target is a lane gate

**Lands on:** `specs/system-console/spec.md`, *The Fleet Cell's State Pill Is
a Projection of the Shared Roster Derivation* — the repaired under-way
clause and its scenario; `tasks.md` 1.1 and 3.5.

**Quoted (spec 216-219):**

> under way (naming the burn's served target — the target body's served type
> word and served id when the target is a body, since no body on the interior
> read carries a name either …

**Quoted (task 1.1):**

> the burn's served target (the target body's served type word and served id
> when the served target carries a body id — **the same type-word-plus-id
> shape as the docked host** …

**Why it fails.** The ruling on BLOCKER 1 was explicit: *"Fix the resolution
path, not just the copy."* The docked host got both halves — the copy
(type word + id) *and* the path (search `features` **and** `laneGates`, and
degrade to the raw `attachedTo` when neither matches). The burn target got
only the copy. Three consequences, all reachable:

1. **A burn target is very often a lane gate.** `SpaceLaneGate`'s own doc
   comment (`lib/types/system-space.ts:51-53`) says its `id` "is the body id
   a burn order must name"; `SystemSpaceView.tsx:630-633`'s `gateFacts`
   resolves the current *selection* against `interior.data.laneGates`. Burn
   to a gate → dock → jump is the standard traversal. Gates are not in
   `features`, so a lookup that mirrors only the round-1 `dockedFeature`
   shape returns `null` for the most common burn in the game.
2. **A `SpaceLaneGate` has no `type` field at all** (`system-space.ts:60-67`
   — `id`, `destSystemId`, `laneId`, `space`, `size`, `orbitElements`).
   So "the target body's **served** type word" is not merely unresolved for a
   gate target, it does not exist. The docked branch solved this by naming
   the gate `Gate` + destination system name; the under-way branch says
   nothing.
3. **The obvious degradation is spec-forbidden.** Task 3.5 requires the
   body-target test to be "asserted to fail against a raw-id-only render".
   So for a gate target the implementer may not fall back to the raw id, may
   not synthesise a name, and has no served type word — there is **no legal
   rendering**, and no degraded scenario exists for the target the way one
   exists for the host (*A docked fleet at an unresolvable host degrades the
   pill*).

**What an implementer could ship and still satisfy the spec:** `Burning ·
undefined gate-sys_2_0 · 2m 40s`, or a silent drop to the bare id that the
change's own test says must fail, or an unhandled `find(...)!.type`. The
`features`-only lookup is the *literal* reading of "the same shape as the
docked host" only if you read the shape and not the path — which is exactly
the round-1 mistake.

**Smallest fix.** Give the target the host's full treatment, in the same
sentence, and add the degraded scenario:

```
under way (naming the burn's served target — resolved by the served target's
body id against BOTH the interior read's `features` and its `laneGates`: a
`features` hit as its served `type` word plus its served id, a `laneGates`
hit as `Gate` plus the destination system's display name from the galaxy
read (falling back to the raw `destSystemId`), and, when the body id matches
neither collection or the interior read has failed, the raw body id — never
a synthesised name; or an explicit "a point in space" when the served target
is a point …

#### Scenario: A burn toward a lane gate names the gate's destination system
- **WHEN** the acting fleet's burn names a `laneGates` entry as its target
- **THEN** the pill reads the under-way state naming `Gate` and that gate's
  destination system's display name, with its remaining duration

#### Scenario: An unresolvable burn target degrades the pill, it does not blank it
- **WHEN** the burn's served body id matches neither the interior read's
  `features` nor its `laneGates`, or the interior read has failed
- **THEN** the pill still reads the under-way state naming the raw body id,
  with its remaining duration, never an empty or missing target
```

and drop task 3.5's "asserted to fail against a raw-id-only render" to
"against a raw-id-only render *for a resolvable target*", so the degraded
path is not tested as a defect.

---

## MAJOR — F2. The pill's prohibition list forbids exactly what task 1.1 routes into the derivation's output, so the type-error invariant does not close

**Lands on:** `specs/system-console/spec.md` 194-200; `tasks.md` 1.1 vs 3.1;
`design.md` Decision 4 vs Decision 5.

**Quoted (spec):**

> the pill SHALL NOT be supplied the fleet record, so `Fleet.state`,
> `attachedTo`, **the park kind and any action ETA are unreachable from it**
> rather than merely forbidden to it

**Quoted (task 3.1):** "never a `Fleet`, `attachedTo`, **a park kind, or an
action ETA**".

**Quoted (task 1.1):** "the pill's new distinctions — **park mode**, the
docked host's served type word and served id …, **the mining run's ETA** —
arrive as NEW optional fields the roster row is free to ignore".

**Why it fails.** The pill's props *are* the derivation's output. Task 1.1
puts the park mode and the mining run's ETA **into** that output; the pill
requirement declares both unreachable from the pill. Both cannot be true.
And the `Holding` state forces the collision rather than merely permitting
it: `FleetRoster.tsx:197` renders `status.activity` verbatim, and design
Decision 4 forbids changing `activity` for any input it answers today — a
`stationkeep`-parked fleet answers `On station` or `Docked` today. So
`Holding` **cannot** be a new `activity` value; it can only be composed by
the pill from a new park-mode field — the exact branch the prohibition says
is a type error.

The malicious-implementer reading: put the raw `Park.Kind` number on the
derivation's output, branch `status.parkKind === 1` in the pill, and claim
compliance because "the pill was not supplied a `Fleet`". That is a pill
branching on raw fleet state, which is what round 1's BLOCKER 2 ruling
("the invariant's content is *the pill never receives a `Fleet`*") was
meant to keep out by construction.

**Smallest fix.** Make the prohibition name the *fleet record's* fields and
require the derivation to emit resolved values, not raw wire enums:

```
… the pill SHALL NOT be supplied the fleet record, so no field of `Fleet` —
its `state`, its `attachedTo`, its park kind, or an action's raw ETA — is
reachable from it except as an already-resolved value on the derivation's
output: the derivation emits the state token (including the holding state),
the resolved host label, the resolved target label and the remaining
duration, and the pill renders them without branching on a wire enum or
subtracting a clock from an ETA.
```

with task 1.1 restated to emit resolved labels/tokens rather than "park
mode" and "the mining run's ETA".

---

## MAJOR — F3. The `worldTime` prop cannot make a countdown advance without a second derivation, and task 3.5 tests the impossible half

**Lands on:** `tasks.md` 3.1, 3.4, 3.5 against
`specs/system-console/spec.md`'s *No second derivation of fleet state exists
in the strip*; `design.md` Decision 5.

**Quoted (task 3.4):**

> Compute a duration or rate the pill renders **against the `worldTime` prop
> (task 3.1)** rather than a value baked in at the last read

**Quoted (task 3.5):**

> a countdown advancing between two renders at different `worldTime` values
> **with no new derivation output**

**Quoted (spec, the scenario that forbids it):**

> **THEN** no module other than `roster-status.ts` computes a fleet's tone,
> activity, or **remaining duration**

**Why it fails.** `RosterRowStatus.remainingMs` is a *span*, not an instant
(`roster-status.ts:32`). Given one status object and a larger `worldTime`,
the pill cannot derive a smaller span — it has no anchor. Only two routes
exist and each falsifies a clause of this change:

- **Route A** — the mounting view re-invokes `rosterRowStatus(fleet,
  worldTime, …)` on every render (which `SystemSpaceView.tsx:415-417`
  already does with its ticking `worldTime`). The spec's own scenario
  (*The countdown advances between reads*) is satisfied — but the pill's
  `worldTime` prop is then **dead**, task 3.4 is wrong about where the
  computation lives, and task 3.5's test ("different `worldTime` values with
  no new derivation output") is unwritable: the output is what changes.
- **Route B** — the derivation emits an absolute ETA (task 1.1 does exactly
  this) and the pill subtracts `worldTime`. Then the pill computes a
  remaining duration, falsifying *No second derivation of fleet state exists
  in the strip*, and it holds an action ETA, falsifying task 3.1.

Design Decision 5 justifies the `worldTime` prop with "MAJOR 5's
advancing-countdown rule … has nowhere to read a live clock from either" —
which is false: the derivation is where the live clock is already read.

**Smallest fix.** Adopt Route A explicitly and drop the prop:

- Spec: "A duration the pill renders SHALL be the derivation's own output
  for the mounting view's projected world clock, re-derived as that clock
  advances, so it advances between reads with no refetch."
- Design Decision 5: props are `{ status, stranded, scale }`; record that
  the projected clock enters through the derivation, not the pill.
- Task 3.4/3.5: assert the countdown advances across two renders whose
  derivation was run at two `worldTime` values, with no read landing.

(If the orchestrator prefers Route B instead, then the single-derivation
scenario and task 3.1's ETA prohibition must both be amended — but Route B
also re-opens F2.)

---

## MAJOR — F4. The pill's new staleness rule has no input, and its test has no inducible trigger

**Lands on:** `specs/system-console/spec.md` 194-197 and 229-231, scenario
*A failed refetch retires the pill rather than freezing it*; `design.md`
Decision 5; `tasks.md` 3.1, 3.4, 3.5.

**Quoted (spec, the closed props list):**

> and SHALL render from that derivation's output value, the served
> `stranded` flag, the served world-clock scale, and the mounting view's
> projected world time — **and from nothing else**

**Quoted (spec, the rule MAJOR 4 added):**

> WHEN the own-fleets read's most recent attempt has failed, **the pill
> SHALL show the absent form in place of its state**

**Why it fails.** "That read's most recent attempt has failed" is not
derivable from any of the four permitted inputs, and `design.md` Decision 5
pins `status: RosterRowStatus` — **not** nullable — so there is no
representation of the failed state in the pill's own type either. The
strip *does* receive the error state (task 8.1), so the rule is
implementable somewhere; nothing says where, and the two homes differ
observably:

- the strip renders the absent form **instead of** the pill → the scenario's
  "the pill shows the absent form" has no pill to inspect;
- the pill takes a fifth prop → "and from nothing else" ships false and the
  property scenario's "supplied only …" is written loose.

Testability, concretely: task 3.5 requires "the pill going absent (not
frozen) when the own-fleets read's most recent attempt has failed" to be
asserted **against the pill** (task 3.5's own framing is component-level:
"asserted against the strip component directly rather than through
`SystemSpaceView`"), but the pill's props contain nothing a test can set to
induce that trigger. Task 3.1 and task 3.5 are unsatisfiable as a pair.

**Smallest fix.** Make the absence representable on the permitted input:

```
… SHALL render from that derivation's output value — or from its explicit
absence, which the mounting view supplies in place of an output whenever the
own-fleets read's most recent attempt has failed — the served `stranded`
flag, the served world-clock scale, and from nothing else …
```

with `design.md` Decision 5's signature reading
`status: RosterRowStatus | null` and task 3.5's staleness case rendering the
pill with a null output.

---

## MAJOR — F5. "A duration **or rate** … SHALL advance between reads" is false for the only rate the pill renders, and contradicts its own sibling scenario

**Lands on:** `specs/system-console/spec.md` 226-229 against *A
station-keeping fleet's pill shows the served upkeep rate*.

**Quoted (the repaired clause):**

> **A duration or rate** the pill renders SHALL be computed against the
> mounting view's projected world clock, so it advances between reads with
> no refetch, never a value frozen at the moment of the last-served read.

**Quoted (the sibling it contradicts):**

> **THEN** the pill shows the fleet read's **served** rate presented per
> `figure-formatting` (`tons-per-world-s`), **never a rate derived** from the
> host's orbital elements

**Why it fails.** The only rate the pill renders is
`roster.stationKeepRateTonsPerSecond` — a served constant
(`lib/types/fleet.ts:130`, "Never derived client-side … `space.StationKeepRate`
is rule-bearing"). A served constant cannot "advance between reads" and must
not be "computed against the projected world clock"; a value that is
correctly frozen at the last-served read is exactly what this figure is.
MAJOR 5's repair over-reached from durations onto rates and produced a
requirement that, read literally, orders a client-side derivation that
RULING 8, `figure-formatting` R14 and the sibling scenario all forbid; read
charitably, it is vacuous for rates. Either way one of the two clauses is
dead text, and an implementer has cover for a ticking upkeep figure.

**Smallest fix.** Delete two words: "A **duration** the pill renders SHALL
be computed against the mounting view's projected world clock …". The rate
already has its own rule (served, never derived) and its own scale
requirement.

---

## MINOR findings

**F6 — the props enumeration disagrees with itself across four homes.**
The requirement body, `design.md` Decision 5 and task 3.1 all list **four**
inputs (output, `stranded`, `scale`, `worldTime`); the property scenario
(*The pill is a function of the derivation's output alone*) and task 3.5
list **three**, dropping `worldTime`:

> **WHEN** the pill is rendered for each, supplied only that output value,
> the served `stranded` flag, and the served world-clock scale — never a
> `Fleet`

If `worldTime` is a required prop (Decision 5 types it `number`), the test
written to this scenario does not compile. Fix: make the two lists agree —
and if F3 is taken, they agree at three by deletion.

**F7 — the lane-gate host has no served type word, but the clause says it
does.** Spec 210-211: "docked (naming the host as **its served type word**
and served id, and, for a lane-gate host, the destination system's display
name … in place of the gate's own id)". `SpaceLaneGate`
(`lib/types/system-space.ts:60-67`) carries no `type` field; the word `Gate`
in the scenario at 238-243 is a client literal, which is correct and is what
`docs/plans/system-hud.md` Surface 1 asks for. Fix: "…, and, for a lane-gate
host — which the interior read serves with no `type` field — the fixed word
`Gate` plus the destination system's display name …", so no one goes looking
for `gate.type`.

**F8 — the clock's mandated advance is unconditional, including in the state
that has no served scale.** The new clause (569-571) says "Once a world time
has been served, the clock cell SHALL re-render as the mounting view's
projected world clock advances", while the scenario four lines up mandates
the `×—` render when no scale has been served. `useWorldTime` projects at
`clockScale = … ?? 1` (`SystemSpaceView.tsx:415`), so in that state the
repair now *requires* a stamp advancing at an assumed scale of 1 —
round 1 filed this as a flagged disagreement rather than a finding; MAJOR
5's repair promoted it from permitted to mandatory. Fix (one clause, on the
requirement): "WHEN no world-clock scale has been served, the stamp SHALL
render the last served instant without projecting it forward." The pill is
already protected by its own scale-absent scenario; the clock is not.

**F9 — an empty chevron menu now means two different things with one
render.** The failed-refetch scenario (160-164) makes the menu offer no
entry; *A requester owning no fleet at all still gets the strip* (58-62)
makes the menu "empty rather than absent". A player owning five fleets, on a
failed refetch, gets the render of a player owning none, with nothing on the
strip saying so — the "stale formatted identically to fresh" species this
link exists to police, arriving through MAJOR 4's own repair. It is not
graded higher because R1 deliberately routes the own-fleets error surface to
the fleet panel. Fix: one sentence stating that the strip may render both as
the same empty menu **because** the panel owns that read's error surface,
so the ambiguity is a decision rather than an oversight.

---

## Checked in the repaired set and found sound

- **MAJOR 5 vs R7** — disjoint figures, no contradiction (see above).
- **The fifth-name sweep.** Every figure and label in `system-console` was
  walked against `lib/types/fleet.ts`, `lib/types/system-space.ts`,
  `lib/types/galaxy.ts` and `lib/types/corporation.ts`: fleet id, docked host
  (type+id / `Gate`+system name), chevron entries (id + `WireSystem.name`),
  hold segments (served kind keys + served tons), `cargoCapacity`,
  `freeHold`, `fuel`, `estimatedRange`, `stationKeepRateTonsPerSecond`,
  `runningMine.eta`, `credits`, `worldTime`, `scale`, `stranded`. **One
  unserved figure remains: the burn target's type word (F1), and it is
  unserved for lane-gate targets specifically.** No sixth instance exists.
- **MAJOR 7's accessor is real** — `isError` already exists on
  `CorporationContextValue`; the new accessor exposes an existing field
  through a non-throwing `useContext` read. React Query keeps `data` and
  raises `isError` on a failed background refetch, which is precisely the
  state the credits rule names.
- **MAJOR 9's second home** — the chain-doc paste is byte-identical to the
  delta's Purpose (diffed) and carries the precedence sentence.
- **MAJOR 3, 6, 8** — repairs hold; no sibling was made vacuous by them. The
  hold gauge's twin no-data scenario was left in its looser form, which
  remains correct there (both renders have zero segments, so no fill
  geometry exists to ride on).

---

**Verdict: NEEDS REVISION — residue only.** All nine findings are confined
to round 1's repairs; six of them to the state pill. F1 is the only one that
would ship a wrong render.

---

# Orchestrator rulings on round 2

Round 2 of at most three. Verdict accepted: **NEEDS REVISION, residue only** —
every finding lives inside a round-1 repair, and six of nine are on the pill,
which took four edits in a single pass. That concentration is the signal: the
pill is the one requirement in this change whose correctness claim is
load-bearing, and it has been edited more than anything else.

I verified the three factual premises before ruling, rather than taking them:

- `frontend/lib/types/system-space.ts` — `SpaceLaneGate` is
  `{ id, destSystemId, laneId, space, size, orbitElements }`. **No `type`
  field.** F1 stands.
- `frontend/components/fleet/roster-status.ts` — `RosterRowStatus.remainingMs`
  is `number | undefined`, a **span with no anchor**. F3 stands.
- `frontend/components/corporation-provider.tsx:14` — `CorporationContextValue`
  already carries `isError`. `useCorporationSessionOptional()` is **real**, and
  MAJOR 7 is genuinely closed rather than closed by a second unusable API.

All fourteen round-1 findings are confirmed landed. The collision I predicted
(MAJOR 5 vs R7) does **not** exist — R7 governs the fuel figure, the advance
clause governs pill durations and the clock stamp; disjoint. Recording that
because a predicted defect that turns out absent is worth as much as one that
turns out present, and the next orchestrator should not go looking for it again.

## F1 (BLOCKER) — the burn target repeats BLOCKER 1's *second* half. ACCEPTED.

Round 1's BLOCKER 1 had two halves — wrong copy, and a resolution path that
searched `features` only. The repair fixed the copy for the burn target and
**not** the path, which is precisely the failure mode the round-1 ruling warned
about in the host's case ("fix the resolution path, not just the copy"). The
same warning, unheeded one requirement over.

It is worse than a repeat, because a lane gate is the commonest burn target in
the game and `SpaceLaneGate` has **no `type` field at all** — so "the target
body's served type word" names something that does not exist. And task 3.5
forbids a raw-id-only render, so as written there is **no legal rendering** of
the commonest case. A requirement that forbids every implementable rendering is
not a strict requirement; it is an unimplementable one.

**Ruling: give the burn target the host's full treatment.** Search both
collections; a gate target reads `Gate` plus its destination system name (system
names are served, via the galaxy read — the asymmetry this change has now
established three times); a body target reads its served type word plus id; and
there is a **degraded scenario** with a raw-id fallback for the case where
neither collection resolves the target. Task 3.5's falsifiability requirement is
amended to match: it must fail against an *invented* name and against a render
that drops the type word **when one is available**, not against the legal
fallback.

## F2 (MAJOR) — the pill's prohibition forbids what task 1.1 feeds it. ACCEPTED, and I am restating the invariant.

The prohibition says the park kind and any action ETA are "unreachable from" the
pill, while task 1.1 routes park mode and the mining run's ETA **into the
derivation's output**. And `Holding` forces the issue: `FleetRoster.tsx:197`
renders `status.activity` verbatim, so Decision 4's additive-only rule means
`Holding` cannot be an `activity` value.

This is the third time this change has had to restate the same invariant, so
state it once, precisely, and stop paraphrasing it:

> The pill SHALL NOT receive a `Fleet`, and SHALL NOT read `Fleet.state`,
> `attachedTo`, a park kind, or an action ETA **from the fleet read**. It renders
> only the shared derivation's output. The derivation MAY expose the park kind
> and a remaining ETA as **additive** fields, and the pill MAY branch on those,
> because they are the derivation's conclusions, not the fleet's raw state.

The thing being forbidden was always *a second derivation of fleet state in the
strip*, never *the pill using derived facts*. Round 1's BLOCKER 2 ruling made
this correction once for the props; F2 is the same correction needed one level
down, for the fields. `activity` stays untouched, per additive-only.

## F3 (MAJOR) — the `worldTime` prop cannot advance a countdown. ACCEPTED; the fix is an anchor, and neither of the adversary's two routes.

`remainingMs` is a span captured at derivation time, so passing a live
`worldTime` beside it advances nothing. The adversary offers two routes and
correctly shows both are broken — re-deriving in the mounting view makes the
prop dead, and having the pill subtract an ETA violates the no-second-derivation
rule.

**Ruling: take neither. Anchor the derivation's output instead.** The derivation
exposes the ETA as an **absolute world-millisecond instant** (additively,
alongside the existing span), and the pill hands that instant, the served scale,
and the projected world time to `figure-formatting`'s `world-ms-span-left`
formatter. The countdown then advances because the *clock* moves, not because
anything re-derives state — and the arithmetic lives in the formatter, which is
exactly where link 1 put it and what the token exists for.

Decision 5's justification that there is "nowhere to read a live clock from" is
false and must be corrected in `design.md`, not merely worked around.

## F4 (MAJOR) — the staleness rule has no inducible trigger. ACCEPTED.

The staleness input is not in the closed props list and `status` is pinned
non-nullable, so tasks 3.1 and 3.5 are unsatisfiable as a pair. Add the
staleness flag to the closed props list. A closed list is a good mechanism; it
just has to actually contain everything the requirements need, and this is the
second input it was missing (the first was `scale`, round 1's BLOCKER 2).

## F5 (MAJOR) — "or rate" is false for the only rate the pill renders. ACCEPTED.

`stationKeepRateTonsPerSecond` is a served constant; requiring it to advance
against the projected clock contradicts its own sibling scenario's "never a rate
derived". The adversary calls it a two-word fix and it is: the advance rule binds
durations and the clock stamp, not rates.

## MINORs F6–F9 — ACCEPTED as written.

F6 (the props list disagrees with itself across four homes — fix all four, and
note that a value stated in four places is a value that will drift), F7 (the gate
host has no served type word — folds into F1's treatment), F9 (an empty chevron
menu conflating "failed refetch" with "owns no fleets").

**F8 deserves a note.** The clock's mandated advance now *requires* projecting at
an assumed scale of 1 in the `×—` state — which is RULING 1 of link 1's chain
(wall-clock = world-ms ÷ served scale; no served scale ⇒ absent) re-entering
through a repair, promoted from a flagged disagreement to a mandate. Resolve it
the way link 1 did: **with no served scale the stamp does not advance.** It
renders its `T+` portion with the absent suffix and holds, because there is no
honest rate at which to advance it. Do not project at 1.

## Round accounting and what round 3 must be

Round 2 of 3. One repair round follows, then **round 3 is the cap**. Its scope is
verification plus the clauses this repair touches — and the pill is now on its
sixth edit, so the convergence question is whether the repairs have stopped
generating new residue, not whether more can be found.

Standing rule for the cap: **BLOCKERs never ride forward.** If round 3 returns a
BLOCKER, this link stops and reports. MAJOR and MINOR residue at the cap becomes
a follow-up change, listed in the final report.

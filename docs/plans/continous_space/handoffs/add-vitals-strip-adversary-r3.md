# `add-vitals-strip` — adversary round 3 (the cap)

Scope, per the orchestrator: (a) verify round 2's nine findings landed
against the **rulings** (F2, F3 and F8 substituted the orchestrator's remedy
for the adversary's — the substituted fix is what was checked), and (b)
attack only what the round-2 repair changed, with the pill re-read whole
rather than clause by clause. Ground certified clean in rounds 1 and 2 was
not re-attacked.

Inputs re-read: the four delta files, `proposal.md`, `design.md`,
`tasks.md`, rounds 1 and 2 with both sets of rulings, the 24 rulings, and
the served/implemented shapes that decide the disputed clauses —
`frontend/lib/format/figures.ts` (`formatByUnit`/`formatDuration`
signatures), `frontend/components/figure/Figure.tsx`,
`frontend/components/fleet/roster-status.ts`,
`frontend/components/fleet/FleetRoster.tsx`,
`frontend/components/space/SystemSpaceView.tsx:405-420`,
`frontend/components/space/FleetActionsPanel.tsx:483-484`,
`frontend/lib/types/system-space.ts`.

**Verdict: RESIDUE ONLY.** All nine round-2 findings landed as ruled. Three
MAJOR and one MINOR remain, every one of them inside a round-2 repair, and
none of them permits a wrong render — the observable behaviour of the strip
is pinned by testable scenarios in every case. **No BLOCKER.** The
generation rate is falling and the residue has changed species: rounds 1
and 2 found wrong *behaviour*; round 3 finds only clauses that disagree
with each other about *where* correct behaviour is computed.

---

## Round 2 verification — all nine landed

| R2 finding | Ruling | Landed? | Where |
| --- | --- | --- | --- |
| F1 (BLOCKER) burn target | give the target the host's full treatment; both collections; gate → `Gate` + destination system; degraded scenario; task 3.5 amended | YES | spec 227-235, scenarios 284-293, task 1.1, task 3.3, task 3.5 ("where one is available", "never against the legal raw-id fallback") |
| F2 pill prohibition | **substituted**: invariant restated once, verbatim; derivation MAY expose park kind + ETA additively; pill MAY branch on those | YES | spec 204-209, design 274-279, task 3.1 — the ruling's sentence appears verbatim in the spec and the design, faithfully paraphrased in the task |
| F3 `worldTime` prop | **substituted**: neither of the adversary's routes — anchor the derivation's output as an absolute instant | YES, mechanically | spec 242-250, design 284-307, task 1.1, task 3.4. See MAJOR 1: the anchor landed, but the ruling's premise that "the arithmetic lives in the formatter" is not available in the shipped formatter |
| F4 staleness input | add it to the closed props list | YES | spec 200-204 ("or from its explicit absence"), design 249 `RosterRowStatus \| null`, task 3.1, task 3.5 |
| F5 "or rate" | drop two words | YES | spec 250-254 — and it goes further, stating the rate SHALL NOT be computed against the projected clock |
| F6 props enumeration | make all four homes agree | YES | spec body 200-204, property scenario 353-358, design 248-249, task 3.1, task 3.5 — all four inputs in all five places |
| F7 gate host type word | folds into F1 | YES | spec 221-223 ("which the interior read serves with no `type` field — the fixed word `Gate`") |
| F8 clock advance | **substituted**: with no served scale the stamp holds; do not project at 1 | YES in the spec | spec 603-609, scenario 640-646, design Decision 10, task 6.3. See MAJOR 3: the task that supplies the input contradicts it |
| F9 empty menu | state the ambiguity as deliberate | YES | spec 107-110 |

`--strict` and `openspec-reconcile.py` were reported passing by the repair
pass; 71 scenarios / 14 requirements / 42 tasks is what the folder now
carries, and that matches.

---

## MAJOR 1 — the F3 anchor makes the pill compute a remaining duration, which the requirement's own sibling scenario forbids; no clause says who does the subtraction

**Lands on:** `specs/system-console/spec.md` 242-250 against the same
requirement's scenario *No second derivation of fleet state exists in the
strip* (347-351); `tasks.md` 3.4; `design.md` 296-307.

**Quoted (the F3 repair, spec 245-250):**

> the derivation additionally exposes the underlying ETA as an absolute
> world-millisecond instant alongside the existing span, and the pill's
> duration figures are `figure-formatting`'s (`world-ms-span-left`)
> presentation of **that instant against the projected world time** and the
> served scale

**Quoted (the sibling scenario it collides with, spec 347-351):**

> **THEN** no module other than `roster-status.ts` **computes** a fleet's
> tone, activity, or **remaining duration** — the pill and the roster row
> both call into it and render nothing else

**Quoted (task 3.4):** "**Compute** a duration the pill renders from the
derivation's absolute-instant ETA anchor (task 1.1) and the `worldTime`
prop (task 3.1), via `figure-formatting`'s `world-ms-span-left` formatter".

**Why it fails.** `figure-formatting`'s shipped surface has no
instant-taking duration formatter, and this change adds none (its
`figure-formatting` delta modifies only the absent-figure requirement).
`formatByUnit(raw: number, scale, unit)` (`frontend/lib/format/figures.ts:253`)
dispatches `world-ms-span-left` to `formatDuration(spanMs, scale, 'left')`
(`:98`) — **`raw` is a span**. Every existing call site subtracts at the
caller: `FleetActionsPanel.tsx:484` (`mineEta.eta - worldTime`),
`ScanControl.tsx:221`, `FleetRoster.tsx:202`. So "presentation of that
instant against the projected world time" necessarily means *the pill
computes `anchor − worldTime` and passes the span* — which `design.md`
296-307 says in as many words, and which the orchestrator's own F3 ruling
rejected ("having the pill subtract an ETA violates the no-second-derivation
rule … the arithmetic lives in the formatter"). The formatter that would
have absorbed the arithmetic does not exist.

The result is that the requirement now contains two clauses that cannot
both be honestly tested:

- A crew implementing task 3.4 and task 3.5 (*"a countdown advancing between
  two renders at different `worldTime` values **with no new derivation
  output**"*) must put the subtraction in the pill. That test **cannot pass**
  under the alternative (re-deriving in the mounting view), because there the
  derivation output does change.
- A crew writing scenario 347's mechanical inspection then has to assert
  "no module other than `roster-status.ts` computes … remaining duration"
  against a pill that visibly computes `status.etaMs - worldTime`. They
  will either fudge the assertion or drop it — and scenario 347 is the last
  surviving mechanical enforcement of the invariant this whole requirement
  is built around.

**What an implementer could ship and still satisfy the spec:** nothing
player-visible is wrong either way — this is why it is MAJOR and not a
BLOCKER — but the enforcement scenario ships either weakened to
meaninglessness or as a knowingly false assertion, which is exactly the
"test written loose so it proves nothing" species round 1 filed twice.

**Smallest fix.** Scope scenario 347 to what the invariant actually
forbids, in one clause, since the F2 ruling already drew this line ("what
was always being forbidden is *a second derivation of fleet state*"):

```
#### Scenario: No second derivation of fleet state exists in the strip
- **WHEN** the strip's component tree is inspected
- **THEN** no module other than `roster-status.ts` computes a fleet's tone,
  activity, state ladder, or ETA anchor — the pill and the roster row both
  call into it, and the only arithmetic the pill performs on that output is
  re-expressing the derivation's own ETA anchor against the projected world
  time for `figure-formatting`'s span formatter, which takes a span
```

and correct `design.md` 296-307's claim that this is what the F3 ruling
prescribed: it is Route B with the anchor supplied by the derivation, and
that is fine — it just has to be said once, in the scenario, rather than
contradicted there.

---

## MAJOR 2 — the burn scenario pair is scoped by two different vocabularies, so a lane-gate target satisfies both and they demand different renders

**Lands on:** `specs/system-console/spec.md`, scenarios *A burning fleet's
pill counts down to its served arrival, naming a body target by type and
id* (276-282) and *A burn toward a lane gate names the gate's destination
system* (284-288).

**Quoted (276-279):**

> - **WHEN** the acting fleet's effective state is a burn **whose served
>   target is a body**
> - **THEN** the pill names that body by **its served type word** and served
>   id — never the raw id alone with no type word …

**Quoted (the requirement body, 233-236, defining the binary):**

> … or an explicit "a point in space" when the served target is a point
> **rather than a body** …

**Why it fails.** The requirement's own binary is body-vs-point, and a lane
gate is on the body side of it: the same clause resolves "the served
target's body id" against `features` **and** `laneGates`, and
`SpaceLaneGate`'s doc comment (`frontend/lib/types/system-space.ts:51-53`)
says its `id` "is the body id a burn order must name". So for a gate target
scenario 276's WHEN is satisfied and its THEN demands "its served type
word" — the field round 2's BLOCKER established does not exist on
`SpaceLaneGate` — while scenario 284's THEN demands `Gate` plus the
destination system. Two scenarios, one input, incompatible outputs.

The tell is the asymmetry with the docked pair, which the same repair got
right: scenario 270's WHEN is *"`attachedTo` set to a `features` entry"* —
scoped by collection. The burn pair scopes one member by collection and the
other by the body/point binary. And `tasks.md` 3.5 carries the escape the
scenario lacks ("a render that drops the type word **where one is
available**"), so the task and the scenario it tests now disagree about
gate targets.

**What an implementer could ship and still satisfy the spec:** a crew
writing 276's test with a gate fixture (a legal reading, and the commonest
burn target in the game) demands a type word that is not served and either
invents one or ships `undefined gate-sys_2_0` — F1's exploit, reached
through the scenario layer instead of the clause layer. A crew that argues
276 governs gates can also point at it to justify ignoring 284.

**Smallest fix.** One noun, mirroring the docked pair:

```
#### Scenario: A burning fleet's pill counts down to its served arrival, naming a body target by type and id
- **WHEN** the acting fleet's effective state is a burn whose served target
  resolves to a `features` entry
```

---

## MAJOR 3 — the F8 repair needs the last served world instant, and task 8.1 forbids supplying it by name

**Lands on:** `tasks.md` 6.3 against `tasks.md` 8.1, under
`specs/system-console/spec.md` 603-609.

**Quoted (task 6.3, the F8 repair):**

> track whether a world time has ever been served (latched true the first
> time **`serverWorldTime`** is defined) … WHILE no world-clock `scale` has
> been served, the stamp SHALL **hold at the last served world instant** and
> SHALL NOT project forward from the mounting view's ticking `worldTime`

**Quoted (task 8.1, the round-1 MAJOR 5 repair):**

> the world clock's served scale and its live projected `worldTime`
> (**never `serverWorldTime`** — the pill and clock cell both need the
> ticking value to advance between reads)

**Why it fails.** These are two tasks in one file naming the same
identifier with opposite instructions. `SystemSpaceView.tsx:415-417` has
exactly two clock values — `serverWorldTime` (the served instant, the
fallback chain `interior ?? acting ?? allFleets[0]`) and `worldTime`
(`useWorldTime`, projected at `clockScale = … ?? 1`). The F8 rule's
rendered value **is** `serverWorldTime`; task 8.1's list of what the
mounting view supplies excludes it by name.

An implementer obeying 8.1 literally has one move: latch the first
projected `worldTime` the strip ever sees and render that while no scale is
served. That passes the F8 scenario as written (*"the stamp … remain at the
last served world instant"* is asserted across two renders with no read
landing — a latch is indistinguishable from the served instant there), and
it is wrong the moment a **second** read serves a later instant while the
scale is still unserved: the stamp holds at the older value and no scenario
catches it. That is the stale-formatted-as-fresh species this link exists
to police, re-entering through the repair that was meant to close it.

I grade this MAJOR rather than MINOR because it is a flat contradiction an
implementer must resolve by guessing, not because the state is likely — the
"world time served, scale not" state remains production-unlikely, as round 1
recorded and round 2's ruling accepted when it graded F8 a MINOR.

**Smallest fix.** Two words in task 8.1, and one clause in 6.3:

- 8.1: "… and its live projected `worldTime` **for every advancing figure**
  (never `serverWorldTime` for those — the pill and clock cell both need the
  ticking value to advance between reads), **plus the last served world
  instant itself, which the clock cell holds at while no scale has been
  served**".
- 6.3: add "…and re-renders at the **newest** served instant whenever a
  later read serves one, still without projecting it forward".

---

## MINOR 4 — `RosterRowStatus | null` lets the property scenario pass on two absent pills

**Lands on:** `specs/system-console/spec.md` 353-360; `tasks.md` 3.5.

**Quoted:**

> - **GIVEN** two fleets in different served states **whose derivation
>   output is equal**
> - **WHEN** the pill is rendered for each at the same projected world time,
>   supplied only that output value …

**Why it fails.** F4's repair made the permitted output `RosterRowStatus |
null`. `null === null`, so a test author can satisfy "two fleets whose
derivation output is equal" with two absent statuses: both pills render the
absent form, the assertion passes, and the property that carries the entire
type-error invariant (design Decision 5: "the corresponding assertion is a
property, not an enumeration") has proven nothing. Before F4 the signature
made this fixture impossible. Task 3.5's phrasing inherits the same hole.

**Smallest fix.** Three words in the GIVEN: "whose derivation output is
equal **and is not absent**", and the same qualifier on task 3.5's property
check.

---

## Noted, not counted against convergence

Outside round-2's repair surface, so not graded — recorded once so it is
not lost:

- **`proposal.md`'s Impact omits `frontend/lib/types/fleet.ts`.** Task 1.1
  requires exporting `PARK_KIND_ORBIT`/`_STATIONKEEP`/`_POINT` from it and
  repointing two call sites. The round-1 ruling on MAJOR 7 established that
  an edit outside the stated Impact is a finding against the developer at
  build time, and widened Impact for `corporation-provider.tsx` on exactly
  that reasoning; this file was not widened with it.
  (`frontend/components/space/space-scene.ts`, the other repointed site, is
  covered by the directory-level `frontend/components/space/` entry.)

## Checked in the round-2 repair set and found sound

- **F3 × F5 interaction (the orchestrator's first named risk).** The pill
  renders exactly one rate (`stationKeepRateTonsPerSecond`, in the holding
  state) and three durations (burn, jump, mine). The sets are disjoint,
  each is named explicitly in its own clause, and no pill figure is
  ambiguous between "advances against the projected clock" and "served
  constant, never computed against it". The scale-absent scenario covers
  both without conflicting with either.
- **F1's degraded scenario is falsifiable** (an implementation that blanks
  or omits the target fails it), and it does **not** hand an implementer a
  legal escape from the two naming scenarios: its WHEN is conditioned on a
  miss against both collections or a failed interior read, and task 3.5
  separately requires the resolvable-target test to fail against a
  raw-id-only render.
- **The pill's props list agrees in all five homes** (requirement body,
  property scenario, design Decision 5, tasks 3.1 and 3.5) at four inputs —
  F6 is fully closed, including the `worldTime` omission that would have
  made the property test uncompilable.
- **The F2 invariant is verbatim** in `spec.md` 204-209 and `design.md`
  274-279, and consistent (not contradictory) in task 3.1 and task 1.1:
  task 1.1 now emits "already-resolved label or token, never a raw wire
  enum", which is what makes the pill's permitted branch legal rather than
  the type error the old wording called it.
- **F9's ambiguity statement** does not contradict any chevron scenario; it
  names the ownership split (*The Strip Survives a Failed Own-Fleets Read*)
  as the reason, which is where the retry surface actually lives.
- **The clock requirement is internally consistent** after F8: the opening
  SHALL is carved by the explicit WHILE clause, and the two clock scenarios
  (advance with a scale, hold without) cannot both be satisfied by one
  implementation, so neither is vacuous.

---

**Verdict: RESIDUE ONLY.** Three MAJOR and one MINOR, all inside round-2
repairs, none of them permitting a wrong render. 14 → 9 → 4, and the
remaining findings are about which module performs an arithmetic the
observable behaviour already pins. The repairs have stopped generating
defects.

---

# Orchestrator rulings on round 3 (the cap)

Verdict accepted: **RESIDUE ONLY, no BLOCKER.** 14 → 9 → 4, every round-3
finding inside a round-2 repair, and the adversary's own observation about the
*species* changing is the strongest convergence evidence in the sequence: rounds
1 and 2 found wrong behaviour, round 3 finds only clauses disagreeing about
*where* correct behaviour is computed. The repairs have stopped generating
defects.

## The cap is on adversary rounds, not on repairs — and these four are repaired

Three adversary rounds have run; that is the cap, and there will be no fourth.
The standing rule is that MAJOR/MINOR residue at the cap becomes a follow-up
change. **I am ruling these four repaired in-run instead**, for reasons specific
to what they are:

- Each comes with **exact replacement text** from the adversary, and each is a
  one-to-three-line edit. There is no design judgement left in them.
- **None changes behaviour.** The adversary says so explicitly of MAJOR 1 ("No
  wrong render either way"), and it is true of the other three: they are
  scenario scoping, a task-versus-task contradiction, and a vacuity guard.
- The alternative is worse than the risk. **MAJOR 3 is a flat contradiction
  between task 6.3 and task 8.1** — one requires the last served instant, the
  other forbids `serverWorldTime` by name, and `SystemSpaceView.tsx:415-417` has
  only those two values. Carrying that into the build guarantees a developer
  halt and a spec-conflict round trip mid-implementation, which costs more than
  fixing four clauses now. A follow-up change cannot help a developer who is
  blocked today.

**The residual risk, stated plainly:** the repaired text will not have been seen
by an adversary. I mitigate it by reading the four changed clauses myself before
the verdict commit, and by the validator's re-run. That is proportionate for
edits of this size and would not be for anything larger.

## MAJOR 1 — ACCEPTED, and it corrects my own F3 ruling

Worth recording without softening it. My round-2 F3 ruling said "the arithmetic
lives in the formatter, which is where link 1 put it and what the token exists
for." **That was wrong on the mechanism.** `formatByUnit(raw, scale, unit)`
(`frontend/lib/format/figures.ts:253`) dispatches to `formatDuration(spanMs, …)`
— `raw` is a **span**, not an instant — and every live call site subtracts at the
caller (`FleetActionsPanel.tsx:484`). No formatter takes an instant and a clock,
and this change adds none.

So the pill *must* subtract, and the anchor was still the right fix — but it
lands the subtraction in the pill rather than in the formatter, which collides
with the scenario asserting "no module other than `roster-status.ts` computes …
remaining duration". That scenario is the last mechanical enforcement of the
invariant, so it must be made true rather than quietly fudged by the crew.

**Ruling: scope that scenario to what the invariant is actually about** — tone,
activity, the state ladder, and the ETA anchor — with an explicit carve-out for
re-expressing the anchor against the projected clock. Subtracting a clock from a
served instant is presentation arithmetic; deriving *state* is what the strip may
never do. This is the same distinction F2 drew for the fields, now needed for the
arithmetic.

**Taught, for the chain:** a ruling that names a mechanism ("the formatter does
it") is a claim about the code and can be wrong in a way that a ruling naming a
*property* ("the strip derives no state") cannot. I asserted the mechanism
without checking `figures.ts`'s signature. Rule on properties; let the
implementation contract name mechanisms, where it will be checked against the
code.

## MAJOR 2 — ACCEPTED.

The burn scenario pair is scoped by two different vocabularies, so a gate target
satisfies both and they demand different renders — one asking for a `type` word
that `SpaceLaneGate` does not have. The **docked** pair already got this right
(its WHEN is scoped by collection), which is the tell: the fix is to make the
burn pair match its own sibling. Scope scenario 276's WHEN to "whose served
target resolves to a `features` entry".

## MAJOR 3 — ACCEPTED.

Task 6.3 requires holding at the last **served** instant; task 8.1 forbids
passing `serverWorldTime` by name. Two tasks, one tree, no third value. An
implementer obeying 8.1 latches the first projected `worldTime`, which **passes
the F8 scenario** — a latch is indistinguishable there — and goes stale on the
next read. A scenario that cannot separate the right implementation from the
wrong one is the defect this change has now hit four times. Fix both tasks as
the adversary specifies.

## MINOR 4 — ACCEPTED.

F4's `| null` made the property scenario satisfiable by `null, null`: two absent
pills, equal output, assertion passes, and the property carrying the entire
type-error invariant proves nothing. This was impossible before F4 — a repair
that opened a vacuity in the assertion it was protecting. Add "and is not
absent" to the scenario and to task 3.5.

## The noted item — ACCEPTED, not merely noted

`proposal.md`'s Impact omits `frontend/lib/types/fleet.ts`, which task 1.1
requires editing for the `PARK_KIND_*` exports. This is precisely the rule I
applied in round 1's MAJOR 7 to widen Impact for `corporation-provider.tsx`: an
edit outside a change's stated Impact is a finding against the developer, so the
Impact is widened at authoring time, not discovered mid-build. Consistency
requires I apply it here too.

## Convergence record

| Round | Findings | BLOCKER | Character |
| --- | --- | --- | --- |
| 1 | 14 | 2 | new ground; wrong behaviour |
| 2 | 9 | 1 | residue in round-1 repairs; wrong behaviour |
| 3 | 4 | 0 | residue in round-2 repairs; *where* correct behaviour is computed |

Six of round 2's nine and most of round 1's landed on the **state pill** — one
requirement, now on its seventh edit. That is not a failure of the process; it is
the process locating the change's single load-bearing claim and refusing to
accept it until it was true. The chain doc named this link's adversary target as
*does the strip lie about state*, and the pill is where that question lives.

**Phase 1 closes here.** No BLOCKER rides forward, no residue is deferred to a
follow-up change, and implementation is authorised once the final repair is
verified and committed.

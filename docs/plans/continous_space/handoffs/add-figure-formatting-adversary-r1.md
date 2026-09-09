# add-figure-formatting — adversary round 1

Change: `openspec/changes/add-figure-formatting/` (link 1 of
`docs/plans/system-hud/chain.md`, `/team --chain --full-auto`).
Attacked against: `docs/plans/system-hud/chain.md`, `docs/plans/system-hud.md`,
the 18 FULL-AUTO rulings, the design analysis, and the three panel reports.
Read-only pass; nothing was edited.

**Verdict: findings requiring repair — 5 BLOCKER, 9 MAJOR, 5 MINOR.**

`openspec validate --strict` and `openspec-reconcile.py` both pass (re-run in
this session). A mechanical body-diff of all 16 MODIFIED requirement bodies
against their live originals came up **clean** — see *What was checked and
found sound*. The kills are elsewhere: three of them are internal
contradictions inside `figure-formatting`'s own scenarios that make the R13
fixture table unbuildable as specced, one is a bypass that lets the change
ship the exact defect it exists to remove, and one is an incomplete repair of
panel finding F5.

---

## BLOCKER 1 — R1's flagship scale scenario contradicts R2's unit rule; the fixture table cannot hold both

**Where.** `specs/figure-formatting/spec.md:14-16`:

> #### Scenario: A time-warped world divides the span by its scale
> - **WHEN** 252,000 world-ms are formatted at scale 60
> - **THEN** the result reads `4s`, not `4m 12s`

and `:32-39` (R2):

> The system SHALL present a wall duration as `Nm Ss` below one hour … A
> duration below one second SHALL round to `0m 0s`.

plus R2's own `:53-55` "Exactly one minute … never `60s`" and `:65-67`
"Sub-second durations round to zero … `0m 0s`".

**Why it matters.** 252,000 ÷ 60 = 4,200 ms = 4.2 s. Under R2 that is
`0m 4s`. R1 says `4s`. Both are SHALL-level, both become rows in the
`(raw, scale, expected)` table task 2.1 builds, and they disagree on the one
row that pins RULING 1 — the ruling the whole capability turns on. An
implementer picks one and the other requirement is false on the day it lands;
worse, `4s` is exactly the bare-seconds shape `lib/eta.ts` used and R2 exists
to end (R2 forbids `60s` by name for the same reason).

**Smallest fix.** Change R1's expected string to `0m 4s`, keeping "not
`4m 12s`" as the point of the scenario:

```
- **THEN** the result reads `0m 4s`, not `4m 12s` — the span is divided
  before the unit pair is selected
```

(Provenance note: the `4s` string was carried verbatim from
`add-figure-formatting-analysis.md:164`, written before R2's unit-pair rule
was authored. No ruling touches it, so this is not a ruling re-argument.)

## BLOCKER 2 — R9's `60.0 t/min` scenario contradicts R9's own second→minute→hour walk

**Where.** `specs/figure-formatting/spec.md:286-290` (the requirement, as
repaired per architect finding #1):

> …a wall-clock time unit chosen by walking the ladder second → minute → hour
> and stopping at the first unit in which the converted magnitude is at least 1

and `:313-316`:

> #### Scenario: A world-per-millisecond rate is converted
> - **WHEN** `roster.miningRate` of 0.001 tons per world-millisecond is
>   formatted at scale 1
> - **THEN** the result reads `60.0 t/min`

**Why it matters.** By design.md's own pinned conversion
(`tons per wall-second = tonsPerWorldMs × 1000 × scale`), 0.001 × 1000 × 1 =
**1.0 t/s**. The walk stops at the first unit whose magnitude reaches 1, and
the per-second magnitude is exactly 1.0 — so the walk yields `1.0 t/s`, not
`60.0 t/min`. R9's *own* adjacent scenario `:305-311` makes this explicit:
"a rate whose per-second magnitude is 1.0 … renders in `t/s`, since the walk
stops at the first unit to reach 1". The two scenarios are in direct
contradiction at the exact boundary value, and this is the mining rate — the
figure links 2a and 4 both re-render. Architect finding #1 rewrote the
requirement paragraph from "largest" to the walk but did not revisit this
inherited `[INFERRED]` scenario (`add-figure-formatting-analysis.md:306`), so
this is a round-1-repair leftover, not a ruling re-argument.

**Smallest fix.** Either restate the expected string as `1.0 t/s`, or move
the scenario off the boundary (e.g. 0.0005 t/world-ms → `30.0 t/min`) so it
still demonstrates the world-ms conversion without colliding with the
threshold scenario. The first is preferable: the `t/s` rung then has two
pinned rows instead of one.

## BLOCKER 3 — four arrival figures are specced to carry "its raw served value" while R11 mandates a duration's raw be a span; the served value is an instant

**Where.** `specs/system-space-view/spec.md:11-14`:

> The arrival time, delta-v cost, and fuel cost are each presented per
> `figure-formatting` (arrival as a relative duration at the mounting view's
> served scale …) and each carries its own raw served value.

`:105-109` (the drift notice's actual arrival and previewed arrival "each
rendered in its own element carrying its own `figure-formatting` raw value"),
and `:421-423`:

> The arrival time is presented per `figure-formatting` as a relative duration
> and carries its raw served value on its element…

against `specs/figure-formatting/spec.md:388-391`:

> A duration's raw value SHALL be its unscaled world-millisecond span, so a
> test can assert against the served stamp arithmetic without reading the
> scale.

**Why it matters.** The served values here are absolute instants, not spans:
`SpaceCommandPanel.tsx:210` renders `preview.arriveMs`, and `:126-131` stores
`burn.ArriveMs` / `quoted.arriveMs`. A "relative duration" of those requires
subtracting the view's projected world time — a client-derived span. So the
two clauses demand *different numbers in the same attribute*, and R11's own
"a duration's span and an absolute instant SHALL NOT share a token" leaves
no legal `data-unit` for "an instant rendered as a countdown". An implementer
who reads "raw served value" literally puts a ~2.1×10¹⁰ world-ms stamp in
`data-raw`; the journey (task 12.1) and `SpaceCommandPanel.test.tsx` (task
9.2) then pin whichever they happened to get, and a later `data-raw <= 0`
due-assertion of the shape task 10.2 introduces silently never fires — the
identical failure mode architect finding A7 caught for the four countdown
sites. A7's repair fixed the roster row, the sweep countdown and the mine
preview/countdown, and explicitly said "Tonnage, credit, range, delta-v and
rate figures keep 'raw served value'". The arrival figures are durations and
were missed by both.

**Smallest fix.** Apply A7's own replacement wording at these four sites:
"and carries its raw remaining span in unscaled world-milliseconds", plus one
sentence naming what the span is measured against — "the span from the view's
projected world time to the served `arriveMs`" — so the drift notice's
previewed-vs-actual pair is comparable.

## BLOCKER 4 — the `<Figure text>` bypass is still open: `String(raw)` satisfies every R12 scenario

**Where.** `specs/figure-formatting/spec.md:448-457` (R12, as rephrased per
RULING 17) and its four scenarios `:459-486`. Design.md's `<Figure>` takes
`{ raw, unit, text }` where `text` is an arbitrary string.

**Why it matters.** RULING 17 correctly demands the rule bind by "what
produced the string". But the only **observable** scenarios remain three
named mechanisms — `toFixed`, a local `countdown`/`formatEta`, `lib/eta.ts`'s
existence — plus one whose THEN is a restatement of compliance ("**THEN**
that call site does not satisfy this requirement"), which no test can fail
on; and tasks.md 11.1 narrows the guard further to "template-literal
interpolation of a numeric expression". A malicious (or merely tired, at call
site 20 of ~25) implementer writes:

```tsx
<Figure raw={roster.cargo.fuel} unit="tons" text={String(roster.cargo.fuel)} />
```

No `toFixed`. No local formatter. No template literal. `lib/eta.ts` is gone.
Every R12 scenario passes green, R11 passes (the raw is present and correct),
and the screen reads `47.23519999999999` — fault #1 of
`docs/plans/system-hud.md`, shipped inside the change that exists to remove
it. This is the same shape as handoffs README lesson two, which RULING 17
itself cites.

**Smallest fix.** One scenario that ties text to the module, checkable
generically over every rendered figure because both operands are already on
the element:

```
#### Scenario: A rendered figure's text is the module's own output for its raw value
- **WHEN** any element carrying `data-raw` and `data-unit` is rendered
- **THEN** its text content is byte-identical to the string the shared
  module's function for that `data-unit` returns for that `data-raw` (and
  that quantity's other stated arguments), so no call site can produce a
  figure's text by any other means and still pass
```

This closes the hole by construction for all ~25 sites and needs no new
mechanism — the guard suite and the vitest migration can both assert it.

## BLOCKER 5 — RULING 8's absent-scale rule is pinned on one surface out of six, and is undefined for absolute stamps

**Where.** The only scenario is `specs/fleet-roster/spec.md`'s "A countdown
renders absent until a scale is served". Nothing equivalent exists for
`system-space-view`'s preview arrival, running-sweep countdown, scan-target
durations or ghost `asOf`, nor for `docked-fleet-actions`'s mine
preview/countdown or station-keeping rate, nor for `sighting-log`'s row
stamps. design.md (`:166-200`) simultaneously **keeps** a live
`servedScale ?? 1` in `SystemSpaceView.tsx:405` for the clock projection.

**Why it matters (two ways).**

1. `SystemSpaceView` is the mounting view for five of the six figure
   surfaces, and after this change it holds two scale values one line apart —
   one defaulted, one not. Passing the defaulted one to `FleetActionsPanel`,
   `ScanControl`, `SightingLog` or `SpaceStage` satisfies every scenario in
   the change and silently reinstates the assumption RULING 8 removed, wrong
   by a factor of the scale with nothing marking it. That is precisely the
   failure UX F5 filed ("has no testable scenario **anywhere**"); the repair
   reached the roster only, which is the one surface where the risk is
   *lowest* (its mount is explicitly given a scale by task 6.3).
2. **For absolute stamps the behaviour is not merely unpinned, it is
   undefined.** R4 (`:112-118`) mandates the `×N` suffix on *every* stamp
   (RULING 16 made this universal on purpose). RULING 8 says an unserved
   scale renders absent. `sighting-log`'s standing requirement says each row
   "SHALL show the record's system, its `asOf`, and the raw host id". With no
   served scale an implementer must either drop a mandated row field or ship
   a suffix-less stamp — the spec sanctions neither, and `SightingLog.tsx`
   takes no `worldTime`/`scale` prop today, so this is the likely path.

**Smallest fix.** One requirement in `figure-formatting` rather than six
per-surface scenarios — it is a cross-surface rule, which is RULING 2's whole
premise:

```
### Requirement: A Figure Whose Clock Scale Has Not Been Served Reads as Absent
WHEN a mounting view has not received a served world-clock scale, every
figure whose presentation depends on that scale — a relative duration, a
rate, and an absolute `T+` stamp's `×N` suffix — SHALL render the absent form
rather than being computed or suffixed at an assumed scale of 1, and SHALL
still carry its `data-raw` (the value is known; only the scale is not).
IF the surface's own requirement mandates that the field be shown, THEN the
absent form is what it shows.
```
plus one scenario per clock-dependent quantity. That also settles the stamp
case one way instead of leaving it to the build.

---

## MAJOR 1 — two R4 scenarios drop the mandatory `×N` from their expected strings

**Where.** `specs/figure-formatting/spec.md:130-136`: "`T+ 3d 04:05`" and
"`T+ 0d 00:00`", against the requirement at `:112-115` ("with the served
scale appended as `×N`") and `:138-141` ("A scale of exactly 1 still renders
its suffix").

**Why it matters.** RULING 16 made the suffix universal and rejected every
carve-out. These two scenarios are the fixture rows for zero-padding and for
the zero stamp, and as written they pin suffix-less strings — an implementer
who satisfies them literally violates R4's own rule and RULING 16.

**Smallest fix.** `T+ 3d 04:05 ×1` and `T+ 0d 00:00 ×1` (or whatever scale
the row supplies), and state the scale in each WHEN.

## MAJOR 2 — R4's accessible-explanation scenario has no task and no mechanism to hang on

**Where.** `specs/figure-formatting/spec.md:148-152` (the scenario RULING 16
names as *the* remedy for the `×N` repetition problem: "the element carries
an accessible label or title stating that the world clock is running at N
times real time"). No task in tasks.md implements it (grep for
`accessible|aria|title` returns only unrelated hits), and design.md's
`<Figure>` contract (`:80-88`) closes the prop set: "Its props are `raw`,
`unit`, `text`, and pass-through `className` + `data-testid` **only**".

**Why it matters.** The one requirement RULING 16 added is the one with no
delivery path. An implementer following design.md cannot pass a `title` or
`aria-label` through `<Figure>`; an implementer following the spec must widen
the prop set the design deliberately froze. Either way the ruling's remedy
ships missing or the design's constraint is broken silently, and nothing in
the red-phase coverage table will notice because no task names it.

**Smallest fix.** Add a task ("`<Figure>` accepts an optional accessible
description, emitted as `title`, used by the absolute-stamp call sites for
the `×N` suffix") and one sentence in design.md's `<Figure>` decision
admitting that prop as the single exception, with the reason.

## MAJOR 3 — R3 does not say which affix a surface takes, and three deltas call cost magnitudes "relative durations"

**Where.** R3 (`:77-83`) states three affixes — `in` (future), `left`
(remaining), `ago` (past) — with no rule mapping a call site to one; "future"
and "remaining" are not distinguishable properties of a span. Meanwhile
`specs/system-space-view/spec.md:122-125` calls the scan target list's
**served sweep duration** "a relative duration", and
`specs/docked-fleet-actions/spec.md`'s *Mine ETA Preview* calls the
**previewed run duration** the same.

**Why it matters.** `t.durationMs` (`ScanControl.tsx:290`) and
`tonnage ÷ miningRate` are *magnitudes* — the cost of an action not yet
taken. Rendering them "in 2m 30s" or "2m 30s left" is wrong in two different
ways, and both satisfy the delta as written. Conversely nothing stops the
burn preview's arrival reading "4m 12s left" while the running sweep reads
"in 2m 40s". Every one of these is an exact-string assertion in the migrated
tests, so the divergence is not cosmetic — it is what the tests get pinned to.

**Smallest fix.** In R3, state the mapping as the rule rather than leaving it
to the scenarios: a countdown to an event that has not started takes `in`; a
running order's remainder takes `left`; a past instant takes `ago`; **a
duration that is a cost or an estimate rather than a position in time takes
no affix** (and add the bare-form scenario). Then change the two cost sites'
delta wording from "as a relative duration" to "as a duration, with no
direction affix".

## MAJOR 4 — the due form's text is unpinned while every other quantity pins an exact string

**Where.** `specs/figure-formatting/spec.md:98-100`: "**THEN** the result
reads as due, with no unit pair and no sign" and `:102-105` "both render the
identical due form".

**Why it matters.** R13 requires every rule to be pinned by a
`(raw, scale, expected)` fixture row, and this row has no `expected`.
`due`, `now`, `Settling…`, `—` and `0m 0s` all satisfy the scenario;
`scan-lane-transit-fizzle.spec.ts` asserts the literal `'now'` today and task
10.2 is rewriting it precisely because the copy is about to change. The
absent form got a pinned glyph (`—`) for exactly this reason; the due form
did not.

**Smallest fix.** Pin the literal in R3 ("the due form is the text `due`")
and note that a surface whose own requirement mandates different copy —
`system-space-view`'s running sweep says "settling" — overrides it, the same
override shape R10's last scenario already uses for the credit balance.

## MAJOR 5 — the fuel ceiling: a figure the design doc names, reformatted by a task, with no delta on its covering requirement

**Where.** `docs/plans/system-hud/chain.md:79-81` lists link 1's
`SpaceCommandPanel` figures as "arrival, Δv, fuel, **ceiling**, the
committed-vs-previewed line". tasks.md 4.1 renders `preview-fuel-ceiling`
through `<Figure>`. The requirement that covers it —
`system-space-view`'s *A Burn Commit Is Quote-Locked to the Preview the
Player Agreed To*, scenario "The ceiling the player agrees to is the one
displayed" (`openspec/specs/system-space-view/spec.md:609-612`) — takes **no**
delta, and proposal.md's affected-specs list does not mention it.

**Why it matters.** This is the change's own doctrine applied inconsistently:
sixteen other reformatted figures each got a copy clause in their covering
requirement, and this one — named by the design document — did not. The
ceiling's raw-value contract is therefore unstated (it is a client-derived
`fuelCostTons × BURN_FUEL_ALLOWANCE`, so "raw served value" would be wrong
for it too), and the e2e helper rewrite in task 10.1 has no spec to target
for it.

**Smallest fix.** One sentence on that requirement — "The displayed ceiling
is presented per `figure-formatting` as a tonnage and carries its raw
client-derived value" — plus its scenario clause and a line in proposal.md's
MODIFIED list (7 requirements on `system-space-view`, not 6).

## MAJOR 6 — no task derives the un-defaulted `servedScale` or threads it to four of the six consumers

**Where.** tasks.md threads scale in 4.4 (`SpaceCommandPanel`), 6.1/6.3
(`FleetRoster` + its `GalaxyView` mount) and mentions it in 6.4. There is no
task for design.md's central call-site decision (`:166-200`) — "the view
derives **one** value, `servedScale: number | undefined` … and passes that to
the six figure-rendering children" — and none for the `scale` prop on
`FleetActionsPanel` (needs it for the mine countdown **and** R9's rate),
`ScanControl` (option durations, `scan-countdown`), `SightingLog` (which
takes no clock prop at all today and needs the scale for `×N`) or
`SpaceStage` (arrival duration **and** the ghost/facts `T+` stamps).

**Why it matters.** R1 and R9 make the scale a *required* argument, so four
components physically cannot compile their formatter calls without it. An
implementer working the task list will reach for the value already in scope —
`servedScale ?? 1` at `SystemSpaceView.tsx:405` — which is BLOCKER 5's
exploit, arrived at by following tasks.md faithfully.

**Smallest fix.** One task before section 4 ("`SystemSpaceView` derives
`servedScale: number | undefined` — the existing fallback chain without the
`?? 1` — and passes it beside `worldTime` to `SpaceStage`,
`SpaceCommandPanel`, `FleetActionsPanel`, `ScanControl`, `SightingLog` and
`FleetRoster`; `useWorldTime` keeps `servedScale ?? 1` unchanged") and a
`scale` prop line in 5.x, 7.x and 8.1.

## MAJOR 7 — R13's no-ambient-state scenario is stated as a two-process comparison, which no test can run

**Where.** `specs/figure-formatting/spec.md:506-509`:

> - **WHEN** the same arguments are passed to any exported formatting
>   function twice, in two separate processes
> - **THEN** both calls return the identical string

**Why it matters.** Architect A11 flagged R13's scenarios as unobservable and
the mechanism was recorded in design.md (`:242-257`: the module names no
`Date`, `performance`, `Math.random`, `Intl` or `toLocaleString`), but the
**spec text was not repaired** — it still describes an experiment a vitest
suite cannot perform. A tester will write the tautology (call it twice in one
process, get the same string) and the scenario passes green against a module
that reads `Date.now()`, which is handoffs README lesson two verbatim. Note
also that `toLocaleString`/`Intl` are forbidden **nowhere in the spec** —
only in design.md — while R7 and R8 both need thousands grouping.

**Smallest fix.** Replace the scenario with the static assertion the design
already specifies:

```
#### Scenario: The module names no ambient source
- **WHEN** the presentation module's source is inspected
- **THEN** it names none of `Date`, `performance`, `Math.random`, `Intl`, or
  `toLocaleString`, so its output cannot vary with the clock, the machine, or
  the ambient locale
```

## MAJOR 8 — nothing in the spec bounds the guard's exception list, so it can absorb the next violation and stay green

**Where.** R12's scenarios (`:459-467`) say "no component calls `toFixed` on
a player-facing figure of a quantity this capability defines". The
implementable rule lives only in design.md/tasks 11.1: "no `.toFixed(` …
except an explicit `KNOWN_EXCEPTIONS` list", two entries.

**Why it matters.** The spec's predicate ("a quantity this capability
defines") is not mechanically decidable, so the guard necessarily implements
a broader ban plus an exception list — and **no requirement constrains what
may enter that list**. A later change that wants `toFixed(1)` on a tonnage
adds a third entry and the suite stays green while R12 is false. design.md's
anti-vacuity trick (assert each exception still exists) catches a *removed*
site, not an *added* one. RULING 10 is not being re-argued here: the two
recorded exceptions are correct and R12's scoping does exclude
`SpaceStage`'s bearing and speed cleanly (neither is a quantity this
capability defines — a bearing in degrees and an unlabelled speed appear in
no rules table). The hole is the list's growth, which the ruling did not
address.

**Smallest fix.** One scenario:

```
#### Scenario: The rounding exception list holds only quantities this capability does not define
- **WHEN** the enforcement suite's exception list is inspected
- **THEN** every entry is a figure of a quantity this capability defines no
  rule for, or a non-player-facing value, each recorded with the ruling or
  requirement that permits it — an exception naming a tonnage, duration,
  range, delta-v, credit, rate, or stamp is itself a violation
```

## MAJOR 9 — R11's element-vs-string boundary is contradicted in two amended requirements

**Two instances of the same defect.**

**(a) The ghost `asOf`.** `specs/system-space-view/spec.md:316-321` says the
label "carries its raw served value **wherever it is rendered — on the mark
itself** and on its facts surface", then immediately: "A label rendered into
a screen-reader-only element carries the formatted text but no
`data-raw`/`data-unit` attribute". The mark's *only* `asOf` label **is**
screen-reader-only (`SpaceStage.tsx:693`:
`<span className="sr-only">Observed at {mark.asOf}</span>`), so the two
sentences contradict each other about the same element. It also cites
"`figure-formatting`'s toast/aria-label exemption" for a case that exemption
does not cover: R11 (`:441-446`) exempts a figure "rendered into a toast
message or an `aria-label` string **rather than as its own DOM element**" —
an `sr-only` span *is* its own DOM element and could carry the attributes.

**(b) The burn-commit arrival.** `:421-423` requires the arrival to carry
"its raw served value **on its element**, never interpolated as a raw
world-millisecond integer into the toast string" — but the success feedback
*is* a toast (`SpaceCommandPanel.tsx:135`, and tasks 4.2 keeps it a string),
which R11 and RULING 12 exempt from attributes by name.

**Why it matters.** An implementer cannot satisfy both readings; whichever
they pick, a reviewer reading the other requirement will call it a defect.
(b) additionally makes R12's canonical scenario ("A raw wire number does not
reach copy") and this clause disagree about what the toast is.

**Smallest fix.** (a) Delete "on the mark itself" from the first sentence and
extend R11's exemption explicitly to screen-reader-only labels, or keep the
attribute on the sr-only span and delete the second sentence — either is
fine, but only one may stand. (b) Replace "carries its raw served value on
its element" with "…is presented per `figure-formatting`; the toast is a
string-only surface and carries no attribute, per R11".

---

## MINOR 1 — "raw served value" on a client-derived tonnage

`specs/docked-fleet-actions/spec.md`'s hold readout says used capacity
"carries its raw served value", but `cargoUsed = (roster.cargoCapacity ?? 0)
- freeHold` (`FleetActionsPanel.tsx:318`) is derived on the client from two
served fields. Same shape as A7, tonnage half. Fix: "its raw value" for the
used figure; "raw served value" is right for capacity and free hold.

## MINOR 2 — proposal.md's affected-code list omits the new `<Figure>` component

`proposal.md:76-83` lists `frontend/lib/format/` (new) but not
`frontend/components/figure/Figure.tsx`, which design.md creates and task 1.9
builds — the single most-mounted new file in the change.

## MINOR 3 — design.md cites "RULING 1–15" twice; there are 18

`design.md:16` and `:470`. tasks.md 11.1 already cites RULING 17, and
RULING 16's label requirement and RULING 18's no-split decision are nowhere
in design.md's rulings basis line. Cheap to fix, and stale basis lines are
how a later reader misses that a ruling exists.

## MINOR 4 — two R9 scenarios cannot become fixture rows as written

`:301-303` ("a wall-clock rate too small to reach 1 t/min") supplies no
input value, and `:334-339` pins the too-small-to-show case only "for example
`<0.1 t/h`". R13 requires every rule to be pinned by a table row; both need a
concrete `(raw, scale, expected)`.

## MINOR 5 — task 7.3's line reference points at a RULING 10 exclusion

tasks.md 7.3 names "`SpaceStage.tsx:709`'s visible `sighting-facts`
'Observed at' line". Line 708 is the `Observed at` line; **709 is
`Bearing {heading.toFixed(0)}°`**, one of the five sites RULING 10 excludes
by name (the ruling itself cites "663, 664, 709, 710, 828"). An implementer
following the line number edits the excluded site.

---

## What was checked and found sound

- **MODIFIED body fidelity (the priority-1 attack).** All 16 MODIFIED
  requirement bodies were diffed clause-by-clause against their live
  originals in `openspec/specs/` with a normalising differ. **No sentence was
  dropped, reworded, or reordered**; every change is a pure insertion of a
  `figure-formatting` clause, and every scenario heading and body survives
  verbatim (including the ~60-line *Focused-Scan Target List* and its ten
  scenarios). The requirement counts match the proposal (6/7/2/1).
  `validate --strict` and `openspec-reconcile.py` both pass.
- **Deletion coverage.** `grep` confirms exactly two `lib/eta.ts` callers
  (`FleetRoster.tsx:41,199`, `SpaceStage.tsx:40,821`) and exactly two local
  `countdown()` definitions (`FleetActionsPanel.tsx:72`, `ScanControl.tsx:75`);
  tasks 3.1/3.2 name all four, there is no `lib/eta.test.ts` to orphan, and
  R12's "The retired module is gone" scenario pins the deletion so a later
  change cannot reintroduce it quietly.
- **Panel repairs that hold.** A5 (whole-tree guard), A6/F5 (roster
  absent-scale — *partially*, see BLOCKER 5), F1 (the second on-screen `asOf`
  → task 7.3), F2 (burn-commit delta added), F3 (sell-commit delta added), F4
  (RULING 9's resolution-loss sentence is now in the `sighting-log` body with
  its own scenario), F6 (hold absent form), F7 (live-region transition), A3
  (`<option>` scenario), A4 (`data-raw` presence follows the value), A8
  (closed `data-unit` set — with MINOR-grade token drift, below), A12
  (`Intl` ban, in design), A13 (second `?? 1` recorded). R1's type-level
  scenario now has a real mechanism (`@ts-expect-error` + `tsc`), so A11's
  first half is genuinely repaired; its second half is MAJOR 7.
- **Hard constraints.** No backend surface anywhere in the deltas or tasks;
  `lib/format/` computes nothing Go decides (the rate's world→wall conversion
  is a unit change over a served value, and the *Station-Keeping* delta
  patches the "taken **only** from that served field" clause so it no longer
  reads as forbidding it — that repair holds); delete-what-you-replace is
  complete; no layout, palette, type-scale or panel-fill change (design.md's
  `<Figure>` renders one bare `<span>`); no mobile layout; `data-*` on every
  formatted element except the two ruled exemptions and the ceiling
  (MAJOR 5).
- **RULING 10's consequences.** R12's scoping ("a quantity this capability
  defines") excludes `SpaceStage`'s bearing and speed cleanly — neither is in
  any rules table, and a speed is not a delta-v. The residual risk is list
  growth, filed as MAJOR 8.
- **RULING 18 (42 tasks, no split).** I reviewed the whole change in one
  pass and judge it **reviewable and buildable in one pass** — do not split.
  The volume is repetition (six components, one transform), not depth, and
  the ruling's decisive argument holds: every seam leaves R12 false. Note
  that repairing MAJOR 2, MAJOR 5 and MAJOR 6 will push the count to roughly
  46–48, all of it mechanical threading and one prop; that growth does not
  change the judgement, but it should be recorded rather than absorbed
  silently, since RULING 18 was flagged for Travis at 42.

## Where a re-review should look first

MINOR-adjacent but worth one look during the repair pass: R11's scenario
"A duration's raw value is its unscaled world-millisecond span … its
`data-unit` is `world-ms`" (`:436-439`) pins the token **`world-ms`**, while
design.md's closed set (`:118-124`) defines **`world-ms-span`** and
`world-ms-instant`. A test written from the spec fails an implementation
written from the design. Quote the closed set in R11 (or use `world-ms-span`
in the scenario) when the other R11 edits are made.

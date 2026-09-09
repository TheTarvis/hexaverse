# add-figure-formatting — adversary round 2

Change: `openspec/changes/add-figure-formatting/` (link 1 of
`docs/plans/system-hud/chain.md`, `/team --chain --full-auto`).
Round 2 of a maximum of 3. Scope per the repair-loop rule: verify round 1's
nineteen findings, then spot-check **only** the revised areas. Attacked
against `add-figure-formatting-adversary-r1.md`, the twenty-two rulings, the
five delta files, tasks.md, design.md, proposal.md, the live specs, and the
call-site code.

**Verdict: findings requiring repair — 1 BLOCKER, 4 MAJOR, 5 MINOR.**

All nineteen round-1 findings **hold as repaired** (table at the end). The
BLOCKER is not a regression: it is BLOCKER 4 surviving its third repair, now
narrowed to one figure class — the repair's new byte-identity scenario cannot
be evaluated for a duration, because the direction form is not recoverable
from the element. Three of the four MAJORs are further defects in that same
new scenario. Nothing else material was found in the revised areas, and the
independent arithmetic re-derivation of every fixture row came back clean.

`openspec validate --strict` → valid. `openspec-reconcile.py` → OK. The
seventh `system-space-view` MODIFIED block diffs as a **pure insertion**
against the live spec, with every scenario heading verbatim (details below).

---

## BLOCKER 1 — the new byte-identity scenario is undecidable for a duration, so the `<Figure text>` bypass is still open on exactly the figure fault #1 names

**Where.** `specs/figure-formatting/spec.md:561-567` (R12's new scenario):

> - **WHEN** any element carrying `data-raw` and `data-unit` is rendered
> - **THEN** its text content is byte-identical to the string the shared
>   module's function for that `data-unit` returns for that `data-raw` (and
>   that quantity's other stated arguments) …

and tasks.md 9.5, which names the arguments the helper actually has:

> calls the shared module's function for that `data-unit` with that `data-raw`
> (**and the scale the test rendered with, for a duration or a rate**)

and design.md:300-310, identically.

**Why it matters.** For every quantity except a duration, `data-raw` +
`data-unit` (+ the test's scale) determine the expected string, so the check
is total: a tonnage, a range, a delta-v, a credit figure, a rate (whose
denominator is distinguished by the closed set's `tons-per-world-ms` vs
`tons-per-world-s`) and a stamp (whose scale argument design.md deliberately
types `number | undefined` so it is total) all recompute. **A duration does
not.** Its `data-unit` is a single token, `world-ms-span` (`:510-512`), while
R3 now defines **four** outputs for the same raw and scale — `in 4m 12s`,
`4m 12s left`, `4m 12s ago`, bare `4m 12s` — and the form is a per-element
property, not a per-test one: `FleetActionsPanel` renders a bare mine preview
and a `left` mine countdown in one tree (tasks 5.3), `SpaceCommandPanel`
renders `in`-form arrivals beside them. So `assertFiguresMatchModule` cannot
compute an expected string for a duration element, and the implementer has
two resolutions the spec does not choose between:

1. enumerate the form set and require a match (total, closes the hole); or
2. skip the elements it cannot compute — the `world-ms-span` ones.

Under (2) — the cheaper reading, and the only one an implementer reaches
without inventing a rule — the following ships with every specified test
green:

```tsx
<Figure raw={preview.arriveMs} unit="world-ms-span" text={String(remaining)} />
```

No `toFixed`, no local `countdown`, no template literal (so tasks 11.1's
static guard is silent — it bans only "template-literal interpolation of a
numeric expression"), `lib/eta.ts` gone, `data-raw` present and correct
(R11 satisfied), and the byte-identity helper skipped it. `preview-arrival`
reads `21646048727` — the exact string in proposal.md's own *Why*, on the
figure the chain doc makes this link's journey, inside the change that exists
to remove it. `SpaceCommandPanel.tsx:210` is `<dd
data-testid="preview-arrival">{preview.arriveMs}</dd>` today, so this is the
path of least resistance, not a hypothetical.

**Smallest fix.** Make the element self-describing, which costs four tokens
in a closed set nothing consumes yet — in R11's closed-set sentence and its
`:507-512` scenario, split `world-ms-span` into `world-ms-span-in`,
`world-ms-span-left`, `world-ms-span-ago`, `world-ms-span-bare`, and note in
R12's scenario that the duration form is therefore among the "stated
arguments" the attribute supplies. Equivalent-cost alternative if the token
split is unwanted: add one sentence to R12's scenario — "for a duration,
whose direction form the attribute pair does not carry, the assertion holds
if the text is byte-identical to the module's output for that raw and scale
under **some** form in the closed form set; no element may be exempted from
this assertion" — plus the same words in task 9.5. Either kills reading (2).

## MAJOR 1 — the same scenario contradicts R11's `<option>` scenario and the ghost's sr-only label: two element classes legitimately carry the pair on prose text

**Where.** R12's new scenario demands the pair-bearing element's text be
byte-identical to the module's output. Two requirements in the same change
require the pair on an element whose text is *not* only the figure:

- `specs/figure-formatting/spec.md:498-505` — "**THEN** that element itself
  carries the `data-raw` and `data-unit` pair" for the `<option>` case;
  design.md:113-122 records the text as `{kind} · {hostId} ·
  {countdown(...)}`.
- `specs/system-space-view/spec.md:371-374` — the ghost `asOf` "carries its
  raw served value wherever it is rendered — on the mark itself (a
  screen-reader-only element is still its own DOM element, and carries the
  attribute pair like any other)". That element is
  `SpaceStage.tsx:693`: `<span className="sr-only">Observed at
  {mark.asOf}</span>`.

**Why it matters.** A *correct* implementation of both fails the new check:
`"body · b-42 · 4m 12s" !== "4m 12s"`, `"Observed at T+ 2d 04:13 ×60" !==
"T+ 2d 04:13 ×60"`. The implementer's only route is an unspecified carve-out,
and an unspecified carve-out in this assertion is where the blindness
re-enters — the risk MAJOR 8 filed for the *static* exception list, now
reproduced in the runtime one. Worse, the natural loose carve-out ("skip
elements whose text has other content") re-admits the bypass on the
`<option>` duration, one of the two surfaces RULING 15 is visibly changing.

**Smallest fix.** State the relation as containment plus an exclusivity
clause, which still kills `text={String(raw)}` (its text contains no
formatted output) while admitting both container cases:

```
- **THEN** the shared module's output for that `data-raw` (and that
  quantity's other stated arguments) appears in the element's text content
  verbatim, and the element's text contains no other numeric run — so an
  element that legitimately labels its figure (a select's `option`, a
  screen-reader-only label) passes while an element whose figure was produced
  by any other means cannot
```

## MAJOR 2 — a scale-absent figure carries `data-raw` but its text was produced without calling the formatter, so the byte-identity check has no operand for it

**Where.** The new capability requirement `:403-416`:

> a call site holding no served scale for such a figure SHALL NOT call the
> formatter with an assumed scale of 1, and SHALL render the absent form
> directly instead … and SHALL still carry its `data-raw`

against R12's new scenario ("any element carrying `data-raw` and
`data-unit`"), and design.md:201-207, which makes the duration and rate
functions' scale argument non-optional by type (`@ts-expect-error`-pinned).

**Why it matters.** Such an element carries `data-raw`, carries `data-unit`,
and renders `—`, but there is no legal call of the module's duration or rate
function that produces `—` from that raw — the scale argument the helper
would need does not exist, and passing `undefined` is a compile error by
design. So the helper either fails on a compliant element or grows a second
undocumented carve-out. This is the interaction between the two requirements
both added this round; neither names the other.

**Smallest fix.** One clause in R12's new scenario: "an element rendering the
absent form because no scale has been served for it satisfies this scenario
by rendering exactly `figure-formatting`'s absent form, the module having
correctly not been called" — and the same sentence in task 9.5.

## MAJOR 3 — the drift notice's *previewed* arrival: `in` or `left`? The one duration figure of eight whose form R3 does not resolve

**Where.** `specs/system-space-view/spec.md:128-140` (revised this round for
BLOCKER 3):

> The actual and previewed figures are each presented per `figure-formatting`,
> each in its own element: … the actual and previewed arrival each carry their
> own raw remaining span in unscaled world-milliseconds

against R3's mapping (`:79-99`): "`in` for a future instant, `left` for the
remainder of something already running".

**Why it matters.** I walked all eight duration surfaces after RULING 20 and
seven are decidable: the scan-target list and the mine preview say "bare, no
direction affix" in their own text; the mine countdown says "suffixed `left`";
the sweep countdown and the roster row are "the remainder of something already
running" → `left`; the burn-preview arrival is a future instant of an
*uncommitted* order → `in`. The drift notice is the exception: it fires
**after** the commit, so its *actual* arrival is the remainder of a running
burn (`left`) while its *previewed* arrival is the superseded quote for that
same running burn — readable as `left` (same running order) or `in` (a quote,
not a position). Both satisfy the delta, and the two figures sit in one
comparison line, so the mixed reading ships "arriving 4m 12s left, previewed
in 4m 5s" — a comparison whose two halves are in different vocabularies.
`SpaceCommandPanel.test.tsx` (task 9.2) pins whichever the build produced.

**Smallest fix.** One clause on that requirement: "both arrival figures take
the same direction form — the running order's `left` — so the two halves of
the comparison are read in one vocabulary."

## MAJOR 4 — R4's third suffix-less expected string, and its WHEN is false as read

**Where.** `specs/figure-formatting/spec.md:167-170`:

> #### Scenario: Sub-minute stamps are not distinguished
> - **WHEN** two stamps 1,000 milliseconds and 40,000 milliseconds apart are
>   each formatted
> - **THEN** both render the identical `T+ 0d 00:00`

**Why it matters.** Round 1's MAJOR 1 found two R4 scenarios pinning
suffix-less strings; the repair fixed those two (`×1` added to both) and left
this one, so the "every row re-derived" claim did not reach it. Worse, the
WHEN's natural reading — two stamps *separated by* 1,000 ms and by 40,000 ms —
makes the THEN **false**: stamps at 50,000 and 90,000 ms are 40,000 ms apart
and render `T+ 0d 00:00` and `T+ 0d 00:01`. An SDET building task 2.1's
fixture row from this sentence writes a row that fails against a correct
module; one building it from the other reading (stamps *at* 1,000 and 40,000
ms) writes a passing row. Since RULING 9's resolution-loss claim is what this
scenario exists to pin, and `sighting-log` carries its own version of it, the
row matters.

**Smallest fix.**

```
- **WHEN** a stamp at 1,000 world-ms and a stamp at 40,000 world-ms are each
  formatted at scale 1
- **THEN** both read `T+ 0d 00:00 ×1` — the stamp is minute-resolution, so
  two instants inside one minute are not distinguished
```

---

## MINOR 1 — a stale cross-reference to R3's pre-rename title, and it mis-attributes the settling form

`specs/system-space-view/spec.md:310-315` cites

> `figure-formatting`'s own due/settling form (*A Relative Duration Names Its
> Direction, and a Due Duration Names That Explicitly*)

but that requirement was renamed this round (RULING 20) to *A Relative
Duration Names Its Direction, **a Cost Duration Renders Bare,** and a Due
Duration Names That Explicitly* — this is the only dangling requirement
reference in the change (grepped). Second half: it calls settling
"`figure-formatting`'s own due/settling form", while R3 says the sweep's copy
**overrides** the capability's due form "on that surface alone". The module
therefore has no settling form, and task 2.1 pins a fixture row for `now`
only — an implementer reading this sentence goes looking for one. Fix: update
the title and change "`figure-formatting`'s own due/settling form" to
"`figure-formatting`'s due-form override for this surface".

## MINOR 2 — R9's too-small-to-show row still has no pinned expected string

`:361-367` now supplies the input MINOR 4 asked for (0.00001 t/s) but still
pins the output only as "(for example `<0.1 t/h`)". R13 requires every rule to
be pinned by a `(raw, scale, expected)` row and this one still has no
`expected`; `<0.1 t/h`, `≈0 t/h` and `0.1 t/h` all satisfy it. Half-repaired.
Fix: drop "for example" and pin the literal `<0.1 t/h`.

## MINOR 3 — RULING 12 still lists the ghost sr-only label among the string-only surfaces that carry no attribute

RULING 12's ruling text names "`SpaceStage.tsx:697`'s ghost sr-only label"
inside the set whose members "carry no attribute", while the repaired
`system-space-view` delta now requires the pair on that element (correctly —
it is a real element with a stable id, so the ruling's own stated reason,
"a toast has no stable element to hang it on", does not apply to it). The
delta and the ruling now disagree about one site. Fix: one sentence appended
to RULING 12 recording the narrowing ("the ghost's sr-only label is an
element, not a string-only surface, and carries the pair; adversary r1
MAJOR 9(a)"), so a later reader does not repair the delta backwards.

## MINOR 4 — ruling on the writer's parting note: not a rule gap, a scenario-title gap

The note asks whether a **negative rate** (R9) and a **non-positive scale**
(R1) — both routed to the absent form for *validity*, not unavailability —
carry `data-raw`. R11's sentence decides both, unambiguously: "`data-raw`
SHALL be present whenever the raw value is a finite number, whatever the
rendered text turned out to be … presence follows the value, never the text"
(`:462-466`). A negative rate is finite; a span formatted at scale 0 is
finite. Both carry it. R11's exclusion scenario is scoped by its own WHEN to
"`undefined`, `null`, `NaN`, or non-finite", so there is no second reading of
the rule and no implementation divergence is *permitted*. What is genuinely
wrong is one scenario **title**: "An absent figure carries no raw attribute"
(`:484`) keys on the rendered form, and is now false as a general statement —
a scale-absent figure is an absent figure that carries one. An implementer
skimming titles gets the opposite rule. Fix: retitle to "A figure with no
numeric value carries no raw attribute", and add the two validity cases to
the WHEN of the `:490-496` scenario ("…or as the absent form because its
value is a negative rate or its served scale is non-positive").

## MINOR 5 — `<Figure>`'s accessible label is now specced twice as a prop and once as an element property, with no closed relationship to the `×N` suffix

R4's `:172-176` scenario says "the element carries an accessible label or
title", task 1.10 makes it an optional `<Figure>` prop, and tasks 7.2/7.3
pass it at three stamp call sites. Nothing states that a stamp rendered
*without* the label is non-compliant, so the label is effectively optional at
the two other stamp sites a later link adds. Fix (cheap, and only if the
repair pass is open anyway): in R4, "every rendered `T+` figure SHALL carry
that label" rather than leaving it to the call-site task list.

---

## What was checked and found sound

- **The fixture arithmetic, re-derived independently.** Every
  `(raw, scale, expected)` row in R1–R10 was recomputed from scratch, not
  read: R1 (252,000@1→`4m 12s`; 252,000@60→4,200 ms→`0m 4s` ✓ the BLOCKER 1
  repair; 60,000@0.5→120 s→`2m 0s`), R2 (252 s, 12,300 s→`3h 25m`,
  187,200 s→52 h→`2d 4h`, the three exact-boundary rows, 400 ms,
  3,599,600 ms→59m 59.6s→`1h 0m`, 86,399,600 ms→23h 59m 59.6s→`1d 0h`), R3
  (252 s, 160 s, 12,000 s→`3h 20m ago`, 0, −1/−900,000 ms, 200,000 ms→`3m
  20s ago`), R4 (187,980,000 ms→2 d + 15,180 s→`T+ 2d 04:13 ×60`; the
  zero-pad and zero rows now carrying `×1`), R5 (47.235…→`47.2 t`,
  153.4→`153 t`, 99.95→`100 t`, 99.94→`99.9 t`, 0→`0.0 t`, 6→`6.0 t`), R6
  (13,944.77…→`13.9k`, 833.25→`833`, 1→`1.00`, 12.3456→`12.3`, 999.5→`1.00k`,
  1000→`1.00k`, 1,234,567→`1.23M`, 0→`0.00`), R7 (269.4, 268.5, 3721.2, 0),
  R8 (1000, 28, 0, −50, 1250), R9 under design.md's pinned conversion
  `tons/wall-s = tonsPerWorldMs × 1000 × scale` (0.04→`2.4 t/min`;
  0.0001→0.006 t/min→0.36→`0.4 t/h`; the 0.9/1.0 threshold pair;
  0.001@1→**`1.0 t/s`** ✓ the BLOCKER 2 repair; 0.02 t/world-s@1→0.02 t/s→
  `1.2 t/min`; 0.001@60→`60.0 t/s`; 0→`0.0 t/h`; 0.00001→0.036 t/h). **No
  further contradiction found** — the two kills of round 1 were the only
  arithmetic defects, and MAJOR 4 above is a wording defect, not an
  arithmetic one.
- **The seventh `system-space-view` MODIFIED block** (*A Burn Commit Is
  Quote-Locked…*) diffs against the live spec as a **pure insertion**: one
  appended sentence on the body, one appended clause on the "ceiling the
  player agrees to" THEN, all three scenario headings verbatim, nothing
  dropped or reordered. The archiver trap does not bite it. proposal.md's
  count is updated to 7, and tasks 4.1/4.4 carry the ceiling.
- **A full re-diff of all 17 MODIFIED bodies** (cheap to re-run, so it was
  re-run): the only live-only lines are wrap artifacts inside the ten THEN
  clauses the change amends. No sentence, scenario heading, or scenario body
  was lost in the repair pass.
- **BLOCKER 3's four arrival figures.** The three element-borne ones now read
  "its raw remaining span in unscaled world-milliseconds", each with its
  reference point named ("the span from the mounting view's projected world
  time to …"), so the previewed/actual pair is comparable. The fourth, the
  burn toast, is coherently resolved the other way: `system-space-view:465-479`
  makes it a string-only surface carrying no attribute (R11's exemption,
  RULING 12) **and** requires "its text built from the module's own output",
  so R12's "the formatter is the only place a wire number becomes text" is
  satisfied rather than contradicted. MAJOR 9(b) dies with the same edit.
- **BLOCKER 5's three-way collision.** The new capability requirement plus
  RULING 19 resolve it without contradicting R4 (whose `×N` clause has no
  operand when no scale is served), RULING 16 (the suffix still always
  renders, as `×—`), or `sighting-log`'s row requirement (the `T+` portion
  still renders, so the mandated field is shown). Tasks 1.2, 1.8, 2.1 and the
  four threading tasks (3.3, 5.8, 7.4, 8.2) carry it end to end.
- **The `data-unit` vocabulary sweep.** Every token used anywhere in the five
  delta files, tasks.md and design.md is in design.md's closed set
  (`world-ms-span`, `world-ms-instant`, `tons`, `range`, `delta-v`, `credits`,
  `tons-per-world-ms`, `tons-per-world-s`). The two `world-ms` occurrences
  round 1 flagged are repaired at both sites (`:452`, `:510-512`); the two
  remaining bare `world-ms` strings in design.md (`:130`, `:232`) are the
  prohibition itself and the rate function's denominator-discriminator
  argument, neither a `data-unit` value. Clean.
- **RULING 18 at 48 tasks — judgement unchanged, do not split.** The six
  tasks added since 42 are five one-line threadings of one value (1.10, 3.3,
  5.8, 7.4, 8.2) and one shared test helper (9.5). Depth is unchanged;
  R12 remains a whole-tree invariant no seam can halve. I still judge the
  change reviewable and buildable in one pass. The overage is worth
  re-flagging to Travis at 48 as the ruling itself says, but nothing in
  round 2 argues for the split.

## Round-1 verification table

| # | Round-1 finding | Status | Evidence |
|---|---|---|---|
| B1 | R1's `4s` contradicts R2 | **held** | `figure-formatting:15` reads `0m 4s`, with the reselect rationale added |
| B2 | R9's `60.0 t/min` boundary contradiction | **held** | `:341` reads `1.0 t/s` with the conversion shown inline |
| B3 | four arrival figures specced as "raw served value" | **held** | three now "raw remaining span … in unscaled world-ms" with a named reference point; the toast resolved as attribute-free with module-produced text |
| B4 | `<Figure text>` bypass | **partially held** | the new byte-identity scenario + task 9.5 exist and close the hole for six of seven quantity classes; **open for durations** → BLOCKER 1 |
| B5 | absent-scale pinned on one surface; undefined for stamps | **held** | new capability requirement `:403-444`, RULING 19, tasks 3.3/5.8/7.4/8.2, fleet-roster's own scenario retained |
| M1 | two R4 scenarios drop `×N` | **held (2 of 3)** | `:156`, `:160` now `×1`; a third suffix-less string remains → MAJOR 4 |
| M2 | accessible label has no mechanism | **held** | RULING 22, design.md:85-96, task 1.10, passed at 7.2/7.3 (see MINOR 5 for the residual optionality) |
| M3 | R3 affix mapping missing; cost sites called relative | **held** | R3 rewritten deadline/magnitude per RULING 20; both cost sites say "no direction affix"; 7 of 8 surfaces decidable, 1 not → MAJOR 3 |
| M4 | due form unpinned | **held** | RULING 21; R3 pins the literal `now`; task 2.1 pins the row; task 10.2 migrates the e2e literal |
| M5 | fuel ceiling had no delta | **held** | 7th MODIFIED block added, diff-clean; proposal says 7; tasks 4.1/4.4 |
| M6 | `servedScale` threading unspecced | **held** | task 3.3 derives the un-defaulted value and names all six children; 5.8/7.4/8.2 accept it; design.md:174-214 |
| M7 | two-process purity scenario | **held** | `:594-598` is now the static "names none of `Date`, `performance`, `Math.random`, `Intl`, `toLocaleString`" assertion, in the spec, and task 11.1 implements it |
| M8 | exception list unbounded | **held** | R12's exception-list scenario `:569-574`; task 11.1 requires each entry recorded with its ruling and forbids any naming a defined quantity |
| M9a | ghost `asOf` element-vs-string contradiction | **held** | the contradicting sr-only sentence is gone; the delta now states the sr-only element carries the pair (see MINOR 3 for the ruling-text residue) |
| M9b | burn-commit arrival on a toast | **held** | resolved as attribute-free string-only surface |
| m1 | "raw served value" on a derived tonnage | **held** | `docked-fleet-actions:38-42` distinguishes the client-derived used capacity explicitly; task 5.1 mirrors it |
| m2 | proposal omits `Figure.tsx` | **held** | `proposal.md:83` |
| m3 | stale "RULING 1–15" | **held** | both citations now reference the rulings file as the live set, with no count |
| m4 | two R9 scenarios unusable as rows | **held (1 of 2)** | `:326` now supplies 0.0001 t/s; `:361` supplies 0.00001 t/s but still no pinned expected → MINOR 2 |
| m5 | task 7.3's line number | **held** | now `:708`, with the correction and its reason recorded in the task |

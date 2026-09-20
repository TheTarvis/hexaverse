# add-figure-formatting — open questions and rulings

Link 1 of the `docs/plans/system-hud/chain.md` chain, run under
`/team docs/plans/system-hud/chain.md --full-auto`. Every user gate is lifted;
every open question is ruled in-run against the precedence in
`.claude/skills/openspec-team-workflow/SKILL.md` § *Full-auto chains*:

1. the chain doc's / scoping doc's recorded lean
2. a settled decision in root `CLAUDE.md` / `openspec/project.md`
3. the panel's recommendation
4. the most reversible option

A ruling with a recorded basis is a decision; a choice without one is a guess,
and guesses are forbidden. A question needing information nobody in the repo has
is a hard stop, not a ruling.

---

## FULL-AUTO RULING 1 — a relative duration counts in wall-clock

**Question.** `frontend/lib/eta.ts:1-4` states in its own header comment that
"world time runs at scale 1 today, so world-ms are real ms", while
`SystemSpace.scale` is documented as never assumed to be 1. When the formatter
renders `in 4m 12s` from a world-millis ETA, does it count world time or the
real time the player waits?

**Ruling.** **Wall-clock.** A relative duration (`in 4m 12s`, `2m 40s left`,
`3h 20m ago`) is the real time the player will wait: `world-ms ÷ served scale`.
The absolute stamp is the opposite — `T+ Dd HH:MM` is **world** time measured
from the epoch, rendered with `×scale` appended so the two readings can never be
confused for one another. A formatter that renders a relative duration SHALL
take the served scale as an explicit argument; there is no scale-1 default.

**Basis.** `chain-doc` — `docs/plans/system-hud/chain.md` § *Open decisions
gating the chain*, row 1, which records this lean verbatim ("A relative duration
… is the real time the player will wait: world-ms ÷ served scale. The absolute
`T+` stamp is world time, with `×scale` shown so the two are never confused").
Precedence level 1; no lower level consulted.

**Alternatives rejected.**
- *Count relative durations in world time too.* Rejected: a `×60` world would
  show "in 4m 12s" for a four-second wait, which is the exact class of fault
  (fault #1, raw wire values reaching the eye) this link exists to remove.
- *Keep `lib/eta.ts`'s scale-1 assumption and defer.* Rejected: the assumption is
  already false by documentation, and every later link in the chain renders the
  same durations. Deferring propagates the defect into four more surfaces.
- *Infer the scale inside the formatter from a module singleton.* Rejected: the
  module is pure and fixture-tested; a hidden dependency on ambient state makes
  the fixture table unable to pin behaviour.

**Reversal cost.** One function. The division lives in exactly one place in
`lib/format/`; reversing means removing the divisor and the argument, plus the
fixture rows that pin scale ≠ 1. No data, no wire, no migration.

---

## FULL-AUTO RULING 2 — the formatter earns its own capability

**Question.** Do the formatting rules become a new OpenSpec capability, or hang
off `system-space-view` as presentation clauses?

**Ruling.** **A new capability, `figure-formatting`.** The rules table becomes
requirements in `openspec/specs/figure-formatting/` (ADDED by this change); the
four consuming capabilities take MODIFIED deltas that say a figure is presented
per `figure-formatting` and carries its raw served value on a `data-*`
attribute — copy clauses only, no behavioural change.

**Basis.** `chain-doc` — `docs/plans/system-hud/chain.md` § *Open decisions
gating the chain*, row 2 ("**Yes** — `figure-formatting`. The rules are
cross-surface and fixture-pinned; hanging them off `system-space-view` would
make every later placement change reopen them"). Precedence level 1. Consistent
with the same table's ruling that the strip and dock earn `system-console`
rather than growing `system-space-view`.

**Alternatives rejected.**
- *Clauses on `system-space-view`.* Rejected: links 2a–4 re-home every one of
  these figures, so each placement change would reopen the formatting rules —
  the coupling the chain doc names.
- *A shared clause block duplicated into each consuming capability.* Rejected:
  four copies of a rounding rule is four places for them to diverge, and the
  fixture table would have no single spec to pin to.

**Reversal cost.** One capability folder. `figure-formatting` has no wire
surface, no data and no consumers outside the frontend; folding it back into
another capability is a spec-only move (a REMOVED + ADDED pair) with no code
change at all.

---

## Rulings 3–15 — from the design analysis

Source: `add-figure-formatting-analysis.md` §7 (AMB-1 … AMB-15), produced by
`openspec-design-analyst`. AMB-3, AMB-8 and AMB-15 were resolved inside the
analysis against the design input and are recorded here for the record rather
than ruled. The rest are ruled below. **No hard stop was reached.**

### FULL-AUTO RULING 3 — a rate's denominator is wall-clock too (AMB-1)

**Ruling.** A rate is presented per a **wall-clock** time unit. A served
denominator in world time (`roster.miningRate` is tons per world-millisecond;
`roster.stationKeepRateTonsPerSecond` is tons per world-second) is converted at
the served scale before the unit is chosen.

**Basis.** `docs/plans/system-hud.md` "Formatting" states the rule as "**per the
unit the player waits in**" — the phrase names wall-clock directly, not by
analogy. Reinforced by `chain-doc` row 1 (RULING 1): a rate is a duration's
reciprocal, and a `×60` world showing `0.4 t/h` for a rate the player actually
sees fill a hold in a minute is the same fault #1 in reciprocal form.
Precedence level 1.

**Alternatives rejected.** *Present the served denominator as-is* (`0.02 t/s`,
which is what `stationkeep-rate` renders today) — rejected: it is a world-second,
so the figure is wrong by a factor of the scale and the label does not say so.
*Convert for mining but not for station-keeping* — rejected: two denominators
with one vocabulary is precisely the divergence RULING 2 exists to prevent.

**Reversal cost.** One multiplication, in the one place the conversion lives.

### FULL-AUTO RULING 4 — the rate unit flips at magnitude ≥ 1 (AMB-2)

**Ruling.** A rate renders in the **largest wall-time unit in which its magnitude
is at least 1**, over the ladder per-second → per-minute → per-hour. So
2.4 t/min renders `2.4 t/min` (per-second would be 0.04); 0.4 t/h renders
`0.4 t/h` (per-minute would be 0.0067). A rate below 1 t/h renders `t/h` still —
the ladder does not extend past hours — and a zero rate renders `0.0 t/h`.

**Basis.** Precedence level 4, most reversible: it is one comparison, and it is
the only stated rule that makes **both** of the design input's worked examples
(`2.4 t/min`, `0.4 t/h`) come out right, which is the strongest evidence
available of what the doc's author meant. Alternatives with a magnitude window
(e.g. [1, 1000)) also fit but add a second bound with nothing to pin it to.

**Alternatives rejected.** *Magnitude in [1, 1000)* — rejected: adds an upper
bound no example exercises. *A fixed unit per quantity* (mining always per
minute, upkeep always per hour) — rejected: it makes the unit a property of the
call site, which is the cross-surface divergence RULING 2 forbids.

**Reversal cost.** One comparison in one function, plus its fixture rows.

### FULL-AUTO RULING 5 — the raw-value attribute is `data-raw` + `data-unit` (AMB-3)

**Ruling.** Every formatted figure is its own element carrying `data-raw` (the
unformatted value, `String(value)` at full double precision, never re-rounded and
never the display value) and `data-unit` (naming which quantity and, for
durations and rates, which clock the raw is in — e.g. `world-ms`,
`tons-per-world-ms`). A copy line holding more than one figure is split so each
figure gets its own element. An absent figure omits `data-raw` entirely rather
than carrying `NaN`, `0` or an empty string.

**Basis.** The chain doc explicitly delegates this ("`data-raw`, or per-figure
names — the writer picks one and the spec pins it"), so precedence falls to level
3, the panel's recommendation — here the analyst's, in
`add-figure-formatting-analysis.md` §5, with four supporting arguments. The
decisive one is structural: `SpaceCommandPanel.tsx:280–283` puts four figures in
one `commit-drift-notice` element, so a single per-element attribute of any
naming scheme is impossible without splitting; once split, each element already
carries a unique `data-testid`, and a per-figure attribute name would restate it.

**Alternatives rejected.** *Per-figure attribute names* (`data-fuel-tons`,
`data-arrive-ms`) — rejected: no mechanical invariant exists to check them, so a
missing attribute is indistinguishable from an element that legitimately has no
figure. *`data-raw` alone, without `data-unit`* — rejected: a test reading
`data-raw="0.02"` off `stationkeep-rate` cannot tell which second that is, and
RULING 3 makes two world denominators live simultaneously.

**Reversal cost.** A rename across the call sites the change already touches, and
the fixture table's column header. No wire, no data.

### FULL-AUTO RULING 6 — the anti-mirror constraint is a requirement, not a mirror-map entry (AMB-4)

**Ruling.** `lib/format/` is **not** enrolled in `.claude/scripts/check-mirror-map.sh`
and this change takes **no** `cross-stack-determinism` delta. The chain doc's
constraint lands instead as a `figure-formatting` requirement (R13): the module is
pure, derives no rule-bearing value, and imports neither `lib/market` (the one
mirrored pair) nor `lib/space` — enforced by a real import-guard test. `design.md`
must state this explicitly so a later reviewer does not go hunting for a
`fixtures/format/mirror-map.json` that deliberately does not exist.

**Basis.** Verified mechanism, not preference. Every anti-mirror pair in
`check-mirror-map.sh` is anchored on a Go-sole-authority **Go package** against a
same-named TS directory; there is no `backend/format` and never will be, so the
Go-side extraction would enumerate an empty set and the check could never fail.
`docs/plans/continous_space/handoffs/README.md` "the one lesson these keep
re-teaching" catalogues five shipped derivations that were unit-tested and never
called; a check that cannot fail is the same species with a green tick on it.
Precedence level 4 (most reversible) reinforced by level 1: the chain doc's actual
words are a **prohibition** ("does not join the market mirror pair and must not
compute anything Go decides"), which R13 states in full — "registered
anti-mirror" was shorthand for a mechanism that does not fit this shape.

**Alternatives rejected.** *Add `fixtures/format/mirror-map.json` anyway* —
rejected: vacuous by construction, and it would manufacture false assurance in
the one directory this repo has learned to distrust. *Extend
`check-mirror-map.sh` to support a TypeScript-sole pair* — rejected: it changes a
shipped `cross-stack-determinism` requirement, which is a different change
through the full pipeline, not a task inside this one.

**Reversal cost.** One JSON file and one line in `check.py`'s trigger predicate,
if a `backend/format` ever exists. Nothing to undo today.

### FULL-AUTO RULING 7 — supplying a scale at the galaxy view's roster mount is in scope (AMB-5)

**Ruling.** This change may pass a `scale` prop to `FleetRoster` at its
`GalaxyView` mount site (`GalaxyView.tsx:472`) and update
`GalaxyView.test.tsx:424`. It may **not** touch the galaxy view's own chrome,
inspector, layout or clock. The galaxy view's clock running at an assumed scale
of 1 (`GalaxyView.tsx:182`) is a **pre-existing defect**, recorded as
`docs/plans/continous_space/handoffs/defect-galaxy-clock-assumes-scale-1.md` and
left for a later change against `galaxy-view` — not fixed here.

**Basis.** Precedence level 1, read in context. The chain doc's "Touch the galaxy
view" prohibition sits in a list whose other entries are all about *building HUD
surface* (a mobile layout, a theming pass, the palette), and the chain's own
exclusion list names the thing meant: "the galaxy-view strip (open question,
ruled *no* for now)". A shared component's prop at its mount site is not the
galaxy view's chrome. The alternative is worse under the chain's own rules:
`lib/eta.ts` must die in this change ("delete what you replace in the same
change"), and it has two callers, one of which the roster reaches from both
views.

**Alternatives rejected.** *Leave `GalaxyView` on a scale-1 default* — rejected:
it reintroduces, one layer up, exactly the assumption RULING 1 removed, and does
so silently. *Fix the galaxy clock here too* — rejected: that is a `galaxy-view`
behaviour change with no delta in this change and no design input behind it;
recorded as a defect instead. *Split the roster so the galaxy view keeps a
separate ETA path* — rejected: two duration formatters is the fault being fixed.

**Reversal cost.** One prop and one test assertion.

### FULL-AUTO RULING 8 — no served scale renders as absent, never as scale 1 (AMB-6)

**Ruling.** When a mounting view has no served scale yet (`Fleet.scale` is
optional on the wire), a duration renders in the **explicit absent form**, not at
an assumed scale of 1. The formatter takes scale as a required argument; the
caller's absence of one is a caller-side absent value, handled by R10.

**Basis.** Precedence level 2 — `openspec/specs/system-space-view/spec.md`'s
standing doctrine that the scale is never assumed to be 1, which RULING 1 already
applied at the formatter. Falling back to 1 at the call site would satisfy the
letter of RULING 1 and defeat it in fact.

**Alternatives rejected.** *Fall back to scale 1 in the mounting view* —
rejected as above: it relocates the assumption rather than removing it, and the
resulting figure is wrong by a factor of the scale with nothing marking it.
*Block the render until a scale arrives* — rejected: it turns a formatting rule
into a loading-state rule on four surfaces, which is a behaviour change no delta
covers.

**Reversal cost.** One conditional at each mounting view; two sites.

### FULL-AUTO RULING 9 — `T+` stays minute-resolution on sighting rows (AMB-7)

**Ruling.** The absolute stamp is `T+ Dd HH:MM` everywhere, including
`sighting-log` rows, and two records seconds apart may render identical text.
Their `data-raw` carries the distinct `asOf`, so served ordering stays assertable
and the requirement's ordering rationale is untouched. The `sighting-log` MODIFIED
block states the resolution loss explicitly rather than leaving a reader to find
it.

**Basis.** Precedence level 1 — `docs/plans/system-hud.md` "Formatting" and the
chain doc's rules table both give exactly one absolute-stamp format. Level 3
supports it: a per-surface seconds variant is the cross-surface divergence
RULING 2 exists to prevent.

**Alternatives rejected.** *A seconds field on log rows only* — rejected:
per-surface format variants are the coupling RULING 2 removed. *Relative `ago`
stamps on log rows* — rejected: the pile is ordered by `asOf` and a relative
stamp re-renders on every clock tick, which would make the served order
unreadable as the rows drift.

**Reversal cost.** One format string plus its fixture rows.

### FULL-AUTO RULING 10 — the hover facts' bearing and speed stay out of scope (AMB-9)

**Ruling.** `SpaceStage`'s `Arrives in …` duration moves onto the formatter — it
must, because `lib/eta.ts` dies in this change — and the ghost's sr-only `asOf`
label does too. Bearing and speed (`SpaceStage.tsx:663, 664, 709, 710, 828`)
**keep their `toFixed`** and are recorded as a knowing, named exception in the
proposal's out-of-scope section. R12's scenario is scoped to "a player-facing
figure of a quantity `figure-formatting` defines", so the spec states a rule it
actually holds to rather than one the change knowingly violates.

**Basis.** Precedence level 2, from the team's own entry-mode rule
(`.claude/skills/openspec-team-workflow/SKILL.md` § Entry modes): the hover-facts
surface has **no covering requirement in any live spec** — the analyst verified
this by grep. Writing requirements for unspecced existing behaviour is
`openspec-brownfield`'s job, in its own step, with a baseline-mode adversary
audit; authoring them inside a change is exactly the "two steps, not one"
the skill forbids. Adding bearing and speed to the rules table would additionally
be inventing quantities neither design document names — a guess, which
`--full-auto` forbids outright.

**Alternatives rejected.** *Add bearing and speed to `figure-formatting`* —
rejected: no design input supplies their rounding, unit or ladder, so any rule
would be invented. *An ADDED requirement to `system-space-view` covering the
hover-facts surface* — rejected: it opens a baseline gap this change did not
open, without the brownfield audit that makes a baseline trustworthy. *Leave
R12 stated broadly and ship a known violation* — rejected: a requirement the
change knowingly breaks on the day it lands is worse than a narrower true one.

**Reversal cost.** Nothing to undo; the follow-up is a brownfield pass over the
hover-facts surface, filed as `defect-hover-facts-unspecced.md`.

### FULL-AUTO RULING 11 — `market-board-panel` is deferred to link 4 (AMB-10)

**Ruling.** `MarketBoardPanel`'s `{row.price} cr/t` and its spread are **not**
reformatted in this change. The chain's link 4 owns `market-board-panel`. The
proposal records, as a known and temporary inconsistency, that two credit
vocabularies (`₡ 1,000` and `1000 cr/t`) will coexist until link 4 lands.

**Basis.** Precedence level 1 — the chain doc's table assigns `market-board-panel`
to link 4 by name ("MODIFIED … `market-board-panel` (mounted as a station's
tab)"), and it appears in no link-1 row. Reinforced by the analyst's own
condition: it recommended pulling it in only if the task count landed under 35
without it, and the estimate is 36–39, so its condition is not met.

**Alternatives rejected.** *Pull the two `market-board-panel` figure requirements
into link 1* — rejected: it pushes an already-marginless link over the 40-task
cap and re-scopes a capability the chain assigns elsewhere. *Reformat the panel's
code without a delta* — rejected outright: a production change with no requirement
behind it is the spec-first violation the whole pipeline exists to prevent.

**Reversal cost.** Link 4 already opens this capability; folding the figures in
there costs nothing extra.

### FULL-AUTO RULING 12 — toasts and live regions use the formatter but carry no attribute (AMB-11)

**Ruling.** Every player-facing string built for a toast, an `aria-label` or a
live region uses the formatter — including `SpaceCommandPanel.tsx:135`'s burn
toast (which interpolates a raw world-ms today),
`FleetActionsPanel.tsx:345`'s balance live region, and `SpaceStage.tsx:697`'s
ghost sr-only label. The `data-raw` requirement (R11) binds **rendered figure
elements only**; a string-only surface carries no attribute, and R11 says so in
its own scenario rather than leaving the omission to be inferred.

**Basis.** Precedence level 1 — the chain doc's "The formatter is the *only*
place a wire number becomes text" makes no exception for copy a screen reader
reads. A blind player hearing "Balance 1250 credits" while a sighted player reads
`₡ 1,250` is the accessibility inverse of fault #1.

**Alternatives rejected.** *Exempt AT surfaces from the formatter* — rejected as
above. *Require `data-raw` on live regions too* — rejected: the attribute is
invisible to assistive technology and a toast has no stable element to hang it
on, so the requirement would be unobservable there.

**Reversal cost.** Per-site; each is one call.

**Narrowing (adversary round 2, MINOR 3).** The ghost's sr-only label is an
element, not a string-only surface, and carries the `data-raw`/`data-unit`
pair — the repaired `system-space-view` delta correctly requires it there
(adversary r1 MAJOR 9(a)). This ruling's own "a toast has no stable element
to hang it on" reasoning does not apply to it; the string-only-surfaces set
this ruling names is narrowed by that element's removal, so a later reader
repairing the delta does not read this ruling as license to strip the pair
back off it.

### FULL-AUTO RULING 13 — one absent form, `—`, with the credit override preserved (AMB-12)

**Ruling.** `figure-formatting`'s absent form is a single em dash `—`, used for
`undefined`, `null`, `NaN` and every non-finite value. `docked-fleet-actions`'
*Credit Balance Readout* keeps its mandated explicit-unavailable copy as a
capability-level override, stated in R10's last scenario. `FleetRoster`'s current
`?? 0` fallback becomes the absent form, and the `fleet-roster` MODIFIED block
**states that as a behaviour change**, not as formatting: a fleet with no served
roster reads `0t fuel` today, which is indistinguishable from a dry fleet.

**Basis.** Precedence level 3/4. `—` is already the repo's most common absent
form (`SpaceCommandPanel.tsx:79`, `SpaceStage.tsx:709`); the credit override is
forced by a live requirement this change must not break; and the roster's `?? 0`
is a lie a formatting change would otherwise silently carry forward. Choosing the
convention already in the tree is the smallest move.

**Alternatives rejected.** *Keep four conventions* — rejected: it is fault #1's
sibling, and the analyst found the roster case actively misleading. *Make
`Unavailable` the universal form* — rejected: it is credit-specific copy mandated
by one requirement's own scenario, and it reads wrong on a tonnage. *Silently
change the roster's `?? 0` as part of "formatting"* — rejected: smuggling a
behaviour change inside a copy change is exactly what this link's adversary pass
is for.

**Reversal cost.** One constant, plus the roster's two fallbacks.

### FULL-AUTO RULING 14 — range carries a magnitude suffix and no named unit (AMB-14)

**Ruling.** A range or distance renders to three significant figures with a
magnitude suffix and **no unit name**: `13.9k`, `833`, `1.23M`. The ladder is `k`
and `M` only. `1,180 km` — the second example in `docs/plans/system-hud.md`'s
Formatting table — is **not** implemented, and the contradiction between the two
design documents is recorded in `design.md` as a resolved conflict rather than
read past.

**Basis.** Precedence level 1 with a tie-break: the chain doc, which is the
sequencing authority for this link and was written after the scoping doc, gives
only `13.9k`. The tie-break is decisive on its own merits — no wire field, Go
type or TS type anywhere names a distance unit (`roster.estimatedRange` is a bare
`833.25`), so rendering `km` would have the presentation layer assert a physical
unit the simulation never decided. That is precisely what "must not compute
anything Go decides" forbids.

**Alternatives rejected.** *Render `km`* — rejected: it invents physics, and
`--full-auto` forbids a guess. *Ask which unit range is in* — this is the one
question in the analysis touching a fact nobody in the repo has, and it would be a
hard stop **if the answer were needed**; it is not, because not naming a unit is
both available and correct. *Extend the ladder to `G`* — rejected: a system
extent is O(10⁴–10⁵), so the rung would never be exercised and could never be
tested against a real value.

**Reversal cost.** One suffix table; adding a unit name later is one string.

### FULL-AUTO RULING 15 — the `M:SS` countdowns visibly change shape (AMB-15)

**Ruling.** The mine and scan countdowns move from `M:SS` (`2:03`) to the single
duration form (`2m 3s`). This is an intended, visible copy change on two
surfaces, and the proposal names it as such so the adversary and QA do not read
it as an accident.

**Basis.** Precedence level 1 — one cross-surface duration format is the whole
content of RULING 2 and of the chain doc's rules table. Recorded rather than
merely done because `FleetActionsPanel.test.tsx:273` currently hedges
(`/2:03|123|2 min/i`), which is evidence the shape was never pinned.

**Alternatives rejected.** *Keep `M:SS` for countdowns and use `Nm Ss`
elsewhere* — rejected: two duration vocabularies is the divergence this link
exists to end.

**Reversal cost.** One format branch.

---

## Recorded, not ruled

- **AMB-8** — resolved against the design input: `preview-arrival` becomes a
  **relative** duration, per `chain.md` Link 1 § Journey ("the arrival read as a
  relative duration").
- **AMB-13** — resolved against the design input: the separator before `t` is a
  thin space, U+2009, per `docs/plans/system-hud.md` "Formatting".

## Not open

The chain doc records the remaining decisions in its table as gating links 2a–4,
not this one. `docs/plans/system-hud.md` marks the three placements and
dock-as-home-of-detail **DECIDED**; everything marked RECOMMENDED there is
design input the writer authors from, not a question.

Further rulings from the panel and adversary rounds are appended below as they
are made.

---

## Rulings 16–17 — from the specialist panel

Source: `add-figure-formatting-panel-consolidated.md`, the three-reviewer panel
(architect, ux, security). Every other panel finding was accepted and routed to
the writer without needing a ruling; these two needed one because each resolves a
tension between a reviewer's proposal and an existing ruling or decision.

### FULL-AUTO RULING 16 — `×N` stays on every stamp; the fix is a label, not a carve-out

**Question.** Both the architect (finding A10) and UX (finding F8) flagged that
R4 puts the `×N` scale suffix on **every** absolute stamp, so a `sighting-log`
reads the identical suffix on every row and a screen reader hears it on every
ghost — risking a reading that each sighting was taken at a different scale,
which is the opposite of what the suffix communicates.

**Ruling.** R4's rule stays universal: every absolute `T+` stamp renders its
`×N` suffix, including `×1` and including every log row. The readability problem
is fixed by **UX F8's accessible-label scenario** — the element carries a label
stating the world clock is running at N times real time — not by a per-surface
carve-out. The per-row repetition is recorded in `design.md` as a named,
deliberate consequence rather than left to be discovered on screen.

**Basis.** Precedence level 1: RULING 2's entire rationale is that formatting
rules are cross-surface and must not be reopened by each placement, so a
`sighting-log`-only suffix rule is precisely the per-surface variant it forbids.
Level 3 supports the remedy — UX proposed the label and explicitly declined to
recommend reopening R4; the architect flagged rather than authored around it.
Two independent reviewers converging on the problem and neither proposing the
carve-out is the strongest signal available that the carve-out is wrong.

**Alternatives rejected.** *Suppress `×N` at scale 1* — rejected: R4's own
scenario requires the suffix at scale 1 so a reader never has to infer it, and
suppression makes an absent suffix ambiguous between "scale 1" and "not served".
*Suppress on list surfaces only* — rejected as the forbidden carve-out. *Render
the scale once per list as a header* — rejected: that is placement, which belongs
to links 2a–4, not this one.

**Reversal cost.** One scenario and one label attribute.

### FULL-AUTO RULING 17 — `<Figure>`'s pre-formatted text is a bypass the guard must close

**Question.** The security reviewer, outside its own remit, observed that
`<Figure>`'s `text` prop takes an arbitrary string, so a call site can
interpolate a raw number into a template (`text={\`${raw} t\`}`) and satisfy
R12's enforcement — which greps for `.toFixed(` and local `countdown`/`formatEta`
— while violating R12 itself.

**Ruling.** R12's enforcement must catch a raw number interpolated into a
template and passed to `<Figure>` as `text`, not only a banned function call. The
architect's whole-tree `guards.test.ts` (which replaced the changed-file
validator per finding A5) is the right mechanism; its assertion set must include
template-literal interpolation of a numeric expression into a figure's text. R12's
requirement text must state the rule in terms of **what produced the string**,
not **which functions were called** — a requirement phrased as a list of banned
names is one any new spelling evades.

**Basis.** Precedence level 3 (the panel's own finding, referred from security)
reinforced by level 2: this repo has been bitten by exactly this shape.
`docs/plans/continous_space/handoffs/README.md` lesson two records
`hooks/use-refuel.test.tsx` asserting a double-submit guard and passing against
code that had no guard at all, because the test was shaped so it could not
observe the failure. A guard that greps two function names while the requirement
says "the only place a wire number becomes text" is that same shape: green, and
blind to the case that matters.

**Alternatives rejected.** *Accept the bypass as theoretical* — rejected: this
change converts roughly 25 call sites by hand, so the bypass is not hypothetical,
it is the path of least resistance at site 20. *Make `<Figure>` take the
formatter function and its arguments rather than a string* — this would close the
hole by construction and is genuinely attractive, but the architect considered
and rejected the JSX-returning/structured shapes on fixture-table grounds (R13
pins `(raw, expected)` **string** pairs), and reopening it would overturn the
owning reviewer's decision on technical shape for a hole a single assertion
closes.

**Reversal cost.** One assertion in `guards.test.ts`.

---

## FULL-AUTO RULING 18 — the change is NOT split at 42 tasks

**This ruling deviates from a stated numeric cap and is flagged as such in the
run report.** The orchestrator's own instructions say "past 40 tasks, split at a
seam", and the team workflow skill says a link that grows past 20–40 tasks under
panel review is split. The authored count after the panel revision is **42**.

**Ruling.** `add-figure-formatting` ships as one change at 42 tasks. No split.
The pre-identified seam stays documented and available.

**Basis — the decisive reason, found while evaluating the seam.** R12 (*A
Player-Facing Figure Is Produced Only by the Shared Formatter*) is a **whole-tree
invariant**: no component anywhere calls `toFixed`, no component defines a local
duration formatter, `lib/eta.ts` is gone and unimported. An invariant of that
shape cannot be delivered in halves. Any seam leaves some consumers unconverted,
so at the end of the first half R12 is **false**, and the only way to ship it is
an exception list naming the four not-yet-converted components — a passing guard
that has been told to ignore precisely the violations it exists to catch. That is
the exact species `docs/plans/continous_space/handoffs/README.md` catalogues twice
over: lesson one's five derivations that were built, unit-tested and never called,
and lesson two's double-submit test that passed green against code with no guard
because it was shaped so it could not observe the failure. Splitting this change
would manufacture a sixth instance of the first lesson and a fourth of the second,
inside the change whose entire purpose is to establish the invariant.

**Basis — the cap's purpose is not engaged.** The cap exists to catch
*underestimation*. Its recorded cause is a link that "claimed 47 tasks and was
131" (chain doc, *Why 2 is two links*), and the workflow skill's own note that
hexaverse's links "grew from 47 to 131 tasks, and every adversary round and dev
pass re-read all of it". 42 here is not an estimate — it is a counted
`grep -c '^- \[ \]'` against an authored tasks.md that has already been through
the full specialist panel, whose findings *added* the two tasks in question
(F1's visible `sighting-facts` line, F6's hold fallback, F7's live region, A6/F5's
absent-scale conditional, less A5's fold of two tasks into one). The failure mode
the cap guards against is a number that will grow; this number has already
absorbed its review.

**Basis — the panel's recommendation, level 3.** `openspec-architect`, which owns
sequencing by the standing tie-break, examined the seam and answered explicitly:
"**Do not split.**" It reached that with its own findings netting −2 to 0 and
anticipating a landing at exactly 40; the actual 42 is two above what it assumed,
not a different situation in kind.

**Basis — the pre-identified seam also breaks this link's specified journey.**
`docs/plans/system-hud/chain.md` states link 1's journey as "the existing
burn-preview walk with the arrival read as a relative duration and the fuel as
tons". The burn preview is `SpaceCommandPanel`, which analysis §9's seam places in
the **second** half. Splitting there would leave the first half with a journey the
design input never described and the second half holding the acceptance gate for
work that shipped a change earlier.

**Alternatives considered and rejected.**

- *Split at analysis §9's `lib/eta.ts` boundary* (half 1: capability, module,
  `FleetRoster`, `GalaxyView` mount, `SpaceStage`; half 2: the four panels).
  Rejected: false R12 in half 1, and it moves the chain doc's specified journey
  out of link 1 entirely.
- *Split at a journey-preserving boundary* (half 1: capability, module,
  `SpaceCommandPanel`, `FleetRoster`, `SpaceStage` ≈ 28 tasks; half 2:
  `FleetActionsPanel`, `ScanControl`, `SightingLog`, the two `countdown()` copies
  ≈ 16 tasks). Genuinely better than the pre-identified seam — it keeps the
  burn-preview journey with the module. Still rejected: half 2 lands at 16 tasks,
  **below** the band the same rule sets, so the split trades one band violation
  for another; and R12 is still false in half 1, because the two duplicated
  `countdown()` copies live in half 2's components. The invariant problem is
  inherent to every seam, not an artifact of the one that was pre-identified.
- *Move R12 into the second half's delta so the first half is honest.* Rejected:
  it lands the capability's central requirement — the one sentence the whole link
  exists to make true — last, in a change named as a follow-on, and leaves the
  first half defining formatting rules with no rule that anything must use them.
- *Compress the task list to 40.* Rejected and explicitly forbidden in the
  writer's delegation: padding a count down to clear a cap hides the size instead
  of managing it, and the two candidate merges (7.2 with 7.3; 5.6 with 5.7) would
  each bury a distinct panel finding inside another task's description, where the
  build would be free to skip it.

**Reversal cost.** Low and still available. Nothing has been implemented; the
seam analysis above is recorded, so if the adversary or the red-phase coverage
table shows the change is too large to review or build in one pass, it can be
split before any developer starts — at the journey-preserving boundary, not the
pre-identified one, with the R12 cost then explicit and accepted. The reversal
gets *more* expensive only once implementation begins, which is the point at which
this ruling should be revisited if at all.

**Flagged for Travis.** This is the one place in the run where a recorded
numeric instruction was not followed. If the cap is meant as absolute rather than
as a heuristic band, the journey-preserving split above is the one to take, and
R12 should move to the second half with its exception list stated in the spec
rather than hidden in a test.

---

## Rulings 19–22 — from adversary round 1

Source: `add-figure-formatting-adversary-r1.md`. Every finding in that report is
ACCEPTED for repair. Four of them cannot be repaired without a decision, because
the design input does not settle them and two rulings collide. Those four are
ruled here; the rest are mechanical repairs routed to the writer.

### FULL-AUTO RULING 19 — an absolute stamp does not go absent when the scale is unserved

**Question (adversary BLOCKER 5, second half).** With no served scale, three
rules collide: R4 mandates the `×N` suffix on every absolute stamp, RULING 8
mandates the absent form when no scale has been served, and `sighting-log`
mandates every row show its `asOf`. A log row with no scale yet is therefore
required to render three different things.

**Ruling.** The collision is resolved by **what the scale is needed for**. A
duration cannot be computed without the scale — the scale is an input to its
value — so RULING 8's absent form applies to durations, unchanged. An absolute
stamp's `T+ Dd HH:MM` is world time and needs no scale at all; only its `×N`
suffix does. So an absolute stamp SHALL render its `T+` portion whenever the
instant is a finite number, and SHALL render its scale suffix as `×—` (the
absent form inside the suffix) when no scale has been served. RULING 8 is
scoped, in its own text, to figures whose *value* depends on the scale.

**Basis.** Precedence level 4, most reversible, on a distinction the existing
rulings already imply: RULING 1 divides a duration by the scale and explicitly
does **not** divide the absolute stamp, so the two quantities already have
different relationships to it. Blanking a stamp that is fully computable would
withhold information the server served, on a surface (`sighting-log`) whose own
requirement mandates showing it — and would do so to signal a fact about a
different field. RULING 16's "the suffix always renders so a reader never infers
it" is preserved exactly: `×—` is present and reads as unknown, where an omitted
suffix would be ambiguous between "scale 1" and "not served".

**Alternatives rejected.** *Render the whole stamp absent* — rejected: it
contradicts `sighting-log`'s standing requirement and hides a value that is
known. *Omit the suffix silently* — rejected: RULING 16 rejected exactly this
ambiguity. *Default the suffix to `×1`* — rejected: it is RULING 8's assumption
in a new place.

**Reversal cost.** One branch in the stamp function and one fixture row.

### FULL-AUTO RULING 20 — a duration that is a cost renders bare; only a deadline takes an affix

**Question (adversary MAJOR 3).** R3 affixes `in` / `left` / `ago` but gives no
rule for which surface takes which, and three deltas describe **cost
magnitudes** — a served sweep duration, a previewed mine duration — as "relative
durations". A sweep that *would take* four minutes is not "in 4m 12s".

**Ruling.** Two forms, distinguished by what the number is. A **magnitude** — how
long a thing takes, quoted before it starts (a served sweep duration, a mine-run
preview, any priced cost in time) — renders **bare**: `4m 12s`, no affix. A
**deadline** — an instant relative to now — takes an affix: `in` for a future
instant, `left` for the remainder of something already running, `ago` for a past
one. Each consuming delta names which form its figure takes; the capability
defines both forms and forbids a surface from choosing freely.

**Basis.** Precedence level 4 on a distinction the design input's own examples
already draw: `docs/plans/system-hud.md` writes the arc label's cost as `4m 12s`
bare and its running state as `2m 40s left`, and the chain doc's rules table
gives `in 4m 12s` for "duration to/since an ETA" — an ETA, not a cost. The rule
is read off the examples rather than invented.

**Alternatives rejected.** *Affix everything* — rejected: `in 4m 12s` on a sweep
cost asserts a deadline that does not exist, which is a false statement about
game state, not a copy preference. *Let each surface choose* — rejected: that is
the per-surface divergence RULING 2 exists to prevent, and it would make the
fixture table unable to pin any surface.

**Reversal cost.** One argument on the duration function; the affix set is
already there.

### FULL-AUTO RULING 21 — the due form is the literal `now`

**Question (adversary MAJOR 4).** R3 says a span of zero or less "reads as due"
without pinning the string, while every other quantity pins an exact output — so
R13's fixture table cannot state a row for it.

**Ruling.** The due form is the literal string `now`, for both the `in` and
`left` directions. A past instant in an `ago` context still renders its positive
magnitude with `ago` (RULING 3's existing scenario), not `now`.

**Basis.** Precedence level 2 — `now` is the shipped player-facing copy
(`frontend/lib/eta.ts:7`, the module this change retires), so keeping it changes
nothing a player reads and keeps the retirement invisible on that one surface.
No design document proposes anything else, and the tests that asserted the
literal are migrating to `data-raw` regardless (task 10.2), so the choice is
unconstrained by test churn and should default to continuity.

**Alternatives rejected.** *`due`* — rejected: no basis, and it changes live copy
for no reason. *An empty string or a dash* — rejected: due is a state, not an
absent value, and R10 reserves the dash for absence.

**Reversal cost.** One string constant and one fixture row.

### FULL-AUTO RULING 22 — `<Figure>` may carry an accessible label

**Question (adversary MAJOR 2).** RULING 16's remedy is an accessible
explanation of the `×N` suffix, but `design.md` closes `<Figure>`'s props to
`raw`, `unit`, `text`, `className` and `data-testid` — so the scenario has no
mechanism and could not be implemented.

**Ruling.** `<Figure>` additionally accepts an optional accessible label
(`aria-label` / `title` pass-through). The architect's prop fence stands
otherwise, unchanged.

**Basis.** Precedence level 3, reading the fence's own stated purpose. The
architect closed the props against `variant`, `size`, `tone` and `emphasis`
because "the first such prop is the moment it starts competing with Catalyst and
setting the type scale". An accessible label sets no type scale, renders no
visible style, and cannot compete with a UI primitive — it is outside the fence's
rationale, not an exception to it. RULING 16 is otherwise unimplementable, and a
ruled remedy with no mechanism is the "written and never really verified" shape
of `README.md` lesson two.

**Alternatives rejected.** *Put the label on a wrapper at each call site* —
rejected: it re-scatters the contract `<Figure>` exists to centralise, at the
one place a screen-reader user depends on it. *Drop RULING 16's label* —
rejected: it was the agreed remedy for a finding two independent reviewers
raised.

**Reversal cost.** One optional prop.

### Note on size

The adversary estimates these repairs at +4–6 tasks, taking the change to
roughly **46–48**. RULING 18's reasoning is unchanged in kind — R12 remains a
whole-tree invariant no seam can halve, and the adversary independently judged
the change "reviewable and buildable in one pass — do not split". The overage is
now larger and is re-flagged for Travis on that basis rather than re-argued here.

---

## Rulings 23–24 — from adversary round 2

Source: `add-figure-formatting-adversary-r2.md` (1 BLOCKER, 4 MAJOR, 5 MINOR, all
residue inside round-1's repairs). All accepted. Two need a decision.

### FULL-AUTO RULING 23 — a duration's `data-unit` token names its form, so byte-identity is decidable

**Question (adversary round-2 BLOCKER 1, and MAJOR 2).** R12's new byte-identity
scenario — the structural close of the `<Figure text>` bypass — is **undecidable
for a duration**. `data-unit` carries one token (`world-ms-span`) while R3 now
defines four outputs for the same raw and scale (`in`, `left`, `ago`, bare
magnitude), and the choice is per-element. A checker given only raw and scale
cannot know which of the four to expect, so an implementer either enumerates the
set or skips the elements it cannot compute — and skipping lets
`<Figure raw={preview.arriveMs} unit="world-ms-span" text={String(remaining)} />`
pass every specified test and print `21646048727`, which is proposal.md's own
headline defect on this link's own journey figure. Separately, a scale-absent
figure carries `data-raw` while its text was produced *without* the formatter,
so the checker has no operand for it either.

**Ruling.** Two parts.

1. **The duration span token splits four ways** in `data-unit`'s closed set:
   `world-ms-span-in`, `world-ms-span-left`, `world-ms-span-ago`,
   `world-ms-span-bare`. The token therefore determines which R3 form the element
   claims, and `(raw, scale, token) → expected text` is a total function, so
   byte-identity is decidable for every duration.
2. **The absent form is a module output**, not the absence of one. Task 1.8
   already makes it a function of the module; when a figure's scale has not been
   served, the expected text is the module's absent form for that quantity. The
   checker's operand set is `(raw, scale-or-unserved, token)` and every element
   with a `data-raw`/`data-unit` pair is checkable — none is skippable.

**Basis.** Precedence level 3, the adversary's own first proposed fix ("split the
token four ways"), chosen over its second ("one sentence admitting the form set as
a stated argument") on level 4, reversibility and decidability: an enumerated
token set is checked by a total function, whereas a "stated argument" leaves the
checker to be told the form by the very call site it is auditing — which is the
bypass again, one level up. The naming objection (a *form* is not a *unit*)
does not bite: `data-unit`'s set already carries `world-ms-span` versus
`world-ms-instant` and `tons-per-world-ms`, so it is already a **kind**
vocabulary rather than a physical-unit one, and this extends that consistently.

**Why this ruling is stated at length.** This is the **fourth** appearance of one
defect family — security S1, RULING 17's rephrasing, round-1 BLOCKER 4's runtime
helper, and now this. The first three fixes each closed a spelling and left the
hole. The lesson, recorded here because it is the run's most transferable: the
invariant "only the formatter produces figure text" is not enforceable by
forbidding *ways of writing a number*; it is enforceable only by making the
element's text a **computable function of its own attributes** and checking it.
Every fix that enumerated a prohibition failed; the fix that makes the expected
value computable is the one that holds.

**Alternatives rejected.** *A separate `data-form` attribute* — cleaner
semantically, rejected on cost: a third attribute on every duration element, when
the existing set is already kind-shaped and can carry it. *Drop the byte-identity
scenario and rely on the static guard* — rejected: the static guard is what the
bypass walks past, which is the whole finding. *Make the scale-absent element
skippable by the checker* — rejected: a checker with a skip branch is a checker
whose coverage an implementer chooses.

**Reversal cost.** Four tokens in one exported union, plus the fixture rows that
name them.

### FULL-AUTO RULING 24 — both arrivals in the drift notice are deadlines, and both take `in`

**Question (adversary round-2 MAJOR 3).** Of the eight durations in the change,
the drift notice's **previewed** arrival is the one whose R3 direction form is
unresolved — and it sits beside the actual arrival in a single comparison line.

**Ruling.** Both figures in the drift notice render as **deadlines with `in`**.
Neither takes `left`.

**Basis.** Precedence level 4 on RULING 20's own distinction. The drift notice
exists to compare *two quotes* — what the commit actually returned against what
the player agreed to — at the moment of commit. Both are future instants read
from the same projected now, so both are deadlines, and `in` is the deadline
affix for a future instant. `left` denotes the remainder of something already
running, which is a different reading and would make the two halves of one
comparison line use two forms for the same kind of number — the precise
ambiguity RULING 20 was made to remove.

**Alternatives rejected.** *Actual takes `left` (the burn is now running) and
previewed takes `in`* — rejected: it renders a comparison in two vocabularies,
inviting the reader to think the two figures measure different things, when the
entire purpose of the line is that they measure the same thing and disagree.
*Both bare magnitudes* — rejected: they are instants, not costs, so RULING 20
sends them to the affixed form.

**Reversal cost.** One argument at two call sites.

---

## Rulings 25–26 — from adversary round 3 (the round cap)

Source: `add-figure-formatting-adversary-r3.md` — **no BLOCKER**; 3 MAJOR, 2 MINOR,
all text edits, +0 tasks. Round 2's ten findings all verified held. Under the
round-cap rule this residue could ride forward as a follow-up change; the
adversary instead recommends fixing MAJOR 1 and MAJOR 3 now "because both surface
as a red test on the first file the developer migrates", and calls that a
scheduling call rather than a gate.

**Orchestrator's disposition: repair all five now.** All three MAJORs sit on one
clause — the containment check — which has now been reformulated four times and
failed each time. Handing a known-broken enforcement clause to the SDET
guarantees the red phase re-derives it under time pressure. Because the round cap
is reached, these repairs get **no fourth adversarial round**; that is recorded
honestly below rather than papered over.

### FULL-AUTO RULING 25 — the containment check is anchored on complete numeric tokens

**Question (round-3 MAJOR 2 and MAJOR 3).** Round 2's relaxation — "the module's
output appears verbatim in the text, and the text contains no other numeric run" —
is simultaneously too strict and too loose:

- **Too strict** for the very case it names as passing. A scan `<option>` reads
  `body · feat-belt-1 · 0m 5s` (`ScanControl.tsx:290`); the host id carries
  digits, so "no other numeric run" fails a compliant element. Its bad exit —
  dropping the host id from the label — is *permitted* by the delta, which
  mandates only kind and duration.
- **Too loose** for `range`. RULING 14 gives range no unit name, so its output is
  a **decimal prefix of its own raw string**: `<Figure raw={833.25} unit="range"
  text={String(833.25)} />` renders `833.25`, which contains `833` verbatim and
  has exactly one numeric run. (`FleetRoster.tsx:211-212`;
  `FleetRoster.test.tsx:365-371` uses `estimatedRange: 833.25`.) That is the
  fifth spelling of the bypass.

**Ruling.** The check has two clauses, both anchored on **complete numeric
tokens** — a maximal run of digits together with any decimal point, thousands
separator or magnitude suffix bound to it:

1. The module's output for this element's `(data-raw, scale, data-unit)` SHALL
   appear in the element's text content as a **complete numeric token** — not
   immediately preceded or followed by a character that would make it a fragment
   of a longer number (a digit, a decimal point, or a separator).
2. The element's text SHALL contain **no complete numeric token equal to a
   full-precision rendering of that element's own `data-raw`**, except where that
   token is the module output matched by clause 1.

The "no other numeric run" clause is **deleted**. Prose digits are irrelevant:
clause 2 constrains only renderings of the element's own raw value.

**Why this is correct where four prior formulations were not.** Verified against
every case in play. `body · feat-belt-1 · 0m 5s`: `0m 5s` is a complete token,
and the text holds no `5000` — passes. `Observed at T+ 2d 04:13 ×1`: the stamp is
the module output, and the text holds no `187980000` — passes. The range bypass:
module output `833` is followed by `.`, so it is a *fragment*, not a complete
token — clause 1 fails, rejected. The tonnage bypass `text={String(47.235…)}`:
`47.2` is followed by `3` — fragment, rejected. Legitimate `47.2 t`: complete
token, and the full-precision raw does not appear — passes. `₡ 28` with raw 28:
`28` is a complete token *and* is the module output, so clause 2's exception
covers it — passes.

**Basis.** Precedence level 3 (the adversary supplied both failing cases and the
anchoring diagnosis) and level 4 (it is the smallest formulation that is total
and decidable). It also keeps RULING 23's thesis intact — the element's text
stays a computable function of its own attributes — which is the one property
that has survived every round.

**Alternatives rejected.** *Keep "no other numeric run" and forbid digits in host
ids* — rejected: host ids are served values this capability may not reshape, and
the delta's own copy rule mandates them. *Give range a unit name so its output
stops being a prefix of its raw* — rejected: it reopens RULING 14, which declined
to invent a physical unit the simulation never decided. *Compare against the raw
only, dropping clause 1* — rejected: it would admit an element whose text is some
*other* correctly-formatted number, which is the swap R11 exists to prevent.

**Reversal cost.** One scenario's wording plus the helper's matcher.

### FULL-AUTO RULING 26 — absence branches on the quantity, not on the mount

**Question (round-3 MAJOR 1).** `tasks.md` 9.5 and `design.md` branch the helper
on *whether the mount served a scale* — a property of the mount — instead of on
*whether the quantity needs a scale*. As written, a compliant `T+ 0d 00:00 ×—`
stamp, and every scale-independent figure on a scale-less mount, would be
asserted to render `—`. The R12 scenario itself is correctly scoped; only the task
and design text are wrong.

**Ruling.** The absent form applies per **quantity**, by whether the scale is an
input to that quantity's value: **durations and rates** go absent when no scale
has been served; **tonnage, credits, range, delta-v** and the **`T+` portion of an
absolute stamp** are scale-independent and render normally, the stamp carrying
`×—` for its suffix (RULING 19). Fix the task and design text; the requirement
stands.

**Basis.** Precedence level 1 among the rulings themselves — this is exactly the
distinction RULING 19 already drew ("a duration needs the scale to compute its
value… an absolute stamp's `T+` is world time and needs no scale"). The task text
simply failed to carry it through, which is the same class of defect as UX F4 and
A6/F5: a ruling that did not reach the artifact that implements it.

**Alternatives rejected.** *Blank every figure on a scale-less mount* — rejected:
it withholds values the server served, for a reason about a different field, and
would make a fleet's tonnage unreadable on the galaxy view's first paint.

**Reversal cost.** Two sentences.

### Two minors, ruled inline

- **Round-3 MINOR 1** — `SpaceStage`'s `Arrives in …` (task 8.1) names no
  direction form, and both admissible builds read badly (`Arrives in in 4m 12s`
  or `Arrives 4m 12s left`). Ruled: the **figure takes the `in` deadline form**
  and the surrounding label drops its own preposition to just `Arrives`, so the
  rendered line reads `Arrives in 4m 12s` with the affix supplied once, by the
  module. Basis: RULING 20 makes an arrival a deadline, not a cost; the
  duplication is a call-site copy artifact, not a formatter question.
- **Round-3 MINOR 2** — task 1.7 omits R9's `<0.1 t/h` floor (pinned in round 2)
  and the negative-rate-to-absent case; only task 2.1's blanket fixture row
  reaches them. Ruled: name both in task 1.7. Basis: task 2.1 is already the
  change's single largest concentration (see below), and a rule reachable only
  through a blanket task is a rule the build can miss.

### Recorded: no fourth adversarial round

The round cap is three and all three are spent. Rulings 25 and 26 and the two
minors are applied **without** adversarial re-verification. The mitigations:

1. Every repair is text-only and adds no task, so it changes no scope.
2. RULING 25's formulation is verified case-by-case in its own text above,
   against all six cases in play — the two legitimate prose-bearing elements and
   four bypass spellings — rather than asserted.
3. These clauses become **executable** in the red phase: R12's scenario is the
   `assertFiguresMatchModule` helper (task 9.5), so an incorrect formulation
   surfaces as a red test on the first migrated file, which is the adversary's own
   stated reason for fixing them now.

**Also carried forward, not a finding:** the adversary notes `tasks.md` 2.1 holds
roughly 69 module-level scenarios' fixture rows behind one checkbox. That is a
concentration risk rather than a defect — but the SDET's red-phase coverage table
must expand it row by row rather than treat 2.1 as one unit, or ~69 scenarios
would share a single pass/fail signal. This is an explicit instruction to the red
phase, recorded here because it is the kind of thing a coverage table silently
collapses.

---

## Kickoff adjudications — the architect's ten flagged findings

Source: `add-figure-formatting-impl-contract.md` §10. The architect reported ten
items rather than reinterpreting them, and asked whether any needs the writer.

**Adjudication: none of the ten requires a spec amendment.** This matters
mechanically, not just editorially — the adversary round cap is spent, so a spec
edit would expire a verdict that cannot be refreshed. Each item below is either
spec-silent (the contract may settle it) or a task/paraphrase defect (the spec
itself is sound). Every settlement is **binding on the SDET and the developer**;
none may be re-decided during the build.

| # | Nature | Adjudication |
|---|---|---|
| **F1** | Task scope, additive | `SpaceCommandPanel` has no `worldTime` prop and all three of its figures are remaining spans. 3.3 threads `worldTime` alongside `scale` at that mount; 4.4 consumes it. Inside existing task scope. **The failure to avoid** is an implementer reaching for a component-local clock instead — a second world-time projection with no requirement behind it, which is the defect `defect-galaxy-clock-assumes-scale-1.md` already records twice. |
| **F2** | tasks.md ordering defect | Real: 3.1/3.2 double-own re-pointing that 6.1, 8.1, 5.3 and 7.1 also own, and sit before them, so the tree does not compile between 3.1 and 6.1. Resolved by **execution order, not by editing tasks.md** — contract §7 Phase E runs 3.1/3.2 as verification tasks (done-condition: absent and unimported) after the call sites move. No task dropped; the change folder is untouched, so the verdict stays current. |
| **F3** | Paraphrase defect, not a spec defect | The spec's own wording is *"rendering exactly `figure-formatting`'s absent form **for that quantity**"* — which already scopes the claim to the figure, not the element's whole `textContent`. The loose reading comes from **task 9.5's paraphrase**, which dropped the qualifier. Contract §5.2 governs: the absent case runs the same containment clauses with `expected = ABSENT_FIGURE`. No spec change; the natural reading is the implementable one. |
| **F4** | Spec-silent | In the settling state the surface renders **no figure** — a plain span with the mandated `Settling…` copy and no `data-raw`/`data-unit` pair — exactly as the unavailable credit balance does. R11 binds *figures*; a surface rendering its own mandated override copy is not rendering one. Binding, because an implementer who attaches the pair fails clause 1 on compliant markup. |
| **F5** | Spec-silent | A `bare` (cost) duration with a negative span renders `0m 0s`, magnitude clamped at zero. Reachable only through a client-derived preview. |
| **F6** | Task scope, corrective | `space-journey.spec.ts:81` carries its **own byte-copy** of `digits()`, so 10.1's "single point of change" is false, and it calls that copy against two testids that become composite wrappers. Deleting the local copy joins 10.1's scope. **This one is markable-done-while-broken and only surfaces at tier 4** — the most expensive place to find it. |
| **F7** | Ownership | Task 1.8's parenthetical is call-site behaviour at six mounts, not module behaviour. Split per contract §9. |
| **F8** | Checkability | The 2.1–2.8 split is coherent; rows gain a stable `id` and a per-group manifest assertion so a group is independently checkable. **Load-bearing:** 2.7's scale-60 row is the only place the rate conversion's *direction* is pinned — drop it and `× scale` / `÷ scale` become indistinguishable again, which is the architect's own round-1 BLOCKER 2. |
| **F9** | Expected | `world-ms-span-ago` has no call site in this change (module and fixtures only). Do not delete it to satisfy a dead-code instinct. |
| **F10** | Visible copy | Two further intended copy changes: `hold-capacity` reads `18.0 t / 40.0 t`, and the word `credits` is dropped wherever `₡` renders. Both must appear in the red-coverage notes so QA and the journey read them as intended, not as regressions. |

**Standing rule for the build, restated because this is where it gets tested:** a
finding that genuinely contradicts shipped spec text halts that task and routes to
the writer. It is not resolved in the contract, in a test, or in code. None of
these ten met that bar; the next one might.

---

## Build adjudications — the developer's one dispute and two interpretation calls

The developer completed 54 of 55 tasks (13.2 is the archive gate, correctly left),
halted on one test dispute rather than resolving it in code, and reported two
interpretation calls rather than making them silently. All three are adjudicated
here. **Two go against the implementation** — recorded because a build report that
ends "everything passes" is exactly where this project has previously stopped
looking.

### Dispute 1 — `GalaxyView.test.tsx:435`: **the developer is right; the fixture is wrong**

The test *"shows a travelling fleet in the roster, with its route and a live ETA"*
asserts `/^11m \d{1,2}s left$/` from a `traveling` fixture that never sets
`Fleet.scale`. Implementing task 6.3 literally (un-defaulted
`myFleets?.[0]?.scale`, per RULINGs 7/8) makes the scale `undefined`, so the
figure correctly renders `—`.

**Adjudicated against the spec:** the implementation is right and the fixture is
incomplete. RULING 8 and `fleet-roster`'s scenario *A countdown renders absent
until a scale is served* both mandate the absent form for a scale-dependent
figure with no served scale — the developer implemented exactly that. The test's
own **intent**, stated in its name, is the *live-ETA* path, which corresponds to
`fleet-roster`'s *A burning fleet counts down to arrival* and requires a served
scale to exercise at all. So the fixture must set `scale: 1`; the assertion
stands as written.

**Only the SDET may make that edit**, and it must also confirm the absent-scale
scenario has its **own dedicated test** — otherwise fixing this fixture would
remove the only coverage of RULING 8's behaviour while appearing to fix a bug.

### Dispute 2 — `scale?: number` on three components: **restore the contract's form**

The developer made `scale` optional on `SpaceStage`, `ScanControl` and
`SightingLog` because the contract's `scale: number | undefined` (required key)
broke `tsc` against four **pre-existing test files this change does not own** —
and a developer may not edit a test file. That was the correct way to be stuck,
and the correct thing to report.

**Adjudicated: restore the contract's required-key form**, and have the SDET add
the prop to those four test files. The contract chose a required key as a
**forcing function** — a mount site that forgets the scale fails to compile
rather than silently rendering the absent form. Runtime behaviour is identical
either way, so the whole value of the decision is the compile-time catch. Links
2a–4 **re-mount every one of these components** into the console dock; that is
precisely when a forgotten scale prop would appear, and precisely when a compile
error is worth four mechanical test-file edits now.

### Dispute 3 — `sell-price-expected`: **a finding against the implementation**

The developer read "the one the player originally expected" as
`sellTons × expectedUnitPrice` — a flat single-price estimate — against the live
`sellPreview.totalProceeds` fold, and reported it as an interpretation.

**Adjudicated: that reading is wrong, and it contradicts a sibling requirement.**
The spec's clause reads "refresh the offer to the server's current applicable
price(s) and **proceeds total**, showing that refreshed figure alongside **the one
the player originally expected**" — the two figures are parallel, so both are
proceeds totals. And *Sell Offer on the Docked Fleet*'s own scenario *A split-fill
preview matches the settlement fold exactly* establishes that proceeds are a
**fold across entries, not tons × price**. So `sellTons × expectedUnitPrice`
differs from the fold whenever a fill splits — meaning the figure labelled "what
you expected" would be a number **the player never saw**, on the one surface whose
entire purpose is to let them compare what they expected against what they got.

**Correct implementation:** show the `sellPreview.totalProceeds` that was on
screen at commit time, captured — no new arithmetic, no new served field, and
consistent with the quote-lock pattern the burn path already uses.

**The test could not have caught this**, which is the more important half. The
developer verified against "the test's inequality assertion" — a test asserting
only that the two figures *differ*. Both the wrong and the right implementation
satisfy that. This is `README.md` lesson two exactly: a test shaped so it cannot
observe the failure. The SDET must strengthen it to assert the expected figure
**equals the captured pre-commit preview total**.

### Sequencing

SDET first (all three test-side edits), then the developer (restore the
required-key form; fix the sell-price figure). A developer never edits a test, and
an SDET never edits production code — the split holds through the repair.

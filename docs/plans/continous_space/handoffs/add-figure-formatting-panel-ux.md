# add-figure-formatting — UX panel review

Reviewer: UX specialist, `/team --chain --full-auto`, link 1 of
`docs/plans/system-hud/chain.md`. Read in full: the change's proposal.md,
design.md, tasks.md, and all five spec deltas
(`openspec/changes/add-figure-formatting/specs/{figure-formatting,
system-space-view,docked-fleet-actions,fleet-roster,sighting-log}/spec.md`);
`add-figure-formatting-analysis.md`; `add-figure-formatting-rulings.md`
(RULING 1–15); `docs/plans/system-hud.md`; `docs/plans/system-hud/chain.md`.
Rulings are binding and not reopened here — findings below report where the
authored spec text does not carry a ruling's own mandate through, or where a
site the change's own tasks.md plans to touch has no spec text backing it,
not where a ruling itself should have gone differently.

**Scope note.** This change is entirely user-facing copy (a presentation
module plus copy-only deltas on four consuming capabilities), so per the
brief this reviewer is the panel's primary pass. No layout, placement, or
backend findings are in scope, and none are proposed here.

**Overall assessment first, since it bears on how to read what follows.**
The `figure-formatting` capability's own 13 ADDED requirements are
unusually thorough for a UX pass — every boundary a reviewer would normally
have to invent (99.95 t, 999.5 range-carry, the 59m59.6s hour-boundary
carry, negative-span due forms, sub-second rounding) is already scenario-
covered, and the absent-value vocabulary (RULING 13) is applied correctly
almost everywhere it's asked to be. The defects found below are
consequently not in the new capability's own rules; they are places where
**the four consuming-capability deltas don't reach as far as the code
changes tasks.md already commits to**, or where a binding ruling's own
mandate (RULING 8, RULING 9) didn't make it from design.md into testable
spec text. That is a narrower, more surgical set of gaps than a first read
of a 13-requirement ADDED capability might suggest, and it is exactly the
class of gap a spec-stage review is supposed to catch before it becomes a
silent behavior change with no scenario pinning it.

---

## Findings

### F1 — MAJOR — The sighting-ghost `asOf` requirement is untouched by this change, and one of its two on-screen sites is left rendering the raw wire value entirely

**Requirement:** `system-space-view` — *A Sighting Ghost Renders at Its
Frozen Position, Never a Predicted One* (`openspec/specs/system-space-view/
spec.md:2306`). **Not** in this change's MODIFIED delta list (only four
system-space-view requirements are touched: Burn Preview, A Commit's Actual
Result, The Focused-Scan Target List, A Running Sweep's Window).

**Evidence.** The live requirement text says a ghost is drawn "labelled
with the record's `asOf`," and its facts surface (shown on highlight/hover)
displays a heading-and-speed readout — the same facts surface, per the
requirement's own cross-reference, "*Foreign Contacts Render at Their
Served Position*" uses. In code there are **two** distinct sites rendering
that `asOf`, both raw today:

- `SpaceStage.tsx:697` — the ghost mark's `sr-only` label: `` `Observed at
  ${mark.asOf}` `` (a raw world-millisecond integer, in a screen-reader-only
  span).
- `SpaceStage.tsx:709` — the **visible**, on-screen `sighting-facts` hover
  panel: `` `Observed at ${shown.mark.asOf ?? '—'}` `` — this is a sighted
  player looking directly at a raw wire integer on hover, the exact
  `21646048727` example the change's own "Why" section names as fault #1.

`tasks.md` §7.2 plans to migrate **only** the first of these ("the ghost
sr-only `asOf` label through the absolute-stamp formatter") — the
`sighting-facts` panel's visible `Observed at` line is not mentioned
anywhere in tasks.md, the analysis's test-migration table, or any spec
delta. It is not filed as a recorded, deliberate exception either (compare
`SpaceStage`'s bearing/speed, which RULING 10 explicitly excepts and files
as `defect-hover-facts-unspecced.md`). This site is simply not present in
either bucket — it falls through.

Independently of which sites get fixed in code: because the governing
requirement is not in the MODIFIED delta list, **neither** site's
presentation is pinned by a testable scenario, so nothing prevents a future
change from reverting or diverging the ghost's `asOf` rendering, and the
archiver has no scenario recording that this requirement's behavior changed
here at all.

**Proposed fix.** Add this requirement to §3.1's MODIFIED targets (a 5th
`system-space-view` block; every one of the 8 existing scenario headings
below must be reproduced verbatim per this repo's own archiver-trap
warning — `A ghost renders at the record's stored position` / `The ghost
layer reads the pile filtered by system` / `A ghost does not move as world
time advances` / `A ghost's stored velocity is displayed, not integrated` /
`A system with more records than one page draws the newest page` / `A
ghost is visually distinct from a live contact` / `A clean-sweep record
draws no ghost` / `A record for another system draws no ghost here`).

Append to the requirement body, after "...visually distinct from a live
contact and from an own fleet, and labelled with the record's `asOf`.":

> The `asOf` label is presented per `figure-formatting` as an absolute `T+`
> stamp and carries its raw served value wherever it is rendered — on the
> mark itself and on its facts surface when the ghost is highlighted or
> hovered. A label rendered into a screen-reader-only element carries the
> formatted text but no `data-raw`/`data-unit` attribute, per
> `figure-formatting`'s toast/aria-label exemption.

New scenario to add (only the first scenario's THEN is amended; this one
is new):

```
#### Scenario: A ghost's asOf label reads as a formatted stamp, on the mark and on its facts surface
- **WHEN** a ghost mark is drawn, and separately when it is highlighted or hovered
- **THEN** both its own label and its facts-surface "Observed at" line present the record's `asOf` per `figure-formatting` as a `T+` stamp, never as a raw world-millisecond integer
```

And amend the first scenario's THEN clause:

```
#### Scenario: A ghost renders at the record's stored position
- **WHEN** the system-filtered pile read serves a target-naming record for the
  open system
- **THEN** a ghost mark is drawn at that record's stored position, labelled with
  its `asOf`, presented per `figure-formatting` as a `T+` stamp
```

Also add task coverage for the `sighting-facts` panel's `Observed at` line
(currently missing from tasks.md §7 and §9).

---

### F2 — MAJOR — `Burn Commit Reports Its Outcome` — R12's own canonical example site — is missing from the MODIFIED delta list

**Requirement:** `system-space-view` — *Burn Commit Reports Its Outcome*
(`openspec/specs/system-space-view/spec.md:620`). Not in this change's
4-item `system-space-view` MODIFIED list.

**Evidence.** This requirement's text is: "on success, success feedback
naming that the order was accepted and carrying its served arrival time."
This is the requirement governing `SpaceCommandPanel.tsx:135`'s burn
success toast — `` `Burn committed — arriving at ${burn?.ArriveMs ?? '?'}.`
`` — which interpolates a **raw world-millisecond integer** today. This
exact site is `figure-formatting`'s **own R12 scenario**'s worked example:
"A raw wire number does not reach copy — WHEN a burn commits successfully
THEN the success toast names the arrival as a formatted duration produced
by the shared module, not as an interpolated world-millisecond integer.
[`SpaceCommandPanel.tsx:135` today.]" `tasks.md` §4.2 plans exactly this
fix. Yet the requirement that actually specifies what the toast says is
untouched — so R12's own example is enforced by a generic capability-level
scenario about the module's usage, never by the consuming requirement that
states what the toast's arrival figure *is*.

**Proposed fix.** Add to §3.1's MODIFIED targets. Reproduce the 3 existing
scenario headings verbatim (`A successful burn commit reports success` / `A
failed burn commit reports the mapped reason` / `A burn commit failure with
no distinguishable reason still reports safely`); only the first's THEN
changes.

Append to the requirement body, after "...carrying its served arrival
time.":

> The arrival time is presented per `figure-formatting` as a relative
> duration and carries its raw served value on its element, never
> interpolated as a raw world-millisecond integer into the toast string.

Amend the first scenario:

```
#### Scenario: A successful burn commit reports success
- **WHEN** a burn order commits successfully
- **THEN** success feedback is shown carrying the order's served arrival time, presented per `figure-formatting` as a relative duration
```

---

### F3 — MAJOR — `Sell Commit`'s price-changed rejection carries two figures the change will reformat, but the requirement is untouched

**Requirement:** `docked-fleet-actions` — *Sell Commit*
(`openspec/specs/docked-fleet-actions/spec.md:223`). Not in this change's
6-item `docked-fleet-actions` MODIFIED list (*Sell Offer on the Docked
Fleet* is touched; *Sell Commit* is a separate, adjacent requirement and is
not).

**Evidence.** *Sell Commit*'s own text: on a "price changed" slippage
rejection, "SHALL instead refresh the offer to the server's current
applicable price(s) and proceeds total, showing that refreshed figure
alongside the one the player originally expected." This governs
`FleetActionsPanel.tsx:449`'s `sell-price-changed` copy — `The price moved
from {repricedFrom}` — which `tasks.md` §5.4 explicitly plans to migrate
("`sell-proceeds-preview`, `refuel-cost-preview`, and the
`sell-price-changed` toast copy through the credits formatter"). This is a
textbook instance of the exact problem R11 exists to solve: **two credit
figures rendered together** (the expected total and the refreshed total),
which per R11's own scenario ("A composite line carries one raw value per
figure") must become two separate elements, each with its own `data-raw`.
Without this requirement in the delta, nothing states that these two
figures must each go through `figure-formatting` independently, and the
"commit-drift-notice split into four elements" fix (F-covered elsewhere in
this change, for the burn preview) has no sibling instruction here for the
structurally identical sell case.

**Proposed fix.** Add to §3.2's MODIFIED targets. Reproduce the other 3
scenario headings verbatim (`A successful sale refreshes hold and balance`
/ `A failed sale toasts player-facing copy, not raw server text` /
`Re-committing a re-priced sale uses a new operation key`); only the
price-changed scenario's THEN changes.

Append to the requirement body, in the price-changed sentence:

> ...showing that refreshed figure alongside the one the player originally
> expected — each presented per `figure-formatting` as a credit figure, in
> its own element carrying its own raw value, never combined into a single
> interpolated string — so the player can accept or abandon the new price
> from inside the flow without re-navigating...

Amend the scenario:

```
#### Scenario: A price-changed rejection refreshes the offer instead of freezing it
- **WHEN** the sell command fails with the "price changed" slippage
  rejection
- **THEN** the offer refreshes to the server's current applicable price(s)
  and total proceeds, displaying that figure alongside the player's
  originally expected one — each presented per `figure-formatting` as a
  credit figure in its own element with its own raw value — rather than
  leaving the stale pre-rejection offer on screen
```

---

### F4 — MAJOR — RULING 9's explicit "state the resolution loss" mandate is not in the `sighting-log` delta text

**Requirement:** `sighting-log` — *The Sighting Log Lists the Corporation's
Own Pile in Served Order*.

**Evidence.** RULING 9's own Ruling text: "The `sighting-log` MODIFIED
block **states the resolution loss explicitly** rather than leaving a
reader to find it." This is a binding instruction about what the *spec
text* must contain, not merely a design.md note. The actual delta as
authored contains no sentence and no scenario about two records rendering
an identical `T+` stamp when they fall in the same minute — it states only
that `asOf` "is presented per `figure-formatting` as an absolute `T+`
stamp." A reader of this delta alone has no way to learn that the pile's
own ordering rationale ("the pile is ordered by each record's `asOf`, the
instant the light left") can now produce two adjacent, indistinguishably-
stamped rows — which, combined with the row's raw host id being the only
other differentiator, could read as a duplicate-row rendering bug rather
than two genuinely distinct sightings seconds apart.

**Proposed fix.** Append to the requirement body, immediately after the
`asOf`/host-id paragraph:

> Because the absolute stamp is minute-resolution (`figure-formatting`'s
> `T+ Dd HH:MM`), two records whose `asOf` values fall within the same
> minute render an identical stamp. The row order — served, never
> client-sorted — remains the only visible signal of their relative
> sequence; this is accepted rather than remedied by a seconds field on
> this surface alone, per `figure-formatting`'s one-format-everywhere rule.

New scenario:

```
#### Scenario: Two records within the same minute render identical stamps, distinguished only by row order
- **GIVEN** two served records whose `asOf` values fall within the same minute
- **WHEN** their rows are shown
- **THEN** both display the identical `T+ Dd HH:MM` stamp
- **AND** their relative order in the list — never their stamps — is what shows which was observed first
```

---

### F5 — MAJOR — RULING 8's "no served scale → absent, never scale 1" behavior has no testable scenario anywhere

**Requirement:** `fleet-roster` — *One Row Per Owned Fleet, Derived From
Kinematic State* (already MODIFIED by this change — this is a gap in an
existing delta target, not a missing target).

**Evidence.** RULING 8 (binding): "When a mounting view has no served
scale yet..., a duration renders in the explicit absent form, not at an
assumed scale of 1." `design.md`'s own decision assigns this to "the
mounting view," naming "GalaxyView's roster mount before its first fleet
read lands" as one of exactly two sites. `GalaxyView.tsx:182`'s
`useWorldTime(myFleets?.[0]?.worldTime ?? galaxy?.worldTime)` runs on every
galaxy-view session before the first fleet read resolves — this is a
common, first-paint state, not an edge case. `Fleet.scale` is optional on
the wire (confirmed by the analysis, `lib/types/fleet.ts:163`), so this
state is reachable in production, not merely a type artifact.

`figure-formatting`'s own R1 scenario ("A missing scale does not default to
1") only pins the **formatter's** behavior when called with no scale
argument — a type-level rejection, meaning the call literally cannot
compile without a scale. It says nothing about what the **caller**
(`FleetRoster`, at its `GalaxyView` mount) renders in the moment it has no
scale to pass in the first place — which is exactly the responsibility
design.md assigns to the mounting view and RULING 8 mandates. No scenario
in `fleet-roster`'s delta, or anywhere else in the five delta files,
states this caller-side behavior as a testable rule.

**Proposed fix.** Append to *One Row Per Owned Fleet, Derived From
Kinematic State*, after the sentence introducing the countdown clause:

> WHEN the mounting view has not yet received a served world-clock `scale`
> for a fleet whose current order has a known completion time, that row's
> countdown SHALL render `figure-formatting`'s absent form rather than
> being computed at an assumed scale of 1.

New scenario:

```
#### Scenario: A countdown renders absent until a scale is served

- **GIVEN** the mounting view has not yet received a served `scale` for a fleet whose order has a known completion time
- **WHEN** that fleet's row is rendered
- **THEN** its countdown shows `figure-formatting`'s absent form (`—`), never a duration computed at an assumed scale of 1
```

(Note the blank-line-after-heading formatting this file already uses,
per the analysis's §3.3 note — reproduce it for consistency with the
rest of this MODIFIED block.)

---

### F6 — MAJOR — `docked-fleet-actions`' own hold readout still lies "0 / 0 t" for an unloaded roster; the roster-row fix (RULING 13) wasn't extended to it

**Requirement:** `docked-fleet-actions` — *Fleet Panel Cargo Hold Readout*
(already MODIFIED by this change).

**Evidence.** `FleetActionsPanel.tsx:96-98,318,356,365`:
```
const roster = fleet?.roster
const held = useMemo(() => roster?.cargo ?? {}, [roster?.cargo])
const freeHold = roster?.freeHold ?? 0
const cargoUsed = (roster?.cargoCapacity ?? 0) - freeHold
...
{cargoUsed} / {roster?.cargoCapacity ?? 0} t
...
<li data-testid="hold-free">{freeHold} t free</li>
```
This is the **identical `?? 0` lie** RULING 13 named and fixed for
`FleetRoster`'s fuel/range fallback ("a fleet with no served roster reads
`0t fuel` today, which is indistinguishable from a dry fleet"), present
unaddressed in the acting fleet's own hold readout. Nothing in this
requirement's MODIFIED text, or in `tasks.md` §5.1 ("Cargo hold readout...
through the tonnage formatter"), touches this fallback — task 5.1 only
plans to route the *existing* values through the formatter, not to change
what value is computed when `roster` itself is absent.

The result after this change ships: `FleetRoster`'s row for a fleet with no
served roster correctly reads `— t fuel` (per this change's own fix), while
`FleetActionsPanel`'s hold readout for that **same fleet** reads `0 / 0 t ·
0 t free` — a lying zero, sitting directly beside a correctly-absent
sibling figure on the same view. This is precisely the cross-surface
divergence RULING 2 (one formatting capability, not four) exists to
prevent, reintroduced one requirement over from the one this change fixed.

**Proposed fix.** Append to the requirement body, after "...used versus
total capacity...":

> WHEN the fleet read has not yet served roster fields for the acting
> fleet, the readout SHALL show `figure-formatting`'s absent form for used
> capacity, total capacity, and free hold, rather than substituting zero —
> a fleet whose roster has not loaded is not indistinguishable from a fleet
> holding an empty hold.

New scenario:

```
#### Scenario: An unloaded roster reads as absent, not an empty hold
- **WHEN** the fleet panel renders for an acting fleet whose fleet read has not yet served roster fields
- **THEN** the hold readout shows the `figure-formatting` absent form for used/total capacity and free hold, never `0 / 0 t` or `0 t free`
```

---

### F7 — MAJOR — The Credit Balance Readout's live region announces nothing on a transition to or from "unavailable"

**Requirement:** `docked-fleet-actions` — *Credit Balance Readout*
(already MODIFIED by this change — the delta adds the sentence "the
announced copy uses the same `figure-formatting` presentation as the
visual readout").

**Evidence.** `FleetActionsPanel.tsx:344-346`:
```
<span className="sr-only" role="status" aria-live="polite" data-testid="balance-live-region">
  {credits === null ? '' : `Balance ${credits} credits`}
</span>
```
When `credits` is `null` (the unavailable case this same requirement's
scenario "An unavailable balance reads as unavailable, not as a figure"
governs), the live region's content becomes an **empty string**. A screen
reader announces nothing on that transition — a sighted player sees the
visible balance flip to italic "Unavailable" (`FleetActionsPanel.tsx:341`);
a screen-reader user learns nothing changed at all. This is the
accessibility-inverse of the same fault this change's absent-value work
(R10) exists to fix elsewhere: a real state change (available → unavailable,
or the reverse, once a session balance resolves) is silently dropped for
assistive technology. The existing scenario "A balance change is announced
to assistive technology" only covers a number-to-number change from a
settled sale/refuel — it does not cover this transition, and nothing else
in the requirement does either. Since this requirement is directly amended
by this change and the absent-value vocabulary is a first-class subject of
this link, the gap is in scope here, not a pre-existing defect to file
separately.

**Proposed fix.** Append to the requirement body, after the existing
`aria-live` sentence:

> The readout SHALL announce a transition between showing a balance figure
> and showing the unavailable indication, in either direction, to
> assistive technology via that same live region — the region SHALL NOT
> render as empty text when the balance becomes unavailable.

New scenario:

```
#### Scenario: A transition to or from an unavailable balance is announced
- **WHEN** the credit balance readout transitions between showing a figure and showing the unavailable indication, in either direction
- **THEN** the transition is announced via the accessible live region, not left as an empty announcement
```

---

### F8 — MINOR — The `×N` world-clock-scale suffix has no explanatory affordance, and its per-row repetition on the sighting log is worth a second look

**Requirement:** `figure-formatting` — *An Absolute World Instant Reads as
`T+` From the Epoch With Its Served Scale* (R4); consumed in this change
only by `sighting-log`'s `asOf` (the vitals-strip clock cell that also uses
this format is link 2a's placement, out of scope here).

Not asking to overturn R4 (ruled, and the `×N` suffix is the whole point of
keeping the absolute stamp from being read as wall time) — flagging two
readability consequences worth a scenario or a label, per the brief.

1. **No affordance explains what `×N` means.** A first-time player seeing
   `T+ 2d 04:13 ×60` on a sighting-log row has no in-UI way to learn that
   `×60` names the world-clock's current real-time multiplier rather than,
   say, a zoom level or a stack count. This is copy, not layout — an
   accessible label costs nothing structurally.

2. **Per-row repetition on the sighting log specifically.** R4's own rule
   is universal ("a scale of exactly 1 still renders its suffix" — no
   per-surface carve-out), so every row of the sighting log will repeat the
   identical `×60` (or whatever the corp's current scale is) on every row.
   Unlike the vitals-strip clock (a single instance), a list surface
   repeating the same suffix N times risks reading as if each sighting was
   taken at a *different* scale, rather than the shared, unchanging one —
   the opposite of what the suffix is there to communicate.

**Proposed fix.** Add an accessible-label scenario to R4 (applies wherever
the absolute-stamp format is used, so it covers both concerns without
touching layout):

```
#### Scenario: The scale suffix carries an accessible explanation
- **WHEN** an absolute `T+` stamp is rendered with its `×N` suffix
- **THEN** the element carries an accessible label or title stating that the world clock is running at N times real time, so the suffix's meaning does not depend on a player having read external documentation
```

If the writer judges the per-row repetition genuinely undesirable on
`sighting-log` specifically (a placement decision, arguably link 2b/3's
territory rather than this link's), record it as a named, deliberate
choice in this change's design.md rather than leaving it to be discovered
on screen — but this reviewer does not recommend re-opening R4 to add a
per-surface carve-out, which RULING 2 explicitly forbids.

---

### F9 — MINOR — R9's rate formatter can round a genuinely positive rate to the same text as a true zero rate

**Requirement:** `figure-formatting` — *A Rate Reads Per the Wall-Clock
Time Unit the Player Waits In* (R9).

**Evidence.** R9 renders one decimal place and floors to `t/h` at the
bottom of its unit ladder. A served, real, nonzero rate small enough that
its `t/h` magnitude is below 0.05 would round to `0.0 t/h` — textually
identical to R9's own explicit "a zero rate renders `0.0 t/h`" case. This
is the reciprocal of the concern the brief named for tonnage (`0.0 t` dry
vs `—` unknown, "the consequence is stranding"): here the consequence of
conflating "costs nothing" with "costs a small but real, rounded-away
amount" over a long station-keeping hold is the same species of risk — a
player reading `0.0 t/h` as free when it is not. `docked-fleet-actions`'
own delta text notes the underlying rate has "a floor clamp" server-side
(`space.StationKeepRate`), which may already make this unreachable for
station-keeping specifically — this reviewer could not confirm the floor's
magnitude is high enough to guarantee it never rounds to `0.0` at one
decimal in `t/h`, and R9 also covers `roster.miningRate`, whose floor
behavior is not discussed anywhere in this change.

**Proposed fix.** Extend R9 with the same zero-vs-genuinely-small guarantee
R10 already gives every other quantity between its zero and absent forms:

```
#### Scenario: A rate too small to show at one decimal is not shown as a true zero
- **WHEN** a served rate is strictly positive but rounds to `0.0` at its selected unit
- **THEN** the result reads distinguishably from a true zero rate (for example `<0.1 t/h`), rather than the identical `0.0 t/h` text a genuinely zero rate renders
```

---

### F10 — MINOR — The range figure's only unit context is an un-pinned component-local word

**Requirement:** `fleet-roster` — *The Roster Row Shows Held Fuel and an
Estimated Range* (already MODIFIED by this change).

**Evidence.** Per RULING 14 (not contested here), the range figure carries
a magnitude suffix and no unit name (`13.9k`, bare). Today's code already
appends a literal, hardcoded word beside the figure —
`FleetRoster.tsx:211`: `{f.roster.estimatedRange ?? 0} range` — and the
scoping doc's own vitals-strip mock shows the same pattern (`47.2 t ·
range 13.9k`). That word is the *only* thing giving a bare `13.9k` meaning
on screen, but it exists only as component copy, not as anything the
requirement obliges an implementer (this one, or a later placement change)
to keep adjacent to the figure.

**Proposed fix.** Append to the requirement body, after "...range as a
magnitude-suffixed figure)...":

> Because the range figure carries no unit name of its own
> (`figure-formatting`'s *A Range or Distance...* rule), the row SHALL
> render it adjacent to a label identifying it as a range, so the bare
> magnitude-suffixed number is never shown with no textual context for
> what it measures.

New scenario:

```
#### Scenario: A bare range figure is never shown without its label
- **WHEN** a roster row's range figure is rendered
- **THEN** it is shown adjacent to a label identifying it as the fleet's estimated range, not as a bare magnitude-suffixed number with no surrounding context
```

---

## What was checked and found adequately covered (no finding)

- **The absent-value vocabulary itself (RULING 13/R10)** is applied
  consistently and correctly everywhere it's asked to be: the credit
  override is explicit and cross-referenced from both directions
  (`figure-formatting` R10's own last scenario, and `docked-fleet-actions`'
  *Credit Balance Readout*); `fleet-roster`'s fuel/range `?? 0` fix has its
  own scenario; zero-vs-absent is scenario-pinned for tonnage, credits,
  range, and delta-v.
- **Toasts, `aria-label`s, and live regions going through the formatter but
  carrying no `data-raw`** (RULING 12) is stated explicitly, twice — once
  in `figure-formatting` R11's own scenario, once in *Credit Balance
  Readout*'s amended text.
- **Announcement-frequency risk for the per-second countdowns**: checked
  `mine-countdown` (`FleetActionsPanel.tsx:421`) and `scan-countdown`
  (`ScanControl.tsx:210`) directly — neither element is itself an
  `aria-live` region (only the balance and error regions are), so the
  `M:SS` → `Nm Ss` shape change does not introduce or worsen a repeated-
  announcement problem; both old and new forms update at the same
  one-second cadence.
- **The four named visible copy changes** (mine/scan countdown shape,
  `stationkeep-rate`'s wall-clock conversion, the roster's `0t fuel` →
  `—`, range's magnitude-suffix-no-unit) are each stated as intended
  behavior in the proposal and design.md, and each has scenario coverage
  either generically in `figure-formatting` or specifically in the
  consuming delta. No finding.
- **`commit-drift-notice`'s four-figures-in-one-element problem** is
  correctly identified and fixed with its own scenario (R11, and *A
  Commit's Actual Result...*'s amended text) — this is the model F3 above
  asks the writer to apply to the structurally identical `sell-price-
  changed` case.

## Verdict

**NEEDS SCENARIOS.** Seven MAJOR findings (F1–F7) are spec-completeness
gaps, not disagreements with the rulings: each names a site `tasks.md`
already commits to changing, or a ruling's own explicit mandate, that has
no corresponding requirement text or scenario in the five delta files as
authored. All seven are additive amendments to requirements already open
in this change (or, for F1/F2/F3, a requirement one door down from one
already open) — none requires reopening a ruling, none touches layout or
backend, and the proposed text above is paste-ready against each
requirement's exact current wording. Three MINOR findings (F8–F10) are
polish-level completions of guarantees this change already establishes
elsewhere for sibling cases.

# `add-vitals-strip` — open questions and rulings

Link 2a of the system-HUD chain (`docs/plans/system-hud/chain.md`), run under
`/team … --full-auto`. Every user gate is lifted; every open question is ruled
in-run by the precedence in `.claude/skills/openspec-team-workflow/SKILL.md`
§ "Full-auto chains":

1. the chain doc's / scoping doc's recorded lean,
2. a settled decision in root `CLAUDE.md` or `openspec/project.md`,
3. the panel's recommendation,
4. the most reversible option.

A ruling with a recorded basis is a decision. A choice without one is a guess,
and guesses are forbidden — a question needing information nobody in the repo
has is a hard stop, not a ruling.

---

## Rulings made at orchestration open (before authoring)

These are the leans the chain doc and scoping doc already carry for link 2a.
They are entered here so the writer authors from a ruling, not from a document
it has to interpret.

### FULL-AUTO RULING 1 — the strip and dock belong to a new capability `system-console`

**Question.** Do the strip and (later) dock live under `system-space-view`, or
earn their own capability?

**Ruling.** A new capability, `system-console`. This change ADDs it, carrying
the strip half only; link 2b MODIFIEs it to add the dock.

**Basis.** Precedence 1 — `docs/plans/system-hud/chain.md` "Open decisions
gating the chain", row *Who owns the strip and dock*: "**New:
`system-console`.** Collapse, tabs, open-on-select and Esc are behaviours that
outlive any placement. `system-space-view` keeps *what the canvas draws and how
you pick*; `system-console` is *what floats over it*."

**Alternatives rejected.** (a) Hang the strip off `system-space-view` — makes
every later placement change reopen a 44-requirement spec, and 2b/4 would each
have to MODIFY it again. (b) Split strip and dock into two capabilities — the
dock's collapsed state *is* the strip; two capabilities could disagree about
one surface.

**Reversal cost.** Before archive: rename one delta folder. After archive:
a capability retirement, which
`docs/plans/continous_space/handoffs/README.md` lesson four records as trading
a mechanical gate for a manual one — expensive. This ruling is therefore
load-bearing and is taken on the chain doc's explicit lean, not inferred.

### FULL-AUTO RULING 2 — the `85vw` floor is a MUST, stated as a requirement

**Question.** Is the no-mobile-layout constraint a note or a testable clause?

**Ruling.** A requirement in `system-console` with a scenario: the strip and
its cells remain fully legible and non-overflowing at and above an `85vw`
viewport width; no layout below that width is specified, produced, or tested.

**Basis.** Precedence 1 — chain doc "What every link must not do": "Produce a
mobile layout. The `85vw` cap the column had is the floor." and the 2a Touches
bullet, which names "the `85vw` floor as a MUST".

**Alternatives rejected.** Leaving it in design.md prose — an unstated floor is
what lets a later link quietly ship a responsive collapse nobody ruled on.

**Reversal cost.** One requirement, one scenario.

### FULL-AUTO RULING 3 — the strip carries no verbs, stated as an invariant

**Question.** May any strip cell be interactive?

**Ruling.** The strip carries **no verbs**: no control that commits, cancels, or
mutates server state. The one interactive affordance permitted is the fleet
cell's **chevron**, which is a *selection* delegate (switch acting fleet) and
mutates nothing on the server. The spec states this as an invariant with a
scenario that a docked fleet's strip offers no refuel/sell/mine/jump control.

**Basis.** Precedence 1 — scoping doc "Surface 1": "The strip carries **no
verbs**. It is the instrument panel; commands are in the dock. That split is
what gives the two weights the current column lacks." Chain doc link 2a
Delivers: "always present, full-width, **no verbs** — the instrument panel",
and separately requires the chevron.

**Alternatives rejected.** Treating the chevron as a verb and moving it to the
dock — the dock does not exist until 2b, and the chain doc explicitly places the
chevron on the strip in 2a.

**Reversal cost.** One requirement.

### FULL-AUTO RULING 4 — the state pill is a projection of `roster-status.ts`, never a second derivation

**Question.** Where does the pill's state come from?

**Ruling.** The pill renders a projection of the existing derivation in
`frontend/components/fleet/roster-status.ts` over the same served inputs the
roster row uses. The spec states that the pill and the roster row for the same
fleet can never disagree, and that no second state machine exists. If the pill
needs a distinction the existing derivation does not make, the derivation is
extended once and both surfaces read the extension.

**Basis.** Precedence 1 — chain doc link 2a, "**What the state pill is not.** It
is a projection of served state through `roster-status.ts`'s existing
derivation, never a second state machine. If the pill and the roster row can
disagree, one of them is wrong."

**Alternatives rejected.** A strip-local derivation from `Fleet.state` +
`attachedTo` + action ETA — this is exactly the "built and never called" /
"second divergent implementation" species catalogued in the handoffs README's
lesson one and lesson seven.

**Reversal cost.** N/A — this is a prohibition on divergence, not a choice
between shapes.

### FULL-AUTO RULING 5 — the cost overlay reads lifted preview state, never a second query

**Question.** How does the fuel gauge learn the previewed burn cost?

**Ruling.** The burn-preview state the command panel holds today is **lifted to
the mounting view** and passed to the strip. The strip issues no preview
request of its own, holds no preview cache of its own, and renders a cost
overlay only for a preview that has resolved for the currently selected target
and the acting fleet. A failed or stale preview shows no overlay (it must not
be presented as a current quote).

**Basis.** Precedence 1 — chain doc link 2a "Sizing risk": "the cost overlay
reads `BurnPreview.fuelCostTons` and `affordable` off the preview the command
panel already holds — lift that state to the view, do not re-query." Reinforced
by the live requirement `system-space-view` "A Failed or Stale Preview Is Never
Presented as a Current Quote".

**Alternatives rejected.** A second `useBurnPreview` in the strip — doubles the
request rate and creates two quotes that can disagree, which the live
stale-preview requirement already forbids.

**Reversal cost.** One prop.

### FULL-AUTO RULING 6 — every strip figure renders through `@/lib/format`

**Question.** May the strip format any figure locally?

**Ruling.** No. Every player-facing figure the strip renders goes through
`frontend/lib/format/` and carries the `data-raw` / `data-unit` contract that
`figure-formatting` R12 ("A Player-Facing Figure Is Produced Only By the Shared
Formatter") and R11 ("Every Formatted Figure Carries Its Raw Served Value on a
Data Attribute") already impose tree-wide. `data-unit` is a **closed, exported
vocabulary** (`FigureUnit` in `frontend/lib/format/figures.ts`); a strip figure
that needs a form the vocabulary does not carry **extends the vocabulary** —
new token, new fixture rows, new requirement text in a `figure-formatting`
MODIFIED delta — and never invents a token at the call site.

**Basis.** Precedence 1 — chain doc "What every link must not do": "every figure
renders through `lib/format/` with its `data-raw`/`data-unit` contract";
precedence 2 — the live `figure-formatting` spec, whose R12 is a whole-tree
invariant. Link 1's Taught record: "`data-unit` is a kind vocabulary … now
closed and exported; links 2a–4 extend it rather than inventing tokens at call
sites."

**Alternatives rejected.** A strip-local exception for gauge labels — R12 is
whole-tree and, per link 1's Taught record, cannot be half-satisfied behind an
exception list without shipping it false.

**Reversal cost.** N/A — inherited invariant, not a new choice.

### FULL-AUTO RULING 7 — what this change deletes, it deletes here

**Question.** May any replaced surface survive the change behind a flag?

**Ruling.** No coexistence, no flag, no legacy toggle. In this change: the
credits readout and the cargo-hold readout leave `FleetActionsPanel` (its verbs
stay until 2b), and the twelve-button on-screen camera cluster in
`SpaceStage.tsx` becomes exactly four (orbit, zoom in, zoom out, recenter).
Keyboard orbit/pan and pointer orbit/pan are unaffected — `system-space-view`
"Space View Camera Is Keyboard-Operable" is not modified by this change.

**Basis.** Precedence 1 — chain doc "Ground rules": "solo toy, burn the boats.
No coexistence period … Each link deletes what it replaces in the same change."
Precedence 2 — `MEMORY.md` "Solo toy, no backcompat": never plan migrations or
backwards compat.

**Alternatives rejected.** Keeping the readouts in both places for one link —
two renderings of one figure that can disagree, which is the exact fault the
pill ruling forbids.

**Reversal cost.** Git revert of one change.

### FULL-AUTO RULING 8 — zero backend work; a wanted field means the link is mis-scoped

**Question.** What if a strip cell needs a figure the wire does not carry?

**Ruling.** No backend field, endpoint, query, or wire-shape change is in scope.
If authoring or implementation finds a cell whose figure is not served, that
cell is **re-scoped against what is served** and the gap is recorded here as a
finding — it does not become a backend task, and it does not become a client-side
computation of a rule-bearing value (`figure-formatting` R14 forbids the
formatter deriving one, and the anti-mirror register forbids a TypeScript mirror
of a Go rule).

**Basis.** Precedence 1 — chain doc: "**No backend work anywhere in this
chain.** … A link that finds itself wanting a new field is mis-scoped, not
under-served." Precedence 2 — root `CLAUDE.md`, the Go-sole-authority /
anti-mirror rule for `space`.

**Alternatives rejected.** A small client-side derivation "just for display" —
this is how a second rule implementation enters, and the repo already registers
every rule-bearing Go package as anti-mirror.

**Reversal cost.** N/A — scope constraint.

---

## Rulings made during authoring

Input: `docs/plans/continous_space/handoffs/add-vitals-strip-analysis.md`
(834 lines, the analyst's decomposition). Section references below are to that
file.

### FULL-AUTO RULING 9 — the link splits at the burn-preview lift; the second half enters the chain as `not authored`

**Question.** The analyst's honest estimate is **≈57 tasks** (§ 7.2), against a
40-task cap. Split, or run long as link 1 did at 55?

**Ruling.** **Split**, at the analyst's seam (§ 7.3):

- **`add-vitals-strip`** (this link, ~40 tasks) — the strip, all five cells, the
  plain fuel gauge, the state pill, the chevron, the camera cluster shrink, the
  panel readout removals, and every whole-surface invariant.
- **`add-burn-cost-overlay`** (new link, ~15 tasks) — the burn-preview lift to
  the mounting view, `SpaceCommandPanel`'s prop conversion and its 34-test
  harness migration, the § 5.1 defect fix, the gauge cost overlay, and the
  `A Failed or Stale Preview Is Never Presented as a Current Quote` MODIFIED.

The new row is inserted in `docs/plans/system-hud/chain.md` immediately after
2a as **link 2a-ii**, before 2b, with state **`not authored`**.

**Basis for splitting.** Precedence 2 —
`.claude/skills/openspec-team-workflow/SKILL.md` § Chains: "Links are sized to
20–40 tasks; a link that grows past that under panel review is split before
authoring continues (hexaverse's links grew from 47 to 131 tasks, and every
adversary round and dev pass re-read all of it)." 57 is a **pre-panel floor**,
not a ceiling: link 1 went from an implied ~30 to a final 55 because the panel
added, and this analyst has already found six requirements the chain doc did not
name. Unsplit, this link realistically lands at 65–75.

**Basis for this seam rather than another.** The analyst's argument (§ 7.3)
distinguishes it from link 1's non-split correctly. Link 1 ran to 55 rather than
splitting because its R12 was a **tree-wide** invariant over components the
change did not own, so no seam could half-ship it without an exception list.
Every whole-surface invariant here — no verbs (R2), always present (R1), no
reads (R11), the width floor (R14), the single-announcer rule (R13) — is a
property of the strip's *own* elements and is fully true of a strip whose fuel
gauge has no overlay yet. The second link adds one segment to one gauge and
re-asserts none of them. The seam also falls on a real module boundary: the
preview lift is the only part touching a file the strip otherwise never opens.

**Alternatives rejected.** (a) Run long at ~57–75 like link 1 — rejected because
link 1's reason for running long does not apply here, and the cap exists
precisely because every adversary round and dev pass re-reads the whole change.
(b) Split the camera cluster into its own change — the analyst measured this at
~6 tasks, leaving the strip at ~50, still over; and the cluster only moves
because the strip takes the bottom edge, so the seam would cut through the
motivation. (c) Drop the overlay from the chain entirely — it is the scoping
doc's Surface 1 and link 4 needs the lifted preview regardless.

**Why `not authored` and not `authored`** (a deliberate deviation from the
skill's default wording for splits). `.claude/skills/openspec-team-workflow/SKILL.md`
§ Full-auto chains says an unauthored link "is authored in-run, **after its
predecessor archived** (so its MODIFIED deltas target specs that exist)."
`add-burn-cost-overlay` adds a requirement to `system-console` — a capability
that does not exist in `openspec/specs/` until this change archives — and
MODIFIEs a `system-space-view` requirement whose live text this change also
edits. Authoring it now would buy an adversary verdict that
`docs/plans/continous_space/handoffs/README.md` § "Verdict expiry is a diff"
guarantees expires the moment `add-vitals-strip` archives, forcing a re-attack
round anyway — and it would spend a second full Phase 1 inside this link's run
for a verdict with a known expiry date. The skill's `authored` default assumes a
seam whose halves are independent; this seam's second half is downstream of the
first's new capability.

**Reversal cost.** One chain-doc row and one change folder. Nothing built yet.

**Consequence for this link's journey.** The chain doc's stated 2a journey ends
"select a target and watch the fuel gauge grow a cost segment, commit and watch
the pill flip to `Burning · … · Nm Ss`". The cost-segment leg moves to
`add-burn-cost-overlay`'s journey. This link's journey is: dock at a station,
read the strip's five cells, switch the acting fleet by the chevron, commit a
burn, watch the pill flip to the burning state and count down. Recorded so the
SDET does not write the overlay leg blind at the archive gate.

### FULL-AUTO RULING 10 — the chain doc is wrong that the keyboard-camera requirement is unaffected; it is MODIFIED, and keyboard pan must survive by another input

**Question.** The chain doc says the twelve-button cluster "becomes four (orbit,
zoom in, zoom out, recenter)" and that `system-space-view`'s *Space View Camera
Is Keyboard-Operable* "is unaffected". The analyst proves that false (§ 4.1):
the four `camera-pan-*` buttons are the **only** keyboard pan path in the app —
the focusable group's own `onKeyDown` binds arrows to **orbit** — and the pan
axis's at-limit DOM state lives on those buttons
(`SpaceStage.interaction.test.tsx:278`). The twelfth button is not a camera
control at all: `select-pan-target-point` is mandated by *Body, Lane-Gate, and
Point Selection Is Keyboard-Operable*.

**Ruling.** The chain doc's **intent** is honoured and its **claim** is
corrected:

1. The on-screen camera cluster shrinks to **four camera cells** — orbit, zoom
   in, zoom out, recenter — as the doc names them.
2. **`select-pan-target-point` survives.** It is a selection affordance, not a
   camera control, so it does not count against "four", and *Body, Lane-Gate,
   and Point Selection Is Keyboard-Operable* takes no delta and must not
   regress. Deleting it would leave a keyboard-only player able to name only the
   star, which every burn solve rejects — the exact failure that requirement was
   written to prevent.
3. **A keyboard pan input survives the shrink**, and *Space View Camera Is
   Keyboard-Operable* **is MODIFIED** to name it and to keep the pan axis's
   at-limit state observable. Its seven existing scenarios are reproduced
   verbatim in the MODIFIED body.
4. The **mechanism** for (3) — which key binding replaces the pan buttons, and
   whether the at-limit state moves to the existing `camera-limit-status` live
   region (which already computes `atPanLimit`) or to an attribute on the
   surviving input — is routed to the **panel** (architect + UX). The
   requirement's own words, "per key press", permit a key binding; the choice
   between the two at-limit surfaces is explicitly permitted by the live text
   ("an attribute **or a status message conveyed to assistive technology**").

**Basis.** Precedence 1 for the intent — chain doc link 2a and scoping doc
fault #4 ("Twelve camera buttons sit dead-centre bottom"), whose complaint is
about *visible chrome*, not about pan as a capability. Precedence 2 for the
correction — the live `system-space-view` spec, which calls the dedicated pan
input "load-bearing, not polish", and which this run may not silently weaken:
`.claude/skills/openspec-team-workflow/SKILL.md` forbids editing either side to
resolve a disagreement, and a chain doc is not a spec. Precedence 3 for the
mechanism — the panel.

**Alternatives rejected.** (a) Take "is unaffected" literally and keep the four
pan buttons — the cluster would be eight plus point-select, which is not the
shrink the doc asks for. (b) Delete keyboard pan — an accessibility regression
against a live SHALL, and it strands `select-pan-target-point` on the star.
(c) Count pan as a fifth cell — the doc names the four explicitly and pan is not
among them.

**Reversal cost.** One key binding and one MODIFIED body.

**Taught, for the chain doc's Link 2a record.** The chain doc names which
requirements a link touches optimistically *and* asserts non-effects it has not
verified. Link 1 taught the first half; this is the second. Treat every "X is
unaffected" in the chain doc as a hypothesis to check against the spec text.

### FULL-AUTO RULING 11 — the failed-command announcement is re-anchored before the credits readout is removed

**Question.** `docked-fleet-actions`' `Credit Balance Readout` carries seven
scenarios, and the seventh — *A failed sale's or refuel's error is announced to
assistive technology* — is a **panel** behaviour with nothing to do with
credits (`panel-error-live-region`, `FleetActionsPanel.test.tsx:918`). Removing
the requirement wholesale destroys its only spec.

**Ruling.** `docked-fleet-actions` gains a new **ADDED** requirement owning the
panel's failed-command announcement, carrying that scenario, in the same change
that REMOVEs `Credit Balance Readout`. Six scenarios travel to
`system-console`; the seventh stays home under a new owner.

**Basis.** Precedence 2 — `docs/plans/continous_space/handoffs/README.md`
lesson four: when a requirement is re-expressed elsewhere, the archiver's
scenario check does not protect it, and hexaverse lost six load-bearing clauses
that way. Precedence 1 — the chain doc's "The requirements move, not change".

**Alternatives rejected.** Carrying the announcement into `system-console` — it
announces *the panel's* command failures, on a surface that RULING 3 forbids
carrying verbs; the strip has no command to fail.

**Reversal cost.** One requirement.

### FULL-AUTO RULING 12 — the width floor is stated as 1280 CSS pixels, not as `85vw`

**Question.** RULING 2 said "at and above an `85vw` viewport width". The analyst
(§ 5.3, A-1) shows that is not a decidable width: `85vw` is 85% of whatever the
viewport is, and the code's `max-w-[85vw]` is a cap on a 288-px (`w-72`) panel
on six elements, not a breakpoint.

**Ruling.** RULING 2's intent stands unchanged — no mobile layout, the strip
must render every cell without overflow — and its unit is replaced. The
requirement states a floor of **1280 CSS pixels wide by 720 tall**, and states
that no layout below it is specified, produced, or tested.

**Basis.** Precedence 2 — `frontend/playwright.config.ts` uses
`devices['Desktop Chrome']` (1280×720), which is the only laptop viewport this
repo actually exercises, so the floor is a number the repo already committed to
rather than one invented here. The spec-quality skill forbids premature
precision; it equally forbids an unfalsifiable clause.

**Alternatives rejected.** (a) Keep `85vw` verbatim — untestable. (b) Reference
"the archive-gate journey's configured viewport" as the analyst drafted — a spec
that points at a test config inverts the dependency; the config should satisfy
the spec, not define it. (c) Invent a different number — no basis in the repo.

**Reversal cost.** One number in one requirement.

### FULL-AUTO RULING 13 — `Stranded` is an adornment on the fleet cell, not a pill state

**Question.** The design lists `Stranded` among the pill's values, but a
stranded fleet is simultaneously docked, parked or burning (analyst A-4).

**Ruling.** The served `stranded` flag renders as a distinct marker on the fleet
cell **alongside** the activity pill, never replacing it.

**Basis.** Precedence 2 — the live `fleet-roster` requirement *The Roster Row
Shows a Persistent Stranded Indication*, which renders stranding alongside the
activity. Precedence 1 — RULING 4: the pill is a projection of the shared
derivation, and the derivation does not make stranding exclusive of activity.

**Alternatives rejected.** A mutually-exclusive `Stranded` pill state — it would
hide the fleet's actual state at the moment the player most needs it, and it
would make the pill and the roster row disagree, which RULING 4 forbids.

**Reversal cost.** One rendering branch.

### FULL-AUTO RULING 14 — extending `roster-status.ts` does not oblige the roster row to render the new distinctions

**Question.** RULING 4 says a distinction the pill needs is added to the shared
derivation and both surfaces read it. If the pill then shows `Holding` where the
row still says `Docked`, have they "disagreed"? (analyst A-5 — and the analyst
names this as the adversary's most likely line of attack.)

**Ruling.** No. The agreement rule `system-console` states is that **both
surfaces are functions of the one derivation's output for the same served
inputs** — not that both render identical text. A projection may render a subset
of what the derivation distinguishes; it may never render a distinction the
derivation does not make, nor contradict one it does. `fleet-roster`'s *One Row
Per Owned Fleet, Derived From Kinematic State* takes **no delta**.

**Basis.** Precedence 1 — RULING 4's own word, "projection", and the chain doc's
formulation: "If the pill and the roster row **can disagree**, one of them is
wrong" — which is about contradiction, not about resolution.

**Alternatives rejected.** Requiring identical rendering — costs a 9-scenario
verbatim MODIFIED of a `fleet-roster` requirement this change has no reason to
touch, and would force the roster row to grow copy nobody asked for.

**Reversal cost.** One clause in one `system-console` requirement.

### FULL-AUTO RULING 15 — `fleet-roster` takes no delta

**Question.** The chain doc says `fleet-roster`'s *Row Selection Delegated to
the Mounting View* "gains the chevron as a second delegate". The analyst
(§ 1.4) argues that requirement claims no exclusivity, is scoped to a row click,
and does not render the chevron.

**Ruling.** `fleet-roster` takes **no delta** in this change. The chevron binds
to the same callback contract that requirement defines, and `system-console` R3
says so by cross-reference. The exclusivity claim that actually goes stale lives
in `system-space-view`'s *Toggle-to-Deselect Single Selection Among a Body, a
Lane Gate, or a Point*, which is MODIFIED.

**Basis.** Precedence 3 — the analyst's reading, verified against the live text:
"The system SHALL, on a row click, hand the clicked fleet back to the mounting
view via a callback, without itself deciding what selecting a fleet means".
Nothing there is falsified by a second surface using the same callback. Making
`fleet-roster` own an element it does not render would put a requirement's
subject outside its capability.

**Alternatives rejected.** Broadening "on a row click" to "or from any other
surface the mounting view mounts against the same callback" — cheap, but it
makes a roster requirement true of a non-roster element, and the honest home for
a cross-surface claim is the view that mounts both.

**Reversal cost.** One MODIFIED block.

### FULL-AUTO RULING 16 — the acting fleet's three setters are enumerated, not reduced

**Question.** `system-space-view`'s *Toggle-to-Deselect…* says the acting fleet
"is instead set by the fleet roster's row selection". The analyst (§ 5.2) found
this **already false**: `SpaceStage.tsx:754` renders a `fleet-mark-*` button
whose activation calls `onActivateFleet` → `setActingFleetId` ("Click to command
this fleet"). The chevron makes three paths.

**Ruling.** This is **code-vs-spec drift, adjudicated as the spec being wrong
about pre-existing behaviour** — the fleet-mark path is shipped, deliberate, and
carries its own hover copy. Because the requirement is MODIFIED by this change
anyway (RULING 15's consequence), the correction rides in the same MODIFIED
body: enumerate all three acting-fleet paths (roster row, fleet mark, strip
chevron) while keeping the requirement's real claim — a fleet is never a member
of the space view's *selection* — intact and its three scenarios verbatim.

No separate brownfield baseline correction is opened: the correction is one
sentence inside a requirement this change already rewrites, and splitting it
into its own pass would leave this change's MODIFIED body knowingly restating a
false clause.

**Basis.** Precedence 2 — `.claude/skills/openspec-team-workflow/SKILL.md`
§ "Spec-first invariant": "spec wrong about pre-existing behavior → baseline
correction"; and its rule that neither side is silently edited to match the
other. The adjudication is recorded here, which is what makes it not silent.

**Alternatives rejected.** (a) Leave the false clause and add only the chevron —
ships a requirement known to be false. (b) A separate `openspec-brownfield`
baseline pass — a whole extra Phase 0 for one sentence inside a body this change
already reproduces in full.

**Reversal cost.** One sentence.

### FULL-AUTO RULING 17 — the strip inherits the panel's testids as a deliberate contract

**Question.** Five tier-4 specs (`refuel-commit`, `slice`, `space-journey`,
`space-double-submit`, `new-user`) read `balance-value`, `hold-readout`,
`hold-capacity-used`, `fleet-fuel-*`, `fleet-range-*` (analyst § 7.1).

**Ruling.** The strip **reuses the same `data-testid`s** the panel used for the
re-homed readouts (`balance-value`, `balance-figure`, `balance-live-region`,
`hold-readout`, `hold-capacity-used`, `hold-capacity-total`, `hold-free`,
`hold-<kind>-tons`). This is pinned in the implementation contract, not left to
the developer.

**Basis.** Precedence 3 — the analyst's recommendation, with a measured payoff:
five tier-4 specs need no edit, and the archive gate is this chain's most
expensive and most fragile step (link 1 spent two runs there). Precedence 2 —
`docs/testing-tiers.md`: the journey is written against a UI that exists, once;
anything that reduces blind e2e editing reduces the gate's failure rate.

**Alternatives rejected.** Fresh strip-specific testids — five e2e edits written
blind against a UI that does not exist yet, which
`docs/testing-tiers.md` names as half of hexaverse's e2e reds.

**Reversal cost.** A rename, plus the five e2e edits avoided.

### FULL-AUTO RULING 18 — the running-mine preview suppression defect is fixed by the lift, in the change that owns the lift

**Question.** `SpaceCommandPanel.tsx:109–115` passes
`commitWouldBeAccepted: !!fleet && !fleet.jump`, omitting `mineRunning`, so the
running-mine preview suppression that *Burn Preview Reflects the Server-Solved
Order* mandates is specified, tested at the hook, and never wired (analyst
§ 5.1). The scenario passes only because the panel's suite mocks the hook.

**Ruling.** This is confirmed **code-vs-spec drift with the code wrong**. It is
fixed in **`add-burn-cost-overlay`** — the change that owns the preview lift
(RULING 9) — not in this one, because this change does not touch that call site
after the split. It needs **no delta**: the fix makes an existing live scenario
true, which is the definition of a corrective implementation task rather than a
spec change. It is filed now as
`docs/plans/continous_space/handoffs/drift-running-mine-preview-unsuppressed.md`
so it cannot be lost between links, and it is listed in this link's report.

**Basis.** Precedence 2 — the workflow skill's drift rule ("code wrong →
corrective change through the pipeline") and its prohibition on opportunistic
edits: this change has no task that touches the line, so fixing it here would be
a diff exceeding the change's stated Impact.

**Alternatives rejected.** (a) Fix it in this change — out of scope after the
split, and it would be an unspecced edit to a file this change otherwise leaves
alone. (b) Leave it unfiled for the next orchestrator to rediscover — the
handoffs README exists precisely because a finding not written down is lost.

**Reversal cost.** N/A — a one-expression fix, deferred by one link.

### FULL-AUTO RULING 19 — the chevron offers every owned fleet, as a menu

**Question.** What does the chevron open, and which fleets does it list?
(analyst A-6, A-9.)

**Ruling.** A menu of **every fleet the requester owns**, each entry delegating
to the same callback the roster row uses. Choosing a fleet in the open system
sets it acting; choosing one elsewhere follows `system-space-view`'s existing
*Fleet Roster Cross-Navigation* behaviour (navigate to that system, or to the
galaxy view for a fleet on a lane).

**Basis.** Precedence 4 (most reversible) for the menu shape — it mounts no
second roster and adds no state; a cycle-to-next control is cheaper but
undiscoverable and cannot express "switch to the fleet three systems over".
Precedence 2 for the membership — *Fleet Roster Cross-Navigation* already
defines what choosing an elsewhere fleet means, and offering a subset would make
the chevron a second visibility filter, the pattern the chain doc's own link-3
ruling refuses ("a list that omits it would be the second visibility filter this
project has repeatedly refused to build").

**Reversal cost.** One filter expression.

### FULL-AUTO RULING 20 — hold-gauge kind segments are shades with the kind and tonnage in their accessible name

**Question.** "A gauge segmented by kind" with no per-kind colour vocabulary
anywhere in the client, and a chain-wide prohibition on palette changes
(analyst A-7).

**Ruling.** Segments are zinc-family shades, ordered stably by kind, and each
segment's kind and tonnage are available as text or an accessible name, so the
segmentation is never conveyed by colour alone.

**Basis.** Precedence 1 — chain doc "What every link must not do": "Change the
palette, type scale or panel fill … Same zinc". Precedence 2 —
`frontend/CLAUDE.md`'s colour system. The accessible-name clause is what makes
shades acceptable rather than an accessibility regression.

**Reversal cost.** A stylesheet change if a kind palette is ever introduced.

### FULL-AUTO RULING 21 — the sr-only `space-world-clock` element stays

**Question.** Does the strip's clock replace `SystemSpaceView.tsx:670`'s sr-only
span exposing `data-scale` / `data-world-time`? (analyst A-8.)

**Ruling.** It stays. The strip's clock is a formatted figure with its own
`data-raw` / `data-unit`; the sr-only span is a machine-readable fan-in probe
covered by no requirement. Two elements, two purposes, no duplicated player
copy — so `figure-formatting` R12 is untouched.

**Basis.** Precedence 4 (most reversible) — deleting it breaks existing
`SystemSpaceView.test.tsx` assertions for no stated benefit; keeping it costs
nothing.

**Reversal cost.** One element.

### RULINGS 22, 23, 24 — the panel's answers

The three questions below were routed to the review panel and are now **ruled**.
Their full reasoning, the conflict resolution between the architect and UX, and
the evidence each rests on are in
`docs/plans/continous_space/handoffs/add-vitals-strip-panel-consolidated.md` § 1.
In brief:

- **FULL-AUTO RULING 22 — the fuel gauge's denominator is the served
  `roster.cargoCapacity`.** This **reverses** the analyst's recommendation of
  `fuel + freeHold`, which I had recorded as the leading candidate. The
  architect showed that denominator shrinks as ore is loaded, so mining would
  make the fuel gauge read *fuller with no fuel added* — a hauler renders a full
  fuel gauge one burn before it strands. An instrument whose needle rises when
  the quantity it measures did not change is the exact lie this link's adversary
  pass exists to catch. Basis: precedence 3, on a reachable pathological state.
  Reversal cost: one expression, but it is also `add-burn-cost-overlay`'s
  overlay scale, so reversing reopens that link.
- **FULL-AUTO RULING 23 — keyboard pan is `Shift`+arrow on the surviving orbit
  cell; the pan at-limit state is a directional `data-pan-at-limit` attribute,
  not the `camera-limit-status` live region.** Architect and UX conflicted here;
  architect wins on the standing tie-break (technical shape) and on the stronger
  evidence: `camera-limit-status` is a single-slot priority chain (zoom > pan >
  orbit), so a camera at both the zoom and pan clamps reports only zoom, and
  routing pan onto it would make a live SHALL false for a reachable state. UX's
  separate discoverability finding — the camera group's accessible name or
  description must state the pan binding, since deleting four labelled buttons
  removes where a screen-reader user learned it existed — is **also accepted**;
  it is user-observable behaviour and does not conflict.
- **FULL-AUTO RULING 24 — the touch pan loss is filed, not built and not
  ignored.** Deleting the pan buttons removes what appears to be the only
  touch-accessible pan path. No live requirement is falsified (*Space View
  Camera Touch Pinch-Zoom* defines no pan), so it is a capability loss rather
  than a conformance one; a two-finger drag would collide with pinch-zoom's own
  two-finger claim and needs its own spec surface. Recorded as
  `defect-touch-pan-lost-with-camera-cluster.md` and as a Risks entry in
  `design.md`. Basis: precedence 4, plus the chain's laptop-first scope.

The third routed item — whether the strip prints cost or shortfall **text** —
moved to `add-burn-cost-overlay` with the overlay itself under RULING 9 and was
not put to this panel.

### Routed to the panel, not ruled here *(historical — now answered above)*

These need a specialist's judgement and are deliberately left open for the
review panel. Each gets a ruling appended below once the panel reports.

- **A-2 — the fuel gauge's denominator.** No fuel-tank capacity is served; fuel
  rides the cargo pool. Candidates: (a) `cargoCapacity`, which makes the fuel
  gauge a redundant view of one hold-gauge segment; (b) `fuel + freeHold` —
  "how full could I top up" — the same two served fields and arguably the
  instrument a refuelling player wants. Both are purely served. A client
  high-water mark is rejected outright (stateful, unserved). **UX and architect
  to rule; the denominator must be named in the requirement or the gauge is not
  testable.**
- **RULING 10 item 4 — the keyboard pan mechanism** and where the pan axis's
  at-limit state is exposed once the pan buttons are gone. **Architect and UX.**
- **Whether the strip prints any cost or shortfall text in this link.** Analyst
  A-3 reads the chain doc as gauge-only in 2a, with `▲ short 6.6 t` belonging to
  link 4. After RULING 9 the overlay is not in this change at all, so this
  question moves with it to `add-burn-cost-overlay` — recorded here so it is not
  re-litigated in this link.

---

## Rulings made at implementation kickoff

Input: `docs/plans/continous_space/handoffs/add-vitals-strip-impl-contract.md`.
Six findings from the architect's kickoff; section references are to that file.

### FULL-AUTO RULING 25 — `guards.test.ts`'s line-anchored exception list is SDET work, and Impact widens for it

**Finding.** `frontend/lib/format/guards.test.ts` holds a `.toFixed(` exception
list **anchored to line numbers** in `SpaceStage.tsx` (`[681, 682, 738, 739,
903]`) and asserts each still contains `.toFixed(`. This change deletes eight
camera buttons at `:623-643`, shifting every anchor — so the per-commit gate
fails, and the guard's own message forbids resolving it by moving code back.

**Ruling.** The re-grep is **SDET work, not developer work** — developers never
edit tests, and this is a test whose fixture went stale, not a test that is
wrong. It happens in the red phase, before the developer touches `SpaceStage`,
so the developer never sees a red gate it is forbidden to fix. `proposal.md`'s
Impact widens to name `frontend/lib/format/guards.test.ts`, exactly as round 1's
MAJOR 7 widened it for `corporation-provider.tsx` and round 3 for
`lib/types/fleet.ts`.

**Basis.** Precedence 2 — the workflow skill's absolute rule that only the SDET
alters a test, and its rule that an edit outside the stated Impact is a finding
against the developer. **Reversal cost:** none; it is a fixture refresh.

**Worth noting for the chain:** this is the third artifact this change has had to
add to Impact after authoring closed. A change that edits a widely-referenced
component should enumerate its *reverse* dependencies — who anchors to it — at
authoring time, not discover them one gate failure at a time.

### FULL-AUTO RULING 26 — the chevron may deviate from Catalyst-only UI

**Finding.** § 7.3 proposes a hand-rolled ARIA menu button rather than a Catalyst
primitive. `frontend/CLAUDE.md` documents **Catalyst-only UI**, so this is a
deviation from a recorded repo convention and needs a ruling rather than a
developer's discretion.

**Ruling. Approved**, with one condition.

The reasons are sound and specific: jsdom implements no native-select popup, so
under a Catalyst primitive the chevron's three keyboard scenarios would be
provable only at the archive gate — and `docs/testing-tiers.md` records that
red-phase Playwright written blind was **half of this repo's e2e reds**. Of the
two candidate primitives, one takes no `data-testid` on its trigger (defeating
the testid contract this change depends on) and the other pulls framer-motion
over a live WebGL canvas.

**The condition:** the hand-rolled control uses the same visual tokens Catalyst
would have — same zinc palette, same 11px mono labels, same `white/[0.12]`
fill. The convention exists to keep the UI *vocabulary* uniform; this deviation
is about interaction mechanics and must not become a visual one. The chain's
"no palette, type scale or panel fill change" rule already binds here.

**Basis.** Precedence 2 for the convention, overridden on precedence 3 (the
panel's reasoning) because the convention's purpose — visual consistency — is
preserved while its literal application would move three scenarios from tier 1
to tier 4. **Alternatives rejected:** Catalyst `listbox` (no trigger testid);
`dropdown-v2` (framer-motion over WebGL). **Reversal cost:** swap the primitive;
the callback contract and testids are unchanged either way.

### FULL-AUTO RULING 27 — task 2.3 stands as scoped; the fleet mark is not rerouted

**Finding.** Task 2.3 asks to verify three acting-fleet paths "all delegate to
that one callback", but `onActivateFleet` (`SystemSpaceView.tsx:747`) is wired to
`setActingFleetId`, not `selectFleet`. The architect ruled it correct as-is
(marks are always in-system) and scoped 2.3 to the selection-independence check.

**Ruling. Accepted as scoped. The fleet mark is not rerouted through
`selectFleet` in this change.** RULING 16's claim is that the acting fleet has
three *setters* and that a fleet is never a member of the space view's
*selection* — both remain true. Rerouting a shipped, working path would be a
behaviour change beyond this change's stated Impact, which the workflow skill
treats as a finding against the developer, and it buys nothing the spec asks
for.

**Basis.** Precedence 2 (no opportunistic edits) and precedence 4 (most
reversible). **Reversal cost:** a task in a later link, if 2b's dock ever needs
one code path for all three.

### FULL-AUTO RULING 28 — three contract corrections accepted, none blocking

- **The colour validator is overstated** in `design.md` Decision 1 and task 1.3:
  `dark:bg-zinc-800` and the bare-`bg-zinc-100`/`text-zinc-900`/`border-zinc-200`
  rules are severity **warning** (`check.py:1044` passes a warnings-only file),
  and `check.sh` runs no colour check at all. Only `no-gray-scale` and
  `no-dark-zinc-900-bg` are errors. **The conclusion stands and the stated
  consequence does not.** Corrected at archive, not now: it over-constrains in a
  safe direction (palette colours with dark variants are wanted regardless), and
  hand-editing the change folder mid-build to relax a constraint is not worth the
  role-separation cost.
- **Task 8.2's under-specification is real and is pinned in contract § 8.3.**
  `FleetActionsPanel.tsx:280` uses the `credits` prop for refuel's affordable
  default; a developer told only to "remove the readouts" could remove the prop
  and silently flip that default to `freeHold`. Only
  `freeHoldRaw`/`cargoCapacityRaw`/`cargoUsedRaw` become dead. This is precisely
  the *behaviour change smuggled in as a placement change* that the chain doc
  names as link 2b's adversary target, arriving a link early — the developer
  delegation must carry it.
- **Task 4.4's fixture prose** pins the sub-pixel condition to "the 1280-px width
  floor" when the gauge is cell-width. Harmless — `data-gauge-state` is
  width-independent — and recorded so nobody reverse-engineers a gauge width
  from it.

---

## Test disputes and collateral, adjudicated at the green gate

The developer completed 39 of 42 tasks, edited no test, and reported four
problems rather than resolving any of them in code. That is the contract working
exactly as intended: every one of these would have been invisible if it had
"fixed" them itself.

### FULL-AUTO RULING 29 — dispute (a): the developer is right; two SDET assertions contradict a live requirement

**Dispute.** `VitalsStripPill.test.tsx:271` and `:287` assert
`not.toHaveAttribute('data-raw')` for a duration and a rate when no `scale` has
been served but the underlying value is a finite number.

**Ruling: the tests are wrong. The developer implements as it has.** The live
`figure-formatting` requirement *A Figure Whose Clock Scale Has Not Been Served
Reads as Absent* says the opposite, in the requirement body and again in two
scenarios:

> …SHALL render the absent form rather than being computed at an assumed scale
> of 1, **and SHALL still carry its `data-raw`, since the value is known and only
> the scale is not.** … This rule binds every mounting view and every consuming
> surface, not only the one surface whose own scenario names it.

Three independent confirmations, all cited by the developer and all checked:
the archived requirement, the implementation contract's own code example ("keep
`raw` finite"), and existing repo precedent in `ScanControl.test.tsx`, whose
identical scale-less scenario asserts `data-raw` **present**.

Only the SDET may change a test, and it changes these two.

**Why this one matters beyond itself:** the assertion would have forced an
implementation that drops the raw value whenever the scale is briefly unserved —
which is the state of *every first render*. Tests would then have enshrined a
figure that loses its wire value exactly when the strip is least able to explain
itself. A dev that "fixed" its code to match would have shipped it green.

### FULL-AUTO RULING 30 — dispute (b): two SDET assertions contradict each other; the dedicated one wins

**Dispute.** The stranded-marker loop at `VitalsStripPill.test.tsx:397` asserts
pill text against the fixture's `activity` (`'On station'`), while the dedicated
ladder test at `:156`, on the same fixture, requires the literal `"Holding"`.

**Ruling: the dedicated test is right and the generic loop assertion is wrong.**
`activityKind` diverging from `activity` for the holding row is *the entire
reason the discriminant exists*: Decision 4 makes the `roster-status.ts`
extension additive-only because `FleetRoster.tsx:197` renders `activity`
verbatim, so `Holding` **cannot** be an `activity` value and can only be an
`activityKind`. A generic assertion that pill text equals `activity` is
therefore false by construction for exactly the row the discriminant was
introduced for.

The SDET rewrites the loop's assertion to go through the ladder, not through
`activity`.

### FULL-AUTO RULING 31 — the missing `await` is a test defect

`VitalsStripFleetCell.test.tsx`'s "The chevron's menu lists every fleet the
requester owns" calls `userEvent.click(...)` without `await` inside a
non-async `it()`, so the assertion runs before the click resolves. SDET fixes.
Recorded because a test that passes or fails on timing rather than on behaviour
is the species this repo's handoffs README lesson two catalogues.

### FULL-AUTO RULING 32 — the five archived-change mocks are SDET work, and Impact widens again

Five pre-existing spec files from the archived `add-scan-and-sightings-surface`
change mock `@/components/corporation-provider` with a static object lacking
`useCorporationSessionOptional`, which `SystemSpaceView` must now call to satisfy
the credits-cell staleness rule (`useCorporationOptional` structurally cannot —
it exposes no `isError`). Twenty assertions fail for that reason alone.

**Ruling: SDET adds the one-line mock export to each; `proposal.md`'s Impact
widens to name all five.** Updating a mock to match a module's new surface is not
weakening a test — the assertions are untouched — so the "handed-off and
immutable" comment on one of them does not bar it; that comment protects the
*assertions*, which no one is changing.

This is the **fourth** Impact widening this change has needed after authoring
closed (`corporation-provider.tsx`, `lib/types/fleet.ts`, `guards.test.ts`, now
these five). The pattern is consistent and worth carrying to link 2b, which
remounts far more components than this one: **a change that alters a widely-mocked
module's exported surface must enumerate its mockers at authoring time.** Grep for
the module's path in test files; every hit is a file in Impact.

### The scheduled re-anchor (RULING 25) is now due

Step F has landed. `guards.test.ts`'s `.toFixed(` anchors moved from
`[681, 682, 738, 739, 903]` to `[753, 754, 810, 811, 975]`. SDET re-greps and
re-anchors; the developer correctly did not touch it.

---

## Rulings at the third gate run (authorised by Travis)

Travis ruled option 1 from the journey record: fix the silent second burn, and
spend a third tier-4 run. That is an explicit exception to the gate's two-run
budget, granted for this link only — it is not a new default, and the budget
stays two runs for every later link in this chain.

### FULL-AUTO RULING 33 — red 1 (the Next.js dev overlay) is fixed in the test environment, never by moving the strip

**Finding.** `vitals-strip-journey.spec.ts:257`'s chevron click is intercepted
by `<nextjs-portal>` — Next.js 15's dev-mode issues badge, which renders in the
**bottom-left corner**, the same corner as the strip's fleet cell. `npm run e2e`
boots the frontend with `next dev` (`playwright.config.ts:14-19`), so the badge
is present in the e2e stack by construction. `next build && next start` strips
it entirely, so **no player ever sees it**.

**Ruling.** Fix it in the **test environment** — either by disabling the dev
indicator for the e2e stack (gated on `ENV=test`, so Travis's own `npm run dev`
keeps its overlay) or test-side in the spec. **Do not move, re-anchor, or
re-order the strip's fleet cell for it**, and do not change production layout.

**Basis.** Precedence 2 — the spec-first invariant. Production layout changes
only as implementation of a requirement; there is no requirement that the strip
avoid a development-only artifact, and inventing one would let a dev-tool
detail dictate the shipped design. Precedence 4 for the mechanism: an
`ENV=test`-gated config flag is the most reversible option and touches nothing a
player runs.

**Alternatives rejected.** (a) Move the fleet cell out of the bottom-left corner
— changes the shipped design to accommodate a tool that never ships, and the
corner is where the scoping doc's Surface 1 puts it. (b) Raise the strip's
z-index above the overlay — wins the click while leaving the badge visually on
top of the cell, and it is an arms race with a framework surface. (c) Leave it
and narrow the journey — abandons the viewport-containment row QA has BLOCKED,
which is the one thing only this tier can prove.

**Reversal cost.** One config flag.

**Recorded caveat.** The badge reads **"2 Issues"**, meaning the app threw twice.
Suppressing the badge must not become a way of not reading them: the diagnosis
reads both issues *first*, because they may be the same root cause as red 2.
Silencing a symptom before understanding it is how a green suite stops meaning
anything — which is this repo's most-repeated lesson.

### FULL-AUTO RULING 34 — red 2 is PRE-EXISTING, and the "silent second burn" symptom was an artifact

**The diagnosis overturned the finding as written.** The literal symptom recorded
in the journey record — a click producing *zero* requests — **did not reproduce
in four live runs**. The reproducible form is the already-filed racy 409 on a
follow-on order after a resolved action (`defect-post-sale-departure-burn-409s.md`),
and the entire burn-commit path (`SpaceCommandPanel`, `use-submit-guard`,
`use-fleets`) is **byte-identical before and after this change**.

So my first suspect — a double-submit `inFlight` ref latching because a reset
that depended on a remount no longer happens — is **refuted**, and I am recording
that plainly. It was a plausible story that fit the symptom and not the evidence,
and the only reason it did not become the fix is that the diagnosis was told to
confirm or refute it rather than to act on it.

**Two corrections to the journey record follow from this**, and both matter for
anyone reading it later:

1. The pass-in-run-1 / fail-in-rerun timeline is explained by **intermittency**,
   not by the two-line diff between the runs. The record should not leave a
   reader hunting for a causal link between `FloatingNav`'s offset and burn
   submission; there is none.
2. "Reaches the server zero times" was inferred from an absent log line. The
   diagnosis found requests *are* sent and are refused 409. An absence of
   evidence read as evidence of absence — the same shape as my own
   misattribution of `defect-station-order-500` from the wrong log file, twice
   in one gate.

**The option this creates, which I am surfacing rather than taking.** Red 2 now
meets this chain's own definition of acceptable residue: a **pre-existing,
filed** backend defect on `space-double-submit.spec.ts`, a spec **this change
did not touch**. By the letter of the gate rules, `add-vitals-strip` could
archive with it recorded. I am not doing that, because Travis's instruction is
to fix it and the defect is real and player-facing — but the cheaper path
existed and should be visible in the record.

### FULL-AUTO RULING 35 — the backend fix runs as a separate change outside the chain

**Question.** The chain states "No backend work anywhere in this chain," and the
fix for red 2 is in the backend.

**Ruling.** The fix is authored and archived as its own fast-tracked minimal
change, **`fix-follow-on-order-claim`**, outside this chain — writer → validator
→ adversary → SDET red test → Go developer → tier 1, then archived **before**
`add-vitals-strip`'s gate rerun so 2a's deltas still target a clean tree.

**Basis.** Travis's direct instruction, relayed as a course correction, overrides
the chain's no-backend rule **for this one defect**. The structural form —
a separate change rather than backend tasks inside link 2a — is what keeps both
things true at once: the instruction is carried out, and the chain's rule is not
bent. `add-vitals-strip` remains a frontend-only change whose Impact says so.

Note this is *not* a spec-first exemption: the backend fix gets the full
fast-track (a real proposal, a real delta, a validator pass and an adversary
pass), because the workflow skill's rule is that a fast-track shrinks the
artifacts, never the gates. The adversary is non-skippable there as it is here.

**Scope.** The claim lifecycle: which 409 branch fires on a follow-on order once
the previous action has resolved. `action.ErrActiveActionExists` is the
single-slot guard (`backend/action/service.go:17`, raised at
`backend/action/dao.go:212`, mapped to 409 at `backend/fleet/handler.go:561`).
The suspicion recorded in `defect-post-sale-departure-burn-409s.md` is that the
resolve fold that releases the claim had not run — correctness must not depend
on the sweep, which that defect file already notes is a liveness floor.

**Consequence for the gate.** Because a backend file changes, **tier 3 must run
again** alongside tier 4 in the third gate run. It cannot be skipped on the
grounds that it was green before.

### FULL-AUTO RULING 36 — the preview-poll 500 is filed, not fixed here

The diagnosis found a third, **reproducible** defect: a fleet docked at a station
stays selected, so `useBurnPreview` keeps polling a zero-length burn every 10s and
the server answers 500 (`curve length below the configured minimum`). This is
almost certainly what raised the dev overlay's "2 Issues".

**Ruling.** Filed as `defect-docked-selection-polls-zero-length-preview.md`, not
fixed in `add-vitals-strip`. It is a `system-space-view` selection/preview
concern, not a `system-console` one; no task or scenario in this change covers
it; and fixing it here would be a diff exceeding the change's stated Impact. It
is a natural candidate for **link 2a-ii** (`add-burn-cost-overlay`), which owns
the preview lift and already carries `drift-running-mine-preview-unsuppressed.md`.

Reconsider only if the SDET shows it blocks the journey.

### FULL-AUTO RULING 37 — `fix-follow-on-order-claim` is NOT built; the premise is wrong and the evidence is gone

**Adversary verdict: BLOCKED**, and it is the right call. Full findings:
`docs/plans/continous_space/handoffs/fix-follow-on-order-claim-adversary-r1.md`.

**The repro would still 409 after this fix.** `fleet.Service.OrderTo` releases the
movement slot **twice** before `action.Commit` is ever reached — `settleIfDue`
inside `solveOrder` (`backend/fleet/service.go:653-657`) and the unconditional
re-task `Cancel` (`:821-828`) — and both read the same field `commitTx` checks.
Three facts falsify the stale-claim story outright:

1. The 1:16:21 sale proves `resolveDue` had already cleared the slot **19 seconds
   before** the first 409.
2. **Both** attempts 409'd. A stale claim would have been consumed by the first
   attempt's own `Cancel` branch, so the second could not have seen it. Two
   identical rejections are a **deterministic precondition**, not a race —
   candidates being `ErrInsufficientFuel`, `QuotedCapExceededError`,
   `ErrHoldWithoutFuel`, all mapped to 409 at `fleet/handler.go:480-562`.
3. The defect doc's one clue — the inbox poll stopping at 1:15:41 — is **causally
   inert**: `InboxByType` → `dao.List`. **The inbox resolves nothing.**

The gap the writer found is genuine (`action/dao.go:211` is the one slot read in
the system that never resolves) but it is reachable **only on the sensor
channel**, via `fleet.Scan` — not on the movement channel this defect is about.
Building it would have been this repo's signature failure: a correct derivation
that nothing in the failing path reaches, shipping green while the defect stayed
live and *looked* fixed.

**Ruling.** The change is **not implemented**. Its folder stays in
`openspec/changes/` unarchived, with this ruling recorded, because the
architectural gap it documents is real and worth keeping — but it is re-scoped
to the sensor channel and its proposal's "regardless of which verb" claim is
false (`mine/service.go:355-361` rejects at the service layer and never reaches
`commitTx`).

**Two things this cost, both recorded so the next run does not repeat them:**

- **The evidence has been destroyed.** `frontend/playwright/.auth/backend.log` is
  overwritten on every e2e run; the `fleet_dab3894e` sequence the defect was
  filed from no longer exists. A defect filed from a log that the next run
  overwrites needs its evidence **copied into the handoff at filing time**, not
  referenced by path. Amend `defect-post-sale-departure-burn-409s.md` accordingly.
- **Nobody has captured the 409 response body**, which the defect file itself
  named as the cheapest next step when it was filed. Three agents have now
  reasoned about which branch fires; one `curl` would have settled it. **That is
  the next action** — diagnosis before specification, not after.

**A second-order lesson worth more than the change.** The writer, the validator
and I all treated "which 409 arm fires" as an open question we could specify
around. It is not: it is the *entire content* of the defect. A corrective change
whose cause is unconfirmed is not a fast-track, it is a guess with artifacts —
and the adversary is the only reason it did not ship.

### FULL-AUTO RULING 38 — the deterministic-precondition hypothesis changes what red 2 probably is

If both 409s are a deterministic precondition rather than a race, the leading
candidate is `ErrInsufficientFuel` — the fleet cannot afford the departure burn.
That would make `space-double-submit`'s two failures a **test-fixture** problem
(a fuel budget that no longer covers the walk), not a product defect at all, and
the fix would be the SDET's rather than a developer's.

It would also explain the timeline that nothing else does — passing in gate run 1
and failing in the rerun with a two-line diff that cannot touch fuel — if the
fixture sits near a threshold. **Do not act on this**; it is a hypothesis with a
one-command test, and this link has already spent one cycle on a plausible story
that the evidence refuted.

### FULL-AUTO RULING 39 — the 409 is `ErrQuotedCapExceeded`; `fix-follow-on-order-claim` is abandoned and RULING 35's backend exception is withdrawn

**The evidence, captured verbatim from the Playwright trace** — the thing the
defect file asked for when it was filed, and which four separate analyses
inferred instead of reading:

```
HTTP 409
{"error":"fleet: solved fuel cost exceeds the requested maxFuelTons cap",
 "fuelCostTons":6.1296,
 "maxFuelTons":4.99488}
```

`ErrQuotedCapExceeded` — `backend/fleet/handler.go:480-494`, raised at
`backend/fleet/service.go:807`. The fleet was docked with **69.37 t of fuel**.

So it is **not** `action.ErrActiveActionExists` (the claim-lifecycle story the
abandoned change was written against), and **not** `ErrInsufficientFuel` (my own
hypothesis). Both were wrong. The solved cost drifted **+22.7%** above the
quote's cap between preview and commit, and the quote-lock refused it — which is
the specced behaviour working, not a bug in the claim spine.

**Ruling.** `openspec/changes/fix-follow-on-order-claim/` is **deleted**. Its
premise is refuted by evidence, so there is nothing to repair; keeping a change
folder whose proposal is known-false would be worse than removing it. Its
adversary report is kept — `fix-follow-on-order-claim-adversary-r1.md` — because
the architectural gap it documented (`action/dao.go:211` is the one slot read
that never resolves, reachable on the **sensor** channel) is real and someone
should specify it one day, on evidence, for the channel it actually affects.

**RULING 35's backend exception is withdrawn.** The defect is not in the backend,
so the chain's no-backend rule stands again unmodified, and **tier 3 does not
need rerunning** in the third gate run.

**Why the adversary's "two identical 409s means deterministic, not a race" was
right about the conclusion and wrong about the mechanism.** The doubling is not
two user attempts: `frontend/lib/query-client.ts:9-23`'s global mutation retry
resends any non-401/403/5xx failure **once**, with the unchanged payload. One
click, one refusal, one pointless automatic retry of a deterministic 409.

### FULL-AUTO RULING 40 — the real fix is the mutation retry policy, and it is frontend and small

**The defect.** The global mutation retry resends 4xx. A 409 is a *deterministic
refusal* — the same payload will be refused identically — so the retry cannot
succeed, and it inflates the server-side request count that
`space-double-submit.spec.ts` exists to assert. A guard test whose counting can
be corrupted by an invisible client retry is a test that cannot see the thing it
guards.

**Ruling.** Fast-tracked minimal change **`fix-mutation-retry-on-4xx`**: a
mutation retry never resends a 4xx. Full gates — writer → validator → adversary
→ SDET red test → developer → tier 1 — because a fast-track shrinks artifacts,
never gates. Archived **before** `add-vitals-strip`'s gate rerun.

Paired with it, and equally important: the SDET makes the double-submit spec
assert **response status**, not merely request count, so this whole class is
visible the next time rather than presenting as a phantom missing request.

**Basis.** Precedence 2 — the spec-first invariant: this is a behaviour change,
so it gets a change. It is frontend-only, so tier 3 stays out of the gate.

### FULL-AUTO RULING 41 — the 10% fuel allowance stays; the post-dock cost drift is filed

`SpaceCommandPanel`'s re-quote on cap-exceeded is the **specced quote-lock
behaviour** (`system-space-view`, *A Burn Commit Is Quote-Locked to the Preview
the Player Agreed To*). Widening `BURN_FUEL_ALLOWANCE` to swallow a 22.7% drift
would weaken a live requirement to make a test pass, which is the one thing this
whole pipeline exists to prevent.

**Ruling.** The margin is untouched. The *drift* — why a solved cost moves 22.7%
between a preview taken while docked and the commit that follows — is filed as
its own defect for someone to investigate on evidence, not guessed at here.

### FULL-AUTO RULING 42 — three signatures, not one, and they are now separated

This single "red 2" has resolved into **three distinct failures**, which is why
it survived four analyses:

1. **`ErrQuotedCapExceeded`** — post-dock cost drift beyond the quote cap (filed).
2. **The 4xx mutation retry** — doubling every rejection (fixed by RULING 40).
3. **A `signUpAndWake` wake-up flake** — the roster row not appearing within 15s,
   which is what failed the `:242` repro and is unrelated to either (filed).

And `:185` **passed** in the isolated repro while both failed at the gate, which
confirms intermittency rather than a deterministic regression.

**The lesson, and it is the most expensive one this link taught:** every analysis
that reasoned from an *absence* in a log was wrong — "no second request" (there
was one, refused), "the inbox stopped polling" (the inbox resolves nothing), "no
500 or 409 in the log" (wrong log). The one action that produced truth was
capturing a response body. **Read the payload before theorising about the
mechanism**, and when a defect file names its own cheapest next step, do that
step first.

---

## Rulings at the third gate run — execution (fresh orchestrator, 2026-09-09)

Numbering continues this file's sequence. (`fix-mutation-retry-on-4xx` used
43–57 in **its own** rulings file; numbering is per-file, so 43 here is a
different ruling from 43 there.)

### FULL-AUTO RULING 43 — the r3 adversary verdict is CURRENT; no re-attack

**Checked, not assumed.** `git diff aa21687 HEAD -- openspec/changes/add-vitals-strip
openspec/specs/{system-space-view,docked-fleet-actions,figure-formatting,system-console}`
returns exactly one file: `openspec/changes/add-vitals-strip/tasks.md`, 39
insertions / 39 deletions, **every one a `- [ ]` → `- [x]` flip** (verified by
filtering the diff for any non-checkbox line — none). No requirement text, no
scenario, no proposal, no delta changed since the verdict.

The one commit since then that touched a spec — `6fce684`, archiving
`fix-mutation-retry-on-4xx` — created `openspec/specs/mutation-retry-policy/spec.md`,
a **net-new capability** this change's four deltas do not target, so there is no
delta collision and no live target moved under this change's feet.

**Ruling.** The r3 verdict stands. Re-attack scope is empty; the adversary is not
re-run. This satisfies the non-skippable rule by *currency*, not by exemption.

### FULL-AUTO RULING 44 — the dev-overlay fix is `devIndicators: false`, gated on `ENV=test`, and the two config files have two different owners

**Mechanism, verified against the installed version rather than remembered.**
`frontend/package.json` pins `next@^15.5.9`; the installed build is **15.5.22**.
In that build `devIndicators` accepts `false` or `{ position }` and nothing else
(`node_modules/next/dist/server/config-schema.js:257-273`), and `false` is
threaded to the client as a define:
`'process.env.__NEXT_DEV_INDICATOR': config.devIndicators !== false`
(`node_modules/next/dist/build/define-env.js:122`), which the compiled devtools
overlay reads into `disableDevIndicator` and renders as
`disableDevIndicator && … ? "none" : "block"`
(`node_modules/next/dist/compiled/next-devtools/index.js`). The deprecated
`buildActivity` / `buildActivityPosition` keys warn on this version and must not
be used. So the mechanism does what RULING 33 says: **no badge is rendered in the
gated environment, and nothing about `next build` output changes** — the whole
overlay is dev-server-only.

**Ruling.** `frontend/next.config.ts` sets `devIndicators: false` **only** when
`process.env.ENV === 'test'`; `frontend/playwright.config.ts`'s `webServer.env`
sets `ENV: 'test'` (joining the `NEXT_DIST_DIR` / `NEXT_PUBLIC_*` values it
already sets for the isolated e2e frontend). Travis's own `npm run dev` sets no
`ENV`, so his overlay is untouched. Nothing in `frontend/` reads
`process.env.ENV` today (grepped), so the marker collides with nothing.

**Ownership.** `next.config.ts` is in the production tree → `openspec-nextjs-dev`.
`playwright.config.ts` is journey-harness configuration → `openspec-sdet`. Neither
crosses into the other's file, and no test assertion is touched by either.

**No spec delta and no new task.** This is not product behaviour: `devIndicators`
has no effect outside `next dev`, so there is no requirement to write and nothing
a player can observe. It is gate infrastructure, recorded here and in the journey
record rather than in `tasks.md`. (Contrast the batched round's `FloatingNav`
fix, which *was* product code and traced to `system-console`'s
*No other floating surface covers a strip cell*.)

**Alternatives rejected.** (a) Gate on `NEXT_DIST_DIR` being set — needs no
`playwright.config.ts` edit, but couples a dev-tooling decision to a build-cache
path, and renaming the dist dir would silently re-arm the badge. (b) Reposition
the indicator (`devIndicators: { position: 'top-right' }`) instead of disabling
it — leaves a framework surface loose in a viewport the journey asserts on, and
moves the contention rather than removing it.

**Reversal cost.** Two lines, one in each file.

### FULL-AUTO RULING 45 — the caveat is closed by instrumenting the run, not by trusting the inference; and the portal is also hidden test-side for the one-run budget

RULING 33's caveat forbids suppressing the badge without reading the two issues
it counted. The inference on record is strong — RULING 36 filed
`defect-docked-selection-polls-zero-length-preview.md` after reproducing, **live
and four times**, a docked fleet whose still-selected host makes `useBurnPreview`
poll a zero-length burn that the server refuses 500 every ~10s — but an inference
is what this link has been burned by five times (RULING 42's lesson: every
analysis that reasoned from a log's *absence* was wrong).

**Ruling.** The third run **captures** the issues instead of inferring them:

1. `frontend/e2e/tests/vitals-strip-journey.spec.ts` registers `page.on('pageerror')`
   and `page.on('console')` (error/warning levels) into a buffer that is printed
   at the end of the journey, pass or fail. Whatever the badge would have counted
   is then named in the run log, in this change's own record, by evidence.
2. `frontend/playwright.config.ts`'s `webServer` gains `stdout: 'pipe'` /
   `stderr: 'pipe'` — the exact gap the rerun's Finding A named
   (`next dev`'s own console "was not captured anywhere this run wrote to").
3. Belt and braces for the **one-run budget**: the journey also injects
   `nextjs-portal { display: none !important }` via `page.addInitScript`, so the
   run survives even if the config gate does not take (a reused server on :3110,
   a mis-set env). Hiding the host element cannot hide anything from the record,
   because 1 and 2 capture the same errors independently of the overlay.

**Basis.** Precedence 1 — RULING 33's own caveat text. Precedence 4 for the
belt-and-braces: the gate has exactly one run left, and a redundant test-side
guard costs three lines and no assertion.

**Alternatives rejected.** (a) Reproduce by hand against Travis's dev stack on
:3010 — his data has no docked fleet at a selected host on demand, so it means
driving a full spawn-and-dock by browser against a stack I was told to leave
alone, to learn what the filed defect already recorded. (b) Trust RULING 36 and
suppress unread — precisely what the caveat forbids.

**Reversal cost.** Delete one `beforeEach` block and two `webServer` keys.

### FULL-AUTO RULING 46 — `floating-nav` joins the journey's floating-surface list; the surface that broke this gate must be asserted, not assumed fixed

**The gap.** The journey's step 4 checks the strip's five cells against four
surfaces — `space-fleet-panel`, `preview-panel`, `space-camera-controls`,
`sightings-unavailable` — the three the impl contract's §9 bottom-band survey
enumerated plus the ghost layer's error card. `FloatingNav` is **not** in that
list, and `FloatingNav` is the surface that actually failed this gate's run 1.
Its fix (`frontend/components/floating-nav.tsx:33`, `bottom-4` →
`bottom-[4.5rem]`) is currently verified only *indirectly* — by the rerun's
failure moving from `:222` to `:257`. The scenario it violated
(*No other floating surface covers a strip cell*) would archive asserted
against every surface **except** the one known to have violated it.

**Ruling.** The SDET adds `floating-nav` to step 4's `floatingSurfaces` list.
That is an **added** assertion over the same scenario, not a changed or relaxed
one; every existing expectation stays byte-identical.

**Basis.** Precedence 2 — the requirement's own text says "every floating
surface the view mounts", and the batched round already adjudicated
`FloatingNav` as in scope (it is mounted app-wide by
`layout-wrapper.tsx:108`, on every route the view renders under). Precedence 1
also applies: the chain doc's Taught record for this link says
"**the framework itself is an occupant**" and that no hand survey found the
corner's occupants — an assertion is the only thing that closes that.

**Why this is safe to add on the last run, checked rather than hoped.** The
geometry is arithmetic, not luck: the strip is `h-14` = 56 px
(`VitalsStrip.tsx:249`) and `FloatingNav` now sits at `bottom-[4.5rem]` = 72 px,
a 16 px clearance. If that arithmetic is wrong the assertion fails — and a
failure there would be a **real** violation of a live requirement, which is
precisely what this gate exists to catch. An assertion that can only pass is
worth nothing.

**Alternatives rejected.** (a) Leave the list as authored and record the
indirect verification — ships the change's central layout scenario with its
one known offender excluded from the check. (b) Add it as a separate new
journey step — the journey is one spec walking one path (`docs/testing-tiers.md`),
and this belongs in the step that already owns the geometry.

**Reversal cost.** One line in one array.

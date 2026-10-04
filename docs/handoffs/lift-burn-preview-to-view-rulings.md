# `lift-burn-preview-to-view` — open questions and rulings

Link 2a-ii of the system-HUD chain (`docs/plans/system-hud/chain.md`), carved
out of `add-burn-cost-overlay` by that change's FULL-AUTO RULING 1
(`docs/handoffs/add-burn-cost-overlay-rulings-index.md`). Run under
`/team … --full-auto`: every user gate is lifted; every open question is ruled
in-run by the precedence in `harness/skills/openspec-team-workflow/SKILL.md`
§ "Full-auto chains":

1. the chain doc's / scoping doc's recorded lean,
2. a settled decision in root `CLAUDE.md` or `openspec/project.md`,
3. the panel's recommendation,
4. the most reversible option.

A ruling with a recorded basis is a decision; a choice without one is a guess,
and guesses are forbidden.

Design analysis (covers both halves of the split; this link is its groups A and
B plus Q7 and Q10): `docs/handoffs/add-burn-cost-overlay-analysis.md`, index
`add-burn-cost-overlay-analysis-index.md`.

---

## Rulings made at orchestration open (before authoring)

### FULL-AUTO RULING 1 — this change is the lift, the panel's prop conversion and the preview's three unenforced preconditions; the gauge overlay is not in it

**Question.** What is in scope?

**Ruling.** In: `useBurnPreview` called once, in `SystemSpaceView`;
`SpaceCommandPanel` receiving the quote by props and no longer importing the
hook (the link deletes what it replaces); the panel test harness migrated; the
wrong-shape `useBurnPreview` mocks in the view test files corrected; RULINGs
2–4 below. Out: the `Gauge`/`VitalsStrip` overlay and anything passed to the
strip (link 2a-iv, `add-burn-cost-overlay`); the "A Failed or Stale Preview Is
Never Presented as a Current Quote" and "System Space View Route and Data
Fan-In" requirements; the undrawn preview curve
(`docs/handoffs/drift-preview-curve-never-drawn.md`, link 4).

**Basis.** `add-burn-cost-overlay` FULL-AUTO RULING 1 (the split and its seam);
chain doc "What every link must not do" — "Keep the thing it replaces."

**Alternatives rejected.** Passing the quote to the strip as an unused prop now
— an unspecced prop with no consumer, the "built and never called" species the
handoffs README catalogues.

**Reversal cost.** None; scope statement.

### FULL-AUTO RULING 2 — the running-mine preview suppression is fixed at the lifted call site, takes no delta, and is proved by a view-level test that makes a selection first

**Question.** How is `drift-running-mine-preview-unsuppressed.md` closed?

**Ruling.** The lifted call site's `commitWouldBeAccepted` includes the
running-mine condition. No delta: the live scenario "No preview is requested
while a mine holds the movement channel" becomes true. The proof is a test
that renders the real `SystemSpaceView`, makes a selection, has a mine running,
and observes the real call site — preferably that no preview request is sent,
at minimum the argument the real call site passes. A test that mocks the hook
and passes the flag in by hand does not close it; a test that never selects
passes against the bug (analysis § 5).

**Basis.** Precedence 1 — chain doc Link 2a-ii "Carries a filed defect … must
not carry the bug up … needs no delta … needs a view-level test"; the drift
file's adjudication (code wrong). The analyst checked the no-delta claim against
the spec text and it holds.

**Alternatives rejected.** A MODIFIED rewording the requirement's rationale
("a commit would be refused" is false for a mine per
`defect-burn-cancels-running-mine.md`) — whether a burn should cancel a running
mine is that defect's question, not this link's; the SHALL NOT is unambiguous
without its rationale.

**Reversal cost.** One expression.

### FULL-AUTO RULING 3 — the docked-at-target preview poll is fixed here by a precondition, not by clearing the selection: no preview is requested while the selected target is the acting fleet's own host

**Question (analysis Q10).** Carry
`defect-docked-selection-polls-zero-length-preview.md`, and in which shape?

**Ruling.** Carried. Shape 2 of the defect file: a precondition on the preview
request — when the selection is the body, station or gate the acting fleet is
attached to, no preview is requested and the panel presents that state as
neither a quote nor a failed quote. The selection itself is untouched. It takes
a scenario under MODIFIED "Burn Preview Reflects the Server-Solved Order,
Without Committing" (all seven live scenarios carried verbatim), since the
defect file's own staleness condition is "a requirement stating when a preview
is *not* requested, with the docked-at-target case named". What the panel shows
in that state (and whether the Burn control is offered for a zero-length burn)
is for the UX reviewer and architect to pin; the writer drafts it as the
existing no-selection presentation unless the spec text forces otherwise.

**Basis.** Carrying: `add-vitals-strip` FULL-AUTO RULING 36 — "a natural
candidate for link 2a-ii … which owns the preview lift"; the defect file —
"Natural owner: link 2a-ii … they should be specified together rather than
patched apart." Shape: precedence 4 — shape 2 changes no selection behaviour
and no other requirement; shape 1 (clear the selection on dock) rewrites
"Toggle-to-Deselect Single Selection…".

**Alternatives rejected.** Shape 1; leaving it filed (its 500s land in every
journey's console capture on the most common state in the game).

**Reversal cost.** One guard and one scenario.

### FULL-AUTO RULING 4 — a committed order clears the preview, as the live text already requires; the mechanism is quote suppression in the view, never a selection change — PROVISIONAL on mechanism until the panel reports

**Question (analysis Q7 and § 6 item 5).** The live requirement says the preview
"SHALL clear … when an order commits"; there is no scenario and no
implementation — the selection is kept and polling continues.

**Ruling.** Drift, adjudicated **code wrong**, fixed here because the lift owns
the one place the quote lives. A scenario is added under the same MODIFIED as
RULING 3. Provisional mechanism: after a successful burn commit the view holds
no quote and requests none for that selection until the selection or the acting
fleet changes; the selection is not cleared; a re-target to a *different*
selection is previewed as the live requirement demands. The architect must
check this against "A Commit's Actual Result Is Never Silently Swapped for the
Previewed One" and "Burn Commit Reports Its Outcome" (the committed-vs-previewed
figures must survive the clear) and may recommend a different mechanism; the
ruling is finalised after the panel.

**Basis.** That it is fixed: precedence 2 — workflow skill drift handling (code
wrong → corrective task through the pipeline), plus chain doc Link 2a-ii, which
needs "withdrawn … when an order commits" to be true of the lifted quote before
the overlay can project it. Mechanism: precedence 4 pending precedence 3.

**Alternatives rejected.** Clearing the selection on commit — changes selection
behaviour and a third requirement. Leaving it for 2a-iii — the overlay would
then be authored against a quote lifetime the code does not have.

**Reversal cost.** One piece of view state.

### FULL-AUTO RULING 5 — zero backend work, no palette or layout change, and the unspecced edits U1–U10 are neither reverted, retro-specced nor built on

**Question.** The fences.

**Ruling.** No backend field, endpoint or query; no galaxy-view work; no
palette/type changes; no Go↔TS mirror. `SystemSpaceView.tsx`'s U2 hunks (the
timer hunks and the import the analyst names in analysis § 7) stay
byte-identical; no requirement or task cites `wallMsUntil`; the commit-clear
mechanism uses no timer. `PREVIEW_REFRESH_MS` and `BURN_FUEL_ALLOWANCE` are not
redeclared. Panel testids are kept so the e2e helpers need no edit.

**Basis.** Precedence 1 — chain doc "No backend work anywhere in this chain" and
"What every link must not do"; `docs/handoffs/add-vitals-strip-qa-reverify.md`
(U1–U10 are Travis's to adjudicate).

**Alternatives rejected.** None considered.

**Reversal cost.** None.

### FULL-AUTO RULING 6 — exactly one production call site of the preview hook is a guarded invariant, and the lifted quote's currency is derived once, in the view

**Question.** How is "lifted, not duplicated" kept true?

**Ruling.** A static guard test asserts `SpaceCommandPanel` does not import
`@/hooks/use-burn-preview` and that exactly one production module calls it. The
view derives the current quote once and passes that to the panel; no effect
copies the quote into component state ("Animation Never Re-Renders the View,
and Never Starves a Navigation" constrains this). These are design.md decisions
and tasks; the lift itself is HOW and takes no requirement of its own.

**Basis.** `add-vitals-strip` RULING 5 ("never a second query … doubles the
request rate and creates two quotes that can disagree"); the live requirement's
"Exactly one fresh preview request SHALL be sent per elapsed interval".

**Alternatives rejected.** A React context for the quote — a third consumer
surface with no requirement behind it.

**Reversal cost.** One guard test.

---

## Rulings made after the panel reported (architect, UX, security — 2026-10-03)

Panel reports: `lift-burn-preview-to-view-panel-architect.md`,
`lift-burn-preview-to-view-panel-ux.md`, `lift-burn-preview-to-view-panel-security.md`.
Dispositions of every finding: `lift-burn-preview-to-view-panel-consolidated.md`.

### FULL-AUTO RULING 7 — the commit-clear is a stored click-time (fleet, selection) pair compared in render against the derived acting fleet and live selection; RULING 4's provisional handler-clearing is replaced

**Question.** RULING 4 left the mechanism provisional pending the panel.

**Ruling.** Architect A1 accepted: the view holds the click-time
`{fleetId, selectionKey}` set by a panel commit-success callback; the preview is
suppressed while that pair equals the derived acting fleet and the live
selection, and the pair is dropped when it stops matching. No enumeration of
setter handlers. The architect's stated fallback (dropping in the three setter
sites) is a design change to bring back to the orchestrator, never taken
silently, if lint rejects the guarded in-render update.

**Basis.** Precedence 3 — architect (wins on technical shape): the acting fleet
is *derived* (`SystemSpaceView.tsx:295-296`) and changes with no handler when
the own-fleets read lands differently, so handler-clearing cannot be complete.

**Alternatives rejected.** Handler-clearing (misses derived changes); clearing
the selection (RULING 4).

**Reversal cost.** One piece of view state.

### FULL-AUTO RULING 8 — wherever no preview is requested by precondition the burn command is unavailable, its reason is stated and tied to the control, and no uncapped label or retry is shown; UX prevails over the architect's "leave it enabled"

**Question.** Architect A10 recommends leaving Burn enabled and labelled
"Uncapped" when docked at the target and just after a commit (disabling needs
two more MODIFIED blocks); UX F1–F3 call the enabled states a dead end (a 500
answered with "please try again") and a danger (an uncapped second order that
today is capped by the still-polled quote), and the mine state's uncapped label
beside a disabled Burn false.

**Ruling.** UX's position, stated as ONE rule rather than three: the burn
command is offered exactly where a preview is requested (or was requested and
failed). In every state where the preview is withheld by precondition — a
running mine holds the movement channel, the fleet is in lane transit, the
selected target is the acting fleet's own host, or an order is committed to
this selection — the burn command SHALL be unavailable, the view SHALL state
the reason, that reason SHALL be the control's accessible description, and no
uncapped label, no-quote state, stale marking or retry SHALL be shown. This
takes two further MODIFIED blocks, every live scenario verbatim:
"Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly" (the
carve-out is a precondition on the acting fleet's state, not a selection-kind
branch) and "A Failed or Stale Preview Is Never Presented as a Current Quote"
(its "WHILE a selection has no successful, current preview … the burn command
SHALL remain available" clause is scoped to a preview that was *requested*).

**Basis.** Precedence 3 with the standing tie-break — UX wins on
user-observable behaviour, the architect on technical shape; the architect's
objection is cost, not shape. Independently forced: once RULING 2's drift fix
lands, the live "Failed or Stale" clause ("none has succeeded … SHALL remain
available") and live `docked-fleet-actions` "Running Mine Gates the Fleet
Panel's Commands" (Burn disabled during a mine) contradict each other for a
mine-held selection, so that requirement needs its carve-out whatever is ruled
for the other two states — the writer's and architect's "unaffected" verdict on
it does not survive the spec text. And RULING 4's clear would otherwise
*introduce* an uncapped re-order where today there is a capped one.

**Alternatives rejected.** Leave enabled (architect) — ships a doomed action on
the game's most common state and a regression in the quote-lock's reach. Map
the zero-length refusal in `BURN_COPY` (UX's fallback) — still offers the action.

**Reversal cost.** Two carve-out sentences and one disabled-condition.

### FULL-AUTO RULING 9 — a mine that starts while a quote is shown withdraws it, and the quote returns when the mine ends; jump takes no clear of its own; quote changes are silent

**Question.** design.md open questions 3 and 5; UX F3, F4; architect A8.

**Ruling.** As both reviewers recommend: scenarios for mine-start-while-shown
(withdrawn, no further request) and mine-completion (request resumes for the
held selection); no jump-specific clear (lane transit already suppresses); one
scenario pinning that a preview appearing, refreshing or being withdrawn, and
the reason lines of RULING 8, make no live-region announcement.

**Basis.** Precedence 3 — architect and UX agree; the hook already returns no
quote while disabled, so this states what the code does by construction.

**Alternatives rejected.** Keeping a shown quote through a mine — a quote beside
a command the view refuses.

**Reversal cost.** None; scenarios over existing behaviour.

### FULL-AUTO RULING 10 — no retry or re-quote path sends a preview request while the preview is suppressed

**Question.** Architect A6 / UX F7: the hook's `retry` is `refetch()`, which
runs on a disabled query.

**Ruling.** Accepted: the hook's retry is a no-op while the preview is
suppressed; one scenario, one hook test, one task, and the proposal's Impact
names `use-burn-preview.ts`.

**Basis.** Precedence 3 — both reviewers; the live "no preview request is sent"
must hold absolutely.

**Alternatives rejected.** Guarding only at the panel's call — leaves the hook's
contract false for link 2a-iii's second consumer.

**Reversal cost.** One guard.

### FULL-AUTO RULING 11 — the carried "since a commit would be refused" rationale is corrected, and the server's 500 on a zero-length solve is filed, not fixed

**Question.** Security MINOR 1 and advisory A.

**Ruling.** The MODIFIED block's rationale clause is rewritten so it no longer
asserts a server refusal for the running-mine case (security's paste-ready
text, reconciled with architect A2's replacement paragraph by the writer). This
narrows RULING 2's "no rewording": the SHALL NOT and every scenario stay; only
the false rationale goes, and whether a burn should cancel a mine remains
`defect-burn-cancels-running-mine.md`'s question. The backend's unmapped
`ErrArcTooShort` → 500 is filed as
`docs/handoffs/defect-zero-length-burn-returns-500.md`; no backend edit here.

**Basis.** Precedence 3 — security wins on controls: a client suppression must
not read as a server guarantee. Chain doc: no backend work in this chain.

**Alternatives rejected.** Leaving carried text byte-identical with a design.md
note — the false sentence would then archive into the live spec again.

**Reversal cost.** One sentence.

### FULL-AUTO RULING 12 — the pre-existing loading-window uncapped label (UX F5) and the drift notice that outlives its target (UX F6) are filed for later links, not fixed here

**Question.** Two pre-existing presentation defects the UX review surfaced.

**Ruling.** Neither is introduced or worsened by a requirement of this change;
both are recorded in `docs/handoffs/defect-command-panel-residual-presentation.md`
for link 2a-iii (F5, the uncapped label while the first quote is in flight) and
link 4 (F6, which MODIFIES the commit-result surface anyway). Architect A12's
correction to the "figures outlive" scenario's GIVEN is accepted.

**Basis.** Precedence 2 — workflow skill "No opportunistic edits": adjacent bug
fixes are reported as proposed changes, not done; and the 40-task cap.

**Alternatives rejected.** Fixing F6 here (UX's paste-ready scenario) — a
behaviour change to "A Commit's Actual Result Is Never Silently Swapped for the
Previewed One", a fourth MODIFIED block, for a defect this change does not touch.

**Reversal cost.** None; a filing.

---

## Rulings made on adversary round 1 (2026-10-03)

Round record: `lift-burn-preview-to-view-adversary-r1.md` (1 BLOCKER, 5 MAJOR,
5 MINOR, NOT CLEAR; every finding confirmed).

### FULL-AUTO RULING 13 — the commit-clear leaves this change and becomes its own link, `clear-burn-preview-on-commit` (2a-iii, `not authored`); RULINGs 4 and 7 are withdrawn here and carried there as input

**Question.** Adversary B1: the committed hold never ends when the order does
(cut drive, stop, arrival at a point, an outside re-task), so the spec mandates
a false statement and blocks the re-burn. M5 and m4 are consequences of the same
clause. Repairing B1 honestly needs an order-identity design, its scenarios and
tests, and (M5) a stranding notice that survives the commit — on a change that
already sits at exactly 40 tasks "by bundling" (adversary m5).

**Ruling.** Split at the commit-clear. This change keeps the lift, the prop
conversion, the running-mine fix, the docked-at-target precondition and the
RULING 8 rule over **three** withheld states (running mine, lane transit,
attached to the selected target). It drops: the `committed` hold, the stored
pair, the `onBurnCommitted` prop, every commit-clear scenario and task, UX F2's
scenarios, architect A1/A4's mechanism and tests. After a commit the preview
keeps refreshing exactly as it does today, so nothing this change ships is
worse than today on that path: the second Burn is still capped by the
still-polled quote and the preview's stranding line is still on screen.

The live sentence "SHALL clear … when an order commits" stays in the MODIFIED
block as carried live text, still unimplemented; that is drift, filed as
`docs/handoffs/drift-preview-does-not-clear-on-commit.md`, owner
`clear-burn-preview-on-commit`. That link is inserted in the chain doc after
this one and before `add-burn-cost-overlay` (which needs "withdrawn when an
order commits" true of the lifted quote), state `not authored` for the reason
`add-burn-cost-overlay` RULING 1 gives. Its design input is the chain doc
section, adversary r1's B1/M5/m4, UX F2, architect A1/A4, and RULINGs 4 and 7
above as the recorded (and now known-incomplete) first attempt.

**Basis.** Precedence 2 — workflow skill § Chains: a link that grows past 40
under review is split before authoring continues. The count is 40 now and B1's
repair plus M3, M4 and M5 add at least five. The seam is clean: the committed
state is one independent term of the call-site flag with its own central
question (when does a committed selection stop being committed), touches the
commit path no other part of this change touches, and its removal leaves every
remaining scenario true. RULING 4's own basis for carrying it ("the overlay
would be authored against a quote lifetime the code does not have") is met by
the ordering.

**Alternatives rejected.** (a) Repair B1 in place — past the cap, and it would
enter round 2 as new, unreviewed design on the change's most error-prone clause.
(b) Keep the clear and accept the false statement — a BLOCKER cannot ride.
(c) Drop the clear and not file it — the live text would stay silently false.

**Reversal cost.** One chain-doc row; nothing built.

### FULL-AUTO RULING 14 — the one rule is scoped to a selection, an acting fleet, an available canvas and no commit in flight, and the uncapped label appears only where the burn command is available

**Question.** Adversary M1: "offered exactly where a preview is requested" is
false with the canvas unavailable and during an in-flight commit, and the
no-fleet / no-selection states are undefined.

**Ruling.** The rule's biconditional is stated only for the case where there is
a selection, an acting fleet, an available canvas and no commit in flight. The
live requirements that already govern the other cases (double-submit; renderer
unavailability; no selection) are named as governing them, unchanged. One
general clause is added: the uncapped-burn label SHALL NOT be shown while the
burn command is unavailable for any reason. No new reason copy is specified for
the canvas, no-fleet or no-selection cases — they are not withheld states and
the live requirements already present them.

**Basis.** Precedence 4 — the narrowest text that makes "exactly" true against
the live Double-Submit and context-loss requirements without changing either.
The label clause follows RULING 8's own reasoning (a commit promise beside a
command that cannot be invoked is false).

**Alternatives rejected.** Enumerating every unavailable state with a reason —
new copy and new MODIFIED blocks for states this change does not touch.

**Reversal cost.** One sentence.

### FULL-AUTO RULING 15 — each hold is stated against what the view has read; the burn hold and the fleet panel's mine gating read one value; the pending and failed cases are specified, with the architect choosing the pending behaviour

**Question.** Adversary M3: the SHALL NOT is stated as world truth but known
only through reads; a pending or failed running-mine read sends the forbidden
request.

**Ruling.** The requirement text says "as last read by the view" for the mine,
transit and attachment states. Two properties are fixed here: (1) the command
surface's mine hold and `docked-fleet-actions`' mine gating are driven by the
same value and cannot disagree; (2) the spec states what happens while the
running-mine read for a newly acting fleet has not yet answered, and when it
has failed — the architect recommends which (withhold until the first answer,
or request) from the code and the live `docked-fleet-actions` text, and that
recommendation is the ruling (precedence 3). A view-level test covers switching
the acting fleet to a mining fleet with a selection held. The residual exposure
(a failed read offers Burn over a mine the server will cancel) is recorded as a
risk against `defect-burn-cancels-running-mine.md`, which owns the server side.

**Basis.** `add-vitals-strip` RULING 4's principle (two surfaces projecting one
served state must not be able to disagree); precedence 3 for the pending case.

**Alternatives rejected.** Leaving the absolute SHALL NOT — unsatisfiable and
untestable, as the adversary shows.

**Reversal cost.** One clause, one test.

### FULL-AUTO RULING 16 — the change is narrowed to the lift and the two request preconditions; RULING 8's stated-reason holds are deferred to a filed follow-up, and RULINGs 14 and 15 shrink with it

**Question.** The architect's repair of round 1
(`lift-burn-preview-to-view-panel-architect-r1-repair.md`) is sound and comes to
**49 tasks** with the commit-clear already removed: RULING 8's rule over the
withheld states (+ its two extra MODIFIED blocks, the reason lines, lane
transit), RULING 15's fail-closed pending/failed handling, and a refactor making
the view the only reader of the running mine for both panels (+10, opening
`FleetActionsPanel`). Two more seams would be needed to get under 40.

**Ruling.** The growth has one source — RULING 8 turned a request-suppression
fix into a redesign of when and why the burn command is unavailable. That
redesign is deferred whole, as a follow-up change outside the chain
(`docs/handoffs/followup-explain-withheld-burn-command.md`), and this change is
exactly:

1. the lift, the prop conversion, the one-call-site guard (RULINGs 1, 5, 6);
2. the running-mine suppression at the lifted call site (RULING 2), reading the
   **same `mineRunning` value the view already hands the command panel** for
   its Burn gate — so the preview flag and that gate cannot disagree — with the
   requirement worded "as last read by the view" and the pending window stated
   as lag, not denied (RULING 15, reduced);
3. the docked-at-target precondition on the **request only** (RULING 3): no
   preview is requested, and the state is neither a quote nor a failed quote;
   the burn command's availability there is **unchanged from today**;
4. a mine starting while a quote is shown withdraws it, and it returns when the
   mine ends by ETA or by cancel (RULING 9); quote changes are silent;
5. the retry no-op while suppressed (RULING 10); the corrected rationale
   (RULING 11);
6. two small consequences the mine fix itself forces: "A Failed or Stale Preview
   Is Never Presented as a Current Quote" is MODIFIED so its "SHALL remain
   available" clause does not override a requirement that makes the burn command
   unavailable for another reason (live `docked-fleet-actions` running-mine
   gating), and its "labelled as uncapped" applies only where the burn command
   is available — the uncapped label is not shown beside an unavailable Burn
   (RULING 14, reduced to this clause).

Out, to the follow-up: the burn command becoming unavailable when attached to
the target or in lane transit; every stated reason line and its accessible
description; the `burnHold` prop and `burn-hold-reason` testid; the MODIFIED
block on "Burn Command Targets Any Selected Body, Lane Gate, or Point
Uniformly"; fail-closed handling of a pending or failed running-mine read; the
single-reader refactor of `FleetActionsPanel`. A view-level test still observes
each term of the call-site flag, present and absent (adversary M4), including
lane transit in the one arrangement the view can reach (adversary M2, as the
architect verified).

**Basis.** Precedence 2 — the 40-task cap and the workflow skill's "MAJOR and
MINOR residue … becomes a follow-up change"; "no opportunistic edits". UX F1 and
the reason half of F3 describe states that exist **today** (an enabled Burn
toward the fleet's own host that 500s; no in-panel reason during a mine) and
that this narrowed change does not worsen: it removes the 500 polling and the
unsatisfiable Retry, and item 6 removes the one false label the fix would
otherwise introduce. The standing tie-break (UX wins on observable behaviour)
decides *what* the behaviour should be — RULING 8 stands as the recorded answer
— not that it must ship in this link. The architect's own round-1 advice was to
leave these to the link that redraws the surface.

**Alternatives rejected.** (a) Ship 49 tasks. (b) Two more chain links — the
chain needs only the lift before the overlay; the hold redesign gates nothing.
(c) Keep the reason lines but drop the refactor — the adversary's M1/M3 attack
the reason rule itself; a half-rule re-enters round 2 with the same holes.

**Reversal cost.** None built; the follow-up file carries the full design.

---

## Rulings made on adversary round 2 (2026-10-03)

Round record: `lift-burn-preview-to-view-adversary-r2.md` (0 BLOCKER, 2 MAJOR,
8 MINOR, NOT CLEAR; every finding accepted).

### FULL-AUTO RULING 17 — a preview that resumes after being withheld starts empty and is requested at once, and a cap rejection landing while the preview is withheld re-quotes nothing

**Question.** Adversary r2 M1: when a withheld preview resumes (a mine ends),
the natural implementation re-presents the pre-mine quote as current — figures,
ceiling and cap — until the new response lands, or for a further interval after
a prompt cancel. M2: the new "no retry or re-quote sends a request while
withheld" rule and the unmodified *A Burn Commit Is Quote-Locked…* ("IF the
commit is rejected for exceeding its cap, THEN the system SHALL request a fresh
preview") give opposite THENs for a cap rejection that lands in a withheld
state.

**Ruling.** M1 — for every term that can withhold: on the transition from
withheld to requested, the view SHALL present no figure, ceiling or cap from a
response received before the withholding began; the restoring request SHALL be
sent at the transition, not at the next interval; and if the restoring request
fails the state is the no-quote state, not a stale marking. M2 — the modified
preview requirement states that the withheld states bound the quote-lock's
re-quote: a cap rejection that lands while the preview is withheld requests
nothing and presents nothing for re-confirmation; the re-quote obligation
resumes with the preview. No third MODIFIED block.

**Basis.** M1: precedence 2 — the live requirement this change already
modifies, *A Failed or Stale Preview Is Never Presented as a Current Quote*: "a
cap SHALL never be derived from a figure the view has already marked stale" and
no figures are presented as current that are not; a quote older than a whole
mine run is the case that rule exists for, and the conservative reading is the
only one consistent with it. M2: precedence 4 — one sentence where the new rule
lives is the smallest text that removes the contradiction; a re-quote for a
state in which no preview may be requested has nothing to re-confirm.

**Alternatives rejected.** M1: allow the earlier figures to reappear with a
stated bound — keeps a cap derived from a pre-mine quote, which link 2a-iv would
then draw on the fuel gauge. M2: MODIFY *Quote-Locked* too — a third block for a
precedence statement.

**Reversal cost.** One clause each.

---

## Ruling made on adversary round 3 — the cap (2026-10-03)

### FULL-AUTO RULING 18 — Phase 1 closes at the round cap: the round-3 residue (one tasks-only MAJOR, five MINORs) is repaired exactly as the adversary stated, inside the verdict commit, without a fourth round

**Question.** Round 3 (`lift-burn-preview-to-view-adversary-r3.md`) is NOT
CLEAR on one MAJOR — no task observes the view's failed/stale wiring or its one
derivation of the current quote — and five MINORs. The cap is three rounds.

**Ruling.** All six accepted and applied as the adversary's "principle for the
fix" states them; the orchestrator verifies by diff that nothing else changed;
the commit that contains them is the verdict commit. No fourth round, no
follow-up change for this residue.

**Basis.** Precedence 2 — the workflow skill: BLOCKERs never ride forward
(there is none); residue-only rounds are convergence, not a reason for another
attack; and the recorded precedent `add-vitals-strip-adversary-r3.md` ("the cap
governs adversary rounds rather than repairs"). Deferring M1 to a follow-up
change instead would knowingly ship a suite that passes against a cap derived
from a stale figure, which link 2a-iv then draws on the fuel gauge.

**Alternatives rejected.** A fourth round (the cap). Carrying M1 forward as a
follow-up (leaves the gap open through the build that needs it closed).

**Reversal cost.** None. **Residual risk, recorded:** the six repairs are not
adversarially reviewed; the SDET's red phase and QA's closing-assertion pass
are the next readers of them.

---

## Rulings made at implementation kickoff (2026-10-04)

### FULL-AUTO RULING 19 — the architect's four kickoff edits to design.md do not expire the verdict: they change no requirement, scenario, task or proposal line, and are recorded as un-attacked residue with the round cap spent

**Question.** The currency check `git diff e3fd54c -- openspec/specs/system-space-view
openspec/changes/lift-burn-preview-to-view` is no longer empty: the architect's
kickoff edited design.md (E1–E4 in the impl contract's report: the mount-time
running-action read, the e2e specs' reads of the figure testids, the precise
discard mechanism, one new risk bullet). The re-attack scope would be that
diff; the three rounds are spent.

**Ruling.** The orchestrator read the diff (4 insertions, 3 deletions, design.md
only): each edit states a fact about existing code or sharpens a HOW the
contract depends on; none alters what is required. The verdict on the deltas
and tasks stands at `e3fd54c`; the design.md diff is committed with the impl
contract and recorded here as not adversarially reviewed. From this commit on,
the currency check for the build is the delta and tasks: `git diff e3fd54c --
openspec/specs/system-space-view openspec/changes/lift-burn-preview-to-view/specs
openspec/changes/lift-burn-preview-to-view/proposal.md` (tasks.md changes only
by checkboxes).

**Basis.** Precedence 2 — workflow skill: the architect owns design.md and
finalises the technical approach at kickoff; a verdict expires when "the spec is
edited" — the clauses whose live targets or delta text changed — and neither
did. RULING 18's treatment of post-cap residue.

**Alternatives rejected.** A fourth adversary round on four explanatory
sentences. Reverting the architect's corrections (leaves design.md wrong about
the read's lifecycle, which the SDET's harness depends on).

**Reversal cost.** None.

### FULL-AUTO RULING 20 — a transient "No quote" at a mine's end is accepted for this change and recorded; the journey does not assert the quote returns without it

**Question.** Architect kickoff F1: the restoring request at a mine's ETA can
reach the server before the mine is settled and be refused once, showing the
no-quote state and Retry until the next interval.

**Ruling.** Accepted. The spec stays true (RULING 17's failed-restoring-request
rule covers it) and nothing regresses — today the panel shows that state for
the mine's whole duration. Recorded in
`followup-explain-withheld-burn-command.md`; the fix, if wanted, is backend
(settle a due mine on preview) and outside this chain's fence. The architect's
added test arm for task 1.8 (F3) and its accurate gate map (F2) are accepted as
contract content; tasks.md is not edited.

**Basis.** Precedence 1 — chain doc: no backend work in this chain. Precedence 4
for not adding a client-side cushion (a timer, forbidden by RULING 5).

**Alternatives rejected.** A client delay on the flag — a timer and a second
notion of when a mine ends.

**Reversal cost.** None.

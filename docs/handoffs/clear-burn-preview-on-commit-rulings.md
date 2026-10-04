# `clear-burn-preview-on-commit` — open questions and rulings

Link 2a-iii of the system-HUD chain (`docs/plans/system-hud/chain.md`), split
off `lift-burn-preview-to-view` by that change's FULL-AUTO RULING 13
(`docs/handoffs/lift-burn-preview-to-view-rulings-index.md`). Run under
`/team … --full-auto`: every user gate is lifted; every open question is ruled
in-run by the precedence in `harness/skills/openspec-team-workflow/SKILL.md`
§ "Full-auto chains":

1. the chain doc's / scoping doc's recorded lean,
2. a settled decision in root `CLAUDE.md` or `openspec/project.md`,
3. the panel's recommendation,
4. the most reversible option.

A ruling with a recorded basis is a decision; a choice without one is a guess,
and guesses are forbidden.

Design analysis: `docs/handoffs/clear-burn-preview-on-commit-analysis.md`.

---

## Rulings made at orchestration open (before authoring)

### FULL-AUTO RULING 1 — this change is the commit-clear with an end tied to the order's own life, the cap on a second Burn, and the commit's stranding warning; nothing of the withheld-burn follow-up, the overlay, or the backend is in it

**Question.** What is in scope?

**Ruling.** In: making the live clause "the preview SHALL clear … when an order
commits" true with scenarios; the end condition of the committed state, read
from the served fleet read and holding across the gap before that read first
shows the burn; what a second Burn does while the quote is cleared; the commit
response's stranding warning rendered on the system space view. Out: stating
why the burn command is unavailable in the three precondition states and
withholding it when docked at the target
(`docs/handoffs/followup-explain-withheld-burn-command.md`, deliberately out of
the chain); the fuel gauge's cost overlay (link 2a-iv); the undrawn preview
curve (link 4); any backend field, endpoint or query; the galaxy view; palette
or type changes; client-side affordability or shortfall arithmetic.

**Basis.** Precedence 1 — chain doc, the link's row and section ("Delivers",
"Why it is its own link"), "What every link must not do", and the "Out of the
chain, deliberately" paragraph.

**Alternatives rejected.** Absorbing the withheld-burn follow-up because it
touches the same control — the predecessor took that from 32 tasks to 49 and
filed it whole for that reason (chain doc, link 2a-ii Taught).

**Reversal cost.** None; scope statement.

### FULL-AUTO RULING 2 — the stranding-warning drift is specced only as far as the analyst confirms it against the code; the drift record's own claim is not evidence

**Question.** `drift-commit-stranding-warning-not-rendered.md` was reported by
an adversary and never independently re-verified. May the change be authored
on it?

**Ruling.** Not on the record alone. The analyst verifies, with file:line,
whether anything on the system space view renders the commit response's
`strandingWarning`, and whether the response carries it at all on the served
type. Confirmed → it is in scope per RULING 1. Refuted → the drift record is
corrected and the clause is dropped from this change.

**Basis.** Precedence 1 — the drift record's own status line ("not yet
independently re-verified — the owning link's analyst should confirm before
specifying"); handoffs README, the 2026-09-02 note that a confident empirical
claim from a specialist is still a claim.

**Alternatives rejected.** Speccing from the record — a requirement written
against an unverified code claim.

**Reversal cost.** None.

---

## Ruling made after the analysis (2026-10-04)

### FULL-AUTO RULING 3 — the link splits at the order record: `surface-commit-stranding-warning` is built first as link 2a-iii, and `clear-burn-preview-on-commit` follows as link 2a-iii-b, `not authored`

**Question.** The analyst sizes the unsplit link at 40 tasks (39–41) before the
panel, with 2 ADDED and 3 MODIFIED requirements where the chain doc named one
MODIFIED and one "likely"
(`docs/handoffs/clear-burn-preview-on-commit-analysis.md` §§ 3, 7). The cap is
40 and each of the last three links' panels added tasks. Split now, or author
whole and split under review?

**Ruling.** Split now, at the analyst's seam (§ 7):

1. **`surface-commit-stranding-warning`** — link 2a-iii, authored and built in
   this run. The panel's commit callback to the view; the view's per-fleet
   record of the order it committed (identity from the commit response); the
   "still that fleet's running burn, as the own-fleets read last reported"
   determination with its gap rule; the view-level test harness over a real
   own-fleets read; and the commit's stranding notice as that record's first
   consumer. The quote keeps refreshing after a commit exactly as it does
   today; nothing live becomes false.
2. **`clear-burn-preview-on-commit`** — link 2a-iii-b, `not authored`, picked
   up by a fresh orchestrator after the first half archives. The fourth
   withheld state, the burn command's availability for a committed selection,
   the three MODIFIED blocks, and the journey the chain doc gives this link.
   Its questions (analysis § 8: Q1's product half N1, Q2, Q7, Q8) are **not
   ruled here**; the analysis and this ledger are its design input.

RULINGs 1 and 2 above carry to both halves. The first half's own rulings are in
`docs/handoffs/surface-commit-stranding-warning-rulings.md`.

**Basis.** Precedence 2 — workflow skill § Chains ("links are sized to 20–40
tasks; a link that grows past that under panel review is split before authoring
continues") and § Full-auto chains item 5 (split at the pre-identified or the
architect's seam; the second half's row goes in right after the first). The
chain's own precedent is `add-burn-cost-overlay` FULL-AUTO RULING 1, which split
at 37 before the panel for the same reason. The seam is clean for the reason
the analyst gives: the hard question B1 raised — when does a committed order
stop being the running one — lands first with a consumer whose failure mode is
a notice shown too long, not a blocked command; and adversary M5's ordering
objection is met, because the commit's own stranding notice exists before the
second half removes `preview-stranding` by clearing the quote. The second
half's state is `not authored` rather than the skill's `authored` for the
reason the chain doc records for 2a-ii: its deltas target `system-space-view`
text the first half's archive changes, so authoring it now would give it a
verdict born expired.

**Alternatives rejected.** (a) Author whole and bundle tasks to stay at 40 —
the counting the predecessor's adversary called out (m5). (b) Author whole and
split if the panel pushes it over — the round cap is counted across the whole
change, and the predecessor spent a round discovering its seam. (c) The clear
first, the notice second — ships a window in which a commit removes the only
stranding text on the view (M5).

**Reversal cost.** Two chain-doc rows; nothing built.

---

## Rulings made at the link's own orchestration open (2026-10-04, after `3218d9d`)

Link 2a-iii-b. The predecessor `surface-commit-stranding-warning` is archived at
`3218d9d`; its rulings (`docs/handoffs/surface-commit-stranding-warning-rulings-index.md`)
settled the order identity (its RULINGs 2, 7), the read-only end (6), and the
failed-read rule **for the notice** (5). The four questions RULING 3 left
unruled are ruled here, each on a recorded basis; none is a hard stop.

### FULL-AUTO RULING 4 — a selection is committed only for the order this view committed; a burn the view did not commit (reload, another tab, the agent) is previewed as a re-target, as today

**Question.** Analysis Q1's product half (N1): does a running burn toward the
selected target that this view did not commit read as a committed selection?

**Ruling.** No. The committed state is keyed to the order identity the view
recorded at an accepted commit (the commit response's burn instants, per the
predecessor's RULINGs 2 and 7), widened from warned orders to every accepted
burn commit. A burn the view holds no record for is not a committed selection:
the preview is requested for it and the burn command is available, exactly as
the live text "a preview SHALL be requested while the acting fleet is burning"
already requires. The proposal states this limit plainly (a reload mid-burn
returns the quote for the flown-to target).

**Basis.** Precedence 1 — chain doc. The link's row: "The preview clears when a
burn order commits **from this view** and stays cleared for **that order's**
life". The link's section: "as a fourth withheld state built on the
order-identity derivation 2a-iii lands … this link must widen it to every
accepted commit". The live clause being made true is an event on this view
("when an order commits"). Adversary B1 of the predecessor names "the order it
names". Target-match (analysis M2) would in addition rest on point-coordinate
equality across the wire and on `Target.BodyId`, which
`docs/handoffs/defect-point-burn-serves-empty-bodyid.md` records as served
`""` — a filed defect this chain may not fix.

**Alternatives rejected.** Target match on the read (M2): mount-independent,
but contradicts the row's "from this view", widens the live sentence, inverts
the live re-target rule for a reloaded view, and builds on a filed defect.

**Reversal cost.** One derivation term and one scenario (analysis § 4 scenario
16 inverts); no stored data.

### FULL-AUTO RULING 5 — the burn command is unavailable for a committed selection, with a statement that an order is committed to that target, and returns when the committed state ends

**Question.** Analysis Q2: what does the burn command do for a committed
selection?

**Ruling.** Option (a). While the committed state holds the burn command for
that selection is unavailable and the view states that an order is committed to
the selected target; no uncapped label, no no-quote state, no retry. A
different selection stays previewable and committable throughout. The statement
carries no figure and no countdown (analysis § 6). Its copy is the UX
reviewer's to propose.

**Basis.** Precedence 1 — chain doc. This link's journey: "cut the drive and
watch **the burn command and its quote come back** for the same selection",
which presumes the command went away; "Why it is its own link": "keep a second
Burn from going out uncapped"; the row's Delivers: "the burn command for a
committed selection". Corroborated by the predecessor panel's UX F2
(`docs/handoffs/lift-burn-preview-to-view-panel-ux.md`), and by the design
canvas (`docs/plans/system-hud.md` Pointers, re-read 2026-10-04): the burning
state shows progress (`2m 40s left · Δv 269` / `burned … to go`), not a quote
or a Burn for the flown-to target.

**Alternatives rejected.** (b) available and labelled uncapped — the hazard
the chain doc names. (c) clear and immediately re-quote — no committed state,
ruled out by RULING 1.

**Reversal cost.** One disabled term and one string; the Double-Submit MODIFIED
block reverts to live text.

### FULL-AUTO RULING 6 — "Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly" takes no delta: the withdrawal is one precedence sentence in the ADDED requirement, flagged BREAKING in the proposal — PROVISIONAL until the architect reports

**Question.** Analysis Q7.

**Ruling.** Option (a): a recorded reading, no MODIFIED block. None of that
requirement's six scenarios is made false (each begins "WHEN the burn command
is invoked"). The ADDED requirement carries the precedence sentence; the
proposal marks the withdrawal **BREAKING**.

**Basis.** Precedence 3 standing in for a silent chain doc — the predecessor's
own ruling on the same sentence
(`docs/handoffs/lift-burn-preview-to-view-rulings-index.md` RULING 17, "one
sentence where the new rule lives"), the running-mine gate as live precedent
(it already qualifies the sentence without a delta), and precedence 4: (a) is
the smaller edit to undo. Provisional because the architect owns technical
shape and has not reported on this change.

**Alternatives rejected.** (b) MODIFIED with a carve-out — a fourth MODIFIED
block and six carried scenarios on a link at its size cap, for a sentence no
scenario tests.

**Reversal cost.** One MODIFIED block added.

### FULL-AUTO RULING 7 — "when an order commits" means a burn order for the current selection accepted from this view; jump, mine, cut drive and stop take no clear of their own

**Question.** Analysis Q8.

**Ruling.** The commit clause is reworded to a burn order for that selection
committed from this view, pointing at the ADDED requirement. A jump is covered
by the lane-transit withheld state, a mine by the running-mine state; cut drive
and stop are not orders for a selection and are among the ways the committed
state ends.

**Basis.** Precedence 1 — chain doc row ("when a burn order commits from this
view"); the predecessor's RULING 9 ("jump takes no clear of its own",
`docs/handoffs/lift-burn-preview-to-view-rulings-index.md`).

**Alternatives rejected.** Leaving the sentence unqualified — untestable for
verbs that already have their own withheld state, and an adversary target.

**Reversal cost.** One sentence.

### Left for this link's panel (rule after it reports)

- The failed-own-fleets-read rule **for the command and the quote** (analysis
  Q3). The predecessor ruled it for the notice (its RULING 5: a failed read
  changes nothing) and recorded that the opposite lean, "fails toward a capped
  command", is this link's to weigh. The chain doc's Taught record requires the
  rule stated per consumer.
- The committed statement's copy (analysis Q9) — UX.

---

## Rulings made after the panel reported (architect, UX, security — 2026-10-04)

Reports: `docs/handoffs/clear-burn-preview-on-commit-panel-architect.md`,
`-panel-ux.md`, `-panel-security.md`; dispositions per finding in
`docs/handoffs/clear-burn-preview-on-commit-panel-consolidated.md`.

### FULL-AUTO RULING 8 — a failed own-fleets read changes nothing for the quote and the burn command either: the committed selection holds until a read answers

**Question.** Analysis r2 Q1 — the failed-read rule for this link's two
consumers.

**Ruling.** Option (b), as the working text has it, stated per consumer: the
notice stays (predecessor's RULING 5), the quote stays withheld with no
no-quote, stale or preview-retry state, and Burn stays unavailable for that one
selection with the statement shown. The architect's wording fix is applied.
The cost is stated in design.md Risks: after an accepted cut whose refreshed
read fails, the statement stays until a read answers, with the fleets-error
retry on screen.

**Basis.** Precedence 3 — the panel, unanimous (architect § on r2 Q1; UX
recommendation 3; analyst r2). The old lean toward ending the gap assumed the
alternative to a capped command was an uncapped one; under RULING 5 it is no
command. The player is never stuck: the view's fleets-error retry shows, every
other target stays committable, cut drive and stop are unaffected.

**Alternatives rejected.** (a) end the gap for the command on a failed read —
flaps when the retry answers, gives one record two gaps, re-opens the duplicate
order, needs effect-written state to stay ended, +2 tasks.

**Reversal cost.** One term in one derivation, one scenario.

### FULL-AUTO RULING 9 — RULING 6 stands and is no longer provisional; Double-Submit is MODIFIED with no new scenario; the predecessor's notice clause is a recorded reading; the handler keeps `undefined` when the own-fleets query has no state

**Question.** Analysis r2 Q3, Q4, Q5 and provisional RULING 6.

**Ruling.** As the heading. No delta on "Burn Command Targets…", on the three
conditions the architect names (its A1, A2, A9). No production change for the
no-query-state case; the mocked-harness trap is recorded in tasks 6.2 and 7.1.

**Basis.** Precedence 3 — architect (technical shape), report §§ on each
question; the writer and analyst concur.

**Alternatives rejected.** A fourth MODIFIED block with a carve-out (would have
to list every exception — the fenced follow-up's scope); a 25-scenario MODIFIED
of the predecessor's requirement; storing `null` for no query state (a false
green of the drift this link closes in mocked harnesses).

**Reversal cost.** One MODIFIED block each.

### FULL-AUTO RULING 10 — the committed statement is UX's two-sentence copy, one string for every selection kind, immediately before the Burn control, and is the control's accessible description while shown

**Question.** Analysis r2 Q2, Q7; UX F1, F2, F4, F5; architect A9.

**Ruling.** Copy: "A burn order is committed to this target, so Burn is
unavailable for it. Select another target to change course." The spec pins the
intent (states the commitment, the reason the command is unavailable, and the
exit; no figure, countdown, id or wire text); the string is recorded in
design.md at kickoff. Placement immediately before Burn; the stranding notice
and drift notice stay below as built. `aria-describedby` from the control to
the statement while shown; native `disabled` kept. Not a live region. Shown
while the canvas is unavailable. Names per architect A9.

**Basis.** Precedence 3 — UX wins on user-observable behaviour over the
architect's shorter default; F1's evidence is the collision with the stranding
notice's fixed copy ("Place a different order to change it") under a disabled
Burn.

**Alternatives rejected.** The architect's one-sentence default (no reason, no
exit). A target name or countdown (a figure; `figure-formatting` delta).

**Reversal cost.** One string constant.

### FULL-AUTO RULING 11 — focus at the acceptance is specified as an outcome with its own scenario, verified by a keyboard leg in the journey; no tier-1 task

**Question.** UX F3.

**Ruling.** The "Focus" paragraph and its scenario both land. tasks.md marks
the scenario covered by the journey's keyboard leg in task 7.3. If that leg
goes red at the gate the fallback UX names (`aria-disabled` for this state
only) is a finding for the one batched revision round, not a pre-decision.

**Basis.** Precedence 3 — UX. The chain doc's 2a-ii Taught record ("a clause
the live spec states in one sentence with no scenario … is an unspecified
feature") is why the scenario heading is kept rather than dropped.

**Alternatives rejected.** Paragraph without a scenario (UX's fallback if the
count could not grow — it need not, the scenario adds no task).

**Reversal cost.** One paragraph, one scenario.

### FULL-AUTO RULING 12 — the change stands at 40 tasks: architect A4 removes the duplicate arrangement, and the seven re-arranged predecessor tests are two tasks

**Question.** Architect A12: 41 by the predecessor's unit unless A4 is applied;
46 if each re-arranged test were a task.

**Ruling.** A4 is applied (40). The repairs are two tasks: one arrangement
change applied to four "second Burn" tests, one to three "quote state" tests.
Shedding room is two tasks (3.16, then 3.9), to filed follow-ups outside the
chain; no split.

**Basis.** Precedence 1/2 — the predecessor's RULING 12
(`docs/handoffs/surface-commit-stranding-warning-rulings-index.md`: the task
unit is the test arrangement group; rows of one parametrised arrangement are
one task). Architect and analyst both reject every seam as not worth a link.

**Alternatives rejected.** Counting seven repair tasks (46, forcing a split
with no clean seam). Declining A4 (41).

**Reversal cost.** None; counting.

---

## Rulings made on adversary round 1 (2026-10-04)

Report and per-finding dispositions:
`docs/handoffs/clear-burn-preview-on-commit-adversary-r1.md` (0 BLOCKER,
2 MAJOR, 6 MINOR; NOT CLEAR).

### FULL-AUTO RULING 13 — the count of 40 stands, but on the architect's stated position, not on the predecessor's unit: the seven re-arranged predecessor tests are two tasks because each group is one mechanical re-arrangement, and RULING 12's citation is corrected

**Question.** Adversary m5: RULING 12 cites the predecessor's RULING 12 as its
basis; the architect's report says the repairs are the one place the number is
not that unit (46 counted per test).

**Ruling.** RULING 12's outcome stands; its basis is replaced. The repair tasks
are counted as two because each is one edit pattern applied across tests whose
scenarios and assertions do not change (a different second target; a different
selection for the quote-state assertion) — repair work, not arrangement groups
of new scenarios. Counted strictly in the predecessor's unit the change is 45;
that number is recorded here and in the report rather than hidden. Tasks 3.15,
3.17 and 3.18 are guards expected green before implementation and are marked
so. No split: the analyst and the architect each examined every seam and found
none worth a link, and the cap's purpose (bounding what every review round
re-reads) is served — the delta is one ADDED requirement and three MODIFIED
blocks whose bodies are carried byte-identical.

**Basis.** Precedence 3 — architect A12 and its count section
(`docs/handoffs/clear-burn-preview-on-commit-panel-architect.md`), analyst r2
§ on the split (`…-analysis-r2.md`). The workflow skill's cap is "links are
sized to 20–40 tasks", with the split at "its pre-identified seam (or the
architect's)" — the architect names none.

**Alternatives rejected.** Counting 45 and splitting — both halves of every
candidate seam ship either the named clause false or UX F2's hazard (analysis
r2). Shedding five scenarios to follow-ups — would ship built behaviour
unspecified.

**Reversal cost.** None; counting. Travis may read this as a cap breach by
five; it is stated in the final report.

### FULL-AUTO RULING 14 — all eight round-1 adversary findings are accepted and repaired in text with no new task

**Question.** Round 1: M1, M2, m1–m6.

**Ruling.** Each is confirmed against the delta and the code and accepted as
the adversary's repair states (dispositions in the round file). M2's two
exact-payload assertions are edits inside task 2.2.

**Basis.** Precedence 3 (the adversary's findings, each verified) and the chain
doc's 2a-iii Taught record: "Every 'whether or not', 'both' and 'exactly once'
needs a row a one-sided build fails" — M1, m1, m2 and m4 are that rule again.

**Alternatives rejected.** Declining the MINORs to save a round — round 2 is
needed for the MAJORs regardless.

**Reversal cost.** Clauses.

---

## Ruling made on adversary round 2 — clearance (2026-10-04)

### FULL-AUTO RULING 15 — Phase 1 closes CLEAR at round 2: the four wording residues are repaired exactly as the adversary stated, inside the verdict commit, without a third round

**Question.** Round 2 (`docs/handoffs/clear-burn-preview-on-commit-adversary-r2.md`):
0 BLOCKER, 0 MAJOR, 4 MINOR (n1–n4), verdict CLEAR with residue "repairable
exactly as the report states it … no further adversary round needed if applied
verbatim". Apply and proceed, or spend round 3?

**Ruling.** Apply n1–n4 verbatim and proceed. The verdict commit is the commit
that contains those repairs; the orchestrator checks the applied text against
the report's repair text before committing.

**Basis.** Precedence 2 — workflow skill, "Adversary rounds converge to residue
only: convergence, not another full attack: verify residue"; the gate is
"adversary 'no material findings'". Chain precedent: the predecessor's RULING
14 (`docs/handoffs/surface-commit-stranding-warning-rulings-index.md`).

**Alternatives rejected.** A third round on four wording fixes — spends the
last round of the cap, which mid-build spot-checks may need.

**Reversal cost.** None.

---

## Ruling made at implementation kickoff (2026-10-04)

### FULL-AUTO RULING 16 — the architect's nine reported problems and seven design.md precision points are settled in the impl contract; no file under the change folder is edited, so the verdict at `29f0a6b` stays current

**Question.** The kickoff contract
(`docs/handoffs/clear-burn-preview-on-commit-impl-contract.md` §§ 12, 13)
reports nine places the spec or tasks cannot be done exactly as written and
seven precision points on design.md. Edit the change (expiring the verdict), or
settle them in the contract?

**Ruling.** Settle in the contract; it governs the SDET and the developer where
it is more precise than tasks.md or design.md. Specifically: task 4.2's stale
row is a re-ordering inside its test, not an insertion (still one task; RULING
13's count is unchanged and its "mechanical" description is corrected here);
task 3.14 row two uses the per-fleet request count, the alternative its own
parenthetical allows; the three guards (3.15, 3.17, 3.18) stay `already-green`
and the SDET must show each red against a named wrong build in a scratch
worktree; task 3.8 builds its own reference phase; scenario 12 is asserted
under both readings; scenario 21 and the real-wire instants equality are
`Playwright, deferred`. None of the nine makes a scenario false or
unobservable; if the red phase finds one that is, that is a spec conflict
routed to the writer and a round-3 spot-check of the revised clause.
`commit-stranding-notice-journey.spec.ts:210` is watched at the gate and not
edited to pass.

**Basis.** Precedence 2/3 — the handoffs README defines the impl contract as
"everything the spec deliberately leaves open, settled"; chain precedent is the
predecessor's RULING 15
(`docs/handoffs/surface-commit-stranding-warning-rulings-index.md`); architect
owns technical shape.

**Alternatives rejected.** Editing tasks.md/design.md for precision — expires
the verdict and spends the last adversary round on wording.

**Reversal cost.** None.

---

## Ruling made at the archive gate, first run (2026-10-04)

### FULL-AUTO RULING 17 — the gate's first run is red and incomplete: tier 4's one red is this change's own journey failing a fixture precondition the e2e stack cannot meet, and tier 3 was voided by two delegates' overlapping runs; both go into the one batched revision round, and the gate — tier 4 then tier 3 — gets its single rerun

**Question.** Record: `docs/handoffs/clear-burn-preview-on-commit-journey.md`.
Tier 4: 26 passed, 1 failed, 6.8 min — `committed-selection-journey.spec.ts`
at its step 0: the longest flight in the spawn home is 4359 wall ms at world
scale 5 against the 50 000 ms the spec demanded; all six candidates within 15 %
of each other, so not a spawn draw. Every leg after step 0 is UNTESTED. Tier 3:
the SDET delegate that started tier 4 handed back without a report, was treated
as abandoned and replaced; it then resumed and both delegates ran
`test:backend:all` against one emulator project for 13:55:21–14:11:31. Six reds
(`POST /v1/corporations` 500, `no live galaxy`, 13:55:25–27) fall seconds after
the second run's start, consistent with the root `TestMain` wipe; none matches
a filed signature. What now?

**Ruling.**
1. Tier 4's red is a real red on this change's own journey, diagnosed
   **test-side** (a fixture precondition no spawn can meet), not residue and
   not a product finding — the journey never reached product behaviour.
2. Tier 3's run is **void** (an orchestration fault of this run, recorded as
   such): it is neither green nor attributable red, and nothing is appended to
   any defect file.
3. One batched revision round, test-side only (no spec gap, no product defect,
   so no writer, no developer and no adversary spot-check): the SDET rewrites
   the journey's legs to fit the flights the stack can arrange — the target is
   the longest flight among every selectable target, the legs scale to it, and
   a leg the flight cannot contain is logged UNTESTED at tier 4, never passed
   vacuously. Task 7.3's "no preview POST across two preview intervals" is
   performed only if a flight is long enough; otherwise it stands on tier 1
   (view tests 3.1 at 20 s and 3.4 at 61 s of fake time) and is recorded
   untested on the real stack. tasks.md is not edited; the verdict stays
   current.
4. Then the gate's single rerun: tier 4, then tier 3, once each, serialised,
   started by the orchestrator itself in the background with distinct logs —
   only after every process of the voided runs has exited and the one-minute
   load is under 4. No delegate starts a tier.
5. If the rerun's tier 4 is red on this change's journey or scenarios, or
   either tier cannot be evaluated, the run stops and reports; nothing is
   archived.

**Basis.** Precedence 2 — workflow skill, Gates: "tier 4 and tier 3 run once
each and green — or red once, one batched revision round, and green on the
single rerun"; failure playbook "Journey red: collect every finding from the
run — test-side misreadings and product defects alike — into one batched
revision round … then one rerun". `docs/testing-tiers.md`: per-edge coverage
lives in tier 1; "one emulator project, one suite at a time". Analysis r2 § 8
and old § 9 step 2 anticipated this exact precondition ("The window must fit
inside the flight at world scale 5; otherwise the leg is a fixture precondition
failure, not a finding"). Chain precedent for a tier-4-untested leg: the
predecessor's RULING 17.

**Alternatives rejected.** Treating tier 3's six reds as results — they are
overlap-attributable. Archiving on tier 4's 26 other passes — the red is this
change's own journey. Lowering the stack's world scale for this spec — a
stack-level knob (and one of the unspecced edits U1–U10), not a per-spec one.
A development run of the journey before the rerun — tier 4 is never a per-task
check.

**Reversal cost.** None.

---

## Ruling made at the archive gate, rerun not started (2026-10-04, 16:11 EDT)

### FULL-AUTO RULING 18 — the run stops here, not archived: the gate's single rerun could not be started, because a voided backend run this session spawned is still alive and may not be killed by this session

**Question.** After the batched revision round (RULING 17) the rerun was
queued to start once (a) every process of the voided tier 3 runs had exited and
(b) the one-minute load was under 4. Two waits of ~55 minutes each
(14:20–15:15, 15:16–16:11) gave up. The orphan — `npm run test:backend:all`,
pid 24831 (go test pid 24865), started 13:55:21 by an SDET delegate — was still
alive at 16:11, 2 h 16 m in, its emulators gone since 14:11:31; the suite's
90-minute `-timeout` is per test binary under `-p 1`, so it has no near end.
Load crossed under 4 only at isolated polls (3.17 at 15:55, 3.47 at 16:10) and
was 16–17 at 15:15. The orchestrator's attempt to stop the orphan by its exact
process ids at 13:55 was denied by the permission system and is not pursued by
any other route.

**Ruling.** Hard stop: the gate cannot be evaluated. Starting tier 4 or tier 3
while the orphan lives would hand it fresh emulators on the shared
`hexaverse-emulator` project and void the rerun the same way the first tier 3
was voided — and the rerun is the only one the rules allow. Nothing is
archived. The link stays `authored r2 29f0a6b`, built `62c8f15`, gate pending.
The revised journey spec is left uncommitted and unrun.

**To resume** (a fresh orchestrator, from
`docs/handoffs/clear-burn-preview-on-commit-journey.md` and this index):
confirm pid 24831 and its children are gone (Travis kills them, or they end);
confirm `git diff 29f0a6b -- openspec/specs/system-space-view
openspec/changes/clear-burn-preview-on-commit` shows only tasks.md checkboxes;
wait for a quiet machine; run tier 4 then tier 3 once each, started by the
orchestrator itself; then QA closes its two BLOCKED rows from the run,
reconcile, rehearse, archive.

**Basis.** The delegation's own stop rule ("stop and report — do not archive —
… on a gate that cannot be evaluated"); workflow skill, Gates ("a gate that
can't be evaluated halts the pipeline with a report — never waved through");
`docs/testing-tiers.md` ("one emulator project, one suite at a time").

**Alternatives rejected.** Running the rerun beside the orphan — voids it.
Archiving on tier 1 evidence plus the first run's 26 other tier-4 passes — the
one red was this change's own journey and tier 3 has no valid run. Waiting
indefinitely — the orphan has no bounded end.

**Reversal cost.** None; nothing was archived.

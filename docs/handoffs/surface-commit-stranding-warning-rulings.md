# `surface-commit-stranding-warning` — open questions and rulings

Link 2a-iii of the system-HUD chain (`docs/plans/system-hud/chain.md`), the
first half of the split made by `clear-burn-preview-on-commit` FULL-AUTO
RULING 3 (`docs/handoffs/clear-burn-preview-on-commit-rulings-index.md`). Run
under `/team … --full-auto`: every user gate is lifted; every open question is
ruled in-run by the precedence in
`harness/skills/openspec-team-workflow/SKILL.md` § "Full-auto chains":

1. the chain doc's / scoping doc's recorded lean,
2. a settled decision in root `CLAUDE.md` or `openspec/project.md`,
3. the panel's recommendation,
4. the most reversible option.

A ruling with a recorded basis is a decision; a choice without one is a guess,
and guesses are forbidden.

Design analysis (covers both halves of the split; this link is its § 1b, § 2,
the second ADDED requirement of § 4, mechanism M1's record of § 5, and Q3–Q6,
Q9): `docs/handoffs/clear-burn-preview-on-commit-analysis.md`, index
`clear-burn-preview-on-commit-analysis-index.md`.

---

## Rulings made at orchestration open (before authoring)

### FULL-AUTO RULING 1 — this change is the commit's stranding notice and the order record it lives on; the quote, the burn command's availability and every existing requirement's text are untouched

**Question.** What is in scope?

**Ruling.** In: `SpaceCommandPanel` reporting an accepted burn commit to the
mounting view; `SystemSpaceView` keeping, per fleet, a record of the order this
view committed; the determination "that order is still that fleet's running
burn, as the own-fleets read last reported", with its rule for the gap before
a read answers; a notice on the system space view, driven by the commit
response's `strandingWarning`, shown for that order's life; the view-level
tests that observe all of it over a real own-fleets read. One ADDED
requirement in `system-space-view`; no MODIFIED block unless the panel shows a
live sentence this makes false. Out: clearing or withholding the quote, the
burn command's availability, the uncapped label (all link 2a-iii-b); the stop
command's stranding warning (RULING 3); `followup-explain-withheld-burn-command.md`;
the gauge overlay; any backend field, endpoint or query; the galaxy view;
palette or type changes; client-side affordability or shortfall arithmetic;
U1–U10 of `add-vitals-strip-qa-reverify.md`, neither reverted, retro-specced
nor built on.

**Basis.** Precedence 1 — `clear-burn-preview-on-commit` RULINGs 1 and 3; chain
doc "What every link must not do".

**Alternatives rejected.** Carrying the selection key in the record now for the
second half's use — a field with no consumer in this change, the "built and
never called" species of the handoffs README.

**Reversal cost.** None; scope statement.

### FULL-AUTO RULING 2 — the order's identity is the commit response's own burn instants compared for equality against the own-fleets read; no action id, no added read, no target comparison — PROVISIONAL on mechanism until the architect reports

**Question.** What identifies "the order this view committed" (analysis Q1,
§ 5 mechanisms M0–M4)?

**Ruling.** The served `state.Burn.DepartMs` and `state.Burn.ArriveMs` of the
commit response, held per fleet, compared for equality with the same two
integers on the own-fleets read (M1). For this change the question has only
one answer the wire allows: `strandingWarning` is carried by the commit
response alone and never by a read (analysis § 1b), so a notice tied to an
order's life needs a record made from that response. Whether a burn the view
did *not* commit should read as "committed" (analysis N1) is a question about
the quote and the burn command; it belongs to link 2a-iii-b and is not ruled
here.

**Basis.** Precedence 1 — the design input the chain doc names for this link,
adversary B1: the committed state "must end when the order it names is no
longer the acting fleet's running order, as observable from the served fleet
read". Chain doc "What every link must not do" excludes M4's added read's only
alternative source of an id (a new served field).

**Alternatives rejected.** M0, the stored pair — the BLOCKER this link exists to
repair. M2, target match — cannot carry the warning, and a point target's
equality across the round trip is unverified. M3, writing the response into
the own-fleets cache — edits a hook the galaxy view shares and changes when
three other surfaces flip. M4, the action inbox — adds a read to the view and
the commit response carries no id to match.

**Reversal cost.** One derivation in one file; no stored data.

### FULL-AUTO RULING 3 — the stop command's stranding warning is filed, not built here, and the chain row says the `fleet-roster` drift is closed for the burn command only

**Question.** The analyst found (§ 1b correction 2) that a stop's response
carries the same warning and is equally unrendered on both views. In this link
(analysis Q6)?

**Ruling.** No. Filed as `docs/handoffs/drift-stop-stranding-warning-not-rendered.md`;
`drift-commit-stranding-warning-not-rendered.md` is corrected to say what this
link closes.

**Basis.** Precedence 1 — the chain doc's row delivers "the commit's stranding
warning surfaced" for the burn commit, and forbids galaxy-view work, where half
of the stop drift lives. Precedence 4 otherwise: filing is free to reverse.

**Alternatives rejected.** Building the system-view half — edits
`FleetActionsPanel` and its 917-line test file for a partial fix that still
leaves the requirement false on the galaxy view.

**Reversal cost.** None.

### FULL-AUTO RULING 4 — the two defects the figure sweep found (no served actual delta-v; a point burn's empty-string body id) are filed with their evidence and neither fixed nor built on

**Question.** Analysis § 6 findings 1 and 2: by code reading, the commit
response carries no `DeltaV`, so the drift notice would render after every real
commit and a live scenario is false in production; and a point-target burn
serves `Target.BodyId: ""` where the client type and `roster-status.ts` expect
`null`.

**Ruling.** Filed as `docs/handoffs/drift-commit-response-carries-no-delta-v.md`
and `docs/handoffs/defect-point-burn-serves-empty-bodyid.md`, both marked
*by code reading, not verified on a running stack*. This change renders no
figure from either and does not depend on either. The first cannot be made
true inside this chain's no-backend fence and is Travis's to route.

**Basis.** Precedence 2 — workflow skill § Spec-first invariant: adjacent
defects are reported, not fixed in passing; drift is adjudicated, never
silently patched.

**Alternatives rejected.** Fixing the `DeltaV` read here — needs a served field
or a client mirror of a `backend/space` rule, both forbidden by the chain doc.

**Reversal cost.** None.

## Left open for this link's own panel (no recorded lean; rule after the panel reports)

- **Analysis Q3** — the first own-fleets read after the commit fails. The
  same-capability scan precedent ends the pending presentation; but for a
  *warning*, ending means removing it. UX and architect to recommend.
- **Analysis Q4** — whether the order's end is read-only or also the projected
  clock passing `ArriveMs`. Architect.
- **Analysis Q5, Q9** — the notice's form, placement, whether it follows the
  selection, announcement, and copy (which must name stations *and* lane
  gates). UX.

---

## Rulings made after the panel reported (architect, UX, security — 2026-10-04)

Panel reports: `surface-commit-stranding-warning-panel-architect.md` (0 blocker,
5 major, 9 minor), `-panel-ux.md` (0 blocker, 2 major, 4 minor),
`-panel-security.md` (clear, no surface). Dispositions of every finding:
`surface-commit-stranding-warning-panel-consolidated.md`.

### FULL-AUTO RULING 5 — a failed own-fleets read changes nothing: the gap continues and the notice stays until a read answers

**Question.** Analysis Q3 — the first read after the acceptance fails (and, by
the same rule, a read that fails later).

**Ruling.** A read that fails neither ends the gap nor judges the order; only a
read that answers does. The notice stays, beside the view's existing
fleets-error notice and its retry. The working text ("the gap ends at that
failure … the notice is removed", and its return on a later read) is replaced.

**Basis.** Precedence 3 — the panel, unanimous: UX F1 and architect A2. The
analyst's opposite recommendation rested on "fails toward a capped command",
which is a property of the quote and the burn command — link 2a-iii-b's — and
is backwards for a warning. The scan precedent it cited exists to keep a
committed sweep reportable behind a presentation that hides its retry; this
notice hides nothing.

**Alternatives rejected.** Remove on failure and return on a later answer — a
warning that vanishes on stale data and flaps. Remove and stay removed — needs
state written from an effect (architect A2).

**Reversal cost.** One term in one derivation (`errorUpdateCount`), one
scenario.

### FULL-AUTO RULING 6 — the order's end is known by reads alone; the projected clock passing the arrival instant ends nothing

**Question.** Analysis Q4.

**Ruling.** Read-only, as authored.

**Basis.** Precedence 3 — architect (panel report, "Recommendations"): a clock
term buys under a second on the ordinary path, and in the degraded-settle case
would remove the notice while the server still serves the burn and before any
read can carry the roster's `stranded` indication; it would also add a
served-instant flip to a view whose live requirement budgets those. UX checked
the clause and found it adequate.

**Alternatives rejected.** A clock term.

**Reversal cost.** One term.

### FULL-AUTO RULING 7 — RULING 2 stands on identity and is no longer provisional; the gap is measured by the own-fleets read's answer count, never by timestamps

**Question.** Does the mechanism of RULING 2 hold (architect A1)?

**Ruling.** Identity by equality of the two served burn instants: confirmed.
The gap is not a marker compared with `dataUpdatedAt`: at acceptance the view
records whether an own-fleets read is in flight and that read's answer count;
the gap is open while that count is unchanged (design Decisions 2, 5, 6). No
edit to `use-fleets.ts`. The spec states the behaviour (reads requested at or
after the acceptance), not the instrument.

**Basis.** Precedence 3 — architect A1, measured against the installed
`@tanstack/query-core`: timestamps tie under fake timers and in the same
millisecond; a pre-acceptance read is cancelled by `useOrder`'s own
invalidation before the panel's callback runs.

**Alternatives rejected.** The scan's `marker > dataUpdatedAt` — cannot go
green for an honest implementation in this test family.

**Reversal cost.** None outside one file.

### FULL-AUTO RULING 8 — the warning is an inline, non-dismissible notice below the Burn control in the command panel, shown for the acting fleet whatever is selected, plus one advisory toast at the acceptance; the view's announcer is untouched

**Question.** Analysis Q5 — form, placement, selection, announcement,
dismissibility.

**Ruling.** (i) An inline notice rendered by `SpaceCommandPanel` below the Burn
control, in the panel's existing amber line treatment, from one boolean the
view passes; no live-region role; not dismissible. (ii) It belongs to the fleet
that committed and is shown while that fleet is acting, whatever is selected.
(iii) The warning is conveyed once, at the acceptance, by one advisory
(`toast.warning`, not error) toast in addition to the success feedback, fired
whichever fleet is acting when the response lands; nothing later — removal,
return on a switch back, a read refresh — raises a toast or changes the view's
live-region text. (iv) The preview's own stranding line is unchanged and is a
separate element.

**Basis.** Precedence 3 — UX F2 and F3 (UX prevails on user-observable
behaviour) and architect A13 on where the element lives (architect prevails on
technical shape); the two agree. Live `fleet-roster` already requires "a
visible, non-blocking notice distinct from an error toast" and that success
feedback is not suppressed. The existing `toast.warning` and amber line are
used, so the chain doc's no-palette fence holds.

**Alternatives rejected.** Inline only — a screen-reader user hears the burn
succeeded and nothing about the stranding, and a player who switched fleets
before the response sees nothing (UX F2). Toast only — gone in seconds; the
chain doc asks for a warning that stays on screen. `role="status"` on the
inline notice — silent in the switched-fleet case and re-announces on return.
A dismiss control — a state the spec does not model.

**Reversal cost.** One element and one toast call.

### FULL-AUTO RULING 9 — the copy is fixed: the two strings UX proposed, naming stations and lane gates, with no figure and without the word "stranded"

**Question.** Analysis Q9.

**Ruling.** Inline: `Your current course leaves this fleet unable to reach any
station or lane gate. Place a different order to change it.` Toast: `This
course leaves the fleet unable to reach a station or lane gate.` The spec pins
the properties (names both, no digit, no "strand", constant whatever the
response and read contain), and the strings live in design.md, not the delta.

**Basis.** Precedence 3 — UX Q9/F6. The served condition names stations and
lane-gate bodies (`fleet-movement`); "stranded" is the roster's and the strip's
word for a fleet that already is.

**Alternatives rejected.** Reusing the preview line's copy — omits lane gates
and is conditional about a quote.

**Reversal cost.** Two constants.

### FULL-AUTO RULING 10 — a warned response lacking either burn instant shows the notice for the gap only

**Question.** Writer's note 4 (architect A4, UX F5).

**Ruling.** Shown until the first own-fleets read requested at or after the
acceptance answers, and removed then, whatever that read reports.

**Basis.** Precedence 3 — architect A4 and UX F5 agree. "No notice" would
discard a warning the server sent, which live `fleet-roster` forbids; it costs
no code, since unmatched instants match no read.

**Alternatives rejected.** No notice; a notice with no end.

**Reversal cost.** None.

### FULL-AUTO RULING 11 — the change is authored at the cap of 40 tasks without bundling: UX F4 is declined as unobservable, and the two failed-read cases are one scenario walked in sequence

**Question.** The architect's honest count with its own fixes is 39 (A8). UX's
accepted findings add scenarios. The cap is 40.

**Ruling.** (i) UX F4 (an answered read with no entry for the fleet) is
declined: the notice is shown only while its fleet is acting, the acting fleet
is chosen from that same read, and a fleet absent from the read cannot be
acting — the state has no observable on this view. (ii) UX F1's companion (a
read failing after the order was seen running) is the same rule as RULING 5 and
is specified as one scenario walked in sequence — fail, answer with the burn,
fail again, answer without it — one arrangement, one task. (iii) UX F3's
"not dismissible, placed with the Burn control, does not displace it" are
properties of the notice element and join the scenario that states what that
element is (architect's task 1.5), not a scenario of their own. (iv) UX F2 adds
one scenario and one task (the toast, once, at the acceptance); its
switched-fleet and no-later-announcement clauses join the existing scenarios
that already arrange those states. The writer reports the honest count; if it
exceeds 40 the writer stops and says so rather than bundling, and the seam is
then the advisory toast (RULING 8 iii), which would leave as a filed follow-up.

**Basis.** Precedence 2 — workflow skill § Chains (links sized 20–40; splits
fire past 40) and the predecessor's adversary m5 (a checkbox may not hide
several unrelated closing assertions). One scenario → one task is kept.

**Alternatives rejected.** Bundling to 40. A third split of a one-requirement
change before knowing the count.

**Reversal cost.** None.

### FULL-AUTO RULING 12 — the task unit is the test arrangement group, so three scenario pairs that are rows of one parametrised arrangement are one task each and the change stands at 40; RULING 11's "one scenario → one task" is corrected

**Question.** The writer applied RULING 11's last sentence literally and
stopped at 43 tasks, as instructed: the architect's 39 plus the toast task is
40 only if three scenario pairs each share a parametrised task (arrival at a
body / at a point; a different order placed elsewhere / a settle inside the
commit round trip; the switch back / the late response).

**Ruling.** The unit is the one the analysis used and the writer's brief
stated: one task per test arrangement group. A task may name two scenarios only
when they are rows of one parametrised arrangement over the same harness state
with the same closing assertion, and it names both. The three pairs are merged
back on that test; everything the architect split under A8 (unrelated
assertions under one checkbox) stays split. The count is 40. Stated plainly so
nobody reads the number as headroom: counted one-per-scenario the change is 43,
there is no slack, and any task the adversary's repairs add takes the change
past the cap — at which point the advisory toast (RULING 8 iii, one scenario,
one task, its clauses in three others) leaves as a filed follow-up, and if that
is not enough the no-instants case (RULING 10) follows it.

**Basis.** Precedence 3 — architect A8, which drew exactly this line: 3.14 and
3.3 bundled "scenarios with unrelated assertions" and were split, while the
parametrised arrangements "are fairly one task each" (architect prevails on
technical shape). The predecessor adversary's m5 objected to one checkbox
hiding several closing assertions, which a parametrised row set does not.
RULING 11's stricter sentence had no basis beyond m5 and went past it.

**Alternatives rejected.** (a) Split at the toast now — 42, still over, and a
three-task follow-up change costs a full pipeline and two gate runs to deliver
one toast call. (b) Split off the toast and the no-instants case together — a
40-task change and a five-task change, same objection, and it separates a
warning from its only assistive-technology announcement (UX F2, MAJOR). (c)
Keep 43 and waive the cap — the cap is not this run's to waive.

**Reversal cost.** Three task lines.

---

## Ruling made on adversary round 1 (2026-10-04)

Round 1: 0 BLOCKER, 3 MAJOR, 6 MINOR, NOT CLEAR
(`surface-commit-stranding-warning-adversary-r1.md`, dispositions in its
"Orchestrator rulings" table). All nine confirmed and accepted.

### FULL-AUTO RULING 13 — the warned-response-without-both-instants case leaves the change as a filed follow-up, which returns the count to 40 after round 1's two added tasks; the advisory toast stays, revising the order RULING 12 named

**Question.** Adversary M1 (a second warned commit by the same fleet has no
scenario) and M3 (task 3.8 is two arrangements) are both right and each adds
one task: 42. RULING 12 said that past the cap the advisory toast leaves first
and the no-instants case second.

**Ruling.** The no-instants case leaves, alone: RULING 10's sentence, its
scenario and its two tasks (the panel test of null instants, the view test of
the gap-only notice) come out of the change and are filed as
`docs/handoffs/followup-warned-commit-without-burn-instants.md`. 42 − 2 = 40.
The delta says nothing about such a response; design.md says so in one line and
points at the follow-up. The advisory toast stays. RULING 10 is withdrawn from
this change and carried by the follow-up; RULING 12's ordering is revised here.

**Basis.** Precedence 2 — workflow skill § Chains: a link past 40 sheds at a
seam, never by bundling (the adversary's M3 says so in terms). Which piece is
the seam is then precedence 3 and 4. Removing the toast first, as RULING 12
named, reaches only 41, so both pieces would go; removing the no-instants case
alone reaches 40. Of the two, the toast is the panel's MAJOR (UX F2: without it
an assistive-technology user is told the burn succeeded and never that it
strands the fleet), while the no-instants case is defensive against a response
the backend does not produce (`backend/fleet/service.go` sets the burn on every
accepted order; architect A4: "the backend always serves a burn on an accepted
commit, so this is defensive"), and by the architect's own account costs no
code — unmatched instants match no read. It is the more reversible omission.

**Alternatives rejected.** (a) Drop the toast and the no-instants case — 39,
one task of headroom, at the price of the panel's MAJOR. (b) Re-bundle 3.8 —
the adversary's M3 and RULING 12's own test forbid it. (c) Decline M1 — it is
the likeliest real path (warned, re-target, warned again) and two wrong
implementations pass without it.

**Reversal cost.** One follow-up change of two tests and one sentence.

**Standing consequence, stated again.** The change is at 40 with no slack and
two adversary rounds left. A further added task sends the advisory toast out as
a second filed follow-up (RULING 12).

---

## Ruling made on adversary round 2 — clearance (2026-10-04)

### FULL-AUTO RULING 14 — Phase 1 closes CLEAR at round 2: the two design.md wording residues are repaired exactly as the adversary stated, inside the verdict commit, without a third round

**Question.** Round 2 returned CLEAR with two MINORs (n1, n2), both wording in
design.md, neither touching the delta, the tasks or the count
(`surface-commit-stranding-warning-adversary-r2.md`). Repair and re-attack, or
repair and commit?

**Ruling.** Repair and commit. The writer makes the two edits the adversary
described and nothing else; the commit that contains them is the verdict
commit. Rounds used: 2 of 3; the third is kept for a mid-build spot-check
should one be forced.

**Basis.** Precedence 2 — workflow skill § Repair-loop convergence: residue
confined to the previous round's repairs is a convergence signal, not a reason
for another attack; the adversary states both "can be corrected without
reopening the delta or the task count". Precedent: `lift-burn-preview-to-view`
RULING 18.

**Alternatives rejected.** A third round on two sentences of design.md — spends
the change's last round on non-normative text.

**Reversal cost.** None.

---

## Ruling made at implementation kickoff (2026-10-04)

### FULL-AUTO RULING 15 — the architect's three design.md corrections are settled in the impl contract and design.md is left as cleared, so the verdict stays current; task 3.7 is arranged with the confirming read first

**Question.** At kickoff the architect found three points where design.md is
imprecise (a field typed `number | null` that Decision 2 says can hold
`undefined`; the harness turning off query retry but not mutation retry; no
margin named for the notice) and one task (3.7 row one) that, read literally,
duplicates 3.9. Edit the change folder, or settle them in the contract?

**Ruling.** Settle them in `surface-commit-stranding-warning-impl-contract.md`,
which the architect has done; design.md, the delta, tasks.md and proposal.md
are not edited. None of the three changes a requirement, scenario or task; the
contract is the file whose job is "everything the spec deliberately leaves
open". Task 3.7 is arranged as the contract has it — a confirming read, then
the arrival on the following read — which fits its wording and scenario and
keeps it distinct from 3.9. Where the contract and design.md differ on these
three points, the contract is current.

**Basis.** Precedence 2 — handoffs README (the impl contract's role; "verdict
expiry is a diff") and the predecessor's RULING 19, which accepted kickoff
edits to design.md as un-attacked residue; leaving the folder untouched is the
stricter of the two courses and keeps `git diff af747be` empty.

**Alternatives rejected.** Editing design.md now — expires the verdict by diff
for three non-normative clarifications and would spend the last adversary
round on them.

**Reversal cost.** None.

---

## Ruling made at verification (2026-10-04)

### FULL-AUTO RULING 16 — QA's two unasserted clauses are closed by the SDET strengthening two existing tests, logged, with the manifest re-recorded; no spec text changes and the verdict is SHIP-PENDING-JOURNEY

**Question.** QA returned 36 PASS, 0 FAIL, with two clauses established only by
inspection (`surface-commit-stranding-warning-qa.md`): the burn control's
`disabled` state is not asserted to be unchanged by the notice, and the
"adds no announcement of its own" clause is tested on the cut-drive removal
only, not on the arrival landing that the same clause names in parentheses.
QA lists both as spec gaps.

**Ruling.** Neither is a gap in the spec text: the requirement already says the
notice's appearing or removal does not "remove, disable or re-order" the burn
control and that "a landed arrival read that removes the notice still announces
its landing". They are assertions the tests omit. The SDET — and only the SDET
— adds one assertion to each of two existing tests (the panel test of the
notice element: the burn control's disabled state is the same with and without
the notice; the arrival-at-a-body row: the announcer carries exactly the
landed-resolution text when the notice is removed), logs the revision with this
cause in the coverage table, shows each new assertion able to fail, and
re-records the red manifest. No production code changes; if either assertion is
red against the shipped code, that is a product finding and goes to the
developer in the one batched round.

**Basis.** Precedence 2 — workflow skill, failure playbook ("a written test
changes only via the SDET, and only for a spec change or an adjudicated test
defect") and handoffs README Lesson two (a green test that cannot observe the
failure is not coverage). A test that omits a THEN its scenario's requirement
states is an adjudicated test defect.

**Alternatives rejected.** Routing to the writer for new scenarios — the text
already states both; editing the delta would expire the verdict and take the
change to 42 tasks. Leaving them inspected — two SHALLs with no observer.

**Reversal cost.** Two assertions.

### FULL-AUTO RULING 17 — the journey's stranding leg is recorded UNTESTED at tier 4, as the cleared task 6.3 provides; three QA sub-clauses stay closed at tier 1 on a mocked wire only

**Question.** The SDET found no deterministic way to arrange a stranding commit
on the e2e stack with what exists: the warning depends on fuel left after the
debit against the random system's geometry, play can only lower fuel by
burning, a "burn until one strands" loop is unbounded, a skip-if-none loop
passes vacuously, and an API arrangement needs a fuel-setting seed route this
chain may not add. Write a leg anyway, add tooling, or record it untested?

**Ruling.** Record it untested, never passing. The journey closes QA's
BLOCKED item 1 (the real wire omits the field on a non-stranding commit; no
notice, no warning toast, the success toast once; the command surface after a
cut drive) and item 3 (the update-depth check). QA's item 2 sub-clauses — the
served read's instants equal the commit response's, removal on cut drive
against real reads, and the reload leg with the roster's stranded indication —
are closed by `SystemSpaceView.stranding-notice.test.tsx` over a real own-fleets
hook and a mocked service, and by nothing against a real backend. That residual
risk is stated in the journey record and the report, and filed:
`docs/handoffs/followup-stranding-notice-untested-on-real-wire.md`.

**Basis.** Precedence 1 — the adversary-cleared task 6.3: "the stranding leg …
runs only if a fixture can arrange a stranding commit, otherwise it is recorded
untested and never as passing". Chain doc "What every link must not do" (no
backend field, endpoint or query) excludes the seed route; the chain doc's
Taught record for 2a names the random-spawn fixture as the suite's most
frequent false red.

**Alternatives rejected.** A probabilistic leg — vacuous or flaky. A seed route
— out of the chain's fences and unspecced production code.

**Reversal cost.** One journey leg once a deterministic fuel fixture exists.

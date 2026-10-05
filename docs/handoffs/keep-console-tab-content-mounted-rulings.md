# `keep-console-tab-content-mounted` — open questions and rulings

Link 2b-i-b of the system-HUD chain (`docs/plans/system-hud/chain.md`), handed to
the full-auto orchestrator on 2026-10-05 at `3f83cf9` (predecessor
`add-console-dock` archived at `c0b4aad`). Every user gate is lifted; every open
question is ruled in-run by the precedence in
`harness/skills/openspec-team-workflow/SKILL.md` § "Full-auto chains":

1. the chain doc's / scoping doc's recorded lean,
2. a settled decision in root `CLAUDE.md` or `openspec/project.md`,
3. the panel's recommendation (this link's, or the predecessor panel's finding
   routed here),
4. the most reversible option.

A ruling with a recorded basis is a decision. A choice without one is a guess,
and guesses are forbidden.

Input: `docs/handoffs/keep-console-tab-content-mounted-analysis.md` (index:
`keep-console-tab-content-mounted-analysis-index.md`), whose § 8 lists Q1–Q12.
Rulings 2, 6, 8, 9 and 18 of `add-console-dock-rulings.md` (index:
`add-console-dock-rulings-index.md`) are inherited unchanged and are the basis
cited as "predecessor RULING n" below.

---

## Rulings made at orchestration open (before authoring), 2026-10-05

### FULL-AUTO RULING 1 — one change touching `system-console` only: four ADDED requirements and one MODIFIED (*The Log Tab Is the Sighting Log's Home on This View*); `sighting-log` and `system-space-view` take no delta

**Question.** What is the delta set (analysis § 1, § 2)?

**Ruling.** ADDED: *A Tab's Content Stays Mounted While It Is Not Shown*,
*Showing or Hiding the Log Tab Issues No Read*, *Escape Collapses the Expanded
Dock*, *Activating the Dock Changes No Space-View Selection* (the names the
chain doc already cites). MODIFIED: the Log-home requirement only, all ten live
scenario headings carried verbatim. The settle re-read closes
`drift-sighting-log-not-reread-after-sweep-settles.md` with a build task and
view-level tests over the real sightings hook, and no delta.

**Basis.** Tier 1: chain doc, link 2b-i-b *Delivers* and the 2b-i *Taught*
record ("MODIFY … whatever live sentence the move actually falsifies, nothing
else"); predecessor RULINGs 9 and 12.
**Alternatives rejected.** A `sighting-log` delta (no sentence is falsified;
the live scenario becomes true). A MODIFIED *The Dock Is Keyboard-Operable* —
see RULING 3.
**Reversal cost.** One delta file.

### FULL-AUTO RULING 2 — the mount latch is built, and the Log-home requirement is MODIFIED for it: the three "first load" headings keep their cold-cache bodies and the warm-cache case goes in new scenarios

**Question (Q1).** Latch plus a ten-heading MODIFIED block, keep today's gate,
or build the latch and state it only in ADDED text?

**Ruling.** Build the latch (the log's content mounts at the first render of
this mount of the view in which no interior read is in flight, and stays
mounted). MODIFY the gate sentence and scenario 1's GIVEN; never rename a live
heading; add the warm-cache scenarios.

**Basis.** Tier 1: chain doc, link 2b-i-b *Delivers* ("the mount latch with its
warm-cache arm"). Tier 3: predecessor architect A7.
**Alternatives rejected.** Today's `!interior.isLoading` gate (ships
`sighting-log` *A mount during an unsettled past-ETA sweep reads the pile after
the settling read* false on every return to a held system). ADDED-only text
(leaves live scenario *The expanded dock's Log panel holds the log* false in
the warm window).
**Reversal cost.** One expression and one block.

### FULL-AUTO RULING 3 — "focus outside the tab bar and the panel is not moved by a collapse" is stated in the ADDED Escape requirement, covering a collapse by any means; *The Dock Is Keyboard-Operable* is not modified

**Question (Q2).** Where does predecessor RULING 18's third clause live?

**Ruling.** In ADDED *Escape Collapses the Expanded Dock*, worded "by Escape or
by the collapse control". No MODIFIED block on the keyboard requirement.

**Basis.** Tier 1: chain doc 2b-i *Taught* (MODIFY only a falsified sentence);
no live sentence of the keyboard requirement is falsified (analysis § 2.3).
**Alternatives rejected.** An eleven-heading MODIFIED block to add one sentence.
**Reversal cost.** Moving one sentence and two scenarios.

### FULL-AUTO RULING 4 — the "first read without expansion" scenario is conditioned on a view opened by loading the document; the literal gap in `sighting-log`'s "reads when the log mounts" on a fresh cache entry is filed, not fixed

**Question (Q3).** The app-wide 60 s stale time means a mount inside it issues
no request.

**Ruling.** The scenario's GIVEN names a document load (a cold cache). The log's
query options are not changed. The gap is filed.

**Basis.** Tier 3: predecessor architect A7 (qualify the GIVEN). Tier 4: most
reversible — no hook change, no extra request on every return to a system.
**Alternatives rejected.** Forcing a read on every mount (changes
`use-sightings` for a pre-existing gap and adds a request per view open).
**Reversal cost.** One GIVEN.

### FULL-AUTO RULING 5 — the draft sentence "the log's reads are those … and no others" is cut; this capability states only that showing and hiding issue no request and that the first read does not wait for an expansion

**Question (Q4).**

**Basis.** Tier 1 precedent: predecessor RULING 12 (an ADDED `system-console`
requirement names the owner and restates nothing). The sentence is also false
(reconnect refetch; the watcher's retry loop) — analysis § 2.1 R2.
**Alternatives rejected.** Keeping it and turning off reconnect refetch for
this query (a behaviour change to make a restatement true).
**Reversal cost.** One sentence.

### FULL-AUTO RULING 6 — Escape collapses the dock with focus in a text field or a closed select of the view, and the field keeps its value; a native select's open popup and a toast are journey observation only

**Question (Q5).**

**Basis.** Tier 1: predecessor RULING 6, itself the chain doc's "`Esc`
collapses the dock" — "from anywhere in the view"; engine behaviour is
"journey observation only, never specced".
**Alternatives rejected.** Ignoring Escape whose target is editable (the chain
doc states no such condition; link 4 MODIFIES this requirement anyway).
**Reversal cost.** One condition.

### FULL-AUTO RULING 7 — the fleet menu's unfocused-Escape drift stays OUT of this link; the Escape requirement promises the dock stays expanded only when the open menu takes the key, and is silent on an open menu that does not hold focus

**Question (Q6).** `drift-fleet-menu-ignores-escape-when-unfocused.md`: in or
out?

**Ruling.** Out. The drift record's evidence is narrowed (a non-empty menu
focuses its first entry on open, `VitalsStripFleetCell.tsx:76-78`; the
unfocused state is an empty menu opened by pointer in a non-focusing browser,
or focus leaving an open menu). The proposal states the cost: in that state
Escape collapses the dock and leaves the menu open.

**Basis.** Tier 1: chain doc, link 2b-i-b — the drift "is filed and bounds what
its Escape clause may promise (A5)". Tier 3: predecessor architect A5 ("to
file, not fix"). It needs a MODIFIED block on *The Fleet Cell's Chevron and
Menu Are Keyboard-Operable* and an edit to a file this link otherwise never
opens, with the count at the cap.
**Alternatives rejected.** Fixing it here (independent of the dock; unsized).
A scenario for the unfocused state (writes the drift's behaviour into a second
requirement).
**Reversal cost.** None — a later change takes the drift whole.

### FULL-AUTO RULING 8 — the spec is silent on the panel's scroll position across a collapse; "state is not discarded" is narrowed to loaded pages, the selected row and its statement, and the read's state; the journey logs the scroll offset

**Question (Q7).**

**Basis.** Tier 4: most reversible — nothing is promised that was not measured.
No document records a lean.
**Alternatives rejected.** Requiring it preserved (needs code nobody asked
for). Requiring a return to the origin (pins engine behaviour).
**Reversal cost.** One sentence added later.

### FULL-AUTO RULING 9 — the draft's highlight-and-no-mark scenario is split in two (a highlighted row; a row's no-mark statement), each with the scene held unchanged between the collapse and the expansion

**Question (Q8).** The draft's single scenario describes a state `SightingLog`
cannot be in (analysis § 3 R1.2-3, § 4).

**Basis.** Tier 4: most reversible; the no-mark statement is the only tier-1
witness that content was not remounted, and a fixed-scene GIVEN keeps the
scenario true.
**Alternatives rejected.** Dropping the statement scenario (leaves "state is
not discarded" with no witness a remounting build fails).
**Reversal cost.** One scenario.

### FULL-AUTO RULING 10 — `sighting-log` takes no delta for a hidden row carrying the highlight; the mounted-content requirement says a row's highlight is not presented while its tab is not shown

**Question (Q9).** `sighting-log` "…or the log is not open … no row is
highlighted" against a hidden, mounted, highlighted row.

**Basis.** Tier 1: predecessor RULINGs 10 and 12; live `system-console` already
says the row "SHALL be highlighted when the Log tab is next shown".
**Alternatives rejected.** A five-heading MODIFIED `sighting-log` block.
**Reversal cost.** One sentence.

### FULL-AUTO RULING 11 — one physical Escape press does one thing: an auto-repeated keydown does not collapse the dock

**Question (Q10).** A held Escape closes the menu and then, on repeat, would
collapse the dock.

**Basis.** Tier 4: most reversible (one condition, one test row). It follows
predecessor RULING 6's "the fleet cell's open menu takes Escape first".
**Alternatives rejected.** Leaving it (one press doing both contradicts the
menu's precedence).
**Reversal cost.** One condition.

### FULL-AUTO RULING 12 — a failed load-more or re-read over listed rows is left to `sighting-log`; the failed-while-collapsed scenario is arranged on the first read only, and the unspecified case is filed

**Question (Q11).**

**Basis.** Tier 1 precedent: predecessor RULING 12 (the owner's states are not
restated). Tier 4: most reversible.
**Alternatives rejected.** Pinning "the rows are withdrawn" here (canonises an
unspecified, possibly unwanted behaviour of another capability).
**Reversal cost.** None.

### FULL-AUTO RULING 13 — no new chain link: the row-into-view scroll (predecessor UX U4 / design D-20) is shed to a filed follow-up at authoring, and the change is authored at or under 40 tasks in the predecessor's unit; if an honest recount passes 40, the Escape block is the pre-identified seam

**Question (Q12).** The analyst counts 42 as fully drafted (38–44).

**Ruling.** Shed the highlighted-row-into-view scroll and its `SightingLog`
prop to `docs/handoffs/followup-log-highlighted-row-into-view.md` (for 2b-ii's
author to read). Fold the two INFERRED Escape groups into rows of their
neighbours. The architect recounts in the predecessor's unit (one test
arrangement group with one closing assertion) BEFORE the adversary. Only if
that recount passes 40 does *Escape Collapses the Expanded Dock* move to
2b-ii's authoring, by a further ruling.

**Basis.** Tier 1: the 40-task cap (`harness/commands/team.md`); chain doc,
link 2b-i-b *Delivers* — the row-into-view scroll is not named there, Escape
is. Tier 3: predecessor architect ("first candidate to shed").
**Alternatives rejected.** A fifteenth chain link for a six-task remainder.
Authoring past the cap.
**Reversal cost.** One follow-up change; nothing built is undone.

---

## Rulings made after the panel reported, 2026-10-05

### FULL-AUTO RULING 14 — the Escape listener carries no text-composition guard: the clause is deleted from the build task and from design.md, and no requirement sentence is added for it

**Question.** Task 4.3 builds "ignore a keydown during composition", which no
requirement or scenario states. UX U4 says drop it; architect A12 recommends
keeping it with one requirement sentence and one test step, and offers the
deletion as its alternative.

**Ruling.** Delete it (A12's alternative, U4's recommendation). The view's
only text fields are numeric and take no composition input today.

**Basis.** Tier 2: the spec-first rule (`harness/skills/openspec-team-workflow/SKILL.md`
— code traces to a scenario; unrequested hardening is not built). Tier 4: most
reversible — one condition added by the change that first puts a composing
field in the view (2b-iv moves the inputs into the dock and reads this).
**Alternatives rejected.** A SHALL sentence with no scenario of its own (the
adversary's first target); a scenario and arrangement group for it (past the
cap for a state the view cannot reach).
**Reversal cost.** One condition.

### FULL-AUTO RULING 15 — the panel's findings are dispositioned in `keep-console-tab-content-mounted-panel-dispositions.md`: every architect, UX and security finding is accepted except A12's primary recommendation (RULING 14) and UX U5, which is filed as a follow-up; task 1.11's failed-read control row is cut, leaving 39 tasks

**Question.** Architect: 5 MAJOR, 10 MINOR, recount 40 as written and 39 with
A6's cut. UX: 5 MINOR. Security: clear, 3 notes.

**Ruling.** As the dispositions file states, finding by finding. No finding
adds an arrangement group. U5 (nothing is announced to a screen-reader user
when Escape collapses the dock from outside it) is filed as
`followup-escape-collapse-not-announced.md` for 2b-ii's author.

**Basis.** Tier 3: the panel. Standing tie-breaks (architect on technical
shape, UX on user-observable behaviour); the 40-task cap for U5 and A6.
**Alternatives rejected.** Authoring U5's scenario now (a new live-region
behaviour and a new arrangement group at the cap, in a requirement link 4
MODIFIES).
**Reversal cost.** One follow-up change.

---

## Ruling during the adversary repair loop, 2026-10-05

### FULL-AUTO RULING 16 — adversary round 1 (2 BLOCKER, 3 MAJOR, 4 MINOR) is confirmed in full and repaired as its report proposes; the one spare task is spent on a warm-cache test over the real interior hook (task 1.15), putting the change at the 40-task cap; the Escape handler's unobserved `preventDefault` is deleted

**Question.** `keep-console-tab-content-mounted-adversary-r1.md`: which findings
stand, and does M3 take the last task or is its gap accepted?

**Ruling.** Every finding is confirmed; the per-finding rulings are in that
file. M3 takes the spare group: the latch's warm arm is tested against the
real `useSystemSpace` derivation, not a hand-set `isFetching`. m2 deletes the
`preventDefault` from task 4.3 and design.md D-5.

**Basis.** Tier 1: chain doc *Taught* (2a-ii "Lifting state moves a derivation
out from under its only test"; 2a-iii-b "a test that hand-sets … observes an
arrangement, not the derivation"); RULING 2 builds the latch for exactly the
state M3 says nothing observes. For m2: the basis of RULING 14.
**Alternatives rejected.** Accepting M3's gap with a cost line (keeps a spare
task for a round that should now be a diff spot-check, at the price of the
link's central new mechanism being unobserved).
**Reversal cost.** One test task.

### FULL-AUTO RULING 17 — adversary round 2 found residue only (0 BLOCKER, 1 MAJOR, 3 MINOR, all inside round-1 repairs); every finding is confirmed and repaired as text with no new task, and round 3 is a diff spot-check of those repairs

**Question.** `keep-console-tab-content-mounted-adversary-r2.md`.

**Ruling.** r2-M1, r2-m1, r2-m2 and r2-m3 are applied as the report's
paste-ready text gives them. The count stays at 40. Round 3, the last the cap
allows, reads only the round-2-to-round-3 diff.

**Basis.** Tier 2: the workflow skill's convergence rule (residue-only rounds
are a convergence signal, not a reason for another full attack). r2-M1 is the
same shape RULING 5 already cut ("and no others").
**Alternatives rejected.** Carrying the MAJOR unedited to the verdict (it makes
a requirement sentence false of the designed build on Refresh).
**Reversal cost.** None.

---

## Ruling at adversary clearance, 2026-10-05

### FULL-AUTO RULING 18 — round 3 is CLEAR at the cap; its one residue MINOR (r3-m1, the offline clause has no observer) is carried unedited and settled in the implementation contract

**Question.** `keep-console-tab-content-mounted-adversary-r3.md`: 0 BLOCKER,
0 MAJOR, 1 MINOR. Edit the change again, or carry it?

**Ruling.** Carry it. The spec text is true and decidable as written; the
impl contract binds task 1.14's first row to an interior with no data and
nothing in flight, and task 5.10's paused-read record gains the reconnect
sentence. The change folder at the verdict commit is the round-3 target,
unedited.

**Basis.** Tier 1 precedent in this chain: `add-burn-cost-overlay` RULING 20
and `add-console-dock` RULING 22 (a residue MINOR found at the last round is
carried unedited rather than left without a verdict). Round cap: three,
counted across the change.
**Alternatives rejected.** A further edit after the last round (the change
would have no verdict on its current content).
**Reversal cost.** None.

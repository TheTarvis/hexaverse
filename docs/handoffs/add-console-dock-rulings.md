# `add-console-dock` — open questions and rulings

Link 2b of the system-HUD chain (`docs/plans/system-hud/chain.md`), handed to the
full-auto orchestrator on 2026-10-04 at `d777cfd`; **link 2b-i after RULING 1
below**. Every user gate is lifted; every open question is ruled in-run by the
precedence in `harness/skills/openspec-team-workflow/SKILL.md` § "Full-auto
chains":

1. the chain doc's / scoping doc's / design canvas's recorded lean,
2. a settled decision in root `CLAUDE.md` or `openspec/project.md`,
3. the panel's recommendation,
4. the most reversible option.

A ruling with a recorded basis is a decision. A choice without one is a guess,
and guesses are forbidden.

Input: `docs/handoffs/add-console-dock-analysis.md` (index:
`add-console-dock-analysis-index.md`), whose § 10 lists Q1–Q23. The design canvas
both scoping documents cite is extracted at `docs/handoffs/add-console-dock-canvas/`.

---

## Rulings made at orchestration open (before authoring), 2026-10-04

### FULL-AUTO RULING 1 — the link splits into five changes; this run authors, builds and archives only the first, `add-console-dock` = the dock shell plus the Log tab, and the other four are inserted in the chain doc as `not authored`

**Question.** The analyst sizes link 2b at about 150 tasks (144–167) against the
40-task cap (analysis § 1.4). Where does it split, and which piece is first?

**Ruling.** The analyst's split (analysis § 2.3), in this archive order:

- **2b-i `add-console-dock`** — the dock shell beneath the strip (expand
  affordance, tab bar, collapse control, Escape, collapsed on every mount,
  content mounted and hidden, fixed 220 px, the bottom-band occupants following
  the dock's height) and the **Log** tab. Deletes the floating log panel, the
  `sighting-log-open` toggle and the `logOpen` state. Estimated 35 tasks.
- **2b-ii `move-scan-control-to-console-dock`** — the Scan tab; tab switching
  and arrow-key movement between tabs become real.
- **2b-iii `move-fleet-roster-to-console-dock`** — the Fleets tab.
- **2b-iv `move-fleet-actions-to-console-dock`** — the Acting-fleet tab holding
  `FleetActionsPanel`; the jump control moved out of `SpaceCommandPanel`
  (pre-identified seam if past the cap: `move-jump-command-to-fleet-panel`).
- **2b-v `retire-right-command-column`** — `SpaceCommandPanel`'s course half
  into the Acting-fleet tab as its interim home; the column deleted; the 2a-iv
  flags (a) (b) (c) and the own-ness deny scenario.

Each later piece's row is `not authored`: a verdict authored now would expire
when its predecessor archives (the `add-vitals-strip` RULING 9 precedent). What
each must deliver and inherit is analysis § 2.5 and is copied into the chain doc
section this run writes.

**Basis.** Tier 1: the chain doc's own rule ("links are sized to 20–40 tasks; a
link that grows past that is split") and its statement that step 2's dock "would
be authored past the cap and split by its own panel anyway"; `harness/commands/team.md`
("the size cap still applies"). The order is the analyst's: shell + Log is the
only candidate first piece with no always-visible surface becoming hidden by
default, no requirement shipped false, and no unruled product call (analysis
§ 2.2); the chain table's own first tab (Acting fleet) contains both hard-stop
candidates Q13 and Q14.

**Alternatives rejected.** One 150-task change (the cap; the previous chain's
119- and 131-task links). Shell + Acting fleet first (Q13 and Q14 have no
recorded lean and would stop the run). Shell + Scan first (leaves the floating
log beside a dock — the legacy layout the chain forbids). Shell + Fleets first
(needs Q17 and a reading of *Renderer Unavailability*).

**Cost, said out loud.** The right column shrinks over five changes instead of
being deleted in one. That is a coexistence period the chain's ground rule
forbids in spirit; it is unavoidable under the cap. No piece keeps what it
replaced and no flag guards anything; each proposal states it.

**Reversal cost.** None before the later pieces are authored: the four rows are
text in the chain doc.

### FULL-AUTO RULING 2 — a tab's content stays mounted and is hidden with the HTML `hidden` attribute; React's `<Activity>` is not the mechanism

**Question.** Chain doc "Tab remount is the trap": remount on show, or mounted
and hidden?

**Ruling.** Mounted and hidden, by the `hidden` attribute on the element that
wraps what is not shown (the tab bar and panel region while collapsed; from
2b-ii, an unselected tab's panel). `<Activity mode="hidden">` is a rejected
alternative recorded in design.md.

**Basis.** Tier 1: chain doc "Open decisions gating the chain" — "Yes, mounted
and hidden (`hidden` attribute)". The `<Activity>` exclusion follows from the
same lean's stated purpose (an in-flight commit survives): the analyst reads it
as tearing down effects, which is where React Query observers subscribe
(analysis § 8 D-4, not verified by running — the architect is asked to confirm).

**Alternatives rejected.** Conditional rendering (loses load-more pages, the
row highlight, and from 2b-ii the guards and mutate-level callbacks).

**Reversal cost.** One prop / one wrapper, per the chain doc.

### FULL-AUTO RULING 3 — the expanded dock is a fixed 220 CSS px including the strip, with no resize control

**Basis.** Tier 1: chain doc open decision "Dock height — Fixed 220px, no
handle". The spec states it at the 1280×720 floor `system-console` already uses.
The "~164 px detail area" includes the tab bar (analysis § 6); the spec states
the total and the strip's height, never the panel area's.
**Alternatives rejected.** A drag handle (out of the chain by name).
**Reversal cost.** One later change adding the handle.

### FULL-AUTO RULING 4 — a collapsed dock is opened by a "Console" control outside the strip, placed where the design canvas puts it

**Question (Q2).** No prose document says what opens a collapsed dock.

**Ruling.** A dedicated expand control that is not part of the strip element —
so `system-console`'s "the chevron is the strip's only interactive element" and
the strip's no-verbs invariant stay true without a delta. The spec states its
presence, operability and non-overlap, not its pixel position; the impl contract
takes the position from `docs/handoffs/add-console-dock-canvas/Collapsed.dc.html`.
A collapse control sits in the tab bar (`Main.dc.html`).

**Basis.** Tier 1: the design canvas is a named design input and is the only
source that shows the affordance.
**Alternatives rejected.** A control inside the strip (falsifies two live
`system-console` clauses; needs MODIFIED blocks). The strip itself as a click
target (the strip "reads; it does not command").
**Reversal cost.** One component.

### FULL-AUTO RULING 5 — the dock is collapsed on every mount of the system space view; its state is not persisted across a reload or a cross-system navigation

**Basis (Q6).** Tier 1: scoping doc "Default is collapsed"; chain doc "default
collapsed". **Alternatives rejected.** Remembering the state in storage or the
URL (no document asks for it; adds a surface to test). **Reversal cost.** One
later change.

### FULL-AUTO RULING 6 — Escape collapses the expanded dock from anywhere in the view and does nothing else; the fleet cell's open menu takes Escape first; no selection is cleared

**Basis (Q4).** Tier 1: chain doc "`Esc` collapses the dock (the second-press
rule lands with selection in link 4)". The menu's precedence is the live
`system-console` *The Fleet Cell's Chevron and Menu Are Keyboard-Operable*,
unchanged. Engine behaviour (a native select popup, a toast) is journey
observation only, never specced.
**Alternatives rejected.** Escape clearing the selection now (link 4's rule,
pulled forward without its tab). Escape scoped to focus inside the dock (the
chain doc states no such condition; the keyboard user who opened the dock from
the canvas could not close it).
**Reversal cost.** Link 4 MODIFIES the requirement anyway; design.md says so.

### FULL-AUTO RULING 7 — the tab is labelled `Log` with no count in this change; a count is a later, separately ruled addition

**Question (Q1).** The docs write `Log · N` and never define N; the wire serves
no pile total and the chain forbids a backend field.

**Ruling.** `Log`, no count. PROVISIONAL at tier 4: if the UX reviewer
recommends a defined, wire-backed N, tier 3 outranks this and the ruling is
revisited after the panel.

**Basis.** Tier 1 gives the label's shape but not a figure the client can
compute truthfully: "rows loaded so far" reads as a total and is wrong whenever
more pages exist (the mock's `Log · 3` is a total). Chain precedent, link 2a
Taught: a figure the wire does not carry is re-scoped, not invented. Tier 4:
omitting it is the most reversible — adding a count later is one scenario; a
wrong count shipped now is a figure to retract.
**Alternatives rejected.** Rows loaded (misleading). Rows loaded with a `+`
marker (a new figure form `figure-formatting` does not have). A served total
(backend — fenced).
**Reversal cost.** One scenario and one label.

### FULL-AUTO RULING 8 — showing the Log tab issues no read; the pile is read when the log mounts, after a sweep settles, and on explicit Refresh, exactly as `sighting-log` already says

**Basis (Q7).** Tier 1: `sighting-log` *The Log Reads on Mount, After a Sweep
Settles, and on Explicit Refresh — Never on a Timer* (live spec), and the tabs
lean's purpose (state survives without a lifted-state refactor).
**Cost, stated.** Today opening the log is a mount and so a read; after this
change records minted elsewhere appear on Refresh or on the next settle, not on
re-expanding. That is a player-visible difference in freshness and the proposal
says so.
**Alternatives rejected.** A read on every expand (a new trigger the owning
requirement's title forbids by enumeration; a poll by tab-flipping).
**Reversal cost.** One effect.

### FULL-AUTO RULING 9 — the live `sighting-log` scenario "The log refetches after a sweep settles" is made true in this change, with a view-level test and no delta

**Question.** Analysis § 7 D1: the settle path refetches only the
system-filtered pile; the log reads the unfiltered one. The gap is masked today
because opening the log mounts it; this change removes the mask.

**Ruling.** In scope, as a task with a view-level test over a real sightings
hook, on both settle exits. No spec delta — the live scenario already states
the behaviour. A `drift-` record is filed first.

**Basis.** Tier 1 precedent in this chain: `lift-burn-preview-to-view` carried
`drift-running-mine-preview-unsuppressed` the same way ("needs no delta — the
fix makes a live scenario true; it needs a view-level test"). Without it this
change ships a requirement false that is true-by-accident today.
**Alternatives rejected.** Filing it and shipping (ships *The Log Reads on
Mount…* false in the ordinary path and turns `scan-journey` step 5 red).
**Reversal cost.** One invalidation.

### FULL-AUTO RULING 10 — activating a sighting ghost does not open the dock; the row is highlighted when the tab is next shown

**Basis (Q8).** Tier 1: chain doc link 4 — open-on-select belongs to the
Selected-entity tab and to selectable entities; a ghost is "Not a Member of the
Space View's Selection". Tier 4 for the residue: adding an auto-open later is
one handler; removing one is a behaviour to retract.
**Alternatives rejected.** Open on ghost activation (link 4's behaviour on a
different tab). **Reversal cost.** One handler.

### FULL-AUTO RULING 11 — every floating surface that sits in the bottom band follows the dock's height, `FloatingNav` included, from one source; the galaxy route's nav does not move

**Basis (Q11).** Tier 1: link 2a's Taught record ("enumerate by grepping for
fixed + bottom-anchored elements, and remember the framework itself is an
occupant") and the 2a precedent that raised `FloatingNav` clear of the strip.
The enumeration of record is analysis § 5. The mechanism is the architect's.
**Alternatives rejected.** Moving `FloatingNav` to a permanent new home (no
document decides one; not this chain's). **Reversal cost.** One style source.

### FULL-AUTO RULING 12 — placement is stated in ADDED `system-console` requirements that name the owning capability; `sighting-log`, `system-space-view` and `docked-fleet-actions` take no delta in this change

**Question.** The chain doc says each moved requirement gains a "mounted in the
console" clause (MODIFIED blocks, scenarios verbatim).

**Ruling.** No MODIFIED block in 2b-i unless a reviewer shows a live sentence
this change makes false. The tab list lives in its own small requirement so
each later piece MODIFIES three scenarios, not thirty.

**Basis.** Tier 1, the later and more specific record: `add-burn-cost-overlay`
RULING 8 and link 2a-iv's Taught ("a projection of a value another capability
already determines needs no delta on the owner — and a 21-scenario MODIFIED
block to add two words is the archiver trap at its largest"). The analyst found
no `sighting-log` requirement that names a placement that changes (analysis
§ 1.3, § 6). Q9 ("across the foot") and Q10 (one tab in a tab bar) fall under
this: no delta; the proposal says the bar holds one tab until 2b-ii.
**Alternatives rejected.** The chain doc's clause-per-requirement (23 MODIFIED
blocks carrying 83 scenarios across the link).
**Reversal cost.** None — a later change can still add a clause.

### FULL-AUTO RULING 13 — these are shed from 2b-i to named later pieces: arrow-key movement between tabs and "survives a tab switch" (2b-ii); the own-ness deny scenario and flags (a) (b) (c) (2b-v)

**Basis.** Tier 1 for the cap. Each shed is vacuous or premise-false in this
piece: one tab cannot be switched; no 2b-i surface mounts the strip against an
arbitrary selected entity (analysis § 6 C14), and no quote-carrying surface is
hidden by this piece, so flags (a) and (b) are not yet triggered. The chain
doc's "assert it, do not inherit it" is honoured by naming the piece that
asserts it, in that piece's chain-doc section. `drift-strip-cells-retain-figures-after-failed-fleets-read`
stays filed (2a-iv RULING 11); 2b-i re-homes no strip cell.
**Alternatives rejected.** Authoring vacuous scenarios now. **Reversal cost.** None.

### FULL-AUTO RULING 14 — the first piece keeps the id `add-console-dock`

**Basis (Q12).** Tier 4 (precedents disagree): the chain row, the canvas
directory, the analysis and this ledger are already keyed to it; renaming is
churn with no gain. **Reversal cost.** A rename before authoring only.

---

## Questions recorded for the pieces that own them (not ruled here)

- **Q13, Q14 (2b-v)** — what a player gets for a selected target while the dock
  is collapsed and Burn is in a hidden tab; what carries the quote's
  affordability while collapsed. **No recorded lean anywhere; hard-stop
  candidates for 2b-v's orchestrator unless Travis records a lean in the chain
  doc first.** The analyst's most-reversible options are in analysis § 10.
- **Q15 (2b-iv, 2b-v)** — where the own-fleets, station and board failure cards
  live once their panel is hidden by default.
- **Q16 (2b-ii, 2b-iv)** — live regions inside a hidden subtree.
- **Q17, Q22 (2b-iii)** — the zero-fleet Fleets tab, the roster's own toggle,
  *Renderer Unavailability* under a collapsed dock.
- **Q3 (2b-ii)** — which tab is shown on expand once there are two.

---

## Rulings made after the panel reported, 2026-10-05

Panel reports: `add-console-dock-panel-architect.md` (A1–A16), `add-console-dock-panel-ux.md`
(U1–U10), `add-console-dock-panel-security.md` (S1). Per-finding dispositions:
`add-console-dock-panel-dispositions.md`.

### FULL-AUTO RULING 15 — the first piece splits again at placement against lifetime: `add-console-dock` keeps the shell and the Log tab's placement with the log mounted on show as it is today, and a new link 2b-i-b `keep-console-tab-content-mounted` (`not authored`) takes stays-mounted, no-read-on-show, the settle re-read, the mount latch, Escape and not-a-pick

**Question.** Architect A1 (BLOCKER): 38 is bundling; the honest count is 52 as
drafted and 56 with the sound review additions; no set of sheds reaches 40.

**Ruling.** The architect's seam, as its A1 allocates it:

- **`add-console-dock` (2b-i)** — the dock shell, the "Console" and collapse
  controls, the tab list, the Log tab as the log's home, the report's link as an
  open-only entry, focus on expand and on collapse, tab and disclosure
  semantics, the waiting indication, the published height and the five
  occupants, the MODIFIED strip block (RULING 16), and deletion of the floating
  panel, the toggle and `logOpen`. **The log's content is mounted when the tab
  is shown, exactly as `logOpen && !interior.isLoading` mounts it today**, so no
  read's timing changes and no e2e precondition changes. 37 tasks by the
  architect's count.
- **`keep-console-tab-content-mounted` (2b-i-b, before 2b-ii)** — *A Tab's
  Content Stays Mounted While It Is Not Shown*, *Showing or Hiding the Log Tab
  Issues No Read*, *Escape Collapses the Expanded Dock*, *Activating the Dock
  Changes No Space-View Selection*, U1, U4's row-into-view, the mount latch and
  its warm-cache arm (A7), the D1 fix (A3), the mount-timing migrations (A9).
  30 tasks by the architect's count.

**What this does to earlier rulings.** None is withdrawn; four change the piece
that delivers them: RULING 2 (mounted and hidden), RULING 8 (no read on show),
RULING 9 (the settle re-read; `drift-sighting-log-not-reread-after-sweep-settles.md`
stays OPEN and exactly as masked as it is today) and RULING 6 (Escape) are
delivered by 2b-i-b. RULING 1's list gains one row. The writer's draft text for
the moved requirements is preserved at
`docs/handoffs/keep-console-tab-content-mounted-draft-delta.md` as input to that
link's author; it carries no verdict.

**Basis.** Tier 1: the cap (chain doc; `harness/commands/team.md` "a link past
40 tasks splits at its pre-identified seam (or the architect's)"). Tier 3: the
architect sized the alternative seam (keyboard and Escape out, lifetime in) at
46 for its first half. The chain doc's "Tab remount is the trap. Rule it" is
honoured — it is ruled (RULING 2) and built in a change of its own before any
second tab exists, which is where a remount first costs anything; with one tab,
whose old home was itself mounted on open, mounting on show loses nothing a
player has today.

**Alternatives rejected.** One 56-task change (the cap). Sheds only (52). The
other seam (46).

**Cost, said out loud.** Nine more gate tasks; two e2e specs touched twice; one
more link of coexistence; 37 has no headroom, so adversary growth past 40 is
met by shedding to 2b-i-b, not by merging boxes. Until 2b-i-b the dock has no
Escape key — the collapse control is the way out — which is narrower than the
chain doc's "`Esc` collapses the dock" for one link.

**Reversal cost.** None before 2b-i-b is authored.

### FULL-AUTO RULING 16 — `system-console` *The Vitals Strip Is Present on Every Render of the System Space View* is MODIFIED in this change, because its "across the foot" is false while the dock is expanded; `system-space-view` takes no delta

**Basis.** RULING 12's own exception (a live sentence this change makes false);
the chain's rule that no requirement ships false. Tier 3: architect Job 4(b)
and A2 supply the complete six-scenario block diffed against the live spec; UX
U9 reached the same requirement by a different clause — the architect's reading
of which clause fails wins (technical shape). The `system-space-view` keyboard
scenario is not false until 2b-ii moves `ScanControl` (architect Job 4(a), UX
U9 agree): its "sighting-log affordance" is the report's link, which stays.
**Alternatives rejected.** No delta under "always-visible" (leaves "across the
foot" false). **Reversal cost.** One six-scenario block; reconcile and the
archive rehearsal check it.

### FULL-AUTO RULING 17 — RULING 7 is confirmed: the tab is labelled `Log` with no count

**Basis.** Tier 3 now agrees with tier 4: UX confirms (a truthful N exists only
when no next cursor is held; `Log · 0` would read as empty during loading and
failure; a label that changes on load-more re-names the tab for assistive
technology). No longer provisional. RULING 10 is likewise confirmed by UX with
its positive half added (the ghost is highlighted in the scene).

### FULL-AUTO RULING 18 — expanding moves keyboard focus to the selected tab; collapsing with focus in the tab bar or the panel moves it to the "Console" control; focus anywhere else is not moved

**Basis.** No document says. Tier 3: UX U2 (the "Console" control is replaced
by the expansion it causes, so focus would fall to the document start; the
report's link is otherwise a visible no-op when already expanded) and architect
A6 (scope "inside it" to the tab bar and panel so the strip's chevron keeps
focus). **Alternatives rejected.** Focus left where it was (lost); focus into
the panel's first control (skips the tab's name for a screen reader).
**Reversal cost.** One effect.

### FULL-AUTO RULING 19 — while the interior read the view opened with has not finished, an expanded Log panel shows a neutral waiting indication that is not the log's own loading state

**Basis.** Tier 3: UX U3, architect A12 (feasible at tier 1; a failed interior
read ends the wait). In this change the gate is today's (the interior's first
load); the stronger latch and its warm-cache arm are 2b-i-b's (RULING 15).
**Alternatives rejected.** A blank panel; the log's "Reading the pile…" (claims
a read that is deliberately not issued). **Reversal cost.** One element.

### FULL-AUTO RULING 20 — the own-ness deny scenario is carried by trigger, not by piece: the first change that supplies the strip, or any dock tab rendering roster-derived figures, a fleet not drawn from the own-fleets read (link 4 expected) asserts it

**Basis.** Amends RULING 13. Tier 3: security S1 and architect A14 — anchored
to 2b-v it is premise-false there too and could be shed again. The scenario
text of record is in `add-console-dock-panel-security.md` § S1; the chain doc
sections this run writes carry the trigger. **Reversal cost.** None.

---

## Ruling during the adversary repair loop, 2026-10-05

### FULL-AUTO RULING 21 — the camera cluster's lane is held at tier 1 by a source-text check and at tier 4 by the journey's measured geometry; no render-level tier-1 box is added, and the task count stays at 40

**Question.** Adversary r1 M10 split task 2.12 "at the file boundary". Strictly
that is three files; the writer homed the camera cluster's lane-class check in
the module-and-source-text group (`SpaceStage.tsx` must reference the exported
camera-lane constant and contain no `bottom-[4.5rem]`) instead of a render of
`SpaceStage`, because a third box makes 41.

**Ruling.** Accepted as written. **Basis.** Tier 1 (the cap) and the architect's
A8 item 2: tier 1 can only ever hold the structural half of the lane rule —
jsdom lays nothing out — and what a player sees (the cluster clear of the dock,
the strip and the "Console" control in both states, activatable) is asserted by
measurement in the journey. A rendered class-name assertion adds nothing the
source-text check and the journey do not already hold. **Alternatives
rejected.** A 41st task (the cap; RULING 15 says growth is shed, not merged);
shedding another scenario to make room for a redundant check. **Reversal
cost.** One test.

---

## Ruling at adversary clearance, 2026-10-05

### FULL-AUTO RULING 22 — round 3 is CLEAR at the cap; its three residue MINORs are carried unedited and two of them are settled in the impl contract

**Ruling.** r3-m1 (a dangling comma in tasks.md's preamble) is carried as is.
r3-m2: task 2.12's "no `bottom-[4.5rem]` literal remains" reads raw source
text, so the stale comment at `floating-nav.tsx:11` is rewritten by the build.
r3-m3: the journey's return leg is the single route (roster-row select, then
`enter-system-button`). Neither is edited into the change.

**Basis.** The workflow's cap rule (MINOR residue at the cap is ruled forward,
never another round) and the `add-burn-cost-overlay` RULING 20 precedent: an
edit after the verdict expires it, and a fourth round is not available. The
adversary states that neither reading of r3-m2 nor of r3-m3 yields a wrong
build. **Alternatives rejected.** Editing after the verdict; a fourth round.
**Reversal cost.** None.

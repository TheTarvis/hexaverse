# Adversary round 1 — `clear-burn-preview-on-commit` (system-HUD chain, link 2a-iii-b)

Change mode, read-only. 2026-10-04. Read: the change folder whole; `docs/plans/system-hud/chain.md` whole;
the rulings ledger whole; the live `system-space-view` requirements the delta touches or leans on
(`:478-1020`, `:3037-3292`); `SpaceCommandPanel.tsx`, `SystemSpaceView.tsx` (`:290-410`, `:560-1085`),
`use-burn-preview.ts`, `use-fleets.ts`, `space-selection.ts`; the three existing test files that click Burn;
every e2e spec that clicks Burn; the predecessor's archived tasks and RULINGs 11-12; the panel dispositions,
writer notes, architect addendum; the named drift, defect and follow-up records. No stack booted, no suite run.

**Counts: BLOCKER 0 · MAJOR 2 · MINOR 6**

The central question (a committed state that outlives the order it names) is answered. The derivation in
design.md Decision 6 is a pure function of the record and the last answer; I could not make it outlive an
order, and each ending has a scenario a wrong build fails (table at the end). The two MAJORs are a
replacement rule with clauses no row tests, and a repair the task list does not count.

---

## BLOCKER

None.

---

## MAJOR

### M1 — "One committed selection per fleet" states four things and has a failing row for one

**Where.** `openspec/changes/clear-burn-preview-on-commit/specs/system-space-view/spec.md:23-27`:

> "There is one committed selection per fleet: a fleet's later accepted burn commit replaces its earlier one at
> that acceptance, toward the same target or another, whether or not the later response carries the stranding
> warning, and one fleet's commit SHALL NOT affect another fleet's."

Rows that exist: scenario 12 (`:229-233`) is a later commit toward **another** target with no warning stated;
scenario 19 (`:272`) is a later **unwarned** commit. Scenario 14 (`:241-245`) has two fleets but fleet B never
commits. `tasks.md:30` (3.14) and `:28` (3.12) mirror them.

**Attack.** Three builds pass all 21 scenarios and every task as written:

1. **One record, not one per fleet.** `{ fleetId, selectionKey, instants }`, replaced by whichever fleet committed
   last. Scenario 14 passes in both rows (B never commits, so A's record survives). After A commits to X and
   B commits to anything, switching back to A shows A's quote refreshing and Burn enabled for the flown-to
   target: the drift this link closes, back for every two-fleet player. The predecessor's test "Each fleet
   keeps its own notice" guards this only if the notice and the committed selection share a store, which the
   spec does not require (it requires one *determination* of running, `:42-46`).
2. **A later commit toward the same selection is ignored** (`if (current[id]?.selectionKey === key) return current`,
   the kind of bail-out a reviewer waves through). Cut the drive, re-commit to the kept selection: the old
   record's instants no longer match and its gap is closed, so nothing is committed and the quote polls as a
   re-target. Task 3.5 (`tasks.md:21`) even clicks Burn in the resume window, then asserts only the request's
   missing `maxFuelTons`. The journey's "commit again and arrive" (`tasks.md:60`) asserts the statement
   *absent* after arrival and nothing while that second order flies.
3. **A later warned commit does not move the committed selection.** "Whether or not" has its unwarned row only.

The chain doc's own Taught record for the predecessor is the standard: "Every 'whether or not', 'both' and
'exactly once' needs a row a one-sided build fails." Task 7.2 asks QA to name that row; for these three there
is none to name.

**Repair.** *Principle:* each clause of a replacement or isolation rule gets one observable row; rows go on
arrangements that already exist. Smallest text, no new task:

- Scenario 14, one more AND (row one of task 3.14 gains the step): "**AND** when B's burn order for the kept
  selection is then accepted and A is made the acting fleet again while the last read reports both orders
  running, the statement is shown, the burn command is unavailable and no preview request is sent for A; and
  the same holds for B when B is acting."
- Scenario 5, one more AND (task 3.5 already submits that order): "**AND** when the burn committed in that
  window is accepted, the statement is shown again for the kept selection and no further preview request is
  sent for it."
- Scenario 12 WHEN: "... is accepted, **in one arrangement with the stranding warning and in another without**,
  its response's burn departing at 5000 and arriving at 80000". Two rows of task 3.12, same closing assertion.

### M2 — Task 5.1 breaks two existing panel tests that no task repairs; the "seven re-arranged" claim and the count leave them out

**Where.** `tasks.md:44` (5.1): "the accepted-commit payload gains the selection the command was invoked for
... the field is named `selectionKey`". `tasks.md:37-40` (section 4) repairs the view-level file only.
`proposal.md:14`: "seven arrangements in the predecessor's own view test file re-arranged". `tasks.md:1`:
the carried scenarios "are covered by the existing tests that section 7 and the gate keep green".

`frontend/components/space/SpaceCommandPanel.test.tsx:778-783` and `:802-807` (the predecessor's panel tasks
1.1 and 1.2, the second parametrised over two rows):

```ts
expect(onCommitAccepted).toHaveBeenCalledWith({
  fleetId: 'fleet_1', departMs: T0 + 1000, arriveMs: T0 + 61000, strandingWarning: true,
})
```

**Attack.** `toHaveBeenCalledWith` compares the whole argument. Once the payload carries a defined
`selectionKey`, both tests (three cases) fail. They are not the new test of task 2.2, they are not in
section 4, and task 7.1's verifying run covers only `SystemSpaceView*.test.tsx`. The developer meets three
reds at 5.1 with no owner: the SDET owns test edits, and the red manifest has no entry for them. Counted
honestly it is a third repair arrangement, which is task 41.

Task 2.2 (`tasks.md:10`) is where it should land, and 2.2 has its own problem: it names two scenarios that are
not rows of one arrangement ("A response that lands after the selection was replaced..." closes on *called
with X's key*; "A rejected or failed commit enters no committed state" closes on *not called*), against the
unit the file's own first paragraph states. The second half is also already green: it is the predecessor's
panel test 1.3, unchanged by this link.

**Repair.** *Principle:* every existing test a production task turns red is named in a repair task before the
build starts; a red task holds one closing assertion. Smallest text, count stays 40:

- Task 2.2 becomes: "the accepted-commit callback reports the selection the command was invoked for (...)
  beside the fleet id, the two burn instants and the warned flag; **the two predecessor tests that assert the
  payload by exact equality (`:764`, `:788`) gain the field**" and names scenario 13 only.
- Scenario 15's panel half is attributed, in the tasks header and design.md's coverage row 15, to the existing
  predecessor test ("the callback is not called for a cap rejection or a failure with no mapped reason"),
  kept green.
- `proposal.md:14` and Impact say "seven view-level arrangements and two panel payload assertions".

---

## MINOR

### m1 — Two clauses of the requirement are tested only in tasks.md, not in any scenario

**Where.** `spec.md:227`: "**AND** when the committed selection is a point and a different point is selected, a
preview request is sent for that point, its burn command is available and no statement is shown". `spec.md:88-89`:
"The statement is shown whether or not the canvas is available."

**Attack.** The point clause asserts only the negative half. A build that records nothing for a non-body
selection satisfies it; so does one that compares the order's served target (`BodyId: ""` for a point). The
positive half ("statement shown, no preview request") is in task 3.11's second row and nowhere in the spec.
The canvas clause has no scenario at all; its only row is a leg of task 2.1. After archive the spec is what
link 4 re-homes these tests from, and link 4 retires the component both tests live in.

**Repair.** *Principle:* a "same for every kind" or "whether or not" clause carries its row in the scenario.
`:227` becomes "**AND** when a burn order for a selected point is accepted, the statement is shown and no
preview request is sent for that point; and when a different point is then selected, a preview request is sent
for it, its burn command is available and no statement is shown". Scenario 1 gains "**AND** when the canvas
becomes unavailable the statement is still shown and no uncapped-burn label is shown". No task changes.

### m2 — The reworded commit clause omits the acting fleet, and reads against scenario 14

**Where.** MODIFIED *Burn Preview Reflects...*, `spec.md:389-391`: "and SHALL clear when the selection is
cleared or replaced, or when a burn order for that selection is accepted from this view, from which point it
is withheld for as long as that withheld state holds."

**Attack.** In scenario 14's second row fleet B is acting with the kept selection when fleet A's order for
that same selection is accepted from this view. Read literally the sentence clears B's quote; the ADDED
requirement says B is "previewed and committable exactly as it was before the commit" (`:22-23`). A build that
drops B's cache entry at A's acceptance re-requests at once and passes scenario 14 ("a preview is requested
for B", "B's burn command is available"), and opens an uncapped, labelled Burn for B that nothing before the
change had.

**Repair.** *Principle:* a carried sentence names the same subject as the requirement it points to. "...or when
a burn order **the acting fleet committed** for that selection is accepted from this view...". Scenario 14's
THEN: "while B is acting **B's preview figures stay shown across A's acceptance**, a preview is requested for B...".

### m3 — "A stop above or at the speed floor" drops the case below it

**Where.** `spec.md:39` ("a stop above or at the speed floor"), the scenario title at `:186`, `proposal.md:7`.
The predecessor it claims not to restate says "a stop above the speed floor ...; a stop at or below the floor"
(live `spec.md:3072-3073`).

**Attack.** The paragraph says the ends "are those of" the predecessor and then lists them differently. Nothing
breaks (the general rule at `:36-38` covers it), but a reader checking the list against the predecessor finds
one case missing in a requirement whose history is a missed way for an order to end.

**Repair.** "a stop above, at or below the speed floor" in the paragraph and the proposal. The scenario title
mirrors the predecessor's and can stay.

### m4 — No row for a read that answers after the arrival instant and still reports the burn

**Where.** Scenario 4, `spec.md:172-176`: "**WHEN** the view's projected world time passes 61000 with no further
read answered". "The lag" (`:63-72`) inherits the predecessor's "a read that still reports the order as running
after its arrival instant ... leave the notice in place" by reference only.

**Attack.** A build that ends the state when an answer's served `worldTime` is at or past `ArriveMs` has no
clock term in render, passes scenario 4 (no read answers) and scenario 1 (its reads are not dated), and
re-enables Burn with a preview toward a target the server has not settled the fleet at. For the notice the
predecessor's copy test happens to arrange it (a read at `worldTime` 99 999 reporting a burn arriving at
80 000); for the quote and the command nothing does.

**Repair.** Scenario 4, one AND: "**AND** when a read then answers still reporting that burn, with its served
world time past 61000, the statement is still shown and no preview request is sent". Same arrangement, task 3.4.

### m5 — The count is 40 under this link's RULING 12, not under the predecessor's, and three "red" tasks cannot be red

**Where.** `clear-burn-preview-on-commit-rulings.md:344-362`, RULING 12, Basis: "Precedence 1/2 — the
predecessor's RULING 12 (... the task unit is the test arrangement group; rows of one parametrised arrangement
are one task)". `tasks.md:39-40` (4.1, four tests; 4.2, three tests). `tasks.md:13` "View-level behaviour (red)".

**Attack.** The predecessor's RULING 12 allows one task to cover rows "of one parametrised arrangement over the
same harness state with the same closing assertion". The seven repaired tests are seven arrangements with seven
closing assertions. The architect said so in the report the ruling answers: "it is the one place the number is
not the predecessor's unit, and the orchestrator should rule it rather than inherit it"
(`-panel-architect.md:238-242`; its table puts the per-test count at 46). The ruling then cites that unit as
its basis. The decision is defensible (one mechanical transformation per task, assertions unchanged); the
citation is not what the source says, and a later link will read "40 in the predecessor's unit".
Separately, tasks 3.15, 3.17 and 3.18 assert only absences and availability that hold today (no statement
element exists, Burn is available, the announcer is silent), so they are green before section 5 and are guards,
not red tests; the header says sections 2 and 3 are red.

**Repair.** Re-base RULING 12 on precedence 3 (the architect's "Two tasks is honest") and say in the tasks
header that section 4 is counted per transformation, outside the arrangement-group unit. Mark 3.15, 3.17 and
3.18 "(regression guard)" as `SystemSpaceView.burn-preview.test.tsx` does, so the red manifest is not recorded
with three tests that never were.

### m6 — The Focus paragraph forbids more than its scenario checks and more than the build controls

**Where.** `spec.md:101`: "The acceptance SHALL NOT move focus to the statement or to any other element."
Scenario 21, `:286`: "focus was not moved to the statement by the acceptance".

**Attack.** design.md Decision 15 builds nothing and relies on the browser. When a focused control becomes
natively disabled an engine may run its focus fix-up and report the document body as the active element while
keeping the navigation starting point. That is the outcome the paragraph wants (the next Tab lands after the
control) and a literal breach of "any other element". The scenario and task 7.3 check only the statement and
the post-Tab element, so the broader sentence is untested either way.

**Repair.** "The view SHALL NOT programmatically move focus at the acceptance, to the statement or anywhere
else." The Tab outcome stays the observable.

---

## Walked and held (no finding)

Each way an order ends or is replaced, against the delta and against Decision 6's derivation
(`orderLive = awaitingRead || stillRunning`, `selectionCommitted = orderLive && key equality`, keyed on `acting`):

| Ending or replacement | Derivation | Scenario a wrong build fails |
| --- | --- | --- |
| Cut drive | read has no burn | 5 (stored pair: statement stays) |
| Stop above the floor | burn with other instants | 6, arrangement one (burn-presence build) |
| Stop at or below the floor | parked at a point | 6, arrangement two |
| Arrival at the selected body | no burn; `dockedAtTarget` true in the same render | 8 (a clock term or a stored pair fails "no preview request" or "statement removed") |
| Arrival at a point | parked, attached to nothing | 7 row 1 |
| Re-task elsewhere, other target | instants differ | 7 row 2 |
| Re-task elsewhere, same target | instants differ | 7 row 3 (target-match build), row 4 (departure-only build) |
| Settled inside the commit round trip | gap holds, first answer ends it | 9 |
| Second commit, same fleet, other target | record replaced | 12 (and M1 for the rows it lacks) |
| Read that still reports the burn | `stillRunning` | 1; past the arrival instant see m4 |
| Failed read | count and `acting` unmoved | 10 (an `isFetching` gap fails its first THEN) |
| Reload or remount | view state lost | 18 row 2 |
| Acting-fleet switch and back | keyed on `acting.id` | 14 row 1 |
| Late response, selection changed | click-time key | 13 |
| Late response, acting fleet changed | click-time fleet id | 14 row 2 |
| Gap before the first read | answer count | 2, 3 |

- **A second Burn uncapped.** No window inside the committed state: the control is disabled from the render
  the acceptance schedules, and the guard release and the report run in one callback. The windows the text
  does permit are the live resume rule's (after any end other than a docked arrival; a newly acting fleet; a
  newly made selection), each labelled uncapped, and scenario 5 pins the label.
- **Carried text.** Each MODIFIED block diffed against live: only the edits design.md lists; no scenario body
  changed but the guard-release GIVEN; no carried sentence is made false (m2 is the one that reads loosely).
- **Live requirements outside the change.** Read *Burn Command Targets...*, *Quote-Locked*, *Burn Commit
  Reports Its Outcome*, *A Commit's Actual Result...*, the predecessor's requirement, and the burn mentions in
  `fleet-roster`, `system-console`, `docked-fleet-actions`: no sentence made false beyond the recorded readings
  (RULINGs 6 and 9). The one other live use of "uncommitted" (`:836`) is covered by the new definition.
- **Existing tier-4 specs.** Every `burn-button` use in `frontend/e2e/` read: none clicks Burn twice on a
  committed selection or asserts a quote on one. `commit-stranding-notice-journey.spec.ts:210` asserts Burn
  enabled only after the row reads Drifting, which is the same read that ends the state.
- **The mocked harness.** `SystemSpaceView.burn-preview.test.tsx` accepts a commit at `:709` and `:844`; each is
  its test's last act, as design.md says.
- **Wire.** Scenarios use only the burn's two instants (served integers, stored and read back unchanged) and
  `strandingWarning`. None asserts the drift notice absent; the quote is named by its six elements.
- **Tier.** Every scenario is observable at the tier its task names; scenario 21 is tier 4 only, which
  `docs/testing-tiers.md` allows ("Playwright, deferred").
- **Fences.** No backend, galaxy view, palette, type scale or fuel arithmetic. The statement and its
  description wire this state only and leave the out-of-chain follow-up's mechanism open. Task 5.5 keeps U2's
  hunks byte-identical; nothing rests on U1-U10 beyond running the journey on the stack as it is.
- **Rulings.** 4, 5, 7, 8, 10 and 11 say what their bases say. RULING 12's basis is m5.

---

## Verdict: NOT CLEAR

Two MAJORs, both repairable in text with no new task: M1 adds three clauses to scenarios 5, 12 and 14;
M2 rewrites task 2.2 and one proposal sentence. No blocker; the order-life derivation holds.

## Orchestrator rulings


All eight findings are confirmed as real (orchestrator, 2026-10-04, under
`--full-auto`; reasoning in `clear-burn-preview-on-commit-rulings.md` RULINGs
13–14). Dispositions, binding on the writer:

- **M1 — ACCEPT.** Apply the repair as stated: one AND each on scenarios 14 and
  5, two rows on scenario 12's WHEN; tasks 3.14, 3.5, 3.12 carry them. No new
  task.
- **M2 — ACCEPT.** Rewrite task 2.2 to carry the two exact-payload assertion
  edits in `SpaceCommandPanel.test.tsx` and to name scenario 13 only; attribute
  scenario 15's panel half to the existing predecessor test; correct the
  proposal's "seven arrangements" sentence. Count stays 40.
- **m1 — ACCEPT.** Scenario 11's point clause gains its positive half; the
  canvas-unavailable sentence gains a clause on an existing scenario (the one
  task 2.1 arranges). No new task.
- **m2 — ACCEPT.** The reworded commit clause names the acting fleet; scenario
  14 pins that B's quote for the same selection survives A's acceptance.
- **m3 — ACCEPT.** State the stop at-or-below-the-floor case.
- **m4 — ACCEPT.** One AND on scenario 4.
- **m5 — ACCEPT.** RULING 12's basis is corrected by RULING 13; tasks.md marks
  3.15, 3.17 and 3.18 as guards expected green before implementation
  (`already-green` in the coverage table), not red tests.
- **m6 — ACCEPT.** "SHALL NOT programmatically move focus".

design.md is the architect's; the writer lists the lines these edits make
stale and the architect brings it current before round 2.

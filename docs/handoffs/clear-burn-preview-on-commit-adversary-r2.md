# Adversary round 2 — `clear-burn-preview-on-commit` (system-HUD chain, link 2a-iii-b)

Change mode, read-only, round 2 of 3. 2026-10-04. Read: the change folder whole (proposal, design, tasks,
delta); round 1 with its dispositions; architect addendum 2; the writer notes (passes 2 and 2b); RULINGs 12-14
and the architect report section RULING 13 cites (`-panel-architect.md:230-259`); the live blocks of the three
MODIFIED requirements; `SpaceCommandPanel.tsx` (`:143`, `:175`, `:332-358`), `SpaceCommandPanel.test.tsx`
(`:764-838`), `SystemSpaceView.tsx` (`:462-471`, `:580-596`) and the view-level harness
(`SystemSpaceView.stranding-notice.test.tsx` fixtures and settling helpers). No stack booted, no suite run.
The one design.md sentence already queued for the architect (Context's list of scenarios that gained clauses)
is not counted.

**Counts: BLOCKER 0 · MAJOR 0 · MINOR 4**

## Round-1 findings verified

| Id | Status | Repaired text (quoted) and where |
| --- | --- | --- |
| M1 | FIXED | Three rows, each in the delta and its task. Same-target re-commit: scenario 5, `spec.md:188` "when the burn committed in that window is accepted, the statement is shown again for the kept selection and no further preview request is sent for it" (task 3.5; a same-key bail-out leaves the stale record, whose gap is closed and whose instants no longer match, so no statement). Warned and unwarned: scenario 12, `:236` "is accepted, in one arrangement with the stranding warning and in another without" (task 3.12, two rows). Per fleet: scenario 14, `:252` "when B's burn order for the kept selection is then accepted and A is made the acting fleet again while the last read reports both orders running, the statement is shown ... for A; and the same holds for B when B is acting" (task 3.14 row one; a single shared record has no entry for A). design.md Decision 2 names the failing build for each. Residue: n3. |
| M2 | FIXED | `tasks.md:10` (2.2): "the two predecessor tests that assert the payload by exact equality (the \"A response that lands after the acting fleet changed belongs to the fleet that committed\" test, and the \"A response without the stranding field shows no notice\" test in its two rows) gain the `selectionKey` field and nothing else"; names scenario 13 only. Both names match the file (`SpaceCommandPanel.test.tsx:764`, `:789-792`). Scenario 15's panel half: tasks header "the predecessor's panel test \"a rejected or failed commit reports nothing\", kept green" (the describe at `:814`), and design.md coverage row 15. `proposal.md:14`: "seven view-level arrangements ... and two panel payload assertions in `SpaceCommandPanel.test.tsx` gaining the `selectionKey` field". Residue in one further place: n4. |
| m1 | FIXED | Scenario 11, `:232`: "when a burn order for a selected point is accepted, the statement is shown and no preview request is sent for that point; and when a different point is then selected, a preview request is sent for it, its burn command is available and no statement is shown". Scenario 1, `:158`: "when the canvas becomes unavailable the statement is still shown and no uncapped-burn label is shown" (task 2.1's canvas leg). The writer's two further instances also landed in the delta: `:157` (success feedback once) and `:287` (statement precedes both notices). |
| m2 | FIXED | MODIFIED block, `:398-399`: "or when a burn order the acting fleet committed for that selection is accepted from this view". Scenario 14's clause is now P1's (below). True for every carried scenario: none of the 20 bodies arranges an accepted commit. |
| m3 | FIXED | `spec.md:39` "a stop above, at or below the speed floor"; `proposal.md:7` the same. |
| m4 | FIXED | Scenario 4, `:179`: "when a read then answers still reporting that burn, with its served world time past 61000, the statement is still shown and no preview request is sent". Residue: n1. |
| m5 | FIXED | RULING 13 Basis: "Precedence 3 — architect A12 and its count section". The source says what the ruling claims (`-panel-architect.md:238-242`: "Two tasks is honest, but it is the one place the number is not the predecessor's unit"), and 45 is that table's 46 less the arrangement A4 removed. tasks header: "except the three marked regression guard: 3.15, 3.17 and 3.18 ... expected green before implementation" and "Section 4 is counted per transformation ..., outside that unit (RULING 13)"; the three tasks carry "(regression guard)". |
| m6 | FIXED | `spec.md:101`: "The view SHALL NOT programmatically move focus at the acceptance, to the statement or anywhere else." design.md Decision 15 quotes it. Residue: n2. |
| P1 | FIXED | Scenario 14, `:249-250`: THEN "while B is acting, a preview is requested for B, B's burn command is available and no statement is shown"; AND "in the second arrangement, B's preview figures stay shown across A's acceptance and no preview request is sent for B at that acceptance". Task 3.14: "this row alone also asserts ... that B's preview request count is unchanged across the answer order (or the preview held on a deferred)". Agrees with Decision 6 (the handler performs no cache operation). |
| P2 | FIXED in tasks.md and design.md | `tasks.md:20`: "the answering read carrying the past-arrival world time on the envelope and on the fleet's own `worldTime` (both dated past 61000)". Arrangeable: `fleetOf` pins `worldTime: W0`, a spread overrides it, and the ETA timer filters candidates not in the future (`SystemSpaceView.tsx:585-589`), so the fixture starts no refetch loop. The scenario still says it in the singular: n1. |
| P3 | FIXED | `tasks.md:46` "(gates 3.1-3.3, 3.9-3.13, 3.16; must stay green 3.15, 3.18)"; `:47` "(gates 3.1-3.14, 3.16, 3.19, 4.1-4.2; must stay green 3.15, 3.17, 3.18)". |
| P4 | FIXED | Scenario 10, `:224`: "when a further read then fails, no statement is shown, the burn command is available and the resumed preview is untouched". Task 3.10's fifth step adds "with no new preview request caused by the failure". An error term in `awaitingRead` re-enters the state on the stale record and fails it. The scenario's last three words are looser than the task: n1. |

**MODIFIED blocks, re-diffed against live.** Headings verbatim in all three (20, 9, 4). Bodies byte-identical
except the guard-release GIVEN. Requirement-text hunks are exactly the eight design.md lists (five in *Burn
Preview Reflects...*, one in *A Failed or Stale Preview...*, two in *Double-Submit*). No carried sentence or
scenario is made false by the reworded commit clause.

## BLOCKER

None.

## MAJOR

None.

## MINOR

### n1 — Two round-1 repairs are exact in tasks.md and loose in the scenario they repair

**Where.** `spec.md:179` (scenario 4): "with its served world time past 61000". `spec.md:224` (scenario 10):
"and the resumed preview is untouched".

**Attack.** tasks.md is discarded at archive and the scenario is what link 4 re-homes the test from. A read
serves a world time in two places the view reads (the envelope, and each fleet's own `worldTime`,
`SystemSpaceView.tsx:470`); a test written from the scenario dates the envelope alone, as the predecessor's
does (`...stranding-notice.test.tsx:954`), and passes a build that ends the state on
`acting.worldTime >= ArriveMs` — the build P2 was raised to fail. "Untouched" names no observable: a build
that refetches the resumed preview on every failed own-fleets read re-shows the same figures from the
auto-resolving mock and satisfies the sentence.

**Repair.** *Principle:* the discriminating observation lives in the scenario, not only in its task.
- `:179`: "**AND** when a read then answers still reporting that burn, with every world time it serves (the
  read's own and the fleet's) past 61000, the statement is still shown and no preview request is sent"
- `:224`: "**AND** when a further read then fails, no statement is shown, the burn command is available, the
  resumed preview's figures are still shown and no preview request is sent at that failure"

No task changes: 3.4 and 3.10 already assert both.

### n2 — The reworded focus prohibition has no check; scenario 21's last AND is asserted nowhere

**Where.** `spec.md:101`: "The view SHALL NOT programmatically move focus at the acceptance, to the statement
or anywhere else." Scenario 21, `:294`: "focus was not moved to the statement by the acceptance".
`tasks.md:60` (7.3), the only task for the scenario: "activate Burn with Enter, press Tab, and assert the
focused element is inside the command column ... and is not the document body".

**Attack.** A build that focuses the statement at the acceptance (`tabIndex={-1}` and a `focus()` call, a
common pattern for explaining a control that just went away) passes 7.3: Tab from the statement skips the
disabled Burn and lands on the same next control. It makes assistive technology read the statement at the
acceptance, which the Silence paragraph forbids and task 3.17 (live-region text only) cannot see. Round 1's m6
read 7.3 as checking the statement; it does not.

**Repair.** *Principle:* a prohibition carries one assertion a breaching build fails. One clause on task 7.3's
keyboard leg, no new task: "... activate Burn with Enter, **assert the focused element is not the statement**,
press Tab, and assert ...". design.md Decision 15's description of the leg gains the same clause.

### n3 — Scenario 14's last AND is unscoped while its task puts it in row one only, under "same closing assertion"

**Where.** `spec.md:252`: "**AND** when B's burn order for the kept selection is then accepted and A is made
the acting fleet again ...". `tasks.md:30` (3.14): "One parametrised arrangement over two rows, same harness
..., same closing assertion (...). Row one: A's commit accepted, then B made acting, then A again; then B's
commit for the kept selection accepted ...".

**Attack.** The AND reads as holding in both arrangements; the task observes it in one, so QA's task 7.2
(the closing assertion for each scenario) finds a clause with no row in arrangement two, while the neighbouring
AND (`:250`) is scoped "in the second arrangement". Row one's walk also commits for B straight after "then A
again" without making B the acting fleet, which the panel cannot do. No wrong build passes: the shared-record
build fails row one as written.

**Repair.** *Principle:* a clause observed in one arrangement says so, as P1's does.
- `:252` begins "**AND** in the first arrangement, when B's burn order ...".
- Task 3.14 row one: "... then A again; then **B made acting and** B's commit for the kept selection accepted
  with both orders reported running, A made acting again and B again: ...".

### n4 — Three sentences outside the delta still describe the pre-repair text

**Where and repair** (each is the exact replacement; none changes a requirement, a scenario or a task):
- `proposal.md:10`: "the commit clause is reworded to a burn order for that selection accepted from this view"
  → "... reworded to a burn order the acting fleet committed for that selection, accepted from this view" (m2).
- `proposal.md:52` (stranding-requirement row): "Seven of its tests are re-arranged, their scenarios unchanged"
  → "Seven of its view-level tests are re-arranged and two of its panel payload assertions gain `selectionKey`,
  their scenarios unchanged" (M2; design.md's row for the same requirement already says this).
- `design.md` Decision 13, Placement: "(scenario 20's fifth AND)" → "(scenario 20's fourth AND)". The fifth is
  the live-region clause.

**Attack.** None reaches a build. M2's repair named the proposal sentence and Impact; the table row is the
second place the same count is stated.

## Spot-checked and held (revised areas only)

- **Each new clause against Decision 6.** Scenario 5's re-commit: the unconditional write gives a fresh
  `readsAtAcceptance`, so `awaitingRead` holds and the pending restoring request is cancelled by the flag
  (Decision 9). Scenario 12, both rows: the handler has no warned branch. Scenario 14's last AND:
  `committedOrders[A]` and `[B]` are separate entries, each `stillRunning` against its own burn in one read.
  Scenario 10's last AND: only an answer moves `dataUpdateCount` or `acting`. Scenario 4's last AND: no term
  reads any world time. No clause contradicts the derivation or another clause.
- **Arrangeable at the named tier.** Two fleets both reported burning has a precedent in the harness (`:776`);
  the success toast is mocked (`:119`); the canvas-unavailable leg and the statement-above-both-notices
  assertion are panel-tier (2.1, 2.3), where the canvas and the stranding notice are props and the drift notice
  comes from a mocked accepted commit; a second point trigger is task 1.1's.
- **Tasks.** 2.2 names real tests; 3.15, 3.17 and 3.18 are consistently guards in the header, section 3,
  5.3/5.4 and design.md's coverage table; 5.4's range no longer lists a guard as gated. Count is 40.
- **design.md.** Decisions 2, 5, 6, 8, 9, 14, 15, both derivation tables and the coverage table agree with the
  delta and tasks as revised, bar n4's one ordinal and the queued Context sentence. Decision 8's line
  references (`:778`, `:802`) match the file.
- **RULING 13 and 14.** Each says what its basis says.

## Verdict: CLEAR

No blocker and no major. Every round-1 finding and P1-P4 is fixed by its principle. What remains is wording
residue (n1-n4): each is repairable exactly as stated above, adds no task, changes no requirement body in a
MODIFIED block and no scenario heading, and needs no further adversary round if applied verbatim.

## Orchestrator rulings


Verdict CLEAR accepted (orchestrator, 2026-10-04, `--full-auto`; RULING 15).
n1–n4 are accepted and applied **exactly as this report states them**, inside
the verdict commit, with no third round: the writer applies n1, n3, n2's task
clause and n4's two proposal sentences; the architect applies n2's mirror in
design.md Decision 15, n4's Decision 13 ordinal, and the already-queued Context
sentence (scenario 10 and addendum 2). No task is added; no MODIFIED body or
scenario heading changes.

**Verdict commit:** `29f0a6b` — the commit containing the change folder with n1–n4 applied. The verdict is current while `git diff 29f0a6b -- openspec/specs/system-space-view openspec/changes/clear-burn-preview-on-commit` is empty.

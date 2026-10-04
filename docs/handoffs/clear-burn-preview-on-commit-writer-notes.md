# clear-burn-preview-on-commit — writer notes (first authoring)

Spec writer's record for the architect and panel. design.md is the architect's and
is not written. Delta: `openspec/changes/clear-burn-preview-on-commit/specs/system-space-view/spec.md`.
Counts: ADDED 1 requirement / 20 scenarios; MODIFIED 3 requirements / 20, 9, 4 scenarios
(53 headings in the file); tasks 40. `openspec validate --strict` and
`harness/openspec-reconcile.py` both clean.

## 1. WORKING TEXT, not ruled — the panel must rule or replace

| Item | Where in the delta | What was authored |
| --- | --- | --- |
| **r2 Q1, failed own-fleets read for the command and the quote** | ADDED requirement, paragraph "A failed read"; scenario "A failed read changes nothing for the quote and the burn command"; task 3.10 | The analyst's recommended option (b): a failed read changes nothing for any of the three consumers (notice, quote, command), stated per consumer in one paragraph. The gap continues; statement shown, command unavailable, quote withheld, fleets-error notice and retry beside it; no no-quote, stale or preview retry. The cost is stated in the text (command withheld for one selection while reads keep failing even if the order ended). Option (a) would add two tasks (r2 § 3 table) and a different "gap" for the command than the predecessor's paragraph. |
| **r2 Q2, statement copy / placement / accessible relation to Burn** | ADDED requirement, paragraph "The statement" | The requirement binds only: shown in the command panel, static, no figure, no countdown, no raw wire text, same text whatever the response and read contain, lifetime = the committed selection's. "Its exact wording is not fixed by this requirement." No string, no position relative to the control, no `aria-describedby` claim, no test id is written anywhere (tasks say "the committed statement element"). UX proposes; the architect names the test id. If UX wants placement or the accessible description bound, the "The statement" paragraph gains a sentence and scenario 20 (or 1) a clause. |
| **r2 Q7, statement beside `canvas-required-notice`** | Nothing | Unstated in the delta. The canvas rule already disables Burn. Left for UX. |
| **RULING 6 (provisional)** | ADDED requirement, paragraph "While it holds"; proposal BREAKING | Precedence sentence for the committed selection only; no delta on "Burn Command Targets…". If the architect reverses, a fourth MODIFIED block with six carried scenarios is added (task count +0 if their bodies stay verbatim). |

## 2. Decisions the inputs did not make for me

1. **Selection identity wording.** "that selection compares equal to the current selection; the view compares its own selection, never the target the order names and never the target the read reports." I did NOT say a point can never be re-selected. `selectionKey` for a point is its coordinates and r2 says a second pointer pick never reproduces them, but whether the keyboard path (`select-pan-target-point`) can reproduce them is unverified. Scenario 11 and 12 therefore use bodies. Architect to confirm and, if wanted, state it.
2. **A fourth row in "A read reporting the order gone"** (departing at 1000, arriving at 90000). The predecessor's mutation pass found a departure-only comparison slipping through; its rows (5000/80000, 5000/61000) both differ in the departure, so they catch an arrival-only comparison but let a **departure-only** one through. The 1000/90000 row (same departure, different arrival) fails a departure-only build. Cost: a row of task 3.7, no task.
3. **The commit's own result surfaces are said, in the requirement, not to be preview elements** ("While it holds" last sentence), so no scenario relies on the drift notice's absence (r2 § 4). Every scenario names the quote's own elements: arrival, delta-v, fuel, fuel ceiling, affordability, stranding line.
4. **The fourth bullet in "Burn Preview Reflects…" is written as a pointer** to the ADDED requirement ("as defined by …, which also states its gap, its end and its lag"), not a restatement, per r2 § 3 ("reference those paragraphs").
5. **"Nothing is withheld merely because a read … is being refreshed"** (live, r2 § 2 flagged it as the sentence an adversary will quote) gained a clause saying the fourth state is withheld because of the acceptance. Same sentence, edited in place; it is a requirement-text edit, not a scenario body.
6. **The jump / mine / cut drive / stop sentence** (RULING 7) is placed in the reworded commit clause of "Burn Preview Reflects…", not only in the ADDED requirement.
7. **Records task 6.3** names only `followup-warned-commit-without-burn-instants.md`, as the brief says. r2 § 6 also listed a note in `followup-explain-withheld-burn-command.md` (the statement being the first stated reason on that control). I left it out because the brief fences that follow-up; if the panel wants the precedent recorded there it is a 41st task or a clause of 6.3.

## 3. Departures from the analysis, and why

| Departure | Why |
| --- | --- |
| r2 § 2 suggested, for "Double-Submit", "a GIVEN … and one new scenario". I added the GIVEN and **no new scenario**. | A new scenario is a 41st task (a panel arrangement). Its content rides on ADDED scenario 1's AND ("the burn command is unavailable although the commit's request has settled") and task 2.1's settled-commit leg. If the adversary wants a scenario inside the MODIFIED block, it costs one task; r2's shedding order (below) is the way back to 40. |
| r2 § 3 scenario 7 had three rows; I made four (see 2.2). | Mutation row, above. |
| r2 § 6 counted "Panel tests 3" as statement/disabled/label, callback selection, copy. Kept as 2.1–2.3. | — |
| The proposal's "Impact" carries a "Live requirements checked" table (the predecessor's proposal did too); r2 § 9 asked for it in design.md. | Duplicated by design is fine; the architect may keep one. |
| The ADDED requirement's name is r2's suggested one, verbatim. | — |

## 4. Carried scenario bodies edited (reconcile table)

Every scenario heading of the three MODIFIED requirements is carried verbatim, and every
body is byte-identical except the one row below (checked by building the delta
programmatically from the live file with asserted single-occurrence replacements, then a
line diff; the architect can reproduce it by diffing each live block against the delta's).

| Requirement | Scenario | Before | After |
| --- | --- | --- | --- |
| Burn and Jump Commit Controls Guard Against Double-Submit | The guard releases when the request settles or fails | `- **WHEN** a burn or jump commit settles or fails and the player then initiates a new command` / `- **THEN** the guard has been released and the new attempt submits normally` | Same two lines, preceded by `- **GIVEN** no other requirement makes the command unavailable for the selection` |

Requirement **text** (not scenario) edits, for the architect's table:

| Requirement | Edit |
| --- | --- |
| Burn Preview Reflects… | "none of the three" → "none of the four withheld states"; "any of three" → "any of four"; a fourth bullet pointing at the ADDED requirement; "The withheld states change … not whether the burn command is available" scoped to "The first three", plus a sentence that the fourth makes it unavailable with precedence over the uniform-targets requirement; "Nothing is withheld merely because a read … is refreshed" extended; "the selection is uncommitted … or when an order commits" → "is not the committed selection … or when a burn order for that selection is accepted from this view …" with the jump/mine/cut/stop sentence |
| A Failed or Stale Preview… | The closed list of four unavailable states gains "or because the selection is the committed selection"; "governed, unchanged, by the requirements that already cover each of them" → first four unchanged, fifth by the ADDED requirement. Scenarios at the live 794 and 801 are byte-identical (they are GIVEN/WHEN lists, true as written); the ADDED requirement covers the fifth state. |
| Burn and Jump Commit Controls… | New paragraph: the guard's release is not the control's return to availability; a failed commit creates no committed state. The live "SHALL each be disabled from the moment of commit" sentence is carried verbatim (r2 § 2: the code has no in-flight term in `disabled`; recorded in the fenced follow-up, expect the adversary to raise it). |

Scenario bodies left byte-identical that enumerate three withheld states (live 686 "A resumed
preview presents nothing…", 703 "No path sends a preview request while one is withheld",
794 "A withheld preview is never presented as a failed one") and the four-item
unavailable list (801): true as written; the fourth state's resume and no-request
behaviour is covered by ADDED scenarios 5-7 and 1-4, as r2 recommended.

## 5. Task count and shedding

40 tasks (1 harness, 3 panel, 19 view, 2 repairs, 5 implementation, 3 records, 7 validation).
Counted by arrangement group, per the predecessor's RULING 12. Counted by arrangement, the
two repair tasks are seven re-arranged tests, and the 20 ADDED scenarios are 27 arrangements-with-rows
(scenarios 6, 7, 14, 15, 18 parametrised) — the cap is met by the unit, not by slack, and any
task the panel adds goes over. r2 § 6 shedding order if it does, none taken: scenario 16
(task 3.16), then scenario 18's remount row (task 3.18 keeps the already-burning row), then
scenario 9 (task 3.9). That is three tasks of room.

## 6. Unresolved / for the panel and architect

- The four items of table 1.
- **r2 Q3** (Double-Submit MODIFIED vs a recorded reading): authored as MODIFIED, as presumed. The architect confirms.
- **r2 Q4** (what the handler stores when the own-fleets query has no state): an implementation matter, not in the spec text. Task 5.3 does not decide it. With the widened record any accepted commit in a harness that mocks `useMyFleets` holds the committed state forever (r2 § 1.7); task 1.1 forbids such a harness for section 3 but `SystemSpaceView.burn-preview.test.tsx` keeps one and commits at `:709` and `:843-845`. Architect: store `null` when there is no query state, or record the trap.
- **r2 Q5** (the predecessor's "does not remove, disable or re-order the burn command control"): authored as the recorded reading plus one sentence in the ADDED requirement ("While it holds"); no delta to the predecessor's 25-scenario requirement. Scenario 19 shows both together.
- **r2 Q6** (response lacking a burn instant): unspecified; the proposal's out-of-scope names it; task 6.3 records the second consumer.
- **N1-N4** need a stack run or the design canvas (Artifact read) and are the journey's observations (task 7.3 logs the drift notice, does not assert figures after the cut drive).
- The statement's presence beside a disabled Burn after a **warned** commit means the panel shows notice, statement and (by code reading) the drift notice at once: UX should look at the stack of three.
- The failed-read rule's cost (command withheld while reads fail) is stated in the requirement text; the architect may wish to move that sentence to design.md Risks and leave the requirement bare.

## Revision pass 1 (2026-10-04) — panel dispositions applied

Source of dispositions: `clear-burn-preview-on-commit-panel-consolidated.md`; text from the three panel reports. Files edited: proposal.md, tasks.md, `specs/system-space-view/spec.md`, this file. design.md untouched. Counts after the pass: ADDED 1 requirement / 21 scenarios; MODIFIED 20, 9, 4 scenarios (unchanged); tasks 40 (no 41st needed). `openspec validate --strict` and `harness/openspec-reconcile.py` clean.

### Finding id -> where it landed

| Id | Landed |
| --- | --- |
| A1 | Delta ADDED "While it holds" (second sentence now names the stranding requirement); delta MODIFIED *Burn Preview Reflects…* fourth-state sentence ("as *A Burn Order Committed From This View … Last Read* states") |
| A2 | Delta scenario "Another target is previewed and committable…" gains the point AND; tasks 1.1 (second point trigger) and 3.11 (second row) |
| A3 | Delta ADDED "Whose and which", last sentence |
| A4 | Landing-announcement AND moved from "The committed selection is silent" to "Arrival at the selected body…"; task 3.8 gains it, task 3.17 loses its second arrangement |
| A5 | Task 2.1's settled-commit leg and its mention of the edited guard-release scenario deleted; header now says "tasks 3.1 and 3.12" |
| A6 | Task 7.1 (mocked-harness clause and `undefined` handler) and task 6.2 ("the mocked-harness trap") |
| A7 | RECORD ONLY, nothing applied |
| A8 | Task 6.2 (link 2b clause) |
| A9 | Delta "The statement": "the same for a body, a lane gate and a point"; names in tasks header, 5.1 (`selectionKey`), 5.2 (`selectionCommitted`, `data-testid="selection-committed-statement"`). The copy is F1's, not the architect's default |
| A10 | RECORD ONLY, nothing applied |
| A11 | Task 7.3 clause (no wall-time bound on arrival detection) |
| A12 | RULED (RULING 12); no text |
| F1 | Delta "The statement" paragraph replaced per F1 (placement before Burn, says unavailable, says select another target, no target identifier); scenario "The statement carries no figure and no wire text" gains two ANDs; task 2.3. The string is design.md's constant, not in the spec |
| F2 | Delta scenario 1 gains the accessible-description AND; tasks 2.1 and 5.2 (`aria-describedby`). No sentence was added to the requirement text, as the dispositions give only the AND |
| F3 | Delta "Focus" paragraph after "Not a dead end"; scenario "Keyboard focus survives the burn command becoming unavailable" (no tier-1 task; tasks header marks it covered by the journey keyboard leg in 7.3, which carries the leg) |
| F4 | Delta "Silence" last sentence; AND on "The statement carries no figure…" (the panel-structural arrangement, task 2.3) |
| F5 | Delta "While it holds", last sentence; clause on task 2.1 (canvas-unavailable leg) |
| F6 | Task 6.3 clause (dated note in `followup-explain-withheld-burn-command.md`) |
| S1 | Delta "Only this view's commits", appended sentence |
| S-note | Delta scenario "Cutting the drive ends the committed selection" gains the uncapped-label AND; task 3.5 clause |
| Failed-read wording (RULING 8, A architect 1.4) | Delta "A failed read", first sentence reworded |

Proposal: scenario count 20 -> 21, RULING 6 "confirmed", RULING 8 and 10 recorded in place of "Open items", note on the follow-up added to Records.

### Unapplied

Nothing that was marked ACCEPT. One judgement call: F2's paste text is a scenario AND only; the requirement body has no SHALL for the accessible description. I did not add one (not in the paste or dispositions). The adversary may ask for it.

### Edited-bodies table (replaces section 4 of the first-authoring notes)

Diffed each MODIFIED block against the live block after editing: every scenario heading is verbatim in all three (20, 9, 4), and every scenario body is byte-identical except "The guard releases when the request settles or fails" (the added GIVEN, as before). Requirement-text edits are as section 4 listed; this pass changed only one line in the MODIFIED blocks (the A1 cross-reference in *Burn Preview Reflects…*). All other changes of this pass are in the ADDED block.

### design.md lines now stale (for the architect; not edited)

- Decision 7 heading (line ~68): "working text, option (b); awaits a ruling" — ruled (RULING 8).
- Open Questions 1 (line ~171): ruled, option (b).
- Open Questions 2 (line ~172): copy default "An order is committed to this target." is superseded by UX F1's copy "A burn order is committed to this target, so Burn is unavailable for it. Select another target to change course."; placement and `aria-describedby` are now spec (the delta pins both).
- Open Questions 3 (line ~173): the spec now says the statement is shown whether or not the canvas is available (F5).
- Derivations table (line ~141): "a non-body kind only if finding A2 is applied" — A2 is applied (3.11 second row).
- Line ~84 (panel paragraph): add the `aria-describedby` wiring, and the statement text "no live region" is already consistent. Also a new row for the focus scenario (journey keyboard leg in 7.3, no tier-1 test) and for 3.8's landing-announcement assertion if the table lists announcement coverage.
- Task and scenario numbering cited in the tables is unchanged (task count 40; 3.17 lost an arrangement, 3.8 gained one).

## Revision pass 1b (2026-10-04)

Applied the architect addendum's AA1-AA3 (all accepted). No MODIFIED block touched, no task added (count stays 40), design.md not edited.

- **AA1** (`specs/system-space-view/spec.md`): the Focus paragraph and the scenario "Keyboard focus survives the burn command becoming unavailable" now say "the command column's order (the command panel's next control when it has one, otherwise the first focusable element after the panel)", restoring UX F3's "otherwise". `tasks.md` task 7.3's keyboard leg carries the same parenthetical, consistent with design.md Decision 15.
- **AA2** (`specs/system-space-view/spec.md`, "The statement" paragraph): added the SHALL that while the statement is shown the burn command control references it as its accessible description, and SHALL NOT reference it otherwise. Scenario 1's last AND already asserts it.
- **AA3** (`proposal.md`, Impact): replaced "the three carried-body edits" with "one carried scenario body edited, the guard-release GIVEN, and requirement-text edits in the three".

## Revision pass 2 (adversary r1) (2026-10-04)

All eight findings applied as ruled (RULINGs 13, 14). No task added (count 40). design.md not edited. Scenario counts unchanged: ADDED 21; MODIFIED 20 / 9 / 4 (33).

### Finding -> place

| Finding | Landed |
| --- | --- |
| M1 | Delta scenario 5 ("Cutting the drive ends the committed selection") gains the resume-window AND (re-commit accepted: statement shown again, no further preview request); scenario 12 WHEN now two arrangements (with and without the stranding warning); scenario 14 gains the AND for B's commit with both orders running (A and B each). Tasks 3.5, 3.12 (two rows), 3.14 (row one extended) carry them. |
| M2 | Task 2.2 rewritten: reports the click-time selection and the two predecessor exact-equality tests ("A response that lands after the acting fleet changed...", and "A response without the stranding field shows no notice" in two rows) gain `selectionKey`; names scenario 13 only. Tasks header attributes scenario 15's panel half to the predecessor test "a rejected or failed commit reports nothing". proposal.md "What Changes" test-work bullet now says seven view-level arrangements and two panel payload assertions. |
| m1 | Scenario 11 point AND now carries both halves (commit toward a point: statement, no request; different point: request, available, no statement). Scenario 1 gains the canvas-unavailable AND (leg of task 2.1; cross-referenced in task 3.1). |
| m2 | MODIFIED *Burn Preview Reflects...* clear clause: "a burn order the acting fleet committed for that selection is accepted from this view". Scenario 14 THEN: "B's preview figures stay shown across A's acceptance". Task 3.14 mirrors it. |
| m3 | ADDED requirement "The order's life": "a stop above, at or below the speed floor"; proposal.md What Changes bullet. Scenario title kept. |
| m4 | Scenario 4 gains the AND (read answering the burn with served world time past 61000: still shown, no preview request); task 3.4 extended. |
| m5 | tasks.md header: 3.15, 3.17, 3.18 marked "(regression guard)" and stated expected green before implementation; section 4 stated as counted per transformation outside the arrangement-group unit (RULING 13). |
| m6 | Focus paragraph: "The view SHALL NOT programmatically move focus at the acceptance, to the statement or anywhere else." Scenario 21 unchanged (Tab outcome stays the observable). |

### Further instances found and fixed (same principle)

- "Above the stranding notice and the drift notice" (statement paragraph) had no row. Scenario "The statement carries no figure and no wire text" gains "when the stranding notice and the drift notice are also shown, the statement precedes both"; task 2.3 carries it (warned commit rendered, then prop true).
- "The commit's own result surfaces ... neither removed nor suppressed" had a row for the stranding notice only (scenario "One order, two consumers"). Scenario 1 gains "the commit's success feedback is given once and is not suppressed"; task 3.1 carries it (the view harness mocks the success toast).

### Noted, not applied

- The drift notice's non-suppression has no row: the proposal records that it renders after every real commit by code reading only, and the journey logs it rather than asserts it; a scenario row would assert an unproven precondition. Left to the architect/orchestrator.
- "A read that fails after the gap has ended leaves the last answer ... standing" is tested with the order still running (scenario 10), not with the order already ended and the quote resumed; a row needs an arrangement no existing task has. Left unapplied; raise if the adversary wants it.
- "The cut drive and stop commands are unaffected" has no dedicated row; scenarios 5 and 6 drive both commands through the real fleet panel while the statement is shown, which is the observable.

### design.md statements now stale (architect)

- Any coverage-table row or text giving scenario 5, 12, 14, 4, 11, 1 or 20 row counts or arrangements (rows added: 5 +1 AND, 12 +1 row, 14 +1 AND and a THEN clause, 4 +1 AND, 11 point clause now two-sided, 1 +2 ANDs, 20 +1 AND).
- Coverage row for scenario 13 (task 2.2 now names it alone) and row for scenario 15 (panel half now the predecessor test, kept green; view half is guard 3.15).
- Coverage rows for 3.15, 3.17, 3.18: status `already-green` (guard), not red.
- Task-count/task-description text for 2.2, 2.3, 3.1, 3.4, 3.5, 3.12, 3.14; the "seven arrangements" wording wherever it appears, and Decision 15's focus statement (now "SHALL NOT programmatically move focus").
- Decision 6's note on the clear clause if it quotes the old "when a burn order for that selection is accepted" wording (now "the acting fleet committed").
- Any statement of the RULING 12 basis (re-based by RULING 13).

## Revision pass 2b (2026-10-04)

Applies architect addendum 2 (P1-P4). No MODIFIED block touched; task count stays 40.

| Finding | Landed |
| --- | --- |
| P1 | Delta scenario 14 (`The committed selection follows the fleet`): the THEN is split. First THEN keeps "while B is acting, a preview is requested for B, B's burn command is available and no statement is shown"; new AND scoped to the second arrangement: "B's preview figures stay shown across A's acceptance and no preview request is sent for B at that acceptance". Task 3.14: the closing assertion drops the across-acceptance clause; row two alone asserts figures stay shown and B's preview request count unchanged across the answer order (or held on a deferred). |
| P2 | Task 3.4: the answering read carries the past-arrival world time on the envelope and on the fleet's own `worldTime`. Scenario 4 unchanged (already says "its served world time"). |
| P3 | Tasks 5.3 and 5.4: guards 3.15, 3.18 (5.3) and 3.15, 3.17, 3.18 (5.4) moved out of "gates" into "must stay green"; 5.4's range 3.1-3.19 rewritten as 3.1-3.14, 3.16, 3.19. |
| P4 | Delta scenario 10 gains a final AND: "when a further read then fails, no statement is shown, the burn command is available and the resumed preview is untouched". Task 3.10 gains the fifth step (further read rejected: no statement, control available, resumed preview untouched, no new preview request caused by the failure). The requirement body already says "A read that fails after the gap has ended leaves the last answer ... standing", so no body edit. |

### design.md statements now stale (architect)

- Coverage row for scenario 10 / task 3.10: gains the fifth step (a failed read after the gap ended).
- Coverage row for scenario 14 / task 3.14: the across-acceptance clause is now row-two-only and adds the unchanged request count; the "3.14 row two" cell of the failed-cache-drop table (line ~168) should name the request-count observation.
- Scenario 4 / task 3.4 row: the answering read is dated on the envelope and on the fleet (the Decision 5 text already says both; the coverage row does not).
- Any "gates" listing for 5.3/5.4 that mirrors the tasks' guard placement.

## Revision pass 3 (adversary r2 residue) (2026-10-04)

Applies adversary r2 n1, n3, n2's task clause and n4's two proposal sentences, each verbatim from the report (RULING 15). No MODIFIED block touched, no task added (count stays 40), design.md untouched (architect's).

| Finding | Landed |
| --- | --- |
| n1 | Delta scenario 4 last AND: "with every world time it serves (the read's own and the fleet's) past 61000". Scenario 10 last AND: "the resumed preview's figures are still shown and no preview request is sent at that failure". |
| n3 | Delta scenario 14 last AND begins "in the first arrangement, when B's burn order ..."; task 3.14 row one: "then A again; then B made acting and B's commit ... accepted with both orders reported running, A made acting again and B again". |
| n2 | Task 7.3 keyboard leg: "activate Burn with Enter, assert the focused element is not the statement, press Tab, and assert ...". design.md Decision 15 mirror is the architect's. |
| n4 | proposal.md What Changes: "reworded to a burn order the acting fleet committed for that selection, accepted from this view"; stranding-requirement row: "Seven of its view-level tests are re-arranged and two of its panel payload assertions gain `selectionKey`, their scenarios unchanged". Decision 13 ordinal is the architect's. |

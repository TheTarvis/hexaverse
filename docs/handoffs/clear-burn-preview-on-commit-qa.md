# clear-burn-preview-on-commit — QA verification (Verify phase, tier 1, no stack)

QA, 2026-10-04. Built at `62c8f15`. Evidence: `SpaceCommandPanel.test.tsx` (panel, "P:") and `SystemSpaceView.stranding-notice.test.tsx` (view, "V:", describe `the committed selection`, line ranges below).
Run: `cd frontend && npx vitest run components/space/SpaceCommandPanel.test.tsx components/space/SystemSpaceView.stranding-notice.test.tsx components/space/SystemSpaceView.burn-preview.test.tsx` -> 3 files, 154 tests, all green.
Code read: `git diff 987ba60 62c8f15 -- frontend` (SpaceCommandPanel.tsx, SystemSpaceView.tsx). Nothing booted, nothing edited, nothing staged.

## Summary

| Block | PASS | FAIL | BLOCKED | INSPECTED |
| --- | --- | --- | --- | --- |
| ADDED requirement, 21 scenarios | 20 | 0 | 1 (#21 focus) | 0 whole-row (2 clauses INSPECTED inside #20 and #1, see below) |
| MODIFIED x3, 33 scenarios (20 + 9 + 4) | 33 (carried; edited clauses by V 3.1/3.5/3.8/3.12 + P 2.1) | 0 | 0 | 0 |

Requirement-level clauses outside any scenario: real-wire instants equality = BLOCKED (journey); "reload mid-burn returns the quote" = PASS at tier 1 by remount (V 3.18 b), real reload awaits journey.

## ADDED requirement matrix (scenario -> clause -> assertion -> verdict)

V line numbers are in `SystemSpaceView.stranding-notice.test.tsx`; `expectCommitted` (V:1125-1134) = statement present, copy equals the local literal, Burn disabled (or the inverse).
`quoteGone` (V:435) checks all six ids: preview-arrival, -deltav, -fuel, -fuel-ceiling, -affordable, -stranding.

| # | Scenario / clause | Assertion | Verdict |
| --- | --- | --- | --- |
| 1 | no preview elements | V:1156 `quoteGone()` | PASS |
| 1 | statement shown, selection unchanged | V:1157, 1158 | PASS |
| 1 | Burn unavailable after request settled; no uncapped/no-quote/stale/retry | V:1157 (disabled), 1159 `noQuoteStates()==[]` | PASS |
| 1 | no preview request over two intervals and a baseline poll | V:1151 (poll proven: `listMineCalls` grew), 1153, 1160 `P` unchanged | PASS |
| 1 | activating Burn sends no order | V:1161-1162 (orderCalls stays 1); P:~2.1a `order.mutate` not called | PASS |
| 1 | aria-describedby = statement, absent when removed | P 2.1a: `described === stmt.id`, element lookup, absent on false/omitted legs (view only passes the prop; no view-level assertion) | PASS (panel arm) |
| 1 | success feedback once | V:1163 `toast.success` x1 | PASS |
| 1 | canvas unavailable: statement shown, no uncapped label | P 2.1b | PASS (panel arm) |
| 2 | gap before any read answers: no elements, statement, Burn off, no order, no preview request | V 3.2 (1168-1178); GIVEN read unanswered V:1171 | PASS |
| 3 | earlier read answers parked: unchanged, statement, no request; first post-acceptance read answers burn: still shown | V 3.3 (1182-1203), DOM identical V:1195 | PASS |
| 4 | clock passes 61000, no read: statement, Burn off, no request | V:1217-1218 (world-clock GIVEN 1211) | PASS |
| 4 | read still reporting, times past 61000: statement, no request | V:1220-1222 (`datedAt` 99_999) | PASS |
| 5 | cut: statement removed, Burn available; one request at that answer | V:1241-1242 (`P`==2, pending 1) | PASS |
| 5 | pending: no figure/ceiling/stale; uncapped label shown; burn in window has no maxFuelTons | V:1244-1246, 1250 | PASS |
| 5 | second accept: statement again, no further request | V:1252-1253 | PASS |
| 6 | stop, both arrangements: removed, available, one request | V 3.6 it.each (1259-1275), asserts `P`==2 | PASS |
| 7 | four arrangements: removed, available, one request; point-park: no figure asserted | V 3.7 it.each (1279-1295); `P` is 1 before the answer (1290), 2 after | PASS |
| 8 | arrival at the selected body: statement removed, no request, Burn/label as docked, landing announced once | V 3.8 (1299-1319); docked reference measured in the same file, announcer text asserted verbatim | PASS (Burn/label asserted equal to a measured docked reference, not to a literal; adequate, the spec says "as the docked state leaves them") |
| 9 | settled inside round trip: shown until read, removed, no request | V 3.9 (1323-1330) | PASS |
| 10 | five-step failed-read walk (statement, fleets-error + retry, no no-quote, no request; later reads; drifting ends it; failure after the end leaves figures) | V 3.10 (1334-1376), each step `expectCommitted`, steps (4) `P`==2 and deltav, (5) `P` unchanged | PASS |
| 11 | other body previewed, committed body re-selected stays committed; points | V 3.11 (1380-1403) | PASS |
| 12 | second commit moves it (warned / unwarned); X again previewed incl. while read still reports first order | V 3.12 it.each (1407-1429): `P(HOST)`==1, `P(OTHER)`==2 | PASS |
| 13 | response after selection replaced | V 3.13 (1433-1450) | PASS |
| 14 | follows the fleet, both arrangements incl. B's preview not re-requested at A's acceptance | V 3.14 (1457-1520); `P(fleet_b)` held at 1511, `pb` held 1487-1495 | PASS |
| 15 | rejected/failed: no statement, Burn available; cap: fresh preview and figures | V 3.15 (1524-1550), three rows (one SDET-added) | PASS |
| 16 | rejected commit leaves earlier selection alone | V 3.16 (1554-1563) | PASS |
| 17 | live-region text identical before/after/after cut | V 3.17 (1567-1582) | PASS |
| 18 | not committed by this view: opened on burn; remount | V 3.18 (1586-1607) | PASS |
| 19 | warned: both shown; other body: notice stays, statement goes; unwarned: statement, no notice, before any read | V 3.19 (1611-1627); read pending asserted V:1622 | PASS |
| 20 | no digit, static copy, says unavailable and select another target | P 2.3a (all three target kinds): exact copy, `\d` absent, regexes, no body id | PASS |
| 20 | same whatever response/read contain | P 2.3b | PASS (tautological: the copy is a module constant; fine, nothing to vary) |
| 20 | follows selection line, precedes Burn | P 2.3a `compareDocumentPosition` both | PASS ("immediately before" is not asserted; DOM read: statement is the last element before the Button, INSPECTED) |
| 20 | precedes stranding and drift notices | P 2.3c | PASS (code read: both notices render after the Button) |
| 20 | no live-region role/attribute, no ancestor with one | P 2.3a `closest(live)==null` in the panel render only | PASS for the node; ancestor chain in the real view INSPECTED (`SystemSpaceView.tsx:809` announcer is a separate sr-only sibling span; no other aria-live in either file) |
| 21 | focus survives Burn becoming unavailable; no programmatic focus move | none at tier 1 (jsdom cannot model the browser's disabled-control focus fix-up). Code read: no `.focus()` call added | BLOCKED-awaiting-journey |

## MODIFIED requirements

Carried by the existing suites, which stay green (see the run above); the three edited clauses are covered by new rows:
- Preview requirement, fourth withheld state, clear-on-accept, resume-at-transition, cadence: V 3.1, 3.2, 3.5 (resume: request at the answer, no figure, no stale, no cap), 3.7, 3.10. PASS.
- Failed/stale requirement, "label never beside a committed Burn": P 2.1a (label absent when committed, present on false/omitted), V 3.1 (`noQuoteStates` includes the label), 3.5 (label present while the post-cut request is pending), 3.8. PASS.
- Double-submit requirement, "guard release is not the control's return to availability": V 3.1 (Burn stays disabled after settle, no order), 3.12 (a new command on another selection submits). PASS. Existing double-click/same-tick tests unchanged and green.

## Under-asserted clauses (none rise to FAIL)

1. Cadence after resume: the MODIFIED text "exactly one fresh preview request per elapsed interval while shown and the selection is not the committed selection" is checked only by the unedited burn-preview suite on a never-committed selection. No test advances intervals after a committed selection ends (V 3.5/3.7/3.10 stop at the single resume request). Mitigated: `use-burn-preview` is generic over the flag. Low.
2. Scenario 20 "no ancestor with a live region" is asserted in the panel in isolation; in the view it is code-read only (the announcer is a sibling). Low.
3. Scenario 1 aria-describedby and the canvas-unavailable clause are asserted on the panel with a hand-set `selectionCommitted`, not through the view. Wiring is one prop (`SystemSpaceView.tsx` `selectionCommitted={selectionCommitted}`); no view-level assertion. Low.
4. Scenario 8 compares Burn/label to a measured docked state rather than a literal. Adequate.
5. Scenario 17 holds even if r0 is the empty string (equality of values, not of a non-empty announcement); the SDET showed a handler calling `setAnnouncement` turns it red (coverage table, guard 3.17). Adequate.
6. 3.14 row one does not assert B's count was 2 (SDET deviation 2). Only that it does not move. Adequate.

No clause asserts only "two things differ".

## BLOCKED rows and the journey assertion that closes each
(`frontend/e2e/tests/committed-selection-journey.spec.ts`)

1. Scenario 21 (keyboard focus). With a parked fleet and a selected body, focus `[data-testid=burn-button]`, press Enter, wait for the order response and the first `/v1/fleets` read after it, then assert `document.activeElement` is not `document.body`, is not `[data-testid=selection-committed-statement]` and never was (record `document.activeElement` immediately at acceptance); press Tab once and assert the new `activeElement` is the next focusable element after the burn button in command-column order (the first control after the panel's Burn, i.e. the first fleet-panel control, whichever the DOM gives), not the document start. If Chromium drops focus to body on the disabled button, this is the assertion that goes red and returns it to dev.
2. Real-wire instants equality (requirement text "The order's life", coverage table deferral). After a real burn commit, wait for the first own-fleets response requested at or after the acceptance (wait on the `GET /v1/fleets` network response), then assert `selection-committed-statement` is still visible, `burn-button` is disabled, and no `POST .../orders/preview` request was observed after the acceptance. This is the line that fails if the server's `DepartMs`/`ArriveMs` on the order response differ from the read's (the record then ends at the first read: statement gone, preview re-requested).
3. Real end of the order. Cut the drive from the fleet panel; assert the statement is removed, `burn-button` enabled, and exactly one preview request is sent after the refreshed read. (Optional: arrival at the target removes it with no preview request; needs the fast clock.)
4. Reload mid-burn ("Only this view's commits"). After the commit, `page.reload()`, re-select the target, assert no statement, `burn-button` enabled, a preview request sent.
5. Record only (not assert): whether `commit-drift-notice` renders after a real commit (see Exploratory 2). The journey should observe it so the drift handoff gets its stack observation.

## Exploratory pass (code reading)

1. Stranding notice interaction. `CommittedOrder` generalises `WarnedOrder` with `warned`; one `orderLive` determination feeds both consumers (`SystemSpaceView.tsx` ~773-787), `commitStrandingNotice = orderLive && order.warned`. An unwarned later commit now writes a record (previously it deleted the warned one), which replaces the warned record, so the notice goes at that acceptance exactly as before (V predecessor 3.13 green, V 3.19 third clause). The notice stays on other selections, the statement goes (V 3.19). No regression found.
2. Drift notice. Per `drift-commit-response-carries-no-delta-v.md`, the real order response has no `DeltaV`, so `commit-drift-notice` renders after every real commit (unverified on a stack). With this change a real commit now stacks three lines under the quote slot: statement, stranding (if warned), drift. The statement is placed above both, as required, and the diff does not make the drift defect worse, but the player's first view after every commit is now a spurious "committed at delta-v —" line under an otherwise clean panel. Not a scenario failure; flag for the drift owner (link 4). Also: the drift notice is panel-local state and is not tied to the committed selection, so it survives selection changes (pre-existing).
3. Fail direction when instants are missing. If the order response lacked `DepartMs`/`ArriveMs` (the panel sends null), `stillRunning` is never true and the record lasts only until the first post-acceptance read. That ends toward "previewed and committable" (the resume path, uncapped label), never toward an uncapped command on a failed read, so the safe direction. Tier 1 cannot say which the real wire does (blocked row 2).
4. `committedOrders` records are never pruned (per-fleet, one entry each; replaced on the next accept). An ended record cannot revive because `awaitingRead` needs an unchanged read count and `stillRunning` needs identical instants. Negligible.
5. `commitBurn` has no `selectionCommitted` check of its own; Burn is blocked solely by the native `disabled` (as with `mineRunning` before). The guard is released in `onSuccess` before `onCommitAccepted`; both run in the same tick so React batches the disable. No double-submit window found by reading.
6. Unrequested by any scenario: `useId` for the statement id and the `data-testid`; the 'selection-committed-statement' testid and exact copy (spec: wording not fixed; tests pin it by a local literal, so a copy tweak will need a test edit); the record now also stores `selectionKey` and `warned`. All support scenarios 1/20. Nothing else added. `use-fleets.ts` untouched.
7. Spec gap: the spec is silent on whether Escape/click-away clearing the selection while committed changes anything (selection change simply ends the in-force test; consistent). Nothing to file.

## Verdict

0 FAIL. 1 BLOCKED scenario (#21) plus one blocked requirement clause (wire instants), both closed by the journey assertions above.

**SHIP-PENDING-JOURNEY**

## Journey closure (2026-10-05)

QA, from evidence on disk only; nothing run, nothing edited but this file. Sources: `clear-burn-preview-on-commit-journey.md` (whole), the committed journey spec (keyboard-focus leg lines 588-609, committed-render-hold 611-702, cut/arrive legs ~760-890), raw log `gate3-t4.log` lines 100-126, `fix-burn-order-geometry-refusals-journey.md`, scenario text (system-space-view delta, "Keyboard focus survives..." line 290-294, Focus paragraph 96-101), design.md Decision 15. Rulings 17, 19, USER RULING 20 noted: the gate itself is NOT PASSED (RULING 19) on three tier 4 reds that are not this change's; that is the orchestrator's decision and is not re-judged here.

Gate facts this closure rests on: tier 4 rerun 24 passed / 3 failed; this change's journey PASSED (27.8 s); tier 3 green (1875 tests, exit 0). Corroboration: the later independent full run (`fix-burn-order-geometry-refusals-journey.md`) is 28 passed / 0 failed on a tree containing this change's code and spec; it does not print this journey's leg summary, so it corroborates "the journey did not go red on that tree", not any leg.

### Previously BLOCKED rows

1. **Scenario 21, keyboard focus: CLOSED-PASS, with one clause asserted more weakly than the scenario states (see weak clauses).**
   - Assertion: `[journey-keyboard]` leg, spec 588-609. GIVEN asserted (line 536-540: Burn is the active element before Enter; Enter pressed, not click). Then: after acceptance `isStatement` false (595); one Tab; `isBody` false (599-603), `insideColumn` true (604-607), `isStatement` false (608).
   - Log: after acceptance `tag BODY, isStatement false, burnDisabled true, statementPresent true`; after Tab `BUTTON fleet-cmd-cut-drive-fleet_fafd1ed5-..., isBody false, insideColumn true`. Summary: `keyboard-focus: PASSED`.
   - Clause by clause. "Focus was not moved to the statement by the acceptance": asserted, passed. "Tab does not go to the start of the document": asserted as not-body and inside-the-column, passed; a Tab from a document-start point would not plausibly land on a column control, so this discriminates, but see below. "Tab moves to the next focusable element after the burn control in column order": NOT asserted by identity. The leg checks "some element inside the column", not "the first control after Burn". The landing element is a fleet-panel control, consistent with Decision 15's stated leg (assert the column, not the panel), but I did not verify from the DOM that cut-drive is the first focusable after Burn. This is the clause passed more weakly than stated.
   - My own earlier row asked that `activeElement` after acceptance not be `body`. It WAS `BODY`. Decision 15 (adversary m6 rewording) says the engine's own fix-up reporting body before the Tab is not a breach, and the scenario THEN does not require otherwise, so I withdraw that sub-assertion as stronger than the spec. It is recorded here plainly: focus is dropped to body and recoverable in one Tab, not retained on the control. The scenario text ("survives ... not lost to the start of the document" decided by where Tab goes) is met; a reader expecting focus to remain on the control is not served, and that is a product-copy question for the spec owner, not a failure.
2. **Real-wire burn-instants equality: CLOSED-PASS.**
   - Assertion: committed-render-hold, spec 656-686: first own-fleets read at or after acceptance must report the burn (`readBurn` not null), and every sampler snapshot from first statement to read-end+250 ms must have statement present with exact copy, Burn disabled, aria-describedby = statement id, figures/uncapped/no-quote/stale all 0.
   - Log: `commit response [119609206725,119609233838] vs first read [119609206725,119609233838]`, identical. `committed-render-hold: PASSED`. Read spanned +1..+77 ms after acceptance; 6 snapshots before the read all held.
   - Thin: only 3 snapshots post-date the read (the leg demands at least one; the hold is asserted only to read+250 ms, not across later reads). The equality itself is directly printed and equal, so the row's THEN (record not ended by the first read) is observed. Later-read hold stays covered by tier 1 (V 3.3, 3.10).

### Rows I wanted observed

- **Real end of the order, cut: observed.** `cut-the-drive: PASSED`. Asserts statement removed (23), Burn enabled (24), a preview request for the kept selection sent within an interval (26-30), none between acceptance and cut. Log: after cut figures=1, no-quote=0, uncapped-label=0, stale=0. Weaker than my row: "exactly one request at the answer" is asserted as "at least one, none while committed", not a count of one; exactly-one stays on tier 1 (V 3.5/3.6).
- **Real end of the order, arrival: observed.** `arrive-and-dock: PASSED`: statement gone, row no longer "under way", no quote elements, no preview POST over one interval from docked. Log: row Docked, burn enabled, uncapped-label=1, no-quote=0.
- **Real reload mid-burn: NOT observed at tier 4.** The spec states the reload leg is not walked by design. Covered instead by remount at tier 1 (V 3.18). Real page reload remains unobserved; low risk, since committed records are in-memory view state.
- **Drift notice, record-only: observed.** `commit-drift-notice` count 1 after the first commit, after the cut and after the re-commit; `commit-stranding-notice` 0 throughout. Confirms Exploratory 2: the spurious "committed at delta-v" line renders after every real commit (drift defect, link 4's to own). Not asserted, not a failure of this change.
- Also NOT observed at tier 4: the two-interval zero-preview window (`zero-preview-2-intervals: UNTESTED`, flight 5423 ms). Covered at tier 1 by V 3.1 and V 3.4 per RULING 17. This is not a row of mine that was BLOCKED; scenario 1/4 are PASS at tier 1.

### Clauses the journey passed more weakly than the scenario states

1. Tab target: not-body and inside-column, not "the next focusable after the burn control" by identity.
2. Hold-through-read: 3 post-read snapshots, window ends at read+250 ms.
3. Post-cut request: at-least-one-in-an-interval, not exactly one.
4. Drift notice: logged, never asserted.

### Gate caveat (not QA's call)

The three tier 4 reds (`scan-journey.spec.ts:332`, `slice.spec.ts:83`, `space-journey.spec.ts:85`) are attributed by the SDET as not this change's; the third (409 on a post-dock burn) rests on an unverified body (sentinel not captured), and `selectionCommitted` was false for that click, so the change's gating was not in play. The corroborating later run had all three green. I take the SDET's attribution as evidence, not as my own observation.

### Updated summary

ADDED requirement 21 scenarios: 21 PASS (scenario 21 now journey-closed), 0 FAIL, 0 BLOCKED. MODIFIED x3, 33 scenarios: 33 PASS. Requirement clause "real-wire instants equality": PASS. "Reload mid-burn": PASS at tier 1 (remount); real reload not observed. 0 FAIL, 0 BLOCKED. Nothing STILL OPEN as a row; the weaknesses above are recorded, none contradicts a THEN.

**SHIP** (from QA: no FAIL, no BLOCKED rows remain; archive still waits on the orchestrator's RULING 19 gate decision about the three unrelated tier 4 reds).

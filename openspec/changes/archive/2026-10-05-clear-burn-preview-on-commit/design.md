## Context

The live clause "the preview SHALL clear … when an order commits" (*Burn Preview Reflects the Server-Solved Order, Without Committing*) has no scenario and no implementation: after an accepted burn the selection is kept and the quote keeps refreshing as a re-target toward the target already being flown to. This change makes it true as a fourth withheld state, the **committed selection**, and withdraws the burn command for it (RULING 5, **BREAKING**). Frontend only: two production files, no hook, service, type or backend edit.

It is written against the rulings as they stand (`docs/handoffs/clear-burn-preview-on-commit-rulings-index.md` 1-15; RULING 12 is revised by RULING 13) and the delta and tasks as revised after the panel (dispositions in `docs/handoffs/clear-burn-preview-on-commit-panel-consolidated.md`), after adversary round 1 (`docs/handoffs/clear-burn-preview-on-commit-adversary-r1.md`, all eight findings accepted by RULING 14), after architect addendum 2 on those repairs (`docs/handoffs/clear-burn-preview-on-commit-panel-architect-addendum-2.md`, P1-P4) and after adversary round 2, verdict CLEAR, whose wording residue n1-n4 is applied as that report states it (`docs/handoffs/clear-burn-preview-on-commit-adversary-r2.md`, RULING 15): ADDED 1 requirement / 21 scenarios, MODIFIED 20, 9 and 4 scenarios, 40 tasks. Round 1, addendum 2 and round 2 added or reworded clauses in scenarios 1, 4, 5, 10, 11, 12, 14 and 20 and added no scenario or task. The 40 is this link's own count: sections 2 and 3 are counted in the predecessor's unit (the test arrangement group) and section 4 per transformation; counted strictly in the predecessor's unit throughout, the change is 45 (RULING 13). Nothing below is working text awaiting a ruling.

Facts this design rests on (code read at `48face7`):

- **The predecessor built the whole liveness determination.** `SystemSpaceView.tsx:780-792` derives, in render, whether the acting fleet's recorded order is still its running burn as last read, including the commit-to-read gap. The panel already reports every accepted commit, warned or not (`SpaceCommandPanel.tsx:175-180`). What is missing is a record for an unwarned commit (`:349-357` deletes it), a selection in the record, and a second reader.
- **The gap rule's facts are unchanged** (archived `2026-10-04-surface-commit-stranding-warning/design.md` Context; its impl contract §3): `useOrder`'s hook-level `onSuccess` invalidates the own-fleets read with cancellation before the panel's mutate-level callback runs (`use-fleets.ts:44`, `:72`); a cancelled read's answer moves nothing; only an answer moves `dataUpdateCount`; the view re-renders on every answer and on every failure.
- **The preview hook is generic over its flag.** `use-burn-preview.ts:55` folds the caller's flag into `enabled`; `:84-89` cancels and removes the cache entry whenever `enabled` is false; `:91` returns `null` in the same render; `:73-78` makes `retry` read the live flag.
- **The commit's invalidation does not touch the preview.** `invalidateFleet` invalidates `['fleets','mine']`, `['fleets','detail',id]` and the interior; the preview key is `['fleets','burn-preview',fleetId,selectionKey]` (`lib/query-keys.ts:60-61`).
- **A selection's identity is already a client string.** `selectionKey` (`space-selection.ts:69-77`): `body:<id>` or `point:<x>,<y>,<z>`. It is also the preview's cache key.
- **The burn control's availability is one expression in two places.** `burnAvailable` (`SpaceCommandPanel.tsx:143`) gates the uncapped label (`:332`); the control's `disabled` (`:345`) repeats its terms.

## Goals / Non-Goals

Goals: no quote and no preview request for a selection whose burn this view committed, for that order's life as last read; the burn command unavailable for it, with a static statement that says why and names the exit and is the control's accessible description; one determination with two readers (the stranding notice and the committed selection); every other selection and fleet previewed and committable as before.

Non-goals: a committed state for a burn this view did not commit (RULING 4); stating why Burn is unavailable in the three earlier withheld states, or withholding it when docked at the target (`followup-explain-withheld-burn-command.md`, out of the chain); the drift notice and the unserved delta-v (`drift-commit-response-carries-no-delta-v.md`); `BodyId` on a point burn (`defect-point-burn-serves-empty-bodyid.md`; no target is compared); a response lacking a burn instant (`followup-warned-commit-without-burn-instants.md`); any edit to `use-fleets.ts`, `use-burn-preview.ts`, a type module, a service or the backend; the galaxy view; palette or type scale; anything resting on U1-U10 of `add-vitals-strip-qa-reverify.md`.

## Decisions

1. **The committed selection is a render-time reading of a record against the own-fleets read, not a stored state with a clearing rule.** The first attempt (`lift-burn-preview-to-view`, draft Decision 5) stored a (fleet, selection) pair at the commit and dropped it when either stopped matching. It failed (adversary B1) because nothing in a pair knows the order: it outlived a cut drive, a stop, an arrival at a point and a re-task from elsewhere, and it had to be cleared in handlers that a derived acting-fleet change never runs (architect A1). Here the only write is the accepted-commit callback; "still committed" is recomputed on every render from what the read last said. There is nothing to clear, so there is nothing that can fail to be cleared. Alternatives rejected: the stored pair (above); matching the read's burn target to the selection (RULING 4: contradicts "from this view", inverts the live re-target rule after a reload, and rests on `Target.BodyId`, served `""` for a point); clearing and immediately re-quoting (no committed state; RULING 1); an effect that writes "ended" (forbidden by *Animation Never Re-Renders the View*, and unnecessary).

2. **The record is widened, renamed, and stays in view component state.**

   ```ts
   interface CommittedOrder {
     departMs: number | null
     arriveMs: number | null
     /** own-fleets dataUpdateCount at acceptance; null when the read the commit
      *  started had already answered; undefined only when the query has no state */
     readsAtAcceptance: number | null | undefined
     /** selectionKey of the selection the command was invoked for */
     selectionKey: string
     warned: boolean
   }
   const [committedOrders, setCommittedOrders] = useState<Record<string, CommittedOrder>>({})
   ```

   One entry per fleet id, set on every accepted burn commit and replaced by that fleet's next one. The write is unconditional: the handler has no branch on the warned flag and no bail-out when the incoming `selectionKey` equals the stored one, because a re-commit toward the kept selection is a new order with new instants and a new gap. Each clause of the delta's replacement rule ("toward the same target or another, whether or not the later response carries the stranding warning, and one fleet's commit SHALL NOT affect another fleet's") has a row a one-sided build fails (adversary M1): a same-key bail-out fails task 3.5's re-commit in the resume window; a handler that moves the record on one side of the warned flag only fails one of task 3.12's two rows; a single record shared by all fleets fails task 3.14 row one, where B commits and A's statement must still be shown. The branch that deleted a fleet's entry on an unwarned commit is deleted, and `WarnedOrder` with it. The predecessor's sentence "a fleet's later accepted burn commit ends that fleet's earlier notice at that acceptance, whether or not the later response carries the warning" stays true: the later entry replaces the earlier and the notice reads `warned`. A stale entry is inert and bounded by the fleet count. Home unchanged for the predecessor's reasons: view state survives an acting-fleet switch, a selection change and a panel remount, and is lost with the view, which is RULING 4's reload clause. Alternatives rejected: a query-cache entry (survives a view remount inside a session, giving the reload clause two answers); a second map for unwarned orders (two records to keep in step for one determination).

3. **Selection identity is the client's own key, captured at click.** The panel computes `selectionKey(selection)` inside `commitBurn`, before `order.mutate`, and reports it in the payload; the view compares it with `selectionKey` of its live selection. Nothing crosses the wire, so neither point-coordinate round-tripping nor the empty `BodyId` applies. Captured at click because the response can land after the selection or the acting fleet changed (architect A4). A point re-selected at identical coordinates (the keyboard path, `select-pan-target-point`) compares equal and is committed; that is the rule, not an exception. The comparison has no kind branch, which is what keeps *Burn Command Targets … Uniformly* satisfied. Alternative rejected: comparing `bodyId` (makes every pair of points equal; finding A2).

4. **The gap rule is the predecessor's, unchanged, and the absent-query case stays `undefined` (RULING 9).** The handler stores the query's `dataUpdateCount` unless the read `useOrder` started has already answered (`fetchStatus` idle, `status` success), in which case `null`. With no query state the stored value is `undefined`, the render-time count is `undefined`, and the gap never closes. That case is unreachable in production (the view always mounts `useMyFleets`) and is deliberately not changed to `null`: `null` means a read answered, none did, and it would let a harness that mocks `useMyFleets` show a refreshing quote beside an enabled Burn for a just-committed selection, which production cannot. The consequence is recorded under Risks and carried by tasks 7.1 and 6.2. The rule still depends on `useOrder`'s invalidation staying where it is; that file is not edited and task 3.3 is its guard.

5. **Reads, never the clock.** The projected clock passing `ArriveMs` ends nothing (predecessor RULING 6). For this consumer a clock term would be worse than for the notice: at every arrival it would enable the preview for the selected target one round trip before the read reports the attachment, sending a zero-length solve that the server answers 500. No new term reads `worldTime`; the two `wallMsUntil` call sites are untouched. "The clock" includes the world time a read serves: neither the envelope's `worldTime` nor a fleet's own `worldTime` is compared with `ArriveMs`, so a read that answers after the arrival instant and still reports the burn leaves the state in place (the delta's scenario 4, last AND; adversary m4). Task 3.4 observes both halves: the projected clock passing 61000 with no read answered, then an answer dated past 61000 that still reports the burn.

6. **One determination, two readers, placed above the preview flag.**

   ```ts
   const order = acting ? committedOrders[acting.id] : undefined
   const fleetReadCount = qc.getQueryState(queryKeys.fleets.mine())?.dataUpdateCount
   const awaitingRead = !!order && order.readsAtAcceptance !== null && fleetReadCount === order.readsAtAcceptance
   const actingBurn = acting?.state?.Mode === 0 ? acting.state.Burn : null
   const stillRunning =
     !!order && !!actingBurn && order.departMs !== null && order.arriveMs !== null &&
     actingBurn.DepartMs === order.departMs && actingBurn.ArriveMs === order.arriveMs
   const orderLive = awaitingRead || stillRunning
   const commitStrandingNotice = orderLive && !!order && order.warned
   const selectionCommitted = orderLive && !!order && selectionKey(selection) === order.selectionKey
   const previewWanted = !!acting && !acting.jump && !mineRunning && !dockedAtTarget && !selectionCommitted
   ```

   The block moves from below the hook call (`:780-792`) to above `previewWanted` (`:773`); `qc` (`:346`) and `acting` (`:305`) are already in scope there. Plain expressions: no `useMemo` (`getQueryState` is not a dependency a memo can see), no effect, no timer, no `setState`. Keyed on `acting`, so it follows the acting fleet however that changes. This is what the reworded clear clause of *Burn Preview Reflects…* means by "a burn order the acting fleet committed for that selection is accepted from this view" (adversary m2): an acceptance for fleet A while B is acting writes `committedOrders[A]` and nothing else. The handler performs no cache operation, `order` is `undefined` for B, and B's preview entry (`['fleets','burn-preview',B,key]`) is neither removed nor refetched, so B's figures stay shown across A's acceptance with no request caused by it (task 3.14 row two).

7. **A failed read changes nothing, for each of the three consumers (RULING 8, option (b)).** The notice stays, the quote stays withheld with no no-quote state, stale marking or preview retry, and Burn stays unavailable for the one committed selection with the statement shown, beside the view's fleets-error notice and its retry, until a read answers. Only an answer moves the count and only an answer changes `acting`, so the expression above already implements it with no added term: in the gap the state holds, after the gap the last answer stands. The statement does not mention the retry; the fleets-error notice is the "why". Alternative rejected: option (a), ending the gap for the command on a failure. It is expressible in render with a stored `errorUpdateCount`, but it cannot stay ended (the retry's answer re-enters the state, and holding it ended needs state written from an effect), it gives one record two gaps, it re-opens the duplicate order, and it costs two tasks over a cap with no slack. The cost of (b) is under Risks.

8. **The seam: one payload field and one prop.**

   ```ts
   export interface AcceptedBurnCommit {
     fleetId: string
     departMs: number | null
     arriveMs: number | null
     strandingWarning: boolean
     selectionKey: string
   }
   // SpaceCommandPanelProps
   selectionCommitted?: boolean
   ```

   From `selectionCommitted` alone the panel renders the statement (Decision 13); adds `!selectionCommitted` to `burnAvailable`; adds the same term to the control's native `disabled`; and sets the control's `aria-describedby` (Decision 13). The uncapped label follows `burnAvailable` and needs no term of its own. The panel adds **no** suppression of the no-quote state, the stale marking or the retry: those are absent because the view's flag disables the hook, whose outputs are then `null`/`false`. The success toast, the drift notice, the guard and the preview props are untouched: none of the commit's own result surfaces gains a `selectionCommitted` term. Task 3.1 observes the success feedback given once, task 3.19 the stranding notice beside the statement, and task 2.3 the drift notice rendered below the statement with the prop true. The payload's new field is asserted by exact equality in three places in `SpaceCommandPanel.test.tsx`: the new test of task 2.2 and the two predecessor tests that task also edits (`:778`, and `:802` in its two rows), which production task 5.1 would otherwise turn red with no owner (adversary M2). No early return is added to `commitBurn`: a disabled control does not reach it, and a branch no test can reach is not built.

9. **The hook is not edited and the resume rule needs nothing new.** At the acceptance the callback's `setState` re-renders with the flag false: figures, ceiling and `currentQuote` are `null` in that render and the effect removes the entry. At the end the render caused by the own-fleets answer has the flag true; the observer finds no entry, builds an empty one and fetches from that render. That is the live rule "sent at the transition, nothing from before, no `maxFuelTons` in the window", inherited by construction. A burn committed in that window and accepted re-enters the state for the kept selection through the same path as any other acceptance (Decision 2: the write is unconditional): the flag goes false, the restoring request still pending is cancelled and its entry removed, and no further request is sent (scenario 5's last AND, task 3.5). When the end is an arrival at the selected body, `dockedAtTarget` is true in the same render (both read the same `acting`), so the flag never goes true and no request is sent.

10. **`useOrder` is not lifted.** The mutation stays in `SpaceCommandPanel`. Lifting it would move the success and warning toasts, the guard and the drift figures, and rewrite the 46 panel tests of a component link 4 retires; and the gap rule depends on the report being made from the mutate-level `onSuccess`, after the hook-level invalidation. The cost of not lifting is under Risks and is link 2b's to resolve.

11. **The availability rule, BREAKING, and where it is written.** Before: a second Burn on the just-committed selection is available and capped by the continuing quote. After: unavailable until the order's life ends as last read. It is stated once, in the ADDED requirement, with precedence over *Burn Command Targets … Uniformly* for that selection only; that requirement takes no delta (RULING 6, made final by RULING 9; the three conditions it rested on, findings A1, A2 and A9, are applied in the delta). *Burn and Jump Commit Controls Guard Against Double-Submit* is MODIFIED because its own scenario's first step now creates the state that blocks its second. The predecessor's clause that the notice does not disable the control is a recorded reading (RULING 9): the acceptance disables it, with or without a notice.

12. **Tests extend the predecessor's view-level file in place.** This is the choice task 1.1 leaves to the architect. `SystemSpaceView.stranding-notice.test.tsx` keeps its name and its harness (lines 1-449); the new tests are a new `describe` block, the file's header comment says it now covers both readers of the order record, and the harness gains a second point trigger at different coordinates (task 1.1; task 3.11's point row needs it). Extracting the harness would move `vi.mock` factories out from under 24 passing tests, and renaming would orphan every handoff that cites the file, for a component link 4 retires. No section-3 test may mock `useMyFleets`.

13. **The statement: copy, placement, accessible description (RULING 10).** The spec pins intent (states the commitment, the reason the command is unavailable and the exit; no figure, countdown, target identifier or wire text; one text for every selection kind); the string lives here.

    ```ts
    // SpaceCommandPanel.tsx, module scope, beside COMMIT_STRANDING_NOTICE_COPY
    const SELECTION_COMMITTED_STATEMENT_COPY =
      'A burn order is committed to this target, so Burn is unavailable for it. Select another target to change course.'
    ```

    - **Copy.** Exactly that string, for a body, a lane gate and a point. Like the two existing copy constants it is not exported; "asserted against the design.md constant" in task 2.3 means the test carries this literal, so a silent edit of the production string fails it. "Committed" stays true through the gap and the lag; the second sentence is the exit that the stranding notice's fixed copy ("Place a different order to change it.") presupposes and that a disabled Burn on this target would otherwise contradict.
    - **Placement.** `<p data-testid="selection-committed-statement" id={statementId} className="mt-1 text-[11px] text-zinc-500">`, rendered as the JSX sibling directly before the Burn `<Button>` (`:340`), that is after the uncapped-label block (`:332-338`), which is never rendered with it. In the committed render the quote, no-quote, stale, retry and label elements are all absent, so the reading order is: Course, canvas notice (if any), `selection-facts`, `gate-facts` (if any), statement, Burn, stranding notice (if warned), drift notice, Jump (if any). The stranding and drift notices are not moved; that the statement precedes both when all three are shown is asserted by task 2.3 (scenario 20's fourth AND), in the panel test, where the stranding notice is a prop and the drift notice is produced by an accepted mocked commit whose figures differ from the quote. Existing line treatment and an existing panel colour; no palette or type change.
    - **Accessible description.** `const statementId = useId()` in the panel; the Burn control gets `aria-describedby={selectionCommitted ? statementId : undefined}`, so the attribute is present exactly while the statement is in the DOM and never dangles. Catalyst `Button` spreads unknown props to the underlying button, so no Catalyst edit. Native `disabled` is kept (it is what every other unavailable state on this control uses and what task 2.1 asserts); a natively disabled control is out of the tab order, so the description reaches a screen-reader user in browse mode and the adjacent text reaches everyone else in reading order. Both are wanted, neither alone.
    - **Not a live region.** No `role`, no `aria-live`, and no ancestor with either: the panel's `<section>` and the command column have none, and the view's announcer (`:808`) is a sibling outside the column. Acceptance is already announced once by the success toast's polite region.
    - **Precedent, bounded.** This wires one state's reason as the control's description. It is in the direction `followup-explain-withheld-burn-command.md` proposes for the three earlier withheld states and docked-at-target, absorbs none of them, and leaves that follow-up's mechanism choice open. No description is added to any other state here.

    Alternatives rejected: my one-sentence default "An order is committed to this target." (no reason, no exit; collides with the stranding notice); a target name or countdown (a figure, and a `figure-formatting` delta); adjacent text only, or description only (F2); `role="status"` on the statement (doubles the toast's announcement and would pass the view-level silence test unchanged, which is why task 2.3 asserts the structure).

14. **The statement is shown whether or not the canvas is available (RULING 10; UX F5).** The prop has no canvas term and none is added: the order is committed whether or not the canvas draws, and a canvas branch would be a state with no test. With the canvas unavailable the panel shows `canvas-required-notice`, then the selection line, then the statement, above a Burn disabled for both reasons; the control's description is the statement; the uncapped label is absent because `burnAvailable` already has the canvas term. Reachable only when the canvas is lost after the commit. The delta carries the row as scenario 1's last AND (adversary m1); it is observed by task 2.1's canvas-unavailable leg, in the panel test, because the view-level harness's stage mock reports the canvas available on every render and cannot withdraw it.

15. **Focus at the acceptance is an outcome the build does nothing to produce, verified at tier 4 only (RULING 11).** The delta's "Focus" paragraph requires that when Burn becomes unavailable while holding keyboard focus, focus is not lost to the start of the document, the next Tab goes to the next focusable element after the control, and "The view SHALL NOT programmatically move focus at the acceptance, to the statement or anywhere else" (reworded by adversary m6: the prohibition is on what the view does, so an engine's own focus fix-up reporting the document body as the active element before the Tab is not a breach). The build adds no focus call, no ref and no `tabIndex`: nothing moves focus to the statement (that would make assistive technology read it and breach the Silence paragraph), and the outcome rests on the browser keeping its sequential-navigation starting point at a control that became natively disabled. jsdom cannot judge that, so there is **no tier-1 test**; the scenario "Keyboard focus survives the burn command becoming unavailable" is covered by the keyboard leg of the journey in task 7.3 (activate Burn with Enter, assert the focused element is not the statement, press Tab, assert the focused element is inside the command column and is not the document body; Chromium). "The next focusable element after the control" is Jump when the panel renders it and otherwise the first control of the fleet panel, the next panel in the same column; that is why the leg asserts the column and not the panel. If the leg is red at the gate, the fallback UX names (`aria-disabled` plus an inert activation for this state only, task 2.1's "disables" then reading "makes unavailable") is a **gate-time finding for the one batched revision round**, not a decision made here and not something to pre-build.

### Every live requirement checked

"Read" means I read the live text for this review; "r2" means I relied on the analyst's reading (`clear-burn-preview-on-commit-analysis-r2.md` §2) and checked only the quoted passages.

| Requirement (`system-space-view` unless named) | Verdict | Basis |
| --- | --- | --- |
| Burn Preview Reflects the Server-Solved Order, Without Committing | MODIFIED | Read. Three withheld states named twice; "not whether the burn command is available"; the unscenarioed commit clause |
| A Failed or Stale Preview Is Never Presented as a Current Quote | MODIFIED | Read. Closed list of four unavailable states; "governed, unchanged" |
| Burn and Jump Commit Controls Guard Against Double-Submit | MODIFIED | Read (`:884-917`). The guard-release scenario's WHEN is uninducible on the default arrangement |
| Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly | No delta (RULING 6, final by RULING 9) | Read (`:963-1020`). A uniformity rule already qualified by the mine gate, the canvas and the absent fleet; all six scenarios inducible |
| A Burn Commit's Stranding Warning Stays Visible … as Last Read | No delta, reading recorded | Read (`:3037-3292`). No sentence mentions a record or a refreshing quote; `:3114-3117` is what the notice contributes; seven of its view-level tests re-arranged (tasks 4.1, 4.2) and two of its panel payload assertions gaining `selectionKey` (task 2.2), scenarios unchanged |
| A Burn Commit Is Quote-Locked to the Preview the Player Agreed To | No delta | Read (`:807-845`). The cap derives from the current quote; the re-quote is already bounded by the withheld states |
| Burn Commit Reports Its Outcome | No delta | Read (`:847-882`). Feedback untouched; "the current selection unchanged" holds |
| A Commit's Actual Result Is Never Silently Swapped for the Previewed One | No delta | Read (`:919-961`). Not made worse; already false in production by code reading |
| Toggle-to-Deselect Single Selection … | No delta | Selection model untouched; re-selecting an equal selection is committed by Decision 3 |
| Body, Lane-Gate, and Point Selection Is Keyboard-Operable | No delta | Its only burn mention (`:2000`) is kind-uniformity |
| A Ghost Is Not a Member of the Space View's Selection … | No delta | A ghost is never a selection, so never a committed one |
| System Space View Route and Data Fan-In | No delta | r2. No read added |
| Realtime Refetch Rules While the Space View Is Open | No delta | r2. No trigger added |
| A Landed Resolution Is Announced to Assistive Technology | No delta | r2, and read in code (`SystemSpaceView.tsx:624-677`): the landing is announced from the own-fleets read that ends the state, by an effect this change does not edit. The statement adds nothing to the announcer and is not a live region (Decision 13) |
| Animation Never Re-Renders the View, and Never Starves a Navigation | No delta; constrains the build | r2. No clock term, no effect-written state |
| `fleet-roster`, `docked-fleet-actions`, `system-console`, `figure-formatting` | No delta | r2. The statement renders no figure; cut drive and stop are not edited; nothing is passed to the strip |

### Carried bodies edited

Every scenario heading of the three MODIFIED requirements is carried verbatim. One scenario body is edited; all other edits are requirement text.

| Requirement | Scenario | Before | After |
| --- | --- | --- | --- |
| Burn and Jump Commit Controls Guard Against Double-Submit | The guard releases when the request settles or fails | WHEN / THEN | The same two lines preceded by `GIVEN no other requirement makes the command unavailable for the selection` |

| Requirement | Requirement-text edit |
| --- | --- |
| Burn Preview Reflects… | three to four withheld states (two places); a fourth bullet pointing at the ADDED requirement; the availability sentence scoped to the first three, with the fourth's precedence attributed to the ADDED requirement by name (A1); "nothing is withheld merely because a read is being refreshed" extended for the acceptance; the refresh and commit clause reworded (RULING 7; subject named by adversary m2) to "or when a burn order the acting fleet committed for that selection is accepted from this view, from which point it is withheld for as long as that withheld state holds", with the jump, mine, cut-drive and stop sentence |
| A Failed or Stale Preview… | the closed no-label list gains the committed selection; "governed, unchanged" split first four / fifth |
| Burn and Jump Commit Controls… | one new paragraph: the guard's release is not the control's return to availability |

Bodies that enumerate three withheld states or four unavailable states ("A resumed preview presents nothing…", "No path sends a preview request…", "A withheld preview is never presented as a failed one", "The uncapped-burn label is never shown…") are byte-identical: each is a GIVEN or WHEN list, true as written, and the fourth state's behaviour is in the ADDED requirement's scenarios.

### Each derivation and the test that observes it at its home

Tasks 3.15, 3.17 and 3.18 are regression guards: they assert only absences and availability that hold before section 5 and are expected green before implementation (RULING 13; `already-green` in the coverage table). Every other task of sections 2 and 3 is red until section 5.

| Derivation | Home | Observing test (tasks.md) |
| --- | --- | --- |
| A record kept for every accepted commit | `SystemSpaceView.tsx` handler | 3.1 (an unwarned commit enters the state); 3.19 (unwarned: statement and no notice, before any read); predecessor 3.16 (an unwarned record shows no notice) |
| The record is replaced at every acceptance: no warned branch, no same-key bail-out | `SystemSpaceView.tsx` handler | 3.12 (two rows, the accepting response with and without the warning, same closing assertion); 3.5 (a re-commit toward the kept selection in the resume window re-enters the state) |
| One record per fleet, not one for the view | `SystemSpaceView.tsx` handler | 3.14 row one (B commits for the kept selection, both orders reported running: the statement holds for A and for B) |
| `orderLive`: the gap | view render | 3.2, 3.3; 3.9 (the gap ends at the first answer, whatever it says) |
| `orderLive`: both instants equal | view render | 3.7 rows 2-4 (row 3, 5000/61000, fails an arrival-only build; row 4, 1000/90000, fails a departure-only build) |
| `orderLive` has no clock term, projected or served | view render | 3.4, both steps (the projected clock past 61000 with no read answered; then a read still reporting the burn and dated past 61000 on the envelope and on the fleet's own `worldTime`, which a build comparing either served world time with `ArriveMs` fails) |
| `selectionCommitted`: key equality | view render | 3.11 row 1 (bodies), 3.12, 3.13 |
| `selectionCommitted`: equality is of `selectionKey`, not `bodyId` | view render | 3.11 row 2, both halves now in the delta (scenario 11's last AND): a point committed shows the statement and sends no request, which a build that records nothing for a non-body fails; a different point selected is previewed and committable, which a `bodyId` comparison fails. Needs task 1.1's second point trigger |
| `selectionCommitted`: keyed on the acting fleet | view render | 3.14 |
| An acceptance for a fleet that is not acting touches no other fleet's preview | handler (no cache operation) and view render | 3.14 row two alone (B acting when A's response lands: B's figures stay shown and B's preview request count is unchanged across the order's answer, the observation a build that drops B's cache entry at A's acceptance fails, since the auto-resolving preview mock re-shows the figures) |
| The notice's `warned` term | view render | 3.19; predecessor 3.13, 3.16 |
| `!selectionCommitted` in `previewWanted` | view render | request counts over the real `useBurnPreview`: 3.1-3.4 (none), 3.5-3.7 (one at the end), 3.8-3.9 (none at a docked end) |
| A failed read moves nothing, in the gap or after it has ended | view render | 3.10 (five steps; the fifth, a read rejected after the drifting answer ended the state, fails a build with an error term in `awaitingRead`: no statement, the control available, the resumed preview's figures still shown and no preview request sent at that failure) |
| Click-time `selectionKey` in the payload | `SpaceCommandPanel.tsx` | 2.2 (the new test, and the two predecessor exact-equality assertions gaining the field); 3.13 at view level |
| Statement, native `disabled` term, label via `burnAvailable` | `SpaceCommandPanel.tsx` | 2.1 |
| `aria-describedby` present exactly while the statement shows | `SpaceCommandPanel.tsx` | 2.1 (prop-true leg present; false and omitted legs absent) |
| The statement has no canvas term | `SpaceCommandPanel.tsx` | 2.1 (prop true, `canvasAvailable` false: statement present, label absent); the row of scenario 1's last AND |
| Copy, DOM position (after the selection line, before Burn, and before the stranding and drift notices when shown), no live-region role, attribute or ancestor | `SpaceCommandPanel.tsx` | 2.3 (the copy against Decision 13's literal) |
| The commit's result surfaces carry no `selectionCommitted` term | `SpaceCommandPanel.tsx` (no code: nothing is added) | 3.1 (success feedback once); 3.19 (stranding notice beside the statement); 2.3 (drift notice rendered with the prop true) |
| A rejected or failed commit writes no record | `SpaceCommandPanel.tsx` (callback not called) and the view handler | predecessor panel test "a rejected or failed commit reports nothing", kept green; 3.15 (guard, already-green); 3.16 |
| A burn the view holds no response for has no record | view state | 3.18 (guard, already-green) |
| No-quote, stale and retry absent while committed | the hook's disabled outputs, through the view | 3.1, 3.10 (not a panel test: the panel has no such term) |
| The resume rule for the new term | `use-burn-preview.ts`, unedited | 3.5 (one request at the answer, nothing from before, no `maxFuelTons`, the uncapped label while it is pending, and re-entry with no further request when the burn committed in that window is accepted) |
| The beginning and a non-landing end add nothing to the announcer | no code: the announcer effect is unedited | 3.17 (guard, already-green; one arrangement: live-region text identical before the acceptance, after it, after the cut) |
| A landing that ends the state is still announced, once, and nothing else is | `SystemSpaceView.tsx` landed-resolution effect, unedited | 3.8 (moved here from 3.17 by A4: same arrangement as the docked hand-over, one more assertion on the same read) |
| Focus survives the control becoming natively disabled | the browser; no code | none at tier 1. Journey keyboard leg in 7.3 (Decision 15) |

A test that hand-sets `selectionCommitted` on the view's output, or mocks `useMyFleets`, observes an arrangement and not a derivation. That is why task 2.1 has no "after a commit has settled" leg (A5): the panel test mocks `useOrder`, and "unavailable although the request has settled" is observed where it is derived, in 3.1 and 3.12.

### Scenario coverage (the ADDED requirement's 21, in delta order)

Status is the task's state before section 5: `red` (fails until implemented) or `already-green` (a regression guard, RULING 13).

| # | Scenario | Tasks | Status |
| --- | --- | --- | --- |
| 1 | A committed order removes the quote and withholds the burn command | 2.1 (including the canvas-unavailable AND), 3.1 (including the success feedback given once) | red |
| 2 | The committed selection holds before any read has answered after the acceptance | 3.2 | red |
| 3 | A read begun before the commit and answered after it does not end the committed selection | 3.3 | red |
| 4 | The projected clock passing the arrival does not end the committed selection | 3.4 (two steps: clock past the arrival; then a read still reporting the burn, dated past the arrival on the envelope and on the fleet's own `worldTime`) | red |
| 5 | Cutting the drive ends the committed selection | 3.5 (including the re-commit accepted in the resume window) | red |
| 6 | A stop ends the committed selection, above or at the speed floor | 3.6 (two rows: a different burn, above the floor; a point park, at or below it) | red |
| 7 | A read reporting the order gone ends the committed selection | 3.7 (four rows) | red |
| 8 | Arrival at the selected body hands over to the docked-at-target state | 3.8 | red |
| 9 | An order that settled inside the commit round trip never shows past the first read | 3.9 | red |
| 10 | A failed read changes nothing for the quote and the burn command | 3.10 (one walk of five steps; the fifth is a further read failing after the state has ended) | red |
| 11 | Another target is previewed and committable while the committed target stays committed | 3.11 (two rows: bodies; points, both halves) | red |
| 12 | A second commit by the same fleet moves the committed selection | 3.12 (two rows: the accepting response with and without the stranding warning) | red |
| 13 | A response that lands after the selection was replaced withholds nothing for the new selection | 2.2 (names this scenario only), 3.13 | red |
| 14 | The committed selection follows the fleet | 3.14 (two rows; row one extended with B's commit; row two alone asserts B's figures stay shown and B's preview request count unchanged across A's acceptance) | red |
| 15 | A rejected or failed commit enters no committed state | view half: 3.15. Panel half: the predecessor's panel test "a rejected or failed commit reports nothing", unedited and kept green; no task of this change | already-green |
| 16 | A rejected commit leaves an earlier committed selection alone | 3.16 | red |
| 17 | The committed selection is silent | 3.17 | already-green |
| 18 | A burn this view did not commit is previewed | 3.18 (two rows) | already-green |
| 19 | One order, two consumers | 3.19 | red |
| 20 | The statement carries no figure and no wire text | 2.3 (including the statement preceding the stranding and drift notices) | red |
| 21 | Keyboard focus survives the burn command becoming unavailable | no tier-1 task; journey keyboard leg in 7.3 | tier 4 only |

The edited body of the MODIFIED guard-release scenario is covered by the existing guard tests plus 3.1 and 3.12. Shedding order if the count must fall (RULING 12's outcome, which RULING 13 keeps): 3.16, then 3.9.

## Risks / Trade-offs

- **The state can outlast its order.** One round trip after a cut drive or stop from this view; until the arrival read answers; until the next baseline poll (`BOARD_POLL_MS`, 20 s) for a change made elsewhere; while reads fail; while a read still reports the burn after its arrival instant. Each is a command withheld for one selection, never an uncapped one. The sharpest case under Decision 7: the cut is accepted and the refreshed read fails, so the client holds a response saying the fleet drifts and still shows the statement. The fleets-error retry is on screen and any other target is committable.
- **The state can end early, always toward today's behaviour** (a quote and a capped Burn): a reload or view remount (RULING 4); a response that lands after the panel unmounts, because React Query drops mutate-level callbacks for an unmounted observer (not reachable today; link 2b must keep the panel mounted or lift `useOrder`); and the commit response's instants differing from the read's on a real backend, which is closed only by code reading and tier 1 and which the journey observes for the first time.
- **A harness that mocks `useMyFleets` holds the committed state until unmount** (Decision 4). `SystemSpaceView.burn-preview.test.tsx` accepts a commit at `:709` and `:844`; each is its test's last act. A test added there that asserts a quote or a second Burn on the committed selection will fail. Task 7.1 states the trap and task 6.2 carries it into the chain doc's Taught record.
- **The focus outcome is proved in one engine, once, at the archive gate** (Decision 15). Nothing at tier 1 can go red for it, so a regression is found only by the journey. The build relies on browser behaviour for a natively disabled control and adds no code to produce it; if Chromium does not give the outcome, the repair (`aria-disabled` for this state only) changes what task 2.1 asserts and lands in the batched revision round.
- **A natively disabled control is out of the tab order**, so its `aria-describedby` is reached only by a screen-reader user reading in browse mode. A keyboard-only sighted user gets the reason from the adjacent text. That is the reason Decision 13 does both.
- **After a warned commit the panel stacks three lines about one order** (statement above Burn; stranding notice and drift notice below). The statement's second sentence is what makes the stranding notice's "Place a different order to change it." followable. The drift notice's presentation is link 4's.
- **A window of one scheduler task after the acceptance.** The panel releases the guard and reports the commit in the same callback; the disabled term arrives on the render that report schedules. An activation between the two sends a capped order. Today that window is unbounded; closing it would need a panel ref with no reachable test.
- **`queryClient.clear()` at sign-out resets the answer count** (`hooks/use-auth.ts:130`, `:185`), so an old record's stored count could be met again. The view does not survive a sign-out.
- **After arrival at the selected body the panel goes from the statement to the docked-at-target state**: an enabled Burn under the uncapped label that ends in the zero-length 500. The end state is today's; the contrast is new (Burn visibly re-enables at arrival) and is the fenced follow-up's; task 6.3 adds a dated note there.
- **The panel is not figure-free after a commit.** The drift notice renders after every real commit by code reading and counts down. Tests and the journey key "the quote is gone" on the six `preview-*` elements.
- **How soon an arrival is read depends on the ETA timer** (`SystemSpaceView.tsx:592`, U2's hunk). Correctness does not: the baseline poll is the floor. The journey's arrival leg waits on the row reading docked and asserts no wall-time bound of its own (task 7.3).
- **`use-burn-preview.ts`'s header comment** lists three suppression inputs and is left stale by the no-edit fence.

## Migration Plan

None. Frontend only, no stored data, no wire change. The deletion of `WarnedOrder` and its unwarned branch lands in the same commit as the widened record.

## Open Questions

None. The four questions this section held are ruled and recorded as decisions: the failed-read rule (RULING 8, Decision 7); the statement's copy, placement and accessible description (RULING 10, Decision 13); the statement while the canvas is unavailable (RULING 10, Decision 14); and the task count, 40 with the two repair tasks counted as two because each is one mechanical re-arrangement applied across tests whose scenarios and assertions do not change (RULING 13, which keeps RULING 12's outcome and replaces its basis). That is not the predecessor's unit: counted strictly in the predecessor's unit the change is 45, five over the 40-task cap, and RULING 13 records that number and declines a split.

One thing is deliberately left to the gate and is not an open question: whether Chromium gives the focus outcome with a natively disabled control (Decision 15). A red keyboard leg is a finding for the batched revision round.

# clear-burn-preview-on-commit — UX panel review (spec stage)

Reviewer: UX. Read-only. Surface: `SpaceCommandPanel` (Course panel) after an accepted burn commit.
Evidence: delta `openspec/changes/clear-burn-preview-on-commit/specs/system-space-view/spec.md` (line refs below are to it),
`proposal.md`, `tasks.md`, analysis r2, writer notes, rulings 4-7, predecessor rulings 5/8/9,
`frontend/components/space/SpaceCommandPanel.tsx`, `SystemSpaceView.tsx`, `FleetActionsPanel.tsx`.

## Facts the findings rest on

- Render order today (`SpaceCommandPanel.tsx:221-424`): Course label, `selection-facts` ("Target <bodyId>" or "Target: a point in space", `:239-244`), `gate-facts`, the quote, the uncapped label, **Burn** (`:340-348`), `commit-stranding-notice` (`:350-354`, below Burn per predecessor RULING 8), `commit-drift-notice` (`:356-410`), Jump. The statement therefore needs no target id: the selection line already names it.
- Burn is the Catalyst `Button` over Headless UI with `disabled={...}` (`:345`): a native `disabled` attribute, so a disabled Burn is not in the tab order and cannot take focus.
- The stranding notice's fixed copy ends "Place a different order to change it." (predecessor RULING 9). After this link a warned commit puts that sentence under a **disabled** Burn for the committed target.
- Acceptance feedback is `toast.success` (+ `toast.warning` when warned). Sonner's region is `aria-live="polite"` (`node_modules/sonner/dist/index.mjs`), so a screen-reader user already hears the acceptance without any panel announcement.
- The fleets-error notice shows on `fleets.isError` regardless of cached data (`SystemSpaceView.tsx:933-944`), with its retry; cut drive and stop live in `FleetActionsPanel.tsx:560-590`, labelled "Cut drive" and "Stop".
- The commit drift notice renders after every real commit (drift record; analysis r2 s4) and opens "Committed at delta-v ...".
- There is no pending state on Burn between click and response (the guard is a ref; `disabled` has no in-flight term, recorded in `followup-explain-withheld-burn-command.md`). Out of scope here; it only means the quote and an enabled-looking Burn stay on screen until the response lands, then all change in one render.

## Findings

### F1 — MAJOR — The statement says "committed" but not why Burn is gone or how to change course; it collides with the stranding notice

Attaches to: ADDED requirement, paragraph "The statement" (delta `:109-112`) and scenario "The statement carries no figure and no wire text" (`:247-250`).
Evidence: delta `:111-112` "Its exact wording is not fixed by this requirement"; writer notes s1 row 2 left copy, placement and relation to Burn to UX. Predecessor RULING 9 pinned *properties* of its copy in the spec and the strings in design.md; this statement has no properties beyond "no figure". Walk: warned commit to X, Burn disabled, panel reads "an order is committed to this target" above and "Place a different order to change it" below. The notice's instruction cannot be followed on this target and the statement does not say what can. Not a dead end (another target is committable, cut drive and stop exist), but a screen-reader or keyboard user is handed a call to action the adjacent control refuses.

Recommendation (ruling-ready):
- Copy (design.md constant, intent pinned in the spec, as RULING 9 did): `A burn order is committed to this target, so Burn is unavailable for it. Select another target to change course.`
  - No digit, no countdown, no target id (the selection line carries it), no wire text. "Committed" is lag-robust (it stays true in the gap and in the lag after arrival; "under way" or "on course" would not). It names the cause (the control's reason) and the exit that the stranding notice's sentence presupposes. It does not mention cut drive: that control is reachable from the fleet panel and ends the state, and one exit keeps the line to two short sentences in the panel's existing 11px line treatment.
- Placement: in the quote's slot, **immediately before the Burn control in reading order**, after `selection-facts` and `gate-facts`; the stranding notice and then the drift notice stay below Burn as built. Reading order on the committed render is therefore: Target X; statement; Burn (unavailable); stranding notice (if warned); drift notice; Jump. Pin the order, not the layout.
- It is the same element whatever the response and read contain (already pinned).

Paste (replace the paragraph "The statement", `:109-112`):
```
**The statement.** The statement that an order is committed to the selected
target is player-facing static text shown in the command panel immediately
before the burn command control in reading order, and above the stranding
notice and the drift notice when those are shown. It SHALL state that a burn
order is committed to the selected target, SHALL state that the burn command is
unavailable for it because of that, and SHALL name the way to change course
from this panel (selecting another target). It SHALL carry no figure, no
countdown, no raw server text and no target identifier, and its text SHALL be
the same whatever the response and the own-fleets read contain. Its exact
wording is not fixed by this requirement.
```
Paste (scenario "The statement carries no figure and no wire text", `:247-250`, same heading, same arrangement as task 2.3, extra AND clauses):
```
#### Scenario: The statement carries no figure and no wire text
- **WHEN** the statement is shown
- **THEN** its text contains no digit and no countdown
- **AND** its text is the same whatever the commit response and the own-fleets read contain
- **AND** its text says the burn command is unavailable and says to select another target
- **AND** it precedes the burn command control in reading order and follows the selection line
```
Task cost: clause on existing arrangement 2.3 (copy asserted against the design.md constant; order asserted by DOM position). **No new arrangement.**

### F2 — MAJOR — A disabled Burn's reason is not reachable programmatically; adjacent text alone leaves keyboard users without it

Attaches to: ADDED requirement, "The statement" and scenario 1 (`:124-131`).
Evidence: native `disabled` removes Burn from the tab order, so a keyboard user never lands on it and a screen-reader user in browse mode reaches it only by reading order. The writer left "whether it is the Burn control's accessible description" open (writer notes s1).

Recommendation: do both, cheaply. (1) Adjacent text before the control (F1) so reading order always delivers the reason. (2) The control's accessible description is the statement (`aria-describedby` to the statement element), present exactly while the statement is shown. This does **not** contradict `followup-explain-withheld-burn-command.md`: that follow-up's rule is "the reason is the control's accessible description" for the three earlier withheld states and docked-at-target; wiring the one state this link owns in the same direction is consistent with it, absorbs none of the others, and leaves the follow-up's open mechanism choice (a disabled control's description) untouched. Say so in design.md so the follow-up inherits a precedent, not a conflict. Do not add any description to the other states here.

Paste (add to scenario 1, `:124-131`, as one more AND; it is the same panel arrangement as task 2.1):
```
- **AND** the burn command control's accessible description is the statement's text, and when the statement is removed the control carries no such description
```
Task cost: clause on existing arrangement 2.1 (the prop-true leg asserts the description; the false/omitted control leg asserts its absence). **No new arrangement.**

### F3 — MAJOR — Focus at the moment of acceptance is unspecified

Attaches to: ADDED requirement; scenario 1.
Evidence: a keyboard user activates Burn with Enter; the control holds focus; the response lands and the control becomes natively disabled in the same render that removes the quote and adds the statement. Browsers then drop the focus to the page (document start) or leave an inert active element, depending on engine; the user loses their place on the panel at the single most important moment of the flow. `ux-spec-review` s5 treats focus management as a SHALL. Spec at outcome altitude, mechanism-neutral.

Recommendation: pin the outcome, not the mechanism: focus is not lost to the start of the document; the next Tab from the Burn control's position lands on the next focusable element in the command panel's order (Jump when present, otherwise the next control after the panel). Do not move focus onto the statement: that would make the assistive technology read it and contradict the Silence paragraph. Do not require `aria-disabled` here (see "Architect note"); if the architect prefers keeping the control focusable and exposed as unavailable, that satisfies the outcome too, and then the clause is also assertable at tier 1 on 2.1 as `toHaveFocus()` after the prop flips.

Paste (new paragraph after "Not a dead end", `:87-90`):
```
**Focus.** WHEN the burn command becomes unavailable because a burn order was
accepted while the control holds keyboard focus, keyboard focus SHALL NOT be
lost to the start of the document: the next Tab SHALL move to the next focusable
element after the burn command control in the command panel's order. The
acceptance SHALL NOT move focus to the statement or to any other element.
```
Paste (scenario):
```
#### Scenario: Keyboard focus survives the burn command becoming unavailable
- **GIVEN** the burn command control holds keyboard focus and is activated from the keyboard
- **WHEN** the order is accepted and the control becomes unavailable
- **THEN** pressing Tab moves focus to the next focusable element after the burn command control in the command panel, not to the start of the document
- **AND** focus was not moved to the statement by the acceptance
```
Task cost: **no new arrangement.** Verified in task 7.3's single journey (a keyboard leg on step 2: activate Burn with Enter, press Tab, assert the focused element is inside the command column and is not `body`; Chromium). jsdom cannot judge the browser's focus fix-up for a natively disabled control, so do not add a tier-1 task. If the cap forces a choice, keep the paragraph and drop the scenario heading (the journey leg stays); never drop both.

Architect note: native `disabled` is what every other unavailable state on this control uses and what task 2.1 asserts; keep it unless the architect finds the tier-4 leg fails in Chromium, in which case the fallback is `aria-disabled` plus an inert click for this state only (then 2.1's "disables" reads "makes unavailable").

### F4 — MINOR — Silence is tested on the announcer only; the statement itself must not be a live region

Attaches to: ADDED requirement, "Silence" (`:114-118`); scenario "The committed selection is silent" (`:230-234`).
Evidence: scenario 17 compares the **view's live-region text** before, after acceptance and after the end. A statement rendered with `role="status"`/`aria-live` would announce itself on entry through its own region and pass that scenario unchanged. Predecessor RULING 8 pinned "no live-region role" for the notice; task 5.2 says "outside the live region" but no scenario carries it.

Recommendation: answer to question 2 is **yes, stay silent, no announcement on entry or exit**. Entry: the success toast (polite region) already tells assistive-technology users the order was accepted; a second announcement would double it. Exit by arrival: the live "A Landed Resolution..." requirement already announces the landing once. Exit by cut drive or stop: the player's own action, with the fleet panel's state change. Exit by a read from elsewhere: silent, acceptable and discoverable by reading the panel; not worth a requirement. The existing "adds no text and causes no announcement of its own" wording stays true: describing the control (F2) and the focus rule (F3) announce nothing. Add the one sentence that closes the self-announce hole.

Paste (append to "Silence", `:114-118`):
```
The statement SHALL NOT be a live region and SHALL NOT be rendered inside one.
```
Paste (add one AND to "The committed selection is silent", same arrangement as task 3.17 is view-level; the assertion is panel-structural so put it on task 2.3's arrangement instead):
```
- **AND** the statement has no live-region role or attribute and no ancestor that has one
```
Task cost: clause on existing arrangement 2.3. **No new arrangement.**

### F5 — MINOR — The statement while the canvas is unavailable (question 4)

Attaches to: ADDED requirement. Not a defect; a ruling to record.
Recommendation: **show it.** The statement is a fact about the order, not about the control, and it is driven by the one boolean; a canvas branch would add an untested state. With the canvas unavailable the panel already shows `canvas-required-notice` and a disabled Burn for that reason; the statement then states a second true reason, and the control's description (F2) is the statement. The state is reachable only if the canvas becomes unavailable after the commit (Burn is disabled before it), so it is rare. Do not hide it and do not add a scenario.
Paste (one sentence appended to "While it holds", `:73-85`): `The statement is shown whether or not the canvas is available.`
Task cost: clause on existing arrangement 2.1 (a leg with the prop true and `canvasAvailable` false: statement present, label absent). **Defer-able**: if the cap forces it, drop the sentence and the leg; the behaviour then holds by construction (no canvas term) and is simply unspecified.

### F6 — MINOR (accepted cost, no spec change) — Two surfaces, one fact, at the edges

Recorded so the orchestrator rules knowingly, no text proposed:
- **Reload or remount mid-burn** (RULING 4): the panel before the reload said "committed, Burn unavailable"; after it the same target shows a quote and an enabled Burn. A second Burn there is a capped re-target (quote present) whose cost the player sees first, except in the first-quote window where it submits uncapped and labelled as such. The proposal states the limit (`proposal.md:18`). Adequate.
- **Arrival at the selected body** (question 5): the proposal states the cost adequately (`proposal.md:19`: "the end state is today's; the contrast is new... deliberately out of the chain"). UX adds one thing the proposal does not: before this link Burn was enabled throughout, so the docked state was an invitation that never changed; after it, Burn visibly **re-enables** at arrival, which reads as "you may now order", and the click ends in the zero-length 500 and the generic "Please try again". That strengthens the case for `explain-withheld-burn-command` and should be recorded there, not fixed here. Cheapest home: one sentence in task 6.3's update (a clause on an existing records task, no new task), "the committed statement's removal at arrival makes the docked state's enabled Burn a visible re-enabling".
- **The three-line stack** after a warned commit (statement, stranding notice, drift notice) and the drift notice's lead "Committed at delta-v ..." beside the statement's "committed": redundant, and the drift notice's amber presentation after every commit is link 4's (`drift-commit-response-carries-no-delta-v.md`). With F1's copy the statement is above Burn and the two notices below, so the stack reads as one statement, one control, then consequences. No change here.
- **Arrival at a selected point:** the statement ends, a preview is requested for the fleet's own position and the zero-length refusal shows the no-quote state with a retry that cannot succeed. This is today's behaviour (the quote was never cleared before) and the delta already declines to assert figures there (`:168-169`). Not new.

## Answers to the six questions

1. **Committed statement.** Copy: `A burn order is committed to this target, so Burn is unavailable for it. Select another target to change course.` Placement: after the selection/gate lines, immediately before Burn in reading order; stranding notice then drift notice below Burn as built. Relation to Burn: adjacent text plus `aria-describedby` (statement text is the control's description exactly while shown). Consistent with the out-of-chain follow-up (same direction, one state, no precedent claimed against it). F1, F2.
2. **Announcement.** None on entry or exit (toast already announces acceptance; landing requirement already announces arrival). Keep "adds no text and causes no announcement of its own", plus the sentence that the statement is not a live region. F4.
3. **Failed own-fleets read.** Agree with the working text, option (b), stated per consumer: notice stays (predecessor RULING 5); quote stays withheld with no no-quote, stale or preview-retry state; Burn stays unavailable for the one committed selection with the statement shown. The player is never stuck: `space-fleets-error` and its retry are on screen (it shows on `isError` even over cached data), any other target stays previewable and committable, cut drive and stop are unaffected, and a reload clears the record. The stated cost (command withheld for one selection while reads keep failing even after the order ended) is the right side to err on and is already in the requirement and scenario. No new scenario. The statement does not mention the retry; the fleets-error notice already is the "why".
4. **Canvas unavailable.** Show it; one sentence, deferrable. F5.
5. **Five states and flow walk.** Covered by the delta's 20 scenarios: loading (the gap, scenarios 2, 3, 9), error (failed read 10; rejected commit 15, 16), success (statement plus toast, 1; second consumer, 19), partial (warned versus unwarned, 19), empty (no committed selection: 18, 12, 13). Gaps found: reason and exit in the statement (F1), description (F2), focus (F3). The acceptance render (quote gone, statement in, Burn disabled, toast, possibly notice and drift notice) has no dead end once F1's exit sentence exists; re-select and back (11), cut drive (5), arrival (8) and reload (18) are walked and sound. Contradictions between two surfaces: the stranding notice's "Place a different order" (fixed by F1), reload and arrival contrast (F6, accepted and stated in the proposal).
6. **Focus.** The spec must say the outcome: focus is not lost to the start of the document and is not moved to the statement. F3.

## Task accounting (cap 40, no slack)

| Finding | Adds a scenario? | Task effect | Defer if the count cannot grow |
| --- | --- | --- | --- |
| F1 | No (AND clauses on "The statement carries no figure and no wire text") | Clause on existing 2.3 | No (it is the repair to a collision) |
| F2 | No (one AND on scenario 1) | Clause on existing 2.1 | No (one attribute, no arrangement) |
| F3 | One scenario heading, no tier-1 task | Journey leg inside 7.3 (one spec) | Drop the scenario heading only, keep the paragraph and the journey leg |
| F4 | No | Clause on existing 2.3 | Drop the AND, keep the sentence |
| F5 | No | Clause on existing 2.1 | **Defer** |
| F6 | No | Clause on existing 6.3 | Defer (record only) |

No finding adds a new test arrangement; the change stays at 40.

## Verdict

NEEDS SCENARIOS. BLOCKER 0, MAJOR 3 (F1-F3), MINOR 3 (F4-F6). Every MAJOR resolves by clauses on arrangements the change already has; none needs a palette, type-scale, layout or client-side fuel arithmetic change, and none builds on the out-of-chain follow-up beyond staying in its direction.

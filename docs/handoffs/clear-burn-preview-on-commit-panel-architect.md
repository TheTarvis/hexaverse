# clear-burn-preview-on-commit — panel report, architect

Architect (`openspec-architect`), 2026-10-04, spec phase. Link 2a-iii-b of the
system-HUD chain. Code read at `48face7` (working tree; nothing staged by me).
No stack booted, no tier 3/4 run, no commit. `openspec validate
clear-burn-preview-on-commit --strict` passes. Tiers are cited from
`docs/testing-tiers.md`.

**Written:** `openspec/changes/clear-burn-preview-on-commit/design.md` (new) and
this file. Nothing else was edited.

**Counts:** 0 BLOCKER, 2 MAJOR, 10 MINOR. Net task effect of every finding: 0,
provided A4 is applied as written (otherwise +1).

**One-paragraph verdict.** The mechanism is sound and the predecessor's B1 is
answered: the committed state is a render-time reading of one per-fleet record
against the own-fleets read, it has no setter other than the accepted-commit
callback, and I could not find a path on which it outlives its order except the
ones the delta states as costs (failed reads, an unsettled read). Every way it
ends early fails toward today's behaviour (a quote and a capped Burn), never
toward an uncapped one. The two MAJORs are a false cross-reference in normative
text and a one-sided build the scenarios let through; both cost no task.

---

## 1. Answers to the questions put to me

### 1.1 RULING 6 — CONFIRM (no delta on "Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly"), on three conditions

Evidence. Live `openspec/specs/system-space-view/spec.md:964-966`: "The system
SHALL, when a body, a lane-gate body, or a point in space is the current
selection, allow the burn command to be invoked and submit an order naming that
target — through the exact same command path in every case". Read literally the
committed selection is a counterexample. But the sentence is already read as a
statement of uniformity across kinds, not of availability: the running-mine
gate, the unavailable canvas and the absent acting fleet each withdraw the
command today with no carve-out in it (`SpaceCommandPanel.tsx:143`, `:345`).
All six scenarios (`:978-1020`) begin from a fresh selection and stay inducible.

Why not a MODIFIED block. An honest carve-out would have to list every existing
exception, not only the new one; naming only the committed selection would make
the sentence imply it is the sole exception. Listing them all is the scope of
`followup-explain-withheld-burn-command.md` (adversary M1 of
`lift-burn-preview-to-view`), which is fenced out of the chain. The asymmetry
with *Double-Submit* (1.2) is real and defensible: that scenario's own WHEN
creates the committed state; none of these six does.

Conditions (each is a finding below):

1. The precedence sentence must not claim the untouched requirement states it
   (A1).
2. The committed state must be kind-uniform and tested for a non-body kind
   (A2), or the uniformity requirement is silently breached by a kind-aware
   build.
3. The statement's copy must be one string for all three kinds (A9); a
   body-specific string is the "kind-specific refusal copy" `:967-968` forbids.

### 1.2 Double-Submit — CONFIRM MODIFIED; the missing scenario leaves nothing untested

Live `:914-917`: "WHEN a burn or jump commit settles or fails and the player
then initiates a new command THEN … the new attempt submits normally". On the
default arrangement (one selection, a successful burn) the WHEN is no longer
inducible, and it is this requirement's own first step that makes it so. A
recorded reading would leave a scenario whose main path cannot be walked;
adversary m4 asked for the interaction to be stated in the delta. Cost is zero
tasks.

Is anything untested without a new scenario? I checked the three things the new
paragraph says:

| Claim | Observed by |
| --- | --- |
| The control stays unavailable after the request settled | ADDED scenario 1 ("unavailable although the commit's request has settled"), task 3.1 |
| The guard itself was released by the successful commit (a build that never releases it would also show a disabled control) | Task 3.12 commits a second order toward Y after the first was accepted; task 3.5 commits again on X after the cut. Both fail if the guard is still held |
| A failed commit creates no such state | Scenario 15, task 3.15 |

So no new scenario is needed. One correction: task 2.1's leg "including after a
successful commit has settled with the prop still true" is not an observation at
panel level (A5).

### 1.3 The handler when the own-fleets query has no state (r2 Q4) — keep `undefined`; record the trap

Today (`SystemSpaceView.tsx:358-360`):

```ts
const state = qc.getQueryState(queryKeys.fleets.mine())
const answered = state?.fetchStatus === 'idle' && state.status === 'success'
const readsAtAcceptance = answered ? null : state?.dataUpdateCount
```

With no query state this stores `undefined`; the render-time count (`:781`) is
`undefined` too, so `awaitingRead` (`:782-783`) is true for the life of the
view. Unreachable in production: the view always mounts `useMyFleets()` (`:255`).

Recommendation: **do not change it to `null`.** `null` means "a read requested
at or after the acceptance has already answered". With no query no read has
answered, so `undefined` is the value consistent with the gap rule and with the
working failed-read rule (only an answer ends the gap). Storing `null` would
make a mocked-`useMyFleets` harness show a refreshing quote and an enabled Burn
for the just-committed selection: a state production never has, and a green
test of exactly the drift this link closes.

The trap, stated for the record. In any harness that mocks `useMyFleets`
(`SystemSpaceView.burn-preview.test.tsx:74-97`), every accepted commit makes
that (fleet, selection) committed until unmount, and nothing can end it there:
`useCutDrive` and `useStop` are inert in that file and its fleets are static.
The file accepts a commit at `:709` and in `expectNothingFromBefore` (`:844`,
three tests); each is the last act of its test and each asserts only on the
order request, so none breaks. A test added there that asserts a quote, an
enabled Burn or a second order after an accepted commit on the same selection
will go red.

Paste-ready (tasks, append to 7.1): "; that file mocks `useMyFleets`, so an
accepted commit there holds the committed state until unmount (design.md
Risks) and no test in it may assert a quote or a second Burn on the committed
selection". Paste-ready (tasks, append to 6.2): "the mocked-harness trap".

### 1.4 The failed-own-fleets-read rule (r2 Q1) — RECOMMEND (b), as authored

Both options are expressible as render-time derivations with no effect.

| | (a) the gap ends for the command and the quote on a failed read | (b) a failed read changes nothing |
| --- | --- | --- |
| Derivation | A second stored value, the query's `errorUpdateCount` at acceptance, and a second term: `awaitingRead && errorCount === record.errorsAtAcceptance`. Feasible: a failure re-renders the view (`fleets.isError` is read at `:744`, `:932`) | None. `dataUpdateCount` does not move on a failure (predecessor impl contract §3 fact 4), so the existing expression already does this |
| What it cannot do | Stay ended. When the retry answers with the burn, `stillRunning` is true and the state returns: the quote is withdrawn and Burn disabled again. Preventing that flap needs state written from an effect, which *Animation Never Re-Renders the View* and task 5.3 forbid | — |
| Readers | Two gaps on one record: the notice's continues (predecessor RULING 5, live `spec.md:3062-3065`) while the command's ends | One determination, two readers |
| When it bites | The app's read retry (`lib/query-client.ts:24-38`) retries a status-less failure three times first, so the "end" arrives seconds late anyway | — |
| Hazard left | A capped second order to the target already flown to: the duplicate *Double-Submit* `:894-896` describes; and an uncapped one in the resume window before the restoring quote lands | The command withheld for one selection while reads fail |
| Tasks | +2 | 0 beyond 3.10 |

The sharpest cost of (b), which the delta should not hide: the player cuts the
drive, the cut is accepted, and the refreshed read fails. The client holds a
response saying the fleet is drifting and still shows "an order is committed"
with Burn disabled for that selection. The escape is on screen (the
fleets-error Retry, any other target, a reload). Using the cut's response would
need a second report from `FleetActionsPanel` to the view, which is new scope.
I still recommend (b): the failure is rare, visible and retriable, and (a)
re-opens the duplicate order the state exists to prevent.

Wording nit in the working text (delta, "A failed read", first sentence): "the
three things this state governs" counts the stranding notice, which this
requirement does not govern. Paste-ready: "A read that fails answers nothing
and changes nothing for the stranding notice, the quote or the burn command."

The writer asked whether the cost sentence should move to design.md. Keep the
rule and its bound in the requirement (the predecessor states its lag the same
way); design.md Risks carries the cut-drive case above.

### 1.5 The predecessor's "SHALL NOT remove, disable or re-order the burn command control" (r2 Q5) — CONFIRM the recorded reading, no delta

Live `spec.md:3114-3117`. The clause is about what the notice's appearing or
removal does. After this link the control is disabled by the acceptance, for the
committed selection, whether or not a notice exists; with another target
selected the notice shows beside an enabled Burn. No predecessor test asserts
an enabled control beside the notice: `SystemSpaceView.stranding-notice.test.tsx:898-899`
asserts presence and document order only. A MODIFIED block would carry 25
scenarios to change no behaviour. The sentence that records the reading has a
dangling antecedent (A1).

### 1.6 Does the committed state end with the order's own life on every path

The derivation (design.md Decision 6): for the acting fleet's record,
`orderLive = awaitingRead || stillRunning`; `selectionCommitted = orderLive &&
selectionKey(selection) === record.selectionKey`. Nothing writes the record but
the accepted-commit callback, and nothing reads a clock.

| Path | What the derivation does, as built | Scenario / task |
| --- | --- | --- |
| Cut drive | `useCutDrive` invalidates the read (`use-fleets.ts:83`); the answer moves the count and reports mode 2: both terms false | "Cutting the drive ends…" / 3.5 |
| Stop above the floor | The read reports a burn with other instants: `stillRunning` false | "A stop ends…" row 1 / 3.6 |
| Stop at or below the floor | The read reports mode 1 | same, row 2 / 3.6 |
| Arrival at the selected body | Mode 1, attached; in the same render `dockedAtTarget` (`:771-772`) becomes true, so the flag never goes true and no request is sent | "Arrival at the selected body…" / 3.8 |
| Arrival at a point | Mode 1, attached to nothing; the preview resumes | "A read reporting the order gone…" row 1 / 3.7 |
| Order from elsewhere | Instants differ | same, rows 2-4 / 3.7 |
| Settled inside the round trip | The first post-acceptance answer moves the count and reports no such burn | "An order that settled inside…" / 3.9 |
| A second commit by the same fleet | The fleet's record is replaced at the acceptance; the earlier selection's key no longer matches | "A second commit by the same fleet…" / 3.12 |
| Fleet switch and back | The record is looked up by `acting.id` in render, so a derived acting-fleet change (architect A1 of the earlier link) needs no handler | "The committed selection follows the fleet" row 1 / 3.14 |
| Late response after a selection change | The payload carries the click-time key | "A response that lands after…" / 3.13 |
| Late response after a fleet change | The payload carries the click-time fleet id (`SpaceCommandPanel.tsx:176`) | row 2 / 3.14 |
| Unmount and remount of the view | Component state is lost; no record | "A burn this view did not commit…" row 2 / 3.18 |
| A read begun before the acceptance | Cancelled by `useOrder`'s invalidation; its answer moves nothing | 3.3 |
| The clock passing the arrival | No clock term | 3.4 |
| A failed read | Count unmoved; data unchanged | 3.10 |

Paths with no scenario of their own; I walked each and none needs one:

- Cut drive inside the gap: the cut's invalidation cancels the first
  post-acceptance read and its own read answers; the count moves. Ends.
- A late accepted response for Y landing while X (committed earlier) is
  selected: the record becomes Y's, X's flag goes true in that render and the
  hook requests at that transition. Composition of 3.12 and 3.13.
- A cap rejection for Y landing while X (committed) is selected: `retry` reads
  the live flag (`use-burn-preview.ts:73-78`); no request. Live rule, hook test.

Ways it ends early, all toward today's behaviour (quote shown, Burn capped):
a view remount or reload (RULING 4); a response landing after the panel
unmounts (A8); the commit response's instants differing from the read's on a
real backend (r2 N1, observed for the first time by journey step 3). Ways it
holds too long: failed reads (1.4); a read that still reports the burn after
its arrival instant; the mocked harness (1.3). One theoretical resurrection is
in design.md Risks (`queryClient.clear()` at sign-out, `hooks/use-auth.ts:130`,
`:185`, resets the answer count); the view does not survive a sign-out.

### 1.7 The resumed-preview rule for the new flag term — HOLDS as built, no hook edit

`use-burn-preview.ts:55` folds the flag into `enabled`; `:84-89` cancels and
removes the query whenever `enabled` is false, keyed on `[enabled, qc, fleetId,
selKey]`; `:91` returns `null` while disabled, in the same render the flag
flips. The mechanism is generic over the flag, so the new term inherits it:

- At the acceptance: the callback's `setState` re-renders with the flag false;
  figures, ceiling and `currentQuote` are null in that render; the effect
  cancels any refresh in flight and removes the entry.
- At the end: the render caused by the own-fleets answer has the flag true;
  the observer builds a fresh entry with no data and fetches from that render's
  effects. That is "at the transition", one request, nothing from before, and
  `currentQuote` null so a commit in the window carries no `maxFuelTons`.
- `invalidateFleet` (`use-fleets.ts:43-47`) invalidates `['fleets','mine']`,
  `['fleets','detail',id]` and the interior; the preview key is
  `['fleets','burn-preview',…]` (`lib/query-keys.ts:60-61`), so the commit's
  own invalidation sends no preview request before the flag flips. Task 3.1's
  zero-request count is satisfiable.

Observing tests at the term's home: 3.5 (pending window, no cap), 3.6 and 3.7
(one request at the answer), 3.1 to 3.4 (none while it holds). The hook file's
header comment (`:26-30`) lists three suppression inputs and goes stale by one;
task 5.5 keeps the file byte-identical, so record it for link 4 rather than
edit it (A10).

### 1.8 Task count, in the predecessor's unit (its RULING 12)

| Reading | Count |
| --- | --- |
| Checkboxes as written | 40 |
| By RULING 12's unit ("rows of one parametrised arrangement over the same harness state with the same closing assertion") | **41**: task 3.17 says "and in a second arrangement" with a different closing assertion |
| If each re-arranged predecessor test in 4.1 and 4.2 were its own task | 46 |

My position on the repairs: 4.1 and 4.2 are one mechanical transformation each
("select the other body first"), with every assertion and scenario name
unchanged and nothing for QA to name in 7.2. Two tasks is honest, but it is the
one place the number is not the predecessor's unit, and the orchestrator should
rule it rather than inherit it.

My findings add no task if A4 is applied (it returns 41 to 40 by removing a
duplicate arrangement, not by bundling). If A4 is declined the change is at 41.

The writer's "three tasks of room" is two. Shedding scenario 18's remount row
removes a row of task 3.18, not a task. The real room is task 3.16 (scenario
16; its record-survival half is already observed by the repaired predecessor
test 3.15 and its handler half by task 2.2), then task 3.9 (a special case of
the gap plus 3.8). After those two there is nothing left to shed without
losing an end path.

A split is not worth a chain link. I checked r2's three candidate seams against
the code and agree with all three rejections; in particular "hold first, clear
second" would ship a live quote and ceiling beside a disabled Burn. If the
panel's other reviewers push past 40 after 3.16 and 3.9 are gone, the overflow
should leave as a filed follow-up outside the chain, as the predecessor's
no-instants case did.

### 1.9 Scope

- **A backend field.** None wanted. Identity is two served integers on one DTO
  at both ends; the warned flag is on the response; the selection never leaves
  the client.
- **A `backend/space` rule mirrored.** None. The only computation is integer
  equality and a string equality; `Mode === 0` is an existing read of a served
  enum (`lib/types/fleet.ts:76-81`).
- **U1–U10.** Not built on. No new term reads the clock and the two
  `wallMsUntil` call sites (`SystemSpaceView.tsx:193`, `:592`) are untouched.
  One dependency to say out loud (A11): how soon an arrival is *read* is set by
  the timer at `:592`, which is U2's hunk. Correctness does not depend on it
  (the baseline poll is the floor); the journey must not assert a bound tighter
  than that poll.
- **Left in place though replaced.** The `WarnedOrder` name and the unwarned
  delete branch (`:244-250`, `:349-357`) are deleted by task 5.3. The stale
  hook comment (A10) stays by the fence. Nothing else.
- **`BodyId`.** Not read; `defect-point-burn-serves-empty-bodyid.md` is not
  built on.

---

## 2. Findings

### A1 — MAJOR — two cross-references in normative text point at the wrong requirement (delta; writer)

**Evidence.** Delta, MODIFIED *Burn Preview Reflects…*: "The fourth withheld
state also makes the burn command unavailable for the committed selection, and
takes precedence over *Burn Command Targets Any Selected Body, Lane Gate, or
Point Uniformly* for that selection only, as that requirement states." The
nearest antecedent of "that requirement" is the uniform-targets requirement,
which takes no delta (RULING 6) and states no such thing.

Delta, ADDED, "While it holds": "the stranding notice, when also shown,
contributes nothing to it, and that requirement's statement that the notice's
appearing or removal does not remove, disable or re-order the burn command
control remains…". The stranding requirement is not named in the paragraph; the
last one named is again the uniform-targets requirement.

**Effect.** With RULING 6 standing, the first sentence is false as parsed, in a
MODIFIED block, about the one requirement the ruling left alone.

**Paste-ready.** First: replace "as that requirement states" with "as *A Burn
Order Committed From This View Withholds Its Quote and the Burn Command for
That Selection While It Is the Fleet's Running Burn, as Last Read* states".
Second: replace "and that requirement's statement that" with "and the statement
of *A Burn Commit's Stranding Warning Stays Visible While That Order Is the
Fleet's Running Burn, as Last Read* that".

### A2 — MAJOR — no scenario commits a point or a gate, and a body-id comparison passes all twenty (delta, tasks; writer)

**Evidence.** Every ADDED scenario's committed selection is a body. The
requirement says "that selection compares equal to the current selection". A
build that compares `selection.bodyId` instead of `selectionKey(selection)`
(`space-selection.ts:69-77`) passes every scenario and makes any two points
equal (`undefined === undefined`): after a commit toward a point, every other
point shows the statement and a disabled Burn until the order ends. A build
that records nothing for a non-body selection also passes, leaving the drift
open for points. The harness has one fixed point trigger
(`SystemSpaceView.stranding-notice.test.tsx:146`).

**Effect.** The chain's own rule ("every 'whether or not' and 'both' needs a
row a one-sided build fails") unmet for the selection comparison; and RULING
6's confirmation rests on the committed state being kind-uniform.

**Paste-ready (delta, append to scenario "Another target is previewed and
committable while the committed target stays committed"):**

```
- **AND** when the committed selection is a point and a different point is selected, a preview request is sent for that point, its burn command is available and no statement is shown
```

**Paste-ready (tasks).** Append to 1.1: "; the harness gains a second point
trigger at different coordinates". Append to 3.11: "; and a second row over the
same assertions for the first half: a commit toward a point (statement shown,
no preview request), then a different point selected (preview requested,
control available, no statement)". No new task.

### A3 — MINOR — "uncommitted" is said to gain a definition and gains none (delta; writer)

**Evidence.** Proposal: "'uncommitted' gains its definition". The delta removes
the word from the requirement text and leaves it in the carried scenario "The
preview refreshes on exactly one named interval while shown" ("against an
uncommitted selection"); live *Quote-Locked* `spec.md:837` uses it too. Nothing
defines it.

**Paste-ready (delta, ADDED, end of "Whose and which"):** "A selection that is
not the acting fleet's committed selection is an uncommitted selection wherever
this capability uses that word."

### A4 — MINOR — task 3.17 is two arrangements; its second is task 3.8's (delta, tasks; writer)

**Evidence.** Task 3.17: "…and in a second arrangement a read reporting the
fleet attached to the committed body: the landing announcement made once". That
arrangement (order confirmed, next read parked and attached to the selected
body) is exactly task 3.8's. Counted by RULING 12's unit the change is at 41.

**Paste-ready (delta).** Move the last line of scenario "The committed
selection is silent" to scenario "Arrival at the selected body hands over to
the docked-at-target state", as its last line:

```
- **AND** the landing announcement is made once, and the statement's removal announces nothing else
```

**Paste-ready (tasks).** 3.8 gains "; the landing announcement is made once and
the live-region text carries nothing else"; 3.17 loses its second arrangement.
One arrangement, one more assertion on the same event. Count stays 40.

### A5 — MINOR — task 2.1's settled-commit leg observes a hand-set prop (tasks; writer)

**Evidence.** Task 2.1: "including after a successful commit has settled with
the prop still true". `SpaceCommandPanel.test.tsx` mocks `useOrder`; with the
prop true the control cannot be clicked, so the leg must render false, click,
invoke the success callback and re-render true by hand. That is the arrangement
tasks.md's own header rules out ("a test that hand-sets the committed prop …
observes an arrangement and not the derivation"). The behaviour is observed at
its home by 3.1.

**Paste-ready.** Delete that clause from 2.1 and its mention of the edited
guard-release scenario; the header sentence already names 3.2 for it, change
"tasks 2.1 and 3.2" to "tasks 3.1 and 3.12".

### A6 — MINOR — the no-query-state case and the mocked-harness trap (tasks; writer)

Section 1.3. No production change; two task clauses.

### A7 — MINOR — a sub-render window after the acceptance (design; recorded, not built)

**Evidence.** `SpaceCommandPanel.tsx:156-180`: the success callback releases the
guard, then reports the commit; the disabled term reaches the control on the
render that report schedules. An activation landing between the two reaches
`commitBurn` with the guard free and the old `currentQuote`.

**Effect.** A capped duplicate order in a window of one scheduler task. Today
that window is unbounded (Burn stays enabled after every commit), so this is
strictly narrower. Closing it would need a ref the panel clears when the prop
falls, for a state no test can reach. Recorded in design.md Risks; no text
change, but the adversary may quote *Double-Submit* `:889-892` at it.

### A8 — MINOR — a response landing after the panel unmounts now fails open (tasks 6.2; writer)

**Evidence.** Predecessor architect A11, chain doc `chain.md:583-586`: React
Query drops mutate-level callbacks for an unmounted observer. For the notice
that lost a warning. For this link it means no record, so the quote keeps
refreshing and Burn stays enabled for the committed selection: today's
behaviour, silently.

**Paste-ready (tasks, append to 6.2):** "; and that link 2b must keep
`SpaceCommandPanel` mounted across tab changes or lift `useOrder`, because a
commit whose response lands after the panel unmounts now also enters no
committed state".

### A9 — MINOR — the statement: one string for every kind; test id and prop named here (UX; writer)

- The copy must not name a kind ("this body"): live `spec.md:967-968` forbids
  kind-specific copy on this command path. Paste-ready (delta, "The statement",
  after "player-facing static text"): "and is the same for a body, a lane gate
  and a point".
- Names (design.md Decision 8): prop `selectionCommitted?: boolean`; element
  `data-testid="selection-committed-statement"`; payload field `selectionKey:
  string`.
- Placement, the accessible description and r2 Q7 (beside
  `canvas-required-notice`) are UX's; my defaults are in design.md Open
  Questions. Wiring `aria-describedby` costs one attribute and one assertion in
  2.1, no task.

### A10 — MINOR — the hook's header comment goes stale under the fence (records; orchestrator)

`use-burn-preview.ts:26-30` enumerates "a running mine, lane transit, a target
that is the fleet's own host". Task 5.5 keeps the file byte-identical, which is
the cheaper guarantee. Record the stale comment in 6.2's Taught for link 4; do
not open the file.

### A11 — MINOR — the journey must not bound arrival detection tighter than the baseline poll (tasks 7.3; writer)

The read that reports an arrival is requested by the timer at
`SystemSpaceView.tsx:592`, whose delay is U2's unadjudicated `wallMsUntil`
hunk. Paste-ready (append to 7.3): "; the arrival leg waits on the row reading
docked and asserts no wall-time bound of its own on how soon that happens".

### A12 — MINOR — shedding arithmetic and the repair unit (orchestrator)

Section 1.8: the room is two tasks (3.16, 3.9), not three; and 4.1/4.2 are two
tasks over seven re-arranged tests, which wants a ruling of its own.

---

## 3. Prior findings this link exists to answer

| Finding | Answered by |
| --- | --- |
| Adversary B1 (`lift-burn-preview-to-view-adversary-r1.md:25-43`): the hold outlives the order through cut drive, stop, point arrival, outside re-task; must survive the commit-to-read gap | Section 1.6; the gap is the answer count; scenarios 2, 3, 5-9 |
| Adversary M5 (`:97-110`): the clear removes the only stranding text | The predecessor's notice exists first; scenario "One order, two consumers" / 3.19 |
| Adversary m4 (`:120`): Double-Submit's scope | MODIFIED, section 1.2 |
| Architect A1 (`lift-burn-preview-to-view-panel-architect.md:176-197`): acting-fleet changes with no handler | Record keyed by fleet id, read by `acting.id` in render; the default arrangement of 3.1 already has `actingFleetId` null |
| Architect A4 (`:265-280`) items 1-3 | 3.14 row 1 (A to B to A), 3.13 (click-time selection), 3.14 row 2 (click-time fleet) |

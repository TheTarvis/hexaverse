# `surface-commit-stranding-warning` — panel report, architect

Spec phase, 2026-10-04, code read at `b695eeb`. I wrote
`openspec/changes/surface-commit-stranding-warning/design.md` and this file, and
edited nothing else. `openspec validate surface-commit-stranding-warning --strict`
passes with the design in place. No stack was booted and no vitest suite was
run. The React Query claims below were read in the installed
`@tanstack/query-core` 5.90.11 source and then run against it in a throwaway
Node script (deleted afterwards); the measured outputs are quoted in A1.

## Summary

- **RULING 2 is confirmed on identity and wrong on one point of mechanism.** The
  order's identity as the commit response's `(DepartMs, ArriveMs)` compared for
  equality with the own-fleets read holds: both are `common.WorldMillis`
  integers (`backend/space/burn.go:39-40`), assigned only where the burn is
  built (`:480-481`), and served through the same `fleetDTO` at both ends. What
  does not hold is the analysis's "marker against `dataUpdatedAt`, the in-file
  precedent" for the gap (§ 5, M1 row), which task 4.2 repeats as "that read's
  answer and failure times". Timestamps cannot order the events (A1).
- **Writer's note 1: yes, the two reads can be told apart, and the view never
  has to.** A read begun before the acceptance cannot answer after it:
  `useOrder`'s own invalidation cancels it before the panel's callback runs.
- **Q3:** a failed read changes nothing; the notice stays (A2).
- **Q4:** read-only end, no clock term, as written.
- **Note 4:** a warned response lacking either instant shows the notice for the
  gap only (A4).
- Every "no delta" verdict in the proposal's table holds against the live text.
  Two rows need their reason reworded (A2, A10).
- Honest task count with the fixes below is 39, not 33 (A8).

Findings: 0 blocker, 5 major, 9 minor.

## Findings

### A1 — MAJOR — the gap cannot be measured with timestamps; use the read's answer count

**Where.** `tasks.md` 4.2: "with the gap rule against that read's answer and
failure times". Analysis § 5, M1 row: "Marker against `dataUpdatedAt`, the
in-file precedent". Writer's note 1.

**Why.** Three facts, each read in the source and then measured.

1. *A pre-acceptance read is discarded, so no ordering test is needed in the
   view.* `use-fleets.ts:72` invalidates in the hook-level `onSuccess`;
   `queryClient.ts:321` defaults `cancelRefetch` to true; `query.ts:397`
   silently cancels the in-flight fetch when the query has data (it always has,
   or there would be no acting fleet to commit for). Mutation callbacks run
   hook-level first, mutate-level second (`mutation.ts:244`,
   `mutationObserver.ts:175`). Measured, with a read held in flight when the
   commit resolves:

   ```
   [ 'hook-onSuccess calls=2', 'after-invalidate calls=3', 'mutate-onSuccess calls=3' ]
   marker       { d: 1, e: 0, fetch: 'fetching', mode: 'parked' }
   pre-accept answered  { d: 1, e: 0, fetch: 'fetching', mode: 'parked' }
   post-accept answered { d: 2, e: 0, fetch: 'idle', mode: 'burning' }
   ```

   (`d` is `dataUpdateCount`.) The held read's answer changes nothing.
2. *A wall-clock marker ties.* The whole `SystemSpaceView*` family runs under
   fake timers (`SystemSpaceView.burn-preview.test.tsx:416`), where
   `Date.now()` is frozen between explicit advances, so the cached read's
   `dataUpdatedAt`, the marker and the next answer are all the same number.
   The scan's rule `marker > dataUpdatedAt` then reads "no gap" at once, and
   task 3.1 can never go green for an honest implementation. With real timers
   and an instantly resolving read I measured 200 ties in 200.
3. *An instantly resolving read lands before the panel's callback.* Measured
   `dataUpdateCount` at the mutate-level callback: 2 with an already-resolved
   `listMine`, 1 with one deferred to a later task. A marker of any kind taken
   in the callback, with no check for this, is on the wrong side of the first
   post-acceptance read in a test that uses `mockResolvedValue`.

**Fix (design Decisions 2, 5, 6).** At acceptance the view reads
`qc.getQueryState(queryKeys.fleets.mine())`: fetch in flight, store
`dataUpdateCount`; none in flight, the read has already answered, store `null`.
The gap is open while the stored count is non-null and equals the current
count. No `use-fleets.ts` edit. The dependency on `useOrder`'s cancelling
invalidation is real and is what scenario "A read begun before the commit…"
guards.

**Paste-ready, `tasks.md` 4.2:**

> - [ ] 4.2 `SystemSpaceView.tsx`: keep one record per fleet for a warned order, written from that callback (set on an accepted warned commit, deleted on an accepted unwarned one, untouched on a rejection), holding the two instants and the own-fleets query's answer count at acceptance when a read is in flight (design Decisions 2, 5); derive in render whether the acting fleet's record is still its running burn or its first read is still awaited (Decision 6); no effect writes state, no timer, no clock term, no timestamp comparison, no edit to `use-fleets.ts` (gates 3.1-3.13, 3.15, 3.16)

### A2 — MAJOR — Q3: a failed read should not remove the notice

**Where.** Delta, "The gap": "IF the first read requested at or after the
acceptance fails, THEN the gap ends at that failure and the order is judged
against the last read that answered, which predates the order, so the notice is
removed [pending panel: Q3]". Scenario "A failed first read ends the gap and
removes the notice". Task 3.8.

**Why.** The analysis recommended ending the gap because that "fails toward a
capped command". That reason belongs to the quote and the burn command, which
are the next link's. For a warning it is backwards: a request failing is not
evidence the order ended, and the accepting response is the newest thing the
client holds about that fleet. The scan precedent exists so a committed sweep
is never "unreportable and unretriable" behind a pending presentation that
hides its own retry (`spec.md:2241-2246`); this notice hides nothing, and the
fleets-error notice with its retry is shown beside it. The live preview rule
already reads a failed refresh as "leaves its earlier answer standing"
(`spec.md:532-533`). It is also the simpler mechanism: one counter, no error
term. Ending on failure makes the notice flap (writer's note 2), and the only
alternative to flapping needs state written from an effect.

**Paste-ready, delta, replace the last sentence of "The gap":**

> A read that fails answers nothing. IF an own-fleets read requested at or
> after the acceptance fails, THEN the gap continues and the notice stays,
> beside the view's existing fleets-error notice and its retry, until a read
> answers: the accepting response is then the most recent statement the view
> holds about that fleet. A read that fails after the gap has ended likewise
> leaves the last answer, and so the notice, standing.

**Paste-ready, delta, replace the scenario:**

> #### Scenario: A failed read after the acceptance does not remove the notice
> - **GIVEN** a burn commit accepted with the warning and the cached read describing the fleet as parked
> - **WHEN** the first own-fleets read requested after the acceptance fails
> - **THEN** the stranding notice is still shown
> - **AND** the view's existing fleets-error notice and retry are shown
> - **AND** when a later read answers with the fleet parked and no burn, the stranding notice is removed

**Paste-ready, `tasks.md` 3.8:**

> - [ ] 3.8 The first read requested after the acceptance rejected: the notice is still present beside the fleets-error notice and its retry; the retry answering the committed burn's instants keeps it; in a second arrangement the retry answers parked with no burn and the notice is removed (scenario "A failed read after the acceptance does not remove the notice")

**Paste-ready, `proposal.md` table row:**

> | A Focused Scan Commits Against a Listed Target and Reports Its Rejection in Player Copy (`system-space-view`) | No delta | Precedent for a gap between an accepted commit and the read that reflects it. Its failed-read rule is not carried: that rule keeps a committed sweep reportable and retriable behind a presentation that hides both; this notice hides neither |

If the ruling goes the other way, the mechanism takes one more term
(`errorUpdateCount`, design Open Question 1) and the writer's "returns on a
later read" text is then correct and should stay: a removed-forever notice is
not implementable without effect-written state.

### A3 — MAJOR — "never by more" is false as written

**Where.** Delta, "The lag": "An arrival is known at the first read after the
view's ETA-scheduled refetch for that arrival" and "so the notice may outlast
the order by up to those bounds and never by more".

**Why.** Two reachable cases break the bound. A read that fails leaves the last
answer standing, under either Q3 ruling. And the own-fleets read can return a
due fleet unsettled (analysis § 2, "Arrival not settled"); the ETA effect does
not reschedule after it (`SystemSpaceView.tsx:553-565`: the candidate key is
unchanged and no future ETA remains), so the next chance is the baseline poll.
The clause "because each invalidates the read" is also mechanism, not behaviour.

**Paste-ready, delta, replace "The lag":**

> **The lag.** A change this view causes by cutting the drive or stopping is
> known one own-fleets round trip after that command's response. An arrival is
> known at the first read that reports it, which the view requests shortly
> after the order's served arrival instant. A change made elsewhere is known
> at the first read that reports it, requested no later than the view's next
> baseline poll. Any further refresh trigger the view has only shortens those
> waits. Each assumes the read it names answers and reports the change: a read
> that fails, and a read that still reports the order as running after its
> arrival instant, each leave the notice in place until a later read reports
> the change. Until then the view acts on its previous read, and the notice
> outlasts the order by exactly that wait.

### A4 — MAJOR — a warned response without both instants is unspecified (writer's note 4)

**Where.** Not in the delta; task 1.2 covers only the stranding field.

**Why.** The client type allows it (`Burn | null`), the panel already defends
against it (`SpaceCommandPanel.tsx:140-152`), and the panel must do something
when it happens, so leaving it unspecified makes the implementer guess. "No
notice" discards a warning the server sent, which `fleet-roster`'s live SHALL
forbids. "Gap only" costs no code: unmatched instants match no read, so the
first answer ends it (design Decision 7).

**Paste-ready, delta, append to "The order's identity":**

> IF the accepting response carries the warning but not both burn instants,
> THEN no read can be matched to that order: the notice is shown for the gap
> and removed at the first own-fleets read requested at or after the
> acceptance that answers, whatever it reports.

**Paste-ready, delta, new scenario:**

> #### Scenario: A warned response without both burn instants shows the notice for the gap only
> - **GIVEN** a burn commit accepted with the warning, its response carrying no burn, or a burn lacking either instant
> - **WHEN** no own-fleets read requested after the acceptance has answered
> - **THEN** the stranding notice is shown
> - **AND** it is removed when that read answers, including when it reports the fleet burning

**Paste-ready, tasks:**

> - [ ] 1.4 `SpaceCommandPanel.test.tsx`: a successful commit whose response carries the warning with `state.Burn` null, and again with `ArriveMs` absent, calls the callback with the missing instant as null and the warning true (scenario "A warned response without both burn instants shows the notice for the gap only")
> - [ ] 3.16 A warned commit accepted with no burn in the response: the notice is present until the first read after the acceptance answers and removed when it does, with that read reporting the fleet burning (same scenario)

### A5 — MINOR — implementation detail in the delta

**Where.** "The view SHALL keep one record per fleet"; "a fleet's later
accepted burn commit replaces that fleet's earlier record"; "It uses the
command column's existing amber text treatment".

**Why.** A record and a text class are HOW. The behaviour is per-fleet notices
and an end at the next acceptance. The treatment is in design Decision 9.

**Paste-ready, delta, replace "Whose notice":**

> **Whose notice.** The notice belongs to the fleet that committed, the fleet
> the command was invoked for, not the one acting when the response landed.
> Notices are per fleet: the view SHALL show a fleet's notice only while that
> fleet is the acting fleet, whatever is selected, and SHALL show it again on
> the switch back to that fleet while its order still runs; one fleet's commit
> SHALL NOT remove another fleet's notice; and a fleet's later accepted burn
> commit ends that fleet's earlier notice at that acceptance, whether or not
> the later response carries the warning [pending panel: Q5 for "whatever is
> selected"].

**Paste-ready, delta, last sentence of "What the notice is":** replace "It uses
the command column's existing amber text treatment; no new figure is rendered."
with "It renders no figure."

### A6 — MINOR — "the app's defaults … no retry" is not the app's default

**Where.** `tasks.md` 2.1.

**Why.** `frontend/lib/query-client.ts` retries a read up to three times unless
the status is 401, 403 or 5xx. The harness should turn retry off, and say so.

**Paste-ready:** in 2.1 replace "with the app's defaults (a one-minute stale
time, no retry)" with "with the app's one-minute stale time and query retry
turned off (the app's own default retries a status-less read failure three
times, which only delays when a failure registers)".

### A7 — MAJOR — the harness as described can pass or fail for the wrong reason

**Where.** `tasks.md` 2.2, 3.2, 3.3, 3.15.

**Why.** Four points, each from the measurements in A1 or from the file.

- 2.2 allows answers that resolve on their own. Those can land before the
  panel's callback (A1 fact 3), which makes 3.6 and 3.7 order-dependent.
- 3.2 passes for the right reason only if the test shows the held read was
  discarded and a new one was requested; otherwise it observes nothing a
  gap-less implementation with a lucky ordering would not also show.
- 3.3 says "the projected clock advanced past the arrival instant". The view's
  clock anchors on the interior read first (`SystemSpaceView.tsx:440`), which
  this family mocks; a later fleets `worldTime` does not move it.
- 3.15 can only fail if the second mount shares the first's `QueryClient`.
  With a fresh client a record kept in the cache would pass it.

**Paste-ready, `tasks.md` 2.2:**

> - [ ] 2.2 Same file: `listMine`, `order`, `cutDrive` and `stop` each return a promise the test settles by call index (answer or reject), every call recorded, none resolving on its own; each `listMine` answer carries its own `worldTime`; a read that is not a mutation's is caused by dispatching `sse-reconnect` or by advancing the fake clock by `BOARD_POLL_MS`, never by calling the query client (design Decision 10)

**Paste-ready, 3.2:** append "; the test asserts that a new `listMine` call was
made at the acceptance and that answering the held call changed nothing on
screen".

**Paste-ready, 3.15:** insert "on the same `QueryClient`" after "a fresh view
mounted".

### A8 — MINOR — the count is 39, not 33

**Where.** `tasks.md` 3.3, 3.14.

**Why.** 3.14 carries three scenarios with unrelated assertions (element
distinctness and the announcer; four preview states; copy). 3.3 carries two
(repeat reads across selections; the clock). The predecessor's adversary called
this bundling. Splitting 3.14 in three and 3.3 in two adds 3; A4 adds 2; A13
adds 1. 33 + 6 = 39, under the cap of 40 with one to spare. 3.5, 3.6, 3.7, 3.9
and 3.12 are parametrised arrangements of one harness state and are fairly one
task each.

**Paste-ready, replacing 3.3:**

> - [ ] 3.3 Reads answering the same instants twice, across selections of the committed target, a different body and none: the notice is present after each (scenario "A read reporting the same burn keeps the notice")
> - [ ] 3.3b The last read reporting the committed burn and the view's projected world time past its arrival instant, no further read answered: the notice is present (scenario "The projected clock passing the arrival does not end the notice")

**Paste-ready, replacing 3.14:**

> - [ ] 3.14 The notice present with the preview shown carrying its own stranding line: two separate elements, the notice carrying no error treatment, the announcer text identical before its appearance, after it and after its removal (scenario "The notice is advisory and distinct from the preview's stranding line"; pending panel Q5)
> - [ ] 3.14b The notice present with the preview in its no-quote state, its stale state and withheld: present in each (scenario "The notice does not depend on the preview")
> - [ ] 3.14c The notice's text names stations and lane gates and contains no digit (scenario "The notice's copy names stations and lane gates and carries no wire text"; pending panel Q9)

### A9 — MINOR — "captured at click" is already what the closure does; the stale thing is the prop

**Where.** `tasks.md` 1.1 and 4.1; writer's discrepancy note 2 ("has to be
taken in `commitBurn` before `mutate`").

**Why.** The success callback is created inside `commitBurn`, at click, so the
`fleet` it reads is the click-time one with no extra capture
(`SpaceCommandPanel.tsx:127-167`). Test 1.1 therefore passes for the naive
implementation; it is a pin, which is fine. The real hazard is the opposite:
the `onCommitAccepted` the panel calls is also the click-time one, so the
view's handler must be stable and must not close over render values.

**Paste-ready, 4.1:**

> - [ ] 4.1 `SpaceCommandPanel.tsx`: call an optional `onCommitAccepted` from the success callback with the fleet id passed to the mutation, the response burn's two instants (null where absent) and `strandingWarning === true`; do not call it on error; export the payload type from this file; the success toast, drift notice, guard and preview props stay untouched (gates 1.1-1.4)

and add to 4.2: "the handler is a `useCallback` over the query client alone and
uses the functional state update".

### A10 — MINOR — the Fan-In row's reason does not meet the sentence an adversary will quote

**Where.** `proposal.md` table, *System Space View Route and Data Fan-In*: "No
read is added".

**Why.** The live text also says "Every offer and readout this view mounts
SHALL be driven by the results of those reads" (`spec.md:73`). The notice is
driven by a command response and the own-fleets read. The verdict holds: the
sentence introduces an enumerated list of read-anchored offers, and two
response-driven readouts already live under it (the success feedback and the
commit drift notice). Say so.

**Paste-ready row:**

> | System Space View Route and Data Fan-In | No delta | No read is added. "Every offer and readout this view mounts SHALL be driven by the results of those reads" introduces the enumerated read-anchored offers; a command's own response already drives the success feedback and the commit drift notice under it, and the notice's lifetime is driven by the own-fleets read |

### A11 — MINOR — a response landing after the panel unmounts reports nothing

**Where.** Design Risks; nothing to change in this change.

**Why.** React Query drops mutate-level callbacks for an unmounted observer, so
neither the toast nor the notice would appear. The panel does not unmount
today. Link 2b's tabs can make it. Add to the chain doc's Taught record for
this link (task 5.2): "2b must keep `SpaceCommandPanel` mounted across tab
changes or lift `useOrder`; a commit whose response lands after the panel
unmounts shows neither its success feedback nor its stranding notice."

### A12 — MINOR — store nothing for an unwarned order

**Where.** `proposal.md` What Changes, bullet 2: "The view keeps one record per
fleet of the order it committed".

**Why.** For an unwarned order the instants have no reader in this change;
RULING 1 rejected the selection key on exactly that ground. The callback
reports every accepted commit (it must, so an unwarned commit ends an earlier
notice); the view stores a record only for a warned one and deletes on an
unwarned one (design Decision 5).

**Paste-ready bullet:**

> - The view keeps, per fleet, a record of the last order it committed whose response carried the warning, identified by the response's departure and arrival instants compared for equality with the own-fleets read (FULL-AUTO RULING 2). An accepted commit without the warning removes that fleet's record. The record is written in the commit callback and compared in render; no effect, timer or clock term is added.

### A13 — MINOR — where the notice is rendered, pending UX

**Where.** `tasks.md` 4.3 ("render the notice in the command column"),
`proposal.md` Affected code.

**Why.** The column's children are cards over the canvas; a bare amber line
there has no surface, and giving it one is a new card. The panel already has
the amber line treatment next to the Burn control. I recommend the view pass
one boolean and the panel render it (design Decision 9). Placement is UX's
ruling; if it lands elsewhere only the element moves.

**Paste-ready, replacing 4.3, and a new 1.5:**

> - [ ] 1.5 `SpaceCommandPanel.test.tsx`: with `commitStrandingNotice` true the panel renders `commit-stranding-notice` with no alert or status role and outside any live region, with and without preview props; with it false or omitted, nothing (scenario "The notice is advisory and distinct from the preview's stranding line")
> - [ ] 4.3 `SystemSpaceView.tsx` passes `onCommitAccepted` and the derived `commitStrandingNotice` to the panel; `SpaceCommandPanel.tsx` renders `commit-stranding-notice` below the Burn control in the panel's existing amber line treatment, static, with a working copy constant naming stations and lane gates (gates 1.5, 3.14-3.14c; placement and copy pending panel Q5, Q9)

### A14 — MINOR — say what a stop does to the notice

**Where.** `proposal.md` Out of scope, the stop bullet.

**Why.** A stop above the speed floor ends the burn order's notice at the next
read, and the stop's own response, which can carry the same warning, is still
unrendered. The player loses the notice at the moment a new one may be due.

**Paste-ready, append to that bullet:** "A stop therefore removes the burn
order's notice and shows nothing in its place, even when the stop's own
response carries the warning."

## Boundary and feasibility review

- **Capability boundary.** One capability, `system-space-view`, one seam (panel
  to view). No backend, hook, service or type-module edit is needed; the
  payload type is exported from the panel file. Nothing cuts across a seam.
- **Render-time derivation.** Holds. The record is component state written
  only in the commit callback; the derivation is one expression over the
  record, the acting fleet's read entry and the query's answer count. No
  effect, timer, clock term or render-time `setState`. *Animation Never
  Re-Renders the View* is untouched, and with Q4 read-only the notice is not "a
  state that flips when a served instant passes".
- **The record's home.** View state survives an acting-fleet switch, a
  selection change and a panel remount; it dies on reload and on a view
  remount, which is the delta's reload clause. A cache-homed record would
  survive a view remount but not a reload, giving that clause two answers.
- **Built with no consumer.** Only the unwarned record (A12). The callback's
  instants on an unwarned commit are unread, which is the price of one uniform
  payload and is not stored.
- **Every scenario is observable** with what the client has, given A1's
  mechanism, except that 3.15's "the roster row shows the stranded indication"
  depends on `roster.stranded`, which the real `FleetRoster` in the harness
  renders (`FleetRoster.tsx:234`).
- **"No delta" verdicts, checked against the live text.** All 20 hold.
  *Own-Fleet Position…*: the quoted clause is at `spec.md:324-327` and is met
  (a served field on the commit response). *Burn Commit Reports Its Outcome*
  and `fleet-roster`'s pair: met, the notice is additive. *Realtime Refetch
  Rules*: no trigger added; note that the live rule (3) names a completion-event
  subscription the code does not have (only an `sse-reconnect` listener that
  nothing in production dispatches), so the lag paragraph rightly rests on the
  mutation, the ETA refetch and the poll. *Burn Preview Reflects…*: untouched;
  its "SHALL clear … when an order commits" stays unimplemented. Rows to
  reword: the scan precedent (A2) and Fan-In (A10).
- **New harness.** Feasible. Leaving `@/hooks/use-fleets` unmocked and adding
  `listMine`, `cutDrive` and `stop` to the `fleetService` mock is a small
  change to the header `SystemSpaceView.burn-preview.test.tsx` already has
  (330 lines before its first test). Cut drive and Stop are always rendered in
  `FleetActionsPanel` (`:560-590`), disabled only by a running mine, so they
  are clickable in every arrangement. Expect the file near 1,100 lines for 20
  tests.
- **Task 6.1.** The count is right: eight `SystemSpaceView*.test.tsx` files
  exist, seven plus the burn-preview one. None commits a warned burn, so none
  can change.

## Answers to the writer's notes

1. **Gap against `dataUpdatedAt`.** Cancellation does discard the earlier
   answer; verified in source and by measurement (A1 fact 1). Request-time
   ordering is not needed. But `dataUpdatedAt` is still the wrong instrument,
   because it ties with a marker in the same millisecond and always under fake
   timers; use the answer count (A1).
2. **Q3 and the return.** Under my Q3 recommendation nothing is removed, so
   nothing returns and the question disappears. If Q3 is ruled the other way,
   keep "returns": the rule is then a pure function of the last answered read,
   and "stays removed" needs memory that only an effect could write.
3. **Cut drive, stop, newer commit.** Confirmed. Both verbs invalidate the read
   (`use-fleets.ts:83`, `:97`). A newer accepted commit replaces or deletes the
   record at its acceptance with no read. See A14 for what the stop costs.
4. **No instants.** Notice for the gap only (A4).
5. **Record home.** Agreed: the view, in component state, not the panel and not
   the cache.
6. **Prop.** `onCommitAccepted`, optional, is right; it matches `ScanControl`'s
   prop on the same view. The verifying run in 6.1 is enough.
7. **Warning only on the commit response.** Confirmed (`handler.go:445-448`,
   `omitempty`; never on a read).
8. **Lag clause.** Naming the triggers without the 20 s figure is right; the
   figure lives in the design's Risks. The clause's "never by more" is false
   (A3).

On the writer's discrepancies: the `sse-reconnect` listener exists and nothing
outside tests dispatches it, as the writer suspected; the click-time capture
note is answered in A9.

## Recommendations on the open questions

- **Q3.** A failed read changes nothing: the gap continues and the notice stays
  beside the fleets-error notice until a read answers. Reasons in A2.
- **Q4.** Read-only, as authored. The ETA-scheduled refetch already lands an
  arrival within about a round trip, so a clock term buys under a second. In
  the degraded case it would remove the notice while the server still serves
  the burn and before any read can carry the roster's `stranded` indication.
  It would also add a served-instant flip to a view whose live requirement
  budgets those, for no gain.
- **Note 4.** Gap only.

## Files

- `/Users/travis/Projects/hexaverse/openspec/changes/surface-commit-stranding-warning/design.md` (authored)
- `/Users/travis/Projects/hexaverse/docs/handoffs/surface-commit-stranding-warning-panel-architect.md` (this file)
- Read, not edited: `proposal.md`, `tasks.md` and `specs/system-space-view/spec.md` in the change folder; `frontend/components/space/SystemSpaceView.tsx`, `SpaceCommandPanel.tsx`, `FleetActionsPanel.tsx`, `SystemSpaceView.burn-preview.test.tsx`; `frontend/hooks/use-fleets.ts`, `use-burn-preview.ts`; `frontend/lib/query-client.ts`, `frontend/lib/types/fleet.ts`; `frontend/node_modules/@tanstack/query-core/src/{query,queryClient,mutation,mutationObserver}.ts`; `backend/space/burn.go`, `backend/fleet/handler.go`.

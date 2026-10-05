# `keep-console-tab-content-mounted` — adversary round 1

**Verdict: BLOCKED — 2 BLOCKER, 3 MAJOR, 4 MINOR.** Both blockers and two of the three majors are text-only repairs in one delta file; one major (M3) asks for the single spare arrangement group.

Round 1 of at most 3. Change mode, 2026-10-05, tree at `3f83cf9` plus the untracked change folder. Read whole: the change folder (proposal, design, tasks, delta), `docs/plans/system-hud/chain.md`, the 15 rulings, the dispositions, live `system-console`, `sighting-log`, and the `system-space-view` requirements that name the log, the pile or the sweep settle. Code read to test claims: `SystemSpaceView.tsx`, `ConsoleDock.tsx`, `SightingLog.tsx`, `VitalsStripFleetCell.tsx`, `use-sightings.ts`, `use-system-space.ts`, `query-client.ts`, `query-keys.ts`, `SystemSpaceView.sighting-log-mount-ordering.test.tsx`, `@tanstack/query-core` `queryObserver.js:240-262`, the e2e specs' sightings and Escape usage. Nothing was run; nothing was edited.

Paths below are relative to `/Users/travis/Projects/hexaverse/`. "delta" is `openspec/changes/keep-console-tab-content-mounted/specs/system-console/spec.md`.

What was attacked and held (not findings): the 39 scenarios each map to a task; 39 is an honest count in the predecessor's unit (1.12 is one walk in a file whose only arrangement is the cold settling read, 2.5 is one key sequence over two focus rows); every "no request" scenario is placed in the real-hook file and the no-mark statement is correctly named as the only tier-1 remount witness; no other invalidation in the tree reaches `['sightings','pile','all']` (grep: only `use-sightings.ts` and the key factory), so D-4's "exactly this key" holds; no other non-test code handles Escape; React Query's optimistic `isFetching` on a stale mount is as design D-3 reads it; the action inbox read runs no resolve fold, so the watcher does arm on a past-ETA sweep and D-3's "the records appear" holds on the main path; no scope fence is crossed.

---

## BLOCKERS

### B1 — The new scenario "A later re-read of the interior … issues no pile request" is false for the change's own build on the settle path, and contradicts two live requirements

**Spec text.** delta:167, the new sentence of the MODIFIED requirement:

> Once that read has answered or failed, a later re-read of the interior SHALL NOT remove the log from the panel and SHALL NOT of itself cause the log to read.

delta:205-209:

> #### Scenario: A later re-read of the interior neither removes the log nor issues a pile read
> - **GIVEN** the interior read the view opened with has finished, the log is present and its first pile read has been answered, and no sweep has settled in the view
> - **WHEN** the view re-reads the interior
> - **THEN** the log is still present with the rows it listed
> - **AND** that re-read issues no pile request

**Evidence.** The precondition is "no sweep **has settled**", which is true in exactly the two states where the build must read the pile after an interior re-read:

1. A sweep is running and its ETA passes. Before the settling read no sweep has settled; the WHEN (the view re-reads the interior) is the settling read; task 4.2 then invalidates `queryKeys.sightings.pile(null)` from `onSettled`, inside `resyncInterior().then(...)` (`SystemSpaceView.tsx:144-147`). Live `sighting-log` *The log refetches after a sweep settles* (`openspec/specs/sighting-log/spec.md:155-157`) requires that read; this scenario forbids it.
2. A past-ETA sweep is still unsettled. `onSettled()` runs after every attempt, settled or not (`SystemSpaceView.tsx:144-147`, re-armed at `:181`), and design.md D-4 and Risks say so ("the settle watcher's retry loop re-reads every loaded log page per attempt"). Live `system-space-view` (`spec.md:2473-2477`) requires it: "IF that interior refetch fails, or completes without the sweep having settled, THEN the system SHALL re-attempt the interior refetch … and SHALL re-issue the follower reads after each such attempt". No sweep has settled, the view re-reads the interior, and a pile request follows.

tasks.md:12 (1.8) already arranges the row correctly as "a re-read of the interior **with no sweep running**"; the scenario does not say that. "of itself" in the requirement sentence is the only thing standing between the sentence and the same contradiction, and it is not decidable.

**What it permits.** A build that reads the scenario literally and suppresses the pile invalidation on the watcher's unsettled attempts (or QA marking the correct build FAIL in the retry state) satisfies this delta and breaks the drift closure the chain row names as a deliverable. After archive the live spec carries a scenario a later adversary finds false on arrival.

**Fix (principle: state the precondition as what the view last read, and name the owner of the exception instead of "of itself").** Paste-ready:

Requirement sentence —

> Once that read has answered or failed, a later re-read of the interior SHALL NOT remove the log from the panel, and SHALL NOT be followed by a pile read except where a sweep's settle path reads the pile after it (`system-space-view` *A Running Sweep Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the Pile*; `sighting-log` *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer*).

Scenario —

> - **GIVEN** the interior read the view opened with has finished, the log is present and its first pile read has been answered, and no own fleet in the open system has a sweep running or past its ETA and unsettled, as the view last read it
> - **WHEN** the view re-reads the interior on its baseline cadence
> - **THEN** the log is still present with the rows it listed
> - **AND** no pile request follows that re-read

**New arrangement group:** no. Task 1.8's last row and 1.13 already arrange "no sweep running".

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — BLOCKER. Apply the fix as proposed: the scenario's precondition becomes "no own fleet has a sweep running or past-ETA unsettled, as the view last read it", and the requirement's "of itself" is replaced by the named exception (the settle re-read `sighting-log` owns). No new group.

### B2 — The warm-cache scenario demands a first pile read that RULING 4 says a correct build does not issue

**Spec text.** delta:193-197:

> #### Scenario: The log reads nothing while the re-read of an interior the view already held is in flight
> - **GIVEN** the view has opened on a system whose interior it already held, and the re-read of that interior is in flight
> - …
> - **AND** once that re-read has answered or failed the log's first pile read is issued

**Evidence.** RULING 4 (`docs/handoffs/keep-console-tab-content-mounted-rulings.md:79-91`): "The app-wide 60 s stale time means a mount inside it issues no request … The scenario's GIVEN names a document load (a cold cache). The log's query options are not changed." The cold scenario was qualified accordingly (delta:63, "the view was opened by loading the document"). This one cannot be a document load — its GIVEN is a client-side return to a held interior — and it carries no qualification. The unfiltered pile's key is not per system (`frontend/lib/query-keys.ts:104`, `['sightings','pile','all']`), so the entry the log mounts on in system B is the one read in system A. Reachable: leave B, open A (pile read), open C or press Refresh in A, return to B more than 60 s after B's last poll and less than 60 s after the last pile read. B's interior is stale and re-read, the latch opens when it answers, the log mounts on a fresh entry and issues nothing (`frontend/lib/query-client.ts:78`, `use-sightings.ts` sets no `staleTime`). This is the predecessor's round-1 B1 again ("An 'open is a read' assumption is only true on a cold cache", chain.md, link 2b-i Taught).

**What it permits.** The scenario is false for the designed build in that state. The only build that satisfies it everywhere forces a read on every mount — the alternative RULING 4 rejected ("changes `use-sightings` for a pre-existing gap and adds a request per view open"). Tier 1 will not notice: the harness client's stale time is 0.

**Fix (principle: RULING 4's own — qualify the GIVEN, keep the positive assertion the test makes).** Paste-ready:

> - **GIVEN** the view has opened on a system whose interior it already held, the re-read of that interior is in flight, and the client holds no answer of the unfiltered pile newer than it keeps a read fresh
> - **WHEN** the view renders, with the dock collapsed and then with it expanded
> - **THEN** no read of the unfiltered pile is issued and no log content is present in either state
> - **AND** once that re-read has answered or failed the log's first pile read is issued

and one line in the proposal's cost bullet for RULING 4 ("…a mount inside the window issues no request") saying it applies to the warm arm as well as the cold one.

**New arrangement group:** no. Task 1.13 runs on a stale entry already.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — BLOCKER. Qualify the warm-cache scenario's GIVEN exactly as RULING 4 qualified the cold one (no pile read answered within the stale window — arranged as the tier-1 harness arranges it), so the THEN demands no read a correct build withholds. No new group.

---

## MAJOR

### M1 — The Escape requirement is not silent on the state RULING 7 leaves; it mandates the drift's outcome in one sentence and denies it in another

**Spec text.** delta:85:

> WHEN Escape is pressed while the dock is expanded, anywhere in the system space view, the dock SHALL collapse, unless the fleet cell's open menu takes the key (*The Fleet Cell's Chevron and Menu Are Keyboard-Operable*: keyboard focus on the chevron or on one of the menu's entries), in which case the dock SHALL NOT collapse.

and, same paragraph:

> While the dock is collapsed, Escape SHALL leave it collapsed …; the fleet cell's open menu still closes on it, as its own requirement states.

**Evidence.** RULING 7 (rulings.md:115-134): the requirement "promises the dock stays expanded only when the open menu takes the key, and **is silent** on an open menu that does not hold focus", and rejects "A scenario for the unfocused state (writes the drift's behaviour into a second requirement)". As written the first sentence is a universal with one exception pinned to focus, so with the menu open and focus elsewhere the dock SHALL collapse — the drift's behaviour, written as a SHALL with no scenario. The last sentence then says the open menu "still closes" on Escape with no focus condition, which is the sentence `drift-fleet-menu-ignores-escape-when-unfocused.md` records as false (`VitalsStripFleetCell.tsx:92-116`: both handlers are element `onKeyDown`s).

**What it permits.** Two readings. (a) A test author writes "menu open, focus on a camera control, Escape: dock collapsed, menu open" from the first sentence and canonises the drift. (b) The change that later fixes the drift (the menu closes from anywhere) must then either leave the dock collapsing on the same press — "One press of Escape SHALL do one thing" forbids it — or MODIFY this 11-scenario requirement to move the exception off focus. RULING 7's reversal cost was recorded as "None — a later change takes the drift whole"; with this wording it is not none.

**Fix (principle: state the exception by its owner, and say out loud what is not stated).** Paste-ready replacements:

> WHEN Escape is pressed while the dock is expanded, anywhere in the system space view, the dock SHALL collapse, unless the fleet cell's open menu takes the key as *The Fleet Cell's Chevron and Menu Are Keyboard-Operable* has it do, in which case the dock SHALL NOT collapse. This requirement states the outcome while that menu is closed and while it is open with keyboard focus on the chevron or on one of its entries; it does not state what Escape does to the dock while the menu is open with keyboard focus elsewhere.

> While the dock is collapsed, Escape SHALL leave it collapsed and SHALL change no space-view selection and no acting fleet; what Escape does to the fleet cell's menu is that requirement's alone.

**New arrangement group:** no.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — MAJOR. Apply both paste-ready replacements verbatim; this is RULING 7 made true of the text. No new group.

### M2 — The gate sentence does not say what happens when the view opens with no interior read at all

**Spec text.** delta:167:

> The log SHALL NOT issue its first pile read, and the panel SHALL show no log content, until the interior read the view opened with — its first load, or the re-read of an interior the view already held — has answered or failed; until then the Log tab's panel SHALL show a waiting indication…

delta:60: "it SHALL be issued no earlier than the moment the interior read the view opened with has finished".

**Evidence.** design.md D-3, "What opens it": "a view with no interior read to wait for (a return inside the interior's 60 s stale window…); a paused read (offline…)". Neither is in the requirement. A return inside the stale window issues no interior read at mount, so "the interior read the view opened with" has no referent, and the first interior read after it is the 20 s poll (`SystemSpaceView.tsx:618-622`).

**What it permits.** Two builds satisfy the text: the designed one (log present from the first render) and one that holds the waiting indication until the first poll answers, up to 20 s, on every quick return — and QA has no sentence to choose between them. Every existing hook-mocking harness renders exactly this state (`isLoading: false`, nothing in flight) and expects the log, so the build is pinned by tests and unpinned by the spec.

**Fix (principle: name the empty case; do not canonise the filed ordering gap while doing it).** Paste-ready, after the gate sentence:

> A view that opens with no interior read in flight — it holds an interior it does not re-read at open — has no such read to wait for: the log is then present from the view's first render, and this requirement imposes no wait. The ordering *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* requires is that requirement's and is not relaxed by this one.

Side note for the ruling, not a separate finding: "has answered or failed" also excludes the paused read D-3 lists as opening the latch. That wording is live today and the paused state is already in task 5.10's list; the sentence above ("no interior read in flight") covers it if the orchestrator wants it covered.

**New arrangement group:** no (the state is the default of the existing harnesses; a `toBeInTheDocument` on the log in 1.14's first row is enough if a named observer is wanted).

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — MAJOR. Apply the paste-ready sentence, worded on "no interior read in flight" so the paused read design.md D-3 lists is covered too; name the log's presence in 1.14's first row as its observer. No new group.

### M3 — The warm-cache arm of the latch is observed at no tier against the value that decides it

**Spec/tasks text.** tasks.md:17 (1.13): "the interior mock held with `isLoading: false, isFetching: true` at mount". tasks.md:55 (5.2): "the warm-cache latch is tier 1's (1.13, 1.14) … otherwise UNTESTED, never failed". design.md D-3: "This is load-bearing; it was read, not executed, and tier 1 cannot see it because the hook is mocked there."

**Evidence.** The scenario at delta:193 and live `sighting-log` *A mount during an unsettled past-ETA sweep reads the pile after the settling read* on a return to a held system — the reason RULING 2 gives for building the latch at all — both rest on `isFetching` being true on render one of a stale mount. 1.13 runs in `SystemSpaceView.sighting-log-mount-ordering.test.tsx`, which mocks `useSystemSpace` (`:62`) and `useSightings` (`:90-93`): the test hands the view the value whose derivation is the claim. The journey cannot arrange it. "Tier 1 cannot see it" is a choice of harness, not a limit: the new file 1.x already runs the real `useSightings` over a mocked service, and `hooks/use-system-space.test.tsx:11-20` shows the real interior hook over a mocked `systemService`. The chain taught this twice (2a-ii: "Lifting state moves a derivation out from under its only test"; 2a-iii-b: "a test that hand-sets … observes an arrangement, not the derivation").

**What it permits.** Any change to when the first result reports the fetch (a React Query upgrade, an `isRestoring` path, a wrapper that adds `placeholderData`) opens the latch one render early; the log then reads the pile alongside the settling re-read, every test is green and the scenario RULING 2 exists for is false with nothing scheduled to notice.

**Fix (principle: one observer over the real derivation, or an explicit ruling that there is none).** Either spend the spare group — paste-ready task:

> - [ ] 1.15 SDET: test the warm arm over the real interior hook, in the real-`useSightings` file with `systemService.getSystemSpace` mocked and the query client pre-seeded with a stale interior for the system (`setQueryData` with an old `updatedAt`): at mount the interior re-read is in flight and held, no unfiltered pile call has been made after the first commit and after a flush, and exactly one is made once the re-read resolves (content: "The log reads nothing while the re-read of an interior the view already held is in flight", against the derivation and not a hand-set `isFetching`); a build that keeps `!interior.isLoading` reads at once and fails it; red before 4.1

— or rule it accepted and move design.md's Risks line into the proposal's "Costs said out loud" so the gap is in the record a later link reads.

**New arrangement group:** YES — this is the one the cap leaves room for (39 → 40). If the orchestrator spends it elsewhere, take the second option.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — MAJOR. The spare group is spent here: add task 1.15 as written (FULL-AUTO RULING 16). The change is then at 40 tasks, the cap, with no headroom; a further arrangement group from any later round triggers RULING 13's seam. design.md D-3's "tier 1 cannot see it" sentence is corrected to name 1.15.

---

## MINOR

### m1 — "the statement that row carries … as the collapse left them" makes a stale no-mark statement mandatory

**Spec text.** delta:5: "the row the player selected and the statement that row carries … are as the collapse left them … Whether a row is highlighted still follows what the scene draws …, so a highlight is kept only while its ghost is still drawn."

**Evidence.** The highlight is tied to the scene; the statement is not. `SightingLog.tsx:121,197` keeps `noMarkRowId` until another row is selected. Live `sighting-log` (`spec.md:223-236`) makes the statement a claim about "no ghost **currently** drawn", and lists "any row while the canvas region is unavailable" as a reason — a state that ends (context recovery, the ghost feed's retry succeeding, a settle re-read bringing the record onto the layer's page). The scenario at delta:18-21 fences this with "the ghosts the scene draws do not change", but the requirement sentence has no such fence, so it now requires "This record has no mark in the open system" to persist over a mark that is drawn. Pre-existing while open; newly a SHALL.

**Fix.** Append to that sentence: "…and this requirement states nothing about the statement of a row whose record came to have a ghost drawn while the dock was collapsed."

**New arrangement group:** no.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — MINOR. Append the proposed clause. No new group.

### m2 — Task 4.3 builds a `preventDefault` no requirement, scenario or test asks for

**Text.** tasks.md:48 (4.3): "calls the shell's existing `handleCollapse` and prevents the event's default". design.md D-5: "so a later listener (link 4's) can tell the press was used".

**Evidence.** RULING 14 deleted the composition guard on this basis: "code traces to a scenario; unrequested hardening is not built", reversible by "one condition added by the change that first" needs it. The same reasoning applies: nothing in the delta observes it, no row of 2.1-2.6 asserts it, and its only stated consumer is link 4.

**Fix.** Either delete the clause from 4.3 and D-5 (link 4 adds it with the listener that reads it), or keep it and add `event.defaultPrevented` to the closing assertion of 2.1 (an assertion, not a group). The first matches RULING 14.

**New arrangement group:** no.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — MINOR. Delete the `preventDefault` clause from task 4.3 and from design.md D-5 (the first option; same basis as RULING 14). Link 4 adds it with the listener that reads it; add that as a chain note in 5.9.

### m3 — The journey's settle leg orders the pile read against a response the early-settle exit does not have

**Text.** tasks.md:55 (5.2): "an unfiltered `GET /v1/sightings` is seen on the wire after the settling interior response and before any expansion … logging which settle exit fired".

**Evidence.** On the early-settle exit there is no settling interior read: the trigger is the running-status inbox read answering with nothing running (`SystemSpaceView.tsx:429-441`; tasks.md:15 states the reference correctly as "after that read has answered and not before"). At the e2e stack's world scale 5 a short sweep settling inside the commit round trip is the likelier exit, and the leg as written then has no response to order against — it fails a correct build or passes on an unrelated interior poll.

**Fix.** In 5.2: "…after the settling interior response on the ETA exit, or after the acting fleet's running-status inbox response that carried no running sweep on the early-settle exit, the exit decided and logged before the ordering is asserted".

**New arrangement group:** no.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — MINOR. Apply the proposed 5.2 wording.

### m4 — Bookkeeping the gate will trip on

- tasks.md:60 (5.7) expects the rehearsal diff to show "its first scenario's GIVEN changed and three scenarios added to it, and nothing else". The delta changes **two** carried GIVENs: delta:170 and delta:212 ("A settled sweep's report link expands a collapsed dock to the Log tab", the accepted A8 edit). proposal.md:12 says "one scenario's GIVEN" too. An orchestrator following 5.7 reads a correct archive as a wrong one. Fix both to "two carried scenarios' GIVENs (the first, and the report link's on a collapsed dock)".
- proposal.md:3 ("(13)"), proposal.md:49 and design.md:3 ("RULINGs 1-13") predate RULINGs 14 and 15. Fix: "1-15".
- The carried scenario "The log's loading, empty and failed states appear in the panel" (delta:174-176) is named by no task; 3.1's list (tasks.md:35) omits it. Add it to 3.1's list — the file 3.1 re-reads holds its test.
- tasks.md:12 (1.8): the interior-re-read row is green on arrival (nothing invalidates the pile from `resync` today) and the box does not say so, against section 1's own header rule. Add "the last row is green on arrival and is the control".

**New arrangement group:** no.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — MINOR. Apply all four bookkeeping fixes (cite "RULINGs 1-16" after this round).

---

## Malicious-implementer pass on the four ADDED requirements (for the record)

- *A Tab's Content Stays Mounted…*: mount-on-show fails 1.3 (statement lost) and 1.1/1.5/1.8 on the stale entry; `visibility`/`opacity` hiding fails 1.4's Tab walk. Lifting the statement to the view and remounting passes 1.3 and still fails 1.8. Holds, subject to m1.
- *Showing or Hiding the Log Tab Issues No Read*: mount-on-show fails 1.7; a link that refetches fails 1.8. The first read has a lower bound and no upper bound ("no earlier than"), which the MODIFIED block's "once … the log's first pile read is issued" closes once B2 is repaired. Holds.
- *Escape Collapses the Expanded Dock*: a `keyup` listener, a capture listener, an always-focus-Console collapse and an ignore-editable-target build each fail a named row. The unfocused-menu state is M1. The mechanism's wider yield (any `defaultPrevented`) is disclosed in design.md Open Questions and has no second handler in the tree today (grep); not re-filed.
- *Activating the Dock Changes No Space-View Selection*: unfalsifiable at tier 1, and tasks.md says so; the journey's two empty-area presses and the "Console" press are its only observers. Holds as disclosed.

**Verdict: BLOCKED** (B1, B2). With B1, B2, M1 and M2 repaired as text and M3 ruled either way, I expect round 2 to be a diff spot-check.

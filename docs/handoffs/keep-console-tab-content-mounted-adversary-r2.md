# `keep-console-tab-content-mounted` — adversary round 2

**Verdict: NEEDS REVISION — 0 BLOCKER, 1 MAJOR, 3 MINOR.** All four are text-only residue of round-1 repairs. None needs a new test arrangement group; the change stays at 40 tasks and RULING 13's seam is not triggered.

Round 2 of at most 3. Change mode, 2026-10-05, tree at `3f83cf9` plus the untracked change folder. Scope: the nine round-1 findings and the 228-line `keep-console-tab-content-mounted-r1-to-r2.diff`; the untouched remainder was not re-attacked. Read: the revised delta, tasks.md and proposal.md whole, design.md's changed hunks, round 1 with its rulings, the rulings index and RULING 16, the chain doc's Link 2b-i-b section, "Open decisions" and "must not do". Code read to test the repairs: `frontend/components/space/SystemSpaceView.tsx` (watcher `:108-208`, early-settle exit `:429-441`, `resync` and the three refetch rules `:554-622`, the log's mount site `:811-822`, the ghost feed `:843-845`), `frontend/hooks/use-system-space.ts` and its test, `frontend/hooks/use-sightings.ts`, `frontend/lib/query-client.ts:75-88`, `SystemSpaceView.sighting-log-mount-ordering.test.tsx`, `@tanstack/query-core` `queryObserver.js:236-262`, `@tanstack/react-query` `useBaseQuery.js:42,53`. Nothing was run; nothing under `openspec/`, no code and no test was edited.

Paths are relative to `/Users/travis/Projects/hexaverse/`. "delta" is `openspec/changes/keep-console-tab-content-mounted/specs/system-console/spec.md`; "tasks" is that change's `tasks.md`.

Mechanical checks, all passing: 39 scenarios in the delta, each heading quoted by a task; 40 task boxes (15 + 6 + 6 + 3 + 10); the MODIFIED block carries all ten live scenario headings verbatim and adds three; its carried bodies differ from live in exactly two GIVENs (delta:170, delta:212), as tasks 5.7 now says; every requirement the delta cites by name exists in a live spec or in the delta. The unit holds: 1.14's new first row is a row of the same panel-state table (expected sequence `[log]` against `[waiting, log]`), and 1.15 is one arrangement with one closing count.

## Round-1 findings

| Id | Status | The line that shows it |
| --- | --- | --- |
| B1 | PARTLY | delta:206 "no own fleet in the open system has a sweep running or past its ETA and unsettled, as the view last read it" and delta:167 names the settle exception; "of itself" is gone. The replacement wording is temporal and unbounded: r2-M1. |
| B2 | FIXED | delta:194 "and the client holds no answer of the unfiltered pile newer than it keeps a read fresh"; proposal.md:21 names the warm arm. |
| M1 | FIXED | delta:85, both replacements verbatim: "it does not state what Escape does to the dock while the menu is open with keyboard focus elsewhere" and "what Escape does to the fleet cell's menu is that requirement's alone". |
| M2 | PARTLY | delta:167 "A view that opens with no interior read in flight … the log is then present from the view's first render"; delta:60 "where the view opened with one"; tasks:18 first row. The gloss leaves out the paused read the ruling asked to cover: r2-m1. |
| M3 | FIXED | tasks:19 (1.15); design.md:60, :129, :138 name it. The derivation is as 1.15 assumes (`queryObserver.js:248-257`, `useBaseQuery.js:42`). Wording residue: r2-m2. |
| m1 | FIXED | delta:5 "this requirement states nothing about the statement of a row whose record came to have a ghost drawn while the dock was collapsed". |
| m2 | FIXED | tasks:49 (4.3) and design.md D-5 "What it acts on" carry no `preventDefault` by the dock; tasks:63 (5.9) carries the note to link 4. |
| m3 | FIXED | tasks:56 (5.2) "or after the acting fleet's running-status inbox response that carried no running sweep on the early-settle exit, the exit decided and logged before the ordering is asserted". design.md:130 was not brought along: r2-m3. |
| m4 | FIXED | tasks:61 (5.7) "two carried scenarios' GIVENs"; proposal.md:3 "(16)", :12, :49 and design.md:3 "1-16"; tasks:36 (3.1) lists "The log's loading, empty and failed states appear in the panel"; tasks:12 (1.8) "green on arrival … and is the control". |

---

## MAJOR

### r2-M1 — B1's replacement forbids every pile read that comes after an interior re-read, not the ones a re-read triggers

**Spec text.** delta:167:

> Once that read has answered or failed, a later re-read of the interior SHALL NOT remove the log from the panel, and SHALL NOT be followed by a pile read except where a sweep's settle path reads the pile after it (…).

delta:206-209:

> - **GIVEN** … and no own fleet in the open system has a sweep running or past its ETA and unsettled, as the view last read it
> - **WHEN** the view re-reads the interior on its baseline cadence
> - **THEN** the log is still present with the rows it listed
> - **AND** no pile request follows that re-read

**Evidence.** Round 1 removed "of itself" as undecidable; what replaced it is "be followed by" and "follows", which are about order in time and have no end. The view re-reads the interior every 20 s (`SystemSpaceView.tsx:618-622`), so every pile read of a session after the first follows an interior re-read. Three reachable cases where the GIVEN holds, the WHEN happens and a correct build issues a pile request afterwards:

1. The player presses Refresh, Retry or load-more (live `sighting-log/spec.md:166-167`, "An explicit refresh reads the pile"). The delta's own "pile read" also covers the system-filtered read (delta:54), so the sightings-unavailable card's retry (`SystemSpaceView.tsx:932`) counts too.
2. The client's refetch on reconnect, which proposal.md:23 states as a cost under RULING 5 ("An always-subscribed log also refetches on network reconnect"); the view's reconnect rule re-reads the interior at the same moment (`:607-614`).
3. A scan commit is accepted and its first running-status read is in flight when the baseline poll fires. The view has read no running sweep, so the GIVEN holds; the poll re-reads the interior; the running-status read then answers with nothing running and the early-settle exit that task 4.2 builds reads the pile (`:429-441`). This is 1.11's arrangement with a poll tick in the window.

The requirement sentence is a universal with one exception, the shape RULING 5 cut ("the draft sentence 'the log's reads are those … and no others' is cut").

**What it permits.** Two readings. Read as cause, the text is true and task 1.8 tests it (count unchanged across the re-read). Read as written, it is false for the designed build in the three cases above, QA can mark case 3 FAIL against a correct build, and the archived live spec carries a sentence the next baseline audit finds false on arrival. No builder will block Refresh; the cost is a false SHALL and a THEN with no point at which a test may stop looking.

**Fix (principle: say what triggers the read, and give the THEN an end).** Paste-ready.

Requirement sentence —

> Once that read has answered or failed, a later re-read of the interior SHALL NOT remove the log from the panel, and the view SHALL NOT issue a pile read because a re-read of the interior answered or failed, except on a sweep's settle path, where it does (`system-space-view` *A Running Sweep Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the Pile*; `sighting-log` *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer*). A pile read with another cause is outside this sentence, whenever it falls.

Scenario (heading unchanged) —

> - **GIVEN** the interior read the view opened with has finished, the log is present and its first pile read has been answered, no own fleet in the open system has a sweep running or past its ETA and unsettled, as the view last read it, and no scan commit is awaiting its first running-status answer
> - **WHEN** the view re-reads the interior on its baseline cadence and that re-read answers, nothing else being invoked meanwhile
> - **THEN** the log is still present with the rows it listed
> - **AND** the number of pile requests issued is what it was before that re-read was issued

**New arrangement group:** no. Task 1.8's last row already asserts exactly this ("the request count of the service boundary unchanged"); no task text changes.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED at the severity stated — residue of a round-1 repair. Apply the paste-ready fix as written; no new arrangement group; the change stays at 40 tasks (FULL-AUTO RULING 17).

---

## MINOR

### r2-m1 — M2's sentence glosses "no interior read in flight" as a held interior, which leaves the paused read out

**Spec text.** delta:167:

> A view that opens with no interior read in flight — it holds an interior it does not re-read at open — has no such read to wait for: the log is then present from the view's first render, and this requirement imposes no wait.

**Evidence.** The round-1 ruling on M2: "worded on 'no interior read in flight' so the paused read design.md D-3 lists is covered too". The appositive defines the case as a held interior. A view opened offline with no cached interior holds none; its read is paused, so `isLoading` and `isFetching` are both false and the latch of task 4.1 opens (design.md:62, "a paused read (offline: `fetchStatus` is `paused`…)"). The sentence before it then applies: the log SHALL NOT be shown "until the interior read the view opened with — its first load … — has answered or failed", and that read has done neither. The build shows the log (its empty state, design.md:141). Pre-existing in the live wording under today's `!interior.isLoading` gate; the ruling asked for it to be closed here and the gloss did not.

**What it permits.** A reader holds the designed build to the gate sentence in the offline state and files it as a defect, or builds a gate that waits on a paused read and shows the waiting indication for as long as the client is offline.

**Fix.** Replace the appositive:

> A view that opens with no interior read in flight — it holds an interior it does not re-read at open, or its interior read has not been sent because the client is offline — has no such read to wait for: …

**New arrangement group:** no. If an observer is wanted it is one more row of 1.14's table (interior mock `data: undefined, isLoading: false`, nothing fetching; expected sequence `[log]`), green on arrival. Otherwise say in task 5.10's paused record that the clause has no test.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED at the severity stated — residue of a round-1 repair. Apply the paste-ready fix as written; no new arrangement group; the change stays at 40 tasks (FULL-AUTO RULING 17).

### r2-m2 — Task 1.15 does not say how the real interior hook runs in a file that mocks it, and its red has two possible reasons

**Text.** tasks:19:

> 1.15 SDET: test the warm arm over the real interior hook, in the real-`useSightings` file with `systemService.getSystemSpace` mocked … no unfiltered pile call has been made after the first commit and after a flush, and exactly one is made once the re-read resolves …; a build that keeps `!interior.isLoading` reads at once and fails it; red before 4.1

**Evidence.** The task is arrangeable and it does fail the build it names: a pre-seeded entry on the harness client (stale time 0) makes `shouldFetchOnMount` true, `createResult` applies the fetch state before any listener is attached, so render one has `isLoading` false and `isFetching` true; an always-mounted log behind `!isLoading` reads on render one, and a React Query that stopped reporting the optimistic fetch would open the latch on render one too. Two things are missing from the box:

1. Task 1.8 in the same file drives "the interior mock's `isFetching` true then false", so that file mocks `@/hooks/use-system-space`, and a `vi.mock` is file-wide. 1.15 needs that mock to hand through to the actual hook for one test. Possible (`vi.importActual`, as `use-fleets` is mocked at `SystemSpaceView.sighting-log-mount-ordering.test.tsx:63-72`), unstated.
2. The box does not say whether the dock is expanded. Today's build mounts the log only while shown (`SystemSpaceView.tsx:811`). Collapsed, today's build issues no unfiltered call at all and is red at "exactly one is made", which is 1.7's reason. Expanded, it reads while the re-read is held, which is the warm-arm reason the box names. The section header requires that "every red is seen for its stated reason".

**What it permits.** An SDET arranges it collapsed, sees red, and records a red that says nothing about the warm arm; or spends a dispute on the mock.

**Fix.** Paste-ready replacement of the box:

> - [ ] 1.15 SDET: test the warm arm over the real interior hook, in the real-`useSightings` file, with that file's `useSystemSpace` mock handing through to the actual hook (`vi.importActual`) for this test only, `systemService.getSystemSpace` mocked and the query client pre-seeded with a stale interior for the system (`setQueryData` with an old `updatedAt`): at mount the interior re-read is in flight and held, no unfiltered pile call has been made after the first commit and after a flush with the dock collapsed, nor after the dock is then expanded with the re-read still held, and exactly one is made once the re-read resolves (content: "The log reads nothing while the re-read of an interior the view already held is in flight", against the derivation and not a hand-set `isFetching`); a build that keeps `!interior.isLoading` reads while the re-read is held and fails it; red before 4.1 for that reason, seen at the expansion (collapsed, today's build issues none, which is 1.7's red and not this one's)

**New arrangement group:** no. Same arrangement, same closing assertion.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED at the severity stated — residue of a round-1 repair. Apply the paste-ready fix as written; no new arrangement group; the change stays at 40 tasks (FULL-AUTO RULING 17).

### r2-m3 — Bookkeeping left by the repairs

- tasks:17 (1.13), the clause B2's repair added: "the harness client's default `staleTime` of 0 is what leaves the unfiltered pile with no answer fresher than a read is kept". 1.13 runs "in the same harness as 1.12", the mount-ordering file, which mocks `useSightings` (`SystemSpaceView.sighting-log-mount-ordering.test.tsx:90-95`). No pile entry exists there and the client's stale time decides nothing; "issued" in that file is `useSightings(null)` having been called. The qualified GIVEN is arranged over the real hook only by 1.15's fresh client. Replace the clause with: "`useSightings` is mocked in this file, so a read is `useSightings(null)` having been called and the scenario's qualified GIVEN (RULING 4) holds trivially; 1.15's fresh client arranges it over the real hook".
- Same box, same file: `useRunningScan` is a constant returning a past-ETA sweep (`:84`). 1.13 lists "A later re-read of the interior neither removes the log nor issues a pile read" as content, and B1's repair made that scenario's GIVEN "no own fleet … has a sweep running or past its ETA and unsettled". Add to 1.13: "the later-re-read row overrides the file's past-ETA `useRunningScan` to no running sweep".
- tasks:1, the section 1 heading says "plus 1.12 in the existing mount-ordering file"; 1.13 is there as well. Make it "plus 1.12 and 1.13".
- design.md:130 still reads "the unfiltered re-read on the wire after the settling interior response and before any expansion". m3 changed tasks 5.2 and not this line. Append: "on the ETA exit, or after the running-status inbox response that carried no running sweep on the early-settle exit".

**New arrangement group:** no.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED at the severity stated — residue of a round-1 repair. Apply the paste-ready fix as written; no new arrangement group; the change stays at 40 tasks (FULL-AUTO RULING 17).

---

## Attacked and held in the revised text (not findings)

- B2's GIVEN is satisfiable and its THEN is true of the designed build: with no fresh pile answer a mounting log reads, and 1.15's fresh client arranges it.
- M1's two sentences agree with proposal.md:10 and :24 and with task 5.10; the proposal describes what the build does in the unstated state, the requirement does not state it.
- M2's "is not relaxed by this one" does not canonise the filed gap (a return inside the interior's stale window with a past-ETA sweep); 5.10 still files it.
- Removing the dock's `preventDefault` breaks no row of 2.1-2.6: 2.5's held-key row rests on `event.repeat`, and nothing listens after `window`.
- delta:133 "the press issues no network request" is the causal form and is what 1.8 observes.
- 1.8's last row is green on arrival as its box now says: neither the baseline poll, the arrival timer nor the SSE reconnect rule touches a sightings key (`SystemSpaceView.tsx:573-622`).
- No scope fence of the chain doc is crossed by any repair.

**Verdict: NEEDS REVISION** (r2-M1; r2-m1 to r2-m3 with it). Four text edits, no new arrangement group, 40 tasks stand.

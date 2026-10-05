# `keep-console-tab-content-mounted` — adversary round 3

**Verdict: CLEAR — 0 BLOCKER, 0 MAJOR, 1 MINOR (r3-m1, carried into the implementation contract; no spec edit needed for the spec to be true).** The four round-2 findings are fixed. The spec is implementation-ready.

Round 3 of at most 3, the last. Change mode, diff spot-check, 2026-10-05, tree at `3f83cf9` plus the untracked change folder. Scope: the four round-2 findings and the 59-line `keep-console-tab-content-mounted-r2-to-r3.diff`; nothing outside the changed clauses was re-attacked. Read: the diff, round 2 with its rulings, the rulings index, tasks.md sections 1, 2 and 5, the delta's Log-home requirement and its scenarios (delta:164-212), design.md D-3, "Tests" and "Risks", and the three live requirements the revised sentence names (`openspec/specs/system-console/spec.md:1237-1239`, `openspec/specs/sighting-log/spec.md:123-163`, `openspec/specs/system-space-view/spec.md:2436` onward). Code read to test the revisions: `frontend/hooks/use-system-space.ts`, `frontend/hooks/use-sightings.ts`, `frontend/components/space/SystemSpaceView.tsx` (`:108-208`, `:429-441`, `:478-518`, `:554-622`, `:723-745`, `:811-845`), `frontend/lib/query-client.ts:75-88`, `frontend/lib/services/index.ts`, and the mock blocks of `SystemSpaceView.sighting-log-mount-ordering.test.tsx:62-95` and `SystemSpaceView.console-dock.test.tsx:37,78`. Nothing was run; nothing under `openspec/`, no code and no test was edited.

Paths are relative to `/Users/travis/Projects/hexaverse/`. "delta" is `openspec/changes/keep-console-tab-content-mounted/specs/system-console/spec.md`; "tasks" is that change's `tasks.md`.

Mechanical checks: 40 task boxes, 39 scenarios, both unchanged. The diff changes no scenario heading and no carried scenario's body (the edited scenario is one of the three added ones), so tasks 5.6 and 5.7 still describe the archive diff. No leftover "of itself", "be followed by a pile read" or "no pile request follows" anywhere in the change folder.

## Round-2 findings

| Id | Status | The line that shows it |
| --- | --- | --- |
| r2-M1 | FIXED | delta:167 "the view SHALL NOT issue a pile read because a re-read of the interior answered or failed, except on a sweep's settle path, where it does (…). A pile read with another cause is outside this sentence, whenever it falls." delta:206 "…and no scan commit is awaiting its first running-status answer"; delta:207 "…and that re-read answers, nothing else being invoked meanwhile"; delta:209 "the number of pile requests issued is what it was before that re-read was issued". Verbatim the ruled text. |
| r2-m1 | FIXED | delta:167 "it holds an interior it does not re-read at open, or its interior read has not been sent because the client is offline". Verbatim the ruled text. The follow-on the finding offered under "New arrangement group" (a 1.14 row, or a line in 5.10's paused record) was taken in neither form: r3-m1. |
| r2-m2 | FIXED | tasks:19 (1.15) "with that file's `useSystemSpace` mock handing through to the actual hook (`vi.importActual`) for this test only … with the dock collapsed, nor after the dock is then expanded with the re-read still held … red before 4.1 for that reason, seen at the expansion (collapsed, today's build issues none, which is 1.7's red and not this one's)". Verbatim. |
| r2-m3 | FIXED | All four items. tasks:1 "plus 1.12 and 1.13 in the existing mount-ordering file"; tasks:17 (1.13) "`useSightings` is mocked in this file, so a read is `useSightings(null)` having been called and the scenario's qualified GIVEN (RULING 4) holds trivially; 1.15's fresh client arranges it over the real hook; the later-re-read row overrides the file's past-ETA `useRunningScan` to no running sweep"; design.md:130 "…on the ETA exit, or after the running-status inbox response that carried no running sweep on the early-settle exit". |

## The revised clauses, attacked

**delta:167, the causal sentence.** True of the designed build. The only pile reads issued because an interior re-read resolved are the watcher's `onSettled` inside `resyncInterior().then` (`SystemSpaceView.tsx:144-147`), which is the named exception; the baseline poll, the arrival timer and the reconnect rule chain only the scan-target read after `resync` (`:573-578`, `:603`, `:611`, `:620`). The early-settle exit reads the pile because the running-status read answered, not an interior re-read (`:429-441`), so it is "another cause" and also on the settle path. "answered or failed … where it does" holds on the failed arm too: `interior.refetch()` resolves on a failed read (it does not reject without `throwOnError`), so the watcher's fulfilled branch runs. Consistent with `sighting-log` *The log does not poll while open* (GIVEN no sweep running) and with the two requirements it cites. It is no longer the universal RULING 5 cut.

**delta:205-209, the scenario.** Arrangeable: task 1.8's last row is the arrangement (interior mock `isFetching` true then false, the baseline poll fired, no scan committed, service-boundary count compared). The THEN has an end (the re-read's answer). A build that invalidates the pile from `resync` or from the poll raises the count and fails; the three round-2 counter-cases (Refresh, reconnect, a commit in its pending window) are each excluded by the GIVEN or the WHEN.

**delta:167, the offline appositive.** True of the designed build: with the default network mode (`lib/query-client.ts:75-88` sets none) an interior query with no cached entry is `pending`/`paused` offline, so `isLoading` and `isFetching` are both false and D-3's latch opens on render one (design.md:62 lists it). It does not contradict the gate sentence, whose "the interior read the view opened with" has no referent in this case. One loose end: r3-m1.

**tasks:19 (1.15).** Arrangeable. The view calls `useSystemSpace(systemId)` with no options (`SystemSpaceView.tsx:259`) and the harness pattern is a `vi.fn` behind the module mock (`console-dock.test.tsx:37,78`), so one test can set its implementation to the actual export; `systemService` and `sightingService` come from the same `@/lib/services` barrel the file already mocks at the service boundary; `useSystemSpace` sets no `staleTime`, so a pre-seeded entry on the harness client is stale and is re-read on mount. Today's build fails it for the stated reason and only at the expansion: `:811` mounts the log when `dock.expanded && !interior.isLoading`, and `isLoading` is false over a held re-read of a seeded entry. The designed build issues none while held and exactly one on resolve (the ghost feed's read at `:843` is system-filtered and is not counted).

**tasks:17 (1.13).** The two added clauses are true of the file: `useSightings` is mocked at `sighting-log-mount-ordering.test.tsx:90-95`, `useRunningScan` is a constant past-ETA sweep at `:82`. The override means making that factory switchable in a file 1.12 already edits; no dispute in it.

**design.md:130.** Now agrees with tasks 5.2 word for word on the two exits.

## MINOR

### r3-m1 — The offline clause has no observer and no note, and the corner it opens is not in 5.10's paused record

**Text.** delta:167:

> A view that opens with no interior read in flight — it holds an interior it does not re-read at open, or its interior read has not been sent because the client is offline — has no such read to wait for: the log is then present from the view's first render, and this requirement imposes no wait. The ordering *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* requires is that requirement's and is not relaxed by this one.

tasks:18 (1.14), the only observer of that sentence:

> a first row, a view opening with no interior read in flight (`isLoading: false`, nothing fetching), where the log is present from the first render

tasks:64 (5.10), the paused record:

> and a paused first pile read (offline) rendering the log's empty state, because `SightingLog.tsx:183-188` tests `isLoading`, which is false for a paused pending query (pre-existing, newly reachable at view open)

**Evidence.** Round 2 closed r2-m1 with two options for the new arm: one more row of 1.14 (`data: undefined, isLoading: false`, nothing fetching) or a line in 5.10 that the clause has no test. The r2-to-r3 diff touches neither box. Two consequences, both small:

1. 1.14's first row does not say whether the interior mock holds data. Arranged with data, it is the held-interior arm only. A latch that opens on "an interior is held or the read failed" (`interior.data != null || interior.isError`) instead of D-3's `!isLoading && !isFetching` passes every task (1.12-1.15 all arrange data or a failure) and shows the waiting indication for as long as the client is offline, which the clause forbids. The requirement text forbids that build; no test sees it.
2. When the client comes back online, the paused interior first load and the log's paused first pile read are sent together. With a past-ETA unsettled sweep that is the race `sighting-log/spec.md:129-137` orders against. The delta does not relax that ordering, so the spec is not false; the build has a corner of the same family as the gaps 5.10 already files (the first read inside the stale window, the join-in-flight first read), pre-existing under today's `!interior.isLoading` gate for the ghost feed and a hand-opened log, newly reachable at view open. 5.10's paused record names the empty state and not this.

**What it permits.** A build that waits on a paused read passes the suite; and a later baseline audit meets the offline-resume ordering gap with no record that it was known.

**Fix (no spec edit).** Either in the implementation contract or as two task-text edits:

- 1.14, first row, parametrise over the interior mock's data: "(`isLoading: false`, nothing fetching; once holding an interior and once with `data: undefined`, the offline arm)". The view renders with `interior.data` undefined and no error (`SystemSpaceView.tsx:478-518`, `:723-745` are all optional reads), so the row is arrangeable; green on arrival like its sibling.
- 5.10, append to the paused record: "and that on reconnect the paused interior first load and the paused first pile read are sent together, so with a past-ETA unsettled sweep the pile read is not ordered after the settling read (`sighting-log` *The Log Reads on Mount…*, not relaxed by this change)".

**(a) Carried unedited into implementation without the spec being false:** yes. The spec text is true and decidable as it stands; what is missing is a test row and a filing line, both of which the implementation contract can bind (the SDET arranges 1.14's first row with `data: undefined` as a second parameter; the orchestrator adds the sentence when it writes 5.10's record).

**(b) New test arrangement group:** no. One more parameter of 1.14's existing first row, same closing assertion; 40 tasks stand.

**Ruling (orchestrator, 2026-10-05):** CONFIRMED — MINOR, carried unedited (FULL-AUTO RULING 18). No spec edit and no further round: the implementation contract binds task 1.14's first row to include an interior with `data: undefined` and nothing in flight, and task 5.10's paused-read record carries the reconnect sentence.

---

## Attacked and held (not findings)

- "A pile read with another cause is outside this sentence, whenever it falls" licenses nothing: every other pile read is still governed by `sighting-log`'s three triggers and its no-timer rule, which this requirement says it does not restate.
- In the no-read-in-flight cases "Once that read has answered or failed, a later re-read … SHALL NOT remove the log" has no "that read"; the same case's own sentence ("present from the view's first render … imposes no wait") covers it, and the build that would exploit it (a live `!isFetching` gate) fails 1.13. The structure predates this diff and round 2 held it.
- 1.15's "exactly one … once the re-read resolves" is not disturbed by the baseline poll (20 s, not reached) or by the ghost feed.
- The scenario's new GIVEN clause ("no scan commit is awaiting its first running-status answer") is the default state of 1.8's harness; no task text needed to change, as the round-2 ruling said.

**Verdict: CLEAR.** One MINOR (r3-m1), to be settled in the implementation contract; no spec text is false, no new arrangement group, 40 tasks stand.

---

**Verdict commit: `805bfaa`** (2026-10-05). The verdict is current while `git diff 805bfaa -- openspec/specs/system-console openspec/specs/sighting-log openspec/specs/system-space-view openspec/changes/keep-console-tab-content-mounted` is empty.

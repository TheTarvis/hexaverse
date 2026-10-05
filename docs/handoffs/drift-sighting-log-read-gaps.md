# drift — seven gaps in when the sighting log and the ghost layer read, found and deliberately not fixed

Filed 2026-10-05 by the `keep-console-tab-content-mounted` orchestrator (task
5.10; FULL-AUTO RULINGs 4, 12, 13 and 18 of
`keep-console-tab-content-mounted-rulings.md`). Evidence of record:
`docs/handoffs/keep-console-tab-content-mounted-analysis.md` § 9 and § 8
(Q3, Q11), the architect's panel report A10/A15, and adversary r3-m1. All are
code readings; none was observed on a stack. File and line references are to
the tree at `3f83cf9` unless a later commit is named. **None is fixed.** Each
predates that change; where the change made one newly reachable, the entry
says so.

**Whose call.** Travis. Gaps 1-5 are about the letter of `sighting-log` *The
Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a
Timer* and `system-space-view` *A Running Sweep Self-Schedules the Refetch That
Settles It, Then Reads the Inbox and the Pile*; gaps 6-7 are states
`sighting-log` *The Log's Empty, Loading, and Failed States Are Each Explicit*
does not cover. **Status.** OPEN, all seven.

## 1. The settle watcher's disarm race

If the running-status read answers "nothing running" before the watcher's timer
fires, the effect is torn down and no follower read is issued — for the ghost
layer, the report, or the log. The timer effect is keyed on `eta` and its
cleanup clears the timer (`frontend/components/space/SystemSpaceView.tsx:136`,
`:138-205`); `eta` comes from `useRunningScan`, whose key
`queryKeys.actions.running(fleetId)` is shared with `useRunningMine`
(`frontend/hooks/use-actions.ts:23-44`) and is invalidated by a mine commit, a
cancel (`:57`) and a scan commit; any inbox read folds a due action
server-side. Reachable on a remount with a stale inbox entry. The log's mount
latch removes the commonest way for the log to meet it; the hole stays.

## 2. The ghost layer's warm-cache mount gate

On a return to a system whose interior is still cached, the ghost feed mounts
and reads alongside the interior re-read that settles a past-ETA sweep:
`SystemSpaceView.tsx:843` gates `SightingsGhostFeed` on `!interior.isLoading`,
which is false from the first render when the interior is held. The log got a
latch in `keep-console-tab-content-mounted` (`41ae157`); the ghost layer did
not.

## 3. The join-in-flight first read

A settle re-read requested while the cache entry's first read is unanswered
issues nothing, and the earlier answer — requested before the settle — is taken
as fresh (`node_modules/@tanstack/query-core/build/modern/query.js:166-178`: a
fetch requested while one is in flight cancels and restarts only when the query
already has data). Applies to the log's invalidation and to the ghost layer's
`refetch()` alike. The rejected fix (cancel, then invalidate) and why are in
the archived `add-console-dock` design.md D-11, last bullet.

## 4. The first read inside the interior's stale window

A return to a system within 60 s issues no interior read at all, so the log's
latch opens at once and its first pile read precedes the watcher's settling
read by `ETA_CUSHION_MS` (`frontend/lib/realtime.ts:24`). The settle re-read
corrects what is shown, but the letter of "first pile read … only after" is
unmet.

## 5. "Reads the pile when the log mounts" on a fresh cache entry

The app-wide stale time is 60 s (`frontend/lib/query-client.ts:78`) and
`useSightings` sets none of its own (`frontend/hooks/use-sightings.ts:27-36`):
a log that mounts within 60 s of any unfiltered pile read issues no request.
`sighting-log` says the log "SHALL read the pile when the log mounts". The
`system-console` scenarios added by `keep-console-tab-content-mounted` are
conditioned on a document load (RULING 4) and promise nothing here.

## 6. A failed load-more or re-read withdraws rows already listed

`frontend/components/space/SightingLog.tsx:176` shows the failed state whenever
the query is in error, with or without data, so a failed next-page fetch or a
failed re-read replaces listed rows with "could not be read". No scenario of
`sighting-log` says either way. **Newly reachable while the log is hidden:**
since `41ae157` the log stays mounted while the dock is collapsed, so a settle
re-read can fail unseen and the player can meet the failed state on expansion
in place of rows they saw earlier. Retry refetches every loaded page and
recovers.

## 7. A paused first pile read (offline) renders the log's empty state

`SightingLog.tsx:183-188` tests `isLoading`, which is false for a paused,
pending query, so an offline first read shows the empty state rather than a
loading or failed one. Pre-existing; newly reachable at view open. On reconnect
the paused interior first load and the paused first pile read are sent
together, so with a past-ETA unsettled sweep the pile read is not ordered after
the settling read (`sighting-log` *The Log Reads on Mount, After a Sweep
Settles, and on Explicit Refresh — Never on a Timer*, which this change does
not relax). Pre-existing under the `!interior.isLoading` gate for the ghost
feed and a hand-opened log; newly reachable at view open. The only observer of
the `system-console` clause about a view that opens with no interior read in
flight is one row of task 1.14
(`frontend/components/space/SystemSpaceView.console-log-mounted.test.tsx`, the
interior with no data and nothing in flight); no test is owed for the reconnect
corner.

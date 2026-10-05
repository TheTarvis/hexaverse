# `keep-console-tab-content-mounted` — Phase-1 security panel report

Security reviewer, 2026-10-05. Read-only: proposal, the `system-console` delta,
tasks.md, the rulings index, analysis §§ 5, 7, 9, 11, the chain doc's section for
this link and "What every link must not do", the predecessor's two security
reports, and the code cited below. No stack was booted and no suite was run.
There is no design.md yet (the architect authors it in this panel), so no
design-level threat statement exists to check the deltas against.

**Counts: BLOCKER 0, MAJOR 0, MINOR 0, NOTE 3. Verdict: SECURITY-CLEAR.**

No security surface beyond the four asked about. None of the three notes needs
a scenario or a task in this change; the count can stay at 39.

## 1. The hidden log — same data, same audience; hiding is not the control

- The hidden content is `SightingLog` unchanged (the proposal fences the file).
  It renders only what `useSightings(null)` returns
  (`frontend/components/space/SightingLog.tsx:117`), which is
  `GET /v1/sightings` with no client-supplied corporation
  (`frontend/hooks/use-sightings.ts:27-36`).
- The server derives the corporation from the token
  (`backend/sightings/handler.go:49`, `common.ActorCorp`) and serves an empty
  pile to a corpless requester (`:50-53`). The page is clamped to `PageMax`
  (`backend/sightings/service.go:29-31`).
- So nothing enters the DOM that the requester was not already served on
  request. The `hidden` attribute (`ConsoleDock.tsx:118`) is presentation
  only. The change differs from today in *when* the own pile is read, not in
  *what* or *for whom*.
- The props the view passes the log (`SystemSpaceView.tsx:814-821`) are the
  open system id, the highlight id, galaxy system names, the drawn-record id
  set and the served scale: all already in the view and already fogged
  server-side.
- The failed state rendered while hidden is static copy
  (`SightingLog.tsx:176-182`); no error detail reaches the DOM.
- Cross-account residue is unchanged: `queryClient.clear()` on sign-out
  (`frontend/hooks/use-auth.ts:130`, `:185`), and the view unmounts with the
  session.
- No storage, URL, cookie, input sink, `dangerouslySetInnerHTML`, dependency or
  `NEXT_PUBLIC_*` value is named anywhere in the proposal or tasks.

## 2. The extra read and the settle re-read

### S1 — NOTE: the watcher's retry loop now re-reads every loaded log page per attempt; bounded, self-inflicted, no control needed

- **Evidence.** `ScanSweepWatcher`'s `attempt` calls `onSettled()` and then
  re-arms itself unconditionally at `BOARD_POLL_MS`
  (`SystemSpaceView.tsx:147`, `:181`; 20 s, `frontend/lib/realtime.ts:27`).
  The loop ends only when the running-scan read clears `eta` and the effect
  is torn down (`:136`, `:205`). Task 4.2 adds an invalidation of
  `queryKeys.sightings.pile(null)` to that callback, and an infinite-query
  refetch re-requests every loaded page. Cost per attempt is therefore P
  requests (P = pages the player loaded with Load more, 50 records each), per
  own fleet in the system whose past-ETA sweep stays unsettled.
- **Why it is not a finding.**
  - The rate is one burst per 20 s per stuck fleet, on the cadence the view
    already polls the interior at.
  - It runs only for the signed-in player against their own pile.
  - The loop normally ends after one attempt, because any read folds a due
    action server-side.
  - The Refresh control already issues the same P requests at click rate, so
    no new amplification primitive exists.
  - The invalidation restarts an in-flight refetch instead of stacking a
    second one.
  - The one unconditional extra read per view open is a single bounded GET.
- **Disposition.** No scenario and no task. The proposal already states the
  cost ("Reads outside the three named triggers exist…", RULING 5). Ask the
  architect to put the multiplier in design.md Risks in one line: "each retry
  attempt re-reads P loaded pages, not one".
- **Implementation note for nextjs-dev (task 4.2).** Invalidate exactly
  `queryKeys.sightings.pile(null)`, as the task says.
  `queryKeys.sightings.all` (`frontend/lib/query-keys.ts:103`) is a prefix of
  every system-filtered entry and would also refetch the ghost feed the same
  callback already refetches.

## 3. The document-level key listener

### S2 — NOTE (not a security issue): the listener's removal on unmount has no test row

- **Evidence.** Task 4.3 specifies "a listener present while, and only while,
  the dock is expanded". Analysis § 5.2 row 17 (the view has unmounted to the
  galaxy route: "nothing; the listener is gone") is marked tier 1, and § 6
  listed "after unmount" among the Escape groups. Tasks 2.1-2.6 carry no such
  row. The only `document`/`window` keydown listener outside `app/spike/`
  today is Catalyst's drawer (`frontend/components/catalyst/drawer.tsx:131`).
- **Security impact: none.**
  - The handler reads one key, with no key content, logging or transmission.
  - Text fields and selects keep their value (the delta's own scenario).
  - A leaked listener would call a stale collapse on an unmounted view, which
    is a no-op and exposes nothing.
- **Disposition.** No scenario. If the SDET wants the row, it fits as one more
  parameter of task 2.4 (unmount with the dock expanded, dispatch Escape on
  `document`, the listener count from a spy on
  `document.addEventListener`/`removeEventListener` balanced), so the task
  count does not move. Otherwise it is QA's call; routed to them, not owed to
  security.

## 4. The own-ness deny scenario (parent RULING 20)

### S3 — NOTE: trigger still not met; carry intact

- **Strip source unchanged.** The strip is still fed from the own-fleets read:
  `useMyFleets()` at `SystemSpaceView.tsx:260`, `acting` at `:318`, the one
  `<VitalsStrip>` at `:1086`.
- **Nothing here changes it.** The proposal's Impact fences `VitalsStrip*.tsx`
  ("an edit to any is a finding"), and no requirement adds a strip prop, a
  selected-entity surface, or a dock tab rendering roster-derived figures.
  The only foreign-fleet content in the dock is the log's rows, which are
  unchanged.
- **Carry is durable.** The chain doc records the trigger and its owner
  (`docs/plans/system-hud/chain.md:1189-1195`, and Link 4's "Owes the own-ness
  deny scenario" at `:1300-1304`), with the scenario text of record in
  `docs/handoffs/add-console-dock-panel-security.md` § S1.
- **Disposition.** Nothing owed by this link.

## Checklist items with no surface

- **AuthN/AuthZ.** No new endpoint, server action, mutation or id-in-request.
  The one read is the existing token-scoped pile read, whose deny path
  (`sighting-records`: a corporation cannot read another's pile) is live and
  untouched.
- **Input.** No new input field or free-text sink. Row text is the served
  record rendered as React text, as today.
- **Sensitive data.** No token, credential or PII added to DOM, logs, URL or
  storage.
- **Dependencies.** None added; frontend only, no wire change.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: none
- NOTE: S1 (retry loop re-reads P pages per attempt; one line in design.md
  Risks, no scenario), S2 (listener removal on unmount untested; optional row
  of 2.4, not security), S3 (RULING 20 trigger not met; carry intact)

**Verdict: SECURITY-CLEAR**

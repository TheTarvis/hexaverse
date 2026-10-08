# keep-console-tab-content-mounted — design

Owned by the architect; authored in the Phase-1 panel, 2026-10-05, against the tree at `3f83cf9`. Link 2b-i-b of `docs/plans/system-hud/chain.md`. Binding: RULINGs 1-16 of `docs/handoffs/keep-console-tab-content-mounted-rulings.md`, and RULINGs 2, 6, 8, 9 and 18 of `docs/handoffs/add-console-dock-rulings.md`. Frontend only: no backend, no wire change, no new endpoint or query. The panel report with the findings against the delta and tasks.md is `docs/handoffs/keep-console-tab-content-mounted-panel-architect.md`.

Decisions the predecessor wrote for this link are cited as "predecessor D-n" (`openspec/changes/archive/2026-10-05-add-console-dock/design.md`). They are carried by reference where they hold and corrected here where they do not: predecessor D-7's account of why the fleet menu wins Escape is wrong for production (D-5 below), and predecessor D-20 (row into view) is shed by RULING 13.

What was verified, and how. Read at this HEAD: every `file:line` below. Executed: one probe of Escape listener ordering against the installed React 19.2.3 in jsdom (D-5; the script is in the session scratch directory and is not part of the repo). Not re-executed: the predecessor's `hidden`-attribute and `<Activity>` measurements (predecessor D-1, D-2), which are carried by reference. No test suite and no stack was run.

## Context

`add-console-dock` put the sighting log in the dock's Log tab and left its lifetime as the floating log's: the view builds the tab's content as `!dock.expanded ? null : interior.isLoading ? <ConsolePanelWaiting /> : <SightingLog … />` (`frontend/components/space/SystemSpaceView.tsx:811-822`). The shell already renders whatever it is given in both states, inside a region it hides with the `hidden` attribute (`ConsoleDock.tsx:118`, `:155`). So today a collapse unmounts the log, an expansion mounts it and is therefore a read whenever the cache entry is stale, and the dock has no Escape key.

Two facts make the always-mounted log more than a one-expression change.

- **Nothing re-reads the log's pile when a sweep settles.** Both settle exits call only `refetchGhostFeed` (`SystemSpaceView.tsx:147` through `onSettled` at `:857`; `:436`), which refetches the system-filtered pile. The log reads the unfiltered one (`useSightings(null)`, `SightingLog.tsx:117`), a different cache entry that nothing outside tests names. Today that is masked because a hand-opened log mounts after the settle. A log that is always mounted would never show a settled sweep's records (`docs/handoffs/drift-sighting-log-not-reread-after-sweep-settles.md`).
- **`!interior.isLoading` is open from the first render on a return to a held system.** `isLoading` is `isPending && isFetching`; with the interior still in the cache it is false while the stale interior's re-read, the read that settles a sweep whose ETA passed while the player was away, is in flight. A log mounted at that moment reads the pile alongside the settling read, which is the race `sighting-log` *The Log Reads on Mount…* forbids (`openspec/specs/sighting-log/spec.md:129-137`).

## Goals / Non-Goals

Goals

- The Log tab's content is mounted once per mount of the view and hidden, not unmounted, while the dock is collapsed.
- Showing and hiding the tab is never a read; the log's first read does not wait for an expansion.
- The pile the log reads is read again when a sweep settles, on both settle exits, in the order `sighting-log` requires.
- Escape collapses the expanded dock from anywhere, the fleet cell's menu keeps its precedence by a mechanism that is the same in production and under test, and every collapse shares one focus rule.

Non-Goals

- Tab switching, arrow keys, a second tab (2b-ii). The second-press Escape rule (link 4).
- The fleet menu's unfocused-Escape drift (RULING 7); the ghost layer's warm-cache gate; the settle watcher's disarm race; the join-in-flight first read; the read inside the interior's stale window (all filed at the gate, none fixed).
- The row-into-view scroll (RULING 13), the panel's scroll offset across a collapse (RULING 8), a collapsed-state failure marker, any edit to `SightingLog.tsx`, `hooks/use-sightings.ts`, `lib/query-client.ts` or `VitalsStrip*.tsx`.

## Decisions

### D-1 The mount site is the view's one expression; the shell is not edited for it

The whole "stays mounted" build is the expression at `SystemSpaceView.tsx:811`: it stops testing `dock.expanded` and becomes "the log if the latch is open (D-3), otherwise the waiting indication". `ConsoleDock` keeps rendering `{tab.content}` unconditionally inside its `hidden` region (`ConsoleDock.tsx:118`, `:155`), so the content is hidden by the region it already sits in. No new wrapper element, no new prop on the shell, no `shown` prop on `SightingLog`.

"A row's highlight is not presented while its tab is not shown" (RULING 10) needs no code: the row keeps `data-highlighted="true"` in a `display: none` subtree. A test that wants "presented" reads visibility, not the attribute.

Alternatives rejected: a mount flag inside `ConsoleDock` (the shell "never decides what a tab's content is", `ConsoleDock.tsx:7-8`, and 2b-ii's tabs each have their own gate); lifting `useSightings(null)` into the view and passing pages down (it keeps pages across a remount, which the query cache already does, and loses the one thing a remount actually destroys, the no-mark statement in `SightingLog`'s local state, `SightingLog.tsx:121`; it also edits a file this change fences).

### D-2 Hiding is the `hidden` attribute; never `<Activity>`, never `experimental.routerBFCache`

Carried by reference from predecessor D-1 and D-2 and the executed evidence in `docs/handoffs/add-console-dock-panel-architect.md` Job 2(a) and 2(b). The two facts this change leans on:

- Under the `hidden` attribute a query observer inside the subtree stays subscribed, so an invalidation issues its read at once. That is what lets the settle re-read (D-4) land while the dock is collapsed and makes an expansion issue nothing. Under a hidden `<Activity>` the observer is unsubscribed, the invalidation only marks the entry stale and the read happens on re-show, a read on expand, which predecessor RULING 8 forbids.
- jsdom applies `[hidden] { display: none }` from its own default sheet, `@testing-library/user-event`'s Tab skips it and jest-dom's `toBeVisible` is false under it, so "out of sight, out of the tab order, out of the accessibility tree" is a tier-1 assertion. What tier 1 cannot see is the app stylesheet defeating the rule; the predecessor's journey holds that line and this change's journey repeats it on the log's content.

`visibility` and `opacity` stay in the tab order; `inert` alone stays painted; conditional rendering is what this change deletes.

### D-3 The mount gate is a latch on the interior read being at rest

**What it is.** One boolean per mount of the view, closed at first, opened at the first render in which no interior read is in flight (`!interior.isLoading && !interior.isFetching`), and never closed again until the view unmounts. Closed: the panel holds `ConsolePanelWaiting`. Open: it holds the log. The view remounts on a change of system (predecessor D-4), so the latch resets with it.

**Why a latch and never a live condition.** The view re-reads the interior every 20 s (`BOARD_POLL_MS`, `SystemSpaceView.tsx:618-622`), on SSE reconnect (`:609-614`), at every scheduled arrival (`:603`) and in the settle watcher's loop (`:144`, `:181`). A live `!isFetching` test would unmount the log on each of them, discarding exactly the state this change exists to keep and making each re-mount a read.

**Why both terms.** Against the real hook `!isFetching` alone would do (`isLoading` implies `isFetching`). Every view-level harness mocks `useSystemSpace` with `isLoading` and no `isFetching` field (the only `isFetching` under `components/space/` tests is `ScanControl.test.tsx`), so `!isLoading` keeps those harnesses meaning what they mean today and `undefined` is falsy for the other term. That is why no existing harness needs an edit for the latch.

**Why the first render already sees the re-read.** On a mount over a stale cached entry React Query's first result is optimistic: `QueryObserver.createResult` applies the fetch state when `shouldFetchOnMount` is true and no listener is attached yet (`@tanstack/query-core/build/modern/queryObserver.js:248-257`). So `isFetching` is true on render one of a warm return and the latch does not open before the re-read is issued. This is load-bearing; it was read, not executed, and the view-level harnesses cannot see it because the hook is mocked there; task 1.15 observes it over the real interior hook (Risks).

**What opens it.** The read answering; the read failing after its retries (a failed read leaves nothing in flight, so the waiting indication cannot persist, predecessor D-21); a view with no interior read to wait for (a return inside the interior's 60 s stale window, see "what it does not order"); a paused read (offline: `fetchStatus` is `paused`, which is not `fetching`).

**How it is held.** View state set during render: `useState(false)` and, in the render body, `if (!latched && atRest) setLatched(true)`. React re-runs the component before committing, so the log is present in the first commit in which the read is at rest and no extra commit is added. Alternatives rejected: an effect that sets the state (one commit showing the waiting indication over a read that is already at rest, and one more commit at every mount in the `Profiler`-measured suite); a ref written and read during render (works, and `:293-294` is precedent for writing one, but output that depends on a ref read in render is the pattern React's rules exclude); deriving it from the query cache (`getQueryState`) rather than latching (not per-mount).

**What it does not order.** A return inside the interior's 60 s stale window issues no interior read at mount, so the latch opens at once and the log's first read, if its own entry is stale, precedes the settling read the watcher issues `ETA_CUSHION_MS` later. D-4 then re-reads the pile after that settling read, so the records appear, but the letter of "first pile read only after" is unmet there, as it is today for a hand-opened log and for the ghost layer. Filed, not fixed (tasks 5.10).

**The starvation case.** `resync` calls `interior.refetch()` (`SystemSpaceView.tsx:554-555`), whose default `cancelRefetch: true` cancels and restarts an in-flight read once data is held (`query.js:171`). On a warm return, each timer that fires while the opening re-read is in flight restarts it, and `isFetching` stays true across the restart. The latch therefore opens one read after the last restart. It can stay closed indefinitely only if every interior read outlasts the 20 s poll, at which point the view itself is not usable. Not worth code; recorded in Risks. On a cold first load there is no data, so a second request joins the first and nothing restarts.

Alternatives rejected: today's `!interior.isLoading` (ships `sighting-log` *A mount during an unsettled past-ETA sweep reads the pile after the settling read* false on every return to a held system after more than 60 s, with no later expansion to correct it, RULING 2); opening the latch on the first expansion and keeping it from then on (the first show would be a read, against predecessor RULING 8, and the settle re-read would have nothing mounted to land in); teaching the view which fleets hold a past-ETA sweep and gating on that (a second ordering mechanism beside the watcher's, for a gap that predates this change).

### D-4 The settle re-read: one stable callback, both exits, invalidate by key

One `useCallback`-stable view callback replaces `refetchGhostFeed` at both call sites. It calls `refetchGhostFeed()` and then `queryClient.invalidateQueries({ queryKey: queryKeys.sightings.pile(null) })`.

- **ETA-scheduled exit.** It is the watcher's `onSettled` (`SystemSpaceView.tsx:857`), which runs inside the `.then` of the settling `resyncInterior()` (`:144-147`), so the ordering `sighting-log` requires is inherited, not rebuilt. It must be stable: `onSettled` is in the timer effect's dependency array (`:205`), and a new identity per render would tear the timer down on every render.
- **Early-settle exit.** It replaces the bare call at `:436`, inside the existing guard at `:433`, so it runs only when the running-status read succeeded carrying nothing. The effect's dependency array (`:441`) names the new callback in place of `refetchGhostFeed`.
- **Invalidate by key; do not thread the log's `refetch` up.** A mounted, hidden log has an active observer, so the invalidation issues the read at once (D-2); with the latch still closed there is no observer, the invalidation is a no-op or a stale mark, and the mount reads. `['sightings','pile','all']` is not a prefix of the filtered key, so the ghost feed is not read twice. An infinite query re-reads every loaded page with fresh cursors, so loaded pages survive a settle.
- **Keep `refetchGhostFeed`; do not replace both with one invalidation of `queryKeys.sightings.all`.** `SystemSpaceView.scan-refetch.test.tsx:264,274` and `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:734-757` mock the hook and assert its `refetch` spy. Under a hook mock an invalidation touches nothing, the spy is called exactly as before, and both files stay green unedited. Replacing the call with an invalidation would turn both red; threading the log's `refetch` up would edit `SightingLog.tsx` and change the spy's call count now that the mock feeds two consumers.

Inherited and unchanged (predecessor D-11, architect A10): a re-read requested while the entry's first read is still unanswered joins that read (`query.js:166-178`); the watcher's retry loop re-reads the pile every 20 s while a past-ETA sweep stays unsettled. No delta: the live scenario *The log refetches after a sweep settles* (`sighting-log/spec.md:155-157`) becomes true.

### D-5 Escape: a `window` listener in the shell, bubble phase, honouring `defaultPrevented`

**Where.** `ConsoleDock` registers a `keydown` listener on `window`, in the bubble phase, in an effect keyed on `expanded`, present while and only while the dock is expanded. "Escape with the dock collapsed changes nothing in the dock" is then true by construction, and the listener is gone when the view unmounts. It lives in the shell because the shell owns the collapse path and its focus decision (D-6); the view still owns the state (predecessor D-4), which is what link 4's second-press rule needs.

**What it acts on.** `event.key === 'Escape'` and none of: `event.defaultPrevented` (something took the key), `event.repeat` (RULING 11). When it acts it calls the shell's one collapse function.

**How the fleet menu's precedence actually works, and why `window` and not `document`.** The menu needs no edit and shares no state: its handlers call `preventDefault()` when they consume Escape (`VitalsStripFleetCell.tsx:96-98`, `:112-114`). Predecessor D-7 said React dispatches them "from the root container before the event reaches `document`". That is true under the testing library, whose container is a `div`. It is false in production: Next 15.5.25 hydrates with `const appElement = document` (`node_modules/next/dist/client/app-index.js:30`, `hydrateRoot(appElement, …)` at `:224`), and React attaches its delegated listeners to the root container (`listenToAllSupportedEvents(container)`, `react-dom-client.development.js:28057`, `:28113`). So in production React's listener and a `document` listener of the dock sit on the same node and run in registration order. The menu would still win, because React registered at hydration and the dock registers in an effect, but by an accident of ordering that tier 1 does not exercise.

Verified by reading those sources and by an executed probe (React 19.2.3, jsdom; a button whose `onKeyDown` prevents Escape while "open", and a second listener recording `defaultPrevented`):

| React root | Dock listener | First Escape seen as prevented |
| --- | --- | --- |
| `document` | `document`, bubble, registered in an effect | yes (registration order) |
| `document` | `document`, **capture** | **no** |
| `document` | `document`, bubble, registered **before** the root | **no** |
| `document` | `window`, bubble, registered before the root | yes |
| `document` | `window`, bubble, registered in an effect | yes |
| `div` (testing library) | `document`, bubble, either order | yes |
| `div` (testing library) | `window`, bubble | yes |

In every row the repeated keydown and the second press arrived unprevented, the menu having closed, which is why `event.repeat` needs its own guard. A `window` bubble listener runs after every listener on `document` by propagation, whatever was registered first and whatever the root container is. So with `window` the mechanism tier 1 proves is the mechanism production runs, and the journey's menu-open leg confirms it instead of being its only observer. Two rules follow and are part of the decision: never the capture phase, and never `document`.

It is still a global listener and not a handler on the view's root, for predecessor D-7's reason: after a pointer press in a browser that does not focus a clicked button, focus is on `<body>` and the keydown never enters the view's subtree.

**What the mechanism does that the requirement does not say.** It yields to any handler that prevents the default of Escape, not only the fleet menu. Nothing else in the view does so today (`SpaceStage` handles Enter, Space and arrows; the view's inputs are native). See Open Questions.

**What it cannot do (RULING 7).** An open menu that does not hold focus never sees the key, so that Escape collapses the dock and leaves the menu open. Probing the strip's DOM for an open menu instead would make Escape a dead key in that state and couple the shell to the strip's internals.

Alternatives rejected: `document` (above); `onKeyDown` on the view's root (misses `<body>`); Escape scoped to focus inside the dock (predecessor RULING 6 says anywhere); a shared "menu open" flag between the strip and the dock (state the menu does not need to export); ignoring an editable target (RULING 6).

### D-6 One collapse path, one focus rule

`ConsoleDock.handleCollapse` (`ConsoleDock.tsx:90-93`) already decides, before the state change, whether `document.activeElement` is inside the region about to be hidden, and the effect at `:82-88` moves focus to the "Console" control after the commit only if it was. The Escape listener calls that same function. Nothing else may call `onCollapse`. So "focus in the tab bar or the panel moves to Console; focus anywhere else, the chevron included, is not moved" is one rule with two callers, and the pointer-press scenario (focus on the chevron, collapse control clicked without a focus move) is already true of the code as it stands.

The decision is taken before the state change because a browser blurs an element that becomes `display: none` asynchronously and jsdom never does (predecessor D-18). The listener effect must reach the current `onCollapse` (a ref, or the prop in its dependency array; the view's `collapseDock` is stable, `SystemSpaceView.tsx:304`).

The build in `ConsoleDock.tsx` is therefore the listener alone. The "focus guard" tasks.md names exists.

### D-7 No read on show

With D-1 to D-4 the log's reads are: its mount (once, when the latch opens, and only if its cache entry is stale or absent, RULING 4), a settle (D-4), an explicit Refresh or Retry, and the two that RULING 5 leaves unspecified (network reconnect; the watcher's retry loop). Expanding, collapsing and the report's link change one boolean in the view and issue nothing. The report's link still only calls `openDockOn('log')` (`SystemSpaceView.tsx:305`).

### D-8 What each tier holds

- **Tier 1, real `useSightings` over a mocked `sightingService`** (new file): every request-count claim, state survival across a collapse (the no-mark statement is the only witness that the content was not remounted; pages live in the cache and survive a remount), the failed state reached while collapsed, the settle re-read on both exits with its ordering. A request count discriminates a remounting build only on a stale entry, which the harness client's default `staleTime` of 0 gives. A "no request" claim asserted in a harness that mocks the hook observes nothing and must not be placed there (panel report A4).
- **Tier 1, hook-mocking harnesses**: the latch's two arms and the waiting indication (by `useSightings(null)` having been called, which is "the log is mounted", and by what the panel holds), focus after every collapse, the menu's precedence and the held key (now the production mechanism, D-5), reachability by a real Tab walk.
- **Tier 1 cannot hold**: a press on the dock reaching the canvas (the stage is a mocked sibling); a real camera control or hit target as the focus holder (the stage mock's buttons stand in); any scroll offset. The optimistic first render that keeps the latch closed on a warm return cannot be held by the view-level hook-mocking harnesses; task 1.15 holds it over the real interior hook.
- **Tier 4, one journey**: the same DOM node and the no-mark statement across an Escape collapse (inside the 60 s stale time a request count cannot tell the builds apart); the unfiltered re-read on the wire after the settling interior response and before any expansion on the ETA exit, or after the running-status inbox response that carried no running sweep on the early-settle exit; the menu-open Escape leg; a press on the dock leaving the selection alone; the failed state on expansion. The warm-cache latch is not arrangeable inside the test budget without waiting out the interior's stale time (panel report A5): logged, never asserted.

## Risks / Trade-offs

- **One more request per view open.** One `GET /v1/sightings` with no `systemId` (one page, at most 50 records) once the opening interior read is at rest, for a surface that may never be shown. None inside the 60 s stale window of an earlier read.
- **A permanently mounted log reconciles every loaded row whenever the view renders.** The view renders at least once a second (`useCoarseWorldTime`, `SystemSpaceView.tsx:486`), `SightingLog` is not memoised and each row gets a new `onSelect` closure, so every loaded row and its `Figure` is re-rendered per view render, under `display: none` (no layout, no paint, no DOM write when nothing changed). At 50 rows a page that is small; it is unmeasured. **`SystemSpaceView.render-loop.test.tsx` would not notice it**: that suite counts `Profiler` commits (`:244-257`, `:292`), not render cost, and its pile is empty. What that suite could notice is a commit caused by the log's own unmocked read settling inside a measured window, which the ghost feed's read already risks; that is task 3.2's attribution. If the cost is ever measured as a problem the remedy is a memoised element in the view (its inputs are already stable: `drawnSightingRecordIds` is memoised at `:539`, `systemNames` at `:307`), not an edit to `SightingLog.tsx`.
- **Reconnect refetch.** `refetchOnReconnect` is not overridden (`lib/query-client.ts:76-84`), so an always-subscribed log with a stale entry re-reads every loaded page when the browser comes back online. A read outside `sighting-log`'s three triggers, unspecified by RULING 5, not a timer.
- **Records minted elsewhere** appear on Refresh or the next settle, not on re-expansion (predecessor RULING 8's stated cost).
- **The latch's first-render behaviour is tested by task 1.15 at tier 1 and unobserved at tier 4** (D-3). If a React Query upgrade stopped reporting the optimistic fetch on a stale mount, 1.15 over the real interior hook would fail. The journey logs the warm leg UNTESTED unless an interior request is seen (D-8).
- **Latch starvation** when every interior read outlasts the poll (D-3).
- **The settle watcher's retry loop re-reads every loaded log page per attempt, not one.** The callback invalidates the pile (D-4), and an infinite query re-requests each page the player loaded with Load more (up to 50 records each), once per 20 s attempt while a past-ETA sweep stays unsettled. Bounded and self-inflicted, on the cadence the view already polls at; the loop normally ends after one attempt.
- **A paused first read shows the empty state.** Offline, the log's query is `pending` and `paused`, `isLoading` is false and `SightingLog.tsx:183-188` falls through to "No sightings yet". Pre-existing; newly reachable at view open rather than on a hand-opened log. To file with the others.
- **A failed load-more or re-read withdraws listed rows** while hidden as it does while shown (`SightingLog.tsx:176`; RULING 12).
- **Inherited exactly, to be filed (tasks 5.10):** the settle watcher's disarm race; the ghost layer's warm-cache mount gate (`SystemSpaceView.tsx:843` keeps `!interior.isLoading`); the join-in-flight first read; the first read inside the interior's stale window; "reads when the log mounts" on a fresh cache entry.
- **Escape in an open menu that does not hold focus** collapses the dock and leaves the menu open (RULING 7).
- **The hook-mocking harnesses now feed two consumers** and the two unmocked files run a second real read. No assertion found that the hidden log's content can satisfy or break (`SystemSpaceView.console-dock.test.tsx:537,542` assert the log absent only under `isLoading: true`, which the latch preserves). Task 3.2 attributes any red before an edit.

## Migration Plan

None. The mount-on-show expression and its `!interior.isLoading` gate for the log are deleted, with no flag and nothing kept beside the latch. No state is persisted. E2E preconditions move because the log reads at view open (tasks 3.3-3.6).

## Open Questions

Settled here and not open: the mount site (D-1), the hiding mechanism (D-2), the latch and how it is held (D-3), the settle callback's shape (D-4), the listener's target and phase (D-5), the single collapse path (D-6), the tiers (D-8).

For the orchestrator, each with a recommendation:

- **Escape yields to anything that prevents its default, not only the fleet menu** (D-5). No other such control is in the view today. The first one that arrives (2b-ii to 2b-iv move panels into the dock; a Catalyst listbox or dialog prevents Escape) will make the requirement's "unless the fleet cell's open menu takes the key" narrower than the build. Recommendation: no edit now; link 4, which MODIFIES this requirement anyway, generalises the exception to "a control of the view that takes the key for itself", and 2b-ii's author reads this line.
- **The size.** The count is 40 tasks after adversary round 1 (39 plus 1.15, RULING 16), the cap, with no headroom; a further arrangement group triggers RULING 13's seam, the Escape block.
- **The panel's scroll offset across a collapse** is unspecified by RULING 8 and unmeasured; the journey logs it. No recommendation beyond reading that log before 2b-ii adds a second tab.
- **`system-console` *Activating the Dock Changes No Space-View Selection* says the dock's panel controls change no acting fleet.** True with one Log tab. 2b-iii puts the fleet roster in the dock, whose row selection changes the acting fleet, and must MODIFY that sentence. Recommendation: record it in the chain doc at task 5.9.

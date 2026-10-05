# add-console-dock — design

Owned by the architect. Revised in the Phase-1 panel (2026-10-04) from the spec writer's first draft, and finished on 2026-10-05 by a second architect after the first run was cut off: every decision below was re-read against the code and the installed libraries, and the ones marked "confirmed by execution" were re-run except where a note says otherwise. The panel report with the evidence is `docs/handoffs/add-console-dock-panel-architect.md`. Link 2b-i of `docs/plans/system-hud/chain.md`; binding: RULINGs 1-21 of `docs/handoffs/add-console-dock-rulings.md`, with one exception taken under RULING 12's own clause (D-6). Frontend only: no backend, no wire change, no new endpoint or query. After RULING 15 this change is the first of two pieces this document was written for; the scope section below says which decisions it builds.

## Scope of this change (after RULING 15)

This document was finished for the unsplit link 2b-i. RULING 15 split it at placement against lifetime, and the decisions below are allocated by the architect's own seam (panel report A1, "Open Questions"). No decision is changed; only where it is built.

- **Built by `add-console-dock` (2b-i):** D-3 (one published height), D-4 (dock state and the one open-only entry point), D-5 (the "Console" control outside the strip), D-6 (placement ADDED; the one MODIFIED block), D-9 (`Log`, no count), D-10 (a ghost does not open the dock), D-12 (per-tab layout unspecified; chrome trimmed), D-13, D-14, D-15, D-17 (DOM order), D-18 (focus on expand and on collapse, applying to the collapse control as the only collapse path in this change), D-19 (names), D-21 (the waiting indication) and D-22 (what each tier holds, less the real-hook request counts). D-1's `hidden` attribute is built here for the shell's own region and the "Console" control (the Tab walk and the stylesheet proof in D-1 are this change's); D-2's prohibition of `<Activity>` binds the shell too.
- **Not built here, by adversary round 1 (M1):** the clause that focus anywhere else, the strip's chevron included, is not moved by a collapse (D-18's third bullet), with its scenarios; it goes to 2b-i-b with Escape.
- **Recorded here for `keep-console-tab-content-mounted` (2b-i-b) and not built by this change:** D-1 and D-2 as the reasoning for a tab's content staying mounted, D-7 (Escape), D-8 (no read on show), D-11 (the settle re-read), D-16 (the mount latch) and D-20 (the highlighted row brought into view). Where a sentence below describes the log as mounted with the dock, kept mounted while hidden, re-read on settle, closed by Escape or latched, it describes that piece.
- **What this change does with the log instead:** the log's content is mounted when the Log tab is shown and gated as today on the interior read's first load (`!interior.isLoading`, `SystemSpaceView.tsx:910`), so no read's timing changes. D-21's waiting indication ends when that gate opens, which a failed interior read also does. This change states nothing about what a collapse does to the log's loaded state.
- **Risks below that begin only when the log is mounted with the dock**, and so are 2b-i-b's: the log's first read at view open; records minted elsewhere not appearing on re-expansion; the log inheriting the settle watcher's holes; the ghost layer's warm-cache gate; a settle re-read absorbed by an in-flight first read; `scan-lane-transit-fizzle`'s zero-row count; the e2e intercept catching two reads. The others apply here.

## Context

`SystemSpaceView` floats a right-hand command column over the canvas. The sighting log is a floating panel beside it (`SystemSpaceView.tsx:910-922`), opened and closed by a `sighting-log-open` toggle in the column (`:996-1003`) and held in `logOpen` state (`:295`); it mounts only while open and only once the interior read's first load has finished (`logOpen && !interior.isLoading`). The vitals strip is a sibling, absolutely positioned across the foot (`:1070`). Link 2b puts the column's panels in a dock beneath the strip; this piece builds the dock and moves one occupant into it.

The log's freshness today is an accident of mounting: it is closed when a sweep settles and read when opened. Both settle exits call `refetchGhostFeed` (`:145` through `onSettled` at `:830`, and `:426`), which refetches the system-filtered pile (`queryKeys.sightings.pile(systemId)`); the log reads the unfiltered one (`pile(null)`), a different cache entry, and nothing invalidates it. (2b-i-b's concern.) A log that stays mounted would never see a settled sweep's records (`docs/handoffs/drift-sighting-log-not-reread-after-sweep-settles.md`).

Four elements carry the literal `bottom-[4.5rem]` that clears the 56 px strip: the right column (`SystemSpaceView.tsx:932`), the sightings-unavailable card (`:896`), the camera cluster (`SpaceStage.tsx:716`) and `FloatingNav` (`floating-nav.tsx:33`, mounted by `layout-wrapper.tsx:108` after the page, outside the view's subtree and shared with the galaxy route). No test asserts any of the four class strings. The canvas puts the new "Console" control at `right: 16px; bottom: 64px` (`Collapsed.dc.html`), which is where the camera cluster sits today and inside the column's lane.

## Goals / Non-Goals

Goals

- A dock whose collapsed state is the strip, collapsed on every mount, with an operable expand control outside the strip.
- One tab, `Log`, whose content is mounted when the tab is shown (2b-i). *2b-i-b:* mounted with the dock and hidden when not shown, and the settle path made to re-read the pile the log reads, on both exits.
- Every bottom-band floating surface following the dock's height from one published value, with the galaxy route's nav unmoved.
- Keyboard focus never lost to the start of the document by an expand or a collapse.

Non-Goals

- Any other tab, tab switching, arrow-key movement between tabs, a tab count, per-tab layout, a resize control, persisted state, a mobile layout, a palette change, a backend field (proposal "Out of scope").
- Reframing the camera when the dock expands. The stage keeps the full viewport; the expanded dock covers the canvas's lowest 220 px, as the strip covers its lowest 56 today.
- Fixing the ghost layer's own mount gate or the settle watcher's disarm race (Risks); both predate this change and are to be filed, not fixed here.

## Decisions

### D-1 Hiding mechanism: the HTML `hidden` attribute (RULING 2) — confirmed by execution

`hidden` goes on the one element that wraps the tab bar and the panel while the dock is collapsed (from 2b-ii, also on each unselected tab's panel), and on the "Console" control while the dock is expanded. Verified, not inferred: Tailwind 4.1.17's preflight (`node_modules/tailwindcss/preflight.css:391`) is `[hidden]:where(:not([hidden='until-found'])) { display: none !important; }` inside `@layer base` (`index.css:1` orders `theme, base, components, utilities`). An `!important` declaration in an earlier layer beats every declaration in a later layer and every non-important inline style, so it wins over `flex`, `grid`, the important utility `!flex` and `style="display:flex"`. The first architect compiled this with the installed Tailwind and loaded it in the installed Chromium (all four computed `display: none`, a button inside the wrapper was not visible, the subtree was absent from the accessibility snapshot); the second run re-read the source and re-compiled the stylesheet but did not repeat the browser measurement. The only things that defeat the rule are an inline `display: … !important` and `hidden="until-found"`; neither may be used on a dock element.

What tier 1 can see of this. jsdom does not load the app's stylesheet, but it is not stylesheet-free: its own default sheet carries `[hidden] { display: none }` (`node_modules/jsdom/lib/jsdom/browser/default-stylesheet.js:783`) and its `getComputedStyle` applies it. So in vitest a `hidden` wrapper removes its subtree from the default role query, makes jest-dom's `toBeVisible` false, and makes `user.tab()` skip it (`@testing-library/user-event` 14.6.1 `getTabDestination` returns only an element whose ancestors all compute a `display` other than `none`). Tab-order reach across a hidden region is therefore a tier-1 assertion. What tier 1 cannot see is a utility class or an inline style defeating the rule, so the journey keeps one line proving it on the real stylesheet.

Alternatives rejected: conditional rendering (loses load-more pages and the row's no-mark statement, and makes showing the tab a mount, hence a read); `visibility` or `opacity` (stays in the tab order); `inert` alone (stays painted).

### D-2 Not React `<Activity>` (RULING 2) — confirmed by execution, and worse than recorded

React 19.2.3 exports `Activity` and hides by disconnecting passive effects (`react-dom-client.development.js:16177-16232`). React Query 5.90.11 does not subscribe in a `useEffect` of its own; it subscribes through `useSyncExternalStore` (`useMutation.js:23`, `useBaseQuery.js:55`), and React implements that subscription as a passive effect (`mountSyncExternalStore` → `mountEffect(subscribeToStore…)`, `:8109-8145`). Hiding therefore unsubscribes the observer. For a mutation that is fatal twice over: `MutationObserver.#notify` runs mutate-level `onSuccess`/`onError`/`onSettled` only `if (this.#mutateOptions && this.hasListeners())` (`mutationObserver.js:77`), and `onUnsubscribe` removes the observer from the in-flight mutation (`:38-41`), so it is never told the mutation finished. A throwaway probe (mutation fired, subtree hidden, response resolved, subtree shown) gave: under `<Activity mode="hidden">` the hook-level `onSuccess` ran, the mutate-level callbacks never ran, and the hook still reported `pending` after re-show; under the `hidden` attribute all callbacks ran and the hook reported `success`. Reproduced on 2026-10-05 with the same result; the same probe showed that an invalidation of a query observed inside the hidden subtree issues its read at once under the `hidden` attribute and not at all under `<Activity>` until re-show (the table is in the panel report, Job 2(a)).

For this piece's own content the damage is different but still disqualifying: an Activity-hidden log's query observer is inactive, so the settle path's invalidation would only mark it stale and the pile would be read on re-show — a read on expand, which RULING 8 forbids. Recorded so nobody reaches for `<Activity>` in 2b-ii to 2b-v. The same reasoning forbids turning on Next's `experimental.routerBFCache`, which wraps inactive route segments in a hidden `<Activity>` (`next/dist/client/components/layout-router.js:520-525`); see D-4.

### D-3 One published dock height, three lane offsets (RULING 11) — settled

One module, `frontend/lib/console-dock-layout.ts`, is the single source. It is in `lib/` because `FloatingNav` (app chrome) must not import from `components/space/`. It holds:

- the custom property's name, `--console-dock-height`;
- the two values, `3.5rem` (collapsed: the strip's row) and `13.75rem` (expanded: 220 px);
- three complete class literals (complete so Tailwind's scanner sees them), each `bottom-[calc(var(--console-dock-height,3.5rem)+N)]`:
  - **left and centre lane**, `N = 1rem` — `FloatingNav` and the sightings-unavailable card: 72 px collapsed, 236 px expanded;
  - **camera lane**, `N = 2.75rem` — the camera cluster: 100 px collapsed (the canvas's own figure, clearing the "Console" control at 64-88 px), 264 px expanded;
  - **column lane**, `N = 5.25rem` — the right column's foot (until 2b-v): 140 px collapsed, 304 px expanded, that is, above the 32 px camera cluster plus an 8 px gap.

The dock publishes the property on `document.documentElement` in a layout effect keyed on its expanded state and removes it in the effect's cleanup, so it is absent whenever no dock is mounted. Each occupant swaps its literal `bottom-[4.5rem]` for its lane's class and gains no prop, no context and no route check. On the galaxy route the property is unset and the fallback gives `FloatingNav` exactly `4.5rem`, which is what it has today. The first architect compiled and measured this in Chromium at 1280×720: unset 72/100/140, `3.5rem` 72/100/140, `13.75rem` 236/264/304, removed 72/100/140. The second run re-compiled the three literals with the installed Tailwind (each emits `bottom: calc(var(--console-dock-height,3.5rem) + N)`) and checked the arithmetic, without a browser.

The column takes a testid, `space-command-column`, because with the dock expanded it is the unit a geometry test can measure: at 720 px tall its box is about 400 px (720 − 16 − 304) for four panels and up to three failure cards, so it scrolls, and a panel scrolled partly out of it keeps a layout box that extends under the dock. The spec has to state the expanded-state rule for a scrolling surface by its visible area and by each control being activatable once scrolled into view (panel report A4); stated per panel as an unscrolled bounding box it is false whatever is built, until 2b-v deletes the column.

Why the column is stacked above the cluster rather than sharing its foot as it does today: at 720 px tall an expanded dock leaves the column about 400 px for six occupants, so it scrolls, and a scrolling column whose foot is the cluster's foot paints its last panel over the cluster's buttons. Stacking costs the column 68 px in the collapsed state (632 → 564 px at 720); see Risks.

The dock's own expanded height is set from the same module, and the strip keeps its own `h-14`. That is two statements of 56 px (the strip's class and the collapsed value); the journey's "strip row is 56" and "dock is 220" legs pin both.

Alternatives rejected: a pure-CSS rule (`:root:has([data-console-dock='expanded'])`) — no leak to clean up, but nothing is observable at tier 1 and an attribute/selector mismatch would surface only in the single tier-4 run; a prop to the stage plus a context for the nav — two mechanisms, and a layout-level provider re-rendering on every expand; a second published property for the camera lane (it would put the cluster at the canvas's 232 px when expanded) — 28 px of tidiness for a second thing to keep in step; moving the camera cluster inboard of the column for the interim — it would move again in 2b-v; moving `FloatingNav` to a new home — no document decides one.

### D-4 Dock state lives in the view; every expansion is an "open on this tab" request — settled

The view holds `{ expanded: boolean, openSeq: number }` in `useState`, initially collapsed, which replaces `logOpen`. Nothing is written to storage or the URL (RULING 5). There is one opening entry point, `openDockOn(tab)`, which sets `expanded` and increments `openSeq`; the "Console" control and the settled report's link (`ScanControl`'s `onOpenLog`) both call it, so the link is open-only by construction and cannot toggle. Collapsing sets `expanded` false and leaves `openSeq` alone. The dock is a controlled component: it receives `expanded`, `openSeq`, `onOpen`, `onCollapse`, the strip element and its tabs. The selected tab is not state until 2b-ii adds a second tab; `openDockOn` already takes the tab so 2b-ii adds state without changing a caller.

`openSeq` exists because the request must be observable even when it changes nothing: a link activated while the dock is already expanded still moves focus to the Log tab (D-18), and a boolean that is already `true` produces no render to hang that on.

"Collapsed on every mount" depends on the view remounting when the system changes. It does: Next 15.5.25 keys each segment's subtree by a state key that includes the dynamic param (`layout-router.js:398-411`) and keeps one entry unless `__NEXT_ROUTER_BF_CACHE` is set (`bfcache.js:13`); `next.config.ts` does not set it. Enabling the router BF cache would preserve the previous system's expanded dock and must not be done without revisiting RULING 5 and D-2.

Alternatives rejected: an uncontrolled dock with an imperative handle (link 4's open-on-select and second-press Escape need the view to own this state); a URL parameter (RULING 5).

### D-5 The expand control is outside the strip (RULING 4)

The "Console" control is a sibling of the strip element inside the dock's root, so *The chevron is the strip's only interactive element* and *The Strip Carries No Verb* stay true with no MODIFIED block and `VitalsStrip*.tsx` is not edited. It is positioned from the dock root (`right` 16 px, 8 px above the strip's top edge — the canvas's `bottom: 64px`), and is at least 24 px tall and at most 28 px so the camera lane's 100 px clears it. The collapse control sits at the right end of the tab bar (`Main.dc.html`). The spec states presence, operability and non-overlap, not pixels. Rejected: a control inside the strip (falsifies two live clauses); the strip as a click target (the strip reads and does not command).

### D-6 Placement is ADDED; one live sentence is MODIFIED (RULING 12, its own exception clause)

`sighting-log`, `system-space-view` and `docked-fleet-actions` take no delta. The tab list is its own small requirement so each later piece MODIFIES that one block. Rejected: the chain doc's "mounted in the console" clause per requirement (23 MODIFIED blocks, 83 scenarios).

RULING 12 allows a MODIFIED block where a reviewer shows a live sentence this change makes false. One is shown:

- **`system-console` *The Vitals Strip Is Present on Every Render of the System Space View* — MODIFIED in this change.** Its first sentence says the strip is rendered "across the foot of the system space view". With the dock expanded the strip is the dock's top row, 164 px above the foot (`Main.dc.html`: the dock is a column anchored at `bottom: 0` whose first child is the 56 px strip), and this change's own journey leg measures the dock "from the top of the strip's row to the foot of the viewport" as 220 px. The appositive "the bottom-most always-visible band" stays true and does not rescue the positional phrase beside it. The block is six scenarios, none of whose text changes; the complete block is in the panel report (A2).
- **`system-space-view` *A Settled Sweep and the Scan Controls Are Reachable and Announced* — not MODIFIED.** Within that capability "the affordance that opens the sighting log" is the settled report's link (*A Settled Sweep Reports Its Outcome…*: a sweep that minted records "offers an affordance that opens the sighting log"), rendered by `ScanControl.tsx:345-353`. This change leaves `ScanControl` where it is (`SystemSpaceView.tsx:986`) and rewires only its `onOpenLog`, so the target list, commit, cancel and that link are reached in the same Tab sequence as before. The control this change deletes is the standalone toggle, which `system-space-view` never names; it is `sighting-log`'s affordance, replaced by the "Console" control and covered by the ADDED keyboard requirement. 2b-ii MODIFIES this block when the scan control itself moves.
- **`system-console` *The Strip Is Laptop-First and Never Overflows the View* — checked, not MODIFIED.** Its scenario "No other floating surface covers a strip cell" says every floating surface "remains fully visible and activatable itself". The column has been an `overflow-y-auto` scroller since link 2a (`SystemSpaceView.tsx:932`) with nothing bounding its content to its box, so that clause already holds only in the sense that each surface can be brought fully into view within its scroller. This change narrows the box and does not change the kind of claim. The stronger, unscrolled form appears only in this change's own ADDED geometry scenario, which is reworded (D-3, panel report A4).

### D-7 Escape (RULING 6) — mechanism settled

While, and only while, the dock is expanded, the dock listens for `keydown` on `document` and collapses on an Escape whose event is not `defaultPrevented`. A document listener, not a handler on the view's root, because after a pointer press focus can be on `<body>` (Safari and Firefox on macOS do not focus a clicked button) and a keydown on `<body>` never reaches the view's subtree. The fleet cell's menu needs no edit and no shared state: its handlers already call `preventDefault()` when they consume Escape (`VitalsStripFleetCell.tsx:96-98`, `:112-114`), and React dispatches them from the root container before the event reaches `document`. Not listening while collapsed makes "Escape changes nothing in a collapsed dock" true by construction.

One consequence the spec text must match (panel report A5): the menu takes Escape only when the keydown lands on its chevron or an entry. A menu opened by pointer and then left open while focus moves elsewhere does not see the key (it has no outside-dismiss; a pre-existing gap against its own live scenario), so that Escape collapses the dock and leaves the menu open. Probing the strip's DOM for an open menu instead would make Escape a dead key in that state and couple the dock to the strip's internals.

**Link 4 will MODIFY the Escape requirement** to add the second-press rule (clear the selection) when the Selected-entity tab exists; this change deliberately states "changes no selection". Rejected: Escape clearing the selection now; Escape scoped to focus inside the dock.

### D-8 No read on show, and the log mounts with the dock (RULING 8)

The log's reads stay `sighting-log`'s three triggers. The log's observer stays subscribed while hidden (D-1), so the settle re-read (D-11) lands while collapsed and expanding issues nothing. Rejected: a read on every expand.

### D-9 Tab label `Log`, no count (RULING 7; confirmed by the UX reviewer)

Rows loaded would read as a total and be wrong whenever more pages exist; a served total is backend, fenced. Reversal: one scenario and one label.

### D-10 A ghost does not open the dock (RULING 10)

The highlight is view state (`highlightedGhostId`), so the row is highlighted when the tab is next shown. Reversal: one handler.

### D-11 The settle re-read (RULING 9) — shape and sequencing settled

One stable view callback replaces `refetchGhostFeed` at both call sites: it calls `refetchGhostFeed()` and then `queryClient.invalidateQueries({ queryKey: queryKeys.sightings.pile(null) })`.

- **Invalidate by key, do not thread the log's `refetch` up.** An active observer refetches at once (the log is mounted and subscribed, expanded or not); an absent one is marked stale and reads when it mounts. `SightingLog.tsx` is not edited. The key is `['sightings','pile','all']`, which the filtered key `['sightings','pile',<systemId>]` does not prefix-match.
- **Keep `refetchGhostFeed`; do not replace both with one invalidation of `queryKeys.sightings.all`.** `SystemSpaceView.scan-refetch.test.tsx:264-274` and `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:757` mock the hook and assert its `refetch` spy; under those mocks an invalidation is a no-op, which is exactly why they stay green unedited.
- **ETA-scheduled exit** (`ScanSweepWatcher`): the callback is the watcher's `onSettled`, which already runs strictly inside the `.then` of the settling `resyncInterior()` (`:142-145`). It must be `useCallback`-stable: `onSettled` is a dependency of the watcher's timer effect (`:203`) and a new identity per render would tear the timer down every render.
- **Early-settle exit** (`:419-431`): the callback replaces the bare `refetchGhostFeed()` at `:426`. This exit is not triggered by an interior read. It fires on the `committedPending` true→false transition when the acting fleet's **running-status** read succeeds carrying no running sweep; the server has already settled the sweep by then, so the re-read is sequenced exactly as its sibling is. tasks.md 3.2's parenthetical says otherwise and is corrected in the panel report (A3).
- An infinite query refetches every loaded page in order with fresh cursors, so loaded pages survive a settle.
- **A request made while the entry's first read is in flight joins that read.** `Query.fetch` cancels and restarts an in-flight fetch only when the query already has data (`query-core/build/modern/query.js:166-176`); with no data yet it returns the promise already in flight. So if a settle callback fires while the log's first pile read is still unanswered, no new read is issued and the answer requested before the settle is taken as fresh. The ghost layer's `refetch()` has the same property today. It needs a pile read slower than a commit round trip plus a running-status read, or slower than the 400 ms cushion plus an interior read. Rejected: cancelling before invalidating — a cancelled data-less query reverts to `pending`/`idle`, which `SightingLog` renders as its empty state (`SightingLog.tsx:176-188` tests `isLoading`, not `isPending`), trading a rare stale read for a failed-is-not-empty violation. Recorded in Risks and to be filed.
- The watcher calls `onSettled` on every attempt of its retry loop, so while a past-ETA sweep stays unsettled the log's pile is re-read every `BOARD_POLL_MS`, as the ghost layer's is today. *The log does not poll while open* is conditioned on "no sweep running" and is not touched by this.

No delta. Rejected: file and ship (ships *The Log Reads on Mount…* false in the ordinary path and turns `scan-journey` step 5 red).

### D-12 Per-tab layout is not specified

The canvas has no artboard for the Log tab. The panel area is the scroll container; `SightingLog`'s own floating-card chrome (`max-h-[70vh]`, `w-80`, border, shadow, `SightingLog.tsx:156`) is inert inside a 128 px panel and is trimmed as outer chrome only, enough that the refresh control and the first row are in view at the scroll origin (UX U8; a title row plus one three-line row is about 100 px).

### D-13 The dock's Purpose

`openspec archive` discards a delta's `## Purpose`; the live Purpose is extended by hand after archive (task 5.8). With D-6's MODIFIED block, the same hand edit changes "the always-on vitals strip along the bottom of that view" to match.

### D-14 Journey instrumentation carried forward

The `[journey-console]` update-depth capture as a hard `afterEach` assertion and the `nextjs-portal` hide (`webServer.stdout: 'pipe'` is already configured).

### D-15 e2e arrangement policy

Each migrated spec opens the dock itself rather than through a helper. 2b-v cannot afford that without a helper and decides there.

### D-16 The log's mount gate is a latch on the interior read being at rest — new

The log's content mounts at the first render of this mount of the view in which no interior read is in flight (`!interior.isLoading && !interior.isFetching`), and then stays mounted until the view unmounts. It is a latch, not a live condition: the view polls the interior every 20 s, and a live `isFetching` test would unmount the log on every poll.

Why not carry today's `!interior.isLoading` unchanged: `isLoading` is `isPending && isFetching` (`queryObserver.js:310`), false from the first render whenever React Query still holds the interior (`gcTime` 5 min, `query-client.ts:79`). On a client-side return to a system the gate is open at mount while the stale interior's refetch — the read that settles a sweep whose ETA passed while the player was on the galaxy view — is in flight. That is the exact case the live `sighting-log` requirement names ("a sweep whose ETA passed while the view was closed settles on the open"). Today the log is not exposed to it because a player opens the log later by hand; mounted with the dock it would be, on every leave-and-return, and RULING 8 means re-expanding would not correct it. The latch makes the log's first read follow that settling read. On a cold cache it behaves exactly as `!interior.isLoading` does, and harnesses that mock `useSystemSpace` without an `isFetching` field are unaffected (`undefined` is falsy).

One sub-case the latch does not order. A return inside the interior's 60 s stale window issues no interior read at mount, so the latch is open at once and the log's first read, if its own entry is stale or absent, goes out before the settling read, which the watcher issues `ETA_CUSHION_MS` (400 ms) later from the cached running-scan ETA. D-11 then re-reads the pile after that settling read (the entry has data by then, so the invalidation cancels and restarts), so the records appear; but the letter of "the log's first pile read is issued only after" is not met there. It is not met today either, by the log or by the ghost layer, and is filed with the other pre-existing gaps rather than closed by teaching the view which fleets hold a past-ETA sweep.

No `sighting-log` delta: the latch makes the live scenario *A mount during an unsettled past-ETA sweep reads the pile after the settling read* hold at the log's new mount site in the case that scenario describes (the opening interior read is the settling read). This change's own ADDED sentence about the gate is reworded to the observable — no pile read and no log content until the interior read the view opened with has answered or failed (panel report A7) — so that it covers the warm case the latch exists for. The ghost layer keeps its own gate (`:816`); its identical exposure predates this change and is filed, not fixed (Risks).

### D-17 DOM order is the visual order, and the dock is last in the view — settled

Inside the view: the canvas layer (camera controls, then hit targets — `SpaceStage`'s own order, unchanged), the column, then the dock. Inside the dock: the strip's row, the "Console" control, then the hidden-while-collapsed wrapper holding the tab bar (the tab list with its one tab, then the collapse control as the tab list's sibling, never its child) and the tab panel. No element takes a positive `tabindex`. The keyboard order is therefore: camera controls, hit targets, the column, the strip's chevron, then "Console" (collapsed) or Log tab → collapse control → the log's controls (expanded), then `FloatingNav`. The collapse control precedes the panel because it precedes it on screen.

The camera cluster's lane class changes; its position in the DOM does not, so *Space View Camera Is Keyboard-Operable*'s ordering stays held by `SpaceStage.interaction.test.tsx`'s existing "keyboard tab order" describe, which is not edited.

### D-18 Focus on expand and on collapse — settled

- **On every open request** (a change of `openSeq`), after the commit that un-hides the wrapper, the dock focuses the selected tab. This applies to the "Console" control and to the report's link alike, including when the dock was already expanded. It is forced, not a nicety: the "Console" control is hidden by the expansion it causes, so leaving focus alone drops it to `<body>`. The UX reviewer reaches the same rule (U2).
- **On collapse**, the dock decides at the moment of the request, before the state change, whether `document.activeElement` is inside the wrapper that is about to be hidden; if it is, after the commit it focuses the "Console" control. Deciding after the commit is unreliable: a browser blurs a focused element that becomes `display: none` asynchronously, and jsdom never does.
- **Otherwise focus is not moved.** Escape with focus on a camera control, or on the strip's chevron, collapses the dock and leaves focus where it is. "Inside the dock" in the spec must therefore mean inside the tab bar or the panel, not the strip's row (panel report A6).
- The two controls are a disclosure pair: "Console" always exposes `aria-expanded="false"`, the collapse control always `"true"`, both `aria-controls` the wrapper. The tab bar is `role="tablist"`, the tab `role="tab"` with `aria-selected` and `aria-controls`, the panel `role="tabpanel"` with `aria-labelledby` the tab.
- A focus move is not a live-region announcement; the spec's "no announcement" sentence is reworded to say what is tested (panel report A11).

### D-19 Names the tests bind to

`console-dock` (root), `console-dock-open` (accessible name `Console`), `console-dock-region` (the hidden-while-collapsed wrapper), `console-tab-log` (name `Log`), `console-dock-collapse` (name `Collapse console`), `console-panel-log`, `console-panel-waiting` (D-21), `space-command-column` (D-3; deleted with the column in 2b-v). `sighting-log` and its inner testids are unchanged. `sighting-log-open` ceases to exist.

### D-20 The highlighted row is brought into view by the log, told when it is shown — new (UX U4)

The panel shows one to two rows, so a highlight below the fold is no feedback. The row cannot scroll itself at the moment it becomes highlighted: while the dock is collapsed it is under `display: none` and there is nothing to scroll. `SightingLog` takes one optional prop, `shown` (default `true`, so its standalone tests are untouched), and in an effect on `[shown, highlightedGhostId]` calls `scrollIntoView({ block: 'nearest' })` on the highlighted row while `shown` is true. The view passes `shown={expanded}`. This covers both cases UX names: a ghost activated while collapsed and the dock then expanded, and a ghost activated while expanded. It is the one edit to `SightingLog.tsx` beyond its outer chrome. jsdom does not implement `scrollIntoView`, so tier 1 defines it and asserts the call and its target; "lies wholly inside the panel area" is tier 4. Rejected: the view querying the panel for `[data-highlighted='true']` (reaches into another component's DOM); an `openSeq` prop (the log does not need to know why it is shown).

### D-21 The panel is never blank: a waiting indication until the latch opens — new (UX U3)

Until the log's mount gate opens (in 2b-i, the interior read's first load answering or failing; in 2b-i-b, D-16's latch), the Log tab's panel renders a neutral placeholder (`console-panel-waiting`) in place of the log. It is the dock's, not the log's, and must not reuse the log's "Reading the pile…", which would claim a read that is deliberately not issued. A failed interior read leaves no interior read in flight, so it opens the latch and the log mounts and reads; the placeholder cannot persist.

### D-22 What each tier holds — new

- **Tier 1 (vitest, jsdom):** structure, roles and attributes; focus (jsdom's focus is real); the `hidden` attribute and everything jsdom's own `[hidden] { display: none }` implies, including a real Tab walk across the collapsed and the expanded dock (D-1); request counts over the real `useSightings` with the service mocked; the published property's value and its removal on unmount; each occupant carrying the lane class imported from the one module (the camera cluster by source text, RULING 21).
- **Tier 1 cannot hold:** any dimension, overlap, scroll position or click-through (no layout); the order of camera controls against hit targets *in the view-level harness*, whose stage is mocked — that order is `SpaceStage`'s and is held by `SpaceStage.interaction.test.tsx` unedited; a pointer press falling through to the canvas (a mocked sibling stage cannot receive it).
- **Tier 4 (one journey):** the 220 and 56 px figures, non-overlap in both states measured on visible areas with the column as one scrolling surface, the scroll leg (arranged with three seeded records, not left to chance), 24 px targets, the refresh control and first row in view, the Tab walk repeated on the real stylesheet, the settled sweep's report link leaving the dock expanded on the Log tab with focus on the tab, and the galaxy nav at 72 px reached by client-side navigation from an expanded dock, returning to a collapsed dock. The click-through leg and the settled sweep's record appearing with no re-open are 2b-i-b's: the app-wide 60 s stale time may serve a cached pile and the settle re-read (the drift record) is that link's, so the journey logs what it saw of the record and does not assert it.

## Risks / Trade-offs

- **Coexistence** of a dock and a shrinking column for five changes (proposal, "Costs said out loud").
- **The collapsed column is 68 px shorter than today** (D-3). Existing specs click through it with auto-scroll, but the two 1280×720 collision legs hit-test controls at their centres and would report a control scrolled under the column's foot as blocked. They pass today with 632 px; whether they pass with 564 px is not knowable without a run. Tasks 3.4 and 3.5 own this.
- **The expanded dock covers the canvas's lowest 220 px.** A mark there cannot be clicked while the dock is expanded; migrated specs that click a ghost after opening the log (`scan-journey`'s cross-highlight test) must collapse first or assert through the attribute.
- **The log's first read now happens at view open** for a surface that may never be shown; one request per view open. Any e2e route intercept matching `**/v1/sightings**` now catches two reads (`vitals-strip-journey.spec.ts:458`).
- **Records minted elsewhere** appear on Refresh or the next settle, not on re-expansion (proposal).
- **The log inherits the settle watcher's holes exactly, no wider.** If a running-status refetch clears the sweep's ETA before the watcher's timer fires (a remount with a stale inbox entry, or a mine commit on the same fleet, which shares the inbox key), the watcher's effect is torn down and no follower read is issued for the ghost layer, the report or the log. D-16 removes the commonest way to hit this for the log; the hole itself is to be filed.
- **The ghost layer's mount gate has the warm-cache exposure D-16 closes for the log.** To be filed as drift against `system-space-view`; not fixed here.
- **jsdom does no layout and loads no app stylesheet** (it does apply `[hidden] { display: none }`, D-1). Every dimension and overlap claim is held at tier 4 by one journey spec; tier 1 holds structure, attributes, the published value, focus and tab-order reach (D-22).
- **With the dock expanded at 720 px tall the column is a 400 px scroller** until 2b-v deletes it (D-3). Reachable, not all visible at once.
- **A settle re-read that arrives during the log's first pile read is absorbed by it** (D-11). Rare; corrected by Refresh or the next settle.
- **`scan-lane-transit-fizzle`'s "zero rows" stops meaning anything unless it refreshes first:** the log is read at view open, before the fizzle settles (panel report A9).
- **A leaked `--console-dock-height`** would raise the galaxy route's nav. The cleanup is asserted at tier 1 (unmount removes the property) and at tier 4 only if the journey reaches the galaxy route by client navigation from an expanded dock; a `page.goto('/')` cannot see a leak.
- The vacuous assertion at `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:875` concerns the Scan tab and lands in 2b-ii.

## Migration Plan

None. Solo project, no backward-compatibility obligation: the floating log, its toggle and `logOpen` are deleted in this change with no shim. The dock's state is not persisted, so no stored state exists to migrate.

## Open Questions

Settled and no longer open: the height mechanism (D-3), where dock state lives and the open entry point (D-4), DOM order (D-17), focus on expand and collapse (D-18), the `<Activity>` and `[hidden]` claims (D-1, D-2), the two possibly-false live sentences and a third that was checked (D-6), the mount gate (D-16), the row brought into view (D-20), the waiting indication (D-21), what each tier holds (D-22).

Still open, for the orchestrator:

- **Size — ruled (RULING 15).** The unsplit scope was 52 tasks as drafted and 56 with the review additions (panel report A1). The seam is lifetime against placement: this change keeps the shell, the Log tab's placement, the keyboard and focus rules, the geometry and the MODIFIED strip block, with the log mounted on show exactly as `logOpen` mounts it today; `keep-console-tab-content-mounted` takes stays-mounted, no read on show, the settle re-read, the mount latch, Escape, not-a-pick and the row-into-view scroll, and closes `drift-sighting-log-not-reread-after-sweep-settles.md`. The other seam sized (keyboard, Escape and not-a-pick out, lifetime in) left a first half of 46. This change's honest count is in tasks.md.
- **Q1 — What is `N` in `Log · N`?** Ruled none (RULING 7), confirmed by the UX reviewer. A wire-backed count is a later, separately ruled addition.
- **Q3 — (2b-ii) Which tab is shown on expand?** Not ruled; vacuous with one tab. Analysis lean: first tab on first expand, last-selected thereafter. 2b-ii must rule it before `sighting-log` *The log is opened from the space view* can stay true there, since "Console" may then open on another tab.
- **Whether the two 1280×720 collision legs survive the shorter collapsed column** (Risks). Not knowable without a run. If they do not, the fallback is to stop stacking the column above the cluster while collapsed only, which needs a second published value.
- **Pre-existing gaps to file, not fix:** the settle watcher's disarm race and the ghost layer's warm-cache mount gate (Risks); the settle re-read absorbed by an in-flight first read (D-11), which the ghost layer shares; the log's first read preceding the settling read on a return inside the interior's stale window (D-16); the fleet cell's menu ignoring Escape when focus has left it (D-7).
- **The predecessor's browser measurements** (D-1's four `display: none` results, D-3's twelve pixel figures) were not repeated in the second run; the journey's legs are their confirmation.
- **The strip's 56 px row** is stated in the spec for the first time by this change. The UX reviewer asks to keep it; it is kept.

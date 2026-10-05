# keep-console-tab-content-mounted — implementation contract (kickoff, Phase 2 step 7)

Architect, 2026-10-05. Change: `openspec/changes/keep-console-tab-content-mounted/` (4 ADDED + 1 MODIFIED on `system-console`, 39 scenarios, 40 tasks), adversary-cleared at round 3, verdict commit `805bfaa`. The verdict is current: `git diff 805bfaa -- openspec/specs/system-console openspec/specs/sighting-log openspec/specs/system-space-view openspec/changes/keep-console-tab-content-mounted` is empty at `9648346`. Nothing under `openspec/` was edited to write this. Line numbers are the tree's at `9648346`. Nothing was run to write it (no suite, no stack); every `file:line` was read.

Frontend only. No Go, no wire change, no new endpoint, query, query key, dependency or production testid. Binding inputs: RULINGs 1-18 (`keep-console-tab-content-mounted-rulings-index.md`), design.md D-1 to D-8, r3-m1 (bound in §3.6 and §4.5), r2-m2 (bound in §3.3).

Paths are relative to `frontend/` unless they start with `docs/`, `openspec/` or `harness/`. "The view" is `components/space/SystemSpaceView.tsx`; "the shell" is `components/space/ConsoleDock.tsx`.

## 0. The seam, in one paragraph

Two production files change. In the view, the Log tab's content stops depending on `dock.expanded` and is gated by a per-mount latch that opens when no interior read is in flight; and one stable callback replaces `refetchGhostFeed` at the two settle exits, adding an invalidation of the unfiltered pile's key. In the shell, one `window` keydown listener, present only while expanded, routes Escape through the existing `handleCollapse`. Everything else is fenced. The SDET writes two new tier-1 files and extends two existing ones before any of that is built.

## 1. Task, owner and file map (all 40)

Owners: **SDET** (`openspec-sdet`), **DEV** (`nextjs-dev`), **ORCH** (orchestrator), **QA**. Phase: **red** = written and judged before any production edit; **build**; **post-build** = written against the built UI and not run by its author; **gate**.

New tier-1 files: `components/space/SystemSpaceView.console-log-mounted.test.tsx` (file **L**, harness §3.1) and `components/space/SystemSpaceView.console-dock-escape.test.tsx` (file **E**, harness §3.7). Existing tier-1 files edited: `components/space/SystemSpaceView.sighting-log-mount-ordering.test.tsx` (file **M**, §3.5) and `components/space/SystemSpaceView.console-dock.test.tsx` (file **D**, §3.9).

| Task | Owner | Phase | File | Status at the red gate (§3.10 has the reasons) |
| --- | --- | --- | --- | --- |
| 1.1 | SDET | red | L | assertion-red, all three rows |
| 1.2 | SDET | red | L | already-green (control for 1.3) |
| 1.3 | SDET | red | L | assertion-red |
| 1.4 | SDET | red | L | already-green (guard) |
| 1.5 | SDET | red | L | assertion-red |
| 1.6 | SDET | red | L | already-green (control for 1.5) |
| 1.7 | SDET | red | L | assertion-red |
| 1.8 | SDET | red | L | rows 1 and 3 assertion-red; row 2 (Escape) red at its precondition until 4.3; row 4 already-green (control) |
| 1.9 | SDET | red | L | already-green (positive control for 1.8) |
| 1.10 | SDET | red | L | red at its labelled precondition until 4.1; red for its own reason between 4.1 and 4.2 |
| 1.11 | SDET | red | L | as 1.10 |
| 1.12 | SDET | red | M | first half already-green, closing assertion red |
| 1.13 | SDET | red | M | assertion-red at the expansion |
| 1.14 | SDET | red | L | first row (two parameters) and the two cold rows already-green; the two warm rows assertion-red |
| 1.15 | SDET | red | L | assertion-red at the expansion |
| 2.1 | SDET | red | E | assertion-red |
| 2.2 | SDET | red | E | assertion-red, every row |
| 2.3 | SDET | red | E | already-green (guard) |
| 2.4 | SDET | red | E | row 1 assertion-red; rows 2-4 already-green (controls) |
| 2.5 | SDET | red | E | assertion-red at the second Escape |
| 2.6 | SDET | red | E | already-green, cannot fail at tier 1 (`Playwright, deferred` for its real observer) |
| 3.1 | SDET | red | D | the tightened helper makes D's one consumer test red until 4.1 |
| 3.2 | ORCH | build (immediately after 4.1) | the `SystemSpaceView*.test.tsx` and `SpaceStage*.test.tsx` families, run not edited | — |
| 3.3 | SDET | post-build | `e2e/tests/scan-lane-transit-fizzle.spec.ts` | not run |
| 3.4 | SDET | post-build | `e2e/tests/scan-journey.spec.ts` | not run |
| 3.5 | SDET | post-build | `e2e/tests/vitals-strip-journey.spec.ts` | not run |
| 3.6 | SDET | post-build | `e2e/tests/console-dock-journey.spec.ts` | not run |
| 4.1 | DEV | build | the view | — |
| 4.2 | DEV | build | the view | — |
| 4.3 | DEV | build | the shell | — |
| 5.1 | ORCH | gate | — | — |
| 5.2 | SDET | gate (after every box in sections 1-4 is ticked) | new `e2e/tests/keep-console-tab-content-mounted-journey.spec.ts` (§5) | not run by its author |
| 5.3 | QA | gate | reads 5.2's spec | — |
| 5.4-5.10 | ORCH | gate | — | — |

No task is Go. No task is shared-contract work: there is no cross-boundary payload in this change.

## 2. Production shape

### 2.1 Files that change, and the fence

| File | Tasks | What changes |
| --- | --- | --- |
| `components/space/SystemSpaceView.tsx` | 4.1, 4.2 | §2.2, §2.3 |
| `components/space/ConsoleDock.tsx` | 4.3 | §2.4 |

**Fenced: an edit to any of these by anyone in this change is a finding for the orchestrator, not a fix.** `components/space/SightingLog.tsx`, `hooks/use-sightings.ts`, `hooks/use-system-space.ts`, `lib/query-client.ts`, `lib/query-keys.ts` (no key is added; `queryKeys.sightings.pile(null)` exists at `:103-104`), `components/space/VitalsStrip*.tsx` (the fleet cell included), `components/space/ScanControl.tsx`, `components/space/SpaceStage.tsx`, `components/space/FleetActionsPanel.tsx`, `components/space/SpaceCommandPanel.tsx`, `lib/console-dock-layout.ts`, every other hook and service, `next.config.ts` (never `experimental.routerBFCache`), `package.json` and its lock, `playwright.config.ts`, `e2e/setup/`, everything under `backend/`, everything under `openspec/` (an edit under the change folder or `openspec/specs/system-console/` expires the verdict). In `tasks.md` the one permitted write is ticking one's own box (§6).

Tier-1 test files not named in §1 are not edited by anyone: `ConsoleDock.test.tsx`, `SightingLog*.test.tsx`, `SystemSpaceView.test.tsx`, `SystemSpaceView.render-loop.test.tsx`, `SystemSpaceView.scan-refetch.test.tsx`, `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` and the rest of the family. A red in one of them after 4.1 is task 3.2's to attribute.

Every test file, new or existing, is immutable to DEV. A test believed wrong is a dispute for the orchestrator citing the scenario text. No `skip`, no `only`, no edited assertion.

### 2.2 The latch (task 4.1; design.md D-1, D-3)

**Where its state lives.** View state, one boolean per mount of the view, beside the dock state (`:300`). Recommended name `logLatched`. `useState(false)`; never a ref read during render, never an effect, never derived from the query cache (design.md D-3 "How it is held").

**The exact opening condition.** In the render body:

```ts
const interiorAtRest = !interior.isLoading && !interior.isFetching
if (!logLatched && interiorAtRest) setLogLatched(true)
```

Both terms are required (D-3 "Why both terms": every hook-mocking harness supplies `isLoading` and no `isFetching`, and `undefined` is falsy). Nothing else may open it: not `interior.data`, not `interior.isError`, not `interior.fetchStatus`, not `dock.expanded`. Nothing closes it; the view remounts on a change of system and the state resets with it. A latch written as "an interior is held or the read failed" is the build r3-m1 names and §3.6's first row fails.

**The expression.** `:811-822` becomes "the log if `logLatched`, otherwise `<ConsolePanelWaiting />`". It does not read `dock.expanded`. The `SightingLog` element's props are exactly today's six (`:815-820`). The comment at `:807-810` is rewritten to say what the gate now is.

**Hiding.** Nothing is added for it. The shell already renders `{tab.content}` in both states inside the region it hides with the `hidden` attribute (`ConsoleDock.tsx:118`, `:155`). No wrapper element, no new prop on the shell, no `shown` prop on `SightingLog`, no `<Activity>`. A hidden row keeps `data-highlighted="true"`; "not presented" is visibility, not the attribute (RULING 10).

**Not changed by 4.1.** The ghost feed's gate at `:843` stays `!interior.isLoading` (a filed gap, task 5.10). `showLoading` (`:804`) is untouched.

**Testids the tests rely on, all existing:** `console-dock`, `console-dock-open`, `console-dock-region`, `console-tab-log`, `console-dock-collapse`, `console-panel-log`, `console-panel-waiting`, `sighting-log`, `sighting-row-${id}`, `sighting-log-load-more`, `sighting-log-empty`, `sighting-log-error`, `sightings-unavailable`, `scan-report`, `vitals-strip`, `vitals-fleet-chevron`, `vitals-fleet-menu`, `vitals-fleet-menu-item-${fleetId}`, `space-canvas-region`, `mine-tons-input`, `mine-kind-select`, `scan-target-select`, `scan-commit-button`. Matched by name or text because they have no testid and gain none: the refresh control (`aria-label` exactly `Refresh sighting log`), the log's and the card's `Retry` buttons (scoped with `within` to `sighting-log-error` and `sightings-unavailable`), the report's link (name exactly `Open the sighting log`), the log's loading text (`Reading the pile…`), the no-mark statement (`This record has no mark in the open system.`).

**No production testid is minted by this contract.** The test-only identifiers of the stage mock are in §3.8.

### 2.3 The one settle callback (task 4.2; design.md D-4; security S1)

One `useCallback`-stable view callback, declared after `qc` (`:359`) and before the early-settle effect (`:429`). Recommended name `rereadPilesAfterSettle`:

```ts
const rereadPilesAfterSettle = useCallback(() => {
  refetchGhostFeed()
  void qc.invalidateQueries({ queryKey: queryKeys.sightings.pile(null) })
}, [refetchGhostFeed, qc])
```

**The exact key invalidated:** `queryKeys.sightings.pile(null)`, which is `['sightings', 'pile', 'all']`. Never `queryKeys.sightings.all` (a prefix of every system-filtered entry; it would read the ghost feed twice). The order inside the callback is fixed: the ghost-feed refetch first, then the invalidation.

**Its two call sites, and no third.**

1. `:857`: `onSettled={rereadPilesAfterSettle}` in place of `onSettled={refetchGhostFeed}`. `ScanSweepWatcher` itself (`:108-208`) is not edited: `onSettled` is already in its timer effect's dependency array (`:205`), which is why the callback must be stable.
2. `:436`: `rereadPilesAfterSettle()` in place of the bare `refetchGhostFeed()`, inside the existing guard at `:433`, which does not move. The dependency array at `:441` names the new callback in place of `refetchGhostFeed`.

It must not be called from `resync` (`:554`), `resyncAndRefreshScanTargets` (`:573`), the three refetch rules (`:593-622`) or the report's link (`openLog`, `:305`). 1.8's last row and its link row fail those builds.

**Kept.** `refetchGhostFeed` (`:295`) and its ref stay; the new callback calls it. That is what keeps `SystemSpaceView.scan-refetch.test.tsx:264,274` and `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:734-757` green unedited (they assert the hook mock's `refetch` spy). The log's own `refetch` is not threaded up.

### 2.4 The Escape listener (task 4.3; design.md D-5, D-6)

In the shell, one effect:

| Property | Binding |
| --- | --- |
| Target | `window`. Never `document`, never an element, never the view's root |
| Event and phase | `keydown`, bubble phase (no options argument, or `false`). Never capture |
| Lifetime | registered in a `useEffect` only while `expanded` is true; removed by that effect's cleanup, so it is gone on collapse and on unmount |
| Guards, all three and no others | `event.key === 'Escape'`; not `event.defaultPrevented`; not `event.repeat` |
| Action | calls the shell's `handleCollapse` (`:90-93`) and nothing else |
| Forbidden | `preventDefault`, `stopPropagation`, an `isComposing` test (RULING 14), a test of `event.target` or of an editable target (RULING 6), a DOM probe for the fleet menu (RULING 7), a second `onCollapse` call site |

**The single collapse path.** `handleCollapse` stays the only caller of `onCollapse`. It already decides, before the state change, whether `document.activeElement` is inside the region (`:91`), and the effect at `:82-88` moves focus to the "Console" control only then. The collapse control (`:142`) and the listener both call it. To satisfy the hooks lint without a ref written during render, `handleCollapse` becomes a `useCallback` over `[onCollapse]` and the listener effect's dependencies are `[expanded, handleCollapse]` (the view's `collapseDock` is stable, `SystemSpaceView.tsx:304`). The only import change in the shell is adding `useCallback`.

The view is not edited for Escape. It gains no key handler.

### 2.5 What is deleted

- The mount-on-show expression `!dock.expanded ? null : interior.isLoading ? … : …` (`SystemSpaceView.tsx:811`) and its comment (`:807-810`). Gone, not kept beside the latch.
- The direct wiring of `refetchGhostFeed` as `onSettled` (`:857`), the bare call at `:436`, and its entry in the dependency array at `:441`.
- Nothing in the shell. No flag, no shim, no fallback path anywhere.

### 2.6 The unspecced production hunks U1-U10 (`docs/handoffs/add-vitals-strip-qa-reverify.md` § 3; Travis's, to stay byte-identical)

Of the two production files this change edits, **only `SystemSpaceView.tsx` contains any: U2, three hunks.** `ConsoleDock.tsx` contains none (the file was created by `e5e9eff`, after the commits that carry U1-U10).

| Hunk | Current lines in `SystemSpaceView.tsx` | Text that must survive unchanged |
| --- | --- | --- |
| U2 (import) | `:51` | `import { useCoarseWorldTime, useWorldClock, wallMsUntil, type WorldClock } from '@/lib/client-clock'` |
| U2 (sweep watcher timer) | `:190-196` | the five-line comment beginning `` // `eta` is WORLD time ``, then `const delay = wallMsUntil(clock, eta) + ETA_CUSHION_MS` and `timer = setTimeout(attempt, delay)` |
| U2 (arrival refetch timer) | `:600-603` | the two-line comment beginning `// World instant -> wall delay`, then `const delay = wallMsUntil(clock, soonest) + ETA_CUSHION_MS` and `const timer = setTimeout(resyncAndRefreshScanTargets, delay)` |

DEV's edits to the view are at `:300-305` (one added state line and the render-phase set, or the same two lines placed directly above `:806`), one added callback between `:359` and `:429`, `:436`, `:441`, `:806-822` and `:857`. **No import line of the view changes** (`useState`, `useCallback`, `useQueryClient` and `queryKeys` are already imported). A diff of the view that shows a changed line in `:36-67`, `:108-208` or `:548-622` is a defect.

None of the other hunks is in a file this change touches: U1 (`lib/client-clock/index.ts`), U3-U5 (backend), U6 and U10 (`package.json`, the lock, `go.mod`), U7 (`playwright.config.ts`), U8 (`lib/firebase.ts` and the port wiring), U9 (`e2e/setup/backend-stack.ts`). The SDET's e2e edits (3.3-3.6, 5.2) are to spec files under `e2e/tests/` only and reach none of them. The journey reads world scale 5 from the stack U9 boots and does not change it.

## 3. Harness settlements (tier 1)

### 3.1 File L: what is mocked and what runs for real

`components/space/SystemSpaceView.console-log-mounted.test.tsx`. The module list is that of `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:45-150` with two changes: `@/hooks/use-sightings` is **not** mocked, and `@/hooks/use-system-space` hands through (§3.3).

**Real, never mocked:** `SystemSpaceView`, `ConsoleDock`, `SightingLog`, `VitalsStrip` and its cells, `ScanControl`, `SpaceCommandPanel`, `FleetActionsPanel`, `FleetRoster`, `buildSceneModel`, `@/hooks/use-sightings`, `@/hooks/use-scan` (all three hooks), `@/hooks/use-actions` (all of it), `@/lib/query-keys`, `@/lib/realtime`.

**Mocked at the service boundary:** `@/lib/services`, providing exactly `sightingService.list`, `systemService.getSystemSpace`, `fleetService.scanTargets`, `fleetService.scan`, `actionService.listRunning`, `actionService.listSettled`, `actionService.cancel`, `actionService.acknowledge`. Defaults in `beforeEach`: `listRunning` and `listSettled` resolve `[]`, `scanTargets` resolves `[]`.

**Mocked as hooks:** `@/hooks/use-system-space` (§3.3), `@/hooks/use-fleets` (`importActual`, `useMyFleets` settable, the verbs inert), `@/hooks/use-market` (`importActual`, board and station inert), `@/components/corporation-provider`, `@/hooks/use-galaxy`, `@/components/account-provider`, `@/hooks/use-burn-preview`, `@/lib/toast`, `next/navigation`. `./SpaceStage` is the mock of `SystemSpaceView.console-dock.test.tsx:124-150` (one `mock-ghost-${recordId}` button per sighting mark from the real scene model).

### 3.2 The query client, the stale entry, and counting requests

- **Client.** One per test, `new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })`, kept in a variable the test can reach. No `staleTime` (so 0) and no `gcTime` (so the default 5 minutes): an entry is stale the moment its read answers and survives a collapse under today's build. Never the app's client from `lib/query-client.ts`, whose 60 s stale time would let a remounting build issue nothing.
- **A stale entry** is therefore any answered entry; nothing is aged by hand. This is what makes a request count discriminate: today's build remounts the log on show, the observer finds stale data and refetches on mount.
- **Counting.** `sightingService.list` is one `vi.fn` routed on its argument. A **pile request** is a call whose argument has no `systemId` (with or without `cursor`); a **ghost request** has one. The file defines `pileRequests()` returning the calls of the first kind. Every "no request" claim is `pileRequests().length` compared against a snapshot taken after a flush. The ghost feed's calls are never counted.
- **Serving.** The pile route is a settable function of the params. Paging is `{ sightings: P1, nextCursor: 'c2' }` for no cursor and `{ sightings: P2, nextCursor: '' }` for `cursor === 'c2'`. A "served pile gains a record" is the function being replaced between two reads.
- **Flush.** Real timers: `await act(async () => { await new Promise((r) => setTimeout(r, 0)) })`. Fake timers: `await act(async () => { await vi.advanceTimersByTimeAsync(0) })`. A snapshot is always taken after a flush.
- **A read caused while collapsed (1.1 row 2)** is arranged by `qc.invalidateQueries({ queryKey: queryKeys.sightings.pile(null) })` on the test's own client. Under today's build it only marks the entry (no observer), so the red is the request at the re-expansion, the stated reason. Do not click the hidden Refresh for this: under today's build it does not exist and the red would be a missing element.
- **Expanding and collapsing** use `fireEvent.click` on `console-dock-open` and `console-dock-collapse` unless the row is about the keyboard.

### 3.3 The interior in file L (binds r2-m2)

```ts
const interiorMode = vi.hoisted(() => ({ real: false }))
const useSystemSpace = vi.fn()
vi.mock('@/hooks/use-system-space', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-system-space')>('@/hooks/use-system-space')
  return { useSystemSpace: (id: string) => (interiorMode.real ? actual.useSystemSpace(id) : useSystemSpace(id)) }
})
```

`interiorMode.real` is `false` in `beforeEach` and set to `true` by 1.15 alone, before it renders; it never changes inside a test, so the view's hook order is stable. Every other test in L drives the `vi.fn` with `{ data, isLoading, isError, error, refetch }` and, only where the row says so, `isFetching`.

**A held interior (1.15).** `qc.setQueryData(queryKeys.systemSpace.detail(SYSTEM_ID), INTERIOR, { updatedAt: Date.now() - 120_000 })` before rendering; `systemService.getSystemSpace` returns a promise the test resolves. At mount the real hook reports `isLoading: false, isFetching: true` on render one (design.md D-3). `useMyFleets` stays the mock.

**A held interior in the hook-mocking arrangements (1.13, 1.14, 1.8 row 4)** is the mock returning `{ data: INTERIOR, isLoading: false, isFetching: true, … }`; "answers" is the mock set to `isFetching: false` and the same tree re-rendered under `act`; "fails" is `isError: true, isFetching: false` with the data kept.

### 3.4 File L, task by task

Each task is one arrangement group with one closing assertion. `A`, `B` are records; a record "with a ghost" is in the open system at a non-origin position and is also served by the ghost route; a record "with no ghost" carries another `systemId`.

| Task | Arrangement | Closes on |
| --- | --- | --- |
| 1.1 | Three rows. (a) expand, first page listed, click `sighting-log-load-more`, second page listed. (b) expand, page listed, collapse, the served pile gains `B`, invalidate on the test's client (§3.2), flush. (c) expand, click load-more with its answer held, collapse, release the answer, flush. In each: snapshot; (a) collapse; expand | the expected rows are all listed and `pileRequests().length` equals the snapshot |
| 1.2 | `A` with a ghost in both routes. Expand, click `sighting-row-A`, collapse, expand | `sighting-row-A` has `data-highlighted="true"`. Precondition before the collapse: it already does |
| 1.3 | `A` with no ghost. Expand, click `sighting-row-A`; precondition: the no-mark text is inside that row. Collapse, expand | the same text is still inside `sighting-row-A` |
| 1.4 | `A` with a ghost, listed. Click `mock-ghost-A`. Dock collapsed. `.focus()` on `vitals-fleet-chevron`, then `user.tab()` until focus returns to `document.body` or a bound of 60 stops | no focused stop was inside `console-dock-region`; `within(console-dock-region)` default role queries find no `button` and no `status`; every element matching `sighting-row-*` is `not.toBeVisible()`. Then expand: `sighting-row-A` is highlighted (the checkpoint that shares 1.2's control status) |
| 1.5 | The pile route rejects; the ghost route resolves. Mount, flush, snapshot, expand | inside `console-panel-log`: `sighting-log-error` with its `Retry`; no `sighting-log-empty`; no `Reading the pile…`; `pileRequests().length` equals the snapshot. First read only (RULING 12): no row arranges a failed load-more or re-read |
| 1.6 | Both routes reject. Expand. Set the ghost route to resolve, click the `Retry` inside `sightings-unavailable`, wait for the card to go | `sighting-log-error` is still in the panel |
| 1.7 | Interior mock answered at mount, a fresh client, dock never expanded, flush | `pileRequests()` has length 1 |
| 1.8 | Four rows, each beginning with `settleFirstRead()`: expand, wait for the log's rows inside the panel, collapse, flush, snapshot. That makes "the first read has been answered" true under both builds, so today's red is the stale-entry request and not 1.7's. (1) expand, collapse, expand. (2) expand, `user.keyboard('{Escape}')`, precondition `console-dock-region` has `hidden`, expand. (3) `listSettled` resolves one settled scan with no `reasonCode` from the start; click the button named `Open the sighting log`; checkpoint: region not `hidden`, tab `aria-selected="true"`. (4) fake timers for this row; expand; interior mock to `isFetching: true` and re-render; advance `BOARD_POLL_MS` (imported from `@/lib/realtime`) so the baseline poll calls the interior mock's `refetch`; mock back to `isFetching: false` and re-render; flush | `pileRequests().length` equals the snapshot. Row 4 also checks the rows are still listed |
| 1.9 | `settleFirstRead()` with `A`; the served pile gains `B`; expand; click the refresh control | `sighting-row-B` is listed. Nothing asserts that `B` was absent before the click |
| 1.10 | Arranged as `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:327-430` arranges a real settle: fake timers; `listRunning` resolves one running scan with `eta: T0 + 5_000` once, then `[]`; the interior mock's `refetch` returns a promise the test holds. Dock never expanded. Mount, flush; **labelled precondition** `pileRequests()` has length 1 ("the log's first read was issued"); snapshot. The served pile gains `B`. Advance 6 000 ms: checkpoint, the count equals the snapshot while the interior refetch is held. Release it, flush | `pileRequests().length` is the snapshot plus 1 (message: "the unfiltered pile was not read again"). Then expand: `sighting-row-B` is listed and the count is unchanged by the expansion. One loaded page only, so the re-read is one request |
| 1.11 | Arranged as the same file's `:674-770` (real timers, `waitFor`): `scanTargets` resolves one host at mount; `listRunning` resolves `[]` at mount and is held on its second call; select the host in `scan-target-select`, click `scan-commit-button`, wait for the second `listRunning` call. Same labelled precondition and snapshot as 1.10. The served pile gains `B`. Checkpoint: the count equals the snapshot while that read is held. Release it with `[]` | as 1.10: snapshot plus 1, then `B` listed on expansion with no further request. The guard at `:433` is not tested |
| 1.14 | Interior mock per row; `fireEvent.click(console-dock-open)` synchronously after the mount, before any flush; the panel is read with presence queries. Rows: §3.6 | the sequence the panel showed: `console-panel-waiting` (its text not containing `Reading the pile`) while a read is in flight, then `sighting-log` and no waiting indication |
| 1.15 | `interiorMode.real = true`, a held interior (§3.3). Mount; after the first commit and after a flush, collapsed: checkpoint `pileRequests()` has length 0. Expand with the re-read still held | `pileRequests()` has length 0 after the expansion, and exactly 1 once the re-read is released and flushed |

### 3.5 File M (tasks 1.12, 1.13)

`SystemSpaceView.sighting-log-mount-ordering.test.tsx` keeps its hook mocks and its one existing test, unedited and re-read. Three things become settable so the new arms can exist; none changes what the existing test observes:

- the `useRunningScan` constant at `:82` becomes a read of a hoisted value whose default is the same past-ETA sweep;
- the `useSightings` mock at `:90-95` returns a hoisted, settable result for the `null` argument (default: the same empty page), and keeps pushing every argument list to `sightingsCalls`;
- the file imports `screen`, `fireEvent` and `within`.

A **read of the unfiltered pile** in this file is a recorded call whose first argument is `null`. The ghost feed's calls carry the system id and are filtered out; the existing test's unfiltered `sightingsCalls.length` stays as it is.

| Task | Arrangement | Closes on |
| --- | --- | --- |
| 1.12 | The file's past-ETA sweep. Interior mock `isLoading: true` at mount, dock never expanded: checkpoint, zero `null` calls. Interior mock answered, same tree re-rendered | at least one `null` call, with the dock still collapsed |
| 1.13 | Interior mock `{ data: INTERIOR, isLoading: false, isFetching: true }` at mount. Collapsed: checkpoint, zero `null` calls. Expand: zero `null` calls and no `sighting-log` in the document. `isFetching: false`, re-render: at least one `null` call. Then set `useRunningScan` to no running sweep, the `null` result to a page with rows, `isFetching: true` again, re-render | `sighting-log` is still inside `console-panel-log` with its rows. That the re-read issues no pile request is 1.8 row 4, which can see one |

### 3.6 Task 1.14's rows, and r3-m1 (binding)

Every row is read with the dock expanded immediately after the mount, because every scenario the task carries has "the dock is expanded" in its GIVEN and its closing assertion is what the panel shows. That is also what makes the first row green on arrival, as its box says: under today's build an expanded dock with `isLoading: false` already shows the log. That the log is present while the dock is still collapsed is 1.7's and 1.15's observation, not this task's.

| Row | Interior mock at mount | Then | Expected sequence | At the red gate |
| --- | --- | --- | --- | --- |
| 1a | `{ data: INTERIOR, isLoading: false, isFetching: false, isError: false }` | — | `[log]` | already-green |
| **1b (r3-m1)** | **`{ data: undefined, isLoading: false, isFetching: false, isError: false }`**: no interior held and nothing in flight, the offline arm of the MODIFIED requirement's no-read-in-flight sentence | — | `[log]` | already-green |
| 2 | `{ data: undefined, isLoading: true }` | answers | `[waiting, log]` | already-green |
| 3 | `{ data: undefined, isLoading: true }` | fails | `[waiting, log]` | already-green |
| 4 | `{ data: INTERIOR, isLoading: false, isFetching: true }` | answers | `[waiting, log]` | assertion-red: the log is shown while the re-read is in flight |
| 5 | as row 4 | fails (`isError: true`, data kept) | `[waiting, log]` | assertion-red, same reason |

Row 1b is **required by FULL-AUTO RULING 18** and is not optional. It is the only observer of a latch that opens on "an interior is held or the read failed": that build passes rows 1a-5 and every other task, and shows the waiting indication for as long as the client is offline. The view renders with `interior.data` undefined and no error (`SystemSpaceView.tsx:478-518`, `:722-746` are all optional reads). The row asserts `within(console-panel-log).getByTestId('sighting-log')` and that `console-panel-waiting` is absent.

The second half of r3-m1 is the orchestrator's, at task 5.10: §4.5.

### 3.7 File E: what is mocked and what runs for real

`components/space/SystemSpaceView.console-dock-escape.test.tsx` follows `SystemSpaceView.console-dock.test.tsx:30-150`: every read is a mocked hook, `useSightings` is the per-argument settable mock that records its calls, `useSettledScan` is settable. Real: `SystemSpaceView`, `ConsoleDock`, `VitalsStrip` and its cells (so the real fleet menu's handlers run), `SightingLog`, `ScanControl`, `FleetActionsPanel`, `SpaceCommandPanel`, `FleetRoster`. Two differences from that file:

1. **One shared refetch spy.** Every mocked read's `refetch` (interior, own fleets, both sightings results, scan targets, running and settled scan, station) is the same hoisted `vi.fn`, and every mutation's `mutate` is reachable, so 2.4 can assert that none was called. A fresh `vi.fn()` per hook call, as that file has, cannot be observed.
2. **The stage mock of §3.8.**

`userEvent.setup()` for keys and Tab. Escape is `user.keyboard('{Escape}')`, which dispatches on `document.activeElement` and bubbles through the testing library's `div` container (where React runs the menu's handlers) to `window`. Focus is placed with `.focus()` after the expansion, because every open request moves focus to the Log tab (`ConsoleDock.tsx:74-78`).

### 3.8 The tier-1 stand-ins (panel A13), and the test-only identifiers

The stage is a mocked sibling in every view-level harness, so no camera control, hit target or canvas exists there. File E's `./SpaceStage` mock renders, inside `space-canvas-region`:

| Stand-in | Element | Stands in for |
| --- | --- | --- |
| camera control | `<button data-testid="mock-camera-control">` | "a camera control" in 2.2: any focusable outside `console-dock-region` exercises the same test (`ConsoleDock.tsx:91`). Its real observer is the journey's `escape-from-camera-control` leg |
| body pick | `<button data-testid="mock-select-feat-star">` calling `props.onSelect({ bodyId: 'feat-star' })` (the precedent is `SystemSpaceView.burn-preview.test.tsx:146-152`) | selecting a body |
| acting-fleet change | `<button data-testid="mock-activate-fleet_2">` calling `props.onActivateFleet('fleet_2')` | making a non-default fleet the acting one, so "the same fleet is acting" can fail |
| the selection | `data-selection` on `space-canvas-region` (`props.selection?.bodyId ?? ''`), the real stage's own attribute (`SpaceStage.tsx:435`) | what is selected |
| the acting fleet | `data-acting-fleet` on `space-canvas-region` (`props.actingFleetId ?? ''`) | which fleet is acting |
| the pick count | a hoisted counter incremented by the two trigger buttons and by a `click`/`pointerdown` handler on `space-canvas-region` itself | "the canvas has received no pick" in 2.6. Reset to 0 after the arrangement's own pick |

**Identifiers minted here, all test-only, none in production code:** `mock-camera-control`, `mock-select-${bodyId}`, `mock-activate-${fleetId}`, and the attribute `data-acting-fleet` on the stage mock's root. `mock-ghost-${recordId}` is the predecessor's and is reused.

**The field and the select (2.2).** One fixture gives both: the acting fleet `attachedTo: 'feat-rock'` and the interior carrying `{ id: 'feat-rock', type: 'rocky', …, resources: [{ kind: 'metals', richness: 0.8 }, { kind: 'water', richness: 0.4 }] }`, with no running mine. `FleetActionsPanel` then renders its mine section (`FleetActionsPanel.tsx:131`, `:346`) with `mine-tons-input` (`type="number"`, the "field holding a typed value") and `mine-kind-select` (the "closed select with a chosen option"). The typed value is set with `fireEvent.change` to `7`; the chosen option with `user.selectOptions(select, 'water')`. Each row starts with a precondition that the element exists and holds that value. No station, board or scan-target fixture is needed.

### 3.9 File E, task by task; and file D (3.1)

| Task | Arrangement | Closes on |
| --- | --- | --- |
| 2.1 | Expanded. Rows: focus on `console-tab-log`; on `console-dock-collapse`; on the refresh control. Escape | region has `hidden` and `document.activeElement` is `console-dock-open` |
| 2.2 | Expanded. Rows: `mock-camera-control`; `vitals-fleet-chevron` with its menu closed; `document.body` (blur the active element); `mine-tons-input` holding `7`; `mine-kind-select` on `water`; interior failed with focus on `document.body` (the stage is not rendered in that state); own-fleets failed with focus on `mock-camera-control`; canvas unavailable with focus on `document.body`. Record `el = document.activeElement` and `el.value`. Escape | the same three checks in every row: region has `hidden`; `document.activeElement === el`; `el.value` equals what it was |
| 2.3 | Expanded. `.focus()` on `vitals-fleet-chevron`; precondition, it is the active element. `fireEvent.click(console-dock-collapse)`: a click event with no `mousedown`, so no focus moves. Not `user.click`, which would focus the collapse control and send focus to "Console" | region has `hidden` and `document.activeElement` is the chevron |
| 2.4 | Two own fleets; click `mock-select-feat-star` and `mock-activate-fleet_2`; clear the shared spies. Rows: Escape expanded (expects collapsed); Escape collapsed (expects collapsed); expand and collapse by `fireEvent.click`; expand and collapse by Enter on the focused controls | `data-selection` is `feat-star`, `data-acting-fleet` is `fleet_2`, the shared `refetch` spy and every `mutate` were not called, and the region's `hidden` is what the row expects |
| 2.5 | Expanded, at least one own fleet. Rows: `user.click` on the chevron (the menu opens and focuses its first entry); the same, then `.focus()` on the chevron with the menu open. One run forward: Escape (checkpoint: `vitals-fleet-menu` gone, focus on the chevron, region not `hidden`); `fireEvent.keyDown(document.activeElement, { key: 'Escape', repeat: true })` | the region is still not `hidden` after the held key. Then the positive control: a second `user.keyboard('{Escape}')` and the region has `hidden` |
| 2.6 | The pile mock for `'all'` has rows and a non-empty `nextCursor`. Click `mock-select-feat-star` and `mock-activate-fleet_2`; reset the pick count. Press, in turn, with `user.click`: `console-dock-open`; the `tablist`; `console-tab-log`; `console-panel-log`; the refresh control; a `sighting-row-*`; `sighting-log-load-more`; and last `console-dock-collapse` | after each press `data-selection` is `feat-star` and `data-acting-fleet` is `fleet_2`; at the end the pick count is 0 |

**File D, task 3.1.** `expectLogNotShown` (`SystemSpaceView.console-dock.test.tsx:247-251`) becomes: the element exists (`getByTestId('sighting-log')`), `closest('[hidden]')` is not null, and it is `not.toBeVisible()`. Its one consumer is `:426`. The header comment at `:22-25` is corrected to say hidden, not "unmounted or hidden". Confirmed by reading and left alone: the two `null`-call counts at `:537` and `:542` and the two `queryByTestId('sighting-log')` nulls beside them are all under `isLoading: true`, which the latch keeps closed; `getAllByTestId('sighting-log')` length 1 at `:434` holds. Nothing else in D is edited unless a red names it, and then it is reported first.

### 3.10 Red reasons, and the control of every green-on-arrival task

"Own reason visible" is when the test fails on the assertion it exists for. A green-on-arrival test is recorded `already-green` in the coverage table, never claimed red; its **control** is what it stands for and the in-test precondition that keeps it from passing vacuously. The mutation named is what would turn it red; running it locally is optional and, if done, is reverted before the manifest is recorded.

| Task | At the red gate | Own reason visible |
| --- | --- | --- |
| 1.1, 1.3, 1.5, 1.7, 1.8 rows 1 and 3, 1.12, 1.13, 1.14 rows 4-5, 1.15 | assertion-red | at the gate: a pile request at the re-expansion on the stale entry (1.1, 1.8); the statement gone (1.3); a read and the loading text at the expansion (1.5); no read without an expansion (1.7, 1.12); a read while the re-read is held, at the expansion (1.13, 1.15); the log shown during the re-read (1.14) |
| 1.8 row 2 | red at "the dock collapsed on Escape" | only after 4.3 and before 4.1: then it is the stale-entry request. This is why 4.3 is built first (§4.2) |
| 1.10, 1.11 | red at the labelled precondition "the log's first read was issued" | only after 4.1 and before 4.2: then it is "the unfiltered pile was not read again". The orchestrator confirms the failing line before 4.2 starts (§4.2 step 4) |
| 2.1, 2.2, 2.4 row 1, 2.5 | assertion-red: the dock is not collapsed | at the gate |
| 3.1 (D `:426`) | red: the log is absent while collapsed | at the gate |

| Green on arrival | It is the control for | Non-vacuity precondition in the test | The build that turns it red |
| --- | --- | --- | --- |
| 1.2 | 1.3: same arrangement, state that lives in the view survives a remount and state that lives in the log does not | the row is highlighted before the collapse | one that clears the highlight on collapse |
| 1.4 | guards 4.1's hiding mechanism | the Tab walk visited `console-dock-open`; after 4.1 at least one `sighting-row-*` exists in the document while collapsed (asserted from 4.1 on by 1.1's rows, not here) | hiding by `visibility`, `opacity` or `inert` alone; content left in the tab order |
| 1.6 | 1.5: the failed state is the log's own | the card was present, and is gone after its retry | one shared retry for the card and the log |
| 1.8 row 4 | the positive side of 1.8: a re-read of the interior is not a pile read | the interior mock's `refetch` was called by the poll | calling the settle callback from `resync`; a live `!isFetching` gate |
| 1.9 | positive control for 1.8: the harness can see a pile request when one is caused | `pileRequests().length` rose across the Refresh click | — |
| 1.12, first half | the gate that already exists | the interior mock was `isLoading: true` at that checkpoint | removing the gate |
| 1.14 rows 1a, 1b | the no-read-in-flight sentence; **1b is r3-m1's observer** | `console-dock-region` is not `hidden` when the panel is read | a latch on `data != null \|\| isError` (1b); a latch opened by an effect that shows one waiting commit (1a, 1b) |
| 1.14 rows 2, 3 | re-assert the live cold scenarios under the latch | the waiting indication was seen before the answer | dropping the `!isLoading` term |
| 2.3 | guards 4.3 against a second collapse path | the chevron held focus before the click | focusing "Console" on every collapse |
| 2.4 rows 2-4 | row 1's controls | the selection and the acting fleet were set to non-default values first | Escape clearing the selection (link 4's second-press rule built early) |
| 2.6 | nothing at tier 1: the stage is a mocked sibling and cannot receive the press. Recorded `already-green` with its scenario `Playwright, deferred` | the pick count was 1 after the arrangement's own pick and before the reset | at tier 1 only a build that nests the dock inside the canvas region; the real observer is the journey's `press-on-dock-not-a-pick` leg |

## 4. Sequencing

### 4.1 The red gate: what exists before DEV starts

1. Files L and E written; files M and D edited as §3.5 and §3.9 say. Types and lint clean on the four.
2. The SDET has run those four files (tier 1 only, per `docs/testing-tiers.md`; no Playwright in the red phase) and every test is in the state §1 and §3.10 give it, each red read at its failing assertion line. Every pre-existing test in M and D other than D's `:426` consumer is still green.
3. `docs/handoffs/keep-console-tab-content-mounted-red-coverage.md`: all 39 scenarios, each to its test, level and status. The `Playwright, deferred` rows are in §4.4.
4. `docs/handoffs/red-manifest-keep-console-tab-content-mounted.txt`, recorded with `harness/openspec-red-manifest.sh record` over the four tier-1 files. The e2e files are outside it.
5. The SDET's boxes 1.1-1.15, 2.1-2.6 and 3.1 are ticked.

### 4.2 Build order

4.3 goes first. It touches the shell only, depends on nothing, and it is the only way 1.8's Escape row can be seen red for its own reason before 4.1 turns it green.

| Step | Who | What | Turns green | Still red, by design |
| --- | --- | --- | --- | --- |
| 1 | DEV | **4.3**, the shell (§2.4) | 2.1, 2.2, 2.4 row 1, 2.5; 2.3, 2.4 rows 2-4 and 2.6 stay green | 1.8 row 2, now on the stale-entry request |
| 2 | DEV | **4.1**, the view (§2.2, §2.5) | 1.1, 1.3, 1.5, 1.7, 1.8 (all rows), 1.12, 1.13, 1.14, 1.15, 3.1; the controls stay green | 1.10, 1.11, now on "not read again" |
| 3 | ORCH | **3.2**: run the two families, attribute every red before anything is edited. The expected reds are exactly 1.10 and 1.11. Any other red, and any edit a red seems to ask for, is a finding. The predicted risk is a `Profiler`-measured commit in `SystemSpaceView.render-loop.test.tsx` from the log's unmocked read settling in a measured window | — | — |
| 4 | ORCH | confirm from step 3's output that 1.10 and 1.11 fail on the "read again" assertion and not on their precondition, and record it in the red-coverage file | — | — |
| 5 | DEV | **4.2**, the view (§2.3) | 1.10, 1.11; `scan-refetch` and `scan-targets-refetch-on-arrival` stay green unedited | nothing |
| 6 | SDET | **3.3-3.6**, against the built UI, not run (§6.2) | — | — |
| 7 | ORCH | **5.1** | — | — |
| 8 | SDET | **5.2** (§5) | — | — |
| 9 | QA, ORCH | **5.3**, then **5.4-5.10** | — | — |

A DEV box is ticked when the tests tasks.md names for it are green and untouched, types and lint are clean, and the manifest verifies. 4.1's box names 1.8: with 4.3 already built, every row of 1.8 is green at step 2.

DEV's per-task check is tier 1 for the files touched plus types. The whole suite is the per-commit gate (5.1), after every box in sections 1-4 is ticked.

### 4.3 What section 3's re-arrangements depend on

| Task | Depends on | Why |
| --- | --- | --- |
| 3.1 | nothing; red phase | the tightened helper is red until 4.1, which is its red |
| 3.2 | 4.1 landed, 4.2 not yet | the clean attribution point: two expected reds and nothing else |
| 3.3 | 4.1 | the log reads at view open only once 4.1 is built |
| 3.4 | 4.1 and 4.2 | the row at `:143` is listed only if the settle re-read ran |
| 3.5, 3.6 | 4.1 | header notes about a state that exists only after it |
| 5.2 | every box in sections 1-4 | one journey, written against a UI that exists |

### 4.4 Deferred to the journey

`Playwright, deferred` in the coverage table, `BLOCKED` in QA's matrix until tier 4 runs:

- *A pointer press on any part of the dock leaves the selection unchanged* (2.6 cannot fail at tier 1): leg `press-on-dock-not-a-pick`.

Covered at tier 1 and confirmed, not carried, by the journey:

- the `window` listener's ordering against the fleet menu in production, where the React root is `document` (2.5 proves the mechanism): leg `menu-open-escape`;
- a real camera control as the focus holder (2.2 uses the stand-in): leg `escape-from-camera-control`;
- the app stylesheet not defeating the `hidden` attribute on the log's content (design.md D-2): asserted inside leg `escape-same-node`;
- the same DOM node across a collapse, which no request count can show inside the 60 s stale time: leg `escape-same-node`;
- the settle re-read on the wire: leg `settle-reread-collapsed`.

Not asserted at any tier, by ruling: the panel's scroll offset across a collapse (RULING 8); Escape with a native select's popup open or with focus in a toast (RULING 6); Escape with the fleet menu open and focus elsewhere (RULING 7).

### 4.5 r3-m1's second half (binding on the orchestrator at task 5.10)

The paused-read gap record written at 5.10 carries, after its sentence about the empty state, this sentence:

> On reconnect the paused interior first load and the paused first pile read are sent together, so with a past-ETA unsettled sweep the pile read is not ordered after the settling read (`sighting-log` *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer*, which this change does not relax). Pre-existing under the `!interior.isLoading` gate for the ghost feed and a hand-opened log; newly reachable at view open.

No test is owed for it. The record also names §3.6 row 1b as the only observer of the offline clause.

## 5. The journey (task 5.2)

`e2e/tests/keep-console-tab-content-mounted-journey.spec.ts`. Written by the SDET after every box in sections 1-4 is ticked; not run by its author; one run at the gate, by the orchestrator, with the tree locked.

### 5.1 Shape, carried from `console-dock-journey.spec.ts`

- `test.use` viewport 1280x720; one corporation provisioned in `test.beforeAll` (`wakeNewCorp`); serial tests over the shared page.
- No `test.setTimeout`. The 60 s per-test budget (`playwright.config.ts:87`) is not raised. Each test prints its `[journey-budget]` line.
- Legs record `PASSED`, `UNTESTED` or `FAILED` and print `[journey-leg] <name>: <outcome>`; a closing test fails the run on any `FAILED` and on any must-PASS leg that is not `PASSED`. The names below are stable so QA can name closing lines at 5.3.
- The `[journey-console]` capture with the hard `afterEach` assertion on `/maximum update depth|nested update/i`; `nextjs-portal { display: none !important }` by `context.addInitScript`; the `[journey-http]` capture of every 4xx and 5xx `/v1/` response (the forced 500s of leg `failed-while-collapsed` appear there and are expected).
- A wire capture, installed in `beforeAll`, of every `GET /v1/sightings` request with no `systemId` (time and ordinal), every `GET /v1/systems/<home>` response, and every `GET /v1/actions` response for the journey's fleet with its body.

### 5.2 Fixtures

- **51 records** seeded with `seedSightingFixture` (`e2e/helpers/scan-fixtures.ts:126`) under a `systemId` that is not the home system, with distinct `actionId` and `targetId`, and with `asOf` values far below the live world time (for instance `1_000 + i`). The server pages at 50 (`backend/sightings/model.go:26`) and orders by `asOf` descending (`backend/sightings/dao.go:84`), so a second page exists, the ghost layer draws none of them, and the settled sweep's record later sorts first on page one.
- **One optional record** in the home system at a non-origin position, as `scan-journey.spec.ts:313-329` seeds one, for the highlight leg only.
- Seeded in `beforeAll` after the wake, then `page.reload()`. The seed's wall time is printed (`[journey-budget] seed: <ms>`): it has never been measured at this size (§8).
- The log is tagged by a JavaScript property set through `evaluate`, `__journeyLogNode`, on the `sighting-log` element. A property, not an attribute, so React cannot reproduce it on a new node.

### 5.3 Legs, in order

| # | Leg | Class | Asserts | Logged, never asserted |
| --- | --- | --- | --- | --- |
| 1 | `expand-load-more` | must-PASS | after the reload the dock is collapsed and exactly one unfiltered request has been seen; expand by `console-dock-open`; 50 rows; click `sighting-log-load-more`; 51 rows; tag the node | the unfiltered request count |
| 2 | `escape-same-node` | must-PASS | click a seeded row: the no-mark statement is shown in it. With focus in the dock press Escape: region hidden, focus on `console-dock-open`, `sighting-log` attached and hidden (count 1, `toBeHidden`). Expand by `console-dock-open`: the element carries `__journeyLogNode`, 51 rows, the statement still in the same row, and no unfiltered request between the Escape and the end of the leg | the request count |
| 3 | `scroll-offset` | observation only | — | `console-panel-log`'s `scrollTop` before the collapse and after the re-expansion (RULING 8) |
| 4 | `highlight-survives` | may be UNTESTED | if `sighting-mark-<id>` for the home-system record is drawn: activate its row, collapse, expand, the row has `data-highlighted="true"` | UNTESTED naming `defect-seeded-sighting-ghost-not-drawn.md` when no ghost is drawn; tier-1 cover is 1.2 |
| 5 | `menu-open-escape` | must-PASS | expanded; open the fleet cell's menu; Escape: menu gone, focus on `vitals-fleet-chevron`, dock still expanded; second Escape: dock collapsed | — |
| 6 | `press-on-dock-not-a-pick` | must-PASS | select a body (`selectFirstBodyMatching`); read `data-selection` on `space-canvas-region`; press `console-dock-open`: unchanged; press the tab bar's empty area and the panel's empty area: unchanged after each | the press coordinates |
| 7 | `escape-from-camera-control` | must-PASS | expanded; focus a real control inside `space-camera-controls`; Escape: dock collapsed and that control still focused | — |
| 8 | `failed-while-collapsed` | must-PASS | `page.route` with a URL predicate that fails **only** the unfiltered read (path ends `/v1/sightings` and `searchParams.get('systemId') === null`, the mirror of `console-dock-journey.spec.ts:439-442`); reload; collapsed; expand: `sighting-log-error` with its `Retry` inside the panel, no `sighting-log-empty`, no `Reading the pile…`. Then `page.unroute` and reload | — |
| 9 | `settle-reread-collapsed` | may be UNTESTED by draw, asserted when reached | §5.4 | which settle exit fired; the target's `durationMs` |
| 10 | `warm-return` | may be UNTESTED | leave by `nav-home` and return by the roster row and `enter-system-button` (never `page.goto`). Only if an interior request was issued on the return: no unfiltered request preceded its response | whether an interior request was issued at all (none is expected inside the 60 s stale time). UNTESTED otherwise; tier-1 cover is 1.13, 1.14 and 1.15. No wait is added to age the entry |
| 11 | `select-popup-escape`, `toast-escape` | observation only | — | what Escape did (RULING 6) |
| 12 | `other-system` | UNTESTED by design | — | no player path for a one-hull corporation |

`MUST_PASS`: legs 1, 2, 5, 6, 7, 8. `MAY_BE_UNTESTED`: legs 4, 9, 10, 12. Legs 3 and 11 have no outcome to fail.

### 5.4 Leg 9, `settle-reread-collapsed`

In its own test, so it has its own 60 s.

1. Dock at the home station as `scan-journey.spec.ts:72-76` does (`selectFirstBodyMatching` on the served station id, `burnToSelectionAndDock`). No station feature, or not docked within 15 s: UNTESTED, naming the random-spawn family (`defect-space-journey-instant-station-burn.md`, `defect-scan-journey-spawn-in-gate-range.md`).
2. The dock is collapsed and stays collapsed. Pick the nearest served target; its wall wait is `durationMs / 5 + 3 000 ms`. Over 25 000 ms, no target, a commit refused, or no report in that time: UNTESTED with the reason, never a raised timeout.
3. Commit; wait for `scan-report`.
4. **Decide and log the exit before asserting any order.** Early-settle exit: the first `GET /v1/actions` running-status response for the fleet after the commit's POST carried no running scan. Otherwise the ETA exit.
5. Assert, before any expansion: an unfiltered `GET /v1/sightings` request was issued **after** the settling `GET /v1/systems/<home>` response (ETA exit), or after that running-status response (early-settle exit).
6. Expand by `console-dock-open`, not by the report's link. The first row names the swept host and carries the clean-sweep marker; no unfiltered request was caused by the expansion.

### 5.5 Sizing, from `docs/handoffs/add-console-dock-journey.md` (run 2)

- The predecessor's seven-test file took 18.6 s, its longest test 5.0 s. `scan-journey.spec.ts:42`, which docks at the station and runs a clean sweep, took 22.1 s whole. A home-system flight is 3.8 to 4.4 s of wall time at world scale 5.
- Budget per test: legs 1-4 under 10 s; legs 5-7 under 10 s; leg 8 under 10 s (a 500 is not retried, so the failed state arrives in one round trip, and the predecessor's reload test took 2.8 s); leg 9 at most 45 s of its 60 (15 s to dock, 25 s for the sweep, 5 s for the expansion); legs 10-12 under 10 s.
- The file should add 45 to 60 s to tier 4, which last ran 509 s and 528 s. Tier 3 last ran 1554 s and this change adds no backend test. An overrun is reported in the journey record's budget line, not absorbed.

## 6. Who ticks which box, and the e2e migrations

### 6.1 Boxes

Each role ticks its own boxes and no one else's.

| Section of tasks.md | Ticked by | When |
| --- | --- | --- |
| 1 (1.1-1.15) | SDET | at the red handoff, once the test is written and its state recorded as §3.10 gives it |
| 2 (2.1-2.6) | SDET | the same |
| 3 | SDET ticks 3.1 at the red handoff and 3.3-3.6 when each edit is written; ORCH ticks 3.2 after the family run is attributed |
| 4 (4.1-4.3) | DEV | when the tests the box names are green and untouched |
| 5 | SDET ticks 5.2 after the gate run's leg table is written to the journey record; QA ticks 5.3; ORCH ticks 5.1 and 5.4-5.10 |

### 6.2 The e2e migrations of section 3, line numbers re-verified at `9648346`

None is run before the archive gate. The edits are to preconditions and comments. A migration that proves unnecessary is closed with one line saying what was read.

| Task | File | Lines now | Edit |
| --- | --- | --- | --- |
| 3.3 | `e2e/tests/scan-lane-transit-fizzle.spec.ts` | comment `:293-298`, open `:299`, visible `:300`, rows `:301-302`; the hard navigation that gives the cold cache is `:276` | after `:300`: click the refresh control, wait for the unfiltered `/v1/sightings` response, and only then `toHaveCount(0)`. Rewrite `:296-298`, whose "the log still reads when shown" is now false: the log read at view open, possibly before the sweep settled |
| 3.4 | `e2e/tests/scan-journey.spec.ts` step 5 | comment `:119-127` (the false sentence is `:124-127`), `toBeHidden` `:132`, link click `:133`, rows `:142-149`, collapse comment `:151-162` ("log unmounted" at `:159`), collapse `:163`, `toBeHidden` `:164` | rewrite `:124-127`: the log is mounted and has read since view open, and the row at `:143` is listed only because the settle re-read ran. `:159` "unmounted" becomes "hidden". Assertions at `:132` and `:141-149` unchanged. Optional: assert the link's click caused no unfiltered request |
| 3.5 | `e2e/tests/vitals-strip-journey.spec.ts` | header paragraph `:55-64`; the route `:463-465` | add to the header that the `**/v1/sightings**` glob now fails the log's read as well, and that a hidden failed log with its own `Retry` in the DOM is expected. No assertion changes: the leg's are scoped to `sightings-unavailable` (`:471-478`) |
| 3.6 | `e2e/tests/console-dock-journey.spec.ts` | header `:20-44`; the predicate `:437-442`; leg 13 `:808-880` (its logged-not-asserted line at `:860`) | add a header note: the fixture still holds (the reload gives a cold cache and the predicate spares the unfiltered read); its Tab walks skip a hidden log; leg 13's deferred assertion belongs to this change's journey and is not upgraded in place |

Analysis § 7's remaining rows need no edit and were not re-opened: `scan-journey.spec.ts` mount path and cross-highlight test, `burn-cost-overlay-journey.spec.ts`, `e2e/helpers/scan-fixtures.ts`.

## 7. Where this contract goes beyond design.md and tasks.md (for adjudication; no change-folder edit)

1. **4.3 is built before 4.1** (§4.2). design.md and the panel's work order put 4.1 first. Reason: 1.8's Escape row.
2. **1.10 and 1.11 carry a labelled precondition** and are judged red for their own reason between 4.1 and 4.2, with the orchestrator confirming the failing line (§3.10, §4.2 step 4). tasks.md says only "seen red … before 4.2 is written".
3. **File L runs `use-scan` and `use-actions` for real** over mocked services, beyond the real `useSightings` tasks.md names, because 1.11 is "arranged as" a file that does, and one file cannot mock a module for some tests only. 1.10's watcher is then driven by a real `useRunningScan` too.
4. **1.14 is read with the dock expanded immediately after the mount** (§3.6). Its box says both "present from the first render" and "green on arrival"; under today's build a collapsed dock holds no log, so the two agree only when the panel is read expanded. Presence while collapsed is 1.7's and 1.15's.
5. **1.8's rows begin with a warm-up expansion** so that the GIVEN "the first read has been answered" holds under today's build.
6. **The names** `logLatched`, `rereadPilesAfterSettle`, `interiorMode`, `pileRequests`, `settleFirstRead`, `__journeyLogNode`, and the test-only stage-mock identifiers of §3.8. None is asserted by a test except the stage-mock testids and `data-acting-fleet`.
7. **`handleCollapse` as a `useCallback`** with the listener effect depending on it (§2.4). design.md D-6 allows a ref or a dependency; this picks the dependency.
8. **Security S2 is not bound.** The dispositions accept an unmount row only as a parameter of an existing section-2 arrangement. None fits: 2.4 closes on the selection and the acting fleet, which do not exist after an unmount. The listener's removal rests on the effect's cleanup (§2.4) and is QA's to mark INSPECTED.

## 8. Risks, and what is not settled

1. **Seeding 51 records has no measured time.** The predecessor seeded three. The seed is printed; if it threatens `beforeAll`'s 60 s the SDET reports it and does not raise a timeout. Parallel PATCHes are permitted.
2. **Leg 9 depends on the random spawn** twice: a station to dock at, and a sweep that fits 25 s. It was UNTESTED in both of the predecessor's runs without the docking step; with it, `scan-journey` has passed. If it is UNTESTED at the gate, the settle re-read's tier-4 evidence is `scan-journey.spec.ts:143` (3.4) and its tier-1 cover is 1.10 and 1.11.
3. **Real React Query under fake timers** (1.8 row 4, 1.10) follows `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:377`, which does it today. If the log's read does not flush under `advanceTimersByTimeAsync(0)`, the SDET reports it before changing the arrangement.
4. **The 58 unmocked tests** gain a second real sightings read that fails at the transport. The ghost feed's read already does. Task 3.2 attributes any red; `render-loop` is the one predicted risk.
5. **The latch's first render over a warm cache** is held by 1.15 alone and unobserved at tier 4 unless leg 10 sees an interior request.
6. **Whether a `display: none` panel keeps its scroll offset in Chromium** is logged by leg 3 and decided nowhere.

## 9. Spec conflicts

None found. Every scenario is buildable and decidable as written with the shape above. Two wording residues are in tasks.md, not in the delta, and are settled here without an edit: 1.14's first row (§7 item 4) and r3-m1 (§3.6 row 1b, §4.5).

STATUS: COMPLETE

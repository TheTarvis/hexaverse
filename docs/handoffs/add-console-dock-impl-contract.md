# add-console-dock — implementation contract (kickoff, Phase 2 step 7)

Architect, 2026-10-05. Change: `openspec/changes/add-console-dock/` (5 ADDED + 1 MODIFIED, 49 scenarios, 40 tasks), adversary-cleared at round 3, verdict commit `b52d412`. Nothing under the change folder was edited to write this. Line numbers are the tree's at `987db9a`.

Frontend only. No Go, no API contract, no wire change, no new read. The one cross-file source of truth is `frontend/lib/console-dock-layout.ts` (§2).

Readers: the SDET first (§1-§6, §9), the developer second (§1-§4, §7, §8). Where this file pins something design.md leaves open, §11 lists it for adjudication.

## 0. The seam, in one paragraph

A new controlled shell, `ConsoleDock`, replaces the bare wrapper that holds `VitalsStrip` at the foot of `SystemSpaceView` (`SystemSpaceView.tsx:1070-1086`). The view owns `{ expanded, openSeq }` (replacing `logOpen`), hands the dock the strip element and one tab descriptor, and decides what the Log tab's content is: nothing while collapsed, a waiting placeholder while expanded and the interior's first load is in flight, `SightingLog` otherwise. The dock publishes one CSS custom property on the document root; four occupants swap a literal `bottom-[4.5rem]` for a lane class from one module. The floating log panel, its toggle and `logOpen` are deleted. Nothing about when the log reads changes.

## 1. `frontend/components/space/ConsoleDock.tsx` (new; tasks 4.1, 4.3)

### 1.1 Exports and props

```ts
export type ConsoleTabId = 'log'

export interface ConsoleDockTab {
  id: ConsoleTabId
  /** The tab's visible label and accessible name. The view passes the literal 'Log'. */
  label: string
  /** Rendered inside the tab's panel exactly as given, in both states. May be null. */
  content: ReactNode
}

export interface ConsoleDockProps {
  expanded: boolean
  /** Incremented by the owner on every open request, including one made while already expanded. */
  openSeq: number
  onOpen: (tab: ConsoleTabId) => void
  onCollapse: () => void
  /** The vitals strip element. Rendered first, unwrapped in any interactive element. */
  strip: ReactNode
  /** Exactly one entry in this change. tabs[0] is the selected tab; selection is not state. */
  tabs: readonly ConsoleDockTab[]
}

export function ConsoleDock(props: ConsoleDockProps): JSX.Element
export function ConsolePanelWaiting(): JSX.Element
```

`'use client'`. No hook that reads, no service, no `apiClient`, no `useQueryClient`. No `<Activity>`. No inline `display` with `!important`, no `hidden="until-found"`. No `keydown` listener of any kind (Escape is `keep-console-tab-content-mounted`'s). Raw `<button>` elements, as `VitalsStripFleetCell` uses (a Catalyst `Button` cannot carry `role="tab"`).

**The shell never conditionally renders on `expanded`.** It renders `tabs[0].content` inside the panel in both states; what is hidden is hidden by the `hidden` attribute. Whether the log is mounted is the view's decision (§3.3), so the next link changes one expression in the view and nothing here.

### 1.2 DOM, in order (design.md D-17, D-19)

```
div  data-testid="console-dock"                                   (root)
├─ {strip}
├─ button  data-testid="console-dock-open"   hidden={expanded}    name "Console"
└─ div     data-testid="console-dock-region" hidden={!expanded}   id=<regionId>
   ├─ div                                                          (tab bar row)
   │  ├─ div  role="tablist"  aria-label="Console tabs"
   │  │  └─ button  role="tab"  data-testid="console-tab-log"  id=<tabId>
   │  └─ button  data-testid="console-dock-collapse"              name "Collapse console"
   └─ div  role="tabpanel"  data-testid="console-panel-log"  id=<panelId>
      └─ {tabs[0].content}
```

- The collapse control is the tab list's **sibling, never its child**, and precedes the panel in the DOM. A collapse control placed after the panel fails 1.4.
- No element takes a positive `tabindex`. The panel takes no `tabindex`.
- Testids are `console-tab-${id}` and `console-panel-${id}`; with one tab they are `console-tab-log` and `console-panel-log`.
- Ids (`regionId`, `tabId`, `panelId`) are not pinned; `useId()` is fine. Tests resolve `aria-controls` / `aria-labelledby` by `document.getElementById`, never by a literal id.
- No dock element carries `role="status"`, `role="alert"`, `role="log"` or `aria-live`.

### 1.3 Attributes and names (every one is asserted at tier 1)

| Element | Attributes |
| --- | --- |
| `console-dock-open` | `type="button"`; `aria-expanded="false"` always; `aria-controls=<regionId>`; accessible name exactly `Console` (visible text `Console`; any icon is `aria-hidden="true"`); `hidden` while expanded; `onClick` calls `onOpen(tabs[0].id)` |
| `console-dock-collapse` | `type="button"`; `aria-expanded="true"` always; `aria-controls=<regionId>`; `aria-label="Collapse console"` (icon-only; icon `aria-hidden`) |
| `console-dock-region` | `hidden` while collapsed; its class list contains `flex` (so the journey's `[hidden]`-beats-`flex` line proves something) |
| tab bar's inner list | `role="tablist"` |
| `console-tab-log` | `type="button"`; `role="tab"`; `aria-selected="true"`; `aria-controls=<panelId>`; text content is exactly `tabs[0].label`, nothing appended (no count, no badge, no digit) |
| `console-panel-log` | `role="tabpanel"`; `aria-labelledby=<tabId>`; it is the scroll container (`overflow-y-auto`) |

Class tokens the three controls (`console-dock-open`, `console-tab-log`, `console-dock-collapse`) each carry, asserted by `toHaveClass` in 1.3: `focus-visible:outline-2`, `min-h-6`, `min-w-6`. The rest of the focus treatment follows the file's neighbours (`focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400`).

Native `<button>` gives Enter and Space activation for the two disclosure controls; no key handler is written. Enter or Space on the Log tab has no effect in this change (one tab; adversary r1 m3).

### 1.4 What it renders in each state

| | Collapsed (`expanded === false`) | Expanded |
| --- | --- | --- |
| strip | shown | shown, unchanged |
| `console-dock-open` | shown | in the DOM, `hidden` |
| `console-dock-region` (tab bar, collapse control, panel) | in the DOM, `hidden` | shown |
| panel content | whatever `content` is (the view passes `null`) | whatever `content` is |
| root height | the strip's own 56 px | `CONSOLE_DOCK_HEIGHT_EXPANDED` (220 px) |

"Not shown" therefore never means "absent from the DOM" for the dock's own elements. Tests assert the `hidden` attribute (or `not.toBeVisible()`, which jsdom's own `[hidden] { display: none }` makes true), never `queryByTestId(...)` being null, for `console-dock-open`, `console-dock-region`, `console-tab-log`, `console-dock-collapse` and `console-panel-log`.

### 1.5 Layout (measured only by the journey; recommended, not asserted at tier 1)

Root: `pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col` (the classes of the wrapper it replaces, plus the column), with `style={{ height: CONSOLE_DOCK_HEIGHT_EXPANDED }}` only while expanded, the value imported from §2 and never a second literal. `console-dock-open`: positioned from the root, `right-4`, 8 px above the strip's top edge (`bottom-[calc(100%+0.5rem)]` gives the canvas's `bottom: 64px` while collapsed), 24 to 28 px tall. Region: `flex min-h-0 flex-1 flex-col`. Tab bar row: `h-9 shrink-0`, the tab list at the left, the collapse control at the right end (`Main.dc.html`). Panel: `min-h-0 flex-1 overflow-y-auto`. That is 56 + 36 + 128 = 220.

Fill, border and text reuse the strip's own classes (`border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-white/[0.12] dark:bg-zinc-700/95`, `text-zinc-600 dark:text-zinc-400`). No palette, type-scale or panel-fill change is in scope.

### 1.6 The height property (design.md D-3)

The dock, not the view, publishes it: a `useLayoutEffect` keyed on `expanded` calls `document.documentElement.style.setProperty(CONSOLE_DOCK_HEIGHT_VAR, expanded ? CONSOLE_DOCK_HEIGHT_EXPANDED : CONSOLE_DOCK_HEIGHT_COLLAPSED)` and its cleanup calls `removeProperty(CONSOLE_DOCK_HEIGHT_VAR)`. So the property is `3.5rem` collapsed, `13.75rem` expanded and absent whenever no dock is mounted. No prop, context or route check reaches any occupant.

### 1.7 Focus (task 4.3; RULING 18 as amended by adversary r1 M1)

Built in 4.3, not 4.1.

- **Every open request moves focus to the selected tab.** An effect keyed on `openSeq` focuses `console-tab-log` whenever `openSeq` differs from the value last seen (a ref initialised to the mount value, so nothing is focused at mount and Strict Mode's double effect is harmless). It runs after the commit that un-hides the region. It fires for the "Console" control and for the report's link alike, and when the dock was already expanded.
- **A collapse with focus in the tab bar or the panel moves focus to the "Console" control.** The collapse control's click handler decides *before* calling `onCollapse()` whether `regionRef.current.contains(document.activeElement)` and stores that in a ref; an effect on `expanded` becoming false focuses `console-dock-open` if the ref is set, then clears it. Deciding after the commit is unreliable (jsdom never blurs a hidden element; browsers do so asynchronously).
- **Nothing else.** The clause "focus anywhere else is not moved by a collapse" and its scenarios are `keep-console-tab-content-mounted`'s. This build happens to leave such focus alone; no test here asserts it and none may be added.
- A focus move goes through `.focus()` only. No announcer text is written, so no live region changes (2.5).

### 1.8 `ConsolePanelWaiting`

`<p data-testid="console-panel-waiting">` with neutral copy (suggested: `Waiting for the system read…`). It must not contain `Reading the pile` (the log's own loading text) and is not a live region. Exported from `ConsoleDock.tsx` because it is the dock's, not the log's (design.md D-21). Tests bind to the testid and to the negative on the log's text, not to the suggested copy.

## 2. `frontend/lib/console-dock-layout.ts` (new; created whole in task 4.1)

```ts
export const CONSOLE_DOCK_HEIGHT_VAR = '--console-dock-height'
export const CONSOLE_DOCK_HEIGHT_COLLAPSED = '3.5rem'
export const CONSOLE_DOCK_HEIGHT_EXPANDED = '13.75rem'

/** FloatingNav and the sightings-unavailable card: 72 px collapsed, 236 px expanded. */
export const CONSOLE_DOCK_LANE_LEFT_CENTER = 'bottom-[calc(var(--console-dock-height,3.5rem)+1rem)]'
/** The camera cluster: 100 px collapsed, 264 px expanded. */
export const CONSOLE_DOCK_LANE_CAMERA = 'bottom-[calc(var(--console-dock-height,3.5rem)+2.75rem)]'
/** The right-hand command column's foot: 140 px collapsed, 304 px expanded. */
export const CONSOLE_DOCK_LANE_COLUMN = 'bottom-[calc(var(--console-dock-height,3.5rem)+5.25rem)]'
```

- Six named exports, these names, these values. No default export, no helper, no React.
- Each lane value is one **complete string literal in the source text** (not a template, not a concatenation), so Tailwind's scanner sees it. 2.12 asserts both the imported value and that the literal appears verbatim in the module's source.
- The file is created in full by 4.1 because the dock publishes from it. 4.5 applies the lanes to the occupants.

## 3. `SystemSpaceView.tsx` wiring (tasks 4.2, 4.4, 4.5)

### 3.1 State and the one entry point (design.md D-4)

Replaces `const [logOpen, setLogOpen] = useState(false)` (`:295`):

```ts
const [dock, setDock] = useState<{ expanded: boolean; openSeq: number }>({ expanded: false, openSeq: 0 })
const openDockOn = useCallback((_tab: ConsoleTabId) => {
  setDock((d) => ({ expanded: true, openSeq: d.openSeq + 1 }))
}, [])
const collapseDock = useCallback(() => setDock((d) => ({ ...d, expanded: false })), [])
const openLog = useCallback(() => openDockOn('log'), [openDockOn])
```

- `openDockOn` is the only thing that sets `expanded` true. It is open-only by construction and cannot toggle. Collapsing leaves `openSeq` alone.
- Nothing is written to storage or the URL. No effect resets the state on a `systemId` change: "collapsed on every mount" is `useState`'s initial value, and a cross-system navigation remounts the view because Next 15.5.25 keys the segment by its dynamic param (`layout-router.js:399-411`; `next.config.ts` sets no `routerBFCache`). Tests model that with a `key` (§5.1).
- `ScanControl`'s prop becomes `onOpenLog={openLog}` (`:990`). `ScanControl.tsx` is not edited; the report's link keeps its text `Open the sighting log` and has no testid.

### 3.2 The dock element

Replaces the strip wrapper at `:1065-1086`. It stays the **last child** of `space-view` (after the canvas layer and the column).

```tsx
<ConsoleDock
  expanded={dock.expanded}
  openSeq={dock.openSeq}
  onOpen={openDockOn}
  onCollapse={collapseDock}
  strip={<VitalsStrip … every prop exactly as at :1071-1085 … />}
  tabs={[{ id: 'log', label: 'Log', content: logTabContent }]}
/>
```

`VitalsStrip.tsx`, `VitalsStripFleetCell.tsx` and `VitalsStripPill.tsx` are not edited.

### 3.3 The mount-on-show gate and the waiting indication

```tsx
const logTabContent = !dock.expanded ? null : interior.isLoading ? (
  <ConsolePanelWaiting />
) : (
  <SightingLog
    systemId={systemId}
    highlightedGhostId={highlightedGhostId}
    onHighlightRow={setHighlightedGhostId}
    galaxySystemNames={systemNames}
    drawnRecordIds={drawnSightingRecordIds}
    scale={servedScale}
  />
)
```

- The log mounts exactly when `dock.expanded && !interior.isLoading`, which is `logOpen && !interior.isLoading` (`:910`) with the state renamed. `SightingLog`'s props are the six it has today, unchanged.
- Expanded with the interior's first load in flight: `console-panel-waiting`, and no `useSightings(null)` call. A failed interior read has `isLoading === false`, so the log mounts and the placeholder cannot persist.
- Collapsed: `null`. Neither the log nor the placeholder is in the DOM. This contract states nothing about what a collapse does to the log's loaded state beyond "this build unmounts it, as closing the floating panel does today"; no test may assert it either way (§5.1).
- The ghost feed's own gate (`:816`) is untouched.

### 3.4 Deleted (task 4.4, landed with 4.2)

- `:295` the `logOpen` state.
- `:910-922` the floating panel (`logOpen && !interior.isLoading && (<div className="absolute right-[calc(18rem+2rem)] top-4 z-20">…`).
- `:996-1003` the `sighting-log-open` button with both of its labels.
- No flag, no shim, no leftover import, no dead comment naming the toggle. `SightingLog` stays imported (it is now rendered in §3.3). The section comment at `:280-281` ("the log drawer") and the strip comment at `:1065-1069` are rewritten to describe the dock.

### 3.5 Lanes and the column testid (task 4.5)

| Site | Change |
| --- | --- |
| `SystemSpaceView.tsx:896` sightings-unavailable card | `bottom-[4.5rem]` → `${CONSOLE_DOCK_LANE_LEFT_CENTER}` in the `className`; nothing else on the element |
| `SystemSpaceView.tsx:932` command column | `bottom-[4.5rem]` → `${CONSOLE_DOCK_LANE_COLUMN}`; add `data-testid="space-command-column"`; nothing else |
| `SpaceStage.tsx:716` camera cluster | `bottom-[4.5rem]` → `${CONSOLE_DOCK_LANE_CAMERA}`. The `className` of the element carrying `data-testid="space-camera-controls"` must name the imported identifier `CONSOLE_DOCK_LANE_CAMERA` **directly in its `className` expression** (a template literal or concatenation on that attribute). No import alias, no local variable, no `clsx` helper holding it elsewhere: 2.12 reads that opening tag's source |
| `floating-nav.tsx:33` | `bottom-[4.5rem]` → `${CONSOLE_DOCK_LANE_LEFT_CENTER}`; import from `@/lib/console-dock-layout` |
| `floating-nav.tsx:9-15` header comment | **rewritten** so the text `bottom-[4.5rem]` no longer appears (RULING 22, r3-m2: 2.12's no-literal assertion reads RAW source text, comments included). Say instead that the nav follows the dock's published height through the left-and-centre lane and falls back to 4.5rem where no dock is mounted |

After 4.5 the string `bottom-[4.5rem]` appears nowhere in those three files, in code or comment. The prose comments beside the other three sites (`SystemSpaceView.tsx:893-895`, `:925-931`, `SpaceStage.tsx:708-709`) do not contain the literal today; update their wording where it has gone stale, inside the same hunk. No occupant gains a prop, a context read or a route check. `FloatingNav` on the galaxy route resolves to the fallback, 4.5rem, with no code path of its own.

## 4. `SightingLog.tsx` — chrome only (task 4.2, design.md D-12)

One line changes: the `className` at `:156`. Remove `max-h-[70vh] w-80 max-w-[90vw] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50/95 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]` and keep `flex flex-col gap-2` with a padding small enough that the title row and one three-line row fit the 128 px panel at its scroll origin (`p-2` suggested; the journey measures it). The panel is the scroll container, so the log has no overflow rule of its own.

Not changed: `data-testid="sighting-log"`, every inner testid, every prop, the `useSightings(null)` call, the three states, the refresh control (`aria-label="Refresh sighting log"`), load-more, the row. No `shown` prop, no `scrollIntoView` (design.md D-20 is the next link's). `SightingLog.test.tsx` and `SightingLog.drawn-record-membership.test.tsx` assert no class and stay green.

## 5. Tests the SDET writes red (sections 1-3 of tasks.md)

### 5.1 Rules common to every file

- **Not shown is an attribute, not an absence**, for the dock's own elements (§1.4).
- **The log's absence while collapsed is asserted with a predicate that holds whether it is unmounted or hidden**: `el === null || el.closest('[hidden]') !== null`. Section 2 of tasks.md forbids asserting what a collapse does to the log's content, and the next link keeps it mounted.
- **A remount under another `systemId` uses a `key`**: render `<SystemSpaceView key={id} systemId={id} />` and re-render with another id, or unmount and render afresh. A bare `rerender` with a new `systemId` prop does not remount and would hold the dock expanded for a correct build.
- **Tab walks start from a known element, not from whatever the previous click left focused.** Standalone: render already expanded (`initialExpanded`) and walk from `document.body`. View level: call `.focus()` on `vitals-fleet-chevron`, then `user.tab()`. That keeps 1.4 and 2.6 independent of the focus rules of 4.3.
- **Control names are matched exactly.** The report's link is named `Open the sighting log`; the deleted toggle's labels were `Open sighting log` and `Close sighting log`. A substring or case-insensitive match confuses them.
- No assertion on a dimension, an overlap, a scroll position or a resolved `calc()`/`var()` at tier 1 (design.md D-22).

### 5.2 Section 1 — `frontend/components/space/ConsoleDock.test.tsx`

Harness: nothing mocked. The file defines a local `Harness` holding `{ expanded, openSeq }` in `useState`, with `initialExpanded?: boolean`, `label?: string` (default `'Log'`) and `children` as the tab's content; its `onOpen` sets `expanded` and increments `openSeq`, its `onCollapse` clears `expanded`. The `strip` it passes is `<div data-testid="vitals-strip"><button data-testid="strip-probe" /></div>`. `userEvent.setup()` for keyboard and Tab.

| Task | Arrangement | Closes on |
| --- | --- | --- |
| 1.1 | Harness collapsed; click `console-dock-open`; click `console-dock-collapse` | collapsed: open control visible, region has `hidden`; after open: region has no `hidden`, tablist, `console-panel-log` and collapse control visible, open control has `hidden`; after collapse: back to the first state |
| 1.2 | Harness expanded, child a stub reporting three rows and "more pages" (three elements and a load-more button) | `getAllByRole('tab')` has length 1, its text is `Log`, `aria-selected="true"`, its controlled panel is the one visible, and the tab's text matches no `/\d/` |
| 1.3 | Harness collapsed, then expanded; read only | the table in §1.3: both `aria-expanded` values, both `aria-controls` resolving to `console-dock-region`, `role="tablist"`, the tab's `aria-controls` resolving to `console-panel-log`, the panel's role and accessible name `Log` (through `aria-labelledby`), names `Console` and `Collapse console`, the three class tokens on each of the three controls, and the expanded region's interactive elements (`button, a[href], input, select, textarea, [tabindex]`) being exactly the tab, the collapse control and the child's own |
| 1.4 | child with two buttons `child-a`, `child-b`. Rows: Enter on focused `console-dock-open` expands, Space does too; Enter on focused `console-dock-collapse` collapses, Space does too; Tab walk collapsed from `document.body`; Tab walk with `initialExpanded` from `document.body` | collapsed sequence contains `strip-probe` then `console-dock-open` and never `console-tab-log` or `console-dock-collapse`; expanded sequence is `strip-probe`, `console-tab-log`, `console-dock-collapse`, `child-a`, `child-b`, each once, in that order |
| 1.5 | Row 1: focus `console-dock-open`, press Enter. Row 2: expanded, Tab to `console-dock-collapse`, press Enter | row 1: `document.activeElement` is `console-tab-log`; row 2: it is `console-dock-open` and is not `document.body` |

### 5.3 Section 2 — `frontend/components/space/SystemSpaceView.console-dock.test.tsx` (2.1-2.11, 2.13)

**Real, never mocked:** `SystemSpaceView`, `ConsoleDock`, `VitalsStrip` and its cells, `SightingLog`, `ScanControl`, `SpaceCommandPanel`, `FleetActionsPanel`, `FleetRoster`, `buildSceneModel`, `@/lib/console-dock-layout`. Wrapped in a fresh `QueryClientProvider` per render.

**Mocked** (the module list of `SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx:40-150`, with three changes):

1. `@/hooks/use-sightings`, per argument and settable. A map keyed `systemId ?? 'all'` holds a whole hook result (`data`, `isLoading`, `isError`, `refetch`, `fetchNextPage`, `hasNextPage`), default the empty page; and the mock records every argument it is called with, so "no call with `null`" is countable.
2. `@/hooks/use-scan`'s `useSettledScan` returns a settable value: `null` by default, a settled `GameAction` with no `reasonCode` (shape from `frontend/lib/types/action.ts`) for 2.9, so the real `ScanControl` renders its `Open the sighting log` button.
3. `./SpaceStage`: the availability and first-frame effect as in that file, plus one `button` per `props.scene.marks` entry of `kind === 'sighting'` with `data-testid="mock-ghost-${mark.recordId}"`, `data-highlighted={props.highlightedGhostId === mark.recordId ? 'true' : 'false'}` and `onClick={() => props.onHighlightGhost?.(mark.recordId)}`. The marks come from the real scene model, so a record drawn for the mock is a record in `drawnRecordIds`.

`next/navigation`, `use-system-space`, `use-fleets` (`useMyFleets` settable, verbs inert), `use-actions`, `use-market`, `corporation-provider` (including `useCorporationSessionOptional`), `use-galaxy`, `account-provider`, `use-burn-preview` and `@/lib/toast` are mocked as that file mocks them. Fixtures (`INTERIOR`, `ownFleet()`, `record()`) are copied from it; a record at a non-origin position in the open system is drawn.

| Task | Arrangement | Closes on |
| --- | --- | --- |
| 2.1 | Rows: fresh render; expand, unmount, render again; expand, re-render with another `key`/`systemId` | each: strip present, `console-dock-open` visible, region `hidden` |
| 2.2 | Reads filling all five cells and an acting fleet; fake timers, no time advanced between the two reads; expand with `fireEvent.click` | the text of each of the five cell testids, every `[data-raw]` value inside each, and the presence of `vitals-fleet-chevron`, identical collapsed and expanded |
| 2.3 | Collapsed | every interactive element inside `vitals-strip` is `vitals-fleet-chevron` or inside `vitals-fleet-menu`; `console-dock-open` is not inside `vitals-strip` |
| 2.4 | Parametrised: interior failed (`isError: true`, no data), own-fleets failed, stage unavailable (`stage.available = false`) | `console-dock-open` present; clicking it removes the region's `hidden` |
| 2.5 | Reads answered; collect `[aria-live], [role="status"], [role="alert"], [role="log"]` not inside `console-panel-log`; expand, then collapse | each region's text equal before and after each action |
| 2.6 | Rows collapsed and expanded; `.focus()` on `vitals-fleet-chevron`, then `user.tab()` once (collapsed) or twice (expanded) | collapsed: `console-dock-open`; expanded: `console-tab-log`, then `console-dock-collapse` |
| 2.7 | Pile mock for `'all'`: three records and a non-empty `nextCursor`; interior answered | expanded: the three `sighting-row-*`, the refresh control and `sighting-log-load-more` are all inside `console-panel-log`, and `getAllByTestId('sighting-log')` has length 1; collapsed and expanded: no `sighting-log-open`, no button named exactly `Open sighting log` or `Close sighting log`; collapsed: the log not shown (§5.1 predicate); expanded: `console-tab-log` has accessible name exactly `Log` |
| 2.8 | Parametrised over the `'all'` result: loading (`data: undefined, isLoading: true`), empty, failed (`isError: true`) | inside `console-panel-log`: the text `Reading the pile…` (the loading state has no testid and `SightingLog.tsx` gains none), `sighting-log-empty`, `sighting-log-error` with its `Retry` button |
| 2.9 | Settled scan set; rows collapsed and already-expanded; click the button named exactly `Open the sighting log` | region not `hidden`, tab `aria-selected="true"`, `document.activeElement` is `console-tab-log`. The expanded row fails a toggling implementation |
| 2.10 | One drawn record in both pile entries; collapsed; click `mock-ghost-<id>`; then expand | after the click: region still `hidden`, the mock ghost's `data-highlighted="true"`; after expanding: `sighting-row-<id>` inside the panel has `data-highlighted="true"` |
| 2.11 | `useSystemSpace` returns `isLoading: true` with no data. Read collapsed, expand, read. Then row A: the mock answers and the view re-renders; row B: it fails | while loading: zero recorded calls with `null`, `queryByTestId('sighting-log')` is null in both states, expanded panel holds `console-panel-waiting` whose text does not contain `Reading the pile`; rows A and B: `console-panel-waiting` gone, `sighting-log` inside the panel |
| 2.13 | Ghost-feed result for the system id set to `isError: true` (the card renders). Read collapsed, expand, unmount | `document.documentElement.style.getPropertyValue(CONSOLE_DOCK_HEIGHT_VAR)` is `3.5rem`, then `13.75rem`, then `''`; `sightings-unavailable` has class `CONSOLE_DOCK_LANE_LEFT_CENTER` and `space-command-column` exists with class `CONSOLE_DOCK_LANE_COLUMN`, both asserted against the imported constants |

`SystemSpaceView.sighting-log-mount-ordering.test.tsx` is not edited and proves nothing about the log's gate (it never opens the log); only 2.11 covers it.

### 5.4 Task 2.12 — `frontend/lib/console-dock-layout.test.ts`

Harness: nothing mocked; the module imported, and four files read as text with `node:fs` from a path resolved off `import.meta.url` (precedent: `frontend/lib/anti-mirror-guard.test.ts:32`).

One arrangement group:

1. The six exports equal the values in §2.
2. In the module's own source text, each of the three lane strings appears verbatim as one quoted literal.
3. **RAW text** (comments not stripped) of `components/space/SystemSpaceView.tsx`, `components/space/SpaceStage.tsx` and `components/floating-nav.tsx` contains no `bottom-[4.5rem]` (RULING 22, r3-m2).
4. In `SpaceStage.tsx` **with comments stripped** (`/* … */`, `{/* … */}`, `// …`), the JSX opening tag that carries `data-testid="space-camera-controls"` has a `className` attribute whose expression contains the identifier `CONSOLE_DOCK_LANE_CAMERA`. Anchor on the testid (unique in the file, `:712`); a mention of the constant in a comment or elsewhere in the file does not satisfy it.

### 5.5 Tasks 2.14, 2.15 — `frontend/components/floating-nav.dock.test.tsx`

Harness: `next/navigation` and `@/components/account-provider` mocked as `floating-nav.test.tsx:5-23` mocks them (an authenticated account). `ConsoleDock` and the layout module are real. `floating-nav.test.tsx` is not edited.

| Task | Arrangement | Closes on |
| --- | --- | --- |
| 2.14 | `usePathname` returns `/systems/sys-0`; render `<ConsoleDock expanded openSeq={1} … />` beside `<FloatingNav />` | `floating-nav` has class `CONSOLE_DOCK_LANE_LEFT_CENTER` (imported); the root property reads `13.75rem` |
| 2.15 | `usePathname` returns `/`; render `<FloatingNav />` alone | the root property reads `''`; `floating-nav` has the same imported class |

Clear the root's inline style in `afterEach` so a failed test cannot leak the property into the next.

### 5.6 Section 3

| Task | File | What changes | When |
| --- | --- | --- | --- |
| 3.1 | `SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx:206` | the helper clicks `console-dock-open` instead of `sighting-log-open`; the four tests' assertions are untouched. `SightingLog.test.tsx:27-29` header comment drops `sighting-log-open` | red phase, with sections 1 and 2 (it is then red for the right reason and goes green at 4.2) |
| 3.2 | `frontend/e2e/tests/scan-journey.spec.ts` (`:124`, `:150`, `:219`, `:252`, `:293`, `:299-304`), `frontend/e2e/helpers/scan-fixtures.ts:247-252` comment | per tasks.md. Each open is written in the spec, no helper (design.md D-15). Do not expand the dock earlier in a test whose later leg expects the report's link to show a just-settled record: the link is then the first show of the log in that document load, which is what keeps `:124-127` true exactly as today | after 4.5, against the built UI; not run |
| 3.3 | `frontend/e2e/tests/scan-lane-transit-fizzle.spec.ts:296` | `console-dock-open` instead of the toggle; assertions unchanged (the log still reads when shown, so zero rows still means what it meant) | after 4.5; not run |
| 3.4 | `frontend/e2e/tests/vitals-strip-journey.spec.ts:452-500` | re-read with the dock collapsed: column 564 px, cluster foot at 100 px, nav and card at 72 px. Edit only where a surface moved. Its `**/v1/sightings**` intercept still fails one read here, since the leg never expands the dock | after 4.5; not run |
| 3.5 | `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts:479-495`, `:1022-1034` | the same re-read | after 4.5; not run |
| 3.6 | the whole `SystemSpaceView*.test.tsx` and `SpaceStage*.test.tsx` families | run and attribute every red to its cause. None is expected to need an edit; an edit is a finding for the orchestrator | immediately after 4.2 and 4.4 land |

### 5.7 When each test can be judged red for the right reason

Before any build, four files fail at import (`./ConsoleDock`, `@/lib/console-dock-layout`) and the 3.1 tests fail on a missing `console-dock-open`. That is the recorded red, but for the tests below it is not yet the red they exist for.

| Test | Judged red for its own reason only after | Its own reason |
| --- | --- | --- |
| 1.5 | 4.1 | the shell exists and focus is not moved |
| 2.12 (items 3, 4), 2.14, 2.15 | 4.1 | the module and the dock exist; the occupants still carry the old literal |
| 2.1-2.4, 2.6-2.8, 2.10, 2.11, 3.1 | red from the start (no dock in the view) once the file imports, that is after 4.1 | — |
| 2.9, focus assertion | 4.2 | the link expands the dock and focus is still on the link |
| 2.13, lane and testid assertions | 4.2 | the dock publishes from inside the view; the occupants still carry the old literal |
| 2.5 | never, for a correct build | it is a guard: green from 4.2 and must stay green through 4.3. Record it `not-observed-red` unless the SDET shows it red by a deliberate local mutation |
| 3.6 | 4.2 | by its own wording |

## 6. Testids, roles and names in one place

New: `console-dock`, `console-dock-open` (button, name `Console`), `console-dock-region`, `console-tab-log` (tab, name `Log`), `console-dock-collapse` (button, name `Collapse console`), `console-panel-log` (tabpanel, name `Log`), `console-panel-waiting`, `space-command-column`.

Unchanged and used by the new tests: `space-view`, `vitals-strip`, `vitals-fleet-cell`, `vitals-fuel-cell`, `vitals-hold-cell`, `vitals-credits-cell`, `vitals-clock-cell`, `vitals-fleet-chevron`, `vitals-fleet-menu`, `sighting-log`, `sighting-row-${id}`, `sighting-log-load-more`, `sighting-log-empty`, `sighting-log-error`, `sightings-unavailable`, `space-camera-controls`, `floating-nav`, `nav-home`, `scan-report`, `space-announcer`, `balance-live-region`.

Gone: `sighting-log-open`. Test-only (the stage mock): `mock-ghost-${recordId}`.

## 7. Sequencing

A16's order, adjusted to this scope. One change from A16: the lanes (4.5) go last instead of second, because 2.13 cannot go green until the dock is in the view, and tasks.md ties 4.5's box to "2.12-2.15 pass".

1. **SDET, red phase.** `ConsoleDock.test.tsx` (1.1-1.5); `SystemSpaceView.console-dock.test.tsx` (2.1-2.11, 2.13); `console-dock-layout.test.ts` (2.12); `floating-nav.dock.test.tsx` (2.14, 2.15); 3.1. Red recorded with the team's red manifest, then hand to the developer.
2. **Developer, 4.1.** `console-dock-layout.ts` whole, and `ConsoleDock.tsx` without §1.7. Green: 1.1-1.4, 2.12 items 1 and 2.
3. **Developer, 4.2 and 4.4 as one commit.** §3.1-§3.4 and §4. Removing `logOpen` without removing its two readers does not compile, so the two tasks land together and both boxes are ticked. Green: 2.1-2.4, 2.6-2.8, 2.10, 2.11, 3.1; 2.5 green as a guard.
4. **SDET, 3.6.**
5. **Developer, 4.3.** §1.7. Green: 1.5, 2.9; 2.5 still green.
6. **Developer, 4.5.** §3.5. Green: 2.12-2.15.
7. **SDET, 3.2-3.5**, written against the built UI, not run.
8. **Orchestrator 5.1; SDET 5.2 (§9); orchestrator 5.3 onward.**

## 8. What the developer must not touch

### 8.1 Tests

Every test file is immutable to the developer, the new ones and the existing ones. A test believed wrong is a dispute for the orchestrator citing the scenario text. No `skip`, no `only`, no edited assertion.

### 8.2 The unspecced production hunks U1-U10 (`docs/handoffs/add-vitals-strip-qa-reverify.md` § 3; owned by Travis, to stay byte-identical)

Of the four files this change edits beside the new ones, **only `SystemSpaceView.tsx` carries any** (U2, from `1424a77`). `SpaceStage.tsx`, `floating-nav.tsx` and `SightingLog.tsx` carry none (`git log 3dc56da..592df53` over them lists only `1424a77`, which touched `SystemSpaceView.tsx` alone).

| Hunk | File and current lines | Text that must survive unchanged |
| --- | --- | --- |
| U2 (import) | `frontend/components/space/SystemSpaceView.tsx:51` | `import { useCoarseWorldTime, useWorldClock, wallMsUntil, type WorldClock } from '@/lib/client-clock'` |
| U2 (sweep watcher timer) | `SystemSpaceView.tsx:188-194` | the five-line comment beginning `` // `eta` is WORLD time ``, then `const delay = wallMsUntil(clock, eta) + ETA_CUSHION_MS` and `timer = setTimeout(attempt, delay)` |
| U2 (arrival refetch timer) | `SystemSpaceView.tsx:590-593` | the two-line comment beginning `// World instant -> wall delay`, then `const delay = wallMsUntil(clock, soonest) + ETA_CUSHION_MS` and `const timer = setTimeout(resyncAndRefreshScanTargets, delay)` |
| U1 | `frontend/lib/client-clock/index.ts:86-110` (`wallMsUntil`) | not a file this change edits |
| U6, U10 | `frontend/package.json` (`dev`/`start` scripts, dependency versions), `frontend/package-lock.json` | no dependency is added by this change; neither file is edited |
| U7, U9 | `frontend/playwright.config.ts`, `frontend/e2e/setup/backend-stack.ts` | not edited, by the developer or by the journey |
| U8 | `frontend/lib/firebase.ts` and the port wiring outside `frontend/` | not edited |
| U3, U4, U5 | `backend/config/config.go`, `backend/common/tuning.go`, `backend/router.go` | backend; out of this change entirely |

The developer's edits to `SystemSpaceView.tsx` are at `:36-65` (two added import lines, leaving `:51` as it is), `:280-295`, `:890-932`, `:986-1003` and `:1065-1086`. None is within forty lines of a U2 hunk, and the whole `ScanSweepWatcher` component (`:106-206`) and the Rule 1 effect (`:583-595`) are outside this change. A diff of the file that shows a changed line in `:106-206` or `:538-612` is a defect.

### 8.3 What belongs to `keep-console-tab-content-mounted` (2b-i-b)

- No mount latch: the gate is `!interior.isLoading` and nothing reads `interior.isFetching`.
- No settle re-read: `refetchGhostFeed` stays the callback at `:426` and at `onSettled` (`:830`); nothing invalidates `queryKeys.sightings.pile(null)`. `drift-sighting-log-not-reread-after-sweep-settles.md` stays open, exactly as masked as today.
- No Escape handler and no `keydown` listener on `document`, the view or the dock.
- No always-mounted log: the content is `null` while collapsed.
- No `shown` prop and no `scrollIntoView` in `SightingLog`.
- No "focus elsewhere is not moved" assertion or guard beyond what §1.7 does by construction.
- No selection guard for a pointer press on the dock.

### 8.4 Also out of bounds

`VitalsStrip*.tsx`, `ScanControl.tsx`, `SpaceCommandPanel.tsx`, `FleetActionsPanel.tsx`, `FleetRoster.tsx`, `layout-wrapper.tsx`, `next.config.ts` (never `experimental.routerBFCache`), every hook, service and query key, anything under `openspec/` (an edit under `openspec/changes/add-console-dock/` or `openspec/specs/system-console/` expires the verdict). `tasks.md` boxes are ticked by their owners; ticking is the one permitted write there.

## 9. The journey — task 5.2, `frontend/e2e/tests/console-dock-journey.spec.ts`

Written by the SDET after every task in sections 1-4 is checked, against the built UI. Not run by its author. One run at the gate, by the orchestrator, with the tree locked.

### 9.1 Shape, carried from `burn-cost-overlay-journey.spec.ts`

- `test.use` viewport 1280×720; one corporation provisioned in `test.beforeAll` (`wakeNewCorp`, which lands on the home system's first rendered frame); the context created there is given the viewport, empty storage state and base URL explicitly. Serial tests over the shared page.
- No `test.setTimeout`; the 60 s per-test budget in `playwright.config.ts` is not raised. Each test prints a `[journey-budget]` line.
- Legs record `PASSED`, `UNTESTED` or `FAILED` and print `[journey-leg] <name>: <outcome>` with the measured figures; a closing test fails the run on any `FAILED` and on any must-PASS leg that is not `PASSED`. Stable leg names, so QA can name each BLOCKED row's closing line before the run (5.3).
- A file-level skip (environment not local) prints the `[journey-SKIPPED]` line at collection.
- **Carried forward (design.md D-14):** the `[journey-console]` capture with the **hard** `afterEach` assertion that no entry matches `/maximum update depth|nested update/i` (`burn-cost-overlay-journey.spec.ts:838-847`), and the dev-badge hide by `context.addInitScript` adding `nextjs-portal { display: none !important }` (`:761-764`). Also the `[journey-http]` capture of every 4xx/5xx `/v1/` response; the forced 500s of §9.2 will appear there and in the console capture and are expected.

### 9.2 Fixtures

- **Three sighting records**, seeded with `seedSightingFixture` (`frontend/e2e/helpers/scan-fixtures.ts:126`) for the journey's corporation (`captureCorporationId`, `:48`), with distinct `actionId`/`targetId`, the home system's id and any host id. Seeded in `beforeAll` after the wake, followed by `page.reload()` so the log's first read in every later leg sees them. The panel shows about one and a half rows, so three records make the scroll leg certain.
- **The sightings-unavailable card**, induced by failing the **system-filtered** read only: a `page.route` whose predicate is on the URL (path ends `/v1/sightings` and `searchParams.get('systemId')` is non-null), fulfilled with a 500. Never the glob `**/v1/sightings**`: the log's read carries no `systemId` (`sighting-service.ts:21-27`), is a separate cache entry, and must keep working for the log legs. The route is installed before the reload and stays for the whole file; the settle path's ghost refetch fails again and the card stays, which is what both geometry legs need. No ghost is drawn in this journey as a result; ghost legs are `scan-journey`'s (3.2).
- The card appears only after the query's retries are spent; `vitals-strip-journey.spec.ts:466-468` allows 20 s for it.

### 9.3 Legs, in order

| # | Leg | Class | Asserts | Logged, not asserted |
| --- | --- | --- | --- | --- |
| 1 | `opens-collapsed` | must-PASS | after the reload: `vitals-strip` and `console-dock-open` visible; `console-dock-region`, `console-tab-log`, `console-panel-log` not visible | the root's `--console-dock-height` |
| 2 | `hidden-beats-flex` | must-PASS | collapsed: `console-dock-region` has `flex` in its class list and its computed `display` is `none` (the one line of design.md D-1) | — |
| 3 | `strip-row-56` | must-PASS | `vitals-strip` is 56 px tall collapsed; repeated in leg 7 expanded | — |
| 4 | `geometry-collapsed` | must-PASS | the five surfaces (`space-command-column` as one scrolling surface, `sightings-unavailable`, `space-camera-controls`, `floating-nav`, `console-dock-open`): each visible area wholly inside 1280×720; no overlap with the strip or with any other of the five; each control each carries hit-tested at its centre after `scrollIntoViewIfNeeded` within its surface (`elementFromPoint` returns the control or a descendant), the card's `Retry` included | each box |
| 5 | `targets-24` | must-PASS | `console-dock-open` at least 24×24 (collapsed); `console-tab-log` and `console-dock-collapse` at least 24×24 (expanded, in leg 7) | the boxes |
| 6 | `tab-walk-collapsed` | must-PASS | focus `vitals-fleet-chevron`, press Tab: `console-dock-open`. A bounded walk from the document start never focuses `console-tab-log` or `console-dock-collapse` | the sequence |
| 7 | `expand-collapse-keyboard` | must-PASS | Enter on `console-dock-open`: region visible, focus on `console-tab-log`, dock from the strip's top to the viewport's foot is 220 px tall and 1280 wide, strip 56. Space on `console-dock-collapse`: collapsed, focus on `console-dock-open`. Space on `console-dock-open` expands; Enter on `console-dock-collapse` collapses | — |
| 8 | `reload-collapsed` | must-PASS | expand, `page.reload()`, the dock is collapsed | — |
| 9 | `log-panel-origin` | must-PASS | expanded, panel at `scrollTop` 0: the refresh control (`Refresh sighting log`) and the first `sighting-row-*` each wholly inside `console-panel-log`'s box | row count |
| 10 | `scroll-leg` | must-PASS | scroll `console-panel-log` to its end: the last row wholly inside the viewport (and inside the panel's box); the dock still 220 px | `scrollHeight`, `clientHeight` |
| 11 | `geometry-expanded` | must-PASS | the four surfaces of leg 4 without `console-dock-open`, the same three assertions, against the strip and the dock's box; the five strip cells each rendered, non-empty, inside the viewport and overlapped by none of the surfaces | each box; the column's `clientHeight` (about 400) |
| 12 | `tab-walk-expanded` | must-PASS | from the document start, a camera control is focused before any `body-hit-*` element (bodies and lane gates share that testid prefix, `SpaceStage.tsx:666`; stop at the first one). Then focus `vitals-fleet-chevron`: Tab gives `console-tab-log`, then `console-dock-collapse`, then the log's refresh control | the sequence |
| 13 | `report-link` | asserted when reached, else UNTESTED | collapse; commit a focused scan on the nearest served target (`openScanControlAndPickNearestTarget`, `commitScan`); wait for `scan-report`; click the button named `Open the sighting log`: dock expanded, `console-tab-log` selected and focused, `sighting-log` visible. Click it again while expanded: still expanded, focus on the tab | **whether the settled sweep's new record is listed** (row count before and after, and whether a row names the swept host). That is `keep-console-tab-content-mounted`'s; the 60 s stale time may serve the cached pile; nothing is asserted about it |
| 14 | `galaxy-nav-72` | must-PASS | with the dock **expanded**, click `nav-home` (the app's own link, a client-side navigation; never `page.goto('/')`, which reloads the document and cannot see a leaked height); on `/`, the foot of `floating-nav` is 72 px above the viewport's foot | the root's `--console-dock-height` (expected empty) |
| 15 | `return-collapsed` | must-PASS | **one route** (RULING 22, r3-m3): click the first `fleet-row-*` in `fleet-roster` (it selects the system), then click `enter-system-button`, wait for `**/systems/<homeSystemId>` and `space-view`, as `world-time-render-loop-journey.spec.ts:175-194`; never `page.goto`. The dock is collapsed | — |
| 16 | `other-system-collapsed` | UNTESTED unless arranged | a system-to-system client navigation with the dock expanded, arriving collapsed | a fresh corporation has one hull in one system, so this is not reachable without a lane jump. Log UNTESTED naming tier 1 task 2.1 as the cover and leg 15 as the nearest tier-4 evidence. Do not jump to arrange it |

Not in this journey, by ruling: a pointer press on the dock leaving the selection alone, and the settled sweep's record appearing with no re-open (both 2b-i-b's); the off-screen reach chips, toasts and hover cards (not covered surfaces); a load-more page (51 records).

### 9.4 Sizing, from `docs/handoffs/add-burn-cost-overlay-journey.md`

- The test stack runs at world scale 5 (`frontend/e2e/setup/backend-stack.ts:180`). A home-system flight was 19 to 22 s of world time, 3.8 to 4.4 s wall; a gate flight about 5.4 s wall; a select-plus-quote round trip well under 1 s. The whole four-test overlay file took about 19 s.
- Leg 13 is the only leg that waits on the simulation. Read the chosen target's served `durationMs`; its wall wait is that over 5, plus the 400 ms cushion and the settle reads. Budget it at 25 s of the test's 60. If no target is in range, the wall wait exceeds the budget, the sweep fizzles (the report then carries no link) or the report does not appear in budget, the leg logs **UNTESTED** with the reason; it does not throw and no timeout is raised. Its tier-1 cover is task 2.9, and the migrated `scan-journey` (3.2) also drives the link at tier 4.
- No leg waits for a burn. If the nearest target needs one, treat the leg as unreachable.
- The suite's last wall times were tier 4 436 s and tier 3 966 s; this file should add well under a minute. An overrun is reported, not absorbed.

## 10. Gates

Cited from `docs/testing-tiers.md`; the commands live there and nowhere in this file.

- **Per task:** tier 1 for the files the task touched, and types. A developer box is ticked when the tests tasks.md names for it are green and untouched.
- **Per commit:** tiers 0 and 1, the per-commit gate. Tier 0 requires the sibling test of every new production file; all three exist from the red phase (`ConsoleDock.test.tsx`, `console-dock-layout.test.ts`, and `floating-nav.test.tsx` already present).
- **Never per task, never as a confirming rerun:** tiers 3 and 4. They run once each at the archive gate (tasks 5.4, 5.5), started by the orchestrator, one at a time, tree locked. The journey and the migrated e2e specs are not run by their author.
- No timeout is raised to make anything pass.

## 11. Where this contract goes beyond design.md (for adjudication; no change-folder edit)

1. The shell's file and name: `frontend/components/space/ConsoleDock.tsx`, `ConsoleDock`. design.md says "a new dock shell component".
2. The six constant names in §2. design.md fixes the values and the literals, not the identifiers.
3. The tab descriptor `{ id, label, content }` and `ConsolePanelWaiting` as an export of the shell. design.md D-4 says "its tabs"; D-21 says the indication is the dock's.
4. The shell renders its content in both states and the view passes `null` while collapsed (§1.1, §3.3). This is how "mounted when the tab is shown" is built without the shell knowing it.
5. The class tokens 1.3 binds to (`focus-visible:outline-2`, `min-h-6`, `min-w-6`) and `flex` on the region.
6. Test-side conventions: the `key` remount, the absence predicate, Tab walks from a known element, the stage mock's `mock-ghost-*` triggers.
7. `console-dock-layout.ts` is created whole in 4.1, and 4.5 runs last (§7), a reordering of A16.
8. RULING 22's two settlements: raw text for the no-literal assertion (§3.5, §5.4 item 3) and the single return route (§9.3 leg 15).

## 12. Risks

1. **The system-to-system remount is held at tier 1 only through a `key`** that models Next's segment keying (read from `layout-router.js`, not run). Leg 16 cannot reach it cheaply. If the router did not remount, an expanded dock would survive a fleet-menu jump between systems; the first place that would show is `vitals-strip-journey`'s cross-system step if a later change expands the dock before it.
2. **The two 1280×720 collision legs with a 564 px column** (design.md Risks, Open Questions). Not knowable before the gate run. 3.4 and 3.5 re-read them; a red there is a batched revision, not a reason to change the column lane in this build.
3. **The pixel figures of D-1 and D-3 were not re-measured in a browser by the second panel run.** Legs 2, 3, 4, 7, 11 and 14 are their confirmation.
4. **The scan-report link has no testid** and is matched by its exact name in tier 1 and tier 4. `ScanControl.tsx` is outside this change; a testid is the next link's to add when the control moves.
5. **`toHaveClass` with a bracketed lane class** relies on the class containing no whitespace, which the three literals do not.

## 13. Spec conflicts

None found. Every scenario is buildable as written with the shape above. The two wording residues RULING 22 names are settled in §3.5, §5.4 and §9.3; r3-m1 is grammar only.

STATUS: COMPLETE

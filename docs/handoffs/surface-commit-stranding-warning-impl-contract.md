# surface-commit-stranding-warning — implementation contract

Architect, implementation kickoff, 2026-10-04. Change validated; adversary CLEAR
at round 2, verdict commit `af747be` (the change folder and
`openspec/specs/system-space-view` are unchanged since). Code read at `252a0c4`.
Authority: the delta and `tasks.md` win over this file; this file wins over
`design.md` only on the three points listed in §11. Frontend only: no Go work,
no wire change, one developer.

The React Query facts in §3 and §10 were re-measured for this contract against
the installed `@tanstack/query-core` 5.90.11 (a throwaway Node script, not kept).
Nothing else here was run: no vitest, no tsc, no stack.

## 0. The seam, in one paragraph

Two production files. `SpaceCommandPanel.tsx` reports every accepted burn commit
upward through one optional callback, fires one advisory toast on a warned
response, and renders a static line from one boolean prop. `SystemSpaceView.tsx`
keeps a per-fleet record for warned orders in component state, derives the
boolean in render, and passes both down. No hook, service, type module, query
key, e2e helper or backend file changes. Two test files: additions to
`SpaceCommandPanel.test.tsx` and one new view-level file.

## 1. `SpaceCommandPanel.tsx` (task 4.1)

### 1.1 Exported payload type and the two new props

```ts
export interface AcceptedBurnCommit {
  fleetId: string
  departMs: number | null
  arriveMs: number | null
  strandingWarning: boolean
}

// added to SpaceCommandPanelProps, both optional
onCommitAccepted?: (commit: AcceptedBurnCommit) => void
commitStrandingNotice?: boolean   // destructured with default `false`
```

The type is exported from `SpaceCommandPanel.tsx` and from nowhere else.

### 1.2 Copy constants

Module-level in `SpaceCommandPanel.tsx`, **not exported** (nothing imports them;
tests assert the literal strings below, never an imported constant, so a typo in
the constant cannot pass):

| Constant | Exact string |
| --- | --- |
| `COMMIT_STRANDING_NOTICE_COPY` | `Your current course leaves this fleet unable to reach any station or lane gate. Place a different order to change it.` |
| `COMMIT_STRANDING_TOAST_COPY` | `This course leaves the fleet unable to reach a station or lane gate.` |

### 1.3 The success callback

Inside the existing mutate-level `onSuccess` of `commitBurn` (`:138-155`), after
the existing `toast.success(successCopy)` and in this order:

1. `const warned = settled?.strandingWarning === true`
2. `if (warned) toast.warning(COMMIT_STRANDING_TOAST_COPY)` — the wrapper's
   `warning` from `@/lib/toast`, **one argument**, no options object.
3. `onCommitAccepted?.({ fleetId: fleet.id, departMs, arriveMs, strandingWarning: warned })`

- `fleet.id` is the click-time closure's `fleet`, the same value passed to
  `order.mutate`. No extra capture, no ref.
- `departMs` is `burn.DepartMs` when `typeof` it is `'number'`, else `null`;
  `arriveMs` likewise from `burn.ArriveMs`. The existing local cast of `burn`
  (`:140-143`) gains `DepartMs?: number`; that is the only edit to existing lines
  in the callback.
- The callback is called for **every** accepted commit, warned or not. It is not
  called in `onError` or `onSettled`. Nothing in `onError` changes.
- Tests must not assert the relative order of the two toasts and the callback.

### 1.4 The notice element

```tsx
{commitStrandingNotice && (
  <p data-testid="commit-stranding-notice" className="mt-2 text-[11px] text-amber-400">
    {COMMIT_STRANDING_NOTICE_COPY}
  </p>
)}
```

Placed immediately after the Burn `<Button>` (`:314-323`) and before the
`commit-drift-notice` block. No `role`, no `aria-live`, no button, no state, no
dependence on `preview`, `currentQuote`, `previewStale`, `previewNoQuote`,
`selection`, `fleet` or `commit`. The Burn button's props and position are not
edited. `preview-stranding` (`:280-284`) stays byte-identical.

## 2. `SystemSpaceView.tsx` (tasks 4.2, 4.3)

### 2.1 The record

```ts
interface WarnedOrder {
  departMs: number | null
  arriveMs: number | null
  /** own-fleets dataUpdateCount at acceptance; null when the read the commit
   *  started had already answered; undefined only when the query has no state */
  readsAtAcceptance: number | null | undefined
}
const [warnedOrders, setWarnedOrders] = useState<Record<string, WarnedOrder>>({})
```

Declared with the view's other `useState` calls (`:262-266`). Keyed by fleet id.
`undefined` in the field type is the one widening over design Decision 5; see
§11 item 1.

### 2.2 The handler: what is stored at acceptance

```ts
const handleCommitAccepted = useCallback(
  (commit: AcceptedBurnCommit) => {
    if (!commit.strandingWarning) {
      setWarnedOrders((current) => {
        if (!(commit.fleetId in current)) return current
        const next = { ...current }
        delete next[commit.fleetId]
        return next
      })
      return
    }
    const state = qc.getQueryState(queryKeys.fleets.mine())
    const answered = state?.fetchStatus === 'idle' && state.status === 'success'
    const readsAtAcceptance = answered ? null : state?.dataUpdateCount
    setWarnedOrders((current) => ({
      ...current,
      [commit.fleetId]: { departMs: commit.departMs, arriveMs: commit.arriveMs, readsAtAcceptance },
    }))
  },
  [qc],
)
```

Declared after `const qc = useQueryClient()` (`:337`). The query state is read
**synchronously in the handler body, outside the updater** (an updater may run
later, or twice). What is stored, by query state at the moment the panel's
callback runs:

| Own-fleets query state at acceptance | `readsAtAcceptance` | Gap |
| --- | --- | --- |
| `fetchStatus: 'fetching'` (the read `useOrder` started is in flight; the normal case, and every case in the new harness) | current `dataUpdateCount` | open |
| `fetchStatus: 'paused'` | current `dataUpdateCount` | open |
| `fetchStatus: 'idle'`, `status: 'error'` (that read already failed) | current `dataUpdateCount` | open |
| `fetchStatus: 'idle'`, `status: 'success'` (that read already answered) | `null` | none |
| no query state (a harness that mocks `useMyFleets`) | `undefined` | open; untested, unreachable in production |

Unwarned accepted commit: the fleet's entry is deleted. Rejected or failed
commit: the handler is never called, so nothing changes.

### 2.3 The render-time derivation

Plain expressions in the render body, after `acting` (`:296`) and `qc` (`:337`),
placed beside `currentQuote` (`:749`):

```ts
const warned = acting ? warnedOrders[acting.id] : undefined
const readCount = qc.getQueryState(queryKeys.fleets.mine())?.dataUpdateCount
const awaitingRead = !!warned && warned.readsAtAcceptance !== null && readCount === warned.readsAtAcceptance
const burn = acting?.state?.Mode === 0 ? acting.state.Burn : null
const stillRunning =
  !!warned && !!burn && warned.departMs !== null && warned.arriveMs !== null &&
  burn.DepartMs === warned.departMs && burn.ArriveMs === warned.arriveMs
const commitStrandingNotice = awaitingRead || stillRunning
```

- **The gap is open** exactly while the acting fleet has a record whose
  `readsAtAcceptance` is not `null` and equals the query's current
  `dataUpdateCount`. Only an answer moves that count; a failure does not.
- **The order counts as running** exactly when the acting fleet's entry in the
  own-fleets data has `state.Mode === 0`, a non-null `state.Burn`, and both
  instants strictly equal to the record's. No target, no clock, no `worldTime`.
- Not wrapped in `useMemo` (§10 item 5). No effect, timer, ref or `setState`.

### 2.4 Props passed (task 4.3)

`<SpaceCommandPanel … onCommitAccepted={handleCommitAccepted} commitStrandingNotice={commitStrandingNotice} />`.
The import becomes `import { SpaceCommandPanel, type AcceptedBurnCommit } from './SpaceCommandPanel'`.

### 2.5 Lines that must stay byte-identical (task 4.4)

`previewWanted` (`:743`), the `useBurnPreview` call (`:744-748`), and the two
`wallMsUntil` call sites (`:193`, `:562`, the U2 hunks). The scan's
`committedPending` block (`:339-358`) is not edited and is not the model.

## 3. React Query facts the shape rests on (measured)

1. With a read held in flight, an accepted commit makes a new `listMine` call
   inside `useOrder`'s hook-level `onSuccess` (`use-fleets.ts:72`), before the
   panel's mutate-level callback, which then sees `fetchStatus: 'fetching'`.
2. Answering the superseded call afterwards changes nothing:
   `dataUpdateCount`, `data` and `fetchStatus` are untouched.
3. **Every** observer `refetch()` while a read is in flight does the same
   (cancels, starts a new call). The view's poll, ETA timer, `sse-reconnect`
   handler and the fleets-error retry all go through `fleets.refetch()`.
4. A rejected read leaves `dataUpdateCount` and `data` as they were, sets
   `status: 'error'`, `fetchStatus: 'idle'`, increments `errorUpdateCount`.
   A later answer returns `status` to `'success'` and increments the count.
5. A commit accepted while the query is in `status: 'error'` still starts a new
   read first, so the handler sees `fetching`.

## 4. Testids and controls

New: `commit-stranding-notice`. Existing, used by the new tests: `burn-button`,
`preview-stranding`, `preview-no-quote`, `preview-stale`, `commit-drift-notice`,
`space-announcer`, `space-world-clock` (`data-world-time`), `space-fleets-error`,
`space-fleets-retry`, `fleet-row-<id>` (roster row; click makes that fleet
acting), `fleet-stranded-<id>` (roster row's persistent indication),
`fleet-cmd-cut-drive-<id>` and `fleet-cmd-stop-<id>` (rendered only by
`FleetActionsPanel` on this view), `space-canvas-region` (`data-selection`, from
the stage mock) and the stage mock's `mock-select-*` triggers.

## 5. `SpaceCommandPanel.test.tsx` additions (section 1)

The file mocks `useOrder` as `{ mutate: vi.fn() }`; that stays. Additions go in
new `describe` blocks at the end. The only edit to an existing line is the toast
mock (`:58-60`), which gains `warning: (m: string) => toastWarning(m)` with a
`toastWarning = vi.fn()` beside the other two; without it a warned response
throws `toast.warning is not a function` once 4.1 lands.

- Pass the new props through the existing `panel(over)` spread
  (`Record<string, unknown>`), and through a spread element for re-renders, as
  the file's `stalePanel` does. That keeps `tsc` clean before 4.1 exists. Do
  not import `AcceptedBurnCommit` or any new runtime symbol.
- To hold a response: `order.mutate.mockImplementation((_v, opts) => { held = opts })`,
  then call `held.onSuccess(response)` or `held.onError(error)` inside `act`.
- Response instants in this file are `T0 + 1000` and `T0 + 61000` (the panel's
  `worldTime` is `T0`; this keeps the success toast on its tested path).
- The exact payload assertion is
  `toHaveBeenCalledWith({ fleetId: 'fleet_1', departMs: T0 + 1000, arriveMs: T0 + 61000, strandingWarning: true })`.

| Task | Arrangement | Closing assertion | Status before 4.1 |
| --- | --- | --- | --- |
| 1.1 | Click Burn for `fleet_1`; re-render with a fleet whose id is `fleet_2`; then place a warned response | `onCommitAccepted` called once, with the payload above (`fleetId: 'fleet_1'`) | assertion-red |
| 1.2 | `it.each` over key absent and `strandingWarning: false` | callback called once with `strandingWarning: false` and the two instants; `toastWarning` not called; `toastSuccess` called exactly once | assertion-red (the callback half) |
| 1.3 | `it.each` over the cap rejection and `new Error('API Error: 500 …')`. **Control leg first, same test:** a successful commit calls the callback once | after the rejection the callback count is still 1; `toastError` called once with the existing mapped copy; `toastWarning` not called | assertion-red through the control leg only; without it the test is vacuous |
| 1.4 | `commitStrandingNotice: true`, once with the default preview props and once with `preview: null, currentQuote: null`; then `false`; then omitted | true: element present; text equals the inline string; `burn-button` precedes it (`compareDocumentPosition`); no `role` attribute; `closest('[aria-live],[role="alert"],[role="status"]')` is null; no `button` descendant; class has no `red`/`rose`. False and omitted: absent | assertion-red (true arms) |
| 1.5 | Warned response, `it.each` over the panel still holding `fleet_1` and re-rendered with `fleet_2` | `toastWarning` called exactly once with the toast string; `toastError` not called; `toastSuccess` called exactly once; the string matches `/station/i` and `/lane gate/i`, no `/\d/`, no `/strand/i` | assertion-red |

No existing test in the file is edited, reordered or re-titled.

## 6. `SystemSpaceView.stranding-notice.test.tsx` (sections 2 and 3)

New file, `frontend/components/space/`. It copies the header idioms of
`SystemSpaceView.burn-preview.test.tsx` (`mocks` via `vi.hoisted`, the stage
mock, `deferred`, `flush`, `click`); it does not extract a shared helper, because
that would edit the existing files.

### 6.1 Real and mocked

**Real, never mocked:** `SystemSpaceView`, `SpaceCommandPanel`,
`FleetActionsPanel`, `FleetRoster`, `ScanControl`, `VitalsStrip`,
`@/hooks/use-fleets` in full (`useMyFleets`, `useOrder`, `useCutDrive`,
`useStop`; there is **no** `vi.mock('@/hooks/use-fleets')` in this file),
`@/hooks/use-burn-preview`, `@/hooks/use-actions`, `@/hooks/use-scan`.

**Mocked:**

- `@/lib/services`: `fleetService` `{ listMine, order, cutDrive, stop, preview, mine, scanTargets, scan, jump, hold, release }`
  and `actionService` `{ listRunning, cancel, listSettled, acknowledge }`.
- `@/hooks/use-system-space` (the interior), `@/hooks/use-sightings`,
  `@/hooks/use-market` (partial, as the sibling), `@/hooks/use-galaxy`,
  `@/components/corporation-provider`, `@/components/account-provider`,
  `next/navigation`, `./SpaceStage`.
- `@/lib/toast` as `{ success, error, warning, info }`, all `vi.fn()`.

**QueryClient:** `queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false }`,
`mutations: { retry: false }`. One client per test; the remount test reuses it.

**The interior mock returns one stable object** (`mockReturnValue`, one
`refetch` function for the file). `resync` depends on `interior.refetch`; a new
function per render re-arms the poll interval on every coarse tick and the poll
then never fires.

### 6.2 Settling calls

`listMine`, `order`, `cutDrive` and `stop` each push a `deferred()` onto a
per-service array and return its promise. Nothing resolves on its own. `preview`,
`listRunning` (`[]`), `listSettled` (`[]`), `scanTargets` (`[]`) auto-resolve.

Helpers (names fixed so the tests read alike):

- `answerListMine(index, fleets, worldTime)` resolves call `index` with
  `{ fleets, worldTime, scale: 1 }`; `rejectListMine(index, error)`.
- `answerOrder(index, fleet)`, `rejectOrder(index, error)`,
  `answerCutDrive(index, fleet)`, `answerStop(index, fleet)`.
- Each settles inside `act`, then `await flush(0)`, and appends to a `settled`
  log, e.g. `'listMine#1 answer'`, `'order#0 reject'`.
- `reconnect()` dispatches `new Event('sse-reconnect')` on `window` inside `act`,
  then `flush(0)`. `poll()` is `flush(BOARD_POLL_MS)` (imported from
  `@/lib/realtime`).

Rules:

1. Every test asserts its `settled` log equals the expected sequence before its
   closing assertion (tasks.md section 3 header).
2. After `reconnect()`, `poll()`, a retry click or a mutation answer, assert
   `mocks.listMine` gained a call **before** answering it. A trigger that caused
   no call voids the arrangement.
3. The live call is always the last one (§3 item 3). Answer by explicit index,
   read from `mocks.listMine.mock.calls.length - 1` after a time advance.
4. No test calls `qc.invalidateQueries`, `qc.setQueryData`, `qc.refetchQueries`
   or `fleets.refetch` for the own-fleets read. A non-mutation read is caused
   only by `reconnect()`, `poll()`, a time advance past a burn's arrival, or a
   click on `space-fleets-retry`.
5. Every "removed" or "absent" assertion is preceded, in the same test, by an
   asserted "present".

### 6.3 Time

Fake timers for the whole file. Steps use `flush(0)` unless the step is a time
step. Constants: `BOARD_POLL_MS` 20 000, `PREVIEW_REFRESH_MS` 10 000,
`ETA_CUSHION_MS` 400, coarse tick 1 000. The view's clock anchors on the
interior mock (`worldTime: W0`, `scale: 1`), so world time is `W0 +` elapsed
fake ms; a fleets answer's `worldTime` does not move it. `W0 = 1000`.

Once a read reports the fleet burning 1000 to 61000, the view arms a refetch at
60 400 ms. Advancing 61 000 ms therefore requests four reads (polls at 20 s, 40 s,
60 s, the ETA refetch), each superseding the last; none answers unless the test
answers it.

### 6.4 Fixtures

Ids: `SYSTEM_ID`, `OTHER = 'feat-body-1'` (the committed target),
`HOST = 'feat-body-0'` (the "different body"), fleets `fleet_a`, `fleet_b`.
`INTERIOR` as the sibling's, with `worldTime: W0`. Every fleet carries
`systemId: SYSTEM_ID`, `own: true`, `scale: 1`, a `position`, a `roster`, and no
`jump`.

| Builder | `state` | `attachedTo` |
| --- | --- | --- |
| `parked(id)` | `Mode: 1`, `Park` kind 0 around `feat-star`, `Burn: null`, `Drift: null` | absent |
| `attached(id, bodyId)` | as `parked`, `Park.BodyId = bodyId` | `bodyId` |
| `pointParked(id)` | `Mode: 1`, `Park` kind 2 (`PARK_KIND_POINT`), `BodyId: ''`, a `Point` | absent |
| `burning(id, departMs, arriveMs, targetBodyId = OTHER)` | `Mode: 0`, full `Burn` (`Target: { BodyId, Point: null }`), `Park: null`, `Drift: null` | absent |
| `burningToPoint(id, departMs, arriveMs)` | as `burning`, `Target: { BodyId: '', Point }` | absent |
| `drifting(id)` | `Mode: 2`, `Drift: { Anchor, Velocity, EpochMs }`, `Burn: null`, `Park: null` | absent (required: an `attachedTo` here would announce a landing) |

`withStranded(fleet, value)` sets `roster.stranded`. `orderResponse(fleet, warning)`
takes a `burning(...)` fleet and `true | false | 'absent'`; `'absent'` omits the
key. Instants: first order 1000/61000; second order by the same fleet 5000/80000;
fleet B's order 2000/50000; the stop's burn 70000/90000; the same-target row of
3.8 is 5000/61000.

**Base arrangement** (`commitWarned()`, single fleet):

1. mount; `answerListMine(0, [parked('fleet_a')], W0)`
2. `click('mock-select-feat-body-1')`
3. `click('burn-button')` → `order#0` pending
4. `answerOrder(0, orderResponse(burning('fleet_a', 1000, 61000), true))` →
   `listMine#1` requested, pending

**Confirmed arrangement** (`commitWarnedAndConfirm()`): base, then
`answerListMine(1, [burning('fleet_a', 1000, 61000)], W0)`.

Two-fleet tests answer `listMine#0` with `[parked('fleet_a'), parked('fleet_b')]`;
`fleet_a` is acting by default; `click('fleet-row-fleet_b')` and
`click('fleet-row-fleet_a')` switch.

### 6.5 Section 2 (hygiene, green when written)

2.1 and 2.2 are the harness above plus one smoke test: mount, assert
`listMine` called once and nothing rendered for the fleet, answer it, assert
`fleet-row-fleet_a`; `reconnect()` adds exactly one call; `poll()` adds exactly
one call. Recorded `already-green`.

## 7. Section 3, task by task

"Notice" is `screen.queryByTestId('commit-stranding-notice')`. "Warning toast"
is `vi.mocked(toast.warning)`. All are assertion-red before section 4; where the
red comes only from a GIVEN, the table says so.

| Task | Scenario(s) | Arrangement beyond base or confirmed | Closing assertion |
| --- | --- | --- | --- |
| 3.1 | *shown before any read has answered*; *shows the notice with the success feedback* | base | notice present; `toast.success` ×1; `toast.error` not called; `listMine#1` unanswered |
| 3.2 | *A read begun before the commit…* | answer #0; `reconnect()` → #1 held; select, click Burn; `answerOrder(0, …)` | `listMine` calls went 2 → 3 at the acceptance; after `answerListMine(1, [parked])` `document.body.innerHTML` is unchanged and the notice present; after `answerListMine(2, [burning 1000/61000])` notice present |
| 3.3 | *A read reporting the same burn keeps the notice* | confirmed; `poll()`, answer the same; then select `HOST`; then click it again (selection empty) | notice present after each answer and under each of the three selections |
| 3.4 | *The projected clock passing the arrival…* | confirmed; `flush(61_000)`; answer nothing | `data-world-time` > 61000 (the GIVEN, asserted); `listMine` gained calls and none was answered; notice present |
| 3.5 | *Cutting the drive ends the notice* | confirmed; click `fleet-cmd-cut-drive-fleet_a`; `answerCutDrive(0, drifting)`; answer the new `listMine` with `[drifting('fleet_a')]` | notice present before, absent after; `data-selection` unchanged; warning toast still ×1 |
| 3.6 | *A stop ends the notice…* | confirmed; click `fleet-cmd-stop-fleet_a`; `answerStop(0, …)`; `it.each`: read answers `burning(…, 70000, 90000)` / `pointParked` | notice absent in both rows |
| 3.7 | *Arrival at a body*; *Arrival at a point* | `it.each`. Row 1: confirmed, then `reconnect()` answered `attached('fleet_a', OTHER)`. Row 2: base with `mock-select-point` and `burningToPoint`, confirmed, then `reconnect()` answered `pointParked` | notice absent |
| 3.8 | *A different order placed elsewhere…* | confirmed; `poll()`; `it.each`: answer `burning(…, 5000, 80000, HOST)` / `burning(…, 5000, 61000, OTHER)` | notice present until that answer, absent after it |
| 3.9 | *An order that settled inside the commit round trip…* | base; `answerListMine(1, [attached('fleet_a', OTHER)])` | notice present before that answer, absent after |
| 3.10 | *A failed read never removes the notice* | base; `rejectListMine(1)`; click `space-fleets-retry`, answer burning 1000/61000; `reconnect()`, reject; click retry, answer `parked` | after step 1: notice, `space-fleets-error` and `space-fleets-retry` all present; present after steps 2 and 3; absent after step 4 |
| 3.11 | *follows the acting fleet and returns…*; *A response that lands after the acting fleet changed…* | two fleets, `it.each`. Row 1: A commits (answered), read answers A burning + B parked, switch to B, switch to A. Row 2: click Burn for A, switch to B, `answerOrder(0, A warned)`, read answers A burning + B parked, switch to A | no notice while B acts; notice when A acts again; warning toast exactly ×1 in total |
| 3.12 | *Each fleet keeps its own notice* | two fleets; A confirmed; switch to B; B commits warned (2000/50000); read answers both burning; switch to A | notice present for A (and was present for B before the switch); warning toast ×2 |
| 3.13 | *A later commit by the same fleet replaces the earlier notice* | confirmed; click Burn; `answerOrder(1, orderResponse(burning(…, 5000, 80000), 'absent'))`; then answer the new read with burning 1000/61000 | notice absent at the second acceptance and still absent after that read; warning toast ×1 |
| 3.14 | *A second warned commit by the same fleet…* | confirmed; click Burn; `answerOrder(1, …5000/80000, true)`; answer the new read 5000/80000; `reconnect()`, answer `parked` | notice present at the second acceptance with warning toast ×2; present after the second order's read; absent after the last |
| 3.15 | *A rejected or failed commit…* | confirmed; click Burn; `it.each`: `rejectOrder(1, CAP_ERROR)` / `rejectOrder(1, new Error('API Error: 500 …'))` | `toast.error` ×1; exactly one `commit-stranding-notice` element, present; warning toast ×1; no new `listMine` call from the rejection |
| 3.16 | *A response without the stranding field…* | `it.each` over `'absent'` and `false`: base with that response, answer the read burning. **Control leg, same test:** a second commit by the same fleet, warned, shows the notice | notice absent and warning toast not called through the unwarned commit and its read; `toast.success` ×1 for it; the control leg then shows the notice |
| 3.17 | *The notice is advisory and distinct…* | `preview` mock resolves `strandingWarning: true`; confirmed; then cut drive as 3.5 | `preview-stranding` and the notice are two different elements, both present; the notice has no `role`, no live-region ancestor, no `button` descendant, no `red`/`rose` class; `burn-button` present and preceding it; `space-announcer` text identical at three points (before the commit, with the notice shown, after the cut drive removed it) |
| 3.18 | *The notice does not depend on the preview* | three rows. No-quote: `preview` rejects from the start. Stale: first resolves, then `preview` rejects and `flush(PREVIEW_REFRESH_MS)`. Not requested: confirmed, then click `mock-select-feat-body-1` again so nothing is selected | each row asserts its preview state (`preview-no-quote`, `preview-stale`, no `preview-*` figure) and the notice present |
| 3.19 | *The notice's copy…* | two rows: body order 1000/61000; point order 5000/80000 answered by a read with a different `worldTime` | text strictly equals the inline string in both; matches `/station/i`, `/lane gate/i`, `/place a different order/i`; no `/\d/`; no `/strand/i` |
| 3.20 | *A reload shows no notice…* | `it.each` over `stranded` true/false: base, answer the read with `withStranded(burning 1000/61000, value)`; assert notice present; `unmount()`; render a new view under the **same** `QueryClient` | after the remount: notice absent; `fleet-stranded-fleet_a` present exactly when `value` is true. Whether the remount requests a read is not asserted; no call is left pending at `unmount()` |

Titles follow the family: `Scenario: <scenario name, verbatim> — <arm>`, with the
task number in a comment above.

## 8. Sequencing

1. **SDET, red phase.** Section 2 first (harness and smoke, green). Then section
   1 in `SpaceCommandPanel.test.tsx` and section 3 in the new file. Prove each
   red is red for the right reason against a stub of §1 and §2 in a scratch
   worktree (`git worktree add`), never by a destructive git command in the
   shared tree (`docs/handoffs/README.md`, Lesson seven). Write
   `surface-commit-stranding-warning-red-coverage.md` and record the red
   manifest (`harness/openspec-red-manifest.sh record`) before the developer
   starts.
2. **Developer.** 4.1 (section 1 green), then 4.2 and 4.3 together (section 3
   green; 3.17-3.19 need both), then 4.4 by diff. Tests are immutable to the
   developer; a test believed wrong is a dispute with the scenario text cited.
3. **Sections 1-4 are one commit**, as `tasks.md` states.
4. Section 5 records, then section 6.

**Untouched and green throughout:** `SystemSpaceView.test.tsx`,
`.burn-preview`, `.render-loop`, `.scan-refetch`, `.scan-settle-announcement`,
`.scan-targets-refetch-on-arrival`, `.sighting-log-mount-ordering`,
`.sighting-log-no-ghost-reasons` (eight files), `FleetActionsPanel.test.tsx`,
`hooks/use-burn-preview.call-site.test.ts`, `hooks/use-fleets*.test.*`, and
every existing test in `SpaceCommandPanel.test.tsx`. None mocks
`./SpaceCommandPanel`, none commits a warned burn, and both new props are
optional, so none can change.

## 9. Gates

Cited from `docs/testing-tiers.md`; commands live there and in
`frontend/CLAUDE.md`'s tier table.

- **Per task:** tier 1, scoped as `frontend/CLAUDE.md`'s "Per task" row says
  (the touched test files, plus the type check).
- **Per commit (task 6.1):** tiers 0 and 1 in full. Run it after section 4, not
  on the red suite.
- **Tier 2:** not applicable; no backend package is touched.
- **Archive gate (6.3-6.5):** tier 4 once with the tree locked, and tier 3 once,
  never concurrently. The journey spec is written after every task is checked.
  It keys on `commit-stranding-notice` inside `preview-panel`; the stranding leg
  runs only if a fixture can arrange a stranding commit, otherwise it is
  recorded untested (task 6.3).

## 10. Risks

1. **Mutation callback order is load-bearing.** The handler must run after
   `useOrder`'s invalidation. That holds only while the report is made from the
   mutate-level `onSuccess`. Moving it into a `useEffect` on mutation state, or
   into `mutateAsync().then`, changes when the query state is read.
2. **The cancelling invalidation is in a file this change does not edit.**
   `use-fleets.ts:44` with the default `cancelRefetch`. 3.2 is its only guard;
   it must assert the new call and the unchanged screen, or it guards nothing.
3. **`SpaceCommandPanel.test.tsx`'s toast mock has no `warning`.** See §5.
4. **`react-hooks` lint (plugin 5.2.0: `rules-of-hooks`, `exhaustive-deps`
   only).** The handler's deps are `[qc]` and nothing else; it must not read
   `acting`, `warnedOrders` or `fleets`, because the panel calls the instance it
   held at click. No `eslint-disable` is needed and none is added. The existing
   `markScanCommitAccepted` closes over `acting?.id`; do not copy it.
5. **Do not memoise the derivation.** `qc.getQueryState` is not a dependency a
   memo can see; a `useMemo` over `[acting, warnedOrders]` would hold the gap
   open after the count moved.
6. **Timers stack reads.** Any time advance can request reads the test did not
   intend (§6.3). Answering a superseded index does nothing and the test then
   waits on a notice that never changes.
7. **The interior mock's `refetch` identity** (§6.1).
8. **Vacuous greens.** 1.3, 3.16 and the absent halves of 1.4 and 3.20 pass
   against today's code. The control legs and asserted GIVENs in §5 and §7 are
   what make them tests (`docs/handoffs/README.md`, Lesson two).
9. **A future-dated departure in a fixture** (5000 while the clock reads about
   1000) is drawn by the real `buildSceneModel`. If it logs or throws, advance
   the fake clock past 5000 before that commit; do not change the instants.
10. **Unmount drops the report.** React Query does not call mutate-level
    callbacks for an unmounted observer. Not reachable today; task 5.2 records
    it for link 2b.
11. **Another session's uncommitted edits are in the tree**
    (`frontend/app/not-found.tsx`, `frontend/lib/firebase.ts`,
    `frontend/lib/firebase.emulator-config.test.ts`). Do not touch, stage or
    revert them.

## 11. Where this contract goes beyond design.md

No edit was made to the change folder. Each item is listed for adjudication.

1. **`readsAtAcceptance` is typed `number | null | undefined`.** Decision 5
   types it `number | null`; Decision 2 and the Risks paragraph say an absent
   query state stores `undefined`, which that type rejects under strict
   TypeScript. The contract keeps the behaviour the cleared text states and
   widens the type.
2. **Mutation retry is off in the harness client.** Decision 11 and task 2.1
   name query retry only. The app default resends a status-less mutation
   failure once, which would make 3.15's unmapped-failure row a two-call
   arrangement.
3. **The notice's margin class is `mt-2`.** Decision 9 names the text treatment
   only.

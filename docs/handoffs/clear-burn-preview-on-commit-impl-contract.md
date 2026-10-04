# clear-burn-preview-on-commit — implementation contract

Architect, implementation kickoff, 2026-10-04. Change validated; adversary CLEAR
at round 2, verdict commit `29f0a6b`. `git diff 29f0a6b -- openspec/specs/system-space-view
openspec/changes/clear-burn-preview-on-commit` was empty when this was written;
nothing under either path was edited to write it. Code read at `987ba60`.
Authority: the delta and `tasks.md` win over this file; this file wins over
`design.md` only on the points listed in §13. Frontend only: no Go work, no wire
change, one developer.

Nothing was run to write this: no vitest, no tsc, no stack. The React Query
facts are the predecessor's, measured for its contract against the installed
`@tanstack/query-core` 5.90.11 (still the installed version; React is 19.2.3)
and carried here by reference
(`surface-commit-stranding-warning-impl-contract.md` §3, via its index). Every
other statement about behaviour is from reading the code and is marked as such
where it bears weight.

## 0. The seam, in one paragraph

Two production files. `SpaceCommandPanel.tsx` adds the click-time selection key
to the accepted-commit payload and, from one new boolean prop, renders a static
statement, disables Burn and describes it. `SystemSpaceView.tsx` widens the
per-fleet record from warned orders to every accepted commit, derives "is that
order still live" once, above the preview flag, and reads it twice: the
stranding notice (with `warned`) and the committed selection (with key
equality). The committed selection is one more term in `previewWanted` and one
more prop. Two test files are edited, none is created at tier 1.

## 1. `SpaceCommandPanel.tsx` (tasks 5.1, 5.2)

### 1.1 Payload type and prop

```ts
export interface AcceptedBurnCommit {
  fleetId: string
  departMs: number | null
  arriveMs: number | null
  strandingWarning: boolean
  /** selectionKey() of the selection the command was invoked for, captured at click. */
  selectionKey: string
}

// added to SpaceCommandPanelProps, optional
/** True while the selection is the acting fleet's committed selection. */
selectionCommitted?: boolean      // destructured with default `false`
```

The field is **required** on the type (a payload without it is a bug, not a
variant). The type stays exported from this file and from nowhere else.

### 1.2 Copy constant

Module scope, directly below `COMMIT_STRANDING_TOAST_COPY`, **not exported**:

```ts
const SELECTION_COMMITTED_STATEMENT_COPY =
  'A burn order is committed to this target, so Burn is unavailable for it. Select another target to change course.'
```

Tests carry that literal as their own `const STATEMENT_COPY` and never import
it, so an edit of the production string fails them. One string for a body, a
lane gate and a point.

### 1.3 The click-time capture (5.1)

In `commitBurn`, after `if (!burnGuard.claim()) return` and beside
`const quoted = currentQuote`:

```ts
const committedKey = selectionKey(selection)
```

and the existing `onCommitAccepted?.({...})` call gains `selectionKey: committedKey`
as its last property. `selectionKey` is added to the existing import from
`./space-selection`. Nothing else in `onSuccess`, `onError` or `onSettled`
changes; no early return is added to `commitBurn`.

### 1.4 The statement, the disabled term, the description (5.2)

```ts
const statementId = useId()          // with the panel's other hooks; `useId` joins the `react` import
const burnAvailable = !!selection && canvasAvailable && !!fleet && !mineRunning && !selectionCommitted
```

```tsx
{selectionCommitted && (
  <p
    id={statementId}
    data-testid="selection-committed-statement"
    className="mt-1 text-[11px] text-zinc-500"
  >
    {SELECTION_COMMITTED_STATEMENT_COPY}
  </p>
)}

<Button
  type="button"
  data-testid="burn-button"
  color="dark/zinc"
  className="mt-2 w-full"
  disabled={!selection || !canvasAvailable || !fleet || mineRunning || selectionCommitted}
  aria-describedby={selectionCommitted ? statementId : undefined}
  onClick={commitBurn}
>
```

- The statement is rendered from the prop **alone**: no `selection`, `fleet`,
  `canvasAvailable`, `preview` or `commit` term.
- No `role`, no `aria-live`, no `tabIndex`, no ref, no focus call, no button
  inside it.
- The panel adds no term to the quote block, `preview-no-quote`,
  `preview-stale`, `preview-retry`, the success toast, the warning toast, the
  drift notice, the stranding notice or the guard. `burn-uncapped-label`
  follows `burnAvailable` and takes no term of its own.
- `components/catalyst/button.tsx` spreads unknown props onto
  `Headless.Button` (read at `:198`, `:218`), so `aria-describedby` needs no
  Catalyst edit.

### 1.5 DOM order in the committed render

Children of `preview-panel`, in document order. Bracketed rows are absent in
the view's committed render because the view's flag disables the preview hook
(its outputs are `null`/`false`); the panel does not suppress them itself, so
a panel test that passes preview props with `selectionCommitted: true` still
sees them.

| # | Element | Present when |
| --- | --- | --- |
| 1 | `Course` label | always |
| 2 | `canvas-required-notice` | canvas unavailable |
| 3 | `selection-facts` | a selection |
| 4 | `gate-facts` | the selection is a gate |
| [5] | quote `dl`, `preview-affordable`, `preview-stranding` | `preview` prop non-null |
| [6] | `preview-no-quote`, `preview-stale`, `preview-retry` | their props |
| [7] | `burn-uncapped-label` | never with the statement (`burnAvailable` is false) |
| 8 | **`selection-committed-statement`** | `selectionCommitted` |
| 9 | `burn-button` | always |
| 10 | `commit-stranding-notice` | `commitStrandingNotice` |
| 11 | `commit-drift-notice` | the panel's own `commit` state differs from the quote |
| 12 | `fleet-cmd-jump-<id>` | `fleet.laneId` |

The statement is the JSX sibling immediately before the Burn `<Button>` and
immediately after the `burn-uncapped-label` block. Rows 10 and 11 are not moved.

## 2. `SystemSpaceView.tsx` (tasks 5.3, 5.4)

### 2.1 The record (replaces `WarnedOrder`, `:244-250`, and the state at `:275`)

```ts
interface CommittedOrder {
  departMs: number | null
  arriveMs: number | null
  /** own-fleets dataUpdateCount at acceptance; null when the read the commit
   *  started had already answered; undefined only when the query has no state */
  readsAtAcceptance: number | null | undefined
  /** selectionKey of the selection the command was invoked for */
  selectionKey: string
  warned: boolean
}
const [committedOrders, setCommittedOrders] = useState<Record<string, CommittedOrder>>({})
```

`WarnedOrder`, `warnedOrders` and `setWarnedOrders` cease to exist in the same
commit. No second map.

### 2.2 The handler (`:347-367`)

```ts
const handleCommitAccepted = useCallback(
  (commit: AcceptedBurnCommit) => {
    const state = qc.getQueryState(queryKeys.fleets.mine())
    const answered = state?.fetchStatus === 'idle' && state.status === 'success'
    const readsAtAcceptance = answered ? null : state?.dataUpdateCount
    setCommittedOrders((current) => ({
      ...current,
      [commit.fleetId]: {
        departMs: commit.departMs,
        arriveMs: commit.arriveMs,
        readsAtAcceptance,
        selectionKey: commit.selectionKey,
        warned: commit.strandingWarning,
      },
    }))
  },
  [qc],
)
```

- The `if (!commit.strandingWarning) { ...delete... return }` branch is deleted.
- **No branch at all**: not on `strandingWarning`, not on the incoming key
  equalling the stored one, not on the fleet being the acting fleet.
- No cache operation (`setQueryData`, `removeQueries`, `invalidateQueries`,
  `cancelQueries`) in the handler.
- Query state is read synchronously in the handler body, outside the updater.
- Deps stay `[qc]`. It must not read `acting`, `selection` or `committedOrders`.
- The stored-value table of the predecessor's contract §2.2 is unchanged,
  including `undefined` when the query has no state (RULING 9).

### 2.3 The derivation: placement and exact shape

The block at `:780-792` is **deleted from there** and written directly above
`const previewWanted` (`:773`), below `dockedAtTarget` (`:771-772`):

```ts
const order = acting ? committedOrders[acting.id] : undefined
const fleetReadCount = qc.getQueryState(queryKeys.fleets.mine())?.dataUpdateCount
const awaitingRead = !!order && order.readsAtAcceptance !== null && fleetReadCount === order.readsAtAcceptance
const actingBurn = acting?.state?.Mode === 0 ? acting.state.Burn : null
const stillRunning =
  !!order && !!actingBurn && order.departMs !== null && order.arriveMs !== null &&
  actingBurn.DepartMs === order.departMs && actingBurn.ArriveMs === order.arriveMs
const orderLive = awaitingRead || stillRunning
const commitStrandingNotice = orderLive && !!order && order.warned
const selectionCommitted = orderLive && !!order && selectionKey(selection) === order.selectionKey
const previewWanted = !!acting && !acting.jump && !mineRunning && !dockedAtTarget && !selectionCommitted
```

- Plain `const` expressions in the render body. No `useMemo` (a memo cannot see
  `getQueryState`), no effect, no timer, no ref, no `setState`.
- No term reads `worldTime`, `serverWorldTime`, `clock`, `fleets.worldTime`,
  `acting.worldTime`, `fleets.isError`, `errorUpdateCount` or `Burn.Target`.
- The key comparison has no kind branch and does not read `selection.bodyId`.
- `selectionKey` joins the existing import from `./space-selection` (`:63`).
- `order` collides with nothing in this file (checked: no other binding of that
  name).

### 2.4 Props passed

`<SpaceCommandPanel … commitStrandingNotice={commitStrandingNotice} selectionCommitted={selectionCommitted} />`.
Always passed as a boolean, never `undefined`.

### 2.5 What stays byte-identical in this file (task 5.5)

| Lines (at `987ba60`) | What | Cause of the fence |
| --- | --- | --- |
| `:193`, `:592` | the two `wallMsUntil` call sites | U2 of `add-vitals-strip-qa-reverify.md`: neither reverted, retro-specced nor built on (proposal, Out of scope) |
| `:624-677` | the landed-resolution effect | the Silence paragraph: a landing that ends the state must still be announced by the unedited effect (3.8, 3.17) |
| `:774-778` | the `useBurnPreview` call | the resume rule is inherited by construction; only the flag's value changes |
| `:779` | `currentQuote` | the cap derives from the current quote, unchanged |
| `:369-388` | the scan `committedPending` block | not the model for this record and not this link's |
| `:572-612` | the three refetch rules | no trigger is added (*Realtime Refetch Rules* takes no delta) |

`previewWanted` changes by exactly one term.

## 3. Files: what may be edited, what may not, and why

**May be edited**

| File | By | What |
| --- | --- | --- |
| `frontend/components/space/SpaceCommandPanel.tsx` | nextjs-dev | §1 |
| `frontend/components/space/SystemSpaceView.tsx` | nextjs-dev | §2 |
| `frontend/components/space/SpaceCommandPanel.test.tsx` | SDET | §6: new `describe` blocks at the end; `selectionKey` added to the two exact-equality assertions at `:778-783` and `:802-807`; nothing else |
| `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` | SDET | §7-§9: header comment, harness additions, the seven re-arrangements, one new `describe` block. The file keeps its name (design Decision 12) |
| `frontend/e2e/tests/committed-selection-journey.spec.ts` | SDET | new, task 7.3 only, written after every other task is checked |
| the four records of section 6 | nextjs-dev drafts, orchestrator fills the commit hash | §10 |

**May not be edited**

| File or area | Cause |
| --- | --- |
| `frontend/hooks/use-fleets.ts` | the gap rule rests on `useOrder`'s hook-level invalidation (`:44`, `:72`) running, with cancellation, before the panel's mutate-level callback. Task 3.3 is its only guard. `useOrder` is not lifted (Decision 10): lifting moves both toasts, the guard and the drift figures and rewrites 46 panel tests of a component link 4 retires |
| `frontend/hooks/use-burn-preview.ts` | it is already generic over its flag (`:55`, `:84-91`); the resume rule and "no retry while withheld" are inherited unedited. Its header comment is left listing three suppression inputs (design Risks) |
| `frontend/components/space/space-selection.ts` | `selectionKey` is reused as it stands; it is also the preview's cache key, so a change here changes two things |
| `frontend/lib/types/**`, `frontend/lib/services/**`, `frontend/lib/query-keys.ts`, everything under `backend/` | chain doc, "What every link must not do": every needed value is already served and the selection never leaves the client |
| `frontend/components/catalyst/**` | the description is a prop the existing `Button` already forwards |
| `frontend/components/space/FleetActionsPanel.tsx` | cut drive and stop are not edited; their existing invalidation is what ends the state |
| `SystemSpaceView.burn-preview.test.tsx` and the other seven `SystemSpaceView*.test.tsx` files, `FleetActionsPanel.test.tsx`, `hooks/use-burn-preview*.test.*`, `hooks/use-fleets*.test.*` | task 7.1 is a verifying run with **no edit**. `.burn-preview` mocks `useMyFleets`, so an accepted commit there holds the committed state until unmount; a red there is a finding, not a test to repair |
| every existing test in `SpaceCommandPanel.test.tsx` other than the two assertions above | their scenarios are unchanged; both new props are optional |
| existing `frontend/e2e/tests/*.spec.ts` and `frontend/e2e/helpers/space-view.ts` | the analysis and adversary round 1 read every `burn-button` use and found none that clicks Burn twice on a running order's selection or reads a `preview-*` element between a Burn and the next selection; I re-read them and agree (§12 item 9 is the one to watch) |
| palette, type scale, any colour class not already in the panel | the statement reuses `mt-1 text-[11px] text-zinc-500`, already in this file |
| `openspec/changes/clear-burn-preview-on-commit/**`, `openspec/specs/**` | an edit expires the adversary verdict (`docs/handoffs/README.md`, "Verdict expiry is a diff") |

## 4. React Query facts relied on

The predecessor's five (its contract §3) unchanged. Two more, both **by code
reading, not measured**; the SDET's scratch proof (§11 step 1) is the first
measurement of each:

6. `invalidateFleet` invalidates `['fleets','mine']`, `['fleets','detail',id]`
   and the interior key. The preview key is
   `['fleets','burn-preview',fleetId,selectionKey]`; neither invalidated key is
   a prefix of it, so an acceptance causes no preview request by itself.
7. When the preview hook's flag goes false while a request for that key is
   pending, the hook's effect cancels and removes the entry; the pending
   service promise is abandoned and its eventual answer is dropped. When the
   flag returns to true the observer builds an empty entry and fetches in that
   render (the path `SystemSpaceView.burn-preview.test.tsx` already exercises
   for the mine and dock withholdings).

## 5. Test ids and controls

New: `selection-committed-statement`.

Existing, used by the new tests: `burn-button`, `burn-uncapped-label`,
`selection-facts`, `canvas-required-notice`, the six quote elements
(`preview-arrival`, `preview-deltav`, `preview-fuel`, `preview-fuel-ceiling`,
`preview-affordable`, `preview-stranding`), `preview-no-quote`, `preview-stale`,
`preview-retry`, `commit-stranding-notice`, `commit-drift-notice`,
`space-announcer`, `space-world-clock` (`data-world-time`), `space-fleets-error`,
`space-fleets-retry`, `fleet-row-<id>` (`data-active`), `fleet-row-eta-<id>`,
`fleet-cmd-cut-drive-<id>`, `fleet-cmd-stop-<id>`, `space-canvas-region`
(`data-selection`), and the stage mock's `mock-select-*` triggers including the
new `mock-select-point-2`.

## 6. `SpaceCommandPanel.test.tsx` (section 2)

The file's `useOrder` mock, `panel(over)`, `panelElement(over)`,
`holdResponse()` and `acceptedFleet(over)` are used as they are. New props go
through the `Record<string, unknown>` spread, so the file type-checks before
section 5; do not import `AcceptedBurnCommit` or any new symbol. The copy is a
local `const STATEMENT_COPY` holding the §1.2 literal. Additions go in new
`describe` blocks at the end, titled `Scenario: <name, verbatim> — <arm>`.

| Task | Arrangement | Closing assertion | Before 5.x |
| --- | --- | --- | --- |
| 2.1 a | one test, `rerender` through `selectionCommitted` true, false, omitted, true, each with `preview: null, currentQuote: null` (so the label is observable) | true: statement present; `burn-button` natively `disabled`; a `userEvent.click` on it leaves `order.mutate` uncalled; no `burn-uncapped-label`; the control's `aria-describedby` is non-empty, equals the statement's `id`, and `document.getElementById` of it is the statement. False and omitted: statement absent, control enabled, label present, `hasAttribute('aria-describedby')` false | assertion-red (the true legs); the false and omitted legs are the control |
| 2.1 b | `selectionCommitted: true, canvasAvailable: false, preview: null, currentQuote: null` | `canvas-required-notice` present; statement present; no label; description is the statement | assertion-red |
| 2.2 new | `it.each` over the invoked selection `{ bodyId: 'feat-body-3' }` and `{ point: { x: 30, y: 0, z: -10 } }`: click Burn, `rerender` with `selection: { bodyId: 'feat-body-9' }`, then `held.get().onSuccess(acceptedFleet({}))` | `onCommitAccepted` called once with exactly `{ fleetId: 'fleet_1', departMs: T0 + 1000, arriveMs: T0 + 61000, strandingWarning: false, selectionKey: 'body:feat-body-3' }` (point row: `'point:30,0,-10'`). The key is a literal in the test, not a call to `selectionKey` | assertion-red |
| 2.2 edits | the assertion at `:778-783` and the one at `:802-807` each gain `selectionKey: 'body:feat-body-3'` as a last property; no other character changes | unchanged otherwise | **assertion-red until 5.1** (three cases: one, and two rows) |
| 2.3 a | `it.each` over a body, a body with matching `gateFacts`, and a point, `selectionCommitted: true` | text strictly equals `STATEMENT_COPY`; no `/\d/`; matches `/burn is unavailable/i` and `/select another target/i`; does not contain the selected body id; `selection-facts` precedes it and it precedes `burn-button` (`compareDocumentPosition`); no `role` and no `aria-live` attribute; `closest('[aria-live],[role="alert"],[role="status"],[role="log"],[role="timer"],[role="marquee"]')` is null; no `button` descendant | assertion-red |
| 2.3 b | twice, each in its own render: prop omitted, click Burn, place a response, then `rerender` with the prop true. First: `FLEET`, `acceptedFleet({})`. Second: a fleet with another id and a burning state, a response with other instants and `strandingWarning: true` | the statement's text is identical in both and equals `STATEMENT_COPY` | assertion-red |
| 2.3 c | prop omitted; click Burn; `held.get().onSuccess(acceptedFleet({ strandingWarning: true }))` (its arrival differs from `QUOTE`'s, so the drift notice renders); then `rerender` with `selectionCommitted: true, commitStrandingNotice: true` | `commit-stranding-notice` and `commit-drift-notice` both present (asserted first), and the statement precedes each | assertion-red |

In 2.3 b and c the Burn click must come **before** the prop is true: with the
prop true the control is disabled and the mocked commit cannot be produced.

## 7. `SystemSpaceView.stranding-notice.test.tsx`: the harness (task 1.1)

Hygiene, green when written. The harness stays what it is: real
`SystemSpaceView`, `SpaceCommandPanel`, `FleetActionsPanel`, all of
`@/hooks/use-fleets`, `@/hooks/use-burn-preview`; mocked `fleetService` settled
by index; fake timers; one stable interior object. There is still no
`vi.mock('@/hooks/use-fleets')`. The header comment gains one paragraph saying
the file now covers both readers of the order record and naming this change.

### 7.1 Additions (existing helpers keep their bodies)

| Addition | Shape |
| --- | --- |
| Second point trigger | in the stage mock: `trigger('point-2', { point: { x: -12, y: 6, z: 22 } })`, test id `mock-select-point-2` |
| Which point is selected | the stage mock's root gains `'data-selection-point'`: `` `${x},${y},${z}` `` when the selection is a point, else `''`. `data-selection` keeps its value (`'point'` for either), so predecessor assertions on it are untouched. `const selectedPoint = () => …getAttribute('data-selection-point')` |
| Constants | `POINT_2 = { X: -12, Y: 6, Z: 22 }`; `STATEMENT_COPY` (the §1.2 literal); `QUOTE_IDS` (the six of §5) |
| Readers | `statement()` = `screen.queryByTestId('selection-committed-statement')`; `burn()` = the `burn-button` as `HTMLButtonElement`; `quoteGone()` = none of `QUOTE_IDS` rendered; `orderCalls()` = `mocks.order.mock.calls.length` |
| **Per-fleet preview count** | `previewCalls(fleetId?: string, target?: string \| { X: number; Y: number; Z: number })` filters `mocks.preview.mock.calls` (`[fleetId, request]`): by `call[0] === fleetId` when given; by `request.bodyId === target` for a string target; by deep equality of `request.point` for a point target. `P(f, t)` below is `previewCalls(f, t).length` |
| **Deferred preview** | `pending` gains `preview: []` and `Service` gains `'preview'`. `holdPreview()` installs, from that call on, `mocks.preview.mockImplementation(() => { const d = deferred(); pending.preview.push(d); return d.promise })`. `answerPreview(index, quote = QUOTE)` and `rejectPreview(index, error)` go through `settle`, so they log `preview#n answer`. The default stays `mockResolvedValue(QUOTE)` from `beforeEach`; only a test that calls `holdPreview()` holds |
| **Rejecting a read by index** | the existing `rejectListMine(index, UNMAPPED_ERROR)`. The index is always `lastListMine()`, read **after** asserting the trigger added a call (rule 2 below) |
| A dated fleet | `datedAt(fleet, worldTime)` returns `{ ...fleet, worldTime }` (`fleetOf` pins every fleet at `W0`; task 3.4 needs the fleet's own stamp past the arrival) |
| Unwarned base | `commitUnwarned(opts)` = `commit({ warning: 'absent', ...opts })`. `commitUnwarnedAndConfirm(opts)` = that, then `answerListMine(1, [opts.ordered ?? burning('fleet_a', 1000, 61000)], W0)`, asserting **nothing** about the notice or the statement (so guard tests can use it) |
| A second arrangement in one test | `resetHarness()`: `cleanup()`, `settled = []`, `holdCalls()`, then `mockClear()` on `mocks.listMine`, `mocks.order`, `mocks.preview` and the four toast mocks. Used only by 3.8 |

`commit()` and `commitAndConfirm()` are not edited (the predecessor's 24 tests
use them, and `commitAndConfirm` asserts the notice, which only a warned commit
shows).

One smoke test is added beside the predecessor's: `mock-select-point-2` selects
a point whose `selectedPoint()` is `'-12,6,22'` and sends one preview request
with `{ point: POINT_2 }`; `holdPreview()` makes the next selection's request
pending and `answerPreview(0)` shows its figures; `P('fleet_a')` and
`P('fleet_b')` count separately on a two-fleet mount. Status `already-green`.

### 7.2 Rules (the predecessor's five stand; four are added)

1-5. As the predecessor's contract §6.2: the `settled` log is asserted before
the closing assertion; a trigger is asserted to have added a `listMine` call
before that call is answered; the live call is the last one; no test calls the
query client for the own-fleets read; every "removed" is preceded in the same
test by an asserted "present".

6. **No section-3 test mocks `useMyFleets`, hand-sets `selectionCommitted`, or
   calls `qc.setQueryData`/`removeQueries` on a preview key.**
7. **A preview count is always per fleet and per target.** The unfiltered
   `mocks.preview` count mixes fleets and selections and is not asserted.
8. **A count window is named by its two ends.** "No request since X" is
   asserted as an absolute `P(…)` where the arrangement makes it deterministic
   (no time elapsed before X), otherwise as a snapshot taken immediately before
   X compared immediately after the step, with the elapsed fake time stated in
   the assertion message.
9. **Rule 5 does not apply to the three guards** (3.15, 3.17, 3.18): they are
   required to be green before section 5 and so cannot assert the statement
   present. See §12 item 3 for what makes them tests.

### 7.3 Time

As the predecessor's §6.3. Two facts matter more here than they did there:

- `PREVIEW_REFRESH_MS` is 10 000 and `BOARD_POLL_MS` is 20 000. **Any step that
  advances time by 10 s or more, while a preview is enabled, sends preview
  requests the step did not intend.** `poll()` is a 20 s advance.
- Zero fake time passes in `click`, `reconnect()`, a click on
  `space-fleets-retry`, and every `answer*`/`reject*` helper.

## 8. The seven re-arranged predecessor tests (tasks 4.1, 4.2)

Each keeps its title, its scenario and every assertion. After the
re-arrangement each is **green against today's code and stays green through
section 5** (status `already-green`, a guard). Left as they are, all seven go
red at 5.4, which is why they are repaired first. The SDET's red-coverage file
lists, per test, the lines inserted or moved.

| Task | Test (predecessor numbering) | Re-arrangement |
| --- | --- | --- |
| 4.1 | 3.13 later unwarned commit | insert `await click(\`mock-select-${HOST}\`)` before the second `click('burn-button')`; the second response's fixture names `HOST` as its target |
| 4.1 | 3.14 second warned commit | the same insertion; the second order's read fixture names `HOST` |
| 4.1 | 3.15 rejected commit, two rows | the same insertion. The cap row then has a current quote on `HOST` (the default preview mock resolves), which is what makes its re-quote reachable |
| 4.1 | 3.16 control leg, two rows | the same insertion before the control leg's `click('burn-button')` |
| 4.2 | 3.17 preview's own stranding line beside the notice | insert `await click(\`mock-select-${HOST}\`)` after the confirming read and before the `preview-stranding` assertions (the mock still resolves `strandingWarning: true`, now for `HOST`) |
| 4.2 | 3.18 no-quote | insert the same click after `commit()` and before the `preview-no-quote` assertion (the mock still rejects, now for `HOST`) |
| 4.2 | 3.18 stale | **not an insertion; see §12 item 1.** New order of steps: mount, answer, select `OTHER`, assert `preview-deltav` (the existing GIVEN), click Burn, `answerOrder(0, warned)`, select `HOST`, assert `preview-deltav` for it, then `mocks.preview.mockRejectedValue(...)`, `flush(PREVIEW_REFRESH_MS)`, assert `preview-stale` (the existing GIVEN), the notice, and `preview-stale` again. All four original assertions survive; the failing refresh moves after the commit. Elapsed fake time is 10 s, so no baseline poll fires |

## 9. Section 3, task by task

All in one new `describe('the committed selection (clear-burn-preview-on-commit section 3)')`
at the end of the file, one nested `describe` per task, titles
`Scenario: <name, verbatim> — <arm>` with the task number in a comment.
`fleet_a` commits toward `OTHER` (`feat-body-1`) unless stated; "Y" is `HOST`
(`feat-body-0`). Instants: first order 1000/61000; a second order by the same
fleet 5000/80000; fleet B's order 2000/50000. Accepting responses are unwarned
(`'absent'`) unless the task says otherwise. "Disabled"/"enabled" is
`burn().disabled`. Every row asserts its `settled` log.

| Task | Arrangement | Closing assertions | Before 5.x |
| --- | --- | --- | --- |
| 3.1 | Inline the base (not `commit()`), so that between the selection and the Burn the test asserts `preview-deltav` shown. Snapshot `P(a, OTHER)` (it is 1) **before** `answerOrder(0, …)`. Then `answerListMine(1, [burning])`; `flush(2 * PREVIEW_REFRESH_MS)` (20 s: two refresh intervals and exactly one baseline poll; assert `listMine` gained a call); answer it with the same burn | `quoteGone()`; statement present with `STATEMENT_COPY`; `selection()` is `OTHER`; disabled; none of `burn-uncapped-label`, `preview-no-quote`, `preview-stale`, `preview-retry`; `P(a, OTHER)` still 1 at the end (window: before the acceptance to after the poll's answer, 20 s); a click on Burn leaves `orderCalls()` at 1; `toast.success` ×1 | red |
| 3.2 | `commitUnwarned()`; assert `fleet-row-eta-fleet_a` absent (the cached read is parked) and `pending.listMine.length` is 2 | statement present; `quoteGone()`; disabled; a click leaves `orderCalls()` at 1; `P(a, OTHER)` is 1 | red |
| 3.3 | The predecessor's 3.2 arrangement with an unwarned response: answer #0, `reconnect()` (#1 held), select, Burn, `answerOrder(0, …)` | `listMine` calls went 2 to 3 at the acceptance; after `answerListMine(1, [parked])` `document.body.innerHTML` is unchanged, statement present, `P(a, OTHER)` 1; after `answerListMine(2, [burning])` statement present, `P` 1 | red |
| 3.4 | `commitUnwarnedAndConfirm()`; `flush(61_000)`, answering nothing. Then `answerListMine(lastListMine(), [datedAt(burning('fleet_a', 1000, 61000), 99_999)], 99_999)` | after the advance: `data-world-time` > 61000 (asserted GIVEN), `listMine` gained calls and none answered, statement present, disabled, `P(a, OTHER)` 1 (window: 61 s, six refresh intervals). After the dated answer: statement present, `P` 1 | red |
| 3.5 | `commitUnwarnedAndConfirm()`; assert statement present; **`holdPreview()`**; click `fleet-cmd-cut-drive-fleet_a`; `answerCutDrive(0, drifting)`; assert statement still present and `P` 1; `answerListMine(lastListMine(), [drifting('fleet_a')])`. Then click Burn; `answerOrder(1, burning('fleet_a', 5000, 80000))` | at the drifting answer: statement absent, enabled, `P(a, OTHER)` 2 and `pending.preview.length` 1 (one request, sent at that answer, pending), `quoteGone()`, no `preview-stale`, `burn-uncapped-label` present. The Burn click: `'maxFuelTons' in mocks.order.mock.calls[1][1]` is false. After the second acceptance: statement present, disabled, `P(a, OTHER)` still 2, `selection()` unchanged | red |
| 3.6 | `it.each` over the refreshed read `burning('fleet_a', 70000, 90000)` and `pointParked('fleet_a')`: `commitUnwarnedAndConfirm()`; click `fleet-cmd-stop-fleet_a`; `answerStop(0, read())`; answer the new read with it | statement present before that answer, absent after; enabled; `P(a, OTHER)` 2 | red |
| 3.7 | `it.each` over four reads: `pointParked`; `burning(…, 5000, 80000, HOST)`; `burning(…, 5000, 61000, OTHER)`; `burning(…, 1000, 90000, OTHER)`. `commitUnwarnedAndConfirm()`; `poll()`; assert a call was added, statement present and `P` still 1 (20 s withheld); answer it with the row | statement absent; enabled; `P(a, OTHER)` 2. No row asserts figures (the point row must not) | red |
| 3.8 | **Reference phase first:** mount, `answerListMine(0, [attached('fleet_a', OTHER)])`, select `OTHER`, record `{ disabled: burn().disabled, label: has('burn-uncapped-label') }`, then `resetHarness()`. Then `commitUnwarnedAndConfirm()`; `reconnect()`; read the announcer (`''`); `answerListMine(2, [attached('fleet_a', OTHER)])` | statement present before, absent after; `P(a, OTHER)` 1; `burn().disabled` and the label's presence equal the reference, and nothing else is asserted about them; announcer text is exactly `Burn complete — arrived and attached to feat-body-1.` | red |
| 3.9 | `commitUnwarned()`; `answerListMine(1, [attached('fleet_a', OTHER)])` | statement present before that answer, absent after; `P(a, OTHER)` 1 | red |
| 3.10 | One walk; **every trigger is zero-time** (see below). `commitUnwarned()`. (1) `rejectListMine(1)`. (2) click `space-fleets-retry`, answer `[burning 1000/61000]`. (3) `reconnect()`, reject. (4) click retry, answer `[drifting('fleet_a')]`. (5) snapshot `p = P(a, OTHER)`; `reconnect()`; reject | (1) statement present, disabled, `space-fleets-error` and `space-fleets-retry` present, none of `preview-no-quote`, `preview-stale`, `preview-retry`, `P` 1. (2) and (3) statement present, `P` 1. (4) statement absent, `P` 2, `preview-deltav` shown. (5) `space-fleets-error` present (GIVEN), statement absent, enabled, `preview-deltav` still shown, `P(a, OTHER)` equals `p` | red |
| 3.11 | `it.each`. **Bodies:** `commitUnwarnedAndConfirm()`; select `HOST`; then select `OTHER`. **Points:** `commitUnwarned({ select: 'mock-select-point', ordered: burningToPoint('fleet_a', 1000, 61000) })`; then click `mock-select-point-2` | Bodies: with `HOST`, `P(a, HOST)` 1, `preview-deltav` shown, enabled, no statement; back on `OTHER`, statement present, disabled, `P(a, OTHER)` 1. Points: after the commit, statement present and `P(a, POINT)` 1; with point 2, `selectedPoint()` is `'-12,6,22'`, `P(a, POINT_2)` 1, enabled, no statement | red |
| 3.12 | `it.each` over the second response's warning, `true` and `'absent'`. `commitUnwarnedAndConfirm()`; select `HOST`; click Burn; `answerOrder(1, orderResponse(burning('fleet_a', 5000, 80000, HOST), row))`. Then, **with `listMine#2` still unanswered** (the last answered read reports 1000/61000), select `OTHER`. Then `answerListMine(2, [burning('fleet_a', 1000, 61000)])` | at the second acceptance: statement present, disabled, `P(a, HOST)` 1. With `OTHER` selected in the gap: no statement, enabled, `P(a, OTHER)` 2, `preview-deltav` shown. After the answer: the same three | red |
| 3.13 | mount; answer #0; select `OTHER`; click Burn (pending); select `HOST`; `answerOrder(0, burning)`; `answerListMine(1, [burning])`; select `OTHER` | after the response: `preview-deltav` shown, enabled, no statement, `P(a, HOST)` 1. With `OTHER` again: statement present, disabled | red |
| 3.14 | `it.each`, two fleets, `listMine#0` answers `[parked a, parked b]`, selection `OTHER` kept throughout. **Row one:** A's Burn, `answerOrder(0, A burning)`, `answerListMine(1, [A burning, parked b])`; click `fleet-row-fleet_b`; click `fleet-row-fleet_a`; click `fleet-row-fleet_b`, click Burn (assert `mocks.order.mock.calls[1][0]` is `'fleet_b'`), `answerOrder(1, burning('fleet_b', 2000, 50000))`, `answerListMine(2, [A burning, B burning])`; click row a; click row b. **Row two:** A's Burn (pending); click `fleet-row-fleet_b`; assert B acting, `preview-deltav` shown and `P(b)` 1; snapshot `before = P(b)`; `answerOrder(0, A burning)`; then `answerListMine(1, [A burning, parked b])`; click row a | Shared: while B acts (before any B commit) `P(b, OTHER)` 1, enabled, no statement; with A acting again, statement present and `P(a, OTHER)` 1. Row one: the second switch to B sends B a fresh request (the entry was dropped when B stopped acting), so snapshot `pb = P(b, OTHER)` after it and before `answerOrder(1, …)`; after B's commit and the read: statement present and disabled with B acting, with A acting, and with B acting again; `P(a, OTHER)` 1 throughout and `P(b, OTHER)` equal to `pb` at each. Row two alone, immediately after `answerOrder(0, …)` and before the read is answered: `P(b)` equals `before`, `preview-deltav` still shown, enabled, no statement | red |
| 3.15 (guard) | `it.each` over `CAP_ERROR` and `UNMAPPED_ERROR`: mount, answer, select `OTHER`, assert `preview-deltav`, click Burn, `rejectOrder(0, row)` | no statement; enabled; cap row also `P(a, OTHER)` 2 and `preview-deltav` shown | **already-green** |
| 3.16 | `commitUnwarnedAndConfirm()`; assert statement; select `HOST`; click Burn; `rejectOrder(1, CAP_ERROR)`; select `OTHER` | statement present, disabled | red |
| 3.17 (guard) | mount, answer, select `OTHER`; read the announcer; Burn, `answerOrder`, `answerListMine(1, [burning])`; read it; cut drive as 3.5 with the default preview mock, answered `[drifting]`; read it | the three readings are identical. Nothing is asserted about the statement | **already-green** |
| 3.18 (guard) | `it.each`. **Opened on a burn:** mount, `answerListMine(0, [burning('fleet_a', 1000, 61000)])`, select `OTHER`. **Remount:** `commitUnwarnedAndConfirm()`; assert no read pending; snapshot `P(a, OTHER)`; `cleanup()`; `renderView()` on the same client; `flush(0)`; select `OTHER` | each: one preview request for the selection since it was made (row one `P` 1; row two snapshot + 1), enabled, no statement | **already-green** |
| 3.19 | `commit()` (warned, the default). Then select `HOST`. Then click Burn; `answerOrder(1, orderResponse(burning('fleet_a', 5000, 80000, HOST), 'absent'))`, leaving the new read unanswered | after the first acceptance: notice and statement both present. With `HOST`: notice present, statement absent. After the second acceptance, before any read answers: statement present, notice absent | red |

Scenario 1's canvas-unavailable clause is 2.1 b; scenario 21 has no tier-1 test.

### 9.1 The count window in 3.10

Step 5 asserts that the failed read **caused** no preview request. After step
4 the resumed preview is on its 10 s refresh interval, so:

- the read in step 5 is caused by `reconnect()`, never by `poll()`. A 20 s
  advance sends two legitimate refresh requests and the assertion can then
  neither pass nor mean anything;
- the snapshot is taken after step 4's answer has been flushed (so the one
  resuming request is already counted) and compared after the reject's own
  `flush(0)`. The window is zero fake milliseconds wide;
- `preview-deltav` must be asserted shown **before** the reject as well as
  after, or "the resumed preview's figures are still shown" is unarranged.

Steps 1 to 3 are also zero-time, so their `P` 1 shows only that the acceptance
and the failures sent nothing at that instant. They do not show withholding
across a refresh interval; 3.1 (20 s) and 3.4 (61 s) do. Do not add a time
advance to 3.10 to make it do both.

### 9.2 The count window in 3.14, row two

The observation is that A's acceptance sends nothing for B. A build that drops
B's cache entry at the acceptance refetches at once, and the auto-resolving
mock re-shows the figures inside the same `settle`, so "figures stay shown"
alone passes that build. Therefore:

- count by fleet (`P('fleet_b')`); the unfiltered count already holds A's
  pre-commit request;
- the window opens only after B's own first request, the one the switch to B
  causes, has been sent **and** has answered (assert `P(b)` 1 and
  `preview-deltav` shown first). Opened earlier, the switch's request is
  counted as the acceptance's;
- the window closes immediately after `answerOrder(0, …)`, before
  `answerListMine(1, …)` and with no time advance;
- the preview mock stays auto-resolving in this task. Tasks.md's alternative
  "(or the preview held on a deferred)" is not used: a held preview shows no
  figures, so the row's other half would be unarrangeable (§12 item 2).

## 10. Task, file, owner

| Task | File | Owner | Before section 5 |
| --- | --- | --- | --- |
| 1.1 | `SystemSpaceView.stranding-notice.test.tsx` (harness, header, smoke) | SDET | already-green |
| 2.1 | `SpaceCommandPanel.test.tsx` | SDET | red |
| 2.2 | `SpaceCommandPanel.test.tsx` (one new test; two edited assertions, three cases) | SDET | red, all of it |
| 2.3 | `SpaceCommandPanel.test.tsx` | SDET | red |
| 3.1-3.14, 3.16, 3.19 | `SystemSpaceView.stranding-notice.test.tsx` | SDET | red |
| 3.15, 3.17, 3.18 | same | SDET | already-green (guards) |
| 4.1 (four tests, six cases) | same | SDET | already-green, and must stay so |
| 4.2 (three tests) | same | SDET | already-green, and must stay so |
| 5.1 | `SpaceCommandPanel.tsx` | nextjs-dev | turns 2.2 green |
| 5.2 | `SpaceCommandPanel.tsx` | nextjs-dev | turns 2.1, 2.3 green |
| 5.3 | `SystemSpaceView.tsx` (record, handler) | nextjs-dev | with 5.4 |
| 5.4 | `SystemSpaceView.tsx` (derivation, flag, prop) | nextjs-dev | turns section 3's red green; 4.x and the guards stay green |
| 5.5 | no file: a diff reading | nextjs-dev | |
| 6.1 | `docs/handoffs/drift-preview-does-not-clear-on-commit.md` | nextjs-dev drafts; orchestrator adds the commit hash | |
| 6.2 | `docs/plans/system-hud/chain.md` | orchestrator (it owns the chain row); nextjs-dev supplies the Taught text | |
| 6.3 | `followup-warned-commit-without-burn-instants.md`, `followup-explain-withheld-burn-command.md` | nextjs-dev | |
| 7.1 | no file: tiers 0 and 1, and the red-manifest verify | nextjs-dev runs; SDET verifies the manifest | |
| 7.2 | QA's matrix | QA | |
| 7.3 | `frontend/e2e/tests/committed-selection-journey.spec.ts` | SDET | written last |
| 7.4, 7.5 | no file: tiers 4 and 3, tree locked | SDET runs, orchestrator holds the lock | |
| 7.6, 7.7 | `openspec/` at archive | orchestrator | |

## 11. Sequencing

1. **SDET, before any production edit**, in this order:
   1. Task 1.1 (harness additions and smoke). The whole file is green.
   2. Tasks 4.1 and 4.2. The whole file is green again, against today's code.
      This is done before any red test is added so the file's green state
      proves the re-arrangements changed no assertion's outcome.
   3. Section 2 in `SpaceCommandPanel.test.tsx`, including the two edited
      assertions.
   4. Section 3.
   5. Prove each red is red for its reason, and each guard and re-arranged
      test stays green, against a stub of §1 and §2 in a scratch worktree
      (`git worktree add`); never by `checkout --`, `restore`, `stash`,
      `reset` or `clean` in this checkout, which another person is using
      (`docs/handoffs/README.md`, Lesson seven). §12 item 3 names the wrong
      builds the guards must be shown to fail.
   6. Write `clear-burn-preview-on-commit-red-coverage.md` and record the red
      manifest for the two test files (`harness/openspec-red-manifest.sh`)
      before the developer starts. The predecessor's manifest covers a
      now-edited file and is not re-verified.
2. **Developer.** 5.1, then 5.2 (section 2 green). Then 5.3 and 5.4 **together**:
   the rename breaks the derivation's compile until both are done. Then 5.5 by
   diff. Tests are immutable to the developer; a test believed wrong is a
   dispute citing the scenario text.
3. **Sections 1 to 5 are one commit** (`tasks.md` header). The red suite is
   never committed on its own.
4. Section 6 records, then section 7.

## 12. Reported problems

None of these blocks the build. Each is a place where the spec or tasks, read
closely, cannot be done as written; each states what this contract did instead,
for adjudication. No workaround below is silent.

1. **Task 4.2's stale row cannot be re-arranged the way the task describes.**
   The task says each of the three tests "selects another body after the
   commit, with the preview mock still carrying … the failing refresh". For the
   stranding line and the no-quote state that works. For the stale state it does
   not: with the mock already rejecting, the other body's first request fails,
   which is a no-quote state, not a stale one. Stale needs a successful first
   quote for the other body and then a failing refresh, so the failing refresh
   and its 10 s advance must move to after the commit. §8 gives that order; all
   four original assertions are kept, but this is a re-ordering, not the
   mechanical insertion RULING 13 counted.
2. **Task 3.14's parenthetical alternative is not usable.** "(or the preview
   held on a deferred)" cannot coexist with "B's preview figures stay shown":
   a held preview shows none. §9.2 uses the request count with an
   auto-resolving mock.
3. **The three guards cannot assert the state they guard.** Tasks.md and
   RULING 13 require 3.15, 3.17 and 3.18 to be green before section 5. 3.17's
   scenario reads the live region "after the acceptance" and "after the cut
   removes the statement", but a test that asserted the statement present at
   the second reading would be red today. As written they assert only absences
   and so have never been observed to fail (`docs/handoffs/README.md`, Lesson
   two). This contract keeps the ruled classification and requires the SDET to
   show each guard red in the scratch worktree against one named wrong build:
   3.15, a panel that reports from `onSettled`; 3.17, a handler that also calls
   `setAnnouncement`; 3.18 row one, a derivation that matches the read's burn
   target; 3.18 row two, a record kept in the query cache. The statement's
   presence at 3.17's second reading is carried by 3.5, which shares the
   arrangement.
4. **Task 3.8 has no reference to compare with unless the test builds one.**
   "Equal to what the docked-at-target state gives them with no commit in the
   history" needs that state observed. §9 builds it as a first phase of the
   same test and resets the harness. And "the landing announcement is made
   once" is observable in jsdom only as the live region's text equalling one
   sentence; a count is not observable.
5. **Task 3.10's first three "no preview request" assertions are weak by
   construction** (§9.1): every step is zero-time. They are kept because the
   scenario states them; the withholding across time is 3.1's and 3.4's.
6. **Scenario 12's "including while a read still reports the first order's
   instants" has two readings**: the cached last read during the second
   order's gap, or a new answer after it. They differ in what else is true (in
   the second, Y is no longer committed either). §9 asserts X in the gap first
   and after that answer second, and asserts Y only at the acceptance.
7. **I was asked to restate "the two count-window cautions you raised for
   tasks 3.10 and 3.14". I found no written record of them** in
   `docs/handoffs/clear-burn-preview-on-commit-*` (panel report, both addenda,
   both adversary rounds, the rulings). Addendum 2's P1 and P4 are the nearest
   text and state the observations, not the windows. §9.1 and §9.2 are derived
   here from the harness's timing; if an earlier wording exists elsewhere it
   should be checked against them.
8. **Nothing at tier 1 can observe scenario 21 (focus) or the real backend's
   instants.** Both are already recorded in design.md (Decision 15, Risks) and
   are restated only so the coverage table marks them `Playwright, deferred`
   and not covered.
9. **One existing journey assertion sits close to the new rule.**
   `commit-stranding-notice-journey.spec.ts:210` asserts Burn enabled after a
   cut drive, with the committed station still selected. It holds, because the
   row reading Drifting at `:207` comes from the same read that ends the
   committed state. If tier 4 is red there, the cause is ordering between the
   roster row and the panel within one render, not this change's rule; it is a
   gate finding, and the spec is not to be edited to pass.

## 13. Corrections to design.md, settled here

No sentence of design.md was found false on this reading, so there is no
correction of the kind the predecessor's RULING 15 recorded. Its line
references (`SpaceCommandPanel.tsx:143`, `:175-180`, `:332`, `:340`, `:345`;
`SystemSpaceView.tsx:346`, `:349-357`, `:773`, `:780-792`, `:808`) match the
code at `987ba60`. The points below are where this contract fixes something
design.md leaves open or says loosely; each is for adjudication.

1. **`selectionKey` is a required field of `AcceptedBurnCommit`.** Decision 8
   shows it without saying so.
2. **The click-time local is `committedKey`**, declared after the guard claim.
   Decision 3 says "inside `commitBurn`, before `order.mutate`".
3. **The native `disabled` expression gains `|| selectionCommitted`** and is
   not rewritten as `!burnAvailable`, though the two are now equal. Decision 8
   says "adds the same term"; folding them is a refactor with no test.
4. **Decision 13's reading order is the view's, not the panel's.** "The quote,
   no-quote, stale, retry and label elements are all absent" holds because the
   view disables the hook. In a panel test with the prop true and preview props
   passed they render (§1.5); only the label is absent by the panel's own term.
5. **The harness gains more than a second point trigger** (Decision 12, task
   1.1): a point-identity attribute on the stage mock, per-fleet preview
   counting, a held preview, a dated-fleet helper, two unwarned base helpers
   and a harness reset (§7.1). All are test-file additions; none changes what
   is real and what is mocked.
6. **Guards are exempt from the present-before-absent rule** (§7.2 rule 9),
   with the wrong-build proof of §12 item 3 in its place.
7. **5.3 and 5.4 are built together.** Tasks.md lists what each gates
   separately; the record's rename makes them one compile unit.

## 14. Gates

Cited from `docs/testing-tiers.md`; the commands live there and in
`frontend/CLAUDE.md`'s tier table and are not repeated here.

- **Per task:** tier 1, scoped as `frontend/CLAUDE.md`'s "Per task" row says.
- **Per commit (task 7.1):** tiers 0 and 1 in full, after section 5, never on
  the red suite. Includes the unedited `SystemSpaceView*.test.tsx` family.
- **Tier 2:** not applicable; no backend package is touched.
- **Archive gate (7.3-7.5):** tier 4 once with the tree locked, tier 3 once,
  never concurrently. The journey spec is written after every task is checked.
  A red keyboard leg is a finding for the one batched revision round (design
  Decision 15), not something to pre-build against.

## 15. Risks for the build

1. **The handler must stay branch-free and `[qc]`-only** (§2.2). A same-key
   bail-out, a warned-only write or a single shared record each pass most of
   the suite; 3.5, 3.12 and 3.14 row one are the rows that fail them.
2. **Do not memoise the derivation** and do not move it below the hook call.
3. **The callback order is load-bearing** and lives in a file this change does
   not edit (`use-fleets.ts`); 3.3 is its guard and must assert both the new
   call and the unchanged screen.
4. **Time advances send preview requests** (§7.3). A count asserted across an
   unintended 10 s is a false red or, worse, a tolerance someone adds.
5. **A held preview is never answered by the hook once the flag goes false**
   (§4 item 7, by code reading). If 3.5 shows `pending.preview.length` 2 after
   the second acceptance, that is a finding against §4, not a test to loosen.
6. **A future-dated departure** (5000 while the clock reads about 1000) is
   drawn by the real `buildSceneModel` in 3.5, 3.12 and 3.19, as it already is
   in the predecessor's tests. Do not change the instants.
7. **`SystemSpaceView.burn-preview.test.tsx` holds the committed state until
   unmount** after an accepted commit (it mocks `useMyFleets`). Its commits at
   `:709` and `:844` are each the last act of their test; I re-read both. No
   test may be added there that asserts a quote or a second Burn after one.
8. **Another person is working in this checkout.** Nothing here is staged or
   committed; scratch proofs go in a worktree.

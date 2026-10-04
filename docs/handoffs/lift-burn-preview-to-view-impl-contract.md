# lift-burn-preview-to-view — implementation contract

Architect, kickoff, 2026-10-04. Change folder
`openspec/changes/lift-burn-preview-to-view/` as of verdict commit `e3fd54c`
(plus the four design.md edits listed in §9). Code read at `4496139`
(`SystemSpaceView.tsx`, `SpaceCommandPanel.tsx`, `use-burn-preview.ts` are
unchanged since `a1d1c8d`, so every `file:line` in design.md still resolves).

This file settles what the spec leaves open. The SDET writes against it first;
the Next.js developer builds to it second. Where it and design.md disagree,
design.md was edited to match (§9); where it and the spec or tasks.md would
disagree, that is a finding (§10), not a workaround.

## 0. The seam, in one paragraph

Frontend only, three production files: `components/space/SystemSpaceView.tsx`,
`components/space/SpaceCommandPanel.tsx`, `hooks/use-burn-preview.ts`. No Go
work, no wire change, no query key, no palette or type change, no prop to
`VitalsStrip`, no edit to `FleetActionsPanel.tsx`, `FleetRoster.tsx`,
`space-selection.ts`, `lib/realtime.ts`, `lib/space-quote.ts`, any service, or
anything under `frontend/e2e/`. No testid is added, removed or renamed.

## 1. `SpaceCommandPanel` props after the lift

```ts
export interface SpaceCommandPanelProps {
  // --- kept, byte-identical (names, types, optionality, defaults) ---
  fleet: Fleet | null
  selection: SpaceSelection | null
  gateFacts?: GateFacts | null          // default null
  canvasAvailable: boolean
  mineRunning?: boolean                 // default false; still gates Burn and Jump
  worldTime: number
  scale: number | undefined
  // --- new, all REQUIRED, no defaults in the component ---
  preview: BurnPreview | null           // figures to show; may be stale
  currentQuote: BurnPreview | null      // preview when not stale, else null
  previewStale: boolean
  previewNoQuote: boolean
  onRequote: () => void                 // the hook's retry
}
```

`BurnPreview` is imported from `@/lib/types/fleet` (already imported at
`SpaceCommandPanel.tsx:44`). After the lift the panel has **no import of any
kind from `@/hooks/use-burn-preview`** — not a value, not a type.

What each new prop drives, exactly as the local of the same role does today:

| Prop | Replaces (today) | Drives |
| --- | --- | --- |
| `preview` | `preview` from the hook (`:109`) | the figure `<dl>`, `preview-affordable`, `preview-stranding`, the `unaffordable` panel styling |
| `currentQuote` | the local at `:119` (**deleted, not moved**) | `ceiling` (`:120`), `maxFuelTons` (`:130`), `quoted` in `commitBurn` (`:126`), the uncapped label |
| `previewStale` | `stale` | `preview-stale`; with `previewNoQuote`, `preview-retry` |
| `previewNoQuote` | `noQuote` | `preview-no-quote` |
| `onRequote` | `retry` | `preview-retry`'s `onClick`, and the cap-rejection branch of `commitBurn`'s `onError` (`:156`) |

The panel SHALL NOT compute `preview && !previewStale`. Task 1.7 is the test of
that: `preview` set, `currentQuote` null, `previewStale` false → no
`preview-fuel-ceiling`, `burn-uncapped-label` shown, the order carries no
`maxFuelTons`.

The uncapped label (task 4.3, Decision 10):

```ts
const burnAvailable = !!selection && canvasAvailable && !!fleet && !mineRunning
// render burn-uncapped-label only when: burnAvailable && !currentQuote
```

Burn's `disabled={!selection || !canvasAvailable || !fleet || mineRunning}`
(`:314`) is **not edited** — not rewritten as `!burnAvailable` either (task 4.5
diffs it).

## 2. View-side derivations (`SystemSpaceView.tsx`)

Inserted after `mineRunning` (`:739`) and before the `return` (`:742`). Nothing
between `:422` and `:742` returns early, so the hook order is stable.

```ts
const dockedAtTarget =
  !!acting?.attachedTo && selection?.bodyId !== undefined && selection.bodyId === acting.attachedTo
const previewWanted = !!acting && !acting.jump && !mineRunning && !dockedAtTarget
const burnPreview = useBurnPreview({
  fleetId: acting?.id ?? null,
  selection,
  commitWouldBeAccepted: previewWanted,
})
const currentQuote = burnPreview.preview && !burnPreview.stale ? burnPreview.preview : null
```

Local names are the developer's; the four expressions are not. Pinned:

- **The transit term is `acting.jump`, not `isInTransit(acting)`.** It is the
  panel's `!fleet.jump` carried unchanged. `isInTransit` also tests
  `!fleet.position`; adopting it would be a behaviour change nobody specced.
- **The mine term is the existing `mineRunning` identifier** — not
  `!!runningMine`, not a second `runningMine.eta > clock.now()`. Task 3.4
  separates these.
- **Both operands of the docked guard must be present.** `attachedTo` falsy →
  false; `selection.bodyId === undefined` (a point, or no selection) → false.
- **No canvas term, no burning term, no commit-in-flight term, no
  `isFetching` term.**
- `currentQuote` is derived **once, here**. No `useMemo` is needed (it is a
  reference pick, not a new object), no effect, no state.
- The selection setter (`:821`), `selectFleet` (`:664-677`), the hand-off
  effect (`:651-660`), the `mineRunning` line (`:739`) and the U2 hunks
  (the scan-sweep watcher timer `:187-192`, the arrival refetch timer
  `:559-561`, the `wallMsUntil` import at `:50`) are untouched.

The `<SpaceCommandPanel>` call site (`:896-904`) gains exactly five attributes:
`preview={burnPreview.preview}`, `currentQuote={currentQuote}`,
`previewStale={burnPreview.stale}`, `previewNoQuote={burnPreview.noQuote}`,
`onRequote={burnPreview.retry}`. The seven existing attributes stay.

**Guard-driven constraint on this file's text:** the source of
`SystemSpaceView.tsx` must contain the character sequence `useBurnPreview(`
exactly once. A comment that writes the call with its parenthesis fails the
static guard (§5.1). Write comments as "the preview hook" or `useBurnPreview`
without the parenthesis.

## 3. Hook changes (`hooks/use-burn-preview.ts`)

Public surface **unchanged**: `UseBurnPreviewArgs` (three fields, same names),
`BurnPreviewState` (`preview`, `stale`, `noQuote`, `retry`), the function name,
the query key, `retry: false`, `refetchInterval`, `refetchOnWindowFocus`,
`gcTime: 0`, `staleTime`. The existing 12 tests in `use-burn-preview.test.tsx`
are not edited and stay green.

### 3.1 `retry` is a no-op while disabled, read live (task 4.4, Decision 6)

`retry` must consult the enabled state **at call time**, not the value closed
over when the function was created. The panel's `commitBurn` captures
`onRequote` when Burn is clicked; the rejection arrives later, possibly after
the flag went false. Idiom (the file's sibling precedent is
`SystemSpaceView.tsx:298-299`, a ref assigned during render):

```ts
const enabledRef = useRef(enabled)
enabledRef.current = enabled
const retry = useCallback(() => {
  if (!enabledRef.current) return
  void query.refetch()
}, [query])
```

A `retry` identity that is stable across renders is permitted and not
required; no test may assert identity either way.

### 3.2 Discard on disable (task 4.6, Decision 13)

```ts
const qc = useQueryClient()
const selKey = selectionKey(selection)
useEffect(() => {
  if (enabled) return
  const queryKey = queryKeys.fleets.burnPreview(fleetId ?? '', selKey)
  void qc.cancelQueries({ queryKey, exact: true })
  qc.removeQueries({ queryKey, exact: true })
}, [enabled, qc, fleetId, selKey])
```

Verified against the installed `@tanstack/query-core` 5.90.11:

- `QueryCache.remove` calls `query.destroy()`, which cancels the retryer
  silently. The removed `Query` keeps the still-mounted observer, but the hook
  already masks it (`preview = enabled ? data : null`, `:76`).
- On the render where `enabled` returns to true, `getOptimisticResult` →
  `QueryCache.build` finds no entry and builds a fresh `Query` with no data;
  `setOptions` then sees `query !== prevQuery`, `isStale` true, and fetches.
  That is the "request at the transition".
- A fresh query that fails is `error` with no data → `noQuote`, never `stale`.

`removeQueries` alone is sufficient (destroy cancels); the explicit cancel
before it is harmless and matches task 4.6's wording. "Cancel" is at the query layer. `fleetService.preview` takes no `AbortSignal`
and its signature is not changed here; an HTTP request already in flight
completes and its response is discarded. Tests observe the discard (the late
response is not presented on resume), never an aborted fetch.

The effect writes no React state. It also runs when the hook is disabled for
a non-flag reason (no selection, no fleet); removing an absent entry is a
no-op.

### 3.3 Header comments (task 4.4)

`:26-30` and the JSDoc at `:35` currently say suppression is for states
"where a commit would be REFUSED". Replace with: the caller decides when a
preview is wanted; the flag is a client request-suppression input (running
mine, lane transit, target is the fleet's own host), not the server's
enforcement; a suppressed preview is not a failed one. The argument name
`commitWouldBeAccepted` stays.

## 4. Testids

### 4.1 Panel testids — all kept, none added

`preview-panel` · `selection-prompt` · `canvas-required-notice` ·
`selection-facts` · `gate-facts` · `preview-arrival` · `preview-deltav` ·
`preview-fuel` · `preview-fuel-ceiling` · `preview-affordable` (with
`data-affordable`) · `preview-stranding` · `preview-no-quote` · `preview-stale`
· `preview-retry` · `burn-uncapped-label` · `burn-button` ·
`commit-drift-notice` · `commit-drift-actual-deltav` ·
`commit-drift-actual-arrival` · `commit-drift-previewed-deltav` ·
`commit-drift-previewed-arrival` · `fleet-cmd-jump-<fleetId>`.

Same element, same attributes (`data-raw`, `data-unit` on each `<Figure>`).
`burn-hold-reason` and any reason-line testid belong to the deferred follow-up
and must not appear.

### 4.2 Other existing testids the new tests use (unchanged)

`space-view`, `space-announcer`, `fleet-row-<id>` (roster row; its click is
`selectFleet`), `space-fleet-panel`, `mine-section`, `mine-tons-input`,
`mine-kind-select`, `mine-button`, `mine-countdown`, `mine-cancel`. In the
stage mock only: `space-canvas-region` with `data-selection` (the
`SystemSpaceView.test.tsx:240` convention).

### 4.3 The e2e helpers and specs need no edit — names, mount timing, preconditions

**Names.** `e2e/helpers/space-view.ts` reads `preview-panel` and `burn-button`
(`:455-456`) and nothing else of the panel's. The specs read more than the
helper does: `space-journey.spec.ts:160-170` reads `preview-arrival`,
`preview-deltav`, `preview-fuel`, `preview-fuel-ceiling` with `data-unit` and
`data-raw`. All kept. No spec reads `burn-uncapped-label`, `preview-no-quote`,
`preview-stale` or `preview-retry`. `recordPosts(page, /\/orders$/)`
(`space-double-submit.spec.ts`) is `$`-anchored and never counted previews.

**Mount timing.** `preview-panel` is the panel's root `<section>`; it is
mounted unconditionally with the view, before any selection and before any
quote, today and after. Every `expect(preview-panel).toBeVisible()` in the
suite is therefore a "the view is up" wait, not a "the quote landed" wait, and
is unaffected. The figures mount when the hook returns data; the hook moves one
component up but runs in the same React commit as before, with the same inputs
(`acting`, `selection`), so the first figure appears no later than today.

**Preconditions that change, and who depends on them.** After this change no
figure renders (a) while the selection is the acting fleet's own host, (b)
while a known mine runs, (c) between a resume and its response; and the
uncapped label is absent beside a disabled Burn.

| Spec / helper site | Fleet state at that step | Selection | Affected? |
| --- | --- | --- | --- |
| `space-journey:160-171` figure assertions | fresh spawn, `ParkPoint`, **unattached** (`backend/fleet/service.go:1802`), no mine | a lode | No — quote is requested |
| `space-journey` step 4 (mine) | docked at the lode, lode still selected | host | Preview now withheld; the step reads only mine/hold ids |
| `space-journey` step 5, 7 | docked, mine ended | station / gate | Clicks Burn without reading a figure |
| `helpers/space-view.ts:455-456` `burnToSelectionAndDock` | any | caller's | Reads no figure |
| `vitals-strip-journey:413-416`, `scan-journey:406-408`, `space-double-submit` (all burn sites), `new-user:108` | various | various | Read no figure; Burn's `disabled` is unchanged |

No existing spec asserts a figure for a selection equal to the fleet's host or
during a mine, and none clicks Burn in a state whose `disabled` changes
(none does). Conclusion: **zero edits under `frontend/e2e/`.**

One behavioural difference existing specs will see and not assert on: a fleet
docked at its still-selected target stops producing a 500 on
`orders/preview` every 10 s. Journeys that print `[journey-console]` will log
fewer entries.

## 5. Test files

| File | Status | Tasks | Harness |
| --- | --- | --- | --- |
| `frontend/hooks/use-burn-preview.call-site.test.ts` | **new** | 1.1 | static, filesystem walk |
| `frontend/components/space/SpaceCommandPanel.test.tsx` | edited | 1.2–1.7 | props; `useOrder`/`useJump` mocked as today |
| `frontend/hooks/use-burn-preview.test.tsx` | edited (one added describe; existing tests untouched) | 1.8–1.10 | `renderHook`, `fleetService.preview` mocked |
| the seven `SystemSpaceView*.test.tsx` files named in task 2.1 | edited, one line each | 2.1 | unchanged |
| `frontend/components/space/SystemSpaceView.burn-preview.test.tsx` | **new** | 3.1–3.16 | real view, panel, fleet panel, roster; services mocked |

Tier 0's test-file rule skips test files, and all three production files
already have a sibling test, so no new gate obligation arises.

### 5.1 The static guard

Walk `app`, `components`, `hooks`, `lib` exactly as `lib/realtime.test.ts`
does (skip `*.test.ts(x)`, `node_modules`, dot-dirs). Three assertions:

1. The set of modules whose source contains an import specifier ending in
   `use-burn-preview` — match the **string literal**, any path form:
   `/['"][^'"\n]*\buse-burn-preview(\.tsx?)?['"]/` — has exactly one member.
   (Matching the literal covers `import … from`, `import()` and `require`;
   it does not match prose such as "`useBurnPreview`" in a comment.)
2. That member is `components/space/SystemSpaceView.tsx`.
3. That file's source matches `/\buseBurnPreview\s*\(/g` exactly once.

Red today: the one importer is `SpaceCommandPanel.tsx`.

### 5.2 Panel test file

- Delete `vi.mock('@/hooks/use-burn-preview', …)` (`:55`) and `previewState`
  (`:44-49`).
- `panel()` passes the five props as **explicit JSX attributes** with defaults
  `preview={QUOTE} currentQuote={QUOTE} previewStale={false}
  previewNoQuote={false} onRequote={onRequote}` (a module-level `vi.fn()`),
  ahead of `{...over}`. Explicit attributes, not a spread object, so the file
  is type-checked against the new interface.
- Arrange-step translation, old → new:

  | Old | New `over` |
  | --- | --- |
  | `previewState.preview = X` (current) | `{ preview: X, currentQuote: X }` |
  | `preview = null; noQuote = true` | `{ preview: null, currentQuote: null, previewNoQuote: true }` |
  | `stale = true` | `{ currentQuote: null, previewStale: true }` (figures stay) |
  | `previewState.retry` assertions | `onRequote` |

- Assertions are otherwise unchanged. "A later successful refresh clears the
  stale marking" (`:230`) becomes a `rerender` with the new props.
- 1.6's four unavailable arms: `selection: null` · `fleet: null` ·
  `canvasAvailable: false` · `mineRunning: true`, each also with
  `currentQuote: null, preview: null` so the label would show under today's
  rule. The available arms: `{ preview: null, currentQuote: null,
  previewNoQuote: false }` (the withheld/loading shape) and the failed shape.

Against today's code the whole file is red, not only the migrated tests: the
props do not exist (tsc) and the unmocked hook throws without a
`QueryClientProvider`. That is expected; record 1.2–1.5 as `compile-red`.

### 5.3 Hook test additions

Same `wrapper()` and `fleetService` mock as the file's existing describes;
`renderHook` with `initialProps: { accepted: boolean }`.

- 1.8: two arms plus one the contract adds within the task's scope — a
  `retry` reference **captured while enabled** and invoked after a rerender to
  disabled sends nothing (the stale-closure case of §3.1).
- 1.9, 1.10: hold the restoring request with a deferred promise. "At the
  transition" = `mockPreview` call count rises on the rerender to `true` with
  **no** timer advance (fake timers on, advance 0). The in-flight arm resolves
  the first deferred **while disabled** and asserts `preview` is null after
  resume.

### 5.4 The view-level file — what is real, what is mocked

Real, never mocked: `SystemSpaceView`, `SpaceCommandPanel`,
`FleetActionsPanel`, `FleetRoster`, `ScanControl`, `VitalsStrip`,
`@/hooks/use-burn-preview`, `@/hooks/use-actions` (all of it — so
`useRunningMine`, `useRunningScan`, `useCancelAction` run for real), and from
`@/hooks/use-fleets`: **`useOrder` and `useMine`** (`...actual`).

Mocked at the service boundary — `vi.mock('@/lib/services', …)`, the
`SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:63-75` precedent:

| Service fn | Why |
| --- | --- |
| `fleetService.preview` | the observation point of every task |
| `fleetService.order` | Burn commits; cap rejection (3.13, 3.14); `maxFuelTons` read off its argument (3.11, 3.16) |
| `fleetService.mine` | the real mine commit (3.2) |
| `actionService.listRunning` | the running-action read (per fleet id) |
| `actionService.cancel` | the real cancel control (3.3, 3.16) |
| `actionService.listSettled`, `acknowledge` | inert stubs |

Mocked at the hook level, as the family does: `useSystemSpace`, `useMyFleets`
(the own-fleets read; changed by `mockReturnValue` + `rerender`),
`useJump`/`useCutDrive`/`useStop`/`useHold`/`useRelease` (inert),
`@/hooks/use-market`, `@/hooks/use-scan`, `@/hooks/use-sightings`,
`@/hooks/use-galaxy`, `@/components/corporation-provider`,
`@/components/account-provider`, `@/lib/toast`, `next/navigation` (a shared
`push` spy), `./SpaceStage`.

Harness facts the SDET needs, each read off the code:

1. **`listRunning` is called for every own fleet present in the system, at
   mount, not only for the acting fleet.** `ScanSweepWatcher`
   (`SystemSpaceView.tsx:769-779`) mounts `useRunningScan(fleet.id)` per fleet
   in `here`, on the same query key as `useRunningMine`. So in 3.5 the second
   fleet's read is "deferred" by answering `listRunning('fleet_b')` with a
   promise held pending **from mount**, then resolved after the roster-row
   switch. Answer by argument (`mockImplementation((id) => …)`), not by call
   order.
2. **The test `QueryClient` carries the app's query defaults that bear on the
   lag rules:** `staleTime: 60_000`, `refetchOnWindowFocus: false`,
   `retry: false` (queries and mutations). With the family's bare
   `staleTime: 0` client a newly mounted `useRunningMine` observer refetches
   on mount and the "previous answer within the cache window" behaviour the
   requirement describes is not what runs. The test holds the client (3.16
   invalidates `queryKeys.actions.running(fleetId)` on it).
3. **Time.** The world clock is projected from the interior fixture's
   `worldTime`/`scale: 1` against the wall clock; under vitest fake timers
   advancing N ms advances `worldTime` by N, in `COARSE_TICK_MS` (1 s) steps.
   "Several intervals" = at least `3 * PREVIEW_REFRESH_MS`, imported from
   `@/lib/realtime`, never a literal. A mine that must outlast a no-request
   window needs `eta > T0 + 3 * PREVIEW_REFRESH_MS`.
4. **Selection toggles.** The stage mock's body trigger calls
   `props.onSelect({ bodyId })`; triggering the same body twice deselects.
   The mock needs one trigger per body id used (host, another body, station,
   gate body), a point trigger (`onSelect({ point: { x, y, z } })`), and a
   fleet-mark trigger (`props.onActivateFleet(id)`).
5. **Fixtures.** `INTERIOR` and `dockedFleet()` from `SystemSpaceView.test.tsx`
   are the shapes (`feat-body-0` mineable, `feat-station`, gate body
   `gate-sys_-6_16`). A cap rejection is
   `Object.assign(new Error('rejected'), { data: { error: 'fleet: solved fuel cost exceeds the requested maxFuelTons cap' } })`
   (`SpaceCommandPanel.test.tsx:300-303`; `lib/rejection-copy.ts:134`). A
   successful `fleetService.order` must resolve a fleet-shaped object: the
   panel reads `settled.state.Burn` and the real `useOrder` invalidates by it.
6. **Lane transit (3.6)** needs the fleet made acting explicitly first
   (click `fleet-row-<id>`), because an implicit `here[0]` stops being acting
   the render it departs. Then `useMyFleets` returns it with a `jump`, the view
   is rerendered, and `push` is asserted called once with `'/'`.

## 6. Red or guard, task by task

Status vocabulary is `docs/handoffs/README.md`'s. "Red today because" is the
assertion that fails against `4496139`.

| Task | File | Status | Red today because / why green |
| --- | --- | --- | --- |
| 1.1 | `use-burn-preview.call-site.test.ts` | assertion-red | the sole importer is the panel |
| 1.2 | `SpaceCommandPanel.test.tsx` | compile-red | props absent; unmocked hook has no provider |
| 1.3 | same | compile-red | same |
| 1.4 | same | compile-red | same |
| 1.5 | same | compile-red | `onRequote` does not exist |
| 1.6 | same | assertion-red (under compile-red) | label renders beside a disabled Burn (`:301`) |
| 1.7 | same | assertion-red (under compile-red) | panel derives currency itself |
| 1.8 | `use-burn-preview.test.tsx` | assertion-red | `refetch()` runs on a disabled query |
| 1.9 | same | assertion-red | cached answer returned on resume; no request under `staleTime` |
| 1.10 | same | assertion-red | no request, or `stale` over old data |
| 2.1 | seven view files | already-green (hygiene) | all-falsy wrong shape works before and after |
| 3.1 | `SystemSpaceView.burn-preview.test.tsx` | assertion-red | preview requested during a mine; label beside disabled Burn |
| 3.2 | same | assertion-red | figures stay after the mine is read |
| 3.3 | same | assertion-red — **only if it asserts zero requests while the mine holds** | a request is sent throughout today |
| 3.4 | same | assertion-red — same condition | same |
| 3.5 | same | assertion-red | figures stay after the read answers a mine |
| 3.6 | same | already-green | the panel's flag has `!fleet.jump` today |
| 3.7 | same | assertion-red | host selection is requested every interval |
| 3.8 | same | already-green | |
| 3.9 | same | already-green — **only if it allows up to one interval** | see note |
| 3.10 | same | already-green | |
| 3.11 | same | already-green | the panel derives the same `currentQuote` today |
| 3.12 | same | already-green | |
| 3.13 | same | already-green | `retry` → `refetch` today |
| 3.14 | same | assertion-red | host selection is requested; `retry` refetches |
| 3.15 | same | already-green | no quote path touches the announcer |
| 3.16 | same | assertion-red (all four arms) | nothing is withheld, so nothing resumes empty |

Totals: sections 1 and 3 hold 26 tasks — **18 red** (1.1–1.10; 3.1–3.5, 3.7,
3.14, 3.16) and **8 regression guards** (3.6, 3.8–3.13, 3.15). 2.1 is hygiene.

Notes that keep a status honest:

- **3.3, 3.4** state a THEN ("a request is sent") that is true today for the
  wrong reason. Each must first assert the GIVEN — `fleetService.preview` not
  called across the mine — then the request after it ends. Without that they
  are vacuous guards.
- **3.9** is the "must not withhold" arm. Assert that after the read reports
  detachment a call for `(fleetId, { bodyId: station })` arrives within one
  `PREVIEW_REFRESH_MS` and the figures render. Do **not** assert "no call
  before" (that is 3.7's) nor "at the transition with no timer advance" (that
  is 3.16's third arm) — either makes it red today and it is labelled a guard.
- **3.11 second arrangement** reads `maxFuelTons` off `fleetService.order`'s
  argument (real `useOrder`).
- **3.15** withdraws by deselecting (reachable today) and, as a second arm, by
  a mine becoming known; the announcer assertion holds today for both.
- The guards must be run green against today's code before the red manifest is
  recorded; a guard that is red today is a harness defect or a finding, not a
  red test.

## 7. Sequencing

**One commit for sections 1–4** (tasks.md's own header). The per-commit gate
runs tsc and the whole vitest suite; the red suite is compile-red, so nothing
between the red handoff and task 4.6 is committable. The SDET records the red
manifest (`openspec-red-manifest.sh record`) on the uncommitted tree. 2.1 may
ride in the same commit; it is green on both sides.

SDET order: 2.1 → 1.8–1.10 (hook, self-contained) → 1.1 → 3.x (run the eight
guards green against today's code) → 1.2–1.7 last, because that edit is what
turns tsc red.

Developer order for section 4, each step checked with
`npx vitest run <files>` and `npx tsc --noEmit`:

| Step | Task | Turns green | Must stay green |
| --- | --- | --- | --- |
| 1 | 4.1 — the lift, with the flag carried **verbatim** (`!!acting && !acting.jump`) | tsc; 1.1–1.5, 1.7 | all eight guards; the seven family files; `render-loop` |
| 2 | 4.4 — `retry` no-op, header comments | 1.8 | 3.13; the hook file's 12 existing tests |
| 3 | 4.6 — discard on disable | 1.9, 1.10 | same |
| 4 | 4.2 — `dockedAtTarget` and the mine term | 3.2–3.5, 3.7, 3.14, 3.16 | guards, especially 3.8–3.10, 3.12 |
| 5 | 4.3 — the label condition | 1.6, 3.1 | 1.3's "labelled uncapped" arms |
| 6 | 4.5 — the diff confirmations | — | — |

Lifting with the old flag first separates "the lift broke something" from "a
new precondition broke something". 3.1 is last to go green because it asserts
both the withheld request (step 4) and the absent label (step 5).

Then `bash harness/check.sh --frontend` and tier 0, once, before the commit.

## 8. Tier 4 — what the one journey can reach

Written after every task is checked, against the built UI, on the warped e2e
stack (scale 5). `PREVIEW_REFRESH_MS` is **wall** time (a React Query
`refetchInterval`), so the warp does not change the cadence; it shortens
flights and mine runs.

Count previews with the existing `capturePosts(page, /\/v1\/fleets\/[^/]+\/orders\/preview$/)`;
statuses need a spec-local `page.on('response')` (the
`space-double-submit.spec.ts` `recordPosts` shape). No helper edit.

Reachable deterministically on a random spawn, in this order:

1. `wakeNewCorp` → fleet at an unattached point park. `selectBody` a lode
   (`mineableBodyId` off the captured interior) → `preview-arrival`,
   `preview-deltav`, `preview-fuel`, `preview-fuel-ceiling` carry
   `data-raw`. *Select a target and read the quote.*
2. Stay there ≥ 25 s wall: consecutive preview POSTs are no closer than
   `PREVIEW_REFRESH_MS` minus a small slack, and at least two follow the first.
   *One per interval.* Do this leg **before** any burn — nothing else can
   re-key the query here.
3. Burn; as soon as the row reads under way, select the **station**. The
   re-target quote renders mid-burn (burning fleet previewed), and — this is
   the point — at arrival the selection is not the host, so the arrival lag
   window (design Risks (e)) produces no zero-length request.
4. Row reads docked. Station still selected → figures still render (docked,
   other target). Then `selectBody(page, lodeId)` → over ≥ 2 intervals: zero
   preview POSTs, zero `orders/preview` responses ≥ 500, no figure,
   `burn-button` enabled. *Own host selected → no request and no 500.*
5. `selectBody` the station again → figures. Mine 5 t → once the figures go:
   `mine-countdown` visible, `burn-button` disabled, `burn-uncapped-label`
   absent, zero preview POSTs until the countdown hides.

Journey risks:

- **J1 — the restore at a mine's ETA can be refused once.** The preview path
  settles a due *burn* but not a due *mine* (`backend/fleet/service.go:526`,
  `settleIfDue` returns early unless `Mode == ModeBurn`), and refuses while
  `ActiveActionId` is set (`:987`). The client's flag flips at the first
  coarse tick after the ETA; the view's own settle refetch fires at
  ETA + 400 ms plus a round trip. If the restoring request wins that race the
  server answers `ErrPreviewChannelHeld`, the panel shows `preview-no-quote`
  and Retry (the spec's "failed restoring request" state), and the next
  interval heals it. So after the countdown hides the journey may assert that
  the figures return within **two** intervals; it must not assert that
  `preview-no-quote` never appears, and must not assert a console free of
  4xx on `orders/preview` across that moment.
- **J2 — scope the "no 500" assertion to step 4's window.** Not the whole
  journey: J1's refusal, and any arrival with the target still selected, are
  outside it. The carried hard `[journey-console]` assertion is the
  update-depth one, unchanged.
- **J3 — the first request under dev StrictMode.** The e2e frontend is
  `next dev`. If the first selection is observed to produce two POSTs, that is
  a finding to report from the journey run (it would be so today as well), not
  a tolerance to widen; step 2 asserts spacing between consecutive requests.
- **J4 — mine length on the warped stack is not known here.** Step 5's
  "zero POSTs while the countdown shows" is exact whatever the length; do not
  require the run to span an interval.

Tier-1 only (not reachable, or not deterministic, through the real UI): lane
transit (the hand-off unmounts the view); a cap rejection, landing withheld or
not; a failed first preview, a failed refresh, the stale marking; the pending
window of a resumed preview and a failed restoring request; a mine not yet
read; the ETA passing while the read still reports the mine; the fleet leaving
its host with the host still selected; the announcer scenarios; the uncapped
label's four unavailable arms other than the mine; the static guard.

## 9. design.md edits made at kickoff

All four are in `openspec/changes/lift-burn-preview-to-view/design.md`; no
requirement, scenario, task or proposal line is touched. Each records a fact
of the code the design rests on, or one it had under-stated.

| # | Where | Edit |
| --- | --- | --- |
| E1 | Context, "The running-action read's lifecycle" | Added: `ScanSweepWatcher` issues the same inbox read for every own fleet present, at mount, so a fleet that can become acting has normally been read already; the not-yet-read window is that read still pending. |
| E2 | Decision 2 | The e2e sentence named only the helper. Added: the specs also read the four figure ids (`space-journey.spec.ts:160-170`), all kept, and `preview-panel` is the always-mounted root, so no wait depends on quote timing. |
| E3 | Decision 13 | Stated the mechanism precisely: removal destroys and silently cancels the query; cancellation is query-layer, the HTTP request is not aborted and its response is discarded; the effect's dependencies; verified against query-core 5.90.11. |
| E4 | Risks | Added the bullet for J1: the restoring request at a mine's ETA races the server's settlement of that mine and may be refused once; healed by the next interval; not a regression (today every request during and just after the mine is refused). |

## 10. Findings for the orchestrator

None requires a spec or tasks.md change before the build. Three to hold:

- **F1 (journey, no text change).** J1 above. Spec scenario "A mine's
  completion restores the quote" says only that a request is sent, and
  "A failed restoring request is a no-quote state" covers the refusal, so the
  text is true as written. If the transient "No quote" at every mine's end is
  judged unacceptable, the fix is a server one (settle a due mine on the
  preview path) or a cushion on the flag — either is a new change, not this
  one.
- **F2 (tasks.md bookkeeping, no action needed).** Task 4.1's "gates" list
  names 3.10 and 3.11, which are regression guards and gate nothing; 3.1 is
  listed under 4.2 but also needs 4.3. §7's table is the accurate map. No
  edit requested.
- **F3 (scope note).** Task 1.8 as worded tests `retry()` on the current
  render's function. The contract adds the captured-then-disabled arm (§5.3),
  which is Decision 6's actual hazard and otherwise observed only at the view
  level by 3.14. It is inside the task's scenario; flagged so the coverage
  table is not surprised by a third arm.

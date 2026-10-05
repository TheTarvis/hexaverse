# add-burn-cost-overlay — implementation contract

Architect, at kickoff, 2026-10-04. Link 2a-iv of `docs/plans/system-hud/chain.md`.
Tree: `a965554`. `git diff d965f5d a965554 -- frontend` is empty, so every
`design.md` line number holds at HEAD. Verdict commit `65f2aef`; its currency
diff was empty when this was written.

Frontend only. No Go, no wire shape, no API contract. This file settles the
component interface, the DOM contract and the test arrangements. Where it and
`design.md` say the same thing, `design.md` is the source; where `design.md`
leaves a choice ("either inline or one const"), the choice made here binds.

**The change folder is frozen.** Nobody edits `proposal.md`, `design.md` or the
delta. The only permitted edit under `openspec/changes/add-burn-cost-overlay/`
is a checkbox tick in `tasks.md` (section 5 below).

## 1. Task map and sequence

One SDET, one nextjs-dev, nothing parallel.

| Order | Tasks | Owner | File | Kind |
| --- | --- | --- | --- | --- |
| R1 | 1.1-1.6 | SDET | `frontend/components/space/Gauge.test.tsx` | red tests, appended |
| R2 | 2.1-2.5 | SDET | `frontend/components/space/VitalsStrip.test.tsx` | red tests, appended |
| R3 | 3.1-3.10 | SDET | `frontend/components/space/SystemSpaceView.burn-preview.test.tsx` | fixture (3.1) then red tests, appended |
| R4 | 4.1-4.6 | SDET | `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` | fixture (4.1) then red tests, appended |
| R5 | red handoff | SDET | `docs/handoffs/add-burn-cost-overlay-red-coverage.md`, `docs/handoffs/red-manifest-add-burn-cost-overlay.txt` | coverage table, manifest |
| G1 | 1.7 | nextjs-dev | `frontend/components/space/Gauge.tsx` | atom |
| G2 | 2.6 | nextjs-dev | `frontend/components/space/VitalsStrip.tsx` | strip |
| G3 | 5.1 | nextjs-dev | `frontend/components/space/SystemSpaceView.tsx` | wiring, one hunk |
| X | 6.1, 6.3-6.9 | orchestrator | — | gate |
| X | 6.2 | SDET, at the gate, after every other box above section 6 is checked | `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts` (new) | journey |

The reds clear in stages, and the developer confirms each stage:

- after G1: section 1 green; sections 2, 3, 4 still red.
- after G2: section 2 green; sections 3, 4 still red.
- after G3: sections 3 and 4 green.

A section-3 or section-4 test that goes green before G3 does not observe the
view's derivation. Report it to the orchestrator; do not continue.

## 2. The interface

### 2.1 Type and props

The type lives in `Gauge.tsx` and is exported from there only.

```ts
export interface GaugeCost {
  tons: number
  affordable: boolean
}
```

| Hop | Prop | Where declared |
| --- | --- | --- |
| view -> `VitalsStrip` | `burnCost?: GaugeCost` | `VitalsStripProps` (`VitalsStrip.tsx:33-56`) |
| `VitalsStrip` -> `FuelCell` | `burnCost?: GaugeCost` | `FuelCell`'s inline prop type (`:66-74`) |
| `FuelCell` -> `Gauge` | `cost?: GaugeCost` | `GaugeProps` (`Gauge.tsx:39-46`) |

- `VitalsStrip.tsx:27` becomes `import { Gauge, type GaugeCost, type GaugeSegment } from './Gauge'`.
- `HoldCell`'s signature (`:109`) and its `<Gauge>` (`:139`) are not edited.
- Each hop omits the prop when there is no value. The form is a conditional
  spread, at all three hops:
  - `Gauge` mount, `VitalsStrip.tsx:83`: `{...(burnCost ? { cost: burnCost } : {})}`
  - `FuelCell` mount, `:264`: `{...(burnCost ? { burnCost } : {})}`
  - `VitalsStrip` mount in the view: section 2.5.
- `burnCost={undefined}` and `cost={undefined}` are wrong builds that no test
  can see (`exactOptionalPropertyTypes` is off). Review holds them.
- No hop adds a hook, `memo`, or a dependency array naming the object.

### 2.2 The gauge: predicate and geometry

Computed in `Gauge` after `state` (`Gauge.tsx:76`):

```ts
const costDrawn =
  state !== 'no-data' &&
  hasValidCapacity(capacity) &&          // narrowing only; implied by state
  cost !== undefined &&
  Number.isFinite(cost.tons) &&
  cost.tons >= 0
const costPct = costDrawn ? Math.min((cost.tons / capacity) * 100, 100) : 0
const costState = costDrawn ? (cost.affordable ? 'affordable' : 'unaffordable') : undefined
```

- `costDrawn` gates the band, the mark and the root attribute. It is the only
  gate. The fill keeps its own gate (`state === 'filled'`, `:87`), unedited.
- `costState` reads `cost.affordable` and nothing else. No expression in the
  gauge, the strip or the view compares `cost.tons` with a segment's tons.
- An `empty` gauge (fuel served as 0) draws the overlay. Only `no-data` does not.

### 2.3 DOM contract

| What | Exact form |
| --- | --- |
| root attribute | `data-gauge-cost-state={costState}` beside `data-gauge-state`. Values `affordable`, `unaffordable`. Absent when `costDrawn` is false. |
| band | one `<div>`, child of the root, `data-gauge-cost-extent=""` |
| mark | one `<div>`, child of the root, `data-gauge-cost-mark=""`, rendered iff `costState === 'unaffordable'` |
| child order in the root | every fill segment, then the band, then the mark |

Write the marker attributes with an explicit empty string. A bare JSX
`data-gauge-cost-extent` renders `="true"`.

The band's attribute names are exactly `class`, `data-gauge-cost-extent`,
`style`. The mark's are exactly `class`, `data-gauge-cost-mark`, `style`.
Neither has `data-testid`, `data-raw`, `data-unit`, `aria-*`, `role`,
`tabIndex`, `title` or text. With `cost` omitted the root's `outerHTML` is
byte-identical to today's.

### 2.4 Static class strings and inline styles

Three constants in `Gauge.tsx`, each a whole literal on one line, selected by
key. Nothing is concatenated from parts of a colour name.

| Element | State | `className`, exact |
| --- | --- | --- |
| band | `affordable` | `absolute inset-y-0.5 bg-zinc-600 dark:bg-zinc-500` |
| band | `unaffordable` | `absolute inset-y-0.5 bg-amber-800 dark:bg-amber-600` |
| mark | — | `absolute inset-y-0 w-1 border border-zinc-900 bg-amber-500 dark:border-zinc-950 dark:bg-amber-400` |

| Element | `style`, exact |
| --- | --- |
| band | `{ left: '0%', width: `${costPct}%` }` |
| mark | `{ left: `${costPct}%`, transform: `translateX(-${costPct}%)` }` |

No `calc()`, `clamp()`, `min()`, `max()`. No inline size on the mark. No
`z-*`, `transition*`, `animate-*`, `duration-*` class on either. The fill's
elements (`:96-102`), `SEGMENT_SHADES` and `RAIL_SHADE` are not edited. The
header comment at `Gauge.tsx:20-25` ("The one state this element DOES carry")
is updated in the same edit to name the second attribute.

**The binding paint criterion (RULING 20, residue n1).** `design.md:528` and
`proposal.md:32` say "the mark's colour tokens differ from the unaffordable
band's". That sentence is loose and does not bind. Task 1.4 binds: in each
colour scheme the mark body's background shade (family and step) is not the
unaffordable band's background shade. Light: `amber-500` against `amber-800`.
Dark: `amber-400` against `amber-600`. A mark that reuses the band's shade and
adds one more token passes the loose sentence and fails 1.4.

### 2.5 The wiring

One hunk in `SystemSpaceView.tsx`, inside the `<VitalsStrip>` mount
(`:1071-1082`). Add one line after `serverWorldTime={serverWorldTime}` (`:1081`):

```tsx
{...(currentQuote
  ? { burnCost: { tons: currentQuote.fuelCostTons, affordable: currentQuote.affordable } }
  : {})}
```

- Inline at the mount, not a `const` below `:793`. This needs no import and
  keeps the file's diff to one hunk.
- The expression names `currentQuote` and no other preview value. It does not
  name `burnPreview`, `acting`, `roster`, `cargo`, `worldTime` or `isFetching`.
- `:793` is not edited. No `useState`, `useEffect`, `useRef`, `useMemo` or
  `useCallback` is added to any of the three production files.

**No-touch regions (U2 of `docs/handoffs/add-vitals-strip-qa-reverify.md:71`).**
Byte-identical before and after:

- `SystemSpaceView.tsx:188-194`, the scan-sweep watcher's
  `const delay = wallMsUntil(clock, eta) + ETA_CUSHION_MS` (`:193`).
- `SystemSpaceView.tsx:589-593`, the arrival refetch's
  `const delay = wallMsUntil(clock, soonest) + ETA_CUSHION_MS` (`:592`).

The developer's check before ticking 5.1: the file's zero-context diff shows
one hunk, at or after line 1071, and none between lines 130 and 620.

## 3. Test arrangements

Rules for all four files:

- New tests go in new `describe` blocks appended at the end of the file. No
  existing line is edited: no helper, no fixture, no `beforeEach`.
- Each `it` title starts `Scenario: <name, verbatim>` and carries its task
  number in a comment.
- No type import of `GaugeCost` and no `@ts-expect-error`. Costs are plain
  object literals passed through an untyped spread helper, so the red suite is
  `tsc`-clean and every red is **assertion-red under vitest**. An
  `@ts-expect-error` would turn into an error once 1.7 lands, and the
  developer may not edit tests.
- **Every absence assertion needs a presence beside it.** Before the build
  nothing draws an overlay, so "no overlay" is green on any tree. Each test
  below asserts a drawn overlay first (its GIVEN) or last (its positive
  control). That assertion is what makes it red.
- **Every "no overlay" assertion also asserts `data-gauge-state` is not
  `no-data`.** A fuel-less fleet answered into a read withdraws the overlay for
  the wrong reason.
- Percentages are read with `Number.parseFloat` and compared with
  `toBeCloseTo`. Never `toBe(0)` on a parsed pull-back: at cost 0 it parses to
  `-0`, and `expect(-0).toBe(0)` fails.

### 3.1 `Gauge.test.tsx` (tasks 1.1-1.6)

Add, in the new block: `gaugeEl(over: Record<string, unknown> = {})` returning
`<Gauge capacity={200} segments={[{ kind: 'fuel', tons: 80 }]} data-testid="g" {...over} />`;
`band(root)` and `mark(root)` by marker attribute; and
`fillOnly(root) = fillElements(root).filter((el) => !el.hasAttribute('data-gauge-cost-extent'))`.

Trap: `fillElements()` (`:39-50`) selects every descendant with an inline
width, so with a cost it returns the band too. New tests use `fillOnly`. The
helper itself is not edited. The mark has no inline width and is never returned.

| Task | Arrange | Assert, and where it is read | Red before 1.7 because |
| --- | --- | --- | --- |
| 1.1 | `cost: { tons: 30, affordable: true }`, then 100 | `band.style.left === '0%'`; `parseFloat(band.style.width)` 15, then 50; `band.getAttribute('data-gauge-cost-extent') === ''`; `fillOnly` has one element at 40 %; `data-gauge-state` is `filled`; band class tokens include `inset-y-0.5` and not `inset-y-0`, and `style.top`, `style.bottom`, `style.height` are `''`; each fill has `inset-y-0` | band is null |
| 1.2 | `it.each` over flag true and false: cost 250 and cost 200; then cost 0 | width 100 at both; `root.outerHTML` at 250 equals `root.outerHTML` at 200; state copied from the flag; at 0 the state attribute is present and width parses to 0 | state attribute absent |
| 1.3 | `it.each` NaN, `Infinity`, `-Infinity`, -5. Each arm renders cost 30 first, then `rerender` with the degenerate cost | first: band present. Then: no band, no mark, no `data-gauge-cost-state`, `fillOnly` at 40 %, `data-gauge-state` `filled`, and `root.outerHTML` equals a render with `cost` omitted | the opening control. Without it this test is already-green |
| 1.4 | cost 30 with flag true; cost 30 with flag false | state attribute per flag. Affordable band tokens are exactly `bg-zinc-600` and `dark:bg-zinc-500` among its colour tokens. Unaffordable band: `bg-amber-800`, `dark:bg-amber-600`. Mark: the four tokens of 2.4. On band and mark, every light colour token has a `dark:` token of the same utility on the same element, and none has an opacity suffix. Over the root and every descendant, every `<utility>-<family>-<step>` token has family `amber` or `zinc`. Per scheme, the mark's `bg-<family>-<step>` is not the unaffordable band's (section 2.4, the binding criterion) | band is null |
| 1.5 | `it.each`: `capacity: undefined`, `capacity: 0`, `segments: undefined`, each with cost 30. Each arm renders a 200 t / 80 t gauge with the cost first, then `rerender` | first: band present. Then: no band, no mark, no state attribute, `data-gauge-state` `no-data` | the opening control. Without it, already-green |
| 1.6 | one tree, `rerender` through: no cost, cost 30 flag false, cost 60 flag false, no cost | with the overlay drawn: `root.textContent === ''`; no `[data-raw]`, `[data-unit]`, `[tabindex]`, `[role]`, `[aria-valuenow]`, `[aria-valuetext]`, `[aria-label]` in the subtree; `band.getAttributeNames().sort()` and the mark's equal the lists in 2.3; `band.closest('[aria-hidden="true"]') === root`, same for the mark. In each phase, on root, band and mark: `style.transition === ''`, `style.animation === ''`, no class token matching `^(\w+:)*(transition|animate|duration|ease|delay)(-|$)`. After withdrawal: no band, no mark | band is null in the second phase |

Traps in 1.4 and 1.6:

- The rail carries `dark:bg-white/[0.12]`. A blanket "no opacity suffix" or
  "amber and zinc only" over every class in the gauge fails a correct build.
  The family check keys on a numeric step (`white` has none); the opacity check
  is scoped to the band and the mark.
- The mark carries an inline `transform`. A no-animation check that
  substring-matches `trans` on `style.cssText` or on class names fails a
  correct build. Read the two style properties and match whole class tokens.

The 18 existing tests supply no cost and stay green unedited. They are the
cover for the omitted input.

### 3.2 `VitalsStrip.test.tsx` (tasks 2.1-2.5)

The existing `roster()` (6 t fuel on 40 t) and `fleet()` stay as they are.
Add `stripElement(over: Record<string, unknown> = {})` returning the same
element `strip()` renders (`:82-101`), so a test can `rerender` it; the
existing `strip()` is not edited. Add
`fuelActing(fuelTons)` = `fleet({ roster: roster({ cargo: { fuel: fuelTons }, cargoCapacity: 200, freeHold: 200 - fuelTons }) })`.
`allInteractive` (`:162`) is local to its `describe`; copy it, do not hoist it.

All selectors start at `screen.getByTestId('fuel-gauge')`.

| Task | Arrange | Assert | Red before 2.6 because |
| --- | --- | --- | --- |
| 2.1 | `it.each`: (fuel 40, cost 60, true) and (fuel 80, cost 20, false) | band width 30 against fill 20, state `affordable`, mark null; band width 10 against fill 40, state `unaffordable`, mark present. Fill width equals the same strip rendered with no `burnCost` | state attribute absent |
| 2.2 | (a) fuel 1: cost 0.4 false, then `rerender` cost 30 false. (b) fuel 80: cost 0.4 false, then 30 false; and the same two costs with flag true. (c) fuel 80, `it.each` cost 0, 100, 250, flag false | (a) width 0.2, state `unaffordable`, mark present; mark `className` string-identical at 0.4 and 30. (b) mark tokens include `w-1` and `inset-y-0`; `style.width` and `style.height` are `''` at both costs; mark null at both costs with flag true. (c) `parseFloat(mark.style.left)` is 0, 50, 100 and equals `parseFloat(band.style.width)`; the number inside `translateX(...)` is minus that (`toBeCloseTo`). In (a)-(c): `band.contains(mark)` is false and `mark.parentElement` is the gauge root | mark is null |
| 2.3 | render with `burnCost` 30/true, read `vitals-hold-cell` `outerHTML`; `cleanup()`; render without | with the quote: fuel gauge carries `data-gauge-cost-state` (the control). Hold cell `outerHTML` equal across the two. Without the quote: no band, no state attribute on either gauge | the control. The two absence halves are already-green alone |
| 2.4 | `status: underwayStatus`, `burnCost` 4/true on the default 6 t / 40 t roster | `vitals-fuel-draining` present and band present at 10 % | band is null |
| 2.5 | `burnCost` 30/false on `fuelActing(80)`; and the same strip with none | state attribute present (the control). Every `allInteractive` element is the chevron or inside `vitals-fleet-menu`. `vitals-fuel-cell` `textContent` equal with and without the quote. Exactly one `[aria-live], [role="status"]` element, its text equal with and without. `fetch` spy (the idiom at `:630-637`) not called | the control |

A test here hand-sets `burnCost`. It observes an arrangement, never the view's
derivation. No section-2 test counts as cover for a lifetime scenario.

### 3.3 `SystemSpaceView.burn-preview.test.tsx` (tasks 3.1-3.10)

This harness mocks `useMyFleets` (`:74-98`). No read answers after a commit, so
the committed state holds until unmount. **No test here commits a burn and
then expects an overlay.** Commit rows are section 3.4's.

Existing fixtures other tests rely on, not edited: `fleet`, `attachedTo`,
`burningFleet`, `QUOTE` (744.2984 t), `QUOTE_2`, `INTERIOR`, `PARK`,
`mineAction`, `deferred`, `setFleets`, `mount`, `flush`, `click`,
`refreshRunning`, and the `beforeEach` default `mocks.preview.mockResolvedValue(QUOTE)`.
`armShown` and `beginMine` (`:821-834`) are local to their `describe`; copy
the pattern.

Task 3.1 adds, beside them:

```ts
const fuelRoster = (fuelTons = 80) => ({
  ships: [{ class: 'hauler' }], cargo: { fuel: fuelTons }, cargoCapacity: 200,
  freeHold: 200 - fuelTons, miningRate: 1, estimatedRange: 5000,
  fuelPricePerTon: 5, stationKeepRateTonsPerSecond: 0.02,
})
const fuelFleet = (id: string, over: Record<string, unknown> = {}, fuelTons = 80) =>
  fleet(id, { roster: fuelRoster(fuelTons), ...over })
const quoteOf = (fuelCostTons: number, affordable = true) => ({ ...QUOTE, fuelCostTons, affordable })
```

and the overlay reader: `fuelGauge()`; `overlay()` returning
`{ state, widthPct, band, mark }` from the root attribute and the two marker
selectors; `fillPct()` summing inline widths of root children that are not the
band; `expectOverlay(pct, state, why)`; `expectNoOverlay(why)`, which asserts
no band, no mark, no state attribute **and** `data-gauge-state` not `no-data`.

Every test sets its own preview answer first; the `beforeEach` default serves
744 t. Answer by request (`bodyId`, fleet id), not by call order, wherever two
targets or two fleets are in play. Every test selects through
`mock-select-<id>`: a test that never selects passes against every lifetime bug.

| Task | Arrange | Assert |
| --- | --- | --- |
| 3.1 | `mount([fuelFleet('fleet_1')])`, preview `quoteOf(30)`, select `OTHER` | `expectOverlay(15, 'affordable')`, `fillPct()` 40 |
| 3.2 | mount, no selection | `expectNoOverlay`, `fillPct()` 40. Then select `OTHER`: `expectOverlay(15, …)` (the control) |
| 3.3 | `it.each`. Pending: first call returns a `deferred`. Failed: first call rejects | pending: `expectNoOverlay`; resolve `quoteOf(30)`; 15 %. Failed: `preview-no-quote` present, `expectNoOverlay`; set `quoteOf(30)`, click `preview-retry`; 15 % |
| 3.4 | one mount. Call 1 `quoteOf(30)`. Call 2 deferred, resolved `quoteOf(36)`. Call 3 rejects. Call 4 deferred, resolved `quoteOf(45, false)`. One `flush(PREVIEW_REFRESH_MS)` per step | 15 %. Call 2 pending: still 15 %, same state. Resolved: 18 %; a `MutationObserver` on the gauge root (`attributes`, `childList`, `subtree`), read with `takeRecords()`, shows no removal of the band and no mutation of `data-gauge-cost-state`. Call 3 failed: `preview-stale` present, `expectNoOverlay`, `preview-fuel-ceiling` absent, `vitals-fuel-tons` `data-raw` `80`, `vitals-fuel-range` `data-raw` unchanged, `fillPct()` 40. Call 4 pending: `expectNoOverlay`, ceiling absent. Resolved: 22.5 %, `unaffordable`, mark present, ceiling present |
| 3.5 | X = `OTHER` answers `quoteOf(30)`; Y = `STATION` answers a deferred | X at 15 %. Select Y: `expectNoOverlay`. Resolve `quoteOf(100, true)`: 50 %, `affordable`, mark null, `fillPct()` 40. Click Y's trigger again (it deselects): `expectNoOverlay`, `selection()` is `''` |
| 3.6 | `it.each`, each arm opens with an overlay at 15 %. Mine: `fuelFleet('fleet_1', { attachedTo: HOST })`, select `OTHER`, then `running.set` and `refreshRunning`. Transit: click `fleet-row-fleet_1` first, select `OTHER`, then `setFleets` with a `jump` and `rerenderView()`. Docked: free fleet, select `HOST`, then `setFleets([fuelFleet('fleet_1', { attachedTo: HOST })])` and `rerenderView()` | `expectNoOverlay` in each |
| 3.7 | preview `quoteOf(60)`; overlay at 30 %; begin a mine; hold the restoring call in a deferred; cancel through `mine-cancel` | `expectNoOverlay` while the restoring call is pending; resolve `quoteOf(30)`; 15 %, not 30 % |
| 3.8 | `it.each` `quoteOf(30, true)`, `quoteOf(30, false)` | overlay drawn; `preview-affordable` has non-empty text; its `data-affordable` is `'true'` exactly when the gauge state is `affordable`; its text matches `/not affordable/i` exactly when the state is `unaffordable` |
| 3.9 | select (`quoteOf(30)`); one interval (`quoteOf(36)`); deselect | overlay at 15 %, then 18 %, then none. `space-announcer` and `balance-live-region` text equal the baseline after each. `previewCalls().length` is 1, then 2, then still 2 after a further `flush(0)` |
| 3.10 | `mount([fuelFleet('fleet_1', {}, 20)])`, preview `quoteOf(30, false)`, select | 15 %, `unaffordable`, `fillPct()` 10. `setFleets([fuelFleet('fleet_1')])`, `rerenderView()`: `fillPct()` 40, state still `unaffordable`, call count unchanged. Set `quoteOf(30, true)`, `flush(PREVIEW_REFRESH_MS)`: call count up by exactly one, state `affordable` |

Why each is red before 5.1: the view passes the strip no `burnCost`, so the
first `expectOverlay` fails on a missing state attribute. That is the right
reason. It stays the reason after 1.7 and 2.6.

Trap in 3.6's transit arm: `acting` is `allFleets.find(id === actingFleetId) ?? here[0]`
(`SystemSpaceView.tsx:308-309`). Without the row click, a fleet in transit
drops out of `here`, `acting` goes null, and the gauge reads `no-data`. The
existing transit test clicks the row for the same reason (`:570`).

### 3.4 `SystemSpaceView.stranding-notice.test.tsx` (tasks 4.1-4.6)

Real `use-fleets`; `listMine`, `order`, `cutDrive`, `stop` settle by call
index. Follow the file's rule: a test asserts its `settled` log before its
closing assertion and never calls the query client.

Existing fixtures not edited: `fleetOf`, `parked`, `attached`, `pointParked`,
`burning`, `burningToPoint`, `drifting`, `withStranded`, `orderResponse`,
`QUOTE`, `holdCalls`, `holdPreview`, `answerPreview`, `commit`,
`commitUnwarned`, `commitAndConfirm`, `commitUnwarnedAndConfirm`,
`resetHarness`, `BASE_LOG`, `CONFIRMED_LOG`, the `beforeEach` default.

Task 4.1 adds, beside `withStranded` (`:301`) and in its idiom:

```ts
const withFuel = (fleet: FleetFixture, fuelTons = 80): FleetFixture => ({
  ...fleet,
  roster: { ...fleet.roster, cargo: { fuel: fuelTons }, cargoCapacity: 200, freeHold: 200 - fuelTons, estimatedRange: 5000 },
})
const quoteOf = (fuelCostTons: number, affordable = true) => ({ ...QUOTE, fuelCostTons, affordable })
```

and the same overlay reader as 3.3, plus a smoke test (mount, answer
`[withFuel(parked('fleet_a'))]`, select, 15 %).

**Every fleet answered into any read in a section-4 test is `withFuel(...)`,
including the order response, the read that reports the burn, and the read
after a cut.** A bare `burning('fleet_a', …)` answered into a read turns the
gauge `no-data`, and the test then passes against a build that never withdraws.
`expectNoOverlay`'s gauge-state check catches the slip.

| Task | Arrange | Assert |
| --- | --- | --- |
| 4.2 | preview `quoteOf(30)`; `commitUnwarned({ fleets: [withFuel(parked('fleet_a'))], ordered: withFuel(burning('fleet_a', 1000, 61000)) })`, with the overlay asserted at 15 % between the select and the Burn click (write the steps out; the helper does not pause there) | at acceptance, read #1 unanswered: `expectNoOverlay`. After `answerListMine(1, [withFuel(burning(…))])`: `expectNoOverlay`. After `poll()` and the next answer reporting the same burn: `expectNoOverlay` |
| 4.3 | pre-commit quote `quoteOf(60)` (30 %); commit and confirm; `holdPreview()`; cut through `fleet-cmd-cut-drive-fleet_a`; answer the cut and the read with `withFuel(drifting('fleet_a'))` | `expectNoOverlay` after the cut answers, and again with the restoring preview pending; `answerPreview(0, quoteOf(30))`; 15 % |
| 4.4 | X = `OTHER` committed and confirmed running; preview answered by `bodyId` (X 30 t, Y = `HOST` 50 t) | select Y: 25 %. Select X: `expectNoOverlay` |
| 4.5 | read #0 `[withFuel(parked('fleet_a'), 80), withFuel(parked('fleet_b'), 40)]`; preview by fleet id: A `quoteOf(30)`, B a deferred | A: 15 % on a 40 % fill. Click `fleet-row-fleet_b`: `selection()` unchanged, `expectNoOverlay`, `fillPct()` 20. Resolve B `quoteOf(50)`: 25 % on a 20 % fill |
| 4.6 | `it.each`. Opened on a burn: read #0 `[withFuel(burning('fleet_a', 1000, 61000))]`, select `HOST`. Remounted: commit and confirm, `cleanup()`, `renderView()`, select `HOST` | overlay drawn at the quote's percentage and `vitals-fuel-draining` present |

No fleet-activation trigger is added to this file's stage mock (`:131-162`).

### 3.5 Already-green rows, and what cannot be made red

With the controls above, every new test is assertion-red. Without them these
are green on the unbuilt tree, and the SDET records the control as the
mutation note in the coverage table: 1.3, 1.5, the absence halves of 2.3 and
2.5, 3.2, and every `expectNoOverlay` line in 3.3-3.7, 3.9 and 4.2-4.5.

No test can be made red for these. They are held by review, and the SDET lists
them as `reasoned-not-automated`:

- a second, identical `burnPreview.preview && !burnPreview.stale` at the mount;
- an explicit `burnCost={undefined}` or `cost={undefined}`;
- a one-render lag from a state copy (invisible under `act`);
- the mark's position after the band in DOM order;
- the mark's containment as rendered pixels and the cap's clipping;
- the overlay while the canvas is unavailable (RULING 17: no test by ruling).

`frontend/hooks/use-burn-preview.call-site.test.ts` is an existing green test,
unedited. It is the cover for "no second preview call site" and goes red only
under that wrong build.

## 4. Wrong builds and the row that kills each

| Wrong build | Killed by |
| --- | --- |
| reader is `burnPreview.preview` | 3.4, failed-refresh step and pending-after-failure step |
| currency keyed on `isFetching`, blanking on every refresh | 3.4, call-2-pending step and the observer |
| currency keyed on `isFetching`, re-presenting after a failure | 3.4, call-4-pending step |
| second identical derivation at the mount | none; review |
| quote copied to state or a ref | 3.5 (replace), 3.7, 4.2, 4.3, 4.5 |
| wiring computes `flag && cost <= fuel` | 3.5 only (100 t, 80 t aboard, flag true) |
| wiring computes `flag \|\| cost <= fuel` | 3.4 restore step (45 t, flag false) |
| wiring computes `cost <= fuel` | both of the above |
| wiring passes a default object when there is no quote | 3.2 |
| `useBurnPreview` imported by the strip or the gauge | the existing call-site test |
| gauge decides state or mark from geometry | 2.1, both arms |
| mark drawn because the cost was clamped | 1.2 (250 t, flag true: `outerHTML` equal to 200 t) |
| mark with `left` and no pull-back | 2.2 (c) at 100 and 250 t |
| mark as a child of the band | 2.2, `band.contains(mark)` |
| mark sized inline or by cost | 2.2 (a), (b) |
| band full-height (`inset-y-0`) or edge-aligned | 1.1 |
| band offset by the fill | 1.1, `left` is `0%` |
| band with a minimum width | 1.2 (zero), 2.2 (a) at 0.2 % |
| band not limited to the rail | 1.2 |
| overlay drawn on a no-data gauge | 1.5 |
| degenerate cost drawn | 1.3 |
| fill shortened or re-shaded by the overlay | 1.1, 2.1 |
| cost reaches the hold gauge | 2.3 |
| mark body in the band's shade | 1.4, per-scheme shade criterion |
| a red, blue or translucent token | 1.4 |
| a transition or animation | 1.6 |
| a figure, test id or numeric attribute on band or mark | 1.6, attribute-name lists |
| bare marker attribute rendering `"true"` | 1.1 |
| strip prints cost or shortfall text, or announces | 2.5, 3.9 |

## 5. Who ticks which box

**Read this paragraph before touching `tasks.md`.** The SDET ticks a test task
(1.1-1.6, 2.1-2.5, 3.1-3.10, 4.1-4.6, and later 6.2) when its test is written
and recorded red in the coverage table, and at no other time. The nextjs-dev
ticks an implementation task (1.7, 2.6, 5.1) when the tests it names are green
and untouched, and ticks no other box. The orchestrator ticks 6.1 and 6.3-6.9.
A tick changes `[ ]` to `[x]` and no other byte. Nobody reports a count from
memory: the count is `grep -c` on the file, and the report quotes it. The
expected counts are 27 checked and 12 unchecked at red handoff; 30 and 9 when
the developer is done; 39 and 0 at archive. The previous link reported 38 of
40 checked when the file held 13.

## 6. Per-commit gate

`docs/testing-tiers.md` defines it and holds the commands. Tier 0 (changed-file
conventions) and tier 1 (unit behaviour, types, lint) are the per-commit gate.
Tier 2 (one package against the emulator) has no subject here: no backend
package is touched. Per task, the developer runs the per-task row of
`frontend/CLAUDE.md`'s tier table. Tiers 3 and 4 are the archive gate, started
by the orchestrator, once each, tier 4 first.

Known harness defect, not this change's failure and not to be fixed in it:
`docs/handoffs/defect-determinism-checks-resolve-repo-root-above-repo.md`. Two
determinism legs of the tier-0 check (the FMA-contraction register and the
market mirror map) fail on any tree. Report them as that defect by name.

Tier 0's colour validator runs on the changed files and has no rule for red,
blue or amber. Task 1.4 holds the palette rule.

## 7. Journey notes for the gate (task 6.2)

Written only after every box above section 6 is checked. One spec, one test:
`frontend/e2e/tests/burn-cost-overlay-journey.spec.ts`. Helpers in
`frontend/e2e/helpers/` are read-only.

Legs, each through `runLeg` (the idiom at
`committed-selection-journey.spec.ts:422`), with a closing assertion naming
the three that must be PASSED:

| Leg | Required | Notes |
| --- | --- | --- |
| no selection | **PASSED** | `fuel-gauge` reads `data-gauge-state="filled"`, no `data-gauge-cost-state`, no band |
| affordable overlay | **PASSED** | select a quoted target; read the gauge's `data-gauge-cost-state`, `preview-affordable[data-affordable]` and `preview-stale` in **one** `page.evaluate`, so a refresh cannot land between the reads. Gauge state equals the panel's flag for that quote. Do not assert which value is served |
| clear withdraws | **PASSED** | re-pick the target; state attribute and band gone |
| replace the selection | logged | needs two quoted targets; quote first, then choose |
| commit withdraws at acceptance | logged | costs one burn; doubles as probe round 1 |
| width floor, 1280 x 720, overlay drawn | logged | cell boxes, as `vitals-strip-journey.spec.ts` reads them |
| paint, light and dark | UNTESTED if the band is under 2 px (cost under 10 t on 200 t) | below |
| extent past the fill | UNTESTED unless arranged | needs cost above the fuel aboard |
| unaffordable overlay and its mark | UNTESTED unless the bounded probe arranges one (RULING 14) | log tier 1 tasks 2.1, 2.2, 1.4 as cover |

Paint sampling, per `design.md` Decision 11's table:

- Sample pixels from a screenshot, never computed styles. The dark rail is
  translucent and the palette is OKLCH.
- The fill's uncovered part: the centre of its full-height part past the
  band's end when the fill is longer; otherwise the centre of the strip above
  the band. Not the geometric centre of the uncovered region.
- The band: its middle row at half its length.
- The rail: its centre row, midway between the longer of fill and band and
  the rail's end.
- If arranged: the band's middle row midway between the fill's end and the
  band's end; and the mark's centre (its amber body, not its edge).
- Assert the sampled sRGB triples pairwise unequal. Record the contrast
  ratios; gate on none.
- Scheme: no `@custom-variant dark` was found in `frontend/app/*.css`, so
  `dark:` should follow `prefers-color-scheme` and Playwright's colour-scheme
  emulation should switch it. That is read from the tree, not run. No e2e spec
  has emulated a scheme or decoded a screenshot before. `sharp` is already in
  `frontend/package.json`; no dependency is added.

Wall time, from measured runs:

- Per-test timeout is 60 s and `expect` is 10 s (`frontend/playwright.config.ts:87-88`). Neither is raised.
- Home-system flights are 19.0-21.8 s of world time, 3.8-4.4 s wall at scale 5; a gate flight 5.4 s wall; a select-plus-quote round trip well under 1 s (`docs/handoffs/clear-burn-preview-on-commit-journey.md`).
- A whole journey with a refusal and two flights to "Docked" ran in 17.4 s (`docs/handoffs/fix-burn-order-geometry-refusals-journey.md`).
- The preview interval is 10 s and the baseline poll 20 s. No leg waits an interval. An arrival is seen at the ETA timer or, at worst, the next poll.
- The probe: quote every target; if none is unaffordable, commit the costliest, wait for arrival, quote again. Cap it by the test's remaining wall budget (stop when under about 15 s remain) and at two rounds. Starting fuel is 100 t and observed costs are a small fraction of it, so expect UNTESTED.

Carry forward:

- The `[journey-console]` capture and its hard update-depth `afterEach` (`committed-selection-journey.spec.ts:129-139`). With an overlay drawn this is the only guard for a render loop that needs a quote.
- Capture every 4xx and 5xx `/v1/` response's status, method, URL and body in the spec. The e2e backend log records no response body.
- A missed quote is logged as missed, never swallowed.
- Key every window on the gauge, not the panel.

## 8. Impact fence

Production files that may change, and no others:

- `frontend/components/space/Gauge.tsx`
- `frontend/components/space/VitalsStrip.tsx`
- `frontend/components/space/SystemSpaceView.tsx` (one hunk, section 2.5)

Test files that may be appended to:

- `frontend/components/space/Gauge.test.tsx`
- `frontend/components/space/VitalsStrip.test.tsx`
- `frontend/components/space/SystemSpaceView.burn-preview.test.tsx`
- `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx`

Created: `frontend/e2e/tests/burn-cost-overlay-journey.spec.ts` (gate),
`docs/handoffs/add-burn-cost-overlay-red-coverage.md`,
`docs/handoffs/red-manifest-add-burn-cost-overlay.txt`,
`docs/handoffs/add-burn-cost-overlay-journey.md`. Edited by tick only:
`openspec/changes/add-burn-cost-overlay/tasks.md`. Edited by the orchestrator
at 6.9: `docs/plans/system-hud/chain.md`.

Not edited by anyone in this change, and a finding against whoever does:
`frontend/hooks/use-burn-preview.ts`, `frontend/hooks/use-burn-preview.call-site.test.ts`,
`frontend/components/space/SpaceCommandPanel.tsx` and its test, the seven
`SystemSpaceView*.test.tsx` files that mock `useBurnPreview`,
`frontend/lib/types/fleet.ts`, `frontend/e2e/helpers/`, `frontend/playwright.config.ts`,
`frontend/package.json`, `backend/`, `fixtures/`, `harness/`, `openspec/specs/`.

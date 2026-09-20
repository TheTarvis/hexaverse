# add-vitals-strip — implementation contract

Link 2a of `docs/plans/system-hud/chain.md`. Author: `openspec-architect`,
the owner of this change's `design.md`.

**Basis, all read before writing:** the spec-frozen change at verdict commit
`aa21687` (`openspec/changes/add-vitals-strip/` — proposal, design, tasks,
four spec deltas; `system-console` = 14 requirements / 71 scenarios / 42
tasks), `add-vitals-strip-rulings.md` (FULL-AUTO RULINGs 1–24),
`-adversary-r1/-r2/-r3.md` **with the orchestrator rulings appended to each**
(several substituted a remedy for the one the adversary proposed; the
substituted remedy is what the spec says and what this document pins),
`-panel-architect.md` and `-panel-consolidated.md`, `frontend/CLAUDE.md`,
`docs/testing-tiers.md`, and the live code at every site named below.

**Audience and standing.** The SDET writes the failing suite from this
document; `openspec-nextjs-dev` makes it pass. This contract settles only
what the spec deliberately leaves to design — component surfaces, the DOM
contract, attribute vocabularies, the derivation's new fields, and the order
of work. **It has no authority over the spec.** If an implementer finds this
contract and a spec delta in conflict, that task **halts and routes back
through the orchestrator to the spec writer**; it is not resolved here and
never by the implementer. Findings I could not resolve without spec text, or
that deviate from a repo standard, are in §14 — flagged, not reinterpreted.

**Test execution is not in scope for this document.** Which suite runs when,
and at what cost, is `docs/testing-tiers.md` — the single definition. This
contract names **no commands and no timeouts**. §13 states only which tier
gates what.

---

## 0. The seam, in one paragraph

Frontend only. **No Go work, no wire change, no new served field.** A task
that appears to need one is mis-scoped (FULL-AUTO RULING 8) and halts. There
is therefore no API contract to write first. The seam two agents would
otherwise invent twice is **the shared derivation's new fields, the pill's
closed props signature, the gauge atom's state vocabulary, and the DOM shape
the strip inherits from the fleet panel**. Those are §2–§8. Layout clearance
is §9, the camera cluster is §10, the gates that will bite are §11, the build
order is §12.

---

## 1. Module map, and the test-file gate

New and touched files. Every new `.ts`/`.tsx` under `frontend/` needs a
sibling test file or tier 0 (`check-frontend-tests.sh`) fails on the changed
file; `lib/types/*.ts` and `*-provider.tsx` are exempt by that script's own
skip list.

| File | Status | Sibling test required |
|---|---|---|
| `frontend/components/fleet/roster-status.ts` | extended, additively (§2) | `roster-status.test.ts` exists — extended, never rewritten |
| `frontend/lib/types/fleet.ts` | `PARK_KIND_*` exports (§2.3) | exempt (`/lib/types/`) |
| `frontend/components/corporation-provider.tsx` | `useCorporationSessionOptional()` (§6) | exempt (`-provider.tsx`) |
| `frontend/components/space/Gauge.tsx` | NEW — the shared atom (§5) | `Gauge.test.tsx` |
| `frontend/components/space/VitalsStripPill.tsx` | NEW — the pill (§4) | `VitalsStripPill.test.tsx` |
| `frontend/components/space/VitalsStripFleetCell.tsx` | NEW — identity, chevron menu, pill mount, stranded marker | `VitalsStripFleetCell.test.tsx` |
| `frontend/components/space/VitalsStrip.tsx` | NEW — container + fuel/hold/credits/clock cells | `VitalsStrip.test.tsx` (+ suffixed siblings, repo pattern) |
| `frontend/components/space/SystemSpaceView.tsx` | mount + bottom-band clearance (§9) | exists |
| `frontend/components/space/SpaceStage.tsx` | camera cluster (§10) | exists |
| `frontend/components/space/FleetActionsPanel.tsx` | readout removal (§8.3) | exists |
| `frontend/components/space/space-scene.ts` | repoint two `Park.Kind` literals | exists |
| `frontend/lib/format/guards.test.ts` | **line-anchored exception list, see §11.3** | is a test |

`"use client"` on every new `.tsx` here: all four are interactive or stateful
leaves under an already-client tree (`SystemSpaceView` is `'use client'`).
Nothing in this change is a server component, and nothing fetches.

**Layering.** The strip is component→(props). It calls no hook that reads,
no service, no `apiClient`. The one context accessor this change adds (§6) is
called **in `SystemSpaceView`**, not in the strip — see §6.3.

---

## 2. `roster-status.ts` — the additive extension

`FleetRoster.tsx:188,197,200-202` renders `status.tone`, `status.where`,
`status.activity` and `status.remainingMs` **verbatim**. Changing any of them
changes the roster row's copy, which contradicts task 1.2 and RULING 15's
premise that `fleet-roster` takes no delta.

### 2.1 The rule, mechanically

> For every input the function accepts today, `tone`, `where`, `activity` and
> `remainingMs` return **byte-identical** values. Every new field is optional
> and additive. The existing nine `roster-status.test.ts` cases assert the old
> four fields exactly and are **not edited** — that table is the additive-only
> check.

The signature gains one **optional** fifth parameter, so `FleetRoster.tsx:167`'s
four-argument call compiles and behaves unchanged:

```ts
export function rosterRowStatus(
  fleet: Fleet,
  worldTime: number,
  nameOf: NameOf,
  runningMine?: RunningMine | null,
  resolveBody?: ResolveBody,      // NEW, optional
): RosterRowStatus
```

### 2.2 The new fields — normative

```ts
/** A resolved body reference, or null when neither collection matched. */
export type ResolvedBody =
  | { kind: 'feature'; type: string; id: string }
  | { kind: 'gate'; destSystemId: string }

/** Supplied by the mounting view; checks BOTH interior collections. */
export type ResolveBody = (bodyId: string) => ResolvedBody | null

export type ParkMode = 'orbit' | 'stationkeep' | 'point'

export type ActivityKind =
  | 'docked' | 'underway' | 'holding' | 'mining'
  | 'drifting' | 'transit' | 'onstation'

export interface RosterRowStatus {
  // --- unchanged, byte-identical for every input they accept today ---
  tone: StatusTone
  where: string
  activity: string
  remainingMs?: number

  // --- ADDITIVE. The roster row ignores all of these. ---

  /** The discriminant the pill switches on. Never player-facing copy. */
  activityKind: ActivityKind

  /** The absolute world-ms ETA the span was measured from (round 2 F3). */
  etaWorldMs?: number

  /** Park.Kind resolved to a name (§2.3). Present only for a parked fleet. */
  parkMode?: ParkMode

  /** Docked host, already resolved to display text. */
  hostLabel?: string

  /** Burn target, already resolved to display text. */
  targetLabel?: string

  /** Served verbatim from `roster.stationKeepRateTonsPerSecond`. */
  stationKeepRateTonsPerSecond?: number
}
```

`activityKind` is not redundant with `activity`: `activity` is player copy
that must stay byte-identical, and a pill that branched on it would break the
moment copy changes. `parkMode` is not redundant with `activityKind`: it is
present for all three park kinds, while `activityKind` collapses `orbit` and
`point` into `onstation`. Both are named in task 1.1's list of resolved
labels/tokens; neither is a raw wire enum reaching the pill.

**`activityKind` per existing branch** (no branch is added, reordered, or
removed):

| existing branch | `activity` (unchanged) | `activityKind` | `etaWorldMs` |
|---|---|---|---|
| `fleet.jump` | `In transit` | `transit` | `fleet.jump.arriveMs` |
| still burning | `Under way` | `underway` | `state.Burn.ArriveMs` |
| `Mode === DRIFT` | `Drifting` | `drifting` | — |
| docked + running mine | `Mining` | `mining` | `runningMine.eta` |
| docked | `Docked` | `docked` | — |
| otherwise, `parkMode === 'stationkeep'` | `On station` | `holding` | — |
| otherwise | `On station` | `onstation` | — |

`etaWorldMs` is the **anchor** and never moves between renders. `remainingMs`
keeps its exact current expressions (including the `Math.max(0, …)` on the
jump branch and its absence on the burn branch).

### 2.3 Label resolution — one function, used twice

`hostLabel` (keyed by `fleet.attachedTo`) and `targetLabel` (keyed by
`state.Burn.Target.BodyId`) use **the same** resolution, per round 2 F1:

```
resolveBody(id) === { kind:'feature', type, id }  →  `${type} ${id}`
resolveBody(id) === { kind:'gate', destSystemId } →  `Gate ${nameOf(destSystemId)}`
                                                     (nameOf falls back to the raw id)
resolveBody(id) === null, or resolveBody undefined →  id            (the raw served id)
```

and, for `targetLabel` only, when `Target.BodyId` is null and `Target.Point`
is set: the fixed string `a point in space`. **No raw X/Y/Z figure is ever
composed into it.**

Nothing in the system view's wire carries a display name for a body
(`SpaceBody`/`SpaceLaneGate` in `lib/types/system-space.ts` have no `name`
field). System names — from the galaxy read — are the only served names. That
is why a gate can name its destination and nothing else can. Do not invent a
name for a feature; do not "prettify" the type word.

The mounting view supplies `resolveBody` as:

```ts
const resolveBody = useCallback((bodyId: string): ResolvedBody | null => {
  const f = interior.data?.features.find((x) => x.id === bodyId)
  if (f) return { kind: 'feature', type: f.type, id: f.id }
  const g = interior.data?.laneGates.find((x) => x.id === bodyId)
  if (g) return { kind: 'gate', destSystemId: g.destSystemId }
  return null
}, [interior.data])
```

A failed interior read makes `interior.data` undefined, so every lookup
returns `null` and every label degrades to the raw id — which is exactly what
*A docked fleet at an unresolvable host degrades the pill* and *An
unresolvable burn target degrades the pill* require. No separate failure
branch is needed or wanted.

### 2.4 `PARK_KIND_*` — exported once

`Park.Kind` is an opaque wire enum hard-coded in two places today
(`FleetActionsPanel.tsx:310-311`, `space-scene.ts:589,602`). Add to
`frontend/lib/types/fleet.ts`, beside the existing `SHIP_MODE_*` constants
that set the precedent:

```ts
// space.ParkKind's iota. A NAME for a wire enum — not a mirror of a rule:
// nothing here recomputes anything backend/space decides.
export type ParkKind = 0 | 1 | 2
export const PARK_KIND_ORBIT: ParkKind = 0
export const PARK_KIND_STATIONKEEP: ParkKind = 1
export const PARK_KIND_POINT: ParkKind = 2
```

and repoint **both** existing sites in the same task, so the derivation is not
the third copy. This is a rename only: no behaviour changes at either site.
(It is not a mirror-map concern — `check-mirror-map.sh`'s anti-mirror pairs
compare declared *function* names between `backend/space` and
`frontend/lib/space`; `lib/types/fleet.ts` holds neither.)

`stationKeepRateTonsPerSecond` is passed through **as served**. It is never
re-derived (`FleetActionsPanel.tsx:18`'s own comment already forbids that),
and round 2 F5 removed it from the advancing-figure rule: a served constant
cannot advance between reads.

---

## 3. The testid inheritance contract (RULING 17), exactly

The strip's hold and credits cells render under the fleet panel's former
testids so five tier-4 specs need no edit. Architect MAJOR 3 established that
RULING 17's list is incomplete **and** that it is a DOM-*shape* contract.
Both halves are normative here.

### 3.1 The complete inherited set — eleven testids

| testid | element in the strip | carries |
|---|---|---|
| `balance-readout` | wrapper of the credits cell's label + value | — |
| `balance-value` | `<span>`, keeps `data-available="true"\|"false"` | exactly one `[data-raw]` when available, **zero** when unavailable |
| `balance-figure` | `<Figure>` inside `balance-value`, rendered only when the balance is shown | `data-raw`, `data-unit="credits"` |
| `balance-live-region` | sr-only `role="status" aria-live="polite"` span, **string only** | no attributes |
| `hold-readout` | wrapper of the whole hold cell | — |
| `hold-capacity` | `<span>` wrapping used + `/` + total | **the one sanctioned composite** (two `[data-raw]`) |
| `hold-capacity-used` | `<Figure>` | `tons`, raw = `cargoCapacity − freeHold` (client-derived) |
| `hold-capacity-total` | `<Figure>` | `tons`, raw = `roster.cargoCapacity` |
| `hold-free` | `<Figure>`, the word `free` is its **sibling** | `tons`, raw = `roster.freeHold` (served, never `capacity − used`) |
| `hold-<kind>` | per-kind wrapper carrying the kind label as text | exactly one `[data-raw]` |
| `hold-<kind>-tons` | `<Figure>` inside it | `tons`, raw = that kind's served tons |

`balance-readout`, `hold-capacity` and `hold-<kind>` are the three the ruling's
list omitted, and two of them are read by tier-4 specs.

### 3.2 The shape travels with the names — three hard rules

1. **Exactly one `[data-raw]` per inherited testid's subtree.**
   `e2e/helpers/space-view.ts:477-497` (`digits()`) throws on **zero**
   ("the figure moved") and throws on **two or more** ("a composite").
   `hold-capacity` is the single exception and is only ever read through
   `-used`/`-total`. This is why the gauge (§5) carries no `data-raw` at
   all, and why the hold gauge must be a **sibling** of `hold-capacity` and
   of every `hold-<kind>` — never nested inside one. A strip laid out as
   "one flowing row of figures" instead of labelled sections is the natural
   build and breaks this immediately.
2. **Exactly one element per inherited testid in the whole page.**
   Playwright's `page.getByTestId()` is strict-mode: two matches is a thrown
   locator error, not a first-match. So the panel's readouts (§8.3) and the
   strip's cells **must not coexist in any committed state** — see §12,
   step E, which makes 8.1/8.2/8.3 one atomic step.
3. **`balance-value` keeps `data-available`.** It is how the unavailable
   state is asserted without parsing copy, and `digits(page,'balance-value')`
   is called on it directly, so when `data-available="false"` the span must
   contain **no** `[data-raw]` (the copy `Unavailable` only).

### 3.3 The five tier-4 specs this protects — and what breaks if the shape drifts

| spec | reads | breaks if |
|---|---|---|
| `frontend/e2e/tests/refuel-commit.spec.ts` (`:74-75,131-132,150-152`) | `fleet-fuel-<id>`, `fleet-range-<id>` (roster row — untouched), `digits('hold-fuel')`, `digits('balance-value')` | `hold-fuel` gains a second `data-raw` (a gauge segment nested in it), or `balance-value` loses its figure |
| `frontend/e2e/tests/slice.spec.ts` (`:92-94,126-183`) | `hold-readout` visible, `digits('hold-capacity-used')`, `holdKindTons(kind)`, `digits('balance-value')` | `hold-readout` is conditionally mounted, or `hold-capacity-used` moves off its `<Figure>` |
| `frontend/e2e/tests/space-journey.spec.ts` (`:178-222`) | `hold-readout` **textContent** polled for change, `digits('balance-value')`, `digits('hold-fuel')` | the per-kind tonnage stops being *text inside* `hold-readout` (e.g. moved into an `aria-label` or a title) |
| `frontend/e2e/tests/space-double-submit.spec.ts` (`:268-305`) | `holdKindTons(kind)`, `digits('balance-value')` | as above |
| `frontend/e2e/tests/new-user.spec.ts` (`:112`) | `hold-readout` visible | the hold cell is removed rather than rendered absent when no fleet is acting |

`holdKindTons` (`e2e/helpers/space-view.ts:510-513`) returns `0` when the
`hold-<kind>` row is **absent**, and calls `digits()` when present. So a kind
held at zero must render **no row** — the panel's current
`Object.entries(held)` behaviour — and the strip must keep that. Do not render
an empty row per known kind.

### 3.4 Ordering

The panel iterates `Object.entries(held)` (insertion order). The strip
**sorts by kind name**, ascending, plain codepoint comparison, no `Intl`/
`localeCompare` (spec: "ordered stably by kind so two reads of the same pool
render the same order"). This is a visible change from the panel's order and
is intended; no e2e reads order.

---

## 4. `VitalsStripPill` — the closed props signature

Three passes settled this (round 1 BLOCKER 2, round 2 F2/F3/F4/F6, round 3
MAJOR 1). The signature is **four props, and no `Fleet`**:

```ts
export interface VitalsStripPillProps {
  /** The derivation's output, or its explicit absence: the mounting view
   *  supplies null whenever the own-fleets read's most recent attempt has
   *  failed. */
  status: RosterRowStatus | null
  /** roster.stranded, served. An adornment of the CELL (RULING 13) — it
   *  rides beside the pill and never replaces its activity. */
  stranded: boolean
  /** The mounting view's servedScale — UN-defaulted (RULING 8). */
  scale: number | undefined
  /** The mounting view's ticking, projected worldTime. NEVER serverWorldTime. */
  worldTime: number
}
```

### 4.1 What the invariant is, stated once (round 2 F2, verbatim in spec 204-209)

> The pill SHALL NOT receive a `Fleet`, and SHALL NOT read `Fleet.state`,
> `attachedTo`, a park kind, or an action ETA **from the fleet read**. It
> renders only the shared derivation's output. The derivation MAY expose the
> park kind and a remaining ETA as **additive** fields, and the pill MAY
> branch on those, because they are the derivation's conclusions, not the
> fleet's raw state.

The invariant's content is "never receives a `Fleet`" — **not** "receives
exactly N props". `scale` and `worldTime` are ambient render inputs carrying
no fleet state; admitting them does not reopen it. The prohibition stays a
type error: a component that cannot see `Fleet` cannot branch on it.

Note the scope: this binds **the pill**. The strip container and the fuel and
hold cells legitimately receive the acting `Fleet` — they render its roster.

### 4.2 The arithmetic the pill DOES perform (round 3 MAJOR 1)

There is no formatter taking an instant and a clock: `formatByUnit(raw, scale,
unit)` dispatches `world-ms-span-left` to `formatDuration(spanMs, …)`, so
`raw` is a **span** and every live call site subtracts at the caller
(`FleetActionsPanel.tsx:484`, `ScanControl.tsx:221`, `FleetRoster.tsx:202`).

**The pill subtracts, and that is permitted.** Re-expressing the derivation's
own anchor against the projected clock is presentation arithmetic. Deriving
*state* — a tone, an activity, a place on the ladder, or the anchor itself —
is what the strip may never do.

```tsx
// permitted, and the ONLY arithmetic in this component
const span = status.etaWorldMs !== undefined ? status.etaWorldMs - worldTime : undefined
<Figure raw={span} unit="world-ms-span-left"
        text={formatByUnit(span ?? NaN, scale, 'world-ms-span-left')}
        data-testid="vitals-pill-eta" />
```

**Never** `status.remainingMs` for the pill's countdown: it is a span frozen
at derivation time, and the advancing test (task 3.5) renders the pill twice
with the *same* status object at two `worldTime` values. Do **not** extract
this into a named local `countdown`/`formatEta` helper — `lib/format/
guards.test.ts:141`'s `LOCAL_FORMATTER_RE` fails the per-commit gate on those
two names anywhere under `components/space` or `components/fleet`.

### 4.3 The rendered ladder — a switch on `activityKind`, nothing else

| `activityKind` | pill text | extra figure |
|---|---|---|
| `null` status | `figure-formatting` absent form | none |
| `transit` | `In transit` | `vitals-pill-eta` |
| `underway` | `Under way to {targetLabel}` | `vitals-pill-eta` |
| `mining` | `Mining` | `vitals-pill-eta` |
| `drifting` | `Drifting` | none |
| `docked` | `Docked at {hostLabel}` | none |
| `holding` | `Holding` | `vitals-pill-rate` |
| `onstation` | `On station` | none |

`vitals-pill-rate` is `<Figure raw={status.stationKeepRateTonsPerSecond}
unit="tons-per-world-s" …>` — the same unit token
`add-figure-formatting`'s contract pinned for `stationkeep-rate`. It is
served, presented at the served scale, and **never computed against the
projected clock**.

With `scale === undefined`, `formatByUnit` returns the absent form for both
`world-ms-span-left` and `tons-per-world-s` on its own. Keep `raw` finite —
`figure-formatting`'s R13 explicitly permits an element rendering the absent
form for want of a scale.

`hostLabel`/`targetLabel` are plain text **siblings** of any `<Figure>`, never
inside it: served ids contain digits, and R13's second AND clause forbids a
complete numeric token inside a figure element other than the one its
`data-raw` produced.

### 4.4 How the property test is written (task 3.5, round 3 MINOR 4)

> **GIVEN** two hand-built `RosterRowStatus` values that are **equal and not
> absent** — `null === null` would otherwise satisfy "equal output" with two
> absent pills and prove nothing —
> **WHEN** the pill is rendered for each at the same `worldTime`, supplied
> only that status, a `stranded` flag, a `scale` and that `worldTime`, with
> **no fleet object in scope in the test file** —
> **THEN** the two renders' pill text is identical.

Its companion: render **one** status object twice at two `worldTime` values
and assert `vitals-pill-eta`'s text changed while the status object is
referentially the same — "a countdown advancing with no new derivation
output". Both are unit tests of `VitalsStripPill`, never of `SystemSpaceView`.

---

## 5. `Gauge` — the shared decorative atom

Backs the fuel cell's plain fill and the hold cell's kind-segmented fill.

### 5.1 Surface

```ts
export type GaugeState = 'no-data' | 'empty' | 'filled'

export interface GaugeSegment { kind: string; tons: number }

export interface GaugeProps {
  /** roster.cargoCapacity. undefined = roster not served. */
  capacity: number | undefined
  /** undefined = nothing served for this pool. [] = served and empty. */
  segments: GaugeSegment[] | undefined
  'data-testid': string
  className?: string
}
```

### 5.2 It is decorative, and speaks no figure

`aria-hidden="true"` on the root. **No** `data-raw`, **no** `data-unit`, no
`aria-valuenow`/`aria-valuetext`, no percentage text, no accessible name, no
`role`. Every number a player or a test reads is an adjacent `<Figure>` in
the cell's text. Three constraints force this and any one would:

1. `FigureUnit` is a closed eleven-token union with no ratio or percentage; a
   gauge that spoke its fill would be a player-facing figure with no token,
   which RULING 6 says needs a `figure-formatting` delta this change does not
   have.
2. A `data-raw` inside the gauge that also sits inside `hold-<kind>` or
   `hold-capacity` makes `digits()` throw — §3.2 rule 1.
3. RULING 20's "never colour alone" is satisfied by the adjacent text, which
   is required to exist anyway.

### 5.3 The state attribute — **`data-gauge-state`**, three named values

Round 3 caught that "differ in a DOM-observable attribute" is satisfied by
`width:0%` vs `width:23%` — i.e. by exactly the implementation the
requirement forbids. So the attribute is named and its values are pinned:

| value | when |
|---|---|
| `no-data` | `capacity === undefined` **or** `segments === undefined` |
| `empty` | segments served, and their total tons is `0` (including `[]`) |
| `filled` | at least one segment with `tons > 0` |

The attribute is a plain `data-*` state token. It is **not** `data-raw`, is
never announced to assistive technology, and is never the sole carrier of a
figure.

Consequences the scenarios turn on:
- **Fuel gauge, unserved roster** → `no-data`. **Fuel gauge, fleet holding no
  fuel** → also `no-data`, because the wire omits a kind held at zero, so a
  dry fleet and an unserved roster are one absence (Decision 2). The fuel
  gauge therefore never renders `empty`.
- **Sub-pixel case** (task 4.4): `0.05 t` against `200 t` → `filled`,
  distinguishable from `no-data` by this attribute alone, with the fill
  geometry ignored.
- **Hold gauge**: `no-data` for an unserved roster, `empty` for a served but
  empty pool, `filled` otherwise — the distinction the spec's
  no-data/no-segments scenario asserts.

### 5.4 Geometry and denominator

**Both gauges are drawn on one tons-to-pixels scale, and its denominator is
the served `roster.cargoCapacity`** (RULING 22). Fuel fill is
`cargo.fuel / cargoCapacity`; each hold segment is `cargo[kind] /
cargoCapacity`. `fuel + freeHold` was rejected because the denominator
shrinks as ore is loaded — mining would make the fuel gauge read *fuller with
no fuel added*, and a hauler would render a full fuel gauge one burn before it
strands.

- Fuel cell call: `segments={fuelTons === undefined ? undefined : [{ kind: 'fuel', tons: fuelTons }]}`.
- Hold cell call: one segment per kind in the served pool, `fuel` included as
  an ordinary kind, **sorted by kind name** (§3.4).
- Each segment's width is `clamp(tons / capacity, 0, 1) * 100` as **inline
  `style={{ width }}`**; the cumulative width is clamped so segments never
  exceed 100%. Geometry is never a computed colour class (§11.1).
- `capacity <= 0` or non-finite → `no-data`.

### 5.5 Colours

Rail and segment shades come from `frontend/CLAUDE.md`'s zinc palette **with
dark variants**, from a fixed array indexed by sorted segment position, e.g.
`bg-zinc-400 dark:bg-zinc-300` / `bg-zinc-500 dark:bg-zinc-400` /
`bg-zinc-600 dark:bg-zinc-500` / `bg-zinc-700 dark:bg-zinc-600`, rail
`bg-zinc-300 dark:bg-white/[0.12]`. Forbidden here: `dark:bg-zinc-800`,
`dark:bg-zinc-900`, bare `bg-zinc-100`/`text-zinc-900`/`border-zinc-200`
without a dark variant, and any `gray`/`slate`/`neutral` (§11.1).

---

## 6. `useCorporationSessionOptional()`

### 6.1 Why it is needed

`useCorporationOptional()` returns `Corporation | null` and drops `isError`.
`isError`/`error`/`refetch` live on `CorporationContextValue`, reachable only
through the **throwing** `useCorporationContext()`, which the space view must
not call — a missing provider must never blank the board. So the credits
cell's stale-balance rule ("resolved once and has since failed to refresh
reads Unavailable, not the cached figure") has no reachable implementation
path today (round 1 MAJOR 7).

### 6.2 Surface

```ts
// components/corporation-provider.tsx, beside useCorporationOptional
export function useCorporationSessionOptional(): {
  corporation: Corporation | null
  isError: boolean
} {
  const ctx = useContext(CorporationContext)
  return { corporation: ctx?.corporation ?? null, isError: ctx?.isError ?? false }
}
```

Non-throwing, no provider required, `isError` defaulted to `false` because
`CorporationContextValue.isError` is optional at the type level (the provider
always supplies it at runtime; the optionality exists so predating test
doubles keep type-checking). `useCorporationOptional` is left exactly as it is.

### 6.3 Where it is called — the mounting view, not the strip

`SystemSpaceView` calls it and derives one value:

```ts
const { corporation, isError: sessionFailed } = useCorporationSessionOptional()
const creditsShown: number | null = sessionFailed ? null : (corporation?.credits ?? null)
```

`creditsShown` alone drives `balance-value`'s `data-available`,
`balance-figure`'s presence, and `balance-live-region`'s copy — one expression
satisfies both the never-resolved and the resolved-then-failed cases. The
strip receives plain props, which is what makes *The Strip Issues No Read of
Its Own* trivially true and testable in isolation.

`FleetActionsPanel` keeps its own `credits` prop from
`useCorporationOptional()` — see §8.3.

---

## 7. The strip's own testids and props

### 7.1 New testids — normative strings

| testid | element |
|---|---|
| `vitals-strip` | the container |
| `vitals-fleet-cell` / `vitals-fuel-cell` / `vitals-hold-cell` / `vitals-credits-cell` / `vitals-clock-cell` | the five cells (the "five cells" count and the overlap assertions read these) |
| `vitals-fleet-id` | the acting fleet's served id, plain text, no `data-raw` (an id is not a figure) |
| `vitals-fleet-chevron` | the menu trigger `<button>` |
| `vitals-fleet-menu` | `role="menu"` |
| `vitals-fleet-menu-item-<fleetId>` | `role="menuitem"` per owned fleet |
| `vitals-state-pill` | the pill root |
| `vitals-pill-eta` | `<Figure>`, `world-ms-span-left` |
| `vitals-pill-rate` | `<Figure>`, `tons-per-world-s` |
| `vitals-stranded` | the stranded marker, sibling of the pill |
| `vitals-fuel-tons` | `<Figure>`, `tons`, raw `roster.cargo.fuel` |
| `vitals-fuel-range` | `<Figure>`, `range`, raw `roster.estimatedRange`; the word `range` is its sibling label |
| `vitals-fuel-draining` | the draining marker, present only while burning |
| `fuel-gauge` / `hold-gauge` | the two `Gauge` mounts |
| `vitals-clock-stamp` | `<Figure>`, `world-ms-instant`, `title={instantScaleLabel(scale)}` |

Plus the eleven inherited testids of §3.1, unchanged strings.

### 7.2 `VitalsStrip` props

```ts
export interface VitalsStripProps {
  acting: Fleet | null
  ownedFleets: Fleet[]                    // ALL owned, never filtered to this system
  fleetsFailed: boolean                   // own-fleets read's last attempt failed
  status: RosterRowStatus | null          // null when fleetsFailed
  onSelectFleet: (fleet: Fleet) => void   // === SystemSpaceView's selectFleet
  systemNames: Record<string, string>
  credits: number | null                  // creditsShown (§6.3)
  scale: number | undefined               // servedScale, un-defaulted
  worldTime: number                       // projected, ticking
  serverWorldTime: number | undefined     // the LAST SERVED instant (§7.4)
}
```

`fleetsFailed` drives three things at once and must be one prop, not three:
`status = null` (pill absent), the chevron menu empties, and the fuel/hold
cells read absent. The strip renders **no error and no retry of its own** —
that surface belongs to the fleet panel (`space-fleets-error` /
`space-fleets-retry`, `SystemSpaceView.tsx:793+`), and *The Strip Survives a
Failed Own-Fleets Read* says so explicitly.

### 7.3 The chevron

Task 2.4 permits "a native `<select>` or an ARIA `menu`/`listbox` pattern".
**Pinned: a hand-rolled `<button aria-haspopup="menu" aria-expanded>` plus a
`role="menu"` of `role="menuitem"` buttons**, in `VitalsStripFleetCell.tsx`.

Rationale, because this deviates from `frontend/CLAUDE.md`'s Catalyst-only
rule (flagged in §14.1): jsdom implements no native-select popup, so "opens
with Enter or Space", "entries reachable by arrow keys", and "Escape closes
without choosing and returns focus" would be unassertable at tier 1 against a
`<select>` and provable only at the archive gate — fatal for a change with a
dedicated keyboard-operability requirement and three scenarios on it.
Catalyst's `listbox.tsx` is an unused, full-width `min-h-9` form control that
passes no `data-testid` to its trigger; `dropdown-v2.tsx` is unused and pulls
framer-motion into a render loop over a WebGL canvas.

Behaviour: Enter/Space opens and focuses the first item; ArrowUp/ArrowDown
move within the menu; Enter activates; Escape closes without choosing and
returns focus to the chevron. Every item calls `onSelectFleet(fleet)` —
`SystemSpaceView`'s existing `selectFleet` (`:610-622`), which already
implements all three outcomes (lane transit → `/`, another system →
`/systems/:id`, this system → `setActingFleetId`). The chevron adds **no
second decision path**; that is what makes RULING 15 sound.

On a same-system choice: focus returns to the chevron and its
`aria-label`/accessible name names the now-acting fleet.

Entry label: the fleet's served id plus `systemNames[fleet.systemId]`,
falling back to the raw system id; for a fleet in lane transit, that it is
under way between systems. The menu never filters to the open system, and it
empties (rather than freezing membership or destinations) when
`fleetsFailed`. The strip does not distinguish "no fleets" from "read failed"
— a deliberate consequence of the ownership split, recorded in the spec.

`onActivateFleet` (the fleet-mark path, `SystemSpaceView.tsx:747`) currently
calls `setActingFleetId` directly. It is **not** refactored by this change:
marks are always in-system, so it is the same outcome by the narrower path.
Task 2.3 is a verification that no path adds the fleet to the space-view
selection — not a licence to rewire the mark.

### 7.4 The clock cell — the F8 / round-3 MAJOR 3 resolution

Two clock values exist in `SystemSpaceView.tsx:415-417` and the strip needs
**both**:

- `worldTime` — `useWorldTime(serverWorldTime, { scale: clockScale })`,
  ticking, projected at `clockScale = servedScale ?? 1`.
- `serverWorldTime` — the last served instant
  (`interior.data?.worldTime ?? acting?.worldTime ?? allFleets[0]?.worldTime`).

Task 8.1's "never `serverWorldTime`" binds **the advancing figures** (the
pill's countdown and the stamp once a scale is served). The stamp's
hold-at-last-served behaviour needs `serverWorldTime` by name, which is why
8.1 now also says "plus the last served world instant itself".

Rendering, in order:

```ts
// a REF latch, not a value test: `worldTime` is never undefined, so
// "has a world time ever been served" cannot be read off it.
const everServed = useRef(false)
if (serverWorldTime !== undefined) everServed.current = true

const scaleServed = scale !== undefined
const instant =
  !everServed.current ? undefined
  : scaleServed      ? worldTime          // advances with the projected clock
  :                    serverWorldTime     // HOLDS, and re-renders at the NEWEST served instant
```

then `<Figure raw={instant} unit="world-ms-instant" text={formatByUnit(instant
?? NaN, scale, 'world-ms-instant')} title={instantScaleLabel(scale)}
data-testid="vitals-clock-stamp" />`.

Three consequences, each with its own scenario:
- Never served → the **whole stamp** reads absent, never `T+ 0d 00:00`.
  `useWorldTime`'s client-local animation default is not a served value.
- Scale unserved → `T+ Dd HH:MM ×—` at the last served instant, **held**;
  it re-renders at the **newest** served instant when a later read lands, and
  never projects forward at an assumed scale of 1 (Decision 10). A latch of
  the first projected `worldTime` would pass the two-render scenario and go
  stale on the second read — do not implement it that way.
- Both served → advances as the projected clock advances, no refetch.

Pass the **same number** to `raw` and to `formatByUnit`; do not round one and
not the other, or `assertFiguresMatchModule` can disagree across a minute
boundary. The sr-only `space-world-clock` probe (`SystemSpaceView.tsx:670`)
**stays** and is untouched (RULING 21).

### 7.5 Fuel, hold, credits cells — the remaining pins

- **Fuel**: `raw={roster?.cargo?.fuel}` and `raw={roster?.estimatedRange}`,
  `text={formatByUnit(… ?? NaN, scale, 'tons'|'range')}` — the exact shape
  `FleetRoster.tsx:218-231` uses for the same fleet, so the two surfaces
  cannot print different figures. **No `?? 0` anywhere.** The range figure
  carries no unit name of its own, so the sibling label `range` is required.
  Draining marker while `activityKind === 'underway'`; figures and fill move
  only when a read lands — never interpolated.
- **Hold**: `hold-capacity-used` raw is `cargoCapacity − freeHold`
  (client-derived, matching `FleetActionsPanel.tsx:103-104`);
  `hold-capacity-total` raw is `cargoCapacity`; `hold-free` raw is the served
  `freeHold` — **never** `capacity − used`, which the empty-hold scenario
  asserts directly. An unserved roster reads absent for all three and renders
  no segments; it never reads `0 / 0 t`.
- **Credits**: the credits cell is the strip's **only** announcing surface. A
  landed burn/jump/mine is announced once, by the mounting view's existing
  `space-announcer` (`SystemSpaceView.tsx:676-678`). `balance-live-region`'s
  copy is the panel's verbatim: `'Balance unavailable.'` /
  `` `Balance ${formatByUnit(credits, scale, 'credits')}.` `` — never empty
  text, so a transition in either direction is announced.

---

## 8. What is deleted, and what must survive the deletion

### 8.1 Deleted in `SpaceStage.tsx`

The four `camera-orbit-*` and four `camera-pan-*` buttons (§10).

### 8.2 Deleted in `FleetActionsPanel.tsx`

The balance block (`:347-367`) and the hold block (`:376-419`) only.

### 8.3 What must survive it — three traps

1. **`panel-error-live-region` (`:368-373`) stays.** It is a *sibling* of the
   balance block, not inside it. Its comment and its test re-point at
   `docked-fleet-actions`' new *A Failed Command Is Announced to Assistive
   Technology* requirement (task 8.2/8.4).
2. **The `credits` prop stays.** `FleetActionsPanel.tsx:280` uses it for
   refuel's affordable default (`Math.floor(credits / fuelPrice)`); deleting
   the prop with the readout silently changes that default to `freeHold`.
   Likewise `held` and `freeHold` (`:94-95`) stay — they drive mine/sell/
   refuel. Only the **figure-only** raws `freeHoldRaw`, `cargoCapacityRaw`,
   `cargoUsedRaw` (`:101-104`) become unused and must be deleted, or eslint's
   no-unused-vars fails the gate.
3. **`FleetActionsPanel.test.tsx:941`'s "no-panel-surfaces-while-X"
   enumeration references `balance-readout`** and must be updated in task 8.4
   along with the migrated `— the cargo hold readout` (`:357`) and
   `— the credit balance readout` (`:870`) describes.

---

## 9. Clearing the bottom band

The strip is a single **56px** bar (`docs/plans/system-hud.md` Surface 1;
link 2b's "~164px detail area, 220px total" is arithmetic on this figure).
Three existing occupants of the bottom edge move, all one-line, none optional:

| site | today | becomes |
|---|---|---|
| command column, `SystemSpaceView.tsx:791` | `absolute inset-y-4 right-4 … w-72` | `absolute top-4 bottom-[4.5rem] right-4 …` |
| `sightings-unavailable`, `SystemSpaceView.tsx:759` | `absolute bottom-4 left-1/2 -translate-x-1/2` | `absolute bottom-[4.5rem] left-1/2 -translate-x-1/2` |
| camera cluster, `SpaceStage.tsx:609` | `absolute bottom-4 left-1/2 … -translate-x-1/2 grid-cols-4` | `absolute bottom-[4.5rem] right-4 grid grid-cols-4` (drop `left-1/2 -translate-x-1/2`) |

`4.5rem` = the 56px strip + a 16px gap. Each site carries a comment naming
`system-console`'s strip as the reason.

Why each is load-bearing, not cosmetic: the command column's
`[&>*]:pointer-events-auto` children would sit **over** the clock and credits
cells and eat their pointer events; `sightings-unavailable` carries the retry
affordance `system-space-view`'s *The Sweep Surface's Reads Fail
Independently…* mandates, so occluding it makes a live requirement
unreachable. Task 7.3/7.4's overlap assertion covers all three at 1280×720.

The strip mounts as a sibling of the canvas layer in `SystemSpaceView`'s
root, `absolute inset-x-0 bottom-0 h-14`, above the stage in z-order,
`pointer-events-auto`.

---

## 10. The camera cluster's new shape

### 10.1 Four sibling cells, and one that is not a cell

- **`camera-orbit`** — one cell: `tabIndex={0}`, `role="group"`,
  `CAMERA_CONTROL_ATTR`, the `onKeyDown` handler, and **`pointer-events-auto`
  on itself** (the wrapper keeps `pointer-events-none`, and the focusable
  element is no longer the wrapper). It replaces the four `camera-orbit-*`
  buttons; discrete pointer orbit is already served by canvas drag-to-orbit,
  which is live and required, so no capability is lost.
- **`camera-zoom-in`**, **`camera-zoom-out`**, **`camera-recenter`** —
  unchanged `CameraButton`s, now siblings of `camera-orbit` rather than
  children of the focusable group.
- The wrapper `space-camera-controls` keeps its testid and
  `CAMERA_CONTROL_ATTR`, and has **exactly four element children** — that is
  what makes "exactly four cells" a DOM-checkable count.
- **`select-pan-target-point` moves out of the wrapper** entirely (it is a
  selection affordance, not a camera cell, and must not be counted in the
  four). It becomes a sibling of the wrapper, rendered immediately after it
  in DOM order so the tab order is unchanged, and it **must carry
  `CAMERA_CONTROL_ATTR` on itself**: `SpaceStage.tsx:252` suppresses canvas
  picking via `target.closest('[data-space-camera-control],
  [data-affordance]')`, and outside that subtree one click would fire both
  its selection and the canvas pick.

### 10.2 Keyboard pan — `Shift` + arrows on `camera-orbit`

Same `onKeyDown`, `e.shiftKey` branching to `panBySteps(prev, dx, dy, extent)`
with the **exact** step vectors the deleted buttons used — Left `[-1,0]`,
Right `[1,0]`, Up `[0,1]`, Down `[0,-1]`. Bare arrows keep orbiting via
`orbitBySteps`. The pan bound and increment are unchanged code.

Rejected and recorded: `Ctrl`+arrow (macOS Mission Control eats it, and macOS
is the dev platform), `Alt`+arrow (browser back/forward), `WASD`/`IJKL` (a
second key vocabulary for an input already reached by arrows).

The cluster's accessible name or description **states the binding** (UX's
accepted finding under RULING 23): deleting four labelled buttons removes
where a screen-reader user learned pan existed. One string, on `camera-orbit`.

### 10.3 At-limit state — attributes on `camera-orbit`, not the live region

`camera-limit-status` (`SpaceStage.tsx:552-558, :646-648`) is a **single-slot,
priority-masked** channel (`zoom > pan > orbit`). A camera at both the zoom
and the pan clamp reports **only zoom**, so routing pan's at-limit state onto
it would make *Keyboard input at a clamp is distinguishable from no input*
false for a reachable state — a regression against a live SHALL, introduced by
the shrink. It also loses per-direction precision the current tests assert
(`SpaceStage.interaction.test.tsx:293-296`).

So `camera-orbit` carries:

- **`data-pan-at-limit`** — a space-separated set of blocked directions drawn
  from `{left,right,up,down}`, computed per render from the existing
  `panAtLimit(right, up)` helper (`:542-549`), and **omitted entirely** when
  the set is empty.
- **`data-orbit-at-limit`** — `min` | `max`, from the existing `orbitLimit`,
  absent away from the clamp. It moves here because the
  `camera-orbit-up`/`-down` buttons that carry it today are being deleted;
  that is part of the shrink, not an extra.

`camera-limit-status` and its priority chain are left **exactly** as they are:
two elements, two purposes.

### 10.4 The fourteen breaking tests

Architect MAJOR 11 measured fourteen, not four. All are in
`frontend/components/space/SpaceStage.interaction.test.tsx`:

| line | test | why it breaks | new driver |
|---|---|---|---|
| 184 | A keyboard control selects the point at the camera's pan target | `camera-pan-right` (:188) | `Shift`+ArrowRight on `camera-orbit` |
| 205 | A keyboard-only player can pan to a point away from the star | `camera-pan-right` ×5 (:211) | `Shift`+ArrowRight ×5 |
| 236 | Pan keys translate the camera's target | `camera-pan-right` (:239) | `Shift`+ArrowRight |
| 245 | **SDET-added**: the pan input is a DISTINCT control from the orbit input | asserts all four pan buttons exist (:250-254) | **rewritten**: bare arrow ⇒ yaw changes, target unchanged; `Shift`+arrow ⇒ target changes, yaw unchanged — the same claim, against the surviving element |
| 278 | Keyboard input at a clamp is distinguishable from no input | `camera-pan-right`'s `data-at-limit` (:291-296) | drive to the pan clamp by `Shift`+arrow; assert `data-pan-at-limit` **contains** `right` and **not** `left`, **while `camera-zoom-in` is also at its clamp** — the priority-chain regression guard |
| 316 | Recenter restores default framing on demand | `camera-pan-right` (:320) | `Shift`+arrow |
| 329 | Recenter is reachable from the keyboard | `camera-pan-right` (:331) | `Shift`+arrow |
| 352 | Activating a camera control does not change the selection | iterates `camera-pan-right`, `camera-orbit-right` (:355) | iterate the four surviving cells; add a `Shift`+arrow press |
| 364 | Camera state survives a selection change and a realtime refetch | `camera-pan-right` (:368) | `Shift`+arrow |
| 397 | Camera resets when the system changes | `camera-pan-right` (:401) | `Shift`+arrow |
| 461 | An off-screen body is selectable the same way | `camera-pan-right` ×200 (:465) | `Shift`+arrow ×200 |
| 513 | Picking survives camera movement | `camera-pan-right`, `camera-orbit-right` (:516,518) | `Shift`+arrow, bare arrow |
| 530 | A point-in-space click resolves correctly after camera movement | `camera-pan-right`, `camera-orbit-up` (:532,533) | `Shift`+arrow, bare arrow |
| 545 | A click beyond the pick radius still clears the selection after camera movement | `camera-pan-right`, `camera-orbit-right` (:547,549) | `Shift`+arrow, bare arrow |

**Nine of them (316 onward) belong to requirements this change does not
touch** — recenter, selection survival, pick radius. They only *used* the pan
button as a camera-mover. That is where a silent selection regression would
hide, and it is why each must be re-driven rather than deleted or loosened.
The three `select-pan-target-point` tests (130, 184, 205) keep their
assertions; only their camera-moving lines change. The header comment at
`:21-24` enumerating the old testids is updated too.

---

## 11. Gates that will bite

### 11.1 Colour compliance (`check-color-compliance.py`, tier 0)

Rules that apply to anything the strip and gauge add:

- **error** (fails the file): any `(text|bg|border|ring|shadow|from|to|via)-
  (gray|slate|neutral)-NNN`; `dark:bg-zinc-900`.
- **warning** (prints, does not fail — but is gate noise the orchestrator
  reads): `dark:bg-zinc-800`; bare `bg-zinc-100`, `text-zinc-900`,
  `border-zinc-200` with no `dark:` variant **on the same line**;
  hard-coded hex in an inline style.

Note the same-line heuristic: a `className` split across lines can trip a
warning even when the dark variant exists — keep each colour pair on one line.

Gauge fill is **inline `style={{ width }}` geometry only**; a computed colour
class per fill level would be both a palette violation risk and unreviewable.
Segment shades come from §5.5.

### 11.2 `figure-formatting` enforcement (tier 1)

Every strip suite that renders a figure calls
`assertFiguresMatchModule(container, { scale })`
(`frontend/lib/format/assert-figures.ts`) — this is a live requirement
(`figure-formatting`'s *A rendered figure's text is the module's own output
for its raw value*), and the seven existing space/fleet suites all do it.
Two traps:

- The helper **throws when the container carries zero figures** — absent-state
  renders (unserved roster, no acting fleet) use `assertNoFigures` instead.
- Its second clause forbids any complete numeric token inside a
  `data-raw`-carrying element other than the one its own raw produced. Keep
  host/target labels, kind names and fleet ids as **siblings** of `<Figure>`,
  never children. Using `<Figure>` guarantees this by construction — it
  renders exactly one `<span>` with `text` as its only content.
- `guards.test.ts:141` fails on a local `countdown`/`formatEta` declaration
  anywhere under `components/space` or `components/fleet` (§4.2), and on any
  unreviewed `.toFixed(` in those trees.

### 11.3 The `.toFixed(` exception list is **line-anchored** — this WILL break

`frontend/lib/format/guards.test.ts:70-83` pins
`frontend/components/space/SpaceStage.tsx` lines **[681, 682, 738, 739, 903]**
and asserts each of those lines still contains `.toFixed(`. The camera-cluster
shrink deletes eight button lines around `:623-643`, shifting every one of
those anchors upward, and the guard fails the per-commit gate with *"no longer
calls `.toFixed(` at that line"*.

The guard's own message says: **re-locate the entry by grep against the live
file, never by moving the code back to match a stale line number.** Because
implementers do not edit tests, this edit belongs to the **SDET**, in the same
step as the camera work (§12 step F). `frontend/lib/format/guards.test.ts` is
**not** in the change's stated Impact — flagged in §14.2.

### 11.4 Other tier-0 validators

`check-datatestid.sh` blocks only a component with interactive elements and
**zero** testids — satisfied everywhere here. `check-frontend-tests.sh`
requires a sibling test per new file (§1). `check-raw-fetch.sh` and the
backend param/test validators are not reachable by this change.

---

## 12. Build order — one developer, seven steps

One implementer, no second front, no contract-first step (there is no Go
side). The order is a dependency order. Within a step, items are
order-independent.

**Step A — the shared foundations. Nothing renders; everything depends on it.**
`1.1` (derivation extension + `PARK_KIND_*` exports + repoint
`FleetActionsPanel.tsx:310-311` and `space-scene.ts:589,602`), `1.2` (its
tests: the existing nine cases untouched, new cases added), `1.3`/`1.4` (the
`Gauge` atom and its tests), and the provider half of `6.1`
(`useCorporationSessionOptional`). These four are mutually independent.
*Rationale: the derivation's new fields are the pill's entire input surface,
and the gauge is shared by two cells. Building a cell first means building
its inputs twice.*

**Step B — the pill.** `3.1`–`3.5`. Depends on A's derivation only. The pill
is this change's single load-bearing claim — six of round 2's nine findings
and most of round 1's landed on it — so it is built alone, against its own
unit suite, before any cell mounts it.

**Step C — the cells.** `2.1`–`2.5` (fleet cell + chevron; mounts the pill),
`4.1`–`4.4` (fuel), `5.1`–`5.3` (hold), `6.1` remainder + `6.2` + `6.3`
(credits, clock), `6.4`. Mutually independent after B; fuel and hold both
depend on A's gauge, credits on A's accessor.

**Step D — the container invariants.** `7.1`–`7.4`. Depends on C. The
always-present matrix, the no-verbs/no-reads enumerations, the single-announcer
rule, and the 1280×720 floor are properties of the assembled strip.

**Step E — wiring and retirement. ATOMIC: `8.1` + `8.2` + `8.3` in one step,
one commit.** Mounting the strip (8.1) while the panel still renders its
readouts (8.2) puts **two** elements under each inherited testid, which is a
Playwright strict-mode failure, and splitting them leaves a committed state
where the five tier-4 specs are red for a structural reason. `8.1` also
carries the bottom-band clearance (§9) for the two `SystemSpaceView` sites.
Then `8.4` (migrate the two panel describes; re-point
`FleetActionsPanel.test.tsx:941`'s enumeration and the failed-command test)
and `8.5`.

**Step F — the camera cluster.** `9.1`–`9.5`, plus the third bottom-band site
(`SpaceStage.tsx:609`) and the `guards.test.ts` re-anchoring of §11.3.
Independent of A–E in every respect except that it edits `SpaceStage.tsx`,
which step E also touches for the cluster's `bottom-[4.5rem]` — so do the
re-anchor **here**, once, not in both steps.

**Step G — verification.** `10.1` per-commit gate; `10.2`/`10.3` at the
archive gate only.

### 12.1 What the SDET writes, and when

The red suite is written **one step ahead** of the developer, in the same
order:

| for step | red suite |
|---|---|
| A | `roster-status.test.ts` new cases (never touching the nine); `Gauge.test.tsx` — fill ratio, segment count and order, all three `data-gauge-state` values, the sub-pixel case, and the "no accessible value" assertion |
| B | `VitalsStripPill.test.tsx` — all seven states, the stranded marker, the four degraded cases, the scale-absent case, the equal-and-not-absent property, the advancing countdown at two `worldTime` values, and the `null`-status absent case |
| C | `VitalsStripFleetCell.test.tsx` (identity, menu membership and labels, keyboard operability, focus return + accessible-name update, empty-on-failed-refetch) and `VitalsStrip.test.tsx` (fuel, hold, credits, clock) |
| D | `VitalsStrip.test.tsx`'s container matrix |
| E | the migrated hold/credits describes; `SystemSpaceView.test.tsx`'s mount assertion |
| F | the fourteen rewrites of §10.4, plus the `guards.test.ts` re-anchor |

Task 10.2's journey spec is written **after every task above is checked**,
never alongside them.

---

## 13. Test tiers

`docs/testing-tiers.md` is the single definition; nothing is restated here.

- The developer's **per-task and per-commit gate is tier 1**, with tier 0's
  changed-file validators (§11). Neither boots a stack.
- **Tiers 3 and 4 run once each, at the archive gate, with the tree locked.**
  Tier 2 is backend-only and unreachable by this change.
- The five specs of §3.3 are tier 4. Their protection is the whole point of
  the inherited-testid contract: they are not run, and cannot be run cheaply,
  before the archive gate — so the shape must be right by construction.

---

## 14. Flagged findings — for the orchestrator, not resolved here

1. **The chevron deviates from `frontend/CLAUDE.md`'s Catalyst-only UI rule.**
   §7.3 pins a hand-rolled ARIA menu button. The reasons are testability at
   tier 1 and fit in a 56px instrument bar, and the deviation is scoped to
   this one control. It is a standards deviation and needs the orchestrator's
   nod, not mine alone.
2. **The change's Impact omits `frontend/lib/format/guards.test.ts`.** §11.3
   shows the camera shrink *must* re-anchor its line-pinned exception list or
   the per-commit gate fails. Round 3 already accepted the identical argument
   to widen Impact for `frontend/lib/types/fleet.ts`; the same rule applies
   here. An edit outside a change's stated Impact is a finding against the
   developer at build time.
3. **`design.md` Decision 1 and task 1.3's premise overstate the colour
   validator.** `dark:bg-zinc-800` and the bare-`bg-zinc-100`/`text-zinc-900`/
   `border-zinc-200` rules are severity **warning** in
   `.claude/scripts/check-color-compliance.py:70-103`, and `check.py:1044`
   counts a warnings-only file as **passed**. Only `no-gray-scale` and
   `no-dark-zinc-900-bg` are errors. `bash .claude/scripts/check.sh` runs no
   colour check at all. The design's *conclusion* is right and §5.5 keeps it —
   but a developer who reads "per-commit gate failure otherwise" and finds it
   isn't will trust the next such claim less. Worth a one-line correction at
   archive.
4. **Task 2.3 reads as if three paths already share one callback; two do.**
   `onActivateFleet` (`SystemSpaceView.tsx:747`) is wired to
   `setActingFleetId`, not `selectFleet`. §7.3 rules this correct-as-is and
   scopes 2.3 to verifying no path touches the selection. If the orchestrator
   wants the mark genuinely routed through `selectFleet`, that is a fifth
   task, not a verification.
5. **Task 4.4's sub-pixel fixture pins a 1280-px width floor to the gauge's
   own width.** The gauge is a cell-width element, not 1280px wide, so
   "rounds to less than one pixel at the 1280-px width floor" is a *stronger*
   condition than the scenario needs. §5.3 satisfies it either way (the state
   attribute is width-independent), so no halt — recorded so nobody tries to
   reverse-engineer a gauge width from it.

---

## 15. Out of scope — do not drift into these

- **The fuel gauge's cost overlay** and everything feeding it: the burn-preview
  lift to the mounting view, `SpaceCommandPanel`'s prop conversion, and the
  `system-space-view` *A Failed or Stale Preview…* MODIFIED. All of it is
  `add-burn-cost-overlay`, chain link 2a-ii (RULING 9). This change ships a
  **plain** fuel gauge. The cost overlay will be drawn in tons on this same
  `cargoCapacity` scale and needs its own clamp rule for
  `fuelCostTons > cargoCapacity` — 2a-ii's requirement to write; it does not
  reopen this denominator.
- **`drift-running-mine-preview-unsuppressed.md`** —
  `SpaceCommandPanel.tsx:109-115`'s omitted `mineRunning`. Confirmed drift,
  code wrong, owned by `add-burn-cost-overlay` (RULING 18). This change has no
  task touching that line; fixing it here would exceed the stated Impact.
- **The console dock, its tabs, collapse, and `Esc`** — link 2b.
- **The in-system list and the off-screen reach chips' retirement** — link 3.
- **Figures on the arc, the Burn button on the curve, the shortfall text, the
  burning-progress label** — link 4.
- **`defect-touch-pan-lost-with-camera-cluster.md`** — deleting the pan buttons
  removes the only touch-accessible pan path. Filed, accepted as a capability
  loss (no live requirement is falsified: *Space View Camera Touch Pinch-Zoom*
  defines no pan), and **not** replaced here — a two-finger drag would collide
  with pinch-zoom's own two-finger claim and needs its own spec surface
  (RULING 24).
- **All backend work.** No Go file, no wire shape, no query. A task that seems
  to need a served field is mis-scoped and halts to the orchestrator.
- **`fleet-roster`** — no delta, no copy change. §2.1 is what keeps that true.

---

## 16. Done-conditions worth restating

- `roster-status.test.ts`'s nine original cases pass **unedited**, and
  `FleetRoster.test.tsx` passes unedited. If either needed a change, the
  extension was not additive.
- No file under `frontend/components/space/` or `frontend/components/fleet/`
  declares a `countdown` or `formatEta`.
- Exactly one element in the rendered page carries each of §3.1's eleven
  testids, and each of their subtrees carries exactly one `[data-raw]`
  (`hold-capacity` excepted).
- `VitalsStripPill.tsx` contains no import of `Fleet` and no reference to
  `state`, `attachedTo`, `Park`, or `jump`.
- `Gauge.tsx` contains no `data-raw`, no `data-unit`, no `aria-value*`, and no
  `%` in rendered text.
- `space-camera-controls` has exactly four element children, and
  `select-pan-target-point` is not one of them and carries
  `CAMERA_CONTROL_ATTR` itself.
- `grep -c 'TBD - created by archiving' openspec/specs/system-console/spec.md`
  returns `0` after archive — the orchestrator runs this personally at the
  archive gate (task 10.3, round 1 MAJOR 9), and the boundary paragraph is
  already pasted verbatim into `docs/plans/system-hud/chain.md`'s Link 2b
  section as its durable second home.

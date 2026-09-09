# add-figure-formatting — implementation contract

Link 1 of `docs/plans/system-hud/chain.md`, Phase 2 (`/team --chain
--full-auto`). Author: `openspec-architect`, the owner of this change's
`design.md`.

**Basis, all read before writing:** the spec-frozen change at
`da3ba3683dfc9254403415264f303de2e2334656`
(`openspec/changes/add-figure-formatting/` — proposal, design, tasks, five
spec deltas), `add-figure-formatting-rulings.md` (RULINGs 1–26),
`-adversary-r1/-r2/-r3.md`, `-panel-architect.md`, `frontend/CLAUDE.md`, and
the live code at every site the change names.

**Audience and standing.** The SDET writes the failing suite from this
document; the Next.js developer makes it pass. This contract settles only
what the spec deliberately leaves to design — the module's own surface, the
attribute vocabulary, the derived testids, the enforcement helper, and the
order of work. **It has no authority over the spec.** If an implementer finds
this contract and a spec delta in conflict, the affected task **halts and
routes back through the spec writer** — it is not resolved here and not
resolved by the implementer. Findings I could not resolve without spec text
are in §10, flagged, not reinterpreted.

**Test execution is not in scope for this document.** Which suite runs when,
and at what cost, is `docs/testing-tiers.md` — the single definition. This
contract names **no commands and no timeouts**; tasks 13.1/13.2 already carry
the gate and the archive-gate tiers, and nothing here adds to them.

---

## 0. The seam, in one paragraph

There is no Go side and no wire change, so the usual API-contract-first step
does not apply. The seam two agents would otherwise invent twice is **the
module's exported surface plus the DOM contract it emits**: seven quantity
functions, one absent constant, one dispatcher, one closed `data-unit` union,
one `<Figure>` element, one derived-testid scheme, and one runtime assertion
helper. Those are §1–§5 below and they are fixed as of this document. The
scale-threading table is §6, the sequencing is §7, and the flagged findings
are §10.

---

## 1. `frontend/lib/format/figures.ts` — the exported surface

Every signature below is final. Parameter **order** is part of the contract:
`(value, scale, …)`, mirroring the fixture table's `(raw, scale, expected)`
row shape so a row and a call read the same way.

```ts
// ---------- types ----------

/** The closed `data-unit` vocabulary. §2 is the normative list. */
export type FigureUnit =
  | 'world-ms-span-in'
  | 'world-ms-span-left'
  | 'world-ms-span-ago'
  | 'world-ms-span-bare'
  | 'world-ms-instant'
  | 'tons'
  | 'range'
  | 'delta-v'
  | 'credits'
  | 'tons-per-world-ms'
  | 'tons-per-world-s'

/** R3's four forms. One-to-one with the four `world-ms-span-*` tokens. */
export type DurationForm = 'in' | 'left' | 'ago' | 'bare'

/** Which world-time denominator a served rate arrived in (RULING 3). */
export type RateDenominator = 'world-ms' | 'world-s'

// ---------- the absent form ----------

/** R10 / RULING 13. U+2014 EM DASH. The only absent form the module emits. */
export const ABSENT_FIGURE = '—'

/** RULING 21. The due form, for the `in` and `left` directions only. */
export const DUE_FIGURE = 'now'

// ---------- the seven quantity functions ----------

export function formatDuration(
  spanMs: number | null | undefined,
  scale: number,
  form: DurationForm,
): string

export function formatInstant(
  worldMs: number | null | undefined,
  scale: number | undefined,
): string

export function formatTons(tons: number | null | undefined): string

export function formatRange(value: number | null | undefined): string

export function formatDeltaV(metresPerSecond: number | null | undefined): string

export function formatCredits(credits: number | null | undefined): string

export function formatRate(
  rate: number | null | undefined,
  scale: number,
  denominator: RateDenominator,
): string

// ---------- the accessible label R4 mandates ----------

export function instantScaleLabel(scale: number | undefined): string

// ---------- the dispatcher RULING 23 requires ----------

export function unitNeedsScale(unit: FigureUnit): boolean

export function formatByUnit(
  raw: number,
  scale: number | undefined,
  unit: FigureUnit,
): string
```

Barrel: `frontend/lib/format/index.ts` re-exports all of the above and
nothing else (`index.*` is exempt from the colocated-test validator —
`.claude/scripts/check-frontend-tests.sh:43`). Call sites import from
`@/lib/format`.

### 1.1 How the scale is taken (RULING 1, RULING 8, RULING 19, RULING 26)

- `formatDuration` and `formatRate` take `scale: number` — **required,
  positional, no default, no overload that omits it**. `formatDuration(ms)`
  and `formatRate(r)` are compile errors. That is the whole mechanism behind
  R1's type-level scenario; the `// @ts-expect-error` case in
  `figures.test.ts` (task 11.1's last clause) pins it and compiles green only
  while the error is real.
- `formatInstant` takes `scale: number | undefined` — **required key,
  nullable value**. It is the one function whose scale may legitimately be
  absent, because only its suffix depends on the scale (RULING 19).
- `formatTons` / `formatRange` / `formatDeltaV` / `formatCredits` take **no
  scale argument at all**. A caller cannot pass one; RULING 26's
  "scale-independent quantities render normally" is therefore true by
  construction rather than by discipline.
- **Absence branches on the quantity, never on the mount (RULING 26).** A
  call site holding `scale === undefined` for a duration or a rate does not
  call the formatter; it renders `<Figure text={ABSENT_FIGURE}>` with the
  raw and unit still set. For every other quantity the call site formats
  normally, whatever the mount served.

### 1.2 Per-function behaviour (the parts a signature does not say)

**`formatDuration(spanMs, scale, form)`**

| Input condition | Result |
|---|---|
| `spanMs` is `null`/`undefined`/`NaN`/non-finite | `ABSENT_FIGURE` |
| `scale <= 0`, `NaN`, or non-finite | `ABSENT_FIGURE` (R1's non-positive-scale scenario) |
| `form` is `in` or `left`, `spanMs <= 0` | `DUE_FIGURE` (`now`) — no affix, no unit pair, no sign |
| `form` is `ago` | positive magnitude of `spanMs`, suffixed ` ago`; never a minus sign |
| `form` is `bare`, `spanMs < 0` | `0m 0s` — the magnitude is clamped at zero (see §10 F5: spec-silent, settled here) |
| otherwise | wall span `= |spanMs| / scale`, rendered per R2's two-unit ladder, then affixed: `in ` prefix / ` left` suffix / ` ago` suffix / no affix |

Ladder (R2, unchanged from the spec, restated so the fixture rows and the
implementation are read off one place): `Nm Ss` below one hour, `Nh Mm`
below one day, `Nd Hh` at or beyond. Round once, to the smaller rendered
unit; if that rounding produces 60, re-select the pair from the rounded
total (`59m 59.6s → 1h 0m`, `86,399,600ms → 1d 0h`). Sub-second → `0m 0s`.

**`formatInstant(worldMs, scale)`** — `T+ Dd HH:MM ×N`. Never divided by the
scale. `HH` and `MM` zero-padded to two digits; `Dd` unpadded. Non-finite
`worldMs` → `ABSENT_FIGURE` (the whole figure, suffix included).
`scale === undefined`, `<= 0`, or non-finite → the suffix renders `×—`
(RULING 19) while the `T+ Dd HH:MM` portion renders as usual. `×1` always
renders (RULING 16); the suffix is never omitted.

**`instantScaleLabel(scale)`** — the module owns this copy so three call
sites cannot invent three spellings. Exactly:
- `scale` a positive finite number: `The world clock is running at 60 times real time.` (the numeral is the scale, rendered by the same integer-or-shortest-decimal rule the suffix uses).
- otherwise: `The world clock's rate has not been served.`

**`formatTons(tons)`** — one decimal below 100 **after rounding**, none at or
above; U+2009 THIN SPACE then `t`. `99.95 → 100 t`, `99.94 → 99.9 t`,
`0 → 0.0 t`, `6 → 6.0 t`, `-5.2 → -5.2 t`.

**`formatRange(value)`** — three significant figures, magnitude suffix `k`
then `M`, **no unit name** (RULING 14). `833.25 → 833`, `1 → 1.00`,
`12.3456 → 12.3`, `999.5 → 1.00k`, `1000 → 1.00k`, `1234567 → 1.23M`,
`0 → 0.00`.

**`formatDeltaV(mps)`** — integer, ties away from zero, thousands separator
`,` at 1,000+, then ` m/s` (ordinary space). `268.5 → 269 m/s`,
`3721.2 → 3,721 m/s`.

**`formatCredits(credits)`** — `₡` U+20A1, ordinary space, integer with `,`
grouping, never a decimal. `1000 → ₡ 1,000`, `28 → ₡ 28`, `0 → ₡ 0`,
`-50 → ₡ -50`.

**`formatRate(rate, scale, denominator)`** — convert, then walk.
`tonsPerWallSecond = rate × 1000 × scale` for `'world-ms'`;
`= rate × scale` for `'world-s'` (**multiplication**, per design.md and the
spec's scale-60 row). Then walk second → minute → hour, stopping at the
**first** unit whose magnitude reaches 1; if none does, render per hour. One
decimal. `0 → 0.0 t/h`. A strictly positive rate whose chosen-unit magnitude
rounds to `0.0` renders the literal `<0.1 t/h`. `rate < 0 → ABSENT_FIGURE`.
`scale <= 0`/non-finite → `ABSENT_FIGURE`.

**Grouping is hand-rolled.** `Intl` and `toLocaleString` are forbidden in
`lib/format/**` (design.md; task 11.1 asserts their absence). A regex over
the integer part is the implementation.

### 1.3 `unitNeedsScale` and `formatByUnit` — the total function

These two exist so the R12 runtime check is decidable from an element's own
attributes (RULING 23's thesis). They are **module code, not test code**, so
the helper and any future consumer share one dispatch.

```ts
unitNeedsScale(unit) === true   // for: world-ms-span-in | -left | -ago | -bare
                                //      tons-per-world-ms | tons-per-world-s
unitNeedsScale(unit) === false  // for: world-ms-instant | tons | range
                                //      delta-v | credits
```

```ts
formatByUnit(raw, scale, unit):
  if unitNeedsScale(unit) && scale === undefined  -> ABSENT_FIGURE
  'world-ms-span-in'    -> formatDuration(raw, scale!, 'in')
  'world-ms-span-left'  -> formatDuration(raw, scale!, 'left')
  'world-ms-span-ago'   -> formatDuration(raw, scale!, 'ago')
  'world-ms-span-bare'  -> formatDuration(raw, scale!, 'bare')
  'world-ms-instant'    -> formatInstant(raw, scale)
  'tons'                -> formatTons(raw)
  'range'               -> formatRange(raw)
  'delta-v'             -> formatDeltaV(raw)
  'credits'             -> formatCredits(raw)
  'tons-per-world-ms'   -> formatRate(raw, scale!, 'world-ms')
  'tons-per-world-s'    -> formatRate(raw, scale!, 'world-s')
```

`formatByUnit` is **total** over `(number, number | undefined, FigureUnit)`.
It has no default branch that throws on an unknown unit — the union makes
one unreachable — and it has **no skip branch** (RULING 23's rejected
alternative).

### 1.4 Purity fence (R13)

`lib/format/**` imports no `react`, no `@/lib/market`, no `@/lib/space`, and
names none of `Date`, `performance`, `Math.random`, `Intl`,
`toLocaleString`. Task 11.1 asserts all of it statically over the directory.
`assert-figures.ts` (§5) lives in the same directory and is bound by the same
fence except that it may import `figures.ts` and the DOM `Element` type — it
names no ambient source either.

---

## 2. The `data-unit` closed union — normative list

This vocabulary went stale twice during authoring. **This is the list.** It
is the `FigureUnit` union in §1, repeated here verbatim as the single
citable form:

| Token | Quantity | Raw value is | Needs scale |
|---|---|---|---|
| `world-ms-span-in` | duration, deadline, future | unscaled world-ms span | yes |
| `world-ms-span-left` | duration, remainder of a running order | unscaled world-ms span | yes |
| `world-ms-span-ago` | duration, past deadline | unscaled world-ms span | yes |
| `world-ms-span-bare` | duration, a cost/estimate magnitude | unscaled world-ms span | yes |
| `world-ms-instant` | absolute stamp | world-ms since epoch | no (suffix only) |
| `tons` | tonnage | tons | no |
| `range` | range/distance | the served bare float | no |
| `delta-v` | delta-v | metres per second | no |
| `credits` | credit figure | integer credits | no |
| `tons-per-world-ms` | rate | tons per world-millisecond | yes |
| `tons-per-world-s` | rate | tons per world-second | yes |

Rules that bind:

1. **A duration token names its R3 form** (RULING 23). The call site picks
   the token from the form it knows it is rendering — never by inspecting
   the raw value at runtime.
2. **A span token and `world-ms-instant` never collide.** A reader of the
   attribute can tell `in 4m 12s` from `T+ 2d 04:13` without reading copy.
3. **`world-ms-span-ago` has no call site in this change.** It is module +
   fixture only. Do not "clean it up": R3 defines it and a later link uses
   it.
4. No token outside this table may appear in a `data-unit` attribute. The
   union type is the enforcement; `<Figure>`'s prop type refuses an invented
   spelling at compile time.

---

## 3. `<Figure>` — props and rendered output

Path: `frontend/components/figure/Figure.tsx`, with a colocated
`Figure.test.tsx` (the changed-file coverage validator requires it).

```tsx
export interface FigureProps {
  /** The unformatted value. Non-finite is normalized away — see below. */
  raw: number | null | undefined
  unit: FigureUnit
  /** The already-formatted text. The ONLY way text enters this element. */
  text: string
  className?: string
  'data-testid'?: string
  /** RULING 22, optional. See §3.2 on which of the two to use. */
  'aria-label'?: string
  title?: string
}

export function Figure(props: FigureProps): JSX.Element
```

**Rendered output — exactly one element, nothing else:**

```html
<span data-raw="47.23519999999999" data-unit="tons" data-testid="…"
      class="…" title="…">47.2 t</span>
```

- One `<span>`. No wrapper, no fragment, no default `className`, no
  font/colour/spacing class of its own. Every call site passes through the
  classes it has today, so the drawn appearance is unchanged apart from the
  figure text.
- **No `children`.** Text arrives only as `text`.
- **No `variant`, `size`, `tone`, or `emphasis`.** The first such prop is
  where `<Figure>` starts competing with Catalyst and setting the type
  scale, which this change's non-goals forbid. If link 2a wants one, that is
  a `system-console` decision.
- `data-unit` is always emitted.
- `data-raw` is emitted **iff `Number.isFinite(raw)`**. The component
  normalizes a non-finite `raw` to `undefined` before it reaches the DOM —
  React would otherwise emit the literal strings `"NaN"` / `"Infinity"`,
  which R11 forbids. This is the one line of logic the component owns and
  the reason it exists rather than a hand-written attribute.
- Serialization is React's own `setAttribute(name, '' + value)`, i.e.
  `String(value)`: the shortest decimal that round-trips to the identical
  double. **Tests compare `Number(attr)` to the wire value, never the
  attribute string to a hand-typed decimal.**
- Presence follows the **value**, never the text: a due figure (`now`), a
  scale-starved figure (`—`), a negative rate (`—`) all still carry
  `data-raw`. That is what makes task 10.2's `data-raw <= 0` assertion
  possible.

### 3.1 The one platform exception, and its shared implementation

An `<option>`'s content model is text, so `ScanControl`'s sweep durations
cannot nest a `<Figure>` (spec: *An element that cannot hold a nested figure
carries the pair itself*). To keep **one** implementation of the
finite-normalization rule, `components/figure/Figure.tsx` also exports:

```ts
export function figureAttrs(
  raw: number | null | undefined,
  unit: FigureUnit,
): { 'data-raw'?: string; 'data-unit': FigureUnit }
```

`<Figure>` is implemented in terms of it. `figureAttrs` is the **only** other
permitted emitter of the pair, and it has exactly **one** call site in this
change: `ScanControl.tsx`'s `<option>`. Task 11.1's static suite asserts that
no file other than `components/figure/Figure.tsx` and
`components/space/ScanControl.tsx` imports `figureAttrs`.

### 3.2 The accessible label (RULING 22) — which prop, and why

Both `aria-label` and `title` are accepted and both are covered by
`Figure.test.tsx`. **Call sites in this change use `title`.** An `aria-label`
on a *visible* figure replaces its text content for assistive technology, so
labelling a visible `T+ 2d 04:13 ×60` with the scale explanation would
**remove the stamp itself** from what a screen-reader user hears — the
opposite of RULING 16's intent. `title` supplements. The `aria-label`
pass-through stays in the API for a future non-visible use.

Every `world-ms-instant` figure — all three sites (§4) — passes
`title={instantScaleLabel(scale)}`. R4 says "every rendered `T+` figure",
not only the sites a task list names.

---

## 4. The derived `data-testid` scheme — exhaustive

Three cases, applied mechanically:

- **(a) The element today *is* the figure** (no other text): the existing
  testid moves onto the `<Figure>`. String unchanged.
- **(b) The element today holds one figure plus fixed prose**: the prose
  stays where it is, and the **existing testid moves onto the `<Figure>`**,
  with the prose as its sibling. String unchanged; the id now resolves to the
  figure, which is where `data-raw` lives.
- **(c) The element holds more than one figure, or carries a state attribute
  `<Figure>` may not accept**: the wrapper keeps its existing testid and each
  `<Figure>` inside it takes a new derived id from the table below.

The table is normative. Both the SDET's selectors and the developer's markup
use these exact strings; `frontend/e2e/helpers/space-view.ts` targets them
too.

### `SpaceCommandPanel.tsx`

| testid | case | element | `data-unit` | `data-raw` |
|---|---|---|---|---|
| `preview-arrival` | a | `<Figure>` inside the existing `<dd>` | `world-ms-span-in` | `preview.arriveMs − worldTime` |
| `preview-deltav` | a | `<Figure>` in `<dd>` | `delta-v` | `preview.deltaV` |
| `preview-fuel` | a | `<Figure>` in `<dd>` | `tons` | `preview.fuelCostTons` |
| `preview-fuel-ceiling` | a | `<Figure>` in `<dd>` | `tons` | `ceiling` (client-derived) |
| `commit-drift-notice` | c | wrapper `<p>`, keeps id, carries **no** pair | — | — |
| `commit-drift-actual-deltav` | c | `<Figure>` | `delta-v` | `commit.deltaV` |
| `commit-drift-actual-arrival` | c | `<Figure>` | `world-ms-span-in` | `commit.arriveMs − worldTime` |
| `commit-drift-previewed-deltav` | c | `<Figure>` | `delta-v` | `commit.previewedDeltaV` |
| `commit-drift-previewed-arrival` | c | `<Figure>` | `world-ms-span-in` | `commit.previewedArriveMs − worldTime` |

Both arrivals take `in` (RULING 24) — never one `in` beside one `left`.
The burn success toast is string-only: it uses `formatDuration(…, 'in')` and
carries **no** attributes (RULING 12).

### `FleetActionsPanel.tsx`

| testid | case | element | `data-unit` | `data-raw` |
|---|---|---|---|---|
| `balance-readout` | — | unchanged wrapper | — | — |
| `balance-value` | c | wrapper `<span>`, keeps id **and** `data-available` | — | — |
| `balance-figure` | c | `<Figure>` inside `balance-value`, present only when `credits !== null` | `credits` | `credits` |
| `balance-live-region` | — | sr-only string only; formatter used, **no** attributes | — | — |
| `hold-capacity` | c | wrapper `<span>`, keeps id | — | — |
| `hold-capacity-used` | c | `<Figure>` | `tons` | `capacity − freeHold` (client-derived) |
| `hold-capacity-total` | c | `<Figure>` | `tons` | `roster.cargoCapacity` |
| `hold-{kind}` | c | `<li>` wrapper, keeps id (carries the kind label) | — | — |
| `hold-{kind}-tons` | c | `<Figure>` inside it | `tons` | that kind's served tons |
| `hold-free` | b | `<Figure>`, id moves onto it; the word `free` is its sibling | `tons` | `roster.freeHold` |
| `mine-eta-preview` | b | `<Figure>`; `About` and `at the served rate` are siblings | `world-ms-span-bare` | `minePreviewMs` (client-derived) |
| `mine-countdown` | b | `<Figure>` | `world-ms-span-left` | `mineEta.eta − worldTime` |
| `sell-proceeds-preview` | b | `<Figure>` | `credits` | `sellPreview.totalProceeds` |
| `sell-price-changed` | c | wrapper `<p>`, keeps id | — | — |
| `sell-price-expected` | c | `<Figure>` — what the player originally expected | `credits` | that total |
| `sell-price-refreshed` | c | `<Figure>` — the server's current total | `credits` | that total |
| `refuel-cost-preview` | b | `<Figure>`; `at the served price` is a sibling | `credits` | `refuelTons × fuelPricePerTon` |
| `stationkeep-rate` | b | `<Figure>`; `Drain` / `Holding costs` is a sibling | `tons-per-world-s` | `roster.stationKeepRateTonsPerSecond` |

Two visible copy consequences, both intended and both to be stated in the
red-coverage notes so QA does not read them as regressions:

- `hold-capacity` reads `18.0 t / 40.0 t` (each figure carries its own unit,
  because each is a tonnage per the delta) rather than today's `18 / 40 t`.
- Wherever the `₡` glyph is rendered, the trailing word `credits` is dropped
  (`₡ 1,250`, not `₡ 1,250 credits`). The glyph names the unit.
- `balance-value` in the unavailable state renders this capability's own
  mandated copy (`Unavailable`) as plain text with **no** pair — the credit
  override, not `—`.

### `FleetRoster.tsx`

| testid | case | `data-unit` | `data-raw` |
|---|---|---|---|
| `fleet-row-eta-{id}` | a | `world-ms-span-left` | `status.remainingMs` |
| `fleet-fuel-{id}` | b (`fuel` becomes a sibling word) | `tons` | `f.roster.cargo?.fuel` |
| `fleet-range-{id}` | b (`range` label stays a sibling — the delta requires it) | `range` | `f.roster.estimatedRange` |

`?? 0` disappears at both fuel and range: an unserved figure renders
`ABSENT_FIGURE` with **no** `data-raw` (the value is genuinely absent, unlike
the scale-starved case).

### `ScanControl.tsx`

| testid | case | element | `data-unit` | `data-raw` |
|---|---|---|---|---|
| `scan-target-select` | — | `<select>`, unchanged | — | — |
| (each `<option>`) | exception §3.1 | the `<option>` itself, via `figureAttrs` | `world-ms-span-bare` | `t.durationMs` |
| `scan-countdown` | a (running) | `<Figure>` | `world-ms-span-left` | `runningEta − worldTime` |
| `scan-countdown` | — (settling) | plain `<span>`, **no** pair, text `Settling…` | — | — |

The option's `value` stays the host id and its label keeps
`{kind} · {hostId} · {duration}` — the eight `selectOptions(…, HOST_ID)`
sites and the `toHaveTextContent(HOST_ID)` assertions in
`SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` all keep working,
and RULING 25 clause 2 makes the host id's digits harmless.

**The settling branch carries no pair, deliberately.** `system-space-view`
mandates `Settling…` as this surface's due-form override; an element carrying
the pair whose text is override copy would fail §5's clause 1 for compliant
markup. In that state the surface is not presenting a figure, so it renders
none. See §10 F4.

### `SightingLog.tsx`

| testid | case | `data-unit` | `data-raw` |
|---|---|---|---|
| `sighting-row-{id}` | — | wrapper button, unchanged | — |
| `sighting-asof-{id}` | c | `world-ms-instant` | `record.asOf` |

`title={instantScaleLabel(scale)}` on the figure.

### `SpaceStage.tsx`

| testid | case | `data-unit` | `data-raw` |
|---|---|---|---|
| `sighting-mark-{recordId}` | — | button, unchanged | — |
| `sighting-mark-asof-{recordId}` | c | `world-ms-instant` | `mark.asOf` — inside the existing sr-only span, which keeps `Observed at ` as prose |
| `sighting-facts` | c | wrapper, unchanged | — |
| `sighting-facts-asof` | c | `world-ms-instant` | `shown.mark.asOf` (task 7.3) |
| `fleet-facts` | c | wrapper, unchanged | — |
| `fleet-facts-arrival` | c | `world-ms-span-in` | `mark.arriveMs − nowMs` |

`fleet-facts`'s copy becomes `Arrives <Figure/>` — the label drops its own
`in`, the module supplies it once (RULING 25's MINOR 1). `detail` stops being
a string for the burn branch and becomes a node; the drift branch's
`Bearing … · Speed …` string is untouched (RULING 10).

`contact-facts` and the two bearing/speed sites are **out of scope** and keep
their `toFixed` (RULING 10). They carry no pair, so §5's helper never looks
at them.

---

## 5. `assertFiguresMatchModule` — R12's runtime enforcement

Path: `frontend/lib/format/assert-figures.ts`, with a colocated
`assert-figures.test.ts` (the coverage validator requires one, and this
helper is the change's central invariant — it gets planted-bypass cases of
its own, on the `anti-mirror-guard.test.ts` anti-vacuity precedent).

```ts
export function assertFiguresMatchModule(
  container: HTMLElement,
  opts: { scale: number | undefined },
): void

/** For a render that legitimately shows no figure at all. */
export function assertNoFigures(container: HTMLElement): void
```

`opts.scale` is **the scale the test rendered the container with** — exactly
the value threaded to the component under test, `undefined` when the test
served none. It is required, so a caller cannot silently omit it and get a
scale-less pass.

### 5.1 The ruling, quoted

RULING 25, verbatim:

> **Ruling.** The check has two clauses, both anchored on **complete numeric
> tokens** — a maximal run of digits together with any decimal point,
> thousands separator or magnitude suffix bound to it:
>
> 1. The module's output for this element's `(data-raw, scale, data-unit)`
>    SHALL appear in the element's text content as a **complete numeric
>    token** — not immediately preceded or followed by a character that would
>    make it a fragment of a longer number (a digit, a decimal point, or a
>    separator).
> 2. The element's text SHALL contain **no complete numeric token equal to a
>    full-precision rendering of that element's own `data-raw`**, except
>    where that token is the module output matched by clause 1.
>
> The "no other numeric run" clause is **deleted**. Prose digits are
> irrelevant: clause 2 constrains only renderings of the element's own raw
> value.

### 5.2 The same ruling, made executable

Definitions, fixed here so no sixth formulation is possible:

- **Numeric character**: `0`–`9`.
- **Bound character**: `.` (decimal point) or `,` (thousands separator).
- **Magnitude suffix**: `k` or `M`, and only when immediately preceded by a
  numeric or bound character. Time-unit letters (`m`, `s`, `h`, `d`), `t`,
  `×` and `₡` are **not** magnitude suffixes.
- **Complete numeric token**: a maximal match of
  `/-?\d[\d,]*(?:\.\d+)?[kM]?/` over the text. "Maximal" is the regex's own
  greed; the tokens of `833.25` are exactly `["833.25"]`, of
  `body · feat-belt-1 · 0m 5s` exactly `["-1", "0", "5"]` (the host id's
  hyphen is swept into the token by the leading `-?`, which is harmless —
  clause 2 only ever compares a token against this element's own raw), and of
  `₡ 1,000` exactly `["1,000"]`. The leading `-?` is required, not
  incidental: a negative raw (`₡ -50`, `-5.2 t`) must tokenize with its
  sign or clause 2 cannot recognise it.
- **Token-anchored occurrence** of a string `expected` at index `i` in
  `text`: let `prev = text[i-1]`, `next = text[i + expected.length]`.
  - If `expected[0]` is numeric, `-`, or a bound character, then `prev` must
    not be numeric or a bound character.
  - If the last character of `expected` is numeric, a bound character, or a
    magnitude suffix, then `next` must not be numeric or a bound character.
  - An out-of-range `prev`/`next` (start/end of text) satisfies the rule.

Algorithm:

```
elements = container.querySelectorAll('[data-raw][data-unit]')
assert elements.length > 0        // anti-vacuity; use assertNoFigures otherwise

for each el:
  rawAttr  = el.getAttribute('data-raw')      // a string, always present here
  unit     = el.getAttribute('data-unit') as FigureUnit
  assert unit is a member of the closed union // catches an invented spelling
  raw      = Number(rawAttr)
  assert Number.isFinite(raw)                 // R11: the pair implies a number
  text     = el.textContent ?? ''

  expected = formatByUnit(raw, opts.scale, unit)   // total; ABSENT_FIGURE when
                                                   // the quantity needs a scale
                                                   // and none was served

  // clause 1
  i = the first index at which `expected` occurs in `text` as a
      token-anchored occurrence
  assert i !== -1, naming el's data-testid, unit, rawAttr, expected and text

  // clause 2
  for each complete numeric token t of `text` whose match range does NOT lie
  inside [i, i + expected.length):
      assert t !== rawAttr
      assert t.replace(/,/g, '') !== rawAttr
```

Notes that are part of the contract, not commentary:

- **`rawAttr` is the full-precision rendering.** `String(Number(rawAttr))`
  round-trips to `rawAttr` by construction (React wrote it with
  `String(value)`), so the "full-precision rendering" clause 2 compares
  against is the attribute string itself, plus its comma-grouped form.
- **No skip branch, no allowlist, no `data-unit` the helper ignores.** Every
  element carrying the pair is checked (RULING 23). An element the surface
  does not want checked must not carry the pair — which is exactly the
  settling-countdown and unavailable-balance shape in §4.
- **The absent form is checked through the same path** (RULING 23 part 2,
  RULING 26): `expected` is `ABSENT_FIGURE`, which contains no digit, so
  clause 1 degrades to plain containment and clause 2 still forbids the raw
  from appearing. This is what makes the `<option>` case work on a
  scale-less mount, where the element's text is `body · feat-belt-1 · —` and
  an "exact textContent equals `—`" reading would fail compliant markup (§10
  F3).
- **Failure messages name the element.** Every assertion failure prints
  `data-testid`, `data-unit`, `data-raw`, `expected`, and the element's text.
  A helper whose failure says only "expected true to be false" costs the
  developer more than it saves.

### 5.3 The cases `assert-figures.test.ts` must plant

Each planted case asserts the helper **throws**, and names why — the
anti-vacuity discipline `anti-mirror-guard.test.ts` established:

1. `<Figure raw={833.25} unit="range" text="833.25" />` — the range prefix
   bypass (round-3 MAJOR 2). Clause 1 rejects: `833` is followed by `.`.
2. `<Figure raw={47.23519999999999} unit="tons" text="47.23519999999999 t" />`
   — the tonnage fragment bypass.
3. `<Figure raw={21646048727} unit="world-ms-span-in" text="21646048727" />`
   — proposal.md's headline defect, the `String(remaining)` bypass.
4. A duration element whose text is the **wrong form** for its token
   (`world-ms-span-in` rendering `2m 40s left`) — RULING 23's decidability.
5. A `world-ms-instant` on a scale-less mount rendering `—` — must **fail**,
   because RULING 26 says a stamp renders through with `×—`.
6. A `tons` element on a scale-less mount rendering its tonnage normally —
   must **pass**, the other half of RULING 26.
7. `body · feat-belt-1 · 0m 5s` on an `<option>` with `data-raw="5000"` —
   must **pass** (prose digits are irrelevant).
8. `₡ 28` with `data-raw="28"` — must **pass** (clause 1's matched token is
   exempt from clause 2).
9. An empty container — `assertFiguresMatchModule` throws; `assertNoFigures`
   passes.

---

## 6. Threading the served scale — the prop at each mount site

Design.md settles prop-not-context. The prop is named `scale` at every site,
and it is declared **required with a nullable value**, never optional:

```ts
scale: number | undefined      // NOT `scale?: number`
```

The required key is what forces each mount site to state the scale
explicitly (and satisfies `frontend/CLAUDE.md`'s "omit optional props, don't
pass `undefined`" gotcha by making the key non-optional rather than passing
`undefined` into an optional slot).

`SystemSpaceView.tsx:405` derives **one** un-defaulted value and keeps the
clock's default at its single anchor line:

```ts
const servedScale: number | undefined =
  interior.data?.scale ?? acting?.scale ?? allFleets[0]?.scale   // no `?? 1`
const worldTime = useWorldTime(serverWorldTime, { scale: servedScale ?? 1 })
```

| Mount site | Component | Props added | Task |
|---|---|---|---|
| `SystemSpaceView.tsx:725` | `SpaceStage` | `scale={servedScale}` (`worldTime` already passed) | 3.3, 8.2 |
| `SystemSpaceView.tsx:797` | `SpaceCommandPanel` | `scale={servedScale}` **and `worldTime={worldTime}`** — this panel has no `worldTime` prop today and cannot compute an arrival span without it (§10 F1) | 3.3, 4.4 |
| `SystemSpaceView.tsx:805` | `FleetActionsPanel` | `scale={servedScale}` (`worldTime` already passed) | 3.3, 5.8 |
| `SystemSpaceView.tsx:822` | `ScanControl` | `scale={servedScale}` (`worldTime` already passed) | 3.3, 7.4 |
| `SystemSpaceView.tsx:765` | `SightingLog` | `scale={servedScale}` only — it renders stamps, not spans, so it needs no `worldTime` | 3.3, 7.4 |
| `SystemSpaceView.tsx:890` | `FleetRoster` | `scale={servedScale}` (`worldTime` already passed) | 3.3, 6.1, 6.4 |
| `GalaxyView.tsx:472` | `FleetRoster` | `scale={myFleets?.[0]?.scale}` — un-defaulted; `GalaxyView.test.tsx:424` updated in the same task | 6.3 |

`SystemSpaceView`'s `space-world-clock` element and its `data-scale` keep
today's values; no existing clock assertion moves. The file therefore holds
two scale expressions for one render, deliberately, each with one line of
comment (design.md).

`GalaxyView.tsx:182`'s `useWorldTime` still projects at scale 1 — the
recorded defect (RULING 7). Appending `SystemSpaceView.tsx:405`'s twin to
`defect-galaxy-clock-assumes-scale-1.md` is a docs action for the
orchestrator, not a task in this change.

---

## 7. Sequencing

One implementer, no Go work, no second front. The order below is a
dependency order, not a preference. "Parallel" here means *order-independent*
— a single developer may interleave them freely; nothing outside a group
blocks on another member of it.

### Phase A — the module surface (nothing else can start)

1. **2.1–2.8** — `frontend/lib/format/cases.json`, the `(raw, scale, expected)`
   rows, one group per quantity. **Written before 1.1–1.8**, not alongside:
   the table is the red suite for the module half.
2. **2.9** — `figures.test.ts`, iterating every row, plus the
   `// @ts-expect-error` case for R1's type-level scenario.
3. **1.1–1.8** — the seven functions and `ABSENT_FIGURE`/`DUE_FIGURE`, plus
   `unitNeedsScale`/`formatByUnit`/`instantScaleLabel`.
4. **1.9–1.10** — `components/figure/Figure.tsx` + `figureAttrs` +
   `Figure.test.tsx`.

Within Phase A: 2.1–2.8 are **mutually parallel**. 2.9 depends on all of
them. 1.1–1.8 depend on nothing but the signatures in §1 — a developer may
implement them in any order, but each is only *checkable* once its group's
rows exist. 1.9–1.10 depend on `FigureUnit` existing (§1) and nothing else.

### Phase B — the enforcement machinery (before any call site migrates)

5. **9.5** — `assert-figures.ts` + `assert-figures.test.ts`. Depends on
   `formatByUnit` (step 3) and `<Figure>` (step 4). **Must exist before
   9.1–9.4**, because every migrated component's suite calls it.
6. **11.1** — `guards.test.ts`. May be written at any time after step 3;
   it stays **red** on the `lib/eta.ts`-is-absent clause and the
   no-local-`countdown` clause until Phase D completes. That is expected and
   must be recorded in the red manifest so it is not "fixed" by weakening
   the assertion.

### Phase C — threading

7. **3.3** — `servedScale` derivation plus the `scale` prop (and
   `SpaceCommandPanel`'s new `worldTime` prop) at all seven mount sites in
   §6. **Blocks every call-site task.** Nothing in 4.x–8.x compiles without
   it.

### Phase D — call-site migration, one component at a time

Five groups, **mutually parallel** after step 7, each paired with its own
vitest migration so the component is left green before the next is started:

| Group | Implementation | Red suite |
|---|---|---|
| D1 `SpaceCommandPanel` | 4.1, 4.2, 4.3, 4.4 | 9.2 |
| D2 `FleetActionsPanel` | 5.1–5.8 | 9.1 |
| D3 `FleetRoster` + `GalaxyView` mount | 6.1, 6.2, 6.3, 6.4 | 9.4's `FleetRoster.test.tsx` half; `GalaxyView.test.tsx:424` is updated inside 6.3, not 9.4 |
| D4 `ScanControl` + `SightingLog` + `SpaceStage:708` | 7.1, 7.2, 7.3, 7.4 | 9.3, 9.4 (`ScanControl.test.tsx`) |
| D5 `SpaceStage` arrival | 8.1, 8.2 | 9.4 (`SpaceStage.fleet-mark.test.tsx`, `SpaceStage.interaction.test.tsx`) |

Within each group the SDET's red assertions come first; the developer's
markup follows. Each group's suite calls `assertFiguresMatchModule(container,
{ scale })` at least once **and** at least once with `{ scale: undefined }`,
which is the only coverage RULING 8 and RULING 26 get.

### Phase E — the deletions (after every caller has moved)

8. **3.1** — `frontend/lib/eta.ts` deleted. Its two callers are re-pointed by
   **6.1** (`FleetRoster`) and **8.1** (`SpaceStage`), not by this task; 3.1's
   own done-condition is *the file does not exist and no import of it
   remains* (§10 F2).
9. **3.2** — the two local `countdown()` copies deleted. Their call sites are
   re-pointed by **5.3** (`FleetActionsPanel`) and **7.1** (`ScanControl`);
   3.2's done-condition is *neither definition exists*.
10. **11.1 goes green** at this point.

### Phase F — Playwright and the journey

11. **10.1** — `e2e/helpers/space-view.ts`'s `digits()` and `holdKindTons()`
    rewritten (§8), **and** `space-journey.spec.ts`'s local `digits()` at
    `:81` deleted in favour of the shared import (§10 F6). Depends on Phase D
    for the testids.
12. **10.2** — `scan-lane-transit-fizzle.spec.ts:231–233` → a `data-raw <= 0`
    assertion on `fleet-row-eta-{id}`. Depends on D3.
13. **12.1** — the burn-preview journey's per-figure pair assertions. Depends
    on D1.

10.1, 10.2 and 12.1 are **mutually parallel**.

### Phase G — validation

14. **13.1**, then **13.2**, exactly as tasks.md states them. Tier discipline
    is `docs/testing-tiers.md`; this contract adds no command and no timeout.

**The one hard ordering rule to remember:** module → `<Figure>` → helper →
threading → call sites → deletions → e2e. Deleting `lib/eta.ts` before D3/D5
breaks the build; writing 9.1–9.4 before 9.5 duplicates the checker.

---

## 8. The e2e helper rewrite (task 10.1), settled

`digits()` keeps its **name and signature** so its call sites
(`slice.spec.ts`, `refuel-commit.spec.ts`, `space-double-submit.spec.ts`, and
`space-journey.spec.ts` once F6's local copy is deleted) do not change. Its body changes from text-parsing to attribute-reading, with one
resolution rule that makes the case (b)/(c) split invisible to callers:

```
digits(page, testId):
  el = getByTestId(testId)
  if el has [data-raw]        -> return Number(that attribute)
  d = el.locator('[data-raw]')
  if d.count() === 1          -> return Number(its data-raw)
  throw naming testId and the count
    // 0  -> the figure moved; the caller wants a derived id
    // >1 -> a composite; the caller must name which figure it means
```

That keeps `digits(page, 'balance-value')` (case c wrapper, one inner
figure), `digits(page, 'hold-fuel')` (case c wrapper, one inner figure) and
`digits(page, 'preview-fuel')` (case a) all working, and makes
`digits(page, 'hold-capacity')` — two figures — **fail loudly** rather than
silently returning the used figure. `slice.spec.ts:94` therefore moves to
`digits(page, 'hold-capacity-used')`; that is the only call-site edit task
10.1 requires.

`holdKindTons(page, kind)` targets `hold-{kind}`, applies the same resolution
(reaching `hold-{kind}-tons`), and keeps its "no row ⇒ 0" behaviour. Its doc
comment's warning about the aggregate stands.

Neither helper parses text any more, so the thin space, the `₡` glyph and the
`T+` prefix are all irrelevant to them.

---

## 9. Done-conditions worth restating

These are the ones whose task text does not state a testable claim; the
sharpened form is the one to build and check against.

- **2.1–2.8** — a group is done when every case the task names is present in
  `cases.json` **as a row carrying a stable `id`**, and `figures.test.ts`
  asserts, per group, that each named `id` exists. Without the id manifest,
  "the rows exist" is only checkable by eye, which is adversary round 3's
  concentration-risk finding rediscovered at build time.
- **1.8** — done when `ABSENT_FIGURE` is exported and every quantity function
  returns it for `undefined`/`null`/`NaN`/`±Infinity`. Its parenthetical
  about a call site rendering `—` directly is **call-site work owned by 3.3 /
  4.4 / 5.8 / 6.4 / 7.4 / 8.2**, not by 1.8 (§10 F7).
- **9.5** — done when `assert-figures.ts` exists with the §5.2 algorithm,
  `assert-figures.test.ts` plants all nine §5.3 cases, and every file in
  9.1–9.4 calls it at least once with a served scale and at least once with
  `{ scale: undefined }`.
- **11.1** — done when the suite fails on a planted violation of each of its
  six clauses, and when each `KNOWN_EXCEPTIONS` entry is asserted to still
  exist. A green run against an unmodified tree proves nothing on its own.
- **3.1 / 3.2** — done when the files/definitions are absent and no import or
  reference remains, the re-pointing having been done by 6.1/8.1/5.3/7.1.

---

## 10. Flagged findings — not implementable as written, or ambiguous

Reported, not reinterpreted. Nothing here is a spec conflict unless marked as
one; F3 is the only item where a strict reading of shipped spec text is
unsatisfiable, and my recommended reading is stated so the orchestrator can
decide whether it needs the writer.

**F1 — task 3.3 threads `scale` "beside `worldTime`" to six children, but
`SpaceCommandPanel` has no `worldTime` prop today.** (`SystemSpaceView.tsx:797`
passes `fleet`, `selection`, `gateFacts`, `canvasAvailable`, `mineRunning`.)
Every figure that panel converts — `preview-arrival` and the two drift-notice
arrivals — is a *remaining span* against the mounting view's projected world
time, so the panel cannot render them without it. **Resolution in this
contract:** 3.3 adds `worldTime` as well as `scale` at that one mount; 4.4
consumes it. This is additive and inside 3.3/4.4's existing scope, but the
task text does not say it and an implementer could instead reach for a
component-local clock — which would be a second projection with no
requirement behind it.

**F2 — tasks 3.1 and 3.2 double-own work that 6.1, 8.1, 5.3 and 7.1 also
own, and they are ordered before it.** 3.1 says "Delete `frontend/lib/eta.ts`;
re-point its two callers (`FleetRoster.tsx:199`, `SpaceStage.tsx:821`)" —
the re-pointing *is* tasks 6.1 and 8.1. Same for 3.2 versus 5.3 and 7.1.
Executed in tasks.md order, the tree does not compile between 3.1 and 6.1.
**Resolution:** §7 Phase E treats 3.1/3.2 as verification tasks executed
after the call sites move, with the done-conditions in §9. No task is
dropped; the order changes.

**F3 — task 9.5's absent-form branch ("asserts the `textContent` is exactly
`figure-formatting`'s absent form") is unsatisfiable for the `<option>`, the
one element the spec itself names as legitimately carrying prose.** On a
scale-less mount the option's text is `body · feat-belt-1 · —`, never exactly
`—`. The same wording appears in the spec's R12 scenario third AND clause
("satisfies this scenario by rendering exactly `figure-formatting`'s absent
form for that quantity"). **My reading, and what §5.2 implements:** "exactly
the absent form" constrains *the figure the element renders* — the absent
form rather than a duration computed at an assumed scale — not the element's
whole `textContent`; so the absent case runs through the same containment
clauses as every other case, with `expected = ABSENT_FIGURE`. That reading is
uniform, total, keeps RULING 23's no-skip property, and is the only reading
under which the `<option>` scenario and the absent-form scenario are both
satisfiable. The alternative strict reading is impossible, so I do not think
this needs the writer — but it is the sentence most likely to be implemented
two ways, and the orchestrator should know it was read.

**F4 — `scan-countdown`'s settling state has a capability-mandated override
copy and no stated attribute rule.** `system-space-view` requires
`Settling…` rather than a countdown once the ETA has passed, while R11 says
`data-raw` is present whenever the raw value is finite. An element carrying
the pair whose text is `Settling…` fails §5 clause 1 for *compliant* markup.
**Resolution in this contract:** in the settling state the surface renders no
figure — a plain `<span data-testid="scan-countdown">Settling…</span>` with
no pair — exactly as the unavailable credit balance does. R11 binds figure
elements; a surface rendering its own mandated override copy is not rendering
a figure. Task 7.1 does not say this and an implementer will hit it on the
first red run.

**F5 — `formatDuration`'s `bare` form has no specified behaviour for a
negative span.** R3 pins the due form for `in`/`left` and the positive
magnitude for `ago`, and forbids a minus sign generally, but a bare *cost*
that comes out negative is unspecified (it is reachable only through a
client-derived preview). §1.2 settles it as `0m 0s` (magnitude clamped at
zero). Spec-silent, not spec-conflicting; recorded so the fixture row and the
implementation agree.

**F6 — task 10.1's "single point of change" claim is false for
`space-journey.spec.ts`.** That file defines its **own** `digits()` at
`e2e/tests/space-journey.spec.ts:81`, a byte-copy of the helper. Rewriting
the shared helper leaves the journey still parsing text — and it calls
`digits(page, 'hold-fuel')` and `digits(page, 'balance-value')`, both of
which become composite wrappers. §7 step 11 adds the deletion of the local
copy to 10.1's scope. Without it 10.1 can be marked done while the journey
silently regresses.

**F7 — task 1.8 mixes a module obligation with a call-site obligation.** Its
parenthetical ("a required-scale call site renders `—` directly rather than
calling the formatter with an assumed scale of 1") is behaviour at six mount
points, not in the module. Owner clarified in §9; no new task.

**F8 — the 2.1–2.9 split is coherent, with one gap.** The eight quantity
groups partition R1–R10 without overlap and 2.9 is the single runner. The
gap: nothing in 2.1–2.8 is independently checkable, since a "row" has no
identity. §9's `id` manifest closes it. Also note 2.7's rate rows are the
only place the conversion **direction** is pinned (the scale-60 row) — if
that row is dropped, `× scale` and `÷ scale` become indistinguishable again,
which is the defect the architect review filed as BLOCKER 2.

**F9 — `world-ms-span-ago` has no consumer in this change.** Module and
fixtures only. Expected, not an oversight; do not delete it to satisfy a
dead-code instinct.

**F10 — two visible copy changes beyond the ones the risk register names.**
`hold-capacity` becomes `18.0 t / 40.0 t`, and the word `credits` is dropped
wherever `₡` renders. Both follow from "each figure is presented per
`figure-formatting`", both are visible in the journey, and both should be in
the red-coverage notes so the adversary and QA read them as intended.

---

## 11. What this contract deliberately does not decide

- Any spec text. A conflict halts the task and routes to the writer.
- The preview refresh interval constant (OQ-14) — untouched by this change.
- `market-board-panel`'s `cr/t` vocabulary — link 4 (RULING 11).
- `SpaceStage`'s bearing/speed rounding — RULING 10, out of scope, exception-
  listed in 11.1.
- The `clock={{ worldTime, scale }}` single-prop shape — recorded for link 2a.
- Which suites run when, and at what cost — `docs/testing-tiers.md`.

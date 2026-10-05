# add-burn-cost-overlay — design

Architect, against the tree at `d965f5d`. Link 2a-iv of
`docs/plans/system-hud/chain.md`. Binding: RULINGs 2-19, read through
`docs/handoffs/add-burn-cost-overlay-rulings-index.md`. Line numbers below are
at `d965f5d`.

## Context

The vitals strip's fuel gauge draws the fuel aboard. The view already holds
the burn quote for the current selection and derives from it, once, the value
the command panel uses for the fuel ceiling:

```
SystemSpaceView.tsx:793
const currentQuote = burnPreview.preview && !burnPreview.stale ? burnPreview.preview : null
```

That value is non-null exactly when there is an acting fleet, a selection with
a wire request, none of the four withheld states (`previewWanted`, `:787`), a
response in hand for this (fleet, selection) key, and no error on the newest
attempt. Three predecessor links built and tested every transition into and
out of it. This link gives it a second reader and draws that reader on the
gauge. It is frontend only: no backend, no wire change, no new read, no new
invalidation.

The relation between the two readers is one-way (RULING 19). The overlay is
never drawn while `currentQuote` is null, so never without the determination
the ceiling reads. The reverse does not hold: the ceiling is present with no
overlay whenever the gauge has no data (a dry fleet) or the cost is
degenerate. Nothing here places a rule on the ceiling.

Three facts about the tree shape the decisions:

- `Gauge` is one atom shared by the fuel cell and the hold cell
  (`VitalsStrip.tsx:83,139`). The live hold requirement binds the atom: "the
  gauge itself SHALL expose no figure, no fill percentage and no accessible
  value".
- The fuel rail is 6 px by 40 px (`h-1.5 w-10`), `relative overflow-hidden
  rounded-full`. One pixel is 5 t on a 200 t hold; the rounded cap is 3 px.
  The fuel fill is always one segment, so its shade is always
  `SEGMENT_SHADES[0]` (`bg-zinc-400 dark:bg-zinc-300`).
- The view re-renders on a 1 Hz coarse tick (`useCoarseWorldTime`, `:476`) and
  on every read. `mineRunning` (`:770`) carries a clock term and sits upstream
  of `currentQuote`.

## Goals / Non-Goals

Goals

- One reader rule for the overlay, with the wrong readers named.
- A prop path view -> strip -> fuel cell -> gauge that cannot carry a whole
  preview and cannot reach the hold gauge.
- A DOM contract tests can read without a numeric attribute.
- The paint of RULING 16, fixed to the class: a partial-height band, and a
  fixed-size full-height mark for the unaffordable state, with the fill's
  elements untouched.
- A map of which test file can observe each derivation the overlay consumes.

Non-Goals

- Cost or shortfall text, a served shortfall, any figure on the gauge
  (RULINGs 2, 3).
- Any edit to `use-burn-preview.ts` or `SpaceCommandPanel.tsx` (RULING 18).
- A scenario or test for the canvas-unavailable state (RULING 17).
- The drift on the fuel and hold cells after a failed own-fleets refetch
  (RULING 11). Decision 5 composes with its later fix without change.
- Any invalidation of the preview key on refuel, sell or any other mutation
  (RULING 13).
- A 3:1 contrast gate (RULING 16). Ratios are measured and recorded at the
  journey.
- Animation or transition of the band or the mark, in appearing, changing or
  being withdrawn.

## Decisions

### 1. The single reader rule

The strip's burn-cost input is built from `currentQuote`
(`SystemSpaceView.tsx:793`) and from nothing else. The expression that builds
it names no other preview value.

Wrong readers, each of which compiles and passes most tests:

| Wrong reader | What it gets wrong | Rows that fail it |
| --- | --- | --- |
| `burnPreview.preview` | keeps a stale quote on the gauge after a failed refresh (RULING 5) | task 3.4's failed-refresh row (overlay withdrawn, ceiling absent) and its pending-after-failure row. Every withheld-state row still passes, because the hook returns `preview: null` when disabled (`use-burn-preview.ts:91`). |
| currency keyed on a request in flight (`isFetching`) | either blanks the overlay on every refresh, or re-presents the stale quote while the request after a failure is pending | task 3.4: the pending-over-a-good-quote row fails the first form, the pending-after-failure row fails the second |
| `burnPreview.preview && !burnPreview.stale` written a second time at the mount | identical today, a second derivation that drifts the next time currency changes | none. Review only. |
| a value copied into `useState` by an effect, or held in a ref "to avoid flicker" | shows the previous quote for a render after it is gone, or across a selection or fleet change | replace-selection, resume, fleet-switch, commit-acceptance rows. A one-render lag from an effect is invisible under `act`; it is excluded by Decision 8, not by a test. |
| an affordability computed at the mount | mirrors `backend/fleet/service.go:584-589` without its refund and upkeep terms (RULING 3) | two view-level rows, one per direction of disagreement. Flag true with the cost above the fuel aboard: task 3.5's row (100 t against 80 t aboard, flag true, state affordable, no mark). It is the only row that fails `flag && cost <= fuel`. Flag false with the cost inside the fill: task 3.4's restore row (45 t inside 80 t, flag false, state unaffordable), which fails `flag \|\| cost <= fuel`. A bare `cost <= fuel` fails both. The strip and atom rows hand-set the flag and cannot see any of these. |
| `useBurnPreview` called in the strip or the gauge | doubles the request rate; breaks *The Strip Issues No Read of Its Own* | the existing static guard `frontend/hooks/use-burn-preview.call-site.test.ts` (one importer, and it is the view). |

Alternative considered: have the panel report "the quote I am showing" upward.
Rejected: the panel shows stale figures by design, and link 4 retires it.

The two surfaces treat a stale quote differently, on purpose (RULING 18): the
panel reads `preview`, keeps a stale quote on screen and marks it (amber
styling and affordability line included), while the gauge reads `currentQuote`
and draws nothing, because it has no room to say "stale". Link 4 inherits this
when it retires the panel.

Canvas availability is not a term of `currentQuote`, so the overlay is drawn
for a current quote while the canvas is unavailable. That is the absence of a
condition, not code, and this link pins it with no scenario and no test
(RULING 17). `docs/handoffs/followup-explain-withheld-burn-command.md` (F3)
owns the state.

### 2. Prop shape

One named type, exported from `Gauge.tsx`, carried unchanged down the path:

```ts
export interface GaugeCost {
  tons: number
  affordable: boolean
}
```

| Hop | Prop | Notes |
| --- | --- | --- |
| view -> `VitalsStrip` | `burnCost?: GaugeCost` | built inline from `currentQuote.fuelCostTons` and `currentQuote.affordable` |
| `VitalsStrip` -> `FuelCell` | `burnCost?: GaugeCost` | `HoldCell`'s signature is not widened |
| `FuelCell` -> `Gauge` | `cost?: GaugeCost` | |

Rules:

- **Optional and omitted.** When `currentQuote` is null the prop is absent
  from the element, never `burnCost={undefined}` (`frontend/CLAUDE.md`,
  "Optional props: omit them"). Each hop uses a conditional spread or two JSX
  branches. `tsconfig.json` does not set `exactOptionalPropertyTypes`, so the
  compiler will not catch an explicit `undefined`; this is a review rule.
- **Never a preview object.** The field is `tons`, not `fuelCostTons`, on
  purpose: a `BurnPreview` is then not assignable to `GaugeCost`, so
  `burnCost={currentQuote}` does not compile. A `Pick<BurnPreview, ...>` type
  was rejected for the opposite reason: a whole preview would be assignable to
  it and the strip would silently receive curve, instants and the stranding
  flag.
- **One object, not two flat props.** Cost and flag belong to one response.
  Two optional props admit a cost with no flag.
- **Identity is not stable and must not need to be.** The object is a fresh
  literal on each view render. Nothing may list it in a dependency array, and
  neither `VitalsStrip` nor `Gauge` is memoised on it. Both already re-render
  with the view on the coarse tick.
- **The flag is trusted as typed.** `affordable` is `boolean` end to end and
  the server serves it unconditionally (`backend/fleet/handler.go:307-319`).
  The gauge has no runtime guard on it. A guard would be dead code under the
  type and would make the gauge and the panel disagree about one malformed
  quote.

### 3. The gauge atom's new input, and why the hold gauge cannot be affected

`Gauge` gains exactly one optional prop, `cost?: GaugeCost`. With it omitted
the render output is identical to today's: no new attribute on the root (React
omits an attribute whose value is `undefined`) and no new child. The 18
existing `Gauge.test.tsx` tests pass no `cost`, need no edit, and are the
atom-level cover for the omitted input; no separate test restates it.

The hold gauge cannot draw a band or a mark because three things would each
have to change: `HoldCell` receives no `burnCost` (its props are `roster` and
`scale` only), `VitalsStrip` hands `burnCost` to `FuelCell` alone, and
`HoldCell`'s `<Gauge>` passes no `cost`. Task 2.3's row (the hold gauge's
`outerHTML` compared with and without a quote) fails any of the three.

Alternative considered: a `FuelGauge` wrapper around `Gauge` that owns the
overlay. Rejected: the band and the mark must sit inside the rail's
`overflow-hidden` box and share its scale, so the wrapper would need the
rail's internals.

`Gauge.tsx:20-25`'s header comment ("The one state this element DOES carry is
`data-gauge-state`") goes false and is updated in the same edit.

### 4. DOM contract (RULINGs 12, 16)

| What | Where | Values |
| --- | --- | --- |
| Overlay state | attribute `data-gauge-cost-state` on the gauge root, beside `data-gauge-state` | `affordable`, `unaffordable`. Absent when no overlay is drawn. |
| Extent (the band) | one child of the rail carrying the bare marker attribute `data-gauge-cost-extent` (empty value) | located by that attribute |
| Extent geometry | the band's inline `style.left` and `style.width` | `0%`, and the percentage of Decision 5 |
| Unaffordable mark | one child of the rail, a sibling of the band, carrying the bare marker attribute `data-gauge-cost-mark` (empty value) | present exactly when `data-gauge-cost-state` reads `unaffordable` |
| Mark position | the mark's inline `style.left` and `style.transform` | Decision 5 |
| Mark size | static classes only; the mark has no inline `width` or `height` | Decision 7 |

`data-gauge-state` keeps its three values and its meaning. Neither new element
carries `data-raw`, `data-unit`, text, an `aria-*` value, `tabIndex`,
`data-testid`, or any attribute stating the cost or a length as a number;
their drawn geometry, like the fill's, is the only place a length appears.
Both are real DOM nodes, never pseudo-elements, and both are descendants of
the root that carries `aria-hidden="true"`, so the whole overlay stays out of
the accessibility tree.

How tests read the band with no numeric attribute: the same way
`Gauge.test.tsx:135-175` reads the fill. `root.querySelector('[data-gauge-cost-extent]')`
finds the element; `Number.parseFloat(el.style.width)` is its length, compared
with `toBeCloseTo`, not string equality (arbitrary served costs do not divide
exactly). A zero-length or sub-pixel band is told from "no overlay" by
`data-gauge-cost-state` alone.

Two reader traps for the SDET:

- `Gauge.test.tsx`'s `fillElements()` helper (`:39-50`) selects every
  descendant with an inline width. With a `cost` supplied it also returns the
  band (never the mark, which has no inline width). New tests that assert "the
  fill is still 40 %" must exclude `[data-gauge-cost-extent]`. Existing tests
  supply no cost and are unaffected.
- The mark carries an inline `transform`. A no-animation assertion must look
  for a `transition` or `animation` style property and for `transition*` and
  `animate-*` class tokens. A substring match on `trans` fails a correct
  build.

The marker attributes are needed because the band, the mark and the fill are
otherwise the same shape (absolutely positioned children of the rail). A
`data-testid` on either was rejected: the gauge's test id is a prop, and
deriving more ids from it puts a naming convention inside a decorative atom.

### 5. Geometry and clamp (RULINGs 3, 9, 15, 16)

```
drawn    = gaugeState !== 'no-data'
           && cost !== undefined
           && Number.isFinite(cost.tons) && cost.tons >= 0
pct      = Math.min((cost.tons / capacity) * 100, 100)
state    = cost.affordable ? 'affordable' : 'unaffordable'

band     : left = 0%          width = pct%
mark     : rendered iff drawn && state === 'unaffordable'
           left = pct%        transform = translateX(-pct%)
```

The band:

- **Same scale as the fill.** The expression is the fill's own
  (`Gauge.tsx:90`), with the same `capacity`. No second denominator exists.
- **Start-anchored.** `left` is always `0%`. It is not offset by the fill.
- **Limited to the rail.** A cost at or above capacity gives `100%`. Nothing
  distinguishes a clamped band from an exact fit, and nothing asserts a
  clamped cost is unaffordable.
- **Zero is drawn.** `tons === 0` passes the guard: the band is rendered at
  `0%` and the state attribute is present.
- **No minimum width.** A minimum would misstate the cost.
- **Degenerate costs are not drawn.** `NaN`, `Infinity`, `-Infinity` and any
  negative draw no band, no mark and no state attribute, and leave the root
  exactly as it is without `cost`.
- **No data, no overlay** (RULING 15). `gaugeState` already returns `no-data`
  for a capacity that is undefined, non-finite or not positive, and for
  undefined segments (`Gauge.tsx:61-72`). The overlay reuses that one
  predicate. When the RULING 11 drift is later fixed by withholding the
  roster, capacity goes undefined and the overlay goes with the fill, with no
  edit here.

The state:

- **It never reads the segments.** `state` is a function of `cost.affordable`
  only. The gauge holds both the fill tonnage and the cost, so it is the one
  place a comparison could be written; it must not be. No subtraction of fuel
  from cost appears anywhere on the client.

The mark:

- **Keyed to the state, never to geometry.** It is rendered when the state is
  `unaffordable` and at no other time. It does not compare the band with the
  fill, and it does not read whether the cost was limited to the rail.
- **Position is two components, both the band's own percentage.** The start
  position is `left: pct%`, the extent's length as a percentage of the rail.
  The pull-back is `translateX(-pct%)`, the same percentage of the mark's own
  width. A percentage in `left` resolves against the rail's width and a
  percentage in `translateX` against the mark's width, so the mark's leading
  edge sits at `pct x (rail - mark)`. At a cost of zero the leading edge is
  the rail's start. At a cost at or above the capacity the trailing edge is
  the rail's end. At every cost between, the band's end lies on the mark.
  `pct` is already limited to `[0, 100]`, so no second clamp exists. This is
  the delta's own statement of the placement, component for component.
- **A mark with no pull-back is the wrong build to guard against.** `left:
  pct%` alone puts the whole mark past the rail's end at a cost at or above
  capacity, where the rail's `overflow-hidden` clips all of it. Task 2.2's
  rows at 100 t and 250 t fail it.
- **"Inside the rail" is the rail's box.** The rail is `rounded-full`. At a
  cost of zero and at or above capacity the mark's box is flush with the
  rail's box, and the 3 px cap clips the mark's outer edge column and its
  corners (Decision 7). No placement that puts the leading edge at the rail's
  start can avoid that.
- **This mark is not RULING 9's clamped marker.** A cost at or above capacity
  still draws nothing that says "clamped". An unaffordable quote at or above
  capacity draws the mark because it is unaffordable, at the rail's end.
- **No `clamp()`, `min()`, `max()` or `calc()`.** Verified in the suite's
  environment (jsdom 26.1.0, cssstyle 4.6.0, React 19.2.3, rendered through
  `react-dom/client`): a plain percentage `left` and a `translateX(<n>%)`
  transform are stored verbatim, including `translateX(-0%)` and
  `translateX(-100%)`. `calc()` is also stored verbatim. `clamp()`, `min()`
  and `max()` are **kept but rewritten into nonsense** (`clamp(0px, calc(37.5%
  - 2px), calc(100% - 4px))` reads back as `clamp(0px * , * , * calc(100% -
  4px) * calc(37.5% - 2px))`), so a position built on them could not be
  asserted at tier 1.
- **Size is fixed and static.** Width and height come from classes (Decision
  7). Nothing about the mark's size is inline, so nothing about it can vary
  with the cost.

What tier 1 can and cannot assert about the band's height and the mark. "Held
by" names the task whose text asserts the row; "none" means the row is
readable at tier 1 and no task reads it.

| Claim | Tier 1 (jsdom) | How | Held by |
| --- | --- | --- | --- |
| the band is part-height, leaving the rail uncovered both above and below it, and the fill is full-height | yes, as class tokens | the fill's elements carry `inset-y-0`; the band carries `inset-y-0.5`, which insets it from both the rail's top edge and its bottom edge, and not `inset-y-0`, and no inline `top`, `bottom` or `height`; at a 30 t and a 100 t cost | task 1.1 |
| the mark is present when unaffordable, absent when affordable | yes | `querySelector('[data-gauge-cost-mark]')` against `data-gauge-cost-state` | tasks 2.1, 2.2 |
| the mark is present at a sub-pixel cost | yes | same, at 0.4 t | task 2.2 |
| the mark has a non-zero width and the rail's full height | yes, as class tokens | `className` contains `w-1` and `inset-y-0` | task 2.2 |
| the mark is the same size at every cost | yes | `className` is string-identical at 0.4 t and 30 t, and `style.width` and `style.height` are both `''`. The mark has no inline size to compare; equal classes and no inline size is the whole of "same size". | task 2.2 |
| the mark's start position is the extent's length in percent | yes | `parseFloat(style.left)` reads 0, 50, 100 at costs 0, 100, 250 t, equal to the band's `parseFloat(style.width)` | task 2.2 |
| the pull-back is the same percentage of the mark's own width | yes | the number inside `style.transform`'s `translateX(...)` is minus `parseFloat(style.left)` (`toBeCloseTo`; at zero it reads `-0`). A mark with no `transform` fails at 100 t and 250 t. | task 2.2 |
| the mark's paint differs from the unaffordable band's | yes, as class tokens | per colour scheme, the mark body's background shade is not the unaffordable band's background shade: `amber-500` against `amber-800` in the light scheme, `amber-400` against `amber-600` in the dark scheme (Decision 6) | task 1.4 |
| class family and dark counterparts, band and mark | yes | Decision 6 | task 1.4 |
| band and mark inside the `aria-hidden` root; no transition or animation | yes | ancestry; class tokens and style properties | task 1.6 |
| the mark is a sibling of the band, a child of the rail, after the band | yes | `parentElement`, and DOM order | none; review |
| no part of the mark lies outside the rail, as rendered pixels | **no** | jsdom does no layout; every rect is zero. The two position components are what containment reduces to. | no tier. Task 2.2 holds the two components; review holds the rest. The journey has no containment leg. |
| the cap's clipping of the mark at the rail's two ends | **no** | no layout, no CSS | no tier; review |
| the fill's end stays visible beside a longer band; legibility of band and mark | **no** | jsdom applies no Tailwind CSS | the journey |

### 6. Tone classes (RULINGs 4, 16)

`harness/check-color-compliance.py` was run on probe files holding the exact
strings below: zero errors, zero warnings. The script cannot hold this
decision. It has rules for `gray`/`slate`/`neutral` scales, `dark:bg-zinc-900`,
`dark:bg-zinc-800`, `bg-black`, three specific classes without a same-line
dark variant, and hex colours in inline styles. It has no rule for red, blue
or amber, and none that a tone carries a dark variant. The fence is held by
the tier-1 class-family assertion against the set below (task 1.4), and by
review.

The fence is a family fence: the overlay uses no colour family other than
amber and zinc. It is not a fence on shade tokens. `bg-amber-800`,
`border-zinc-900` and `dark:border-zinc-950` appear nowhere under
`frontend/components/space` or `frontend/components/fleet` today; each is a
new shade inside a permitted family. The amber rule is about the band's
paint: the unaffordable band is amber, and the mark, which belongs to the
same state, has an amber body and a zinc edge.

The one source for that assertion. Static strings, each pair on one line,
selected from constants keyed by the state (the idiom `SEGMENT_SHADES[index]`
already uses); never built at run time, which Tailwind cannot see.

| Element | State | Colour classes |
| --- | --- | --- |
| band | `affordable` | `bg-zinc-600 dark:bg-zinc-500` |
| band | `unaffordable` | `bg-amber-800 dark:bg-amber-600` |
| mark | (`unaffordable` only) | `border-zinc-900 bg-amber-500 dark:border-zinc-950 dark:bg-amber-400` |

The complete set of colour tokens on the overlay is therefore eight:
`bg-zinc-600`, `dark:bg-zinc-500`, `bg-amber-800`, `dark:bg-amber-600`,
`border-zinc-900`, `dark:border-zinc-950`, `bg-amber-500`, `dark:bg-amber-400`,
and no others. Every colour token is amber or zinc; every light token has a
`dark:` token of the same utility on the same element; none names another
colour family; none carries an opacity suffix. In each colour scheme the mark
body's background shade is not the unaffordable band's background shade:
`amber-500` against `amber-800` in the light scheme, `amber-400` against
`amber-600` in the dark scheme.

Why these, with indicative ratios. All figures are hand-computed WCAG
relative-luminance ratios from the Tailwind default hexes, against a fuel fill
of `zinc-400` / dark `zinc-300` and a rail of `zinc-300` / dark `white/[0.12]`
over the strip's `zinc-700/95`. Tailwind v4 ships these colours in OKLCH, so
the rendered values differ slightly. The journey measures; nothing gates on
these numbers.

| Tone | Light: vs fill / vs rail | Dark: vs fill / vs rail |
| --- | --- | --- |
| affordable band | 3.0 / 5.2 | 3.3 / 1.5 |
| unaffordable band | 2.8 / 4.8 | 2.2 / 2.3 |
| mark edge (the border) | 6.7 / 11.6 | 13 / 2.7 |
| mark body against its own edge | 8 | 12 |

- **Affordable band.** The pair is `SEGMENT_SHADES[2]` whole
  (`Gauge.tsx:55`), a class pair already in the gauge's own shades, which is
  RULING 4's literal wording and what task 1.4 asserts. Neither tone is the
  fuel fill's own shade in its scheme, and each is about 3:1 against that
  fill. `bg-zinc-700` would read about 4:1 in the light scheme, but
  `bg-zinc-700 dark:bg-zinc-500` is not an existing pair.
- **Unaffordable band.** Darker amber than the panel's in the light scheme,
  because `amber-500` and `amber-600` disappear inside a `zinc-400` fill
  (about 1.2:1). In the dark scheme `amber-600` is the tone that is visible on
  both surfaces; `amber-400` reads 4.5:1 on the rail and 1.1:1 inside the
  fill, so a band lying inside the fill would vanish.
- **Mark.** The body is the panel's own amber (`amber-500`,
  `SpaceCommandPanel.tsx:115`) and the strip's dark amber (`amber-400`,
  `VitalsStrip.tsx:101`). The 1 px edge is near-black in both schemes, so the
  amber body is always read against its own edge, not against whatever it sits
  on. That is how one amber body crosses from rail to fill in the dark scheme.
  The edge is a `border`, not a `ring`: a ring is a box shadow, which forced
  colours remove, while a border is redrawn in a system colour. The mark is
  then expected to be the one part of the overlay that survives forced
  colours. That is unverified; no tier renders forced colours, and the fill
  and the band are background-only and are expected to vanish there, as the
  fill does today.

What the dark scheme does not achieve:

- No zinc tone reaches 3:1 against both the light fill and the dark rail. The
  affordable band is chosen for the ordinary case, inside the fill (3.3:1).
  Past the fill's end it is about 1.5:1 against the rail. That arrangement is
  the refunded re-target of a burning fleet, and it is the weakest picture in
  this design. `dark:bg-zinc-950` would read about 2.7:1 on the rail and 13:1
  on the fill and passes the script, but it is not a tone on the gauges and
  sits one step past the `dark:bg-zinc-900` the script forbids. It is a
  one-class change if the journey's measurement asks for it.
- No amber tone reaches 3:1 against both surfaces either. The unaffordable
  band is about 2.2:1 on each. The mark, not the band, carries the warning.
- The mark's edge against the dark rail is about 2.7:1. There the amber body
  carries it (about 4.5:1 against the rail).

### 7. Paint order, placement and the class strings

Rail children, in DOM order: every fill segment, then the band, then the mark.
Later children paint over earlier ones. No `z-index` class is used.

| Element | Full static class string (the state's colour pair from Decision 6 appended) |
| --- | --- |
| band | `absolute inset-y-0.5` + colour pair |
| mark | `absolute inset-y-0 w-1 border` + colour classes |

- **The band is 2 px high and vertically centred** (`inset-y-0.5` on the 6 px
  rail). The fill stays full height (`inset-y-0`, `Gauge.tsx:100`, unedited),
  so 2 px of it show above and below the band, one strip on each side of it, and the fill's end is locatable whichever of the two is longer. A
  centred band is clipped least by the 3 px rounded cap (under 0.2 px at its
  start); an edge-aligned band loses most of its first pixel to the cap's
  curve.
- **The mark is 4 px wide and the rail's full height** (`w-1`, `inset-y-0`):
  a 1 px edge around a 2 px by 4 px amber body. Preflight sets
  `box-sizing: border-box`, so the border is inside the 4 px.
- **Inline styles carry geometry only**: `left` and `width` on the band,
  `left` and `transform` on the mark. No colour, no size on the mark.
- **The fill's elements, classes and inline geometry are not edited.**
- **Nothing animates.** No `transition*` or `animate-*` class and no
  `transition` or `animation` style on the band or the mark. A change of cost,
  a change of state and a withdrawal each land in one render. The mark's
  `transform` is a static placement, not a motion.

At the two ends of the rail the rounded cap clips the mark's outer edge column
and its corners. The amber body lies 1 px to 3 px in from the rail's end,
where the cap leaves at least 4.4 px of height, so the body is not clipped.

Rejected, each inside RULING 16's reasoning:

| Treatment | Why not |
| --- | --- |
| Hue only, no mark | a sub-pixel unaffordable band is invisible, and amber against zinc fails colour-vision profiles |
| Mark as a child of the band | a child anchored to the end of a sub-pixel band lies left of the rail's start and is clipped; a child just past the band's end is clipped at a clamped 100 % |
| Mark positioned with `clamp()` | correct in a browser, unreadable at tier 1 (Decision 5) |
| Mark inside an inset track wrapper | same placement from one inline value, but one more element, and the mark is no longer a sibling of the band |
| Translucency | two tints overlapping on 6 px read as a third colour |
| Hatch or stripe | needs a gradient; the palette rules reserve gradients for icons |
| Band under the fill | invisible whenever cost is at or below the fuel aboard |
| A minimum band width | breaks "length is cost over capacity" |
| A taller or wider rail | moves the 1280 x 720 floor |
| A pulse or fade | no animation |

### 8. No state copy, no second hook call, no clock in a memo

- The strip's input is derived during render, either inline at the
  `<VitalsStrip>` mount (`:1071`) or as one `const` directly below `:793`.
- No `useEffect` copies the quote into `useState`. No ref caches the last
  quote.
- No `useMemo`. If one is ever added it may depend on `currentQuote` only,
  never on `worldTime`, `burnPreview` (a new object each render) or any other
  clock-bearing value.
- `useBurnPreview` keeps its single call site (`:788`). The existing guard
  `frontend/hooks/use-burn-preview.call-site.test.ts` already fails if the
  strip or the gauge imports it. This change adds no static guard and does not
  edit that file.
- `Gauge`, `FuelCell` and `VitalsStrip` gain no hook.

A request in flight changes nothing the overlay reads, in either direction:

- **Over a good quote.** The query keeps `query.data` and has no error, so
  `currentQuote` and the overlay hold until the response lands, and the new
  cost then replaces the old in one render with no render between in which no
  overlay is drawn.
- **After a failed refresh.** The hook derives `stale` from `query.error` and
  the retained data (`use-burn-preview.ts:92-99`), and the query keeps its
  error while a refetch over existing data is in flight. So `stale` holds,
  `currentQuote` stays null, and the overlay and the ceiling stay withdrawn
  while the next refresh is pending. They return only
  when a response succeeds. Nothing in this change reads `isFetching`.

A refused or failed commit never reaches `handleCommitAccepted`, so it changes
nothing the overlay reads.

A change to the fuel aboard reaches the fill through the own-fleets read and
does not touch the preview query, so of itself it neither changes the overlay
nor sends a preview request (RULING 13). The overlay keeps the response it has
until the first preview response requested after the change lands; the refresh
interval sends that request no later than one interval after the change, and
if it fails the overlay is withdrawn like any other failed refresh.

### 9. Render-loop safety

`fix-world-time-render-loop` (archived 2026-10-03, design Decisions 1-2)
removed per-frame view renders; the view now renders on the coarse tick and
on reads. This change adds no state, no effect, no ref and no subscription,
so it adds no render. The strip re-renders exactly when it does today.

`SystemSpaceView.render-loop.test.tsx` mocks `useBurnPreview` to the null
shape (`:95-96`). It guards that the wiring is inert with no quote. It cannot
see an overlay, so it cannot see a loop that only occurs with one. The guard
for that case is the journey's hard `afterEach` update-depth assertion with an
overlay drawn, plus Decision 8 making such a loop impossible to write without
adding a hook.

### 10. The U2 timer hunks stay byte-identical

`docs/handoffs/add-vitals-strip-qa-reverify.md` lists U2 as the two
`wallMsUntil(...) + ETA_CUSHION_MS` timer delays in `SystemSpaceView.tsx`. It
cites `:187-192` and `:556-562` at `592df53`; at `d965f5d` they are at
`:188-194` (the scan-sweep watcher) and `:589-593` (the arrival refetch).
This change's only edits to the file are at or below `:793` and inside the
`<VitalsStrip>` mount at `:1071-1082`, plus at most one import-list addition
for the type. Check before the per-commit gate: `git diff -U0` on the file
shows no hunk between lines 130 and 620.

### 11. Test-harness map

For each derivation the overlay consumes, the file that can observe it and
the file that cannot.

| Derivation | Can observe | Cannot observe, and why |
| --- | --- | --- |
| band geometry, part height against a full-height fill, clamp, zero, degenerate cost, state attribute; no overlay on a no-data gauge | `Gauge.test.tsx` (tasks 1.1-1.3, 1.5) | the no-data row lives here only. `FuelCell` adds no branch for it, so the strip does not repeat it. Part height is read as class tokens; that the fill's end is visible beside the band is pixels. |
| the mark: present at a sub-pixel unaffordable cost; non-zero width, full height and the same size at 0.4 t and 30 t; absent for an affordable quote; start position and pull-back at 0, 100 and 250 t (Decision 5's table) | `VitalsStrip.test.tsx` (tasks 2.1, 2.2) | pixel containment, the cap's clipping and legibility: no layout and no CSS in jsdom. Containment as rendered pixels and the cap's clipping are asserted at no tier and are held by review; the journey samples the mark's centre pixel only, where it arranges an unaffordable overlay. |
| class family and dark counterparts for band and mark (Decision 6's set); no other colour family; the mark's colour tokens differ from the unaffordable band's | `Gauge.test.tsx` (task 1.4) | `harness/check-color-compliance.py`: it has no rule for either. It still runs on changed files in the per-commit gate (task 6.1), and no separate task runs it. |
| decorative invariants with an overlay drawn: band and mark inside the `aria-hidden` root, no figure, no focus, no transition or animation | `Gauge.test.tsx` (task 1.6) | — |
| the omitted input leaves the gauge as it is | the 18 existing `Gauge.test.tsx` tests, unedited, and the strip's identical-hold-subtree row (task 2.3) | no separate atom test restates it |
| fuel cell passes the cost; flag wins over the picture, as one parametrised pair whose tonnages disagree with it (40 t / 60 t / true, mark absent; 80 t / 20 t / false, mark present); hold gauge untouched; draining marker coexists; no verb, no text, no request | `VitalsStrip.test.tsx` (tasks 2.1, 2.3-2.5; its fleet fixture serves fuel) | it hand-sets `burnCost`, so it observes an arrangement, never the reader rule |
| `currentQuote`: first pending and first failed, each arm ending with its positive control, the overlay drawn at 15 % once a 30 t response lands (task 3.3); the refresh walk: pending over a good quote, failed refresh, the next refresh pending after the failure with no overlay and no ceiling, restore (task 3.4); selection replaced or cleared (task 3.5) | `SystemSpaceView.burn-preview.test.tsx` (real hook, real panel, real strip) | the seven view files that mock `useBurnPreview` to null: `SystemSpaceView.test.tsx`, `.render-loop`, `.scan-refetch`, `.scan-settle-announcement`, `.scan-targets-refetch-on-arrival`, `.sighting-log-mount-ordering`, `.sighting-log-no-ghost-reasons` |
| the reader computes no affordability of its own | `SystemSpaceView.burn-preview.test.tsx`: task 3.5's row (100 t against 80 t aboard, flag true, state affordable, no mark) for the flag-true disagreement, and task 3.4's restore row (45 t inside a fill of 80 t, flag false) for the flag-false one | every strip and atom row: the flag is hand-set there |
| withheld by a running mine, lane transit, docked at the target; resume after a mine | `SystemSpaceView.burn-preview.test.tsx` | — |
| withheld by a committed order: acceptance, the read reporting the burn, the cut and the restoring response, another target and back | `SystemSpaceView.stranding-notice.test.tsx` (real `use-fleets`, service mocked, reads settled by index) | `burn-preview.test.tsx`: it mocks `useMyFleets`, so no read answers after a commit and the committed state holds until unmount. An overlay asserted to return there fails by construction. The failed own-fleets read in the gap has no row of its own: it is an inherited sub-case of the committed selection's life, and a reader that passes the acceptance row cannot fail it. |
| acting-fleet switch | `stranding-notice.test.tsx`, by `fleet-row-<id>`. Its stage mock has no fleet-activation trigger and gains none. | — |
| the fill moves before the overlay does (task 3.10) | `burn-preview.test.tsx`, by changing the mocked own-fleets answer and counting preview requests | the cause. `useRefuel` is mocked inert in both view harnesses, so neither can observe that a refuel invalidates nothing. |
| one preview call site | the existing `use-burn-preview.call-site.test.ts`, unedited | — |
| canvas unavailable with a current quote | no file, by ruling | both real-hook harnesses hard-code `onAvailabilityChange(true)` in their `SpaceStage` mock (`burn-preview.test.tsx:143`, `stranding-notice.test.tsx:136`); every harness with a `stage.available` switch mocks `useBurnPreview`. Drawn by construction, not pinned (RULING 17). |
| paint: the sampled pixels of fill, band and rail are pairwise unequal as sRGB values in each scheme, ratios recorded and not gated; the band past the fill against the rail, and the mark against band and fill, only where the journey arranges them, else UNTESTED | the journey only (task 6.2) | jsdom applies no Tailwind CSS; tier 1 sees class tokens |

Fixture facts: both real-hook harnesses seed `cargo: {}` and `cargoCapacity:
40` against a quote costing 744.2984 t, so the fuel gauge is `no-data` and no
overlay can be drawn whatever the wiring does. A fuel-bearing fleet (80 t on
200 t) and a quote below capacity are added beside the existing fixtures. A
green existing suite says nothing about the overlay.

Journey measurement: sample pixels from the screenshot, not computed styles.
The rail's dark tone is translucent (`white/[0.12]`), so its computed
background is not its rendered colour, and Tailwind v4's palette is OKLCH, so
a computed value is not an sRGB triple a ratio can be taken from directly.

The delta names three sample points, plus two conditional ones. Under this
geometry they are:

| Delta's sample | Where it is on this rail |
| --- | --- |
| the fill's part not covered by the extent | the band is 2 px high and centred, so the uncovered fill is a strip above the band, a strip below it, and, when the fill is the longer, the full-height part past the band's end. Sample the centre of that full-height part when the fill is longer; otherwise the centre of the strip above the band. The geometric centre of the whole uncovered region can fall on the band and is not the sample point. |
| the extent | the band's middle row, at half its length |
| the rail covered by neither | the rail's centre row, midway between the longer of fill and band and the rail's end |
| the extent past the fill's end (only if arranged) | the band's middle row, midway between the fill's end and the band's end |
| the mark (only if an unaffordable overlay is arranged) | the mark's centre, which is its amber body, not its edge |

The leg is UNTESTED when the band is under 2 device pixels long. `frontend/playwright.config.ts`
sets no device scale factor, so a device pixel is a CSS pixel there and 2
device pixels is 10 t on a 200 t capacity. The band is 2 px high.

## Risks / Trade-offs

- **Paint on 6 px.** A build that satisfies every DOM row can still be
  unreadable. Tier 1 cannot judge it. Mitigation: the journey's pixel
  measurement and the UX reviewer; every tone is one class to change.
- **The dark scheme's shortfalls** (Decision 6): the affordable band past the
  fill, and both bands under 3:1.
- **The mark may reach no rendered tier.** Its presence, its size and both
  components of its position are asserted at tier 1 (tasks 2.1, 2.2), and its
  colour tokens at task 1.4. The journey asserts an unaffordable overlay only
  if the stack can arrange one inside the bounded probe (RULING 14), and then
  samples the mark's centre pixel only. The mark's containment as rendered
  pixels and the cap's clipping at the rail's two ends are asserted at no tier
  and are held by review. If the probe arranges no unaffordable overlay, the
  mark's legibility is unobserved as well. The band-past-the-fill arrangement
  is likewise sampled only if arranged.
- **The mark covers 4 px of rail**, a tenth of it. When cost and fuel are
  within about 20 t of each other on a 200 t hold, the mark overlaps the
  fill's end.
- **Short bands.** A cost under 5 t is under one CSS pixel. For an unaffordable
  quote the mark carries it. For an affordable one nothing is visible, which
  is harmless.
- **The wrong reader that no test catches** is the second, identical
  derivation (Decision 1, row 3). Held by review.
- **Colour and shape, but no text, after link 2b.** The gauge is
  `aria-hidden`; the panel's affordability text is the only carrier a
  screen-reader user has, and 2b collapses the panel by default. Carried
  forward to 2b's "read first", together with: keep the mark.
- **A dry fleet sees no overlay** (RULING 15). Its fuel figure reads absent
  and the panel says "Not affordable with the fuel aboard".
- **The mocked-harness trap** (Decision 11): a commit-lifetime row placed in
  `burn-preview.test.tsx` fails by construction.
- **Shared atom.** Any edit to `Gauge` reaches the hold gauge. Held by the
  optional prop and the identical-subtree row.

## Migration Plan

None. No stored data, no wire shape, no flag, no coexistence. The change is
additive on one optional prop path and is removed by deleting that path.

Order of work (tests first, per tasks.md): atom, then strip, then the two
view harness fixtures, then the wiring. The wiring is the last production
edit and the only one in `SystemSpaceView.tsx`.

## Open Questions

None. The four panel questions and the cross-reviewer conflicts are ruled:
RULINGs 15-19 in `docs/handoffs/add-burn-cost-overlay-rulings-index.md`.
The tone classes of Decision 6 are settled for the build and are revisited
only if the journey's recorded ratios ask for it.

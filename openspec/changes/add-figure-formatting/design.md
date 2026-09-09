## Context

Link 1 of `docs/plans/system-hud/chain.md`. The system space view's HUD
renders wire values directly — a world-millisecond integer as an arrival
time, a 15-digit float as a fuel tonnage — because no shared presentation
layer exists; three near-duplicate duration formatters
(`frontend/lib/eta.ts` and two component-local `countdown()` copies) have
grown up ad hoc, one of them assuming a world-clock scale of 1 that the
domain model explicitly forbids assuming. Every figure this change formats
is already served; this is a pure frontend presentation change with no
backend surface, sized primarily by the fifteen (13 MODIFIED + the ADDED
capability's own suite) requirement targets and the ~64 test assertion
sites the analysis catalogued.

Full rulings basis: `docs/plans/continous_space/handoffs/add-figure-formatting-rulings.md`
(the full set of FULL-AUTO rulings recorded there, appended to across the
design, panel, and adversary passes). This document records the resulting
*design* decisions — module shape, call-site wiring, enforcement mechanism
— that the rulings left to the writer.

## Goals / Non-Goals

- **Goal:** one pure module, `frontend/lib/format/`, that is the only place
  a wire number becomes player-facing text, fixture-tested against
  `(raw, scale, expected)` rows.
- **Goal:** every rendered figure carries its raw served value and its unit
  on `data-*` attributes, so tests read wire figures, not copy.
- **Goal:** delete `frontend/lib/eta.ts` and its two duplicated local
  `countdown()` copies in this same change — no coexistence period.
- **Non-goal:** any layout, palette, type-scale, or panel-fill change.
- **Non-goal:** the galaxy view's own chrome or clock (RULING 7; the galaxy
  clock's scale-1 assumption is a separately filed defect, not fixed here).
- **Non-goal:** `SpaceStage`'s bearing/speed hover figures (RULING 10; no
  covering requirement exists for them anywhere, so writing rounding rules
  for them here would be inventing behaviour, not migrating it — separately
  filed as a defect for a future brownfield pass).
- **Non-goal:** `market-board-panel`'s figures (RULING 11; chain link 4).
- **Non-goal:** locale-aware/`Intl` formatting — it would make the fixture
  table environment-dependent, defeating the purity requirement (R13).

## Decisions

### Decision: Module shape — pure string functions plus one `<Figure>` element
`frontend/lib/format/` exports pure `(value: number | null | undefined, …) =>
string` functions, one per quantity (duration, absolute stamp, tonnage,
range, delta-v, credits, rate), plus the shared absent-value form. A single
`<Figure>` component takes `{ raw, unit, text }` and is the **only** place
that emits `data-raw`/`data-unit` onto a DOM element.

- Alternative — formatters return JSX directly: rejected. It makes the
  fixture table impossible to state as plain `(raw, expected)` string pairs,
  which R13's own pinning scenario requires, and it would let each call site
  reinvent how the raw attribute is attached.
- Alternative — every call site hand-writes `data-raw`/`data-unit`:
  rejected. This reintroduces the exact defect being removed at ~25 call
  sites; a missing attribute would be indistinguishable from a legitimate
  no-figure element, and R12's "only place a wire number becomes text" rule
  would have no structural enforcement.
- The composite-line cases (`commit-drift-notice`'s four figures, the hold
  readout's `used / capacity`, a sighting row's `asOf` beside a raw host id)
  are handled by mounting multiple `<Figure>` elements side by side rather
  than one element with multiple attributes — this is what makes R11's "one
  raw value per figure" scenario satisfiable at all for those elements.

**Where the pieces live, and why:**

| Artifact | Path | Why there |
|---|---|---|
| The pure functions | `frontend/lib/format/figures.ts` | One module file, not seven: the changed-file coverage validator (`.claude/scripts/check-frontend-tests.sh`) demands a colocated `*.test.ts` per non-exempt file, so a file-per-quantity split multiplies test files without adding coverage. |
| Barrel | `frontend/lib/format/index.ts` | `index.*` is exempt from the coverage validator; re-exports only. |
| The fixture table | `frontend/lib/format/cases.json` | JSON, so it needs no colocated test of its own, and **not** under the repo-root `fixtures/` tree — that directory's semantics are cross-language pins, and a table there would imply the Go counterpart RULING 6 says will never exist. |
| The element | `frontend/components/figure/Figure.tsx` (+ colocated test) | Mounted from `components/space/*`, `components/fleet/*` and `components/galaxy/*`, so it belongs to none of them; `components/render-guard/` is the existing precedent for a shared, non-Catalyst component folder. Keeping it out of `lib/format/` also keeps that directory free of any React import, which is what makes R13's purity and import-guard claims mechanically checkable over the whole directory. |

**`<Figure>` is a presentation atom, not a UI primitive — and must not become
one.** `frontend/CLAUDE.md` mandates Catalyst for UI primitives; Catalyst has
no numeric-readout primitive, and its `Text` carries its own type scale, so
routing these figures through it would itself be the type-scale change this
change's non-goals forbid. The line held instead:

- `<Figure>` renders **exactly one `<span>`** and nothing else. No wrapper,
  no layout class, no default `className`, no font/colour/spacing class of
  its own.
- Its props are `raw`, `unit`, `text`, pass-through `className` +
  `data-testid`, and one further exception: an optional accessible label
  (`aria-label` / `title` pass-through), added per RULING 22 as the delivery
  mechanism for R4's accessible-explanation scenario — the `×N` suffix's
  "the world clock is running at N times real time" label has no other place
  to attach. It accepts no `children` — text may only arrive as the `text`
  prop, so no call site can slip unformatted content through it — and no
  `variant`, `size`, `tone`, or `emphasis` prop. The fence against those four
  stands exactly as before: the first such prop is the moment `<Figure>`
  starts competing with Catalyst and setting the type scale, and an
  accessible label sets no type scale and renders no visible style, so it is
  outside that fence's rationale rather than a crack in it. If a later link
  wants a visual/type-scale prop, that is a `system-console` decision, not a
  `figure-formatting` one.
- Every call site keeps the classes it has today by passing them through, so
  the rendered appearance is unchanged except for the figure text itself.

**Where the `data-testid` lands.** Where a testid identifies exactly one
figure (`preview-fuel`, `fleet-fuel-*`, `scan-countdown`), the testid moves
onto the `<Figure>` span and the string stays the same, so no selector
changes. Where today's testid names a composite element (`hold-capacity` is
`{used} / {capacity} t`; `commit-drift-notice` is four figures in a
sentence), the wrapper keeps its existing testid and each `<Figure>` inside
it takes a new, derived one (`hold-capacity-used`, `hold-capacity-total`,
`commit-drift-actual-deltav`, `commit-drift-actual-arrival`,
`commit-drift-previewed-deltav`, `commit-drift-previewed-arrival`). This is
what the e2e helper rewrite (tasks 10.1) has to target: `digits()` cannot
simply read `data-raw` off the old testid, because on a split element that
attribute is on a child.

**The one platform exception: `<option>`.** `ScanControl.tsx:290` renders a
sweep duration inside a `<select>`'s `<option>` (`{kind} · {hostId} ·
{countdown(...)}`). An `<option>`'s content model is text; nesting a `<span>`
there is invalid HTML, is dropped by native select rendering, and React
warns on non-string `<option>` children. Because that option contains
**exactly one** figure, the attribute pair goes on the `<option>` element
itself rather than on a nested span, and the option's `value` (the host id)
is untouched so the eight existing `selectOptions(..., HOST_ID)` sites keep
working. R11 needs a scenario permitting this — see the panel report; it is
not an implementation liberty the implementer may take unspecced.

**The `data-unit` vocabulary is a closed set, exported from the module.**
`unit` is a TypeScript string-union type exported by `lib/format`, not a
free string, so `<Figure>`'s prop type refuses an invented spelling at
compile time. The set: `world-ms-span-in`, `world-ms-span-left`,
`world-ms-span-ago`, `world-ms-span-bare` (a duration's unscaled span,
tagged by which of R3's direction forms the element's text claims —
RULING 23, so `(raw, scale, token)` is a total function and
`assertFiguresMatchModule` never has to guess which of R3's four forms a
duration element claims), `world-ms-instant` (an absolute stamp), `tons`,
`range`, `delta-v`, `credits`, `tons-per-world-ms`, `tons-per-world-s`. A
duration and a stamp must **not** share one `world-ms` token — a test
reading `data-unit` could then not tell `in 4m 12s` from `T+ 2d 04:13`,
which is the exact confusion RULING 1 exists to prevent, restated in the
attribute contract. A call site chooses its duration token from its own
known form — the mine preview's bare cost, the mine countdown's `left`, a
burn preview's `in` — never by inspecting the raw value after the fact.

### Decision: The served scale reaches every call site as a prop, never a context
`SystemSpaceView` already threads `worldTime` as an explicit prop to four of
the six components this change touches (`SpaceStage:729`,
`FleetActionsPanel:813`, `ScanControl:824`, `FleetRoster:891`), and
`FleetRoster`'s own header comment records why: "the world clock comes in as
a prop because both views already run one and the roster must tick in step
with the picture." The served scale is the second half of that same clock and
travels the same way — a `scale` prop beside `worldTime`, from the mounting
view.

**This is depth-1 threading, not prop drilling.** All six consumers
(`SpaceStage`, `SpaceCommandPanel`, `FleetActionsPanel`, `ScanControl`,
`SightingLog`, `FleetRoster`) are direct children of `SystemSpaceView`
(`:725`, `:765`, `:797`, `:805`, `:822`, `:890`); `FleetRoster`'s second
mount is a direct child of `GalaxyView` (`:472`). No component passes the
scale to a grandchild. The ~25 call sites are ~25 *formatter calls* inside
six components, not 25 hops. Threading that decays is threading through
intermediate components that do not use the value; there are none here.

- Alternative — a React context carrying the scale: rejected. RULING 1
  forbids the *formatter* from defaulting or inferring a scale; a context is
  one architectural step from that same ambient-state shape, and R13's own
  purity scenario would be trivially satisfied by the pure functions while
  the actual ambient-read risk moved one layer up into the component tree,
  which is not a real fix. It would also make "which clock is this figure
  in?" invisible at the call site and untestable without a provider wrapper
  in every one of the nine vitest files being migrated.
- Alternative — one `clock={{ worldTime, scale }}` prop instead of two:
  considered, and rejected on cost, not on merit. It is structurally better
  (a span can never be formatted with view A's `worldTime` and view B's
  scale), but it renames an existing prop across four components and their
  suites inside a change already at the 40-task cap. Recorded here as the
  shape a later link (2a, which builds the strip's clock cell) should adopt.

**The served scale is a property of the simulation clock, not of a fleet.**
`backend/common/worldtime.go` runs one `WorldClock()` for the world, and
every read that carries a scale carries the same one. That is what makes
`GalaxyView`'s `myFleets?.[0]?.scale` (RULING 7) sound rather than a
first-row accident, and why no roster row needs a per-row scale.

### Decision: `servedScale` for figures is un-defaulted; the clock projection's `?? 1` is left alone
`SystemSpaceView.tsx:405` reads

```ts
const servedScale = interior.data?.scale ?? acting?.scale ?? allFleets[0]?.scale ?? 1
```

and feeds it to `useWorldTime`. That trailing `?? 1` is exactly the
assumption RULING 8 forbids at the call site — but it is also load-bearing
for a *different* requirement (`system-space-view`'s *Own-Fleet Position,
Burn Curve, and Arrival Ghost Render Continuously*, whose clock clause this
change takes no delta against). So:

- The view derives **one** value, `servedScale: number | undefined` — the
  same fallback chain **without** the `?? 1` — and passes that to the six
  figure-rendering children.
- `useWorldTime` keeps receiving `servedScale ?? 1`, unchanged, at the single
  line where the projection is anchored. The `space-world-clock` element's
  `data-scale` also keeps its current value, so no existing clock assertion
  moves.
- Every figure call site therefore sees `number | undefined` and renders the
  absent form when it is `undefined` (RULING 8), while the projection
  behaves exactly as it does today. This is not one conditional at one
  mounting view; it recurs at every one of the six consuming components
  (tasks 3.3, 5.8, 7.4, 8.2 thread the un-defaulted value from
  `SystemSpaceView` to each), since RULING 8's rule is capability-level, not
  a single surface's.
- **The duration and rate functions differ from the stamp function in how
  they take that `undefined`.** R1 and R9 both make the scale a *required*
  argument with no overload that omits it (a type-level claim,
  `// @ts-expect-error`-pinned) — so a call site holding
  `servedScale === undefined` for a duration or a rate branches *before*
  calling the formatter at all, rendering `<Figure>` with the absent text
  directly rather than passing `undefined` in. An absolute stamp's `T+`
  portion needs no scale (RULING 1 never divides it), so the stamp function
  is the one place in the module where the scale argument is legitimately
  `number | undefined`: it always renders the `T+ Dd HH:MM` portion, and
  renders `×—` for the suffix in place of `×N` when its scale argument is
  `undefined` (RULING 19) — never `×1`, and never omitting the suffix
  entirely, which would leave a reader unable to tell "scale 1" from "not
  served yet" (the exact ambiguity RULING 16 already rejected once).

The clock projection's own `?? 1` is a **second instance** of the galaxy
clock's recorded defect, living in the system view; it is not fixed here for
the same reason RULING 7 does not fix the galaxy one — no delta covers it and
no design input asks for it. It should be appended to
`docs/plans/continous_space/handoffs/defect-galaxy-clock-assumes-scale-1.md`
rather than filed twice.

Without this split, an implementer has exactly two options, and both are
wrong: pass the `?? 1`-defaulted value (silently defeating RULING 8) or
remove the default outright (changing the clock projection's behaviour with
no requirement behind it).

### Decision: The rate's world→wall conversion lives inside `lib/format/`, as a presentation step over the served value
`roster.miningRate` (tons/world-ms) and
`roster.stationKeepRateTonsPerSecond` (tons/world-second) are two different
served world-time denominators (RULING 3). The rate-formatting function takes
the raw served rate, its served denominator (`world-ms` or `world-second`),
and the scale, converts to a wall-clock-per-second rate, then selects the
display unit (RULING 4). This conversion is a **presentation** transform of a
value the server already computed and served in full; it computes no new
rate, only which time unit an existing rate is expressed in.
`docked-fleet-actions`'s *Station-Keeping Hold and Release Controls* delta
states this explicitly, because that requirement's own "taken only from that
served owner-only rate field" anti-mirror clause would otherwise read as
forbidding exactly this conversion.

**The conversion is a multiplication by the scale, not a division** — the
direction matters and the spec's fixture rows must pin it. One wall-second
carries `1000 × scale` world-milliseconds, so:

```
tons per wall-second = tonsPerWorldMs × 1000 × scale
tons per wall-second = tonsPerWorldSecond × scale
```

A `×60` world mines sixty times as much per second of the player's life,
which is the same direction RULING 1 sends durations (a 252,000 world-ms
burn is a four-second wait). Every scenario R9 states today is at scale 1, so
the fixture table as specced cannot distinguish `× scale` from `÷ scale` —
the panel report carries the paste-ready scale-≠-1 rate scenario the spec
needs. That row is also the only one that exercises the `t/s` rung of the
ladder, which no current scenario reaches.

**The unit ladder is a walk, not a maximum.** Read literally, "the largest
wall-clock time unit in which the converted magnitude is at least 1" selects
`t/h` for every rate above 1 t/h — 2 t/s is 7,200 t/h, and `t/h` is the
largest unit whose magnitude clears 1. The rule RULING 4 actually states, and
the one that makes both worked examples come out right, is: **walk second →
minute → hour and stop at the first unit whose magnitude reaches 1; if none
does, render `t/h`.** Implement the walk. The panel report carries the
paste-ready rewording for R9's requirement text.

### Decision: R12/R13 are enforced by one whole-tree static-analysis vitest suite, not a `/check` changed-file validator
`frontend/lib/format/guards.test.ts` — a single static-analysis suite over
the repository's own source, on the shape of
`frontend/lib/anti-mirror-guard.test.ts` — asserts all of:

1. no file under `frontend/components/space/**` or
   `frontend/components/fleet/**` calls `.toFixed(`, except an explicit
   `KNOWN_EXCEPTIONS` list;
2. no component defines a local `countdown` / `formatEta` (R12);
3. `frontend/lib/eta.ts` does not exist and nothing imports it (R12);
4. `frontend/lib/format/**` imports neither `@/lib/market` nor `@/lib/space`
   — nor `react` (R13, and what keeps the module fixture-testable);
5. `frontend/lib/format/**` names no ambient source: no `Date`,
   `performance`, `Math.random`, `Intl`, or `toLocaleString` (R13's
   no-ambient-state and no-locale-detection scenarios, made observable
   rather than aspirational).

`KNOWN_EXCEPTIONS` holds exactly two entries, each with the ruling that
permits it: `components/space/SpaceStage.tsx`'s bearing/speed sites
(RULING 10) and `components/space/webgl/SpaceWorld.tsx:195`, whose
`toFixed(4)` builds a memo key and is not a player-facing figure at all. The
suite asserts each exception **still exists** (the anti-vacuity trick
`anti-mirror-guard.test.ts` already uses): when RULING 10's follow-up
brownfield pass lands, the list fails loudly instead of rotting.

**The static list above is necessary but not sufficient, and does not by
itself close the `<Figure text>` bypass.** A grep for `toFixed`, a local
`countdown`, or a template-literal interpolation catches three named
mechanisms; it does not catch `<Figure raw={x} unit="tons"
text={String(x)} />`, which uses none of them and still puts an unrounded
wire number on screen (RULING 17, then found again by security and by
adversary round 1 — BLOCKER 4 — and, for a duration specifically, by
adversary round 2's BLOCKER 1, MAJOR 1, and MAJOR 2). The structural fix is
a shared runtime assertion, `assertFiguresMatchModule(container)`, invoked
from every migrated component's own test file after render (section 9): it
queries every element carrying `data-raw` and `data-unit` inside
`container`. It branches on **which quantity the element's `data-unit`
names, not on whether the mount happened to serve a scale**: if that
quantity names a duration or a rate *and* the test rendered with no served
scale, it asserts the `textContent` is exactly `figure-formatting`'s absent
form for that quantity, without calling the module — the absent form is a
module output, not the absence of a check, so no element carrying the
`data-raw`/`data-unit` pair is skipped by this helper. Every other
element — including a `world-ms-instant`, whose stamp function takes
`number | undefined` and renders its `T+` portion and `×—` suffix with no
scale at all — is checked by calling the shared module's function for that
`data-unit` (a duration's token, `world-ms-span-in`/`-left`/`-ago`/`-bare`,
names which R3 direction form to call, so `(raw, scale, token)` is a total
function of the element's own attributes) with that `data-raw` and the
scale-or-`undefined` the test rendered with. It then asserts two things
against the element's `textContent`: the module's output appears as a
**complete numeric token** — a maximal run of digits together with any
decimal point, thousands separator, or magnitude suffix bound to it, not
immediately preceded or followed by a digit, decimal point, or separator
that would make it a fragment of a longer number — and the text contains no
complete numeric token equal to a full-precision rendering of the
element's own `data-raw`, other than the token just matched. Anchoring on
complete tokens rather than "no other numeric run" is what admits an
element whose text legitimately carries surrounding prose with its own
digits (a select's `option`'s host id, a screen-reader-only label) while
still rejecting `text={String(raw)}` for every quantity, including a range,
whose formatted output can otherwise be a decimal prefix of its raw string
(`833` inside `833.25`) — a prefix is a fragment, not a complete token, so
clause one rejects it outright. This is what makes R12's new "a rendered
figure's text is the module's own output for its raw value" scenario
observable: it does not matter what produced the string — `toFixed`, a
local formatter, or a hand-typed `text` prop — the assertion fails
identically in all three cases, closing the hole by construction rather
than by naming the mechanism that exploited it this time. It lives beside
`guards.test.ts` as a shared test helper, not inside it, because it needs
to render — the whole-tree static suite above does not.

Why the static half of this is a whole-tree vitest suite and not a
`/check` changed-file validator, which the analysis recommended:

- **A changed-file validator cannot satisfy R12's own scenario.** The
  scenario is "*WHEN the space and fleet component trees are inspected*" — a
  whole-tree property. `check.py`'s validators run against the files a commit
  touches, so the check the change ships would have a strictly narrower scope
  than the requirement it exists to enforce, and a violation in an untouched
  file is invisible forever.
- **The naive validator fails on this change's own files.** A grep-based
  "no changed `.tsx` under `components/{space,fleet}/` calls `.toFixed(`"
  rejects `SpaceStage.tsx` — which task 8.1 edits and which RULING 10
  *requires* to keep five `toFixed` calls — and `webgl/SpaceWorld.tsx`. A
  bash validator has nowhere natural to hold a reviewed, line-anchored
  exception list; a test file does, in the same language as the code it
  guards.
- **The per-commit argument is not a differentiator.** `check.sh --frontend`
  and `/check` both run the whole vitest suite (`.claude/scripts/check.sh:98`),
  and no changed-file validator is wired as an edit-time hook in
  `.claude/settings.json` — they run only through `check.py`. Both mechanisms
  fire at exactly the same moments.
- **Cost.** One test file, versus a bash script + a `run_*` wrapper and
  registration in `check.py` + its own test. Under a change already at the
  40-task cap, the cheaper mechanism that matches the requirement wins.
- Alternative — an ESLint rule: rejected. Higher setup cost, no custom-rule
  precedent in this repo, and no place for a justified exception list that a
  reviewer reads.

**The type-level scenario gets a real test too.** R1's *A missing scale does
not default to 1* is a compile-time claim, so it is pinned by a
`// @ts-expect-error` line in the module's own suite: the file compiles green
only if the scale-less call is genuinely an error, and `tsc --noEmit` is in
the per-commit gate. Without this the scenario is unobservable and the SDET
has nothing to write.

### Decision: Thousands grouping is hand-rolled; `Intl`/`toLocaleString` are forbidden
R7 (`3,721 m/s`) and R8 (`₡ 1,000`) both need group separators, and the
obvious reach is `Number.prototype.toLocaleString()`. It is forbidden here:
its output depends on the ambient default locale and the ICU build (`1 000`
with a narrow no-break space under `fr`, `1.000` under `de`), so the same
input would produce different strings in a French-locale browser, in CI, and
in a developer's Node — defeating R13's purity scenario and making the
fixture table environment-dependent. Grouping is a three-line regex over the
integer part. This is the concrete content of the "no locale detection"
clause, stated so it is not rediscovered as a flaky test.

### Decision: No anti-mirror map entry; the prohibition is `figure-formatting` R13 plus an import guard
Recorded per RULING 6 so a later reviewer does not go looking for a
`fixtures/format/mirror-map.json` that deliberately does not exist.
`.claude/scripts/check-mirror-map.sh` anchors every registered pair on a
**Go-sole-authority Go package** matched against a same-named TypeScript
directory; there is no `backend/format` and, by this capability's own
purpose, never will be — `figure-formatting` is presentation with no wire
rule to mirror. Enrolling it in that script would enumerate an empty Go-side
set and produce a check that can never fail: false assurance in exactly the
directory (`docs/plans/continous_space/handoffs/README.md`'s catalogue of
shipped-but-never-called derivations) this repo has learned to distrust.
Instead, the prohibition is stated as a real requirement
(`figure-formatting`'s *The Formatter Is Pure Presentation and Derives No
Rule-Bearing Value*) with a concrete, testable claim — the module imports
neither `lib/market` nor `lib/space` — enforced by an import-guard test
inside `frontend/lib/format/`'s own suite (a plain static-analysis
assertion over the module's import graph, not a shell-out to the mirror
script).

### Decision: `data-raw` serialization — what survives React, Playwright and the existing helpers
RULING 5 pins `data-raw` as `String(value)`, never re-rounded. Three
mechanical consequences the implementer must not have to rediscover:

- **React already does exactly this.** `data-*` attributes are set with
  `setAttribute(name, '' + value)`, so `<Figure raw={47.23519999999999}>`
  emits `data-raw="47.23519999999999"` with no explicit `String()` at the
  call site. `undefined` and `null` cause React to **omit** the attribute,
  which is R11's absent case for free — but `NaN` and `Infinity` render as
  the literal strings `"NaN"` and `"Infinity"`, which R11 forbids. `<Figure>`
  therefore normalizes: a non-finite `raw` is coerced to `undefined` before
  it reaches the DOM. This is the one line of logic the component owns, and
  it is why the component exists rather than a hand-written attribute.
- **"Full double precision" means shortest-round-trip, and that is what
  tests need.** JavaScript's number→string conversion emits the shortest
  decimal that parses back to the identical double, so
  `Number(el.getAttribute('data-raw'))` recovers the served value exactly —
  including for values whose shortest form is exponential (`1e-7`, `1e+21`).
  Tests must therefore compare `Number(attr)` to the wire value, never the
  attribute string to a hand-typed decimal. The e2e helpers rewritten in task
  10.1 do the parse in one place.
- **`digits()` and `holdKindTons()` both stop parsing text.**
  `e2e/helpers/space-view.ts:377` takes the first numeric run, which
  `T+ 2d 04:13` would answer with `2` and `47.2 t` would answer with the
  *rounded* tonnage; `:393`'s `/([\d.]+)\s*t\b/` survives the thin space
  (JS `\s` covers U+2009) but starts returning one-decimal values, which is
  precisely the precision its own doc comment exists to preserve. Both become
  `Number(await locator.getAttribute('data-raw'))`, and both must target the
  per-figure element, not the composite wrapper (see the testid rule above) —
  `hold-capacity` is two figures and `hold-{kind}` is a label plus a figure,
  so neither wrapper carries the attribute after the split.

**A due figure is not an absent figure, and keeps its raw value.** R3 renders
a span of ≤ 0 as the due form, and R11 omits `data-raw` on an *absent*
figure; conflating the two would silently break task 10.2's replacement
assertion for `scan-lane-transit-fizzle.spec.ts` — `data-raw <= 0` is only
assertable if a due figure still carries its span. The same holds for a
figure rendered absent for want of a served scale (RULING 8): the *value* is
known, only the scale is not, so the attribute stays. The invariant to
implement, and the one the panel report asks the writer to state: **`data-raw`
is present whenever the raw value is a finite number, whatever the rendered
text turned out to be.**

### Decision: One absent form, `—`, with the credit-balance override preserved
Per RULING 13. `figure-formatting`'s `—` is the universal absent form for
`undefined`/`null`/`NaN`/non-finite, used by every quantity this capability
defines. `docked-fleet-actions`'s *Credit Balance Readout* keeps its own
mandated explicit-unavailable copy (not `—`) as a capability-level override,
stated in `figure-formatting`'s own last absent-value scenario so the
override is visible from the capability that defines the general rule, not
only from the capability that needs the exception. `fleet-roster`'s
`?? 0` fallback for fuel/range becomes `—` — a named behaviour change (a
fleet with no served roster reads absent, not a lying `0t fuel`), not a
side effect smuggled inside a copy change.

### Decision: The `13.9k` vs `1,180 km` contradiction is resolved as no named unit
`docs/plans/system-hud.md`'s "Formatting" table gives two range examples,
`13.9k` and `1,180 km`; `docs/plans/system-hud/chain.md`'s own rules table —
the sequencing authority for this link, and written after the scoping doc —
gives only `13.9k`. No wire field, Go type, or TS type anywhere names a
distance unit (`roster.estimatedRange` is a bare float); rendering `km`
would have the presentation layer assert a physical unit the simulation
never decided, which is exactly what `figure-formatting`'s purity
requirement forbids. Per RULING 14, `figure-formatting`'s range rule
therefore renders a magnitude suffix (`k`, `M`) and no unit name; `km` is
not implemented. This is a resolved conflict between the two design
documents, recorded here rather than read past.

## Risks / Trade-offs

- **The mine and scan countdowns visibly change shape** (`M:SS` → `Nm Ss`,
  RULING 15) — an intended, visible copy change on two live surfaces, named
  in the proposal so QA and the adversary do not read it as a regression.
- **Two credit vocabularies coexist until link 4** (`₡ 1,000` on this
  change's surfaces, `1000 cr/t` still on `MarketBoardPanel`) — accepted per
  RULING 11; the chain assigns `market-board-panel` to link 4, and this
  link's own task budget has no margin to absorb it (see tasks.md's cap).
- **The `FleetRoster` `GalaxyView` mount site changes** (`GalaxyView.tsx:472`
  gains a `scale` prop) even though the chain forbids "touching the galaxy
  view" — accepted per RULING 7 as a shared component's mount-site prop,
  not the galaxy view's own chrome; `GalaxyView.test.tsx:424` is updated in
  the same change.
- **`scan-lane-transit-fizzle.spec.ts:231–233`** currently asserts the
  literal string `'now'` (from the module being deleted) behind a
  900-second timeout. If this assertion is not migrated to a `data-raw <= 0`
  check in the same change that deletes `lib/eta.ts`, the journey hangs to
  timeout instead of failing fast. tasks.md carries this as its own task.
- **The galaxy-mounted roster's countdown is still projected at the wrong
  rate under a scale ≠ 1 world**, and this change does not fix it.
  `GalaxyView.tsx:182` runs `useWorldTime(...)` with no `scale`, so
  `remainingMs` is extrapolated at 1 world-ms per wall-ms; dividing that span
  by the served scale (RULING 1) gives a number that is right at the instant
  of each fetch and drifts between them. RULING 7 files the projection defect
  and forbids fixing it here. The `fleet-roster` delta must not be read as
  claiming that countdown is now correct — it claims only that the span it is
  given is presented in wall-clock units.
- **`SystemSpaceView`'s own clock keeps its `?? 1` default** (see the
  un-defaulted-`servedScale` decision). Figures obey RULING 8; the drawn
  picture keeps today's behaviour. Two scale values exist in that file for
  one render, deliberately and with one line of comment each.
- **The `×N` suffix now appears on every sighting-log row.** R4 renders the
  scale suffix on every absolute stamp, so a twenty-row log reads `×1`
  twenty times. Flagged to the orchestrator rather than authored around (it
  is spec text, not a ruling) — see the panel report.
- **`ScanControl`'s durations live inside `<option>` elements**, which cannot
  hold a nested figure element. The attribute pair goes on the option itself;
  if the spec is not amended to permit that, R11 is unsatisfiable on that
  surface as written.

## Migration Plan

Not a data or schema migration — a code migration executed atomically in
this one change, per the repo's "delete what you replace, no coexistence"
rule:

1. Build `lib/format/` and its fixture suite (new code, no existing callers
   touched yet).
2. Introduce the `<Figure>` element (`components/figure/`) and the
   whole-tree static-analysis guard suite.
3. Re-point every current call site (`SpaceCommandPanel`, `FleetActionsPanel`,
   `FleetRoster`, `ScanControl`, `SightingLog`, `SpaceStage`'s duration
   figures) at the new module, replacing `toFixed`/raw interpolation/local
   `countdown()` calls one component at a time.
4. Delete `frontend/lib/eta.ts` and both local `countdown()` copies once no
   caller remains.
5. Migrate the test assertion sites (9 vitest files, 6 Playwright
   files/helpers) from text assertions to `data-raw`/`data-unit`
   assertions.

No flag, no dual-path, no partial landing — steps 3–5 land together in this
change, consistent with `docs/plans/continous_space/README.md`'s "burn the
boats" rule this chain inherits.

## Open Questions

No *design* question is open: every ambiguity the design analysis raised
(AMB-1 through AMB-15) is either resolved against the design input directly
(AMB-3, AMB-8, AMB-13, AMB-15) or ruled in
`add-figure-formatting-rulings.md`, with a recorded basis and reversal cost
for each. That file is the durable record and is appended to as later
review rounds raise and rule on further questions — see its own contents
for the current full set rather than a count repeated here.

Four items are **flagged to the orchestrator** by the architect review, each
because it needs spec text this document cannot author (spec deltas are the
writer's) or because it touches a ruling's consequence rather than its
substance. All four, with paste-ready delta text, are in
`docs/plans/continous_space/handoffs/add-figure-formatting-panel-architect.md`:

1. R9's unit-selection sentence says "largest", which reads as "always
   `t/h`"; it needs the second → minute → hour walk, plus a scale-≠-1
   scenario that pins the conversion's direction.
2. R11 needs a scenario permitting the attribute pair on a container that
   holds exactly one figure, for the `<option>` case.
3. R11 needs the "`data-raw` is present whenever the raw value is finite"
   invariant, so a due figure and a scale-starved figure keep their raw.
4. `fleet-roster` needs a scenario for RULING 8's absent-scale case, since
   the galaxy mount is the one mount that can lack a scale and nothing else
   in the change would catch a `?? 1` reintroduced there.

**Disposition of all four, from the panel revision pass.** All four are now
authored into the spec deltas, which is the correct disposition — none
needed a decision from Travis. (1) is R9's requirement paragraph and its
"The unit flips at its stated threshold" and new scale-≠-1 scenarios in
`figure-formatting/spec.md`. (2) is R11's new "An element that cannot hold a
nested figure carries the pair itself" scenario. (3) is R11's added
"`data-raw` SHALL be present whenever the raw value is a finite number..."
sentence plus its "A figure carries its raw value whenever that value is a
number, whatever the rendered text" scenario. (4) is the new sentence and
"A countdown renders absent until a scale is served" scenario appended to
`fleet-roster`'s *One Row Per Owned Fleet, Derived From Kinematic State*,
plus tasks.md 6.4.

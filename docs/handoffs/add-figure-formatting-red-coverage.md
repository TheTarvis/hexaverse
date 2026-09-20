# add-figure-formatting — red-phase coverage table

SDET red handoff. Written before any production code exists (`frontend/lib/format/`,
`frontend/components/figure/Figure.tsx` do not exist yet — confirmed by running
the suite below against the unmodified tree). Every `#### Scenario:` in the five
spec deltas is listed. Status legend:

- **compile-red** — the test file fails to resolve an import of not-yet-built
  production code (verified in a scratch copy with the symbols stubbed in — see
  "Tautology verification" below).
- **assertion-red** — the test runs against today's code and fails on a real
  assertion (verified by running the suite; failure text quoted where useful).
- **already-green** — the scenario is reproduced unchanged by this delta and is
  already covered by an existing, unmigrated test; this change's copy-clause
  does not touch it.
- **Playwright, deferred** — provable only end-to-end, or is Phase F's own
  infrastructure task; covered by the journey after every task is checked.
- **reasoned-not-automated** — explained inline; mostly pre-existing gaps this
  change did not open and does not touch.

Every fixture-table row in `frontend/lib/format/cases.json` carries a stable
`id`; the table below cites it in brackets so a group is never one pass/fail
signal (adversary round 3's concentration-risk finding — this is the row-by-row
expansion the orchestrator's brief required).

## Commands that show each red group

Per `docs/testing-tiers.md`, tier 1 (`bash .claude/scripts/check.sh --frontend`
or `cd frontend && npx vitest run <files>`) is what runs this suite; no tier 2/3/4
command applies to a frontend-only change. Representative runs used while
compiling this table:

```bash
cd frontend && npx vitest run lib/format/figures.test.ts
cd frontend && npx vitest run lib/format/assert-figures.test.ts
cd frontend && npx vitest run lib/format/guards.test.ts
cd frontend && npx vitest run components/figure/Figure.test.tsx
cd frontend && npx vitest run components/space/SpaceCommandPanel.test.tsx
cd frontend && npx vitest run components/space/FleetActionsPanel.test.tsx
cd frontend && npx vitest run components/space/ScanControl.test.tsx
cd frontend && npx vitest run components/space/SightingLog.test.tsx
cd frontend && npx vitest run components/fleet/FleetRoster.test.tsx
cd frontend && npx vitest run components/space/SpaceStage.fleet-mark.test.tsx
cd frontend && npx vitest run components/space/SpaceStage.interaction.test.tsx
cd frontend && npx vitest run components/space/SpaceStage.sighting-ghost-selection-guard.test.tsx
cd frontend && npx vitest run components/space/SystemSpaceView.test.tsx
cd frontend && npx vitest run components/galaxy/GalaxyView.test.tsx
cd frontend && npx tsc --noEmit -p tsconfig.json   # confirms every scale/worldTime compile-red is real
```

## Tautology verification (scratch copy, symbols stubbed in)

Per the SDET protocol, a symbol that does not exist yet must be verified
`compile-red` in a scratch copy with the missing symbols stubbed in. I wrote a
full reference implementation of `lib/format/figures.ts` and
`components/figure/Figure.tsx` directly from the impl contract's §1.2 tables
(not from the tests), ran the whole new/migrated suite against it, fixed two
real bugs the exercise caught in my OWN test code (a malformed exclusion regex
in `figures.test.ts`'s "No unit is named" scenario, and a TS narrowing gap in
the fixture-loader's `num()` helper), confirmed:

- `figures.test.ts`: **145/145 pass** against the reference implementation.
- `assert-figures.test.ts`: **14/14 pass** (9 contract-mandated planted cases +
  5 SDET-added) against the reference `figures.ts` and the real
  `assert-figures.ts`.
- `Figure.test.tsx`: **23/23 pass** against the reference `Figure.tsx`.
- `guards.test.ts`: 5/8 already pass (vacuously, see its own section below); the
  3 that don't are real, and independent of the stub (pure filesystem
  assertions over the current tree).
- Every migrated component test file (`SpaceCommandPanel`, `FleetActionsPanel`,
  `ScanControl`, `FleetRoster`, `SpaceStage.*`) still shows its **pre-existing,
  unmigrated scenarios green** and only the **new/migrated figure assertions
  red**, confirmed by running each file individually against the current
  (unmigrated) production tree — e.g. `FleetActionsPanel.test.tsx`: 35 passed /
  18 failed, all 18 failures a missing `data-raw`/`data-unit` pair, a raw
  interpolated toast string, or a not-yet-split testid.
- `tsc --noEmit` over the whole frontend after the migration shows **81 errors,
  every one** either `Property 'scale' does not exist on type '...Props'` (the
  seven components not yet accepting the threaded prop) or the two intentional
  `@ts-expect-error` pins compiling clean (confirmed non-vacuous: TypeScript
  itself would report "Unused '@ts-expect-error' directive" if either
  suppressed no real error, and it reported neither).

Both scratch files (`lib/format/figures.ts`, `components/figure/Figure.tsx`)
were deleted after verification; the tree is back to true red. No production
code ships from this handoff.

---

## Capability: `figure-formatting` (ADDED)

### Requirement: A Duration Between Two World Instants Is Presented in Wall-Clock Units at the Served Scale

| Scenario | Test | Level | Status |
|---|---|---|---|
| A world-millisecond span at scale 1 reads as the same wall duration | `figures.test.ts` [duration-scale1-under-hour] | unit | compile-red |
| A time-warped world divides the span by its scale | `figures.test.ts` [duration-scale60-divides] | unit | compile-red |
| A fractional scale multiplies the wait | `figures.test.ts` [duration-fractional-scale-multiplies] | unit | compile-red |
| A missing scale does not default to 1 | `figures.test.ts` "R1 type-level" (`@ts-expect-error`) | unit (type-level) | compile-red |
| A non-positive scale is refused, not divided by | `figures.test.ts` [duration-nonpositive-scale-zero], [duration-nonpositive-scale-negative] | unit | compile-red |

### Requirement: A Duration Reads in Exactly Two Adjacent Units Chosen by Its Magnitude

| Scenario | Test | Level | Status |
|---|---|---|---|
| Under an hour reads minutes and seconds | `figures.test.ts` [duration-scale1-under-hour] | unit | compile-red |
| Under a day reads hours and minutes | `figures.test.ts` [duration-under-day-hours-minutes] | unit | compile-red |
| A day or more reads days and hours | `figures.test.ts` [duration-day-or-more-days-hours] | unit | compile-red |
| Exactly one minute | `figures.test.ts` [duration-exactly-one-minute] | unit | compile-red |
| Exactly one hour | `figures.test.ts` [duration-exactly-one-hour] | unit | compile-red |
| Exactly one day | `figures.test.ts` [duration-exactly-one-day] | unit | compile-red |
| Sub-second durations round to zero | `figures.test.ts` [duration-sub-second-rounds-to-zero] | unit | compile-red |
| A duration that crosses a unit boundary only after rounding | `figures.test.ts` [duration-crosses-hour-boundary-after-rounding] | unit | compile-red |
| A duration that rounds up across the day boundary reselects its unit pair | `figures.test.ts` [duration-crosses-day-boundary-after-rounding] | unit | compile-red |

### Requirement: A Relative Duration Names Its Direction, a Cost Duration Renders Bare, and a Due Duration Names That Explicitly

| Scenario | Test | Level | Status |
|---|---|---|---|
| A future ETA reads "in" | `figures.test.ts` [duration-deadline-future-in] | unit | compile-red |
| A running order's remainder reads "left" | `figures.test.ts` [duration-deadline-remaining-left] | unit | compile-red |
| A past stamp reads "ago" | `figures.test.ts` [duration-deadline-past-ago] | unit | compile-red |
| A cost or estimate duration renders bare, with no direction affix | `figures.test.ts` [duration-scale1-under-hour] (form:"bare") | unit | compile-red |
| Exactly zero is due, not a zero quantity | `figures.test.ts` [duration-due-exactly-zero] | unit | compile-red |
| A negative span never renders a minus sign or a growing countdown | `figures.test.ts` [duration-due-negative-small-in], [duration-due-negative-large-left] | unit | compile-red |
| A negative span in an "ago" context is a positive magnitude | `figures.test.ts` [duration-ago-negative-magnitude] | unit | compile-red |

### Requirement: An Absolute World Instant Reads as `T+` From the Epoch With Its Served Scale

| Scenario | Test | Level | Status |
|---|---|---|---|
| A stamp renders days, hours and minutes with its scale | `figures.test.ts` [instant-scale60-days-hours-minutes] | unit | compile-red |
| The absolute stamp is world time, not wall time | `figures.test.ts` [instant-worldtime-not-walltime-scale1] (same T+ at scale 1 and 60) | unit | compile-red |
| Hours and minutes are zero-padded | `figures.test.ts` [instant-zero-padded] | unit | compile-red |
| Zero | `figures.test.ts` [instant-zero] | unit | compile-red |
| A scale of exactly 1 still renders its suffix | `figures.test.ts` [instant-zero], [instant-zero-padded] (both show `×1`) | unit | compile-red |
| Sub-minute stamps are not distinguished | `figures.test.ts` [instant-subminute-a], [instant-subminute-b] | unit | compile-red |
| The scale suffix carries an accessible explanation | `figures.test.ts` instantScaleLabel group [label-positive-scale-60]; `Figure.test.tsx` "title is passed through"; `SightingLog.test.tsx` "the row's asOf is a formatted stamp" (title assertion) | unit + component | compile-red |

### Requirement: A Tonnage Reads With One Decimal Below 100 and None At or Above, With a Thin Space Before Its Unit

| Scenario | Test | Level | Status |
|---|---|---|---|
| Below 100 keeps one decimal | `figures.test.ts` [tons-below-100-keeps-decimal] | unit | compile-red |
| At or above 100 drops the decimal | `figures.test.ts` [tons-at-or-above-100-drops-decimal] | unit | compile-red |
| Exactly 100 | `figures.test.ts` [tons-exactly-100] | unit | compile-red |
| 99.95 rounds up across the threshold and takes the no-decimal form | `figures.test.ts` [tons-9995-rounds-up-threshold] | unit | compile-red |
| 99.94 stays below the threshold | `figures.test.ts` [tons-9994-stays-below] | unit | compile-red |
| Zero | `figures.test.ts` [tons-zero] | unit | compile-red |
| A whole number below 100 still shows its decimal | `figures.test.ts` [tons-whole-number-below-100-shows-decimal] | unit | compile-red |
| The unit is separated by a thin space | `figures.test.ts` "the separator before t is U+2009" (codepoint assertion) | unit | compile-red |
| A negative tonnage | `figures.test.ts` [tons-negative] | unit | compile-red |

### Requirement: A Range or Distance Reads to Three Significant Figures With a Magnitude Suffix and No Unit Name

| Scenario | Test | Level | Status |
|---|---|---|---|
| Thousands take the suffix | `figures.test.ts` [range-thousands-suffix] | unit | compile-red |
| Below the first magnitude reads bare | `figures.test.ts` [range-below-first-magnitude] | unit | compile-red |
| Significant figures, not decimal places | `figures.test.ts` [range-sigfigs-not-decimals-a], [range-sigfigs-not-decimals-b] | unit | compile-red |
| Three-significant-figure carry crosses a magnitude | `figures.test.ts` [range-carry-crosses-magnitude] | unit | compile-red |
| Exactly at a magnitude | `figures.test.ts` [range-exactly-at-magnitude] | unit | compile-red |
| Millions | `figures.test.ts` [range-millions] | unit | compile-red |
| Zero | `figures.test.ts` [range-zero] | unit | compile-red |
| No unit is named | `figures.test.ts` "Scenario: No unit is named" (regex over 4 rendered values) | unit | compile-red |

### Requirement: A Delta-V Reads as Integer Metres Per Second

| Scenario | Test | Level | Status |
|---|---|---|---|
| A fractional delta-v rounds to an integer | `figures.test.ts` [deltav-fractional-rounds] | unit | compile-red |
| A half rounds to nearest, away from zero | `figures.test.ts` [deltav-half-rounds-away-from-zero] | unit | compile-red |
| A large delta-v takes a thousands separator | `figures.test.ts` [deltav-large-thousands-sep] | unit | compile-red |
| Zero | `figures.test.ts` [deltav-zero] | unit | compile-red |

### Requirement: A Credit Figure Reads With the Currency Glyph and Thousands Separators

| Scenario | Test | Level | Status |
|---|---|---|---|
| A four-figure balance | `figures.test.ts` [credits-four-figure] | unit | compile-red |
| Below a thousand | `figures.test.ts` [credits-below-thousand] | unit | compile-red |
| Zero is a figure, never the absent form | `figures.test.ts` [credits-zero-is-figure] | unit | compile-red |
| A negative balance | `figures.test.ts` [credits-negative] | unit | compile-red |
| Credits are integers and never gain a decimal | `figures.test.ts` [credits-integer-grouping] | unit | compile-red |

### Requirement: A Rate Reads Per the Wall-Clock Time Unit the Player Waits In

| Scenario | Test | Level | Status |
|---|---|---|---|
| A rate legible per minute reads per minute | `figures.test.ts` [rate-per-minute-legible] | unit | compile-red |
| A rate too small per minute falls to per hour | `figures.test.ts` [rate-too-small-falls-to-hour] | unit | compile-red |
| The unit flips at its stated threshold | `figures.test.ts` [rate-threshold-below-1-per-second], [rate-threshold-at-1-per-second] | unit | compile-red |
| A world-per-millisecond rate is converted | `figures.test.ts` [rate-world-ms-denominator-converted] | unit | compile-red |
| A world-per-second rate is converted | `figures.test.ts` [rate-world-s-denominator-converted] | unit | compile-red |
| A time-warped world converts the denominator in the same direction as a duration | `figures.test.ts` [rate-scale60-direction-pinned] | unit | compile-red |
| A zero rate | `figures.test.ts` [rate-zero] | unit | compile-red |
| A rate too small to show at one decimal is not shown as a true zero | `figures.test.ts` [rate-below-display-floor] | unit | compile-red |
| A negative rate reads as the absent form | `figures.test.ts` [rate-negative-is-absent] | unit | compile-red |

### Requirement: An Absent, Non-Finite, or Unsupplied Figure Reads as Explicitly Absent, Never as a Number

| Scenario | Test | Level | Status |
|---|---|---|---|
| Undefined | `figures.test.ts` absent-value groups, one row per quantity: [absent-duration-undefined], [absent-instant-undefined], [absent-tons-undefined], [absent-range-undefined], [absent-deltav-undefined], [absent-credits-undefined], [absent-rate-undefined] | unit | compile-red |
| NaN | same groups, `-nan` rows | unit | compile-red |
| Infinity | same groups, `-infinity`/`-neg-infinity` rows | unit | compile-red |
| Zero is not absent | `figures.test.ts` "Zero is not absent, across every quantity that has a zero figure" + the `-zero` rows in each quantity's own group | unit | compile-red |
| The absent form does not override a capability's own unavailable copy | `FleetActionsPanel.test.tsx` "Scenario: An unavailable balance reads as unavailable, not as a figure" | component | assertion-red (new test; current code already implements the override correctly for `credits===null`, but the test also asserts no `balance-figure` element and no `data-raw` on the wrapper, which needs the `balance-value`/`balance-figure` split — see note below) |

Note on the last row: the credit override's *copy* is already correct in
today's code (`credits === null ? 'Unavailable' : credits`), so once the
`balance-value`/`balance-figure` split lands this scenario goes green almost
for free; it is listed `assertion-red` because the test asserts the split
shape (`queryByTestId('balance-figure')` is null), which does not exist yet.

### Requirement: A Figure Whose Clock Scale Has Not Been Served Reads as Absent

| Scenario | Test | Level | Status |
|---|---|---|---|
| A duration with no served scale renders absent, not at scale 1 | `figures.test.ts` [duration-scale-absent-in], [duration-scale-absent-bare]; component-level in every migrated panel's "on a scale-less mount" test (see per-capability tables below) | unit + component | compile-red |
| A rate with no served scale renders absent, not at scale 1 | `figures.test.ts` [rate-scale-absent]; `FleetActionsPanel.test.tsx` "the drain readout on a scale-less mount renders absent" | unit + component | compile-red |
| An absolute stamp with no served scale still renders its world-time portion, with an absent suffix | `figures.test.ts` [instant-scale-absent-suffix]; `SightingLog.test.tsx` "on a scale-less mount the T+ portion still renders"; `SpaceStage.sighting-ghost-selection-guard.test.tsx` "on a scale-less mount the ghost mark's asOf still renders" | unit + component | compile-red |

### Requirement: Every Formatted Figure Carries Its Raw Served Value on a Data Attribute

| Scenario | Test | Level | Status |
|---|---|---|---|
| A formatted tonnage carries its raw value | `Figure.test.tsx` "a formatted tonnage carries its raw value at full precision" | component | compile-red |
| A composite line carries one raw value per figure | `SpaceCommandPanel.test.tsx` "A commit differing from the preview surfaces both figures" (4 elements); `FleetActionsPanel.test.tsx` hold-capacity split | component | assertion-red |
| The raw value is the wire figure, not the display figure | `Figure.test.tsx` "the raw value is the wire figure, not the display figure" | component | compile-red |
| A figure with no numeric value carries no raw attribute | `Figure.test.tsx` "undefined"/"null"/"NaN is normalized away"/"Infinity is normalized away"/"-Infinity" (5 cases) | component | compile-red |
| A figure carries its raw value whenever that value is a number, whatever the rendered text | `Figure.test.tsx` "a due figure ... still carries data-raw"; "... even when the scale is unserved" | component | compile-red |
| An element that cannot hold a nested figure carries the pair itself | `Figure.test.tsx` `figureAttrs` group (3 tests); `ScanControl.test.tsx` "Served targets are listed with their kind and duration" (option pair) | component | compile-red |
| A duration's raw value is its unscaled world-millisecond span, tagged by its direction form | `figures.test.ts` `formatByUnit` "each duration token dispatches to its own R3 form"; every migrated duration-figure component test (`fleet-row-eta`, `mine-countdown`, `scan-countdown`, `preview-arrival`, `commit-drift-*-arrival`, `fleet-facts-arrival`) | unit + component | compile-red |
| A figure rendered into a toast or an aria-label carries no attribute | `SpaceCommandPanel.test.tsx` "A successful burn commit reports success" (toast, no attribute asserted on it — the toast IS a string) | component | assertion-red |

### Requirement: A Player-Facing Figure Is Produced Only By the Shared Formatter

| Scenario | Test | Level | Status |
|---|---|---|---|
| No component-local decimal rounding | `guards.test.ts` "No component-local decimal rounding" | unit (static) | **assertion-red** — run output: `unreviewed .toFixed( site(s): frontend/components/space/SpaceCommandPanel.tsx` |
| No component-local duration formatter | `guards.test.ts` "No component-local duration formatter" | unit (static) | **assertion-red** — run output names `FleetActionsPanel.tsx`, `ScanControl.tsx` |
| The retired module is gone | `guards.test.ts` "The retired module is gone" | unit (static) | **assertion-red** — run output: `frontend/lib/eta.ts must be deleted: expected true to be false` |
| A raw wire number does not reach copy | `SpaceCommandPanel.test.tsx` "A successful burn commit reports success" (asserts the toast never contains the raw `arriveMs` integer and does contain the formatted duration) | component | assertion-red |
| A pre-formatted string handed to the shared element is still non-compliant | `assert-figures.test.ts` cases 1–3 (range prefix, tonnage fragment, `String(remaining)`); `guards.test.ts` "no template-literal interpolation into a `<Figure>`'s text prop" (static, defense-in-depth) | unit | compile-red |
| A rendered figure's text is the module's own output for its raw value | `assert-figures.test.ts` — the whole suite (14 tests); invoked from every migrated component test file's `assertFiguresMatchModule(container, { scale })` call | unit + component (invoked everywhere) | compile-red |
| The rounding exception list holds only quantities this capability does not define | `guards.test.ts` "The rounding exception list holds only quantities this capability does not define" | unit (static) | already-green (the two current exceptions — `SpaceStage.tsx` bearing/speed, `webgl/SpaceWorld.tsx`'s memo key — already satisfy this) |

### Requirement: The Formatter Is Pure Presentation and Derives No Rule-Bearing Value

| Scenario | Test | Level | Status |
|---|---|---|---|
| No rule-bearing computation | `guards.test.ts` "The module imports no wire-rule module" (import-graph half); reasoned inspection — `figures.ts`'s contract signatures take only `(value, scale, ...)`, no market/space types | unit (static) | compile-red (the assertion runs, vacuously true today since `lib/format/` does not exist — see note below) |
| The module names no ambient source | `guards.test.ts` "The module names no ambient source" | unit (static) | compile-red (vacuous today, same reason) |
| The module imports no wire-rule module | `guards.test.ts` "The module imports no wire-rule module" | unit (static) | compile-red (vacuous today, same reason) |
| The formatter is pinned by a fixture table | `frontend/lib/format/cases.json` (122 rows across 8 groups + the absent-value subgroups) + `figures.test.ts` (163 tests) | unit | compile-red |

**Vacuity note on the three `guards.test.ts` "already passes" rows above.**
`walk(FORMAT_DIR, ...)` returns `[]` because `frontend/lib/format/` does not
exist yet as a *production* directory (only test files live there today), so
the assertion "no violations found" is currently true by having nothing to
check, not by a real guarantee. This becomes a real, load-bearing check the
moment `figures.ts`/`index.ts` exist — recorded here, per the SDET protocol on
distinguishing "already-green" from "vacuously green," so this is not silently
read as proof of anything today. `cases.json` is JSON, not `.ts`, so it is
correctly excluded from this walk and cannot itself violate the import guard.

---

## Capability: `system-space-view` (MODIFIED)

### Requirement: Burn Preview Reflects the Server-Solved Order, Without Committing

| Scenario | Test | Level | Status |
|---|---|---|---|
| Selecting a target shows a preview curve and its figures | `SpaceCommandPanel.test.tsx` "Scenario: Selecting a target shows a preview curve and its figures" (migrated: `preview-arrival`/`-deltav`/`-fuel` now asserted via `data-raw`/`data-unit`, plus `assertFiguresMatchModule`) | component | assertion-red |
| A burning fleet's re-target is previewed | pre-existing coverage in `use-burn-preview` hook tests (unaffected by this delta — no figure clause) | hook | already-green |
| Clearing the selection clears the preview | pre-existing, unaffected | component | already-green |
| The preview refreshes on exactly one named interval while shown | pre-existing, unaffected | hook | already-green |
| The refresh interval is defined in exactly one place | pre-existing, unaffected | unit | already-green |
| An unaffordable preview is shown as such | `SpaceCommandPanel.test.tsx` "Scenario: An unaffordable preview is shown as such" (unaffected by the figure clause — the `data-affordable` attribute is untouched) | component | already-green |
| No preview is requested while a mine holds the movement channel | pre-existing, unaffected | component | already-green |

### Requirement: A Burn Commit Is Quote-Locked to the Preview the Player Agreed To

| Scenario | Test | Level | Status |
|---|---|---|---|
| A commit with a current preview carries a cap | `SpaceCommandPanel.test.tsx` "Scenario: A commit with a current preview carries a cap" (unaffected — the request body, not the display) | component | already-green |
| The ceiling the player agrees to is the one displayed | `SpaceCommandPanel.test.tsx` "Scenario: The ceiling the player agrees to is the one displayed" (migrated to `data-raw`/`data-unit` on `preview-fuel-ceiling`) | component | assertion-red |
| A cap rejection re-quotes in flow instead of failing the interaction | `SpaceCommandPanel.test.tsx` same-named test (unaffected) | component | already-green |

### Requirement: A Commit's Actual Result Is Never Silently Swapped for the Previewed One

| Scenario | Test | Level | Status |
|---|---|---|---|
| A commit matching the preview shows no drift notice | `SpaceCommandPanel.test.tsx` same-named test (unaffected — absence check only) | component | already-green |
| A commit differing from the preview surfaces both figures | `SpaceCommandPanel.test.tsx` same-named test, migrated to the 4-way split (`commit-drift-actual-deltav`/`-arrival`, `commit-drift-previewed-deltav`/`-arrival`), both arrivals asserted `world-ms-span-in` (RULING 24) | component | assertion-red |
| An uncapped commit still surfaces its actual figures | `SpaceCommandPanel.test.tsx` same-named test, migrated: asserts `commit-drift-actual-deltav`'s `data-raw` and the absence of any previewed-* figure | component | assertion-red |

### Requirement: The Focused-Scan Target List Comes From the Server, Never From a Client Predicate

| Scenario | Test | Level | Status |
|---|---|---|---|
| Served targets are listed with their kind and duration | `ScanControl.test.tsx` same-named test, migrated: each `<option>` asserted for `figureAttrs`' pair and the formatted bare-duration text | component | assertion-red |
| A body absent from the served set is not offered | pre-existing, unaffected | component | already-green |
| An empty target set is stated, not shown as an empty list | pre-existing, unaffected | component | already-green |
| An empty target set explained by transit or a running sweep states that instead | pre-existing, unaffected | component | already-green |
| A failed target read is retriable and offers nothing | pre-existing, unaffected | component | already-green |
| A landed arrival refetches the target list | pre-existing (`SystemSpaceView.test.tsx` "scan-targets-refetch-on-arrival" — file not touched by this change) | component | already-green |
| A failed refetch drops the stale list rather than restating it | pre-existing, unaffected | component | already-green |
| A settled sweep refetches the target list | pre-existing, unaffected | component | already-green |
| An empty set awaiting its triggered refetch is not reported as no host in range | pre-existing, unaffected | component | already-green |
| Changing the acting fleet refetches the list | pre-existing, unaffected | component | already-green |

### Requirement: A Running Sweep's Window and Cancel Come From the Action Inbox

| Scenario | Test | Level | Status |
|---|---|---|---|
| The countdown spans the action's committed window | `ScanControl.test.tsx` "Scenario: The commit control is withheld while a sweep runs", migrated to `data-raw`/`data-unit` on `scan-countdown` | component | assertion-red |
| The window is not taken from the fleet read | pre-existing, unaffected | component | already-green |
| Cancel names the scan action's own id | pre-existing, unaffected | component | already-green |
| A cancelled sweep returns the control to its target list | pre-existing, unaffected | component | already-green |
| The commit control is withheld while a sweep runs | see "countdown spans committed window" row (same test) | component | assertion-red |
| A past-ETA sweep reads as settling, not as a negative countdown | `ScanControl.test.tsx` "Scenario: A past-ETA running sweep is presented as settling", extended to assert NO `data-raw`/`data-unit` pair on the settling span (F4) | component | assertion-red |

### Requirement: A Sighting Ghost Renders at Its Frozen Position, Never a Predicted One

| Scenario | Test | Level | Status |
|---|---|---|---|
| A ghost renders at the record's stored position | pre-existing (`SpaceStage.sighting-ghost-selection-guard.test.tsx`, unaffected by figure clause) | component | already-green |
| A ghost's asOf label reads as a formatted stamp, on the mark and on its facts surface | `SpaceStage.sighting-ghost-selection-guard.test.tsx` "SDET-added: the ghost mark's sr-only asOf label..." (mark half) + "SDET-added: hovering a ghost shows the sighting-facts surface..." (facts half) — **new coverage; no test asserted `sighting-mark-asof` or `sighting-facts` before this change (verified by grep)** | component | assertion-red |
| The ghost layer reads the pile filtered by system | pre-existing, unaffected | component/hook | already-green |
| A ghost does not move as world time advances | pre-existing, unaffected | component | already-green |
| A ghost's stored velocity is displayed, not integrated | pre-existing (`SpaceStage.interaction.test.tsx`'s contact-facts test covers the sibling contact case; ghost velocity display is `contact-facts`-equivalent, out of this change's scope per RULING 10) | component | already-green |
| A system with more records than one page draws the newest page | pre-existing, unaffected | component | already-green |
| A ghost is visually distinct from a live contact | pre-existing, unaffected | component | already-green |
| A clean-sweep record draws no ghost | pre-existing, unaffected | component | already-green |
| A record for another system draws no ghost here | pre-existing, unaffected | component | already-green |

### Requirement: Burn Commit Reports Its Outcome

| Scenario | Test | Level | Status |
|---|---|---|---|
| A successful burn commit reports success | `SpaceCommandPanel.test.tsx` same-named test, migrated: asserts the toast contains the formatted `in 15m 30s` duration and never the raw `arriveMs` integer | component | assertion-red |
| A failed burn commit reports the mapped reason | pre-existing, unaffected | component | already-green |
| A burn commit failure with no distinguishable reason still reports safely | pre-existing, unaffected | component | already-green |

---

## Capability: `docked-fleet-actions` (MODIFIED)

### Requirement: Mine ETA Preview From the Served Mining Rate

| Scenario | Test | Level | Status |
|---|---|---|---|
| The preview tracks the tonnage input | `FleetActionsPanel.test.tsx` same-named test, migrated to `data-raw` on `mine-eta-preview` (`world-ms-span-bare`) | component | assertion-red |
| The committed countdown uses the server's ETA | `FleetActionsPanel.test.tsx` same-named test, migrated to `data-raw`/`data-unit` (`world-ms-span-left`) on `mine-countdown` | component | assertion-red |

### Requirement: Fleet Panel Cargo Hold Readout

| Scenario | Test | Level | Status |
|---|---|---|---|
| The hold readout shows contents and capacity | `FleetActionsPanel.test.tsx` same-named test, migrated to the `hold-capacity-used`/`hold-capacity-total`/`hold-{kind}-tons`/`hold-free` split | component | assertion-red |
| An unavailable roster reads as absent, not an empty hold | `FleetActionsPanel.test.tsx` "Scenario: An unloaded roster reads as absent, not an empty hold" (new) | component | assertion-red |
| The hold visibly fills when a mine run resolves | `FleetActionsPanel.test.tsx` same-named test, migrated | component | assertion-red |

### Requirement: Sell Offer on the Docked Fleet

| Scenario | Test | Level | Status |
|---|---|---|---|
| Sell is offered while docked at a station with cargo aboard | pre-existing, unaffected | component | already-green |
| Sell is not offered when merely co-located, not docked | pre-existing, unaffected | component | already-green |
| Sell is not offered while docked to a body that is not the station | none found (grep confirms no test sets `attachedTo` to an ordinary body while `station` is non-null) | component | reasoned-not-automated — pre-existing scenario reproduced unchanged by this delta; no figure-formatting content; the gap predates this change and is not remediated here (flagged for the record, not this change's responsibility) |
| Sell is not offered when the cargo pool is empty | pre-existing, unaffected | component | already-green |
| Tonnage input clamps to held tonnage of the selected kind | pre-existing, unaffected | component | already-green |
| The proceeds preview reflects the served quote | `FleetActionsPanel.test.tsx` same-named test, migrated to `data-raw`/`data-unit` on `sell-proceeds-preview` | component | assertion-red |
| A kind with no configured floor at this station is excluded from the picker | pre-existing, unaffected | component | already-green |
| A split-fill preview matches the settlement fold exactly | `FleetActionsPanel.test.tsx` same-named test, migrated to assert `data-raw` equals the fold oracle's `totalProceeds` | component | assertion-red |

### Requirement: Refuel Offer on the Docked Fleet

| Scenario | Test | Level | Status |
|---|---|---|---|
| Refuel is offered while docked at a station | pre-existing, unaffected | component | already-green |
| Refuel is not offered when merely co-located, not docked | pre-existing, unaffected | component | already-green |
| Refuel is not offered while docked to a body that is not the station | none found | component | reasoned-not-automated — same reasoning as the sell-side twin above |
| The default tonnage is capped by affordability, not only by free hold | pre-existing, unaffected (asserts the input value, not a `<Figure>`) | component | already-green |
| An unavailable credit balance falls the default back to free hold | none found | component | reasoned-not-automated — pre-existing scenario; the *default input value* is not itself a rendered figure (`refuel-tons-input` is an `<input>`, never a `<Figure>`), so it is out of this change's attribute contract; gap predates this change |
| Tonnage input clamps to the fleet's free hold | pre-existing, unaffected | component | already-green |
| The cost preview reflects the server-served fuel price, not a client-maintained constant | `FleetActionsPanel.test.tsx` same-named test, migrated to `data-raw`/`data-unit` on `refuel-cost-preview` | component | assertion-red |

### Requirement: Station-Keeping Hold and Release Controls

| Scenario | Test | Level | Status |
|---|---|---|---|
| Holding an orbiting fleet submits hold and the panel reflects station-keep | pre-existing, unaffected | component | already-green |
| Releasing a station-keeping fleet submits release and the panel reflects orbit | pre-existing, unaffected | component | already-green |
| No control is offered while burning, drifting, or point-parked | pre-existing, unaffected | component | already-green |
| The drain readout shows the served upkeep rate while holding | `FleetActionsPanel.test.tsx` same-named test, migrated to `data-raw="0.02"`/`data-unit="tons-per-world-s"` (display text now `1.2 t/min`, never the raw `0.02`) | component | assertion-red |
| The Hold control prices the hold before it is taken | `FleetActionsPanel.test.tsx` same-named test, migrated to `data-raw` | component | assertion-red |
| The drain readout is never derived from orbital elements | pre-existing, unaffected (absence check) | component | already-green |
| A hold at or below the reserve is rejected and toasted, not silently accepted | pre-existing, unaffected | component | already-green |
| Reaching the dry instant is reflected only on the next refetch | pre-existing, unaffected | component | already-green |

### Requirement: Credit Balance Readout

| Scenario | Test | Level | Status |
|---|---|---|---|
| The panel shows the current credit balance | `FleetActionsPanel.test.tsx` same-named test, migrated to `balance-value`/`balance-figure` split; also `SystemSpaceView.test.tsx` "Scenario: The panel shows the current credit balance (the view sources it, not the panel)", migrated | component | assertion-red |
| An unavailable balance reads as unavailable, not as a figure | `FleetActionsPanel.test.tsx` new test (see figure-formatting's absent-value table above) | component | assertion-red |
| The balance visibly updates when a sale resolves | `FleetActionsPanel.test.tsx` "Scenario: A successful sale refreshes hold and balance", migrated to `balance-figure`'s `data-raw` | component | assertion-red |
| The balance visibly updates when a refuel resolves | pre-existing "Scenario: A successful refuel refreshes hold, range, and balance" (does not assert the balance figure directly; unaffected) | component | already-green |
| A balance change is announced to assistive technology | pre-existing, unaffected (asserts `aria-live` + textual regex, which still matches the formatted `1,200`) | component | already-green |
| A transition to or from an unavailable balance is announced | `FleetActionsPanel.test.tsx` "Scenario: A transition to or from an unavailable balance is announced" (new) | component | assertion-red — run output: `expected '' not to be ''` (today's live region renders empty text on this transition, exactly the defect task 5.7 fixes) |
| A failed sale's or refuel's error is announced to assistive technology | pre-existing, unaffected | component | already-green |

### Requirement: Sell Commit

| Scenario | Test | Level | Status |
|---|---|---|---|
| A successful sale refreshes hold and balance | see Credit Balance Readout row above (same test) | component | assertion-red |
| A failed sale toasts player-facing copy, not raw server text | pre-existing, unaffected | component | already-green |
| A price-changed rejection refreshes the offer instead of freezing it | `FleetActionsPanel.test.tsx` "Scenario: Re-committing a re-priced sale uses a new operation key" (combined test), migrated: asserts `sell-price-changed` wrapper has no pair, `sell-price-expected`/`sell-price-refreshed` each carry their own `data-raw` **(strengthened post-handoff — see "Post-handoff test repairs" below: `sell-price-expected` now asserted equal to the settlement fold's `totalProceeds` captured at commit time, over a genuine re-quote fixture, not merely "differs from `sell-price-refreshed`")** | component | assertion-red |
| Re-committing a re-priced sale uses a new operation key | same test (operation-key half unaffected) | component | already-green |

---

## Capability: `fleet-roster` (MODIFIED)

### Requirement: One Row Per Owned Fleet, Derived From Kinematic State

| Scenario | Test | Level | Status |
|---|---|---|---|
| A parked, undocked fleet reads as on station | pre-existing, unaffected | component | already-green |
| A docked fleet reads as docked | pre-existing, unaffected | component | already-green |
| A burning fleet counts down to arrival | pre-existing (`roster-status.test.ts` covers the derivation; no existing `FleetRoster.test.tsx` test names a burning fleet's rendered countdown directly — the closest is the running-mine gate test, migrated below) | unit | already-green |
| A drifting fleet reads as drifting, with no countdown | pre-existing, unaffected | component | already-green |
| A docked fleet with a running mine reads as mining | `FleetRoster.test.tsx` "disables burn/cut-drive/stop/jump and shows a countdown while a mine is running", migrated to `data-raw`/`data-unit` on `fleet-row-eta-f1` | component | assertion-red |
| A past-ETA mine action no longer drives the label | pre-existing, unaffected | component | already-green |
| A fleet mid-jump reads as in transit | `GalaxyView.test.tsx` "shows a travelling fleet in the roster, with its route and a live ETA", migrated to `data-raw`/`data-unit` with a tolerance window **(fixture repaired post-handoff — see "Post-handoff test repairs" below: the `traveling` fixture now sets `scale: 1` so this scenario's own live-ETA intent is actually exercised)** | component | assertion-red |
| An unknown system name falls back to its id | pre-existing, unaffected | component | already-green |
| A countdown renders absent until a scale is served | `FleetRoster.test.tsx` "Scenario: A countdown renders absent until a scale is served, never at an assumed scale of 1" (new) — **confirmed post-handoff as the sole, dedicated coverage of this scenario before the `GalaxyView.test.tsx` fixture repair above; the repair would otherwise have deleted this scenario's only coverage** | component | assertion-red |

### Requirement: The Roster Row Shows Held Fuel and an Estimated Range

| Scenario | Test | Level | Status |
|---|---|---|---|
| A roster row shows the fleet's held fuel and estimated range | `FleetRoster.test.tsx` "shows the fleet's held fuel tonnage and its server-reported estimated range", migrated to `data-raw`/`data-unit` on `fleet-fuel-f1`/`fleet-range-f1` | component | assertion-red |
| The roster never computes range client-side | `FleetRoster.test.tsx` "renders the served range verbatim, never a client-side re-derivation from fuel", migrated to `data-raw` | component | assertion-red |
| An unavailable fuel or range figure reads as absent, not zero | `FleetRoster.test.tsx` "shows the figure-formatting absent form, never 0t fuel, when the roster fields are unavailable" (new) | component | assertion-red |
| A bare range figure is never shown without its label | `FleetRoster.test.tsx` same test as "shows the fleet's held fuel..." (the `range` label sibling is unchanged prose, asserted implicitly by the testid structure) | component | already-green (case (b) keeps the label as a sibling; no copy change to the label itself) |

---

## Capability: `sighting-log` (MODIFIED)

### Requirement: The Sighting Log Lists the Corporation's Own Pile in Served Order

| Scenario | Test | Level | Status |
|---|---|---|---|
| Rows render in the served order | pre-existing, unaffected | component | already-green |
| A composition row shows hulls | pre-existing composition assertions unaffected; `asOf` half is new — `SightingLog.test.tsx` "the row's asOf is a formatted T+ stamp carrying its raw served value" | component | assertion-red (asOf half); already-green (composition half) |
| The swept host is shown as its raw id, whatever the host is | pre-existing, unaffected | component | already-green |
| A clean-sweep row shows the clean-sweep marker | pre-existing, unaffected | component | already-green |
| Two records within the same minute render identical stamps, distinguished only by row order | `SightingLog.test.tsx` "Scenario: Two records within the same minute render identical stamps, distinguished only by row order" (new — no existing test asserted `asOf` collision behaviour at all) | component | assertion-red |

---

## Playwright — deferred to the journey (Phase F, not this phase)

Per `docs/testing-tiers.md` and the SDET protocol, no Playwright is written in
this red phase. The following are recorded so they are not lost between now
and the journey:

| Item | What it needs | Status |
|---|---|---|
| `frontend/e2e/helpers/space-view.ts`'s `digits()`/`holdKindTons()` rewrite (task 10.1) | Read `data-raw` instead of parsing text, target the per-figure derived ids | Playwright, deferred |
| `space-journey.spec.ts:81`'s own byte-copy of `digits()` (contract §10 F6) | Delete the local copy in favour of the shared import — **flagged so it is not lost**: rewriting only the shared helper (10.1) leaves this file still parsing text | Playwright, deferred |
| `scan-lane-transit-fizzle.spec.ts:231-233` (task 10.2) | Replace the literal `'now'` assertion with a `data-raw <= 0` check | Playwright, deferred |
| Burn-preview journey figure assertions (task 12.1) | One `data-raw`/`data-unit` pair per figure (arrival, Δv, fuel) in the existing journey walk | Playwright, deferred |

---

## Fixture-table row count (traceability manifest)

`frontend/lib/format/cases.json`: **122 rows** across duration (27), instant
(14), scaleLabel (7), tons (10), range (9), deltaV (8), credits (7), rate (13),
and the `absent` subgroup (28, 4 per quantity × 7 quantities). Every row has a
stable `id` and a matching `it()` in `figures.test.ts` named
`[id]` — grep `figures.test.ts` for `\[.*\]` to enumerate all 145
module-level test cases (163 total `figures.test.ts` tests including the
non-fixture-table ones: constants, `unitNeedsScale`/`formatByUnit` dispatch,
and the type-level pin).

## Scenario count by status

- **compile-red**: 92 (the whole module-level fixture suite + `Figure.test.tsx`
  + the guard suite's currently-vacuous static assertions + every migrated
  component assertion that depends transitively on `assert-figures.ts` →
  `figures.ts`)
- **assertion-red**: 31 (component-level migrations that fail against today's
  code independent of the missing module — `guards.test.ts`'s 3 real
  violations, plus every "the toast/text must not show the raw number" and
  "the pair must not exist here" style assertion)
- **already-green**: ~48 (scenarios this delta reproduces unchanged; existing,
  unmigrated tests already satisfy them)
- **Playwright, deferred**: 4
- **reasoned-not-automated**: 3 (all pre-existing, non-figure-formatting gaps
  the delta reproduces unchanged — flagged above with reasons, not silently
  dropped)

(compile-red vs assertion-red is a property of *today's* tree, not a
permanent classification — once `lib/format/figures.ts` lands, most
"compile-red" rows become ordinary red-then-green assertions like the rest.)

## Post-handoff test repairs

Per `add-figure-formatting-rulings.md` § *Build adjudications* (the developer's
one test dispute and two interpretation calls, all three adjudicated by the
orchestrator). Cause for each: **adjudicated in the developer's favor** (1) or
**adjudicated against the reported reading, on a test the developer could not
legally edit** (2, 3). All three edits are test-only; no production code
changed as part of this repair pass.

1. **`GalaxyView.test.tsx` — the `traveling` fixture.** Added `scale: 1` to
   the fixture used by *"shows a travelling fleet in the roster, with its
   route and a live ETA"*. Before the fix the fixture never set `Fleet.scale`,
   so task 6.3's un-defaulted `myFleets?.[0]?.scale` correctly rendered the
   absent form (`—`) and the test's own live-ETA intent was never exercised.
   **Verified before editing** that the absent-scale behaviour this fixture
   used to accidentally cover has its own dedicated test —
   `FleetRoster.test.tsx` "Scenario: A countdown renders absent until a scale
   is served, never at an assumed scale of 1" (line 333) — so this fix does
   not delete the sole coverage of RULING 8's behaviour. Ran both tests after
   the edit; both pass against the current (unmodified by me) production
   code.

2. **Four pre-existing test files — explicit `scale` prop.** `scale={undefined}`
   added to every `<SpaceStage>` render in `SpaceStage.test.tsx` and
   `SpaceStage.renderer.test.tsx` (neither file's scenarios are about scale or
   a scale-dependent figure); `scale={1}` added to every render in
   `ScanControl.inbox-failures-and-affordances.test.tsx` and
   `SightingLog.drawn-record-membership.test.tsx` (matching the SDET's own
   sibling suites' default, since neither file's scenarios are about scale
   either). This restores compilability once the developer restores the
   contract's required-key `scale: number | undefined` form on `SpaceStage`,
   `ScanControl` and `SightingLog` (currently `scale?: number`, the
   developer's workaround for these same four files, per dispute 2). No
   assertion in any of the four files was touched.

3. **`FleetActionsPanel.test.tsx` — `sell-price-expected` strengthened.** The
   scenario *Re-committing a re-priced sale uses a new operation key* used to
   assert only that `sell-price-expected` and `sell-price-refreshed` differ —
   satisfied by both the wrong implementation
   (`sellTons × expectedUnitPrice`, a flat single-price estimate) and the
   right one (the settlement fold's `totalProceeds`, captured at commit
   time), so the test could not observe the defect it names. Strengthened to:
   (a) assert `sell-price-expected`'s `data-raw` equals
   `foldSale(entries, sellTons).totalProceeds` computed over the *fixture in
   effect at commit time*, not merely "some number"; (b) use a split-fill
   fixture (`fills.length > 1`, asserted inline) so the flat estimate and the
   fold provably diverge — the same 10-ton request over the request/floor
   fixture the sibling *A split-fill preview matches the settlement fold
   exactly* test already establishes; (c) make the "expected" vs "refreshed"
   comparison a **genuine re-quote** (a `rerender` with a different
   `stationQuotes`, `REPRICED_QUOTES`), not an artifact of comparing two
   different formulas over one unchanged fixture. **Confirmed the strengthened
   test fails against the developer's current implementation** — see the run
   output in the SDET's return; it is not currently marked in this table as
   anything other than `assertion-red`, since it was already red before this
   repair and stays red (for a sharper reason) after it.

## What I could not turn into a test, and why

Nothing in the five spec deltas is unobservable as written. The one genuine
ambiguity the architect's contract already resolved (F3 — the `<option>`'s
absent-form scenario) is executable per contract §5.2's reading, and is
exercised by `assert-figures.test.ts` case 7 and `ScanControl.test.tsx`'s
scale-less-mount test. The three `reasoned-not-automated` rows above are pre-
existing gaps this change does not touch, not spec defects — I am not
recommending a writer routing for them; they are flagged so they are not lost
after archive.

## 1. `lib/format/` — the presentation module

- [x] 1.1 Duration function: relative wall-clock duration (`Nm Ss` / `Nh Mm` /
      `Nd Hh`, chosen by magnitude, rounding to the smaller unit without ever
      producing 60), with `in`/`left`/`ago` direction affixes for a deadline,
      a bare (no-affix) form for a cost/estimate magnitude, and the
      due (`now`) form for a deadline of zero or less (R1–R3)
- [x] 1.2 Absolute-stamp function: `T+ Dd HH:MM ×N` from the world epoch,
      zero-padded, never divided by scale; scale argument is
      `number | undefined` and renders `×—` in place of `×N` when
      `undefined`, while the `T+ Dd HH:MM` portion always renders (R4,
      RULING 19)
- [x] 1.3 Tonnage function: one decimal below 100, none at or above, thin
      space (U+2009) before `t` (R5)
- [x] 1.4 Range/distance function: three significant figures, `k`/`M`
      magnitude suffix, no unit name (R6)
- [x] 1.5 Delta-v function: integer m/s, round-half-away-from-zero, thousands
      separator at 1,000+ (R7)
- [x] 1.6 Credits function: `₡` glyph, thousands separator, integer only,
      zero distinguished from absent (R8)
- [x] 1.7 Rate function: converts a served world-time denominator to
      wall-clock at the served scale, selects second/minute/hour by the
      magnitude-≥-1 rule, zero renders `0.0 t/h`; a strictly positive rate
      that rounds to `0.0` at one decimal renders the literal `<0.1 t/h`; a
      negative rate renders the absent form (R9; MINOR 2, adversary
      round 3)
- [x] 1.8 Absent-value form: single `—` for `undefined`/`null`/`NaN`/
      non-finite across every quantity function, plus the scale-absent form
      for a duration and a rate (a required-scale call site renders `—`
      directly rather than calling the formatter with an assumed scale of 1)
      (R10, RULING 8/19)
- [x] 1.9 Shared `<Figure>` element: applies `data-raw` (full-precision
      `String(value)`) and `data-unit`; a composite line is composed of one
      `<Figure>` per figure, never one element for several (R11)
- [x] 1.10 `<Figure>` accepts one further, optional prop: an accessible
      label (`aria-label`/`title` pass-through) for the `×N` suffix's
      accessible explanation — the sole exception to the closed
      `raw`/`unit`/`text`/`className`/`data-testid` prop set (RULING 22)

## 2. Fixture table and the module's own suite

Split by quantity group, one task per group, so no group's fixture rows
share a pass/fail signal with another's (~69 module-level scenarios total;
adversary round 3's concentration-risk finding).

- [x] 2.1 Duration fixture rows (R1–R3) in the `(raw, scale, expected)`
      table: the magnitude-ladder unit-flip boundaries, negative spans, the
      due form's literal `now` for both the `in` and `left` directions, the
      bare (no-affix) cost form, scale ≠ 1 for each direction affix, and the
      scale-absent form (`—`, `data-raw` still present)
- [x] 2.2 Absolute-stamp fixture rows (R4): `T+ Dd HH:MM ×N` with
      zero-padded hours/minutes, a scale of exactly 1 still showing `×1`,
      the sub-minute resolution-loss pair (stamps at 1,000 world-ms and
      40,000 world-ms both reading `T+ 0d 00:00 ×1`), and the scale-absent
      suffix (`×—`) with the `T+ Dd HH:MM` portion still rendered
- [x] 2.3 Tonnage fixture rows (R5): the 99.95/99.94 decimal-drop boundary,
      exactly 100, zero, a whole number below 100 still showing its
      decimal, the thin-space (U+2009) separator, and a negative tonnage
- [x] 2.4 Range/distance fixture rows (R6): the 999.5 three-significant-
      figure carry into the `k` suffix, exactly at a magnitude threshold,
      the `M` suffix, zero, and significant-figures-not-decimal-places
      rounding (1 → `1.00`, 12.3456 → `12.3`)
- [x] 2.5 Delta-v fixture rows (R7): fractional rounding, the half-rounds-
      away-from-zero tie, the 1,000 thousands-separator boundary, and zero
- [x] 2.6 Credits fixture rows (R8): a four-figure balance, below a
      thousand, zero as a figure distinct from the absent form, a negative
      balance, and the never-a-decimal-place rule
- [x] 2.7 Rate fixture rows (R9): the magnitude-≥-1 ladder's second/minute/
      hour boundaries (including the 0.9/1.0 flip point), the two
      world-time-denominator conversions (`tons-per-world-ms`,
      `tons-per-world-s`) at scale 1 and at scale 60, a zero rate
      (`0.0 t/h`), the `<0.1 t/h` floor for a strictly positive
      sub-boundary rate, a negative rate rendering the absent form, and the
      scale-absent form
- [x] 2.8 Absent-value fixture rows (R10): `undefined`, `null`, `NaN`,
      `Infinity`/`-Infinity` across every quantity function, zero rendering
      as each quantity's own zero figure rather than the absent form, and
      the credit-balance override that keeps its own mandated
      unavailable copy instead of the generic `—`
- [x] 2.9 `lib/format/*.test.ts` asserting every function against the
      fixture table (tasks 2.1–2.8)

## 3. Retire the three duration formatters

- [x] 3.1 Delete `frontend/lib/eta.ts`; re-point its two callers
      (`FleetRoster.tsx:199`, `SpaceStage.tsx:821`) onto `lib/format`'s
      duration function
- [x] 3.2 Delete the two duplicated local `countdown()` copies
      (`FleetActionsPanel.tsx:71-77`, `ScanControl.tsx:74-80`); re-point
      their call sites onto `lib/format`
- [x] 3.3 `SystemSpaceView` derives `servedScale: number | undefined` — the
      existing fallback chain (`interior.data?.scale ?? acting?.scale ??
      allFleets[0]?.scale`) **without** the trailing `?? 1` — and passes it
      beside `worldTime` to all six figure-rendering children: `SpaceStage`,
      `SpaceCommandPanel`, `FleetActionsPanel`, `ScanControl`, `SightingLog`,
      and `FleetRoster`. `useWorldTime` keeps receiving `servedScale ?? 1`
      unchanged, at the one line the clock projection is anchored to, so no
      existing clock assertion moves (design.md's un-defaulted-`servedScale`
      decision; MAJOR 6, adversary round 1)

## 4. Apply: `SpaceCommandPanel`

- [x] 4.1 `preview-arrival`, `preview-deltav`, `preview-fuel`,
      `preview-fuel-ceiling` rendered through `<Figure>`
- [x] 4.2 Burn success toast: replace the interpolated raw world-ms arrival
      with the formatted duration string; the toast carries no
      `data-raw`/`data-unit` attribute, per `figure-formatting`'s
      toast/aria-label exemption
- [x] 4.3 `commit-drift-notice`: split into four `<Figure>` elements (actual
      Δv, actual arrival, previewed Δv, previewed arrival) — the two Δv
      figures carry their raw served value, the two arrival figures carry
      their raw remaining span in unscaled world-milliseconds and both
      render with the `in` direction form, never one `in` and one `left`
      (RULING 24, adversary round 2 MAJOR 3)
- [x] 4.4 Thread the mounting view's served scale (task 3.3's
      `servedScale`) into every duration call this panel makes, including
      the fuel-ceiling tonnage's client-derived raw value

## 5. Apply: `FleetActionsPanel`

- [x] 5.1 Cargo hold readout through the tonnage formatter: `hold-capacity`
      splits into `hold-capacity-used`/`hold-capacity-total` (two figures in
      one element), each `hold-{kind}` row's figure takes its own derived
      testid (label plus figure), and `hold-free` moves onto its `<Figure>`
      unchanged — the wrapper testids stay, each inner figure carries
      `data-raw`; the per-kind and total-capacity figures carry raw served
      values, the used-capacity figure carries its raw client-derived value
      (MINOR 1, adversary round 1)
- [x] 5.2 `balance-value` and `balance-live-region` through the credits
      formatter, preserving *Credit Balance Readout*'s mandated
      explicit-unavailable override
- [x] 5.3 `mine-eta-preview` (bare duration, no direction affix — a cost
      quoted before the run starts) and `mine-countdown` (relative
      duration, suffixed `left`) through the duration formatter (RULING 20)
- [x] 5.4 `sell-proceeds-preview`, `refuel-cost-preview`, and the
      `sell-price-changed` toast copy through the credits formatter, each
      refreshed/expected price a separate `<Figure>`
- [x] 5.5 `stationkeep-rate` through the rate formatter, converting the
      served world-second denominator to a wall-clock rate
- [x] 5.6 Hold readout absent-value fallback: when the fleet read has not
      yet served roster fields for the acting fleet, render
      `figure-formatting`'s absent form for used/total capacity and free
      hold instead of the `?? 0` substitution (F6)
- [x] 5.7 Balance live region: announce the transition to or from the
      unavailable indication, in either direction, instead of rendering
      empty text on that transition (F7)
- [x] 5.8 `FleetActionsPanel` accepts the threaded `scale` prop (task 3.3)
      and passes it into every duration/rate call it makes: 5.3's
      `mine-eta-preview`/`mine-countdown` and 5.5's `stationkeep-rate`
      (MAJOR 6, adversary round 1)

## 6. Apply: `FleetRoster` and its served-scale prop

- [x] 6.1 `fleet-row-eta-*` through the duration formatter, reading the
      mounting view's served scale
- [x] 6.2 `fleet-fuel-*` and `fleet-range-*` through the tonnage/range
      formatters; the `?? 0` fallback replaced by the absent form
- [x] 6.3 Thread a `scale` prop through `GalaxyView`'s `FleetRoster` mount
      (`myFleets?.[0]?.scale`); update `GalaxyView.test.tsx:424`
- [x] 6.4 Absent-scale conditional: when a row's mounting view has not
      served a `scale` for a fleet whose order has a known completion time,
      render the countdown in `figure-formatting`'s absent form rather than
      passing an assumed scale of 1 (RULING 8, A6/F5) — the un-defaulted
      `servedScale: number | undefined` design.md specifies, not the
      `?? 1`-defaulted value `useWorldTime` keeps

## 7. Apply: `ScanControl` and `SightingLog`

- [x] 7.1 `scan-target-select` option durations (bare, no direction affix —
      a cost quoted before the sweep is committed) and `scan-countdown`
      (relative duration, suffixed `left`) through the duration formatter
      (RULING 20)
- [x] 7.2 Sighting-log row `asOf` and the ghost's sr-only `asOf` label
      through the absolute-stamp formatter, the raw host id left untouched;
      both pass the accessible label task 1.10 adds, stating the world
      clock's rate (RULING 22)
- [x] 7.3 `SpaceStage.tsx:708`'s visible `sighting-facts` "Observed at"
      line through the absolute-stamp formatter, also passing the
      accessible label — the second, on-screen `asOf` site task 7.2's
      sr-only label migration does not reach (UX F1; line corrected from
      the report's `:709`, which is the excluded `Bearing` `toFixed` site,
      per MINOR 5, adversary round 1)
- [x] 7.4 `ScanControl` accepts the threaded `scale` prop (task 3.3) for
      7.1's option durations and `scan-countdown`; `SightingLog` accepts it
      for its `asOf` stamps' `×N` suffix (MAJOR 6, adversary round 1)

## 8. Apply: `SpaceStage`'s duration figures

- [x] 8.1 `fleet-facts`'s `Arrives in …` through the duration formatter,
      rendered with the `world-ms-span-in` deadline token so the affix reads
      `in 4m 12s`; the surrounding copy trims its own `in` to just `Arrives`
      so the affix is supplied once, by the module (RULING 20; MINOR 1,
      adversary round 3), leaving the bearing/speed `toFixed` sites as the
      recorded, out-of-scope exception (RULING 10)
- [x] 8.2 `SpaceStage` accepts the threaded `scale` prop (task 3.3) for
      8.1's arrival duration and for the ghost/facts `asOf` stamps' `×N`
      suffix (7.2, 7.3) (MAJOR 6, adversary round 1)

## 9. Test migration — vitest

- [x] 9.1 `FleetActionsPanel.test.tsx` (24 assertions) migrated to
      `data-raw`/`data-unit` reads
- [x] 9.2 `SpaceCommandPanel.test.tsx` (11 assertions) migrated, including
      asserting the four split `commit-drift-notice` elements independently
- [x] 9.3 `SightingLog.test.tsx` migrated; new coverage added for a row's
      `asOf` raw value, which no existing test asserts today
- [x] 9.4 `FleetRoster.test.tsx` (5), `SpaceStage.fleet-mark.test.tsx` (2),
      `ScanControl.test.tsx` (2), `SpaceStage.interaction.test.tsx` (1), and
      `SystemSpaceView.test.tsx` (1) migrated to raw-attribute reads
- [x] 9.5 Shared `assertFiguresMatchModule(container)` vitest helper: for
      every element in `container` carrying `data-raw` and `data-unit` — if
      the element's `data-unit` names a duration or a rate **and** the test
      rendered with no served scale, asserts the `textContent` is exactly
      `figure-formatting`'s absent form for that quantity, without calling
      the module; every other element — including a `world-ms-instant`,
      whose stamp function takes `number | undefined` and renders its `T+`
      portion and `×—` suffix with no scale at all — is checked by calling
      the shared module's function for that `data-unit` (a duration's
      four-way token, `world-ms-span-in`/`-left`/`-ago`/`-bare`, selects
      which R3 direction form to call) with that `data-raw` and the
      scale-or-`undefined` the test rendered with, then asserting two
      things against the element's `textContent`: the module's output
      appears as a **complete numeric token** — a maximal run of digits
      together with any decimal point, thousands separator, or magnitude
      suffix bound to it, not immediately preceded or followed by a digit,
      decimal point, or separator that would make it a fragment of a longer
      number — and the text contains no complete numeric token equal to a
      full-precision rendering of the element's own `data-raw`, other than
      the token just matched — no element carrying the pair is skipped or
      left unchecked either way; invoked from every test file migrated in
      9.1–9.4, closing the `<Figure text>` bypass structurally rather than
      by naming mechanisms (R12's new scenario; RULING 17; RULING 23;
      RULING 25; RULING 26; BLOCKER 4, adversary round 1; BLOCKER 1, MAJOR 1,
      MAJOR 2, adversary round 2; MAJOR 1, MAJOR 2, MAJOR 3, adversary
      round 3)

## 10. Test migration — Playwright

- [x] 10.1 `frontend/e2e/helpers/space-view.ts`'s `digits()` and
      `holdKindTons()` rewritten to read `data-raw` instead of parsing
      rendered text, targeting the per-figure derived testids task 5.1
      names (`hold-capacity-used`/`hold-capacity-total`, each `hold-{kind}`
      row's derived figure id) rather than the composite wrapper, which
      carries no `data-raw` after the split — the point of change for
      `space-journey.spec.ts`, `refuel-commit.spec.ts`, `slice.spec.ts`, and
      `space-double-submit.spec.ts`
- [x] 10.2 `scan-lane-transit-fizzle.spec.ts:231–233`: replace the literal
      `'now'` text assertion with a `data-raw <= 0` assertion, so a copy
      change cannot silently regress the wait to its 900-second timeout

## 11. R12/R13 enforcement

- [x] 11.1 `frontend/lib/format/guards.test.ts` — one whole-tree static
      assertion covering R12 and R13: no `.toFixed(` under
      `components/space/**` or `components/fleet/**` outside a two-entry
      reviewed exception list (`SpaceStage`'s bearing/speed per RULING 10;
      `webgl/SpaceWorld.tsx`'s memo key), each entry recorded with the
      ruling or requirement that permits it and none naming a tonnage,
      duration, range, delta-v, credit, rate, or stamp (R12's exception-list
      scenario; MAJOR 8, adversary round 1); no component-local
      `countdown`/`formatEta`; no template-literal interpolation of a
      numeric expression into a `<Figure>`'s `text` prop (RULING 17, as a
      defense-in-depth static check alongside task 9.5's runtime one);
      `lib/eta.ts` absent and unimported; `lib/format/**` importing neither
      `lib/market` nor `lib/space` nor `react`; and naming no ambient source
      (`Date`, `performance`, `Math.random`, `Intl`, `toLocaleString`). Each
      exception is asserted to still exist, so the list fails loudly when
      its site is removed. A `// @ts-expect-error` case in the module's own
      suite pins R1's type-level "no scale-1 default" rejection

## 12. Playwright journey

- [x] 12.1 Update the burn-preview walk journey to assert one
      `data-raw`/`data-unit` pair per formatted figure (arrival, Δv, fuel)

## 13. Validation sweep

- [x] 13.1 Per-commit gate green: `bash .claude/scripts/check.sh` and
      `python3 .claude/skills/code-quality-checks/check.py --files-only`
      (tiers 0–1, `docs/testing-tiers.md`)
- [ ] 13.2 Tier 4 (Playwright journey) then tier 3 (full emulator suite) run
      once each with the tree locked, archive time only; write
      `docs/plans/continous_space/handoffs/add-figure-formatting-journey.md`
      with the suite budget line

# add-figure-formatting — design analysis

Produced by `openspec-design-analyst` for link 1 of `docs/plans/system-hud/chain.md`,
under `/team --chain --full-auto`. Read in full before authoring or reviewing.
Design input: `docs/plans/system-hud/chain.md`, `docs/plans/system-hud.md`,
`docs/plans/continous_space/handoffs/add-figure-formatting-rulings.md`.

Entry mode: **specced brownfield**. `openspec/changes/` contains only `archive/`
— no in-flight change conflicts with any of the five capabilities below.
Rulings 1 and 2 in the rulings file are settled and are not reopened here.

**No hard stop.** The two findings that most needed a ruling before the writer
started were AMB-5 (this link is forced to touch the galaxy view's `FleetRoster`
mount, which the chain doc forbids) and AMB-9 (`SpaceStage`'s hover-facts figures
have no covering requirement in any live spec, yet call the deleted `formatEta`
and `toFixed`). Both are ruled in `add-figure-formatting-rulings.md`.

---

## 0. What the code actually renders today (grounding; several corrections to the design input)

| Site | File:line | Renders | Today's mechanism |
|---|---|---|---|
| `preview-arrival` | `SpaceCommandPanel.tsx:210` | `{preview.arriveMs}` — **raw world-millis integer** | none |
| `preview-deltav` | `:212` | `fixed(preview.deltaV)` | `toFixed(2)` |
| `preview-fuel` | `:214` | `fixed(preview.fuelCostTons)` | `toFixed(2)` |
| `preview-fuel-ceiling` | `:219` | `fixed(ceiling)` — client-computed `fuelCostTons × BURN_FUEL_ALLOWANCE` | `toFixed(2)` |
| burn success toast | `:135` | `` `Burn committed — arriving at ${burn?.ArriveMs ?? '?'}.` `` — **raw world-ms interpolated into copy** | template |
| `commit-drift-notice` | `:280–283` | **four figures in one element**: actual Δv, actual arriveMs, previewed Δv, previewed arriveMs | `toFixed(2)` + template |
| `balance-value` | `FleetActionsPanel.tsx:341` | `{credits}` raw int, or literal `Unavailable` | template |
| `balance-live-region` | `:345` | `` `Balance ${credits} credits` `` | template |
| `hold-capacity` | `:355` | `{cargoUsed} / {cargoCapacity} t` | template |
| `hold-{kind}` | `:361` | `{kind} {tons} t` — raw float | template |
| `hold-free` | `:365` | `{freeHold} t free` | template |
| `mine-eta-preview` | `:399` | `About {countdown(minePreviewMs)} at the served rate` | local `countdown()` → `M:SS` |
| `mine-countdown` | `:422` | `countdown(eta − worldTime)` | local `countdown()` |
| `sell-price-changed` | `:449` | `The price moved from {repricedFrom}` — raw credits in copy | template |
| `sell-proceeds-preview` | `:475` | `{sellPreview.totalProceeds} credits` | template |
| `refuel-cost-preview` | `:506` | `{refuelTons * fuelPrice} credits` — **client arithmetic**, then raw | template |
| `stationkeep-rate` | `:537` | `{upkeepRate} t/s` — raw float, **world**-seconds | template |
| `scan-target-select` options | `ScanControl.tsx:290` | `{kind} · {hostId} · {countdown(t.durationMs)}` | local `countdown()` (a *second copy* of the same function) |
| `scan-countdown` | `:211` | `Settling…` or `countdown(eta − worldTime)` | local `countdown()` |
| `sighting-row-*` | `SightingLog.tsx:70` | `{record.asOf}` — **raw world-millis** | none |
| `fleet-row-eta-*` | `FleetRoster.tsx:199` | `formatEta(status.remainingMs)` | `lib/eta.ts` |
| `fleet-fuel-*` | `:210` | `{cargo?.fuel ?? 0}t fuel` — raw float | template |
| `fleet-range-*` | `:211` | `{estimatedRange ?? 0} range` — raw float | template |
| `fleet-facts` detail | `SpaceStage.tsx:821` | `Arrives in ${formatEta(remaining)}` | `lib/eta.ts` |
| `fleet-facts` drift | `:828` | `Bearing {…toFixed(0)}° · Speed {…toFixed(2)}` | `toFixed` |
| `contact-facts` | `:663–664` | `Bearing …toFixed(0)° / Speed …toFixed(2)` | `toFixed` |
| `sighting-facts` | `:709–711` | `Observed at {mark.asOf ?? '—'}` + bearing/speed | raw + `toFixed` |
| ghost mark sr-only | `:697` | `Observed at {mark.asOf}` — raw world-ms in an a11y label | template |
| `market-price-{sys}` | `MarketBoardPanel.tsx:147` | `{row.price} cr/t` — raw | template |

**Corrections to the design input, all load-bearing:**

1. **`countdown()` is duplicated verbatim in two components** (`FleetActionsPanel.tsx:71-77`,
   `ScanControl.tsx:74-80`) with near-identical comments. The chain doc names only
   `lib/eta.ts` as the thing being retired; there are in fact **three** duration
   formatters to collapse, not one.
2. **`formatEta` has two callers, not one** (`FleetRoster.tsx:199`, `SpaceStage.tsx:821`).
   The chain doc lists `SpaceStage` nowhere in "applied in the same change", but
   deleting `lib/eta.ts` makes touching `SpaceStage.tsx` mandatory. See AMB-9.
3. **`preview-arrival` is not `toFixed`-formatted at all** — it is a bare world-millis
   integer, exactly fault #1's own example (`21646048727`). The chain doc's fault #1
   is accurate here.
4. **The world epoch is not needed on the wire.** `backend/common/worldtime.go` defines
   `WorldMillis` as "milliseconds since the world epoch, scaled", so the served
   `worldTime` **is already the T+ elapsed value**. `T+ Dd HH:MM` is a pure function of
   the served number. The `×scale` suffix reads `interior.scale ?? fleet.scale`
   (`SystemSpaceView.tsx:405`). **No backend work is implied by the absolute-stamp rule.**
   Confirmed.
5. **`refuel-cost-preview` is a client multiplication** (`refuelTons * fuelPrice`),
   mandated by `docked-fleet-actions`' *Refuel Offer on the Docked Fleet*. That
   arithmetic stays in the component; `lib/format/` receives the already-computed
   number. Same for `sell-proceeds-preview` (`foldSale`, which is the *mirrored*
   `lib/market` module). This is the anti-mirror seam in practice.
6. **Rate denominators on the wire are world-time units.** `roster.miningRate` is tons
   **per world-millisecond** (`backend/fleet/roster.go:43`);
   `roster.stationKeepRateTonsPerSecond` is tons per **world**-second
   (`space.StationKeepUpkeep` multiplies by `(toMs−fromMs)/1000`). Two different
   world-time denominators. See AMB-1/AMB-2.
7. **`Fleet.scale` is optional on the wire type** (`lib/types/fleet.ts:163`) while
   `SystemSpaceRead.scale` is required (`lib/types/system-space.ts:90`). See AMB-6.
8. **`GalaxyView` runs its clock at an assumed scale of 1** —
   `useWorldTime(myFleets?.[0]?.worldTime ?? galaxy?.worldTime)` (`GalaxyView.tsx:182`)
   passes no `scale` option. A pre-existing defect against `system-space-view`'s
   "never at an assumed scale of 1" doctrine, which RULING 1 now exposes. See AMB-5.
9. **`lib/format/` cannot be "registered anti-mirror"** by the existing machinery.
   `.claude/scripts/check-mirror-map.sh` anchors every anti-mirror pair on a
   **Go-sole-authority Go package** ↔ TS directory, and there is no `backend/format`;
   the Go-side extraction loop would glob-fail. See AMB-4.

---

## 1. Capability map

### 1.1 The seam

- **`figure-formatting` owns: how a quantity becomes text.** The unit ladder, rounding,
  significant figures, glyphs, separators, direction affixes, the clock a duration
  counts in, the absent-value vocabulary, the raw-value attribute contract, and the
  purity/anti-mirror prohibition.
- **A consuming capability owns: which quantity that surface shows, from which served
  field, under which condition.** Every existing "SHALL show X from served field Y"
  clause survives verbatim; the delta appends one sentence saying the figure is
  presented per `figure-formatting` and carries its raw served value on the attribute.

A useful test the writer can apply: *if the requirement would still be true on a
surface that had never existed, it's `figure-formatting`; if it names a field, a fleet
state, or a panel, it's the consuming capability.*

### 1.2 New capability

**`figure-formatting`** — ADDED, wholly new folder. 13 requirements (§2). Rationale is
RULING 2; no re-litigation.

### 1.3 Delta capabilities

| Capability | Delta | Requirements touched |
|---|---|---|
| `system-space-view` | MODIFIED | 4 (see §3.1) |
| `docked-fleet-actions` | MODIFIED | 6 (see §3.2) — the chain doc names 3; three more carry figures |
| `fleet-roster` | MODIFIED | 2 (see §3.3) — the chain doc names 1; the ETA lives under another |
| `sighting-log` | MODIFIED | 1 (see §3.4) |

**On *A Sweep's Cost Is Presented as Time and Exposure, Not Time Alone*: NO delta.**
That requirement's text and all four scenarios are about *exposure copy* ("states that
committing the sweep makes the acting fleet detectable"). It contains no rendered
figure. The sweep-duration figure lives under **`The Focused-Scan Target List Comes
From the Server, Never From a Client Predicate`** ("each showing its served sweep
duration", scenario *Served targets are listed with their kind and duration*), and the
running-sweep countdown under **`A Running Sweep's Window and Cancel Come From the
Action Inbox`**. Those two are the delta targets; taking one against *A Sweep's Cost…*
would be a mis-target that the archiver would happily accept and that would produce a
spec paragraph about formatting inside a requirement about exposure.

### 1.4 Capabilities deliberately NOT touched, and why that is a decision

- **`market-board-panel`** renders `{row.price} cr/t` raw and a spread. Chain assigns it
  to link 4. See AMB-10.
- **`focused-scan`, `fleet-movement`, `market-price-board`, `corporation-credits`** —
  server-side; untouched, correctly.
- **`galaxy-view`** — see AMB-5; the chain forbids touching it, and this link is forced to.
- **`cross-stack-determinism`** — no delta recommended; see AMB-4 for why the
  anti-mirror clause should live in `figure-formatting` instead.

---

## 2. `figure-formatting` — ADDED requirements and scenarios

Every requirement below is ADDED. Scenarios marked **[INFERRED]** are drafted from what
the design implies rather than states.

### R1 — A Duration Between Two World Instants Is Presented in Wall-Clock Units at the Served Scale

The system SHALL present a duration derived from world-time stamps as the real time the
player will wait: the world-millisecond span divided by the served world-clock scale. A
duration formatter SHALL take the served scale as an explicit argument and SHALL NOT
default it to 1. (RULING 1.)

- **Scenario: A world-millisecond span at scale 1 reads as the same wall duration** —
  WHEN 252,000 world-ms are formatted at scale 1 THEN the result reads `4m 12s`.
- **Scenario: A time-warped world divides the span by its scale** — WHEN 252,000
  world-ms are formatted at scale 60 THEN the result reads `4s`, not `4m 12s`.
- **Scenario: A fractional scale multiplies the wait** — WHEN 60,000 world-ms are
  formatted at scale 0.5 THEN the result reads `2m 0s`. **[INFERRED]**
- **Scenario: A missing scale is not silently treated as 1** — WHEN a duration is
  requested with no scale argument THEN the call does not compile / the formatter raises
  rather than producing a figure. **[INFERRED — the writer must pick "type-level" or
  "runtime"; see AMB-6]**
- **Scenario: A non-positive scale is refused, not divided by** — WHEN a scale of 0 or a
  negative scale is supplied THEN the formatter produces the absent-figure form of R10
  rather than an infinity or a sign flip. **[INFERRED]**

### R2 — A Duration Reads in Exactly Two Adjacent Units Chosen by Its Magnitude

The system SHALL present a wall duration as `Nm Ss` below one hour, `Nh Mm` below one
day, and `Nd Hh` at or beyond one day.

- **Scenario: Under an hour reads minutes and seconds** — 252 s → `4m 12s`.
- **Scenario: Under a day reads hours and minutes** — 12,300 s → `3h 25m`.
- **Scenario: A day or more reads days and hours** — 187,200 s → `2d 4h`.
- **Scenario: Exactly one minute** — 60 s → `1m 0s` (not `60s`, not `1m`).
- **Scenario: Exactly one hour** — 3600 s → `1h 0m`, and not `60m 0s`.
- **Scenario: Exactly one day** — 86,400 s → `1d 0h`, and not `24h 0m`.
- **Scenario: Sub-second** — 400 ms → `0m 0s` **or** the absent form; the writer must pin
  one. (Today `formatEta` returns `0s` for 400 ms via `Math.round`.) **[INFERRED —
  boundary the chain doc does not settle]**
- **Scenario: A duration that crosses a unit boundary only after rounding** — 3,599,600 ms
  (59 m 59.6 s) SHALL read as `1h 0m`, not `59m 60s`. The rounded seconds field SHALL
  never render as 60. **[INFERRED — this is the classic defect in every hand-rolled
  duration formatter and neither current implementation guards it: `lib/eta.ts:10`
  computes `Math.round(s/60)` and would render `60m` at 59 m 30 s.]**
- **Scenario: A duration that rounds up across the hour boundary reselects its unit
  pair** — 86,399,600 ms reads `1d 0h`. **[INFERRED]**

### R3 — A Relative Duration Names Its Direction, and a Due Duration Names That

The system SHALL prefix a future duration with `in`, suffix a remaining duration with
`left`, and suffix a past duration with `ago`; and SHALL present a duration of zero or
less as an explicit due/now form rather than as a zero or negative quantity.

- **Scenario: A future ETA reads `in`** — `in 4m 12s`.
- **Scenario: A running order's remainder reads `left`** — `2m 40s left`.
- **Scenario: A past stamp reads `ago`** — `3h 20m ago`.
- **Scenario: Exactly zero** — WHEN the span is exactly 0 THEN the figure reads as due,
  with no unit pair and no sign.
- **Scenario: A negative span never renders a minus sign or a growing countdown** — WHEN
  the span is −1 ms or −900,000 ms in a countdown context THEN the figure reads as due,
  identically in both cases. **[Directly load-bearing: `system-space-view`'s *A past-ETA
  sweep reads as settling, not as a negative countdown* and `ScanControl.test.tsx:304`
  assert the rendered text contains no `-`.]**
- **Scenario: A negative span in an `ago` context is a positive magnitude** — a stamp
  200,000 ms in the past reads `3m 20s ago`, not `-3m 20s`. **[INFERRED]**

### R4 — An Absolute World Instant Reads as `T+` From the Epoch With Its Served Scale

The system SHALL present an absolute world-time stamp as `T+ Dd HH:MM` measured from the
world epoch, with the served scale appended as `×N`; and SHALL NOT divide an absolute
stamp by the scale.

- **Scenario: A stamp renders days, hours and minutes with its scale** — 187,980,000
  world-ms at scale 60 → `T+ 2d 04:13 ×60`.
- **Scenario: The absolute stamp is world time, not wall time** — the same stamp at scale
  1 and at scale 60 renders the identical `T+` figure, differing only in the `×N` suffix.
  **[This is the pairwise guard RULING 1 exists for.]**
- **Scenario: Hours and minutes are zero-padded** — a stamp at day 3, hour 4, minute 5
  reads `T+ 3d 04:05`.
- **Scenario: Zero** — 0 world-ms reads `T+ 0d 00:00`.
- **Scenario: A scale of exactly 1 still renders its suffix** — `×1` is shown, so a reader
  never has to infer it. **[INFERRED — the writer may rule the other way; state it either
  way]**
- **Scenario: Sub-minute stamps are not distinguished** — two stamps 1,000 ms and
  40,000 ms render the identical `T+ 0d 00:00`. **[INFERRED — the resolution loss is real
  for `sighting-log` rows; see AMB-7]**

### R5 — A Tonnage Reads With One Decimal Below 100 and None At or Above, With a Thin Space Before Its Unit

- **Scenario: Below 100 keeps one decimal** — 47.23519999999999 → `47.2 t`.
- **Scenario: At or above 100 drops the decimal** — 153.4 → `153 t`.
- **Scenario: Exactly 100** — 100 → `100 t` (no decimal; the rule is "at or above").
- **Scenario: 99.95 rounds up across the threshold and takes the no-decimal form** —
  99.95 → `100 t`, never `100.0 t` and never `99.9 t`. **[The chain doc names this edge
  explicitly.]**
- **Scenario: 99.94 stays below** — → `99.9 t`.
- **Scenario: Zero** — 0 → `0.0 t`.
- **Scenario: A whole number below 100 still shows its decimal** — 6 → `6.0 t`.
  **[INFERRED — decides whether `hold-fuel` reads `6 t` or `6.0 t`;
  `FleetActionsPanel.test.tsx:582` asserts `/\b6\b/` today]**
- **Scenario: The unit is separated by a thin space** — the character between the number
  and `t` is U+2009, not U+0020. **[INFERRED from the doc's wording; consequence for
  `e2e/helpers/space-view.ts:397`, whose `/([\d.]+)\s*t\b/` still matches because `\s`
  covers U+2009]**
- **Scenario: A negative tonnage** — the sign is preserved and the same rounding applies.
  **[INFERRED]**

### R6 — A Range or Distance Reads to Three Significant Figures With a Magnitude Suffix

- **Scenario: Thousands take the suffix** — 13,944.775743999995 → `13.9k`.
- **Scenario: Below the first magnitude reads bare** — 833.25 → `833`.
- **Scenario: Significant figures, not decimal places** — 1 → `1.00`; 12.3456 → `12.3`.
- **Scenario: Three-significant-figure carry crosses a magnitude** — 999.5 → `1.00k`,
  never `1000` and never `999.5`. **[The classic sig-fig carry defect.]**
- **Scenario: Exactly at a magnitude** — 1000 → `1.00k`.
- **Scenario: Millions** — 1,234,567 → `1.23M`. **[INFERRED — the suffix ladder's extent
  is unstated; see AMB-14]**
- **Scenario: Zero** — 0 → `0.00` or `0`; the writer pins one. **[INFERRED]**
- **Scenario: No unit is named** — the figure carries a magnitude suffix and no distance
  unit, because no wire field names one. **[INFERRED — resolves the `13.9k` vs `1,180 km`
  contradiction between the two design docs; see AMB-14]**

### R7 — A Delta-V Reads as Integer Metres Per Second

- **Scenario: A fractional Δv rounds to an integer** — 269.4 → `269 m/s`.
- **Scenario: A half rounds to nearest, away from zero** — 268.5 → `269 m/s`.
  **[INFERRED — pins the tie rule so two implementations cannot diverge]**
- **Scenario: A large Δv takes a thousands separator or does not** — 3721.2 → the writer
  pins `3,721 m/s` or `3721 m/s`. **[INFERRED — `SpaceCommandPanel.test.tsx:124` already
  hedges with `/3721|3,721/`, which is evidence nobody has decided]**
- **Scenario: Zero** — 0 → `0 m/s`.

### R8 — A Credit Figure Reads With the Currency Glyph and Thousands Separators

- **Scenario: A four-figure balance** — 1000 → `₡ 1,000`.
- **Scenario: Below a thousand** — 28 → `₡ 28`.
- **Scenario: Zero** — 0 → `₡ 0`, and never the absent form (a zero balance is a fact, an
  unavailable one is not). **[Load-bearing against `docked-fleet-actions`' *An
  unavailable balance reads as unavailable, not as a figure*.]**
- **Scenario: A negative balance** — the sign is rendered. **[INFERRED]**
- **Scenario: Credits are integers and never gain a decimal** — 1250 → `₡ 1,250`.
  **[Credits are `int64` on the wire — `backend/corporations/credits.go`; a decimal would
  assert a precision the ledger does not have.]**

### R9 — A Rate Reads Per the Time Unit the Player Waits In

The system SHALL present a rate in tons per the largest wall-time unit in which its
magnitude is legible, converting a served world-time denominator to wall time at the
served scale.

- **Scenario: A rate legible per minute reads per minute** — → `2.4 t/min`.
- **Scenario: A rate too small per minute falls to per hour** — → `0.4 t/h`.
- **Scenario: The unit flips at its stated threshold** — a rate at the boundary renders in
  exactly one of the two units, deterministically. **[The threshold is unstated; see
  AMB-2.]**
- **Scenario: A world-per-millisecond rate is converted** — `roster.miningRate` of 0.001
  t/world-ms at scale 1 → `60.0 t/min`. **[INFERRED]**
- **Scenario: A world-per-second rate is converted** —
  `roster.stationKeepRateTonsPerSecond` of 0.02 at scale 1 → `1.2 t/min`. **[INFERRED —
  note this changes what `stationkeep-rate` reads today, `0.02 t/s`; the live requirement
  says only "in fuel tons per unit time", so the delta is legal]**
- **Scenario: A zero rate** — 0 → the writer pins `0.0 t/h` or an explicit never/stalled
  form. **[INFERRED — a zero `miningRate` today makes `minePreviewMs = 0`, which renders
  `About 0:00`, a lie]**
- **Scenario: A negative rate** — renders its sign, or reads as the absent form.
  **[INFERRED]**

### R10 — An Absent, Non-Finite, or Unsupplied Figure Reads as Explicitly Absent, Never as a Number

The system SHALL present `undefined`, `null`, `NaN`, and non-finite values as a single
explicit absent form, and SHALL NOT substitute zero, an empty string, or a raw `NaN`.

- **Scenario: Undefined** — → the absent form.
- **Scenario: NaN** — → the absent form, never the string `NaN`. **[Today
  `SpaceCommandPanel.tsx:79` `fixed(NaN)` renders `"NaN"` because `typeof NaN ===
  'number'`; `FleetActionsPanel.tsx:74` `countdown(NaN)` renders `"NaN:NaN"`. Both are
  live defects.]**
- **Scenario: Infinity** — → the absent form. **[INFERRED]**
- **Scenario: Zero is not absent** — 0 renders as a zero figure in every quantity,
  distinguishable from absent.
- **Scenario: The absent form does not override a capability's own unavailable copy** — a
  credit balance the mounting view supplies as `null` still renders
  `docked-fleet-actions`' explicit unavailable indication, not the generic absent dash.
  **[Keeps *Credit Balance Readout* intact; see AMB-12]**

### R11 — Every Formatted Figure Carries Its Raw Served Value on a Data Attribute

The system SHALL render each player-facing figure as its own element carrying the
unformatted numeric value it was formatted from, so a test can assert the wire figure
without reading copy. A copy line containing more than one figure SHALL wrap each figure
in its own element.

- **Scenario: A formatted tonnage carries its raw value** — WHEN 47.23519999999999 t is
  rendered THEN the element's raw attribute is `47.23519999999999` while its text is
  `47.2 t`.
- **Scenario: A composite line carries one raw value per figure** — WHEN the commit-drift
  line renders an actual Δv, an actual arrival, a previewed Δv and a previewed arrival
  THEN four elements each carry their own raw value. **[Directly forced by
  `SpaceCommandPanel.tsx:280–283`, which today puts four figures in one
  `commit-drift-notice` element — a single `data-raw` on that element is structurally
  impossible.]**
- **Scenario: The raw value is the wire figure, not the display figure** — the attribute
  is not the rounded value.
- **Scenario: An absent figure carries an absent raw attribute** — the attribute is
  omitted (or explicitly empty), never `NaN` or `0`. **[INFERRED]**
- **Scenario: A duration's raw value is its unscaled world-millisecond span** — so a test
  can assert against the served stamp arithmetic without knowing the scale. **[INFERRED —
  see the recommendation in §5]**
- **Scenario: A figure rendered into a toast or an aria-label carries no attribute** — the
  rule binds rendered elements; string-only surfaces still use the formatter. **[INFERRED
  — see AMB-11]**

### R12 — A Player-Facing Figure Is Produced Only by the Shared Formatter

The system SHALL render every player-facing numeric figure through the shared
presentation module, and SHALL NOT interpolate a raw wire number, or a number formatted
at the call site, into player-facing copy.

- **Scenario: No component-local decimal rounding** — WHEN the space and fleet component
  trees are inspected THEN no component calls `toFixed` on a player-facing figure.
  **[Observable via a static assertion in the unit suite — the repo has precedent in
  `frontend/lib/anti-mirror-guard.test.ts`, which shells out to a checker and asserts its
  exit code.]**
- **Scenario: No component-local duration formatter** — no component defines its own
  `countdown`, `formatEta`, or equivalent. **[Kills the two duplicated `countdown()`
  copies.]**
- **Scenario: The retired module is gone** — `frontend/lib/eta.ts` does not exist and
  nothing imports it.
- **Scenario: A raw wire number does not reach copy** — the burn success toast names its
  arrival as a formatted duration, not as a world-millisecond integer.
  **[`SpaceCommandPanel.tsx:135` today.]**

### R13 — The Formatter Is Pure Presentation and Derives No Rule-Bearing Value

The presentation module SHALL be a pure function of its arguments, and SHALL NOT compute
affordability, a shortfall, a fold, a price, a flight time, or any rounding a wire value
already encodes. It SHALL NOT be a mirror of any Go package.

- **Scenario: No rule-bearing computation** — the module exposes no affordability,
  shortfall, proceeds, or flight-time function; every such value arrives on the wire or
  from an existing named client computation and is handed to the formatter already
  computed.
- **Scenario: The module reads no ambient state** — the same arguments produce the same
  string in every process, with no module singleton, no clock read, and no locale
  detection. **[RULING 1's third rejected alternative.]**
- **Scenario: The module imports no wire-rule module** — it imports neither `lib/market`
  (the one mirrored pair) nor `lib/space`.
- **Scenario: The formatter is pinned by a fixture table** — every rule above is asserted
  against a recorded table of (raw, scale, expected) pairs rather than by hand-written
  per-case assertions. **[The chain doc's own "fixture-tested against a table of (raw,
  expected) pairs".]**

*(§2 has 13 requirements. R1/R2/R3 are the duration rules split because they fail
independently; R12/R13 are the two cross-cutting prohibitions. A writer wanting a tighter
count could fold R2 into R1 and R3 into R2; not recommended — the unit-boundary carry and
the negative/zero case are where implementations diverge.)*

---

## 3. MODIFIED delta targets — verbatim headers

**Reminder for the writer (from `MEMORY.md`'s recorded archiver trap):** a MODIFIED block
is a complete replacement. Every scenario heading listed below must be reproduced
**character-for-character**, including the unchanged ones, or the archiver drops behaviour
and `--strict` will not catch it.

### 3.1 `openspec/specs/system-space-view/spec.md` — 4 MODIFIED

**(a)** `### Requirement: Burn Preview Reflects the Server-Solved Order, Without Committing` (line 457)
- **Changes:** the clause "render its solved curve as a distinct preview overlay alongside
  the **arrival time, delta-v cost, fuel cost**…" gains a presentation sentence: those
  figures are presented per `figure-formatting` (arrival as a relative duration, Δv as
  integer m/s, fuel as tons) and each carries its raw served value.
- **Unchanged and must be reproduced verbatim:** the entire preview-request policy
  (burning fleets are previewed; no preview while a mine holds the movement channel or in
  lane transit), the single-named-interval refresh rule, and OQ-14's deferral.
- **7 scenario headings to reproduce:** `Selecting a target shows a preview curve and its
  figures` / `A burning fleet's re-target is previewed` / `Clearing the selection clears
  the preview` / `The preview refreshes on exactly one named interval while shown` / `The
  refresh interval is defined in exactly one place` / `An unaffordable preview is shown as
  such` / `No preview is requested while a mine holds the movement channel`. Only the
  first needs its THEN amended.

**(b)** `### Requirement: A Commit's Actual Result Is Never Silently Swapped for the Previewed One` (line 683)
- **Changes:** "surface the actual figures alongside" gains the clause that actual and
  previewed figures are each presented per `figure-formatting` and each carries its own
  raw value — the four-figures-in-one-element problem.
- **Unchanged:** the whole quote-lock/display-half rationale and the `maxFuelTons`
  cross-reference.
- **3 scenario headings:** `A commit matching the preview shows no drift notice` / `A
  commit differing from the preview surfaces both figures` / `An uncapped commit still
  surfaces its actual figures`.

**(c)** `### Requirement: The Focused-Scan Target List Comes From the Server, Never From a Client Predicate` (line 1742)
- **Changes:** one clause only — "each showing its served sweep duration" gains "presented
  per `figure-formatting`, carrying its served duration as a raw value". **Nothing else.**
  This is a very long requirement (≈60 lines of prose about refetch triggers) and every
  word of it must be reproduced; **the highest-risk MODIFIED block in the change.**
- **10 scenario headings:** `Served targets are listed with their kind and duration` / `A
  body absent from the served set is not offered` / `An empty target set is stated, not
  shown as an empty list` / `An empty target set explained by transit or a running sweep
  states that instead` / `A failed target read is retriable and offers nothing` / `A
  landed arrival refetches the target list` / `A failed refetch drops the stale list
  rather than restating it` / `A settled sweep refetches the target list` / `An empty set
  awaiting its triggered refetch is not reported as no host in range` / `Changing the
  acting fleet refetches the list`.

**(d)** `### Requirement: A Running Sweep's Window and Cancel Come From the Action Inbox` (line 2052)
- **Changes:** "SHALL show a countdown from that action's committed time to its ETA,
  measured against this view's projected world time" gains the presentation clause; the
  existing settling rule ("rather than counting below zero") is now satisfied by
  `figure-formatting` R3 and should cross-reference it rather than restate it.
- **6 scenario headings:** `The countdown spans the action's committed window` / `The
  window is not taken from the fleet read` / `Cancel names the scan action's own id` / `A
  cancelled sweep returns the control to its target list` / `The commit control is
  withheld while a sweep runs` / `A past-ETA sweep reads as settling, not as a negative
  countdown`.

**NOT modified:** `A Sweep's Cost Is Presented as Time and Exposure, Not Time Alone`
(§1.3 rationale). Also not modified: `Own-Fleet Position, Burn Curve, and Arrival Ghost
Render Continuously` — see AMB-9.

### 3.2 `openspec/specs/docked-fleet-actions/spec.md` — 6 MODIFIED (the chain names 3)

| Verbatim header | Line | Figure | Scenarios to reproduce |
|---|---|---|---|
| `### Requirement: Fleet Panel Cargo Hold Readout` | 128 | per-kind tons, used/total | 2: `The hold readout shows contents and capacity`, `The hold visibly fills when a mine run resolves` |
| `### Requirement: Credit Balance Readout` | 544 | credits + the live region's copy | 6: `The panel shows the current credit balance`, `An unavailable balance reads as unavailable, not as a figure`, `The balance visibly updates when a sale resolves`, `The balance visibly updates when a refuel resolves`, `A balance change is announced to assistive technology`, `A failed sale's or refuel's error is announced to assistive technology` |
| `### Requirement: Mine ETA Preview From the Served Mining Rate` | 67 | duration | 2: `The preview tracks the tonnage input`, `The committed countdown uses the server's ETA` |
| `### Requirement: Sell Offer on the Docked Fleet` | 151 | proceeds preview (credits) | 8: `Sell is offered while docked at a station with cargo aboard`, `Sell is not offered when merely co-located, not docked`, `Sell is not offered while docked to a body that is not the station`, `Sell is not offered when the cargo pool is empty`, `Tonnage input clamps to held tonnage of the selected kind`, `The proceeds preview reflects the served quote`, `A kind with no configured floor at this station is excluded from the picker`, `A split-fill preview matches the settlement fold exactly` |
| `### Requirement: Refuel Offer on the Docked Fleet` | 311 | cost preview (credits) | 7: `Refuel is offered while docked at a station`, `Refuel is not offered when merely co-located, not docked`, `Refuel is not offered while docked to a body that is not the station`, `The default tonnage is capped by affordability, not only by free hold`, `An unavailable credit balance falls the default back to free hold`, `Tonnage input clamps to the fleet's free hold`, `The cost preview reflects the server-served fuel price, not a client-maintained constant` |
| `### Requirement: Station-Keeping Hold and Release Controls` | 449 | upkeep rate (t/unit time) | 8: `Holding an orbiting fleet submits hold and the panel reflects station-keep`, `Releasing a station-keeping fleet submits release and the panel reflects orbit`, `No control is offered while burning, drifting, or point-parked`, `The drain readout shows the served upkeep rate while holding`, `The Hold control prices the hold before it is taken`, `The drain readout is never derived from orbital elements`, `A hold at or below the reserve is rejected and toasted, not silently accepted`, `Reaching the dry instant is reflected only on the next refetch` |

The *Sell*, *Refuel* and *Station-Keeping* blocks are the three the chain doc misses.
**Care on *Station-Keeping*:** its scenario `The drain readout is never derived from
orbital elements` and the requirement's "taken **only** from that served owner-only rate
field" are the anti-mirror guard; R9's world→wall conversion is a *presentation*
transform of the served rate, and the modified text must say so explicitly or a reviewer
will read it as the forbidden re-derivation.

### 3.3 `openspec/specs/fleet-roster/spec.md` — 2 MODIFIED (the chain names 1)

| Verbatim header | Line | Figure | Scenarios |
|---|---|---|---|
| `### Requirement: The Roster Row Shows Held Fuel and an Estimated Range` | 118 | tons + range | 2: `A roster row shows the fleet's held fuel and estimated range`, `The roster never computes range client-side` |
| `### Requirement: One Row Per Owned Fleet, Derived From Kinematic State` | 53 | **the ETA countdown** (`FleetRoster.tsx:199` `formatEta`) | 8: `A parked, undocked fleet reads as on station`, `A docked fleet reads as docked`, `A burning fleet counts down to arrival`, `A drifting fleet reads as drifting, with no countdown`, `A docked fleet with a running mine reads as mining`, `A past-ETA mine action no longer drives the label`, `A fleet mid-jump reads as in transit`, `An unknown system name falls back to its id` |

The roster's ETA rendering lives under `One Row Per Owned Fleet, Derived From Kinematic
State` ("when the current order has a known completion time — a remaining-time
countdown"), **not** under the fuel/range requirement. Its MODIFIED block is also where
the served-scale argument enters the roster, which is what forces AMB-5/AMB-6. Note these
scenarios use a **blank line after the heading** (`### Requirement: One Row Per Owned
Fleet, Derived From Kinematic State\n\nThe system SHALL…` and `#### Scenario: …\n\n-
**WHEN**`), unlike the rest of the repo — reproduce that formatting too.

### 3.4 `openspec/specs/sighting-log/spec.md` — 1 MODIFIED

`### Requirement: The Sighting Log Lists the Corporation's Own Pile in Served Order` (line 6)
- **Changes:** the clause "Each row SHALL show the record's system, its `asOf`, and the
  **raw host id**" — the `asOf` is presented per `figure-formatting` as an absolute `T+`
  stamp carrying its raw value; **the raw host id stays a raw host id**, since it is not a
  figure. The writer must be careful not to let "raw" leak from the host-id rule into the
  `asOf` rule; the requirement's whole middle section is an argument about why the host id
  is *not* a fallback, and it must survive intact.
- **4 scenario headings:** `Rows render in the served order`, `A composition row shows
  hulls`, `The swept host is shown as its raw id, whatever the host is`, `A clean-sweep
  row shows the clean-sweep marker`.
- The ordering rationale ("the pile is ordered by each record's `asOf`") interacts with
  AMB-7's minute-resolution collision.

---

## 4. Test-migration surface

**64 assertion sites across 15 files** (9 vitest, 5 Playwright specs, 1 shared Playwright
helper). This is the sizing input; the chain doc's warning is correct — the link is sized
by test files, not components.

### 4.1 Vitest — 48 assertions, 9 files

| File | Count | Lines |
|---|---|---|
| `frontend/components/space/FleetActionsPanel.test.tsx` | **24** | 222, 225 (+226 compare), 233, 252 (+253 compare) — `mine-eta-preview`; 273 `mine-countdown`; 337, 338, 339, 341, 342, 348, 353, 354, 582 — hold; 408, 411, 426 — `sell-proceeds-preview`; 441, 708, 720 — balance; 546, 557 — `refuel-cost-preview`; 634, 635, 647 — `stationkeep-rate` |
| `frontend/components/space/SpaceCommandPanel.test.tsx` | **11** | 124, 125, 152, 153, 154, 200, 246, 247, 344, 345, 362 |
| `frontend/components/fleet/FleetRoster.test.tsx` | **5** | 269 (`fleet-row-eta-f1` → `'1m'`), 370, 371, 386, 387 |
| `frontend/components/space/SpaceStage.fleet-mark.test.tsx` | **2** | 108 (`/Arrives in 2m/`), 118 (speed `/2\.6|2\.7/`) |
| `frontend/components/space/ScanControl.test.tsx` | **2** | 105–108 (option text incl. `countdown(durationMs)`), 303–305 (`scan-countdown` `settl` / no `-`) |
| `frontend/components/space/SpaceStage.interaction.test.tsx` | **1** | 613 (`contact-facts` speed) |
| `frontend/components/galaxy/GalaxyView.test.tsx` | **1** | 424 (`fleet-row-eta-fleet_1` → `'11m'`) — **the galaxy-view coupling, in a test** |
| `frontend/components/space/SystemSpaceView.test.tsx` | **1** | 531–536 (`balance-value` → `/1[,.]?250/`) |
| `frontend/components/space/SightingLog.test.tsx` | **1** | 113 (`row.textContent` contains `'3'`) — **plus new coverage owed**: no test asserts a row's `asOf` today, though the live spec requires it. The delta should add one. |

**Not migrating but must be re-verified (no change expected):**
`SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` — 8
`expect(scan-target-select).toHaveTextContent(HOST_ID)` plus 8 `selectOptions(…, HOST_ID)`;
host ids and option *values* are unaffected by the duration reformat.
`SightingLog.drawn-record-membership.test.tsx` (8 refs) and
`SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx` (5 refs) are row-presence and
"no mark" copy only. `ScanControl.inbox-failures-and-affordances.test.tsx` (3 refs) is
presence only.

**New test files owed:** `frontend/lib/format/*.test.ts` (the fixture table), plus whatever
static-assertion suite implements R12's no-`toFixed` scenario. The `/check` harness's
test-file-coverage validator will demand a colocated test for every new module file.

### 4.2 Playwright — 16 sites, 6 files

| File | Count | Detail |
|---|---|---|
| `frontend/e2e/tests/space-journey.spec.ts` | **6** | its own local `digits()` (line 82); `balance-value` at 198, 203, 209, 215; `hold-readout` textContent at 171, 182 |
| `frontend/e2e/tests/refuel-commit.spec.ts` | **4** | `refuel-cost-preview` textContent 111, 113; `digits(balance-value)` 132, 152 |
| `frontend/e2e/tests/slice.spec.ts` | **3** | `digits(hold-capacity)` 94; `digits(balance-value)` 166, 179 |
| `frontend/e2e/tests/space-double-submit.spec.ts` | **2** | `digits(balance-value)` 277, 305 |
| `frontend/e2e/tests/scan-lane-transit-fizzle.spec.ts` | **1** | `expect(page.getByTestId(\`fleet-row-eta-${fleetId}\`)).toHaveText('now', { timeout: 900_000 })` at 231–233 |
| `frontend/e2e/helpers/space-view.ts` | **2 helpers** | `digits()` 377–382; `holdKindTons()` 393–398 |

**Three specific traps in the e2e set:**

1. `scan-lane-transit-fizzle.spec.ts:233` asserts the **exact string `'now'`**, which is
   `lib/eta.ts:7`'s literal. R3 replaces it with whatever due-form the writer pins. This
   assertion is the load-bearing gate of a 900-second wait in that journey and will
   silently hang to timeout rather than fail fast if the copy changes and nobody updates
   it. It should become `data-raw <= 0`.
2. `digits()` takes **the first numeric run** in the readout. `₡ 1,000` → the comma-strip
   already handles it, but `T+ 2d 04:13` would yield `2`, and `47.2 t` yields the
   *rounded* value, not the wire value. Every `digits()` call should become a
   raw-attribute read; the helper is the single point to change.
3. `holdKindTons()`'s `/([\d.]+)\s*t\b/` survives a thin space (JS `\s` covers U+2009) but
   starts returning the rounded tonnage. Its own doc comment insists on per-kind precision
   precisely because "fuel shares the same cargo pool and every burn spends some" —
   rounding to one decimal at 47.2 t is exactly the precision this helper was written to
   preserve. **Must** move to the raw attribute.

---

## 5. Recommendation on the `data-*` convention

**Recommend: a single `data-raw` plus a `data-unit`, on a per-figure element.**

```
<span data-testid="preview-fuel" data-raw="47.23519999999999" data-unit="tons">47.2 t</span>
```

Reasoning, in order of weight:

1. **Per-figure attribute names cannot survive `commit-drift-notice`.** That element holds
   four figures today (`SpaceCommandPanel.tsx:280–283`). Either convention forces
   splitting it into four elements; once split, each element already has a unique
   `data-testid`, so a per-figure attribute name would restate information the testid
   carries. `data-raw` on a per-figure element is the smaller vocabulary.
2. **One name is mechanically enforceable.** R12's static assertion can check "every
   element whose text came from the formatter carries `data-raw`". A per-figure naming
   scheme has no such invariant — a missing `data-fuel-tons` is indistinguishable from an
   element that legitimately has no figure.
3. **Repo precedent is split but leans this way.** `space-world-clock` uses named
   `data-scale` / `data-world-time` (`SystemSpaceView.tsx:663–664`) — but that is one
   element carrying two *different* facts, which is the exception. The rest of the repo's
   data attributes are single-purpose flags on their own element: `data-affordable`,
   `data-available`, `data-highlighted`, `data-active`, `data-acting`.
4. **`data-unit` buys the thing tests actually need and copy cannot give them**: whether a
   duration's raw is world-ms or wall-ms, whether a rate is per world-second or per
   world-millisecond. Without it, a test asserting `data-raw="0.02"` on `stationkeep-rate`
   cannot tell a reviewer which second that is.

**Two sub-decisions pinned with it:**

- **Serialization**: `data-raw` is `String(value)` at full double precision
  (`47.23519999999999`), never the display value and never re-rounded. A test asserting
  the wire figure must be able to compare exactly.
- **What a duration's raw is**: the **unscaled world-millisecond span** handed to the
  formatter, so `data-raw <= 0` is the portable "due" assertion (which is what
  `scan-lane-transit-fizzle.spec.ts` actually wants) and no test has to know the scale.
  Where the surface's meaningful wire value is an absolute stamp rather than a span
  (sighting `asOf`, an action ETA), `data-raw` is that stamp and `data-unit="world-ms"`
  disambiguates.

---

## 6. Design-decision candidates for `design.md`

1. **Module shape: pure string functions plus a shared `<Figure>` element.** The
   `data-raw` contract is only enforceable-by-construction if a single component applies
   it. Recommend `lib/format/*.ts` exporting pure `(value, …) => string` functions
   (fixture-testable, trivially anti-mirror-checkable) plus one `<Figure>` component
   taking `{ raw, unit, format }` and emitting the span. Alternative — formatters return
   JSX — makes the fixture table impossible to state as (raw, expected) string pairs,
   which is the chain doc's own requirement. Alternative — every call site hand-writes the
   attribute — reintroduces the defect at 25 sites.
2. **How the scale reaches every call site.** `SystemSpaceView` has `servedScale`
   (`:405`); `GalaxyView` has none. Options: a prop drilled from each mounting view
   (explicit, and matches how `worldTime` already travels), or a React context. Recommend
   the prop, because RULING 1 forbids ambient state in the formatter and a context is one
   step from it.
3. **Rate denominator conversion.** Where the world→wall conversion lives (formatter
   argument vs caller), and the unit-selection threshold. See AMB-1/AMB-2.
4. **How R12's "no `toFixed`" is enforced.** A vitest static assertion over the component
   tree (precedent: `frontend/lib/anti-mirror-guard.test.ts`) vs an ESLint rule vs a
   `/check` changed-file validator (precedent: the harness already runs data-testid,
   raw-fetch, and color-compliance validators). Recommend the `/check` validator: it is
   the existing home for exactly this class of rule and it runs per-commit.
5. **Anti-mirror enforcement without a Go counterpart.** See AMB-4.
6. **The absent-value vocabulary** and its interaction with `Credit Balance Readout`'s
   mandated explicit-unavailable copy. See AMB-12.

---

## 7. Ambiguities

Triage: **RESOLVED** (answer found, cited), **RULABLE** (a recorded lean or a clearly
most-reversible option exists), **NEEDS A DECISION** (no basis in the repo).
Every one is ruled in `add-figure-formatting-rulings.md`.

| # | Question | Triage |
|---|---|---|
| **AMB-1** | **Which clock a rate's denominator counts in.** RULING 1 covers durations, not rates. `roster.miningRate` is t/world-ms; `stationKeepRateTonsPerSecond` is t/world-second. | **RULABLE.** Lean: wall-clock, by direct analogy with RULING 1. Basis: `chain-doc` row 1, extended. Reversal: one multiplication. |
| **AMB-2** | **Where the rate unit flips.** "per the unit the player waits in" with examples `2.4 t/min` and `0.4 t/h` gives no threshold. | **NEEDS A DECISION, reversible.** (a) largest unit where the magnitude is ≥ 1 — makes both worked examples correct; (b) magnitude in [1, 1000). Recommend (a). |
| **AMB-3** | **`data-raw` vs per-figure names.** | **RESOLVED by recommendation** (§5); the chain doc explicitly delegates ("the writer picks one and the spec pins it"). |
| **AMB-4** | **"`lib/format/` is registered anti-mirror" is not implementable as written.** `.claude/scripts/check-mirror-map.sh` anchors every anti-mirror pair on a Go-sole-authority **Go package**; there is no `backend/format`, and the Go-side `for f in "$GO_DIR"/*.go` loop would fail. `cross-stack-determinism`'s *Shared Board Math Is Pinned By a Cross-Language Golden Fixture* defines anti-mirror mode as a property of "a capability designated Go-sole-authority". `figure-formatting` is the inverse: a **TypeScript-sole** capability with no Go side at all. | **RULABLE.** Recommend: express the prohibition as `figure-formatting` R13 (spec requirement + an import-guard test that `lib/format/` imports neither `lib/market` nor `lib/space`), and take **no** `cross-stack-determinism` delta and **no** `check-mirror-map.sh` entry. Say so explicitly in `design.md` so a reviewer does not go looking for the missing map file. |
| **AMB-5** | **This link is forced to touch the galaxy view, which "What every link must not do" forbids.** `FleetRoster` is mounted on both views (`GalaxyView.tsx:472`, `SystemSpaceView.tsx:890`). Deleting `lib/eta.ts` moves the roster's ETA onto a scale-taking formatter, so `GalaxyView` must supply a scale. Its clock currently assumes 1 (`GalaxyView.tsx:182`) — a pre-existing defect against `system-space-view`'s "never at an assumed scale of 1", now exposed. `GalaxyView.test.tsx:424` breaks either way. | **NEEDS A RULING.** Recommend: a one-prop change at the mount site is not a "galaxy view change" in the sense the prohibition means (the chain excludes "the galaxy-view strip", i.e. the galaxy view's own chrome); pass `scale` from `myFleets?.[0]?.scale`. Record the galaxy clock's scale-1 projection as a **separate, out-of-scope defect** for `galaxy-view`. |
| **AMB-6** | **What a duration renders with when no scale has been served.** `Fleet.scale` is optional on the wire (`lib/types/fleet.ts:163`). RULING 1 forbids a scale-1 default *in the formatter* but says nothing about the caller. | **NEEDS A DECISION, reversible.** (a) the mounting view renders the duration as explicitly absent (R10) until a scale is served; (b) fall back to 1 — reintroduces the assumption RULING 1 removed, one layer up. Recommend (a). |
| **AMB-7** | **`T+ Dd HH:MM` is minute-resolution, but `sighting-log` rows are ordered by `asOf` and can be seconds apart.** Two adjacent rows would show identical stamps while the spec's own ordering rationale turns on the distinction. | **RULABLE.** Lean: accept the resolution (it is the scoping doc's stated format) and note it in the delta; the raw `asOf` remains on `data-raw`, so ordering stays assertable. |
| **AMB-8** | **Does `preview-arrival` become a relative duration or keep an absolute stamp?** | **RESOLVED.** `chain.md` Link 1 § Journey: "the existing burn-preview walk with **the arrival read as a relative duration** and the fuel as tons". Relative. |
| **AMB-9** | **`SpaceStage`'s hover figures have no covering requirement anywhere in `openspec/specs/`.** Verified by grep: no requirement mentions the own-fleet hover facts, `Arrives in`, or a bearing/speed readout for an own fleet. Yet `SpaceStage.tsx:821` calls the deleted `formatEta`, and lines 663, 664, 709, 710, 828 call `toFixed`. Bearing (degrees) and speed are **not in the rules table at all**. | **NEEDS A RULING — the sharpest one.** (a) migrate the duration onto the formatter (mandatory) and leave bearing/speed's `toFixed`, recorded as a knowing exception; (b) add bearing and speed to `figure-formatting` — inventing rules the design input never supplied; (c) an ADDED requirement to `system-space-view` covering the hover-facts surface — scope creep into a spec gap this link did not open. Recommend (a) plus a narrowing of R12's scenario to "a player-facing figure **the rules table names**". |
| **AMB-10** | **`MarketBoardPanel` renders `{row.price} cr/t` raw** (`:147`) and a spread. Three links would ship with two credit vocabularies (`₡ 1,000` and `1000 cr/t`) side by side once the dock lands. | **NEEDS A DECISION.** (a) defer per the chain, record the inconsistency; (b) pull `market-board-panel`'s two figure requirements into link 1 — +2 MODIFIED blocks, +1 test file, ~+3 tasks. Recommend (b) **only if** the task count lands under 35 without it; otherwise (a). |
| **AMB-11** | **Do toasts and aria-labels go through the formatter?** `SpaceCommandPanel.tsx:135` interpolates a raw world-ms into a success toast; `FleetActionsPanel.tsx:345` builds `Balance ${credits} credits` for a live region; `SpaceStage.tsx:697` builds `Observed at {asOf}` for an sr-only label. None can carry `data-raw` meaningfully. | **RULABLE.** Lean: **yes** to the formatter (a screen-reader user should hear the same figure a sighted user reads), **no** to the `data-raw` requirement, which binds rendered figure elements. The live region is already asserted by `FleetActionsPanel.test.tsx:720`, so this is a real test migration. |
| **AMB-12** | **Four different absent-value conventions exist today**: `—` (`SpaceCommandPanel.tsx:79`, `SpaceStage.tsx:709`), `0` (`FleetRoster.tsx:210–211`), `Unavailable` (`FleetActionsPanel.tsx:341`, mandated by a live requirement), and nothing at all (`SightingLog.tsx:70`). | **NEEDS A DECISION, reversible.** Recommend a single `—` as the absent form, with `Credit Balance Readout`'s explicit-unavailable indication preserved as a capability-level override (R10's last scenario). The roster's `?? 0` is a *lie* today — a fleet with no served roster reads "0t fuel", indistinguishable from a dry fleet — so changing it to absent is a behaviour improvement the delta should state, not smuggle. |
| **AMB-13** | **Thin space (U+2009) vs ordinary space before `t`.** | **RULABLE** from the scoping doc ("thin space before `t`"). `e2e/helpers/space-view.ts:397`'s `\s*` still matches; any test using a literal `' t'` string would not. |
| **AMB-14** | **The distance/range unit contradicts between the two design docs.** `system-hud.md` "Formatting" gives *two* examples — `13.9k` **and** `1,180 km`; `chain.md` gives only `13.9k`. The wire serves a bare number (`roster.estimatedRange: 833.25`) with no unit anywhere in the Go or TS types. Naming it `km` would invent physics the simulation does not have. | **NEEDS A DECISION, safe answer clear.** Recommend: magnitude suffix only, no named unit (R6's last scenario). Also unpinned: how far the suffix ladder runs — recommend k and M, since a system extent is O(10⁴–10⁵). **A genuine contradiction in the design input; record it as such rather than reading past it.** |
| **AMB-15** | **The duration form for a mine/scan countdown changes shape.** Both currently render `M:SS` (`2:03`); R2 renders `2m 3s`. `FleetActionsPanel.test.tsx:273` hedges (`/2:03\|123\|2 min/i`). | **RESOLVED by the rules table** — one duration format, cross-surface, is the whole point of RULING 2. Flag to the writer as a visible copy change to two countdowns so the adversary does not read it as an accident. |

**None is a hard stop.** AMB-14 is the only one touching a fact nobody in the repo has
(what unit range is measured in), and it has a safe answer requiring no such fact: don't
name a unit.

---

## 8. Out of scope (record in the proposal, deliberately)

- The galaxy view's own chrome; the galaxy clock's scale-1 projection defect (AMB-5) —
  recorded for a later change against `galaxy-view`.
- `MarketBoardPanel`'s figures, if AMB-10 rules (a).
- `SpaceStage`'s bearing/speed `toFixed` sites, if AMB-9 rules (a).
- Any layout, palette, type-scale, or panel-fill change; the vitals strip, the dock, the
  in-system list, the arc label (links 2a–4).
- Locale-aware or i18n formatting. Nothing in the design input asks for it, and `Intl`
  would make the fixture table environment-dependent, defeating R13's purity scenario.
- Any backend field, endpoint, or query. **Verified**: every figure the rules table names
  is served today, including the `T+` stamp (world-ms *is* elapsed-since-epoch,
  `backend/common/worldtime.go`) and the scale (`SystemSpaceRead.scale`, `Fleet.scale`).
  **No requirement in §2 needs a new served value.**

---

## 9. Task-count estimate and the pre-identified seam

**Estimate: 36–39 tasks.** In-band, but with no margin — and the estimate assumes AMB-9
rules (a) and AMB-10 rules (a). If either rules the other way, the link goes over 40.

| Group | Tasks |
|---|---|
| 1. `lib/format/` — 7 quantity functions + the absent-value rule + the `<Figure>` element | 9 |
| 2. Fixture table + the module's own suite (every §2 boundary scenario) | 4 |
| 3. Delete `lib/eta.ts`; collapse the two duplicated `countdown()` copies | 2 |
| 4. Apply: `SpaceCommandPanel` (arrival, Δv, fuel, ceiling, drift line split into four figures, toast copy) | 4 |
| 5. Apply: `FleetActionsPanel` (hold ×3, credits + live region, mine ETA, mine countdown, sell proceeds, refuel cost, reprice copy, upkeep rate) | 5 |
| 6. Apply: `FleetRoster` (ETA, fuel, range) + the scale prop + `GalaxyView`'s mount | 3 |
| 7. Apply: `ScanControl` (target durations, running countdown) and `SightingLog` (`asOf`) | 2 |
| 8. Apply: `SpaceStage` (`Arrives in`, ghost sr-only stamp) | 1 |
| 9. Test migration — 9 vitest files, 48 assertions | 5 |
| 10. Test migration — 5 e2e specs + 2 shared helpers, 16 sites | 2 |
| 11. R12 enforcement (the no-`toFixed` / no-local-formatter static check) | 1–2 |
| 12. Playwright journey (burn-preview walk, one assertion per formatted figure via its attribute) | 1 |
| 13. Validation sweep (`/check`, `--e2e`, reconcile) | 1 |

**The seam, if the panel finds it past 40:** split at the **`lib/eta.ts` dependency
boundary**, not at the module boundary.

- **`add-figure-formatting`** — the `figure-formatting` capability, the module, the
  fixture table, R12's enforcement, and the two things that *cannot* be deferred because
  `lib/eta.ts` dies with them: `FleetRoster` (+ the `GalaxyView` mount) and `SpaceStage`.
  Deltas: `fleet-roster` (2), `system-space-view` (the roster-adjacent duration clauses
  only). ≈22 tasks. Satisfies "delete what you replace in the same change" completely —
  `lib/eta.ts` and both its callers go together.
- **`apply-figure-formatting-to-panels`** — `SpaceCommandPanel`, `FleetActionsPanel`,
  `ScanControl`, `SightingLog`, and the two duplicated `countdown()` copies. Deltas:
  `system-space-view` (preview/commit/scan), `docked-fleet-actions` (6), `sighting-log`
  (1). ≈20 tasks.

Splitting the other way — module alone, then all applications — is worse: it would land a
`figure-formatting` capability with no consumer and leave `lib/eta.ts` alive across a
change boundary, which is exactly what the chain's burn-the-boats rule forbids.

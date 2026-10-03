# figure-formatting Specification

## Purpose
TBD - created by archiving change add-figure-formatting. Update Purpose after archive.
## Requirements
### Requirement: A Duration Between Two World Instants Is Presented in Wall-Clock Units at the Served Scale
The system SHALL present a duration derived from world-time stamps as the
real time the player will wait: the world-millisecond span divided by the
served world-clock scale. A duration formatter SHALL take the served scale
as an explicit, required argument and SHALL NOT default it to 1.

#### Scenario: A world-millisecond span at scale 1 reads as the same wall duration
- **WHEN** 252,000 world-ms are formatted at scale 1
- **THEN** the result reads `4m 12s`

#### Scenario: A time-warped world divides the span by its scale
- **WHEN** 252,000 world-ms are formatted at scale 60
- **THEN** the result reads `0m 4s`, not `4m 12s` — the span is divided
  before the unit pair is selected, and the divided result still takes the
  two-unit shape *A Duration Reads in Exactly Two Adjacent Units...* mandates

#### Scenario: A fractional scale multiplies the wait
- **WHEN** 60,000 world-ms are formatted at scale 0.5
- **THEN** the result reads `2m 0s`

#### Scenario: A missing scale does not default to 1
- **WHEN** a duration is requested with no scale argument
- **THEN** the call is rejected at the type level — the formatter's duration
  function has no overload accepting a call with the scale argument omitted

#### Scenario: A non-positive scale is refused, not divided by
- **WHEN** a scale of 0 or a negative scale is supplied
- **THEN** the formatter produces the absent-figure form (see *An Absent,
  Non-Finite, or Unsupplied Figure Reads as Explicitly Absent, Never as a
  Number*) rather than an infinity or a sign flip

### Requirement: A Duration Reads in Exactly Two Adjacent Units Chosen by Its Magnitude
The system SHALL present a wall duration as `Nm Ss` below one hour, `Nh Mm`
below one day, and `Nd Hh` at or beyond one day. Rounding SHALL be applied
once, to the smaller of the two rendered units, and SHALL never produce a
rendered value of 60 in that unit; when rounding would cross a unit
boundary, the duration SHALL reselect its unit pair from the rounded total
rather than rendering the overflow. A duration below one second SHALL round
to `0m 0s`.

#### Scenario: Under an hour reads minutes and seconds
- **WHEN** 252 seconds are formatted
- **THEN** the result reads `4m 12s`

#### Scenario: Under a day reads hours and minutes
- **WHEN** 12,300 seconds are formatted
- **THEN** the result reads `3h 25m`

#### Scenario: A day or more reads days and hours
- **WHEN** 187,200 seconds are formatted
- **THEN** the result reads `2d 4h`

#### Scenario: Exactly one minute
- **WHEN** 60 seconds are formatted
- **THEN** the result reads `1m 0s`, never `60s` and never `1m`

#### Scenario: Exactly one hour
- **WHEN** 3,600 seconds are formatted
- **THEN** the result reads `1h 0m`, never `60m 0s`

#### Scenario: Exactly one day
- **WHEN** 86,400 seconds are formatted
- **THEN** the result reads `1d 0h`, never `24h 0m`

#### Scenario: Sub-second durations round to zero
- **WHEN** 400 milliseconds are formatted
- **THEN** the result reads `0m 0s`

#### Scenario: A duration that crosses a unit boundary only after rounding
- **WHEN** 3,599,600 milliseconds (59m 59.6s) are formatted
- **THEN** the result reads `1h 0m`, never `59m 60s`

#### Scenario: A duration that rounds up across the day boundary reselects its unit pair
- **WHEN** 86,399,600 milliseconds are formatted
- **THEN** the result reads `1d 0h`, never `23h 60m`

### Requirement: A Relative Duration Names Its Direction, a Cost Duration Renders Bare, and a Due Duration Names That Explicitly
The system SHALL render a duration in one of two forms, and a surface SHALL
NOT choose freely between them. A **deadline** — a duration to or since an
instant, a position in time — takes a direction affix: prefixing a future
duration with `in`, suffixing a running order's remaining duration with
`left`, and suffixing a past duration with `ago`. A **magnitude** — how
long a thing costs or takes, quoted before it starts (a served sweep
duration, a previewed run's cost, any duration priced as an estimate rather
than counted down to an event) — renders **bare**, with no direction
affix. A deadline of zero or less SHALL present as the literal due form,
the text `now`, for both the `in` and `left` directions, rather than as a
zero or negative quantity; a duration rendered in an `ago` context renders
its positive magnitude with `ago` even when the underlying span is
negative. A negative span SHALL NOT render a minus sign, and a countdown
formatted from a negative span SHALL NOT grow more negative on a later
render. A surface whose own requirement mandates different copy for a
duration's due state — `system-space-view`'s running sweep, which is
required to show "settling" rather than counting below zero — overrides
this due form on that surface alone, the same override shape *An Absent,
Non-Finite, or Unsupplied Figure Reads as Explicitly Absent, Never as a
Number*'s last scenario uses for the credit balance.

#### Scenario: A future ETA reads "in"
- **WHEN** a future duration of 252 seconds is formatted as a countdown to
  an event
- **THEN** the result reads `in 4m 12s`

#### Scenario: A running order's remainder reads "left"
- **WHEN** a running order's remaining duration of 160 seconds is formatted
- **THEN** the result reads `2m 40s left`

#### Scenario: A past stamp reads "ago"
- **WHEN** a duration of 12,000 seconds since a past event is formatted
- **THEN** the result reads `3h 20m ago`

#### Scenario: A cost or estimate duration renders bare, with no direction affix
- **WHEN** a duration that is a cost or an estimate — a served sweep
  duration, a previewed mine-run duration — is formatted, rather than a
  countdown to or since an instant
- **THEN** the result reads the bare duration form, for example `4m 12s`,
  with no `in`, `left`, or `ago` affix

#### Scenario: Exactly zero is due, not a zero quantity
- **WHEN** a span of exactly 0 is formatted as a countdown
- **THEN** the result reads the literal due form, `now`, with no unit pair
  and no sign

#### Scenario: A negative span never renders a minus sign or a growing countdown
- **WHEN** a span of −1 millisecond or −900,000 milliseconds is formatted as
  a countdown
- **THEN** both render the identical due form, `now`, with no minus sign

#### Scenario: A negative span in an "ago" context is a positive magnitude
- **WHEN** a stamp 200,000 milliseconds in the past is formatted with the
  "ago" suffix
- **THEN** the result reads `3m 20s ago`, never `-3m 20s ago`

### Requirement: An Absolute World Instant Reads as `T+` From the Epoch With Its Served Scale
The system SHALL present an absolute world-time stamp as `T+ Dd HH:MM`
measured from the world epoch, with the served scale appended as `×N`, and
SHALL NOT divide an absolute stamp by the scale — the absolute stamp is
world time, the scale suffix states the rate that world time is running at,
and the two SHALL never be conflated. Hours and minutes SHALL be
zero-padded to two digits. Every rendered `T+` figure SHALL carry the
accessible label the scale suffix's own scenario below requires, not only
the call sites a later task list happens to name.

#### Scenario: A stamp renders days, hours and minutes with its scale
- **WHEN** 187,980,000 world-ms are formatted at scale 60
- **THEN** the result reads `T+ 2d 04:13 ×60`

#### Scenario: The absolute stamp is world time, not wall time
- **WHEN** the same world-ms stamp is formatted once at scale 1 and once at
  scale 60
- **THEN** both render the identical `T+ Dd HH:MM` figure, differing only in
  the `×N` suffix

#### Scenario: Hours and minutes are zero-padded
- **WHEN** a stamp at day 3, hour 4, minute 5 is formatted at scale 1
- **THEN** the result reads `T+ 3d 04:05 ×1`

#### Scenario: Zero
- **WHEN** 0 world-ms is formatted at scale 1
- **THEN** the result reads `T+ 0d 00:00 ×1`

#### Scenario: A scale of exactly 1 still renders its suffix
- **WHEN** a stamp is formatted at scale 1
- **THEN** the result still shows `×1`, so a reader never has to infer the
  scale

#### Scenario: Sub-minute stamps are not distinguished
- **WHEN** a stamp at 1,000 world-ms and a stamp at 40,000 world-ms are each
  formatted at scale 1
- **THEN** both read `T+ 0d 00:00 ×1` — the stamp is minute-resolution, so
  two instants inside one minute are not distinguished

#### Scenario: The scale suffix carries an accessible explanation
- **WHEN** an absolute `T+` stamp is rendered with its `×N` suffix
- **THEN** the element carries an accessible label or title stating that the
  world clock is running at N times real time, so the suffix's meaning does
  not depend on a player having read external documentation

### Requirement: A Tonnage Reads With One Decimal Below 100 and None At or Above, With a Thin Space Before Its Unit
The system SHALL present a tonnage with one decimal place when its
magnitude is below 100 and with no decimal place when its magnitude is at
or above 100 after rounding, followed by a thin space (U+2009) and `t`. A
tonnage that rounds up to 100 or more SHALL take the no-decimal form.

#### Scenario: Below 100 keeps one decimal
- **WHEN** 47.23519999999999 is formatted as a tonnage
- **THEN** the result reads `47.2 t`

#### Scenario: At or above 100 drops the decimal
- **WHEN** 153.4 is formatted as a tonnage
- **THEN** the result reads `153 t`

#### Scenario: Exactly 100
- **WHEN** 100 is formatted as a tonnage
- **THEN** the result reads `100 t`, with no decimal

#### Scenario: 99.95 rounds up across the threshold and takes the no-decimal form
- **WHEN** 99.95 is formatted as a tonnage
- **THEN** the result reads `100 t`, never `100.0 t` and never `99.9 t`

#### Scenario: 99.94 stays below the threshold
- **WHEN** 99.94 is formatted as a tonnage
- **THEN** the result reads `99.9 t`

#### Scenario: Zero
- **WHEN** 0 is formatted as a tonnage
- **THEN** the result reads `0.0 t`

#### Scenario: A whole number below 100 still shows its decimal
- **WHEN** 6 is formatted as a tonnage
- **THEN** the result reads `6.0 t`

#### Scenario: The unit is separated by a thin space
- **WHEN** any tonnage is formatted
- **THEN** the character between the number and `t` is U+2009 (thin space),
  not U+0020 (ordinary space)

#### Scenario: A negative tonnage
- **WHEN** −5.2 is formatted as a tonnage
- **THEN** the sign is preserved and the same magnitude-based rounding rule
  applies

### Requirement: A Range or Distance Reads to Three Significant Figures With a Magnitude Suffix and No Unit Name
The system SHALL present a range or distance to three significant figures,
with a magnitude suffix of `k` (thousands) or `M` (millions) applied once
the magnitude reaches that threshold, and with no unit name — no served
field on the wire names a distance unit, so this rule renders none.

#### Scenario: Thousands take the suffix
- **WHEN** 13,944.775743999995 is formatted as a range
- **THEN** the result reads `13.9k`

#### Scenario: Below the first magnitude reads bare
- **WHEN** 833.25 is formatted as a range
- **THEN** the result reads `833`

#### Scenario: Significant figures, not decimal places
- **WHEN** 1 and 12.3456 are each formatted as a range
- **THEN** the results read `1.00` and `12.3` respectively

#### Scenario: Three-significant-figure carry crosses a magnitude
- **WHEN** 999.5 is formatted as a range
- **THEN** the result reads `1.00k`, never `1000` and never `999.5`

#### Scenario: Exactly at a magnitude
- **WHEN** 1000 is formatted as a range
- **THEN** the result reads `1.00k`

#### Scenario: Millions
- **WHEN** 1,234,567 is formatted as a range
- **THEN** the result reads `1.23M`

#### Scenario: Zero
- **WHEN** 0 is formatted as a range
- **THEN** the result reads `0.00`

#### Scenario: No unit is named
- **WHEN** any range or distance is formatted
- **THEN** the rendered figure carries a magnitude suffix (or none, below
  the first threshold) and no distance unit name of any kind

### Requirement: A Delta-V Reads as Integer Metres Per Second
The system SHALL present a delta-v figure as an integer number of metres
per second, rounded to the nearest integer with ties rounding away from
zero, followed by ` m/s`. A delta-v of 1,000 or more SHALL render with a
thousands separator.

#### Scenario: A fractional delta-v rounds to an integer
- **WHEN** 269.4 is formatted as a delta-v
- **THEN** the result reads `269 m/s`

#### Scenario: A half rounds to nearest, away from zero
- **WHEN** 268.5 is formatted as a delta-v
- **THEN** the result reads `269 m/s`

#### Scenario: A large delta-v takes a thousands separator
- **WHEN** 3721.2 is formatted as a delta-v
- **THEN** the result reads `3,721 m/s`

#### Scenario: Zero
- **WHEN** 0 is formatted as a delta-v
- **THEN** the result reads `0 m/s`

### Requirement: A Credit Figure Reads With the Currency Glyph and Thousands Separators
The system SHALL present a credit figure as an integer preceded by the `₡`
glyph and a space, with thousands separators, and SHALL NEVER render a
decimal place — credits are an `int64` on the wire and a rendered decimal
would assert a precision the ledger does not carry.

#### Scenario: A four-figure balance
- **WHEN** 1000 is formatted as a credit figure
- **THEN** the result reads `₡ 1,000`

#### Scenario: Below a thousand
- **WHEN** 28 is formatted as a credit figure
- **THEN** the result reads `₡ 28`

#### Scenario: Zero is a figure, never the absent form
- **WHEN** 0 is formatted as a credit figure
- **THEN** the result reads `₡ 0`, distinct from the absent form, since a
  zero balance is a fact and an unavailable one is not

#### Scenario: A negative balance
- **WHEN** −50 is formatted as a credit figure
- **THEN** the result reads `₡ -50`, with the sign rendered

#### Scenario: Credits are integers and never gain a decimal
- **WHEN** 1250 is formatted as a credit figure
- **THEN** the result reads `₡ 1,250`, with no decimal place

### Requirement: A Rate Reads Per the Wall-Clock Time Unit the Player Waits In
The system SHALL present a rate in tons per a wall-clock time unit chosen by
walking the ladder second → minute → hour and stopping at the first unit in
which the converted magnitude is at least 1; when no unit on the ladder
reaches 1, the rate SHALL render per hour. A rate formatter SHALL take the
served scale as an explicit, required argument and SHALL convert a served
world-time denominator (tons per world-millisecond, or tons per world-second)
to the equivalent wall-clock-per-second rate at that scale before selecting
the display unit. A zero rate SHALL render as `0.0 t/h`. A rate is rendered
with one decimal place.

#### Scenario: A rate legible per minute reads per minute
- **WHEN** a wall-clock rate of 0.04 t/s is formatted (at scale 1)
- **THEN** the result reads `2.4 t/min`

#### Scenario: A rate too small per minute falls to per hour
- **WHEN** a wall-clock rate of 0.0001 t/s is formatted (at scale 1) — too
  small to reach 1 t/min (0.006 t/min)
- **THEN** the result reads `0.4 t/h`

#### Scenario: The unit flips at its stated threshold
- **WHEN** a rate whose per-second magnitude is 0.9 and a rate whose
  per-second magnitude is 1.0 are each formatted
- **THEN** the first renders in `t/min` (its per-second magnitude never
  reached 1, its per-minute magnitude did) and the second renders in `t/s`,
  since the walk stops at the first unit to reach 1 and never continues to a
  larger one

#### Scenario: A world-per-millisecond rate is converted
- **WHEN** `roster.miningRate` of 0.001 tons per world-millisecond is
  formatted at scale 1
- **THEN** the result reads `1.0 t/s` — 0.001 × 1,000 × 1 = 1.0 t/s, and the
  walk stops at the first unit whose magnitude reaches 1, which is the
  per-second rung itself

#### Scenario: A world-per-second rate is converted
- **WHEN** `roster.stationKeepRateTonsPerSecond` of 0.02 is formatted at
  scale 1
- **THEN** the result reads `1.2 t/min`

#### Scenario: A time-warped world converts the denominator in the same direction as a duration
- **WHEN** `roster.miningRate` of 0.001 tons per world-millisecond is
  formatted at scale 60
- **THEN** the result reads `60.0 t/s` — sixty world-milliseconds pass per
  wall-millisecond, so the player sees sixty times the tonnage per second of
  their own life, never one sixtieth of it

#### Scenario: A zero rate
- **WHEN** a rate of 0 is formatted
- **THEN** the result reads `0.0 t/h`

#### Scenario: A rate too small to show at one decimal is not shown as a true zero
- **WHEN** a wall-clock rate of 0.00001 t/s is formatted (at scale 1) — a
  strictly positive rate whose per-hour magnitude, 0.036 t/h, rounds to
  `0.0` at one decimal
- **THEN** the result reads `<0.1 t/h`, distinguishably from the identical
  `0.0 t/h` text a genuinely zero rate renders

#### Scenario: A negative rate reads as the absent form
- **WHEN** a rate less than 0 is formatted
- **THEN** the result is the absent figure form, not a signed rate

### Requirement: An Absent, Non-Finite, or Unsupplied Figure Reads as Explicitly Absent, Never as a Number
The system SHALL present `undefined`, `null`, `NaN`, and any non-finite
value as a single explicit absent form, `—`, and SHALL NOT substitute zero,
an empty string, or a raw `NaN`. Zero SHALL always render as a zero figure
in its quantity's own format, distinguishable from the absent form.

#### Scenario: Undefined
- **WHEN** `undefined` is formatted as any quantity
- **THEN** the result is `—`

#### Scenario: NaN
- **WHEN** `NaN` is formatted as any quantity
- **THEN** the result is `—`, never the string `NaN`

#### Scenario: Infinity
- **WHEN** `Infinity` or `-Infinity` is formatted as any quantity
- **THEN** the result is `—`

#### Scenario: Zero is not absent
- **WHEN** 0 is formatted as a tonnage, a delta-v, or a range
- **THEN** it renders as that quantity's own zero figure, distinguishable
  from `—`

#### Scenario: The absent form does not override a capability's own unavailable copy
- **WHEN** a credit balance is supplied as `null` to a surface whose own
  requirement mandates an explicit unavailable indication (`system-console`'s
  *The Credits Cell Shows the Corporation's Served Balance and Announces Its
  Changes*)
- **THEN** that surface's own mandated unavailable copy is shown, not the
  generic `—`

### Requirement: A Figure Whose Clock Scale Has Not Been Served Reads as Absent
WHEN a mounting view has not received a served world-clock scale, every
figure whose presentation *value* depends on that scale — a relative
duration (including its due form) and a rate — SHALL render the absent
form rather than being computed at an assumed scale of 1, and SHALL still
carry its `data-raw`, since the value is known and only the scale is not.
The duration formatter and the rate formatter each take the scale as a
required argument (*A Duration Between Two World Instants Is Presented in
Wall-Clock Units at the Served Scale*, *A Rate Reads Per the Wall-Clock Time
Unit the Player Waits In*); a call site holding no served scale for such a
figure SHALL NOT call the formatter with an assumed scale of 1, and SHALL
render the absent form directly instead. This rule binds every mounting
view and every consuming surface, not only the one surface whose own
scenario names it.

An absolute world-time stamp is different: its `T+ Dd HH:MM` portion is
world time and needs no scale at all, so it SHALL still render whenever the
instant is a finite number, even with no served scale. Only its `×N` suffix
depends on the scale; WHEN no scale has been served, the suffix SHALL
render as the absent form in place of the multiplier, `×—`, rather than
defaulting to `×1` or being omitted.

IF the surface's own requirement mandates that the figure be shown, THEN
the absent form (or, for a stamp, the absent suffix) is what it shows.

#### Scenario: A duration with no served scale renders absent, not at scale 1
- **WHEN** a duration is presented on a mounting view that has not received a
  served world-clock scale
- **THEN** the figure renders the absent form (`—`), never a duration
  computed by assuming a scale of 1, and still carries its `data-raw`

#### Scenario: A rate with no served scale renders absent, not at scale 1
- **WHEN** a rate is presented on a mounting view that has not received a
  served world-clock scale
- **THEN** the figure renders the absent form (`—`), never a rate computed
  by assuming a scale of 1, and still carries its `data-raw`

#### Scenario: An absolute stamp with no served scale still renders its world-time portion, with an absent suffix
- **WHEN** an absolute `T+` stamp is presented on a mounting view that has
  not received a served world-clock scale
- **THEN** the stamp's `T+ Dd HH:MM` portion renders as usual and its scale
  suffix renders as `×—`, never `×1` and never an omitted suffix

### Requirement: Every Formatted Figure Carries Its Raw Served Value on a Data Attribute
The system SHALL render each player-facing figure as its own element
carrying two attributes: `data-raw`, the unformatted numeric value it was
formatted from, serialized as `String(value)` at full double precision and
never re-rounded to the display value; and `data-unit`, naming the quantity
and, for a duration or a rate, which clock the raw value is measured in (for
example `world-ms-span-in`, `tons-per-world-ms`). The `data-unit` values
SHALL be a closed set defined once by the presentation module, and a
duration's span and an absolute instant SHALL NOT share a token — a reader
of the attribute must be able to tell a wall-clock span from a world-time
instant without reading the copy. A duration's token SHALL further name
which of *A Relative Duration Names Its Direction, a Cost Duration Renders
Bare, and a Due Duration Names That Explicitly*'s direction forms the
element's text claims — `world-ms-span-in`, `world-ms-span-left`,
`world-ms-span-ago`, or `world-ms-span-bare` — so that `(raw, scale, token)`
determines the element's expected text as a total function; the call site
chooses the token from its own known form, never by inspecting the raw
value. A copy line containing more than one figure SHALL wrap each figure in
its own element, each carrying its own pair of attributes; an element whose
content model forbids a nested element and which contains exactly one
figure carries the pair itself rather than being split. A duration's raw
value SHALL be its unscaled world-millisecond span, so a test can assert
against the served stamp arithmetic without reading the scale. `data-raw`
SHALL be present whenever the raw value is a finite number, whatever the
rendered text turned out to be — a due figure (a span of zero or less) and
a figure rendered absent for want of a served scale both carry their raw
value, since presence follows the value, never the text.

#### Scenario: A formatted tonnage carries its raw value
- **WHEN** 47.23519999999999 t is rendered
- **THEN** the element's `data-raw` attribute is `47.23519999999999` while
  its text is `47.2 t`

#### Scenario: A composite line carries one raw value per figure
- **WHEN** a line renders an actual delta-v, an actual arrival, a previewed
  delta-v, and a previewed arrival together
- **THEN** four elements are rendered, each carrying its own `data-raw` and
  `data-unit` pair

#### Scenario: The raw value is the wire figure, not the display figure
- **WHEN** any figure is rendered
- **THEN** the `data-raw` attribute is the unrounded value handed to the
  formatter, not the rounded display value

#### Scenario: A figure with no numeric value carries no raw attribute
- **WHEN** a figure whose value is `undefined`, `null`, `NaN`, or non-finite
  is rendered
- **THEN** the element carries no `data-raw` attribute — never `NaN`, never
  `0`, never an empty string

#### Scenario: A figure carries its raw value whenever that value is a number, whatever the rendered text
- **WHEN** a figure renders as the due form (a span of zero or less), or as
  the absent form because no scale has been served for it, or as the absent
  form because its value is a negative rate or its served scale is
  non-positive
- **THEN** the element still carries `data-raw`, because the raw value is a
  finite number in every case — presence of the attribute follows the value,
  never the rendered text, so a test can assert a countdown has run out by
  reading a non-positive raw

#### Scenario: An element that cannot hold a nested figure carries the pair itself
- **WHEN** a figure is rendered inside an element whose content model
  forbids a nested element — a select's `option` being the case in play —
  and that element contains exactly one figure
- **THEN** that element itself carries the `data-raw` and `data-unit` pair,
  and the requirement's own-element rule is satisfied; an element containing
  more than one figure is still split, since a single pair could not say
  which figure it described

#### Scenario: A duration's raw value is its unscaled world-millisecond span, tagged by its direction form
- **WHEN** a duration is rendered
- **THEN** its `data-raw` is the unscaled world-millisecond span handed to
  the formatter, and its `data-unit` is the span token matching its
  rendered direction form — `world-ms-span-in`, `world-ms-span-left`,
  `world-ms-span-ago`, or `world-ms-span-bare` — each distinct from
  `world-ms-instant`, the token an absolute stamp's `data-unit` carries

#### Scenario: A figure rendered into a toast or an aria-label carries no attribute
- **WHEN** a figure is rendered into a toast message or an `aria-label`
  string rather than as its own DOM element
- **THEN** the string uses the same formatter but carries no `data-raw` or
  `data-unit` attribute — the attribute contract binds rendered figure
  elements, not string-only surfaces

### Requirement: A Player-Facing Figure Is Produced Only By the Shared Formatter
The system SHALL render every player-facing numeric figure of a quantity
this capability defines through the shared presentation module, and SHALL
NOT let any other mechanism produce the string a player reads for such a
figure — whether a call-site rounding function, a component-local duration
formatter, or a raw or locally-derived number interpolated into a template
string and handed to the shared element as pre-formatted text. The rule
binds by what produced the string, not by which function's name did it: a
requirement stated as a list of banned function names is one any new
spelling evades.

#### Scenario: No component-local decimal rounding
- **WHEN** the space and fleet component trees are inspected
- **THEN** no component calls `toFixed` on a player-facing figure of a
  quantity this capability defines

#### Scenario: No component-local duration formatter
- **WHEN** the space and fleet component trees are inspected
- **THEN** no component defines its own `countdown`, `formatEta`, or
  equivalent duration-formatting function

#### Scenario: The retired module is gone
- **WHEN** the repository is inspected
- **THEN** `frontend/lib/eta.ts` does not exist and nothing imports it

#### Scenario: A raw wire number does not reach copy
- **WHEN** a burn commits successfully
- **THEN** the success toast names the arrival as a formatted duration
  produced by the shared module, not as an interpolated world-millisecond
  integer

#### Scenario: A pre-formatted string handed to the shared element is still non-compliant
- **WHEN** a call site builds player-facing text by interpolating a raw or
  locally-derived number into a template string and passes that string to
  the shared element as pre-formatted text
- **THEN** that call site does not satisfy this requirement — a wire number
  reaching copy through string interpolation is the same violation as
  calling a rounding function or defining a local formatter, whatever
  mechanism produced the string

#### Scenario: A rendered figure's text is the module's own output for its raw value
- **WHEN** any element carrying `data-raw` and `data-unit` is rendered — a
  duration's `data-unit` naming, via its four-way token, which direction
  form (*A Relative Duration Names Its Direction, a Cost Duration Renders
  Bare, and a Due Duration Names That Explicitly*) the element claims
- **THEN** the shared module's output for that element's `(data-raw, scale,
  data-unit)` — including, for a duration, the direction form its token
  names — appears in the element's text content as a complete numeric
  token: a maximal run of digits together with any decimal point, thousands
  separator, or magnitude suffix bound to it, not immediately preceded or
  followed by a digit, decimal point, or separator that would make it a
  fragment of a longer number
- **AND** the element's text contains no complete numeric token equal to a
  full-precision rendering of that element's own `data-raw`, except the
  token matched by the previous clause — so an element that legitimately
  labels its figure with surrounding prose carrying its own digits (a
  select's `option`'s host id, a screen-reader-only label's fixed copy)
  passes, a range's three-significant-figure output is not satisfied by a
  raw wire float that merely starts with the same digits, and an element
  whose figure text was produced by any other means, including handing the
  shared element a pre-built string, cannot pass either clause
- **AND** an element rendering the absent form because no scale has been
  served for it satisfies this scenario by rendering exactly
  `figure-formatting`'s absent form for that quantity, the module having
  correctly not been called with an assumed scale — no element carrying the
  `data-raw`/`data-unit` pair is exempt from this scenario

#### Scenario: The rounding exception list holds only quantities this capability does not define
- **WHEN** the enforcement suite's exception list is inspected
- **THEN** every entry is a figure of a quantity this capability defines no
  rule for, or a non-player-facing value, each recorded with the ruling or
  requirement that permits it — an exception naming a tonnage, duration,
  range, delta-v, credit, rate, or stamp is itself a violation

### Requirement: The Formatter Is Pure Presentation and Derives No Rule-Bearing Value
The presentation module SHALL be a pure function of its arguments — the
same arguments SHALL produce the same string in every process, with no
module-level singleton, no clock read, and no locale detection — and SHALL
NOT compute affordability, a shortfall, a settlement fold, a price, a
flight time, or any rounding a served wire value already encodes. It SHALL
NOT import `lib/market` or `lib/space`, the two modules whose computations
are rule-bearing and Go-sole-authority. Every rule this capability defines
SHALL be pinned by a fixture table of `(raw, scale, expected)` rows, rather
than by hand-written per-case assertions alone.

#### Scenario: No rule-bearing computation
- **WHEN** the module's exported functions are inspected
- **THEN** none computes affordability, a shortfall, proceeds, or a flight
  time; every such value arrives on the wire or from an existing named
  client computation, already computed, before it is handed to the
  formatter

#### Scenario: The module names no ambient source
- **WHEN** the presentation module's source is inspected
- **THEN** it names none of `Date`, `performance`, `Math.random`, `Intl`, or
  `toLocaleString`, so its output cannot vary with the clock, the machine,
  or the ambient locale

#### Scenario: The module imports no wire-rule module
- **WHEN** the module's imports are inspected
- **THEN** it imports neither `lib/market` nor `lib/space`

#### Scenario: The formatter is pinned by a fixture table
- **WHEN** the module's test suite is inspected
- **THEN** every rounding, unit-selection, and boundary rule above is
  asserted against a recorded table of `(raw, scale, expected)` rows


# add-figure-formatting — architect panel report

Reviewer: `openspec-architect`, link 1 of `docs/plans/system-hud/chain.md`,
`/team --chain --full-auto`. Read against the analysis, the fifteen rulings,
`docs/plans/system-hud/chain.md`, `docs/plans/system-hud.md`,
`frontend/CLAUDE.md`, and the live code at every site the change names.

**I edited `design.md` only.** Every spec finding below is paste-ready text
for the spec writer; I authored none of it into a delta.

**No ruling was authored against.** Findings 10 and 11 report consequences of
ruled decisions and are flagged, not overridden.

## Index

| # | Severity | Finding |
|---|---|---|
| 1 | BLOCKER | R9's rate unit-selection rule says "largest ... unit", which reads as "always `t/h`" and contradicts both worked examples |
| 2 | BLOCKER | The rate conversion's *direction* is unpinned — every R9 scenario is at scale 1, so no fixture row can distinguish `× scale` from `÷ scale` |
| 3 | BLOCKER | R11 is unsatisfiable on `scan-target-select`: an `<option>` cannot hold a nested figure element |
| 4 | BLOCKER | `data-raw` presence is tied to the rendered text, not to the value — which makes task 10.2's `data-raw <= 0` migration unimplementable and leaves the 900-second-timeout trap alive |
| 5 | MAJOR | design.md's original `/check` validator rejects this change's own files (RULING 10's `SpaceStage` sites, `webgl/SpaceWorld.tsx`'s memo key). Fixed in design.md; tasks.md 11.1 must be reworded |
| 6 | MAJOR | RULING 8 (no served scale ⇒ absent form) has no acceptance test anywhere in the change; `SystemSpaceView.tsx:405`'s `?? 1` will silently defeat it |
| 7 | MAJOR | "carries its raw served value" is factually wrong for every countdown — those raws are client-derived spans, one of them (`mine-eta-preview`) never served at all |
| 8 | MAJOR | `data-unit` has no closed vocabulary, and the analysis's own suggestion gives a duration and an absolute stamp the same `world-ms` token |
| 9 | MAJOR | Task 10.1's "single point of change" is false: `hold-capacity` and `hold-{kind}` are composite elements whose testids will not carry `data-raw` after the R11 split |
| 10 | MINOR | R4 puts the `×N` scale suffix on every sighting-log row (`×1` twenty times); flagged, not authored around |
| 11 | MINOR | R1's type-level scenario and R13's "two separate processes" scenario are unobservable as written; mechanisms now recorded in design.md |
| 12 | MINOR | `Intl`/`toLocaleString` is the obvious implementation of R7/R8's thousands separator and would break R13's purity per-environment |
| 13 | MINOR | `SystemSpaceView`'s clock keeps a second `?? 1` — a second instance of the recorded galaxy-clock defect, to append rather than re-file |

Answers to the five commissioned questions are at the end.

---

## 1. BLOCKER — R9's unit-selection rule contradicts itself and both worked examples

**Where.** `openspec/changes/add-figure-formatting/specs/figure-formatting/spec.md:280-283`:

> The system SHALL present a rate in tons per the largest wall-clock time
> unit — second, then minute, then hour — in which the converted magnitude is
> at least 1, falling to hour when the magnitude never reaches 1 at any
> smaller unit.

**Why it is wrong.** "Largest unit in which the magnitude is at least 1"
selects `t/h` for *every* rate above 1 t/h. A rate of 2 t/s is 120 t/min and
7,200 t/h; hour is the largest unit and 7,200 ≥ 1, so the literal reading
renders `7200.0 t/h`. That contradicts the requirement's own first scenario
(0.04 t/s → `2.4 t/min`, where `144 t/h` also clears 1) and RULING 4's stated
intent. The correct rule is a **walk**: try second, then minute, then hour,
and stop at the first unit whose magnitude reaches 1.

Two implementers reading this sentence will write two different functions,
and the fixture table as specced does not catch it: the only two magnitudes
pinned (`2.4 t/min`, `0.4 t/h`) happen to be the first-reaching unit *and*
land on different rungs, so a "largest" implementation fails the first case
only — which is enough to catch it in test but not enough to tell the
implementer what to write.

**Paste-ready replacement for the requirement's first sentence** (rest of the
requirement unchanged):

```
The system SHALL present a rate in tons per a wall-clock time unit chosen by
walking the ladder second → minute → hour and stopping at the first unit in
which the converted magnitude is at least 1; when no unit on the ladder
reaches 1, the rate SHALL render per hour. A rate formatter SHALL take the
served scale as an explicit, required argument and SHALL convert a served
world-time denominator (tons per world-millisecond, or tons per world-second)
to the equivalent wall-clock-per-second rate at that scale before selecting
the display unit. A zero rate SHALL render as `0.0 t/h`. A rate is rendered
with one decimal place.
```

**Paste-ready replacement for the `The unit flips at its stated threshold` scenario**
(keep the heading verbatim — it is an ADDED capability, but the heading is
already referenced in tasks and the analysis):

```
#### Scenario: The unit flips at its stated threshold
- **WHEN** a rate whose per-second magnitude is 0.9 and a rate whose
  per-second magnitude is 1.0 are each formatted
- **THEN** the first renders in `t/min` (its per-second magnitude never
  reached 1, its per-minute magnitude did) and the second renders in `t/s`,
  since the walk stops at the first unit to reach 1 and never continues to a
  larger one
```

## 2. BLOCKER — the rate conversion's direction is unpinned

**Where.** Every scenario under *A Rate Reads Per the Wall-Clock Time Unit the
Player Waits In* (`figure-formatting/spec.md:291-321`) is stated at scale 1,
where `× scale` and `÷ scale` are indistinguishable. RULING 3 is the *only*
ruling in this change that introduces a new conversion, and the fixture table
that is supposed to pin it cannot.

**The correct direction is multiplication.** One wall-second holds
`1000 × scale` world-milliseconds, so
`tonsPerWallSecond = tonsPerWorldMs × 1000 × scale` and
`tonsPerWallSecond = tonsPerWorldSecond × scale`. A ×60 world mines sixty
times as much per second of the player's life — the same direction RULING 1
sends durations. design.md now states the identity; the spec must pin it with
a row, or the fixture table certifies nothing.

**Paste-ready scenario** (insert after *A world-per-second rate is converted*):

```
#### Scenario: A time-warped world converts the denominator in the same direction as a duration
- **WHEN** `roster.miningRate` of 0.001 tons per world-millisecond is
  formatted at scale 60
- **THEN** the result reads `60.0 t/s` — sixty world-milliseconds pass per
  wall-millisecond, so the player sees sixty times the tonnage per second of
  their own life, never one sixtieth of it
```

That row is also the only one in the capability that exercises the `t/s` rung
of the ladder; without it, finding 1's walk has no positive test.

## 3. BLOCKER — R11 is unsatisfiable inside `<option>`

**Where.** `frontend/components/space/ScanControl.tsx:288-292`:

```tsx
{targets.map((t) => (
  <option key={t.hostId} value={t.hostId}>
    {t.kind} · {t.hostId} · {countdown(t.durationMs)}
  </option>
))}
```

`system-space-view/spec.md:185` amends this surface to "each showing its
served sweep duration presented per `figure-formatting`", and R11 requires
each figure to be "its own element carrying two attributes". An `<option>`'s
HTML content model is text: a nested `<span>` is invalid, is ignored by
native select rendering, and React treats non-string `<option>` children as a
mistake. Task 7.1 as written is not implementable against R11 as written, and
the likeliest silent outcome is an implementer dropping the attribute on this
surface with no spec saying they may.

**Resolution: put the pair on the `<option>` itself.** The option contains
exactly one figure, so there is no ambiguity about which figure the attribute
describes, and the option's `value` stays the host id — which matters,
because `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` performs
eight `selectOptions(…, HOST_ID)` calls that must keep working.

**Paste-ready scenario for R11** (*Every Formatted Figure Carries Its Raw
Served Value on a Data Attribute*):

```
#### Scenario: An element that cannot hold a nested figure carries the pair itself
- **WHEN** a figure is rendered inside an element whose content model forbids
  a nested element — a select's `option` being the case in play — and that
  element contains exactly one figure
- **THEN** that element itself carries the `data-raw` and `data-unit` pair,
  and the requirement's own-element rule is satisfied; an element containing
  more than one figure is still split, since a single pair could not say
  which figure it described
```

## 4. BLOCKER — `data-raw` presence is bound to the rendered text instead of to the value

**Where.** R11's scenario *An absent figure carries no raw attribute*
(`figure-formatting/spec.md:381-383`) omits `data-raw` for an absent figure,
while R3 renders a span of ≤ 0 as the due form and RULING 8 renders a
scale-starved figure as the absent form. Nothing in the spec says whether a
*due* figure or a *scale-starved* figure keeps its raw.

**Why it is a blocker.** tasks.md 10.2 replaces
`scan-lane-transit-fizzle.spec.ts:231-233`'s literal `'now'` assertion with a
`data-raw <= 0` check — the analysis's own recommendation, and the guard
against that spec hanging to its 900-second timeout. That assertion is only
possible if a due figure still carries its span. An implementer reading R11
literally ("absent figure ⇒ no attribute") plus R3 ("≤ 0 renders the due
form") can reasonably conclude the due form is an absent form and omit the
attribute — at which point the very trap the task exists to remove reappears
in a new shape, this time inside the change that claimed to fix it.

The same holds for RULING 8's case: the *value* is known, only the scale is
missing, so the raw is available and should be exposed.

**Paste-ready replacement for that scenario, plus one addition:**

```
#### Scenario: An absent figure carries no raw attribute
- **WHEN** a figure whose value is `undefined`, `null`, `NaN`, or non-finite
  is rendered
- **THEN** the element carries no `data-raw` attribute — never `NaN`, never
  `0`, never an empty string

#### Scenario: A figure carries its raw value whenever that value is a number, whatever the rendered text
- **WHEN** a figure renders as the due form (a span of zero or less), or as
  the absent form because no scale has been served for it
- **THEN** the element still carries `data-raw`, because the raw value is a
  finite number in both cases — presence of the attribute follows the value,
  never the rendered text, so a test can assert a countdown has run out by
  reading a non-positive raw
```

## 5. MAJOR — the `/check` validator as originally designed rejects this change's own files

**Where (before my edit).** design.md's *Decision: R12's "no `toFixed`" rule
is enforced by a `/check` changed-file validator*: "A new validator checks
that no changed `.tsx` file under `frontend/components/{space,fleet}/` calls
`.toFixed(` or defines a local function named `countdown`/`formatEta`."

**Two live false positives, one of them mandatory:**

- `frontend/components/space/SpaceStage.tsx:663, 664, 709, 710, 828` —
  bearing and speed, which **RULING 10 requires to keep their `toFixed`**.
  `SpaceStage.tsx` is edited by task 8.1, so it is a changed file in this very
  change: the validator would fail the change that introduces it.
- `frontend/components/space/webgl/SpaceWorld.tsx:195` —
  `${e.radius.toFixed(4)}` builds a memo key, not a player-facing figure.

**Also a scope mismatch:** R12's scenario is "*WHEN the space and fleet
component trees are inspected*", a whole-tree property. A changed-file
validator sees only what a commit touches, so the shipped check is
permanently narrower than the requirement it enforces.

**I changed design.md** to a single whole-tree static-analysis vitest suite
(`frontend/lib/format/guards.test.ts`) on the `anti-mirror-guard.test.ts`
precedent, holding a two-entry `KNOWN_EXCEPTIONS` list that is itself asserted
to still exist (anti-vacuity). See Q4 below for the full reasoning; the
per-commit argument for the `/check` validator is not a differentiator, since
`.claude/scripts/check.sh:98` runs the whole vitest suite and no changed-file
validator is wired as an edit-time hook in `.claude/settings.json`.

**tasks.md 11.1 must be reworded to match.** Paste-ready:

```
- [ ] 11.1 `frontend/lib/format/guards.test.ts` — one whole-tree static
      assertion covering R12 and R13: no `.toFixed(` under
      `components/space/**` or `components/fleet/**` outside a two-entry
      reviewed exception list (`SpaceStage`'s bearing/speed per RULING 10;
      `webgl/SpaceWorld.tsx`'s memo key), no component-local
      `countdown`/`formatEta`, `lib/eta.ts` absent and unimported,
      `lib/format/**` importing neither `lib/market` nor `lib/space` nor
      `react`, and naming no ambient source (`Date`, `performance`,
      `Math.random`, `Intl`, `toLocaleString`). Each exception is asserted to
      still exist, so the list fails loudly when its site is removed
```

This also subsumes tasks 2.3 and 2.4 (the import guard and the purity test),
which frees two task slots — see the sequencing answer.

## 6. MAJOR — RULING 8 has no acceptance test, and one live `?? 1` will defeat it

**Where.** `frontend/components/space/SystemSpaceView.tsx:405`:

```ts
const servedScale = interior.data?.scale ?? acting?.scale ?? allFleets[0]?.scale ?? 1
```

RULING 8 says a mounting view with no served scale renders the duration
absent, never at an assumed 1. No requirement in any delta states that, and no
scenario tests it. `figure-formatting` R1 covers a *non-positive* scale, not a
*missing* one — and RULING 8 is deliberately a **caller-side** rule, so the
formatter's own requirement cannot carry it.

Two consequences:

1. There is nothing for the SDET to write, so the rule ships untested.
2. The nearest existing code already contains the forbidden default, and it
   is load-bearing for `useWorldTime` — an implementer will reuse
   `servedScale` because it is right there, and RULING 8 evaporates with no
   test to notice.

design.md now carries the resolution (a single un-defaulted
`servedScale: number | undefined` for figures; `servedScale ?? 1` kept at the
one `useWorldTime` line so the drawn picture is unchanged). The spec still
needs the behaviour. `fleet-roster` is the right home — the galaxy mount is
the one mount that can genuinely lack a scale.

**Paste-ready scenario for `fleet-roster`'s *One Row Per Owned Fleet, Derived
From Kinematic State*** (append; keep all eight existing scenarios verbatim):

```
#### Scenario: A countdown with no served scale reads as absent, never at an assumed scale of 1

- **WHEN** a row's mounting view has served no world-clock scale for the
  fleet, and that fleet's current order has a completion time
- **THEN** the countdown shows `figure-formatting`'s absent form rather than
  a duration computed at an assumed scale of 1, and the row's other content
  is unaffected
```

## 7. MAJOR — "carries its raw served value" is wrong for every countdown

**Where.** The phrase is used for countdowns in at least:

- `fleet-roster/spec.md:15` — the row countdown; its raw is
  `status.remainingMs`, derived from a served ETA and the **client-projected**
  world time.
- `system-space-view/spec.md:256-257, 279` — the running-sweep countdown,
  explicitly "measured against **this view's projected world time**".
- `docked-fleet-actions/spec.md:9-11` — the mine ETA preview, whose value is
  `tonnage ÷ servedMiningRate`, **computed on the client and never served at
  all**.

R11 says a duration's raw is "its unscaled world-millisecond span", which is
the right choice (it makes `data-raw <= 0` the portable due assertion). But
the consuming deltas call that span a "served value", which is inaccurate and
actively misleading: an implementer reading "raw served value" on a countdown
will put the served **ETA stamp** in `data-raw` — a defensible reading of
those words — and task 10.2's `<= 0` assertion silently becomes an assertion
that a world-millisecond stamp is negative, which never fires.

**Paste-ready wording, applied at each of the four sites** — replace "and
carries its raw served value" (or "carrying its raw served value") with:

```
and carries its raw remaining span in unscaled world-milliseconds
```

and in `docked-fleet-actions`'s *Mine ETA Preview* specifically:

```
The previewed duration and the committed countdown are each presented per
`figure-formatting` as a relative duration at the mounting view's served
scale, and each carries its raw span in unscaled world-milliseconds — the
preview's span being the client-side tonnage-over-rate figure this
requirement already defines, the committed countdown's being the remainder
to the action's served ETA.
```

Tonnage, credit, range, delta-v and rate figures keep "raw served value" —
for those it is exactly right.

## 8. MAJOR — `data-unit` has no closed vocabulary, and the suggested tokens collide

**Where.** R11 (`figure-formatting/spec.md:357-360`) says `data-unit` names
"the quantity and, for a duration or a rate, which clock the raw value is
measured in (for example `world-ms`, `tons-per-world-ms`)". "For example" is
the problem: nothing pins the token set, so `hold-free` and `hold-capacity`
can end up `tons` and `t`, and no test notices until one of them is renamed.

Worse, the analysis's own §5 recommends `world-ms` for **both** a duration's
span and an absolute stamp's instant. Those are the two readings RULING 1
exists to keep apart; giving them one token means a test reading `data-unit`
cannot tell `in 4m 12s` from `T+ 2d 04:13`, which is the confusion re-entering
through the contract that was meant to prevent it.

design.md now pins the set and exports it as a TypeScript string union so
`<Figure>`'s prop type refuses an invented spelling at compile time:
`world-ms-span`, `world-ms-instant`, `tons`, `range`, `delta-v`, `credits`,
`tons-per-world-ms`, `tons-per-world-s`.

**Paste-ready addition to R11's requirement text** (append to the paragraph):

```
The `data-unit` values SHALL be a closed set defined once by the presentation
module, and a duration's span and an absolute instant SHALL NOT share a
token — a reader of the attribute must be able to tell a wall-clock span from
a world-time instant without reading the copy.
```

## 9. MAJOR — task 10.1's "single point of change" is not true for the hold readout

**Where.** tasks.md 10.1 says rewriting `digits()` and `holdKindTons()` in
`frontend/e2e/helpers/space-view.ts` is "the single point of change" for four
specs. It is not, for two of the readouts:

- `FleetActionsPanel.tsx:355` — `hold-capacity` renders
  `{cargoUsed} / {roster?.cargoCapacity ?? 0} t`: **two figures in one
  element**. Under R11 it splits, and `getByTestId('hold-capacity')` then has
  no `data-raw` at all. `slice.spec.ts:94` calls `digits(page,
  'hold-capacity')`.
- `FleetActionsPanel.tsx:361` — `hold-{kind}` renders `{kind} {tons} t`: a
  label plus a figure, so the raw lands on an inner span and
  `holdKindTons()`'s locator misses it.

design.md now carries the naming rule (single-figure testids move onto the
`<Figure>` unchanged; composite wrappers keep their testid and each figure
gets a derived one — `hold-capacity-used`, `hold-capacity-total`, and four
`commit-drift-*` ids). tasks.md 10.1 and 5.1 should name the derived ids so
the implementer and the SDET agree on the selectors before either starts;
this is wording, not extra work.

## 10. MINOR (flagged, ruling consequence) — `×N` on every sighting-log row

R4 (`figure-formatting/spec.md:112-118`, and its *A scale of exactly 1 still
renders its suffix* scenario) appends the scale suffix to **every** absolute
stamp. The only absolute stamps in this change outside the clock are
`sighting-log`'s row `asOf` values and `SpaceStage`'s ghost sr-only label, so
a twenty-row log will read `×1` twenty times, and a screen reader will hear it
on every ghost.

This is not a ruling — RULING 9 pins the *resolution* (`Dd HH:MM`), and the
chain doc's rules-table example is the clock cell (`T+ 2d 04:13 ×60`). The
suffix-on-every-stamp scenario is the writer's. Worth a decision because the
scale is a property of the world, not of the stamp: stating it once per screen
(the clock cell, which link 2a builds) loses nothing, and dropping it from
rows would also mean `SightingLog` needs no `scale` prop at all — one fewer
thread.

I did not author against it. If you want it, the change is one scenario:

```
#### Scenario: The scale suffix is shown where the world clock is presented, not on every stamp
- **WHEN** an absolute stamp is rendered as part of a surface's world-clock
  readout
- **THEN** the `×N` suffix is shown; WHEN the same stamp format is rendered
  as a record's own timestamp elsewhere on the surface, the `T+ Dd HH:MM`
  figure is shown without the suffix, since the rate the world runs at is a
  property of the world and is stated once per screen
```

## 11. MINOR — two scenarios are unobservable as written; mechanisms now recorded

- R1's *A missing scale does not default to 1* asserts a **type-level**
  rejection. Nothing in the vitest suite observes a compile error by default.
  design.md now pins the mechanism: a `// @ts-expect-error` line in the
  module's own suite, which compiles green only if the scale-less call really
  is an error, with `npx tsc --noEmit` already in the per-commit gate.
- R13's *The module reads no ambient state* asserts identical output "in two
  separate processes". Spawning a second Node process per assertion is slow
  and proves less than it appears (a `Date`-reading formatter can still return
  the same string twice). design.md replaces it with the static guard in
  finding 5 — `lib/format/**` names no `Date`, `performance`, `Math.random`,
  `Intl` or `toLocaleString` — which is what the scenario actually means.

The spec text needs no change for either; the mechanism is design's job. But
the SDET should read design.md's enforcement decision before writing the red
suite, or these two scenarios will be written as tautologies.

## 12. MINOR — the thousands separator must not be `toLocaleString`/`Intl`

R7 (`3,721 m/s`) and R8 (`₡ 1,000`) both need grouping. The reflex is
`Number.prototype.toLocaleString()`, whose output depends on the ambient
locale and the ICU build — `1 000` (narrow no-break space) under `fr`,
`1.000` under `de` — so the same input produces different strings in CI, in a
developer's Node, and in a French-locale browser. That defeats R13's purity
scenario and makes the fixture table environment-dependent, which is exactly
the reason the change already lists `Intl` as a non-goal. design.md now states
the positive rule (a regex over the integer part) and the guard suite in
finding 5 fails the build if `toLocaleString` or `Intl` appears in
`lib/format/`.

## 13. MINOR — a second `?? 1`, to append to the existing defect file

`GalaxyView.tsx:182` is the recorded defect (RULING 7,
`defect-galaxy-clock-assumes-scale-1.md`). `SystemSpaceView.tsx:405`'s
`?? 1` is the **same defect in the system view** — it just never mattered
because a served scale is always present in practice. It is not fixed here
(no delta covers it, and this change's clock clause is untouched), and it
should be appended to that same defect file rather than filed as a second
one, so a later `galaxy-view`/`system-space-view` change fixes both together.

Related, and worth stating in the risk register (it now is, in design.md):
this change does **not** make the galaxy-mounted roster's countdown correct
under a scale ≠ 1 world. `GalaxyView` projects world time at 1 world-ms per
wall-ms; dividing that span by the served scale gives a figure that is right
at each fetch and drifts between them. The `fleet-roster` delta claims only
that the span it is handed is *presented* in wall-clock units, and should not
be read as more.

---

## Answers to the five commissioned questions

### Q1 — Module shape

**The seam is right, with three additions I made to design.md.**

Pure `(value, …) => string` functions plus one `<Figure>` is the only shape
that satisfies both constraints simultaneously: the fixture table must be
`(raw, scale, expected)` **strings** (so formatters cannot return JSX), and
the attribute contract must be enforceable-by-construction (so exactly one
component may emit it). The alternatives both fail one of the two. Added:

1. **`<Figure>` lives in `frontend/components/figure/`, not in
   `lib/format/`.** It is mounted from `components/space/*`,
   `components/fleet/*` and `components/galaxy/*`, so it belongs to none of
   them; `components/render-guard/` is the precedent for a shared,
   non-Catalyst folder. Keeping React out of `lib/format/` is also what makes
   R13's purity and import guards checkable over that whole directory with
   one glob.
2. **File layout is chosen against the coverage validator.**
   `.claude/scripts/check-frontend-tests.sh` demands a colocated `*.test.ts`
   per non-exempt file, so a file-per-quantity split multiplies test files
   without adding coverage: one `figures.ts`, an exempt `index.ts`, and the
   table as `cases.json` (JSON is unchecked). The table must **not** go under
   the repo-root `fixtures/` tree — that directory means cross-language pin,
   and a table there would imply the Go counterpart RULING 6 says will never
   exist.
3. **`<Figure>` is fenced so it cannot become a UI primitive.** Catalyst has
   no numeric-readout primitive, and routing these figures through Catalyst's
   `Text` would itself apply a type scale — the change's own non-goal. So
   `<Figure>` renders exactly one `<span>`, sets no class of its own, accepts
   `raw`/`unit`/`text` plus pass-through `className` and `data-testid` and
   nothing else, and takes **no children** (so no call site can slip
   unformatted content through) and **no `variant`/`size`/`tone`** prop. The
   first such prop is the moment it starts competing with Catalyst; if link 2a
   wants one, that is a `system-console` decision.

No Catalyst rule is bypassed: the HUD tree already renders these figures as
bare `<span>`/`<dd>`/`<li>` elements with their own mono/zinc classes, and
`<Figure>` preserves each call site's classes verbatim.

### Q2 — How the served scale reaches ~25 call sites

**The prop is right, and this is not the kind of threading that decays.**

All six consumers are **direct children** of `SystemSpaceView` —
`SpaceStage:725`, `SightingLog:765`, `SpaceCommandPanel:797`,
`FleetActionsPanel:805`, `ScanControl:822`, `FleetRoster:890` — and
`FleetRoster`'s second mount is a direct child of `GalaxyView:472`. Depth is
one hop; no intermediate component carries a value it does not use, which is
the actual failure mode of prop drilling. The ~25 call sites are ~25
*formatter calls inside six components*, not 25 hops.

It is also the pattern the repo already chose for the other half of the same
clock: `worldTime` is passed as a prop to four of these six today, and
`FleetRoster.tsx`'s header comment records the reason — "the world clock comes
in as a prop because both views already run one and the roster must tick in
step with the picture." The scale is the second half of that clock.

**I do not think the ruling needs adjudicating.** A context would be
defensible under RULING 1's letter, but it costs more than it saves here:
depth-1 threading gains nothing from a provider, and every one of the nine
vitest files being migrated would need a provider wrapper added — turning a
mechanical assertion migration into a render-harness migration in the change
with the least task margin.

Two refinements are in design.md instead:

- The scale that reaches figures is **un-defaulted**
  (`number | undefined`), while `useWorldTime` keeps `servedScale ?? 1` at its
  single anchor line. Without that split, an implementer must either defeat
  RULING 8 or change the clock's behaviour with no requirement behind it.
- `clock={{ worldTime, scale }}` as one prop is structurally better (a figure
  can never be formatted with one view's time and another's scale) but
  renames an existing prop across four components and their suites; recorded
  as the shape link 2a should adopt when it builds the strip's clock cell.

Also worth knowing: the scale is a property of the **simulation clock**, not
of a fleet (`backend/common/worldtime.go` runs one `WorldClock()`), which is
what makes RULING 7's `myFleets?.[0]?.scale` sound rather than a first-row
accident, and why no roster row needs a per-row scale.

### Q3 — The `data-raw` serialization contract

**It survives all three, with two normalizations that must be stated (finding
4 and design.md's serialization decision).**

- **React.** `data-*` attributes are set with `setAttribute(name, '' + value)`
  — literally `String(value)`, so RULING 5 needs no explicit call at the call
  site. `undefined`/`null` cause React to omit the attribute (R11's absent case
  for free), but **`NaN` and `Infinity` render as the strings `"NaN"` and
  `"Infinity"`**, which R11 forbids. `<Figure>` must coerce a non-finite `raw`
  to `undefined` before it reaches the DOM. That single line is the strongest
  argument for the component existing at all.
- **Precision.** "Full double precision" is loose wording for what JavaScript
  actually does: the **shortest decimal that round-trips to the identical
  double**. That is stronger than it sounds — `Number(getAttribute('data-raw'))`
  recovers the served value exactly — but it means values whose shortest form
  is exponential serialize as `1e-7` / `1e+21`. Tests must compare
  `Number(attr)` to the wire value, never the attribute string to a hand-typed
  decimal. Worth pinning in the spec's own words; the current sentence invites
  a string comparison.
- **Playwright.** `getAttribute` returns the raw string, unnormalized — no
  whitespace collapsing, no truncation — so `Number(await
  el.getAttribute('data-raw'))` is exact. Whitespace normalization only
  affects *text* assertions, and there the thin space is harmless in both
  frameworks: Testing Library's default normalizer and Playwright's
  `toHaveText` both collapse `\s+`, and JS `\s` covers U+2009.
- **`digits()` (`e2e/helpers/space-view.ts:377`)** must stop parsing text — it
  takes the first numeric run, which answers `2` for `T+ 2d 04:13` and the
  *rounded* value for `47.2 t`. **`holdKindTons()` (`:393`)** survives the thin
  space (`\s` covers U+2009) but starts returning one-decimal tonnages, which
  is exactly the precision its own doc comment exists to preserve ("fuel
  shares the same cargo pool and every burn spends some"). Both must read
  `data-raw`, and both must target the **per-figure** element, not the
  composite wrapper — see finding 9; `hold-capacity` is two figures and
  `hold-{kind}` is a label plus a figure, so neither wrapper carries the
  attribute after the R11 split.
- **The presence rule must follow the value, not the text** (finding 4), or
  task 10.2's `data-raw <= 0` migration is unimplementable and the
  900-second-timeout trap survives the change that claimed to remove it.

### Q4 — R12's enforcement mechanism

**Pick the vitest static assertion.** One file,
`frontend/lib/format/guards.test.ts`, on the `anti-mirror-guard.test.ts`
precedent. Four reasons, in order of weight:

1. **Only it can satisfy R12's own scenario.** The scenario is "*WHEN the
   space and fleet component trees are inspected*" — whole-tree. A
   changed-file validator sees only what a commit touched, so the shipped
   check would be permanently narrower than the requirement, and a violation
   in an untouched file would be invisible forever. Shipping a check whose
   scope is smaller than its requirement is how a requirement quietly stops
   being true.
2. **RULING 10 requires a reviewed exception list, and bash has nowhere to put
   one.** The rule is scoped to quantities `figure-formatting` defines, and a
   regex cannot tell a player-facing tonnage from
   `SpaceStage.tsx:663`'s bearing (which RULING 10 keeps) or
   `webgl/SpaceWorld.tsx:195`'s `toFixed(4)` memo key (never a figure at
   all). A test file holds `KNOWN_EXCEPTIONS` with a line-anchored comment
   naming the ruling for each — and asserts each exception **still exists**,
   the anti-vacuity trick `anti-mirror-guard.test.ts` already uses, so the
   list fails loudly when RULING 10's brownfield follow-up lands instead of
   rotting into a permanent hole. The naive validator as originally designed
   fails on `SpaceStage.tsx`, which **this change itself edits** (finding 5).
3. **The per-commit argument is not a differentiator.**
   `.claude/scripts/check.sh:98` runs the whole vitest suite, `/check` runs
   it too, and no changed-file validator is wired as an edit-time hook in
   `.claude/settings.json` — they run only through `check.py`. Both mechanisms
   fire at exactly the same moments.
4. **Cost, against a change at the cap.** One test file, versus a bash script
   + a `run_*` wrapper + registration inside `check.py` + its own planted-twin
   test. And the one suite also absorbs tasks 2.3 and 2.4 (the import guard
   and the purity assertion), which are the same species of static check.

ESLint stays rejected as primary: higher setup cost, no custom-rule precedent
here, and no natural home for a justified exception list a reviewer reads.
Nothing forecloses adding a `/check` validator later as a fast pre-filter.

### Q5 — Sequencing and the 40-task cap

**tasks.md is exactly at 40** (9+4+2+4+5+3+2+1+4+2+1+1+2). My findings are
**net task-neutral, and probably −1**, so the change does not need to split on
my account:

- Finding 5 folds tasks **2.3 and 2.4 into 11.1** (one static suite covers
  the toFixed rule, the local-formatter rule, the `lib/eta.ts` deletion, the
  import guard and the purity guard). **−2.**
- Findings 6 and 7 are spec wording plus a conditional at two mount sites,
  absorbed by the existing 4.4 / 6.1 / 6.3. **0.**
- Findings 1, 2, 3, 4, 8 are spec text plus fixture rows inside 2.1/2.2. **0.**
- Finding 9 is selector naming inside 5.1 / 9.1 / 10.1. **0.**
- If you want the RULING 8 absent-scale conditional and the composite-figure
  e2e helper split called out as their own tasks for the implementer, that is
  **+2**, landing back at exactly 40 after the −2 above.

So: **do not split.** The analysis §9 seam at the `lib/eta.ts` dependency
boundary remains correct if you later decide to, and my findings do not move
it — everything I found is either module-side (link 1 under either split) or
spec text.

Two sequencing notes for the kickoff, since the SDET writes before the
implementer:

- **Nothing in this change is a cross-service contract**, so there is no
  API-first step. The contract that plays that role is the
  `data-raw`/`data-unit` pair plus the closed `data-unit` union and the
  derived testid names — the SDET cannot write a failing acceptance suite
  until those strings are fixed. They are now all in design.md; findings 3, 4,
  8 and 9 must land in the spec before the red suite is written, or the suite
  will be rewritten mid-change.
- **The fixture table (2.1) is the real red suite** for the module half, and
  it must include the scale-≠-1 rate row (finding 2) and the sub-second /
  boundary-carry rows already listed. Write it before 1.1–1.8, not alongside.

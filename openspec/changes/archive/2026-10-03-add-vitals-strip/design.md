## Context

Chain link 2a (`docs/plans/system-hud/chain.md`) of the system-HUD rebuild.
The strip is the collapsed state of the console dock link 2b builds next, so
it must carry the common case alone. This change was split from a single
~57-task step-2 change at the burn-preview lift (FULL-AUTO RULING 9): the
fuel gauge's cost overlay, the lifted preview, `SpaceCommandPanel`'s prop
conversion, and the § 5.1 running-mine preview-suppression defect fix are
`add-burn-cost-overlay`, chain link 2a-ii, authored after this change
archives. Everything here is true of a strip whose fuel gauge has no
overlay yet.

## Goals / Non-Goals

- Goal: one always-on, full-width strip carrying the fleet cell (identity,
  chevron, state pill), fuel cell, hold cell, credits cell, and clock cell,
  replacing the fleet panel's hold and credit readouts and the roster row's
  prime fuel/range position (the row keeps them too — it stays a complete
  surface) with a single instrument the player reads while planning.
- Goal: shrink the twelve-button on-screen camera cluster to four, without
  regressing the load-bearing keyboard pan path or `select-pan-target-point`.
- Non-goal: the fuel gauge's cost overlay (`add-burn-cost-overlay`).
- Non-goal: the console dock, its tabs, collapse, and `Esc` (`add-console-
  dock`).
- Non-goal: the in-system list, figures on the arc, the selected-entity tab
  (chain links 3 and 4).
- Non-goal: any backend field, endpoint, or query (FULL-AUTO RULING 8).

## Decisions

### Decision 1: The gauge is a shared atom, and it is decorative
One `Gauge` component backs both the fuel cell's plain fill and the hold
cell's kind-segmented fill. Segments are zinc-family shades, ordered stably
by kind (FULL-AUTO RULING 20). `.claude/scripts/check-color-compliance.py`
rejects `dark:bg-zinc-800` outright and rejects `bg-zinc-100`/`text-zinc-900`/
`border-zinc-200` without a dark variant, so the segment shades must be
picked from the palette in `frontend/CLAUDE.md:75-88` with dark variants
included, and the fill itself must be expressed as inline `style={{ width }}`
geometry rather than a computed colour class — a per-commit gate failure
otherwise.

The gauge renders **no text and no figure of its own**. It carries no
`data-raw`, no `aria-valuenow`/`aria-valuetext`, no percentage, and no
accessible name; it is `aria-hidden="true"` geometry. Every number the
player or a test reads is an adjacent `<Figure>` in the cell's text —
`hold-<kind>-tons` for a segment, `hold-capacity-used`/`-total`/`hold-free`
for the hold, the fuel tonnage and range for the fuel cell.

The gauge does carry one plain `data-*` state attribute — distinct from
`data-raw` and never announced to assistive technology — naming whether it
holds no data, no fill/no segments, or a rendered fill. A 0%-width fill and
a "no fill" fill are otherwise the identical rendered pixel state, so
without this the "no fill" vs. "empty fill" (fuel) and "no segments because
unloaded" vs. "no segments because genuinely empty" (hold) distinctions the
requirement text makes would be provable only by parsing the adjacent
figure, defeating the point of testing the gauge in isolation.

Three constraints force this, and any one of them alone would:

1. **The `data-unit` vocabulary is closed** (`FigureUnit` in
   `frontend/lib/format/figures.ts` — eleven tokens, none of them a ratio or
   a percentage). A gauge that spoke its fill as "47%" would be a
   player-facing figure with no token, which FULL-AUTO RULING 6 says
   requires a `figure-formatting` MODIFIED delta this change does not
   have and is not scoped to add.
2. **The e2e `digits()` helper throws on a composite.**
   `frontend/e2e/helpers/space-view.ts:477-497` resolves a testid to the one
   `[data-raw]` on or inside it and **hard-fails on two or more**. Any
   `data-raw` inside the gauge that also sits inside `hold-<kind>` or
   `hold-capacity` breaks `refuel-commit.spec.ts` and `space-journey.spec.ts`
   at the archive gate — the exact cost RULING 17 exists to avoid.
3. **"Never colour alone"** (RULING 20) is satisfied by the adjacent text,
   which is required to exist anyway, rather than by duplicating that text
   into an accessible name.

**Denominator (resolves Open Question 1 / analyst A-2): both gauges are
drawn on one scale, and that scale's denominator is the served
`roster.cargoCapacity`.** The fuel gauge's fill is `cargo.fuel /
cargoCapacity`; the hold gauge's segments are `cargo[kind] / cargoCapacity`.

Alternative considered and rejected: `fuel + freeHold` ("how full could I
top up"). Both candidates are purely served and neither needs a backend
field, so the decision turns on what the instrument reads at a glance in the
loop this game actually has. Under `fuel + freeHold` the denominator shrinks
as ore is loaded, so **mining makes the fuel gauge read fuller without a ton
of fuel being added**: a hauler with 12 t of fuel and a hold packed with
metals renders a *full* fuel gauge one burn before it strands. Stranding is
a modelled, surfaced state in this game (`roster.stranded`,
`fleet-roster`'s *The Roster Row Shows a Persistent Stranded Indication*),
which makes that the one reading the gauge must never get wrong. The
"redundant with the hold gauge's fuel segment" objection against
`cargoCapacity` is real but cosmetic, and it is repaid: one shared
tons-to-pixels scale makes the fuel fill and the hold gauge's free space
directly comparable by eye, which is exactly the "can I buy the shortfall?"
comparison `add-burn-cost-overlay` will draw on this same gauge. "How full
could I top up" is not lost — it is the hold cell's `hold-free` figure,
already on the strip. A client high-water mark stays rejected (stateful,
unserved).

Consequence recorded for `add-burn-cost-overlay`: the cost overlay is drawn
in tons on this same `cargoCapacity` scale, and needs its own clamp rule for
`fuelCostTons > cargoCapacity`. That is 2a-ii's requirement to write; it
does not reopen this denominator.

Alternatives considered for the atom itself: bespoke per-cell markup —
rejected, duplicates clamping and legibility logic between two cells that
are both a fill ratio over served values on one scale.

### Decision 2: A dry fleet reads absent, not zero — the wire has no zero
`FleetRoster.cargo` (`frontend/lib/types/fleet.ts`) is documented "Kinds the
fleet holds none of are **absent**". There is therefore no such served value
as `fuel: 0`: a dry fleet and an unloaded roster are the same absence at the
`cargo` map. The strip renders `figure-formatting`'s absent form for a
missing kind, identically to the roster row
(`FleetRoster.tsx:218-221` renders `f.roster?.cargo?.fuel` with a `?? NaN`
text fallback), and identically to what `fleet-roster`'s live scenario *An
unavailable fuel or range figure reads as absent, not zero* mandates for the
same served input. Inventing a strip-side `?? 0` would make the strip and
the roster row print different figures for one fleet — the two-surfaces-
disagree fault RULING 4 forbids for the pill, one cell over.

Zero-vs-absent is still specified where the wire genuinely serves a zero:
`cargoCapacity` and `freeHold` are always numbers on a served roster, so
`hold-free` legitimately reads `0.0 t` for a full hold and the absent form
only for an unserved roster.

### Decision 3: The camera cluster's new shape
The cluster wrapper (`data-testid="space-camera-controls"`,
`SpaceStage.tsx:600-645`) today is *both* the focusable orbit group and the
container of twelve buttons. It splits:

- **`camera-orbit`** — one cell, `tabIndex={0}`, `role="group"`, carrying
  `CAMERA_CONTROL_ATTR` and the key handler. It is a **sibling** of the
  other three cells, not their container, so "exactly four cells" is a
  DOM-checkable count of the wrapper's children. It replaces the four
  `camera-orbit-*` buttons; discrete pointer orbit is already served by
  drag-to-orbit (*Space View Camera Orbit, Pan, and Zoom*, live and
  implemented), so no pointer capability is lost.
- **`camera-zoom-in`**, **`camera-zoom-out`**, **`camera-recenter`** —
  unchanged buttons, moved out of the group into the wrapper.
- The four `camera-pan-*` buttons are deleted.
- **`select-pan-target-point`** moves out of the wrapper entirely (it is a
  selection affordance, not a camera cell, and must not be counted in the
  four). It **must carry `CAMERA_CONTROL_ATTR` on itself** when it moves:
  `SpaceStage.tsx:252` suppresses canvas picking via
  `target.closest('[data-space-camera-control], [data-affordance]')`, and a
  point-select button outside that subtree would fire both its own selection
  and the canvas pick on one click.

**Keyboard pan (resolves Open Question 2 / RULING 10 item 4):
`Shift` + arrow keys on `camera-orbit`**, handled in the same `onKeyDown`,
`e.shiftKey` branching to `panBySteps(prev, dx, dy, extent)` with the exact
step vectors the deleted buttons used (`Left −1,0`, `Right 1,0`, `Up 0,1`,
`Down 0,−1`), so the pan bound and increment are unchanged code. Bare arrows
keep orbiting. This satisfies "a dedicated pan input, distinct from the
orbit input and reachable without a pointer… per key press" with no new tab
stop and no fifth on-screen cell.

Alternatives rejected: `Ctrl`+arrow (macOS Mission Control eats it, and
macOS is the development platform); `Alt`+arrow (browser back/forward);
`WASD`/`IJKL` (a second, unfamiliar key vocabulary for an input the player
already reaches by arrows). `Shift`+arrow is free inside a non-text
`role="group"`, and screen-reader browse-mode arrow interception applies
equally to the orbit binding that already ships.

**Pan at-limit surface: an attribute on `camera-orbit`, not the live
region.** `camera-limit-status` (`SpaceStage.tsx:552-558`,
`SpaceStage.tsx:646-648`) is a **single-slot, priority-masked** channel:

```ts
const limitMessage = zoomLimit ? LIMIT_MESSAGE.zoom
  : atPanLimit(camera, extent) ? LIMIT_MESSAGE.pan
  : orbitLimit ? LIMIT_MESSAGE.orbit : ''
```

A camera simultaneously at the zoom clamp and the pan clamp reports only
zoom, so moving pan's at-limit state onto that chain makes *Keyboard input
at a clamp is distinguishable from no input* false for a reachable camera
state — a regression against a live SHALL, introduced by the shrink. It also
loses per-direction precision, which the current tests assert
(`SpaceStage.interaction.test.tsx:293-296`: `camera-pan-right` has
`data-at-limit`, `camera-pan-left` does not).

Instead `camera-orbit` carries `data-pan-at-limit` whose value is the
space-separated set of blocked pan directions, computed per render from the
existing `panAtLimit(right, up)` helper (`SpaceStage.tsx:542-549`) and
omitted entirely when the set is empty. It is stateless, directional, and
directly assertable. The orbit axis's at-limit state moves onto the same
element as `data-orbit-at-limit` (`min`/`max`), since the
`camera-orbit-up`/`-down` buttons that carry it today are being deleted —
this is part of the shrink, not an extra. `camera-limit-status` and its
priority chain are left exactly as they are (a human-audible summary; two
elements, two purposes, as RULING 21 settled for the world clock).

### Decision 4: The `roster-status.ts` extension is additive-only
`FleetRoster.tsx:188,197,200-202` renders `status.tone`, `status.activity`
and `status.remainingMs` **verbatim**. So changing what `activity` returns
for any input changes the roster row's copy — which would contradict task
1.2 ("confirm the row is unaffected") and RULING 14's premise that the row
takes no delta.

The extension therefore **adds optional fields and changes no existing
one**: `tone`, `where`, `activity` and `remainingMs` return byte-identical
values for every input they return today, and the pill's new distinctions
(park mode, docked-host type word and id, burn target, holding rate) arrive
as new optional fields the row is free to ignore. The check is computable
and cheap: `roster-status.test.ts` keeps its existing nine cases asserting
the old four fields exactly, and gains cases for the new fields only.

The `Holding` state needs the park kind, which the wire carries as an
opaque numeric (`Park.Kind`, `space.ParkKind`'s iota: `0 = orbit`,
`1 = stationkeep`, `2 = point`). Two client sites already hard-code those
numbers — `FleetActionsPanel.tsx:310-311` and `space-scene.ts:589,602` —
and the derivation would be the third. Export the constants **once**, in
`lib/types/fleet.ts` beside the existing `SHIP_MODE_*` constants that set
the precedent (`PARK_KIND_ORBIT = 0`, `PARK_KIND_STATIONKEEP = 1`,
`PARK_KIND_POINT = 2`), and repoint both existing sites at them. This is a
name for a wire enum, not a mirror of a rule: nothing here recomputes
anything `backend/space` decides, and `stationKeepRateTonsPerSecond` stays
read as served (the panel's own comment,
`FleetActionsPanel.tsx:18`, already forbids re-deriving it).

### Decision 5: The pill's no-second-derivation rule is a signature, not a prohibition
Link 1's Taught record is that enumerating prohibitions never closed its
invariant and a **computable check** did — an element's text made a total
function of its own attributes. The same shape applies here, one level up:

> The pill component's props are the derivation's return value, plus the
> ambient render inputs the derivation itself does not carry. It never
> receives a `Fleet`.

**Round 1 correction (BLOCKER 2).** The first draft pinned the props to
`{ status, stranded }`, `status: RosterRowStatus`. That signature cannot
render the pill's own scenarios: `figure-formatting` makes the served clock
scale a *required argument* of the duration and rate formatters, and
`RosterRowStatus` is scale-free by construction (`roster-status.ts` returns
raw `remainingMs`; the roster row formats at the mounting view's
`servedScale`). A two-prop pill can therefore only ever render the absent
form for a countdown or a rate. (Round 1's further claim here — that the
advancing-countdown rule "has nowhere to read a live clock from either" —
is corrected below: the derivation is exactly where the live clock is
already read, since the mounting view calls it with the live `worldTime` on
every render; what a two-prop pill actually lacked was a *scale* to format
against, not a clock to read.)

The invariant's content is "the pill never receives a `Fleet`," not "the
pill receives exactly two props." The signature is
`VitalsStripPill({ status, stranded, scale, worldTime })` where
`status: RosterRowStatus | null` (Round 2 correction below), `stranded:
boolean`, `scale: number | undefined` (the mounting view's `servedScale`,
un-defaulted per RULING 8) and `worldTime: number` (the mounting view's
ticking, projected `worldTime`, never `serverWorldTime`). A component that
cannot see `Fleet.state`, `attachedTo`, `Park.Kind` or an action ETA
**still cannot branch on them** — the prohibition stays a type error rather
than a review opinion — while `scale` and `worldTime` are ambient render
inputs that carry no fleet state, so admitting them does not reopen it. The
corresponding assertion is a property, not an enumeration: *two fleets
whose derivation output is equal render identical pill text at the same
projected world time*, tested by rendering the pill from two hand-built
`RosterRowStatus` values, a scale, and a world time, with no fleet object
in scope. `stranded` rides beside it because RULING 13 makes it an
adornment of the cell, not a state of the pill.

**Round 2 correction (F2): the invariant is restated once, precisely, and
this is its last restatement.** Task 1.1 routes the park mode and the
mining run's ETA *into* the derivation's output, which the props line above
already reflects — but the prose prohibition kept saying those same facts
were "unreachable from" the pill, a contradiction the `Holding` state forces
rather than merely permits (`FleetRoster.tsx:197` renders `status.activity`
verbatim, so Decision 4's additive-only rule means `Holding` can only ever
be composed by the pill from a new park-mode field — the exact branch the
old prohibition wording called a type error). The invariant, stated once:

> The pill SHALL NOT receive a `Fleet`, and SHALL NOT read `Fleet.state`,
> `attachedTo`, a park kind, or an action ETA **from the fleet read**. It
> renders only the shared derivation's output. The derivation MAY expose
> the park kind and a remaining ETA as **additive** fields, and the pill
> MAY branch on those, because they are the derivation's conclusions, not
> the fleet's raw state.

What was always being forbidden is *a second derivation of fleet state in
the strip*, never *the pill using derived facts*.

**Round 2 correction (F3): the countdown advances by anchoring, not by a
second derivation.** `RosterRowStatus.remainingMs` is a span with no
anchor (`roster-status.ts:32`, `number | undefined`) — a live `worldTime`
prop beside a bare span advances nothing. Two routes look plausible and
both are wrong: re-deriving `rosterRowStatus` in the mounting view on every
render makes the `worldTime` prop dead (the pill would just receive a
fresh span each time, from a second call site the pill itself never
touches).

**What the second-derivation rule does and does not forbid** (round 3,
MAJOR 1 — this paragraph previously said the opposite and was wrong). There
is no formatter that takes an instant and a clock: `formatByUnit(raw, scale,
unit)` dispatches to `formatDuration(spanMs, …)`, so `raw` is a **span** and
every live call site subtracts at the caller. The pill therefore subtracts,
and that is *permitted*. Re-expressing the derivation's own ETA anchor
against the projected clock is presentation arithmetic on a value the
derivation already concluded; **deriving state** — a tone, an activity, a
place on the state ladder, or the anchor itself — is what the strip may never
do. The property scenario is scoped to exactly that list, with an explicit
carve-out for this subtraction, so it stays falsifiable against a pill that
decides locally what a fleet is doing.

The fix is an anchor, not a re-derivation: the derivation additionally
emits the underlying ETA as an **absolute world-millisecond instant**
(task 1.1), additive alongside the existing span. The pill's countdown is
then `figure-formatting`'s (`world-ms-span-left`) presentation of that
fixed instant against the `worldTime` and `scale` props — the same
inline-subtraction-into-a-formatter-call shape `FleetActionsPanel.tsx:482-
484` already uses for the mining-run countdown (`mineEta.eta - worldTime`
fed straight into `formatByUnit(..., 'world-ms-span-left')`), not a new
pattern. Across two renders at two `worldTime` values the derivation's
*output* is unchanged (the anchor instant doesn't move); only the formatted
text changes, because the projected clock moved — which is what makes
task 3.5's "a countdown advancing … with no new derivation output" true
rather than a contradiction in terms.

**Round 2 correction (F4): the staleness input joins the closed list.**
"The own-fleets read's most recent attempt has failed" was not derivable
from any of the four permitted props, and `status: RosterRowStatus` (not
nullable) had no representation for it either — so the pill's own
absent-on-failed-refetch scenario (MAJOR 4/5) was unimplementable against
its own signature. `status` is corrected to `RosterRowStatus | null` above;
the mounting view supplies `null` in place of an output whenever the
own-fleets read's most recent attempt has failed, and the pill renders the
absent form for a `null` status. This is the second input the closed list
was missing — `scale` was the first (Round 1, BLOCKER 2).

**Round 2 correction (F5): "or rate" is dropped from the advance rule.**
`stationKeepRateTonsPerSecond` is a served constant
(`lib/types/fleet.ts:130`) — a served constant cannot "advance between
reads," and the sibling scenario already requires it be shown as served,
"never a rate derived." The advancing-clock rule binds durations and the
clock stamp only.

### Decision 6: The strip renders from the view's existing reads — including the galaxy read
Everything the strip needs is already in `SystemSpaceView`'s scope, so R11
("the strip issues no read of its own") costs nothing:

| Strip input | Source in `SystemSpaceView.tsx` |
| --- | --- |
| acting fleet, all owned fleets | `allFleets` :268, `here` :269, `acting` :274 |
| system names for `where`, chevron entries, and a docked gate's destination | `useGalaxy()` :261 → `systemNames` :262 |
| docked host's type word and served id | `interior.data.features` / `dockedFeature` :625 |
| docked host at a lane gate | `interior.data.laneGates` / `gateFacts`-style lookup by `acting.attachedTo`, resolved to `systemNames[gate.destSystemId]` |
| burn target's type word and served id, or its lane-gate destination | the same both-collections lookup as the docked host, keyed by the burn's served target body id instead of `attachedTo` |
| running mine (the Mining pill) | `runningMine` :491 |
| credits | `corporation?.credits ?? null` :657 |
| world time and served scale | `worldTime` :417, `servedScale` :415 |
| acting-fleet switch | `selectFleet(fleet)` :610-622 |

**Round 1 correction (BLOCKER 1).** The first draft routed the docked host
through `dockedFeature` alone (`interior.data.features.find(f => f.id ===
acting.attachedTo)`), which returns `null` for a fleet docked at a lane
gate — lane gates live in `interior.data.laneGates`, never `features`, and
a gate is this capability's own headline docked example. There is also no
`name` field on either collection (`lib/types/system-space.ts`'s
`SpaceBody`/`SpaceLaneGate`), so "resolved to that body's name" was never
reachable for a docked host either. The host resolution the pill needs now
checks both collections by `acting.attachedTo`: a `features` hit renders as
its served `type` word plus its served `id`; a `laneGates` hit renders as
`Gate` plus `systemNames[gate.destSystemId]` (falling back to the raw
`destSystemId` when the galaxy read has not resolved it) — the one case
where a display name is legitimately available, because it comes from the
galaxy read's system nodes, not from a nonexistent body-name field. A miss
against both collections, or a failed interior read, degrades to the raw
`attachedTo` id per *A docked fleet at an unresolvable host degrades the
pill*.

**Round 1 repair (partial) → Round 2 finding F1 (BLOCKER): the under-way
clause carried BLOCKER 1's own defect a second time, and only half was
fixed.** The docked-host fix above left the pill's under-way clause reading
"resolved to that body's name where the interior read resolves it" —
unfalsifiable in the identical shape, since `SpaceBody`
(`lib/types/system-space.ts`) has no `name` field either. The Round 1
repair fixed the *copy* (a body burn target is named by its served type
word and served id) but not the *path*: it left the lookup checking
`features` only, exactly BLOCKER 1's original mistake, one requirement
over. Since `SpaceLaneGate` carries no `type` field at all
(`lib/types/system-space.ts:60-67`) and a lane gate is the commonest burn
target in the game (burn → dock → jump is the standard traversal,
`SystemSpaceView.tsx:630-633`'s `gateFacts` already resolves the current
*selection* against `interior.data.laneGates` the same way), a
`features`-only lookup returns nothing resolvable for the most common case,
and the task's own falsifiability rule (fail against a raw-id-only render)
left no legal rendering for it.

**Ruling: give the burn target the host's full treatment.** The lookup
checks both collections by the burn's served target body id, exactly as the
docked host does: a `features` hit renders as its served `type` word plus
its served `id`; a `laneGates` hit renders as `Gate` plus
`systemNames[gate.destSystemId]` (same raw-`destSystemId` fallback as the
docked host); and, when the body id matches neither collection or the
interior read has failed, the raw body id — degrading on a resolution miss
by the same precedent as the docked host (*An unresolvable burn target
degrades the pill*), never the unfalsifiable "invents nothing, therefore
renders nothing" gap the plain copy-fix left.
Stated once, generally, so it is not rediscovered a sixth time: **nothing
in the system view's wire carries a display name for a body; the only
served names are system names, from the galaxy read.** That is why a
lane-gate host or target can name its destination system while every other
host and every body target can only be named by type word and served id.

`selectFleet` is the mounting view's own callback and already implements all
three chevron outcomes — lane transit → `/`, another system →
`/systems/:id`, this system → `setActingFleetId` — so the chevron
delegating to it inherits cross-navigation with no second decision path.
This is what makes RULING 15 (`fleet-roster` takes no delta) sound rather
than merely convenient.

The galaxy read is a **fifth** read this view issues, and
`system-space-view`'s fan-in requirement still says "four reads this view
issues itself" and warns against "a fifth read issued by this view". That
clause is already false today; the strip makes it load-bearing, because the
pill's `where` comes from it. It is corrected in the same MODIFIED body, on
RULING 16's precedent.

**Round 1 correction (MAJOR 7): the credits cell's stale-read consult needs
a provider change, not a new field on an existing one.**
`useCorporationOptional()` (`components/corporation-provider.tsx`) returns
`Corporation | null` — no `isError`. `isError`/`error`/`refetch` live on
`CorporationContextValue`, reachable only through the throwing
`useCorporationContext()`, which the space view cannot call (that is the
documented reason `useCorporationOptional` exists at all — a missing
provider must not blank the board). The fix adds a second non-throwing
accessor, `useCorporationSessionOptional()`, returning
`{ corporation: Corporation | null, isError: boolean }` without throwing,
and the strip's credits cell consumes that instead of
`useCorporationOptional()`. `frontend/components/corporation-provider.tsx`
is added to this change's Impact for it.

### Decision 7: Testid inheritance is a DOM-shape contract, not just a name list
The strip's hold and credits cells render under the fleet panel's former
testids (FULL-AUTO RULING 17). The list the ruling gives is **incomplete**
against what the tree actually reads; the full inherited set is:

`balance-readout`, `balance-value` (with its `data-available` attribute),
`balance-figure`, `balance-live-region`, `hold-readout`, `hold-capacity`,
`hold-capacity-used`, `hold-capacity-total`, `hold-free`, `hold-<kind>`,
`hold-<kind>-tons`.

`hold-<kind>` and `hold-capacity` and `balance-readout` are not decoration:
`e2e/helpers/space-view.ts:511-513` (`holdKindTons`) reads `hold-<kind>`, and
`refuel-commit.spec.ts:131,150` and `space-journey.spec.ts:215,220` call
`digits(page, 'hold-fuel')` directly.

And the *shape* is inherited with the names: for each of these testids the
subtree must contain **exactly one** `[data-raw]` — the figure that testid
names — because `digits()` throws on zero and throws on two or more
(`e2e/helpers/space-view.ts:488-497`). `hold-capacity` is the one
deliberate composite (used + total), and it is only ever read by
`hold-capacity-used` / `hold-capacity-total`, never by itself. This is
pinned here because a strip laid out as "one row of figures" rather than
"labelled sections" is the natural thing to build and would nest three
`data-raw`s inside one inherited wrapper.

### Decision 8: The bottom edge has three existing occupants
The strip is a single **56px** bar (`docs/plans/system-hud.md` Surface 1) —
link 2b's "~164px detail area (220px total with the strip)" is arithmetic
on this figure, so it is recorded here even though nothing in this change's
own deltas or tasks is sized by it.

The strip takes the full bottom edge of a view that already anchors three
things there. All three are one-line moves in files this change already
opens, and none is optional:

- **The command column** — `SystemSpaceView.tsx:791`, `absolute inset-y-4
  right-4 … w-72`, with `[&>*]:pointer-events-auto` children. It runs to
  16px from the bottom, so its last 40px sit **over** the strip's clock and
  credits cells and eat their pointer events. Its bottom inset rises above
  the strip. (The column itself dies in 2b; until then it must not cover
  the instrument that replaced its readouts.)
- **`sightings-unavailable`** — `SystemSpaceView.tsx:759`, `absolute
  bottom-4 left-1/2`. It carries the retry affordance
  `system-space-view`'s *The Sweep Surface's Reads Fail Independently…*
  mandates; occluding it makes a live requirement unreachable. It moves up
  by the strip's height.
- **The camera cluster** — `SpaceStage.tsx:609`, `absolute bottom-4
  left-1/2`. It moves to the bottom-right, above the strip, per the chain
  doc.

### Decision 9: The capability boundary must be re-stated after archive
`openspec archive` **discards a delta's `## Purpose` section.** Proof in
this repo: `replace-observation-with-sightings`' `focused-scan` delta
carried an eleven-line Purpose, and the live
`openspec/specs/focused-scan/spec.md` reads *"TBD - created by archiving
change replace-observation-with-sightings. Update Purpose after archive."*
`figure-formatting`, link 1's own ADDED capability, reads the same TBD.

So `system-console`'s boundary statement — the artifact RULING 1 makes
load-bearing and that link 2b is told to inherit rather than re-derive — is
guaranteed to be deleted at archive unless someone writes it back. The
archive step writes the durable Purpose into
`openspec/specs/system-console/spec.md` by hand, in prose with no reference
to "this change".

**Round 1 correction (MAJOR 9): a step that runs after the last task closes
has no owner and this repo has never once performed it (14 of 34 live specs
still carry the TBD placeholder).** The boundary paragraph now has a second,
durable home no archiver can touch: it is pasted verbatim into
`docs/plans/system-hud/chain.md`'s Link 2b section, the document 2b's own
orchestrator reads first regardless of whether the Purpose restore
happened. Task 10.3 restates the restore as a checkable assertion —
`grep -c 'TBD - created by archiving' openspec/specs/system-console/spec.md`
must return 0 — and the orchestrator runs that check personally at the
archive gate, before the archive commit, rather than trusting a task
checkbox ticked after the artifact that records it has already moved.

### Decision 10: Without a served scale, the clock stamp holds — it does not project at an assumed scale of 1
Round 2 finding F8: MAJOR 5's advancing-clock repair ("the clock cell SHALL
re-render as the mounting view's projected world clock advances") is
unconditional, while `useWorldTime` projects the mounting view's ticking
`worldTime` at `clockScale = servedScale ?? 1` (`SystemSpaceView.tsx:414-
417`). Read literally, the repair *requires* the clock cell to advance at
that assumed scale of 1 whenever no scale has been served — link 1's own
founding ruling re-entering through a repair and being promoted from a
flagged disagreement to a mandate.

**Resolved the way link 1 resolved it: with no served scale, the stamp does
not advance.** It renders its `T+ Dd HH:MM` portion at the last served
world instant, with the absent suffix `×—`, and holds — because there is no
honest wall-clock rate to advance it at (wall-clock = world-ms ÷ served
scale; no served scale ⇒ absent, not ⇒ 1). The pill's own scale-absent
scenario already withholds a duration or rate rather than computing one at
an assumed scale; the clock cell now gets the identical protection. Once a
scale has been served, the stamp resumes advancing against the projected
`worldTime` as MAJOR 5 intended.

## Risks / Trade-offs

- Sharing one gauge atom between a plain fuel fill (no overlay yet) and a
  kind-segmented hold fill couples the two cells' rendering; if a later link
  needs them to diverge further than "plain vs. segmented", extract before
  generalizing the atom again.
- The keyboard pan binding replaces four discoverable on-screen buttons with
  a `Shift`+arrow chord that must be learned. This change adds no on-screen
  help text for it; the `camera-orbit` cell's `aria-label` is the only place
  it is named. If that proves too thin it is one string, changed later.
- Deleting the four `camera-orbit-*` buttons leaves pointer-only orbit to
  canvas drag alone. Drag-to-orbit is live and required, so nothing is
  unreachable, but a player who only ever clicked the arrows loses a habit.
- Reusing the panel's testids on the strip's differently-laid-out cells
  risks an assertion that happened to pass against the old DOM structure
  passing for the wrong reason on the new one; the migrated tests (task 8.4)
  must assert the same behaviour, not merely the same selector.
- `SpaceStage.interaction.test.tsx` uses `camera-pan-right` as a generic
  "move the camera" lever in fourteen tests, nine of which belong to
  requirements this change does not touch (recenter, selection survival,
  pick radius). Re-pointing them at `Shift`+arrow is mechanical but it is
  where a silent selection regression would hide.
- Deleting the four `camera-pan-*` buttons removes the only touch-accessible
  pan path in the app; no touch gesture replaces it, and this change does not
  add one (FULL-AUTO RULING 24). A touch-only player can select a body or
  lane-gate mark directly but can never move `select-pan-target-point`'s
  target away from the star, so a point-target burn or mine order is
  unreachable from a touch-only device from this change forward. Filed as
  `docs/handoffs/defect-touch-pan-lost-with-camera-cluster.md`.

## Migration Plan

None. Per root `CLAUDE.md` ("solo toy, no backcompat") and chain-doc ground
rules ("solo toy, burn the boats — no coexistence period, no flag, no
legacy toggle"), the fleet panel's hold and credit readouts and the
twelve-button camera cluster are deleted in this same change, not phased
out behind a flag.

## Open Questions

None outstanding. The two questions this document opened at authoring are
ruled above: the fuel gauge's denominator is the served `cargoCapacity`
(Decision 1) and keyboard pan is `Shift`+arrow on `camera-orbit` with a
directional `data-pan-at-limit` attribute (Decision 3). Both are recorded
against `docs/handoffs/add-vitals-strip-rulings.md`'s
"Routed to the panel" section.

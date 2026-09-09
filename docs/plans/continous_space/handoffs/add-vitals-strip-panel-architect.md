# `add-vitals-strip` — architect panel report

Link 2a of the system-HUD chain, reviewed 2026-09-09 against the change
folder, the analyst's 834-line decomposition, the 21 FULL-AUTO RULINGs, the
chain and scoping docs, the four live specs the deltas target, and the code.

`design.md` is rewritten in place (I own it):
`/Users/travis/Projects/hexaverse/openspec/changes/add-vitals-strip/design.md`
— now nine decisions, both routed questions ruled, no open questions.

Verdict: **the change is sound in shape and wrong in four load-bearing
details.** The capability split (RULING 1) and the 2a/2a-ii seam (RULING 9)
both hold under attack. Four BLOCKERs and twelve MAJORs below. Every finding
folds into an existing task; **no finding grows the change past 40**.

I argue with no ruling. Two rulings are *incomplete* rather than wrong —
RULING 17's testid list (M3) and RULING 10's "four cells" (B4) — and I say
so where it lands.

---

## The two routed questions, ruled

### RULING (architect) A-2 — the fuel gauge's denominator is the served `roster.cargoCapacity`

**Both gauges are drawn on one tons-to-pixels scale whose denominator is
`roster.cargoCapacity`.** The fuel gauge's fill is `cargo.fuel /
cargoCapacity`; the hold gauge's segments are `cargo[kind] / cargoCapacity`.

**Why not `fuel + freeHold`.** Both candidates are purely served, so the
decision turns on what the instrument reads at a glance in the loop this
game has. Under `fuel + freeHold` the denominator shrinks as ore is loaded,
so **mining makes the fuel gauge read fuller with no fuel added**: a hauler
holding 12 t of fuel with a hold packed with metals renders a *full* fuel
gauge one burn before it strands. Stranding is a modelled, surfaced state
here (`roster.stranded`; `fleet-roster`'s *The Roster Row Shows a Persistent
Stranded Indication*), which makes that the one reading this gauge must
never get wrong. A gauge that lies at the moment it matters most is worse
than a gauge that is redundant.

**The redundancy objection, answered.** `cargoCapacity` does make the fuel
fill identical in width to the hold gauge's `fuel` segment. That is a
cosmetic cost, and it is repaid twice: (i) the player learns one scale, so
the fuel fill and the hold gauge's free space are directly comparable by
eye — which is exactly the "can I buy the shortfall?" comparison
`add-burn-cost-overlay` draws on this same gauge; (ii) it is what makes the
"shared gauge atom" of design Decision 1 genuinely shared rather than two
atoms with different meanings. "How full could I top up" is not lost — it is
`hold-free`, already on the strip as a figure.

Forward constraint recorded for 2a-ii: its cost overlay is drawn in tons on
this same scale and owes its own clamp rule for `fuelCostTons >
cargoCapacity`. It does not reopen the denominator.

**Delta text.** In `specs/system-console/spec.md`, requirement *The Fuel
Cell Shows the Served Fuel Tonnage and Estimated Range Over a Gauge*,
replace:

> rendered over a gauge whose fill is the ratio of two served values.

with:

```
rendered over a gauge whose fill is the served held `fuel` tonnage over the
served `cargoCapacity` — the same denominator, and therefore the same
tons-to-pixels scale, as the hold cell's gauge, so the two gauges are read
against one another rather than against two different hundreds.
```

### RULING (architect) RULING-10-item-4 — `Shift`+arrow on `camera-orbit`, at-limit as a directional attribute on that same element

**The binding.** `Shift` + arrow keys, handled in the surviving focusable
group's existing `onKeyDown`, `e.shiftKey` branching to `panBySteps(prev,
dx, dy, extent)` with the exact step vectors the deleted buttons used
(`SpaceStage.tsx:627-630`: Left `-1,0`, Right `1,0`, Up `0,1`, Down `0,-1`),
so the pan bound and increment are unchanged code. Bare arrows keep orbiting
(`SpaceStage.tsx:611-621`). No new tab stop, no fifth on-screen cell,
`select-pan-target-point` keeps a movable pan target.

Rejected: `Ctrl`+arrow (macOS Mission Control eats it, and macOS is the dev
platform per the environment); `Alt`+arrow (browser back/forward);
`WASD`/`IJKL` (a second key vocabulary for an input the player already
reaches by arrows).

**The at-limit surface: an attribute, NOT the live region.**
`camera-limit-status` is a single-slot, priority-masked channel —
`SpaceStage.tsx:552-558`:

```ts
const limitMessage = zoomLimit
  ? LIMIT_MESSAGE.zoom
  : atPanLimit(camera, extent)
    ? LIMIT_MESSAGE.pan
    : orbitLimit
      ? LIMIT_MESSAGE.orbit
      : ''
```

A camera simultaneously at the zoom clamp and the pan clamp reports **only
zoom**, so moving pan's at-limit state onto that chain makes the live
scenario *Keyboard input at a clamp is distinguishable from no input* false
for a reachable camera state — a regression against a live SHALL introduced
by the shrink. It also destroys per-direction precision, which the current
tests assert (`SpaceStage.interaction.test.tsx:293-296`: `camera-pan-right`
carries `data-at-limit`, `camera-pan-left` does not).

Instead: the surviving `camera-orbit` cell carries `data-pan-at-limit`,
whose value is the space-separated set of currently blocked pan directions,
computed per render from the existing `panAtLimit(right, up)` helper
(`SpaceStage.tsx:542-549`) and **omitted entirely** when the set is empty.
Stateless, directional, assertable. The orbit axis's own at-limit state
moves to `data-orbit-at-limit` (`min`/`max`) on the same element, because
the `camera-orbit-up`/`-down` buttons that carry it today are deleted by the
shrink (see B4). `camera-limit-status` and its priority chain are left
exactly as they are — a human-audible summary, two elements with two
purposes, on RULING 21's precedent.

**Delta text.** In `specs/system-space-view/spec.md`, requirement *Space
View Camera Is Keyboard-Operable*, replace this paragraph:

> This requirement leaves open, as permitted alternatives, the pan input's
> specific key binding and whether its at-limit state surfaces via the
> existing `camera-limit-status` live region or via an attribute on a
> surviving control — both already-permitted forms of "an attribute or a
> status message conveyed to assistive technology" above.

with:

```
The pan input SHALL be a modifier-plus-arrow chord on the surviving
focusable orbit cell, distinct from the bare-arrow orbit input on that same
element. The pan axis's at-limit state SHALL be exposed as an attribute on
that cell naming the blocked direction, absent when no pan direction is
blocked, and SHALL NOT be conveyed solely by the camera controls' shared
status message: that message reports at most one axis at a time, so a
camera at both the zoom clamp and the pan clamp would report no pan limit
at all.
```

and add this scenario after *Keyboard input at a clamp is distinguishable
from no input*:

```
#### Scenario: A pan limit is still observable while the camera is also at the zoom clamp
- **GIVEN** the camera at both its zoom clamp and its pan clamp
- **WHEN** pan input is given in the direction of the pan clamp
- **THEN** the pan axis's at-limit state is observable in the DOM,
  naming the blocked direction, and is not masked by the zoom limit
```

---

## BLOCKERS

### BLOCKER 1 — `openspec archive` discards the delta's `## Purpose`, so `system-console`'s capability boundary is deleted the moment it lands

**Lands on:** `specs/system-console/spec.md`, the whole `## Purpose` block,
and RULING 1, which makes that block load-bearing ("its author inherits this
boundary rather than re-deriving it").

**Evidence, proven in this repo.**
`openspec/changes/archive/2026-09-02-replace-observation-with-sightings/specs/focused-scan/spec.md`
opens with an eleven-line `## Purpose` beginning:

> Owns the focused-scan verb: the commit surface that turns
> `proximity-disclosure`'s masking-and-sighting model into something a player
> can actually do.

and the live spec that change produced,
`openspec/specs/focused-scan/spec.md:3-4`, reads in full:

> ## Purpose
> TBD - created by archiving change replace-observation-with-sightings. Update Purpose after archive.

Link 1's own ADDED capability reads the same:
`openspec/specs/figure-formatting/spec.md:3-4` — *"TBD - created by
archiving change add-figure-formatting."*

So the sentence RULING 1 spent its whole reversal-cost analysis on —
`system-space-view` keeps *what the canvas draws and how you pick*,
`system-console` is *what floats over it* — will not exist in
`openspec/specs/system-console/spec.md`, and link 2b's author will re-derive
the boundary from nothing. This is a new entry for the handoffs README's
archiver-trap list alongside the MODIFIED-scenario and capability-retirement
traps.

**Fix, two parts.**

(a) Rewrite the delta's Purpose so it is durable prose with no
change-scoped sentences (it is also currently mis-altituded: a permanent
spec would say "This change delivers the instrument half only"). Replace the
entire `## Purpose` block of `specs/system-console/spec.md` with:

```
## Purpose

The console: everything that floats over the system space view as
instrumentation rather than as scene. `system-space-view` owns what the
canvas draws and how you pick — the renderer, the camera, and the selection
among a body, a lane gate, or a point. `system-console` owns the always-on
vitals strip along the bottom of that view — the acting fleet and its state,
its fuel and range, its hold, the corporation's balance, and the world clock
— and the per-entity detail dock the strip is the collapsed state of. The
strip reads; it does not command. It renders only figures the mounting view
supplies, issues no read of its own, carries no verb but the affordance to
switch which fleet is acting, and never changes the space view's selection.
```

(b) Add the restoration to the archive step. `tasks.md` 10.3 becomes:

```
- [ ] 10.3 `docs/plans/continous_space/handoffs/add-vitals-strip-journey.md`
      written with the suite budget line; and immediately after
      `openspec archive`, replace `openspec/specs/system-console/spec.md`'s
      generated `TBD - created by archiving change add-vitals-strip` Purpose
      with the delta's Purpose paragraph verbatim — the archiver discards a
      delta's `## Purpose` (proof: `openspec/specs/focused-scan/spec.md`),
      and this capability's boundary is the artifact link 2b inherits
```

### BLOCKER 2 — the fuel cell's "dry fleet reads zero" scenario is unimplementable, and implementing it would contradict a live `fleet-roster` scenario

**Lands on:** `specs/system-console/spec.md`, requirement *The Fuel Cell
Shows the Served Fuel Tonnage and Estimated Range Over a Gauge*, third
scenario.

**Offending text:**

> #### Scenario: A dry fleet reads zero, distinguishably from absent
> - **WHEN** the served fuel is 0
> - **THEN** the figure reads `0.0 t` and the gauge shows an empty fill,
>   distinct from the absent state above

**Why it cannot happen.** `frontend/lib/types/fleet.ts`, `FleetRoster.cargo`:

> // Tons held, by resource kind. **Kinds the fleet holds none of are absent.**

There is no served `fuel: 0`. A dry fleet and an unloaded roster are the
same absence at the `cargo` map, so the WHEN clause names a wire state that
does not exist and the scenario is untestable against a real read.

**Why implementing it anyway is worse.** The only way to synthesise the
distinction is `roster ? (cargo.fuel ?? 0) : undefined`. That makes the
strip read `0.0 t` where the roster row reads `—` for the same fleet on the
same screen — `FleetRoster.tsx:218-221` renders `f.roster?.cargo?.fuel` with
a `?? NaN` text fallback — and `fleet-roster`'s live scenario mandates the
row's behaviour:

> #### Scenario: An unavailable fuel or range figure reads as absent, not zero
> - **WHEN** a roster row is rendered for an owned fleet whose fleet read
>   does not carry a fuel or range figure
> - **THEN** that figure shows the `figure-formatting` absent form (`—`),
>   never `0t fuel` or a bare `0`

`fleet-roster` takes no delta (RULING 15), so the strip cannot be brought
into line by changing the row. Two surfaces printing different figures for
one fleet is precisely the fault RULING 4 forbids for the pill, one cell
over.

**Fix.** Replace that scenario with:

```
#### Scenario: A fleet holding no fuel reads absent, exactly as its roster row does
- **WHEN** the acting fleet's served roster carries no `fuel` entry in its
  cargo pool
- **THEN** the fuel figure shows the `figure-formatting` absent form and the
  gauge renders no fill, identically to the same fleet's roster row
  (`fleet-roster`'s *An unavailable fuel or range figure reads as absent,
  not zero*) — the wire omits a kind the fleet holds none of, so a dry fleet
  and an unserved roster are one absence and the strip SHALL NOT invent a
  zero the read did not carry
```

and add, to the requirement body, after the sentence beginning "WHEN either
figure is unavailable on the fleet read":

```
A cargo kind the fleet holds none of is omitted from the served pool
entirely, so "the fleet holds no fuel" and "the roster has not loaded" are
one served condition; this capability SHALL render the absent form for both
and SHALL NOT substitute zero for either.
```

**Where the zero-vs-absent distinction survives, honestly:** the hold cell.
`cargoCapacity` and `freeHold` are always numbers on a served roster, so
*An empty hold shows no segments and a free figure equal to capacity* and
*An unloaded roster reads as absent, never `0 / 0 t`* are both real and
both stay.

### BLOCKER 3 — the REMOVED *Fleet Panel Cargo Hold Readout* loses its mine-resolution clause and its third scenario, while claiming it does not

**Lands on:** `specs/docked-fleet-actions/spec.md`, the REMOVED block, and
`specs/system-console/spec.md`'s *The Hold Cell Shows Used, Total and Free
Tonnage Over a Kind-Segmented Gauge*.

**Offending text** (the REMOVED block's Reason):

> Re-homed as `system-console`'s *The Hold Cell Shows Used, Total and Free
> Tonnage Over a Kind-Segmented Gauge*, which carries **all three** of this
> requirement's scenarios adapted to the strip.

It carries two. The live requirement's third scenario is:

> #### Scenario: The hold visibly fills when a mine run resolves
> - **WHEN** a running mine's ETA passes and the space view's refetch lands
>   the updated fleet read
> - **THEN** the hold readout shows the credited cargo without a page
>   navigation

and its governing clause, `openspec/specs/docked-fleet-actions/spec.md:141-143`:

> the readout SHALL reflect the post-resolution cargo after a mine run
> resolves (via the space view's refetch rules), without requiring
> navigation.

Neither the clause nor the scenario appears anywhere in the new hold-cell
requirement. This is exactly the species the handoffs README's lesson four
records — six load-bearing clauses lost to re-expression that
`validate --strict` and `archive` both pass. I ran both: `openspec validate
add-vitals-strip --strict` → "valid", `openspec-reconcile.py` → "OK". Neither
catches it.

It also matters behaviourally: the mine-resolution refresh is the only
scenario in the set that pins *when* the hold cell updates, and M10's mine
verb is the reason the readout exists.

**Fix, two edits.**

(a) In `system-console`'s hold-cell requirement, after "with `fuel` treated
as a kind like any other.", insert:

```
The cell SHALL reflect the post-resolution cargo after a mine run resolves,
via the mounting view's refetch rules, without requiring navigation.
```

(b) Add this scenario to that requirement:

```
#### Scenario: The hold cell visibly fills when a mine run resolves
- **WHEN** a running mine's ETA passes and the space view's refetch lands
  the updated fleet read
- **THEN** the strip's hold cell shows the credited cargo — its used figure,
  its free figure, and that kind's segment — without a page navigation
```

(c) Correct the REMOVED block's Reason: "which carries all three of this
requirement's scenarios" → "which carries all three of this requirement's
scenarios, including the mine-resolution refresh".

**Also lost from the same requirement, restore it:**
`openspec/specs/docked-fleet-actions/spec.md:150-152`

> This readout is the fleet's *cargo* hold, distinct from the
> *station-keeping* hold this capability's own "Station-Keeping Hold and
> Release Controls" defines — the two share the word "hold" but name
> unrelated concepts.

The collision is now **worse**, not better: the strip has a cell called
"hold" and, two cells left, a pill state called "holding" that means
station-keeping. Add to the hold-cell requirement body:

```
This cell is the fleet's *cargo* hold, distinct from the *station-keeping*
hold that `docked-fleet-actions`' *Station-Keeping Hold and Release
Controls* defines and that this capability's own fleet-cell pill reports as
the holding state — the three share the word "hold" and name unrelated
concepts.
```

### BLOCKER 4 — "exactly four cells" is not reachable from `tasks.md`, and the orbit axis's at-limit state is unscoped

**Lands on:** `tasks.md` 9.1 and 9.3, and `specs/system-space-view/spec.md`'s
new scenario *The on-screen cluster renders exactly four camera cells*.

**The arithmetic.** `SpaceStage.tsx:623-643` renders twelve buttons inside
`data-testid="space-camera-controls"`: four `camera-orbit-*`, four
`camera-pan-*`, two zoom, recenter, and `select-pan-target-point`. Task 9.1
says:

> 9.1 Reduce the on-screen cluster to four cells — orbit, zoom-in, zoom-out,
> recenter; delete the four `camera-pan-*` buttons

Deleting only the pan buttons leaves **eight**. To reach four, the four
`camera-orbit-*` buttons must collapse to one and `select-pan-target-point`
must leave the wrapper — neither is in any task, and `design.md` (as
authored) papered over it with "orbit (the focusable group itself…— no new
mechanism needed)", which counts the *container* of the other cells as one
of them, so the scenario is unsatisfiable as designed.

**The unscoped consequence.** The orbit axis's at-limit state lives on the
buttons being deleted — `SpaceStage.tsx:625-626`:

```tsx
<CameraButton testId="camera-orbit-up" ... atLimit={orbitLimit === 'max'} glyph="▲" />
<CameraButton testId="camera-orbit-down" ... atLimit={orbitLimit === 'min'} glyph="▼" />
```

Task 9.3 moves only *the pan axis's* at-limit state. Ship it as written and
the live scenario *Keyboard input at a clamp is distinguishable from no
input* fails for orbit, silently, because nothing tests it after the
buttons that carried it are gone.

**Fix.** `design.md` Decision 3 (rewritten) gives the structure: the wrapper
stops being the focusable group; `camera-orbit` becomes a **sibling** cell
carrying `tabIndex={0}`, `role="group"`, `CAMERA_CONTROL_ATTR` and the key
handler; zoom-in/zoom-out/recenter move out of it into the wrapper;
`select-pan-target-point` moves out of the wrapper entirely and **must carry
`CAMERA_CONTROL_ATTR` on itself** — `SpaceStage.tsx:252` suppresses canvas
picking via `target.closest('[data-space-camera-control], [data-affordance]')`,
so a point-select button outside that subtree fires both its own selection
and the canvas pick on one click.

Task text:

```
- [ ] 9.1 Restructure the cluster to exactly four sibling cells —
      `camera-orbit` (one focusable cell carrying `tabIndex=0`,
      `CAMERA_CONTROL_ATTR` and the key handler, replacing the four
      `camera-orbit-*` buttons; pointer orbit is already served by canvas
      drag), `camera-zoom-in`, `camera-zoom-out`, `camera-recenter`. Delete
      the four `camera-pan-*` buttons. Move `select-pan-target-point` out of
      the cluster wrapper so the four-cell count is a DOM fact, carrying
      `CAMERA_CONTROL_ATTR` onto it so `SpaceStage.tsx:252`'s canvas-pick
      suppression still reaches it
- [ ] 9.3 Move BOTH axes' at-limit state onto `camera-orbit`:
      `data-pan-at-limit` naming the blocked pan directions (from the
      existing `panAtLimit` helper) and `data-orbit-at-limit` (`min`/`max`,
      from `orbitLimit`), each absent away from its clamp. Leave
      `camera-limit-status` and its zoom>pan>orbit priority chain unchanged
```

And in the `system-space-view` MODIFIED, tighten the new scenario so the
count is checkable and `select-pan-target-point` is unambiguously outside
it:

```
#### Scenario: The on-screen cluster renders exactly four camera cells
- **WHEN** the space view's on-screen camera controls render
- **THEN** the camera cluster contains exactly four cells — orbit, zoom-in,
  zoom-out, and recenter — no on-screen pan button exists, and the
  point-selection control is not one of them and is not inside the cluster
```

---

## MAJOR findings

### MAJOR 1 — the boundary leaks: *The Strip Carries No Verb*'s scenario asserts where the verbs live, and link 2b moves them

**Lands on:** `specs/system-console/spec.md`, *The Strip Carries No Verb*,
first scenario.

**Offending text:**

> - **THEN** the strip renders no refuel, sell, mine, jump, hold or release
>   control; **those remain on the fleet panel**

`docs/plans/system-hud/chain.md` link 2b, the Acting-fleet tab row:

> state, park mode, hold/release, cut drive, and the docked verbs when
> attached — refuel/sell at a station, jump at a gate, mine at a feature |
> **Moves from `FleetActionsPanel`**

So one link later the trailing clause is false and 2b must MODIFY a
requirement this change is about to make live — the definition of a
mis-drawn requirement. The strip's invariant is "no mutation on the strip";
where the verbs live is `docked-fleet-actions`' business, not this
capability's.

**Fix.** Replace the scenario's THEN with:

```
- **THEN** the strip renders no refuel, sell, mine, jump, hold or release
  control
```

Same edit for the requirement body if the writer wants symmetry — the body
itself is already clean.

### MAJOR 2 — *The Vitals Strip Is Present…* pins the strip to the viewport's bottom edge, which link 2b moves

**Lands on:** `specs/system-console/spec.md`, *The Vitals Strip Is Present on
Every Render of the System Space View*, first sentence.

**Offending text:**

> The system SHALL render a single full-width strip **along the bottom edge
> of the system space view** on every render of that view

`docs/plans/system-hud.md:146` (Surface 4, DECIDED):

> **The strip stays as the dock's top row.** Beneath it a tab bar and a
> detail area of ~164px (220px total with the strip).

With the dock expanded the strip sits 164px above the bottom edge, so the
placement clause is false and 2b rewrites it. The durable claim is that the
strip spans the view's full width at the foot of the console region and is
never scrolled or removed.

**Fix.** Replace with:

```
The system SHALL render a single full-width strip across the foot of the
system space view — the bottom-most always-visible band of the view's
console region — on every render of that view, including while the interior
read has failed, while the own-fleets read has failed, and while the
renderer is unavailable.
```

(Everything from "A cell whose served input is unavailable…" onward is
unchanged and stays.)

### MAJOR 3 — RULING 17's inherited-testid list is incomplete, and it is a DOM-shape contract, not a name list

**Lands on:** `tasks.md` 8.3 and the implementation contract.

**Offending text** (task 8.3):

> reusing the panel's former `hold-readout`/`hold-capacity-used`/
> `hold-capacity-total`/`hold-free`/`hold-<kind>-tons`/`balance-value`/
> `balance-figure`/`balance-live-region` testids

Three inherited testids are missing, and two of them are read by the tier-4
specs RULING 17 exists to protect:

- **`hold-<kind>`** — the `<li>` wrapper, `FleetActionsPanel.tsx:400`.
  `e2e/helpers/space-view.ts:511-513` (`holdKindTons`) reads it, and
  `refuel-commit.spec.ts:131,150` and `space-journey.spec.ts:215,220` call
  `digits(page, 'hold-fuel')` directly. Omit it and two tier-4 specs fail at
  the archive gate.
- **`hold-capacity`** — the used/total wrapper, `FleetActionsPanel.tsx:380`,
  6 references in the tree.
- **`balance-readout`** — `FleetActionsPanel.tsx:347`, 3 references,
  including `FleetActionsPanel.test.tsx:941`'s
  "no-panel-surfaces-while-X" enumeration.

Also inherited: `balance-value` carries `data-available="true"|"false"`
(`FleetActionsPanel.tsx:351`), which is how the unavailable state is
asserted without parsing copy.

**And the shape travels with the names.** `e2e/helpers/space-view.ts:477-497`:

```ts
const nested = el.locator('[data-raw]')
const count = await nested.count()
if (count === 1) { ... }
if (count === 0) { throw ... 'the figure moved' }
throw new Error(`digits(...): ${count} [data-raw] elements inside this element — a composite;`)
```

`digits()` **hard-fails on two or more**. So each inherited testid's subtree
must contain exactly the one `[data-raw]` it names — `hold-capacity` is the
one sanctioned composite, only ever read via `-used`/`-total`. A strip laid
out as one flowing row of figures rather than labelled sections is the
natural build and would nest three `data-raw`s inside one inherited wrapper.
This is why `design.md` Decision 1 makes the gauge carry no `data-raw` at
all.

**Fix.** Task 8.3 becomes:

```
- [ ] 8.3 Point `Sell Commit`'s and `Refuel Commit`'s post-success refresh at
      the strip's hold and credits cells, reusing the panel's former testids
      on the strip's cells so the tier-4 specs that read them need no edit:
      `balance-readout`, `balance-value` (keeping its `data-available`
      attribute), `balance-figure`, `balance-live-region`, `hold-readout`,
      `hold-capacity`, `hold-capacity-used`, `hold-capacity-total`,
      `hold-free`, `hold-<kind>`, `hold-<kind>-tons`. Each of these
      testids' subtrees SHALL contain exactly the one `[data-raw]` it names
      (`hold-capacity` excepted, read only via `-used`/`-total`) — the e2e
      `digits()` helper throws on a composite
      (`e2e/helpers/space-view.ts:488-497`)
```

### MAJOR 4 — the fan-in MODIFIED restates "four reads" while the view issues five, and the fifth is what feeds the pill

**Lands on:** `specs/system-space-view/spec.md`, *System Space View Route and
Data Fan-In*.

**Offending text** (reproduced verbatim from live, and false):

> The system SHALL render `/systems/:systemId` from **four reads** this view
> issues itself, plus the corporation session read the surrounding layout
> already makes

and, in the same requirement:

> The requester's credit balance SHALL come from the ambient corporation
> session read … never from **a fifth read issued by this view**.

`SystemSpaceView.tsx:261` issues a fifth: `const galaxy = useGalaxy()`, from
which `systemNames` (:262) is built. This change makes that read
**load-bearing for the strip**: `roster-status.ts`'s `nameOf` argument
resolves the pill's `where`, and the chevron's entries name the system each
fleet is in. RULING 16 already adjudicated the identical species of drift
inside this same requirement ("spec wrong about pre-existing behaviour",
corrected in the MODIFIED body this change reproduces anyway), so the same
adjudication applies and no separate baseline pass is needed.

The strip clause added by this change is also incomplete — it omits the two
reads R4's own scenarios depend on:

> The vitals strip this view mounts (`system-console`) SHALL be driven by
> the own-fleets read, the corporation session read, and the world clock and
> its served scale

but *A docked fleet's pill names its host* requires the **interior** read
("the interior read resolves that host") and *The pill and the roster row
are functions of one derivation* requires the **galaxy** read for `where`.

**Fix, two edits in that MODIFIED body.**

(a) Opening sentence:

```
The system SHALL render `/systems/:systemId` from five reads this view
issues itself — the interior, the requester's own fleets, the open system's
station, the market price board, and the galaxy graph it resolves system
names from — plus the corporation session read the surrounding layout
already makes.
```

and add the fifth bullet after the market-price-board bullet:

```
- **The galaxy graph**, read through `galaxy-generation`'s graph read, used
  only to resolve a system id to a display name for the fleet roster's
  rows, the vitals strip's fleet cell, and the sighting log. It drives no
  offer and no command; IF it fails, THEN a system reads by its raw id and
  nothing else is withheld.
```

(b) The "never from a fifth read" sentence — the ordinal is now wrong:

```
The requester's credit balance SHALL come from the ambient corporation
session read the surrounding layout already makes (`corporation-spawn`'s
balance-bearing session bootstrap), never from a further read issued by this
view.
```

(c) The strip clause:

```
The vitals strip this view mounts (`system-console`) SHALL be driven by the
own-fleets read, the interior read (for the name of a docked fleet's host),
the galaxy read (for the name of the system a fleet is in), the corporation
session read, and the world clock and its served scale — alongside every
other reader of those same reads, and never from a read the strip issues
itself.
```

### MAJOR 5 — the credits cell drops three clauses of the requirement it re-homes

**Lands on:** `specs/system-console/spec.md`, *The Credits Cell Shows the
Corporation's Served Balance and Announces Its Changes*.

Three clauses of `openspec/specs/docked-fleet-actions/spec.md:594-616` do
not travel:

1. > the announced copy uses the same `figure-formatting` presentation as
   > the visual readout

   Load-bearing against `figure-formatting` R12 (only the formatter produces
   figure text) — the live region is text a player hears, and dropping the
   clause is exactly how a hand-assembled announcement string enters.
2. > never a placeholder that a mounting view supplying no balance at all
   > would render indistinguishably and permanently

   The anti-degenerate clause: without it, "Unavailable" forever is a
   passing implementation.
3. > the region SHALL NOT render as empty text when the balance becomes
   > unavailable

   Present only in the delta's scenario, not in its requirement body.

**Fix.** In the delta's requirement body, replace:

> and SHALL announce a balance change to assistive technology at the moment
> it updates.

with:

```
and SHALL announce a balance change to assistive technology (an `aria-live`
region or equivalent) at the moment it updates, not solely as a visual
change; the announced copy uses the same `figure-formatting` presentation as
the visual figure.
```

and replace:

> IF the session balance is unavailable, THEN the cell SHALL show an
> explicit unavailable indication and SHALL NOT show a figure — never
> `figure-formatting`'s generic absent form in place of this capability's
> own mandated copy.

with:

```
IF the session balance is unavailable, THEN the cell SHALL show an explicit
unavailable indication and SHALL NOT show a figure — never a placeholder
that a mounting view supplying no balance at all would render
indistinguishably and permanently, and never `figure-formatting`'s generic
absent form in place of this capability's own mandated copy.
```

and append to the transition sentence:

```
… SHALL be announced through that same live region, which SHALL NOT render
as empty text when the balance becomes unavailable.
```

### MAJOR 6 — the pill's burn-target naming has no rule for a point target or an unresolvable body

**Lands on:** `specs/system-console/spec.md`, *The Fleet Cell's State Pill Is
a Projection of the Shared Roster Derivation*.

**Offending text:**

> under way (naming the burn's served target and the remaining duration)

and its scenario:

> - **THEN** the pill names the burn's served target and a remaining
>   duration …

`frontend/lib/types/fleet.ts`'s `BurnTarget` is:

```ts
export interface BurnTarget {
  BodyId: string | null
  Point: Vec3 | null
}
```

Exactly one of the two. A **point** target has no name at all — and the
point path is not exotic: it is what `select-pan-target-point`, the control
this very change spends a requirement protecting, produces. A **body**
target has only an id, which resolves to a label only through the interior
read that this same requirement already concedes can fail (*An unresolvable
host degrades the pill, it does not blank it*). The chain doc's own example
is `Burning · feat-extra-0 · 2m 40s` — a raw id — so naming by id is
acceptable; it just has to be said.

**Fix.** In the requirement body, replace "under way (naming the burn's
served target and the remaining duration)" with:

```
under way (naming the burn's served target — the served body id, resolved to
that body's name where the interior read resolves it, or an explicit
"a point in space" where the served target is a point rather than a body,
since a point target carries no name — and the remaining duration)
```

and add:

```
#### Scenario: A burn toward a point in space names the point, not an empty target
- **WHEN** the acting fleet's effective state is a burn whose served target
  is a point rather than a body
- **THEN** the pill reads the under-way state naming the target as a point
  in space, with its remaining duration, never an empty or missing target
```

### MAJOR 7 — the strip's bottom edge has three existing occupants, and one of them carries a live retry affordance

**Lands on:** `tasks.md` 8.1, and *The Strip Is Laptop-First and Never
Overflows the View*.

Three things are anchored where the strip goes:

1. **The command column** — `SystemSpaceView.tsx:791`:
   ```tsx
   <div className="pointer-events-none absolute inset-y-4 right-4 flex w-72 max-w-[85vw] flex-col gap-3 overflow-y-auto [&>*]:pointer-events-auto">
   ```
   `inset-y-4` runs it to 16px from the bottom, so its last ~40px sit over
   the strip's credits and clock cells and its children (`pointer-events-auto`)
   eat their pointer events. The column dies in 2b; until then it must not
   cover the instrument that replaced its own readouts.
2. **`sightings-unavailable`** — `SystemSpaceView.tsx:759`, `absolute
   bottom-4 left-1/2 -translate-x-1/2`. It carries the retry affordance
   `system-space-view`'s *The Sweep Surface's Reads Fail Independently…*
   mandates. Occluded by the strip, a live requirement becomes unreachable.
3. **The camera cluster** — `SpaceStage.tsx:609`, `absolute bottom-4
   left-1/2`. Covered by task 9.x, but nothing says where it goes; the chain
   doc says bottom-right above the strip.

`R14` as written ("without horizontal overflow … inside the viewport
bounds") is satisfied by a strip that is entirely hidden under the command
column, so it does not catch this.

**Fix.** Task 8.1 becomes:

```
- [ ] 8.1 Mount the strip full-width across the foot of `SystemSpaceView`,
      supplying the own-fleets read, the interior and galaxy reads the pill
      needs, the corporation session, the world clock and its served scale,
      and the roster derivation's output; and clear the bottom band for it —
      raise the command column's bottom inset above the strip
      (`SystemSpaceView.tsx:791`'s `inset-y-4`), lift `sightings-unavailable`
      (`:759`) above it so its retry stays reachable, and re-anchor the
      camera cluster bottom-right above it (`SpaceStage.tsx:609`)
```

and add a scenario to *The Strip Is Laptop-First and Never Overflows the
View*:

```
#### Scenario: No other floating surface covers a strip cell
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the
  command column, the camera cluster, and a failed sightings read all
  present
- **THEN** no cell of the strip is overlapped by any of them, and each of
  those surfaces remains fully visible and activatable itself
```

### MAJOR 8 — extending `roster-status.ts` must be additive-only, or the roster row's copy changes under it

**Lands on:** `tasks.md` 1.1 and 1.2; RULING 14's premise.

`FleetRoster.tsx` renders the derivation's fields **verbatim**:

```tsx
<span className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[status.tone]}`} />   // :188
<span className="truncate">{status.activity}</span>                              // :197
text={formatByUnit(status.remainingMs, scale, 'world-ms-span-left')}             // :202
```

So the obvious implementation of "the pill needs `Holding`" — teaching
`rosterRowStatus` to return `activity: 'Holding'` for a stationkeep park —
**changes the roster row's rendered copy**, which contradicts task 1.2 ("the
row is unaffected") and would falsify RULING 14's "the roster row takes no
delta" after the fact. The current derivation has no `Holding` at all
(`roster-status.ts:86-91` returns `'Docked'` or `'On station'`).

**Fix.** Tasks 1.1 and 1.2 become:

```
- [ ] 1.1 Extend `roster-status.ts` ADDITIVELY: `tone`, `where`, `activity`
      and `remainingMs` SHALL return byte-identical values for every input
      they return today, and the pill's new distinctions — park mode, the
      docked host's id, the burn's served target, the station-keeping rate,
      the mining run's ETA — arrive as NEW optional fields the roster row is
      free to ignore. Naming the stationkeep park needs `Park.Kind`, an
      opaque wire enum already hard-coded in two places
      (`FleetActionsPanel.tsx:310-311`, `space-scene.ts:589,602`): export
      `PARK_KIND_ORBIT`/`PARK_KIND_STATIONKEEP`/`PARK_KIND_POINT` once from
      `lib/types/fleet.ts` beside the existing `SHIP_MODE_*` constants and
      repoint both existing sites, so the derivation is not the third copy
- [ ] 1.2 Keep every existing `roster-status.test.ts` case asserting the old
      four fields exactly — that table is the additive-only check — and add
      cases for the new fields only; re-run `FleetRoster.test.tsx` to
      confirm the row is unaffected
```

### MAJOR 9 — "no branch on `Fleet.state` inside the strip" is an unenforceable prohibition; make it a signature

**Lands on:** `specs/system-console/spec.md`, *The Fleet Cell's State Pill Is
a Projection of the Shared Roster Derivation*, and `tasks.md` 3.1.

**Offending text** (requirement) — and it is *five* prohibitions, which is
the count link 1 burned through before it found a check:

> and SHALL NOT branch on `Fleet.state`, `attachedTo`, a park kind, or an
> action ETA inside the strip

and (task 3.1):

> with no local branch on `Fleet.state`, `attachedTo`, park kind, or action
> ETA inside the strip

Link 1's Taught record (`docs/plans/system-hud/chain.md`, Link 1):

> **Enumerating prohibitions never closed the invariant; a computable check
> did.** Five formulations failed … What held was making an element's text a
> **total function of its own attributes** … and checking it.

The same move is available one level up, and it is cheaper here: **give the
pill a signature that cannot see the fields it must not branch on.**
`VitalsStripPill({ status, stranded })` with `status: RosterRowStatus` and
`stranded: boolean` — no `Fleet` in scope, so `Fleet.state`, `attachedTo`,
`Park.Kind` and any action ETA are not merely forbidden, they are a type
error. The corresponding assertion is a property rather than an enumeration:
two `RosterRowStatus` values that are equal render identical pill text.

**Fix.** In the requirement, replace the prohibition clause with:

```
and SHALL render from that derivation's output value alone — the pill SHALL
NOT be supplied the fleet record, so `Fleet.state`, `attachedTo`, the park
kind and any action ETA are unreachable from it rather than merely
forbidden to it.
```

and replace the agreement scenario:

```
#### Scenario: The pill is a function of the derivation's output alone
- **GIVEN** two fleets in different served states whose derivation output is
  equal
- **WHEN** the pill is rendered for each, supplied only that output value
  and the served `stranded` flag
- **THEN** the two pills render identical text, and no second derivation of
  fleet state exists in the strip
```

(Keep the existing *The pill and the roster row are functions of one
derivation* scenario; this one is the check, that one is the claim.)

Task 3.1 becomes:

```
- [ ] 3.1 Render the pill from a props signature of exactly the derivation's
      return value plus the served `stranded` flag — the pill component
      never receives a `Fleet`, so a branch on raw fleet state is a type
      error rather than a review finding
```

### MAJOR 10 — a gauge that speaks its fill needs a `data-unit` token that does not exist

**Lands on:** `specs/system-console/spec.md`'s hold-cell requirement, and
`tasks.md` 1.3.

**Offending text** (hold cell):

> Each segment SHALL be identified by its kind and its tonnage **in text or
> an accessible name**, so the segmentation is never conveyed by colour
> alone.

and task 1.3:

> each segment's accessible name carrying its kind and tonnage; … any
> `aria-valuetext` or accessible name it renders is produced by
> `@/lib/format`

`FigureUnit` (`frontend/lib/format/figures.ts:18-29`) is a closed vocabulary
of eleven tokens — `world-ms-span-{in,left,ago,bare}`, `world-ms-instant`,
`tons`, `range`, `delta-v`, `credits`, `tons-per-world-{ms,s}`. **None of
them is a ratio, a percentage, or a fill.** RULING 6 says a strip figure
needing a form the vocabulary lacks extends the vocabulary via a
`figure-formatting` MODIFIED delta — which this change does not have and is
not scoped to add. So the "or an accessible name" alternative silently
invites either an unspecced token or a hand-assembled string that violates
R12.

It also collides with MAJOR 3: an accessible-name-bearing segment inside
`hold-<kind>` is a second `[data-raw]`-adjacent figure in a subtree the e2e
`digits()` helper requires to hold exactly one.

**Fix.** Take the alternative away — the gauge is decorative and every
number is text (design.md Decision 1). Replace the sentence with:

```
Each segment's kind and tonnage SHALL be rendered as text in the cell — the
gauge itself SHALL expose no figure, no fill percentage and no accessible
value, so the segmentation is never conveyed by colour alone and no figure
form outside `figure-formatting`'s closed unit vocabulary is introduced.
```

and task 1.3:

```
- [ ] 1.3 Build a shared gauge atom: a plain fill-ratio variant (fuel) and a
      kind-segmented variant (hold), both over the served `cargoCapacity`
      denominator, segments ordered stably by kind in zinc-family shades.
      The gauge is DECORATIVE — `aria-hidden`, no `data-raw`, no
      `aria-valuenow`/`aria-valuetext`, no percentage, no accessible name;
      every number a player or a test reads is an adjacent `<Figure>` in the
      cell's text
```

Task 1.4's "accessible names" bullet becomes "the gauge exposes no
accessible value, and the cell's text carries every kind and tonnage".

### MAJOR 11 — the camera-cluster test breakage is fourteen tests, not four

**Lands on:** `tasks.md` 9.5, and the change's sizing claim.

The analyst's § 7.1 counts four breaking tests. `camera-pan-right` is used
as a generic "move the camera" lever across
`components/space/SpaceStage.interaction.test.tsx` — lines 188, 211, 239,
291, 320, 331, 355, 368, 401, 465, 516, 532, 547 — inside **fourteen**
tests:

```
184 A keyboard control selects the point at the camera's pan target
205 A keyboard-only player can pan to a point away from the star
236 Pan keys translate the camera's target
245 SDET-added: the pan input is a DISTINCT control from the orbit input
278 Keyboard input at a clamp is distinguishable from no input
316 Recenter restores default framing on demand
329 Recenter is reachable from the keyboard
352 Activating a camera control does not change the selection
364 Camera state survives a selection change and a realtime refetch
397 Camera resets when the system changes
461 An off-screen body is selectable the same way
513 Picking survives camera movement
530 A point-in-space click resolves correctly after camera movement
545 A click beyond the pick radius still clears the selection after camera movement
```

Nine of those (316 onward) belong to requirements this change does not
touch — recenter, selection survival, pick radius. They only *use* the pan
button to move the camera. That is where a silent selection regression
hides, and "rewrite the pan-button-dependent tests" reads like four.
`camera-orbit-right`/`-up` at 355, 518, 533, 549 break too once the orbit
buttons collapse (BLOCKER 4).

This does **not** need a new task — it needs 9.5 to say what it is:

```
- [ ] 9.5 Repoint every `SpaceStage.interaction.test.tsx` test that drives
      the camera through a deleted button — fourteen tests reference
      `camera-pan-*`/`camera-orbit-*`, and nine of them belong to
      requirements this change does not touch (recenter, selection
      survival, pick radius) and merely used the pan button as a
      camera-mover. Drive them by the new `Shift`+arrow pan and the single
      `camera-orbit` cell instead; assert the at-limit tests against
      `data-pan-at-limit`/`data-orbit-at-limit`; re-run the
      `select-pan-target-point` tests unmodified
```

### MAJOR 12 — the fleet cell must survive "no acting fleet" without losing its chevron

**Lands on:** *The Vitals Strip Is Present…*'s fourth scenario, read against
*The Fleet Cell Names the Acting Fleet…*.

**Offending text:**

> #### Scenario: With no acting fleet the fleet-scoped cells read absent, not empty
> - **WHEN** the view renders with no own fleet in this system
> - **THEN** the fleet, fuel and hold cells show the absent form …

"The fleet cell shows the absent form" reads as the whole cell going blank —
including the chevron, which is the only affordance that can *fix* the
situation by switching to a fleet elsewhere. And "no own fleet in this
system" is not the same condition as "owns no fleets": `SystemSpaceView.tsx`
keeps `allFleets` (:268) unfiltered and `here` (:269) filtered, so the
chevron's menu is non-empty in the first case and empty in the second.

**Fix.** Replace that scenario with these two:

```
#### Scenario: With no acting fleet the fleet-scoped figures read absent and the chevron stays
- **WHEN** the view renders with no own fleet in this system while the
  requester owns fleets elsewhere
- **THEN** the fleet cell's identity and its fuel and hold figures show the
  absent form, the credits and clock cells still show their figures, and the
  chevron is still present and still lists the fleets the requester owns
  elsewhere

#### Scenario: A requester owning no fleet at all still gets the strip
- **WHEN** the view renders for a requester who owns no fleet anywhere
- **THEN** the strip is present, the fleet, fuel and hold cells show the
  absent form, the chevron's menu is empty rather than absent, and the
  credits and clock cells still show their figures
```

---

## MINOR findings

- **MINOR 1 — *The Strip Announces Only Its Own Balance Changes*'s
  scenario is loose.** "THEN exactly one announcement is made" is untestable
  as stated on a page carrying four live regions (`space-announcer`,
  `balance-live-region`, `panel-error-live-region`, `camera-limit-status`).
  Replace the THEN with:
  ```
  - **THEN** exactly one live region announces the landing — the mounting
    view's own announcer — and no strip element announces it
  ```

- **MINOR 2 — the `in transit` pill state is not reachable through the
  view.** `SystemSpaceView.tsx:596-604` pushes `/` as soon as the acting
  fleet stops being present in the open system, and `here` (:270) filters
  transit fleets out, so a strip mounted by the view shows `In transit` only
  in the frame before navigation. Task 3.4 ("all seven pill states") should
  say the transit and drifting states are asserted against the strip
  component directly, not through `SystemSpaceView`.

- **MINOR 3 — task 8.2's "re-anchor its failed-command live region" reads
  like a code move.** `panel-error-live-region`
  (`FleetActionsPanel.tsx:371-373`) is a sibling of the balance block, not
  inside it; nothing moves. Reword to "leave `panel-error-live-region` in
  place and re-point its comment and its test at this capability's new *A
  Failed Command Is Announced to Assistive Technology*".

- **MINOR 4 — the colour validator will bite the gauge segments.**
  `.claude/scripts/check-color-compliance.py` rejects `dark:bg-zinc-800`
  outright ("not in the palette"), and `bg-zinc-100` / `text-zinc-900` /
  `border-zinc-200` without a dark variant. Zinc-family segment shades must
  be picked from the palette in `frontend/CLAUDE.md:75-88` with dark
  variants, and the fill must be expressed as inline `style={{ width }}`
  geometry rather than a computed colour class. Worth one line in the impl
  contract; it is a per-commit gate failure otherwise.

- **MINOR 5 — `hold-<kind>` segment ordering.** RULING 20 says "ordered
  stably by kind", and the requirement says "one segment per resource kind
  the served cargo pool holds". `Object.entries(held)` (the panel's current
  approach, `FleetActionsPanel.tsx:399`) is insertion-ordered by the wire,
  not stable. The spec's "ordered stably by kind" needs the sort to be
  explicit in task 1.3 ("sorted by kind name, so two reads of the same pool
  render the same order").

---

## The four attack points, answered

**1. The capability boundary (RULING 1) — sound, with two leaks, both fixed
above.** `system-console` as a capability is correctly drawn: the split
"canvas and picking" vs "what floats over it" survives the dock, the tabs,
`Esc`, open-on-select and the selected-entity tab, because none of those is
a claim about the strip. The chevron requirement is *particularly* well
drawn — "the strip itself decides nothing about what switching means"
survives 2b adding "and opens the dock on that fleet's tab" with no edit.
`Activating the Strip Changes No Space-View Selection` also survives: it
constrains the *selection*, so a strip cell that later expands the dock does
not falsify it.

The two things 2b would have had to rewrite are MAJOR 1 (a scenario
asserting the verbs stay on the fleet panel — 2b moves them) and MAJOR 2
(the strip pinned to the viewport's bottom edge — 2b puts a 164px dock
beneath it). Nothing else in `system-console` presumes the strip is the
whole console.

**2. The one-derivation rule's enforcement shape — currently unenforceable;
MAJOR 9 gives the checkable one.** "SHALL NOT branch on `Fleet.state`,
`attachedTo`, a park kind, or an action ETA inside the strip" is four
prohibitions and a review opinion; nothing in the per-commit gate can decide
it. Making the pill's props exactly `RosterRowStatus` + `stranded` turns it
into a type error, and the paired assertion is a property (equal derivation
output ⇒ identical pill text) rather than an enumeration. That is link 1's
lesson applied to state instead of text. MAJOR 8 is its necessary
companion: the invariant is only true if the derivation's extension is
additive, because the roster row renders `activity` verbatim.

**3. The seam (RULING 9) — it holds. Nothing in the 40 tasks needs the
lift.** Checked task by task: the strip's drain marker (4.3) reads
`Fleet.state`'s burn mode, not a preview; the fuel gauge's denominator is
`cargoCapacity` and the fill is served tonnage; no cell reads
`BurnPreview`; `SpaceCommandPanel` is not opened by any task in this change.
Nor does the fuel cell need a shape it cannot have yet — the overlay is one
extra segment drawn on a gauge whose scale this change fixes, which is
additive. The one thing the seam *does* leak is a decision, not code: the
denominator I rule here is 2a-ii's overlay scale, so it had to be ruled
here rather than deferred, and I have recorded the forward constraint
(`fuelCostTons > cargoCapacity` needs a clamp rule) in `design.md` so 2a-ii
does not re-litigate it.

**4. Layering and the anti-mirror fence — clean, with one exception to
formalise.** No requirement or task smuggles in fuel-per-delta-v, a
shortfall, an affordability verdict, or a range: R5 says "SHALL NOT compute
or re-derive either figure", R7 explicitly names `backend/space` as the
owner of fuel-per-delta-v and forbids interpolation, and the holding-rate
scenario says "never a rate derived from the host's orbital elements". The
strip issues no read (R11) and — verified against `SystemSpaceView.tsx` —
does not need one (`design.md` Decision 6 tabulates all seven inputs to
existing view state).

The analyst's one client-derived raw, **hold used = `capacity − freeHold`,
is presentation arithmetic and stays**: it is subtraction of two served
fields with no rule in it, it is already sanctioned verbatim by the live
requirement being re-homed (`docked-fleet-actions/spec.md:146-149` — "the
used capacity is derived client-side … and carries its raw value, not 'raw
served value' — it is computed, not itself a field the server returns"), and
the delta carries that distinction forward correctly. The one guard worth
stating: the derivation must run in that direction only. `freeHold` is
served and authoritative; computing *free* from a client-derived *used*
would drop the server's own figure.

The genuine fence issue is `Park.Kind` (MAJOR 8): the `holding` pill state
needs `space.ParkKind`'s iota, which two client sites already hard-code as
bare `0`/`1`/`2`. That is naming a wire enum, not mirroring a rule — but it
must be one exported constant set, not a third copy.

---

## Sizing

`tasks.md` is at exactly 40 (4+4+4+4+3+4+4+5+5+3). **My findings add zero
net tasks.** Everything folds into existing task text:

| Finding | Folds into |
| --- | --- |
| BLOCKER 1 (Purpose restore) | 10.3 |
| BLOCKER 2, 3 (spec text) | no task — writer edits deltas |
| BLOCKER 4 (cluster restructure, orbit at-limit) | 9.1, 9.3 |
| MAJOR 3 (testids + DOM shape) | 8.3 |
| MAJOR 7 (bottom-edge occupants) | 8.1 |
| MAJOR 8 (additive derivation, park-kind constants) | 1.1, 1.2 |
| MAJOR 9 (pill signature) | 3.1 |
| MAJOR 10 (decorative gauge) | 1.3, 1.4 |
| MAJOR 11 (14 tests) | 9.5 |
| MINOR 2, 3, 5 | 3.4, 8.2, 1.3 |

Nothing needs to defer to `add-burn-cost-overlay` or 2b. If the panel's
other reviewers add tasks and the change goes over 40, the first candidate
to move is **the camera cluster shrink (§ 9, five tasks)** — it is
independent of every strip requirement, its only coupling to this change is
that the strip takes the bottom edge, and it could ride `add-burn-cost-overlay`
unchanged. The analyst already measured and rejected that split (§ 7.3) for
a change that was over the cap; as a *relief valve* for a change that is at
it, it remains the cleanest cut. Do not cut the panel-readout deletions
(§ 8) — RULING 7 forbids coexistence, and they are what this change is for.

---

## What I did not touch

- `proposal.md`, `tasks.md`, and the four spec deltas are unedited; every
  fix above is text for the spec writer to apply.
- No ruling is overturned. RULING 17 (testids) and RULING 10 (four cells) are
  extended rather than reversed — both are right about what they decided and
  silent about a case that turns out to be load-bearing.
- The two routed questions are ruled in this file and in `design.md`
  Decisions 1 and 3; append them to
  `add-vitals-strip-rulings.md`'s "Routed to the panel" section as the
  rulings file's own convention expects.

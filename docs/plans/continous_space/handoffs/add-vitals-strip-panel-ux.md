# `add-vitals-strip` — UX panel review

Reviewer: UX specialist, review panel for `add-vitals-strip` (chain link 2a).
Scope: `openspec/changes/add-vitals-strip/{proposal,design,tasks}.md`, its four
spec deltas, the analyst's decomposition and the 21 FULL-AUTO RULINGs, the
`system-hud` model and chain docs, the live specs it touches
(`fleet-roster`, `docked-fleet-actions`, `system-space-view`,
`figure-formatting`), and the code (`FleetActionsPanel.tsx`, `SpaceStage.tsx`,
`SystemSpaceView.tsx`, `roster-status.ts`, `fleet.ts`).

This capability has real user-facing surface (a persistent instrument strip
and a camera-cluster shrink), so a full review applies.

**Overall read:** the deltas are unusually disciplined about absent-vs-zero
for the primary text figures (fuel, hold, credits) — the exact hazard the
prompt asks me to re-check is *fixed* at the figure level. The gaps I found
cluster in three places: (1) the pill's coverage is incomplete against its
own seven named states, (2) the gauge's own "no fill" vs "empty fill"
distinction is asserted but not mechanised, and (3) the chevron — the strip's
one interactive element — has no accessibility requirement of its own at all,
which is a bigger gap than its "one control" size suggests. None of these
need new components; they are missing scenarios and one clarifying sentence
each. I did not find a case where the strip actively lies about state — the
place that risk concentrates (the pill/roster agreement rule, RULING 4/14,
and the stranded adornment, RULING 13) is well specified.

---

## Priority 1 — the five states, per cell

### Finding 1 [MAJOR] — R1 promises a failed-own-fleets-read state it never scenarios

**Requirement:** *The Vitals Strip Is Present on Every Render of the System
Space View*

**Quote:**
> The system SHALL render a single full-width strip along the bottom edge of
> the system space view on every render of that view, **including while the
> interior read has failed, while the own-fleets read has failed**, and while
> the renderer is unavailable.

The requirement's own SHALL text names three failure/degraded conditions the
strip must survive. Its scenario list has exactly one scenario per condition
— except the own-fleets read:

- "The strip renders with every read resolved" (ideal)
- "The strip survives a failed interior read" (interior failure ✓)
- "The strip survives an unavailable renderer" (renderer failure ✓)
- "With no acting fleet the fleet-scoped cells read absent, not empty" (no
  fleet in system)

**There is no scenario for "the own-fleets read has failed."** Tasks 7.1/7.4
both list "failed own-fleets" as part of the always-present matrix that must
be built and tested, so the intent is there — it just never became a
scenario, and per the spec-quality bar a requirement's prose promise with no
matching scenario is exactly the gap that gets silently satisfied by an
implementation that conflates "read failed" with "read resolved to zero
fleets here," which are observably different states for the player (one
means "you truly have nothing here," the other means "the network is having
a bad day and your fleet's true location is unknown"). `system-space-view`'s
sibling fan-in rule gives the *panel* an explicit error-plus-retry surface
for this exact condition; nothing says what the *strip* does, only that it
survives.

**Proposed scenario** (append under *The Vitals Strip Is Present on Every
Render of the System Space View*):

```
#### Scenario: The strip survives a failed own-fleets read
- **WHEN** the own-fleets read fails
- **THEN** the strip is still rendered, its fleet, fuel and hold cells show
  the absent form exactly as the no-acting-fleet case does, and the strip
  itself renders no error or retry affordance of its own — the failure is
  surfaced on the fleet panel, which owns the own-fleets read's error and
  retry surface
```

Cheap: one scenario, no new mechanism (it reuses the existing absent-form
path). Stays in this link.

---

### Finding 2 [MAJOR] — the "no acting fleet" case leaves the chevron's fate unstated, and it is the strip's only way out of that state

**Requirement:** *The Vitals Strip Is Present on Every Render of the System
Space View* (R1) and *The Fleet Cell Names the Acting Fleet and Delegates a
Switch to the Mounting View* (R3)

**Quote (R1):**
> WHEN the view renders with no own fleet in this system... the fleet, fuel
> and hold cells show the absent form and the credits and clock cells still
> show their figures

This is an *ordinary*, frequent state, not an edge case: opening any system
the player has not travelled a fleet to yet — which is most systems, most of
the time — puts the fleet cell here. `system-space-view`'s existing fan-in
logic (verified in code:
`allFleets.find(f => f.id === actingFleetId) ?? here[0] ?? null`) already
confirms a player with fleets only elsewhere lands on this state on first
open of any new system.

R1 says the fleet cell "shows the absent form," but the fleet cell is not
just a figure — it is an identity **plus a chevron**. Nothing says whether
the chevron survives that absent state. Read literally, "the cell shows the
absent form" could mean the whole cell — chevron included — degrades to
inert, which would make the strip's chevron useless in precisely the
situation where a player most wants it: "I'm looking at a system with none
of my own fleets here — let me check what my fleet is doing, or bring it
here." Losing the chevron here doesn't strand the player (the roster panel
still offers row selection), but it is a missed, unstated affordance on the
one control this whole capability adds, and an implementer following R1's
letter could reasonably delete it.

**Proposed fix** — add one clarifying sentence to R3 and one scenario:

Append to *The Fleet Cell Names the Acting Fleet and Delegates a Switch to
the Mounting View*'s body:
> WHEN there is no acting fleet, the identity SHALL show `figure-formatting`'s
> absent form but the chevron SHALL remain present and interactive, so a
> player viewing a system with none of their own fleets present can still
> reach and switch to any owned fleet from the strip.

```
#### Scenario: The chevron survives the no-acting-fleet state
- **WHEN** the view renders with no own fleet in the open system
- **THEN** the fleet cell's identity shows the absent form, and the chevron
  is still present and opens the same menu of every owned fleet
```

Cheap: one sentence, one scenario, no new mechanism. Stays in this link.

---

### Finding 3 [MAJOR] — the gauge's "no fill" vs "empty fill" distinction is claimed but not mechanised; this is the link-1 hazard, recurring at the gauge layer

**Requirements:** *The Fuel Cell Shows the Served Fuel Tonnage and Estimated
Range Over a Gauge* and *The Hold Cell Shows Used, Total and Free Tonnage
Over a Kind-Segmented Gauge*

**Quotes:**
> WHEN either figure is unavailable on the fleet read, the cell SHALL show
> that figure's absent form and **the gauge SHALL render no fill**, rather
> than a zero fill indistinguishable from a dry fleet.
> ...
> A dry fleet reads zero, distinguishably from absent — WHEN the served fuel
> is 0 → the figure reads `0.0 t` and **the gauge shows an empty fill**,
> distinct from the absent state above.

The prompt asks specifically to re-check this hazard cell by cell, because
link 1 shipped exactly this defect (`?? 0` reading `0t fuel`, indistinguishable
from a dry fleet, found by review not by tests) in the *text* figure. This
delta correctly fixes the text figure for both fuel and hold — the absent
form and the zero form are lexically distinct (`—` vs `0.0 t`), and both cells
have an explicit scenario proving it. That part is solid; I am not padding a
finding on it.

But the **gauge itself** gets a separate, additional claim ("no fill" vs
"empty fill" are "distinct") that nothing makes testable. A 0%-width fill and
a "no fill" fill are, absent some other signal, the *same rendered pixel
state* — an implementer satisfies "the gauge SHALL render no fill" and "the
gauge shows an empty fill" with the identical `width: 0` and the scenario
text would still read as true in prose while being visually and
programmatically identical in the DOM. The hold cell has the same shape:
"An empty hold shows no segments" and "An unloaded roster reads as absent...
no segments render" are, again, the *same* rendered state (a gauge with zero
segments) — that one is defensible because the adjacent text figures already
carry the distinction (`— / — · —` vs `0 t / 200 t · 200 t free`), but for
fuel, the requirement text implies the gauge *itself* should differ, and
gives no mechanism for how.

Given the design decision that the fuel and hold gauges share one atom (task
1.3), this is the cheapest possible place to fix it — one attribute on the
shared atom, tested once, inherited by both cells.

**Proposed fix** — add to the shared-atom decision's governing requirements
(both R5's and R8's absent-vs-zero clauses get the same clarifying clause;
shown once for R5, apply identically to R8):

Append to *The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range
Over a Gauge*:
> The gauge SHALL expose which of its three states it is in — no data,
> empty, or filled — as a DOM-observable attribute of the gauge element
> itself, not only via the adjacent figure text, so "no fill" and "empty
> fill" are distinguishable by inspecting the gauge in isolation.

```
#### Scenario: The gauge's absent and empty states are DOM-distinguishable
- **WHEN** the fuel gauge is inspected once for an unserved roster and once
  for a served, zero fuel tonnage
- **THEN** the two renders differ in a DOM-observable attribute of the gauge
  element, not only in the adjacent figure's text
```

Cheap: one attribute on the atom already being built (task 1.3/1.4), one
scenario. Stays in this link — deferring would ship the known hazard.

---

### Finding 4 [MAJOR] — three of the pill's seven named states have no scenario

**Requirement:** *The Fleet Cell's State Pill Is a Projection of the Shared
Roster Derivation*

**Quote:**
> The pill's states are: **docked** (naming the host...), **under way**
> (naming the burn's served target...), **holding** (naming the served
> station-keeping rate...), **mining** (naming the run's remaining
> duration...), **drifting**, **in transit**, and **on station**.

Seven states are named in the requirement's own prose. The scenario list
covers docked, under way, holding, and mining — four. **Drifting, in
transit, and on station have no scenario at all.** `roster-status.ts`
already returns these as `activity: 'Drifting'`, `'In transit'`, `'On
station'` with no further derivation work needed (task 1.1's field list
doesn't touch them), so this is not a missing-field problem — it's a missing
proof that the pill actually surfaces them. "On station" in particular is
the ordinary idle-undocked state a freshly-spawned fleet sits in before its
first order — an everyday state, not an edge case — and "in transit" is what
the pill shows for the whole duration of a jump. Both are exactly the kind
of state the five-states audit exists to catch: common, reachable, and
currently unproven.

**Proposed scenarios** (append under *The Fleet Cell's State Pill Is a
Projection of the Shared Roster Derivation*):

```
#### Scenario: An idle, undocked fleet's pill reads on station
- **WHEN** the acting fleet's effective state is a park with no `attachedTo`
  set
- **THEN** the pill reads the on-station state, with no countdown

#### Scenario: A drifting fleet's pill reads drifting
- **WHEN** the acting fleet's effective state is a drift
- **THEN** the pill reads the drifting state, with no countdown

#### Scenario: A fleet mid-jump's pill counts down to its lane arrival
- **WHEN** the acting fleet's `jump` field is set
- **THEN** the pill reads the in-transit state and a remaining duration to
  the jump's arrival, presented per `figure-formatting`
  (`world-ms-span-left`)
```

Cheap: three scenarios over an existing, already-served derivation. Stays in
this link (folds into task 3.4, "test all seven pill states," which the
task list already promises but the spec doesn't yet back).

---

### Finding 5 [MAJOR] — a point-target burn risks naming raw coordinates on the pill, reintroducing fault #1

**Requirement:** *The Fleet Cell's State Pill Is a Projection of the Shared
Roster Derivation*

**Quote:**
> **under way** (naming the burn's served target and the remaining
> duration)

`BurnTarget` (`frontend/lib/types/fleet.ts`) is "exactly one of a body id or
an explicit point" — `{ BodyId: string | null; Point: Vec3 | null }`. A
burn can target either. For a body target, "naming the target" as its raw id
(e.g. `feat-extra-0`) is consistent with this codebase's established
convention (no display names exist anywhere; the model doc's own example —
`Burning · feat-extra-0 · 2m 40s` — uses exactly this). But nothing in the
requirement, the analyst's `roster-status.ts` extension notes (task 1.1
names "burn target" as a field to add, with no further detail), or the
design doc says what "naming the target" means when `BodyId` is null and
the burn is aimed at a raw point. A literal reading of "naming the served
target" applied to a `Vec3` produces exactly the fault the entire
`add-figure-formatting` link existed to kill — `{X: 1234.56, Y: ...}` reaching
the player's eye, on the one surface (the pill) whose job is to be the
always-legible instrument.

**Proposed fix** — add to the pill requirement's body and one scenario:

Append to *The Fleet Cell's State Pill Is a Projection of the Shared Roster
Derivation*:
> WHEN the burn's served target is a point rather than a body, the pill
> SHALL name it without rendering the point's raw coordinate components —
> as a point target, not as X/Y/Z figures — consistent with `figure-
> formatting`'s prohibition on a raw wire number reaching player-facing copy.

```
#### Scenario: A point-target burn's pill names it without raw coordinates
- **WHEN** the acting fleet's effective state is a burn whose served target
  is a point, not a body
- **THEN** the pill's target text identifies it as a point target and
  contains no raw X/Y/Z coordinate figures
```

Cheap: one sentence, one scenario, same task (1.1/3.x) already scoped to add
the target field. Stays in this link.

---

### Finding 6 [MINOR] — the holding pill's rate figure has no stated absent-degrade

**Requirement:** *The Fleet Cell's State Pill Is a Projection of the Shared
Roster Derivation*

`stationKeepRateTonsPerSecond` is optional on `FleetRoster`
(`roster?: FleetRoster` on `Fleet`, and the rate field itself is `?:`). R4
already establishes the right *principle* elsewhere — "degrade the pill...
rather than blanking it" is exactly what the docked-host scenario does. But
that principle is only spelled out for the host-name case; the holding
state's rate figure has no equivalent scenario. This is a narrow race (state
and roster normally arrive on the same read), so I'm calling it MINOR, but
it's a one-line, same-pattern fix.

**Proposed scenario:**

```
#### Scenario: An unserved rate degrades the holding pill, it does not blank it
- **WHEN** the acting fleet's park mode is `stationkeep` but the fleet read
  has not yet served the station-keeping rate
- **THEN** the pill still reads the holding state, with the rate figure's
  own `figure-formatting` absent form, never an empty pill
```

Optional for this link; cheap enough to include, safe to defer to 2a-ii/2b
if the panel wants to hold the line at exactly what's already scoped.

---

### Finding 7 [MAJOR] — no scenario for the pill's scale-dependent figures before a world-clock scale has been served

**Requirement:** *The Fleet Cell's State Pill Is a Projection of the Shared
Roster Derivation*

`figure-formatting`'s own whole-tree invariant (*A Figure Whose Clock Scale
Has Not Been Served Reads as Absent*) is explicit and binding on every
surface: "This rule binds every mounting view and every consuming surface,
not only the one surface whose own scenario names it." Both figures the
pill's under-way and holding states render — `world-ms-span-left` (a
relative duration) and `tons-per-world-s` (a rate) — are named by that rule
as scale-dependent. `fleet-roster`'s own parallel requirement states this
explicitly, with its own scenario ("A countdown renders absent until a
scale is served"). `system-console`'s pill requirement inherits the rule by
reference ("presented per `figure-formatting`") but has no scenario proving
the pill actually degrades correctly — and this is not a rare race, it is
the ordinary state of the **first render of any system view**, before the
scale has arrived.

**Proposed scenario:**

```
#### Scenario: The pill's countdown and rate read absent until a scale is served
- **WHEN** the mounting view has not yet received a served world-clock
  `scale` and the pill would otherwise show a countdown or a holding rate
- **THEN** that figure shows `figure-formatting`'s absent form rather than
  being computed at an assumed scale of 1, while the pill's state name
  itself still renders
```

Cheap: one scenario, inherited behaviour, no new mechanism. Stays in this
link.

---

## Priority 2 — does the strip lie about state?

**This is solid.** RULING 4/14's agreement rule ("both surfaces are
functions of the one derivation's output for the same served inputs — not
that both render identical text") is stated precisely enough to survive the
adversary's most likely attack (a pill/row projection difference read as a
disagreement), and it correctly does not force `fleet-roster` to grow copy
nobody asked for. RULING 13's stranded-as-adornment (never a mutually
exclusive pill state) is correctly specified and has its own scenario
proving the activity keeps naming the fleet's real state even while
stranded — exactly the case the prompt worries about. R13 ("The Strip
Announces Only Its Own Balance Changes") doesn't merely decline to add a
second announcer — its scenario asserts "exactly one announcement is made"
on a landing while the pill is visibly flipping state, which is a real,
falsifiable non-duplication test, not a silent omission. I checked the
underlying `A Landed Resolution Is Announced to Assistive Technology`
requirement it defers to and confirmed it already covers burn arrival, jump
arrival, and mine completion generically, so the "exactly once" claim has
somewhere real to land. No finding here beyond the pill-coverage and
gauge-mechanism gaps already logged under Priority 1.

---

## Priority 3 — accessibility as testable SHALLs

### Finding 8 [MAJOR] — the chevron and its menu have no keyboard-operability requirement at all

**Requirement:** *The Fleet Cell Names the Acting Fleet and Delegates a
Switch to the Mounting View*

The camera cluster — a set of controls this same change is *shrinking* —
gets a dedicated requirement pinning tab order, a visible focus indicator,
and a testable at-limit DOM state (*Space View Camera Is Keyboard-Operable*).
The chevron — the strip's **one interactive element**, per RULING 3, and the
only thing left on this surface that can be operated at all — gets none of
that. R2's scenario ("The chevron is the strip's only interactive element")
proves scope, not operability. Nothing states that the chevron is reachable
by Tab, opens with Enter/Space, that its menu entries are navigable and
selectable from the keyboard, or that Escape closes it and returns focus to
the trigger. This is exactly the kind of gap the a11y checklist exists to
catch before the sprint, not after: "a11y that isn't in the spec won't be in
the sprint."

**Proposed new requirement** (add to `specs/system-console/spec.md`):

```
### Requirement: The Fleet Cell's Chevron and Menu Are Keyboard-Operable
The system SHALL let the player open the chevron's menu, move among its
entries, and choose one entirely from the keyboard: the chevron SHALL be
reachable via the strip's normal tab order and activatable with Enter or
Space; once open, the menu's entries SHALL be reachable via arrow-key
navigation and selectable with Enter; and Escape SHALL close the menu
without choosing an entry and return focus to the chevron.

#### Scenario: The chevron opens from the keyboard
- **WHEN** the chevron has keyboard focus and Enter or Space is pressed
- **THEN** its menu opens

#### Scenario: Menu entries are reachable and selectable from the keyboard
- **WHEN** the chevron's menu is open
- **THEN** arrow-key input moves among its entries and Enter chooses the
  focused entry, identically to a pointer click on it

#### Scenario: Escape closes the menu without choosing
- **WHEN** Escape is pressed while the chevron's menu is open
- **THEN** the menu closes, no fleet is chosen, and focus returns to the
  chevron
```

Likely cheap in practice: any conventional accessible menu-button
implementation (a native `<select>`, or a standard ARIA `menu`/`listbox`
pattern) gets this for free, so the marginal task cost should be a test,
not new logic. If the panel finds the implementation needs real new work to
satisfy it, defer the *build* to 2b (the dock, which owns more of this
surface's chrome) but do not defer the *requirement* — ship the strip
without a keyboard-operable chevron and the "no verbs" invariant (R2) has
quietly produced a control a keyboard-only player cannot reach at all.

---

### Finding 9 [MAJOR] — switching the acting fleet via the chevron gives a keyboard/screen-reader user no confirmation, and it isn't a live-region problem to solve

**Requirement:** *The Fleet Cell Names the Acting Fleet and Delegates a
Switch to the Mounting View*

The scenario "Choosing a fleet in this system sets it acting and no
navigation occurs" is correct about the *sighted* experience — identity and
pill update in place. But R13 deliberately narrows the strip to one
announcing surface ("the credits cell's own live region... is the strip's
only announcing surface"), so a live-region fix here would directly
contradict a ruling I'm not overturning. The right fix is **focus
management**, not a second live region: after a same-system choice, if focus
returns to the chevron and the chevron's own accessible name incorporates
the *now-acting* fleet's identity, a screen-reader user hears the change
without any live-region text at all — the standard, WCAG-compliant pattern
for a disclosure/menu-button whose state the trigger itself reflects.

**Proposed addition** to *The Fleet Cell Names the Acting Fleet and
Delegates a Switch to the Mounting View*:
> WHEN choosing a fleet in the open system sets it acting, focus SHALL
> return to the chevron, and the chevron's accessible name SHALL name the
> now-acting fleet, so a keyboard or screen-reader user is told the switch
> took effect without a second announcing surface.

```
#### Scenario: Focus and the chevron's own label confirm a same-system switch
- **WHEN** a fleet in the open system is chosen from the chevron
- **THEN** focus returns to the chevron and its accessible name names the
  newly acting fleet
```

Cheap: one focus-return line already implied by any correct menu-button
implementation, one accessible-name update. Does not touch R13. Stays in
this link.

---

## Priority 4 — the chevron flow

### Finding 10 [MINOR] — the menu's membership isn't pinned to live data across the interaction

**Requirement:** *The Fleet Cell Names the Acting Fleet and Delegates a
Switch to the Mounting View*

"Opens a menu of every fleet the requester owns" doesn't say whether that
membership (and each entry's same-system/elsewhere/on-lane classification)
is a snapshot taken at open time or tracks the live own-fleets read while
the menu stays open. This game is realtime (SSE-driven refetches), so the
set can change under an open menu. If the implementation reads live query
data on every render (the ordinary React pattern), this is free; if it
freezes a snapshot at open time, a stale entry could delegate against
outdated system/lane data. I'm calling this MINOR because a naive,
conventional implementation is very likely to get it right by default, but
it costs one sentence to stop it being an accident.

**Proposed addition:**
> The menu's membership and each entry's destination SHALL reflect the
> requester's own-fleets read as most recently resolved, including while
> the menu remains open across a refetch — never a snapshot frozen at the
> moment the menu opened.

Optional for this link; safe to defer if the panel judges the default
implementation pattern already covers it.

---

### What a player with one fleet sees, and what happens when a fleet is destroyed

One-fleet case is covered ("A sole owned fleet leaves the chevron's menu
with one entry... choosing it changes nothing") — acceptable as specified;
I don't think it needs to be disabled instead, that's a design call, not a
spec defect. Fleet destruction: this build has no combat/loss mechanic
reaching a fleet's death that I could find evidence of in the domain notes
or code, so I'm not treating "a fleet is destroyed while the menu is open"
as a reachable state worth a scenario in this link. If a later chain adds
fleet loss, Finding 10's live-data clause already covers the general case
(a chosen entry that's stopped existing) as long as the menu reads live
data.

---

## Priority 5 — spec altitude

Clean. I checked every requirement in the ADDED `system-console` delta for
implementation leakage (pixel values beyond the one deliberate width-floor
exception, Tailwind classes, component names, colour names) and found none.
"Zinc-family shades" (RULING 20) correctly stays in `design.md`, not the
requirement text — the requirement itself states only the testable,
observable rule ("never conveyed by colour alone... kind and tonnage
available as text or an accessible name"). Testids (RULING 17) are confined
to `design.md`/`tasks.md`; none leak into the spec deltas. Referencing
`figure-formatting` tokens by name inside requirement text (e.g. `(tons,
range)`) is the established, consistent pattern across every live spec this
change touches (`fleet-roster`, `docked-fleet-actions`) — not a new
departure, so I'm not flagging it.

---

## Priority 6 — copy

Clean. No requirement asserts on exact rendered copy where it should assert
on the `data-raw`/`data-unit` attribute contract. The pill's state copy
("reads the docked state naming that host," "shows the served rate") is
stated at the right level of precision — testable without pinning a string a
designer could change tomorrow. The credits cell's "explicit unavailable
indication" is correctly left unspecified as exact text while still being
mandatory and distinct from both the generic absent form and a real `₡ 0`.

---

## The routed question — the keyboard pan mechanism, its at-limit surface, and touch

### The mechanism

Recommend a **modifier+arrow binding on the existing focusable group**
(e.g. a held modifier + the same arrow keys that already orbit), not a
dedicated key pair. The group is already the sole keyboard target for
orbit; adding pan to the same target rather than a new one means no new tab
stop, no new mechanism to discover *where* the input lives — only *which
combination* to press there. This is the same shape the requirement's own
text already permits ("per key press") and it is the cheapest option on the
board.

### Discoverability — the real gap

The mechanism choice is not the risk; **discoverability is.** Today, a
keyboard-only or screen-reader user tabbing through the cluster hears four
individually-labelled buttons — "Pan left," "Pan right," "Pan up," "Pan
down" — announced by name. Deleting them and replacing the mechanism with an
unlabelled modifier on the group removes that announcement entirely; the
group's `aria-label="System camera"` (unchanged by this delta) says nothing
about how to pan. Nothing in the design doc proposes fixing this — it's
explicitly named as an accepted trade-off ("this change does not add
on-screen help text for it, since that is a UX decision routed to the panel
below"), but an **accessible description is not on-screen help text** and
doesn't conflict with "no on-screen pan button" or the chain's no-mobile-
layout rule. I recommend the group's accessible description (an
`aria-describedby`, not a second visible label) name the pan mechanism, so
a screen-reader user tabbing to the group learns the binding without any
visual affordance existing at all.

**Proposed addition** to `system-space-view`'s MODIFIED *Space View Camera
Is Keyboard-Operable*:
> The space view's camera controls' accessible description SHALL name the
> pan input's key binding, so a player who cannot see the deleted on-screen
> pan buttons can still discover the mechanism from the control's own
> accessible name or description.

```
#### Scenario: The camera group's accessible description names the pan binding
- **WHEN** the space view's keyboard-operable camera controls are inspected
  by assistive technology
- **THEN** their accessible name or description states the key binding that
  pans the camera
```

### The at-limit surface

Recommend routing to the **existing `camera-limit-status` live region**, not
a new attribute on the group, **with one caveat that must be pinned in the
requirement text**, not left to implementation.

The two candidate mechanisms are not equivalent in the codebase today.
`camera-limit-status`'s current computation (`atPanLimit(camera, extent)`,
imported from `space-camera.ts`) is a *radial* check — "is the pan target at
the maximum distance from the bound, in any direction" — used only for the
aggregate live-region message today. The per-button `data-at-limit`
attribute the four now-deleted buttons carried was computed differently, by
a *directional* closure (`panAtLimit(right, up)`, defined locally in
`SpaceStage.tsx`) that simulates the actual step and checks whether it
changed anything — direction-aware. The live requirement's scenario is
explicitly directional: "WHEN... input is given while the camera is already
at the... clamp **in the direction of that input**... an at-limit state...
that is absent when the same input is given **away from the clamp**." A
naive reuse of the existing aggregate `atPanLimit` (radial) for the pan
key's at-limit signal would satisfy the *letter* of "route pan's at-limit to
the existing live region" while silently failing this directional scenario
at the boundary — e.g. announcing "at the edge" on an input that would
actually move the camera *inward* along the boundary. This is exactly the
kind of implementation-vs-spec gap link 1's Taught record warns review to
catch, not tests: the scenario passes trivially if nobody notices which
`atPanLimit` got wired.

**Proposed clarifying clause** (add to `system-space-view`'s MODIFIED
*Space View Camera Is Keyboard-Operable*, alongside RULING 10's permitted
alternatives):
> WHEN the pan axis's at-limit state is surfaced via `camera-limit-status`,
> the message SHALL reflect whether the specific input direction given is
> blocked — reusing the same per-direction determination the deleted
> per-button `data-at-limit` attributes used — not merely whether the
> camera's pan target sits at its outer bound in some other direction.

```
#### Scenario: The live region distinguishes a blocked direction from the boundary generally
- **WHEN** the camera's pan target sits at its outer bound and pan key
  input is given in a direction that would move it back inward
- **THEN** no at-limit state is exposed for that input, even though the
  camera is currently at the boundary
```

### The touch consequence — say it plainly

**This is a real, unacknowledged loss, and it should be filed, not silently
shipped.**

Today the four `camera-pan-*` buttons are ordinary DOM `<button>` elements —
tappable on a touchscreen. They are, as far as I can find in the live spec
and the code, **the only pan path available to a touch-only user**:
secondary-button drag-to-pan (*Space View Camera Orbit, Pan, and Zoom*) is a
mouse gesture with no touch equivalent defined anywhere; *Space View Camera
Touch Pinch-Zoom* defines exactly two touch gestures — pinch-to-zoom and
single-finger-drag-to-orbit — and pans nothing. Deleting the four buttons
with no replacement removes pan for touch entirely, with no gesture and no
control surviving to replace it.

This is not merely cosmetic. `select-pan-target-point` — the control this
same live spec spends a paragraph justifying, precisely because "the star is
the one point every burn solve rejects" — selects **the camera's current
pan target**. A touch-only player, once these buttons are gone, can never
move that target away from the star: they lose exactly the capability the
keyboard-pan paragraph was written to protect, but for a different input
modality this change doesn't consider. It's a *partial* stranding, not a
full one — tapping a body or lane-gate mark directly still selects it, so
burns to a body or a gate remain reachable — but any burn or mine order
against an arbitrary point in space becomes permanently unreachable for a
touch-only player from this change forward.

I want to be precise about what's in scope and what isn't, given "no mobile
layout" is an explicit non-goal of this whole chain: **this is not a
layout question.** The chain's no-mobile-layout rule is about screen width
and chrome density; it says nothing about deleting an input modality the
live spec already commits to (`Space View Camera Touch Pinch-Zoom` is not
touched or retired by this change, and nothing in the deltas proposes
retiring touch support generally). A touch-capable laptop at 1280×720 is
squarely inside this change's own stated floor.

**Recommendation, in budget:** do not build a touch pan gesture in this
link — a two-finger drag would collide with the pinch-zoom gesture already
claiming two fingers, and resolving that collision is real design work that
does not belong inside an already-at-cap 40-task change. Instead, follow the
pattern this exact repo already used for the mine-preview defect (RULING 18):
**file the gap explicitly** rather than let it be discovered later as an
unrecorded regression, and say so in the change's own record.

**Proposed addition to `design.md`'s Risks / Trade-offs section:**
> Deleting the four `camera-pan-*` buttons removes the only touch-accessible
> pan path in the app; no touch gesture replaces it, and this change does
> not add one. A touch-only player can select a body or lane-gate mark
> directly but can never move `select-pan-target-point`'s target away from
> the star, so a point-target burn or mine order is unreachable from a
> touch-only device from this change forward. Filed as
> `docs/plans/continous_space/handoffs/drift-touch-pan-lost-in-vitals-strip.md`.

This is a judgement call for you and the architect, exactly as routed — I'm
not proposing this blocks archival, since touch is not this chain's stated
target input and the loss is partial, not total. But it should not ship
silent. If either of you judges it a blocker, the cheapest unblocking move
I can see within budget is *not* deleting the four pan buttons' touch
affordance specifically — i.e., keep them reachable by touch (a `sr-only`-
style or otherwise non-visually-cluttering touch target) while still
removing their on-screen visual chrome for pointer/keyboard users — but I'd
flag that as its own small design question, not something to resolve by
default here.

---

## Summary by severity

**MAJOR**
1. R1 promises but never scenarios a failed-own-fleets-read state for the strip.
2. The chevron's fate in the no-acting-fleet state is unstated; propose it survives.
3. The gauge's "no fill" vs "empty fill" (and hold's "no segments" pair) has no DOM-observable mechanism — the link-1 hazard, recurring at the gauge layer.
4. Three of the pill's seven named states (drifting, in transit, on station) have no scenario.
5. A point-target burn risks the pill naming raw coordinates — fault #1, recurring.
7. No scenario for the pill's scale-dependent figures before a world-clock scale is served — an everyday first-load race, already handled explicitly by the precedent it's projecting from.
8. The chevron and its menu have no keyboard-operability requirement at all.
9. Switching the acting fleet gives no confirmation to a keyboard/screen-reader user; fix by focus management, not a second live region.
Touch pan is lost entirely with no replacement and no acknowledgment — flagged plainly, not rated, per the routing instruction; treat as MAJOR-or-blocking at your and the architect's discretion.

**MINOR**
6. The holding pill's rate figure has no stated absent-degrade for a narrow roster-not-yet-loaded race.
10. The chevron menu's membership isn't explicitly pinned to live vs. snapshot data.

**PASS (checked, no finding)**
- Fuel/hold/credits absent-vs-zero at the figure-text level (the prompt's named hazard) — fixed correctly, with scenarios.
- Pill/roster agreement rule (RULING 4/14) and stranded-as-adornment (RULING 13) — precise, adversary-resistant text.
- Single-announcer rule (R13) — a real "exactly once" test, not a silent omission; verified against the generic landed-resolution announcer it defers to.
- Spec altitude — no implementation leakage found in the ADDED delta.
- Copy — no over-pinned strings; unavailable/absent/zero states left appropriately vague while still mandatory.

## Verdict

**NEEDS SCENARIOS.** No BLOCKER found — nothing here loses a player's data
or fully strands them. But the count and consistency of the gaps (pill
coverage, gauge mechanism, chevron accessibility entirely unaddressed, and
the routed touch-pan question) is more than "genuinely complete, ship it."
Every proposed fix above is a sentence-plus-scenario against a component
already being built in this link, except the touch-pan gesture itself,
which I am explicitly recommending stay out of scope and be filed instead.
None of these should meaningfully grow the task count past its own margin —
they are test/requirement additions to work already planned, not new
components — except possibly Finding 8 (chevron keyboard-operability) if the
implementer's chosen menu primitive doesn't already provide it for free,
which is the one item I'd accept deferring to link 2b if the panel needs to
hold the 40-task line.

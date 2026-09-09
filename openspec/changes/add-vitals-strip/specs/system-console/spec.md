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

## ADDED Requirements

### Requirement: The Vitals Strip Is Present on Every Render of the System Space View

The system SHALL render a single full-width strip across the foot of the
system space view — the bottom-most always-visible band of the view's
console region — on every render of that view, including while the interior
read has failed, while the own-fleets read has failed, and while the
renderer is unavailable. A cell whose served input is unavailable SHALL
render `figure-formatting`'s absent form for its figures rather than being
removed, so the strip's cell set is fixed and a player never has to work out
which instrument disappeared.

#### Scenario: The strip renders with every read resolved
- **WHEN** the view renders with interior, own-fleets, station, board,
  session and galaxy reads resolved
- **THEN** the strip is present with its fleet, fuel, hold, credits and
  clock cells

#### Scenario: The strip survives a failed interior read
- **WHEN** the interior read fails
- **THEN** the strip is still rendered; the cells fed by the fleet read and
  the session are unchanged

#### Scenario: The strip survives a failed own-fleets read
- **WHEN** the own-fleets read fails
- **THEN** the strip is still rendered, its fleet, fuel and hold cells show
  the absent form exactly as the no-acting-fleet case does, and the strip
  itself renders no error or retry affordance of its own — the failure is
  surfaced on the fleet panel, which owns the own-fleets read's error and
  retry surface

#### Scenario: The strip survives an unavailable renderer
- **WHEN** the canvas region shows the unsupported or interrupted state
- **THEN** the strip is still rendered and its figures still read

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

### Requirement: The Strip Carries No Verb

The strip SHALL NOT render any control that commits, cancels, or otherwise
mutates server state. The one interactive affordance the strip MAY render is
the fleet cell's chevron (*The Fleet Cell Names the Acting Fleet and
Delegates a Switch to the Mounting View*), which changes only which fleet
the mounting view is commanding and issues no mutation.

#### Scenario: A docked fleet's strip offers no trade verb
- **WHEN** the acting fleet is docked at a station with cargo aboard
- **THEN** the strip renders no refuel, sell, mine, jump, hold or release
  control

#### Scenario: A burning fleet's strip offers no burn-ending verb
- **WHEN** the acting fleet is burning
- **THEN** the strip renders no cut-drive or stop control

#### Scenario: The chevron is the strip's only interactive element
- **WHEN** the strip's interactive elements are enumerated
- **THEN** every one is the chevron or a descendant of the chevron's own
  menu

### Requirement: The Fleet Cell Names the Acting Fleet and Delegates a Switch to the Mounting View

The system SHALL show, in the strip's leftmost cell, the acting fleet's
served id — no fleet name exists on the wire (`lib/types/fleet.ts`'s
`Fleet`), and this capability SHALL NOT synthesise a client-side display
name for one — and a chevron affordance that opens a menu of every fleet the
requester owns, delegating a chosen fleet back to the mounting view through
the **same callback contract** the fleet roster's row selection uses
(`fleet-roster`'s *Row Selection Delegated to the Mounting View*), so the
acting fleet is set by exactly one code path and the strip itself decides
nothing about what switching means. The menu's membership SHALL NOT be
filtered to the open system: offering a subset would make the chevron a
second visibility filter over the requester's own fleets. The menu's
membership and each entry's destination SHALL reflect the requester's
own-fleets read as most recently resolved, including while the menu remains
open across a refetch — never a snapshot frozen at the moment the menu
opened. WHEN that read's most recent attempt has failed, the chevron's menu
SHALL offer no entry whose destination is drawn from it, rather than
presenting a stale membership or stale destinations as current — rendering
the identical empty menu that *A requester owning no fleet at all still
gets the strip* mandates for a requester who owns no fleet anywhere.
Because the own-fleets read's error surface belongs to the fleet panel, not
the strip (*The Strip Survives a Failed Own-Fleets Read*), the strip does
not distinguish "no fleets" from "read failed" in its menu; that ambiguity
is a deliberate consequence of the ownership split, not an oversight.
Each menu entry SHALL name its fleet by its served id and the display name of the
system it is in — resolved from the galaxy read, falling back to the raw
system id when that read has not resolved — and, for a fleet in lane
transit, that it is under way between systems, so a player choosing an
entry that navigates knows where it goes before choosing it. WHEN there is
no acting fleet, the identity SHALL show
`figure-formatting`'s absent form but the chevron SHALL remain present and
interactive, so a player viewing a system with none of their own fleets
present can still reach and switch to any owned fleet from the strip. WHEN
choosing a fleet in the open system sets it acting, focus SHALL return to
the chevron, and the chevron's accessible name SHALL name the now-acting
fleet, so a keyboard or screen-reader user is told the switch took effect
without a second announcing surface.

#### Scenario: Choosing a fleet in this system sets it acting
- **WHEN** a fleet in the open system is chosen from the chevron
- **THEN** it becomes the acting fleet and no navigation occurs

#### Scenario: Focus and the chevron's own label confirm a same-system switch
- **WHEN** a fleet in the open system is chosen from the chevron
- **THEN** focus returns to the chevron and its accessible name names the
  newly acting fleet

#### Scenario: Choosing a fleet in another system navigates there
- **WHEN** a fleet located in a different system is chosen
- **THEN** the view navigates to that system's route, identically to
  selecting its roster row

#### Scenario: Choosing a fleet out on a lane navigates to the galaxy view
- **WHEN** a fleet currently in lane transit is chosen
- **THEN** the view navigates to the galaxy view, identically to selecting
  its roster row

#### Scenario: The chevron's menu lists every fleet the requester owns
- **WHEN** the chevron's menu is opened
- **THEN** every fleet the requester owns appears as an entry, regardless of
  which system or lane it is currently in

#### Scenario: A sole owned fleet leaves the chevron's menu with one entry
- **WHEN** the requester owns exactly one fleet
- **THEN** the chevron's menu holds exactly that one entry, and choosing it
  changes nothing

#### Scenario: The chevron survives the no-acting-fleet state
- **WHEN** the view renders with no own fleet in the open system
- **THEN** the fleet cell's identity shows the absent form, and the chevron
  is still present and opens the same menu of every owned fleet

#### Scenario: A menu entry names its fleet's system before it navigates
- **WHEN** the chevron's menu is opened while the requester owns a fleet in
  another system
- **THEN** that entry shows that fleet's served id and that system's display
  name, and falls back to the raw system id when the galaxy read has not
  resolved

#### Scenario: A failed own-fleets refetch empties the menu rather than freezing it
- **WHEN** the own-fleets read's most recent attempt has failed
- **THEN** the chevron's menu offers no entry whose destination is drawn
  from that read, never the membership or destinations from an earlier
  successful read presented as current

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

### Requirement: The Fleet Cell's State Pill Is a Projection of the Shared Roster Derivation

The system SHALL render, beneath the fleet's identity, exactly one state
pill whose state is produced by the **same exported derivation the roster
row uses** (`frontend/components/fleet/roster-status.ts`) over the same
served inputs, and SHALL render from that derivation's output value — or
from its explicit absence, which the mounting view supplies in place of an
output whenever the own-fleets read's most recent attempt has failed — the
served `stranded` flag, the served world-clock scale, and the mounting
view's projected world time — and from nothing else. The pill SHALL NOT
receive a `Fleet`, and SHALL NOT read `Fleet.state`, `attachedTo`, a park
kind, or an action ETA **from the fleet read**. It renders only the shared
derivation's output. The derivation MAY expose the park kind and a
remaining ETA as **additive** fields, and the pill MAY branch on those,
because they are the derivation's conclusions, not the fleet's raw state —
the scale and the projected world time remain reachable alongside that
output as ambient render inputs carrying no fleet state of their own, since
`figure-formatting` makes both required arguments of the duration and rate
formatters this pill renders. A distinction the pill needs and the
derivation does not make SHALL be added to the derivation once, so both
surfaces read the extension; the agreement rule this imposes is that **both
surfaces are functions of the one derivation's output for the same served
inputs** — not that both render identical text. A projection may render a
subset of what the derivation distinguishes; it may never render a
distinction the derivation does not make, nor contradict one it does.

The pill's states are: docked (naming the host by its served type word and
served id, and, for a lane-gate host — which the interior read serves with
no `type` field — the fixed word `Gate` plus the destination system's
display name resolved from the galaxy read in place of the gate's own id,
falling back to the gate's raw `destSystemId` when that read has not
resolved — no client-side display name is synthesised for any other host,
since no body on the interior read carries a name), under way (naming the
burn's served target — resolved by the served target's body id against
BOTH the interior read's `features` and its `laneGates`: a `features` hit
as its served `type` word plus its served id, a `laneGates` hit as `Gate`
plus the destination system's display name from the galaxy read (falling
back to the raw `destSystemId` when that read has not resolved), and, when
the body id matches neither collection or the interior read has failed, the
raw body id — never a synthesised name; or an explicit "a point in space"
when the served target is a point rather than a body, since a point target
carries no name — and the remaining duration), holding (naming the served
station-keeping rate), mining (naming the run's remaining duration),
drifting, in transit, and on station. WHEN the burn's served target is a
point rather than a body, the pill SHALL name it without rendering the
point's raw coordinate components — as a point target, not as X/Y/Z figures
— consistent with `figure-formatting`'s prohibition on a raw wire number
reaching player-facing copy. A duration the pill renders SHALL be computed
against the mounting view's projected world clock, so it advances between
reads with no refetch, never a value frozen at the moment of the
last-served read: the derivation additionally exposes the underlying ETA as
an absolute world-millisecond instant alongside the existing span, and the
pill's duration figures are `figure-formatting`'s (`world-ms-span-left`)
presentation of that instant against the projected world time and the
served scale, so the countdown advances because the projected clock moves,
never because the strip re-derives fleet state. A rate the pill renders is
the fleet read's served value presented at the served scale and SHALL NOT
be computed against the projected clock — `stationKeepRateTonsPerSecond` is
a served constant, never derived client-side, and a served constant cannot
"advance between reads". WHEN the own-fleets read's most recent attempt has
failed, the pill SHALL show the absent form in place of its state, never a
state derived from an earlier successful read presented as current. The
served `stranded` flag SHALL render as a distinct marker on the fleet cell,
**alongside** the pill, never as a pill state and never replacing the
pill's activity — a stranded fleet is simultaneously docked, parked, or
burning, and hiding that activity behind a mutually-exclusive `Stranded`
state would hide the fact the player most needs when stranded.

#### Scenario: A docked fleet at a lane gate names its destination system
- **WHEN** the acting fleet is parked with `attachedTo` set to a
  `laneGates` entry and the galaxy read has resolved that gate's
  destination system
- **THEN** the pill reads the docked state naming `Gate` and that
  destination system's display name

#### Scenario: A docked fleet at a feature names its type and served id
- **WHEN** the acting fleet is parked with `attachedTo` set to a `features`
  entry
- **THEN** the pill reads the docked state naming that feature's served
  type word and its served id

#### Scenario: A burning fleet's pill counts down to its served arrival, naming a body target by type and id
- **WHEN** the acting fleet's effective state is a burn whose served target
  resolves to a `features` entry
- **THEN** the pill names that body by its served type word and served id —
  never the raw id alone with no type word, and never a name synthesised for
  it — and a remaining duration presented per `figure-formatting`
  (`world-ms-span-left`) carrying its raw unscaled world-millisecond span

#### Scenario: A burn toward a lane gate names the gate's destination system
- **WHEN** the acting fleet's burn names a `laneGates` entry as its target
- **THEN** the pill reads the under-way state naming `Gate` and that gate's
  destination system's display name, with its remaining duration

#### Scenario: An unresolvable burn target degrades the pill, it does not blank it
- **WHEN** the burn's served body id matches neither the interior read's
  `features` nor its `laneGates`, or the interior read has failed
- **THEN** the pill still reads the under-way state naming the raw body id,
  with its remaining duration, never an empty or missing target

#### Scenario: A station-keeping fleet's pill shows the served upkeep rate
- **WHEN** the acting fleet's park mode is `stationkeep`
- **THEN** the pill shows the fleet read's served rate presented per
  `figure-formatting` (`tons-per-world-s`), never a rate derived from the
  host's orbital elements

#### Scenario: A mining fleet's pill counts down to the run's ETA
- **WHEN** the acting fleet is docked with a running mine action whose ETA
  has not yet passed
- **THEN** the pill shows the mining state and a remaining duration to that
  action's ETA, presented per `figure-formatting`

#### Scenario: A burn toward a point in space names the point, not an empty target
- **WHEN** the acting fleet's effective state is a burn whose served target
  is a point rather than a body
- **THEN** the pill reads the under-way state naming the target as a point
  in space, with its remaining duration, never an empty or missing target

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

#### Scenario: An unserved rate degrades the holding pill, it does not blank it
- **WHEN** the acting fleet's park mode is `stationkeep` but the fleet read
  has not yet served the station-keeping rate
- **THEN** the pill still reads the holding state, with the rate figure's
  own `figure-formatting` absent form, never an empty pill

#### Scenario: The pill's countdown and rate read absent until a scale is served
- **WHEN** the mounting view has not yet received a served world-clock
  `scale` and the pill would otherwise show a countdown or a holding rate
- **THEN** that figure shows `figure-formatting`'s absent form rather than
  being computed at an assumed scale of 1, while the pill's state name
  itself still renders

#### Scenario: The countdown advances between reads
- **GIVEN** a burning acting fleet whose pill shows a remaining duration
- **WHEN** the projected world clock advances with no read landing
- **THEN** the pill's remaining duration and its `data-raw` have decreased
  by the elapsed world-millisecond span

#### Scenario: No second derivation of fleet state exists in the strip
- **WHEN** the strip's component tree is inspected
- **THEN** no module other than `roster-status.ts` computes a fleet's tone,
  activity, state ladder, or ETA anchor — the pill and the roster row both
  call into it, and the only arithmetic the pill performs on that output is
  re-expressing the derivation's own ETA anchor against the projected world
  time for `figure-formatting`'s span formatter, which takes a span

#### Scenario: The pill is a function of the derivation's output alone
- **GIVEN** two fleets in different served states whose derivation output is
  equal and is not absent
- **WHEN** the pill is rendered for each at the same projected world time,
  supplied only that output value, the served `stranded` flag, the served
  world-clock scale, and that world time — never a `Fleet`
- **THEN** the two pills render identical text, and no second derivation of
  fleet state exists in the strip

#### Scenario: A failed refetch retires the pill rather than freezing it
- **GIVEN** the acting fleet's pill reading the under-way state with a
  countdown
- **WHEN** the own-fleets read's next attempt fails
- **THEN** the pill shows the absent form, not the last-served state, and
  no countdown continues to run

#### Scenario: A docked fleet at an unresolvable host degrades the pill, it does not blank it
- **WHEN** the acting fleet is docked but the interior read has failed, or
  its `attachedTo` matches neither the interior read's `features` nor its
  `laneGates` collection, so the host cannot be named
- **THEN** the pill still reads the docked state, with the raw attachment
  id, never an empty pill

#### Scenario: A stranded fleet shows the marker alongside its activity pill
- **WHEN** the acting fleet's served `stranded` flag is true, in any of the
  pill's states
- **THEN** the fleet cell shows the stranded marker alongside that state's
  pill, and the pill continues to name the fleet's actual activity

### Requirement: The Fuel Cell Shows the Served Fuel Tonnage and Estimated Range Over a Gauge

The system SHALL show the acting fleet's served held `fuel` tonnage and its
server-reported estimated maximum range, each presented per
`figure-formatting` (`tons`, `range`) and carrying its own raw served value,
rendered over a gauge whose fill is the served held `fuel` tonnage over the
served `cargoCapacity` — the same denominator, and therefore the same
tons-to-pixels scale, as the hold cell's gauge, so the two gauges are read
against one another rather than against two different hundreds. This
capability SHALL NOT compute or re-derive either figure. Because the range
figure carries no unit name of its own, it SHALL be rendered adjacent to a
label identifying it as a range. WHEN either figure is unavailable on the
fleet read, the cell SHALL show that figure's absent form and the gauge
SHALL render no fill, rather than a zero fill indistinguishable from a dry
fleet. A cargo kind the fleet holds none of is omitted from the served pool
entirely, so "the fleet holds no fuel" and "the roster has not loaded" are
one served condition; this capability SHALL render the absent form for both
and SHALL NOT substitute zero for either. The gauge SHALL expose, as a
DOM-observable attribute of the gauge element itself, whether it holds no
data or a rendered fill — never only via the adjacent figure's text — so a
gauge with no fill is distinguishable by inspecting the gauge in isolation
from a gauge whose fill happens to render very thin.

#### Scenario: The fuel cell shows tonnage and range
- **WHEN** the fleet read serves fuel tonnage and an estimated range for the
  acting fleet
- **THEN** the cell shows both figures, each presented per
  `figure-formatting` and each carrying its own raw served value on
  `data-raw`

#### Scenario: An unserved roster reads absent, and the gauge shows no fill
- **WHEN** the fleet read has not yet served roster fields for the acting
  fleet
- **THEN** both figures show the `figure-formatting` absent form and the
  gauge renders no fill

#### Scenario: A fleet holding no fuel reads absent, exactly as its roster row does
- **WHEN** the acting fleet's served roster carries no `fuel` entry in its
  cargo pool
- **THEN** the fuel figure shows the `figure-formatting` absent form and the
  gauge renders no fill, identically to the same fleet's roster row
  (`fleet-roster`'s *An unavailable fuel or range figure reads as absent,
  not zero*) — the wire omits a kind the fleet holds none of, so a dry fleet
  and an unserved roster are one absence and the strip SHALL NOT invent a
  zero the read did not carry

#### Scenario: The gauge's no-data state is DOM-distinguishable from a sub-pixel fill
- **WHEN** the fuel gauge is inspected once for an unserved roster and once
  for a served fuel tonnage whose fill rounds to less than one pixel at the
  1280-px width floor (0.05 t against a 200 t capacity)
- **THEN** the gauge element's state attribute reads its no-data value in
  the first render and its rendered-fill value in the second, and the two
  renders are distinguishable by that attribute alone, with the fill
  geometry ignored

### Requirement: While Burning, the Fuel Cell Reflects Each Served Read and Never an Interpolated Drain

WHILE the acting fleet's effective state is a burn, the system SHALL mark
the fuel cell as draining and SHALL update its figure and its gauge fill
only when a read serves new values. The client SHALL NOT interpolate,
extrapolate, or otherwise compute fuel consumed in flight: fuel per unit of
delta-v is a rule-bearing `backend/space` computation and no client mirror
of it exists.

#### Scenario: A burning fleet's fuel cell is marked as draining
- **WHEN** the acting fleet's effective state is a burn
- **THEN** the fuel cell shows a visible draining marker

#### Scenario: The figure moves only when a read lands
- **WHEN** world time advances between two refetches while the fleet burns
- **THEN** the fuel figure and its `data-raw` are unchanged, and change on
  the next served read

### Requirement: The Hold Cell Shows Used, Total and Free Tonnage Over a Kind-Segmented Gauge

The system SHALL show the acting fleet's — always an own fleet — used
capacity, total capacity and free hold, each derived from that fleet read's
owner-only roster fields and presented per `figure-formatting` as a tonnage
— the total capacity and the free hold carrying their own raw served values
and the used capacity its own raw client-derived value (`capacity −
freeHold`) — over a gauge carrying one segment per resource kind the served
cargo pool holds (including `fuel`, per `fleet-movement`'s "Fleet Cargo
Pool"), ordered stably by kind so two reads of the same pool render the
same order, sized by that kind's served tonnage, with `fuel` treated as a
kind like any other. Each segment's tonnage is presented per
`figure-formatting` as a tonnage and carries its own raw served value; each
segment's kind and tonnage SHALL be rendered as text in the cell — the
gauge itself SHALL expose no figure, no fill percentage and no accessible
value, so the segmentation is never conveyed by colour alone and no figure
form outside `figure-formatting`'s closed unit vocabulary is introduced.
The gauge SHALL expose, as a DOM-observable attribute of the gauge element
itself, whether it holds no data, no segments, or a rendered fill — never
only via the adjacent figure text — so a gauge with no segments because the
hold is genuinely empty is
distinguishable from one with no segments because the roster has not loaded.
WHEN the fleet read has not served roster fields, the cell SHALL show the
absent form for all three figures and render no segments. The cell SHALL
reflect the post-resolution cargo after a mine run resolves, via the
mounting view's refetch rules, without requiring navigation. This cell is
the fleet's *cargo* hold, distinct from the *station-keeping* hold that
`docked-fleet-actions`' *Station-Keeping Hold and Release Controls* defines
and that this capability's own fleet-cell pill reports as the holding
state — the three share the word "hold" and name unrelated concepts.

#### Scenario: The hold cell shows contents and capacity
- **WHEN** the fleet read serves the acting fleet's cargo pool and capacity
- **THEN** the cell shows used, total, and free tonnage, each presented per
  `figure-formatting`, with a segment per held kind, each carrying its kind
  as text and its tonnage presented per `figure-formatting` with its own
  raw served value

#### Scenario: An empty hold shows no segments and its served free figure
- **WHEN** the acting fleet's cargo pool holds no tonnage of any kind, and
  the fleet read's served `freeHold` equals its served `cargoCapacity`
- **THEN** the gauge renders no segments and the free figure renders that
  served `freeHold` value, carrying it on `data-raw`

#### Scenario: An unloaded roster reads as absent, never `0 / 0 t`
- **WHEN** the fleet read has not yet served roster fields for the acting
  fleet
- **THEN** used, total, and free all show the `figure-formatting` absent
  form and no segments render

#### Scenario: The segmentation is legible without colour
- **WHEN** a segment is inspected
- **THEN** its kind and tonnage are available as text in the cell

#### Scenario: The hold cell visibly fills when a mine run resolves
- **WHEN** a running mine's ETA passes and the space view's refetch lands
  the updated fleet read
- **THEN** the strip's hold cell shows the credited cargo — its used
  figure, its free figure, and that kind's segment — without a page
  navigation

#### Scenario: The gauge's no-data and no-segments states are DOM-distinguishable
- **WHEN** the hold gauge is inspected once for an unserved roster and once
  for a served, empty cargo pool
- **THEN** the two renders differ in a DOM-observable attribute of the
  gauge element, not only in the adjacent figures' text

### Requirement: The Credits Cell Shows the Corporation's Served Balance and Announces Its Changes

The system SHALL show, in the strip, the requester's own corporation's
credit balance, sourced from the ambient corporation session read the
surrounding layout makes (see `corporation-spawn`'s balance-bearing session
bootstrap) and supplied to the strip by the mounting view, reflecting the
post-settlement balance after a sale or a refuel resolves through the fleet
panel's commits, without requiring navigation, and SHALL announce a balance
change to assistive technology (an `aria-live` region or equivalent) at the
moment it updates, not solely as a visual change; the announced copy uses
the same `figure-formatting` presentation as the visual figure. When shown
as a figure, the balance is presented per `figure-formatting` as a credit
figure and carries its raw served value. IF the session balance is unavailable,
THEN the cell SHALL show an explicit unavailable indication and SHALL NOT
show a figure — never a placeholder that a mounting view supplying no
balance at all would render indistinguishably and permanently, and never
`figure-formatting`'s generic absent form in place of this capability's own
mandated copy. "Unavailable" SHALL include both a session read that has
never resolved and one that resolved once and has since failed to refresh:
the credits cell SHALL NOT continue presenting a balance served by an
earlier successful read as current once that read's most recent attempt has
failed, even though a cached value remains available to render. The
mounting view SHALL supply the session read's error state to the strip
alongside its cached balance, so the strip can distinguish "currently
unavailable, no cached value" from "currently unavailable, showing what was
last confirmed" — the latter SHALL still show the explicit unavailable
indication, not the stale figure. A transition between the figure and the
unavailable indication, in either direction, SHALL be announced through that
same live region, which SHALL NOT render as empty text when the balance
becomes unavailable.

#### Scenario: The strip shows the current credit balance
- **WHEN** the strip renders for an authenticated, spawned requester
- **THEN** the requester's current credit balance is shown, presented per
  `figure-formatting` and carrying its raw served value

#### Scenario: An unavailable balance reads as unavailable, not as a figure
- **WHEN** the strip renders while the corporation session balance is
  unavailable
- **THEN** the credits cell shows an explicit unavailable indication rather
  than a number

#### Scenario: A stale session read is never presented as a current balance
- **GIVEN** the corporation session read has previously resolved a balance
- **WHEN** a later refetch of that read fails
- **THEN** the credits cell shows the explicit unavailable indication, not
  the balance from the earlier successful read presented as current

#### Scenario: The balance visibly updates when a sale resolves
- **WHEN** a sale settles from the fleet panel's sell commit
- **THEN** the strip's displayed credit balance updates to reflect the
  sale's proceeds, with no page navigation

#### Scenario: The balance visibly updates when a refuel resolves
- **WHEN** a refuel settles from the fleet panel's refuel commit
- **THEN** the strip's displayed credit balance updates to reflect the
  refuel's cost, with no page navigation

#### Scenario: A balance change is announced to assistive technology
- **WHEN** a sale or a refuel settles and the credits cell's balance updates
- **THEN** the updated balance is announced via an accessible live region,
  not conveyed by a purely visual change

#### Scenario: A transition to or from an unavailable balance is announced
- **WHEN** the credits cell transitions between showing a figure and
  showing the unavailable indication, in either direction
- **THEN** the transition is announced via the accessible live region, not
  left as an empty announcement

### Requirement: The Clock Cell Shows the Absolute World Instant at Its Served Scale

The system SHALL show, at the strip's trailing edge, the mounting view's
projected world time as an absolute instant presented per
`figure-formatting` (`world-ms-instant`), carrying its raw world-millisecond
value and the accessible explanation of its `×N` suffix that
`figure-formatting`'s stamp rule requires. WHEN no world time has ever been
served — the mounting view holds no successful interior or own-fleets read
to derive one from — the clock cell SHALL show `figure-formatting`'s absent
form for the whole stamp, never `T+ 0d 00:00`: a client-local default used
to drive the ticking animation before any read has landed is not a served
value and SHALL NOT be presented as one. WHEN no world-clock scale has been
served, the stamp SHALL still render its `T+ Dd HH:MM` portion with the
absent suffix `×—`, and, WHILE no world-clock scale has been served, the
stamp SHALL render the last served world instant without projecting it
forward — the pill's own scale-absent scenario already withholds a duration
or rate rather than computing one at an assumed scale of 1, and the clock
stamp SHALL receive that identical protection: it holds rather than
advances, because no honest wall-clock rate exists to advance it at. Once a
world time and a world-clock scale have both been served, the clock cell
SHALL re-render as the mounting view's projected world clock advances, so
its stamp counts forward between reads with no refetch, never a value
frozen at the moment of the last-served read.

#### Scenario: The clock reads `T+ Dd HH:MM ×N` with its raw value
- **WHEN** the mounting view has a projected world time and a served scale
- **THEN** the clock cell reads `T+ Dd HH:MM ×N`, carrying the raw
  world-millisecond value on `data-raw`

#### Scenario: With no world time ever served, the whole stamp reads absent
- **WHEN** the mounting view has not yet received a world time from any read
- **THEN** the clock cell shows `figure-formatting`'s absent form for the
  whole stamp, not `T+ 0d 00:00`

#### Scenario: The suffix carries its accessible explanation
- **WHEN** the clock cell's `×N` suffix is inspected by assistive technology
- **THEN** its accessible explanation of the scale is available

#### Scenario: With no served scale the stamp still renders, with `×—`
- **WHEN** no world-clock scale has been served
- **THEN** the clock cell's `T+ Dd HH:MM` portion still renders and its
  suffix reads `×—`

#### Scenario: The stamp advances between reads
- **GIVEN** the clock cell showing a projected world time and a served scale
- **WHEN** the projected world clock advances with no read landing
- **THEN** the clock cell's stamp and its `data-raw` have increased by the
  elapsed world-millisecond span

#### Scenario: With no served scale, the stamp holds rather than advancing
- **GIVEN** the clock cell showing a `T+ Dd HH:MM ×—` stamp with no served
  world-clock scale
- **WHEN** wall-clock time passes with no read landing
- **THEN** the stamp's `T+ Dd HH:MM` portion and its `data-raw` remain at
  the last served world instant, never projected forward at an assumed
  scale of 1

### Requirement: The Strip Issues No Read of Its Own

The strip SHALL render only from values the mounting view supplies and
SHALL issue no network read — no preview request, no fleet read, no session
read, no board read.

#### Scenario: Rendering the strip issues no request
- **WHEN** the strip is rendered in isolation with values supplied
- **THEN** no network request is made

### Requirement: Activating the Strip Changes No Space-View Selection

Activating any part of the strip, by pointer or keyboard, SHALL NOT change
the space view's current body, lane-gate or point selection, and SHALL NOT
be treated as a space-view click, regardless of what the canvas draws
beneath it.

#### Scenario: Clicking a strip cell leaves the selection unchanged
- **WHEN** any strip cell is clicked
- **THEN** the space view's current selection is unchanged

#### Scenario: Switching the acting fleet leaves the selection unchanged
- **WHEN** the acting fleet is switched via the chevron
- **THEN** the space view's current body, lane-gate, or point selection is
  unchanged

### Requirement: The Strip Announces Only Its Own Balance Changes

The strip SHALL NOT announce a landed burn, jump, or mine to assistive
technology; those are announced once, by the mounting view's existing
announcer (`system-space-view`'s *A Landed Resolution Is Announced to
Assistive Technology*). The credits cell's own live region (*The Credits
Cell Shows the Corporation's Served Balance and Announces Its Changes*) is
the strip's only announcing surface.

#### Scenario: A landing is announced exactly once
- **WHEN** a burn's arrival lands while the strip shows the fleet's pill
  flipping out of the burning state
- **THEN** exactly one live region announces the landing — the mounting
  view's own announcer — and no strip element announces it

### Requirement: The Strip Is Laptop-First and Never Overflows the View

The strip SHALL render every one of its cells, without horizontal overflow
and without removing, truncating or wrapping a cell onto a second row, at a
viewport of **1280 CSS pixels wide by 720 CSS pixels tall**, and at every
wider viewport. No layout below that width is specified, produced, or
tested.

#### Scenario: Every cell is inside the viewport at 1280×720
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport
- **THEN** each of the five cells is rendered, non-empty, and inside the
  viewport bounds

#### Scenario: No other floating surface covers a strip cell
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with every
  floating surface the view mounts present, including one carrying a retry
  affordance
- **THEN** no cell of the strip is overlapped by any of them, and every such
  surface remains fully visible and activatable itself

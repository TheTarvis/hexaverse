# system-console Specification

## Purpose

The console: everything that floats over the system space view as
instrumentation rather than as scene. `system-space-view` owns what the
canvas draws and how you pick — the renderer, the camera, and the selection
among a body, a lane gate, or a point. `system-console` owns the always-on
vitals strip that is the top row of the console dock at the bottom of that
view — the acting fleet and its state, its fuel and range, its hold, the
corporation's balance, and the world clock — and the per-entity detail dock
the strip is the collapsed state of. The strip reads; it does not command. It
renders only figures the mounting view supplies, issues no read of its own,
carries no verb but the affordance to switch which fleet is acting, and never
changes the space view's selection. The dock's tabs host other capabilities'
panels — the sighting log first — and those panels issue their own reads and
keep their own rules; this capability owns where they are placed, that a
tab's content stays mounted while it is not shown, how the dock opens and
closes, and what floats clear of it, and the "issues no read" sentence is the
strip's alone.
## Requirements
### Requirement: The Vitals Strip Is Present on Every Render of the System Space View

The system SHALL render a single full-width strip as the top row of the
console dock — across the foot of the system space view while the dock is
collapsed, and directly above the dock's tab bar while the dock is expanded;
in either state the bottom-most always-visible band of the view's console
region — on every render of that view, including while the interior
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

### Requirement: The Fuel Gauge Draws the Served Fuel Cost of the Supplied Burn Quote as One Start-Anchored Extent

The system SHALL draw, on the strip's fuel gauge and on no other gauge, one
cost extent for the burn quote the mounting view supplies to the strip. The
extent SHALL be drawn separately from the fill, anchored at the gauge's start
as the fill is, and SHALL leave the fill's own length unchanged. The extent
SHALL occupy only part of the rail's height, so that the end of the fill
remains visible in the part of the rail the extent does not cover, both when
the extent ends before the fill's end and when it ends after it. Its length
SHALL be the quote's served point fuel cost (`fuelCostTons`, never the commit
ceiling) over the acting fleet's served `cargoCapacity` — the same
denominator, and so the same tons-to-pixels scale, as the fill — limited to
the length of the rail: a cost at or above the capacity draws the whole rail,
and nothing in the extent's drawing exists only for such a cost or tells it
from a cost exactly equal to the capacity, and this capability SHALL NOT assert
that such a cost is unaffordable. A cost of zero SHALL draw an extent of zero
length, still present. A cost that is not a finite, non-negative number SHALL
draw no extent. The extent SHALL NOT be drawn while the gauge's existing state
attribute reads its no-data value, a state that stays as *The Fuel Cell Shows
the Served Fuel Tonnage and Estimated Range Over a Gauge* defines it, and this
requirement writes no rule of its own for the fuel cell while the own-fleets
read's most recent attempt has failed.

The extent's affordability state SHALL be the quote's served `affordable`
flag, copied unchanged. The strip SHALL NOT decide that state by comparing the
extent with the fill, SHALL NOT compute any difference between the fuel
aboard and the cost, and SHALL NOT compute an affordability of its own: the
served flag is decided by the server against terms the client does not hold,
so the extent may end past the fill while the flag reads affordable, and may
end inside the fill while the flag reads unaffordable. The unaffordable
extent SHALL be painted in the amber family the command panel already uses for
an unaffordable quote; the affordable extent SHALL be painted in a tone the
strip's gauges already use; the overlay as a whole, extent and mark, SHALL use
no colour family other than amber and zinc, so no red and no blue appear. The
extent SHALL be painted so that, in the one rail, the
end of the fill and the end of the extent can each be located by eye.

WHILE the extent's state is unaffordable, one mark SHALL be drawn that spans
the rail's full height, whose width is greater than zero and is the same at
every cost, and whose paint differs from the paint of the unaffordable extent,
and the mark SHALL remain drawn when the extent's own length is under one
device pixel. The mark is drawn separately from both the extent and the fill.
The mark SHALL be positioned along the rail at the extent's length, as a
percentage of the rail, and displaced back from that position by the same
percentage of the mark's own width, so that at every cost no part of the mark
lies before the rail's start or past the rail's end: at a cost of zero its leading edge is the rail's start, at
a cost at or above the capacity its trailing edge is the rail's end, and at
every cost between, the extent's end lies on the mark. The mark SHALL be present
exactly when the extent's state attribute reads unaffordable, and SHALL NOT be
decided by comparing the extent with the fill or by the cost being limited to
the rail. The two states SHALL differ in the presence of the mark as well as in
paint, so that the extent's affordability does not depend on telling two
paints apart.

The extent SHALL leave the gauge's existing state attribute (no data, no fill,
or a rendered fill) unchanged. The gauge SHALL expose the extent's state —
affordable or unaffordable — as a DOM-observable attribute of the gauge
element itself, separate from that existing attribute and absent whenever no
extent is drawn, so that a zero-length or sub-pixel extent is distinguishable
by that attribute alone. The extent SHALL carry no figure, no text, no
raw-value attribute, no unit attribute, no accessible value, and no attribute
stating its length or the cost as a number; its drawn geometry, like the
fill's, is the only place its length appears. The extent SHALL NOT be
focusable, and SHALL be drawn alongside the draining marker of *While Burning,
the Fuel Cell Reflects Each Served Read and Never an Interpolated Drain* when
both apply. The strip SHALL NOT print the cost, the difference between cost
and fuel aboard, or any shortfall as text. The extent and its mark SHALL be
inside the gauge's element that is hidden from assistive technology, and SHALL
NOT be animated or transitioned in appearing, changing or being withdrawn.
The extent is decorative and SHALL NOT be relied on as the presentation of the
quote's affordability. The mounting view SHALL supply the strip a quote only
while that view also presents the same quote's affordability as text. This
capability places no rule on where or how the view presents that text.

#### Scenario: A supplied quote draws one extent on the gauge's own scale
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 30 and whose
  `affordable` flag is true
- **THEN** the fuel gauge draws one extent starting at the gauge's start and
  spanning 15 % of the rail
- **AND** the fill still spans 40 % of the rail and the gauge's existing state
  attribute still reads its rendered-fill value

#### Scenario: The extent covers only part of the rail's height
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 30, and again
  one whose `fuelCostTons` is 100, each with the `affordable` flag true
- **THEN** in each case the extent's height is less than the rail's height
  while the fill's height is the rail's, so that part of the rail's height at
  each side of the extent is not covered by it
- **AND** at 100 the extent ends past the fill's end and the end of the fill
  remains visible in that uncovered part

#### Scenario: An affordable quote's extent carries the affordable state
- **WHEN** the strip is supplied a quote whose `affordable` flag is true
- **THEN** the extent's state attribute reads affordable and its paint is a
  tone already used by the strip's gauges

#### Scenario: An unaffordable quote's extent carries the unaffordable state in amber
- **WHEN** the strip is supplied a quote whose `affordable` flag is false
- **THEN** the extent's state attribute reads unaffordable and its paint is in
  the amber family the command panel uses for an unaffordable quote
- **AND** no red or blue class is applied anywhere in the strip

#### Scenario: The flag wins when the extent runs past the fill
- **GIVEN** the acting fleet serves 40 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 60 and whose
  `affordable` flag is true
- **THEN** the extent spans 30 % of the rail against a fill of 20 %, and its
  state attribute reads affordable
- **AND** the unaffordable mark is absent

#### Scenario: The flag wins when the extent lies inside the fill
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 20 and whose
  `affordable` flag is false
- **THEN** the extent spans 10 % of the rail against a fill of 40 %, and its
  state attribute reads unaffordable
- **AND** the unaffordable mark is present

#### Scenario: An unaffordable extent too short to see still shows its warning
- **GIVEN** the acting fleet serves 1 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 0.4 and whose
  `affordable` flag is false
- **THEN** the extent spans 0.2 % of the rail and its state attribute reads
  unaffordable
- **AND** the unaffordable mark is present, and is the same size as in the
  same strip supplied a quote of `fuelCostTons` 30 with the flag false

#### Scenario: The unaffordable mark has a visible size and its own paint
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied quotes of `fuelCostTons` 0.4 and 30, each with
  the `affordable` flag false
- **THEN** in each case the mark spans the rail's full height and its width is
  greater than zero, and that width is the same at both costs
- **AND** the mark's paint differs from the paint of the unaffordable extent

#### Scenario: The unaffordable mark sits at the extent's end along the rail
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied, in turn, quotes of `fuelCostTons` 0, 100 and
  250, each with the `affordable` flag false
- **THEN** at a cost of 0 the mark is positioned at 0 % of the rail and is
  displaced back by 0 % of its own width, so its leading edge is the rail's
  start
- **AND** at a cost of 100 the mark is positioned at 50 % of the rail and is
  displaced back by 50 % of its own width, so the extent's end lies on the mark
- **AND** at a cost of 250 the mark is positioned at 100 % of the rail and is
  displaced back by 100 % of its own width, so its trailing edge is the rail's
  end and no part of it lies past the rail
- **AND** at each of the three costs no part of the mark lies before the rail's start or past the rail's end

#### Scenario: A cost above the capacity is limited to the rail
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 250 and whose
  `affordable` flag is true
- **THEN** the extent spans 100 % of the rail and no further, its state
  attribute reads affordable, and no element or attribute is present that a
  cost of exactly 200 does not draw
- **AND** a cost of exactly 200 draws the identical extent

#### Scenario: A zero cost is a drawn overlay of zero length
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is 0 and whose
  `affordable` flag is true
- **THEN** the gauge's extent state attribute is present and reads affordable
- **AND** the extent has zero length

#### Scenario: A cost that is not a finite non-negative number draws no overlay
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the strip is supplied a quote whose `fuelCostTons` is NaN, is
  infinite, or is -5
- **THEN** no extent is drawn and the gauge's extent state attribute is absent
- **AND** the fill and the gauge's existing state attribute are unchanged

#### Scenario: A gauge with no data draws no overlay
- **WHEN** the strip is supplied a quote with a finite `fuelCostTons` while
  the acting fleet's `cargoCapacity` is unserved or 0, and again while the
  fleet's served cargo pool carries no `fuel` entry
- **THEN** no extent is drawn in either render, the extent state attribute is
  absent, and the gauge's existing state attribute reads its no-data value

#### Scenario: The extent exposes no figure and no control
- **WHEN** the fuel gauge is inspected while an extent is drawn
- **THEN** the extent has no text, no raw-value attribute, no unit attribute,
  no attribute stating its length or the cost as a number and no accessible
  value, is not focusable, and the strip prints no cost, difference or
  shortfall text
- **AND** the strip's interactive elements are still only the chevron and its
  menu's descendants

#### Scenario: The overlay is hidden from assistive technology and does not animate
- **WHEN** an extent is drawn, changes cost, and is withdrawn
- **THEN** the extent and its mark are descendants of the element carrying
  `aria-hidden="true"` throughout
- **AND** neither carries a transition or animation class or style in any of
  the three

#### Scenario: The hold gauge never draws a cost extent
- **WHEN** the strip is supplied a quote
- **THEN** the hold gauge's subtree is identical to its subtree with no quote
  supplied

#### Scenario: The extent is drawn alongside the draining marker
- **GIVEN** the acting fleet's effective state is a burn and the fuel cell
  shows its draining marker
- **WHEN** the strip is supplied a quote for a re-target
- **THEN** the draining marker and the extent are both present

#### Scenario: A drawn extent is always accompanied by the quote's affordability as text
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** an extent is drawn in the view for a quote whose `affordable` flag
  is false, and again for a quote whose flag is true
- **THEN** in each case the view presents that quote's affordability as text,
  and the text states affordable exactly when the extent's state attribute
  reads affordable and states not affordable exactly when it reads
  unaffordable

#### Scenario: The extent's and the mark's colour classes stay in the amber and zinc families
- **WHEN** an affordable extent and an unaffordable extent with its mark are
  rendered
- **THEN** every colour class on the extent and the mark is in the amber
  family or the zinc family, and no class naming another colour family is
  present
- **AND** every such colour class has its dark-scheme counterpart on the same
  declaration

#### Scenario: Both extents can be read on one rail
- **GIVEN** the system space view at the 1280×720 CSS-pixel viewport floor,
  once in the light scheme and once in the dark scheme, with the acting fleet's
  fill and an overlay for a current quote both drawn, the extent being at least
  2 device pixels long
- **WHEN** the rendered colours are sampled in each scheme at the centre pixel
  of a point of the fill that the extent does not cover (the centre of the
  fill's part beyond the extent's end where the fill is longer than the extent,
  otherwise a point of the fill above the extent), the centre pixel of the extent,
  and the centre pixel of a part of the rail covered by neither
- **THEN** in each scheme the three sampled colours are pairwise unequal as
  sRGB values, so that the end of the fill and the end of the extent can each
  be located by eye in the same rail
- **AND** in an arrangement in which the extent ends past the fill's end, the
  centre pixel of the part of the extent past the fill's end is unequal to the
  rail's sampled colour
- **AND** in an arrangement in which the extent is unaffordable, the centre
  pixel of the mark is unequal to the sampled colours of the extent and of the
  fill

### Requirement: The Cost Overlay Is Drawn Only for the View's Successful, Current Preview, as the View Last Read It

The mounting view SHALL supply the strip a burn quote exactly while the view
holds a successful, current burn preview for the acting fleet and the current
selection, **as the view last read it**, and SHALL supply none otherwise. The
strip SHALL draw the cost overlay only while a quote is supplied, and SHALL
draw it for a supplied quote as the content requirement (*The Fuel Gauge Draws
the Served Fuel Cost of the Supplied Burn Quote as One Start-Anchored
Extent*) defines. "A successful, current preview" is
the determination of *A Failed or Stale Preview Is Never Presented as a
Current Quote* applied to the withheld states of *Burn Preview Reflects the
Server-Solved Order, Without Committing* and to the committed selection of *A
Burn Order Committed From This View Withholds Its Quote and the Burn Command
for That Selection While It Is the Fleet's Running Burn, as Last Read*; this
requirement does not restate those states, their ends or their lags, and the
overlay inherits each of them from its owner. A stale or failed quote SHALL be
withdrawn from the gauge, never marked and kept. A refresh that has been sent
and has not answered SHALL change nothing: an overlay drawn from the newest
successful response stays as that response drew it, and an overlay withdrawn
by a failed refresh stays withdrawn until a refresh succeeds. The quote the view supplies is the one determination from which the
burn command's fuel ceiling is derived: the overlay SHALL NOT be drawn while
that ceiling is absent, and this requirement places no rule on the ceiling.
The absence of an overlay SHALL NOT be treated as a reason to withhold or
alter anything another requirement presents for that quote. WHEN a withheld
preview resumes, no overlay SHALL be drawn until the restoring response lands,
and the overlay then drawn SHALL be that response's.

The overlay's cost and state SHALL be those of the newest preview response the
view holds. The fill comes from the own-fleets read and the overlay from the
preview read, so after a change to the fuel aboard the fill can move at the
own-fleets read while the overlay's state still reads the preview response
before it. A change to the fuel aboard SHALL of itself neither change the
overlay nor cause a preview request; the overlay then reads the response
before the change until the first preview response requested after the change
lands, that request being sent no later than one preview refresh interval
after the change, and a failure of that request withdraws the overlay. The overlay
adds no text and causes no announcement of its own, and its appearing,
changing or withdrawal causes no preview request of its own.

#### Scenario: With no selection there is no overlay
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the view renders with no current selection
- **THEN** no overlay is drawn and the fill spans 40 % of the rail

#### Scenario: A first preview still pending draws no overlay
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** a selection is made and its first preview response has not landed
- **THEN** no overlay is drawn
- **AND** when that response lands with `fuelCostTons` 30, the overlay is drawn
  at 15 % of the rail

#### Scenario: A failed first preview draws no overlay
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** the first preview request for the current selection fails and the
  command panel shows its no-quote state
- **THEN** no overlay is drawn
- **AND** when a retry of that request succeeds with `fuelCostTons` 30, the
  overlay is drawn at 15 % of the rail

#### Scenario: A refresh in flight never blanks the overlay
- **GIVEN** a current quote of `fuelCostTons` 30 draws an extent of 15 % of the
  rail, and a refresh interval has elapsed
- **WHEN** the refresh request is pending and has not answered
- **THEN** the overlay is still drawn at 15 % with its previous state attribute
- **AND** when the refresh answers with `fuelCostTons` 36, the extent spans
  18 % in a single change, with no render between in which no overlay is drawn

#### Scenario: A failed refresh withdraws the overlay and nothing else
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and a current quote of `fuelCostTons` 30 draws an extent of 15 %
- **WHEN** the next preview refresh fails while the command panel marks its
  figures stale
- **THEN** no overlay is drawn and the burn command's fuel ceiling is absent
- **AND** the fuel figure still reads 80 t, the range figure is unchanged and
  the fill still spans 40 % of the rail

#### Scenario: A refresh sent after a failure draws no overlay while it is pending
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, a current quote of `fuelCostTons` 30 drew an extent of 15 %, and a
  refresh failed and withdrew the overlay
- **WHEN** the next refresh has been sent and has not answered
- **THEN** no overlay is drawn and the burn command's fuel ceiling is absent

#### Scenario: A later successful refresh restores the overlay at the new cost and state
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and a failed refresh has withdrawn the overlay
- **WHEN** a later refresh succeeds with `fuelCostTons` 45 and `affordable`
  false
- **THEN** the overlay is drawn spanning 22.5 % of the rail, inside the fill
  of 40 %, with its state attribute reading unaffordable, as the response's
  flag does

#### Scenario: Replacing the selection never shows the previous target's cost
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and target X's quote of `fuelCostTons` 30 draws an extent of 15 %
- **WHEN** target Y becomes the selection
- **THEN** no overlay is drawn until Y's first response lands
- **AND** when Y's response with `fuelCostTons` 100 and `affordable` true
  lands, the extent spans 50 % of the rail

#### Scenario: The served flag is shown even when the cost exceeds the fuel aboard
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** a preview response lands for the current selection with
  `fuelCostTons` 100 and `affordable` true
- **THEN** the extent spans 50 % of the rail against a fill of 40 %, and its
  state attribute reads affordable
- **AND** the unaffordable mark is absent

#### Scenario: Clearing the selection withdraws the overlay
- **GIVEN** an overlay is drawn for the current selection
- **WHEN** the selection is cleared
- **THEN** no overlay is drawn

#### Scenario: Switching the acting fleet never shows the previous fleet's cost
- **GIVEN** an overlay is drawn for the acting fleet A and the current
  selection
- **WHEN** fleet B becomes the acting fleet with the selection kept
- **THEN** no overlay is drawn until B's first preview response lands, and
  the overlay then drawn is B's quote against B's own fill

#### Scenario: A withheld preview draws no overlay
- **GIVEN** an overlay is drawn for the current selection
- **WHEN** the view's last reads report, in turn, a running mine for the acting
  fleet whose ETA has not passed, then the acting fleet in lane transit, then
  the selection as the body the acting fleet is attached to
- **THEN** in each arrangement no overlay is drawn

#### Scenario: A committed order withdraws the overlay from acceptance through the gap
- **GIVEN** an overlay is drawn for the current selection
- **WHEN** a burn order for that selection is accepted from the view and no
  own-fleets read requested at or after the acceptance has answered
- **THEN** no overlay is drawn at the acceptance and none is drawn through
  the gap

#### Scenario: A committed order's overlay stays withdrawn while the read reports that burn
- **GIVEN** a burn order for the current selection was accepted from the view
- **WHEN** the own-fleets read answers reporting that order as the fleet's
  running burn, and again at a later read that still reports it
- **THEN** no overlay is drawn for that selection

#### Scenario: A resumed preview draws no overlay until its restoring response lands
- **GIVEN** an overlay was drawn for the current selection and was then
  withheld, once by a running mine and once by a committed order, and in each
  case the withheld state has now ended
- **WHEN** the restoring preview request is still pending
- **THEN** no overlay is drawn
- **AND** when the restoring response lands with `fuelCostTons` 30, the
  overlay is drawn from that response alone

#### Scenario: Another target is overlaid while the committed target is not
- **GIVEN** a burn order for target X was accepted from the view and is
  reported as the fleet's running burn
- **WHEN** target Y becomes the selection
- **THEN** Y's quote draws its overlay
- **AND** when X is selected again while its order is still the running burn,
  no overlay is drawn

#### Scenario: A burn the view did not commit is overlaid as a re-target
- **GIVEN** the own-fleets read reports a running burn for the acting fleet
  that this view holds no accepted commit for
- **WHEN** a different target becomes the selection and its quote lands
- **THEN** that quote's overlay is drawn alongside the fuel cell's draining
  marker

#### Scenario: The overlay is never drawn without the fuel ceiling
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and a current quote of `fuelCostTons` 30, so that the overlay is
  drawn and the burn command's fuel ceiling is present
- **WHEN** a refresh fails over the shown figures, and then a later refresh
  succeeds
- **THEN** after the failure the overlay is not drawn and the ceiling is
  absent, and after the success the overlay is drawn and the ceiling is
  present

#### Scenario: The fill can move before the overlay does
- **GIVEN** the acting fleet serves 20 t of fuel against a `cargoCapacity` of
  200 t, and the current quote of `fuelCostTons` 30 reads unaffordable
- **WHEN** the own-fleets read next reports 80 t of fuel aboard, before the
  next preview refresh is due
- **THEN** the fill spans 40 % of the rail, the overlay's state attribute
  still reads unaffordable, and the number of preview requests sent is
  unchanged
- **AND** when the next preview response lands with `affordable` true, the
  overlay's state attribute reads affordable

#### Scenario: The overlay is silent and costs no request
- **WHEN** an overlay appears, changes cost or state, and is withdrawn
- **THEN** no live-region text is made for any of the three
- **AND** the number of preview requests sent across those three is the number
  the refresh interval alone accounts for: drawing the overlay adds none

### Requirement: The Console Dock Extends Beneath the Strip and Is Collapsed on Every Mount of the View

The system SHALL render, on every render of the system space view, a console dock made of the vitals strip's row and, while the dock is expanded, a tab bar beneath that row and one tab's panel beneath the tab bar. The dock SHALL be collapsed on every mount of the system space view: collapsed, the dock is the strip's row alone, with a "Console" control that is not part of the strip. The dock's expanded state SHALL NOT be remembered across a reload or across navigation to another system. Expanding and collapsing the dock SHALL change no live region's text outside the tab panel's own content. The strip is unchanged in both states (*The Vitals Strip Is Present on Every Render of the System Space View* and *The Strip Carries No Verb* hold in each).

#### Scenario: The view opens with the dock collapsed
- **WHEN** the system space view opens
- **THEN** the strip is shown, no tab bar and no tab panel is shown, and the "Console" control is present

#### Scenario: Activating the Console control expands the dock
- **GIVEN** the dock is collapsed
- **WHEN** the "Console" control is activated
- **THEN** the tab bar and the selected tab's panel are shown beneath the strip's row
- **AND** a collapse control is present in the tab bar

#### Scenario: Activating the collapse control returns the dock to the strip alone
- **GIVEN** the dock is expanded
- **WHEN** the collapse control is activated
- **THEN** only the strip's row is shown and the "Console" control is present

#### Scenario: A reload shows the dock collapsed
- **GIVEN** the dock was expanded
- **WHEN** the view is reloaded
- **THEN** the dock is collapsed

#### Scenario: Navigating to another system and back shows the dock collapsed
- **GIVEN** the dock is expanded in one system's view
- **WHEN** the player navigates to another system's view
- **THEN** that view's dock is collapsed
- **AND** when the player navigates back to the first system, its dock is collapsed

#### Scenario: The strip reads the same in both states
- **GIVEN** reads that fill all five cells with figures and an acting fleet
- **WHEN** the dock is collapsed and again when it is expanded
- **THEN** in each state the strip shows its five cells with identical figures and its chevron

#### Scenario: The Console control is not part of the strip
- **GIVEN** the dock is collapsed
- **WHEN** the strip's interactive elements are enumerated
- **THEN** every one is the fleet cell's chevron or a descendant of the chevron's own menu, and the "Console" control is not among them

#### Scenario: The dock is present and expandable in the strip's failure states
- **WHEN** the view is in each of these states: the interior read has failed, the own-fleets read has failed, the canvas region is unavailable
- **THEN** in each state the "Console" control is present and activating it expands the dock

#### Scenario: Expanding and collapsing change no live region
- **GIVEN** the view has rendered with its reads answered
- **WHEN** the dock is expanded and then collapsed
- **THEN** no live region's text outside the tab panel's own content changes

### Requirement: The Dock Carries These Tabs

The dock's tab bar SHALL list exactly the tabs this requirement names, in the order it names them, and exactly one tab SHALL be selected whenever the dock is expanded, the selected tab's panel being the one shown. As of this change the tabs are, in order: Log. The Log tab's label SHALL be `Log` with no count.

#### Scenario: The tab bar lists the Log tab and no other
- **WHEN** the dock is expanded
- **THEN** the tab bar contains one tab, labelled `Log`

#### Scenario: The Log tab is selected and its panel is shown
- **WHEN** the dock is expanded
- **THEN** the Log tab is the selected tab and its panel is the one shown

#### Scenario: The Log tab's label carries no count however many rows are listed
- **GIVEN** the pile's first page holds three records and the served cursor says more pages exist
- **WHEN** the dock is expanded and the log has listed those records
- **THEN** the tab's label reads `Log` and contains no digit

### Requirement: The Log Tab Is the Sighting Log's Home on This View

The Log tab's panel SHALL be where the system space view shows the sighting log. This capability names that placement and restates none of `sighting-log`'s rules: the log's rows, refresh, load-more and its loading, empty and failed states are as `sighting-log` specifies them (*The Sighting Log Lists the Corporation's Own Pile in Served Order*, *The Log Pages Through the Pile With the Server's Own Cursor*, *The Log's Empty, Loading, and Failed States Are Each Explicit*), and the log's mount ordering is as *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* specifies it. The log SHALL NOT issue its first pile read, and the panel SHALL show no log content, until the interior read the view opened with — its first load, or the re-read of an interior the view already held — has answered or failed; until then the Log tab's panel SHALL show a waiting indication that is not the log's own loading state. A view that opens with no interior read in flight — it holds an interior it does not re-read at open, or its interior read has not been sent because the client is offline — has no such read to wait for: the log is then present from the view's first render, and this requirement imposes no wait. The ordering *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* requires is that requirement's and is not relaxed by this one. Once that read has answered or failed, a later re-read of the interior SHALL NOT remove the log from the panel, and the view SHALL NOT issue a pile read because a re-read of the interior answered or failed, except on a sweep's settle path, where it does (`system-space-view` *A Running Sweep Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the Pile*; `sighting-log` *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer*). A pile read with another cause is outside this sentence, whenever it falls. The affordance on a settled sweep's report that opens the log (*A Settled Sweep and the Scan Controls Are Reachable and Announced*) SHALL expand the dock with the Log tab selected and SHALL NOT collapse an expanded dock. The view SHALL carry no standalone toggle for the log and SHALL NOT show the log floating over the canvas. Activating a sighting ghost in the scene SHALL NOT expand the dock, and the ghost SHALL show its highlight; if that record is among the rows the log has listed, its row SHALL be highlighted when the Log tab is next shown.

#### Scenario: The expanded dock's Log panel holds the log
- **GIVEN** the interior read the view opened with has finished and the corporation's pile holds records
- **WHEN** the dock is expanded
- **THEN** the log, with its record rows and its refresh and load-more controls, is inside the Log tab's panel

#### Scenario: The log's loading, empty and failed states appear in the panel
- **WHEN** the dock is expanded while the pile read is in flight, then after it returns no records, then after a pile read fails
- **THEN** the panel shows the log's loading state, its empty state and its failed state with its retry affordance, each as `sighting-log` specifies

#### Scenario: The log reads nothing until the interior read's first load has finished
- **GIVEN** the interior read's first load has not finished
- **WHEN** the view renders, with the dock collapsed and then with it expanded
- **THEN** no read of the unfiltered pile is issued and no log content is present in either state

#### Scenario: The panel shows a waiting indication while the interior read's first load is in flight
- **GIVEN** the interior read's first load has not finished
- **WHEN** the dock is expanded
- **THEN** the Log tab's panel shows a waiting indication rather than an empty region, and that indication is not the log's own loading state

#### Scenario: The panel shows the log once the interior read's first load has answered or failed
- **GIVEN** the dock is expanded and the interior read's first load is in flight
- **WHEN** the interior read answers, or fails
- **THEN** the waiting indication is replaced by the log

#### Scenario: The log reads nothing while the re-read of an interior the view already held is in flight
- **GIVEN** the view has opened on a system whose interior it already held, the re-read of that interior is in flight, and the client holds no answer of the unfiltered pile newer than it keeps a read fresh
- **WHEN** the view renders, with the dock collapsed and then with it expanded
- **THEN** no read of the unfiltered pile is issued and no log content is present in either state
- **AND** once that re-read has answered or failed the log's first pile read is issued

#### Scenario: The panel shows the waiting indication during that re-read and the log once it has answered or failed
- **GIVEN** the dock is expanded and the re-read of an interior the view already held is in flight
- **WHEN** the panel is read, and then the re-read answers, or fails
- **THEN** the panel first shows a waiting indication that is not the log's own loading state
- **AND** the waiting indication is then replaced by the log

#### Scenario: A later re-read of the interior neither removes the log nor issues a pile read
- **GIVEN** the interior read the view opened with has finished, the log is present and its first pile read has been answered, no own fleet in the open system has a sweep running or past its ETA and unsettled, as the view last read it, and no scan commit is awaiting its first running-status answer
- **WHEN** the view re-reads the interior on its baseline cadence and that re-read answers, nothing else being invoked meanwhile
- **THEN** the log is still present with the rows it listed
- **AND** the number of pile requests issued is what it was before that re-read was issued

#### Scenario: A settled sweep's report link expands a collapsed dock to the Log tab
- **GIVEN** the interior read the view opened with has finished, a settled sweep's report is shown and the dock is collapsed
- **WHEN** the report's affordance that opens the log is activated
- **THEN** the dock is expanded with the Log tab selected and the log shown

#### Scenario: A settled sweep's report link does not collapse an expanded dock
- **GIVEN** a settled sweep's report is shown and the dock is expanded
- **WHEN** the report's affordance that opens the log is activated
- **THEN** the dock is still expanded with the Log tab selected

#### Scenario: No standalone toggle and no floating log remain
- **WHEN** the view is rendered with the dock collapsed and then expanded
- **THEN** no control labelled "Open sighting log" or "Close sighting log" is present in either state
- **AND** the log is not shown while the dock is collapsed
- **AND** while the dock is expanded the log is inside the dock's panel and nowhere else in the view

#### Scenario: Activating a ghost while the dock is collapsed highlights the ghost and leaves the dock collapsed
- **GIVEN** the dock is collapsed and a ghost is drawn for a record in the corporation's pile
- **WHEN** the ghost is activated in the scene
- **THEN** the ghost is highlighted in the scene and the dock is still collapsed

#### Scenario: The row for an activated ghost is highlighted when the tab is next shown
- **GIVEN** a ghost was activated in the scene while the dock was collapsed, for a record in the corporation's pile that the log lists once the dock is expanded
- **WHEN** the dock is expanded and the log has listed that record
- **THEN** that record's row is highlighted in the Log panel

### Requirement: The Dock Is Keyboard-Operable

The "Console" control, the Log tab and the collapse control SHALL each be reachable by Tab while the dock is in the state that shows them and SHALL each show a visible focus indicator; the "Console" control and the collapse control SHALL each also be activatable by Enter or Space. The "Console" control and the collapse control SHALL each expose their expanded state and the region they control to assistive technology and SHALL each have an accessible name, the tab bar SHALL be exposed as a tab list whose selected tab is exposed as controlling its panel, and the panel that is shown SHALL be exposed as a tab panel whose accessible name is the selected tab's label. WHEN the dock expands, or the affordance that opens the log is activated while the dock is already expanded, keyboard focus SHALL move to the selected tab. WHEN the dock collapses while keyboard focus is in its tab bar or its panel, focus SHALL move to the "Console" control and SHALL NOT be lost to the start of the document. In the keyboard tab order the dock's controls SHALL come after the strip's chevron, the collapse control SHALL precede the panel's own controls, and the camera controls SHALL still precede the body and lane-gate hit targets (*Space View Camera Is Keyboard-Operable*).

#### Scenario: Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard
- **WHEN** the keyboard tab order is walked with the dock collapsed and then with it expanded
- **THEN** the "Console" control is reached while collapsed and neither the Log tab nor the collapse control is, and the Log tab and the collapse control are reached while expanded
- **AND** activating the "Console" control or the collapse control with Enter, and again with Space, expands or collapses the dock

#### Scenario: Each dock control shows a visible focus indicator
- **WHEN** the "Console" control, the Log tab and the collapse control each take keyboard focus
- **THEN** each shows a visible focus indicator

#### Scenario: The expand and collapse controls expose their state
- **WHEN** the dock is collapsed and then expanded
- **THEN** the "Console" control exposes that the dock is collapsed, names the region it controls and has an accessible name
- **AND** the collapse control exposes that the dock is expanded, names the region it controls and has an accessible name

#### Scenario: The tab bar is a tab list controlling the panel
- **WHEN** the dock is expanded
- **THEN** the tab bar is exposed as a tab list, the Log tab is exposed as selected, and it is exposed as controlling the panel that is shown

#### Scenario: The shown panel is exposed as the Log tab's panel and has an accessible name
- **WHEN** the dock is expanded
- **THEN** the panel that is shown is exposed as a tab panel whose accessible name is the Log tab's label

#### Scenario: Tab from the Log tab reaches the collapse control and then the panel's controls
- **GIVEN** the dock is expanded with keyboard focus on the Log tab and the log has listed rows
- **WHEN** Tab is pressed repeatedly
- **THEN** the collapse control is reached next, then the log's controls in reading order, each once

#### Scenario: Expanding moves keyboard focus to the selected tab
- **GIVEN** the dock is collapsed with keyboard focus on the "Console" control
- **WHEN** the "Console" control is activated with Enter
- **THEN** keyboard focus is on the Log tab, and the dock's controls are reachable by Tab from there

#### Scenario: The report's link to the log moves focus to the Log tab
- **GIVEN** a settled sweep's report is shown
- **WHEN** the report's affordance that opens the log is activated, with the dock collapsed and again with it expanded
- **THEN** in each case the dock is expanded with the Log tab selected and keyboard focus is on the Log tab

#### Scenario: Collapsing with the collapse control moves focus to the Console control
- **GIVEN** the dock is expanded with keyboard focus on the collapse control
- **WHEN** the collapse control is activated
- **THEN** keyboard focus is on the "Console" control

#### Scenario: The dock's controls follow the strip's chevron in the tab order
- **WHEN** the dock is expanded and the keyboard tab order is walked
- **THEN** the strip's chevron is reached before the Log tab and before the collapse control

#### Scenario: The camera controls still precede the scene's hit targets with the dock expanded
- **WHEN** the dock is expanded and the keyboard tab order is walked
- **THEN** the camera controls are reached before any body or lane-gate hit target

### Requirement: The Dock Has One Fixed Height and Nothing Covers It or Is Covered by It

At a viewport of **1280 CSS pixels wide by 720 CSS pixels tall** the expanded dock, the strip's row included, SHALL be 220 CSS pixels tall and the full width of the viewport, and no control SHALL change that height; the strip's row SHALL be 56 CSS pixels tall in both states. Content of the selected tab's panel taller than the panel area SHALL scroll within the panel area, and no control of the selected tab SHALL be clipped out of reach; the log's refresh control and, once the log has listed a record, its first row SHALL lie wholly inside the panel area at the panel's scroll origin. The "Console" control, the Log tab and the collapse control SHALL each have a hit area at least 24 CSS pixels wide and 24 CSS pixels tall. At the same viewport, in each of the two states, each of these floating surfaces that is present — the right-hand command column, the sightings-unavailable card, the camera cluster, the app-wide floating navigation and the "Console" control (present while the dock is collapsed) — SHALL be shown wholly inside the viewport and SHALL overlap neither the strip, nor the dock while it is expanded, nor any other of them, and every control one carries SHALL be activatable; the strip's five cells SHALL lie inside the viewport and be unoverlapped. Transient toasts, hover fact cards and the off-screen reach chips (until a later change deletes them) are not covered. The expanded dock covers the lowest 220 CSS pixels of the canvas beneath it, and this change does not reframe the camera for it. A surface that scrolls its own content — the right-hand command column, for as long as it exists — meets this by its visible area lying wholly inside the viewport and clear of the strip, the expanded dock and the others, and by each control it carries being activatable once scrolled into view within it. The app-wide floating navigation SHALL follow the dock's height on the system space view and SHALL stay where it is on the galaxy route. No layout below 1280 CSS pixels wide is specified, produced or tested.

#### Scenario: The expanded dock is 220 CSS pixels tall and full width
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock expanded
- **THEN** the dock, from the top of the strip's row to the foot of the viewport, is 220 CSS pixels tall and 1280 CSS pixels wide

#### Scenario: The strip's row is 56 CSS pixels tall collapsed and expanded
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock collapsed and then expanded
- **THEN** the strip's row is 56 CSS pixels tall in each state

#### Scenario: Rows beyond what the panel area shows do not change the dock's height
- **GIVEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock expanded
- **WHEN** the log has listed more rows than the panel area shows
- **THEN** the dock is still 220 CSS pixels tall

#### Scenario: Content taller than the panel area scrolls within it
- **GIVEN** the log has listed more rows than the panel area shows, at a 1280×720 CSS-pixel viewport with the dock expanded
- **WHEN** the panel area is scrolled to its end
- **THEN** the log's last control is wholly inside the viewport and the dock is still 220 CSS pixels tall

#### Scenario: The refresh control and the first row are in view without scrolling the panel
- **GIVEN** the log has listed at least one row, at a 1280×720 CSS-pixel viewport with the dock expanded
- **WHEN** the panel area is at its scroll origin
- **THEN** the log's refresh control and its first row are each wholly inside the panel area

#### Scenario: The dock's pointer targets are at least 24 CSS pixels square
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock collapsed and then expanded
- **THEN** the "Console" control, the Log tab and the collapse control each have a hit area at least 24 CSS pixels wide and 24 CSS pixels tall

#### Scenario: No floating surface is covered by or covers the expanded dock
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock expanded and the command column, the sightings-unavailable card (carrying a retry affordance), the camera cluster and the floating navigation present
- **THEN** each surface's visible area lies wholly inside the viewport and overlaps neither the strip, the dock nor any other of them, and each control each carries is activatable, a control inside a scrolling surface being first scrolled into view within that surface

#### Scenario: No floating surface is covered by or covers the collapsed dock
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock collapsed and the command column, the sightings-unavailable card (carrying a retry affordance), the camera cluster, the floating navigation and the "Console" control present
- **THEN** each surface's visible area lies wholly inside the viewport and overlaps neither the strip, the dock nor any other of them, and each control each carries is activatable, a control inside a scrolling surface being first scrolled into view within that surface

#### Scenario: Every strip cell is inside the viewport with the dock expanded
- **WHEN** the view is rendered at a 1280×720 CSS-pixel viewport with the dock expanded
- **THEN** each of the five cells is rendered, non-empty, inside the viewport and overlapped by nothing

#### Scenario: The floating navigation stays where it is on the galaxy route
- **GIVEN** the galaxy route was reached by in-app navigation from a system space view whose dock was expanded
- **WHEN** the galaxy route is rendered at a 1280×720 CSS-pixel viewport after this change
- **THEN** the floating navigation's foot is 72 CSS pixels above the viewport's foot, as before this change

### Requirement: A Tab's Content Stays Mounted While It Is Not Shown

The content of a tab that is not shown — as of this change, the Log tab's content while the dock is collapsed — SHALL keep its state while it is not shown, and collapsing then expanding the dock SHALL NOT discard it: the pages the log has loaded, the row the player selected and the statement that row carries, and the state of the log's read are as the collapse left them, or as a read that finished while the dock was collapsed left them. Whether a row is highlighted still follows what the scene draws (*A Log Row and Its Ghost Address the Same Record By Its Served Id*), so a highlight is kept only while its ghost is still drawn, and this requirement states nothing about the statement of a row whose record came to have a ghost drawn while the dock was collapsed. While its tab is not shown the content SHALL be hidden from sight, from the keyboard tab order and from assistive technology, and a row's highlight SHALL NOT be presented. (The gloss: the content stays mounted.) The log's states, paging and highlight are as `sighting-log` and *The Log Tab Is the Sighting Log's Home on This View* specify them; this requirement restates none of them.

#### Scenario: Pages loaded with load-more survive a collapse and re-expand
- **GIVEN** the log lists the rows of a first page and of a second page loaded by its load-more control
- **WHEN** the dock is collapsed and then expanded
- **THEN** the rows of both pages are listed
- **AND** no pile request was issued by the collapse or the expansion

#### Scenario: A selected row's highlight survives a collapse and re-expand
- **GIVEN** the player selected a row whose record has a ghost drawn in the open system, so the row is highlighted, and the ghosts the scene draws do not change while the dock is collapsed
- **WHEN** the dock is collapsed and then expanded
- **THEN** the same row is highlighted

#### Scenario: A row's no-mark statement survives a collapse and re-expand
- **GIVEN** the player selected a row whose record has no ghost drawn in the open system, so the log states that the record has no mark there, and the ghosts the scene draws do not change while the dock is collapsed
- **WHEN** the dock is collapsed and then expanded
- **THEN** the same row is still selected and the statement is still shown

#### Scenario: A highlighted row is not presented while the dock is collapsed
- **GIVEN** a ghost was activated in the scene for a record whose row the log lists, and the dock is collapsed
- **WHEN** the page's visible and assistive-technology-exposed content is read
- **THEN** no row of the log is visible or exposed
- **AND** when the dock is then expanded that record's row is highlighted

#### Scenario: Nothing of the log is reachable while the dock is collapsed
- **GIVEN** the log has loaded rows and the dock is collapsed
- **WHEN** the keyboard tab order is walked from the strip's chevron to the end of the view
- **THEN** no element of the log receives focus
- **AND** no element of the log is exposed to assistive technology

#### Scenario: A pile read that answers while the dock is collapsed is shown on re-expand
- **GIVEN** the dock is collapsed and a pile read answers with a record the log had not listed
- **WHEN** the dock is expanded
- **THEN** the log lists that record
- **AND** no further pile request was issued by the expansion

#### Scenario: A further page requested just before a collapse is listed on re-expand
- **GIVEN** the log has requested a further page with its load-more control and the dock is collapsed before that page answers
- **WHEN** the page answers while the dock is collapsed and the dock is then expanded
- **THEN** the rows of both pages are listed
- **AND** no pile request was issued by the expansion

#### Scenario: A pile read that failed while the dock was collapsed shows its failed state on expansion
- **GIVEN** the dock is collapsed and the log's first pile read has failed
- **WHEN** the dock is expanded
- **THEN** the panel shows the log's failed state with its retry affordance, and neither its empty state nor its loading state
- **AND** no pile request was issued by the expansion

#### Scenario: The log's retry and the sightings-unavailable card's retry are independent
- **GIVEN** both the system-filtered pile read and the log's unfiltered pile read have failed and the dock is expanded
- **WHEN** the sightings-unavailable card's retry is activated and that read succeeds
- **THEN** the log still shows its failed state until its own retry or the explicit refresh succeeds

### Requirement: Showing or Hiding the Log Tab Issues No Read

Showing, hiding and re-showing the Log tab SHALL issue no network request. The log's first pile read, where *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* has the log issue one, SHALL NOT wait for the dock to be expanded: it SHALL be issued no earlier than the moment the interior read the view opened with, where the view opened with one, has finished (*The Log Tab Is the Sighting Log's Home on This View*), and whether the dock is expanded SHALL have no bearing on whether or when it is issued. Which later reads the log issues, and when, are as that requirement specifies; this requirement restates none of them.

#### Scenario: The log's first read is issued without the dock being expanded
- **GIVEN** the view was opened by loading the document and the interior read it opened with has finished
- **WHEN** the dock is never expanded
- **THEN** the log's first pile read is issued

#### Scenario: Expanding and re-expanding after the first read issues no request
- **GIVEN** the log's first pile read has been answered
- **WHEN** the dock is expanded, collapsed and expanded again
- **THEN** no network request is issued by any of the three actions

#### Scenario: The report's link to the log issues no pile request
- **GIVEN** the log's first pile read has been answered, a settled sweep's report is shown and the dock is collapsed
- **WHEN** the report's affordance that opens the log is activated
- **THEN** the dock is expanded with the Log tab selected
- **AND** no pile request was issued by the activation

#### Scenario: A record filed since the last read is listed after an explicit refresh
- **GIVEN** the log has listed a pile, the server now serves a record the log has not listed, and no sweep has settled in the view since the log's last read
- **WHEN** the dock is expanded and the player invokes the log's refresh affordance
- **THEN** the log lists the new record

### Requirement: Escape Collapses the Expanded Dock

WHEN Escape is pressed while the dock is expanded, anywhere in the system space view, the dock SHALL collapse, unless the fleet cell's open menu takes the key as *The Fleet Cell's Chevron and Menu Are Keyboard-Operable* has it do, in which case the dock SHALL NOT collapse. This requirement states the outcome while that menu is closed and while it is open with keyboard focus on the chevron or on one of its entries; it does not state what Escape does to the dock while the menu is open with keyboard focus elsewhere. One press of Escape SHALL do one thing: a repeated keydown of a held Escape that closed the menu SHALL NOT also collapse the dock. A collapse, by Escape or by the collapse control, SHALL NOT move keyboard focus that is outside the tab bar and the panel; with focus inside them, focus moves to the "Console" control as *The Dock Is Keyboard-Operable* states. A collapse by Escape SHALL change no space-view selection and no acting fleet and SHALL issue no request, and a text field or a select that held focus SHALL keep its value. While the dock is collapsed, Escape SHALL leave it collapsed and SHALL change no space-view selection and no acting fleet; what Escape does to the fleet cell's menu is that requirement's alone.

#### Scenario: Escape with focus inside the dock collapses it and moves focus to the Console control
- **GIVEN** the dock is expanded with keyboard focus on the Log tab
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed
- **AND** keyboard focus is on the "Console" control

#### Scenario: Escape with focus outside the dock leaves focus where it was
- **GIVEN** the dock is expanded with keyboard focus on a camera control
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on that camera control

#### Scenario: Collapsing with focus on the strip's chevron leaves focus there
- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron and its menu closed
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on the chevron

#### Scenario: Collapsing by a pointer press that moves no focus leaves focus on the chevron
- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron
- **WHEN** the collapse control is activated by a pointer press that does not move focus
- **THEN** the dock is collapsed and keyboard focus is still on the chevron

#### Scenario: Escape with focus on no control collapses the dock
- **GIVEN** the dock is expanded and keyboard focus is on no control, as after a pointer press that focuses nothing
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed

#### Scenario: Escape with focus in a text field or a select collapses the dock and keeps the field's value
- **GIVEN** the dock is expanded with keyboard focus in a field of the view holding a typed value, and again on a closed select showing a chosen option
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed
- **AND** the field's value and the select's chosen option are unchanged

#### Scenario: Escape collapses the dock in the strip's failure states
- **GIVEN** the dock is expanded while the interior read has failed, and again while the own-fleets read has failed, and again while the canvas is unavailable
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed in each

#### Scenario: Escape with the dock collapsed changes nothing
- **GIVEN** the dock is collapsed and a body is selected
- **WHEN** Escape is pressed
- **THEN** the dock is still collapsed and the same body is still selected

#### Scenario: Escape collapsing the dock clears no selection
- **GIVEN** the dock is expanded and a body is selected and a fleet is acting
- **WHEN** Escape is pressed
- **THEN** the dock collapses, the same body is still selected and the same fleet is still acting
- **AND** the press issues no network request

#### Scenario: Escape with the fleet cell's menu open closes the menu and leaves the dock expanded
- **GIVEN** the dock is expanded and the fleet cell's menu is open, with keyboard focus on one of its entries, and again with keyboard focus on the chevron
- **WHEN** Escape is pressed
- **THEN** the menu closes with focus on the chevron
- **AND** the dock is still expanded
- **AND** a second Escape then collapses the dock

#### Scenario: A held Escape that closed the menu does not also collapse the dock
- **GIVEN** the dock is expanded and the fleet cell's menu is open, with keyboard focus on one of its entries, and again with keyboard focus on the chevron
- **WHEN** Escape is pressed and held so that its keydown repeats
- **THEN** the menu closes
- **AND** the dock is still expanded

### Requirement: Activating the Dock Changes No Space-View Selection

Activating the "Console" control, the tab bar, a tab, the collapse control, or the panel and the controls inside it — every part of the dock other than the strip's row, which *Activating the Strip Changes No Space-View Selection* covers — by pointer or keyboard SHALL NOT change the space view's current body, lane-gate or point selection, SHALL NOT change the acting fleet, and SHALL NOT be treated as a space-view click, regardless of what the canvas draws beneath it. This mirrors *Activating the Strip Changes No Space-View Selection*.

#### Scenario: A pointer press on any part of the dock leaves the selection unchanged
- **GIVEN** a body is selected and a fleet is acting
- **WHEN** the "Console" control is pressed, and with the dock expanded the tab bar, the Log tab, the panel, the collapse control and the log's own refresh control, a row and load-more control are each pressed in turn
- **THEN** after each press the same body is selected and the same fleet is acting
- **AND** the canvas has received no pick from any of them

#### Scenario: Expanding and collapsing the dock leaves the acting fleet unchanged
- **GIVEN** a fleet is acting
- **WHEN** the dock is expanded and collapsed with the pointer, with the keyboard and, collapsing, with Escape
- **THEN** the same fleet is acting after each


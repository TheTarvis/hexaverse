## ADDED Requirements

### Requirement: The Board Renders on the Polar Lattice
The system SHALL render the tactical board on the polar ring-and-slot
lattice, drawing each lattice cell as the annular sector bounded by its
ring's inner and outer radius and by its slot's angular extent, rather than
as a hexagonal tile. Feature footprints, fleet positions, lane gates, scan
sweeps, and move-preview paths SHALL all be drawn at the positions the
shared board math resolves for their ring-and-slot coordinates, so the
board the player sees agrees with the coordinates the server computes.

#### Scenario: A lattice cell is drawn as an annular sector
- **WHEN** the board renders a system's lattice
- **THEN** each cell is drawn as an annular sector bounded by its ring's
  radii and its slot's angular extent, not as a hexagon

#### Scenario: A feature is drawn at its ring-and-slot footprint
- **WHEN** a system interior is rendered with a feature whose footprint is
  a list of ring-and-slot cells
- **THEN** the feature is drawn covering exactly those cells' positions

#### Scenario: A lane gate is drawn at its gate cell
- **WHEN** a system interior is rendered with a lane gate
- **THEN** the gate mark is drawn at the position resolved for its gate
  cell

### Requirement: Board Coordinates Are Ring-and-Slot Throughout
The system SHALL express every board coordinate it receives, renders,
selects, or submits as a ring-and-slot cell. The board SHALL treat the core
as the single cell `{ring: 0, slot: 0}` — the lattice has exactly one core
cell, occupied by the star — rather than as an origin among coplanar
neighbours.

#### Scenario: A selection resolves to a ring-and-slot cell
- **WHEN** the player selects a bare cell on the board
- **THEN** the selection identifies that cell by its ring and slot

#### Scenario: The core is a single cell
- **WHEN** the board resolves the innermost position of the lattice
- **THEN** it resolves to exactly one cell, `{ring: 0, slot: 0}`

### Requirement: Board Camera Pan and Zoom
The board's *default framing* — the framing this capability resets and
recenters to — is the fit-to-lattice framing at zoom `1×` with the pan
target at the core cell `{ring: 0, slot: 0}`: the framing the board presents on
first render before any camera input. The system SHALL let the player pan
the board's camera by pointer drag and zoom it by a wheel gesture, clamped
to a zoom range of `0.25×` to `6×` and to a pan range that confines the
camera's pan target to the lattice's bounding disc, so the board's
centre of view is always over the lattice. A wheel-zoom gesture SHALL keep
the point the camera is currently centred on fixed at the same screen
position after the zoom, rather than re-centring on the cursor or any
other point. For the purposes of `### Requirement: Board Picking Resolves
to the Entity Under the Pointer`, a pointer sequence whose movement
between press and release stays under **8 CSS pixels** SHALL resolve as a
click and SHALL NOT be treated as a pan; a pointer sequence whose movement
meets or exceeds that threshold SHALL resolve as a pan and SHALL NOT
change the selection. A pointer drag that begins over a fleet, feature, or
lane-gate mark and meets or exceeds that threshold SHALL pan the camera
exactly as a drag beginning over bare board would, and a wheel gesture
used with the pointer over such a mark SHALL zoom the camera exactly as it
would over bare board — a gesture is never dead-zoned merely because it
begins over a mark. Also for the purposes of that same requirement,
activating an on-screen camera control (the recenter control, or a
keyboard-operable pan/zoom affordance) by pointer or keyboard SHALL NOT
itself be treated as a board click for selection purposes, regardless of
any cell or mark drawn beneath it. The camera's pan and zoom state SHALL persist
unchanged across a selection change and across a realtime data refetch,
and SHALL reset to the board's default framing immediately, with no
animated or eased transition, when the route's `systemId` changes.
Regardless of the camera's current pan and zoom, hit targets for fleets,
features, and lane gates SHALL remain positioned at the marks actually
drawn, and a click on any point within the lattice that lies over no
such mark SHALL resolve to the cell containing that point — so a click
anywhere on the board, at any reachable pan and zoom, resolves to the same
entity or cell it would resolve to at the board's default framing.

#### Scenario: Pointer drag pans the camera
- **WHEN** the pointer drags across the board
- **THEN** the visible portion of the lattice shifts to follow the drag

#### Scenario: Wheel gesture zooms the camera
- **WHEN** a wheel gesture is used over the board
- **THEN** the board's visible scale changes in the scrolled direction

#### Scenario: Zooming keeps the current pan target fixed on screen
- **WHEN** a wheel-zoom gesture changes the camera's zoom level
- **THEN** the point the camera is currently centred on remains at the
  same screen position after the zoom, rather than the view re-centring
  on the cursor or any other point

#### Scenario: Zoom clamps at the minimum
- **WHEN** a wheel gesture continues zooming out past `0.25×`
- **THEN** the effective zoom stops at `0.25×` and does not decrease further

#### Scenario: Zoom clamps at the maximum
- **WHEN** a wheel gesture continues zooming in past `6×`
- **THEN** the effective zoom stops at `6×` and does not increase further

#### Scenario: Pan clamps to the lattice's bounding disc
- **WHEN** the pointer drags the camera repeatedly toward one edge of the
  lattice
- **THEN** panning stops with the camera's pan target confined to the
  lattice's bounding disc, so the board's centre of view remains over the
  lattice rather than the lattice being dragged entirely off-screen

#### Scenario: A drag that pans the camera does not change the selection
- **WHEN** a pointer drag that pans the camera is released over a fleet,
  feature, or lane-gate mark
- **THEN** the selection is unchanged

#### Scenario: A sub-threshold pointer press-release still resolves as a click
- **WHEN** a pointer press-release over a mark moves 7 CSS pixels between
  press and release
- **THEN** that mark's entity becomes the selection
- **AND** a pointer press-release over the same mark that moves 8 CSS
  pixels between press and release resolves as a pan and does not change
  the selection

#### Scenario: A gesture that begins over a mark still moves the camera
- **WHEN** a pointer drag begins over a fleet, feature, or lane-gate mark
  and meets or exceeds the movement threshold, or a wheel gesture is used
  with the pointer over such a mark
- **THEN** the camera pans and zooms exactly as it would over bare board,
  and the selection is unchanged

#### Scenario: Activating a camera control does not change the selection
- **WHEN** a camera control (recenter, or a keyboard-operable pan/zoom
  affordance) is activated by pointer or keyboard while an entity is
  selected
- **THEN** the selection is unchanged and no cell under the control becomes
  selected

#### Scenario: Camera state survives a selection change
- **WHEN** the camera has been panned or zoomed and a different entity is
  then selected
- **THEN** the camera's pan and zoom remain unchanged

#### Scenario: Camera state survives a realtime refetch
- **WHEN** the camera has been panned or zoomed and a realtime refetch
  lands updated board data
- **THEN** the camera's pan and zoom remain unchanged

#### Scenario: Camera resets when the system changes
- **WHEN** the player navigates from one system's board to a different
  system's board
- **THEN** the camera returns to that board's default framing immediately,
  with no animated or eased transition

#### Scenario: Picking survives pan and zoom
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and a mark is then clicked at its currently drawn position
- **THEN** that mark's entity becomes the selection

#### Scenario: A bare-cell click resolves correctly after pan and zoom
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and a point within the lattice that is over no mark is
  clicked
- **THEN** the cell containing that point becomes the selection

#### Scenario: Clicking outside the lattice still clears the selection after pan and zoom
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and a point outside the lattice is clicked
- **THEN** the selection becomes empty

### Requirement: Board Camera Touch Pinch-Zoom
The system SHALL let the player zoom the board's camera with a two-finger
pinch gesture on a touch-capable device, clamped to the same `0.25×`–`6×`
range as wheel zoom. A pinch gesture SHALL keep the point the camera is
currently centred on fixed at the same screen position, identically to
wheel zoom, rather than anchoring on the pinch midpoint. A single-finger
touch drag SHALL pan the camera using the same behavior and pan clamp as
pointer drag. A single-finger touch that begins and ends staying under
the same **8 CSS pixel** movement threshold defined in `###
Requirement: Board Camera Pan and Zoom` SHALL be treated as a tap,
resolving to a selection identically to a pointer click, rather than a
pan; a single-finger touch that meets or exceeds that threshold SHALL
resolve as a pan — the touch-gesture suppression this requirement needs to
keep native pinch from competing with the board SHALL NOT itself prevent a
tap within that threshold from producing a selection.

#### Scenario: Pinching outward zooms in
- **WHEN** a two-finger pinch-outward gesture is performed on the board
- **THEN** the board's visible scale increases

#### Scenario: Pinching inward zooms out
- **WHEN** a two-finger pinch-inward gesture is performed on the board
- **THEN** the board's visible scale decreases

#### Scenario: Pinch zoom respects the same clamp as wheel zoom
- **WHEN** a pinch gesture continues zooming past `0.25×` or past `6×`
- **THEN** the effective zoom stops at that bound, the same as it would for
  a wheel gesture

#### Scenario: Pinch zoom keeps the centred point fixed on screen
- **WHEN** a two-finger pinch gesture changes the camera's zoom level
- **THEN** the point the camera is currently centred on remains at the
  same screen position after the zoom, rather than the view re-centring
  on the pinch midpoint

#### Scenario: A single-finger touch drag pans instead of zooming
- **WHEN** a single-finger touch drag is performed across the board
- **THEN** the camera pans, following the same behavior and pan clamp as a
  pointer drag

#### Scenario: A stationary single-finger touch selects rather than pans
- **WHEN** a single-finger touch begins and ends staying under the 8 CSS
  pixel threshold (a tap, not a drag)
- **THEN** the touch is treated as a selection input, resolving to the
  entity under it the same as a pointer click, and the camera does not pan

#### Scenario: A single-finger touch that moves past the tap threshold pans
- **WHEN** a single-finger touch moves beyond the tap threshold before
  release
- **THEN** the camera pans by the moved distance and no selection change
  occurs on release

#### Scenario: Movement at and past the tap/pan threshold resolves as a pan
- **WHEN** a single-finger touch moves exactly 8 CSS pixels between
  touchstart and touchend
- **THEN** the touch resolves as a pan, not a selection
- **AND** a touch moving 9 CSS pixels (one pixel past the threshold) also
  resolves as a pan

### Requirement: Board Camera Is Keyboard-Operable
The system SHALL let the player pan and zoom the board's camera from the
keyboard, without requiring a pointer or touch input: arrow-key input SHALL
pan the camera by one radial unit, at the camera's current zoom, per key
press, and dedicated zoom-in/zoom-out key input SHALL zoom the camera by
one wheel-notch equivalent per key press, both respecting the same clamps
as pointer and touch input. The board's keyboard-operable camera controls,
together with the recenter control, SHALL occupy the board's tab order
before the fleet, feature, and lane-gate hit targets (the port's
"features first" ordering applies among the glyph groups), leaving the
glyph group order the port's `### Requirement: Board Glyph Selection Is
Keyboard-Operable` defines intact; they SHALL be reachable via the board's
normal tab order, and SHALL be distinguishable by a visible focus
indicator while focused. WHEN keyboard focus moves, via Tab, to a fleet,
feature, or lane-gate hit target that lies outside the camera's current
pan/zoom framing, the camera SHALL pan by the minimum displacement that
brings that hit target's focus indicator fully within the visible
viewport, preserving the current zoom where pan alone suffices,
immediately and with no animated or eased transition. WHEN arrow-key pan
or zoom-key input is given while the camera is already at the pan or zoom
clamp in the direction of that input, the camera control SHALL expose an
at-limit state in the DOM (an attribute or a status message conveyed to
assistive technology) that is absent when the same input is given away
from the clamp.

#### Scenario: Arrow keys pan the camera
- **WHEN** arrow-key input is given while the board's camera controls have
  keyboard focus
- **THEN** the camera pans by one radial unit in the corresponding
  direction, respecting the same pan clamp as pointer drag

#### Scenario: Zoom keys zoom the camera
- **WHEN** zoom-in or zoom-out key input is given while the board's camera
  controls have keyboard focus
- **THEN** the camera zooms in or out by one wheel-notch equivalent,
  respecting the same `0.25×`–`6×` clamp as wheel zoom

#### Scenario: A focused camera control shows a focus indicator
- **WHEN** the board's keyboard-operable camera controls receive keyboard
  focus
- **THEN** a visible focus indicator distinguishes them from their
  unfocused state

#### Scenario: Focus moving to an off-screen glyph brings it into view
- **WHEN** keyboard focus moves (via Tab) to a fleet, feature, or
  lane-gate hit target that is outside the camera's current pan/zoom
  framing
- **THEN** the camera pans by the minimum displacement that brings that
  hit target's focus indicator fully within the visible viewport,
  preserving the current zoom where pan alone suffices, immediately and
  with no animated or eased transition

#### Scenario: Keyboard input at a clamp is distinguishable from no input
- **WHEN** arrow-key pan or zoom-key input is given while the camera is
  already at a pan or zoom clamp, in the direction of that clamp
- **THEN** the camera control exposes an at-limit state in the DOM (an
  attribute or a status message conveyed to assistive technology) that is
  absent when the same input is given away from the clamp

### Requirement: Board Camera Manual Recenter
The system SHALL offer a control, reachable via the board's normal tab
order, that resets the camera's pan and zoom to the board's default
framing on demand, immediately and with no animated or eased transition;
invoking it SHALL leave the current selection unchanged.

#### Scenario: Recenter restores default framing on demand
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and the recenter control is invoked
- **THEN** the camera returns to the board's default framing immediately,
  with no animated or eased transition

#### Scenario: Recenter is reachable from the keyboard
- **WHEN** a user tabs to the recenter control and activates it with
  Enter or Space
- **THEN** the camera returns to the board's default framing, identically
  to a pointer activation

#### Scenario: Recentering while already at default framing is a no-op
- **WHEN** the recenter control is invoked while the camera is already at
  the board's default framing
- **THEN** the camera remains at the default framing and the current
  selection is unchanged

### Requirement: Camera Controls Are Inert While the Board Is Unavailable
WHILE the board's canvas region shows the unsupported or interrupted
state, the camera controls (the keyboard-operable pan/zoom affordances and
the recenter control) SHALL NOT be rendered or reachable in the tab order,
and board camera gestures SHALL NOT intercept or suppress pointer, wheel,
or touch input over that region. IF keyboard focus is on a camera control
at the moment that state appears, focus SHALL move as `### Requirement:
Renderer Unavailability States Are Accessible` specifies.

#### Scenario: Camera controls are absent while the board is unavailable
- **WHEN** the board's canvas region shows the unsupported or interrupted
  state
- **THEN** no camera control is present in the tab order
- **AND** a wheel gesture over that region scrolls the page normally
- **AND** if keyboard focus was on a camera control at that moment, focus
  moves per `### Requirement: Renderer Unavailability States Are
  Accessible` and is never silently dropped to the document body

## MODIFIED Requirements

### Requirement: Toggle-to-Deselect Single Selection
The system SHALL maintain exactly one selection at a time, among a
feature, a bare cell, a fleet, or a lane gate; selecting the currently
selected item again SHALL clear the selection (deselect) rather than
re-select it; selecting a different item of any kind SHALL replace the
current selection.

#### Scenario: Re-selecting the same feature deselects it
- **WHEN** a feature is selected and then clicked again
- **THEN** the selection becomes empty

#### Scenario: Selecting a hex replaces a feature selection
- **WHEN** a feature is selected and a bare cell is then clicked
- **THEN** the selection becomes that cell, and the feature is no longer
  selected

#### Scenario: Clicking board background clears the selection
- **WHEN** a feature is selected and a point on the board outside the
  lattice is clicked
- **THEN** the selection becomes empty

### Requirement: Move Preview From the Acting Fleet's Live Position
The system SHALL compute a live move preview from the acting fleet's
current effective position (its docked parent's live position if docked,
otherwise its board cell) to the current selection: a lead-intercept path
if the selection is an orbiting feature, a direct path if it is a fixed
feature or a bare cell, or the in-system leg to a gate's tile if the
selection is a lane gate — recomputed every frame so a led intercept's
countdown tracks the moving target. A selection resolving to the core cell
`{ring: 0, slot: 0}` — the single innermost cell of the lattice, which the
star occupies — or to a fixed feature, SHALL yield no move plan.

#### Scenario: Selecting an orbiting body previews a lead intercept
- **WHEN** an orbiting feature is selected with an active fleet present
- **THEN** the move preview is the lead-solved intercept path to that body,
  recomputed each frame

#### Scenario: Selecting the star yields no plan
- **WHEN** the star (a fixed feature at the core) is selected
- **THEN** no move plan is shown

#### Scenario: Selecting the core hex directly yields no plan
- **WHEN** the bare core cell `{ring: 0, slot: 0}` is selected
- **THEN** no move plan is shown

### Requirement: Move Commit
The system SHALL, when the move command is invoked with an active fleet
and a feature or cell selection, submit an order for that target; on
success it SHALL clear the selection and show a success toast; on failure
it SHALL show an error toast and leave the selection unchanged.

#### Scenario: A successful move clears the selection
- **WHEN** the move command succeeds
- **THEN** the selection is cleared and a success toast is shown

#### Scenario: A failed move keeps the selection and toasts the error
- **WHEN** the move command fails
- **THEN** the selection remains, and an error toast shows the failure
  reason

### Requirement: Scan Aim Preview Only While Considering the Verb
The system SHALL show the 360° sweep's shadow preview (what the sweep
would leave dark from the fleet's current position) only while the player
is hovering or keyboard-focusing the scan control — not while merely
selecting things to plan a move — and SHALL hide it otherwise.

#### Scenario: Hovering the scan control shows the sweep preview
- **WHEN** the pointer hovers (or keyboard focus lands on) the scan
  control
- **THEN** the sweep shadow preview is drawn from the fleet's current
  position

#### Scenario: Selecting a move target does not show the sweep preview
- **WHEN** a feature or cell is selected to plan a move, without hovering
  the scan control
- **THEN** no sweep preview is drawn

### Requirement: Running Scan Renders From Its Pinned Emission Cell
The system SHALL, while the acting fleet has a running scan whose ETA has
not yet passed, render the committed sweep centred on the scan's pinned
emission cell (from the running action's recorded params, falling back to
the fleet's position at the scan's ETA if no origin was recorded) — not
the fleet's current live position — and SHALL stop rendering it once the
scan's ETA passes.

#### Scenario: The committed sweep stays anchored to where it was fired
- **WHEN** a fleet with a running scan moves away from the cell it fired
  from before the scan's ETA
- **THEN** the rendered sweep remains centred on the original emission
  cell, not the fleet's current position

#### Scenario: The sweep stops rendering once the ETA passes
- **WHEN** world time reaches or passes the running scan's ETA
- **THEN** the committed sweep is no longer rendered

### Requirement: Departure Hand-Off to the Galaxy View
The system SHALL, when an own fleet that was being watched on this board
transits its departure gate (leaving it with no cell on this board), navigate
away from the board to the galaxy view, so the player follows their fleet
onto the lane crawl it now belongs to — but SHALL NOT navigate away merely
because a fleet already elsewhere is in transit when the board is opened
(only a departure actually watched on this board triggers the hand-off).

#### Scenario: Watching a fleet depart navigates to the galaxy view
- **WHEN** an own fleet on this board's departure gate transit completes
  while the board is open and being watched
- **THEN** the view navigates to the galaxy route

#### Scenario: Opening a board with an already-departed fleet does not navigate
- **WHEN** the board is opened for a system where an own fleet is already
  mid-lane-transit (departed before this board was opened)
- **THEN** no automatic navigation occurs

### Requirement: Fleet Roster Cross-Navigation
The system SHALL, via the shared fleet roster panel, make selecting a row
for a fleet on the current board set it as the acting fleet and select it;
selecting a row for a fleet in a different system navigate to that
system's board; and selecting a row for a fleet with no current board
presence (out on a lane) navigate to the galaxy view.

#### Scenario: Selecting a fleet in another system navigates there
- **WHEN** a roster row for an own fleet located in a different system is
  selected
- **THEN** the view navigates to that system's board route

#### Scenario: Selecting a fleet with no board presence navigates to the galaxy
- **WHEN** a roster row for an own fleet currently out on a lane (no board
  cell) is selected
- **THEN** the view navigates to the galaxy route

### Requirement: Mine Offer on the Docked Fleet
The system SHALL offer the mine verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a feature
carrying at least one visible resource AND the fleet's movement channel is
free (no running mine, not burning) — anchored to the fleet's docked
state, requiring no board selection: a fleet can only mine what it is
docked to, so selecting the body underneath it (which its own glyph
occludes) is never a precondition. The offer SHALL present a resource-kind
picker limited to the docked feature's visible resource kinds, defaulting
to the richest, and a tonnage input defaulting to the fleet's free hold
and constrained to a positive value no greater than the free hold.

#### Scenario: Mine is offered while docked at a resource-bearing body
- **WHEN** the acting fleet's effective state is `docked` to a feature
  carrying visible resources
- **THEN** the fleet panel offers the mine verb with a kind picker and a
  tonnage input defaulted to the fleet's free hold, with no board
  selection required

#### Scenario: Mine is not offered when merely co-located, not docked
- **WHEN** the acting fleet occupies the same cell as a resource feature
  but its effective state is not `docked`
- **THEN** the mine verb is not offered

#### Scenario: Mine is not offered when the docked body has no visible resources
- **WHEN** the acting fleet is docked to a feature that carries no visible
  resources
- **THEN** the mine verb is not offered

#### Scenario: Tonnage input clamps to free hold
- **WHEN** a tonnage greater than the fleet's free hold is entered
- **THEN** the input clamps the value to the free hold

### Requirement: Board Picking Resolves to the Entity Under the Pointer
The system SHALL resolve a click on the board to the entity drawn under the
pointer: a click within a fleet, feature, or lane-gate mark SHALL select
that entity; a click elsewhere within the lattice SHALL select the cell
containing that point, and that cell SHALL be visibly marked as selected on
the board; and a click outside the lattice SHALL clear the selection. Hit
targets SHALL be positioned at the marks actually drawn, and a feature's
hit-target size SHALL be independent of its fog-band visual treatment — an
outline-only astronomical feature SHALL NOT be harder to select than a
filled feature of the same type. WHEN two or more marks' hit targets
contain the clicked point, the topmost drawn mark SHALL win, using the
board's documented draw order (fleets above features above lane gates; a
child feature above its parent).

#### Scenario: Clicking a fleet mark selects that fleet
- **WHEN** the pointer clicks within a fleet's drawn mark
- **THEN** that fleet becomes the selection

#### Scenario: Clicking the lattice away from any mark selects the hex
- **WHEN** the pointer clicks a point within the lattice that is not
  over a fleet, feature, or lane-gate mark
- **THEN** the cell containing that point becomes the selection

#### Scenario: A selected bare hex is visibly marked on the board
- **WHEN** a bare cell (not a fleet, feature, or lane-gate mark) becomes the
  selection
- **THEN** that cell is visibly marked as selected on the board

#### Scenario: An overlapping child mark wins over its parent
- **WHEN** the pointer clicks a point where a moon's hit target and its
  parent feature's hit target overlap
- **THEN** the moon (the child, drawn on top) becomes the selection, not
  its parent

#### Scenario: Clicking outside the lattice clears the selection
- **WHEN** the pointer clicks a point outside the lattice
- **THEN** the selection becomes empty

#### Scenario: A docked fleet's shrunk hit target falls through to its host body
- **WHEN** a fleet's effective state is `docked` to a feature and the
  pointer clicks just outside the fleet's hull but still over the feature's
  mark
- **THEN** the feature is selected, not the fleet

#### Scenario: An outline-only astronomical feature keeps a full-size hit target
- **WHEN** a feature in the `astronomical` band is drawn as an unfilled outline
- **THEN** its hit target is the same size used for a filled feature of the
  same type, not reduced to the outline's stroke width

### Requirement: Sell Offer on the Docked Fleet
The system SHALL offer the sell verb on the acting fleet's panel section
whenever the acting fleet's effective state is `docked` to a station and
the fleet's cargo pool holds at least one kind of tonnage — anchored to the
fleet's docked state, requiring no board selection, mirroring `### Requirement:
Mine Offer on the Docked Fleet`'s anchoring rationale (a fleet can only
sell what it is docked to and currently holds). The offer SHALL present a
resource-kind picker limited to kinds the fleet currently holds AND that
the station is configured to buy (excluding a kind with no configured floor
for the station's region, so the picker never offers a guaranteed-fail
selection), defaulting to the kind with the greatest held tonnage among
those eligible, and a tonnage input defaulting to the fleet's full held
tonnage of the selected kind, constrained to a positive value no greater
than that held tonnage, alongside a live proceeds preview computed by
folding the selected tonnage across the station's demand entries for the
selected kind (per `goods-sale`'s "Settlement Folds Tonnage Across a
Venue's Ordered Demand Entries" and per-portion rounding rule), pinned to
the exact same fold and rounding the server settlement uses via the shared
`fixtures/market/cases.json` golden (design.md Decision 22) — so a player
is never shown a split or a total the settlement won't honor.

#### Scenario: Sell is offered while docked at a station with cargo aboard
- **WHEN** the acting fleet's effective state is `docked` to a station and
  its cargo pool holds at least one kind of tonnage
- **THEN** the fleet panel offers the sell verb with a kind picker and a
  tonnage input, with no board selection required

#### Scenario: Sell is not offered when merely co-located, not docked
- **WHEN** the acting fleet occupies the same cell as a station but its
  effective state is not `docked`
- **THEN** the sell verb is not offered

#### Scenario: Sell is not offered when the cargo pool is empty
- **WHEN** the acting fleet is docked to a station but its cargo pool holds
  no tonnage of any kind
- **THEN** the sell verb is not offered

#### Scenario: Tonnage input clamps to held tonnage of the selected kind
- **WHEN** a tonnage greater than the fleet's held tonnage of the selected
  kind is entered
- **THEN** the input clamps the value to that held tonnage

#### Scenario: The proceeds preview reflects the served quote
- **WHEN** the tonnage or kind selection changes while the sell offer is
  shown
- **THEN** the previewed proceeds update to reflect the served quote for
  the newly selected kind and tonnage

#### Scenario: A kind with no configured floor at this station is excluded from the picker
- **WHEN** the acting fleet holds a kind for which the docked station's
  region has no configured floor price
- **THEN** that kind does not appear in the sell offer's kind picker, even
  though the fleet holds tonnage of it

#### Scenario: A split-fill preview matches the settlement fold exactly
- **WHEN** the selected tonnage exceeds the station's highest-priority open
  demand entry's remaining quantity for the selected kind
- **THEN** the preview's reported per-entry portions and total proceeds are
  the exact values the shared fixture (`fixtures/market/cases.json`) pins
  for that case, identical to what the server's settlement would apply

## RENAMED Requirements

- FROM: `### Requirement: Running Scan Renders From Its Pinned Emission Hex`
- TO: `### Requirement: Running Scan Renders From Its Pinned Emission Cell`

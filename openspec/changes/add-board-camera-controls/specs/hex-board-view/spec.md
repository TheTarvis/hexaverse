## ADDED Requirements

### Requirement: Board Camera Pan and Zoom
The board's *default framing* — the framing this capability resets and
recenters to — is the fit-to-lattice framing at zoom `1×` with the pan
target at the lattice origin `(0,0)`: the framing the board presents on
first render before any camera input. The system SHALL let the player pan
the board's camera by pointer drag and zoom it by a wheel gesture, clamped
to a zoom range of `0.25×` to `6×` and to a pan range that confines the
camera's pan target to the hex lattice's bounding box, so the board's
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
any hex or mark drawn beneath it. The camera's pan and zoom state SHALL persist
unchanged across a selection change and across a realtime data refetch,
and SHALL reset to the board's default framing immediately, with no
animated or eased transition, when the route's `systemId` changes.
Regardless of the camera's current pan and zoom, hit targets for fleets,
features, and lane gates SHALL remain positioned at the marks actually
drawn, and a click on any point within the hex lattice that lies over no
such mark SHALL resolve to the hex containing that point — so a click
anywhere on the board, at any reachable pan and zoom, resolves to the same
entity or hex it would resolve to at the board's default framing.

#### Scenario: Pointer drag pans the camera
- **WHEN** the pointer drags across the board
- **THEN** the visible portion of the hex lattice shifts to follow the drag

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

#### Scenario: Pan clamps to the lattice's bounding box
- **WHEN** the pointer drags the camera repeatedly toward one edge of the
  hex lattice
- **THEN** panning stops with the camera's pan target confined to the
  lattice's bounding box, so the board's centre of view remains over the
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
- **THEN** the selection is unchanged and no hex under the control becomes
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

#### Scenario: A bare-hex click resolves correctly after pan and zoom
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and a point within the hex lattice that is over no mark is
  clicked
- **THEN** the hex containing that point becomes the selection

#### Scenario: Clicking outside the lattice still clears the selection after pan and zoom
- **WHEN** the camera has been panned and/or zoomed away from its default
  framing and a point outside the hex lattice is clicked
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
pan the camera by one hex width, at the camera's current zoom, per key
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
- **THEN** the camera pans by one hex width in the corresponding
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

## ADDED Requirements

### Requirement: Animation Never Re-Renders the View, and Never Starves a Navigation
The system SHALL advance the space view's picture — every body, lane gate,
own fleet, burn mark and hit target (*Own-Fleet Position, Burn Curve, and
Arrival Ghost Render Continuously*) — from an animation-frame loop alone,
reading the current world time from the view's clock at the instant of each
frame. The passage of an
animation frame SHALL NOT, by itself, cause any component of this view's tree
to render: the live world time SHALL NOT be held in component state, in a
React external store, or in any other value a component subscribes to per
frame, and no effect SHALL write component state in response to a per-frame
value. A frame-rate subscription in a leaf is the same default-priority
update at a smaller scope, and is equally prohibited.

Every figure this view presents that counts in time — a relative duration, the
world-clock readout, a state that flips when a served instant passes — SHALL
update within one wall-clock second of the instant its value changes while the
document is visible, and SHALL NOT require a per-frame render to do so. One
wall-clock second is the finest step any of them is legible at *at the scales
this game runs* (`figure-formatting` renders a sub-hour duration's smaller
unit in whole wall seconds and an absolute instant only to the world minute).
Above a served scale of 60 the absolute stamp advances by more than one world
minute per wall second and the coarse tick becomes a deliberate, accepted
coarsening rather than a lossless one. While the document is hidden, this figure
MAY update at a reduced cadence subject to the browser's own background-timer
policy; on the document becoming visible again, it SHALL reflect the current
world time within one wall-clock second, never a value frozen from before the
hidden interval.

A state that flips when a served instant passes — a running mine's command
gating (`docked-fleet-actions`'s *Running Mine Gates the Fleet Panel's
Commands*), a sweep's settling (`focused-scan`), a roster row's command
visibility (`fleet-roster`) — MAY therefore lag that instant by up to one
wall-clock second and SHALL NOT lag it further. The refetch each of those
schedules against that instant SHALL still be scheduled from the view's clock
read at full precision, never from the once-a-second value: the display's
resolution is a presentation choice and the schedule's is not.

A hit target SHALL be positioned at its mark's drawn position on every frame
that mark is drawn, so a moving mark and the target over it never separate
(*Space View Picking Resolves to the Body, Lane Gate, or Point Under the
Pointer*). Which marks HAVE targets, and which marks are currently off-screen
and therefore offered through the off-screen affordance (*Off-Screen Bodies
and Lane Gates Are Reachable by Pointer and Touch*), MAY instead be
recomputed once per wall-clock second and on every camera change rather than
every frame: membership changes only when a read lands, the selection
changes, or the camera moves — all of which are already changes the view
renders for — and the one case left is a mark crossing the viewport edge
under world time alone, in either direction, which SHALL be reflected within
one wall-clock second, never leaving that mark reachable by neither its
ordinary hit target nor the affordance for longer than that. A mark whose
position is frozen by requirement — a foreign contact, a sighting ghost —
needs no per-frame positioning at all.

An in-app navigation issued from a mounted, animating view — the fleet
switcher's and the roster's cross-system selection (*Fleet Roster
Cross-Navigation*) and the departure hand-off (*Departure Hand-Off to the
Galaxy View*) — SHALL commit, and SHALL arrive within 20 seconds of the
action that requested it — a ceiling taken from the journey budget this
defect was measured against (`defect-cross-system-chevron-nav-stall.md`), not
a target, and not to be relaxed. A route transition renders at a lower
priority than an ordinary state update.
Measured on this view: with the per-frame update in place, the cross-system
navigation failed to arrive within 20 seconds in 4 of 6 solo repeats; with it
silenced, 0 of 6 (`defect-cross-system-chevron-nav-stall.md`). Why React's own
starved-lane expiry did not rescue the stalled case is not established. The
view SHALL NOT be the reason a requested navigation fails to arrive.

The view SHALL NOT, while mounted, animating, and left idle for at least five
wall-clock seconds, cause an update-depth or nested-update diagnostic to be
written to the browser console. Such a diagnostic is the signal that a commit
is scheduling another commit, and it is the cheapest standing evidence that
the per-frame update has not returned by some other route: the tier-4
journey's console capture already greps for it.

#### Scenario: Frames pass without the view rendering
- **GIVEN** the space view is mounted with its reads settled, an own fleet
  burning so a mark moves every frame, and no input, refetch, or coarse tick
  occurring
- **WHEN** several animation frames elapse
- **THEN** the position the loop writes to that mark's hit target has changed
  between those frames
- **AND** the view's component tree has not rendered in that interval

#### Scenario: A counting figure advances without a per-frame render
- **GIVEN** the acting fleet is burning with a served arrival in the future,
  so a figure counts down to it
- **WHEN** two wall-clock seconds elapse with no read landing
- **THEN** that figure's raw span (`data-raw`) has decreased by the elapsed
  world-millisecond span
- **AND** the view rendered no more than three times in that interval, not
  once per animation frame

#### Scenario: A figure resyncs promptly when the tab regains visibility
- **GIVEN** the space view was hidden (backgrounded) for longer than its
  coarse tick's interval
- **WHEN** the document becomes visible again
- **THEN** every counting figure reflects the current world time within one
  wall-clock second, not a value computed from before the tab was hidden

#### Scenario: A hit target tracks its mark on every frame
- **GIVEN** an own fleet is burning, so its mark moves every animation frame
- **WHEN** animation frames elapse with no render of the view's component
  tree
- **THEN** that mark's hit target is at the mark's drawn position on each of
  those frames

#### Scenario: A mark crossing the viewport edge gains or loses its off-screen affordance within a second
- **GIVEN** a body or lane gate whose orbit or motion carries its mark across
  the viewport edge, in either direction, with no camera input
- **WHEN** its mark crosses the edge
- **THEN** its off-screen affordance's presence updates to match within one
  wall-clock second of the crossing

#### Scenario: A cross-system selection made while the view animates arrives
- **GIVEN** the space view is mounted and animating on one system, and an own
  fleet is in a different system
- **WHEN** that fleet is chosen from the fleet switcher or the roster
- **THEN** the browser arrives at that fleet's system route within 20 seconds
  of the selection

#### Scenario: The animating view raises no update-depth diagnostic
- **WHEN** the space view is mounted, animating, and left idle for at least
  five wall-clock seconds
- **THEN** no update-depth or nested-update diagnostic is written to the
  browser console

## MODIFIED Requirements

### Requirement: Body, Lane-Gate, and Point Selection Is Keyboard-Operable
The system SHALL make every body and lane-gate hit target reachable via
keyboard, in a consistent tab order — bodies first, then lane gates, each
group in stable id order; activating a focused hit target with Enter or
Space SHALL select it identically to a pointer click; the currently
focused hit target SHALL be distinguishable from unfocused ones by a
visible focus indicator; and a hit target that currently holds keyboard
focus SHALL retain that focus as the view animates — the animation loop
repositions a hit target in place and SHALL NOT itself unfocus, replace, or
remount the element the player is on.

The system SHALL additionally provide a keyboard-reachable control that
selects the **point in space** at the camera's current pan target, making the
point selection kind reachable without a pointer. Without it, a
keyboard-only player can reach two of this view's three selection kinds, and
the third — the one that makes `space-kinematics`'s point target reachable
from any UI at all — would be pointer-only. The control SHALL be in the same
tab order as the hit targets, SHALL show a focus indicator, and SHALL produce
a selection indistinguishable from one made by clicking that same point. The
pan target the control reads SHALL be reachable from the keyboard alone
(*Space View Camera Is Keyboard-Operable*'s pan input): at default framing
that target is the star, which every burn solve rejects by the
endpoint-clearance guard, so a control fed by a pan target the keyboard
cannot move is a control that can only ever produce an illegal target.

#### Scenario: Tab reaches hit targets in the defined order
- **WHEN** a user tabs through the space view's interactive surface
- **THEN** focus moves through the view's body hit targets first, then its
  lane-gate hit targets, each group in stable id order

#### Scenario: Focus survives the view's animation frames
- **WHEN** a hit target has keyboard focus and world time advances several
  frames
- **THEN** focus remains on that same hit target

#### Scenario: A focused body or gate shows a focus indicator
- **WHEN** a body or lane-gate hit target has keyboard focus
- **THEN** a focus indicator distinguishes it from unfocused targets

#### Scenario: Enter/Space selects the focused body or gate
- **WHEN** Enter or Space is pressed while a body or lane-gate hit target
  has focus
- **THEN** that entity becomes the selection, identically to a pointer
  click

#### Scenario: A keyboard control selects the point at the camera's pan target
- **WHEN** the point-selection control is focused and activated with Enter
  or Space
- **THEN** the point in space at the camera's current pan target becomes the
  selection, identical in kind and effect to a point selected by clicking

#### Scenario: The point-selection control is in the tab order and shows focus
- **WHEN** a user tabs through the space view's interactive surface
- **THEN** the point-selection control receives focus in the defined order
  and shows a focus indicator

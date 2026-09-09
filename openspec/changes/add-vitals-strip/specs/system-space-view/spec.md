## MODIFIED Requirements

### Requirement: System Space View Route and Data Fan-In
The system SHALL render `/systems/:systemId` from five reads this view
issues itself — the interior, the requester's own fleets, the open system's
station, the market price board, and the galaxy graph it resolves system
names from — plus the corporation session read the surrounding layout
already makes:

- **The interior** (`system-interior`'s *Interior Read Serves Continuous
  Bodies* — every body's continuous position, size, and orbital element set,
  plus the `contacts` array of disclosed foreign presence), disabled until a
  non-empty system id is known. It draws the scene, and it is this view's only
  source of a body's visible resource kinds.
- **The requester's own fleets**, read corporation-scoped through
  `GET /v1/fleets?mine=true` and filtered to this system on the client. The
  own-fleets read SHALL NOT be the system-scoped `GET /v1/fleets?systemId=`
  form: that read does not settle a due arrival, so a fleet that has already
  arrived would render as still burning with no attachment on this view while
  the roster — which reads corporation-scoped — shows it docked, two panels on
  one screen disagreeing about one fleet and the docked commands unreachable on
  the one that offers them.
- **The open system's station**, read through
  `GET /v1/systems/:systemId/station` (`trading-station`'s *Home Station
  Visible On the Direct Station Read, No Scan Required*). This view SHALL
  consume only the station's identity — its system id and its feature id —
  and SHALL NOT derive its drawn position from the station response at all;
  the station's drawn position comes from the interior read's body for it,
  exactly as every other body's does.
- **The market price board**, read through `GET /v1/market/board`
  (`market-price-board`'s *One Read Returns Every Visible Station's Quotes*),
  from which this view SHALL select the venue quotes whose system id is the
  open system's station's, and no other venue's.
- **The galaxy graph**, read through `galaxy-generation`'s graph read, used
  only to resolve a system id to a display name for the fleet roster's
  rows, the vitals strip's fleet cell, and the sighting log. It drives no
  offer and no command; IF it fails, THEN a system reads by its raw id and
  nothing else is withheld.

The requester's credit balance SHALL come from the ambient corporation
session read the surrounding layout already makes (`corporation-spawn`'s
balance-bearing session bootstrap), never from a further read issued by
this view.

Every offer and readout this view mounts SHALL be driven by the results of
those reads: `docked-fleet-actions`'s *Sell Offer on the Docked Fleet* by the
station and the venue quotes, its *Refuel Offer on the Docked Fleet* by the
station, and `system-console`'s *The Credits Cell Shows the Corporation's
Served Balance and Announces Its Changes* by the session balance. The vitals
strip this view mounts (`system-console`) SHALL be driven by the own-fleets
read, the interior read (for the name of a docked fleet's host), the galaxy
read (for the name of the system a fleet is in), the corporation session
read, and the world clock and its served scale — alongside every other
reader of those same reads, and never from a read the strip issues itself.
This view SHALL NOT offer a control whose commit would have no station, no
quote, or no balance to name, and SHALL NOT render a balance readout that
can never show a figure.

The system SHALL show a loading state while the interior read is in flight,
or, while the view's rendering context is available and uninterrupted, until
it has produced its first rendered frame. The unsupported and interrupted
states defined by *Renderer Unavailability Is an Explicit State* and *Lost
Rendering Context Recovers Without Navigation* take precedence over this
loading state: once either fires, the view shows that state, not the loading
placeholder, regardless of whether a first frame has ever been produced.

The reads SHALL fail independently, and no read's failure SHALL disable
another read's surface:

- IF the interior read fails, THEN the view SHALL show an error state in the
  canvas region — carrying the underlying error message when one is available
  — and SHALL offer a retry affordance that refetches the interior. The fleet
  roster and the `docked-fleet-actions` panel SHALL remain mounted, and every
  command anchored to the acting fleet's own served state SHALL remain
  invokable: sell, refuel, hold, release, cut drive, stop, and jump. The mine
  offer SHALL NOT be shown, because the docked body's visible resource kinds
  reach this view only on the interior read; its absence SHALL be presented as
  a consequence of the failed read, alongside the same retry, and never as
  "this body has nothing to mine".
- IF the own-fleets read fails, THEN the view SHALL show an error state in the
  fleet panel region, with its own retry affordance, and SHALL continue to
  render the interior's bodies, lane gates, and contacts; only the own-fleet
  marks are absent. The vitals strip's fleet, fuel, and hold cells — also fed
  by this read — degrade the same way: absent when no own-fleets data has
  ever been served, and never presenting a figure served by an earlier
  successful read as current once that read's most recent attempt has
  failed.
- IF the station read fails, THEN the view SHALL withhold the sell and refuel
  offers, SHALL attribute their absence to the failed read alongside a retry
  that refetches the station, and SHALL NOT present that absence as the
  system having nothing to trade with; the canvas, the roster, and every
  command anchored to the acting fleet's own served state SHALL be unaffected.
  A station read that resolves to no station is NOT a failure — it is the
  ordinary answer for a system that has none — and in that case the sell and
  refuel offers are simply absent, with no error surface and no retry.
- IF the market price board read fails, THEN the view SHALL withhold the sell
  offer, whose kind picker and proceeds preview are computed from the venue
  quotes, and SHALL attribute its absence to the failed read alongside a
  retry; the refuel offer SHALL remain, its cost preview coming from the fuel
  price served on the fleet's own read rather than from the board.
- IF the corporation session read has not resolved or has failed, THEN the
  credit balance readout SHALL show an explicit unavailable indication rather
  than a figure, and the sell and refuel offers SHALL remain invokable — a
  missing balance withdraws a readout, never a verb.

#### Scenario: Loading state before data arrives
- **WHEN** the system space view route is opened and its interior read has
  not yet loaded
- **THEN** a loading placeholder is shown

#### Scenario: The own-fleets read is the corporation-scoped one
- **WHEN** the system space view opens and requests the requester's own
  fleets
- **THEN** the request is the corporation-scoped `mine=true` form, filtered
  to this system on the client, and no `systemId`-scoped fleet list request
  is issued by this view

#### Scenario: The view reads the open system's station and the market board
- **WHEN** the system space view opens for a system id
- **THEN** it issues a station read for that system and a market price board
  read, and selects from the board only the venue quotes whose system id is
  that station's

#### Scenario: The station-anchored controls are driven by the view's own reads
- **GIVEN** an own fleet docked to the open system's station with cargo
  aboard, and the interior, own-fleets, station, market-board, and
  corporation session reads all resolved
- **WHEN** the fleet panel renders
- **THEN** the sell offer is shown and its proceeds preview reflects that
  station's served venue quotes
- **AND** the refuel offer is shown
- **AND** the strip's credits cell shows the corporation's served balance
  rather than an unavailable indication

#### Scenario: An arrived fleet reads as arrived on both the canvas and the roster
- **GIVEN** an own fleet whose burn's arrival time has already passed and
  whose arrival has not yet been settled by any other read
- **WHEN** the space view's own-fleets read completes
- **THEN** the canvas and the roster both show that fleet as arrived and
  attached, with no state in which one shows it burning while the other shows
  it docked

#### Scenario: A failed interior read shows a retriable error in the canvas region
- **WHEN** the interior read fails
- **THEN** the canvas region shows an error state carrying the underlying
  error message when available
- **AND** a retry affordance is offered that refetches the interior

#### Scenario: A failed interior read leaves the fleet-state-anchored commands usable
- **GIVEN** an acting fleet in one of the three states that anchor these
  commands — docked at a station, attached to a lane-gate body, or under way
  on a burn — no two of which one fleet can occupy at once
- **WHEN** that same fleet is rendered once with a healthy interior read and
  once with a failed one
- **THEN** the set of fleet-state-anchored commands offered is identical
  across the two renders, with the fleet roster and the
  `docked-fleet-actions` panel mounted in both
- **AND** the healthy render offers at least the commands that state anchors
  — sell and refuel when docked at a station, hold or release whenever the
  fleet's park mode offers one, jump when attached to a lane-gate body, cut
  drive and stop while under way — so an implementation that offers a command
  in neither render fails this scenario rather than satisfying it

#### Scenario: A failed interior read withdraws the mine offer without misreporting the body
- **WHEN** the interior read fails while the acting fleet is docked to a
  resource-bearing body
- **THEN** the mine offer is not shown, and what is shown attributes its
  absence to the failed read and offers the same retry — never a statement
  that the body carries no resources

#### Scenario: A failed own-fleets read shows a retriable error in the fleet panel
- **WHEN** the own-fleets read fails while the interior read succeeds
- **THEN** the fleet panel region shows an error state with its own retry
  affordance
- **AND** the canvas continues to render the system's bodies, lane gates, and
  contacts, with no own-fleet marks

#### Scenario: A failed station read withdraws the station-anchored offers without misreporting the system
- **WHEN** the station read fails while the acting fleet is parked in the
  open system
- **THEN** the sell and refuel offers are not shown, and what is shown
  attributes their absence to the failed read and offers a retry that
  refetches the station — never a statement that the system has nothing to
  trade with
- **AND** the canvas keeps rendering, and the fleet's cut-drive, stop, hold,
  release, and jump commands stay invokable

#### Scenario: A system with no station shows no station error
- **WHEN** the station read resolves with no station for the open system
- **THEN** the sell and refuel offers are absent with no error state and no
  station retry affordance shown

#### Scenario: A failed market-board read withdraws the sell offer but not the refuel offer
- **WHEN** the market price board read fails while the station read succeeds
  and the acting fleet is docked at that station with cargo aboard
- **THEN** the sell offer is not shown and its absence is attributed to the
  failed read, with a retry
- **AND** the refuel offer is still shown, its cost preview computed from the
  fuel price served on the fleet's own read

#### Scenario: An unresolved credit balance withdraws the readout, not the verbs
- **WHEN** the corporation session read has not resolved or has failed while
  the acting fleet is docked at a station with cargo aboard
- **THEN** the strip's credits cell shows an explicit unavailable
  indication rather than a figure
- **AND** the sell and refuel offers remain invokable

#### Scenario: Loading persists through first frame after data arrives
- **WHEN** the interior read has completed and the view's rendering context is
  available and uninterrupted, but it has not yet produced its first frame
- **THEN** the loading placeholder remains shown rather than an empty or
  black canvas

#### Scenario: An unsupported rendering context takes precedence over the loading placeholder
- **WHEN** the interior read has completed but the view's rendering context
  cannot be created
- **THEN** the view's canvas region shows the unsupported state, not the
  loading placeholder

### Requirement: Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point
The system SHALL maintain exactly one selection at a time, among a body, a
lane-gate body, or a picked point in empty space; selecting the currently
selected item again SHALL clear the selection (deselect) rather than
re-select it; selecting a different item of any kind SHALL replace the
current selection. The space view draws no selection affordance for a
fleet — an own fleet's or a foreign contact's rendered position is never a
member of this selection set; the acting fleet for `docked-fleet-actions`'
commands is instead set by one of three paths, each independent of this
selection: the fleet roster's row selection (`fleet-roster`'s *Row Selection
Delegated to the Mounting View*), activating a fleet's own rendered mark on
the canvas, or `system-console`'s fleet-cell chevron (*The Fleet Cell Names
the Acting Fleet and Delegates a Switch to the Mounting View*) — all three
delegate to the same callback contract, and none of them adds the fleet to
this selection.

#### Scenario: Re-selecting the same body deselects it
- **WHEN** a body is selected and then clicked again
- **THEN** the selection becomes empty

#### Scenario: Selecting a point replaces a body selection
- **WHEN** a body is selected and a point in empty space is then clicked
- **THEN** the selection becomes that point, and the body is no longer
  selected

#### Scenario: Clicking beyond the pick radius clears the selection
- **WHEN** a body is selected and a click resolves to a point beyond the
  scene's configured maximum pick radius, or does not intersect the pick
  plane at all
- **THEN** the selection becomes empty

### Requirement: Space View Camera Is Keyboard-Operable
The system SHALL let the player orbit, **pan**, and zoom the space view's
camera from the keyboard, without requiring a pointer or touch input:
arrow-key input SHALL orbit the camera by a configured increment per key
press; a dedicated pan input, distinct from the orbit input and reachable
without a pointer, SHALL translate the camera's pan target by a configured
increment per key press in the corresponding direction; and dedicated
zoom-in/zoom-out key input SHALL zoom the camera by a configured increment
per key press — all three respecting the same clamps as pointer and touch
input.

Keyboard pan is load-bearing, not polish. Two requirements of this
capability name a "keyboard-operable orbit/pan/zoom affordance" as an
existing thing (*Space View Camera Orbit, Pan, and Zoom* and *Camera
Controls Are Inert While the Space View Is Unavailable*), and *Body,
Lane-Gate, and Point Selection Is Keyboard-Operable*'s point-selection
control selects the point at the camera's **current pan target**. Without a
keyboard pan that target is the star at default framing for every
keyboard-only player, and the star is the one point `space.BuildCurve`'s
endpoint-clearance guard always rejects — so that accessibility requirement
would be satisfiable while shipping a control whose every activation
produces an illegal burn target. The space view's keyboard-operable camera controls, together
with the recenter control, SHALL occupy the view's tab order before the
body and lane-gate hit targets, leaving the group order *Body, Lane-Gate, and Point
Selection Is Keyboard-Operable* defines intact; they SHALL be reachable via
the view's normal tab order, and SHALL be distinguishable by a visible
focus indicator while focused. WHEN keyboard focus moves, via Tab, to a
body or lane-gate hit target that lies outside the camera's current
framing, the camera SHALL reframe by the minimum adjustment that brings
that hit target's focus indicator fully within the visible viewport,
immediately and with no animated or eased transition. WHEN orbit, pan,
or zoom key input is given while the camera is already at the orbit, pan,
or zoom clamp in the direction of that input, the camera control SHALL
expose an at-limit state in the DOM (an attribute or a status message conveyed to
assistive technology) that is absent when the same input is given away
from the clamp.

The on-screen camera cluster SHALL render exactly four cells — orbit,
zoom-in, zoom-out, and recenter — and SHALL NOT render a dedicated on-screen
pan control; the dedicated pan input this requirement mandates SHALL remain
reachable by keyboard alone once its on-screen buttons are gone. The pan
input SHALL be a modifier-plus-arrow chord on the surviving focusable orbit
cell, distinct from the bare-arrow orbit input on that same element. The pan
axis's at-limit state SHALL be exposed as an attribute on that cell naming
the blocked direction, absent when no pan direction is blocked, and SHALL
NOT be conveyed solely by the camera controls' shared status message: that
message reports at most one axis at a time, so a camera at both the zoom
clamp and the pan clamp would report no pan limit at all. The space view's
camera controls' accessible description SHALL name the pan input's key
binding, so a player who cannot see the deleted on-screen pan buttons can
still discover the mechanism from the control's own accessible name or
description. `select-pan-target-point` (*Body, Lane-Gate, and Point
Selection Is Keyboard-Operable*) is a selection affordance, not a camera
control, and SHALL continue to exist outside this four-cell count,
unaffected by the cluster's shrink.

#### Scenario: Arrow keys orbit the camera
- **WHEN** arrow-key input is given while the space view's camera controls
  have keyboard focus
- **THEN** the camera orbits by one configured increment in the
  corresponding direction, respecting the same clamp as pointer drag

#### Scenario: Pan keys translate the camera's target
- **WHEN** the dedicated pan input is given while the space view's camera
  controls have keyboard focus
- **THEN** the camera's pan target translates by one configured increment
  in the corresponding direction, respecting the same pan bound as a
  secondary-button drag, and the viewing angle is unchanged

#### Scenario: A keyboard-only player can pan to a point away from the star
- **GIVEN** the view at its default framing, whose pan target is the star
- **WHEN** a keyboard-only player gives the pan input and then activates the
  point-selection control
- **THEN** the selected point is the panned-to point, away from the star,
  and a burn commit against it is not rejected by the star's
  endpoint-clearance guard on account of the framing alone

#### Scenario: Zoom keys zoom the camera
- **WHEN** zoom-in or zoom-out key input is given while the space view's
  camera controls have keyboard focus
- **THEN** the camera zooms in or out by one configured increment,
  respecting the same clamp as wheel zoom

#### Scenario: A focused camera control shows a focus indicator
- **WHEN** the space view's keyboard-operable camera controls receive
  keyboard focus
- **THEN** a visible focus indicator distinguishes them from their
  unfocused state

#### Scenario: Focus moving to an off-screen glyph brings it into view
- **WHEN** keyboard focus moves (via Tab) to a body or lane-gate hit
  target that is outside the camera's current framing
- **THEN** the camera reframes by the minimum adjustment that brings that
  hit target's focus indicator fully within the visible viewport,
  immediately and with no animated or eased transition

#### Scenario: Keyboard input at a clamp is distinguishable from no input
- **WHEN** orbit, pan, or zoom key input is given while the camera is
  already at the corresponding clamp, in the direction of that clamp
- **THEN** the camera control exposes an at-limit state in the DOM (an
  attribute or a status message conveyed to assistive technology) that is
  absent when the same input is given away from the clamp

#### Scenario: A pan limit is still observable while the camera is also at the zoom clamp
- **GIVEN** the camera at both its zoom clamp and its pan clamp
- **WHEN** pan input is given in the direction of the pan clamp
- **THEN** the pan axis's at-limit state is observable in the DOM, naming
  the blocked direction, and is not masked by the zoom limit

#### Scenario: The camera group's accessible description names the pan binding
- **WHEN** the space view's keyboard-operable camera controls are inspected
  by assistive technology
- **THEN** their accessible name or description states the key binding that
  pans the camera

#### Scenario: The on-screen cluster renders exactly four camera cells
- **WHEN** the space view's on-screen camera controls render
- **THEN** the camera cluster contains exactly four cells — orbit, zoom-in,
  zoom-out, and recenter — no on-screen pan button exists, and the
  point-selection control is not one of them and is not inside the cluster

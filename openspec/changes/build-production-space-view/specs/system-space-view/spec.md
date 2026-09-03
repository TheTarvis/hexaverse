## ADDED Requirements

### Requirement: System Space View Route and Data Fan-In
The system SHALL render `/systems/:systemId` from four reads this view issues
itself, plus the corporation session read the surrounding layout already
makes:

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
  consume only the station's identity — its system id and its board feature id
  — and SHALL NOT read, render, or scale anything from the station response's
  lattice `orbit` object; the station's drawn position comes from the interior
  read's body for it, exactly as every other body's does.
- **The market price board**, read through `GET /v1/market/board`
  (`market-price-board`'s *One Read Returns Every Visible Station's Quotes*),
  from which this view SHALL select the venue quotes whose system id is the
  open system's station's, and no other venue's.

The requester's credit balance SHALL come from the ambient corporation session
read the surrounding layout already makes (`corporation-spawn`'s
balance-bearing session bootstrap), never from a fifth read issued by this
view.

Every offer and readout this view mounts SHALL be driven by the results of
those reads: `docked-fleet-actions`'s *Sell Offer on the Docked Fleet* by the
station and the venue quotes, its *Refuel Offer on the Docked Fleet* by the
station, and its *Credit Balance Readout* by the session balance. This view
SHALL NOT offer a control whose commit would have no station, no quote, or no
balance to name, and SHALL NOT render a balance readout that can never show a
figure.

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
  marks are absent.
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
- **AND** the credit balance readout shows the corporation's served balance
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
- **THEN** the credit balance readout shows an explicit unavailable
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
commands is instead set by the fleet roster's row selection
(`fleet-roster`'s *Row Selection Delegated to the Mounting View*),
independent of this selection.

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

### Requirement: Own-Fleet Position, Burn Curve, and Arrival Ghost Render Continuously
The system SHALL render each of the requester's own fleets present in this
system, and every body and lane gate, at a position evaluated continuously
from already-served values and the current world time, through
`frontend/lib/space`'s draw-only evaluation — advancing between polls with no
additional network request. `space-kinematics`'s *Every Rule-Bearing Value of
This Capability Is Computed Only in the Authoritative Implementation*
explicitly permits a render module to draw from server-produced control
points, stored orbital elements, and already-quantized arrival milliseconds,
and forbids it from re-deriving a flight time, an arrival time, an intercept,
a curve length, a delta-v price, a settled park, or a visibility answer. This
requirement stays inside that permission by the three rules below.

**The current world time** SHALL be extrapolated from the most recent served
reading at the **served world-clock scale**, never at an assumed scale of 1.
Both reads this view fans in carry the scale alongside their `worldTime`
(`system-interior`'s *Interior Read Serves Continuous Bodies*,
`fleet-movement`'s *Fleet Reads Serve the Simulation Clock's Scale Alongside
Their World Time*), and a client projecting at the wrong rate draws every
orbit and every burn mark progressively further from truth the longer it goes
between polls — and reaches a burn's `u = 1` at the wrong wall instant, so a
ship appears to arrive early or never.

**A body, a lane gate, and a parked or drifting fleet** SHALL be drawn from
their served element sets — a body's and a gate's `orbitElements`, a park's
served radius, period, phase, epoch and offset, a drift's served anchor,
velocity and epoch — evaluated at the current world time.

**A burning fleet** SHALL be drawn along its served curve at the **Bézier
parameter** `u = (t − departMs) / (arriveMs − departMs)`, clamped to the
closed interval from 0 to 1, using the served control points and the served
integer departure and arrival milliseconds. This position is **decorative**:
it is deliberately not the arc-length-correct position under the burn's
brachistochrone profile, and the view SHALL NOT compute one — inverting arc
length over the curve requires the curve's length and its speed profile, both
of which are rule-bearing values this render module is forbidden to derive.
The drawn mark is therefore ahead of or behind the ship's true position for
most of the flight, coinciding at departure and at arrival.

**A burn whose served `arriveMs` has passed** SHALL be drawn frozen at its
served intercept until a refetch lands the settled park. The view SHALL NOT
fold a burn into its settled park: that fold is `space.StateAt`, and a settled
park is on the forbidden list by name.

No drawn position SHALL be used to decide or to display a value. Every number
this view shows — an arrival time, a remaining duration, a delta-v, a fuel
cost, a distance, an affordability verdict, a stranding warning — SHALL come
from a served field, never from a position this module evaluated; and no
drawn position SHALL feed a range test, an occlusion test, or any other
predicate. Because the drawn positions are computed with ordinary
floating-point trigonometry rather than the authoritative implementation's
pinned turn table, they are not bit-identical to the server's and SHALL never
be compared against a server-produced position.

WHILE an own fleet's effective state is a burn, the view SHALL additionally
render that burn's full stored curve and an arrival ghost at the target's
position at the burn's served arrival time (a wireframe of the target body for
a body target, evaluated from that body's served `orbitElements` at
`arriveMs`; a distinct marker for a point target, at the served intercept). A
fleet reporting no position (`fleet-movement`'s *Effective Position
Resolution* — mid-jump, or attached to a host the current body table does not
resolve) SHALL be omitted from the scene rather than drawn at a stale or
default position.

#### Scenario: Live world time is projected at the served scale, not an assumed one
- **GIVEN** a world whose simulation clock runs at a scale other than 1
- **WHEN** the view extrapolates live world time between polls
- **THEN** it projects at the scale the read served, so a body's drawn
  position at a given wall instant matches the position the server would
  report for that instant

#### Scenario: An idle fleet renders at its live position, advancing with world time
- **WHEN** an own fleet's effective state is a park or a drift
- **THEN** it renders at that state's position evaluated at the current
  world time, moving between frames with no additional network request

#### Scenario: A burning fleet renders its curve and an arrival ghost
- **WHEN** an own fleet's effective state is a burn
- **THEN** the view renders the burn's full stored curve and an arrival
  ghost at the target's position at the burn's served arrival time

#### Scenario: A burning fleet's mark advances by curve parameter, not by arc length
- **GIVEN** a burn whose served departure and arrival milliseconds bracket
  the current world time
- **WHEN** the burning fleet's mark is drawn
- **THEN** its position is the curve evaluated at the Bézier parameter
  `(now − departMs) / (arriveMs − departMs)`
- **AND** no arc length, curve length, speed profile, or flight time is
  computed anywhere in the client to place it

#### Scenario: A burn past its served arrival freezes at the intercept until a refetch
- **WHEN** the current world time is at or after a burn's served `arriveMs`
  and no refetch has yet returned the settled state
- **THEN** the fleet's mark is drawn at the burn's served intercept and does
  not move
- **AND** no settled park is computed on the client

#### Scenario: No displayed value is derived from a drawn position
- **WHEN** the view displays an arrival time, a remaining duration, a
  delta-v, a fuel cost, a distance, an affordability verdict, or a stranding
  warning
- **THEN** every one of those values is read from a served field, and none is
  computed from a position this view evaluated for drawing

#### Scenario: A fleet with no reported position is omitted from the scene
- **WHEN** an own fleet reports no position (mid-jump, or attached to an
  unresolved host)
- **THEN** it is omitted from the rendered scene rather than drawn at a
  stale or default position

### Requirement: Foreign Contacts Render at Their Served Position
The system SHALL render every entry in the interior read's `contacts` array
(`system-interior`'s *Foreign Presence Is Served As System Contacts*) at
its served position, visually distinguishing an emitting contact and a
scanning contact from a quiet one, and carrying no owner identity or fleet
id in its rendering — the wire's own anonymity. An empty or absent
`contacts` array SHALL render no foreign presence.

A contact SHALL be drawn **frozen at its served position** between reads and
SHALL NOT be integrated forward from its served `velocity`. The served
velocity SHALL instead be **displayed**, as a heading-and-speed readout on
the selected or hovered contact's facts surface, so the field has exactly
one named consumer and is not served-and-unread. Integrating it would place
a contact's drawn position at a point the server never disclosed — a
disclosure decision made client-side, and the one thing this capability's
served-position rule exists to prevent; a contact is a momentary disclosure,
not a tracked object with a trajectory (`sighting-records` is the surface
that freezes a trajectory, and it freezes it explicitly).

#### Scenario: A disclosed contact renders at its served position
- **WHEN** the interior read's `contacts` array carries an entry
- **THEN** the view renders it at that entry's served position

#### Scenario: A contact does not drift between reads
- **WHEN** world time advances between two interior reads while a contact is
  rendered
- **THEN** the contact's drawn position is unchanged from its served
  position, and no client-side integration of its served `velocity` moves it

#### Scenario: A contact's served velocity is displayed, not integrated
- **WHEN** a rendered contact is selected or hovered
- **THEN** its served `velocity` is displayed as a heading-and-speed
  readout, and that readout is the field's only consumer

#### Scenario: An emitting or scanning contact is visually distinguished
- **WHEN** a rendered contact carries `emitting: true` or `scanning: true`
- **THEN** its rendering is visually distinguished from a quiet contact

#### Scenario: No identity is rendered for a contact
- **WHEN** a contact is rendered
- **THEN** no owner name, corporation, or fleet id is shown for it

### Requirement: A Non-Star Position at the Origin Is Omitted From the Scene, Not Drawn Atop the Star
WHILE a body's, fleet's, or contact's served or resolved position other
than the system's star equals the exact origin `(0,0,0)`, the system SHALL
treat that value as invalid, omit that entity from the rendered scene, and
log a diagnostic entry naming the omitted entity — never drawing it
superimposed on the star, which a zero position would otherwise produce.
The star itself, which is always positioned at the origin
(`system-interior`'s *Interiors Emit Continuous Orbital Elements For Every
Body*), is exempt from this rule.

#### Scenario: A non-star body served at the origin is omitted and logged
- **WHEN** a non-star body's served position is exactly `(0,0,0)`
- **THEN** it is omitted from the rendered scene and a diagnostic entry
  naming it is logged

#### Scenario: A fleet or contact resolved to the origin is omitted and logged
- **WHEN** an own fleet's or a contact's position resolves to exactly
  `(0,0,0)`
- **THEN** it is omitted from the rendered scene and a diagnostic entry
  naming it is logged

#### Scenario: The star at the origin renders normally
- **WHEN** the system's star, positioned at the origin, is rendered
- **THEN** it renders normally, unaffected by this requirement

### Requirement: Belt Members Render as Decorative Detail, Never as Separate Pickable Bodies
The system SHALL render a belt's members as an undifferentiated decorative
field (a jittered particle ring around the belt feature's position) rather
than as individually drawn or hit-testable bodies: no member SHALL carry
its own hit target, selection, or facts display, and the belt feature
itself SHALL remain the sole pickable, mineable body for that field —
carrying forward `re-express-economy-positions`'s one-belt-one-lode ruling;
its per-member-lode deferral rolls forward again, still un-picked, rather
than being resolved here.

#### Scenario: Clicking within the belt's decorative field selects the belt feature
- **WHEN** a point within a belt's decorative field, not over any other
  mark, is clicked
- **THEN** the belt feature becomes the selection, never an individual
  member

#### Scenario: Belt members render with no individual facts or selection state
- **WHEN** a belt's decorative field is rendered
- **THEN** no member within it carries its own hit target, selection state,
  or facts display

### Requirement: Burn Preview Reflects the Server-Solved Order, Without Committing
WHILE a body, a lane-gate body, or a point is the current selection, the
system SHALL request a preview of the order that selection would commit via
`POST /v1/fleets/:fleetId/orders/preview` (`fleet-movement`'s *Burn Order
Preview Solves Without Committing*) and render its solved curve as a distinct
preview overlay alongside the arrival time, delta-v cost, fuel cost, whether
that cost is currently affordable, and whether it would leave the fleet
stranded — all figures the server's own solve returns, never recomputed or
re-derived client-side.

A preview SHALL be requested whenever a commit of that same order would be
accepted, and only then. In particular a preview SHALL be requested while the
acting fleet is **burning**: re-targeting mid-flight is an ordinary commit
against the fleet's live tangent, it is the most consequential order in the
game, and offering the commit while withholding the quote would remove the
preview from the decision that most needs one. A preview SHALL NOT be
requested while the acting fleet's movement channel is claimed by a running
mine, or while it is in lane transit, since a commit would be refused in both
cases.

The preview SHALL refresh from a fresh server solve on a **single named
client-side interval constant, defined in exactly one place**, while it
remains shown and the selection is uncommitted, so it does not drift stale
against a moving target or a changing fuel balance; and SHALL clear when
the selection is cleared or replaced, or when an order commits. Exactly one
fresh preview request SHALL be sent per elapsed interval while a preview is
shown, and none between — the endpoint is not free (it reads the body
table, may write an arrival settlement, and runs an N-solve stranding scan,
N bounded by the destination system's body count, per acting fleet per
player), so an unbounded or ad-hoc cadence is a real server cost, and a
refresh rate scattered across call sites is one no reviewer can price. The
constant's **value** is an open question recorded in design.md (OQ-14), not
fixed here.

#### Scenario: Selecting a target shows a preview curve and its figures
- **WHEN** a body, lane-gate body, or point becomes the selection and a
  commit of that order would be accepted
- **THEN** a preview request is sent and its returned curve, arrival time,
  delta-v cost, fuel cost, and affordability are rendered

#### Scenario: A burning fleet's re-target is previewed
- **GIVEN** the acting fleet has a running burn
- **WHEN** a different body, lane gate, or point becomes the selection
- **THEN** a preview request is sent for the re-target and its figures are
  rendered alongside the running burn's own curve

#### Scenario: Clearing the selection clears the preview
- **WHEN** the current selection is cleared or replaced
- **THEN** the previously shown preview is removed

#### Scenario: The preview refreshes on exactly one named interval while shown
- **WHEN** a preview remains shown against an uncommitted selection across
  several elapsed refresh intervals
- **THEN** exactly one fresh preview request is sent per elapsed interval
  and none is sent between them, the interval being the single named
  client-side constant
- **AND** the rendered curve and figures update to the newest response

#### Scenario: The refresh interval is defined in exactly one place
- **WHEN** the view's preview-refresh scheduling is inspected
- **THEN** every refresh reads one named constant defined in a single
  module, with no second literal or per-call-site cadence

#### Scenario: An unaffordable preview is shown as such
- **WHEN** a preview response reports the target unaffordable at the
  acting fleet's current fuel
- **THEN** the preview is rendered in a state visually distinct from an
  affordable one

#### Scenario: No preview is requested while a mine holds the movement channel
- **WHEN** the acting fleet has a running mine claiming its movement
  channel, or is in lane transit
- **THEN** no preview request is sent for a newly made selection

### Requirement: A Failed or Stale Preview Is Never Presented as a Current Quote
IF a preview request fails, THEN the system SHALL NOT present any figures for
that selection as current. Every burn a player commits rides this path, so its
failure modes are specified rather than left to the implementation:

- IF the **first** preview for a selection fails, THEN the view SHALL show a
  distinguishable no-quote state for that selection — naming that no quote is
  available rather than showing an empty, zero, or previous-target figure —
  and SHALL offer a retry affordance that re-requests the preview.
- IF a **periodic refresh** fails while figures are already shown, THEN the
  view SHALL mark those figures as stale rather than continuing to present
  them as current, SHALL offer the same retry affordance, and SHALL restore
  the current presentation when a later refresh succeeds.
- WHILE a selection has no successful, current preview — because none has
  succeeded, or because the newest refresh failed — the burn command SHALL
  remain available and SHALL be labelled as uncapped before it is submitted,
  and it SHALL be submitted with no `maxFuelTons` cap. A transient preview
  failure SHALL NOT make the game's core verb unreachable, and a cap SHALL
  never be derived from a figure the view has already marked stale.

#### Scenario: A failed first preview shows a no-quote state, not empty figures
- **WHEN** the first preview request for the current selection fails
- **THEN** a distinguishable no-quote state is shown for that selection, with
  no arrival time, delta-v, or fuel figure presented for it

#### Scenario: A failed first preview offers a retry
- **WHEN** the no-quote state is shown
- **THEN** a retry affordance is offered, and invoking it re-requests the
  preview for the current selection

#### Scenario: A failed refresh marks the shown figures stale
- **GIVEN** a preview whose figures are currently displayed
- **WHEN** a periodic refresh of that preview fails
- **THEN** the displayed figures are marked stale rather than shown as
  current, and a retry affordance is offered

#### Scenario: A later successful refresh clears the stale marking
- **GIVEN** a preview whose figures are marked stale after a failed refresh
- **WHEN** a subsequent refresh succeeds
- **THEN** the newest figures are shown as current and the stale marking is
  removed

#### Scenario: The burn stays committable without a quote, labelled as uncapped
- **WHEN** the current selection has no successful, current preview
- **THEN** the burn command remains available, is labelled as uncapped before
  submission, and is submitted with no `maxFuelTons` field

#### Scenario: A stale figure never becomes a cap
- **WHEN** a burn is committed while the displayed preview figures are marked
  stale
- **THEN** no `maxFuelTons` is sent, and the stale fuel figure is not used as
  a cap

### Requirement: A Burn Commit Is Quote-Locked to the Preview the Player Agreed To
WHEN a burn order is committed while a successful, current preview is shown
for that selection, the system SHALL send a `maxFuelTons` cap
(`fleet-movement`'s *A Burn Commit Is Rejected When Its Solved Fuel Cost
Exceeds the Requester's Quoted Cap*) derived from that preview's fuel cost by
a single named client-side allowance factor, and SHALL display the resulting
ceiling — not only the point estimate — before the player commits, so the
figure the player agrees to is the figure that is actually enforced. A burn's
solved cost moves continuously as the target advances along its orbit and the
fleet advances along its own state, so a zero-allowance cap would reject
ordinary commits; the allowance exists to distinguish that ordinary drift from
a cost the player never agreed to.

IF the commit is rejected for exceeding its cap, THEN the system SHALL request
a fresh preview and present the new figures for re-confirmation without
committing — the same refresh-in-flow shape `docked-fleet-actions`'s *Sell
Commit* uses for a price-changed rejection — and SHALL NOT retry the commit
automatically at the higher cost.

#### Scenario: A commit with a current preview carries a cap
- **GIVEN** a successful, current preview is shown for the selection
- **WHEN** the burn is committed
- **THEN** the request carries a `maxFuelTons` derived from that preview's
  fuel cost by the named allowance factor

#### Scenario: The ceiling the player agrees to is the one displayed
- **WHEN** a preview's figures are shown for an uncommitted selection
- **THEN** the fuel ceiling that would be sent as `maxFuelTons` is displayed
  alongside the previewed point cost

#### Scenario: A cap rejection re-quotes in flow instead of failing the interaction
- **WHEN** a burn commit is rejected for exceeding its quoted cap
- **THEN** a fresh preview is requested, its new figures are presented for
  re-confirmation, and no order is committed
- **AND** the commit is not retried automatically at the higher cost

### Requirement: Burn Commit Reports Its Outcome
The system SHALL report the outcome of every burn commit: on success, success
feedback naming that the order was accepted and carrying its served arrival
time; on failure, an error whose copy is mapped from the server's
distinguishable rejection reason (`docked-fleet-actions`'s *Rejection Reasons
Map to Player-Facing Copy, Not Raw Server Text*), never the raw reason string,
leaving the fleet's state and the current selection unchanged. A commit SHALL
NOT be silent in either direction: the adjacent *Jump Commit* already reports
both, and a burn is the more consequential of the two.

#### Scenario: A successful burn commit reports success
- **WHEN** a burn order commits successfully
- **THEN** success feedback is shown carrying the order's served arrival time

#### Scenario: A failed burn commit reports the mapped reason
- **WHEN** a burn order commit fails with a distinguishable server reason
  (for example: insufficient fuel, a target inside the star's clearance, a
  fleet in lane transit)
- **THEN** an error is shown carrying that reason's mapped, player-facing
  copy, never the raw reason string
- **AND** the fleet's state and the current selection are unchanged

#### Scenario: A burn commit failure with no distinguishable reason still reports safely
- **WHEN** a burn order commit fails with a response carrying no mapped
  rejection reason (for example a bodyless `5xx`)
- **THEN** a generic, non-technical error is shown and the fleet's state and
  selection are unchanged

### Requirement: Burn and Jump Commit Controls Guard Against Double-Submit
The burn command control and the jump command control SHALL each be disabled
from the moment of commit until that request settles or fails, so a
double-click or repeated-Enter cannot submit two orders. The guard SHALL take
effect synchronously, within the same invocation that submits the request,
and SHALL NOT depend on a pending-state flip that only reaches the control's
`disabled` attribute on a later render — two activations a tick apart both
reach the handler before any re-render, so a render-dependent guard does not
exist at the moment it is needed.

A duplicate burn is not merely wasteful: the movement channel is single-slot,
so the second commit cancels the first and re-solves from a fleet state that
has already changed, charging fuel twice for one intended order.

#### Scenario: A double-click yields exactly one burn order
- **WHEN** the burn command control is double-clicked in rapid succession
- **THEN** exactly one burn order request is submitted

#### Scenario: Two activations in one tick submit one burn order
- **GIVEN** the burn command control is rendered enabled and committable
- **WHEN** two activations reach the burn handler within the same tick, with
  no render cycle and no awaited step between them
- **THEN** exactly one burn order request leaves the client
- **AND** the guard holds even though the control's `disabled` attribute has
  not yet been updated by a render

#### Scenario: A double-click yields exactly one jump order
- **WHEN** the jump command control is double-clicked in rapid succession
- **THEN** exactly one jump order request is submitted

#### Scenario: The guard releases when the request settles or fails
- **WHEN** a burn or jump commit settles or fails and the player then
  initiates a new command
- **THEN** the guard has been released and the new attempt submits normally

### Requirement: A Commit's Actual Result Is Never Silently Swapped for the Previewed One
WHEN a burn order commits and its response's actual solved arrival time or
delta-v cost differs from the figures the last-shown preview displayed for
that same target, the system SHALL surface the actual figures alongside the
committed order's own success feedback, rather than leaving the stale
previewed figures on screen with no acknowledgment of the difference. This is
the display half of the quote lock; the reject half is the `maxFuelTons` cap
of *A Burn Commit Is Quote-Locked to the Preview the Player Agreed To*. Both
are kept: the cap bounds what the player can be charged, and this rule makes
the difference within that bound visible rather than silent.

#### Scenario: A commit matching the preview shows no drift notice
- **WHEN** a burn commits with an actual arrival time and delta-v cost
  matching the last-shown preview
- **THEN** the success feedback is shown with no separate drift notice

#### Scenario: A commit differing from the preview surfaces both figures
- **WHEN** a burn commits with an actual arrival time or delta-v cost
  differing from the last-shown preview
- **THEN** the success feedback is shown, and the actual figures are
  additionally surfaced alongside the previewed ones

#### Scenario: An uncapped commit still surfaces its actual figures
- **WHEN** a burn commits with no `maxFuelTons` cap, because no current
  preview existed
- **THEN** the response's actual arrival time and delta-v cost are surfaced
  with the success feedback

### Requirement: Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly
The system SHALL, when a body, a lane-gate body, or a point in space is the
current selection, allow the burn command to be invoked and submit an order
naming that target — through the exact same command path in every case,
with no lane-gate-specific or point-specific branch and no distinct refusal
copy for either (gates are bodies, and a point in space is a legal target —
`docs/plans/continous_space/decisions.md`: "you dock at bodies, mine at
bodies, stations and gates ARE bodies" / "Objects may still sit in
vacuum"). This requirement is satisfied by unifying the three selection
kinds into one command path, not by adding a working case alongside an
unremoved kind-specific one. Unifying the selection kinds SHALL NOT change
what a selected lane-gate body presents: the view SHALL continue to
describe a selected gate's destination system and its dock-then-jump
instruction, and its drawn mark SHALL continue to show the selected state.

#### Scenario: Commanding a burn toward a selected lane-gate body submits an order
- **GIVEN** a lane-gate body is the current selection
- **WHEN** the burn command is invoked
- **THEN** a burn order is submitted naming the `id` the interior read
  served for that gate body — the same id that fleet's `attachedTo` reports
  once it arrives (`system-interior`'s *Lane-Gate Bodies Carry Their Body
  Id*) — read from the response, never reconstructed on the client from a
  destination system id and a naming convention, exactly as for a selected
  planet or belt

#### Scenario: Commanding a burn toward a selected point in space submits an order
- **GIVEN** a point in empty space is the current selection
- **WHEN** the burn command is invoked
- **THEN** a burn order is submitted naming that point, exactly as for a
  selected body

#### Scenario: Attachment from a gate-targeted burn makes the jump command available
- **GIVEN** a fleet burns toward a selected lane-gate body and arrives
  attached to it
- **WHEN** that fleet's roster row is shown
- **THEN** the jump command becomes available for that fleet
  (*Jump Commit*)

#### Scenario: No lane-gate-specific or point-specific refusal copy exists
- **WHEN** the burn command is invoked with a lane-gate body or a point
  selected
- **THEN** no refusal message is shown and an order is submitted — the
  "select a target first" refusal is reachable only from an empty selection

#### Scenario: A selected gate still shows its facts and its selected mark
- **WHEN** a lane-gate body is the current selection
- **THEN** the view describes that gate, naming its destination system, and
  the gate's drawn mark shows the selected state

#### Scenario: No kind-specific selection branch survives the unification
- **WHEN** the view's selection model and its burn-command path are
  inspected
- **THEN** no lane-gate-specific or point-specific selection kind and no
  kind-aware command branch exists — a selected gate or point reaches the
  order mutation through the identical code path a selected planet does — a
  kind-aware lookup used only to present a selected gate's destination
  system and its drawn mark is not such a branch, since this same
  requirement mandates that presentation

### Requirement: Jump Commit
The system SHALL, when the jump command is invoked for a fleet attached to
a lane-gate body, submit a jump order for that fleet naming that gate's
lane id, resolved from the acting fleet's **own read** (`fleet-movement`'s
*Fleet Read Serves the Attached Gate's Lane Id*) and from no other source —
never from the interior read's gate list, never from `GET /v1/galaxy`'s
`links[]`, and never filtered by or derived from the corporation's
charted-lane set. The fleet's own read carries the id for a fleet attached
to a gate in any system and survives a failed interior read, so one source
serves every case; a second source would reintroduce the class of defect in
which the id is present on the surface the player is not looking at. The server's distinguishable
jump-rejection reasons include, at minimum: not attached to the named gate;
already in lane transit; lane not incident to the fleet's current system;
and the destination's lane horizon could not be materialized (retryable). A
jump against a fleet the requester's corporation does not own is
deliberately NOT among them: it is a bare `404` indistinguishable from a
nonexistent fleet (`fleet-movement`'s *Fleet Command Endpoints Are
Restricted to the Owning Corporation*), and therefore falls to the generic
fallback copy rather than to a mapped reason. On success it SHALL show a
success toast, and on failure an error toast whose copy is mapped from the
server's distinguishable rejection reason (`docked-fleet-actions`'s
*Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text*), never
the raw reason string, leaving the fleet's row unchanged. The command SHALL
NOT be a no-op or a refusal for any gate a fleet's own read reports it
attached to.

#### Scenario: Invoking jump submits the attached gate's lane
- **GIVEN** a fleet whose own read carries `laneId` for its attached
  lane-gate body
- **WHEN** the jump command is invoked on that fleet's row
- **THEN** a jump order is submitted for that fleet naming that `laneId`

#### Scenario: Jump still commits when the interior read has failed
- **GIVEN** an own fleet attached to a lane-gate body in the open system and
  a failed interior read
- **WHEN** the jump command is invoked on that fleet's row
- **THEN** a jump order is submitted naming the `laneId` the fleet's own read
  carries, with no dependency on the interior read

#### Scenario: A gate whose lane the corporation has not charted still commits
- **GIVEN** a corporation with no charted lanes and a fleet attached to a
  lane-gate body
- **WHEN** the jump command is invoked on that fleet's row
- **THEN** the jump order is submitted, not refused client-side

#### Scenario: A fleet attached to a gate in another system still commits
- **GIVEN** this system's space view is open and an own fleet is attached
  to a lane-gate body in a different system
- **WHEN** the jump command is invoked on that fleet's roster row
- **THEN** a jump order is submitted naming that fleet's own gate's lane
  id — never this system's like-named gate, and never a client-side refusal

#### Scenario: A failed jump commit toasts the reason
- **WHEN** the jump command fails (for example: not attached, already in
  lane transit)
- **THEN** an error toast surfaces mapped, player-facing copy for the
  server's rejection reason and the fleet's row is unchanged

#### Scenario: A jump against a fleet the requester does not own toasts generically
- **WHEN** the jump command is invoked against a fleet the requester's
  corporation does not own
- **THEN** the generic fallback toast is shown, with no copy that would
  distinguish the fleet from one that does not exist

#### Scenario: A destination-not-ready rejection toasts as retryable, not generically
- **WHEN** the jump command fails with the server's
  destination-lane-horizon-could-not-be-materialized reason
- **THEN** the error toast surfaces that reason's own mapped copy, telling
  the player the jump can be retried — not the generic fallback used for a
  response carrying no distinguishable reason

#### Scenario: A failure with no distinguishable reason still toasts safely
- **WHEN** the jump command fails with a response carrying no mapped
  rejection reason (for example a **bodyless** `5xx`)
- **THEN** a generic, non-technical error toast is shown and the fleet's
  row is unchanged

### Requirement: Departure Hand-Off to the Galaxy View
The system SHALL, when the **acting** fleet — the one the roster has selected
as this view's commanding fleet — transits its departure gate and leaves this
system with no position in it, navigate away from this view to the galaxy
view, so the player follows the fleet they were commanding onto the lane crawl
it now belongs to.

The hand-off SHALL be scoped to the acting fleet alone. A non-acting own
fleet's departure, observed on this view, SHALL NOT navigate: a player
commanding one fleet here while another crosses a lane on its own schedule
would otherwise be yanked off the screen mid-input, losing an in-progress
selection, a typed tonnage, or an uncommitted burn, for an event they did not
initiate. The hand-off SHALL also NOT fire merely because a fleet was already
in transit when this view was opened; only a departure actually watched on
this view, by the acting fleet, triggers it.

#### Scenario: Watching the acting fleet depart navigates to the galaxy view
- **WHEN** the acting fleet's departure-gate jump completes while this view is
  open and being watched
- **THEN** the view navigates to the galaxy route

#### Scenario: A non-acting fleet's departure does not navigate
- **GIVEN** the player is commanding fleet A on this view
- **WHEN** own fleet B, which is not the acting fleet, completes a
  departure-gate jump out of this system
- **THEN** no automatic navigation occurs, and the current selection and any
  typed input are preserved

#### Scenario: Opening the view with an already-departed fleet does not navigate
- **WHEN** this view is opened for a system where an own fleet is already
  mid-lane-transit (departed before this view was opened)
- **THEN** no automatic navigation occurs

### Requirement: Fleet Roster Cross-Navigation
The system SHALL, via the shared fleet roster panel, make selecting a row
for a fleet in this system set it as the acting fleet and select it;
selecting a row for a fleet in a different system navigate to that
system's space-view route; and selecting a row for a fleet with no current
position in any system (out on a lane) navigate to the galaxy view.

This view SHALL mount that roster with its command surface withheld, so a
roster row here renders selection and status only and every fleet verb is
offered by exactly one control on this screen — the burn and jump commands
on this capability's command panel and the cut-drive, stop, and
mine-cancel commands on the `docked-fleet-actions` panel
(`fleet-roster`'s *The Roster Row Is the Fleet Command Surface Where the
Mounting View Provides None, Jump Gated by Attachment Alone*).

#### Scenario: Selecting a fleet in another system navigates there
- **WHEN** a roster row for an own fleet located in a different system is
  selected
- **THEN** the view navigates to that system's space-view route

#### Scenario: Selecting a fleet with no position navigates to the galaxy
- **WHEN** a roster row for an own fleet currently out on a lane (no
  position in any system) is selected
- **THEN** the view navigates to the galaxy route

#### Scenario: The roster on this view renders no fleet commands
- **WHEN** the space view is open with an own fleet in any kinematic state
  and any attachment
- **THEN** that fleet's roster row offers no burn, cut-drive, stop, jump, or
  mine-cancel control, and each of those verbs the fleet's state makes valid
  resolves to exactly one control on this screen

### Requirement: Realtime Refetch Rules While the Space View Is Open
The system SHALL keep the open space view's interior and own-fleets reads
current via: (1) a self-scheduled refetch shortly after the acting fleet's
running mine action's ETA, when one exists; (2) a self-scheduled refetch
shortly after any own fleet's running burn or jump's arrival time, when one
exists, so attachment, park state, and jump eligibility land without user
action; (3) a live subscription to the system's event channel that
refetches on a completion event and again on reconnect after a drop; and
SHALL otherwise poll both reads at a constant baseline interval. Rendering
an own fleet's live position between refetches (*Own-Fleet Position, Burn
Curve, and Arrival Ghost Render Continuously*) requires no additional
network request — the self-scheduled and baseline refetches exist to land
state transitions (attachment, cargo, fuel, jump eligibility), never to
drive frame-to-frame animation.

#### Scenario: A running mine self-schedules a refetch at its ETA
- **WHEN** the acting fleet has a running mine with a known ETA
- **THEN** a refetch is scheduled to fire shortly after that ETA, so the
  resolved cargo and freed movement channel land without user action

#### Scenario: A running burn or jump self-schedules a refetch at its arrival
- **WHEN** an own fleet has a running burn or jump with a known arrival
  time
- **THEN** a refetch is scheduled to fire shortly after that time, so the
  resolved attachment, park mode, or destination system lands without user
  action

#### Scenario: A missed event on reconnect triggers a resync
- **WHEN** the system channel's live connection drops and later reconnects
- **THEN** a refetch fires on reconnect to resync any missed completions

#### Scenario: The poll runs at a constant interval with nothing pending
- **WHEN** the space view is open with no running mine, burn, or jump
  pending
- **THEN** the periodic poll continues at its constant baseline interval

#### Scenario: Animation between refetches needs no extra request
- **WHEN** an own fleet's rendered position advances between two scheduled
  refetches
- **THEN** no additional network request is made to produce that motion

### Requirement: Renderer Unavailability Is an Explicit State
IF a rendering context for the space view cannot be created, THEN the
system SHALL show an explicit unsupported state in place of the view's
canvas region, naming the failure as a browser- or graphics-hardware-
capability problem — never raw diagnostic text, a stack trace, or a GPU
vendor/model string — rather than an empty stage or an uncaught error, and
SHALL offer a retry affordance that attempts to re-establish the context.

The fleet roster and the `docked-fleet-actions` panel SHALL remain mounted
and usable while the unsupported state is shown: a verb anchored to the
acting fleet's own state — its attachment, its park mode, its running
action, or its running burn — rather than to a space-view selection SHALL
remain invokable through the fleet panel without requiring a selection on
this view. As of this change that set is: mine, sell, refuel,
station-keeping hold, station-keeping release, cancelling a running mine,
**cut drive**, **stop in place**, and jump. Cut drive and stop are named
explicitly because they are the two verbs a player needs *most* when the
canvas is gone: a player whose graphics context drops mid-burn must still be
able to end that burn, and neither verb takes a target — cut drive takes
none at all, and stop parks at the fleet's own current position. Omitting
them would leave a burning fleet uncommandable for the duration of a
hardware fault. Jump likewise takes no canvas target: its lane comes from
the fleet's own attachment (*Jump Commit*). A control in the surrounding panels whose only effect is on the
unavailable canvas SHALL be disabled or hidden while the unsupported or
interrupted state is shown, rather than presented as operable. This view's
selection prompt SHALL NOT instruct the player to select a body, gate, or
point while no canvas exists to select one on — a statement about **burn
target selection** only, not about departure: jump stays invokable in this
state, as the paragraph above and *Jump Commit* both require.

An error thrown while constructing, listening to, or retrying this view's
rendering context SHALL be contained to the view's canvas region: caught by
a boundary scoped to that region when the error is thrown during render or
commit, and by a local handler when the error is thrown inside a context-
loss/restore listener or an animation-frame callback (neither is reachable
by a React error boundary at any placement) — leaving the fleet roster, the
`docked-fleet-actions` panel, and the system space view container mounted
and usable.

The unsupported and interrupted states SHALL take precedence over this
view's data-loading and first-frame-pending states: once a rendering
context cannot be created, a loading placeholder SHALL NOT continue to be
shown in the view's canvas region. This state is triggered by a client
rendering-capability failure, never by a failure of the interior or
own-fleets data reads.

#### Scenario: Context creation failure shows a named unsupported state
- **WHEN** a rendering context for the space view cannot be created
- **THEN** the view's canvas region shows an explicit unsupported state
  naming WebGL or GPU unavailability as the cause
- **AND** no uncaught error is thrown

#### Scenario: Surrounding panels remain usable
- **WHEN** the view's canvas region shows the unsupported or interrupted
  state
- **THEN** the fleet roster and the `docked-fleet-actions` panel remain
  mounted and interactive
- **AND** every verb anchored to the acting fleet's own state rather than to
  a space-view selection remains invokable through the fleet panel without
  requiring a selection: mine, sell, refuel, station-keeping hold,
  station-keeping release, cancelling a running mine, cut drive, stop in
  place, and jump

#### Scenario: A burn can be ended while the canvas is unavailable
- **GIVEN** the acting fleet has a running burn
- **WHEN** the view's canvas region shows the unsupported or interrupted
  state
- **THEN** the cut-drive and stop-in-place commands remain invokable through
  the fleet panel, and invoking either commits against the acting fleet

#### Scenario: A canvas-only control is disabled while the canvas is unavailable
- **WHEN** the view's canvas region shows the unsupported or interrupted
  state
- **THEN** a control whose only effect is on the canvas is disabled or
  hidden, not presented as operable

#### Scenario: Burn target selection is unreachable without the canvas
- **WHEN** the view's canvas region shows the unsupported or interrupted
  state AND no target is already selected
- **THEN** this view's selection prompt SHALL NOT instruct the player to
  select a body, gate, or point
- **AND** this view indicates that choosing a burn target requires the
  canvas to be available
- **AND** jump remains invokable, since its lane comes from the acting
  fleet's own attachment rather than from a canvas selection
  (*Jump Commit*)

#### Scenario: The unsupported state is independent of the interior data read
- **WHEN** the system interior and own-fleets reads succeed but the
  rendering context cannot be created
- **THEN** the view's canvas region shows the unsupported state, not the
  interior-read error state

#### Scenario: A failed interior read takes precedence over the unsupported state
- **WHEN** the interior read fails and the rendering context also cannot be
  created
- **THEN** the canvas region shows the interior-read error state with its
  underlying message and its retry affordance
- **AND** no unsupported state is shown
- **AND** the fleet roster and the `docked-fleet-actions` panel remain
  mounted and usable

#### Scenario: A failed own-fleets read does not suppress the unsupported state
- **WHEN** the own-fleets read fails and the rendering context also cannot
  be created
- **THEN** the canvas region shows the unsupported state and the fleet panel
  region shows its own retriable error, each in its own region

#### Scenario: The system space view container remains present
- **WHEN** the unsupported state is shown
- **THEN** the system space view container is still rendered, with the
  unsupported state occupying only the canvas region within it

#### Scenario: The unsupported state offers a retry affordance
- **WHEN** the view's canvas region shows the unsupported state
- **THEN** a retry affordance is offered
- **AND** invoking it attempts to create a new rendering context
- **AND** a successful attempt resumes rendering the live space view
- **AND** a failed attempt keeps the unsupported state, retriable again

#### Scenario: The displayed cause is a user-actionable category, not raw diagnostic text
- **WHEN** the unsupported or interrupted state names the cause to the
  player
- **THEN** the text identifies the failure as a browser or graphics-hardware
  capability problem
- **AND** it does not display raw exception text, stack traces, or GPU
  vendor/model strings

#### Scenario: An unexpected rendering error is contained to the canvas region
- **WHEN** an error is thrown while constructing, listening to, or retrying
  this view's rendering context — including an error not otherwise named by
  this requirement
- **THEN** the error is contained to the view's canvas region — caught by
  the region's error boundary when it is thrown during render or commit,
  and by a local handler when it is thrown inside a context-loss/restore
  listener or an animation-frame callback
- **AND** the fleet roster, the `docked-fleet-actions` panel, and the
  system space view container remain mounted and usable

### Requirement: Lost Rendering Context Recovers Without Navigation
WHEN this view's rendering context is lost at runtime, the system SHALL
show an interrupted state in the view's canvas region without an uncaught
error; WHEN the lost context is restored, the system SHALL resume
rendering the live space view — reflecting current world time and
body/fleet/contact state, never a stale pre-loss frame — without a page
navigation; and IF the context is not restored, the interrupted state
SHALL persist and SHALL offer a retry affordance that attempts to
re-establish the rendering context. Restore failure means an error thrown
while re-establishing rendering after `webglcontextrestored` fires; a
context that simply never restores is not itself a recordable failure
event. Retrying SHALL release the prior attempt's renderer resources and
event listeners before creating a new context, and SHALL hold no more than
one live rendering context for the view's canvas at any time. Once
invoked, the retry affordance SHALL be disabled and show an in-progress
indication until the attempt resolves; any invocation while disabled SHALL
start no further attempt. A second context loss arriving while the
interrupted state is already shown SHALL leave the view in the interrupted
state without duplicating listener registration or starting a second
in-flight creation attempt. A space-view selection, or an in-progress
input value in the `docked-fleet-actions` panel, active at the moment of
context loss SHALL remain shown throughout the interrupted state and SHALL
still be active once the view resumes. Each context-creation failure,
context loss, and restore failure SHALL be recorded distinguishably by
cause: a diagnostic entry emitted to the client error log naming which of
the three occurred and, when available, the browser-reported diagnostic
message.

#### Scenario: Context loss shows an interrupted state without an uncaught error
- **WHEN** this view's rendering context is lost at runtime
- **THEN** the view's canvas region shows an interrupted state
- **AND** no uncaught error is thrown

#### Scenario: A restored context resumes without navigation
- **WHEN** a lost rendering context is restored
- **THEN** the view resumes rendering the live space view
- **AND** no page navigation occurs

#### Scenario: A restored context's first frame reflects live state, not a stale one
- **WHEN** a lost rendering context is restored
- **THEN** the view's redraw is invoked with the post-restore world time and
  the latest interior/own-fleets read
- **AND** no pre-loss image is retained

#### Scenario: A context that never restores keeps the interrupted state with a retry affordance
- **WHEN** a rendering context is lost and is not restored
- **THEN** the interrupted state persists
- **AND** a retry affordance is offered

#### Scenario: Invoking the retry affordance attempts to re-establish the context
- **WHEN** the retry affordance is invoked while the interrupted state is
  shown
- **THEN** the system attempts to create a new rendering context for the
  view

#### Scenario: Retrying releases the prior attempt's resources first
- **WHEN** the retry affordance is invoked
- **THEN** any renderer resources and event listeners from the previous
  failed or lost context are released before a new context is created
- **AND** no more than one live rendering context is held for the view's
  canvas at any time

#### Scenario: A successful retry resumes the live space view
- **WHEN** the retry affordance is invoked
- **AND** the resulting context creation succeeds
- **THEN** the view resumes rendering the live space view
- **AND** no page navigation occurs

#### Scenario: A retry that fails again keeps the interrupted state retriable
- **WHEN** the retry affordance is invoked
- **AND** the resulting context creation fails
- **THEN** the interrupted state persists
- **AND** the retry affordance remains available for another attempt

#### Scenario: The retry affordance prevents duplicate concurrent attempts
- **WHEN** the retry affordance is invoked
- **THEN** it is disabled and shows an in-progress indication until the
  attempt resolves
- **AND** any invocation while disabled starts no further attempt

#### Scenario: A second context loss while already interrupted is a no-op state change
- **WHEN** this view's rendering context is lost again while the
  interrupted state is already shown
- **THEN** the view remains in the interrupted state
- **AND** no duplicate listener registration or in-flight context-creation
  attempt is started

#### Scenario: In-flight selection and typed input survive a context loss
- **WHEN** this view's rendering context is lost at runtime while a
  selection is active or an input value has been typed in the
  `docked-fleet-actions` panel
- **THEN** the selection and the typed value remain shown once the
  interrupted state is displayed
- **AND** a subsequent restore resumes the view with that same selection
  still active

#### Scenario: Renderer failures are recorded distinguishably by cause
- **WHEN** a rendering context fails to be created, is lost, or fails to
  restore
- **THEN** a diagnostic entry is emitted to the client error log naming
  which of the three occurred and, when available, the browser-reported
  diagnostic message (e.g. `webglcontextcreationerror`'s `statusMessage`)
- **AND** the recording does not itself throw or block the unsupported/
  interrupted state from rendering

### Requirement: Renderer Unavailability States Are Accessible
WHEN this view's canvas region shows the unsupported or interrupted state,
the system SHALL convey the change to assistive technology through a live
region naming the state and its cause, SHALL make any retry affordance
reachable via Tab and activatable via Enter or Space, and SHALL move focus
to the retry affordance (or, when none is shown, to the state's explanatory
text) if focus was within the canvas region at the moment the state
appeared. That focus-preservation clause applies only while the canvas
region contains a focusable element to lose focus from at the moment of
transition.

#### Scenario: The state change is announced to assistive technology
- **WHEN** this view's canvas region transitions into the unsupported or
  interrupted state
- **THEN** a live region conveys the state change and its named cause
  without requiring the player to navigate to it

#### Scenario: The retry affordance is keyboard-operable
- **WHEN** the interrupted or unsupported state offers a retry affordance
- **THEN** a keyboard-only player can reach it via Tab
- **AND** activate it via Enter or Space

#### Scenario: Focus does not get lost when the canvas region changes under the player
- **GIVEN** this view's canvas region contains a focusable element at the
  moment the unsupported or interrupted state replaces it
- **WHEN** focus is within that element
- **THEN** focus moves to the retry affordance, or to the state's
  explanatory text if no retry affordance is shown
- **AND** focus is never silently dropped to the document body

### Requirement: Body, Lane-Gate, and Point Selection Is Keyboard-Operable
The system SHALL make every body and lane-gate hit target reachable via
keyboard, in a consistent tab order — bodies first, then lane gates, each
group in stable id order; activating a focused hit target with Enter or
Space SHALL select it identically to a pointer click; the currently
focused hit target SHALL be distinguishable from unfocused ones by a
visible focus indicator; and a hit target that currently holds keyboard
focus SHALL retain that focus as the view's per-frame world-time update
re-renders — the animation loop SHALL NOT itself unfocus the element the
player is on.

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

### Requirement: Space View Respects Reduced-Motion Preference
WHILE the user's system indicates a reduced-motion preference, the system
SHALL hold the starfield, nebula, film-grain, body-surface, and
fleet-plume animation static (their time input frozen), while body,
fleet, and contact positions continue to advance with world time, and
selection state continues to render accurately.

#### Scenario: Reduced motion freezes decorative animation while positions keep advancing
- **WHEN** the user's system has a reduced-motion preference set and the
  view renders across several frames
- **THEN** the starfield, nebula, film-grain, body-surface, and
  fleet-plume animation hold static (their time input frozen)
- **AND** body, fleet, and contact positions continue to advance with world
  time

### Requirement: Space View Camera Orbit, Pan, and Zoom
The space view's *default framing* — the framing this capability resets
and recenters to — is a configured framing centred on the system's star,
presented on first render before any camera input. The default distance,
the zoom range, and the pan bound SHALL each be expressed as a multiple of
the interior read's served continuous `extent` (`system-interior`'s
*Interior Read Serves Continuous Bodies*), never as an absolute scene
constant and never derived from any lattice-derived wire field, so one set
of multipliers frames a compact system and a sprawling one alike. The
multipliers themselves, and the default viewing angle, are configured values
chosen by playtesting against a real system's scale, not fixed by this
requirement; what this requirement fixes is that they are single configured
values, that they scale off the served `extent`, that they are applied
before any camera input, and that reset and recenter both return to them. The system SHALL let the player orbit the camera around its current
pan target via a primary-button pointer drag (changing viewing angle
without translating the target), pan the camera's target via a
secondary-button pointer drag, and zoom via a wheel gesture — dollying the
camera toward or away from its current pan target along the view
direction, so that target's on-screen position is unchanged by the zoom —
all clamped to the configured zoom range and to a pan bound that confines
the camera's pan target to a configured multiple of the served `extent`
around the system's star, so the view's centre is always over the system
rather than the system being pushed entirely off screen. For the purposes of *Space View Picking Resolves to the Body,
Lane Gate, or Point Under the Pointer*, a pointer sequence whose movement
between press and release stays under **8 CSS pixels** SHALL resolve as a
click and SHALL NOT be treated as an orbit or pan; a pointer sequence whose
movement meets or exceeds that threshold SHALL resolve as a camera gesture
and SHALL NOT change the selection. A pointer drag that begins over a
body, lane-gate, or contact mark and meets or exceeds that threshold SHALL
move the camera exactly as a drag beginning over empty space would, and a
wheel gesture used with the pointer over such a mark SHALL zoom the camera
exactly as it would over empty space — a gesture is never dead-zoned
merely because it begins over a mark. Activating an on-screen camera
control (the recenter control, or a keyboard-operable orbit/pan/zoom
affordance) by pointer or keyboard SHALL NOT itself be treated as a
space-view click for selection purposes, regardless of any mark drawn
beneath it. The camera's orbit, pan, and zoom state SHALL persist unchanged
across a selection change and across a realtime data refetch, and SHALL
reset to the space view's default framing immediately, with no animated or
eased transition, when the route's `systemId` changes. Regardless of the
camera's current framing, hit targets for bodies, lane gates, and contacts
SHALL remain positioned at the marks actually drawn, and a click that
resolves against the pick plane but lies over no such mark SHALL resolve to
that point.

#### Scenario: Primary-button drag orbits the camera
- **WHEN** a primary-button pointer drag crosses the movement threshold
  over the space view
- **THEN** the camera's viewing angle changes to follow the drag, without
  translating its pan target

#### Scenario: Secondary-button drag pans the camera's target
- **WHEN** a secondary-button pointer drag crosses the movement threshold
  over the space view
- **THEN** the camera's pan target translates to follow the drag

#### Scenario: Wheel gesture zooms the camera
- **WHEN** a wheel gesture is used over the space view
- **THEN** the camera dollies toward or away from its current pan target in
  the scrolled direction

#### Scenario: Zooming keeps the current pan target fixed on screen
- **WHEN** a wheel-zoom gesture changes the camera's distance from its pan
  target
- **THEN** that pan target's on-screen position is unchanged by the zoom

#### Scenario: Zoom clamps at the configured bounds
- **WHEN** a wheel gesture continues zooming past the configured minimum
  or maximum
- **THEN** the effective zoom stops at that bound and does not move further

#### Scenario: Pan clamps at the configured bound
- **WHEN** the camera's pan target is driven repeatedly in one direction,
  by secondary-button drag or by keyboard pan, past the configured bound
- **THEN** panning stops with the pan target confined to the configured
  multiple of the served `extent` around the star, so the view's centre
  remains over the system rather than the system being pushed entirely off
  screen

#### Scenario: The framing scales with the system's served extent
- **WHEN** the view opens for a system whose served `extent` differs from
  another system's
- **THEN** the default camera distance, the zoom clamps, and the pan bound
  are each that system's own `extent` times the same configured multiplier
  — no absolute scene constant and no lattice-derived field takes part

#### Scenario: A sub-threshold pointer press-release still resolves as a click
- **WHEN** a pointer press-release over a mark moves less than 8 CSS
  pixels between press and release
- **THEN** that mark's entity becomes the selection
- **AND** a pointer press-release over the same mark that moves 8 or more
  CSS pixels resolves as a camera gesture and does not change the selection

#### Scenario: A gesture that begins over a mark still moves the camera
- **WHEN** a pointer drag begins over a body, lane-gate, or contact mark
  and meets or exceeds the movement threshold, or a wheel gesture is used
  with the pointer over such a mark
- **THEN** the camera moves exactly as it would over empty space, and the
  selection is unchanged

#### Scenario: Activating a camera control does not change the selection
- **WHEN** a camera control (recenter, or a keyboard-operable orbit/pan/
  zoom affordance) is activated by pointer or keyboard while an entity is
  selected
- **THEN** the selection is unchanged and no mark under the control becomes
  selected

#### Scenario: Camera state survives a selection change and a realtime refetch
- **WHEN** the camera has been moved and a different entity is then
  selected, or a realtime refetch lands updated data
- **THEN** the camera's framing remains unchanged

#### Scenario: Camera resets when the system changes
- **WHEN** the player navigates from one system's space view to a
  different system's space view
- **THEN** the camera returns to that view's default framing immediately,
  with no animated or eased transition

#### Scenario: Picking survives camera movement
- **WHEN** the camera has been moved away from its default framing and a
  mark is then clicked at its currently drawn position
- **THEN** that mark's entity becomes the selection

#### Scenario: A point-in-space click resolves correctly after camera movement
- **WHEN** the camera has been moved away from its default framing and a
  point that resolves against the pick plane, over no mark, is clicked
- **THEN** that point becomes the selection

### Requirement: Space View Camera Touch Pinch-Zoom
The system SHALL let the player zoom the space view's camera with a
two-finger pinch gesture on a touch-capable device, clamped to the same
configured zoom range as wheel zoom. A pinch gesture SHALL keep the camera's
current pan target fixed at the same screen position, identically to wheel
zoom, rather than anchoring on the pinch midpoint. A single-finger touch drag SHALL
orbit the camera, using the same behavior as a primary-button pointer
drag. A single-finger touch that begins and ends staying under the same
**8 CSS pixel** movement threshold defined in *Space View Camera Orbit,
Pan, and Zoom* SHALL be treated as a tap, resolving to a selection
identically to a pointer click, rather than a camera gesture; a
single-finger touch that meets or exceeds that threshold SHALL resolve as
an orbit gesture — the touch-gesture suppression this requirement needs to
keep native pinch from competing with the view SHALL NOT itself prevent a
tap within that threshold from producing a selection.

#### Scenario: Pinching outward zooms in and inward zooms out
- **WHEN** a two-finger pinch-outward or pinch-inward gesture is performed
  on the space view
- **THEN** the camera dollies toward (outward) or away from (inward) its
  pan target accordingly

#### Scenario: Pinch zoom keeps the centred point fixed on screen
- **WHEN** a two-finger pinch gesture changes the camera's distance from
  its pan target
- **THEN** that pan target's on-screen position is unchanged by the zoom,
  rather than the view re-centring on the pinch midpoint

#### Scenario: Pinch zoom respects the same clamp as wheel zoom
- **WHEN** a pinch gesture continues zooming past the configured minimum or
  maximum
- **THEN** the effective zoom stops at that bound, the same as it would for
  a wheel gesture

#### Scenario: A single-finger touch drag orbits instead of zooming
- **WHEN** a single-finger touch drag is performed across the space view
- **THEN** the camera orbits, following the same behavior as a
  primary-button pointer drag

#### Scenario: A stationary single-finger touch selects rather than orbits
- **WHEN** a single-finger touch begins and ends staying under the 8 CSS
  pixel threshold (a tap, not a drag)
- **THEN** the touch is treated as a selection input, resolving to the
  entity under it the same as a pointer click, and the camera does not move

#### Scenario: A single-finger touch that moves past the tap threshold orbits
- **WHEN** a single-finger touch moves 8 or more CSS pixels between
  touchstart and touchend
- **THEN** the camera orbits by the moved distance and no selection change
  occurs on release

#### Scenario: Movement exactly at the tap threshold resolves as an orbit
- **WHEN** a single-finger touch moves exactly 8 CSS pixels between
  touchstart and touchend
- **THEN** the touch resolves as an orbit gesture, not a selection — the
  threshold is inclusive on the gesture side, matching the pointer twin's
  "8 or more CSS pixels"
- **AND** a touch moving 9 CSS pixels also resolves as an orbit gesture

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

### Requirement: Space View Camera Manual Recenter
The system SHALL offer a control, reachable via the space view's normal
tab order, that resets the camera to the view's default framing on
demand, immediately and with no animated or eased transition; invoking it
SHALL leave the current selection unchanged.

#### Scenario: Recenter restores default framing on demand
- **WHEN** the camera has been moved away from its default framing and the
  recenter control is invoked
- **THEN** the camera returns to the view's default framing immediately,
  with no animated or eased transition

#### Scenario: Recenter is reachable from the keyboard
- **WHEN** a user tabs to the recenter control and activates it with
  Enter or Space
- **THEN** the camera returns to the view's default framing, identically
  to a pointer activation

#### Scenario: Recentering while already at default framing is a no-op
- **WHEN** the recenter control is invoked while the camera is already at
  the view's default framing
- **THEN** the camera remains at the default framing and the current
  selection is unchanged

### Requirement: Camera Controls Are Inert While the Space View Is Unavailable
WHILE this view's canvas region shows the unsupported or interrupted
state, the camera controls (the keyboard-operable orbit/pan/zoom
affordances and the recenter control) SHALL NOT be rendered or reachable
in the tab order, and camera gestures SHALL NOT intercept or suppress
pointer, wheel, or touch input over that region. IF keyboard focus is on a
camera control at the moment that state appears, focus SHALL move as
*Renderer Unavailability States Are Accessible* specifies.

#### Scenario: Camera controls are absent while the space view is unavailable
- **WHEN** this view's canvas region shows the unsupported or interrupted
  state
- **THEN** no camera control is present in the tab order
- **AND** a wheel gesture over that region scrolls the page normally
- **AND** if keyboard focus was on a camera control at that moment, focus
  moves per *Renderer Unavailability States Are Accessible* and is never
  silently dropped to the document body

### Requirement: Space View Picking Resolves to the Body, Lane Gate, or Point Under the Pointer
The system SHALL resolve a click on the space view to the entity drawn
under the pointer: a click within a body's or a lane gate's drawn mark
SHALL select that entity; a click that resolves against the scene's pick
plane at a point over no such mark SHALL select that point, **and that
point SHALL be visibly marked as selected in the scene**; and a click
that resolves to no point at all (misses the pick plane, or lies beyond
the maximum pick radius — itself a configured multiple of the interior
read's served continuous `extent`, never an absolute constant and never a
lattice-derived field) SHALL clear the selection. A point in vacuum,
unlike a body, has no mark of its own to highlight and no intrinsic
outline, so without an explicit marker a point selection is invisible: the
player has committed to a burn target they cannot see, and every scenario
of this capability would still pass. Hit targets
SHALL be positioned at the marks actually drawn, sized generously around
each body's drawn radius. WHEN two or more marks' hit targets contain the
clicked point, the topmost drawn mark SHALL win, using the view's
documented draw order (a moon or station above its parent planet, a body
above a belt's decorative field).

#### Scenario: Clicking a body mark selects that body
- **WHEN** the pointer clicks within a body's drawn mark
- **THEN** that body becomes the selection

#### Scenario: Clicking a lane-gate mark selects that gate
- **WHEN** the pointer clicks within a lane gate's drawn mark
- **THEN** that gate becomes the selection

#### Scenario: Clicking empty space selects the point under the pointer
- **WHEN** the pointer clicks a point that resolves against the pick
  plane and is not over a body or lane-gate mark
- **THEN** that point becomes the selection

#### Scenario: A selected point in empty space is visibly marked
- **WHEN** a point in empty space (not a body or lane-gate mark) becomes
  the selection
- **THEN** that point is visibly marked as selected in the scene, at the
  position it was picked at, rather than being held only in state with no
  rendered indication

#### Scenario: An overlapping child mark wins over its parent
- **WHEN** the pointer clicks a point where a moon's hit target and its
  parent planet's hit target overlap
- **THEN** the moon (the child, drawn on top) becomes the selection, not
  its parent

#### Scenario: A click resolving to no point clears the selection
- **WHEN** the pointer clicks a point that misses the pick plane, or lies
  beyond the maximum pick radius
- **THEN** the selection becomes empty

#### Scenario: A click beyond the pick radius still clears the selection after camera movement
- **WHEN** the camera has been orbited, panned, and/or zoomed away from its
  default framing and a point beyond the maximum pick radius is then
  clicked
- **THEN** the selection becomes empty, exactly as it would at the view's
  default framing

### Requirement: Off-Screen Bodies and Lane Gates Are Reachable by Pointer and Touch
The system SHALL offer an on-screen affordance, operable by pointer and by
touch, that selects any body or lane gate whose mark currently lies outside
the viewport and reframes the camera so that mark becomes visible. This is
not a convenience: a lane gate sits at a characteristic radius along its
bearing toward the far endpoint, so at any framing that shows the inner
system a gate is normally off-screen, and reaching one is the last step of
this change's own exit criterion. Panning blind until a mark happens to enter
the viewport is not a path a player can be expected to find.

The affordance SHALL cover only marks that are currently off-screen — a mark
inside the viewport is selected through its ordinary hit target — and its
activation SHALL produce a selection identical in kind and effect to clicking
that mark directly.

#### Scenario: An off-screen lane gate is selectable by pointer
- **GIVEN** a lane gate whose mark lies outside the current viewport
- **WHEN** its off-screen affordance is activated with a pointer
- **THEN** that gate becomes the selection and the camera reframes so its
  mark is inside the viewport

#### Scenario: An off-screen lane gate is selectable by touch
- **GIVEN** a lane gate whose mark lies outside the current viewport
- **WHEN** its off-screen affordance is tapped
- **THEN** that gate becomes the selection and the camera reframes so its
  mark is inside the viewport

#### Scenario: An off-screen body is selectable the same way
- **GIVEN** a body whose mark lies outside the current viewport
- **WHEN** its off-screen affordance is activated by pointer or touch
- **THEN** that body becomes the selection and the camera reframes so its
  mark is inside the viewport

#### Scenario: The affordance covers only off-screen marks
- **WHEN** a body or lane gate's mark is inside the current viewport
- **THEN** no off-screen affordance is offered for it, and it is selected
  through its ordinary hit target

#### Scenario: An off-screen selection is indistinguishable from a direct one
- **WHEN** a gate is selected through its off-screen affordance and, in a
  separate interaction, the same gate is selected by clicking its mark
- **THEN** the resulting selection is identical in kind and effect, and the
  burn command behaves identically for both

### Requirement: A Landed Resolution Is Announced to Assistive Technology
WHEN a refetch lands a state transition the player was waiting on — an own
fleet's burn arrival and the attachment it produced, a jump arrival, or a
mine run's completion — the system SHALL announce that transition through a
polite live region, naming what completed, so a player who cannot see the
canvas or the panel change learns that the thing they committed has resolved.
These transitions arrive without user action (*Realtime Refetch Rules While
the Space View Is Open*), so nothing else in the interaction would announce
them: a purely visual change to a canvas mark and a panel's enabled state is
invisible to assistive technology.

#### Scenario: A burn arrival and its docking are announced
- **WHEN** a refetch lands an own fleet's burn arrival that attached it to a
  body
- **THEN** a polite live-region announcement names the arrival and the body
  the fleet is now attached to

#### Scenario: A mine completion is announced
- **WHEN** a refetch lands the acting fleet's running mine as completed
- **THEN** a polite live-region announcement names the mine run as complete

#### Scenario: A jump arrival is announced
- **WHEN** a refetch lands an own fleet's jump arrival into this system
- **THEN** a polite live-region announcement names the arrival

#### Scenario: A pending resolution is not announced before it lands
- **WHEN** a running burn, jump, or mine has not yet resolved
- **THEN** no completion announcement is made for it

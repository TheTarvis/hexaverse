## MODIFIED Requirements

### Requirement: Burn Preview Reflects the Server-Solved Order, Without Committing
WHILE a body, a lane-gate body, or a point is the current selection, the
system SHALL request a preview of the order that selection would commit via
`POST /v1/fleets/:fleetId/orders/preview` (`fleet-movement`'s *Burn Order
Preview Solves Without Committing*) and render its solved curve as a distinct
preview overlay alongside the arrival time, delta-v cost, fuel cost, whether
that cost is currently affordable, and whether it would leave the fleet
stranded — all figures the server's own solve returns, never recomputed or
re-derived client-side. The arrival time, delta-v cost, and fuel cost are
each presented per `figure-formatting` (arrival as a relative duration at
the mounting view's served scale, delta-v as integer metres per second, fuel
as a tonnage); the delta-v cost and the fuel cost each carry their own raw
served value, and the arrival time carries its raw remaining span in
unscaled world-milliseconds — the span from the mounting view's projected
world time to the preview's served arrival instant, per `figure-formatting`'s
duration rule.

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
  delta-v cost, fuel cost, and affordability are rendered, the arrival time,
  delta-v cost, and fuel cost each presented per `figure-formatting`, the
  delta-v cost and fuel cost each carrying their own raw served value, and
  the arrival time carrying its raw remaining span in unscaled
  world-milliseconds

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
a cost the player never agreed to. The displayed ceiling is presented per
`figure-formatting` as a tonnage and carries its raw client-derived value —
it is computed client-side from the preview's served fuel cost and the named
allowance factor, and is never itself a value the server returns.

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
  alongside the previewed point cost, presented per `figure-formatting` as a
  tonnage and carrying its raw client-derived value

#### Scenario: A cap rejection re-quotes in flow instead of failing the interaction
- **WHEN** a burn commit is rejected for exceeding its quoted cap
- **THEN** a fresh preview is requested, its new figures are presented for
  re-confirmation, and no order is committed
- **AND** the commit is not retried automatically at the higher cost

### Requirement: A Commit's Actual Result Is Never Silently Swapped for the Previewed One
WHEN a burn order commits and its response's actual solved arrival time or
delta-v cost differs from the figures the last-shown preview displayed for
that same target, the system SHALL surface the actual figures alongside the
committed order's own success feedback, rather than leaving the stale
previewed figures on screen with no acknowledgment of the difference. The
actual and previewed figures are each presented per `figure-formatting`, each
in its own element: the actual and previewed delta-v each carry their own raw
served value, and the actual and previewed arrival each carry their own raw
remaining span in unscaled world-milliseconds — the span from the mounting
view's projected world time to that figure's own served arrival instant. Both
arrival figures take the same direction form, `in` — both are deadlines read
from the mounting view's projected now, not the remainder of an already-
running order — so the comparison's two halves are read in one vocabulary,
never one `in` beside one `left`. A line surfacing both an actual and a
previewed figure for the same quantity SHALL render each in its own element
rather than combining them into one. This is the display half of the quote
lock; the reject half is the `maxFuelTons` cap of *A Burn Commit Is
Quote-Locked to the Preview the Player Agreed To*. Both are kept: the cap
bounds what the player can be charged, and this rule makes the difference
within that bound visible rather than silent.

#### Scenario: A commit matching the preview shows no drift notice
- **WHEN** a burn commits with an actual arrival time and delta-v cost
  matching the last-shown preview
- **THEN** the success feedback is shown with no separate drift notice

#### Scenario: A commit differing from the preview surfaces both figures
- **WHEN** a burn commits with an actual arrival time or delta-v cost
  differing from the last-shown preview
- **THEN** the success feedback is shown, and the actual figures are
  additionally surfaced alongside the previewed ones, with the actual
  delta-v, actual arrival, previewed delta-v, and previewed arrival each
  rendered in its own element per `figure-formatting`; the two delta-v
  elements each carry their own raw served value, and the two arrival
  elements each carry their own raw remaining span in unscaled
  world-milliseconds and render in the same `in` direction form

#### Scenario: An uncapped commit still surfaces its actual figures
- **WHEN** a burn commits with no `maxFuelTons` cap, because no current
  preview existed
- **THEN** the response's actual arrival time and delta-v cost are surfaced
  with the success feedback, each presented per `figure-formatting`

### Requirement: The Focused-Scan Target List Comes From the Server, Never From a Client Predicate
WHILE an acting fleet is selected and has no running sweep, the system SHALL
offer a focused-scan control that lists exactly the hosts the server's
scan-target read returned for that fleet (`focused-scan`'s *Eligible Scan
Targets Are Served Per Fleet, To Their Owner Alone*), each labelled by its kind
— a body or one of the corporation's own fleets — and each showing its served
sweep duration, presented per `figure-formatting` as a duration, with no
direction affix — it is a cost quoted before the sweep is committed, not a
position in time — and carrying its raw served value, so the cost of
sweeping a distant host is visible before it is paid. The control SHALL NOT compute, mirror, or
approximate the range or occlusion predicates that decide eligibility: a body
present in the interior read but absent from the served target set SHALL NOT
be offered as a target, and a body present in the served set SHALL be offered
even if the client's own scene would place it elsewhere.

This control's targets are its own; they are not the space view's selection
(*Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point*),
which a burn consumes and which accepts points in vacuum a sweep can never
name.

IF the served target set is empty, THEN the control SHALL state that no host is
in range, except while the acting fleet's own served state explains the empty
set — in lane transit, already sweeping, or having just had a scan commit
accepted whose running-status inbox read has neither reflected it nor failed
(*A Focused Scan Commits Against a Listed Target and Reports Its Rejection in
Player Copy*) — in which case the control SHALL state that instead, rather than
rendering an empty list. IF the scan-target read fails, THEN the control
SHALL show a retriable error and offer no targets, rather than falling back
to any locally derived list.

WHILE a triggered refetch of the scan-target read is in flight, the control
SHALL present the list as being re-read rather than stating that no host is in
range on the authority of the superseded set. The set served while the sensor
channel was held is empty by construction, and the instant the post-settle
running-status inbox read lands ahead of the scan-target read is precisely when
that empty set would otherwise be reported as a fact about the world.

The scan-target read SHALL be refetched whenever the acting fleet's served
kinematic state changes: on every landed resolution of that fleet's own burn
or jump, on every accepted instant fleet verb that rewrites its stored
kinematic state — cut drive, stop in place, a station-keeping hold, and a
station-keeping release — on a change of its attachment, on a successful scan
commit or cancel, on the settlement of that fleet's own sweep (the post-settle
follower reads *A Running Sweep Self-Schedules the Refetch That Settles It,
Then Reads the Inbox and the Pile* issues SHALL include a fresh scan-target
read, so the empty set served while the channel was held is never re-offered
as "no host is in range"), and when the acting fleet selection changes —
riding every
refetch rule *Realtime Refetch Rules While the Space View Is Open* applies to
the fleet read, including its live-subscription refetch, its reconnect
resync, and its constant baseline poll, so that a landed resolution observed
by any of those paths refetches this read too, and so that a fleet whose
surroundings change with no discrete event of its own does not hold one list
for the session — so the list reflects the fleet's current position rather
than the position it held when the view opened. Cut drive cancels the
running movement action, so the arrival trigger it would otherwise have
fired is retired with it. A list read once at mount and never again would
offer a docked fleet the targets of a departure point it has already left.

IF a refetch of the scan-target read fails, THEN the control SHALL present the
failed-read state of the rule above — a retriable error, offering no targets —
and SHALL NOT continue to display the previously served list, whose fleet
state the trigger has already declared stale. An empty list retained across a
failed refetch would state "no host is in range" on the authority of a read
the client has itself invalidated.

#### Scenario: Served targets are listed with their kind and duration
- **WHEN** the scan-target read returns a body and an own fleet
- **THEN** the control lists both, each labelled as a body or an own fleet, and
  each showing its served sweep duration presented per `figure-formatting`
  as a bare duration, with no direction affix, and carrying its raw served
  value

#### Scenario: A body absent from the served set is not offered
- **GIVEN** a body present in the interior read's body set but absent from the
  served scan-target set
- **WHEN** the scan control is shown
- **THEN** that body is not offered as a scan target, and no client-side range
  or occlusion computation is performed to decide so

#### Scenario: An empty target set is stated, not shown as an empty list
- **WHEN** the scan-target read returns no targets
- **THEN** the control states that no host is in range

#### Scenario: An empty target set explained by transit or a running sweep states that instead
- **GIVEN** the acting fleet is in lane transit, or already has a running
  focused scan
- **WHEN** the scan-target read returns an empty set
- **THEN** the control states that reason, rather than stating that no host is
  in range

#### Scenario: A failed target read is retriable and offers nothing
- **WHEN** the scan-target read fails
- **THEN** the control shows a retriable error, offers no targets, and does not
  substitute a locally derived list

#### Scenario: A landed arrival refetches the target list
- **GIVEN** the scan control is open with the scan-target read having returned an
  empty set while the acting fleet was under way with nothing in range
- **WHEN** the fleet's burn lands
- **THEN** the scan-target read is re-issued and the control offers the hosts now
  in range, including the host the fleet attached to
- **AND** none of this requires navigation, reload, or manual refresh

#### Scenario: A failed refetch drops the stale list rather than restating it
- **GIVEN** the scan-target read returned an empty set and the acting fleet's
  burn has since landed
- **WHEN** the triggered refetch fails
- **THEN** the control shows the retriable error and offers no targets, and does
  not state that no host is in range

#### Scenario: A settled sweep refetches the target list
- **GIVEN** the acting fleet's sweep was committed, so its cached scan-target
  set is the empty set served while the sensor channel was held
- **WHEN** the sweep's ETA passes and the view's scheduled refetches run
- **THEN** a fresh scan-target read is issued and the control offers the hosts
  now in range, never the held-channel empty set, and does not state that no
  host is in range
- **AND** none of this requires navigation, reload, or manual refresh

#### Scenario: An empty set awaiting its triggered refetch is not reported as no host in range
- **GIVEN** the acting fleet's sweep has settled and the post-settle
  running-status inbox read has landed showing no running sweep, while the
  triggered scan-target refetch is still in flight
- **WHEN** the control is shown
- **THEN** it presents the target list as being re-read, and does not state that
  no host is in range

#### Scenario: Changing the acting fleet refetches the list
- **WHEN** the player selects a different own fleet as the acting fleet
- **THEN** a scan-target read is issued for the newly selected fleet, and the
  control lists that read's targets, never the previous fleet's and never a page
  cached for this fleet under an earlier selection

### Requirement: A Running Sweep's Window and Cancel Come From the Action Inbox
WHILE the acting fleet has a running focused scan, the system SHALL read that
sweep from the owning corporation's action inbox — the running action of type
`scan` for that fleet — and SHALL show a countdown from that action's committed
time to its ETA, measured against **this view's projected world time**
(*Own-Fleet Position, Burn Curve, and Arrival Ghost Render Continuously*'s
scale-correct projection), the inbox supplying the ETA and the committed time
only. The countdown is presented per `figure-formatting` as a relative
duration and carries its raw remaining span in unscaled world-milliseconds;
the settling rule below (rather than counting below zero) is
`figure-formatting`'s due-form override for this surface
(*A Relative Duration Names Its Direction, a Cost Duration Renders Bare, and
a Due Duration Names That Explicitly*), not a rule this requirement restates
independently. The window
SHALL NOT be sourced from the fleet read, which serves no sweep window at
all.

The system SHALL offer a cancel affordance that cancels that action by its own
id through the generic action cancel endpoint, never through the fleet-level
cancel endpoint, which releases only the movement channel and would leave the
sweep running. On a successful cancel the countdown SHALL clear and the target
list SHALL be offered again. WHILE a sweep is running the commit control SHALL
NOT be offered, matching the server's rejection of a second concurrent sweep.

IF the running sweep's ETA has passed and it has not yet settled, THEN the
control SHALL show it as settling rather than counting below zero.

#### Scenario: The countdown spans the action's committed window
- **GIVEN** a running scan action with a committed time and an ETA
- **WHEN** the control is shown
- **THEN** it counts down to that ETA against the view's scale-correct
  projected world time, using the action's own committed time and ETA, and no
  world time the inbox served, presented per `figure-formatting` and
  carrying its raw remaining span in unscaled world-milliseconds

#### Scenario: The window is not taken from the fleet read
- **WHEN** the running sweep is displayed
- **THEN** its window is read from the action inbox, and no field of the fleet
  read is consulted for it

#### Scenario: Cancel names the scan action's own id
- **WHEN** the player cancels a running sweep
- **THEN** the request cancels that scan action by its id through the generic
  action cancel endpoint, and no fleet-level cancel request is issued

#### Scenario: A cancelled sweep returns the control to its target list
- **WHEN** a running sweep is cancelled successfully
- **THEN** the countdown clears and a fresh scan-target read is issued, whose
  targets the control offers — never the empty set served while the sweep held
  the sensor channel

#### Scenario: The commit control is withheld while a sweep runs
- **WHEN** the acting fleet has a running sweep
- **THEN** no scan commit control is offered for that fleet

#### Scenario: A past-ETA sweep reads as settling, not as a negative countdown
- **GIVEN** a running scan action whose ETA is at or before the view's projected world time
- **WHEN** the control is shown
- **THEN** it presents the sweep as settling, and shows no negative or
  ever-growing countdown

### Requirement: A Sighting Ghost Renders at Its Frozen Position, Never a Predicted One
The system SHALL draw a ghost mark (a sighting ghost is a distinct mark from
the burn's arrival ghost 8a-2 draws) for every target-naming record served by a
read of the corporation's sighting pile **filtered server-side to the open
system** (`sighting-records`' *The Pile Read Filters To One System On
Request*), at that record's stored position, visually distinct from a live
contact and from an own fleet, and labelled with the record's `asOf`. The
`asOf` label is presented per `figure-formatting` as an absolute `T+` stamp
and carries its raw served value wherever it is rendered — on the mark itself
(a screen-reader-only element is still its own DOM element, and carries the
attribute pair like any other) and on its facts surface when the ghost is
highlighted or hovered. The source is that filtered read and not a client-side scan of an
unfiltered pile: the pile spans every system the corporation has ever swept,
never expires, and is served a bounded page at a time, so filtering client-side
would silently omit this system's older records as soon as the pile outgrew
the pages the client happened to have fetched. The system SHALL NOT advance a
ghost by the record's stored velocity, by an orbital prediction, or by any other
extrapolation: a sighting freezes position and velocity rather than orbital
elements, so any forward integration would draw the target at a place no sweep
ever observed, and every sighting in this model is a glimpse rather than a
track.

That filtered read is **one bounded page, newest by `asOf`**, and the ghost
layer SHALL NOT page further: it draws the newest page of this system's records
and no more. The bound is stated here so it is a specified property of the
layer rather than an accident of the endpoint — the pile never expires, so a
system swept enough times will hold more records than one page, and a layer
that silently drew "some of them" would be indistinguishable from the
client-side-filtering defect this requirement exists to forbid. Whether ghosts
should page is not decided here.

The record's stored velocity SHALL instead be **displayed**, as a
heading-and-speed readout on the ghost's facts surface — the same facts surface
a live contact's served velocity readout already uses (*Foreign Contacts Render
at Their Served Position*), shown for a highlighted or hovered ghost, and this
readout is the stored velocity's only consumer.

A ghost is **highlighted**, never selected: the space view's selection is a
burn's input and admits no ghost at all (*A Ghost Is Not a Member of the Space
View's Selection, and a Burn Never Consumes One*), so this capability says
*highlighted* wherever a ghost is being read and reserves *selected* for the
view's own selection.

A clean-sweep record SHALL draw no ghost. It names no target and carries no
position at all, so there is nothing to draw and nowhere to draw it; *A Ghost
at the Origin Is Omitted From the Scene, Not Drawn Atop the Star* independently
forbids drawing its zero position on the star, should a record ever reach the
layer with the clean-sweep marker lost.

#### Scenario: A ghost renders at the record's stored position
- **WHEN** the system-filtered pile read serves a target-naming record for the
  open system
- **THEN** a ghost mark is drawn at that record's stored position, labelled with
  its `asOf`, presented per `figure-formatting` as a `T+` stamp

#### Scenario: A ghost's asOf label reads as a formatted stamp, on the mark and on its facts surface
- **WHEN** a ghost mark is drawn, and separately when it is highlighted or hovered
- **THEN** both its own label and its facts-surface "Observed at" line present
  the record's `asOf` per `figure-formatting` as a `T+` stamp, never as a raw
  world-millisecond integer

#### Scenario: The ghost layer reads the pile filtered by system
- **WHEN** the ghost layer sources its records
- **THEN** the pile read it issues names the open system as its filter, and no
  client-side filtering of an unfiltered pile is used to decide which records
  belong to this system

#### Scenario: A ghost does not move as world time advances
- **GIVEN** a rendered ghost
- **WHEN** world time advances and the view re-renders
- **THEN** the ghost's drawn position is unchanged, and no integration of its
  stored velocity or prediction of an orbit moves it

#### Scenario: A ghost's stored velocity is displayed, not integrated
- **WHEN** a rendered ghost is highlighted or hovered
- **THEN** its stored velocity is displayed as a heading-and-speed readout on
  the same facts surface a live contact's velocity readout uses, and that
  readout is the field's only consumer

#### Scenario: A system with more records than one page draws the newest page
- **GIVEN** a corporation whose pile holds more records for the open system
  than one page of the filtered read serves
- **WHEN** the ghost layer sources its records
- **THEN** it draws a ghost for each record of that single bounded page,
  newest `asOf` first, and issues no further page request

#### Scenario: A ghost is visually distinct from a live contact
- **WHEN** a ghost and a live contact are both rendered
- **THEN** their marks are visually distinguishable from one another and from an
  own fleet's mark

#### Scenario: A clean-sweep record draws no ghost
- **WHEN** the pile carries a clean-sweep record for the open system
- **THEN** no ghost mark is drawn for it, and nothing is drawn at the origin on
  its account

#### Scenario: A record for another system draws no ghost here
- **WHEN** a record whose system is not the open system exists in the
  corporation's pile
- **THEN** no ghost mark is drawn for it in this system's scene, and the
  filtered read does not serve it

### Requirement: Burn Commit Reports Its Outcome
The system SHALL report the outcome of every burn commit: on success, success
feedback naming that the order was accepted and carrying its served arrival
time; on failure, an error whose copy is mapped from the server's
distinguishable rejection reason (`docked-fleet-actions`'s *Rejection Reasons
Map to Player-Facing Copy, Not Raw Server Text*), never the raw reason string,
leaving the fleet's state and the current selection unchanged. A commit SHALL
NOT be silent in either direction: the adjacent *Jump Commit* already reports
both, and a burn is the more consequential of the two. The arrival time
named in the success feedback is presented per `figure-formatting` as a
relative duration, its text built from the module's own output for the
order's served arrival instant, never interpolated as a raw
world-millisecond integer into the toast string; the success feedback is a
toast, a string-only surface per `figure-formatting`'s toast/aria-label
exemption, and carries no `data-raw`/`data-unit` attribute of its own.

#### Scenario: A successful burn commit reports success
- **WHEN** a burn order commits successfully
- **THEN** success feedback is shown naming the order's served arrival time
  as a relative duration produced by the shared `figure-formatting` module,
  with no `data-raw`/`data-unit` attribute on the toast, since the toast is
  a string-only surface

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

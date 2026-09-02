## ADDED Requirements

### Requirement: The Focused-Scan Target List Comes From the Server, Never From a Client Predicate
WHILE an acting fleet is selected and has no running sweep, the system SHALL
offer a focused-scan control that lists exactly the hosts the server's
scan-target read returned for that fleet (`focused-scan`'s *Eligible Scan
Targets Are Served Per Fleet, To Their Owner Alone*), each labelled by its kind
— a body or one of the corporation's own fleets — and each showing its served
sweep duration, so the cost of sweeping a distant host is visible before it is
paid. The control SHALL NOT compute, mirror, or approximate the range or
occlusion predicates that decide eligibility: a body present in the interior
read but absent from the served target set SHALL NOT be offered as a target,
and a body present in the served set SHALL be offered even if the client's own
scene would place it elsewhere.

This control's targets are its own; they are not the space view's selection
(*Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point*),
which a burn consumes and which accepts points in vacuum a sweep can never
name.

IF the served target set is empty, THEN the control SHALL state that no host is
in range rather than rendering an empty list. IF the scan-target read fails,
THEN the control SHALL show a retriable error and offer no targets, rather than
falling back to any locally derived list.

#### Scenario: Served targets are listed with their kind and duration
- **WHEN** the scan-target read returns a body and an own fleet
- **THEN** the control lists both, each labelled as a body or an own fleet, and
  each showing its served sweep duration

#### Scenario: A body absent from the served set is not offered
- **GIVEN** a body present in the interior read's body set but absent from the
  served scan-target set
- **WHEN** the scan control is shown
- **THEN** that body is not offered as a scan target, and no client-side range
  or occlusion computation is performed to decide so

#### Scenario: An empty target set is stated, not shown as an empty list
- **WHEN** the scan-target read returns no targets
- **THEN** the control states that no host is in range

#### Scenario: A failed target read is retriable and offers nothing
- **WHEN** the scan-target read fails
- **THEN** the control shows a retriable error, offers no targets, and does not
  substitute a locally derived list

### Requirement: A Sweep's Cost Is Presented as Time and Exposure, Not Time Alone
The system SHALL state, on the scan control before a commit and again while a
sweep is running, that a sweep makes the acting fleet detectable for the
sweep's whole duration; and WHILE the acting fleet is attached to a host, SHALL
also state that the sweep breaks that masking for the sweep's duration.

A sweep is priced in sensor-channel time **and** in exposure — `focused-scan`'s
*A Sweep Emits For Its Duration* and *A Sweep Unmasks Its Scanner* are both
already true on the server, and no surface has ever told the player either one.
Showing the duration alone would present half the price and make the loudest
thing a fleet can do short of burning look like a purely temporal cost.

#### Scenario: The control states the exposure before a commit
- **WHEN** the scan control is shown with a target selected
- **THEN** it states that committing the sweep makes the acting fleet detectable
  for the sweep's duration

#### Scenario: The control states the exposure while a sweep runs
- **WHEN** a sweep is running for the acting fleet
- **THEN** the control states that the fleet is detectable for the remainder of
  the sweep

#### Scenario: An attached fleet is told the sweep breaks its masking
- **GIVEN** the acting fleet is attached to a host
- **WHEN** the scan control is shown
- **THEN** it states that the sweep breaks that masking for the sweep's duration

#### Scenario: An unattached fleet is not told about masking
- **GIVEN** the acting fleet is attached to no host
- **WHEN** the scan control is shown
- **THEN** it states the detectability but makes no claim about masking, which is
  not in play for it

### Requirement: A Focused Scan Commits Against a Listed Target and Reports Its Rejection in Player Copy
WHEN the player commits a focused scan from the control, the system SHALL
submit it against the acting fleet with the selected entry's served host id and
nothing else. On acceptance the control SHALL show the running sweep. On
rejection the control SHALL present player-facing copy for the reason and SHALL
NOT display raw server text: a host that is out of range, a host the star now
occludes, a host that no longer resolves, a fleet already running a sweep, and
a fleet in lane transit SHALL each read as its own statement of what happened.

A rejection carrying a reason this client has no specific copy for SHALL be
shown as a generic, non-technical fallback message rather than as blank text
or as the raw server string — the same fallback `docked-fleet-actions`'
*Rejection Reasons Map to Player-Facing Copy, Not Raw Server Text* and this
change's own settled-sweep report both already require, so a reason added
server-side later without a copy update degrades instead of showing nothing.

A rejection SHALL be presented as the sweep no longer being possible, with the
target list refetched, never as an application error — bodies move between the
target read and the commit, so a listed target going stale is ordinary and
expected, not a fault.

#### Scenario: A commit sends the served host id
- **WHEN** the player commits a focused scan against a listed target
- **THEN** the request carries that entry's served host id as its host

#### Scenario: An accepted commit shows the running sweep
- **WHEN** a focused-scan commit is accepted
- **THEN** the control shows the running sweep in place of the target list

#### Scenario: A target that went stale between the list and the commit reads as no longer possible
- **GIVEN** a listed target that the server rejects at commit because it is now
  out of range or occluded
- **WHEN** the commit is submitted
- **THEN** the control states that the sweep is no longer possible against that
  host, refetches the target list, and shows no application-error state

#### Scenario: An unmapped commit rejection reason renders safely
- **WHEN** a focused-scan commit is rejected with a reason this client has no
  specific copy for
- **THEN** a generic, non-technical fallback message is shown
- **AND** neither the raw server reason string nor a blank message is shown

#### Scenario: No raw server text reaches the player
- **WHEN** any focused-scan commit is rejected
- **THEN** the message shown is this client's own copy for that reason, and no
  raw server error string, status code, or reason code is displayed

### Requirement: The Scan Commit Control Guards Against Double-Submit
The focused-scan commit control SHALL be disabled from the moment of commit
until that request settles or fails, so a double-click or repeated-Enter cannot
submit two sweeps. The guard SHALL take effect synchronously, within the same
invocation that submits the request, and SHALL NOT depend on a pending-state
flip that only reaches the control's `disabled` attribute on a later render —
two activations a tick apart both reach the handler before any re-render, so a
render-dependent guard does not exist at the moment it is needed.

A duplicate sweep is not harmless: the sensor channel is single-slot, so the
second request is rejected while the first succeeds, and whichever response
lands last decides what the player is told — a committed sweep reported as a
failure.

#### Scenario: A double-click yields exactly one scan commit
- **WHEN** the scan commit control is double-clicked in rapid succession
- **THEN** exactly one scan request is submitted

#### Scenario: Two activations in one tick submit one scan commit
- **GIVEN** the scan commit control is rendered enabled with a target selected
- **WHEN** two activations reach the scan handler within the same tick, with no
  render cycle and no awaited step between them
- **THEN** exactly one scan request leaves the client
- **AND** the guard holds even though the control's `disabled` attribute has not
  yet been updated by a render

#### Scenario: The guard releases when the request settles or fails
- **WHEN** a scan commit settles or fails and the player then initiates a new
  sweep
- **THEN** the guard has been released and the new attempt submits normally

### Requirement: A Running Sweep's Window and Cancel Come From the Action Inbox
WHILE the acting fleet has a running focused scan, the system SHALL read that
sweep from the owning corporation's action inbox — the running action of type
`scan` for that fleet — and SHALL show a countdown from that action's committed
time to its ETA, measured against the world time the read served. The window
SHALL NOT be sourced from the fleet read, which serves no sweep window at all.

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
- **THEN** it counts down from the served world time to that ETA, using the
  action's own committed time and ETA

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
- **THEN** the countdown clears and the served target list is offered again

#### Scenario: The commit control is withheld while a sweep runs
- **WHEN** the acting fleet has a running sweep
- **THEN** no scan commit control is offered for that fleet

#### Scenario: A past-ETA sweep reads as settling, not as a negative countdown
- **GIVEN** a running scan action whose ETA is at or before the served world time
- **WHEN** the control is shown
- **THEN** it presents the sweep as settling, and shows no negative or
  ever-growing countdown

### Requirement: A Running Sweep Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the Pile
WHILE any of the requesting corporation's own fleets in the open system has a
running focused scan, the system SHALL treat **each** such sweep's ETA as a
refetch trigger for the open view — one scheduled refetch per such ETA — on the
same self-scheduling mechanism *Realtime Refetch Rules While the Space View Is
Open* already applies to a running mine, burn, and jump, using the same cushion
after the ETA. Without this a sweep does not land while the player watches: a
sweep resolves only when some read folds it, or when the periodic liveness
sweep does — a cadence measured in minutes, which is not a player-facing
latency. The trigger is anchored to
the corporation's own fleets rather than to the acting fleet alone: a
corporation may have several fleets sweeping one system, and anchoring to the
selected one would leave every other fleet's sweep unsettled and its records
unread for as long as that selection held.

After the interior refetch that follows a sweep's ETA has **completed**, and
only then, the system SHALL refetch both the corporation's sighting pile for
the open system and the **action inbox for the fleet whose sweep was due**. The
inbox refetch is not optional bookkeeping: the running window, the cancel
affordance's action id, the settled sweep's outcome, its reason code, and its
acknowledged state are all carried by the inbox and by nothing else, so without
it a settled sweep reads as perpetually settling (*A Running Sweep's Window and
Cancel Come From the Action Inbox*) and its outcome report never appears at all
(*A Settled Sweep Reports Its Outcome, Including Each Fizzle Reason, in Player
Copy*).

The ordering is load-bearing: reading the pile and reading the inbox each
settle nothing and mint nothing, so either one issued concurrently with the
settling interior read can return before the sweep has resolved — the player
would see an empty result, and a still-running action, for a sweep that
succeeded.

#### Scenario: Each own fleet's running sweep schedules the refetch that settles it
- **GIVEN** two of the corporation's own fleets in the open system, each with a
  running sweep with a known ETA, only one of which is the acting fleet
- **WHEN** the view schedules its refetches
- **THEN** a refetch of the system interior is scheduled after each of those
  two ETAs, on the same cushion the view's other ETA refetches use, neither of
  them skipped for not being the acting fleet's

#### Scenario: The pile and the inbox are refetched only after the settling read completes
- **GIVEN** a running sweep whose ETA has just passed
- **WHEN** the scheduled interior refetch is issued
- **THEN** the sighting-pile refetch and the scan's action-inbox refetch are
  issued only after that interior refetch has completed, never concurrently
  with it

#### Scenario: The settling sweep resolves to a report without user action
- **GIVEN** the space view is open with a running sweep whose ETA has just
  passed, presented as settling
- **WHEN** the scheduled refetches run
- **THEN** the action inbox is re-read, the sweep is no longer presented as
  settling, and its settled outcome is reported
- **AND** none of this requires navigation, reload, or manual refresh

#### Scenario: A sweep that settles while the view is open lands without user action
- **GIVEN** the space view is open with a running sweep
- **WHEN** the sweep's ETA passes and the scheduled refetches run
- **THEN** the sweep's minted records are present in the corporation's pile as
  read by this view, with no navigation, reload, or manual refresh

#### Scenario: A non-acting fleet's sweep still lands
- **GIVEN** two of the corporation's own fleets in the open system, where the
  fleet with a running sweep is not the acting fleet
- **WHEN** that sweep's ETA passes and the scheduled refetches run
- **THEN** its minted records are present in the pile as read by this view, and
  its ghosts are drawn, without the player selecting that fleet

#### Scenario: No sweep refetch is scheduled when no own fleet is sweeping
- **WHEN** no own fleet in the open system has a running sweep
- **THEN** no sweep-driven refetch is scheduled, and the view's other refetch
  rules are unchanged

### Requirement: A Settled Sweep Reports Its Outcome, Including Each Fizzle Reason, in Player Copy
The system SHALL report the acting fleet's most recently settled,
unacknowledged focused scan — the one with the greatest resolved-at world time
among that fleet's settled, unacknowledged scans, its ETA breaking a tie. The
ordering SHALL be stated in terms of those served fields and SHALL NOT rely on
the order the inbox happens to return, which carries no ordering guarantee at
all. A sweep that minted records SHALL be reported as having filed them, with
an affordance that opens the sighting log. A sweep that fizzled SHALL
be reported with copy specific to its served reason code — the scanning fleet
being out of range at pulse-reach, the star having occluded the host at
pulse-reach, the scanning fleet having left the host's system, the scanning
fleet being in lane transit, and the host no longer resolving — each reading as
its own statement, since a fizzle mints nothing and is otherwise
indistinguishable to the player from a sweep that never ran.

The system SHALL NOT display the raw reason code or the action's raw outcome
text. A reason code this client does not recognize SHALL be reported as a sweep
that returned nothing, never as a blank report or as raw text. Dismissing the
report SHALL acknowledge that action, so a later refetch does not report the
same settled sweep again.

#### Scenario: The reported sweep is the one with the greatest resolved-at time
- **GIVEN** the acting fleet has two settled, unacknowledged scans with
  different resolved-at world times, served in an arbitrary order
- **WHEN** the report is shown
- **THEN** it reports the scan with the greater resolved-at world time,
  whichever order the inbox listed them in

#### Scenario: Equal resolved-at times are broken by ETA
- **GIVEN** the acting fleet has two settled, unacknowledged scans with equal
  resolved-at world times and different ETAs
- **WHEN** the report is shown
- **THEN** it reports the one with the later ETA, deterministically

#### Scenario: A sweep that minted records reports and links to the log
- **WHEN** a settled, unacknowledged sweep minted records
- **THEN** the view reports that the sweep filed records
- **AND** offers an affordance that opens the sighting log

#### Scenario: Each served fizzle reason reads as its own statement
- **WHEN** a settled sweep carries a reason code for being out of range at
  pulse-reach, for the star occluding the host, for the scanner having left the
  system, for the scanner being in lane transit, or for the host not resolving
- **THEN** the report shown differs for each of those five reasons

#### Scenario: An unrecognized reason code degrades to a generic report
- **WHEN** a settled sweep carries a reason code this client does not recognize
- **THEN** the report states that the sweep returned nothing
- **AND** no raw reason code or raw outcome text is displayed

#### Scenario: Dismissing a report acknowledges the action
- **WHEN** the player dismisses a settled sweep's report
- **THEN** that action is acknowledged
- **AND** a subsequent refetch does not report the same settled sweep again

### Requirement: A Sighting Ghost Renders at Its Frozen Position, Never a Predicted One
The system SHALL draw a ghost mark for every target-naming record served by a
read of the corporation's sighting pile **filtered server-side to the open
system** (`sighting-records`' *The Pile Read Filters To One System On
Request*), at that record's stored position, visually distinct from a live
contact and from an own fleet, and labelled with the record's `asOf`. The
source is that filtered read and not a client-side scan of an unfiltered
pile: the pile spans every system the corporation has ever swept, never
expires, and is served a bounded page at a time, so filtering client-side
would silently omit this system's older records as soon as the pile outgrew
the pages the client happened to have fetched. The system SHALL NOT advance a
ghost by the record's stored velocity, by an orbital prediction, or by any other
extrapolation: a sighting freezes position and velocity rather than orbital
elements, so any forward integration would draw the target at a place no sweep
ever observed, and every sighting in this model is a glimpse rather than a
track.

The record's stored velocity SHALL instead be **displayed**, as a
heading-and-speed readout on the ghost's facts surface — its only consumer —
mirroring the rule a live contact's served velocity already follows.

A clean-sweep record SHALL draw no ghost. It names no target and carries no
position at all, so there is nothing to draw and nowhere to draw it; *A Ghost
at the Origin Is Omitted From the Scene, Not Drawn Atop the Star* independently
forbids drawing its zero position on the star, should a record ever reach the
layer with the clean-sweep marker lost.

#### Scenario: A ghost renders at the record's stored position
- **WHEN** the system-filtered pile read serves a target-naming record for the
  open system
- **THEN** a ghost mark is drawn at that record's stored position, labelled with
  its `asOf`

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
- **WHEN** a rendered ghost is selected or hovered
- **THEN** its stored velocity is displayed as a heading-and-speed readout, and
  that readout is the field's only consumer

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

### Requirement: A Ghost at the Origin Is Omitted From the Scene, Not Drawn Atop the Star
The system SHALL treat a sighting record's stored position of exactly the
origin `(0,0,0)` as invalid, omit that record's ghost from the rendered scene,
and log a diagnostic entry naming the omitted record — never drawing it
superimposed on the star.

This restates, for a ghost, the rule *A Non-Star Position at the Origin Is
Omitted From the Scene, Not Drawn Atop the Star* already applies to a body's,
a fleet's, and a contact's position. A ghost is a fourth mark class that
enumeration does not name, so without this requirement a target-naming record
whose stored position happens to be the origin — which is not the clean-sweep
case, that record naming no target at all — would be drawn on top of the star,
which is exactly the outcome that rule exists to prevent. A ghost's position is
served, never resolved from elements, so this is a validity check on a stored
value and never a licence to move a ghost (*A Sighting Ghost Renders at Its
Frozen Position, Never a Predicted One*).

#### Scenario: A target-naming record stored at the origin draws no ghost
- **WHEN** the filtered pile read serves a target-naming record for the open
  system whose stored position is exactly `(0,0,0)`
- **THEN** no ghost is drawn for it and a diagnostic entry naming the omitted
  record is logged
- **AND** nothing is drawn superimposed on the star on its account

#### Scenario: A ghost at any other position renders normally
- **WHEN** a target-naming record's stored position is anything other than
  exactly `(0,0,0)`
- **THEN** its ghost renders normally, unaffected by this requirement

### Requirement: A Ghost Is Not a Member of the Space View's Selection, and a Burn Never Consumes One
The system SHALL NOT admit a ghost mark to the space view's single selection
(*Toggle-to-Deselect Single Selection Among a Body, a Lane Gate, or a Point*):
selecting a ghost SHALL NOT become a body, gate, or point selection, SHALL NOT
replace or clear an existing selection, and SHALL NOT supply a burn's target.
A ghost highlight for cross-reading with the sighting log (`sighting-log`'s *A
Log Row and Its Ghost Address the Same Record By Its Served Id*) is a separate,
additional state, held alongside the space view's own selection rather than
inside it.

The picking rule is exhaustive: a click that resolves against the pick plane
over no body or lane-gate mark **selects that point**, and a burn commands
against a selected point uniformly. A ghost is drawn in that same plane at a
position where the sweep found something masked, which is precisely the place a
player is most likely to click — so without this rule, clicking a ghost to read
it silently arms a burn to the coordinate a foreign fleet occupied at some past
`asOf`. That is a commanded manoeuvre produced by an inspection gesture, and a
frozen sighting is the worst possible source for a burn target.

#### Scenario: Selecting a ghost leaves the view's selection untouched
- **GIVEN** a body is the space view's current selection and a ghost is drawn
- **WHEN** the player selects that ghost
- **THEN** the space view's selection is still that body, and the ghost is not
  a member of the selection

#### Scenario: A ghost selection never supplies a burn target
- **GIVEN** a ghost is selected for cross-highlighting and the space view's own
  selection is empty
- **WHEN** the burn command surface is inspected
- **THEN** it offers no target, and the ghost's position is not proposed as one

#### Scenario: A click on a ghost does not become a point selection
- **WHEN** the player clicks a ghost mark drawn over no body or lane-gate mark
- **THEN** no point selection is created at that position, and no burn is armed
  against it

### Requirement: A Ghost Is Never Suppressed By, Merged With, or Linked To a Live Contact
The system SHALL render ghosts and live contacts independently. It SHALL NOT
hide a ghost because a live contact exists, SHALL NOT merge or pair a ghost with
a contact by proximity, position, velocity, or any other client-side inference,
and SHALL NOT present any indication that a given ghost and a given contact are
the same entity.

No correlation key exists on the wire: a contact carries no id, and a sighting's
target id is never served (`sighting-records`'s *A Sighting Record Is
Addressable On the Wire Without Naming Its Target*). Inferring one client-side
would be a disclosure decision made off the server — the same class of thing
that rendering a contact at its served position, rather than an integrated one,
exists to prevent — and it would assert an identity the server deliberately
withholds.

#### Scenario: A ghost and a live contact both render
- **GIVEN** a ghost drawn for a record in the open system, and a live contact in
  that system's `contacts` array
- **WHEN** the scene is rendered
- **THEN** both marks are drawn, and neither is hidden on account of the other

#### Scenario: Proximity does not merge a ghost and a contact
- **GIVEN** a ghost and a live contact whose drawn positions are arbitrarily
  close
- **WHEN** the scene is rendered
- **THEN** they remain two independent marks, with no merged mark and no
  reduction to one

#### Scenario: No same-entity indication is presented
- **WHEN** a ghost and a live contact are both rendered
- **THEN** nothing in either mark, its facts surface, or the log states or
  implies that they are the same entity

### Requirement: The Scan Surface Remains Usable While the Canvas Is Unavailable
The focused-scan control — its served target list, its commit, its running
countdown, its cancel, and its settled-sweep report — is anchored to the acting
fleet's own served state and to a server-served target list rather than to a
canvas selection, and SHALL therefore remain invokable through the fleet panel
while the view's canvas region shows its unsupported or interrupted state
(*Renderer Unavailability Is an Explicit State*, *Lost Rendering Context
Recovers Without Navigation*), without requiring a selection on the canvas. The
affordance that opens the sighting log SHALL likewise remain reachable.

Ghost marks are canvas-only. WHILE the canvas region is unavailable they SHALL
simply be absent, with no error attributed to them and no fallback rendering.

#### Scenario: A sweep can be commanded while the canvas is unavailable
- **GIVEN** the view's canvas region shows the unsupported or interrupted state
- **WHEN** the player opens the scan control and commits against a served target
- **THEN** the scan request is submitted against the acting fleet

#### Scenario: A running sweep stays visible and cancellable without the canvas
- **GIVEN** the acting fleet has a running sweep and the canvas region shows the
  unsupported or interrupted state
- **THEN** the countdown remains shown and the cancel affordance remains
  invokable

#### Scenario: The sighting log stays reachable without the canvas
- **WHEN** the canvas region shows the unsupported or interrupted state
- **THEN** the affordance that opens the sighting log remains reachable

#### Scenario: Ghost marks are absent without error while the canvas is unavailable
- **WHEN** the canvas region shows the unsupported or interrupted state and the
  pile carries records for the open system
- **THEN** no ghost marks are drawn, no error is attributed to them, and no
  fallback rendering is substituted

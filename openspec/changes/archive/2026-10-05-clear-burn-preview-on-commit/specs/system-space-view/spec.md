## ADDED Requirements

### Requirement: A Burn Order Committed From This View Withholds Its Quote and the Burn Command for That Selection While It Is the Fleet's Running Burn, as Last Read
The system SHALL, when a burn order for the current selection is accepted from
the system space view, make that selection the **committed selection** of the
fleet the command was invoked for: it SHALL remove that selection's preview
(its figures, its fuel ceiling, its affordability line and the preview's own
stranding line) and request none for it, SHALL make the burn command
unavailable for it, and SHALL state in the command panel that an order is
committed to the selected target — for as long as that order is that fleet's
running burn, **as the own-fleets read last reported it**. This is the fourth
withheld state of *Burn Preview Reflects the Server-Solved Order, Without
Committing*. The view knows the world only through reads, so every clause
below is stated against reads and never against world truth.

**Whose and which.** The committed selection belongs to the fleet the command
was invoked for and the selection that was current when it was invoked, not the
fleet acting or the selection current when the response landed. It is in force
only while that fleet is the acting fleet and that selection compares equal to
the current selection; the view compares its own selection, never the target
the order names and never the target the own-fleets read reports. Any other
selection, and any other acting fleet, is previewed and committable exactly as
it was before the commit. There is one committed selection per fleet: a
fleet's later accepted burn commit replaces its earlier one at that
acceptance, toward the same target or another, whether or not the later
response carries the stranding warning, and one fleet's commit SHALL NOT
affect another fleet's. A selection that is not the acting fleet's committed
selection is an uncommitted selection wherever this capability uses that word.

**The order's life.** The order's identity, the gap between the acceptance and
the first own-fleets read after it, each way the order ends, and the rule that
the end is read-only are those of *A Burn Commit's Stranding Warning Stays
Visible While That Order Is the Fleet's Running Burn, as Last Read*, which this
requirement does not restate: the committed selection holds from the
acceptance, through the gap, for as long as the own-fleets read reports that
order as that fleet's running burn, and ends with no user action and no
selection change at the first own-fleets read requested at or after the
acceptance that answers without reporting that order as running — the drive
cut, a stop above, at or below the speed floor, arrival at a body, arrival at a point,
or a different order placed from this view or from elsewhere, including one
toward the same target. The view's projected clock passing the order's arrival
instant ends nothing. There is one determination of whether the order is still
running, and the stranding notice and the committed selection are its two
readers: the notice additionally requires that the accepting response carried
the warning, and the committed selection additionally requires that the
selection and the acting fleet match. The withholding begins at the
acceptance and lasts through the gap because of that acceptance, not because a
read is being refreshed.

**A failed read.** A read that fails answers nothing and changes nothing for
the stranding notice, the quote or the burn command. IF an own-fleets read requested at
or after the acceptance fails, THEN the gap continues: the stranding notice (if
the response carried the warning) stays, the quote stays withheld, and the burn
command stays unavailable for the committed selection with its statement shown,
beside the view's existing fleets-error notice and its retry, until a read
answers. A read that fails after the gap has ended leaves the last answer, and
so all three, standing. No no-quote state, stale marking or preview retry is
shown for the withheld quote. The cost of this rule is that the command is
withheld for that one selection for as long as reads keep failing even if the
order has in fact ended; it never leaves the command available, and so never
uncapped, on the strength of a read that did not answer.

**The lag.** The lag is that of the predecessor requirement: a change this view
causes by cutting the drive or stopping is known one own-fleets round trip
after that command's response; an arrival is known at the first read that
reports it once a read has reported the order running; a change made elsewhere
is known at the first read that reports it, requested no later than the view's
next baseline poll. Until then the view acts on its previous read, and the
withholding outlasts the order by exactly that wait. For the quote and the
command the cost of the lag is a quote withheld and a command unavailable for
one selection until the reporting read answers, never a command submitted
uncapped.

**While it holds.** The command panel SHALL NOT show, for the committed
selection, the uncapped-burn label, the no-quote state, a stale marking or a
preview retry, and the burn command SHALL be unavailable and SHALL send no
order when activated. This takes precedence over *Burn Command Targets Any
Selected Body, Lane Gate, or Point Uniformly* for that selection only. The
availability of the burn command for the committed selection is this
requirement's: the stranding notice, when also shown, contributes nothing to
it, and the statement of *A Burn Commit's Stranding Warning Stays Visible
While That Order Is the Fleet's Running Burn, as Last Read* that the notice's
appearing or removal does not remove, disable or re-order the burn command
control remains a statement of what the notice itself contributes. The commit's
own result surfaces (the success feedback, the drift notice of *A Commit's
Actual Result Is Never Silently Swapped for the Previewed One* and the
stranding notice) are not preview elements and are neither removed nor
suppressed by this state. The statement is shown whether or not the canvas is
available.

**Not a dead end.** A different selection is previewed and committable
throughout, and the committed target stays committed when it is selected again
while its order is still the fleet's running burn. The cut drive and stop
commands are unaffected.

**Focus.** WHEN the burn command becomes unavailable because a burn order was
accepted while the control holds keyboard focus, keyboard focus SHALL NOT be
lost to the start of the document: the next Tab SHALL move to the next focusable
element after the burn command control in the command column's order (the
command panel's next control when it has one, otherwise the first focusable
element after the panel). The view SHALL NOT programmatically move focus at the acceptance, to the statement or anywhere else.

**When it ends.** The resume rule of *Burn Preview Reflects the Server-Solved
Order, Without Committing* applies: when the committed selection ends and a
preview is requested again for the same acting fleet and selection, the request
is sent at the transition and nothing from before the commit is shown until it
lands, and a burn committed in that window is submitted with no `maxFuelTons`.
When the committed selection ends with the fleet attached to the selected body,
that body is the fleet's own host and the docked-at-target withheld state takes
over: no request is sent, and this requirement adds nothing to what that state
shows or offers.

**Only this view's commits.** A running burn for which the view holds no
accepted commit response is not a committed selection and is previewed and
committable as a re-target, as before: a burn the view opened on, one placed
from another tab or by the agent, and one committed before the view was
remounted. A reload mid-burn therefore returns the quote for the flown-to
target. The unavailability of the burn command for a committed selection is a
client presentation rule only. It is not, and SHALL NOT be relied on as, the
server's authorization of a burn order or its protection against a second order
for the same fleet: a reload, another tab or the agent can submit one, and
`fleet-movement` owns what the server does with it.

**The statement.** The statement that an order is committed to the selected
target is player-facing static text, the same for a body, a lane gate and a
point, shown in the command panel immediately before the burn command control in
reading order, and above the stranding notice and the drift notice when those
are shown. It SHALL state that a burn order is committed to the selected target,
SHALL state that the burn command is unavailable for it because of that, and
SHALL name the way to change course from this panel (selecting another target).
It SHALL carry no figure, no countdown, no raw server text and no target
identifier, and its text SHALL be the same whatever the response and the
own-fleets read contain. While the statement is shown, the burn command control
SHALL reference it as its accessible description, and the control SHALL NOT
reference it otherwise. Its exact wording is not fixed by this requirement.

**Silence.** The committed selection's beginning and ending add no text to the
view's live-region announcement and cause no announcement of their own, so that
announcement is whatever it would be without them (a landed arrival read that
ends the state still announces its landing, per *A Landed Resolution Is
Announced to Assistive Technology*). The statement SHALL NOT be a live region
and SHALL NOT be rendered inside one.

**When there is no committed selection.** A rejected or failed burn commit
creates none and leaves an earlier committed selection as it was, to follow its
own order's life.

#### Scenario: A committed order removes the quote and withholds the burn command
- **GIVEN** a parked own fleet is acting, a body is selected and its preview is shown
- **WHEN** a burn order for that body is accepted with a response carrying no stranding field, and the next own-fleets read reports that burn
- **THEN** none of the preview's own elements is shown (arrival, delta-v, fuel, fuel ceiling, affordability, stranding line)
- **AND** the statement that an order is committed to the selected target is shown, and the selection is unchanged
- **AND** the burn command is unavailable although the commit's request has settled, and no uncapped-burn label, no-quote state, stale marking or preview retry is shown
- **AND** across two refresh intervals and a baseline poll that each answer the same burn, no preview request is sent
- **AND** activating the burn control sends no order
- **AND** the burn command control's accessible description is the statement's text, and when the statement is removed the control carries no such description
- **AND** the commit's success feedback is given once and is not suppressed by the committed selection
- **AND** when the canvas becomes unavailable the statement is still shown and no uncapped-burn label is shown

#### Scenario: The committed selection holds before any read has answered after the acceptance
- **GIVEN** a burn order accepted for the selected body, departing at 1000 and arriving at 61000, with the cached own-fleets read still describing the fleet as parked
- **WHEN** the first own-fleets read requested after the acceptance has not answered
- **THEN** the preview's own elements are not shown and the statement is shown
- **AND** the burn command is unavailable and activating it sends no order
- **AND** no preview request is sent

#### Scenario: A read begun before the commit and answered after it does not end the committed selection
- **GIVEN** an own-fleets read requested before the acceptance and not yet answered
- **AND** a burn order accepted for the selected body, departing at 1000 and arriving at 61000
- **WHEN** that earlier read answers describing the fleet as parked
- **THEN** the statement is still shown, the burn command is unavailable and no preview request has been sent
- **AND** when the first read requested after the acceptance answers with the fleet burning 1000 to 61000 the statement is still shown

#### Scenario: The projected clock passing the arrival does not end the committed selection
- **GIVEN** the last own-fleets read reports the committed burn, arriving at 61000
- **WHEN** the view's projected world time passes 61000 with no further read answered
- **THEN** the statement is still shown and the burn command is unavailable
- **AND** no preview request is sent
- **AND** when a read then answers still reporting that burn, with every world time it serves (the read's own and the fleet's) past 61000, the statement is still shown and no preview request is sent

#### Scenario: Cutting the drive ends the committed selection
- **GIVEN** the statement is shown for the acting fleet's order and the selection is unchanged
- **WHEN** the drive is cut from the fleet panel and the refreshed own-fleets read reports the fleet drifting with no burn
- **THEN** the statement is removed and the burn command is available
- **AND** one preview request for the kept selection is sent at that answer
- **AND** while that request is pending no figure, ceiling or stale marking from before the commit is shown, and a burn committed in that window is submitted with no `maxFuelTons`
- **AND** the uncapped-burn label is shown while that request is pending
- **AND** when the burn committed in that window is accepted, the statement is shown again for the kept selection and no further preview request is sent for it

#### Scenario: A stop ends the committed selection, above or at the speed floor
- **GIVEN** the statement is shown for the acting fleet's order
- **WHEN** a stop is commanded and the refreshed read reports, in one arrangement, a different burn whose instants are 70000 and 90000, and in the other, the fleet parked at a point with no burn
- **THEN** in each arrangement the statement is removed, the burn command is available and one preview request for the kept selection is sent at that answer

#### Scenario: A read reporting the order gone ends the committed selection
- **GIVEN** the statement is shown for the order departing at 1000 and arriving at 61000, a read having reported that order running
- **WHEN** a later own-fleets read, caused by a baseline poll, answers in one arrangement with the fleet parked at a point and attached to nothing, in another with the fleet burning to a different target departing at 5000 and arriving at 80000, in another with the fleet burning to the same target departing at 5000 and arriving at 61000, and in another with the fleet burning departing at 1000 and arriving at 90000
- **THEN** in each arrangement the statement is removed, the burn command is available and one preview request for the kept selection is sent at that answer
- **AND** in the arrangement with the fleet parked at a point, no figure is asserted to render, because the point is the fleet's own position

#### Scenario: Arrival at the selected body hands over to the docked-at-target state
- **GIVEN** the statement is shown for an order toward the selected body, a read having reported that order running
- **WHEN** the next own-fleets read reports the fleet parked and attached to that body
- **THEN** the statement is removed
- **AND** no preview request is sent
- **AND** the burn command and the uncapped-burn label are as the docked-at-target state already leaves them
- **AND** the landing announcement is made once, and the statement's removal announces nothing else

#### Scenario: An order that settled inside the commit round trip never shows past the first read
- **GIVEN** a burn order accepted for the selected body
- **WHEN** the first own-fleets read requested after the acceptance answers with the fleet parked and attached to that body
- **THEN** the statement is shown until that read answers
- **AND** it is removed when that read answers, with no preview request sent

#### Scenario: A failed read changes nothing for the quote and the burn command
- **GIVEN** a burn order accepted for the selected body, departing at 1000 and arriving at 61000, with the cached read describing the fleet as parked
- **WHEN** the first own-fleets read requested after the acceptance fails
- **THEN** the statement is still shown and the burn command is unavailable
- **AND** the view's existing fleets-error notice and retry are shown, and no no-quote state, stale marking or preview retry is shown
- **AND** no preview request is sent
- **AND** when a later read answers with the committed burn's instants the statement is still shown
- **AND** when a read after that fails the statement is still shown
- **AND** when a later read answers with the fleet drifting with no burn the statement is removed and one preview request for the kept selection is sent
- **AND** when a further read then fails, no statement is shown, the burn command is available, the resumed preview's figures are still shown and no preview request is sent at that failure

#### Scenario: Another target is previewed and committable while the committed target stays committed
- **GIVEN** the statement is shown for an order toward a selected body, the last read reporting that order running
- **WHEN** a different body is selected
- **THEN** a preview request is sent for it and its figures are shown
- **AND** the burn command is available and no statement is shown
- **AND** when the committed body is selected again while the last read still reports the order running, the statement is shown, the burn command is unavailable and no preview request is sent for it
- **AND** when a burn order for a selected point is accepted, the statement is shown and no preview request is sent for that point; and when a different point is then selected, a preview request is sent for it, its burn command is available and no statement is shown

#### Scenario: A second commit by the same fleet moves the committed selection
- **GIVEN** fleet A is committed to body X, a read having reported that order running
- **WHEN** body Y is selected and a burn order for it is accepted, in one arrangement with the stranding warning and in another without, its response's burn departing at 5000 and arriving at 80000
- **THEN** the statement is shown for Y, the burn command is unavailable for Y and no preview request is sent for Y
- **AND** when body X is selected again, including while a read still reports the first order's instants, X is previewed and its burn command is available and no statement is shown

#### Scenario: A response that lands after the selection was replaced withholds nothing for the new selection
- **GIVEN** the burn command was invoked for body X and body Y is selected before the response lands
- **WHEN** the response lands
- **THEN** Y's preview is still shown and its burn command is available
- **AND** when X is selected again while that order is the fleet's running burn, the statement is shown for X

#### Scenario: The committed selection follows the fleet
- **GIVEN** fleet A and fleet B are both here
- **WHEN** in one arrangement A's burn order is accepted for a body and B is then made the acting fleet with the selection kept, and in another the burn command is invoked for A, B is made the acting fleet, the response lands and A is then made the acting fleet again
- **THEN** while B is acting, a preview is requested for B, B's burn command is available and no statement is shown
- **AND** in the second arrangement, B's preview figures stay shown across A's acceptance and no preview request is sent for B at that acceptance
- **AND** when A is the acting fleet again and the last read reports A's order running, the statement is shown for the kept selection and no preview request is sent for it
- **AND** in the first arrangement, when B's burn order for the kept selection is then accepted and A is made the acting fleet again while the last read reports both orders running, the statement is shown, the burn command is unavailable and no preview request is sent for A; and the same holds for B when B is acting

#### Scenario: A rejected or failed commit enters no committed state
- **GIVEN** a body is selected with its preview shown and its burn command available
- **WHEN** a burn commit for it is rejected, in one arrangement as a cap rejection and in another as a failure with no mapped reason
- **THEN** no statement is shown and the burn command is available
- **AND** in the cap rejection arrangement a fresh preview is requested and its figures are presented for re-confirmation

#### Scenario: A rejected commit leaves an earlier committed selection alone
- **GIVEN** the acting fleet is committed to body X, the last read reporting that order running
- **WHEN** a burn commit toward a different body Y is rejected and X is then selected again
- **THEN** the statement is shown for X and its burn command is unavailable

#### Scenario: The committed selection is silent
- **GIVEN** a parked own fleet is acting and a body is selected
- **WHEN** a burn order for it is accepted, and later the drive is cut and the refreshed read reports the fleet drifting
- **THEN** the view's live-region text is identical before the acceptance, after it, and after the cut removes the statement

#### Scenario: A burn this view did not commit is previewed
- **WHEN** in one arrangement the view is opened with the acting fleet already burning toward the selected body, and in another the view is remounted over an own-fleets read that still reports an order committed before the remount
- **THEN** in each arrangement a preview is requested for the selection, its burn command is available and no statement is shown

#### Scenario: One order, two consumers
- **GIVEN** a parked own fleet is acting and a body is selected
- **WHEN** a burn order for that body is accepted with a response carrying the stranding warning
- **THEN** both the stranding notice and the statement are shown
- **AND** when another body is selected the stranding notice stays and the statement is removed
- **AND** when a burn order for the selected body is accepted with a response carrying no stranding field, the statement is shown and no stranding notice is shown, including before any own-fleets read has answered

#### Scenario: The statement carries no figure and no wire text
- **WHEN** the statement is shown
- **THEN** its text contains no digit and no countdown
- **AND** its text is the same whatever the commit response and the own-fleets read contain
- **AND** its text says the burn command is unavailable and says to select another target
- **AND** it precedes the burn command control in reading order and follows the selection line
- **AND** when the stranding notice and the drift notice are also shown, the statement precedes both
- **AND** the statement has no live-region role or attribute and no ancestor that has one

#### Scenario: Keyboard focus survives the burn command becoming unavailable
- **GIVEN** the burn command control holds keyboard focus and is activated from the keyboard
- **WHEN** the order is accepted and the control becomes unavailable
- **THEN** pressing Tab moves focus to the next focusable element after the burn command control in the command column's order (the command panel's next control when it has one, otherwise the first focusable element after the panel), not to the start of the document
- **AND** focus was not moved to the statement by the acceptance

## MODIFIED Requirements

### Requirement: Burn Preview Reflects the Server-Solved Order, Without Committing
WHILE a body, a lane-gate body, or a point is the current selection, the
system SHALL, except in the withheld states below, request a preview of the
order that selection would commit via
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

The view SHALL request that preview whenever there is a current selection and
an acting fleet and none of the four withheld states below holds. In
particular a preview SHALL be requested while the acting fleet is
**burning**: re-targeting mid-flight is an ordinary commit against the
fleet's live tangent, it is the most consequential order in the game, and
offering the commit while withholding the quote would remove the preview from
the decision that most needs one.

The view SHALL NOT request a preview in any of four withheld states, each
taken as the view last read it:

- the view's running-mine determination for the acting fleet reports a
  running mine whose ETA has not passed — the same determination the view
  hands the command surface for the burn command's mine gate (*Running Mine
  Gates the Fleet Panel's Commands*), so that the two cannot disagree;
- the own-fleets read last reported the acting fleet in lane transit;
- the selected target is the body, station, or lane-gate body the own-fleets
  read last reported the acting fleet attached to. A burn from a body to
  itself has no curve to solve, so no preview is requested for it; the
  selection itself is left as it is, and the player can select another
  target. A selected point is never a fleet's host;
- the selection is the committed selection of a burn order this view
  committed for the acting fleet, while that order is the acting fleet's
  running burn as the own-fleets read last reported it, as defined by
  *A Burn Order Committed From This View Withholds Its Quote and the Burn Command for That Selection While It Is the Fleet's Running Burn, as Last Read*,
  which also states its gap, its end and its lag.

A withheld preview is not a failed one (*A Failed or Stale Preview Is Never
Presented as a Current Quote*). The first three withheld states change what
the view requests and shows, not whether the burn command is available: that
stays governed by *Burn Command Targets Any Selected Body, Lane Gate, or Point
Uniformly*, *Running Mine Gates the Fleet Panel's Commands* and the renderer
requirements, as before. The fourth withheld state also makes the burn command
unavailable for the committed selection, and takes precedence over *Burn
Command Targets Any Selected Body, Lane Gate, or Point Uniformly* for that
selection only, as *A Burn Order Committed From This View Withholds Its Quote
and the Burn Command for That Selection While It Is the Fleet's Running Burn,
as Last Read* states.

Each withheld state is what the view last read, not what the world has since
become. Between a change in the world and the read that reports it the view
acts on its previous read: a state the view has not yet read costs at most
the preview requests sent until that read answers — the request a newly
acting fleet or a newly made selection starts with, then at most one per
elapsed refresh interval. For an acting fleet whose running-mine read has not
yet answered, or has failed with no earlier answer, the view takes no mine to
be running; a later refresh of that read that fails leaves its earlier answer
standing. Nothing is withheld merely because a read that has already answered
is being refreshed: the fourth withheld state is withheld from the acceptance
of the order that defines it until the first own-fleets read requested at or
after that acceptance has answered, because of that acceptance, and its lag is
stated by its own requirement. The mine and lane-transit suppressions are client
request-suppression rules only; they are not, and SHALL NOT be relied on as,
the server's enforcement of either state (the server's handling of a burn
ordered over a running mine is owned by `fleet-movement`; see
`docs/handoffs/defect-burn-cancels-running-mine.md`).

A preview that is withdrawn because a mine starts while it is shown SHALL
return when the mine ends, whether its ETA passes or it is cancelled, and the
same selection is still current.

When any withheld state ends and a preview is requested again for the same
acting fleet and selection, the view SHALL send that request at the
transition, not at the next refresh interval, and SHALL present no figure,
ceiling or cap taken from any request sent before the withheld state ended:
until the restoring response lands nothing from before
the withholding is shown, and a burn committed in that window is submitted
with no `maxFuelTons`.

No retry or re-quote invoked while a preview is withheld SHALL send a preview
request. The withheld states bound the re-quote of *A Burn Commit Is
Quote-Locked to the Preview the Player Agreed To*: a cap rejection that lands
while the preview is withheld requests no preview and presents no figures for
re-confirmation, and that requirement's re-quote obligation resumes with the
preview. A preview appearing, refreshing or being withdrawn SHALL NOT be
announced through a live region.

The preview SHALL refresh from a fresh server solve on a **single named
client-side interval constant, defined in exactly one place**, while it
remains shown and the selection is not the committed selection (the fourth
withheld state), so it does not drift stale against a moving target or a
changing fuel balance; and SHALL clear when the selection is cleared or
replaced, or when a burn order the acting fleet committed for that selection is
accepted from this view, from which point it is withheld for as long as that withheld state holds. No
other command takes a clear of its own: a jump is covered by the lane-transit
withheld state and a mine by the running-mine withheld state, and a cut drive
or a stop is not an order for a selection. Exactly one
fresh preview request SHALL be sent per elapsed interval while a preview is
shown, and none between — the endpoint is not free (it reads the body
table, may write an arrival settlement, and runs an N-solve stranding scan,
N bounded by the destination system's body count, per acting fleet per
player), so an unbounded or ad-hoc cadence is a real server cost, and a
refresh rate scattered across call sites is one no reviewer can price. The
constant's **value** is an open question recorded in design.md (OQ-14), not
fixed here.

#### Scenario: Selecting a target shows a preview curve and its figures
- **WHEN** a body, lane-gate body, or point becomes the selection and none
  of the withheld states of this requirement holds
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
  channel, or is in lane transit, as the view last read it
- **THEN** no preview request is sent for a newly made selection

#### Scenario: A mine that starts while a preview is shown withdraws it
- **GIVEN** a preview is shown for the current selection
- **WHEN** the view's running-mine read reports a running mine for the acting
  fleet, including a mine committed from this view once the refreshed read
  answers
- **THEN** the preview figures are removed, no further preview request is
  sent while the mine holds the channel, and the selection is unchanged

#### Scenario: A mine's completion restores the quote
- **GIVEN** no preview is requested for the held selection because a mine
  holds the movement channel
- **WHEN** the mine's ETA passes
- **THEN** a preview request is sent for the held selection

#### Scenario: A cancelled mine restores the quote
- **GIVEN** no preview is requested for the held selection because a mine
  holds the movement channel
- **WHEN** the mine is cancelled and the running-mine read answers that no
  mine is running
- **THEN** a preview request is sent for the held selection

#### Scenario: The mine suppression and the burn command's mine gate change together
- **GIVEN** a running mine holds the movement channel for the held selection
- **WHEN** the mine's ETA passes while the running-mine read still reports
  that mine
- **THEN** a preview request is sent for the held selection
- **AND** the burn command is available, both changing at the ETA rather than
  at the next read of the running-mine status

#### Scenario: A mine not yet read costs at most the requests until its read answers
- **GIVEN** a body is the current selection
- **WHEN** a different own fleet becomes the acting fleet and its running-mine
  read has not yet answered
- **THEN** no more preview requests are sent from that fleet than the one it
  starts with and one per elapsed refresh interval
- **AND** once the read answers that a mine is running, the preview figures
  are removed and no further preview request is sent from that fleet

#### Scenario: A fleet in lane transit requests no preview
- **GIVEN** an own fleet was chosen as the acting fleet while present in this
  system, and a body is the current selection with its preview shown
- **WHEN** the own-fleets read reports that fleet in lane transit
- **THEN** the preview figures are removed and no further preview request is
  sent for that selection
- **AND** the burn command's availability is unchanged

#### Scenario: A fleet docked at its selected target requests no preview
- **GIVEN** the acting fleet is attached to a station and that station's body
  is the current selection
- **WHEN** several refresh intervals elapse
- **THEN** no preview request is sent for that selection
- **AND** the selection is still the station's body
- **AND** the burn command's availability is unchanged

#### Scenario: A fleet that has left its host previews that host like any other target
- **GIVEN** the acting fleet is attached to a station and that station's body
  is the current selection
- **WHEN** the own-fleets read reports the acting fleet no longer attached to
  that station
- **THEN** a preview request is sent for the station's body and its figures
  are rendered

#### Scenario: Another body or a point is previewed while the fleet is docked
- **GIVEN** the acting fleet is attached to a station
- **WHEN** a different body, lane-gate body, or point becomes the selection
- **THEN** a preview request is sent for that selection and its figures are
  rendered

#### Scenario: A resumed preview presents nothing from before the withholding
- **GIVEN** a preview was shown for the current selection and was then
  withheld by a running mine, by lane transit, or by the selected target
  becoming the acting fleet's own host
- **WHEN** the withheld state ends and the restoring preview request is still
  pending
- **THEN** that request was sent at the transition
- **AND** no figure, ceiling or stale marking from the earlier preview is shown
- **AND** a burn committed in that window is submitted with no `maxFuelTons`

#### Scenario: A cap rejection landing while the preview is withheld re-quotes nothing
- **GIVEN** a burn commit carrying a cap is in flight and the selection then
  becomes the acting fleet's own host
- **WHEN** the commit is rejected for exceeding its cap
- **THEN** no preview request is sent
- **AND** no figures are presented for re-confirmation

#### Scenario: No path sends a preview request while one is withheld
- **GIVEN** no preview is requested because a mine holds the movement
  channel, the fleet is in lane transit, or the selected target is the fleet's
  own host
- **WHEN** a retry or a re-quote after a cap rejection is invoked
- **THEN** no preview request is sent

#### Scenario: Quote changes are not announced
- **WHEN** a preview appears, refreshes or is withdrawn
- **THEN** no live-region announcement is made for the change
- **AND** the existing landing announcements are unaffected and each fires
  once

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
  succeeded, or because the newest refresh failed — and the burn command is
  available, the burn command SHALL be labelled as uncapped before it is
  submitted, and it SHALL be submitted with no `maxFuelTons` cap. The
  absence or failure of a preview SHALL NOT of itself make the burn command
  unavailable: a transient preview failure SHALL NOT make the game's core
  verb unreachable, and a cap SHALL never be derived from a figure the view
  has already marked stale.

A preview requested again after a withheld state ends is a first preview for
this purpose: if that restoring request fails, the no-quote state is shown,
never a stale marking over figures from before the withholding.

A preview that is not requested (the withheld states of *Burn Preview
Reflects the Server-Solved Order, Without Committing*) is not a failed
preview: none of the no-quote state, stale marking or retry affordance is
shown for it. The uncapped-burn label SHALL NOT be shown while the burn
command is unavailable because there is no selection, because there is no
acting fleet, because the canvas is unavailable, because a running mine
holds the movement channel (*Running Mine Gates the Fleet Panel's Commands*),
or because the selection is the committed selection of a burn order this view
committed (*A Burn Order Committed From This View Withholds Its Quote and the Burn Command for That Selection While It Is the Fleet's Running Burn, as Last Read*). The availability of the burn
command in the first four of those states is governed, unchanged, by the
requirements that already cover each of them; in the fifth it is governed by
that requirement.

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
- **GIVEN** no other requirement makes the burn command unavailable
- **WHEN** the current selection has no successful, current preview
- **THEN** the burn command remains available, is labelled as uncapped before
  submission, and is submitted with no `maxFuelTons` field

#### Scenario: A stale figure never becomes a cap
- **WHEN** a burn is committed while the displayed preview figures are marked
  stale
- **THEN** no `maxFuelTons` is sent, and the stale fuel figure is not used as
  a cap

#### Scenario: A failed restoring request is a no-quote state, not a stale one
- **GIVEN** a preview was shown for the current selection and was then
  withheld, and the withheld state has ended
- **WHEN** the restoring preview request fails
- **THEN** the no-quote state is shown with no figure from the earlier preview
- **AND** no stale marking is shown
- **AND** a retry affordance is offered

#### Scenario: A withheld preview is never presented as a failed one
- **GIVEN** no preview is requested because a mine holds the movement
  channel, the fleet is in lane transit, or the selected target is the fleet's
  own host
- **WHEN** the command surface is rendered for that selection
- **THEN** no no-quote state, stale marking or retry affordance is shown

#### Scenario: The uncapped-burn label is never shown beside an unavailable burn command
- **WHEN** the burn command is unavailable because there is no selection,
  because there is no acting fleet, because the canvas is unavailable, or
  because a running mine holds the movement channel
- **THEN** no uncapped-burn label is shown

### Requirement: Burn and Jump Commit Controls Guard Against Double-Submit
The burn command control and the jump command control SHALL each be disabled
from the moment of commit until that request settles or fails, so a
double-click or repeated-Enter cannot submit two orders. The guard SHALL take
effect synchronously, within the same invocation that submits the request,
and SHALL NOT depend on a pending-state flip that only reaches the control's
`disabled` attribute on a later render — two activations a tick apart both
reach the handler before any re-render, so a render-dependent guard does not
exist at the moment it is needed.

The guard's release is not the control's return to availability. Once the
request has settled or failed, whether the burn command is available for the
selection is governed by the other requirements that bear on it, including
*A Burn Order Committed From This View Withholds Its Quote and the Burn Command for That Selection While It Is the Fleet's Running Burn, as Last Read*, under which the control stays
unavailable for the selection a burn order was just accepted for. A failed
commit creates no such state.

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
- **GIVEN** no other requirement makes the command unavailable for the
  selection
- **WHEN** a burn or jump commit settles or fails and the player then
  initiates a new command
- **THEN** the guard has been released and the new attempt submits normally

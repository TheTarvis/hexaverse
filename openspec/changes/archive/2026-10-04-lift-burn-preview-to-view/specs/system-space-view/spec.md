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
an acting fleet and none of the three withheld states below holds. In
particular a preview SHALL be requested while the acting fleet is
**burning**: re-targeting mid-flight is an ordinary commit against the
fleet's live tangent, it is the most consequential order in the game, and
offering the commit while withholding the quote would remove the preview from
the decision that most needs one.

The view SHALL NOT request a preview in any of three withheld states, each
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
  target. A selected point is never a fleet's host.

A withheld preview is not a failed one (*A Failed or Stale Preview Is Never
Presented as a Current Quote*). The withheld states change what the view
requests and shows, not whether the burn command is available: that stays
governed by *Burn Command Targets Any Selected Body, Lane Gate, or Point
Uniformly*, *Running Mine Gates the Fleet Panel's Commands* and the renderer
requirements, as before.

Each withheld state is what the view last read, not what the world has since
become. Between a change in the world and the read that reports it the view
acts on its previous read: a state the view has not yet read costs at most
the preview requests sent until that read answers — the request a newly
acting fleet or a newly made selection starts with, then at most one per
elapsed refresh interval. For an acting fleet whose running-mine read has not
yet answered, or has failed with no earlier answer, the view takes no mine to
be running; a later refresh of that read that fails leaves its earlier answer
standing. Nothing is withheld merely because a read that has already answered
is being refreshed. The mine and lane-transit suppressions are client
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
acting fleet, because the canvas is unavailable, or because a running mine
holds the movement channel (*Running Mine Gates the Fleet Panel's Commands*).
The availability of the burn command in those states is governed, unchanged,
by the requirements that already cover each of them.

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

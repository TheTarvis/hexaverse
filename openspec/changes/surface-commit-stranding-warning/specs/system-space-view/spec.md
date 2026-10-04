## ADDED Requirements

### Requirement: A Burn Commit's Stranding Warning Stays Visible While That Order Is the Fleet's Running Burn, as Last Read
The system SHALL, when a burn order committed from the system space view is
accepted and the accepting response carries the stranding warning set true,
show a notice on that view saying the committed course leaves the fleet unable
to reach a station or lane gate, alongside — never in place of — the commit's
own success feedback (`fleet-roster`'s *A Burn Commit's Stranding Warning Is
Surfaced to the Player*), and SHALL keep that notice for as long as that order
is that fleet's running burn, **as the own-fleets read last reported it**. The
view knows the world only through reads, so every clause below is stated
against reads and never against world truth.

**The order's identity.** The order a commit created is identified by the two
integers its response's burn carries — the served departure instant and the
served arrival instant — held for the fleet the command was invoked for. "That
order is still that fleet's running burn" means: the own-fleets read's entry
for that fleet is in burn mode and its burn's departure instant and arrival
instant both equal the response's. No target comparison, no action identifier
and no read beyond the own-fleets read is used.

**The gap.** From the acceptance until the first own-fleets read requested at
or after the acceptance has answered, the order SHALL be taken to be running:
the cached read still describes the fleet as it was before the order, and
reading that as "not running" would remove the warning the instant it
appeared. A read requested before the acceptance and answered after it
describes the fleet as it was before the order and SHALL NOT end the gap. A read that fails answers
nothing. IF an own-fleets read requested at or after the acceptance fails, THEN
the gap continues and the notice stays, beside the view's existing fleets-error
notice and its retry, until a read answers: the accepting response is then the
most recent statement the view holds about that fleet. A read that fails after
the gap has ended likewise leaves the last answer, and so the notice, standing.

**The end.** The notice SHALL be removed, with no user action and no selection
change, at the first own-fleets read requested at or after the acceptance that
answers without reporting that order as that fleet's running burn. That covers
every way an order stops being running: the drive was cut (the fleet drifting
with no burn); a stop above the speed floor (a different burn, with its own
instants); a stop at or below the floor (the fleet parked at a point); arrival
at a body (the fleet parked and attached to it); arrival at a point (the fleet
parked, attached to nothing); and a different order placed from this view or
from elsewhere, including one toward the same target (a burn whose instants
differ). The order's end is read-only: the view's projected clock passing the
order's arrival instant does not end the notice while the last read still
reports that order as running.

**The lag.** A change this view causes by cutting the drive or stopping is
known one own-fleets round trip after that command's response. Once a read has reported
the order running, an arrival is known at the first read that reports it, which
the view requests shortly after the order's served arrival instant; if no read
has yet reported the order running, the next read is the baseline poll or the
player's retry. A change made elsewhere is known at the
first read that reports it, requested no later than the view's next baseline
poll. Any further refresh trigger the view has only shortens those waits. Each
assumes the read it names answers and reports the change: a read that fails,
and a read that still reports the order as running after its arrival instant,
each leave the notice in place until a later read reports the change. Until
then the view acts on its previous read, and the notice outlasts the order by
exactly that wait.

**Whose notice.** The notice belongs to the fleet that committed, the fleet the
command was invoked for, not the one acting when the response landed. Notices
are per fleet: the view SHALL show a fleet's notice only while that fleet is
the acting fleet, whatever is selected, and SHALL show it again on the switch
back to that fleet while its order still runs; one fleet's commit SHALL NOT
remove another fleet's notice; and a fleet's later accepted burn commit ends
that fleet's earlier notice at that acceptance, whether or not the later
response carries the warning.

**When there is no notice.** A rejected or failed commit shows no notice and
leaves any earlier order's notice as it was, so that notice follows its own lifetime. A
response without the stranding field shows none; the served field is omitted
when the condition does not hold, not sent false, and a response carrying it
set false is treated the same.

**What the notice is.** It is advisory — the order succeeded — so it SHALL NOT
use the error styling or the error toast of a rejected command and SHALL be
distinct from the preview's own stranding line, which is unchanged by this
requirement and may be shown at the same time. It SHALL NOT depend on a preview
being shown, requested or current. It is placed below the burn command control
in the command panel, is not dismissible (its only end is the order's), and its
appearing or removal SHALL NOT remove, disable or re-order the burn command
control. It is static text in the view's reading order: it adds no text to the view's
live-region announcement and causes no announcement of its own, so that
announcement is whatever it would be without the notice (a landed arrival read
that removes the notice still announces its landing, per *A Landed Resolution Is
Announced to Assistive Technology*). The warning SHALL
be conveyed to assistive technology once per accepted warned response, at that
acceptance, by one advisory (warning, not error) toast shown in addition to the
success feedback
and independent of which fleet is acting when the response lands; the notice's
later removal, its return on a switch back to the fleet, and read refreshes
SHALL NOT cause any further toast or announcement of their own. The notice's text and the
toast's text are player-facing, name both stations and lane gates, never use the
word "strand", and carry no raw server text and no figure; the notice's text
also tells the player to place a different order. It renders no figure.

**Reload and remount.** A notice exists only in the open view. After a reload
or a remount of the view no notice is shown for an order committed before it,
because no commit response is in hand; what the player sees instead is whatever
the reads carry, in particular `fleet-roster`'s persistent stranded indication
on the fleet's roster row (*The Roster Row Shows a Persistent Stranded
Indication*), which this requirement neither computes nor duplicates.

#### Scenario: A warned commit shows the notice with the success feedback
- **GIVEN** a parked own fleet is acting and a body is selected
- **WHEN** a burn commit is accepted with a response carrying the stranding warning set true
- **THEN** the success feedback is shown
- **AND** the stranding notice is shown, not styled or announced as an error

#### Scenario: The notice is shown before any read has answered after the acceptance
- **GIVEN** a burn commit accepted with the warning, its response's burn departing at 1000 and arriving at 61000
- **AND** the first own-fleets read after the acceptance has not answered, the cached read still describing the fleet as parked
- **WHEN** the view renders
- **THEN** the stranding notice is shown

#### Scenario: A read begun before the commit and answered after it does not end the gap
- **GIVEN** an own-fleets read requested before the acceptance and not yet answered
- **AND** a burn commit accepted with the warning, its response's burn departing at 1000 and arriving at 61000
- **WHEN** that earlier read answers describing the fleet as parked
- **THEN** the stranding notice is still shown
- **AND** when the first read requested after the acceptance answers with the fleet burning 1000 to 61000 the notice is still shown

#### Scenario: A read reporting the same burn keeps the notice
- **GIVEN** a burn commit accepted with the warning, departing at 1000 and arriving at 61000
- **WHEN** an own-fleets read answers with that fleet in burn mode, departing at 1000 and arriving at 61000, and a later poll answers the same
- **THEN** the stranding notice is shown after each answer
- **AND** it is shown whether the selection is the committed target, a different body, or empty

#### Scenario: The projected clock passing the arrival does not end the notice
- **GIVEN** the last own-fleets read reports the committed burn, arriving at 61000
- **WHEN** the view's projected world time passes 61000 with no further read answered
- **THEN** the stranding notice is still shown

#### Scenario: Cutting the drive ends the notice
- **GIVEN** the notice is shown for the acting fleet's order
- **WHEN** the drive is cut from the fleet panel and the refreshed own-fleets read reports the fleet drifting with no burn
- **THEN** the stranding notice is removed
- **AND** no selection was changed
- **AND** no further advisory toast is shown

#### Scenario: A stop ends the notice, above or at the speed floor
- **GIVEN** the notice is shown for the acting fleet's order
- **WHEN** a stop is commanded and the refreshed read reports, in one arrangement, a different burn whose instants are 70000 and 90000, and in the other, the fleet parked at a point with no burn
- **THEN** in each arrangement the stranding notice is removed

#### Scenario: Arrival at a body ends the notice
- **GIVEN** the notice is shown for an order toward a body
- **WHEN** the next own-fleets read reports the fleet parked and attached to that body
- **THEN** the stranding notice is removed

#### Scenario: Arrival at a point ends the notice
- **GIVEN** the notice is shown for an order toward a point
- **WHEN** the next own-fleets read reports the fleet parked and attached to nothing
- **THEN** the stranding notice is removed

#### Scenario: A different order placed elsewhere ends the notice, toward the same target or another
- **GIVEN** the notice is shown for the order departing at 1000 and arriving at 61000, a read having reported that order running
- **WHEN** a later own-fleets read answers with that fleet burning to a different target, departing at 5000 and arriving at 80000
- **THEN** the stranding notice is removed
- **AND** the same holds when the read's burn targets the same body as the committed order but departs at 5000 and still arrives at 61000

#### Scenario: An order that settled inside the commit round trip never shows past the first read
- **GIVEN** a burn commit accepted with the warning
- **WHEN** the first read requested after the acceptance answers with the fleet parked and attached to the target
- **THEN** the stranding notice is shown until that read answers
- **AND** it is removed when that read answers

#### Scenario: A failed read never removes the notice
- **GIVEN** a burn commit accepted with the warning, departing at 1000 and arriving at 61000, and the cached read describing the fleet as parked
- **WHEN** the first own-fleets read requested after the acceptance fails
- **THEN** the stranding notice is still shown
- **AND** the view's existing fleets-error notice and retry are shown
- **AND** when a later read answers with the committed burn's instants the notice is still shown
- **AND** when a read after that fails the notice is still shown
- **AND** when a later read answers with the fleet parked and no burn the notice is removed

#### Scenario: The notice follows the acting fleet and returns on the switch back
- **GIVEN** fleet A's commit was accepted with the warning and fleet B is also here
- **WHEN** fleet B is made the acting fleet
- **THEN** no stranding notice is shown
- **AND** when fleet A is made the acting fleet again while the last read still reports A's order running, the stranding notice is shown
- **AND** no further advisory toast is shown by either switch

#### Scenario: A response that lands after the acting fleet changed belongs to the fleet that committed
- **GIVEN** the burn command was invoked for fleet A, and fleet B is made acting before the response lands
- **WHEN** the response carrying the warning lands
- **THEN** the advisory toast is shown
- **AND** no stranding notice is shown while B is acting
- **AND** the notice is shown when A is made acting again

#### Scenario: Each fleet keeps its own notice
- **GIVEN** fleet A's order has a notice, and fleet B then commits a burn accepted with the warning
- **WHEN** fleet A is made the acting fleet again while both orders still run
- **THEN** the stranding notice is shown for A

#### Scenario: A later commit by the same fleet replaces the earlier notice
- **GIVEN** fleet A's order has a notice
- **WHEN** fleet A's next burn commit is accepted with no stranding field in its response
- **THEN** no stranding notice is shown
- **AND** the earlier order's notice does not return when a read still reports the earlier order's instants

#### Scenario: A second warned commit by the same fleet replaces the notice and raises its own warning
- **GIVEN** fleet A's order departing at 1000 and arriving at 61000 has a notice, a read having reported it running
- **WHEN** A's next burn commit is accepted with the warning, its response's burn departing at 5000 and arriving at 80000
- **THEN** the stranding notice is shown, and a second advisory toast is shown, two in total
- **AND** when a read reports the second order's instants the notice is still shown
- **AND** when a later read stops reporting the second order running the notice is removed

#### Scenario: A rejected or failed commit shows no notice and leaves an earlier one alone
- **GIVEN** fleet A's order has a notice
- **WHEN** a second burn commit by A is rejected, in one arrangement as a cap rejection and in another as a failure with no mapped reason
- **THEN** the error feedback for that commit is shown
- **AND** no new stranding notice appears
- **AND** the earlier order's notice is still shown while the last read reports it running

#### Scenario: A response without the stranding field shows no notice
- **WHEN** a burn commit is accepted with a response that omits the stranding field entirely
- **THEN** the success feedback is shown
- **AND** no stranding notice and no advisory toast are shown
- **AND** the same holds when the response carries the field set false

#### Scenario: The success feedback is not suppressed by the notice
- **WHEN** a burn commit is accepted with the warning
- **THEN** the success feedback naming the order's served arrival is shown exactly once
- **AND** the stranding notice and one separate advisory toast are shown in addition to it

#### Scenario: The warning is conveyed once, at the acceptance
- **WHEN** a burn commit is accepted with the stranding warning set true
- **THEN** one advisory toast conveying the warning is shown, in addition to the success feedback and not styled as an error
- **AND** its text names both stations and lane gates, contains no digit and does not contain the word "strand"

#### Scenario: The notice is advisory and distinct from the preview's stranding line
- **GIVEN** the notice is shown and the preview is also shown with its own stranding line
- **WHEN** both elements are rendered
- **THEN** the notice and the preview's line are two separate elements
- **AND** the notice carries none of the error treatment a rejected command carries
- **AND** the burn command control is still present and precedes the notice
- **AND** the notice offers no dismiss control
- **AND** the view's live-region text is unchanged when the notice appears and when it is removed by cutting the drive

#### Scenario: The notice does not depend on the preview
- **GIVEN** the notice is shown
- **WHEN** the preview is in its no-quote state, its stale state, or not requested
- **THEN** the stranding notice is still shown

#### Scenario: The notice's copy names stations and lane gates and carries no wire text
- **WHEN** the notice is shown
- **THEN** its text contains, case-insensitively, both "station" and "lane gate"
- **AND** it contains no digit and does not contain the word "strand" or "stranded"
- **AND** it tells the player to place a different order
- **AND** its text is the same whatever the response and the read contain

#### Scenario: A reload shows no notice and leaves the persistent indication to the roster
- **GIVEN** an order committed with the warning is still the fleet's running burn
- **WHEN** the view is remounted
- **THEN** no stranding notice is shown
- **AND** the roster row shows the stranded indication if and only if the own-fleets read reports it set true

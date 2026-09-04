# sighting-log Specification

## Purpose
TBD - created by archiving change add-scan-and-sightings-surface. Update Purpose after archive.
## Requirements
### Requirement: The Sighting Log Lists the Corporation's Own Pile in Served Order
The system SHALL present the requesting corporation's sighting pile as a list,
one row per served record, in the order the server returned them, and SHALL NOT
re-sort them client-side — the pile is ordered by each record's `asOf`, the
instant the light left, which is not the order the claims were filed, so a
client re-sort would silently assert a different ordering than the one the
server's pagination is built on.

Each row SHALL show the record's system, its `asOf`, and the **raw host id** of
the host that was swept. The raw id is the label, not a fallback from one: no
wire surface in this codebase serves a name for a body or for a fleet, so there
is nothing for the row to prefer and nothing for it to fall back from. The row
SHALL NOT present the id as degraded — no placeholder text, no empty cell, no
"unknown host", no styling that marks it as missing information.

This is deliberately **unlike** the system column (*An Unknown System Name Falls
Back to Its Id*), and the difference is the reason both rules are stated. A
system's name is served, and is only occasionally unresolvable, so that column
genuinely falls back. A host's name is served by nothing, so a host column with
a name path would specify a branch that no response can take and no test can
induce without mocking a shape the server does not produce.

A row for a record that names a target SHALL show that target's hull count and
the hull types present. A row for a clean-sweep record SHALL instead show a
clean-sweep marker and no composition, because the sweep found nothing masked
at that host — itself a filed claim, not an absence of one.

#### Scenario: Rows render in the served order
- **WHEN** the pile read returns records
- **THEN** the log renders one row per record, in the order the response listed
  them, with no client-side re-sorting

#### Scenario: A composition row shows hulls
- **WHEN** a served record names a target
- **THEN** its row shows the record's system, `asOf`, swept host, hull count,
  and hull types

#### Scenario: The swept host is shown as its raw id, whatever the host is
- **GIVEN** records whose swept hosts are a planet, a moon, a belt, a lane gate,
  a trading station, a fleet, and a host in a system other than the open one
- **WHEN** their rows are shown
- **THEN** every row shows the swept host as its raw host id
- **AND** no row carries a placeholder, an empty cell, or a degraded-state
  indication on the host column

#### Scenario: A clean-sweep row shows the clean-sweep marker
- **WHEN** a served record is a clean sweep
- **THEN** its row shows a clean-sweep marker and no hull count or hull types
- **AND** it still shows the system, `asOf`, and swept host

### Requirement: A Log Row Names No Owner
The system SHALL NOT display an owner, corporation, or fleet identity for a
sighted target on any log row, and SHALL NOT infer one from the record's
contents. The record carries none: composition is the rung a scan buys, and
owner identity is on no rung of this model's information ladder — attribution
is a read the player makes or buys, never one this surface performs.

#### Scenario: A row shows composition but no identity
- **WHEN** a row for a target-naming record is shown
- **THEN** it displays hull count and hull types
- **AND** it displays no owner name, corporation, or fleet id for the target

### Requirement: An Unknown System Name Falls Back to Its Id
WHEN a record's system id has no corresponding name in the loaded galaxy data,
the system SHALL show the raw system id on that row rather than failing to
render the row — the same fallback `fleet-roster` already applies to a fleet's
where label.

#### Scenario: A record in an unnamed system still renders
- **WHEN** a record's system id has no corresponding name in the loaded galaxy
  data
- **THEN** its row shows the raw system id and renders normally

### Requirement: The Log Pages Through the Pile With the Server's Own Cursor
The system SHALL request each further page of the pile with the continuation
cursor the previous response returned, passed back verbatim, and SHALL NOT
parse, rewrite, or construct a cursor of its own — the cursor is opaque by the
server's own statement, and a client that builds one is a client that breaks
when its encoding changes. The system SHALL offer a load-more affordance only
while the last response returned a non-empty cursor, and loading a further page
SHALL append its rows to those already shown rather than replacing them.

#### Scenario: Load-more sends the served cursor verbatim
- **WHEN** the player loads a further page
- **THEN** the request carries the previous response's continuation cursor
  unchanged

#### Scenario: A further page appends rather than replaces
- **WHEN** a further page is loaded
- **THEN** its rows are appended below the rows already shown, and the earlier
  rows remain

#### Scenario: An empty cursor ends the pile
- **WHEN** a response returns an empty continuation cursor
- **THEN** no load-more affordance is offered

#### Scenario: The client never constructs a cursor
- **WHEN** any page of the pile is requested
- **THEN** every cursor sent originated verbatim from a server response, and none
  is assembled, parsed, or modified by the client

### Requirement: The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer
The system SHALL read the pile when the log mounts, after the space view's
post-sweep settle refetch has completed (*A Running Sweep Self-Schedules the
Refetch That Settles It, Then Reads the Inbox and the Pile*), and when the
player explicitly refreshes. It SHALL NOT poll the pile on a timer.

**The mount read obeys the same ordering as the post-ETA one.** IF the log
mounts while any of the corporation's own fleets in the open system has a sweep
whose ETA has already passed and which has not yet settled, THEN the log's
first pile read SHALL be issued only after the space view's interior read that
settles that sweep has completed. This is the likelier form of the same race
the post-ETA ordering guards: a sweep whose ETA passed while the view was
closed settles on the *open*, and a mount-time pile read issued alongside that
opening interior read returns before the records exist — showing an empty log
for a sweep that worked, with nothing scheduled to correct it.

A timer poll is refused for a narrower reason than "nothing else can change the
pile", which is false: `action`'s resolve fold is keyed on an action's scope
and its actor, not on the reading corporation, so another corporation's read of
the same system settles your due sweep, and the periodic action sweep settles
it on a cadence with no reader at all. What is true is that every record so
minted is the effect of a sweep **this corporation committed**, whose ETA this
view already knows and already schedules a refetch for. A poll would therefore
re-read the pile repeatedly to catch records that arrive only at instants the
client can name in advance.

#### Scenario: The log does not poll while open
- **GIVEN** the log is open with no sweep running
- **WHEN** world time advances across any number of the view's own poll
  intervals
- **THEN** no further pile read is issued

#### Scenario: The log refetches after a sweep settles
- **WHEN** the space view's post-sweep settle refetch completes
- **THEN** the pile is read again and any newly minted records appear

#### Scenario: A mount during an unsettled past-ETA sweep reads the pile after the settling read
- **GIVEN** an own fleet in the open system has a sweep whose ETA has passed
  and which has not yet settled
- **WHEN** the log mounts and the space view's interior read settles that sweep
- **THEN** the log's first pile read is issued only after that interior read
  has completed, and the settled sweep's records are present in it

#### Scenario: An explicit refresh reads the pile
- **WHEN** the player invokes the log's refresh affordance
- **THEN** the pile is read again

### Requirement: The Log's Empty, Loading, and Failed States Are Each Explicit
The system SHALL show a loading state while the pile read is in flight; an
explicit empty state, naming the focused scan as the way a record is filed, when
the read succeeds with no records; and a retriable error state carrying the
underlying error message when one is available, when the read fails. A failed
read SHALL NOT be presented as an empty pile — the two are opposite facts and a
player who cannot tell them apart cannot tell a broken client from a quiet one.

#### Scenario: A pile read in flight shows a loading state
- **WHEN** the pile read has not yet returned
- **THEN** the log shows a loading state

#### Scenario: An empty pile is stated, with the way to fill it
- **WHEN** the pile read succeeds and returns no records
- **THEN** the log shows an explicit empty state naming the focused scan as the
  way to file a record

#### Scenario: A failed pile read is retriable and never reads as empty
- **WHEN** the pile read fails
- **THEN** the log shows an error state carrying the underlying message when
  available, with a retry affordance
- **AND** it does not show the empty state

### Requirement: The Log Is Reachable From the System Space View Without Leaving It
The system SHALL provide, on the system space view, an affordance that opens the
sighting log, and opening or closing the log SHALL NOT navigate away from the
open system: the space view stays mounted and its acting-fleet selection is
preserved across both. A ghost drawn in the scene and the row that describes it
are two halves of one reading, and a log that costs the player the view they are
reading it against is a log they will not open.

#### Scenario: The log is opened from the space view
- **WHEN** the player invokes the space view's sighting-log affordance
- **THEN** the sighting log is shown

#### Scenario: Opening the log keeps the view and its acting fleet
- **WHEN** the log is opened from the system space view
- **THEN** the space view remains mounted and its acting-fleet selection is
  unchanged

#### Scenario: Closing the log returns to the view intact
- **WHEN** the log is closed
- **THEN** the space view is shown with the same acting fleet selected as before
  the log was opened

### Requirement: A Log Row and Its Ghost Address the Same Record By Its Served Id
WHEN a log row whose record has a ghost drawn in the open system is selected,
the system SHALL highlight that ghost in the scene; WHEN a ghost whose record
has a row loaded in the log is activated in the scene, the system SHALL
highlight that row. Both directions SHALL match
on the record's served `id` and on nothing else — never on position, `asOf`,
host, or composition, any of which two records can legitimately share.

A selected row whose record has **no ghost currently drawn** SHALL be reported
as having no mark in the open system, and SHALL highlight nothing. That is not
a two-case exception; the log SHALL determine it from what the scene actually
drew rather than from a list of reasons, because this change creates several
and a row that assumes a mark exists either does nothing or dereferences a
missing one. The record may belong to another system; it may be a clean sweep,
which names no target and carries no position; it may fall outside the ghost
layer's single bounded page (*A Sighting Ghost Renders at Its Frozen Position,
Never a Predicted One*), the log paging further than the layer does; its stored
position may be exactly the origin, which the scene omits (*A Ghost at the
Origin Is Omitted From the Scene, Not Drawn Atop the Star*); or the canvas
region may be unavailable, in which case no ghost is drawn at all (*The Scan
Surface Remains Usable While the Canvas Is Unavailable*) while the log stays
fully readable.

**The other direction has its own missing case, for the opposite reason.** WHEN
a ghost is activated whose record has **no row currently loaded**, the ghost's
own highlight SHALL still apply in the scene, no row SHALL be highlighted, and
the log SHALL NOT page further to find it. The two surfaces read the same pile
through different windows: the ghost layer reads it filtered to the open system
and draws one bounded page (*A Sighting Ghost Renders at Its Frozen Position,
Never a Predicted One*), while the log reads it unfiltered and pages on demand,
so a corporation that has swept other systems more recently can have a drawn
ghost whose record sits below every page the log has loaded — and the log may
not be open at all. Paging to close that gap would let a scene interaction
issue an unbounded run of reads, so the scene interaction SHALL remain complete
in itself.

#### Scenario: Selecting a row highlights its ghost
- **WHEN** a row whose record has a ghost drawn in the open system is selected
- **THEN** that record's ghost is highlighted in the scene

#### Scenario: Activating a ghost highlights its loaded row
- **WHEN** a ghost whose record has a row among the pages the log has loaded is
  activated in the scene
- **THEN** the log row for that record is highlighted

#### Scenario: Two records with identical contents highlight independently
- **GIVEN** two records from one sweep whose stored position, `asOf`, host, and
  composition are identical
- **WHEN** each row is selected in turn
- **THEN** each highlights its own ghost, matched by the record's served `id`

#### Scenario: Activating a ghost whose row is not loaded highlights the ghost alone
- **GIVEN** a ghost drawn for a record that lies below every page of the pile
  the log has loaded, or the log is not open
- **WHEN** that ghost is activated in the scene
- **THEN** the ghost is highlighted in the scene and no row is highlighted
- **AND** no further page of the pile is requested

#### Scenario: A row with no ghost says so, whatever the reason
- **WHEN** a row is selected whose record has no ghost drawn — a clean sweep, a
  record in another system, a record beyond the ghost layer's single page, a
  record whose stored position is the origin, or any row while the canvas
  region is unavailable
- **THEN** the log states that this record has no mark in the open system, and
  no unrelated mark is highlighted
- **AND** the row's own contents render normally in every one of those cases


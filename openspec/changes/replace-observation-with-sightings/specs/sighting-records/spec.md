## Purpose
Owns the persisted sighting pile — the one deliberate exception to
`proximity-disclosure`'s "live disclosure persists nothing." A sighting is
an immutable, stamped historical claim minted only by a resolving focused
scan, readable later by the corporation that holds it, sellable in a future
change, and never itself an input to a live disclosure decision. The narrow
rule this capability exists to keep unbreakable: no stored record may be
consulted to decide live disclosure.

## ADDED Requirements

### Requirement: A Sighting Is Minted Only By a Resolving Sweep
The system SHALL mint a sighting record only as the effect of a focused-scan
action resolving. No read path, no live passive-proximity or plume
disclosure evaluation, and no burn or lane-transit resolution SHALL mint a
sighting. Passive contact with a foreign fleet, however close or however
long sustained, mints nothing on its own: only a committed, resolved sweep
files a claim.

#### Scenario: Reading the pile mints nothing
- **WHEN** a corporation reads its sighting pile or a system's interior
- **THEN** no new sighting record is created as a side effect of that read

#### Scenario: Sustained passive proximity mints no sighting
- **GIVEN** a foreign fleet continuously within an observer's live detection
  range for an extended interval
- **WHEN** that proximity is evaluated at any world time, by any number of
  reads
- **THEN** no sighting record is minted for that foreign fleet

#### Scenario: A burn resolution mints no sighting
- **WHEN** a fleet's burn resolves into a park near a foreign fleet, or a
  lane-transit trip resolves into a system where a foreign fleet is present
- **THEN** no sighting record is minted for that encounter by the
  resolution itself

### Requirement: A Sighting Is Immutable and Never Expires
The system SHALL treat a minted sighting record as permanent: no code path
SHALL update, delete, or otherwise invalidate a sighting as the world state
it describes changes. A sighting record has no expiry and no time-based
removal.

#### Scenario: A sighting still reports its minted position after the target moves
- **GIVEN** a sighting record minted for a target at a given position
- **WHEN** the sighted fleet has since moved elsewhere in the world
- **THEN** the record still reports the position it was minted with

#### Scenario: No field of a sighting changes after it is minted
- **GIVEN** a sighting record read at two different times after it was
  minted
- **WHEN** its fields are compared between the two reads
- **THEN** every field is identical

#### Scenario: There is no update or delete path
- **WHEN** the sighting-records package's public surface is inspected
- **THEN** it exposes no function that updates, invalidates, or deletes an
  existing sighting record

### Requirement: A Sighting Is Minted In the Resolve Transaction, Exactly Once
The system SHALL mint a sighting only from inside the focused-scan action's
resolve transaction, as part of the resolver's returned effect, applied
atomically with the action's status flip to `done`. Each minted record's
document path SHALL be a deterministic function of the resolving action's
id and the sighted target's id (or, for a clean sweep, the resolving
action's id alone), so that a retried resolve transaction converges on the
same document rather than minting a duplicate.

#### Scenario: A sighting's document id is deterministic
- **WHEN** a focused scan resolves and mints a sighting for a target
- **THEN** the record's document path is derived solely from the resolving
  action's id and the target's id

#### Scenario: A retried resolve converges instead of duplicating
- **GIVEN** a resolve transaction that mints a sighting and then loses to
  contention before committing
- **WHEN** the resolve transaction is retried and commits
- **THEN** exactly one sighting record exists at that deterministic path,
  not two

#### Scenario: The mint is never a separate write after the transaction
- **WHEN** a focused scan's resolver produces its effect
- **THEN** every sighting it mints is included in the same transaction that
  flips the action to `done`
- **AND** no sighting for that resolution is written by a call outside that
  transaction

### Requirement: A Sighting Is Readable Only By the Corporation That Holds It
The system SHALL serve a corporation's sighting pile only to that same
corporation's own authenticated requester, through a read endpoint scoped
to the caller's corporation. No endpoint SHALL serve one corporation's
sighting records to a different corporation.

#### Scenario: A corporation reads its own pile
- **WHEN** an authenticated requester reads the sighting pile for their own
  corporation
- **THEN** the records minted for that corporation are returned

#### Scenario: A corporation cannot read another corporation's pile
- **WHEN** an authenticated requester attempts to read the sighting pile
  belonging to a corporation other than their own
- **THEN** no record belonging to the other corporation is returned

### Requirement: A Sighting Carries Its Own Provenance
The system SHALL stamp every minted sighting record with the minting
corporation, the resolving sweep's action id, the world time the pulse
reached the target (`asOf`), and the id of the system the sighting was
minted in — a position with no system is not resolvable to a place. The
sighted target's own id SHALL be stored on the record but SHALL NOT be
included in the record's wire representation; the record's subject stays a
stored correlation key, never a dereferenceable handle a client can read.
A composition-bearing sighting (one naming a target, as opposed to a clean
sweep) SHALL also carry the frozen kinematic and composition payload the
resolving sweep computed: the target's position and velocity at `asOf`,
whether it was emitting, its hull count, and the hull types present —
without this payload the record is a provenance stub that cannot answer
the question the pile exists to answer ("I saw that fleet parked at
`x,y,z` in Alpha Gamma at world time `T`").

#### Scenario: A minted sighting carries its system
- **WHEN** a sighting is minted for a target inside a system
- **THEN** the stored record includes the id of that system

#### Scenario: A minted sighting carries its provenance fields
- **WHEN** a sighting is minted
- **THEN** the stored record includes the minting corporation, the
  resolving sweep's action id, and the `asOf` world time

#### Scenario: A minted sighting carries its kinematic and composition payload
- **WHEN** a sighting naming a target is minted
- **THEN** the stored record includes the target's position and velocity at
  `asOf`, whether it was emitting, its hull count, and its hull types

#### Scenario: The target id is stored but never serialized to the client
- **GIVEN** a sighting record minted for a specific target
- **WHEN** that record is served over the read endpoint
- **THEN** the response contains no field identifying the target by id
- **AND** the target id remains present on the stored document

### Requirement: A Sighting Is Never Consulted To Decide Live Disclosure
No stored sighting record SHALL be read, cached, or otherwise consulted as
an input to any live disclosure decision — not only a `proximity-disclosure`
predicate itself, but also the assembly or filtering of a response's
contact set, or any aggregate computed over that set, wherever in the
codebase that assembly happens to live. Holding a sighting for a target
changes nothing about whether that target is live-disclosed; the two are
decided by entirely separate mechanisms, and this rule is stated here as
well as in `proximity-disclosure` because the failure mode it guards
against — a later implementer adding a "we already saw this one, so keep it
in `contacts`" shortcut at the point where a system's interior response is
assembled, rather than inside `disclosure` itself — sits on this
capability's side of the boundary and would not be caught by
`disclosure/purity_test.go`'s import allow-list, since that test constrains
only `disclosure`'s own imports, not the packages that assemble a live
response around it. Enforcement is a compile-time import check: no package
that constructs a `contacts` response element — currently `system` alone
— SHALL import `sightings`. `fleet` is deliberately not on this list: it
is where the focused-scan resolver that mints sighting records lives
(`focused-scan`'s resolution requirement), and minting a record from
inside a resolve transaction is not assembling a live-disclosure response
— `fleet`'s own read endpoints compute no partial-visibility snapshot of a
foreign fleet and never will (`fleet-movement`'s "Fleet Read Endpoints
Serve Own Fleets In Full and Foreign Fleets As Contacts"), so `fleet` is
not, and cannot become, a package this rule needs to constrain. This is a
description of "packages that assemble a `contacts` response," not a
hand-maintained enumeration to keep in sync by hand — task 7.5's inventory
of the hand-maintained-list species names it as a seventh instance for
exactly this reason.

#### Scenario: Holding a sighting does not disclose its target live
- **GIVEN** a corporation holding a sighting record for a target minted at
  an earlier world time
- **WHEN** that target is outside every live detection channel at the
  current world time
- **THEN** the target is not live-disclosed
- **AND** the sighting record remains readable as a historical claim

#### Scenario: A sighting for a target now out of range is absent from contacts
- **GIVEN** a corporation holding a sighting record for a target minted at
  an earlier world time
- **WHEN** that corporation reads a system interior whose `contacts` array
  is assembled, and the target is now outside every one of the
  corporation's own fleets' detection ranges
- **THEN** the target is absent from the returned `contacts` array
- **AND** no field of the response reflects that a sighting for it exists

#### Scenario: No live-disclosure-assembly package imports sightings
- **WHEN** the import graph of every package that constructs a `contacts`
  response element (currently `system` alone) is inspected
- **THEN** none of them imports `sightings`
- **AND** `fleet`, which imports `sightings` to mint records from its
  focused-scan resolver, is not part of this check — minting a record
  inside a resolve transaction is not assembling a disclosure response

### Requirement: A Clean Sweep Is a Record
The system SHALL mint a sighting record for a focused scan that resolves
against a host with nothing masked at it, distinguished from a
composition-bearing record by a stored clean-sweep marker, carrying the
swept host's id, the resolving action's id, `asOf`, and the minting
corporation, but no target id and no composition fields.

#### Scenario: A clean sweep mints a record with no target
- **WHEN** a focused scan resolves against a host with nothing masked at it
- **THEN** a sighting record is minted marked as a clean sweep
- **AND** that record carries no target id and no hull composition

#### Scenario: A clean-sweep record still names the host and the sweep
- **WHEN** a clean-sweep sighting record is read
- **THEN** it reports the host that was swept, the resolving sweep's action
  id, and an `asOf` equal to the pulse-reach instant — the midpoint of that
  sweep's depart and arrive times — never the world time the resolve
  transaction ran

### Requirement: The Pile Is Paginated and Bounded Per Read
Because a sighting never expires and the pile is therefore unbounded in
principle, the system SHALL bound every read of a corporation's sighting
pile to a page no larger than a named maximum, and SHALL NOT serve the
entire pile in a single unbounded response. The system SHALL order every
page by each record's `asOf` (the pulse-reach stamp — the pile's only time
field), most recent first. Because `asOf` precedes resolution by half a
round trip, a long-range sweep committed earlier MAY sort after a
short-range sweep committed later; the pile is ordered by when the light
left, not by when the claim was filed.

#### Scenario: A read without further parameters returns at most the page maximum
- **GIVEN** a corporation with more sighting records than the named page
  maximum
- **WHEN** its sighting pile is read with no continuation supplied
- **THEN** the response contains no more records than that maximum

#### Scenario: Records are ordered newest-minted-first
- **WHEN** a corporation's sighting pile is read
- **THEN** the returned records are ordered by their `asOf` stamp, most
  recent first

#### Scenario: A pile within the page maximum is returned in full
- **GIVEN** a corporation with fewer sighting records than the named page
  maximum
- **WHEN** its sighting pile is read
- **THEN** every one of its records is returned in a single response

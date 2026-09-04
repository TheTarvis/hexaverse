## ADDED Requirements

### Requirement: A Sighting Record Is Addressable On the Wire Without Naming Its Target
The system SHALL serve every sighting record with its own document identifier
as an `id` field on the wire, so a reader can tell two records apart, address
one of them, and match a record listed in a log to the same record drawn in a
system view. That identifier SHALL be stable for a given record across every
read, and SHALL be distinct for every record in a corporation's pile —
including two records minted by one sweep against one host, whose every other
served field may legitimately coincide.

The identifier SHALL disclose nothing about the sighted target: it SHALL NOT
contain the target's id as a substring or in any recoverable encoding, and two
records naming the same target from two different sweeps SHALL NOT share an
identifier — so the identifier addresses a record and grants no way to link one
sighting to another, or to a live contact. The pile's continuation cursor
SHALL likewise disclose no target id.

Correlating a sighting with a live contact is deliberately not offered.
`system-interior`'s contact carries no id at all, and a stable per-target key on
either surface would hand the client the persistent track this model withholds:
every sighting is a glimpse, and attribution stays inferential.

#### Scenario: A served record carries a stable id
- **WHEN** the same sighting record is read on two separate reads of the pile
- **THEN** both reads serve the same `id` for it

#### Scenario: Two records from one sweep are distinguishable
- **GIVEN** one focused scan resolving against a host with two ships masked at
  it, whose served positions, velocities, hull counts, and hull types are
  identical
- **WHEN** the pile is read
- **THEN** the two records carry different `id` values

#### Scenario: A record's id names no target
- **GIVEN** a sighting record minted for a target
- **WHEN** it is served over the read endpoint
- **THEN** its `id` does not contain the target's id as a substring
- **AND** the response still contains no field identifying the target by id

#### Scenario: A record's id is not a reversible encoding of its target
- **GIVEN** a sighting record minted for a target, and full knowledge of how
  the identifier is derived
- **WHEN** the served `id` is inverted, decoded, or otherwise transformed by
  any means short of guessing the target id and re-deriving it
- **THEN** the target's id is not recovered — the identifier is a digest, not
  an encoding of its inputs

#### Scenario: Two sweeps against the same target share no identifier
- **GIVEN** two focused scans, resolved at different times, that each mint a
  record for the same target
- **WHEN** the pile is read
- **THEN** the two records carry different `id` values, with no shared,
  target-derived component a client could match on

#### Scenario: The continuation cursor names no target id
- **GIVEN** a corporation with more sighting records than the named page maximum
- **WHEN** the first page is read and its continuation cursor is returned
- **THEN** that cursor contains no sighted target's id, as a substring or in any
  recoverable encoding

### Requirement: The Pile Read Filters To One System On Request
The system SHALL accept, on the sighting-pile read, an optional system
identifier, and SHALL then serve only that corporation's records whose system
is the named one — ordered, bounded, and paged exactly as the unfiltered read
is (*The Pile Is Paginated and Bounded Per Read*), with a continuation cursor
that continues the filtered sequence rather than the whole pile's. A read that
names no system SHALL be unchanged: the whole pile, newest pulse-reach first.

The filter is a required read, not a convenience. A pile is unbounded — a
sighting never expires — and it spans every system the corporation has ever
swept, while its consumer in a system view needs exactly one system's records.
Without a server-side filter that consumer can only page the whole pile
hoping the system it wants is not beyond the last page it fetched, which is
a display that silently omits records as the pile grows.

#### Scenario: A filtered read returns only the named system's records
- **GIVEN** a corporation with records in two different systems
- **WHEN** its pile is read naming one of those systems
- **THEN** every returned record's system is the named one, and no record from
  the other system appears

#### Scenario: A filtered read is bounded and paged like any other
- **GIVEN** a corporation with more records in one system than the named page
  maximum
- **WHEN** its pile is read naming that system
- **THEN** the response contains no more records than that maximum, ordered by
  `asOf` most recent first, and carries a continuation cursor
- **AND** continuing with that cursor returns further records of that same
  system

#### Scenario: A filtered read for a system with no records is empty, not an error
- **WHEN** a corporation's pile is read naming a system it has never swept
- **THEN** the response is successful and carries no records

#### Scenario: An unfiltered read is unchanged
- **WHEN** a corporation's pile is read naming no system
- **THEN** the response carries records from every system it has swept, newest
  pulse-reach first

## MODIFIED Requirements

### Requirement: A Sighting Is Minted Only By a Resolving Sweep
The system SHALL mint a sighting record only as the effect of a focused-scan
action resolving. No read path SHALL mint a sighting of its own accord, and no
live passive-proximity or plume disclosure evaluation, and no burn or
lane-transit resolution, SHALL mint one at all. Passive contact with a foreign
fleet, however close or however long sustained, mints nothing on its own: only
a committed, resolved sweep files a claim.

A read MAY, however, **settle a sweep whose ETA has already passed**, through
the action spine's opportunistic resolve fold that reads already run — and
that fold, not a scheduler, is how a sweep lands for a player who is merely
looking at the screen. Which read runs it is not narrowed by this rule: any
read that folds the sweep's scope or its actor may settle it, including one
issued by a different corporation entirely. The records that then appear are the *sweep's* effect: they are
attributed to the sweep's action, stamped at the sweep's pulse-reach, and
identical to the records the periodic sweep job would have produced had it
resolved the action first. The read contributes nothing to them but the moment
it happened to run. A read SHALL NOT mint, adjust, or re-stamp a record on any
other basis.

#### Scenario: Reading the pile mints nothing
- **WHEN** a corporation reads its sighting pile, or reads a system's interior
  at a world time when no focused scan of its own is due for resolution
- **THEN** no sighting record is created as a side effect of that read

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

#### Scenario: A due sweep settled by a read mints as the sweep, not as the read
- **GIVEN** a running focused scan whose ETA has passed and which no sweep job
  has yet resolved
- **WHEN** a read settles it through the action spine's opportunistic resolve
  fold
- **THEN** the records minted carry the sweep's action id and an `asOf` equal to
  that sweep's pulse-reach instant
- **AND** no record is stamped with, or attributed to, the world time the read
  ran

### Requirement: A Sighting Is Minted In the Resolve Transaction, Exactly Once
The system SHALL mint a sighting only from inside the focused-scan action's
resolve transaction, as part of the resolver's returned effect, applied
atomically with the action's status flip to `done`. Each minted record's
document path SHALL be a deterministic function of the resolving action's
id and the sighted target's id (or, for a clean sweep, the resolving
action's id alone), so that a retried resolve transaction converges on the
same document rather than minting a duplicate.

That document identifier SHALL NOT contain the sighted target's id, nor any
value from which the target's id can be recovered. The identifier is served to
the client as the record's `id` (*A Sighting Record Is Addressable On the Wire
Without Naming Its Target*) and is echoed inside the pile's continuation
cursor, so an identifier built by concatenating the target's id publishes,
through both of those surfaces, the very id this capability keeps off the wire.

The identifier SHALL be a **collision-resistant digest** over those same
inputs, rendered at **no fewer than 128 bits**, and SHALL depend on no
per-process, per-instance, or randomly seeded value. Its class is mandated
rather than left to the implementer because the identifier *is* the document
path: two records colliding on it are one document, the later mint silently
overwriting the earlier through the same merge write every resolver's effect
is applied with, and the loss is undetectable — no error, no duplicate, one
record where two claims were filed, in a pile that never expires. A
process-seeded or instance-seeded derivation fails differently and worse: it
satisfies *A retried resolve converges instead of duplicating* inside one
process and mints two documents when the retry lands on another instance.

#### Scenario: The identifier is stable across processes and instances
- **GIVEN** the same resolving action id and the same target id
- **WHEN** the identifier is derived in one process and again in a separate
  process or on a separate instance
- **THEN** both derivations produce the same identifier
- **AND** no per-process, per-instance, or randomly seeded value participates
  in it

#### Scenario: A sighting's document id is deterministic
- **WHEN** a focused scan resolves and mints a sighting for a target
- **THEN** the record's document path is derived solely from the resolving
  action's id and the target's id
- **AND** the target's id cannot be recovered from that path, in whole or in
  part

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

#### Scenario: Two records from one sweep take two distinct paths
- **GIVEN** one focused scan resolving against a host with two ships masked at it
- **WHEN** it mints its records
- **THEN** the two records are written to two distinct document paths

## MODIFIED Requirements

### Requirement: Actions Commit With an Atomically Claimed Slot
The system SHALL, on commit, validate that a resolver is registered for the
action's type, freeze a new `running` action (id, type, kind, actor, scope,
params, commit time, ETA), and atomically claim the named actor-channel
slot (`activeActionId` for the default movement slot, or the slot named in
the commit spec, e.g. the sensor slot) in the same transaction — rejecting
the commit if that slot is already claimed by another running action. A
`CommitSpec` MAY additionally supply a transaction-scoped `ActorState`
producer — a function invoked inside that same transaction, after the
actor document has already been read for the slot check, that computes the
fields to merge onto the actor document from that transactional read
rather than from any value computed before the transaction opened. When
supplied, the commit SHALL use the producer's output in place of a static
`ActorState` map; when omitted, the existing static-map behavior is
unchanged. This exists because a static `ActorState` map, computed before
the transaction opens, is correct only when every other mutator of the
same actor fields is serialized against this one by the channel-slot claim
— true for two burns on the same movement slot, but not true for a verb
that mutates actor state without claiming any slot (an instant verb, e.g. a
resource purchase): two such unserialized mutations can each compute an
absolute post-mutation value from a stale pre-transaction read, and
whichever transaction commits last silently discards the other's effect.
A transaction-scoped producer closes this by computing its merged fields
from the same transactional read the slot check already performs, so the
affordability check and the mutation it authorizes are never evaluated
against a snapshot that could be stale by the time the transaction
commits.

#### Scenario: Committing an unregistered type fails
- **WHEN** `Commit` is called with a type for which no resolver has been
  registered
- **THEN** the commit fails with `ErrUnknownType` and nothing is persisted

#### Scenario: A second action on an already-claimed slot is rejected
- **WHEN** an actor already holds a running action on a given slot and a
  new commit targets that same slot
- **THEN** the commit fails with `ErrActiveActionExists` and no new action
  is created

#### Scenario: Independent slots on the same actor commit concurrently
- **WHEN** an actor holds a running action on one slot (e.g. movement) and
  a new commit targets a different slot (e.g. sensor)
- **THEN** the commit succeeds, and the actor ends up with both slots
  claimed by their respective actions

#### Scenario: Commit atomically writes actor state
- **WHEN** a commit spec includes `ActorState` fields
- **THEN** those fields are merged onto the actor document in the same
  transaction that claims the slot, so the actor's state transition and the
  slot claim are never observably separate

#### Scenario: A transaction-scoped ActorState producer computes its merge from the transactional read, not a stale snapshot
- **WHEN** a commit spec supplies a transaction-scoped `ActorState`
  producer, and the actor document's relevant field has changed between
  the verb service's own pre-transaction read and the moment `Commit`'s
  transaction opens
- **THEN** the fields merged onto the actor document are computed from the
  transaction's own read of the actor document, not from the verb
  service's earlier, now-stale read

#### Scenario: A slot-claiming commit and an unserialized instant mutation on the same actor never lose an update
- **WHEN** a commit that claims a channel slot and mutates a numeric actor
  field via a transaction-scoped `ActorState` producer, and a separate,
  unserialized instant mutation of that same field (claiming no slot), are
  submitted concurrently against the same actor
- **THEN** the actor's final value for that field reflects both mutations'
  effects — neither transaction's write is silently overwritten by the
  other's stale, pre-transaction computation of the resulting value

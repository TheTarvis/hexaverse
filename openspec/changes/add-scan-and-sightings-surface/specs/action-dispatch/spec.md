## MODIFIED Requirements

### Requirement: Exactly-Once Resolution
The system SHALL resolve a running action exactly once, in a single
transaction that: re-verifies the action is still running (a no-op if
another resolver already settled it), invokes the type's registered
resolver with the actor document already read and the action's frozen ETA
as the effect time, then atomically flips the action to `done`, records the
resolver's outcome, **its reason code**, and resolve timestamp, releases the
claimed slot, applies any `ActorState` patch, appends any `Delta` to the
ledger named by the action's ledger key (the action's `scope` when no
distinct key was committed) (exactly-once by the action id as the delta
document id), and applies any structured `Writes`.

The reason code is **persisted on the action and served with it**, not merely
returned to the caller of the resolve. It is the resolved action's only
structured classifier of *why* it ended as it did — `focused-scan` already
requires that "the resolved action carries a reason code identifying whether
the failure was range or occlusion", and `mine` classifies its clamp the same
way — and the action inbox is the only surface a client reads a settled action
from. A reason code that lives only on the in-transaction resolve result is
unreadable by every consumer that exists: it is written nowhere and served
never, so a client's per-reason copy renders its unrecognized-code fallback for
every resolution, and no test that inspects the resolver's return value can
detect it.

#### Scenario: Resolving an already-resolved action is a no-op
- **WHEN** `ResolveOne` is invoked for an action whose status is no longer
  `running` (already resolved by a racing reader)
- **THEN** no error occurs, no writes are applied, and the call returns
  no action

#### Scenario: A resolver runs at the action's frozen ETA, not real time
- **WHEN** an action is resolved
- **THEN** the resolver's effect time (`Resolution.At`) is the action's
  stored `Eta`, regardless of how much later the resolve transaction
  actually runs

#### Scenario: A mutating delta is exactly-once by action id
- **WHEN** two concurrent resolve attempts for the same mutating action
  both try to append a delta
- **THEN** only one delta document (keyed by the action id) is created; the
  losing attempt's transaction fails and the action remains resolved
  exactly once

#### Scenario: A resolver failure does not corrupt the action
- **WHEN** a registered resolver function returns an error
- **THEN** the resolve transaction is aborted, the action remains
  `running`, and no partial state is written

#### Scenario: A resolver's reason code is persisted on the action and served
- **GIVEN** a resolver that returns a reason code alongside its outcome
- **WHEN** the action resolves and is afterwards read back from the store and
  served over the inbox
- **THEN** the stored action and the served action both carry that reason
  code, unchanged
- **AND** the assertion is made against the action as read back, never against
  the value the resolver returned

#### Scenario: A resolver that sets no reason code resolves normally
- **WHEN** a resolver returns no reason code (a kinematic verb)
- **THEN** the action resolves with its outcome and resolve timestamp, and no
  reason code is served for it

### Requirement: Inbox by Actor Query Param
The system SHALL serve `GET /v1/actions?actor=<id>&status=<status>` listing
an actor's actions, optionally filtered to one status, and
`GET /v1/actions/:actionId` for a single action — every response including
the current world time.

A read filtered to the `done` status SHALL be **ordered by resolve timestamp,
most recently settled first, and bounded to a named maximum**. An actor's
settled actions accumulate for the life of the game and are never deleted, so
an unordered, unbounded read grows without limit and — worse — any bound
applied to an unordered read returns an **arbitrary subset**: a consumer
asking for "the most recently settled action" would fold that subset and can
report a stale one, or none, while the newest stays unread indefinitely.

The ordering SHALL apply only where the resolve timestamp exists. A running
action carries none, so a read not filtered to `done` SHALL NOT drop actions
for want of that field.

#### Scenario: Missing actor query param is rejected
- **WHEN** `GET /v1/actions` is called with no `actor` query parameter
- **THEN** the response is `400 Bad Request`

#### Scenario: An unknown action id is not found
- **WHEN** `GET /v1/actions/:actionId` is called with an id that does not
  exist
- **THEN** the response is `404 Not Found`

#### Scenario: A settled-status read is ordered by resolve timestamp
- **GIVEN** an actor with several settled actions whose resolve timestamps
  differ
- **WHEN** its inbox is read filtered to the `done` status
- **THEN** the actions are served most recently settled first

#### Scenario: A settled-status read is bounded, and its bound keeps the newest
- **GIVEN** an actor with more settled actions than the named maximum
- **WHEN** its inbox is read filtered to the `done` status
- **THEN** no more than that maximum are served
- **AND** the actions served are the most recently settled ones, never an
  arbitrary subset of the whole history

#### Scenario: A running-status read is unaffected by the settled ordering
- **GIVEN** an actor with a running action, which carries no resolve timestamp
- **WHEN** its inbox is read filtered to the `running` status
- **THEN** that action is served, and no ordering on a field it does not carry
  omits it

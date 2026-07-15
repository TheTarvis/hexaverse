# Action Dispatch Specification

## Purpose
The generic async spine every verb (fleet burns, lane travel, scans, and
future mutating verbs like mining) rides: a uniform lifecycle
(running → done | cancelled), a commit-time-frozen ETA, a single-slot claim
per actor channel, an exactly-once resolve transaction, and a check-in
inbox. Effects are computed facts of world time, never scheduled/fired
events — resolution happens opportunistically whenever any read touches a
due action's scope or actor, with a periodic sweep only as a liveness
floor.

## Requirements

### Requirement: Actions Commit With an Atomically Claimed Slot
The system SHALL, on commit, validate that a resolver is registered for the
action's type, freeze a new `running` action (id, type, kind, actor, scope,
params, commit time, ETA), and atomically claim the named actor-channel
slot (`activeActionId` for the default movement slot, or the slot named in
the commit spec, e.g. the sensor slot) in the same transaction — rejecting
the commit if that slot is already claimed by another running action.

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

### Requirement: Exactly-Once Resolution
The system SHALL resolve a running action exactly once, in a single
transaction that: re-verifies the action is still running (a no-op if
another resolver already settled it), invokes the type's registered
resolver with the actor document already read and the action's frozen ETA
as the effect time, then atomically flips the action to `done`, records the
resolver's outcome and resolve timestamp, releases the claimed slot,
applies any `ActorState` patch, appends any `Delta` to the scope's ledger
(exactly-once by the action id as the delta document id), and applies any
structured `Writes`.

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

### Requirement: Cancel Releases the Slot Without an Effect
The system SHALL, on cancel of a running action, flip it to `cancelled`,
release its claimed slot, optionally merge caller-supplied actor state (a
verb's own halt state) in the same transaction, and apply no resolver
effect (no delta, no writes).

#### Scenario: Cancelling a running action releases its slot
- **WHEN** a running action is cancelled
- **THEN** its status becomes `cancelled` and the actor's claimed slot for
  that action is cleared

#### Scenario: Cancelling a non-running action fails
- **WHEN** cancel is called on an action that is not `running` (already
  done or already cancelled)
- **THEN** the call fails with `ErrNotRunning`

#### Scenario: Cancelling an unknown action fails
- **WHEN** cancel is called with an action id that does not exist
- **THEN** the call fails with `ErrNotFound`

### Requirement: Read-Triggered Due-Action Resolution
The system SHALL resolve due actions (status `running`, ETA at or before
the current world time) opportunistically whenever a read asks for them,
in ascending ETA order, by scope (`ResolveDue`), by actor
(`ResolveActive`), or unfiltered (`ResolveAllDue`, the sweep's use), rather
than relying on any scheduled trigger to fire an effect.

#### Scenario: Resolving by scope only touches that scope's due actions
- **WHEN** `ResolveDue` is called for a scope
- **THEN** only running actions with that scope and an ETA at or before now
  are resolved, in ascending ETA order

#### Scenario: Resolving by actor only touches that actor's due actions
- **WHEN** `ResolveActive` is called for an actor
- **THEN** only that actor's running, due actions are resolved

#### Scenario: An unregistered resolver type is skipped, not fatal
- **WHEN** a due action's type has no registered resolver (e.g. a
  since-deprecated type)
- **THEN** that action is skipped (logged) and resolution continues with
  the remaining due actions rather than aborting

### Requirement: Additive Ledger Fold, No Materialized Total
The system SHALL represent a scope's mutating-verb total as the fold (sum)
of its append-only delta entries with `effectAt <= T`, computed at read
time, never as a separately maintained running total field.

#### Scenario: Folding sums only deltas up to the given time
- **WHEN** a scope's deltas are folded up to a world time `T`
- **THEN** the result is the sum of every delta entry for that scope whose
  `effectAt` is at or before `T`, excluding later ones

### Requirement: Inbox by Actor Query Param
The system SHALL serve `GET /v1/actions?actor=<id>&status=<status>` listing
an actor's actions, optionally filtered to one status, and
`GET /v1/actions/:actionId` for a single action — every response including
the current world time.

#### Scenario: Missing actor query param is rejected
- **WHEN** `GET /v1/actions` is called with no `actor` query parameter
- **THEN** the response is `400 Bad Request`

#### Scenario: An unknown action id is not found
- **WHEN** `GET /v1/actions/:actionId` is called with an id that does not
  exist
- **THEN** the response is `404 Not Found`

### Requirement: Acknowledge and Generic Cancel Endpoints
The system SHALL serve `POST /v1/actions/:actionId/acknowledge`
(stamps `acknowledgedAt`, powering a done-but-unacknowledged check-in query)
and `POST /v1/actions/:actionId/cancel` (the generic cancel, for verbs with
no motion state of their own to settle — kinematic verbs with actor state
cancel through their own domain endpoint instead, e.g.
`POST /v1/fleets/:id/cancel`).

#### Scenario: Acknowledging an unknown action is not found
- **WHEN** acknowledge is called with an action id that does not exist
- **THEN** the response is `404 Not Found`

#### Scenario: Cancelling a non-running action via the generic endpoint conflicts
- **WHEN** the generic cancel endpoint is called on an action that is not
  running
- **THEN** the response is `409 Conflict`

### Requirement: No Caller-Identity Binding on Action Endpoints
The system SHALL, for `GET /v1/actions?actor=<id>`,
`GET /v1/actions/:actionId`, `POST /v1/actions/:actionId/acknowledge`, and
`POST /v1/actions/:actionId/cancel`, accept any `actor` query value or
`actionId` path value from any authenticated caller, without verifying that
the caller's own corporation/account owns that actor or that action.
(Suspected authorization defect — see retrofit report item 1; specced here
as the current, observable behavior, not an endorsement.)

#### Scenario: Any authenticated caller can read another actor's inbox
- **WHEN** an authenticated account calls `GET /v1/actions?actor=<id>` naming
  an actor (e.g. a fleet) it does not own
- **THEN** the full list of that actor's actions — including target and ETA
  detail — is returned, with no check that the caller owns that actor

#### Scenario: Any authenticated caller can acknowledge or cancel another actor's action
- **WHEN** an authenticated account calls
  `POST /v1/actions/:actionId/acknowledge` or
  `POST /v1/actions/:actionId/cancel` naming an action whose actor it does
  not own
- **THEN** the action is acknowledged or cancelled, with no check that the
  caller owns the action's underlying actor

### Requirement: Scheduled Sweep as a Liveness Floor
The system SHALL serve `POST /v1/push/action-sweep` (OIDC-verified,
scheduler-triggered) resolving every due action across all scopes/actors,
logging (but not failing on) any action resolved more than 20 real-world
minutes past its ETA, and returning counts of resolved and overdue
actions. No other behavior in this capability SHALL depend on the sweep
running — read-triggered resolution alone is correctness-sufficient; the
sweep exists only to settle actions nobody happens to read.

#### Scenario: The sweep resolves every due action regardless of scope or actor
- **WHEN** the sweep endpoint is invoked
- **THEN** every running action across every scope and actor whose ETA has
  passed is resolved

#### Scenario: An overdue resolution is logged, not failed
- **WHEN** the sweep resolves an action more than 20 minutes past its ETA
- **THEN** the sweep still reports success, incrementing an "overdue" count
  rather than erroring

### Requirement: Completion Event Fan-Out
The system SHALL publish an `ActionCompleted` event (action id, type,
actor, scope, outcome, ETA) for every action resolved through any of the
resolve paths (read-triggered or sweep), attributed to a channel keyed by
the action's scope, so SSE delivery can broadcast the completion to
listeners on that scope.

#### Scenario: A resolved action publishes exactly one completion event
- **WHEN** an action is resolved (by any resolution path)
- **THEN** exactly one `ActionCompleted` event is published for it, keyed
  to a channel named after its scope

#### Scenario: A no-op resolve publishes nothing
- **WHEN** a resolve attempt finds the action already resolved (no-op)
- **THEN** no completion event is published

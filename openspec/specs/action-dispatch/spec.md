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
applies any `ActorState` patch, appends any `Delta` to the ledger named by
the action's ledger key (the action's `scope` when no distinct key was
committed) (exactly-once by the action id as the delta document id), and
applies any structured `Writes`.

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
The system SHALL represent a ledger key's mutating-verb total as the fold
(sum) of its append-only delta entries with `effectAt <= T`, computed at
read time, never as a separately maintained running total field. This
requirement governs `action-dispatch`'s own delta ledger — the
`deltas/{ledgerKey}/entries/{actionId}` totals a mutating verb (burn, lane
travel, mine) folds on read — never a system-wide prohibition on every
materialized total anywhere in the codebase. **`corporation-credits`'
materialized credit balance is the one recorded, deliberate exception**: a
credit balance accrues entries for the life of a corporation's account,
with no bound comparable to a lode's `MinRunTons`-derived ceiling, so
folding it on every read does not age well the way this ledger's bounded,
per-lode totals do. That exception is safe only because
`corporation-credits`' own "Ledger-Balance Reconciliation Invariant"
continuously checks the materialized balance against its ledger's fold and
signals a divergence — the compensating control this requirement's
carve-out depends on. Absent that invariant, a materialized total is
exactly the drift risk this requirement exists to rule out.

#### Scenario: Folding sums only deltas up to the given time
- **WHEN** a ledger key's deltas are folded up to a world time `T`
- **THEN** the result is the sum of every delta entry for that ledger key
  whose `effectAt` is at or before `T`, excluding later ones

#### Scenario: The carve-out is bounded — every other ledger key still folds, never materializes
- **WHEN** a mutating verb other than a credit mutation (e.g. a mine run's
  lode-and-kind-qualified ledger key) computes its total
- **THEN** that total is still always the read-time fold of its append-only
  delta entries — never a separately maintained running total field —
  exactly as before this change; the carve-out names one specific,
  reconciliation-checked exception (`corporation-credits`' balance) and
  extends to no other ledger key

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

### Requirement: Ledger Key Decoupled From Channel Scope
The system SHALL allow a mutating verb's commit to name a ledger key
distinct from the action's `scope`, and SHALL fold and append that verb's
ledger deltas under the named ledger key rather than under `scope`. When
no distinct ledger key is supplied, the ledger key SHALL default to the
action's `scope`, leaving every existing verb's ledger behavior (burn,
lane travel) unchanged. This lets a verb whose effect accrues per-target
at a finer granularity than its channel (e.g. mine, per feature and
resource kind) keep a fine-grained ledger while keeping its `scope` at the
coarser granularity that read-resolution (`ResolveDue`) and SSE completion
fan-out key on.

#### Scenario: A verb folds its own ledger key, not its channel scope
- **WHEN** a mutating action commits with `scope = S` and a distinct
  ledger key `L`
- **THEN** its resolver's `Remaining` folds the ledger at `L`, its
  appended delta is written under `deltas/{L}/entries/{actionId}`, and its
  read-triggered resolution and completion event still key on `scope = S`

#### Scenario: An omitted ledger key defaults to the scope
- **WHEN** a mutating action commits with no distinct ledger key
- **THEN** its ledger key is its `scope`, unchanged from prior behavior

### Requirement: Public Commit-Time Ledger Fold
The system SHALL expose a public read of a ledger key's folded total (the
sum of its delta entries with `effectAt` at or before a given world time)
on the action service, so a verb's commit path can fast-fail against an
already-exhausted ledger without reaching into the private ledger store
(per `backend/CLAUDE.md`'s layering rule that a DAO is private to its
owning service). This fold SHALL return the same total the resolver's
`Remaining` computes for that ledger key at the same time.

#### Scenario: A commit-time fold matches the resolver's remaining
- **WHEN** a verb's commit folds a ledger key at the current world time
  and a resolver later folds the same key at the same time
- **THEN** both reads return the identical folded total

### Requirement: Commit Rejects Non-Primitive Action Parameters
The system SHALL, on commit, reject any action whose `Params` map contains
a value outside the storage-native allowlist — `nil`, `string`, `bool`,
`int`, `int64`, `float64`, `[]string`, `[]int64`, `[]float64`, `[]any`, and
`map[string]any` (validated recursively through `[]any` and
`map[string]any`) — failing with the sentinel `ErrNonPrimitiveParam` and
persisting nothing, so that a domain struct can never reach storage through
the untyped parameter channel and decode back as an unrecognized shape.
This requirement governs `Params` only; `ActorState` values are merged onto
the actor document by the actor domain's own stored shapes and are NOT
subject to this allowlist.

#### Scenario: A domain struct in params is rejected at commit
- **WHEN** `Commit` is called with a `Params` value that is a domain struct
  (for example a board coordinate) rather than an allowlisted primitive
- **THEN** the commit fails with `ErrNonPrimitiveParam`, no action document
  is written, and no actor slot is claimed

#### Scenario: A nested non-primitive inside a map or slice is rejected
- **WHEN** `Commit` is called with a `Params` value that is a
  `map[string]any` or `[]any` containing a non-allowlisted value at any
  depth
- **THEN** the commit fails with `ErrNonPrimitiveParam`

#### Scenario: An encoded coordinate map commits normally
- **WHEN** `Commit` is called with a coordinate encoded as
  `map[string]any{"ring": int64, "slot": int64}`
- **THEN** the commit succeeds and the stored params round-trip to the same
  map

#### Scenario: Actor state carrying a domain struct still commits
- **WHEN** a commit spec's `ActorState` carries the actor's movement-state
  struct while its `Params` are all allowlisted
- **THEN** the commit succeeds

### Requirement: Action Endpoints Are Restricted to the Owning Corporation
The system SHALL, for `GET /v1/actions?actor=<id>`,
`GET /v1/actions/:actionId`, `POST /v1/actions/:actionId/acknowledge`, and
`POST /v1/actions/:actionId/cancel`, resolve the named actor's (for the two
action-id-scoped endpoints, that action's own actor's) owning corporation
and compare it against `common.ActorCorp(c)` before serving or acting,
responding `404 Not Found` — not `403` — when they do not match or when the
requester has no corporation, matching the absence semantics
`fleet-movement`'s own movement-endpoint closure uses for the identical
reason: a foreign actor is indistinguishable from a nonexistent one, and a
`403` would itself confirm the actor exists (design.md Decision 21). This
closes the sibling half of the authorization defect `fleet-movement`'s five
movement-command endpoints close in the same change — closing only those
five would leave a bypass to the same movement-channel slot through this
capability's own cancel endpoint.

#### Scenario: A foreign corp cannot list another actor's inbox
- **WHEN** an authenticated account whose corporation does not own actor F
  calls `GET /v1/actions?actor=F`
- **THEN** the response is `404 Not Found` and no action belonging to F is
  returned

#### Scenario: A foreign corp cannot fetch a single action by id
- **WHEN** an authenticated account whose corporation does not own action
  A's underlying actor calls `GET /v1/actions/A`
- **THEN** the response is `404 Not Found`

#### Scenario: A foreign corp cannot acknowledge another actor's action
- **WHEN** an authenticated account whose corporation does not own action
  A's underlying actor calls `POST /v1/actions/A/acknowledge`
- **THEN** the response is `404 Not Found` and action A's acknowledgment
  state is unchanged

#### Scenario: A foreign corp cannot cancel another actor's action
- **WHEN** an authenticated account whose corporation does not own action
  A's underlying actor calls `POST /v1/actions/A/cancel`
- **THEN** the response is `404 Not Found` and action A continues running,
  unaffected

#### Scenario: A corpless requester is rejected the same way
- **WHEN** an authenticated but corpless account calls any of these four
  endpoints against an existing actor or action
- **THEN** the response is `404 Not Found`

#### Scenario: The owning corporation's own requests still succeed
- **WHEN** an authenticated account whose corporation owns actor F calls
  `GET /v1/actions?actor=F`, or owns action A's underlying actor and calls
  `GET /v1/actions/A`, `POST /v1/actions/A/acknowledge`, or
  `POST /v1/actions/A/cancel`
- **THEN** each call succeeds exactly as it did before this ownership check
  was added


## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Additive Ledger Fold, No Materialized Total
The system SHALL represent a ledger key's mutating-verb total as the fold
(sum) of its append-only delta entries with `effectAt <= T`, computed at
read time, never as a separately maintained running total field.

#### Scenario: Folding sums only deltas up to the given time
- **WHEN** a ledger key's deltas are folded up to a world time `T`
- **THEN** the result is the sum of every delta entry for that ledger key
  whose `effectAt` is at or before `T`, excluding later ones

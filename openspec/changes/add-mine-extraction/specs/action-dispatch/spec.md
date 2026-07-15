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

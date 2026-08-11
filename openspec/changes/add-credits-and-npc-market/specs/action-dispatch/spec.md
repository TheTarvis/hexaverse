## MODIFIED Requirements

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

## MODIFIED Requirements

### Requirement: Append-Only Trade Ledger
The system SHALL record every credit balance mutation as an append-only
ledger entry carrying at minimum: an entry id, the corporation id, the
triggering account's identity, a nullable fleet id (the acting fleet, for
a fleet-scoped mutation such as a sale or a refuel — null for a
fleet-independent mutation such as the starting grant), the world time of
the mutation, an entry kind (starting grant, sale proceeds, **fuel
purchase**, or **adjustment** — an operator-attributed correction,
extensible to future kinds), a nullable counterparty, a nullable item
reference, a nullable quantity, a nullable unit price, the signed credit
amount, and the resulting balance immediately after the entry — and SHALL
never update or delete a ledger entry once appended. No amount recorded
for a credit mutation SHALL ever be zero. The nullable fleet id field is
the one this capability's and `goods-sale`'s replay-fingerprint checks
compare against when a reused operation key names a different fleet than
the recorded entry; a fuel-purchase entry is fleet-scoped exactly as a
sale entry is — its nullable fleet id names the refueling fleet, never
null.

#### Scenario: A sale-shaped entry records its trade detail
- **WHEN** a settled sale appends its ledger entry
- **THEN** the entry records the selling fleet's id, the counterparty (the
  station), item reference (the resource kind), quantity (tons sold), unit
  price, the signed (positive) amount, and the resulting balance

#### Scenario: A non-trade entry omits trade-specific fields
- **WHEN** the starting-grant entry is appended at spawn
- **THEN** the entry records its kind, the signed amount, and the resulting
  balance, with no counterparty, item reference, quantity, or unit price

#### Scenario: A fuel-purchase entry records its fleet, quantity, and negative amount
- **WHEN** a settled refuel appends its ledger entry
- **THEN** the entry records the refueling fleet's id, the station as
  counterparty, the item reference `fuel`, the quantity purchased (tons),
  the single global unit price, a negative signed amount equal to the
  tonnage's cost, and the resulting balance

### Requirement: Reconciliation Runs On a Stated Cadence, Chained at Write Time, and Halts Mutation On Divergence
The system SHALL run the ledger-balance reconciliation check (see "Ledger-
Balance Reconciliation Invariant") on a stated periodic cadence, run
independently of any particular mutation, AND SHALL validate, inside every
settlement transaction, the transaction's computed new balance against
the previous ledger entry's recorded resulting balance before committing
— an O(1) write-time check that catches a divergence at the moment it
would occur rather than only on the next periodic fold. Upon a confirmed,
unresolved divergence for a corporation, the system SHALL reject further
credit-mutating operations for that corporation with a distinguishable
error until an operator resolves it via an `adjustment` ledger entry,
rather than continuing to mutate a balance already known to be wrong. A
refuel settlement is a credit-mutating operation under this requirement
exactly as a sale is, and is the first debit-shaped mutation this
capability defines outside of an operator `adjustment` — a sign error on a
debit is a credit mint, not merely a wrong number, which is exactly the
class of divergence this write-time check exists to catch before it
compounds across further mutations.

#### Scenario: A periodic reconciliation cycle runs without a mutation triggering it
- **WHEN** no credit-mutating operation occurs for a corporation during a
  reconciliation cycle
- **THEN** the cycle still runs and evaluates that corporation's
  reconciliation state

#### Scenario: A settlement transaction validates against the previous entry's resulting balance
- **WHEN** a settlement transaction computes its new balance
- **THEN** it compares that computed value against the previous ledger
  entry's recorded resulting balance before committing, catching a
  divergence at write time rather than only on the next periodic fold

#### Scenario: A corporation with a confirmed divergence has further mutations rejected
- **WHEN** a corporation's reconciliation state shows a confirmed,
  unresolved divergence
- **THEN** any further credit-mutating operation for that corporation is
  rejected with a distinguishable error until an operator appends an
  `adjustment` entry resolving it

#### Scenario: A corporation with a confirmed divergence cannot refuel either
- **WHEN** a corporation's reconciliation state shows a confirmed,
  unresolved divergence
- **THEN** a refuel request for that corporation's fleet is rejected with
  the same distinguishable error a sale would receive, crediting no fuel
  and debiting no credits, until an operator appends an `adjustment` entry
  resolving it

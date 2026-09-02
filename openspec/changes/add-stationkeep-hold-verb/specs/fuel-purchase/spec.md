## MODIFIED Requirements

### Requirement: One Atomic Transaction — Credit Debit and Fuel Credit
A refuel's credit-balance debit, fleet `fuel`-cargo credit, and ledger
append SHALL occur in one transaction, all-or-nothing, with every
precondition re-evaluated against a transactional re-read — a precondition
satisfied only by a pre-transaction read SHALL never be sufficient to
commit, following `goods-sale`'s "One Atomic Transaction" doctrine,
narrowed to the two domains this verb actually touches (no station-side
effect, per "A Single Global Fuel Price, Unlimited Station Supply, No
Station-Side Write").

Where the refueled fleet is holding an open `stationkeep` park before its
stored dry instant, that same one transaction SHALL additionally carry two
further effects, ordered relative to the fuel credit as
`fleet-movement`'s "Station-Keeping Upkeep Is Settled at Discrete Events,
Never Folded Into the Stored Cargo Pool" defines them: **first**, the debit
of the upkeep accrued since the hold's stored start time, applied before
the refuel's own credit; and **last**, the restamp of that hold's stored
start time to the refuel's own instant together with the recomputation of
its dry instant from the post-credit fuel level. Both are effects of this
same transaction — never a follow-up write, never a compensating write —
so a settlement failure leaves neither of them visible, exactly as it
leaves neither of the two original effects visible.

#### Scenario: A settled refuel lands both effects together
- **WHEN** a refuel settles
- **THEN** the corporation's balance is debited, the fleet's `fuel` cargo
  is credited, and a ledger entry is appended — all from the same
  transaction

#### Scenario: A settlement failure after a partial write leaves no effect visible
- **WHEN** a refuel's settlement fails or the process crashes after
  mutating one of {corporation balance, fleet fuel cargo} but before both
  effects commit
- **THEN** neither effect is visible to any subsequent read — a retry with
  the same operation key starts from a clean, entirely-unsettled state

#### Scenario: A refuel into an open hold settles, credits, and restamps in the one transaction
- **WHEN** a refuel settles for a fleet holding an open `stationkeep` park
  before its stored dry instant
- **THEN** the accrued-upkeep debit, the fuel credit, the hold's restamped
  start time, the recomputed dry instant, the balance debit, and the ledger
  append all commit together, and a failure of that transaction leaves none
  of them visible

#### Scenario: A replayed refuel performs no second upkeep debit, restamp, or recomputation
- **WHEN** a refuel request carrying an already-settled operation key for
  the same corporation is replayed against a fleet holding an open
  `stationkeep` park
- **THEN** the replay returns the original settlement result and performs
  none of the station-keeping effects a second time — no second accrued-
  upkeep debit, no second restamp of the hold's start time, and no
  recomputation of its dry instant — so a replay can neither charge upkeep
  twice nor silently extend the hold by re-stamping it at the replay's own
  instant

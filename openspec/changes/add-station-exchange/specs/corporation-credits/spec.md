## ADDED Requirements

### Requirement: Locked Balance Component, Derived Available
The system SHALL carry a whole-integer `creditsLocked` field on every
corporation's document, absent or zero meaning no open escrow, and SHALL
derive `available` at read time as `credits − creditsLocked` — never
persisted as a separately stored field, following the same "derived, never a
separately stored total" discipline `fleet-movement`'s cargo capacity already
uses. `creditsLocked` SHALL never exceed `credits`, and SHALL never read
negative.

#### Scenario: A fresh corporation's locked balance is zero and its available balance equals its total
- **WHEN** a corporation with no open escrow is read
- **THEN** its `creditsLocked` is zero and its derived `available` equals its
  `credits`

#### Scenario: Available balance is always total minus locked, recomputed on every read
- **WHEN** a corporation with nonzero locked credits is read
- **THEN** the reported `available` equals `credits − creditsLocked` at that
  moment, not a stored value

#### Scenario: Locked balance never exceeds total credits
- **WHEN** a corporation's balance is read at any point after any number of
  settled operations
- **THEN** `creditsLocked` is zero or positive and never exceeds `credits`

### Requirement: Escrow Lock Reserves Available Credits, Rejected In Full When Insufficient
The system SHALL, given a positive lock amount, atomically increase a
corporation's `creditsLocked` by that amount when its current available
balance is at least that amount, leaving `credits` (total) unchanged. SHALL
reject the lock in full, applying no partial amount, when available balance
is insufficient.

#### Scenario: A lock within available balance succeeds
- **WHEN** a lock is requested for an amount at or below the corporation's
  current available balance
- **THEN** `creditsLocked` increases by that amount and `credits` (total) is
  unchanged

#### Scenario: A lock exceeding available balance is rejected in full
- **WHEN** a lock is requested for an amount exceeding the corporation's
  current available balance
- **THEN** the lock is rejected; `creditsLocked` and `credits` are both
  unchanged

### Requirement: Escrow Release Restores Available Credits Without Changing Total
The system SHALL, given a previously locked amount, decrease `creditsLocked`
by that amount, restoring available balance, without any change to `credits`
(total).

#### Scenario: Releasing a lock restores the same available balance that was reserved
- **WHEN** a previously locked amount is released
- **THEN** `creditsLocked` decreases by that amount and `available` increases
  by the same amount, with `credits` unchanged

#### Scenario: Releasing more than is currently locked is rejected
- **WHEN** a release is requested for an amount exceeding the corporation's
  current `creditsLocked`
- **THEN** the release is rejected rather than driving `creditsLocked`
  negative

### Requirement: Settlement Converts a Locked Reservation Into a Real Transfer
The system SHALL, when a buy-side fill settles, in the same transaction as
crediting the seller's balance, debit the buyer's `credits` (total) and
`creditsLocked` by the same fill amount. SHALL never debit more from
`creditsLocked` than remains locked for that specific listing's reservation.

#### Scenario: A settled fill debits the buyer's total and locked balance by the same amount
- **WHEN** a buy-side fill settles for a given amount
- **THEN** the buyer's `credits` and `creditsLocked` both decrease by exactly
  that amount, in the same transaction as the seller's credit

#### Scenario: A fill can never debit locked credits beyond what its own listing had reserved
- **WHEN** a buy listing's cumulative fills would otherwise exceed its
  original locked reservation
- **THEN** no fill is permitted to debit more than remains locked for that
  listing

### Requirement: Listing Fee Is a Sink, Never a Transfer
The system SHALL debit a listing fee from the posting corporation's available
credits under a dedicated `listingFee` ledger entry kind that names no
counterparty and credits no other corporation's balance or ledger.

#### Scenario: A charged listing fee reduces only the posting corporation's balance
- **WHEN** a listing fee is charged
- **THEN** only the posting corporation's balance decreases; no other
  corporation's balance or ledger is affected

#### Scenario: The listing-fee ledger entry kind is distinguishable from every trade-counterparty entry kind
- **WHEN** a corporation's ledger is read after a mix of trade settlements and
  listing fees
- **THEN** the `listingFee` entries are distinguishable, by kind, from every
  settlement entry that names a counterparty

### Requirement: Balance Read Surfaces Available and Locked Alongside Total
An owner's balance read (`corporation-credits`'s "Owner-Only Balance and
Ledger Disclosure") SHALL report `credits` (total), `creditsLocked`, and the
derived `available` figure together.

#### Scenario: An owner's balance read includes total, locked, and available figures
- **WHEN** an authenticated corporation requests its own balance
- **THEN** the response includes its total `credits`, its `creditsLocked`,
  and its derived `available` balance

### Requirement: Credit Sink Rate Is Observable
The system SHALL make the rate at which credits are removed from
circulation by a sink (the sum of `listingFee` — and any future sink-kind —
ledger amounts per unit time, across all corporations) available as a
countable signal, mirroring "Credit Minting Rate Is Observable" — this
capability ships the economy's first sink (M11 shipped none), so the
inflation-visibility story this milestone completes needs a burn-rate
counterpart to the existing mint-rate one, not just the mint side alone.

#### Scenario: The credit-sink rate is queryable over a time window
- **WHEN** an operator queries the total `listingFee` ledger amount removed
  from circulation across all corporations over a given time window
- **THEN** the signal is available without requiring a full ledger scan of
  every corporation

#### Scenario: Mint rate and sink rate are independently queryable
- **WHEN** an operator queries both signals for the same time window
- **THEN** the mint-rate and sink-rate figures are each returned from their
  own query, never conflated into one blended number

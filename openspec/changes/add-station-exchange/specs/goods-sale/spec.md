## MODIFIED Requirements

### Requirement: One Atomic Transaction — Hold Debit, Balance Credit, Ledger, Request Decrement
A sale's hold debit, corporation balance credit, ledger append(s), the
remaining-quantity decrement of every resting demand entry it fills
(NPC-sourced, the floor or an open premium request, or corporation-sourced,
an open player-posted buy listing — see `market-listings`), and — when a
filled entry is corporation-sourced — that buying corporation's own
`credits`/`creditsLocked` debit (`corporation-credits`'s "Settlement
Converts a Locked Reservation Into a Real Transfer") **and** the physical
delivery of that portion's tonnage into the buying corporation's own
station-storage bucket (`trading-station`'s "A Fill Debits Both Stored and
Escrowed From the Seller's Bucket, Credits the Buyer's Stored") SHALL occur
in one transaction, all-or-nothing. Neither the buyer's debit nor its
delivery is a step invoked separately from, or after, this transaction —
`market-settlement`'s handler seam is consulted from **within** this same
transaction, not as a logically distinct later effect. The fleet's held
tonnage of the sold kind, the corporation's balance, and every filled
entry's remaining quantity SHALL each be re-read inside that same
transaction and the sale's preconditions re-evaluated against those
transactional reads — a precondition satisfied by a pre-transaction read
SHALL never be sufficient to commit. A sale whose transactional re-read no
longer satisfies a precondition SHALL be rejected in full and retried or
failed; it SHALL NEVER be reduced, clamped, or partially settled for this
reason. This single transaction SHALL be opened exactly once by the sale
service itself, composed of narrow, transaction-scoped primitives the
owning domains (`corporations`, `fleet`, the station store, and — for a
filled player listing — `market-listings`) implement and the sale service
declares — never one sequential service call per domain each opening its
own transaction, and never a direct reach into another domain's DAO (see
design.md Decision 16).

#### Scenario: A settled sale lands all its effects together
- **WHEN** a sale settles
- **THEN** the fleet's cargo is debited, the corporation's balance is
  credited, a ledger entry is appended for each filled entry, and every
  filled entry's remaining quantity is decremented — all from the same
  transaction

#### Scenario: A sale filling a player's open buy listing lands the buyer's debit and delivery in the same transaction as the seller's credit
- **WHEN** a sale's tonnage fills, in whole or in part, against a
  corporation-sourced open buy listing
- **THEN** the buying corporation's `credits` and `creditsLocked` are
  debited, and the filled tonnage is delivered into the buyer's own
  storage bucket at that venue, both from the same transaction that credits
  the seller and appends both sides' ledger entries — a test that only
  checks "the seller was paid" without also checking "the buyer's storage
  bucket gained the tonnage" does not confirm this requirement

#### Scenario: Concurrent sales against one hold never oversell it
- **WHEN** two sales with distinct operation keys concurrently target one
  fleet's hold for combined tons exceeding what it carries
- **THEN** exactly one settles for its full requested tonnage and the other
  is rejected in full with a distinguishable reason — neither is reduced
- **AND** the fleet's cargo for that kind is never negative
- **AND** the total credits appended to the ledger across both attempts
  never exceed the value of the tonnage the fleet actually held before the
  attempts

#### Scenario: A stale pre-transaction read cannot commit a sale
- **WHEN** a sale's held-tonnage precondition passes on a pre-transaction
  read but the transactional re-read shows insufficient tonnage
- **THEN** the transaction aborts, no cargo, balance, ledger, or entry state
  changes, and the response carries a distinguishable reason

#### Scenario: A settlement failure after any partial cross-domain write leaves no effect visible
- **WHEN** a sale's settlement fails or the process crashes after mutating
  any one of {fleet cargo, corporation balance/ledger, a filled demand
  entry's remaining quantity, a buyer's balance or storage bucket} but
  before every effect commits
- **THEN** none of those effects is visible to any subsequent read — a
  retry with the same operation key starts from a clean, entirely-unsettled
  state, never a partially-settled one (e.g. never "the seller was paid but
  the buyer's goods never arrived")

#### Scenario: A sale that fills across more than one resting entry lands every fill's decrement together
- **WHEN** a sale's tonnage fills across more than one resting entry (for
  example, a player buy listing and the floor)
- **THEN** every filled entry's remaining-quantity decrement, and any
  buyer-side debit/delivery any corporation-sourced entry among them
  requires, lands in the same transaction as the hold debit, balance
  credit, and ledger entries

### Requirement: Settlement Folds Tonnage Across a Venue's Ordered Demand Entries
A sale's proceeds SHALL be computed by folding the sold tonnage across the
named venue's demand entries for the sold kind, ordered price-descending,
filling each entry to its remaining quantity before moving to the next,
until the sold tonnage is exhausted — one rule, with no NPC-specific
branch. A **venue** is an opaque scope key (in this version, always a
station's id; neither this fold nor the price-board read interprets that
key as a station id in any other way). A **demand entry** is `{unitPrice,
remainingQuantity, source}`; the station's configured floor price for the
kind SHALL be represented as one entry of last resort — unlimited
remaining quantity, lowest price priority — never as a fallback branch. A
demand entry's `source` MAY be NPC (the floor entry, or an open
premium-request entry) or a corporation (an open player-posted buy listing
at that venue for the kind, posted via `market-listings`), participating in
the same fold at its own price and remaining quantity with no distinct code
path; a selling corporation's own open buy listing at the venue SHALL be
excluded from its own sale's fold, per `market-settlement`'s "Self-Match Is
Rejected." The response SHALL report each filled entry's portion (tons and
unit price) and the total proceeds.

#### Scenario: A sale fully covered by the highest-priority open entry reports that entry's price
- **WHEN** a sale's tonnage is at or below the venue's highest-priced open
  demand entry's remaining quantity for the sold kind
- **THEN** the response reports that entry's unit price for all tons sold

#### Scenario: A sale exceeding the highest-priority entry's remaining quantity reports a split across entries
- **WHEN** a sale's tonnage exceeds the venue's highest-priced open demand
  entry's remaining quantity for the sold kind
- **THEN** the response reports each filled entry's portion (tons and unit
  price) separately, in the price-descending order the fold applied them,
  and their combined proceeds equal the reported total

#### Scenario: A sale against a venue with no open premium request and no open player buy listing reports the floor entry's price
- **WHEN** a sale settles at a venue/kind with no open premium-request
  entry and no open player-posted buy listing
- **THEN** the response reports the floor entry's (last-resort) price for
  all tons sold, since it is the only entry available to fold against

#### Scenario: A player's open buy listing priced above every NPC entry fills before them
- **WHEN** a player holds an open buy listing at a venue priced above every
  open NPC-sourced entry (the floor and any open request) for the same
  kind
- **THEN** a sale there fills against the player's listing before any
  NPC-sourced entry, per the fold's price-descending order

#### Scenario: A selling corporation's own open buy listing is excluded from its own sale's fold
- **WHEN** a corporation sells at a venue where it also holds its own open
  buy listing, priced above every other open entry there
- **THEN** its own listing is skipped by the fold and the sale fills
  against the next-best entry from another source instead

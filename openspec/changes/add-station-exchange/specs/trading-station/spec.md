## ADDED Requirements

### Requirement: Per-Corporation Storage Bucket Carries Stored and Escrowed Components, Derived Free
The system SHALL maintain, for each (station, corporation) pair, a storage
bucket of held tonnage by kind, created on first use (a deposit, a
settlement delivery, or a sell-listing reservation — see "Sell-Listing
Reservation Increases Both Stored and Escrowed Together") rather than at
station provisioning — a corporation with no storage activity at a station
has no bucket and reads as holding nothing. Each bucket entry (per kind)
SHALL carry a `stored` component (all tonnage physically present, whether
free or reserved) and an `escrowed` component (the portion currently locked
by an open sell listing's reservation), with `free` derived at read time as
`stored − escrowed` — never persisted as a separately stored field,
mirroring `corporation-credits`'s `available`-derived-from-`credits`-minus-
`creditsLocked` split. `escrowed` SHALL never exceed `stored`, and SHALL
never read negative.

#### Scenario: A corporation with no prior storage activity at a station reads zero tonnage
- **WHEN** a corporation's storage is read at a station it has never
  deposited to, received goods at, or reserved a sell listing from
- **THEN** it reads zero `stored`, zero `escrowed`, and zero `free` tonnage
  of every kind there

#### Scenario: A first deposit, delivery, or reservation creates the bucket implicitly
- **WHEN** a corporation's first deposit, delivered fill, or sell-listing
  reservation lands at a station
- **THEN** its storage bucket for that station exists afterward, holding
  the correct `stored` and `escrowed` figures for that event

#### Scenario: Escrowed tonnage never exceeds stored tonnage
- **WHEN** a bucket entry is read at any point after any number of
  deposits, reservations, releases, and fills
- **THEN** its `escrowed` value is zero or positive and never exceeds its
  `stored` value

### Requirement: Storage Capacity Binds Total Stored Tonnage
Each (station, corporation) storage bucket SHALL be bounded by a configured
capacity (`market.Params.StorageCapacityTons`, summed across all kinds,
mirroring a fleet's shared-hold capacity model) shipped effectively
unlimited in this version. Every path that increases a bucket's `stored`
tonnage — a deposit, a settlement delivery, **and a sell-listing's
post-time reservation** (which moves tonnage out of a fleet's hold into
`stored`, see "Sell-Listing Reservation Increases Both Stored and Escrowed
Together") — SHALL be checked against this capacity and rejected in full,
never partially applied or clamped, when it would exceed it. A reservation
release (cancel/expiry) and a fill's seller-side debit never increase
`stored`, so neither is checked against capacity.

#### Scenario: A deposit, delivery, or reservation within a configured (finite, fixtured) capacity succeeds
- **WHEN** a deposit, a settlement delivery, or a sell-listing reservation
  would leave a bucket's total `stored` tonnage at or below a configured
  (finite, fixtured) capacity
- **THEN** it succeeds normally

#### Scenario: A deposit, delivery, or reservation exceeding a configured (finite, fixtured) capacity is rejected in full
- **WHEN** a deposit, a settlement delivery, or a sell-listing reservation
  would exceed a configured (finite, fixtured) capacity
- **THEN** it is rejected in full — no partial tonnage is deposited,
  delivered, or reserved, and (for a reservation) no listing is created

#### Scenario: This version's shipped (effectively unlimited) capacity never rejects for this reason in ordinary play
- **WHEN** any deposit, delivery, or reservation is attempted against this
  version's shipped (effectively unlimited) capacity configuration
- **THEN** it is never rejected for exceeding storage capacity

### Requirement: Deposit From Hold Into Storage While Docked
The system SHALL accept a deposit of a positive, finite tonnage of one kind,
not exceeding the fleet's currently held tonnage of that kind, from a fleet
whose effective state is `docked` to the named station and whose owning
corporation is the requester's own — crediting that (station, corporation,
kind) storage bucket's `stored` component (never `escrowed`, so `free`
increases by exactly the deposited amount) and debiting the fleet's cargo
pool, in one transaction. A fleet not docked to the named station, or a
foreign fleet, SHALL be rejected.

#### Scenario: A docked fleet deposits held tonnage into its own corporation's storage bucket
- **WHEN** a fleet docked to a station deposits a positive tonnage it
  currently holds
- **THEN** its cargo pool decreases by that tonnage, the bucket's `stored`
  increases by the same amount, and its `free` increases by the same
  amount

#### Scenario: A non-docked fleet's deposit is rejected
- **WHEN** a fleet whose effective state is not `docked` to the named
  station attempts a deposit
- **THEN** the deposit is rejected

#### Scenario: A deposit exceeding held tonnage is rejected, not clamped
- **WHEN** a deposit names more tons of a kind than the fleet currently holds
- **THEN** the deposit is rejected outright, never clamped to the held
  amount

#### Scenario: A foreign corporation cannot deposit through another corporation's fleet
- **WHEN** an authenticated account whose corporation does not own the named
  fleet attempts a deposit through it
- **THEN** the request is rejected

### Requirement: Withdrawal Is Bounded By Free Storage, Never Total Stored
The system SHALL accept a withdrawal of a positive, finite tonnage of one
kind, not exceeding the requester's own corporation's currently **free**
(`stored − escrowed`) tonnage of that kind at the named station — never
bounded by `stored` alone — into a fleet whose effective state is `docked`
to that station and whose owning corporation is the requester's own,
crediting the fleet's cargo pool and debiting the storage bucket's `stored`
component (leaving `escrowed` unchanged) in one transaction, rejected in
full (never clamped) if it would exceed the free tonnage or the fleet's
free hold. Tonnage currently `escrowed` by an open sell listing SHALL NOT
be withdrawable while that listing remains open — a seller who wants it
back must cancel the listing first (releasing the escrow), never withdraw
around it.

#### Scenario: A docked fleet withdraws free stored tonnage into its own hold
- **WHEN** a fleet docked to a station withdraws a positive tonnage at or
  below its corporation's currently free (unescrowed) tonnage there, within
  the fleet's free hold
- **THEN** the bucket's `stored` decreases by that tonnage, `escrowed` is
  unchanged, and the fleet's cargo pool increases by the same amount

#### Scenario: A withdrawal exceeding free tonnage is rejected, not clamped, even when stored tonnage would cover it
- **WHEN** a withdrawal names more tons of a kind than the corporation
  currently has **free** at that station — even if `stored` tonnage alone
  would be sufficient, because some of it is `escrowed` by an open sell
  listing
- **THEN** the withdrawal is rejected outright, never clamped to `free`,
  and never permitted to draw on the escrowed portion

#### Scenario: Escrowing 100% of a bucket via a sell listing leaves nothing withdrawable until the listing is cancelled
- **WHEN** a corporation posts a sell listing that reserves its entire
  stored tonnage of a kind at a station, then attempts to withdraw any of
  that tonnage while the listing remains open
- **THEN** the withdrawal is rejected in full — `free` is zero — and the
  tonnage becomes withdrawable again only after the listing is cancelled,
  expires, or is consumed by a fill (never both withdrawn AND still backing
  the open listing)

#### Scenario: A withdrawal exceeding the fleet's free hold is rejected, not clamped
- **WHEN** a withdrawal's tonnage exceeds the docked fleet's currently free
  hold
- **THEN** the withdrawal is rejected outright, never clamped to the
  available free hold

#### Scenario: A foreign corporation cannot withdraw through another corporation's fleet
- **WHEN** an authenticated account whose corporation does not own the named
  fleet attempts a withdrawal through it
- **THEN** the request is rejected

### Requirement: Sell-Listing Reservation Increases Both Stored and Escrowed Together
This is the goods item-type handler's `Reserve` answer for a sell listing
(invoked by `market-listings` at post time — see its "Post Reserves the
Posting Side's Resource Before the Listing Exists"). Posting a sell listing
SHALL, in the same transaction as the listing's creation, debit the posting
fleet's cargo pool by the listed tonnage and increase the posting
corporation's (station, kind) storage bucket's `stored` **and** `escrowed`
components by the same tonnage together — so the newly reserved tonnage is
`stored` (physically present, backing the listing) but contributes zero to
`free` from the instant it is reserved. A fleet not docked to the venue's
station, or lacking the named tonnage, SHALL cause the reservation (and
therefore the post) to fail.

#### Scenario: Posting a sell listing moves tonnage from the fleet's hold directly into escrowed storage
- **WHEN** a docked fleet posts a sell listing for a tonnage it holds
- **THEN** the fleet's cargo pool decreases by that tonnage, and the
  corporation's storage bucket at that station gains the same tonnage in
  both `stored` and `escrowed` — `free` is unchanged by the reservation

#### Scenario: Reserved tonnage is immediately unavailable as free storage
- **WHEN** a sell listing's reservation lands
- **THEN** the reserved tonnage cannot be withdrawn (see "Withdrawal Is
  Bounded By Free Storage") until the listing is cancelled, expires, or
  fills

### Requirement: A Fill Debits Both Stored and Escrowed From the Seller's Bucket, Credits the Buyer's Stored
This is the goods item-type handler's `Consume` (seller side) and `Deliver`
(buyer side) answers (invoked by `market-settlement` at match time — see
its "A Fill Consumes the Resting Sell Listing's Escrowed Reservation"). A
fill against an open sell listing SHALL, in the same settlement
transaction as every other effect of that fill, decrease the selling
corporation's (station, kind) storage bucket's `stored` **and** `escrowed`
by the filled tonnage together (the matter leaves the seller's bucket
entirely — never left behind as stranded escrow, and never merely
decrementing the listing's `remainingQuantity` field while the physical
bucket is untouched) and increase the buying corporation's (station, kind)
storage bucket's `stored` by the same tonnage, as ordinary (non-escrowed)
holdings — the buyer need not be present.

#### Scenario: A fill removes the filled tonnage from the seller's bucket entirely
- **WHEN** a fill settles against an open sell listing for a given tonnage
- **THEN** the seller's storage bucket's `stored` and `escrowed` both
  decrease by that tonnage — the matter is gone from the seller's bucket,
  not merely un-escrowed

#### Scenario: A fill delivers ordinary, unescrowed storage to the buyer
- **WHEN** a fill settles
- **THEN** the buyer's storage bucket's `stored` increases by the filled
  tonnage, immediately withdrawable (not escrowed on the buyer's side —
  the buyer holds no listing against it)

#### Scenario: A partial fill leaves the seller's remaining reservation intact
- **WHEN** a fill only partially consumes an open sell listing's reserved
  tonnage
- **THEN** the seller's bucket's `stored` and `escrowed` both decrease by
  only the filled portion, leaving the listing's remaining reservation
  exactly as `escrowed` as it was before, backing the listing's now-reduced
  remaining quantity

### Requirement: Escrow Release Restores Free Storage Without Changing Stored
When a sell listing's reservation is released (cancelled or expired — see
`market-listings`'s "Cancel Releases the Reservation" and "Auto-Expiry",
which invoke the goods handler's `Release` answer), the goods handler SHALL
decrease the released tonnage's `escrowed` component only, in the same
(station, corporation, kind) storage bucket it was already reserved in —
`stored` SHALL be unchanged, so the released tonnage becomes ordinary,
withdrawable `free` storage in place. SHALL NOT move it into any fleet's
hold, since the fleet that posted the listing may no longer be present at
the station.

#### Scenario: Cancelling a sell listing restores its tonnage to free storage at the same station
- **WHEN** an open sell listing is cancelled
- **THEN** its bucket's `escrowed` decreases by the released tonnage,
  `stored` is unchanged, and the tonnage becomes withdrawable `free`
  storage at the same station and corporation — not returned to any fleet

#### Scenario: An expired sell listing's tonnage likewise becomes free storage at the same station
- **WHEN** an open sell listing expires unfilled
- **THEN** its bucket's `escrowed` decreases by the released (remaining,
  unfilled) tonnage, `stored` is unchanged, and it becomes withdrawable
  `free` storage at the same station and corporation

### Requirement: Storage Deposit and Withdrawal Are Idempotent By a Corporation-Scoped, Format-Constrained Operation Key
A deposit or withdrawal SHALL accept a caller-supplied operation key,
scoped to the mutating corporation as the dedup anchor's own namespace
(e.g. `stations/{stationId}/storageOps/{corpId}/{operationKey}`, never a
galaxy-global keyspace) — so an operation key used by one corporation has
no effect of any kind on any other corporation's deposit or withdrawal
carrying the same literal key — and constrained to the same key format
`corporation-credits`'s "Operation Key Format Is Constrained and Its
Namespace Reserved" establishes (16–64 characters, `[A-Za-z0-9_-]` only,
reserved prefixes rejected). A retried call carrying an already-settled
operation key **for the same corporation** SHALL be a no-op returning that
corporation's own original recorded result, applying no second transfer. A
reused key naming a different kind, tonnage, station, or fleet than the
recorded call SHALL be rejected as a conflict, not answered as a replay.

#### Scenario: A retried deposit after a lost response does not double-transfer
- **WHEN** a client's deposit succeeds server-side but its response is lost,
  and the client retries the identical request (same operation key)
- **THEN** the retry returns the original result, with no second transfer

#### Scenario: A retried withdrawal after a lost response does not double-transfer
- **WHEN** a client's withdrawal succeeds server-side but its response is
  lost, and the client retries the identical request (same operation key)
- **THEN** the retry returns the original result, with no second transfer

#### Scenario: The same operation key used by two corporations applies twice, independently
- **WHEN** corporation A settles a deposit with operation key K, and
  corporation B later submits its own deposit or withdrawal with the same
  key K
- **THEN** B's operation applies in full under B's own storage bucket, and
  B's response discloses no detail of A's operation

#### Scenario: A reused key with different parameters is a conflict, not a replay
- **WHEN** a deposit or withdrawal reuses an operation key already recorded
  for the same corporation, but names a different kind, tonnage, station,
  or fleet than the recorded call
- **THEN** the response is a distinguishable conflict error, and no
  transfer is applied

#### Scenario: An empty or malformed operation key is rejected before any state is touched
- **WHEN** a deposit or withdrawal supplies an operation key that is empty,
  outside the 16–64 character range, or contains a character outside
  `[A-Za-z0-9_-]`
- **THEN** the response is `400 Bad Request`, and no document is read or
  written

### Requirement: Storage Disclosure Is Owner-Only, Existence Hidden
The system SHALL disclose a (station, corporation) storage bucket's
`stored`, `escrowed`, and derived `free` figures, by kind, only to a
requester whose own corporation is the one being read. A request for
another corporation's storage at any station SHALL be rejected, hiding
existence rather than disclosing an empty or real figure.

#### Scenario: An owner reads its own storage bucket's stored, escrowed, and free figures
- **WHEN** an authenticated corporation requests its own storage at a
  station
- **THEN** the response includes its real `stored`, `escrowed`, and derived
  `free` tonnage by kind

#### Scenario: A foreign corporation's storage bucket is not disclosed
- **WHEN** an authenticated corporation requests another corporation's
  storage at any station
- **THEN** the response discloses no figures — existence hidden

#### Scenario: An unauthenticated request is rejected
- **WHEN** a storage read carries no valid bearer token
- **THEN** the response is `401 Unauthorized` and discloses no figures

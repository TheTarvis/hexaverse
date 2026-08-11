## MODIFIED Requirements

### Requirement: Fleet Cargo Pool
The system SHALL represent each fleet's held resources as one fleet-level
cargo pool (`cargo: {kind: tons, ...}`), credited by a mining verb's resolve
step (see `mine-extraction`) and by a station-storage withdrawal while
docked (see `trading-station`'s "Withdraw From Storage Into Hold While
Docked"), and debited by an instant sale settlement (see `goods-sale`), by
posting a sell-side market listing's escrow reservation (see
`market-listings`'s "Post Reserves the Posting Side's Resource Before the
Listing Exists"), and by a station-storage deposit while docked (see
`trading-station`'s "Deposit From Hold Into Storage While Docked") — with
free hold at any moment equal to derived capacity minus the sum of tons
currently held across all kinds. There is no per-ship cargo allocation and no
corporation-level stockpile; cargo exists only on the fleet that holds it,
and every credit or debit to it SHALL occur only while that fleet is
physically at the location the operation names (mining its lode, or docked
at the station receiving or supplying the tonnage).

#### Scenario: A fresh fleet's cargo pool is empty
- **WHEN** a newly seeded fleet is read
- **THEN** its cargo pool is empty (zero tons of every kind)

#### Scenario: Free hold accounts for all kinds currently held
- **WHEN** a fleet's cargo pool holds tonnage across more than one kind
- **THEN** its free hold is its derived capacity minus the sum of all
  kinds' tonnage combined, not per-kind capacity

#### Scenario: A settled sale debits the sold kind from the cargo pool
- **WHEN** a sale settles for a given kind and tonnage
- **THEN** the fleet's cargo pool for that kind decreases by the sold
  tonnage, its free hold increases correspondingly, and every other kind's
  tonnage is unchanged

#### Scenario: Posting a sell listing debits the reserved tonnage from the cargo pool
- **WHEN** a fleet docked at a station posts a sell listing for a given kind
  and tonnage
- **THEN** the fleet's cargo pool for that kind decreases by the listed
  tonnage at the moment of posting, not at any later fill

#### Scenario: A storage deposit debits the deposited tonnage from the cargo pool
- **WHEN** a docked fleet deposits tonnage of a kind into station storage
- **THEN** the fleet's cargo pool for that kind decreases by the deposited
  tonnage

#### Scenario: A storage withdrawal credits the withdrawn tonnage into the cargo pool
- **WHEN** a docked fleet withdraws **free** (unescrowed) tonnage of a kind
  from station storage
- **THEN** the fleet's cargo pool for that kind increases by the withdrawn
  tonnage, bounded by its free hold — never by tonnage a station bucket
  still shows as `escrowed` behind an open sell listing (see
  `trading-station`'s "Withdrawal Is Bounded By Free Storage, Never Total
  Stored")

#### Scenario: A cancelled or expired sell listing does not credit the posting fleet's cargo pool
- **WHEN** a sell listing is cancelled or expires unfilled
- **THEN** the released tonnage becomes free (unescrowed) station storage
  (see `trading-station`'s "Escrow Release Restores Free Storage Without
  Changing Stored"), and the posting fleet's cargo pool is not credited —
  the fleet that posted the listing may no longer be present at the
  station
